---- MODULE forensic-recovery ----
\* Grace Commons — Forensic Recovery (C3) composition.
\* Spec-level formal sibling of compositions/forensic-recovery.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 4 (binding bijection
\* / no dangling partial): every Soft Delete lifecycle transition (soft_delete /
\* restore / purge) is committed together with its Audit Trail record_action event
\* and its record_to_events binding. The headline consequence is Invariant 2 (purge
\* accountability): "no record reaches Purged without an attributed audit event."
\* No reachable state has a lifecycle transition recorded in the Soft Delete store
\* without its attributed audit event and binding.
\*
\* Per lifecycle transition x:
\*   softState  : absent | present   (Soft Delete lifecycle transition committed)
\*   auditState : absent | present   (Audit Trail record_action event)
\*   bound      : FALSE  | TRUE       (record_to_events[record] entry)
\*
\* This CORRECT model commits the three together as a single atomic action. The
\* buggy twin commits them as separate, interleavable sub-steps with no
\* compensation — the naive implementation the *Cross-store consistency under
\* partial failure* edge case warns against — and TLC finds the dangling partial
\* (a purge/delete with no audit event) that violates Invariant 4.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - the Active/Deleted/Purged state machine itself (Soft Delete's own model);
\* - recover_history outcome plumbing (Invariant 3 — a query-shape property);
\* - constituent invariants (Invariant 5) — each checked in its own model.

CONSTANT Transitions            \* finite set of lifecycle transitions

VARIABLES softState, auditState, bound
vars == <<softState, auditState, bound>>

TypeOK ==
    /\ softState  \in [Transitions -> {"absent", "present"}]
    /\ auditState \in [Transitions -> {"absent", "present"}]
    /\ bound      \in [Transitions -> BOOLEAN]

\* Every transition begins uncommitted: no Soft Delete write, no audit event, no binding.
Init ==
    /\ softState  = [t \in Transitions |-> "absent"]
    /\ auditState = [t \in Transitions |-> "absent"]
    /\ bound      = [t \in Transitions |-> FALSE]

\* CORRECT lifecycle commit: the Soft Delete transition, the Audit Trail
\* record_action, and the record_to_events binding all land together atomically.
CommitTransition(t) ==
    /\ softState[t] = "absent"
    /\ softState'  = [softState  EXCEPT ![t] = "present"]
    /\ auditState' = [auditState EXCEPT ![t] = "present"]
    /\ bound'      = [bound      EXCEPT ![t] = TRUE]

Next == \E t \in Transitions : CommitTransition(t)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv4_BindingBijection Inv_NoDanglingSoft Inv_NoOrphanAudit
\* --- composition-level safety invariants ---

\* The two coherent configurations of the three sub-writes for a transition.
Coherent(t) ==
    \/ (softState[t] = "absent"  /\ auditState[t] = "absent"  /\ bound[t] = FALSE)
    \/ (softState[t] = "present" /\ auditState[t] = "present" /\ bound[t] = TRUE)

\* Invariant 4 — binding bijection / no dangling partial.
Inv4_BindingBijection == \A t \in Transitions : Coherent(t)

\* No Soft Delete transition (incl. a purge) without its attributed audit event
\* and binding — the structural form of Invariant 2 (purge accountability).
Inv_NoDanglingSoft ==
    \A t \in Transitions : (softState[t] = "present") => (auditState[t] = "present" /\ bound[t])

\* No lifecycle audit event without its Soft Delete transition.
Inv_NoOrphanAudit ==
    \A t \in Transitions : (auditState[t] = "present") => (softState[t] = "present")

Safety == TypeOK /\ Inv4_BindingBijection /\ Inv_NoDanglingSoft /\ Inv_NoOrphanAudit

====
