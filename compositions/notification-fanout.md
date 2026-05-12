---
title: Notification Fanout
parent: Compositions
nav_order: 5
---

# Notification Fanout

> A composition: when an event fires against a named scope, every currently-Active subscriber for that scope receives a Notification record. Composes [Subscription](../atoms/messaging/subscription.md) with [Notification](../atoms/messaging/notification.md) to produce the end-to-end delivery pipeline — from the query *"who should receive this?"* through the per-recipient record *"a delivery attempt was made."*

---

## Intent

Subscription and Notification are freestanding atoms: Subscription records who is interested in what; Notification records whether a piece of information reached a recipient. Neither knows about the other. What neither can do alone is answer the question that arises when an event fires: *for every subscriber currently Active on this scope, produce a delivery record.* That is the fanout operation — and it is a composition concern, not an atom concern.

The composition is structurally simple: one query (`Subscription.subscribers_for`) followed by N creates (`Notification.create`, one per returned subscriber). Its architectural significance is that it is the first place in the library where a single trigger produces a variable number of effects — N notification records, where N is the count of Active subscribers at trigger time. This is not a single transition with N side effects; it is a directed invocation graph with one query edge and N create edges. The fan-out is the composition; the atoms remain closed single-transition state machines.

The composition makes two architectural commitments explicit. First, the subscriber set is determined once at trigger time — a subscriber who cancels after the `subscribers_for` query executes still appears in that invocation's fanout; a subscriber who joins after it does not. Second, fan-out failures are per-recipient and non-aborting — a `storage-failure` creating one recipient's notification record does not cancel the creates for remaining recipients. Both commitments follow from the boundary rule for parallel composition: no rollback guarantee exists across independent create operations.

---

## Composes

- **[Subscription](../atoms/messaging/subscription.md)** — provides the Active subscriber set and the `subscribers_for(event_scope)` query surface. The composition reads but never writes the subscription store.
- **[Notification](../atoms/messaging/notification.md)** — provides the per-recipient delivery record and the `create(recipient_ref, payload)` action. The composition creates one Notification record per subscriber returned by the Subscription query.

---

## Composition logic

### Application state

None. Notification Fanout has no persistent state of its own beyond its constituents' stores. The Subscription store owns who is subscribed; the Notification store owns what was created and its delivery outcome. The composition is a stateless interpreter of a directed invocation graph over these two stateful atoms.

If a system needs to record that a particular event triggered a particular fanout — for audit, replay, or deduplication — it composes Event Log or Duplicate Prevention alongside this composition. Those concerns do not belong to the bare fanout mechanism.

### Action wiring

The composition exposes a single action:

**`fanout(event_scope, payload) → {created: [notification_id, ...], failed: [subscriber_ref, ...]} | rejected(invalid-request | subscribers-unavailable)`**

1. Validate inputs: `event_scope` must be non-empty; `payload` must be non-null. If either condition fails, return `rejected(invalid-request)`. No subscriber query is made; no notification records are created. This mirrors the constituent atoms' own validation: `Subscription.subscribe` rejects empty `event_scope`; `Notification.create` rejects null `payload`.
2. Call `Subscription.subscribers_for(event_scope)`.
   - If the subscription store is unavailable (infrastructure failure at the read step), return `rejected(subscribers-unavailable)`. No notification records are created.
   - If the result is an empty list, return `{created: [], failed: []}`. The fanout is complete; no subscribers are currently Active for this scope.
3. For each `subscriber_ref` in the returned list, call `Notification.create(subscriber_ref, payload)`.
   - If `create` returns a `notification_id`, add it to the `created` list.
   - If `create` returns `rejected(storage-failure)`, add `subscriber_ref` to the `failed` list. Continue to the next subscriber; do not abort the fan-out.
   - If `create` returns `rejected(invalid-request)`, this indicates a structural inconsistency — `subscriber_ref` is non-empty (it was returned from the subscription store) and payload passed input validation in step 1. Treat as equivalent to `storage-failure` for that subscriber; add to `failed`. Continue.
4. Return `{created: [notification_ids], failed: [subscriber_refs]}`.

The order of `create` calls across subscribers is not guaranteed. Parallel execution is permitted provided the implementation guarantees each `Notification.create` call is independently committed — no shared transaction boundary across the N creates. The result's `created` and `failed` lists are unordered.

**The fan-out continues through failures.** A `storage-failure` on one subscriber's `Notification.create` does not abort the fan-out for remaining subscribers. This follows directly from the composition boundary rule: parallel composition carries no rollback guarantee. A subscriber not in the `created` list is one for whom no delivery record exists; the composing system is responsible for inspecting the `failed` list and deciding whether to retry.

### Retry semantics

A caller who receives a non-empty `failed` list and wishes to retry has two options. First: call `Notification.create(subscriber_ref, payload)` directly for each subscriber_ref in the `failed` list — this retries exactly the failed creates without re-querying the subscriber set. Second: call `fanout` again — this re-queries `subscribers_for`, which may return a different subscriber set if subscriptions have changed in the interim. The first option is correct when the caller needs to deliver to exactly the original fanout's subscriber set; the second is correct when delivering to the current Active set is the right behavior. Callers who need at-most-once fanout semantics across retries should compose Duplicate Prevention to guard the `fanout` call itself; see Edge cases.

---

## Application-level invariants

These invariants emerge from the composition. Neither constituent atom carries them alone.

- **Invariant 1 — Fanout coverage.** For any `fanout(event_scope, payload)` invocation that returns a result (not `rejected`), exactly one `Notification.create` call is attempted for each subscriber_ref returned by `Subscription.subscribers_for(event_scope)` at the time of the query. No subscriber is skipped; no subscriber outside the query result receives a create call. The `created` and `failed` lists together account for every subscriber in the query result: `|created| + |failed| = |subscribers_for result|`.
- **Invariant 2 — Payload consistency.** All Notification records created in a single `fanout` invocation carry the same payload. A subscriber cannot receive a different payload than another subscriber from the same invocation.
- **Invariant 3 — No cross-notification coupling.** A storage failure creating a notification for subscriber A does not affect the notification record created for subscriber B. Each `Notification.create` call is independent; its success or failure is isolated to that record.
- **Invariant 4 — At-most-one notification per subscriber per fanout.** `Subscription.subscribers_for` returns at most one entry per subscriber_ref for a given scope (Subscription Invariant 6 — at most one Active subscription per (subscriber_ref, event_scope) pair). The composition calls `Notification.create` at most once per returned subscriber_ref per invocation. A single fanout produces at most one notification per subscriber.
- **Invariant 5 — Subscription store is read-only.** The composition never writes to the subscription store. `Subscription.subscribers_for` is the only call made against the Subscription atom. No subscription is created, modified, or cancelled by the fanout action.
- **Invariant 6 — Notification atom invariants preserved.** All nine Notification invariants hold over each created record. The composition does not bypass Notification's preconditions or write to the notification store directly.
- **Invariant 7 — Subscription atom invariants preserved.** All eight Subscription invariants hold. The composition reads the subscription store through the declared Q surface; it does not join the subscription table directly.

Fanout coverage (Invariant 1) and at-most-one-per-subscriber (Invariant 4) together give the *delivery scope completeness* property — every currently-Active subscriber receives exactly one notification record per invocation, or the failure is named. Payload consistency (Invariant 2) and no cross-notification coupling (Invariant 3) give the *independent delivery record* property — each recipient's record is self-contained and its lifecycle is not affected by any other recipient's outcome.

---

## Examples

### Walkthrough

A project management system uses Notification Fanout to notify subscribers when a task is assigned.

1. **Three team members subscribe.** `Subscription.subscribe(dev_a, "task:assigned") → sub_a1`. Same for dev_b and dev_c.
2. **A task is assigned; the fanout fires.** `fanout("task:assigned", {task_id: t7, assigned_by: manager_m})`:
   - `Subscription.subscribers_for("task:assigned") → [dev_a, dev_b, dev_c]`
   - `Notification.create(dev_a, payload) → notif_41`
   - `Notification.create(dev_b, payload) → notif_42`
   - `Notification.create(dev_c, payload) → notif_43`
   - Returns `{created: [notif_41, notif_42, notif_43], failed: []}`.
3. **dev_b cancels before the next event.** `Subscription.cancel(sub_b1) → ok`.
4. **A second task is assigned.** `fanout("task:assigned", {task_id: t8, assigned_by: manager_m})`:
   - `subscribers_for → [dev_a, dev_c]` — dev_b is now Cancelled; not returned.
   - Returns `{created: [notif_51, notif_52], failed: []}`.
5. **dev_b's earlier notifications are unaffected.** `Notification.status_of(notif_42)` returns the full record; the subscription cancellation does not delete prior notification records (Notification Invariant 9).

### Subscription store unavailable

The subscription store is down when the fanout fires.

- `fanout("task:assigned", {task_id: t9, assigned_by: manager_m})` → step 2: `Subscription.subscribers_for` fails with an infrastructure error.
- Returns `rejected(subscribers-unavailable)`. No notification records are created; the caller receives a clean rejection and may retry when the store recovers.

### Partial failure

During a fanout, the notification store becomes temporarily unavailable after the first create succeeds.

- `subscribers_for → [dev_a, dev_b, dev_c]`
- `Notification.create(dev_a, payload) → notif_61` ✓
- `Notification.create(dev_b, payload) → rejected(storage-failure)` ✗
- `Notification.create(dev_c, payload) → notif_62` ✓ (fan-out continues)
- Returns `{created: [notif_61, notif_62], failed: [dev_b]}`.

The caller inspects the `failed` list and calls `Notification.create(dev_b, payload) → notif_63` directly. That new record enters Pending independently; dev_a's and dev_c's records are already in their own delivery lifecycles.

### Compliance system — policy change broadcast

An administrator publishes a revised data-handling policy. Every compliance officer with an Active subscription to `policy:updated` events must receive a notification. `fanout("policy:updated", {policy_id: p12, effective_date: "2025-09-01"})` fires. Three officers are Active; three Notification records are created. Each officer's delivery outcome is tracked independently: officer_a delivered, officer_b failed (email bounce), officer_c expired (no delivery attempt within the window).

An auditor later asks: *was every subscribed compliance officer notified of policy p12?* The auditor queries the notification store for records where `payload.policy_id = p12`. Three records appear — one per officer — with their respective delivery outcomes. The Subscription store confirms all three were Active at notification time. Invariant 1 gives the structural answer: the `created` set accounts for all subscribers returned by the fanout query.

### Regulated adversarial scenarios

- **Regulator audit — demonstrate all subscribers were notified of a compliance event.** An auditor asks: *show all notification records created by the policy:updated fanout on 2025-08-15 and whether each was delivered.* The auditor queries the notification store for records where `created_at` falls on 2025-08-15 and the payload references the relevant policy. For each returned record, `status_of` shows the delivery outcome. Invariants 1 and 4 are the structural guarantees. Note on completeness: the current Subscription store shows each subscriber's present status, not their status at fanout time. A subscriber Active during the fanout who has since cancelled appears as Cancelled now; the store alone cannot confirm they were in the fanout's subscriber set. Where this historical completeness question must be answered from records alone, a composed Event Log recording the fanout invocation and its subscriber list is required. Without it, the auditor must accept that the notification records identify who was notified, but cannot structurally verify from the subscription store that no Active subscriber was missed.
- **Disputed notification — subscriber claims they were never notified.** An officer claims no notification of policy p12 arrived. The investigator queries the notification store for records where `recipient_ref = officer_ref` and `payload.policy_id = p12`. If a record exists in any state, the store confirms the delivery attempt and its outcome. If the record shows `failed_at` or `expired_at`, the store confirms delivery did not succeed; the `failed` list from the fanout result (logged via Event Log if composed) identifies this as a named failure, not a silent omission. If no record exists, either the officer had no Active subscription at fanout time (query the subscription store) or their create call returned `storage-failure` — again, a named failure, not a gap. The subscription and notification stores together answer the question.
- **Breach investigation — identify all notifications that may have carried sensitive payload data.** A security incident requires identifying every notification created by fanouts referencing policy p12. The investigator queries the notification store for records where `payload.policy_id = p12` and applies the historical-status reconstruction logic from Notification's regulated adversarial scenarios (`created_at ≤ breach_time` and status was Pending during the window). The notification store answers the exposure scope from stored fields alone.

---

## Edge cases and explicit non-goals

- **Fanout idempotency and crash-mid-execution.** The bare composition provides no idempotency guarantee. Two distinct failure modes require attention. First: if `fanout` is called twice for the same event (network retry, double-click, replay), two full rounds of `Notification.create` execute — two notification records per subscriber. Second, and more dangerous: if the composition crashes mid-execution after some creates have succeeded, the `{created, failed}` result is never returned. The caller has no record of which subscribers received a notification record; a retry without idempotency creates duplicates for subscribers whose creates already succeeded. In both cases, composing [Duplicate Prevention](../atoms/temporal/duplicate-prevention.md) to guard the `fanout` call provides at-most-once fanout semantics within the deduplication window. Without it, the caller must treat any retry as a potential duplicate-creation event and handle the resulting multiple notification records at the delivery layer.
- **Subscriber-set staleness between query and create.** `Subscription.subscribers_for` is called once at the start of the fanout. A subscriber who cancels after the query but before their `Notification.create` is called will still receive a notification record — their subscription was Active at query time. Whether the delivery should proceed is a deployment policy the composing system defines, not a correctness failure of the composition.
- **New subscribers after query.** A subscriber who becomes Active after `subscribers_for` executes does not receive a notification for that fanout invocation. They will receive notifications from subsequent fanouts. This is correct: the composition delivers to the Active set at trigger time.
- **Empty Active subscriber set.** `fanout` returns `{created: [], failed: []}`. No Notification records are created. This is a valid, non-error outcome. The composing system may log this via Event Log if observability of empty fanouts is required.
- **Event scope hierarchy and wildcards.** `Subscription.subscribers_for` performs exact-match on the event scope. A subscriber with scope `task:*` does not receive notifications for `task:assigned` under the bare atoms. Scope hierarchy and pattern matching belong to a composing pattern that expands scope expressions before calling `subscribers_for`.
- **Delivery ordering.** Notification records are created in an unspecified order. The Notification atom does not guarantee delivery in creation order. If ordered delivery is required, the composing delivery layer sorts `Notification.pending_for` results by `created_at`.
- **Retry targeting the original failed set.** A caller who retries `fanout` re-queries `subscribers_for`, which may return a different set than the original invocation. Callers who need to retry exactly the failed subscriber_refs should call `Notification.create` directly for each ref in the `failed` list rather than re-invoking `fanout`.
- **Transport mechanism.** This composition creates Notification records; it does not dispatch them to recipients. The delivery layer — WebSocket push, webhook POST, email send — reads `Notification.pending_for` and calls `deliver`, `fail`, or `expire`. Transport is a deployment concern outside this composition.
- **Authorization to fanout.** The composition does not enforce who may call `fanout`. Any caller may trigger a fanout for any event scope with any payload. Authorization belongs to the composing system.
- **Payload size and content.** Payload is opaque and passed to `Notification.create` unchanged. Size limits, schema validation, and content restrictions belong to the composing system before calling `fanout`.
- **Fan-out at scale.** N sequential or parallel `create` calls scale with the Active subscriber count. For scopes with thousands of Active subscribers, the implementation must handle throughput concerns (batching, cursor-pagination of `subscribers_for`, parallel creates). The spec does not constrain the execution strategy as long as Invariant 1 (fanout coverage) holds.

---

## Generation acceptance

A derived implementation of Notification Fanout is *acceptable* when an external auditor, given the subscription store and notification store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm fanout coverage for any recorded fanout.** For each fanout invocation identifiable via a composed Event Log — which records the invocation, the event scope, and the resulting `notification_id` set — every subscriber Active in the subscription store at fanout time appears in the notification store as a Notification record. No Active subscriber is missing a record without a corresponding `failed` entry surfaced by the composing system. Note: without a composed Event Log, fanout grouping by `created_at` clustering is unreliable — concurrent creates across a measurable time span produce different timestamps, and concurrent unrelated fanouts may produce overlapping ones. Event Log composition is required for reliable fanout-coverage audits.
- **Confirm payload consistency.** All Notification records produced by a single fanout carry the same payload. The auditor inspects the `payload` field of each record in the fanout group and confirms identity.
- **Verify each Notification record independently.** Each record passes Notification's five Generation acceptance checks: full delivery history present, timeline reconstructable, terminal exclusivity confirmed, timestamp-status match confirmed, composing patterns identifiable.
- **Confirm no cross-notification coupling.** A terminal state on one notification record in the fanout group does not correlate with the terminal state on another. Each record's delivery outcome is independent.
- **Identify the composing patterns active in this deployment** — whether Event Log, Duplicate Prevention, Actor Identity, and Tamper Evidence are wired alongside the bare fanout mechanism, and with what configuration.

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

`partially resolved` — three foundation passes complete; Opus adversarial pass pending before declaring `grounded`.

---

## Lineage notes

Drafted as the fifth entry in `compositions/`, following Undo History, Idempotent Reservation, Audit Trail, and Shared Todo. First composition in the library with variable fan-out semantics — N effects from one trigger, where N is determined at runtime by the Active subscriber count.

The fan-out decomposition model was formalized in [`EXECUTION_CONTRACT.md`](../EXECUTION_CONTRACT.md) before drafting: fan-out is a decomposition boundary, not a single transition; the composition is a stateless interpreter of a directed invocation graph; no rollback guarantee exists across independent creates; partial failure is per-recipient and named in the result, not an abort condition. The draft follows this model directly.

**Conventions inherited from prior work.** *Regulated adversarial scenarios* and *Generation acceptance* are included because the compliance system example invokes a regulated domain (policy broadcast with mandated delivery to compliance officers), per the conventions in [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md). Inherited from the methodology directly; not re-derived from Notification or Subscription.

**Pass 1 — Structural completeness (GRID).** Clean. All nine GRID nodes resolved. Intent is testable and falsifiable via Invariant 1. Decision points cover all branching paths: `subscribers-unavailable` (abort before any creates), empty subscriber list (return empty result), `storage-failure` on a create (continue to next subscriber), `invalid-request` on a create (structural inconsistency — treated as `storage-failure`). Proof is measurable: generation acceptance names five checks an external auditor can run against the subscriber and notification stores. Application state is explicitly none; the rationale (Event Log and Duplicate Prevention as optional composing patterns) is named.

**Pass 2 — Conceptual independence (EOS).** Clean. No concerns are absorbed that belong elsewhere. Idempotency (Duplicate Prevention), audit history (Event Log), delivery transport (deployment concern), scope hierarchy (composing pattern), and authorization (composing system) are all correctly named as out-of-scope. The `{created, failed}` return structure is a return value from a single action invocation, not persistent state — no hidden store exists or is implied.

**Pass 3 — Adversarial scrutiny (Linus mode), first run.** Clean in-pattern; one cross-file finding deferred.

*In-pattern resolutions:* Parallel execution constraint named explicitly — no shared transaction boundary across the N creates. Retry targeting distinction made explicit. Subscriber-set staleness committed to trigger-time semantics. The `invalid-request` edge case (structurally inconsistent) named and handled consistently with `storage-failure`.

*Cross-file finding — deferred:* `Subscription.subscribers_for` does not name a store-unavailable outcome in its Decision points. This composition correctly handles it as `rejected(subscribers-unavailable)`. The gap belongs to the Subscription atom's next refinement round.

**Pass 3, second run — five findings, all closed in-pattern.**

- *Missing input preconditions on `fanout` (Pass 3).* The action wiring had no precondition check on `event_scope` or `payload`. A null payload would silently route every subscriber to `failed` via the constituent's `invalid-request` path rather than failing fast. An empty `event_scope` would return `{created: [], failed: []}` — masking a likely caller error. Resolved: `invalid-request` added to the signature; step 1 added to the action wiring with explicit precondition checks matching the constituent atoms' validation patterns.
- *Missing rejection-path example (Pass 1/Pass 3).* No example showed the `rejected(subscribers-unavailable)` path. Resolved: "Subscription store unavailable" example added showing the clean abort case.
- *Crash-mid-execution not named (Pass 3).* The fanout idempotency edge case covered double-call but not crash-after-partial-creates. The crash scenario is more dangerous — no `{created, failed}` result returned, caller has no visibility into which creates succeeded, retry creates duplicates. Resolved: fanout idempotency edge case extended to name both failure modes and the Duplicate Prevention mitigation for each.
- *Generation acceptance check 1 unreliable without Event Log (Pass 3).* "`created_at` clustering" is not a reliable fanout-grouping mechanism. Resolved: check 1 rewritten to make Event Log composition a stated requirement for reliable fanout-coverage audits; unreliability of clustering noted explicitly.
- *Regulated adversarial scenario 1 assumes historical subscription state (Pass 3).* "Cross-referencing against the Subscription store confirms no Active subscriber was omitted" was false — the Subscription store shows current status, not status at fanout time. A subscriber Active at fanout time who has since cancelled is invisible as such. Resolved: scenario 1 updated to acknowledge this limitation and name Event Log composition as the structural solution for historical completeness.

**Opus adversarial pass — pending.** Scheduled before `grounded` declaration.
