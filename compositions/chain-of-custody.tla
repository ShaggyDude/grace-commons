---- MODULE chain-of-custody ----
\* Grace Commons — Chain of Custody (C12) composition.
\* Spec-level formal sibling of compositions/chain-of-custody.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS (revised 2026-06-11 — closes coverage finding MC-C12-1)
\* The composition's load-bearing wiring decision is Invariant 4 (binding
\* bijection / no dangling partial), restated as safety + liveness. The design
\* the spec actually mandates is SEQUENTIAL-WITH-COMPENSATION: the Provenance
\* custody entry writes first (immutable once committed — synchronous rollback
\* is not available), then the Audit Trail `record_action`; a failure between
\* the two leaves an ORPHAN (a custody entry with no audit event) that the
\* implementation must surface immediately as a high-priority compliance
\* finding and compensate by retrying the audit write, marking the compensating
\* event `cascade_recovery = true`.
\*
\* This model covers BOTH arms of Invariant 4 — the atomic-commit arm and the
\* compensated arm the earlier model idealized away (the coverage-matrix GAP
\* closed by finding MC-C12-1; immutable-transaction-ledger.tla, revised for
\* C6-2, is the worked template):
\*   CommitClean(e)  — both truth-bearing writes land together (the
\*                     transactional-boundary form).
\*   FailPartial(e)  — the Provenance write lands, the audit write fails; the
\*                     orphan is reachable AND surfaced in the same outcome
\*                     (the action's declared failure path: rejected(recording-
\*                     failure) plus the dashboard finding). The orphan is a
\*                     real inter-action state other actions can observe.
\*   RetryAudit(e)   — the compensation: the audit write retried until it
\*                     lands, marked cascade_recovery; the bijection is
\*                     restored and the recovered binding stays distinguishable
\*                     from a clean one.
\*
\* Per custody entry e, TWO truth-bearing sub-writes (the entry_to_event map is
\* a derived index per execution-contract.md §Composition state — rebuildable by
\* enumerating Audit Trail events whose `data.entry_id` names the entry; outside
\* the atomicity surface; omitted from the model per that section's obligation 2):
\*   provState  : absent | present                      (Provenance custody entry)
\*   auditState : absent | clean | recovered            (Audit Trail record_action
\*                                                       event; `recovered` carries
\*                                                       the cascade_recovery marker)
\*   surfaced   : BOOLEAN                               (orphan surfaced as a high-
\*                                                       priority compliance finding)
\*
\* SAFETY (checked here): no UNSURFACED orphan — every reachable configuration
\* is uncreated, fully bound, or a surfaced orphan-under-compensation; an audit
\* custody event never exists without its Provenance entry; recovered bindings
\* are distinguishable from clean ones via the cascade_recovery marker.
\* LIVENESS (canonical in the English spec; see Invariant 4's liveness arm):
\* every orphan is eventually bound — Orphan(e) ~> Bound(e) under weak fairness
\* on RetryAudit. The harness checks safety invariants only; the model carries
\* the structural guarantee that discharges the obligation's enabledness half:
\* RetryAudit's enabling condition is exactly the orphan configuration, so no
\* orphan state is a dead end (the buggy twin, which deletes the compensation
\* action and the surfacing, is rejected on safety — sequential-without-
\* compensation is unsafe).
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - per-action orchestration, rejection guards, the acting-custodian rule.
\* - the within-invocation transient between the Provenance write and the audit
\*   attempt (within-action atomicity, not an action-vs-action interleaving;
\*   the model's states are action OUTCOMES — clean commit, surfaced partial
\*   failure).
\* - the crash-orphan (process death between the two truth-bearing writes: an
\*   orphan with no returning outcome). Within-action process death is not an
\*   action-vs-action interleaving; the English discharges it with the mandated
\*   reconciliation scan (restart + fixed cadence), which bounds its silence —
\*   see Invariant 4's safety arm and the partial-failure edge case.
\* - the deterministic-rejection compensation arm (recovery-identity
\*   re-attestation for invalid-credential / invalid-request, per the
\*   partial-failure edge case): an attribution-semantics rule, not an
\*   interleaving; RetryAudit abstracts both compensation attestations into the
\*   one `recovered` outcome.
\* - the entry_to_event derived index (outside the atomicity surface per
\*   execution-contract.md §Composition state; a lost entry is a rebuild
\*   trigger, not data loss).
\* - verify_custody outcome plumbing (Invariant 5) — a query-shape property.
\* - constituent invariants (Invariant 6) — each checked in its own model
\*   (provenance.als, audit-trail.tla, ...), not re-proven here.

CONSTANT Entries                \* finite set of custody entry creations

VARIABLES provState, auditState, surfaced
vars == <<provState, auditState, surfaced>>

TypeOK ==
    /\ provState  \in [Entries -> {"absent", "present"}]
    /\ auditState \in [Entries -> {"absent", "clean", "recovered"}]
    /\ surfaced   \in [Entries -> BOOLEAN]

\* Every entry begins uncreated: no Provenance entry, no audit event, no finding.
Init ==
    /\ provState  = [e \in Entries |-> "absent"]
    /\ auditState = [e \in Entries |-> "absent"]
    /\ surfaced   = [e \in Entries |-> FALSE]

\* Happy path: the Provenance custody entry and the Audit Trail record_action
\* land together (the transactional-boundary form of the atomic-commit arm).
\* The audit event is a CLEAN binding.
CommitClean(e) ==
    /\ provState[e] = "absent"
    /\ provState'  = [provState  EXCEPT ![e] = "present"]
    /\ auditState' = [auditState EXCEPT ![e] = "clean"]
    /\ UNCHANGED surfaced

\* Partial failure: the irreversible Provenance write lands, the audit write
\* fails. The action's declared failure path returns rejected(recording-failure)
\* AND surfaces the orphan to the compliance dashboard in the same outcome —
\* the orphan is reachable, durable until compensated, and never silent.
FailPartial(e) ==
    /\ provState[e] = "absent"
    /\ provState'  = [provState EXCEPT ![e] = "present"]
    /\ surfaced'   = [surfaced  EXCEPT ![e] = TRUE]
    /\ UNCHANGED auditState

\* Compensation: the failed AuditTrail.record_action is retried until it lands;
\* the compensating event carries cascade_recovery = true, so the recovered
\* binding stays distinguishable from a clean one. Enabled in exactly the orphan
\* configuration — no orphan state is a dead end (the liveness arm's
\* enabledness half; eventuality is weak fairness on this action).
\* The enabling condition auditState[e] = "absent" IS the spec's check-then-retry
\* rule made structural: the retrier observes the records (the rebuild read) and
\* appends only when no event names the entry, so a retry after a lost
\* acknowledgment cannot double-append (the state where the audit event already
\* landed disables this action). Per-entry compensation is serialized in the
\* spec; the model's one-action-per-step semantics carries that for free.
RetryAudit(e) ==
    /\ provState[e] = "present"
    /\ auditState[e] = "absent"
    /\ auditState' = [auditState EXCEPT ![e] = "recovered"]
    /\ UNCHANGED <<provState, surfaced>>

Next == \E e \in Entries : CommitClean(e) \/ FailPartial(e) \/ RetryAudit(e)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv4_SafetyBijection Inv4_NoUnsurfacedOrphan Inv4_NoOrphanAudit Inv4_RecoveryDistinguishable
\* --- composition-level safety invariants (Invariant 4, safety arm) ---

\* The orphan configuration: a Provenance custody entry with no audit event —
\* the partial-failure signature, detectable from the records alone (enumerate
\* the Provenance chain against the Audit Trail events through the substrate's
\* read surface).
Orphan(e) == provState[e] = "present" /\ auditState[e] = "absent"

\* The coherent configurations: uncreated, or fully bound (clean or recovered).
Coherent(e) ==
    \/ (provState[e] = "absent"  /\ auditState[e] = "absent" /\ ~surfaced[e])
    \/ (provState[e] = "present" /\ auditState[e] \in {"clean", "recovered"})

\* Invariant 4, safety arm — every reachable configuration is coherent or a
\* SURFACED orphan-under-compensation. There is no silent dangling partial.
Inv4_SafetyBijection == \A e \in Entries : Coherent(e) \/ (Orphan(e) /\ surfaced[e])

\* No unsurfaced orphan: a custody entry lacking its audit event is always a
\* visible high-priority finding, never a quiet inconsistency.
Inv4_NoUnsurfacedOrphan == \A e \in Entries : Orphan(e) => surfaced[e]

\* No custody audit event without its Provenance entry (the inverse orphan —
\* unchanged from the prior model).
Inv4_NoOrphanAudit ==
    \A e \in Entries : (auditState[e] # "absent") => (provState[e] = "present")

\* Recovered bindings are distinguishable: a clean binding never went through
\* compensation (no finding was surfaced); a recovered binding always did.
Inv4_RecoveryDistinguishable ==
    \A e \in Entries :
        /\ (auditState[e] = "clean")     => ~surfaced[e]
        /\ (auditState[e] = "recovered") => surfaced[e]

Safety ==
    /\ TypeOK
    /\ Inv4_SafetyBijection
    /\ Inv4_NoUnsurfacedOrphan
    /\ Inv4_NoOrphanAudit
    /\ Inv4_RecoveryDistinguishable

====
