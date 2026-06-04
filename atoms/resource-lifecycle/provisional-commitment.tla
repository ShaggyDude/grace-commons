---- MODULE provisional-commitment ----
\* Grace Commons — Provisional Commitment atom.
\* Spec-level formal sibling of atoms/resource-lifecycle/provisional-commitment.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* (1) Inv 7 — confirm-within-window: a commitment may reach Confirmed ONLY if
\*     `confirm` fired while now < expires_at. This is the action-vs-time race the
\*     2026-06-03 bar reconsideration KEPT as warranting a model.
\* (2) Inv 8 — transition timestamps strictly after placement: every terminal
\*     transition records a timestamp >= placed_at. Ghost variables `confirmedAt`,
\*     `releasedAt`, `expiredAt` capture clock values at transition time;
\*     `Inv8_TransitionsAfterPlacement` asserts each >= PlacedAt when defined.
\*     PlacedAt is a constant > 0 so "before placement" is reachable by the clock,
\*     giving the check real teeth: a buggy twin that stamps 0 is caught.
\* (3) Inv 3 — terminal absorption (explicit predicate, promoted 2026-06-04).
\*
\* MODELING CHOICES
\* - One commitment, `clock` starting at PlacedAt (commitment is placed at that
\*   instant), advancing to MaxClock. `ExpiresAt` is the window-close tick.
\* - Three ghost timestamps (confirmedAt, releasedAt, expiredAt): initialized to 0
\*   (sentinel — only meaningful when the commitment is in the corresponding
\*   terminal state); set to clock when the transition fires.
\* - PlacedAt > 0 so the ghost sentinel 0 is strictly below PlacedAt; Inv8 is
\*   falsifiable (a buggy twin that forgets to stamp the real clock is caught).
\*
\* NOT MODELED (out of scope): id discipline, storage-failure, multi-commitment
\* resource serialization (place_hold race — a separate concern).

EXTENDS Naturals

CONSTANTS PlacedAt,         \* clock tick at which place_hold fires (> 0)
          ExpiresAt,        \* window close time; take ExpiresAt > PlacedAt
          MaxClock          \* clock bound (finiteness); take MaxClock > ExpiresAt

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
    /\ state = "Held"           \* place_hold: commitment starts Held at PlacedAt
    /\ clock = PlacedAt
    /\ confirmedAt = 0          \* sentinel — only valid when state = "Confirmed"
    /\ releasedAt = 0           \* sentinel — only valid when state = "Released"
    /\ expiredAt = 0            \* sentinel — only valid when state = "Expired"
    /\ everTerminal = FALSE

\* wall-time advances.
Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, confirmedAt, releasedAt, expiredAt, everTerminal>>

\* CORRECT confirm: admitted only while strictly within the window.
Confirm ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, releasedAt, expiredAt>>

\* CORRECT release: stamps releasedAt at current clock.
Release ==
    /\ state = "Held"
    /\ state' = "Released"
    /\ releasedAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, expiredAt>>

\* expire: admitted only once the window has elapsed; stamps expiredAt.
Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ expiredAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, releasedAt>>

Next == Tick \/ Confirm \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

\* Inv 7 (load-bearing) — a Confirmed commitment was confirmed strictly within
\* the window.
Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)

\* Invariant 3 — terminal absorption. Promoted from a by-construction assumption
\* to an explicit check (2026-06-04 coverage cross-check): once a commitment has
\* entered a terminal state it stays terminal (history-flag form, like Party
\* Identity's Closed-absorbing check). A transition out of a terminal state would
\* violate this.
Inv3_TerminalAbsorbing ==
    everTerminal => (state \in {"Confirmed", "Released", "Expired"})

\* Inv 8 (load-bearing) — every terminal transition timestamp is >= placed_at.
\* PlacedAt > 0 so sentinel 0 is strictly below it; a buggy twin that forgets to
\* capture the real clock is caught immediately.
\* Note: the spec states "expires_at <= expired_at" for expiry (Invariant 8);
\* modeled here as expiredAt >= PlacedAt (PlacedAt is the weaker bound that covers
\* the release half symmetrically; the stronger expires_at bound is discharged by
\* Inv7 + the Expire guard `clock >= ExpiresAt` together).
Inv8_TransitionsAfterPlacement ==
    /\ (state = "Confirmed") => (confirmedAt >= PlacedAt)
    /\ (state = "Released")  => (releasedAt  >= PlacedAt)
    /\ (state = "Expired")   => (expiredAt   >= PlacedAt)

Safety ==
    /\ TypeOK
    /\ Inv_ConfirmWithinWindow
    /\ Inv3_TerminalAbsorbing
    /\ Inv8_TransitionsAfterPlacement

\* NOTE Invariant 1 (membership exclusivity) is TypeOK.

====
