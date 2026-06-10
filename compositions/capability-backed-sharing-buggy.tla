---- MODULE capability-backed-sharing-buggy ----
\* BUGGY TWIN (vacuity guard) for capability-backed-sharing.tla.
\*
\* The disclosure commit is split into three separate, interleavable sub-steps
\* with NO compensation — the naive non-atomic implementation the *Cross-store
\* consistency under partial failure* edge case and Invariant 2 warn against.
\* Selective Disclosure writes first (it is the disclosure-accounting record of
\* record), then the Audit Trail event, then the binding:
\*   WriteSD     -> Selective Disclosure disclosure record lands
\*   WriteAudit  -> Audit Trail `sharing.disclosed` event lands
\*   Bind        -> disclosure_to_redemption binding lands
\* Because they are distinct actions, TLC stops after WriteSD(d) alone:
\* sdState[d] = present, auditState[d] = absent, bound[d] = FALSE — a dangling
\* Selective Disclosure record with no attributed sharing.disclosed event (the
\* exact orphan the cross-store edge case describes). Inv2_BindingBijection and
\* Inv2_NoDanglingDisclosure both fail. The checker rejects the twin.
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

Inv2_BindingBijection == \A d \in Disclosures : Coherent(d)
Inv2_NoDanglingDisclosure ==
    \A d \in Disclosures : (sdState[d] = "present") => (auditState[d] = "present" /\ bound[d])
Inv2_NoOrphanAudit ==
    \A d \in Disclosures : (auditState[d] = "present") => (sdState[d] = "present")

Safety == TypeOK /\ Inv2_BindingBijection /\ Inv2_NoDanglingDisclosure /\ Inv2_NoOrphanAudit

====
