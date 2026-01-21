import { dividePrice } from 'iso-price';
import type { BrainSpec } from 'rhachet';

/**
 * .what = anthropic model identifiers
 * .why = type-safe model id specification
 */
export type AnthropicBrainAtomModel =
  | 'claude-3-5-haiku-20241022'
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-20250514'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-20250514'
  | 'claude-opus-4-5-20251101';

/**
 * .what = supported anthropic brain atom slugs
 * .why = enables type-safe slug specification with model variants
 */
export type AnthropicBrainAtomSlug =
  | 'claude/haiku'
  | 'claude/haiku/v3.5'
  | 'claude/haiku/v4.5'
  | 'claude/sonnet'
  | 'claude/sonnet/v4'
  | 'claude/sonnet/v4.5'
  | 'claude/opus'
  | 'claude/opus/v4'
  | 'claude/opus/v4.5';

/**
 * .what = atom config type
 * .why = shared type for model configs
 */
export type BrainAtomConfig = {
  model: AnthropicBrainAtomModel;
  description: string;
  spec: BrainSpec;
};

/**
 * .what = concrete atom configs (versioned)
 * .why = single source of truth for each model version
 *
 * .citations
 *   pricing: https://platform.claude.com/docs/en/about-claude/pricing
 *   context: https://platform.claude.com/docs/en/build-with-claude/context-windows
 *   haiku-benchmarks: https://www.anthropic.com/claude/haiku
 *   sonnet-benchmarks: https://www.anthropic.com/claude/sonnet
 *   opus-benchmarks: https://www.anthropic.com/claude/opus
 *   speed-benchmarks: https://artificialanalysis.ai/models/claude-3-5-haiku
 */
const CONFIG_HAIKU_V3_5: BrainAtomConfig = {
  model: 'claude-3-5-haiku-20241022',
  description: 'claude haiku 3.5 - fast and cost-effective',
  spec: {
    cost: {
      time: {
        // ~65 tokens/sec, ~0.7s latency; src: https://artificialanalysis.ai/models/claude-3-5-haiku
        speed: { tokens: 65, per: { seconds: 1 } },
        latency: { milliseconds: 700 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        per: 'token',
        cache: {
          get: dividePrice({ of: '$0.08', by: 1_000_000 }), // $0.08/MTok cache read
          set: dividePrice({ of: '$1', by: 1_000_000 }), // $1/MTok cache write (5min)
        },
        input: dividePrice({ of: '$0.80', by: 1_000_000 }), // $0.80/MTok input
        output: dividePrice({ of: '$4', by: 1_000_000 }), // $4/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: 200_000 } },
      grades: {
        // swe: ~40% est; pre-4.5 generation
        swe: 40,
        // mmlu: ~75% est; official score not published
        mmlu: 75,
        // humaneval: 88.1%; src: https://docsbot.ai/models/claude-3-5-haiku
        humaneval: 88,
      },
      // knowledge cutoff for 3.5 series
      cutoff: '2024-04-01',
      domain: 'ALL',
      skills: { tooluse: true, vision: true },
    },
  },
};

const CONFIG_HAIKU_V4_5: BrainAtomConfig = {
  model: 'claude-haiku-4-5-20251001',
  description: 'claude haiku 4.5 - fastest and most cost-effective',
  spec: {
    cost: {
      time: {
        // ~4-5x faster than sonnet; src: https://www.anthropic.com/claude/haiku
        speed: { tokens: 100, per: { seconds: 1 } },
        latency: { milliseconds: 500 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        per: 'token',
        cache: {
          get: dividePrice({ of: '$0.10', by: 1_000_000 }), // $0.10/MTok cache read
          set: dividePrice({ of: '$1.25', by: 1_000_000 }), // $1.25/MTok cache write (5min)
        },
        input: dividePrice({ of: '$1', by: 1_000_000 }), // $1/MTok input
        output: dividePrice({ of: '$5', by: 1_000_000 }), // $5/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: 200_000 } },
      grades: {
        // swe: 73.3% SWE-bench Verified; src: https://www.anthropic.com/claude/haiku
        swe: 73,
        // mmlu: ~80% est; official score not published
        mmlu: 80,
        // humaneval: ~88% est; based on 3.5 haiku performance
        humaneval: 88,
      },
      // knowledge cutoff; src: https://platform.claude.com/docs/en/about-claude/models/overview
      cutoff: '2025-04-01',
      domain: 'ALL',
      skills: { tooluse: true, vision: true },
    },
  },
};

const CONFIG_SONNET_V4: BrainAtomConfig = {
  model: 'claude-sonnet-4-20250514',
  description: 'claude sonnet 4 - balanced performance and capability',
  spec: {
    cost: {
      time: {
        // slightly slower than 4.5; ~66 tokens/sec est
        speed: { tokens: 66, per: { seconds: 1 } },
        latency: { milliseconds: 900 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        per: 'token',
        cache: {
          get: dividePrice({ of: '$0.30', by: 1_000_000 }), // $0.30/MTok cache read
          set: dividePrice({ of: '$3.75', by: 1_000_000 }), // $3.75/MTok cache write (5min)
        },
        input: dividePrice({ of: '$3', by: 1_000_000 }), // $3/MTok input
        output: dividePrice({ of: '$15', by: 1_000_000 }), // $15/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: 200_000 } },
      grades: {
        // swe: 72.5-80.2% SWE-bench; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        swe: 72,
        // mmlu: 86.5%; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        mmlu: 87,
        // humaneval: ~91% est
        humaneval: 91,
      },
      // knowledge cutoff
      cutoff: '2025-04-01',
      domain: 'ALL',
      skills: { tooluse: true, vision: true },
    },
  },
};

const CONFIG_SONNET_V4_5: BrainAtomConfig = {
  model: 'claude-sonnet-4-5-20250929',
  description: 'claude sonnet 4.5 - balanced performance and capability',
  spec: {
    cost: {
      time: {
        // ~72 tokens/sec; src: https://artificialanalysis.ai/models/claude-3-5-haiku
        speed: { tokens: 72, per: { seconds: 1 } },
        latency: { milliseconds: 970 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        per: 'token',
        cache: {
          get: dividePrice({ of: '$0.30', by: 1_000_000 }), // $0.30/MTok cache read
          set: dividePrice({ of: '$3.75', by: 1_000_000 }), // $3.75/MTok cache write (5min)
        },
        input: dividePrice({ of: '$3', by: 1_000_000 }), // $3/MTok input
        output: dividePrice({ of: '$15', by: 1_000_000 }), // $15/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: 200_000 } },
      grades: {
        // swe: 77.2% SWE-bench Verified; src: https://www.anthropic.com/claude/sonnet
        swe: 77,
        // mmlu: 89.1% MMMLU; src: https://caylent.com/blog/claude-sonnet-4-5-highest-scoring-claude-model-yet-on-swe-bench
        mmlu: 89,
        // humaneval: ~93% est
        humaneval: 93,
      },
      // knowledge cutoff; src: https://platform.claude.com/docs/en/about-claude/models/overview
      cutoff: '2025-04-01',
      domain: 'ALL',
      skills: { tooluse: true, vision: true },
    },
  },
};

const CONFIG_OPUS_V4: BrainAtomConfig = {
  model: 'claude-opus-4-20250514',
  description: 'claude opus 4 - highly capable for complex reasoning',
  spec: {
    cost: {
      time: {
        // ~26 tokens/sec; src: https://artificialanalysis.ai/models/claude-3-5-haiku
        speed: { tokens: 26, per: { seconds: 1 } },
        latency: { milliseconds: 2100 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        per: 'token',
        cache: {
          get: dividePrice({ of: '$1.50', by: 1_000_000 }), // $1.50/MTok cache read
          set: dividePrice({ of: '$18.75', by: 1_000_000 }), // $18.75/MTok cache write (5min)
        },
        input: dividePrice({ of: '$15', by: 1_000_000 }), // $15/MTok input
        output: dividePrice({ of: '$75', by: 1_000_000 }), // $75/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: 200_000 } },
      grades: {
        // swe: 72.5-79.4% SWE-bench; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        swe: 72,
        // mmlu: 88.8%; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        mmlu: 89,
        // humaneval: ~93% est
        humaneval: 93,
      },
      // knowledge cutoff
      cutoff: '2025-04-01',
      domain: 'ALL',
      skills: { tooluse: true, vision: true },
    },
  },
};

const CONFIG_OPUS_V4_5: BrainAtomConfig = {
  model: 'claude-opus-4-5-20251101',
  description: 'claude opus 4.5 - most capable for complex reasoning',
  spec: {
    cost: {
      time: {
        // slower but most capable; ~30 tokens/sec est
        speed: { tokens: 30, per: { seconds: 1 } },
        latency: { milliseconds: 1500 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        // note: opus 4.5 pricing reduced 67% from opus 4/4.1
        per: 'token',
        cache: {
          get: dividePrice({ of: '$0.50', by: 1_000_000 }), // $0.50/MTok cache read
          set: dividePrice({ of: '$6.25', by: 1_000_000 }), // $6.25/MTok cache write (5min)
        },
        input: dividePrice({ of: '$5', by: 1_000_000 }), // $5/MTok input
        output: dividePrice({ of: '$25', by: 1_000_000 }), // $25/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: 200_000 } },
      grades: {
        // swe: 80.9% SWE-bench Verified; src: https://www.anthropic.com/claude/opus
        swe: 81,
        // mmlu: ~90% est; tied with o3; src: https://www.vellum.ai/blog/claude-opus-4-5-benchmarks
        mmlu: 90,
        // humaneval: ~95% est
        humaneval: 95,
      },
      // knowledge cutoff may 2025; src: https://www.anthropic.com/claude/opus
      cutoff: '2025-05-01',
      domain: 'ALL',
      skills: { tooluse: true, vision: true },
    },
  },
};

/**
 * .what = atom config by slug
 * .why = single source of truth for model configs, shared by atoms and repls
 */
export const CONFIG_BY_ATOM_SLUG: Record<
  AnthropicBrainAtomSlug,
  BrainAtomConfig
> = {
  // aliases (reference concrete versions)
  'claude/haiku': CONFIG_HAIKU_V4_5,
  'claude/sonnet': CONFIG_SONNET_V4_5,
  'claude/opus': CONFIG_OPUS_V4_5,

  // concrete versions
  'claude/haiku/v3.5': CONFIG_HAIKU_V3_5,
  'claude/haiku/v4.5': CONFIG_HAIKU_V4_5,
  'claude/sonnet/v4': CONFIG_SONNET_V4,
  'claude/sonnet/v4.5': CONFIG_SONNET_V4_5,
  'claude/opus/v4': CONFIG_OPUS_V4,
  'claude/opus/v4.5': CONFIG_OPUS_V4_5,
};
