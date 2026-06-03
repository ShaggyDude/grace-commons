---- MODULE provisional-commitment-buggy ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to provisional-commitment.tla EXCEPT `Confirm` drops the
\* `clock < ExpiresAt` window guard — modeling an implementation that confirms a
\* commitment without re-checking the window, the confirm-after-expiry slip the
\* English's `window-elapsed` rejection forecloses.
\*
\* Expected result: Inv_ConfirmWithinWindow VIOLATED. Tick the clock to ExpiresAt
\* (or beyond), then Confirm: confirmedAt >= ExpiresAt while state = Confirmed. If
\* the checker reports all invariants hold here, the harness is vacuous: confirm-
\* after-window would be safe, which is exactly what confirm-within-window denies.

EXTENDS Naturals

CONSTANTS ExpiresAt, MaxClock

States == {"Held", "Confirmed", "Released", "Expired"}

VARIABLES state, clock, confirmedAt
vars == <<state, clock, confirmedAt>>

TypeOK ==
    /\ state \in States
    /\ clock \in 0..MaxClock
    /\ confirmedAt \in 0..MaxClock

Init ==
    /\ state = "Held"
    /\ clock = 0
    /\ confirmedAt = 0

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, confirmedAt>>

\* BUG: no `clock < ExpiresAt` guard — confirm fires regardless of the window.
Confirm ==
    /\ state = "Held"
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ UNCHANGED clock

Release ==
    /\ state = "Held"
    /\ state' = "Released"
    /\ UNCHANGED <<clock, confirmedAt>>

Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ UNCHANGED <<clock, confirmedAt>>

Next == Tick \/ Confirm \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)
Safety == TypeOK /\ Inv_ConfirmWithinWindow

====
