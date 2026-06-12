---
title: Reservation Lifecycle
parent: Compositions
nav_order: 18
has_toc: true
toc: true
---

# Reservation Lifecycle (C9)

<details markdown="block">
 <summary>Table of contents</summary>
 {: .text-delta }
1. TOC
{:toc}
</details>

> A composition: the full arc of a reservation against a bounded pool — a capacity-gated provisional hold, an idempotent confirmation under concurrent demand, and a terminal resolution that returns the slot to the pool atomically — with every state change attributed and journaled. It wires Capacity Constraint Enforcement, Provisional Commitment, Duplicate Prevention, Event Log, and Actor Identity into the structure every booking, ticketing, and inventory system implements but no constituent owns alone. The load-bearing emergent guarantee is **allocation coherence**: the pool's running `allocated` total stays in exact lockstep with the set of live reservations (Held or Confirmed) against it — so confirmed reservations never exceed pool capacity, and a cancelled or expired reservation returns its slot to the pool exactly once, neither leaked nor double-released. Provisional Commitment owns the per-reservation state machine; Capacity Constraint owns the pool arithmetic; the binding between a reservation and the pool slot it holds belongs to neither and is this composition.

---

## Intent

Every system that reserves a unit of a finite resource faces the same arc, and it is the same whether the resource is an airline seat, a hotel room, a hospital bed, an event ticket, or a unit of warehouse inventory: a request encumbers one unit of a bounded pool provisionally; the encumbrance resolves into a firm booking, a cancellation, or a timed-out lapse; and the pool's free count must reflect, at every instant, exactly how many units are spoken for. Get the binding between the per-reservation lifecycle and the pool arithmetic wrong and the system either oversells (two reservations confirmed against one slot) or strands inventory (a cancelled reservation whose slot is never returned). The arc is constant; the failure modes are constant; and they live precisely at the seam between *the reservation* and *the pool*.

Neither Provisional Commitment nor Capacity Constraint Enforcement, alone, closes that seam. Provisional Commitment owns the per-reservation state machine — Held → Confirmed | Released | Expired, with the confirm-within-window guarantee (Invariant 7) that a hold cannot be confirmed after its window has elapsed — but it holds *one* resource per commitment and, by its own specification, *"does not opine on pool-level rules"*; it has no notion of a bounded pool or a running total. Capacity Constraint Enforcement owns the pool arithmetic — `allocated ≤ capacity` (Invariant 4) enforced by precondition on `allocate`, and `allocated ≥ 0` (Invariant 5) enforced on `release` — but units are *fungible* at its grain: it tracks a running count, not per-allocation identities, and by its own specification *"the composing pattern supplies the per-allocation identity; this atom owns only the pool's arithmetic."* Capacity Constraint even admits `release` against a Closed pool *expressly so that a composing pattern like Provisional Commitment can return slots when its holds reach terminal states* — naming the seam, and naming this composition as the thing that lives there, without filling it. The binding that keeps `allocated` in lockstep with the live-reservation set — allocate-on-hold, hold-the-slot-through-confirm, release-on-terminal — belongs to no single constituent. It belongs to the composition, and this composition is that binding.

This is a composition, not a new primitive. The five constituents are unchanged; the composition is the wiring that makes them coherent as a single reservation surface. It introduces emergent actions — `reserve`, `confirm_reservation`, `cancel_reservation`, `expire_reservation` — that bind a Provisional Commitment to a Capacity Constraint pool slot, deduplicate retries through Duplicate Prevention, attribute every act through Actor Identity, and journal every state change through Event Log. The `reserve` action, in particular, wraps a capacity gate (`Capacity Constraint.allocate`), a provisional hold (`Provisional Commitment.place_hold`), a duplicate check, and a journaled, attributed event into one named surface, so that taking a slot is a single atomic act whose pool effect is bound to the reservation — not a `place_hold` whose pool consequences leak into whatever code remembers to decrement the counter.

What the composition is *not*: it is not the resource-availability oracle (whether a *specific* seat or room is bookable is Provisional Commitment's registry concern, upstream of the pool count); it is not the overbooking-policy engine (a deployment that deliberately oversells by N sets the pool's `capacity` above the physical count — that is a Configuration choice, not a composition behavior); it is not the pricing, waitlist, or fulfillment surface; and it is not the audit-substrate composition (it journals to Event Log and attributes via Actor Identity directly, the lighter pairing, rather than composing the full tamper-evident Audit Trail — a deployment needing seals composes Audit Trail as a peer). Each is named explicitly in Edge cases.

---

## Summary

Reservation Lifecycle is a composition (a spec that wires two or more atoms — freestanding, self-contained pattern specs — together) that solves a problem none of its constituents solves alone: managing the full life of a reservation against a finite pool so that the pool's free count is always exactly right. A request takes a provisional hold on one unit of a bounded pool; the hold is confirmed into a firm booking, cancelled, or allowed to time out; and at every instant the pool's `allocated` total equals the number of reservations still live against it. It wires five constituents: Provisional Commitment (the per-reservation Held → Confirmed | Released | Expired state machine with its confirm-within-window guarantee), Capacity Constraint Enforcement (the bounded pool whose running total never exceeds its declared capacity), Duplicate Prevention (the retry guard that makes every reservation action safely repeatable), Event Log (the durable journal of every state change), and Actor Identity (the attestation that binds every act to a verifiable actor).

The composition's defining emergent guarantee (a property that appears only when atoms are combined — no single atom carries it) is **allocation coherence**: the pool's `allocated` count stays in exact lockstep with the set of reservations in a slot-holding state (Held or Confirmed). Three consequences follow. Confirmed reservations never exceed pool capacity — every `reserve` gates on `Capacity Constraint.allocate`, which refuses past `capacity`. A cancelled or expired reservation returns its slot to the pool *exactly once* — the terminal transition and the pool `release` commit together, so no slot is leaked (a cancellation whose unit is never returned) and none is double-released (a unit returned twice, driving the count below the truth). And no reservation is confirmed unless its hold is still live at confirmation time — Provisional Commitment's confirm-within-window guarantee, surfaced at the composition layer, prevents confirming a slot that has already lapsed and been returned.

Beyond coherence, the composition makes every reservation action idempotent under retry (the Idempotent Reservation precursor's contract, extended over the pool-aware surface), and records every state change as a durable, attributed Event Log entry. Its most common uses are airline and hospitality booking, event ticketing, hospital bed and resource allocation, and warehouse and supply-chain inventory reservation. Any system that must guarantee, from the pool count alone, that it never oversells and never strands inventory across the reserve/confirm/cancel/expire arc is a candidate for this composition.

---

## Composes

- **[Provisional Commitment](../atoms/provisional-commitment.md)** — the per-reservation state machine: Held → Confirmed | Released | Expired, with `place_hold`, `confirm`, `release`, `expire`, the confirm-within-window guarantee (Invariant 7 — a hold cannot be confirmed after `expires_at`), and terminal absorption (Invariant 3). The composition maintains exactly one Provisional Commitment instance and is the sole writer of its state transitions; a reservation *is* a Provisional Commitment, and its `id` is the `reservation_id`. The composition calls `place_hold` (from `reserve`), `confirm` (from `confirm_reservation`), `release` (from `cancel_reservation`), and `expire` (from `expire_reservation`).
- **[Capacity Constraint Enforcement](../atoms/capacity-constraint-enforcement.md)** — the bounded pool whose `allocated ≤ capacity` (Invariant 4) and `allocated ≥ 0` (Invariant 5) the composition relies on rather than re-implements. The composition maintains one or more Capacity Constraint pools (one per reservable resource class) and is the sole writer of `allocate`/`release` against them for slots it binds. It calls `allocate(pool_id, count=1, ...)` at `reserve` (the capacity gate), `release(pool_id, count=1, ...)` at `cancel_reservation` and `expire_reservation` (the slot return). Capacity Constraint's admission of `release` in the Closed pool state (its Invariant 3) is the constituent guarantee that makes slot-return correct even for a pool closed to new reservations while live holds unwind.
- **[Duplicate Prevention](../atoms/duplicate-prevention.md)** — the temporally-bounded retry guard. The composition maintains exactly one Duplicate Prevention instance configured with the idempotency window; every state-changing action carries an `idempotency_token` checked against it, so a retried `reserve`/`confirm`/`cancel` returns the original outcome rather than acting twice. This is the Idempotent Reservation precursor's mechanism, carried into the pool-aware surface.
- **[Event Log](../atoms/event-log.md)** — the durable, append-only, total-ordered journal. Every state-changing composition action appends one Event Log entry recording the reservation id, the pool id, the action, the prior and new commitment state, the pool arithmetic (`allocated_before`/`allocated_after`), the actor, and the timestamp. Event Log's insertion order is the authoritative ordering of reservation events. (The composition uses Event Log directly rather than the full Audit Trail substrate; a deployment requiring tamper-evident seals and attribution-as-one-record composes Audit Trail as a peer — see Edge cases.)
- **[Actor Identity](../atoms/actor-identity.md)** — the attestation surface. The `actor_ref` and `credential` on each state-changing action are bound cryptographically via Actor Identity, so every reservation event names a verifiable actor. The composition maintains one Actor Identity instance.

---

## Composition logic

### Application state

The composition owns emergent state that wires the five constituents into one queryable reservation surface. None of this state belongs to a single constituent.

- **`reservation_to_pool`** — map from `reservation_id` (the Provisional Commitment `id`) to the `pool_id` whose slot the reservation holds. Populated by `reserve`; read by `cancel_reservation` and `expire_reservation` to know which pool to `release` against. **This is the binding the composition exists to maintain** — it is what makes a reservation's pool slot a recorded fact rather than an implicit consequence. The entry persists for the life of the reservation record (it is the record of which slot the reservation took, retained even after terminal resolution as the audit join from the reservation to its pool); a flag `slot_released ∈ {false, true}` on the entry records whether the slot has been returned, set true exactly when the terminal `release` against the pool commits, so a slot is returned at most once (Invariant 2).
- **`token_results`** — the idempotency cache inherited from the Idempotent Reservation precursor: a map from `idempotency_token` to a recorded outcome `(action_type, parameters_digest, result)`. Its lifetime is governed by the Duplicate Prevention window (entries are evicted when the token leaves the `recorded` set); a `token_results` entry is never evicted while its token remains in Duplicate Prevention's recorded set (the eviction-ordering constraint inherited from Idempotent Reservation Invariant 7). `action_type ∈ {reserve, confirm_reservation, cancel_reservation, expire_reservation}`.

The Provisional Commitment store (commitment records and their states), the Capacity Constraint stores (pool records and running totals), the Duplicate Prevention store (recorded tokens), the Event Log store (entries), and the Actor Identity store (attestations) are owned by their respective constituent instances. The composition does not duplicate them; it indexes into them via the maps above.

### Configuration

- **`idempotency_window`** — the duration of the Duplicate Prevention window, passed to the Duplicate Prevention instance. Selected to cover the slowest legitimate retry cycle for the most critical action (inherited from Idempotent Reservation Configuration; defaults 60 s for HTTP retry envelopes through 24 h for slow reconciliation rails).
- **`pool_capacity`** — the declared `capacity` of each Capacity Constraint pool, set at pool declaration. A deployment that deliberately overbooks sets `capacity` above the physical unit count (Edge cases — *Overbooking is a capacity choice*); the composition enforces `allocated ≤ capacity` against whatever `capacity` is declared, and does not itself model overbooking policy.
- **`expiry_sweep`** — the deployment's strategy for invoking `expire_reservation` on holds whose window has elapsed: an eager scheduled sweep (a background job firing `expire_reservation` at `expires_at`) or a lazy on-observation sweep. The composition holds the binding (`reservation_to_pool`) and exposes `expire_reservation`, but is not the scheduling engine (Edge cases — *Expiry sweeper boundary*, mirroring KYC's monitoring-scheduler boundary).

### Primitive policies

- **`idempotency_token`** — non-null, non-empty, within `token_max_length` bytes (`invalid-request`); opaque, byte-exact comparison. Validated at the composition layer before any constituent is consulted (inherited from Idempotent Reservation).
- **`pool_id`** — opaque, system-generated by Capacity Constraint's `declare_pool`. Must reference a known, non-Closed pool at `reserve`; otherwise the action surfaces `not-known` (unknown pool) or `pool-closed` (Closed pool — no new reservations). Byte-identity equality as a map key.
- **`reservation_id`** — the opaque Provisional Commitment `id`. When supplied to `confirm_reservation`, `cancel_reservation`, or `expire_reservation`, must reference a reservation known to the composition (present in `reservation_to_pool`); otherwise `not-known`.
- **`resource`, `requester`, `duration`** — the Provisional Commitment `place_hold` tuple. Validated by Provisional Commitment's preconditions; the composition propagates its `invalid-request` and `resource-unavailable`.
- **`actor_ref`** — opaque actor identifier; at least one non-whitespace character, else `invalid-request`. Bound cryptographically via Actor Identity through the paired `credential`, and recorded on every Event Log entry.
- **`credential`** — opaque credential material consumed by Actor Identity's attestation; the composition does not inspect it. Actor Identity may surface `invalid-credential`, mapped to `invalid-request` (the attestation precedes the irreversible pool/hold writes in `reserve`; see Action wiring) or to `recording-failure` where it follows a committed state change.

No primitive is case-sensitivity-normalized at the composition layer.

### Action wiring

The composition exposes five actions. Four are state-changing — each carries a required `idempotency_token`, attributes via Actor Identity, and journals to Event Log; the fifth, `query_reservation`, is a read-only pass-through. Every state-changing action follows the idempotency shape inherited from Idempotent Reservation: validate the token, consult `DuplicatePrevention.check`, replay the cached result on a matching `seen`, otherwise delegate to the constituents, record the outcome (success *or* rejection — the *cache-the-failure* rule), and `DuplicatePrevention.record`. The wiring below describes the `not-seen` (first-invocation) path; the idempotent-replay path is identical to Idempotent Reservation's and is not re-stated per action. Every constituent rejection is mapped — propagated, renamed, or surfaced as a new code — at the composition boundary.

#### `reserve`

```
reserve(
 pool_id,
 resource,
 requester,
 duration,
 actor_ref,
 credential,
 idempotency_token
) →
  reservation_id
 | rejected(
   invalid-request
  | token-collision
  | not-known
  | pool-closed
  | pool-capacity-exceeded
  | resource-unavailable
  | recording-failure
  )
```

Takes one slot of `pool_id` and opens a provisional hold bound to it. The **capacity gate and the hold are bound**: the slot is allocated only if the hold is taken, and the hold is taken only if a slot was available.

Steps (first-invocation path):

1. Validate `idempotency_token`, `actor_ref`, `credential`, and the `place_hold` tuple per Primitive policies. Malformed token or args → `rejected(invalid-request)` (a malformed token is not cached — there is nothing to cache against). Stop.
2. `DuplicatePrevention.check(idempotency_token)`. On `seen`, replay per the inherited idempotency rule (matching `action_type = reserve` and `parameters_digest` → cached result; mismatch → `rejected(token-collision)`). On `not-seen`, continue.
3. **Capacity gate:** `Capacity Constraint.allocate(pool_id, count=1, allocating_actor_ref=actor_ref)` → `allocation_event_id` (or map: `not-known` → `rejected(not-known)`; `over-capacity` → `rejected(pool-capacity-exceeded)`; `suspended`/`closed` → `rejected(pool-closed)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. On any rejection, cache it against the token and stop — no hold is placed, no slot is held).
4. **Place the hold:** `Provisional Commitment.place_hold(resource, requester, duration)` → `reservation_id` (or map: `invalid-request` → `rejected(invalid-request)`; `resource-unavailable` → `rejected(resource-unavailable)`; `storage-failure` → `rejected(recording-failure)`. **On any rejection here, compensate the step-3 allocation:** `Capacity Constraint.release(pool_id, count=1, releasing_actor_ref=actor_ref)` — the slot was allocated but no hold took it, so it must be returned or it leaks; then cache the rejection and stop. The compensating release is the only path where the composition releases a slot without a terminal commitment transition, and it exists precisely to preserve allocation coherence across a partial `reserve`).
5. **Attribute and journal:** record an Event Log entry `{action: reserve, reservation_id, pool_id, prior_state: none, new_state: Held, allocated_before, allocated_after, allocation_event_id, actor_ref, at: now}`, attributed via `Actor Identity` under `credential`. If the journal write fails after steps 3–4 succeeded → `rejected(recording-failure)`; **`reservation_to_pool` is not populated** until the event lands (audit-first discipline), so a reservation never becomes resolvable without its `reserve` event journaled — the orphan (allocated slot + placed hold with no journaled event and no binding) is surfaced per the *Cross-store consistency under partial failure* edge case.
6. Populate state only after the event lands: `reservation_to_pool[reservation_id] = {pool_id, slot_released: false}`; cache `token_results[idempotency_token] = (reserve, digest, reservation_id)`; `DuplicatePrevention.record(idempotency_token)`.
7. Return `reservation_id`.

#### `confirm_reservation`

```
confirm_reservation(reservation_id, actor_ref, credential, idempotency_token) →
  ok
 | rejected(invalid-request | token-collision | not-known | not-held | window-elapsed | recording-failure)
```

Confirms a held reservation into a firm booking. **The slot is not released** — a Confirmed reservation keeps its pool unit (the binding allocation persists), so `allocated` is unchanged. This is the action whose `window-elapsed` rejection is the composition's *no-confirm-without-active-hold* guarantee.

Steps (first-invocation path): validate; `check`; on `not-seen`: resolve `reservation_id` in `reservation_to_pool` (absent → `rejected(not-known)`); `Provisional Commitment.confirm(reservation_id)` → `ok` (or map: `not-known` → `rejected(recording-failure)` — internal-consistency anomaly, the composition knows the id but Provisional Commitment does not; `not-held` → `rejected(not-held)`; `window-elapsed` → `rejected(window-elapsed)` — the hold lapsed before confirmation, and the slot it held is the expiry sweeper's to return, not this action's; `storage-failure` → `rejected(recording-failure)`); journal `{action: confirm_reservation, reservation_id, pool_id, prior_state: Held, new_state: Confirmed, allocated unchanged, actor_ref, at: now}` attributed via Actor Identity; cache and `record`. Return `ok`. (The slot stays allocated; no `Capacity Constraint` call is made — Confirmed consumes the unit in the binding allocation.)

#### `cancel_reservation`

```
cancel_reservation(reservation_id, actor_ref, credential, idempotency_token) →
  ok
 | rejected(invalid-request | token-collision | not-known | not-held | recording-failure)
```

Cancels a held reservation and **returns its slot to the pool atomically**.

Steps (first-invocation path): validate; `check`; on `not-seen`: resolve `reservation_id` in `reservation_to_pool` (absent → `rejected(not-known)`); resolve `pool_id`. Then, committed together within the host transaction boundary so they land together or not at all (the *Cross-store consistency* edge case):

1. `Provisional Commitment.release(reservation_id)` → `ok` (or map: `not-known` → `rejected(recording-failure)`; `not-held` → `rejected(not-held)` — the reservation is already terminal: Confirmed, Released, or Expired; a cancel of a Confirmed reservation is out of scope here — un-booking a firm reservation is a Reversal-pattern concern, Edge cases; `storage-failure` → `rejected(recording-failure)`).
2. `Capacity Constraint.release(pool_id, count=1, releasing_actor_ref=actor_ref)` → `release_event_id` (or map: `not-known` → `rejected(recording-failure)`; `over-release` → `rejected(recording-failure)` — an internal-consistency anomaly meaning the slot was already returned, which the `slot_released` flag exists to prevent; `invalid-request`/`storage-failure` → `rejected(recording-failure)`). Set `reservation_to_pool[reservation_id].slot_released = true`.
3. Journal `{action: cancel_reservation, reservation_id, pool_id, prior_state: Held, new_state: Released, allocated_before, allocated_after, release_event_id, actor_ref, at: now}` attributed via Actor Identity.

Cache and `record`. Return `ok`. If the host cannot commit steps 1–3 atomically, a failure between the commitment release and the pool release leaves a released reservation whose slot was not returned (a leak) — handled per the *Cross-store consistency* edge case (retry the pool release; the `slot_released` flag makes the retry idempotent).

#### `expire_reservation`

```
expire_reservation(reservation_id, actor_ref, credential, idempotency_token) →
  ok
 | rejected(invalid-request | token-collision | not-known | not-held | window-not-elapsed | recording-failure)
```

The action an expiry sweeper invokes on a held reservation whose window has elapsed: it drives the Provisional Commitment `expire` transition and **returns the slot to the pool atomically**, exactly as `cancel_reservation` does, differing only in the constituent transition (`expire` rather than `release`) and the `window-not-elapsed` guard.

Steps (first-invocation path): validate; `check`; on `not-seen`: resolve `reservation_id` and `pool_id`. Committed together within the host transaction boundary: `Provisional Commitment.expire(reservation_id)` → `ok` (or map: `not-known` → `rejected(recording-failure)`; `not-held` → `rejected(not-held)`; `window-not-elapsed` → `rejected(window-not-elapsed)` — the hold has not yet lapsed, so expiry is premature and no slot is returned; `storage-failure` → `rejected(recording-failure)`); `Capacity Constraint.release(pool_id, count=1, ...)` → `release_event_id`, set `slot_released = true`; journal `{action: expire_reservation, reservation_id, pool_id, prior_state: Held, new_state: Expired, allocated_before, allocated_after, release_event_id, actor_ref, at: now}` attributed via Actor Identity. Cache and `record`. Return `ok`.

#### `query_reservation`

```
query_reservation(reservation_id) →
  {state, pool_id, slot_held} | rejected(not-known)
```

Read-only. **No Event Log entry is produced** — a read changes no state. Resolves `reservation_id` in `reservation_to_pool` (absent → `rejected(not-known)`), reads the commitment's current state from Provisional Commitment, and reports `{state, pool_id, slot_held = (state ∈ {Held, Confirmed} and not slot_released)}`. Callers consume this to learn whether a reservation is live and holds a slot.

### The load-bearing wiring decision — allocation coherence

The composition's structural reason to exist: **the pool's `allocated` total equals the number of reservations in a slot-holding state (Held or Confirmed) bound to that pool, at every instant — so the pool never oversells and never strands a slot.**

*Principle.* A reservation system must, from the pool count alone, never confirm more reservations than capacity and never lose a freed slot. Structurally that means the pool's running total and the live-reservation set must move together: a reservation enters the live set exactly when it takes a slot, and leaves it exactly when its slot is returned, with the counter tracking that membership.

*Likely objection.* Capacity Constraint already guarantees `allocated ≤ capacity` (Invariant 4), and Provisional Commitment already owns the reservation state machine. Why not let the caller `allocate` on `place_hold` and `release` on the terminal transition itself — why does the binding need to be the composition's job?

*Mechanism that resolves it.* Because neither constituent knows about the other, and the seam between them is exactly where coherence breaks. Capacity Constraint tracks a fungible count with *no per-allocation identity* — it cannot, by itself, know that *this* `release` corresponds to *that* expired hold, or prevent a slot being released twice for one reservation; its own spec defers per-allocation identity to the composing pattern. Provisional Commitment owns per-reservation identity and the Held → terminal transitions but has *no notion of a pool* — its `release`/`expire` decrement nothing. A caller wiring the two by hand re-implements the binding per call site, and the first site that releases a slot for a reservation that already lapsed (double-release → count below truth), or transitions a hold terminal without releasing the slot (leak → count above truth), or confirms a hold whose slot was already returned by an expiry sweep (oversell), breaks coherence silently. The composition closes this by owning the `reservation_to_pool` binding with its `slot_released` flag: `reserve` allocates-and-holds atomically (with a compensating release if the hold fails — Action wiring step 4); `confirm_reservation` keeps the slot (Confirmed consumes the unit); `cancel_reservation` and `expire_reservation` release the commitment and the pool slot *together* within one transaction boundary, with `slot_released` guaranteeing the pool `release` happens exactly once; and the confirm-within-window guarantee (Provisional Commitment Invariant 7, surfaced as `window-elapsed`) forecloses confirming a slot an expiry already returned. The binding is what makes `allocated` a faithful image of the live-reservation set.

*Result.* Allocation coherence is structural. An auditor (or the pool's own `query`) can read `allocated` and trust it equals the count of live reservations against the pool; the system cannot oversell (every `reserve` gated on `allocate`), cannot strand a slot (every terminal transition releases, exactly once), and cannot confirm a lapsed hold (the window guard). The three failure modes that define reservation bugs — oversell, leak, double-release — are each foreclosed by a named mechanism, not avoided by convention.

---

## Composition-level invariants

These invariants emerge from the composition. None belongs to a single constituent; each requires two or more working together to hold.

- **Invariant 1 — Allocation coherence (load-bearing).** For every pool, `Capacity Constraint.query(pool_id).allocated` equals the number of reservations bound to that pool (in `reservation_to_pool`) whose Provisional Commitment state is Held or Confirmed. *Defended in-line:* `reserve` increments the pool (`allocate`) exactly when it places a hold (and compensates with a `release` if the hold fails, step 4); `confirm_reservation` leaves both the live-set membership and the counter unchanged (Held → Confirmed is still slot-holding); `cancel_reservation` and `expire_reservation` remove the reservation from the live set (Held → terminal) and decrement the counter (`release`) together. No other action touches the pool. *Rests on:* Capacity Constraint Invariants 4–5 (the counter arithmetic), Provisional Commitment Invariants 1, 3 (state exclusivity and terminal absorption), and the host transaction boundary that commits the terminal transition and the pool release together (Edge cases — *Cross-store consistency*). This is the invariant the formal model checks (Lineage — *Formal model*).

- **Invariant 2 — Slot returned at most once.** For every reservation, the pool `release` that returns its slot is committed at most once across its lifetime. *Defended in-line:* the `slot_released` flag on `reservation_to_pool[reservation_id]` is set true when the terminal `release` against the pool commits, and `cancel_reservation`/`expire_reservation` only release for a reservation transitioning *out of* Held — Provisional Commitment's terminal absorption (Invariant 3) guarantees a reservation reaches a terminal state once, so the slot-returning transition fires once. *Rests on:* Provisional Commitment Invariant 3 and the `slot_released` guard. A double-release (count driven below the live-set size) is foreclosed; the constituent's `over-release` rejection is the backstop if the guard is ever bypassed.

- **Invariant 3 — Confirmed reservations never exceed capacity.** The count of Confirmed reservations against a pool never exceeds the pool's `capacity`. *Rests on:* Invariant 1 (allocation coherence — Confirmed reservations are in the slot-holding set counted by `allocated`) plus Capacity Constraint Invariant 4 (`allocated ≤ capacity`). Because every Confirmed reservation holds a slot counted in `allocated`, and `allocated ≤ capacity`, the Confirmed count is bounded by capacity. This is the *no-oversell* guarantee in the form a booking operator states it.

- **Invariant 4 — No confirmation of a lapsed hold.** A reservation is confirmed only while its hold window is open; a hold whose window has elapsed cannot be confirmed and is resolvable only by `expire_reservation`. *Defended in-line:* `confirm_reservation` maps Provisional Commitment's `window-elapsed` rejection straight through. *Rests on:* Provisional Commitment Invariant 7 (confirmation within the window). This is what prevents confirming a slot that an expiry sweep has already returned to the pool — the coherence guard at the confirm/expire race.

- **Invariant 5 — Idempotent reservation actions.** For any `idempotency_token` within the Duplicate Prevention window, repeated `reserve`/`confirm_reservation`/`cancel_reservation`/`expire_reservation` calls with matching `parameters_digest` return the same response and invoke the constituents at most once; reuse of a token across a different `action_type` or parameters is `token-collision`. *Rests on:* the Idempotent Reservation precursor's contract (its Invariants 1–4, 8) over the pool-aware surface — `token_results` caches every outcome (the cache-the-failure rule), and Duplicate Prevention's single-recording invariant prevents window extension on retry. Idempotency is what makes the coherence guarantees hold *under retry*: a retried `reserve` does not take a second slot.

- **Invariant 6 — Every state change is attributed and journaled.** Every state-changing action produces exactly one Event Log entry naming the reservation, the pool, the prior and new state, the pool arithmetic, and the acting actor (attested via Actor Identity); read-only queries produce none. *Rests on:* Event Log's append-only total order and Actor Identity's attestation; the audit-first ordering in `reserve` (the binding is not populated until the event lands) plus the journal write in every terminal action. The reservation lifecycle is reconstructable from the Event Log alone.

- **Invariant 7 — Constituent invariants preserved.** All invariants of Provisional Commitment (10), Capacity Constraint Enforcement (14), Duplicate Prevention, Event Log, and Actor Identity hold over their respective instances. The composition never bypasses a constituent precondition; constituent rejections flow through, mapped, and are cached against the idempotency token.

Allocation coherence (Invariant 1) with slot-returned-at-most-once (Invariant 2) gives the *no-leak/no-double-release* property — the pool count is a faithful image of the live set. Never-exceed-capacity (Invariant 3) with no-confirmation-of-a-lapsed-hold (Invariant 4) gives the *no-oversell* property across the confirm/expire race. Idempotency (Invariant 5) makes both hold under retry; attribution-and-journaling (Invariant 6) makes the whole arc records-reconstructable; preserved constituent invariants (Invariant 7) are the floor the emergent guarantees stand on.

---

## Examples

### Walkthrough — event ticketing against a bounded pool

A venue sells a 2-seat VIP tier as a Capacity Constraint pool `pool_vip` with `capacity = 2`. The composition runs with a 5-minute idempotency window and an eager expiry sweep.

1. **Reserve (buyer A).** `reserve(pool_vip, resource="vip-tier", requester="buyer_a", duration=10m, actor_ref="checkout_svc", credential=<checkout_svc>, idempotency_token=tok_a1) → reservation_id = rsv_001`. Internally: `Capacity Constraint.allocate(pool_vip, 1, ...)` → `allocated: 0 → 1`; `Provisional Commitment.place_hold("vip-tier", "buyer_a", 10m)` → `rsv_001` (Held); Event Log records `reserve`; `reservation_to_pool[rsv_001] = {pool_vip, slot_released: false}`. `query(pool_vip).allocated = 1`.
2. **Reserve (buyer B).** `reserve(pool_vip, ..., requester="buyer_b", ..., idempotency_token=tok_b1) → rsv_002`. `allocated: 1 → 2`. The pool is now full.
3. **Reserve (buyer C) — capacity gate fires.** `reserve(pool_vip, ..., requester="buyer_c", ..., idempotency_token=tok_c1)` → `Capacity Constraint.allocate(pool_vip, 1, ...)` → `over-capacity` → `rejected(pool-capacity-exceeded)`. No hold is placed; `allocated` stays 2. Buyer C is not oversold. (Invariant 3.)
4. **Retry buyer A's reserve (network drop).** `reserve(pool_vip, ..., idempotency_token=tok_a1)` → `DuplicatePrevention.check(tok_a1) → seen`; cached `(reserve, digest_a, rsv_001)` replayed → returns `rsv_001`. No second `allocate`; `allocated` stays 2. (Invariant 5.)
5. **Confirm (buyer A).** `confirm_reservation(rsv_001, actor_ref="checkout_svc", credential=<…>, idempotency_token=tok_a2) → ok`. `Provisional Commitment.confirm(rsv_001)` → Confirmed (within window); the slot is *kept* — no pool `release`. `allocated` stays 2. (Confirmed consumes the unit.)
6. **Expiry (buyer B lets the hold lapse).** Ten minutes pass; the sweep fires `expire_reservation(rsv_002, actor_ref="sweeper", credential=<sweeper>, idempotency_token=tok_sweep_b) → ok`. `Provisional Commitment.expire(rsv_002)` → Expired; `Capacity Constraint.release(pool_vip, 1, ...)` → `allocated: 2 → 1`; `slot_released = true`; Event Log records `expire_reservation`. The slot is returned exactly once. (Invariants 1, 2.)
7. **Reserve (buyer C, retry with a fresh token).** Now `reserve(pool_vip, ..., requester="buyer_c", idempotency_token=tok_c2)` → `allocate` → `allocated: 1 → 2` → `rsv_003` Held. Buyer C gets the slot buyer B let lapse. The pool count tracked the truth throughout.

### Cancellation returns the slot

Buyer A cancels before confirming (in a variant where rsv_001 is still Held): `cancel_reservation(rsv_001, ..., idempotency_token=tok_cancel_a) → ok`. `Provisional Commitment.release(rsv_001)` → Released; `Capacity Constraint.release(pool_vip, 1, ...)` → `allocated` decrements; `slot_released = true`. The slot returns to the pool atomically with the cancellation. (Invariants 1, 2.)

### Partial-reserve compensation

A `reserve` allocates a slot (`allocated: 1 → 2`) but `Provisional Commitment.place_hold` then returns `resource-unavailable` (the specific resource was taken between the capacity gate and the hold). The composition compensates: `Capacity Constraint.release(pool_vip, 1, ...)` → `allocated: 2 → 1`, returning the slot the unsuccessful reserve took, and returns `rejected(resource-unavailable)` to the caller (cached against the token). Coherence is preserved across the failed reserve — the slot is not leaked. (Action wiring step 4.)

### Rejection path — confirming a lapsed hold

A buyer's checkout stalls; by the time `confirm_reservation(rsv_002, ...)` arrives, `rsv_002`'s 10-minute window has elapsed. `Provisional Commitment.confirm(rsv_002)` → `window-elapsed` → `rejected(window-elapsed)`. The reservation is not confirmed; its slot is the expiry sweeper's to return. The buyer must reserve afresh. (Invariant 4 — no confirmation of a lapsed hold; this is the confirm/expire race resolved in the pool's favor.)

### Regulated adversarial scenarios

**Regulator/operator audit — "prove you never oversold the pool."** An auditor reads the pool's `query(pool_id).allocated` and the Event Log and confirms that at no point did the count of Confirmed reservations exceed `capacity` (Invariant 3), and that `allocated` at every event equals the live-reservation set reconstructed from the Event Log (Invariant 1). The `allocated_before`/`allocated_after` fields on every reservation event make the arithmetic chain replayable; a state in which Confirmed reservations outnumber `capacity`, or `allocated` diverges from the live set, is a conformance failure. The auditor consults no source code — the pool count and the journal are sufficient.

**Disputed double-booking — two customers claim the same unit.** An investigator inspects the Event Log for the pool: every `reserve` carries the `allocation_event_id` and the `allocated_before`/`allocated_after`; every terminal action carries the `release_event_id`. If two Confirmed reservations exist against a 1-capacity pool, either `capacity` was raised by an `adjust_capacity` (an overbooking choice the pool's audit log records) or coherence was violated — and the Event Log shows which. Idempotency (Invariant 5) forecloses the retry-induced double-reserve; the dispute resolves to a recorded `adjust_capacity`, a client token-discipline failure, or a genuine finding, each distinguishable from the records.

**Inventory-leak forensics — "free count is wrong; find the stranded slot."** An operator observes `allocated` higher than the visible live reservations. The investigator replays the Event Log: every `reserve` (slot taken) must have either a matching terminal `cancel_reservation`/`expire_reservation` (slot returned, `slot_released = true`) or a live Held/Confirmed reservation. A reservation in a terminal Provisional Commitment state with `slot_released = false` and no release event is the stranded slot — a leak whose precise reservation and pool the records name. Invariant 2 (slot returned at most once) and Invariant 6 (every change journaled) are what make the leak locatable rather than a mystery in an aggregate counter.

---

## Generation acceptance

A derived implementation of C9 is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's `reservation_to_pool` and `token_results` stores plus the Provisional Commitment, Capacity Constraint, Duplicate Prevention, Event Log, and Actor Identity instances, can do all of the following without recourse to source code, runbooks, or developer narration.

### Record-clearable checks

1. **Allocation coherence.** For every pool, `query(pool_id).allocated` equals the number of `reservation_to_pool` entries for that pool whose Provisional Commitment state is Held or Confirmed (Invariant 1). A divergence is a conformance failure.
2. **No oversell.** For every pool, the count of Confirmed reservations never exceeds `capacity` across the Event Log replay (Invariant 3).
3. **Slot returned at most once.** For every reservation in a terminal state, there is at most one pool `release` event, and `slot_released = true` iff that release committed; a terminal reservation with `slot_released = false` and no live slot is a stranded-slot conformance failure (Invariant 2).
4. **No lapsed confirmation.** Every Confirmed reservation's `confirm_reservation` event is ordered before its hold's `expires_at` in the Event Log (Invariant 4).
5. **Idempotency.** Every `idempotency_token` within the window binds to one outcome; no two distinct reservations share a token; retries within the window produce no second constituent invocation (Invariant 5, inherited from Idempotent Reservation).
6. **Constituent Generation acceptance bars.** Verify each constituent's own bar over its store: Provisional Commitment's, Capacity Constraint's, Duplicate Prevention's, Event Log's, Actor Identity's.

### Externally-clearable checks

- **Whether the declared `capacity` reflects the physical unit count or a deliberate overbooking margin.** The composition enforces `allocated ≤ capacity`; whether `capacity` was set above the physical count (overbooking) is a deployment policy read from the pool declaration and `adjust_capacity` history, not a composition behavior.
- **Whether the resource-availability oracle behind `place_hold` was correct.** The composition records `resource-unavailable`; whether the underlying registry's availability determination was accurate is the registry's concern.
- **The composing-instance configurations** — idempotency window, digest function, expiry-sweep strategy — read from deployment configuration, not from the stores.

---

## Edge cases and explicit non-goals

- **Cross-store consistency under partial failure.** The state-changing actions write to two or three stores in sequence; a failure between writes leaves partial state. The conforming implementation commits each action's constituent writes within one host transaction boundary so they land together or not at all: `reserve`'s allocate+hold (with the step-4 compensating release if the hold fails), and `cancel_reservation`/`expire_reservation`'s terminal-transition+pool-release. Where the host cannot provide atomicity, the implementation must (a) for a leaked slot (terminal transition committed, pool release lost), retry the pool release — the `slot_released` flag makes the retry idempotent and the `over-release` constituent rejection is the backstop; (b) for a partial `reserve` (slot allocated, hold lost), run the compensating release; (c) surface any reservation in a terminal Provisional Commitment state with `slot_released = false` to operations as a high-priority stranded-slot finding. This mirrors Idempotent Reservation's *idempotency under partial composition failure* and KYC's cross-store treatment. The `token_results` cache must be durable before `DuplicatePrevention.record` reports success (the inherited durability-ordering requirement) or a retry re-delegates and the coherence guarantees weaken.
- **Expiry sweeper boundary.** The composition holds the binding and exposes `expire_reservation`, but it is not the scheduling engine. An external sweeper reads holds whose `expires_at` has passed (eager: a timer at `expires_at`; lazy: on next observation) and calls `expire_reservation`; the composition does not set timers or own the cadence. Until the sweeper fires, an elapsed hold is still Held and its slot is still allocated — so `allocated` may transiently count a lapsed-but-not-yet-expired hold; this is the documented eager-vs-lazy gap inherited from Provisional Commitment, and `confirm_reservation`'s `window-elapsed` guard ensures the lapsed hold cannot be confirmed in the interim. A deployment requiring tight free-count accuracy runs an eager sweep.
- **Overbooking is a capacity choice, not a composition behavior.** A deployment that deliberately oversells (airlines selling 110 seats against 100) sets the pool's `capacity` above the physical count; the composition enforces `allocated ≤ capacity` against whatever `capacity` is declared and never itself permits `allocated > capacity`. Overbooking *policy* (how much to oversell, how to handle the overflow at fulfillment) is upstream; the composition's guarantee is coherence against the declared bound.
- **Cancelling a Confirmed reservation (un-booking) is out of scope.** `cancel_reservation` operates on a Held reservation; a Confirmed reservation is a firm booking, and reversing it (refund, re-open the slot) is a Reversal-pattern concern (compose a Reversal atom that produces a compensating action and, where the slot should re-open, a pool `release`). C9's terminal transitions out of Held are cancel and expire; un-booking a Confirmed reservation is a separate, deliberately-excluded lifecycle.
- **Multi-unit reservations.** C9 binds one slot per reservation (`count = 1`). A reservation for N units of a pool (a group booking) is a composing extension that allocates `count = N` and tracks N in the binding; the single-unit case is the primitive, and the multi-unit case is named here as the obvious generalization a deployment wires when it needs it.
- **Resource-availability oracle.** Whether a *specific* resource (seat 14C, room 307) is bookable is Provisional Commitment's registry concern (`resource-unavailable`), upstream of and distinct from the pool's *count*. A pool with free capacity can still reject a `reserve` for a specific unavailable resource; the two gates are independent (pool count via `allocate`, specific resource via `place_hold`).
- **No tamper-evident seal at this layer.** C9 journals to Event Log and attributes via Actor Identity — durable and attributed, but not cryptographically sealed. A deployment whose reservation events are litigation-exposed composes Audit Trail (Event Log + Actor Identity + Retention Window + Tamper Evidence) as a peer in place of the bare Event Log + Actor Identity pairing; the action wiring is identical, with `record_action` replacing the direct Event Log append. C9 uses the lighter pairing by default because reservation systems are high-throughput and most do not require per-event seals.
- **Concurrency.** Concurrent state-changing actions on the same `reservation_id` (a `cancel_reservation` racing an `expire_reservation`, or a `confirm_reservation` racing an expiry sweep) resolve under the host's serialization guarantees and Provisional Commitment's terminal absorption — the first terminal transition wins, the second observes `not-held` and is rejected, and only one pool `release` fires (the `slot_released` guard). Concurrent `reserve` against the same pool is serialized by Capacity Constraint's own concurrency obligation (its Invariant 4 host obligation — serializable execution per `pool_id`); the composition relies on it and does not re-implement the pool's serialization. Per-token serialization (the inherited Idempotent Reservation requirement) prevents a concurrent retry from double-acting before the cache is populated.
- **Clock semantics.** `now` in timestamps and the hold window comes from the application's implicit clock; `expires_at` ordering and sweep timing inherit Provisional Commitment's clock treatment. Where reservation timestamps have legal or settlement force, a Trusted Timestamping composition supplies the verifiable anchor and binds Event Log insertion order to wall-time; absent it, insertion order is authoritative.

---

## Standards references

- **ISO 9001 §8.5.2 / §8.5.4 (identification, traceability, preservation of outputs)** — the reservation lifecycle's traceable per-unit arc inherits from Provisional Commitment.
- **PCI DSS Requirement 10 (logging and monitoring)** — the Event Log journal plus Actor Identity attribution on every reservation event produce the audit evidence for payment-adjacent holds (credit-limit and authorization holds are Provisional Commitments against a credit pool).
- **IATA Resolution 830a / NDC (airline reservation and distribution)** — seat-inventory holds against a bounded cabin are the canonical Reservation Lifecycle: a pool per cabin class, a hold per booking, confirm/cancel/expire returning inventory.
- **Joint Commission care-coordination standards** — hospital bed and resource allocation as a bounded pool with attributed, journaled holds; the no-oversell guarantee is the patient-safety form of allocation coherence.
- **GS1 / supply-chain inventory-reservation conventions** — warehouse unit reservation against available-to-promise pools; allocation coherence is the available-to-promise accuracy guarantee.
- **IETF draft-ietf-httpapi-idempotency-key-header; ISO 20022 message uniqueness** — the idempotency surface inherited from the Idempotent Reservation precursor.

The five constituents carry their own deep standards inheritance — see each constituent's Standards references.

---

## Status

`grounded on Final Critique 4 — 2026-06-04` (formal layer complete 2026-06-04 — TLA+ model [`reservation-lifecycle.tla`](./reservation-lifecycle.tla) + buggy twin verified in `tools/harness/`; see Lineage §Formal model). Authored end-to-end 2026-06-04 against the Idempotent Reservation precursor as structural template: Opus-gated through Pass 1 (GRID), Pass 2 (EOS — the five-constituent set confirmed, the pool-arithmetic binding identified as the emergent concern neither Capacity Constraint nor Provisional Commitment owns, overbooking policy and un-booking/Reversal extracted), Pass 3 (Linus), and a Final Critique round; foundational and refining findings closed in-pattern (see Lineage notes). Composition logic specified across all five constituents; emergent state (`reservation_to_pool` with the `slot_released` flag, `token_results`) named with population discipline; five actions wired (`reserve` with the capacity gate and partial-reserve compensation, `confirm_reservation` keeping the slot, `cancel_reservation` and `expire_reservation` returning the slot atomically, and the read-only `query_reservation`) with fully-named rejection taxonomies; the load-bearing allocation-coherence decision defended in four parts; seven composition-level invariants; walkthrough plus cancellation, partial-reserve-compensation, and lapsed-confirmation examples; three regulated adversarial scenarios; Generation acceptance split between record-clearable and externally-clearable; nine edge cases including cross-store consistency, the expiry-sweeper boundary, overbooking-as-a-capacity-choice, the un-booking exclusion, and the no-seal-at-this-layer note. The formal-layer vote was YES; the derived TLA+ model — allocation coherence (`allocated` = live-reservation count, ≤ capacity, ≥ 0) across reserve/confirm/cancel/expire under interleaving — verifies green with a buggy twin (a non-atomic cancel that releases the commitment without returning the slot) the checker rejects. This brings the library to **45 grounded patterns (18 grounded compositions)** and retires the C9 / Reservation Lifecycle forthcoming-links in Capacity Constraint Enforcement and Provisional Commitment.

---

## Lineage notes

Composition. *Regulated adversarial scenarios* and *Generation acceptance* (split per the convention) are **inherited from the methodology directly** ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft. [Idempotent Reservation](./idempotent-reservation.md) is the primary structural reference — C9 is its pool-aware superset: it carries the idempotency surface (token cache, cache-the-failure, eviction ordering) verbatim and adds the Capacity Constraint binding and the Event Log + Actor Identity attribution. KYC (C8) is the secondary reference for the composition-owned-maps discipline, the cross-store-consistency treatment, and the scheduler-boundary (here the expiry sweeper). The allocation-coherence invariant and its model are modeled on Capacity Constraint's own `capacity-constraint-enforcement.tla` (the counter invariant) lifted to the per-reservation binding.

**Structural milestone.** This composition retires the `*(C9 — forthcoming …)*` and `Reservation Lifecycle (C9) *(forthcoming)*` links in [`atoms/capacity-constraint-enforcement.md`](../atoms/capacity-constraint-enforcement.md) (the *Provisional Commitment* composition-note entry and the *Reservation Lifecycle (C9)* forthcoming entry) and the corresponding entry in [`atoms/provisional-commitment.md`](../atoms/provisional-commitment.md)'s Composition notes. When this composition grounds, those forthcoming-links resolve.

**Pass 2 (EOS) — constituent-set decisions.**

- *The binding is the emergent concern.* Capacity Constraint owns fungible pool arithmetic with no per-allocation identity; Provisional Commitment owns per-reservation identity with no pool. The `reservation_to_pool` binding (which reservation holds which pool slot, and whether it has been returned) belongs to neither and is the composition's reason to exist. Confirmed as emergent.
- *Event Log + Actor Identity directly, not the Audit Trail substrate.* The ROADMAP prerequisites name Event Log and Actor Identity directly. Evaluated whether to compose the full Audit Trail substrate (as KYC/Chain of Custody do): rejected for the default surface — reservation systems are high-throughput and most do not need per-event tamper seals; the lighter Event-Log-plus-attestation pairing is the right default, with Audit Trail named as a peer composition for litigation-exposed deployments (Edge cases — *No tamper-evident seal at this layer*).
- *Overbooking and un-booking extracted.* Overbooking is a `capacity` Configuration choice, not a composition behavior; un-booking a Confirmed reservation is a Reversal-pattern concern. Both extracted and named in Edge cases.

**Pass 1 (GRID) — findings closed in-pattern.**

- *Passive-expiry → slot-release gap.* Provisional Commitment expiry is a state transition requiring an `expire` call (eager sweep or lazy), not a passive condition — but the pool slot must be returned when a hold lapses. The first draft left the slot-return on expiry implicit. Fixed: `expire_reservation` is a first-class action returning the slot atomically with the `expire` transition, and the *Expiry sweeper boundary* edge case names who invokes it (the scheduler-boundary pattern from KYC).
- *Partial-reserve compensation unspecified.* `reserve` allocates then holds; if the hold fails after the allocate, the slot leaks. The first draft did not say. Fixed: step 4 compensates with a `release` on hold failure — the one path where the composition releases a slot without a terminal transition, named explicitly.

**Pass 3 (Linus) — findings closed in-pattern.**

- *The confirm/expire race — what stops confirming a slot an expiry already returned?* If a hold lapses and the sweeper expires it (returning the slot), a late `confirm` must not succeed and double-count. Resolved: Provisional Commitment Invariant 7 (`window-elapsed`) maps straight through `confirm_reservation`; Invariant 4 names this as the coherence guard at the race. The slot an expiry returned cannot be re-confirmed.
- *Double-release.* What stops `cancel_reservation` and a racing `expire_reservation` from both releasing the slot? Resolved: Provisional Commitment terminal absorption (Invariant 3) means only one terminal transition fires; the `slot_released` flag on the binding and Capacity Constraint's `over-release` rejection are the guard and backstop. Invariant 2 states it.
- *Confirmed-keeps-the-slot was implicit.* Whether `confirm_reservation` releases or keeps the slot determines whether `allocated` counts Confirmed reservations. Resolved: Confirmed *keeps* the slot (consumes the unit in the binding allocation) — `confirm_reservation` makes no pool call; `allocated` = count of {Held, Confirmed}. Stated in the action and Invariant 1.

**Final Critique — Phase-4 Opus clearance gate (Happy Torvalds X2), 2026-06-04.** Fresh-reader Opus; all three passes, Pass 3 at X2 depth. Pass 1 and Pass 2 clean. Pass 3 surfaced refining findings, zero foundational — the gate clears at the 92%-good threshold. Refining: the transient eager-vs-lazy `allocated` over-count of a lapsed-but-not-yet-swept hold was made explicit in the *Expiry sweeper boundary* edge case; the `over-release` mapping to `recording-failure` (an internal-consistency anomaly the `slot_released` guard should prevent) was clarified; the multi-unit generalization was named so the single-unit scope is a deliberate primitive, not an oversight. **Gate result: zero foundational findings → `grounded`.**

**Formal-layer vote — 2026-06-04: YES.** The load-bearing claim is Invariant 1 — allocation coherence: under interleaving of reserve/confirm/cancel/expire, the pool counter stays equal to the live-reservation set and within `[0, capacity]`. This is a counter/coherence safety claim of the shape `capacity-constraint-enforcement.tla` verifies (allocated ≤ capacity under concurrency), lifted to the composition's per-reservation binding where the new hazards are slot-leak (terminal transition without release) and double-release. Invariant 5 (idempotency) is verified by the precursor's model; Invariants 3–4 follow from Invariant 1 plus constituent invariants. The coherence-under-interleaving claim is the one a model earns its keep on.

**Formal model — 2026-06-04: TLA+ authored and verified.** Derived model [`reservation-lifecycle.tla`](./reservation-lifecycle.tla) + config + buggy twin [`reservation-lifecycle-buggy.tla`](./reservation-lifecycle-buggy.tla), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* each reservation has a `state ∈ {none, held, confirmed, released, expired}`; a global `allocated` counter tracks the pool. `Reserve` (guarded by `allocated < Capacity`) atomically sets a reservation Held and increments `allocated`; `Confirm` moves Held → Confirmed leaving `allocated` unchanged; `Cancel` and `Expire` move Held → terminal and decrement `allocated` atomically. The load-bearing **Invariant 1** is checked as `AllocationCoherence`: `allocated = Cardinality({r : state[r] ∈ {held, confirmed}})`, together with `allocated ≤ Capacity` and `allocated ≥ 0`. Exhaustive: holds. *Buggy twin* replaces `Cancel` with `CancelBuggy`, which moves the reservation to `released` **without** decrementing `allocated` — the non-atomic slot-leak the *Cross-store consistency* edge case warns against — so a reachable state has `allocated` greater than the live-reservation count; `AllocationCoherence` fails and the checker rejects the twin. The twin proving the checker can fail is the vacuity guard. *Out of model scope:* idempotency (Invariant 5 — see `idempotent-reservation.tla`), the constituent state machines and their own invariants, attribution/journaling. *Conflict-protocol outcome:* none — the model corroborates the English; canonical English unchanged.

---

## Composition notes

These are adjacent compositions, **not** constituents of C9:

- **[Idempotent Reservation](./idempotent-reservation.md)** — the precursor: Provisional Commitment + Duplicate Prevention, the idempotency surface without pool arithmetic. C9 is its pool-aware superset; a deployment that needs retry-safe holds but no bounded pool uses Idempotent Reservation directly.
- **Audit Trail** (substrate, peer) — a deployment whose reservation events require tamper-evident seals composes Audit Trail in place of the bare Event Log + Actor Identity pairing (Edge cases — *No tamper-evident seal at this layer*).
- **Reversal** *(forthcoming)* — produces a compensating action that un-books a Confirmed reservation and, where the slot should re-open, returns it to the pool. C9 deliberately excludes un-booking a firm reservation; Reversal is the composing pattern that adds it.
- **Trusted Timestamping** *(forthcoming)* — binds Event Log insertion order to verifiable wall-time where reservation or settlement timestamps have legal force.
