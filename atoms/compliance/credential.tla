---- MODULE credential ----
\* Grace Commons — Credential atom.
\* Spec-level formal sibling of atoms/compliance/credential.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is active uniqueness: at most one Active credential per
\* (principal_ref, credential_type) pair, enforced by register's
\* `duplicate-active-credential` precondition, AND preserved across rotate
\* (which atomically registers a successor and transitions the prior to Rotated).
\* The interesting race the model targets: two concurrent `register` calls that
\* both observe "no Active credential" and both commit.
\*
\* MODELING CHOICES
\* - One (principal, type) pair with up to `MaxC` credential slots, each
\*   {none, Active, Rotated, Revoked, Expired}. `register` (atomic check-and-
\*   commit), `rotate` (atomic), `revoke`, `expire`.
\*
\* NOT MODELED (out of scope): id discipline, verify/material derivation,
\* expires_at clock arithmetic (Expired modeled as a nondeterministic transition).

EXTENDS Naturals, FiniteSets

CONSTANT MaxC               \* credential slots for the (principal, type) pair

Status == {"none", "Active", "Rotated", "Revoked", "Expired"}

VARIABLE status             \* 1..MaxC -> Status
vars == <<status>>

ActiveCount == Cardinality({k \in 1..MaxC : status[k] = "Active"})

TypeOK == status \in [1..MaxC -> Status]
Init == status = [k \in 1..MaxC |-> "none"]

\* CORRECT register: atomic check-and-commit — register Active only when no
\* Active credential exists for the pair, in one step (duplicate-active-credential
\* precondition enforced atomically).
RegisterAtomic ==
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxC :
        /\ status[m] = "none"
        /\ status' = [status EXCEPT ![m] = "Active"]

\* CORRECT rotate: prior Active -> Rotated and successor -> Active, atomically.
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

Next == RegisterAtomic \/ RotateAtomic \/ Revoke \/ Expire
Spec == Init /\ [][Next]_vars

\* Load-bearing — at most one Active credential per (principal, type) pair.
Inv_ActiveUniqueness == ActiveCount <= 1
Safety == TypeOK /\ Inv_ActiveUniqueness

\* NOTE rotate atomicity is what holds active uniqueness THROUGH a rotation:
\* RotateAtomic is one step, so no reachable state shows two Active credentials.
\* The buggy twin splits register's check from its commit and the invariant
\* catches the two-Active window.

====
