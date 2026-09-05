import { getError } from 'helpful-errors';
import type { BrainEpisode } from 'rhachet';
import { genBrainPlugToolDeclaration } from 'rhachet/brains';
import { given, then, useThen, when } from 'test-fns';
import { z } from 'zod';

import { genBrainRepl } from './genBrainRepl';

/**
 * .what = clamps the three "a repl cannot do this" refusals, as full text
 * .why = these are the messages a caller meets when they try the exact things the
 *   readme says a repl does not support: continue an episode, pass external tools, or
 *   hand back tool results. each was asserted only by phrase
 *   (`toContain('continuation')`, `toContain('not supported')`), so the words BETWEEN
 *   those phrases were unclamped — and the load-bearing half of each message is
 *   precisely what sits between them: **use BrainAtom instead**.
 *
 * ⚠️ this is the FOURTH time this behavior met the same defect class: a guard clamped
 *   on the atom and left unclamped on its repl twin. the credential guard, then the
 *   unknown-slug guard, now these three. the lesson is not "add a test" — it is that a
 *   repair on one of two twin objects must be checked against the other in the same
 *   pass, because the twin is where this defect class keeps its last hiding place.
 *
 * .note = a UNIT test. all three guards fire at the top of `invokeQuery`, before the
 *   credential check and before the lazy sdk import — so this needs no key, no network,
 *   and does not touch `process.env`.
 */
const outputSchema = z.object({ content: z.string() });

const replSonnet = genBrainRepl({ slug: 'claude/code' });

/**
 * .what = a minimal prior episode
 * .why = the guard reads `on.episode` for presence alone, so no turn content is needed
 *   to reach it
 */
const episodePrior = { exchanges: [] } as unknown as BrainEpisode;

/**
 * .what = a well-formed tool declaration the repl will refuse
 * .why = built through rhachet's own `genBrainPlugToolDeclaration` rather than cast,
 *   so the clamp proves the guard rejects a LEGITIMATE tool. a cast-shaped stub would
 *   leave open the reading that the refusal came from a malformed input.
 */
const toolWaveReport = genBrainPlugToolDeclaration({
  slug: 'getWaveReport',
  name: 'WaveReport',
  description: 'reads the surf report for a spot',
  schema: {
    input: z.object({ spot: z.string().describe('the surf spot') }),
    output: z.object({ feet: z.number().describe('wave height in feet') }),
  },
  execute: async () => ({ feet: 4 }),
});

describe('genBrainRepl unsupported-capability refusals', () => {
  given('[case1] a repl asked to continue a prior episode', () => {
    when('[t0] ask is called with on.episode', () => {
      /**
       * .what = the refusal text, captured ONCE for both assertions below
       * .why = `rule.prefer.useThen-useWhen-for-shared-results`. both assertions read
       *   the same refusal, so two invocations claimed each needed its own.
       *
       * ⚠️ it captures `{ message }`, NOT the error. `useThen` resolves via
       *   `Object.assign` and then deletes its own `get` trap, so a later read hits a
       *   copy of the **enumerable** own properties — and `Error#message` is own but
       *   NON-enumerable, so a captured error reads back `undefined`. measured: the
       *   first form captured the error and all six assertions in this file went red.
       *   the atom's continuation twin carries the full account.
       */
      const refusal = useThen('it refuses', async () => ({
        message: (
          await getError(
            replSonnet.ask({
              on: { episode: episodePrior },
              role: {},
              prompt: 'what did you say?',
              schema: { output: outputSchema },
            }),
          )
        ).message,
      }));

      // ⚠️ the phrase assertions this replaces both matched on words that carry no
      //   guidance. the caller needs the POINTER — which brain to reach for instead —
      //   and that is the half a phrase check never held.
      then('the message names the alternative, not only the refusal', () => {
        expect(refusal.message).toContain('BrainAtom');
      });

      then('the full message reads as a caller would see it', () => {
        expect(refusal.message).toMatchSnapshot();
      });
    });

    // .why = `act` is the write-enabled half and a separate entry point on the object a
    //   consumer holds. both route through one `invokeQuery`, so this proves the shared
    //   path rather than re-clamp the message.
    when('[t1] act is called with on.episode', () => {
      then('act refuses too, not only ask', async () => {
        const error = await getError(
          replSonnet.act({
            on: { episode: episodePrior },
            role: {},
            prompt: 'what did you say?',
            schema: { output: outputSchema },
          }),
        );
        expect(error.message).toContain('continuation is not supported');
      });
    });
  });

  given('[case2] a repl handed external tool plugs', () => {
    when('[t0] ask is called with plugs.tools', () => {
      const refusal = useThen('it refuses', async () => ({
        message: (
          await getError(
            replSonnet.ask({
              plugs: { tools: [toolWaveReport] },
              role: {},
              prompt: 'what is the surf like?',
              schema: { output: outputSchema },
            }),
          )
        ).message,
      }));

      // .why = a repl DOES use tools — internally, via the sdk. so "not supported" alone
      //   reads as a flat contradiction of what the repl visibly does. the message has
      //   to draw that distinction or the caller assumes a defect.
      then('the message says tools are handled internally, not absent', () => {
        expect(refusal.message).toContain('internally');
      });

      then('the full message reads as a caller would see it', () => {
        expect(refusal.message).toMatchSnapshot();
      });
    });
  });

  given('[case3] a repl handed tool results as its prompt', () => {
    when('[t0] ask is called with an array prompt', () => {
      const refusal = useThen('it refuses', async () => ({
        message: (
          await getError(
            replSonnet.ask({
              role: {},
              prompt: [
                { slug: 'getWaveReport', input: {}, output: { feet: 4 } },
              ] as never,
              schema: { output: outputSchema },
            }),
          )
        ).message,
      }));

      // .why = the caller passed an array where a string was wanted. the message must
      //   name the shape, or they will re-send the same array in a different wrapper.
      then('the message names the accepted prompt shape', () => {
        expect(refusal.message).toContain('string prompts');
      });

      then('the full message reads as a caller would see it', () => {
        expect(refusal.message).toMatchSnapshot();
      });
    });
  });
});
