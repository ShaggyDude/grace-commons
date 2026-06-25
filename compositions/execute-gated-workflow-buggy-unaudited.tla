---- MODULE execute-gated-workflow-buggy-unaudited ----
\* BUGGY TWIN (vacuity guard) for execute-gated-workflow.tla — ISOLATED to
\* Invariant Inv_BindingAtomic (the fire/audit binding atomicity).
\*
\* This is the second of two isolated twins. Its sibling
\* `stateful-workflow-execution-buggy.tla` isolates Inv1_GateClearance. Splitting
\* the two hazards across two twins gives each load-bearing invariant its own
\* reachable, checker-rejected counterexample — a combined twin (firing both
\* ungated AND unaudited) would surface only the shorter violation in the
\* committed run, masking the other (see tools/harness/isolate.mjs).
\*
\* BUG: fire a guarded transition WITH the gate correctly cleared (gate =
\* approved) but WITHOUT writing the audit binding. fired = TRUE, audited = FALSE
\* — a fired transition with no audit record. Inv_BindingAtomic fails; Inv1_Gate-
\* Clearance HOLDS (the fire required gate = approved), so the rejection is
\* isolated to binding atomicity. If the checker reports all invariants hold
\* here, the Inv_BindingAtomic check is vacuous.

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

\* BUG (Inv_BindingAtomic, ISOLATED): gate correctly cleared, but no audit write.
FireGatedButUnaudited(g) ==
    /\ gate[g] = "approved"
    /\ ~fired[g]
    /\ fired' = [fired EXCEPT ![g] = TRUE]
    /\ UNCHANGED <<gate, audited>>

Next == \E g \in Gates : OpenGate(g) \/ ApproveGate(g) \/ RejectGate(g) \/ FireGatedButUnaudited(g)
Spec == Init /\ [][Next]_vars

Inv1_GateClearance == \A g \in Gates : fired[g] => (gate[g] = "approved")
Inv_BindingAtomic == \A g \in Gates : fired[g] => audited[g]

Safety == TypeOK /\ Inv1_GateClearance /\ Inv_BindingAtomic

====
