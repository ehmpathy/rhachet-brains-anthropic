import type { BrainAtom, BrainRepl } from 'rhachet';

import { genBrainAtom } from '../../domain.operations/atoms/genBrainAtom';
import { ANTHROPIC_BRAIN_ATOM_SLUGS } from '../../domain.operations/brains/BrainAtom.config';
import { ANTHROPIC_BRAIN_REPL_SLUGS } from '../../domain.operations/brains/BrainRepl.config';
import { genBrainRepl } from '../../domain.operations/repls/genBrainRepl';

/**
 * .what = returns all brain atoms provided by anthropic
 * .why = enables consumers to register anthropic atoms with genContextBrain
 *
 * .note = derived from the declared slug list, so every declared slug is registered.
 *   rhachet discovers only what this RETURNS, so a hand-kept list here would leave a
 *   declared slug invisible to `rhx review --brain` with no compile error to catch it.
 *
 * .note = registration is cheap — each call is a config lookup plus one object. the
 *   Anthropic client is built lazily inside `ask`, so this needs no api key and
 *   touches no network.
 */
export const getBrainAtomsByAnthropic = (): BrainAtom[] => {
  return ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) => genBrainAtom({ slug }));
};

/**
 * .what = returns all brain repls provided by anthropic
 * .why = enables consumers to register anthropic repls with genContextBrain
 * .note = derived from the declared slug list, for the reasons above
 */
export const getBrainReplsByAnthropic = (): BrainRepl[] => {
  return ANTHROPIC_BRAIN_REPL_SLUGS.map((slug) => genBrainRepl({ slug }));
};

// re-export factories for direct access
export { genBrainAtom } from '../../domain.operations/atoms/genBrainAtom';
export { genBrainHooksAdapterForClaudeCode } from '../../domain.operations/hooks/genBrainHooksAdapterForClaudeCode';
// brain hooks adapter for claude code
export { getBrainHooks } from '../../domain.operations/hooks/getBrainHooks';
export { genBrainRepl } from '../../domain.operations/repls/genBrainRepl';
