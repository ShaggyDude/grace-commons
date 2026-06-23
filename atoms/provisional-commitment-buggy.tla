---- MODULE provisional-commitment-buggy ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (vacuity guard).
\* Mirrors provisional-commitment.tla (execution/render-time refactor, 2026-06-21)
\* EXCEPT `ConfirmBuggy` drops the `state = Held` guard, allowing an
\* already-resolved commitment to be re-resolved to Confirmed — the second
\* resolution that the single-resolution / terminal-absorption rule forbids.
\*
\* This is the RESOLUTION hazard (the sibling -buggy-window targets the window
\* hazard). `resolution` keeps the first stored terminal recorded, so the override
\* is detectable by Inv_SingleResolution.
\*
\* Expected result: Inv_SingleResolution VIOLATED.
\*   Release (state = Released, resolution = Released), then ConfirmBuggy ->
\*   state = Confirmed while resolution = Released. The predicate
\*   resolution # none => state = resolution becomes Released = Confirmed = FALSE.
\* If the checker reports all invariants hold here, the harness is vacuous: a
\* re-resolvable commitment would be safe, which is exactly what single-resolution
\* by write denies.

EXTENDS Naturals

CONSTANTS PlacedAt, ExpiresAt, MaxClock

StoredTerminals == {"Confirmed", "Released"}
StoredStates    == {"Held"} \cup StoredTerminals

VARIABLES state, clock, resolution, confirmedAt, releasedAt
vars == <<state, clock, resolution, confirmedAt, releasedAt>>

TypeOK ==
    /\ state \in StoredStates
    /\ clock \in 0..MaxClock
    /\ resolution \in (StoredTerminals \cup {"none"})
    /\ confirmedAt \in 0..MaxClock
    /\ releasedAt \in 0..MaxClock

Init ==
    /\ state = "Held"
    /\ clock = PlacedAt
    /\ resolution = "none"
    /\ confirmedAt = 0
    /\ releasedAt = 0

Lapsed(c)    == (state = "Held") /\ (c >= ExpiresAt)
EffStatus(c) == IF Lapsed(c) THEN "Expired" ELSE state

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, resolution, confirmedAt, releasedAt>>

\* BUG: no `state = Held` guard — ConfirmBuggy can override an already-resolved
\* commitment. The window guard is intact (clock < ExpiresAt), so the violation is
\* isolated to single-resolution, not the window. `resolution` keeps the first
\* terminal recorded, so the override is caught by Inv_SingleResolution.
ConfirmBuggy ==
    /\ clock < ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Confirmed" ELSE resolution
    /\ UNCHANGED <<clock, releasedAt>>

Release ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Released"
    /\ releasedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Released" ELSE resolution
    /\ UNCHANGED <<clock, confirmedAt>>

Next == Tick \/ ConfirmBuggy \/ Release
Spec == Init /\ [][Next]_vars

Inv_SingleResolution == (resolution # "none") => (state = resolution)
Inv_NoStoredExpired == state \in StoredStates
Inv_DerivedExpiryCoherent ==
    (state \in StoredTerminals) => (EffStatus(clock) = state)
\* Window guard intact here, so this continues to hold — only Inv_SingleResolution
\* is violated, giving a clean single-invariant rejection signal.
Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)
Inv8_TransitionsAfterPlacement ==
    /\ (state = "Confirmed") => (confirmedAt >= PlacedAt)
    /\ (state = "Released")  => (releasedAt  >= PlacedAt)

Safety ==
    /\ TypeOK
    /\ Inv_SingleResolution
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent
    /\ Inv_ConfirmWithinWindow
    /\ Inv8_TransitionsAfterPlacement

====
