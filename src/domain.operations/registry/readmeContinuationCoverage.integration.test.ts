import { given, then, when } from 'test-fns';

import { readFileSync } from 'node:fs';
import { asAtomSlugParts } from '../brains/asAtomSlugParts';
import { ANTHROPIC_BRAIN_ATOM_SLUGS } from '../brains/BrainAtom.config';
import { getOnePathReadme } from './asReadmeWithBrainRegistry';

/**
 * .what = clamps that every tier in the atom ladder has a row in the readme's
 *   hand-written episode-continuation table
 * .why = the brains table is generated, so it cannot drift. the continuation table sits
 *   BELOW the generated markers and is hand-kept, so a new tier could enter the ladder
 *   while that table kept a closed world — which is exactly what happened when fable
 *   landed: the ladder gained a tier and the continuation table stayed silent on it.
 * .note = integration, not unit: it reads the readme off disk, which is a remote
 *   boundary (`rule.forbid.unit.remote-boundaries`).
 */
describe('readme continuation coverage', () => {
  const readme = readFileSync(getOnePathReadme(), 'utf-8');

  // .note = derived from the slug union, never hand-listed, so a new tier is covered
  //   by this clamp the moment it registers rather than when someone remembers to.
  const tiers = [
    ...new Set(
      ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) => asAtomSlugParts({ slug }).tier),
    ),
  ];

  const TITLE_CONTINUATION = '## episode continuation';

  given('[case1] the shipped readme', () => {
    when('[t0] the continuation summary is read', () => {
      // .note = the title index is asserted rather than sliced blind. an `indexOf`
      //   miss yields -1, and `slice(-1)` returns the readme's LAST CHARACTER — so a
      //   renamed title would make every assertion below fail with a message that
      //   points nowhere near the real cause (`rule.forbid.failhide`).
      const indexTitle = readme.indexOf(TITLE_CONTINUATION);
      expect(indexTitle).toBeGreaterThan(-1);

      const summary = readme.slice(indexTitle);

      then('it covers every tier the atom ladder registers', () => {
        for (const tier of tiers) {
          expect(summary).toContain(`atom (${tier})`);
        }
      });

      // .note = guards the derivation itself. if the slug shape ever changed and
      //   `split('/')[1]` yielded an empty set, the loop above would pass vacuously.
      then('it derives a tier set that holds all four known tiers', () => {
        expect(tiers.sort()).toEqual(['fable', 'haiku', 'opus', 'sonnet']);
      });
    });
  });
});
