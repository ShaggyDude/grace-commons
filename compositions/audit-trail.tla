---- MODULE audit-trail ----
\* Grace Commons — Audit Trail composition.
\* Spec-level formal sibling of compositions/audit-trail.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 4 (cascade-on-
\* purge): when an event's retention elapses, the cascade purges the event, its
\* attestation, and marks its seal coverage records-purged ACROSS FOUR STORES,
\* "either in a single transaction or via a compensating record." Invariant 8
\* (honest representation of destruction) holds that an event's content is gone
\* only when a retention record proves the destruction was lawful — "missing
\* without record" never occurs. Invariant 1 (attribution coverage) holds that
\* a retained event always has a live attestation.
\*
\* The four constituent stores, per event:
\*   evState  : present | purged       (Event Log content)
\*   attState : live    | purged       (Actor Identity attestation)
\*   sealCov  : covered | recpurged    (Tamper Evidence seal coverage entry)
\*   retState : Retained | Purged      (Retention Window record)
\*
\* This CORRECT model performs the cascade as a single atomic action (the
\* single-transaction form of Invariant 4). The buggy twin performs it as
\* separate, interleavable sub-steps with no compensation — the naive
\* implementation the spec's *Cross-store consistency under failure* edge case
\* warns against — and TLC finds the dangling partial state that violates
\* Invariant 4.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - record_action / seal_now orchestration and their rejection guards.
\* - verify_record outcome plumbing (Invariants 6, 7) — query-shape properties.
\* - The constituent atoms' internal invariants (Invariant 5) — checked in each
\*   atom's own model (e.g. event-log.tla), not re-proven here.

CONSTANT Events                 \* finite set of event ids already recorded

VARIABLES evState, attState, sealCov, retState, eligible
vars == <<evState, attState, sealCov, retState, eligible>>

TypeOK ==
    /\ evState  \in [Events -> {"present", "purged"}]
    /\ attState \in [Events -> {"live", "purged"}]
    /\ sealCov  \in [Events -> {"covered", "recpurged"}]
    /\ retState \in [Events -> {"Retained", "Purged"}]
    /\ eligible \in [Events -> BOOLEAN]

\* Every event begins recorded and coherent-Retained: content present, live
\* attestation, covered by a seal, retention Retained, not yet purge-eligible.
Init ==
    /\ evState  = [e \in Events |-> "present"]
    /\ attState = [e \in Events |-> "live"]
    /\ sealCov  = [e \in Events |-> "covered"]
    /\ retState = [e \in Events |-> "Retained"]
    /\ eligible = [e \in Events |-> FALSE]

\* Retention elapses (clock advances past retention_until): event becomes
\* purge-eligible. Models Retention Window's no-early-purge gate.
MarkEligible(e) ==
    /\ retState[e] = "Retained"
    /\ ~eligible[e]
    /\ eligible' = [eligible EXCEPT ![e] = TRUE]
    /\ UNCHANGED <<evState, attState, sealCov, retState>>

\* CORRECT cascade: all four stores move together in one atomic step.
PurgeAtomic(e) ==
    /\ retState[e] = "Retained"
    /\ eligible[e]
    /\ retState' = [retState EXCEPT ![e] = "Purged"]
    /\ evState'  = [evState  EXCEPT ![e] = "purged"]
    /\ attState' = [attState EXCEPT ![e] = "purged"]
    /\ sealCov'  = [sealCov  EXCEPT ![e] = "recpurged"]
    /\ UNCHANGED eligible

Next == \E e \in Events : MarkEligible(e) \/ PurgeAtomic(e)
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariants ---

\* The two coherent configurations of the four stores for an event.
Coherent(e) ==
    \/ (retState[e] = "Retained" /\ evState[e] = "present"
            /\ attState[e] = "live"   /\ sealCov[e] = "covered")
    \/ (retState[e] = "Purged"   /\ evState[e] = "purged"
            /\ attState[e] = "purged" /\ sealCov[e] = "recpurged")

\* Invariant 4 — cascade-on-purge: no dangling state across the four stores.
Inv4_Cascade == \A e \in Events : Coherent(e)

\* Invariant 8 — honest representation of destruction: content is gone only
\* when a retention record proves lawful destruction (no "missing w/o record").
Inv8_HonestDestruction ==
    \A e \in Events : (evState[e] = "purged") => (retState[e] = "Purged")

\* Invariant 1 — attribution coverage: a retained event has a live attestation.
Inv1_AttributionCoverage ==
    \A e \in Events : (retState[e] = "Retained") => (attState[e] = "live")

Safety == TypeOK /\ Inv4_Cascade /\ Inv8_HonestDestruction /\ Inv1_AttributionCoverage

====
