# rung

## .the term

**rung** (dobj, `[noun]`) — one released generation of a model within a tier: `v3.5`, `v4`,
`v4.5`, `v4.6`, `v4.7`, `v4.8`, `v5`.

it is the **third**, optional segment of an atom slug: `claude/{tier}/{rung?}`. omit it and the
slug is an **alias** that tracks the newest rung of its tier.

## .the etymology

a rung is a step on a ladder — ordered, discrete, and with gaps possible if a step is absent. all
three properties hold here, and each one carries weight:

- **ordered** — v4.5 precedes v4.6 precedes v5
- **discrete** — a rung names exactly one vendor model id
- **gapped** — sonnet has no v4.7; haiku stops at v4.5. the ladder is ragged

## .rejected alternatives — and why the strongest one loses

| word | why not |
|---|---|
| **version** ⚠️ | the extant brief's word, and the sharpest candidate. it loses on **ambiguous overload** (`rule.forbid.term.addition.ambiguous`): this package's own release version is under active discussion in the same breath as the model version — "is the alias move a minor or a major?" alongside "does the alias move from v4.5 to v5?". one word for a package release and a model generation invites exactly the misread that debate cannot afford |
| **variant** | the extant brief's word for repls. too coarse — it covers the tier axis as well |
| **generation** | accurate, but long, and it reads as a cohort ("the 5-gen") rather than as a single selectable step |
| **release** | collides with the package release, same as "version" |

**note the extant state is not a single convention to defer to.** `define.brain-config-pattern`
declares two slug shapes, and each of the two axes gets a different word in each shape:

| axis | atoms — `{repo}/{family}/{version?}` | repls — `{repo}/{capability}/{variant?}` |
|---|---|---|
| tier — 2nd segment | **family** | **capability** |
| **rung — 3rd segment (this brief's axis)** | **version** | **variant** |

so this axis alone already carries two words, and a canonical choice must be made regardless of
which one wins; there is no untouched status quo.

⚠️ the full four-word grid is reproduced here on purpose. a reader who meets only the bottom row
sees two words and may take them for the brief's whole vocabulary — and `tier.md` quotes only the
top row, so the two briefs would read as though they contradict each other. they do not; they cite
**different axes**. `tier.md` owns the top row; this brief owns the bottom.

## .the evidence

**why "rung" is not merely a rename.** the metaphor carries an invariant the flat words do not.

a `Record<Slug, Config>` invites the reader to see a full `{tier} × {version}` grid, and the grid
is ragged. a contributor who reads "version" has no cue against the tidy move of a
`claude/sonnet/v4.7` entry to even the shape out. that slug would type-check, register, ship, and
404 at runtime in a caller's repo — the exact defect class this behavior exists to clean up.

"rung on a ladder" makes an absent step legible as a normal property rather than an oversight. the
term is chosen for the misread it forecloses.

**and the cost of a wrong pin.** a rung is not only an id — it carries a behavior profile. the
boundary between manual extended thought and default-on adaptive thought falls between **v4.5 and
v4.6**, not at v5. so "pin one rung back" from v5 lands on v4.6, which thinks by default exactly
like v5 at a 50% higher rate. only v4.5 changes the behavior, and it gives up the 1M context to do
it. a rung is a real choice, not a version bump.

## .invariants

- a rung slug names exactly one vendor model id, and that id is pinned by the vendor
- **a rung must name a model the vendor serves.** do not declare a slug to fill a grid gap
- a rung retired first-party may still be served on a partner platform — mark it `deprecated`
  rather than delete it, since an injected client still reaches it
- a rung slug never moves; only the bare tier alias moves

## ⚠️ .open — a term proposal, not a settled term

this proposes **rung** as the one canonical word for this axis, and asks that
`define.brain-config-pattern` be converged from **version** / **variant** onto it.

that brief was not touched by this change, so it is not converged here. the proposal is on the
record for the wisher.

## .see also

- `tier.md` — the other axis of the slug
- `define.brain-config-pattern` — the brief that holds the extant `version` / `variant` words
