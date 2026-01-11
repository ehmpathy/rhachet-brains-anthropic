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
const response = await brainAtom.ask({
  role: { briefs: [] },
  prompt: 'explain this code',
  schema: { output: z.string() },
});

// structured object output
const result = await brainAtom.ask({
  role: { briefs: [] },
  prompt: 'analyze this code',
  schema: { output: z.object({ summary: z.string(), issues: z.array(z.string()) }) },
});

// create a brain repl for agentic tasks
const brainRepl = genBrainRepl({ slug: 'claude/code' });

// use ask() for read-only operations
const analysis = await brainRepl.ask({
  role: { briefs: [] },
  prompt: 'analyze this codebase',
  schema: { output: z.object({ content: z.string() }) },
});

// use act() for read+write operations
const refactor = await brainRepl.act({
  role: { briefs: [] },
  prompt: 'refactor this module',
  schema: { output: z.object({ content: z.string() }) },
});
```

## available brains

### atoms (via genBrainAtom)

stateless inference without tool use. uses anthropic api with structured outputs.

| slug                 | model                      | description                         |
| -------------------- | -------------------------- | ----------------------------------- |
| `claude/haiku`       | claude-haiku-4-5-20251001  | fastest and most cost-effective     |
| `claude/haiku/v3.5`  | claude-3-5-haiku-20241022  | fast and cost-effective             |
| `claude/haiku/v4.5`  | claude-haiku-4-5-20251001  | fastest and most cost-effective     |
| `claude/sonnet`      | claude-sonnet-4-5-20250929 | balanced performance and capability |
| `claude/sonnet/v4`   | claude-sonnet-4-20250514   | balanced performance and capability |
| `claude/sonnet/v4.5` | claude-sonnet-4-5-20250929 | balanced performance and capability |
| `claude/opus`        | claude-opus-4-5-20251101   | most capable for complex tasks      |
| `claude/opus/v4`     | claude-opus-4-20250514     | highly capable for complex tasks    |
| `claude/opus/v4.5`   | claude-opus-4-5-20251101   | most capable for complex tasks      |

### repls (via genBrainRepl)

agentic code assistant with tool use via claude-agent-sdk.

| slug                      | model                      | description                         |
| ------------------------- | -------------------------- | ----------------------------------- |
| `claude/code`             | sdk default                | uses claude-agent-sdk default model |
| `claude/code/haiku`       | claude-haiku-4-5-20251001  | fast and cost-effective agent       |
| `claude/code/haiku/v4.5`  | claude-haiku-4-5-20251001  | fast and cost-effective agent       |
| `claude/code/sonnet`      | claude-sonnet-4-5-20250929 | balanced agentic capability         |
| `claude/code/sonnet/v4`   | claude-sonnet-4-20250514   | balanced agentic capability         |
| `claude/code/sonnet/v4.5` | claude-sonnet-4-5-20250929 | balanced agentic capability         |
| `claude/code/opus`        | claude-opus-4-20250514     | high capability agent               |
| `claude/code/opus/v4.5`   | claude-opus-4-5-20251101   | most capable agent                  |

## sources

- [anthropic api documentation](https://docs.anthropic.com/en/api/)
- [claude-agent-sdk documentation](https://docs.anthropic.com/en/docs/claude-agent-sdk)
