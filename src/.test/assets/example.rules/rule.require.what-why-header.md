# rule.require.what-why-header

## .what

every exported operation must carry a `.what` and a `.why` in a jsdoc header.

## .why

a reader needs the intent before the mechanism.

## .enforcement

an exported operation with no `.what`/`.why` header = nitpick

## .note

⚠️ this rule exists ONLY as a fixture for `reviewRoundTrip.acceptance.test.ts`. it is
deliberately tiny and deliberately mild — the clamp asserts that `rhx review --brain
anthropic/claude/<slug>` completes and emits its numeric-count contract, NOT that any
particular verdict is reached. a rule that graded harshly would tie the clamp to model
judgment, which is exactly what the assertion avoids.
