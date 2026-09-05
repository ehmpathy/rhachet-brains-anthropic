import { getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';
import { z } from 'zod';

import { genBrainAtom } from './genBrainAtom';

/**
 * .what = clamps the atom's credential fail-fast, and the injected-client bypass
 * .why = the guard is new code this behavior added, and it shipped unclamped — twice.
 *   `ergo-friction-hazards` named it at i004, no repair landed, and then the REPL twin
 *   of the same defect was found later, fixed, and clamped. so the package advertised a
 *   symmetric promise while only half of it was regression-guarded.
 *
 * ⚠️ the asymmetry is the lesson, not the absent file. a defect class caught once and
 *   repaired on only one of two twin objects is that defect class shipped again — the
 *   second object simply has not been looked at yet.
 *
 * .note = a UNIT test, with no credential and no network. it clamps the ATOM half of
 *   what `BrainRepl.credential.test.ts` clamps for repls, plus one case a repl cannot
 *   have: an atom accepts an injected client, so it has a second, credential-free
 *   route that must NOT be closed by the guard.
 *
 * .note = each case re-invokes rather than shares a captured result. the guard throws
 *   locally before any i/o, so a repeat call is free — this is not the redundant
 *   expensive operation that `rule.forbid.redundant-expensive-operations` names.
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
      genBrainAtom({ slug: 'claude/sonnet' }).ask({
        role: {},
        prompt: 'respond with exactly: ok',
        schema: { output: outputSchema },
      }),
    ),
  );

/**
 * .what = a stand-in anthropic client that answers without a network call
 * .why = proves the guard does NOT close the injected-client route. a client injected
 *   via `context.anthropic` carries its own credential — possibly a Bedrock or Vertex
 *   one — so the env var is irrelevant on that path, and a guard that demanded it
 *   anyway would break every caller who reaches a retired rung on a partner platform.
 */
const genFakeAnthropic = (): unknown => ({
  messages: {
    create: async () => ({
      content: [{ type: 'text', text: '{"content":"ok"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  },
});

describe('genBrainAtom credential fail-fast', () => {
  given('[case1] no ANTHROPIC_API_KEY and no injected client', () => {
    when('[t0] ask is called', () => {
      // .why = "it threw" is the weak half of the claim. the point of the guard is
      //   that the caller learns what to DO, so the message and hint are what the
      //   clamp holds (`rule.require.errors-name-the-fix`).
      then('the message names the env var to set', async () => {
        const error = await askWithNoCredential();
        expect(error.message).toContain('ANTHROPIC_API_KEY');
      });

      then(
        'the message also names the injected-client alternative',
        async () => {
          const error = await askWithNoCredential();
          expect(error.message).toContain('context.anthropic');
        },
      );

      // ⚠️ this is the case the sdk's own error does NOT cover. left to the sdk, the
      //   caller is told it wanted "apiKey, authToken, credentials, config, or
      //   profile" — not one of which is the env var, and none of which is keyrack.
      then(
        'the hint names the keyrack two-step, not just the unlock',
        async () => {
          const error = await askWithNoCredential();
          expect(JSON.stringify(error)).toContain('keyrack source');
        },
      );

      // .why = the guard must fire BEFORE `new Anthropic({...})`. an undefined apiKey
      //   constructs fine and only fails deep in the request build, which is exactly
      //   the obscure failure this guard replaces.
      then('it fails before the sdk client is ever constructed', async () => {
        const error = await askWithNoCredential();
        expect(error.message).not.toContain('authToken');
      });

      /**
       * .what = snaps the FULL text a caller reads, not a fragment of it
       * .why = the three assertions above each read one phrase, so the words BETWEEN
       *   them are unclamped — a rewrite that kept `ANTHROPIC_API_KEY` and
       *   `keyrack source` while it mangled the two-step instruction would stay green.
       *   this message is all a blocked caller has to act on, and the keyrack two-step
       *   is unguessable, so the exact text is the deliverable
       *   (`rule.forbid.friction-hazards`).
       *
       * .note = `error.message` is the WHOLE caller-facing text — helpful-errors
       *   renders the metadata block into it, so the slug and the hint are already
       *   inside. it is also the only deterministic view: a serialized error carries
       *   `stack`, which embeds absolute paths, the jest version, and source line
       *   numbers, so a snapshot of it would redden on another machine and drown the
       *   three lines a reviewer wants to read (`rule.require.hermetic-tests`).
       */
      then('the full message reads as a caller would see it', async () => {
        const error = await askWithNoCredential();
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case2] no ANTHROPIC_API_KEY, but a client injected', () => {
    when('[t0] ask is called', () => {
      // .why = the guard is a fail-fast, not a demand for the env var. an injected
      //   client carries its own credential, so this route must stay open — it is the
      //   route a Bedrock/Vertex caller uses to reach a rung retired first-party.
      then(
        'the call proceeds, so the guard does not close this route',
        async () => {
          const result = await withNoCredential(async () =>
            genBrainAtom({ slug: 'claude/sonnet' }).ask(
              {
                role: {},
                prompt: 'respond with exactly: ok',
                schema: { output: outputSchema },
              },
              { anthropic: genFakeAnthropic() } as never,
            ),
          );
          expect(result.output.content).toEqual('ok');
        },
      );
    });
  });

  /**
   * .what = clamps that the restore puts back ABSENCE, not the string `'undefined'`
   *
   * .why = the `keyPrior === undefined` branch in `withNoCredential` defends a claim
   *   about node — that `process.env.X = undefined` assigns a string rather than
   *   unsets — and a claim in a comment is a claim no one checked. this runs it.
   *
   * ⚠️ the failure it guards is the worst shape there is: a bogus `'undefined'`
   *   credential is TRUTHY, so the fail-fast guard would read it as present, skip,
   *   and hand the sdk a garbage key. the caller would then get an auth error rather
   *   than the actionable keyrack hint this whole file exists to protect.
   *
   * .note = NESTED on purpose. under `rhx git.repo.test` the key is injected, so the
   *   absent-to-begin-with case is unreachable at the top level. the outer call
   *   removes it; the inner call is the one whose restore is under test.
   */
  given('[case3] the key was already absent when the helper ran', () => {
    when('[t0] the wrapped call completes', () => {
      then('the key is restored to ABSENT, not to the string', async () => {
        const observed = await withNoCredential(async () => {
          await withNoCredential(async () => undefined);
          return {
            value: process.env.ANTHROPIC_API_KEY,
            isPresent: 'ANTHROPIC_API_KEY' in process.env,
          };
        });

        expect(observed.value).toEqual(undefined);
        expect(observed.value).not.toEqual('undefined');
        expect(observed.isPresent).toEqual(false);
      });
    });
  });
});
