---- MODULE capability-backed-sharing-buggy ----
\* BUGGY TWIN (silence hazard; vacuity guard) for capability-backed-sharing.tla.
\* Grace Commons — derived validator. The English spec is the source of truth.
\*
\* Rewritten 2026-08-27 alongside the correct model, when Invariant 2 was repaired
\* from one atomic commit to an ordering across durability boundaries (methodology
\* debt #19, the atomicity class). A twin has to break the invariant as it is NOW
\* stated, or it guards a claim the corpus no longer makes. The previous version of
\* this twin split one transaction into three interleavable writes; that split is
\* no longer a bug, because the repaired composition does exactly that on purpose.
\* What IS a bug is doing it silently.
\*
\* BUG: the domain transaction commits and the seal does not, with NO surfacing
\* and NO compensation. The unsealed disclosure is reachable here, but so it is in
\* the CORRECT model, deliberately; the difference is that here it is SILENT and
\* terminal. Nothing sets surfaced, nothing retries the append, and the state is a
\* dead end. That is what the repaired invariant turns on — not whether a partial
\* exists, but whether anyone is looking at it and whether it resolves.
\*
\* Breaks Inv2_NoUnsurfacedUnsealed. It leaves Inv2_NoOrphanSeal intact — the seal
\* still never precedes its commit — which is what keeps this twin dedicated to the
\* silence claim rather than to the ordering claim, whose own twin is
\* capability-backed-sharing-old-wiring-buggy.tla.

CONSTANT Disclosures

VARIABLES intentState, txState, auditState, surfaced
vars == <<intentState, txState, auditState, surfaced>>

TypeOK ==
    /\ intentState \in [Disclosures -> {"absent", "present"}]
    /\ txState     \in [Disclosures -> {"absent", "committed"}]
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

\* The transaction commits, and nothing surfaces the missing seal.
CommitTx(d) ==
    /\ intentState[d] = "present"
    /\ txState[d] = "absent"
    /\ txState' = [txState EXCEPT ![d] = "committed"]
    /\ UNCHANGED <<intentState, auditState, surfaced>>

Seal(d) ==
    /\ txState[d] = "committed"
    /\ auditState[d] = "absent"
    /\ auditState' = [auditState EXCEPT ![d] = "clean"]
    /\ UNCHANGED <<intentState, txState, surfaced>>

Next == \E d \in Disclosures : WriteIntent(d) \/ CommitTx(d) \/ Seal(d)
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
