---- MODULE actor-suspension-buggy ----
\* BUGGY TWIN (vacuity guard) for actor-suspension.tla.
\*
\* The cascade is split into three separate, interleavable sub-steps with NO
\* transaction — the non-atomic multi-surface revocation the *All-or-nothing* edge
\* case and Invariant 1 warn against:
\*   RevokeGrants    -> revoke every grant
\*   RevokeSessions  -> revoke every session
\*   RecordSuspended -> set suspended + record the enumeration from what is
\*                      currently revoked
\* Because they are distinct actions, TLC reaches the interleaving
\*   RevokeGrants -> RecordSuspended
\* in which suspended = TRUE while every session is still "active" — a Suspended
\* actor with an active session, the half-open door. Inv1_Coherent and
\* Inv1_FullyDeauthorized both fail. The checker rejects the twin. If the checker
\* reports the invariants hold here, the harness is vacuous.

CONSTANTS Grants, Sessions

VARIABLES grantStatus, sessStatus, suspended, auditedGrants, auditedSessions
vars == <<grantStatus, sessStatus, suspended, auditedGrants, auditedSessions>>

TypeOK ==
    /\ grantStatus     \in [Grants -> {"active", "revoked"}]
    /\ sessStatus      \in [Sessions -> {"active", "revoked"}]
    /\ suspended       \in BOOLEAN
    /\ auditedGrants   \subseteq Grants
    /\ auditedSessions \subseteq Sessions

Init ==
    /\ grantStatus     = [g \in Grants |-> "active"]
    /\ sessStatus      = [s \in Sessions |-> "active"]
    /\ suspended       = FALSE
    /\ auditedGrants   = {}
    /\ auditedSessions = {}

\* BUG: three separate, interleavable sub-steps, no transaction.
RevokeGrants ==
    /\ ~suspended
    /\ \E g \in Grants : grantStatus[g] = "active"
    /\ grantStatus' = [g \in Grants |-> "revoked"]
    /\ UNCHANGED <<sessStatus, suspended, auditedGrants, auditedSessions>>

RevokeSessions ==
    /\ ~suspended
    /\ \E s \in Sessions : sessStatus[s] = "active"
    /\ sessStatus' = [s \in Sessions |-> "revoked"]
    /\ UNCHANGED <<grantStatus, suspended, auditedGrants, auditedSessions>>

RecordSuspended ==
    /\ ~suspended
    /\ suspended' = TRUE
    /\ auditedGrants'   = {g \in Grants   : grantStatus[g] = "revoked"}
    /\ auditedSessions' = {s \in Sessions : sessStatus[s]  = "revoked"}
    /\ UNCHANGED <<grantStatus, sessStatus>>

Next == RevokeGrants \/ RevokeSessions \/ RecordSuspended
Spec == Init /\ [][Next]_vars

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

Inv1_FullyDeauthorized ==
    suspended =>
        /\ \A g \in Grants   : grantStatus[g] = "revoked"
        /\ \A s \in Sessions : sessStatus[s]  = "revoked"

Inv2_AuditComplete ==
    /\ \A g \in Grants   : grantStatus[g] = "revoked" => g \in auditedGrants
    /\ \A s \in Sessions : sessStatus[s]  = "revoked" => s \in auditedSessions

Safety == TypeOK /\ Inv1_Coherent /\ Inv1_FullyDeauthorized /\ Inv2_AuditComplete

====
