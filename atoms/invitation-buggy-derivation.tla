---- MODULE invitation-buggy-derivation ----
\* Grace Commons — Invitation atom: BUGGY TWIN (derivation vacuity guard, FC F2).
\* Mirrors invitation.tla (execution/render-time refactor, 2026-06-21) EXCEPT
\* `EffStatus` is broken to return `state` UNCONDITIONALLY — it never derives
\* "Expired" for a lapsed Pending record. This is the failure mode the positive
\* derivation invariant must catch: an implementation that "forgets" to surface
\* Expired at read time and just echoes the stored status.
\*
\* Single-resolution is left CORRECT here (Resolve keeps the state = Pending
\* guard), so this twin isolates the derivation defect: only the POSITIVE
\* read-time derivation is broken.
\*
\* Expected result: Inv_LapsedReadsExpired VIOLATED. Tick the clock to ExpiresAt
\* while state = Pending: Lapsed(now) is true but BrokenEffStatus(now) = "Pending"
\* (not "Expired"). If the checker reports all invariants hold here, the positive
\* derivation was being asserted only vacuously (the FC F2 finding): the
\* Pending->Expired arc would be unverified.

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

Lapsed(c) == (state = "Pending") /\ (c >= ExpiresAt)

\* BUG: the derivation never returns "Expired" — it just echoes the stored state.
\* A lapsed Pending record therefore reads "Pending" instead of "Expired".
BrokenEffStatus(c) == state

Tick ==
    /\ now < ExpiresAt + 1
    /\ now' = now + 1
    /\ UNCHANGED <<state, resolution>>

Resolve(t) ==
    /\ state = "Pending"
    /\ now < ExpiresAt
    /\ state' = t
    /\ resolution' = IF resolution = "none" THEN t ELSE resolution
    /\ UNCHANGED now

Accept  == Resolve("Accepted")
Decline == Resolve("Declined")
Revoke  == Resolve("Revoked")

Next == Accept \/ Decline \/ Revoke \/ Tick
Spec == Init /\ [][Next]_vars

Inv_SingleResolution == (resolution # "none") => (state = resolution)
Inv_NoStoredExpired == state \in StoredStates
Inv_DerivedExpiryCoherent == (state \in StoredTerminals) => (BrokenEffStatus(now) = state)

\* This is the check that must bite: a lapsed Pending record must read "Expired".
\* Under the broken derivation it reads "Pending" — violation.
Inv_LapsedReadsExpired == Lapsed(now) => (BrokenEffStatus(now) = "Expired")

Safety ==
    /\ TypeOK
    /\ Inv_SingleResolution
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent
    /\ Inv_LapsedReadsExpired
====
