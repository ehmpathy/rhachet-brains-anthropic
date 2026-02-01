import { BadRequestError } from 'helpful-errors';
import path from 'path';
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
});
