# task.bhrain — auto-spawn a read-only reflector when a stone stops converging

**repo:** `ehmpathy/rhachet-roles-bhrain`
**severity:** nitpick — an amplifier, not a defect. it does not fix a broken loop; it shortens
how long a broken loop runs unexamined.

**companion to:** `task.bhrain.contemplation-gate-on-entrance.md` (the root-cause fix). that task
closes the door this task would have found. **dispatch that one first** — this is the detector
for the next unknown mechanism, not for the one already diagnosed.

## .what

when a stone stops converging, the route should **halt and enroll a read-only reflector** on the
route itself, rather than continue to re-roll and let a human notice days later.

the reflector reads the route dir, the guard, `passage.jsonl`, the review corpus, and the engine
source. it answers three questions and writes a handoff. it drives no stone.

## .why — the observed cost

drive: `ehmpathy/rhachet-brains-anthropic` @ `beav/feat-frontier-claude-models`, stone
`5.1.execution.from_vision`.

| measure | value |
|---|---|
| iterations before a human intervened | **32** |
| elapsed | ~9 days |
| stop-hook report | *"stuck on stone 5.1.execution.from_vision after 319 attempts"* |
| a reflector was enrolled on | **day 9** |
| time for that reflector to find the root cause | **one session** |
| every fact it used was on disk by | **day 2** |

the root cause (a contemplation gate wired to the exit but never the entrance) sat in
`node_modules/rhachet-roles-bhrain/dist/` the whole time. the taken-count was zero from i001. the
blocker walk was flat from i005. **the evidence never improved after day two; only the cost did.**

### why the driver could not find it

this is the load-bearing argument for the role split, and it is structural rather than a matter
of driver skill:

1. **the driver is inside the loop.** it is the subject of the reviews it would have to audit.
2. **the guard's own framing points away from the machinery.** six self-reviews open with *"our
   systems have detected that a junior touched this pr… they may have introduced bad practices."*
   that is an instruction to look at the **code**, re-issued every round. the failure was in the
   **engine grading the code**.
3. **the driver's rules tell it to converge, not to audit.**
   `rule.always.converge-with-reviewers` is correct and it is exactly what kept the driver in the
   loop: *"you do not stop at the block."* a driver obeying its rules cannot conclude the rules
   are the problem.

so the reflector must be a **separate enrollment without the driver role** — not the driver in a
different mood.

## .the trigger

fire on **non-convergence**, not on iteration count alone. a high count on a stone that is
steadily improving is healthy work.

proposed condition (all must hold):

- ≥ K consecutive **distinct** artifact hashes at one stone (suggest K=4)
- with no strict decrease in blocker count across them
- and the stone is not `passed` / `diverged` / awaiting a declared human gate

**distinct hashes, not iterations** — `passage.jsonl` shows i012/i013 and i022/i023 sharing a
hash (a level-1 → level-3 progression on an unchanged tree). that is normal ladder motion, not
churn. counting iterations would fire on healthy stones.

the data is already on disk: `passage.jsonl` holds every `blocked … (N > 0)` tally, and the hash
is in each review filename (`…i014.04e073f5be8f982fe1.r006…`).

## .the reflector's brief

three questions, fixed. they are what produced a usable diagnosis in one session:

1. **why has this not converged?** name the *mechanism*, not the symptom — specifically, what
   makes iteration N+1 no more likely to pass than iteration N.
2. **what would fix it, and where does the fix belong** — this tree, the guard, or the upstream
   template it was stamped from?
3. **what signal would have caught this on day one?** a detector, not a discipline.

with three mandates:

- **read the engine, not only the artifacts.** the root cause was in
  `node_modules/rhachet-roles-{bhrain,bhuild}/dist/domain.operations/**`. a read of the review
  corpus alone yields plausible, wrong stories — the day-9 reflector produced four such stories
  before it read the source (see `.caveats`).
- **state confidence per claim, and name the files NOT read.** a fair "could not determine X"
  outranks a tidy guess.
- **write a handoff to `$route/handoffs/`**, and stop.

### enrollment shape

- **no driver role.** read-only: sets no stones, runs no reviews, edits no code, touches no
  behavior artifacts.
- **`handoffs/` is outside the guard's `artifacts:` list**, so the reflector's write cannot move
  the content hash or disturb a live driver. this held in practice on the day-9 run.
- **safe to run concurrently** with the driver for the same reason.

## .what happens after

the reflector writes and stops. it does not decide. the human reads the handoff and picks:
overrule a level, re-scope the stone, dispatch an upstream fix, or resume with new instruction.

**do not auto-apply a reflector's finding.** on the day-9 run three of its first four
recommendations were wrong (below). its value was the diagnosis it reached *after* the human
pushed it to read the source — a human read the reasoning and pushed back. that loop is the
mechanism, and it should stay.

## .caveats — read before you trust this proposal

- **the trigger threshold (K=4) is a guess.** it is not tuned against a corpus of healthy stones,
  and a stone legitimately awaiting a human gate (a credential, a wisher decision) will trip any
  such counter. the `awaiting a declared human gate` exclusion above is the mitigation and it is
  unspecified — someone must define what "declared" means before this ships.
- **a reflector can be confidently wrong.** on the day-9 run the reflector's first four proposals
  were: exclude `$route/**` from peer scope (wrong — the yield is a *declared artifact*), fix the
  self-review framing (wrong — self-reviews are promise-based and cannot diverge), build a waiver
  ledger (already existed: `getStoneGuardOverruledLevels`), and latch clean verdicts (already
  existed: `runStoneGuardReviews.js:329`). each was corrected by the human. **this is the argument
  for "write a handoff, do not act."**
- **cost is real.** a reflector is a full enrollment against a large corpus. it is cheap relative
  to nine days of a stuck ladder, and expensive relative to one wasted round. the trigger must be
  conservative enough that it is the former.
- **the day-9 reflector could not read the sibling tree** (`rhachet.beav.fix-node-pty-install`,
  reported stuck the same way) — cross-repo access is hook-blocked. an auto-reflector will hit the
  same wall, so a cross-tree pattern ("two stones stuck the same way ⇒ shared upstream cause")
  stays out of reach unless the enrollment is granted a scoped read.

## .the smaller version, if this is too much

if an auto-enrollment is more than you want to build, the same value at a fraction of the cost:

**make the stop hook halt instead of narrate.** it already computed *"stuck after 319 attempts."*
that number is an alarm, and it was rendered as a note. a `diverged` status that stops the drive
and prints the three questions above — for a human to answer or to hand to a reflector manually —
captures most of the benefit with none of the enrollment machinery.

## .provenance

drive: `ehmpathy/rhachet-brains-anthropic` @ `beav/feat-frontier-claude-models`
stone: `5.1.execution.from_vision` (32 iterations, ~9 days, 319 stop-hook attempts)
evidence: `.route/passage.jsonl`, the `.reviews/peer` corpus,
`node_modules/rhachet-roles-bhrain/dist/domain.operations/route/**`
authored by: reflector (read-only enrollment, day 9), 2026-09-03
requested by: human, for upstream dispatch
