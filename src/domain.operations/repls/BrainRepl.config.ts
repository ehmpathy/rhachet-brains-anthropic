import {
  type BrainAtomConfig,
  CONFIG_BY_ATOM_SLUG,
} from '../atoms/BrainAtom.config';

/**
 * .what = supported claude code repl slugs
 * .why = enables type-safe slug specification with model variants
 */
export type AnthropicBrainReplSlug =
  | 'claude/code'
  | 'claude/code/haiku'
  | 'claude/code/haiku/v4.5'
  | 'claude/code/sonnet'
  | 'claude/code/sonnet/v4'
  | 'claude/code/sonnet/v4.5'
  | 'claude/code/opus'
  | 'claude/code/opus/v4.5';

/**
 * .what = repl config by slug
 * .why = maps repl slugs to atom configs (reuses specs from CONFIG_BY_ATOM_SLUG)
 */
export const CONFIG_BY_REPL_SLUG: Record<
  AnthropicBrainReplSlug,
  BrainAtomConfig
> = {
  'claude/code': CONFIG_BY_ATOM_SLUG['claude/sonnet'],
  'claude/code/haiku': CONFIG_BY_ATOM_SLUG['claude/haiku'],
  'claude/code/haiku/v4.5': CONFIG_BY_ATOM_SLUG['claude/haiku/v4.5'],
  'claude/code/sonnet': CONFIG_BY_ATOM_SLUG['claude/sonnet'],
  'claude/code/sonnet/v4': CONFIG_BY_ATOM_SLUG['claude/sonnet/v4'],
  'claude/code/sonnet/v4.5': CONFIG_BY_ATOM_SLUG['claude/sonnet/v4.5'],
  'claude/code/opus': CONFIG_BY_ATOM_SLUG['claude/opus'],
  'claude/code/opus/v4.5': CONFIG_BY_ATOM_SLUG['claude/opus/v4.5'],
};
