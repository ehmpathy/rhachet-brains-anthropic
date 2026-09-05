/**
 * .what = entrypoint for `npm run fix:readme`
 * .why = regenerates the readme's brain-registry section from the config, so the
 *   docs cannot drift from the shipped slug ladder
 */
import { setReadmeBrainRegistry } from './setReadmeBrainRegistry';

/**
 * .what = runs the regeneration and reports it
 * .why = the write used to run at module-evaluation time, so merely to IMPORT this
 *   module rewrote a file on disk — a side effect no signature announced. the compiled
 *   module ships in `dist/`, so a deep-import from the published package would have
 *   mutated the installed readme.
 */
export const fixReadmeBrainRegistry = (): void => {
  setReadmeBrainRegistry();
  console.log('🐢 readme brain registry regenerated');
};

// .note = runs ONLY when invoked directly (`npm run fix:readme`), never on import
if (require.main === module) fixReadmeBrainRegistry();
