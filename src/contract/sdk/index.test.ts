import { BrainAtom, BrainRepl } from 'rhachet';
import { given, then, when } from 'test-fns';

import { genBrainAtom } from '../../domain.operations/atoms/genBrainAtom';
import { genBrainRepl } from '../../domain.operations/repls/genBrainRepl';
import { getBrainAtomsByAnthropic, getBrainReplsByAnthropic } from './index';

describe('rhachet-brains-anthropic.integration', () => {
  given('[case1] getBrainAtomsByAnthropic', () => {
    when('[t0] called', () => {
      then('returns array with three atoms', () => {
        const atoms = getBrainAtomsByAnthropic();
        expect(atoms).toHaveLength(3);
      });

      then('returns BrainAtom instances', () => {
        const atoms = getBrainAtomsByAnthropic();
        for (const atom of atoms) {
          expect(atom).toBeInstanceOf(BrainAtom);
        }
      });
    });
  });

  given('[case2] getBrainReplsByAnthropic', () => {
    when('[t0] called', () => {
      then('returns array with four repls', () => {
        const repls = getBrainReplsByAnthropic();
        expect(repls).toHaveLength(4);
      });

      then('returns BrainRepl instances', () => {
        const repls = getBrainReplsByAnthropic();
        for (const repl of repls) {
          expect(repl).toBeInstanceOf(BrainRepl);
        }
      });
    });
  });

  given('[case3] genBrainAtom factory', () => {
    when('[t0] called with claude/sonnet slug', () => {
      const atom = genBrainAtom({ slug: 'claude/sonnet' });

      then('returns BrainAtom instance', () => {
        expect(atom).toBeInstanceOf(BrainAtom);
      });

      then('has correct slug', () => {
        expect(atom.slug).toEqual('claude/sonnet');
      });
    });
  });

  given('[case4] genBrainRepl factory', () => {
    when('[t0] called with claude/code slug', () => {
      const repl = genBrainRepl({ slug: 'claude/code' });

      then('returns BrainRepl instance', () => {
        expect(repl).toBeInstanceOf(BrainRepl);
      });

      then('has correct slug', () => {
        expect(repl.slug).toEqual('claude/code');
      });
    });
  });
});
