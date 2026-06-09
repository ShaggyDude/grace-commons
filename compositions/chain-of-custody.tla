---- MODULE chain-of-custody ----
\* Grace Commons — Chain of Custody (C12) composition.
\* Spec-level formal sibling of compositions/chain-of-custody.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 4 (binding
\* bijection / no dangling partial): every custody action writes a Provenance
\* entry, an Audit Trail record_action event, and the entry_to_event binding,
\* "committed atomically or compensated." No reachable state has a Provenance
\* custody entry without its attributed audit event and binding, and no audit
\* custody event exists without its Provenance entry.
\*
\* Per custody entry, three sub-writes:
\*   provState  : absent | present   (Provenance custody entry)
\*   auditState : absent | present   (Audit Trail record_action event)
\*   bound      : FALSE  | TRUE       (entry_to_event[entry] populated)
\*
\* This CORRECT model performs the three sub-writes as a single atomic action
\* (the single-transaction form of Invariant 4). The buggy twin performs them as
\* separate, interleavable sub-steps with no compensation — the naive
\* implementation the spec's *Cross-store consistency under partial failure* edge
\* case warns against — and TLC finds the dangling partial (a Provenance entry
\* with no audit event / no binding) that violates Invariant 4.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - per-action orchestration, rejection guards, the acting-custodian rule.
\* - verify_custody outcome plumbing (Invariant 5) — a query-shape property.
\* - constituent invariants (Invariant 6) — each checked in its own model
\*   (provenance.als, audit-trail.tla, ...), not re-proven here.

CONSTANT Entries                \* finite set of custody entry creations

VARIABLES provState, auditState, bound
vars == <<provState, auditState, bound>>

TypeOK ==
    /\ provState  \in [Entries -> {"absent", "present"}]
    /\ auditState \in [Entries -> {"absent", "present"}]
    /\ bound      \in [Entries -> BOOLEAN]

\* Every entry begins uncreated: no Provenance entry, no audit event, no binding.
Init ==
    /\ provState  = [e \in Entries |-> "absent"]
    /\ auditState = [e \in Entries |-> "absent"]
    /\ bound      = [e \in Entries |-> FALSE]

\* CORRECT custody commit: the Provenance write, the Audit Trail record_action,
\* and the entry_to_event binding all land together in one atomic step.
CommitCustody(e) ==
    /\ provState[e] = "absent"
    /\ provState'  = [provState  EXCEPT ![e] = "present"]
    /\ auditState' = [auditState EXCEPT ![e] = "present"]
    /\ bound'      = [bound      EXCEPT ![e] = TRUE]

Next == \E e \in Entries : CommitCustody(e)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv4_BindingBijection Inv4_NoDanglingProv Inv4_NoOrphanAudit
\* --- composition-level safety invariants ---

\* The two coherent configurations of the three sub-writes for an entry.
Coherent(e) ==
    \/ (provState[e] = "absent"  /\ auditState[e] = "absent"  /\ bound[e] = FALSE)
    \/ (provState[e] = "present" /\ auditState[e] = "present" /\ bound[e] = TRUE)

\* Invariant 4 — binding bijection / no dangling partial.
Inv4_BindingBijection == \A e \in Entries : Coherent(e)

\* No Provenance custody entry without its attributed audit event and binding.
Inv4_NoDanglingProv ==
    \A e \in Entries : (provState[e] = "present") => (auditState[e] = "present" /\ bound[e])

\* No custody audit event without its Provenance entry.
Inv4_NoOrphanAudit ==
    \A e \in Entries : (auditState[e] = "present") => (provState[e] = "present")

Safety == TypeOK /\ Inv4_BindingBijection /\ Inv4_NoDanglingProv /\ Inv4_NoOrphanAudit

====
