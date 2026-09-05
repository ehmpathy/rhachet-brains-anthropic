import { BadRequestError } from 'helpful-errors';

import { PREFIX_SLUG_ATOM, PREFIX_SLUG_REPL } from './asBrainSlugPrefixes';
import type { AnthropicBrainAtomSlug } from './BrainAtom.config';
import {
  ANTHROPIC_BRAIN_REPL_SLUGS,
  type AnthropicBrainReplSlug,
} from './BrainRepl.config';

/**
 * .what = maps an atom slug to its repl twin, e.g. `claude/opus/v5` → `claude/code/opus/v5`
 * .why = the two ladders share one config object, so `deprecated.replacedBy` can only
 *   hold an ATOM slug. handed to a repl reader as-is it points at a slug `genBrainRepl`
 *   does not accept.
 * .note = looks the twin up rather than trusts the string transform, so a future
 *   partial mirror fails loud here instead of a dead slug that reaches a reader.
 */
export const asReplSlugFromAtomSlug = (input: {
  slug: AnthropicBrainAtomSlug;
}): AnthropicBrainReplSlug => {
  const candidate = input.slug.replace(PREFIX_SLUG_ATOM, PREFIX_SLUG_REPL);
  const twin = ANTHROPIC_BRAIN_REPL_SLUGS.find((slug) => slug === candidate);
  if (!twin)
    throw new BadRequestError('this atom slug has no repl twin to point at', {
      slug: input.slug,
      candidate,
      hint: 'every atom slug needs a `claude/code/...` twin in ANTHROPIC_BRAIN_REPL_SLUGS',
    });
  return twin;
};
