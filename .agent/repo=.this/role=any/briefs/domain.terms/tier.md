# tier

## .the term

**tier** (dobj, `[noun]`) — a capability class of claude model, named by the vendor and stable
across model generations: `haiku`, `sonnet`, `opus`, `fable`.

it is the **second** segment of an atom slug: `claude/{tier}/{rung?}`.

## .the etymology

the vendor names these four classes and orders three of them by capability (haiku → sonnet →
opus), so "tier" reads directly: a level in an ordered set.

⚠️ the order is **not total**. `fable` sits above opus on raw capability but is not a rung on the
same axis — the vendor recommends opus for agentic work and fable for "highest available
capability" at twice the rate. so tier names a *class*, and only the first three form a ladder of
cost-vs-capability.

## .rejected alternatives

| word | why not |
|---|---|
| **family** | the repo's own `define.brain-config-pattern` brief uses it for atoms — but that same brief uses **capability** for the identical axis on repls, so there is no single extant canonical to defer to. "family" also implies kinship across versions, which is the *rung* axis, not this one |
| **capability** | used by the brief for repls. it names the axis by what varies, not by what the member is, and it reads as a scalar rather than a set member |
| **variant** | used in five extant docstrings, but loosely — it covers *any* slug choice, across both this axis and the rung axis. too coarse to name one axis |
| **model** | already taken: `config.model` is the vendor's api id (`claude-opus-5`) |

**note the extant state is not a single convention to defer to.** `define.brain-config-pattern`
declares two slug shapes, and each of the two axes gets a different word in each shape:

| axis | atoms — `{repo}/{family}/{version?}` | repls — `{repo}/{capability}/{variant?}` |
|---|---|---|
| **tier — 2nd segment (this brief's axis)** | **family** | **capability** |
| rung — 3rd segment | **version** | **variant** |

⚠️ the full four-word grid is reproduced here on purpose. a reader who meets only the top row sees
two words and may take them for the brief's whole vocabulary — and `rung.md` quotes only the bottom
row, so the two briefs would read as though they contradict each other. they do not; they cite
**different axes**. this brief owns the top row; `rung.md` owns the bottom.

## .the evidence

**dimensional decomposition.** the slug space is the product of two orthogonal axes:

| | v3.5 | v4 | v4.5 | v4.6 | v4.7 | v4.8 | v5 |
|---|---|---|---|---|---|---|---|
| haiku | ✅ | — | ✅ | — | — | — | — |
| sonnet | — | ✅ | ✅ | ✅ | — | — | ✅ |
| opus | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| fable | — | — | — | — | — | — | ✅ |

the walk proves the axes are genuinely orthogonal (each cell is independently present or absent)
and that the grid is **ragged** — which is the invariant below.

## .invariants

- a tier is one of exactly four values; a slug that names a fifth is invalid
- **the grid is ragged, not full.** a `{tier} × {rung}` cell may be empty. do NOT declare a slug to
  fill a gap — a slug must name a model the vendor serves
- the bare `claude/{tier}` slug is an alias that tracks the newest rung of that tier, so it MOVES

## ⚠️ .open — a term proposal, not a settled term

this proposes **tier** as the one canonical word for this axis, and asks that
`define.brain-config-pattern` be converged from **family** / **capability** onto it.

that brief was not touched by this change, so it is not converged here (scouts-honor is bounded to
what a change touches). the proposal is on the record for the wisher.

## .see also

- `rung.md` — the other axis of the slug
- `define.brain-config-pattern` — the brief that holds the extant `family` / `capability` phrasing
