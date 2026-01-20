import type { BrainHook } from 'rhachet';
import { given, then, when } from 'test-fns';

import {
  translateHookFromClaudeCode,
  translateHookToClaudeCode,
} from './translateHook';

describe('translateHook', () => {
  given('[case1] translateHookToClaudeCode', () => {
    when('[t0] onBoot event', () => {
      then('maps to SessionStart', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo boot',
          timeout: { seconds: 30 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.event).toEqual('SessionStart');
      });
    });

    when('[t1] onTool event', () => {
      then('maps to PreToolUse', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onTool',
          command: 'echo tool',
          timeout: { seconds: 30 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.event).toEqual('PreToolUse');
      });
    });

    when('[t2] onStop event', () => {
      then('maps to Stop', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onStop',
          command: 'echo stop',
          timeout: { seconds: 30 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.event).toEqual('Stop');
      });
    });

    when('[t3] hook with IsoDuration timeout', () => {
      then('converts to seconds', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo test',
          timeout: { seconds: 60 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.hook.timeout).toEqual(60);
      });

      then('handles milliseconds input', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo test',
          timeout: { milliseconds: 5000 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.hook.timeout).toEqual(5);
      });
    });

    when('[t4] hook with filter.what', () => {
      then('sets matcher to filter.what', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onTool',
          command: 'echo bash',
          timeout: { seconds: 30 },
          filter: { what: 'Bash' },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.matcher).toEqual('Bash');
      });
    });

    when('[t5] hook without filter', () => {
      then('sets matcher to *', () => {
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo start',
          timeout: { seconds: 30 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.matcher).toEqual('*');
      });
    });

    when('[t6] hook with author', () => {
      then('sets hook.author', () => {
        const hook: BrainHook = {
          author: 'repo=myrepo/role=myrole',
          event: 'onBoot',
          command: 'echo hello',
          timeout: { seconds: 30 },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result.hook.author).toEqual('repo=myrepo/role=myrole');
      });
    });

    when('[t7] full hook translation', () => {
      then('result matches snapshot', () => {
        const hook: BrainHook = {
          author: 'repo=myapp/role=mechanic',
          event: 'onTool',
          command: 'npx rhachet validate --tool $TOOL_NAME',
          timeout: { seconds: 60 },
          filter: { what: 'Bash' },
        };
        const result = translateHookToClaudeCode({ hook });
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case2] translateHookFromClaudeCode', () => {
    when('[t0] SessionStart event', () => {
      then('maps to onBoot', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo boot',
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.event).toEqual('onBoot');
      });
    });

    when('[t1] PreToolUse event', () => {
      then('maps to onTool', () => {
        const result = translateHookFromClaudeCode({
          event: 'PreToolUse',
          entry: {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'echo bash',
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.event).toEqual('onTool');
      });
    });

    when('[t2] Stop event', () => {
      then('maps to onStop', () => {
        const result = translateHookFromClaudeCode({
          event: 'Stop',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo stop',
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.event).toEqual('onStop');
      });
    });

    when('[t3] timeout in seconds', () => {
      then('converts to IsoDuration', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo test',
                timeout: 60,
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result[0]?.timeout).toEqual({ seconds: 60 });
      });
    });

    when('[t4] no timeout specified', () => {
      then('defaults to { seconds: 30 }', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo test',
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result[0]?.timeout).toEqual({ seconds: 30 });
      });
    });

    when('[t5] matcher with specific tool', () => {
      then('sets filter.what', () => {
        const result = translateHookFromClaudeCode({
          event: 'PreToolUse',
          entry: {
            matcher: 'Write',
            hooks: [
              {
                type: 'command',
                command: 'echo write',
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result[0]?.filter).toEqual({ what: 'Write' });
      });
    });

    when('[t6] matcher is *', () => {
      then('no filter is set', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo start',
                author: 'repo=test/role=mechanic',
              },
            ],
          },
        });
        expect(result[0]?.filter).toBeUndefined();
      });
    });

    when('[t7] hook.author is present', () => {
      then('sets hook.author from each hook', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo test',
                author: 'repo=myrepo/role=myrole',
              },
            ],
          },
        });
        expect(result[0]?.author).toEqual('repo=myrepo/role=myrole');
      });
    });

    when('[t8] no author on hook', () => {
      then('defaults to "unknown"', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo test' }],
          },
        });
        expect(result[0]?.author).toEqual('unknown');
      });
    });

    when('[t9] unknown event', () => {
      then('returns empty array', () => {
        const result = translateHookFromClaudeCode({
          event: 'UnknownEvent',
          entry: {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo test' }],
          },
        });
        expect(result).toEqual([]);
      });
    });

    when('[t10] entry with multiple hooks from different authors', () => {
      then('returns multiple BrainHook objects with correct authors', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo first',
                author: 'repo=app/role=mechanic',
              },
              {
                type: 'command',
                command: 'echo second',
                author: 'repo=app/role=reviewer',
              },
              {
                type: 'command',
                command: 'echo third',
                author: 'repo=other/role=behaver',
              },
            ],
          },
        });
        expect(result).toHaveLength(3);
        expect(result[0]?.command).toEqual('echo first');
        expect(result[0]?.author).toEqual('repo=app/role=mechanic');
        expect(result[1]?.command).toEqual('echo second');
        expect(result[1]?.author).toEqual('repo=app/role=reviewer');
        expect(result[2]?.command).toEqual('echo third');
        expect(result[2]?.author).toEqual('repo=other/role=behaver');
      });

      then('result matches snapshot', () => {
        const result = translateHookFromClaudeCode({
          event: 'SessionStart',
          entry: {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo first',
                timeout: 30,
                author: 'repo=app/role=mechanic',
              },
              {
                type: 'command',
                command: 'echo second',
                timeout: 60,
                author: 'repo=app/role=reviewer',
              },
            ],
          },
        });
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case3] bidirectional round-trip', () => {
    when('[t0] hook is translated to claude code and back', () => {
      then('preserves data', () => {
        const original: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onTool',
          command: 'echo roundtrip',
          timeout: { seconds: 45 },
          filter: { what: 'Bash' },
        };

        const claudeFormat = translateHookToClaudeCode({ hook: original });

        // reconstruct entry for round-trip
        const entry = {
          matcher: claudeFormat.matcher,
          hooks: [claudeFormat.hook],
        };

        const restored = translateHookFromClaudeCode({
          event: claudeFormat.event,
          entry,
        });

        expect(restored).toHaveLength(1);
        expect(restored[0]?.author).toEqual(original.author);
        expect(restored[0]?.event).toEqual(original.event);
        expect(restored[0]?.command).toEqual(original.command);
        expect(restored[0]?.filter).toEqual(original.filter);
        // timeout round-trips via seconds
        expect(restored[0]?.timeout).toEqual({ seconds: 45 });
      });
    });
  });
});
