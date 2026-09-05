import { PREFIX_SLUG_ATOM, PREFIX_SLUG_REPL } from './asBrainSlugPrefixes';
import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  type BrainConfig,
  CONFIG_BY_ATOM_SLUG,
} from './BrainAtom.config';

/**
 * .what = the repl ladder, and the atom config each of its rungs points at
 *
 * .why it lives in `brains/` rather than in `repls/` = it has two consumers, and one
 *   of them is a sibling: `repls/` builds a brain from it, and `registry/` renders it
 *   into the readme table beside the atom ladder. while this sat in `repls/`, the
 *   registry read a sibling subdomain's private store by relative path — and it did
 *   the same to `atoms/`, so the one composing layer reached into BOTH. lifting the
 *   pair to a common ancestor makes every registry dependency point downward.
 *
 * .note = the atom config lifted for the same reason and by the same rule
 *   (`rule.prefer.most-common-denominator`); see `BrainAtom.config`. the two moved
 *   together deliberately — a half-lift would have left the registry reaching sideways
 *   for one ladder while it read the other from a shared home.
 */

/**
 * .what = supported claude code repl slugs
 * .why = enables type-safe slug specification with model variants
 *
 * .note = declared as an array, with the union derived from it, so one list drives
 *   three things: the type, the registration in `getBrainReplsByAnthropic`, and the
 *   generated readme table. rhachet discovers only the slugs that registration
 *   RETURNS, so a slug declared here but absent there is invisible to
 *   `rhx review --brain`. one source removes that whole class of silent gap.
 *
 * .note = this ladder MIRRORS the atom ladder rung for rung. every
 *   `claude/{tier}/{rung}` atom slug has a `claude/code/{tier}/{rung}` twin, so a
 *   contributor follows one rule rather than a set of exceptions.
 *
 * .note = the bare `claude/code` slug maps to sonnet, NOT to the strongest tier. a
 *   caller who never picked a variant should not be moved onto a 5x rate.
 *
 * .note = the ladder is RAGGED, not a grid — it inherits the vendor's gaps. sonnet has
 *   no 4.7 or 4.8, haiku stops at 4.5, fable starts at 5. do NOT invent a slug to fill
 *   a gap; a slug must name a model that exists.
 */
export const ANTHROPIC_BRAIN_REPL_SLUGS = [
  // the bare default — sonnet, so an unopinionated caller stays on a mid rate
  'claude/code',
  // haiku — bare alias tracks the newest haiku
  'claude/code/haiku',
  'claude/code/haiku/v3.5',
  'claude/code/haiku/v4.5',
  // sonnet — bare alias tracks the newest sonnet
  'claude/code/sonnet',
  'claude/code/sonnet/v4',
  'claude/code/sonnet/v4.5',
  'claude/code/sonnet/v4.6',
  'claude/code/sonnet/v5',
  // opus — bare alias tracks the newest opus
  'claude/code/opus',
  'claude/code/opus/v4',
  'claude/code/opus/v4.5',
  'claude/code/opus/v4.6',
  'claude/code/opus/v4.7',
  'claude/code/opus/v4.8',
  'claude/code/opus/v5',
  // fable — bare alias tracks the newest fable
  'claude/code/fable',
  'claude/code/fable/v5',
] as const;

export type AnthropicBrainReplSlug =
  (typeof ANTHROPIC_BRAIN_REPL_SLUGS)[number];

/**
 * .what = repl config by slug — DERIVED from the atom ladder, never hand-mapped
 * .why = every entry except the bare default was a mechanical prefix swap of an atom
 *   slug, written out by hand. that made this map a SECOND source for a fact the atom
 *   config already held, and a second source is a place to drift — the exact defect
 *   class the generated readme (F6) removed one layer up. `BrainRepl.mirror.test.ts`
 *   existed to detect that drift AFTER it happened; a derivation forecloses it.
 *
 * .note = the SLUG ARRAY above stays hand-declared on purpose. it must be `as const`
 *   for `AnthropicBrainReplSlug` to name each member, and a derived array surrenders
 *   that — which would turn a typo from a compile error into a runtime one. so the
 *   type is declared and the VALUES are derived; the two halves have different needs.
 *
 * .note = the mirror test keeps its teeth. its [t0] block — every atom slug has a twin,
 *   and no repl slug is an orphan — still guards the hand-declared array, which is now
 *   the only hand-kept half. only its [t1] reference-equality block became true by
 *   construction, which is the point rather than a loss.
 */
export const CONFIG_BY_REPL_SLUG: Record<AnthropicBrainReplSlug, BrainConfig> =
  {
    // the whole ladder, derived: the atom slugs, prefix-swapped. aliases stay aliases
    // (so a repl alias MOVES exactly when its atom alias does) and pinned rungs stay
    // pinned, because each twin reuses the very config object its atom holds.
    //
    // .note = the cast is the one TypeScript cannot avoid — `Object.fromEntries` widens
    //   its keys to `string`, so the literal union is lost in transit. it rides an
    //   assertion rather than an assumption: `BrainRepl.mirror.test.ts` [t0] proves the
    //   derived key set is exactly the union, minus the bare default overridden below.
    //   removal path: a `fromEntries` overload that preserves key literals
    //   (`rule.forbid.as-cast`).
    ...(Object.fromEntries(
      ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) => [
        slug.replace(PREFIX_SLUG_ATOM, PREFIX_SLUG_REPL),
        CONFIG_BY_ATOM_SLUG[slug],
      ]),
    ) as Record<AnthropicBrainReplSlug, BrainConfig>),

    // the ONE exception, declared LAST so it reads as an override of the derivation.
    // it cannot be derived: the bare repl entry point has no atom twin, since atoms have
    // no bare slug. it rides sonnet by human decision F14 — a caller who never picked a
    // variant must not land on a 5x rate.
    //
    // .note = the derivation above produces no `claude/code` key today, so this is an
    //   addition rather than a true override. it sits last anyway, so that if the atom
    //   ladder ever DID yield that key, the human decision would win over the transform.
    'claude/code': CONFIG_BY_ATOM_SLUG['claude/sonnet'],
  };
