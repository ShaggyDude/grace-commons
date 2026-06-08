---- MODULE invitation ----
\* Grace Commons — Invitation atom.
\* Spec-level formal sibling of atoms/invitation.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is single-resolution atomicity: exactly one transition
\* out of Pending. Once an invitation has been accepted, declined, expired, or
\* revoked, any subsequent action returns already-resolved(state) — the
\* resolution is immutable. The race the model targets: concurrent
\* accept/decline/revoke on a Pending invitation, where only one may win.
\*
\* MODELING CHOICES
\* - One invitation. `state` in {Pending, Accepted, Declined, Expired, Revoked};
\*   ghost `resolution` records the FIRST terminal state reached, so "the
\*   resolution never changes once set" is the falsifiable predicate
\*   resolution # none => state = resolution. Each resolving action guards on
\*   state = Pending, so the first interleaved winner resolves and every later
\*   attempt is disabled (already-resolved).
\*
\* NOT MODELED (out of scope): identity binding at accept, field validation,
\* id discipline, the accepting_identity_ref immutability (structural).

VARIABLES state, resolution
vars == <<state, resolution>>

Terminals == {"Accepted", "Declined", "Expired", "Revoked"}
States == {"Pending"} \cup Terminals

TypeOK ==
    /\ state \in States
    /\ resolution \in (Terminals \cup {"none"})

Init ==
    /\ state = "Pending"
    /\ resolution = "none"

\* Each resolution guards on Pending: exactly one transition out of Pending wins;
\* every later attempt is disabled (the already-resolved rejection).
Accept ==
    /\ state = "Pending"
    /\ state' = "Accepted"
    /\ resolution' = "Accepted"
Decline ==
    /\ state = "Pending"
    /\ state' = "Declined"
    /\ resolution' = "Declined"
Revoke ==
    /\ state = "Pending"
    /\ state' = "Revoked"
    /\ resolution' = "Revoked"
Expire ==
    /\ state = "Pending"
    /\ state' = "Expired"
    /\ resolution' = "Expired"

Next == Accept \/ Decline \/ Revoke \/ Expire
Spec == Init /\ [][Next]_vars

\* Load-bearing — once resolved, the resolution is immutable (single-resolution).
Inv_SingleResolution == (resolution # "none") => (state = resolution)
Safety == TypeOK /\ Inv_SingleResolution

====
