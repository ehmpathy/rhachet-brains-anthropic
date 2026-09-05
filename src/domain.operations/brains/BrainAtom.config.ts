import { priceDivide } from 'iso-price';
import type { BrainSpec } from 'rhachet';

/**
 * .what = the one config store every brain ladder reads
 *
 * .why it lives in `brains/` rather than in `atoms/` = it has THREE consumers, not one:
 *   `atoms/` builds a brain from it, `repls/` delegates to it (a repl reuses the atom
 *   spec rather than restating it), and `registry/` renders it into the readme table.
 *   two of those are siblings of `atoms/`, so while this sat in `atoms/` they read
 *   another subdomain's private store by relative path — the reach-in
 *   `rule.forbid.scope-leaks` names, and the 2+-sibling reuse that
 *   `rule.prefer.most-common-denominator` says to lift to a common ancestor.
 *
 * ⚠️ the filename still says ATOM, and that is not a leftover. the atom ladder IS the
 *   canonical one: a repl slug carries no spec of its own, it points at an atom config
 *   (see `CONFIG_BY_REPL_SLUG`), and `BrainRepl.mirror.test.ts` clamps that the two
 *   ladders stay rung-for-rung. so this names the atom ladder because that is what it
 *   holds; it sits in `brains/` because three subdomains share it.
 *
 * .note = the direction is now downward from every consumer, so a rename here is a
 *   compile error at each call site rather than a silent cross-subdomain break.
 */

/**
 * .what = anthropic model identifiers
 * .why = type-safe model id specification
 */
export type AnthropicBrainModel =
  // haiku
  | 'claude-3-5-haiku-20241022'
  | 'claude-haiku-4-5-20251001'
  // sonnet
  | 'claude-sonnet-4-20250514'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-sonnet-4-6'
  | 'claude-sonnet-5'
  // opus
  | 'claude-opus-4-20250514'
  | 'claude-opus-4-5-20251101'
  | 'claude-opus-4-6'
  | 'claude-opus-4-7'
  | 'claude-opus-4-8'
  | 'claude-opus-5'
  // fable
  | 'claude-fable-5';

/**
 * .what = supported anthropic brain atom slugs
 * .why = enables type-safe slug specification with model variants
 *
 * .note = declared as an array, with the union derived from it, so one list drives
 *   three things: the type, the registration in `getBrainAtomsByAnthropic`, and the
 *   generated readme table. rhachet discovers only the slugs that registration
 *   RETURNS, so a slug declared here but absent there is invisible to
 *   `rhx review --brain`. one source removes that whole class of silent gap.
 *
 * .note = the bare alias MOVES. `claude/opus` tracks the newest opus, so it crosses
 *   major generations. a caller who needs a frozen model pins a rung instead.
 *
 * .note = the ladder is RAGGED, not a grid. the vendor did not ship every rung for
 *   every tier: sonnet has no 4.7 or 4.8, haiku stops at 4.5, fable starts at 5.
 *   do NOT invent a slug to fill a gap — a slug must name a model that exists.
 */
export const ANTHROPIC_BRAIN_ATOM_SLUGS = [
  // haiku — bare alias tracks the newest haiku
  'claude/haiku',
  'claude/haiku/v3.5',
  'claude/haiku/v4.5',
  // sonnet — bare alias tracks the newest sonnet
  'claude/sonnet',
  'claude/sonnet/v4',
  'claude/sonnet/v4.5',
  'claude/sonnet/v4.6',
  'claude/sonnet/v5',
  // opus — bare alias tracks the newest opus
  'claude/opus',
  'claude/opus/v4',
  'claude/opus/v4.5',
  'claude/opus/v4.6',
  'claude/opus/v4.7',
  'claude/opus/v4.8',
  'claude/opus/v5',
  // fable — bare alias tracks the newest fable
  'claude/fable',
  'claude/fable/v5',
] as const;

export type AnthropicBrainAtomSlug =
  (typeof ANTHROPIC_BRAIN_ATOM_SLUGS)[number];

/**
 * .what = a partner platform that serves claude models beside the first-party api
 *
 * .why a CLOSED set, rather than a free string. a retired rung stays reachable only
 *   through a client injected for one of these platforms, so the list is the fact a
 *   caller acts on before they pin a retired rung. a closed set makes a typo
 *   unexpressible and keeps the readme prose derivable
 *   (`rule.prefer.prevent-over-correct`).
 *
 * .note = the first-party Claude API is deliberately ABSENT from this union. a rung
 *   listed here is one the first-party api no longer serves — that is what
 *   `deprecated` means — so to name it would be a contradiction the type should
 *   refuse to hold.
 */
export type BrainPlatform = 'bedrock' | 'google-cloud';

/**
 * .what = the shape of one MODEL's config — its id, spec, thought profile, tokenizer,
 *   and deprecation mark
 * .why = a model is described once and reached through two interfaces. `atoms/` calls
 *   it through the messages api and `repls/` through the agent sdk, so both ladders are
 *   typed by this one shape, and `BrainRepl.mirror.test` clamps that each repl twin
 *   holds the very same config OBJECT.
 *
 * ⚠️ it was named `BrainAtomConfig`, which made a repl's config read as an "atom
 *   config" — vocabulary owned by one subdomain that named the shared shape of another.
 *   the name is now tier-neutral, since no field here is atom-specific.
 *
 * .note = one tie remains, and it is deliberate for now: `deprecated.replacedBy` is
 *   typed as an atom slug, which anchors this shape in `atoms/` rather than in
 *   `brains/` beside `asBrainDescription` and the slug prefixes. to finish the lift the
 *   pointer must be generic over the READER's namespace — a real decomposition, carried
 *   to the council rather than smuggled into this change.
 */
export type BrainConfig = {
  model: AnthropicBrainModel;
  description: string;
  spec: BrainSpec;

  /**
   * .what = how the model thinks, and whether it does so by default
   * .why = this is the sharpest cost trap in the ladder, and it is invisible from the
   *   slug alone. "pin one rung back" LOOKS like the conservative, cheap choice — and
   *   for sonnet it is the expensive one: sonnet 4.6 thinks by default exactly like
   *   sonnet 5, at $3/$15 against v5's $2/$10, so a caller pays ~50% more for the same
   *   behavior. only the 4.5 rungs escape default-on thought, and they pay for it with
   *   a 200K context instead of 1M.
   *
   *   so the caller who wants a FROZEN MODEL ID and the caller who wants FROZEN
   *   BEHAVIOR need different rungs. the readme table renders this column so that
   *   trade is visible at the point of choice, rather than discovered on an invoice.
   *
   * .note = `mode` and `effort` quote Anthropic's own published parameter names.
   */
  thought: {
    /**
     * .what = 'none' = the model cannot think; 'extended' = it thinks only when asked;
     *   'adaptive' = it thinks by default, per its `effort`
     */
    mode: 'none' | 'extended' | 'adaptive';
    /**
     * .what = the vendor's default `effort` for this model
     * .note = null = the model REJECTS the effort parameter. so a generic effort knob
     *   cannot pass through unconditionally (see ehmpathy/rhachet#490).
     */
    effort: 'high' | null;
  };

  /**
   * .what = which tokenizer generation counts this model's tokens
   * .why = 4.7 introduced a new tokenizer that counts ~30% more tokens for the same
   *   text. so a token budget, or a `metrics.size.tokens` comparison, tuned on one
   *   side of that line does not carry to the other — even for an identical prompt.
   *
   * .why STRUCTURED, rather than prose. the readme's warn about that line used to be
   *   hand-written, which made it the one claim in a GENERATED table that could go
   *   stale under a green clamp — the exact hand-copy drift the generation exists to
   *   remove, reproduced one level up. the warn now derives the boundary from this
   *   field, so a rung added on either side moves the prose with it.
   *
   * .note = the label names the generation, NOT the rung. rungs below 4.7 share one
   *   tokenizer and rungs at 4.7+ share another, so two labels cover the whole ladder.
   */
  tokenizer: 'pre-4.7' | '4.7+';

  /**
   * .what = the output-token cap this rung's requests ask for
   *
   * .why STRUCTURED, rather than the one flat global it replaces. every OTHER per-rung
   *   fact here is a field — `thought`, `tokenizer`, `deprecated`,
   *   `spec.gain.size.context` — and this one alone was a lone `16384` literal in
   *   `genBrainAtom`, with no referent in any vendor fact. so one number spoke for
   *   thirteen rungs whose real limits range over an 8x spread.
   *
   * ⚠️ the flat global hurt the FRONTIER rungs most, which inverts what a caller
   *   expects to buy. every rung from 4.6 up thinks by default at `effort: high`, and
   *   thought tokens draw from this same budget — so under a shared 16K cap an opus 5
   *   call had LESS room for its answer than the opus 4.5 call it replaced, while it
   *   served a 128K limit we never asked for.
   *
   * .why THIS IS NOT A COST RAISE. `max_tokens` is a cap, not a purchase: the api
   *   bills the tokens actually emitted, and `metrics.cost.cash` is computed from the
   *   response's own `usage` counts (`genBrainAtom` reads `size.tokens`, never this
   *   field). so a call that already completed bills the same. the calls whose behavior
   *   moves are the ones that previously TRUNCATED — a loud throw — and now finish.
   *
   * .note = the figure is the vendor's synchronous Messages API limit, cited per rung
   *   below. it is NOT the Batch API limit, which is higher on 4.6+ behind a beta
   *   header we do not send.
   *
   * .note = a maintainer can re-verify every value against the live api rather than the
   *   docs: the Models API returns `max_tokens` per model
   *   (https://platform.claude.com/docs/en/api/models/list).
   */
  maxOutput: {
    tokens: number;
  };

  /**
   * .what = marks a rung the vendor no longer serves on every platform
   * .why = a retired rung stays reachable for callers who inject a client for a
   *   platform that still serves it (context.anthropic -> Bedrock / Google Cloud),
   *   so we mark it rather than delete it. deletion would break a config that is
   *   correct for that caller.
   * .note = absent = the rung is fully current on the first-party Claude API
   */
  deprecated?: {
    /** .what = iso date the rung retired first-party */
    since: string;
    /**
     * .what = the partner platforms that still serve this rung
     *
     * .why STRUCTURED, rather than the prose sentence this replaced. the sentence
     *   asserted a vendor fact ("still served on Amazon Bedrock and Google Cloud")
     *   that `asBrainRegistryMarkdown` rendered verbatim into the readme — so a
     *   GENERATED table carried one hand-typed claim, which is the hand-copy drift
     *   the generation exists to remove, reproduced one level down.
     *
     * ⚠️ that staleness already happened once, mid-build: opus 4 was written as
     *   Bedrock+GCP and is in fact Google-Cloud ONLY. a prose field let the two
     *   rungs disagree while both read plausibly; a platform list cannot.
     *
     * .note = an EMPTY list is meaningful, not absent data — it says the rung is
     *   retired everywhere, so no injected client reaches it either.
     */
    platforms: BrainPlatform[];
    /** .what = the slug a caller should move to */
    replacedBy: AnthropicBrainAtomSlug;
  };
};

/**
 * .what = the context window on each side of the 4.6 boundary
 *
 * .why = the value collapses to exactly TWO numbers across thirteen rungs, and it was
 *   hand-typed thirteen times. a transposed digit — `20_000` where `200_000` was meant —
 *   reads as plausible in a wall of config, and it silently shrinks what a caller can
 *   send. a name cannot be transposed.
 *
 * .note = this is the SAME boundary `thought` and `tokenizer` already encode: the 1M
 *   window and default-on adaptive thought both arrive at 4.6. so the two fields are not
 *   independent, and `BrainAtom.context.test.ts` clamps their agreement — a rung given
 *   the wrong constant reddens rather than ships.
 */
const CONTEXT_TOKENS_PRE_V4_6 = 200_000;
const CONTEXT_TOKENS_FROM_V4_6 = 1_000_000;

/**
 * .what = the max-output cap the three RETIRED rungs carry
 *
 * ⚠️ NOT a verified vendor limit. each of these rungs is retired first-party, and the
 *   vendor publishes no max-output figure for a retired model — so this holds the prior
 *   conservative default rather than a figure we could cite. do NOT read it as any
 *   rung's real limit; a partner platform that still serves one sets its own.
 *
 * .why NAMED, rather than the literal typed three times. it is the same hazard
 *   `CONTEXT_TOKENS_*` above exists for, and it is worse here: three identical
 *   uncitable numbers read as three independent findings, so a maintainer who revises
 *   one has no cue that the other two share its reason. a name carries the caveat once
 *   and makes a partial edit unexpressible.
 */
const MAX_OUTPUT_TOKENS_RETIRED_DEFAULT = 16_384;

/**
 * .what = the gain fields every rung shares
 *
 * .why = `domain` and `skills` are identical on all thirteen rungs, so they are NOT
 *   per-rung facts — but they were hand-typed as though they were. that is the hazard:
 *   a `vision: false` typed onto one rung reads as a deliberate per-rung claim, and no
 *   check would object to it.
 *
 * .why NAMED, rather than left wet. the file already treats `maxOutput`, `thought` and
 *   `tokenizer` as structured fields precisely to kill this class of drift, so three
 *   hand-repeated literals were the one inconsistency left in it. thirteen repeats is
 *   four times past the bar `rule.prefer.wet-over-dry` sets.
 */
const GAIN_UNIFORM = {
  domain: 'ALL',
  skills: { tooluse: true, vision: true },
} as const;

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
const CONFIG_HAIKU_V3_5: BrainConfig = {
  model: 'claude-3-5-haiku-20241022',
  tokenizer: 'pre-4.7',
  maxOutput: { tokens: MAX_OUTPUT_TOKENS_RETIRED_DEFAULT },
  // .note = no deprecation prose here. `asBrainDescription` appends it from the
  //   structured field below, so the mark has one source rather than two.
  description: 'claude haiku 3.5 - fast and cost-effective',
  // pre-dates extended thought entirely
  thought: { mode: 'none', effort: null },
  deprecated: {
    // retired first-party 2026-02-19; src: model-deprecations
    since: '2026-02-19',
    platforms: ['bedrock', 'google-cloud'],
    replacedBy: 'claude/haiku/v4.5',
  },
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
          get: priceDivide({ of: '$0.08', by: 1_000_000 }), // $0.08/MTok cache read
          set: priceDivide({ of: '$1', by: 1_000_000 }), // $1/MTok cache write (5min)
        },
        input: priceDivide({ of: '$0.80', by: 1_000_000 }), // $0.80/MTok input
        output: priceDivide({ of: '$4', by: 1_000_000 }), // $4/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: CONTEXT_TOKENS_PRE_V4_6 } },
      grades: {
        // sweVer: ~40% est; pre-4.5 generation
        sweVer: 40,
        // mmlu: ~75% est; official score not published
        mmlu: 75,
        // humaneval: 88.1%; src: https://docsbot.ai/models/claude-3-5-haiku
        humaneval: 88,
      },
      // knowledge cutoff for 3.5 series
      cutoff: '2024-04-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_HAIKU_V4_5: BrainConfig = {
  model: 'claude-haiku-4-5-20251001',
  tokenizer: 'pre-4.7',
  // 64K max output; src: models/haiku-4-5/overview
  maxOutput: { tokens: 64_000 },
  description: 'claude haiku 4.5 - fastest and most cost-effective',
  // "Default effort: Not supported"; src: models/haiku-4-5/overview
  thought: { mode: 'extended', effort: null },
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
          get: priceDivide({ of: '$0.10', by: 1_000_000 }), // $0.10/MTok cache read
          set: priceDivide({ of: '$1.25', by: 1_000_000 }), // $1.25/MTok cache write (5min)
        },
        input: priceDivide({ of: '$1', by: 1_000_000 }), // $1/MTok input
        output: priceDivide({ of: '$5', by: 1_000_000 }), // $5/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: CONTEXT_TOKENS_PRE_V4_6 } },
      grades: {
        // sweVer: 73.3% SWE-bench Verified; src: https://www.anthropic.com/claude/haiku
        sweVer: 73,
        // mmlu: ~80% est; official score not published
        mmlu: 80,
        // humaneval: ~88% est; based on 3.5 haiku performance
        humaneval: 88,
      },
      // reliable knowledge cutoff feb 2025 (training data jul 2025)
      // .note = verified 2026-08-31; was recorded as 2025-04-01, which matched neither
      cutoff: '2025-02-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_SONNET_V4: BrainConfig = {
  model: 'claude-sonnet-4-20250514',
  tokenizer: 'pre-4.7',
  maxOutput: { tokens: MAX_OUTPUT_TOKENS_RETIRED_DEFAULT },
  description: 'claude sonnet 4 - balanced performance',
  thought: { mode: 'extended', effort: null },
  deprecated: {
    // retired first-party 2026-06-15; src: model-deprecations
    since: '2026-06-15',
    platforms: ['bedrock', 'google-cloud'],
    // .note = points at v5, NOT at the next rung up. v4.6 thinks by default exactly
    //   as v5 does, so it recovers none of v4's on-request behavior — and it charges
    //   $3/$15 against v5's $2/$10 for that identical behavior. the next rung up is
    //   strictly dominated here, so it would be a trap to point a caller at it.
    replacedBy: 'claude/sonnet/v5',
  },
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
          get: priceDivide({ of: '$0.30', by: 1_000_000 }), // $0.30/MTok cache read
          set: priceDivide({ of: '$3.75', by: 1_000_000 }), // $3.75/MTok cache write (5min)
        },
        input: priceDivide({ of: '$3', by: 1_000_000 }), // $3/MTok input
        output: priceDivide({ of: '$15', by: 1_000_000 }), // $15/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: CONTEXT_TOKENS_PRE_V4_6 } },
      grades: {
        // sweVer: 72.5-80.2% SWE-bench; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        sweVer: 72,
        // mmlu: 86.5%; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        mmlu: 87,
        // humaneval: ~91% est
        humaneval: 91,
      },
      // knowledge cutoff
      cutoff: '2025-04-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_SONNET_V4_5: BrainConfig = {
  model: 'claude-sonnet-4-5-20250929',
  tokenizer: 'pre-4.7',
  // 64K max output; src: models/sonnet-4-5/overview
  maxOutput: { tokens: 64_000 },
  description: 'claude sonnet 4.5 - balanced performance and capability',
  // the LAST sonnet rung that does not think by default — the only rung that answers
  // a caller who wants frozen BEHAVIOR, not merely a frozen model id.
  // "Default effort: Not supported"; src: models/sonnet-4-5/overview
  thought: { mode: 'extended', effort: null },
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
          get: priceDivide({ of: '$0.30', by: 1_000_000 }), // $0.30/MTok cache read
          set: priceDivide({ of: '$3.75', by: 1_000_000 }), // $3.75/MTok cache write (5min)
        },
        input: priceDivide({ of: '$3', by: 1_000_000 }), // $3/MTok input
        output: priceDivide({ of: '$15', by: 1_000_000 }), // $15/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: CONTEXT_TOKENS_PRE_V4_6 } },
      grades: {
        // sweVer: 77.2% SWE-bench Verified; src: https://www.anthropic.com/claude/sonnet
        sweVer: 77,
        // mmlu: 89.1% MMMLU; src: https://caylent.com/blog/claude-sonnet-4-5-highest-scoring-claude-model-yet-on-swe-bench
        mmlu: 89,
        // humaneval: ~93% est
        humaneval: 93,
      },
      // reliable knowledge cutoff jan 2025 (training data jul 2025)
      // .note = verified 2026-08-31; was recorded as 2025-04-01
      cutoff: '2025-01-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_OPUS_V4: BrainConfig = {
  model: 'claude-opus-4-20250514',
  tokenizer: 'pre-4.7',
  maxOutput: { tokens: MAX_OUTPUT_TOKENS_RETIRED_DEFAULT },
  description: 'claude opus 4 - highly capable',
  thought: { mode: 'extended', effort: null },
  deprecated: {
    // retired first-party 2026-06-15; src: model-deprecations
    since: '2026-06-15',
    // ⚠️ google-cloud ONLY — unlike sonnet 4 and haiku 3.5, opus 4 is NOT on bedrock.
    //   this asymmetry was written wrong once as prose; the list now carries it, and
    //   `asBrainDescription.test.ts` [case5] reddens if it is ever re-broadened.
    platforms: ['google-cloud'],
    // .note = points at v5, NOT at the next rung up. v4.8 matches v5 on rate, context
    //   and thought mode, and trails it on knowledge cutoff — so it wins on no axis.
    replacedBy: 'claude/opus/v5',
  },
  spec: {
    cost: {
      time: {
        // ~26 tokens/sec, UNVERIFIED — the citation here named a haiku 3.5 page,
        // which cannot support an opus 4 figure. the number is left as recorded
        // rather than replaced by a guess; no first-party source states it.
        speed: { tokens: 26, per: { seconds: 1 } },
        latency: { milliseconds: 2100 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        per: 'token',
        cache: {
          get: priceDivide({ of: '$1.50', by: 1_000_000 }), // $1.50/MTok cache read
          set: priceDivide({ of: '$18.75', by: 1_000_000 }), // $18.75/MTok cache write (5min)
        },
        input: priceDivide({ of: '$15', by: 1_000_000 }), // $15/MTok input
        output: priceDivide({ of: '$75', by: 1_000_000 }), // $75/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: CONTEXT_TOKENS_PRE_V4_6 } },
      grades: {
        // sweVer: 72.5-79.4% SWE-bench; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        sweVer: 72,
        // mmlu: 88.8%; src: https://www.keywordsai.co/blog/claude-sonnet-4-vs-claude-opus-4-a-comprehensive-comparison
        mmlu: 89,
        // humaneval: ~93% est
        humaneval: 93,
      },
      // knowledge cutoff
      cutoff: '2025-04-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_OPUS_V4_5: BrainConfig = {
  model: 'claude-opus-4-5-20251101',
  tokenizer: 'pre-4.7',
  // 64K max output; src: models/opus-4-5/overview
  maxOutput: { tokens: 64_000 },
  // ⚠️ NOT "most capable" — that read true when opus 4.5 topped the shipped ladder, and
  //   six rungs now sit above it (opus 5 sweVer 89, fable 5 sweVer 90, against 81 here).
  //   a description is the boundary surface a `getBrainAtomsByAnthropic()` caller reads,
  //   so a stale peak-claim there contradicts `spec.gain.grades` on the SAME object — one
  //   brain that tells a human and a selector two different stories.
  //   it names the one property that still distinguishes this rung instead.
  description:
    'claude opus 4.5 - capable; the last opus rung that thinks on request, not by default',
  // the last opus rung that does not think by default, but it DOES accept effort
  thought: { mode: 'extended', effort: 'high' },
  spec: {
    cost: {
      time: {
        // slower than the sonnet tier; ~30 tokens/sec est
        speed: { tokens: 30, per: { seconds: 1 } },
        latency: { milliseconds: 1500 },
      },
      cash: {
        // src: https://platform.claude.com/docs/en/about-claude/pricing
        // note: opus 4.5 pricing reduced 67% from opus 4/4.1
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.50', by: 1_000_000 }), // $0.50/MTok cache read
          set: priceDivide({ of: '$6.25', by: 1_000_000 }), // $6.25/MTok cache write (5min)
        },
        input: priceDivide({ of: '$5', by: 1_000_000 }), // $5/MTok input
        output: priceDivide({ of: '$25', by: 1_000_000 }), // $25/MTok output
      },
    },
    gain: {
      // src: https://platform.claude.com/docs/en/build-with-claude/context-windows
      size: { context: { tokens: CONTEXT_TOKENS_PRE_V4_6 } },
      grades: {
        // sweVer: 80.9% SWE-bench Verified; src: https://www.anthropic.com/claude/opus
        sweVer: 81,
        // mmlu: ~90% est; tied with o3; src: https://www.vellum.ai/blog/claude-opus-4-5-benchmarks
        mmlu: 90,
        // humaneval: ~95% est
        humaneval: 95,
      },
      // knowledge cutoff may 2025; src: https://www.anthropic.com/claude/opus
      cutoff: '2025-05-01',
      ...GAIN_UNIFORM,
    },
  },
};

/**
 * .what = the 4.6+ generation
 * .why = every rung from 4.6 on shares a shape the 4.5 rungs do not:
 *   - 1M context / 128K max output (4.5 and earlier: 200K / 64K)
 *   - adaptive thought, default `effort: high` (4.5 and earlier: manual extended)
 *   - dateless model ids, each its own pinned snapshot
 *
 * .note = ⚠️ the adaptive-thought split is at 4.6, NOT at 5. a caller who pins one
 *   rung back from the newest to escape default-on thought does NOT escape it —
 *   only the 4.5 rungs still require thought to be asked for. see the readme.
 *
 * .note = 4.7 and later use a newer tokenizer that yields ~30% more tokens for the
 *   same text, so a token-budget comparison across the 4.6/4.7 line is not apples
 *   to apples. src: https://platform.claude.com/docs/en/about-claude/pricing
 *
 * .citations = all figures verified 2026-08-31 against
 *   https://platform.claude.com/docs/en/about-claude/models/overview
 *   https://platform.claude.com/docs/en/about-claude/pricing
 *   https://platform.claude.com/docs/en/about-claude/model-deprecations
 *
 * .note = `grades` are ESTIMATES. anthropic does not publish a comparable benchmark
 *   set across these rungs, so they are ordered monotonically within a tier for
 *   brain-selection purposes and must not be read as measured scores.
 */
const CONFIG_SONNET_V4_6: BrainConfig = {
  model: 'claude-sonnet-4-6',
  tokenizer: 'pre-4.7',
  // 128K max output; src: models/overview
  maxOutput: { tokens: 128_000 },
  description: 'claude sonnet 4.6 - balanced, 1M context, adaptive thought',
  // ⚠️ the trap: adaptive + high, exactly like sonnet 5 — but at $3/$15 against v5's
  // $2/$10. a caller who pins here for "cost predictability" pays ~50% more for the
  // same behavior. v4.5 is the rung that actually answers that ask.
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        speed: { tokens: 72, per: { seconds: 1 } },
        latency: { milliseconds: 970 },
      },
      cash: {
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.30', by: 1_000_000 }), // $0.30/MTok cache read
          set: priceDivide({ of: '$3.75', by: 1_000_000 }), // $3.75/MTok cache write (5min)
        },
        input: priceDivide({ of: '$3', by: 1_000_000 }), // $3/MTok input
        output: priceDivide({ of: '$15', by: 1_000_000 }), // $15/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 79, mmlu: 90, humaneval: 94 }, // est
      cutoff: '2025-08-01', // reliable; training data jan 2026
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_SONNET_V5: BrainConfig = {
  model: 'claude-sonnet-5',
  tokenizer: '4.7+',
  // 128K max output; src: models/sonnet-5/overview
  maxOutput: { tokens: 128_000 },
  description: 'claude sonnet 5 - best combination of speed and intelligence',
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        speed: { tokens: 75, per: { seconds: 1 } },
        latency: { milliseconds: 950 },
      },
      cash: {
        // .note = $2/$10 launched as introductory and BECAME the standard price;
        //   the scheduled rise to $3/$15 was cancelled. verified 2026-08-31.
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.20', by: 1_000_000 }), // $0.20/MTok cache read
          set: priceDivide({ of: '$2.50', by: 1_000_000 }), // $2.50/MTok cache write (5min)
        },
        input: priceDivide({ of: '$2', by: 1_000_000 }), // $2/MTok input
        output: priceDivide({ of: '$10', by: 1_000_000 }), // $10/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 82, mmlu: 91, humaneval: 95 }, // est
      cutoff: '2026-01-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_OPUS_V4_6: BrainConfig = {
  model: 'claude-opus-4-6',
  tokenizer: 'pre-4.7',
  // 128K max output; src: models/opus-4-6/overview
  maxOutput: { tokens: 128_000 },
  description: 'claude opus 4.6 - capable, 1M context, adaptive thought',
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        speed: { tokens: 30, per: { seconds: 1 } },
        latency: { milliseconds: 1500 },
      },
      cash: {
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.50', by: 1_000_000 }), // $0.50/MTok cache read
          set: priceDivide({ of: '$6.25', by: 1_000_000 }), // $6.25/MTok cache write (5min)
        },
        input: priceDivide({ of: '$5', by: 1_000_000 }), // $5/MTok input
        output: priceDivide({ of: '$25', by: 1_000_000 }), // $25/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 83, mmlu: 91, humaneval: 96 }, // est
      cutoff: '2025-05-01', // reliable; training data aug 2025
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_OPUS_V4_7: BrainConfig = {
  model: 'claude-opus-4-7',
  tokenizer: '4.7+',
  // 128K max output; src: models/opus-4-7/overview
  maxOutput: { tokens: 128_000 },
  description: 'claude opus 4.7 - capable, new tokenizer',
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        speed: { tokens: 32, per: { seconds: 1 } },
        latency: { milliseconds: 1500 },
      },
      cash: {
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.50', by: 1_000_000 }), // $0.50/MTok cache read
          set: priceDivide({ of: '$6.25', by: 1_000_000 }), // $6.25/MTok cache write (5min)
        },
        input: priceDivide({ of: '$5', by: 1_000_000 }), // $5/MTok input
        output: priceDivide({ of: '$25', by: 1_000_000 }), // $25/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 85, mmlu: 92, humaneval: 96 }, // est
      cutoff: '2026-01-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_OPUS_V4_8: BrainConfig = {
  model: 'claude-opus-4-8',
  tokenizer: '4.7+',
  // 128K max output; src: models/opus-4-8/overview
  maxOutput: { tokens: 128_000 },
  description: 'claude opus 4.8 - capable, complex agentic work',
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        speed: { tokens: 34, per: { seconds: 1 } },
        latency: { milliseconds: 1450 },
      },
      cash: {
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.50', by: 1_000_000 }), // $0.50/MTok cache read
          set: priceDivide({ of: '$6.25', by: 1_000_000 }), // $6.25/MTok cache write (5min)
        },
        input: priceDivide({ of: '$5', by: 1_000_000 }), // $5/MTok input
        output: priceDivide({ of: '$25', by: 1_000_000 }), // $25/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 87, mmlu: 92, humaneval: 97 }, // est
      cutoff: '2026-01-01',
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_OPUS_V5: BrainConfig = {
  model: 'claude-opus-5',
  tokenizer: '4.7+',
  // 128K max output; src: models/opus-5/overview
  maxOutput: { tokens: 128_000 },
  description: 'claude opus 5 - for complex agentic code and enterprise work',
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        speed: { tokens: 36, per: { seconds: 1 } },
        latency: { milliseconds: 1400 },
      },
      cash: {
        per: 'token',
        cache: {
          get: priceDivide({ of: '$0.50', by: 1_000_000 }), // $0.50/MTok cache read
          set: priceDivide({ of: '$6.25', by: 1_000_000 }), // $6.25/MTok cache write (5min)
        },
        input: priceDivide({ of: '$5', by: 1_000_000 }), // $5/MTok input
        output: priceDivide({ of: '$25', by: 1_000_000 }), // $25/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 89, mmlu: 93, humaneval: 97 }, // est
      cutoff: '2026-05-01', // the most recent cutoff in the lineup
      ...GAIN_UNIFORM,
    },
  },
};

const CONFIG_FABLE_V5: BrainConfig = {
  model: 'claude-fable-5',
  tokenizer: '4.7+',
  // 128K max output; src: models/fable-5/overview
  maxOutput: { tokens: 128_000 },
  description:
    'claude fable 5 - highest available capability, for long-running agents',
  // always on — fable cannot be asked to skip thought
  thought: { mode: 'adaptive', effort: 'high' },
  spec: {
    cost: {
      time: {
        // slowest of the lineup; thought is always on and cannot be turned off
        speed: { tokens: 22, per: { seconds: 1 } },
        latency: { milliseconds: 2200 },
      },
      cash: {
        per: 'token',
        cache: {
          get: priceDivide({ of: '$1', by: 1_000_000 }), // $1/MTok cache read
          set: priceDivide({ of: '$12.50', by: 1_000_000 }), // $12.50/MTok cache write (5min)
        },
        input: priceDivide({ of: '$10', by: 1_000_000 }), // $10/MTok input
        output: priceDivide({ of: '$50', by: 1_000_000 }), // $50/MTok output
      },
    },
    gain: {
      size: { context: { tokens: CONTEXT_TOKENS_FROM_V4_6 } },
      grades: { sweVer: 90, mmlu: 94, humaneval: 98 }, // est
      cutoff: '2026-01-01',
      ...GAIN_UNIFORM,
    },
  },
};

/**
 * .what = atom config by slug
 * .why = single source of truth for model configs, shared by atoms and repls
 */
export const CONFIG_BY_ATOM_SLUG: Record<AnthropicBrainAtomSlug, BrainConfig> =
  {
    // aliases — each tracks the newest rung of its tier, so each MOVES
    'claude/haiku': CONFIG_HAIKU_V4_5,
    'claude/sonnet': CONFIG_SONNET_V5,
    'claude/opus': CONFIG_OPUS_V5,
    'claude/fable': CONFIG_FABLE_V5,

    // pinned rungs — haiku
    'claude/haiku/v3.5': CONFIG_HAIKU_V3_5,
    'claude/haiku/v4.5': CONFIG_HAIKU_V4_5,

    // pinned rungs — sonnet (no v4.7 or v4.8; the vendor shipped neither)
    'claude/sonnet/v4': CONFIG_SONNET_V4,
    'claude/sonnet/v4.5': CONFIG_SONNET_V4_5,
    'claude/sonnet/v4.6': CONFIG_SONNET_V4_6,
    'claude/sonnet/v5': CONFIG_SONNET_V5,

    // pinned rungs — opus
    'claude/opus/v4': CONFIG_OPUS_V4,
    'claude/opus/v4.5': CONFIG_OPUS_V4_5,
    'claude/opus/v4.6': CONFIG_OPUS_V4_6,
    'claude/opus/v4.7': CONFIG_OPUS_V4_7,
    'claude/opus/v4.8': CONFIG_OPUS_V4_8,
    'claude/opus/v5': CONFIG_OPUS_V5,

    // pinned rungs — fable (starts at v5)
    'claude/fable/v5': CONFIG_FABLE_V5,
  };
