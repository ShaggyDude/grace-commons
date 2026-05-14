---
title: Capacity Constraint Enforcement
parent: Resource Lifecycle
grand_parent: Atoms
nav_order: 3
has_toc: true
toc: true
---

# Capacity Constraint Enforcement

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A resource-lifecycle primitive: a named, bounded pool of a finite resource with arithmetic that enforces *total allocated never exceeds declared capacity*. The pool's identity is an opaque immutable id; capacity is mutable via attributed, audited adjustments. Allocations consume units, releases return units; units are fungible — the atom does not retain per-allocation identity. States: Open, Suspended, Closed. The load-bearing contribution: a single durable arithmetic invariant (`allocated ≤ capacity`) that composing patterns may rely on without re-implementing the constraint at every call site.

---

## Intent

Many regulated and operational systems must enforce a hard arithmetic bound on a shared, finite resource: an airline cannot ticket more passengers than the aircraft's seats; a bank cannot extend credit beyond a customer's declared limit; a hospital ward cannot admit more patients than its bed count; a connection pool cannot allocate more concurrent connections than the database supports; a warehouse cannot pick more units than are on the shelf. The shape is constant — declared capacity, accumulating allocations, hard rejection on over-capacity, releases returning units to availability — even though the resource semantics vary across domains.

Capacity Constraint Enforcement isolates that arithmetic into a single primitive. It owns one rule and one rule only: at every instant, the sum of currently-allocated units against any pool is less than or equal to that pool's declared capacity. Allocations that would violate the rule are rejected at the boundary; releases decrement the running count; capacity may be adjusted upward freely and downward only when the new capacity still admits the current allocation count.

The pattern is distinct from Provisional Commitment. Provisional Commitment owns the *per-allocation* lifecycle — a specific resource is held for a specific requester for a bounded window, with an opaque commitment id and the absorbing terminal states Confirmed / Released / Expired. Capacity Constraint Enforcement owns the *pool-aggregate* arithmetic — the total allocated count against a declared bound, with no per-allocation identity at this layer. The two atoms compose in the obvious way: Provisional Commitment supplies the per-commitment record; Capacity Constraint Enforcement supplies the gate that prevents the pool's running total from exceeding capacity when the commitment is placed. Reservation Lifecycle is the composition that wires them together. Each atom remains freestanding.

This is a freestanding atom in the EOS sense. It has its own state machine (Open ⇄ Suspended; either non-Closed state → Closed via `close_pool`), its own actions (`declare_pool`, `allocate`, `release`, `adjust_capacity`, `suspend_pool`, `resume_pool`, `close_pool`, `query`), and its own invariants (the arithmetic bound, the audit-log immutability, the state-change auditability). It does not implement per-allocation identity, fairness or eviction policy under contention, preemption, capacity bursting or overcommit, allocation expiry, or the resource semantics that determine what a "unit" means. Each is a composing concern. See Composition notes.

---

## Structure

### Identity model

Every pool known to the system has a **`pool_id`** — an opaque, immutable, system-generated identifier produced by `declare_pool`. The id is the pool's identity; the declaring actor reference, declaration timestamp, and declaration reason are immutable *properties* of the pool record, set at creation.

The opaque-id model is load-bearing for two reasons. First, the *name* a deployment might use for a pool (e.g., `"flight-NK1234-2026-05-14-seats"` or `"connection-pool-primary"`) is a host-system concern: pools may be re-named, re-categorized, or re-tagged without the pool's identity changing. Second, two pools with the same human-readable label — declared in different deployment regions or against different resource registries — must have distinct ids so their arithmetic does not merge. Using a content field as identity would silently conflate logical-rename and distinct-pool cases.

Each `allocate` call produces an **`allocation_event_id`** — opaque, immutable, system-generated. Each `release` call produces a **`release_event_id`**. Each `adjust_capacity` call produces an **`adjustment_event_id`**. Each `suspend_pool`, `resume_pool`, or `close_pool` call produces a **`state_change_id`**. All four event-id classes are sub-records of the pool, accumulating on the pool's audit log in insertion order, each individually addressable so that composing patterns (Actor Identity attestation, Audit Trail recording, Reservation Lifecycle's per-commitment cross-reference) can reference a specific event by id without depending on timestamp or position.

Units are fungible at this atom's grain — the atom does not assign or track per-allocation identities. An `allocate(pool_id, count=5, ...)` call increments the running total by five and emits one allocation event with one id; it does not produce five sub-records or five allocation ids. A subsequent `release(pool_id, count=5, ...)` decrements the running total by five and emits one release event with one id. The composing pattern (Provisional Commitment, or whatever owns the per-allocation lifecycle in the host system) supplies the per-allocation identity; this atom owns only the pool's arithmetic.

### Inputs and Outputs

- A capacity value — a non-negative integer naming the maximum total allocation the pool admits. Zero is allowed (a pool that admits no allocations until its capacity is adjusted upward).
- A unit count — a positive integer naming how many units an `allocate` or `release` call operates on.
- A new-capacity value — a non-negative integer supplied to `adjust_capacity`.
- A declaring / allocating / releasing / adjusting / suspending / resuming / closing actor reference — an opaque pointer to the internal actor performing the action. Non-empty, non-whitespace-only. Attribution only; non-repudiable proof composes with Actor Identity.
- A reason — a non-empty, non-whitespace-only string of at most 2000 characters, required on `declare_pool`, `adjust_capacity`, `suspend_pool`, `resume_pool`, `close_pool`. Not required on `allocate` or `release` (those are routine arithmetic operations; the audit value of a per-allocation reason is low and would clutter the event log).
- Actions:
  - `declare_pool(capacity, declaring_actor_ref, reason) → pool_id | rejected(invalid-request | storage-failure)`
  - `allocate(pool_id, count, allocating_actor_ref) → allocation_event_id | rejected(not-known | over-capacity | suspended | closed | invalid-request | storage-failure)`
  - `release(pool_id, count, releasing_actor_ref) → release_event_id | rejected(not-known | over-release | invalid-request | storage-failure)`
  - `adjust_capacity(pool_id, new_capacity, adjusting_actor_ref, reason) → adjustment_event_id | rejected(not-known | closed | over-allocated | invalid-request | storage-failure)`
  - `suspend_pool(pool_id, suspending_actor_ref, reason) → state_change_id | rejected(not-known | not-open | already-closed | invalid-request | storage-failure)`
  - `resume_pool(pool_id, resuming_actor_ref, reason) → state_change_id | rejected(not-known | not-suspended | already-closed | invalid-request | storage-failure)`
  - `close_pool(pool_id, closing_actor_ref, reason) → state_change_id | rejected(not-known | already-closed | invalid-request | storage-failure)`
  - `query(pool_id) → {capacity, allocated, available, state} | rejected(not-known)`
- An implicit clock providing wall-time timestamps for event-log entries.

**On `declare_pool`:** `capacity` must be a non-negative integer; otherwise `invalid-request`. `declaring_actor_ref` and `reason` must satisfy the uniform validation rule below.

**On `allocate`:** `count` must be a positive integer (at least 1); otherwise `invalid-request`. `allocating_actor_ref` must satisfy the uniform validation rule. The atom does not permit zero-unit allocations — a no-op allocate is not a legitimate use of the action.

**On `release`:** `count` must be a positive integer; otherwise `invalid-request`. `releasing_actor_ref` must satisfy the uniform validation rule.

**On `adjust_capacity`:** `new_capacity` must be a non-negative integer; otherwise `invalid-request`. `adjusting_actor_ref` and `reason` must satisfy the uniform validation rule.

**On `suspend_pool`, `resume_pool`, `close_pool`:** `*_actor_ref` and `reason` must satisfy the uniform validation rule.

**Outputs** — the current set of pool records; for each pool: `pool_id`, `capacity` (current declared maximum), `allocated` (current running total), `available` (= `capacity - allocated`), current state, `declared_at`, `declaring_actor_ref`, `declaration_reason`, and the full audit log (allocation events, release events, capacity-adjustment events, state-change events, in insertion order). For each allocation event: `allocation_event_id`, `pool_id`, `count`, `allocating_actor_ref`, `recorded_at`. Release events carry the symmetric fields plus the running-total snapshot after the release. Capacity-adjustment events carry: `adjustment_event_id`, `pool_id`, `prior_capacity`, `new_capacity`, `adjusting_actor_ref`, `reason`, `recorded_at`. State-change events carry: `state_change_id`, `pool_id`, `prior_state`, `new_state`, `acting_actor_ref`, `reason`, `recorded_at`. Action returns: the event id created (per the action signatures above) so the caller has the id in hand without a follow-up query — required for passing to Actor Identity for attestation and to Audit Trail for tamper-evident recording.

### State

A pool, once declared, occupies exactly one of three states:

- **Open** — the pool accepts `allocate` calls subject to the capacity constraint (allocations that would push `allocated + count > capacity` are rejected with `over-capacity`; the pool remains Open). Entry state for every newly declared pool.
- **Suspended** — the pool rejects all new `allocate` calls regardless of capacity headroom. `release` calls are still accepted (in-flight allocations can be cleanly unwound). `adjust_capacity` is still accepted (capacity can be revised before resumption). Reached via `suspend_pool`; left via `resume_pool` (back to Open) or `close_pool` (terminal).
- **Closed** — terminal. The pool rejects new `allocate` calls and new `adjust_capacity` calls. `release` calls are still accepted so callers can unwind in-flight allocations; this is the only post-Closed mutation permitted. The pool record persists indefinitely from the atom's perspective.

**Drained is not a state.** The arithmetic condition `allocated == capacity` is observable via `query` (returns `available = 0`) and is the precondition that causes `allocate` to reject with `over-capacity`. Treating it as a state would conflate a policy decision (an actor deciding to stop new allocations) with an arithmetic property (the running total has reached the bound). The state machine names policy-driven transitions only; arithmetic conditions are derived.

**Ordering.** The pool's audit log is ordered by insertion sequence. References elsewhere in this spec to "after the most recent X," "between X and Y," or "most recent X" mean by insertion order, not by timestamp order. Timestamps on log entries are best-effort wall-time metadata sourced from the implicit clock; under skew or clock adjustment, timestamps may not be monotonic. Composing with Trusted Timestamping binds insertion order to externally-verifiable wall-time; without that composition, timestamps are advisory and insertion order is authoritative.

Each pool record carries:

- **`pool_id`** — opaque, immutable, system-generated. Set on `declare_pool`. Never changes.
- **`declared_at`** — wall-time of declaration. Set on `declare_pool`. Never changes.
- **`declaring_actor_ref`** — set on `declare_pool`. Never changes.
- **`declaration_reason`** — set on `declare_pool`. Never changes.
- **`capacity`** — current declared maximum. Set on `declare_pool`; modified only by `adjust_capacity`.
- **`allocated`** — current running total. Modified only by `allocate` (incremented) and `release` (decremented).
- **current state** — one of {Open, Suspended, Closed}. Modified only by `suspend_pool`, `resume_pool`, `close_pool`.
- **audit log** — ordered, append-only list of allocation events, release events, capacity-adjustment events, and state-change events. Each entry is individually addressable by its respective event id.

Transitions:

- `declare_pool(capacity, ...)` → pool created in **Open** with fresh `pool_id`, `declared_at = now`, `allocated = 0`, current capacity = supplied capacity.
- `allocate(pool_id, count, ...)` when Open and `allocated + count ≤ capacity` → `allocated` increments by `count`; allocation event appended; state unchanged.
- `allocate(pool_id, count, ...)` when Open and `allocated + count > capacity` → `rejected(over-capacity)`; no state change, no allocation event recorded.
- `allocate(pool_id, count, ...)` when Suspended → `rejected(suspended)`.
- `allocate(pool_id, count, ...)` when Closed → `rejected(closed)`.
- `release(pool_id, count, ...)` when `count ≤ allocated` (in any state including Closed) → `allocated` decrements by `count`; release event appended; state unchanged.
- `release(pool_id, count, ...)` when `count > allocated` → `rejected(over-release)`; no state change, no release event recorded.
- `adjust_capacity(pool_id, new_capacity, ...)` when Open or Suspended and `new_capacity ≥ allocated` → `capacity` updated to `new_capacity`; adjustment event appended; state unchanged.
- `adjust_capacity(pool_id, new_capacity, ...)` when Open or Suspended and `new_capacity < allocated` → `rejected(over-allocated)`; no change, no event.
- `adjust_capacity(pool_id, ..., ...)` when Closed → `rejected(closed)`.
- `suspend_pool(pool_id, ...)` when Open → **Suspended**; state-change event appended.
- `suspend_pool(pool_id, ...)` when Suspended → `rejected(not-open)`.
- `suspend_pool(pool_id, ...)` when Closed → `rejected(already-closed)`.
- `resume_pool(pool_id, ...)` when Suspended → **Open**; state-change event appended.
- `resume_pool(pool_id, ...)` when Open → `rejected(not-suspended)`.
- `resume_pool(pool_id, ...)` when Closed → `rejected(already-closed)`.
- `close_pool(pool_id, ...)` when Open or Suspended → **Closed**; state-change event appended.
- `close_pool(pool_id, ...)` when Closed → `rejected(already-closed)`.
- `query(pool_id)` (any state) → returns the pool's current `capacity`, `allocated`, `available`, and `state`. Does not modify state; does not produce an audit event (queries are not logged at this layer; the composing Event Log handles per-query telemetry if needed).

### Flow

**Standard allocation cycle — happy path:**

1. An operator calls `declare_pool(capacity=100, declaring_actor_ref="ops_admin_3", reason="hotel-room-pool-floor-2-2026-may") → pool_id = pool_h2`. The pool is in Open with capacity = 100 and allocated = 0.
2. A reservation system calls `allocate(pool_h2, count=1, allocating_actor_ref="reservation_svc")` for each new booking. Each call increments `allocated` by 1 and returns an `allocation_event_id`. When `allocated = 100`, subsequent allocate calls receive `rejected(over-capacity)` until a release occurs.
3. As bookings are cancelled or stays complete, the reservation system calls `release(pool_h2, count=1, releasing_actor_ref="reservation_svc")`. Each call decrements `allocated` by 1 and returns a `release_event_id`.
4. The capacity for next season expands to 120. An operator calls `adjust_capacity(pool_h2, new_capacity=120, adjusting_actor_ref="ops_admin_3", reason="floor-renovation-added-20-rooms") → adjustment_event_id`. The pool's capacity is now 120; `allocated` is unchanged.
5. End-of-season: `close_pool(pool_h2, closing_actor_ref="ops_admin_3", reason="floor-decommissioned-renovation-permanent") → state_change_id`. The pool enters Closed; no further allocations admitted; releases of remaining bookings still proceed until `allocated = 0`.

**Suspension and resumption — operational hold:**

1. A connection pool is declared with capacity = 50 for a database-backed service.
2. A maintenance window begins; the DBA calls `suspend_pool(conn_pool_1, suspending_actor_ref="dba_07", reason="db-failover-2026-05-14-0200-utc") → state_change_id`. New `allocate` calls are rejected with `suspended`; existing in-flight connections may still call `release` to unwind cleanly.
3. The failover completes; the DBA calls `resume_pool(conn_pool_1, resuming_actor_ref="dba_07", reason="failover-complete-2026-05-14-0235-utc") → state_change_id`. The pool returns to Open; new allocations proceed.

**Capacity downgrade rejected — preserving the invariant:**

1. A pool has capacity = 100 and currently allocated = 80.
2. An operator attempts to lower the capacity to 60: `adjust_capacity(pool_id, new_capacity=60, ...) → rejected(over-allocated)`. The atom rejects because `60 < 80` would violate the capacity constraint for the currently-allocated units. The operator must first release units (or wait for releases to occur) until `allocated ≤ 60`, then re-attempt the adjustment.

This is the *preserve-by-precondition* discipline: the atom enforces the constraint by rejecting actions that would violate it, never by silently clamping a value to fit. The caller owns the resolution policy — release first, then adjust; or accept that the desired downgrade is currently infeasible.

### Decision points

**Uniform validation rule.** Across all actions, every required string field (actor references, reasons) must be non-null, non-empty, and non-whitespace-only; otherwise `rejected(invalid-request)`. Every required integer field (`capacity`, `count`, `new_capacity`) must be of the correct sign (non-negative for `capacity` and `new_capacity`; positive for `count`); otherwise `rejected(invalid-request)`.

**At `declare_pool(capacity, declaring_actor_ref, reason)`:** All three fields must satisfy the uniform validation rule (with `capacity` non-negative integer); otherwise `rejected(invalid-request)`. If the pool store write fails, `rejected(storage-failure)` — no pool record is created.

**At `allocate(pool_id, count, allocating_actor_ref)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. The pool must be in Open state. If Suspended, `rejected(suspended)`. If Closed, `rejected(closed)`. `count` and `allocating_actor_ref` must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. The arithmetic precondition is: `allocated + count ≤ capacity`. If `allocated + count > capacity`, `rejected(over-capacity)`. If the write fails, `rejected(storage-failure)` — `allocated` and the audit log are unchanged.

**At `release(pool_id, count, releasing_actor_ref)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. `release` is permitted in all three states (Open, Suspended, Closed) — releases of in-flight allocations must succeed regardless of pool state so the running count can be cleanly unwound. `count` and `releasing_actor_ref` must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. The arithmetic precondition is: `count ≤ allocated`. If `count > allocated`, `rejected(over-release)` — releasing more than is allocated would violate the non-negativity invariant and almost certainly indicates a coordination bug at the caller. If the write fails, `rejected(storage-failure)`.

**At `adjust_capacity(pool_id, new_capacity, adjusting_actor_ref, reason)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. The pool must not be Closed; otherwise `rejected(closed)`. All four fields must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. The arithmetic precondition is: `new_capacity ≥ allocated`. If `new_capacity < allocated`, `rejected(over-allocated)` — the requested capacity would put the pool's already-allocated units over the bound, violating the capacity constraint. The atom enforces by precondition, never by clamping. If the write fails, `rejected(storage-failure)`.

**At `suspend_pool(pool_id, suspending_actor_ref, reason)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. The pool must be in Open state. If Suspended, `rejected(not-open)`. If Closed, `rejected(already-closed)`. Field validation as above. If the write fails, `rejected(storage-failure)`.

**At `resume_pool(pool_id, resuming_actor_ref, reason)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. The pool must be in Suspended state. If Open, `rejected(not-suspended)`. If Closed, `rejected(already-closed)`. Field validation as above. If the write fails, `rejected(storage-failure)`.

**At `close_pool(pool_id, closing_actor_ref, reason)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. The pool must not already be Closed; otherwise `rejected(already-closed)`. Field validation as above. If the write fails, `rejected(storage-failure)`.

**At `query(pool_id)`:** `pool_id` must reference a known pool; otherwise `rejected(not-known)`. Query does not modify state and does not produce an audit-log entry at this layer.

**Priority ordering among rejection reasons:** For any action, `not-known` is checked before state-validity checks; state-validity checks are checked before field-format checks; field-format checks are checked before arithmetic preconditions (over-capacity, over-release, over-allocated); all checks precede the store write. Field-format precedes arithmetic because the arithmetic preconditions (`allocated + count ≤ capacity`, `count ≤ allocated`, `new_capacity ≥ allocated`) require the integer fields to be well-formed before they can be meaningfully evaluated — an `allocate(pool_id, count=-5, ...)` against an Open pool returns `invalid-request` (count is not a positive integer) rather than passing the arithmetic check by happenstance and then rejecting on field-format afterwards.

### Behavior

Observed behavior, derived from how operational and regulated systems use bounded resource pools:

`allocate` increments the running total by the requested count, atomically with respect to other concurrent calls under the host environment's serialization guarantees. Two concurrent allocates against a pool with one unit of headroom resolve serially — whichever wins the race produces an allocation event; the loser receives `over-capacity`. The atom does not implement fairness policy (FIFO, priority, lottery); the host environment's serialization order is what determines the outcome.

`release` decrements the running total by the requested count. The atom accepts releases of any positive count up to the current `allocated`. A release of exactly the currently-allocated amount drives `allocated` to zero; subsequent releases are rejected with `over-release` until new allocations occur. The atom does not validate that the released count matches any prior allocation count — units are fungible. A caller that allocates 5 in one call and 3 in another may release in any combination summing to no more than 8.

`adjust_capacity` modifies the bound without modifying the running total. An upward adjustment (`new_capacity > current_capacity`) is always accepted (subject to field-validation). A downward adjustment is accepted only if `new_capacity ≥ allocated`; otherwise rejected with `over-allocated`. The atom does not permit silent clamping (set capacity to allocated count) or forced eviction (release units to fit the lower capacity) — those are policy decisions the caller must make explicitly via additional `release` calls before re-attempting the adjustment.

`suspend_pool` halts new allocations without unwinding existing ones. Use cases: maintenance windows, regulatory holds (a credit pool suspended pending compliance review), operational pauses (a connection pool suspended during failover). Releases remain admissible; capacity adjustments remain admissible (operators can re-tune capacity while the pool is paused). The pool's running total is unchanged by the suspend itself.

`close_pool` is terminal. Once closed, no new allocations and no capacity adjustments are admitted. Releases remain admissible so the pool's running total stays consistent with the composing patterns whose per-allocation records may still be unwinding when close occurs (see Invariant 3's defended-in-line rationale). The pool record persists in Closed indefinitely; retention and archival are a composing concern.

`query` is read-only. It returns the pool's current capacity, allocated count, available (= capacity − allocated), and state. The query is not logged at this layer; the composing Event Log handles per-query telemetry if a deployment needs it. Queries are not subject to the pool's state — a Closed pool's data remains queryable for as long as the record persists.

No action modifies declaration fields (`pool_id`, `declared_at`, `declaring_actor_ref`, `declaration_reason`) after `declare_pool`. The declaration captures the pool's origin; subsequent changes (capacity adjustment, state transition) layer on top via the audit log without overwriting the declaration record.

### Feedback

Each successful action produces an observable, measurable change:

- After `declare_pool` — a new pool appears in Open with the supplied capacity, `allocated = 0`, and fresh `pool_id`. Total pool count increases by one.
- After `allocate` — `allocated` increments by the supplied count. An allocation event appears in the audit log with a fresh `allocation_event_id` (returned to the caller), the count, the actor, and a wall-time `recorded_at`. `available` (queryable via `query`) decreases by the same count.
- After `release` — `allocated` decrements by the supplied count. A release event appears in the audit log with a fresh `release_event_id` (returned to the caller). `available` increases by the same count.
- After `adjust_capacity` — `capacity` is replaced by the supplied `new_capacity`. An adjustment event appears in the audit log with a fresh `adjustment_event_id` (returned to the caller), naming the prior and new capacities, the actor, the reason. `available` may change as a side effect of the new capacity (it is recomputed as `capacity − allocated`).
- After `suspend_pool`, `resume_pool`, `close_pool` — the pool's state is the new state. A state-change event appears in the audit log with a fresh `state_change_id` (returned to the caller), naming prior state, new state, actor, reason. Pool counts segmented by state shift accordingly.

Each rejected action produces an observable refusal with a named reason. The pool-count segmentation (Open, Suspended, Closed) is computable from the pool record set at any time; the running-total state of each pool is exposed via `query`.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

**Invariant 1 — Pool record permanence.** Once declared, a pool record is never deleted from the system. The `pool_id` returned by a successful `declare_pool` call is durably persisted and remains in the system indefinitely, regardless of subsequent state transitions including `close_pool`. A `storage-failure` rejection on `declare_pool` guarantees no partial record was written.

**Invariant 2 — State membership exclusivity.** Every pool known to the system is in exactly one of {Open, Suspended, Closed} at all times.

**Invariant 3 — Closed is absorbing for state transitions and for new allocations.** Once a pool enters Closed, no action transitions it elsewhere. `allocate`, `adjust_capacity`, `suspend_pool`, and `resume_pool` against a Closed pool are rejected. `release` is the single mutating action admitted in Closed; the running total can be decremented by composing patterns unwinding in-flight allocations. The rationale is cross-pattern data consistency: composing patterns such as Provisional Commitment maintain per-allocation records that may still be in non-terminal states (e.g., Held) when `close_pool` is called. When those per-allocation records reach their own terminal states (Released, Expired), the composing system calls `release` on the pool to keep the pool's running total aligned with the truth on the composing side. Rejecting `release` in Closed would not block the composing pattern from reaching its terminal states — Provisional Commitment's terminal transitions are internal to it — but it would permanently strand the pool's running total at its close-time value, producing an audit log whose final `allocated` figure does not match any observable reality. Permitting `release` in Closed preserves the data-consistency property without weakening the state-machine's terminal semantics for the operationally-meaningful transitions (suspend/resume/close, allocate, adjust_capacity).

**Invariant 4 — Capacity constraint.** For every pool at every instant, `allocated ≤ capacity`. The atom enforces this by precondition on `allocate` (rejects if `allocated + count > capacity`) and on `adjust_capacity` (rejects if `new_capacity < allocated`). There is no action sequence the atom accepts that produces a state with `allocated > capacity`. This is the load-bearing arithmetic invariant; it is what composing patterns may rely on without re-implementing the constraint.

**Invariant 5 — Non-negativity.** For every pool at every instant, `allocated ≥ 0`. The atom enforces this by precondition on `release` (rejects if `count > allocated`). There is no action sequence the atom accepts that produces a negative running total.

**Invariant 6 — Capacity non-negativity.** For every pool at every instant, `capacity ≥ 0`. The atom enforces this by precondition on `declare_pool` and `adjust_capacity` (both reject negative values).

**Invariant 7 — Declaration fields immutable.** `pool_id`, `declared_at`, `declaring_actor_ref`, and `declaration_reason` are set on `declare_pool` and never change.

**Invariant 8 — Audit-log events are immutable.** Once recorded, an allocation, release, adjustment, or state-change event's fields (event id, pool id, count or capacity values, prior/new state where applicable, acting actor reference, reason where applicable, recorded-at timestamp) never change.

**Invariant 9 — Audit-log events are append-only in insertion order.** Events are only added to the pool's audit log in insertion order; no event is removed and no event is inserted before any prior event. The log grows monotonically in length.

**Invariant 10 — State-change events are auditable.** Every transition (Open → Suspended, Suspended → Open, any non-Closed → Closed) produces a durable state-change entry in the pool's audit log with a fresh `state_change_id`, naming the prior state, new state, acting actor reference, reason, and timestamp. No state transition is silent.

**Invariant 11 — Capacity-adjustment events are auditable.** Every capacity change produces a durable adjustment entry in the audit log with a fresh `adjustment_event_id`, naming the prior capacity, the new capacity, the acting actor reference, reason, and timestamp. No capacity change is silent.

**Invariant 12 — Id stability.** A pool's `pool_id` is set on `declare_pool` and never changes. An allocation, release, adjustment, or state-change event's id is set when the event is written and never changes.

**Invariant 13 — No id reuse.** No two pools share a `pool_id`; no two events of the same class share an event id; no event id is reused across classes — across the lifetime of the system.

**Invariant 14 — Action atomicity.** Each action either commits all of its intended records — pool record (for `declare_pool`), audit-log event (for `allocate`, `release`, `adjust_capacity`, `suspend_pool`, `resume_pool`, `close_pool`), running-total or capacity or state update — or none. A `storage-failure` rejection on any action guarantees no partial record, across any record type written by that action, has been persisted. The total count of pool records is monotonically non-decreasing.

Invariants 4 and 5 together give the *bounded-arithmetic* property — at every reachable state, `0 ≤ allocated ≤ capacity`. This is the property composing patterns may treat as a precondition; without it, every caller would have to defend the bound at every call site. Invariants 8, 9, 10, and 11 together give the *full-audit* property — every change to the pool's capacity, allocation count, or state is recorded as an immutable append-only event with attribution, and the change history is reconstructable from the records alone. Invariant 3 gives the *terminal closure* property — a closed pool cannot be silently reopened, and post-close cleanup via `release` is the only post-terminal mutation permitted.

---

## Examples

The same atom, five domains, identical mechanic.

### Airline — non-overbooking seat pool

A regional carrier configures its booking system to enforce strict no-overbooking for a 50-seat regional jet.

1. `declare_pool(capacity=50, declaring_actor_ref="rev_mgmt_4", reason="flight-NK1234-2026-05-14-seat-inventory") → pool_id = pool_f1234`
2. Reservations arrive. Each successful ticket purchase invokes `allocate(pool_f1234, count=1, allocating_actor_ref="booking_svc") → allocation_event_id`. After 50 successful allocates, `allocated = 50`.
3. The 51st purchase attempt: `allocate(pool_f1234, count=1, ...) → rejected(over-capacity)`. The booking system surfaces the failure to the customer; no allocation event is recorded.
4. A cancellation: `release(pool_f1234, count=1, releasing_actor_ref="booking_svc") → release_event_id`. `allocated = 49`; one more seat is available.
5. Post-departure, the carrier closes the pool: `close_pool(pool_f1234, closing_actor_ref="rev_mgmt_4", reason="flight-departed-on-time") → state_change_id`. Refund-driven releases for the next 24 hours remain admissible against the closed pool; new bookings are not.

### Banking — credit-limit headroom

A retail bank configures a per-customer credit pool corresponding to the customer's declared credit line.

1. `declare_pool(capacity=10000, declaring_actor_ref="credit_mgr_2", reason="customer-c882-credit-line-usd-10k") → pool_id = pool_c882`
2. The customer makes purchases. Each authorization invokes `allocate(pool_c882, count=<amount in cents>, allocating_actor_ref="auth_svc") → allocation_event_id`.
3. A purchase that would exceed the limit: `allocate(pool_c882, count=500000, ...) → rejected(over-capacity)`. The card network surfaces the decline to the merchant.
4. Settlements (the underlying authorizations clearing as posted transactions) leave the running-total unchanged at this atom — the composing Provisional Commitment plus Settlement Posting pattern handles the per-authorization lifecycle.
5. The customer's credit limit is raised by the bank: `adjust_capacity(pool_c882, new_capacity=15000, adjusting_actor_ref="credit_mgr_2", reason="credit-line-increase-approved-2026-05-14") → adjustment_event_id`. New authorizations now consume against a capacity of $15,000.
6. The customer closes the account: `close_pool(pool_c882, closing_actor_ref="credit_mgr_2", reason="account-closure-customer-request-2026-05-14") → state_change_id`. In-flight authorizations may still settle via release; new authorizations are rejected.

### Healthcare — ward bed pool

A hospital ward configures a bed-management pool with capacity equal to the ward's bed count.

1. `declare_pool(capacity=24, declaring_actor_ref="ward_admin_h7", reason="ward-3w-bed-inventory") → pool_id = pool_ward_3w`
2. Admissions invoke `allocate(pool_ward_3w, count=1, allocating_actor_ref="admissions_svc")`. Discharges invoke `release(...)`.
3. A renovation removes 4 beds for two weeks: `adjust_capacity(pool_ward_3w, new_capacity=20, adjusting_actor_ref="ward_admin_h7", reason="renovation-rooms-308-311-closed-2026-05-14-to-05-28") → adjustment_event_id`. If 22 patients are currently admitted (`allocated = 22`), the adjustment fails: `rejected(over-allocated)` — the operator must first transfer 2 patients out (releases) before lowering the capacity.
4. A respiratory-illness surge triggers operational suspension of new admissions while the ward reorganizes: `suspend_pool(pool_ward_3w, suspending_actor_ref="ward_admin_h7", reason="resp-illness-surge-cohort-reorganization-2026-05-14") → state_change_id`. New admissions are rejected; existing patients can still be discharged (release).

### Database operations — connection pool

A service operator declares a connection pool with capacity = 50 concurrent connections.

1. `declare_pool(capacity=50, declaring_actor_ref="ops_4", reason="primary-db-conn-pool-svc-orders") → pool_id = pool_conn_primary`
2. Each connection acquisition invokes `allocate(pool_conn_primary, count=1, allocating_actor_ref="orders_svc") → allocation_event_id`. The acquisition-event id is returned to the caller for use as a follow-up release key.
3. Connection release invokes `release(pool_conn_primary, count=1, releasing_actor_ref="orders_svc")`. Releases are not bound to specific acquisition events at this atom's layer — the count is the surface; the composing per-connection lifecycle (if needed) lives outside.
4. The DB undergoes failover: `suspend_pool(pool_conn_primary, suspending_actor_ref="ops_4", reason="failover-2026-05-14-0200-utc") → state_change_id`. New connections are rejected during the window; in-flight connections may complete and release.
5. Failover finishes: `resume_pool(pool_conn_primary, resuming_actor_ref="ops_4", reason="failover-complete-2026-05-14-0235-utc") → state_change_id`. Pool returns to Open.

### Warehouse — inventory pool

A fulfillment center configures a per-SKU inventory pool tracking units physically on-hand.

1. `declare_pool(capacity=500, declaring_actor_ref="wh_mgr_3", reason="sku-laptop-z4500-fc-west") → pool_id = pool_sku_z4500`
2. Each order line invokes `allocate(pool_sku_z4500, count=<order quantity>, allocating_actor_ref="oms_svc")`. Successful allocates produce pick tickets in the composing system.
3. An order is cancelled before fulfillment: `release(pool_sku_z4500, count=<cancelled quantity>, releasing_actor_ref="oms_svc")`. The units return to availability.
4. A receiving event adds 100 units to inventory: `adjust_capacity(pool_sku_z4500, new_capacity=600, adjusting_actor_ref="wh_mgr_3", reason="receiving-po-12399-100-units-2026-05-14") → adjustment_event_id`. New orders can now consume against the higher capacity.

The mechanic is identical across all five. What differs: what a "unit" means (a seat, a cent of credit, a bed, a connection, a physical unit of stock), the rate of allocate/release calls, and the composing patterns that handle the per-allocation lifecycle.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit — "show me every allocation that took the pool over its declared capacity."** An auditor querying a credit-line pool under SOX scope (or an airline seat pool under no-overbooking commitments, or a healthcare bed pool under licensed-capacity rules) asks the structural question: at any point in the pool's history, did `allocated` exceed `capacity`? The answer is recoverable from records alone — the auditor replays the audit log in insertion order, maintaining the running `(capacity, allocated)` pair across each allocation event, release event, and capacity-adjustment event. Invariant 4 is the structural guarantee: there is no action sequence the atom accepts that produces `allocated > capacity`, so the audit query returns the empty set for a clean implementation. A non-empty result is evidence either of a bug in the atom's enforcement or of a host-environment serialization failure under concurrency — both auditor-actionable findings. Invariants 8 and 9 (audit-log immutability and append-only insertion order) foreclose the possibility that a violation was recorded and then erased.

**Disputed transaction — "the customer claims their credit limit was exceeded on this specific transaction; show me the running total and capacity at the event index of the disputed allocation."** The bank's compliance team retrieves the allocation event whose `allocation_event_id` matches the disputed transaction's pool-allocation reference. The investigator replays the audit log in insertion order up to (but not including) that event; the running `(capacity, allocated)` pair at that point is the answer to "what was the pool's state when this allocation was admitted?" Invariant 11 (capacity-adjustment auditability) ensures the capacity in effect at that event is reconstructable — any prior `adjust_capacity` events name the prior and new capacities with attribution. If the running total + the disputed count exceeded capacity at that event index, the atom's records will not show the allocation event at all (the precondition would have rejected with `over-capacity`); if the records do show the allocation event, the structural answer is that the allocation was admitted under the capacity then in effect.

**Breach or incident investigation — "during the breach window, were any unauthorized allocations placed against the pool, or were any unauthorized capacity adjustments made?"** An investigator filters the audit log by event index (or, when Trusted Timestamping is composed, by wall-time) and inspects each event's `*_actor_ref` against the expected actor population. Unexpected attributions (allocations by an actor outside the authorized set, adjustments by an actor outside the operator set) are immediate findings. The append-only, immutable-event discipline (Invariants 8, 9) forecloses the possibility that an attacker altered the audit log to conceal unauthorized events; any gap in event-index continuity is itself a finding. The state-change events (Invariant 10) anchor the investigation to the pool's state at each window boundary.

---

## Generation acceptance

A derived implementation of Capacity Constraint Enforcement is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the pool record set and its audit log, can do all of the following without recourse to source code, runbooks, or developer narration:

**Reconstruct the pool's full state at any point in insertion order.** Replay the audit log forward in insertion order from `declare_pool`, maintaining the running `(capacity, allocated, state)` triple across each event. Invariants 8, 9, 10, 11, and 14 together guarantee the replay is complete, append-only, and atomic. When the Trusted Timestamping composition binds insertion order to verifiable wall-time, the auditor can also arrive at the pool's state as of any given wall-time instant; without that composition, the reconstruction is event-index-authoritative and timestamps are advisory.

**Verify the capacity constraint holds at every event index.** For every allocation event in the log, the `(allocated_before_this_event + count)` must satisfy `≤ capacity_in_effect_at_this_event_index`. Invariant 4 is structurally enforced by the atom's allocate precondition; the auditor's query is a finite walk over the log returning the empty set for clean records. The capacity in effect at any event index is derivable from the audit log: it is the capacity declared at `declare_pool` adjusted by every `adjust_capacity` event preceding the current event in insertion order.

**Verify the non-negativity invariant holds at every event index.** For every release event, the `count` must satisfy `≤ allocated_before_this_event`. Invariant 5 is enforced by the release precondition; the structural guarantee mirrors Invariant 4.

**Confirm every state change and every capacity adjustment is attributed to an actor with a reason.** Each state-change event (Invariant 10) and each capacity-adjustment event (Invariant 11) carries `acting_actor_ref` and `reason`. Allocation and release events carry `allocating_actor_ref` / `releasing_actor_ref` (no `reason` field — these are routine arithmetic operations). The auditor can trace every change to an attributing actor and, for policy-driven changes (suspend/resume/close/adjust), to a stated rationale.

**Identify the composing patterns active in this deployment.** Whether Provisional Commitment is wired in for per-allocation lifecycle, whether Duplicate Prevention is wired in for idempotent allocation under retry, whether Actor Identity is wired in for non-repudiable attribution, whether Trusted Timestamping is wired in for verifiable wall-time anchoring, whether Audit Trail is wired in for tamper-evident composite recording, and whether Retention Window is wired in for audit-log lifecycle.

---

## Edge cases and explicit non-goals

What this atom does not cover:

**Per-allocation identity.** Units are fungible at this atom's grain. An allocate of 5 units produces one allocation event with one id, not five sub-records or five allocation ids. If a caller needs to track specific resources (this seat, this bed, this connection handle), the composing Provisional Commitment atom supplies the per-allocation lifecycle; this atom supplies only the pool's arithmetic. The boundary is sharp: Provisional Commitment owns "this specific resource is held for this specific requester for this specific window"; Capacity Constraint Enforcement owns "the running total against the pool's bound." Reservation Lifecycle is the composition that wires them together.

**Fairness, priority, and contention policy.** Two concurrent allocates against a pool with one unit of headroom resolve under the host environment's serialization guarantees; whichever wins the race takes the unit, the loser receives `over-capacity`. The atom does not implement FIFO ordering, priority queueing, or any other fairness discipline. A deployment that needs fairness composes a Queueing or Priority Scheduling pattern in front of `allocate`.

**Preemption and eviction.** The atom does not evict existing allocations to make room for new ones. A high-priority allocate request against a fully-allocated pool is rejected with `over-capacity` regardless of any priority signal; the caller's options are to release something (which requires knowing what to release — a per-allocation concern) or to wait. Preemption logic — releasing the lowest-priority allocation to admit a higher-priority one — is a composing concern at a layer that has per-allocation identity to act on.

**Capacity bursting, overcommit, and soft limits.** Some operational systems permit short-term overcommit (the airline industry's overbooking practice, the database engine's connection-pool-with-burst headroom). This atom enforces a hard constraint and rejects on the bound; deployments needing overcommit compose with a separate Burst Capacity or Soft Limit pattern that maintains a tolerance margin and emits warning signals before hard rejection.

**Allocation expiry and per-allocation lifecycle.** The atom does not model allocations with a bounded lifetime. An allocate-without-corresponding-release leaves the units consumed indefinitely. A deployment that needs allocations to time out and auto-release composes with Provisional Commitment (which has Held/Confirmed/Released/Expired states) or with a Lease pattern; this atom handles the arithmetic regardless of which lifecycle pattern governs each allocation.

**Resource semantics.** What a "unit" represents — a seat, a bed, a dollar, a connection handle, a physical SKU — is a host-system policy decision encoded in the `count` values the caller passes. The atom does not interpret units beyond their arithmetic.

**Pool migration, merging, and splitting.** The atom does not provide actions to move units between pools or to merge two pools into one. A deployment that needs migration composes by closing the source pool and declaring a new one with adjusted capacity; the per-allocation re-allocation against the new pool is the composing system's concern.

**Notification on state change or near-capacity.** Pool transitions (Open → Suspended, drained-condition reached) may be operationally significant signals downstream — page the on-call, throttle upstream traffic, route to a fallback pool. The atom emits state-change events to its audit log; propagating those events to consumers composes with Subscription and Notification.

**Concurrency and atomicity.** Concurrent actions against the same `pool_id` resolve under the host environment's serialization guarantees. Each action's effects (running-total update, audit-log append) are atomic with respect to other concurrent calls — but the atom does not specify the serialization mechanism. Multi-action transactions (e.g., release-N-from-pool-A-and-allocate-N-to-pool-B atomically) belong to a Transaction composition.

**Integer arithmetic precision.** The atom traffics in non-negative integer capacity and positive integer counts; the load-bearing arithmetic invariant (Invariant 4) depends on `allocated + count` being computable without loss. Integer width (32-bit, 64-bit, arbitrary-precision) is a deployment-shaped concern. A deployment that uses fixed-width signed integers and admits `allocated + count > MAX_INT` could observe silent wraparound that violates Invariant 4 — the atom's precondition would compare a wrapped (negative) sum against `capacity`, see the comparison pass, and commit an allocation that puts the running total above capacity. Implementations are expected to use overflow-safe arithmetic (arbitrary-precision integers, or fixed-width with explicit overflow detection that surfaces as `invalid-request`); the atom does not specify the mechanism but the obligation lives with the deployment. Similar consideration applies to `release` (`allocated - count`, which can't go negative under the precondition, but the subtraction itself must be computed safely) and `adjust_capacity` (`new_capacity ≥ allocated`).

**Clock semantics.** Timestamps on audit-log events come from an implicit clock. Skew, monotonicity, and timezone handling are deployment concerns. Insertion order — not timestamp order — is the authoritative ordering for "after," "between," and "most recent" references; Trusted Timestamping composes to bind insertion order to externally-verifiable wall-time.

**Retention of audit-log entries.** Invariants 8 and 9 make the audit log append-only and immutable from the atom's perspective, but the atom does not set the retention policy for how long entries must remain queryable before archival. Composing systems whose regulators require multi-year retention of capacity-management evidence (SOX-scope credit-limit pools, FRCP-scope inventory adjustments) compose with Retention Window.

**Cross-pool invariants.** The atom maintains per-pool invariants. Cross-pool rules (e.g., "the sum of allocations across all flight pools serving a corridor cannot exceed the carrier's network-wide cap") are composing concerns at a layer that aggregates over pools.

Where the atom breaks down: when the underlying resource is not actually fungible at any meaningful grain (every seat is distinct because of legroom or premium status — at which point per-allocation identity belongs at this layer too, which is a sign the deployment wants Provisional Commitment, not this atom); when capacity is not a single integer but a multi-dimensional vector (memory bytes *and* CPU shares *and* network bandwidth — a generalized resource-bundle pool, not the single-resource pool this atom models); when the constraint must be probabilistic rather than hard (a TCP-style admission control with backoff — that's a Rate Limiter pattern, not this atom).

---

## Composition notes

Capacity Constraint Enforcement is freestanding and is designed to compose with other atoms rather than absorb their concerns:

- **[Provisional Commitment](./provisional-commitment.md)** — for the per-allocation lifecycle. The composing system calls `allocate` on a Capacity Constraint pool at the moment Provisional Commitment moves a commitment into Held; calls `release` at the moment the commitment moves to Released or Expired; the Confirmed transition does not release (the unit remains consumed in the binding allocation). The composition is realized as the [Reservation Lifecycle](../../compositions/idempotent-reservation.md) application *(C9 — forthcoming as a distinct composition once authored; the existing Idempotent Reservation composition is a precursor that uses Provisional Commitment + Duplicate Prevention but does not yet wire pool arithmetic)*. The boundary: Provisional Commitment owns per-commitment state and the absorbing terminal transitions; Capacity Constraint Enforcement owns the running total and the bound.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for idempotent allocation under retry. The composing system supplies an idempotency token; on a retry of `allocate` with the same token, Duplicate Prevention returns the prior `allocation_event_id` rather than producing a second allocation. The atom itself is not idempotent — a retry without the composition produces two allocations and double-counts the resource.
- **[Event Log](../temporal/event-log.md)** — for the full audit-able history of pool activity. The pool's internal audit log captures allocation, release, adjustment, and state-change events; Event Log composes when the deployment needs a unified system-wide event stream that includes pool-management events alongside other systems' events. The atom's internal audit log is the canonical record at the pool's grain; Event Log is the journal at the deployment's grain.
- **[Actor Identity](../compliance/actor-identity.md)** — for non-repudiable attribution. The atom's `*_actor_ref` fields supply attribution; Actor Identity supplies the cryptographic or procedural binding that makes the attribution survive a regulated audit. Each `allocate`, `release`, `adjust_capacity`, `suspend_pool`, `resume_pool`, and `close_pool` action's event id is the surface Actor Identity attests against.
- **[Retention Window](../compliance/retention-window.md)** — for governing how long audit-log entries remain actively accessible. Invariants 8 and 9 make the log durable from the atom's perspective; Retention Window owns the policy for archival and eventual purge under regulatory schedules. When the composing deployment's `*_actor_ref` or `reason` fields contain personally-identifying information (a credit-line pool's `declaration_reason` referencing a customer by id; a healthcare pool's `reason` naming a patient cohort), Retention Window may scrub those fields under GDPR Article 17 or post-retention obligations. The audit-identifier surface that survives scrubbing is: `pool_id`, all event ids (`allocation_event_id`, `release_event_id`, `adjustment_event_id`, `state_change_id`), `declared_at`, the per-event `recorded_at`, the arithmetic fields (`capacity`, `count`, `prior_capacity`, `new_capacity`, `prior_state`, `new_state`), and the event-class indicator. The arithmetic chain remains reconstructable across scrubbing — Invariant 4 is verifiable from the scrubbed records — while personally-identifying attribution is removable.
- **[Subscription](../messaging/subscription.md) + [Notification](../messaging/notification.md)** — for propagating pool state changes (Open → Suspended, drained-condition reached, capacity adjusted) to downstream consumers. Composes via the existing Notification Fanout pattern.
- **Burst Capacity / Soft Limit** *(forthcoming)* — for deployments that need to permit short-term overcommit with warnings before hard rejection. Wraps `allocate` with a tolerance margin and emits warnings before rejecting at the burst bound.
- **Queueing / Priority Scheduling** *(forthcoming)* — for deployments that need fairness or priority under contention. Sits in front of `allocate` and orders concurrent requests before they hit the atom's serialization layer.
- **Reservation Lifecycle (C9)** *(forthcoming)* — the canonical composition wiring this atom with Provisional Commitment and Duplicate Prevention to produce a full reservation arc.

---

## Standards references

Capacity Constraint Enforcement is a utility primitive; no single regulator owns capacity enforcement directly. Its standards relevance comes through composition with regulated patterns whose audit surface relies on the running-total invariant.

- **ISO 9001:2015 §8.1 (Operational planning and control)** — production systems must operate within declared capacity boundaries; the atom is the structural enforcement for that obligation when the constrained resource is a production asset (manufacturing-line slots, certified-operator headroom, equipment utilization).
- **Basel III Liquidity Coverage Ratio (BCBS 238)** — bank credit-line and counterparty-limit pools must be enforced as hard constraints with auditable adjustments; the atom is the operational form of a regulator-facing credit-limit headroom pool.
- **Sarbanes-Oxley §404 (Internal Control over Financial Reporting)** — where confirmed allocations against a pool are material to the books (credit-limit consumption flowing to the balance sheet, inventory allocation flowing to cost-of-goods-sold), the controls around pool adjustments and the audit trail of who-allocated-what-when become SOX-scope. Composes with Audit Trail to produce the records-alone-defensible evidence §404 attestations require.
- **PCI DSS Requirement 10 (Logging and monitoring)** — when the pool governs payment-related capacity (a payment-gateway connection pool, a card-authorization headroom pool), every allocation and state change must be logged with attribution. The atom's audit-log invariants supply the structural form.
- **The Joint Commission, *Provision of Care, Treatment, and Services*** — healthcare bed-management and ward-capacity standards require capacity changes (closures for renovation, surge expansions) to be auditable with attribution and reason. The atom's `adjust_capacity` event-recording discipline is the operational form.
- **GDPR Article 30 (Records of processing)** — where the pool's allocation events touch personal data (per-customer credit-line pools, per-patient bed allocations referencing the patient by id), the audit log is itself a processing activity subject to controller-records obligations. Composes with Audit Trail and Retention Window for the full obligation surface.

The atom inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture and the explicit refusal to absorb per-allocation identity, fairness policy, preemption, and overcommit.
- **Eiffel's design-by-contract** — preconditions on each action, named rejection reasons, and the *preserve-by-precondition* discipline (rejecting actions that would violate an invariant rather than silently clamping).
- **Database connection pooling and operating-system semaphore conventions** — the count-up / count-down arithmetic the atom abstracts; here exposed as visible business state rather than hidden inside a transactional or kernel primitive.
- **Token-bucket and leaky-bucket rate-limiter constructions** — for the kinship the atom has with rate-limit enforcement; the rate-limit pattern is a sibling primitive with time-varying capacity rather than a fixed bound.

---

## Status

`partially resolved` — foundation round complete (Pass 1 GRID, Pass 2 EOS, Pass 3 Linus all author-led; findings closed in-pattern). AI-conducted adversarial round and Phase 4 Opus clearance gate pending. Authored 2026-05-14.

---

## Lineage notes

Capacity Constraint Enforcement is atom #8 in the ROADMAP's draft order and the third entry in `atoms/resource-lifecycle/` after Provisional Commitment and Soft Delete. The closest existing pattern is Provisional Commitment — same category, same kind of resource-encumbrance concern — and the draft mirrors its shape, identity-model discipline, and authoring conventions. The regulated-overlay conventions (Regulated adversarial scenarios, Generation acceptance) are included per the methodology's required-when clause — three of the five domain examples (airline, banking, healthcare) invoke regulated domains. The conventions are inherited from the methodology directly rather than re-derived from predecessor patterns.

The composing forthcoming-link debts named in this draft are: Reservation Lifecycle (C9), Burst Capacity / Soft Limit, Queueing / Priority Scheduling. None are yet authored. The existing Composition notes in Provisional Commitment named Capacity Constraint Enforcement as a forthcoming composing atom; that link will resolve in Provisional Commitment's next touch-triggered re-pass.

**Pass 1 — Structural completeness (GRID). One finding, closed in-pattern.**

All nine GRID nodes were checked against the MUSE v1.1 completeness rules; reference graph walked to confirm Friction → Flow, Decision → State/Behavior, and Proof → Intent links are intact.

- *Intent* — testable: Invariant 4 (capacity constraint) and Invariant 5 (non-negativity) are falsifiable from records via the queryable running-total and audit-log surfaces. ✓
- *System* — references real components: Provisional Commitment, Duplicate Prevention, Event Log, Actor Identity, Retention Window, Subscription, Notification are all grounded atoms or compositions. ✓
- *Friction* — rejection reasons (`over-capacity`, `over-release`, `over-allocated`, `suspended`, `closed`, `not-known`, `not-open`, `not-suspended`, `already-closed`, `invalid-request`, `storage-failure`) each reference a specific action's Decision points. ✓
- *Flow* — three flow paths named (standard allocation cycle, suspension and resumption, capacity downgrade rejected) with start, branches, and end. ✓
- *Decision* — each Decision points entry links to a state predicate, an arithmetic precondition, or a field-format check. Priority ordering among rejection reasons explicit. ✓
- *Feedback* — every successful action and rejected action produces a measurable, observable signal. ✓
- *State* — three states named with all transitions enumerated; the choice to collapse "Drained" from the roadmap's anticipated four states into a derived arithmetic condition was made consciously and defended in the State section. ✓
- *Behavior* — observable, action-by-action; the *preserve-by-precondition* discipline named explicitly. ✓
- *Proof* — fourteen invariants, numbered, descriptively named; Invariant 4 (capacity constraint) named as load-bearing. ✓

**One finding, closed in-pattern.** The initial draft was silent on the relationship between `close_pool` and `release`. The action signature in Inputs/Outputs listed `release(...) → release_event_id | rejected(not-known | over-release | invalid-request | storage-failure)` — no state-validity rejection at all — but it was not clear whether this was intentional (releases admitted in every state including Closed, for unwinding) or an oversight (Closed should reject releases the way it rejects other mutations). The transitions table said one thing implicitly (releases listed for "any state including Closed"); the action signature said another by omission. Resolved: the spec now states the design choice explicitly in three places — the action signature deliberately omits state-validity rejections; the Decision points entry for `release` names the policy ("`release` is permitted in all three states") with a Behavior-section rationale; Invariant 3 (Closed is absorbing for state transitions and for new allocations) frames `release` as the single mutating action admitted post-Closed. The reference graph re-walk after this fix is clean: Invariant 3 links to the State section's Closed-state description; the *Friction* surface (`closed` rejection from `allocate` and `adjust_capacity`) explicitly does not appear for `release`; Decision points names the asymmetry as a deliberate design choice.

**Pass 2 — Conceptual independence (EOS). Clean.**

Concerns examined for over-absorption:

- *Audit log as part of the atom*. The four event classes (allocation, release, adjustment, state-change) accumulate on the pool as a sub-record. Tested against Event Log: this audit log is tightly bound to the pool's lifecycle — each event references the pool, carries pool-specific fields, and the log is queryable as a sub-record. Analogous to Party Identity's verification event list and state-change log, which Party Identity's Pass 2 also kept as part of the atom. Correctly internal.
- *The state machine integrated with the arithmetic*. Tested whether Open/Suspended/Closed should be extracted as a separate "Operational Lifecycle" atom. The state machine is bound to allocate-acceptance semantics — Suspended specifically means "rejects new allocations regardless of capacity headroom." Splitting state and arithmetic into separate atoms would force a composition rule ("Suspended rejects allocate") that is exactly what binds them together; that's over-engineering. Correctly integrated.
- *Idempotency under retry* — generic; composes with Duplicate Prevention. Correctly external.
- *Non-repudiation* — generic; composes with Actor Identity. Correctly external.
- *Fairness, priority, eviction under contention* — generic across scheduling and resource-management contexts; named as forthcoming composing patterns. Correctly external.
- *Burst capacity / soft limits / overcommit* — distinct policy from hard-constraint enforcement; named as forthcoming. Correctly external.
- *Notification of state changes* — generic; composes with Subscription + Notification. Correctly external.
- *Retention of audit-log entries* — generic; composes with Retention Window. Correctly external.
- *Per-allocation lifecycle* — the load-bearing EOS boundary. Provisional Commitment owns "this specific resource is held for this specific requester for this specific window"; Capacity Constraint Enforcement owns "the running total against the pool's bound." Confirmed external.

No over-absorptions.

**Pass 3 — Adversarial scrutiny (Linus mode). Five findings, all closed in-pattern.**

- *Priority ordering listed arithmetic before field-format.* The Decision points priority sequence said "state-validity → arithmetic preconditions → field-format → store write." But the arithmetic preconditions (`allocated + count ≤ capacity`, `count ≤ allocated`, `new_capacity ≥ allocated`) require the integer fields to be well-formed before they can be evaluated — an `allocate(pool_id, count=-5, ...)` with a negative count would pass the arithmetic check (because `allocated + (-5) ≤ capacity` for any non-negative `allocated`) and only be rejected at the subsequent field-format check, which is a backwards ordering. Resolved: the priority order now reads "not-known → state-validity → field-format → arithmetic preconditions → store write," with the rationale stated in-line.

- *Integer overflow / arithmetic precision not addressed.* The atom traffics in non-negative integer capacity and positive integer counts; the load-bearing arithmetic invariant (Invariant 4) depends on `allocated + count` being computable without silent wraparound. The foundation draft did not name integer width as a deployment concern. Resolved: a new *Integer arithmetic precision* edge case names the obligation — deployments must use overflow-safe arithmetic (arbitrary-precision integers, or fixed-width with explicit overflow detection that surfaces as `invalid-request`) — and acknowledges that Invariant 4 is contingent on this discipline at the host.

- *The defense for `release` admitted in Closed was framed in terms that don't hold up.* The foundation draft justified the asymmetry as "the per-allocation lifecycle in composing patterns (Provisional Commitment) could not reach its terminal states without a side channel." But Provisional Commitment's terminal transitions (Released, Expired) are entirely internal to it — they do not depend on the pool atom accepting a release. The defense conflated two different concerns. Resolved: Invariant 3's rationale rewritten to focus on the real concern — *cross-pattern data consistency*. When composing patterns maintain per-allocation records that may still be in non-terminal states when `close_pool` is called, their eventual terminal transitions trigger pool releases that keep the pool's running total aligned with the truth on the composing side. Rejecting `release` in Closed would not block the composing pattern from terminating, but would permanently strand the pool's running total at its close-time value, producing an audit log whose final `allocated` figure does not match any observable reality. The Behavior section's `close_pool` paragraph also rewritten to reference the corrected rationale rather than restate the original.

- *Regulated overlay was wrongly omitted in the foundation draft.* The draft argued the atom is a utility primitive whose acceptance bar is not directly set by a regulator and therefore that the overlay was optional. But three of the five domain examples (airline non-overbooking under DOT-scope, banking credit-limit headroom under SOX and Basel III scope, healthcare ward bed pool under HIPAA and Joint Commission scope) invoke regulated domains, and the methodology's *When the conventions apply* clause explicitly names "patterns elsewhere whose examples invoke regulated domains (banking, healthcare, payments, hospitality with personal data, airline reservations)" as required. The atom's load-bearing arithmetic invariant (Invariant 4) is exactly the kind of structural guarantee a regulator audits — the foundation draft's omission was a hidden decision that the methodology forecloses. Resolved: a new *Regulated adversarial scenarios* subsection added under Examples (walking regulator audit of capacity-violation history, disputed-transaction reconstruction of running total at event index, and breach investigation of unauthorized allocations and adjustments); a new *Generation acceptance* section added (five checks an external auditor can perform against the records alone). Both conventions inherited from the methodology directly, not re-derived from predecessor atoms.

- *Retention Window scrubbing surface not specified.* Per the F6 discipline established by Party Identity, an atom whose composing Retention Window may anonymize personally-identifying fields should name what survives scrubbing and what may be removed. The foundation draft punted to "Retention Window owns the policy for archival and eventual purge under regulatory schedules" without distinguishing the audit-identifier surface from the scrubbable surface. Resolved: the Composition notes entry for Retention Window now names the surviving audit-identifier set explicitly (`pool_id`, all event ids, `declared_at`, per-event `recorded_at`, arithmetic fields, event-class indicator) and identifies which fields may be scrubbed when they contain personally-identifying information (`*_actor_ref` fields and `reason` fields, when the deployment encodes such information into them). The arithmetic chain (Invariant 4 verification) remains reconstructable across scrubbing.

The atom is stronger because all three foundation passes ran. GRID caught the action-signature/transitions inconsistency on `release` in Closed. EOS confirmed the audit log and state machine are correctly part of the atom and confirmed the per-allocation-identity boundary against Provisional Commitment. Linus caught the priority-ordering inversion, the integer-overflow silence, the weak defense for release-in-Closed, the unjustified omission of the regulated overlay, and the missing scrubbing-surface specification. The methodology's required AI-conducted adversarial round (Phase 3) and Phase 4 Opus clearance gate remain pending.
