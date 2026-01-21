# brain.atom vs brain.repl

## .what

two distinct interfaces for llm interaction:

| interface | purpose | api |
|-----------|---------|-----|
| brain.atom | raw model access, single inference call | Anthropic Messages API |
| brain.repl | agentic loop with tool use and sandbox | Claude Agent SDK |

## .why

- **atom** = the atomic unit of llm interaction
  - one api call, one response
  - stateless, no memory of prior calls
  - supports all models (haiku, sonnet, opus, etc.)

- **repl** = read, execute, print, loop
  - leverages atoms within a loop to enable multistep thought and action
  - orchestrates multiple atom calls with tool execution between steps
  - provides sandboxed execution (read-only or workspace-write)

## .key relationship

repls are built on top of atoms:

```
repl.ask(prompt)
  └── loop until done:
        ├── atom.ask(prompt) → thought
        ├── execute tools based on thought
        └── feed results back into next atom call
```

the repl is not a different model — it's an orchestration layer that invokes the same base atom repeatedly, with tool results injected between calls.

## .architecture

```
brain.atom (Messages API)
├── claude-haiku-4-5, claude-3-5-haiku
├── claude-sonnet-4, claude-sonnet-4-5
└── claude-opus-4, claude-opus-4-5

brain.repl (Claude Agent SDK)
├── wraps atom with agentic loop
├── sandbox modes: read-only, workspace-write
└── reuses atom specs (no duplicate declarations)
```

## .key insight

the claude models are available via both:
1. **Messages API** - direct inference (atom)
2. **Claude Agent SDK** - agentic wrapper (repl)

the repl is not a different model - it's a different interaction pattern built on top of the same models.

## .refs

- messages api: https://docs.anthropic.com/en/api/messages
- claude agent sdk: https://github.com/anthropics/claude-code-sdk-python
