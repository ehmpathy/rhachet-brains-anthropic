import { given, then, when } from 'test-fns';

import { CONFIG_BY_ATOM_SLUG } from '../brains/BrainAtom.config';

/**
 * .what = clamps the ONE promise the bare aliases make: each rides its tier's newest
 *   registered rung
 * .why = "the bare alias tracks the frontier and MOVES" is the headline behavior of
 *   this package and the human's governing ruling ("update to the latest of all"). it
 *   was stated in the readme, in the config comments, and in the yield — and enforced
 *   nowhere.
 *
 * ⚠️ this gap was found through its TWIN. `BrainRepl.slugReach.integration.test.ts`
 *   carried the only alias→frontier assertion in the repo, as
 *   `expect(model).toContain('-5')` — which cannot fail, since the 4.5 ids are
 *   `claude-sonnet-4-5-20250929` and `claude-opus-4-5-20251101` and the text `-5`
 *   sits inside `4-5-`. so the repl side had a FALSE-GREEN clamp and the atom side had
 *   none at all, while the atom path is the one the wish's `.why` is about.
 *
 * .note = a UNIT clamp on purpose. the equivalent live probe costs an agentic session
 *   per slug, so it cannot run on every commit; this reads config only and runs free.
 *   the integration sweep still proves the ids are SERVED — this proves they are the
 *   ones we meant.
 *
 * .note = it covers the repl ladder too, transitively. `BrainRepl.mirror.test.ts`
 *   proves each repl twin holds the very same config OBJECT (reference equality, not a
 *   deep match), so an atom alias pinned here cannot drift on the repl side.
 */

/**
 * .what = each bare alias, the pinned rung it must ride, and the model id both must name
 * .why = two independent facts, deliberately asserted separately:
 *   - the MODEL ID catches a config edited to a stale or wrong id
 *   - the PINNED TWIN catches an alias that no longer rides the newest rung, even when
 *     the id it holds is a real model
 *   an alias could satisfy either alone and still be wrong, so both are named.
 *
 * ⚠️ the ids are written out LONGHAND rather than derived. a derivation would read the
 *   same config this clamps and pass by construction — the definition of a clamp with
 *   no teeth. a hand-written expectation is the only kind that can disagree.
 */
const FRONTIER_BY_ALIAS = {
  // .note = haiku's newest rung IS 4.5 — the vendor shipped no haiku 5. so this row
  //   holds a non-5 id on purpose, and it is the row that proves this clamp reads
  //   "newest registered rung" rather than "an id with a 5 in it".
  'claude/haiku': {
    pinned: 'claude/haiku/v4.5',
    model: 'claude-haiku-4-5-20251001',
  },
  'claude/sonnet': { pinned: 'claude/sonnet/v5', model: 'claude-sonnet-5' },
  'claude/opus': { pinned: 'claude/opus/v5', model: 'claude-opus-5' },
  'claude/fable': { pinned: 'claude/fable/v5', model: 'claude-fable-5' },
} as const;

describe('BrainAtom bare aliases ride the frontier', () => {
  given('[case1] the shipped atom config', () => {
    for (const [alias, expected] of Object.entries(FRONTIER_BY_ALIAS)) {
      when(`[t0] the bare alias "${alias}" is read`, () => {
        // .why = the exact id, never a fragment. a `toContain` here is what let the
        //   repl twin ship green while blind to a whole-generation regression.
        then(`it names exactly "${expected.model}"`, () => {
          expect(
            CONFIG_BY_ATOM_SLUG[alias as keyof typeof FRONTIER_BY_ALIAS].model,
          ).toEqual(expected.model);
        });

        // .why = reference equality, for the reason the mirror clamp gives: a COPY
        //   would pass a deep match on the day it was made and drift on the next edit.
        //   an alias that shares the object cannot drift from the rung it advertises.
        then(`it shares the very config object of "${expected.pinned}"`, () => {
          expect(
            CONFIG_BY_ATOM_SLUG[alias as keyof typeof FRONTIER_BY_ALIAS],
          ).toBe(
            CONFIG_BY_ATOM_SLUG[
              expected.pinned as keyof typeof CONFIG_BY_ATOM_SLUG
            ],
          );
        });
      });
    }
  });
});
