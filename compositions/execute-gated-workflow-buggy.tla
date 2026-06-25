---- MODULE execute-gated-workflow-buggy ----
\* BUGGY TWIN (vacuity guard) for execute-gated-workflow.tla.
\*
\* Replaces the correct guarded fire with FireGuardedBuggy, which introduces TWO
\* hazards the spec defends against:
\*   BUG 1 (Invariant 1 — approval-gated transition): the fire is guarded only on
\*          ~fired[g] — it does NOT check the gate state, modelling a composition
\*          that trusts a bare caller-asserted guard_satisfied = true instead of
\*          reading the bound Approval Step. A guarded transition fires with the
\*          gate in none/pending/rejected. Inv1_GateClearance fails.
\*   BUG 2 (binding atomicity): the fire sets fired = TRUE but NOT audited — a
\*          non-atomic fire/audit leaving a fired transition with no audit binding.
\*          Inv_BindingAtomic fails.
\* From Init, FireGuardedBuggy(g) reaches fired = TRUE, gate = none, audited = FALSE
\* — violating both invariants. If the checker reports all invariants hold here,
\* the harness is vacuous.

CONSTANT Gates

VARIABLES gate, fired, audited
vars == <<gate, fired, audited>>

GateState == {"none", "pending", "approved", "rejected"}

TypeOK ==
    /\ gate    \in [Gates -> GateState]
    /\ fired   \in [Gates -> BOOLEAN]
    /\ audited \in [Gates -> BOOLEAN]

Init ==
    /\ gate    = [g \in Gates |-> "none"]
    /\ fired   = [g \in Gates |-> FALSE]
    /\ audited = [g \in Gates |-> FALSE]

OpenGate(g) ==
    /\ gate[g] = "none"
    /\ gate' = [gate EXCEPT ![g] = "pending"]
    /\ UNCHANGED <<fired, audited>>

ApproveGate(g) ==
    /\ gate[g] = "pending"
    /\ gate' = [gate EXCEPT ![g] = "approved"]
    /\ UNCHANGED <<fired, audited>>

RejectGate(g) ==
    /\ gate[g] = "pending"
    /\ gate' = [gate EXCEPT ![g] = "rejected"]
    /\ UNCHANGED <<fired, audited>>

\* BUG (Inv1 — gate clearance, ISOLATED): fire without checking the gate, but
\* DO audit. Breaks Inv1_GateClearance (fired with gate in none/pending/rejected)
\* while holding Inv_BindingAtomic (fired => audited) — so this twin's rejection
\* is dedicated to the gate-clearance invariant. Its sibling
\* `stateful-workflow-execution-buggy-unaudited.tla` isolates Inv_BindingAtomic.
\* (A single twin breaking both would mask one in the committed run — see
\*  tools/harness/isolate.mjs.)
FireUngatedButAudited(g) ==
    /\ ~fired[g]
    /\ fired'   = [fired   EXCEPT ![g] = TRUE]
    /\ audited' = [audited EXCEPT ![g] = TRUE]
    /\ UNCHANGED gate

Next == \E g \in Gates : OpenGate(g) \/ ApproveGate(g) \/ RejectGate(g) \/ FireUngatedButAudited(g)
Spec == Init /\ [][Next]_vars

Inv1_GateClearance == \A g \in Gates : fired[g] => (gate[g] = "approved")
Inv_BindingAtomic == \A g \in Gates : fired[g] => audited[g]

Safety == TypeOK /\ Inv1_GateClearance /\ Inv_BindingAtomic

====
