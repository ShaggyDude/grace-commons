---- MODULE legal-hold ----
\* Grace Commons — Legal Hold atom.
\* Spec-level formal sibling of atoms/legal-hold.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* Two load-bearing claims (formal-layer vote 2026-06-03):
\*
\*   Invariant 4 — Concurrent-hold independence: multiple holds may cover the
\*   same record, each with its own lifecycle, and releasing one hold leaves
\*   every other hold's state untouched ("Hold-002 remains Active when Hold-001
\*   is released").  Ghost `releasedByOwn[k]` is TRUE only if hold k was the
\*   explicit target of a `release`, so the predicate is falsifiable.
\*
\*   Invariant 6 — Temporal ordering: for every Released hold,
\*   releasedAt[k] >= placedAt[k].  Modeled with a global monotonically-
\*   advancing clock `now` (a bounded Naturals counter, no Sequences module).
\*   Ghost `placedAt[k]` is stamped with `now` on Place; ghost `releasedAt[k]`
\*   is stamped with `now` on Release.  Because `now` only ever increases,
\*   release can never stamp a tick earlier than placement — the correct model
\*   holds this invariant exhaustively.
\*
\* MODELING CHOICES
\* - Up to MaxH holds over one record, each in {none, Active, Released}.
\* - Global clock `now` in 0..MaxClock; `Tick` advances it by 1 (guarded by
\*   now < MaxClock so the state space stays finite).
\* - placedAt[k] and releasedAt[k] are initialised to 0 (sentinel "not yet
\*   set"); the invariant fires only when holds[k] = "Released", so the 0
\*   sentinel on unplaced/unreleased slots is safe.
\* - Time is modeled as Naturals, not Sequences — per harness README.
\*
\* SATURATION NOTE (2026-06-04)
\*   MaxH=2, MaxClock=3 → 370 states.  MaxClock=4 → 811 states; state count
\*   grows because more absolute timestamp values exist (not new behavioral
\*   patterns).  The temporal-ordering invariant is purely relational; all
\*   relative orderings (same-tick, 1-apart, 2-apart) are fully represented at
\*   MaxClock=3.  Behavioral-coverage saturation point: MaxClock=3.
\*   MaxH and MaxClock are recorded in legal-hold.cfg.
\*
\* NOT MODELED (out of scope): id discipline, attribution fields, the purge gate
\* (that is the Defensible Retention composition — see defensible-retention.tla).

EXTENDS Naturals, FiniteSets

CONSTANTS
    MaxH,       \* max concurrent holds over the record
    MaxClock    \* clock upper bound (saturation guard)

HoldState == {"none", "Active", "Released"}

VARIABLES
    holds,          \* holds[k] in HoldState
    releasedByOwn,  \* ghost: TRUE iff hold k was released by its own Release action
    now,            \* global monotonic clock counter in 0..MaxClock
    placedAt,       \* ghost: clock tick when hold k was placed (0 = not yet placed)
    releasedAt      \* ghost: clock tick when hold k was released (0 = not yet released)

vars == <<holds, releasedByOwn, now, placedAt, releasedAt>>

ActiveCount == Cardinality({k \in 1..MaxH : holds[k] = "Active"})
RecordHeld  == ActiveCount > 0

TypeOK ==
    /\ holds        \in [1..MaxH -> HoldState]
    /\ releasedByOwn \in [1..MaxH -> BOOLEAN]
    /\ now          \in 0..MaxClock
    /\ placedAt     \in [1..MaxH -> 0..MaxClock]
    /\ releasedAt   \in [1..MaxH -> 0..MaxClock]

Init ==
    /\ holds         = [k \in 1..MaxH |-> "none"]
    /\ releasedByOwn = [k \in 1..MaxH |-> FALSE]
    /\ now           = 0
    /\ placedAt      = [k \in 1..MaxH |-> 0]
    /\ releasedAt    = [k \in 1..MaxH |-> 0]

\* Advance the global clock by one tick (guarded so the space remains finite).
Tick ==
    /\ now < MaxClock
    /\ now' = now + 1
    /\ UNCHANGED <<holds, releasedByOwn, placedAt, releasedAt>>

\* Place a hold: stamp placedAt[k] with the current clock.
Place ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "none"
        /\ holds'    = [holds    EXCEPT ![k] = "Active"]
        /\ placedAt' = [placedAt EXCEPT ![k] = now]
    /\ UNCHANGED <<releasedByOwn, now, releasedAt>>

\* CORRECT release: transitions ONLY the targeted hold; stamps releasedAt[k]
\* with the current clock (>= placedAt[k] because now only advances).
Release ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "Active"
        /\ holds'        = [holds        EXCEPT ![k] = "Released"]
        /\ releasedByOwn' = [releasedByOwn EXCEPT ![k] = TRUE]
        /\ releasedAt'   = [releasedAt   EXCEPT ![k] = now]
    /\ UNCHANGED <<now, placedAt>>

Next == Tick \/ Place \/ Release
Spec == Init /\ [][Next]_vars

\* Invariant 4 — Concurrent-hold independence (load-bearing).
\* A Released hold was released by its own action; no cascading side-effects.
Inv_HoldIndependence ==
    \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]

\* Invariant 6 — Temporal ordering (load-bearing, closes the GAP).
\* Every Released hold has releasedAt >= placedAt.
Inv_TemporalOrdering ==
    \A k \in 1..MaxH : holds[k] = "Released" => releasedAt[k] >= placedAt[k]

Safety == TypeOK /\ Inv_HoldIndependence /\ Inv_TemporalOrdering

====
