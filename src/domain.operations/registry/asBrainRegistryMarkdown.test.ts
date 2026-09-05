import { given, then, when } from 'test-fns';

import { ANTHROPIC_BRAIN_ATOM_SLUGS } from '../brains/BrainAtom.config';
import { ANTHROPIC_BRAIN_REPL_SLUGS } from '../brains/BrainRepl.config';
import { asBrainRegistryMarkdown } from './asBrainRegistryMarkdown';

describe('asBrainRegistryMarkdown', () => {
  given('[case1] the shipped brain registry', () => {
    when('[t0] the markdown is rendered', () => {
      // .note = a plain const, not useThen — the render is pure and in-memory, so
      //   there is no expensive call to share, and a useThen proxy is not a string
      const markdown = asBrainRegistryMarkdown();

      then('it holds a row for every registered atom slug', () => {
        for (const slug of ANTHROPIC_BRAIN_ATOM_SLUGS)
          expect(markdown).toContain(`| \`${slug}\` |`);
      });

      then('it holds a row for every registered repl slug', () => {
        for (const slug of ANTHROPIC_BRAIN_REPL_SLUGS)
          expect(markdown).toContain(`| \`${slug}\` |`);
      });

      then('the bare aliases point at the frontier rung of their tier', () => {
        expect(markdown).toContain('| `claude/opus` | claude-opus-5 |');
        expect(markdown).toContain('| `claude/sonnet` | claude-sonnet-5 |');
        expect(markdown).toContain('| `claude/fable` | claude-fable-5 |');
      });

      then('the bare repl default stays on sonnet, not the top tier', () => {
        expect(markdown).toContain('| `claude/code` | claude-sonnet-5 |');
      });

      /**
       * .what = every bare alias states its own tokenizer in its own row
       *
       * .why = a rung list cannot name a bare alias — `asRungsOf` drops one on purpose,
       *   since an alias has no rung to print. so the four aliases can only be answered
       *   by a per-row cell, which is why the warn now names the two cell VALUES
       *   (`4.7+` / `pre-4.7`) rather than list the rungs on one side.
       *
       * ⚠️ this clamp guards the CELL, not the warn, and that is deliberate: the warn's
       *   words have already been rewritten once, and the cell is what a reader on
       *   `claude/opus` actually lands on.
       *
       * ⚠️ the assert is on `4.7+` specifically, not merely on a non-empty cell. all
       *   four point at a 5-gen model, so `pre-4.7` here would be the exact wrong
       *   answer this clamp exists to catch — a cell that is present and incorrect.
       */
      then(
        'each bare alias carries its own tokenizer, which no warn can name',
        () => {
          const headsOfAliases = [
            '| `claude/opus` |',
            '| `claude/sonnet` |',
            '| `claude/fable` |',
            '| `claude/code` |',
          ];
          const rowsOfAliases = markdown
            .split('\n')
            .filter((line) =>
              headsOfAliases.some((head) => line.startsWith(head)),
            );

          expect(rowsOfAliases).toHaveLength(4);
          for (const row of rowsOfAliases) expect(row).toContain('| 4.7+ |');
        },
      );

      /**
       * .why = the header lived as two separate literals while the cells came from
       *   one transformer, so a column added to the row and to one header would
       *   shift the other table's cells under the wrong titles — a mislabel with no
       *   compile error. this asserts both ladders render the SAME header.
       */
      then(
        'both ladders render one identical header, so cells cannot mislabel',
        () => {
          const headers = markdown
            .split('\n')
            .filter((line) => line.startsWith('| slug |'));
          expect(headers).toHaveLength(2);
          expect(headers[0]).toEqual(headers[1]);
          expect(headers[0]).toContain('| tokenizer |');
        },
      );

      then('it surfaces the thought mode, which is the cost trap', () => {
        // sonnet 4.6 thinks by default like v5, yet costs more — the whole reason
        // this column exists. see BrainAtom.config `thought`.
        expect(markdown).toContain(
          '| `claude/sonnet/v4.6` | claude-sonnet-4-6 | $3.00 / $15.00 | 1M | by default (effort: high) |',
        );
        expect(markdown).toContain(
          '| `claude/sonnet/v5` | claude-sonnet-5 | $2.00 / $10.00 | 1M | by default (effort: high) |',
        );
        // v4.5 is the rung that actually answers "freeze the behavior"
        expect(markdown).toContain(
          '| `claude/sonnet/v4.5` | claude-sonnet-4-5-20250929 | $3.00 / $15.00 | 200K | on request |',
        );
      });

      then('it marks the retired rungs rather than hides them', () => {
        expect(markdown).toContain('🪦 2026-02-19 → `claude/haiku/v4.5`');
        expect(markdown).toContain('🪦 2026-06-15 → `claude/sonnet/v5`');
        expect(markdown).toContain('🪦 2026-06-15 → `claude/opus/v5`');
      });

      then(
        'a retired rung points at the newest rung, not the next one up',
        () => {
          // .why = "one rung up" is the trap this whole table exists to expose. sonnet
          //   v4.6 thinks by default exactly as v5 does, at $3/$15 against $2/$10 — so
          //   it recovers none of v4's on-request behavior and charges 50% more for the
          //   privilege. a pointer at v4.6 would walk a caller straight into it.
          expect(markdown).not.toContain('→ `claude/sonnet/v4.6`');
          expect(markdown).not.toContain('→ `claude/opus/v4.8`');
        },
      );

      then('a repl row points at a repl slug, never at an atom slug', () => {
        // .why = both tables render the SAME config object, so `deprecated.replacedBy`
        //   can only hold an atom slug. rendered raw, a repl row would send a repl
        //   caller to `claude/sonnet/v5` — a slug `genBrainRepl` does not accept.
        const rowRepl = markdown
          .split('\n')
          .find((row) => row.startsWith('| `claude/code/sonnet/v4` |'));
        expect(rowRepl).toContain('→ `claude/code/sonnet/v5`');
        expect(rowRepl).not.toContain('→ `claude/sonnet/v5`');
      });

      then('opus 4 names google cloud only, never bedrock', () => {
        // verified against the model-deprecations page: opus 4 is narrower than the
        // other two. a reason that named bedrock would send a bedrock caller to a
        // rung that fails there too.
        const line = markdown
          .split('\n')
          .find((row) => row.startsWith('- `claude/opus/v4` —'));
        expect(line).toContain('Google Cloud ONLY');
        expect(line).not.toContain('still served on Amazon Bedrock');
      });

      then('it matches the snapshot', () => {
        expect(markdown).toMatchSnapshot();
      });
    });
  });
});
