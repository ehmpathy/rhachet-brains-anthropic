import { UnexpectedCodePathError } from 'helpful-errors';

/**
 * .what = the per-model token breakdown the claude-agent-sdk reports on its result
 *   message, keyed by the model id that spent the tokens
 * .ref = https://platform.claude.com/docs/en/agent-sdk/cost-tracking
 */
export type ModelUsageBySdk = Record<
  string,
  {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  }
>;

/**
 * .what = totals the sdk's per-model token breakdown into the one usage shape a
 *   `BrainOutput` carries, and refuses to do so when the model we ASKED for spent
 *   no tokens at all
 *
 * .why = the totals are re-priced downstream at the rate of `config.model`
 *   (`calcBrainOutputCost`). that re-price is only meaningful if the model we asked
 *   for is the model that ran. the sdk chooses its own model when it does not
 *   recognize the id we hand it, and it says so out loud — its cli prints
 *   "costs may be inaccurate due to usage of unknown models". a plain sum over
 *   `Object.values` throws that declaration away and hands the caller a confident
 *   number priced for a model that never ran (`rule.forbid.failhide`).
 *
 * ⚠️ this matters MOST on the newest rungs. a frontier id we register today may be
 *   an id the pinned sdk has never heard of, so the swap is likeliest exactly where
 *   the cost figure is watched hardest.
 *
 * .note = the bound, stated plainly. a query may legitimately span more than one
 *   model — the sdk delegates subagent turns to a cheaper one. those tokens are
 *   real spend, so they are INCLUDED in the totals, and they are priced at the
 *   requested model's rate. that OVER-states cost when a cheaper subagent ran,
 *   which is the safe direction and is visible to a reader here. what it never does
 *   is price a whole query for a model that never ran — that case throws.
 *
 * .note = an absent or empty `modelUsage` yields zeros rather than a throw. the sdk
 *   omits the field on a result that spent no tokens, and a zero-token result is a
 *   normal outcome, not a defect.
 */
export const asUsageFromModelUsage = (input: {
  modelUsage: ModelUsageBySdk | undefined;
  model: string;
}): {
  inputTokens: number;
  outputTokens: number;
  cacheGetTokens: number;
  cacheSetTokens: number;
} => {
  const zeroed = {
    inputTokens: 0,
    outputTokens: 0,
    cacheGetTokens: 0,
    cacheSetTokens: 0,
  };
  if (!input.modelUsage) return zeroed;

  const modelsRan = Object.keys(input.modelUsage);
  if (modelsRan.length === 0) return zeroed;

  // fail-fast: the model we asked for spent no tokens, so a re-price at its rate is fiction
  if (!modelsRan.includes(input.model))
    throw new UnexpectedCodePathError(
      'the claude-agent-sdk reported token usage for no model we requested, so the cost cannot be priced',
      {
        modelRequested: input.model,
        modelsRan,
        hint: 'the sdk substitutes its own model when it does not recognize the id it is handed. check that this rung is served by the installed @anthropic-ai/claude-agent-sdk version',
      },
    );

  return Object.values(input.modelUsage).reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + (usage.inputTokens ?? 0),
      outputTokens: total.outputTokens + (usage.outputTokens ?? 0),
      cacheGetTokens: total.cacheGetTokens + (usage.cacheReadInputTokens ?? 0),
      cacheSetTokens:
        total.cacheSetTokens + (usage.cacheCreationInputTokens ?? 0),
    }),
    zeroed,
  );
};
