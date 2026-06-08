---- MODULE legal-hold-buggy ----
\* Grace Commons — Legal Hold atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to legal-hold.tla EXCEPT `Release` stamps releasedAt[k] = 0
\* regardless of when the hold was placed — a backwards/skewed clock bug.
\* When a hold is placed at any clock tick > 0, its releasedAt is 0 < placedAt,
\* violating Inv_TemporalOrdering (released_at >= placed_at — Invariant 6).
\*
\* Expected result: Inv_TemporalOrdering VIOLATED.  Sequence: Tick (now=1),
\* Place hold k (placedAt[k]=1), Release hold k (releasedAt[k]=0) ->
\* releasedAt[k]=0 < placedAt[k]=1.  If the checker reports all invariants hold
\* here, the temporal-ordering check is vacuous.
\*
\* NOTE: the original cascade-release hazard (Inv_HoldIndependence) is NOT
\* preserved here because both bugs would produce competing violations and the
\* task requires the harness output to name Inv_TemporalOrdering as the failing
\* invariant.  The cascade hazard is still demonstrated by the original
\* legal-hold-buggy behaviour; this twin is the dedicated temporal-ordering guard.

EXTENDS Naturals, FiniteSets

CONSTANTS
    MaxH,
    MaxClock

HoldState == {"none", "Active", "Released"}

VARIABLES
    holds,
    releasedByOwn,
    now,
    placedAt,
    releasedAt

vars == <<holds, releasedByOwn, now, placedAt, releasedAt>>

ActiveCount == Cardinality({k \in 1..MaxH : holds[k] = "Active"})

TypeOK ==
    /\ holds         \in [1..MaxH -> HoldState]
    /\ releasedByOwn \in [1..MaxH -> BOOLEAN]
    /\ now           \in 0..MaxClock
    /\ placedAt      \in [1..MaxH -> 0..MaxClock]
    /\ releasedAt    \in [1..MaxH -> 0..MaxClock]

Init ==
    /\ holds         = [k \in 1..MaxH |-> "none"]
    /\ releasedByOwn = [k \in 1..MaxH |-> FALSE]
    /\ now           = 0
    /\ placedAt      = [k \in 1..MaxH |-> 0]
    /\ releasedAt    = [k \in 1..MaxH |-> 0]

Tick ==
    /\ now < MaxClock
    /\ now' = now + 1
    /\ UNCHANGED <<holds, releasedByOwn, placedAt, releasedAt>>

Place ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "none"
        /\ holds'    = [holds    EXCEPT ![k] = "Active"]
        /\ placedAt' = [placedAt EXCEPT ![k] = now]
    /\ UNCHANGED <<releasedByOwn, now, releasedAt>>

\* BUG: stamps releasedAt[k] = 0 instead of now (backwards/skewed clock).
\* Any hold placed after tick 0 gets releasedAt=0 < placedAt, violating
\* Inv_TemporalOrdering.
Release ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "Active"
        /\ holds'        = [holds        EXCEPT ![k] = "Released"]
        /\ releasedByOwn' = [releasedByOwn EXCEPT ![k] = TRUE]
        /\ releasedAt'   = [releasedAt   EXCEPT ![k] = 0]
    /\ UNCHANGED <<now, placedAt>>

Next == Tick \/ Place \/ Release
Spec == Init /\ [][Next]_vars

Inv_HoldIndependence ==
    \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]

Inv_TemporalOrdering ==
    \A k \in 1..MaxH : holds[k] = "Released" => releasedAt[k] >= placedAt[k]

Safety == TypeOK /\ Inv_HoldIndependence /\ Inv_TemporalOrdering

====
