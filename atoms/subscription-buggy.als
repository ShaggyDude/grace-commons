-- subscription-buggy.als
-- Deliberately broken twin of subscription.als for the Grace Commons harness.
--
-- WHAT IS BROKEN
-- The fact `AtMostOneActivePerKey` — which enforces Invariant 6 (at most one Active
-- subscription per (subscriber_ref, event_scope) pair) — has been REMOVED.
-- The store is no longer constrained to prevent two Active records sharing the same
-- (subscriber, event_scope) pair.
--
-- EXPECTED HARNESS RESULT
--   node check.mjs subscription-buggy.als --buggy   =>   PASS
-- Because check A_AtMostOneActivePerKey will find a counterexample (SAT) — the model
-- can now produce two Active records for the same (subscriber, scope) pair, which
-- violates Invariant 6. The --buggy flag expects at least one check to be SAT, so the
-- harness reports PASS (the bug is correctly detected).
--
-- All other checks remain identical to subscription.als. Only Invariant 6 / the
-- at-most-one-active fact is weakened.

module subscription_buggy

open util/integer

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (identical to subscription.als)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig Status {}
one sig Active, Cancelled extends Status {}

abstract sig SubscriptionId  {}
abstract sig SubscriberRef   {}
abstract sig EventScope      {}

sig SubscriptionRecord {
    sub_id        : one SubscriptionId,
    subscriber    : one SubscriberRef,
    event_scope   : one EventScope,
    subscribed_at : one Int,
    status        : one Status,
    cancelled_at  : lone Int
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Facts
-- NOTE: AtMostOneActivePerKey is intentionally ABSENT here.
-- This breaks Invariant 6 and allows two Active records for the same (subscriber, scope).
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 5: No id reuse — kept intact.
fact NoIdReuse {
    all disj r1, r2 : SubscriptionRecord | r1.sub_id != r2.sub_id
}

-- BUG: fact AtMostOneActivePerKey is intentionally removed.
-- The correct model has:
--   fact AtMostOneActivePerKey {
--       all s : SubscriberRef, e : EventScope |
--           lone r : SubscriptionRecord |
--               r.subscriber = s and r.event_scope = e and r.status = Active
--   }
-- Without this fact, nothing prevents two Active records with the same
-- (subscriber, event_scope) pair, so A_AtMostOneActivePerKey will find a counterexample.

-- Invariant 2 / 9: Status-field consistency — kept intact.
fact CancelledAtConsistency {
    all r : SubscriptionRecord | {
        r.status = Active    implies no  r.cancelled_at
        r.status = Cancelled implies one r.cancelled_at
    }
}

-- Invariant 9: Timestamp ordering — kept intact.
fact TimestampOrdering {
    all r : SubscriptionRecord |
        r.status = Cancelled implies r.subscribed_at <= r.cancelled_at
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions (identical to subscription.als — A_AtMostOneActivePerKey will fail)
-- ─────────────────────────────────────────────────────────────────────────────

assert A_NoIdReuse {
    all disj r1, r2 : SubscriptionRecord | r1.sub_id != r2.sub_id
}
check A_NoIdReuse for 6

-- This check WILL find a counterexample because the enforcing fact was removed.
-- The harness expects this SAT result when run with --buggy.
assert A_AtMostOneActivePerKey {
    all s : SubscriberRef, e : EventScope |
        lone r : SubscriptionRecord |
            r.subscriber = s and r.event_scope = e and r.status = Active
}
check A_AtMostOneActivePerKey for 6

assert A_CancelledHasCancelledAt {
    all r : SubscriptionRecord |
        r.status = Cancelled implies one r.cancelled_at
}
check A_CancelledHasCancelledAt for 6

assert A_ActiveHasNoCancelledAt {
    all r : SubscriptionRecord |
        r.status = Active implies no r.cancelled_at
}
check A_ActiveHasNoCancelledAt for 6

assert A_TimestampOrdering {
    all r : SubscriptionRecord |
        r.status = Cancelled implies r.subscribed_at <= r.cancelled_at
}
check A_TimestampOrdering for 6

assert A_CancelTerminal {
    all pre, post : SubscriptionRecord |
        cancel_success[pre, post] implies pre.status = Active
}
check A_CancelTerminal for 6

assert A_CancelPreservesImmutable {
    all pre, post : SubscriptionRecord |
        cancel_success[pre, post] implies {
            post.sub_id        = pre.sub_id
            post.subscriber    = pre.subscriber
            post.event_scope   = pre.event_scope
            post.subscribed_at = pre.subscribed_at
        }
}
check A_CancelPreservesImmutable for 6

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition predicates (identical to subscription.als)
-- ─────────────────────────────────────────────────────────────────────────────

pred subscribe_success[r : SubscriptionRecord, s : SubscriberRef, e : EventScope, t : Int] {
    r.status        = Active
    r.subscriber    = s
    r.event_scope   = e
    r.subscribed_at = t
    no r.cancelled_at
}

pred cancel_success[pre, post : SubscriptionRecord] {
    pre.status = Active
    post.sub_id        = pre.sub_id
    post.subscriber    = pre.subscriber
    post.event_scope   = pre.event_scope
    post.subscribed_at = pre.subscribed_at
    post.status        = Cancelled
    one post.cancelled_at
    post.cancelled_at >= pre.subscribed_at
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs (identical to subscription.als)
-- ─────────────────────────────────────────────────────────────────────────────

run ShowOneActive {
    some r : SubscriptionRecord | r.status = Active
} for 3 but 3 Int

run ShowOneCancelled {
    some r : SubscriptionRecord | r.status = Cancelled
} for 3 but 3 Int

run ShowActiveAndCancelled {
    some disj r1, r2 : SubscriptionRecord | {
        r1.status = Active
        r2.status = Cancelled
    }
} for 4 but 3 Int

run ShowCancelThenResubscribe {
    some disj old_rec, new_rec : SubscriptionRecord |
    some s : SubscriberRef | some e : EventScope | {
        old_rec.subscriber  = s
        old_rec.event_scope = e
        old_rec.status      = Cancelled
        new_rec.subscriber  = s
        new_rec.event_scope = e
        new_rec.status      = Active
        old_rec.sub_id != new_rec.sub_id
    }
} for 4 but 3 Int

run ShowTwoActiveSubscribersForSameScope {
    some disj r1, r2 : SubscriptionRecord |
    some e : EventScope | {
        r1.status      = Active
        r2.status      = Active
        r1.event_scope = e
        r2.event_scope = e
        r1.subscriber != r2.subscriber
        r1.sub_id     != r2.sub_id
    }
} for 4 but 3 Int

run ShowSubscribeTransition {
    some r : SubscriptionRecord | some s : SubscriberRef | some e : EventScope | {
        subscribe_success[r, s, e, 1]
    }
} for 4 but 3 Int

run ShowCancelTransition {
    some pre, post : SubscriptionRecord | {
        cancel_success[pre, post]
        pre.status  = Active
        post.status = Cancelled
    }
} for 4 but 3 Int
