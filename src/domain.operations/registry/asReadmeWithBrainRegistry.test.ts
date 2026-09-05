import { getError, given, then, useThen, when } from 'test-fns';

import {
  MARKER_BRAINS_FOOT,
  MARKER_BRAINS_HEAD,
} from './asBrainRegistryMarkdown';
import { asReadmeWithBrainRegistry } from './asReadmeWithBrainRegistry';

/**
 * .what = clamps the three blocked states of the readme swap
 * .why = `asReadmeWithBrainRegistry` carries three guards — an absent marker, a doubled
 *   marker, and a transposed pair — and each was written with a `rule.forbid.failhide`
 *   rationale in its comment. all three shipped with zero coverage: only the happy path
 *   was tested, so every one of those rationales was an assertion about behavior no
 *   check enforced.
 *
 * ⚠️ the two silent guards are the point. an ABSENT marker fails loudly on its own —
 *   the slice would misbehave visibly. a DOUBLED or TRANSPOSED marker does not: the
 *   presence check passes, and the swap then quietly eats the prose between the two
 *   markers. that is content lost with no error, which is why the guards exist and why
 *   they needed clamps more than the loud case did.
 *
 * .note = a unit test — pure string work, no filesystem. the on-disk staleness clamp is
 *   the separate integration test next door.
 */

/**
 * .what = a minimal readme with the generated block in the right shape
 * .why = the happy-path baseline each malformed case below deviates from by ONE fact, so
 *   a failure names which fact broke it
 */
const README_WELL_FORMED = [
  '# a readme',
  '',
  'some hand-written prose above.',
  '',
  MARKER_BRAINS_HEAD,
  'stale generated content',
  MARKER_BRAINS_FOOT,
  '',
  'some hand-written prose below.',
].join('\n');

describe('asReadmeWithBrainRegistry', () => {
  given('[case1] a readme with both markers, in order', () => {
    when('[t0] the registry section is swapped in', () => {
      then('the prose above and below is preserved', () => {
        const result = asReadmeWithBrainRegistry({
          readme: README_WELL_FORMED,
        });
        expect(result).toContain('some hand-written prose above.');
        expect(result).toContain('some hand-written prose below.');
      });

      then('the stale generated content is replaced', () => {
        const result = asReadmeWithBrainRegistry({
          readme: README_WELL_FORMED,
        });
        expect(result).not.toContain('stale generated content');
      });
    });
  });

  given('[case2] a readme with no markers at all', () => {
    when('[t0] the registry section is swapped in', () => {
      // .note = the capture projects `{ message }`, never the Error. `useThen` builds
      //   its proxy with `Object.assign`, which copies only ENUMERABLE own props, and
      //   `Error#message` is non-enumerable — so a capture of the bare Error would read
      //   `undefined` in every assertion below.
      const failed = useThen('it throws', async () => ({
        message: getError(() =>
          asReadmeWithBrainRegistry({ readme: '# a readme with no markers' }),
        ).message,
      }));

      then('it throws rather than write a readme with no table', () => {
        expect(failed.message).toContain('lacks the generated brain-registry');
      });

      then('the error names both markers and the fix', () => {
        expect(failed.message).toContain(MARKER_BRAINS_HEAD);
        expect(failed.message).toContain(MARKER_BRAINS_FOOT);
        expect(failed.message).toContain('fix:readme');
      });

      /**
       * .what = snaps the FULL text, not the three phrases above
       *
       * .why = each phrase assertion reads one fragment, so the words BETWEEN them are
       *   unclamped. a rewrite that kept `lacks the generated brain-registry` and
       *   `fix:readme` while it mangled the guidance in between would stay green with
       *   no reviewer-visible diff — and this message is the whole of what a blocked
       *   `npm run fix:readme` contributor has to act on
       *   (`rule.forbid.friction-hazards`).
       *
       * .note = `error.message` rather than the serialized error. helpful-errors folds
       *   the metadata block into the message, so the markers and hint are already
       *   inside; a serialized error would carry `stack`, whose absolute paths and line
       *   numbers redden on another machine (`rule.require.hermetic-tests`).
       */
      then('the full message reads as a contributor would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });

  given('[case3] a readme where the head marker appears twice', () => {
    /**
     * .note = the SILENT case. `indexOf` reports only the first head marker, so the
     *   second would be swallowed into the generated block and the prose between them
     *   would vanish — with no error at all, were the guard absent.
     */
    const readmeDoubled = [
      MARKER_BRAINS_HEAD,
      'first block',
      MARKER_BRAINS_HEAD,
      'prose that would silently vanish',
      MARKER_BRAINS_FOOT,
    ].join('\n');

    when('[t0] the registry section is swapped in', () => {
      const failed = useThen('it throws', async () => ({
        message: getError(() =>
          asReadmeWithBrainRegistry({ readme: readmeDoubled }),
        ).message,
      }));

      then('it throws rather than swallow the prose between them', () => {
        expect(failed.message).toContain('more than once');
      });

      /**
       * .why snapped SEPARATELY from case4 = the two must differ in the one field a
       *   contributor uses to tell them apart: WHICH marker doubled.
       *
       * ⚠️ when these snapshots were first written they came out **byte-identical**,
       *   and that is what caught the defect. the guard said only "each of <head> and
       *   <foot> must appear exactly once" — true, and unactionable: a contributor
       *   with a doubled foot marker was handed both markers and left to hunt. the
       *   guard now names the offender, so these two snapshots diverge.
       *
       * .note = the phrase assertions above passed the whole time. only the full-text
       *   snapshot, read by a human, exposed it.
       */
      then('the full message reads as a contributor would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] a readme where the foot marker appears twice', () => {
    const readmeDoubled = [
      MARKER_BRAINS_HEAD,
      'first block',
      MARKER_BRAINS_FOOT,
      'prose that would be stranded',
      MARKER_BRAINS_FOOT,
    ].join('\n');

    when('[t0] the registry section is swapped in', () => {
      const failed = useThen('it throws', async () => ({
        message: getError(() =>
          asReadmeWithBrainRegistry({ readme: readmeDoubled }),
        ).message,
      }));

      then('it throws rather than strand the prose after it', () => {
        expect(failed.message).toContain('more than once');
      });

      then('the full message reads as a contributor would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] a readme where the markers are transposed', () => {
    /**
     * .note = the second SILENT case. a transposed pair passes the presence check, and
     *   the slice would then drop the head block and leave the foot marker stranded in
     *   the prose — a corrupt readme written with no error.
     */
    const readmeTransposed = [
      'prose above',
      MARKER_BRAINS_FOOT,
      'the block, inverted',
      MARKER_BRAINS_HEAD,
      'prose below',
    ].join('\n');

    when('[t0] the registry section is swapped in', () => {
      const failed = useThen('it throws', async () => ({
        message: getError(() =>
          asReadmeWithBrainRegistry({ readme: readmeTransposed }),
        ).message,
      }));

      then('it throws rather than write a corrupt readme', () => {
        expect(failed.message).toContain('transposed');
      });

      then('the error names the order it expects', () => {
        expect(failed.message).toContain('must come before');
      });

      then('the full message reads as a contributor would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });
});
