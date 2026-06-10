-- capability-buggy.als
-- DELIBERATELY WRONG twin of capability.als — the vacuity guard.
-- The harness must REJECT this model (at least one `check` finds a counterexample).
-- If every check in this file passes, the correct model's green run proves nothing.
--
-- INJECTED DEFECT (one real hazard, three checks should catch it):
-- The exhaustion transition is dropped — the buggy `redeem_success` decrements the
-- counter but always leaves status = Allocated, never transitioning to Redeemed
-- (the classic "implementation forgot the terminal write" defect the spec's
-- Invariant 4 — Exhaustion atomicity — exists to forbid). To make the hazard
-- constructible rather than vacuously blocked, the two facts that structurally
-- forbid the resulting state are weakened to match the buggy implementation:
--   1. fact CounterStatusConsistency loses "Allocated implies remRed > 0"
--   2. fact ZeroCounterImpliesRedeemed is removed
-- This mirrors how a real buggy implementation behaves: nothing in its store
-- schema prevents an exhausted-but-still-live capability, so redemption past
-- max_redemptions becomes reachable.
--
-- EXPECTED COUNTEREXAMPLES:
--   check A_AllocatedHasRemaining     — an Allocated record with remRed = 0
--   check A_ZeroCounterMeansRedeemed  — remRed = 0 without status = Redeemed
--   check A_ExhaustionSetsRedeemed    — a redeem to remRed = 0 staying Allocated
-- All other checks still hold; the harness's --buggy mode requires >= 1 SAT check.

module capability_buggy

open util/integer

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (identical to the correct model)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig Status {}
one sig Allocated, Redeemed, Expired, Revoked extends Status {}

abstract sig Token  {}
abstract sig ActorRef {}
abstract sig Scope  {}
abstract sig Reason {}

sig CapabilityRecord {
    cap_token   : one Token,
    allocator   : one ActorRef,
    cap_scope   : one Scope,
    maxRed      : one Int,
    remRed      : one Int,
    status      : one Status,
    revokedBy   : lone ActorRef,
    revReason   : lone Reason
}

sig Store {
    records : set CapabilityRecord
}

fact RecordsInStores {
    all r : CapabilityRecord | some s : Store | r in s.records
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural facts — WEAKENED to admit the injected hazard
-- ─────────────────────────────────────────────────────────────────────────────

fact StoreTokenUniqueness {
    all s : Store |
        all disj r1, r2 : s.records | r1.cap_token != r2.cap_token
}

fact CounterBounds {
    all r : CapabilityRecord | {
        r.maxRed >= 1
        r.remRed >= 0
        r.remRed <= r.maxRed
    }
}

-- BUG (weakening 1): the "Allocated implies remRed > 0" arm is DROPPED.
-- A capability can now sit live in the store with nothing left to redeem.
fact CounterStatusConsistency {
    all r : CapabilityRecord | {
        r.status = Redeemed implies r.remRed = 0
    }
}

fact RevocationAttribution {
    all r : CapabilityRecord | {
        r.status = Revoked  implies (one r.revokedBy and one r.revReason)
        r.status != Revoked implies (no  r.revokedBy and no  r.revReason)
    }
}

-- BUG (weakening 2): fact ZeroCounterImpliesRedeemed is REMOVED.
-- remRed = 0 no longer forces status = Redeemed.

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions — identical to the correct model. The weakened facts plus the
-- buggy transition below must produce counterexamples on three of them.
-- ─────────────────────────────────────────────────────────────────────────────

assert A_TokenUniqueness {
    all s : Store |
        all disj r1, r2 : s.records | r1.cap_token != r2.cap_token
}
check A_TokenUniqueness for 6

assert A_CounterNotExceedsMax {
    all r : CapabilityRecord | r.remRed <= r.maxRed
}
check A_CounterNotExceedsMax for 6

assert A_CounterNonNegative {
    all r : CapabilityRecord | r.remRed >= 0
}
check A_CounterNonNegative for 6

-- EXPECTED COUNTEREXAMPLE: Allocated with remRed = 0 is now constructible.
assert A_AllocatedHasRemaining {
    all r : CapabilityRecord | r.status = Allocated implies r.remRed > 0
}
check A_AllocatedHasRemaining for 6

assert A_RedeemedIsExhausted {
    all r : CapabilityRecord | r.status = Redeemed implies r.remRed = 0
}
check A_RedeemedIsExhausted for 6

-- EXPECTED COUNTEREXAMPLE: remRed = 0 without Redeemed is now constructible.
assert A_ZeroCounterMeansRedeemed {
    all r : CapabilityRecord | r.remRed = 0 implies r.status = Redeemed
}
check A_ZeroCounterMeansRedeemed for 6

assert A_RevokedHasAttribution {
    all r : CapabilityRecord |
        r.status = Revoked implies (one r.revokedBy and one r.revReason)
}
check A_RevokedHasAttribution for 6

assert A_NonRevokedNoAttribution {
    all r : CapabilityRecord |
        r.status != Revoked implies (no r.revokedBy and no r.revReason)
}
check A_NonRevokedNoAttribution for 6

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition predicates — redeem_success carries the injected defect
-- ─────────────────────────────────────────────────────────────────────────────

pred allocate[r : CapabilityRecord, a : ActorRef, s : Scope, max : Int] {
    max >= 1
    r.allocator  = a
    r.cap_scope  = s
    r.maxRed     = max
    r.remRed     = max
    r.status     = Allocated
    no r.revokedBy
    no r.revReason
}

-- BUG (the defect itself): the exhaustion clause is gone. The counter
-- decrements but the status ALWAYS stays Allocated — the terminal write
-- the spec mandates as atomic with the final decrement never happens.
pred redeem_success[pre, post : CapabilityRecord] {
    pre.status = Allocated
    pre.remRed > 0
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.revokedBy  = pre.revokedBy
    post.revReason  = pre.revReason
    post.remRed = pre.remRed.sub[1]
    post.status = Allocated          -- BUG: should be Redeemed when pre.remRed = 1
}

pred expire[pre, post : CapabilityRecord] {
    pre.status = Allocated
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.remRed     = pre.remRed
    post.status     = Expired
    no post.revokedBy
    no post.revReason
}

pred revoke[pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason] {
    pre.status = Allocated
    pre.remRed > 0
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.remRed     = pre.remRed
    post.status     = Revoked
    post.revokedBy  = actor
    post.revReason  = rsn
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition assertions — identical to the correct model
-- ─────────────────────────────────────────────────────────────────────────────

-- EXPECTED COUNTEREXAMPLE: the buggy redeem leaves status = Allocated at remRed = 0.
assert A_ExhaustionSetsRedeemed {
    all pre, post : CapabilityRecord |
        redeem_success[pre, post] and pre.remRed = 1 implies post.status = Redeemed
}
check A_ExhaustionSetsRedeemed for 5 but 4 Int

assert A_PartialRedeemStaysAllocated {
    all pre, post : CapabilityRecord |
        redeem_success[pre, post] and pre.remRed > 1 implies post.status = Allocated
}
check A_PartialRedeemStaysAllocated for 5 but 4 Int

assert A_RedeemPreservesImmutable {
    all pre, post : CapabilityRecord |
        redeem_success[pre, post] implies {
            post.cap_token = pre.cap_token
            post.allocator = pre.allocator
            post.cap_scope = pre.cap_scope
            post.maxRed    = pre.maxRed
        }
}
check A_RedeemPreservesImmutable for 5 but 4 Int

assert A_RedeemDecrementsCounterByOne {
    all pre, post : CapabilityRecord |
        redeem_success[pre, post] implies post.remRed = pre.remRed.sub[1]
}
check A_RedeemDecrementsCounterByOne for 5 but 4 Int

assert A_CounterNeverNegativeAfterRedeem {
    all pre, post : CapabilityRecord |
        redeem_success[pre, post] implies post.remRed >= 0
}
check A_CounterNeverNegativeAfterRedeem for 5 but 4 Int

assert A_RevokeSetAttribution {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason |
        revoke[pre, post, actor, rsn] implies {
            post.revokedBy = actor
            post.revReason = rsn
            post.status    = Revoked
        }
}
check A_RevokeSetAttribution for 5 but 4 Int

assert A_RevokePreservesCounter {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason |
        revoke[pre, post, actor, rsn] implies post.remRed = pre.remRed
}
check A_RevokePreservesCounter for 5 but 4 Int

assert A_RevokePreservesImmutable {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason |
        revoke[pre, post, actor, rsn] implies {
            post.cap_token = pre.cap_token
            post.allocator = pre.allocator
            post.cap_scope = pre.cap_scope
            post.maxRed    = pre.maxRed
        }
}
check A_RevokePreservesImmutable for 5 but 4 Int

assert A_ExpirePreservesCounter {
    all pre, post : CapabilityRecord |
        expire[pre, post] implies post.remRed = pre.remRed
}
check A_ExpirePreservesCounter for 5 but 4 Int

assert A_ExpirePreservesImmutable {
    all pre, post : CapabilityRecord |
        expire[pre, post] implies {
            post.cap_token = pre.cap_token
            post.allocator = pre.allocator
            post.cap_scope = pre.cap_scope
            post.maxRed    = pre.maxRed
        }
}
check A_ExpirePreservesImmutable for 5 but 4 Int

assert A_TerminalAbsorbing {
    all pre, post : CapabilityRecord | {
        pre.status != Allocated implies not redeem_success[pre, post]
        pre.status != Allocated implies not expire[pre, post]
        pre.status != Allocated implies
            (all actor : ActorRef, rsn : Reason | not revoke[pre, post, actor, rsn])
    }
}
check A_TerminalAbsorbing for 5 but 4 Int

assert A_RevokedHasPositiveRemaining {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason |
        revoke[pre, post, actor, rsn] implies post.remRed > 0
}
check A_RevokedHasPositiveRemaining for 5 but 4 Int

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs (kept so the buggy model's transitions are demonstrably
-- non-vacuous — the counterexamples above are real instances, not artifacts)
-- ─────────────────────────────────────────────────────────────────────────────

run ShowAllocated {
    some r : CapabilityRecord | r.status = Allocated
} for 3 but 3 Int

run ShowBuggyExhaustion {
    some pre, post : CapabilityRecord | {
        redeem_success[pre, post]
        pre.maxRed  = 1
        pre.remRed  = 1
        post.status = Allocated
        post.remRed = 0
    }
} for 5 but 4 Int
