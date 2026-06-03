---- MODULE legal-hold ----
\* Grace Commons — Legal Hold atom.
\* Spec-level formal sibling of atoms/compliance/legal-hold.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is concurrent-hold independence: multiple holds may
\* cover the same record, each with its own lifecycle, and releasing one hold
\* leaves every other hold's state untouched ("Hold-002 remains Active when
\* Hold-001 is released"). A record is held iff at least one Active hold covers
\* it; only an individual `release` of a hold transitions THAT hold.
\*
\* MODELING CHOICES
\* - Up to `MaxH` holds over one record, each {none, Active, Released}. Ghost
\*   `releasedByOwn[k]` is TRUE only if hold k was the target of a `release`, so
\*   "a Released hold was released by its own action" is the falsifiable predicate
\*   that independence preserves.
\*
\* NOT MODELED (out of scope): id discipline, attribution fields, the purge gate
\* (that is the Defensible Retention composition — see defensible-retention.tla).

EXTENDS Naturals, FiniteSets

CONSTANT MaxH               \* max concurrent holds over the record

HoldState == {"none", "Active", "Released"}

VARIABLES holds, releasedByOwn
vars == <<holds, releasedByOwn>>

ActiveCount == Cardinality({k \in 1..MaxH : holds[k] = "Active"})
RecordHeld == ActiveCount > 0

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

\* CORRECT release: transitions ONLY the targeted hold; others untouched.
Release ==
    /\ \E k \in 1..MaxH :
        /\ holds[k] = "Active"
        /\ holds' = [holds EXCEPT ![k] = "Released"]
        /\ releasedByOwn' = [releasedByOwn EXCEPT ![k] = TRUE]

Next == Place \/ Release
Spec == Init /\ [][Next]_vars

\* Load-bearing — a Released hold was released by its own action (no hold is
\* released as a side effect of releasing another). Concurrent-hold independence.
Inv_HoldIndependence == \A k \in 1..MaxH : holds[k] = "Released" => releasedByOwn[k]
Safety == TypeOK /\ Inv_HoldIndependence

====
