import { getError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';
import { z } from 'zod';

import { genBrainAtom } from '../atoms/genBrainAtom';
import { genBrainRepl } from '../repls/genBrainRepl';
import { HINT_CREDENTIAL_ABSENT } from './HINT_CREDENTIAL_ABSENT';

/**
 * .what = proves the atom and the repl hand a caller the SAME credential fix
 *
 * .why = the clamp the three extant snapshot tests could not give. each of them snaps
 *   one factory's message against its own recorded baseline, so each proves only that
 *   a file agrees with itself. an edit to the atom copy alone would re-snap green and
 *   leave the repl copy behind, and no test in the repo would notice — the two strings
 *   were byte-identical by coincidence of authorship, not by any checked relation.
 *
 * ⚠️ the twin-drift class has already bitten this codebase. the credential guard itself
 *   shipped on the atom and was missed on the repl, and only a later peer round caught
 *   it. so this is a repeat defect class, not a hypothetical
 *   (`rule.prefer.most-common-denominator`).
 *
 * .where = `brains/`, NOT `atoms/` or `repls/`. it drives both factories, so from
 *   either subdomain it would have to reach into the other — the cross-subdomain
 *   reach-in `rule.forbid.scope-leaks` names.
 *
 * .note = a UNIT test. both guards fire before any client, any network, and any esm
 *   load, so this needs no key.
 */
const outputSchema = z.object({ content: z.string() });

/**
 * .what = runs one call with `ANTHROPIC_API_KEY` absent, then puts it back
 *
 * .why TRY/FINALLY, and per-call, rather than a `beforeAll` delete: a `finally` cannot
 *   be skipped by a throw on the way to an `afterAll`, and it narrows the window from a
 *   whole file to one call.
 *
 * ⚠️ `process.env.X = undefined` assigns the STRING `'undefined'`, it does not unset.
 *   so a naive restore, on a machine with no key in env, would invent a bogus
 *   credential that reads as present — the branch below is that fix.
 */
const withNoCredential = async <T>(fn: () => Promise<T>): Promise<T> => {
  const keyPrior = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    return await fn();
  } finally {
    if (keyPrior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = keyPrior;
  }
};

/**
 * .what = pulls the `hint` a caller reads back out of a helpful-error
 *
 * .why = `error.message` embeds the metadata as `JSON.stringify(metadata)`, so the
 *   hint's own quote characters appear escaped inside it. a plain `toContain` of the
 *   raw constant would therefore MISS, and the miss would read as a drift that is not
 *   there. the parse recovers the string as the metadata actually holds it.
 *
 * .note = a throw here is a correct red, not a flake. it means the error's message
 *   shape changed, and every claim below is stated about that shape.
 */
const asHintFromError = (error: Error): string => {
  const indexOfBlock = error.message.indexOf('\n\n');
  const blockJson = error.message.slice(indexOfBlock + 2);
  return (JSON.parse(blockJson) as { hint: string }).hint;
};

describe('the credential hint is shared, not duplicated', () => {
  given('[case1] no ANTHROPIC_API_KEY reaches either factory', () => {
    when('[t0] both factories are asked', () => {
      // .why = the two calls are captured once and read by every assertion below.
      //   each guard throws locally before any i/o, so a repeat would be cheap — but a
      //   shared capture keeps the two errors provably from ONE run, which is the whole
      //   claim (`rule.prefer.useThen-useWhen-for-shared-results`).
      //
      // ⚠️ the capture holds plain STRINGS, not the errors. `useThen` resolves via
      //   `Object.assign`, which copies enumerable own properties only — and
      //   `Error#message` is own but NON-enumerable, so a captured error reads back
      //   with `message: undefined` and every assertion below would pass vacuously.
      const hints = useThen('both refuse', async () =>
        withNoCredential(async () => {
          const errorOfAtom = await getError(
            genBrainAtom({ slug: 'claude/sonnet' }).ask({
              role: {},
              prompt: 'respond with exactly: ok',
              schema: { output: outputSchema },
            }),
          );
          const errorOfRepl = await getError(
            genBrainRepl({ slug: 'claude/code' }).ask({
              role: {},
              prompt: 'respond with exactly: ok',
              schema: { output: outputSchema },
            }),
          );
          return {
            atom: asHintFromError(errorOfAtom),
            repl: asHintFromError(errorOfRepl),
          };
        }),
      );

      // ⚠️ THE clamp. the three snapshot tests each compare a file to itself; only this
      //   line compares the two files to each other.
      then('the two factories emit the identical hint', () => {
        expect(hints.atom).toEqual(hints.repl);
      });

      // .why = equality alone is satisfiable by two empty strings, or by two copies of
      //   a hint that drifted together away from the shared source. an anchor from each
      //   to the exported constant is what makes the equality above load-bearing.
      then('each hint is the shared constant, not a local literal', () => {
        expect(hints.atom).toEqual(HINT_CREDENTIAL_ABSENT);
        expect(hints.repl).toEqual(HINT_CREDENTIAL_ABSENT);
      });

      // .why = the correction the text carries is the part most likely to be lost in a
      //   re-edit: an unlock alone does NOT reach the call. a caller told merely to
      //   "unlock" will unlock, retry, and fail again (`rule.require.errors-name-the-fix`).
      then('the hint names the actionable half, not just the unlock', () => {
        expect(HINT_CREDENTIAL_ABSENT).toContain('keyrack source');
        expect(HINT_CREDENTIAL_ABSENT).toContain('rhx git.repo.test');
      });
    });
  });
});
