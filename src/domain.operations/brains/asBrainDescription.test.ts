import { given, then, when } from 'test-fns';

import { genBrainAtom } from '../atoms/genBrainAtom';
import { genBrainRepl } from '../repls/genBrainRepl';
import { asBrainDescription } from './asBrainDescription';

/**
 * .what = clamps that the structured `deprecated` fact crosses to the object a
 *   consumer holds, not merely to the readme
 * .why = `deprecated` lived only in the config. `getBrainAtomsByAnthropic()` — which is
 *   exactly what rhachet's `rhx review --brain` discovery iterates — handed back objects
 *   with no signal that a rung is retired, and the repl object had none at all.
 * .note = unit, not integration. both factories are pure: they read a config map and
 *   construct an object. the `Anthropic` client is built lazily inside `ask`, so no key
 *   and no network is touched here.
 */
describe('asBrainDescription', () => {
  given('[case1] a current rung', () => {
    when('[t0] the description is composed', () => {
      const description = asBrainDescription({
        base: 'claude opus 5 - for complex agentic work',
        deprecated: null,
      });

      then('it is the base, untouched', () => {
        expect(description).toEqual('claude opus 5 - for complex agentic work');
      });
    });
  });

  given('[case2] a retired rung still served on two platforms', () => {
    when('[t0] the description is composed', () => {
      const description = asBrainDescription({
        base: 'claude sonnet 4 - balanced performance',
        deprecated: {
          since: '2026-06-15',
          platforms: ['bedrock', 'google-cloud'],
          replacedBy: 'claude/sonnet/v5',
        },
      });

      then('it carries the date, the reason, and the pointer', () => {
        expect(description).toContain('claude sonnet 4 - balanced performance');
        expect(description).toContain('deprecated 2026-06-15');
        expect(description).toContain('retired on the first-party Claude API.');
        expect(description).toContain('`claude/sonnet/v5`');
      });

      then('it names BOTH platforms', () => {
        expect(description).toContain('Amazon Bedrock and Google Cloud');
      });
    });
  });

  /**
   * ⚠️ the case this whole refactor exists for. `deprecated.reason` used to be a
   *   hand-typed sentence per rung, and it went wrong exactly here: opus 4 was
   *   written as Bedrock+GCP when it is Google-Cloud ONLY. two prose strings can
   *   disagree while both read plausibly; a `BrainPlatform[]` and one derivation
   *   cannot.
   *
   * .note = it asserts against the LIVE config, not a literal, so a future edit that
   *   re-broadens opus 4 back to Bedrock reddens this rather than passes quietly.
   */
  given('[case5] the ragged platform truth across two retired rungs', () => {
    when('[t0] opus 4 and sonnet 4 are both asked for', () => {
      const opus = genBrainAtom({ slug: 'claude/opus/v4' });
      const sonnet = genBrainAtom({ slug: 'claude/sonnet/v4' });

      then('opus 4 says Google Cloud ONLY, and never claims Bedrock', () => {
        expect(opus.description).toContain('Google Cloud ONLY');
        expect(opus.description).not.toContain('Bedrock');
      });

      then('sonnet 4 does claim Bedrock, so the two genuinely differ', () => {
        expect(sonnet.description).toContain('Amazon Bedrock');
        expect(sonnet.description).not.toContain('ONLY');
      });
    });
  });

  given('[case3] the atom object a consumer actually holds', () => {
    when('[t0] a retired rung is asked for', () => {
      const brain = genBrainAtom({ slug: 'claude/opus/v4' });

      then('its description says so', () => {
        expect(brain.description).toContain('deprecated 2026-06-15');
      });

      then('it names the slug to move to', () => {
        expect(brain.description).toContain('`claude/opus/v5`');
      });
    });

    when('[t1] a current rung is asked for', () => {
      const brain = genBrainAtom({ slug: 'claude/opus/v5' });

      then('its description carries no deprecation mark', () => {
        expect(brain.description).not.toContain('deprecated');
      });
    });
  });

  given('[case4] the repl object a consumer actually holds', () => {
    when('[t0] a retired rung is asked for', () => {
      const brain = genBrainRepl({ slug: 'claude/code/opus/v4' });

      then('its description says so', () => {
        expect(brain.description).toContain('deprecated 2026-06-15');
      });

      // .note = the sharp half of this clamp. `deprecated.replacedBy` can only hold an
      //   ATOM slug, since one config object backs both ladders. handed to a repl reader
      //   as-is it would name a slug `genBrainRepl` refuses.
      then('it names a REPL slug, never the atom slug', () => {
        expect(brain.description).toContain('`claude/code/opus/v5`');
        expect(brain.description).not.toContain('`claude/opus/v5`');
      });
    });

    when('[t1] a current rung is asked for', () => {
      const brain = genBrainRepl({ slug: 'claude/code/opus/v5' });

      then('its description carries no deprecation mark', () => {
        expect(brain.description).not.toContain('deprecated');
      });
    });
  });
});
