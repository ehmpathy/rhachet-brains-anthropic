import type { BrainPlatform } from './BrainAtom.config';

/**
 * .what = the human name of a partner platform, e.g. 'bedrock' -> 'Amazon Bedrock'
 * .why = the union member is the storable fact; this is its display form. kept apart
 *   so the config never holds a vendor's brand text.
 */
const asPlatformHuman = (platform: BrainPlatform): string =>
  ({ bedrock: 'Amazon Bedrock', 'google-cloud': 'Google Cloud' })[platform];

/**
 * .what = the sentence a reader gets about where a retired rung is still reachable
 *
 * .why DERIVED, rather than a `reason` string typed per rung in the config. the
 *   sentence asserts a vendor fact, and it used to be hand-written per rung and
 *   rendered verbatim into a GENERATED readme table — so one hand-copy survived
 *   inside the machinery built to delete hand-copies.
 *
 * ⚠️ it had already gone wrong once, mid-build: opus 4 is Google-Cloud ONLY, not
 *   Bedrock+GCP. prose let two rungs disagree while both read plausibly; a
 *   `BrainPlatform[]` cannot, and one derivation keeps every reader in step.
 *
 * .why it lives in `brains/` rather than in `registry/` = it has THREE consumers.
 *   `atoms/` and `repls/` both thread it into the consumer brain object, and
 *   `registry/` renders it into the readme. two of those are siblings of the third,
 *   so a home in any one of them is the reach-in `rule.forbid.scope-leaks` names
 *   (`rule.prefer.most-common-denominator`).
 *
 * .note = the derivation exists because rhachet's own `BrainAtom` contract types
 *   `deprecated.reason` as a `string`. so the prose is not ours to delete — only to
 *   stop the hand-written per-rung copies. structure in, prose out, at the boundary.
 *
 * ⚠️ ONE sentence, TWO carriers — and the second is the one that rots unseen:
 *
 *   | carrier | rendered by | snapped in |
 *   |---|---|---|
 *   | the readme deprecated-rung lines | `registry/asBrainRegistryMarkdown.ts` | `registry/__snapshots__/asBrainRegistryMarkdown.test.ts.snap` |
 *   | each brain's `deprecated.reason` field | this function, threaded through `atoms/` + `repls/` | `contract/sdk/__snapshots__/index.test.ts.snap` |
 *
 *   the readme carrier sits BESIDE a caveat paragraph that names the repl exception.
 *   the sdk carrier is a flat string with no such neighbor, so it must stand alone.
 *
 * ⚠️ the last clause therefore says `will not serve you this rung`, NOT `will fail`.
 *   a failure claim is exact for the ATOM rungs and FALSE for `claude/code/opus/v4`:
 *   we measured that one, and the agent-sdk accepts the retired slug then SUBSTITUTES
 *   `claude-opus-5` rather than refuse — the call succeeds, and only
 *   `asUsageFromModelUsage` catches the swap. do NOT sharpen it back to a failure
 *   claim without a re-measure of the repl ladder.
 *
 *   the readme intro carries the same softened phrasing plus a ⚠️ paragraph that names
 *   the substitution outright. the sdk field gets no such paragraph, which is why the
 *   nuance has to live inside this one sentence.
 *
 *   so: an edit here moves BOTH carriers. do not assume a repair to the readme half
 *   reached the sdk half — the readme has a paragraph to absorb the nuance, and the
 *   sdk field does not.
 */
export const asDeprecatedReason = (input: {
  platforms: BrainPlatform[];
}): string => {
  // an EMPTY list is meaningful, not absent data: the rung is retired everywhere, so
  // there is no client to inject and the slug is unreachable rather than awkward
  if (input.platforms.length === 0)
    return 'retired on every platform we can reach. no injected client recovers it — move to the replacement.';

  const names = input.platforms.map(asPlatformHuman);
  const served =
    names.length === 1
      ? `${names[0]} ONLY`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  // ⚠️ the tail reads `will not serve you this rung`, NOT `will fail`. see the ⚠️ block
  //   above: on the repl ladder the sdk SUBSTITUTES rather than refuses, so a failure
  //   claim would be false for `claude/code/opus/v4` — and this string is the ONLY
  //   prose a reader of the sdk field ever gets.
  return `retired on the first-party Claude API. still served on ${served}, so it stays reachable via an injected client (context.anthropic). the default client will not serve you this rung.`;
};
