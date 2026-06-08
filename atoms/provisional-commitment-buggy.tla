---- MODULE provisional-commitment-buggy ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to provisional-commitment.tla EXCEPT `Release` and `Expire` stamp
\* timestamp 0 instead of `clock` — modeling an implementation bug where the
\* transition recorder writes a hard-coded zero instead of reading the current
\* wall-clock value. This violates Inv8_TransitionsAfterPlacement because
\* PlacedAt = 1 > 0 = releasedAt / expiredAt.
\*
\* The confirm-within-window guard is CORRECT here so Inv_ConfirmWithinWindow
\* continues to hold; only Inv8_TransitionsAfterPlacement is violated, giving a
\* clean single-invariant rejection signal.
\*
\* Expected result: Inv8_TransitionsAfterPlacement VIOLATED.
\*   Init (clock=1, state=Held) -> Release -> releasedAt=0, state=Released.
\*   Now (state="Released") => (releasedAt >= PlacedAt) becomes 0 >= 1 = FALSE.
\* If the checker does NOT reject this, the Inv8 check is vacuous.

EXTENDS Naturals

CONSTANTS PlacedAt, ExpiresAt, MaxClock

States == {"Held", "Confirmed", "Released", "Expired"}

VARIABLES state, clock, confirmedAt, releasedAt, expiredAt, everTerminal
vars == <<state, clock, confirmedAt, releasedAt, expiredAt, everTerminal>>

TypeOK ==
    /\ state \in States
    /\ clock \in 0..MaxClock
    /\ confirmedAt \in 0..MaxClock
    /\ releasedAt \in 0..MaxClock
    /\ expiredAt \in 0..MaxClock
    /\ everTerminal \in BOOLEAN

Init ==
    /\ state = "Held"
    /\ clock = PlacedAt
    /\ confirmedAt = 0
    /\ releasedAt = 0
    /\ expiredAt = 0
    /\ everTerminal = FALSE

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, confirmedAt, releasedAt, expiredAt, everTerminal>>

\* CORRECT confirm: window guard intact — Inv7 continues to hold.
Confirm ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, releasedAt, expiredAt>>

\* BUG: stamps releasedAt = 0 instead of clock — simulates a recorder that
\* hard-codes zero rather than reading the current wall clock. With PlacedAt = 1,
\* releasedAt = 0 < PlacedAt violates Inv8_TransitionsAfterPlacement.
Release ==
    /\ state = "Held"
    /\ state' = "Released"
    /\ releasedAt' = 0
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, expiredAt>>

\* BUG: stamps expiredAt = 0 instead of clock — same defect as Release.
Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ expiredAt' = 0
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, releasedAt>>

Next == Tick \/ Confirm \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)
Inv3_TerminalAbsorbing == everTerminal => (state \in {"Confirmed", "Released", "Expired"})
Inv8_TransitionsAfterPlacement ==
    /\ (state = "Confirmed") => (confirmedAt >= PlacedAt)
    /\ (state = "Released")  => (releasedAt  >= PlacedAt)
    /\ (state = "Expired")   => (expiredAt   >= PlacedAt)
Safety ==
    /\ TypeOK
    /\ Inv_ConfirmWithinWindow
    /\ Inv3_TerminalAbsorbing
    /\ Inv8_TransitionsAfterPlacement

====
