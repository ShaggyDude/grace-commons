module session_gated_authorization

/*
 * Alloy model: Session-Gated Authorization
 * Corresponds to: compositions/session-gated-authorization.md
 * Status: initial — static structural model + dynamic trace model
 *
 * ---------------------------------------------------------------
 * HOW TO READ THIS FILE
 *
 * Alloy thinks in possible worlds. A world is one particular
 * assignment of atoms to sigs and relations. The Analyzer tries
 * every such assignment up to the scope you give it (e.g., "for 5"
 * means up to 5 atoms of each unscoped sig) and reports whether
 * your assertions ever fail.
 *
 * If a `check` comes back clean: no counterexample within scope.
 * That is strong evidence, not a proof. (For proofs: TLA+ or Coq/Lean.)
 * If a `check` finds a counterexample: a real world violates your
 * claim. Either the claim is wrong or a fact is missing.
 *
 * `run` asks for a satisfying instance — useful for sanity-checking
 * that your facts are not so tight they make everything impossible.
 *
 * ---------------------------------------------------------------
 * WHAT THIS MODEL COVERS
 *
 * 1. STATIC STRUCTURAL MODEL — valid system snapshots. Encodes
 *    the four application-level invariants as Alloy facts and
 *    checks. Deliberately omits Invariant 2 (principal binding)
 *    before one check to show the attack surface is structurally
 *    reachable without it; then adds the fact and shows the attack
 *    world becomes unreachable.
 *
 * 2. DYNAMIC TRACE MODEL (Alloy 6 LTL) — sequences of state
 *    transitions. Verifies the load-bearing temporal claims:
 *      T1. Revocation is terminal: once Revoked, always Revoked.
 *          No transition reactivates a revoked session.
 *      T2. Expiry is terminal: once Expired, always Expired.
 *      T3. Gate reflects current status: any check_permitted call
 *          record added in a given step carries an outcome
 *          consistent with the session's status at that step.
 *    T1 + T3 together prove the key security property: a session
 *    revoked at step T cannot produce Permitted or Denied at any
 *    step T' > T. The Beacon demo enforces this by re-reading the
 *    session row from SQLite on every request; this model verifies
 *    the spec-level property that makes the demo correct.
 *
 *    Fresh Dyn* sigs avoid perturbing the static model's facts.
 * ---------------------------------------------------------------
 */


-- ==============================================================
-- BASE TYPES
--
-- Opaque references — we care only about the relations between
-- them, not their internal content. Modeled as uninterpreted atoms.
-- ==============================================================

sig PrincipalRef {}  -- identity bound to a session or grant subject
sig ActionScope {}   -- permission scope (e.g., "enroll_subject")
sig SessionToken {}  -- opaque token a caller presents


-- ==============================================================
-- SESSION STATUS
--
-- Three-valued enum for the Session atom's state machine.
-- `abstract` means no atom is directly a SessionStatus — every
-- atom is one of the three concrete one-sigs.
-- `one sig` means exactly one atom of each kind exists.
--
-- NotKnown is not a session state; it is an outcome produced when
-- no session is found for a presented token. It lives in the
-- Outcome hierarchy below, not here.
-- ==============================================================

abstract sig SessionStatus {}
one sig Valid, Expired, Revoked extends SessionStatus {}


-- ==============================================================
-- GRANT STATUS
--
-- Two-valued enum. Active = a live grant. Inactive covers
-- revoked or any other non-active state.
-- ==============================================================

abstract sig GrantStatus {}
one sig Active, Inactive extends GrantStatus {}


-- ==============================================================
-- CHECK OUTCOME
--
-- The result-tag hierarchy for check_permitted, structured as
-- the spec requires. Invariant 3 (Denial is not rejection) depends
-- on Denied and RejectedSessionInvalid being structurally distinct
-- subtypes that share no atoms.
--
-- `abstract sig RejectedSessionInvalid extends Outcome {}` and
-- `one sig Denied extends Outcome {}` are disjoint by construction
-- — no atom can inhabit two disjoint extensions of the same
-- abstract sig.
-- ==============================================================

abstract sig Outcome {}
one sig Permitted, Denied extends Outcome {}
abstract sig RejectedSessionInvalid extends Outcome {}
one sig RejectedExpired, RejectedRevoked, RejectedNotKnown
    extends RejectedSessionInvalid {}
one sig RejectedInvalidRequest extends Outcome {}


-- ==============================================================
-- ATOM: SESSION
--
-- One token (caller-facing opaque identifier), one principal
-- (the identity the session was issued for), one status.
-- ==============================================================

sig Session {
    token     : one SessionToken,
    principal : one PrincipalRef,
    status    : one SessionStatus
}


-- ==============================================================
-- ATOM: PERMISSIONS — the grant store
--
-- One grant = one subject + one scope + one status.
-- Default-deny: absence of an Active grant for (subject, scope)
-- always produces Denied, never Permitted.
-- ==============================================================

sig Grant {
    subject : one PrincipalRef,
    scope   : one ActionScope,
    status  : one GrantStatus
}


-- ==============================================================
-- THE COMPOSITION: CHECK_PERMITTED_CALL
--
-- Represents one invocation of check_permitted. Fields:
--
--   presented_token  — opaque token the caller supplies.
--   action_scope     — permission scope the caller requests.
--   resolved_session — Session found for presented_token; `lone`
--                      = zero or one. Absent when token not-known.
--   gate_principal   — PrincipalRef passed to Permissions.permitted;
--                      `lone` = zero or one. Absent when gate
--                      did not clear.
--   outcome          — the final result of the call.
--
-- gate_principal is a free field here — no binding to
-- resolved_session.principal is imposed by the sig declaration.
-- Invariant 2 (principal binding) is a separate fact added later.
-- The DOCUMENTATION block below names the attack surface that
-- the fact closes; an executable demonstration check was tried
-- and dropped in Round 6 (Alloy facts are file-global, see
-- R5F1 in compositions/session-gated-authorization.md).
-- ==============================================================

sig CheckPermittedCall {
    presented_token  : one SessionToken,
    action_scope     : one ActionScope,
    resolved_session : lone Session,
    gate_principal   : lone PrincipalRef,
    outcome          : one Outcome
}


-- ==============================================================
-- INFRASTRUCTURE: Token uniqueness
--
-- Each session token identifies at most one session. Without this,
-- a presented_token could resolve to multiple sessions and the
-- gate semantics would be undefined.
-- ==============================================================

fact Token_Uniqueness {
    all s1, s2 : Session | s1.token = s2.token implies s1 = s2
}


-- ==============================================================
-- INFRASTRUCTURE: Token resolution coherence
--
-- If a call resolved a session, that session's token must equal
-- the presented_token. A call with no resolved_session means the
-- token was not-known (no session exists for it in the store).
-- ==============================================================

fact Token_Resolution_Coherence {
    all c : CheckPermittedCall |
        some c.resolved_session implies
            c.resolved_session.token = c.presented_token
}


-- ==============================================================
-- INVARIANT 1 — Session gates authorization
--
-- No call to Permissions.permitted is made unless Session.validate
-- first returns valid(principal_ref, expires_at). Operationally:
--   - gate_principal is populated (some) only when gate clears.
--   - Gate clears only when resolved_session.status = Valid.
--   - Any other outcome — expired, revoked, not-known — means
--     gate_principal is absent (none).
-- ==============================================================

fact Invariant1_Session_Gates_Authorization {
    all c : CheckPermittedCall | {
        -- Gate cleared: outcome is Permitted or Denied
        (c.outcome in (Permitted + Denied)) implies
            (some c.resolved_session and
             c.resolved_session.status = Valid and
             some c.gate_principal)

        -- Gate blocked: no principal reached Permissions
        (c.outcome in RejectedSessionInvalid) implies
            no c.gate_principal

        -- Invalid-request: no resolution attempted
        c.outcome = RejectedInvalidRequest implies
            (no c.resolved_session and no c.gate_principal)
    }
}


-- ==============================================================
-- OUTCOME COHERENCE
--
-- Binds the specific session-invalid rejection variant to the
-- session's actual status. Not a named application-level invariant
-- in the spec; an implementation-fidelity constraint that keeps
-- the model consistent with the spec's action wiring.
-- ==============================================================

fact Outcome_Coherence {
    all c : CheckPermittedCall | {
        (some c.resolved_session and c.resolved_session.status = Expired)
            implies c.outcome = RejectedExpired

        (some c.resolved_session and c.resolved_session.status = Revoked)
            implies c.outcome = RejectedRevoked

        -- No resolved session + not an invalid-request → not-known
        (no c.resolved_session and
         c.outcome not in (RejectedInvalidRequest + Permitted + Denied))
            implies c.outcome = RejectedNotKnown
    }
}


-- ==============================================================
-- DOCUMENTATION: Principal-binding attack surface (no executable
-- demonstration check in this single-file model; see Round 6 below)
--
-- Invariant 2 (principal binding) says gate_principal must equal
-- the principal extracted from resolved_session — never a value
-- separately supplied by the caller. Without Invariant 2 a non-
-- conforming implementation could call
-- Permissions.permitted(caller_ref, scope) instead of
-- Permissions.permitted(session.principal, scope), letting a
-- caller probe any principal's grants regardless of which
-- principal the session was issued for. That is the
-- authorization-bypass attack the invariant closes.
--
-- The original model staged an "EXPECTED: COUNTEREXAMPLE FOUND"
-- check here to demonstrate the attack surface before adding
-- `fact Invariant2_Principal_Binding`. Round 6 (2026-05-23)
-- dropped that check: Alloy facts are file-global, so the later
-- fact gates every check in the file regardless of textual
-- order, and the "without" framing collapses to the same
-- proposition as Principal_Binding_Holds below. The attack
-- surface is preserved as documentation here; an executable
-- demonstration would require splitting the model into two .als
-- files (one without, one with the invariant), which is deferred
-- as not worth the cost-benefit for one structurally redundant
-- check. See compositions/session-gated-authorization.md
-- §Round 5 R5F1.
-- ==============================================================


-- ==============================================================
-- INVARIANT 2 — Principal binding
--
-- The gate_principal passed to Permissions.permitted is always
-- the principal_ref extracted from the validated session — never
-- a value the caller supplies independently.
--
-- With this fact, the principal-binding attack surface documented
-- above is structurally unreachable: Principal_Binding_Holds
-- (the check below this fact) discharges clean. The original
-- "Without_Invariant2" check was removed in Round 6 — see
-- compositions/session-gated-authorization.md §Round 5 R5F1.
-- ==============================================================

fact Invariant2_Principal_Binding {
    all c : CheckPermittedCall |
        (some c.resolved_session and some c.gate_principal) implies
            c.gate_principal = c.resolved_session.principal
}


-- ==============================================================
-- CHECK: Principal binding holds with Invariant 2
-- EXPECTED: CLEAN
-- ==============================================================

assert Principal_Binding_Holds {
    all c : CheckPermittedCall |
        (some c.resolved_session and some c.gate_principal) implies
            c.gate_principal = c.resolved_session.principal
}

check Principal_Binding_Holds for 5


-- ==============================================================
-- INVARIANT 4 — Default deny
--
-- Permitted only when an Active grant exists for
-- (gate_principal, action_scope). The absence of a matching
-- Active grant always produces Denied. Session validity is
-- necessary but not sufficient for access.
-- ==============================================================

fact Invariant4_Default_Deny {
    all c : CheckPermittedCall | {
        c.outcome = Permitted implies
            some g : Grant |
                g.subject = c.gate_principal and
                g.scope   = c.action_scope   and
                g.status  = Active

        c.outcome = Denied implies {
            some c.gate_principal   -- gate cleared
            no g : Grant |
                g.subject = c.gate_principal and
                g.scope   = c.action_scope   and
                g.status  = Active
        }
    }
}


-- ==============================================================
-- CHECK: Valid session with no matching grant produces Denied
-- EXPECTED: CLEAN
--
-- Session validity is necessary but not sufficient for access.
-- A valid session with no active grant returns Denied, not
-- Permitted. The permission check completed; the answer is no.
-- ==============================================================

assert Valid_Session_No_Grant_Is_Denied {
    all c : CheckPermittedCall |
        (some c.resolved_session and
         c.resolved_session.status = Valid and
         no g : Grant |
             g.subject = c.gate_principal and
             g.scope   = c.action_scope   and
             g.status  = Active)
        implies c.outcome != Permitted
}

check Valid_Session_No_Grant_Is_Denied for 5


-- ==============================================================
-- CHECK: Revoked session cannot authorize
-- EXPECTED: CLEAN
--
-- The gate blocks for a Revoked session before Permissions is
-- consulted. This is the key revocation-enforcement property.
-- ==============================================================

assert Revoked_Session_Cannot_Authorize {
    all c : CheckPermittedCall |
        (some c.resolved_session and c.resolved_session.status = Revoked)
        implies c.outcome = RejectedRevoked
}

check Revoked_Session_Cannot_Authorize for 5


-- ==============================================================
-- CHECK: Expired session cannot authorize
-- EXPECTED: CLEAN
-- ==============================================================

assert Expired_Session_Cannot_Authorize {
    all c : CheckPermittedCall |
        (some c.resolved_session and c.resolved_session.status = Expired)
        implies c.outcome = RejectedExpired
}

check Expired_Session_Cannot_Authorize for 5


-- ==============================================================
-- CHECK: Invariant 3 — Denial is not rejection (structural)
-- EXPECTED: CLEAN
--
-- Denied and RejectedSessionInvalid are structurally distinct
-- sig subtypes. No atom can simultaneously inhabit both. A caller
-- receiving Denied knows the gate cleared and Permissions evaluated
-- the query; a caller receiving a session-invalid rejection knows
-- the gate did not clear and Permissions was never reached. The
-- two outcomes carry different security meanings and the type
-- hierarchy enforces that they cannot be conflated.
-- ==============================================================

assert Denial_Is_Not_Rejection {
    no (Denied & RejectedSessionInvalid)
}

check Denial_Is_Not_Rejection for 5


-- ==============================================================
-- RUN: A world with a Permitted outcome
--
-- Existence witness: confirms all facts together allow at least
-- one world with a Permitted result. If this run finds no instance,
-- the facts are over-constrained (contradictory).
-- ==============================================================

pred has_permitted_call {
    some c : CheckPermittedCall | c.outcome = Permitted
}

run has_permitted_call for 4


-- ==============================================================
-- RUN: A world where the gate blocks on a Revoked session
-- ==============================================================

pred has_revoked_rejection {
    some c : CheckPermittedCall | c.outcome = RejectedRevoked
}

run has_revoked_rejection for 4


-- ==============================================================
-- RUN: Same principal — one scope granted, one not
--
-- Shows Permitted and Denied for the same principal under different
-- scopes in the same snapshot. The gate cleared for both calls
-- (same valid session); the grant store differs per scope.
-- ==============================================================

pred has_same_principal_mixed_outcomes {
    some disj c1, c2 : CheckPermittedCall |
        c1.outcome = Permitted and
        c2.outcome = Denied and
        c1.gate_principal = c2.gate_principal
}

run has_same_principal_mixed_outcomes for 5


-- ==============================================================
-- DYNAMIC TRACE MODEL
--
-- The static model checks invariants over individual snapshots.
-- It cannot verify temporal claims — properties that must hold
-- across state transitions and over time.
--
-- The critical temporal claim from the spec:
--   Once a session is revoked, no subsequent check_permitted
--   call for that session's token can return Permitted or Denied.
--
-- This breaks into two sub-claims:
--   T1. Revocation is terminal: status = Revoked → always Revoked.
--   T2. Expiry is terminal: status = Expired → always Expired.
--   T3. Gate reflects current status: any call record added in a
--       step where the presented token's session is Revoked carries
--       outcome = RejectedRevoked (and Expired → RejectedExpired).
--
-- T1 + T3 together prove the post-revocation authorization
-- impossibility property:
--   - T1: the session is still Revoked at every future step.
--   - T3: any call at a future step reflects that Revoked status.
--   ∴ no future call for that token returns Permitted or Denied.
--
-- Fresh Dyn* sigs avoid perturbing the static model's facts.
-- ==============================================================


-- ==============================================================
-- DYNAMIC SESSION
--
-- dyn_token and dyn_principal are immutable: a session's identity
-- does not change after issuance. dyn_status is var: it can
-- transition Valid → Revoked or Valid → Expired, but never back.
-- ==============================================================

sig DynSession {
    dyn_token     : one SessionToken,
    dyn_principal : one PrincipalRef,
    var dyn_status : one SessionStatus
}


-- ==============================================================
-- DYNAMIC GRANT
--
-- dyn_subject and dyn_scope are immutable. dyn_grant_status is
-- var to match the spec's grant state machine; the happy-path
-- trace below does not exercise grant revocation, but the field
-- is mutable so failure-path extensions can add it later.
-- ==============================================================

sig DynGrant {
    dyn_subject      : one PrincipalRef,
    dyn_scope        : one ActionScope,
    var dyn_grant_status : one GrantStatus
}


-- ==============================================================
-- CALL RECORD
--
-- Each check_permitted call emits one DynCallRecord. Fields are
-- immutable once created; the call log (in DynSystem) grows
-- by one record per call transition and never shrinks.
-- ==============================================================

sig DynCallRecord {
    rec_token   : one SessionToken,
    rec_scope   : one ActionScope,
    rec_outcome : one Outcome
}


-- ==============================================================
-- DYNAMIC SYSTEM
--
-- A single shared call log that accumulates DynCallRecord atoms
-- as check_permitted transitions fire. Sessions and grants are
-- accessed directly via DynSession and DynGrant; DynSystem exists
-- solely to hold the var call-log relation.
-- ==============================================================

one sig DynSystem {
    var dyn_call_log : set DynCallRecord
}


-- ==============================================================
-- DYNAMIC TOKEN UNIQUENESS
--
-- Each DynSession has a distinct token. Required so a presented
-- token resolves to at most one session in dyn_check_permitted.
-- ==============================================================

fact Dyn_Token_Uniqueness {
    all s1, s2 : DynSession |
        s1.dyn_token = s2.dyn_token implies s1 = s2
}


-- ==============================================================
-- INITIAL STATE
--
-- Empty call log; all sessions Valid; all grants Active.
-- The trace exercises the system from a clean initial state.
-- ==============================================================

pred dyn_init {
    no DynSystem.dyn_call_log
    all s : DynSession | s.dyn_status = Valid
    all g : DynGrant   | g.dyn_grant_status = Active
}


-- ==============================================================
-- TRANSITIONS
-- ==============================================================

-- Stutter: no state change. Required so the system can "wait"
-- between meaningful transitions without violating the trace fact.
pred dyn_stutter {
    all s : DynSession | s.dyn_status' = s.dyn_status
    all g : DynGrant   | g.dyn_grant_status' = g.dyn_grant_status
    DynSystem.dyn_call_log' = DynSystem.dyn_call_log
}


-- Revoke a session: Valid → Revoked.
-- Mirrors Session.revoke from the spec. All other sessions,
-- all grants, and the call log are unchanged (frame conditions).
pred dyn_revoke_session [s : DynSession] {
    -- Precondition: the session is currently Valid
    s.dyn_status = Valid

    -- Postcondition: now Revoked
    s.dyn_status' = Revoked

    -- Frame: other sessions unchanged
    all other : DynSession - s | other.dyn_status' = other.dyn_status

    -- Frame: grants unchanged
    all g : DynGrant | g.dyn_grant_status' = g.dyn_grant_status

    -- Frame: call log unchanged (revocation is not a check_permitted call)
    DynSystem.dyn_call_log' = DynSystem.dyn_call_log
}


-- Expire a session: Valid → Expired.
-- Represents the passage of time past a session's expires_at.
-- Same frame conditions as dyn_revoke_session.
pred dyn_expire_session [s : DynSession] {
    s.dyn_status = Valid
    s.dyn_status' = Expired

    all other : DynSession - s | other.dyn_status' = other.dyn_status
    all g : DynGrant | g.dyn_grant_status' = g.dyn_grant_status
    DynSystem.dyn_call_log' = DynSystem.dyn_call_log
}


-- check_permitted call: derive the outcome from current state
-- and append one DynCallRecord to the log.
--
-- Mirrors the spec's two-step wiring exactly:
--   Step 1 — gate: look up the session for tok; check its status.
--   Step 2 — query: if gate cleared, call Permissions.permitted
--                   using the session's own principal (never tok's
--                   caller — principal binding is implicit here).
--
-- Parameters:
--   tok — session token presented by the caller
--   scp — action scope being checked
--   rec — a fresh DynCallRecord atom to append to the log
pred dyn_check_permitted [tok : SessionToken, scp : ActionScope, rec : DynCallRecord] {
    -- rec must be fresh
    rec not in DynSystem.dyn_call_log

    -- rec fields match the call parameters
    rec.rec_token = tok
    rec.rec_scope = scp

    -- Outcome derived from current state
    let resolved = { s : DynSession | s.dyn_token = tok } | {

        -- Token not in the session store → RejectedNotKnown
        (no resolved) implies rec.rec_outcome = RejectedNotKnown

        -- Expired session → RejectedExpired (gate blocks)
        (one resolved and resolved.dyn_status = Expired) implies
            rec.rec_outcome = RejectedExpired

        -- Revoked session → RejectedRevoked (gate blocks)
        (one resolved and resolved.dyn_status = Revoked) implies
            rec.rec_outcome = RejectedRevoked

        -- Valid session + Active grant for (principal, scope) → Permitted
        (one resolved and resolved.dyn_status = Valid and
         some g : DynGrant |
             g.dyn_subject = resolved.dyn_principal and
             g.dyn_scope   = scp and
             g.dyn_grant_status = Active)
        implies rec.rec_outcome = Permitted

        -- Valid session + no Active grant → Denied
        (one resolved and resolved.dyn_status = Valid and
         no g : DynGrant |
             g.dyn_subject = resolved.dyn_principal and
             g.dyn_scope   = scp and
             g.dyn_grant_status = Active)
        implies rec.rec_outcome = Denied
    }

    -- Frame: session statuses unchanged by a call
    all s : DynSession | s.dyn_status' = s.dyn_status

    -- Frame: grant statuses unchanged by a call
    all g : DynGrant | g.dyn_grant_status' = g.dyn_grant_status

    -- Call log grows by exactly one record (append-only)
    DynSystem.dyn_call_log' = DynSystem.dyn_call_log + rec
}


-- ==============================================================
-- TRACE FACT
--
-- The system starts in dyn_init. Every step is one of the named
-- transitions. `always` in a fact context constrains every state
-- transition along every valid trace.
-- ==============================================================

fact dyn_trace {
    dyn_init
    always (
        dyn_stutter or
        (some s : DynSession | dyn_revoke_session[s]) or
        (some s : DynSession | dyn_expire_session[s]) or
        (some tok : SessionToken, scp : ActionScope, rec : DynCallRecord |
            dyn_check_permitted[tok, scp, rec])
    )
}


-- ==============================================================
-- LTL ASSERTIONS
-- ==============================================================

-- T1: Revocation is terminal.
-- Once a session's dyn_status is Revoked, it remains Revoked in
-- every future state. No transition (stutter, expire, or call)
-- transitions a Revoked session to any other status.
-- Expected result: CLEAN.
assert Dyn_Revocation_Terminal {
    always (all s : DynSession |
        s.dyn_status = Revoked implies
            always (s.dyn_status = Revoked))
}
check Dyn_Revocation_Terminal for 3 but 1..8 steps


-- T2: Expiry is terminal.
-- Once Expired, always Expired. Structurally identical to T1.
-- Expected result: CLEAN.
assert Dyn_Expiry_Terminal {
    always (all s : DynSession |
        s.dyn_status = Expired implies
            always (s.dyn_status = Expired))
}
check Dyn_Expiry_Terminal for 3 but 1..8 steps


-- T3: Gate reflects current status.
--
-- `DynSystem.dyn_call_log' - DynSystem.dyn_call_log` is the set
-- of records newly added in the NEXT step. In stutter, revoke,
-- and expire steps this difference is empty and the assertion is
-- vacuously satisfied. In a call step exactly one record is added;
-- the assertion checks that record's outcome against the current
-- session status.
--
-- For a session currently Revoked: outcome must be RejectedRevoked.
-- For a session currently Expired: outcome must be RejectedExpired.
-- (Valid session outcomes — Permitted or Denied — are correct by
-- the grant-store logic in dyn_check_permitted and are verified
-- by the existence runs below rather than as safety assertions.)
--
-- T1 + T3 → post-revocation authorization is impossible:
--   T1 ensures the session is still Revoked at every future step.
--   T3 ensures any call at a future step reflects that status.
--   Therefore no future call for that token returns Permitted or Denied.
--
-- Expected result: CLEAN.
assert Dyn_Gate_Reflects_Current_Status {
    always (
        all rec : (DynSystem.dyn_call_log' - DynSystem.dyn_call_log) |
        all s : DynSession |
            s.dyn_token = rec.rec_token implies (
                (s.dyn_status = Revoked implies rec.rec_outcome = RejectedRevoked) and
                (s.dyn_status = Expired implies rec.rec_outcome = RejectedExpired)
            )
    )
}
check Dyn_Gate_Reflects_Current_Status for 3 but 1..8 steps


-- ==============================================================
-- RUN: A trace that includes a revocation
--
-- Existence witness: confirms the trace fact is satisfiable and
-- allows a session to be revoked. If no instance is found, the
-- trace fact is over-constrained.
-- ==============================================================

pred dyn_trace_with_revocation {
    eventually (some s : DynSession | s.dyn_status = Revoked)
}

run dyn_trace_with_revocation for 3 but 1..6 steps


-- ==============================================================
-- RUN: A trace with a Permitted call followed by session revocation
--
-- Shows the realistic lifecycle: a call succeeds (Permitted) while
-- the session is Valid, then later the session is revoked.
-- Confirms the model can represent this sequence without
-- contradiction, and that a Permitted record in the log does not
-- prevent subsequent revocation.
-- ==============================================================

pred dyn_trace_permitted_then_revoked {
    -- Round 6 fix (R5F2, 2026-05-23): wrap the first conjunct in
    -- `eventually`. The original predicate evaluated the first
    -- conjunct at the initial state, where dyn_init requires
    -- `no DynSystem.dyn_call_log` — so the conjunction was
    -- structurally unsatisfiable at step 0 and Alloy reported the
    -- predicate as inconsistent. Both conjuncts now express
    -- temporal-existence claims, which is what the predicate's
    -- prose intent ("a Permitted call followed by a Revocation")
    -- actually requires. See compositions/session-gated-authorization.md
    -- §Round 5 R5F2.
    eventually (some rec : DynCallRecord |
        rec in DynSystem.dyn_call_log and
        rec.rec_outcome = Permitted)
    and
    eventually (some s : DynSession | s.dyn_status = Revoked)
}

run dyn_trace_permitted_then_revoked for 3 but 1..8 steps
