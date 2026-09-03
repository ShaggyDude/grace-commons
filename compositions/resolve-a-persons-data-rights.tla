---- MODULE resolve-a-persons-data-rights ----
\* Grace Commons — Resolve a Person's Data Rights.
\* Spec-level formal sibling of compositions/resolve-a-persons-data-rights.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* Resolve a Person's Data Rights' two load-bearing emergent guarantees, for the
\* fulfillment of one request over an in-scope record universe Records:
\*   Invariant 1 — request <-> accountable-complete-fulfillment binding, stated as
\*     safety plus liveness rather than as one atomic commit. Restated 2026-08-27
\*     (methodology debt #19, atomicity class): the audit event is appended
\*     through the Defensible Retention substrate, which declares an appended
\*     event cannot be withdrawn and offers no synchronous rollback, so NO
\*     transaction spans the response-disclosure and the event. The earlier model
\*     asserted one — CommitFulfillment set every sub-write in a single action —
\*     which idealized away the one partial the deployment actually reaches. This
\*     model reaches it instead.
\*   Invariant 2 — no-silent-omission: a committed fulfillment carries exactly one
\*     disposition for EVERY in-scope record — a totality/coverage property
\*     Immutable Transaction Ledger's binding-only model did not need.
\*
\* THE SHAPE (ported from chain-of-custody.tla, the corpus exemplar for this class)
\*   CommitClean    — response-disclosure and event both land; the ordinary path.
\*   CommitOrphaned — the disclosure lands, the event does not. Reachable AND
\*                    surfaced in the same outcome, per Invariant 1 and the
\*                    Cross-store consistency under partial failure edge case.
\*   RetryAudit     — the compensation: the audit write retried until it lands,
\*                    marking the event "recovered" so an auditor can tell a
\*                    compensated fulfillment from a clean one.
\* The write ORDER is what makes the split favourable and is modeled directly: the
\* event is written last, so the reverse orphan (an event with no disclosure) is
\* not reachable by any action. Inv1_NoOrphanEvent is therefore unconditional.
\*
\* WHAT "SAFETY PLUS LIVENESS" MEANS HERE, STATED AT ITS TRUE STRENGTH
\* The harness checks safety invariants only. The liveness arm is canonical in the
\* English (Invariant 1's third bullet): every orphan is compensated within the
\* deployment's declared compensation_window — Orphan ~> Coherent under weak
\* fairness on RetryAudit. What this model carries mechanically is the arm's
\* ENABLEDNESS half: RetryAudit's enabling condition is exactly the Orphan
\* configuration, so no orphan state is a dead end. That is a real guarantee and
\* it is not the whole obligation; the bound itself is a configuration value
\* (compensation_window) and an acceptance check (Generation acceptance check 7),
\* not a model property. Claiming the model verifies liveness would be the same
\* overstatement the restatement was written to remove.
\*
\* Per fulfillment, the sub-writes:
\*   disp[r]    : "none" | "set"                     per-record disposition (coverage)
\*   sdState    : "absent" | "present"               Selective Disclosure response-disclosure
\*   auditState : "absent" | "clean" | "recovered"   dsar.*_fulfilled event
\*   surfaced   : BOOLEAN                            orphan surfaced as a compliance finding
\*
\* The derived index request_to_fulfillment is deliberately NOT a variable. It is
\* a rebuildable mirror of the sealed event, populated after the writes it
\* mirrors; modeling it would reintroduce the very idealization this restatement
\* removed, because an action that set the mirror and the event together would
\* assert an atomicity the substrate does not grant. The obligation that the
\* mirror is derivable rather than independent is stated in the English
\* (composition state; Generation acceptance check 1), which is where it belongs —
\* the exemplar omits its own binding map for the same reason.
\*
\* NOT MODELED (out of scope for the load-bearing properties)
\* - per-action orchestration, rejection guards, the enumeration surface itself.
\* - AUTHENTICATION PRECEDENCE (Invariant 8). The intent record that opens the
\*   committing half of both fulfillment actions is not a variable here, so this
\*   model asserts nothing about it — chain-of-custody.tla carries the analogous
\*   claim as Inv7_AuthPrecedence and this model is a candidate to follow it.
\*   Until it does, Invariant 8 rests on the English wiring and on Generation
\*   acceptance check 6, and this model must not be cited as evidence for it.
\* - the irreversible per-record purge_record calls (Defensible Retention's
\*   contract, modeled in defensible-retention.tla) and the inherited purge orphan
\*   the spec's modulo-clause names — a DIFFERENT boundary from the one above, and
\*   conflating the two is how the overstatement survived as long as it did.
\* - disposition *vocabulary* (included/withheld vs erased/retained) — the coverage
\*   property is vocabulary-agnostic, so "set" abstracts any one recorded verdict.
\* - constituent invariants — each checked in its own model.

CONSTANT Records            \* finite in-scope record universe for one request

VARIABLES disp, sdState, auditState, surfaced
vars == <<disp, sdState, auditState, surfaced>>

TypeOK ==
    /\ disp       \in [Records -> {"none", "set"}]
    /\ sdState    \in {"absent", "present"}
    /\ auditState \in {"absent", "clean", "recovered"}
    /\ surfaced   \in BOOLEAN

\* The fulfillment begins uncreated: no dispositions, no disclosure, no event,
\* nothing surfaced.
Init ==
    /\ disp       = [r \in Records |-> "none"]
    /\ sdState    = "absent"
    /\ auditState = "absent"
    /\ surfaced   = FALSE

\* CLEAN commit: every in-scope record disposed, the response-disclosure written,
\* the dsar.*_fulfilled event landed last.
CommitClean ==
    /\ sdState = "absent"
    /\ disp'       = [r \in Records |-> "set"]
    /\ sdState'    = "present"
    /\ auditState' = "clean"
    /\ UNCHANGED surfaced

\* ORPHANED commit: the dispositions and the response-disclosure land, the audit
\* write does not. The orphan is surfaced in the same outcome that returns
\* rejected(recording-failure). This is the state the previous model could not
\* represent, and the deployment reaches it.
CommitOrphaned ==
    /\ sdState = "absent"
    /\ disp'       = [r \in Records |-> "set"]
    /\ sdState'    = "present"
    /\ auditState' = "absent"
    /\ surfaced'   = TRUE

\* COMPENSATION: the audit write retried until it lands. The compensating event
\* carries cascade_recovery = true, so the recovered fulfillment stays
\* distinguishable from one that bound cleanly. Enabled in exactly the Orphan
\* configuration — no orphan state is a dead end, which is the enabledness half
\* of the liveness arm. The enabling condition auditState = "absent" is also the
\* spec's check-then-retry rule made structural: once the event has landed this
\* action is disabled, so a retry after a lost acknowledgment cannot double-append.
RetryAudit ==
    /\ sdState    = "present"
    /\ auditState = "absent"
    /\ auditState' = "recovered"
    /\ UNCHANGED <<disp, sdState, surfaced>>

Next == CommitClean \/ CommitOrphaned \/ RetryAudit
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv1_BindingBijection Inv1_NoUnsurfacedOrphan Inv1_NoOrphanEvent Inv1_RecoveryDistinguishable Inv2_NoSilentOmission

\* --- composition-level safety invariants ---

\* The coherent configurations: uncreated, or fully bound (clean or recovered).
Coherent ==
    \/ (sdState = "absent"  /\ auditState = "absent" /\ ~surfaced)
    \/ (sdState = "present" /\ auditState \in {"clean", "recovered"})

\* The one reachable partial: the disclosure landed, the event did not.
Orphan == sdState = "present" /\ auditState = "absent"

\* Invariant 1 (safety half) — every reachable state is coherent, or is a
\* SURFACED orphan under compensation. There is no silent dangling partial.
\* This is the UMBRELLA, and saying so matters for reading the twins: it is
\* exactly the conjunction of Inv1_NoOrphanEvent and Inv1_NoUnsurfacedOrphan
\* over this state space, not an independent claim. A twin that reaches an
\* unsurfaced orphan therefore breaks two of the listed facets at once, and that
\* is not a defect in the twin. The isolation that carries weight is BETWEEN the
\* twins: one breaks the orphan-silence facet and leaves coverage intact, the
\* other breaks coverage and leaves the binding sub-writes coherent.
Inv1_BindingBijection == Coherent \/ (Orphan /\ surfaced)

\* No unsurfaced orphan: a response-disclosure lacking its fulfillment event is
\* always a compliance finding someone is looking at.
Inv1_NoUnsurfacedOrphan == Orphan => surfaced

\* No dsar.*_fulfilled event without its response-disclosure. Unconditional, and
\* it is the WRITE ORDER that earns it: the event is last, so it cannot exist
\* without what precedes it. This is the direction the regulator's question runs.
\* The English states this guarantee together with the complete disposition set;
\* the model factors that conjunct into Inv2_NoSilentOmission instead, so that
\* each buggy twin breaks exactly one CFG-LISTED invariant. Together the two
\* carry the English claim.
Inv1_NoOrphanEvent ==
    (auditState \in {"clean", "recovered"}) => (sdState = "present")

\* A clean binding never went through compensation; a recovered one always did.
Inv1_RecoveryDistinguishable ==
    /\ (auditState = "clean")     => ~surfaced
    /\ (auditState = "recovered") => surfaced

\* Invariant 2 — no-silent-omission: a fulfillment whose sealed event exists
\* carries a disposition for EVERY in-scope record. Keyed on the EVENT rather
\* than on a derived-index flag, because the sealed event is the authoritative
\* carrier of the disposition set and the index is its mirror; keying on the
\* mirror would make the coverage claim depend on a write this model no longer
\* represents.
Inv2_NoSilentOmission ==
    (auditState \in {"clean", "recovered"}) => (\A r \in Records : disp[r] = "set")

Safety ==
    /\ TypeOK
    /\ Inv1_BindingBijection
    /\ Inv1_NoUnsurfacedOrphan
    /\ Inv1_NoOrphanEvent
    /\ Inv1_RecoveryDistinguishable
    /\ Inv2_NoSilentOmission

====
