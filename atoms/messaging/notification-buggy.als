-- notification-buggy.als
-- Deliberately broken twin of notification.als.
--
-- WHAT WAS BROKEN
-- The TimestampStatusCoherence fact was changed from a biconditional (iff) to a
-- one-directional implication (implies) for the delivered_at arm only:
--
--   CORRECT:   (one r.delivered_at) iff r.status = Delivered
--   BUGGY:     r.status = Delivered implies (one r.delivered_at)
--
-- The biconditional in the correct model enforces two things:
--   (a) if delivered_at is present, then status must be Delivered
--   (b) if status is Delivered, then delivered_at must be present
--
-- The weakened implication only enforces (b).  It drops (a): the model no longer
-- prevents a record with status = Failed or status = Expired from ALSO having
-- delivered_at set.  A record can now hold both delivered_at and failed_at (or
-- both delivered_at and expired_at) simultaneously — violating Invariant 3
-- (terminal states are exclusive) and Invariant 4 (timestamp-status coherence).
--
-- WHICH CHECKS ARE EXPECTED TO FAIL (return SAT = counterexample found)
--   A_Inv3_AtMostOneTerminalTimestamp     — two terminal timestamps present at once
--   A_Inv3_FailedHasOnlyFailedAt          — Failed record also carries delivered_at
--   A_Inv3_ExpiredHasOnlyExpiredAt        — Expired record also carries delivered_at
--   A_Inv4_DeliveredAtIffDelivered        — delivered_at present on a non-Delivered record
--
-- All other checks that depend on the stronger coherence fact may also return SAT.
-- The primary intended failure is A_Inv3_AtMostOneTerminalTimestamp and
-- A_Inv4_DeliveredAtIffDelivered — both catch the broken terminal exclusivity.
--
-- HOW TO RUN
--   node check.mjs notification-buggy.als --buggy   # expects PASS (counterexample found)

module notification_buggy

-- ─────────────────────────────────────────────────────────────────────────────
-- Status enum (unchanged from correct model)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig Status {}
one sig Pending extends Status {}
one sig Delivered extends Status {}
one sig Failed extends Status {}
one sig Expired extends Status {}

fun terminals : set Status { Delivered + Failed + Expired }

-- ─────────────────────────────────────────────────────────────────────────────
-- Opaque reference types (unchanged)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig NotificationId {}
abstract sig RecipientRef {}
abstract sig Payload {}
abstract sig Timestamp {}

-- ─────────────────────────────────────────────────────────────────────────────
-- The notification record (unchanged)
-- ─────────────────────────────────────────────────────────────────────────────

sig NotificationRecord {
    notification_id : one NotificationId,
    recipient_ref   : one RecipientRef,
    payload         : one Payload,
    status          : one Status,
    delivered_at    : lone Timestamp,
    failed_at       : lone Timestamp,
    expired_at      : lone Timestamp
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Store sig (unchanged)
-- ─────────────────────────────────────────────────────────────────────────────

sig Store {
    records : set NotificationRecord
}

fact StoreIdUniqueness {
    all s : Store |
        all disj r1, r2 : s.records |
            r1.notification_id != r2.notification_id
}

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG: TimestampStatusCoherence WEAKENED for the delivered_at arm.
--
-- CORRECT version uses biconditionals (iff) for all three arms:
--   (one r.delivered_at) iff r.status = Delivered
--   (one r.failed_at)    iff r.status = Failed
--   (one r.expired_at)   iff r.status = Expired
--
-- BUGGY version changes the delivered_at arm to a one-directional implication.
-- This allows a record whose status is Failed or Expired to ALSO carry delivered_at,
-- which violates terminal exclusivity (Invariant 3) and timestamp-status coherence
-- (Invariant 4).  The failed_at and expired_at arms retain their biconditionals so
-- the model remains satisfiable and the failure is targeted and legible.
-- ─────────────────────────────────────────────────────────────────────────────
fact TimestampStatusCoherence {
    all r : NotificationRecord | {
        -- BUG: implication only (dropped the reverse direction of iff).
        -- The reverse direction said: if delivered_at present, then status = Delivered.
        -- Without it, delivered_at can be present on Failed and Expired records too.
        r.status = Delivered implies (one r.delivered_at)
        -- failed_at and expired_at arms retain their correct biconditionals.
        (one r.failed_at)    iff r.status = Failed
        (one r.expired_at)   iff r.status = Expired
    }
}

fact TimestampsAreUsed {
    all t : Timestamp | some r : NotificationRecord |
        r.delivered_at = t or r.failed_at = t or r.expired_at = t
}

fact RecordsInStores {
    all r : NotificationRecord | some s : Store | r in s.records
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Transition predicates (unchanged from correct model)
-- ─────────────────────────────────────────────────────────────────────────────

pred deliver[pre, post : NotificationRecord] {
    pre.status = Pending
    post.notification_id = pre.notification_id
    post.recipient_ref   = pre.recipient_ref
    post.payload         = pre.payload
    post.status = Delivered
    one post.delivered_at
    no  post.failed_at
    no  post.expired_at
}

pred fail[pre, post : NotificationRecord] {
    pre.status = Pending
    post.notification_id = pre.notification_id
    post.recipient_ref   = pre.recipient_ref
    post.payload         = pre.payload
    post.status = Failed
    no  post.delivered_at
    one post.failed_at
    no  post.expired_at
}

pred expire[pre, post : NotificationRecord] {
    pre.status = Pending
    post.notification_id = pre.notification_id
    post.recipient_ref   = pre.recipient_ref
    post.payload         = pre.payload
    post.status = Expired
    no  post.delivered_at
    no  post.failed_at
    one post.expired_at
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions (same names and bodies as the correct model — the bug is in the fact)
-- ─────────────────────────────────────────────────────────────────────────────

assert A_Inv2_TerminalNotDeliverable {
    all pre, post : NotificationRecord |
        pre.status in terminals implies not deliver[pre, post]
}
check A_Inv2_TerminalNotDeliverable for 6

assert A_Inv2_TerminalNotFailable {
    all pre, post : NotificationRecord |
        pre.status in terminals implies not fail[pre, post]
}
check A_Inv2_TerminalNotFailable for 6

assert A_Inv2_TerminalNotExpirable {
    all pre, post : NotificationRecord |
        pre.status in terminals implies not expire[pre, post]
}
check A_Inv2_TerminalNotExpirable for 6

assert A_Inv2_DeliveredNotFailable {
    all pre, post : NotificationRecord |
        pre.status = Delivered implies not fail[pre, post]
}
check A_Inv2_DeliveredNotFailable for 6

assert A_Inv2_FailedNotDeliverable {
    all pre, post : NotificationRecord |
        pre.status = Failed implies not deliver[pre, post]
}
check A_Inv2_FailedNotDeliverable for 6

assert A_Inv2_AllTransitionsRequirePending {
    all pre, post : NotificationRecord | {
        deliver[pre, post] implies pre.status = Pending
        fail[pre, post]    implies pre.status = Pending
        expire[pre, post]  implies pre.status = Pending
    }
}
check A_Inv2_AllTransitionsRequirePending for 6

-- ── Invariant 3 checks — EXPECTED TO FAIL in the buggy model ────────────────

-- This check WILL find a counterexample: a Failed or Expired record that also
-- carries delivered_at, giving two terminal timestamps simultaneously.
assert A_Inv3_AtMostOneTerminalTimestamp {
    all r : NotificationRecord | {
        not (one r.delivered_at and one r.failed_at)
        not (one r.delivered_at and one r.expired_at)
        not (one r.failed_at    and one r.expired_at)
    }
}
check A_Inv3_AtMostOneTerminalTimestamp for 6

assert A_Inv3_DeliveredHasOnlyDeliveredAt {
    all r : NotificationRecord |
        r.status = Delivered implies
            (one r.delivered_at and no r.failed_at and no r.expired_at)
}
check A_Inv3_DeliveredHasOnlyDeliveredAt for 6

-- This check WILL find a counterexample: a Failed record carrying delivered_at.
assert A_Inv3_FailedHasOnlyFailedAt {
    all r : NotificationRecord |
        r.status = Failed implies
            (no r.delivered_at and one r.failed_at and no r.expired_at)
}
check A_Inv3_FailedHasOnlyFailedAt for 6

-- This check WILL find a counterexample: an Expired record carrying delivered_at.
assert A_Inv3_ExpiredHasOnlyExpiredAt {
    all r : NotificationRecord |
        r.status = Expired implies
            (no r.delivered_at and no r.failed_at and one r.expired_at)
}
check A_Inv3_ExpiredHasOnlyExpiredAt for 6

assert A_Inv3_PendingHasNoTimestamps {
    all r : NotificationRecord |
        r.status = Pending implies
            (no r.delivered_at and no r.failed_at and no r.expired_at)
}
check A_Inv3_PendingHasNoTimestamps for 6

-- ── Invariant 4 checks — EXPECTED TO FAIL in the buggy model ────────────────

-- This check WILL find a counterexample: delivered_at present on a non-Delivered record.
assert A_Inv4_DeliveredAtIffDelivered {
    all r : NotificationRecord |
        (one r.delivered_at) iff r.status = Delivered
}
check A_Inv4_DeliveredAtIffDelivered for 6

assert A_Inv4_FailedAtIffFailed {
    all r : NotificationRecord |
        (one r.failed_at) iff r.status = Failed
}
check A_Inv4_FailedAtIffFailed for 6

assert A_Inv4_ExpiredAtIffExpired {
    all r : NotificationRecord |
        (one r.expired_at) iff r.status = Expired
}
check A_Inv4_ExpiredAtIffExpired for 6

assert A_Trans_DeliverProducesDelivered {
    all pre, post : NotificationRecord |
        deliver[pre, post] implies post.status = Delivered
}
check A_Trans_DeliverProducesDelivered for 6

assert A_Trans_FailProducesFailed {
    all pre, post : NotificationRecord |
        fail[pre, post] implies post.status = Failed
}
check A_Trans_FailProducesFailed for 6

assert A_Trans_ExpireProducesExpired {
    all pre, post : NotificationRecord |
        expire[pre, post] implies post.status = Expired
}
check A_Trans_ExpireProducesExpired for 6

assert A_Trans_ImmutableFieldsPreserved {
    all pre, post : NotificationRecord | {
        deliver[pre, post] implies {
            post.notification_id = pre.notification_id
            post.recipient_ref   = pre.recipient_ref
            post.payload         = pre.payload
        }
        fail[pre, post] implies {
            post.notification_id = pre.notification_id
            post.recipient_ref   = pre.recipient_ref
            post.payload         = pre.payload
        }
        expire[pre, post] implies {
            post.notification_id = pre.notification_id
            post.recipient_ref   = pre.recipient_ref
            post.payload         = pre.payload
        }
    }
}
check A_Trans_ImmutableFieldsPreserved for 6

assert A_Inv6_StoreIdUniqueness {
    all s : Store |
        all disj r1, r2 : s.records |
            r1.notification_id != r2.notification_id
}
check A_Inv6_StoreIdUniqueness for 6

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs (same as correct model — the bug does not block any state)
-- ─────────────────────────────────────────────────────────────────────────────

run ShowPending {
    some r : NotificationRecord | r.status = Pending
} for 4

run ShowDelivered {
    some r : NotificationRecord | r.status = Delivered
} for 4

run ShowFailed {
    some r : NotificationRecord | r.status = Failed
} for 4

run ShowExpired {
    some r : NotificationRecord | r.status = Expired
} for 4

run ShowAllFourStatuses {
    some s : Store |
    some disj r1, r2, r3, r4 : s.records | {
        r1.status = Pending
        r2.status = Delivered
        r3.status = Failed
        r4.status = Expired
    }
} for 6

run ShowDeliverTransition {
    some pre, post : NotificationRecord |
        deliver[pre, post]
} for 6

run ShowFailTransition {
    some pre, post : NotificationRecord |
        fail[pre, post]
} for 6

run ShowExpireTransition {
    some pre, post : NotificationRecord |
        expire[pre, post]
} for 6

run ShowTwoNotificationsOneRecipient {
    some s : Store |
    some disj r1, r2 : s.records | {
        r1.recipient_ref = r2.recipient_ref
        r1.notification_id != r2.notification_id
        r1.status = Pending
        r2.status = Delivered
    }
} for 6
