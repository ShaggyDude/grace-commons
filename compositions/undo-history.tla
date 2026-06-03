---- MODULE undo-history ----
\* Grace Commons — Undo History composition.
\* Spec-level formal sibling of compositions/undo-history.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is Invariant 3 (undo targets the most recent forward
\* event not already undone), which underpins Invariant 2 (visible state = replay
\* of non-undone events). The model checks that correct undo always removes the
\* most-recently-added non-undone event, so a sequence of undos peels events off
\* in reverse order — the undone set is always a top-suffix of the forward log.
\*
\* MODELING CHOICES
\* - `N` forward events, indices 1..added as they are added; `undone[i]` marks
\*   event i as undone. `topNonUndone` is the most-recent non-undone index.
\* - SCOPE: forward-then-undo (no forward action after an undo). Forward-after-undo
\*   is Invariant 7's redo-unreachability concern, deliberately out of scope here;
\*   within this scope, correct most-recent targeting is exactly the property that
\*   keeps the undone set a top-suffix, which is the falsifiable check.
\*
\* NOT MODELED (out of scope): Personal Todo / Event Log constituent invariants
\* (Invariants 4-5; see event-log.tla), identity preservation across delete/undo
\* (Invariant 6 — a replay-content property), redo (Invariant 7).

EXTENDS Naturals

CONSTANT N                  \* number of forward events

VARIABLES added, undone, phase
vars == <<added, undone, phase>>

NonUndoneIdx == {i \in 1..added : ~undone[i]}
topNonUndone ==
    IF NonUndoneIdx = {} THEN 0
    ELSE CHOOSE i \in NonUndoneIdx : \A j \in NonUndoneIdx : j <= i

TypeOK ==
    /\ added \in 0..N
    /\ undone \in [1..N -> BOOLEAN]
    /\ phase \in {"adding", "undoing"}

Init ==
    /\ added = 0
    /\ undone = [i \in 1..N |-> FALSE]
    /\ phase = "adding"

\* forward action: reveal the next event (non-undone). Only before any undo.
AddEvent ==
    /\ phase = "adding"
    /\ added < N
    /\ added' = added + 1
    /\ UNCHANGED <<undone, phase>>

\* CORRECT undo: target the most recent non-undone forward event.
Undo ==
    /\ added > 0
    /\ topNonUndone > 0
    /\ undone' = [undone EXCEPT ![topNonUndone] = TRUE]
    /\ phase' = "undoing"
    /\ UNCHANGED added

Next == AddEvent \/ Undo
Spec == Init /\ [][Next]_vars

\* Load-bearing — most-recent targeting keeps the undone set a top-suffix: if a
\* lower-index event is undone, every higher-index forward event is undone too.
Inv_MostRecentTargeting ==
    \A i, j \in 1..added : (i < j /\ undone[i]) => undone[j]
Safety == TypeOK /\ Inv_MostRecentTargeting

====
