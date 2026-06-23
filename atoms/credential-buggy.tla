---- MODULE credential-buggy ----
\* Grace Commons — Credential atom: BUGGY TWIN (vacuity guard) — Invariant 7.
\* Mirrors credential.tla (execution/render-time refactor, 2026-06-21).
\*
\* This is the first of two isolated buggy twins. It targets Invariant 7
\* (rotation-chain integrity). Its sibling `credential-buggy-toctou.tla` targets
\* Invariant 2 (effective-active uniqueness under concurrent register / the
\* time-of-check/time-of-use hazard). Splitting the hazards across two twins gives
\* each load-bearing invariant its own reachable, checker-rejected counterexample —
\* a combined twin would only ever surface the shorter of the two violations,
\* leaving the other invariant with no demonstrated rejection in `audit.mjs`.
\*
\* BUG — dangling rotation chain: RotateAtomic_Buggy transitions the prior slot
\* to Rotated WITHOUT writing the successor link. successor[k] stays 0 ->
\* Inv_RotationChain (every Rotated slot has a non-null successor) is violated.
\* `register` here is the CORRECT atomic check-and-commit over EFFECTIVE-Active,
\* so Inv_EffectiveActiveUniqueness still HOLDS — the violation is isolated to the
\* rotation chain. If the checker reports all invariants hold here, the Inv 7
\* check is vacuous.
\*
\* Expected result: Safety VIOLATED (Inv_RotationChain).  Sequence: register a
\* credential (slot 1 -> Active), rotate it (slot 1 -> Rotated, slot 2 -> Active,
\* successor[1] left at 0) -> Rotated slot with successor 0.

EXTENDS Naturals, FiniteSets

CONSTANT ExpiresAt
CONSTANT MaxClock
CONSTANT MaxC

StoredStatus == {"none", "Active", "Rotated", "Revoked"}

VARIABLES
    status,                 \* 1..MaxC -> StoredStatus  (NO stored Expired)
    successor,              \* 1..MaxC -> 0..MaxC  (0 = null successor link)
    now                     \* injected clock

vars == <<status, successor, now>>

TypeOK ==
    /\ status \in [1..MaxC -> StoredStatus]
    /\ successor \in [1..MaxC -> 0..MaxC]
    /\ now \in 0..MaxClock

Init ==
    /\ status    = [k \in 1..MaxC |-> "none"]
    /\ successor = [k \in 1..MaxC |-> 0]
    /\ now       = 0

Lapsed(k, c)    == (status[k] = "Active") /\ (c >= ExpiresAt)
EffStatus(k, c) == IF Lapsed(k, c) THEN "Expired" ELSE status[k]
EffActive(k, c)    == EffStatus(k, c) = "Active"
EffActiveCount(c)  == Cardinality({k \in 1..MaxC : EffActive(k, c)})

Tick ==
    /\ now < MaxClock
    /\ now' = now + 1
    /\ UNCHANGED <<status, successor>>

\* CORRECT atomic register over EFFECTIVE-Active (Inv 2 preserved): register
\* Active only when no effective-Active credential exists for the pair, in one step.
RegisterAtomic ==
    /\ EffActiveCount(now) = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status'    = [status    EXCEPT ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![m] = 0]
        /\ UNCHANGED now

\* BUG (dangling rotation chain): transitions prior slot to Rotated WITHOUT
\* writing the successor link. successor[k] stays 0 -> Inv_RotationChain violated.
RotateAtomic_Buggy ==
    /\ \E k, m \in 1..MaxC :
        /\ EffActive(k, now)
        /\ status[m] = "none"
        /\ k # m
        /\ status'    = [status    EXCEPT ![k] = "Rotated", ![m] = "Active"]
        /\ UNCHANGED <<successor, now>>

Revoke ==
    /\ \E k \in 1..MaxC :
        /\ EffActive(k, now)
        /\ status'    = [status    EXCEPT ![k] = "Revoked"]
        /\ UNCHANGED <<successor, now>>

Next == RegisterAtomic \/ RotateAtomic_Buggy \/ Revoke \/ Tick
Spec == Init /\ [][Next]_vars

Inv_EffectiveActiveUniqueness == EffActiveCount(now) <= 1
Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0
Inv_NoStoredExpired == \A k \in 1..MaxC : status[k] \in StoredStatus
Inv_DerivedExpiryCoherent ==
    \A k \in 1..MaxC : status[k] \in {"Rotated", "Revoked"} => (EffStatus(k, now) = status[k])

Safety ==
    /\ TypeOK
    /\ Inv_EffectiveActiveUniqueness
    /\ Inv_RotationChain
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent

====
