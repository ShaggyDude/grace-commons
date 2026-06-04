-- permissions-buggy.als
-- DELIBERATELY BROKEN twin of permissions.als.
-- Grace Commons atoms/compliance/permissions.md — formal layer verification aid.
--
-- WHAT IS BROKEN
-- The revoke_action predicate no longer enforces that its precondition requires Active status.
-- Specifically, the line "pre.status = Active" has been REMOVED from revoke_action.
-- This breaks Invariant 2 (Status monotonicity) and Invariant 3 (Revocation is terminal):
-- a Revoked grant can now be the pre-record of a revoke_action, meaning a Revoked grant
-- could transition to a post-record that is also Revoked — but crucially, the precondition
-- guard that PREVENTS revoking an already-Revoked grant is gone.
-- Combined with the absence of the pre.status = Active guard, Alloy can now construct
-- a configuration where revoke_action fires on a Revoked pre-record.
--
-- EXPECTED HARNESS BEHAVIOUR (run with --buggy flag)
-- The following check is expected to find a COUNTEREXAMPLE (return SAT):
--   check A_I3_RevocationTerminal
-- This assert states: a Revoked pre-record cannot be the pre of a revoke_action.
-- With the precondition guard removed, Alloy finds a configuration where
-- pre.status = Revoked and revoke_action[pre, post] both hold — counterexample found.
--
-- ALL OTHER checks and runs are structurally identical to permissions.als.
-- The harness --buggy flag PASSes when at least one check finds a counterexample.

module permissions_buggy

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (identical to permissions.als)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig Status {}
one sig Active, Revoked extends Status {}

abstract sig GrantId    {}
abstract sig SubjectRef {}
abstract sig ActionScope {}

sig GrantRecord {
    grant_id     : one GrantId,
    subject_ref  : one SubjectRef,
    action_scope : one ActionScope,
    status       : one Status
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts (identical to permissions.als)
-- ─────────────────────────────────────────────────────────────────────────────

fact GrantIdUniqueness {
    all disj r1, r2 : GrantRecord | r1.grant_id != r2.grant_id
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Permission evaluation predicate (identical to permissions.als)
-- ─────────────────────────────────────────────────────────────────────────────

pred permitted_holds[sub : SubjectRef, scope : ActionScope] {
    some r : GrantRecord | {
        r.subject_ref  = sub
        r.action_scope = scope
        r.status       = Active
    }
}

-- ─────────────────────────────────────────────────────────────────────────────
-- BROKEN transition predicate: revoke_action
--
-- BUG: the precondition "pre.status = Active" has been removed.
-- In the correct model, this precondition is what enforces terminal absorption:
-- a Revoked record cannot be the pre-record of a revoke_action, because the
-- precondition requires Active. Without it, Alloy can construct a transition
-- where a Revoked record is the pre — breaking Invariant 3 (terminal absorption)
-- and Invariant 2 (monotonicity: Revoked → Revoked is a self-loop, not a
-- forward progression, but the guard that rejects it is gone).
-- ─────────────────────────────────────────────────────────────────────────────

-- BUGGY revoke_action: precondition "pre.status = Active" is ABSENT.
-- A Revoked grant can now "transition" to another record — breaking terminality.
pred revoke_action[pre, post : GrantRecord] {
    -- BUG: "pre.status = Active" removed — any status can now be the pre-record
    post.status = Revoked
    post.subject_ref  = pre.subject_ref
    post.action_scope = pre.action_scope
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions (identical names and bodies as permissions.als)
-- The checks below must find the same results EXCEPT A_I3_RevocationTerminal,
-- which is now expected to find a counterexample (SAT).
-- ─────────────────────────────────────────────────────────────────────────────

assert A_I5_GrantIdUniqueness {
    all disj r1, r2 : GrantRecord | r1.grant_id != r2.grant_id
}
check A_I5_GrantIdUniqueness for 6

assert A_I2_StatusMonotonicity {
    all pre, post : GrantRecord |
        revoke_action[pre, post] implies post.status = Revoked
}
check A_I2_StatusMonotonicity for 6

-- A_I3_RevocationTerminal: THIS CHECK IS EXPECTED TO FIND A COUNTEREXAMPLE.
-- Without "pre.status = Active" in revoke_action, Alloy can construct a scenario
-- where pre.status = Revoked and revoke_action[pre, post] holds simultaneously.
-- The assert says this should be impossible; the buggy model says it is possible.
assert A_I3_RevocationTerminal {
    all pre, post : GrantRecord |
        pre.status = Revoked implies not revoke_action[pre, post]
}
check A_I3_RevocationTerminal for 6

assert A_I1_RevokePreservesSemanticFields {
    all pre, post : GrantRecord |
        revoke_action[pre, post] implies {
            post.subject_ref  = pre.subject_ref
            post.action_scope = pre.action_scope
        }
}
check A_I1_RevokePreservesSemanticFields for 6

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

assert A_I7_DenialByAbsence {
    all sub : SubjectRef, scope : ActionScope |
        permitted_holds[sub, scope] iff
        (some r : GrantRecord | r.subject_ref = sub and r.action_scope = scope and r.status = Active)
}
check A_I7_DenialByAbsence for 6

assert A_I10_RevokeProducesDistinctPost {
    all pre, post : GrantRecord |
        revoke_action[pre, post] implies pre != post
}
check A_I10_RevokeProducesDistinctPost for 6

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs (identical to permissions.als)
-- ─────────────────────────────────────────────────────────────────────────────

run ShowActive {
    some r : GrantRecord | r.status = Active
} for 4

run ShowRevoked {
    some r : GrantRecord | r.status = Revoked
} for 4

run ShowBothStatuses {
    some disj r1, r2 : GrantRecord | {
        r1.status = Active
        r2.status = Revoked
    }
} for 4

run ShowRevokeTransition {
    some pre, post : GrantRecord | {
        revoke_action[pre, post]
        pre.status  = Active
        post.status = Revoked
    }
} for 5

run ShowPermittedHolds {
    some sub : SubjectRef, scope : ActionScope | permitted_holds[sub, scope]
} for 4

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

run ShowMultipleGrantsSamePair {
    some disj r1, r2 : GrantRecord | {
        r1.status = Active
        r2.status = Active
        r1.subject_ref  = r2.subject_ref
        r1.action_scope = r2.action_scope
    }
} for 5

run ShowPartialRevocation {
    some disj r1, r2 : GrantRecord | {
        r1.subject_ref  = r2.subject_ref
        r1.action_scope = r2.action_scope
        r1.status = Active
        r2.status = Revoked
        permitted_holds[r1.subject_ref, r1.action_scope]
    }
} for 5
