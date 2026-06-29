---- MODULE message-preference ----
\* Grace Commons — Message Preference / Personalization atom.
\* Spec-level formal sibling of atoms/message-preference.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is Invariant 3 (at most one currently-in-effect —
\* Active or Suspended — preference record per principal) together with
\* supersession atomicity (Decision points / Invariant 4): a `set` for a
\* principal who already has a currently-in-effect record creates the new record
\* AND transitions the prior to Deleted in one operation, so "an external
\* observer never sees a moment in which the principal has two Active-or-Suspended
\* records." Modeled for a single principal.
\*
\* MODELING CHOICES
\* - One principal with up to `MaxP` record slots, each
\*   {unused, Active, Suspended, Deleted}. "In effect" = Active or Suspended.
\*   The CORRECT supersession is a single atomic step.
\*
\* NOT MODELED (out of scope): id immutability/no-reuse, field retention,
\* timestamp ordering (structural / clock, not the exclusivity claim).

EXTENDS Naturals, FiniteSets

CONSTANT MaxP               \* preference-record slots for the principal

Status == {"unused", "Active", "Suspended", "Deleted"}
InEffectStatuses == {"Active", "Suspended"}

VARIABLE status             \* 1..MaxP -> Status
vars == <<status>>

InEffectCount == Cardinality({k \in 1..MaxP : status[k] \in InEffectStatuses})

TypeOK == status \in [1..MaxP -> Status]
Init == status = [k \in 1..MaxP |-> "unused"]

\* set with no prior in-effect record: just create a fresh Active record.
SetFresh ==
    /\ InEffectCount = 0
    /\ \E m \in 1..MaxP :
        /\ status[m] = "unused"
        /\ status' = [status EXCEPT ![m] = "Active"]

\* CORRECT supersession: new record Active AND prior in-effect -> Deleted, in
\* ONE atomic step. In-effect count is 1 before and 1 after; never 2.
SetSupersede ==
    /\ \E k, m \in 1..MaxP :
        /\ status[k] \in InEffectStatuses
        /\ status[m] = "unused"
        /\ k # m
        /\ status' = [status EXCEPT ![k] = "Deleted", ![m] = "Active"]

Suspend ==
    /\ \E k \in 1..MaxP :
        /\ status[k] = "Active"
        /\ status' = [status EXCEPT ![k] = "Suspended"]

Delete ==
    /\ \E k \in 1..MaxP :
        /\ status[k] \in InEffectStatuses
        /\ status' = [status EXCEPT ![k] = "Deleted"]

Next == SetFresh \/ SetSupersede \/ Suspend \/ Delete
Spec == Init /\ [][Next]_vars

\* Invariant 3 — at most one currently-in-effect record per principal.
Inv3_AtMostOneInEffect == InEffectCount <= 1
Safety == TypeOK /\ Inv3_AtMostOneInEffect

\* NOTE supersession atomicity is what holds Inv3 THROUGH a `set` over an
\* existing record: SetSupersede is one step, so no reachable state shows two
\* in-effect records. The buggy twin splits it and Inv3 catches the window.

====
