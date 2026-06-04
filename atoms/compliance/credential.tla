---- MODULE credential ----
\* Grace Commons — Credential atom.
\* Spec-level formal sibling of atoms/compliance/credential.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* Two load-bearing claims:
\* (1) Active uniqueness (Inv 2): at most one Active credential per
\*     (principal_ref, credential_type) pair, enforced by register's
\*     `duplicate-active-credential` precondition, AND preserved across rotate
\*     (which atomically registers a successor and transitions the prior to
\*     Rotated). The interesting race: two concurrent `register` calls that
\*     both observe "no Active credential" and both commit.
\* (2) Rotation-chain integrity (Inv 7): every slot in Rotated status has a
\*     non-null successor link (successor[k] # 0). In this model all slots
\*     share one (principal, type) pair by construction, so the same-pair
\*     clause of Inv 7 is satisfied structurally — the asserted check covers
\*     the non-null-successor-link half, and the same-pair half is
\*     by-construction (recorded honestly in tools/harness/coverage/credential.md).
\*
\* MODELING CHOICES
\* - One (principal, type) pair with up to `MaxC` credential slots, each
\*   {none, Active, Rotated, Revoked, Expired}. `register` (atomic check-and-
\*   commit), `rotate` (atomic), `revoke`, `expire`.
\* - successor: 1..MaxC -> 0..MaxC ; 0 = null (no link), k = slot index of
\*   the successor credential. Set by RotateAtomic; never mutated thereafter.
\*
\* NOT MODELED (out of scope): id discipline, verify/material derivation,
\* expires_at clock arithmetic (Expired modeled as a nondeterministic transition).

EXTENDS Naturals, FiniteSets

CONSTANT MaxC               \* credential slots for the (principal, type) pair

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

\* CORRECT register: atomic check-and-commit — register Active only when no
\* Active credential exists for the pair, in one step (duplicate-active-credential
\* precondition enforced atomically).
RegisterAtomic ==
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status'    = [status    EXCEPT ![m] = "Active"]
        /\ successor' = [successor EXCEPT ![m] = 0]

\* CORRECT rotate: prior Active -> Rotated and successor -> Active, atomically.
\* Sets successor[k] = m so the rotation-chain link is non-null on the prior slot.
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

Next == RegisterAtomic \/ RotateAtomic \/ Revoke \/ Expire
Spec == Init /\ [][Next]_vars

\* Inv 2: at most one Active credential per (principal, type) pair.
Inv_ActiveUniqueness == ActiveCount <= 1

\* Inv 7: every Rotated slot has a non-null successor link.
\* Same-pair clause holds by-construction (single-pair model scope).
Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0

Safety == TypeOK /\ Inv_ActiveUniqueness /\ Inv_RotationChain

\* NOTE rotate atomicity is what holds active uniqueness THROUGH a rotation:
\* RotateAtomic is one step, so no reachable state shows two Active credentials.
\* The buggy twin (credential-buggy.tla) covers two failure modes:
\*   - Inv_ActiveUniqueness: split register check-then-commit (TOCTOU race).
\*   - Inv_RotationChain: rotate sets status to Rotated without setting the
\*     successor link, producing a dangling chain the invariant catches.

====
