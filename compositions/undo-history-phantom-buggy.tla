---- MODULE undo-history-phantom-buggy ----
\* Grace Commons — Undo History composition: BUGGY TWIN (vacuity guard for Inv1).
\*
\* Identical to undo-history.tla EXCEPT the storage-failure branch (`ForwardFail`)
\* leaves PHANTOM state: it updates `derived` even though Event Log's append was
\* rejected (no event landed, len unchanged). This is exactly the hazard the
\* spec's storage-failure wiring defends against — undo-history.md §Action wiring:
\* "If the append returns rejected(storage-failure), return storage-failure without
\* updating the derived state — the action did not happen."
\*
\* It violates Invariant 1 (log faithfulness): a step changed the exposed state
\* (didChange) with no append (~didAppend). As the spec's Refinement-round-1 finding
\* records, the same hazard also violates Invariant 2 (the un-appended change makes
\* `derived` diverge from the log-replay) — the two are linked by design. Either
\* violation rejects the twin.
\*
\* Expected result: VIOLATION (Inv1, and Inv2). If the checker reports all invariants
\* hold here, Inv1 is vacuous — committing state without a durable append would be
\* safe, which is exactly what log faithfulness denies.

EXTENDS Naturals, FiniteSets

CONSTANTS MaxEvents, Ids

Status == {"absent", "pending", "done"}
FType  == {"add", "complete", "delete"}

VARIABLES ltype, lid, undone, len, phase, derived, didAppend, didChange
vars == <<ltype, lid, undone, len, phase, derived, didAppend, didChange>>

IsLastFwd(lt, li, n, und, x, i) ==
    /\ i \in 1..n
    /\ lt[i] \in FType
    /\ li[i] = x
    /\ ~und[i]
    /\ \A j \in 1..n : (j > i /\ lt[j] \in FType /\ li[j] = x) => und[j]

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

\* BUG: the storage-failure branch commits a derived-state change with no append.
\* The correct branch (undo-history.tla) changes nothing on failure.
ForwardFail ==
    /\ phase = "adding"
    /\ len < MaxEvents
    /\ \E x \in Ids :
        /\ derived[x] = "absent"
        /\ derived' = [derived EXCEPT ![x] = "pending"]
    /\ didAppend' = FALSE
    /\ didChange' = TRUE
    /\ UNCHANGED <<ltype, lid, undone, len, phase>>

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

Inv1_LogFaithfulness == didChange => didAppend

Inv2_StateEquivalence ==
    \A x \in Ids : derived[x] = StatusOf(ltype, lid, len, undone, x)

Inv3_TopSuffix ==
    \A i, j \in 1..len : (i < j /\ undone[i]) => undone[j]

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
