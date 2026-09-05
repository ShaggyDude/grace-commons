---
title: Duplicate Prevention
parent: Atomic Concepts
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


## Summary

Duplicate Prevention gives a system a short-term memory of things it has recently seen, so it can spot repeats. The way it works is simple. When something happens (an item is removed, a request is processed), the system records that identity; before accepting a new one, it checks whether that identity was recorded within a set time window. If it was, the check reports "seen" and the system can decide what to do — reject the repeat, ignore it, or return the earlier result. Once the window has passed, the same identity is fresh again. The pattern itself stays out of that decision and out of how identities are compared — those belong to the system using it — which is why the same mechanism works for a to-do list (a one-day window blocks accidental re-adds), a payment system (a few-minute window stops a retried charge from billing twice), a comment box (a one-minute window stops double-click double-posts), and a signup form. One firm guarantee: recording the same identity again does not push the window forward, so a flurry of repeats cannot extend the block indefinitely — the clock starts at the first sighting and runs out at a fixed time.

*Also known as: temporal idempotency, recency guard, cooldown window.*

---

## Intent

The pattern prevents an [Identity] from being acted on (added, submitted, posted, charged) if the same [Identity] has been recently observed. "Recently" is bounded by a configurable [Window] that opens on observation and closes after a duration.

The concept addresses a class of integrity and user-experience problems that recur across virtually every system accepting user or external input: accidental double-submits, rapid double-add of the same task, replayed messages, repeated payments, double-posted comments, redundant newsletter sign-ups. The common shape is constant — an action accepts an [Identity], the outcome should be rejected (or de-duplicated, or replayed) if the same [Identity] was recently observed, and "recently" is a wall-time [Window].

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state, its own actions, and its own operational principles, and is designed to compose with patterns that contain identifiable items rather than to be absorbed into them. The same mechanic appears under different names across literatures — *idempotency window* in distributed systems, *cooldown* in user-experience, *replay protection* in security — but the underlying concept is identical.

---

## Structure

### Inputs

- An [Identity] value to track.
- A [Window Duration], supplied by the containing pattern (the datum that sizes a [Window]).
- An identity-matching rule, supplied by the containing pattern (string equality, case-insensitive, normalized, hashed).
- [Record] — invoked when an item with this [Identity] has been observed and removed. The behavior is total: it never rejects. (Projected contract: `record(identity) → ok`.)
- [Check] — invoked before the containing system accepts a new [Identity]. (Projected contract: `check(identity) → seen | not-seen`.)
- A clock providing wall-time (clock time as a human would read it, not an internal counter), injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock at the seam before the transition runs. The pure transition receives [Now] as an explicit input and never reads a wall clock internally. [Now] is not supplied by the business caller, which keeps the transition deterministic.

### Outputs

- For any [Check] query: [Seen] (in the [Recorded Set] and within the [Window]) or [Not Seen] (otherwise).
- Implicit: the [Recorded Set], queryable for diagnostic purposes only.

### State

The [Recorded Set] — a guarded set of identities, each with the timestamp at which it was recorded:

- **[Recorded Set]** — the identities currently under guard, each with its [Recorded At] timestamp. ([Recorded At] is the per-entry timestamp the guard window is measured from; the set itself and that timestamp are the atom's only stored state.)

Identities enter the [Recorded Set] via [Record]. They expire and leave automatically once the [Window] has elapsed since [Recorded At].

### Flow

The concept has no user-driven flow of its own; it is invoked by a containing pattern.

1. **Containing pattern removes an item.** It calls [Record]. If the [Identity] is not currently under guard (not in the [Recorded Set], or in it but expired), it enters with [Recorded At] stamped from the injected [Now]. If the [Identity] is currently under guard (in the [Recorded Set] and within the [Window]), the original [Recorded At] is preserved (single-recording invariant).
2. **Time passes.** While the injected [Now] evaluated at [Check] time satisfies [Now] − [Recorded At] < [Window Duration], the [Identity] remains under guard.
3. **Containing pattern receives a new add request.** Before accepting, it calls [Check]. The concept returns [Seen] if the [Identity] is in the [Recorded Set] and within the [Window]; otherwise [Not Seen].
4. **[Window] elapses.** The [Identity] is removed from the [Recorded Set]. Subsequent [Check] calls return [Not Seen].

### Decision points

Both calls are total — no precondition, never rejected. The outcome turns on one question: is the [Identity] currently under guard (in the [Recorded Set] and within its [Window])?

| Call | [Identity] under guard? | Result | Effect on state |
|------|-------------------------|--------|-----------------|
| [Record] | no — never recorded, or [Window] elapsed | `ok` | enters the [Recorded Set]; [Recorded At] ← injected [Now] |
| [Record] | yes | `ok` | unchanged — original [Recorded At] preserved (Invariant 2) |
| [Check] | yes | [Seen] | none — read-only (Invariant 3) |
| [Check] | no | [Not Seen] | none — read-only (Invariant 3) |

Preserving the original [Recorded At] on an already-guarded [Identity] is what stops repeated [Record] calls from extending the [Window] (Invariant 2). Infrastructure failures sit outside this matrix and are handled in Edge cases: a [Record] write-failure is a silent [Window] miss, and [Check] store-unavailability is a deployment fail-open / fail-closed choice.

### Behavior

How the concept appears to compose with containing patterns:

- The containing pattern decides what to do with [Seen] vs [Not Seen]. Typical responses: reject the action, prompt the user for confirmation, attach a warning, return a previously-cached result. The concept itself does not act on the result.
- The [Window Duration] is a policy choice of the containing pattern. Personal Todo uses 24 hours. Comment double-post protection uses ~60 seconds. Payment idempotency uses minutes. Newsletter double-subscribe uses hours.
- The identity-matching rule is also a policy choice. String equality is the default. Case-insensitive, trimmed, normalized, or hashed variants are common.
- Infrastructure write-failure on [Record] is deliberately NOT surfaced as a rejection. The containing pattern has already acted when it calls [Record] (it has already removed the item; there is nothing to roll back). The consequence is a bounded liveness miss — the guard will not fire for that [Identity] during the [Window] it should have covered — rather than a safety violation. See *[Record] storage failures are silent window misses* in Edge cases.

### Feedback

- After [Record] — the [Identity] is in the [Recorded Set] with [Recorded At] (or unchanged if already present).
- After [Check] — the result reflects the current state of the [Recorded Set] at the time of the call. The call does not modify state.
- After the [Window] elapses — the [Identity] is no longer in the [Recorded Set]; subsequent checks return [Not Seen].

The [Recorded Set] is queryable for diagnostic purposes (debugging, observability) but is not typically exposed to users — it is an internal mechanism, not a user-facing concept.

### Invariants

- **Invariant 1 — Window monotonicity.** For any [Identity] in the [Recorded Set], [Now] − [Recorded At] < [Window Duration].
- **Invariant 2 — Single-recording.** [Record] does not extend the [Window] for an [Identity] currently under guard (recorded and within window). The original [Recorded At] is preserved. An expired-but-not-yet-purged [Identity] is not under guard; a [Record] call on such an [Identity] starts a fresh guard rather than extending the old one.
- **Invariant 3 — Idempotency of check.** [Check] does not modify state; repeated calls return the same result for the same [Now].
- **Invariant 4 — Eventual expiry.** For any [Identity], after [Window Duration] time has elapsed since [Recorded At], the [Identity] is no longer in the [Recorded Set].

---

## Examples

### Personal Todo (24-hour window)

A user deletes *"buy milk."* Personal Todo calls [Record] with `"buy milk"`. Two hours later, the user attempts to add *"buy milk"* again. Personal Todo calls [Check] with `"buy milk"`, receives [Seen], rejects the add as `duplicate-recent`. Twenty-five hours after the original delete, the user tries again. Personal Todo calls [Check] with `"buy milk"`, receives [Not Seen], accepts the add.

(`duplicate-recent` is shown verbatim by design: it is Personal Todo's pinned rejection string — a Member of *that* pattern's outcome, its wire form frozen because callers switch on the exact string. It is not this atom's Term; when Personal Todo carries a Terms registry it becomes a cross-page reference to that pattern's card. Per [`annotation.md`](../working-ideas/annotation.md), a pinned wire literal shown to display its exact form stays backticked — "literal" is a pinned projection, not a kind.)

### Comment double-post protection (60-second window)

A user submits a comment, the page hangs, they click submit again. The comment system calls [Record] with the normalized comment text after the first submission completes. The second click triggers [Check], receives [Seen], rejects the second post. The first comment goes through; the second does not.

### Payment idempotency (5-minute window)

A payment processor receives a charge request with an idempotency key. It calls [Check] with the key, receives [Not Seen], processes the charge, calls [Record] with the key and the response cached against it. A retry within five minutes triggers [Check] with the key, receives [Seen], returns the previously-cached result without re-processing.

### Newsletter double-subscribe (1-hour window)

A user submits the same email address to a newsletter form twice in quick succession (browser back button, double-click on submit). The first submission processes. Subsequent submissions within the hour trigger [Seen] and are silently absorbed-as-already-subscribed rather than producing duplicate confirmation emails.

The mechanic is identical across all four. What differs: the [Window Duration], the identity-matching rule, and the containing pattern's response on [Seen] (reject, return-cached, silently-absorb).

---

## Edge cases and explicit non-goals

What this pattern does not cover:

- **The decision of what to do with [Seen] / [Not Seen].** The concept reports; the containing pattern decides. This is by design — the same mechanic supports rejection (Personal Todo), de-duplication (newsletter), and replay (payment idempotency).
- **Persistence across restarts.** Whether the [Recorded Set] is durable across process restarts is a deployment decision, not a property of the concept. Volatile in-memory implementations are valid; durable persisted implementations are valid.
- **Distributed coordination.** If multiple instances of the concept exist (one per server in a cluster), keeping them consistent is the job of a separate Coordination or Replication pattern.
- **Long-term retention for analytics or audit.** The concept retains identities only for the [Window]. Long-term audit belongs to a History or Audit pattern.
- **Identity normalization.** The matching rule is supplied by the containing pattern. The concept does not opine on how identities are compared.
- **[Window] extension on repeated record (sliding-window semantics).** The single-recording invariant explicitly forbids this. Patterns that need a [Window] that resets on every observation are a separate concept (Sliding Window).
- **Calendar-day boundaries.** "Same day" semantics are not the same as "within 24 hours" — they are timezone-and-DST-sensitive. A separate Calendar Day pattern handles day-boundary semantics; this concept is wall-time based.
- **[Record] storage failures are silent window misses.** [Record] is total — it never rejects — because the containing pattern has already acted when it calls [Record] (it has already removed the item; there is nothing to roll back). If the underlying store write fails, the [Identity] is not added to the [Recorded Set], and subsequent [Check] calls will return [Not Seen] during the period when they should return [Seen]. This is a [Window] miss on the liveness side (duplicates may be accepted within the [Window]), not a safety violation. Deployments where duplicate prevention is safety-critical should ensure the [Recorded Set] store is durable and highly available.
- **[Check] store unavailability.** If the underlying store for the [Recorded Set] is unavailable at [Check] time, the implementation must choose between two policies: fail-open (proceed as [Not Seen], allowing the action at the risk of accepting a duplicate) or fail-closed (proceed as [Seen], blocking the action at the risk of false rejection). The atom does not mandate a policy — the choice is deployment configuration. Fail-open is appropriate when the cost of a missed duplicate is low; fail-closed is appropriate when duplicate prevention is safety-critical.
- **Clock semantics.** The [Recorded At] timestamp is stamped from the injected [Now] (the host reads the clock at the seam and supplies it as an explicit input before the transition runs; see Inputs). The [Window] expiry comparison is evaluated against the injected [Now] at [Check] time. Clock skew, monotonicity, and timezone handling are handled at the deployment layer; the atom does not address them beyond this access-at-seam commitment. The [Window] is anchored to the wall-time of the first [Record] call; a backward clock jump can make an [Identity] appear expired before the configured [Window Duration] has truly elapsed, or delay expiry if the clock jumps forward. Containing patterns that require strict monotonic [Window] enforcement should compose with a Logical Clock pattern rather than relying solely on this atom's wall-time mechanic.
- **Lazy expiry and Invariant 1.** Invariant 1 states that for any [Identity] in the [Recorded Set], the [Window] has not elapsed. This holds for eager-expiry implementations (which remove expired entries from the [Recorded Set] on a background schedule or on write). Lazy-expiry implementations — which check and remove expired entries only at [Check] time — may retain expired entries in the [Recorded Set]. Invariant 1 technically does not hold over the internal state of lazy-expiry implementations, but Invariant 4 (eventual expiry) does hold, and the behavioral contract is preserved: [Check] evaluates the [Window] condition at call time and returns [Not Seen] for expired entries regardless of whether they have been physically removed from the [Recorded Set].

Where the pattern breaks down: when "recent" is defined by something other than wall-time elapsed. Number-of-intervening-events, calendar-day-boundary, and business-day-boundary semantics each take a separate concept.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — answers *what does it carry?*) or **Parameter** (a value an Operation needs — answers *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned Member, plus the [Recorded Set]'s state-field name. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written — so the prose carries the meaning, the card carries the canonical name, and the adapter carries the lowering. *(This Terms registry is the [`annotation.md`](../working-ideas/annotation.md) direction's pilot; it is representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Identity

The value a containing pattern asks Duplicate Prevention to remember and recognize — what counts as "the same thing seen again." The concept treats it as opaque: it stores and compares the value but never interprets it, and how two identities are judged equal is the containing pattern's matching rule, not this atom's.

Kind: Type

#### Window

The bounded interval of time during which a recently-recorded [Identity] is still guarded. It opens when the [Identity] is first recorded and closes after a [Window Duration] the containing pattern sets; once it has elapsed, the same [Identity] is fresh again. (The interval is the concept; the duration value that sizes it is a separate [Window Duration] supplied per containing pattern.)

Kind: Type

#### Recorded Set

The atom's short-term memory: the collection of identities currently under guard, each held together with the time it was recorded. An [Identity] enters on [Record] and leaves automatically once its [Window] has elapsed. It is an internal mechanism, queryable for diagnostics, not a user-facing surface.

Kind:     Type
Projects: recorded

#### Record

The behavior a containing pattern invokes when it has just observed an [Identity] (for example, after removing an item) so that future repeats can be recognized. It places the [Identity] under guard, opening a [Window]. It always succeeds — it never refuses — and recording an [Identity] that is already under guard does not push its [Window] forward.

Kind: Operation

#### Check

The behavior a containing pattern invokes before accepting a new [Identity], to ask whether that [Identity] is currently under guard. It only reads — it changes nothing — and reports its answer as [Seen] or [Not Seen]. What to do with the answer is the containing pattern's decision.

Kind: Operation

#### Seen

The answer [Check] gives when the [Identity] is currently under guard — recorded, and still within its [Window]. It signals "this was observed recently"; the containing pattern decides whether that means reject, de-duplicate, or return an earlier result.

Kind:      Member
Member of: the Check outcome
Role:      Outcome
Projects:  seen

#### Not Seen

The answer [Check] gives when the [Identity] is not currently under guard — either never recorded, or its [Window] has elapsed. It signals "this is fresh"; the containing pattern is clear to proceed.

Kind:      Member
Member of: the Check outcome
Role:      Outcome
Projects:  not-seen

#### Recorded At

The moment an [Identity] was placed under guard — the per-entry timestamp the guard window is measured from. It is stamped from the injected [Now] on the [Record] that opens the guard, and a [Record] on an already-guarded [Identity] leaves it unchanged (single-recording). It is the only datum the [Recorded Set] carries per entry beyond the [Identity] itself.

Kind:     Field
Field of: Recorded Set
Projects: recorded_at

#### Window Duration

The length the containing pattern chooses for a [Window] — how long a recently-recorded [Identity] stays guarded. It is supplied by the containing pattern per use (24 hours for a to-do list, minutes for a payment), sizes the [Window] but is not itself part of the concept's state, and is the value the expiry comparison measures [Now] − [Recorded At] against.

Kind:         Parameter
Parameter of: Record
Projects:     window

#### Now

The current wall-time reading the [Record] and [Check] behaviors evaluate against, supplied to the pure transition by the host at the I/O seam (never read inside the transition, never supplied by the business caller). [Record] stamps [Recorded At] from it; [Check] compares it against the [Window] to decide [Seen] versus [Not Seen].

Kind:         Parameter
Parameter of: Check
Projects:     now

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Identity]: #identity
[Window]: #window
[Recorded Set]: #recorded-set
[Record]: #record
[Check]: #check
[Seen]: #seen
[Not Seen]: #not-seen
[Recorded At]: #recorded-at
[Window Duration]: #window-duration
[Now]: #now

---

## Standards references

Duplicate Prevention is a primitive integrity concept. It has no direct ISO / IEEE / regulatory anchor in this generic form, though specific instantiations have widely-used standards behind them:

- **HTTP (HyperText Transfer Protocol — the request/response protocol of the web) idempotency keys** (IETF (Internet Engineering Task Force — the body that develops internet standards) draft and de-facto convention for safe retry of state-changing requests).
- **Stripe / payment-processor idempotency** (industry-standard pattern for at-most-once charge semantics within a window).
- **Message-queue exactly-once-within-window semantics** (Kafka, SQS (Amazon Simple Queue Service), Pub/Sub deduplication).

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the conception of a freestanding concept with state, actions, and operational principles, designed for composition rather than absorption.
- **Distributed-systems idempotency literature** — the underlying mechanic appears as "idempotency window" or "exactly-once-within-window semantics" in message-queue and payment-processor designs.
- **Linear temporal logic** (a formal notation for reasoning about sequences of states over time) — the eventual-expiry invariant expressed as a temporal property.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-18
formal: verified — duplicate-prevention.tla + 1 twin, 2026-06-03
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/duplicate-prevention.md`.
