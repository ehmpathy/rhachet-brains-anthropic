import { BadRequestError } from 'helpful-errors';
import { asIsoPriceWords, priceSum } from 'iso-price';
import path from 'path';
import { genArtifactGitFile } from 'rhachet-artifact-git';
import { getError, given, then, useThen, when } from 'test-fns';
import { z } from 'zod';

import { TEST_ASSETS_DIR } from '../../.test/assets/dir';
import { genBrainRepl } from './genBrainRepl';

const BRIEFS_DIR = path.join(TEST_ASSETS_DIR, '/example.briefs');

const outputSchema = z.object({ content: z.string() });

if (!process.env.ANTHROPIC_API_KEY)
  throw new BadRequestError(
    'ANTHROPIC_API_KEY is required for integration tests',
  );

describe('genBrainRepl.integration', () => {
  // act mode runs a full agentic read+write session, which regularly exceeds 60s;
  // give it headroom so the ask/act coverage is not cut off by a too-tight timeout
  jest.setTimeout(120000);

  // use haiku for fast integration tests
  const brainRepl = genBrainRepl({ slug: 'claude/code/haiku' });

  given('[case1] genBrainRepl({ slug: "claude/code/haiku" })', () => {
    when('[t0] inspecting the repl', () => {
      then('repo is "anthropic"', () => {
        expect(brainRepl.repo).toEqual('anthropic');
      });

      then('slug is "claude/code/haiku"', () => {
        expect(brainRepl.slug).toEqual('claude/code/haiku');
      });

      then('description is defined', () => {
        expect(brainRepl.description).toBeDefined();
        expect(brainRepl.description.length).toBeGreaterThan(0);
      });
    });
  });

  given('[case2] ask is called (readonly mode)', () => {
    when('[t0] with simple prompt', () => {
      /**
       * .note = the prompt names the FIELD, matched to `[case3]` below. "respond with
       *   exactly: ..." reads two ways once a structured-output tool is in play — as
       *   what to say, or as how to format — and `[case3]` was already disambiguated
       *   for exactly that (3 meta-answers in 13 samples).
       *
       * ⚠️ `[case2]` and `[case3]` are TWINS: one ask, one act, same prompt shape. the
       *   act twin got the repair and the ask twin did not, which left a known
       *   ambiguity untreated on the readonly path purely because it fired less often.
       *   ask carries fewer tools, so it is less prone — less prone is not immune.
       *
       * ⚠️ the ASSERTIONS below are unchanged and no weaker. only the prompt moved
       *   (`rule.require.review-test-changes`).
       */
      const result = useThen('it succeeds', async () =>
        brainRepl.ask({
          role: {},
          prompt:
            'set the `content` field of your structured output to exactly this text: hello from claude code',
          schema: { output: outputSchema },
        }),
      );

      then('it returns a substantive response', () => {
        expect(result.output.content).toBeDefined();
        expect(result.output.content.length).toBeGreaterThan(0);
        expect(result.output.content.toLowerCase()).toContain('hello');
      });

      then('it returns metrics with token counts', () => {
        expect(result.metrics).toBeDefined();
        expect(result.metrics.size.tokens.input).toBeGreaterThan(0);
        expect(result.metrics.size.tokens.output).toBeGreaterThan(0);
      });

      /**
       * .what = the receipt a repl caller READS, not merely one that exists
       *
       * ⚠️ this block replaced four `toBeDefined()` calls. every one of them passed
       *   for `USD 0`, for a currency-less bare number, and for a `deets` that does
       *   not sum to its own `total` — so the repl's cost figure could have been
       *   unreadable and this suite stayed green. that is the same liveness-not-a-read
       *   defect found on the atom, and it is WORSE here for two reasons:
       *
       *   1. the repl re-prices the sdk's totals at OUR literal rate
       *      (`genBrainRepl.ts:224-227`). no vendor figure ever contradicts it, so a
       *      wrong rate renders a confidently wrong number rather than an absent one.
       *   2. the repl ladder spans a 10x rate spread (haiku 4.5 at $1/$5 against
       *      fable 5 at $10/$50), so a mis-priced rung is a large error, not a rounded one.
       *
       * .why NOT a figure snapshot: this is a LIVE call, so token counts vary per run
       *   and an exact-figure snapshot would flake. the shape is snapped (a dropped or
       *   renamed field surfaces in a pr diff) and the VALUES are held by derived
       *   clamps, which no `--resnap` can wave through.
       */
      then('the receipt reads as a caller would see it', () => {
        const cash = result.metrics.cost.cash;

        // `rule.forbid.ambiguous-labels`: a bare `0.01` leaves "0.01 what?" open
        expect(String(cash.total)).toMatch(/^[A-Z]{3} /);

        // a rate literal lost to a refactor renders a zero total — present, defined,
        // and useless. that is the failure `toBeDefined()` could never catch.
        //
        // ⚠️ this reads the AMOUNT numerically. a first draft matched
        //   `/^[A-Z]{3} 0(\.0+)?$/` and was DEAD by construction: iso-price renders a
        //   zero as `USD 0.000_000_000` (see the atom's snapshot, which holds that
        //   string verbatim), and `\.0+` cannot span the underscore separators. so the
        //   pattern never matches, and `.not.toMatch` held at exactly the defect it
        //   was written to catch.
        //
        // ⚠️ the DOGFOOD that proves this clamp bites needs all FOUR rate literals
        //   zeroed, not two. a first attempt zeroed only `input` and `output` and
        //   stayed green — an agent-sdk run caches heavily, so the untouched cache
        //   rates ($0.10/$1.25 per MTok) alone kept the total above zero. with every
        //   rate zeroed it reddens: `Expected: > 0, Received: 0`.
        //
        //   that partial neuter is worth a note: it looks like a clamp that held and
        //   is really an incomplete experiment. a rate table with N terms needs all N
        //   zeroed before a zero-total claim can be tested at all.
        //
        //   a numeric parse is immune to how many places iso-price chooses to render,
        //   which is the property that makes it hold as precision varies by currency.
        const [currency, amountWords] = String(cash.total).split(' ');
        expect(currency).toMatch(/^[A-Z]{3}$/);
        expect(Number(amountWords?.replace(/_/g, ''))).toBeGreaterThan(0);

        // the itemization must reconcile against the total. an itemization that does
        // not sum is worse than none, since a caller would trust it.
        //
        // ⚠️ compared through `asIsoPriceWords`, NOT with `===` on the raw values and
        //   NOT with `isIsoPrice.equal`. two prices equal in value can differ as
        //   strings ('USD 0.25' vs 'USD 0.250_000'), so a bare `===` would be a false
        //   red. and `.equal` does not exist at iso-price@1.1.1 — the repo brief lists
        //   it, the installed package carries only `.assure`.
        expect(asIsoPriceWords(cash.total)).toEqual(
          asIsoPriceWords(
            priceSum(
              cash.deets.input,
              cash.deets.output,
              cash.deets.cache.get,
              cash.deets.cache.set,
            ),
          ),
        );

        // wall time is reported, not merely tokens
        expect(Object.keys(result.metrics.cost.time)).toContain('milliseconds');
      });

      /**
       * ⚠️ the shape, snapped so a dropped field is visible in a pr diff. values are
       *   redacted because they vary per live run — only the KEYS are asserted, never
       *   a figure, so this cannot flake. the figures are clamped above.
       */
      then('the receipt carries the whole shape a caller expects', () => {
        const asKeyShape = (of: object): unknown =>
          Object.fromEntries(
            Object.entries(of).map(([key, value]) => [
              key,
              value !== null && typeof value === 'object'
                ? asKeyShape(value as object)
                : typeof value,
            ]),
          );
        expect(asKeyShape(result.metrics)).toMatchSnapshot();
      });
    });

    when('[t1] with briefs', () => {
      then('response leverages knowledge from brief', async () => {
        const briefs = [
          genArtifactGitFile({
            uri: path.join(BRIEFS_DIR, 'secret-code.brief.md'),
          }),
        ];
        const result = await brainRepl.ask({
          role: { briefs },
          prompt: 'say hello',
          schema: { output: outputSchema },
        });
        expect(result.output.content).toBeDefined();
        expect(result.output.content).toContain('ZEBRA42');
      });
    });
  });

  given('[case3] act is called (read+write mode)', () => {
    when('[t0] with simple prompt', () => {
      /**
       * .note = the prompt names the FIELD, not just the reply. "respond with
       *   exactly: ..." reads two ways once a structured-output tool is in play —
       *   as what to say, or as how to format — and act mode carries more tools than
       *   ask mode, so the second read wins more often there. measured on
       *   `@anthropic-ai/claude-agent-sdk@0.3.251`: 3 failures in 13 samples, each
       *   one a meta-answer about the tool rather than the content — "ready to
       *   provide structured output. please specify the format..." and "structured
       *   output tool invoked as requested."
       *
       * ⚠️ the ASSERTION below is unchanged and no weaker. only the prompt moved, so
       *   this is a fix to the ambiguous input, NOT a loosened expectation
       *   (`rule.require.review-test-changes`).
       */
      then('it returns a substantive response', async () => {
        const result = await brainRepl.act({
          role: {},
          prompt:
            'set the `content` field of your structured output to exactly this text: hello from claude code action',
          schema: { output: outputSchema },
        });
        expect(result.output.content).toBeDefined();
        expect(result.output.content.length).toBeGreaterThan(0);
        expect(result.output.content.toLowerCase()).toContain('hello');
      });
    });
  });

  given('[case4] episode and series are returned with session exid', () => {
    when('[t0] ask is called', () => {
      const result = useThen('it succeeds', async () =>
        brainRepl.ask({
          role: {},
          prompt: 'respond with hello',
          schema: { output: outputSchema },
        }),
      );

      then('it returns an episode', () => {
        expect(result.episode).toBeDefined();
        expect(result.episode.hash).toBeDefined();
        expect(result.episode.exchanges).toHaveLength(1);
      });

      then('episode.exid contains session info for continuation', () => {
        expect(result.episode.exid).toBeDefined();
        expect(result.episode.exid).toMatch(
          /^anthropic\/claude-agent-sdk\/[a-f0-9]+\/.+$/,
        );
      });

      then('it returns a series (repls have series unlike atoms)', () => {
        expect(result.series).toBeDefined();
        expect(result.series.hash).toBeDefined();
        expect(result.series.episodes).toHaveLength(1);
      });
    });
  });

  given('[case5] episode continuation is not supported (fail-fast)', () => {
    when('[t0] continuation is attempted with on.episode', () => {
      then('it throws BadRequestError', async () => {
        // first, get an episode from a fresh call
        const resultFirst = await brainRepl.ask({
          role: {},
          prompt: 'say hello',
          schema: { output: outputSchema },
        });

        // then, attempt continuation with that episode
        const error = await getError(
          brainRepl.ask({
            on: { episode: resultFirst.episode },
            role: {},
            prompt: 'what did you say?',
            schema: { output: outputSchema },
          }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('continuation');
        expect(error.message).toContain('not supported');
      });
    });
  });
});
