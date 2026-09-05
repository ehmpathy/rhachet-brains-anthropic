import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';
import { z } from 'zod';

import {
  ANTHROPIC_BRAIN_REPL_SLUGS,
  type AnthropicBrainReplSlug,
  CONFIG_BY_REPL_SLUG,
} from '../brains/BrainRepl.config';
import { genBrainRepl } from './genBrainRepl';

/**
 * .what = proves every DISTINCT model id on the repl ladder is reachable through the
 *   agent-sdk, not only through the atom path
 *
 * .why = the wish asks for the frontier from `genBrainRepl` as its own acceptance
 *   criterion, and the atom sweep cannot discharge it. a repl does not call the
 *   messages api — `genBrainRepl` hands `config.model` to `claude-agent-sdk` as a
 *   plain string, so reachability is gated by that sdk, not by our config.
 *
 * ⚠️ an earlier version probed only the three bare tier aliases, and defended that with
 *   a claim that turned out to be FALSE: *"every pinned rung shares its config with an
 *   alias, so a full sweep adds no signal."* a read of `CONFIG_BY_REPL_SLUG` refutes it.
 *   only the NEWEST rung of a tier shares an id with its alias — `claude/code/opus` and
 *   `claude/code/opus/v5` both name `claude-opus-5`. every other pin names an id no
 *   alias reaches: `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`,
 *   `claude-opus-4-5-20251101`, `claude-sonnet-4-6`, and the rest. so the three-alias
 *   probe left TEN distinct model ids unproven against the agent-sdk, which is a
 *   separate runtime from the messages api and does not type-gate the model.
 *
 *   that is exactly the F8 risk the vision raised, and the old note argued it away with
 *   a fact it had never checked. a peer review caught it.
 *
 * .why one slug per MODEL ID rather than one per slug = the sdk receives
 *   `config.model`, never the slug. so two slugs that name one id cannot behave
 *   differently at the sdk boundary, and a second call for the second slug buys no
 *   signal — it only buys another agentic session. 18 slugs collapse to 13 ids.
 *
 * .why the PINNED rung wins the tie = when an alias and a pin name one id, the pin is
 *   probed. the alias is then covered by two facts together: `[case3]` asserts the exact
 *   id it maps to, and this sweep proves that id answers. the pin is the rung a caller
 *   holds for stability, so it is the one worth the live call.
 *
 * .note = these cases assert MODEL IDENTITY too, without a line that says so.
 *   `asUsageFromModelUsage` throws when the sdk reports usage for no model we asked
 *   for, and every case below reads `metrics.size.tokens`, which is built from that
 *   total. so a silent model swap turns this suite red rather than hands back a
 *   confident wrong cost. the swap case itself is clamped in
 *   `asUsageFromModelUsage.test.ts`, where it can be summoned on demand — a live
 *   call cannot be made to swap.
 */
if (!process.env.ANTHROPIC_API_KEY)
  throw new BadRequestError(
    'ANTHROPIC_API_KEY is required for integration tests',
    {
      hint: 'run: rhx keyrack unlock --owner ehmpath --env test',
    },
  );

const outputSchema = z.object({ content: z.string() });

/**
 * .what = one repl slug per distinct model id, with the most-pinned slug preferred
 * .why = see the header. the tie-break reads segment depth, so
 *   `claude/code/sonnet/v5` (4) beats `claude/code/sonnet` (3) beats `claude/code` (2).
 *
 * .note = derived from `ANTHROPIC_BRAIN_REPL_SLUGS`, never hand-listed. a new rung joins
 *   the sweep on its own, so this cannot go stale under a green run — the failure mode
 *   the old three-alias list had.
 */
const slugByModel = new Map<string, AnthropicBrainReplSlug>();
for (const slug of ANTHROPIC_BRAIN_REPL_SLUGS) {
  const model = CONFIG_BY_REPL_SLUG[slug].model;
  const slugHeld = slugByModel.get(model);
  if (!slugHeld || slug.split('/').length > slugHeld.split('/').length)
    slugByModel.set(model, slug);
}

const slugsProbed = [...slugByModel.values()];
const slugsLive = slugsProbed.filter(
  (slug) => !CONFIG_BY_REPL_SLUG[slug].deprecated,
);
const slugsRetired = slugsProbed.filter(
  (slug) => CONFIG_BY_REPL_SLUG[slug].deprecated,
);

// .note = the return type is INFERRED, not annotated. an annotation of
//   `Awaited<ReturnType<…>>` widens `output` back to `unknown`, because the generic that
//   carries the zod schema is lost the moment the signature is written by hand — so the
//   annotation would cost the very type the schema exists to supply.
const askSmallest = (slug: AnthropicBrainReplSlug) =>
  genBrainRepl({ slug }).ask({
    role: {},
    prompt: 'respond with exactly: ok',
    schema: { output: outputSchema },
  });

/**
 * .what = the bare tier aliases, each paired with the EXACT model id it must map to
 * .why = what a caller who picks a tier actually reaches for, plus the one fact this
 *   suite exists to protect: that the alias sits on the 5-gen rung.
 *
 * ⚠️ the pair is EXACT, and it must stay exact. an earlier version asserted
 *   `.toContain('-5')`, which is a FALSE-GREEN clamp: the 4.5 ids are
 *   `claude-sonnet-4-5-20250929` and `claude-opus-4-5-20251101`, and the text `-5`
 *   sits inside `4-5-`. so a regression of an alias back to its 4.5 rung would
 *   have kept this suite green — the live probe answers fine, since 4.5 is a valid
 *   model — while the alias silently fell off the frontier. that is the exact
 *   silent regression this sweep was built to catch, and the clamp could not see it.
 *
 * .why exact over a regex = `/-5$/` would close today's trap and leave the next one. an
 *   exact id fails on ANY drift — wrong tier, wrong rung, a re-dated snapshot — rather
 *   than on the one shape a pattern was written to reject.
 */
const MODEL_EXPECTED_BY_SLUG = {
  'claude/code/sonnet': 'claude-sonnet-5',
  'claude/code/opus': 'claude-opus-5',
  'claude/code/fable': 'claude-fable-5',
} as const;

describe('BrainRepl.slugReach.integration', () => {
  jest.setTimeout(300000);

  given('[case1] every distinct model id that is not marked deprecated', () => {
    // .why = a filter that matched none would make the loop below vacuously true and
    //   report success for no work done — the shape this whole suite exists to reject.
    then('the sweep covers more ids than the three aliases did', () => {
      expect(slugsLive.length).toBeGreaterThan(3);
    });

    for (const slug of slugsLive) {
      when(`[t0] ask is called via "${slug}"`, () => {
        then('the model answers, so the agent-sdk serves this id', async () => {
          const result = await askSmallest(slug);
          expect(result.output.content).toBeDefined();
          expect(result.metrics.size.tokens.output).toBeGreaterThan(0);
        });
      });
    }
  });

  given('[case2] every distinct model id marked deprecated', () => {
    /**
     * .why = the mark says this rung is retired first-party and reachable only via a
     *   partner platform. the ATOM sweep proves that claim on the messages api; until
     *   now the repl side merely mirrored it, which a peer review called out as an
     *   asymmetry in the deprecation surface. a mark asserted on one path and assumed
     *   on the other is half a promise.
     *
     * ⚠️ if this goes green, the rung is live again through the agent-sdk and the mark
     *   lies — which is a find, not a failure.
     *
     * .note = this block is ALSO the negative control for `[case1]`, and that is the
     *   reason it earns its live calls twice over. `[case1]` claims the agent-sdk serves
     *   ten ids; on its own, a green there is equally consistent with an sdk that serves
     *   every string handed to it and never rejects one. `[case2]` drives the SAME code
     *   path with ids the sdk does not serve and gets a loud, model-specific refusal —
     *   so the ten greens are known to carry real signal.
     *
     * ⚠️ and that control turned out to be far from a formality: one of the three rungs
     *   here proves the sdk sometimes SUBSTITUTES rather than refuses. see the measured
     *   note on the assertions below — it is the sharpest result in this file.
     */
    then('the retired half is non-empty, so the loop is not vacuous', () => {
      expect(slugsRetired.length).toBeGreaterThan(1);
    });

    for (const slug of slugsRetired) {
      when(`[t0] ask is called via "${slug}"`, () => {
        then('it fails, which is what the mark claims', async () => {
          const error = await getError(askSmallest(slug));
          expect(error).toBeInstanceOf(Error);

          // .why = a bare `instanceof Error` would also pass on a bad api key, a rate
          //   limit, or a network blip — so it could go green for a reason unrelated to
          //   the claim, which is the failhide this case exists to close. every
          //   assertion below was written from a MEASURED message, never a guessed one:
          //   a probe run swapped them for `toEqual('PROBE: …')` to make the real text
          //   print.
          //
          // 🔴 THE HEADLINE FIND OF THIS SUITE. the probe expected one refusal shape and
          //   found TWO, and the second is a hazard the first hides:
          //
          //   shape A — a LOUD refusal. `claude/code/haiku/v3.5` and
          //     `claude/code/sonnet/v4` come back with the sdk's own sentence:
          //     "There's an issue with the selected model (claude-sonnet-4-20250514).
          //      It may not exist or you may not have access to it."
          //
          //   shape B — a SILENT SUBSTITUTION. `claude/code/opus/v4` does NOT refuse.
          //     the sdk accepts `claude-opus-4-20250514`, then quietly runs
          //     `claude-haiku-4-5-20251001` and `claude-opus-5` instead. it answers. the
          //     ONLY reason this rung fails at all is our own `asUsageFromModelUsage`
          //     guard, which notices the usage report names no model we asked for.
          //
          //   so on the repl path an unserved id is not reliably an error. without that
          //   guard, a caller pinned to `claude/code/opus/v4` would have received a real
          //   answer from OPUS 5, priced at our opus-4 rate, with no signal whatever —
          //   a wrong model AND a wrong bill, both silent. this is the F8 hazard the
          //   vision raised as documentary, now measured on a live rung.
          //
          //   ⚠️ this is also why the three-alias probe had to go. all three aliases sit
          //   on ids the sdk serves, so no alias could ever have surfaced shape B. the
          //   peer review that demanded the pinned rungs be swept found a live defect
          //   class, not a coverage formality.
          //
          // .what the disjunction asserts = the rung does not serve, and the failure is
          //   LOUD and names the requested id. both shapes satisfy that; neither hands a
          //   caller a wrong answer. a single-phrase clamp would have rejected the shape
          //   that matters most.
          expect(error.message).toContain(CONFIG_BY_REPL_SLUG[slug].model);
          expect(error.message).toMatch(
            /It may not exist|token usage for no model we requested/,
          );
          expect(error.message).not.toContain('ANTHROPIC_API_KEY');
        });
      });
    }
  });

  given('[case3] each bare tier alias', () => {
    for (const slug of Object.keys(
      MODEL_EXPECTED_BY_SLUG,
    ) as (keyof typeof MODEL_EXPECTED_BY_SLUG)[]) {
      when(`[t0] the config is read for "${slug}"`, () => {
        // .note = a config read, NOT a live call. the id it names is probed live by
        //   `[case1]` under its pinned twin, so a second agentic session here would buy
        //   no signal (`rule.forbid.redundant-expensive-operations`).
        then('the alias maps to exactly the expected 5-gen model id', () => {
          expect(CONFIG_BY_REPL_SLUG[slug].model).toEqual(
            MODEL_EXPECTED_BY_SLUG[slug],
          );
        });
      });
    }
  });
});
