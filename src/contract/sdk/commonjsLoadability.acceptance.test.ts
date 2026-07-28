import { BadRequestError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    },
  ).toString();

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
        };
      });

      then('the registry populates with three atoms', () => {
        expect(registry.atoms).toEqual(3);
      });

      then('the registry populates with four repls', () => {
        // if the sdk were imported eagerly, the require() above would have
        // thrown; a populated registry proves construction is sdk-free
        expect(registry.repls).toEqual(4);
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
      then(
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
            `  console.log(JSON.stringify({ ok: result.output.content.length > 0 }));`,
            `})().catch((error) => { console.error(error); process.exit(1); });`,
          ].join('\n');
          const out = runInCommonjsNode({ snippet });
          const lines = out.trim().split('\n');
          const parsed = JSON.parse(lines[lines.length - 1] ?? '');
          expect(parsed.ok).toBe(true);
        },
      );
    });
  });

  given('[case4] the built package runs a repl act under real commonjs', () => {
    when('[t0] act is called in a child commonjs process', () => {
      then('the esm sdk loads via the native import and act returns', () => {
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
          `  console.log(JSON.stringify({ ok: result.output.content.length > 0 }));`,
          `})().catch((error) => { console.error(error); process.exit(1); });`,
        ].join('\n');
        const out = runInCommonjsNode({ snippet });
        const lines = out.trim().split('\n');
        const parsed = JSON.parse(lines[lines.length - 1] ?? '');
        expect(parsed.ok).toBe(true);
      });
    });
  });
});
