import { getError } from 'helpful-errors';
import type { BrainEpisode } from 'rhachet';
import { given, then, useThen, when } from 'test-fns';
import { z } from 'zod';

import { asAtomSlugParts } from '../brains/asAtomSlugParts';
import { ANTHROPIC_BRAIN_ATOM_SLUGS } from '../brains/BrainAtom.config';
import { genBrainAtom } from './genBrainAtom';

/**
 * .what = clamps the WORDS of the haiku continuation refusal, as a unit
 * .why = the refusal was clamped only inside `genBrainAtom.integration.test.ts`, which
 *   needs a live credential. so on any run without a key — a contributor's laptop, a
 *   fork's ci — the one message a refused caller reads went unchecked, and could drift
 *   green indefinitely.
 *
 * ⚠️ the guard does not need a credential. it sits at the TOP of `ask`, before the
 *   credential check and before any client is built, so the refusal is reproducible
 *   with no key and no network. the integration placement was incidental, not required.
 *
 * .note = this does NOT replace the integration case. that one proves haiku genuinely
 *   drops prior turns against the live api; this one proves the caller is told what to
 *   do about it. behavior and presentation are separate claims
 *   (`rule.forbid.friction-hazards`).
 */
const outputSchema = z.object({ content: z.string() });

/**
 * .what = a minimal prior episode
 * .why = the guard reads `askInput.on?.episode` for presence alone, so no turn content
 *   is needed to reach it. a fuller episode would suggest the content mattered here.
 */
const episodePrior = { exchanges: [] } as unknown as BrainEpisode;

const askWithContinuation = async (slug: 'claude/haiku'): Promise<Error> =>
  getError(
    genBrainAtom({ slug }).ask({
      on: { episode: episodePrior },
      role: {},
      prompt: 'what did you say?',
      schema: { output: outputSchema },
    }),
  );

describe('genBrainAtom haiku continuation refusal', () => {
  given('[case1] a haiku atom asked to continue a prior episode', () => {
    when('[t0] ask is called', () => {
      /**
       * .what = the refusal text, captured ONCE and shared across every assertion below
       * .why = `rule.prefer.useThen-useWhen-for-shared-results`. all three assertions
       *   read the same refusal, so three separate invocations claimed each `then`
       *   needed its own — the redundant shape the rule names.
       *
       * ⚠️ it captures `{ message }`, NOT the error, and that choice carries the whole
       *   correctness of this block. `useThen` resolves via `Object.assign(drawer,
       *   value)` and then DELETES its own `get` trap
       *   (`test-fns/dist/domain.operations/useThen.js`), so every later read hits the
       *   copy — and `Object.assign` copies **enumerable** own properties only.
       *   `Error#message` is own but NON-enumerable, so a captured error yields
       *   `error.message === undefined` and every assertion below silently reads a void.
       *
       *   this was measured, not reasoned: the capture was first written as
       *   `useThen(... => askWithContinuation(...))` and all three assertions went red
       *   with `Received: undefined`.
       *
       * .note = so the constraint is ENUMERABILITY, not the type of the value read. a
       *   plain object literal survives the capture (see `extractResultFromQuery.test`,
       *   which shares an `outcome` this way); an `Error` does not. the credential and
       *   truncation twins keep their per-call form for the related reason that they
       *   assert on the error OBJECT — `toBeInstanceOf`, `JSON.stringify` — which no
       *   projection of its text can serve.
       */
      const refusal = useThen('it refuses', async () => ({
        message: (await askWithContinuation('claude/haiku')).message,
      }));

      // .why = the refusal must beat the credential guard to the throw, or this whole
      //   file would clamp the credential message by accident on a keyless run.
      then('it refuses before the credential is even read', () => {
        expect(refusal.message).not.toContain('ANTHROPIC_API_KEY');
      });

      then('the message names the tiers that DO honor continuation', () => {
        expect(refusal.message).toContain('sonnet');
      });

      /**
       * .what = snaps the FULL text a caller reads
       * .why = this refusal has to carry an unusually precise fact: haiku does not
       *   merely fail at continuation, it SUCCEEDS while it ignores the prior turns.
       *   a caller who reads a vaguer rewrite might reasonably retry rather than
       *   switch tiers. the phrases above leave that sentence unclamped; the snapshot
       *   does not.
       *
       * .note = `error.message` is the WHOLE text a caller reads — helpful-errors
       *   renders the metadata block into it, so the slug and model are already
       *   inside. a serialized error would add `stack`, which is machine-specific
       *   (`rule.require.hermetic-tests`).
       */
      then('the full message reads as a caller would see it', () => {
        expect(refusal.message).toMatchSnapshot();
      });
    });
  });

  given('[case2] the whole shipped ladder, asked to continue', () => {
    /**
     * .what = sweeps every registered rung and splits it by whether it refuses
     *
     * .why = the guard reads the TIER off the slug (`asAtomSlugParts`) rather than
     *   sniffs the vendor's model id. that swap is only safe if the two sets it
     *   produces are exactly the haiku rungs and all the rest — so the sweep is the
     *   claim, and a single hand-picked slug would not carry it.
     *
     * ⚠️ the prior guard was `config.model.includes('haiku')`. it agreed with this one
     *   on today's ladder, which is why no test caught the difference — the hazard was
     *   never a wrong answer today, it was that a vendor rename could drop the tier
     *   word and silently stop the match. haiku's own failure is SILENT (it answers
     *   confidently while it ignores the prior turns), so the guard would have flipped
     *   from a loud refusal to a wrong answer with no code change at all.
     *
     * .note = derived from `ANTHROPIC_BRAIN_ATOM_SLUGS`, never hand-listed. a new rung
     *   joins the correct side on its own, so this cannot go stale under a green run.
     *
     * ⚠️ .note = an INJECTED FAKE client, and it carries weight rather than tidiness.
     *   the refused half needs no client at all — the guard sits at the top of `ask`,
     *   ahead of the credential check, so a haiku rung throws before any client is
     *   built. the ALLOWED half is the opposite: the guard deliberately does NOT fire,
     *   so control falls straight through to the credential check and, with a key in
     *   the env, to a real `messages.create` over the network.
     *
     *   an earlier form of this file omitted the fake and its docblock claimed "no
     *   credential and no network ... every rung is reachable here for free". that was
     *   true for the refused half only. on a machine with `ANTHROPIC_API_KEY` set —
     *   the normal state after a `keyrack unlock` — this unit file made one live
     *   frontier call PER allowed rung, which is `rule.forbid.unit.remote-boundaries`
     *   and real spend, on the opus and fable rates no less.
     *
     *   worse, it made the allowed-half assertion pass for the WRONG REASON: with no
     *   key it was the CREDENTIAL error that failed to contain "not supported with
     *   haiku", so the tier logic under test was never exercised at all. the fake
     *   removes both faults at once — hermetic, and the assertion now reads a real
     *   pass through the guard.
     */
    const slugsRefused = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
      (slug) => asAtomSlugParts({ slug }).tier === 'haiku',
    );
    const slugsAllowed = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
      (slug) => asAtomSlugParts({ slug }).tier !== 'haiku',
    );

    /**
     * .what = a client that answers, so an allowed rung completes without a network
     * .why = the claim under test is "the guard let this rung through". a rung that
     *   reaches the client has already proven that, so the response body only has to
     *   satisfy the schema.
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

    const askContinuation = async (
      slug: (typeof ANTHROPIC_BRAIN_ATOM_SLUGS)[number],
    ): Promise<{ output: { content: string } }> =>
      genBrainAtom({ slug }).ask(
        {
          on: { episode: episodePrior },
          role: {},
          prompt: 'what did you say?',
          schema: { output: outputSchema },
        },
        { anthropic: genFakeAnthropic() } as never,
      );

    const askContinuationError = async (
      slug: (typeof ANTHROPIC_BRAIN_ATOM_SLUGS)[number],
    ): Promise<Error> => getError(askContinuation(slug));

    when('[t0] each rung is asked to continue a prior episode', () => {
      // .why = both sets must be non-empty, or a filter that matched none would make
      //   the two loops below vacuously true and report success for no work done.
      then('the sweep covers rungs on both sides of the split', () => {
        expect(slugsRefused.length).toBeGreaterThan(1);
        expect(slugsAllowed.length).toBeGreaterThan(1);
      });

      then(
        'every haiku rung refuses, by tier rather than by model id',
        async () => {
          for (const slug of slugsRefused) {
            const error = await askContinuationError(slug);
            expect(error.message).toContain('not supported with haiku');
          }
        },
      );

      /**
       * ⚠️ `claude/fable/v5` is the rung this assertion exists for. its model id is
       *   `claude-fable-5`, which the old substring sniff also let through — but only
       *   by accident of the word absent from that id. here it passes because its TIER
       *   is not haiku, which is the actual reason.
       *
       * ⚠️ this asserts the call COMPLETES, rather than that an error text lacks a
       *   substring. the earlier negative form (`expect(error.message).not.toContain`)
       *   was satisfiable by ANY error — and on a keyless machine the error it actually
       *   read was the CREDENTIAL refusal, so the tier logic went unexercised while the
       *   assertion reported success. a resolved call proves the rung reached the
       *   client, which is the one thing "the guard did not refuse it" can mean.
       */
      then('no other rung is refused by this guard', async () => {
        for (const slug of slugsAllowed) {
          const result = await askContinuation(slug);
          expect(result.output.content).toEqual('ok');
        }
      });
    });
  });
});
