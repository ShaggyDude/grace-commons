# Coverage matrix — `legal-hold`

- **Pattern:** `atoms/legal-hold.md`
- **Model:** `legal-hold.tla` + `legal-hold-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03; GAP closed 2026-06-04
- **Formal-layer vote load-bearing claims:** Invariant 4 (concurrent holds independent — releasing one hold does not affect any other hold on the same record); Invariant 6 (temporal ordering — `released_at ≥ placed_at`)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/legal-hold.tla` → `PASS` ✓ *(370 states, MaxH=2, MaxClock=3)*
- Buggy twin: `node check.mjs ../../atoms/legal-hold-buggy.tla --buggy` → `PASS` (rejected) ✓ *(18 states — Tick→Place→Release stamps releasedAt=0 < placedAt=1; Inv_TemporalOrdering violated)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Hold immutability | no | by-construction | The model has no action that modifies `hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, or `case_ref` — these fields are not modeled as state variables (acknowledged: "NOT MODELED: id discipline, attribution fields"). Mutation is structurally absent. |
| Invariant 2 — Membership exclusivity | no | by-construction | Each hold slot is `{none, Active, Released}` — exactly one value at all times. A tripartite enum is exclusive by definition; no invariant asserts it explicitly, but the `HoldState` type makes overlap impossible. |
| Invariant 3 — Terminal absorption | no | by-construction | `Release` transitions `Active → Released` only; no re-activate action exists. Terminal absorption is structurally guaranteed. |
| Invariant 4 — Concurrent holds are independent | YES | **covered** | `Inv_HoldIndependence == \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]` — asserted directly. Ghost `releasedByOwn[k]` is `TRUE` only if hold `k` was the explicit target of a `Release` action. Still checked in `Safety` after the 2026-06-04 extension. |
| Invariant 5 — Release attribution is complete | no | out-of-scope (attribution fields not modeled — "NOT MODELED: attribution fields") | — |
| Invariant 6 — Temporal ordering | YES | **covered** (GAP closed 2026-06-04) | `Inv_TemporalOrdering == \A k \in 1..MaxH : holds[k] = "Released" => releasedAt[k] >= placedAt[k]`. Ghost `placedAt[k]` stamped with `now` on `Place`; ghost `releasedAt[k]` stamped with `now` on `Release`; global clock `now` is a monotonically-advancing Naturals counter in `0..MaxClock`. The correct model holds (370 states); buggy twin rejected by this invariant (18 states). |
| Invariant 7 — Placement attribution is complete | no | out-of-scope (attribution fields not modeled) | — |
| Invariant 8 — Hold store durability | no | out-of-scope (storage durability; not a state-machine property) | — |

## Step 3 — bound saturation

- `MaxH=2`, `MaxClock=3`: 370 states — all invariants hold.
- `MaxH=2`, `MaxClock=4`: 811 states — all invariants still hold. State count grows because more absolute timestamp combinations exist (larger `0..MaxClock` range for `now`, `placedAt`, `releasedAt`); no new behavioral patterns emerge. The temporal-ordering invariant is purely relational (`releasedAt[k] >= placedAt[k]`); all relative orderings (same-tick, one-apart, two-apart, etc.) are represented at `MaxClock=3`. The state count growing with `MaxClock` is inherent to a timestamp-stamped model, not a coverage gap.
- Saturation point for behavioral coverage: `MaxClock=3` (all hold-lifecycle interleavings with relative timestamp orderings fully represented). `MaxClock=3` is the committed bound; `MaxClock=4` confirms no new violations at higher absolute clock values.

## Outcome

- GAP rows: **none** — Invariant 6 GAP closed 2026-06-04.
- by-construction flags on load-bearing invariants: none (both Invariants 4 and 6 are explicitly asserted).
- Result: **all load-bearing invariants covered** — Coverage cross-check 2026-06-04. Both formal-layer vote claims (Invariant 4, Invariant 6) verified by named `Inv_HoldIndependence` and `Inv_TemporalOrdering` checks in `Safety`; buggy twin rejected on `Inv_TemporalOrdering`.
