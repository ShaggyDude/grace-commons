---
title: Duplicate Prevention
parent: Temporal
grand_parent: Atomic Concepts
nav_order: 1
has_toc: true
toc: true
---

# Duplicate Prevention

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A composable temporal concept: a temporally-bounded record of recently-seen identities, used by containing patterns to reject re-additions within a configurable window.

> Also known as: temporal idempotency, recency guard, cooldown window.

---

## Intent

The pattern prevents an identity from being acted on (added, submitted, posted, charged) if the same identity has been recently observed. "Recently" is bounded by a configurable window that opens on observation and closes after a duration.

The concept addresses a class of integrity and UX problems that recur across virtually every system accepting user or external input: accidental double-submits, rapid double-add of the same task, replayed messages, repeated payments, double-posted comments, redundant newsletter sign-ups. The common shape is constant — an action accepts an identity, the outcome should be rejected (or de-duplicated, or replayed) if the same identity was recently observed, and "recently" is a wall-time window.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state, its own actions, and its own operational principles, and is designed to compose with patterns that contain identifiable items rather than to be absorbed into them. The same mechanic appears under different names across literatures — *idempotency window* in distributed systems, *cooldown* in UX, *replay protection* in security — but the underlying concept is identical.

---

## Summary

Duplicate Prevention is a composable temporal atom (a freestanding pattern spec — one that can be specified without naming any other pattern) that gives any containing system a configurable memory of recently-seen identities. Its contract is simple: when a containing pattern removes an item, it calls `record(identity)`; before it accepts a new item, it calls `check(identity)`. If the identity was recorded within the configured time window, `check` returns `seen` and the containing pattern can reject or otherwise handle the repeat; once the window has elapsed, `check` returns `not-seen` and the identity is again freely usable.

The atom is deliberately free of policy: it does not decide what to do with a `seen` result — that is the containing pattern's responsibility. This separation makes the same mechanic reusable across wildly different contexts. In a personal task list, a 24-hour window prevents accidental re-adds of just-deleted items. In a payment processor, a 5-minute window makes charge requests idempotent (submitting the same operation twice produces the same result as once) so that network retries do not produce duplicate charges. In a comment system, a 60-second window prevents a double-click from posting twice. In a newsletter signup form, an hour-long window suppresses duplicate confirmation emails. The identity-matching rule — whether comparison is exact, case-insensitive, normalized, or hashed — is also delegated to the containing pattern, so the atom imposes no opinion on how identities are canonicalized.

The atom's single-recording invariant (a condition that must always hold) is the key design decision: calling `record` on an identity that is already under guard does not extend the window. This prevents a rapid sequence of deletions and re-additions from pushing the guard window forward indefinitely. The window is anchored to the first observation and expires cleanly at a fixed point in wall-time (clock time as a human would read it, not an internal counter). Grounded (passed all required review passes and is stable enough to generate from) after one full three-pass review and one refinement round.

---

## Structure

### Inputs

- An identity value to track.
- A window duration, supplied by the containing pattern.
- An identity-matching rule, supplied by the containing pattern (string equality, case-insensitive, normalized, hashed).
- Action: `record(identity) → ok` — invoked when an item with this identity has been observed and removed. The action is total: it never rejects.
- Action: `check(identity) → seen | not-seen` — invoked before the containing system accepts a new identity.
- An implicit clock providing wall-time (clock time as a human would read it, not an internal counter).

### Outputs

- For any `check(identity)` query: `seen` (in `recorded` and within the window) or `not-seen` (otherwise).
- Implicit: the `recorded` set, queryable for diagnostic purposes only.

### State

A guarded set of identities, each with the timestamp at which it was recorded:

- **`recorded`** — the set of identities currently under guard, each with its `recorded_at` timestamp.

Identities enter `recorded` via `record(identity)`. They expire and leave automatically once the window has elapsed since `recorded_at`.

### Flow

The concept has no user-driven flow of its own; it is invoked by a containing pattern.

1. **Containing pattern removes an item.** It calls `record(identity)`. If the identity is not already in `recorded`, it enters with `recorded_at = now`. If the identity is already in `recorded`, the original `recorded_at` is preserved (single-recording invariant).
2. **Time passes.** While `now − recorded_at < window`, the identity remains under guard.
3. **Containing pattern receives a new add request.** Before accepting, it calls `check(identity)`. The concept returns `seen` if the identity is in `recorded` and within the window; otherwise `not-seen`.
4. **Window elapses.** The identity is removed from `recorded`. Subsequent `check(identity)` calls return `not-seen`.

### Decision points

- **At `record(identity)`** — no precondition. If the identity is already in `recorded`, the original `recorded_at` is preserved; the call has no effect on the window. This prevents accidental window extension by repeated record calls.
- **At `check(identity)`** — no precondition. The result depends only on whether the identity is currently in `recorded` and within the window.

### Behavior

How the concept appears to compose with containing patterns:

- The containing pattern decides what to do with `seen` vs `not-seen`. Typical responses: reject the action, prompt the user for confirmation, attach a warning, return a previously-cached result. The concept itself does not act on the result.
- Window duration is a policy choice of the containing pattern. Personal Todo uses 24 hours. Comment double-post protection uses ~60 seconds. Payment idempotency uses minutes. Newsletter double-subscribe uses hours.
- Identity-matching rule is also a policy choice. String equality is the default. Case-insensitive, trimmed, normalized, or hashed variants are common.

### Feedback

- After `record(identity)` — `identity` is in `recorded` with `recorded_at` (or unchanged if already present).
- After `check(identity)` — the result reflects the current state of `recorded` at the time of the call. The call does not modify state.
- After window elapses — `identity` is no longer in `recorded`; subsequent checks return `not-seen`.

The `recorded` set is queryable for diagnostic purposes (debugging, observability) but is not typically exposed to users — it is an internal mechanism, not a user-facing concept.

### Invariants

- **Invariant 1 — Window monotonicity.** For any identity in `recorded`, `now − recorded_at < window`.
- **Invariant 2 — Single-recording.** `record(identity)` does not extend the window for an already-recorded identity. The original `recorded_at` is preserved.
- **Invariant 3 — Idempotency of check.** `check(identity)` does not modify state; repeated calls return the same result for the same `now`.
- **Invariant 4 — Eventual expiry.** For any identity, after `window` time has elapsed since `recorded_at`, the identity is no longer in `recorded`.

---

## Examples

### Personal Todo (24-hour window)

A user deletes *"buy milk."* Personal Todo calls `record("buy milk")`. Two hours later, the user attempts to add *"buy milk"* again. Personal Todo calls `check("buy milk")`, receives `seen`, rejects the add as `duplicate-recent`. Twenty-five hours after the original delete, the user tries again. Personal Todo calls `check("buy milk")`, receives `not-seen`, accepts the add.

### Comment double-post protection (60-second window)

A user submits a comment, the page hangs, they click submit again. The comment system calls `record(normalized-comment-text)` after the first submission completes. The second click triggers `check(...)`, receives `seen`, rejects the second post. The first comment goes through; the second does not.

### Payment idempotency (5-minute window)

A payment processor receives a charge request with an idempotency key. It calls `check(key)`, receives `not-seen`, processes the charge, calls `record(key)` with the response cached against it. A retry within five minutes triggers `check(key)`, receives `seen`, returns the previously-cached result without re-processing.

### Newsletter double-subscribe (1-hour window)

A user submits the same email address to a newsletter form twice in quick succession (browser back button, double-click on submit). The first submission processes. Subsequent submissions within the hour trigger `seen` and are silently absorbed-as-already-subscribed rather than producing duplicate confirmation emails.

The mechanic is identical across all four. What differs: the window duration, the identity-matching rule, and the containing pattern's response on `seen` (reject, return-cached, silently-absorb).

---

## Edge cases and explicit non-goals

What this pattern does not cover:

- **The decision of what to do with `seen` / `not-seen`.** The concept reports; the containing pattern decides. This is by design — the same mechanic supports rejection (Personal Todo), de-duplication (newsletter), and replay (payment idempotency).
- **Persistence across restarts.** Whether `recorded` is durable across process restarts is a deployment decision, not a property of the concept. Volatile in-memory implementations are valid; durable persisted implementations are valid.
- **Distributed coordination.** If multiple instances of the concept exist (one per server in a cluster), keeping them consistent is the job of a separate Coordination or Replication pattern.
- **Long-term retention for analytics or audit.** The concept retains identities only for the window. Long-term audit belongs to a History or Audit pattern.
- **Identity normalization.** The matching rule is supplied by the containing pattern. The concept does not opine on how identities are compared.
- **Window extension on repeated record (sliding-window semantics).** The single-recording invariant explicitly forbids this. Patterns that need a window that resets on every observation are a separate concept (Sliding Window).
- **Calendar-day boundaries.** "Same day" semantics are not the same as "within 24 hours" — they are timezone-and-DST-sensitive. A separate Calendar Day pattern handles day-boundary semantics; this concept is wall-time based.
- **`record` storage failures are silent window misses.** `record` is total — it never rejects — because the containing pattern has already acted when it calls `record` (it has already removed the item; there is nothing to roll back). If the underlying store write fails, the identity is not added to `recorded`, and subsequent `check` calls will return `not-seen` during the period when they should return `seen`. This is a window miss — a liveness concern (duplicates may be accepted within the window) rather than a safety violation. Deployments where duplicate prevention is safety-critical should ensure the `recorded` store is durable and highly available.
- **`check` store unavailability.** If the underlying store for `recorded` is unavailable at `check` time, the implementation must choose between two policies: fail-open (proceed as `not-seen`, allowing the action at the risk of accepting a duplicate) or fail-closed (proceed as `seen`, blocking the action at the risk of false rejection). The atom does not mandate a policy — the choice is deployment configuration. Fail-open is appropriate when the cost of a missed duplicate is low; fail-closed is appropriate when duplicate prevention is safety-critical.
- **Lazy expiry and Invariant 1.** Invariant 1 states that for any identity in `recorded`, the window has not elapsed. This holds for eager-expiry implementations (which remove expired entries from `recorded` on a background schedule or on write). Lazy-expiry implementations — which check and remove expired entries only at `check` time — may retain expired entries in the `recorded` set. Invariant 1 technically does not hold over the internal state of lazy-expiry implementations, but Invariant 4 (eventual expiry) does hold, and the behavioral contract is preserved: `check` evaluates the window condition at call time and returns `not-seen` for expired entries regardless of whether they have been physically removed from `recorded`.

Where the pattern breaks down: when "recent" is defined by something other than wall-time elapsed. Number-of-intervening-events, calendar-day-boundary, and business-day-boundary semantics each take a separate concept.

---

## Standards references

Duplicate Prevention is a primitive integrity concept. It has no direct ISO / IEEE / regulatory anchor in this generic form, though specific instantiations have widely-used standards behind them:

- **HTTP idempotency keys** (IETF draft and de-facto convention for safe retry of state-changing requests).
- **Stripe / payment-processor idempotency** (industry-standard pattern for at-most-once charge semantics within a window).
- **Message-queue exactly-once-within-window semantics** (Kafka, SQS, Pub/Sub deduplication).

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the conception of a freestanding concept with state, actions, and operational principles, designed for composition rather than absorption.
- **Distributed-systems idempotency literature** — the underlying mechanic appears as "idempotency window" or "exactly-once-within-window semantics" in message-queue and payment-processor designs.
- **Linear temporal logic** (a formal notation for reasoning about sequences of states over time) — the eventual-expiry invariant expressed as a temporal property.

---

## Status

`grounded — last full rescan: 2026-05-13` — concept is freestanding, composable, and carries a verifiable invariant set. Examples cover four distinct domains. Ready for composition with Personal Todo and other patterns.

---

## Composition notes

Patterns compose with Duplicate Prevention through a uniform contract:

1. On every successful *remove* action (delete, abandon, expire), call `record(identity)`.
2. On every *add* action, call `check(identity)` before accepting; if `seen`, respond per the containing pattern's policy (reject, de-duplicate, return cached).

Window and identity-matching rule are configured per containing pattern, not globally. A single deployment may run multiple instances of Duplicate Prevention with different configurations — one per containing pattern.

Current and forthcoming compositions:

- [Personal Todo](../productivity/personal-todo.md) — 24-hour window, string-equality matching.
- [Idempotent Reservation](../../compositions/idempotent-reservation.md) — minutes-to-hours window, opaque-token matching. The general-purpose retry-safety wrapper around Provisional Commitment; subsumes the payment-processing idempotency pattern (Stripe Idempotency-Key, ISO 20022 BizMsgIdr, etc.).
- Shared Todo *(forthcoming)* — same shape, possibly with longer windows for high-stakes domains.
- Comment Posting *(forthcoming)* — short window with normalized-text matching.
- Form Submission *(forthcoming)* — short window with idempotency-key matching.

---

## Lineage notes

This pattern survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)) on its first revision. Findings were modest.

**Pass 1 — Structural completeness (GRID).** Clean. All nine nodes are addressed; Friction is captured in Edge cases per the standard atom template.

**Pass 2 — Conceptual independence (EOS).** Clean. The concept is intrinsically primitive — recording recently-seen identities with a window — and does not absorb any concern that recurs as its own atomic concept. The window itself is not extracted as a separate atom because windows of this shape are inherent to recency-bounded memory; pulling them apart would split too thin.

**Pass 3 — Adversarial scrutiny (Linus mode).** Three findings, one fixed in-pattern, the other two already adequately addressed:

- *`record` return value unspecified.* Fixed: action signature now reads `record(identity) → ok` to make the contract explicit. The action is total — it never rejects — and the return marks success.
- *Clock semantics not addressed.* Already implicit under "wall-time" framing throughout; the underlying mechanism assumes a non-adversarial clock. Composing patterns that need monotonic guarantees should compose with a Logical Clock pattern (forthcoming) rather than expect this concept to provide it.
- *Concurrent calls between `record` and `check` from different callers.* Already named under distributed coordination as out-of-scope. Serialization is the implementation's responsibility; the spec assumes serialized access within one instance.

The pattern is `grounded — last full rescan: 2026-05-13` after one round.

**Refinement round 1.** Three findings, all closed as Edge cases. Conventions inherited from the methodology directly.

- *`record` storage failure implication not documented.* `record` is deliberately total — the containing pattern has already acted when it calls `record`, so a `storage-failure` rejection would arrive with nothing to roll back. The consequence is a silent window miss: the guard will not fire for that identity during the window it should cover, a liveness concern rather than a safety violation. Resolved: new Edge case — *`record` storage failures are silent window misses* — added, with guidance that safety-critical deployments should ensure the `recorded` store is durable and highly available.
- *`check` store unavailability has no documented behavior.* If the `recorded` store is unavailable at `check` time, the implementation must choose between fail-open (`not-seen`, risk accepting a duplicate) and fail-closed (`seen`, risk false rejection). The atom doesn't mandate a policy. Resolved: new Edge case — *`check` store unavailability* — added, naming the fail-open/fail-closed choice and framing it as deployment configuration.
- *Invariant 1 and lazy-expiry not reconciled.* Invariant 1 states "For any identity in `recorded`, the window has not elapsed" — this holds for eager-expiry implementations but not for lazy-expiry implementations, which retain expired entries in `recorded` until the next `check` call. The behavioral contract is preserved (check evaluates the window condition at call time), but the tension with Invariant 1 was undocumented. Resolved: new Edge case — *Lazy expiry and Invariant 1* — added, clarifying that both implementation models are valid, that Invariant 4 (eventual expiry) holds for both, and that `check` must evaluate the window condition at call time regardless of physical expiry status.
