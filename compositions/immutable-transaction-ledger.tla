---- MODULE immutable-transaction-ledger ----
\* Grace Commons — Immutable Transaction Ledger with Selective Disclosure (C6).
\* Spec-level formal sibling of compositions/immutable-transaction-ledger.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 1 (disclosure-
\* accountability binding bijection / no dangling partial): every disclose_subset
\* writes a Selective Disclosure record, an Audit Trail `ledger.disclosed`
\* record_action event, and the disclosure_to_event binding, "committed atomically
\* or compensated." No reachable state has a Selective Disclosure disclosure record
\* without its attributed `ledger.disclosed` event and binding, and no
\* `ledger.disclosed` event exists without its Selective Disclosure record.
\*
\* Per disclosure d, three sub-writes:
\*   sdState    : absent | present   (Selective Disclosure disclosure record)
\*   auditState : absent | present   (Audit Trail `ledger.disclosed` event)
\*   bound      : FALSE  | TRUE       (disclosure_to_event[d] populated)
\*
\* This CORRECT model performs the three sub-writes as a single atomic action
\* (the single-transaction form of Invariant 1). The buggy twin performs them as
\* separate, interleavable sub-steps with no compensation — the naive
\* implementation the spec's *Cross-store consistency under partial failure* edge
\* case warns against (Selective Disclosure writes first, so the orphan is a
\* disclosure record with no binding and no ledger event) — and TLC finds the
\* dangling partial that violates Invariant 1.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - per-action orchestration, rejection guards, the disclosed-subset membership
\*   test, the record_entry single-store write.
\* - verify_disclosure / verify_ledger outcome plumbing (Invariants 2, 4) —
\*   query-shape properties.
\* - constituent invariants (Invariant 5) — each checked in its own model
\*   (selective-disclosure is English-only; audit-trail.tla, ...), not re-proven here.

CONSTANT Disclosures            \* finite set of disclose_subset events

VARIABLES sdState, auditState, bound
vars == <<sdState, auditState, bound>>

TypeOK ==
    /\ sdState    \in [Disclosures -> {"absent", "present"}]
    /\ auditState \in [Disclosures -> {"absent", "present"}]
    /\ bound      \in [Disclosures -> BOOLEAN]

\* Every disclosure begins uncommitted: no SD record, no audit event, no binding.
Init ==
    /\ sdState    = [d \in Disclosures |-> "absent"]
    /\ auditState = [d \in Disclosures |-> "absent"]
    /\ bound      = [d \in Disclosures |-> FALSE]

\* CORRECT disclosure commit: the Selective Disclosure record, the Audit Trail
\* `ledger.disclosed` record_action, and the disclosure_to_event binding all land
\* together in one atomic step.
CommitDisclosure(d) ==
    /\ sdState[d] = "absent"
    /\ sdState'    = [sdState    EXCEPT ![d] = "present"]
    /\ auditState' = [auditState EXCEPT ![d] = "present"]
    /\ bound'      = [bound      EXCEPT ![d] = TRUE]

Next == \E d \in Disclosures : CommitDisclosure(d)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv1_BindingBijection Inv1_NoDanglingDisclosure Inv1_NoOrphanAudit
\* --- composition-level safety invariants ---

\* The two coherent configurations of the three sub-writes for a disclosure.
Coherent(d) ==
    \/ (sdState[d] = "absent"  /\ auditState[d] = "absent"  /\ bound[d] = FALSE)
    \/ (sdState[d] = "present" /\ auditState[d] = "present" /\ bound[d] = TRUE)

\* Invariant 1 — disclosure-accountability binding bijection / no dangling partial.
Inv1_BindingBijection == \A d \in Disclosures : Coherent(d)

\* No Selective Disclosure disclosure record without its attributed
\* `ledger.disclosed` event and binding.
Inv1_NoDanglingDisclosure ==
    \A d \in Disclosures : (sdState[d] = "present") => (auditState[d] = "present" /\ bound[d])

\* No `ledger.disclosed` audit event without its Selective Disclosure record.
Inv1_NoOrphanAudit ==
    \A d \in Disclosures : (auditState[d] = "present") => (sdState[d] = "present")

Safety == TypeOK /\ Inv1_BindingBijection /\ Inv1_NoDanglingDisclosure /\ Inv1_NoOrphanAudit

====
