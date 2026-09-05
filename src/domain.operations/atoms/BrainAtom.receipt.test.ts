import { asIsoPriceWords, priceSum } from 'iso-price';
import { given, then, useThen, when } from 'test-fns';
import { z } from 'zod';

import { genBrainAtom } from './genBrainAtom';

/**
 * .what = captures the `metrics` a caller actually reads off an `ask`, verbatim
 *
 * .why = the vision's whole defense of the alias that MOVES rests on this object. it
 *   argues that a caller who rides `claude/opus` from 4.5 to 5 "sees the price change
 *   without us to announce it", because `metrics.cost.cash` is a per-call receipt. that
 *   is an ERGONOMIC claim about rendered output, and it was never once looked at.
 *
 * ⚠️ every extant assertion on this object is a liveness check, not a read:
 *   `expect(result.metrics.cost.cash.total).toBeDefined()`,
 *   `expect(result.metrics.size.tokens.input).toBeGreaterThan(0)`. those pass for a
 *   figure a human cannot act on — `USD 0`, a full-precision tail, a bare number, a
 *   currency-less string. so the receipt could have been unreadable and the suite green.
 *
 * .why A SNAPSHOT: the value here is that a human SEES the rendered figure in a pr diff
 *   (`rule.require.snapshots`). the assertions beside it hold the properties a
 *   `--resnap` could otherwise wave through.
 *
 * .note = a UNIT test with an INJECTED FAKE client, so the token counts are fixed and
 *   the arithmetic is fully determined by our own rate literals. no credential, no
 *   network, no charge — and no flake, which a live call could not promise for a
 *   snapshot of exact figures.
 */

const outputSchema = z.object({ content: z.string() });

/**
 * .what = fixed token counts, chosen to make the arithmetic checkable by hand
 * .why = 1000 in / 400 out against opus 5 at $5/$25 per MTok gives input $0.005 and
 *   output $0.010 — a receipt a reader can verify without a calculator.
 *
 * ⚠️ the two sides must land on DIFFERENT figures. a first draft used 200 output tokens,
 *   which prices out at $0.005 — identical to the input side by coincidence of the 5:1
 *   rate ratio. the attributability assertion below then failed, correctly: with equal
 *   halves it could not tell a real split from a value copied into both slots. the
 *   fixture, not the assertion, was the defect.
 */
const USAGE_FAKE = { input_tokens: 1000, output_tokens: 400 };

const genFakeAnthropic = (): unknown => ({
  messages: {
    create: async () => ({
      content: [{ type: 'text', text: '{"content":"ok"}' }],
      stop_reason: 'end_turn',
      usage: USAGE_FAKE,
    }),
  },
});

describe('the receipt a caller reads off an ask', () => {
  given('[case1] an ask that completes on claude/opus', () => {
    when('[t0] the metrics are read', () => {
      const metrics = useThen('the ask returns', async () => {
        const result = await genBrainAtom({ slug: 'claude/opus' }).ask(
          {
            role: {},
            prompt: 'respond with exactly: ok',
            schema: { output: outputSchema },
          },
          { anthropic: genFakeAnthropic() } as never,
        );
        return {
          size: result.metrics.size,
          cash: result.metrics.cost.cash,
          // .why = wall time varies per run, so the real figure would make this
          //   snapshot flake. its PRESENCE is asserted separately below; only the
          //   value is redacted, never the key.
          timeKeys: Object.keys(result.metrics.cost.time).sort(),
        };
      });

      then('the whole receipt reads as a caller would see it', () => {
        expect(metrics).toMatchSnapshot();
      });

      /**
       * ⚠️ the derived clamps a `--resnap` cannot wave through. a regenerated snapshot
       *   would happily bake in `USD 0` or a currency-less figure; these state the
       *   properties that make the receipt ACTIONABLE, which is the ergonomic claim.
       */
      then('the total names a currency, so it is unambiguous', () => {
        // `rule.forbid.ambiguous-labels`: a bare `0.01` leaves "0.01 what?" open.
        expect(String(metrics.cash.total)).toMatch(/^[A-Z]{3} /);
      });

      then('the total is non-zero, so the receipt is not a flat line', () => {
        // a rate literal lost to a refactor renders a zero total — present, defined,
        // and useless. that is the failure `toBeDefined()` could never catch.
        //
        // ⚠️ this reads the AMOUNT numerically. a first draft matched
        //   `/^[A-Z]{3} 0(\.0+)?$/` and was DEAD by construction: `\.0+` cannot span
        //   the underscore separators iso-price renders, so it never matches a zero
        //   and `.not.toMatch` held at exactly the defect it was written to catch.
        //   the evidence sat in the snapshot BESIDE this file the whole time —
        //   `"USD 0.000_000_000"` — and the regex was written anyway. a snapshot is
        //   only evidence once it is read against the assertion it sits next to.
        //
        // ⚠️ surfaced while the REPL twin of this clamp was built. the atom got the
        //   receipt read first and the repl did not, which is the same twin-drift this
        //   file's own suite warns about elsewhere. a fix to one twin is a hypothesis
        //   about the other, and here the hypothesis held: both carried the dead form.
        //
        //   a numeric parse is immune to how many places iso-price chooses to render,
        //   which is the property that makes it hold as precision varies by currency.
        const [currency, amountWords] = String(metrics.cash.total).split(' ');
        expect(currency).toMatch(/^[A-Z]{3}$/);
        expect(Number(amountWords?.replace(/_/g, ''))).toBeGreaterThan(0);
      });

      then('the split adds up, so input and output are attributable', () => {
        // the vision's argument is that a caller can SEE which side moved when a rung
        // starts to think by default — output tokens rise, input does not. that needs
        // both sides itemized AND reconcilable against the total; an itemization that
        // does not sum is worse than none, since a caller would trust it.
        //
        // ⚠️ this assertion is named "adds up" and a first draft never added anything —
        //   it checked presence and inequality only. a name that promises more than the
        //   body delivers is the shape `rule.forbid.failhide` warns about, so the body
        //   now does the sum.
        expect(String(metrics.cash.deets.output)).not.toEqual(
          String(metrics.cash.deets.input),
        );
        // ⚠️ compared through `asIsoPriceWords`, NOT with `===` on the raw values and
        //   NOT with `isIsoPrice.equal`. two prices equal in value can differ as
        //   strings ('USD 0.25' vs 'USD 0.250_000'), so a bare `===` would be a false
        //   red. and `.equal` does not exist at iso-price@1.1.1 — the repo brief lists
        //   it, the installed package carries only `.assure`. the canonical-words cast
        //   is the comparison this version actually supports.
        expect(asIsoPriceWords(metrics.cash.total)).toEqual(
          asIsoPriceWords(
            priceSum(
              metrics.cash.deets.input,
              metrics.cash.deets.output,
              metrics.cash.deets.cache.get,
              metrics.cash.deets.cache.set,
            ),
          ),
        );
      });

      then('wall time is reported, not merely tokens', () => {
        expect(metrics.timeKeys).toContain('milliseconds');
      });
    });
  });
});
