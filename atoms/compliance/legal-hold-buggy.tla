---- MODULE legal-hold-buggy ----
\* Grace Commons — Legal Hold atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to legal-hold.tla EXCEPT `Release` cascades: releasing one hold
\* transitions EVERY Active hold over the record to Released — conflating
\* per-hold release with record-level release, the concurrent-hold-independence
\* violation ("Hold-002 must remain Active when Hold-001 is released").
\*
\* Expected result: Inv_HoldIndependence VIOLATED. Place hold 1, Place hold 2,
\* ReleaseAll(target = 1) -> hold 2 is Released but releasedByOwn[2] = FALSE. If
\* the checker reports all invariants hold here, the harness is vacuous.

EXTENDS Naturals, FiniteSets

CONSTANT MaxH

HoldState == {"none", "Active", "Released"}

VARIABLES holds, releasedByOwn
vars == <<holds, releasedByOwn>>

ActiveCount == Cardinality({k \in 1..MaxH : holds[k] = "Active"})

TypeOK ==
    /\ holds \in [1..MaxH -> HoldState]
    /\ releasedByOwn \in [1..MaxH -> BOOLEAN]

Init ==
    /\ holds = [k \in 1..MaxH |-> "none"]
    /\ releasedByOwn = [k \in 1..MaxH |-> FALSE]

Place ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "none"
        /\ holds' = [holds EXCEPT ![k] = "Active"]
    /\ UNCHANGED releasedByOwn

\* BUG: releasing one hold cascades to every Active hold (record-level release).
Release ==
    /\ \E j \in 1..MaxH :
        /\ holds[j] = "Active"
        /\ holds' = [k \in 1..MaxH |-> IF holds[k] = "Active" THEN "Released" ELSE holds[k]]
        /\ releasedByOwn' = [releasedByOwn EXCEPT ![j] = TRUE]

Next == Place \/ Release
Spec == Init /\ [][Next]_vars

Inv_HoldIndependence == \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]
Safety == TypeOK /\ Inv_HoldIndependence

====
