---- MODULE provisional-commitment-buggy-window ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (isolated, window guard)
\* — Final Critique 4 stored-Expired shape, restored 2026-06-23.
\*
\* This is the second of two isolated buggy twins. It targets the WINDOW hazard
\* (Inv 7, confirm-within-window: you cannot resolve a hold after its window). Its
\* sibling `provisional-commitment-buggy.tla` targets the RESOLUTION hazard
\* (single-resolution / terminal absorption). Splitting the hazards across two
\* twins gives each load-bearing guarantee its own reachable, checker-rejected
\* counterexample (a combined twin would surface only the shorter violation).
\*
\* BUG — confirm a lapsed hold: `ConfirmBuggy` admits a confirm while
\* `clock <= ExpiresAt` instead of the correct `clock < ExpiresAt`. A confirm
\* fired at clock = ExpiresAt treats a hold whose window has elapsed (which the
\* `Expire` event would otherwise move to the stored Expired terminal) as still
\* confirmable and stamps confirmedAt = ExpiresAt — exactly the post-window write
\* the Final Critique 4 `window-elapsed` guard forbids. `Inv_ConfirmWithinWindow` (confirmedAt
\* < ExpiresAt) catches it. The `state = Held` guard is intact, so
\* single-resolution still HOLDS — the violation is isolated to
\* confirm-within-window.
\*
\* Expected result: Safety VIOLATED (Inv_ConfirmWithinWindow). Tick to ExpiresAt,
\* confirm -> confirmedAt = ExpiresAt, not strictly within the window.

EXTENDS Naturals

CONSTANTS PlacedAt, ExpiresAt, MaxClock

Terminals == {"Confirmed", "Released", "Expired"}
States    == {"Held"} \cup Terminals

VARIABLES state, clock, resolution, confirmedAt, releasedAt, expiredAt, everTerminal
vars == <<state, clock, resolution, confirmedAt, releasedAt, expiredAt, everTerminal>>

TypeOK ==
    /\ state \in States
    /\ clock \in 0..MaxClock
    /\ resolution \in (Terminals \cup {"none"})
    /\ confirmedAt \in 0..MaxClock
    /\ releasedAt \in 0..MaxClock
    /\ expiredAt \in 0..MaxClock
    /\ everTerminal \in BOOLEAN

Init ==
    /\ state = "Held"
    /\ clock = PlacedAt
    /\ resolution = "none"
    /\ confirmedAt = 0
    /\ releasedAt = 0
    /\ expiredAt = 0
    /\ everTerminal = FALSE

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, resolution, confirmedAt, releasedAt, expiredAt, everTerminal>>

\* BUG: confirm admitted at the boundary (clock <= ExpiresAt) — the correct model
\* requires clock < ExpiresAt. This treats a lapsed hold (now >= ExpiresAt, which
\* the Expire event would store as Expired) as still confirmable. confirmedAt is
\* stamped with the real clock, so Inv8 holds; the `state = Held` guard is intact,
\* so single-resolution holds; only Inv_ConfirmWithinWindow is violated (at
\* clock = ExpiresAt).
ConfirmBuggy ==
    /\ state = "Held"
    /\ clock <= ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Confirmed" ELSE resolution
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, releasedAt, expiredAt>>

Release ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Released"
    /\ releasedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Released" ELSE resolution
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, expiredAt>>

Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ expiredAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Expired" ELSE resolution
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, releasedAt>>

Next == Tick \/ ConfirmBuggy \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

Inv_SingleResolution == (resolution # "none") => (state = resolution)
Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)
Inv3_TerminalAbsorbing == everTerminal => (state \in Terminals)
Inv8_TransitionsAfterPlacement ==
    /\ (state = "Confirmed") => (confirmedAt >= PlacedAt)
    /\ (state = "Released")  => (releasedAt  >= PlacedAt)
    /\ (state = "Expired")   => (expiredAt   >= PlacedAt)

Safety ==
    /\ TypeOK
    /\ Inv_SingleResolution
    /\ Inv_ConfirmWithinWindow
    /\ Inv3_TerminalAbsorbing
    /\ Inv8_TransitionsAfterPlacement

====
