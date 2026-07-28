import { pathToFileURL } from 'node:url';
import { asEsmLoadHelpfulError } from './asEsmLoadHelpfulError';

/**
 * .what = the native dynamic import(), hidden from tsc's downlevel transform
 * .why = tsc (module: commonjs) rewrites a bare import() into a require() shim,
 *        and require() cannot load an esm-only module. new Function hides the
 *        import from that transform, so the emit keeps a native import() — the
 *        only form node can use to load esm from a commonjs module.
 * .note = the `as` cast types new Function's inherently-untyped return; a
 *         runtime-built function has no inferable signature, so the cast is the
 *         only way to attach one. removal path: when this package can emit a
 *         native import() directly (an esm target, or a tsc that no longer
 *         downlevels import() under module: commonjs), drop new Function for a
 *         plain typed dynamic import() and the cast goes with it.
 */
const importEsmNative = new Function(
  'specifier',
  'return import(specifier)',
) as <T>(specifier: string) => Promise<T>;

/**
 * .what = lazily + safely loads an esm-only package from this commonjs package
 * .why = an eager top-level import of an esm-only dep throws when a commonjs
 *        consumer require()s this package, which drops the brain from the
 *        registry. a lazy, native import() at point of use keeps the package
 *        commonjs-loadable and defers the esm evaluation to the first call.
 *        generic infrastructure (a communicator), so it lives in infra/esm and
 *        the branch decision has an injectable seam for isolated unit tests.
 * .note = locates the package relative to THIS module (via require.resolve, not
 *         the process cwd) so a strict-pnpm consumer finds it correctly too.
 * .note = under jest the esm package is transformed to commonjs (jest config
 *         transformIgnorePatterns whitelists it) and jest's vm sandbox blocks a
 *         native import() (it needs --experimental-vm-modules, which breaks jest's
 *         own globals). so under jest a plain require(specifier) serves the
 *         transformed module; only a real commonjs runtime uses the native
 *         import(). jest applies its transform at require-time by resolved path,
 *         so a dynamic require(specifier) is transformed the same as a literal —
 *         the jest branch stays wholly inside this communicator, no caller seam.
 * .note = jest is detected via its injected `jest` global, NOT process.env
 *         JEST_WORKER_ID. an env var leaks into child processes a jest run
 *         spawns (e.g. a commonjs consumer's rhx subprocess), which would then
 *         wrongly take the require path. the `jest` global is scoped to the jest
 *         sandbox and does not cross a process boundary, so a spawned subprocess
 *         correctly uses the native import.
 * .note = the check MUST read the bare `jest` name, NOT globalThis.jest. jest
 *         injects `jest` as a sandbox-scoped variable that `typeof jest` sees,
 *         but it is not placed on globalThis — so a `globalThis.jest` check reads
 *         undefined under jest, wrongly takes the native import path, and hits
 *         ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG (verified empirically). the
 *         bare reference does depend on @types/jest's ambient global at compile
 *         time (guarded by genBrainRepl.jestGlobalCompileGuard.integration.test).
 */
export const importEsmSafe = async <T>(input: {
  specifier: string;
}): Promise<T> => {
  const underJest = typeof jest !== 'undefined';
  try {
    // under jest a plain require serves the transformed module (jest's vm
    // sandbox blocks the native import — see .note); jest transforms the esm
    // package to commonjs at require-time regardless of a literal-vs-variable
    // specifier
    if (underJest) return require(input.specifier) as T;

    // a real commonjs runtime loads the esm package via the native import
    return await importEsmNative<T>(
      pathToFileURL(require.resolve(input.specifier)).href,
    );
  } catch (error) {
    // surface a loud, actionable, branch-accurate error at point of use — never
    // swallow. asEsmLoadHelpfulError shapes the raw node error (its shape is
    // hermetically unit-tested).
    throw asEsmLoadHelpfulError({
      error,
      specifier: input.specifier,
      branch: underJest ? 'jest' : 'native',
    });
  }
};
