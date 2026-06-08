# Coverage matrix — `capacity-constraint-enforcement`

- **Pattern:** `atoms/capacity-constraint-enforcement.md`
- **Model:** `capacity-constraint-enforcement.tla` (+ buggy twin `capacity-constraint-enforcement-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03; updated 2026-06-04 (release action added; Inv 14 vote reconsidered)
- **Formal-layer vote load-bearing claims:** Invariant 4 (bounded arithmetic `allocated ≤ capacity` under serializable concurrency), Invariant 5 (non-negativity)
- **Inv 14 reconsidered:** out-of-scope (within-action, not an interleaving) — see §Inv 14 reconsideration below

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/capacity-constraint-enforcement.tla` → `PASS` ✓ *(7 states, all invariants hold; Capacity=2 Workers={w1,w2,w3})*
- Buggy twin: `node check.mjs ../../atoms/capacity-constraint-enforcement-buggy.tla --buggy` → `PASS` (rejected) ✓ *(3 states, Inv5_NonNegativity violated — unguarded ReleaseBuggy drives allocated to -1)*

## Step 2 — coverage matrix

The spec has 14 invariants. The model now covers both the allocate-path (Inv4) and the release-path (Inv5) under concurrent interleaving; lifecycle actions (`adjust_capacity`, `suspend`, `resume`, `close`) and audit-log invariants remain out of model scope per the model header.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Pool record permanence | No | out-of-scope (no pool lifecycle modeled; fixed capacity, no close/purge action) | Model focuses on allocate/release concurrency only. |
| Invariant 2 — State membership exclusivity | No | out-of-scope (no state machine modeled) | Pool state (Open/Suspended/Closed) not in scope. |
| Invariant 3 — Closed is absorbing | No | out-of-scope (no close action modeled) | Explicitly excluded per model header. |
| Invariant 4 — Capacity constraint (`allocated ≤ capacity`) | YES | **covered** | `Inv4_CapacityConstraint == allocated <= Capacity`; checked under every interleaving of `Workers` concurrent atomic allocations. Buggy twin (TOCTOU overshoot, original twin) demonstrated the allocate guard is load-bearing; current twin isolates Inv5 violation. |
| Invariant 5 — Non-negativity (`allocated ≥ 0`) | YES (vote) | **covered** | `Inv5_NonNegativity == allocated >= 0`; now non-vacuous — `ReleaseAtomic(w)` is in scope and the buggy twin (`ReleaseBuggy` with no guard) reachably drives `allocated` to -1, proving the check has teeth. The release guard (`status[w]="allocated" ∧ allocated≥1`) is the real enforcement surface. |
| Invariant 6 — Capacity non-negativity (`capacity ≥ 0`) | No | out-of-scope (capacity is a fixed constant `Capacity`; no `declare_pool` or `adjust_capacity` modeled) | Acceptable: not load-bearing per vote. |
| Invariant 7 — Declaration fields immutable | No | out-of-scope (structural; no declare/adjust modeled) | Acceptable. |
| Invariant 8 — Audit-log two-surface split | No | out-of-scope (audit log not modeled; per model header) | Named explicitly out of scope. |
| Invariant 9 — Audit-log append-only | No | out-of-scope (audit log not modeled) | Named explicitly out of scope. |
| Invariant 10 — State-change events auditable | No | out-of-scope (no state changes modeled) | Named explicitly out of scope. |
| Invariant 11 — Capacity-adjustment events auditable | No | out-of-scope (no adjust_capacity modeled) | Named explicitly out of scope. |
| Invariant 12 — Id stability | No | out-of-scope (no id model; per model header) | Named explicitly out of scope. |
| Invariant 13 — No id reuse | No | out-of-scope (no id model) | Named explicitly out of scope. |
| Invariant 14 — Action atomicity | ~~YES (original vote)~~ → **out-of-scope (within-action, not an interleaving; vote reconsidered 2026-06-04)** | out-of-scope | See §Inv 14 reconsideration below. |

## Inv 14 reconsideration

**Original vote (2026-06-03):** named Invariant 14 load-bearing alongside Invariants 4 and 5.

**Reconsideration (2026-06-04):** Invariant 14 (action atomicity — "each action either commits all its records or none") is a within-action host obligation on the write subsystem's crash-atomicity, not a claim about how concurrent *actions* interleave in a trace. TLA+ trace models check action-vs-action interleaving properties; whether a single action's audit-log append and running-total update co-commit under process failure is a deployment obligation, not a reachable state in an interleaving model. This is consistent with how other atoms treat analogous invariants: Party Identity Invariant 11 (action atomicity) is classified out-of-scope for the same reason in that atom's coverage matrix. The buggy twin demonstrates *why* atomicity is needed — the TOCTOU non-atomic allocate in the original twin reachably overshoots the capacity bound, mechanically proving the need for serializable atomic execution — but this is the action-vs-action interleaving case, not crash atomicity. Invariant 14's formal-layer vote is reconsidered to **out-of-scope (within-action, not an interleaving)**.

## Step 3 — bound saturation

Base: `Capacity=2`, `Workers={w1, w2, w3}` → 7 reachable states (C(3,0)+C(3,1)+C(3,2) = 1+3+3), all invariants hold.

Saturation check: `Capacity=3`, `Workers={w1,w2,w3,w4}` → 15 states (C(4,0..3) = 1+4+6+4); invariants hold. `Capacity=3`, `Workers={w1,w2,w3,w4,w5}` → 26 states (C(5,0..3) = 1+5+10+10); invariants hold. State count grows by exact binomial increments, consistent with the closed-form formula — the space is saturated at the base bound and grows predictably without invariant violations at larger bounds. ✓

## Outcome

- GAP rows: **none.** Both load-bearing invariants are now covered.
  - Invariant 4: covered (was covered; unchanged).
  - Invariant 5: covered (was a coverage gap — allocate-only model made the check trivially true for the release case; closed 2026-06-04 by adding `ReleaseAtomic` to the correct model and `ReleaseBuggy` to the buggy twin, where `ReleaseBuggy` drives `allocated` to -1 proving Inv5 has teeth).
  - Invariant 14: out-of-scope (within-action; vote reconsidered 2026-06-04 — see §Inv 14 reconsideration).
- Result: **closed.** Both previously-flagged items resolved. No remaining GAP rows. Coverage cross-check complete.
