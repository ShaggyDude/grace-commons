---- MODULE attributedPermissionsAdmin ----
\* Grace Commons — Attributed Permissions Admin composition.
\* Spec-level formal sibling of compositions/attributed-permissions-admin.md
\* and compositions/attributed-permissions-admin.als.
\*
\* This TLA+ model is a peer artifact to the canonical English spec. It
\* models the operational state machine implied by the spec's §Action
\* wiring and checks the eight named invariants from §Application-level
\* invariants under every reachable interleaving at the chosen bounds.
\*
\* COMPLEMENTARITY WITH THE ALLOY MODEL.
\* The Alloy model (.als) carries the static structural facts and an
\* Alloy-6 LTL extension covering six temporal claims over short bounded
\* traces. This TLA+ model carries the same invariants under operational
\* TLC semantics: state-only assertions over every interleaving the
\* model can produce. The two formal artifacts are siblings — Alloy
\* checks snapshots and LTL; TLC enumerates interleavings — and either
\* can be re-run against changes to the spec.
\*
\* SCOPE — INTENTIONAL EXCLUSIONS (matching the spec's Final Critique 4
\* dynamic-Alloy scope decision).
\*   * Failure-path orphan-creation transitions.
\*   * permitted and verify_grant_attribution (pure reads — no
\*     transitions).
\*   * Cross-system clock skew (single logical clock; Invariant 4's
\*     cross-system skew condition belongs to deployments composing
\*     with RFC 3161 Trusted Timestamping).
\*   * Tamper-evidence over the composition's emergent state (the bare
\*     composition assumes the maps have not been adversarially
\*     rewritten; composing with Tamper Evidence over the emergent
\*     state is the named remedy in §Edge cases).
\*
\* NOTE ON CONCURRENT ISSUANCE.
\* Per §Edge cases → "Concurrent issuance of the same grant", two
\* simultaneous issue_grant calls for the same (subject_ref,
\* action_scope) pair produce two distinct attestations and two
\* distinct grants — Permissions' Edge case *Concurrent grant
\* proliferation* allows this, and the composition deliberately does
\* not prevent it. The model accepts this: traces in which both grant
\* slots end up Active for (s, x) are reachable and expected; the eight
\* named invariants hold over those traces. Single-active-per-pair
\* semantics belongs to a composing pattern (Idempotent Reservation, or
\* a token-based dedupe layer), not to this composition.

EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
    Actors,    \* actor IDs (grantors / revokers)
    GrantIds,  \* available grant_id slots
    AttIds,    \* available attestation_id slots
    MaxClock   \* upper bound on the logical clock (bounds state)

\* The model uses a single (subject_ref, action_scope) pair so every
\* issue_grant in the trace targets the same pair. This is the
\* configuration under which the spec's "Concurrent issuance of the
\* same grant" Edge case is exercised — and the one in which any race
\* between two issuers would surface if it were prohibited by the
\* spec's invariants. It isn't, and the model confirms it.
SUBJECT == "s"
SCOPE   == "x"

NULL == "_none_"

AttKinds == {"issue", "revoke"}

VARIABLES
    grants,                  \* GrantIds -> grant record | NULL
    attestations,            \* AttIds -> attestation record | NULL
    grant_attribution,       \* GrantIds -> AttIds | NULL
    revocation_attribution,  \* GrantIds -> AttIds | NULL
    orphan_log,              \* SUBSET AttIds
    clock                    \* logical wall clock, 0..MaxClock

vars == <<grants, attestations, grant_attribution,
          revocation_attribution, orphan_log, clock>>

GrantRec ==
    [ subject:    {SUBJECT},
      scope:      {SCOPE},
      status:     {"active", "revoked"},
      granted_at: 0..MaxClock,
      revoked_at: 0..MaxClock ]

AttRec ==
    [ actor:       Actors,
      kind:        AttKinds,
      attested_at: 0..MaxClock ]

IsUsedGrant(g)   == grants[g] /= NULL
IsActiveGrant(g) == IsUsedGrant(g) /\ grants[g].status = "active"
IsUsedAtt(a)     == attestations[a] /= NULL

\* --- TypeOK --------------------------------------------------------------

TypeOK ==
    /\ grants \in [GrantIds -> GrantRec \cup {NULL}]
    /\ attestations \in [AttIds -> AttRec \cup {NULL}]
    /\ grant_attribution \in [GrantIds -> AttIds \cup {NULL}]
    /\ revocation_attribution \in [GrantIds -> AttIds \cup {NULL}]
    /\ orphan_log \subseteq AttIds
    /\ clock \in 0..MaxClock

\* --- Init ----------------------------------------------------------------

Init ==
    /\ grants                 = [g \in GrantIds |-> NULL]
    /\ attestations           = [a \in AttIds   |-> NULL]
    /\ grant_attribution      = [g \in GrantIds |-> NULL]
    /\ revocation_attribution = [g \in GrantIds |-> NULL]
    /\ orphan_log             = {}
    /\ clock                  = 0

\* --- Action: IssueGrant --------------------------------------------------
\*
\* Models the spec's issue_grant happy path (§Composition logic →
\* §Action wiring, steps 2-6). The three writes — Actor Identity
\* attestation (step 3), Permissions grant (step 4), grant_attribution
\* pairing (step 5) — are stamped at the same logical-clock tick and
\* commit at the action grain. This matches §Edge cases → "Cross-store
\* consistency under failure", which names same-transactional-boundary
\* commit as the implementation requirement on which Invariants 1 and 2
\* are conditional.
\*
\* The action is unguarded with respect to existing grants for
\* (SUBJECT, SCOPE) — per §Edge cases this is allowed; two concurrent
\* IssueGrant firings produce two grants and two attestations, both
\* fully attributed. The eight named invariants survive that scenario.
\*
IssueGrant(act) ==
    /\ clock < MaxClock
    /\ \E g \in GrantIds, a \in AttIds :
         /\ ~IsUsedGrant(g)
         /\ ~IsUsedAtt(a)
         /\ attestations' = [attestations EXCEPT
              ![a] = [actor       |-> act,
                      kind        |-> "issue",
                      attested_at |-> clock + 1]]
         /\ grants' = [grants EXCEPT
              ![g] = [subject    |-> SUBJECT,
                      scope      |-> SCOPE,
                      status     |-> "active",
                      granted_at |-> clock + 1,
                      revoked_at |-> 0]]
         /\ grant_attribution' = [grant_attribution EXCEPT ![g] = a]
         /\ clock' = clock + 1
    /\ UNCHANGED <<revocation_attribution, orphan_log>>

\* --- Action: RevokeGrant -------------------------------------------------
\*
\* Models the spec's revoke_grant happy path (§Action wiring, steps
\* 2-6). Same atomic-grain discipline as IssueGrant: attest, status
\* flip, revocation_attribution write at one logical-clock tick.
\* Invariant 2 (revocation attribution) is established by the
\* simultaneous write of revocation_attribution alongside the status
\* flip.
\*
RevokeGrant(act, g) ==
    /\ IsActiveGrant(g)
    /\ clock < MaxClock
    /\ \E a \in AttIds :
         /\ ~IsUsedAtt(a)
         /\ attestations' = [attestations EXCEPT
              ![a] = [actor       |-> act,
                      kind        |-> "revoke",
                      attested_at |-> clock + 1]]
         /\ grants' = [grants EXCEPT
              ![g] = [subject    |-> grants[g].subject,
                      scope      |-> grants[g].scope,
                      status     |-> "revoked",
                      granted_at |-> grants[g].granted_at,
                      revoked_at |-> clock + 1]]
         /\ revocation_attribution' = [revocation_attribution EXCEPT ![g] = a]
         /\ clock' = clock + 1
    /\ UNCHANGED <<grant_attribution, orphan_log>>

\* --- Next ----------------------------------------------------------------

Next ==
    \/ \E act \in Actors : IssueGrant(act)
    \/ \E act \in Actors, g \in GrantIds : RevokeGrant(act, g)

Spec == Init /\ [][Next]_vars

\* =========================================================================
\* Eight emergent invariants from §Application-level invariants.
\* Names match the spec's invariant names and the dynamic Alloy assertions.
\* =========================================================================

\* Invariant 1 — Attribution completeness (§Invariant 1).
\* For every grant_id in the Permissions store, grant_attribution is
\* populated. The action wiring (IssueGrant) writes both in the same step,
\* so the conditional-on-pairing-write-durability qualifier in the spec
\* is discharged structurally here.
Attribution_Completeness ==
    \A g \in GrantIds : IsUsedGrant(g) => grant_attribution[g] /= NULL

\* Invariant 2 — Revocation attribution (§Invariant 2).
\* For every Revoked grant, revocation_attribution is populated.
Revocation_Attribution ==
    \A g \in GrantIds :
        (IsUsedGrant(g) /\ grants[g].status = "revoked")
        => revocation_attribution[g] /= NULL

\* Invariant 3 — Attribution recoverability (§Invariant 3).
\* State-only proxy: every populated grant_attribution entry references
\* an existing attestation record. The full recoverability claim
\* (verify_grant_attribution returns the tuple) follows by inspection.
Attribution_Recoverability ==
    \A g \in GrantIds :
        (grant_attribution[g] /= NULL)
        => IsUsedAtt(grant_attribution[g])

\* Invariant 4 — Attribution-time monotonicity (§Invariant 4).
\* attestation.attested_at <= grant.granted_at for issuance. Best-effort
\* under cross-system clock skew per the spec; the single-clock model
\* here discharges the deployment-with-shared-clock-source case.
\* Matches Dyn_Attest_Before_Record in the dynamic Alloy model.
Dyn_Attest_Before_Record ==
    \A g \in GrantIds :
        (IsUsedGrant(g) /\ grant_attribution[g] /= NULL)
        => attestations[grant_attribution[g]].attested_at
              <= grants[g].granted_at

\* Invariant 5 — Constituent invariants preserved (§Invariant 5).
\* All Permissions invariants hold over the grants store; all Actor
\* Identity invariants hold over the attestation store. The slice
\* checked here, given the model's scope:
\*   (a) revocation_attribution entries reference live attestations
\*       (mirror of Invariant 3 over the revocation map).
\*   (b) Permissions §Invariant 9 — for Revoked grants,
\*       granted_at <= revoked_at.
\* Permissions §Invariant 2 (status monotonicity: revoked → active
\* forbidden) holds by inspection of Next — no action transitions a
\* Revoked grant back to Active. Single-active-per-pair is *not*
\* checked here because the spec deliberately allows two active grants
\* for the same pair; see §Edge cases → "Concurrent issuance of the
\* same grant".
Invariant5_Constituent_Preserved ==
    /\ \A g \in GrantIds :
         (revocation_attribution[g] /= NULL)
         => IsUsedAtt(revocation_attribution[g])
    /\ \A g \in GrantIds :
         (IsUsedGrant(g) /\ grants[g].status = "revoked")
         => grants[g].granted_at <= grants[g].revoked_at

\* Invariant 6 — Pairing-map durability (§Invariant 6).
\* State-only proxy: populated entries reference live attestations.
\* The full temporal "once written, never modified" holds by inspection
\* of Next — IssueGrant and RevokeGrant only write to map slots known
\* NULL at action entry. Matches Dyn_Pairing_Durability in the dynamic
\* Alloy model.
Dyn_Pairing_Durability ==
    /\ \A g \in GrantIds :
         (grant_attribution[g] /= NULL)
         => IsUsedAtt(grant_attribution[g])
    /\ \A g \in GrantIds :
         (revocation_attribution[g] /= NULL)
         => IsUsedAtt(revocation_attribution[g])

\* Invariant 7 — Attestation exclusivity (§Invariant 7).
\* grant_attribution is injective; revocation_attribution is injective;
\* their ranges are disjoint. No attestation serves more than one role.
\* The action wiring enforces this structurally: each action writes
\* into an attestation slot known NULL at entry, so no attestation is
\* ever pointed at by two map entries.
Invariant7_Attestation_Exclusivity ==
    LET IssuanceAtts ==
            { grant_attribution[g] :
                g \in {h \in GrantIds : grant_attribution[h] /= NULL} }
        RevAtts ==
            { revocation_attribution[g] :
                g \in {h \in GrantIds : revocation_attribution[h] /= NULL} }
        IssuanceInjective ==
            \A g1, g2 \in GrantIds :
                (grant_attribution[g1] /= NULL
                 /\ grant_attribution[g1] = grant_attribution[g2])
                => g1 = g2
        RevInjective ==
            \A g1, g2 \in GrantIds :
                (revocation_attribution[g1] /= NULL
                 /\ revocation_attribution[g1] = revocation_attribution[g2])
                => g1 = g2
    IN /\ IssuanceInjective
       /\ RevInjective
       /\ IssuanceAtts \cap RevAtts = {}

\* Invariant 8 — Orphan log durability (§Invariant 8).
\* State-only proxy: orphan_log contains only valid attestation ids.
\* The full temporal property holds by inspection of Next — no action
\* removes from orphan_log (and on the happy-path-only scope of this
\* model, no action writes to it either). Matches
\* Dyn_Orphan_Log_Durability in the dynamic Alloy model. Failure-path
\* transitions that populate orphan_log are deferred per the spec's
\* Final Critique 4 scope decision.
Dyn_Orphan_Log_Durability == orphan_log \subseteq AttIds

\* --- Combined safety -----------------------------------------------------

Safety ==
    /\ TypeOK
    /\ Attribution_Completeness
    /\ Revocation_Attribution
    /\ Attribution_Recoverability
    /\ Dyn_Attest_Before_Record
    /\ Invariant5_Constituent_Preserved
    /\ Dyn_Pairing_Durability
    /\ Invariant7_Attestation_Exclusivity
    /\ Dyn_Orphan_Log_Durability

====
