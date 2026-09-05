import { given, then, when } from 'test-fns';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

/**
 * .what = clamps that a rung's `description` never claims a peak it does not hold
 *
 * .why = found by a read of the real boundary output, not by a test. `claude/opus/v4.5`
 *   read `most capable for complex thought` — TRUE when it topped the shipped ladder at
 *   0.4.3, and falsified by the six rungs this behavior added above it. its own
 *   `spec.gain.grades.sweVer` is 81, against opus 5 at 89 and fable 5 at 90.
 *
 * ⚠️ the defect is worse than a stale doc, because both facts ride the SAME object.
 *   `asBrainDescription` states that `description` is the one surface that crosses into
 *   rhachet's `BrainAtom` — and `spec.gain.grades` crosses too. so a human who read the
 *   description picked opus 4.5 for peak capability while a selector that ranked on
 *   `sweVer` picked fable 5. one brain, two answers (`rule.forbid.ambiguous-labels`).
 *
 * .why A CLAMP and not just the one-line repair: this is a RECURRING class, not a point
 *   event. every rung the vendor ships above a current peak re-falsifies whatever
 *   description held that peak, and no other check in the repo reads a description as a
 *   claim — the registry render, the snapshots and the type union all pass it through as
 *   opaque text (`rule.require.clamp-edge-cases`).
 *
 * .note = the phrase list holds UNSCOPED peak claims only. `claude/sonnet/v5` reads
 *   `best combination of speed and intelligence`, which is a claim about a TRADE rather
 *   than about a peak, so a rung may hold it without holding the top grade. to fold
 *   `best` in would redden an honest description.
 *
 * .note = the cost axis is deliberately uncovered. `most cost-effective` would need an
 *   IsoPrice comparison across `spec.cost.cash.input`, and the two axes below are the two
 *   that a new rung moves. a rung cheaper than haiku 4.5 would need this extended.
 *
 * .note = a UNIT test over literals. no factory, no credential, no network.
 */

/**
 * .what = phrases that claim the top of the capability ladder outright
 * .why = each asserts a MAXIMUM, so exactly one rung in the registry may carry it
 */
const CLAIMS_OF_PEAK_CAPABILITY = [
  'most capable',
  'most powerful',
  'highest available capability',
];

/**
 * .what = phrases that claim the top of the speed ladder outright
 * .why = the same shape on the other axis a new rung moves. kept as a separate list,
 *   rather than folded into one table with a selector, because two cases is under the
 *   rule of three (`rule.prefer.wet-over-dry`)
 */
const CLAIMS_OF_PEAK_SPEED = ['fastest'];

const configs = ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) => ({
  slug,
  config: CONFIG_BY_ATOM_SLUG[slug],
}));

describe('a description never claims a peak the rung does not hold', () => {
  given('[case1] the registered atom ladder', () => {
    when('[t0] every description is read as a claim', () => {
      /**
       * ⚠️ this is the assertion that bites. it went red against
       *   `claude opus 4.5 - most capable for complex thought` (sweVer 81) while
       *   fable 5 held sweVer 90, and green once that description dropped the claim.
       */
      then(
        'a peak-capability claim belongs only to the top-graded rung',
        () => {
          // ⚠️ `sweVer` is OPTIONAL in rhachet's `BrainSpec`, so a rung may carry no grade
          //   at all. an ungraded rung that claims the peak is counted a liar too — the
          //   claim is then unbackable by the very field a selector ranks on, which is the
          //   same one-brain-two-answers split, minus the second answer.
          const grades = configs.map(
            ({ config }) => config.spec.gain.grades.sweVer ?? null,
          );
          const gradeTop = Math.max(
            ...grades.filter((grade): grade is number => grade !== null),
          );
          const liars = configs
            .filter(({ config }) =>
              CLAIMS_OF_PEAK_CAPABILITY.some((claim) =>
                config.description.includes(claim),
              ),
            )
            .filter(
              ({ config }) => (config.spec.gain.grades.sweVer ?? -1) < gradeTop,
            )
            .map(({ slug }) => slug);

          expect(liars).toEqual([]);
        },
      );

      then('a peak-speed claim belongs only to the fastest rung', () => {
        const speedTop = Math.max(
          ...configs.map(({ config }) => config.spec.cost.time.speed.tokens),
        );
        const liars = configs
          .filter(({ config }) =>
            CLAIMS_OF_PEAK_SPEED.some((claim) =>
              config.description.includes(claim),
            ),
          )
          .filter(({ config }) => config.spec.cost.time.speed.tokens < speedTop)
          .map(({ slug }) => slug);

        expect(liars).toEqual([]);
      });

      /**
       * ⚠️ guards the two clamps above from a VACUOUS pass. both filter on a phrase
       *   list, so a registry where no description carried any claim would satisfy them
       *   while it exercised none of the logic — a green that proves not one thing
       *   (`rule.forbid.failhide`). today `claude/fable` and `claude/fable/v5` hold the
       *   capability claim and `claude/haiku` and `claude/haiku/v4.5` hold the speed one.
       */
      then(
        'the claims are actually present, so the clamps are not vacuous',
        () => {
          const claimants = configs.filter(({ config }) =>
            [...CLAIMS_OF_PEAK_CAPABILITY, ...CLAIMS_OF_PEAK_SPEED].some(
              (claim) => config.description.includes(claim),
            ),
          );
          expect(claimants.length).toBeGreaterThan(0);
        },
      );
    });
  });
});
