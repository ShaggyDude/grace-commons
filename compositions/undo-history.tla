---- MODULE undo-history ----
\* Grace Commons — Undo History composition.
\* Spec-level formal sibling of compositions/undo-history.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS (Tier-A + Tier-B extension, 2026-06-14)
\* The original model checked only undo-targeting (Inv 3) over an integer
\* abstraction. This model models the actual event-sourcing mechanism — a real
\* Personal Todo status per id plus a from-scratch replay derived from the log —
\* and machine-checks the load-bearing claims a skeptic wants:
\*   Inv1 (log faithfulness): no exposed-state change without a corresponding
\*       append; every successful action appends exactly one event. Modeled with
\*       an explicit storage-failure branch (the append can fail) and a ghost
\*       record of what each step did. (Falsified by the storage-failure twin,
\*       which updates derived even when the append failed.)
\*   Inv2 (state equivalence): the incrementally-maintained `derived` state equals
\*       replaying the non-undone events from scratch. The forward wiring updates
\*       `derived` incrementally; StatusOf recomputes it independently from the
\*       log; the check is that the two never diverge. (Falsified by the stale-undo
\*       twin, whose undo fails to recompute derived.)
\*   Inv3 (undo targeting): undo removes the most-recent non-undone forward event,
\*       so the undone set is a top-suffix of the forward log. (Falsified by the
\*       oldest-targeting twin.)
\*   Inv4 (replay validity / Personal Todo invariants preserved): replay never
\*       applies an event whose Personal Todo precondition fails — add only on an
\*       absent id, complete only on a pending id, delete only on a present id.
\*       (Also falsified by the oldest-targeting twin: removing a middle event
\*       leaves a later event with a failed precondition on replay.)
\*
\* ENCODING (mirrors the proven idiom in atoms/party-identity.tla)
\* - The forward log is an insertion-ordered pair of functions ltype/lid over
\*   1..MaxEvents with `len` filled slots (the Sequences module is avoided — the
\*   WASM checker handles Naturals/FiniteSets/functions; see tools/harness). Events
\*   are forward only (add/complete/delete); `undone[i]` marks forward event i
\*   undone — undo via a compensating marker, not mutation (Invariant 5).
\* - The derived-property operators are PURE FUNCTIONS OF THEIR ARGUMENTS: the log
\*   (lt/li), length, and undone-set are passed in, never read as free state
\*   variables. "Most-recent non-undone forward event for id x" is expressed with a
\*   flat \E .. \A predicate (IsLastFwd), no CHOOSE — exactly party-identity.tla's
\*   HasPassedAfterSuspend shape. (The earlier draft read ltype/lid as free vars
\*   inside CHOOSE-bearing operators and overflowed the WASM checker's stack at
\*   minimal scale; this encoding is the fix.)
\* - `derived` is the exposed Personal Todo status the wiring maintains; StatusOf
\*   computes the same status declaratively from (log, undone) as the effect of the
\*   most-recent non-undone forward event per id. `derived = StatusOf` is an honest
\*   equivalence between two independent computations, not a tautology — the
\*   stale-undo twin makes them diverge.
\* - SCOPE: forward-then-undo (no forward action after an undo — Invariant 7's
\*   redo-unreachability is out of scope, as in the prior model). `edit` events are
\*   omitted (a description-only change that does not affect the Pending/Done
\*   lifecycle the replay/identity claims turn on).
\*
\* NOT MODELED: identity preservation across delete/undo at field level (Invariant
\* 6 — id/timestamp content; this model tracks status, not content; Tier C). Event
\* Log's own invariants (Invariant 5; see atoms/event-log surface).

EXTENDS Naturals, FiniteSets

CONSTANTS MaxEvents, Ids         \* log bound; the set of todo ids (keep TLC finite)

Status == {"absent", "pending", "done"}
FType  == {"add", "complete", "delete"}

VARIABLES
    ltype,      \* 1..MaxEvents -> FType \cup {"e"} ; forward-event type per slot
    lid,        \* 1..MaxEvents -> Ids \cup {0}     ; forward-event id per slot
    undone,     \* 1..MaxEvents -> BOOLEAN          ; is forward event i undone?
    len,        \* number of filled forward-event slots
    phase,      \* "adding" then "undoing" (forward-then-undo scope)
    derived,    \* Ids -> Status ; the exposed state the wiring maintains
    didAppend,  \* ghost: did the most recent step append exactly one event?
    didChange   \* ghost: did the most recent step change the exposed projection?

vars == <<ltype, lid, undone, len, phase, derived, didAppend, didChange>>

\* i is the last non-undone forward event for id x within slots 1..n: a non-undone
\* forward event for x with every later forward event for x already undone. A pure
\* function of the log (lt/li) and undone-set (und) — party-identity's idiom,
\* flat \E/\A, no CHOOSE.
IsLastFwd(lt, li, n, und, x, i) ==
    /\ i \in 1..n
    /\ lt[i] \in FType
    /\ li[i] = x
    /\ ~und[i]
    /\ \A j \in 1..n : (j > i /\ lt[j] \in FType /\ li[j] = x) => und[j]

\* The exposed status of id x = the effect of its most-recent non-undone forward
\* event among slots 1..n (add -> pending, complete -> done, delete/none -> absent).
\* Computed from the log alone, independent of `derived`.
StatusOf(lt, li, n, und, x) ==
    IF   \E i \in 1..n : IsLastFwd(lt, li, n, und, x, i) /\ lt[i] = "add"
    THEN "pending"
    ELSE IF \E i \in 1..n : IsLastFwd(lt, li, n, und, x, i) /\ lt[i] = "complete"
    THEN "done"
    ELSE "absent"

TypeOK ==
    /\ ltype \in [1..MaxEvents -> FType \cup {"e"}]
    /\ lid \in [1..MaxEvents -> Ids \cup {0}]
    /\ undone \in [1..MaxEvents -> BOOLEAN]
    /\ len \in 0..MaxEvents
    /\ phase \in {"adding", "undoing"}
    /\ derived \in [Ids -> Status]
    /\ didAppend \in BOOLEAN
    /\ didChange \in BOOLEAN

Init ==
    /\ ltype = [i \in 1..MaxEvents |-> "e"]
    /\ lid = [i \in 1..MaxEvents |-> 0]
    /\ undone = [i \in 1..MaxEvents |-> FALSE]
    /\ len = 0
    /\ phase = "adding"
    /\ derived = [x \in Ids |-> "absent"]
    /\ didAppend = FALSE
    /\ didChange = FALSE

\* --- forward actions: each appends one event; guards = Personal Todo preconditions ---
\* The successful branch appends and updates derived together (didAppend = didChange
\* = TRUE). The *Fail branch is the storage-failure path: the append is rejected, so
\* NOTHING domain-visible changes (didAppend = didChange = FALSE) — "the action did
\* not happen" (undo-history.md §Action wiring). Inv1 reads the ghost pair.

DoAdd(x) ==
    /\ phase = "adding"
    /\ len < MaxEvents
    /\ derived[x] = "absent"
    /\ ltype' = [ltype EXCEPT ![len + 1] = "add"]
    /\ lid' = [lid EXCEPT ![len + 1] = x]
    /\ len' = len + 1
    /\ derived' = [derived EXCEPT ![x] = "pending"]
    /\ didAppend' = TRUE
    /\ didChange' = TRUE
    /\ UNCHANGED <<undone, phase>>

DoComplete(x) ==
    /\ phase = "adding"
    /\ len < MaxEvents
    /\ derived[x] = "pending"
    /\ ltype' = [ltype EXCEPT ![len + 1] = "complete"]
    /\ lid' = [lid EXCEPT ![len + 1] = x]
    /\ len' = len + 1
    /\ derived' = [derived EXCEPT ![x] = "done"]
    /\ didAppend' = TRUE
    /\ didChange' = TRUE
    /\ UNCHANGED <<undone, phase>>

DoDelete(x) ==
    /\ phase = "adding"
    /\ len < MaxEvents
    /\ derived[x] \in {"pending", "done"}
    /\ ltype' = [ltype EXCEPT ![len + 1] = "delete"]
    /\ lid' = [lid EXCEPT ![len + 1] = x]
    /\ len' = len + 1
    /\ derived' = [derived EXCEPT ![x] = "absent"]
    /\ didAppend' = TRUE
    /\ didChange' = TRUE
    /\ UNCHANGED <<undone, phase>>

\* Storage-failure branch of a forward action: the precondition held, but Event
\* Log's append returned rejected(storage-failure); per the wiring, the caller gets
\* storage-failure and the derived state is NOT updated — the action did not happen.
\* Nothing changes but the ghost pair (both FALSE). This is the witness Inv1 needs:
\* a step that *could* have changed derived but, because no append landed, must not.
ForwardFail ==
    /\ phase = "adding"
    /\ len < MaxEvents
    /\ didAppend' = FALSE
    /\ didChange' = FALSE
    /\ UNCHANGED <<ltype, lid, undone, len, phase, derived>>

\* CORRECT undo: target the most-recent non-undone forward event (the unique k that
\* is non-undone with every later slot already undone), then recompute the exposed
\* state by replay over the new undone-set (re-derivation, never a reversing call to
\* Personal Todo). The append of the compensating undo event succeeds here.
DoUndo ==
    /\ len > 0
    /\ \E k \in 1..len :
        /\ ~undone[k]
        /\ \A j \in 1..len : (j > k) => undone[j]
        /\ undone' = [undone EXCEPT ![k] = TRUE]
        /\ derived' = [x \in Ids |-> StatusOf(ltype, lid, len, [undone EXCEPT ![k] = TRUE], x)]
    /\ phase' = "undoing"
    /\ didAppend' = TRUE
    /\ didChange' = TRUE
    /\ UNCHANGED <<ltype, lid, len>>

\* Storage-failure branch of undo: the compensating-event append fails, so undo
\* returns storage-failure and the derived state is not recomputed (undo-history.md
\* §Action wiring, the undo storage-failure path). Nothing changes but the ghosts.
UndoFail ==
    /\ len > 0
    /\ \E k \in 1..len : ~undone[k]
    /\ didAppend' = FALSE
    /\ didChange' = FALSE
    /\ UNCHANGED <<ltype, lid, undone, len, phase, derived>>

Forward(x) == DoAdd(x) \/ DoComplete(x) \/ DoDelete(x)

Next ==
    \/ \E x \in Ids : Forward(x)
    \/ ForwardFail
    \/ DoUndo
    \/ UndoFail

Spec == Init /\ [][Next]_vars

\* --- the verification surface ---

\* Invariant 1 — Log faithfulness. No exposed-state change without an append: a
\* step that changed the projection must have appended an event. The storage-failure
\* branches set didChange = didAppend = FALSE; every successful action sets both
\* TRUE; so didChange => didAppend is the action<->append coupling, and the
\* storage-failure twin (which changes derived on a failed append) violates it.
Inv1_LogFaithfulness == didChange => didAppend

\* Invariant 2 — State equivalence: maintained state equals replay of non-undone
\* events. The forward wiring maintains `derived` incrementally; StatusOf is the
\* independent from-scratch replay; this asserts they never diverge.
Inv2_StateEquivalence ==
    \A x \in Ids : derived[x] = StatusOf(ltype, lid, len, undone, x)

\* Invariant 3 — undo targets the most recent forward event: the undone set is a
\* top-suffix of the forward log.
Inv3_TopSuffix ==
    \A i, j \in 1..len : (i < j /\ undone[i]) => undone[j]

\* Invariant 4 — replay never applies an event whose Personal Todo precondition
\* fails (Personal Todo's invariants preserved over the derived state): each
\* non-undone forward event's precondition holds against the replay of 1..i-1.
Inv4_ReplayValid ==
    \A i \in 1..len :
        ~undone[i] =>
            (IF   ltype[i] = "add"
             THEN StatusOf(ltype, lid, i - 1, undone, lid[i]) = "absent"
             ELSE IF ltype[i] = "complete"
             THEN StatusOf(ltype, lid, i - 1, undone, lid[i]) = "pending"
             ELSE StatusOf(ltype, lid, i - 1, undone, lid[i]) \in {"pending", "done"})

Safety ==
    /\ TypeOK
    /\ Inv1_LogFaithfulness
    /\ Inv2_StateEquivalence
    /\ Inv3_TopSuffix
    /\ Inv4_ReplayValid

====
