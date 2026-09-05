import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';
import { z } from 'zod';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';
import { genBrainAtom } from './genBrainAtom';

/**
 * .what = proves every registered atom slug reaches a real model
 * .why = this is the gap that let `0.4.3` ship three slugs whose models had been
 *   retired: the suite exercised only `claude/haiku` and `claude/sonnet`, so 7 of 9
 *   slugs had zero coverage and green CI stayed silent about them. a slug that
 *   type-checks but 404s at runtime is worse than an absent one — the caller finds
 *   out in their own repo.
 *
 * .note = a slug marked `deprecated` is asserted to FAIL on the default client, not
 *   to succeed. that keeps the mark honest: if a vendor ever restores a rung, this
 *   goes red and tells us to drop the mark.
 */
if (!process.env.ANTHROPIC_API_KEY)
  throw new BadRequestError(
    'ANTHROPIC_API_KEY is required for integration tests',
    {
      hint: 'run: rhx keyrack unlock --owner ehmpath --env test',
    },
  );

const outputSchema = z.object({ content: z.string() });

/**
 * .what = the smallest ask that still proves the round trip
 * .why = every rung from 4.6 up thinks by default at `effort: high`, and output is
 *   the expensive side. a trivial prompt keeps the thought budget — and so the cost
 *   of this sweep — near its floor.
 */
const askSmallest = async (slug: (typeof ANTHROPIC_BRAIN_ATOM_SLUGS)[number]) =>
  genBrainAtom({ slug }).ask({
    role: {},
    prompt: 'respond with exactly: ok',
    schema: { output: outputSchema },
  });

const slugsLive = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
  (slug) => !CONFIG_BY_ATOM_SLUG[slug].deprecated,
);
const slugsRetired = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
  (slug) => CONFIG_BY_ATOM_SLUG[slug].deprecated,
);

describe('BrainAtom.slugReach.integration', () => {
  jest.setTimeout(180000);

  given('[case1] every registered slug that is not marked deprecated', () => {
    for (const slug of slugsLive) {
      when(`[t0] ask is called via "${slug}"`, () => {
        then(
          'the model answers, so the slug reaches a live model',
          async () => {
            const result = await askSmallest(slug);
            expect(result.output.content).toBeDefined();
            expect(result.metrics.size.tokens.output).toBeGreaterThan(0);
          },
        );
      });
    }
  });

  given('[case2] every slug marked deprecated', () => {
    for (const slug of slugsRetired) {
      when(`[t0] ask is called via "${slug}" on the default client`, () => {
        /**
         * .why = the mark says this rung is retired first-party and reachable only
         *   via an injected partner client. that claim is documentary until a call
         *   proves it. if this goes green, the rung is live again and the mark lies.
         */
        then(
          'it fails as NOT-FOUND, which is what the mark claims',
          async () => {
            const error = await getError(askSmallest(slug));
            expect(error).toBeInstanceOf(Error);

            // .why = a bare `instanceof Error` would also pass on a bad api key, a
            //   rate limit, or a network blip — so it could go green for reasons
            //   unrelated to the claim, which is the failhide this test exists to
            //   close. narrowed to the vendor's not-found for THIS model id.
            const status = (error as { status?: number }).status;
            expect(status).toEqual(404);
            expect(error.message).toContain(CONFIG_BY_ATOM_SLUG[slug].model);
          },
        );
      });
    }
  });
});
