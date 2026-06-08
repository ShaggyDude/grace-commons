---- MODULE immutable-transaction-ledger-buggy ----
\* BUGGY TWIN (vacuity guard) for immutable-transaction-ledger.tla.
\*
\* The disclosure commit is split into three separate, interleavable sub-steps
\* with NO compensation — the naive non-atomic implementation the *Cross-store
\* consistency under partial failure* edge case and Invariant 1 warn against.
\* Selective Disclosure writes first (it is the disclosure-accounting record of
\* record), then the Audit Trail event, then the binding:
\*   WriteSD     -> Selective Disclosure disclosure record lands
\*   WriteAudit  -> Audit Trail `ledger.disclosed` event lands
\*   Bind        -> disclosure_to_event binding lands
\* Because they are distinct actions, TLC stops after WriteSD(d) alone:
\* sdState[d] = present, auditState[d] = absent, bound[d] = FALSE — a dangling
\* Selective Disclosure disclosure record with no attributed ledger event (the
\* exact orphan the partial-failure edge case describes). Inv1_BindingBijection
\* and Inv1_NoDanglingDisclosure both fail. The checker rejects the twin.
\* If the checker reports all invariants hold here, the harness is vacuous.

CONSTANT Disclosures

VARIABLES sdState, auditState, bound
vars == <<sdState, auditState, bound>>

TypeOK ==
    /\ sdState    \in [Disclosures -> {"absent", "present"}]
    /\ auditState \in [Disclosures -> {"absent", "present"}]
    /\ bound      \in [Disclosures -> BOOLEAN]

Init ==
    /\ sdState    = [d \in Disclosures |-> "absent"]
    /\ auditState = [d \in Disclosures |-> "absent"]
    /\ bound      = [d \in Disclosures |-> FALSE]

\* BUG: three separate sub-steps, interleavable, no compensation.
WriteSD(d) ==
    /\ sdState[d] = "absent"
    /\ sdState' = [sdState EXCEPT ![d] = "present"]
    /\ UNCHANGED <<auditState, bound>>

WriteAudit(d) ==
    /\ sdState[d] = "present"
    /\ auditState[d] = "absent"
    /\ auditState' = [auditState EXCEPT ![d] = "present"]
    /\ UNCHANGED <<sdState, bound>>

Bind(d) ==
    /\ sdState[d] = "present"
    /\ auditState[d] = "present"
    /\ ~bound[d]
    /\ bound' = [bound EXCEPT ![d] = TRUE]
    /\ UNCHANGED <<sdState, auditState>>

Next == \E d \in Disclosures : WriteSD(d) \/ WriteAudit(d) \/ Bind(d)
Spec == Init /\ [][Next]_vars

Coherent(d) ==
    \/ (sdState[d] = "absent"  /\ auditState[d] = "absent"  /\ bound[d] = FALSE)
    \/ (sdState[d] = "present" /\ auditState[d] = "present" /\ bound[d] = TRUE)

Inv1_BindingBijection == \A d \in Disclosures : Coherent(d)
Inv1_NoDanglingDisclosure ==
    \A d \in Disclosures : (sdState[d] = "present") => (auditState[d] = "present" /\ bound[d])
Inv1_NoOrphanAudit ==
    \A d \in Disclosures : (auditState[d] = "present") => (sdState[d] = "present")

Safety == TypeOK /\ Inv1_BindingBijection /\ Inv1_NoDanglingDisclosure /\ Inv1_NoOrphanAudit

====
