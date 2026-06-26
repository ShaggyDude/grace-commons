---- MODULE provisional-commitment ----
\* Grace Commons — Provisional Commitment atom.
\* Spec-level formal sibling of atoms/provisional-commitment.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* This model is the Final Critique 4 STORED-EXPIRED shape, restored after
\* the 2026-06-21 "derive expiry at read time" refactor was WITHDRAWN for this
\* atom (a Provisional Commitment lapse has a side effect — it returns a slot to a
\* Capacity Constraint pool, relied on by the reservation-lifecycle and
\* idempotent-reservation compositions, which call ProvisionalCommitment.expire(id)
\* — so the lapse needs an explicit `expire()` event, not a side-effect-free
\* read-time derivation). See atoms/provisional-commitment.md §Lineage
\* (Derive-expiry refactor reverted — 2026-06-23).
\*
\* WHAT THIS MODEL CHECKS
\* (1) Single-resolution: a commitment is written to at most one stored terminal
\*     in {Confirmed, Released, Expired}; once written, that resolution is
\*     immutable. Ghost `resolution` records the first stored terminal reached, so
\*     "the resolution never changes once set" is the falsifiable predicate
\*     resolution # none => state = resolution. (The -buggy twin reintroduces the
\*     resolution hazard — a re-resolved commitment.)
\* (2) Inv 7 — confirm-within-window: a commitment may reach Confirmed ONLY if
\*     `confirm` fired while now < expires_at. This is the action-vs-time race the
\*     2026-06-03 bar reconsideration KEPT as warranting a model: a `confirm`
\*     (guard clock < ExpiresAt) and an `expire` (guard clock >= ExpiresAt) have
\*     mutually exclusive time-guards, so a hold cannot be confirmed after the
\*     window closes. (The -buggy-window twin reintroduces the window hazard —
\*     confirming a lapsed hold.)
\* (3) Inv 3 — terminal absorption: once a commitment has entered a stored
\*     terminal it stays terminal (history-flag form via `everTerminal`).
\* (4) Inv 8 — transition timestamps strictly after placement: every terminal
\*     transition records a timestamp >= placed_at. Ghost variables `confirmedAt`,
\*     `releasedAt`, `expiredAt` capture clock values at transition time;
\*     `Inv8_TransitionsAfterPlacement` asserts each >= PlacedAt when defined.
\*     PlacedAt is a constant > 0 so the ghost sentinel 0 is strictly below
\*     PlacedAt, giving the check real teeth.
\*
\* MODELING CHOICES
\* - One commitment. `state` in {Held, Confirmed, Released, Expired} — Expired is
\*   a STORED terminal reached by the Expire event. The clock (the pipeline's
\*   implicit `now`, NOT a signature parameter) starts at PlacedAt and only
\*   advances (Tick); `ExpiresAt` is the window-close tick. `Confirm`/`Release`
\*   guard state = Held /\ clock < ExpiresAt; `Expire` guards
\*   state = Held /\ clock >= ExpiresAt. PlacedAt > 0 so the ghost sentinel 0 is
\*   strictly below PlacedAt and Inv8 is falsifiable.
\*
\* NOT MODELED (out of scope, named): id discipline / no-reuse (Alloy-class,
\* single commitment here), storage-failure, multi-commitment place_hold
\* serialization (the resource race), and the immutability of stored fields
\* (structural).

EXTENDS Naturals

CONSTANTS PlacedAt,         \* clock tick at which place_hold fires (> 0)
          ExpiresAt,        \* window close time; take ExpiresAt > PlacedAt
          MaxClock          \* clock bound (finiteness); take MaxClock > ExpiresAt

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
    /\ state = "Held"           \* place_hold: commitment starts Held at PlacedAt
    /\ clock = PlacedAt
    /\ resolution = "none"
    /\ confirmedAt = 0          \* sentinel — only valid when state = "Confirmed"
    /\ releasedAt = 0           \* sentinel — only valid when state = "Released"
    /\ expiredAt = 0            \* sentinel — only valid when state = "Expired"
    /\ everTerminal = FALSE

\* The pipeline's implicit clock advances at the I/O seam; it writes nothing else.
Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, resolution, confirmedAt, releasedAt, expiredAt, everTerminal>>

\* CORRECT confirm: a resolving write, admitted only while Held AND strictly
\* within the window (clock < ExpiresAt).
Confirm ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Confirmed" ELSE resolution
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, releasedAt, expiredAt>>

\* CORRECT release: a resolving write, same window guard as confirm; stamps
\* releasedAt at the current clock.
Release ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Released"
    /\ releasedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Released" ELSE resolution
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, expiredAt>>

\* CORRECT expire: the side-effecting lapse event — a resolving write to the
\* stored Expired terminal, admitted only once the window has elapsed
\* (clock >= ExpiresAt). Stamps expiredAt. May be fired by a scheduler/sweep or
\* lazily on access; the model abstracts the trigger as an enabled action.
Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ expiredAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Expired" ELSE resolution
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, releasedAt>>

Next == Tick \/ Confirm \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

\* Load-bearing — single-resolution (immutable once written). Ranges over the
\* three stored terminals; once `resolution` is set, `state` must equal it.
Inv_SingleResolution == (resolution # "none") => (state = resolution)

\* Inv 7 (load-bearing) — a Confirmed commitment was confirmed strictly within
\* the window. With Confirm guarded `clock < ExpiresAt` and Expire guarded
\* `clock >= ExpiresAt` (mutually exclusive), a hold cannot be confirmed after the
\* window closes. The window twin (-buggy-window) admits confirm at
\* clock = ExpiresAt and is caught here.
Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)

\* Invariant 3 — terminal absorption (history-flag form): once a commitment has
\* entered a stored terminal it stays terminal. A transition out of a terminal
\* state would violate this.
Inv3_TerminalAbsorbing ==
    everTerminal => (state \in Terminals)

\* Inv 8 (load-bearing) — every stored terminal transition timestamp is >=
\* placed_at. PlacedAt > 0 so sentinel 0 is strictly below it; a buggy twin that
\* forgets to capture the real clock is caught.
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

\* NOTE Invariant 1 (membership exclusivity over stored states) is TypeOK.

====
