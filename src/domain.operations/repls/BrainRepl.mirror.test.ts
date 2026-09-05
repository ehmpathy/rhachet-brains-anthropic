import { given, then, when } from 'test-fns';

import {
  PREFIX_SLUG_ATOM,
  PREFIX_SLUG_REPL,
} from '../brains/asBrainSlugPrefixes';
import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';
import {
  ANTHROPIC_BRAIN_REPL_SLUGS,
  CONFIG_BY_REPL_SLUG,
} from '../brains/BrainRepl.config';

/**
 * .what = clamps the atom↔repl mirror, which `BrainRepl.config` states in prose and
 *   no test enforced
 * .why = the full mirror is a human ruling (F10: "mirror the ladder fully"), chosen so
 *   a contributor follows ONE rule rather than a set of exceptions — the prior partial
 *   mirror had sonnet v4 with a twin and opus v4 without, for no reason.
 *
 * .note = a ruling with no clamp decays quietly. the type system cannot help: the two
 *   slug unions are declared independently, so an atom slug added with no twin
 *   type-checks, registers, and ships.
 *
 * .note = and the one guard that WOULD catch it is too narrow to rely on.
 *   `asReplSlugFromAtomSlug` throws on an absent twin, but it only runs for a
 *   DEPRECATED rung — so a current slug with no twin sails past it silently.
 *
 * ⚠️ the failure this forecloses is easy to walk into, because it looks like the
 *   RIGHT move. the ladder is deliberately ragged — a contributor is told not to
 *   invent `claude/sonnet/v4.7` to fill a gap. "skip the repl twin as well" reads
 *   like the same restraint and is the opposite: the gaps are the vendor's, the
 *   mirror is ours.
 */
describe('BrainRepl mirror of the atom ladder', () => {
  given('[case1] the shipped atom and repl ladders', () => {
    when('[t0] each atom slug is mapped to its repl twin', () => {
      const twinsExpected = ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) =>
        slug.replace(PREFIX_SLUG_ATOM, PREFIX_SLUG_REPL),
      );

      then('every atom slug has a repl twin', () => {
        for (const twin of twinsExpected) {
          expect(ANTHROPIC_BRAIN_REPL_SLUGS).toContain(twin);
        }
      });

      then(
        'no repl slug lacks an atom counterpart, beyond the bare default',
        () => {
          // .note = `claude/code` is the one intentional extra — the bare repl entry
          //   point, which has no atom equivalent because atoms have no bare slug.
          //   it maps to sonnet by ruling F14, asserted in the registry test.
          const orphans = ANTHROPIC_BRAIN_REPL_SLUGS.filter(
            (slug) => slug !== 'claude/code' && !twinsExpected.includes(slug),
          );
          expect(orphans).toEqual([]);
        },
      );

      then('the two ladders are the same length, plus the bare default', () => {
        expect(ANTHROPIC_BRAIN_REPL_SLUGS.length).toEqual(
          ANTHROPIC_BRAIN_ATOM_SLUGS.length + 1,
        );
      });
    });

    when('[t1] each twin config is compared to its atom config', () => {
      /**
       * .why = reference equality, not a deep match. the repl config REUSES the atom
       *   config object rather than restates it, so a price or cutoff cannot drift
       *   between the two readme tables. a copy would pass `toEqual` on the day it was
       *   made and diverge on the next edit; `toBe` forecloses the copy entirely.
       */
      then('a twin shares the very same config object as its atom', () => {
        for (const slug of ANTHROPIC_BRAIN_ATOM_SLUGS) {
          // .note = `as never` because the twin is a plain `string` here, while
          //   `CONFIG_BY_REPL_SLUG` is keyed by the repl slug union. the [t0] block
          //   above is what proves every twin IS a member of that union, so the cast
          //   rides an assertion rather than an assumption. the typed route
          //   (`asReplSlugFromAtomSlug`) is deliberately NOT used — it would make this
          //   clamp lean on the very transform it exists to verify.
          const twin = slug.replace(PREFIX_SLUG_ATOM, PREFIX_SLUG_REPL);
          expect(CONFIG_BY_REPL_SLUG[twin as never]).toBe(
            CONFIG_BY_ATOM_SLUG[slug],
          );
        }
      });
    });
  });
});
