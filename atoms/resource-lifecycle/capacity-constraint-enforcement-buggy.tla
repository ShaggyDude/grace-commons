---- MODULE capacity-constraint-enforcement-buggy ----
\* Grace Commons — Capacity Constraint Enforcement: BUGGY TWIN (vacuity guard).
\*
\* Identical to capacity-constraint-enforcement.tla EXCEPT `allocate` is split
\* into a non-atomic check-then-commit — the classic time-of-check-to-time-of-use
\* (TOCTOU) race the English's serializability host obligation forecloses
\* (Edge cases — Concurrency and atomicity). `Observe` checks headroom; `Commit`
\* increments the running total later, WITHOUT re-checking. Two allocators can
\* both observe headroom against the same `allocated` and both commit.
\*
\* Expected result: Inv4_CapacityConstraint VIOLATED. With Capacity = 2 and three
\* workers: Observe(w1), Observe(w2), Observe(w3) all pass (each sees
\* allocated <= 1), then the three Commits drive allocated to 3 > 2. If the
\* checker reports all invariants hold here, the harness is vacuous: it would
\* mean a non-serializable allocate is safe, which is exactly the claim
\* Invariant 4's host obligation exists to deny.

EXTENDS Naturals

CONSTANTS Capacity, Workers

VARIABLES allocated, status   \* status: Workers -> {"idle","checked","allocated"}
vars == <<allocated, status>>

TypeOK ==
    /\ allocated \in 0..Cardinality(Workers)
    /\ status \in [Workers -> {"idle", "checked", "allocated"}]

Init ==
    /\ allocated = 0
    /\ status = [w \in Workers |-> "idle"]

\* BUG: check (Observe) and commit are separate steps. The capacity test is
\* evaluated at Observe time against the then-current `allocated`; Commit applies
\* the increment later with no re-check — the TOCTOU window.
Observe(w) ==
    /\ status[w] = "idle"
    /\ allocated + 1 <= Capacity
    /\ status' = [status EXCEPT ![w] = "checked"]
    /\ UNCHANGED allocated

Commit(w) ==
    /\ status[w] = "checked"
    /\ allocated' = allocated + 1
    /\ status' = [status EXCEPT ![w] = "allocated"]

Next == \E w \in Workers : Observe(w) \/ Commit(w)
Spec == Init /\ [][Next]_vars

Inv4_CapacityConstraint == allocated <= Capacity
Inv5_NonNegativity == allocated >= 0
Safety == TypeOK /\ Inv4_CapacityConstraint /\ Inv5_NonNegativity

====
