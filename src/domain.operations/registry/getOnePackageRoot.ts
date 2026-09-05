import { UnexpectedCodePathError } from 'helpful-errors';

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, parse } from 'node:path';

/**
 * .what = walks up from a directory to the nearest one that holds a package.json
 * .why = the readme path used to be `join(__dirname, '../../../readme.md')` — a fixed
 *   three-level guess that happened to be right from both `src/` and `dist/`. it was
 *   correct by accident of module depth: move this module one level, or emit a build
 *   tree of a different shape, and the path silently names a different file.
 * .note = fails loud at the filesystem root rather than return a wrong path, so a
 *   broken assumption surfaces as an error instead of a mangled write.
 */
export const getOnePackageRoot = (input: { from: string }): string => {
  // fail-fast: the walk below terminates ONLY for an absolute path
  //
  // ⚠️ without this, a relative path never reaches `stop`. `parse('src/foo').root` is
  //   `''`, the cursor descends to `'.'`, and `dirname('.')` returns `'.'` forever — so
  //   `cursor === stop` compares `'.'` against `''` and never holds.
  //
  // ⚠️ and the damage that follows depends on the CWD, which is why the defect is worse
  //   than a hang alone:
  //     - cwd inside a package → `existsSync('./package.json')` succeeds, so the walk
  //       returns `'.'` — a WRONG root, silently, with no error at all
  //     - cwd outside any package → no `package.json` is ever found, so the loop SPINS
  //
  // .why = both shapes are `rule.forbid.failhide`. the silent-wrong-path shape is the
  //   more dangerous of the two: a hang at least stalls a gate, where a wrong root
  //   writes to the wrong readme and reports success. the comment below always named
  //   this assumption — "from any absolute path" — and a stated assumption that is
  //   never checked is exactly where a latent defect waits.
  if (!isAbsolute(input.from))
    throw new UnexpectedCodePathError(
      'the package-root walk needs an absolute path, and was handed a relative one',
      {
        from: input.from,
        hint: 'pass `__dirname`, or expand the path with `path.resolve` first — a relative path would spin this walk forever rather than fail',
      },
    );

  const stop = parse(input.from).root;

  // .note = deliberate mutation. an upward walk is inherently iterative, and the
  //   loop is BOUNDED by the filesystem root — `stop` is reached in a finite number
  //   of steps from any absolute path, which the guard above now GUARANTEES rather
  //   than assumes (`rule.require.immutable-vars` asks that an unavoidable mutation be
  //   scoped and annotated, which this is).
  let cursor = input.from;
  while (true) {
    if (existsSync(join(cursor, 'package.json'))) return cursor;
    if (cursor === stop)
      throw new UnexpectedCodePathError(
        'no package.json found above this directory',
        {
          from: input.from,
          hint: 'this module expects to run from inside a package; check the build output tree',
        },
      );
    cursor = dirname(cursor);
  }
};
