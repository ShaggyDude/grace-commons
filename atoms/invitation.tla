---- MODULE invitation ----
\* Grace Commons — Invitation atom (execution/render-time refactor, 2026-06-21).
\* Spec-level formal sibling of atoms/invitation.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* (1) Single-resolution BY WRITE: an invitation is written to at most one stored
\*     terminal in {Accepted, Declined, Revoked}; once written, that resolution is
\*     immutable. Ghost `resolution` records the first stored terminal reached, so
\*     "the resolution never changes once set" is the falsifiable predicate
\*     resolution # none => state = resolution.
\* (2) Expiry is DERIVED, never written. There is no action that stores "Expired"
\*     and no expired field. `Expired` is the read-time projection EffStatus(now).
\*     A resolving write fires only while the window is open (now < ExpiresAt), so a
\*     lapsed invitation can only ever READ Expired — it never becomes a stored
\*     terminal after the deadline, and the store never holds an "Expired" value.
\*
\* MODELING CHOICES
\* - One invitation. `state` in {Pending, Accepted, Declined, Revoked} — NO stored
\*   Expired. `now` is an injected clock that only advances (Tick); `ExpiresAt` is a
\*   fixed deadline. Each resolving action guards on state = Pending /\ now < ExpiresAt:
\*   the injected clock is READ in the guard (pure), never used to WRITE an Expired
\*   state. EffStatus(c) is the derived effective status `read` returns at render time.
\*
\* NOT MODELED (out of scope, named): identity binding at accept, field validation,
\* token id discipline / uniqueness (Alloy-class, single invitation here), and the
\* immutability of stored resolution fields (structural).

EXTENDS Naturals

CONSTANT ExpiresAt    \* fixed deadline (a natural; lapsed once now >= ExpiresAt)
CONSTANT MaxClock     \* clock saturation bound (raise until state count stops growing)

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

\* Derived, read-time effective status (render time). Never stored.
Lapsed(c)    == (state = "Pending") /\ (c >= ExpiresAt)
EffStatus(c) == IF Lapsed(c) THEN "Expired" ELSE state

\* The injected clock advances at the I/O seam; it writes nothing else.
Tick ==
    /\ now < MaxClock
    /\ now' = now + 1
    /\ UNCHANGED <<state, resolution>>

\* Resolving writes: only while Pending AND not lapsed (now < ExpiresAt). The
\* injected `now` is read in the guard (pure); no write ever sets an Expired state.
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

\* Load-bearing — single-resolution by write (immutable once written).
Inv_SingleResolution == (resolution # "none") => (state = resolution)

\* Expiry is derived, never written: the store never holds an "Expired" value
\* (by construction — no action writes it; promoted to an explicit check so a
\* future edit that re-introduces a stored Expired is caught).
Inv_NoStoredExpired == state \in StoredStates

\* The derivation never misclassifies a written terminal as Expired: a stored
\* terminal always reads back as itself.
Inv_DerivedExpiryCoherent == (state \in StoredTerminals) => (EffStatus(now) = state)

Safety ==
    /\ TypeOK
    /\ Inv_SingleResolution
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent
====
