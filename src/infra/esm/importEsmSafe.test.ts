import { getError, HelpfulError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { importEsmSafe } from './importEsmSafe';

// these run under jest, so `typeof jest !== 'undefined'` is true and the jest
// branch (a plain require of the specifier) is exercised — no native import()
// (which jest's vm sandbox blocks). the specifier is a known commonjs dep, so
// the require resolves from the module cache (no network/db boundary).
describe('importEsmSafe', () => {
  given('[case1] under jest with a resolvable specifier', () => {
    when('[t0] importEsmSafe is called', () => {
      const loaded = useThen('it returns the required module', async () =>
        // 'helpful-errors' is an installed commonjs dep; under jest the jest
        // branch require()s it and returns the transformed module
        importEsmSafe<typeof import('helpful-errors')>({
          specifier: 'helpful-errors',
        }),
      );

      then('it returns the module via require, not a native import', () => {
        expect(loaded.HelpfulError).toBe(HelpfulError);
      });
    });
  });

  given('[case2] under jest with an unresolvable specifier', () => {
    when('[t0] importEsmSafe is called', () => {
      const wrapped = useThen('it rejects with a HelpfulError', async () => ({
        error: await getError(
          importEsmSafe({ specifier: '@some/does-not-exist-pkg' }),
        ),
      }));

      then('it is a HelpfulError', () => {
        expect(wrapped.error).toBeInstanceOf(HelpfulError);
      });

      then('it names the specifier that failed to load', () => {
        expect(wrapped.error.message).toContain('@some/does-not-exist-pkg');
      });

      then('it reports the jest branch (not the native-import hint)', () => {
        expect(wrapped.error.message).not.toContain('native dynamic import()');
      });
    });
  });
});
