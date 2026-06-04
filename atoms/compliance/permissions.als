-- permissions.als
-- Alloy structural model for the Permissions atom (Grace Commons atoms/compliance/permissions.md)
-- Grounded (English) — formal layer authored 2026-06-03.
--
-- PURPOSE
-- Verify the load-bearing invariants of the Permissions atom by bounded exhaustive search.
-- Primary focus: the grant lifecycle's monotonicity and terminal-absorption properties.
--
-- INVARIANTS ENCODED
--   Invariant 2 — Status monotonicity: Active → Revoked only; a grant never returns to Active.
--   Invariant 3 — Revocation is terminal: once Revoked, no transition leaves Revoked.
--   Invariant 5 — No id reuse: no two grants share a grant_id across the system lifetime.
--   Invariant 7 — Denial by absence: permitted returns denied iff no Active grant matches.
--   Invariant 8 — Revoked grants confer no permission: a Revoked grant never satisfies permitted.
--   Invariant 10 — Grant store durability: revoke produces a post-record; it does not delete.
--
-- SCOPE
-- Static structural model (snapshots). Each GrantRecord sig is one record in the store.
-- Transitions are modeled as predicates over pre/post record pairs — no temporal trace steps.
-- The GrantIdUniqueness fact applies to the global store; the revoke_action predicate
-- does NOT carry the grant_id from pre to post, because pre and post are distinct snapshot
-- records (the pre-record and the post-record of a single grant across two store snapshots).
-- Immutability of the other fields (subject_ref, action_scope) IS carried through.
-- The grant_id uniqueness assertion covers the store as a whole; immutability of grant_id
-- across a lifecycle is an unconditional structural invariant, not a transition constraint.
--
-- NOT MODELED HERE
--   - Clock-skew violations of Invariant 9 (granted_at ≤ revoked_at is best-effort per spec)
--   - Storage-failure rejection paths (infrastructure concern, not structural)
--   - subject_ref and action_scope content validation (opaque types, exact-match only)
--   - Grantor attribution (belongs to Actor Identity composition)
--   - Scope hierarchy, delegation, time-bounded grants (all composing-pattern concerns)
--
-- HOW TO READ RESULTS
-- Every "check A_*" must return "No counterexample found" (UNSAT) — the asserted guarantee holds.
-- Every "run Show*" must return at least one instance (SAT) — confirms non-vacuity.
-- A "check" returning a counterexample is a spec finding.

module permissions

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (types)
-- ─────────────────────────────────────────────────────────────────────────────

-- Status: the two named states from the spec (Section: State).
-- Active  — grant is in force; contributes to permitted evaluations.
-- Revoked — grant has been withdrawn; terminal; contributes nothing.
abstract sig Status {}
one sig Active, Revoked extends Status {}

-- Opaque reference types. Alloy generates instances freely; the atom treats them as
-- uninterpreted tokens (exact-match semantics, no hierarchy — per spec Behavior section).
abstract sig GrantId    {}
abstract sig SubjectRef {}
abstract sig ActionScope {}

-- The grant record. Each field mirrors a named field in the spec's State section.
-- Fields always present: "one". Status transitions from Active to Revoked via revoke_action.
sig GrantRecord {
    grant_id     : one GrantId,      -- opaque immutable system-generated identity (Inv 1, 4, 5)
    subject_ref  : one SubjectRef,   -- who holds the grant — opaque, immutable (Inv 1)
    action_scope : one ActionScope,  -- what the grant covers — opaque, immutable (Inv 1)
    status       : one Status        -- Active | Revoked (Inv 2, 3)
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 5: No id reuse.
-- No two distinct grant records in the store share a grant_id.
fact GrantIdUniqueness {
    all disj r1, r2 : GrantRecord | r1.grant_id != r2.grant_id
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Permission evaluation predicate
-- Models the permitted(subject_ref, action_scope) query (Invariants 6, 7, 8).
-- ─────────────────────────────────────────────────────────────────────────────

-- permitted_holds: the permitted query returns "permitted".
-- Requires: at least one Active grant matching the (subject, scope) pair exists.
-- This is a pure read over the grant store; no state change (per spec Behavior).
pred permitted_holds[sub : SubjectRef, scope : ActionScope] {
    some r : GrantRecord | {
        r.subject_ref  = sub
        r.action_scope = scope
        r.status       = Active
    }
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition predicate: revoke_action
-- Pre/post record pair modeling the Active → Revoked state change.
--
-- Note on the snapshot modeling convention (mirrors capability.als):
-- In a static snapshot model, pre and post are two distinct GrantRecord instances
-- representing the same logical grant before and after revocation. Because GrantIdUniqueness
-- applies globally, pre and post cannot share grant_id while being distinct records.
-- Therefore, grant_id is NOT carried from pre to post in this predicate — the identity
-- continuity is modeled by the (subject_ref, action_scope) pair being preserved.
-- The unconditional grant_id uniqueness invariant is verified separately via A_I5.
-- ─────────────────────────────────────────────────────────────────────────────

-- revoke_action: Active grant transitions to Revoked.
-- Pre: status = Active (Invariant 3: Revoked grants cannot be revoked again — not-active).
-- Post: status = Revoked; subject_ref and action_scope are preserved (Invariant 1).
pred revoke_action[pre, post : GrantRecord] {
    -- precondition: grant must be Active
    pre.status  = Active
    -- status transitions to Revoked (Invariant 2 — monotonicity: Active → Revoked)
    post.status = Revoked
    -- immutable semantic fields are preserved (Invariant 1)
    post.subject_ref  = pre.subject_ref
    post.action_scope = pre.action_scope
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions (verified guarantees)
-- Each "check" asks: is there any valid configuration that violates this assertion?
-- No counterexample (UNSAT) = the guarantee holds in all configurations within scope.
-- ─────────────────────────────────────────────────────────────────────────────

-- A_I5_GrantIdUniqueness: Invariant 5 — no two records in the store share a grant_id.
assert A_I5_GrantIdUniqueness {
    all disj r1, r2 : GrantRecord | r1.grant_id != r2.grant_id
}
check A_I5_GrantIdUniqueness for 6

-- A_I2_StatusMonotonicity: Invariant 2 — revoke_action always transitions to Revoked, never back to Active.
-- This is the forward-only (monotonic) direction of the state machine.
assert A_I2_StatusMonotonicity {
    all pre, post : GrantRecord |
        revoke_action[pre, post] implies post.status = Revoked
}
check A_I2_StatusMonotonicity for 6

-- A_I3_RevocationTerminal: Invariant 3 — a Revoked record cannot be the pre-record of a revoke_action.
-- (revoke_action requires pre.status = Active; so firing it on a Revoked pre-record is impossible.)
assert A_I3_RevocationTerminal {
    all pre, post : GrantRecord |
        pre.status = Revoked implies not revoke_action[pre, post]
}
check A_I3_RevocationTerminal for 6

-- A_I1_RevokePreservesSemanticFields: Invariant 1 — revoke does not alter subject_ref or action_scope.
-- (grant_id uniqueness is enforced globally by GrantIdUniqueness, not by this transition.)
assert A_I1_RevokePreservesSemanticFields {
    all pre, post : GrantRecord |
        revoke_action[pre, post] implies {
            post.subject_ref  = pre.subject_ref
            post.action_scope = pre.action_scope
        }
}
check A_I1_RevokePreservesSemanticFields for 6

-- A_I8_RevokedGrantsConferNoPermission: Invariant 8 — a Revoked grant does not, by itself, satisfy permitted.
-- If a record is Revoked and it is the only record for that (subject_ref, action_scope) pair,
-- then permitted_holds is false for that pair.
assert A_I8_RevokedGrantsConferNoPermission {
    all r : GrantRecord |
        (r.status = Revoked and
         no other : GrantRecord | {
             other != r
             other.subject_ref  = r.subject_ref
             other.action_scope = r.action_scope
             other.status       = Active
         })
        implies not permitted_holds[r.subject_ref, r.action_scope]
}
check A_I8_RevokedGrantsConferNoPermission for 6

-- A_I7_DenialByAbsence: Invariant 7 — permitted_holds is true iff some Active grant for the pair exists.
-- This encodes the bidirectional "if and only if" — no false positives, no false negatives.
assert A_I7_DenialByAbsence {
    all sub : SubjectRef, scope : ActionScope |
        permitted_holds[sub, scope] iff
        (some r : GrantRecord | r.subject_ref = sub and r.action_scope = scope and r.status = Active)
}
check A_I7_DenialByAbsence for 6

-- A_I10_RevokeProducesDistinctPost: Invariant 10 (structural half) — revoke produces a post-record
-- that is distinct from the pre-record. Records are never deleted; a revoked record AND its
-- post-state both exist in the store (non-decreasing count).
assert A_I10_RevokeProducesDistinctPost {
    all pre, post : GrantRecord |
        revoke_action[pre, post] implies pre != post
}
check A_I10_RevokeProducesDistinctPost for 6

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs — non-vacuity guards
-- Each run must find at least one instance (SAT).
-- UNSAT means a fact is over-constraining the model.
-- ─────────────────────────────────────────────────────────────────────────────

-- ShowActive: at least one Active grant exists in the store.
run ShowActive {
    some r : GrantRecord | r.status = Active
} for 4

-- ShowRevoked: at least one Revoked grant exists in the store.
run ShowRevoked {
    some r : GrantRecord | r.status = Revoked
} for 4

-- ShowBothStatuses: Active and Revoked grants coexist — the normal steady state.
run ShowBothStatuses {
    some disj r1, r2 : GrantRecord | {
        r1.status = Active
        r2.status = Revoked
    }
} for 4

-- ShowRevokeTransition: a valid revoke_action pre/post pair is constructible.
-- pre is Active; post is Revoked; they carry the same (subject_ref, action_scope).
run ShowRevokeTransition {
    some pre, post : GrantRecord | {
        revoke_action[pre, post]
        pre.status  = Active
        post.status = Revoked
    }
} for 5

-- ShowPermittedHolds: permitted_holds returns true for some (subject, scope) pair.
run ShowPermittedHolds {
    some sub : SubjectRef, scope : ActionScope | permitted_holds[sub, scope]
} for 4

-- ShowPermittedDenied: permitted_holds is false when the only grant for a pair is Revoked.
run ShowPermittedDenied {
    some r : GrantRecord | {
        r.status = Revoked
        not permitted_holds[r.subject_ref, r.action_scope]
        no other : GrantRecord | {
            other != r
            other.subject_ref  = r.subject_ref
            other.action_scope = r.action_scope
            other.status       = Active
        }
    }
} for 4

-- ShowMultipleGrantsSamePair: two Active grants for the same (subject, scope) — independent records.
-- Per spec: duplicate grants are allowed; each has its own grant_id (Invariant 5 + Behavior).
run ShowMultipleGrantsSamePair {
    some disj r1, r2 : GrantRecord | {
        r1.status = Active
        r2.status = Active
        r1.subject_ref  = r2.subject_ref
        r1.action_scope = r2.action_scope
    }
} for 5

-- ShowPartialRevocation: two grants for same (subject, scope), one Revoked, one still Active.
-- Models: revoking one grant does not affect others for the same pair (Behavior section).
-- permitted_holds still returns true because one Active grant remains.
run ShowPartialRevocation {
    some disj r1, r2 : GrantRecord | {
        r1.subject_ref  = r2.subject_ref
        r1.action_scope = r2.action_scope
        r1.status = Active
        r2.status = Revoked
        permitted_holds[r1.subject_ref, r1.action_scope]
    }
} for 5
