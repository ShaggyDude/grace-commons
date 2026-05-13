---
title: Subscription
parent: Messaging
grand_parent: Atoms
nav_order: 1
has_toc: true
toc: true
---

# Subscription

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A messaging primitive: a named actor's active interest in a class of events. Each subscription has an opaque immutable id; the subscriber reference and event scope are immutable properties set at subscribe time. The atom records *who wants to know about what*. Delivery of the information — when events fire against the subscription — belongs to a composing pattern.

---

## Intent

Every system that needs to push information across actor boundaries must answer: *who should be told about this?* The answer must be derivable from stored records — not from configuration files, deployment assumptions, or the memory of whoever wired the system. The subscription surface needs to be inspectable, cancellable, and queryable in the same operational contexts that any other stored record must survive.

Subscription records *interest*. It does not deliver anything; it does not know when events fire or what they contain; it does not know what constitutes a notification. All of that belongs to composing patterns. What the atom owns is the durable record that a named actor expressed interest in a class of events and that interest is currently Active or has been Cancelled.

The atom's two query surfaces serve distinct purposes. `subscribed(subscriber_ref, event_scope)` answers the point query — *is this actor currently subscribed to this scope?* — useful for UI state and subscription management. `subscribers_for(event_scope)` answers the fanout query — *who should receive a notification for this event?* — used by the composing pattern when an event fires. Both are read-only queries over the active subscription set; neither triggers delivery.

This is a freestanding atom in the EOS sense. It has its own state (the subscription set), its own actions (`subscribe`, `cancel`, `subscribed`, `subscribers_for`), and its own operational principles (subscriptions are immutable once recorded; cancellation is terminal; queries are read-only over the active set). It does not implement notification delivery, event routing, deduplication of fired events, or scope hierarchy. Each is a separate composable pattern; see Composition notes.

---

## Structure

### Identity model

Every subscription known to the system has a **`subscription_id`** — an opaque, immutable, system-generated identifier produced by `subscribe`. The id is the subscription's identity; the subscriber reference and event scope are immutable *properties* of the subscription, not its identity.

Unlike Permissions, which allows multiple independent grants for the same (subject, scope) pair, Subscription enforces at most one Active subscription per (subscriber_ref, event_scope) pair. The constraint is structural: duplicate active subscriptions for the same pair produce duplicate notifications for every event that fires against that scope — almost never the subscriber's intent. A subscriber who cancels and re-subscribes gets a new `subscription_id`; the prior subscription remains in the record as Cancelled. The retired id is never reused.

### Inputs

- A subscriber reference identifying *who* holds the subscription. Opaque — the actor registry is a separate concern.
- An event scope identifying *what class of events* the subscription covers. Opaque — the composing system defines scope semantics. This atom does exact matching on the scope value; scope hierarchy, wildcard expansion, and pattern matching belong to composing patterns.
- Actions:
  - `subscribe(subscriber_ref, event_scope) → subscription_id | rejected(reason)`
  - `cancel(subscription_id) → ok | rejected(reason)`
  - `subscribed(subscriber_ref, event_scope) → subscribed | not-subscribed`
  - `subscribers_for(event_scope) → [subscriber_ref, ...]`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of subscriptions (Active and Cancelled).
- For each subscription: `subscription_id`, `subscriber_ref`, `event_scope`, `subscribed_at`, `status`, and `cancelled_at` (if cancelled).
- `subscribe` returns the new `subscription_id` on success, or a rejection naming the failed precondition.
- `cancel` returns `ok` on success, or a rejection naming the failed precondition.
- `subscribed` returns one of two first-class outcomes: `subscribed` or `not-subscribed`. Both are answers to the query, not success-failure pairs. No rejection reason is defined because no input is invalid — an empty or malformed query unambiguously returns `not-subscribed`.
- `subscribers_for` returns the list of `subscriber_ref` values for all Active subscriptions covering the queried `event_scope`. The list is unordered. Composing systems that require delivery in a specific order must sort by `subscribed_at` or another field on the returned subscriber refs.

### State

A subscription occupies one of two named states:

- **Active** — the subscription is in force; the subscriber appears in `subscribers_for` results for the subscribed event scope.
- **Cancelled** — the subscription has been withdrawn; the subscriber no longer appears in `subscribers_for` results for that scope. Cancellation is terminal.

Each subscription carries:

- **`subscription_id`** — opaque, immutable, system-generated. Set on `subscribe`. Never changes.
- **`subscriber_ref`** — opaque reference to the subscribing actor. Set on `subscribe`. Never changes.
- **`event_scope`** — opaque reference to the class of events subscribed to. Set on `subscribe`. Never changes.
- **`subscribed_at`** — wall-time when the subscription was recorded. Set on `subscribe`. Never changes.
- **`status`** — `active` or `cancelled`. Set to `active` on `subscribe`; transitions to `cancelled` on `cancel`.
- **`cancelled_at`** — wall-time when the subscription was cancelled. Absent while Active; set on `cancel`. Never changes after set.

Transitions:

- `subscribe(subscriber_ref, event_scope)` → if no Active subscription exists for this (subscriber_ref, event_scope) pair, a new subscription is recorded in Active with a fresh `subscription_id`, the supplied `subscriber_ref` and `event_scope`, and `subscribed_at = now`. Returns `subscription_id`. If an Active subscription already exists for this pair, returns `rejected(already-subscribed)`.
- `cancel(subscription_id)` → the subscription at `subscription_id` moves Active → Cancelled; `cancelled_at = now`. Returns `ok`. If `subscription_id` is not known, returns `rejected(not-known)`. If the subscription is already Cancelled, returns `rejected(not-active)`. State is unchanged on rejection.
- `subscribed(subscriber_ref, event_scope)` → read-only query; no state change. Returns `subscribed` if any Active subscription exists where `subscription.subscriber_ref = subscriber_ref` and `subscription.event_scope = event_scope`; otherwise `not-subscribed`.
- `subscribers_for(event_scope)` → read-only query; no state change. Returns the list of `subscriber_ref` values for all Active subscriptions where `subscription.event_scope = event_scope`. Returns an empty list if no Active subscriptions exist for the scope — whether the scope has never been subscribed to or all subscriptions for it are Cancelled; the atom does not distinguish these cases (see Behavior).

### Flow

1. **An actor or composing pattern creates a subscription.** Calls `subscribe(subscriber_ref, event_scope)` — the atom records the subscription in Active and returns the id.
2. **Time passes; the subscription persists.** The composing pattern stores the `subscription_id` alongside whatever configuration necessitated the subscription.
3. **An event fires.** A composing pattern calls `subscribers_for(event_scope)` to enumerate current Active subscribers for the event's scope. The atom returns the set; what the composing pattern does with it — typically creating a notification per subscriber via [Notification Fanout](../../compositions/notification-fanout.md) — belongs to that pattern, not this atom.
4. **At some point, the subscription is cancelled.** Calls `cancel(subscription_id)`. The subscription moves to Cancelled; subsequent `subscribers_for` queries no longer include the subscriber for that scope.

### Decision points

- **At `subscribe(subscriber_ref, event_scope)`** — `subscriber_ref` and `event_scope` must be non-empty — specifically, neither may be null, undefined, or the empty string; otherwise `invalid-request`. The atom does not parse, normalize, or otherwise interpret the opaque values beyond this presence check. An Active subscription must not already exist for this (subscriber_ref, event_scope) pair; otherwise `already-subscribed`.
- **At `cancel(subscription_id)`** — `subscription_id` must reference a known subscription; otherwise `not-known`. The referenced subscription must be in Active; cancelling an already-cancelled subscription is rejected as `not-active`.
- **At `subscribed(subscriber_ref, event_scope)`** — no precondition. `subscribed` and `not-subscribed` are both first-class outcomes, not rejections. Empty or malformed inputs return `not-subscribed` — an empty query matches no Active subscription by definition, so the answer is determinate without a precondition check. The asymmetry with `subscribe`'s `invalid-request` rejection is intentional: `subscribe` creates a record (so bad inputs would produce a bad record); `subscribed` only reads, so bad inputs produce a correct answer without side effects.
- **At `subscribers_for(event_scope)`** — no precondition. Empty or malformed `event_scope` returns an empty list — no Active subscription has an empty scope value, so the result is structurally empty. The query is read-only.

### Behavior

Observed behavior, derived from how event-subscription systems are actually deployed:

- A `subscribers_for` query is answered entirely from the active subscription set. No Active subscription for a scope → empty list. The composing system is responsible for calling `subscribers_for` when an event fires; the atom does not know about events and does not invoke any action in response to them.
- `subscribers_for` returns an empty list regardless of whether the scope has never been subscribed to or has only Cancelled subscriptions. The composing system cannot distinguish these cases from the query alone — that distinction, if operationally meaningful, requires querying the full subscription history for the scope. This is intentional: the atom answers *who should be notified now* without requiring the composing system to reason about historical subscription activity.
- `subscribers_for` returns subscriber_refs rather than `(subscriber_ref, subscription_id)` pairs. The likely objection: "composing patterns need to associate the resulting notification with the subscription that triggered it, for audit and deduplication." The mechanism: the composing pattern captures the `subscription_id` at `subscribe` time — when it already knows the (subscriber_ref, event_scope) pair it just registered — and records the binding in its own store. Invariant 6 guarantees the binding is well-defined: at most one Active subscription per (subscriber_ref, event_scope) pair, so a single id covers each Active row. The atom does not expose a `subscription_id_of(subscriber_ref, event_scope)` recovery query; capturing at subscribe time is the supported path. The result: per-subscription traceability is available when the composing pattern needs it, the atom's query surface stays small, and the separation between the Subscription atom's internal identities and the Notification atom's recipient surface is preserved.
- At most one Active subscription per (subscriber_ref, event_scope) pair. A second `subscribe` for a pair that already has an Active subscription is rejected as `already-subscribed`. This is the key structural distinction from Permissions, which permits multiple independent grants per (subject, scope). The likely objection: "sometimes a subscriber re-subscribes through a new channel or session and should get a fresh record." The mechanism: cancel the old subscription first, then subscribe — the new `subscription_id` represents the fresh registration. The result: the at-most-one invariant holds; the history of cancellation and re-subscription is recoverable; no duplicate notifications from a single logical subscription.
- Cancellation is immediate and terminal. After a successful `cancel`, the subscription moves to Cancelled and subsequent `subscribers_for` queries for that scope no longer include the subscriber. The subscription record remains observable for audit purposes but no longer contributes to fanout.
- Event scope is evaluated by exact match on the opaque scope value. The composing system defines the scope vocabulary. The atom makes no assumption about scope structure — hierarchy, wildcards, and pattern matching belong to the composing layer.
- The atom uses **capability-based authorization** for `cancel`: knowledge of the opaque `subscription_id` is itself the cancellation capability. The id is system-generated, opaque, and not enumerable from the atom's action surface, so in practice only parties to whom the id has been delivered (by the original subscriber or by a composing system that recorded it at subscribe time) can cancel. Composing systems that need richer authorization — role-based gating, multi-party consent, audit-on-cancel — wrap the bare capability with Permissions or Actor Identity. The bare atom enforces something specific and useful (capability gating); the layering story for richer models is clean.
- The atom does not record when events fired against a subscription, how many times a subscriber was notified, or whether delivery succeeded. Event firing history belongs to an Event Log composing pattern; delivery outcomes belong to the Notification atom.

### Feedback

Each successful action produces an observable, measurable change:

- After `subscribe` — a new subscription appears in Active with a fresh `subscription_id`, the supplied `subscriber_ref` and `event_scope`, and `subscribed_at`. Total subscription count increases by one. Active subscription count increases by one. The id is returned. Falsifiable: after a successful `subscribe(a, s)`, `subscribed(a, s)` must return `subscribed` and `subscribers_for(s)` must include `a`.
- After `cancel` — the subscription at `subscription_id` moves to Cancelled with `cancelled_at`. Active count decreases by one; cancelled count increases by one; total count unchanged. Falsifiable: after a successful `cancel` of subscription for (a, s), `subscribed(a, s)` must return `not-subscribed` and `subscribers_for(s)` must not include `a`.
- After `subscribed` — no state change. Returns `subscribed` or `not-subscribed`. The return value is the complete observable signal.
- After `subscribers_for` — no state change. Returns the list of `subscriber_ref` values for all Active subscriptions covering the queried scope. The return value is the complete observable signal.

`subscribe` rejections: `invalid-request`, `already-subscribed`. `cancel` rejections: `not-known`, `not-active`.

The full subscription set — Active and Cancelled — is queryable. Per-subscription fields (id, subscriber_ref, event_scope, subscribed_at, status, cancelled_at) are observable.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Subscription immutability.** Once recorded, a subscription's `subscription_id`, `subscriber_ref`, `event_scope`, and `subscribed_at` never change.
- **Invariant 2 — Status monotonicity.** A subscription's status transitions only in one direction: Active → Cancelled. No subscription returns from Cancelled to Active.
- **Invariant 3 — Cancellation is terminal.** Once a subscription is in Cancelled, no `cancel` call will succeed for that `subscription_id` (`not-active`), and no `subscribers_for` query will include it.
- **Invariant 4 — New subscribe after cancel produces a new id.** Cancelling a subscription and calling `subscribe` again for the same (subscriber_ref, event_scope) produces a distinct, fresh `subscription_id`. The cancelled id is never reused. The two subscription records — one Cancelled, one Active — are independently queryable with their own `subscribed_at` timestamps.
- **Invariant 5 — No id reuse.** No two subscriptions share a `subscription_id` across the lifetime of the system.
- **Invariant 6 — At most one active subscription per (subscriber_ref, event_scope).** No two Active subscriptions may share the same (subscriber_ref, event_scope) pair. A `subscribe` call for a pair with an existing Active subscription is rejected as `already-subscribed`. This is the structural mechanism that prevents duplicate notifications from a single logical subscription.
- **Invariant 7 — Evaluation self-containment.** `subscribers_for(event_scope)` and `subscribed(subscriber_ref, event_scope)` are determined entirely by the active subscription set at query time. No out-of-band data is consulted.
- **Invariant 8 — Absence means not-subscribed.** `subscribed` returns `not-subscribed` if and only if no Active subscription exists for the queried (subscriber_ref, event_scope) pair. `subscribers_for` omits any subscriber_ref for which no Active subscription exists for the queried event_scope.
- **Invariant 9 — Timestamp ordering.** For any subscription in Cancelled state, `subscribed_at ≤ cancelled_at`. This invariant is best-effort under non-monotonic clocks; if the underlying clock moves backward (NTP adjustment, clock skew), the inequality may be violated. The implementor is responsible for the clock discipline that makes it hold; see Edge cases.

Evaluation self-containment and absence-means-not-subscribed together give the *determinism* property — both query operations are pure functions of the active subscription set at query time. Subscription immutability and status monotonicity together give the *auditability* property — the full subscription history of every record is recoverable from the subscription store alone.

---

## Examples

The same atom, three domains, identical mechanic.

### Shared Todo — assignment notification

In a Shared Todo deployment, actors subscribe to assignment events scoped to themselves. `subscribe(dev_d, task:assigned:dev_d) → sub_42`. When manager M assigns a task to dev_d, the composition calls `subscribers_for(task:assigned:dev_d)` — dev_d's `subscriber_ref` appears in the result; the composition then creates a Notification record for dev_d. When dev_d opts out of assignment emails, `cancel(sub_42)` — subsequent `subscribers_for` queries for that scope return an empty list; dev_d receives no further assignment notifications.

### Support queue — escalation alerts

A supervisor subscribes to escalation events for their queue: `subscribe(supervisor_s, escalation:queue-9) → sub_e1`. When a ticket in queue 9 escalates, the composition calls `subscribers_for(escalation:queue-9)` — supervisor_s appears; a notification is created. When a second supervisor takes over queue 9, the first cancels: `cancel(sub_e1)`. Subsequent escalations notify only those with Active subscriptions for that scope.

### Compliance system — policy change broadcast

An administrator issues subscriptions for each compliance officer: `subscribe(officer_a, policy:updated) → sub_p1`, `subscribe(officer_b, policy:updated) → sub_p2`. Each officer holds their own Active subscription. When a policy is updated, `subscribers_for(policy:updated)` returns both officers; one notification is created per officer. An officer who leaves the team has their subscription cancelled; they no longer appear in subsequent fanout queries.

### Rejection path

A developer attempts to subscribe twice to the same scope: `subscribe(dev_d, task:assigned:dev_d) → sub_42`. Then `subscribe(dev_d, task:assigned:dev_d)` → `rejected(already-subscribed)`. The second call does not create a second subscription. To refresh the subscription, the developer first calls `cancel(sub_42)`, then `subscribe(dev_d, task:assigned:dev_d) → sub_97`. The cancellation of sub_42 remains in the subscription store; sub_97 is the new active record.

### Regulated adversarial scenarios

Three scenarios the subscription store must survive in regulated contexts:

- **Regulator audit — who was subscribed to a scope at a given time.** A compliance auditor asks *"which actors were subscribed to `policy:updated` at the time the policy was updated on 2025-03-14T10:00Z?"* The auditor queries the subscription store for subscriptions where `event_scope = policy:updated` and (`status = active` or `cancelled_at > 2025-03-14T10:00Z`) and `subscribed_at ≤ 2025-03-14T10:00Z`. The subscription store answers from stored fields alone — subscriber_ref, event_scope, subscribed_at, status, cancelled_at — with no recourse to developer narration. Invariants 1 and 9 make the timeline reconstruction exact.
- **Disputed subscription — actor claims they were never subscribed.** Officer_a denies having subscribed to `escalation:queue-9`. The investigator queries the subscription store for subscriptions where `subscriber_ref = officer_a` and `event_scope = escalation:queue-9`. If a record exists with `subscribed_at` and the actor's reference, Invariant 1 (subscription immutability) is the structural answer: the record was created at that time with that subscriber_ref; it does not change. If no record exists, the store confirms the actor was never subscribed. The subscription store is the single source of truth; no external corroboration is required.
- **Breach investigation — exposure scope assessment.** A security incident requires identifying all actors who were subscribed to `data:export` at the time of the breach (2025-06-01T03:00Z). The investigator queries subscriptions where `event_scope = data:export` and `subscribed_at ≤ 2025-06-01T03:00Z` and (`status = active` or `cancelled_at > 2025-06-01T03:00Z`). The result set is the exposure scope — every actor who would have received notifications fired against that scope during the breach window. Invariant 6 (at-most-one-active) confirms no actor appears more than once in the Active set at any point in time.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Event routing and fanout.** This atom records subscriptions; it does not fire events, match events to subscriptions, or create notifications. Those belong to a Notification Fanout composing pattern that wires Subscription + Notification + an event source.
- **Notification delivery.** What happens after `subscribers_for` returns a list of subscribers is the composing pattern's responsibility. The Notification atom carries the delivery record; the transport mechanism (WebSocket, webhook, email, push) is a deployment concern.
- **Scope hierarchy and pattern matching.** A subscription for `task:assigned` does not automatically cover `task:assigned:dev_d`. Scope semantics — prefix matching, wildcards, hierarchy — belong to the composing system's scope vocabulary. The atom does exact match.
- **Delivery guarantees.** Whether the composing pattern guarantees at-least-once, at-most-once, or exactly-once delivery is a deployment concern.
- **Subscription expiry.** Subscriptions do not expire automatically. A time-bounded subscription — one that cancels after a deadline — requires a **Temporal Subscription** *(forthcoming)* composing pattern that calls `cancel` at expiry time.
- **Subscriber registration and lifecycle.** `subscriber_ref` is opaque. Whether a subscriber exists, is active, or has been deprovisioned is an Actor Registry concern, which is also where the cascade-cancellation-on-deprovisioning obligation lives — composing patterns that bind Actor Registry to Subscription must enumerate the deprovisioning actor's Active subscriptions and call `cancel` for each. No bulk-cancel surface is exposed by this atom; cascade is per-subscription, by `subscription_id`.
- **Subscription attribution.** The atom does not record who called `subscribe`. Attribution — *which administrator subscribed this actor?* — belongs to Actor Identity composing with the `subscribe` action. The `subscription_id` is the hook for composing attribution patterns: a composing Actor Identity pattern records `attest(subscription_id, subscribed_by_ref, credential)` at subscription time, binding the id to the actor who initiated the subscription. No field is added to the subscription record itself; the attribution lives in the Actor Identity store.
- **Authorization to cancel.** The atom does not enforce who may call `cancel`. Any caller with the `subscription_id` can cancel the subscription. Authorization to cancel — ensuring only the subscriber or an authorized administrator can cancel — belongs to the composing system.
- **Bulk cancellation.** There is no bulk-cancel surface. Cancelling all subscriptions for a departing actor requires enumerating their Active subscriptions and calling `cancel(subscription_id)` for each.
- **Event firing history.** The atom does not record when events fired against subscriptions, how many times, or with what payload. That belongs to an Event Log composing pattern.
- **Clock semantics.** `subscribed_at` and `cancelled_at` are wall-time from the implicit clock. Clock skew, NTP adjustments, and timezone handling are deployment concerns the spec does not address. Invariant 9 is best-effort under non-monotonic clocks.
- **Atomicity and crash semantics.** State transitions are specified as atomic. `cancel` changes two fields simultaneously: `status` and `cancelled_at`. A crash mid-`cancel` that sets one without the other violates Invariant 2 (status monotonicity) or Invariant 9 (timestamp ordering). The implementor is responsible for the transactional boundary that makes both fields change together. The spec does not define recovery semantics for partial writes.

---

## Generation acceptance

The audit surface is the subscription store inspected on its stored fields — distinct from and complementary to the action surface (`subscribe`, `cancel`, `subscribed`, `subscribers_for`). The action surface answers *what does the atom do at runtime?*; the audit surface answers *what does the atom commit to recording, queryable on stored fields?*. A derived implementation must produce a store that supports the audit-surface queries below, independent of whether the runtime action surface exposes them.

A derived implementation of Subscription is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the subscription store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Enumerate every subscription, active and cancelled, with its full history.** `subscription_id`, `subscriber_ref`, `event_scope`, `subscribed_at`, `status`, and `cancelled_at` (where applicable) are present and queryable for every subscription ever created. No subscription is missing from the store.
- **Reconstruct the active subscriber set for any event scope at any past point in time.** Given a scope and a timestamp, the auditor can determine which subscriptions were Active at that moment by filtering on `subscribed_at ≤ t` and (`status = active` or `cancelled_at > t`). The timeline is exact (Invariants 1 and 9).
- **Confirm at-most-one-active constraint.** For any (subscriber_ref, event_scope) pair, at most one subscription is in Active state at any point in time. The auditor can verify this directly from the subscription store (Invariant 6).
- **Confirm cancellation is terminal and immediate.** For every Cancelled subscription, `cancelled_at` is present and `status = cancelled`. No `subscribers_for` query after `cancelled_at` returns that subscriber for that scope (Invariant 3).
- **Identify composing patterns active in this deployment.** Whether subscription attribution (Actor Identity), event firing history (Event Log), retention (Retention Window), and tamper-evidence on the subscription store (Tamper Evidence) are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce a subscription store and a query surface that pass the five checks above.

---

## Composition notes

Subscription is freestanding and is designed to compose with:

- **[Notification](./notification.md)** — the delivery record produced when a subscription fires. The composing Notification Fanout pattern wires `subscribers_for` to `Notification.create`: for each subscriber returned, a Notification is created.
- **[Notification Fanout](../../compositions/notification-fanout.md)** — the composition that wires Subscription + Notification + an event source into an end-to-end delivery pipeline.
- **[Event Log](../temporal/event-log.md)** — records when events fired against subscriptions. Each match between an event and a subscription scope can be appended as an event for auditing and replay.
- **[Actor Identity](../compliance/actor-identity.md)** — records who subscribed (subscription attribution) when subscriber accountability is required. `subscription_id` is the hook: `attest(subscription_id, subscribed_by_ref, credential)` at subscribe time.
- **[Retention Window](../compliance/retention-window.md)** — the subscription store and its history must be retained for whatever regulatory or operational lifetime the deployment requires.
- **[Tamper Evidence](../compliance/tamper-evidence.md)** — in regulated contexts, the subscription store is a target for after-the-fact manipulation. Cryptographic commitment makes any rewrite detectable.

---

## Standards references

- **Observer pattern** (GoF) — the canonical object-oriented formulation of the subscriber/publisher relationship. Subscription is the structured-natural-language realization of the Subscriber role: an actor with a named interest in a class of events.
- **Publish-subscribe** (Birman & Joseph, 1987; subsequently AMQP, Apache Kafka, etc.) — topic-based subscription as the mechanism for decoupling event producers from consumers. Subscription records the consumer-side interest; the composing fanout pattern is the broker.
- **WebSub** (W3C Recommendation) — web-native publish-subscribe over HTTP. The subscription resource in WebSub is the direct Web analog of this atom.
- **XMPP PubSub** (XEP-0060) — structured publish-subscribe over XMPP. Subscription nodes are the protocol-level analog.
- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; `event_scope` as an opaque reference whose semantics are defined by the composing system.
- **Eiffel's design-by-contract** — preconditions on `subscribe` and `cancel`; named rejection reasons.

---

## Status

`grounded — last full rescan: 2026-05-13` — structure and invariants specified; four examples including rejection path and regulated adversarial scenarios; regulated adversarial scenarios and generation acceptance added after Pass 3 surfaced the compliance example obligation; three-pass lineage records all findings and resolutions. First entry in `atoms/messaging/`.

---

## Lineage notes

This atom is the first entry in the `messaging/` category, drafted alongside Notification as the two-atom foundation for the forthcoming Notification Fanout composition.

**Pass 1 — Structural completeness (GRID).** Three findings.

- *Decision points for `subscribed` and `subscribers_for` asymmetry not defended.* The `subscribe` action rejects `invalid-request` for malformed inputs; the `subscribed` and `subscribers_for` queries accept malformed inputs and return determinate empty-result answers. This asymmetry was present but undefended. Fixed: Decision points now carry a four-step rubric explanation — `subscribe` creates a record (bad inputs produce bad records); queries only read, so bad inputs produce a correct answer without side effects.
- *Feedback queries lacked falsifiable signals.* The Feedback section for `subscribed` and `subscribers_for` said "no state change; returns..." without specifying what observable property changes. Fixed: Feedback now names falsifiable post-conditions (after `subscribe(a, s)`, `subscribed(a, s)` must return `subscribed`; after cancel, must return `not-subscribed`).
- *Feedback rejection paragraph mixed per-action reasons.* The single list `invalid-request`, `already-subscribed`, `not-known`, `not-active` did not indicate which reasons belong to which action. Fixed: restructured per-action (`subscribe` rejections; `cancel` rejections).

**Pass 2 — Conceptual independence (EOS).** Two findings.

- *`subscribers_for` return shape choice undefended.* Returning `[subscriber_ref, ...]` rather than `[(subscriber_ref, subscription_id), ...]` is a load-bearing design choice — it means composing patterns cannot directly trace which subscription triggered a notification from the query return alone. Fixed: Behavior now carries the four-step rubric defense: Invariant 6 guarantees at-most-one-active, so subscription_id is recoverable; the separation of Subscription and Notification internal identities is preserved.
- *Subscription attribution interface point unspecified.* Edge cases named Actor Identity as the composing pattern for attribution but did not identify what field in the subscription record serves as the hook. Fixed: Edge cases now states `subscription_id` is the hook and names `attest(subscription_id, subscribed_by_ref, credential)` as the interface.

**Pass 3 — Adversarial scrutiny (Linus mode).** Five findings.

- *Invariant 1 and 4 redundant.* Invariant 1 stated all four fields (including subscription_id) are immutable; Invariant 4 said the id specifically never changes — identical claim. Fixed: Invariant 4 now carries distinct content — a new `subscribe` after `cancel` produces a new distinct id, and the cancelled id is never reused for that pair. Invariant 5 ("No id reuse") is kept as the general claim across the lifetime of the system; Invariant 4 is the cancel-then-resubscribe corollary specifically. Together the two cover the id-stability surface without overlap.
- *`subscribers_for` empty-list cases not distinguished as intentional.* An empty result for a scope that has never been subscribed and one where all subscriptions are Cancelled are identical from the query surface — a hidden design choice. Fixed: Behavior explicitly names this as intentional and states the consequence for composing systems.
- *Atomicity and crash semantics absent.* `cancel` changes two fields (`status` and `cancelled_at`) that must change together; a crash mid-transition violates Invariants 2 or 9. Personal Todo names this explicitly; Subscription did not. Fixed: Edge cases now carries the atomicity note.
- *Regulated adversarial scenarios and generation acceptance missing.* The compliance system example (policy change broadcast, compliance officer subscriptions) invokes a regulated domain; library rules in PRESSURE_TESTING.md require both sections for any pattern whose examples invoke regulated contexts. Fixed: both sections added.
- *Authorization to cancel unnamed.* Any caller with a `subscription_id` can cancel the subscription; the atom does not enforce who may do so. This is intentional but was invisible. Fixed: named explicitly in Behavior and Edge cases.

**Refinement round — adversarial rerun.** Twelve findings, all closed in-pattern.

- *"Well-formed" precondition contradicted opaque posture (Pass 1/3).* `subscribe` Decision points required `subscriber_ref` and `event_scope` to be "well-formed" — undefined for opaque values. Same defect class Notification's Pass 2 caught and fixed for payload. Resolved: precondition now states "non-empty (not null, undefined, or empty string)" with an explicit note that the atom does not parse the opaque values beyond presence.
- *Flow step 3 carried composing-pattern behavior (Pass 1).* The step ended with "then creates a notification for each" — that half-step is Notification Fanout's behavior, not Subscription's. Resolved: step trimmed to the atom's contribution (`subscribers_for` returns the set); the composing layer's continuation is named with a forward link to Notification Fanout.
- *Scope hierarchy / pattern matching considered as extraction candidate (Pass 2).* Scope hierarchy recurs across permissions ACLs, file paths, pub-sub topics, tag namespaces — a Pass 2 extraction case can be made. Kept in-pattern because exact match is the bare atom's commitment and pattern expansion is a one-way pre-call transformation by a composing pattern with no state machine of its own. Recorded here as Pass 2 considered-and-kept.
- *Deprovisioning cascade had no named composing pattern (Pass 2).* Edge cases named the cascade as "the composing system's responsibility" without pointing at any atom. Resolved: Actor Registry named as the owning concern, with the per-subscription mechanics (enumerate, call `cancel` for each id) made explicit.
- *`subscribers_for` return-shape defense pointed at a recovery query that does not exist (Pass 3).* The original four-step rubric argued Invariant 6 makes `subscription_id` "recoverable by the composing layer" — but no atom action returns a subscription_id from (subscriber_ref, event_scope). Resolved: the defense now correctly describes the supported path — composing patterns capture `subscription_id` at `subscribe` time and store the binding themselves; the atom does not expose a recovery query.
- *Generation acceptance preamble assumed an open query surface (Pass 3).* Check 2's historical-reconstruction filter operates on stored fields the action surface does not expose. Resolved: Generation acceptance now opens with an explicit audit-surface / action-surface distinction — the store inspected on stored fields is the audit surface, complementary to but distinct from the four action queries.
- *Authorization-to-cancel was a real model dressed up as an absence (Pass 3).* "Any caller with the `subscription_id` can cancel" is capability-based authorization, not no authorization. Resolved: Behavior bullet rewritten to name capability-based authorization explicitly, with the layering story for richer models (Permissions, Actor Identity).
- *Temporal Subscription reference unmarked (Pass 3).* Edge cases named "Temporal Subscription composing pattern" without a `*(forthcoming)*` marker. Resolved: marker added.
- *Recursive lineage finding — Invariant 5 merge described but not executed.* The original Pass 3 finding 1 said "Invariant 5 (now merged into Invariant 4 as a corollary)" but Invariant 5 was kept distinct in the Invariants list. Resolved: lineage entry rewritten to match the actual state — Invariant 4 covers the cancel-then-resubscribe corollary; Invariant 5 retains the general no-reuse claim across the system's lifetime; together they cover the id-stability surface without overlap.
- *Forthcoming-link cleanup.* Composition notes still marked Notification Fanout as `*(forthcoming)*` after the composition had landed. Per workflow step 5 in `CLAUDE.md`, the marker is removed and the reference linked.

*Library-wide concerns surfaced but not resolved in this round* — recorded here for the next sweep:

- **Closed-action vs. open-audit tension.** Per-pattern fix landed (audit-surface preamble); the canonical statement of the distinction belongs in `PRESSURE_TESTING.md` or `CONTRIBUTING.md` so future patterns inherit the convention rather than re-derive it.
- **"Non-empty for opaque references" check semantics.** Per-pattern fix landed (null, undefined, empty string); a canonical statement belongs in a shared document.
