# rule.prefer.useThen-and-useWhen-for-shared-results

## .what

use `useThen` and `useWhen` from `test-fns` to capture operation results and share them across multiple blocks without `let` declarations

## .why

- eliminates redundant api calls or expensive operations
- reduces test execution time significantly
- avoids `let` declarations for shared results
- keeps tests focused on distinct assertions while setup is shared

## .variants

| helper    | creates test block | shares with           | use case                             |
| --------- | ------------------ | --------------------- | ------------------------------------ |
| `useThen` | yes                | sibling `then` blocks | share async result across assertions |
| `useWhen` | wraps `when` block | sibling `when` blocks | track change over sequential actions |

## .pattern: useThen

use `useThen` to share an operation result across multiple `then` assertions:

```ts
import { given, then, useThen, when } from 'test-fns';

given('[case1] some scenario', () => {
  when('[t0] operation is executed', () => {
    // call the operation once and capture the result
    const result = useThen('it succeeds', async () =>
      expensiveOperation({ input }),
    );

    // subsequent assertions reuse the captured result
    then('it returns expected output', () => {
      expect(result.output).toBeDefined();
    });

    then('it returns expected metrics', () => {
      expect(result.metrics.tokens).toBeGreaterThan(0);
    });

    then('it returns expected cost', () => {
      expect(result.cost.total).toBeDefined();
    });
  });
});
```

## .pattern: useWhen

use `useWhen` to wrap a `when` block and share its result with sibling `when` blocks — ideal to track change over sequential actions (e.g., idempotency verification, state transitions, before/after comparisons):

```ts
import { given, then, useThen, useWhen, when } from 'test-fns';

given('[case1] user registration', () => {
  when('[t0] before any changes', () => {
    then('user does not exist', async () => {
      const user = await findUser({ email: 'test@example.com' });
      expect(user).toBeNull();
    });
  });

  // wrap the when block with useWhen to capture result for sibling when blocks
  const responseFirst = useWhen('[t1] registration is called', () => {
    const response = useThen('registration succeeds', async () =>
      registerUser({ email: 'test@example.com' }),
    );

    then('user is created', () => {
      expect(response.status).toEqual('created');
    });

    return response; // return the result to share with siblings
  });

  when('[t2] registration is repeated', () => {
    const responseSecond = useThen('registration still succeeds', async () =>
      registerUser({ email: 'test@example.com' }),
    );

    // compare with responseFirst from [t1] for idempotency verification
    then('response is idempotent', () => {
      expect(responseSecond.id).toEqual(responseFirst.id);
      expect(responseSecond.status).toEqual(responseFirst.status);
    });
  });
});
```

## .antipattern

```ts
// ⛔ bad - redundant api calls for each assertion -> useThen instead
when('[t0] operation is executed', () => {
  then('it returns expected output', async () => {
    const result = await expensiveOperation({ input }); // call 1
    expect(result.output).toBeDefined();
  });

  then('it returns expected metrics', async () => {
    const result = await expensiveOperation({ input }); // call 2 (redundant!)
    expect(result.metrics.tokens).toBeGreaterThan(0);
  });
});

// ⛔ bad - let declaration to share between when blocks -> useWhen instead
let responseFirst: Response;
when('[t1] registration is called', () => {
  then('it succeeds', async () => {
    responseFirst = await registerUser({ email }); // side effect via let
  });
});
when('[t2] registration is repeated', () => {
  then('it is idempotent', async () => {
    const responseSecond = await registerUser({ email });
    expect(responseSecond.id).toEqual(responseFirst.id); // depends on side effect
  });
});
```

## .when to use

| scenario                                    | use                   |
| ------------------------------------------- | --------------------- |
| share async result across `then` assertions | `useThen`             |
| track change over sequential actions        | `useWhen` + `useThen` |
| idempotency verification                    | `useWhen` + `useThen` |
| before/after state comparisons              | `useWhen` + `useThen` |
| integration tests with api calls            | `useThen`             |

## .note

- `useThen` creates a test block that appears in output (e.g., "✓ then: it succeeds")
- `useWhen` wraps a `when` block at the `given` level, returns result for sibling `when` blocks
- use `useThen` inside `useWhen` to capture async operation results
- both return a proxy that defers access until test execution
- `useWhen` enables comparison of results across time steps without `let` mutations
