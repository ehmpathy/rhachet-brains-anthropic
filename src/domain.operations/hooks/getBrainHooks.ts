import type { BrainHooksAdapter, BrainSpecifier } from 'rhachet';

import { genBrainHooksAdapterForClaudeCode } from './genBrainHooksAdapterForClaudeCode';

/**
 * .what = supported brain specifiers for claude code adapter
 * .why = enables lookup by multiple aliases
 */
const SUPPORTED_SPECIFIERS: BrainSpecifier[] = [
  'claude',
  'claude-code',
  'anthropic/claude/code',
];

/**
 * .what = returns brain hooks adapter for specified brain
 * .why = supplier contract for rhachet to discover adapters
 *
 * .note = currently only supports claude-code brain
 */
export const getBrainHooks = (input: {
  brain: BrainSpecifier;
  repoPath: string;
}): BrainHooksAdapter | null => {
  const { brain, repoPath } = input;

  // check if this supplier supports the requested brain
  if (SUPPORTED_SPECIFIERS.includes(brain)) {
    return genBrainHooksAdapterForClaudeCode({ repoPath });
  }

  // this supplier does not support the requested brain
  return null;
};
