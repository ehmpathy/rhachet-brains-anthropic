import type { BrainAtom, BrainRepl } from 'rhachet';

import { genBrainAtom } from '../../domain.operations/atoms/genBrainAtom';
import { genBrainRepl } from '../../domain.operations/repls/genBrainRepl';

/**
 * .what = returns all brain atoms provided by anthropic
 * .why = enables consumers to register anthropic atoms with genContextBrain
 */
export const getBrainAtomsByAnthropic = (): BrainAtom[] => {
  return [
    genBrainAtom({ slug: 'claude/haiku' }),
    genBrainAtom({ slug: 'claude/sonnet' }),
    genBrainAtom({ slug: 'claude/opus' }),
  ];
};

/**
 * .what = returns all brain repls provided by anthropic
 * .why = enables consumers to register anthropic repls with genContextBrain
 */
export const getBrainReplsByAnthropic = (): BrainRepl[] => {
  return [
    genBrainRepl({ slug: 'claude/code' }),
    genBrainRepl({ slug: 'claude/code/haiku' }),
    genBrainRepl({ slug: 'claude/code/sonnet' }),
    genBrainRepl({ slug: 'claude/code/opus' }),
  ];
};

// re-export factories for direct access
export { genBrainAtom } from '../../domain.operations/atoms/genBrainAtom';
export { genBrainRepl } from '../../domain.operations/repls/genBrainRepl';
