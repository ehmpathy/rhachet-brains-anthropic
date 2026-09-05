import type { Query } from '@anthropic-ai/claude-agent-sdk';
import {
  BadRequestError,
  getError,
  UnexpectedCodePathError,
} from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { extractResultFromQuery } from './extractResultFromQuery';

/**
 * .what = clamps the two SDK-failure paths of the query reader
 * .why = both used to throw a bare `Error` that named only the subtype. two reports of
 *   "query failed" from different rungs read identically, so the first fact a reader
 *   needs — WHICH rung — was absent from the one artifact they get
 *   (`rule.require.failloud`).
 *
 * ⚠️ the rung matters more here than anywhere else in this behavior. the installed
 *   `@anthropic-ai/claude-agent-sdk` does not type-gate the model, so a rung it cannot
 *   serve reaches it as a plain string and fails INSIDE the sdk. that is the single
 *   most likely cause of a failure on a newly-registered rung — and it was exactly the
 *   fact the old message dropped.
 *
 * .note = a UNIT test, and it can be one only because `extractResultFromQuery` takes
 *   the stream as an argument. a fake async generator drives both paths with no sdk,
 *   no credential, and no network — and neither path can be summoned on demand from a
 *   live call, so without the seam there would be no clamp at all.
 */

/**
 * .what = a fake sdk stream that yields the given messages, then ends
 * .why = the sdk's `Query` is an async iterator and no more, so a generator satisfies
 *   it. the cast covers `Query`'s extra control methods, which the reader never touches.
 */
const genFakeQuery = (messages: unknown[]): Query => {
  const iterator = (async function* () {
    for (const message of messages) yield message;
  })();
  return iterator as unknown as Query;
};

const MODEL = 'claude-opus-5';

/**
 * .what = drives the reader over a stream the sdk marked as failed, and returns the error
 *
 * .note = the CALLS are shared via `useThen` below, not re-driven per assertion.
 *   an earlier form re-drove this helper in each `then` and defended it on cost:
 *   `rule.forbid.redundant-expensive-operations` guards an EXPENSIVE call, and this is a
 *   synchronous generator over one literal. that is true, and a peer review pointed out
 *   it is beside the point — `rule.prefer.useThen-useWhen-for-shared-results` asks for
 *   the shared capture on its own terms, and every assertion here reads only `.message`,
 *   so the capture is available. the cost argument answered a rule nobody had cited.
 *
 * ⚠️ the capture must project `{ message }`, NOT the error. `useThen` resolves via
 *   `Object.assign(drawer, value)`, which copies ENUMERABLE own properties only, and
 *   `Error#message` is own but non-enumerable — so a captured error yields
 *   `error.message === undefined` and every assertion silently reads a void. the
 *   continuation twin documents the same trap, measured.
 *
 * .note = the projection also retires a near-vacuous assertion. `then('it throws')` used
 *   to read `expect(await readFailedResult()).toBeDefined()`, which cannot fail on its
 *   own terms — `getError` returns an error or throws. the real claim now rides the
 *   `useThen` label, where a code path that does NOT throw reddens that block by name.
 */
const readFailedResult = async (): Promise<Error> =>
  getError(
    extractResultFromQuery({
      queryIterator: genFakeQuery([
        {
          type: 'result',
          subtype: 'error_during_execution',
          session_id: 'sess-1',
          errors: [{ message: 'model not served' }],
        },
      ]),
      model: MODEL,
      mode: 'ask',
    }),
  );

/**
 * .what = drives the reader over a stream that ends with no result at all
 * .why = the silent twin of the above; same cost argument
 */
const readNoResult = async (): Promise<Error> =>
  getError(
    extractResultFromQuery({
      queryIterator: genFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-2' },
      ]),
      model: MODEL,
      mode: 'act',
    }),
  );

describe('extractResultFromQuery', () => {
  given('[case1] the sdk reports a non-success result', () => {
    when('[t0] the stream is read', () => {
      const failed = useThen('it throws', async () => ({
        message: (await readFailedResult()).message,
      }));

      // .why = the rung is the first fact to check on a failure, since an unserved
      //   model id fails inside the sdk. a message without it names a symptom only.
      then('the rung is on the error', () => {
        expect(failed.message).toContain(MODEL);
      });

      // .why = `act` (workspace-write) and `ask` (read-only) fail differently, so the
      //   mode is the second fact a reader needs.
      then('the mode is on the error', () => {
        expect(failed.message).toContain('ask');
      });

      // .why = the sdk's own account of the failure, which is the only cause the
      //   caller has. dropped, and the report says no more than a fix can act on.
      then('the sdk subtype and errors are on the error', () => {
        expect(failed.message).toContain('error_during_execution');
        expect(failed.message).toContain('model not served');
      });

      // .why = `rule.require.errors-name-the-fix`
      then('the error names what to check', () => {
        expect(failed.message).toContain('claude-agent-sdk');
      });

      // .why = the whole message is what a caller actually sees, so it is snapped
      //   rather than only probed for text (`rule.forbid.friction-hazards`).
      then('the full message reads as a caller would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });

  given('[case2] the stream ends and no result ever arrives', () => {
    when('[t0] the stream is read', () => {
      // ⚠️ the SILENT half. no message is marked failed — the stream simply holds no
      //   answer — so without a throw this returns `output: undefined` and a caller
      //   reads it as a real answer (`rule.forbid.failhide`).
      const silent = useThen(
        'it throws rather than return undefined',
        async () => ({
          message: (await readNoResult()).message,
        }),
      );

      then('the rung is on the error', () => {
        expect(silent.message).toContain(MODEL);
      });

      then('the mode is on the error', () => {
        expect(silent.message).toContain('act');
      });

      // .why = this one reads as a well-formed stream, so the message must say plainly
      //   that no result arrived — else it is indistinguishable from case1 in a log.
      then('the message says no result arrived', () => {
        expect(silent.message).toContain('no result message');
      });

      then('the full message reads as a caller would see it', () => {
        expect(silent.message).toMatchSnapshot();
      });
    });
  });

  given('[case3] the sdk reports success, but the payload is not json', () => {
    when('[t0] the stream is read', () => {
      // ⚠️ a MEASURED case, not a hypothetical. this branch runs only when the sdk gave
      //   no `structured_output` — which is exactly what happened in this behavior's
      //   ambiguous-prompt `act` failure, where the model answered in prose about the
      //   output tool rather than through it.
      const readProsePayload = async (): Promise<Error> =>
        getError(
          extractResultFromQuery({
            queryIterator: genFakeQuery([
              {
                type: 'result',
                subtype: 'success',
                session_id: 'sess-4',
                result: 'Sure! I can help with that. The answer is',
                structured_output: undefined,
                modelUsage: {
                  [MODEL]: { inputTokens: 10, outputTokens: 5 },
                },
              },
            ]),
            model: MODEL,
            mode: 'act',
          }),
        );

      then('it throws rather than leak a bare SyntaxError', async () => {
        expect((await readProsePayload()).message).toContain('not valid json');
      });

      then('the rung and mode are on the error', async () => {
        const reported = (await readProsePayload()).message;
        expect(reported).toContain(MODEL);
        expect(reported).toContain('act');
      });

      // .why = the payload IS the evidence. prose-instead-of-tool and a cut-off json
      //   have different fixes, and only the text tells them apart.
      then('the offending payload is carried', async () => {
        expect((await readProsePayload()).message).toContain(
          'Sure! I can help',
        );
      });

      then('the full message reads as a caller would see it', async () => {
        expect((await readProsePayload()).message).toMatchSnapshot();
      });
    });
  });

  given('[case4] the sdk reports a success result', () => {
    when('[t0] the stream is read', () => {
      const outcome = useThen('it returns rather than throw', async () =>
        extractResultFromQuery({
          queryIterator: genFakeQuery([
            {
              type: 'result',
              subtype: 'success',
              session_id: 'sess-3',
              result: '{"content":"ok"}',
              structured_output: undefined,
              modelUsage: {
                [MODEL]: {
                  inputTokens: 10,
                  outputTokens: 5,
                  cacheReadInputTokens: 0,
                  cacheCreationInputTokens: 0,
                },
              },
            },
          ]),
          model: MODEL,
          mode: 'ask',
        }),
      );

      // .why = the happy path holds the two guards honest. a guard that fired on every
      //   stream would pass every assertion above and break the package.
      then('it yields the parsed output', () => {
        expect(outcome.output).toEqual({ content: 'ok' });
      });

      then('it yields the session id', () => {
        expect(outcome.sessionId).toEqual('sess-3');
      });

      then('it yields the usage the requested rung earned', () => {
        expect(outcome.usage.inputTokens).toEqual(10);
        expect(outcome.usage.outputTokens).toEqual(5);
      });
    });
  });

  given('[case5] the sdk yields TWO success results for one query', () => {
    /**
     * .what = clamps the second-result refusal
     *
     * .why = `result` and `structuredOutput` were last-write accumulators, so a second
     *   result overwrote the first and the caller received the LAST answer with no
     *   sign that an earlier one was dropped. a comment named that shape, which made
     *   it disclosed and no less silent — a documented failhide is still a failhide.
     *
     * ⚠️ the installed sdk emits exactly ONE result per query, so this case cannot be
     *   summoned from a live call at all. that is the argument FOR the clamp rather
     *   than against it: the single-result invariant is an assumption about a
     *   dependency we do not own, and an assumption no check enforces is one a version
     *   bump can break with no signal. the fake stream is the only way to state it.
     */
    const readTwoResults = async (): Promise<Error> =>
      getError(
        extractResultFromQuery({
          queryIterator: genFakeQuery([
            {
              type: 'result',
              subtype: 'success',
              session_id: 'sess-5',
              result: '{"content":"first"}',
              structured_output: undefined,
              modelUsage: { [MODEL]: { inputTokens: 10, outputTokens: 5 } },
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'sess-5',
              result: '{"content":"second"}',
              structured_output: undefined,
              modelUsage: { [MODEL]: { inputTokens: 10, outputTokens: 5 } },
            },
          ]),
          model: MODEL,
          mode: 'ask',
        }),
      );

    when('[t0] the stream is read', () => {
      then('it throws rather than silently keep the last', async () => {
        expect((await readTwoResults()).message).toContain('more than one');
      });

      /**
       * .what = asserts on the OUTCOME SHAPE — that the call rejects rather than resolves
       *
       * .why = the assertions around it read `error.message`, and that channel cannot
       *   state this claim. the defect clamped here is that the reader RESOLVES with
       *   the second payload, so the fact to check is whether a value came back at all
       *   — not what some error said.
       *
       * ⚠️ it was first written as `expect(reported).not.toContain('"content":"second"')`
       *   and that assertion was DEAD. with the guard neutered the reader resolves, so
       *   `getError` yields an error reading `"no error was thrown"` — which carries no
       *   payload either, so the assertion passed in both worlds and reported success
       *   while it guarded no defect. the dogfood is what exposed it: three of the four
       *   case5 assertions went red under the neuter and this one stayed green.
       *
       * .note = so it settles both halves at once — no answer is returned, and no merge
       *   was made up. two answers to one question have no defined combination.
       */
      then(
        'the caller gets no answer at all, rather than the last',
        async () => {
          const outcome = await extractResultFromQuery({
            queryIterator: genFakeQuery([
              {
                type: 'result',
                subtype: 'success',
                session_id: 'sess-5',
                result: '{"content":"first"}',
                structured_output: undefined,
                modelUsage: { [MODEL]: { inputTokens: 10, outputTokens: 5 } },
              },
              {
                type: 'result',
                subtype: 'success',
                session_id: 'sess-5',
                result: '{"content":"second"}',
                structured_output: undefined,
                modelUsage: { [MODEL]: { inputTokens: 10, outputTokens: 5 } },
              },
            ]),
            model: MODEL,
            mode: 'ask',
          }).then(
            (value) => ({ resolvedWith: value.output }),
            () => ({ rejected: true }),
          );

          expect(outcome).toEqual({ rejected: true });
        },
      );

      // .why = `rule.require.errors-name-the-fix`. this fires only under a future sdk,
      //   so the reader is by definition someone who did not write this code, and the
      //   wrong repair (take the last) is the intuitive one.
      then('the error names the fix, and forbids the wrong one', async () => {
        const reported = (await readTwoResults()).message;
        expect(reported).toContain('claude-agent-sdk');
        expect(reported).toContain('do NOT simply take the last');
      });

      then('the full message reads as a caller would see it', async () => {
        expect((await readTwoResults()).message).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = clamps WHO OWNS each of the four blocked states, by error class
   *
   * .why = the class is not decoration. `rule.require.failloud` splits failures by who
   *   must act — `BadRequestError` says the caller fixes it, `UnexpectedCodePathError`
   *   says the server does — and a caller routes on that split. so a misclassed error
   *   sends a real problem to the wrong owner while it reads as a clean diagnosis.
   *
   * ⚠️ THE defect this exists for actually shipped. the prose-payload throw was an
   *   `UnexpectedCodePathError` whose own hint read *"sharpen the prompt"* — a caller
   *   move dressed in the server's class. worse, the ATOM twin
   *   (`asOutputFromTextBlock`) already threw `BadRequestError` for the identical
   *   cause, so one failure reported two different owners, and which one a caller saw
   *   turned on the interface they reached it through.
   *
   * .note = the sweep is the point. three of these four are genuinely server-side, so
   *   an assertion on the odd one alone would not stop the reverse drift — an sdk-side
   *   throw quietly demoted to `BadRequestError` and blamed on the caller.
   */
  given('[case6] every blocked state, and who owns it', () => {
    when('[t0] each is driven to its throw', () => {
      const MESSAGE_PROSE_PAYLOAD = {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-6',
        result: 'Sure! I can help with that.',
        structured_output: undefined,
        modelUsage: { [MODEL]: { inputTokens: 10, outputTokens: 5 } },
      };
      const MESSAGE_SDK_FAILED = {
        type: 'result',
        subtype: 'error_during_execution',
        session_id: 'sess-6',
        errors: [{ message: 'model not served' }],
      };

      const readOwnerOf = async (messages: unknown[]): Promise<string> =>
        (
          await getError(
            extractResultFromQuery({
              queryIterator: genFakeQuery(messages),
              model: MODEL,
              mode: 'ask',
            }),
          )
        ).constructor.name;

      // .why = the caller can fix this one, and only this one — the hint says so.
      then('a prose payload is the callers to fix', async () => {
        expect(await readOwnerOf([MESSAGE_PROSE_PAYLOAD])).toEqual(
          BadRequestError.name,
        );
      });

      // .why = no change of prompt fixes an sdk that failed, held no answer, or broke
      //   its one-result contract. each is a diagnosis, not a correction.
      then('every sdk-side failure is the servers to fix', async () => {
        const owners = {
          failed: await readOwnerOf([MESSAGE_SDK_FAILED]),
          absent: await readOwnerOf([]),
          doubled: await readOwnerOf([
            MESSAGE_PROSE_PAYLOAD,
            MESSAGE_PROSE_PAYLOAD,
          ]),
        };
        expect(owners).toEqual({
          failed: UnexpectedCodePathError.name,
          absent: UnexpectedCodePathError.name,
          doubled: UnexpectedCodePathError.name,
        });
      });

      // ⚠️ the cross-interface half. the atom twin throws `BadRequestError` for this
      //   same cause, so this asserts the repl agrees with it rather than merely that
      //   the repl is self-consistent.
      then('the repl agrees with its atom twin on this cause', async () => {
        const errorOfRepl = await getError(
          extractResultFromQuery({
            queryIterator: genFakeQuery([MESSAGE_PROSE_PAYLOAD]),
            model: MODEL,
            mode: 'ask',
          }),
        );
        expect(errorOfRepl).toBeInstanceOf(BadRequestError);
        expect(errorOfRepl).not.toBeInstanceOf(UnexpectedCodePathError);
      });
    });
  });
});
