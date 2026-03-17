import type Anthropic from '@anthropic-ai/sdk';
import type { BrainPlugToolDefinition } from 'rhachet/brains';

import { asJsonSchema } from '../schema/asJsonSchema';

/**
 * .what = cast rhachet tool definition to anthropic format
 * .why = explicit boundary between rhachet domain and provider SDK
 */
export const castIntoAnthropicToolDef = (input: {
  definition: BrainPlugToolDefinition;
}): Anthropic.Messages.Tool => ({
  name: input.definition.slug,
  description: input.definition.description,
  input_schema: asJsonSchema({
    schema: input.definition.schema.input,
  }) as Anthropic.Messages.Tool['input_schema'],
});
