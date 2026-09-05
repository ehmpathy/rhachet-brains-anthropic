import { getError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { genBrainAtom } from '../atoms/genBrainAtom';
import { genBrainRepl } from '../repls/genBrainRepl';

/**
 * .what = clamps the unknown-slug fail-fast on BOTH factories
 *
 * .where = `brains/`, NOT `atoms/`. it drives both factories, so from `atoms/` it had
 *   to reach into `repls/` — the cross-subdomain reach-in `rule.forbid.scope-leaks`
 *   names. `asBrainDescription.test.ts` was homed here for exactly this reason; this
 *   file is the same dual-consumer shape and was simply missed at the time.
 * .why = an unregistered slug used to die as a bare
 *   `TypeError: Cannot read properties of undefined`, thrown synchronously from the
 *   factory before `.ask()` was ever reached. it named no slug, listed no valid set,
 *   and offered no hint — the one caller mistake this package left to the runtime while
 *   every other blocked state answered with a `BadRequestError`.
 *
 * ⚠️ the type union does NOT make this unreachable, which is why it survived seven
 *   review rounds. it guards a typescript caller; the path that motivates the guard is
 *   a CLI string — `rhx review --brain anthropic/<slug>` hands over whatever was typed.
 *
 * .why now = the ragged ladder makes the mistake likely rather than exotic. `v4.7` and
 *   `v4.8` exist for opus and NOT for sonnet, so someone who reads the readme can
 *   reasonably infer a slug that was never registered. the config comments call that
 *   trap out for contributors; this guard calls it out for callers.
 *
 * .note = a UNIT test. both guards fire inside the factory, before any client, any
 *   credential read, and any i/o — so this needs no key and no network.
 *
 * .note = the slug is cast, because the whole point is a value the union forbids. this
 *   is the sanctioned use of a cast: to reach a runtime state the type system claims
 *   cannot happen, and prove the code survives it anyway.
 */
const SLUG_RAGGED_GAP = 'claude/sonnet/v4.7';

describe('unknown slug fail-fast', () => {
  given('[case1] an atom slug in a gap of the ragged ladder', () => {
    when('[t0] genBrainAtom is called', () => {
      // .note = the capture projects `{ message, name }` rather than the Error itself.
      //   `useThen` hands back a proxy built by `Object.assign`, which copies only
      //   ENUMERABLE own props — and `Error#message` is non-enumerable, so a capture of
      //   the bare Error would read `undefined`. plain-literal properties survive.
      const failed = useThen('it throws', async () => {
        const error = getError(() =>
          genBrainAtom({ slug: SLUG_RAGGED_GAP as never }),
        );
        return { message: error.message, name: error.constructor.name };
      });

      // .why = the defect was a bare TypeError from a property read on undefined. that
      //   is the exact shape this must never be again.
      then('it throws a named error rather than a bare TypeError', () => {
        expect(failed.name).not.toEqual('TypeError');
        expect(failed.message).not.toContain('Cannot read properties');
      });

      // .why = `rule.require.discoverability` — an error that rejects a value without
      //   a note of the valid ones is a blocker. the caller must not have to read the
      //   source to learn what they may pass.
      then('it lists the registered slugs, so the fix is visible', () => {
        expect(failed.message).toContain('claude/sonnet/v4.6');
        expect(failed.message).toContain('claude/opus/v4.7');
      });

      // ⚠️ the point of the hint, not a nicety. the caller inferred `sonnet/v4.7` from
      //   `opus/v4.7`, so a list alone invites the same inference again next time. the
      //   message has to say the ladder is ragged.
      then('it names WHY the guess failed, not only that it did', () => {
        expect(failed.message).toContain('RAGGED');
      });

      then('the full message reads as a caller would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });

  given('[case2] the repl twin of the same mistake', () => {
    when('[t0] genBrainRepl is called', () => {
      const refused = useThen('it throws', async () => {
        const error = getError(() =>
          genBrainRepl({ slug: 'claude/code/sonnet/v4.7' as never }),
        );
        return { message: error.message, name: error.constructor.name };
      });

      // .why = the twin case is the lesson this behavior already learned twice: a
      //   defect class fixed on one of two twin objects is that defect class shipped.
      //   the credential guard was found on the atom, missed on the repl, and had to be
      //   caught by a later round. this clamps both halves in one pass.
      then('the repl guard exists too, not only the atom one', () => {
        expect(refused.name).not.toEqual('TypeError');
      });

      // ⚠️ a repl caller cannot pass an atom slug, so a list of the wrong namespace
      //   would be worse than no list — it would name values that also fail.
      then('it lists REPL slugs, never atom slugs', () => {
        expect(refused.message).toContain('claude/code/sonnet/v4.6');
        expect(refused.message).not.toContain(' claude/sonnet/v4.6');
      });

      then('the full message reads as a caller would see it', () => {
        expect(refused.message).toMatchSnapshot();
      });
    });
  });
});
