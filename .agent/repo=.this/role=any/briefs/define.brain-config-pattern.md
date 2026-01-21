# brain config pattern

## .what

standardized pattern for brain atom and repl configuration:

| file | export | purpose |
|------|--------|---------|
| `BrainAtom.config.ts` | `CONFIG_BY_ATOM_SLUG` | maps atom slugs to model configs |
| `BrainRepl.config.ts` | `CONFIG_BY_REPL_SLUG` | maps repl slugs to atom configs |

## .why

- **single source of truth** — specs declared once in atom config, reused by repls
- **explicit relationships** — repl config declares exactly which atom it uses
- **type safety** — slug types enforce valid mappings at compile time

## .structure

### atom config (`BrainAtom.config.ts`)

```ts
export type AnthropicBrainAtomSlug =
  | 'claude/haiku'
  | 'claude/haiku/v4.5'
  | 'claude/sonnet'
  | 'claude/sonnet/v4.5'
  | 'claude/opus'
  | 'claude/opus/v4.5';

export type BrainAtomConfig = {
  model: string;
  description: string;
  spec: BrainSpec;
};

export const CONFIG_BY_ATOM_SLUG: Record<AnthropicBrainAtomSlug, BrainAtomConfig> = {
  'claude/sonnet/v4.5': {
    model: 'claude-sonnet-4-5-20250929',
    description: 'claude sonnet 4.5 - balanced performance and capability',
    spec: { ... },
  },
  // ...
};
```

### repl config (`BrainRepl.config.ts`)

```ts
import {
  type BrainAtomConfig,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

export type AnthropicBrainReplSlug =
  | 'claude/code'
  | 'claude/code/haiku'
  | 'claude/code/sonnet'
  | 'claude/code/opus';

/**
 * .what = repl config by slug
 * .why = maps repl slugs to atom configs (reuses specs from CONFIG_BY_ATOM_SLUG)
 */
export const CONFIG_BY_REPL_SLUG: Record<AnthropicBrainReplSlug, BrainAtomConfig> = {
  'claude/code': CONFIG_BY_ATOM_SLUG['claude/sonnet'],
  'claude/code/haiku': CONFIG_BY_ATOM_SLUG['claude/haiku'],
  'claude/code/sonnet': CONFIG_BY_ATOM_SLUG['claude/sonnet'],
  'claude/code/opus': CONFIG_BY_ATOM_SLUG['claude/opus'],
};
```

## .slug conventions

### atom slugs (explicit)

format: `{repo}/{family}/{version?}`

examples:
- `claude/haiku` → alias to latest haiku
- `claude/haiku/v3.5` → specific version
- `claude/haiku/v4.5` → specific version
- `claude/sonnet/v4` → specific version
- `claude/sonnet/v4.5` → specific version
- `claude/opus/v4.5` → specific version

### repl slugs (aliases)

format: `{repo}/{capability}/{variant?}`

examples:
- `claude/code` → default claude code (sonnet)
- `claude/code/haiku` → fast + cheap variant
- `claude/code/sonnet` → balanced variant
- `claude/code/opus` → highest quality variant

## .key insight

repl slugs are **aliases** that map to **explicit atom slugs**:

```ts
// repl slug → atom slug → config
'claude/code' → 'claude/sonnet' → { model, description, spec }
'claude/code/opus' → 'claude/opus' → { model, description, spec }
```

this enables:
- simpler repl slugs for common use cases
- explicit atom slugs for precise model selection
- shared specs between atoms and repls (no duplication)

## .name conventions

| constant | scope | content |
|----------|-------|---------|
| `CONFIG_BY_ATOM_SLUG` | atom file | atom slug → config |
| `CONFIG_BY_REPL_SLUG` | repl file | repl slug → atom config |
| `AnthropicBrainAtomSlug` | type | union of valid atom slugs |
| `AnthropicBrainReplSlug` | type | union of valid repl slugs |
| `BrainAtomConfig` | type | shape of config object |
