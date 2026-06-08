---- MODULE credential-buggy-toctou ----
\* Grace Commons — Credential atom: BUGGY TWIN (vacuity guard) — Invariant 2.
\*
\* This is the second of two isolated buggy twins. It targets Invariant 2
\* (active uniqueness under concurrent register). Its sibling
\* `credential-buggy.tla` targets Invariant 7 (rotation-chain integrity).
\* Splitting the hazards across two twins gives each load-bearing invariant its
\* own reachable, checker-rejected counterexample — a combined twin would surface
\* only the shorter violation (the Inv 7 counterexample at 16 states would mask
\* the Inv 2 counterexample at 33 states, leaving Inv 2 unverified).
\*
\* BUG — non-atomic register (TOCTOU): `register` is split into a check-then-
\* commit. RegisterObserve marks a slot "checking" while ActiveCount = 0;
\* RegisterCommit makes it Active without re-checking. Two concurrent registers
\* both observe ActiveCount = 0 and both commit -> two Active credentials.
\* Inv_ActiveUniqueness is violated. `rotate` here is the CORRECT atomic form
\* (it sets the successor link), so Inv_RotationChain still HOLDS — the violation
\* is isolated to active uniqueness. If the checker reports all invariants hold
\* here, the Inv 2 check is vacuous.
\*
\* Expected result: Safety VIOLATED (Inv_ActiveUniqueness).  Sequence:
\* RegisterObserve(1), RegisterObserve(2) (both see ActiveCount = 0),
\* RegisterCommit(1), RegisterCommit(2) -> two Active credentials.

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

\* BUG (register split — TOCTOU): check and commit are separate steps, so two
\* concurrent registers can both observe ActiveCount = 0 and both commit.
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

\* CORRECT atomic rotate (Inv 7 preserved): prior Active -> Rotated and successor
\* -> Active, atomically, setting successor[k] = m so the chain link is non-null.
RotateAtomic ==
    /\ \E k, m \in 1..MaxC :
        /\ status[k] = "Active"
        /\ status[m] = "none"
        /\ k # m
        /\ status'    = [status    EXCEPT ![k] = "Rotated", ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![k] = m,         ![m] = 0]

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

Next == RegisterObserve \/ RegisterCommit \/ RotateAtomic \/ Revoke \/ Expire
Spec == Init /\ [][Next]_vars

Inv_ActiveUniqueness == ActiveCount <= 1
Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0

Safety == TypeOK /\ Inv_ActiveUniqueness /\ Inv_RotationChain

====
