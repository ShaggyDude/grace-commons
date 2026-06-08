---- MODULE assignment-buggy ----
\* Grace Commons — Assignment atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to assignment.tla EXCEPT `reassign` is split into two steps with
\* the new Active assignment created BEFORE the old one is retired — a non-atomic
\* reassign that opens the two-Active window Invariant 7 forbids ("no observable
\* state in which both are Active").
\*
\* Expected result: Inv1_AtMostOneActive VIOLATED. After ReassignAddNew the task
\* has two Active assignments (the old, not yet Transferred, and the new). If the
\* checker reports all invariants hold here, the harness is vacuous: a non-atomic
\* reassign would be safe, which is exactly what Invariant 7 denies.

EXTENDS Naturals, FiniteSets

CONSTANT MaxA

Status == {"unused", "Active", "Recalled", "Transferred"}

VARIABLES status, toTransfer    \* toTransfer: slot awaiting retirement, 0 = none
vars == <<status, toTransfer>>

ActiveCount == Cardinality({k \in 1..MaxA : status[k] = "Active"})

TypeOK ==
    /\ status \in [1..MaxA -> Status]
    /\ toTransfer \in 0..MaxA

Init ==
    /\ status = [k \in 1..MaxA |-> "unused"]
    /\ toTransfer = 0

Assign ==
    /\ toTransfer = 0
    /\ ActiveCount = 0
    /\ \E m \in 1..MaxA :
        /\ status[m] = "unused"
        /\ status' = [status EXCEPT ![m] = "Active"]
    /\ UNCHANGED toTransfer

Recall ==
    /\ toTransfer = 0
    /\ \E k \in 1..MaxA :
        /\ status[k] = "Active"
        /\ status' = [status EXCEPT ![k] = "Recalled"]
    /\ UNCHANGED toTransfer

\* BUG: create the new Active assignment first, mark the old for later transfer.
ReassignAddNew ==
    /\ toTransfer = 0
    /\ \E k, m \in 1..MaxA :
        /\ status[k] = "Active"
        /\ status[m] = "unused"
        /\ k # m
        /\ status' = [status EXCEPT ![m] = "Active"]   \* old k still Active here
        /\ toTransfer' = k

ReassignTransferOld ==
    /\ toTransfer # 0
    /\ status' = [status EXCEPT ![toTransfer] = "Transferred"]
    /\ toTransfer' = 0

Next == Assign \/ Recall \/ ReassignAddNew \/ ReassignTransferOld
Spec == Init /\ [][Next]_vars

Inv1_AtMostOneActive == ActiveCount <= 1
Safety == TypeOK /\ Inv1_AtMostOneActive

====
