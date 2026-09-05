## .what

add a rule to the behaver's practices: **when a peer-review level runs short of budget, add budget only to the LATEST engaged layer. never to l1.**

l1 is expected to be somewhat spurious. it is the wide, cheap, small-brain sweep — its value is breadth of lens, not precision of verdict. so l1 is meant to reach terminal (approved or exhausted) and hand off. budget spent to make l1 converge is spent against a signal that was never designed to converge.

## .why — measured, not theorized

from `ehmpathy/rhachet-brains-anthropic` behavior `v2026_08_31.feat-frontier-claude-models`, a drive that ran l1 to 15/15 across ~12 review rounds.

**l1's budget was extended twice (11 -> 15) and the extensions bought little.** the last rounds of l1:

| round | l1 blockers | what the reports actually said |
|---|---|---|
| i021 | 2 | both = the same red acceptance clamp |
| i023 | 6 | **all six = the same red acceptance clamp**, cited under six different rules |
| i024 | 2 | 7 approved, 2 on the clamp |
| terminal | 2 | r8 + r9 exhausted on the clamp |

the i023 -> i024 jump is the tell. the count went 2 -> 6 -> 2 while the tree only improved. a read of all six i023 reports found **zero distinct findings** — every lens named one item (a credit-balance gate on an acceptance test), each under its own rule name. the count was noise; the substance was flat.

**and the one l1 nitpick that got repaired had a FALSE PREMISE.** r1 and r2 both re-raised, across i011-i023, that three assertions should share a `useThen` capture because *"every assertion reads only `error.message` — a plain string property access the deferred proxy supports."* applied as written, **nine assertions went red with `Received: undefined`.**

the real mechanism (`test-fns/dist/domain.operations/useThen.js:31-37`): the proxy's `get` trap is DELETED once the capture resolves, so later reads hit a copy made by `Object.assign` — which copies **enumerable** own properties only. `Error#message` is own but **non-enumerable**. so the constraint is **enumerability**, not value type. twelve rounds of l1 argued the wrong axis on both sides (reviewers: "string, so safe"; code comments: "`toBeInstanceOf`, so unsafe").

that is the shape of l1 value: it points at a thin spot, and it is often wrong about why. worth one pass. not worth extra budget to converge.

## .the rule to write

- **add budget only to the latest engaged layer.** if l3 is engaged, `--for review --add N` targets l3. l1 has already served its purpose.
- **l1 is expected to be somewhat spurious** — a repeated l1 blocker is a prompt to read, not a verdict to satisfy.
- **let l1 exhaust.** exhaustion is terminal and unlocks the next level; it is a legitimate outcome, not a failure, provided the record of attempts is written (`rule.always.converge-to-terminal`).
- **do not read an l1 count as a measure of tree quality.** count the distinct findings across the reports, not the tallies.

## .the trap worth a mention in the rule

exhaustion is recognized **one arrive LATE**. the arrive that spends the last budget still shows the lenses as `rejected` and the next level as `awaits l1 terminal`. the NEXT arrive — free, every lens cached — flips them to `exhausted / terminal` and engages the next level on its own.

so a driver who stops at the drain pass concludes the ladder is stuck when it is one no-op arrive away. that is exactly the moment someone reaches for more l1 budget, which is the move this rule forbids.

## .provenance

drive: `ehmpathy/rhachet-brains-anthropic` @ `beav/feat-frontier-claude-models`
yield: `.behavior/v2026_08_31.feat-frontier-claude-models/5.1.execution.from_vision.yield.md` (sections i020-i027)
requested by: human, 2026-09-03
