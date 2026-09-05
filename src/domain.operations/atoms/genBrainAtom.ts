import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
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
import { asAtomSlugParts } from '../brains/asAtomSlugParts';
import { asBrainDescription } from '../brains/asBrainDescription';
import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  type AnthropicBrainAtomSlug,
  type AnthropicBrainModel,
  type BrainConfig,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';
import { HINT_CREDENTIAL_ABSENT } from '../brains/HINT_CREDENTIAL_ABSENT';
import { asMessagesFromEpisode } from './asMessagesFromEpisode';
import { asUnstreamedTimeoutMs } from './asUnstreamedTimeoutMs';

// re-export types and config for consumers
export {
  CONFIG_BY_ATOM_SLUG,
  type AnthropicBrainAtomSlug,
  type AnthropicBrainModel,
  type BrainConfig,
};

/**
 * .what = parses the model's text block into the caller's output shape
 * .why = a bare `JSON.parse` here throws a raw `SyntaxError: Unexpected token` that names
 *   no slug, no model, and no fix — the un-diagnosable shape `rule.require.failloud`
 *   grades as a defect.
 *
 * ⚠️ the `max_tokens` guard above does NOT cover this. that one catches a payload cut off
 *   mid-json, which is the TRUNCATED case. this catches a payload that was never json at
 *   all — the model answered in prose instead of through the output tool, and stopped
 *   normally, so `stop_reason` reads `end_turn` and the truncation guard never fires.
 *   two different causes, two different fixes, and only one of them was clamped.
 *
 * .note = this is the atom twin of the repl side's `asOutputFromResultText`. that one
 *   landed a round earlier; this one did not, so for one round the same defect was fixed
 *   on one ladder and left unrepaired on the other. a fix to one twin is a hypothesis
 *   about the other — the twins are repaired together now.
 */
const asOutputFromTextBlock = (input: {
  text: string;
  slug: AnthropicBrainAtomSlug;
  model: string;
}): unknown => {
  try {
    return JSON.parse(input.text);
  } catch (error) {
    // .why = the raw text is carried, truncated. the payload IS the evidence — without it
    //   a reader cannot tell prose-instead-of-tool from a schema mismatch, and those have
    //   different fixes. it is capped because a response can be long.
    throw new BadRequestError(
      'the model returned a text block that is not valid json',
      {
        slug: input.slug,
        model: input.model,
        parseError: error instanceof Error ? error.message : String(error),
        // .note = the HEAD is the evidence. a raw `textLength` sat beside it and
        //   was dropped — the same non-actionable character-count shape removed
        //   from the `fix:readme` error family.
        textHead: input.text.slice(0, 500),
        hint: 'the model answered in prose rather than through the structured output format — sharpen the prompt, or check that this rung honors `output_config.format`. note this is NOT the truncation case; a cut-off response fails the max_tokens guard instead.',
      },
    );
  }
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

  // fail-fast: a slug that names no registered rung
  //
  // .why = without this, an unregistered slug dies on the next line as
  //   `TypeError: Cannot read properties of undefined (reading 'description')` — no
  //   slug, no valid set, no hint. every OTHER blocked state in this file answers with
  //   a `BadRequestError` that names the fix, so this was the one caller mistake left
  //   to the runtime (`rule.require.errors-name-the-fix`).
  //
  // ⚠️ the type union does NOT make this unreachable. it guards a typescript caller,
  //   and the path that motivates the guard is a CLI string — `rhx review --brain
  //   anthropic/<slug>` hands over whatever was typed, with no compile step between.
  //
  // .note = the ragged ladder is exactly what makes this likely. someone who reads
  //   `claude/opus/v4.7` may reasonably try `claude/sonnet/v4.7`, which does not exist.
  //   so the hint lists the real set rather than merely name the miss — and it is
  //   DERIVED from the registry, so it cannot drift from what is actually registered.
  if (!config)
    throw new BadRequestError(
      `no anthropic brain atom is registered under the slug "${input.slug}"`,
      {
        slug: input.slug,
        hint: `the tier/rung ladder is RAGGED — a rung that exists for one tier may not exist for another, so do not infer a slug from a neighbor tier. registered: ${ANTHROPIC_BRAIN_ATOM_SLUGS.join(', ')}`,
      },
    );

  return new BrainAtom({
    repo: 'anthropic',
    slug: input.slug,
    // .note = composed, not read straight off the config, so the structured
    //   `deprecated` fact crosses to the object a consumer actually holds
    description: asBrainDescription({
      base: config.description,
      deprecated: config.deprecated ?? null,
    }),
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
      // fail-fast: haiku does not honor episode continuation
      //
      // .note = the ORIGINAL cause is gone, and the guard is still right. it was
      //   recorded as an api error from `betas: ['structured-outputs-2025-11-13']`
      //   plus a multi-turn history. structured outputs left beta and this call no
      //   longer sends that header, so that error no longer occurs.
      //
      // .note = verified 2026-08-31 with the guard disabled: the call now SUCCEEDS
      //   and haiku answers "I don't have the ability to retain information from
      //   previous conversations" — it does not use the prior turns. so the failure
      //   moved from loud to SILENT, which makes the guard more necessary, not less
      //   (rule.forbid.failhide). a caller would get a confident wrong answer.
      //
      // ⚠️ do NOT remove this guard on the grounds that the beta header is gone.
      //   that was checked; the guard survives it.
      // ⚠️ the tier comes from the SLUG, not from a sniff of the vendor's model id.
      //   the guard read `config.model.includes('haiku')`, which held only while the
      //   vendor kept the tier word inside every haiku id. a rename that dropped it
      //   would leave this line untouched and silently stop the match — and because
      //   haiku's own failure is silent, the guard would flip from a loud refusal to a
      //   confident wrong answer, with no visible change to this code
      //   (`rule.forbid.failhide`).
      //
      //   `asAtomSlugParts` derives the tier structurally, and the slug is OURS rather
      //   than the vendor's, so it cannot drift out from under this check.
      //   `BrainAtom.continuation.test.ts` [case2] sweeps the whole ladder to hold the
      //   two sets apart: every haiku rung refuses, and no other rung does.
      if (
        askInput.on?.episode &&
        asAtomSlugParts({ slug: input.slug }).tier === 'haiku'
      ) {
        // .note = the message names fable too. it is a first-class continuation tier,
        //   verified live, and it is the cheapest per-token of the three on input.
        // .note = the message no longer blames structured outputs. that WAS the cause
        //   under the old beta header; the cause now is that haiku does not honor the
        //   prior turns at all.
        throw new BadRequestError(
          'episode continuation is not supported with haiku models — haiku does not honor prior turns. use sonnet, opus, or fable instead.',
          { slug: input.slug, model: config.model },
        );
      }

      const startTime = Date.now();
      const systemPrompt = askInput.role.briefs
        ? await castBriefsToPrompt({ briefs: askInput.role.briefs })
        : undefined;

      // get anthropic client from context or create new one
      //
      // .note = the absent-key case is caught HERE rather than left to the sdk. an
      //   undefined apiKey reaches `new Anthropic({...})` fine and only fails later,
      //   deep in the request build, with a generic message that names
      //   "apiKey, authToken, credentials, config, or profile" — not one of which is
      //   the env var to set, and none of which mentions keyrack. so the caller was
      //   told what the sdk wanted, never what to do (`rule.require.errors-name-the-fix`).
      //
      // ⚠️ keyrack does NOT reach this line. `rhx keyrack unlock` puts the credential
      //   in a vault, and only a runner that injects it into the child env (e.g.
      //   `rhx git.repo.test`) bridges the two. a bare `rhx review --brain anthropic/...`
      //   does not, so it fails here even with a valid unlocked grant. see the yield.
      const apiKey = context?.anthropic ? null : process.env.ANTHROPIC_API_KEY;
      if (!context?.anthropic && !apiKey)
        throw new BadRequestError(
          'no anthropic credential found — set ANTHROPIC_API_KEY, or inject a client via context.anthropic',
          {
            slug: input.slug,
            hint: HINT_CREDENTIAL_ABSENT,
          },
        );

      const anthropic =
        (context?.anthropic as Anthropic | undefined) ??
        new Anthropic({ apiKey: apiKey ?? undefined });

      // detect if prompt is tool results (continuation) vs string (initial/follow-up)
      const isToolResultContinuation = Array.isArray(askInput.prompt);

      // build current prompt content
      const currentPromptContent: Anthropic.MessageParam['content'] =
        isToolResultContinuation
          ? (askInput.prompt as BrainPlugToolExecution[]).map((exec) =>
              castIntoAnthropicToolResult({ execution: exec }),
            )
          : (askInput.prompt as string);

      // prepend the prior conversation, then the current prompt
      const messages: Anthropic.MessageParam[] = [
        ...asMessagesFromEpisode({ episode: askInput.on?.episode }),
        { role: 'user', content: currentPromptContent },
      ];

      // translate tool definitions to anthropic format
      const tools: Anthropic.Messages.Tool[] | undefined =
        askInput.plugs?.tools?.map((tool) =>
          castIntoAnthropicToolDef({ definition: tool }),
        );

      // call anthropic api with native structured output (constrained decode)
      // .note = structured outputs left beta, so this uses the ga `messages` resource:
      //   `output_format` moved to `output_config.format` and the
      //   `structured-outputs-2025-11-13` beta header is no longer required
      const response = await anthropic.messages.create(
        {
          model: config.model,
          // .note = per-rung, NOT a shared global. the rung's own published limit is the
          //   only non-arbitrary value here, and a flat cap penalized exactly the rungs
          //   that need the most room — see `BrainConfig.maxOutput`.
          max_tokens: config.maxOutput.tokens,
          system: systemPrompt,
          messages,
          ...(tools && { tools }),
          output_config: { format: zodOutputFormat(askInput.schema.output) },
        },
        // ⚠️ REQUIRED, not a knob. the sdk derives its own timeout when this is absent
        //   and REFUSES any unstreamed call whose `max_tokens` implies more than ten
        //   minutes — which is ten of our thirteen rungs. see `asUnstreamedTimeoutMs`
        //   for the arithmetic, and for why the cap is not what should move.
        {
          timeout: asUnstreamedTimeoutMs({
            maxTokens: config.maxOutput.tokens,
          }),
        },
      );

      // fail-fast: a response cut off at max_tokens holds partial json
      //
      // .why = without this, the truncation surfaces as a bare
      //   `SyntaxError: Unterminated string in JSON at position 77908` from the
      //   parse below — no model, no slug, no hint at the cause. verified live
      //   2026-08-31 against haiku.
      //
      // .note = thought tokens draw from this same budget, and every rung from 4.6 up
      //   thinks by default at `effort: high` — so a rung that thinks needs more room
      //   for the same answer than one that does not. `config.maxOutput` now gives each
      //   rung its own published limit, so the frontier rungs are no longer squeezed
      //   under a cap set for the smallest one. this guard is what remains for a call
      //   that exhausts even that.
      if (response.stop_reason === 'max_tokens')
        throw new BadRequestError(
          'the response hit the max_tokens cap, so its output was cut off mid-json',
          {
            slug: input.slug,
            model: config.model,
            // .why = the cap READ FROM THE CONFIG the request used, never a second
            //   literal. a hardcoded figure here could state a cap the request never
            //   sent, which would send a caller to shorten a prompt against a number
            //   that was never the limit (`rule.forbid.failhide`).
            maxTokens: config.maxOutput.tokens,
            hint: 'ask for a shorter output, or split the ask into steps. note that on 4.6+ rungs the model thinks by default, and those tokens share this budget — so a rung that thinks reaches this cap sooner than one that does not.',
          },
        );

      // extract output and calls independently (they are NOT mutually exclusive)
      // model may return both text output AND tool calls in the same response

      // extract text block for structured output
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      const output = textBlock
        ? askInput.schema.output.parse(
            asOutputFromTextBlock({
              text: textBlock.text,
              slug: input.slug,
              model: config.model,
            }),
          )
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
