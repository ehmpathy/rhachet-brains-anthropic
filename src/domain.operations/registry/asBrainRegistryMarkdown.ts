import { UnexpectedCodePathError } from 'helpful-errors';
import {
  asIsoPriceHuman,
  IsoPriceExponent,
  priceMultiply,
  setPricePrecision,
} from 'iso-price';

import { asAtomSlugParts } from '../brains/asAtomSlugParts';
import { asDeprecatedReason } from '../brains/asDeprecatedReason';
import { asReplSlugFromAtomSlug } from '../brains/asReplSlugFromAtomSlug';
import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  type AnthropicBrainAtomSlug,
  type BrainConfig,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';
import {
  ANTHROPIC_BRAIN_REPL_SLUGS,
  CONFIG_BY_REPL_SLUG,
} from '../brains/BrainRepl.config';

/**
 * .what = markers that bound the generated section of the readme
 * .why = lets the generated table replace its own prior output in place, so the
 *   readme keeps its hand-written prose around it
 */
export const MARKER_BRAINS_HEAD = '<!-- generated:brains:head -->';
export const MARKER_BRAINS_FOOT = '<!-- generated:brains:foot -->';

/**
 * .what = renders a per-MTok rate pair as a human price, e.g. `$3 / $15`
 * .why = the config stores a per-token price, which is unreadable at 6 decimal places
 */
const asRatePerMTok = (config: BrainConfig): string => {
  // .note = the config stores a per-token price at nano precision. a multiply
  //   preserves that precision, so round back to the currency default for display —
  //   otherwise `$3` renders as `$3.000000`.
  const input = setPricePrecision({
    of: priceMultiply({ of: config.spec.cost.cash.input, by: 1_000_000 }),
    to: IsoPriceExponent.CENTI,
  });
  const output = setPricePrecision({
    of: priceMultiply({ of: config.spec.cost.cash.output, by: 1_000_000 }),
    to: IsoPriceExponent.CENTI,
  });
  return `${asIsoPriceHuman(input)} / ${asIsoPriceHuman(output)}`;
};

/**
 * .what = renders the context window as a human count, e.g. `1M` or `200K`
 */
const asContextHuman = (config: BrainConfig): string => {
  const tokens = config.spec.gain.size.context.tokens;
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${tokens / 1_000}K`;
};

/**
 * .what = renders how the model thinks, and what it costs the caller
 * .why = this column is the whole reason the table is generated rather than
 *   hand-kept. "pin one rung back" looks conservative and is often the expensive
 *   choice; only this column makes that visible at the point of choice.
 */
const asThoughtHuman = (config: BrainConfig): string => {
  if (config.thought.mode === 'none') return 'none';
  if (config.thought.mode === 'extended') return 'on request';
  return `by default (effort: ${config.thought.effort})`;
};

/**
 * .what = which tokenizer generation counts this row's tokens
 *
 * ⚠️ .why the warn points at this COLUMN rather than list rungs = a rung list cannot
 *   name a bare alias. `asRungsOf` drops one on purpose — an alias has no rung to
 *   print — so any rung-shaped warn is silent on `claude/opus`, `claude/sonnet`,
 *   `claude/fable` and `claude/code`, the four slugs a caller reaches for most. worse,
 *   the words a rung list invites ("every OTHER rung counts with the older one") push
 *   that reader toward the wrong side, since all four resolve to a 5-gen model.
 *
 *   a per-row cell covers an alias by construction, because an alias row carries the
 *   config of the rung it resolves to. so the warn names the two cell VALUES —
 *   `4.7+` and `pre-4.7` — and every row answers for itself.
 *
 * .note = `thought` took the same shape for the same reason; the two warns merged into
 *   one "read these two columns" line once both had a cell to point at.
 */
const asTokenizerHuman = (config: BrainConfig): string => config.tokenizer;

/**
 * .what = renders the deprecation mark, or a dash when the rung is current
 * .why = `as` selects which table the pointer is rendered for, so a repl row names a
 *   repl slug and an atom row names an atom slug
 */
const asDeprecatedHuman = (input: {
  config: BrainConfig;
  as: 'atom' | 'repl';
}): string => {
  const { deprecated } = input.config;
  if (!deprecated) return '—';
  const replacedBy =
    input.as === 'repl'
      ? asReplSlugFromAtomSlug({ slug: deprecated.replacedBy })
      : deprecated.replacedBy;
  return `🪦 ${deprecated.since} → \`${replacedBy}\``;
};

/**
 * .what = the distinct rungs a set of slugs covers, sorted, with bare aliases dropped
 * .why = every derived warn below names rungs, not slugs — a caller pins a rung. a
 *   bare alias has no rung, so it is dropped rather than rendered as an empty tick.
 */
const asRungsOf = (input: {
  slugs: readonly AnthropicBrainAtomSlug[];
}): string[] =>
  [
    ...new Set(
      input.slugs
        .map((slug) => asAtomSlugParts({ slug }).rung)
        .filter((rung): rung is string => rung !== null),
    ),
  ].sort();

/**
 * .what = a rung set, rendered as the backticked comma list a warn reads inline
 * .why = each warn embedded `rungs.map((r) => ...).join(', ')` in its own template, so
 *   a reader had to simulate a map+join to learn the shape of the list
 *   (`rule.forbid.inline-decode-friction`). the SET is already named one level up; this
 *   names how it is DISPLAYED, so each warn reads as one call per claim.
 */
const asRungListHuman = (input: { rungs: string[] }): string =>
  input.rungs.map((rung) => `\`${rung}\``).join(', ');

/**
 * .what = the rungs that still think ONLY when asked
 * .why = the ⚠️ warn about "pin one rung back" names these rungs, and the predicate that
 *   selects them (`thought.mode === 'extended'`) is the definition of the claim. left
 *   inline, a reader had to simulate the fold to learn what "thinks on request" meant.
 *
 * .note = the selection is DERIVED, never typed out. a rung whose `thought.mode` changes
 *   moves in or out of this list on its own, so the prose cannot go stale under a green
 *   clamp — the hand-copy drift the generated table exists to remove, one level down.
 */
const getAllRungsThatThinkOnRequest = (): string[] =>
  asRungsOf({
    slugs: ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
      (slug) => CONFIG_BY_ATOM_SLUG[slug].thought.mode === 'extended',
    ),
  });

/**
 * .what = one markdown bullet per retired rung, with the reason it was retired
 * .why = a filter+flatMap inline in the return array read as a fold a reader had to
 *   simulate to learn the list holds one line per deprecated rung.
 *
 * ⚠️ .why it takes a LADDER rather than read the atom ladder directly = it once read
 *   `ANTHROPIC_BRAIN_ATOM_SLUGS` alone, so the footer listed three atom slugs and no
 *   repl slug — while the repl TABLE above it renders its own 🪦 badges in the repl
 *   namespace (`claude/code/opus/v4 → claude/code/opus/v5`, via
 *   `asDeprecatedHuman({ as: 'repl' })`).
 *
 *   so a reader of the repl table followed their own badge down to a footer that never
 *   named the slug they held, and had to infer that a strip of the `code/` segment lands
 *   them on an atom bullet. this document explicitly tells them NOT to make that kind of
 *   translation — its own header warns that a bare `claude/opus` is not what the cli
 *   takes. one surface asked for the inference the other forbids.
 *
 *   generic over the slug type so each ladder renders its own namespace, which is the
 *   same shape `asRegistryRow` already uses to keep the two tables honest.
 */
const asDeprecatedRungLines = <TSlug extends string>(input: {
  slugs: readonly TSlug[];
  configBySlug: Record<TSlug, BrainConfig>;
}): string[] =>
  input.slugs
    .filter((slug) => input.configBySlug[slug].deprecated)
    .map((slug) => {
      const deprecated = input.configBySlug[slug].deprecated;
      if (!deprecated)
        throw new UnexpectedCodePathError(
          'a slug passed the deprecated filter but carries no deprecated field',
          { slug },
        );
      return `- \`${slug}\` — ${asDeprecatedReason({ platforms: deprecated.platforms })}`;
    });

/**
 * .what = one markdown table row for one slug, in the shipped column order
 *
 * .why = both ladders render the SAME seven columns off the same `BrainConfig`, so
 *   the row shape is one fact, not two. inline in the orchestrator it was two folds a
 *   reader had to simulate to learn which config field lands in which column — and
 *   two folds that could drift apart, which would put the atom and repl tables in
 *   different column orders under one shared header
 *   (`rule.forbid.inline-decode-friction`).
 *
 * .note = `as` is not cosmetic. `deprecated.replacedBy` holds an ATOM slug, so a repl
 *   row must map it into the reader's own namespace or it names a slug `genBrainRepl`
 *   refuses. the parameter is what keeps that one asymmetry explicit while the rest
 *   of the row stays shared.
 */
const asRegistryRow = (input: {
  slug: string;
  config: BrainConfig;
  as: 'atom' | 'repl';
}): string => {
  const { slug, config } = input;
  const cells = [
    `\`${slug}\``,
    config.model,
    asRatePerMTok(config),
    asContextHuman(config),
    asThoughtHuman(config),
    asTokenizerHuman(config),
    config.spec.gain.cutoff,
    asDeprecatedHuman({ config, as: input.as }),
  ];
  return `| ${cells.join(' | ')} |`;
};

/**
 * .what = the header lines both ladders render above their rows
 *
 * .why = the column ORDER is one fact, and `asRegistryRow` already owns it for the
 *   cells. the header was two separate string literals, so a column added to the row
 *   transformer and to one header would leave the other table's cells shifted under
 *   the wrong titles — a silent mislabel, not a compile error. the row's own docblock
 *   claimed the columns "cannot drift"; that held for the cells and NOT for the
 *   titles above them. this closes the half the claim did not cover.
 */
const REGISTRY_TABLE_HEADER = [
  '| slug | model | rate ($/MTok in / out) | context | thought | tokenizer | cutoff | deprecated |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];

/**
 * .what = renders the atom + repl registry as markdown tables
 * .why = the readme table and the shipped slug union used to be two hand-kept
 *   copies, compared by eye, so they could drift silently. this makes the config
 *   the one source: the table is derived from it, so agreement is structural
 *   rather than tested.
 *
 * .note = pure. takes no input and reads only module-level config, so it is unit
 *   testable with no mocks and no boundary crossed.
 */
export const asBrainRegistryMarkdown = (): string => {
  const atomRows = ANTHROPIC_BRAIN_ATOM_SLUGS.map((slug) =>
    asRegistryRow({ slug, config: CONFIG_BY_ATOM_SLUG[slug], as: 'atom' }),
  );

  // .note = the columns MATCH the atom table, cutoff included — and now they cannot
  //   drift, since both ladders call ONE row transformer. both tables read the same
  //   config objects, so every atom column is free for a repl row; an omission would
  //   be a render choice, not a data limit, and it would leave a caller who pins a
  //   repl rung blind to a fact the equivalent atom row shows.
  const replRows = ANTHROPIC_BRAIN_REPL_SLUGS.map((slug) =>
    asRegistryRow({ slug, config: CONFIG_BY_REPL_SLUG[slug], as: 'repl' }),
  );

  const rungsThinkOnRequest = getAllRungsThatThinkOnRequest();

  return [
    MARKER_BRAINS_HEAD,
    '',
    '<!-- do NOT edit by hand. run `npm run fix:readme` to regenerate. -->',
    '',
    '### atoms (via genBrainAtom)',
    '',
    'stateless inference without tool use. uses the anthropic messages api with',
    'structured outputs.',
    '',
    '⚠️ **a bare alias MOVES.** `claude/opus` tracks the newest opus, so it crosses major',
    'generations on your next `npm update`. pin a rung to freeze the `model` id. note the vendor',
    'inverts this word: it calls a dateless id like `claude-opus-5` a pinned snapshot, not an alias.',
    '',
    '⚠️ **a pinned rung freezes the model id, NOT the behavior — read two columns before you pin.**',
    `\`thought\`: most rungs think by default, which raises output tokens per call; only ${asRungListHuman({ rungs: rungsThinkOnRequest })} still`,
    'think on request, and they pay for it with a smaller context. `tokenizer`: a `4.7+` row counts',
    'roughly 30% more tokens than a `pre-4.7` row for the same text, so a token budget or a',
    '`metrics.size.tokens` comparison does not carry across that line.',
    '',
    ...REGISTRY_TABLE_HEADER,
    ...atomRows,
    '',
    '### repls (via genBrainRepl)',
    '',
    'agentic code assistant with tool use via claude-agent-sdk. repl slugs mirror the atom',
    'ladder rung for rung and reuse its configs.',
    '',
    '⚠️ **the bare `claude/code` MOVES too.** it rides the newest sonnet, so the default repl',
    'changes model across a version bump just as `claude/sonnet` does. pin `claude/code/sonnet/v4.5`',
    'to freeze it.',
    '',
    ...REGISTRY_TABLE_HEADER,
    ...replRows,
    '',
    '### deprecated rungs',
    '',
    'a 🪦 rung is retired on the **first-party** Claude API but still served on a partner',
    'platform. it stays registered because a caller who injects their own client',
    '(`context.anthropic`) can still reach it. on the default client it will not serve you —',
    'so read the reason before you pin one:',
    '',
    '⚠️ **on the repl ladder, one of these does not fail — it answers with a DIFFERENT model.**',
    '`claude/code/opus/v4` is accepted by claude-agent-sdk, which then quietly runs',
    '`claude-opus-5` and replies as though the pin were honored. we catch it —',
    '`asUsageFromModelUsage` refuses token usage for a model we did not request — so you get an',
    "error rather than a wrong answer at a wrong price. but that guard is ours, not the sdk's.",
    'the other two repl rungs below refuse loudly at the sdk. verified live in',
    '`BrainRepl.slugReach.integration.test.ts`.',
    '',
    // .note = BOTH ladders, each in its own namespace. a reader who follows a 🪦 badge
    //   from either table finds the exact slug they hold, rather than a slug they must
    //   translate to reach.
    ...asDeprecatedRungLines({
      slugs: ANTHROPIC_BRAIN_ATOM_SLUGS,
      configBySlug: CONFIG_BY_ATOM_SLUG,
    }),
    ...asDeprecatedRungLines({
      slugs: ANTHROPIC_BRAIN_REPL_SLUGS,
      configBySlug: CONFIG_BY_REPL_SLUG,
    }),
    '',
    MARKER_BRAINS_FOOT,
  ].join('\n');
};
