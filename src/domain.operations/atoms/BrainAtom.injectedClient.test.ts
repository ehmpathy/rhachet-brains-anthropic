import { given, then, when } from 'test-fns';
import { z } from 'zod';

import {
  ANTHROPIC_BRAIN_ATOM_SLUGS,
  CONFIG_BY_ATOM_SLUG,
} from '../brains/BrainAtom.config';
import { genBrainAtom } from './genBrainAtom';

/**
 * .what = clamps the OTHER half of the deprecation promise — that a retired rung stays
 *   reachable through a client the caller injects
 *
 * .why = the readme states it three times, once per retired rung: *"still served on
 *   Amazon Bedrock and Google Cloud, so it stays reachable via an injected client
 *   (context.anthropic). the default client will not serve you this rung."* that is a
 *   two-part claim, and only ONE part was tested.
 *   `BrainAtom.slugReach.integration.test.ts` proves the default-client half; no test
 *   proved the reach half.
 *
 * .note = the sentence is DERIVED, in `brains/asDeprecatedReason.ts` — the quote above
 *   is a copy for a reader's benefit, so re-read the source if it looks off. its tail
 *   deliberately avoids a bare failure claim, because on the repl ladder the agent-sdk
 *   substitutes rather than refuses; see that function's ⚠️ block.
 *
 * ⚠️ the untested half is the one a caller ACTS on. the failure half tells them what
 *   not to do; the reach half is the migration path we told them exists. so the promise
 *   with real consequences — "keep your Bedrock config, the slug still works" — shipped
 *   as prose with no check behind it, which is exactly why F3 chose to MARK these rungs
 *   rather than delete them.
 *
 * .note = a UNIT test with an injected FAKE client, which is the whole point: the claim
 *   is about our OWN dispatch — that we honor the injected client and send the retired
 *   model id to it, rather than reject the slug ourselves. whether Bedrock serves that
 *   id is the vendor's half and not ours to assert. no credential, no network, no charge.
 */
const outputSchema = z.object({ content: z.string() });

/**
 * .what = a fake partner client that records the model id it was handed
 * .why = the assertion is not merely "it did not throw". it is that the RETIRED model id
 *   reached the injected client intact — a factory that silently substituted a live rung
 *   would satisfy a bare no-throw check while it broke the promise entirely.
 */
const genFakePartnerClient = (): {
  client: unknown;
  asked: { model: string | null };
} => {
  const asked: { model: string | null } = { model: null };
  return {
    asked,
    client: {
      messages: {
        create: async (params: { model: string }) => {
          asked.model = params.model;
          return {
            content: [{ type: 'text', text: '{"content":"ok"}' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        },
      },
    },
  };
};

const slugsRetired = ANTHROPIC_BRAIN_ATOM_SLUGS.filter(
  (slug) => CONFIG_BY_ATOM_SLUG[slug].deprecated,
);

describe('BrainAtom.injectedClient', () => {
  given('[case1] every rung marked deprecated', () => {
    // guards the sweep below from a vacuous pass if the marks are ever dropped
    then('the sweep actually finds retired rungs to check', () => {
      expect(slugsRetired.length).toBeGreaterThan(0);
    });

    for (const slug of slugsRetired) {
      when(`[t0] ask is called via "${slug}" with an injected client`, () => {
        const askViaPartner = async (): Promise<{
          content: string;
          modelAsked: string | null;
        }> => {
          const fake = genFakePartnerClient();
          const result = await genBrainAtom({ slug }).ask(
            {
              role: {},
              prompt: 'respond with exactly: ok',
              schema: { output: outputSchema },
            },
            { anthropic: fake.client } as never,
          );
          return {
            content: result.output.content,
            modelAsked: fake.asked.model,
          };
        };

        // .why = the readme's promise in its plainest form: the call goes through.
        then('the rung answers rather than a rejection', async () => {
          expect((await askViaPartner()).content).toEqual('ok');
        });

        // ⚠️ the sharp one. a factory that quietly redirected a retired slug to its
        //   `replacedBy` rung would pass the assertion above and break the promise —
        //   the caller asked for the rung their partner platform serves, not for our
        //   substitute.
        then('the RETIRED model id is what reaches the client', async () => {
          expect((await askViaPartner()).modelAsked).toEqual(
            CONFIG_BY_ATOM_SLUG[slug].model,
          );
        });
      });
    }
  });
});
