---- MODULE approval-step ----
\* Grace Commons — Approval Step atom.
\* Spec-level formal sibling of atoms/approval-step.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claims are Invariant 4 (approver exclusivity — only the actor
\* matching approver_ref may move a step Pending -> Approved/Rejected),
\* Invariant 5 (submitter exclusivity — only submitter_ref may withdraw), and
\* Invariant 9 (concurrent step independence — deciding one step does not change
\* another). Also: Invariant 2 (membership exclusivity) and Invariant 3 (terminal
\* absorption — each terminal state is absorbing).
\*
\* MODELING CHOICES
\* - Two steps with fixed approver/submitter bindings, a set of candidate actors.
\*   Every decision action quantifies over ALL actors; the guard enforces the
\*   exclusivity, so the model would EXPOSE any actor able to decide who should
\*   not be.
\* - Invariant 9 is CHECKED, not assumed (promoted 2026-07-12 by the scheduled
\*   rescan's coverage cross-check — the Party Identity Invariant-6 precedent):
\*   each action records which step it did NOT act on (lastOther) and snapshots
\*   that step's pre-action state/decidedBy from the UNPRIMED variables;
\*   Inv9_StepIndependence then asserts, in the post-state, that the untouched
\*   step still carries its snapshot. The snapshot derives from actual history,
\*   so a frame-violating action (one whose EXCEPT reaches the other step) is
\*   caught rather than assumed impossible.
\*
\* NOT MODELED (out of scope): id immutability / no-reuse / store durability /
\* timestamp ordering (Invariants 1,6-8,10 — structural / clock).

Steps  == {"s1", "s2"}
Actors == {"a1", "a2", "a3"}
StepStates == {"Pending", "Approved", "Rejected", "Withdrawn"}

\* Fixed bindings: a1 approves s1, a2 approves s2; a3 submits both.
approver  == [s \in Steps |-> IF s = "s1" THEN "a1" ELSE "a2"]
submitter == [s \in Steps |-> "a3"]

Other(s) == IF s = "s1" THEN "s2" ELSE "s1"

\* state: Steps -> StepStates ; decidedBy: Steps -> Actors \cup {none}
\* lastOther/preState/preDecided: the Inv9 frame-witness (see header).
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

\* CORRECT: approve/reject guarded on actor = approver_ref; withdraw on
\* actor = submitter_ref. Each updates only step s; the witness conjuncts
\* snapshot the OTHER step's pre-action values (unprimed reads only).
Approve(s, actor) ==
    /\ state[s] = "Pending"
    /\ actor = approver[s]
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

\* Invariant 4 — approver exclusivity.
Inv4_ApproverExclusivity ==
    \A s \in Steps : state[s] \in {"Approved", "Rejected"} => decidedBy[s] = approver[s]

\* Invariant 5 — submitter exclusivity.
Inv5_SubmitterExclusivity ==
    \A s \in Steps : state[s] = "Withdrawn" => decidedBy[s] = submitter[s]

\* Invariant 9 — concurrent step independence (checked, not assumed).
\* In the post-state of every action, the step the action did NOT target still
\* carries exactly the state/decidedBy it had before the action fired.
Inv9_StepIndependence ==
    \/ lastOther = "none"
    \/ (state[lastOther] = preState /\ decidedBy[lastOther] = preDecided)

Safety == TypeOK /\ Inv4_ApproverExclusivity /\ Inv5_SubmitterExclusivity /\ Inv9_StepIndependence

\* NOTE Invariant 3 (terminal absorption) remains enforced by construction (every
\* action guards on state[s] = "Pending"); it is not vote-named load-bearing, so
\* by-construction is acceptable per the coverage cross-check verdicts.

====
