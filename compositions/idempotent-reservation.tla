---- MODULE idempotent-reservation ----
\* Grace Commons — Idempotent Reservation composition.
\* Spec-level formal sibling of compositions/idempotent-reservation.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is Invariant 8 (exactly-once effect within the window):
\* for one logical operation under one idempotency token, the underlying
\* Provisional Commitment observes exactly one action invocation regardless of
\* retry count, as long as retries fall within the Duplicate Prevention window.
\* The named hazard (ROADMAP backlog: "unsafe eviction ordering") is evicting the
\* token's cache entry BEFORE its window elapses — a replay then re-delegates and
\* produces a SECOND effect (the no-double-spend property breaks).
\*
\* MODELING CHOICES
\* - One token, advancing bounded `clock`, `Window`. `cacheHas` is the
\*   implementation's seen-flag (governs whether place_hold replays or
\*   delegates). `firstEffectAt`/`everEffected` mark the current window's first
\*   effect; `effectsThisWindow` counts delegations attributable to the open
\*   window. The invariant is stated against the TRUE window (derived from
\*   firstEffectAt), so a lagging cache flag does not by itself break it.
\*
\* NOT MODELED (out of scope): parameters_digest / token-collision (Invariant 4),
\* the constituent commitment state machine (Invariant 5 — see
\* provisional-commitment.tla), token-action binding.

EXTENDS Naturals

CONSTANTS Window, MaxClock

VARIABLES clock, everEffected, firstEffectAt, effectsThisWindow, cacheHas
vars == <<clock, everEffected, firstEffectAt, effectsThisWindow, cacheHas>>

\* The TRUE idempotency window: time since the current episode's first effect.
InWindow == everEffected /\ (clock - firstEffectAt < Window)

TypeOK ==
    /\ clock \in 0..MaxClock
    /\ everEffected \in BOOLEAN
    /\ firstEffectAt \in 0..MaxClock
    /\ effectsThisWindow \in 0..3
    /\ cacheHas \in BOOLEAN

Init ==
    /\ clock = 0
    /\ everEffected = FALSE
    /\ firstEffectAt = 0
    /\ effectsThisWindow = 0
    /\ cacheHas = FALSE

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<everEffected, firstEffectAt, effectsThisWindow, cacheHas>>

\* place_hold delegate path (taken only when the cache reports not-seen). A
\* place_hold while cacheHas is a replay — a no-op on effects (stutter), so it is
\* not modeled as a state-changing action.
\* THEN branch (still within an open window) is the double-effect: it is only
\* reachable if the cache was wrongly evicted mid-window (see the buggy twin).
PlaceHoldDelegate ==
    /\ ~cacheHas
    /\ \/ /\ InWindow
          /\ effectsThisWindow' = effectsThisWindow + 1
          /\ UNCHANGED <<everEffected, firstEffectAt>>
       \/ /\ ~InWindow
          /\ everEffected' = TRUE
          /\ firstEffectAt' = clock
          /\ effectsThisWindow' = 1
    /\ cacheHas' = TRUE
    /\ UNCHANGED clock

\* automatic cache eviction once the window has elapsed (the safe ordering).
ExpireCache ==
    /\ cacheHas
    /\ clock - firstEffectAt >= Window
    /\ cacheHas' = FALSE
    /\ UNCHANGED <<clock, everEffected, firstEffectAt, effectsThisWindow>>

Next == Tick \/ PlaceHoldDelegate \/ ExpireCache
Spec == Init /\ [][Next]_vars

\* Load-bearing — within the true window, at most one underlying effect.
Inv_ExactlyOnceInWindow == InWindow => (effectsThisWindow <= 1)
Safety == TypeOK /\ Inv_ExactlyOnceInWindow

====
