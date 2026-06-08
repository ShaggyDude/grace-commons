---- MODULE legal-hold-buggy-cascade ----
\* Grace Commons — Legal Hold atom: BUGGY TWIN (isolated, Inv 4 guard).
\*
\* This is the second of two isolated buggy twins. It targets Invariant 4
\* (concurrent-hold independence). Its sibling `legal-hold-buggy.tla` targets
\* Invariant 6 (temporal ordering). Splitting the hazards across two twins gives
\* each load-bearing invariant its own reachable, checker-rejected counterexample
\* — a combined twin would only ever surface the shorter of the two violations.
\*
\* BUG — cascade release: releasing the explicitly-targeted hold k flips EVERY
\* active hold to Released, but marks `releasedByOwn` TRUE only for k. A
\* non-target hold becomes Released with releasedByOwn = FALSE, which
\* `Inv_HoldIndependence` catches. Timestamps are stamped with `now` for every
\* cascaded hold so `Inv_TemporalOrdering` still HOLDS — the violation is
\* isolated to hold-independence.
\*
\* Expected result: Safety VIOLATED (Inv_HoldIndependence). Place two holds,
\* release one -> both Released, the non-target's releasedByOwn = FALSE.
\* If the checker reports all invariants hold here, the harness is vacuous.

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

\* BUG: cascade release. Flips ALL active holds to Released; only the target k
\* records releasedByOwn = TRUE. Timestamps stamped with `now` for all cascaded
\* holds so temporal ordering is preserved (isolating the independence failure).
ReleaseCascade ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "Active"
        /\ holds'    = [j \in 1..MaxH |-> IF holds[j] = "Active" THEN "Released" ELSE holds[j]]
        /\ releasedByOwn' = [releasedByOwn EXCEPT ![k] = TRUE]
        /\ releasedAt'    = [j \in 1..MaxH |-> IF holds[j] = "Active" THEN now ELSE releasedAt[j]]
    /\ UNCHANGED <<now, placedAt>>

Next == Tick \/ Place \/ ReleaseCascade
Spec == Init /\ [][Next]_vars

Inv_HoldIndependence ==
    \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]

Inv_TemporalOrdering ==
    \A k \in 1..MaxH : holds[k] = "Released" => releasedAt[k] >= placedAt[k]

Safety == TypeOK /\ Inv_HoldIndependence /\ Inv_TemporalOrdering

====
