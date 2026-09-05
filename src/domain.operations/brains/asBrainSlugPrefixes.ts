/**
 * .what = the prefix an atom slug carries, and the prefix its repl twin carries
 * .why = the `claude/` → `claude/code/` transform was written out at three separate
 *   call sites. a change to the slug scheme would have needed all three found and
 *   changed in lockstep, with no guard to catch a miss.
 *
 * .note = these live in `brains/` rather than in `atoms/`, because the PAIR is the
 *   point: one names the atom ladder and one names the repl ladder, so neither
 *   subdomain owns both. declared inside `atoms/`, they made `repls/` reach sideways
 *   for the name of its OWN prefix — the reach-in `rule.forbid.scope-leaks` names, and
 *   the lift `rule.prefer.most-common-denominator` prescribes once reuse is proven
 *   rather than speculative. the readers are `asReplSlugFromAtomSlug` and
 *   `BrainRepl.config` here in `brains/`, plus `BrainRepl.mirror.test` in `repls/`.
 */
export const PREFIX_SLUG_ATOM = 'claude/';
export const PREFIX_SLUG_REPL = 'claude/code/';
