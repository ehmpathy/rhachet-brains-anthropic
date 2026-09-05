import { given, then, when } from 'test-fns';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

/**
 * .what = clamps the fields every rung shares, and the boundary the shared ones track
 *
 * .why = `domain`, `skills`, and the context window were hand-typed on all thirteen
 *   rungs. two of the three are not per-rung facts at all — they are identical
 *   everywhere — and the third collapses to exactly two numbers. so a wrong value reads
 *   as a deliberate per-rung claim rather than as the typo it is.
 *
 * ⚠️ the two failures this exists for are both plausible under time pressure, and
 *   neither is loud: a `vision: false` typed onto rung fourteen, or a `20_000` where
 *   `200_000` was meant. the first silently narrows what a caller believes the rung can
 *   do; the second silently narrows what it can send. no other check in the repo reads
 *   these fields (`rule.require.clamp-edge-cases`).
 *
 * .why THE BICONDITIONAL BELOW is the sharp one. the named constants stop a transposed
 *   DIGIT, but they cannot stop a pick of the wrong constant. the 1M window and
 *   default-on adaptive thought both arrive at 4.6 — one vendor boundary, two fields —
 *   so each field checks the other, and a rung placed on the wrong side of it reddens.
 *
 * .note = a UNIT test over a literal. no factory, no credential, no network.
 */
describe('the shared gain fields, and the 4.6 boundary', () => {
  given('[case1] the registered atom ladder', () => {
    when('[t0] every rung is read', () => {
      // guards every sweep below from a vacuous pass on an empty list
      then('the sweep actually finds rungs to check', () => {
        expect(ANTHROPIC_BRAIN_ATOM_SLUGS.length).toBeGreaterThan(10);
      });

      then('every rung carries the same domain', () => {
        const domainsDistinct = new Set(
          ANTHROPIC_BRAIN_ATOM_SLUGS.map(
            (slug) => CONFIG_BY_ATOM_SLUG[slug].spec.gain.domain,
          ),
        );
        expect([...domainsDistinct]).toEqual(['ALL']);
      });

      // .why = a `vision: false` on one rung is the exact typo the spread was added to
      //   prevent, and an explicit override after the spread still permits it.
      then('every rung carries the same skills', () => {
        const skillsDistinct = new Set(
          ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) =>
            JSON.stringify(CONFIG_BY_ATOM_SLUG[slug].spec.gain.skills),
          ),
        );
        expect(skillsDistinct.size).toEqual(1);
      });

      // .why = the context window takes exactly two values across the whole ladder. a
      //   third would be either a new vendor tier we have not accounted for, or a typo —
      //   and both want a human to look.
      then('the context window takes exactly two values', () => {
        const contextsDistinct = new Set(
          ANTHROPIC_BRAIN_ATOM_SLUGS.map(
            (slug) => CONFIG_BY_ATOM_SLUG[slug].spec.gain.size.context.tokens,
          ),
        );
        expect([...contextsDistinct].sort((a, b) => a - b)).toEqual([
          200_000, 1_000_000,
        ]);
      });

      // ⚠️ THE clamp. one vendor boundary, two fields — so each checks the other.
      then('a 1M window and adaptive thought hold on the same rungs', () => {
        const disagreements = ANTHROPIC_BRAIN_ATOM_SLUGS.filter((slug) => {
          const config = CONFIG_BY_ATOM_SLUG[slug];
          const isWide = config.spec.gain.size.context.tokens === 1_000_000;
          const doesThinkByDefault = config.thought.mode === 'adaptive';
          return isWide !== doesThinkByDefault;
        });
        expect(disagreements).toEqual([]);
      });
    });
  });
});
