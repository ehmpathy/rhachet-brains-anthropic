import { getError, given, then, when } from 'test-fns';
import { z } from 'zod';

import { genBrainAtom } from './genBrainAtom';

/**
 * .what = clamps the guard on a text block that was never json
 * .why = the truncation clamp next door covers a payload cut off MID-json. it does not
 *   cover a payload that is not json at all — the model answered in prose instead of
 *   through the structured output format, and stopped normally, so `stop_reason` reads
 *   `end_turn` and the truncation guard never fires. that case fell to a bare
 *   `JSON.parse` and surfaced as a raw `SyntaxError` that named no slug, no model, no fix.
 *
 * ⚠️ this is the ATOM half of a twin defect. the repl half
 *   (`extractResultFromQuery.asOutputFromResultText`) was repaired a round earlier and
 *   this half was left unrepaired, so for one round the same defect was fixed on one
 *   ladder and live on the other. a reviewer caught the asymmetry. the lesson is the
 *   general one: a fix to one twin is a HYPOTHESIS about the other, and it must be
 *   checked in the same pass rather than assumed.
 *
 * .note = the prose case is not hypothetical here — this behavior MEASURED it once, as
 *   the ambiguous-prompt `act` case, on the repl side.
 *
 * .note = a unit test with an INJECTED FAKE client. deterministic, no network, no charge.
 */
const outputSchema = z.object({ content: z.string() });

/**
 * .what = a fake anthropic client that answered in prose rather than json
 * .why = reproduces the exact shape the api returns when the model ignores the output
 *   format: plain text in the block, and a NORMAL `end_turn` stop reason — which is what
 *   makes it slip past the truncation guard
 */
const genFakeAnthropicProse = (): unknown => ({
  messages: {
    create: async () => ({
      content: [
        {
          type: 'text',
          text: 'Sure! I can help with that. The ocean is very large.',
        },
      ],
      // ⚠️ NOT 'max_tokens' — a normal stop. this is the whole point: the truncation
      //   guard reads `stop_reason`, so it cannot catch this case.
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 12 },
    }),
  },
});

describe('genBrainAtom malformed output', () => {
  given('[case1] the model answers in prose rather than json', () => {
    when('[t0] ask is called', () => {
      /**
       * .note = called per `then` rather than shared via `useThen`, for the same reason
       *   the truncation twin gives: `useThen` hands back a deferred proxy, so
       *   `toBeInstanceOf` and `.message` reads do not work through it. the fake is
       *   in-memory and sub-millisecond, so repeat calls are free and each `then` keeps
       *   its single assertion.
       */
      const askProse = async () =>
        genBrainAtom({ slug: 'claude/opus' }).ask(
          {
            role: {},
            prompt: 'describe the ocean',
            schema: { output: outputSchema },
          },
          // .note = `as never` because rhachet types this context slot as `Empty` while
          //   `genBrainAtom` reads `context.anthropic` off it. same sanctioned exemption
          //   the truncation twin documents.
          { anthropic: genFakeAnthropicProse() } as never,
        );

      then('it throws, rather than surface a bare SyntaxError', async () => {
        const error = await getError(askProse());
        expect(error).toBeInstanceOf(Error);
        // the defect was a bare SyntaxError from JSON.parse
        expect(error.constructor.name).not.toEqual('SyntaxError');
        // .note = and NOT an auth error either — that would mean the fake client was
        //   never wired in, so the test would pass for an unrelated reason
        expect(error.message).not.toContain('authentication');
      });

      then(
        'the error distinguishes this from the truncation case',
        async () => {
          const error = await getError(askProse());
          // ⚠️ asserted on `text block`, NOT on `not valid json`. the dogfood showed why:
          //   with the guard neutered, the raw V8 error reads
          //   `... is not valid JSON` — which differs from our `... is not valid json`
          //   only by LETTER CASE. so the obvious assertion passed for the right reason
          //   by the thinnest possible margin, and would have gone false-green on a
          //   capitalization edit or a V8 phrasing change. `text block` is ours alone.
          expect(error.message).toContain('text block');
          // the truncation guard's message names the cap; this one must not, or the two
          // causes would read identically and point a reader at the wrong fix
          expect(error.message).not.toContain('cut off mid-json');
        },
      );

      then('the error carries the slug and model', async () => {
        const error = await getError(askProse());
        expect(error.message).toContain('claude/opus');
        expect(error.message).toContain('claude-opus-5');
      });

      then('the error carries the payload as evidence', async () => {
        const error = await getError(askProse());
        // without the payload a reader cannot tell prose-instead-of-tool from a schema
        // mismatch, and those have different fixes
        expect(error.message).toContain('Sure! I can help');
      });

      /**
       * .what = snaps the FULL text a caller reads
       * .why = the assertions above each read one phrase, so the words between them are
       *   unclamped. this is the text a caller meets at a real blocked state, so the
       *   exact prose IS the deliverable.
       * .note = `error.message` rather than a serialized error — helpful-errors renders
       *   the metadata into the message, and a serialized error carries `stack`, which
       *   embeds absolute paths and would redden on another machine.
       */
      then('the full message reads as a caller would see it', async () => {
        const error = await getError(askProse());
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
