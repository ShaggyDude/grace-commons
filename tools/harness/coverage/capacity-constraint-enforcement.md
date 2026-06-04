# Coverage matrix — `capacity-constraint-enforcement`

- **Pattern:** `atoms/resource-lifecycle/capacity-constraint-enforcement.md`
- **Model:** `capacity-constraint-enforcement.tla` (+ buggy twin `capacity-constraint-enforcement-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 4 (bounded arithmetic `allocated ≤ capacity` under serializable concurrency), Invariant 5 (non-negativity), Invariant 14 (action atomicity)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/resource-lifecycle/capacity-constraint-enforcement.tla` → `PASS` ☐ *(per Lineage: 7 states, all invariants hold)*
- Buggy twin: `node check.mjs ../../atoms/resource-lifecycle/capacity-constraint-enforcement-buggy.tla --buggy` → `PASS` (rejected) ☐ *(per Lineage: rejected at 27 states)*

## Step 2 — coverage matrix

The spec has 14 invariants. The model explicitly scopes to the load-bearing arithmetic claim (Inv4, Inv5) under concurrent allocation; lifecycle actions (`release`, `adjust_capacity`, `suspend`, `resume`, `close`) and audit-log invariants are out of model scope per the model header.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Pool record permanence | No | out-of-scope (no pool lifecycle modeled; fixed capacity, no close/purge action) | Model focuses on allocate concurrency only. |
| Invariant 2 — State membership exclusivity | No | out-of-scope (no state machine modeled) | Pool state (Open/Suspended/Closed) not in scope. |
| Invariant 3 — Closed is absorbing | No | out-of-scope (no close action modeled) | Explicitly excluded per model header. |
| Invariant 4 — Capacity constraint (`allocated ≤ capacity`) | YES | covered | `Inv4_CapacityConstraint == allocated <= Capacity`; checked under every interleaving of `Workers` concurrent atomic allocations. |
| Invariant 5 — Non-negativity (`allocated ≥ 0`) | YES (vote) | covered | `Inv5_NonNegativity == allocated >= 0`; trivially held here since no release is modeled, but the predicate is present. Note: release-path non-negativity (the harder case) is not exercised — see GAP note below. |
| Invariant 6 — Capacity non-negativity (`capacity ≥ 0`) | No | out-of-scope (capacity is a fixed constant `Capacity`; no `declare_pool` or `adjust_capacity` modeled) | Acceptable: not load-bearing per vote. |
| Invariant 7 — Declaration fields immutable | No | out-of-scope (structural; no declare/adjust modeled) | Acceptable. |
| Invariant 8 — Audit-log two-surface split | No | out-of-scope (audit log not modeled; per model header) | Named explicitly out of scope. |
| Invariant 9 — Audit-log append-only | No | out-of-scope (audit log not modeled) | Named explicitly out of scope. |
| Invariant 10 — State-change events auditable | No | out-of-scope (no state changes modeled) | Named explicitly out of scope. |
| Invariant 11 — Capacity-adjustment events auditable | No | out-of-scope (no adjust_capacity modeled) | Named explicitly out of scope. |
| Invariant 12 — Id stability | No | out-of-scope (no id model; per model header) | Named explicitly out of scope. |
| Invariant 13 — No id reuse | No | out-of-scope (no id model) | Named explicitly out of scope. |
| Invariant 14 — Action atomicity | YES (vote) | out-of-scope (within-action obligation; named as separate host obligation, not an interleaving claim) | Per model header: "Crash atomicity (Inv 14) — a within-action obligation, not an interleaving one." The model demonstrates *why* atomicity is needed (buggy non-atomic twin reachably violates Inv4), but does not itself check Inv14 as a state predicate. **Flag: load-bearing per vote, but treated as out-of-scope by construction argument.** |

### GAP assessment

**Invariant 5 (non-negativity) — partial coverage.** The model asserts `allocated >= 0` but models only `allocate` (increments). The release-path precondition (`count ≤ allocated`) is where non-negativity is actually at risk. Without a `release` action in the model, the Inv5 check is trivially satisfied and does not exercise the real guard. This is a **coverage gap on Inv5's release path**, though Inv5 itself is checked and the vote flag on it reflects the allocate-side. Low severity given release is simpler than allocate, but the gap is real.

**Invariant 14 (action atomicity) — by construction / out-of-scope.** The formal-layer vote named Inv14 as load-bearing, but the model treats it as a host obligation (out-of-scope). The buggy twin demonstrates the atomicity *need* but no state predicate directly checks that the audit-log append and running-total update are co-committed. This is a modeling scope decision, not an error, but should be flagged.

## Step 3 — bound saturation

Per Lineage: `Capacity=2`, `Workers={w1, w2, w3}` → 7 reachable states. Three workers, two capacity units — more workers than capacity, so the bound binds. Adequate for the concurrency claim; trivially saturated at these bounds.

## Outcome

- GAP rows: **Invariant 5 (non-negativity) — release path not exercised** (partial coverage; allocate-only model makes the check trivially true for the release case). **Invariant 14 (action atomicity) — load-bearing per vote, held out-of-scope.** Both should be routed as findings.
- by-construction flags on load-bearing invariants: Invariant 14 is load-bearing and out-of-scope rather than by-construction strictly, but the effect is the same — no state predicate asserts it.
- Result: **two findings to route**: (1) Inv5 release-path gap — add a `Release` action to the model so non-negativity is checked where the real risk lies; (2) Inv14 out-of-scope justification is sound but the vote should be revisited to clarify whether Inv14's within-action atomicity is intended for a different verification tool (e.g., Alloy structural check) or simply accepted as a host obligation not modeled.
