---- MODULE approval-step-buggy ----
\* Grace Commons — Approval Step atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to approval-step.tla EXCEPT `Approve` drops the
\* `actor = approver[s]` guard — modeling an "any authenticated actor may
\* approve" implementation that violates Invariant 4 (approver exclusivity).
\*
\* Expected result: Inv4_ApproverExclusivity VIOLATED. Actor a2 (not s1's
\* approver) approves s1: decidedBy[s1] = a2 != approver[s1] = a1. If the checker
\* reports all invariants hold here, the harness is vacuous: an unguarded approve
\* would be safe, which is exactly what Invariant 4 denies.
\*
\* (Carries the same Inv9 frame-witness machinery as the correct model — added
\* 2026-07-12 when Invariant 9 was promoted to a checked property — so the twin
\* and the model stay identical except for the dropped guard. Non-vacuity of the
\* Inv9 check itself was demonstrated during the 2026-07-12 round with a
\* frame-clobber variant; see the atom's Lineage notes.)

Steps  == {"s1", "s2"}
Actors == {"a1", "a2", "a3"}
StepStates == {"Pending", "Approved", "Rejected", "Withdrawn"}

approver  == [s \in Steps |-> IF s = "s1" THEN "a1" ELSE "a2"]
submitter == [s \in Steps |-> "a3"]

Other(s) == IF s = "s1" THEN "s2" ELSE "s1"

VARIABLES state, decidedBy, lastOther, preState, preDecided
vars == <<state, decidedBy, lastOther, preState, preDecided>>

TypeOK ==
    /\ state \in [Steps -> StepStates]
    /\ decidedBy \in [Steps -> (Actors \cup {"none"})]
    /\ lastOther \in (Steps \cup {"none"})
    /\ preState \in StepStates
    /\ preDecided \in (Actors \cup {"none"})

Init ==
    /\ state = [s \in Steps |-> "Pending"]
    /\ decidedBy = [s \in Steps |-> "none"]
    /\ lastOther = "none"
    /\ preState = "Pending"
    /\ preDecided = "none"

\* BUG: no `actor = approver[s]` guard — any actor can approve.
Approve(s, actor) ==
    /\ state[s] = "Pending"
    /\ state' = [state EXCEPT ![s] = "Approved"]
    /\ decidedBy' = [decidedBy EXCEPT ![s] = actor]
    /\ lastOther' = Other(s)
    /\ preState' = state[Other(s)]
    /\ preDecided' = decidedBy[Other(s)]

Reject(s, actor) ==
    /\ state[s] = "Pending"
    /\ actor = approver[s]
    /\ state' = [state EXCEPT ![s] = "Rejected"]
    /\ decidedBy' = [decidedBy EXCEPT ![s] = actor]
    /\ lastOther' = Other(s)
    /\ preState' = state[Other(s)]
    /\ preDecided' = decidedBy[Other(s)]

Withdraw(s, actor) ==
    /\ state[s] = "Pending"
    /\ actor = submitter[s]
    /\ state' = [state EXCEPT ![s] = "Withdrawn"]
    /\ decidedBy' = [decidedBy EXCEPT ![s] = actor]
    /\ lastOther' = Other(s)
    /\ preState' = state[Other(s)]
    /\ preDecided' = decidedBy[Other(s)]

Next == \E s \in Steps, actor \in Actors :
            \/ Approve(s, actor)
            \/ Reject(s, actor)
            \/ Withdraw(s, actor)
Spec == Init /\ [][Next]_vars

Inv4_ApproverExclusivity ==
    \A s \in Steps : state[s] \in {"Approved", "Rejected"} => decidedBy[s] = approver[s]

Inv5_SubmitterExclusivity ==
    \A s \in Steps : state[s] = "Withdrawn" => decidedBy[s] = submitter[s]

Inv9_StepIndependence ==
    \/ lastOther = "none"
    \/ (state[lastOther] = preState /\ decidedBy[lastOther] = preDecided)

Safety == TypeOK /\ Inv4_ApproverExclusivity /\ Inv5_SubmitterExclusivity /\ Inv9_StepIndependence

====
