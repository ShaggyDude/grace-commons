-- capability.als
-- Alloy structural model for the Capability atom (Grace Commons atoms/capability.md)
-- Execution/render-time refactor, 2026-06-21 — derived expiry.
--
-- PURPOSE
-- Verify that the named invariants are mutually consistent (no invariant makes the
-- configuration space empty) and that each asserted safety property is actually
-- entailed by the facts — i.e., cannot be violated by any configuration Alloy can
-- construct within the scope.
--
-- WHAT CHANGED IN THE REFACTOR
-- Capability has THREE terminal modes; only ONE (Expired) is time-derived, so only it
-- was converted. The STORED status enum is now {Allocated, Redeemed, Revoked} — there
-- is NO stored Expired and NO expire transition. `Expired` is a DERIVED read-time
-- projection, EffStatus(r, now): a stored-Allocated record whose window has lapsed
-- (now >= r.expiresAt) READS Expired, but the store never holds an "Expired" value and
-- no write fires on lapse. Exhaustion (-> Redeemed) and revocation (-> Revoked) remain
-- STORED writes, exactly as before.
--   - `now` is modeled as an injected clock value (a natural). `expiresAt` is a fixed
--     per-record deadline (a natural). The redeem and revoke guards read `now` in a PURE
--     guard (now < expiresAt) — the injected clock is READ in the guard, never used to
--     WRITE an Expired state.
--   - EffStatus(r, now) is the derived effective status `read` returns at render time.
--
-- SCOPE — two-layer model mirroring the notification.als / subscription.als pattern and
-- the prior capability.als (see pressure-testing.md §Formal-model authoring pitfalls,
-- "Static models lie about transitions"):
--
--   1. Store layer (CapabilityRecord within a Store sig). A Store is a snapshot of the
--      live capability set. Within one Store, no two records share a capability_token
--      (Invariant 12). Facts on Store express per-snapshot well-formedness.
--
--   2. Transition layer (free CapabilityRecord pre/post pairs). Transitions are
--      predicates over unbound record pairs; these records are NOT constrained by
--      store-level token uniqueness, because pre and post represent the SAME logical
--      capability before and after the action (they share a cap_token by the transition's
--      immutability constraint). Store-scoping is what keeps the four-prior-version
--      vacuity defect closed: a global TokenUniqueness fact would make
--      post.cap_token = pre.cap_token UNSATISFIABLE for any disj pre/post pair.
--
-- NOT MODELED HERE
-- - Cryptographic unforgeability of capability_token (assumed by construction)
-- - Transport security (out of scope for atom)
-- - Concurrent-redeem interleaving / clock skew (TLA+/composition concern)
-- - Scope interpretation (scope is opaque to the atom)
-- - Bearer redemption / no redeemer field is by-construction (no such field declared)
--
-- HOW TO READ THE RESULTS
-- Every "check A_*" should return "No counterexample found" — these are the spec's
-- guarantees. Every "run Show*" should return at least one instance — these confirm the
-- configuration space is non-empty (invariants are satisfiable). A "check" that DOES
-- return a counterexample is a spec finding.

module capability

open util/integer

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (types)
-- ─────────────────────────────────────────────────────────────────────────────

-- STORED status enum — NO Expired. Expired is derived (EffStatus), never stored.
abstract sig Status {}
one sig Allocated, Redeemed, Revoked extends Status {}

-- Opaque reference types (abstract = Alloy generates instances freely)
abstract sig Token  {}
abstract sig ActorRef {}
abstract sig Scope  {}
abstract sig Reason {}

-- The capability record.
-- Fields that are nullable in the spec are declared "lone" (0 or 1).
-- Fields that are always present are declared "one".
-- There is deliberately no redeemer field — Invariant 3.
-- There is deliberately no stored "expired"/"expired_at" field — Invariant 13.
sig CapabilityRecord {
    cap_token   : one Token,      -- bearer credential and record identity (Inv 1, 12)
    allocator   : one ActorRef,   -- who allocated (Inv 1, 5)
    cap_scope   : one Scope,      -- what is authorized — opaque (Inv 1, 8)
    maxRed      : one Int,        -- max_redemptions (Inv 1, 2)
    remRed      : one Int,        -- remaining_redemptions (Inv 2, 4)
    expiresAt   : one Int,        -- absolute deadline, immutable (Inv 1, 10) — the
                                  --   sole stored input to the expiry derivation
    status      : one Status,     -- STORED: Allocated | Redeemed | Revoked (Inv 6, 7)
    revokedBy   : lone ActorRef,  -- nullable; set only on Revoked (Inv 9)
    revReason   : lone Reason     -- nullable; set only on Revoked (Inv 9)
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Store sig: snapshot of the live capability set at an injected clock reading.
--
-- `now` is the injected clock (clock_t) at which this snapshot is read. EffStatus is
-- evaluated against it. Store-scoping also fixes the historical TokenUniqueness vacuity
-- defect (see header): uniqueness is a property of records that CO-EXIST in a snapshot,
-- not of any arbitrary pair of CapabilityRecord atoms.
-- ─────────────────────────────────────────────────────────────────────────────

sig Store {
    records : set CapabilityRecord,
    now     : one Int            -- injected clock reading for this snapshot
}

-- Every CapabilityRecord belongs to at least one Store. Keeps the layers connected.
fact RecordsInStores {
    all r : CapabilityRecord | some s : Store | r in s.records
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Derived effective status (render time). NEVER stored — computed from the stored
-- record and the snapshot's injected `now`. This is the whole point of the refactor:
--   EffStatus = Expired  iff  stored Allocated AND now >= expiresAt
--   otherwise EffStatus = the stored status.
-- Modeled as predicates returning the read-time verdict (Alloy has no enum-return).
-- ─────────────────────────────────────────────────────────────────────────────

pred Lapsed[r : CapabilityRecord, clock : Int] {
    r.status = Allocated and gte[clock, r.expiresAt]
}

-- "reads Expired at this clock" — the derived projection.
pred ReadsExpired[r : CapabilityRecord, clock : Int] {
    Lapsed[r, clock]
}

-- "reads as its stored status (not Expired)" — Allocated-and-open, or a stored terminal.
pred ReadsStored[r : CapabilityRecord, clock : Int] {
    not Lapsed[r, clock]
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts
-- (A fact is a constraint Alloy treats as always true for all instances.)
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 12: Token uniqueness — scoped to co-existing records in a store snapshot.
fact StoreTokenUniqueness {
    all s : Store |
        all disj r1, r2 : s.records | r1.cap_token != r2.cap_token
}

-- Invariant 2: Counter bounds. max >= 1 (zero rejected at allocate); rem in [0, max].
fact CounterBounds {
    all r : CapabilityRecord | {
        r.maxRed >= 1
        r.remRed >= 0
        r.remRed <= r.maxRed
    }
}

-- Invariant 10: every capability has a finite, positive deadline (expires_at never null).
fact PositiveDeadline {
    all r : CapabilityRecord | r.expiresAt >= 1
}

-- Invariant 4 (structural half): counter-status consistency over the STORED status.
-- Allocated implies remaining > 0  (can't be stored-live with nothing left).
-- Redeemed  implies remaining = 0  (exhaustion is the only way in).
-- Revoked: remaining retains whatever it was — no constraint imposed (spec: "forfeit").
fact CounterStatusConsistency {
    all r : CapabilityRecord | {
        r.status = Allocated implies r.remRed > 0
        r.status = Redeemed  implies r.remRed = 0
    }
}

-- Invariant 9: Revocation attribution completeness, over the STORED status.
-- Revoked records always have revokedBy AND revReason; non-revoked have neither.
fact RevocationAttribution {
    all r : CapabilityRecord | {
        r.status = Revoked  implies (one r.revokedBy and one r.revReason)
        r.status != Revoked implies (no  r.revokedBy and no  r.revReason)
    }
}

-- Emergent constraint (entailed by I4 + I7 + I13): remRed = 0 implies stored Redeemed.
-- remRed = 0 cannot be stored-Allocated (CounterStatusConsistency); cannot be reached
-- by revoke (preserves remRed, requires remRed > 0 pre); lapse never writes (I13).
-- So remRed = 0 iff the last redeem atomically set status = Redeemed.
fact ZeroCounterImpliesRedeemed {
    all r : CapabilityRecord | r.remRed = 0 implies r.status = Redeemed
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Static assertions
-- ─────────────────────────────────────────────────────────────────────────────

-- A12: Token uniqueness holds within each store snapshot.
assert A_TokenUniqueness {
    all s : Store |
        all disj r1, r2 : s.records | r1.cap_token != r2.cap_token
}
check A_TokenUniqueness for 6

-- A2a: Counter never exceeds max.
assert A_CounterNotExceedsMax {
    all r : CapabilityRecord | r.remRed <= r.maxRed
}
check A_CounterNotExceedsMax for 6

-- A2b: Counter is never negative.
assert A_CounterNonNegative {
    all r : CapabilityRecord | r.remRed >= 0
}
check A_CounterNonNegative for 6

-- A4a: stored Allocated implies remaining > 0.
assert A_AllocatedHasRemaining {
    all r : CapabilityRecord | r.status = Allocated implies r.remRed > 0
}
check A_AllocatedHasRemaining for 6

-- A4b: stored Redeemed implies remaining = 0.
assert A_RedeemedIsExhausted {
    all r : CapabilityRecord | r.status = Redeemed implies r.remRed = 0
}
check A_RedeemedIsExhausted for 6

-- A4c: Zero counter implies stored Redeemed (the emergent property).
assert A_ZeroCounterMeansRedeemed {
    all r : CapabilityRecord | r.remRed = 0 implies r.status = Redeemed
}
check A_ZeroCounterMeansRedeemed for 6

-- A9a: Revoked records always have full attribution.
assert A_RevokedHasAttribution {
    all r : CapabilityRecord |
        r.status = Revoked implies (one r.revokedBy and one r.revReason)
}
check A_RevokedHasAttribution for 6

-- A9b: Non-revoked records have no attribution fields set.
assert A_NonRevokedNoAttribution {
    all r : CapabilityRecord |
        r.status != Revoked implies (no r.revokedBy and no r.revReason)
}
check A_NonRevokedNoAttribution for 6

-- A13a: Expiry is derived, never stored — the store never holds an "Expired" value.
-- By construction the Status enum has no Expired member; promoted to an explicit check
-- so a future edit that re-introduces a stored Expired status is caught.
assert A_NoStoredExpired {
    all r : CapabilityRecord | r.status in (Allocated + Redeemed + Revoked)
}
check A_NoStoredExpired for 6

-- A13b: The derivation never misclassifies a stored terminal as Expired. A stored
-- terminal (Redeemed/Revoked) never reads Expired at ANY clock — Lapsed requires
-- stored Allocated. This is the coherence guarantee between stored state and the
-- read-time projection.
assert A_StoredTerminalNeverReadsExpired {
    all r : CapabilityRecord, clock : Int |
        (r.status = Redeemed or r.status = Revoked) implies not ReadsExpired[r, clock]
}
check A_StoredTerminalNeverReadsExpired for 6 but 4 Int

-- A13c: A lapsed record is exactly a stored-Allocated record past its deadline, and it
-- carries NO terminal field of its own (no revocation fields). This is the "Expired has
-- no fields" half of Invariant 6/13.
assert A_LapsedHasNoTerminalFields {
    all r : CapabilityRecord, clock : Int |
        ReadsExpired[r, clock] implies {
            r.status = Allocated
            no r.revokedBy
            no r.revReason
        }
}
check A_LapsedHasNoTerminalFields for 6 but 4 Int

-- A6: Stored terminal modes are structurally distinguishable, and Expired (derived) is
-- distinct from both — it is the read of a stored-Allocated record, never a stored value.
assert A_TerminalModesDistinguishable {
    all r : CapabilityRecord | {
        -- a Redeemed record is not Revoked, and vice versa
        r.status = Redeemed implies r.status != Revoked
        -- neither stored terminal is the (non-existent) stored Expired
        r.status != Allocated implies r.status in (Redeemed + Revoked)
    }
}
check A_TerminalModesDistinguishable for 6

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition predicates (pre/post record pairs modeling valid WRITES).
-- These are NOT facts — they are conditions that hold when the action fires.
-- NOTE: there is NO expire transition — lapse never writes.
-- ─────────────────────────────────────────────────────────────────────────────

-- allocate: produces a new stored-Allocated record. ttl > 0 => expiresAt > now is
-- represented by expiresAt >= 1 (PositiveDeadline); the allocate predicate fixes the
-- envelope. (allocated_at/now stamping is execution-time; not separately modeled here.)
pred allocate[r : CapabilityRecord, a : ActorRef, s : Scope, max : Int] {
    max >= 1
    r.allocator  = a
    r.cap_scope  = s
    r.maxRed     = max
    r.remRed     = max       -- remaining starts at max (full envelope)
    r.status     = Allocated
    r.expiresAt  >= 1
    no r.revokedBy
    no r.revReason
}

-- redeem_success: a successful redeem on a stored-Allocated, NOT-lapsed capability.
-- The guard reads the injected clock purely (now < expiresAt); no Expired is ever
-- written. Immutable fields (incl. expiresAt) carry through; counter decrements by 1;
-- exhaustion (pre.remRed = 1) atomically sets stored Redeemed.
pred redeem_success[pre, post : CapabilityRecord, clock : Int] {
    -- preconditions: stored-live AND window open (pure clock read in the guard)
    pre.status = Allocated
    pre.remRed > 0
    lt[clock, pre.expiresAt]          -- now < expires_at — NOT lapsed
    -- immutable fields carry through unchanged (Invariant 1) — incl. the deadline
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.expiresAt  = pre.expiresAt
    post.revokedBy  = pre.revokedBy   -- still none
    post.revReason  = pre.revReason   -- still none
    -- counter decrements by exactly 1 (Invariant 2)
    post.remRed = pre.remRed.sub[1]
    -- exhaustion: counter reaching 0 atomically sets stored Redeemed (Invariant 4)
    pre.remRed = 1 implies post.status = Redeemed
    pre.remRed > 1 implies post.status = Allocated
}

-- revoke: stored Allocated -> stored Revoked, while the window is open. Records
-- attribution. Counter preserved. Like redeem, the clock is read purely in the guard.
pred revoke[pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int] {
    pre.status = Allocated
    pre.remRed > 0
    lt[clock, pre.expiresAt]          -- now < expires_at — a lapsed capability is
                                      --   already-terminal by derivation and is NOT revoked
    -- immutable fields preserved
    post.cap_token  = pre.cap_token
    post.allocator  = pre.allocator
    post.cap_scope  = pre.cap_scope
    post.maxRed     = pre.maxRed
    post.expiresAt  = pre.expiresAt
    post.remRed     = pre.remRed      -- NOT decremented by revocation
    -- transition
    post.status     = Revoked
    post.revokedBy  = actor
    post.revReason  = rsn
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition correctness assertions
-- ─────────────────────────────────────────────────────────────────────────────

-- Exhaustion: a redeem that brings remaining to 0 must set stored Redeemed.
assert A_ExhaustionSetsRedeemed {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] and pre.remRed = 1 implies post.status = Redeemed
}
check A_ExhaustionSetsRedeemed for 5 but 4 Int

-- Non-exhausting redeem: status stays stored Allocated.
assert A_PartialRedeemStaysAllocated {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] and pre.remRed > 1 implies post.status = Allocated
}
check A_PartialRedeemStaysAllocated for 5 but 4 Int

-- Immutability under redeem: allocator, scope, maxRed, token, deadline unchanged.
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

-- Counter decrements by exactly 1 under redeem.
assert A_RedeemDecrementsCounterByOne {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies post.remRed = pre.remRed.sub[1]
}
check A_RedeemDecrementsCounterByOne for 5 but 4 Int

-- Counter never goes negative under redeem.
assert A_CounterNeverNegativeAfterRedeem {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies post.remRed >= 0
}
check A_CounterNeverNegativeAfterRedeem for 5 but 4 Int

-- Redeem fires only while the window is open — a lapsed (now >= expiresAt) capability
-- can never be redeemed. This is the load-bearing "lapsed cannot be redeemed" guarantee.
assert A_RedeemOnlyWhenNotLapsed {
    all pre, post : CapabilityRecord, clock : Int |
        redeem_success[pre, post, clock] implies lt[clock, pre.expiresAt]
}
check A_RedeemOnlyWhenNotLapsed for 5 but 4 Int

-- Revoke sets attribution fields correctly.
assert A_RevokeSetAttribution {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies {
            post.revokedBy = actor
            post.revReason = rsn
            post.status    = Revoked
        }
}
check A_RevokeSetAttribution for 5 but 4 Int

-- Revoke does NOT decrement remaining_redemptions (counter preserved).
assert A_RevokePreservesCounter {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies post.remRed = pre.remRed
}
check A_RevokePreservesCounter for 5 but 4 Int

-- Revoke preserves immutable fields (incl. deadline).
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

-- Revoke fires only while the window is open — a lapsed capability is already-terminal
-- by derivation and is never written to Revoked.
assert A_RevokeOnlyWhenNotLapsed {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies lt[clock, pre.expiresAt]
}
check A_RevokeOnlyWhenNotLapsed for 5 but 4 Int

-- No write ever produces a stored Expired status — exhaustively, neither transition can
-- set status to anything outside {Allocated, Redeemed, Revoked} (there is no such value).
-- (Captured statically by A_NoStoredExpired; the transition layer cannot introduce one
-- because post.status is drawn from the same enum.)

-- Stored terminal absorbing (I7): from a stored terminal, no write fires. Both
-- transition predicates require pre.status = Allocated, so neither can fire on a
-- stored-terminal pre. (A lapsed Allocated record is separately blocked by the
-- now >= expiresAt guard — see A_RedeemOnlyWhenNotLapsed / A_RevokeOnlyWhenNotLapsed.)
assert A_StoredTerminalAbsorbing {
    all pre, post : CapabilityRecord, clock : Int | {
        pre.status != Allocated implies not redeem_success[pre, post, clock]
        pre.status != Allocated implies
            (all actor : ActorRef, rsn : Reason | not revoke[pre, post, actor, rsn, clock])
    }
}
check A_StoredTerminalAbsorbing for 5 but 4 Int

-- Key emergent property: revoked records always have remaining > 0.
-- (revoke requires pre.remRed > 0 and preserves the counter.)
assert A_RevokedHasPositiveRemaining {
    all pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int |
        revoke[pre, post, actor, rsn, clock] implies post.remRed > 0
}
check A_RevokedHasPositiveRemaining for 5 but 4 Int

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs
-- (Confirm the configuration space is non-empty. If a "run" finds no instance,
--  a fact is over-constraining the model.)
-- ─────────────────────────────────────────────────────────────────────────────

run ShowAllocated {
    some r : CapabilityRecord | r.status = Allocated
} for 3 but 3 Int

run ShowRedeemed {
    some r : CapabilityRecord | r.status = Redeemed
} for 3 but 3 Int

run ShowRevoked {
    some r : CapabilityRecord | r.status = Revoked
} for 3 but 3 Int

-- The DERIVED Expired status is reachable as a read: a stored-Allocated record in a
-- store whose injected `now` is at/after the deadline reads Expired. Confirms the
-- derivation is non-vacuous — Expired exists at render time without any stored value.
run ShowDerivedExpired {
    some s : Store | some r : s.records | ReadsExpired[r, s.now]
} for 3 but 4 Int

-- All three terminal modes coexist as reads in one snapshot: a stored Redeemed, a
-- stored Revoked, and a stored-Allocated record reading Expired — three distinct modes,
-- two stored and one derived.
run ShowThreeTerminalModes {
    some s : Store |
    some disj r1, r2, r3 : s.records | {
        r1.status = Redeemed
        r2.status = Revoked
        r3.status = Allocated and ReadsExpired[r3, s.now]
    }
} for 6 but 4 Int

-- A live capability also exists in the same snapshot: stored Allocated, window open.
run ShowLiveAndExpiredCoexist {
    some s : Store |
    some disj rLive, rExp : s.records | {
        rLive.status = Allocated and not ReadsExpired[rLive, s.now]   -- reads Allocated (live)
        rExp.status  = Allocated and ReadsExpired[rExp, s.now]        -- reads Expired (lapsed)
    }
} for 6 but 4 Int

-- Exhaustion transition: a single redeem that exhausts a single-use capability, fired
-- while the window is open.
run ShowExhaustionTransition {
    some pre, post : CapabilityRecord, clock : Int | {
        redeem_success[pre, post, clock]
        pre.maxRed  = 1
        pre.remRed  = 1
        post.status = Redeemed
        post.remRed = 0
    }
} for 5 but 4 Int

-- Multi-use partial redeem: 3 uses, one redeem, still stored Allocated.
run ShowMultiUsePartialRedeem {
    some pre, post : CapabilityRecord, clock : Int | {
        redeem_success[pre, post, clock]
        pre.maxRed  = 3
        pre.remRed  = 3
        post.remRed = 2
        post.status = Allocated
    }
} for 5 but 4 Int

-- Revoke transition (window open).
run ShowRevokeTransition {
    some pre, post : CapabilityRecord, actor : ActorRef, rsn : Reason, clock : Int | {
        revoke[pre, post, actor, rsn, clock]
        pre.status  = Allocated
        post.status = Revoked
    }
} for 5 but 4 Int

-- Multi-token store: two independent capabilities coexist with distinct tokens.
run ShowTwoCapabilities {
    some s : Store |
    some disj r1, r2 : s.records | {
        r1.status = Allocated
        r2.status = Allocated
        r1.cap_token != r2.cap_token
    }
} for 5 but 4 Int
