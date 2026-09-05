import { getError, given, then, when } from 'test-fns';
import { z } from 'zod';

import { CONFIG_BY_ATOM_SLUG } from '../brains/BrainAtom.config';
import { genBrainAtom } from './genBrainAtom';

/**
 * .what = clamps the max_tokens truncation guard
 * .why = before the guard, a response cut off at `max_tokens` reached `JSON.parse`
 *   as partial json and surfaced as a bare
 *   `SyntaxError: Unterminated string in JSON at position 77908` — no model, no
 *   slug, no hint (verified live 2026-08-31 against haiku). the guard converts it
 *   into a `BadRequestError` that names the cause and the fix.
 *
 * .note = a unit test with an INJECTED FAKE client, not a mock and not a live call.
 *   `genBrainAtom` reads `context.anthropic`, so the truncation can be reproduced
 *   deterministically with no network — which is what lets this clamp be fast and
 *   free enough to run on every push. the live probe that found the defect cost
 *   160s and a real charge; this costs neither.
 */
const outputSchema = z.object({ content: z.string() });

/**
 * .what = the rung this clamp drives
 * .why = named because the cap is now PER-RUNG, so the slug and the expected cap are
 *   one fact rather than two. `claude/sonnet` is a 128K rung, which makes the
 *   assertions below meaningfully different from the 16K global they replaced.
 */
const SLUG_UNDER_TEST = 'claude/sonnet' as const;

/**
 * .what = a fake anthropic client whose response was cut off at max_tokens
 * .why = reproduces the exact shape the api returns on truncation: partial json in
 *   the text block, and `stop_reason: 'max_tokens'`
 *
 * .note = it RECORDS the `max_tokens` it was handed. the cap is now per-rung
 *   (`config.maxOutput.tokens`) rather than one global, so the claim worth a clamp is
 *   no longer "the error says 16384" — it is "the error reports the cap the request
 *   actually sent". a hardcoded expectation would be a second literal that could drift
 *   from the config, which is the very defect the per-rung field removed.
 */
const genFakeAnthropicTruncated = (): {
  client: unknown;
  asked: { maxTokens: number | null };
} => {
  const asked: { maxTokens: number | null } = { maxTokens: null };
  return {
    asked,
    client: {
      messages: {
        create: async (params: { max_tokens: number }) => {
          asked.maxTokens = params.max_tokens;
          return {
            // partial json — exactly what a cut-off response leaves behind
            content: [
              { type: 'text', text: '{"content":"the ocean is very la' },
            ],
            stop_reason: 'max_tokens',
            usage: { input_tokens: 10, output_tokens: params.max_tokens },
          };
        },
      },
    },
  };
};

describe('genBrainAtom max_tokens truncation', () => {
  given('[case1] a response cut off at the max_tokens cap', () => {
    when('[t0] ask is called', () => {
      /**
       * .note = called per `then` rather than shared via `useThen`, deliberately.
       *   `useThen` hands back a DEFERRED PROXY, and these assertions test the error's
       *   identity and its full serialization — `toBeInstanceOf(Error)` sees the proxy
       *   as `Object`, and `JSON.stringify` yields `{}`. verified: the shared form
       *   turns all four green assertions red.
       *
       *   the cost rule that motivates a shared result
       *   (`rule.forbid.redundant-expensive-operations`) scopes itself to operations
       *   over ~10ms or with real cost. this is an injected in-memory fake — no network,
       *   no charge, sub-millisecond — so four calls are free, and each `then` keeps its
       *   single assertion.
       */
      const askTruncated = async (): Promise<{
        error: Error;
        askedMaxTokens: number | null;
      }> => {
        const fake = genFakeAnthropicTruncated();
        const error = await getError(
          genBrainAtom({ slug: SLUG_UNDER_TEST }).ask(
            {
              role: {},
              prompt: 'write a very long essay',
              schema: { output: outputSchema },
            },
            // .note = `as never` because rhachet types this context slot as `Empty`,
            //   while `genBrainAtom` reads `context.anthropic` off it to allow an
            //   injected client. so the cast crosses a third-party contract we do not
            //   own — the sanctioned exemption in `rule.forbid.as-cast`. it goes away
            //   if rhachet ever widens that slot; extant precedent in
            //   `getBrainHooks.test.ts`.
            { anthropic: fake.client } as never,
          ),
        );
        return { error, askedMaxTokens: fake.asked.maxTokens };
      };

      then('it throws, rather than parse the partial json', async () => {
        const { error } = await askTruncated();
        expect(error).toBeInstanceOf(Error);
        // the defect was a bare SyntaxError from JSON.parse
        expect(error.constructor.name).not.toEqual('SyntaxError');
        // .note = and NOT an auth error either — that would mean the fake client
        //   was not wired in and the real one was constructed, so the whole test
        //   would pass for a reason with no relation to truncation
        expect(error.message).not.toContain('authentication');
      });

      then('the error names the cause', async () => {
        const { error } = await askTruncated();
        expect(error.message).toContain('max_tokens');
      });

      then('the error carries the slug and model', async () => {
        const { error } = await askTruncated();
        const serialized = JSON.stringify(error);
        expect(serialized).toContain(SLUG_UNDER_TEST);
        expect(serialized).toContain('claude-sonnet-5');
      });

      // ⚠️ the anti-drift clamp on the cap. it reads the number the fake client was
      //   ACTUALLY handed, so it proves the error reports the cap the request used —
      //   rather than a literal that merely happens to match today. a second hardcoded
      //   figure here would reintroduce the drift the per-rung field removed.
      then('the error reports the cap the request actually sent', async () => {
        const { error, askedMaxTokens } = await askTruncated();
        expect(askedMaxTokens).not.toEqual(null);
        expect(JSON.stringify(error)).toContain(String(askedMaxTokens));
      });

      // .why = the assertion above is satisfiable by ANY agreed number, including a
      //   flat global restored on both sides. this pins the cap to the rung's own
      //   configured limit, so a re-flattening reddens here too.
      then('the cap sent is this rung own configured limit', async () => {
        const { askedMaxTokens } = await askTruncated();
        expect(askedMaxTokens).toEqual(
          CONFIG_BY_ATOM_SLUG[SLUG_UNDER_TEST].maxOutput.tokens,
        );
      });

      then('the error names the fix', async () => {
        const { error } = await askTruncated();
        expect(JSON.stringify(error)).toContain('hint');
      });

      /**
       * .what = snaps the FULL text a caller reads, not a fragment of it
       * .why = every assertion above reads one phrase, so the words BETWEEN those
       *   phrases are unclamped. a rewrite that kept `max_tokens` and `hint` while it
       *   lost the actual guidance would stay green, and no reviewer would see a diff.
       *   this is the error a caller meets at a real blocked state, so the exact text
       *   IS the deliverable (`rule.forbid.friction-hazards`).
       *
       * .note = `error.message` is the WHOLE text a caller reads — helpful-errors
       *   renders the metadata block into it, so the slug, model, and cap are already
       *   inside. it is also the only deterministic view: a serialized error carries
       *   `stack`, which embeds absolute paths, the jest version, and source line
       *   numbers, so a snapshot of it would redden on another machine
       *   (`rule.require.hermetic-tests`).
       */
      then('the full message reads as a caller would see it', async () => {
        const { error } = await askTruncated();
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
