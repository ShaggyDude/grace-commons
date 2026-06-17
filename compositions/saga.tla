---- MODULE saga ----
\* Grace Commons — Saga / Compensable Workflow composition.
\* Spec-level formal sibling of compositions/saga.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS (base model — the two load-bearing invariants the
\* formal-layer vote names)
\*   Inv4 (all-or-compensated): a saga rests only as `committed` (every step's
\*       effect landed) or `compensated` (every landed effect has had its
\*       compensation executed); no completed external effect survives an abort
\*       uncompensated. Falsified by the skip-compensation twin
\*       (saga-skip-comp-buggy.tla), which declares the saga compensated after
\*       unwinding only the most-recent step.
\*   Inv7 (idempotency under retry): the durable-execution engine may RE-DELIVER a
\*       step effect, so each effect executes AT MOST ONCE per saga — a re-delivery
\*       is a no-op. Modeled with an explicit retry window (StepEffect stays
\*       enabled, re-firing, until StepRecord advances) plus an idempotency guard;
\*       a witness counter appCnt[i] records real executions and must stay <= 1.
\*       Falsified by the double-apply twin (saga-double-apply-buggy.tla), whose
\*       handler re-applies on every delivery.
\*   Inv6 (single terminal): `committed`/`compensated` are the only resting
\*       outcomes (a consistency form is checked; terminal absorption is by
\*       construction — no action is enabled out of a terminal in Next).
\*
\* ENCODING (mirrors the proven idiom in atoms/party-identity.tla and
\* compositions/undo-history.tla)
\* - No Sequences / RECURSIVE / CHOOSE; flat \E/\A; column-aligned junctions; the
\*   derived-property operators (IsCompTarget, AllCompensated) are PURE predicates
\*   over their arguments, never reading state variables free (the encoding that
\*   keeps the WASM checker off the stack-overflow path — see undo-history.tla).
\* - The effect ledger is per-step booleans plus 0..2 witness counters, not a log.
\*   Forward steps run in index order via `pos` (current step = pos + 1); the split
\*   between StepEffect (lands the effect, retryable) and StepRecord (advances) is
\*   the effect-then-record window the idempotency claim turns on. Compensation
\*   keys off `applied` (the effect ledger), so an effect that landed but was not
\*   yet recorded is still compensated.
\*
\* SCOPE (named, base model) — see the coverage matrix in saga.md Lineage
\* - Compensations are assumed to eventually succeed under retry, so the
\*   NON-TERMINAL `halted` holding state (a compensation that cannot complete — a
\*   liveness/operational concern, saga.md §Edge cases) is out of model scope.
\* - The forward-effect retry window is the modeled idempotency surface;
\*   compensation idempotency is symmetric and by-construction here (CompEffect
\*   fires once per step via its ~comp guard).
\* - Log faithfulness (Inv1), position equivalence (Inv2), compensation pairing
\*   (Inv3) and reverse-order (Inv5) are by-construction in this encoding.

EXTENDS Naturals

CONSTANT N                  \* number of forward steps (keep TLC finite)

Steps == 1..N
Phase == {"forward", "aborting", "committed", "compensated"}

VARIABLES
    phase,      \* saga phase / terminal outcome
    pos,        \* highest forward step recorded; current forward step = pos + 1
    applied,    \* Steps -> BOOLEAN ; step i's external effect has landed
    appCnt,     \* Steps -> 0..2    ; real executions of step i's effect (<= 1 ok)
    comp,       \* Steps -> BOOLEAN ; step i's compensation has executed
    compCnt     \* Steps -> 0..2    ; real executions of step i's compensation

vars == <<phase, pos, applied, appCnt, comp, compCnt>>

\* i is the highest applied, not-yet-compensated step: applied and uncompensated,
\* with every higher applied step already compensated. The reverse-order (LIFO)
\* compensation target. A pure predicate over its arguments (ap, cm), no free vars.
IsCompTarget(ap, cm, i) ==
    /\ ap[i]
    /\ ~cm[i]
    /\ \A j \in Steps : (j > i /\ ap[j]) => cm[j]

\* Every landed effect has been compensated (the compensated-terminal condition).
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

\* --- forward phase ---

\* Run the current step's external effect. Re-fireable (the engine may re-deliver):
\* the guard does NOT require ~applied, so it stays enabled while pos+1 is current.
\* CORRECT = idempotent: the effect lands once (appCnt -> 1), and a re-delivery
\* while applied is already TRUE is a no-op (the successor state is identical).
StepEffect(i) ==
    /\ phase = "forward"
    /\ i = pos + 1
    /\ appCnt[i] < 2
    /\ applied' = [applied EXCEPT ![i] = TRUE]
    /\ appCnt' = IF applied[i] THEN appCnt ELSE [appCnt EXCEPT ![i] = 1]
    /\ UNCHANGED <<phase, pos, comp, compCnt>>

\* Record the current step's completion and advance (the step_completed append +
\* Workflow / State Machine fire). Requires the effect to have landed.
StepRecord(i) ==
    /\ phase = "forward"
    /\ i = pos + 1
    /\ applied[i]
    /\ pos' = i
    /\ UNCHANGED <<phase, applied, appCnt, comp, compCnt>>

\* Commit: every step recorded.
Commit ==
    /\ phase = "forward"
    /\ pos = N
    /\ phase' = "committed"
    /\ UNCHANGED <<pos, applied, appCnt, comp, compCnt>>

\* Abort: a step failed or the saga was cancelled; enter the compensating phase.
Abort ==
    /\ phase = "forward"
    /\ phase' = "aborting"
    /\ UNCHANGED <<pos, applied, appCnt, comp, compCnt>>

\* --- compensating phase ---

\* Run the compensation for the highest applied, not-yet-compensated step (reverse
\* / LIFO order). CORRECT = idempotent (compCnt -> 1, once per step via ~comp).
CompEffect(i) ==
    /\ phase = "aborting"
    /\ IsCompTarget(applied, comp, i)
    /\ compCnt[i] < 2
    /\ comp' = [comp EXCEPT ![i] = TRUE]
    /\ compCnt' = [compCnt EXCEPT ![i] = 1]
    /\ UNCHANGED <<phase, pos, applied, appCnt>>

\* Done compensating: every landed effect has been compensated.
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

\* --- the verification surface ---

\* Invariant 4 — All-or-compensated (the load-bearing claim). A saga rests only as
\* `committed` (all effects landed) or `compensated` (every landed effect
\* compensated); no completed external effect survives an abort uncompensated.
Inv4_AllOrCompensated ==
    /\ (phase = "committed")   => (\A i \in Steps : applied[i])
    /\ (phase = "compensated") => AllCompensated(applied, comp)

\* Invariant 7 — Idempotency under retry. Each step effect and each compensation
\* executes at most once, even though the engine may re-deliver.
Inv7_Idempotent ==
    \A i \in Steps : appCnt[i] <= 1 /\ compCnt[i] <= 1

\* Invariant 6 — Single terminal outcome (consistency form): `committed` implies
\* every step was recorded. Terminal absorption is by construction (no action is
\* enabled out of "committed"/"compensated" in Next).
Inv6_TerminalConsistent ==
    (phase = "committed") => (pos = N)

Safety ==
    /\ TypeOK
    /\ Inv4_AllOrCompensated
    /\ Inv7_Idempotent
    /\ Inv6_TerminalConsistent

====
