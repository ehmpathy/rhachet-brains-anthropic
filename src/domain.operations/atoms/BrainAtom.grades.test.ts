import { given, then, when } from 'test-fns';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';

/**
 * .what = clamps that every rung reports its benchmark under a key rhachet can READ
 * .why = `BrainSpec.gain.grades` ends with `[key: string]: number | undefined`. that
 *   index signature is a deliberate escape hatch for supplier-specific benchmarks —
 *   and it means a MISSPELLED or non-canonical key type-checks in silence.
 *
 * ⚠️ this shipped. every rung reported `swe`, which is not a canonical key, so it
 *   landed in the custom-grade hatch rather than in `sweVer`. the type system stayed
 *   silent and no test asked. the day a cross-supplier comparator reads `sweVer`,
 *   every anthropic brain would have answered `undefined`, with no error anywhere.
 *
 * .note = the canonical set is read off rhachet's own `BrainSpec`: `sweVer`, `swePro`,
 *   `gpqa`, `math`, `ifeval`, `arcagi`. it is restated here rather than imported
 *   because the shape is an interface, not a runtime value — so a drift between this
 *   list and rhachet's is possible, and is itself worth a look on any rhachet bump.
 *
 * .note = `mmlu` and `humaneval` stay as CUSTOM grades on purpose. neither has a
 *   canonical slot, and the index signature exists precisely to carry them. the rule
 *   this clamps is "report at least one canonical key", never "report only canonical
 *   keys" — the latter would forbid the hatch rhachet deliberately opened.
 */
const GRADE_KEYS_CANONICAL = [
  'sweVer',
  'swePro',
  'gpqa',
  'math',
  'ifeval',
  'arcagi',
];

describe('BrainAtom grade keys', () => {
  given('[case1] every registered rung', () => {
    when('[t0] its grades are read', () => {
      then('at least one key is one rhachet can read', () => {
        for (const slug of ANTHROPIC_BRAIN_ATOM_SLUGS) {
          const keys = Object.keys(CONFIG_BY_ATOM_SLUG[slug].spec.gain.grades);
          expect(
            keys.some((key) => GRADE_KEYS_CANONICAL.includes(key)),
          ).toEqual(true);
        }
      });

      // .why = the specific regression this forecloses. `swe` is the near-miss that
      //   shipped: one letter-group short of `sweVer`, and indistinguishable from a
      //   legitimate custom grade to both the compiler and a casual reader.
      then('no rung reports the non-canonical `swe` key', () => {
        for (const slug of ANTHROPIC_BRAIN_ATOM_SLUGS) {
          expect(
            Object.keys(CONFIG_BY_ATOM_SLUG[slug].spec.gain.grades),
          ).not.toContain('swe');
        }
      });
    });
  });
});
