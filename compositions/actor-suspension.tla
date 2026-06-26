---- MODULE actor-suspension ----
\* Grace Commons — Actor Suspension. Login's outbound-side counterpart.
\* Spec-level formal sibling of compositions/actor-suspension.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing emergent guarantee is Invariant 1 (atomicity of
\* multi-surface revocation): after suspend_actor succeeds, the actor holds zero
\* active grants AND zero active sessions, committed as ONE transaction — there is
\* no reachable success state in which the actor is Suspended while an enumerated
\* grant or session is still active. Invariant 2 (audit completeness): the
\* actor.suspended event enumerates every revoked grant_id and session_token.
\*
\* The actor's two authorization surfaces:
\*   grantStatus[g]  : "active" | "revoked"   (Permissions grant g)
\*   sessStatus[s]   : "active" | "revoked"   (Session s)
\* Composition state:
\*   suspended        : FALSE | TRUE          (actor_suspension_state, Active/Suspended)
\*   auditedGrants    : SUBSET Grants         (grant_ids enumerated in the sealed event)
\*   auditedSessions  : SUBSET Sessions       (session_tokens enumerated in the sealed event)
\*
\* This CORRECT model performs the whole cascade as a SINGLE ATOMIC action
\* (Action wiring steps 3-7, the all-or-nothing default): SuspendAtomic, guarded on
\* ~suspended (the Active->Suspended gate, Invariant 3), revokes every grant and
\* every session, records the complete enumeration, and sets suspended — all at
\* once. The buggy twin splits this into separate interleavable sub-steps so a
\* "Suspended but a session still active" partial state (a half-open door) is
\* reachable, and TLC finds it.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - concurrent grant/session ISSUANCE after the snapshot (Invariant 1 is
\*   snapshot-scoped; gating issuance on the suspension state is the composing
\*   layer's obligation — see the English §Edge cases).
\* - the benign TOCTOU already-terminal case (a concurrent revoke during the
\*   cascade) — handled in the wiring as benign, not a safety property to verify.
\* - the best-effort posture and the optional Credential surface.
\* - constituent invariants (Invariant 4) — each checked in its own model
\*   (permissions.als; session/audit-trail/...), not re-proven here.

CONSTANTS Grants, Sessions       \* the actor's active grants and sessions (the snapshot)

VARIABLES grantStatus, sessStatus, suspended, auditedGrants, auditedSessions
vars == <<grantStatus, sessStatus, suspended, auditedGrants, auditedSessions>>

TypeOK ==
    /\ grantStatus     \in [Grants -> {"active", "revoked"}]
    /\ sessStatus      \in [Sessions -> {"active", "revoked"}]
    /\ suspended       \in BOOLEAN
    /\ auditedGrants   \subseteq Grants
    /\ auditedSessions \subseteq Sessions

\* Every grant and session begins active; the actor is not suspended; nothing audited.
Init ==
    /\ grantStatus     = [g \in Grants |-> "active"]
    /\ sessStatus      = [s \in Sessions |-> "active"]
    /\ suspended       = FALSE
    /\ auditedGrants   = {}
    /\ auditedSessions = {}

\* CORRECT suspend: revoke every grant + every session, record the complete
\* enumeration, and set Suspended — all in one atomic step. Guarded on ~suspended
\* (the Active->Suspended gate: a second suspend is disabled, the no-op of Inv 3).
SuspendAtomic ==
    /\ ~suspended
    /\ grantStatus'     = [g \in Grants |-> "revoked"]
    /\ sessStatus'      = [s \in Sessions |-> "revoked"]
    /\ auditedGrants'   = Grants
    /\ auditedSessions' = Sessions
    /\ suspended'       = TRUE

Next == SuspendAtomic
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariants ---

\* The two coherent configurations of the suspension: either fully un-suspended
\* (nothing revoked, nothing audited) or fully suspended (everything revoked,
\* everything audited). No dangling partial — the atomic-cascade form of Inv 1.
Inv1_Coherent ==
    \/ (/\ suspended = FALSE
        /\ \A g \in Grants   : grantStatus[g] = "active"
        /\ \A s \in Sessions : sessStatus[s]  = "active"
        /\ auditedGrants = {}
        /\ auditedSessions = {})
    \/ (/\ suspended = TRUE
        /\ \A g \in Grants   : grantStatus[g] = "revoked"
        /\ \A s \in Sessions : sessStatus[s]  = "revoked"
        /\ auditedGrants = Grants
        /\ auditedSessions = Sessions)

\* Invariant 1 — atomicity of multi-surface revocation: a Suspended actor has zero
\* active grants and zero active sessions (no half-open door).
Inv1_FullyDeauthorized ==
    suspended =>
        /\ \A g \in Grants   : grantStatus[g] = "revoked"
        /\ \A s \in Sessions : sessStatus[s]  = "revoked"

\* Invariant 2 — audit completeness: every revoked grant/session is enumerated in
\* the sealed actor.suspended event.
Inv2_AuditComplete ==
    /\ \A g \in Grants   : grantStatus[g] = "revoked" => g \in auditedGrants
    /\ \A s \in Sessions : sessStatus[s]  = "revoked" => s \in auditedSessions

Safety == TypeOK /\ Inv1_Coherent /\ Inv1_FullyDeauthorized /\ Inv2_AuditComplete

====
