import { given, then, when } from 'test-fns';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  type AnthropicBrainAtomSlug,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

/**
 * .what = clamps that a `deprecated.replacedBy` pointer lands on a rung a caller can use
 *
 * .why = the pointer is the ONLY migration instruction a stranded caller gets. the
 *   readme renders it, `asBrainDescription` renders it, and a caller who reaches a
 *   retired rung reads it and moves. so a pointer at a rung that is ITSELF retired
 *   sends that caller from one dead end to the next, with no signal that it did.
 *
 * ⚠️ this is latent drift rather than a defect today — and that is exactly why it wants
 *   a clamp. every pointer here is correct as written; the hazard opens the day the
 *   NEXT rung retires, because the retirement edit touches the newly-retired config and
 *   has no reason to look at who points AT it. the mistake is invisible at the site
 *   where it is made (`rule.require.clamp-edge-cases`).
 *
 * .where = `brains/`, beside the config it reads. it is a claim about the registry, so
 *   it belongs to neither `atoms/` nor `repls/`.
 *
 * .note = a UNIT test over a literal. no factory, no credential, no network.
 */
const pointersDeprecated: {
  slug: AnthropicBrainAtomSlug;
  replacedBy: AnthropicBrainAtomSlug;
}[] = ANTHROPIC_BRAIN_ATOM_SLUGS.flatMap((slug) => {
  // .why FLATMAP, rather than a filter plus a `!` on each read. the filter loses the
  //   narrow, so every later read needs a non-null assertion — three assertions of a
  //   fact the code just proved. one pass keeps the narrow and drops all three.
  const deprecated = CONFIG_BY_ATOM_SLUG[slug].deprecated;
  if (!deprecated) return [];
  return [{ slug, replacedBy: deprecated.replacedBy }];
});

describe('deprecated rungs point at a live rung', () => {
  given('[case1] the registered atom ladder', () => {
    when('[t0] every deprecated rung is read', () => {
      // .why = the checks below are vacuously true over an empty list, so a rename or a
      //   filter typo would make this file report success while it read no config at
      //   all. this line is what makes the greens below mean something.
      then('the sweep actually finds deprecated rungs to check', () => {
        expect(pointersDeprecated.length).toBeGreaterThan(1);
      });

      // ⚠️ THE clamp. a pointer at a rung that is itself deprecated is a dead end that
      //   reads as a fix.
      then('each replacedBy target is NOT itself deprecated', () => {
        const deadEnds = pointersDeprecated.filter(
          (pointer) => CONFIG_BY_ATOM_SLUG[pointer.replacedBy]?.deprecated,
        );
        expect(deadEnds).toEqual([]);
      });

      // .why = the type union already forbids an unregistered slug at compile time, so
      //   this reads as redundant. it is not: `CONFIG_BY_ATOM_SLUG` is a hand-written
      //   literal, and a rung dropped from it while its slug stayed in the union would
      //   leave the pointer typed-valid and undefined at runtime. the check above reads
      //   `?.deprecated`, so it would pass over exactly that hole in silence.
      then('each replacedBy target is actually registered', () => {
        const unregistered = pointersDeprecated.filter(
          (pointer) => !CONFIG_BY_ATOM_SLUG[pointer.replacedBy],
        );
        expect(unregistered).toEqual([]);
      });

      // .why = a rung that points at itself is a loop, and it renders as advice to stay
      //   put. the pointer must move the caller.
      then('no rung points at itself', () => {
        const selfPointers = pointersDeprecated.filter(
          (pointer) => pointer.replacedBy === pointer.slug,
        );
        expect(selfPointers).toEqual([]);
      });
    });
  });
});
