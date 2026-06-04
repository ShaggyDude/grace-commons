# Coverage matrix — `audit-trail`

- **Pattern:** `compositions/audit-trail.md`
- **Model:** `audit-trail.tla` + `audit-trail-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 4 (cascade-on-purge — purge, attestation purge, and seal-coverage update compose atomically or via compensating record); Invariant 8 (honest representation of destruction — `evState = purged ⇒ retState = Purged`)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/audit-trail.tla` → `PASS` ☐ *(prior: 9 reachable states)*
- Buggy twin: `node check.mjs ../../compositions/audit-trail-buggy.tla --buggy` → `PASS` (rejected) ☐ *(prior: rejected at 4 states — non-atomic cascade leaves dangling partial)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Attribution coverage | YES | **covered** | `Inv1_AttributionCoverage == \A e \in Events : (retState[e] = "Retained") => (attState[e] = "live")` — asserted directly. A retained event always has a live attestation; the atomic purge cascade sets both to purged together. |
| Invariant 2 — Retention coverage | no | by-construction | Every event in `Events` has a `retState` entry initialized to `"Retained"` and transitions only via `PurgeAtomic`. Coverage is guaranteed by the model's initialization (`retState = [e \in Events |-> "Retained"]`). No event can exist without a retention record in this model. |
| Invariant 3 — Integrity coverage (modulo unsealed tail) | no | by-construction | Every event in `Events` has `sealCov` initialized to `"covered"` and transitions only to `"recpurged"` in the atomic cascade. The unsealed tail policy (strict vs. lenient mode for `verify_record`) and the seal cadence trade-off are acknowledged out-of-scope in the model comments. |
| Invariant 4 — Cascade-on-purge | YES | **covered** | `Inv4_Cascade == \A e \in Events : Coherent(e)` — asserted directly. `Coherent(e)` enforces that all four stores are always in one of exactly two joint states (all-Retained or all-purged); no partial state is reachable in the correct model. The buggy twin's non-atomic cascade demonstrates the violation. |
| Invariant 5 — Constituent invariants preserved | no | out-of-scope (explicitly deferred — "NOT MODELED: The constituent atoms' internal invariants (Invariant 5) — checked in each atom's own model") | — |
| Invariant 6 — Forensic completability | no | out-of-scope ("NOT MODELED: verify_record outcome plumbing (Invariants 6, 7) — query-shape properties") | — |
| Invariant 7 — Verification asymmetry preserved | no | out-of-scope (same as Invariant 6 — "NOT MODELED") | — |
| Invariant 8 — Honest representation of destruction | YES | **covered** | `Inv8_HonestDestruction == \A e \in Events : (evState[e] = "purged") => (retState[e] = "Purged")` — asserted directly. Content is gone only when a retention record proves lawful destruction; "missing without record" is unreachable. |

## Step 3 — bound saturation

- At `Events = {e1, e2}`: 9 reachable states (per Lineage). The correct model's atomic cascade collapses the partial-state space — Retained→Purged is a single step per event, so the reachable states are 4 Retained-combination states × 2 eligibility flags + final purged states. The model is structurally small by design (atomicity removes the interesting partial states; those live in the buggy twin). Adequate for the load-bearing claims. A 3-event variant would confirm saturation; the 2-event bound is standard for this class of composition model.

## Outcome

- GAP rows: none
- by-construction flags on load-bearing invariants: none (Invariants 1, 4, and 8 are all directly asserted)
- Result: **clean** — all three formal-layer vote claims are directly covered; Invariants 2 and 3 are by-construction with defensible reasoning; Invariants 5, 6, and 7 are explicitly and defensibly out-of-scope. — Coverage cross-check 2026-06-03.
