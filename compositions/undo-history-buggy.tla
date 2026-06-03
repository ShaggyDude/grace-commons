---- MODULE undo-history-buggy ----
\* Grace Commons — Undo History composition: BUGGY TWIN (vacuity guard).
\*
\* Identical to undo-history.tla EXCEPT `Undo` targets the OLDEST non-undone
\* forward event instead of the most recent — violating Invariant 3 (undo targets
\* the most recent forward event not already undone).
\*
\* Expected result: Inv_MostRecentTargeting VIOLATED. AddEvent, AddEvent (added =
\* 2), UndoBuggy -> targets event 1 (oldest), so undone[1] = TRUE while
\* undone[2] = FALSE: a lower-index event undone with a higher-index event still
\* present. If the checker reports all invariants hold here, the harness is
\* vacuous: undoing the oldest-first would be safe, which is what Invariant 3
\* denies.

EXTENDS Naturals

CONSTANT N

VARIABLES added, undone, phase
vars == <<added, undone, phase>>

NonUndoneIdx == {i \in 1..added : ~undone[i]}
\* BUG: bottom (oldest) non-undone instead of top (most recent).
bottomNonUndone ==
    IF NonUndoneIdx = {} THEN 0
    ELSE CHOOSE i \in NonUndoneIdx : \A j \in NonUndoneIdx : i <= j

TypeOK ==
    /\ added \in 0..N
    /\ undone \in [1..N -> BOOLEAN]
    /\ phase \in {"adding", "undoing"}

Init ==
    /\ added = 0
    /\ undone = [i \in 1..N |-> FALSE]
    /\ phase = "adding"

AddEvent ==
    /\ phase = "adding"
    /\ added < N
    /\ added' = added + 1
    /\ UNCHANGED <<undone, phase>>

\* BUG: target the oldest non-undone forward event.
Undo ==
    /\ added > 0
    /\ bottomNonUndone > 0
    /\ undone' = [undone EXCEPT ![bottomNonUndone] = TRUE]
    /\ phase' = "undoing"
    /\ UNCHANGED added

Next == AddEvent \/ Undo
Spec == Init /\ [][Next]_vars

Inv_MostRecentTargeting ==
    \A i, j \in 1..added : (i < j /\ undone[i]) => undone[j]
Safety == TypeOK /\ Inv_MostRecentTargeting

====
