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

### atoms (via genBrainAtom)

stateless inference without tool use. uses anthropic messages api with structured outputs.

| slug | model | cost ($/MTok) | cutoff | description |
| --- | --- | --- | --- | --- |
| `claude/haiku` | claude-haiku-4-5-20251001 | $1 / $5 | 2025-04 | fastest and most cost-effective |
| `claude/haiku/v3.5` | claude-3-5-haiku-20241022 | $0.80 / $4 | 2024-04 | fast and cost-effective |
| `claude/haiku/v4.5` | claude-haiku-4-5-20251001 | $1 / $5 | 2025-04 | fastest and most cost-effective |
| `claude/sonnet` | claude-sonnet-4-5-20250929 | $3 / $15 | 2025-04 | balanced performance and capability |
| `claude/sonnet/v4` | claude-sonnet-4-20250514 | $3 / $15 | 2025-04 | balanced performance and capability |
| `claude/sonnet/v4.5` | claude-sonnet-4-5-20250929 | $3 / $15 | 2025-04 | balanced performance and capability |
| `claude/opus` | claude-opus-4-5-20251101 | $5 / $25 | 2025-05 | most capable for complex reasoning |
| `claude/opus/v4` | claude-opus-4-20250514 | $15 / $75 | 2025-04 | highly capable for complex reasoning |
| `claude/opus/v4.5` | claude-opus-4-5-20251101 | $5 / $25 | 2025-05 | most capable for complex reasoning |

### repls (via genBrainRepl)

agentic code assistant with tool use via claude-agent-sdk. repl slugs map to atom configs.

| slug | atom | cost ($/MTok) | cutoff | description |
| --- | --- | --- | --- | --- |
| `claude/code` | `claude/sonnet` | $3 / $15 | 2025-04 | balanced agentic capability |
| `claude/code/haiku` | `claude/haiku` | $1 / $5 | 2025-04 | fast and cost-effective agent |
| `claude/code/haiku/v4.5` | `claude/haiku/v4.5` | $1 / $5 | 2025-04 | fast and cost-effective agent |
| `claude/code/sonnet` | `claude/sonnet` | $3 / $15 | 2025-04 | balanced agentic capability |
| `claude/code/sonnet/v4` | `claude/sonnet/v4` | $3 / $15 | 2025-04 | balanced agentic capability |
| `claude/code/sonnet/v4.5` | `claude/sonnet/v4.5` | $3 / $15 | 2025-04 | balanced agentic capability |
| `claude/code/opus` | `claude/opus` | $5 / $25 | 2025-05 | most capable agent |
| `claude/code/opus/v4.5` | `claude/opus/v4.5` | $5 / $25 | 2025-05 | most capable agent |

## sources

- [anthropic api documentation](https://docs.anthropic.com/en/api/)
- [claude-agent-sdk documentation](https://docs.anthropic.com/en/docs/claude-agent-sdk)
