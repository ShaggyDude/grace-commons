---- MODULE propagate-consent-revocation-downstream ----
\* Grace Commons — Propagate Consent Revocation Downstream.
\* Consent + Permissions + Audit Trail (substrate) + Retention Window.
\* Spec-level formal sibling of compositions/propagate-consent-revocation-downstream.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* Invariant 3 — revocation propagation completeness — as restated 2026-08-27
\* (methodology debt #19, the atomicity class; third and last instance). The
\* previous model committed the revoke, the propagation event and the scope-set
\* completeness as ONE atomic action, which is the claim the English used to make
\* and which neither store can honor: Consent's revocation is immutable once
\* committed (Consent Invariants 3, 9) and the propagation event is appended
\* through a substrate that declares an appended event cannot be withdrawn.
\* NEITHER write is enlistable, so there was never a transaction to put them in.
\* The old model asserted one, and so could not represent the one partial the
\* deployment actually reaches. This model reaches it instead.
\*
\* This pattern is the class's MANIFESTATION A — an impossible claim over an
\* ordering that was already right — as distinct from Capability-Backed Sharing's
\* manifestation B, where the wiring made a forbidden state reachable and the fix
\* was a protocol change. The discriminator is visible here: the reachable partial
\* is a MISSING record, never a FALSE one. Nothing durable asserts a fact the
\* canonical state denies, so the repair is a restatement plus the mechanism that
\* makes its liveness arm dischargeable.
\*
\* THE SHAPE (ported from chain-of-custody.tla, the corpus exemplar for this class)
\*   WriteIntent      — the consent.withdrawal_intended event. Durable, appended
\*                      before the revoke, never withdrawn. It is where the
\*                      revoker's credential is verified AND it fixes the
\*                      propagation set's boundary (Generation acceptance check 2).
\*   RevokeAndPropagate  — the ordinary path: the revoke commits and the
\*                      consent.revoked event lands after it, carrying the complete
\*                      scope set.
\*   RevokeUnpropagated — the revoke commits and the event does not. Reachable AND
\*                      surfaced in the same outcome that returns
\*                      rejected(recording-failure).
\*   RetryPropagation — the compensation: the append retried until it lands, marking
\*                      the event "recovered" (cascade_recovery = true).
\*
\* The write ORDER is what makes the split favourable and is modeled directly: the
\* event follows the revoke, and the revoke is terminal, so the reverse orphan — a
\* propagation event naming a revocation that did not happen — is not reachable by
\* any action. Inv3_NoOrphanPropagation is therefore unconditional.
\*
\* Per consent c, the sub-writes:
\*   intentState[c] : "absent" | "present"                consent.withdrawal_intended
\*   revoked[c]     : BOOLEAN                             Consent.revoke committed (terminal)
\*   propagated[c]  : "absent" | "clean" | "recovered"    consent.revoked event
\*   surfaced[c]    : BOOLEAN                             orphan raised as a finding
\*
\* SCOPE COMPLETENESS is deliberately no longer a separate variable. It was
\* `scopesComplete`, set in the same atomic action as everything else, which made
\* it true by construction and verified nothing. What actually makes the set
\* correct is a BOUNDARY — affected_scopes is the processing.registered bindings
\* ordered before this withdrawal's intent event — and a boundary claim is a
\* records-shape property over the log, checked by Generation acceptance check 2,
\* not a temporal one. Modeling it as a flag would restate the old idealization in
\* a new place. What this model does carry is the ordering that makes the boundary
\* well-defined: Inv3_IntentPrecedesRevoke.
\*
\* WHAT "SAFETY PLUS LIVENESS" MEANS HERE, STATED AT ITS TRUE STRENGTH
\* The harness checks safety invariants only. The liveness arm is canonical in the
\* English: every unpropagated revocation is propagated within the deployment's
\* declared compensation_window. What this model carries mechanically is that arm's
\* ENABLEDNESS half — RetryPropagation is enabled in exactly the unpropagated
\* configuration, so no orphan is a dead end. The bound is a configuration value
\* and an acceptance check, not a model property.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - the Consent grant/expire lifecycle (atoms/consent.md — voted English-only).
\* - the Permissions gate (a precondition), and Invariant 8's authentication
\*   precedence, which rests on the English wiring and Generation acceptance
\*   check 6; this model carries the intent event as an ordering fact only and must
\*   not be cited as evidence for the authentication claim.
\* - the Audit Trail substrate internals (audit-trail.tla), Retention Window.
\* - the direct-write bypass (check 6 case (v)) — a records-shape discrimination.

CONSTANT Consents

VARIABLES intentState, revoked, propagated, surfaced
vars == <<intentState, revoked, propagated, surfaced>>

TypeOK ==
    /\ intentState \in [Consents -> {"absent", "present"}]
    /\ revoked     \in [Consents -> BOOLEAN]
    /\ propagated  \in [Consents -> {"absent", "clean", "recovered"}]
    /\ surfaced    \in [Consents -> BOOLEAN]

Init ==
    /\ intentState = [c \in Consents |-> "absent"]
    /\ revoked     = [c \in Consents |-> FALSE]
    /\ propagated  = [c \in Consents |-> "absent"]
    /\ surfaced    = [c \in Consents |-> FALSE]

\* DURABLE INTENT: appended before the revoke, and not withdrawn when the
\* revocation does not follow. An intent with no outcome is expected residue —
\* reachable here, and correctly not a violation of anything.
WriteIntent(c) ==
    /\ intentState[c] = "absent"
    /\ intentState' = [intentState EXCEPT ![c] = "present"]
    /\ UNCHANGED <<revoked, propagated, surfaced>>

\* CLEAN outcome: the revoke commits and the propagation event lands after it.
RevokeAndPropagate(c) ==
    /\ intentState[c] = "present"
    /\ ~revoked[c]
    /\ revoked'    = [revoked    EXCEPT ![c] = TRUE]
    /\ propagated' = [propagated EXCEPT ![c] = "clean"]
    /\ UNCHANGED <<intentState, surfaced>>

\* UNPROPAGATED outcome: the revoke commits, the append does not. The revocation
\* is real and terminal; its propagation record is missing. Surfaced in the same
\* outcome that returns rejected(recording-failure). This is the state the previous
\* model could not represent, and the deployment reaches it.
RevokeUnpropagated(c) ==
    /\ intentState[c] = "present"
    /\ ~revoked[c]
    /\ revoked'  = [revoked  EXCEPT ![c] = TRUE]
    /\ surfaced' = [surfaced EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<intentState, propagated>>

\* COMPENSATION: the append retried until it lands. Enabled in exactly the
\* unpropagated configuration — no orphan is a dead end, the enabledness half of
\* the liveness arm. The propagated[c] = "absent" guard is the spec's (step)-aware
\* pre-check made structural: once an event names this consent the action is
\* disabled, so a retry cannot append a second one against Invariant 3's
\* exactly-one and check 2.
RetryPropagation(c) ==
    /\ revoked[c]
    /\ propagated[c] = "absent"
    /\ surfaced[c]
    /\ propagated' = [propagated EXCEPT ![c] = "recovered"]
    /\ UNCHANGED <<intentState, revoked, surfaced>>

Next == \E c \in Consents :
            WriteIntent(c) \/ RevokeAndPropagate(c)
              \/ RevokeUnpropagated(c) \/ RetryPropagation(c)
Spec == Init /\ [][Next]_vars

\* @isolate-facets Inv3_NoOrphanPropagation Inv3_NoUnsurfacedOrphan Inv3_IntentPrecedesRevoke Inv3_RecoveryDistinguishable Inv3_BindingBijection

\* --- composition-level safety invariants (Invariant 3) ---

\* No consent.revoked propagation event without its committed revocation.
\* Unconditional, and earned twice: the event is appended only after the revoke
\* returns, and the revoke is TERMINAL, so it cannot un-commit beneath an event
\* that names it. This is the direction an Article 7(3) dispute runs, and it is the
\* claim that distinguishes this pattern's manifestation from Capability-Backed
\* Sharing's — there, the analogous state was reachable and unrepairable.
\*
\* NO DEDICATED TWIN, DELIBERATELY, AND THIS IS THE CONFIRMATION isolate.mjs ASKS
\* FOR. A twin must be a plausible mis-implementation OF THIS COMPOSITION. No
\* wiring of this composition can produce a propagation event without its
\* revocation, because the revoke is terminal by the CONSTITUENT's invariant
\* (Consent Invariants 3, 9) rather than by anything this composition arranges —
\* so the only "twin" that could violate this would be one modeling a Consent
\* atom that un-commits a revocation, which guards nothing about this composition
\* and would assert a constituent violates its own contract. The claim is
\* therefore by-construction HERE and load-bearing anyway; what a violation of it
\* looks like in a pattern whose wiring CAN produce one is
\* capability-backed-sharing-buggy-old-wiring.tla, which is where the corpus keeps
\* that guard. Reading the two together is the point: the same claim is a frame
\* property in one pattern and a reachable defect in another, and which it is
\* depends on whether the earlier write can be taken back.
Inv3_NoOrphanPropagation ==
    \A c \in Consents :
        (propagated[c] \in {"clean", "recovered"}) => revoked[c]

\* No unsurfaced orphan: a Revoked consent lacking its propagation event is always
\* a high-priority finding someone is looking at, never a quiet inconsistency.
Inv3_NoUnsurfacedOrphan ==
    \A c \in Consents :
        (revoked[c] /\ propagated[c] = "absent") => surfaced[c]

\* The intent event precedes the revocation. This is what makes the propagation
\* set's boundary well-defined (Generation acceptance check 2): nothing can be
\* registered between the step-4 read and this append, because both sit inside one
\* serialized invocation.
Inv3_IntentPrecedesRevoke ==
    \A c \in Consents : revoked[c] => (intentState[c] = "present")

\* A clean propagation never went through compensation; a recovered one always did.
Inv3_RecoveryDistinguishable ==
    \A c \in Consents :
        /\ (propagated[c] = "clean")     => ~surfaced[c]
        /\ (propagated[c] = "recovered") => surfaced[c]

\* The umbrella. Conjoined into Safety but NOT cfg-listed: over this state space it
\* is the conjunction of the facets above rather than an independent claim, so
\* cfg-listing it would give both twins a shared victim and make the isolation look
\* weaker than it is. The isolation that carries weight is BETWEEN the twins.
Coherent(c) ==
    \/ (~revoked[c] /\ propagated[c] = "absent")
    \/ (revoked[c]  /\ propagated[c] \in {"clean", "recovered"})
Orphan(c) == revoked[c] /\ propagated[c] = "absent"
Inv3_BindingBijection ==
    \A c \in Consents : Coherent(c) \/ (Orphan(c) /\ surfaced[c])

Safety ==
    /\ TypeOK
    /\ Inv3_NoOrphanPropagation
    /\ Inv3_NoUnsurfacedOrphan
    /\ Inv3_IntentPrecedesRevoke
    /\ Inv3_RecoveryDistinguishable
    /\ Inv3_BindingBijection

====
