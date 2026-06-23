---- MODULE provisional-commitment ----
\* Grace Commons — Provisional Commitment atom (execution/render-time refactor,
\* 2026-06-21). Spec-level formal sibling of atoms/provisional-commitment.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* (1) Single-resolution BY WRITE: a commitment is written to at most one stored
\*     terminal in {Confirmed, Released}; once written, that resolution is
\*     immutable. Ghost `resolution` records the first stored terminal reached, so
\*     "the resolution never changes once set" is the falsifiable predicate
\*     resolution # none => state = resolution. (Old Inv 3 terminal-absorption,
\*     now ranging over the two STORED terminals only.)
\* (2) Expiry is DERIVED, never written. There is no action that stores "Expired"
\*     and no expired field. `Expired` is the read-time projection EffStatus(now).
\*     A resolving write (confirm/release) fires only while the window is open
\*     (now < ExpiresAt), so a lapsed hold can only ever READ Expired — it never
\*     becomes a stored terminal after the deadline, and the store never holds an
\*     "Expired" value. (Old Inv 7 confirm-within-window, restated: now no Expire
\*     write competes — confirm/release simply become disabled at the deadline.)
\* (3) Transition timestamps strictly after placement (Inv 8): every STORED
\*     terminal records a timestamp >= PlacedAt. Ghost variables `confirmedAt`,
\*     `releasedAt` capture clock values at transition time. (Expired carries no
\*     stored timestamp now — it is derived — so the expiredAt half is gone.)
\*
\* MODELING CHOICES
\* - One commitment. `state` in {Held, Confirmed, Released} — NO stored Expired.
\*   `clock` (the injected `now`) starts at PlacedAt and only advances (Tick);
\*   `ExpiresAt` is the window-close tick. Each resolving action guards on
\*   state = Held /\ clock < ExpiresAt: the injected clock is READ in the guard
\*   (pure), never used to WRITE an Expired state. EffStatus(c) is the derived
\*   effective status `read` returns at render time. PlacedAt > 0 so the ghost
\*   sentinel 0 is strictly below PlacedAt and Inv8 is falsifiable.
\*
\* NOT MODELED (out of scope, named): id discipline / no-reuse (Alloy-class,
\* single commitment here), storage-failure, multi-commitment place_hold
\* serialization (the resource race), and the immutability of stored fields
\* (structural).

EXTENDS Naturals

CONSTANTS PlacedAt,         \* clock tick at which place_hold fires (> 0)
          ExpiresAt,        \* window close time; take ExpiresAt > PlacedAt
          MaxClock          \* clock bound (finiteness); take MaxClock > ExpiresAt

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
    /\ state = "Held"           \* place_hold: commitment starts Held at PlacedAt
    /\ clock = PlacedAt
    /\ resolution = "none"
    /\ confirmedAt = 0          \* sentinel — only valid when state = "Confirmed"
    /\ releasedAt = 0           \* sentinel — only valid when state = "Released"

\* Derived, read-time effective status (render time). Never stored. A still-Held
\* commitment whose window has elapsed READS as Expired; a stored terminal reads
\* back as itself.
Lapsed(c)    == (state = "Held") /\ (c >= ExpiresAt)
EffStatus(c) == IF Lapsed(c) THEN "Expired" ELSE state

\* The injected clock advances at the I/O seam; it writes nothing else.
Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, resolution, confirmedAt, releasedAt>>

\* CORRECT confirm: a resolving WRITE, admitted only while Held AND strictly
\* within the window (clock < ExpiresAt). The injected `now` is read in the guard
\* (pure); no write ever sets an Expired state. Once the window lapses, confirm is
\* simply disabled — there is no Expire write racing it.
Confirm ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Confirmed" ELSE resolution
    /\ UNCHANGED <<clock, releasedAt>>

\* CORRECT release: a resolving WRITE, same window guard as confirm; stamps
\* releasedAt at the current clock.
Release ==
    /\ state = "Held"
    /\ clock < ExpiresAt
    /\ state' = "Released"
    /\ releasedAt' = clock
    /\ resolution' = IF resolution = "none" THEN "Released" ELSE resolution
    /\ UNCHANGED <<clock, confirmedAt>>

\* NO Expire action. A lapsed hold needs no write to be Expired; it is surfaced by
\* EffStatus at read time.

Next == Tick \/ Confirm \/ Release
Spec == Init /\ [][Next]_vars

\* Load-bearing — single-resolution by write (immutable once written). Ranges over
\* the two STORED terminals only; the derived Expired never appears in `state`.
Inv_SingleResolution == (resolution # "none") => (state = resolution)

\* Expiry is derived, never written: the store never holds an "Expired" value
\* (by construction — no action writes it; promoted to an explicit check so a
\* future edit that re-introduces a stored Expired is caught).
Inv_NoStoredExpired == state \in StoredStates

\* The derivation never misclassifies a written terminal as Expired: a stored
\* terminal always reads back as itself.
Inv_DerivedExpiryCoherent ==
    (state \in StoredTerminals) => (EffStatus(clock) = state)

\* Load-bearing (KEPT residual) — you cannot resolve a hold after its window. A
\* Confirmed commitment was confirmed strictly within the window. With the Expire
\* WRITE gone, this is the surviving execution-time clock dependence: confirm/
\* release read the injected `now` in their guard and become DISABLED at the
\* deadline (no write fires), rather than racing an Expire write. The window twin
\* (-buggy-window) admits confirm at clock = ExpiresAt and is caught here.
Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)

\* Inv 8 (load-bearing) — every STORED terminal transition timestamp is >=
\* PlacedAt. PlacedAt > 0 so sentinel 0 is strictly below it; a buggy twin that
\* forgets to capture the real clock is caught. (Expired is derived now, so it
\* carries no stored timestamp and has no half here.)
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

\* NOTE Invariant 1 (membership exclusivity over stored states) is TypeOK.

====
