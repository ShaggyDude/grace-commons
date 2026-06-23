-- capability-buggy.als
-- DELIBERATELY WRONG twin of capability.als — the vacuity guard.
-- The harness must REJECT this model (at least one `check` finds a counterexample).
-- If every check in this file passes, the correct model's green run proves nothing.
--
-- INJECTED DEFECT (one real hazard, for the execution/render-time refactor)
-- The buggy `redeem_success` DROPS the expiry guard (`now < expiresAt`). The
-- implementation "forgot" that expiry is derived and must be checked at redeem time, so
-- a LAPSED capability (stored Allocated, now >= expiresAt) can still be redeemed — the
-- exact hazard the refactor's guard exists to forbid (a lapsed capability must NOT be
-- redeemable; redeem must return the derived invalid(expired) and write nothing). This
-- is the render-time analog of the original twin's "forgot the terminal write" defect:
-- here the implementation forgot the *read-time derivation* in the guard.
--
-- To make the hazard CONSTRUCTIBLE rather than vacuously blocked, the buggy
-- redeem_success simply omits the `lt[clock, pre.expiresAt]` precondition. Nothing else
-- in the schema prevents redeeming past the deadline, so a redeem-while-lapsed becomes
-- reachable. (A second weakening, dropping "Allocated implies remRed > 0", additionally
-- re-opens the exhausted-but-still-live hazard so the historical exhaustion checks also
-- bite — belt and suspenders, so the twin is rejected on multiple independent grounds.)
--
-- EXPECTED COUNTEREXAMPLES (at least one suffices for --buggy PASS):
--   check A_RedeemOnlyWhenNotLapsed   — a redeem fires with now >= expiresAt
--   check A_AllocatedHasRemaining     — an Allocated record with remRed = 0
--   check A_ZeroCounterMeansRedeemed  — remRed = 0 without stored Redeemed
--   check A_ExhaustionSetsRedeemed    — a redeem to remRed = 0 staying Allocated
-- The harness's --buggy mode requires >= 1 SAT check.

module capability_buggy

open util/integer

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (identical to the correct model)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig Status {}
one sig Allocated, Redeemed, Revoked extends Status {}

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
    expiresAt   : one Int,
    status      : one Status,
    revokedBy   : lone ActorRef,
    revReason   : lone Reason
}

sig Store {
    records : set CapabilityRecord,
    now     : one Int
}

fact RecordsInStores {
    all r : CapabilityRecord | some s : Store | r in s.records
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Derived effective status (identical to the correct model)
-- ─────────────────────────────────────────────────────────────────────────────

pred Lapsed[r : CapabilityRecord, clock : Int] {
    r.status = Allocated and gte[clock, r.expiresAt]
}

pred ReadsExpired[r : CapabilityRecord, clock : Int] {
    Lapsed[r, clock]
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural facts — WEAKENED to admit the injected hazards
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

fact PositiveDeadline {
    all r : CapabilityRecord | r.expiresAt >= 1
}

-- BUG (weakening 1): the "Allocated implies remRed > 0" arm is DROPPED, so an
-- exhausted-but-still-live capability is constructible (re-opens the exhaustion hazard).
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
-- remRed = 0 no longer forces stored Redeemed.

-- ─────────────────────────────────────────────────────────────────────────────
-- Static assertions — identical to the correct model.
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

-- EXPECTED COUNTEREXAMPLE: remRed = 0 without stored Redeemed is now constructible.
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

assert A_NoStoredExpired {
    all r : CapabilityRecord | r.status in (Allocated + Redeemed + Revoked)
}
check A_NoStoredExpired for 6

assert A_StoredTerminalNeverReadsExpired {
    all r : CapabilityRecord, clock : Int |
        (r.status = Redeemed or r.status = Revoked) implies not ReadsExpired[r, clock]
}
check A_StoredTerminalNeverReadsExpired for 6 but 4 Int

assert A_LapsedHasNoTerminalFields {
    all r : CapabilityRecord, clock : Int |
        ReadsExpired[r, clock] implies {
            r.status = Allocated
            no r.revokedBy
            no r.revReason
        }
}
check A_LapsedHasNoTerminalFields for 6 but 4 Int

assert A_TerminalModesDistinguishable {
    all r : CapabilityRecord | {
        r.status = Redeemed implies r.status != Revoked
        r.status != Allocated implies r.status in (Redeemed + Revoked)
    }
}
check A_TerminalModesDistinguishable for 6

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
    r.expiresAt  >= 1
    no r.revokedBy
    no r.revReason
}

-- BUG (the defect itself): the expiry guard `lt[clock, pre.expiresAt]` is GONE.
-- A lapsed capability (now >= expiresAt) can now be redeemed — the refactor's
-- load-bearing "lapsed cannot be redeemed" guarantee is broken.
pred redeem_success[pre, post : CapabilityRecord, clock : Int] {
    pre.status = Allocated
    pre.remRed > 0
    -- MISSING: lt[clock, pre.expiresAt]   <- the dropped expiry guard
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.expiresAt  = pre.expiresAt
    post.revokedBy  = pre.revokedBy
    post.revReason  = pre.revReason
    post.remRed = pre.remRed.sub[1]
    pre.remRed = 1 implies post.status = Redeemed
    pre.remRed > 1 implies post.status = Allocated
}

pred revoke[pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int] {
    pre.status = Allocated
    pre.remRed > 0
    lt[clock, pre.expiresAt]
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.expiresAt  = pre.expiresAt
    post.remRed     = pre.remRed
    post.status     = Revoked
    post.revokedBy  = actor
    post.revReason  = rsn
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition assertions — identical to the correct model
-- ─────────────────────────────────────────────────────────────────────────────

assert A_ExhaustionSetsRedeemed {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] and pre.remRed = 1 implies post.status = Redeemed
}
check A_ExhaustionSetsRedeemed for 5 but 4 Int

assert A_PartialRedeemStaysAllocated {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] and pre.remRed > 1 implies post.status = Allocated
}
check A_PartialRedeemStaysAllocated for 5 but 4 Int

assert A_RedeemPreservesImmutable {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies {
            post.cap_token = pre.cap_token
            post.allocator = pre.allocator
            post.cap_scope = pre.cap_scope
            post.maxRed    = pre.maxRed
            post.expiresAt = pre.expiresAt
        }
}
check A_RedeemPreservesImmutable for 5 but 4 Int

assert A_RedeemDecrementsCounterByOne {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies post.remRed = pre.remRed.sub[1]
}
check A_RedeemDecrementsCounterByOne for 5 but 4 Int

assert A_CounterNeverNegativeAfterRedeem {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies post.remRed >= 0
}
check A_CounterNeverNegativeAfterRedeem for 5 but 4 Int

-- EXPECTED COUNTEREXAMPLE: the buggy redeem fires with now >= expiresAt (lapsed).
assert A_RedeemOnlyWhenNotLapsed {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies lt[clock, pre.expiresAt]
}
check A_RedeemOnlyWhenNotLapsed for 5 but 4 Int

assert A_RevokeSetAttribution {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies {
            post.revokedBy = actor
            post.revReason = rsn
            post.status    = Revoked
        }
}
check A_RevokeSetAttribution for 5 but 4 Int

assert A_RevokePreservesCounter {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies post.remRed = pre.remRed
}
check A_RevokePreservesCounter for 5 but 4 Int

assert A_RevokePreservesImmutable {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies {
            post.cap_token = pre.cap_token
            post.allocator = pre.allocator
            post.cap_scope = pre.cap_scope
            post.maxRed    = pre.maxRed
            post.expiresAt = pre.expiresAt
        }
}
check A_RevokePreservesImmutable for 5 but 4 Int

assert A_RevokeOnlyWhenNotLapsed {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies lt[clock, pre.expiresAt]
}
check A_RevokeOnlyWhenNotLapsed for 5 but 4 Int

assert A_StoredTerminalAbsorbing {
    all pre, post : CapabilityRecord, clock : Int | {
        pre.status != Allocated implies not redeem_success[pre, post, clock]
        pre.status != Allocated implies
            (all actor : ActorRef, rsn : Reason | not revoke[pre, post, actor, rsn, clock])
    }
}
check A_StoredTerminalAbsorbing for 5 but 4 Int

assert A_RevokedHasPositiveRemaining {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies post.remRed > 0
}
check A_RevokedHasPositiveRemaining for 5 but 4 Int

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs (kept so the buggy transitions are demonstrably non-vacuous —
-- the counterexamples above are real instances, not artifacts)
-- ─────────────────────────────────────────────────────────────────────────────

run ShowAllocated {
    some r : CapabilityRecord | r.status = Allocated
} for 3 but 3 Int

-- The defect made concrete: a redeem firing on a LAPSED capability (now >= expiresAt).
run ShowBuggyRedeemWhileLapsed {
    some pre, post : CapabilityRecord, clock : Int | {
        redeem_success[pre, post, clock]
        gte[clock, pre.expiresAt]        -- now >= expires_at — lapsed, yet redeemed
        pre.status = Allocated
    }
} for 5 but 4 Int
