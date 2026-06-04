---- MODULE credential-buggy ----
\* Grace Commons — Credential atom: BUGGY TWIN (vacuity guard) — Invariant 7.
\*
\* This is the first of two isolated buggy twins. It targets Invariant 7
\* (rotation-chain integrity). Its sibling `credential-buggy-toctou.tla` targets
\* Invariant 2 (active uniqueness under concurrent register). Splitting the
\* hazards across two twins gives each load-bearing invariant its own reachable,
\* checker-rejected counterexample — a combined twin would only ever surface the
\* shorter of the two violations (the Inv 7 counterexample at 16 states would
\* mask the Inv 2 counterexample at 33 states, leaving Inv 2 with no demonstrated
\* rejection in `audit.mjs`).
\*
\* BUG — dangling rotation chain: RotateAtomic_Buggy transitions the prior slot
\* to Rotated WITHOUT writing the successor link. successor[k] stays 0 ->
\* Inv_RotationChain (every Rotated slot has a non-null successor) is violated.
\* `register` here is the CORRECT atomic check-and-commit, so Inv_ActiveUniqueness
\* still HOLDS — the violation is isolated to the rotation chain. If the checker
\* reports all invariants hold here, the Inv 7 check is vacuous.
\*
\* Expected result: Safety VIOLATED (Inv_RotationChain).  Sequence: register a
\* credential (slot 1 -> Active), rotate it (slot 1 -> Rotated, slot 2 -> Active,
\* successor[1] left at 0) -> Rotated slot with successor 0.

EXTENDS Naturals, FiniteSets

CONSTANT MaxC

Status == {"none", "Active", "Rotated", "Revoked", "Expired"}

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

\* CORRECT atomic register (Inv 2 preserved): register Active only when no Active
\* credential exists for the pair, in one step.
RegisterAtomic ==
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status'    = [status    EXCEPT ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![m] = 0]

\* BUG (dangling rotation chain): transitions prior slot to Rotated WITHOUT
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

Next == RegisterAtomic \/ RotateAtomic_Buggy \/ Revoke \/ Expire
Spec == Init /\ [][Next]_vars

Inv_ActiveUniqueness == ActiveCount <= 1
Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0

Safety == TypeOK /\ Inv_ActiveUniqueness /\ Inv_RotationChain

====
