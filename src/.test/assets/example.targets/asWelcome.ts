/**
 * .what = a tiny target file for the review round-trip clamp
 * .why = `rhx review` needs a file to grade. it is kept minimal so the live call the
 *   clamp makes stays cheap — the clamp proves the round trip completes, so this file's
 *   content is immaterial beyond real, parseable typescript.
 */
export const asWelcome = (input: { name: string }): string =>
  `hello, ${input.name}`;
