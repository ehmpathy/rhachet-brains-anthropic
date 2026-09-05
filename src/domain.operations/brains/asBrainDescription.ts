import { asDeprecatedReason } from './asDeprecatedReason';
import type { BrainPlatform } from './BrainAtom.config';

/**
 * .what = composes the description a consumer reads off the brain object it holds
 * .why = `deprecated` was known only inside the config. a caller who iterated
 *   `getBrainAtomsByAnthropic()` — rhachet's own `rhx review --brain` discovery does
 *   exactly that — held a `BrainAtom` with no signal that its rung is retired, and a
 *   `BrainRepl` caller held even less. the readme carried the mark, but a docs artifact
 *   is not the boundary contract.
 * .note = rhachet's `BrainAtom` / `BrainRepl` declare no field for deprecation, so the
 *   description is the one surface that crosses. a structured field belongs in the
 *   rhachet contract; until then this keeps the fact from a dead end in our config.
 * .note = `replacedBy` is a plain string, and the caller supplies it, because the
 *   pointer must name a slug in the READER's namespace — a repl caller cannot call
 *   `genBrainRepl({ slug: 'claude/opus/v5' })`.
 *
 * .note = it takes `platforms` and derives the sentence itself, rather than take a
 *   ready-made `reason`. that keeps the derivation on ONE side of the atom/repl
 *   split: a `reason` parameter would have let the two twins word the same vendor
 *   fact differently, which is the twin asymmetry this build hit repeatedly.
 */
export const asBrainDescription = (input: {
  base: string;
  deprecated: null | {
    since: string;
    platforms: BrainPlatform[];
    replacedBy: string;
  };
}): string => {
  if (!input.deprecated) return input.base;
  const { since, platforms, replacedBy } = input.deprecated;
  const reason = asDeprecatedReason({ platforms });
  return `${input.base} ⚠️ deprecated ${since}: ${reason} use \`${replacedBy}\` instead.`;
};
