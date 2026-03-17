import { BadRequestError } from 'helpful-errors';
import path from 'path';
import type { BrainPlugToolExecution } from 'rhachet/brains';
import { genBrainPlugToolDeclaration } from 'rhachet/brains';
import { genArtifactGitFile } from 'rhachet-artifact-git';
import { getError, given, then, useThen, when } from 'test-fns';
import { z } from 'zod';

import { TEST_ASSETS_DIR } from '../../.test/assets/dir';
import { genBrainAtom } from './genBrainAtom';

const BRIEFS_DIR = path.join(TEST_ASSETS_DIR, '/example.briefs');
const outputSchema = z.object({ content: z.string() });

if (!process.env.ANTHROPIC_API_KEY)
  throw new BadRequestError(
    'ANTHROPIC_API_KEY is required for integration tests',
  );

describe('genBrainAtom.integration', () => {
  jest.setTimeout(60000);

  // use haiku for fast integration tests
  const brainAtomHaiku = genBrainAtom({ slug: 'claude/haiku' });

  // use sonnet for continuation tests (haiku doesn't support it with structured outputs)
  const brainAtomSonnet = genBrainAtom({ slug: 'claude/sonnet' });

  given('[case1] genBrainAtom({ slug: "claude/haiku" })', () => {
    when('[t0] inspecting the atom', () => {
      then('repo is "anthropic"', () => {
        expect(brainAtomHaiku.repo).toEqual('anthropic');
      });

      then('slug is "claude/haiku"', () => {
        expect(brainAtomHaiku.slug).toEqual('claude/haiku');
      });

      then('description is defined', () => {
        expect(brainAtomHaiku.description).toBeDefined();
        expect(brainAtomHaiku.description.length).toBeGreaterThan(0);
      });
    });
  });

  given('[case2] ask is called with haiku', () => {
    when('[t0] with simple prompt', () => {
      const result = useThen('it succeeds', async () =>
        brainAtomHaiku.ask({
          role: {},
          prompt: 'respond with exactly: hello world',
          schema: { output: outputSchema },
        }),
      );

      then('it returns a substantive response', () => {
        expect(result.output.content).toBeDefined();
        expect(result.output.content.length).toBeGreaterThan(0);
        expect(result.output.content.toLowerCase()).toContain('hello');
      });

      then('it returns metrics with token counts', () => {
        expect(result.metrics).toBeDefined();
        expect(result.metrics.size.tokens.input).toBeGreaterThan(0);
        expect(result.metrics.size.tokens.output).toBeGreaterThan(0);
      });

      then('it returns metrics with cost calculation', () => {
        expect(result.metrics.cost.cash.total).toBeDefined();
        expect(result.metrics.cost.cash.deets.input).toBeDefined();
        expect(result.metrics.cost.cash.deets.output).toBeDefined();
        expect(result.metrics.cost.time).toBeDefined();
      });
    });

    when('[t1] with briefs', () => {
      then('response leverages knowledge from brief', async () => {
        const briefs = [
          genArtifactGitFile({
            uri: path.join(BRIEFS_DIR, 'secret-code.brief.md'),
          }),
        ];
        const result = await brainAtomHaiku.ask({
          role: { briefs },
          prompt: 'say hello',
          schema: { output: outputSchema },
        });
        expect(result.output.content).toBeDefined();
        expect(result.output.content).toContain('ZEBRA42');
      });
    });
  });

  given('[case3] episode continuation with sonnet', () => {
    when('[t0] ask is called with initial prompt', () => {
      const resultFirst = useThen('it succeeds', async () =>
        brainAtomSonnet.ask({
          role: {},
          prompt:
            'remember this secret code: MANGO77. respond with "code received"',
          schema: { output: outputSchema },
        }),
      );

      then('it returns an episode', () => {
        expect(resultFirst.episode).toBeDefined();
        expect(resultFirst.episode.hash).toBeDefined();
        expect(resultFirst.episode.exchanges).toHaveLength(1);
      });

      then('series is null for atoms', () => {
        expect(resultFirst.series).toBeNull();
      });
    });

    when('[t1] ask is called with continuation via on.episode', () => {
      const resultFirst = useThen('first ask succeeds', async () =>
        brainAtomSonnet.ask({
          role: {},
          prompt:
            'remember this secret code: PAPAYA99. respond with "code stored"',
          schema: { output: outputSchema },
        }),
      );

      const resultSecond = useThen('second ask succeeds', async () =>
        brainAtomSonnet.ask({
          on: { episode: resultFirst.episode },
          role: {},
          prompt: 'what was the secret code i told you to remember?',
          schema: { output: outputSchema },
        }),
      );

      then('continuation remembers context from prior exchange', () => {
        expect(resultSecond.output.content).toContain('PAPAYA99');
      });

      then('episode accumulates exchanges', () => {
        expect(resultSecond.episode.exchanges).toHaveLength(2);
      });
    });
  });

  given('[case4] episode continuation with haiku (fail-fast)', () => {
    when('[t0] continuation is attempted with haiku', () => {
      then('it throws BadRequestError', async () => {
        // first, get an episode from a haiku call
        const resultFirst = await brainAtomHaiku.ask({
          role: {},
          prompt: 'say hello',
          schema: { output: outputSchema },
        });

        // then, attempt continuation with the same haiku atom
        const error = await getError(
          brainAtomHaiku.ask({
            on: { episode: resultFirst.episode },
            role: {},
            prompt: 'what did you say?',
            schema: { output: outputSchema },
          }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('haiku');
        expect(error.message).toContain('continuation');
      });
    });
  });

  // =========================================================================
  // tool use tests
  // =========================================================================

  // define calculator tool with genBrainPlugToolDeclaration
  const calculatorTool = genBrainPlugToolDeclaration({
    slug: 'test_calculator',
    name: 'Calculator',
    description:
      'performs arithmetic operations. supports add, subtract, multiply, divide.',
    schema: {
      input: z.object({
        a: z.number().describe('first operand'),
        b: z.number().describe('second operand'),
        op: z
          .enum(['add', 'subtract', 'multiply', 'divide'])
          .describe('operation'),
      }),
      output: z.object({ result: z.number() }),
    },
    execute: async ({ invocation }) => {
      const { a, b, op } = invocation.input;
      switch (op) {
        case 'add':
          return { result: a + b };
        case 'subtract':
          return { result: a - b };
        case 'multiply':
          return { result: a * b };
        case 'divide':
          return { result: a / b };
        default:
          throw new BadRequestError(`unknown operation: ${op}`);
      }
    },
  });

  given('[case5] ask with tools - tool invocation', () => {
    when('[t0] brain needs to use a tool to answer', () => {
      const result = useThen('ask succeeds', async () =>
        brainAtomSonnet.ask({
          role: {},
          prompt: 'use the calculator to compute 47 * 89. call the tool.',
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
        }),
      );

      then('output is null (brain deferred to tools)', () => {
        expect(result.output).toBeNull();
      });

      then('calls.tools is defined with invocations', () => {
        expect(result.calls).toBeDefined();
        expect(result.calls?.tools).toBeDefined();
        expect(result.calls?.tools.length).toBeGreaterThan(0);
      });

      then('invocation has exid, slug, and input', () => {
        const invocation = result.calls?.tools[0];
        expect(invocation?.exid).toBeDefined();
        expect(invocation?.slug).toEqual('test_calculator');
        expect(invocation?.input).toBeDefined();
      });

      then('episode is returned for continuation', () => {
        expect(result.episode).toBeDefined();
        expect(result.episode.exchanges).toHaveLength(1);
      });
    });
  });

  given('[case6] ask with tools - direct answer', () => {
    when('[t0] brain can answer without tools', () => {
      const result = useThen('ask succeeds', async () =>
        brainAtomSonnet.ask({
          role: {},
          prompt: 'say "hello" in the content field. do not use any tools.',
          schema: { output: outputSchema },
          plugs: { tools: [calculatorTool] },
        }),
      );

      then('output is defined', () => {
        expect(result.output).not.toBeNull();
        expect(result.output!.content.toLowerCase()).toContain('hello');
      });

      then('calls is null (no tools requested)', () => {
        expect(result.calls).toBeNull();
      });
    });
  });

  given('[case7] tool result continuation', () => {
    when('[t0] brain uses tool and receives result', () => {
      const resultFirst = useThen('first ask succeeds', async () =>
        brainAtomSonnet.ask({
          role: {},
          prompt: 'use the calculator to multiply 12 by 34.',
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
        }),
      );

      const resultSecond = useThen('continuation succeeds', async () => {
        // execute the tool via genBrainPlugToolDeclaration's execute wrapper
        const invocation = resultFirst.calls?.tools[0];
        if (!invocation) throw new Error('no tool invocation');
        const execution = await calculatorTool.execute({ invocation }, {});

        // continue with tool result
        return brainAtomSonnet.ask({
          on: { episode: resultFirst.episode },
          prompt: [execution],
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
          role: {},
        });
      });

      then('final output is defined', () => {
        expect(resultSecond.output).toBeDefined();
      });

      then('answer is correct (12 * 34 = 408)', () => {
        expect(resultSecond.output!.answer).toEqual(408);
      });

      then('calls is null after completion', () => {
        expect(resultSecond.calls).toBeNull();
      });
    });
  });

  given('[case8] tool execution with success signal', () => {
    when('[t0] tool returns success', () => {
      const resultFinal = useThen('full flow succeeds', async () => {
        // first: brain requests tool
        const result1 = await brainAtomSonnet.ask({
          role: {},
          prompt: 'add 100 and 200 with the calculator.',
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
        });

        // execute tool with success
        const invocation = result1.calls?.tools[0];
        if (!invocation) throw new Error('no tool invocation');
        const execution: BrainPlugToolExecution = {
          exid: invocation.exid,
          slug: invocation.slug,
          input: invocation.input,
          signal: 'success',
          output: { result: 300 },
          metrics: { cost: { time: { milliseconds: 1 } } },
        };

        // continue with result
        return brainAtomSonnet.ask({
          on: { episode: result1.episode },
          prompt: [execution],
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
          role: {},
        });
      });

      then('brain uses the tool output value', () => {
        expect(resultFinal.output!.answer).toEqual(300);
      });
    });
  });

  given('[case9] tool execution with error:constraint signal', () => {
    when('[t0] tool returns constraint error', () => {
      const resultFinal = useThen('flow completes', async () => {
        // first: brain requests tool
        const result1 = await brainAtomSonnet.ask({
          role: {},
          prompt: 'divide 10 by 0 with the calculator.',
          schema: { output: z.object({ explanation: z.string() }) },
          plugs: { tools: [calculatorTool] },
        });

        // execute tool with constraint error
        const invocation = result1.calls?.tools[0];
        if (!invocation) throw new Error('no tool invocation');
        const execution: BrainPlugToolExecution = {
          exid: invocation.exid,
          slug: invocation.slug,
          input: invocation.input,
          signal: 'error:constraint',
          output: { error: new Error('division by zero is not allowed') },
          metrics: { cost: { time: { milliseconds: 1 } } },
        };

        // continue with error
        return brainAtomSonnet.ask({
          on: { episode: result1.episode },
          prompt: [execution],
          schema: { output: z.object({ explanation: z.string() }) },
          plugs: { tools: [calculatorTool] },
          role: {},
        });
      });

      then('brain reasons about the constraint violation', () => {
        expect(resultFinal.output!.explanation.toLowerCase()).toMatch(
          /zero|error|cannot|undefined|invalid/,
        );
      });
    });
  });

  given('[case10] tool execution with error:malfunction signal', () => {
    when('[t0] tool returns malfunction error', () => {
      const resultFinal = useThen('flow completes', async () => {
        // first: brain requests tool
        const result1 = await brainAtomSonnet.ask({
          role: {},
          prompt: 'add 5 and 3 with the calculator.',
          schema: { output: z.object({ explanation: z.string() }) },
          plugs: { tools: [calculatorTool] },
        });

        // execute tool with malfunction error
        const invocation = result1.calls?.tools[0];
        if (!invocation) throw new Error('no tool invocation');
        const execution: BrainPlugToolExecution = {
          exid: invocation.exid,
          slug: invocation.slug,
          input: invocation.input,
          signal: 'error:malfunction',
          output: { error: new Error('calculator service is unavailable') },
          metrics: { cost: { time: { milliseconds: 1 } } },
        };

        // continue with error
        return brainAtomSonnet.ask({
          on: { episode: result1.episode },
          prompt: [execution],
          schema: { output: z.object({ explanation: z.string() }) },
          plugs: { tools: [calculatorTool] },
          role: {},
        });
      });

      then('brain reasons about the failure', () => {
        expect(resultFinal.output!.explanation.toLowerCase()).toMatch(
          /error|fail|unavailable|unable|problem/,
        );
      });
    });
  });

  given('[case11] parallel tool calls', () => {
    when('[t0] brain requests multiple tools at once', () => {
      const result = useThen('ask succeeds', async () =>
        brainAtomSonnet.ask({
          role: {},
          prompt:
            'i need TWO calculations done: add 10+20 AND multiply 5*6. use the calculator tool for both. call both tools in parallel.',
          schema: {
            output: z.object({ sum: z.number(), product: z.number() }),
          },
          plugs: { tools: [calculatorTool] },
        }),
      );

      then('calls.tools contains multiple invocations', () => {
        expect(result.calls?.tools.length).toBeGreaterThanOrEqual(2);
      });

      then('each invocation has unique exid', () => {
        const exids = result.calls?.tools.map((t) => t.exid);
        const uniqueExids = new Set(exids);
        expect(uniqueExids.size).toEqual(exids?.length);
      });
    });
  });

  given('[case12] tools + output schema', () => {
    when('[t0] tool use completes with structured output', () => {
      const resultFinal = useThen('flow completes', async () => {
        // first: brain requests tool
        const result1 = await brainAtomSonnet.ask({
          role: {},
          prompt: 'multiply 7 by 8 with the calculator.',
          schema: {
            output: z.object({
              calculation: z.string(),
              result: z.number(),
              verified: z.boolean(),
            }),
          },
          plugs: { tools: [calculatorTool] },
        });

        // execute tool via genBrainPlugToolDeclaration's execute wrapper
        const invocation = result1.calls?.tools[0];
        if (!invocation) throw new Error('no tool invocation');
        const execution = await calculatorTool.execute({ invocation }, {});

        // continue with result
        return brainAtomSonnet.ask({
          on: { episode: result1.episode },
          prompt: [execution],
          schema: {
            output: z.object({
              calculation: z.string(),
              result: z.number(),
              verified: z.boolean(),
            }),
          },
          plugs: { tools: [calculatorTool] },
          role: {},
        });
      });

      then('output conforms to schema', () => {
        expect(resultFinal.output!.calculation).toBeDefined();
        expect(typeof resultFinal.output!.result).toEqual('number');
        expect(typeof resultFinal.output!.verified).toEqual('boolean');
      });

      then('result is correct', () => {
        expect(resultFinal.output!.result).toEqual(56);
      });
    });
  });

  given('[case13] episode tracked through tool use', () => {
    when('[t0] tool use workflow completes', () => {
      const resultFinal = useThen('flow completes', async () => {
        // first call
        const result1 = await brainAtomSonnet.ask({
          role: {},
          prompt: 'subtract 50 from 100 with the calculator.',
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
        });

        // execute and continue via genBrainPlugToolDeclaration's execute wrapper
        const invocation = result1.calls?.tools[0];
        if (!invocation) throw new Error('no tool invocation');
        const execution = await calculatorTool.execute({ invocation }, {});

        return brainAtomSonnet.ask({
          on: { episode: result1.episode },
          prompt: [execution],
          schema: { output: z.object({ answer: z.number() }) },
          plugs: { tools: [calculatorTool] },
          role: {},
        });
      });

      then('episode.exid is returned', () => {
        expect(resultFinal.episode.exid).toBeDefined();
      });

      then('episode accumulates exchanges', () => {
        expect(resultFinal.episode.exchanges.length).toBeGreaterThanOrEqual(2);
      });

      then('metrics are computed', () => {
        expect(resultFinal.metrics.size.tokens.input).toBeGreaterThan(0);
        expect(resultFinal.metrics.size.tokens.output).toBeGreaterThan(0);
        expect(resultFinal.metrics.cost.cash.total).toBeDefined();
      });
    });
  });
});
