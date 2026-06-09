---- MODULE shared-todo ----
\* Grace Commons — Shared Todo composition.
\* Spec-level formal sibling of compositions/shared-todo.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing emergent claim is Invariant 3 (cascade-on-delete): when a task
\* is deleted, any Active assignment for it is recalled before the deletion
\* completes, so after a successful delete_task no Active assignment exists for
\* the deleted task — no dangling assignment against a deleted task.
\*
\* MODELING CHOICES
\* - One task. `taskExists` (Personal Todo presence) and `assignmentActive`
\*   (an Active Assignment for the task). The CORRECT `delete_task` performs the
\*   recall-then-delete cascade atomically.
\*
\* NOT MODELED (out of scope): Permissions enforcement (Invariant 1), the
\* at-most-one-responsible constraint (Invariant 2 — inherited from Assignment;
\* see assignment.tla), responsibility/authorization history queryability.

VARIABLES taskExists, assignmentActive
vars == <<taskExists, assignmentActive>>

TypeOK ==
    /\ taskExists \in BOOLEAN
    /\ assignmentActive \in BOOLEAN

Init ==
    /\ taskExists = TRUE
    /\ assignmentActive = FALSE

Assign ==
    /\ taskExists
    /\ ~assignmentActive
    /\ assignmentActive' = TRUE
    /\ UNCHANGED taskExists

Recall ==
    /\ assignmentActive
    /\ assignmentActive' = FALSE
    /\ UNCHANGED taskExists

\* CORRECT delete_task: recall any Active assignment, then delete — one cascade.
DeleteTask ==
    /\ taskExists
    /\ taskExists' = FALSE
    /\ assignmentActive' = FALSE
    \* (the recall is folded into the same atomic cascade as the delete)

Next == Assign \/ Recall \/ DeleteTask
Spec == Init /\ [][Next]_vars

\* Load-bearing — a deleted task has no Active assignment dangling against it.
Inv_CascadeOnDelete == ~taskExists => ~assignmentActive
Safety == TypeOK /\ Inv_CascadeOnDelete

====
