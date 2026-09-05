import { getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getOnePackageRoot } from './getOnePackageRoot';

/**
 * .what = clamps the package-root walk, and above all its relative-path guard
 * .why = the walk terminates on `cursor === stop`, where `stop = parse(from).root`.
 *   for a relative path that root is `''`, the cursor descends to `'.'`, and
 *   `dirname('.')` returns `'.'` forever — so `cursor === stop` never holds.
 *
 * ⚠️ the damage that follows depends on the CWD, and BOTH shapes are
 *   `rule.forbid.failhide`:
 *     - cwd inside a package → `existsSync('./package.json')` succeeds, so the walk
 *       returns `'.'` — a WRONG root, silently, with no error at all
 *     - cwd outside any package → no package.json is ever found, so the loop SPINS
 *
 *   jest runs from the repo root, so the shape THIS file exercises is the silent wrong
 *   path, not the hang — a fact measured by a neutered-guard run, not assumed. it is
 *   the more dangerous of the two: a hang at least stalls a gate, where a wrong root
 *   writes to the wrong readme and reports success. the guard collapses both into one
 *   named error.
 *
 * .why it was latent = both live call sites pass `__dirname`, so the defect could not
 *   fire today. but the module's own comment asserted the loop was "BOUNDED by the
 *   filesystem root ... from any absolute path" — it NAMED the precondition and never
 *   checked it. a stated assumption with no guard behind it is where a latent defect
 *   waits for its first careless caller.
 *
 * .note = an INTEGRATION test: the walk calls `existsSync`, so it crosses the
 *   filesystem boundary that `rule.forbid.unit.remote-boundaries` keeps out of units.
 *   the relative-path case alone is pure — the guard fires before any read — but the
 *   file is classified by its subject, not by its cheapest case.
 */
describe('getOnePackageRoot', () => {
  given('[case1] a relative path', () => {
    when('[t0] the walk is called', () => {
      // ⚠️ two failure signatures, either of which says the guard is gone — never a
      //   flake:
      //     - "no error was thrown" → the walk returned `'.'`, the silent wrong root
      //     - a TIMEOUT → the walk spun; this needs a cwd outside any package
      then('it throws rather than return a wrong root', () => {
        const error = getError(() =>
          getOnePackageRoot({ from: 'src/domain.operations' }),
        );
        expect(error).toBeDefined();
        expect(error.message).toContain('absolute');
      });

      // .why = `rule.require.errors-name-the-fix`. the caller passed a path; they need
      //   to know what to pass instead, not merely that this one was wrong.
      then('the error names what to pass instead', () => {
        const error = getError(() =>
          getOnePackageRoot({ from: 'src/domain.operations' }),
        );
        expect(error.message).toContain('__dirname');
      });
    });
  });

  given('[case2] an absolute path inside this package', () => {
    when('[t0] the walk is called', () => {
      // .why = the walk must find the package root, not merely stop somewhere. the
      //   defect it replaced was a fixed `../../../` guess that was right only by
      //   accident of this module's depth.
      then('it finds the directory that holds package.json', () => {
        const root = getOnePackageRoot({ from: __dirname });
        expect(existsSync(join(root, 'package.json'))).toEqual(true);
      });

      // .why = proves the walk is depth-independent. a fixed-level guess would give a
      //   different answer from a nested start; the walk must give the same one.
      then('a deeper start finds the same root', () => {
        expect(
          getOnePackageRoot({ from: join(__dirname, 'a', 'b', 'c') }),
        ).toEqual(getOnePackageRoot({ from: __dirname }));
      });
    });
  });

  given('[case3] an absolute path with no package.json above it', () => {
    when('[t0] the walk is called', () => {
      // .why = the walk must fail loud at the root rather than return a wrong path. a
      //   silent wrong answer here would mean a write to the wrong readme.
      then('it throws rather than return a wrong path', () => {
        const error = getError(() => getOnePackageRoot({ from: '/' }));
        expect(error).toBeDefined();
        expect(error.message).toContain('no package.json');
      });
    });
  });
});
