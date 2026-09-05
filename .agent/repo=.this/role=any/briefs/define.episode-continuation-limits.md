# episode continuation limits

## .what

episode continuation allows multi-turn conversations by passing `on: { episode }` to continue from a prior exchange. support varies by brain type.

## .version

applies as of `rhachet-brains-anthropic@0.3.2`

## .support matrix

| brain | continuation | fail-fast |
|-------|-------------|-----------|
| atom (sonnet, opus, fable) | ✅ supported | - |
| atom (haiku) | ❌ not supported | `BadRequestError` |
| repl (all) | ❌ not supported | `BadRequestError` |

every ✅ row is backed by a live multi-turn call that **recalls the prior turn**, not merely by a
call that returns. that distinction is the whole point: haiku (below) returns fine and silently
drops the context, so "it did not throw" proves little on its own.

fable is clamped by `genBrainAtom.integration.test.ts` `[case5]`, which asserts recall of a code
planted one turn earlier. it reaches the guard the same way sonnet and opus do — the guard reads
the TIER off the slug (`asAtomSlugParts({ slug }).tier === 'haiku'`), and fable's tier is not
haiku — so it was the one tier the sonnet/opus/haiku cases left uncovered until that clamp landed.

## .how the guard decides

the guard derives the tier from OUR slug, never from the vendor's model id:

```ts
if (askInput.on?.episode && asAtomSlugParts({ slug: input.slug }).tier === 'haiku')
```

⚠️ **it used to sniff `config.model.includes('haiku')`, and that form is a trap.** the two agree on
today's ladder, so no test could tell them apart — the hazard was never a wrong answer today. it is
that a vendor rename which drops the tier word from a haiku id would leave the line untouched and
silently stop the match. and because haiku's failure is SILENT (see below), the guard would flip
from a loud refusal to a confident wrong answer with no code change at all.

the slug is ours, so it cannot drift out from under this check.
`BrainAtom.continuation.test.ts` `[case2]` sweeps the whole registered ladder and splits it by
tier, so a new rung joins the correct side on its own.

## .why atoms work (sonnet, opus, fable)

atoms use the anthropic messages api directly. continuation runs three steps:
1. read the prior `episode.exchanges`
2. expand them into a messages array of user/assistant pairs
3. append the new prompt as the final user message

step 2 has a name in the code: `asMessagesFromEpisode`. it is a named transformer rather than
an inline expansion, so its **three** edge shapes are unit-clamped — see
`asMessagesFromEpisode.test.ts`:

| case | edge shape |
|---|---|
| `[case3]` | a tool turn that arrives as a json string |
| `[case4]` | a `[`-prefixed plain string that is NOT json |
| `[case5]` | a **truncated** tool turn, told apart from case4's prose |

⚠️ this brief once said "two", and omitted the truncation case — so a reader concluded the
guard this file is most careful about was uncovered. case4 and case5 are a PAIR: they differ by
one fact (whether a `{` follows the bracket), which is what proves the guard discriminates
rather than merely fires.

this works because we control the full message array.

## .why atoms fail (haiku)

haiku does not honor episode continuation. `genBrainAtom` fail-fasts rather than let the
call through.

⚠️ **the failure mode changed, and it got worse.** the original cause was an api error from
the beta combination `betas: ['structured-outputs-2025-11-13']` plus a multi-turn message
history. structured outputs left beta, that header is no longer sent, and that error no
longer occurs.

verified 2026-08-31 with the guard disabled: the call now **succeeds**, and haiku replies
*"I don't have the ability to retain information from previous conversations"* — it does not
use the prior turns. so the failure moved from **loud to silent**: a caller would receive a
confident, wrong answer instead of an error.

that makes the guard more necessary, not less (`rule.forbid.failhide`).

⚠️ **do NOT remove the guard on the grounds that the beta header is gone.** that argument
looks correct and is not; it was checked against the live api, and the guard survives it.

## .why repls fail (all models)

repls use claude-agent-sdk which has two blocking limitations:

1. **session resumption + structured outputs incompatible**
   - when resuming a session with `resume: sessionId`
   - the sdk ignores `outputFormat` and returns plain text
   - this breaks our contract which requires json output

2. **no message injection**
   - the sdk only supports session-based continuation via `resume: sessionId`
   - sessions are stored locally at `~/.claude/projects/`
   - cross-supplier continuation requires injecting prior messages, which the sdk doesn't support

## .workaround

for a workflow that needs continuation, use `genBrainAtom` with sonnet, opus, or fable:

```ts
const brainAtom = genBrainAtom({ slug: 'claude/sonnet' });

const result1 = await brainAtom.ask({ ... });
const result2 = await brainAtom.ask({ on: { episode: result1.episode }, ... });
```

## .future

repls still export `episode.exid` in format `anthropic/claude-agent-sdk/{machineHash}/{sessionId}` for:
- tracking and audit purposes
- potential future support if sdk improves

if anthropic adds message injection or fixes structured outputs with session resumption, repl continuation can be enabled.
