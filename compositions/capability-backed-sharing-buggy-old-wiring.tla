---- MODULE capability-backed-sharing-buggy-old-wiring ----
\* BUGGY TWIN (ordering hazard; vacuity guard) for capability-backed-sharing.tla.
\* Grace Commons — derived validator. The English spec is the source of truth.
\*
\* NEW 2026-08-27. This twin is not a hypothetical mis-implementation invented to
\* guard an invariant. IT IS THIS COMPOSITION'S OWN PREVIOUS WIRING, and it is
\* here because a repair whose necessity cannot be demonstrated is indistinguishable
\* from a preference. Until 2026-08-27 [Redeem And Disclose] step 3 committed the
\* redemption-decrement, the Selective Disclosure record and the sharing.disclosed
\* Audit Trail append "together or not at all" under the host transaction boundary.
\*
\* BUG: the append sits INSIDE the transaction's atomic set, where the substrate
\* cannot put it. Audit Trail declares that an appended event cannot be withdrawn
\* and that synchronous rollback is unavailable to it, so the host transaction
\* never enlisted the append and could never have rolled it back. The transaction
\* can therefore abort after the append has landed, and the trail is left asserting
\* a disclosure that the canonical state says never happened.
\*
\* Modeled directly: WriteAuditInTx makes the append durable while txState is
\* still "absent", and AbortTx is the abort that leaves it that way permanently.
\* TLC reaches (auditState = present-ish, txState = absent) and rejects on
\* Inv2_NoOrphanSeal.
\*
\* Why this is the worst of the three partials, and why the repair was a wiring
\* change rather than a restatement: the other two are recoverable. An unattested
\* capability can be revoked or attested; an unsealed disclosure can be sealed.
\* This one cannot be repaired at all — the event cannot be withdrawn, and
\* manufacturing a disclosure record after the fact would fabricate the very
\* evidence the seal exists to protect. A composition cannot honestly restate its
\* way out of a reachable state it has no way to leave.
\*
\* Breaks Inv2_NoOrphanSeal. It leaves Inv2_NoUnsurfacedUnsealed intact — nothing
\* here commits a disclosure whose seal is missing — which is what keeps this twin
\* dedicated to the ordering claim rather than to the silence claim, whose own twin
\* is capability-backed-sharing-buggy.tla.

CONSTANT Disclosures

VARIABLES intentState, txState, auditState, surfaced
vars == <<intentState, txState, auditState, surfaced>>

TypeOK ==
    /\ intentState \in [Disclosures -> {"absent", "present"}]
    /\ txState     \in [Disclosures -> {"absent", "committed", "aborted"}]
    /\ auditState  \in [Disclosures -> {"absent", "clean", "recovered"}]
    /\ surfaced    \in [Disclosures -> BOOLEAN]

Init ==
    /\ intentState = [d \in Disclosures |-> "absent"]
    /\ txState     = [d \in Disclosures |-> "absent"]
    /\ auditState  = [d \in Disclosures |-> "absent"]
    /\ surfaced    = [d \in Disclosures |-> FALSE]

WriteIntent(d) ==
    /\ intentState[d] = "absent"
    /\ intentState' = [intentState EXCEPT ![d] = "present"]
    /\ UNCHANGED <<txState, auditState, surfaced>>

\* BUG: the append is made durable while the transaction is still open. The old
\* wiring believed this write would roll back with the transaction. It cannot.
WriteAuditInTx(d) ==
    /\ intentState[d] = "present"
    /\ txState[d] = "absent"
    /\ auditState[d] = "absent"
    /\ auditState' = [auditState EXCEPT ![d] = "clean"]
    /\ UNCHANGED <<intentState, txState, surfaced>>

CommitTx(d) ==
    /\ auditState[d] = "clean"
    /\ txState[d] = "absent"
    /\ txState' = [txState EXCEPT ![d] = "committed"]
    /\ UNCHANGED <<intentState, auditState, surfaced>>

\* The abort the old wiring assumed would take the append with it.
AbortTx(d) ==
    /\ auditState[d] = "clean"
    /\ txState[d] = "absent"
    /\ txState' = [txState EXCEPT ![d] = "aborted"]
    /\ UNCHANGED <<intentState, auditState, surfaced>>

Next == \E d \in Disclosures :
            WriteIntent(d) \/ WriteAuditInTx(d) \/ CommitTx(d) \/ AbortTx(d)
Spec == Init /\ [][Next]_vars

Inv2_NoOrphanSeal ==
    \A d \in Disclosures :
        (auditState[d] \in {"clean", "recovered"}) => (txState[d] = "committed")
Inv2_NoUnsurfacedUnsealed ==
    \A d \in Disclosures :
        (txState[d] = "committed" /\ auditState[d] = "absent") => surfaced[d]
Inv2_IntentPrecedesCommit ==
    \A d \in Disclosures :
        (txState[d] = "committed") => (intentState[d] = "present")
Inv2_RecoveryDistinguishable ==
    \A d \in Disclosures :
        /\ (auditState[d] = "clean")     => ~surfaced[d]
        /\ (auditState[d] = "recovered") => surfaced[d]
Coherent(d) ==
    \/ (txState[d] = "absent"    /\ auditState[d] = "absent")
    \/ (txState[d] = "committed" /\ auditState[d] \in {"clean", "recovered"})
Unsealed(d) == txState[d] = "committed" /\ auditState[d] = "absent"
Inv2_BindingBijection ==
    \A d \in Disclosures : Coherent(d) \/ (Unsealed(d) /\ surfaced[d])

Safety ==
    /\ TypeOK
    /\ Inv2_NoOrphanSeal
    /\ Inv2_NoUnsurfacedUnsealed
    /\ Inv2_IntentPrecedesCommit
    /\ Inv2_RecoveryDistinguishable
    /\ Inv2_BindingBijection

====
