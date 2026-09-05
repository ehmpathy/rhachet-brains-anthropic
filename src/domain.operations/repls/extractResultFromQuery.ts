import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';

import {
  asUsageFromModelUsage,
  type ModelUsageBySdk,
} from './asUsageFromModelUsage';

/**
 * .what = result extracted from claude-agent-sdk query
 * .why = captures output data, usage metrics, and session info from the stream
 */
export interface QueryResult {
  output: unknown;
  sessionId: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheGetTokens: number;
    cacheSetTokens: number;
  };
}

/**
 * .what = parses the sdk's plain-text `result` into the caller's output shape
 * .why = a bare `JSON.parse` here throws a raw `SyntaxError: Unexpected token` that
 *   names no model, no mode, and no fix — the un-diagnosable shape
 *   `rule.require.failloud` grades as a defect.
 *
 * ⚠️ the payload is NOT guaranteed to be json. this branch runs only when the sdk gave
 *   no `structured_output`, which is precisely the case where the model answered in
 *   prose instead of through the tool — a failure this behavior already MEASURED once,
 *   as the ambiguous-prompt `act` case. so the malformed payload is a case that has
 *   actually happened here, not a hypothetical.
 *
 * .why a named transformer = the parse now carries a guard, and a guarded parse inline
 *   in the reader would be decode-friction in an orchestrator
 *   (`rule.forbid.inline-decode-friction`).
 *
 * .note = this is the repl twin of the atom side's `max_tokens` truncation guard. that
 *   one turned a cut-off response into a `BadRequestError` that names slug/model/cap;
 *   this one does the same for a payload that never was json. the twin was left bare
 *   when the atom side was hardened.
 *
 * ⚠️ `BadRequestError`, NOT `UnexpectedCodePathError` — and the two are not
 *   interchangeable, because the class picks the exit code a caller acts on: 2 means
 *   "you fix it", 1 means "the server fixes it" (`rule.require.failloud`). this hint
 *   says *sharpen the prompt*, which is a caller move, so the server-side class
 *   contradicted the very diagnosis it carried. the atom twin
 *   (`asOutputFromTextBlock`) already threw `BadRequestError` for this identical
 *   cause, so the two halves of one failure reported different owners.
 *
 * .note = the OTHER throws in this file stay `UnexpectedCodePathError` on purpose.
 *   a failed subtype, a doubled result, and an absent result are all sdk-side — no
 *   change of prompt fixes them. only THIS one is caller-fixable.
 */
const asOutputFromResultText = (input: {
  result: string;
  model: string;
  mode: 'ask' | 'act';
}): unknown => {
  try {
    return JSON.parse(input.result);
  } catch (error) {
    // .why = the raw text is carried, truncated. the payload IS the evidence — without
    //   it a reader cannot tell prose-instead-of-tool from a cut-off json, and those
    //   have different fixes. it is capped because a repl result can be very long.
    throw new BadRequestError(
      'the claude-agent-sdk returned a result that is not valid json',
      {
        mode: input.mode,
        model: input.model,
        parseError: error instanceof Error ? error.message : String(error),
        // .note = the HEAD is the evidence. a raw `resultLength` sat beside it and
        //   was dropped — the same non-actionable character-count shape removed
        //   from the `fix:readme` error family.
        resultHead: input.result.slice(0, 500),
        hint: 'the sdk gave no `structured_output`, so this fell back to a plain-text parse. the model most likely answered in prose rather than through the output tool — sharpen the prompt, or check that this rung honors structured outputs',
      },
    );
  }
};

/**
 * .what = extracts final result from claude-agent-sdk query async generator
 * .why = query() returns an async iterator, need to consume to get result
 *
 * .note = when outputFormat is used, result may be in structured_output field
 *
 * .note = a MODULE of its own, for the same reason `asUsageFromModelUsage` is one: it
 *   takes the stream as an argument rather than as a closure, so a test drives it with
 *   a fake async generator and no sdk, no credential, no network. that is what lets
 *   the two failure paths below be clamped at all — neither can be summoned on demand
 *   from a live call.
 *
 * .ref = usage extraction pattern per claude-agent-sdk cost tracking docs
 *        https://platform.claude.com/docs/en/agent-sdk/cost-tracking
 *        - result message contains authoritative cumulative usage
 *        - modelUsage provides per-model breakdown suitable for billing
 *        - assistant message accumulation would require deduplication by message.id
 *          (parallel tool uses share same id and report identical usage)
 */
export const extractResultFromQuery = async (input: {
  queryIterator: Query;
  model: string;
  // .why = carried for DIAGNOSIS only, never for control flow. an sdk failure reads
  //   differently under `act` (workspace-write) than under `ask` (read-only), so the
  //   mode is the second thing to check after the rung.
  mode: 'ask' | 'act';
}): Promise<QueryResult> => {
  const { queryIterator } = input;

  // .note = deliberate mutation, scoped to this function; none of it escapes.
  //   these four are ACCUMULATORS over an async iterator: the sdk yields messages one
  //   at a time and the last `result` message carries the answer, so the final value
  //   is knowable only after the stream ends. that is inherently iterative, which is
  //   the exemption `rule.require.immutable-vars` grants for an unavoidable mutation —
  //   provided it is scoped and annotated, which this is.
  //
  // ⚠️ `result` and `structuredOutput` were LAST-WRITE accumulators: a second success
  //   `result` message overwrote the first rather than merged with it, so the caller
  //   would receive the LAST answer with no sign that an earlier one was discarded.
  //   the comment documented that, which made it disclosed but no less silent — a
  //   documented failhide is still a failhide (`rule.forbid.failhide`). `resultSeen`
  //   below turns it into a loud refusal.
  let result: string | undefined;
  let structuredOutput: unknown | undefined;
  let resultSeen = false;
  let sessionId: string | null = null;
  let usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheGetTokens: 0,
    cacheSetTokens: 0,
  };

  for await (const message of queryIterator) {
    // capture sessionId from any message (they all carry it)
    if ('session_id' in message && message.session_id) {
      sessionId = message.session_id as string;
    }

    // check for result message with success subtype
    if (message.type === 'result' && message.subtype === 'success') {
      // fail-fast: a SECOND success result arrived
      //
      // .why = the sdk emits exactly one result per query today, so this cannot fire
      //   against the installed version. that is precisely why it is worth a guard
      //   rather than a comment: an assumption no check enforces is one a future sdk
      //   can break with no signal. the prior shape simply overwrote, so the first
      //   answer left no trace and the caller could not tell one had been discarded
      //   (`rule.forbid.failhide`).
      //
      // .note = a refusal, not a merge. two answers to one question have no defined
      //   combination, so a merge would have to make one up — and to make one up
      //   silently is the same defect in a new shape.
      if (resultSeen)
        throw new UnexpectedCodePathError(
          'the claude-agent-sdk yielded more than one success result for a single query',
          {
            mode: input.mode,
            model: input.model,
            hint: 'this reader assumes exactly one result per query. if a newer @anthropic-ai/claude-agent-sdk streams partial results, teach this reader how to combine them — do NOT simply take the last, which silently discards the first',
          },
        );
      resultSeen = true;

      result = message.result;
      structuredOutput = message.structured_output;

      // total the per-model breakdown, and refuse a total the requested model did not earn
      //
      // .note = the guard lives in `asUsageFromModelUsage` rather than here. it is
      //   pure, so it is unit-clamped without a live query — which is what lets a
      //   test prove the model-swap case, a case a live call cannot summon on demand.
      usage = asUsageFromModelUsage({
        modelUsage: message.modelUsage as ModelUsageBySdk | undefined,
        model: input.model,
      });
    }

    // fail-fast: the sdk reported a non-success result
    //
    // .why = a named error rather than a bare `Error`, because this is the
    //   server-side half of the failure taxonomy — no change of input fixes it, so the
    //   caller needs a diagnosis rather than a correction (`rule.require.failloud`).
    //
    // .note = the metadata is what makes it diagnosable. a bare message named the
    //   subtype and lost the rung, so two reports of "query failed" from different
    //   rungs read identically — and the rung is the first thing to check, since a
    //   model the installed sdk does not know is a live cause here.
    if (message.type === 'result' && message.subtype !== 'success')
      throw new UnexpectedCodePathError('the claude-agent-sdk query failed', {
        mode: input.mode,
        model: input.model,
        subtype: message.subtype,
        errors: message.errors ?? null,
        hint: 'read `subtype` and `errors` for the sdk-side cause. if this rung is new, check that the installed @anthropic-ai/claude-agent-sdk version serves it',
      });
  }

  // prefer structured_output when available (used with outputFormat)
  const output =
    structuredOutput !== undefined
      ? structuredOutput
      : result !== undefined
        ? asOutputFromResultText({
            result,
            model: input.model,
            mode: input.mode,
          })
        : (() => {
            // fail-fast: the stream ended and no result ever arrived
            //
            // .why = the twin of the guard above, and the same class — the sdk owns
            //   this failure, so it is a server-side error with the rung attached.
            //
            // ⚠️ this is the SILENT half. the guard above fires on a result the sdk
            //   marked as failed; this one fires when no result arrived at all, which
            //   reads as a well-formed stream that simply held no answer. without the
            //   metadata, the two are indistinguishable in a log.
            throw new UnexpectedCodePathError(
              'the claude-agent-sdk stream ended with no result message',
              {
                mode: input.mode,
                model: input.model,
                hint: 'the sdk yielded messages but never a `result`. check the sdk version and whether this rung is served by it',
              },
            );
          })();

  return { output, sessionId, usage };
};
