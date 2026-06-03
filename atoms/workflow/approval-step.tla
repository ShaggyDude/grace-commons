---- MODULE approval-step ----
\* Grace Commons — Approval Step atom.
\* Spec-level formal sibling of atoms/workflow/approval-step.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
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
\*   not be. Each action updates only its own step (the frame), so Invariant 9
\*   (independence) is modeled directly: the other step is UNCHANGED.
\*
\* NOT MODELED (out of scope): id immutability / no-reuse / store durability /
\* timestamp ordering (Invariants 1,6-8,10 — structural / clock).

Steps  == {"s1", "s2"}
Actors == {"a1", "a2", "a3"}
StepStates == {"Pending", "Approved", "Rejected", "Withdrawn"}

\* Fixed bindings: a1 approves s1, a2 approves s2; a3 submits both.
approver  == [s \in Steps |-> IF s = "s1" THEN "a1" ELSE "a2"]
submitter == [s \in Steps |-> "a3"]

VARIABLES state, decidedBy      \* Steps -> StepStates ; Steps -> Actors \cup {none}
vars == <<state, decidedBy>>

TypeOK ==
    /\ state \in [Steps -> StepStates]
    /\ decidedBy \in [Steps -> (Actors \cup {"none"})]

Init ==
    /\ state = [s \in Steps |-> "Pending"]
    /\ decidedBy = [s \in Steps |-> "none"]

\* CORRECT: approve/reject guarded on actor = approver_ref; withdraw on
\* actor = submitter_ref. Each updates only step s (frame => independence).
Approve(s, actor) ==
    /\ state[s] = "Pending"
    /\ actor = approver[s]
    /\ state' = [state EXCEPT ![s] = "Approved"]
    /\ decidedBy' = [decidedBy EXCEPT ![s] = actor]

Reject(s, actor) ==
    /\ state[s] = "Pending"
    /\ actor = approver[s]
    /\ state' = [state EXCEPT ![s] = "Rejected"]
    /\ decidedBy' = [decidedBy EXCEPT ![s] = actor]

Withdraw(s, actor) ==
    /\ state[s] = "Pending"
    /\ actor = submitter[s]
    /\ state' = [state EXCEPT ![s] = "Withdrawn"]
    /\ decidedBy' = [decidedBy EXCEPT ![s] = actor]

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

Safety == TypeOK /\ Inv4_ApproverExclusivity /\ Inv5_SubmitterExclusivity

\* NOTE Invariant 3 (terminal absorption) is enforced by construction (every
\* action guards on state[s] = "Pending"). Invariant 9 (concurrent step
\* independence) is modeled by the frame: each action's EXCEPT touches only step
\* s, so the other step's state and decidedBy are unchanged.

====
