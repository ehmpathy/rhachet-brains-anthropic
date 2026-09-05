import { given, then, when } from 'test-fns';

import {
  asQueryOptions,
  TOOLS_ALLOWED_FOR_ACT,
  TOOLS_DISALLOWED_FOR_ASK,
} from './asQueryOptions';

/**
 * .what = clamps that a repl call is ISOLATED from ambient filesystem config
 *
 * .why = `genBrainRepl` omitted `settingSources`, and the sdk documents that omission
 *   as *"all sources are loaded (matches CLI defaults)"* — so every repl call silently
 *   loaded `~/.claude/settings.json`, the caller's project `.claude/settings.json`,
 *   `.claude/settings.local.json`, and `CLAUDE.md`. those sources carry HOOKS.
 *
 * ⚠️ the consequence is measured, not feared. the live integration case asked haiku to
 *   *"respond with exactly: hello from claude code"* and got back a markdown status
 *   report about THIS repo's route stone — our own `SessionStart` hook output, injected
 *   into the agent's context, where it outranked the caller's prompt.
 *
 * ⚠️ and the defect is a CONSUMER's, not merely ours. a package whose `.ask()` inherits
 *   whatever `.claude/` config happens to sit in the caller's cwd gives two different
 *   answers to one call on two machines — and runs hook commands the library author
 *   never declared (`rule.forbid.unexpected-defaults`).
 *
 * .note = a UNIT test, and deliberately so. the sdk `query` sits behind a credential
 *   guard, so an inline options object was reachable only by a live agent run — which
 *   is exactly why this shipped unnoticed. as a pure transformer it is clamped with no
 *   credential, no network, and no charge.
 */
const JSON_SCHEMA = { type: 'object' } as const;

const genOptions = (mode: 'ask' | 'act'): Record<string, unknown> =>
  asQueryOptions({
    systemPrompt: undefined,
    model: 'claude-haiku-4-5-20251001',
    mode,
    jsonSchema: { ...JSON_SCHEMA },
  });

describe('asQueryOptions', () => {
  given('[case1] a repl call in either mode', () => {
    for (const mode of ['ask', 'act'] as const) {
      when(`[t0] options are built for mode "${mode}"`, () => {
        // ⚠️ THE assertion of this file. `[]` is the sdk's isolation mode; `undefined`
        //   is the sdk's load-it-all mode. the two look alike in a diff and behave like
        //   opposites, so an explicit toEqual on the empty array is what catches a later
        //   edit that deletes the member.
        then('filesystem config sources are cut to none', () => {
          expect(genOptions(mode).settingSources).toEqual([]);
        });

        // .why separate = the assertion above passes on `undefined` under a loose
        //   matcher, and `undefined` is the exact defect. this states the ban directly.
        then('the isolation is EXPLICIT, never left to the sdk default', () => {
          expect(genOptions(mode).settingSources).not.toBeUndefined();
        });
      });
    }
  });

  given('[case2] the tool boundary per mode', () => {
    when('[t0] mode is "ask" (readonly)', () => {
      then('the mutators are disallowed', () => {
        expect(genOptions('ask').disallowedTools).toEqual([
          ...TOOLS_DISALLOWED_FOR_ASK,
        ]);
      });

      // ⚠️ council item 16 lives here: `ask` is a BLACKLIST, so it fails OPEN — a tool
      //   the vendor adds later is permitted by default. recorded for the wisher rather
      //   than changed, since a swap to an allowlist would silently revoke WebFetch,
      //   WebSearch and TodoWrite from every extant `ask` caller.
      then('ask grants no allowlist', () => {
        expect(genOptions('ask').allowedTools).toBeUndefined();
      });
    });

    when('[t1] mode is "act" (privileged)', () => {
      then('only the named tools are allowed', () => {
        expect(genOptions('act').allowedTools).toEqual([
          ...TOOLS_ALLOWED_FOR_ACT,
        ]);
      });

      then('act carries no blacklist', () => {
        expect(genOptions('act').disallowedTools).toBeUndefined();
      });
    });
  });

  given('[case3] the structured output contract', () => {
    when('[t0] a schema is supplied', () => {
      then('it rides through as a json_schema output format', () => {
        expect(genOptions('ask').outputFormat).toEqual({
          type: 'json_schema',
          schema: { ...JSON_SCHEMA },
        });
      });
    });
  });
});
