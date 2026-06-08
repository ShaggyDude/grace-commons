---- MODULE capacity-constraint-enforcement ----
\* Grace Commons — Capacity Constraint Enforcement atom.
\* Spec-level formal sibling of atoms/capacity-constraint-enforcement.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claims are Invariant 4 (capacity constraint): at every instant
\* `allocated <= capacity`, and Invariant 5 (non-negativity): at every instant
\* `allocated >= 0`. The atom enforces Inv4 by precondition on `allocate` (reject
\* if `allocated + count > capacity`) and Inv5 by precondition on `release`
\* (reject if `count > allocated`). Both invariants are checked under every
\* interleaving of concurrent allocators and releasers; the buggy twin drives
\* `allocated` below 0 by omitting the release guard, the checker rejects it —
\* proving Inv5 is non-vacuous on the release path.
\*
\* MODELING CHOICES
\* - `Workers` concurrent allocators/releasers, each holding at most one unit.
\*   `allocated` is the pool's running total; `status[w]` tracks whether each
\*   worker is idle (can allocate) or allocated (can release).
\* - `AllocateAtomic(w)`: single atomic check-and-commit — the serializable
\*   execution the host obligation requires; no interleaving can wedge between
\*   the capacity test and the running-total increment.
\* - `ReleaseAtomic(w)`: guarded release — `allocated >= 1` (exactly one unit
\*   per worker) enforces the spec's `count <= allocated` precondition and
\*   prevents `allocated` from going negative. This makes Inv5 non-vacuous.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - adjust_capacity / suspend / resume / close lifecycle (the capacity bound
\*   is exercised by allocate/release against a fixed capacity here).
\* - Field validation and storage-failure guards; audit-log append (Inv 9–11).
\* - Crash atomicity (Inv 14) — a within-action obligation, not an interleaving
\*   one; named as a separate host obligation in the English.

EXTENDS Naturals, FiniteSets

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

\* CORRECT release: guarded decrement. The guard `allocated >= 1` (one unit per
\* worker) models the spec's `count <= allocated` precondition that prevents
\* `allocated` from going negative. This is the real enforcement path for
\* Inv5_NonNegativity — without it the non-negativity check would be vacuous.
ReleaseAtomic(w) ==
    /\ status[w] = "allocated"
    /\ allocated >= 1
    /\ allocated' = allocated - 1
    /\ status' = [status EXCEPT ![w] = "idle"]

Next ==
    \E w \in Workers :
        \/ AllocateAtomic(w)
        \/ ReleaseAtomic(w)
Spec == Init /\ [][Next]_vars

\* Invariant 4 — capacity constraint. THE load-bearing arithmetic invariant.
Inv4_CapacityConstraint == allocated <= Capacity

\* Invariant 5 — non-negativity. Enforced by the release guard; non-vacuous
\* because ReleaseAtomic is now in scope and the buggy twin omits the guard.
Inv5_NonNegativity == allocated >= 0

Safety == TypeOK /\ Inv4_CapacityConstraint /\ Inv5_NonNegativity

====
