import { given, then, useThen, when } from 'test-fns';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * .what = a tripwire that fails if tsconfig.json restricts compilerOptions.types
 *         in a way that drops the ambient `jest` global from the prod compile
 * .why = infra/esm/importEsmSafe.ts detects jest via `typeof jest !== 'undefined'`
 *        to pick the require() fallback (jest's vm sandbox blocks a native
 *        import()). that bare `jest` reference only type-checks because
 *        tsconfig.json has no `types` restriction, so @types/jest's ambient global
 *        reaches the prod compile unit. a later `"types": ["node"]` narrowing
 *        would silently break that compile and reopen the exact ERR_REQUIRE_ESM
 *        outage this fix closes. this test is the CI tripwire the reviewer asked
 *        for: it fails loud, at the cause, before that lands.
 * .note = reads tsconfig via fs (a boundary), so it is an integration test per
 *         rule.forbid.unit.remote-boundaries, not a unit test.
 */
describe('genBrainRepl jest-global compile guard', () => {
  given('[case1] the repo tsconfig.json', () => {
    when('[t0] its compilerOptions.types is inspected', () => {
      const config = useThen('it parses as json', () => {
        const raw = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8');
        // JSON.parse returns any; assign to a typed const (no as-cast needed)
        const parsed: { compilerOptions?: { types?: string[] } } =
          JSON.parse(raw);
        return { types: parsed.compilerOptions?.types ?? null };
      });

      then(
        'it does not restrict types in a way that drops the jest ambient global',
        () => {
          // absent restriction = all ambient globals (incl. @types/jest) reach
          // the prod compile → `typeof jest` in genBrainRepl.ts keeps compiling.
          // if a restriction is added, it MUST include 'jest' or the loader's
          // jest-detection stops compiling and the esm outage reopens.
          const restricted = config.types;
          if (restricted !== null) expect(restricted).toContain('jest');
          // when unrestricted (null), no restriction exists to assert against —
          // the ambient is available, which is the state the loader depends on.
        },
      );
    });
  });
});
