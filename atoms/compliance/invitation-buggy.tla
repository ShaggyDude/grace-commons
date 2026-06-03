---- MODULE invitation-buggy ----
\* Grace Commons — Invitation atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to invitation.tla EXCEPT `Accept` drops the `state = Pending` guard,
\* allowing an already-resolved invitation to be re-resolved to Accepted — the
\* second-resolution the single-resolution / already-resolved rule forbids.
\*
\* Expected result: Inv_SingleResolution VIOLATED. Decline (state = Declined,
\* resolution = Declined), then AcceptBuggy -> state = Accepted while
\* resolution = Declined. If the checker reports all invariants hold here, the
\* harness is vacuous: a re-resolvable invitation would be safe, which is exactly
\* what single-resolution atomicity denies.

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

\* BUG: no Pending guard — Accept can override an already-resolved invitation.
\* resolution keeps the first terminal it recorded, so the override is detectable.
Accept ==
    /\ state' = "Accepted"
    /\ resolution' = IF resolution = "none" THEN "Accepted" ELSE resolution

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

Inv_SingleResolution == (resolution # "none") => (state = resolution)
Safety == TypeOK /\ Inv_SingleResolution

====
