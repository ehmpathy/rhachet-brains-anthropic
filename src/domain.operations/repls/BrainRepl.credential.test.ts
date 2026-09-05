import { getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';
import { z } from 'zod';

import { genBrainRepl } from './genBrainRepl';

/**
 * .what = clamps the repl's credential fail-fast, on both `ask` and `act`
 * .why = the package promises every call fails fast and names the fix when no
 *   credential is present. that promise held for atoms and NOT for repls, so half
 *   the package contradicted the other half — the gap a peer review caught.
 *
 * .note = the promise was once stated in a readme `## credentials` section, which has
 *   since been removed. it is now carried by `HINT_CREDENTIAL_ABSENT` and clamped
 *   here — a better carrier, since a caller meets the hint at the moment it applies
 *   rather than in prose they may never have read.
 *
 * ⚠️ the two halves fail DIFFERENTLY, which is why a doc retreat was the wrong
 *   repair. an atom raises an sdk error; the repl HANGS.
 *
 *   that is measured, not feared. with the guard disabled these four cases do not
 *   fail on a bad message — they die on `Exceeded timeout of 5000 ms`, and this file
 *   takes 21s rather than 2s. so with no credential the agent-sdk neither returns nor
 *   throws; it stalls, most likely at an interactive auth prompt no gate can answer.
 *   a hang is the one failure a gate cannot survive: it neither passes nor fails.
 *
 * .note = a UNIT test, with no credential and no network. the guard sits BEFORE the
 *   lazy sdk import, so the sdk is never loaded on this path — which is the whole
 *   reason the absent-credential case is clampable at all.
 *
 * .note = each case re-invokes rather than shares a captured result. the guard throws
 *   locally before any i/o, so a repeat call is free — this is not the redundant
 *   expensive operation that `rule.forbid.redundant-expensive-operations` names.
 *
 * .note = the env var is restored after each call, so this cannot leak into a suite
 *   that needs it. see `withNoCredential` for why that restore is per-call rather
 *   than per-file.
 */
const outputSchema = z.object({ content: z.string() });

/**
 * .what = runs one call with `ANTHROPIC_API_KEY` absent, then puts it back
 *
 * .why TRY/FINALLY, and per-call, rather than a `beforeAll` delete with an `afterAll`
 *   restore. two reasons, and the second is a live defect the first would have hidden:
 *
 *   1. an `afterAll` does not run if the suite throws on its way there, so a
 *      suite-wide delete could leak a mutated process global. jest's per-file worker
 *      makes that survivable today, but `--runInBand` or `--maxWorkers=1` removes the
 *      isolation — and the symptom would surface as a load-time failure in an
 *      UNRELATED integration file, whose error names no part of this env mutation. a
 *      `finally` cannot be skipped, and it narrows the window from a whole file to
 *      one call.
 *
 *   2. ⚠️ `process.env.X = undefined` assigns the STRING `'undefined'`, it does not
 *      unset. so the old restore, run on a machine with no key in env, did not
 *      restore absence — it invented a bogus credential that reads as present. the
 *      branch below is that fix, not defensive filler.
 *
 * .note = kept as a local twin of the atom file's helper rather than lifted to a
 *   shared home. it is four lines of test setup used by two files, which is under the
 *   bar `rule.prefer.wet-over-dry` sets for an abstraction.
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

const askWithNoCredential = async (): Promise<Error> =>
  withNoCredential(async () =>
    getError(
      genBrainRepl({ slug: 'claude/code' }).ask({
        role: {},
        prompt: 'respond with exactly: ok',
        schema: { output: outputSchema },
      }),
    ),
  );

const actWithNoCredential = async (): Promise<Error> =>
  withNoCredential(async () =>
    getError(
      genBrainRepl({ slug: 'claude/code' }).act({
        role: {},
        prompt: 'respond with exactly: ok',
        schema: { output: outputSchema },
      }),
    ),
  );

describe('genBrainRepl credential fail-fast', () => {
  given('[case1] no ANTHROPIC_API_KEY in the process env', () => {
    when('[t0] ask is called', () => {
      // .why = "it threw" is the weak half of the claim. the point of the guard is
      //   that the caller learns what to DO, so the message and the hint are what
      //   the clamp actually holds (`rule.require.errors-name-the-fix`).
      then('the message names the env var to set', async () => {
        const error = await askWithNoCredential();
        expect(error.message).toContain('ANTHROPIC_API_KEY');
      });

      then(
        'the hint names the keyrack two-step, not just the unlock',
        async () => {
          const error = await askWithNoCredential();
          expect(JSON.stringify(error)).toContain('keyrack source');
        },
      );

      // ⚠️ this is the case a doc retreat would have left open. the guard must fire
      //   BEFORE the sdk loads, or the sdk owns the failure mode and may hang.
      then('it fails before the agent-sdk is ever reached', async () => {
        const error = await askWithNoCredential();
        expect(error.message).not.toContain('claude-agent-sdk');
      });

      /**
       * .what = snaps the FULL text a caller reads, not a fragment of it
       * .why = the assertions above each read one phrase, so the words BETWEEN them
       *   are unclamped. that matters more here than anywhere: without this guard the
       *   repl HANGS, so this message is the entire difference between a gate that
       *   reports a fixable problem and one that stalls forever. the exact text is the
       *   deliverable (`rule.forbid.friction-hazards`).
       *
       * .note = `error.message` is the WHOLE text a caller reads — helpful-errors
       *   renders the metadata block into it, so the mode, model, and hint are already
       *   inside. it is also the only deterministic view: a serialized error carries
       *   `stack`, which embeds absolute paths, the jest version, and source line
       *   numbers, so a snapshot of it would redden on another machine
       *   (`rule.require.hermetic-tests`).
       */
      then('the full message reads as a caller would see it', async () => {
        const error = await askWithNoCredential();
        expect(error.message).toMatchSnapshot();
      });
    });

    when('[t1] act is called', () => {
      // .why = `ask` and `act` are separate entry points on the object a consumer
      //   holds. a guard on one is not a guard on the other, and `act` is the more
      //   dangerous half — it is the write-enabled mode.
      then('act is guarded too, not only ask', async () => {
        const error = await actWithNoCredential();
        expect(error.message).toContain('ANTHROPIC_API_KEY');
      });

      // .why = snapped SEPARATELY from ask, because the two differ in the one field a
      //   caller uses to tell them apart — `mode`. a shared snapshot would hide a
      //   swap of that field, which is the exact confusion the metadata exists to
      //   prevent (`act` is the write-enabled half).
      then('the full message reads as a caller would see it', async () => {
        const error = await actWithNoCredential();
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
