---- MODULE assignment ----
\* Grace Commons — Assignment atom.
\* Spec-level formal sibling of atoms/productivity/assignment.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* Invariant 1 (at most one Active assignment per task) and the load-bearing
\* Invariant 7 (reassign atomicity — after a reassign exactly one assignment is
\* Active; there is no observable state in which both old and new are Active, or
\* in which neither is). Modeled for a single task: `reassign` must move the old
\* assignment to Transferred and create the new Active assignment in ONE step.
\*
\* MODELING CHOICES
\* - A single task with up to `MaxA` assignment slots, each
\*   {unused, Active, Recalled, Transferred}. `ActiveCount` is the number of
\*   slots currently Active. The CORRECT `reassign` is a single atomic step.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - Multiple tasks (Invariant 1 is per-task; one task exercises it).
\* - id immutability / no-reuse / timestamp ordering (Invariants 2,5,6,8 —
\*   structural / clock, not interleaving).

EXTENDS Naturals, FiniteSets

CONSTANT MaxA               \* number of assignment slots for the task

Status == {"unused", "Active", "Recalled", "Transferred"}

VARIABLE status             \* 1..MaxA -> Status
vars == <<status>>

ActiveCount == Cardinality({k \in 1..MaxA : status[k] = "Active"})

TypeOK == status \in [1..MaxA -> Status]

Init == status = [k \in 1..MaxA |-> "unused"]

\* assign: only when the task has no Active assignment (Invariant 1 enforced at
\* the boundary); claim a free slot.
Assign ==
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxA :
        /\ status[m] = "unused"
        /\ status' = [status EXCEPT ![m] = "Active"]

Recall ==
    /\ \E k \in 1..MaxA :
        /\ status[k] = "Active"
        /\ status' = [status EXCEPT ![k] = "Recalled"]

\* CORRECT reassign: old -> Transferred and new -> Active in ONE atomic step.
\* ActiveCount is 1 before and 1 after; it is never observably 0 or 2.
ReassignAtomic ==
    /\ \E k, m \in 1..MaxA :
        /\ status[k] = "Active"
        /\ status[m] = "unused"
        /\ k # m
        /\ status' = [status EXCEPT ![k] = "Transferred", ![m] = "Active"]

Next == Assign \/ Recall \/ ReassignAtomic
Spec == Init /\ [][Next]_vars

\* Invariant 1 — at most one Active assignment per task.
Inv1_AtMostOneActive == ActiveCount <= 1

Safety == TypeOK /\ Inv1_AtMostOneActive

\* NOTE Invariant 7 (reassign atomicity) is what makes Inv1 hold THROUGH a
\* reassign: because ReassignAtomic is a single step, no reachable state shows
\* two Active assignments for the task. The buggy twin splits the step and
\* Inv1 catches the resulting two-Active window.

====
