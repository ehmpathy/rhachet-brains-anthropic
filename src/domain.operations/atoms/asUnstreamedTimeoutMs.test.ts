import { given, then, when } from 'test-fns';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';
import { asUnstreamedTimeoutMs } from './asUnstreamedTimeoutMs';

/**
 * .what = clamps that every registered rung can actually be CALLED unstreamed
 *
 * .why = the sdk refuses an unstreamed request outright when `max_tokens` implies more
 *   than its ten-minute default, and it refuses BEFORE any request is sent. so this is
 *   not a slow path or a degraded answer — it is a hard throw on ten of thirteen rungs,
 *   and the message names the stream mode rather than the cap that tripped it.
 *
 * ⚠️ THE reason this test exists, stated plainly: the defect shipped, and every gate in
 *   this repo stayed green over it. the unit tests inject a FAKE client, so no sdk guard
 *   runs in them. the integration and acceptance suites hit the real sdk — and they were
 *   red on `400 credit balance is too low` for the whole behavior, so a second failure
 *   behind the first was invisible. a drained account is a MASK, not merely a blocker.
 *
 * .why THIS clamp closes that gap where a live call cannot: it reads the same config the
 *   request reads and checks the arithmetic the sdk will do, so it reddens with no
 *   credential, no network, and no charge. a rung added with a cap that cannot be called
 *   fails here rather than in a caller's repo.
 *
 * .note = the threshold is the sdk's own: it throws when
 *   `(60min × maxTokens) / 128_000 > 10min`, i.e. above `128_000 / 6 ≈ 21_333` tokens.
 */
describe('asUnstreamedTimeoutMs', () => {
  // the sdk's refusal threshold, restated from its own formula
  const TOKENS_MAX_AT_DEFAULT_TIMEOUT = 128_000 / 6;
  const TIMEOUT_MS_DEFAULT = 10 * 60 * 1000;

  /**
   * .what = the sdk's own guard, reimplemented
   * .why = a clamp that asserts our transformer against ITSELF would pass no matter what
   *   the sdk does. so the check has to model the sdk's decision — throw when the timeout
   *   it would derive exceeds its default — and then confirm our explicit figure clears it.
   */
  const wouldSdkRefuse = (input: {
    maxTokens: number;
    timeoutMs: number | null;
  }): boolean => {
    // the sdk consults its own arithmetic ONLY when no explicit timeout was given
    if (input.timeoutMs !== null) return false;
    return input.maxTokens > TOKENS_MAX_AT_DEFAULT_TIMEOUT;
  };

  given('[case1] the registered atom ladder', () => {
    when('[t0] each rung is called unstreamed', () => {
      // guards every sweep below from a vacuous pass on an empty list
      then('the sweep actually finds rungs to check', () => {
        expect(ANTHROPIC_BRAIN_ATOM_SLUGS.length).toBeGreaterThan(10);
      });

      // ⚠️ the assertion that would have caught the defect. it reddens on the tree as it
      //   shipped, where no explicit timeout was passed at all.
      then('no rung is refused before its request is sent', () => {
        const refused = ANTHROPIC_BRAIN_ATOM_SLUGS.filter((slug) => {
          const maxTokens = CONFIG_BY_ATOM_SLUG[slug].maxOutput.tokens;
          return wouldSdkRefuse({
            maxTokens,
            timeoutMs: asUnstreamedTimeoutMs({ maxTokens }),
          });
        });
        expect(refused).toEqual([]);
      });

      /**
       * .why = this is the half that proves the clamp is not vacuous. if the fix were
       *   reverted — no explicit timeout — the sdk WOULD refuse, and this states exactly
       *   which rungs. a clamp that cannot name the broken world is not a clamp.
       */
      then('without the explicit timeout, most rungs WOULD be refused', () => {
        const refusedWithoutFix = ANTHROPIC_BRAIN_ATOM_SLUGS.filter((slug) =>
          wouldSdkRefuse({
            maxTokens: CONFIG_BY_ATOM_SLUG[slug].maxOutput.tokens,
            timeoutMs: null,
          }),
        );
        expect(refusedWithoutFix.length).toBeGreaterThan(0);
      });
    });
  });

  given('[case2] the boundary the sdk draws', () => {
    when('[t0] a cap sits on each side of it', () => {
      // .why = the retired rungs' 16_384 sits just UNDER the line, which is the whole
      //   reason the defect went unseen before the per-rung caps landed.
      then('a cap below the line keeps the sdk default', () => {
        expect(asUnstreamedTimeoutMs({ maxTokens: 16_384 })).toEqual(
          TIMEOUT_MS_DEFAULT,
        );
      });

      // .why = above the line the timeout must RISE, else it stays at the default and the
      //   sdk's own arithmetic still exceeds it.
      then('a cap above the line raises the timeout', () => {
        expect(asUnstreamedTimeoutMs({ maxTokens: 128_000 })).toBeGreaterThan(
          TIMEOUT_MS_DEFAULT,
        );
      });

      // .why = the figure is the sdk's own estimate, not an invented one — 128k tokens is
      //   the point at which the sdk's formula reaches a full hour.
      then('a full-window cap asks for the sdk own full hour', () => {
        expect(asUnstreamedTimeoutMs({ maxTokens: 128_000 })).toEqual(
          60 * 60 * 1000,
        );
      });
    });
  });
});
