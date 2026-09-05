/**
 * .what = the request timeout, in ms, for an UNSTREAMED call that may emit `maxTokens`
 *   of output
 *
 * .why = without an explicit timeout the sdk REFUSES the call outright. it derives its
 *   own timeout from `max_tokens` and throws when that exceeds ten minutes:
 *
 *     expectedTime = (60min × maxTokens) / 128_000     // sdk client.js
 *     if (expectedTime > 10min) throw AnthropicError(…)
 *
 *   so the refusal threshold is `128_000 / 6 ≈ 21_333` tokens, and it is a HARD refusal
 *   — no request reaches the api, and the message names the stream mode rather than the
 *   cap that tripped it.
 *
 * ⚠️ this is the defect a drained account hid. ten of the thirteen rungs carry a
 *   `maxOutput` above that threshold (64_000 and 128_000 are the vendor's own published
 *   limits), so every unstreamed ask on them threw before it reached the api. the prior
 *   flat `16_384` cap sat just under the line, which is the only reason this went
 *   unseen — the per-rung caps are correct, and they crossed a limit no test could reach
 *   while the api answered `400 credit balance is too low` first.
 *
 * .why AN EXPLICIT TIMEOUT, rather than a smaller cap. the sdk skips the guard entirely
 *   when `timeout` is set (`!body.stream && timeout == null`), because the guard exists
 *   to protect a caller who never considered how long a large request runs. `max_tokens`
 *   is a CEILING, not a purchase — a short answer returns as fast as it ever did — so to
 *   shrink it to satisfy a timeout heuristic would give up the frontier headroom the
 *   per-rung caps exist to grant, and give it up on every call rather than the rare long
 *   one.
 *
 * .note = the figure is the sdk's OWN estimate for the same token count, floored at its
 *   own ten-minute default. so this asks for exactly the time the sdk predicts the work
 *   needs — it does not invent a more generous number.
 */
export const asUnstreamedTimeoutMs = (input: { maxTokens: number }): number => {
  const MS_PER_MINUTE = 60 * 1000;
  const TIMEOUT_MS_DEFAULT = 10 * MS_PER_MINUTE;
  const TIMEOUT_MS_AT_FULL_TOKENS = 60 * MS_PER_MINUTE;
  const TOKENS_AT_FULL_TIMEOUT = 128_000;

  const expectedMs =
    (TIMEOUT_MS_AT_FULL_TOKENS * input.maxTokens) / TOKENS_AT_FULL_TIMEOUT;

  return Math.max(TIMEOUT_MS_DEFAULT, Math.ceil(expectedMs));
};
