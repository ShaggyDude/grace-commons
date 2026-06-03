---- MODULE credential-buggy ----
\* Grace Commons — Credential atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to credential.tla EXCEPT `register` is split into a non-atomic
\* check-then-commit: `RegisterObserve` checks "no Active credential" and marks a
\* slot pending; `RegisterCommit` makes it Active later. Two concurrent registers
\* can both observe no-Active and both commit — the duplicate-active-credential
\* race that active uniqueness forbids.
\*
\* Expected result: Inv_ActiveUniqueness VIOLATED. RegisterObserve(m1),
\* RegisterObserve(m2) (both see ActiveCount = 0; "checking" is not Active),
\* RegisterCommit(m1), RegisterCommit(m2) -> two Active credentials. If the checker
\* reports all invariants hold here, the harness is vacuous.

EXTENDS Naturals, FiniteSets

CONSTANT MaxC

Status == {"none", "checking", "Active", "Rotated", "Revoked", "Expired"}

VARIABLE status
vars == <<status>>

ActiveCount == Cardinality({k \in 1..MaxC : status[k] = "Active"})

TypeOK == status \in [1..MaxC -> Status]
Init == status = [k \in 1..MaxC |-> "none"]

\* BUG: check and commit are separate steps; the check reads ActiveCount at
\* observe time, the commit applies Active later with no re-check.
RegisterObserve ==
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status' = [status EXCEPT ![m] = "checking"]

RegisterCommit ==
    /\ \E m \in 1..MaxC :
        /\ status[m] = "checking"
        /\ status' = [status EXCEPT ![m] = "Active"]

RotateAtomic ==
    /\ \E k, m \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status[m] = "none"
        /\ k # m
        /\ status' = [status EXCEPT ![k] = "Rotated", ![m] = "Active"]

Revoke ==
    /\ \E k \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status' = [status EXCEPT ![k] = "Revoked"]

Expire ==
    /\ \E k \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status' = [status EXCEPT ![k] = "Expired"]

Next == RegisterObserve \/ RegisterCommit \/ RotateAtomic \/ Revoke \/ Expire
Spec == Init /\ [][Next]_vars

Inv_ActiveUniqueness == ActiveCount <= 1
Safety == TypeOK /\ Inv_ActiveUniqueness

====
