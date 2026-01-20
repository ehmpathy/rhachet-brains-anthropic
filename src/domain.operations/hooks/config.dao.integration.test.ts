import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, when } from 'test-fns';

import {
  type ClaudeCodeSettings,
  readClaudeCodeSettings,
  writeClaudeCodeSettings,
} from './config.dao';

describe('config.dao', () => {
  given('[case1] empty repo (no .claude directory)', () => {
    let repoPath: string;

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case1`);
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] readClaudeCodeSettings is called', () => {
      then('returns empty object {}', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(settings).toEqual({});
      });
    });

    when('[t1] writeClaudeCodeSettings is called with hooks', () => {
      then('creates .claude directory', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo hello',
                    author: 'repo=test/role=mechanic',
                  },
                ],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const claudeDir = path.join(repoPath, '.claude');
        const stat = await fs.stat(claudeDir);
        expect(stat.isDirectory()).toBe(true);
      });

      then('creates settings.json file', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo hello' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsPath = path.join(repoPath, '.claude', 'settings.json');
        const stat = await fs.stat(settingsPath);
        expect(stat.isFile()).toBe(true);
      });

      then('file contains valid json', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo hello' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsPath = path.join(repoPath, '.claude', 'settings.json');
        const content = await fs.readFile(settingsPath, 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed).toEqual(settings);
      });
    });
  });

  given('[case2] repo with .claude directory but no settings.json', () => {
    let repoPath: string;

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case2`);
      await fs.mkdir(path.join(repoPath, '.claude'), { recursive: true });
    });

    when('[t0] readClaudeCodeSettings is called', () => {
      then('returns empty object {}', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(settings).toEqual({});
      });
    });

    when('[t1] writeClaudeCodeSettings is called', () => {
      then('creates settings.json', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'echo bash' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsPath = path.join(repoPath, '.claude', 'settings.json');
        const stat = await fs.stat(settingsPath);
        expect(stat.isFile()).toBe(true);
      });
    });
  });

  given('[case3] repo with prior settings.json (no hooks)', () => {
    let repoPath: string;
    const priorSettings = {
      permissions: {
        allow: ['Bash(*)'],
      },
      model: 'claude-opus-4-5-20251101',
    };

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case3`);
      await fs.mkdir(path.join(repoPath, '.claude'), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, '.claude', 'settings.json'),
        JSON.stringify(priorSettings, null, 2) + '\n',
      );
    });

    when('[t0] readClaudeCodeSettings is called', () => {
      then('returns parsed settings', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(settings.permissions).toBeDefined();
        expect(settings.model).toBeDefined();
      });

      then('preserves non-hook settings', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(settings.permissions).toEqual(priorSettings.permissions);
        expect(settings.model).toEqual(priorSettings.model);
      });
    });

    when('[t1] writeClaudeCodeSettings is called with hooks', () => {
      then('file contains hooks section', async () => {
        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        const settingsToWrite: ClaudeCodeSettings = {
          ...settingsRead,
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo start' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({
          settings: settingsToWrite,
          to: repoPath,
        });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.hooks).toBeDefined();
        expect(parsed.hooks.SessionStart).toHaveLength(1);
      });

      then('prior non-hook settings are preserved', async () => {
        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        const settingsToWrite: ClaudeCodeSettings = {
          ...settingsRead,
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo start' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({
          settings: settingsToWrite,
          to: repoPath,
        });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.permissions).toEqual(priorSettings.permissions);
        expect(parsed.model).toEqual(priorSettings.model);
      });
    });
  });

  given('[case4] repo with prior settings.json (with hooks)', () => {
    let repoPath: string;
    const priorSettings: ClaudeCodeSettings = {
      permissions: { allow: ['Read(*)'] },
      hooks: {
        SessionStart: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo old-start',
                author: 'repo=old/role=test',
              },
            ],
          },
        ],
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'echo write-check' }],
          },
        ],
      },
    };

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case4`);
      await fs.mkdir(path.join(repoPath, '.claude'), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, '.claude', 'settings.json'),
        JSON.stringify(priorSettings, null, 2) + '\n',
      );
    });

    when('[t0] readClaudeCodeSettings is called', () => {
      then('returns settings with hooks', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(settings.hooks).toBeDefined();
      });

      then('hooks.SessionStart is array', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(Array.isArray(settings.hooks?.SessionStart)).toBe(true);
        expect(settings.hooks?.SessionStart).toHaveLength(1);
      });

      then('hooks.PreToolUse is array', async () => {
        const settings = await readClaudeCodeSettings({ from: repoPath });
        expect(Array.isArray(settings.hooks?.PreToolUse)).toBe(true);
        expect(settings.hooks?.PreToolUse).toHaveLength(1);
      });
    });

    when('[t1] writeClaudeCodeSettings overwrites hooks', () => {
      then('new hooks replace old hooks', async () => {
        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        const settingsToWrite: ClaudeCodeSettings = {
          ...settingsRead,
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo new-start',
                    author: 'repo=new/role=mechanic',
                  },
                ],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({
          settings: settingsToWrite,
          to: repoPath,
        });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.hooks.SessionStart[0].hooks[0].command).toEqual(
          'echo new-start',
        );
        expect(parsed.hooks.PreToolUse).toBeUndefined();
      });

      then('prior non-hook settings preserved', async () => {
        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        const settingsToWrite: ClaudeCodeSettings = {
          ...settingsRead,
          hooks: {
            Stop: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo stop' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({
          settings: settingsToWrite,
          to: repoPath,
        });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.permissions).toEqual(priorSettings.permissions);
      });
    });
  });

  given('[case5] json format validation', () => {
    let repoPath: string;

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case5`);
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] writeClaudeCodeSettings is called', () => {
      then('json is formatted with 2-space indentation', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo test' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        // check for 2-space indent
        expect(content).toContain('  "hooks"');
        expect(content).toContain('    "SessionStart"');
      });

      then('file ends with newline', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo test' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        expect(content.endsWith('\n')).toBe(true);
      });

      then('json is valid (parseable)', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo test' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        expect(() => JSON.parse(content)).not.toThrow();
      });
    });
  });

  given('[case6] multiple hook events', () => {
    let repoPath: string;

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case6`);
      await fs.mkdir(repoPath, { recursive: true });
    });

    when(
      '[t0] write settings with SessionStart + PreToolUse + Stop hooks',
      () => {
        then('all event types are written', async () => {
          const settings: ClaudeCodeSettings = {
            hooks: {
              SessionStart: [
                {
                  matcher: '*',
                  hooks: [{ type: 'command', command: 'echo start' }],
                },
              ],
              PreToolUse: [
                {
                  matcher: 'Bash',
                  hooks: [{ type: 'command', command: 'echo bash' }],
                },
              ],
              Stop: [
                {
                  matcher: '*',
                  hooks: [{ type: 'command', command: 'echo stop' }],
                },
              ],
            },
          };
          await writeClaudeCodeSettings({ settings, to: repoPath });

          const content = await fs.readFile(
            path.join(repoPath, '.claude', 'settings.json'),
            'utf-8',
          );
          const parsed = JSON.parse(content);
          expect(parsed.hooks.SessionStart).toBeDefined();
          expect(parsed.hooks.PreToolUse).toBeDefined();
          expect(parsed.hooks.Stop).toBeDefined();
        });
      },
    );

    when('[t1] read settings back', () => {
      then('all event types are returned', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo start' }],
              },
            ],
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'echo bash' }],
              },
            ],
            Stop: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: 'echo stop' }],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        expect(settingsRead.hooks?.SessionStart).toHaveLength(1);
        expect(settingsRead.hooks?.PreToolUse).toHaveLength(1);
        expect(settingsRead.hooks?.Stop).toHaveLength(1);
      });

      then('hook entries have correct structure', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [
                  { type: 'command', command: 'echo start', timeout: 5000 },
                ],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        const entry = settingsRead.hooks?.SessionStart?.[0];
        expect(entry?.matcher).toEqual('*');
        expect(entry?.hooks[0]?.type).toEqual('command');
        expect(entry?.hooks[0]?.command).toEqual('echo start');
        expect(entry?.hooks[0]?.timeout).toEqual(5000);
      });
    });
  });

  given('[case7] hook with author attribute', () => {
    let repoPath: string;

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case7`);
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] write hook with author="repo=test/role=mechanic"', () => {
      then('author attribute is persisted on hook', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo hello',
                    author: 'repo=test/role=mechanic',
                  },
                ],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.hooks.SessionStart[0].hooks[0].author).toEqual(
          'repo=test/role=mechanic',
        );
      });
    });

    when('[t1] read settings back', () => {
      then('author attribute is present on each hook', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {
            SessionStart: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo hello',
                    author: 'repo=test/role=mechanic',
                  },
                ],
              },
            ],
          },
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        expect(settingsRead.hooks?.SessionStart?.[0]?.hooks[0]?.author).toEqual(
          'repo=test/role=mechanic',
        );
      });
    });
  });

  given('[case8] empty hooks section', () => {
    let repoPath: string;

    beforeAll(async () => {
      repoPath = path.join(os.tmpdir(), `claude-test-${Date.now()}-case8`);
      await fs.mkdir(repoPath, { recursive: true });
    });

    when('[t0] write settings with hooks: {}', () => {
      then('hooks key is present', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {},
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect('hooks' in parsed).toBe(true);
      });

      then('hooks value is empty object', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {},
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const content = await fs.readFile(
          path.join(repoPath, '.claude', 'settings.json'),
          'utf-8',
        );
        const parsed = JSON.parse(content);
        expect(parsed.hooks).toEqual({});
      });
    });

    when('[t1] read settings back', () => {
      then('hooks is empty object', async () => {
        const settings: ClaudeCodeSettings = {
          hooks: {},
        };
        await writeClaudeCodeSettings({ settings, to: repoPath });

        const settingsRead = await readClaudeCodeSettings({ from: repoPath });
        expect(settingsRead.hooks).toEqual({});
      });
    });
  });
});
