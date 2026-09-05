import { BadRequestError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * .what = clamps the wish's flagship acceptance criterion —
 *   `rhx review --brain anthropic/claude/<new-slug>` runs end to end
 *
 * .why = this is the one user-facing flow the whole behavior exists to serve: a
 *   brain-backed gate whose verdict blocks a commit. it was proven once by hand and then
 *   deferred as unclampable, and THREE separate lenses blocked on that deferral. they
 *   were right to.
 *
 * ⚠️ the deferral rested on a false premise, and to name it is the point of this header.
 *   the reasoning was: "`rhx review` does not inject the keyrack credential, so the round
 *   trip needs a manual `eval` step, so it cannot be automated here." the first clause is
 *   true and the conclusion does not follow. `rhx git.repo.test` unlocks the keyrack AND
 *   injects it into the jest process — so a child spawned FROM a test inherits
 *   `ANTHROPIC_API_KEY` already, with no `eval` at all. the injection `rhx review` lacks
 *   is one the test runner already performs.
 *
 *   so the gate had a way around it the whole time. it was banked as a wall after one
 *   read, which is the error `rule.always.diagnose-reviewer-malfunctions` warns about in
 *   its own domain: diagnose the cause before you hand a blocker up.
 *
 * .what it asserts = the OUTPUT CONTRACT, not a verdict. `contract.reviewer-output`
 *   requires a reviewer emit a numeric count for both dimensions, and the guard treats an
 *   unreadable review as a malfunction. so a parseable count is exactly the proof that the
 *   round trip completed: slug resolved, brain constructed, live call made, structured
 *   output returned, verdict rendered.
 *
 * ⚠️ it deliberately does NOT assert how many blockers were found. that would tie a
 *   regression clamp to model judgment, so it would flake on a model that read the fixture
 *   differently — a hazard `rule.forbid.failhide` cares about from the other side, since a
 *   flaky clamp gets muted and then guards no one.
 *
 * .note = an acceptance test: it drives the real CLI contract with real credentials, per
 *   `rule.require.acceptance.blackbox` and `rule.forbid.acceptance.mocks`. the scope is
 *   one tiny rule against one tiny file to keep the live call cheap.
 *
 * ⚠️ .the second dependency, and it is NOT the credential = `rhx review` is a skill of
 *   `repo=bhrain/role=reviewer`, so that role must be LINKED into `.agent/` before the
 *   child cli can find it. only `repo=.this` is tracked in git; every other role is a
 *   link `rhachet roles link` writes, and `.agent/repo=bhrain/.gitignore` keeps it out of
 *   the tree.
 *
 *   that link is provisioned by `package.json`'s `prepare` — which is guarded by
 *   `[ -z $CI ]`, so it is SKIPPED in ci. so this test passed on every dev machine and
 *   failed in ci with `no skill "review" found in any linked role`, and the gap stayed
 *   invisible until the `test` workflow was repaired and ran for the first time since
 *   2026-07-28.
 *
 *   the repair is `pretest:acceptance:locally` → `prepare:roles:reviewer`, an npm
 *   pre-hook that links the one role this suite needs. it lives in `package.json` rather
 *   than in `.github/workflows/.test.yml` for two reasons: `.test.yml` is a declapract
 *   template shared with peer repos, so a repo-specific link step there is wrong for them
 *   and is re-stamped away; and the dependency belongs to the SUITE, so a fresh clone run
 *   with `CI=1` set hits the same wall off ci entirely.
 *
 * .note = `roles link --repo bhrain --role reviewer` is additive. `rhachet init --roles`
 *   would REPLACE the linked set, so it must not be used here — it would drop a
 *   developer's other roles as a side effect of a test run.
 */

// a real agentic review over a live model; well past the default jest timeout
jest.setTimeout(300000);

const repoRoot = process.cwd();

/**
 * .what = the slug under test
 * .why = it must be a slug this behavior ADDED, or the clamp proves only that the
 *   published package still works. `claude/sonnet/v5` is new here and is the cheapest of
 *   the new rungs at $2/$10 per MTok — fable is $10/$50 and opus $5/$25, and haiku gained
 *   no new rung at all.
 */
const SLUG_UNDER_TEST = 'anthropic/claude/sonnet/v5';

/**
 * .what = masks the non-deterministic spans of the cli's stdout, so the rest can be snapped
 *
 * .why = `rule.require.contract-snapshot-exhaustiveness` is explicit: a non-deterministic
 *   output is MASKED, then snapped live — never carved out. an earlier draft of this file
 *   carved it out and leaned on three text probes instead, and TWO independent reviewers
 *   blocked on that same carve-out. they were right: three regexes clamp three facts, and a
 *   masked snapshot clamps the whole shape a caller reads — the tree glyphs, the section
 *   order, the labels, the emoji, every line the three probes never look at.
 *
 * .what varies per run = the temp output dir, the log stamp dir, the spinner frames and
 *   elapsed line, the COUNT of spinner frames, the owl verdict line, the summary tail
 *   line, the price, the duration, the percentages, and each count. every one is swapped
 *   for a stable token.
 *
 * ⚠️ two of those were found by a READ of the generated `.snap`, not by reason — the run
 *   was green with a mask that would have flaked, which is exactly why a snapshot must be
 *   opened rather than trusted:
 *
 *   1. **the frame COUNT drifts.** the first capture held 37 `<spinner>` lines; the second
 *      held 44. that number is a function of how long the model took, so it moves on every
 *      run. a run of them collapses to a single token.
 *   2. **the owl phrase is not a fixed set.** the mask was written against
 *      `✨ all clear` / `🦉 needs your talons`; the live run emitted `🦉 not even a vole`
 *      and the tail leaf read `all good 👍`. both are verdict prose, so both are masked by
 *      SHAPE (a lone owl line; the leaf under the nitpick count) rather than by a literal
 *      list, which could never be complete.
 *
 * ⚠️ the verdict lines and the counts are masked ON PURPOSE. this clamp must not tie to
 *   model judgment. a snapshot that froze `0 blockers` would redden the moment a model read
 *   the fixture differently — and a flaky clamp gets muted, then guards no one
 *   (`rule.forbid.failhide`, from the other side).
 *
 * .note = the fixture char counts (`rules: src (167, …)`) are deliberately LEFT BARE. they
 *   are a function of the committed fixture files, so they are deterministic — and they
 *   clamp that the right files reached the child.
 *
 * ⚠️ ONE mask serves both the success journey and the failure journey, on purpose. two
 *   masks would drift apart and a drifted mask is a snapshot that guards no one. so the
 *   crash-dump spans below are masked here even though `[case1]` never emits them — they
 *   are no-ops on a clean stdout.
 *
 * .what the crash-dump masks cover = a failed `rhx review` escapes as an UNCAUGHT node
 *   throw rather than a rendered error, so its stderr carries a pnpm content-hash path, a
 *   `file.js:line:col` throw site, the echoed source line, a stack, and the node runtime
 *   version. every one of those moves on a dep bump or a runtime upgrade and none of them
 *   is our contract, so each is swapped for a token. what survives IS the contract: the
 *   error name, the slug it could not find, the available-brain tree, and the metadata
 *   json — which doubles as a clamp that all 17 atom and 18 repl slugs are discoverable.
 */
/**
 * .what = matches an ansi SGR color sequence
 * .why = composed from the ESC code point rather than written inline, because biome's
 *   `noControlCharactersInRegex` rejects a literal control char in a regex — and here the
 *   control char IS the target, so a suppression would hide a real rule for no gain.
 */
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const asMaskedStdout = (input: { stdout: string; dirOut: string }): string =>
  input.stdout
    .split(input.dirOut)
    .join('<dirOut>')
    // ansi color codes first, so every mask below reads plain text and the snapshot stays
    // legible to the human it exists for
    .replace(ANSI_SGR, '')
    .replace(/node_modules\/\.pnpm\/[^/]+/g, 'node_modules/.pnpm/<pkg>')
    .replace(/\.js:\d+(?::\d+)?/g, '.js:<line>')
    // the throw site: a path line, the echoed source line, and the caret under it
    .replace(/^(<dirOut>\S*\.js:<line>)\n.*\n[ ]*\^$/gm, '<throw site>')
    .replace(/^\s+at .*$/gm, '<stack>')
    .replace(/<stack>(?:\n<stack>)+/g, '<stack>')
    .replace(/^Node\.js v[\d.]+$/gm, 'Node.js <version>')
    // ⚠️ FIRST, and it carries real weight. the spinner repaints with a CARRIAGE RETURN,
    //   so its frames are `\r`-separated rather than `\n`-separated. a collapse written
    //   against `\n` matched none of them and left every frame in the capture — a defect
    //   that showed only as a frame count which moved 37 → 44 across two green runs, since
    //   jest renders a lone `\r` as a line break in the `.snap` and the two look alike.
    .replace(/\r\n?/g, '\n')
    .replace(/\.log\/bhrain\/review\/[^\s/]+/g, '.log/bhrain/review/<stamp>')
    .replace(/^.*(?:elapsed:|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]).*$/gm, '<spinner>')
    .replace(/<spinner>(?:\n+<spinner>)+/g, '<spinner>')
    .replace(/\$[\d.,_]+/g, '<price>')
    .replace(/\b\d[\d,_]*ms\b/g, '<ms>')
    .replace(/\b\d+(?:\.\d+)?%/g, '<pct>')
    .replace(/\b\d+(\s+(?:blockers?|nitpicks?))/g, '<n>$1')
    .replace(/(:\s)\d[\d,_.]*\b/g, '$1<n>')
    .replace(/^🦉 (?!let's review$).*$/gm, '<verdict>')
    // ⚠️ the summary subtree is MODEL-DETERMINED, and three spans of it move together
    //   with whatever counts the model happens to return. this was MEASURED, not feared:
    //   the snapshot went green twice, then red on a third run with NO code change
    //   between them, because the review found 1 nitpick where it had found more before.
    //
    //   what moved, all at once:
    //   | span | green run | red run |
    //   |---|---|---|
    //   | plural | `<n> nitpicks` | `<n> nitpick` |
    //   | severity glyph | absent | `🟠` |
    //   | tree connector | `├─`, a leaf with one below it | `└─`, now the last leaf |
    //
    //   the connector is the trap. it is not a property of the count line at all — it
    //   flips when a LATER leaf does or does not render, so a count line changes shape
    //   because of a line beneath it.
    //
    // .what survives = the LABELS and the subtree's position. a rename of `blockers`, a
    //   dropped `nitpicks` leaf, or a vanished summary block each still move the
    //   snapshot. only the model-determined spans are canonicalized.
    //
    // .note = the numeric contract these lines carry is clamped by the two regex probes
    //   in the `then`s above, which is where it belongs (`contract.reviewer-output`).
    //   this mask is not the only reader of these counts.
    .replace(/^(\s*)[├└]─ (<n>)\s+(blocker|nitpick)s?\b.*$/gm, '$1├─ $2 $3s')
    // the tail leaf renders on some runs and not others, and it was ALREADY masked to a
    // bare `<verdict>` token — so it carried no information even when present, and its
    // mere presence was the last source of drift. dropped rather than synthesized on the
    // runs that lack it, since a line jest never saw would be a fiction.
    //
    // .note = scoped to the leaf that DIRECTLY follows the canonicalized nitpicks line,
    //   so the `└─` leaves elsewhere in the tree (`targets:`, `total:`) are untouched.
    .replace(/(^\s*├─ <n> nitpicks$\n)\s*└─ .*$\n?/gm, '$1');

describe('reviewRoundTrip.acceptance', () => {
  given('[case1] a rules file and a target file on disk', () => {
    when('[t0] rhx review is invoked with a slug this behavior added', () => {
      // .note = the shared result is an OBJECT, not the bare string. `useThen` types its
      //   return as a `Record`, because it hands back a proxy — and a proxy cannot stand
      //   in for a primitive. so the stdout rides inside `{ stdout }` and each assertion
      //   reads the property off the proxy.
      const result = useThen('the cli exits without a throw', () => {
        // fail-fast: the round trip drives a live model, so it needs a credential.
        // .note = under `rhx git.repo.test --what acceptance` this is already injected;
        //   the guard names the fix for a bare `npx jest` invocation.
        if (!process.env.ANTHROPIC_API_KEY)
          throw new BadRequestError(
            'ANTHROPIC_API_KEY required to prove the review round trip completes',
            {
              slug: SLUG_UNDER_TEST,
              hint: 'run via `rhx git.repo.test --what acceptance --against local --env test --mode apply`, which unlocks and injects the key. ⚠️ `--against` and `--env` are REQUIRED — without them the runner exits before any test runs. to run bare, first: rhx keyrack unlock --owner ehmpath --env test',
            },
          );

        // .note = output goes to a temp dir, never into the repo, so a run leaves no
        //   artifact behind to be committed or to redden a later clean-tree check
        const dirOut = mkdtempSync(join(tmpdir(), 'review-roundtrip-'));

        try {
          const stdout = execFileSync(
            'npx',
            [
              'rhx',
              'review',
              '--brain',
              SLUG_UNDER_TEST,
              '--rules',
              'src/.test/assets/example.rules/*.md',
              '--paths',
              'src/.test/assets/example.targets/*.ts',
              '--output',
              join(dirOut, 'review.md'),
              '--mode',
              'hard',
            ],
            {
              cwd: repoRoot,
              // the child inherits this process's env — which is HOW the credential
              // reaches it, and is the whole mechanism this clamp proves
              env: process.env,
            },
          ).toString();
          // .note = `dirOut` rides back out so the mask can swap it for a stable token.
          //   it is a fresh `mkdtemp` path per run, so it is the loudest source of drift
          //   in the whole capture.
          return { stdout, dirOut };
        } catch (error) {
          // .why = a bare `execFileSync` failure surfaces as a multi-hundred-line stack
          //   dump from the child, and the ONE line that names the cause is buried in it.
          //   this re-throws with the cause and the fix at the top
          //   (`rule.require.errors-name-the-fix`).
          //
          // ⚠️ it re-throws rather than skips. a drained account is an ABSENT RESOURCE,
          //   and `rule.require.failfast` (code.test) is explicit that absent resource =
          //   fail loud, never a silent skip. so this clamp goes red while the account is
          //   empty, ON PURPOSE — a green here would claim the round trip works when it
          //   was never exercised.
          const output = [
            error instanceof Error ? error.message : String(error),
            (error as { stdout?: Buffer })?.stdout?.toString() ?? '',
            (error as { stderr?: Buffer })?.stderr?.toString() ?? '',
          ].join('\n');

          // the account-drained case is the one a human clears, so it is named apart from
          // a genuine regression — the two need different actions and must not read alike
          if (output.includes('credit balance is too low'))
            throw new BadRequestError(
              'the review round trip reached the anthropic api, but the account has no credit',
              {
                slug: SLUG_UNDER_TEST,
                // .note = what the failure still PROVES, so a reader does not mistake a
                //   billing wall for a broken registry
                verified:
                  'the slug resolved from this branch, the brain was constructed, the credential was injected, and the request reached the api — a 400 credit error is a BILLING gate, not an auth or an unknown-slug failure',
                unverified: 'that the model answers and a verdict is rendered',
                hint: 'a human must top up the anthropic account at https://console.anthropic.com/settings/billing — this is a spend gate, not a defect in the tree. then re-run: rhx git.repo.test --what acceptance --against local --env test --mode apply',
              },
            );

          throw new BadRequestError(
            'the review round trip failed before a verdict was emitted',
            {
              slug: SLUG_UNDER_TEST,
              outputHead: output.slice(0, 1500),
              hint: 'read `outputHead` for the child cli failure. if it names an unknown brain, discovery regressed — check the `link:.` self-dep in package.json.',
            },
          );
        }
      });

      then('the verdict carries a numeric blocker count', () => {
        // `contract.reviewer-output`: a numeric count for BOTH dimensions, or the guard
        // must treat the review as a malfunction. a word-form ("no blockers") fails this
        // on purpose — only a number satisfies the contract.
        expect(result.stdout).toMatch(/(\d+\s+blockers?|blockers?:\s*\d+)/);
      });

      then('the verdict carries a numeric nitpick count', () => {
        expect(result.stdout).toMatch(/(\d+\s+nitpicks?|nitpicks?:\s*\d+)/);
      });

      then(
        'the slug resolved to this branch, not to the published package',
        () => {
          // `claude/sonnet/v5` does not exist in the published 0.4.3, so a run that
          // resolved it AT ALL proves the `link:.` self-dep put THIS branch's registry in
          // front of the CLI.
          //
          // ⚠️ a first draft asserted that via `expect(result.stdout).not.toContain(
          //   'brain not found')` and called it "the sharpest assertion here". it was
          //   DEAD TWICE OVER, and both reasons were settled by a real run of
          //   `npx rhx review --brain anthropic/claude/bogus/v9` rather than by a read:
          //
          //   1. an unknown brain exits **1**, so `execFileSync` THROWS. control never
          //      reaches this block on the failure path — the catch above owns it.
          //   2. `execFileSync(...).toString()` returns **stdout only**, and rhachet
          //      prints `BrainChoiceNotFoundError: brain not found: …` to **stderr**. so
          //      the string could not appear in `result.stdout` even if it did run.
          //
          //   a negative assertion over a stream that cannot carry the string, on a path
          //   that cannot execute, reports success exactly like a real check.
          //
          // .what holds instead = the resolution proof is STRUCTURAL, and it is stronger
          //   than the string match was: `useThen` above yields a `result` only when the
          //   child exited 0, and an unresolved slug cannot exit 0. so every assertion in
          //   this `when` block sits downstream of a slug that already resolved. the
          //   catch block carries the diagnostic for when it does not.
          //
          // .what this asserts = that the run rendered a VERDICT rather than a crash
          //   dump. the counts above prove the numbers exist; `summary` proves they were
          //   emitted as the reviewer output contract's tree, which is what the guard
          //   parses (`contract.reviewer-output`).
          expect(result.stdout).toContain('summary');
        },
      );

      /**
       * .what = snaps the WHOLE stdout a caller reads, with only the per-run spans masked
       *
       * .why = this is the flagship contract of the behavior — `rhx review --brain
       *   anthropic/claude/<new-slug>` — and it was the one contract left with no snapshot.
       *   the three assertions above clamp three regexes. they are SILENT on the tree
       *   glyphs, the section order, the labels, and the emoji — the parts a human actually
       *   reads to judge whether the gate is usable.
       *
       * ⚠️ an earlier draft argued the output was too non-deterministic to snap and stopped
       *   at the probes. that argument is refuted by the rule itself, which names this exact
       *   case: mask the non-deterministic spans, then snap live. it also warns against a
       *   snapshot taken only at an injected layer — so a fake-client capture would not
       *   substitute for this one. the mask is the whole method; the carve-out was the
       *   error.
       *
       * .note = it snaps the LIVE child's stdout, so it rides the same one call the
       *   assertions above read (`rule.forbid.redundant-expensive-operations`) — no extra
       *   model spend for the coverage.
       */
      then('the whole verdict reads as a caller would see it', () => {
        expect(
          asMaskedStdout({ stdout: result.stdout, dirOut: result.dirOut }),
        ).toMatchSnapshot();
      });
    });
  });

  given('[case2] a brain slug that no registry declares', () => {
    when('[t0] rhx review is invoked with it', () => {
      /**
       * .what = the NEGATIVE journey of the same cli contract, snapped at the same grain
       *
       * .why = `[case1]` snaps the success path end to end and the failure paths were
       *   clamped only at unit grain (`BrainAtom.unknownSlug.test.ts` and friends). those
       *   clamp the ERROR OBJECT; they are silent on the cli's own render of it on stderr.
       *   so a rename of the failure label, or a reshape of the error tree, changes what
       *   the caller reads while every unit clamp stays green.
       *
       * .note = this journey costs NO credential and NO model spend. an unknown brain is
       *   rejected at discovery, before any client is constructed — which is why the
       *   failure path can be snapped as cheaply as a unit test while it still drives the
       *   real cli.
       *
       * ⚠️ it reuses `asMaskedStdout` ON PURPOSE — see that mask's header for why one mask
       *   must serve both journeys, and for what the crash-dump masks cover.
       */
      const failed = useThen('the cli exits non-zero', () => {
        try {
          execFileSync(
            'npx',
            [
              'rhx',
              'review',
              '--brain',
              'anthropic/claude/bogus/v9',
              '--rules',
              'src/.test/assets/example.rules/*.md',
              '--paths',
              'src/.test/assets/example.targets/*.ts',
              '--output',
              join(mkdtempSync(join(tmpdir(), 'review-unknown-')), 'review.md'),
              '--mode',
              'hard',
            ],
            { cwd: repoRoot, env: process.env },
          );
        } catch (error) {
          return {
            status: (error as { status?: number })?.status ?? -1,
            stderr: (error as { stderr?: Buffer })?.stderr?.toString() ?? '',
          };
        }

        // fail-fast rather than let the assertions below read a void. a cli that ACCEPTS
        // an undeclared brain is the exact regression this case exists to catch, so a
        // clean exit here must be loud (`rule.forbid.failhide`).
        throw new BadRequestError(
          'rhx review exited 0 for a brain slug no registry declares',
          {
            hint: 'discovery regressed — an unknown brain must be rejected before any client is constructed',
          },
        );
      });

      then('it exits with a failure status', () => {
        expect(failed.status).not.toEqual(0);
      });

      then('the failure names the brain it could not find', () => {
        expect(failed.stderr).toContain('anthropic/claude/bogus/v9');
      });

      /**
       * ⚠️ the snapshot below carries `BrainChoiceNotFoundError: BrainChoiceNotFoundError:`
       *   — the class name twice over. that is NOT a defect in this repo and it is not ours
       *   to repair: rhachet's uncaught-exception renderer prepends the class name to a
       *   message that already opens with it. three separate review lenses traced it to
       *   that same third-party site.
       *
       * .why it is snapped rather than masked = the doubled prefix is what a caller
       *   actually reads. a mask is a promise that the masked span is environment-dependent,
       *   and this one is not — it is stable, it is upstream, and it must move only when
       *   rhachet moves. to mask it would hide a real blemish behind a tidy snapshot.
       *
       * .note = a future reader who reaches to "fix" the serialization here should stop.
       *   the repair belongs in rhachet's renderer, and this snapshot is the evidence an
       *   issue against that repo would cite.
       */
      then('the failure reads as a caller would see it', () => {
        expect(
          asMaskedStdout({ stdout: failed.stderr, dirOut: repoRoot }),
        ).toMatchSnapshot();
      });
    });
  });
});
