import { given, then, when } from 'test-fns';

import { getBrainHooks } from './getBrainHooks';

describe('getBrainHooks', () => {
  given('[case1] brain specifier "claude"', () => {
    when('[t0] getBrainHooks is called', () => {
      then('returns adapter with slug "claude-code"', () => {
        const adapter = getBrainHooks({
          brain: 'claude',
          repoPath: '/tmp/test-repo',
        });
        expect(adapter).not.toBeNull();
        expect(adapter?.slug).toEqual('claude-code');
      });
    });
  });

  given('[case2] brain specifier "claude-code"', () => {
    when('[t0] getBrainHooks is called', () => {
      then('returns adapter with slug "claude-code"', () => {
        const adapter = getBrainHooks({
          brain: 'claude-code',
          repoPath: '/tmp/test-repo',
        });
        expect(adapter).not.toBeNull();
        expect(adapter?.slug).toEqual('claude-code');
      });
    });
  });

  given('[case3] brain specifier "anthropic/claude/code"', () => {
    when('[t0] getBrainHooks is called', () => {
      then('returns adapter', () => {
        const adapter = getBrainHooks({
          brain: 'anthropic/claude/code',
          repoPath: '/tmp/test-repo',
        });
        expect(adapter).not.toBeNull();
        expect(adapter?.slug).toEqual('claude-code');
      });
    });
  });

  given('[case4] brain specifier "opencode"', () => {
    when('[t0] getBrainHooks is called', () => {
      then('returns null', () => {
        const adapter = getBrainHooks({
          brain: 'opencode' as never, // cast to never since opencode is not a valid BrainSpecifier in rhachet
          repoPath: '/tmp/test-repo',
        });
        expect(adapter).toBeNull();
      });
    });
  });

  given('[case5] unknown brain specifier', () => {
    when('[t0] getBrainHooks is called', () => {
      then('returns null', () => {
        const adapter = getBrainHooks({
          brain: 'unknown-brain' as never,
          repoPath: '/tmp/test-repo',
        });
        expect(adapter).toBeNull();
      });
    });
  });
});
