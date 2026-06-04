---- MODULE forensic-recovery-buggy ----
\* BUGGY TWIN (vacuity guard) for forensic-recovery.tla.
\*
\* The lifecycle commit is split into three separate, interleavable sub-steps with
\* NO compensation — the naive non-atomic implementation the *Cross-store
\* consistency under partial failure* edge case and Invariant 4 warn against:
\*   WriteSoft  -> Soft Delete lifecycle transition lands (e.g. a purge)
\*   WriteAudit -> Audit Trail record_action event lands
\*   Bind       -> record_to_events binding lands
\* Because they are distinct actions, TLC stops after WriteSoft(t) alone:
\* softState[t] = present, auditState[t] = absent, bound[t] = FALSE — a purge or
\* delete with no attributed audit event (the violation Invariant 2 prohibits).
\* Inv4_BindingBijection and Inv_NoDanglingSoft both fail. The checker rejects it.
\* If the checker reports all invariants hold here, the harness is vacuous.

CONSTANT Transitions

VARIABLES softState, auditState, bound
vars == <<softState, auditState, bound>>

TypeOK ==
    /\ softState  \in [Transitions -> {"absent", "present"}]
    /\ auditState \in [Transitions -> {"absent", "present"}]
    /\ bound      \in [Transitions -> BOOLEAN]

Init ==
    /\ softState  = [t \in Transitions |-> "absent"]
    /\ auditState = [t \in Transitions |-> "absent"]
    /\ bound      = [t \in Transitions |-> FALSE]

\* BUG: three separate sub-steps, interleavable, no compensation.
WriteSoft(t) ==
    /\ softState[t] = "absent"
    /\ softState' = [softState EXCEPT ![t] = "present"]
    /\ UNCHANGED <<auditState, bound>>

WriteAudit(t) ==
    /\ softState[t] = "present"
    /\ auditState[t] = "absent"
    /\ auditState' = [auditState EXCEPT ![t] = "present"]
    /\ UNCHANGED <<softState, bound>>

Bind(t) ==
    /\ softState[t] = "present"
    /\ auditState[t] = "present"
    /\ ~bound[t]
    /\ bound' = [bound EXCEPT ![t] = TRUE]
    /\ UNCHANGED <<softState, auditState>>

Next == \E t \in Transitions : WriteSoft(t) \/ WriteAudit(t) \/ Bind(t)
Spec == Init /\ [][Next]_vars

Coherent(t) ==
    \/ (softState[t] = "absent"  /\ auditState[t] = "absent"  /\ bound[t] = FALSE)
    \/ (softState[t] = "present" /\ auditState[t] = "present" /\ bound[t] = TRUE)

Inv4_BindingBijection == \A t \in Transitions : Coherent(t)
Inv_NoDanglingSoft ==
    \A t \in Transitions : (softState[t] = "present") => (auditState[t] = "present" /\ bound[t])
Inv_NoOrphanAudit ==
    \A t \in Transitions : (auditState[t] = "present") => (softState[t] = "present")

Safety == TypeOK /\ Inv4_BindingBijection /\ Inv_NoDanglingSoft /\ Inv_NoOrphanAudit

====
