---- MODULE capacity-constraint-enforcement-buggy-toctou ----
\* Grace Commons — Capacity Constraint Enforcement: BUGGY TWIN (isolated, Inv 4 guard).
\*
\* This is the second of two isolated buggy twins. It targets Invariant 4
\* (capacity constraint, allocated <= capacity). Its sibling
\* `capacity-constraint-enforcement-buggy.tla` targets Invariant 5
\* (non-negativity, the release-underflow path). Splitting the hazards across two
\* twins gives each load-bearing invariant its own reachable, checker-rejected
\* counterexample.
\*
\* BUG — non-atomic allocate (TOCTOU): `AllocateObserve` checks headroom and
\* records intent; `AllocateCommit` increments WITHOUT re-checking. Multiple
\* workers can each observe headroom on the last free unit, then all commit,
\* overshooting capacity. `Inv4_CapacityConstraint` catches it. `allocated` only
\* increments, so `Inv5_NonNegativity` still HOLDS — the violation is isolated to
\* the capacity bound.
\*
\* Expected result: Safety VIOLATED (Inv4_CapacityConstraint). With Capacity=2,
\* Workers={w1,w2,w3}: allocate one, then two workers observe the last unit's
\* headroom and both commit -> allocated = 3 > 2.
\* If the checker reports all invariants hold here, the harness is vacuous.

EXTENDS Naturals, FiniteSets

CONSTANTS Capacity, Workers

VARIABLES allocated, status
vars == <<allocated, status>>

TypeOK ==
    /\ allocated \in 0..Cardinality(Workers)
    /\ status \in [Workers -> {"idle", "observed", "allocated"}]

Init ==
    /\ allocated = 0
    /\ status = [w \in Workers |-> "idle"]

\* BUG part 1: observe headroom and record intent, but do NOT reserve the unit.
AllocateObserve(w) ==
    /\ status[w] = "idle"
    /\ allocated < Capacity
    /\ status' = [status EXCEPT ![w] = "observed"]
    /\ UNCHANGED allocated

\* BUG part 2: commit the increment without re-checking the capacity bound.
AllocateCommit(w) ==
    /\ status[w] = "observed"
    /\ allocated' = allocated + 1
    /\ status' = [status EXCEPT ![w] = "allocated"]

Next ==
    \E w \in Workers :
        \/ AllocateObserve(w)
        \/ AllocateCommit(w)
Spec == Init /\ [][Next]_vars

Inv4_CapacityConstraint == allocated <= Capacity
Inv5_NonNegativity == allocated >= 0

Safety == TypeOK /\ Inv4_CapacityConstraint /\ Inv5_NonNegativity

====
