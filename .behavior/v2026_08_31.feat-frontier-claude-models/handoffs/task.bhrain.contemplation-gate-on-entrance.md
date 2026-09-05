# task.bhrain — gate peer-review re-runs on contemplation debt

**repo:** `ehmpathy/rhachet-roles-bhrain`
**severity:** blocker — this is the root cause of a 9-day, 32-iteration non-convergent stone

## .what

**the invariant, stated plainly:**

> it must be impossible to run another round of peer review while any prior blocker-bearing
> given is unanswered.

today it is possible, and a stone ran **28 iterations with zero `.taken` files written**.

two defects compose to allow it:

| # | defect | file |
|---|---|---|
| **D1** | the contemplation gate is on the **exit**, never the **entrance** | `runStoneGuardReviews.js` |
| **D2** | contemplation debt is keyed `(slug, hash)`, so any code edit discharges it | `getRouteGuardReviewPeerContemplationStatus.js:64` |

each alone is survivable. together they open a door where the driver can leave the
conversation without replying, indefinitely.

---

## .the evidence

### D1 — the gate is never consulted before a re-run

`getStoneGuardReviewPeerUncontemplatedUnforgiven` is the single source of truth for "who still
owes a `.taken`". its consumers:

- ✅ `setStoneAsPassed.js`
- ✅ `setStoneAsOverruled.js` / `setStoneAsForced.js` (admin short-circuits)
- ✅ `getRouteDriveBlockerMessage.js` (display)
- ❌ **`runStoneGuardReviews.js` — never calls it**

so `route.guard` re-runs all N reviewers on a fresh hash with every prior blocker unanswered.
the gate does not bite until the driver attempts passage.

### D2 — and by then the debt is gone

`getRouteGuardReviewPeerContemplationStatus.js:64-68` reads givens at `hashCurrent` **only**.
its docstring states the intent:

> *"givens are filtered to the CURRENT iteration hash so a stale prior-iteration given can
> never block forever"*

combined with `computeStoneReviewInputHash.js:53-64` — which hashes the **entire** `artifacts:`
set (`src/**/*` plus the yield) — **one line changed anywhere retires every outstanding debt.**

three ways an unanswered blocker dies silently:

1. reviewer re-runs at H2 and stochastically does not re-raise it → debt gone, never answered
2. reviewer is **exhausted** (`runStoneGuardReviews.js:369`) → no given at H2 → no debt.
   this makes the "manufactured exhaustion" that `rule.always.converge-to-terminal` names a
   defect **structurally free**
3. reviewer re-runs clean → legitimate discharge (the only one of the three that should count)

the obligation to answer is contingent on the **critic's re-detection**, not on the driver's
engagement. that is backwards, and it directly contradicts
`rule.always.converge-with-reviewers`: *"in every branch you write a `.taken` and re-submit.
you do not stop at the block."*

### the observed consequence

drive: `ehmpathy/rhachet-brains-anthropic` @ `beav/feat-frontier-claude-models`,
stone `5.1.execution.from_vision`.

| measure | value |
|---|---|
| iterations at stone 5.1 | **32** |
| elapsed | ~9 days (2026-08-31 → 2026-09-03) |
| `.given.by_peer` files | 282 at i024, ~300+ by i032 |
| **`.taken.by_self` files for i001–i028** | **zero** |
| first `.taken` | **i029** |
| blocker counts per round (`.route/passage.jsonl`) | `4,3,2,1,2,1,3,4,1,1,1,2,4,2,6,6,2,2,2,1,3,4,2,2,1` — stationary, never 0 |

**the transport was never the problem.** `enumRouteGuardReviewPeerConversationFiles.js:28-44`
correctly unions givens + `.report.md` detail + takens. there were simply no takens to send.

**and the proof of the fix is in the same tree.** at ~i029 the code settled, the hash stopped
churning, the exit gate finally bit, takens got written — and `i032 r010` reads:

> *"converged: 2 blockers → 1, and the one left is money"*

the moment the conversation actually happened, it converged in three rounds.

---

## .the fix

two changes. **they are a pair — either alone is toothless.**

### fix 1 — gate the entrance (D1)

at the top of `runStoneGuardReviews`, before any reviewer runs:

```
debt = getStoneGuardReviewPeerUncontemplatedUnforgiven({ stone, route })
if (debt.length > 0):
    emit formatRouteGuardReviewPeerContemplatePrompt({ case: 'reply-prompt', ... })
    run ZERO reviewers, spend ZERO budget
```

pure wiring — the operation exists, is unit-tested via `computePeerUncontemplatedUnforgiven`,
already handles overrule-forgiveness (design-note B6), and the prompt formatter already renders
all three cases (`reply-prompt` / `absent` / `stale`).

### fix 2 — carry debt across hashes (D2)

key debt by **slug**, not `(slug, hash)`:

> for each reviewer, take its **latest** given. if that given has `blockers > 0`, a `.taken` at
> that given's hash-or-later is owed.

discharge stays exactly two paths, both explicit:

- the driver writes the `.taken` (the articulation)
- **the same reviewer** later returns `blockers: 0` (critique withdrawn at source)

editing code is no longer a discharge.

**touch points:** `getAllRouteGuardReviewPeersUncontemplated.js` (the pure diff) and
`getRouteGuardReviewPeerContemplationStatus.js` (swap `getAllRouteGuardReviewPeerGivensAtHash`
for a latest-per-slug read). the prompt formatter, `--as contemplated`, `setStoneAsPassed`, and
the overrule valve all consume the diff and need no change.

---

## .why this does not deadlock

the hash filter exists so *"a stale prior-iteration given can never block forever."* under
slug-keying it still cannot:

| the given | outcome |
|---|---|
| superseded by a clean re-run of that reviewer | auto-discharged, no taken needed |
| superseded by a fresh blocker from that reviewer | one debt at the newer hash — the extant `stale` prompt already handles this exactly |
| reviewer exhausted, blocker outstanding | **now persists** — driver must answer, or human overrules |

that last row is the behavior change and it is the point.
`getStoneGuardOverruledLevels` is already the escape valve, it is already level-scoped, and it
is **human-gated** — which is where a genuinely unanswerable blocker belongs (see the V5
credit-gate case in the drive above: a billing gate no code change could close).

---

## .the second-order effect

today the driver has two exits from a blocking review — write a `.taken`, or edit code and hope
the finding does not return. **editing is strictly cheaper and feels equally legitimate.** so the
driver edits; the whole-tree hash moves; every cached clean verdict is invalidated
(`runStoneGuardReviews.js:329`); all N reviewers re-roll; repeat.

close the second exit and the incentive inverts: answer the reviewer, because you can no longer
outrun it. that is what `rule.always.converge-with-reviewers` already asks for, and what the
hash filter quietly un-asks.

---

## .related, lower priority

surfaced during the same investigation. **not** required for this fix; do not let them expand scope.

1. **per-reviewer cache keys.** `computeStoneReviewInputHash` hashes the whole artifact set, so
   `arch-smell-scopeleaks`'s clean verdict dies when the yield's todo list changes — a file its
   own rule does not govern. observed: `i021 r005` = `0 blockers / 0 nitpicks`, then
   `i024 r005` = 1 nitpick, on a rule-irrelevant hash change. `input.scope.json` already records
   each reviewer's exact `targetFiles`; hashing that instead would preserve most clean verdicts.
2. **divergence terminal.** after K consecutive distinct hashes with no strict decrease in
   blockers → `diverged`, escalate to human rather than re-roll. a backstop; fix 1+2 removes most
   of what it would catch.
3. **stone-level iteration cap.** `budget` bounds a *reviewer*; no bound exists on the *stone*.
4. **route artifacts as review targets.** `0.wish.md` and `1.vision.yield.md` are `targetFiles`
   for peer reviewers at stone 5.1 — stone 5.1 grades the frozen outputs of stone 1, which
   already passed. consider demoting them to `--refs`. (the execution yield is legitimately a
   target — it is 5.1's deliverable.)

---

## .caveats on this analysis

stated so the implementer can re-check rather than trust:

- `getAllRouteGuardReviewPeerGivensAtHash` was **not read** — it is a communicator, and whether a
  latest-per-slug read is a small change to it or a new operation beside it is unscoped here.
- the sibling tree `rhachet.beav.fix-node-pty-install` (reported stuck the same way at i026 on
  its own 5.1) was **not read** — cross-repo access was blocked. the mechanism identified here is
  template/engine-level so it *should* reproduce, but that is inference, not observation.
- two `malfunction` entries and two `no review files found for hash` entries in `passage.jsonl`
  were not investigated. they cost iterations but are not the mechanism.

## .provenance

drive: `ehmpathy/rhachet-brains-anthropic` @ `beav/feat-frontier-claude-models`
stone: `5.1.execution.from_vision`
evidence read: `runStoneGuardReviews.js`, `getStoneGuardLevelState.js`,
`getRouteGuardReviewPeerContemplationStatus.js`, `getAllRouteGuardReviewPeersUncontemplated.js`,
`getStoneGuardReviewPeerUncontemplatedUnforgiven.js`, `getRouteGuardReviewPeerPathTaken.js`,
`enumRouteGuardReviewPeerConversationFiles.js`, `enumRouteGuardReviewPeerFiles.js`,
`computeStoneReviewInputHash.js`, `getStoneGuardOverruledLevels.js`,
`setStoneAsContemplated.js`, `formatRouteGuardReviewPeerContemplatePrompt.js`,
`rule.always.converge-with-reviewers.md`, `.route/passage.jsonl`,
`.log/bhrain/review/2026-09-03T04-27-58-234Z/input.scope.json`, and the `.reviews/peer` corpus.
authored by: reflector (read-only enrollment), 2026-09-03
requested by: human, for upstream dispatch
