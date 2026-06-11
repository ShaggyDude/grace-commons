---- MODULE forensic-recovery-buggy ----
\* BUGGY TWIN (vacuity guard) for forensic-recovery.tla.
\*
\* SEQUENTIAL-WITHOUT-COMPENSATION: the naive implementation the spec's
\* *Cross-store consistency under partial failure* edge case and Invariant 4's
\* safety arm warn against. The lifecycle commit is split into separate,
\* interleavable sub-steps with NO surfacing and NO compensation — Soft Delete
\* writes first (not always reversible; Purged is terminal), then the Audit
\* Trail event may or may not follow:
\*   WriteSoft   -> Soft Delete lifecycle transition lands
\*   WriteAudit  -> Audit Trail record_action event lands (maybe never)
\* There is no FailPartial-with-surfacing outcome and no RetryAudit
\* compensation action. TLC stops after WriteSoft(t) alone:
\* softState[t] = present, auditState[t] = absent, surfaced[t] = FALSE — a
\* SILENT dangling lifecycle transition (for a purge: a destroyed record with
\* no attributed audit event and no compliance finding — the exact violation of
\* Invariant 2's compensated path that Invariant 4's safety arm forbids).
\* Inv4_SafetyBijection and Inv4_NoUnsurfacedOrphan both fail. The checker
\* rejects the twin. If the checker reports all invariants hold here, the
\* harness is vacuous.

CONSTANT Transitions

VARIABLES softState, auditState, surfaced
vars == <<softState, auditState, surfaced>>

TypeOK ==
    /\ softState  \in [Transitions -> {"absent", "present"}]
    /\ auditState \in [Transitions -> {"absent", "clean", "recovered"}]
    /\ surfaced   \in [Transitions -> BOOLEAN]

Init ==
    /\ softState  = [t \in Transitions |-> "absent"]
    /\ auditState = [t \in Transitions |-> "absent"]
    /\ surfaced   = [t \in Transitions |-> FALSE]

\* BUG: the Soft Delete write lands as its own step — no surfacing, no finding,
\* no compensation obligation taken on. The orphan is silent.
WriteSoft(t) ==
    /\ softState[t] = "absent"
    /\ softState' = [softState EXCEPT ![t] = "present"]
    /\ UNCHANGED <<auditState, surfaced>>

\* The audit write may eventually follow — or never. Even when it does, the
\* interleaving already passed through the silent orphan.
WriteAudit(t) ==
    /\ softState[t] = "present"
    /\ auditState[t] = "absent"
    /\ auditState' = [auditState EXCEPT ![t] = "clean"]
    /\ UNCHANGED <<softState, surfaced>>

Next == \E t \in Transitions : WriteSoft(t) \/ WriteAudit(t)
Spec == Init /\ [][Next]_vars

Orphan(t) == softState[t] = "present" /\ auditState[t] = "absent"

Coherent(t) ==
    \/ (softState[t] = "absent"  /\ auditState[t] = "absent" /\ ~surfaced[t])
    \/ (softState[t] = "present" /\ auditState[t] \in {"clean", "recovered"})

Inv4_SafetyBijection == \A t \in Transitions : Coherent(t) \/ (Orphan(t) /\ surfaced[t])

Inv4_NoUnsurfacedOrphan == \A t \in Transitions : Orphan(t) => surfaced[t]

Inv4_NoOrphanAudit ==
    \A t \in Transitions : (auditState[t] # "absent") => (softState[t] = "present")

Inv4_RecoveryDistinguishable ==
    \A t \in Transitions :
        /\ (auditState[t] = "clean")     => ~surfaced[t]
        /\ (auditState[t] = "recovered") => surfaced[t]

Safety ==
    /\ TypeOK
    /\ Inv4_SafetyBijection
    /\ Inv4_NoUnsurfacedOrphan
    /\ Inv4_NoOrphanAudit
    /\ Inv4_RecoveryDistinguishable

====
