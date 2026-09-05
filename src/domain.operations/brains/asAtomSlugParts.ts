import { UnexpectedCodePathError } from 'helpful-errors';

import type { AnthropicBrainAtomSlug } from './BrainAtom.config';

/**
 * .what = splits an atom slug into its two axes: `claude/{tier}/{rung?}`
 * .why = positional index reads (`slug.split('/')[1]`) sat inline in two test
 *   fixtures, where the reader had to count segments to learn which axis was meant
 *   (`rule.forbid.inline-decode-friction`).
 * .note = `rung` is absent for a bare tier alias, which is the alias that MOVES.
 *
 * .note = the tier throws rather than casts. every member of the slug union carries
 *   a tier, but `split` returns a plain `string[]`, so the compiler cannot see that
 *   — and an `as string` there would only silence the compiler while a malformed
 *   slug flowed on as `undefined` (`rule.forbid.as-cast`). the throw keeps the same
 *   return type and turns an impossible case into a loud one.
 */
export const asAtomSlugParts = (input: {
  slug: AnthropicBrainAtomSlug;
}): { tier: string; rung: string | null } => {
  const [, tier, rung] = input.slug.split('/');
  return {
    tier:
      tier ??
      UnexpectedCodePathError.throw('an atom slug carries no tier segment', {
        slug: input.slug,
        hint: 'every slug must read `claude/{tier}` or `claude/{tier}/{rung}`',
      }),
    rung: rung ?? null,
  };
};
