import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BadRequestError } from 'helpful-errors';
import {
  BrainAtom,
  type BrainEpisode,
  type BrainOutput,
  type BrainOutputMetrics,
  calcBrainOutputCost,
  castBriefsToPrompt,
  genBrainContinuables,
} from 'rhachet';
import type { Artifact } from 'rhachet-artifact';
import type { GitFile } from 'rhachet-artifact-git';
import type { Empty } from 'type-fns';
import type { z } from 'zod';

import {
  type AnthropicBrainAtomModel,
  type AnthropicBrainAtomSlug,
  type BrainAtomConfig,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

// re-export types and config for consumers
export {
  CONFIG_BY_ATOM_SLUG,
  type AnthropicBrainAtomSlug,
  type AnthropicBrainAtomModel,
  type BrainAtomConfig,
};

/**
 * .what = factory to generate claude brain atom instances
 * .why = enables model variant selection via slug (e.g., haiku for speed, opus for quality)
 *
 * .example
 *   genBrainAtom({ slug: 'claude/haiku' }) // fast + cheap
 *   genBrainAtom({ slug: 'claude/sonnet' }) // balanced
 *   genBrainAtom({ slug: 'claude/opus/v4.5' }) // highest quality
 */
export const genBrainAtom = (input: {
  slug: AnthropicBrainAtomSlug;
}): BrainAtom => {
  const config = CONFIG_BY_ATOM_SLUG[input.slug];

  return new BrainAtom({
    repo: 'anthropic',
    slug: input.slug,
    description: config.description,
    spec: config.spec,

    /**
     * .what = stateless inference (no tool use)
     * .why = provides direct model access for reasoning tasks
     */
    ask: async <TOutput>(
      askInput: {
        on?: { episode: BrainEpisode };
        role: { briefs?: Artifact<typeof GitFile>[] };
        prompt: string;
        schema: { output: z.Schema<TOutput> };
      },
      context?: Empty,
    ): Promise<BrainOutput<TOutput, 'atom'>> => {
      // fail-fast: haiku doesn't support continuation with structured outputs
      if (askInput.on?.episode && config.model.includes('haiku')) {
        throw new BadRequestError(
          'episode continuation is not supported with haiku models when using structured outputs. use sonnet or opus instead.',
          { slug: input.slug, model: config.model },
        );
      }

      const startTime = Date.now();
      const systemPrompt = askInput.role.briefs
        ? await castBriefsToPrompt({ briefs: askInput.role.briefs })
        : undefined;

      // get anthropic client from context or create new one
      const anthropic =
        (context?.anthropic as Anthropic | undefined) ??
        new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // build messages array from prior episode exchanges + current prompt
      const priorMessages: Anthropic.MessageParam[] =
        askInput.on?.episode?.exchanges.flatMap((exchange) => [
          { role: 'user' as const, content: exchange.input },
          { role: 'assistant' as const, content: exchange.output },
        ]) ?? [];
      const messages: Anthropic.MessageParam[] = [
        ...priorMessages,
        { role: 'user', content: askInput.prompt },
      ];

      // call anthropic api with native structured output (constrained decoding)
      const response = await anthropic.beta.messages.create({
        model: config.model,
        max_tokens: 16384,
        betas: ['structured-outputs-2025-11-13'],
        system: systemPrompt,
        messages,
        output_format: betaZodOutputFormat(askInput.schema.output),
      });

      // extract structured output from response text
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      const outputText = textBlock?.text ?? '{}';
      const outputParsed = JSON.parse(outputText);

      // validate via schema
      const output = askInput.schema.output.parse(outputParsed);

      // compute metrics from response usage
      const elapsedMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage.input_tokens;
      const outputTokens = usage.output_tokens;
      const cacheGetTokens =
        'cache_read_input_tokens' in usage
          ? (usage.cache_read_input_tokens as number)
          : 0;
      const cacheSetTokens =
        'cache_creation_input_tokens' in usage
          ? (usage.cache_creation_input_tokens as number)
          : 0;

      // build size metrics
      const size: BrainOutputMetrics['size'] = {
        tokens: {
          input: inputTokens,
          output: outputTokens,
          cache: { get: cacheGetTokens, set: cacheSetTokens },
        },
        chars: {
          input: askInput.prompt.length + (systemPrompt?.length ?? 0),
          output: outputText.length,
          cache: { get: 0, set: 0 },
        },
      };

      // calculate cash cost using rhachet helper
      const { cash } = calcBrainOutputCost({
        for: { tokens: size.tokens },
        with: { cost: { cash: config.spec.cost.cash } },
      });

      const metrics: BrainOutputMetrics = {
        size,
        cost: {
          time: { milliseconds: elapsedMs },
          cash,
        },
      };

      // generate continuables for episode tracking
      const continuables = await genBrainContinuables({
        for: { grain: 'atom' },
        on: { episode: askInput.on?.episode ?? null },
        with: {
          exchange: {
            input: askInput.prompt,
            output: outputText,
            exid: response.id,
          },
          episode: { exid: null },
        },
      });

      return { output, metrics, ...continuables };
    },
  });
};
