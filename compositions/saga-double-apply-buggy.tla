---- MODULE saga-double-apply-buggy ----
\* Grace Commons — Saga / Compensable Workflow: BUGGY TWIN (vacuity guard for Inv7).
\*
\* Identical to saga.tla EXCEPT `StepEffect` is NOT idempotent: every delivery
\* re-runs the effect, so when the engine re-delivers a step (a retry) the effect
\* is applied again and the witness counter appCnt climbs past 1. This is the
\* double-charge hazard idempotency-under-retry exists to forbid.
\*
\* Expected result: VIOLATION of Inv7_Idempotent (appCnt[i] reaches 2). If the
\* checker reports all invariants hold here, the harness is vacuous — a
\* non-idempotent handler under a retrying engine would be safe, which is exactly
\* what idempotency-under-retry denies.

EXTENDS Naturals

CONSTANT N

Steps == 1..N
Phase == {"forward", "aborting", "committed", "compensated"}

VARIABLES phase, pos, applied, appCnt, comp, compCnt
vars == <<phase, pos, applied, appCnt, comp, compCnt>>

IsCompTarget(ap, cm, i) ==
    /\ ap[i]
    /\ ~cm[i]
    /\ \A j \in Steps : (j > i /\ ap[j]) => cm[j]

AllCompensated(ap, cm) == \A i \in Steps : ap[i] => cm[i]

TypeOK ==
    /\ phase \in Phase
    /\ pos \in 0..N
    /\ applied \in [Steps -> BOOLEAN]
    /\ appCnt \in [Steps -> 0..2]
    /\ comp \in [Steps -> BOOLEAN]
    /\ compCnt \in [Steps -> 0..2]

Init ==
    /\ phase = "forward"
    /\ pos = 0
    /\ applied = [i \in Steps |-> FALSE]
    /\ appCnt = [i \in Steps |-> 0]
    /\ comp = [i \in Steps |-> FALSE]
    /\ compCnt = [i \in Steps |-> 0]

\* BUG: unconditional increment — a re-delivery re-applies the effect.
StepEffect(i) ==
    /\ phase = "forward"
    /\ i = pos + 1
    /\ appCnt[i] < 2
    /\ applied' = [applied EXCEPT ![i] = TRUE]
    /\ appCnt' = [appCnt EXCEPT ![i] = appCnt[i] + 1]
    /\ UNCHANGED <<phase, pos, comp, compCnt>>

StepRecord(i) ==
    /\ phase = "forward"
    /\ i = pos + 1
    /\ applied[i]
    /\ pos' = i
    /\ UNCHANGED <<phase, applied, appCnt, comp, compCnt>>

Commit ==
    /\ phase = "forward"
    /\ pos = N
    /\ phase' = "committed"
    /\ UNCHANGED <<pos, applied, appCnt, comp, compCnt>>

Abort ==
    /\ phase = "forward"
    /\ phase' = "aborting"
    /\ UNCHANGED <<pos, applied, appCnt, comp, compCnt>>

CompEffect(i) ==
    /\ phase = "aborting"
    /\ IsCompTarget(applied, comp, i)
    /\ compCnt[i] < 2
    /\ comp' = [comp EXCEPT ![i] = TRUE]
    /\ compCnt' = [compCnt EXCEPT ![i] = 1]
    /\ UNCHANGED <<phase, pos, applied, appCnt>>

CompDone ==
    /\ phase = "aborting"
    /\ AllCompensated(applied, comp)
    /\ phase' = "compensated"
    /\ UNCHANGED <<pos, applied, appCnt, comp, compCnt>>

Next ==
    \/ \E i \in Steps : StepEffect(i)
    \/ \E i \in Steps : StepRecord(i)
    \/ Commit
    \/ Abort
    \/ \E i \in Steps : CompEffect(i)
    \/ CompDone

Spec == Init /\ [][Next]_vars

Inv4_AllOrCompensated ==
    /\ (phase = "committed")   => (\A i \in Steps : applied[i])
    /\ (phase = "compensated") => AllCompensated(applied, comp)

Inv7_Idempotent ==
    \A i \in Steps : appCnt[i] <= 1 /\ compCnt[i] <= 1

Inv6_TerminalConsistent ==
    (phase = "committed") => (pos = N)

Safety ==
    /\ TypeOK
    /\ Inv4_AllOrCompensated
    /\ Inv7_Idempotent
    /\ Inv6_TerminalConsistent

====
