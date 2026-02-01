import { query } from '@anthropic-ai/claude-agent-sdk';
import {
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
import type { Artifact } from 'rhachet-artifact';
import type { GitFile } from 'rhachet-artifact-git';
import type { Empty, PickOne } from 'type-fns';
import type { z } from 'zod';

import { asJsonSchema } from '../../infra/schema/asJsonSchema';
import {
  type AnthropicBrainReplSlug,
  CONFIG_BY_REPL_SLUG,
} from './BrainRepl.config';

// re-export for consumers
export { CONFIG_BY_REPL_SLUG, type AnthropicBrainReplSlug };

/**
 * .what = tools disallowed for readonly ask operations
 * .why = prevents mutations during research/analysis tasks
 */
const TOOLS_DISALLOWED_FOR_ASK = [
  'Edit',
  'Write',
  'Bash',
  'NotebookEdit',
] as const;

/**
 * .what = tools allowed for read+write act operations
 * .why = enables full agentic capabilities for code changes
 */
const TOOLS_ALLOWED_FOR_ACT = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'Task',
] as const;

/**
 * .what = result extracted from claude-agent-sdk query
 * .why = captures both output data and usage metrics from the stream
 */
interface QueryResult {
  output: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheGetTokens: number;
    cacheSetTokens: number;
  };
}

/**
 * .what = extracts final result from claude-agent-sdk query async generator
 * .why = query() returns an async iterator, need to consume to get result
 *
 * .note = when outputFormat is used, result may be in structured_output field
 *
 * .ref = usage extraction pattern per claude-agent-sdk cost tracking docs
 *        https://platform.claude.com/docs/en/agent-sdk/cost-tracking
 *        - result message contains authoritative cumulative usage
 *        - modelUsage provides per-model breakdown suitable for billing
 *        - assistant message accumulation would require deduplication by message.id
 *          (parallel tool uses share same id and report identical usage)
 */
const extractResultFromQuery = async (
  queryIterator: ReturnType<typeof query>,
): Promise<QueryResult> => {
  let result: string | undefined;
  let structuredOutput: unknown | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheGetTokens = 0;
  let totalCacheSetTokens = 0;

  for await (const message of queryIterator) {
    // check for result message with success subtype
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
      structuredOutput = message.structured_output;

      // extract usage from result message (authoritative cumulative usage)
      // ref: https://platform.claude.com/docs/en/agent-sdk/cost-tracking
      const modelUsage = message.modelUsage as
        | Record<
            string,
            {
              inputTokens?: number;
              outputTokens?: number;
              cacheReadInputTokens?: number;
              cacheCreationInputTokens?: number;
            }
          >
        | undefined;
      if (modelUsage) {
        for (const usage of Object.values(modelUsage)) {
          totalInputTokens += usage.inputTokens ?? 0;
          totalOutputTokens += usage.outputTokens ?? 0;
          totalCacheGetTokens += usage.cacheReadInputTokens ?? 0;
          totalCacheSetTokens += usage.cacheCreationInputTokens ?? 0;
        }
      }
    }

    // throw on error subtypes
    if (message.type === 'result' && message.subtype !== 'success') {
      throw new Error(
        `claude-agent-sdk query failed: ${message.subtype}, errors: ${message.errors?.join(', ') ?? 'unknown'}`,
      );
    }
  }

  // prefer structured_output when available (used with outputFormat)
  const output =
    structuredOutput !== undefined
      ? structuredOutput
      : result !== undefined
        ? JSON.parse(result)
        : (() => {
            throw new Error('no result message received from claude-agent-sdk');
          })();

  return {
    output,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheGetTokens: totalCacheGetTokens,
      cacheSetTokens: totalCacheSetTokens,
    },
  };
};

/**
 * .what = invokes claude-agent-sdk query with specified mode
 * .why = dedupes shared logic between ask (readonly) and act (read+write)
 */
const invokeQuery = async <TOutput>(input: {
  mode: 'ask' | 'act';
  model: string;
  spec: BrainSpec;
  on?: { episode?: BrainEpisode; series?: BrainSeries };
  role: { briefs?: Artifact<typeof GitFile>[] };
  prompt: string;
  schema: { output: z.Schema<TOutput> };
}): Promise<BrainOutput<TOutput, 'repl'>> => {
  const startTime = Date.now();

  // compose system prompt from briefs
  const systemPrompt = input.role.briefs
    ? await castBriefsToPrompt({ briefs: input.role.briefs })
    : undefined;

  // convert zod schema to json schema for native structured output
  const jsonSchema = asJsonSchema({ schema: input.schema.output });

  // build tool constraints based on mode
  const toolConstraints =
    input.mode === 'ask'
      ? { disallowedTools: [...TOOLS_DISALLOWED_FOR_ASK] }
      : { allowedTools: [...TOOLS_ALLOWED_FOR_ACT] };

  // invoke claude-agent-sdk query
  const queryIterator = query({
    prompt: input.prompt,
    options: {
      systemPrompt,
      model: input.model,
      ...toolConstraints,
      outputFormat: {
        type: 'json_schema',
        schema: jsonSchema as Record<string, unknown>,
      },
    },
  });

  // extract final result from async iterator
  const queryResult = await extractResultFromQuery(queryIterator);

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
      input: input.prompt.length + (systemPrompt?.length ?? 0),
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

  // generate continuables for episode/series tracking
  const continuables = await genBrainContinuables({
    for: { grain: 'repl' },
    on: {
      episode: input.on?.episode ?? null,
      series: input.on?.series ?? null,
    },
    with: {
      exchange: {
        input: input.prompt,
        output: outputText,
        exid: null, // claude-agent-sdk doesn't expose message ids
      },
      episode: { exid: null },
      series: { exid: null },
    },
  });

  return { output, metrics, ...continuables };
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

  return new BrainRepl({
    repo: 'anthropic',
    slug: input.slug,
    description: `claude code (${input.slug}) - agentic coding assistant with tool use`,
    spec: config.spec,

    /**
     * .what = readonly analysis (research, queries, code review)
     * .why = provides safe, non-mutating agent interactions
     */
    ask: async <TOutput>(
      askInput: {
        on?: PickOne<{ episode: BrainEpisode; series: BrainSeries }>;
        role: { briefs?: Artifact<typeof GitFile>[] };
        prompt: string;
        schema: { output: z.Schema<TOutput> };
      },
      _context?: Empty,
    ): Promise<BrainOutput<TOutput, 'repl'>> =>
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
     */
    act: async <TOutput>(
      actInput: {
        on?: PickOne<{ episode: BrainEpisode; series: BrainSeries }>;
        role: { briefs?: Artifact<typeof GitFile>[] };
        prompt: string;
        schema: { output: z.Schema<TOutput> };
      },
      _context?: Empty,
    ): Promise<BrainOutput<TOutput, 'repl'>> =>
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
