# Coverage matrix — `legal-hold`

- **Pattern:** `atoms/compliance/legal-hold.md`
- **Model:** `legal-hold.tla` + `legal-hold-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 4 (concurrent holds independent — releasing one hold does not affect any other hold on the same record); Invariant 6 (temporal ordering — `released_at ≥ placed_at`)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/compliance/legal-hold.tla` → `PASS` ☐ *(prior: 27 states)*
- Buggy twin: `node check.mjs ../../atoms/compliance/legal-hold-buggy.tla --buggy` → `PASS` (rejected) ☐ *(prior: rejected at 12 states — place 2 holds, release one → the other Released without its own action)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Hold immutability | no | by-construction | The model has no action that modifies `hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, or `case_ref` — these fields are not modeled as state variables (acknowledged: "NOT MODELED: id discipline, attribution fields"). Mutation is structurally absent. |
| Invariant 2 — Membership exclusivity | no | by-construction | Each hold slot is `{none, Active, Released}` — exactly one value at all times. A tripartite enum is exclusive by definition; no invariant asserts it explicitly, but the `HoldState` type makes overlap impossible. |
| Invariant 3 — Terminal absorption | no | by-construction | `Release` transitions `Active → Released` only; no re-activate action exists. Terminal absorption is structurally guaranteed. |
| Invariant 4 — Concurrent holds are independent | YES | **covered** | `Inv_HoldIndependence == \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]` — asserted directly. Ghost `releasedByOwn[k]` is `TRUE` only if hold `k` was the explicit target of a `Release` action. The buggy twin demonstrates cascade release violates this. |
| Invariant 5 — Release attribution is complete | no | out-of-scope (attribution fields not modeled — "NOT MODELED: attribution fields") | — |
| Invariant 6 — Temporal ordering | YES | **GAP** | The model has no clock, no `placed_at`, and no `released_at` variables. `released_at ≥ placed_at` — the second formal-layer vote claim — is entirely absent. The model checks hold independence but nothing about temporal ordering of placement vs. release timestamps. The `release` Decision point's enforcement of the `≥ placed_at` bound (including the clock-skew case for defaulted `released_at`) is not verified. |
| Invariant 7 — Placement attribution is complete | no | out-of-scope (attribution fields not modeled) | — |
| Invariant 8 — Hold store durability | no | out-of-scope (storage durability; not a state-machine property) | — |

## Step 3 — bound saturation

- At `MaxH=3`: 27 states (per Lineage) — 3^3 = 27 total configurations of 3 holds × 3 states each; all reachable. Saturated for the hold-independence claim. The temporal-ordering claim (Invariant 6) is not modeled; saturation on that dimension is moot until the GAP is closed.

## Outcome

- GAP rows: **Invariant 6 — Temporal ordering** is a formal-layer vote claim (load-bearing) and is entirely absent from the model. The model has no clock or timestamp variables; `released_at ≥ placed_at` is not checkable from the current model structure. The spec's Refinement round 3 specifically fixed the enforcement of this bound against the resolved `released_at` (including wall-clock-defaulted values) — a non-trivial correctness property the model does not verify. **Route as a finding; blocks fully clean coverage.**
- by-construction flags on load-bearing invariants: none (Invariant 4 is properly asserted)
- Result: **findings routed — Invariant 6 GAP.** — Coverage cross-check 2026-06-03.
