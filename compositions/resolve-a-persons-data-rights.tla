---- MODULE data-subject-rights-fulfillment ----
\* Grace Commons — Data Subject Rights Fulfillment (C7).
\* Spec-level formal sibling of compositions/data-subject-rights-fulfillment.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* C7's two load-bearing emergent guarantees, for the fulfillment of one request
\* over an in-scope record universe Records:
\*   Invariant 1 — request <-> accountable-complete-fulfillment binding bijection:
\*     the disposition set, the Selective Disclosure response-disclosure, and the
\*     dsar.*_fulfilled Audit Trail event commit together or not at all.
\*   Invariant 2 — no-silent-omission: a committed fulfillment carries exactly one
\*     disposition for EVERY in-scope record — a totality/coverage property C6's
\*     binding-only model did not need.
\*
\* Per fulfillment, the sub-writes:
\*   disp[r]    : "none" | "set"        per-record disposition (coverage dimension)
\*   sdState    : "absent" | "present"  Selective Disclosure response-disclosure
\*   auditState : "absent" | "present"  dsar.*_fulfilled event (seals the set)
\*   bound      : FALSE | TRUE          request_to_fulfillment populated (binding)
\*
\* This CORRECT model performs every sub-write as a single atomic action — the
\* single-transaction form the spec's step-4 "commit atomically" requires. The two
\* buggy twins split it: -buggy reaches a dangling partial (the binding hazard, as
\* in C6); -buggy-coverage commits the binding before every in-scope record is
\* disposed (the novel no-silent-omission hazard). TLC rejects both.
\*
\* NOT MODELED (out of scope for the load-bearing properties)
\* - per-action orchestration, rejection guards, the enumeration surface itself.
\* - the irreversible per-record purge_record calls (C1's contract, modeled in
\*   defensible-retention.tla) and the inherited partial-failure orphan.
\* - disposition *vocabulary* (included/withheld vs erased/retained) — the coverage
\*   property is vocabulary-agnostic, so "set" abstracts any one recorded verdict.
\* - constituent invariants (Invariant 8) — each checked in its own model.

CONSTANT Records            \* finite in-scope record universe for one request

VARIABLES disp, sdState, auditState, bound
vars == <<disp, sdState, auditState, bound>>

TypeOK ==
    /\ disp       \in [Records -> {"none", "set"}]
    /\ sdState    \in {"absent", "present"}
    /\ auditState \in {"absent", "present"}
    /\ bound      \in BOOLEAN

\* The fulfillment begins uncreated: no dispositions, no disclosure, no event, no binding.
Init ==
    /\ disp       = [r \in Records |-> "none"]
    /\ sdState    = "absent"
    /\ auditState = "absent"
    /\ bound      = FALSE

\* CORRECT fulfillment commit: every in-scope record disposed, the Selective
\* Disclosure response-disclosure, the dsar.*_fulfilled event, and the
\* request_to_fulfillment binding all land together in one atomic step.
CommitFulfillment ==
    /\ ~bound
    /\ disp'       = [r \in Records |-> "set"]
    /\ sdState'    = "present"
    /\ auditState' = "present"
    /\ bound'      = TRUE

Next == CommitFulfillment
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv1_BindingBijection Inv2_NoSilentOmission Inv1_NoDanglingFulfillment Inv1_NoOrphanEvent
\* --- composition-level safety invariants ---

\* The two coherent configurations of the binding sub-writes.
Coherent ==
    \/ (sdState = "absent"  /\ auditState = "absent"  /\ bound = FALSE)
    \/ (sdState = "present" /\ auditState = "present" /\ bound = TRUE)

\* Invariant 1 — request <-> accountable-complete-fulfillment binding bijection.
Inv1_BindingBijection == Coherent

\* No Selective Disclosure response-disclosure without its dsar.*_fulfilled event and binding.
Inv1_NoDanglingFulfillment ==
    (sdState = "present") => (auditState = "present" /\ bound)

\* No dsar.*_fulfilled event without its response-disclosure.
Inv1_NoOrphanEvent ==
    (auditState = "present") => (sdState = "present")

\* Invariant 2 — no-silent-omission: a committed (bound) fulfillment carries a
\* disposition for EVERY in-scope record. The totality/coverage check.
Inv2_NoSilentOmission ==
    bound => (\A r \in Records : disp[r] = "set")

Safety ==
    /\ TypeOK
    /\ Inv1_BindingBijection
    /\ Inv1_NoDanglingFulfillment
    /\ Inv1_NoOrphanEvent
    /\ Inv2_NoSilentOmission

====
