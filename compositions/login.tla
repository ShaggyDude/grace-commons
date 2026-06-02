---- MODULE login ----
\* Grace Commons — Login composition TLA+ model.
\* Spec-level formal sibling of compositions/login.md.
\*
\* This TLA+ model verifies the named invariants from §Application-level
\* invariants under every reachable interleaving at the chosen bounds.
\*
\* COMPLEMENTARITY WITH THE ALLOY MODEL.
\* No static Alloy model exists for this composition yet. The TLA+ model
\* carries the operational invariants: state assertions over every
\* interleaving the bounded model can produce, including the map-write-
\* failure edge case and the FC1 TOCTOU race.
\*
\* SCOPE — INTENTIONAL EXCLUSIONS (matching login.md's Final Critique scope):
\*   * Audit Trail substrate (login.md §Invariant 5 — Audit Trail
\*     completeness). That invariant delegates to the Audit Trail
\*     composition's own model. This model verifies cascade-ordering
\*     as the login-composition contribution to the audit claim.
\*   * Storage-failure on session record write (steps 2-3). The action
\*     simply does not fire if the session slot is unavailable; aborting
\*     on storage failure is modeled by the precondition.
\*   * Cross-system clock skew (single logical clock).
\*   * Credential.verify internals — modeled as a guard: the credential
\*     must be "active" for Login to fire. What "active" means to the
\*     Permissions or Actor Identity stores is out of scope here.
\*
\* MAP-WRITE-FAILURE PATH (login.md §step 5 / §Edge cases):
\*   Login's step-5 credential_to_sessions write may fail. The session
\*   is still valid and returned (outcome: success-with-map-failure).
\*   This model tracks such sessions in `map_write_failed` so that
\*   Invariant 6's strict-inverse clause can correctly exclude them:
\*   they appear in session_to_cred but not in cred_to_sessions.
\*
\* CASCADE SNAPSHOT SCOPE (login.md §Invariant 2):
\*   RevokeSessionsForCredential takes an atomic snapshot of active
\*   sessions and revokes them. Sessions created AFTER the cascade fires
\*   cannot exist — the credential is revoked, so Login's guard blocks.
\*   In a real distributed deployment the snapshot race is real; here the
\*   TLA+ atomic-action model discharges the single-node case.
\*
\* FC1 TOCTOU RACE (login.md §Final Critique 1):
\*   A Logout may run concurrently with the cascade. If Logout fires on a
\*   session the cascade also targets, the cascade finds it already
\*   terminal (already-terminal → skipped). The model includes Logout as
\*   a concurrent action and verifies cascade completeness survives this
\*   interleaving.

EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
    CredentialIds,   \* credential id slots
    SessionTokens,   \* session token slots
    MaxClock         \* upper bound on logical clock (bounds state space)

NULL == "_none_"

VARIABLES
    cred_status,       \* CredentialIds -> {"active", "revoked"}
    session_status,    \* SessionTokens -> {"active","logged_out","revoked_by_cascade"} | NULL
    session_to_cred,   \* SessionTokens -> CredentialIds | NULL   (immutable once written)
    cred_to_sessions,  \* CredentialIds -> SUBSET SessionTokens   (all issued sessions; grows, never shrinks)
    map_write_failed,  \* SUBSET SessionTokens   (sessions where step-5 map write failed)
    log_sessions,      \* SUBSET SessionTokens   (tokens with a login log entry)
    cascade_initiated, \* SUBSET CredentialIds   (credentials for which cascade was logged)
    cascade_revoked,   \* SUBSET SessionTokens   (sessions the cascade acted on)
    clock              \* logical wall clock, 0..MaxClock

vars == <<cred_status, session_status, session_to_cred, cred_to_sessions,
          map_write_failed, log_sessions, cascade_initiated, cascade_revoked, clock>>

SessionStatuses == {"active", "logged_out", "revoked_by_cascade"}
CredStatuses    == {"active", "revoked"}

\* --- Helper predicates -------------------------------------------------------

IsActiveSession(s)   == session_status[s] = "active"
IsTerminalSession(s) == \/ session_status[s] = "logged_out"
                        \/ session_status[s] = "revoked_by_cascade"
IsIssuedSession(s)   == session_status[s] /= NULL

\* --- TypeOK ------------------------------------------------------------------

TypeOK ==
    /\ cred_status      \in [CredentialIds -> CredStatuses]
    /\ session_status   \in [SessionTokens -> SessionStatuses \cup {NULL}]
    /\ session_to_cred  \in [SessionTokens -> CredentialIds \cup {NULL}]
    /\ cred_to_sessions \in [CredentialIds -> SUBSET SessionTokens]
    /\ map_write_failed \subseteq SessionTokens
    /\ log_sessions     \subseteq SessionTokens
    /\ cascade_initiated \subseteq CredentialIds
    /\ cascade_revoked  \subseteq SessionTokens
    /\ clock \in 0..MaxClock

\* --- Init --------------------------------------------------------------------

Init ==
    /\ cred_status      = [c \in CredentialIds |-> "active"]
    /\ session_status   = [s \in SessionTokens |-> NULL]
    /\ session_to_cred  = [s \in SessionTokens |-> NULL]
    /\ cred_to_sessions = [c \in CredentialIds |-> {}]
    /\ map_write_failed = {}
    /\ log_sessions     = {}
    /\ cascade_initiated = {}
    /\ cascade_revoked  = {}
    /\ clock            = 0

\* --- Action: Login -----------------------------------------------------------
\*
\* Models the happy path of login.md §Composition logic (steps 2-6).
\* Precondition: the credential must be "active" — this is the spec's
\* Credential.verify guard. Steps 3-6 are atomic: session record, audit
\* entry, cred_to_sessions write, and session_to_cred write all commit
\* together. This matches §Edge cases → "Cross-store consistency under
\* failure" (same-transactional-boundary commit discipline).
\*
Login(cred, sess) ==
    /\ clock < MaxClock
    /\ cred_status[cred] = "active"
    /\ session_status[sess] = NULL          \* sess slot is free
    /\ session_status'   = [session_status   EXCEPT ![sess] = "active"]
    /\ session_to_cred'  = [session_to_cred  EXCEPT ![sess] = cred]
    /\ cred_to_sessions' = [cred_to_sessions EXCEPT ![cred] = cred_to_sessions[cred] \cup {sess}]
    /\ log_sessions'     = log_sessions \cup {sess}
    /\ clock'            = clock + 1
    /\ UNCHANGED <<cred_status, map_write_failed, cascade_initiated, cascade_revoked>>

\* --- Action: LoginMapWriteFailure -------------------------------------------
\*
\* Models the step-5 map write failure edge case (login.md §Edge cases →
\* "Map write failure on step 5"). The session is issued and session_to_cred
\* is written (step 6 succeeds), but cred_to_sessions is NOT updated (step 5
\* fails). The caller receives outcome = success-with-map-failure. The audit
\* log entry is still written. The session is valid and usable.
\*
\* Consequence for Invariant 6: this session appears in session_to_cred but
\* not in cred_to_sessions. It is tracked in map_write_failed to exclude it
\* from the strict-inverse check. Consequence for the cascade: this session
\* is invisible to revoke_sessions_for_credential (it is not in
\* cred_to_sessions), so the cascade will not terminate it.
\*
LoginMapWriteFailure(cred, sess) ==
    /\ clock < MaxClock
    /\ cred_status[cred] = "active"
    /\ session_status[sess] = NULL
    /\ session_status'   = [session_status  EXCEPT ![sess] = "active"]
    /\ session_to_cred'  = [session_to_cred EXCEPT ![sess] = cred]
    /\ map_write_failed' = map_write_failed \cup {sess}
    /\ log_sessions'     = log_sessions \cup {sess}
    /\ clock'            = clock + 1
    /\ UNCHANGED <<cred_status, cred_to_sessions, cascade_initiated, cascade_revoked>>

\* --- Action: Logout ----------------------------------------------------------
\*
\* Models the logout happy path: terminates an active session by transitioning
\* its status to "logged_out". The session_to_cred entry is preserved
\* (immutable once written, per login.md §Invariant 3).
\*
\* FC1 note: this action may fire concurrently with
\* RevokeSessionsForCredential. If Logout fires on a session that is also in
\* the cascade's snapshot, the cascade finds that session already in a
\* terminal state and counts it as `skipped` (already-terminal path from FC1).
\* TLC exercises the interleaving: Logout(s) fires, then
\* RevokeSessionsForCredential(c) fires for the same session's credential.
\* Cascade_Completeness verifies the cascade still completes correctly.
\*
Logout(sess) ==
    /\ IsActiveSession(sess)
    /\ session_status' = [session_status EXCEPT ![sess] = "logged_out"]
    /\ UNCHANGED <<cred_status, session_to_cred, cred_to_sessions,
                   map_write_failed, log_sessions, cascade_initiated,
                   cascade_revoked, clock>>

\* --- Action: RevokeSessionsForCredential ------------------------------------
\*
\* Models revoke_sessions_for_credential (login.md §Composition logic and
\* §Action wiring).
\*
\* Step-by-step correspondence with login.md:
\*   (1) Credential.revoke — cred_status flips to "revoked".
\*   (2) Snapshot: active_snapshot := { s ∈ cred_to_sessions[cred] | active }
\*   (3) Audit Trail: cascade_initiated event written (logged in
\*       cascade_initiated set — the precondition for Cascade_Audit_Ordering).
\*   (5) For each s in snapshot:
\*         if session_status[s] ≠ "active": already-terminal → skip (FC1)
\*         else: Session.revoke → "revoked_by_cascade"
\*
\* Atomicity: all writes commit in a single TLA+ step. This models the
\* same-transactional-boundary discipline login.md §Edge cases requires.
\*
\* The FC1 TOCTOU race is captured by the interleaving model: TLC will
\* generate traces in which Logout fires on a session BEFORE this action
\* fires, leaving a "logged_out" session in the snapshot. The snapshot
\* filter (IsActiveSession) excludes already-terminal sessions, so they
\* are not added to cascade_revoked. Cascade_Completeness holds because
\* those sessions are already terminal — they satisfy IsTerminalSession
\* regardless of whether the cascade acted on them.
\*
RevokeSessionsForCredential(cred) ==
    /\ cred_status[cred] = "active"     \* not yet revoked
    /\ clock < MaxClock
    /\ LET active_snapshot == { s \in cred_to_sessions[cred] : IsActiveSession(s) }
       IN
         /\ cred_status'      = [cred_status EXCEPT ![cred] = "revoked"]
         /\ session_status'   =
              [s \in SessionTokens |->
                IF s \in active_snapshot
                THEN "revoked_by_cascade"
                ELSE session_status[s]]
         /\ cascade_initiated' = cascade_initiated \cup {cred}
         /\ cascade_revoked'   = cascade_revoked \cup active_snapshot
         /\ clock'             = clock + 1
    /\ UNCHANGED <<session_to_cred, cred_to_sessions, map_write_failed, log_sessions>>

\* --- Next --------------------------------------------------------------------

Next ==
    \/ \E cred \in CredentialIds, sess \in SessionTokens :
         Login(cred, sess)
    \/ \E cred \in CredentialIds, sess \in SessionTokens :
         LoginMapWriteFailure(cred, sess)
    \/ \E sess \in SessionTokens :
         Logout(sess)
    \/ \E cred \in CredentialIds :
         RevokeSessionsForCredential(cred)

Spec == Init /\ [][Next]_vars

\* =========================================================================
\* Named invariants from §Composition-level invariants.
\* Names match the spec's invariant names.
\* =========================================================================

\* Invariant 1 — Credential gates issuance (login.md §Invariant 1).
\* No session is issued without a prior Credential.verify = verified.
\* State-only proxy: every issued session token maps to a credential,
\* and every issued session has a log entry. The Login guard
\* (cred_status[cred] = "active") discharges the structural precondition;
\* TLC confirms no reachable state violates the proxy.
Credential_Gates_Issuance ==
    /\ \A s \in SessionTokens :
         IsIssuedSession(s) => session_to_cred[s] /= NULL
    /\ \A s \in SessionTokens :
         IsIssuedSession(s) => s \in log_sessions

\* Invariant 2 — Cascade completeness, snapshot-scoped (login.md §Invariant 2).
\* Every session the cascade acted on (cascade_revoked) is now terminal.
\* Sessions that were already terminal when the cascade took its snapshot
\* (FC1 TOCTOU race, already-terminal path) were never added to
\* cascade_revoked, so they satisfy the invariant vacuously. Sessions
\* created after the cascade fired cannot exist (Login's guard blocks on
\* a revoked credential), so the snapshot is exhaustive.
Cascade_Completeness ==
    \A s \in cascade_revoked : IsTerminalSession(s)

\* Invariant 2a — Cascade coverage over the cascade map (login.md §Invariant 2a).
\* For every credential whose cascade has been initiated, no session that
\* appears in cred_to_sessions remains active. Map-write-failure sessions
\* are excluded from cred_to_sessions, so this invariant speaks only to
\* sessions the cascade could have seen.
Cascade_Coverage ==
    \A c \in cascade_initiated :
        \A s \in cred_to_sessions[c] : IsTerminalSession(s)

\* Invariant 3 — Session-credential traceability (login.md §Invariant 3).
\* session_to_cred is immutable once written: every entry points to a real
\* credential. No action modifies a non-NULL session_to_cred slot — this
\* holds by inspection of Next. The state-level check confirms structural
\* soundness.
Session_Credential_Traceability ==
    \A s \in SessionTokens :
        session_to_cred[s] /= NULL => session_to_cred[s] \in CredentialIds

\* Invariant 4 — Login event log completeness (login.md §Invariant 4).
\* Every login call produces exactly one log entry. State-only proxy:
\* every issued session (session_status /= NULL) has a corresponding
\* entry in log_sessions. Both Login and LoginMapWriteFailure write to
\* log_sessions unconditionally, so the invariant holds by construction
\* and TLC confirms no reachable state violates it.
Login_Event_Log_Completeness ==
    \A s \in SessionTokens :
        IsIssuedSession(s) => s \in log_sessions

\* Invariant 5 — Cascade audit ordering (login.md §Invariant 5 proxy).
\* credential_revocation_cascade_initiated is recorded before any
\* session_revoked_by_cascade event for the same credential.
\* State-only proxy: for every session in cascade_revoked, the session's
\* credential appears in cascade_initiated. This holds by construction —
\* RevokeSessionsForCredential writes both cascade_initiated and
\* cascade_revoked in the same atomic step — and TLC confirms it.
Cascade_Audit_Ordering ==
    \A s \in cascade_revoked :
        session_to_cred[s] /= NULL =>
        session_to_cred[s] \in cascade_initiated

\* Invariant 6 — Map inverse consistency (login.md §Invariant 6).
\* credential_to_sessions and session_to_credential are strict inverses
\* under the write-both-or-neither discipline.
\*
\* Direction A: every session in cred_to_sessions[c] maps back to c in
\* session_to_cred. This is written atomically by Login.
\*
\* Direction B: every session in session_to_cred that is NOT in
\* map_write_failed also appears in cred_to_sessions for its credential.
\* Map-write-failure sessions (LoginMapWriteFailure) are explicitly
\* excluded: they appear in session_to_cred but not in cred_to_sessions.
\* The spec acknowledges this asymmetry; this invariant documents it.
Map_Inverse_Consistency ==
    /\ \A c \in CredentialIds, s \in SessionTokens :
         s \in cred_to_sessions[c] => session_to_cred[s] = c
    /\ \A s \in SessionTokens :
         (session_to_cred[s] /= NULL /\ s \notin map_write_failed) =>
         s \in cred_to_sessions[session_to_cred[s]]

\* --- Combined safety ---------------------------------------------------------

Safety ==
    /\ TypeOK
    /\ Credential_Gates_Issuance
    /\ Cascade_Completeness
    /\ Cascade_Coverage
    /\ Session_Credential_Traceability
    /\ Login_Event_Log_Completeness
    /\ Cascade_Audit_Ordering
    /\ Map_Inverse_Consistency

====
