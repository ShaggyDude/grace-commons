---- MODULE invitation-buggy ----
\* Grace Commons — Invitation atom: BUGGY TWIN (vacuity guard).
\* Mirrors invitation.tla (execution/render-time refactor, 2026-06-21) EXCEPT
\* `AcceptBuggy` drops the `state = Pending` guard, allowing an already-resolved
\* invitation to be re-resolved to Accepted — the second resolution that the
\* single-resolution / already-resolved rule forbids.
\*
\* Expected result: Inv_SingleResolution VIOLATED. Decline (state = Declined,
\* resolution = Declined), then AcceptBuggy -> state = Accepted while
\* resolution = Declined. If the checker reports all invariants hold here, the
\* harness is vacuous: a re-resolvable invitation would be safe, which is exactly
\* what single-resolution by write denies.

EXTENDS Naturals

CONSTANT ExpiresAt
CONSTANT MaxClock

VARIABLES state, resolution, now
vars == <<state, resolution, now>>

StoredTerminals == {"Accepted", "Declined", "Revoked"}
StoredStates    == {"Pending"} \cup StoredTerminals

TypeOK ==
    /\ state \in StoredStates
    /\ resolution \in (StoredTerminals \cup {"none"})
    /\ now \in 0..MaxClock

Init ==
    /\ state = "Pending"
    /\ resolution = "none"
    /\ now = 0

Tick ==
    /\ now < MaxClock
    /\ now' = now + 1
    /\ UNCHANGED <<state, resolution>>

\* BUG: no `state = Pending` guard — AcceptBuggy can override an already-resolved
\* invitation. `resolution` keeps the first terminal recorded, so the override is
\* detectable by Inv_SingleResolution.
AcceptBuggy ==
    /\ now < ExpiresAt
    /\ state' = "Accepted"
    /\ resolution' = IF resolution = "none" THEN "Accepted" ELSE resolution
    /\ UNCHANGED now

Resolve(t) ==
    /\ state = "Pending"
    /\ now < ExpiresAt
    /\ state' = t
    /\ resolution' = IF resolution = "none" THEN t ELSE resolution
    /\ UNCHANGED now

Decline == Resolve("Declined")
Revoke  == Resolve("Revoked")

Next == AcceptBuggy \/ Decline \/ Revoke \/ Tick
Spec == Init /\ [][Next]_vars

Inv_SingleResolution == (resolution # "none") => (state = resolution)
Inv_NoStoredExpired == state \in StoredStates
Inv_DerivedExpiryCoherent == (state \in StoredTerminals) => ((IF (state = "Pending") /\ (now >= ExpiresAt) THEN "Expired" ELSE state) = state)

Safety ==
    /\ TypeOK
    /\ Inv_SingleResolution
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent
====
