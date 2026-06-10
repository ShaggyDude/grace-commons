---- MODULE immutable-transaction-ledger-buggy ----
\* BUGGY TWIN (vacuity guard) for immutable-transaction-ledger.tla.
\*
\* SEQUENTIAL-WITHOUT-COMPENSATION: the naive implementation the spec's
\* *Cross-store consistency under partial failure* edge case and Invariant 1's
\* safety arm warn against. The disclosure commit is split into separate,
\* interleavable sub-steps with NO surfacing and NO compensation — Selective
\* Disclosure writes first (it is the disclosure-accounting record of record),
\* then the Audit Trail event may or may not follow:
\*   WriteSD     -> Selective Disclosure disclosure record lands (irreversible)
\*   WriteAudit  -> Audit Trail `ledger.disclosed` event lands (maybe never)
\* There is no FailPartial-with-surfacing outcome and no RetryAudit
\* compensation action. TLC stops after WriteSD(d) alone:
\* sdState[d] = present, auditState[d] = absent, surfaced[d] = FALSE — a SILENT
\* dangling Selective Disclosure record with no attributed ledger event and no
\* compliance finding (the exact unsurfaced orphan the safety arm forbids).
\* Inv1_SafetyBijection and Inv1_NoUnsurfacedOrphan both fail. The checker
\* rejects the twin. If the checker reports all invariants hold here, the
\* harness is vacuous.

CONSTANT Disclosures

VARIABLES sdState, auditState, surfaced
vars == <<sdState, auditState, surfaced>>

TypeOK ==
    /\ sdState    \in [Disclosures -> {"absent", "present"}]
    /\ auditState \in [Disclosures -> {"absent", "clean", "recovered"}]
    /\ surfaced   \in [Disclosures -> BOOLEAN]

Init ==
    /\ sdState    = [d \in Disclosures |-> "absent"]
    /\ auditState = [d \in Disclosures |-> "absent"]
    /\ surfaced   = [d \in Disclosures |-> FALSE]

\* BUG: the SD write lands as its own step — no surfacing, no finding, no
\* compensation obligation taken on. The orphan is silent.
WriteSD(d) ==
    /\ sdState[d] = "absent"
    /\ sdState' = [sdState EXCEPT ![d] = "present"]
    /\ UNCHANGED <<auditState, surfaced>>

\* The audit write may eventually follow — or never. Even when it does, the
\* interleaving already passed through the silent orphan.
WriteAudit(d) ==
    /\ sdState[d] = "present"
    /\ auditState[d] = "absent"
    /\ auditState' = [auditState EXCEPT ![d] = "clean"]
    /\ UNCHANGED <<sdState, surfaced>>

Next == \E d \in Disclosures : WriteSD(d) \/ WriteAudit(d)
Spec == Init /\ [][Next]_vars

Orphan(d) == sdState[d] = "present" /\ auditState[d] = "absent"

Coherent(d) ==
    \/ (sdState[d] = "absent"  /\ auditState[d] = "absent" /\ ~surfaced[d])
    \/ (sdState[d] = "present" /\ auditState[d] \in {"clean", "recovered"})

Inv1_SafetyBijection == \A d \in Disclosures : Coherent(d) \/ (Orphan(d) /\ surfaced[d])

Inv1_NoUnsurfacedOrphan == \A d \in Disclosures : Orphan(d) => surfaced[d]

Inv1_NoOrphanAudit ==
    \A d \in Disclosures : (auditState[d] # "absent") => (sdState[d] = "present")

Inv1_RecoveryDistinguishable ==
    \A d \in Disclosures :
        /\ (auditState[d] = "clean")     => ~surfaced[d]
        /\ (auditState[d] = "recovered") => surfaced[d]

Safety ==
    /\ TypeOK
    /\ Inv1_SafetyBijection
    /\ Inv1_NoUnsurfacedOrphan
    /\ Inv1_NoOrphanAudit
    /\ Inv1_RecoveryDistinguishable

====
