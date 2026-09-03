---- MODULE capability-backed-sharing ----
\* Grace Commons — Capability-Backed Sharing.
\* Capability + Selective Disclosure + Audit Trail (substrate).
\* Spec-level formal sibling of compositions/capability-backed-sharing.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* Invariant 2 — disclosure-accountability binding — as it is stated after the
\* 2026-08-27 durability-boundary protocol repair (methodology debt #19, the
\* atomicity class). The previous model asserted that the Selective Disclosure
\* record, the `sharing.disclosed` Audit Trail event and the binding all land in
\* ONE atomic action. That was not a conservative idealization; it was FALSE, and
\* it hid a reachable forbidden state. The Audit Trail append goes through a
\* substrate that declares an appended event cannot be withdrawn and offers no
\* synchronous rollback, so the host transaction never enlisted it — and a
\* transaction that aborted AFTER the append had landed left a sealed
\* `sharing.disclosed` event for a disclosure the canonical state says never
\* happened. The old model could not represent that state, so it could not find it.
\* capability-backed-sharing-buggy-old-wiring.tla is exactly that old wiring, and
\* it is rejected here on Inv2_NoOrphanSeal. That rejection is the mechanical
\* record that the repair was load-bearing rather than editorial.
\*
\* THE SHAPE — three durability boundaries in order, per disclosure d:
\*   WriteIntent     — the [Sharing Disclosure Intended] event. Durable, appended
\*                     before anything commits, never withdrawn. An intent with no
\*                     outcome is expected residue, not a fault.
\*   CommitClean     — the transactional domain mutation (redemption-decrement +
\*                     Selective Disclosure record + `pending` marker) commits, and
\*                     the seal lands. The ordinary path.
\*   CommitUnsealed  — the transaction commits and the seal does NOT land. The
\*                     disclosure is real and its seal is missing; surfaced in the
\*                     same outcome that returns rejected(recording-failure).
\*   RetrySeal       — the compensation: the append retried until it lands, marking
\*                     the event "recovered" (cascade_recovery = true) so an auditor
\*                     tells a compensated disclosure from a clean one.
\*
\* Per disclosure d, the sub-writes:
\*   intentState[d] : "absent" | "present"                [Sharing Disclosure Intended]
\*   txState[d]     : "absent" | "committed"              redemption-decrement +
\*                                                        Selective Disclosure record
\*                                                        + pending marker, one host
\*                                                        transaction
\*   auditState[d]  : "absent" | "clean" | "recovered"    [Sharing Disclosed]
\*   surfaced[d]    : BOOLEAN                             unsealed disclosure raised
\*                                                        as a compliance finding
\*
\* WHAT "SAFETY PLUS LIVENESS" MEANS HERE, STATED AT ITS TRUE STRENGTH
\* The harness checks safety invariants only. The liveness arm is canonical in the
\* English (Invariant 2's fourth bullet): every unsealed disclosure is sealed within
\* the deployment's declared compensation_window. What this model carries
\* mechanically is that arm's ENABLEDNESS half: RetrySeal is enabled in exactly the
\* unsealed configuration, so no unsealed disclosure is a dead end. The bound itself
\* is a configuration value and an acceptance check (Generation acceptance check 7),
\* not a model property, and claiming otherwise would be the same species of
\* overstatement this repair removed.
\*
\* The disclosure_to_redemption index is deliberately NOT a variable. Its `pending`
\* half is exactly txState = "committed" /\ auditState = "absent", which the model
\* already carries, and its sealed half is a rebuildable mirror of the event —
\* giving it its own variable would reintroduce a write whose atomicity with the
\* event is precisely what is not granted.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - the audit-subject asymmetry (Invariant 1) — a structural / by-construction
\*   property (no redeemer field anywhere in the spec graph), Capability-model-
\*   verified (capability.als enforces Capability Invariants 3 and 5 by
\*   construction — no redeemer field, redeem takes no identity); not a
\*   TLA+-class temporal claim.
\* - allocation-authorization binding (Invariant 3). Its safety arm now has the
\*   SAME SHAPE as Invariant 2's — durable intent, transactional allocate, durable
\*   attestation — and it is repaired in the English by the same reasoning, but it
\*   is not verified here and this model must not be cited as evidence for it. It
\*   is the cheaper arm because its reachable partial is inert: an unattested
\*   capability has no capability_to_sharing entry, and [Redeem And Disclose]
\*   refuses a token absent from that index, so it cannot cause a disclosure.
\*   Carrying it as a second dimension is a named candidate for a later pass.
\* - scope-bounded disclosure (Invariant 4) — a records-shape property.
\* - constituent invariants (Invariant 5) — each checked in its own model
\*   (capability.als; selective-disclosure is English-only; audit-trail.tla).

CONSTANT Disclosures            \* finite set of redeem_and_disclose invocations

VARIABLES intentState, txState, auditState, surfaced
vars == <<intentState, txState, auditState, surfaced>>

TypeOK ==
    /\ intentState \in [Disclosures -> {"absent", "present"}]
    /\ txState     \in [Disclosures -> {"absent", "committed"}]
    /\ auditState  \in [Disclosures -> {"absent", "clean", "recovered"}]
    /\ surfaced    \in [Disclosures -> BOOLEAN]

Init ==
    /\ intentState = [d \in Disclosures |-> "absent"]
    /\ txState     = [d \in Disclosures |-> "absent"]
    /\ auditState  = [d \in Disclosures |-> "absent"]
    /\ surfaced    = [d \in Disclosures |-> FALSE]

\* DURABLE INTENT: appended before anything commits, and not withdrawn when the
\* transaction that follows does not commit. Leaving it as its own action is what
\* makes the expected residue — an intent with no outcome — a reachable state the
\* model can be asked about, rather than a claim only the prose makes.
WriteIntent(d) ==
    /\ intentState[d] = "absent"
    /\ intentState' = [intentState EXCEPT ![d] = "present"]
    /\ UNCHANGED <<txState, auditState, surfaced>>

\* CLEAN outcome: the domain transaction commits and the seal lands after it.
\* The intent precondition is the ordering claim made structural.
CommitClean(d) ==
    /\ intentState[d] = "present"
    /\ txState[d] = "absent"
    /\ txState'    = [txState    EXCEPT ![d] = "committed"]
    /\ auditState' = [auditState EXCEPT ![d] = "clean"]
    /\ UNCHANGED <<intentState, surfaced>>

\* UNSEALED outcome: the domain transaction commits, the append does not land.
\* The disclosure is real; its seal is missing. Surfaced in the same outcome that
\* returns rejected(recording-failure), and durable until compensated. This is the
\* state the previous model could not represent, and the deployment reaches it.
CommitUnsealed(d) ==
    /\ intentState[d] = "present"
    /\ txState[d] = "absent"
    /\ txState'   = [txState  EXCEPT ![d] = "committed"]
    /\ surfaced'  = [surfaced EXCEPT ![d] = TRUE]
    /\ UNCHANGED <<intentState, auditState>>

\* COMPENSATION: the append retried until it lands. Enabled in exactly the
\* unsealed configuration — no unsealed disclosure is a dead end, which is the
\* enabledness half of the liveness arm. The auditState[d] = "absent" guard is
\* also the check-then-retry rule made structural: once the seal has landed this
\* action is disabled, so a retry after a lost acknowledgment cannot double-seal.
RetrySeal(d) ==
    /\ txState[d] = "committed"
    /\ auditState[d] = "absent"
    /\ surfaced[d]
    /\ auditState' = [auditState EXCEPT ![d] = "recovered"]
    /\ UNCHANGED <<intentState, txState, surfaced>>

Next == \E d \in Disclosures :
            WriteIntent(d) \/ CommitClean(d) \/ CommitUnsealed(d) \/ RetrySeal(d)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv2_NoOrphanSeal Inv2_NoUnsurfacedUnsealed Inv2_IntentPrecedesCommit Inv2_RecoveryDistinguishable Inv2_BindingBijection

\* --- composition-level safety invariants (Invariant 2) ---

\* THE INVARIANT THE REPAIR BOUGHT. No `sharing.disclosed` event without its
\* committed disclosure behind it. Unconditional, and it is the ORDERING that
\* earns it: the append happens only after the domain transaction has committed,
\* so a seal that exists had its disclosure committed before it. This is the
\* direction a regulator reads, and it is the direction the previous wiring could
\* violate — see capability-backed-sharing-buggy-old-wiring.tla, which is that
\* wiring and is rejected here.
Inv2_NoOrphanSeal ==
    \A d \in Disclosures :
        (auditState[d] \in {"clean", "recovered"}) => (txState[d] = "committed")

\* No unsurfaced unsealed disclosure: a committed disclosure lacking its seal is
\* always a compliance finding someone is looking at, never a quiet inconsistency.
Inv2_NoUnsurfacedUnsealed ==
    \A d \in Disclosures :
        (txState[d] = "committed" /\ auditState[d] = "absent") => surfaced[d]

\* Durable intent precedes the transactional mutation. Nothing commits that this
\* composition did not first record itself about to do.
Inv2_IntentPrecedesCommit ==
    \A d \in Disclosures :
        (txState[d] = "committed") => (intentState[d] = "present")

\* A clean seal never went through compensation; a recovered one always did.
Inv2_RecoveryDistinguishable ==
    \A d \in Disclosures :
        /\ (auditState[d] = "clean")     => ~surfaced[d]
        /\ (auditState[d] = "recovered") => surfaced[d]

\* The umbrella. Every reachable configuration is uncommitted, cleanly bound, or a
\* SURFACED unsealed disclosure under compensation. Stated for readability and
\* conjoined into Safety, but NOT cfg-listed as a load-bearing invariant, because
\* over this state space it is the conjunction of the facets above rather than an
\* independent claim — cfg-listing it would give both twins a shared victim and
\* make the isolation look weaker than it is. The isolation that carries weight is
\* BETWEEN the twins: one breaks the ordering facet, the other the silence facet.
Coherent(d) ==
    \/ (txState[d] = "absent"    /\ auditState[d] = "absent")
    \/ (txState[d] = "committed" /\ auditState[d] \in {"clean", "recovered"})
Unsealed(d) == txState[d] = "committed" /\ auditState[d] = "absent"
Inv2_BindingBijection ==
    \A d \in Disclosures : Coherent(d) \/ (Unsealed(d) /\ surfaced[d])

Safety ==
    /\ TypeOK
    /\ Inv2_NoOrphanSeal
    /\ Inv2_NoUnsurfacedUnsealed
    /\ Inv2_IntentPrecedesCommit
    /\ Inv2_RecoveryDistinguishable
    /\ Inv2_BindingBijection

====
