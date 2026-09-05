import { BadRequestError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANTHROPIC_BRAIN_ATOM_SLUGS } from '../../domain.operations/brains/BrainAtom.config';
import { ANTHROPIC_BRAIN_REPL_SLUGS } from '../../domain.operations/brains/BrainRepl.config';
import { getBrainAtomsByAnthropic, getBrainReplsByAnthropic } from './index';

/**
 * .what = proves the built package stays loadable by a commonjs consumer
 * .why = the esm-only @anthropic-ai/claude-agent-sdk was eager-imported at
 *        module load, so a commonjs require() of the built package threw and the
 *        brain dropped out of the registry. these tests exercise the BUILT dist
 *        via a real commonjs require() in a child node process (jest transforms
 *        cannot mask the crash), and inspect the emitted repl module to guard the
 *        downlevel trap (tsc rewriting import() into a require() shim).
 *
 * .note = requires `npm run build` to have run first; the test:acceptance command
 *         builds before jest.
 */
const repoRoot = process.cwd();
const distEntry = join(repoRoot, 'dist', 'index.js');
const builtReplPath = join(
  repoRoot,
  'dist',
  'domain.operations',
  'repls',
  'genBrainRepl.js',
);
// the native import() lives in the extracted esm loader (infra/esm)
const builtLoaderPath = join(
  repoRoot,
  'dist',
  'infra',
  'esm',
  'importEsmSafe.js',
);

// the child ask/act proof drives a full agentic query, which can exceed the
// default jest timeout; give the built-package runtime proof headroom
jest.setTimeout(120000);

/**
 * .what = runs a snippet in a fresh child node process as strict commonjs
 * .why = a child process is a faithful commonjs require(), free of jest's module
 *        transforms, so it reproduces the real consumer load path
 * .note = --no-experimental-require-module disables node's require(esm) leniency,
 *         so a require() of the esm-only sdk throws — the exact failure a commonjs
 *         consumer hits. this makes the eager-import regression bite regardless of
 *         the node version's require(esm) default. import() is unaffected by the
 *         flag, so the lazy native import path still loads the sdk.
 * .note = the child inherits this jest parent's env — JEST_WORKER_ID included.
 *         that is deliberate: it mirrors a real consumer whose rhx subprocess is
 *         spawned under jest and inherits the same var. the loader detects jest
 *         via the `jest` global (not the env var), which does not cross the
 *         process boundary, so the child correctly takes the native import path
 *         despite the leaked JEST_WORKER_ID — which proves the leak cannot break
 *         a commonjs consumer.
 * .note = cwd defaults to repoRoot but is overridable, so a test can prove the
 *         built package loads from a foreign cwd (module-anchored resolution,
 *         not process.cwd()-anchored).
 */
const runInCommonjsNode = (input: { snippet: string; cwd?: string }): string =>
  execFileSync(
    'node',
    ['--no-experimental-require-module', '-e', input.snippet],
    {
      cwd: input.cwd ?? repoRoot,
      // .why = the ask/act cases below hand the WHOLE result back over stdout so its
      //   shape can be snapped. an agentic `act` transcript can run past node's 1MB
      //   default, and that overflow would surface as an opaque ENOBUFS rather than
      //   as a test failure — a flake with a misleading cause.
      maxBuffer: 32 * 1024 * 1024,
    },
  ).toString();

/**
 * .what = the KEY SHAPE of a value — every leaf replaced by its `typeof`, every array
 *   collapsed to one shaped element, every object's keys sorted
 *
 * .why = the ask/act cases below asserted `result.output.content.length > 0` and no more
 *   than that. it is true of a great many results, so a build that RENAMED, DROPPED, or
 *   RETYPED a field elsewhere in the receipt — `metrics.size.tokens`, `metrics.cost.cash`,
 *   `episode.exid` — stayed green with no reviewable diff. the shape closes that gap.
 *
 * ⚠️ every value is redacted to its type ON PURPOSE. token counts, cash, session ids and
 *   model prose all vary per call, so a snapshot of the VALUES could never be stable —
 *   and an unstable snapshot gets `--resnap`-ed until it says little. the type of each
 *   field is the part that must not move, and it is the part a build transform breaks.
 *
 * .note = arrays collapse to a single shaped element rather than to `n` of them, so the
 *   snapshot does not move when a model happens to take one more turn.
 */
const asShapeOfValue = (value: unknown): unknown => {
  if (value === null) return 'null';
  if (Array.isArray(value))
    return value.length === 0 ? [] : [asShapeOfValue(value[0])];
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          asShapeOfValue((value as Record<string, unknown>)[key]),
        ]),
    );
  return typeof value;
};

describe('commonjsLoadability.acceptance', () => {
  given('[case1] the built package under a real commonjs require()', () => {
    when('[t0] a commonjs consumer requires the built entry', () => {
      then('the load completes without a throw', () => {
        const stdout = runInCommonjsNode({
          snippet: `require(${JSON.stringify(distEntry)}); console.log('loaded ok');`,
        });
        expect(stdout).toContain('loaded ok');
      });

      then('the required built loader emit retains a native import()', () => {
        // verify a property of the required contract artifact (internals in a
        // then, per acceptance.blackbox): the emitted loader keeps a native
        // import() — the new Function hides it from tsc's module:commonjs
        // downlevel, so the emit is NOT a require() shim. this is WHY the
        // require() action above loads under a real commonjs consumer.
        const content = readFileSync(builtLoaderPath, 'utf-8');
        expect(content).toContain('import(');
      });

      then(
        'the required built repl emit does not eager-require the sdk',
        () => {
          // the original bug: a top-level static import downlevels (module:
          // commonjs) to `const x = require("@anthropic-ai/claude-agent-sdk")` at
          // module scope, which throws ERR_REQUIRE_ESM on the require() above. the
          // lazy load now lives in importEsmSafe, so the repl emit holds no sdk
          // require at all. verify the eager const-assignment shape is absent from
          // the required artifact.
          const content = readFileSync(builtReplPath, 'utf-8');
          expect(content).not.toMatch(
            /=\s*require\(['"]@anthropic-ai\/claude-agent-sdk['"]\)/,
          );
        },
      );
    });

    when('[t2] a consumer requires the built entry from a foreign cwd', () => {
      then('the load completes regardless of process.cwd()', () => {
        // spawn from a dir that is NOT the package root, so process.cwd()
        // differs from the module location. a successful load proves the
        // package (and its downstream sdk lookup) anchors to the module, not
        // to the consumer's cwd.
        const stdout = runInCommonjsNode({
          snippet: `require(${JSON.stringify(distEntry)}); console.log('loaded ok');`,
          cwd: tmpdir(),
        });
        expect(stdout).toContain('loaded ok');
      });
    });

    when('[t1] the registry factories are called after require()', () => {
      const registry = useThen('the factories return without a throw', () => {
        const snippet = [
          `const brains = require(${JSON.stringify(distEntry)});`,
          `const atoms = brains.getBrainAtomsByAnthropic();`,
          `const repls = brains.getBrainReplsByAnthropic();`,
          `console.log(JSON.stringify({`,
          `  atoms: atoms.length,`,
          `  repls: repls.length,`,
          `  atomSlugs: atoms.map((a) => a.slug).sort(),`,
          `  replSlugs: repls.map((r) => r.slug).sort(),`,
          // .why = the description is a first-class field of rhachet's BrainAtom and
          //   the ONLY surface a deprecation crosses on, yet it was read back from
          //   `dist` nowhere. see the assertion below for why that gap matters here
          //   specifically.
          `  atomDescriptions: Object.fromEntries(atoms.map((a) => [a.slug, a.description])),`,
          `  replDescriptions: Object.fromEntries(repls.map((r) => [r.slug, r.description])),`,
          `}));`,
        ].join('');
        const out = runInCommonjsNode({ snippet });
        const lines = out.trim().split('\n');
        const parsed = JSON.parse(lines[lines.length - 1] ?? '');
        return {
          atoms: Number(parsed.atoms),
          repls: Number(parsed.repls),
          atomSlugs: parsed.atomSlugs as string[],
          replSlugs: parsed.replSlugs as string[],
          atomDescriptions: parsed.atomDescriptions as Record<string, string>,
          replDescriptions: parsed.replDescriptions as Record<string, string>,
        };
      });

      /**
       * ⚠️ READ BEFORE YOU EDIT EITHER OF THE NEXT TWO BLOCKS.
       *
       * both assert non-empty, NOT an exact count, and on their own that is close to
       * vacuous — one brain out of 17 satisfies `toBeGreaterThan(0)`. they are not
       * independent coverage of the ladder. what they actually claim is narrow and
       * worth a block of its own: that the `require()` above returned a registry AT
       * ALL, so the sdk is not imported eagerly.
       *
       * the ladder is bounded by `the built registry matches the declared ladder
       * exactly` below, which asserts exact slug-set equality against the declared
       * arrays — tighter than any hardcoded count, and it cannot go stale, whereas a
       * hardcoded count here would be a THIRD copy of the ladder to hold in sync.
       *
       * so: if you ever delete or weaken that derived assertion, these two do NOT hold
       * the line behind it. restore an exact count here in the same edit, or the ladder
       * loses its floor with no test to say so.
       */
      then('the registry populates with atoms', () => {
        expect(registry.atoms).toBeGreaterThan(0);
      });

      then('the registry populates with repls', () => {
        // if the sdk were imported eagerly, the require() above would have
        // thrown; a populated registry proves construction is sdk-free
        expect(registry.repls).toBeGreaterThan(0);
      });

      /**
       * .what = the BUILT dist registers exactly the declared ladder, no more, no less
       *
       * .why = `index.test.ts` makes this same claim, but against the SOURCE, in
       *   process. this one makes it against the emitted `dist/` under a real
       *   commonjs `require()`. a build that dropped or mangled a brain would pass
       *   there and fail here — that divergence is the whole reason this file exists.
       *
       * ⚠️ .why not leave it to the snapshot below = a snapshot is `--resnap`-able. a
       *   drop plus a regenerated snapshot leaves only `toBeGreaterThan(0)` in force,
       *   which 1 brain out of 17 would satisfy. this assertion cannot be regenerated
       *   away — it derives from the declared slug lists, so it holds the floor the
       *   snapshot cannot.
       *
       * .note = the child process sorts, so the expectation sorts too.
       */
      then('the built registry matches the declared ladder exactly', () => {
        expect(registry.atomSlugs).toEqual(
          [...ANTHROPIC_BRAIN_ATOM_SLUGS].sort(),
        );
        expect(registry.replSlugs).toEqual(
          [...ANTHROPIC_BRAIN_REPL_SLUGS].sort(),
        );
      });

      /**
       * .what = the descriptions the BUILT package hands a consumer are byte-identical
       *   to the ones the source produces
       *
       * .why = `description` is what rhachet documents as the field that "helps
       *   developers understand what this atom is best suited for", and it is the one
       *   surface a deprecation crosses on. it was read back from `dist` nowhere — this
       *   file captured slugs alone — so a build that mangled it would ship green.
       *
       * ⚠️ that is NOT a hypothetical here, and this file is the proof. it exists
       *   because tsc's commonjs downlevel silently rewrote `import()` into a require
       *   shim — a build-time transform that changed emitted semantics with no error.
       *   the repl description is now an interpolated template literal
       *   (`claude code on ${config.model} - …`), which is exactly the shape a
       *   downlevel touches. same file, same risk class, one field over.
       *
       * ⚠️ .why an EQUALITY against source, and not a second snapshot: `index.test.ts`
       *   already snapshots these strings for the pr vibecheck, so a snapshot here
       *   would be a second copy to keep in sync — and both would be `--resnap`-able
       *   together. an equality states the property that actually matters (the build is
       *   lossless) and cannot be regenerated away.
       *
       * .note = a `then` that reads internals is legal in an acceptance test — the
       *   ACTION went through the built contract; only the verification reads source
       *   (`rule.require.acceptance.blackbox`).
       */
      then('the built descriptions equal the source descriptions', () => {
        expect(registry.atomDescriptions).toEqual(
          Object.fromEntries(
            getBrainAtomsByAnthropic().map((atom) => [
              atom.slug,
              atom.description,
            ]),
          ),
        );
        expect(registry.replDescriptions).toEqual(
          Object.fromEntries(
            getBrainReplsByAnthropic().map((repl) => [
              repl.slug,
              repl.description,
            ]),
          ),
        );
      });

      then('the registered brain slugs match the contract snapshot', () => {
        // snapshot the registry SHAPE (the sorted brain slugs) the built package
        // exposes to a commonjs consumer, so a drift — a dropped, renamed, or
        // added brain — surfaces as a visible diff in a pr, not a silent change
        expect({
          atomSlugs: registry.atomSlugs,
          replSlugs: registry.replSlugs,
        }).toMatchSnapshot();
      });
    });
  });

  given('[case3] the built package runs a repl ask under real commonjs', () => {
    when('[t0] ask is called in a child commonjs process', () => {
      /**
       * ⚠️ ONE child call feeds BOTH assertions below, via `useThen`. this journey
       *   drives a live model, so a second call would double the spend for a claim the
       *   first call already carries (`rule.forbid.redundant-expensive-operations`) —
       *   and the shape snapshot rides along at zero marginal cost.
       */
      const asked = useThen(
        'the esm sdk loads via the native import and the query returns',
        () => {
          // fail-fast: this dynamic proof drives a real ask against the live sdk,
          // so it needs an anthropic credential (acceptance uses real creds)
          if (!process.env.ANTHROPIC_API_KEY)
            throw new BadRequestError(
              'ANTHROPIC_API_KEY required to prove the native lazy import loads the sdk at runtime',
              { hint: 'run: rhx keyrack unlock --owner ehmpath --env test' },
            );

          // in a real commonjs child (JEST_WORKER_ID unset) ask() drives the
          // NATIVE importEsm path — the exact prod load path. had the emit
          // downleveled import() to a require() shim, this throws ERR_REQUIRE_ESM
          // at the load, so a returned result proves the lazy native import
          // loads the esm sdk at point of use under a real commonjs consumer.
          const snippet = [
            `const { genBrainRepl } = require(${JSON.stringify(distEntry)});`,
            `const { z } = require('zod');`,
            `(async () => {`,
            `  const repl = genBrainRepl({ slug: 'claude/code/haiku' });`,
            `  const result = await repl.ask({`,
            `    role: {},`,
            `    prompt: 'respond with exactly: hello from commonjs',`,
            `    schema: { output: z.object({ content: z.string() }) },`,
            `  });`,
            // .why the WHOLE result crosses = the parent shapes it. the child cannot
            //   import the shape transformer, so a shape computed here would be a
            //   second copy of it — and a copy is what drifts.
            `  console.log(JSON.stringify({ ok: result.output.content.length > 0, result }));`,
            `})().catch((error) => { console.error(error); process.exit(1); });`,
          ].join('\n');
          const out = runInCommonjsNode({ snippet });
          const lines = out.trim().split('\n');
          const parsed = JSON.parse(lines[lines.length - 1] ?? '');
          return {
            ok: parsed.ok as boolean,
            shape: asShapeOfValue(parsed.result),
          };
        },
      );

      then('the query returns output the caller can read', () => {
        expect(asked.ok).toBe(true);
      });

      /**
       * .what = the receipt SHAPE the BUILT package hands a commonjs consumer
       *
       * .why = the assertion above reads one field. a build that renamed
       *   `metrics.cost.cash`, dropped `episode`, or retyped a token count to a string
       *   would leave it green — and this file exists BECAUSE a build transform once
       *   changed emitted semantics with no error. the shape is where such a change
       *   surfaces as a pr diff.
       *
       * .note = values are redacted to their types; see `asShapeOfValue` for why a
       *   value snapshot could not be stable here.
       */
      then('the receipt shape matches the contract snapshot', () => {
        expect(asked.shape).toMatchSnapshot();
      });
    });
  });

  given('[case4] the built package runs a repl act under real commonjs', () => {
    when('[t0] act is called in a child commonjs process', () => {
      // ⚠️ one child call, two assertions — the same `useThen` reason as [case3]. act
      //   drives a full agentic loop, so it is the more expensive of the two journeys.
      const acted = useThen(
        'the esm sdk loads via the native import and act returns',
        () => {
          // fail-fast: act drives a real agentic loop against the live sdk
          if (!process.env.ANTHROPIC_API_KEY)
            throw new BadRequestError(
              'ANTHROPIC_API_KEY required to prove the native lazy import loads the sdk for act too',
              { hint: 'run: rhx keyrack unlock --owner ehmpath --env test' },
            );

          // act shares the identical getOneClaudeAgentSdk() call as ask, but
          // ask is only proven above; drive act through the SAME native
          // importEsm path in a real commonjs child to prove acceptance #6
          // ("brains still ask/act correctly") for act, not just ask.
          const snippet = [
            `const { genBrainRepl } = require(${JSON.stringify(distEntry)});`,
            `const { z } = require('zod');`,
            `(async () => {`,
            `  const repl = genBrainRepl({ slug: 'claude/code/haiku' });`,
            `  const result = await repl.act({`,
            `    role: {},`,
            `    prompt: 'respond with exactly: hello from commonjs act',`,
            `    schema: { output: z.object({ content: z.string() }) },`,
            `  });`,
            `  console.log(JSON.stringify({ ok: result.output.content.length > 0, result }));`,
            `})().catch((error) => { console.error(error); process.exit(1); });`,
          ].join('\n');
          const out = runInCommonjsNode({ snippet });
          const lines = out.trim().split('\n');
          const parsed = JSON.parse(lines[lines.length - 1] ?? '');
          return {
            ok: parsed.ok as boolean,
            shape: asShapeOfValue(parsed.result),
          };
        },
      );

      then('act returns output the caller can read', () => {
        expect(acted.ok).toBe(true);
      });

      /**
       * .what = the act receipt SHAPE, snapped SEPARATELY from ask's
       *
       * ⚠️ the two snapshots came out BYTE-IDENTICAL, and that is the point — not a
       *   redundancy. `act` runs a tool loop and `ask` does not, so a reader would
       *   expect the act receipt to carry a trail of what it did. it does not:
       *   `genBrainRepl` returns a hardcoded `calls: null` on both paths, which the
       *   snapshot renders as `"calls": "null"`. so a repl NEVER hands its tool trail
       *   to a caller, and the identity of these two blocks is the proof.
       *
       * .why still snapped separately = the identity is a present fact, not a
       *   guarantee. the day `act` gains a field `ask` lacks, two snapshots show it as
       *   a one-sided diff; one shared snapshot would have had to be resnapped, and the
       *   asymmetry would read as ordinary churn.
       */
      then('the act receipt shape matches the contract snapshot', () => {
        expect(acted.shape).toMatchSnapshot();
      });
    });
  });
});
