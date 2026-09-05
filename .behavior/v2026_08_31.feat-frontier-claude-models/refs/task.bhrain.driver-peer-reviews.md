## .what

two rules for the driver, on how to drive through peer reviews.

1. **add budget only to the latest engaged layer.**
2. **push back when a reviewer is non-convergent or spurious** — do not repair a verdict its own report does not support.

both are drawn from one drive that ran the full ladder to terminal, with measurements below.

---

## rule 1 — budget goes to the latest engaged layer

when a level runs short of budget, `--for review --add N` targets the **latest engaged** layer. never a lower one.

l1 is the wide, cheap, small-brain sweep. its value is breadth of lens, not precision of verdict, and it is expected to be somewhat spurious. it is meant to reach terminal (approved or exhausted) and hand off. budget spent to make l1 converge is spent against a signal that was never designed to converge.

**the trap:** exhaustion is recognized **one arrive LATE**. the arrive that spends the last budget still shows the lenses as `rejected` and the next level as `awaits l1 terminal`. the NEXT arrive — free, every lens cached, since reviewers re-run only on a tree change — flips them to `exhausted / terminal` and engages the next level on its own.

so a driver who stops at the drain pass concludes the ladder is stuck when it is one no-op arrive away. that is exactly the moment someone reaches for more l1 budget, which is the move this rule forbids.

---

## rule 2 — push back on a non-convergent or spurious reviewer

`rule.always.converge-with-reviewers` says to converge: fix the code, or articulate why it holds. it also says an articulation persuades through evidence. this rule names the case where **neither move is available**, because the verdict does not track the tree — and says what to do instead.

### the two detection tests

**test A — the tally contradicts its own prose.** per `contract.reviewer-output`, the two numeric lines must tally EVERY item **by its severity as written**. so read the report, count the items the report itself labels blocker, and compare to the number it emitted. two real cases from one drive:

- a reviewer whose bottom line read *"**None block on architecture grounds**"* — every item self-labeled `nitpick`, *"not a defect"*, *"a named tradeoff"*, or *"a boundary condition rather than a new defect"* — and which then tallied **2 blockers**. no item in the report was labeled a blocker. the count had no referent in the prose that produced it.
- a reviewer whose summary read *"the review process converged"*, which named **two** items (one self-labeled *"Friction hazard"*, one *"nitpick, blocker-adjacent"*) and tallied **3 blockers**.

**test B — the count is non-monotonic while the tree only gains.** track the counts across rounds against what actually changed:

| round | r10 | r11 | what the tree gained |
|---|---|---|---|
| i025 | 1 blocker | **0 — approved** | baseline |
| i026 | 1 blocker | **2 blockers** | + a failhide guard, its clamp, yield prose |
| i027/28 | **3 blockers** | 1 blocker | + a guard anchored to a structural derivation, a ladder-wide sweep |

r11 **approved** the i025 tree, then rejected a strict superset of it — a superset whose one addition r11 itself verified as *"fixed, verified via direct read."* no tree change can answer a signal that moves like that.

### what to do

- **do not repair to satisfy an unsupported count.** a fabricated blocker has no repair; an attempt to invent one damages the tree.
- **do not concede it either.** silence reads as agreement in the record.
- **treat each item on its own merits, independent of the tally.** the reports above still produced two real defects despite wrong counts — read the items, fix what is real, and say which.
- **write the pushback into the yield**, with the quote and the count side by side, so a human can audit the judgment rather than take it on faith.
- **then let the level exhaust.** an insatiable reviewer is exactly the earned-exhaustion case `rule.always.converge-to-terminal` describes, and the pushback IS the cited record that rule demands.

### the bound — this is not a licence to dismiss

a reviewer is not spurious merely because it repeats itself, nor because you disagree. **the test is textual, not a matter of taste:** either the tally has no referent in its own prose (test A), or it moves against a tree that only gained (test B). if neither holds, the ordinary duty to converge applies in full.

and note what pushback does NOT excuse: in the drive above, both non-convergent reports still contained real defects — a name-dependence hazard in a guard, and a duplicated error string across twin modules. the count was noise; some items were not. read every one.

---

## .provenance

drive: `ehmpathy/rhachet-brains-anthropic` @ `beav/feat-frontier-claude-models`
yield: `.behavior/v2026_08_31.feat-frontier-claude-models/5.1.execution.from_vision.yield.md` (sections i024-i027)
reviewers: all `fireworks/deepseek/v4-flash`
requested by: human, 2026-09-03
