---- MODULE preference-buggy ----
\* Grace Commons — Preference / Personalization atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to preference.tla EXCEPT supersession is split into two steps with
\* the new Active record created BEFORE the prior in-effect record is retired —
\* the non-atomic `set` that opens the two-in-effect window Invariant 3 and the
\* supersession-atomicity decision point forbid.
\*
\* Expected result: Inv3_AtMostOneInEffect VIOLATED. After SupersedeAddNew the
\* principal has two in-effect records (the prior, not yet Deleted, and the new).

EXTENDS Naturals, FiniteSets

CONSTANT MaxP

Status == {"unused", "Active", "Suspended", "Deleted"}
InEffectStatuses == {"Active", "Suspended"}

VARIABLES status, toDelete       \* toDelete: slot awaiting retirement, 0 = none
vars == <<status, toDelete>>

InEffectCount == Cardinality({k \in 1..MaxP : status[k] \in InEffectStatuses})

TypeOK ==
    /\ status \in [1..MaxP -> Status]
    /\ toDelete \in 0..MaxP

Init ==
    /\ status = [k \in 1..MaxP |-> "unused"]
    /\ toDelete = 0

SetFresh ==
    /\ toDelete = 0
    /\ InEffectCount = 0
    /\ \E m \in 1..MaxP :
        /\ status[m] = "unused"
        /\ status' = [status EXCEPT ![m] = "Active"]
    /\ UNCHANGED toDelete

\* BUG: create the new Active record first; mark the prior for later deletion.
SupersedeAddNew ==
    /\ toDelete = 0
    /\ \E k, m \in 1..MaxP :
        /\ status[k] \in InEffectStatuses
        /\ status[m] = "unused"
        /\ k # m
        /\ status' = [status EXCEPT ![m] = "Active"]   \* prior k still in-effect
        /\ toDelete' = k

SupersedeDeleteOld ==
    /\ toDelete # 0
    /\ status' = [status EXCEPT ![toDelete] = "Deleted"]
    /\ toDelete' = 0

Suspend ==
    /\ toDelete = 0
    /\ \E k \in 1..MaxP :
        /\ status[k] = "Active"
        /\ status' = [status EXCEPT ![k] = "Suspended"]
    /\ UNCHANGED toDelete

Delete ==
    /\ toDelete = 0
    /\ \E k \in 1..MaxP :
        /\ status[k] \in InEffectStatuses
        /\ status' = [status EXCEPT ![k] = "Deleted"]
    /\ UNCHANGED toDelete

Next == SetFresh \/ SupersedeAddNew \/ SupersedeDeleteOld \/ Suspend \/ Delete
Spec == Init /\ [][Next]_vars

Inv3_AtMostOneInEffect == InEffectCount <= 1
Safety == TypeOK /\ Inv3_AtMostOneInEffect

====
