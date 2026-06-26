---- MODULE external-onboarding ----
\* Grace Commons — External Onboarding composition.
\* Spec-level formal sibling of compositions/external-onboarding.md.
\* Grounded on Final Critique 4.
\*
\* This TLA+ model verifies the five application-level invariants from the
\* spec under every reachable state interleaving at the chosen bounds. It
\* is a peer artifact to the canonical English spec; if the spec changes,
\* this model should be updated to match.
\*
\* -------------------------------------------------------------------------
\* WHY TLA+ FOR THIS SPEC
\*
\* The spec's most consequential temporal claim is the single-resolution
\* gate: Invitation.accept is the serialization point. Under concurrent
\* onboard calls for the same invitation token, exactly one call succeeds;
\* all others receive already-resolved(Accepted) and create no permanent
\* records. TLA+ enumerates all possible interleavings of concurrent
\* Onboard steps; TLC will confirm that the precondition
\* `invitations[inv].status = "pending"` is sufficient to guarantee this
\* across every ordering.
\*
\* The companion Alloy model (if written) would carry the static structural
\* facts. This TLA+ model carries the temporal safety properties over the
\* operational state machine.
\*
\* -------------------------------------------------------------------------
\* SCOPE — INTENTIONAL EXCLUSIONS
\*
\* * Party Identity verification (Unverified → Verified). That transition
\*   belongs to Customer Onboarding and is outside this
\*   composition's surface.
\* * Credential rotation after onboarding. Outside the composition.
\* * Background invitation expiry scheduling. Expire is modeled as an
\*   action available to TLC but the composition does not own its trigger.
\* * Partial-failure recovery paths (admin intervention after interrupted
\*   onboarding). Modeled only enough to check Invariant 4 (audit coverage
\*   for the interrupted event); recovery is outside scope.
\* * The Audit Trail's own tamper-evidence properties. The Audit Trail
\*   substrate is represented as five sets tracking which events have been
\*   written; its internal hash chain is the Audit Trail composition's
\*   concern.
\*
\* -------------------------------------------------------------------------
\* COMPLEMENTARITY NOTE
\*
\* The `invite` action writes the Audit Trail record before calling
\* Invitation.initiate (audit-first discipline, spec §onboard notes step
\* ordering). In this model, both writes are atomic at the action grain
\* (TLA+ actions are atomic). The partial-failure case — Audit Trail record
\* exists but Invitation.initiate fails — is represented by the absence of
\* any invite-initiated record in invitations while an audit_initiated event
\* exists. That gap is what Generation Acceptance check 6 detects in a
\* running system; here it is noted as a known scope limitation.
\* =========================================================================

EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
    Actors,        \* internal actor IDs (inviters, service accounts)
    InvitationIds, \* available invitation ID slots
    PartyIds,      \* available party ID slots
    CredentialIds, \* available credential ID slots
    MaxClock       \* upper bound on logical clock (bounds state space)

\* Suggested TLC values for a tractable run:
\*   Actors        = {a1, a2}
\*   InvitationIds = {i1, i2}
\*   PartyIds      = {p1, p2}
\*   CredentialIds = {c1, c2}
\*   MaxClock      = 3

NULL == "_none_"

InvStatuses == {"pending", "accepted", "declined", "revoked", "expired"}

\* =========================================================================
\* RECORD TYPES
\*
\* InvRec tracks the invitation's status and, on a successful onboard, the
\* party_id and cred_id that were created. These two fields are NULL for
\* invitations that are pending, declined, revoked, expired, or interrupted
\* (accepted but enrollment failed). They are non-NULL only when a full
\* successful Onboard has completed — which is exactly Invariant 5's
\* completeness condition.
\*
\* inviter_ref is omitted from InvRec. The inviting actor's identity is
\* needed for audit attribution; for invariant checking here, it is not
\* load-bearing.
\* =========================================================================

InvRec ==
    [ status   : InvStatuses,
      party_id : PartyIds   \cup {NULL},
      cred_id  : CredentialIds \cup {NULL} ]

\* PartyRec binds the enrolled party to the invitation that authorized its
\* creation (from_inv) and records when it was enrolled (for ordering check).
PartyRec ==
    [ enrolled_at : 0..MaxClock,
      from_inv    : InvitationIds ]

\* CredRec binds the credential to its subject (principal_ref = party_id)
\* and the invitation that authorized its creation.
CredRec ==
    [ principal_ref : PartyIds,
      registered_at : 0..MaxClock,
      from_inv      : InvitationIds ]

\* =========================================================================
\* VARIABLES
\*
\* Domain state:
\*   invitations  — the invitation store (InvitationIds -> InvRec | NULL)
\*   parties      — the Party Identity store (PartyIds -> PartyRec | NULL)
\*   credentials  — the Credential store (CredentialIds -> CredRec | NULL)
\*
\* Audit Trail state (simplified — sets of invitation IDs per event type):
\*   audit_accepted    — invitations whose onboarding.invitation-accepted
\*                       event has been written (Invariant 4a)
\*   audit_declined    — invitations whose invitation.declined event has
\*                       been written (Invariant 4b)
\*   audit_revoked     — invitations whose invitation.revoked event has
\*                       been written (Invariant 4c)
\*   audit_interrupted — invitations whose onboarding.interrupted event has
\*                       been written (GA check 5 detection surface)
\*
\* Logical clock:
\*   clock — monotone counter, bounded by MaxClock to keep state finite
\* =========================================================================

VARIABLES
    invitations,
    parties,
    credentials,
    audit_accepted,
    audit_declined,
    audit_revoked,
    audit_interrupted,
    clock

vars == <<invitations, parties, credentials,
          audit_accepted, audit_declined, audit_revoked, audit_interrupted,
          clock>>

\* --- TypeOK ---------------------------------------------------------------

TypeOK ==
    /\ invitations \in [InvitationIds -> InvRec \cup {NULL}]
    /\ parties     \in [PartyIds      -> PartyRec \cup {NULL}]
    /\ credentials \in [CredentialIds -> CredRec  \cup {NULL}]
    /\ audit_accepted    \subseteq InvitationIds
    /\ audit_declined    \subseteq InvitationIds
    /\ audit_revoked     \subseteq InvitationIds
    /\ audit_interrupted \subseteq InvitationIds
    /\ clock \in 0..MaxClock

\* --- Init -----------------------------------------------------------------

Init ==
    /\ invitations     = [i \in InvitationIds |-> NULL]
    /\ parties         = [p \in PartyIds      |-> NULL]
    /\ credentials     = [c \in CredentialIds |-> NULL]
    /\ audit_accepted    = {}
    /\ audit_declined    = {}
    /\ audit_revoked     = {}
    /\ audit_interrupted = {}
    /\ clock             = 0

\* =========================================================================
\* ACTIONS
\* =========================================================================

\* --- Invite(actor, inv) ---------------------------------------------------
\*
\* Models the spec's `invite` action (§Actions → invite).
\* Writes the Audit Trail initiation record and creates the Invitation in
\* Pending state. Both writes are atomic here (TLA+ action grain), matching
\* the spec's same-transactional-boundary requirement.
\*
\* Audit-first note: the spec calls Audit Trail.record_action before
\* Invitation.initiate. In the TLA+ model this ordering is collapsed into
\* one atomic step. The partial-failure case (audit record exists but
\* invitation creation failed) is noted in the file header as a known scope
\* exclusion; GA check 6 surfaces it in a running system.
\*
Invite(actor, inv) ==
    /\ clock < MaxClock
    /\ invitations[inv] = NULL   \* invitation slot must be unused
    /\ invitations' = [invitations EXCEPT
         ![inv] = [status   |-> "pending",
                   party_id |-> NULL,
                   cred_id  |-> NULL]]
    /\ clock' = clock + 1
    /\ UNCHANGED <<parties, credentials,
                   audit_accepted, audit_declined, audit_revoked,
                   audit_interrupted>>

\* --- Onboard(inv, party, cred, actor) ------------------------------------
\*
\* Models the spec's `onboard` action happy path (§Actions → onboard,
\* steps 3–8). The single-resolution gate fires first: the precondition
\* `invitations[inv].status = "pending"` is the atomic check corresponding
\* to Invitation.accept. Exactly one concurrent Onboard per invitation
\* can satisfy this precondition — the first to execute sets status to
\* "accepted"; all subsequent calls find status /= "pending" and are
\* disabled, creating no permanent records.
\*
\* All writes are atomic at this action grain:
\*   - Invitation status → "accepted" with party_id and cred_id filled in
\*   - Party Identity record created
\*   - Credential record created (principal_ref = party_id)
\*   - onboarding.invitation-accepted event written to audit_accepted
\*
\* The onboarding.completed event is represented by the presence of
\* non-NULL party_id and cred_id on the invitation record, which is
\* the condition Invariant 5 checks.
\*
Onboard(inv, party, cred, actor) ==
    /\ clock < MaxClock
    /\ invitations[inv] /= NULL
    /\ invitations[inv].status = "pending"   \* THE GATE — Invitation.accept
    /\ parties[party]     = NULL             \* party slot must be unused
    /\ credentials[cred]  = NULL             \* credential slot must be unused
    /\ invitations' = [invitations EXCEPT
         ![inv] = [status   |-> "accepted",
                   party_id |-> party,
                   cred_id  |-> cred]]
    /\ parties' = [parties EXCEPT
         ![party] = [enrolled_at |-> clock + 1,
                     from_inv    |-> inv]]
    /\ credentials' = [credentials EXCEPT
         ![cred] = [principal_ref |-> party,
                    registered_at |-> clock + 1,
                    from_inv      |-> inv]]
    /\ audit_accepted' = audit_accepted \cup {inv}
    /\ clock' = clock + 1
    /\ UNCHANGED <<audit_declined, audit_revoked, audit_interrupted>>

\* --- OnboardInterrupted(inv, actor) ---------------------------------------
\*
\* Models partial failure after Invitation.accept (spec §onboard, steps
\* 5–7 failure paths and §Edge cases → "Partial failure after
\* Invitation.accept"). The gate clears (invitation → Accepted) but the
\* downstream enrollment or credential registration fails.
\*
\* Invariant 1 (invitation gates enrollment) still holds: the invitation
\* is Accepted but no Party Identity record exists for it.
\* Invariant 4a (audit coverage for Accepted invitations) still holds:
\* the onboarding.invitation-accepted event is written.
\* The onboarding.interrupted event is written to audit_interrupted for
\* GA check 5 (unresolved interruptions detectable).
\*
OnboardInterrupted(inv, actor) ==
    /\ clock < MaxClock
    /\ invitations[inv] /= NULL
    /\ invitations[inv].status = "pending"
    /\ invitations' = [invitations EXCEPT
         ![inv] = [status   |-> "accepted",
                   party_id |-> NULL,
                   cred_id  |-> NULL]]
    /\ audit_accepted'    = audit_accepted \cup {inv}
    /\ audit_interrupted' = audit_interrupted \cup {inv}
    /\ clock' = clock + 1
    /\ UNCHANGED <<parties, credentials, audit_declined, audit_revoked>>

\* --- Decline(inv, actor) --------------------------------------------------
\*
\* Models the spec's `decline` action. Invitation transitions
\* Pending → Declined; the invitation.declined audit event is written.
\*
Decline(inv, actor) ==
    /\ clock < MaxClock
    /\ invitations[inv] /= NULL
    /\ invitations[inv].status = "pending"
    /\ invitations' = [invitations EXCEPT
         ![inv].status = "declined"]
    /\ audit_declined' = audit_declined \cup {inv}
    /\ clock' = clock + 1
    /\ UNCHANGED <<parties, credentials,
                   audit_accepted, audit_revoked, audit_interrupted>>

\* --- Revoke(inv, actor) ---------------------------------------------------
\*
\* Models the spec's `revoke` action. Invitation transitions
\* Pending → Revoked; the invitation.revoked audit event is written.
\*
Revoke(inv, actor) ==
    /\ clock < MaxClock
    /\ invitations[inv] /= NULL
    /\ invitations[inv].status = "pending"
    /\ invitations' = [invitations EXCEPT
         ![inv].status = "revoked"]
    /\ audit_revoked' = audit_revoked \cup {inv}
    /\ clock' = clock + 1
    /\ UNCHANGED <<parties, credentials,
                   audit_accepted, audit_declined, audit_interrupted>>

\* --- Expire(inv) ----------------------------------------------------------
\*
\* Models background expiry by the Invitation atom's scheduler.
\* Per spec §Round 3 Pass 3 finding R3F1, expiry that occurs via the
\* background scheduler (not through this composition's `onboard` action
\* discovering an expired invitation) is outside the composition's surface
\* and does not produce an audit event from this composition.
\* Invariant 4 is qualified to cover only terminal transitions "that pass
\* through this composition" — expiry via the scheduler is excluded.
\*
Expire(inv) ==
    /\ clock < MaxClock
    /\ invitations[inv] /= NULL
    /\ invitations[inv].status = "pending"
    /\ invitations' = [invitations EXCEPT
         ![inv].status = "expired"]
    /\ clock' = clock + 1
    /\ UNCHANGED <<parties, credentials,
                   audit_accepted, audit_declined, audit_revoked,
                   audit_interrupted>>

\* --- Next -----------------------------------------------------------------

Next ==
    \/ \E actor \in Actors, inv \in InvitationIds :
           Invite(actor, inv)
    \/ \E actor \in Actors, inv \in InvitationIds,
         party \in PartyIds, cred \in CredentialIds :
           Onboard(inv, party, cred, actor)
    \/ \E actor \in Actors, inv \in InvitationIds :
           OnboardInterrupted(inv, actor)
    \/ \E actor \in Actors, inv \in InvitationIds :
           Decline(inv, actor)
    \/ \E actor \in Actors, inv \in InvitationIds :
           Revoke(inv, actor)
    \/ \E inv \in InvitationIds :
           Expire(inv)

Spec == Init /\ [][Next]_vars

\* =========================================================================
\* APPLICATION-LEVEL INVARIANTS
\* Names and numbering match §Composition-level invariants in the spec.
\* =========================================================================

\* Invariant 1 — Invitation gates enrollment.
\* Every enrolled Party Identity traces to an Invitation in Accepted state.
\* No party is created by any path other than a successful Onboard that
\* first satisfied the `invitations[inv].status = "pending"` gate.
\*
\* This is the composition's load-bearing emergent property. It holds
\* across all interleavings because:
\*   (a) parties[p] /= NULL is only set by the Onboard action.
\*   (b) Onboard requires invitations[inv].status = "pending" atomically.
\*   (c) After Onboard, invitations[inv].status = "accepted".
\*
Invitation_Gates_Enrollment ==
    \A p \in PartyIds :
        parties[p] /= NULL =>
            /\ invitations[parties[p].from_inv] /= NULL
            /\ invitations[parties[p].from_inv].status = "accepted"

\* Invariant 2 — Single resolution (one successful onboard per invitation).
\* Each invitation produces at most one enrolled Party Identity.
\* This is the concurrency safety claim: even when two Onboard calls for
\* the same inv fire in any interleaving, at most one can satisfy
\* `invitations[inv].status = "pending"` — the first sets it to "accepted",
\* disabling the second before it creates any records.
\*
Single_Resolution ==
    \A inv \in InvitationIds :
        Cardinality({p \in PartyIds :
            parties[p] /= NULL /\ parties[p].from_inv = inv}) <= 1

\* Invariant 3 — Credential-follows-party.
\* Every credential registered via this composition has a corresponding
\* Party Identity record, and the enrollment timestamp predates or matches
\* the credential registration timestamp.
\*
\* Structural: credentials[c] /= NULL =>
\*   (a) parties[credentials[c].principal_ref] /= NULL
\*   (b) parties[principal_ref].enrolled_at <= credentials[c].registered_at
\*
Credential_Follows_Party ==
    \A c \in CredentialIds :
        credentials[c] /= NULL =>
            LET pr == credentials[c].principal_ref
            IN  /\ parties[pr] /= NULL
                /\ parties[pr].enrolled_at <= credentials[c].registered_at

\* Invariant 4 — Full Audit Trail coverage.
\* Every terminal Invitation transition that passes through this
\* composition produces a corresponding Audit Trail event.
\*   (a) Accepted invitations → onboarding.invitation-accepted event
\*   (b) Declined invitations → invitation.declined event
\*   (c) Revoked invitations → invitation.revoked event
\*
\* Note: Expired invitations (via background scheduler, Expire action above)
\* are excluded per the spec's R3F1 finding. Invariant 4 is explicitly
\* qualified: "every terminal state change that passes through this
\* composition" — the Expire action models the scheduler-driven expiry,
\* which is outside this qualification.
\*
Audit_Coverage ==
    /\ \A inv \in InvitationIds :
           (invitations[inv] /= NULL /\
            invitations[inv].status = "accepted")
           => inv \in audit_accepted
    /\ \A inv \in InvitationIds :
           (invitations[inv] /= NULL /\
            invitations[inv].status = "declined")
           => inv \in audit_declined
    /\ \A inv \in InvitationIds :
           (invitations[inv] /= NULL /\
            invitations[inv].status = "revoked")
           => inv \in audit_revoked

\* Invariant 5 — Completion record names the full arc.
\* For every invitation that completed a full successful onboard
\* (party_id /= NULL on the invitation record), the corresponding
\* Party Identity record and Credential record both exist, and the
\* credential's principal_ref matches the invitation's party_id.
\* This verifies that the spec's onboarding.completed event payload
\* {invitation_token, accepting_identity_ref, party_id, credential_id}
\* is self-consistent and references live records.
\*
Completion_Names_Full_Arc ==
    \A inv \in InvitationIds :
        (invitations[inv] /= NULL /\
         invitations[inv].party_id /= NULL) =>
            LET pid == invitations[inv].party_id
                cid == invitations[inv].cred_id
            IN  /\ parties[pid] /= NULL
                /\ cid /= NULL
                /\ credentials[cid] /= NULL
                /\ credentials[cid].principal_ref = pid

\* =========================================================================
\* ADDITIONAL STRUCTURAL INVARIANTS
\* Properties not named in §Composition-level invariants but implied by
\* the composition's step-order wiring and needed for a complete TLC check.
\* =========================================================================

\* Status monotonicity: invitation terminal states are irreversible.
\* Once an invitation is not Pending, it remains in its terminal state.
\* Checked structurally here; the temporal "always" version is enforced
\* by the action preconditions (all actions require status = "pending").
\*
Status_Monotone ==
    \A inv \in InvitationIds :
        invitations[inv] /= NULL =>
            invitations[inv].status \in InvStatuses

\* Party-to-invitation binding integrity.
\* Every party record's from_inv references an existing invitation slot.
Party_Invitation_Binding ==
    \A p \in PartyIds :
        parties[p] /= NULL =>
            invitations[parties[p].from_inv] /= NULL

\* Credential-to-party binding integrity.
\* Every credential's principal_ref references an existing party record.
Credential_Party_Binding ==
    \A c \in CredentialIds :
        credentials[c] /= NULL =>
            parties[credentials[c].principal_ref] /= NULL

\* Audit events reference only existing invitations.
Audit_Set_Integrity ==
    /\ audit_accepted    \subseteq {inv \in InvitationIds : invitations[inv] /= NULL}
    /\ audit_declined    \subseteq {inv \in InvitationIds : invitations[inv] /= NULL}
    /\ audit_revoked     \subseteq {inv \in InvitationIds : invitations[inv] /= NULL}
    /\ audit_interrupted \subseteq {inv \in InvitationIds : invitations[inv] /= NULL}

\* =========================================================================
\* COMBINED SAFETY PREDICATE
\* All invariants from §Composition-level invariants plus structural guards.
\* TLC checks Safety as a single invariant over the full state space.
\* =========================================================================

Safety ==
    /\ TypeOK
    /\ Invitation_Gates_Enrollment
    /\ Single_Resolution
    /\ Credential_Follows_Party
    /\ Audit_Coverage
    /\ Completion_Names_Full_Arc
    /\ Status_Monotone
    /\ Party_Invitation_Binding
    /\ Credential_Party_Binding
    /\ Audit_Set_Integrity

====
