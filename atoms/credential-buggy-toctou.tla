---- MODULE credential-buggy-toctou ----
\* Grace Commons — Credential atom: BUGGY TWIN (vacuity guard) — Invariant 2.
\* Mirrors credential.tla (execution/render-time refactor, 2026-06-21).
\*
\* This is the second of two isolated buggy twins. It targets Invariant 2
\* (EFFECTIVE-active uniqueness under concurrent register) by reintroducing the
\* time-of-check/time-of-use (TOCTOU) hazard. Its sibling `credential-buggy.tla`
\* targets Invariant 7 (rotation-chain integrity). Splitting the hazards across
\* two twins gives each load-bearing invariant its own reachable, checker-rejected
\* counterexample — a combined twin would surface only the shorter violation,
\* leaving the other invariant unverified.
\*
\* BUG — non-atomic register (TOCTOU against the effective-Active guard): the
\* uniqueness guard reads the injected clock at CHECK time but the commit does not
\* re-check. RegisterObserve marks a slot "checking" while EffActiveCount(now) = 0;
\* RegisterCommit makes it Active without re-checking. Two concurrent registers
\* both observe EffActiveCount = 0 and both commit -> two EFFECTIVE-Active
\* credentials. Inv_EffectiveActiveUniqueness is violated. `rotate` here is the
\* CORRECT atomic form (it sets the successor link), so Inv_RotationChain still
\* HOLDS — the violation is isolated to effective-active uniqueness. If the checker
\* reports all invariants hold here, the Inv 2 check is vacuous.
\*
\* This is the refactor's analog of the original duplicate-active-credential
\* TOCTOU, now phrased against the read-time effective-Active predicate: the guard
\* that must use injected `now` is split from its commit, so the time-of-check
\* value of the clock no longer governs the committed write.
\*
\* Expected result: Safety VIOLATED (Inv_EffectiveActiveUniqueness).  Sequence:
\* RegisterObserve(1), RegisterObserve(2) (both see EffActiveCount = 0),
\* RegisterCommit(1), RegisterCommit(2) -> two effective-Active credentials.

EXTENDS Naturals, FiniteSets

CONSTANT ExpiresAt
CONSTANT MaxClock
CONSTANT MaxC

\* `checking` is a transient interim stored value used only to split the register
\* TOCTOU; it is still a STORED value (never "Expired"), so Inv_NoStoredExpired
\* holds for it and the hazard stays isolated to effective-active uniqueness.
StoredStatus == {"none", "checking", "Active", "Rotated", "Revoked"}

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

\* BUG (register split — TOCTOU): check and commit are separate steps, so two
\* concurrent registers can both observe EffActiveCount = 0 and both commit.
RegisterObserve ==
    /\ EffActiveCount(now) = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status'    = [status    EXCEPT ![m] = "checking"]
        /\ UNCHANGED <<successor, now>>

RegisterCommit ==
    /\ \E m \in 1..MaxC :
        /\ status[m] = "checking"
        /\ status'    = [status    EXCEPT ![m] = "Active"]
        /\ UNCHANGED <<successor, now>>

\* CORRECT atomic rotate over EFFECTIVE-Active (Inv 7 preserved): prior
\* effective-Active -> Rotated and successor -> Active, atomically, setting
\* successor[k] = m so the chain link is non-null.
RotateAtomic ==
    /\ \E k, m \in 1..MaxC :
        /\ EffActive(k, now)
        /\ status[m] = "none"
        /\ k # m
        /\ status'    = [status    EXCEPT ![k] = "Rotated", ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![k] = m,         ![m] = 0]
        /\ UNCHANGED now

Revoke ==
    /\ \E k \in 1..MaxC :
        /\ EffActive(k, now)
        /\ status'    = [status    EXCEPT ![k] = "Revoked"]
        /\ UNCHANGED <<successor, now>>

Next == RegisterObserve \/ RegisterCommit \/ RotateAtomic \/ Revoke \/ Tick
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
