---- MODULE provisional-commitment-buggy-window ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (isolated, window guard)
\* — execution/render-time refactor, 2026-06-21.
\*
\* This is the second of two isolated buggy twins. It targets the WINDOW hazard
\* (the KEPT residual: you cannot resolve a hold after its window). Its sibling
\* `provisional-commitment-buggy.tla` targets the RESOLUTION hazard
\* (single-resolution / terminal absorption). Splitting the hazards across two
\* twins gives each load-bearing guarantee its own reachable, checker-rejected
\* counterexample (a combined twin would surface only the shorter violation).
\*
\* BUG — confirm a lapsed hold: `ConfirmBuggy` admits a confirm while
\* `clock <= ExpiresAt` instead of the correct `clock < ExpiresAt`. A confirm
\* fired at clock = ExpiresAt treats a hold whose window has elapsed (which a
\* reader would see as the derived `Expired`) as still confirmable and stamps
\* confirmedAt = ExpiresAt — exactly the post-window write the refactor's KEPT
\* `window-elapsed` guard forbids. `Inv_ConfirmWithinWindow` (confirmedAt <
\* ExpiresAt) catches it. The `state = Held` guard is intact, so single-resolution
\* still HOLDS — the violation is isolated to confirm-within-window.
\*
\* Expected result: Safety VIOLATED (Inv_ConfirmWithinWindow). Tick to ExpiresAt,
\* confirm -> confirmedAt = ExpiresAt, not strictly within the window.

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

\* BUG: confirm admitted at the boundary (clock <= ExpiresAt) — the correct model
\* requires clock < ExpiresAt. This treats a lapsed hold (now >= ExpiresAt, which
\* `read` would project as Expired) as still confirmable. confirmedAt is stamped
\* with the real clock, so Inv8 holds; the `state = Held` guard is intact, so
\* single-resolution holds; only Inv_ConfirmWithinWindow is violated (at
\* clock = ExpiresAt).
ConfirmBuggy ==
    /\ state = "Held"
    /\ clock <= ExpiresAt
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
