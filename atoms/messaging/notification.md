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

The three terminal states are distinct because they answer different questions. Delivered: *did the recipient receive it?* Failed: *was delivery attempted and did the attempt not succeed?* Expired: *did this sit undelivered beyond the allowed window without a recorded failure?* Collapsing them into a single terminal state would hide information that operators, auditors, and retry logic each need separately.

This is a freestanding atom in the EOS sense. It has its own state (the notification set), its own actions (`create`, `deliver`, `fail`, `expire`, `status_of`, `pending_for`), and its own operational principles (notifications are immutable once recorded; terminal states are irreversible; `status_of` and `pending_for` are read-only queries). It does not implement routing, subscription evaluation, retry scheduling, or delivery transport. Each is a separate composable pattern; see Composition notes.

---

## Structure

### Identity model

Every notification known to the system has a **`notification_id`** — an opaque, immutable, system-generated identifier produced by `create`. The id is the notification's identity; the recipient reference and payload are immutable *properties* of the notification, not its identity.

The opaque-id model follows the same discipline used across the library. Identifying a notification by (recipient_ref, payload) would collapse independently-created notifications into a single record — a recipient may be notified of the same event scope multiple times (e.g., after re-subscribing), and each delivery attempt is a distinct record with its own outcome. Opaque ids preserve one-notification-one-id discipline.

Ids are not reused after a notification reaches a terminal state.

### Inputs

- A recipient reference identifying *who* the notification is addressed to. Opaque — the actor registry is a separate concern.
- A payload carrying *what* is being communicated. Opaque — the composing system defines payload structure and content. This atom stores and returns the payload unchanged; it does not inspect, parse, or validate its contents.
- Actions:
  - `create(recipient_ref, payload) → notification_id | rejected(reason)`
  - `deliver(notification_id) → ok | rejected(reason)`
  - `fail(notification_id) → ok | rejected(reason)`
  - `expire(notification_id) → ok | rejected(reason)`
  - `status_of(notification_id) → {notification_id, recipient_ref, payload, created_at, status, delivered_at?, failed_at?, expired_at?} | not-known`
  - `pending_for(recipient_ref) → [notification_id, ...]`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of notifications (Pending, Delivered, Failed, and Expired).
- For each notification: `notification_id`, `recipient_ref`, `payload`, `created_at`, `status`, and the applicable terminal timestamp (`delivered_at`, `failed_at`, or `expired_at`).
- `create` returns the new `notification_id` on success, or a rejection naming the failed precondition.
- `deliver`, `fail`, and `expire` return `ok` on success, or a rejection naming the failed precondition.
- `status_of` returns one of two first-class outcomes: the full notification record (all stored fields for that id), or `not-known` if no notification exists for the given id. Both are answers to the query, not success-failure pairs.
- `pending_for` returns the list of `notification_id` values for all Pending notifications addressed to the queried recipient. The list is unordered. Composing systems that require delivery in creation order must sort by `created_at` on the returned ids.

### State

A notification occupies one of four named states:

- **Pending** — the notification has been created and delivery has not yet been confirmed, failed, or expired.
- **Delivered** — the notification reached the recipient. Terminal.
- **Failed** — delivery was attempted and did not succeed. Terminal.
- **Expired** — the notification was not delivered and no failure was recorded within the allowed window. Terminal.

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
- `deliver(notification_id)` → the notification at `notification_id` moves Pending → Delivered; `delivered_at = now`. Returns `ok`. If `notification_id` is not known, returns `rejected(not-known)`. If the notification is not in Pending, returns `rejected(not-pending)`. State is unchanged on rejection.
- `fail(notification_id)` → the notification at `notification_id` moves Pending → Failed; `failed_at = now`. Returns `ok`. Same preconditions and rejection behavior as `deliver`.
- `expire(notification_id)` → the notification at `notification_id` moves Pending → Expired; `expired_at = now`. Returns `ok`. Same preconditions and rejection behavior as `deliver`.
- `status_of(notification_id)` → read-only query; no state change. Returns the full notification record for the given id, or `not-known` if no notification exists for that id.
- `pending_for(recipient_ref)` → read-only query; no state change. Returns the list of `notification_id` values for all Pending notifications where `notification.recipient_ref = recipient_ref`.

### Flow

1. **An event fires; the composing pattern creates a notification.** The Notification Fanout pattern (or equivalent) calls `create(recipient_ref, payload)` — the atom records the notification in Pending and returns the id.
2. **The delivery layer attempts to deliver (optional).** The transport mechanism (webhook call, WebSocket push, email send) attempts to reach the recipient. This step may be skipped entirely — a notification may be expired before any delivery attempt begins if the deadline passes first.
3. **Delivery outcome is recorded.** Exactly one of three transitions applies:
   - 3a. Transport succeeds: `deliver(notification_id)` → Delivered, `delivered_at` set.
   - 3b. Transport fails: `fail(notification_id)` → Failed, `failed_at` set.
   - 3c. Deadline passes without a delivery attempt, or without a recorded outcome: `expire(notification_id)` → Expired, `expired_at` set. Step 2 need not have occurred.
4. **Operators or retry logic consult notification state.** `pending_for(recipient_ref)` returns unresolved notifications; `status_of(notification_id)` returns the full record for any notification by id, including terminal ones.

### Decision points

- **At `create(recipient_ref, payload)`** — `recipient_ref` must be non-empty; otherwise `invalid-request`. There is no payload precondition beyond being present — a null or absent payload is rejected as `invalid-request`; any non-null payload, including an empty string or empty object, is accepted. The atom does not inspect, validate, or parse payload content. There is no uniqueness constraint: multiple notifications may be created for the same recipient with the same payload — each is a distinct delivery attempt with its own id and outcome.
- **At `deliver(notification_id)`** — `notification_id` must reference a known notification; otherwise `not-known`. The notification must be in Pending; transitioning a non-Pending notification is rejected as `not-pending`.
- **At `fail(notification_id)`** — same preconditions as `deliver`: `not-known` or `not-pending`.
- **At `expire(notification_id)`** — same preconditions: `not-known` or `not-pending`.
- **At `status_of(notification_id)`** — no precondition. Empty or malformed `notification_id` returns `not-known` — no notification has an empty id, so the result is structurally `not-known`. Both `not-known` and the full record are first-class outcomes; neither is a rejection.
- **At `pending_for(recipient_ref)`** — no precondition. Empty or malformed `recipient_ref` returns an empty list — no notification has an empty recipient, so the result is structurally empty. Returns an empty list if no Pending notifications exist for the recipient. The query is read-only.

### Behavior

Observed behavior, derived from how notification delivery systems are actually deployed:

- The three terminal transitions (`deliver`, `fail`, `expire`) are separate actions rather than a single `resolve(notification_id, outcome)` action. The likely objection: "they share identical preconditions and return shapes; a parameterized action would reduce duplication." The mechanism: keeping them separate preserves distinct action semantics — the delivery layer, failure handler, and expiry scheduler are independent actors with independent authorization surfaces; a parameterized outcome enum would introduce a new precondition (is the enum value valid?) that currently does not exist. The result: each terminal transition is an unambiguously-named operation with no shared enum validation burden.
- The three terminal states are mutually exclusive. A notification transitions from Pending to exactly one terminal state. Once terminal, no further transition is possible; `deliver`, `fail`, or `expire` called on a non-Pending notification returns `not-pending`.
- **`fail` vs. `expire` — a deployment policy.** Failed indicates an explicit delivery attempt that produced a definitive negative outcome (HTTP 5xx response, bounced email, invalid token, connection refused). Expired indicates that the allowed window elapsed without either a successful delivery or a recorded failure. Whether a connection timeout is `fail` or `expire` is the composing system's call; the atom only records the outcome, not how it was determined.
- Concurrent `deliver`, `fail`, or `expire` calls for the same `notification_id` resolve serially under the host environment's serialization guarantees. The first transition wins; subsequent calls receive `not-pending`.
- Who calls `deliver`, `fail`, or `expire` is a deployment concern. In a push model, the delivery layer calls these after attempting to push. In a pull model, the application calls `deliver` when the recipient reads the notification. In a scheduled-expiry model, a background process calls `expire` for notifications past their deadline. The atom records the transition; the caller is the composing system's responsibility.
- The atom does not enforce who may call `create` — any caller may create a notification for any recipient. Authorization to create belongs to the composing system.
- Multiple Pending notifications for the same recipient are allowed and independent. Each has its own id, payload, and delivery lifecycle. `pending_for` returns all of them; the composing system decides the delivery order.
- No notification is deleted. All terminal records — Delivered, Failed, Expired — remain in the store for audit and operational purposes. `pending_for` excludes them; `status_of(notification_id)` returns them.
- A Failed notification does not automatically trigger a retry. If retry is desired, the composing system creates a new notification record for the retry attempt — a distinct record with a distinct id and its own outcome (see Edge cases).
- Payload is stored and returned opaque. The atom does not parse, validate, or act on payload content. Whether the payload is a JSON object, a plain string, or a reference to another record is defined entirely by the composing system.
- `status_of` is a read-only query with no side effects. It returns all stored fields — including the opaque payload — for any notification in any state: Pending, Delivered, Failed, or Expired. No notification becomes inaccessible via `status_of` after reaching a terminal state; the record is durable for the lifetime of the system.

### Feedback

Each successful action produces an observable, measurable change:

- After `create` — a new notification appears in Pending with a fresh `notification_id`, the supplied `recipient_ref` and `payload`, and `created_at`. Total notification count increases by one. Pending count increases by one. The id is returned. Falsifiable: after `create(r, p) → n`, `status_of(n)` must return a record with `status = pending` and `recipient_ref = r`.
- After `deliver` — the notification moves to Delivered with `delivered_at`. Pending count decreases by one; delivered count increases by one; total count unchanged. Falsifiable: `status_of(n)` must return `status = delivered` and `delivered_at` must be set; `pending_for(recipient_ref)` must not include `n`.
- After `fail` — the notification moves to Failed with `failed_at`. Pending count decreases; failed count increases. Falsifiable: `status_of(n)` must return `status = failed` and `failed_at` set.
- After `expire` — the notification moves to Expired with `expired_at`. Pending count decreases; expired count increases. Falsifiable: `status_of(n)` must return `status = expired` and `expired_at` set.
- After `status_of` — no state change. Returns the full notification record or `not-known`.
- After `pending_for` — no state change. Returns the list of notification_ids in Pending state for the queried recipient.

`create` rejections: `invalid-request`. `deliver`, `fail`, `expire` rejections: `not-known`, `not-pending`.

The full notification set — Pending, Delivered, Failed, Expired — is queryable via `status_of` and `pending_for`.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Notification immutability.** Once recorded, a notification's `notification_id`, `recipient_ref`, `payload`, and `created_at` never change. Once set, `delivered_at`, `failed_at`, and `expired_at` never change. No field in the notification record is ever overwritten.
- **Invariant 2 — Status monotonicity.** A notification's status transitions only from Pending to one terminal state: Delivered, Failed, or Expired. No notification returns from a terminal state to Pending or transitions between terminal states.
- **Invariant 3 — Terminal states are exclusive.** At most one of `delivered_at`, `failed_at`, `expired_at` is present for any notification. A notification in Delivered has `delivered_at` and no other terminal timestamp; likewise for Failed and Expired. A Pending notification has none.
- **Invariant 4 — Terminal timestamps match status.** `delivered_at` is present if and only if status is `delivered`. `failed_at` is present if and only if status is `failed`. `expired_at` is present if and only if status is `expired`.
- **Invariant 5 — Id stability.** A notification's `notification_id` is set on `create` and never changes.
- **Invariant 6 — No id reuse.** No two notifications share a `notification_id` across the lifetime of the system.
- **Invariant 7 — Pending query excludes terminals.** `pending_for(recipient_ref)` returns only notifications in Pending state for the queried recipient. Delivered, Failed, and Expired notifications are not included regardless of their `recipient_ref`.
- **Invariant 8 — Timestamp ordering.** For any notification in Delivered state, `created_at ≤ delivered_at`. For any notification in Failed state, `created_at ≤ failed_at`. For any notification in Expired state, `created_at ≤ expired_at`. This invariant is best-effort under non-monotonic clocks; if the underlying clock moves backward between `create` and the terminal action, the inequality may be violated. The implementor is responsible for the clock discipline that makes each inequality hold; see Edge cases.

- **Invariant 9 — Notification durability.** Notifications are never deleted from the store. Once created, a notification record persists through all state transitions and remains queryable via `status_of` for the lifetime of the system. The total notification count is monotonically non-decreasing.

Notification immutability and durability together give the *auditability* property — the full delivery history of every notification is recoverable from the notification store alone, with no gaps. Terminal-state exclusivity and timestamp matching (Invariants 3 and 4) give the *unambiguous record* property — for any notification, exactly one delivery outcome is recorded and its timestamp is stable. Status monotonicity and timestamp ordering together give the *operational readability* property — `pending_for` is a deterministic snapshot of unresolved deliveries at query time.

---

## Examples

The same atom, three domains, identical mechanic.

### Shared Todo — assignment notification delivery

A Notification Fanout pattern creates a notification when a task is assigned: `create(dev_d, {type: "task:assigned", task_id: t1, assigned_by: manager_m}) → notif_77`. The WebSocket layer pushes the payload to dev_d's active session and calls `deliver(notif_77)` → Delivered. `status_of(notif_77)` returns `status = delivered`, `delivered_at` set. `pending_for(dev_d)` returns `[]`.

If dev_d is offline, the push attempt produces a connection error: `fail(notif_77)` → Failed. The composing system may create a retry notification: `create(dev_d, {same payload}) → notif_78` — a new Pending record, distinct id, independent outcome.

If neither delivery nor failure is recorded within the expiry window: `expire(notif_77)` → Expired. `status_of(notif_77)` returns `expired_at`.

### Support queue — escalation alert

When queue 9 escalates, the fanout pattern creates one notification per subscribed supervisor: `create(supervisor_s, {type: "escalation", queue: 9, ticket: t22}) → notif_33`. Email delivery succeeds: `deliver(notif_33)` → Delivered. `status_of(notif_33)` returns `status = delivered`, `delivered_at`. Elapsed delivery time is `delivered_at − created_at`.

Supervisor_s later asks *"was I notified about the queue-9 escalation?"* — `pending_for(supervisor_s)` returns an empty list (nothing pending), and `status_of(notif_33)` returns `status = delivered` with `delivered_at`. The delivery record answers the question from stored fields alone.

### Compliance system — policy change

An administrator broadcasts a policy update. Three compliance officers each receive a notification: `create(officer_a, {type: "policy:updated", policy_id: p7}) → notif_101`, similarly for officers b and c. Officer_a's email bounces: `fail(notif_101)`. Officers b and c are delivered successfully. `status_of(notif_101)` shows `failed_at`; `status_of(notif_102)` and `status_of(notif_103)` show `delivered_at`. An operator queries `pending_for` for each officer — empty for all three. The notification store shows: two Delivered, one Failed; the composing system creates a retry for officer_a or escalates to a secondary channel.

### Regulated adversarial scenarios

Three scenarios the notification store must survive in regulated contexts:

- **Regulator audit — demonstrate all notifications for a compliance event.** A compliance auditor asks *"show all notifications created for the policy:updated event on 2025-03-14, and whether each was delivered."* The auditor queries the notification store for notifications where `created_at` falls on 2025-03-14 and the payload references the relevant policy. `status_of` for each returned id shows the delivery outcome — `delivered_at`, `failed_at`, or `expired_at`. The notification store answers from stored fields alone; Invariants 1 and 3-4 guarantee the delivery record is complete and unambiguous.
- **Disputed delivery — actor claims they were not notified.** Officer_a claims they received no notification of policy update p7. The investigator queries the notification store for notifications where `recipient_ref = officer_a` and the payload references `policy_id: p7`. If a record exists with `delivered_at` set, Invariant 1 (notification immutability) is the structural answer: the notification was created with that recipient and delivery was confirmed at that time. If the record shows `failed_at` or `expired_at`, the store confirms delivery was not completed and documents why. The notification store is the single source of truth; no external corroboration is required.
- **Breach investigation — identify Pending notifications that may have exposed payload data.** A security incident requires identifying all notifications that were Pending at the time of breach (2025-06-01T03:00Z) and may have carried sensitive payload data. The investigator queries for notifications where `created_at ≤ 2025-06-01T03:00Z` and either `status = pending` (still unresolved now) or the applicable terminal timestamp falls after 2025-06-01T03:00Z (meaning the notification was Pending during the breach window but has since resolved). The reconstruction logic mirrors the Subscription pattern: `created_at ≤ T` and (`status = pending` or `delivered_at > T` or `failed_at > T` or `expired_at > T`). `status_of` for each candidate returns the current record; `created_at` confirms the exposure window. The notification store answers the exposure scope question from stored fields alone without recourse to logs or developer narration.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Routing and subscription evaluation.** This atom creates and tracks delivery records; it does not evaluate subscriptions or determine who should be notified. That belongs to a Notification Fanout composing pattern that wires Subscription + Notification + an event source.
- **Retry scheduling.** A Failed notification does not trigger a retry. The composing system creates a new notification record for the retry attempt: `create(recipient_ref, payload) → new_notification_id`. The retry is a distinct record with a distinct id and its own outcome. Both the original Failed record and the retry record are preserved in the store.
- **Transport mechanism.** Whether delivery is via WebSocket, webhook, email, push notification, in-app message, or SMS is a deployment concern. The atom records the outcome (`deliver`, `fail`, `expire`); the mechanism that produces that outcome is out of scope.
- **`fail` vs. `expire` boundary.** Whether a connection timeout, an invalid token, or a rate-limit response is `fail` or `expire` is a deployment policy the composing system defines. The atom only records which terminal transition was called; it does not inspect or validate the reason.
- **Delivery ordering guarantees.** Multiple Pending notifications for the same recipient may be delivered in any order. If delivery ordering matters, the composing system is responsible for imposing it. `pending_for` returns an unordered list; the composing system sorts by `created_at` if ordered delivery is required.
- **Recipient read confirmation vs. system delivery confirmation.** `deliver` covers system-level confirmation that the transport layer accepted the notification. Deployments that additionally require read confirmation (the recipient explicitly acknowledged the notification) should create two separate notification records: one for the push attempt (resolved with `deliver` or `fail` at push time) and one for the read-acknowledgement (resolved with `deliver` when the recipient acknowledges). The bare atom does not distinguish delivery from reading; the distinction requires two records.
- **Payload validation and schema.** Payload is opaque. Whether a payload is well-formed, type-safe, or complete is the composing system's responsibility before calling `create`.
- **Notification deduplication.** Multiple `create` calls for the same (recipient_ref, payload) pair produce multiple distinct Pending notifications. Composing systems that require at-most-once delivery for a given event should use Duplicate Prevention to guard the `create` call.
- **Recipient registration and lifecycle.** `recipient_ref` is opaque. Whether a recipient exists or has been deprovisioned is an Actor Registry concern.
- **Authorization to create.** The atom does not enforce who may call `create`. Any caller may create a notification for any recipient. Authorization to create belongs to the composing system.
- **Bulk expiry.** There is no bulk-expire surface. Expiring all Pending notifications past a deadline requires querying `pending_for` for each recipient and calling `expire(notification_id)` for each eligible id.
- **Atomicity and crash semantics.** Each terminal transition changes two fields simultaneously: `status` and one terminal timestamp. A crash mid-`deliver` that sets `delivered_at` without updating `status`, or vice versa, violates Invariant 4 (terminal timestamps match status). The implementor is responsible for the transactional boundary that makes both fields change together. The spec does not define recovery semantics for partial writes.
- **Payload data retention.** The notification store retains payload data for every notification for the lifetime of the system (Invariant 9). If payloads contain sensitive data — PII, financial records, medical information — the composing system is responsible for the retention policy. Retention Window is the composing pattern that bounds how long records must be kept and when they may be purged. The bare atom does not implement payload expiry or redaction.
- **Clock semantics.** `created_at`, `delivered_at`, `failed_at`, and `expired_at` are wall-time from the implicit clock. Clock skew, NTP adjustments, and timezone handling are deployment concerns. Invariant 8 is best-effort under non-monotonic clocks.

---

## Generation acceptance

A derived implementation of Notification is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the notification store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Enumerate every notification with its full delivery history.** `notification_id`, `recipient_ref`, `payload`, `created_at`, `status`, and the applicable terminal timestamp are present and queryable for every notification ever created. No notification is missing from the store.
- **Reconstruct the delivery status of any notification at any past point in time.** Given a `notification_id` and a timestamp, the auditor can determine what state the notification was in: if `created_at ≤ t` and no terminal timestamp is before `t`, the notification was Pending at `t`; if `delivered_at ≤ t`, it was Delivered; and so on. The timeline is exact (Invariants 1 and 8).
- **Confirm terminal state exclusivity.** For every notification, at most one of `delivered_at`, `failed_at`, `expired_at` is present. The auditor can verify this directly from the notification store (Invariant 3).
- **Confirm terminal timestamps match status.** For every notification, the presence of a terminal timestamp matches the `status` field exactly — no notification has `status = delivered` with `failed_at` set, or any other mismatch (Invariant 4).
- **Identify composing patterns active in this deployment.** Whether notification attribution (Actor Identity), event firing history (Event Log), deduplication (Duplicate Prevention), retention (Retention Window), and tamper-evidence on the notification store (Tamper Evidence) are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce a notification store and a query surface that pass the five checks above.

---

## Composition notes

Notification is freestanding and is designed to compose with:

- **[Subscription](./subscription.md)** — the interest record that determines who should receive a notification. The composing Notification Fanout pattern calls `Subscription.subscribers_for(event_scope)` and then `Notification.create(subscriber_ref, payload)` for each result.
- **Notification Fanout** *(forthcoming)* — the composition that wires Subscription + Notification + an event source into an end-to-end delivery pipeline. Notification Fanout is the composition that gives both atoms their operational meaning.
- **[Event Log](../temporal/event-log.md)** — records delivery attempts and outcomes as auditable events. Each `deliver`, `fail`, or `expire` call can be appended to an Event Log for replay and investigation.
- **[Actor Identity](../compliance/actor-identity.md)** — records who triggered the creation of a notification when attribution of notification source is required.
- **[Retention Window](../compliance/retention-window.md)** — the notification store must be retained for the regulatory or operational lifetime the deployment requires.
- **[Tamper Evidence](../compliance/tamper-evidence.md)** — in regulated contexts, the notification store is a target for after-the-fact manipulation. Cryptographic commitment makes any rewrite detectable.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — composing systems that require at-most-once notification creation for a given event can use Duplicate Prevention to guard the `create` call.

---

## Standards references

- **Observer pattern** (GoF) — Notification is the structured-natural-language realization of the notification object: the message delivered from subject to observer.
- **SMTP / RFC 5321** — email delivery as the canonical push transport. The three terminal states map directly to SMTP disposition: 2xx success (Delivered), 5xx permanent failure (Failed), and timeout without delivery (Expired).
- **HTTP webhooks** — POST-to-URL delivery model standard in web systems. `deliver` records a 2xx response; `fail` records a 4xx/5xx or connection failure.
- **W3C Activity Streams 2.0** — semantic vocabulary for describing social and messaging events. Notification payloads in web deployments often conform to Activity Streams objects.
- **Apple Push Notification Service / Firebase Cloud Messaging** — platform push notification services where `deliver` corresponds to accepted delivery and `fail` corresponds to a rejected or unregistered token.
- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; `payload` as an opaque reference whose semantics are defined by the composing system.
- **Eiffel's design-by-contract** — preconditions on `deliver`, `fail`, and `expire`; named rejection reasons.

---

## Status

`grounded` — structure and invariants specified; `status_of` query added after Pass 2 identified the missing read surface; Invariant 8 corrected to conditional-per-state form after Pass 1 identified the set-notation error; regulated adversarial scenarios and generation acceptance added after Pass 3 surfaced the compliance example obligation; three-pass lineage records all findings and resolutions. Second entry in `atoms/messaging/`.

---

## Lineage notes

This atom is the second entry in the `messaging/` category, drafted alongside Subscription as the two-atom foundation for the forthcoming Notification Fanout composition.

**Pass 1 — Structural completeness (GRID).** Three findings.

- *Invariant 8 used non-standard set-notation.* The original form `created_at ≤ {delivered_at | failed_at | expired_at}` is ambiguous — the brace-pipe construct does not appear in any prior atom and is not defined. Personal Todo's Lineage notes canonicalized the "chain inequality with optional terms" error as a known Pass 3 class; Notification repeated it. Fixed: Invariant 8 now states three separate conditional inequalities — one per terminal state.
- *Flow node collapsed three terminal branches into one step.* The `deliver`, `fail`, and `expire` transitions were combined into a single parenthetical in Flow step 3, understating the branching structure. Fixed: Flow step 3 now names three explicit sub-branches (3a Delivered, 3b Failed, 3c Expired) with each terminal action and its timestamp consequence.
- *State Transitions did not cross-reference Decision points on rejection.* The Transitions list described successful state changes without noting that precondition failures leave state unchanged and refer to Decision points for rejection reasons. Fixed: each of the three terminal transitions now notes rejection behavior inline.

**Pass 2 — Conceptual independence (EOS).** Three findings.

- *`status_of` query missing.* The Examples section said "querying notif_33 directly shows status `delivered`" and Edge cases said "direct query by `notification_id` returns terminal records" — but no `status_of` action was specified. The atom assumed a read capability it did not define. Fixed: `status_of(notification_id) → record | not-known` added to Inputs, Outputs, Transitions, Decision points, Behavior, and Feedback.
- *Payload precondition contradicted opaque posture.* Decision points said `create` rejects `invalid-request` for non-"well-formed" payload, but the atom also says it does not inspect payload content. An opaque atom cannot evaluate well-formedness. Fixed: the payload precondition now states only that a null or absent payload is rejected; any non-null payload is accepted. "Well-formed" removed.
- *Retry description in Behavior described composing-system behavior.* One sentence explained what the composing system should do for retry. Behavior should describe what the atom does, not what composing systems do; composing-system obligations belong in Edge cases. Fixed: sentence removed from Behavior; Edge cases retry entry now carries the full description.

**Pass 3 — Adversarial scrutiny (Linus mode).** Five findings.

- *Three-action vs. parameterized-action choice undefended.* `deliver`, `fail`, and `expire` have identical preconditions and return shapes; collapsing them into `resolve(id, outcome)` is a real alternative. The design choice was not defended in-line. Fixed: Behavior now carries the four-step rubric defense (separate authorization surfaces, no enum validation burden).
- *`fail` vs. `expire` boundary unnamed as deployment policy.* The spec described the two terminal failure states without naming who decides the boundary between them. A connection timeout could be either. Fixed: Behavior explicitly names this as a deployment policy and gives examples of each (HTTP 5xx = `fail`; elapsed window without record = `expire`).
- *Concurrent terminal call race condition unnamed.* Two concurrent `deliver` and `expire` calls for the same notification_id are a real operational scenario; the first wins and the second gets `not-pending`. Not named. Fixed: Behavior now states serial resolution under host serialization guarantees.
- *Atomicity and crash semantics absent.* Each terminal transition changes two fields (`status` and one terminal timestamp) that must change together. A partial write violates Invariant 4. Personal Todo names this explicitly. Fixed: Edge cases now carries the atomicity note.
- *Regulated adversarial scenarios and generation acceptance missing.* The compliance system example (policy change broadcast, officer notification audit) invokes a regulated domain; library rules require both sections. Fixed: both sections added, with three adversarial scenarios covering regulator audit, disputed delivery, and breach investigation.

**Second-pass review — seven additional findings, all closed.**

- *`status_of` return signature used `[terminal_timestamp]` notation.* The bracket implied a single optional field called `terminal_timestamp`; the actual record has three distinct named optional fields (`delivered_at?`, `failed_at?`, `expired_at?`). An implementor reading only the Inputs section could produce one field instead of three, breaking the audit surface. Fixed: signature updated to `delivered_at?, failed_at?, expired_at?`.
- *Flow step 2 assumed delivery is always attempted.* "The delivery layer attempts to deliver" was presented as a required step before the outcome branches, but a notification may be expired before any delivery attempt begins. Fixed: step 2 now marked optional; branch 3c explicitly notes that step 2 need not have occurred.
- *`status_of` and `pending_for` with empty/malformed inputs unspecified.* Decision points said "no precondition beyond id presence" without defining the empty-input outcome. Fixed: both now explicitly state that empty inputs return `not-known` and `[]` respectively, by the same rationale as `subscribed`/`subscribers_for` in Subscription.
- *`status_of` missing from Behavior section.* Every other action had behavioral observations; `status_of` was covered in Outputs and Decision points but not Behavior. Fixed: note added stating `status_of` is read-only, returns payload through all states including terminal, and no notification becomes inaccessible after resolution.
- *Terminal timestamp immutability not an invariant.* Invariant 1 covered the four creation-time fields; the State section stated `delivered_at`, `failed_at`, `expired_at` "never change after set" informally but this was not elevated to an invariant. The Generation acceptance argument depends on it. Fixed: Invariant 1 extended to cover terminal timestamps explicitly.
- *No notification durability invariant.* "No notification is deleted" appeared in Behavior and Generation acceptance but not as a formal invariant. Fixed: Invariant 9 added — notification records are durable; total count is monotonically non-decreasing.
- *Breach adversarial scenario used incorrect historical-status language.* "Status = pending at that time" conflates current status with historical status. A notification Pending at breach time but since delivered shows `status = delivered` now; the reconstruction requires timestamp logic, not current-status filtering. Fixed: breach scenario now uses the correct reconstruction: `created_at ≤ T` and (`status = pending` or applicable terminal timestamp > T), mirroring the Subscription regulated scenarios.
