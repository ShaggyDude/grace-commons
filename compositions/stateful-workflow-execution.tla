---- MODULE stateful-workflow-execution ----
\* Grace Commons — Stateful Workflow Execution (C10) composition.
\* Spec-level formal sibling of compositions/stateful-workflow-execution.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 1 (approval-gated
\* transition): a guarded transition fires only when its bound Approval Step is in
\* Approved state — the composition EVALUATES the gate (reads the step state) and
\* never fires on a bare caller assertion. Plus the audit binding atomicity: the
\* `fire` and the `transition_to_event` audit binding commit together, so no fired
\* transition lacks its audit record.
\*
\* Per guarded transition g:
\*   gate[g]    : none | pending | approved | rejected   (the Approval Step state)
\*   fired[g]   : BOOLEAN                                  (WorkflowStateMachine.fire happened)
\*   audited[g] : BOOLEAN                                  (transition_to_event binding written)
\*
\* This CORRECT model fires a guarded transition only when gate = approved, and
\* commits fired + audited in one atomic step. The buggy twin fires without
\* checking the gate (trusting a caller-asserted guard_satisfied) AND non-atomically
\* (fired without audited) — the two hazards the spec defends against — and TLC
\* finds the violating states.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - unguarded transitions, Permissions gating, Assignment in-tray, moot-gate cascade.
\* - Workflow / State Machine's own only-declared / replay invariants (its own model).
\* - Approval Step's approver-exclusivity (its own model).

CONSTANT Gates                  \* finite set of guarded transitions

VARIABLES gate, fired, audited
vars == <<gate, fired, audited>>

GateState == {"none", "pending", "approved", "rejected"}

TypeOK ==
    /\ gate    \in [Gates -> GateState]
    /\ fired   \in [Gates -> BOOLEAN]
    /\ audited \in [Gates -> BOOLEAN]

\* Every guarded transition begins with no gate opened, not fired, not audited.
Init ==
    /\ gate    = [g \in Gates |-> "none"]
    /\ fired   = [g \in Gates |-> FALSE]
    /\ audited = [g \in Gates |-> FALSE]

\* open_gate: submit the Approval Step (none -> pending).
OpenGate(g) ==
    /\ gate[g] = "none"
    /\ gate' = [gate EXCEPT ![g] = "pending"]
    /\ UNCHANGED <<fired, audited>>

\* decide_gate(approve): the named approver approves (pending -> approved).
ApproveGate(g) ==
    /\ gate[g] = "pending"
    /\ gate' = [gate EXCEPT ![g] = "approved"]
    /\ UNCHANGED <<fired, audited>>

\* decide_gate(reject): the named approver rejects (pending -> rejected).
RejectGate(g) ==
    /\ gate[g] = "pending"
    /\ gate' = [gate EXCEPT ![g] = "rejected"]
    /\ UNCHANGED <<fired, audited>>

\* CORRECT fire_transition (guarded): the composition reads the gate state and
\* fires only when it is Approved; fire + audit binding commit atomically.
FireGuarded(g) ==
    /\ gate[g] = "approved"
    /\ ~fired[g]
    /\ fired'   = [fired   EXCEPT ![g] = TRUE]
    /\ audited' = [audited EXCEPT ![g] = TRUE]
    /\ UNCHANGED gate

Next == \E g \in Gates : OpenGate(g) \/ ApproveGate(g) \/ RejectGate(g) \/ FireGuarded(g)
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariants ---

\* Invariant 1 — approval-gated transition: a guarded transition fires only if its
\* bound Approval Step is Approved. The load-bearing claim.
Inv1_GateClearance == \A g \in Gates : fired[g] => (gate[g] = "approved")

\* Audit binding atomicity: no fired transition lacks its audit binding.
Inv_BindingAtomic == \A g \in Gates : fired[g] => audited[g]

Safety == TypeOK /\ Inv1_GateClearance /\ Inv_BindingAtomic

====
