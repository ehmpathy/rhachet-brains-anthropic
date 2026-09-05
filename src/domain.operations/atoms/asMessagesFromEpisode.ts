import type Anthropic from '@anthropic-ai/sdk';
import { UnexpectedCodePathError } from 'helpful-errors';
import type { BrainEpisode } from 'rhachet';

/**
 * .what = does this payload OPEN a content-block array?
 *
 * .why = it separates the two states a failed parse can mean. a serialized tool turn
 *   always opens `[{` — an array whose first member is a block object. prose that
 *   merely begins with a bracket (`[draft] the surf is up`) does not.
 *
 * .note = it tolerates whitespace between the two, since a re-serialized payload may
 *   be pretty-printed. it deliberately does NOT act as a json validator — the parse
 *   already answered that. this answers only "was json INTENDED here".
 */
const isOpenOfBlockArray = (content: string): boolean =>
  /^\[\s*\{/.test(content);

/**
 * .what = reads one exchange field back into the content shape the api expects
 * .why = an exchange field is ALWAYS a string on the wire, but it may hold either
 *   plain text or a json-serialized content-block array (a tool_use or tool_result
 *   turn). handed back as a bare string, a tool turn would reach the model as the
 *   literal text `[{"type":"tool_use",...}]` rather than as a tool turn.
 *
 * .note = the `[` sniff is a heuristic, so the parse is guarded: a string that
 *   merely STARTS with `[` and is not valid json is plain text, and is returned as
 *   such. only `SyntaxError` is allowlisted — any other throw is re-thrown, so a
 *   real defect cannot hide behind the fallback (`rule.forbid.failhide`).
 *
 * ⚠️ a failed parse used to mean ONE state here, and it means two. the fallback
 *   returned the raw text for both an intentional `[draft]` prose string AND a
 *   TRUNCATED tool turn — so a corrupted tool payload was silently handed to the
 *   model as literal prose, which it then read at face value. a caller who resumed
 *   that episode had no way to tell the two apart, and no error ever surfaced.
 *
 *   the two ARE separable: a tool turn opens `[{`, prose does not. so a parse failure
 *   on a `[{` payload is CORRUPTION and now throws, while prose keeps the fallback.
 */
const asContentFromExchangeField = (
  content: string,
): Anthropic.MessageParam['content'] => {
  if (!content.startsWith('[')) return content;
  try {
    return JSON.parse(content) as Anthropic.MessageParam['content'];
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    // fail-fast: json was intended here, so a parse failure is a corrupt payload
    if (isOpenOfBlockArray(content))
      throw new UnexpectedCodePathError(
        'an episode exchange holds a corrupted tool-turn payload',
        {
          parseError: error.message,
          // .note = the HEAD is the evidence a reader acts on. a raw
          //   `contentLength` sat beside it and was dropped: it is the same
          //   non-actionable character-count shape removed from the `fix:readme`
          //   error family, and the head already shows the payload.
          contentHead: content.slice(0, 200),
          hint: 'the field opens `[{`, so it was serialized as a content-block array and did not survive the round trip — most often truncated in storage. do NOT resume this episode: the prior turn cannot be rebuilt, so start a fresh one rather than let the model read the fragment as prose',
        },
      );

    // otherwise it is prose that merely begins with a bracket, e.g. `[draft] ...`
    return content;
  }
};

/**
 * .what = expands a prior episode into the interleaved user/assistant message pairs
 *   the anthropic messages api takes as conversation history
 * .why = this IS how atom continuation works — `define.episode-continuation-limits`
 *   names it as a distinct step (a messages array of user/assistant pairs), and it
 *   stayed unnamed in the orchestrator, where it read as a `.flatMap` a reader had
 *   to simulate to understand.
 *
 * .note = an absent episode yields `[]`, not a throw. a first turn has no history,
 *   which is the common case, so the caller needs no branch around it.
 *
 * .note = each exchange becomes exactly TWO messages, in order: the user turn then
 *   the assistant turn. the api rejects two consecutive turns of the same role, so
 *   that order is a contract, not a matter of taste.
 */
export const asMessagesFromEpisode = (input: {
  episode: BrainEpisode | undefined;
}): Anthropic.MessageParam[] =>
  input.episode?.exchanges.flatMap((exchange) => [
    {
      role: 'user' as const,
      content: asContentFromExchangeField(exchange.input),
    },
    {
      role: 'assistant' as const,
      content: asContentFromExchangeField(exchange.output),
    },
  ]) ?? [];
