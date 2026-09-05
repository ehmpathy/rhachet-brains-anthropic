import { getError } from 'helpful-errors';
import type { BrainEpisode } from 'rhachet';
import { given, then, useThen, when } from 'test-fns';

import { asMessagesFromEpisode } from './asMessagesFromEpisode';

/**
 * .what = clamps the episode → messages expansion that atom continuation rests on
 * .why = this transform was inline in `genBrainAtom.ask` and therefore reachable only
 *   through a live api call. so its THREE edge shapes were unclamped, and a regression
 *   in any of them would have surfaced as an odd model reply rather than a red test:
 *     - `[case3]` a tool turn that arrives as a json string
 *     - `[case4]` a `[`-prefixed plain string that is NOT json
 *     - `[case5]` a TRUNCATED tool turn, which must be told apart from case4's prose
 *
 * ⚠️ the count is three, not two. this docblock and
 *   `define.episode-continuation-limits.md` both said "two" after case5 landed, so a
 *   reader concluded the truncation guard was uncovered when it is the one this file
 *   is most careful about. both corrected.
 *
 * .note = an exchange field is ALWAYS a string on the wire. that is the whole reason
 *   the parse exists, and the reason a naive pass-through would corrupt tool turns.
 */
const asEpisode = (
  exchanges: { input: string; output: string }[],
): BrainEpisode => ({ exchanges }) as unknown as BrainEpisode;

describe('asMessagesFromEpisode', () => {
  given('[case1] no prior episode', () => {
    when('[t0] the messages are built', () => {
      // .why = a first turn is the common case, so it must need no branch at the
      //   call site. an empty array composes; a throw would not.
      then('it yields an empty array rather than a throw', () => {
        expect(asMessagesFromEpisode({ episode: undefined })).toEqual([]);
      });
    });
  });

  given('[case2] an episode of plain-text turns', () => {
    when('[t0] the messages are built', () => {
      const messages = asMessagesFromEpisode({
        episode: asEpisode([
          { input: 'remember LYCHEE31', output: 'noted' },
          { input: 'what was it?', output: 'LYCHEE31' },
        ]),
      });

      // .why = the api rejects two consecutive turns of the same role, so the
      //   user→assistant order is a contract rather than a matter of taste.
      then('each exchange becomes a user turn then an assistant turn', () => {
        expect(messages.map((message) => message.role)).toEqual([
          'user',
          'assistant',
          'user',
          'assistant',
        ]);
      });

      then('the content is carried through unchanged', () => {
        expect(messages[0]?.content).toEqual('remember LYCHEE31');
        expect(messages[3]?.content).toEqual('LYCHEE31');
      });
    });
  });

  given('[case3] an episode that carries a serialized tool turn', () => {
    when('[t0] the messages are built', () => {
      const blocks = [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'ok' },
      ];
      const messages = asMessagesFromEpisode({
        episode: asEpisode([
          { input: JSON.stringify(blocks), output: 'acknowledged' },
        ]),
      });

      // ⚠️ this is the case a pass-through breaks. handed back as a bare string the
      //   model would read the literal text `[{"type":"tool_result"...}]` rather
      //   than a tool turn, and would answer about the text.
      then('the json is read back into content blocks', () => {
        expect(messages[0]?.content).toEqual(blocks);
      });
    });
  });

  given('[case4] a plain string that merely starts with a bracket', () => {
    when('[t0] the messages are built', () => {
      const messages = asMessagesFromEpisode({
        episode: asEpisode([
          { input: '[draft] please review this', output: 'sure' },
        ]),
      });

      // .why = the `[` sniff is a heuristic, so the parse must survive its own
      //   false positives. only `SyntaxError` is allowlisted, so this returns the
      //   text and lets any other throw escape (`rule.forbid.failhide`).
      then('it stays plain text rather than throw on the failed parse', () => {
        expect(messages[0]?.content).toEqual('[draft] please review this');
      });
    });
  });

  given('[case5] an episode whose tool turn was truncated in storage', () => {
    /**
     * .what = clamps that a CORRUPT tool payload is told apart from case4's prose
     *
     * .why = both reach the same failed `JSON.parse`, and both used to take the same
     *   fallback — the raw text was returned either way. so a truncated tool turn was
     *   handed to the model as literal prose, which it reads at face value, and the
     *   caller who resumed the episode got a confident answer built on a fragment.
     *   no error surfaced (`rule.forbid.failhide`).
     *
     * ⚠️ case4 is what makes this case a real claim rather than a blanket throw. the
     *   two payloads differ by ONE fact — whether a `{` follows the bracket — so the
     *   pair proves the guard discriminates rather than merely fires. neuter
     *   `isOpenOfBlockArray` to return `true` and case4 reddens; return `false` and
     *   this case reddens. no config of that predicate leaves both green.
     */
    const truncated =
      '[{"type":"tool_use","id":"toolu_01","name":"getWaveReport","input":{"spot":"pipel';

    const readTruncated = (): Error =>
      getError(() =>
        asMessagesFromEpisode({
          episode: asEpisode([{ input: truncated, output: 'sure' }]),
        }),
      );

    when('[t0] the messages are built', () => {
      // .note = the capture projects `{ message }` rather than the Error itself.
      //   `useThen` hands back a proxy built by `Object.assign`, which copies only
      //   ENUMERABLE own props — and `Error#message` is non-enumerable, so a capture
      //   of the bare Error would yield `undefined` here. a plain-literal property
      //   survives.
      const failed = useThen('it throws', async () => ({
        message: readTruncated().message,
      }));

      then('it throws rather than pass the fragment off as prose', () => {
        expect(failed.message).toContain('corrupted tool-turn payload');
      });

      // .why = `rule.require.errors-name-the-fix`. a retry is the intuitive move and
      //   it is the WRONG one — the prior turn is gone, so the episode cannot recover.
      then('the error names the fix, and rules out the retry', () => {
        expect(failed.message).toContain('start a fresh one');
      });

      // .why = the fragment IS the evidence. without it a reader cannot tell which
      //   turn was cut, nor how far it got before the truncation.
      then('the payload at fault is carried', () => {
        expect(failed.message).toContain('getWaveReport');
      });

      then('the full message reads as a caller would see it', () => {
        expect(failed.message).toMatchSnapshot();
      });
    });
  });
});
