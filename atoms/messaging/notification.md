---
title: Notification
parent: Messaging
grand_parent: Atoms
nav_order: 2
---

# Notification

> A messaging primitive: the delivery record for a single notification to a single recipient. Each notification has an opaque immutable id; the recipient reference and payload are immutable properties set at create time. The atom records *whether a piece of information reached a recipient*. The transport mechanism — WebSocket, webhook, email, push — is a deployment concern outside this atom's scope.

---

## Intent

When an event fires against a subscription, something must carry the resulting information to the recipient and record whether it arrived. That record is the notification: a durable account of the delivery attempt with enough state to answer the operational questions — *did the recipient get this? was delivery attempted and failed? did this expire before it could be delivered?*

Notification records *delivery*. It does not know about subscriptions, events, or routing; those belong to the composing Notification Fanout pattern. What the atom owns is the delivery record for a single recipient from the moment of creation through its terminal outcome: Delivered, Failed, or Expired.

The three terminal states are distinct because they answer different questions. Delivered: *did the recipient receive it?* Failed: *was delivery attempted and did it not succeed?* Expired: *did this sit undelivered beyond its allowed window?* Collapsing them into a single terminal state would hide information that operators, auditors, and retry logic each need separately.

This is a freestanding atom in the EOS sense. It has its own state (the notification set), its own actions (`create`, `deliver`, `fail`, `expire`, `pending_for`), and its own operational principles (notifications are immutable once recorded; terminal states are irreversible; `pending_for` is a read-only query). It does not implement routing, subscription evaluation, retry scheduling, or delivery transport. Each is a separate composable pattern; see Composition notes.

---

## Structure

### Identity model

Every notification known to the system has a **`notification_id`** — an opaque, immutable, system-generated identifier produced by `create`. The id is the notification's identity; the recipient reference and payload are immutable *properties* of the notification, not its identity.

The opaque-id model follows the same discipline used across the library. Identifying a notification by (recipient_ref, payload) would collapse independently-created notifications into a single record — a recipient could be notified of the same event scope multiple times (e.g., after re-subscribing), and each delivery attempt is a distinct record with its own outcome. Opaque ids preserve one-notification-one-id discipline.

Ids are not reused after a notification reaches a terminal state.

### Inputs

- A recipient reference identifying *who* the notification is addressed to. Opaque — the actor registry is a separate concern.
- A payload carrying *what* is being communicated. Opaque — the composing system defines payload structure and content. This atom stores and returns the payload unchanged; it does not inspect, parse, or validate its contents.
- Actions:
  - `create(recipient_ref, payload) → notification_id | rejected(reason)`
  - `deliver(notification_id) → ok | rejected(reason)`
  - `fail(notification_id) → ok | rejected(reason)`
  - `expire(notification_id) → ok | rejected(reason)`
  - `pending_for(recipient_ref) → [notification_id, ...]`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of notifications (Pending, Delivered, Failed, and Expired).
- For each notification: `notification_id`, `recipient_ref`, `payload`, `created_at`, `status`, and the applicable terminal timestamp (`delivered_at`, `failed_at`, or `expired_at`).
- `create` returns the new `notification_id` on success, or a rejection naming the failed precondition.
- `deliver`, `fail`, and `expire` return `ok` on success, or a rejection naming the failed precondition.
- `pending_for` returns the list of `notification_id` values for all Pending notifications addressed to the queried recipient.

### State

A notification occupies one of four named states:

- **Pending** — the notification has been created and delivery has not yet been confirmed, failed, or expired.
- **Delivered** — the notification reached the recipient. Terminal.
- **Failed** — delivery was attempted and did not succeed. Terminal.
- **Expired** — the notification was not delivered within its allowed window. Terminal.

Each notification carries:

- **`notification_id`** — opaque, immutable, system-generated. Set on `create`. Never changes.
- **`recipient_ref`** — opaque reference to the intended recipient. Set on `create`. Never changes.
- **`payload`** — opaque content of the notification. Set on `create`. Never changes.
- **`created_at`** — wall-time when the notification was created. Set on `create`. Never changes.
- **`status`** — `pending`, `delivered`, `failed`, or `expired`. Set to `pending` on `create`; transitions to a terminal state on the corresponding action.
- **`delivered_at`** — wall-time when delivery was confirmed. Absent unless status is `delivered`; set on `deliver`. Never changes after set.
- **`failed_at`** — wall-time when the failure was recorded. Absent unless status is `failed`; set on `fail`. Never changes after set.
- **`expired_at`** — wall-time when the expiry was recorded. Absent unless status is `expired`; set on `expire`. Never changes after set.

Transitions:

- `create(recipient_ref, payload)` → a new notification is recorded in Pending with a fresh `notification_id`, the supplied `recipient_ref` and `payload`, and `created_at = now`. Returns `notification_id`.
- `deliver(notification_id)` → the notification at `notification_id` moves Pending → Delivered; `delivered_at = now`. Returns `ok`.
- `fail(notification_id)` → the notification at `notification_id` moves Pending → Failed; `failed_at = now`. Returns `ok`.
- `expire(notification_id)` → the notification at `notification_id` moves Pending → Expired; `expired_at = now`. Returns `ok`.
- `pending_for(recipient_ref)` → read-only query; no state change. Returns the list of `notification_id` values for all Pending notifications where `notification.recipient_ref = recipient_ref`.

### Flow

1. **An event fires; the composing pattern creates a notification.** The Notification Fanout pattern (or equivalent) calls `create(recipient_ref, payload)` — the atom records the notification in Pending and returns the id.
2. **The delivery layer attempts to deliver.** The transport mechanism (webhook call, WebSocket push, email send, etc.) attempts to reach the recipient.
3. **Delivery outcome is recorded.** On success: `deliver(notification_id)` → Delivered. On transport failure: `fail(notification_id)` → Failed. On timeout without delivery: `expire(notification_id)` → Expired.
4. **Operators or retry logic consult pending notifications.** `pending_for(recipient_ref)` returns all notifications not yet resolved — input for retry scheduling, dashboards, or recipient-side inbox displays.

### Decision points

- **At `create(recipient_ref, payload)`** — `recipient_ref` and `payload` must be well-formed and non-empty; otherwise `invalid-request`. There is no uniqueness constraint: multiple notifications may be created for the same recipient with the same payload — each is a distinct delivery attempt with its own id and outcome.
- **At `deliver(notification_id)`** — `notification_id` must reference a known notification; otherwise `not-known`. The notification must be in Pending; transitioning a non-Pending notification is rejected as `not-pending`.
- **At `fail(notification_id)`** — same preconditions as `deliver`: `not-known` or `not-pending`.
- **At `expire(notification_id)`** — same preconditions: `not-known` or `not-pending`.
- **At `pending_for(recipient_ref)`** — no precondition. Returns an empty list if no Pending notifications exist for the recipient. The query is read-only.

### Behavior

Observed behavior, derived from how notification delivery systems are actually deployed:

- The three terminal states — Delivered, Failed, Expired — are mutually exclusive. A notification transitions from Pending to exactly one terminal state. Once terminal, no further transition is possible.
- Who calls `deliver`, `fail`, or `expire` is a deployment concern. In a push model, the delivery layer calls these after attempting to push. In a pull model, the application calls `deliver` when the recipient reads the notification. In a scheduled-expiry model, a background process calls `expire` for notifications that have been Pending past their deadline. The atom records the transition; the caller is the composing system's responsibility.
- Multiple Pending notifications for the same recipient are allowed and independent. Each has its own id, payload, and delivery lifecycle. `pending_for` returns all of them; the composing system decides the delivery order.
- No notification is deleted. All terminal records — Delivered, Failed, Expired — remain in the store for audit and operational purposes. `pending_for` excludes them; direct query by `notification_id` returns them.
- The atom does not implement retry logic. A Failed notification does not automatically trigger a new delivery attempt. If retry is desired, the composing system creates a new notification (`create(recipient_ref, payload)`) representing the retry attempt — a distinct record with a distinct id and its own outcome.
- Payload is stored and returned opaque. The atom does not parse, validate, or act on payload content. Whether the payload is a JSON object, a plain string, or a reference to another record is defined entirely by the composing system.

### Feedback

Each successful action produces an observable, measurable change:

- After `create` — a new notification appears in Pending with a fresh `notification_id`, the supplied `recipient_ref` and `payload`, and `created_at`. Total notification count increases by one. Pending count increases by one. The id is returned.
- After `deliver` — the notification at `notification_id` moves to Delivered with `delivered_at`. Pending count decreases by one; delivered count increases by one; total count unchanged.
- After `fail` — the notification moves to Failed with `failed_at`. Pending count decreases by one; failed count increases by one; total count unchanged.
- After `expire` — the notification moves to Expired with `expired_at`. Pending count decreases by one; expired count increases by one; total count unchanged.

Each rejected action produces an observable refusal: `invalid-request`, `not-known`, or `not-pending`.

The full notification set — Pending, Delivered, Failed, Expired — is queryable. Per-notification fields (id, recipient_ref, payload, created_at, status, terminal timestamp) are observable.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Notification immutability.** Once recorded, a notification's `notification_id`, `recipient_ref`, `payload`, and `created_at` never change.
- **Invariant 2 — Status monotonicity.** A notification's status transitions only from Pending to one terminal state: Delivered, Failed, or Expired. No notification returns from a terminal state to Pending or to another terminal state.
- **Invariant 3 — Terminal states are exclusive.** At most one of `delivered_at`, `failed_at`, `expired_at` is present for any notification. A notification in Delivered has `delivered_at` and no other terminal timestamp; likewise for Failed and Expired.
- **Invariant 4 — Terminal timestamps match status.** `delivered_at` is present if and only if status is `delivered`. `failed_at` is present if and only if status is `failed`. `expired_at` is present if and only if status is `expired`. A Pending notification has none of these timestamps.
- **Invariant 5 — Id stability.** A notification's `notification_id` is set on `create` and never changes.
- **Invariant 6 — No id reuse.** No two notifications share a `notification_id` across the lifetime of the system.
- **Invariant 7 — Pending query excludes terminals.** `pending_for(recipient_ref)` returns only notifications in Pending state for the queried recipient. Delivered, Failed, and Expired notifications are not included regardless of their `recipient_ref`.
- **Invariant 8 — Timestamp ordering.** For any notification in a terminal state, `created_at ≤ {delivered_at | failed_at | expired_at}`. This invariant is best-effort under non-monotonic clocks; if the underlying clock moves backward between `create` and the terminal action, the inequality may be violated. The implementor is responsible for the clock discipline that makes it hold; see Edge cases.

Notification immutability and terminal-state exclusivity together give the *auditability* property — the full delivery history of every notification is recoverable from the notification store alone. Status monotonicity and timestamp ordering together give the *operational readability* property — `pending_for` is a deterministic snapshot of unresolved deliveries at query time.

---

## Examples

The same atom, three domains, identical mechanic.

### Shared Todo — assignment notification delivery

A Notification Fanout pattern creates a notification when a task is assigned: `create(dev_d, {type: "task:assigned", task_id: t1, assigned_by: manager_m}) → notif_77`. The WebSocket layer pushes the payload to dev_d's active session and calls `deliver(notif_77)` → Delivered with `delivered_at`. Dev_d's inbox is empty: `pending_for(dev_d)` → `[]`.

If dev_d is offline, the push attempt fails: `fail(notif_77)` → Failed. The composing system may create a retry notification: `create(dev_d, {same payload}) → notif_78` — a new Pending record, distinct id, independent outcome.

If neither delivery nor failure is recorded within the expiry window: `expire(notif_77)` → Expired. The notification store records that delivery was never confirmed.

### Support queue — escalation alert

When queue 9 escalates, the fanout pattern creates one notification per subscribed supervisor. `create(supervisor_s, {type: "escalation", queue: 9, ticket: t22}) → notif_33`. Email delivery succeeds: `deliver(notif_33)` → Delivered. The audit trail shows: notification created at 14:02:11, delivered at 14:02:14, three seconds elapsed.

Supervisor_s later asks *"was I notified about the queue-9 escalation?"* — `pending_for(supervisor_s)` returns an empty list (nothing pending), and querying `notif_33` directly shows status `delivered` with `delivered_at`. The delivery record answers the question from stored fields alone.

### Compliance system — policy change

An administrator broadcasts a policy update. Three compliance officers each receive a notification: `create(officer_a, {type: "policy:updated", policy_id: p7}) → notif_101`, similarly for officers b and c. Officer_a's email bounces: `fail(notif_101)`. Officers b and c are delivered successfully. The notification store shows: two Delivered, one Failed. An operator queries `pending_for` for each officer — empty for all three (none are Pending). Direct inspection of notif_101 shows `failed_at`; the composing system creates a retry or escalates to a secondary channel.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Routing and subscription evaluation.** This atom creates and tracks delivery records; it does not evaluate subscriptions or determine who should be notified. That belongs to a Notification Fanout composing pattern that wires Subscription + Notification + an event source.
- **Retry scheduling.** A Failed notification does not trigger a retry. Retry belongs to the composing system: create a new notification record for the retry attempt, with its own id and outcome. The atom does not prevent multiple independent notifications with the same payload.
- **Transport mechanism.** Whether delivery is via WebSocket, webhook, email, push notification, in-app message, or SMS is a deployment concern. The atom records the outcome (`deliver`, `fail`, `expire`); the mechanism that produces that outcome is out of scope.
- **Delivery ordering guarantees.** Multiple Pending notifications for the same recipient may be delivered in any order. If delivery ordering matters (e.g., notifications must arrive in creation order), the composing system is responsible for imposing it.
- **Recipient read confirmation vs. system delivery confirmation.** The atom's `deliver` action covers both — who calls it (the delivery layer vs. the recipient's read action) is a deployment policy. Deployments that distinguish "pushed to device" from "read by user" require two composing states or two notification records; the bare atom supports either model.
- **Payload validation and schema.** Payload is opaque. Whether a payload is well-formed, type-safe, or complete is the composing system's responsibility before calling `create`.
- **Notification deduplication.** Multiple `create` calls for the same (recipient_ref, payload) pair produce multiple distinct Pending notifications. There is no deduplication surface in the bare atom. Composing systems that require at-most-once delivery for a given event must guard against duplicate creation before calling `create`.
- **Recipient registration and lifecycle.** `recipient_ref` is opaque. Whether a recipient exists or has been deprovisioned is an Actor Registry concern.
- **Bulk expiry.** There is no bulk-expire surface. Expiring all Pending notifications past a deadline requires enumerating them via `pending_for` and calling `expire(notification_id)` for each.
- **Clock semantics.** `created_at`, `delivered_at`, `failed_at`, and `expired_at` are wall-time from the implicit clock. Clock skew, NTP adjustments, and timezone handling are deployment concerns. Invariant 8 is best-effort under non-monotonic clocks.

---

## Composition notes

Notification is freestanding and is designed to compose with:

- **[Subscription](./subscription.md)** — the interest record that determines who should receive a notification. The composing Notification Fanout pattern calls `Subscription.subscribers_for(event_scope)` and then `Notification.create(subscriber_ref, payload)` for each result.
- **Notification Fanout** *(forthcoming)* — the composition that wires Subscription + Notification + an event source into an end-to-end delivery pipeline. Notification Fanout is the composition that gives both atoms their operational meaning.
- **[Event Log](../temporal/event-log.md)** — records delivery attempts and outcomes as auditable events. Each `deliver`, `fail`, or `expire` call can be appended to an Event Log for replay and investigation.
- **[Actor Identity](../compliance/actor-identity.md)** — records who triggered the creation of a notification when attribution of notification source is required.
- **[Retention Window](../compliance/retention-window.md)** — the notification store must be retained for the regulatory or operational lifetime the deployment requires.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — composing systems that require at-most-once notification creation for a given event can use Duplicate Prevention to guard the `create` call.

---

## Standards references

- **Observer pattern** (GoF) — Notification is the structured-natural-language realization of the notification object: the message delivered from subject to observer.
- **SMTP / RFC 5321** — email delivery as the canonical push transport. The three terminal states (Delivered, Failed, Expired) map directly to SMTP disposition: 2xx success, 5xx permanent failure, and timeout without delivery.
- **HTTP webhooks** — POST-to-URL delivery model standard in web systems. `deliver` records a 2xx response; `fail` records a 4xx/5xx response or connection failure.
- **W3C Activity Streams 2.0** — semantic vocabulary for describing social and messaging events. Notification payloads in web deployments often conform to Activity Streams objects.
- **Apple Push Notification Service / Firebase Cloud Messaging** — platform push notification services where `deliver` corresponds to accepted delivery and `fail` corresponds to a rejected or unregistered token.
- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; `payload` as an opaque reference whose semantics are defined by the composing system.
- **Eiffel's design-by-contract** — preconditions on `deliver`, `fail`, and `expire`; named rejection reasons.

---

## Status

`draft` — structure and invariants specified; three cross-domain examples covering delivery, failure, and expiry; edge cases enumerate the composing-pattern concerns (routing, retry, transport, deduplication, ordering, recipient lifecycle). Awaiting full three-pass review.

---

## Lineage notes

*(To be populated after pressure-testing passes.)*
