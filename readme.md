# rhachet-brains-anthropic

rhachet brain.atom and brain.repl adapter for anthropic

## install

```sh
npm install rhachet-brains-anthropic
```

## usage

```ts
import { genBrainAtom, genBrainRepl } from 'rhachet-brains-anthropic';
import { z } from 'zod';

// create a brain atom for direct model inference
const brainAtom = genBrainAtom({ slug: 'claude/sonnet' });

// simple string output
const { output: explanation } = await brainAtom.ask({
  role: { briefs: [] },
  prompt: 'explain this code',
  schema: { output: z.string() },
});

// structured object output
const { output: { summary, issues } } = await brainAtom.ask({
  role: { briefs: [] },
  prompt: 'analyze this code',
  schema: { output: z.object({ summary: z.string(), issues: z.array(z.string()) }) },
});

// create a brain repl for agentic tasks
const brainRepl = genBrainRepl({ slug: 'claude/code' });

// use ask() for read-only operations
const { output: { analysis } } = await brainRepl.ask({
  role: { briefs: [] },
  prompt: 'analyze this codebase',
  schema: { output: z.object({ analysis: z.string() }) },
});

// use act() for read+write operations
const { output: { proposal } } = await brainRepl.act({
  role: { briefs: [] },
  prompt: 'refactor this module',
  schema: { output: z.object({ proposal: z.string() }) },
});
```

## available brains

<!-- generated:brains:head -->

<!-- do NOT edit by hand. run `npm run fix:readme` to regenerate. -->

### atoms (via genBrainAtom)

stateless inference without tool use. uses the anthropic messages api with
structured outputs.

⚠️ **a bare alias MOVES.** `claude/opus` tracks the newest opus, so it crosses major
generations on your next `npm update`. pin a rung to freeze the `model` id. note the vendor
inverts this word: it calls a dateless id like `claude-opus-5` a pinned snapshot, not an alias.

⚠️ **a pinned rung freezes the model id, NOT the behavior — read two columns before you pin.**
`thought`: most rungs think by default, which raises output tokens per call; only `v4`, `v4.5` still
think on request, and they pay for it with a smaller context. `tokenizer`: a `4.7+` row counts
roughly 30% more tokens than a `pre-4.7` row for the same text, so a token budget or a
`metrics.size.tokens` comparison does not carry across that line.

| slug | model | rate ($/MTok in / out) | context | thought | tokenizer | cutoff | deprecated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `claude/haiku` | claude-haiku-4-5-20251001 | $1.00 / $5.00 | 200K | on request | pre-4.7 | 2025-02-01 | — |
| `claude/haiku/v3.5` | claude-3-5-haiku-20241022 | $0.80 / $4.00 | 200K | none | pre-4.7 | 2024-04-01 | 🪦 2026-02-19 → `claude/haiku/v4.5` |
| `claude/haiku/v4.5` | claude-haiku-4-5-20251001 | $1.00 / $5.00 | 200K | on request | pre-4.7 | 2025-02-01 | — |
| `claude/sonnet` | claude-sonnet-5 | $2.00 / $10.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/sonnet/v4` | claude-sonnet-4-20250514 | $3.00 / $15.00 | 200K | on request | pre-4.7 | 2025-04-01 | 🪦 2026-06-15 → `claude/sonnet/v5` |
| `claude/sonnet/v4.5` | claude-sonnet-4-5-20250929 | $3.00 / $15.00 | 200K | on request | pre-4.7 | 2025-01-01 | — |
| `claude/sonnet/v4.6` | claude-sonnet-4-6 | $3.00 / $15.00 | 1M | by default (effort: high) | pre-4.7 | 2025-08-01 | — |
| `claude/sonnet/v5` | claude-sonnet-5 | $2.00 / $10.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/opus` | claude-opus-5 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-05-01 | — |
| `claude/opus/v4` | claude-opus-4-20250514 | $15.00 / $75.00 | 200K | on request | pre-4.7 | 2025-04-01 | 🪦 2026-06-15 → `claude/opus/v5` |
| `claude/opus/v4.5` | claude-opus-4-5-20251101 | $5.00 / $25.00 | 200K | on request | pre-4.7 | 2025-05-01 | — |
| `claude/opus/v4.6` | claude-opus-4-6 | $5.00 / $25.00 | 1M | by default (effort: high) | pre-4.7 | 2025-05-01 | — |
| `claude/opus/v4.7` | claude-opus-4-7 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/opus/v4.8` | claude-opus-4-8 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/opus/v5` | claude-opus-5 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-05-01 | — |
| `claude/fable` | claude-fable-5 | $10.00 / $50.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/fable/v5` | claude-fable-5 | $10.00 / $50.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |

### repls (via genBrainRepl)

agentic code assistant with tool use via claude-agent-sdk. repl slugs mirror the atom
ladder rung for rung and reuse its configs.

⚠️ **the bare `claude/code` MOVES too.** it rides the newest sonnet, so the default repl
changes model across a version bump just as `claude/sonnet` does. pin `claude/code/sonnet/v4.5`
to freeze it.

| slug | model | rate ($/MTok in / out) | context | thought | tokenizer | cutoff | deprecated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `claude/code` | claude-sonnet-5 | $2.00 / $10.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/code/haiku` | claude-haiku-4-5-20251001 | $1.00 / $5.00 | 200K | on request | pre-4.7 | 2025-02-01 | — |
| `claude/code/haiku/v3.5` | claude-3-5-haiku-20241022 | $0.80 / $4.00 | 200K | none | pre-4.7 | 2024-04-01 | 🪦 2026-02-19 → `claude/code/haiku/v4.5` |
| `claude/code/haiku/v4.5` | claude-haiku-4-5-20251001 | $1.00 / $5.00 | 200K | on request | pre-4.7 | 2025-02-01 | — |
| `claude/code/sonnet` | claude-sonnet-5 | $2.00 / $10.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/code/sonnet/v4` | claude-sonnet-4-20250514 | $3.00 / $15.00 | 200K | on request | pre-4.7 | 2025-04-01 | 🪦 2026-06-15 → `claude/code/sonnet/v5` |
| `claude/code/sonnet/v4.5` | claude-sonnet-4-5-20250929 | $3.00 / $15.00 | 200K | on request | pre-4.7 | 2025-01-01 | — |
| `claude/code/sonnet/v4.6` | claude-sonnet-4-6 | $3.00 / $15.00 | 1M | by default (effort: high) | pre-4.7 | 2025-08-01 | — |
| `claude/code/sonnet/v5` | claude-sonnet-5 | $2.00 / $10.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/code/opus` | claude-opus-5 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-05-01 | — |
| `claude/code/opus/v4` | claude-opus-4-20250514 | $15.00 / $75.00 | 200K | on request | pre-4.7 | 2025-04-01 | 🪦 2026-06-15 → `claude/code/opus/v5` |
| `claude/code/opus/v4.5` | claude-opus-4-5-20251101 | $5.00 / $25.00 | 200K | on request | pre-4.7 | 2025-05-01 | — |
| `claude/code/opus/v4.6` | claude-opus-4-6 | $5.00 / $25.00 | 1M | by default (effort: high) | pre-4.7 | 2025-05-01 | — |
| `claude/code/opus/v4.7` | claude-opus-4-7 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/code/opus/v4.8` | claude-opus-4-8 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/code/opus/v5` | claude-opus-5 | $5.00 / $25.00 | 1M | by default (effort: high) | 4.7+ | 2026-05-01 | — |
| `claude/code/fable` | claude-fable-5 | $10.00 / $50.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |
| `claude/code/fable/v5` | claude-fable-5 | $10.00 / $50.00 | 1M | by default (effort: high) | 4.7+ | 2026-01-01 | — |

### deprecated rungs

a 🪦 rung is retired on the **first-party** Claude API but still served on a partner
platform. it stays registered because a caller who injects their own client
(`context.anthropic`) can still reach it. on the default client it will not serve you —
so read the reason before you pin one:

⚠️ **on the repl ladder, one of these does not fail — it answers with a DIFFERENT model.**
`claude/code/opus/v4` is accepted by claude-agent-sdk, which then quietly runs
`claude-opus-5` and replies as though the pin were honored. we catch it —
`asUsageFromModelUsage` refuses token usage for a model we did not request — so you get an
error rather than a wrong answer at a wrong price. but that guard is ours, not the sdk's.
the other two repl rungs below refuse loudly at the sdk. verified live in
`BrainRepl.slugReach.integration.test.ts`.

- `claude/haiku/v3.5` — retired on the first-party Claude API. still served on Amazon Bedrock and Google Cloud, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.
- `claude/sonnet/v4` — retired on the first-party Claude API. still served on Amazon Bedrock and Google Cloud, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.
- `claude/opus/v4` — retired on the first-party Claude API. still served on Google Cloud ONLY, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.
- `claude/code/haiku/v3.5` — retired on the first-party Claude API. still served on Amazon Bedrock and Google Cloud, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.
- `claude/code/sonnet/v4` — retired on the first-party Claude API. still served on Amazon Bedrock and Google Cloud, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.
- `claude/code/opus/v4` — retired on the first-party Claude API. still served on Google Cloud ONLY, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.

<!-- generated:brains:foot -->

## episode continuation

rhachet supports multi-turn conversations via episode continuation. each brain output includes an `episode` that can be passed back to continue the conversation.

### atoms (supported)

atoms support episode continuation for cross-supplier workflows. prior exchanges are injected as actual user/assistant messages.

```ts
const brainAtom = genBrainAtom({ slug: 'claude/sonnet' });

// first turn
const resultFirst = await brainAtom.ask({
  role: {},
  prompt: 'remember this code: MANGO77',
  schema: { output: z.object({ content: z.string() }) },
});

// continue the conversation
const resultSecond = await brainAtom.ask({
  on: { episode: resultFirst.episode },
  role: {},
  prompt: 'what was the code i told you to remember?',
  schema: { output: z.object({ content: z.string() }) },
});
// resultSecond.output.content contains "MANGO77"
```

**limitations:**
- haiku does not honor continuation — `genBrainAtom` throws `BadRequestError` rather than let the
  call through. ⚠️ the guard is not cosmetic: with it disabled the call **succeeds** and haiku
  replies that it cannot recall prior turns, so the failure is silent, not loud
- use sonnet, opus, or fable for continuation workflows

### repls (not supported)

repls do **not** support episode continuation due to claude-agent-sdk limitations:
1. session resumption doesn't work with structured outputs (returns plain text)
2. cross-supplier continuation requires message injection which the sdk doesn't support

```ts
const brainRepl = genBrainRepl({ slug: 'claude/code' });

// this will throw BadRequestError
await brainRepl.ask({
  on: { episode: someEpisode }, // ❌ not supported
  role: {},
  prompt: 'continue...',
  schema: { output: z.object({ content: z.string() }) },
});
```

repls still **export** episode/series data for tracking and audit purposes. the `episode.exid` contains session info in the format `anthropic/claude-agent-sdk/{machineHash}/{sessionId}`.

### summary

| brain | continuation | notes |
| --- | --- | --- |
| atom (sonnet) | ✅ supported | use `on: { episode }` to continue |
| atom (opus) | ✅ supported | use `on: { episode }` to continue |
| atom (fable) | ✅ supported | use `on: { episode }` to continue |
| atom (haiku) | ❌ not supported | throws `BadRequestError` |
| repl (all) | ❌ not supported | throws `BadRequestError` |

every ✅ above is backed by a live multi-turn call that **recalls the prior turn**, not merely by a
call that returns — see `genBrainAtom.integration.test.ts`. that distinction matters: haiku returns
fine and silently drops the context, which is why it is guarded rather than left to the caller.

for a workflow that needs continuation, use `genBrainAtom` with sonnet, opus, or fable.

## sources

- [anthropic api documentation](https://docs.anthropic.com/en/api/)
- [claude-agent-sdk documentation](https://docs.anthropic.com/en/docs/claude-agent-sdk)
