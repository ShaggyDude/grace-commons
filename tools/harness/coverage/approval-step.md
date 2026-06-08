# Coverage matrix — `approval-step`

- **Pattern:** `atoms/approval-step.md`
- **Model:** `approval-step.tla` (+ buggy twin `approval-step-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 4 (approver exclusivity), Invariant 5 (submitter exclusivity), Invariant 9 (concurrent step independence)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/approval-step.tla` → `PASS` ☐ *(per Lineage: 16 states, holds)*
- Buggy twin: `node check.mjs ../../atoms/approval-step-buggy.tla --buggy` → `PASS` (rejected) ☐ *(per Lineage: rejected at 4 states — wrong actor approves s1)*

## Step 2 — coverage matrix

The spec has 10 invariants. The model covers the three voted load-bearing claims plus Inv2 (membership exclusivity) and Inv3 (terminal absorption) by construction.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Submission immutability | No | out-of-scope (structural; no field model) | Per model header: "id immutability / no-reuse / store durability / timestamp ordering (Invariants 1,6-8,10 — structural / clock)." Acceptable. |
| Invariant 2 — Membership exclusivity (exactly one state at all times) | No | covered | `TypeOK` constrains `state \in [Steps -> StepStates]`, so each step is always in exactly one named state. |
| Invariant 3 — Terminal absorption | No | by-construction | Every action (`Approve`, `Reject`, `Withdraw`) guards `state[s] = "Pending"`; once a step transitions to Approved/Rejected/Withdrawn no further transitions apply. Per model note explicitly. Acceptable: not load-bearing per vote. |
| Invariant 4 — Approver exclusivity | YES | covered | `Inv4_ApproverExclusivity == ∀ s ∈ Steps : state[s] ∈ {"Approved","Rejected"} ⇒ decidedBy[s] = approver[s]`; all three actors quantified over in `Next`, so any actor able to incorrectly approve would be caught. |
| Invariant 5 — Submitter exclusivity | YES | covered | `Inv5_SubmitterExclusivity == ∀ s ∈ Steps : state[s] = "Withdrawn" ⇒ decidedBy[s] = submitter[s]`. |
| Invariant 6 — Decision attribution complete for terminal steps | No | out-of-scope (field model not present; structural/clock per model header) | Acceptable: not load-bearing per vote. Note: `decidedBy` is modeled as a partial proxy for this but the non-whitespace and timestamp requirements are not checked. |
| Invariant 7 — Temporal ordering (`decided_at ≥ submitted_at`) | No | out-of-scope (no clock modeled; per model header) | Acceptable. |
| Invariant 8 — Submission attribution complete | No | out-of-scope (structural; per model header) | Acceptable. |
| Invariant 9 — Concurrent step independence | YES | by-construction | Each action's `EXCEPT` touches only the targeted step `s`; the other step's `state` and `decidedBy` are UNCHANGED by the frame constraint. Per model note explicitly. **Flag: load-bearing per vote, held by-construction (frame property) rather than an explicit state predicate.** |
| Invariant 10 — Step store durability | No | out-of-scope (structural; per model header) | Acceptable. |

## Step 3 — bound saturation

Per Lineage: 2 steps (`s1`, `s2`), 3 actors (`a1`, `a2`, `a3`) → 16 reachable states. Two steps is the minimum to exercise concurrent independence; three actors ensures that quantifying over all actors in `Next` would expose any actor authorized to act who should not be. Bound appears adequate.

## Outcome

- GAP rows: none
- by-construction flags on load-bearing invariants: **Invariant 9 (concurrent step independence) — load-bearing per vote, held by-construction (TLA+ frame property) rather than explicit state predicate.** The frame is a sound argument but a dedicated check would make independence explicit, e.g., `Inv9_Independence == ∀ s ∈ Steps : state[s] = decidedBy[s] = ...` is not the right form, but something like: after each action on `s`, assert `∀ s2 ∈ Steps \ {s} : state[s2] = state_before[s2]`. Flag for consideration.
- Result: **one by-construction flag on load-bearing Inv9** — no hard GAPs. Pattern is otherwise clean. The Inv9 by-construction argument is sound given how TLA+ frames work, but promotion to an explicit invariant would strengthen the formal surface.
