/**
 * .what = the fix a caller reads when no anthropic credential reaches the process
 *
 * .why SHARED, rather than a literal in each factory. the atom and the repl carried
 *   this string BYTE-IDENTICALLY, in two files, with no source in common. three
 *   snapshot tests covered it — and each one proved only that a file agreed with
 *   itself, so an edit to one copy would drift from the other with every test green.
 *
 * ⚠️ that is not a hypothetical here. the credential guard itself shipped on the atom
 *   and was missed on the repl, and only a later peer round caught it. the twin-drift
 *   defect class has already bitten this codebase, so the second copy is the hazard
 *   rather than a style nit (`rule.prefer.most-common-denominator`).
 *
 * .note = the text carries a correction that is easy to lose in a re-edit: an unlock
 *   alone does NOT reach the call. `rhx keyrack unlock` fills a vault; only a runner
 *   that injects the value into the child env bridges the two. a caller told merely to
 *   "unlock" will unlock, retry, and fail again — so the `eval` and the runner are the
 *   actionable half (`rule.require.errors-name-the-fix`).
 */
export const HINT_CREDENTIAL_ABSENT =
  'a keyrack unlock alone does NOT reach this call: it fills a vault, not this process env. run `eval "$(rhx keyrack source --key ANTHROPIC_API_KEY --env test --owner ehmpath)"` first, or use a runner that injects it (e.g. `rhx git.repo.test`)';
