import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { BrainHook } from 'rhachet';
import { given, then, useBeforeAll, when } from 'test-fns';

import { genBrainHooksAdapterForClaudeCode } from '../dist/domain.operations/hooks/genBrainHooksAdapterForClaudeCode';

describe('brainHooksAdapter.blackbox', () => {
  given('[case1] a series of set and del operations', () => {
    const scene = useBeforeAll(async () => {
      // create a temp repo directory
      const repoPath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'blackbox-hooks-'),
      );

      // get the adapter from dist (like rhachet would)
      const adapter = genBrainHooksAdapterForClaudeCode({ repoPath });

      // define hooks to set
      const hooks = {
        mechanicBoot: {
          author: 'repo=myapp/role=mechanic',
          event: 'onBoot',
          command: 'echo "mechanic booted"',
          timeout: { seconds: 30 },
        } as BrainHook,
        mechanicTool: {
          author: 'repo=myapp/role=mechanic',
          event: 'onTool',
          command: 'npx rhachet validate --tool $TOOL_NAME',
          timeout: { seconds: 60 },
          filter: { what: 'Bash' },
        } as BrainHook,
        reviewerBoot: {
          author: 'repo=myapp/role=reviewer',
          event: 'onBoot',
          command: 'echo "reviewer ready"',
          timeout: { seconds: 15 },
        } as BrainHook,
        reviewerStop: {
          author: 'repo=myapp/role=reviewer',
          event: 'onStop',
          command: 'npx rhachet summarize',
          timeout: { seconds: 120 },
        } as BrainHook,
      };

      return { repoPath, adapter, hooks };
    });

    afterAll(async () => {
      await fs.rm(scene.repoPath, { recursive: true, force: true });
    });

    when('[t0] before any operations', () => {
      then('settings.json does not exist', async () => {
        const settingsPath = path.join(
          scene.repoPath,
          '.claude',
          'settings.json',
        );
        const exists = await fs
          .access(settingsPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      });
    });

    when('[t1] after upsert of all four hooks', () => {
      const result = useBeforeAll(async () => {
        await scene.adapter.dao.set.upsert({ hook: scene.hooks.mechanicBoot });
        await scene.adapter.dao.set.upsert({ hook: scene.hooks.mechanicTool });
        await scene.adapter.dao.set.upsert({ hook: scene.hooks.reviewerBoot });
        await scene.adapter.dao.set.upsert({ hook: scene.hooks.reviewerStop });

        const settingsPath = path.join(
          scene.repoPath,
          '.claude',
          'settings.json',
        );
        const content = await fs.readFile(settingsPath, 'utf-8');
        return { content };
      });

      then('settings.json matches snapshot', () => {
        expect(result.content).toMatchSnapshot();
      });

      then('dao.get.all returns four hooks', async () => {
        const hooksFound = await scene.adapter.dao.get.all();
        expect(hooksFound).toHaveLength(4);
      });
    });

    when('[t2] after del of mechanic onBoot hook', () => {
      const result = useBeforeAll(async () => {
        await scene.adapter.dao.del({
          by: {
            unique: {
              author: scene.hooks.mechanicBoot.author,
              event: scene.hooks.mechanicBoot.event,
              command: scene.hooks.mechanicBoot.command,
            },
          },
        });

        const settingsPath = path.join(
          scene.repoPath,
          '.claude',
          'settings.json',
        );
        const content = await fs.readFile(settingsPath, 'utf-8');
        return { content };
      });

      then('settings.json matches snapshot', () => {
        expect(result.content).toMatchSnapshot();
      });

      then('dao.get.all returns three hooks', async () => {
        const hooksFound = await scene.adapter.dao.get.all();
        expect(hooksFound).toHaveLength(3);
      });

      then('mechanic onBoot hook is gone', async () => {
        const hook = await scene.adapter.dao.get.one({
          by: {
            unique: {
              author: scene.hooks.mechanicBoot.author,
              event: scene.hooks.mechanicBoot.event,
              command: scene.hooks.mechanicBoot.command,
            },
          },
        });
        expect(hook).toBeNull();
      });
    });

    when('[t3] after del of all reviewer hooks', () => {
      const result = useBeforeAll(async () => {
        await scene.adapter.dao.del({
          by: {
            unique: {
              author: scene.hooks.reviewerBoot.author,
              event: scene.hooks.reviewerBoot.event,
              command: scene.hooks.reviewerBoot.command,
            },
          },
        });
        await scene.adapter.dao.del({
          by: {
            unique: {
              author: scene.hooks.reviewerStop.author,
              event: scene.hooks.reviewerStop.event,
              command: scene.hooks.reviewerStop.command,
            },
          },
        });

        const settingsPath = path.join(
          scene.repoPath,
          '.claude',
          'settings.json',
        );
        const content = await fs.readFile(settingsPath, 'utf-8');
        return { content };
      });

      then('settings.json matches snapshot', () => {
        expect(result.content).toMatchSnapshot();
      });

      then('dao.get.all returns one hook (mechanic onTool)', async () => {
        const hooksFound = await scene.adapter.dao.get.all();
        expect(hooksFound).toHaveLength(1);
        expect(hooksFound[0]?.author).toEqual('repo=myapp/role=mechanic');
        expect(hooksFound[0]?.event).toEqual('onTool');
      });
    });

    when('[t4] after upsert updates timeout on last hook', () => {
      const result = useBeforeAll(async () => {
        const hookUpdated: BrainHook = {
          ...scene.hooks.mechanicTool,
          timeout: { seconds: 90 },
        };
        await scene.adapter.dao.set.upsert({ hook: hookUpdated });

        const settingsPath = path.join(
          scene.repoPath,
          '.claude',
          'settings.json',
        );
        const content = await fs.readFile(settingsPath, 'utf-8');
        return { content };
      });

      then('settings.json matches snapshot', () => {
        expect(result.content).toMatchSnapshot();
      });

      then('hook timeout is updated to 90 seconds', async () => {
        const hooksFound = await scene.adapter.dao.get.all();
        expect(hooksFound).toHaveLength(1);
        expect(hooksFound[0]?.timeout).toEqual({ seconds: 90 });
      });
    });

    when('[t5] after del of last hook', () => {
      const result = useBeforeAll(async () => {
        await scene.adapter.dao.del({
          by: {
            unique: {
              author: scene.hooks.mechanicTool.author,
              event: scene.hooks.mechanicTool.event,
              command: scene.hooks.mechanicTool.command,
            },
          },
        });

        const settingsPath = path.join(
          scene.repoPath,
          '.claude',
          'settings.json',
        );
        const content = await fs.readFile(settingsPath, 'utf-8');
        return { content };
      });

      then('settings.json matches snapshot', () => {
        expect(result.content).toMatchSnapshot();
      });

      then('dao.get.all returns empty array', async () => {
        const hooksFound = await scene.adapter.dao.get.all();
        expect(hooksFound).toHaveLength(0);
      });
    });
  });
});
