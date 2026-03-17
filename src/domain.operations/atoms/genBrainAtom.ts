import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BadRequestError } from 'helpful-errors';
import {
  type AsBrainPromptFor,
  BrainAtom,
  type BrainEpisode,
  type BrainOutput,
  type BrainOutputMetrics,
  calcBrainOutputCost,
  castBriefsToPrompt,
  genBrainContinuables,
} from 'rhachet';
import type { BrainPlugs, BrainPlugToolExecution } from 'rhachet/brains';
import type { Artifact } from 'rhachet-artifact';
import type { GitFile } from 'rhachet-artifact-git';
import type { Empty } from 'type-fns';
import type { z } from 'zod';

import { castFromAnthropicToolUse } from '../../infra/cast/castFromAnthropicToolUse';
import { castIntoAnthropicToolDef } from '../../infra/cast/castIntoAnthropicToolDef';
import { castIntoAnthropicToolResult } from '../../infra/cast/castIntoAnthropicToolResult';
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
     * .what = stateless inference with optional tool use
     * .why = provides direct model access for inference and tool invocation
     */
    ask: async <TOutput, TPlugs extends BrainPlugs = BrainPlugs>(
      askInput: {
        on?: { episode: BrainEpisode };
        plugs?: TPlugs;
        role: { briefs?: Artifact<typeof GitFile>[] };
        prompt: AsBrainPromptFor<TPlugs>;
        schema: { output: z.Schema<TOutput> };
      },
      context?: Empty,
    ): Promise<BrainOutput<TOutput, 'atom', TPlugs>> => {
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

      // detect if prompt is tool results (continuation) vs string (initial/follow-up)
      const isToolResultContinuation = Array.isArray(askInput.prompt);

      // build current prompt content
      const currentPromptContent: Anthropic.MessageParam['content'] =
        isToolResultContinuation
          ? (askInput.prompt as BrainPlugToolExecution[]).map((exec) =>
              castIntoAnthropicToolResult({ execution: exec }),
            )
          : (askInput.prompt as string);

      // build messages array from prior episode exchanges + current prompt
      // note: exchange.input/output are always strings, but may be JSON-serialized content blocks
      const parseExchangeContent = (
        content: string,
      ): Anthropic.MessageParam['content'] => {
        // if starts with '[', it's likely a JSON array of content blocks (tool_use or tool_result)
        if (content.startsWith('[')) {
          try {
            return JSON.parse(content) as Anthropic.MessageParam['content'];
          } catch (error) {
            // allowlist SyntaxError: invalid JSON means it's plain text, not a content block array
            if (error instanceof SyntaxError) return content;
            throw error;
          }
        }
        return content;
      };
      const priorMessages: Anthropic.MessageParam[] =
        askInput.on?.episode?.exchanges.flatMap((exchange) => [
          {
            role: 'user' as const,
            content: parseExchangeContent(exchange.input),
          },
          {
            role: 'assistant' as const,
            content: parseExchangeContent(exchange.output),
          },
        ]) ?? [];
      const messages: Anthropic.MessageParam[] = [
        ...priorMessages,
        { role: 'user', content: currentPromptContent },
      ];

      // translate tool definitions to anthropic format
      const tools: Anthropic.Messages.Tool[] | undefined =
        askInput.plugs?.tools?.map((tool) =>
          castIntoAnthropicToolDef({ definition: tool }),
        );

      // call anthropic api with native structured output (constrained decoding)
      const response = await anthropic.beta.messages.create({
        model: config.model,
        max_tokens: 16384,
        betas: ['structured-outputs-2025-11-13'],
        system: systemPrompt,
        messages,
        ...(tools && { tools }),
        output_format: betaZodOutputFormat(askInput.schema.output),
      });

      // extract output and calls independently (they are NOT mutually exclusive)
      // model may return both text output AND tool calls in the same response

      // extract text block for structured output
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      const output = textBlock
        ? askInput.schema.output.parse(JSON.parse(textBlock.text))
        : null;

      // extract tool_use blocks for tool calls
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === 'tool_use',
      );
      const calls =
        toolUseBlocks.length > 0
          ? {
              tools: toolUseBlocks.map((block) =>
                castFromAnthropicToolUse({ block }),
              ),
            }
          : null;

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

      // compute prompt char count (handle both string and array)
      const promptCharCount = isToolResultContinuation
        ? JSON.stringify(askInput.prompt).length
        : (askInput.prompt as string).length;

      // build size metrics
      const size: BrainOutputMetrics['size'] = {
        tokens: {
          input: inputTokens,
          output: outputTokens,
          cache: { get: cacheGetTokens, set: cacheSetTokens },
        },
        chars: {
          input: promptCharCount + (systemPrompt?.length ?? 0),
          output: calls
            ? JSON.stringify(response.content).length
            : (textBlock?.text?.length ?? 0),
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

      // serialize exchange content for episode (handle both string and content blocks)
      const exchangeInput = isToolResultContinuation
        ? JSON.stringify(currentPromptContent)
        : (askInput.prompt as string);
      const exchangeOutput = calls
        ? JSON.stringify(response.content)
        : (textBlock?.text ?? '{}');

      // generate continuables for episode
      const continuables = await genBrainContinuables({
        for: { grain: 'atom' },
        on: { episode: askInput.on?.episode ?? null },
        with: {
          exchange: {
            input: exchangeInput,
            output: exchangeOutput,
            exid: response.id,
          },
          episode: { exid: null },
        },
      });

      return {
        output,
        calls,
        metrics,
        ...continuables,
      } as BrainOutput<TOutput, 'atom', TPlugs>;
    },
  });
};
