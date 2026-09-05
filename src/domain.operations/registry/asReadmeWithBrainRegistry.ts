import { BadRequestError } from 'helpful-errors';

import { join } from 'node:path';
import {
  asBrainRegistryMarkdown,
  MARKER_BRAINS_FOOT,
  MARKER_BRAINS_HEAD,
} from './asBrainRegistryMarkdown';
import { getOnePackageRoot } from './getOnePackageRoot';

/**
 * .what = the readme path, resolved from the package root
 * .note = found by a walk up to the nearest package.json, NOT by a fixed level count.
 *   a `'../../../readme.md'` guess is correct only by accident of this module's depth,
 *   so it would silently name a different file if the module moved or the build tree
 *   changed shape.
 * .note = a function, NOT a top-level const. as a const the filesystem walk — which
 *   can throw — ran merely on IMPORT of this module, the same shape as the
 *   import-time write already removed from `fixReadmeBrainRegistry`. no public export
 *   reaches here today, but a future re-export would have reintroduced it; a function
 *   closes that door rather than rely on the door staying shut.
 */
export const getOnePathReadme = (): string =>
  join(getOnePackageRoot({ from: __dirname }), 'readme.md');

/**
 * .what = swaps the generated brain-registry section into the readme text
 * .why = pure, so the clamp and the writer share one implementation and cannot
 *   disagree about what "current" means
 */
export const asReadmeWithBrainRegistry = (input: {
  readme: string;
}): string => {
  const indexHead = input.readme.indexOf(MARKER_BRAINS_HEAD);
  const indexFoot = input.readme.indexOf(MARKER_BRAINS_FOOT);

  if (indexHead === -1 || indexFoot === -1)
    throw new BadRequestError(
      'readme lacks the generated brain-registry markers',
      {
        head: MARKER_BRAINS_HEAD,
        foot: MARKER_BRAINS_FOOT,
        hint: `add both markers to readme.md, then run \`npm run fix:readme\``,
      },
    );

  // .note = a DOUBLED marker is caught too. `indexOf` reports only the first, so a
  //   second head marker further down would be swallowed into the generated block,
  //   and a second foot marker would strand the prose between the two — either way
  //   content vanishes with no error (`rule.forbid.failhide`).
  //
  // ⚠️ it names WHICH marker doubled, rather than merely that one did. the earlier
  //   message said "each of <head> and <foot> must appear exactly once", which is
  //   true and unactionable — a contributor with a doubled foot marker was handed
  //   both markers and left to search for the offender themselves
  //   (`rule.require.errors-name-the-fix`).
  //
  //   this was invisible until the two blocked states were SNAPPED: the head-doubled
  //   and foot-doubled snapshots came out byte-identical, which is what a message
  //   that cannot tell them apart looks like.
  const markersDoubled = [MARKER_BRAINS_HEAD, MARKER_BRAINS_FOOT].filter(
    (marker) =>
      input.readme.indexOf(marker) !== input.readme.lastIndexOf(marker),
  );

  if (markersDoubled.length > 0)
    throw new BadRequestError(
      'a readme brain-registry marker appears more than once',
      {
        doubled: markersDoubled,
        hint: `remove the extra ${markersDoubled.join(' and ')} from readme.md — each marker must appear exactly once`,
      },
    );

  // .note = order is checked, not assumed. a transposed pair still passes the
  //   presence check above, and the slice below would then silently drop the head
  //   block and leave the foot marker stranded in the prose — a corrupt readme
  //   written with no error (`rule.forbid.failhide`).
  //
  // ⚠️ the metadata carries the HINT and no character offsets, on purpose. it once
  //   carried `indexHead` / `indexFoot`, and a contributor cannot act on a character
  //   position — to learn what `indexHead: 63` means they would count characters
  //   through a multi-hundred-line readme. that is internal state leaked to a
  //   user-faced surface, which is the debug-noise shape
  //   `rule.forbid.snapshot-visual-blemishes` forbids.
  //
  //   it also broke the family: the two errors above carry only actionable metadata —
  //   the marker text, and WHICH marker doubled — so this one was the lone outlier.
  //
  //   no diagnostic is lost. the condition is `indexHead > indexFoot`, and the message
  //   plus the hint state that in full. do NOT re-add the offsets for "context";
  //   `rule.require.failloud` asks for context a reader can ACT on, and a character
  //   index into a readme is not that.
  if (indexHead > indexFoot)
    throw new BadRequestError(
      'the readme brain-registry markers are transposed',
      {
        hint: `${MARKER_BRAINS_HEAD} must come before ${MARKER_BRAINS_FOOT}`,
      },
    );

  const before = input.readme.slice(0, indexHead);
  const after = input.readme.slice(indexFoot + MARKER_BRAINS_FOOT.length);
  return [before, asBrainRegistryMarkdown(), after].join('');
};
