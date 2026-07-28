import { HelpfulError } from 'helpful-errors';

/**
 * .what = shapes a raw esm-load failure into an actionable HelpfulError
 * .why = a bare node error (ERR_MODULE_NOT_FOUND / ERR_REQUIRE_ESM) gives a
 *        consumer no hint toward the cause. this wrap adds a message + a
 *        branch-accurate hint while it keeps the original error as `cause`, so
 *        the stack (the module-resolution frame that broke) survives the wrap.
 *        pure + exported so the message shape is hermetically testable without a
 *        real import failure.
 * .note = the hint is keyed on which load branch failed. a jest-path require()
 *         failure must NOT advise "the runtime supports a native dynamic
 *         import()" — jest supports require() fine — so the two branches carry
 *         distinct, accurate hints.
 */
export const asEsmLoadHelpfulError = (input: {
  error: unknown;
  specifier: string;
  branch: 'jest' | 'native';
}): HelpfulError => {
  const hintByBranch: Record<'jest' | 'native', string> = {
    native: `ensure ${input.specifier} is installed and the runtime supports a native dynamic import()`,
    jest: `ensure ${input.specifier} is installed and loadable via require() under the test runner`,
  };
  return new HelpfulError(
    `failed to load ${input.specifier} (esm-only) at point of use`,
    {
      // keep the original error as `cause` so its stack survives the wrap
      cause:
        input.error instanceof Error
          ? input.error
          : new Error(String(input.error)),
      reason:
        input.error instanceof Error
          ? input.error.message
          : String(input.error),
      branch: input.branch,
      hint: hintByBranch[input.branch],
    },
  );
};
