---- MODULE immutable-transaction-ledger ----
\* Grace Commons — Immutable Transaction Ledger with Selective Disclosure (C6).
\* Spec-level formal sibling of compositions/immutable-transaction-ledger.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS (revised 2026-06-10, Refactor 1 — C6-2/C6-1)
\* The composition's load-bearing wiring decision is Invariant 1 (disclosure-
\* accountability binding bijection), restated as safety + liveness. The design
\* the spec actually mandates is SEQUENTIAL-WITH-COMPENSATION: Selective
\* Disclosure writes first (irreversible once committed), then the Audit Trail
\* `ledger.disclosed` record_action; a failure between the two leaves an ORPHAN
\* (a disclosure record with no ledger event) that the implementation must
\* surface immediately and compensate by retrying the audit write, marking the
\* compensating event `cascade_recovery = true`.
\*
\* This model covers BOTH arms of Invariant 1 — the atomic-commit arm and the
\* compensated arm the earlier model idealized away (the coverage-matrix GAP
\* closed by finding C6-2):
\*   CommitClean(d)  — both truth-bearing writes land together (the
\*                     transactional-boundary form).
\*   FailPartial(d)  — the SD write lands, the audit write fails; the orphan is
\*                     reachable AND surfaced in the same outcome (the action's
\*                     declared failure path: rejected(recording-failure) plus
\*                     the dashboard finding). The orphan is a real inter-action
\*                     state other actions can observe.
\*   RetryAudit(d)   — the compensation: the audit write retried until it lands,
\*                     marked cascade_recovery; the bijection is restored and
\*                     the recovered binding stays distinguishable from a clean
\*                     one.
\*
\* Per disclosure d, TWO truth-bearing sub-writes (the disclosure_to_event map
\* is a derived index per execution-contract.md §Composition state — rebuildable
\* by enumerating `ledger.disclosed` events; outside the atomicity surface;
\* omitted from the model per that section's obligation 2):
\*   sdState    : absent | present                      (Selective Disclosure record)
\*   auditState : absent | clean | recovered            (Audit Trail `ledger.disclosed`
\*                                                       event; `recovered` carries the
\*                                                       cascade_recovery marker)
\*   surfaced   : BOOLEAN                               (orphan surfaced as a high-
\*                                                       priority compliance finding)
\*
\* SAFETY (checked here): no UNSURFACED orphan — every reachable configuration
\* is uncreated, fully bound, or a surfaced orphan-under-compensation; an audit
\* event never exists without its disclosure record; recovered bindings are
\* distinguishable from clean ones via the cascade_recovery marker.
\* LIVENESS (canonical in the English spec; see Invariant 1's liveness arm):
\* every orphan is eventually bound — Orphan(d) ~> Bound(d) under weak fairness
\* on RetryAudit. The harness checks safety invariants only; the model carries
\* the structural guarantee that discharges the obligation's enabledness half:
\* RetryAudit's enabling condition is exactly the orphan configuration, so no
\* orphan state is a dead end (the buggy twin, which deletes the compensation
\* action, is rejected on safety — sequential-without-compensation is unsafe).
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - per-action orchestration, rejection guards, the disclosed-subset membership
\*   test, the record_entry single-store write.
\* - the within-invocation transient between the SD write and the audit attempt
\*   (within-action atomicity, not an action-vs-action interleaving; the model's
\*   states are action OUTCOMES — clean commit, surfaced partial failure).
\* - the crash-orphan (process death between the two truth-bearing writes: an
\*   orphan with no returning outcome). Within-action process death is not an
\*   action-vs-action interleaving; the English discharges it with the mandated
\*   reconciliation scan (restart + fixed cadence), which bounds its silence —
\*   see Invariant 1's safety arm and the partial-failure edge case.
\* - the deterministic-rejection compensation arm (recovery-identity
\*   re-attestation for invalid-credential / invalid-request): an attribution-
\*   semantics rule, not an interleaving; RetryAudit abstracts both compensation
\*   attestations into the one `recovered` outcome.
\* - the disclosure_to_event derived index (outside the atomicity surface per
\*   execution-contract.md §Composition state; a lost entry is a rebuild
\*   trigger, not data loss).
\* - verify_disclosure / verify_ledger outcome plumbing (Invariants 2, 4) —
\*   query-shape properties.
\* - constituent invariants (Invariant 5) — each checked in its own model
\*   (selective-disclosure is English-only; audit-trail.tla, ...), not re-proven here.

CONSTANT Disclosures            \* finite set of disclose_subset events

VARIABLES sdState, auditState, surfaced
vars == <<sdState, auditState, surfaced>>

TypeOK ==
    /\ sdState    \in [Disclosures -> {"absent", "present"}]
    /\ auditState \in [Disclosures -> {"absent", "clean", "recovered"}]
    /\ surfaced   \in [Disclosures -> BOOLEAN]

\* Every disclosure begins uncommitted: no SD record, no audit event, no finding.
Init ==
    /\ sdState    = [d \in Disclosures |-> "absent"]
    /\ auditState = [d \in Disclosures |-> "absent"]
    /\ surfaced   = [d \in Disclosures |-> FALSE]

\* Happy path: the Selective Disclosure record and the Audit Trail
\* `ledger.disclosed` event land together (the transactional-boundary form of
\* the atomic-commit arm). The audit event is a CLEAN binding.
CommitClean(d) ==
    /\ sdState[d] = "absent"
    /\ sdState'    = [sdState    EXCEPT ![d] = "present"]
    /\ auditState' = [auditState EXCEPT ![d] = "clean"]
    /\ UNCHANGED surfaced

\* Partial failure: the irreversible SD write lands, the audit write fails.
\* The action's declared failure path returns rejected(recording-failure) AND
\* surfaces the orphan to the compliance dashboard in the same outcome — the
\* orphan is reachable, durable until compensated, and never silent.
FailPartial(d) ==
    /\ sdState[d] = "absent"
    /\ sdState'   = [sdState  EXCEPT ![d] = "present"]
    /\ surfaced'  = [surfaced EXCEPT ![d] = TRUE]
    /\ UNCHANGED auditState

\* Compensation: the failed AuditTrail.record_action is retried until it lands;
\* the compensating event carries cascade_recovery = true, so the recovered
\* binding stays distinguishable from a clean one. Enabled in exactly the orphan
\* configuration — no orphan state is a dead end (the liveness arm's
\* enabledness half; eventuality is weak fairness on this action).
\* The enabling condition auditState[d] = "absent" IS the spec's check-then-retry
\* rule made structural: the retrier observes the records (the rebuild read) and
\* appends only when no event names the disclosure, so a retry after a lost
\* acknowledgment cannot double-append (the state where the audit event already
\* landed disables this action). Per-disclosure compensation is serialized in
\* the spec; the model's one-action-per-step semantics carries that for free.
RetryAudit(d) ==
    /\ sdState[d] = "present"
    /\ auditState[d] = "absent"
    /\ auditState' = [auditState EXCEPT ![d] = "recovered"]
    /\ UNCHANGED <<sdState, surfaced>>

Next == \E d \in Disclosures : CommitClean(d) \/ FailPartial(d) \/ RetryAudit(d)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv1_SafetyBijection Inv1_NoUnsurfacedOrphan Inv1_NoOrphanAudit Inv1_RecoveryDistinguishable
\* --- composition-level safety invariants (Invariant 1, safety arm) ---

\* The orphan configuration: a disclosure record with no ledger event — the
\* partial-failure signature, detectable from the records alone (enumerate the
\* SD store against the `ledger.disclosed` events).
Orphan(d) == sdState[d] = "present" /\ auditState[d] = "absent"

\* The coherent configurations: uncreated, or fully bound (clean or recovered).
Coherent(d) ==
    \/ (sdState[d] = "absent"  /\ auditState[d] = "absent" /\ ~surfaced[d])
    \/ (sdState[d] = "present" /\ auditState[d] \in {"clean", "recovered"})

\* Invariant 1, safety arm — every reachable configuration is coherent or a
\* SURFACED orphan-under-compensation. There is no silent dangling partial.
Inv1_SafetyBijection == \A d \in Disclosures : Coherent(d) \/ (Orphan(d) /\ surfaced[d])

\* No unsurfaced orphan: a disclosure record lacking its ledger event is always
\* a visible high-priority finding, never a quiet inconsistency.
Inv1_NoUnsurfacedOrphan == \A d \in Disclosures : Orphan(d) => surfaced[d]

\* No `ledger.disclosed` audit event without its Selective Disclosure record
\* (the inverse orphan — unchanged from the prior model).
Inv1_NoOrphanAudit ==
    \A d \in Disclosures : (auditState[d] # "absent") => (sdState[d] = "present")

\* Recovered bindings are distinguishable: a clean binding never went through
\* compensation (no finding was surfaced); a recovered binding always did.
Inv1_RecoveryDistinguishable ==
    \A d \in Disclosures :
        /\ (auditState[d] = "clean")     => ~surfaced[d]
        /\ (auditState[d] = "recovered") => surfaced[d]

Safety ==
    /\ TypeOK
    /\ Inv1_SafetyBijection
    /\ Inv1_NoUnsurfacedOrphan
    /\ Inv1_NoOrphanAudit
    /\ Inv1_RecoveryDistinguishable

====
