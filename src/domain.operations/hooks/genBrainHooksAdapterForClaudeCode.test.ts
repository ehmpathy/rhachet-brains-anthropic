import { given, then, when } from 'test-fns';

import { genBrainHooksAdapterForClaudeCode } from './genBrainHooksAdapterForClaudeCode';

describe('genBrainHooksAdapterForClaudeCode', () => {
  given('[case1] adapter factory', () => {
    when('[t0] called with repoPath', () => {
      then('adapter.slug equals "claude-code"', () => {
        const adapter = genBrainHooksAdapterForClaudeCode({
          repoPath: '/tmp/test-repo',
        });
        expect(adapter.slug).toEqual('claude-code');
      });

      then('adapter.dao.get is defined', () => {
        const adapter = genBrainHooksAdapterForClaudeCode({
          repoPath: '/tmp/test-repo',
        });
        expect(adapter.dao.get).toBeDefined();
        expect(adapter.dao.get.one).toBeDefined();
        expect(adapter.dao.get.all).toBeDefined();
      });

      then('adapter.dao.set is defined', () => {
        const adapter = genBrainHooksAdapterForClaudeCode({
          repoPath: '/tmp/test-repo',
        });
        expect(adapter.dao.set).toBeDefined();
        expect(adapter.dao.set.findsert).toBeDefined();
        expect(adapter.dao.set.upsert).toBeDefined();
      });

      then('adapter.dao.del is defined', () => {
        const adapter = genBrainHooksAdapterForClaudeCode({
          repoPath: '/tmp/test-repo',
        });
        expect(adapter.dao.del).toBeDefined();
      });
    });
  });
});
