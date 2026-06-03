---- MODULE provisional-commitment ----
\* Grace Commons — Provisional Commitment atom.
\* Spec-level formal sibling of atoms/resource-lifecycle/provisional-commitment.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is confirm-within-window: a commitment may reach
\* Confirmed ONLY if `confirm` fired while now < expires_at (Decision points —
\* `confirm` is rejected `window-elapsed` once now >= expires_at). This is the
\* genuine action-vs-time race the 2026-06-03 bar reconsideration KEPT as
\* warranting a model: as the clock advances, a confirm must not slip past the
\* window. `confirm` (now < expires_at) and `expire` (now >= expires_at) have
\* mutually exclusive time-guards; the model checks no interleaving of clock
\* advance and confirm yields a Confirmed commitment confirmed after expiry.
\*
\* MODELING CHOICES
\* - One commitment, an advancing bounded `clock`, fixed `ExpiresAt`. `confirmedAt`
\*   ghost records the clock value at confirm time, making "confirmed within
\*   window" a falsifiable state predicate.
\*
\* NOT MODELED (out of scope): id discipline, storage-failure, multi-commitment
\* resource serialization (place_hold race — a separate concern).

EXTENDS Naturals

CONSTANTS ExpiresAt,        \* window close time (placed_at = 0, so = duration)
          MaxClock          \* clock bound (finiteness); take MaxClock > ExpiresAt

States == {"Held", "Confirmed", "Released", "Expired"}

VARIABLES state, clock, confirmedAt
vars == <<state, clock, confirmedAt>>

TypeOK ==
    /\ state \in States
    /\ clock \in 0..MaxClock
    /\ confirmedAt \in 0..MaxClock

Init ==
    /\ state = "Held"           \* place_hold: commitment starts Held at clock 0
    /\ clock = 0
    /\ confirmedAt = 0

\* wall-time advances.
Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, confirmedAt>>

\* CORRECT confirm: admitted only while strictly within the window.
Confirm ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ UNCHANGED clock

Release ==
    /\ state = "Held"
    /\ state' = "Released"
    /\ UNCHANGED <<clock, confirmedAt>>

\* expire: admitted only once the window has elapsed.
Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ UNCHANGED <<clock, confirmedAt>>

Next == Tick \/ Confirm \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

\* Load-bearing — a Confirmed commitment was confirmed strictly within the window.
Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)

Safety == TypeOK /\ Inv_ConfirmWithinWindow

\* NOTE Invariant 1 (membership exclusivity) is TypeOK; Invariant 3 (terminal
\* absorption) is enforced by construction — every transition guards state = Held.

====
