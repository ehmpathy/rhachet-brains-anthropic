import { given, then, when } from 'test-fns';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  type AnthropicBrainAtomSlug,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

/**
 * .what = clamps that each rung asks for ITS OWN output limit, not a shared one
 *
 * .why = the cap was a single `MAX_TOKENS_PER_CALL = 16384` in `genBrainAtom`, and it
 *   was the one per-rung fact the registry did not model — every sibling
 *   (`thought`, `tokenizer`, `deprecated`, `spec.gain.size.context`) is a field. one
 *   number spoke for thirteen rungs whose published limits span an 8x range.
 *
 * ⚠️ the flat cap penalized the FRONTIER rungs hardest, which inverts what a caller
 *   pays for. thought tokens draw from the same budget, and every rung from 4.6 up
 *   thinks by default at `effort: high` — so under a shared 16K cap an opus 5 call had
 *   less room for its answer than the opus 4.5 call it replaced, on a rung that serves
 *   128K. the truncation guard made that loud, but loud is not fixed.
 *
 * .why A TEST, and not just the field: the regression is a one-line revert. a future
 *   edit that reaches for "one safe number for all rungs" reads as tidy, and no other
 *   check in the repo would object (`rule.require.clamp-edge-cases`).
 *
 * .note = a UNIT test over a literal. no factory, no credential, no network.
 */
const EXPECTED_MAX_OUTPUT_TOKENS: Record<AnthropicBrainAtomSlug, number> = {
  // ⚠️ the three RETIRED rungs carry the prior conservative default, NOT a vendor
  //   figure — the docs publish no max-output for a retired model. they are pinned here
  //   so a later edit cannot quietly promote a guess into a cited fact.
  'claude/haiku/v3.5': 16_384,
  'claude/sonnet/v4': 16_384,
  'claude/opus/v4': 16_384,

  // 64K — the last 200K-context rungs; src: models/{haiku-4-5,sonnet-4-5,opus-4-5}/overview
  'claude/haiku': 64_000,
  'claude/haiku/v4.5': 64_000,
  'claude/sonnet/v4.5': 64_000,
  'claude/opus/v4.5': 64_000,

  // 128K — every 1M-context rung; src: models/overview + each rung's own page
  'claude/sonnet': 128_000,
  'claude/sonnet/v4.6': 128_000,
  'claude/sonnet/v5': 128_000,
  'claude/opus': 128_000,
  'claude/opus/v4.6': 128_000,
  'claude/opus/v4.7': 128_000,
  'claude/opus/v4.8': 128_000,
  'claude/opus/v5': 128_000,
  'claude/fable': 128_000,
  'claude/fable/v5': 128_000,
};

describe('each rung asks for its own output limit', () => {
  given('[case1] the registered atom ladder', () => {
    when('[t0] every rung is read', () => {
      // ⚠️ THE clamp. a revert to one shared global passes every per-rung assertion
      //   below if that global happened to match — this is the line that cannot.
      then('the caps VARY across rungs, so no single global is in play', () => {
        const capsDistinct = new Set(
          ANTHROPIC_BRAIN_ATOM_SLUGS.map(
            (slug) => CONFIG_BY_ATOM_SLUG[slug].maxOutput.tokens,
          ),
        );
        expect(capsDistinct.size).toBeGreaterThan(1);
      });

      // .why = the expected table is transcribed from the vendor's published pages, so
      //   this is the clamp on the transcription. a rung added without a verified
      //   figure reddens here rather than shipping a guess.
      then('each rung carries its published limit', () => {
        const capsActual = Object.fromEntries(
          ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) => [
            slug,
            CONFIG_BY_ATOM_SLUG[slug].maxOutput.tokens,
          ]),
        );
        expect(capsActual).toEqual(EXPECTED_MAX_OUTPUT_TOKENS);
      });

      // .why = a cap above the context window is incoherent — the output shares that
      //   window — and the api would reject it. cheap to state, and it catches a
      //   transposed pair (a 128K cap written onto a 200K-context rung is legal; a 1M
      //   cap on any rung is not).
      then('no cap exceeds its own rung context window', () => {
        const overruns = ANTHROPIC_BRAIN_ATOM_SLUGS.filter((slug) => {
          const config = CONFIG_BY_ATOM_SLUG[slug];
          return config.maxOutput.tokens > config.spec.gain.size.context.tokens;
        });
        expect(overruns).toEqual([]);
      });

      // .why = the rungs that think by default need the MOST room, and the flat cap
      //   gave them the least. this states the property the fix bought, so a later
      //   edit that re-squeezes them reddens with the reason attached.
      then('rungs that think by default are not the most constrained', () => {
        const capsOfAdaptive = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
          (slug) => CONFIG_BY_ATOM_SLUG[slug].thought.mode === 'adaptive',
        ).map((slug) => CONFIG_BY_ATOM_SLUG[slug].maxOutput.tokens);
        const capsOfRest = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
          (slug) => CONFIG_BY_ATOM_SLUG[slug].thought.mode !== 'adaptive',
        ).map((slug) => CONFIG_BY_ATOM_SLUG[slug].maxOutput.tokens);

        // guards the two reads above from a vacuous pass on an empty list
        expect(capsOfAdaptive.length).toBeGreaterThan(1);
        expect(capsOfRest.length).toBeGreaterThan(1);

        expect(Math.min(...capsOfAdaptive)).toBeGreaterThanOrEqual(
          Math.max(...capsOfRest),
        );
      });
    });
  });
});
