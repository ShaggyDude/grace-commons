---- MODULE chain-of-custody-buggy ----
\* BUGGY TWIN (vacuity guard) for chain-of-custody.tla.
\*
\* The custody commit is split into three separate, interleavable sub-steps with
\* NO compensation — the naive non-atomic implementation the *Cross-store
\* consistency under partial failure* edge case and Invariant 4 warn against:
\*   WriteProv  -> Provenance custody entry lands
\*   WriteAudit -> Audit Trail record_action event lands
\*   Bind       -> entry_to_event binding lands
\* Because they are distinct actions, TLC stops after WriteProv(e) alone:
\* provState[e] = present, auditState[e] = absent, bound[e] = FALSE — a dangling
\* Provenance custody entry with no attributed audit event. Inv4_BindingBijection
\* and Inv4_NoDanglingProv both fail. The checker rejects the twin.
\* If the checker reports all invariants hold here, the harness is vacuous.

CONSTANT Entries

VARIABLES provState, auditState, bound
vars == <<provState, auditState, bound>>

TypeOK ==
    /\ provState  \in [Entries -> {"absent", "present"}]
    /\ auditState \in [Entries -> {"absent", "present"}]
    /\ bound      \in [Entries -> BOOLEAN]

Init ==
    /\ provState  = [e \in Entries |-> "absent"]
    /\ auditState = [e \in Entries |-> "absent"]
    /\ bound      = [e \in Entries |-> FALSE]

\* BUG: three separate sub-steps, interleavable, no compensation.
WriteProv(e) ==
    /\ provState[e] = "absent"
    /\ provState' = [provState EXCEPT ![e] = "present"]
    /\ UNCHANGED <<auditState, bound>>

WriteAudit(e) ==
    /\ provState[e] = "present"
    /\ auditState[e] = "absent"
    /\ auditState' = [auditState EXCEPT ![e] = "present"]
    /\ UNCHANGED <<provState, bound>>

Bind(e) ==
    /\ provState[e] = "present"
    /\ auditState[e] = "present"
    /\ ~bound[e]
    /\ bound' = [bound EXCEPT ![e] = TRUE]
    /\ UNCHANGED <<provState, auditState>>

Next == \E e \in Entries : WriteProv(e) \/ WriteAudit(e) \/ Bind(e)
Spec == Init /\ [][Next]_vars

Coherent(e) ==
    \/ (provState[e] = "absent"  /\ auditState[e] = "absent"  /\ bound[e] = FALSE)
    \/ (provState[e] = "present" /\ auditState[e] = "present" /\ bound[e] = TRUE)

Inv4_BindingBijection == \A e \in Entries : Coherent(e)
Inv4_NoDanglingProv ==
    \A e \in Entries : (provState[e] = "present") => (auditState[e] = "present" /\ bound[e])
Inv4_NoOrphanAudit ==
    \A e \in Entries : (auditState[e] = "present") => (provState[e] = "present")

Safety == TypeOK /\ Inv4_BindingBijection /\ Inv4_NoDanglingProv /\ Inv4_NoOrphanAudit

====
