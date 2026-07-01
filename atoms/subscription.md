---
title: Subscription
parent: Atomic Concepts
has_toc: true
toc: true
---

# Subscription

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Subscription records who wants to be told about what. It answers the question "who should be notified about this?" the moment an event happens, by keeping a lasting list of named interests that can be queried at any time.

When someone subscribes, the pattern records the link between that subscriber and an event scope (the topic or category of events they care about), gives it an identifier, and keeps the record until the subscription is explicitly cancelled.

Two queries do the real work: one asks whether a given subscriber is currently subscribed to a given scope, and the other returns everyone currently subscribed to a scope — the list a system needs when an event fires and has to reach the right people.

The pattern deliberately does no delivering: it does not know when events happen, what they contain, or how to reach anyone — that is a separate delivery pattern's job, which keeps the subscription list a clean, auditable administrative record on its own.

At most one active subscription can exist per subscriber-and-scope pair, which prevents the duplicate deliveries that double subscriptions would cause, and cancellation is immediate and permanent while the full history (including cancelled subscriptions) stays queryable for audit.

The most common uses are: notifying users of events relevant to them (task assignments, escalations, alerts), broadcasting policy or system changes to a declared audience, and building any system where actors must opt in to event categories with the ability to opt out. The atom is the first entry in the `messaging` category.

---

## Intent

Every system that needs to push information across actor boundaries must answer: *who should be told about this?* The answer must be derivable from stored records — not from configuration files, deployment assumptions, or the memory of whoever wired the system. The subscription surface needs to be inspectable, cancellable, and queryable in the same operational contexts that any other stored record must survive.

Subscription records *interest*. It does not deliver anything; it does not know when events fire or what they contain; it does not know what constitutes a notification. All of that belongs to composing patterns. What the atom owns is the durable record that a named actor expressed interest in a class of events and that interest is currently Active or has been Cancelled.

The atom's two query surfaces serve distinct purposes. `subscribed(subscriber_ref, event_scope)` answers the point query — *is this actor currently subscribed to this scope?* — useful for UI (user-interface) state and subscription management. `subscribers_for(event_scope)` answers the fanout (fan-out: a single event trigger producing deliveries to multiple recipients) query — *who should receive a notification for this event?* — used by the composing pattern when an event fires. Both are read-only queries over the active subscription set; neither triggers delivery.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the subscription set), its own actions (`subscribe`, `cancel`, `subscribed`, `subscribers_for`), and its own operational principles (subscriptions are immutable once recorded; cancellation is terminal; queries are read-only over the active set). It does not implement notification delivery, event routing, deduplication of fired events, or scope hierarchy. Each is a separate composable pattern; see Composition notes.

---

## Structure

### Identity model

Every subscription known to the system has a **[Subscription Id]** — an opaque, immutable identifier produced by [Subscribe], host-allocated at the I/O seam (injected, not generated inside the transition) from cryptographically-secure random material (see Configuration). The id is the subscription's identity; the subscriber reference and event scope are immutable *properties* of the subscription, not its identity.

Unlike Permissions, which allows multiple independent grants for the same (subject, scope) pair, Subscription enforces at most one [Active] subscription per ([Subscriber Ref], [Event Scope]) pair. The constraint is structural: duplicate active subscriptions for the same pair produce duplicate notifications for every event that fires against that scope — almost never the subscriber's intent. A subscriber who cancels and re-subscribes gets a new [Subscription Id]; the prior subscription remains in the record as [Cancelled]. The retired id is never reused.

### Configuration

One deployment-set parameter governs the atom; it is named here because other sections depend on it:

- **Subscription id entropy** — the [Subscription Id]'s random material must come from a cryptographically secure random source with at least 128 bits of entropy, sufficient for negligible collision probability (Invariant 5) and unguessability. Per the Logic Confinement Principle (see `execution-contract.md`), the random material is an **injected input** to [Subscribe] — supplied by the deployment's entropy source at the seam, never generated inside the core transition — so the transition remains a pure function of its inputs and the entropy source remains auditable at the deployment layer. The [Subscription Id] must be unpredictable from any public property of the subscription (issue time, [Subscriber Ref]); this unpredictability is the foundation of the capability guarantee described in Behavior.

Id format and id storage security remain governed by deployment configuration.

### Inputs

- A [Subscriber Ref] identifying *who* holds the subscription. Opaque — the actor registry is a separate concept.
- An [Event Scope] identifying *what class of events* the subscription covers. Opaque — the composing system defines scope semantics. This atom does exact matching on the scope value; scope hierarchy, wildcard expansion, and pattern matching belong to composing patterns.
- Actions:
  - [Subscribe] — (Projected contract: `subscribe(subscriber_ref, event_scope) → subscription_id | rejected(reason)`); rejections include [Storage Failure] (no partial record written; state unchanged on failure)
  - [Cancel] — (Projected contract: `cancel(subscription_id) → ok | rejected(reason)`); rejections include [Storage Failure] (state unchanged on failure)
  - [Subscribed] — (Projected contract: `subscribed(subscriber_ref, event_scope) → subscribed | not-subscribed`)
  - [Subscribers For] — (Projected contract: `subscribers_for(event_scope) → [subscriber_ref, ...]`)
- The host reads the clock and allocates [Subscription Id] at the atom's single I/O seam before the transition. The pure transition receives [Subscribed At], [Cancelled At], and [Subscription Id] as injected inputs; neither is caller-supplied.

### Outputs

- The current set of subscriptions ([Active] and [Cancelled]).
- For each subscription: [Subscription Id], [Subscriber Ref], [Event Scope], [Subscribed At], [Status], and [Cancelled At] (if cancelled).
- [Subscribe] returns the new [Subscription Id] on success, or a rejection naming the failed precondition.
- [Cancel] returns `ok` on success, or a rejection naming the failed precondition.
- [Subscribed] returns one of two first-class outcomes: `subscribed` or `not-subscribed`. Both are answers to the query, not success-failure pairs. No rejection reason is defined because no input is invalid — an empty or malformed query unambiguously returns `not-subscribed`.
- [Subscribers For] returns the list of [Subscriber Ref] values for all [Active] subscriptions covering the queried [Event Scope]. The list is unordered. Composing systems that require delivery in a specific order must sort by [Subscribed At] or another field on the returned subscriber refs.

### State

A subscription occupies one of two named states:

- **[Active]** — the subscription is in force; the subscriber appears in [Subscribers For] results for the subscribed event scope.
- **[Cancelled]** — the subscription has been withdrawn; the subscriber no longer appears in [Subscribers For] results for that scope. Cancellation is terminal.

Each subscription carries:

- **[Subscription Id]** — opaque, immutable, host-allocated at the I/O seam. Set on [Subscribe]. Never changes.
- **[Subscriber Ref]** — opaque reference to the subscribing actor. Set on [Subscribe]. Never changes.
- **[Event Scope]** — opaque reference to the class of events subscribed to. Set on [Subscribe]. Never changes.
- **[Subscribed At]** — wall-time when the subscription was recorded. Set on [Subscribe]. Never changes.
- **[Status]** — `active` or `cancelled`. Set to `active` on [Subscribe]; transitions to `cancelled` on [Cancel].
- **[Cancelled At]** — wall-time when the subscription was cancelled. Absent while [Active]; set on [Cancel]. Never changes after set.

**Transitions.** Each write action is fail-closed: a rejected [Subscribe] or [Cancel] writes no record and leaves state unchanged ([Storage Failure] included). Timestamps are stamped from the injected clock at the seam. The two read-only queries never transition (below the table).

| Action | From | Guard | To | Effect |
|---|---|---|---|---|
| [Subscribe] | — (new) | non-empty refs; no [Active] subscription for the ([Subscriber Ref], [Event Scope]) pair | [Active] | records a new subscription with a fresh [Subscription Id], the supplied [Subscriber Ref] and [Event Scope], and [Subscribed At]; returns [Subscription Id] |
| [Subscribe] | ([Active] exists for pair) | — | (rejected) | [Already Subscribed] |
| [Cancel] | [Active] | known [Subscription Id] | [Cancelled] | stamps [Cancelled At]; returns `ok` |
| [Cancel] | [Cancelled] | — | (rejected) | [Not Active] |
| [Cancel] | (unknown id) | — | (rejected) | [Not Known] |

Read-only queries (no state change): **[Subscribed]** returns `subscribed` if any [Active] subscription matches the queried ([Subscriber Ref], [Event Scope]) pair, otherwise `not-subscribed`. **[Subscribers For]** returns the [Subscriber Ref] values of all [Active] subscriptions for the queried [Event Scope] — an empty list if none exist, whether the scope has never been subscribed to or all its subscriptions are [Cancelled]; the atom does not distinguish these cases (see Behavior).

### Flow

1. **An actor or composing pattern creates a subscription.** Calls [Subscribe] — the atom records the subscription in [Active] and returns the id.
2. **Time passes; the subscription persists.** The composing pattern stores the [Subscription Id] alongside whatever configuration necessitated the subscription.
3. **An event fires.** A composing pattern calls [Subscribers For] to enumerate current [Active] subscribers for the event's scope. The atom returns the set; what the composing pattern does with it — typically creating a notification per subscriber via [Notification Fanout](../compositions/notification-fanout.md) — belongs to that pattern, not this atom.
4. **At some point, the subscription is cancelled.** Calls [Cancel]. The subscription moves to [Cancelled]; subsequent [Subscribers For] queries no longer include the subscriber for that scope.

### Decision points

- **At [Subscribe]** — [Subscriber Ref] and [Event Scope] must be non-empty — specifically, neither may be null, undefined, or the empty string; otherwise [Invalid Request]. The atom does not parse, normalize, or otherwise interpret the opaque values beyond this presence check. An [Active] subscription must not already exist for this ([Subscriber Ref], [Event Scope]) pair; otherwise [Already Subscribed].
- **At [Cancel]** — [Subscription Id] must reference a known subscription; otherwise [Not Known]. The referenced subscription must be in [Active]; cancelling an already-cancelled subscription is rejected as [Not Active].
- **At [Subscribed]** — no precondition. `subscribed` and `not-subscribed` are both first-class outcomes, not rejections. Empty or malformed inputs return `not-subscribed` — an empty query matches no [Active] subscription by definition, so the answer is determinate without a precondition check. The asymmetry with [Subscribe]'s [Invalid Request] rejection is intentional: [Subscribe] creates a record (so bad inputs would produce a bad record); [Subscribed] only reads, so bad inputs produce a correct answer without side effects.
- **At [Subscribers For]** — no precondition. Empty or malformed [Event Scope] returns an empty list — no [Active] subscription has an empty scope value, so the result is structurally empty. The query is read-only. If the store is unavailable, the caller receives no list; the atom does not return a partial or cached result — store availability is a deployment-layer matter.

### Behavior

Observed behavior, derived from how event-subscription systems are actually deployed:

- A [Subscribers For] query is answered entirely from the active subscription set. No [Active] subscription for a scope → empty list. The composing system is responsible for calling [Subscribers For] when an event fires; the atom does not know about events and does not invoke any action in response to them.
- [Subscribers For] returns an empty list regardless of whether the scope has never been subscribed to or has only [Cancelled] subscriptions. The composing system cannot distinguish these cases from the query alone — that distinction, if operationally meaningful, requires querying the full subscription history for the scope. This is intentional: the atom answers *who should be notified now* without requiring the composing system to reason about historical subscription activity.
- [Subscribers For] returns [Subscriber Ref]s rather than `(subscriber_ref, subscription_id)` pairs. The likely objection: "composing patterns need to associate the resulting notification with the subscription that triggered it, for audit and deduplication." The mechanism: the composing pattern captures the [Subscription Id] at [Subscribe] time — specifically, the value returned by [Subscribe] (the seam's output projection) — when it already knows the ([Subscriber Ref], [Event Scope]) pair it just registered — and records the binding in its own store. Invariant 6 guarantees the binding is well-defined: at most one [Active] subscription per ([Subscriber Ref], [Event Scope]) pair, so a single id covers each Active row. The atom does not expose a `subscription_id_of(subscriber_ref, event_scope)` recovery query; capturing at subscribe time is the supported path. The result: per-subscription traceability is available when the composing pattern needs it, the atom's query surface stays small, and the separation between the Subscription atom's internal identities and the Notification atom's recipient surface is preserved.
- At most one [Active] subscription per ([Subscriber Ref], [Event Scope]) pair. A second [Subscribe] for a pair that already has an [Active] subscription is rejected as [Already Subscribed]. This is the key structural distinction from Permissions, which permits multiple independent grants per (subject, scope). The likely objection: "sometimes a subscriber re-subscribes through a new channel or session and should get a fresh record." The mechanism: cancel the old subscription first, then subscribe — the new [Subscription Id] represents the fresh registration. The result: the at-most-one invariant holds; the history of cancellation and re-subscription is recoverable; no duplicate notifications from a single logical subscription.
- Cancellation is immediate and terminal. After a successful [Cancel], the subscription moves to [Cancelled] and subsequent [Subscribers For] queries for that scope no longer include the subscriber. The subscription record remains observable for audit purposes but no longer contributes to fanout.
- [Event Scope] is evaluated by exact match on the opaque scope value. The composing system defines the scope vocabulary. The atom makes no assumption about scope structure — hierarchy, wildcards, and pattern matching belong to the composing layer.
- The atom uses **capability-based authorization** (a security model where possessing a token or identifier is sufficient proof of authorization) for [Cancel]: knowledge of the opaque [Subscription Id] is itself the cancellation capability; this capability guarantee rests on the id's unpredictability — it is cryptographically-secure random material, injected at the I/O seam (see Configuration), and unpredictable from any public property of the subscription (issue time, [Subscriber Ref]). The id is host-allocated at the I/O seam, opaque, and not enumerable from the atom's action surface, so in practice only parties to whom the id has been delivered (by the original subscriber or by a composing system that recorded it at subscribe time) can cancel. Composing systems that need richer authorization — role-based gating, multi-party consent, audit-on-cancel — wrap the bare capability with Permissions or Actor Identity. The bare atom enforces something specific and useful (capability gating); the layering story for richer models is clean.
- The atom does not record when events fired against a subscription, how many times a subscriber was notified, or whether delivery succeeded. Event firing history belongs to an Event Log composing pattern; delivery outcomes belong to the Notification atom.
- **Time and id are injected at the seam.** The host reads the clock and allocates [Subscription Id] at the atom's single I/O seam before each transition; the core transition receives [Subscribed At], [Cancelled At], and [Subscription Id] as injected inputs. The core reads no clock and generates no random id internally. Caller signatures are unchanged: `subscribe(subscriber_ref, event_scope)` and `cancel(subscription_id)` remain the externally visible surface; time and id injection occurs at the seam, not in the caller's invocation.

### Feedback

Each successful action produces an observable, measurable change:

- After [Subscribe] — a new subscription appears in [Active] with a fresh [Subscription Id], the supplied [Subscriber Ref] and [Event Scope], and [Subscribed At]. Total subscription count increases by one. Active subscription count increases by one. The id is returned. Falsifiable: after a successful `subscribe(a, s)`, `subscribed(a, s)` must return `subscribed` and `subscribers_for(s)` must include `a`.
- After [Cancel] — the subscription at [Subscription Id] moves to [Cancelled] with [Cancelled At]. Active count decreases by one; cancelled count increases by one; total count unchanged. Falsifiable: after a successful `cancel` of subscription for (a, s), `subscribed(a, s)` must return `not-subscribed` and `subscribers_for(s)` must not include `a`.
- After [Subscribed] — no state change. Returns `subscribed` or `not-subscribed`. The return value is the complete observable signal.
- After [Subscribers For] — no state change. Returns the list of [Subscriber Ref] values for all [Active] subscriptions covering the queried scope. The return value is the complete observable signal.

[Subscribe] rejections: [Invalid Request], [Already Subscribed], [Storage Failure]. [Cancel] rejections: [Not Known], [Not Active], [Storage Failure].

The full subscription set — [Active] and [Cancelled] — is queryable. Per-subscription fields (id, [Subscriber Ref], [Event Scope], [Subscribed At], [Status], [Cancelled At]) are observable.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Subscription immutability.** Once recorded, a subscription's [Subscription Id], [Subscriber Ref], [Event Scope], and [Subscribed At] never change.
- **Invariant 2 — Status monotonicity.** A subscription's [Status] transitions only in one direction: [Active] → [Cancelled]. No subscription returns from Cancelled to Active.
- **Invariant 3 — Cancellation is terminal.** Once a subscription is in [Cancelled], no [Cancel] call will succeed for that [Subscription Id] ([Not Active]), and no [Subscribers For] query will include it.
- **Invariant 4 — New subscribe after cancel produces a new id.** Cancelling a subscription and calling [Subscribe] again for the same ([Subscriber Ref], [Event Scope]) produces a distinct, fresh [Subscription Id]. The cancelled id is never reused. The two subscription records — one [Cancelled], one [Active] — are independently queryable with their own [Subscribed At] timestamps.
- **Invariant 5 — No id reuse.** No two subscriptions share a [Subscription Id] across the lifetime of the system.
- **Invariant 6 — At most one active subscription per ([Subscriber Ref], [Event Scope]).** No two [Active] subscriptions may share the same ([Subscriber Ref], [Event Scope]) pair. A [Subscribe] call for a pair with an existing [Active] subscription is rejected as [Already Subscribed]. This is the structural mechanism that prevents duplicate notifications from a single logical subscription.
- **Invariant 7 — Evaluation self-containment.** `subscribers_for(event_scope)` and `subscribed(subscriber_ref, event_scope)` are determined entirely by the active subscription set at query time. No out-of-band data is consulted.
- **Invariant 8 — Absence means not-subscribed.** [Subscribed] returns `not-subscribed` if and only if no [Active] subscription exists for the queried ([Subscriber Ref], [Event Scope]) pair. [Subscribers For] omits any [Subscriber Ref] for which no [Active] subscription exists for the queried [Event Scope].
- **Invariant 9 — Timestamp ordering.** For any subscription in [Cancelled] state, `subscribed_at ≤ cancelled_at`. This invariant is best-effort under non-monotonic clocks; if the underlying clock moves backward (NTP adjustment, clock skew), the inequality may be violated. The implementor is responsible for the clock discipline that makes it hold; see Edge cases.

Evaluation self-containment and absence-means-not-subscribed together give the *determinism* property — both query operations are pure functions of the active subscription set at query time. Subscription immutability and status monotonicity together give the *auditability* property — the full subscription history of every record is recoverable from the subscription store alone.

---

## Examples

The same atom, three domains, identical mechanic.

### Shared Todo — assignment notification

In a Shared Todo deployment, actors subscribe to assignment events scoped to themselves. `subscribe(dev_d, task:assigned:dev_d) → sub_42`. When manager M assigns a task to dev_d, the composition calls `subscribers_for(task:assigned:dev_d)` — dev_d's [Subscriber Ref] appears in the result; the composition then creates a Notification record for dev_d. When dev_d opts out of assignment emails, `cancel(sub_42)` — subsequent [Subscribers For] queries for that scope return an empty list; dev_d receives no further assignment notifications.

### Support queue — escalation alerts

A supervisor subscribes to escalation events for their queue: `subscribe(supervisor_s, escalation:queue-9) → sub_e1`. When a ticket in queue 9 escalates, the composition calls `subscribers_for(escalation:queue-9)` — supervisor_s appears; a notification is created. When a second supervisor takes over queue 9, the first cancels: `cancel(sub_e1)`. Subsequent escalations notify only those with Active subscriptions for that scope.

### Compliance system — policy change broadcast

An administrator issues subscriptions for each compliance officer: `subscribe(officer_a, policy:updated) → sub_p1`, `subscribe(officer_b, policy:updated) → sub_p2`. Each officer holds their own Active subscription. When a policy is updated, `subscribers_for(policy:updated)` returns both officers; one notification is created per officer. An officer who leaves the team has their subscription cancelled; they no longer appear in subsequent fanout queries.

### Rejection path

A developer attempts to subscribe twice to the same scope: `subscribe(dev_d, task:assigned:dev_d) → sub_42`. Then `subscribe(dev_d, task:assigned:dev_d)` → `rejected(already-subscribed)`. The second call does not create a second subscription. To refresh the subscription, the developer first calls `cancel(sub_42)`, then `subscribe(dev_d, task:assigned:dev_d) → sub_97`. The cancellation of sub_42 remains in the subscription store; sub_97 is the new active record.

### Regulated adversarial scenarios

Three scenarios the subscription store must survive in regulated contexts:

- **Regulator audit — who was subscribed to a scope at a given time.** A compliance auditor asks *"which actors were subscribed to `policy:updated` at the time the policy was updated on 2025-03-14T10:00Z?"* The auditor queries the subscription store for subscriptions where `event_scope = policy:updated` and (`status = active` or `cancelled_at > 2025-03-14T10:00Z`) and `subscribed_at ≤ 2025-03-14T10:00Z`. The subscription store answers from stored fields alone — [Subscriber Ref], [Event Scope], [Subscribed At], [Status], [Cancelled At] — with no recourse to developer narration. Invariants 1 and 9 make the timeline reconstruction exact.
- **Disputed subscription — actor claims they were never subscribed.** Officer_a denies having subscribed to `escalation:queue-9`. The investigator queries the subscription store for subscriptions where `subscriber_ref = officer_a` and `event_scope = escalation:queue-9`. If a record exists with [Subscribed At] and the actor's reference, Invariant 1 (subscription immutability) is the structural answer: the record was created at that time with that [Subscriber Ref]; it does not change. If no record exists, the store confirms the actor was never subscribed. The subscription store is the single source of truth; no external corroboration is required.
- **Breach investigation — exposure scope assessment.** A security incident requires identifying all actors who were subscribed to `data:export` at the time of the breach (2025-06-01T03:00Z). The investigator queries subscriptions where `event_scope = data:export` and `subscribed_at ≤ 2025-06-01T03:00Z` and (`status = active` or `cancelled_at > 2025-06-01T03:00Z`). The result set is the exposure scope — every actor who would have received notifications fired against that scope during the breach window. Invariant 6 (at-most-one-active) confirms no actor appears more than once in the Active set at any point in time.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Event routing and fanout.** This atom records subscriptions; it does not fire events, match events to subscriptions, or create notifications. Those belong to a Notification Fanout composing pattern that wires Subscription + Notification + an event source.
- **Notification delivery.** What happens after [Subscribers For] returns a list of subscribers is the composing pattern's responsibility. The Notification atom carries the delivery record; the transport mechanism (WebSocket, webhook, email, push) is handled at the deployment layer.
- **Scope hierarchy and pattern matching.** A subscription for `task:assigned` does not automatically cover `task:assigned:dev_d`. Scope semantics — prefix matching, wildcards, hierarchy — belong to the composing system's scope vocabulary. The atom does exact match.
- **Delivery guarantees.** Whether the composing pattern guarantees at-least-once, at-most-once, or exactly-once delivery is handled at the deployment layer.
- **Subscription expiry.** Subscriptions do not expire automatically. A time-bounded subscription — one that cancels after a deadline — requires a **Temporal Subscription** *(forthcoming)* composing pattern that calls [Cancel] at expiry time.
- **Subscriber registration and lifecycle.** [Subscriber Ref] is opaque. Whether a subscriber exists, is active, or has been deprovisioned belongs to Actor Registry, which is also where the cascade-cancellation-on-deprovisioning obligation lives — composing patterns that bind Actor Registry to Subscription must enumerate the deprovisioning actor's [Active] subscriptions and call [Cancel] for each. No bulk-cancel surface is exposed by this atom; cascade is per-subscription, by [Subscription Id].
- **Subscription attribution.** The atom does not record who called [Subscribe]. Attribution — *which administrator subscribed this actor?* — belongs to Actor Identity composing with the [Subscribe] action. The [Subscription Id] is the hook for composing attribution patterns: a composing Actor Identity pattern records `attest(subscription_id, subscribed_by_ref, credential)` at subscription time, binding the id to the actor who initiated the subscription. No field is added to the subscription record itself; the attribution lives in the Actor Identity store.
- **Authorization to cancel.** The atom does not enforce who may call [Cancel]. Any caller with the [Subscription Id] can cancel the subscription. Authorization to cancel — ensuring only the subscriber or an authorized administrator can cancel — belongs to the composing system.
- **Bulk cancellation.** There is no bulk-cancel surface. Cancelling all subscriptions for a departing actor requires enumerating their [Active] subscriptions and calling `cancel(subscription_id)` for each.
- **Event firing history.** The atom does not record when events fired against subscriptions, how many times, or with what payload. That belongs to an Event Log composing pattern.
- **Clock semantics.** [Subscribed At] and [Cancelled At] are wall-time supplied as injected inputs at the seam — the host reads the clock and passes the timestamp to the transition; the core reads no clock internally. Clock skew, NTP adjustments, and timezone handling are handled at the deployment layer; the spec does not address them. Invariant 9 is best-effort under non-monotonic clocks.
- **Atomicity and crash semantics.** State transitions are specified as atomic. [Cancel] changes two fields simultaneously: [Status] and [Cancelled At]. A crash mid-[Cancel] that sets one without the other violates Invariant 2 (status monotonicity) or Invariant 9 (timestamp ordering). The implementor is responsible for the transactional boundary that makes both fields change together. The spec does not define recovery semantics for partial writes.

---

## Generation acceptance

The audit surface is the subscription store inspected on its stored fields — distinct from and complementary to the action surface (`subscribe`, `cancel`, `subscribed`, `subscribers_for`). The action surface answers *what does the atom do at runtime?*; the audit surface answers *what does the atom commit to recording, queryable on stored fields?*. A derived implementation must produce a store that supports the audit-surface queries below, independent of whether the runtime action surface exposes them.

A derived implementation of Subscription is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the subscription store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Enumerate every subscription, active and cancelled, with its full history.** [Subscription Id], [Subscriber Ref], [Event Scope], [Subscribed At], [Status], and [Cancelled At] (where applicable) are present and queryable for every subscription ever created. No subscription is missing from the store.
- **Reconstruct the active subscriber set for any event scope at any past point in time.** Given a scope and a timestamp, the auditor can determine which subscriptions were Active at that moment by filtering on `subscribed_at ≤ t` and (`status = active` or `cancelled_at > t`). The timeline is exact (Invariants 1 and 9).
- **Confirm at-most-one-active constraint.** For any ([Subscriber Ref], [Event Scope]) pair, at most one subscription is in [Active] state at any point in time. The auditor can verify this directly from the subscription store (Invariant 6).
- **Confirm cancellation is terminal and immediate.** For every [Cancelled] subscription, [Cancelled At] is present and `status = cancelled`. No [Subscribers For] query after [Cancelled At] returns that subscriber for that scope (Invariant 3).
- **Identify composing patterns active in this deployment.** Whether subscription attribution (Actor Identity), event firing history (Event Log), retention (Retention Window), and tamper-evidence on the subscription store (Tamper Evidence) are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce a subscription store and a query surface that pass the five checks above.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Subscribe

The behavior that records a named actor's interest — creating a new [Active] subscription for a ([Subscriber Ref], [Event Scope]) pair with a fresh [Subscription Id] and stamping [Subscribed At]. Returns the [Subscription Id], or a rejection ([Invalid Request], [Already Subscribed], [Storage Failure]).

Kind: Operation

#### Cancel

The behavior that withdraws a subscription, moving it [Active] → [Cancelled] (terminal) and stamping [Cancelled At]. Knowledge of the [Subscription Id] is itself the capability. Returns `ok`, or a rejection ([Not Known], [Not Active], [Storage Failure]).

Kind: Operation

#### Subscribed

The read-only point query — returns `subscribed` if any [Active] subscription matches the ([Subscriber Ref], [Event Scope]) pair, else `not-subscribed`. Both are first-class outcomes; no rejection is defined (Invariant 8).

Kind: Operation

#### Subscribers For

The read-only fanout query — returns the [Subscriber Ref] values of all [Active] subscriptions for an [Event Scope] (unordered; empty if none). The list a composing pattern needs when an event fires.

Kind: Operation

#### Subscription Id

The opaque, immutable identity of a subscription — host-allocated at the I/O seam from ≥128-bit cryptographically-secure random material (see Configuration), produced by [Subscribe], never reused (Invariant 5). It is the subscription's identity, and — being unpredictable — the bearer capability that gates [Cancel].

Kind:     Field
Field of: the subscription
Projects: subscription_id

#### Subscriber Ref

The opaque reference to the subscribing actor. Set on [Subscribe], immutable (Invariant 1); the actor registry is a separate concept.

Kind:     Field
Field of: the subscription
Projects: subscriber_ref

#### Event Scope

The opaque reference to the class of events the subscription covers. Set on [Subscribe], immutable; matched by exact value ([Subscribers For] and [Subscribed] compare on it) — scope hierarchy and wildcards belong to composing patterns.

Kind:     Field
Field of: the subscription
Projects: event_scope

#### Subscribed At

The wall-time the subscription was recorded, injected at the seam on [Subscribe], immutable (Invariant 1). Its lower-bound relation to [Cancelled At] is best-effort (Invariant 9).

Kind:     Field
Field of: the subscription
Projects: subscribed_at

#### Status

The subscription's lifecycle state — `active` or `cancelled` (i.e., [Active] or [Cancelled]). Set to `active` on [Subscribe]; transitions once to `cancelled` on [Cancel] (Invariant 2).

Kind:     Field
Field of: the subscription
Projects: status

#### Cancelled At

The wall-time the subscription was cancelled, injected at the seam on [Cancel]. Absent while [Active]; set once and immutable thereafter; ≥ [Subscribed At] (best-effort, Invariant 9).

Kind:     Field
Field of: the subscription
Projects: cancelled_at

#### Active

The in-force state of a subscription: the subscriber appears in [Subscribers For] results for its [Event Scope]. The entry state on [Subscribe]. At most one [Active] subscription per ([Subscriber Ref], [Event Scope]) pair (Invariant 6).

Kind:      Member
Member of: the subscription status
Role:      Outcome

#### Cancelled

The terminal, withdrawn state of a subscription (Invariant 3): the subscriber no longer appears in [Subscribers For] results. Reached once, via [Cancel]; the record stays queryable for audit.

Kind:      Member
Member of: the subscription status
Role:      Outcome

#### Invalid Request

The rejection [Subscribe] returns when [Subscriber Ref] or [Event Scope] is null, undefined, or empty. (The read queries never return it — a bad query is a correct `not-subscribed` or empty answer.)

Kind:      Member
Member of: the Subscribe rejection
Role:      Outcome
Projects:  invalid-request

#### Already Subscribed

The rejection [Subscribe] returns when an [Active] subscription already exists for the ([Subscriber Ref], [Event Scope]) pair (Invariant 6) — the mechanism that prevents duplicate notifications.

Kind:      Member
Member of: the Subscribe rejection
Role:      Outcome
Projects:  already-subscribed

#### Storage Failure

The rejection [Subscribe] or [Cancel] returns when the store write fails; no partial record is written and state is unchanged.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The rejection [Cancel] returns when the [Subscription Id] references no subscription.

Kind:      Member
Member of: the Cancel rejection
Role:      Outcome
Projects:  not-known

#### Not Active

The rejection [Cancel] returns when the referenced subscription is already [Cancelled] — cancellation is terminal (Invariant 3).

Kind:      Member
Member of: the Cancel rejection
Role:      Outcome
Projects:  not-active

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Subscribe]: #subscribe
[Cancel]: #cancel
[Subscribed]: #subscribed
[Subscribers For]: #subscribers-for
[Subscription Id]: #subscription-id
[Subscriber Ref]: #subscriber-ref
[Event Scope]: #event-scope
[Subscribed At]: #subscribed-at
[Status]: #status
[Cancelled At]: #cancelled-at
[Active]: #active
[Cancelled]: #cancelled
[Invalid Request]: #invalid-request
[Already Subscribed]: #already-subscribed
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Not Active]: #not-active

---

## Composition notes

Subscription is freestanding and is designed to compose with:

- **[Notification](./notification.md)** — the delivery record produced when a subscription fires. The composing Notification Fanout pattern wires [Subscribers For] to `Notification.create`: for each subscriber returned, a Notification is created.
- **[Notification Fanout](../compositions/notification-fanout.md)** — the composition that wires Subscription + Notification + an event source into an end-to-end delivery pipeline.
- **[Event Log](./event-log.md)** — records when events fired against subscriptions. Each match between an event and a subscription scope can be appended as an event for auditing and replay.
- **[Actor Identity](./actor-identity.md)** — records who subscribed (subscription attribution) when subscriber accountability is required. [Subscription Id] is the hook: `attest(subscription_id, subscribed_by_ref, credential)` at subscribe time.
- **[Retention Window](./retention-window.md)** — the subscription store and its history must be retained for whatever regulatory or operational lifetime the deployment requires.
- **[Tamper Evidence](./tamper-evidence.md)** — in regulated contexts, the subscription store is a target for after-the-fact manipulation. Cryptographic commitment makes any rewrite detectable.

---

## Standards references

- **Observer pattern** (GoF) — the canonical object-oriented formulation of the subscriber/publisher relationship. Subscription is the structured-natural-language realization of the Subscriber role: an actor with a named interest in a class of events.
- **Publish-subscribe** (Birman & Joseph, 1987; subsequently AMQP, Apache Kafka, etc.) — topic-based subscription as the mechanism for decoupling event producers from consumers. Subscription records the consumer-side interest; the composing fanout pattern is the broker.
- **WebSub** (W3C Recommendation) — web-native publish-subscribe over HTTP. The subscription resource in WebSub is the direct Web analog of this atom.
- **XMPP PubSub** (XEP-0060) — structured publish-subscribe over XMPP. Subscription nodes are the protocol-level analog.
- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; [Event Scope] as an opaque reference whose semantics are defined by the composing system.
- **Eiffel's design-by-contract** — preconditions on [Subscribe] and [Cancel]; named rejection reasons.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed three foundational findings: the clock and `subscription_id` are now host-injected at the I/O seam (the id is cryptographically-random bearer-credential material — see Configuration), and the cancel-capability entropy floor is now stated; caller signatures unchanged and the invariant set held at 9; see Lineage. Formal layer landed 2026-06-03 — Alloy structural model `subscription.als` + buggy twin verified, see Lineage §Formal model. The pattern was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — structure and invariants specified; four examples including rejection path and regulated adversarial scenarios; regulated adversarial scenarios and generation acceptance added after Pass 3 surfaced the compliance example obligation; three-pass lineage records all findings and resolutions. First entry in `messaging`.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

This atom is the first entry in the `messaging/` category, drafted alongside Notification as the two-atom foundation for the forthcoming Notification Fanout composition.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Three findings.

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
- *Regulated adversarial scenarios and generation acceptance missing.* The compliance system example (policy change broadcast, compliance officer subscriptions) invokes a regulated domain; library rules in pressure-testing.md require both sections for any pattern whose examples invoke regulated contexts. Fixed: both sections added.
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

- **Closed-action vs. open-audit tension.** Per-pattern fix landed (audit-surface preamble); the canonical statement of the distinction belongs in `pressure-testing.md` or `contributing.md` so future patterns inherit the convention rather than re-derive it.
- **"Non-empty for opaque references" check semantics.** Per-pattern fix landed (null, undefined, empty string); a canonical statement belongs in a shared document.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 6 (at-most-one-active per (subscriber, scope)) is exclusivity across sequences; Invariant 2 monotonicity; Invariant 4 no-id-reuse. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: Alloy structural model authored and verified; pattern promoted to `grounded`.** Derived model [`subscription.als`](./subscription.als) + buggy twin [`subscription-buggy.als`](./subscription-buggy.als), checked headless by the `org.alloytools.alloy.dist` analyzer via `tools/harness/check.mjs` (drafted by a Sonnet subagent, gated by Opus review + an independent buggy-twin run). *What it checks:* a static structural model of subscription records over {Active, Cancelled} keyed by (subscriber, event_scope). Seven named `check` asserts cover the load-bearing **Invariant 6** (at-most-one-Active per key — `A_AtMostOneActivePerKey`, `A_NoDualActiveForSameKey`), **Invariant 5** (no id reuse — `A_NoIdReuse`, `A_IdsDistinctAcrossStatuses`), and the cancelled-timestamp consistency invariants — all UNSAT. Seven `run` predicates are all satisfiable (non-vacuity), critically `ShowTwoActiveSubscribersForSameScope` (two *different* subscribers on one scope is allowed) and `ShowCancelThenResubscribe`, so the per-key uniqueness check binds on the key, not the scope, and is not vacuous. *Buggy twin* removes the `AtMostOneActivePerKey` fact, letting two Active records share a (subscriber, event_scope) key; the checker finds a counterexample on `A_AtMostOneActivePerKey`. (The buggy file additionally carries one vacuous `run`, `ShowCancelTransition` — harmless: `--buggy` mode passes on the counterexample and ignores run vacuity; the *correct* model has no vacuous runs.) *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This atom grounded 2026-05-20 under the early process — its only prior "adversarial rerun" was author-conducted (no AI model credited; the sole AI involvement was the Alloy formal model) — and carried the legacy grandfathered token. This round is its first AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the atom's Final Critique 4. Three foundational findings closed: F-1/F-2 — Logic Confinement: the clock and `subscription_id` were read/minted inside the transitions; they are now host-injected at the I/O seam, with `subscribe`/`cancel` caller params unchanged; F-3 — because `subscription_id` is a bearer credential (cancel-by-capability), a Configuration subsection now states it is cryptographically-secure random material (≥128 bits), injected at the seam and unpredictable from any public property, and the cancel-capability guarantee rests on that — stated as Configuration, NOT a new invariant, so the invariant set held at 9 (Notification Fanout's "all nine Subscription invariants" reference stays valid). Refining: the captured id named as `subscribe`'s return value; `storage-failure` added to `subscribe`/`cancel` and a store-unavailable note added to `subscribers_for`. Formal-layer vote stands YES (Alloy model present); the seam is out of model scope, so the fixes do not reopen it. Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, invariant count verified at 9. Compositions affected — confirming check only, NOT a re-pass: Notification Fanout, Preference-Aware Notification Fanout. Grounds at Final Critique 4.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (17 terms): 4 Operations ([Subscribe], [Cancel], [Subscribed], [Subscribers For] — the [Subscribed] query is distinct from the `subscribed` outcome token); 0 Types (the subscription is an ambient plain-noun referent — "Field of: the subscription" — mirroring notification); 6 Fields ([Subscription Id], [Subscriber Ref], [Event Scope], [Subscribed At], [Status], [Cancelled At]); 0 Parameters (subscriber_ref and event_scope are stored as-themselves; the clock and the cryptographically-random subscription_id are seam-injected, not caller parameters); and 7 Members — the 2 lifecycle states ([Active], [Cancelled]) plus 5 rejections ([Invalid Request], [Already Subscribed], [Storage Failure], [Not Known], [Not Active]). Survivors left backticked: the one labeled projected-contract signature per Operation; the `subscribed`/`not-subscribed` first-class query outcomes and the `ok` success token; the lowercase `active`/`cancelled` [Status] wire values; the `subscribed_at ≤ cancelled_at` order predicate; the `subscribers_for(event_scope)` / `subscribed(subscriber_ref, event_scope)` call-shapes inside Invariant 7 (kept whole to avoid a spurious markdown link and to keep the normalized-invariant text identical) and the non-existent `subscription_id_of(...)` recovery query; concrete example calls, ids, and scope values; and external standard tokens. The clock and id are injected at the I/O seam (the id is ≥128-bit bearer-credential material — the cancel capability), and the [Status] is set by [Subscribe] / [Cancel], not derived from the clock, so there is no `[Now]` term (mirrors notification). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim is carried by Summary/Intent/Identity model/Invariants 1 and 6; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-sentence paragraphs, lossless (its second paragraph, on common uses, was kept intact). (e) **prose cut #5** — the State "Transitions" list rendered as a transition table (action / from / guard / to / effect) for the two write actions, with the fail-closed and terminal-[Cancelled] semantics in the prose and the two read-only queries ([Subscribed], [Subscribers For]) described beside it since they never transition. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-18`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (17 terms); 9 invariants preserved; `.als` untouched — harness re-run green: `subscription.als` PASS + `subscription-buggy.als --buggy` rejected.

</details>
