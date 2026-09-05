---
title: Notification Fanout
parent: Conceptual Compositions
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


## Summary

Notification Fanout connects an event to everyone who wants to hear about it. It combines two simpler patterns: one that records who is interested in which kind of event (Subscription) and one that creates a delivery record for one recipient and tracks whether it succeeded (Notification). Neither can do the job alone — the first knows who is interested but cannot deliver, the second can record a delivery but cannot decide who should get it.

When an event fires, the composition asks the subscription list who is currently subscribed to that event's topic and then creates one delivery record for each of them. The subscriber list is fixed at the moment the event fires — someone who cancels a split second later still gets a record for this one, someone who joins later does not — and a failure creating one person's record does not stop the others.

Combining the two patterns guarantees that every current subscriber gets exactly one record per event (or the failure is named in the result, never hidden) whenever the invocation runs to completion — a crash mid-fanout can leave created records with no returned result, the duplicate-risk case the idempotency edge case names — and that all records from one event carry the same content. The composition keeps no state of its own; audit, replay, and deduplication are added by further patterns layered alongside it.

The most common uses are compliance and policy-change broadcast systems where every subscribed officer must receive a delivery record that can be audited; product and project management platforms where task events notify all interested team members; and any distributed system where an action in one domain must propagate to a variable number of downstream consumers without the emitting component knowing who they are.

---

## Intent

Subscription and Notification are freestanding atoms (specs that can be specified without naming any other pattern): Subscription records who is interested in what; Notification records whether a piece of information reached a recipient. Neither knows about the other. What neither can do alone is answer the question that arises when an event fires: *for every subscriber currently Active on this scope, produce a delivery record.* That is the fanout operation — and it is a composition concept, not an atom concept.

The composition is structurally simple: one query (`Subscription.subscribers_for`) followed by N creates (`Notification.create`, one per returned subscriber). Its architectural significance is that it is the first place in the library where a single trigger produces a variable number of effects — N notification records, where N is the count of Active subscribers at trigger time. This is not a single transition with N side effects; it is a directed invocation graph (a representation of all the calls the composition makes and their dependencies — one query feeds N independent creates) with one query edge and N create edges. The fan-out is the composition; the atoms remain closed single-transition state machines.

The composition makes two architectural commitments explicit. First, the subscriber set is determined once at trigger time — a subscriber who cancels after the `subscribers_for` query executes still appears in that invocation's fanout; a subscriber who joins after it does not. Second, fan-out failures are per-recipient and non-aborting — a failure to record one recipient's notification does not cancel the creates for remaining recipients. Both commitments follow from the boundary rule for parallel composition: no rollback guarantee exists across independent create operations.

---

## Composes

- **[Subscription](../atoms/subscription.md)** — provides the Active subscriber set and the `subscribers_for(event_scope)` query surface. The composition reads but never writes the subscription store.
- **[Notification](../atoms/notification.md)** — provides the per-recipient delivery record and the `create(recipient_ref, payload)` action. The composition creates one Notification record per subscriber returned by the Subscription query.

---

## Composition logic

### Composition state

None. Notification Fanout has no persistent state of its own beyond its constituents' stores — **Contract classification: conforming, no stored composition state** ([`execution-contract.md`](../execution-contract.md) §Composition state). The Subscription store owns who is subscribed; the Notification store owns what was created and its delivery outcome. The composition is a stateless interpreter of a directed invocation graph over these two stateful atoms.

If a system needs to record that a particular event triggered a particular fanout — for audit, replay, or deduplication — it composes Event Log or Duplicate Prevention alongside this composition. Those concepts do not belong to the bare fanout mechanism. (This is the Contract's record-coordination rule applied by name: a composition that must record that its own sequences occurred does so by composing Event Log, never by growing a bespoke store — this composition already routes that concept out rather than holding it.)

### Primitive policies

Composition-boundary validation for [Fanout]'s two inputs:

- **`event_scope`** — must be non-null and non-empty string (rejection: `invalid-request`). The composition treats the scope value as opaque; no normalization, no case folding, no length cap imposed at this layer. Comparison is exact-match when passed to `Subscription.subscribers_for`. Validated before any id is generated or constituent called.
- **`payload`** — must be non-null (rejection: `invalid-request`). Content is opaque and passed to each `Notification.create` call unchanged. Schema validation, size limits, and content restrictions belong to the composing system before calling [Fanout].

### The load-bearing wiring decision

The decision the composition exists to enforce: **when a fanout invocation fails for some subscribers, the invocation continues for the remaining subscribers and names the failures in its result rather than aborting.**

*Principle.* A subscriber fanout is a parallel operation: each recipient's delivery record is independent. The composition must choose between all-or-nothing (abort on first failure, guarantee consistency) and continue-and-name-failures (deliver to the reachable set, surface the unreachable set). The composition chooses the latter.

*Likely objection.* "Shouldn't a regulated notification fanout guarantee every subscriber was reached, or none?" The all-or-nothing design would guarantee no subscriber receives a notification when the store is briefly unavailable for any single subscriber — regardless of the event's stakes. This is almost never the right tradeoff: it trades guaranteed delivery to the reachable majority for consistency with the unreachable minority.

*Mechanism.* Parallel composition carries no rollback guarantee. Each `Notification.create` call is independently committed. The composition has no transactional boundary spanning the N creates; providing one would require distributed transaction semantics and would serialize what is fundamentally a parallel operation. The [Failed] list is the pressure valve: it makes the tradeoff explicit rather than silent. The composing system receives the failure information and applies its own policy — accept-the-loss for low-stakes events, retry or escalate for high-stakes ones.

*Result.* Fanout coverage (Invariant 1) guarantees that every subscriber is accounted for in [Created] or [Failed]. No subscriber is silently missed. The composition's job is mechanism; policy lives in the caller. For regulated deployments, the [Failed] list combined with Event Log and Audit Trail gives the auditor a complete, attributed record of which subscribers were reached and which were not — the structural answer a regulator can verify from records alone.

### Action wiring

The composition exposes a single action:

**[Fanout]** — (Projected contract: `fanout(event_scope, payload) → {fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...], fired_at} | rejected(invalid-request | subscribers-unavailable)`)

1. Validate inputs: `event_scope` must be non-empty; `payload` must be non-null. If either condition fails, return `rejected(invalid-request)`. No id is generated; no subscriber query is made; no notification records are created. This validation is the composition's own boundary policy (Primitive policies), standing on its own authority — it is *consistent* with the constituents' postures (`Notification.create` rejects a null `payload`; Subscription's write surface rejects an empty `event_scope`), but nothing is inherited here: the composition never calls `subscribe`, so no constituent contract governs this check.
2. Generate the [Fanout Id] — an opaque (system-generated with no meaningful content), invocation-unique identifier (a direct effect: `entropy.generate()`, under the declared entropy floor Invariant 8 names). This id is the correlation handle for this invocation. When Event Log is composed in, the caller uses [Fanout Id] as the log entry's reference, binding the invocation record to its subscriber list and created `notification_ids`. Without Event Log, [Fanout Id] is ephemeral — returned to the caller for transient correlation but not persisted by the composition.
3. Call `Subscription.subscribers_for(event_scope)`.
   - If the subscription store is unavailable (infrastructure failure at the read step), return [Subscribers Unavailable]. No notification records are created. [Fanout Id] is not returned on rejection — the invocation did not complete.
   - If the result is an empty list, return `{fanout_id, created: [], failed: []}`. The fanout is complete; no subscribers are currently Active for this scope.
4. For each `subscriber_ref` in the returned list, call `Notification.create(subscriber_ref, payload)`.
   - If `create` returns a `notification_id`, add it to the [Created] list.
   - If `create` returns `rejected(invalid-request)` — the constituent's only declared rejection — this indicates a structural inconsistency: `subscriber_ref` is non-empty (it was returned from the subscription store) and payload passed input validation in step 1. Add `subscriber_ref` to [Failed]. Continue.
   - If `create` yields anything else — the write cannot be recorded because the notification store is unavailable, the call times out, or no conforming constituent outcome comes back at all — **the composition classifies that non-`notification_id` outcome at this boundary** as the subscriber's fanout failure: add `subscriber_ref` to [Failed] and continue to the next subscriber; do not abort the fan-out. This classification is composition-owned, not an inherited rejection token: Notification's `create` contract is `notification_id | rejected(invalid-request)` and declares no infrastructure-failure arm, so an unrecordable write has no constituent name — the boundary names it, exactly as it names the read-side counterpart [Subscribers Unavailable].
5. Return `{fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...]}`.

The order of `create` calls across subscribers is not guaranteed. Parallel execution is permitted provided the implementation guarantees each `Notification.create` call is independently committed — no shared transaction boundary across the N creates. The result's [Created] and [Failed] lists are unordered.

**The fan-out continues through failures.** A failed create — a boundary-classified unrecordable write, or the structural-inconsistency `invalid-request` — on one subscriber does not abort the fan-out for remaining subscribers. This follows directly from the composition boundary rule: parallel composition carries no rollback guarantee. A subscriber not in the [Created] list is one for whom no delivery record exists; the composing system is responsible for inspecting the [Failed] list and deciding whether to retry.

### Retry semantics

A caller who receives a non-empty [Failed] list and wishes to retry has two options. First: call `Notification.create(subscriber_ref, payload)` directly for each `subscriber_ref` in the [Failed] list — this retries exactly the failed creates without re-querying the subscriber set. Second: call [Fanout] again — this re-queries `subscribers_for`, which may return a different subscriber set if subscriptions have changed in the interim. The first option is correct when the caller needs to deliver to exactly the original fanout's subscriber set; the second is correct when delivering to the current Active set is the right behavior. Callers who need at-most-once fanout semantics across retries should compose Duplicate Prevention to guard the [Fanout] call itself; see Edge cases.

All entries in the [Failed] list are treated as retry-eligible regardless of the underlying failure mode — the boundary-classified unrecordable write and the structurally-inconsistent `invalid-request` case (see action wiring step 4) are collapsed into a single "delivery did not record" outcome. A retry for a structurally-inconsistent `subscriber_ref` will fail again with the same rejection; persistent failure for a specific `subscriber_ref` across multiple retries indicates a structural inconsistency that the composing system must resolve out-of-band (the `subscriber_ref` is malformed, the notification store has rejected the payload shape, etc.). The composition does not surface the underlying reason — callers needing reason-level diagnostics compose Event Log to capture each `Notification.create` outcome at the call site.

---

## Composition-level invariants

Invariants 1–5 and 8 emerge from the composition — neither constituent atom carries them alone. Invariants 6 and 7 are preservation claims: they state that composing does not weaken either constituent's own invariant set.

- **Invariant 1 — Fanout coverage.** For any `fanout(event_scope, payload)` invocation that returns a result (not `rejected`), exactly one `Notification.create` call is attempted for each `subscriber_ref` returned by `Subscription.subscribers_for(event_scope)` at the time of the query. No subscriber is skipped; no subscriber outside the query result receives a create call. The [Created] and [Failed] lists together account for every subscriber in the query result: `|created| + |failed| = |subscribers_for result|`.
- **Invariant 2 — Payload consistency.** All Notification records created in a single [Fanout] invocation carry the same payload. A subscriber cannot receive a different payload than another subscriber from the same invocation.
- **Invariant 3 — No cross-notification coupling.** A failure to record a notification for subscriber A does not affect the notification record created for subscriber B. Each `Notification.create` call is independent; its success or failure is isolated to that record.
- **Invariant 4 — At-most-one notification per subscriber per fanout.** `Subscription.subscribers_for` returns at most one entry per `subscriber_ref` for a given scope (Subscription Invariant 6 — at most one Active subscription per (`subscriber_ref`, `event_scope`) pair). The composition calls `Notification.create` at most once per returned `subscriber_ref` per invocation. A single fanout produces at most one notification per subscriber.
- **Invariant 5 — Subscription store is read-only.** The composition never writes to the subscription store. `Subscription.subscribers_for` is the only call made against the Subscription atom. No subscription is created, modified, or cancelled by the fanout action.
- **Invariant 6 — Notification atom invariants preserved.** All nine Notification invariants hold over each created record. The composition does not bypass Notification's preconditions or write to the notification store directly.
- **Invariant 7 — Subscription atom invariants preserved.** All nine Subscription invariants hold. The composition reads the subscription store through Subscription's declared query surface (`subscribers_for`); it does not join the subscription table directly.
- **Invariant 8 — Fanout invocation uniqueness.** Each [Fanout] invocation that returns a result (not `rejected`) is assigned a unique [Fanout Id]. No two invocations share a [Fanout Id] across the lifetime of the system — a claim that carries a **declared entropy floor**: the host id source behind `entropy.generate()` must supply at least 128 bits of entropy per id (or an equivalently coordinated unique generator), the same floor each constituent atom declares for its own record ids. [Fanout Id] is generated before any constituent calls; it is present in every non-rejected result, including the empty-subscriber case. When Event Log is composed in, [Fanout Id] is the durable invocation identity. Without Event Log, [Fanout Id] is ephemeral — the caller receives it and may use it for transient correlation, but the composition does not persist it.

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
- Returns `rejected(invalid-request)`. No [Fanout Id] is generated; no subscriber query is made; no notification records are created.

The same rejection fires for an empty `event_scope`: `fanout("", {task_id: t9})` → `rejected(invalid-request)`.

### Subscription store unavailable

The subscription store is down when the fanout fires.

- `fanout("task:assigned", {task_id: t9, assigned_by: manager_m})` → step 3: `Subscription.subscribers_for` fails with an infrastructure error.
- Returns `rejected(subscribers-unavailable)`. No notification records are created; the [Fanout Id] generated in step 2 is discarded and not returned — the invocation did not complete. The caller may retry when the store recovers.

### Partial failure

During a fanout, the notification store becomes temporarily unavailable after the first create succeeds.

- `fanout_id = fanout_f03` generated.
- `subscribers_for → [dev_a, dev_b, dev_c]`
- `Notification.create(dev_a, payload) → notif_61` ✓
- `Notification.create(dev_b, payload)` → the write fails against the unavailable store: no `notification_id`, no conforming constituent outcome — the boundary classifies it as dev_b's fanout failure (action wiring step 4) ✗
- `Notification.create(dev_c, payload) → notif_62` ✓ (fan-out continues)
- Returns `{fanout_id: fanout_f03, created: [notif_61, notif_62], failed: [dev_b]}`.

The caller inspects the [Failed] list and calls `Notification.create(dev_b, payload) → notif_63` directly. That new record enters Pending independently; dev_a's and dev_c's records are already in their own delivery lifecycles.

### Compliance system — policy change broadcast

An administrator publishes a revised data-handling policy. Every compliance officer with an Active subscription to `policy:updated` events must receive a notification. `fanout("policy:updated", {policy_id: p12, effective_date: "2025-09-01"})` fires. Three officers are Active; three Notification records are created. Each officer's delivery outcome is tracked independently: officer_a delivered, officer_b failed (email bounce), officer_c expired (no delivery attempt within the window).

An auditor later asks: *was every subscribed compliance officer notified of policy p12?* The auditor queries the notification store for records where `payload.policy_id = p12`. Three records appear — one per officer — with their respective delivery outcomes. The Subscription store shows each officer held an Active subscription for the `policy:updated` scope. Invariant 1 gives the structural answer: the [Created] set accounts for all subscribers returned by the fanout query. For a precise binding to the exact fanout invocation — confirming no Active subscriber at that specific moment was omitted — a composed Event Log recording the fanout with `fired_at` provides the timestamp needed to apply Subscription's historical-state filter; without it, Active-status confirmation is over the general period rather than the exact fanout moment.

### Regulated adversarial scenarios

- **Regulator audit — demonstrate all subscribers were notified of a compliance event.** An auditor asks: *show all notification records created by the policy:updated fanout on 2025-08-15 and whether each was delivered.* The auditor queries the notification store for records where `created_at` falls on 2025-08-15 and the payload references the relevant policy. For each returned record, `status_of` shows the delivery outcome. Invariants 1 and 4 are the structural guarantees. Note on completeness: the Subscription store *does* support historical reconstruction of who was Active at any given moment — Subscription Invariant 9 (timestamp ordering) plus the immutable `subscribed_at` / `cancelled_at` fields make the filter `subscribed_at ≤ T` AND (`status = active` OR `cancelled_at > T`) exact to within Invariant 9's best-effort clock caveat. The actual completeness gap is different: the auditor needs to know the *exact fanout time* — the moment of the `subscribers_for` query — to apply the filter. The Subscription store doesn't record fanout invocations; that timestamp lives in Event Log, not Subscription. A composed Event Log recording the fanout invocation with its `fired_at` timestamp (see Generation acceptance check 1) is therefore required to bind the audit to a specific fanout invocation among potentially many for the same scope. Without it, the auditor can identify who was notified from the notification records, but cannot pin the audit to one specific fanout.
- **Disputed notification — subscriber claims they were never notified.** An officer claims no notification of policy p12 arrived. The investigator queries the notification store for records where `recipient_ref = officer_ref` and `payload.policy_id = p12`. If a record exists in any state, the store confirms the delivery attempt and its outcome. If the record shows `failed_at` or `expired_at`, the store confirms delivery did not succeed; the [Failed] list from the fanout result (logged via Event Log if composed) identifies this as a named failure, not a silent omission. If no record exists, either the officer had no Active subscription at fanout time (query the subscription store) or their create failed to record — the boundary-classified write failure, again a named failure in the [Failed] list, not a gap. The subscription and notification stores together answer the question.
- **Breach investigation — identify all notifications that may have carried sensitive payload data.** A security incident requires identifying every notification created by fanouts referencing policy p12. The investigator queries the notification store for records where `payload.policy_id = p12` and applies the historical-status reconstruction logic from Notification's regulated adversarial scenarios (`created_at ≤ breach_time` and status was Pending during the window). The notification store answers the exposure scope from stored fields alone.

---

## Edge cases and explicit non-goals

- **Fanout idempotency and crash-mid-execution.** The bare composition provides no idempotency guarantee. Two distinct failure modes require attention. First: if [Fanout] is called twice for the same event (network retry, double-click, replay), two full rounds of `Notification.create` execute — two notification records per subscriber. Second, and more dangerous: if the composition crashes mid-execution after some creates have succeeded, the `{created, failed}` result is never returned. The caller has no record of which subscribers received a notification record; a retry without idempotency creates duplicates for subscribers whose creates already succeeded. In both cases, composing [Duplicate Prevention](../atoms/duplicate-prevention.md) to guard the [Fanout] call provides at-most-once fanout semantics within the deduplication window. Without it, the caller must treat any retry as a potential duplicate-creation event and handle the resulting multiple notification records at the delivery layer.
- **Subscriber-set staleness between query and create.** `Subscription.subscribers_for` is called once at the start of the fanout. A subscriber who cancels after the query but before their `Notification.create` is called will still receive a notification record — their subscription was Active at query time. Whether the delivery should proceed is a deployment policy the composing system defines, not a correctness failure of the composition.
- **New subscribers after query.** A subscriber who becomes Active after `subscribers_for` executes does not receive a notification for that fanout invocation. They will receive notifications from subsequent fanouts. This is correct: the composition delivers to the Active set at trigger time.
- **Empty Active subscriber set.** [Fanout] returns `{fanout_id, created: [], failed: []}`. No Notification records are created. This is a valid, non-error outcome. The [Fanout Id] is still generated and returned — it is the invocation's correlation handle regardless of the subscriber count. The composing system may log this via Event Log if observability of empty fanouts is required.
- **Event scope hierarchy and wildcards.** `Subscription.subscribers_for` performs exact-match on the event scope. A subscriber with scope `task:*` does not receive notifications for `task:assigned` under the bare atoms. Scope hierarchy and pattern matching belong to a composing pattern that expands scope expressions before calling `subscribers_for`.
- **Delivery ordering.** Notification records are created in an unspecified order. The Notification atom does not guarantee delivery in creation order. If ordered delivery is required, the composing delivery layer sorts `Notification.pending_for` results by `created_at`.
- **Caller disposition on the [Failed] list: transient failures vs. structural inconsistencies.** The composition returns `{failed}` rather than aborting on first `Notification.create` failure by design — the mechanism cannot know whether a missed delivery matters; only the caller can. An all-or-nothing design would guarantee no subscriber receives a notification when the store is briefly unavailable, regardless of the event's stakes. The current design guarantees delivery to every reachable subscriber and surfaces the unreachable set for policy-level disposition. Delivery to the reachable majority is almost always worth more than guaranteed consistency with the unreachable minority; the [Failed] list is the pressure valve that makes the tradeoff explicit rather than silent.

  Two distinct failure conditions collapse into [Failed], and they carry different caller obligations. *Transient failures* — the write step failed to record (no `notification_id` and no conforming constituent outcome; the boundary-owned classification of action wiring step 4) — are retry-eligible: the `subscriber_ref` is valid, the payload passed validation, the notification store was temporarily unavailable. Calling `Notification.create(subscriber_ref, payload)` directly against the [Failed] list will likely succeed when the store recovers. *Structural inconsistencies* — `Notification.create` returned `rejected(invalid-request)` despite the `subscriber_ref` being non-empty and the payload passing fanout's own validation — indicate a contract mismatch: Subscription's definition of a valid `subscriber_ref` does not match Notification's. A retry will fail with the same rejection. Persistent failure for a specific `subscriber_ref` across multiple retries is the diagnostic signal; the first failure is ambiguous.

  The composition collapses both into [Failed] because it cannot classify the inconsistency without retrying and observing persistence — the caller, who knows the domain semantics of `subscriber_ref`, is better positioned to do that. Callers needing reason-level diagnostics at the first failure compose Event Log to capture each `Notification.create` outcome at the call site.

  Caller policy follows from the event's stakes. For low-stakes events — activity feeds, engagement notifications — inspecting the [Failed] count, logging it, and accepting the loss is the appropriate disposition: the fanout reached all structurally valid subscribers, and the gap is named, not hidden. For high-stakes events — regulated notifications such as policy updates, account actions, and legal notices — the [Failed] list is a delivery obligation: retry transient failures until the store recovers, and for persistent structural failures escalate to a secondary delivery channel (physical mail, phone, manual outreach) or record the gap in [Audit Trail](./audit-trail.md) as a named delivery failure with attribution and timestamp. In both cases the composition's behavior is identical; only the caller's policy differs. This is the boundary the composition enforces: mechanism here, policy in the composing system.

- **Retry targeting the original failed set.** A caller who retries [Fanout] re-queries `subscribers_for`, which may return a different set than the original invocation. Callers who need to retry exactly the failed `subscriber_refs` should call `Notification.create` directly for each ref in the [Failed] list rather than re-invoking [Fanout].
- **Transport mechanism.** This composition creates Notification records; it does not dispatch them to recipients. The delivery layer — WebSocket push, webhook POST, email send — reads `Notification.pending_for` and calls `deliver`, `fail`, or `expire`. Transport is handled at the deployment layer, outside this composition.
- **Authorization to fanout.** The composition does not enforce who may call [Fanout]. Any caller may trigger a fanout for any event scope with any payload. Authorization belongs to the composing system — typically [Permissions](../atoms/permissions.md) gating the [Fanout] action against the caller, optionally with [Actor Identity](../atoms/actor-identity.md) attesting who triggered the invocation when attribution is required for audit.
- **Payload size and content.** Payload is opaque and passed to `Notification.create` unchanged. Size limits, schema validation, and content restrictions belong to the composing system before calling [Fanout].
- **Fan-out at scale.** N sequential or parallel `create` calls scale with the Active subscriber count. For scopes with thousands of Active subscribers, the implementation must handle throughput (batching, cursor-pagination of `subscribers_for`, parallel creates). The spec does not constrain the execution strategy as long as Invariant 1 (fanout coverage) holds.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the single emergent action it exposes ([Fanout]) and the parts of the result that action returns — the [Fanout Id] correlation handle it generates, plus the [Created] and [Failed] lists that partition the subscriber set — and its own [Subscribers Unavailable] rejection. The composition keeps **no state of its own** (Composition state: none), so there is no record store to card. References to the constituent atoms and their operations — Subscription's `subscribers_for`, Notification's `create` / `status_of` — the relayed constituent tokens (`event_scope`, `subscriber_ref`, `notification_id`, `payload`), and the one inherited rejection (`invalid-request`) remain qualified/backticked, not carded here (the write-side infrastructure failure carries no constituent token — it is the boundary-owned classification of action wiring step 4, absorbed into [Failed]). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Fanout

The composition's single emergent action: given an `event_scope` and a `payload`, it queries `Subscription.subscribers_for` once and calls `Notification.create` once per returned subscriber, continuing through per-recipient failures rather than aborting. Returns the [Fanout Id] with the [Created] and [Failed] lists, or rejects [Subscribers Unavailable] (the store read failed) or `invalid-request` (bad input). Neither constituent atom carries this fan-out action.

Kind: Operation

#### Fanout Id

The opaque, invocation-unique correlation handle the composition generates for each fanout (Invariant 8). Present in every non-rejected result, including the empty-subscriber case; ephemeral unless Event Log is composed in, in which case it becomes the durable invocation identity. Not returned on rejection.

Kind:      Field
Field of:  the fanout result
Role:      the invocation correlation handle
Projects:  fanout_id

#### Created

The result list of `notification_id`s for the subscribers whose `Notification.create` succeeded in this fanout.

Kind:      Field
Field of:  the fanout result
Role:      the succeeded recipients
Projects:  created

#### Failed

The result list of `subscriber_ref`s whose `Notification.create` did not record — every failure mode (the constituent's declared `invalid-request`, or a boundary-classified unrecordable write) collapsed into one "delivery did not record" outcome. Together with [Created] it accounts for every subscriber in the query result (Invariant 1: `|created| + |failed| = |subscribers|`); it is the pressure valve that makes the reachable/unreachable split explicit rather than silent.

Kind:      Field
Field of:  the fanout result
Role:      the unreached recipients (retry-eligible)
Projects:  failed

#### Subscribers Unavailable

The composition's own rejection from [Fanout] — returned when the subscription-store read (`Subscription.subscribers_for`) fails with an infrastructure error. No notification records are created and no [Fanout Id] is returned; the invocation did not complete.

Kind:      Member
Member of: the fanout rejection
Role:      Rejection
Projects:  subscribers-unavailable

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Fanout]: #fanout
[Fanout Id]: #fanout-id
[Created]: #created
[Failed]: #failed
[Subscribers Unavailable]: #subscribers-unavailable

---

## Generation acceptance

A derived implementation of Notification Fanout is *acceptable* when an external auditor, given the subscription store and notification store, can do all of the following without recourse to source code, runbooks, or developer narration.

### Record-clearable checks

These checks can be answered by reading the composition's stored records (subscription store, notification store, and Event Log where composed in):

- **Confirm fanout coverage for any recorded fanout.** Event Log composition is required for reliable fanout-coverage audits. The recommended Event Log entry shape — one entry per [Fanout] invocation — is `{fanout_id, event_scope, payload_digest, created: [notification_id, ...], failed: [subscriber_ref, ...], fired_at}` — with `fired_at` stamped at the moment of the `subscribers_for` query, the instant the subscriber set was fixed, not at entry-write time. **The caller does not observe that instant and must not be asked to reproduce it**, so [Fanout] returns it: `fired_at` is an additive field on the action's result, carrying the seam-injected reading the composition took when it fixed the subscriber set (*Logic confinement*), and the caller writes back what the composition observed rather than a time it guessed. Any other arrangement makes this entry shape unimplementable from the declared contract — the caller can log only its own invocation time, which is the wrong instant for step (b)'s historical-state reconstruction and silently widens exactly the window Subscription Invariant 9's clock caveat bounds. Returning it is additive, so no existing caller breaks; a caller that ignores the field logs a weaker entry and the audit degrades to the caveat rather than to a false pin. [Fanout Id] is the durable invocation identity when Event Log is composed in; the caller passes the [Fanout Id] returned by the fanout action as the log entry's reference field, binding the invocation record to its complete subscriber list and created `notification_ids`. Given an Event Log entry of this shape, the auditor can: (a) read the entry's `event_scope` and `fired_at`; (b) reconstruct the Active subscriber set at `fired_at` using Subscription's historical-state filter (`subscribed_at ≤ fired_at` AND (`status = active` OR `cancelled_at > fired_at`)); (c) verify every reconstructed Active subscriber appears either in [Created] (each `notification_id` mapped via `Notification.status_of` to confirm the record exists with matching `recipient_ref`) or in [Failed]; (d) confirm `|created| + |failed|` equals the size of the reconstructed Active set, satisfying Invariant 1 from records — an equality exact only to within Subscription Invariant 9's best-effort clock caveat (the caveat this composition's own adversarial scenario carries): a subscribe or cancel whose stamp falls within clock tolerance of `fired_at` can move the reconstructed count by one, so the auditor resolves a boundary-adjacent mismatch against the deployment's clock tolerance before recording an Invariant 1 violation. Without a composed Event Log carrying these fields, fanout grouping by `created_at` clustering on the notification store is unreliable — concurrent creates across a measurable time span produce different timestamps, and concurrent unrelated fanouts on the same scope produce overlapping ones; [Fanout Id] alone is insufficient without the log because the composition does not persist it.
- **Confirm payload consistency.** All Notification records produced by a single fanout carry the same payload. Identifying the fanout group requires the same Event Log entry as check 1 — the `created: [notification_id, ...]` list keyed by [Fanout Id] is the authoritative grouping; without it, grouping by payload similarity is ambiguous when multiple concurrent fanouts share the same payload structure. Given the group, the auditor inspects the `payload` field of each record and confirms identity across all members.
- **Verify each Notification record independently.** Each record passes Notification's five Generation acceptance checks: full delivery history present, timeline reconstructable, terminal exclusivity confirmed, timestamp-status match confirmed, composing patterns identifiable.
- **Confirm no cross-notification coupling.** A terminal state on one notification record in the fanout group does not correlate with the terminal state on another. Each record's delivery outcome is independent.

### Externally-clearable checks

These questions arise around the composition but require deployment configuration or external evidence to answer:

- **Identify the composing patterns active in this deployment** — whether Event Log, Duplicate Prevention, Actor Identity, and Tamper Evidence are wired alongside the bare fanout mechanism, and with what configuration. The presence and configuration of these composing patterns is a deployment-level fact; the auditor must obtain this from the deployment configuration record or the operator, not from the subscription or notification stores alone.

---

## Standards references

- **Observer pattern** (GoF — the "Gang of Four", the four authors of *Design Patterns*, 1994) — Notification Fanout is the Subject's `notify()` method: iterate the observer list, deliver the update to each. The atoms formalize what the pattern assumes.
- **Publish-subscribe** (Birman & Joseph, 1987; AMQP (Advanced Message Queuing Protocol — the open messaging-middleware standard) topic exchanges; Apache Kafka consumer groups) — the event-scope-to-subscriber binding is a topic subscription; [Fanout] is message dispatch.
- **WebSub (W3C Recommendation)** — hub-based publish-subscribe; [Fanout] corresponds to the hub's distribution step after a publisher notifies the hub of a content update.
- **W3C Activity Streams 2.0** — notification payloads in web deployments often carry Activity Streams objects; the fanout composition is payload-agnostic.
- **Outbox pattern** (Chris Richardson, *Microservices Patterns*) — for reliable fanout, the notification records produced by [Fanout] are the outbox entries the delivery layer consumes. The composition produces the records; the delivery layer is out of scope.

It inherits from:

- **[Subscription](../atoms/subscription.md)** — standards inheritance in full: Observer pattern, pub-sub, WebSub.
- **[Notification](../atoms/notification.md)** — standards inheritance in full: Observer pattern, SMTP (Simple Mail Transfer Protocol — the standard email-delivery protocol), HTTP webhooks, W3C Activity Streams, APNs/FCM (Apple Push Notification service / Firebase Cloud Messaging — the iOS and Android push-delivery services).

---

## Status

`partially resolved` — see the Ledger.

## Ledger

```
status: partially resolved
formal: not applicable — vote no 2026-06-03: single-invocation structural coverage properties, no ordering or concurrency claim
last gate: 2026-08-27 — fresh reader — 6 foundational, 9 refining, 4 rhetorical

open:
- 2026-08-27-a · foundational · Action wiring step 4; Retry semantics; Terms [Failed]; Edge cases, caller disposition · [Failed] is defined as "no record exists" but the timeout arm can leave a committed record, so the prescribed direct retry duplicates it, breaking Invariant 4 → name an indeterminate class ("no record was observed"), make its retry conditional on Duplicate Prevention or a recipient-scan reconciliation, and weaken the no-record sentence
- 2026-08-27-b · foundational · Action wiring contract and steps 3–5; Examples; Edge cases, empty set; Terms; Generation acceptance check 1 · `fired_at` is in the contract and load-bearing for check 1, and no wiring step produces it, no example returns it, no clock provenance is declared, no Terms card owns it → take a seam-injected `fired_at` at step 3 before `subscribers_for`, declare its provenance, return it at steps 3 and 5, in every example, with a card
- 2026-08-27-c · foundational · Edge cases, fan-out at scale; Intent; Invariant 1; check 1 · authorizes cursor-pagination of `subscribers_for`, a surface Subscription does not expose, and paging destroys the single-instant subscriber set Invariant 1 and `fired_at` range over → remove pagination from the permitted strategies, or declare the dependency and restate Invariant 1 against snapshot-read semantics
- 2026-08-27-d · foundational · Action wiring step 4; Edge cases, structural inconsistencies; Primitive policies · `create`'s `invalid-request` is diagnosed only as a `subscriber_ref` mismatch, but Notification also raises it on oversized payload, which fanout's step 1 does not check → name both causes and the all-subscribers-failed signature, or move Notification's payload preconditions into step 1
- 2026-08-27-e · foundational · Invariant 8 · grounds id uniqueness on "the same floor each constituent atom declares"; Notification declares no entropy floor → state the floor as the composition's own requirement on its host id source
- 2026-08-27-f · foundational · Generation acceptance, record-clearable check 4; Invariant 3 · cannot be cleared from records (no decision procedure for independence) and tests delivery terminal states where Invariant 3 constrains create-time isolation, whose failing side is unobservable → replace with a records-decidable statement and move the isolation claim out of the record-clearable list
- 2026-08-27-g · refining · The load-bearing wiring decision, *Result* · "No subscriber is silently missed" is unconditional; the crash-mid-fanout state produces no result and nothing to log → carry the bound the Summary and Invariant 1 carry
- 2026-08-27-h · refining · Generation acceptance preamble; checks 1–2 · opens universally while checks 1 and 2 are unclearable without Event Log, which is not composed → frame conditionally
- 2026-08-27-i · refining · Generation acceptance, record-clearable check 3 and externally-clearable list · Notification's fifth check is classified both ways in one section → classify once
- 2026-08-27-j · refining · Generation acceptance check 1, Event Log entry shape · embeds the full `created` and `failed` lists, unbounded in N, against Event Log's payload cap → bound, chunk, or digest
- 2026-08-27-k · refining · Action wiring step 1; Terms preamble · `invalid-request` provenance stated two ways ("nothing is inherited" / "the one inherited rejection") → state once
- 2026-08-27-l · refining · Action wiring step 4; Edge cases · the two constituents' "non-empty" definitions diverge enumerably (whitespace-only, max length) and the spec routes the case to out-of-band diagnosis → name the two divergences
- 2026-08-27-m · refining · Action wiring; Edge cases, [Failed] bullet · retry disposition is deferred without naming *Retry semantics*; the cross-reference runs one way → add the reference
- 2026-08-27-n · refining · Invariant 6 · "all nine Notification invariants hold over each created record" — Notification's Invariants 7 and 9 are store-level → rephrase
- 2026-08-27-o · refining · Generation acceptance, externally-clearable check · names Tamper Evidence, which appears nowhere else in the spec → enumerate only what the reader can find, or introduce it
- 2026-08-27-p · rhetorical · Standards references · W3C unglossed twice while the other initialisms are spelled out → gloss
- 2026-08-27-q · rhetorical · The load-bearing wiring decision, *Likely objection*; Edge cases, [Failed] disposition · the all-or-nothing argument restated nearly verbatim, "pressure valve" included → say it once
- 2026-08-27-r · rhetorical · Retry semantics; Edge cases, retry targeting · the two-option retry guidance given twice → say it once
- 2026-08-27-s · rhetorical · Summary · forward-references "the duplicate-risk case the idempotency edge case names" → make the Summary self-standing
- 2026-08-26-a · refining · Standards references · "standards inheritance in full" omits Subscription's XMPP PubSub (XEP-0060) → add it
- 2026-08-26-b · refining · Summary · "idempotency" unglossed at Tier 1 → gloss
- 2026-08-26-c · refining · Action wiring step 2 · [Fanout Id]'s inline `entropy.generate()` diverges from the constituents' seam-injection discipline with no stated rationale → inject at the seam, or defend the divergence
- 2026-08-26-d · refining · Generation acceptance, externally-clearable list · omits Permissions and Audit Trail, both named in Edge cases → add them
- 2026-08-26-e · rhetorical · Summary · "fixed at the moment the event fires" against the normative query-execution instant → align with the wiring
- 2026-08-26-f · rhetorical · Examples, compliance walkthrough · glosses `expired` as "no delivery attempt", narrowing the constituent's window-lapse semantics → widen the gloss
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/notification-fanout.md`.
