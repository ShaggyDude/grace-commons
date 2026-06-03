---- MODULE shared-todo-buggy ----
\* Grace Commons — Shared Todo composition: BUGGY TWIN (vacuity guard).
\*
\* Identical to shared-todo.tla EXCEPT `DeleteTask` deletes the task WITHOUT
\* recalling its Active assignment first — the cascade-on-delete violation that
\* leaves a dangling Active assignment against a deleted task.
\*
\* Expected result: Inv_CascadeOnDelete VIOLATED. Assign (assignmentActive),
\* DeleteTask -> taskExists = FALSE while assignmentActive = TRUE. If the checker
\* reports all invariants hold here, the harness is vacuous: deleting without the
\* recall cascade would be safe, which is exactly what Invariant 3 denies.

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

\* BUG: delete the task without recalling its Active assignment.
DeleteTask ==
    /\ taskExists
    /\ taskExists' = FALSE
    /\ UNCHANGED assignmentActive

Next == Assign \/ Recall \/ DeleteTask
Spec == Init /\ [][Next]_vars

Inv_CascadeOnDelete == ~taskExists => ~assignmentActive
Safety == TypeOK /\ Inv_CascadeOnDelete

====
