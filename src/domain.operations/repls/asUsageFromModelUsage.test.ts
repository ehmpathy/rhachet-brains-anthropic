import { getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { asUsageFromModelUsage } from './asUsageFromModelUsage';

/**
 * .what = clamps the cost-attribution guard: a repl total may only be re-priced at
 *   the requested model's rate when that model actually spent tokens
 * .why = `genBrainRepl` feeds these totals to `calcBrainOutputCost` with the rate of
 *   `config.model`. before this guard the sum ran over `Object.values` with no key
 *   check, so a model swap yielded a confident number priced for a model that never
 *   ran — a wrong answer rather than an absent one (`rule.forbid.failhide`).
 *
 * .note = this is a UNIT clamp on purpose, and that is the point rather than a
 *   convenience. the swap case cannot be summoned from a live query on demand — it
 *   fires only when the sdk declines an id — so an integration test can never prove
 *   it. the pure transform can, on every run, with no credential.
 *
 * ⚠️ these bite. [case3] goes green under a plain `Object.values` sum, which is what
 *   the code did before, so it is the case that proves the guard rather than the one
 *   that merely narrates it.
 */
describe('asUsageFromModelUsage', () => {
  given('[case1] the sdk reported no per-model breakdown', () => {
    when('[t0] the usage is totaled', () => {
      then('it yields zeros rather than a throw', () => {
        expect(
          asUsageFromModelUsage({
            modelUsage: undefined,
            model: 'claude-opus-5',
          }),
        ).toEqual({
          inputTokens: 0,
          outputTokens: 0,
          cacheGetTokens: 0,
          cacheSetTokens: 0,
        });
      });

      // .note = an empty map is a distinct shape from an absent one, and the sdk
      //   emits both. a zero-token result is normal, so neither may throw.
      then('an empty breakdown also yields zeros', () => {
        expect(
          asUsageFromModelUsage({ modelUsage: {}, model: 'claude-opus-5' }),
        ).toEqual({
          inputTokens: 0,
          outputTokens: 0,
          cacheGetTokens: 0,
          cacheSetTokens: 0,
        });
      });
    });
  });

  given('[case2] only the requested model spent tokens', () => {
    when('[t0] the usage is totaled', () => {
      then('every field is carried through, absent fields as zero', () => {
        expect(
          asUsageFromModelUsage({
            modelUsage: {
              'claude-opus-5': {
                inputTokens: 100,
                outputTokens: 20,
                cacheReadInputTokens: 7,
              },
            },
            model: 'claude-opus-5',
          }),
        ).toEqual({
          inputTokens: 100,
          outputTokens: 20,
          cacheGetTokens: 7,
          cacheSetTokens: 0,
        });
      });
    });
  });

  given('[case3] the sdk swapped in a model we never requested', () => {
    when('[t0] the usage is totaled', () => {
      const error = getError(() =>
        asUsageFromModelUsage({
          modelUsage: { 'claude-sonnet-4-5-20250929': { inputTokens: 100 } },
          model: 'claude-opus-5',
        }),
      );

      then('it throws rather than price the swap at our rate', () => {
        expect(error).toBeDefined();
      });

      then('the error names the model asked for and the one that ran', () => {
        expect(error.message).toContain('cost cannot be priced');
        expect(JSON.stringify(error)).toContain('claude-opus-5');
        expect(JSON.stringify(error)).toContain('claude-sonnet-4-5-20250929');
      });

      /**
       * .what = snaps the FULL text, as every other blocked state in this package does
       * .why = the phrase checks above hold the two model ids and one clause, and leave
       *   the hint unclamped — yet the hint carries the whole diagnosis: *the sdk
       *   substitutes its own model when it does not recognize the id it is handed*.
       *   a caller who loses that sentence is left with "cost cannot be priced" and no
       *   route to a cause.
       *
       * .note = deterministic, and the same mask the other four use:
       *   `error.message` alone, never a serialized error, whose `stack` embeds machine
       *   paths (`rule.require.hermetic-tests`).
       */
      then('the full message reads as a caller would see it', () => {
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] a subagent ran alongside the requested model', () => {
    when('[t0] the usage is totaled', () => {
      const usage = asUsageFromModelUsage({
        modelUsage: {
          'claude-opus-5': { inputTokens: 100, outputTokens: 20 },
          'claude-haiku-4-5-20251001': { inputTokens: 5, outputTokens: 3 },
        },
        model: 'claude-opus-5',
      });

      // .why = a subagent's tokens are real spend the caller paid for, so they are
      //   counted. the documented cost is that they are priced at the requested
      //   model's rate, which OVER-states — the safe direction, and stated in the
      //   transformer's own note.
      then('the subagent tokens are included, not dropped', () => {
        expect(usage.inputTokens).toEqual(105);
        expect(usage.outputTokens).toEqual(23);
      });

      then('the requested model is present, which permits the total', () => {
        expect(usage).toEqual({
          inputTokens: 105,
          outputTokens: 23,
          cacheGetTokens: 0,
          cacheSetTokens: 0,
        });
      });
    });
  });
});
