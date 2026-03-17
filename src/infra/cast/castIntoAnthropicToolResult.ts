import { HelpfulError } from 'helpful-errors';
import type { BrainPlugToolExecution } from 'rhachet/brains';

/**
 * .what = cast rhachet tool execution to anthropic tool_result block
 * .why = explicit boundary between rhachet domain and provider SDK
 */
export const castIntoAnthropicToolResult = (input: {
  execution: BrainPlugToolExecution;
}): {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
} => {
  const exec = input.execution;

  // serialize content — handle Error objects properly (they don't serialize via JSON.stringify)
  const content = (() => {
    if (exec.signal === 'success') return JSON.stringify(exec.output);

    // error case: serialize error with name + message (Error props aren't enumerable)
    // HelpfulError subclasses (BadRequestError, UnexpectedCodePathError) serialize automatically
    const err = exec.output.error;
    const serialized =
      err instanceof HelpfulError
        ? JSON.parse(JSON.stringify(err)) // triggers toJSON
        : { name: err.name, message: err.message }; // plain Error fallback
    return JSON.stringify({ error: serialized });
  })();

  return {
    type: 'tool_result' as const,
    tool_use_id: exec.exid,
    content,
    is_error: exec.signal !== 'success',
  };
};
