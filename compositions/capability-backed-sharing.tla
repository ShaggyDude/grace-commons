---- MODULE capability-backed-sharing ----
\* Grace Commons — Capability-Backed Sharing (C15).
\* Capability + Selective Disclosure + Audit Trail (substrate).
\* Spec-level formal sibling of compositions/capability-backed-sharing.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's formal-model subject is Invariant 2 (disclosure-accountability
\* binding bijection / no dangling partial): every redeem_and_disclose that
\* discloses writes a Selective Disclosure record, a `sharing.disclosed` Audit Trail
\* record_action event, and the disclosure_to_redemption binding, "committed
\* atomically or compensated." No reachable state has a Selective Disclosure record
\* without its attributed `sharing.disclosed` event and binding, and no
\* `sharing.disclosed` event exists without its Selective Disclosure record. The
\* redemption-decrement that precedes the binding is part of the same host
\* transaction and rolls back with it (a recoverable store write, unlike C7's
\* irreversible purge), so the binding is atomic in the conforming case — this
\* model mirrors C6's binding-bijection model directly.
\*
\* Per disclosure d, three sub-writes:
\*   sdState    : absent | present   (Selective Disclosure disclosure record)
\*   auditState : absent | present   (Audit Trail `sharing.disclosed` event)
\*   bound      : FALSE  | TRUE       (disclosure_to_redemption[d] populated;
\*                                     also represents the committed redemption)
\*
\* This CORRECT model performs the three sub-writes as a single atomic action
\* (the single-transaction form of Invariant 2). The buggy twin performs them as
\* separate, interleavable sub-steps with no compensation — the naive
\* implementation the *Cross-store consistency under partial failure* edge case
\* warns against (Selective Disclosure writes first, so the orphan is a disclosure
\* record with no binding and no sharing.disclosed event) — and TLC finds the
\* dangling partial that violates Invariant 2.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - the audit-subject asymmetry (Invariant 1) — a structural / by-construction
\*   property (no redeemer field anywhere in the spec graph), Capability-model-
\*   verified (capability.als checks Capability Invariants 3 and 5); not a
\*   TLA+-class temporal claim.
\* - allocation-authorization binding (Invariant 3) and scope-bounded disclosure
\*   (Invariant 4) — single-write-path / records-shape properties.
\* - constituent invariants (Invariant 5) — each checked in its own model
\*   (capability.als; selective-disclosure is English-only; audit-trail.tla),
\*   not re-proven here.

CONSTANT Disclosures            \* finite set of redeem_and_disclose events

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
\* `sharing.disclosed` record_action, and the disclosure_to_redemption binding
\* (with the redemption-decrement) all land together in one atomic step.
CommitDisclosure(d) ==
    /\ sdState[d] = "absent"
    /\ sdState'    = [sdState    EXCEPT ![d] = "present"]
    /\ auditState' = [auditState EXCEPT ![d] = "present"]
    /\ bound'      = [bound      EXCEPT ![d] = TRUE]

Next == \E d \in Disclosures : CommitDisclosure(d)
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariants (Invariant 2) ---

\* The two coherent configurations of the three sub-writes for a disclosure.
Coherent(d) ==
    \/ (sdState[d] = "absent"  /\ auditState[d] = "absent"  /\ bound[d] = FALSE)
    \/ (sdState[d] = "present" /\ auditState[d] = "present" /\ bound[d] = TRUE)

\* Invariant 2 — disclosure-accountability binding bijection / no dangling partial.
Inv2_BindingBijection == \A d \in Disclosures : Coherent(d)

\* No Selective Disclosure record without its attributed `sharing.disclosed`
\* event and binding.
Inv2_NoDanglingDisclosure ==
    \A d \in Disclosures : (sdState[d] = "present") => (auditState[d] = "present" /\ bound[d])

\* No `sharing.disclosed` audit event without its Selective Disclosure record.
Inv2_NoOrphanAudit ==
    \A d \in Disclosures : (auditState[d] = "present") => (sdState[d] = "present")

Safety == TypeOK /\ Inv2_BindingBijection /\ Inv2_NoDanglingDisclosure /\ Inv2_NoOrphanAudit

====
