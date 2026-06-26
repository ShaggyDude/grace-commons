---- MODULE preference-aware-notification-fanout ----
\* Grace Commons — Preference-Aware Notification Fanout composition.
\* Spec-level formal sibling of compositions/preference-aware-notification-fanout.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is Invariant 4 (frequency-cap safety), safety arm,
\* under `cap_serialization = serialized-per-principal`: at every committed
\* delivery disposition, the in-window count the gate observed was strictly
\* below the cap, and — because observation and commit are serialized per
\* principal — the committed delivery total for the principal never exceeds
\* the cap under any interleaving of concurrent fanout invocations evaluating
\* the same principal. This is the same time-of-check-to-time-of-use (TOCTOU)
\* race class as capacity-constraint-enforcement.tla, whose overshoot twin
\* this model's twin mirrors (per the kickoff adjudication).
\*
\* MODELING CHOICES
\* - One principal, one interpreted (window, cap) pair with cap = Cap; the
\*   window is held fixed (no aging) — aging only ever *lowers* the in-window
\*   count, so the fixed-window model is the conservative case for overshoot.
\* - `Workers` concurrent fanout invocations, each rendering at most one
\*   disposition for the principal (Invariant 9: at most one live
\*   notification per subscriber per invocation).
\* - `delivered` is the principal's committed in-window delivery count — the
\*   truth the journal (Event Log) carries; the delivery_count_index is a
\*   derived read of it and is deliberately NOT modeled as separate state
\*   (execution-contract §Composition state: a formal model of the action
\*   models the truth-bearing stores and omits the index).
\* - `GateDeliver(w)`: single atomic observe-and-commit — the
\*   serialized-per-principal capability the deployment declares; no
\*   interleaving can wedge between the cap check and the commit.
\* - `GateSuppress(w)`: the gate's frequency-cap suppression branch — fires
\*   exactly when the observed count meets/exceeds the cap (step 5.iv).
\*   Its presence makes the cap guard non-vacuous: runs reach states where
\*   suppression is the only enabled disposition for remaining workers.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - Quiet windows, channel selection, suspended/no-record paths (pure
\*   per-record predicates with no cross-invocation race surface).
\* - The suspend-vs-fanout interleaving — deliberately excluded with the
\*   named reason in the spec's Lineage (Invariant 2 is stated at
\*   disposition-evaluation time, so the interleaving violates no stated
\*   invariant; there is no property for a model to check).
\* - redispose's per-(fanout_id, principal) serialization — the identical
\*   guard shape at a different key; verifying it would re-prove this model.
\* - Journal append mechanics, journal-rejected, crash gaps (within-action
\*   atomicity obligations, not action-vs-action interleavings).

EXTENDS Naturals, FiniteSets

CONSTANTS Cap,              \* the interpreted frequency cap for the principal
          Workers           \* concurrent fanout invocations evaluating the principal

VARIABLES delivered,        \* committed in-window delivery count (journal truth)
          status            \* Workers -> {"idle","delivered","suppressed"}

vars == <<delivered, status>>

TypeOK ==
    /\ delivered \in 0..Cardinality(Workers)
    /\ status \in [Workers -> {"idle", "delivered", "suppressed"}]

Init ==
    /\ delivered = 0
    /\ status = [w \in Workers |-> "idle"]

\* CORRECT gate, deliver verdict: serialized observe-and-commit in one atomic
\* step — the `serialized-per-principal` capability, modeled. The cap
\* precondition (observed count strictly below cap, Invariant 4 per-commit
\* anchor) and the journal commit cannot be split by any interleaving.
GateDeliver(w) ==
    /\ status[w] = "idle"
    /\ delivered + 1 <= Cap
    /\ delivered' = delivered + 1
    /\ status' = [status EXCEPT ![w] = "delivered"]

\* CORRECT gate, frequency-cap suppression: the step 5.iv branch. Fires when
\* the observed count meets or exceeds the cap; commits no delivery. This is
\* what keeps the model's cap guard honest (non-vacuous): once the cap is
\* reached, suppression is the only enabled disposition.
GateSuppress(w) ==
    /\ status[w] = "idle"
    /\ delivered >= Cap
    /\ status' = [status EXCEPT ![w] = "suppressed"]
    /\ UNCHANGED delivered

Next ==
    \E w \in Workers :
        \/ GateDeliver(w)
        \/ GateSuppress(w)
Spec == Init /\ [][Next]_vars

\* Invariant 4 (safety arm, serialized-per-principal): the principal's
\* committed in-window delivery count never exceeds the interpreted cap.
Inv4_CapSafety == delivered <= Cap

\* Sanity floor: the count is a tally of commits and never goes negative.
Inv_NonNegative == delivered >= 0

Safety == TypeOK /\ Inv4_CapSafety /\ Inv_NonNegative

====
