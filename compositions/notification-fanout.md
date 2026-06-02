---
title: Notification Fanout
parent: Compositions
nav_order: 5
has_toc: true
toc: true
---

# Notification Fanout

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A composition: when an event fires against a named scope, every currently-Active subscriber for that scope receives a Notification record. Composes [Subscription](../atoms/messaging/subscription.md) with [Notification](../atoms/messaging/notification.md) to produce the end-to-end delivery pipeline — from the query *"who should receive this?"* through the per-recipient record *"a delivery attempt was made."*

---

## Intent

Subscription and Notification are freestanding atoms (specs that can be specified without naming any other pattern): Subscription records who is interested in what; Notification records whether a piece of information reached a recipient. Neither knows about the other. What neither can do alone is answer the question that arises when an event fires: *for every subscriber currently Active on this scope, produce a delivery record.* That is the fanout operation — and it is a composition concern, not an atom concern.

The composition is structurally simple: one query (`Subscription.subscribers_for`) followed by N creates (`Notification.create`, one per returned subscriber). Its architectural significance is that it is the first place in the library where a single trigger produces a variable number of effects — N notification records, where N is the count of Active subscribers at trigger time. This is not a single transition with N side effects; it is a directed invocation graph (a representation of all the calls the composition makes and their dependencies — one query feeds N independent creates) with one query edge and N create edges. The fan-out is the composition; the atoms remain closed single-transition state machines.

The composition makes two architectural commitments explicit. First, the subscriber set is determined once at trigger time — a subscriber who cancels after the `subscribers_for` query executes still appears in that invocation's fanout; a subscriber who joins after it does not. Second, fan-out failures are per-recipient and non-aborting — a `storage-failure` creating one recipient's notification record does not cancel the creates for remaining recipients. Both commitments follow from the boundary rule for parallel composition: no rollback guarantee exists across independent create operations.

---

## Summary

Notification Fanout connects an event to everyone who wants to hear about it. It combines two simpler patterns: one that records who is interested in which kind of event (Subscription) and one that creates a delivery record for one recipient and tracks whether it succeeded (Notification). Neither can do the job alone — the first knows who is interested but cannot deliver, the second can record a delivery but cannot decide who should get it. When an event fires, the composition asks the subscription list who is currently subscribed to that event's topic and then creates one delivery record for each of them. The subscriber list is fixed at the moment the event fires — someone who cancels a split second later still gets a record for this one, someone who joins later does not — and a failure creating one person's record does not stop the others. Combining the two patterns guarantees that every current subscriber gets exactly one record per event (or the failure is named in the result, never hidden), and that all records from one event carry the same content. The composition keeps no state of its own; audit, replay, and deduplication are added by further patterns layered alongside it.

The most common uses are compliance and policy-change broadcast systems where every subscribed officer must receive a delivery record that can be audited; product and project management platforms where task events notify all interested team members; and any distributed system where an action in one domain must propagate to a variable number of downstream consumers without the emitting component knowing who they are.

---

## Composes

- **[Subscription](../atoms/messaging/subscription.md)** — provides the Active subscriber set and the `subscribers_for(event_scope)` query surface. The composition reads but never writes the subscription store.
- **[Notification](../atoms/messaging/notification.md)** — provides the per-recipient delivery record and the `create(recipient_ref, payload)` action. The composition creates one Notification record per subscriber returned by the Subscription query.

---

## Composition logic

### Application state

None. Notification Fanout has no persistent state of its own beyond its constituents' stores. The Subscription store owns who is subscribed; the Notification store owns what was created and its delivery outcome. The composition is a stateless interpreter of a directed invocation graph over these two stateful atoms.

If a system needs to record that a particular event triggered a particular fanout — for audit, replay, or deduplication — it composes Event Log or Duplicate Prevention alongside this composition. Those concerns do not belong to the bare fanout mechanism.

### Primitive policies

Composition-boundary validation for `fanout`'s two inputs:

- **`event_scope`** — must be non-null and non-empty string (rejection: `invalid-request`). The atom treats the scope value as opaque; no normalization, no case folding, no length cap imposed at this layer. Comparison is exact-match when passed to `Subscription.subscribers_for`. Validated before any id is generated or constituent called.
- **`payload`** — must be non-null (rejection: `invalid-request`). Content is opaque and passed to each `Notification.create` call unchanged. Schema validation, size limits, and content restrictions belong to the composing system before calling `fanout`.

### The load-bearing wiring decision

The decision the composition exists to enforce: **when a fanout invocation fails for some subscribers, the invocation continues for the remaining subscribers and names the failures in its result rather than aborting.**

*Principle.* A subscriber fanout is a parallel operation: each recipient's delivery record is independent. The composition must choose between all-or-nothing (abort on first failure, guarantee consistency) and continue-and-name-failures (deliver to the reachable set, surface the unreachable set). The composition chooses the latter.

*Likely objection.* "Shouldn't a regulated notification fanout guarantee every subscriber was reached, or none?" The all-or-nothing design would guarantee no subscriber receives a notification when the store is briefly unavailable for any single subscriber — regardless of the event's stakes. This is almost never the right tradeoff: it trades guaranteed delivery to the reachable majority for consistency with the unreachable minority.

*Mechanism.* Parallel composition carries no rollback guarantee. Each `Notification.create` call is independently committed. The composition has no transactional boundary spanning the N creates; providing one would require distributed transaction semantics and would serialize what is fundamentally a parallel operation. The `failed` list is the pressure valve: it makes the tradeoff explicit rather than silent. The composing system receives the failure information and applies its own policy — accept-the-loss for low-stakes events, retry or escalate for high-stakes ones.

*Result.* Fanout coverage (Invariant 1) guarantees that every subscriber is accounted for in `created` or `failed`. No subscriber is silently missed. The composition's job is mechanism; policy lives in the caller. For regulated deployments, the `failed` list combined with Event Log and Audit Trail gives the auditor a complete, attributed record of which subscribers were reached and which were not — the structural answer a regulator can verify from records alone.

### Action wiring

The composition exposes a single action:

**`fanout(event_scope, payload) → {fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...]} | rejected(invalid-request | subscribers-unavailable)`**

1. Validate inputs: `event_scope` must be non-empty; `payload` must be non-null. If either condition fails, return `rejected(invalid-request)`. No id is generated; no subscriber query is made; no notification records are created. This mirrors the constituent atoms' own validation: `Subscription.subscribe` rejects empty `event_scope`; `Notification.create` rejects null `payload`.
2. Generate `fanout_id` — an opaque (system-generated with no meaningful content), invocation-unique identifier (a direct effect: `entropy.generate()`). This id is the correlation handle for this invocation. When Event Log is composed in, the caller uses `fanout_id` as the log entry's reference, binding the invocation record to its subscriber list and created notification_ids. Without Event Log, `fanout_id` is ephemeral — returned to the caller for transient correlation but not persisted by the composition.
3. Call `Subscription.subscribers_for(event_scope)`.
   - If the subscription store is unavailable (infrastructure failure at the read step), return `rejected(subscribers-unavailable)`. No notification records are created. `fanout_id` is not returned on rejection — the invocation did not complete.
   - If the result is an empty list, return `{fanout_id, created: [], failed: []}`. The fanout is complete; no subscribers are currently Active for this scope.
4. For each `subscriber_ref` in the returned list, call `Notification.create(subscriber_ref, payload)`.
   - If `create` returns a `notification_id`, add it to the `created` list.
   - If `create` returns `rejected(storage-failure)`, add `subscriber_ref` to the `failed` list. Continue to the next subscriber; do not abort the fan-out.
   - If `create` returns `rejected(invalid-request)`, this indicates a structural inconsistency — `subscriber_ref` is non-empty (it was returned from the subscription store) and payload passed input validation in step 1. Treat as equivalent to `storage-failure` for that subscriber; add to `failed`. Continue.
5. Return `{fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...]}`.

The order of `create` calls across subscribers is not guaranteed. Parallel execution is permitted provided the implementation guarantees each `Notification.create` call is independently committed — no shared transaction boundary across the N creates. The result's `created` and `failed` lists are unordered.

**The fan-out continues through failures.** A `storage-failure` on one subscriber's `Notification.create` does not abort the fan-out for remaining subscribers. This follows directly from the composition boundary rule: parallel composition carries no rollback guarantee. A subscriber not in the `created` list is one for whom no delivery record exists; the composing system is responsible for inspecting the `failed` list and deciding whether to retry.

### Retry semantics

A caller who receives a non-empty `failed` list and wishes to retry has two options. First: call `Notification.create(subscriber_ref, payload)` directly for each subscriber_ref in the `failed` list — this retries exactly the failed creates without re-querying the subscriber set. Second: call `fanout` again — this re-queries `subscribers_for`, which may return a different subscriber set if subscriptions have changed in the interim. The first option is correct when the caller needs to deliver to exactly the original fanout's subscriber set; the second is correct when delivering to the current Active set is the right behavior. Callers who need at-most-once fanout semantics across retries should compose Duplicate Prevention to guard the `fanout` call itself; see Edge cases.

All entries in the `failed` list are treated as retry-eligible regardless of the underlying rejection reason — `storage-failure` and the structurally-inconsistent `invalid-request` case (see action wiring step 3) are collapsed into a single "delivery did not record" outcome. A retry for a structurally-inconsistent subscriber_ref will fail again with the same rejection; persistent failure for a specific `subscriber_ref` across multiple retries indicates a structural inconsistency that the composing system must resolve out-of-band (the subscriber_ref is malformed, the notification store has rejected the payload shape, etc.). The composition does not surface the underlying reason — callers needing reason-level diagnostics compose Event Log to capture each `Notification.create` outcome at the call site.

---

## Composition-level invariants

These invariants emerge from the composition. Neither constituent atom carries them alone.

- **Invariant 1 — Fanout coverage.** For any `fanout(event_scope, payload)` invocation that returns a result (not `rejected`), exactly one `Notification.create` call is attempted for each subscriber_ref returned by `Subscription.subscribers_for(event_scope)` at the time of the query. No subscriber is skipped; no subscriber outside the query result receives a create call. The `created` and `failed` lists together account for every subscriber in the query result: `|created| + |failed| = |subscribers_for result|`.
- **Invariant 2 — Payload consistency.** All Notification records created in a single `fanout` invocation carry the same payload. A subscriber cannot receive a different payload than another subscriber from the same invocation.
- **Invariant 3 — No cross-notification coupling.** A storage failure creating a notification for subscriber A does not affect the notification record created for subscriber B. Each `Notification.create` call is independent; its success or failure is isolated to that record.
- **Invariant 4 — At-most-one notification per subscriber per fanout.** `Subscription.subscribers_for` returns at most one entry per subscriber_ref for a given scope (Subscription Invariant 6 — at most one Active subscription per (subscriber_ref, event_scope) pair). The composition calls `Notification.create` at most once per returned subscriber_ref per invocation. A single fanout produces at most one notification per subscriber.
- **Invariant 5 — Subscription store is read-only.** The composition never writes to the subscription store. `Subscription.subscribers_for` is the only call made against the Subscription atom. No subscription is created, modified, or cancelled by the fanout action.
- **Invariant 6 — Notification atom invariants preserved.** All nine Notification invariants hold over each created record. The composition does not bypass Notification's preconditions or write to the notification store directly.
- **Invariant 7 — Subscription atom invariants preserved.** All nine Subscription invariants hold. The composition reads the subscription store through the declared Q surface; it does not join the subscription table directly.
- **Invariant 8 — Fanout invocation uniqueness.** Each `fanout` invocation that returns a result (not `rejected`) is assigned a unique `fanout_id`. No two invocations share a `fanout_id` across the lifetime of the system. `fanout_id` is generated before any constituent calls; it is present in every non-rejected result, including the empty-subscriber case. When Event Log is composed in, `fanout_id` is the durable invocation identity. Without Event Log, `fanout_id` is ephemeral — the caller receives it and may use it for transient correlation, but the composition does not persist it.

Fanout coverage (Invariant 1) and at-most-one-per-subscriber (Invariant 4) together give the *delivery scope completeness* property — every currently-Active subscriber receives exactly one notification record per invocation, or the failure is named. Payload consistency (Invariant 2) and no cross-notification coupling (Invariant 3) give the *independent delivery record* property — each recipient's record is self-contained and its lifecycle is not affected by any other recipient's outcome.

---

## Examples

### Walkthrough

A project management system uses Notification Fanout to notify subscribers when a task is assigned.

1. **Three team members subscribe.** `Subscription.subscribe(dev_a, "task:assigned") → sub_a1`. Same for dev_b and dev_c.
2. **A task is assigned; the fanout fires.** `fanout("task:assigned", {task_id: t7, assigned_by: manager_m})`:
   - `fanout_id = fanout_f01` generated.
   - `Subscription.subscribers_for("task:assigned") → [dev_a, dev_b, dev_c]`
   - `Notification.create(dev_a, payload) → notif_41`
   - `Notification.create(dev_b, payload) → notif_42`
   - `Notification.create(dev_c, payload) → notif_43`
   - Returns `{fanout_id: fanout_f01, created: [notif_41, notif_42, notif_43], failed: []}`.
3. **dev_b cancels before the next event.** `Subscription.cancel(sub_b1) → ok`.
4. **A second task is assigned.** `fanout("task:assigned", {task_id: t8, assigned_by: manager_m})`:
   - `fanout_id = fanout_f02` generated.
   - `subscribers_for → [dev_a, dev_c]` — dev_b is now Cancelled; not returned.
   - Returns `{fanout_id: fanout_f02, created: [notif_51, notif_52], failed: []}`.
5. **dev_b's earlier notifications are unaffected.** `Notification.status_of(notif_42)` returns the full record; the subscription cancellation does not delete prior notification records (Notification Invariant 9).

### Invalid input

A caller passes a null payload.

- `fanout("task:assigned", null)` → step 1: payload is null; validation fails immediately before any id is generated or any constituent is called.
- Returns `rejected(invalid-request)`. No `fanout_id` is generated; no subscriber query is made; no notification records are created.

The same rejection fires for an empty event_scope: `fanout("", {task_id: t9})` → `rejected(invalid-request)`.

### Subscription store unavailable

The subscription store is down when the fanout fires.

- `fanout("task:assigned", {task_id: t9, assigned_by: manager_m})` → step 3: `Subscription.subscribers_for` fails with an infrastructure error.
- Returns `rejected(subscribers-unavailable)`. No notification records are created; the `fanout_id` generated in step 2 is discarded and not returned — the invocation did not complete. The caller may retry when the store recovers.

### Partial failure

During a fanout, the notification store becomes temporarily unavailable after the first create succeeds.

- `fanout_id = fanout_f03` generated.
- `subscribers_for → [dev_a, dev_b, dev_c]`
- `Notification.create(dev_a, payload) → notif_61` ✓
- `Notification.create(dev_b, payload) → rejected(storage-failure)` ✗
- `Notification.create(dev_c, payload) → notif_62` ✓ (fan-out continues)
- Returns `{fanout_id: fanout_f03, created: [notif_61, notif_62], failed: [dev_b]}`.

The caller inspects the `failed` list and calls `Notification.create(dev_b, payload) → notif_63` directly. That new record enters Pending independently; dev_a's and dev_c's records are already in their own delivery lifecycles.

### Compliance system — policy change broadcast

An administrator publishes a revised data-handling policy. Every compliance officer with an Active subscription to `policy:updated` events must receive a notification. `fanout("policy:updated", {policy_id: p12, effective_date: "2025-09-01"})` fires. Three officers are Active; three Notification records are created. Each officer's delivery outcome is tracked independently: officer_a delivered, officer_b failed (email bounce), officer_c expired (no delivery attempt within the window).

An auditor later asks: *was every subscribed compliance officer notified of policy p12?* The auditor queries the notification store for records where `payload.policy_id = p12`. Three records appear — one per officer — with their respective delivery outcomes. The Subscription store shows each officer held an Active subscription for the `policy:updated` scope. Invariant 1 gives the structural answer: the `created` set accounts for all subscribers returned by the fanout query. For a precise binding to the exact fanout invocation — confirming no Active subscriber at that specific moment was omitted — a composed Event Log recording the fanout with `fired_at` provides the timestamp needed to apply Subscription's historical-state filter; without it, Active-status confirmation is over the general period rather than the exact fanout moment.

### Regulated adversarial scenarios

- **Regulator audit — demonstrate all subscribers were notified of a compliance event.** An auditor asks: *show all notification records created by the policy:updated fanout on 2025-08-15 and whether each was delivered.* The auditor queries the notification store for records where `created_at` falls on 2025-08-15 and the payload references the relevant policy. For each returned record, `status_of` shows the delivery outcome. Invariants 1 and 4 are the structural guarantees. Note on completeness: the Subscription store *does* support historical reconstruction of who was Active at any given moment — Subscription Invariant 9 (timestamp ordering) plus the immutable `subscribed_at` / `cancelled_at` fields make the filter `subscribed_at ≤ T` AND (`status = active` OR `cancelled_at > T`) exact to within Invariant 9's best-effort clock caveat. The actual completeness gap is different: the auditor needs to know the *exact fanout time* — the moment of the `subscribers_for` query — to apply the filter. The Subscription store doesn't record fanout invocations; that timestamp lives in Event Log, not Subscription. A composed Event Log recording the fanout invocation with its `fired_at` timestamp (see Generation acceptance check 1) is therefore required to bind the audit to a specific fanout invocation among potentially many for the same scope. Without it, the auditor can identify who was notified from the notification records, but cannot pin the audit to one specific fanout.
- **Disputed notification — subscriber claims they were never notified.** An officer claims no notification of policy p12 arrived. The investigator queries the notification store for records where `recipient_ref = officer_ref` and `payload.policy_id = p12`. If a record exists in any state, the store confirms the delivery attempt and its outcome. If the record shows `failed_at` or `expired_at`, the store confirms delivery did not succeed; the `failed` list from the fanout result (logged via Event Log if composed) identifies this as a named failure, not a silent omission. If no record exists, either the officer had no Active subscription at fanout time (query the subscription store) or their create call returned `storage-failure` — again, a named failure, not a gap. The subscription and notification stores together answer the question.
- **Breach investigation — identify all notifications that may have carried sensitive payload data.** A security incident requires identifying every notification created by fanouts referencing policy p12. The investigator queries the notification store for records where `payload.policy_id = p12` and applies the historical-status reconstruction logic from Notification's regulated adversarial scenarios (`created_at ≤ breach_time` and status was Pending during the window). The notification store answers the exposure scope from stored fields alone.

---

## Edge cases and explicit non-goals

- **Fanout idempotency and crash-mid-execution.** The bare composition provides no idempotency guarantee. Two distinct failure modes require attention. First: if `fanout` is called twice for the same event (network retry, double-click, replay), two full rounds of `Notification.create` execute — two notification records per subscriber. Second, and more dangerous: if the composition crashes mid-execution after some creates have succeeded, the `{created, failed}` result is never returned. The caller has no record of which subscribers received a notification record; a retry without idempotency creates duplicates for subscribers whose creates already succeeded. In both cases, composing [Duplicate Prevention](../atoms/temporal/duplicate-prevention.md) to guard the `fanout` call provides at-most-once fanout semantics within the deduplication window. Without it, the caller must treat any retry as a potential duplicate-creation event and handle the resulting multiple notification records at the delivery layer.
- **Subscriber-set staleness between query and create.** `Subscription.subscribers_for` is called once at the start of the fanout. A subscriber who cancels after the query but before their `Notification.create` is called will still receive a notification record — their subscription was Active at query time. Whether the delivery should proceed is a deployment policy the composing system defines, not a correctness failure of the composition.
- **New subscribers after query.** A subscriber who becomes Active after `subscribers_for` executes does not receive a notification for that fanout invocation. They will receive notifications from subsequent fanouts. This is correct: the composition delivers to the Active set at trigger time.
- **Empty Active subscriber set.** `fanout` returns `{fanout_id, created: [], failed: []}`. No Notification records are created. This is a valid, non-error outcome. The `fanout_id` is still generated and returned — it is the invocation's correlation handle regardless of the subscriber count. The composing system may log this via Event Log if observability of empty fanouts is required.
- **Event scope hierarchy and wildcards.** `Subscription.subscribers_for` performs exact-match on the event scope. A subscriber with scope `task:*` does not receive notifications for `task:assigned` under the bare atoms. Scope hierarchy and pattern matching belong to a composing pattern that expands scope expressions before calling `subscribers_for`.
- **Delivery ordering.** Notification records are created in an unspecified order. The Notification atom does not guarantee delivery in creation order. If ordered delivery is required, the composing delivery layer sorts `Notification.pending_for` results by `created_at`.
- **Caller disposition on the `failed` list: transient failures vs. structural inconsistencies.** The composition returns `{failed}` rather than aborting on first `Notification.create` failure by design — the mechanism cannot know whether a missed delivery matters; only the caller can. An all-or-nothing design would guarantee no subscriber receives a notification when the store is briefly unavailable, regardless of the event's stakes. The current design guarantees delivery to every reachable subscriber and surfaces the unreachable set for policy-level disposition. Delivery to the reachable majority is almost always worth more than guaranteed consistency with the unreachable minority; the `failed` list is the pressure valve that makes the tradeoff explicit rather than silent.

  Two distinct failure conditions collapse into `failed`, and they carry different caller obligations. *Transient failures* — `Notification.create` returned `rejected(storage-failure)` — are retry-eligible: the subscriber_ref is valid, the payload passed validation, the notification store was temporarily unavailable. Calling `Notification.create(subscriber_ref, payload)` directly against the `failed` list will likely succeed when the store recovers. *Structural inconsistencies* — `Notification.create` returned `rejected(invalid-request)` despite the subscriber_ref being non-empty and the payload passing fanout's own validation — indicate a contract mismatch: Subscription's definition of a valid subscriber_ref does not match Notification's. A retry will fail with the same rejection. Persistent failure for a specific subscriber_ref across multiple retries is the diagnostic signal; the first failure is ambiguous.

  The composition collapses both into `failed` because it cannot classify the inconsistency without retrying and observing persistence — the caller, who knows the domain semantics of subscriber_ref, is better positioned to do that. Callers needing reason-level diagnostics at the first failure compose Event Log to capture each `Notification.create` outcome at the call site.

  Caller policy follows from the event's stakes. For low-stakes events — activity feeds, engagement notifications — inspecting the `failed` count, logging it, and accepting the loss is the appropriate disposition: the fanout reached all structurally valid subscribers, and the gap is named, not hidden. For high-stakes events — regulated notifications such as policy updates, account actions, and legal notices — the `failed` list is a delivery obligation: retry transient failures until the store recovers, and for persistent structural failures escalate to a secondary delivery channel (physical mail, phone, manual outreach) or record the gap in [Audit Trail](./audit-trail.md) as a named delivery failure with attribution and timestamp. In both cases the composition's behavior is identical; only the caller's policy differs. This is the boundary the composition enforces: mechanism here, policy in the composing system.

- **Retry targeting the original failed set.** A caller who retries `fanout` re-queries `subscribers_for`, which may return a different set than the original invocation. Callers who need to retry exactly the failed subscriber_refs should call `Notification.create` directly for each ref in the `failed` list rather than re-invoking `fanout`.
- **Transport mechanism.** This composition creates Notification records; it does not dispatch them to recipients. The delivery layer — WebSocket push, webhook POST, email send — reads `Notification.pending_for` and calls `deliver`, `fail`, or `expire`. Transport is a deployment concern outside this composition.
- **Authorization to fanout.** The composition does not enforce who may call `fanout`. Any caller may trigger a fanout for any event scope with any payload. Authorization belongs to the composing system — typically [Permissions](../atoms/compliance/permissions.md) gating the `fanout` action against the caller, optionally with [Actor Identity](../atoms/compliance/actor-identity.md) attesting who triggered the invocation when attribution is required for audit.
- **Payload size and content.** Payload is opaque and passed to `Notification.create` unchanged. Size limits, schema validation, and content restrictions belong to the composing system before calling `fanout`.
- **Fan-out at scale.** N sequential or parallel `create` calls scale with the Active subscriber count. For scopes with thousands of Active subscribers, the implementation must handle throughput concerns (batching, cursor-pagination of `subscribers_for`, parallel creates). The spec does not constrain the execution strategy as long as Invariant 1 (fanout coverage) holds.

---

## Generation acceptance

A derived implementation of Notification Fanout is *acceptable* when an external auditor, given the subscription store and notification store, can do all of the following without recourse to source code, runbooks, or developer narration.

### Record-clearable checks

These checks can be answered by reading the composition's stored records (subscription store, notification store, and Event Log where composed in):

- **Confirm fanout coverage for any recorded fanout.** Event Log composition is required for reliable fanout-coverage audits. The recommended Event Log entry shape — one entry per `fanout` invocation — is `{fanout_id, event_scope, payload_digest, created: [notification_id, ...], failed: [subscriber_ref, ...], fired_at}`. `fanout_id` is the durable invocation identity when Event Log is composed in; the caller passes the `fanout_id` returned by the fanout action as the log entry's reference field, binding the invocation record to its complete subscriber list and created notification_ids. Given an Event Log entry of this shape, the auditor can: (a) read the entry's `event_scope` and `fired_at`; (b) reconstruct the Active subscriber set at `fired_at` using Subscription's historical-state filter (`subscribed_at ≤ fired_at` AND (`status = active` OR `cancelled_at > fired_at`)); (c) verify every reconstructed Active subscriber appears either in `created` (each `notification_id` mapped via `Notification.status_of` to confirm the record exists with matching `recipient_ref`) or in `failed`; (d) confirm `|created| + |failed|` equals the size of the reconstructed Active set, satisfying Invariant 1 from records. Without a composed Event Log carrying these fields, fanout grouping by `created_at` clustering on the notification store is unreliable — concurrent creates across a measurable time span produce different timestamps, and concurrent unrelated fanouts on the same scope produce overlapping ones; `fanout_id` alone is insufficient without the log because the composition does not persist it.
- **Confirm payload consistency.** All Notification records produced by a single fanout carry the same payload. Identifying the fanout group requires the same Event Log entry as check 1 — the `created: [notification_id, ...]` list keyed by `fanout_id` is the authoritative grouping; without it, grouping by payload similarity is ambiguous when multiple concurrent fanouts share the same payload structure. Given the group, the auditor inspects the `payload` field of each record and confirms identity across all members.
- **Verify each Notification record independently.** Each record passes Notification's five Generation acceptance checks: full delivery history present, timeline reconstructable, terminal exclusivity confirmed, timestamp-status match confirmed, composing patterns identifiable.
- **Confirm no cross-notification coupling.** A terminal state on one notification record in the fanout group does not correlate with the terminal state on another. Each record's delivery outcome is independent.

### Externally-clearable checks

These questions arise around the composition but require deployment configuration or external evidence to answer:

- **Identify the composing patterns active in this deployment** — whether Event Log, Duplicate Prevention, Actor Identity, and Tamper Evidence are wired alongside the bare fanout mechanism, and with what configuration. The presence and configuration of these composing patterns is a deployment-level fact; the auditor must obtain this from the deployment configuration record or the operator, not from the subscription or notification stores alone.

---

## Standards references

- **Observer pattern** (GoF) — Notification Fanout is the Subject's `notify()` method: iterate the observer list, deliver the update to each. The atoms formalize what the pattern assumes.
- **Publish-subscribe** (Birman & Joseph, 1987; AMQP topic exchanges; Apache Kafka consumer groups) — the event-scope-to-subscriber binding is a topic subscription; `fanout` is message dispatch.
- **WebSub (W3C Recommendation)** — hub-based publish-subscribe; `fanout` corresponds to the hub's distribution step after a publisher notifies the hub of a content update.
- **W3C Activity Streams 2.0** — notification payloads in web deployments often carry Activity Streams objects; the fanout composition is payload-agnostic.
- **Outbox pattern** (Chris Richardson, *Microservices Patterns*) — for reliable fanout, the notification records produced by `fanout` are the outbox entries the delivery layer consumes. The composition produces the records; the delivery layer is out of scope.

It inherits from:

- **[Subscription](../atoms/messaging/subscription.md)** — standards inheritance in full: Observer pattern, pub-sub, WebSub.
- **[Notification](../atoms/messaging/notification.md)** — standards inheritance in full: Observer pattern, SMTP, HTTP webhooks, W3C Activity Streams, APNs/FCM.

---

## Status

`grounded — 2026-05-20` — three foundation passes complete; Opus adversarial pass (26 findings, all resolved); architectural decisions applied (Event Log optional, fanout_id ephemeral correlation handle with Event Log as durable identity when composed, subscribers-unavailable treated as explicit error).

---

## Lineage notes

Drafted as the fifth entry in `compositions/`, following Undo History, Idempotent Reservation, Audit Trail, and Shared Todo. First composition in the library with variable fan-out semantics — N effects from one trigger, where N is determined at runtime by the Active subscriber count.

The fan-out decomposition model was formalized in [`EXECUTION_CONTRACT.md`](../EXECUTION_CONTRACT.md) before drafting: fan-out is a decomposition boundary, not a single transition; the composition is a stateless interpreter of a directed invocation graph; no rollback guarantee exists across independent creates; partial failure is per-recipient and named in the result, not an abort condition. The draft follows this model directly.

**Conventions inherited from prior work.** *Regulated adversarial scenarios* and *Generation acceptance* are included because the compliance system example invokes a regulated domain (policy broadcast with mandated delivery to compliance officers), per the conventions in [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md). Inherited from the methodology directly; not re-derived from Notification or Subscription.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine GRID nodes resolved. Intent is testable and falsifiable via Invariant 1. Decision points cover all branching paths: `subscribers-unavailable` (abort before any creates), empty subscriber list (return empty result), `storage-failure` on a create (continue to next subscriber), `invalid-request` on a create (structural inconsistency — treated as `storage-failure`). Proof is measurable: generation acceptance names five checks an external auditor can run against the subscriber and notification stores. Application state is explicitly none; the rationale (Event Log and Duplicate Prevention as optional composing patterns) is named.

**Pass 2 — Conceptual independence (EOS — the Essence of Software, Daniel Jackson's concept framework).** Clean. No concerns are absorbed that belong elsewhere. Idempotency (Duplicate Prevention), audit history (Event Log), delivery transport (deployment concern), scope hierarchy (composing pattern), and authorization (composing system) are all correctly named as out-of-scope. The `{created, failed}` return structure is a return value from a single action invocation, not persistent state — no hidden store exists or is implied.

**Pass 3 — Adversarial scrutiny (Linus mode), first run.** Clean in-pattern; one cross-file finding deferred.

*In-pattern resolutions:* Parallel execution constraint named explicitly — no shared transaction boundary across the N creates. Retry targeting distinction made explicit. Subscriber-set staleness committed to trigger-time semantics. The `invalid-request` edge case (structurally inconsistent) named and handled consistently with `storage-failure`.

*Cross-file finding — deferred:* `Subscription.subscribers_for` does not name a store-unavailable outcome in its Decision points. This composition correctly handles it as `rejected(subscribers-unavailable)`. The gap belongs to the Subscription atom's next refinement round.

**Pass 3, second run — five findings, all closed in-pattern.**

- *Missing input preconditions on `fanout` (Pass 3).* The action wiring had no precondition check on `event_scope` or `payload`. A null payload would silently route every subscriber to `failed` via the constituent's `invalid-request` path rather than failing fast. An empty `event_scope` would return `{created: [], failed: []}` — masking a likely caller error. Resolved: `invalid-request` added to the signature; step 1 added to the action wiring with explicit precondition checks matching the constituent atoms' validation patterns.
- *Missing rejection-path example (Pass 1/Pass 3).* No example showed the `rejected(subscribers-unavailable)` path. Resolved: "Subscription store unavailable" example added showing the clean abort case.
- *Crash-mid-execution not named (Pass 3).* The fanout idempotency edge case covered double-call but not crash-after-partial-creates. The crash scenario is more dangerous — no `{created, failed}` result returned, caller has no visibility into which creates succeeded, retry creates duplicates. Resolved: fanout idempotency edge case extended to name both failure modes and the Duplicate Prevention mitigation for each.
- *Generation acceptance check 1 unreliable without Event Log (Pass 3).* "`created_at` clustering" is not a reliable fanout-grouping mechanism. Resolved: check 1 rewritten to make Event Log composition a stated requirement for reliable fanout-coverage audits; unreliability of clustering noted explicitly.
- *Regulated adversarial scenario 1 assumes historical subscription state (Pass 3).* "Cross-referencing against the Subscription store confirms no Active subscriber was omitted" was false — the Subscription store shows current status, not status at fanout time. A subscriber Active at fanout time who has since cancelled is invisible as such. Resolved: scenario 1 updated to acknowledge this limitation and name Event Log composition as the structural solution for historical completeness.

**Refinement round — adversarial rerun.** Six findings — one critical stale cross-reference and five Pass 3 surfaces — all closed in-pattern.

- *Stale invariant count (Pass 1, critical).* Invariant 7 read "All **eight** Subscription invariants hold." Subscription has nine. This is exactly the failure mode `PRESSURE_TESTING.md` warned about ("Shared Todo, referencing 'nine Assignment invariants' after Assignment gained a tenth during its own refinement round") — encountered the second time in the library. Resolved: corrected to "All nine Subscription invariants hold." The structural risk (any invariant-count cross-reference goes stale the moment its constituent gains an invariant) remains and is flagged below as a library-wide concern.
- *`failed` list elides rejection reason (Pass 3).* Step 3 collapses `storage-failure` and `invalid-request` into the `failed` list with no reason distinction, but Retry semantics tells callers to retry by calling `Notification.create` directly — which will keep failing for the structurally-inconsistent case. Resolved: Retry semantics now states explicitly that all `failed` entries are retry-eligible regardless of underlying reason; persistent failure across retries indicates structural inconsistency the composing system resolves out-of-band; callers needing reason-level diagnostics compose Event Log at the call site.
- *Generation acceptance check 1 depended on an undefined Event Log entry shape (Pass 3).* The check said "via a composed Event Log — which records the invocation, the event scope, and the resulting `notification_id` set" without naming the entry shape. Event Log is a generic append-only log; the composing system decides what to record. Resolved: check 1 now names the recommended Event Log entry shape inline (`{event_type: "fanout", event_scope, fanout_time, created_notification_ids, failed_subscriber_refs}`) and reframes the check as a four-step procedure built around that shape's queryability.
- *First regulated adversarial scenario's reasoning was wrong; conclusion was right (Pass 3).* The scenario claimed the Subscription store "shows each subscriber's present status, not their status at fanout time" — but Subscription's own Generation acceptance check 2 demonstrates that historical Active-set reconstruction *is* supported from the Subscription store alone. The actual completeness gap is identifying the fanout time, which lives in Event Log. Conclusion (Event Log required) stands; reasoning was rewritten to bind the audit to a specific fanout invocation rather than misrepresenting Subscription's query power.
- *Authorization-to-fanout had no named composing pattern (Pass 3).* Edge cases named authorization as out-of-scope without linking any atom. Resolved: Permissions named as the typical authorization composing pattern, with Actor Identity for attribution when required.
- *Forthcoming-link cleanup propagated.* Subscription and Notification both still carried `*(forthcoming)*` markers on their Notification Fanout references after this composition had landed. Both markers removed; references linked. (Cross-file fix recorded in those atoms' refinement-round lineage entries as well.)

*Library-wide concerns surfaced but not resolved in this round* — recorded here for the next sweep:

- **Invariant-count cross-references remain structurally fragile.** The mechanical fix (drop counts, say "all Subscription invariants" without a number) loses precision but eliminates staleness risk. PRESSURE_TESTING.md already names this hazard; whether to do the library-wide rewrite is an authorial call. Encountered twice now (Shared Todo's nine-vs-ten on Assignment, this composition's eight-vs-nine on Subscription); the third encounter probably forces the convention.
- **Closed-action vs. open-audit tension.** The two constituent atoms' refinement rounds resolved this per-pattern by adding an explicit audit-surface preamble to each Generation acceptance section. A canonical statement of the distinction belongs in `PRESSURE_TESTING.md` or `CONTRIBUTING.md` so future patterns inherit the convention rather than re-derive it.

**Final clean re-run — six findings, all closed in-pattern.**

- *Step 5 field name inconsistency (Pass 1).* Step 5 returned `{fanout_id, created: [notification_ids], failed: [subscriber_refs]}` — pluralized field names inconsistent with the signature's `[notification_id, ...]` and `[subscriber_ref, ...]` notation. Resolved: normalized to `{fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...]}`.
- *Edge case "Empty Active subscriber set" missing fanout_id (Pass 1).* The edge case showed `{created: [], failed: []}` — stale from before fanout_id was added. Resolved: corrected to `{fanout_id, created: [], failed: []}` with explicit note that fanout_id is generated and returned regardless of subscriber count.
- *No example for `rejected(invalid-request)` (Pass 3).* Both rejection reasons were named in the signature but only `subscribers-unavailable` had a dedicated example. Resolved: "Invalid input" example added showing both the null-payload and empty-event_scope paths. The "Subscription store unavailable" example also corrected its step reference from "step 2" to "step 3" following the renumbering from the fanout_id decision round.
- *Compliance system example overconfident about Subscription store (Pass 3).* "The Subscription store confirms all three were Active at notification time" was the same time-binding error corrected in Regulated adversarial scenario 1 — knowing "at notification time" requires the fanout time, which lives in Event Log, not the Subscription store. Resolved: weakened to "The Subscription store shows each officer held an Active subscription for the scope" with an explicit note that a composed Event Log provides the precise time-binding.
- *Generation acceptance check 2 assumed fanout group was pre-identified (Pass 3).* The check referred to "the fanout group" without noting that group membership requires the same Event Log entry as check 1. A reader of check 2 in isolation would not know that fanout grouping requires Event Log. Resolved: check 2 now names the Event Log dependency explicitly before describing the payload-comparison procedure.
- *`fanout_time` vs `fired_at` inconsistency (Pass 3).* Regulated adversarial scenario 1 referenced the fanout timestamp as `fanout_time` — the field name used in the intermediate Event Log entry shape introduced in the adversarial rerun. Generation acceptance check 1 uses `fired_at` as the canonical field name in the final entry shape. Resolved: scenario 1 updated to use `fired_at` consistently with the canonical entry shape.

**Post-grounding addition — `failed` list policy/mechanism split.** The `{failed}` list design was never defended in-line: the spec named the return value and told the caller to inspect it, but never stated *why the mechanism returns `{failed}` rather than aborting* — a load-bearing architectural decision left implicit. Resolved: new edge case entry "Caller disposition on the `failed` list: transient failures vs. structural inconsistencies" added, which (a) defends the abort-vs-continue choice (policy/mechanism separation; delivery to the reachable majority is worth more than consistency with the unreachable minority), (b) distinguishes transient `storage-failure` entries (retry-eligible) from structural `invalid-request` entries (retry will fail; persistent failure is the diagnostic), (c) names two concrete caller dispositions — accept-the-loss for low-stakes events, escalate-to-secondary-delivery or log-to-Audit-Trail for regulated events — and explicitly names Audit Trail as the composition for recording a delivery gap with attribution and timestamp in the high-stakes case.

**Scheduled rescan: 2026-05-20.** Pass 1 GRID — three refining structural gaps, all closed in-pattern. Constituent API spot-check confirmed: Subscription retains nine invariants; Notification retains nine invariants; both invariant counts in the composition's Invariants section are accurate. Pass 2 EOS clean. Pass 3 Linus (fresh-reader) clean.

- *No Primitive policies subsection (refining).* `event_scope` and `payload` validation rules were stated inline in Action wiring step 1 but not collected in a Primitive policies subsection. SPEC_FORMAT requires the subsection for composition-boundary input validation. Resolved: Primitive policies subsection added naming `event_scope` (non-null, non-empty, opaque, exact-match, validated before any constituent call) and `payload` (non-null, opaque, content restrictions delegated to composing system).
- *No "load-bearing wiring decision" subsection (refining).* The key architectural decision — continue-on-failure rather than abort-on-first-failure — was present in prose (Action wiring, Edge cases "Caller disposition") but not stated and defended as a canonical named subsection per SPEC_FORMAT. Resolved: "The load-bearing wiring decision" subsection added to Composition logic, defending the continue-and-name-failures design with the four-part rubric.
- *Generation acceptance not split into record-clearable / externally-clearable (refining).* SPEC_FORMAT requires compositions to split Generation acceptance checks. The five prior checks were record-clearable except check 5 ("Identify composing patterns active"), which requires deployment configuration. Resolved: Generation acceptance restructured into "Record-clearable checks" (four checks) and "Externally-clearable checks" (one check — composing-pattern configuration identification). Round closes clean.
