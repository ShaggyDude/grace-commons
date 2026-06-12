---- MODULE preference-aware-notification-fanout-buggy ----
\* Grace Commons — Preference-Aware Notification Fanout (C11): BUGGY TWIN.
\*
\* BUG — non-serialized cap evaluation (TOCTOU): the gate's frequency-cap
\* observation and the delivery commit are split into two steps, modeling a
\* deployment that declared `cap_serialization = serialized-per-principal`
\* but implemented the gate as read-count-then-commit without serialization.
\* `GateObserve` checks headroom and records the deliver verdict;
\* `GateCommit` commits the delivery WITHOUT re-checking. Two concurrent
\* fanout invocations can each observe count = Cap - 1 on the last slot,
\* then both commit — the in-window delivery count overshoots the cap.
\* This is exactly the race C11 Invariant 4 names and exactly the twin shape
\* of capacity-constraint-enforcement-buggy-toctou.tla (the adjudicated
\* precedent): observe/commit split, no re-check at commit.
\*
\* Expected result: Safety VIOLATED (Inv4_CapSafety). With Cap = 2,
\* Workers = {w1, w2, w3}: one worker delivers (count 1), then two workers
\* both observe headroom on the last slot and both commit -> delivered = 3 > 2.
\* `delivered` only increments, so Inv_NonNegative still HOLDS — the violation
\* is isolated to the cap bound, proving Inv4_CapSafety is non-vacuous.
\* If the checker reports all invariants hold here, the harness is vacuous.

EXTENDS Naturals, FiniteSets

CONSTANTS Cap, Workers

VARIABLES delivered, status
vars == <<delivered, status>>

TypeOK ==
    /\ delivered \in 0..Cardinality(Workers)
    /\ status \in [Workers -> {"idle", "observed", "delivered", "suppressed"}]

Init ==
    /\ delivered = 0
    /\ status = [w \in Workers |-> "idle"]

\* BUG part 1: observe headroom and render the deliver verdict, but commit
\* nothing — the count read and the commit are now separable.
GateObserve(w) ==
    /\ status[w] = "idle"
    /\ delivered < Cap
    /\ status' = [status EXCEPT ![w] = "observed"]
    /\ UNCHANGED delivered

\* BUG part 2: commit the delivery without re-checking the cap.
GateCommit(w) ==
    /\ status[w] = "observed"
    /\ delivered' = delivered + 1
    /\ status' = [status EXCEPT ![w] = "delivered"]

\* Unchanged suppression branch (fires only on an idle worker that observes
\* the cap already met) — kept so the twin differs from the correct model
\* only in the split observe/commit, never in the suppression rule.
GateSuppress(w) ==
    /\ status[w] = "idle"
    /\ delivered >= Cap
    /\ status' = [status EXCEPT ![w] = "suppressed"]
    /\ UNCHANGED delivered

Next ==
    \E w \in Workers :
        \/ GateObserve(w)
        \/ GateCommit(w)
        \/ GateSuppress(w)
Spec == Init /\ [][Next]_vars

Inv4_CapSafety == delivered <= Cap
Inv_NonNegative == delivered >= 0

Safety == TypeOK /\ Inv4_CapSafety /\ Inv_NonNegative

====
