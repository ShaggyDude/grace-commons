---- MODULE credential-buggy ----
\* Grace Commons — Credential atom: BUGGY TWIN (vacuity guard).
\*
\* Introduces TWO bugs relative to credential.tla:
\*
\* BUG 1 — Rotation-chain integrity (PRIMARY, targets Inv_RotationChain):
\*   RotateAtomic_Buggy transitions the prior slot to Rotated WITHOUT setting
\*   successor[k]. The slot is Rotated but successor[k] = 0 — a dangling chain.
\*   Inv_RotationChain (every Rotated slot has a non-null successor link) is
\*   violated. This is the primary targeted invariant for this twin.
\*
\* BUG 2 — Active uniqueness (PRESERVED, targets Inv_ActiveUniqueness):
\*   `register` is split into a non-atomic check-then-commit: RegisterObserve
\*   marks a slot "checking"; RegisterCommit makes it Active without re-checking
\*   ActiveCount. Two concurrent registers both observe ActiveCount = 0 and both
\*   commit -> two Active credentials.
\*
\* The checker will find a violation: Inv_RotationChain fires first (or at the
\* shortest counterexample path). Both invariants are included in Safety so either
\* failure constitutes a rejection of this twin.
\*
\* Expected result: Safety VIOLATED (Inv_RotationChain — dangling successor link
\* after rotation). If the checker reports all invariants hold here, the harness
\* is vacuous.

EXTENDS Naturals, FiniteSets

CONSTANT MaxC

Status == {"none", "checking", "Active", "Rotated", "Revoked", "Expired"}

VARIABLES
    status,                 \* 1..MaxC -> Status
    successor               \* 1..MaxC -> 0..MaxC  (0 = null successor link)

vars == <<status, successor>>

ActiveCount == Cardinality({k \in 1..MaxC : status[k] = "Active"})

TypeOK ==
    /\ status \in [1..MaxC -> Status]
    /\ successor \in [1..MaxC -> 0..MaxC]

Init ==
    /\ status    = [k \in 1..MaxC |-> "none"]
    /\ successor = [k \in 1..MaxC |-> 0]

\* BUG 1 (register split — TOCTOU): check and commit are separate steps.
RegisterObserve ==
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status'    = [status    EXCEPT ![m] = "checking"]
        /\ UNCHANGED successor

RegisterCommit ==
    /\ \E m \in 1..MaxC :
        /\ status[m] = "checking"
        /\ status'    = [status    EXCEPT ![m] = "Active"]
        /\ UNCHANGED successor

\* BUG 2 (dangling rotation chain): transitions prior slot to Rotated WITHOUT
\* writing the successor link. successor[k] stays 0 -> Inv_RotationChain violated.
RotateAtomic_Buggy ==
    /\ \E k, m \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status[m] = "none"
        /\ k # m
        /\ status'    = [status    EXCEPT ![k] = "Rotated", ![m] = "Active"]
        /\ UNCHANGED successor

Revoke ==
    /\ \E k \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status'    = [status    EXCEPT ![k] = "Revoked"]
        /\ UNCHANGED successor

Expire ==
    /\ \E k \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status'    = [status    EXCEPT ![k] = "Expired"]
        /\ UNCHANGED successor

Next ==
    \/ RegisterObserve
    \/ RegisterCommit
    \/ RotateAtomic_Buggy
    \/ Revoke
    \/ Expire

Spec == Init /\ [][Next]_vars

Inv_ActiveUniqueness == ActiveCount <= 1
Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0

Safety == TypeOK /\ Inv_ActiveUniqueness /\ Inv_RotationChain

====
