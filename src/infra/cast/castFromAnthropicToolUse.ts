import type Anthropic from '@anthropic-ai/sdk';
import type { BrainPlugToolInvocation } from 'rhachet/brains';

/**
 * .what = cast anthropic tool_use block to rhachet invocation
 * .why = explicit boundary between provider SDK and rhachet domain
 */
export const castFromAnthropicToolUse = (input: {
  block: Anthropic.Messages.ToolUseBlock;
}): BrainPlugToolInvocation => ({
  exid: input.block.id,
  slug: input.block.name,
  input: input.block.input,
});
