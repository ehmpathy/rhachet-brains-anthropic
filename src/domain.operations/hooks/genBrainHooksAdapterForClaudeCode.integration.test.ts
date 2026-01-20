import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { BrainHook } from 'rhachet';
import { given, then, when } from 'test-fns';

import { genBrainHooksAdapterForClaudeCode } from './genBrainHooksAdapterForClaudeCode';

describe('genBrainHooksAdapterForClaudeCode.integration', () => {
  given('[case1] empty repo (no .claude/settings.json)', () => {
    let repoPath: string;

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case1`,
      );
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] dao.get.all is called', () => {
      then('returns empty array', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all();
        expect(hooks).toEqual([]);
      });
    });

    when('[t1] dao.set.upsert is called', () => {
      then('creates .claude/settings.json', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo hello',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook });

        const settingsPath = path.join(repoPath, '.claude', 'settings.json');
        const stat = await fs.stat(settingsPath);
        expect(stat.isFile()).toBe(true);
      });

      then('hook is found in dao.get.all', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo hello',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
        expect(hooks[0]?.command).toEqual('echo hello');
      });
    });
  });

  given('[case2] repo with hooks', () => {
    let repoPath: string;
    const hookA: BrainHook = {
      author: 'repo=test/role=mechanic',
      event: 'onBoot',
      command: 'echo boot',
      timeout: { seconds: 30 },
    };
    const hookB: BrainHook = {
      author: 'repo=test/role=reviewer',
      event: 'onTool',
      command: 'echo tool',
      timeout: { seconds: 60 },
      filter: { what: 'Bash' },
    };
    const hookC: BrainHook = {
      author: 'repo=test/role=mechanic',
      event: 'onStop',
      command: 'echo stop',
      timeout: { seconds: 30 },
    };

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case2`,
      );
      await fs.mkdir(repoPath, { recursive: true });

      const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
      await adapter.dao.set.upsert({ hook: hookA });
      await adapter.dao.set.upsert({ hook: hookB });
      await adapter.dao.set.upsert({ hook: hookC });
    });

    when('[t0] dao.get.all is called', () => {
      then('returns all hooks', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(3);
      });
    });

    when('[t1] dao.get.all with { by: { author } } filter', () => {
      then('returns only hooks with that author', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all({
          by: { author: 'repo=test/role=mechanic' },
        });
        expect(hooks).toHaveLength(2);
        expect(hooks.every((h) => h.author === 'repo=test/role=mechanic')).toBe(
          true,
        );
      });
    });

    when('[t2] dao.get.all with { by: { event } } filter', () => {
      then('returns only hooks with that event', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all({
          by: { event: 'onBoot' },
        });
        expect(hooks).toHaveLength(1);
        expect(hooks[0]?.event).toEqual('onBoot');
      });
    });

    when('[t3] dao.get.all with { by: { command } } filter', () => {
      then('returns only hooks with that command', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all({
          by: { command: 'echo tool' },
        });
        expect(hooks).toHaveLength(1);
        expect(hooks[0]?.command).toEqual('echo tool');
      });
    });
  });

  given('[case3] dao.get.one', () => {
    let repoPath: string;
    const hook: BrainHook = {
      author: 'repo=test/role=mechanic',
      event: 'onBoot',
      command: 'echo found',
      timeout: { seconds: 30 },
    };

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case3`,
      );
      await fs.mkdir(repoPath, { recursive: true });

      const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
      await adapter.dao.set.upsert({ hook });
    });

    when('[t0] hook present', () => {
      then('returns the hook', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hookFound = await adapter.dao.get.one({
          by: {
            unique: {
              author: 'repo=test/role=mechanic',
              event: 'onBoot',
              command: 'echo found',
            },
          },
        });
        expect(hookFound).not.toBeNull();
        expect(hookFound?.command).toEqual('echo found');
      });
    });

    when('[t1] hook absent', () => {
      then('returns null', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hookFound = await adapter.dao.get.one({
          by: {
            unique: {
              author: 'repo=test/role=mechanic',
              event: 'onBoot',
              command: 'echo nonexistent',
            },
          },
        });
        expect(hookFound).toBeNull();
      });
    });
  });

  given('[case4] dao.set.upsert', () => {
    let repoPath: string;

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case4`,
      );
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] hook does not exist', () => {
      then('creates the hook', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo new',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
        expect(hooks[0]?.command).toEqual('echo new');
      });
    });

    when('[t1] hook exists with same unique key', () => {
      then('updates timeout/filter', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hookOriginal: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo update',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook: hookOriginal });

        const hookUpdated: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo update',
          timeout: { seconds: 120 },
        };
        await adapter.dao.set.upsert({ hook: hookUpdated });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
        // note: timeout is stored in seconds for claude code
        expect(hooks[0]?.timeout).toEqual({ seconds: 120 });
      });

      then('does not create duplicate', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo nodupe',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook });
        await adapter.dao.set.upsert({ hook });
        await adapter.dao.set.upsert({ hook });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
      });
    });
  });

  given('[case5] dao.set.findsert', () => {
    let repoPath: string;

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case5`,
      );
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] hook does not exist', () => {
      then('creates the hook', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo findsert',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.findsert({ hook });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
      });
    });

    when('[t1] same hook findserted twice', () => {
      then('only one hook exists', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo idempotent',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.findsert({ hook });
        await adapter.dao.set.findsert({ hook });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
      });

      then('returns found hook', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo return',
          timeout: { seconds: 30 },
        };
        const first = await adapter.dao.set.findsert({ hook });
        const second = await adapter.dao.set.findsert({ hook });

        expect(first.command).toEqual(second.command);
        expect(first.author).toEqual(second.author);
      });
    });
  });

  given('[case6] dao.del', () => {
    let repoPath: string;

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case6`,
      );
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] hook present', () => {
      then('removes the hook', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo delete',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook });

        await adapter.dao.del({
          by: {
            unique: {
              author: 'repo=test/role=mechanic',
              event: 'onBoot',
              command: 'echo delete',
            },
          },
        });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(0);
      });

      then('dao.get.one returns null after', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onBoot',
          command: 'echo check',
          timeout: { seconds: 30 },
        };
        await adapter.dao.set.upsert({ hook });

        await adapter.dao.del({
          by: {
            unique: {
              author: 'repo=test/role=mechanic',
              event: 'onBoot',
              command: 'echo check',
            },
          },
        });

        const hookFound = await adapter.dao.get.one({
          by: {
            unique: {
              author: 'repo=test/role=mechanic',
              event: 'onBoot',
              command: 'echo check',
            },
          },
        });
        expect(hookFound).toBeNull();
      });
    });

    when('[t1] hook absent', () => {
      then('no error thrown', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });

        await expect(
          adapter.dao.del({
            by: {
              unique: {
                author: 'repo=test/role=mechanic',
                event: 'onBoot',
                command: 'echo nonexistent',
              },
            },
          }),
        ).resolves.toBeUndefined();
      });
    });
  });

  given('[case7] hook with filter', () => {
    let repoPath: string;

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case7`,
      );
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] dao.set.upsert hook with filter.what="Write"', () => {
      then('settings.json contains matcher "Write"', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onTool',
          command: 'echo write',
          timeout: { seconds: 30 },
          filter: { what: 'Write' },
        };
        await adapter.dao.set.upsert({ hook });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.hooks.PreToolUse[0].matcher).toEqual('Write');
      });
    });

    when('[t1] dao.get.all', () => {
      then('returned hook has filter.what="Write"', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hook: BrainHook = {
          author: 'repo=test/role=mechanic',
          event: 'onTool',
          command: 'echo write',
          timeout: { seconds: 30 },
          filter: { what: 'Write' },
        };
        await adapter.dao.set.upsert({ hook });

        const hooks = await adapter.dao.get.all();
        expect(hooks[0]?.filter).toEqual({ what: 'Write' });
      });
    });
  });

  given('[case8] orphan detection - same command different matchers', () => {
    let repoPath: string;

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case8`,
      );
      await fs.mkdir(repoPath, { recursive: true });

      // simulate orphan scenario: same command exists under Write, Edit, and Write|Edit matchers
      const settingsWithOrphans = {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write',
              hooks: [
                {
                  type: 'command',
                  command: 'echo check-gerunds',
                  timeout: 5,
                  author: 'repo=test/role=mechanic',
                },
              ],
            },
            {
              matcher: 'Edit',
              hooks: [
                {
                  type: 'command',
                  command: 'echo check-gerunds',
                  timeout: 5,
                  author: 'repo=test/role=mechanic',
                },
              ],
            },
            {
              matcher: 'Write|Edit',
              hooks: [
                {
                  type: 'command',
                  command: 'echo check-gerunds',
                  timeout: 5,
                  author: 'repo=test/role=mechanic',
                },
              ],
            },
          ],
        },
      };

      await fs.mkdir(path.join(repoPath, '.claude'), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, '.claude', 'settings.json'),
        JSON.stringify(settingsWithOrphans, null, 2) + '\n',
      );
    });

    when('[t0] dao.get.all is called', () => {
      then(
        'returns 3 independent hooks with different filter.what',
        async () => {
          const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
          const hooks = await adapter.dao.get.all();

          expect(hooks).toHaveLength(3);

          // each hook is independent with its own filter.what
          const filters = hooks.map((h) => h.filter?.what).sort();
          expect(filters).toEqual(['Edit', 'Write', 'Write|Edit']);

          // all have same command and author
          expect(hooks.every((h) => h.command === 'echo check-gerunds')).toBe(
            true,
          );
          expect(
            hooks.every((h) => h.author === 'repo=test/role=mechanic'),
          ).toBe(true);
        },
      );
    });

    when('[t1] dao.get.all with author filter', () => {
      then('returns all 3 hooks for that author', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all({
          by: { author: 'repo=test/role=mechanic' },
        });

        expect(hooks).toHaveLength(3);
      });
    });

    when('[t2] rhachet upserts hook with Write|Edit filter', () => {
      then(
        'orphans (Write and Edit) are automatically cleaned up',
        async () => {
          const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });

          // rhachet just upserts the hook with the correct filter
          // adapter handles orphan cleanup across all matchers
          await adapter.dao.set.upsert({
            hook: {
              author: 'repo=test/role=mechanic',
              event: 'onTool',
              command: 'echo check-gerunds',
              timeout: { seconds: 5 },
              filter: { what: 'Write|Edit' },
            },
          });

          const hooks = await adapter.dao.get.all();
          expect(hooks).toHaveLength(1);
          expect(hooks[0]?.filter?.what).toEqual('Write|Edit');
        },
      );
    });
  });

  given('[case9] multiple authors', () => {
    let repoPath: string;
    const hookAuthorA: BrainHook = {
      author: 'repo=test/role=alpha',
      event: 'onBoot',
      command: 'echo alpha',
      timeout: { seconds: 30 },
    };
    const hookAuthorB: BrainHook = {
      author: 'repo=test/role=beta',
      event: 'onBoot',
      command: 'echo beta',
      timeout: { seconds: 30 },
    };

    beforeEach(async () => {
      repoPath = path.join(
        os.tmpdir(),
        `claude-adapter-test-${Date.now()}-case8`,
      );
      await fs.mkdir(repoPath, { recursive: true });

      const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
      await adapter.dao.set.upsert({ hook: hookAuthorA });
      await adapter.dao.set.upsert({ hook: hookAuthorB });
    });

    when('[t0] upsert hooks from author A and author B', () => {
      then('dao.get.all returns both', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(2);
      });
    });

    when(
      '[t1] dao.get.all with { by: { author: "repo=test/role=alpha" } }',
      () => {
        then('returns only author A hooks', async () => {
          const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
          const hooks = await adapter.dao.get.all({
            by: { author: 'repo=test/role=alpha' },
          });
          expect(hooks).toHaveLength(1);
          expect(hooks[0]?.author).toEqual('repo=test/role=alpha');
        });
      },
    );

    when('[t2] dao.del author A hook', () => {
      then('author B hooks remain', async () => {
        const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });
        await adapter.dao.del({
          by: {
            unique: {
              author: 'repo=test/role=alpha',
              event: 'onBoot',
              command: 'echo alpha',
            },
          },
        });

        const hooks = await adapter.dao.get.all();
        expect(hooks).toHaveLength(1);
        expect(hooks[0]?.author).toEqual('repo=test/role=beta');
      });
    });
  });
});
