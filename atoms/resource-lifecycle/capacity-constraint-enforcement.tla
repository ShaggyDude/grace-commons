---- MODULE capacity-constraint-enforcement ----
\* Grace Commons — Capacity Constraint Enforcement atom.
\* Spec-level formal sibling of atoms/resource-lifecycle/capacity-constraint-enforcement.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is Invariant 4 (capacity constraint): at every instant
\* `allocated <= capacity`, *conditional on the host obligation of serializable
\* concurrent execution against the same pool*. The atom enforces it by
\* precondition on `allocate` (reject if `allocated + count > capacity`). The
\* model's job is to show this holds under EVERY interleaving of concurrent
\* allocators when allocate is serializable — and that it FAILS when it is not
\* (the buggy twin), which is exactly what the serializability obligation buys.
\*
\* MODELING CHOICES
\* - `Workers` concurrent allocators, each requesting one unit. `allocated` is
\*   the pool's running total; `status[w]` bounds each worker to one allocation.
\* - The CORRECT model makes `allocate` a single atomic check-and-commit step —
\*   the serializable execution the host obligation requires. No interleaving
\*   can wedge between the check and the commit.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - release / adjust_capacity / suspend / resume / close lifecycle (the
\*   capacity bound is exercised by allocate against a fixed capacity here).
\* - Field validation and storage-failure guards; audit-log append (Inv 9–11).
\* - Crash atomicity (Inv 14) — a within-action obligation, not an interleaving
\*   one; named as a separate host obligation in the English.

EXTENDS Naturals

CONSTANTS Capacity,         \* the pool's declared capacity (fixed here)
          Workers           \* set of concurrent allocators, each wanting 1 unit

VARIABLES allocated,        \* running total of allocated units
          status            \* Workers -> {"idle","allocated"}

vars == <<allocated, status>>

TypeOK ==
    /\ allocated \in 0..Cardinality(Workers)
    /\ status \in [Workers -> {"idle", "allocated"}]

Init ==
    /\ allocated = 0
    /\ status = [w \in Workers |-> "idle"]

\* CORRECT allocate: serializable check-and-commit in one atomic step. The
\* capacity precondition and the running-total increment cannot be split by any
\* interleaving — this is the host's serializability obligation, modeled.
AllocateAtomic(w) ==
    /\ status[w] = "idle"
    /\ allocated + 1 <= Capacity
    /\ allocated' = allocated + 1
    /\ status' = [status EXCEPT ![w] = "allocated"]

Next == \E w \in Workers : AllocateAtomic(w)
Spec == Init /\ [][Next]_vars

\* Invariant 4 — capacity constraint. THE load-bearing arithmetic invariant.
Inv4_CapacityConstraint == allocated <= Capacity

\* Invariant 5 — non-negativity (trivially held here; no release modeled).
Inv5_NonNegativity == allocated >= 0

Safety == TypeOK /\ Inv4_CapacityConstraint /\ Inv5_NonNegativity

====
