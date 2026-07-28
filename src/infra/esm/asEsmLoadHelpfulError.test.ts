import { HelpfulError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import { asEsmLoadHelpfulError } from './asEsmLoadHelpfulError';

// HelpfulError folds metadata into .message and exposes the wrapped error via
// the standard Error.cause; .cause is read through a typed accessor since the
// es2020 lib target does not include it on the Error type.
const getCause = (error: Error): unknown =>
  (error as Error & { cause?: unknown }).cause;

describe('asEsmLoadHelpfulError', () => {
  given('[case1] a native-branch load failure with a real Error', () => {
    const original = new Error('ERR_REQUIRE_ESM: cannot require esm');

    when('[t0] the error is shaped', () => {
      const wrapped = useThen('it returns a HelpfulError', () => ({
        error: asEsmLoadHelpfulError({
          error: original,
          specifier: '@some/esm-pkg',
          branch: 'native',
        }),
      }));

      then('it is a HelpfulError instance', () => {
        expect(wrapped.error).toBeInstanceOf(HelpfulError);
      });

      then('it names the specifier that failed to load', () => {
        expect(wrapped.error.message).toContain('@some/esm-pkg');
      });

      then('it carries the original error message as reason', () => {
        expect(wrapped.error.message).toContain(
          'ERR_REQUIRE_ESM: cannot require esm',
        );
      });

      then('it keeps the original error as cause (stack survives)', () => {
        expect(getCause(wrapped.error)).toBe(original);
      });

      then('it states the native-branch hint (dynamic import)', () => {
        expect(wrapped.error.message).toContain('native dynamic import()');
      });
    });
  });

  given('[case2] a jest-branch load failure', () => {
    when('[t0] the error is shaped', () => {
      const wrapped = useThen('it returns a HelpfulError', () => ({
        error: asEsmLoadHelpfulError({
          error: new Error('bad export shape'),
          specifier: '@some/esm-pkg',
          branch: 'jest',
        }),
      }));

      then(
        'it states the jest-branch hint (require, not dynamic import)',
        () => {
          expect(wrapped.error.message).toContain('require()');
          expect(wrapped.error.message).not.toContain(
            'native dynamic import()',
          );
        },
      );
    });
  });

  given('[case3] a non-Error thrown value (e.g. a string)', () => {
    when('[t0] the value is shaped', () => {
      const wrapped = useThen('it still returns a HelpfulError', () => ({
        error: asEsmLoadHelpfulError({
          error: 'boom',
          specifier: '@some/esm-pkg',
          branch: 'native',
        }),
      }));

      then('it stringifies the value into reason', () => {
        expect(wrapped.error.message).toContain('boom');
      });

      then('it wraps the value in an Error for cause', () => {
        expect(getCause(wrapped.error)).toBeInstanceOf(Error);
      });
    });
  });
});
