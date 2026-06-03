---- MODULE idempotent-reservation-buggy ----
\* Grace Commons — Idempotent Reservation composition: BUGGY TWIN (vacuity guard).
\*
\* Identical to idempotent-reservation.tla EXCEPT it adds EvictEarly: a cache
\* eviction with NO window guard — the unsafe eviction ordering that drops the
\* token's record while its window is still open. A subsequent place_hold then
\* sees not-seen, re-delegates, and produces a SECOND effect within the same
\* window — the double-spend Invariant 8 (exactly-once effect) forbids.
\*
\* Expected result: Inv_ExactlyOnceInWindow VIOLATED. PlaceHoldDelegate (fresh
\* effect, effectsThisWindow = 1, cacheHas), EvictEarly (cacheHas -> FALSE while
\* still in window), PlaceHoldDelegate (InWindow THEN branch -> effectsThisWindow
\* = 2). If the checker reports all invariants hold here, the harness is vacuous.

EXTENDS Naturals

CONSTANTS Window, MaxClock

VARIABLES clock, everEffected, firstEffectAt, effectsThisWindow, cacheHas
vars == <<clock, everEffected, firstEffectAt, effectsThisWindow, cacheHas>>

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

ExpireCache ==
    /\ cacheHas
    /\ clock - firstEffectAt >= Window
    /\ cacheHas' = FALSE
    /\ UNCHANGED <<clock, everEffected, firstEffectAt, effectsThisWindow>>

\* BUG: evict the cache with no window guard — drops the token mid-window.
EvictEarly ==
    /\ cacheHas
    /\ cacheHas' = FALSE
    /\ UNCHANGED <<clock, everEffected, firstEffectAt, effectsThisWindow>>

Next == Tick \/ PlaceHoldDelegate \/ ExpireCache \/ EvictEarly
Spec == Init /\ [][Next]_vars

Inv_ExactlyOnceInWindow == InWindow => (effectsThisWindow <= 1)
Safety == TypeOK /\ Inv_ExactlyOnceInWindow

====
