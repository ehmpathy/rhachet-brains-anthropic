import { given, then, when } from 'test-fns';

import { readFileSync } from 'node:fs';
import {
  asReadmeWithBrainRegistry,
  getOnePathReadme,
} from './asReadmeWithBrainRegistry';

/**
 * .what = the clamp that keeps the readme honest with the shipped ladder
 * .why = the readme table and the slug ladder used to be two hand-kept copies,
 *   compared by eye, so a new rung could ship with stale docs and no check would
 *   go red. generation removes the second source; this proves it stayed removed.
 *
 * .note = an integration test, not a unit test — it reads readme.md from disk,
 *   which crosses the filesystem boundary.
 */
describe('readme brain registry', () => {
  given('[case1] the readme on disk', () => {
    when('[t0] the registry section is regenerated from the config', () => {
      // .note = read inline, not via useThen — a useThen proxy is not a string, and
      //   only one assert needs the file, so there is no repeat read to share
      then('the readme already matches — no drift', () => {
        const readme = readFileSync(getOnePathReadme(), 'utf8');
        const expected = asReadmeWithBrainRegistry({ readme });

        // ⚠️ ONE live check, and the guidance rides ON it.
        //
        // .why not a throw ahead of an `expect` = that was the earlier shape, and it made
        //   the `expect` DEAD: it could only ever run once the throw had already proven
        //   equality, so it verified zero. a later edit that dropped or reordered the
        //   throw would have left a still-green test with no assertion at all — the
        //   failhide `rule.forbid.failhide` names.
        //
        // .why compare a STATUS word rather than the two documents = a bare
        //   `toEqual(expected)` on two multi-hundred-line strings prints a diff no human
        //   reads, which is what motivated the throw in the first place. this keeps the
        //   assertion live AND the failure legible: on drift, jest prints the fix guidance
        //   as the received value.
        const status =
          readme === expected
            ? 'the readme is current'
            : [
                'readme.md is stale against the brain config.',
                '',
                'why: the brain registry table is generated from',
                '  src/domain.operations/brains/BrainAtom.config.ts',
                '  src/domain.operations/brains/BrainRepl.config.ts',
                'so a slug, price, cutoff, or thought-mode change must be regenerated.',
                '',
                'fix: run',
                '  npm run fix:readme',
              ].join('\n');

        expect(status).toEqual('the readme is current');
      });
    });
  });
});
