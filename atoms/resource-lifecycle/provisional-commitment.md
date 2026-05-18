---
title: Provisional Commitment
parent: Resource Lifecycle
grand_parent: Atomic Concepts
nav_order: 1
has_toc: true
toc: true
---

# Provisional Commitment

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A resource-lifecycle primitive: a single resource is held for a single requester for a bounded window, then resolves exactly once into Confirmed, Released, or Expired. Each commitment has an opaque immutable id; the resource binding, requester, and hold window are immutable properties of the commitment, set at creation.

---

## Intent

A requester needs a resource whose grant is not yet certain. The system promises to hold the resource for the requester for a known period, during which the requester decides whether to confirm (taking the resource into a binding allocation) or release (returning it to availability). If the requester does neither before the period elapses, the system expires the hold and the resource returns to availability.

The pattern addresses a class of needs that recur across virtually every regulated industry: credit-limit holds at banks (pending settlement), bed assignments at hospitals (pending admission), inventory reservations at retailers (pending checkout), room bookings at hotels (pending check-in), seat holds at airlines (pending purchase). The shape is constant — a resource is encumbered for a bounded window, the encumbrance resolves into commitment or release, and the audit record of the encumbrance is itself a regulated asset.

This is a freestanding atom (can be specified without naming any other pattern) in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the commitment record), its own actions (place hold, confirm, release, expire), and its own operational principles (the hold window is binding; the three terminal transitions are absorbing). It does not implement idempotency (submitting the same operation twice produces the same result as once) under retry, the full audit trail of every observation, or aggregate capacity constraints over a resource pool. Each is a separate composable atom; see Composition notes.

---

## Summary

Provisional Commitment is a resource-lifecycle atom (a freestanding pattern spec that does not name any other pattern) that models the universal business act of "holding" a resource for a requester while they decide whether to proceed. The atom owns the complete lifecycle of that hold: it comes into existence when a hold is placed, it lives in a single active state (Held) during the decision window, and it resolves exactly once into one of three terminal states — Confirmed (the requester took the resource), Released (the requester gave it back voluntarily), or Expired (the window closed without a decision). The hold window is a binding contract in both directions: the system promises to keep the resource reserved for the requester until the window closes, and the requester must decide within that window or lose the hold automatically.

Every commitment is identified by an opaque identifier (a system-generated ID with no meaningful content) that is immutable (unchangeable once written) for its lifetime. The resource reference, requester reference, and hold window are likewise immutable properties set at the moment the hold is placed; they cannot be changed after creation. This discipline ensures that each commitment is an unambiguous fact about the past once it settles — an auditor can reconstruct the full lifecycle of any hold from the record alone.

The atom covers the five most common regulated domains in which this pattern appears: credit-limit holds at banks, bed assignments at hospitals, inventory reservations at retailers, room bookings at hotels, and seat holds at airlines. Across all five, the mechanic is identical: one resource, one requester, one bounded window, one terminal outcome. What differs between domains is the resource semantics, the window duration, the regulatory framing of the audit trail, and the composing atoms that handle fare locks, capacity caps, no-show fees, payment idempotency, and the like.

The atom does not attempt to handle idempotency (submitting the same operation twice produces the same result as once) under retry, the full audit journal of every intermediate observation, or aggregate capacity constraints over a resource pool. Each of those concerns is freestanding (can be specified without naming any other pattern) in its own right and is addressed by a separate composing atom. This separation keeps the Provisional Commitment atom small and its invariants (conditions that must always hold) unambiguous — a composing system can rely on the terminal-absorption guarantee and the hold-window contract without also taking on the complexity of idempotency tokens, event journals, or pool arithmetic.

---

## Structure

### Identity model

Every commitment known to the system has an **`id`** — an opaque, immutable, system-generated identifier produced by `place_hold`. The id is the commitment's identity; the resource binding, requester, and hold window are immutable *properties* of the commitment, not its identity.

Two commitments for the same resource have different ids — sequential or concurrent commitments are distinct, even when they share a resource or a requester. Ids are not reused after a commitment exits Held.

The opaque-id model is load-bearing. Identifying a commitment by its `(resource, requester)` pair would muddle re-holds — a requester re-holding the same resource after an earlier release is a *different* commitment with its own audit trail. Identifying by hold timestamp would lose precision under concurrent commitments. Opaque ids preserve the one-commitment-one-id discipline that makes per-event audit reconstruction tractable, which is the regulatory expectation in every domain this atom covers.

### Inputs

- A resource reference identifying what is being held. The atom treats this as opaque — the implementation defines the resource registry and what *availability* means.
- A requester reference identifying who the hold is for.
- A hold window duration, supplied at creation. The window opens at `placed_at` and closes at `expires_at = placed_at + duration`.
- User- or system-initiated actions:
  - `place_hold(resource, requester, duration) → id | rejected(invalid-request | resource-unavailable | storage-failure)`
  - `confirm(id) → ok | rejected(not-known | not-held | window-elapsed | storage-failure)`
  - `release(id) → ok | rejected(not-known | not-held | storage-failure)`
  - `expire(id) → ok | rejected(not-known | not-held | window-not-elapsed | storage-failure)`
- An implicit clock providing wall-time (clock time as a human would read it) timestamps.

### Outputs

- The current set of Held commitments.
- The current set of Confirmed, Released, and Expired commitments.
- For each commitment: `id`, `resource`, `requester`, `placed_at`, `expires_at`, state, and the timestamp of the most recent transition.
- Action acknowledgements — success (returning `id` for `place_hold`, `ok` otherwise) or rejection with a named reason.

### State

A commitment, once created, occupies exactly one of four states:

- **Held** — the resource is encumbered for the requester; the window is open; no terminal transition has occurred.
- **Confirmed** — the requester confirmed within the window; the commitment is terminal.
- **Released** — the requester (or a system acting on their behalf) released within the window; the commitment is terminal.
- **Expired** — the window elapsed without confirmation or release; the commitment is terminal.

There is no *Unheld* state in the system's record. Unheld describes the period before `place_hold` is called and after a non-Held commitment's effect on the resource has concluded — it is a property of the resource, not of the commitment. The commitment lifecycle proceeds: Unheld → (`place_hold`) → Held → one of {Confirmed, Released, Expired}. All three terminal states are absorbing.

Each commitment carries:

- **`id`** — opaque, immutable, system-generated. Set on `place_hold`. Never changes.
- **`resource`** — the resource reference. Set on `place_hold`. Never changes.
- **`requester`** — the requester reference. Set on `place_hold`. Never changes.
- **`placed_at`** — set on `place_hold`. Never changes.
- **`expires_at`** — set on `place_hold` as `placed_at + duration`. Never changes.
- **`confirmed_at`** — set on `confirm`, present only in Confirmed.
- **`released_at`** — set on `release`, present only in Released.
- **`expired_at`** — set on `expire`, present only in Expired.

Transitions:

- `place_hold(resource, requester, duration)` → commitment enters Held with a fresh `id`, `placed_at = now`, `expires_at = now + duration`. Returns `id`.
- `confirm(id)` → commitment moves Held → Confirmed; `confirmed_at = now`. Returns `ok`.
- `release(id)` → commitment moves Held → Released; `released_at = now`. Returns `ok`.
- `expire(id)` → commitment moves Held → Expired; `expired_at = now`. Returns `ok`.

### Flow

1. **Place hold.** The requester signals intent to use the resource without binding. The system records the commitment in Held with a fresh id, `placed_at`, and `expires_at`. Returns the id. *(Start.)*
2. **Wait.** While the commitment is in Held and `now < expires_at`, the resource is encumbered for the requester.
3. **Resolve.** Exactly one of three transitions occurs: confirm (Held → Confirmed), release (Held → Released), or expire (Held → Expired).
4. **Settled.** The commitment is in a terminal state; its record persists for audit. *(End.)*

### Decision points

Each action carries explicit preconditions. Violations are rejected, not silently absorbed.

- **At `place_hold(resource, requester, duration)`** — `resource`, `requester`, and `duration` must be well-formed; otherwise `invalid-request`. `duration` must be positive and within implementation bounds; otherwise `invalid-request`. The resource must be available for holding under the registry's availability rules; otherwise `resource-unavailable`. If the store write fails, the atom returns `rejected(storage-failure)`; no commitment is created.
- **At `confirm(id)`** — `id` must reference a known commitment; otherwise `not-known`. The referenced commitment must be in Held; otherwise `not-held` (Confirmed, Released, or Expired). If `now ≥ expires_at` at the time of the call, confirmation is rejected as `window-elapsed`; the atom requires the explicit Held → Expired transition before the resource reopens. If the store write fails, the atom returns `rejected(storage-failure)`; the commitment remains in Held.
- **At `release(id)`** — `id` must reference a known commitment; otherwise `not-known`. The referenced commitment must be in Held; otherwise `not-held`. If the store write fails, the atom returns `rejected(storage-failure)`; the commitment remains in Held.
- **At `expire(id)`** — `id` must reference a known commitment; otherwise `not-known`. The referenced commitment must be in Held; otherwise `not-held`. `now ≥ expires_at` must hold; otherwise `window-not-elapsed` — the atom does not permit expiring a still-valid window. If the store write fails, the atom returns `rejected(storage-failure)`; the commitment remains in Held.

### Behavior

Observed behavior, derived from how regulated systems use provisional commitments:

- A hold is not a promise of confirmation. The requester is free to release at any time before the window elapses; release is a normal audited outcome, not a failure mode.
- The hold window is a contract with two faces: a commitment to the requester (the resource is theirs to confirm within the window) and a constraint on the requester (decide within the window or lose the hold). Both faces are load-bearing — auditors check both.
- Expiry is a state transition, not a passive absence. A commitment whose wall-time has passed `expires_at` is still in Held until `expire(id)` is invoked. Implementations may invoke `expire` eagerly (a scheduled sweep) or lazily (at next observation of the commitment). The audit-trail consequences differ; see Edge cases.
- Concurrent `place_hold` calls for the same resource resolve serially under the host environment's serialization guarantees. Whichever call wins the race produces a Held commitment; the loser receives `resource-unavailable`.
- The commitment record persists in its terminal state indefinitely from the atom's perspective. Retention, archival, and purge (permanent, unrecoverable removal from storage) are composing concerns; the regulated-deployment composition is with [Retention Window](../compliance/retention-window.md).
- Audit trails read the commitment record directly. Every state transition has a timestamp; every commitment names a requester and a resource. This is the minimum surface a regulator expects.

### Feedback

Each successful action produces an observable, measurable change:

- After `place_hold` — a new commitment appears in Held with a fresh `id`, `placed_at`, `expires_at`. Held count and total count each increase by one. The id is returned to the caller.
- After `confirm(id)` — the commitment moves Held → Confirmed with `confirmed_at`. Held count decreases by one; Confirmed count increases by one; total count unchanged.
- After `release(id)` — the commitment moves Held → Released with `released_at`. Held count decreases by one; Released count increases by one; total count unchanged.
- After `expire(id)` — the commitment moves Held → Expired with `expired_at`. Held count decreases by one; Expired count increases by one; total count unchanged.

Each rejected action produces an observable refusal naming the failed precondition: `invalid-request`, `resource-unavailable`, `not-held`, `not-known`, `window-elapsed`, `window-not-elapsed`, or `storage-failure`.

The Held, Confirmed, Released, and Expired sets are queryable — operators can list, filter, and count them at any time. Per-commitment fields are observable to operators and (where appropriate) to requesters.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Membership exclusivity.** For every commitment `c` known to the system, `c` is in exactly one of {Held, Confirmed, Released, Expired}, never in two states, never in none.
- **Invariant 2 — Hold-then-Held persistence.** After a successful `place_hold`, the resulting commitment is in Held and remains so until `confirm`, `release`, or `expire` is invoked.
- **Invariant 3 — Terminal absorption.** Once a commitment enters Confirmed, Released, or Expired, no action transitions it elsewhere. The atom has no `unconfirm`, `un-release`, or `reactivate` surface.
- **Invariant 4 — Id stability.** A commitment's `id` is set on `place_hold` and never changes.
- **Invariant 5 — Resource and requester immutability.** A commitment's `resource` and `requester` are set on `place_hold` and never change. Re-holding the same resource for the same requester produces a *new* commitment with a new id.
- **Invariant 6 — Hold window monotonicity.** For every commitment, `placed_at < expires_at`. The duration supplied to `place_hold` is positive.
- **Invariant 7 — Confirmation within the window.** A commitment can transition to Confirmed only while `now < expires_at`. After the window elapses, confirmation is rejected; the only legal terminal transition from Held is `expire`.
- **Invariant 8 — Transition timestamps strictly after placement.** For any commitment: if `confirmed_at` is defined, `placed_at ≤ confirmed_at`; if `released_at` is defined, `placed_at ≤ released_at`; if `expired_at` is defined, `expires_at ≤ expired_at` (expiry cannot run before its scheduled time).
- **Invariant 9 — No id reuse.** No two distinct commitments share an `id`, across the lifetime of the system.
- **Invariant 10 — Commitment store durability.** Once recorded, a commitment is never deleted from the store. `confirm`, `release`, and `expire` transition a commitment to a terminal state; they do not remove the record. The total commitment count is monotonically non-decreasing. Retention, archival, and purge are composing concerns ([Retention Window](../compliance/retention-window.md)).

Membership exclusivity and terminal absorption together give the *audit-friendly* property — once a commitment settles, its record is a fact about the past, not a candidate for revision. Confirmation within the window gives the *honored-contract* property — auditors can verify that no commitment was confirmed after its declared window. Resource and requester immutability gives the *one-commitment-one-id* property that makes per-event audit reconstruction tractable. Commitment store durability gives the *irrevocable-record* property — the audit surface cannot be silently reduced by deletion.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Banking — credit-limit hold

A merchant submits a $250 authorization against a customer's card. The bank places a hold (`id` = `auth_c41`, `placed_at` = now, `expires_at` = now + 7 days per scheme rules). The cardholder's available credit drops by $250. Three days later the merchant captures the authorization — `confirm(auth_c41)`; the $250 becomes a settled charge. Alternatively the merchant voids the authorization within seven days — `release(auth_c41)`; available credit restores. If the merchant does neither, the bank invokes `expire(auth_c41)` on the eighth day; available credit restores. Each transition is recorded for liquidity reporting under the bank's BCBS-aligned framework.

### Healthcare — bed assignment

The emergency department requests a bed for a patient awaiting admission. The bed-management system places a hold (`id` = `bed_h17`, `placed_at` = 14:00, `expires_at` = 14:00 + 2 hours). The bed shows as *encumbered* on the unit dashboard. At 14:45 the patient arrives on the unit — `confirm(bed_h17)`; the bed becomes officially assigned. Alternatively the patient is discharged from the ED instead — `release(bed_h17)`; the bed returns to available. If neither happens by 16:00, the bed-management system invokes `expire(bed_h17)`. The Joint-Commission-aligned care-coordination audit reads the commitment record directly.

### Retail — inventory reservation

A shopper adds a $1,200 laptop to their cart at an online retailer with inventory of one unit. The order-management system places a hold (`id` = `inv_r93`, `placed_at` = 19:14, `expires_at` = 19:14 + 15 minutes). The product page shows *one in stock, reserved* to other shoppers. At 19:18 the shopper completes checkout — `confirm(inv_r93)`; the unit transfers to the order. Alternatively the shopper empties their cart — `release(inv_r93)`; the unit returns. If the shopper abandons the cart silently, `expire(inv_r93)` runs at 19:29.

### Hospitality — room booking

A guest reserves a hotel room with a guaranteed-by-credit-card hold for two nights, check-in tomorrow. The property-management system places a hold (`id` = `rm_b58`, `placed_at` = today 11:00, `expires_at` = tomorrow 18:00 — the property's standard cancellation cutoff). The room is unavailable to other reservations. The guest checks in at 17:30 tomorrow — `confirm(rm_b58)`; the booking becomes a stay. Alternatively the guest cancels by 18:00 tomorrow — `release(rm_b58)`; the room reopens. If neither happens, `expire(rm_b58)` runs at 18:01 tomorrow; the room reopens and the property's no-show fee policy (a separate composing pattern) takes effect.

### Airline — seat hold

A passenger selects a fare and a seat during booking. The reservation system places a hold (`id` = `seat_a22`, `placed_at` = 09:33, `expires_at` = 09:48 — the carrier's standard 15-minute fare-lock per IATA practice). The seat is unavailable to other booking sessions. The passenger pays at 09:40 — `confirm(seat_a22)`; the seat is ticketed. Alternatively the passenger backs out — `release(seat_a22)`; the seat returns. If the passenger abandons the booking flow, `expire(seat_a22)` runs at 09:49. The attached fare quote is invalidated on every non-Confirmed terminal transition (a composing Fare Quote atom; out of scope here).

The mechanic is identical across all five. What differs: resource semantics, hold-window duration, the regulatory framing of the audit trail, and the composing atoms that handle fare locks, capacity caps, no-show fees, payment idempotency, and the like.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts, beyond happy-path and rejection-path:

- **Regulator audit.** An auditor asks *"show me every credit-limit hold that was confirmed after its declared window."* The query reads the commitment records, filters where `confirmed_at` is defined and `confirmed_at > expires_at`, and returns the empty set. Invariant 7 (confirmation within the window) guarantees this — the rejection at the `confirm` action makes the post-expiry confirmation impossible to record. The auditor sees a structural guarantee, not a procedural promise.
- **Data subject request.** A customer invokes their GDPR right to erasure on personal data referenced by `requester`. The atom on its own cannot satisfy erasure while preserving the structural audit trail — that tension is the same one Event Log names under right-to-be-forgotten. Composing with a Cryptographic Shredding or Erasure Tombstone pattern alongside legal counsel redacts the personal-data field while keeping `id`, `placed_at`, `expires_at`, state, and transition timestamps intact. The lifecycle remains auditable; the personal data does not persist.
- **Breach investigation.** An incident responder needs the universe of resources committed during a window of suspected unauthorized access — say, 02:00–04:00 UTC on a given date. Each commitment carries `placed_at`; the query reads the commitment record set and returns the matching set directly, with no log replay required. The Event Log composition adds the per-transition timeline needed to determine which commitments were also confirmed, released, or expired during the same window.

These scenarios exercise the atom against the questions regulators actually ask. Happy-path and rejection-path examples cover what users do; adversarial scenarios cover what auditors, data subjects, and investigators do.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Idempotency under retry.** If a requester invokes `place_hold` twice for the same logical intent (network retry, double-click), the atom on its own produces two commitments. Idempotent reservation composes with [Duplicate Prevention](../temporal/duplicate-prevention.md), keyed on an idempotency token (a client-supplied token that makes repeated submissions safe) supplied by the requester. See Composition notes.
- **Full audit trail of state transitions.** The commitment record carries one timestamp per terminal transition, sufficient for *terminal-state* audit. Reconstructing the full sequence of observations — every read, every retry, every observer — requires composing with [Event Log](../temporal/event-log.md). The commitment record is the projection; the Event Log is the journal.
- **Aggregate capacity constraints.** Rules like *no more than 110 concurrent holds against a 100-seat aircraft* (overbooking limits, fractional reserves, inventory pool caps) belong to a separate Capacity Constraint Enforcement atom — *forthcoming*. The bare Provisional Commitment atom holds *one* resource per commitment and does not opine on pool-level rules.
- **Partial release.** A commitment is for one resource and resolves in full. Holding ten units and releasing three is two operations against two commitments at the registry's grain, not a partial transition of one commitment.
- **Renewal or extension of the hold window.** The atom forbids changing `expires_at` after placement (Invariant 6). Patterns that need a longer hold must release the current commitment and place a new one, producing a fresh id and a new audit entry. Mutating `expires_at` would silently break the honored-contract property.
- **Retroactive cancellation of a Confirmed commitment.** Once Confirmed, the atom has no `unconfirm` action — terminal absorption is invariant. Refund, admission reversal, return-to-stock, and similar effects compose this atom with a separate Reversal pattern that produces a *new* compensating commitment, not a state change on the original.
- **Resource availability semantics.** The atom rejects `place_hold` with `resource-unavailable` if the registry says the resource is not hold-able, but does not define *hold-able*. The registry — a separate concern — owns that decision (another active hold, a maintenance lock, an out-of-stock signal, an account-level freeze).
- **Concurrency and atomicity.** State transitions are atomic. A crash mid-transition that leaves a commitment in neither Held nor a terminal state violates membership exclusivity; the implementor owns the transactional boundary. Multi-commitment transactions belong to a Transaction pattern.
- **Clock semantics.** Wall-time from the implicit clock. Skew between caller and system of record, monotonicity, and timezone handling are deployment concerns. The window's correctness is best-effort under an adversarial clock; a composed Event Log's `sequence_number` is the authoritative order when commitments race.
- **Eager vs. lazy expiry policy.** The atom requires `expire(id)` to be invoked, but does not mandate *when*. Eager expiry (scheduled sweeps) produces no observable Held-past-`expires_at` lag and satisfies strict audit; lazy expiry (at next observation) is cheaper but lets commitments linger past their window in records that have not been read. Both are valid; the choice is deployment-shaped with different audit implications.
- **The business meaning of confirmation.** The atom treats `confirm` as a request from the requester (or a system acting on their behalf) and accepts it under preconditions. *Confirmation* meaning funds settled, patient admitted, item shipped, guest arrived, ticket issued, is host-system policy — not part of this atom. A confirmation later judged premature is the host's problem to compensate.
- **Non-repudiation.** The atom names a `requester` reference on each commitment but does not require cryptographic, procedural, or authentication-context binding of the action to the named requester. An adversary with write access to the commitment record could place or confirm a commitment that the named requester did not authorize, and nothing in the atom's surface would surface the discrepancy. Verifiable attribution — signed authorization, MFA-bound caller context, witnessed approval — belongs to an [Actor Identity](../compliance/actor-identity.md) composition. See Composition notes.

Where the atom breaks down: when the resource is fungible at a finer grain than per-commitment (a block of 100 seats sold to a travel agent who sub-allocates to passengers — a multi-tier composition, not one commitment); when the hold window must be paused (medical urgency suspending elective procedure holds — a Pause/Resume pattern); when the resource registry cannot supply atomic, serialized place-hold semantics.

---

## Composition notes

Provisional Commitment is freestanding and is designed to compose with other atoms rather than absorb their concerns:

- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for idempotent reservation. The container calls `check(idempotency_token)` before `place_hold` and `record(idempotency_token)` after a successful `place_hold`, mapping the resulting commitment `id` to the token. A retry with the same token returns the previously-produced `id` rather than creating a second commitment. Window duration is the implementation's choice; typical values match the underlying network retry envelope (minutes). This composition is realized as the [Idempotent Reservation](../../compositions/idempotent-reservation.md) application.
- **[Event Log](../temporal/event-log.md)** — for the audit-able commitment history. The container appends an event to a log instance on every successful action (`place_hold`, `confirm`, `release`, `expire`), preserving the full state-transition sequence for compliance. The commitment record remains the current-state projection; the Event Log is the journal from which the projection can be replayed and audited.
- **Capacity Constraint Enforcement** *(forthcoming)* — for aggregate rules over a resource pool. Composes by intercepting `place_hold` to consult the pool's capacity rule; rejects as `pool-capacity-exceeded` when the rule is violated.
- **Hold Window with Expiry** *(forthcoming)* — may extract window-management concerns (eager-expiry sweepers, deadline notifications, grace periods) into a separate atom. The window is intrinsic to this atom because the window is the contract; if window-management policy proves to recur generically across other resource-lifecycle atoms, extraction will be revisited.
- **Reversal** *(forthcoming)* — produces a compensating commitment that offsets a Confirmed one (refund, admission reversal, return-to-stock). Composes by referencing the original commitment id; does not mutate it.
- **[Actor Identity](../compliance/actor-identity.md)** — binds each action against the atom to a verifiable actor, producing the non-repudiation guarantee regulators expect (signed authorization, MFA-bound caller context, witnessed approval). Provisional Commitment names `requester` as a property of the commitment; Actor Identity is the contract that says the named requester actually authorized the action and cannot later deny it.

---

## Standards references

Provisional Commitment is the first regulated-business atom in the library; its standards inheritance is correspondingly richer than the productivity primitives.

- **ISO 9001:2015 §8.5.2 (Identification and traceability)** — the minimum anchor. Resources under provisional commitment must be identifiable and traceable through every state transition; the atom's identity model and per-commitment audit fields satisfy this directly.
- **ISO 9001:2015 §8.5.4 (Preservation)** — the resource is preserved in its committed state for the requester during the hold window; the atom's hold-window monotonicity invariant is the operational form.
- **Basel III liquidity framework (BCBS 238 LCR)** — banks' credit-limit holds and intraday liquidity reservations follow the same lifecycle. The atom's terminal-absorption invariant matches Basel's expectation that settlement events are facts about the past, not subject to silent revision.
- **The Joint Commission, *Provision of Care, Treatment, and Services*** — healthcare bed-management and capacity-coordination standards require resource encumbrance to be auditable and time-bounded. The atom's audit-friendly property is the structural correlate.
- **IATA Resolution 830a (and related ticketing-time-limit rules)** — airline reservation systems' fare-lock and seat-hold semantics formalize the hold-window contract this atom abstracts; the atom is vocabulary-neutral, IATA is one instantiation.
- **PCI DSS Requirement 10 (logging and monitoring)** — for retail and payment commitments touching cardholder data, every state transition must be logged. Composes with Event Log to deliver this directly.
- **GDPR Article 30 (records of processing activities)** — for commitments whose records contain personal data (named guests, identified patients, ticketed passengers, account holders), the commitment record is itself a processing activity subject to Art. 30's controller-records obligation. The atom's per-commitment audit fields (`requester`, `placed_at`, `expires_at`, transition timestamps) supply the data points Art. 30 expects; what counts as a *processing purpose* per commitment is host-system policy.
- **Sarbanes-Oxley §404 (internal control over financial reporting)** — where confirmed commitments are material to financial reporting (the banking credit-limit example most clearly; any retail or hospitality commitment whose Confirmed transition flows to the books), the controls around the Held → Confirmed transition are §404-scope. Composes with Event Log to produce the auditable evidence §404 attestations require; the atom is implementation-independent on the specific control framework chosen.

For healthcare commitments touching protected health information, HIPAA's audit-controls requirement (45 CFR §164.312(b)) applies to the composing Event Log instance rather than to the commitment record itself; the atom is implementation-independent on this point. The same separation applies to GDPR Art. 30 in EU contexts where the composing Event Log carries the full processing history.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture and the discipline of composing capacity, idempotency, audit, and reversal as separate concepts.
- **Eiffel's design-by-contract** — preconditions on each action; named rejection reasons.
- **Linear temporal logic** — terminal absorption, hold-then-Held persistence, and confirmation-within-the-window expressed as temporal properties.
- **Two-phase commit and reservation protocols (distributed systems)** — the prepare/commit pattern this atom abstracts; here the prepare phase is the visible business state rather than an implementation hidden under transactional semantics.

---

## Generation acceptance

A derived implementation of Provisional Commitment is *acceptable* — in the regulator-acceptance sense MUSE's Proof node requires — when an external auditor, given the commitment record set plus the composed Event Log instance, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct the lifecycle of any commitment.** From `place_hold` to its terminal transition, with every timestamp, the resource and requester references, and the recorded state at each step.
- **Verify all ten invariants hold over the record set.** Membership exclusivity, hold-then-Held persistence, terminal absorption, id stability, resource and requester immutability, hold-window monotonicity, confirmation within the window, transition timestamps strictly after placement, no id reuse, and commitment store durability. Each invariant is checkable by a query over the records.
- **Observe every rejection reason at its action site.** The six named reasons (`invalid-request`, `resource-unavailable`, `not-held`, `not-known`, `window-elapsed`, `window-not-elapsed`) are surfaced on the action interface and visible in the audit trail when rejection events are logged.
- **Identify the composing patterns active in this deployment.** Whether idempotency ([Duplicate Prevention](../temporal/duplicate-prevention.md)), full audit history ([Event Log](../temporal/event-log.md)), pool capacity (Capacity Constraint Enforcement), reversal of confirmed commitments (Reversal), and verifiable attribution ([Actor Identity](../compliance/actor-identity.md)) are wired in, and with what configuration.

This is the *generator's contract*: any code generated from this atom must produce records and a runtime surface that pass the four checks above. The bar is the regulator's question, not the developer's intuition.

---

## Status

`grounded (passed all required review passes and is stable enough to generate from) — last full rescan: 2026-05-13` — all required structural elements resolved; identity model explicit; transition preconditions explicit; rejection paths enumerated; five cross-domain examples covering banking, healthcare, retail, hospitality, airline; deferred concerns (idempotency under retry, full audit trail, aggregate capacity, partial release, renewal, retroactive cancellation, resource availability semantics, concurrency, clock semantics, eager vs. lazy expiry, the business meaning of confirmation) named as out-of-scope with composing patterns where applicable. Ready for composition with Duplicate Prevention, Event Log, Capacity Constraint Enforcement, and Reversal.

---

## Lineage notes

This atom is the result of two iterations of pressure-testing.

**First iteration — three-pass review during authoring.** All three passes from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) run during the initial drafting; findings recorded below.

**Pass 1 — Structural completeness (GRID).** Clean after one revision. The initial draft conflated *Unheld* with a system state, which would have left State malformed (a commitment cannot be Unheld and have an id at the same time). Resolved: State names four states (Held, Confirmed, Released, Expired); Intent and Flow frame Unheld as a property of the *resource* before and after the commitment's effect, not of the commitment record. All nine GRID nodes resolved with their references intact.

**Pass 2 — Conceptual independence (EOS).** Clean. Four concerns were candidates for absorption and all four are correctly named as composing patterns rather than folded in:

- *Idempotency under retry* — generic across messaging, payments, form submission. Composes with [Duplicate Prevention](../temporal/duplicate-prevention.md).
- *Audit trail of state transitions* — generic across every regulated domain. Composes with [Event Log](../temporal/event-log.md).
- *Aggregate capacity constraints* — generic across overbooking, fractional reserves, inventory pools. Composes with a forthcoming Capacity Constraint Enforcement atom.
- *Reversal of a Confirmed commitment* — generic across refunds, chargebacks, admission reversals. Composes with a forthcoming Reversal atom.

Each was tempting to absorb because all five example domains care about all four. EOS discipline holds: a concern that recurs across many concepts belongs to its own concept, not to the host. Provisional Commitment stays small.

**Pass 3 — Adversarial scrutiny (Linus mode).** Five findings, all closed in-pattern:

- *Identity model ambiguity.* The first draft was unclear whether `(resource, requester)` could serve as identity. Resolved: explicit opaque-id model, with a defended-in-line paragraph naming the risk of `(resource, requester)` (re-holds and concurrent commitments would collide) and the mechanism that defuses it (one commitment, one id).
- *Confirmation after window elapsed.* The first draft did not say whether `confirm(id)` was allowed when `now ≥ expires_at` but `expire(id)` had not yet run. Resolved: explicit `window-elapsed` rejection on `confirm`; Invariant 7 names confirmation-within-the-window as load-bearing; Edge cases names eager-vs.-lazy expiry as a deployment-shaped choice with audit implications.
- *Expiry semantics.* The first draft treated expiry as automatic. Resolved: explicit `expire(id)` action with its own preconditions and a transition timestamp `expired_at`. Behavior names the eager-vs.-lazy choice; Edge cases enumerates the trade-off.
- *Hold-window mutation.* The first draft was silent on whether `expires_at` could be extended. Resolved: explicit non-goal in Edge cases; the only path to a longer hold is release-and-re-place, producing a fresh id and a new audit entry. Mutating `expires_at` would silently break the honored-contract property.
- *Examples were happy-path only.* Resolved: each of the five domain examples names all three terminal transitions (Confirmed, Released, Expired); Edge cases enumerates the rejection paths (`invalid-request`, `resource-unavailable`, `not-held`, `not-known`, `window-elapsed`, `window-not-elapsed`).

Three deferred concerns are named as explicit out-of-scope rather than fixed in-pattern: concurrency / atomicity, clock semantics, and the business meaning of confirmation. Each is deployment-shaped or belongs to a composing pattern.

The three passes together exercise the architecture as designed: GRID catches structural gaps (the Unheld conflation); EOS catches over-absorption (idempotency, audit, capacity, reversal); Linus catches hidden decisions (identity model, expiry semantics, window mutation). The atom is stronger because all three checks happened.

**Second iteration — post-authoring adversarial review.** A separate adversarial pass focused on regulated-domain coverage surfaced four further gaps. All four were closed in-pattern.

- *Standards inheritance was thinner than the atom's regulated framing required.* The first iteration named ISO 9001, Basel III, the Joint Commission, IATA, PCI DSS, and HIPAA but omitted two cross-cutting regulatory frameworks that apply across the example domains. Resolved: Standards references now include **GDPR Article 30** (records of processing — applies wherever a commitment record contains personal data) and **Sarbanes-Oxley §404** (internal control over financial reporting — applies where confirmed commitments are material to the books, the banking example most clearly).
- *Adversarial scenarios were missing.* Examples covered happy-path domains and rejection paths but not the questions auditors, data subjects, and incident responders actually ask. Resolved: Examples now includes a sixth subsection — *Regulated adversarial scenarios* — walking regulator audit (querying for late confirmations and seeing Invariant 7 enforced structurally), data subject request (GDPR erasure composing with Cryptographic Shredding), and breach investigation (querying `placed_at` directly for time-windowed forensics).
- *No explicit generation-acceptance criterion.* The first iteration's success criteria were implicit — invariants hold, rejection reasons surface. For a regulated atom, the bar should be explicit and use the regulator's language. Resolved: a new **Generation acceptance** section names four checks an external auditor must be able to perform against the records alone (reconstruct the lifecycle, verify the nine invariants, observe every rejection reason, identify composing patterns active in the deployment). This is the generator's contract — the bar derived code must clear.
- *Non-repudiation was unaddressed.* The atom names `requester` as a property of each commitment but did not say anything about whether the named requester actually authorized the action. Absorbing cryptographic binding into the atom would be an EOS over-absorption (it recurs across every regulated record). Resolved: Edge cases names non-repudiation as an explicit non-goal and points to the composing pattern; Composition notes adds **[Actor Identity](../compliance/actor-identity.md)** as the contract that binds each action to a verifiable actor. (Subsequently drafted; the link resolves.)

The second iteration confirms the recursive property the methodology claims: Lineage notes themselves are pressure-testable, and a fresh adversarial pass surfaces additional gaps even after the three-pass authoring review reaches *grounded*. Each fresh application of the methodology adds evidence the architecture is doing real work.

*Subsequent to this atom's publication, two of the second-iteration fixes — Regulated adversarial scenarios and Generation acceptance — were promoted to canonical status in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md). This atom's second-iteration record is the historical origin; the methodology docs are now the canonical source.*

**Refinement round 1.** Four findings, all closed in-pattern. Conventions inherited from the methodology directly.

- *Action signatures used `rejected(reason)` placeholders; `storage-failure` absent from all four.* All four action signatures named `rejected(reason)` with the reason taxonomy living only in the Feedback and Decision points prose. Resolved: signatures expanded — `place_hold` returns `rejected(invalid-request | resource-unavailable | storage-failure)`, `confirm` returns `rejected(not-known | not-held | window-elapsed | storage-failure)`, `release` returns `rejected(not-known | not-held | storage-failure)`, `expire` returns `rejected(not-known | not-held | window-not-elapsed | storage-failure)`. Feedback updated to include `storage-failure`.
- *`storage-failure` missing from Decision points.* All four actions write to the commitment store; none previously named the write-failure path. Resolved: each Decision point extended — if the store write fails, the atom returns `rejected(storage-failure)` and the commitment is unchanged (for `confirm`, `release`, `expire`) or not created (for `place_hold`). Decision points for `confirm`, `release`, and `expire` also restructured to separate the `not-known` check from the `not-held` check explicitly.
- *No durability invariant.* Nine invariants existed; none stated that commitments are never deleted. The Behavior section said "The commitment record persists in its terminal state indefinitely from the atom's perspective" — correct as prose, but not an invariant. Resolved: Invariant 10 — Commitment store durability — added: `confirm`, `release`, and `expire` transition commitments to terminal states without removing records; total count is monotonically non-decreasing; retention and purge are composing concerns (Retention Window). The summary paragraph updated to name the *irrevocable-record* property this invariant gives.
- *Generation acceptance referenced "nine invariants" — stale after Invariant 10.* Resolved: updated to "ten invariants"; durability added to the enumeration of checkable properties.
