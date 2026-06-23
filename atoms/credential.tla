---- MODULE credential ----
\* Grace Commons — Credential atom (execution/render-time refactor, 2026-06-21).
\* Spec-level formal sibling of atoms/credential.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* (1) Active uniqueness over EFFECTIVE-Active (Inv 2): at most one credential
\*     per (principal_ref, credential_type) pair is EFFECTIVE-Active, where
\*     EFFECTIVE-Active == stored Active AND now < ExpiresAt. This is the
\*     load-bearing subtlety of the refactor: a stored-Active-but-now-expired
\*     credential does NOT occupy the Active slot, so register/rotate guard on
\*     effective-Active (reading the injected clock), not on the stored flag.
\*     The interesting race is still two concurrent atomic registers, but the
\*     uniqueness predicate is now phrased against the derivation.
\* (2) Rotation-chain integrity (Inv 7): every slot in Rotated status has a
\*     non-null successor link (successor[k] # 0). In this model all slots share
\*     one (principal, type) pair by construction, so the same-pair clause of
\*     Inv 7 is satisfied structurally — the asserted check covers the
\*     non-null-successor-link half, and the same-pair half is by-construction
\*     (recorded honestly in tools/harness/coverage/credential.md).
\* (3) Expiry is DERIVED, never written. There is NO stored Expired status and
\*     no action that writes one. `Expired` is the read-time projection
\*     EffStatus(k, now). A resolving/lifecycle write fires only while a slot is
\*     stored-Active (revoke, rotate) and, for register/rotate's uniqueness
\*     guard, only while no slot is effective-Active. The store never holds an
\*     "Expired" value (Inv_NoStoredExpired), and the derivation never
\*     misclassifies a written terminal (Inv_DerivedExpiryCoherent).
\*
\* MODELING CHOICES
\* - One (principal, type) pair with up to `MaxC` credential slots, each in the
\*   STORED set {none, Active, Rotated, Revoked} — NO stored Expired.
\* - `now` is an injected clock that only advances (Tick); `ExpiresAt` is a fixed
\*   deadline shared by every slot (one pair, one expiry window in this model).
\*   The injected `now` is READ in the effective-Active guard (pure), never used
\*   to WRITE an Expired state.
\* - successor: 1..MaxC -> 0..MaxC ; 0 = null (no link), k = slot index of the
\*   successor credential. Set by RotateAtomic; never mutated thereafter.
\*
\* NOT MODELED (out of scope, named): id discipline, verify/material derivation,
\* per-credential distinct expires_at values (one shared deadline here), and the
\* immutability of stored fields (structural).

EXTENDS Naturals, FiniteSets

CONSTANT ExpiresAt          \* fixed deadline (a natural; lapsed once now >= ExpiresAt)
CONSTANT MaxClock           \* clock saturation bound (raise until state count stops growing)
CONSTANT MaxC               \* credential slots for the (principal, type) pair

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

\* Derived, read-time effective status (render time). Never stored. A stored-Active
\* slot whose window has lapsed reads "Expired"; every other slot reads its stored
\* status. EffStatus is a pure projection over the slot and the injected clock.
Lapsed(k, c)    == (status[k] = "Active") /\ (c >= ExpiresAt)
EffStatus(k, c) == IF Lapsed(k, c) THEN "Expired" ELSE status[k]

\* EFFECTIVE-Active is the load-bearing notion: stored Active AND not yet lapsed.
\* The uniqueness rule (Inv 2) ranges over THIS, not over the stored flag.
EffActive(k, c)    == EffStatus(k, c) = "Active"
EffActiveCount(c)  == Cardinality({k \in 1..MaxC : EffActive(k, c)})

\* The injected clock advances at the I/O seam; it writes nothing else.
Tick ==
    /\ now < MaxClock
    /\ now' = now + 1
    /\ UNCHANGED <<status, successor>>

\* CORRECT register: atomic check-and-commit — register Active only when no
\* EFFECTIVE-Active credential exists for the pair, in one step. The uniqueness
\* guard reads the injected `now` (pure): a stored-Active-but-lapsed slot does
\* NOT block registration, because it does not occupy the effective-Active slot.
RegisterAtomic ==
    /\ EffActiveCount(now) = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status'    = [status    EXCEPT ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![m] = 0]
        /\ UNCHANGED now

\* CORRECT rotate: prior EFFECTIVE-Active -> Rotated and successor -> Active,
\* atomically. Sets successor[k] = m so the rotation-chain link is non-null on the
\* prior slot. rotate guards on EFFECTIVE-Active: a lapsed slot cannot be rotated
\* (it reads Expired by derivation) — verify/rotate/revoke treat it as terminal.
RotateAtomic ==
    /\ \E k, m \in 1..MaxC :
        /\ EffActive(k, now)
        /\ status[m] = "none"
        /\ k # m
        /\ status'    = [status    EXCEPT ![k] = "Rotated", ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![k] = m,         ![m] = 0]
        /\ UNCHANGED now

\* revoke guards on EFFECTIVE-Active: a lapsed slot reads Expired by derivation
\* and is treated as terminal, so revoke does not fire against it (no write).
Revoke ==
    /\ \E k \in 1..MaxC :
        /\ EffActive(k, now)
        /\ status'    = [status    EXCEPT ![k] = "Revoked"]
        /\ UNCHANGED <<successor, now>>

Next == RegisterAtomic \/ RotateAtomic \/ Revoke \/ Tick
Spec == Init /\ [][Next]_vars

\* Inv 2 (reworded for the refactor): at most one EFFECTIVE-Active credential per
\* (principal, type) pair — stored Active AND now < ExpiresAt. A stored-Active
\* slot past the deadline does not count, so two such slots are NOT a violation
\* (neither occupies the effective-Active slot); the slot they would both block
\* is the effective one.
Inv_EffectiveActiveUniqueness == EffActiveCount(now) <= 1

\* Inv 7: every Rotated slot has a non-null successor link.
\* Same-pair clause holds by-construction (single-pair model scope).
Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0

\* Expiry is derived, never written: the store never holds an "Expired" value
\* (by construction — no action writes it; promoted to an explicit check so a
\* future edit that re-introduces a stored Expired is caught).
Inv_NoStoredExpired == \A k \in 1..MaxC : status[k] \in StoredStatus

\* The derivation never misclassifies a written terminal as Expired: a stored
\* terminal (Rotated/Revoked) always reads back as itself, never "Expired".
Inv_DerivedExpiryCoherent ==
    \A k \in 1..MaxC : status[k] \in {"Rotated", "Revoked"} => (EffStatus(k, now) = status[k])

Safety ==
    /\ TypeOK
    /\ Inv_EffectiveActiveUniqueness
    /\ Inv_RotationChain
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent

\* NOTE rotate atomicity is what holds effective-active uniqueness THROUGH a
\* rotation: RotateAtomic is one step, so no reachable state shows two
\* effective-Active credentials. The two isolated buggy twins cover:
\*   - credential-buggy-toctou.tla: Inv_EffectiveActiveUniqueness via a split
\*     register check-then-commit (the duplicate-active-credential TOCTOU race),
\*     reintroducing the time-of-check/time-of-use hazard.
\*   - credential-buggy.tla: Inv_RotationChain via rotate setting Rotated without
\*     writing the successor link (a dangling chain).

====
