import { BrainAtom, BrainRepl } from 'rhachet';
import { given, then, when } from 'test-fns';

import { genBrainAtom } from '../../domain.operations/atoms/genBrainAtom';
import { ANTHROPIC_BRAIN_ATOM_SLUGS } from '../../domain.operations/brains/BrainAtom.config';
import {
  ANTHROPIC_BRAIN_REPL_SLUGS,
  CONFIG_BY_REPL_SLUG,
} from '../../domain.operations/brains/BrainRepl.config';
import { genBrainRepl } from '../../domain.operations/repls/genBrainRepl';
import { getBrainAtomsByAnthropic, getBrainReplsByAnthropic } from './index';

describe('rhachet-brains-anthropic.integration', () => {
  given('[case1] getBrainAtomsByAnthropic', () => {
    when('[t0] called', () => {
      /**
       * .why = rhachet discovers only what this function RETURNS, so a slug that is
       *   declared but unregistered is invisible to `rhx review --brain` with no
       *   compile error to catch it. an assert on the exact ladder — rather than on
       *   a count — is what makes that gap go red.
       */
      then('it registers every declared atom slug, and only those', () => {
        const atoms = getBrainAtomsByAnthropic();
        expect(atoms.map((atom) => atom.slug)).toEqual([
          ...ANTHROPIC_BRAIN_ATOM_SLUGS,
        ]);
      });

      then('returns BrainAtom instances', () => {
        const atoms = getBrainAtomsByAnthropic();
        for (const atom of atoms) {
          expect(atom).toBeInstanceOf(BrainAtom);
        }
      });

      /**
       * .what = snapshots the `description` a consumer actually reads off each brain
       *
       * .why = rhachet types `description` as a first-class field of `BrainAtom` and
       *   documents it as what "helps developers understand what this atom is best
       *   suited for" — so it exists precisely to steer a CHOICE. `asBrainDescription`
       *   adds that it is the one surface a deprecation can cross on, since rhachet
       *   declares no field for it.
       *
       * ⚠️ it was uncaptured anywhere. this test asserted `slug` and `instanceof`; the
       *   commonjs acceptance snapshot captures slugs alone; the readme table renders no
       *   description column. so the single field that steers a caller's pick crossed the
       *   boundary with no reader — and a stale superlative shipped through it
       *   (`claude/opus/v4.5` read "most capable" while its own `sweVer` was 81 against
       *   fable 5 at 90). `BrainAtom.superlative.test.ts` now clamps that class; this
       *   snapshot is the OTHER half — it puts the composed text in front of a human in
       *   the pr diff (`rule.require.snapshots`).
       *
       * .why COMPOSED, not the raw config literal: the deprecated rungs carry an appended
       *   ⚠️ clause from `asBrainDescription`, and that suffix is the part a caller most
       *   needs and the part a config-level read would miss entirely.
       */
      then('the descriptions a consumer reads match the snapshot', () => {
        const atoms = getBrainAtomsByAnthropic();
        expect(
          Object.fromEntries(
            atoms.map((atom) => [atom.slug, atom.description]),
          ),
        ).toMatchSnapshot();
      });
    });
  });

  given('[case2] getBrainReplsByAnthropic', () => {
    when('[t0] called', () => {
      then('it registers every declared repl slug, and only those', () => {
        const repls = getBrainReplsByAnthropic();
        expect(repls.map((repl) => repl.slug)).toEqual([
          ...ANTHROPIC_BRAIN_REPL_SLUGS,
        ]);
      });

      then('returns BrainRepl instances', () => {
        const repls = getBrainReplsByAnthropic();
        for (const repl of repls) {
          expect(repl).toBeInstanceOf(BrainRepl);
        }
      });

      /**
       * .why = the repl twin, per `repair both twins in the same pass`. it is NOT a
       *   duplicate of the atom snapshot: a repl's `replacedBy` pointer must name a slug
       *   in the REPL namespace, so the deprecated rows differ in the one way that
       *   matters most to a repl caller — a pointer at `claude/sonnet/v5` would send them
       *   to a slug `genBrainRepl` rejects.
       */
      then('the repl descriptions match the snapshot', () => {
        const repls = getBrainReplsByAnthropic();
        expect(
          Object.fromEntries(
            repls.map((repl) => [repl.slug, repl.description]),
          ),
        ).toMatchSnapshot();
      });

      /**
       * ⚠️ the DERIVED clamp beside the snapshot, and it is the one that cannot be
       *   waved through. a snapshot is `--resnap`-able: a later edit that collapsed
       *   these back to one boilerplate line would go red once and green forever after
       *   a routine resnap, with the regression baked into the committed baseline.
       *   this states the PROPERTY, so no resnap can satisfy it.
       *
       * ⚠️ the property is "TRACKS the model", not "is distinct". a first draft of this
       *   clamp asserted distinctness and it was a FALSE GREEN — caught only because the
       *   dogfood revert was run and its per-assertion output was read. the prior text
       *   was `claude code (${slug}) - …`, which echoes the KEY, so it produced 18
       *   perfectly distinct strings while it carried no information at all. to echo the
       *   key is distinct. distinctness was never the defect.
       *
       * .why THIS direction bites: the prior form told a caller that `claude/code`,
       *   `claude/code/sonnet` and `claude/code/sonnet/v5` were three different things.
       *   they are one model — `claude-sonnet-5`. so it split what is identical, which
       *   is the same misdirection as merged text on what differs.
       *
       * .why not a clamp on our exact words: the fix could be worded another way, and a
       *   clamp on the phrase would fight the next honest rewrite. this states the
       *   relation instead — the description is a function OF the model.
       *
       * .note = the deprecation suffix does not disturb the group, since each retired
       *   model here is reached by exactly one repl slug. a future rung that shares a
       *   model with a retired one would need this to compare the base alone.
       */
      then('repl slugs that share a model share a description', () => {
        const repls = getBrainReplsByAnthropic();
        const textBySlug = new Map(
          repls.map((repl) => [repl.slug, repl.description]),
        );

        const slugsByModel = new Map<string, string[]>();
        for (const slug of ANTHROPIC_BRAIN_REPL_SLUGS) {
          const { model } = CONFIG_BY_REPL_SLUG[slug];
          slugsByModel.set(model, [...(slugsByModel.get(model) ?? []), slug]);
        }

        const modelsSplit = [...slugsByModel.entries()]
          .filter(
            ([, slugs]) =>
              new Set(slugs.map((slug) => textBySlug.get(slug))).size > 1,
          )
          .map(([model]) => model);

        expect(modelsSplit).toEqual([]);

        // guards the read above from a vacuous pass: it only means something where a
        // model IS shared by more than one slug (`rule.forbid.failhide`)
        const modelsShared = [...slugsByModel.values()].filter(
          (slugs) => slugs.length > 1,
        );
        expect(modelsShared.length).toBeGreaterThan(0);
      });
    });
  });

  given('[case3] genBrainAtom factory', () => {
    when('[t0] called with claude/sonnet slug', () => {
      const atom = genBrainAtom({ slug: 'claude/sonnet' });

      then('returns BrainAtom instance', () => {
        expect(atom).toBeInstanceOf(BrainAtom);
      });

      then('has correct slug', () => {
        expect(atom.slug).toEqual('claude/sonnet');
      });
    });
  });

  given('[case4] genBrainRepl factory', () => {
    when('[t0] called with claude/code slug', () => {
      const repl = genBrainRepl({ slug: 'claude/code' });

      then('returns BrainRepl instance', () => {
        expect(repl).toBeInstanceOf(BrainRepl);
      });

      then('has correct slug', () => {
        expect(repl.slug).toEqual('claude/code');
      });
    });
  });
});
