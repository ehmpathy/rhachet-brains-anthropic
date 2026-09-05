import { createHash } from 'crypto';
import { BadRequestError } from 'helpful-errors';
import { hostname } from 'os';
import {
  type AsBrainPromptFor,
  type BrainEpisode,
  type BrainOutput,
  type BrainOutputMetrics,
  BrainRepl,
  type BrainSeries,
  type BrainSpec,
  calcBrainOutputCost,
  castBriefsToPrompt,
  genBrainContinuables,
} from 'rhachet';
import type { BrainPlugs } from 'rhachet/brains';
import type { Artifact } from 'rhachet-artifact';
import type { GitFile } from 'rhachet-artifact-git';
import type { Empty, PickOne } from 'type-fns';
import type { z } from 'zod';

import { importEsmSafe } from '../../infra/esm/importEsmSafe';
import { asJsonSchema } from '../../infra/schema/asJsonSchema';
import { asBrainDescription } from '../brains/asBrainDescription';
import { asReplSlugFromAtomSlug } from '../brains/asReplSlugFromAtomSlug';
import {
  ANTHROPIC_BRAIN_REPL_SLUGS,
  type AnthropicBrainReplSlug,
  CONFIG_BY_REPL_SLUG,
} from '../brains/BrainRepl.config';
import { HINT_CREDENTIAL_ABSENT } from '../brains/HINT_CREDENTIAL_ABSENT';
import { asQueryOptions } from './asQueryOptions';
import { extractResultFromQuery } from './extractResultFromQuery';

type ClaudeAgentSdk = typeof import('@anthropic-ai/claude-agent-sdk');

/**
 * .what = the esm-only sdk package specifier for the native import path
 * .why = importEsmSafe locates the package by this specifier (via require.resolve)
 *        on the native branch
 */
const SDK_SPECIFIER = '@anthropic-ai/claude-agent-sdk';

/**
 * .what = lazily loads the claude-agent-sdk at point of use
 * .why = an eager top-level import of the esm-only sdk throws when this commonjs
 *        package is require()d, which drops the brain from the registry. the
 *        generic importEsmSafe communicator (infra/esm) keeps the package
 *        commonjs-loadable and defers the esm evaluation to the first ask/act.
 *        importEsmSafe owns the jest-vs-native branch internally, so the caller
 *        just names the specifier.
 */
const getOneClaudeAgentSdk = (): Promise<ClaudeAgentSdk> =>
  importEsmSafe<ClaudeAgentSdk>({ specifier: SDK_SPECIFIER });

/**
 * .what = prefix for episode exids from this repo
 * .why = identifies episodes created by anthropic claude-agent-sdk for tracking
 */
const EXID_PREFIX = 'anthropic/claude-agent-sdk';

/**
 * .what = generates a stable hash for the current machine
 * .why = records which machine the session was created on for debugging
 */
const getMachineHash = (): string => {
  const machineId = [hostname(), process.env.USER ?? 'unknown'].join(':');
  return createHash('sha256').update(machineId).digest('hex').slice(0, 12);
};

/**
 * .what = builds an exid that encodes session info
 * .why = enables tracking of session origin for debugging and future potential continuation
 *
 * .note = continuation is NOT currently supported due to SDK limitations with structured outputs.
 *         the exid is still recorded for tracking, audit, and potential future support.
 */
const buildSessionExid = (input: { sessionId: string }): string =>
  `${EXID_PREFIX}/${getMachineHash()}/${input.sessionId}`;

// re-export for consumers
export { CONFIG_BY_REPL_SLUG, type AnthropicBrainReplSlug };

/**
 * .what = invokes claude-agent-sdk query with specified mode
 * .why = dedupes shared logic between ask (readonly) and act (read+write)
 *
 * .note = episode/series continuation is NOT supported for repls because:
 *         1. claude-agent-sdk session resumption doesn't work with structured outputs
 *            (resumed sessions return plain text instead of respect for outputFormat)
 *         2. cross-supplier continuation requires message injection which the SDK doesn't support
 *         for continuation workflows, use BrainAtom instead.
 *
 * .note = plugs.tools is accepted for interface compatibility but NOT supported.
 *         repls handle tool use internally via the SDK. if plugs.tools is provided,
 *         a BadRequestError is thrown.
 */
const invokeQuery = async <
  TOutput,
  TPlugs extends BrainPlugs = BrainPlugs,
>(input: {
  mode: 'ask' | 'act';
  model: string;
  spec: BrainSpec;
  on?: { episode?: BrainEpisode; series?: BrainSeries };
  plugs?: TPlugs;
  role: { briefs?: Artifact<typeof GitFile>[] };
  prompt: AsBrainPromptFor<TPlugs>;
  schema: { output: z.Schema<TOutput> };
}): Promise<BrainOutput<TOutput, 'repl', TPlugs>> => {
  // fail-fast: continuation is not supported for repls
  // claude-agent-sdk session resumption doesn't work with structured outputs
  if (input.on?.episode || input.on?.series) {
    throw new BadRequestError(
      'episode/series continuation is not supported with claude-agent-sdk repls. session resumption does not work with structured outputs. use BrainAtom for continuation workflows.',
      { mode: input.mode, model: input.model },
    );
  }

  // fail-fast: plugs.tools is not supported for repls
  // repls handle tool use internally via the SDK; external tool plugs are not supported
  if (input.plugs?.tools && input.plugs.tools.length > 0) {
    throw new BadRequestError(
      'plugs.tools is not supported with claude-agent-sdk repls. repls handle tool use internally via the SDK. use BrainAtom for external tool integration.',
      { mode: input.mode, model: input.model },
    );
  }

  // fail-fast: tool result continuation is not supported
  // repls only accept string prompts, not BrainPlugToolExecution arrays
  if (Array.isArray(input.prompt)) {
    throw new BadRequestError(
      'tool result continuation is not supported with claude-agent-sdk repls. repls only accept string prompts. use BrainAtom for tool result continuation.',
      { mode: input.mode, model: input.model },
    );
  }

  // fail-fast: no credential means the sdk decides what to do, and it may not fail
  //
  // .why = the atom path guards this, and the repl path did not — so the readme's
  //   credential promise held for half the package. and the two halves fail
  //   DIFFERENTLY: an atom raises an sdk error, while the repl HANGS.
  //
  // ⚠️ the hang is measured, not feared. with this guard disabled the clamp in
  //   `BrainRepl.credential.test.ts` does not fail on a bad message — it dies on
  //   `Exceeded timeout of 5000 ms`, and the file takes 21s rather than 2s. so with
  //   no credential the agent-sdk neither returns nor throws; it stalls, most likely
  //   at an interactive auth prompt that no gate is there to answer.
  //
  //   a hang is the one failure a gate cannot survive: it neither passes nor fails,
  //   it just stops — the wish's `.why` is a pre-commit gate whose miss is permanent
  //   (`rule.forbid.failhide`).
  //
  // ⚠️ a repl takes no `context.anthropic`. the sdk owns its own client, so there is
  //   no injection point to fall back on — the env var is the only route, which is
  //   exactly why its absence must be caught here rather than deferred to the sdk.
  if (!process.env.ANTHROPIC_API_KEY)
    throw new BadRequestError(
      'no anthropic credential found — set ANTHROPIC_API_KEY before a repl call',
      {
        mode: input.mode,
        model: input.model,
        hint: HINT_CREDENTIAL_ABSENT,
      },
    );

  // extract prompt as string (guaranteed by above check)
  const promptText = input.prompt as string;

  const startTime = Date.now();

  // compose system prompt from briefs
  const systemPrompt = input.role.briefs
    ? await castBriefsToPrompt({ briefs: input.role.briefs })
    : undefined;

  // convert zod schema to json schema for native structured output
  const jsonSchema = asJsonSchema({ schema: input.schema.output });

  // lazily load the esm-only sdk at point of use, then invoke its query
  const { query } = await getOneClaudeAgentSdk();
  const queryIterator = query({
    prompt: promptText,
    options: asQueryOptions({
      systemPrompt,
      model: input.model,
      mode: input.mode,
      jsonSchema: jsonSchema as Record<string, unknown>,
    }),
  });

  // extract final result from async iterator
  const queryResult = await extractResultFromQuery({
    queryIterator,
    model: input.model,
    mode: input.mode,
  });

  // parse output via schema for runtime validation
  const output = input.schema.output.parse(queryResult.output);

  // compute metrics
  const elapsedMs = Date.now() - startTime;
  const { inputTokens, outputTokens, cacheGetTokens, cacheSetTokens } =
    queryResult.usage;

  const outputText = JSON.stringify(queryResult.output);

  // build size metrics
  const size: BrainOutputMetrics['size'] = {
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cache: { get: cacheGetTokens, set: cacheSetTokens },
    },
    chars: {
      input: promptText.length + (systemPrompt?.length ?? 0),
      output: outputText.length,
      cache: { get: 0, set: 0 },
    },
  };

  // calculate cash cost using rhachet helper
  const { cash } = calcBrainOutputCost({
    for: { tokens: size.tokens },
    with: { cost: { cash: input.spec.cost.cash } },
  });

  const metrics: BrainOutputMetrics = {
    size,
    cost: {
      time: { milliseconds: elapsedMs },
      cash,
    },
  };

  // build session exid for continuation tracking
  const sessionExid = queryResult.sessionId
    ? buildSessionExid({ sessionId: queryResult.sessionId })
    : null;

  // generate continuables for episode/series tracking
  const continuables = await genBrainContinuables({
    for: { grain: 'repl' },
    on: {
      episode: input.on?.episode ?? null,
      series: input.on?.series ?? null,
    },
    with: {
      exchange: {
        input: promptText,
        output: outputText,
        exid: sessionExid,
      },
      episode: { exid: sessionExid },
      series: { exid: sessionExid },
    },
  });

  return { output, calls: null, metrics, ...continuables };
};

/**
 * .what = factory to generate claude code brain repl instances
 * .why = enables model variant selection via slug (e.g., haiku for speed, opus for quality)
 *
 * .example
 *   genBrainRepl({ slug: 'claude/code' }) // default model
 *   genBrainRepl({ slug: 'claude/code/haiku' }) // fast + cheap
 *   genBrainRepl({ slug: 'claude/code/opus/v4.5' }) // highest quality
 */
export const genBrainRepl = (input: {
  slug: AnthropicBrainReplSlug;
}): BrainRepl => {
  const config = CONFIG_BY_REPL_SLUG[input.slug];

  // fail-fast: a slug that names no registered rung
  //
  // ⚠️ the TWIN of the atom guard, and it is here for the reason that guard's own
  //   history teaches: a defect class repaired on only one of two twin objects is that
  //   defect class still shipped. the atom and repl factories have the same shape, so
  //   they have the same defect — an unregistered slug dies on the next line as a bare
  //   `TypeError: Cannot read properties of undefined`.
  //
  // .note = the repl ladder mirrors the atom ladder rung for rung, so its gaps are the
  //   same gaps, and the bare `claude/code` adds one more shape to mistype. the hint is
  //   derived from the repl registry, so it names repl slugs — a repl caller cannot
  //   pass an atom slug, and a list of the wrong namespace would be worse than none.
  if (!config)
    throw new BadRequestError(
      `no anthropic brain repl is registered under the slug "${input.slug}"`,
      {
        slug: input.slug,
        hint: `the tier/rung ladder is RAGGED — a rung that exists for one tier may not exist for another, so do not infer a slug from a neighbor tier. registered: ${ANTHROPIC_BRAIN_REPL_SLUGS.join(', ')}`,
      },
    );

  return new BrainRepl({
    repo: 'anthropic',
    slug: input.slug,
    // .note = the repl carried NO deprecation signal at all, since it builds its own
    //   description rather than reuse the atom's. the pointer is remapped into the
    //   repl namespace, because a repl caller cannot pass an atom slug.
    // ⚠️ the base names the MODEL, not the slug. it read
    //   `claude code (${slug}) - …`, which echoed back the map key a caller already
    //   holds and stated no other fact — so all 18 repl rows read identically, and the
    //   one field rhachet documents as "helps developers understand what this atom is
    //   best suited for" carried no sense at all. found by a read of the
    //   `getBrainReplsByAnthropic()` snapshot, which is why that snapshot now exists.
    //   the atom twin never echoed its slug, so this also makes the two symmetric.
    // ⚠️ it matters MOST here: the repl ladder spans a 10x rate spread
    //   (haiku 4.5 at $1/$5 against fable 5 at $10/$50), and the slug alone does not
    //   say which model a rung reaches — `claude/code` runs sonnet, not opus.
    // .note = "code assistant", not the prior gerund form, per `rule.forbid.gerunds`;
    //   fixed forward on contact since this line was already under edit.
    description: asBrainDescription({
      base: `claude code on ${config.model} - agentic code assistant with tool use`,
      deprecated: config.deprecated
        ? {
            ...config.deprecated,
            replacedBy: asReplSlugFromAtomSlug({
              slug: config.deprecated.replacedBy,
            }),
          }
        : null,
    }),
    spec: config.spec,

    /**
     * .what = readonly analysis (research, queries, code review)
     * .why = provides safe, non-mutate agent interactions
     *
     * .note = plugs.tools is accepted for interface compatibility but NOT supported.
     *         repls handle tool use internally via the SDK.
     */
    ask: async <TOutput, TPlugs extends BrainPlugs = BrainPlugs>(
      askInput: {
        on?: PickOne<{ episode: BrainEpisode; series: BrainSeries }>;
        plugs?: TPlugs;
        role: { briefs?: Artifact<typeof GitFile>[] };
        prompt: AsBrainPromptFor<TPlugs>;
        schema: { output: z.Schema<TOutput> };
      },
      _context?: Empty,
    ): Promise<BrainOutput<TOutput, 'repl', TPlugs>> =>
      invokeQuery({
        mode: 'ask',
        model: config.model,
        spec: config.spec,
        on: {
          episode: askInput.on?.episode,
          series: askInput.on?.series,
        },
        ...askInput,
      }),

    /**
     * .what = read+write actions (code changes, file edits)
     * .why = provides full agentic capabilities with write access
     *
     * .note = plugs.tools is accepted for interface compatibility but NOT supported.
     *         repls handle tool use internally via the SDK.
     */
    act: async <TOutput, TPlugs extends BrainPlugs = BrainPlugs>(
      actInput: {
        on?: PickOne<{ episode: BrainEpisode; series: BrainSeries }>;
        plugs?: TPlugs;
        role: { briefs?: Artifact<typeof GitFile>[] };
        prompt: AsBrainPromptFor<TPlugs>;
        schema: { output: z.Schema<TOutput> };
      },
      _context?: Empty,
    ): Promise<BrainOutput<TOutput, 'repl', TPlugs>> =>
      invokeQuery({
        mode: 'act',
        model: config.model,
        spec: config.spec,
        on: {
          episode: actInput.on?.episode,
          series: actInput.on?.series,
        },
        ...actInput,
      }),
  });
};
