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

### Logic confinement (clock and id)

The composition reads no clock and mints no id inside a transition. Both are **injected at its single I/O seam** per the Logic Confinement Principle ([`execution-contract.md`](../execution-contract.md)): the host supplies one `now` (`clock_t`) and one fresh id (`id_t`, under the entropy floor Invariant 8 declares) per [Fanout] invocation, before the orchestration runs, and the `fanout` signature carries neither. The clock reading serves exactly one purpose — it is stamped as [Fired At]: the seam instant at which the invocation began, returned so the caller can log the instant the composition observed rather than one it guessed. **It is a lower bound on the instant the subscriber set was fixed, not that instant.** The set is fixed when the Subscription store executes the read, which the composition never observes — `subscribers_for` takes and returns no timestamp — and validation, dispatch and read latency stand between the seam reading and that execution. The gap is bounded only by the deployment (Generation acceptance check 1's boundary rule); an earlier draft that called `fired_at` "the instant the subscriber set is fixed" was naming a moment nothing on this page can see. The id becomes the [Fanout Id]. Neither constituent returns a clock reading to a caller, and neither is asked to: `Subscription.subscribers_for` takes no timestamp, and Notification stamps `created_at` at its own seam, so the composition's `fired_at` and each record's `created_at` are two seams' readings and are never claimed equal.

### Action wiring

The composition exposes a single action:

**[Fanout]** — (Projected contract: `fanout(event_scope, payload) → {fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...], fired_at} | rejected(invalid-request | subscribers-unavailable)`)

1. Validate inputs: `event_scope` must be non-empty; `payload` must be non-null. If either condition fails, return `rejected(invalid-request)`. No id is generated; no subscriber query is made; no notification records are created. This validation is the composition's own boundary policy (Primitive policies), standing on its own authority — it is *consistent* with the constituents' postures (`Notification.create` rejects a null `payload`; Subscription's write surface rejects an empty `event_scope`), but nothing is inherited here: the composition never calls `subscribe`, so no constituent contract governs this check.
2. Take the [Fanout Id] — the opaque (system-generated with no meaningful content), invocation-unique identifier injected at the seam (*Logic confinement*), under the entropy floor Invariant 8 declares. This id is the correlation handle for this invocation. When Event Log is composed in, the caller uses [Fanout Id] as the log entry's reference, binding the invocation record to its subscriber list and created `notification_ids`. Without Event Log, [Fanout Id] is ephemeral — returned to the caller for transient correlation but not persisted by the composition.
3. Take [Fired At] — the seam-injected `now` the host supplied before the orchestration ran (*Logic confinement*), not a reading taken here — and call `Subscription.subscribers_for(event_scope)`. `fired_at` is what the caller's audit entry pins (Generation acceptance check 1) as a **lower bound** on the instant the store fixed the set.
   - If the subscription store is unavailable (infrastructure failure at the read step), return [Subscribers Unavailable]. No notification records are created. [Fanout Id] is not returned on rejection — the invocation did not complete.
   - If the result is an empty list, return `{fanout_id, created: [], failed: [], fired_at}`. The fanout is complete; no subscribers are currently Active for this scope.
4. For each `subscriber_ref` in the returned list, call `Notification.create(subscriber_ref, payload)`.
   - If `create` returns a `notification_id`, add it to the [Created] list.
   - If `create` returns `rejected(invalid-request)` — the constituent's only declared rejection — one of two things is true, and step 1 forecloses neither: the `subscriber_ref` Subscription returned is outside Notification's acceptance (Subscription admits whitespace-only refs and imposes no length cap; Notification rejects both), or the `payload` is outside it (Notification rejects a payload over the deployment's string cap, and fanout's step 1 checks only non-null). The discriminator is the failure's shape: every subscriber failing identically is the payload; one subscriber failing is the ref. Add `subscriber_ref` to [Failed]. Continue.
   - If `create` yields anything else — the write cannot be recorded because the notification store is unavailable, the call times out, or no conforming constituent outcome comes back at all — **the composition classifies that non-`notification_id` outcome at this boundary** as the subscriber's fanout failure, and the classification is **indeterminate**, not "no record": a timed-out or unacknowledged `create` may have committed a record whose id never came back, and Notification declares no infrastructure arm and no idempotency by which the composition could tell. Add `subscriber_ref` to [Failed] and continue to the next subscriber; do not abort the fan-out. This classification is composition-owned, not an inherited rejection token: Notification's `create` contract is `notification_id | rejected(invalid-request)` and declares no infrastructure-failure arm, so an unrecordable write has no constituent name — the boundary names it, exactly as it names the read-side counterpart [Subscribers Unavailable].
5. Return `{fanout_id, created: [notification_id, ...], failed: [subscriber_ref, ...], fired_at}`.

The order of `create` calls across subscribers is not guaranteed. Parallel execution is permitted provided the implementation guarantees each `Notification.create` call is independently committed — no shared transaction boundary across the N creates. The result's [Created] and [Failed] lists are unordered.

**The fan-out continues through failures.** A failed create — a boundary-classified unrecordable write, or the structural-inconsistency `invalid-request` — on one subscriber does not abort the fan-out for remaining subscribers. This follows directly from the composition boundary rule: parallel composition carries no rollback guarantee. A subscriber not in the [Created] list is one for whom **no delivery record was observed** — for the `invalid-request` arm that means none exists; for the indeterminate arm a record may exist with an id the composition never saw — and the composing system is responsible for inspecting the [Failed] list and deciding whether to retry (*Retry semantics*, which says how a retry stays at-most-once).

### Retry semantics

A caller who receives a non-empty [Failed] list and wishes to retry has two options. First: retry each `subscriber_ref` in the [Failed] list directly with `Notification.create(subscriber_ref, payload)`. **What that retry can and cannot guarantee is stated exactly, because an earlier draft claimed more.** A [Failed] entry may be indeterminate (action wiring step 4): a record may already exist that the composition never saw. **No reconciliation from the bare atoms can find it.** `Notification.pending_for` returns only the ids of records still in Notification's Pending state (Notification Invariant 7), so a record the delivery layer has already moved to Delivered, Failed or Expired is invisible to it; a payload is not a fanout identity — Notification permits any number of records with the same `(recipient_ref, payload)`, and concurrent fanouts may legitimately share a payload — so a Pending record with a matching payload is not evidence that *this* fanout created it; and Notification's `create` declares no idempotency key by which a retry could name the record it means. A guard composed around the *retry* alone (Duplicate Prevention keyed on `(fanout_id, subscriber_ref)`) sees nothing of the original create and admits the retry. So a retry of an indeterminate entry is **at-least-once**, and a second record for that subscriber is a residual the caller accepts and the delivery layer absorbs — Invariant 4 is scoped to the records the composition observed for exactly this reason. A deployment that needs at-most-once across an indeterminate create composes [Idempotent Reservation](./idempotent-reservation.md) over `Notification.create` where its store can honor an idempotency key, which is outside this composition's surface and named rather than promised. This option retries exactly the failed creates without re-querying the subscriber set. Second: call [Fanout] again — this re-queries `subscribers_for`, which may return a different subscriber set if subscriptions have changed in the interim. The first option is correct when the caller needs to deliver to exactly the original fanout's subscriber set; the second is correct when delivering to the current Active set is the right behavior. Callers who need at-most-once fanout semantics across retries should compose Duplicate Prevention to guard the [Fanout] call itself; see Edge cases.

All entries in the [Failed] list are treated as retry-eligible regardless of the underlying failure mode — the boundary-classified unrecordable write and the structurally-inconsistent `invalid-request` case (see action wiring step 4) are collapsed into a single "delivery did not record" outcome. A retry for a structurally-inconsistent `subscriber_ref` will fail again with the same rejection; persistent failure for a specific `subscriber_ref` across multiple retries indicates a structural inconsistency that the composing system must resolve out-of-band (the `subscriber_ref` is malformed, the notification store has rejected the payload shape, etc.). The composition does not surface the underlying reason — callers needing reason-level diagnostics compose Event Log to capture each `Notification.create` outcome at the call site.

---

## Composition-level invariants

Invariants 1–5 and 8 emerge from the composition — neither constituent atom carries them alone. Invariants 6 and 7 are preservation claims: they state that composing does not weaken either constituent's own invariant set.

- **Invariant 1 — Fanout coverage.** For any `fanout(event_scope, payload)` invocation that returns a result (not `rejected`), exactly one `Notification.create` call is attempted for each `subscriber_ref` returned by `Subscription.subscribers_for(event_scope)` at the time of the query. No subscriber is skipped; no subscriber outside the query result receives a create call. The [Created] and [Failed] lists together account for every subscriber in the query result: `|created| + |failed| = |subscribers_for result|`.
- **Invariant 2 — Payload consistency.** All Notification records created in a single [Fanout] invocation carry the same payload. A subscriber cannot receive a different payload than another subscriber from the same invocation.
- **Invariant 3 — No cross-notification coupling.** A failure to record a notification for subscriber A does not affect the notification record created for subscriber B. Each `Notification.create` call is independent; its success or failure is isolated to that record.
- **Invariant 4 — At-most-one notification per subscriber per fanout.** `Subscription.subscribers_for` returns at most one entry per `subscriber_ref` for a given scope (Subscription Invariant 6 — at most one Active subscription per (`subscriber_ref`, `event_scope`) pair). The composition calls `Notification.create` at most once per returned `subscriber_ref` per invocation. A single fanout produces at most one notification per subscriber **among the records the composition observed** — the invariant is scoped to observed records, because an indeterminate `create` (action wiring step 4) may have committed a record whose id never came back, and nothing in Notification's declared surface lets the composition or a retrying caller find it afterwards (*Retry semantics*). A retry of that entry can therefore produce a second record; that residual is the caller's to accept, or to close by composing Idempotent Reservation over the create where the store can honor a key. It is not a violation of this invariant, which never claimed to see the unseen.
- **Invariant 5 — Subscription store is read-only.** The composition never writes to the subscription store. `Subscription.subscribers_for` is the only call made against the Subscription atom. No subscription is created, modified, or cancelled by the fanout action.
- **Invariant 6 — Notification atom invariants preserved.** All nine Notification invariants hold over each created record. The composition does not bypass Notification's preconditions or write to the notification store directly.
- **Invariant 7 — Subscription atom invariants preserved.** All nine Subscription invariants hold. The composition reads the subscription store through Subscription's declared query surface (`subscribers_for`); it does not join the subscription table directly.
- **Invariant 8 — Fanout invocation uniqueness.** Each [Fanout] invocation that returns a result (not `rejected`) is assigned a unique [Fanout Id]. No two invocations share a [Fanout Id] across the lifetime of the system — a claim that carries a **declared entropy floor of the composition's own**: the host id source injected at the seam (*Logic confinement*) must supply at least 128 bits of entropy per id (or an equivalently coordinated unique generator). Subscription declares the same floor for its record ids; Notification declares none, so the requirement is stated here as this composition's dependency on its host, attributed to neither constituent. [Fanout Id] is generated before any constituent calls; it is present in every non-rejected result, including the empty-subscriber case. When Event Log is composed in, [Fanout Id] is the durable invocation identity. Without Event Log, [Fanout Id] is ephemeral — the caller receives it and may use it for transient correlation, but the composition does not persist it.

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
   - Returns `{fanout_id: fanout_f01, created: [notif_41, notif_42, notif_43], failed: [], fired_at: 2026-03-14T10:02:11Z}`.
3. **dev_b cancels before the next event.** `Subscription.cancel(sub_b1) → ok`.
4. **A second task is assigned.** `fanout("task:assigned", {task_id: t8, assigned_by: manager_m})`:
   - `fanout_id = fanout_f02` generated.
   - `subscribers_for → [dev_a, dev_c]` — dev_b is now Cancelled; not returned.
   - Returns `{fanout_id: fanout_f02, created: [notif_51, notif_52], failed: [], fired_at: 2026-03-14T10:02:12Z}`.
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
- Returns `{fanout_id: fanout_f03, created: [notif_61, notif_62], failed: [dev_b], fired_at: 2026-03-14T10:02:13Z}`.

The caller inspects the [Failed] list and retries `Notification.create(dev_b, payload) → notif_63` per *Retry semantics*, knowing what that buys: dev_b's entry was indeterminate, so if the failed write had in fact committed a record before the store went away, dev_b now holds two records from one fanout and the delivery layer sees both — the at-least-once residual the composition names rather than hides. `notif_63` enters Pending independently; dev_a's and dev_c's records are already in their own delivery lifecycles.

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
- **Empty Active subscriber set.** [Fanout] returns `{fanout_id, created: [], failed: [], fired_at}`. No Notification records are created. This is a valid, non-error outcome. The [Fanout Id] is still generated and returned — it is the invocation's correlation handle regardless of the subscriber count. The composing system may log this via Event Log if observability of empty fanouts is required.
- **Event scope hierarchy and wildcards.** `Subscription.subscribers_for` performs exact-match on the event scope. A subscriber with scope `task:*` does not receive notifications for `task:assigned` under the bare atoms. Scope hierarchy and pattern matching belong to a composing pattern that expands scope expressions before calling `subscribers_for`.
- **Delivery ordering.** Notification records are created in an unspecified order. The Notification atom does not guarantee delivery in creation order. If ordered delivery is required, the composing delivery layer sorts `Notification.pending_for` results by `created_at`.
- **Caller disposition on the [Failed] list: transient failures vs. structural inconsistencies.** The composition returns `{failed}` rather than aborting on first `Notification.create` failure by design — the mechanism cannot know whether a missed delivery matters; only the caller can. An all-or-nothing design would guarantee no subscriber receives a notification when the store is briefly unavailable, regardless of the event's stakes. The current design guarantees delivery to every reachable subscriber and surfaces the unreachable set for policy-level disposition. Delivery to the reachable majority is almost always worth more than guaranteed consistency with the unreachable minority; the [Failed] list is the pressure valve that makes the tradeoff explicit rather than silent.

  Two distinct failure conditions collapse into [Failed], and they carry different caller obligations. *Indeterminate failures* — no `notification_id` and no conforming constituent outcome came back (the boundary-owned classification of action wiring step 4) — are retry-eligible after reconciliation: the `subscriber_ref` is valid, the payload passed validation, the store was unavailable or the acknowledgement was lost, and a record may or may not exist. A retry (*Retry semantics*) will succeed when the store recovers — and may produce a second record for that subscriber if the first create had committed unseen, a residual no read of the bare atoms can close. *Structural inconsistencies* — `Notification.create` returned `rejected(invalid-request)` despite the `subscriber_ref` being non-empty and the payload passing fanout's own validation — have two causes, named at action wiring step 4: a `subscriber_ref` Subscription accepts and Notification does not (whitespace-only, or over Notification's length cap), or a `payload` over Notification's cap, which fanout's own validation does not size. An all-subscribers-failed result is the payload; a single failure is the ref. A retry will fail with the same rejection either way. Persistent failure for a specific `subscriber_ref` across multiple retries is the diagnostic signal; the first failure is ambiguous.

  The composition collapses both into [Failed] because it cannot classify the inconsistency without retrying and observing persistence — the caller, who knows the domain semantics of `subscriber_ref`, is better positioned to do that. Callers needing reason-level diagnostics at the first failure compose Event Log to capture each `Notification.create` outcome at the call site.

  Caller policy follows from the event's stakes. For low-stakes events — activity feeds, engagement notifications — inspecting the [Failed] count, logging it, and accepting the loss is the appropriate disposition: the fanout reached all structurally valid subscribers, and the gap is named, not hidden. For high-stakes events — regulated notifications such as policy updates, account actions, and legal notices — the [Failed] list is a delivery obligation: retry transient failures until the store recovers, and for persistent structural failures escalate to a secondary delivery channel (physical mail, phone, manual outreach) or record the gap in [Audit Trail](./audit-trail.md) as a named delivery failure with attribution and timestamp. In both cases the composition's behavior is identical; only the caller's policy differs. This is the boundary the composition enforces: mechanism here, policy in the composing system.

- **Retry targeting the original failed set.** A caller who retries [Fanout] re-queries `subscribers_for`, which may return a different set than the original invocation. Callers who need to retry exactly the failed `subscriber_refs` retry `Notification.create` for each ref in the [Failed] list rather than re-invoking [Fanout] — under the at-least-once residual *Retry semantics* states for an indeterminate entry.
- **Transport mechanism.** This composition creates Notification records; it does not dispatch them to recipients. The delivery layer — WebSocket push, webhook POST, email send — reads `Notification.pending_for` and calls `deliver`, `fail`, or `expire`. Transport is handled at the deployment layer, outside this composition.
- **Authorization to fanout.** The composition does not enforce who may call [Fanout]. Any caller may trigger a fanout for any event scope with any payload. Authorization belongs to the composing system — typically [Permissions](../atoms/permissions.md) gating the [Fanout] action against the caller, optionally with [Actor Identity](../atoms/actor-identity.md) attesting who triggered the invocation when attribution is required for audit.
- **Payload size and content.** Payload is opaque and passed to `Notification.create` unchanged. Size limits, schema validation, and content restrictions belong to the composing system before calling [Fanout].
- **Fan-out at scale.** N sequential or parallel `create` calls scale with the Active subscriber count. For scopes with thousands of Active subscribers, the implementation must handle throughput over the *returned list* — batching and parallel creates — and the spec does not constrain that strategy as long as Invariant 1 (fanout coverage) holds. What it does constrain is the read: the subscriber set is fixed by **one** `subscribers_for` call at [Fired At]. Subscription's contract is a single call with no cursor, page size or continuation, and a paged read would give the set k instants rather than one, leaving Invariant 1 nothing to range over and check 1 no instant to reconstruct at. A deployment whose subscriber sets are too large for one read composes a snapshot-read surface above Subscription; it does not page this one.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the single emergent action it exposes ([Fanout]) and the parts of the result that action returns — the [Fanout Id] correlation handle it takes from the seam, the [Fired At] instant at which it fixed the subscriber set, plus the [Created] and [Failed] lists that partition that set — and its own [Subscribers Unavailable] rejection. The composition keeps **no state of its own** (Composition state: none), so there is no record store to card. References to the constituent atoms and their operations — Subscription's `subscribers_for`, Notification's `create` / `status_of` — the relayed constituent tokens (`event_scope`, `subscriber_ref`, `notification_id`, `payload`), and the one inherited rejection (`invalid-request`) remain qualified/backticked, not carded here (the write-side infrastructure failure carries no constituent token — it is the boundary-owned classification of action wiring step 4, absorbed into [Failed]). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

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

#### Fired At

The seam-injected clock reading the host supplied when the invocation began — a lower bound on the instant `subscribers_for` fixed the subscriber set, which the composition never observes. Returned so the caller's Event Log entry can pin the instant the composition held; the caller never reproduces it. It is the composition's one clock use (*Logic confinement*) and is a different seam's reading from each record's `created_at`.

Kind:      Field
Field of:  the fanout result
Role:      the lower bound on the instant the subscriber set was fixed
Projects:  fired_at

#### Failed

The result list of `subscriber_ref`s for whom no delivery record was observed — the constituent's declared `invalid-request` (no record exists) and the boundary-classified indeterminate outcome (a record may exist with an id the composition never saw) collapsed into one "delivery not observed" outcome, which is why a retry reconciles first. Together with [Created] it accounts for every subscriber in the query result (Invariant 1: `|created| + |failed| = |subscribers|`); it is the pressure valve that makes the reachable/unreachable split explicit rather than silent.

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
[Fired At]: #fired-at
[Subscribers Unavailable]: #subscribers-unavailable

---

## Generation acceptance

A derived implementation of Notification Fanout is *acceptable* when an external auditor, given the subscription store and notification store, can do all of the following without recourse to source code, runbooks, or developer narration.

### Record-clearable checks

These checks can be answered by reading the composition's stored records (subscription store, notification store, and Event Log where composed in):

- **Confirm fanout coverage for any recorded fanout.** Event Log composition is required for reliable fanout-coverage audits. The recommended Event Log entry shape — one entry per [Fanout] invocation — is `{fanout_id, event_scope, payload_digest, created: [notification_id, ...], failed: [subscriber_ref, ...], fired_at}` — with `fired_at` the seam reading the invocation began under — a **lower bound** on the instant the store fixed the subscriber set, not that instant and not entry-write time (*Logic confinement*). **The caller does not observe that instant and must not be asked to reproduce it**, so [Fanout] returns it: `fired_at` is an additive field on the action's result, and the caller writes back what the composition held rather than a time it guessed. Any other arrangement makes this entry shape unimplementable from the declared contract — the caller can log only its own invocation time, which is the wrong instant for step (b)'s historical-state reconstruction and silently widens exactly the window Subscription Invariant 9's clock caveat bounds. Returning it is additive, so no existing caller breaks; a caller that ignores the field logs a weaker entry and the audit degrades to the caveat rather than to a false pin. [Fanout Id] is the durable invocation identity when Event Log is composed in; the caller passes the [Fanout Id] returned by the fanout action as the log entry's reference field, binding the invocation record to its complete subscriber list and created `notification_ids`. Given an Event Log entry of this shape, the auditor can: (a) read the entry's `event_scope` and `fired_at`; (b) reconstruct the Active subscriber set at `fired_at` using Subscription's historical-state filter (`subscribed_at ≤ fired_at` AND (`status = active` OR `cancelled_at > fired_at`)); (c) verify every reconstructed Active subscriber appears either in [Created] (each `notification_id` mapped via `Notification.status_of` to confirm the record exists with matching `recipient_ref`) or in [Failed]; (d) confirm `|created| + |failed|` equals the size of the reconstructed Active set, satisfying Invariant 1 from records — an equality exact only within a **boundary window**, and the window has two parts: Subscription Invariant 9's best-effort clock caveat (the caveat this composition's own adversarial scenario carries), and the read latency between the seam reading and the store's execution of the query, which `fired_at` lower-bounds and does not measure (*Logic confinement*). A subscribe or cancel stamped inside `[fired_at − clock_tolerance, fired_at + clock_tolerance + max_read_latency]` — `max_read_latency` the deployment's disclosed bound on how long a `subscribers_for` call may sit between dispatch and execution, listed under the externally-clearable checks — can move the reconstructed count by one, and the auditor resolves a mismatch inside that window as boundary-adjacent rather than recording an Invariant 1 violation; a mismatch outside it is the violation. Without a composed Event Log carrying these fields, fanout grouping by `created_at` clustering on the notification store is unreliable — concurrent creates across a measurable time span produce different timestamps, and concurrent unrelated fanouts on the same scope produce overlapping ones; [Fanout Id] alone is insufficient without the log because the composition does not persist it.
- **Confirm payload consistency.** All Notification records produced by a single fanout carry the same payload. Identifying the fanout group requires the same Event Log entry as check 1 — the `created: [notification_id, ...]` list keyed by [Fanout Id] is the authoritative grouping; without it, grouping by payload similarity is ambiguous when multiple concurrent fanouts share the same payload structure. Given the group, the auditor inspects the `payload` field of each record and confirms identity across all members.
- **Verify each Notification record independently.** Each record passes Notification's five Generation acceptance checks: full delivery history present, timeline reconstructable, terminal exclusivity confirmed, timestamp-status match confirmed, composing patterns identifiable.
- **Confirm each record is self-contained.** Every notification record in the fanout group carries its own `status` and its own terminal timestamp (`delivered_at` / `failed_at` / `expired_at`), no record references another, and no field is shared across the group other than the payload Invariant 2 requires equal. This is the records-decidable form of Invariant 3's *independent delivery record* property. Invariant 3's create-time clause — a failed create does not affect another subscriber's record — is **not** record-clearable: a create that did not record leaves nothing in the store to inspect, so it is discharged by the wiring (one independently committed `create` per subscriber, no shared transaction) and belongs to the externally-clearable list below.

### Externally-clearable checks

These questions arise around the composition but require deployment configuration or external evidence to answer:
- **The deployment's `max_read_latency` for `subscribers_for`.** Check 1's boundary window adds the deployment's bound on the time between dispatching the subscriber query and the store executing it to the clock tolerance; that bound is an operating fact of the deployment, not a record, and is disclosed alongside the clock tolerance so the window is computable.

- **Confirm create-time isolation** (Invariant 3's first clause) — that the implementation commits each `Notification.create` independently with no shared transaction boundary across the N creates. A failed create leaves no record, so this is answered from the implementation's transaction configuration or a fault-injection test, not from the stores.

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
last gate: 2026-08-28 — second gate after closure, fresh reader — 4 foundational (all since closed), 13 refining, 4 rhetorical

open:
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
- 2026-08-26-d · refining · Generation acceptance, externally-clearable list · omits Permissions and Audit Trail, both named in Edge cases → add them
- 2026-08-26-e · rhetorical · Summary · "fixed at the moment the event fires" against the normative query-execution instant → align with the wiring
- 2026-08-26-f · rhetorical · Examples, compliance walkthrough · glosses `expired` as "no delivery attempt", narrowing the constituent's window-lapse semantics → widen the gloss
- 2026-08-28-a · refining · step 1; Invalid-input example; Subscription-unavailable example; Logic confinement · three accounts of when the id exists ("no id is generated" / injected before the orchestration / "generated in step 2") → pin: id and `now` injected pre-validation, discarded on any rejection
- 2026-08-28-b · refining · step 4 discriminator · "every subscriber failing identically is the payload; one is the ref" is unobservable by the caller (no reason surfaced), degenerate at N=1, and indistinguishable from a store down for every create → state it as a caller heuristic with those caveats, or surface a per-entry reason
- 2026-08-28-c · refining · step 4 "the call times out" · no owner or bound for the timeout; a hung `create` hangs the fanout → require the deployment to bound each `create` and disclose the bound
- 2026-08-28-d · refining · Invariant 1 "exactly one `create` is attempted" · does not foreclose transport-level automatic retries inside the call → state that "attempted once" includes the transport layer
- 2026-08-28-e · refining · Edge cases, fanout idempotency · `fanout(event_scope, payload)` carries no event identity, so the Duplicate Prevention key must come from outside the signature → state that the key is a caller-supplied event identity
- 2026-08-28-f · refining · Retry semantics option 2 · re-invoking [Fanout] re-creates for every current subscriber including the [Created] set; the text reads as gap-filling → say it duplicates
- 2026-08-28-g · refining · Regulated scenarios, disputed notification · omits crash-mid-fanout and the structural `invalid-request` arm as causes → enumerate all three; note the crash case is a gap unless Duplicate Prevention/Event Log are composed
- 2026-08-28-h · refining · Terms preamble · calls `invalid-request` "the one inherited rejection" while step 1 says the fanout-boundary check inherits nothing; it is a pinned wire Member → card it, distinct from Notification's
- 2026-08-28-i · refining · Composition logic · the fanout→records relation has no declared cardinality/modality or state classification → declare one-to-many, subscriber side mandatory, record side optional under partial failure; classify
- 2026-08-28-j · refining · Standards references; Logic confinement; Summary · `W3C`, `HTTP`, `I/O` unglossed; "idempotency" without an inline gloss in the Summary → gloss at first use
- 2026-08-28-k · refining · step 3; Regulated audit; Fired At card · cite "Generation acceptance check 1" but the checks are unnumbered bullets → number the checks
- 2026-08-28-l · refining · Externally-clearable check 2 · lists Event Log, Duplicate Prevention, Actor Identity, Tamper Evidence; the spec also names Audit Trail and Permissions as composing patterns → include them or explain
- 2026-08-28-m · refining · result shape · [Created] holds ids and [Failed] holds refs, so pairing a `notification_id` with its subscriber costs N `status_of` calls check 1(c) silently requires → return `{subscriber_ref, notification_id}` pairs or state the cost
- 2026-08-28-n · rhetorical · Fanout Id card · "the correlation handle the composition generates" contradicts "mints no id" → "takes from the seam"
- 2026-08-28-o · rhetorical · Examples, compliance system · "the [Created] set accounts for all subscribers" — Invariant 1 is [Created] ∪ [Failed] → say so
- 2026-08-28-p · rhetorical · Logic confinement · `clock_t`, `id_t` unglossed on this page → gloss or cite
- 2026-08-28-q · rhetorical · Examples · the [Failed] result list and Notification's Failed state collide one paragraph apart → qualify on first use
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/notification-fanout.md`.

- **2026-08-28 — A retry of an indeterminate create is at-least-once, and the page says so.** *Chose:* withdraw the `pending_for` reconciliation and the retry-side Duplicate Prevention claim; scope Invariant 4 to observed records; name Idempotent Reservation over `Notification.create` as the deployment's route to at-most-once. *Over:* keeping a reconciliation that read Pending-only ids and matched on payload. *Because:* `pending_for` cannot see a record the delivery layer has moved on, a payload is not a fanout identity, and a guard first consulted at retry never saw the original create — the reconciliation promised what no read of the bare atoms can deliver.
- **2026-08-28 — `fired_at` is a lower bound on the instant the set was fixed.** *Chose:* the seam reading the invocation began under, with check 1's window widened by a disclosed `max_read_latency`. *Over:* a stamp "taken immediately before the query" described as the instant the set was fixed. *Because:* the store fixes the set when it executes the read, an instant the composition never observes; the earlier wording named a moment nothing on the page can see and let check 1 convict a subscribe that landed inside the read's latency.
