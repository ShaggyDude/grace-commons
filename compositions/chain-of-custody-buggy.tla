---- MODULE chain-of-custody-buggy ----
\* BUGGY TWIN (vacuity guard) for chain-of-custody.tla.
\*
\* SEQUENTIAL-WITHOUT-COMPENSATION: the naive implementation the spec's
\* *Cross-store consistency under partial failure* edge case and Invariant 4's
\* safety arm warn against. The custody commit is split into separate,
\* interleavable sub-steps with NO surfacing and NO compensation — Provenance
\* writes first (immutable once committed), then the Audit Trail event may or
\* may not follow:
\*   WriteProv   -> Provenance custody entry lands (irreversible)
\*   WriteAudit  -> Audit Trail record_action event lands (maybe never)
\* There is no FailPartial-with-surfacing outcome and no RetryAudit
\* compensation action. TLC stops after WriteProv(e) alone:
\* provState[e] = present, auditState[e] = absent, surfaced[e] = FALSE — a
\* SILENT dangling Provenance custody entry with no attributed audit event and
\* no compliance finding (the exact unsurfaced orphan the safety arm forbids).
\* Inv4_SafetyBijection and Inv4_NoUnsurfacedOrphan both fail. The checker
\* rejects the twin. If the checker reports all invariants hold here, the
\* harness is vacuous.

CONSTANT Entries

VARIABLES provState, auditState, surfaced
vars == <<provState, auditState, surfaced>>

TypeOK ==
    /\ provState  \in [Entries -> {"absent", "present"}]
    /\ auditState \in [Entries -> {"absent", "clean", "recovered"}]
    /\ surfaced   \in [Entries -> BOOLEAN]

Init ==
    /\ provState  = [e \in Entries |-> "absent"]
    /\ auditState = [e \in Entries |-> "absent"]
    /\ surfaced   = [e \in Entries |-> FALSE]

\* BUG: the Provenance write lands as its own step — no surfacing, no finding,
\* no compensation obligation taken on. The orphan is silent.
WriteProv(e) ==
    /\ provState[e] = "absent"
    /\ provState' = [provState EXCEPT ![e] = "present"]
    /\ UNCHANGED <<auditState, surfaced>>

\* The audit write may eventually follow — or never. Even when it does, the
\* interleaving already passed through the silent orphan.
WriteAudit(e) ==
    /\ provState[e] = "present"
    /\ auditState[e] = "absent"
    /\ auditState' = [auditState EXCEPT ![e] = "clean"]
    /\ UNCHANGED <<provState, surfaced>>

Next == \E e \in Entries : WriteProv(e) \/ WriteAudit(e)
Spec == Init /\ [][Next]_vars

Orphan(e) == provState[e] = "present" /\ auditState[e] = "absent"

Coherent(e) ==
    \/ (provState[e] = "absent"  /\ auditState[e] = "absent" /\ ~surfaced[e])
    \/ (provState[e] = "present" /\ auditState[e] \in {"clean", "recovered"})

Inv4_SafetyBijection == \A e \in Entries : Coherent(e) \/ (Orphan(e) /\ surfaced[e])

Inv4_NoUnsurfacedOrphan == \A e \in Entries : Orphan(e) => surfaced[e]

Inv4_NoOrphanAudit ==
    \A e \in Entries : (auditState[e] # "absent") => (provState[e] = "present")

Inv4_RecoveryDistinguishable ==
    \A e \in Entries :
        /\ (auditState[e] = "clean")     => ~surfaced[e]
        /\ (auditState[e] = "recovered") => surfaced[e]

Safety ==
    /\ TypeOK
    /\ Inv4_SafetyBijection
    /\ Inv4_NoUnsurfacedOrphan
    /\ Inv4_NoOrphanAudit
    /\ Inv4_RecoveryDistinguishable

====
