import { given, then, when } from 'test-fns';

import { asAtomSlugParts } from '../brains/asAtomSlugParts';
import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';

/**
 * .what = clamps the two `thought` facts that no other test and no rendered output
 *   covers: which rungs REJECT the `effort` parameter, and where the adaptive
 *   boundary actually falls
 * .why = `effort: null` means the vendor rejects the parameter on that model. its one
 *   declared consumer is the generic effort knob proposed in ehmpathy/rhachet#490,
 *   which must NOT pass `effort` through unconditionally or the api refuses the call.
 *
 * ⚠️ that consumer lives in ANOTHER repo, so a wrong value here fails there. a flip of
 *   `null` to `'high'` in a tidy-up would type-check, ship, render identically, and
 *   surface as a rejected request in a downstream package with no trail back to here.
 *
 * .note = the readme cannot cover this. `asThoughtHuman` renders `effort` only for the
 *   adaptive rungs, so the extended rungs' effort value is invisible to a reader — and
 *   the extended rungs are exactly where the value SPLITS (see [t1]).
 *
 * .note = every value below was read off the vendor's per-model pages on 2026-08-31,
 *   which is also where the vision's spec table came from.
 */
/**
 * .what = is this slug's rung at or below the 4.5 thought boundary?
 *
 * .why NAMED, rather than a literal list inline in the filter. the list IS the claim
 *   the assertion makes — "4.5 and below" — so inline it forced a reader to decode the
 *   slug grammar to see which axis was meant, and left the boundary itself unnamed
 *   (`rule.forbid.inline-decode-friction`).
 *
 * ⚠️ the boundary is between 4.5 and 4.6, NOT at 5. rungs 4.6, 4.7 and 4.8 think by
 *   default exactly as v5 does — the misread that makes "pin one rung back" the
 *   expensive choice for a caller who wants the old on-request behavior.
 *
 * .note = it lists rungs BELOW the line rather than above it on purpose. the ladder
 *   grows upward, so a new rung ships above the boundary, where the adaptive
 *   assertion catches it; a list of "above" rungs would silently go stale instead.
 */
const RUNGS_AT_OR_BELOW_BOUNDARY = ['v3.5', 'v4', 'v4.5'];

const isRungAtOrBelowBoundary = (
  slug: (typeof ANTHROPIC_BRAIN_ATOM_SLUGS)[number],
): boolean =>
  RUNGS_AT_OR_BELOW_BOUNDARY.includes(asAtomSlugParts({ slug }).rung ?? '');

describe('BrainAtom thought profile', () => {
  given('[case1] the shipped atom ladder', () => {
    when(
      '[t0] the rungs that reject the effort parameter are collected',
      () => {
        const slugsRejectEffort = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
          (slug) => CONFIG_BY_ATOM_SLUG[slug].thought.effort === null,
        );

        then('it is exactly the six rungs the vendor marks unsupported', () => {
          // .note = `claude/haiku` is the bare alias, which shares haiku 4.5's config,
          //   so it appears alongside its pinned twin. that is the alias at work, not
          //   a duplicate entry.
          expect(slugsRejectEffort).toEqual([
            'claude/haiku',
            'claude/haiku/v3.5',
            'claude/haiku/v4.5',
            'claude/sonnet/v4',
            'claude/sonnet/v4.5',
            'claude/opus/v4',
          ]);
        });

        then('no adaptive rung rejects it', () => {
          // .why = an adaptive model thinks BY DEFAULT per its effort, so an adaptive
          //   rung with a null effort would be self-contradictory — and it would
          //   render as `by default (effort: null)` in the readme.
          for (const slug of ANTHROPIC_BRAIN_ATOM_SLUGS) {
            const { thought } = CONFIG_BY_ATOM_SLUG[slug];
            if (thought.mode === 'adaptive')
              expect(thought.effort).toEqual('high');
          }
        });
      },
    );

    when('[t1] the extended rungs are compared to each other', () => {
      /**
       * .why = this asymmetry is the single most misreadable fact in the ladder, and it
       *   is why `mode` and `effort` are two fields rather than one. opus 4.5 does NOT
       *   think by default, yet it still ACCEPTS an effort — while sonnet 4.5, one
       *   tier down and the same rung, rejects it outright.
       *
       *   so "extended" does not imply "no effort knob", and a consumer that infers
       *   one from the other is wrong for opus 4.5 in one direction and wrong for
       *   sonnet 4.5 in the other.
       */
      then('opus 4.5 is extended yet accepts an effort', () => {
        expect(CONFIG_BY_ATOM_SLUG['claude/opus/v4.5'].thought).toEqual({
          mode: 'extended',
          effort: 'high',
        });
      });

      then('sonnet 4.5, the same rung one tier down, rejects it', () => {
        expect(CONFIG_BY_ATOM_SLUG['claude/sonnet/v4.5'].thought).toEqual({
          mode: 'extended',
          effort: null,
        });
      });
    });

    when('[t2] the adaptive boundary is located', () => {
      /**
       * .why = the vision's headline correction. the boundary between on-request and
       *   default-on thought falls between 4.5 and 4.6 — NOT at v5, which is where a
       *   reader assumes a generation change puts it. that misread is what makes
       *   "pin one rung back from v5" the expensive move rather than the safe one.
       */
      then('every 4.6-and-up rung thinks by default', () => {
        for (const slug of [
          'claude/sonnet/v4.6',
          'claude/sonnet/v5',
          'claude/opus/v4.6',
          'claude/opus/v4.7',
          'claude/opus/v4.8',
          'claude/opus/v5',
          'claude/fable/v5',
        ] as const) {
          expect(CONFIG_BY_ATOM_SLUG[slug].thought.mode).toEqual('adaptive');
        }
      });

      /**
       * .note = derived, not hand-listed. a hand list of three slugs under this title
       *   would leave `claude/haiku/v3.5` (mode 'none') and the v4 rungs unasserted
       *   while it read as proof for the whole set — a claim wider than its check.
       */
      then('not one 4.5-and-below rung thinks by default', () => {
        const slugsBelowBoundary = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
          isRungAtOrBelowBoundary,
        );
        expect(slugsBelowBoundary.length).toBeGreaterThan(3);
        for (const slug of slugsBelowBoundary) {
          expect(CONFIG_BY_ATOM_SLUG[slug].thought.mode).not.toEqual(
            'adaptive',
          );
        }
      });
    });
  });
});
