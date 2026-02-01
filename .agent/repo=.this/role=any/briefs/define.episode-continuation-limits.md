# episode continuation limits

## .what

episode continuation allows multi-turn conversations by passing `on: { episode }` to continue from a prior exchange. support varies by brain type.

## .version

applies as of `rhachet-brains-anthropic@0.3.2`

## .support matrix

| brain | continuation | fail-fast |
|-------|-------------|-----------|
| atom (sonnet, opus) | ✅ supported | - |
| atom (haiku) | ❌ not supported | `BadRequestError` |
| repl (all) | ❌ not supported | `BadRequestError` |

## .why atoms work (sonnet, opus)

atoms use the anthropic messages api directly. continuation is implemented by:
1. extracting prior `episode.exchanges`
2. building a messages array with user/assistant pairs
3. appending the new prompt as the final user message

this works because we control the full message array.

## .why atoms fail (haiku)

haiku does not support episode continuation when using structured outputs (`output_format`). the api returns an error when combining:
- `betas: ['structured-outputs-2025-11-13']`
- multi-turn message history

this is an anthropic api limitation, not a library limitation.

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

for workflows requiring continuation, use `genBrainAtom` with sonnet or opus:

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
