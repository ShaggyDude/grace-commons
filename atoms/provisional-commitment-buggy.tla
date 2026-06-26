---- MODULE provisional-commitment-buggy ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (vacuity guard).
\* Mirrors provisional-commitment.tla (Final Critique 4 stored-Expired shape, restored
\* 2026-06-23) EXCEPT `ConfirmBuggy` drops the `state = Held` guard, allowing an
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
\* denies.

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

\* BUG: no `state = Held` guard — ConfirmBuggy can override an already-resolved
\* commitment. The window guard is intact (clock < ExpiresAt), so the violation is
\* isolated to single-resolution, not the window. `resolution` keeps the first
\* terminal recorded, so the override is caught by Inv_SingleResolution.
ConfirmBuggy ==
    /\ clock < ExpiresAt
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
\* Window guard intact here, so this continues to hold — only Inv_SingleResolution
\* (and, downstream, Inv3 terminal absorption) is violated, giving a clean
\* resolution-hazard rejection signal.
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
