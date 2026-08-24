---
title: Capacity Constraint Enforcement
parent: Atomic Concepts
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


## Summary

Capacity Constraint Enforcement keeps a count of a limited resource from ever going over its limit. Each "pool" is declared with a [Capacity] — the most units that can be in use at once — and starts empty. Asking for units (an [Allocate]) adds to the running count; giving them back (a [Release]) subtracts. Any request that would push the count over the limit is refused at the door, before it is recorded — the pattern never quietly fudges the number to make it fit. That single guarantee — used units never exceed the declared limit — is the whole point. Other patterns can lean on it without re-checking the limit themselves. A pool can be [Open] (taking requests), [Suspended] (paused — refusing new requests but still accepting returns), or [Closed] (shut for good, though returns still go through so in-flight work can wind down). The units are interchangeable: the pool only tracks how many are in use, not which seat or bed or connection — that detail belongs to a separate pattern. Every successful change is written to a permanent, attributed log with a before-and-after count, so an auditor can confirm any single step stayed within the limit without replaying the whole history. The same mechanism fits airline seats, bank credit limits, hospital beds, database connections, and warehouse stock.

---

## Intent

Many regulated and operational systems must enforce a hard arithmetic bound on a shared, finite resource: an airline cannot ticket more passengers than the aircraft's seats; a bank cannot extend credit beyond a customer's declared limit; a hospital ward cannot admit more patients than its bed count; a connection pool cannot allocate more concurrent connections than the database supports; a warehouse cannot pick more units than are on the shelf. The shape is constant — declared capacity, accumulating allocations, hard rejection on over-capacity, releases returning units to availability — even though the resource semantics vary across domains.

Capacity Constraint Enforcement isolates that arithmetic into a single primitive. It owns one rule and one rule only: at every instant, the sum of currently-allocated units against any pool is less than or equal to that pool's declared capacity. Allocations that would violate the rule are rejected at the boundary; releases decrement the running count; capacity may be adjusted upward freely and downward only when the new capacity still admits the current allocation count.

The pattern is distinct from Provisional Commitment. Provisional Commitment owns the *per-allocation* lifecycle — a specific resource is held for a specific requester for a bounded window, with an opaque commitment id and the absorbing terminal states Confirmed / Released / Expired. Capacity Constraint Enforcement owns the *pool-aggregate* arithmetic — the total allocated count against a declared bound, with no per-allocation identity at this layer. The two atoms compose in the obvious way: Provisional Commitment supplies the per-commitment record; Capacity Constraint Enforcement supplies the gate that prevents the pool's running total from exceeding capacity when the commitment is placed. Reserve from Pool is the composition that wires them together. Each atom remains freestanding.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state machine (a model that tracks which named states a record moves through: Open ⇄ Suspended; either non-Closed state → Closed via `close_pool`), its own actions (`declare_pool`, `allocate`, `release`, `adjust_capacity`, `suspend_pool`, `resume_pool`, `close_pool`, `query`), and its own invariants (the arithmetic bound, the audit-log immutability, the state-change auditability). It does not implement per-allocation identity, fairness or eviction policy under contention, preemption, capacity bursting or overcommit, allocation expiry, or the resource semantics that determine what a "unit" means. Each is a composing concept. See Composition notes.

---

## Structure

### Identity model

Every pool known to the system has a **[Pool Id]** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it) and produced by [Declare Pool]. The id is the pool's identity; the [Declaring Actor Ref], [Declared At] timestamp, and [Declaration Reason] are immutable *properties* of the pool record, set at creation.

The opaque-id model is load-bearing for two reasons. First, the *name* a deployment might use for a pool (e.g., `"flight-NK1234-2026-05-14-seats"` or `"connection-pool-primary"`) is a host-system concept: pools may be re-named, re-categorized, or re-tagged without the pool's identity changing. Second, two pools with the same human-readable label — declared in different deployment regions or against different resource registries — must have distinct ids so their arithmetic does not merge. Using a content field as identity would silently conflate logical-rename and distinct-pool cases.

Each [Allocate] call produces an **[Allocation Event Id]** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not minted inside it). Each [Release] call produces a **[Release Event Id]**. Each [Adjust Capacity] call produces an **[Adjustment Event Id]**. Each [Suspend Pool], [Resume Pool], or [Close Pool] call produces a **[State Change Id]**. All four event-id classes are sub-records of the pool, accumulating on the pool's audit log in insertion order, each individually addressable so that composing patterns (Actor Identity attestation, Audit Trail recording, Reserve from Pool's per-commitment cross-reference) can reference a specific event by id without depending on timestamp or position.

Units are fungible at this atom's grain — the atom does not assign or track per-allocation identities. An `allocate(pool_id, count=5, ...)` call increments the running total by five and emits one allocation event with one id; it does not produce five sub-records or five allocation ids. A subsequent `release(pool_id, count=5, ...)` decrements the running total by five and emits one release event with one id. The composing pattern (Provisional Commitment, or whatever owns the per-allocation lifecycle in the host system) supplies the per-allocation identity; this atom owns only the pool's arithmetic.

### Inputs and Outputs

- A [Capacity] value — a non-negative integer naming the maximum total allocation the pool admits. Zero is allowed (a pool that admits no allocations until its capacity is adjusted upward).
- A [Count] — a positive integer naming how many units an [Allocate] or [Release] call operates on.
- A [New Capacity] value — a non-negative integer supplied to [Adjust Capacity].
- A declaring / allocating / releasing / adjusting / suspending / resuming / closing actor reference — an opaque pointer to the internal actor performing the action. Non-empty, non-whitespace-only. Attribution only; non-repudiable proof composes with Actor Identity.
- A [Reason] — a non-empty, non-whitespace-only string of at most 2000 characters, required on [Declare Pool], [Adjust Capacity], [Suspend Pool], [Resume Pool], [Close Pool]. Not required on [Allocate] or [Release] (those are routine arithmetic operations; the audit value of a per-allocation reason is low and would clutter the event log).
- Actions:
  - `declare_pool(capacity, declaring_actor_ref, reason) → pool_id | rejected(invalid-request | storage-failure)`
  - `allocate(pool_id, count, allocating_actor_ref) → allocation_event_id | rejected(not-known | over-capacity | suspended | closed | invalid-request | storage-failure)`
  - `release(pool_id, count, releasing_actor_ref) → release_event_id | rejected(not-known | over-release | invalid-request | storage-failure)`
  - `adjust_capacity(pool_id, new_capacity, adjusting_actor_ref, reason) → adjustment_event_id | rejected(not-known | closed | over-allocated | invalid-request | storage-failure)`
  - `suspend_pool(pool_id, suspending_actor_ref, reason) → state_change_id | rejected(not-known | not-open | already-closed | invalid-request | storage-failure)`
  - `resume_pool(pool_id, resuming_actor_ref, reason) → state_change_id | rejected(not-known | not-suspended | already-closed | invalid-request | storage-failure)`
  - `close_pool(pool_id, closing_actor_ref, reason) → state_change_id | rejected(not-known | already-closed | invalid-request | storage-failure)`
  - `query(pool_id) → {capacity, allocated, available, state} | rejected(not-known)`
- A clock providing wall-time timestamps and an id source for [Pool Id] and event-id allocation, both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the fresh id ([Pool Id], [Allocation Event Id], [Release Event Id], [Adjustment Event Id], or [State Change Id]) at the seam before the transition runs; the pure transition receives [Now] (clock time as a human would read it) and the id as injected inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic. The clock enters at a single seam (the execution contract injects `clock_t` there, so the seam is not a signature parameter, and none of the action signatures above carries a [Now] parameter); [Now] is consumed for exactly one purpose — stamping immutable write timestamps inside a committed transition ([Declared At] on [Declare Pool], and each audit-log event's [Recorded At]). No guard in this atom consults the clock: every precondition is a state, field-format, or arithmetic check.

**On [Declare Pool]:** [Capacity] must be a non-negative integer; otherwise [Invalid Request]. [Declaring Actor Ref] and [Reason] must satisfy the uniform validation rule below.

**On [Allocate]:** [Count] must be a positive integer (at least 1); otherwise [Invalid Request]. [Allocating Actor Ref] must satisfy the uniform validation rule. The atom does not permit zero-unit allocations — a no-op allocate is not a legitimate use of the action.

**On [Release]:** [Count] must be a positive integer; otherwise [Invalid Request]. [Releasing Actor Ref] must satisfy the uniform validation rule.

**On [Adjust Capacity]:** [New Capacity] must be a non-negative integer; otherwise [Invalid Request]. [New Capacity] must additionally differ from the pool's current [Capacity]; an adjust call with [New Capacity] equal to the current [Capacity] is rejected with [Invalid Request] — a no-op adjustment is not a legitimate use of the action and admitting it would emit a capacity-adjustment event with [Prior Capacity] equal to [New Capacity], cluttering the audit log with events that record no change. This mirrors the discipline [Allocate] and [Release] apply to [Count] (must be positive; zero-unit operations are not legitimate uses of those actions). [Adjusting Actor Ref] and [Reason] must satisfy the uniform validation rule.

**On [Suspend Pool], [Resume Pool], [Close Pool]:** `*_actor_ref` and [Reason] must satisfy the uniform validation rule.

**Outputs** — the atom's persisted state takes two forms with different read surfaces.

*The persisted pool record* — what the atom durably keeps for each declared pool — carries: [Pool Id], [Capacity] (current declared maximum), [Allocated] (current running total), [Available] (= [Capacity] − [Allocated]), current [State], [Declared At], [Declaring Actor Ref], [Declaration Reason], and the full audit log (allocation events, release events, capacity-adjustment events, state-change events, in insertion order). This is the shape audit pipelines, regulator queries, and composing patterns read against; it is the surface the Generation acceptance checks operate on.

*The runtime read surface* exposed to allocation-hot-path callers is [Query] — (Projected contract: `query(pool_id) → {capacity, allocated, available, state}`) — a deliberately narrow projection of four fields. The projection is deliberate: callers in the allocation hot path need the current bound and headroom for routing or admission decisions, not the declaration metadata or the audit log on every call. Declaration fields and the audit log are read through composing surfaces — Audit Trail's tamper-evident composite, Event Log's deployment-grain journal, or direct inspection of the persisted record by audit pipelines — not through [Query]. A reader who needs the full record reads the persisted record directly via the audit surface; a reader who needs the live arithmetic state reads [Query].

All four event classes in the persisted pool record carry before/after snapshots for the quantity they mutate, symmetric across the audit-log surface:

- Allocation events: [Allocation Event Id], [Pool Id], [Count], [Allocated Before], [Allocated After] (= [Allocated Before] + [Count]), [Allocating Actor Ref], [Recorded At].
- Release events: [Release Event Id], [Pool Id], [Count], [Allocated Before], [Allocated After] (= [Allocated Before] − [Count]), [Releasing Actor Ref], [Recorded At].
- Capacity-adjustment events: [Adjustment Event Id], [Pool Id], [Prior Capacity], [New Capacity], [Adjusting Actor Ref], [Reason], [Recorded At].
- State-change events: [State Change Id], [Pool Id], [Prior State], [New State], [Acting Actor Ref], [Reason], [Recorded At].

The before/after symmetry is load-bearing for Generation acceptance: an auditor inspecting a single event can verify Invariant 4 (allocate: [Allocated After] ≤ capacity in effect) or Invariant 5 (release: [Allocated After] ≥ 0) without replaying the entire log to that point. Replay remains authoritative under Invariant 9 — the snapshots are a witness to the arithmetic, not a substitute for it.

Action returns: the event id created (per the action signatures above) so the caller has the id in hand without a follow-up query — required for passing to Actor Identity for attestation and to Audit Trail for tamper-evident recording.

### State

A pool, once declared, occupies exactly one of three states:

- **[Open]** — the pool accepts [Allocate] calls subject to the capacity constraint (allocations that would push [Allocated] + [Count] > [Capacity] are rejected with [Over Capacity]; the pool remains [Open]). Entry state for every newly declared pool.
- **[Suspended]** — the pool rejects all new [Allocate] calls regardless of capacity headroom. [Release] calls are still accepted (in-flight allocations can be cleanly unwound). [Adjust Capacity] is still accepted (capacity can be revised before resumption). Reached via [Suspend Pool]; left via [Resume Pool] (back to [Open]) or [Close Pool] (terminal).
- **[Closed]** — terminal. The pool rejects new [Allocate] calls and new [Adjust Capacity] calls. [Release] calls are still accepted so callers can unwind in-flight allocations; this is the only post-[Closed] mutation permitted. The pool record persists indefinitely from the atom's perspective.

**Drained is not a state.** The arithmetic condition [Allocated] == [Capacity] is observable via [Query] (returns [Available] = 0) and is the precondition that causes [Allocate] to reject with [Over Capacity]. Treating it as a state would conflate a policy decision (an actor deciding to stop new allocations) with an arithmetic property (the running total has reached the bound). The state machine names policy-driven transitions only; arithmetic conditions are derived.

**Ordering.** The pool's audit log is ordered by insertion sequence. References elsewhere in this spec to "after the most recent X," "between X and Y," or "most recent X" mean by insertion order, not by timestamp order. Timestamps on log entries are best-effort wall-time metadata sourced from the seam-injected [Now]; under skew or clock adjustment, timestamps may not be monotonic. Composing with Trusted Timestamping binds insertion order to externally-verifiable wall-time; without that composition, timestamps are advisory and insertion order is authoritative.

Each pool record carries:

- **[Pool Id]** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on [Declare Pool]. Never changes.
- **[Declared At]** — wall-time of declaration. Set on [Declare Pool]. Never changes.
- **[Declaring Actor Ref]** — set on [Declare Pool]. Never changes.
- **[Declaration Reason]** — set on [Declare Pool]. Never changes.
- **[Capacity]** — current declared maximum. Set on [Declare Pool]; modified only by [Adjust Capacity].
- **[Allocated]** — current running total. Modified only by [Allocate] (incremented) and [Release] (decremented).
- **current [State]** — one of {[Open], [Suspended], [Closed]}. Modified only by [Suspend Pool], [Resume Pool], [Close Pool].
- **audit log** — ordered, append-only list of allocation events, release events, capacity-adjustment events, and state-change events. Each entry is individually addressable by its respective event id.

Transitions — each successful write appends one audit-log event and stamps its [Recorded At] from the seam-injected [Now]; no transition reads a clock internally, and no guard below consults one:

| action | from state | guard | effect | result |
|--------|-----------|-------|--------|--------|
| [Declare Pool] | *(no record)* | — | pool created in **[Open]**; injected [Pool Id]; [Declared At] = [Now]; [Allocated] = 0; [Capacity] = supplied | [Pool Id] |
| [Allocate] | [Open] | [Allocated] + [Count] ≤ [Capacity] | [Allocated] += [Count]; allocation event appended; state unchanged | [Allocation Event Id] |
| [Allocate] | [Open] | [Allocated] + [Count] > [Capacity] | none | [Over Capacity] |
| [Allocate] | [Suspended] | — | none | [Suspended] |
| [Allocate] | [Closed] | — | none | [Closed] |
| [Release] | any (incl. [Closed]) | [Count] ≤ [Allocated] | [Allocated] −= [Count]; release event appended; state unchanged | [Release Event Id] |
| [Release] | any | [Count] > [Allocated] | none | [Over Release] |
| [Adjust Capacity] | [Open] / [Suspended] | [New Capacity] ≠ current ∧ ≥ [Allocated] | [Capacity] = [New Capacity]; adjustment event appended; state unchanged | [Adjustment Event Id] |
| [Adjust Capacity] | [Open] / [Suspended] | [New Capacity] = current | none | [Invalid Request] |
| [Adjust Capacity] | [Open] / [Suspended] | [New Capacity] < [Allocated] | none | [Over Allocated] |
| [Adjust Capacity] | [Closed] | — | none | [Closed] |
| [Suspend Pool] | [Open] | — | → **[Suspended]**; state-change event appended | [State Change Id] |
| [Suspend Pool] | [Suspended] | — | none | [Not Open] |
| [Suspend Pool] | [Closed] | — | none | [Already Closed] |
| [Resume Pool] | [Suspended] | — | → **[Open]**; state-change event appended | [State Change Id] |
| [Resume Pool] | [Open] | — | none | [Not Suspended] |
| [Resume Pool] | [Closed] | — | none | [Already Closed] |
| [Close Pool] | [Open] / [Suspended] | — | → **[Closed]**; state-change event appended | [State Change Id] |
| [Close Pool] | [Closed] | — | none | [Already Closed] |
| [Query] *(read-only — not a transition)* | any | — | none; no audit event | snapshot {[Capacity], [Allocated], [Available], [State]} |

Three semantics the cells cannot hold:

- *A rejected action writes nothing.* Every `none`-effect row above leaves [Allocated], [Capacity], [State], and the audit log unchanged — no event is recorded for a rejected call (see *Edge cases → Rejection visibility*). The atom enforces by precondition, never by silently clamping a value to fit.
- *[Release] is the one mutation admitted in every state.* It is accepted in [Open], [Suspended], and [Closed] so composing patterns can unwind in-flight allocations after the pool is suspended or closed (Invariant 3's rationale).
- *Store-write failure and rejection priority.* If a write fails after preconditions pass, the action returns [Storage Failure] with no partial commit (Invariant 14). The fixed rejection-priority order ([Not Known] → state-validity → field-format → arithmetic precondition → store write) is in Decision points, where the full per-action preconditions stay.

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

**Logic confinement (clock and id).** The clock and the ids are **injected inputs at the I/O seam**, never produced inside a transition and never passed as action parameters. [Now] (`clock_t`) is read once by the pipeline and injected at the seam before the transition runs; the [Pool Id] and the four event-id classes ([Allocation Event Id], [Release Event Id], [Adjustment Event Id], [State Change Id]) are the injected `id_t`, host-allocated at the same seam. Because the clock is pipeline-injected at the seam rather than threaded through the caller signatures, none of the eight action signatures carries a [Now] parameter. In this atom [Now] is consumed for exactly one purpose — stamping immutable write timestamps inside a committed transition: [Declared At] on [Declare Pool], and [Recorded At] on each allocation, release, capacity-adjustment, and state-change event. **No guard reads it.** Every precondition below is a state check ([Not Known], [Suspended], [Closed], [Not Open], [Not Suspended], [Already Closed]), a field-format check ([Invalid Request]), or an arithmetic check on stored integers ([Over Capacity], [Over Release], [Over Allocated]) — none is time-gated, so no rejection in this atom's taxonomy depends on the clock reading, and a stale or skewed [Now] can only make a timestamp advisory, never admit or refuse a call. Ordering follows from insertion sequence, not from [Now] (see *State → Ordering*).

**Uniform validation rule.** Across all actions, every required string field (actor references, reasons) must be non-null, non-empty, and non-whitespace-only; otherwise [Invalid Request]. String validation operates on the Unicode codepoint sequence: *non-empty* means at least one codepoint; *non-whitespace-only* means at least one codepoint outside the Unicode whitespace category (`\p{White_Space}`); the 2000-character cap for reasons is a codepoint count, not a byte length, so multi-byte scripts are not penalized against single-byte ASCII (American Standard Code for Information Interchange — the basic English-character encoding). The atom additionally rejects with `invalid-request` any string field containing control characters (Unicode general category `Cc`: `U+0000`–`U+001F`, `U+007F`, `U+0080`–`U+009F`), zero-width characters (`U+200B`–`U+200D`, `U+FEFF`), or bidi-override characters (`U+202A`–`U+202E`, `U+2066`–`U+2069`) — the rationale is regulator-readability: a `reason` field whose contents are control bytes, zero-width-only, or bidi-spoofed is invisibly empty or deceptively rendered to a human auditor reading the records, and admitting such values would pass the atom's syntactic check while failing the audit-surface intent the field exists to serve. Unicode normalization (NFC and NFKC — Normalization Forms C and KC, the Unicode standard's canonical forms for giving equivalent characters one standard byte sequence; others) is *not* applied by the atom — it stores the codepoint sequence as supplied; deployments under regulators that require comparison or deduplication on string fields apply normalization at the deployment boundary before passing to the atom, and the atom records the normalized form. The atom does not perform case-folding on any string field — [Acting Actor Ref] values that differ in case are distinct attribution surfaces to the atom; deployments requiring case-insensitive actor identity normalize at the boundary. Every required integer field ([Capacity], [Count], [New Capacity]) must be of the correct sign (non-negative for [Capacity] and [New Capacity]; positive for [Count]); otherwise [Invalid Request].

**At [Declare Pool]:** All three fields must satisfy the uniform validation rule (with [Capacity] a non-negative integer); otherwise [Invalid Request]. If the pool store write fails, [Storage Failure] — no pool record is created.

**At [Allocate]:** [Pool Id] must reference a known pool; otherwise [Not Known]. The pool must be in [Open] state. If [Suspended], rejected [Suspended]. If [Closed], rejected [Closed]. [Count] and [Allocating Actor Ref] must satisfy the uniform validation rule; otherwise [Invalid Request]. The arithmetic precondition is: [Allocated] + [Count] ≤ [Capacity]. If [Allocated] + [Count] > [Capacity], [Over Capacity]. If the write fails, [Storage Failure] — [Allocated] and the audit log are unchanged.

**At [Release]:** [Pool Id] must reference a known pool; otherwise [Not Known]. [Release] is permitted in all three states ([Open], [Suspended], [Closed]) — releases of in-flight allocations must succeed regardless of pool state so the running count can be cleanly unwound. [Count] and [Releasing Actor Ref] must satisfy the uniform validation rule; otherwise [Invalid Request]. The arithmetic precondition is: [Count] ≤ [Allocated]. If [Count] > [Allocated], [Over Release] — releasing more than is allocated would violate the non-negativity invariant and almost certainly indicates a coordination bug at the caller. If the write fails, [Storage Failure].

**At [Adjust Capacity]:** [Pool Id] must reference a known pool; otherwise [Not Known]. The pool must not be [Closed]; otherwise rejected [Closed]. All four fields must satisfy the uniform validation rule; in addition, [New Capacity] must differ from the pool's current [Capacity] — an adjust whose new value equals the current value is a no-op and is rejected with [Invalid Request] rather than admitted (audit-log hygiene, asymmetry-resolution with allocate/release positive-count rule). The arithmetic precondition is: [New Capacity] ≥ [Allocated]. If [New Capacity] < [Allocated], [Over Allocated] — the requested capacity would put the pool's already-allocated units over the bound, violating the capacity constraint. The atom enforces by precondition, never by clamping. If the write fails, [Storage Failure].

**At [Suspend Pool]:** [Pool Id] must reference a known pool; otherwise [Not Known]. The pool must be in [Open] state. If [Suspended], [Not Open]. If [Closed], [Already Closed]. Field validation as above. If the write fails, [Storage Failure].

**At [Resume Pool]:** [Pool Id] must reference a known pool; otherwise [Not Known]. The pool must be in [Suspended] state. If [Open], [Not Suspended]. If [Closed], [Already Closed]. Field validation as above. If the write fails, [Storage Failure].

**At [Close Pool]:** [Pool Id] must reference a known pool; otherwise [Not Known]. The pool must not already be [Closed]; otherwise [Already Closed]. Field validation as above. If the write fails, [Storage Failure].

**At [Query]:** [Pool Id] must reference a known pool; otherwise [Not Known]. Query does not modify state and does not produce an audit-log entry at this layer.

**Priority ordering among rejection reasons:** For any action, [Not Known] is checked before state-validity checks; state-validity checks are checked before field-format checks; field-format checks are checked before arithmetic preconditions ([Over Capacity], [Over Release], [Over Allocated]); all checks precede the store write. Each ordering decision is defended in-line.

*[Not Known] first* because every other check presupposes a real pool record to inspect. A call against an unknown [Pool Id] has no state, no current [Allocated], no [Capacity] to compare against — none of the subsequent checks are meaningful.

*State-validity before field-format* because the pool's state is a structural property of the call's target, whereas field-format is local to the specific call. A [Closed] pool is a target that does not accept [Allocate] or [Adjust Capacity] calls at all; reporting [Closed] to the caller communicates "this target is unusable for this action" before per-call fields are validated against the same target. The convention mirrors how databases reject "table does not exist" before "your column type is wrong" — target-level structural rejections precede call-level structural rejections. The cost of this ordering is that a caller passing a malformed [Count] against a [Closed] pool sees [Closed] and not [Invalid Request]; the caller's malformation is masked until they retry against a non-[Closed] pool. The cost is accepted because the alternative — field-format first — forces every call to be validated against the pool's per-call surface before the caller learns the target is fundamentally unusable, which is the noisier path for the common case (operators draining a pool, callers trying to use a decommissioned pool).

*Field-format before arithmetic* because the arithmetic preconditions ([Allocated] + [Count] ≤ [Capacity], [Count] ≤ [Allocated], [New Capacity] ≥ [Allocated]) require the integer fields to be well-formed before they can be meaningfully evaluated — an `allocate(pool_id, count=-5, ...)` against an [Open] pool returns [Invalid Request] ([Count] is not a positive integer) rather than passing the arithmetic check by happenstance (because [Allocated] + (−5) ≤ [Capacity] holds for any non-negative [Allocated]) and then rejecting on field-format afterwards.

*Store write last* because all in-memory checks precede any durable side effect; a [Storage Failure] rejection carries the same all-or-none guarantee as the precondition rejections (no partial commit, no audit-log entry written, no running-total change).

### Behavior

Observed behavior, derived from how operational and regulated systems use bounded resource pools:

[Allocate] increments the running total by the requested [Count], atomically with respect to other concurrent calls under the host environment's serialization guarantees. Two concurrent allocates against a pool with one unit of headroom resolve serially — whichever wins the race produces an allocation event; the loser receives [Over Capacity]. The atom does not implement fairness policy (FIFO, priority, lottery); the host environment's serialization order is what determines the outcome.

[Release] decrements the running total by the requested [Count]. The atom accepts releases of any positive count up to the current [Allocated]. A release of exactly the currently-allocated amount drives [Allocated] to zero; subsequent releases are rejected with [Over Release] until new allocations occur. The atom does not validate that the released count matches any prior allocation count — units are fungible. A caller that allocates 5 in one call and 3 in another may release in any combination summing to no more than 8.

[Adjust Capacity] modifies the bound without modifying the running total. An upward adjustment ([New Capacity] > current [Capacity]) is always accepted (subject to field-validation). A downward adjustment ([New Capacity] < current [Capacity]) is accepted only if [New Capacity] ≥ [Allocated]; otherwise rejected with [Over Allocated]. A same-value adjustment ([New Capacity] = current [Capacity]) is rejected with [Invalid Request] — a no-op adjustment is not a legitimate use of the action, mirroring the positive-count rule on allocate/release. The atom does not permit silent clamping (set capacity to allocated count) or forced eviction (release units to fit the lower capacity) — those are policy decisions the caller must make explicitly via additional [Release] calls before re-attempting the adjustment.

[Suspend Pool] halts new allocations without unwinding existing ones. Use cases: maintenance windows, regulatory holds (a credit pool suspended pending compliance review), operational pauses (a connection pool suspended during failover). Releases remain admissible; capacity adjustments remain admissible (operators can re-tune capacity while the pool is paused). The pool's running total is unchanged by the suspend itself.

[Close Pool] is terminal. Once closed, no new allocations and no capacity adjustments are admitted. Releases remain admissible so the pool's running total stays consistent with the composing patterns whose per-allocation records may still be unwinding when close occurs (see Invariant 3's defended-in-line rationale). The pool record persists in [Closed] indefinitely; retention and archival are a composing concept.

[Query] is read-only. It returns the pool's current [Capacity], [Allocated] count, [Available] (= [Capacity] − [Allocated]), and [State]. The query is not logged at this layer; the composing Event Log handles per-query telemetry if a deployment needs it. Queries are not subject to the pool's state — a [Closed] pool's data remains queryable for as long as the record persists.

No action modifies declaration fields ([Pool Id], [Declared At], [Declaring Actor Ref], [Declaration Reason]) after [Declare Pool]. The declaration captures the pool's origin; subsequent changes (capacity adjustment, state transition) layer on top via the audit log without overwriting the declaration record.

### Feedback

Each successful action produces an observable, measurable change:

- After [Declare Pool] — a new pool appears in [Open] with the supplied [Capacity], [Allocated] = 0, and fresh [Pool Id]. Total pool count increases by one.
- After [Allocate] — [Allocated] increments by the supplied [Count]. An allocation event appears in the audit log with a fresh [Allocation Event Id] (returned to the caller), the [Count], the actor, a wall-time [Recorded At], and the [Allocated Before] / [Allocated After] snapshot. [Available] (queryable via [Query]) decreases by the same count.
- After [Release] — [Allocated] decrements by the supplied [Count]. A release event appears in the audit log with a fresh [Release Event Id] (returned to the caller), the [Count], the actor, a wall-time [Recorded At], and the [Allocated Before] / [Allocated After] snapshot. [Available] increases by the same count.
- After [Adjust Capacity] — [Capacity] is replaced by the supplied [New Capacity]. An adjustment event appears in the audit log with a fresh [Adjustment Event Id] (returned to the caller), naming the prior and new capacities, the actor, the reason. [Available] may change as a side effect of the new capacity (it is recomputed as [Capacity] − [Allocated]).
- After [Suspend Pool], [Resume Pool], [Close Pool] — the pool's state is the new state. A state-change event appears in the audit log with a fresh [State Change Id] (returned to the caller), naming [Prior State], [New State], actor, reason. Pool counts segmented by state shift accordingly.

Each rejected action produces an observable refusal with a named reason. The pool-count segmentation ([Open], [Suspended], [Closed]) is computable from the pool record set at any time; the running-total state of each pool is exposed via [Query].

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

**Invariant 1 — Pool record permanence under this atom's actions; the composed-system view is bounded by the deployment's retention policy.** The atom defines no action that removes a pool record. Once declared by a successful [Declare Pool] call, the [Pool Id] is durably persisted and remains in the system through every subsequent state transition including [Close Pool]; no atom-defined action deletes the record at any point in its lifecycle. A [Storage Failure] rejection on [Declare Pool] guarantees no partial record was written. Under composition with Retention Window — which applies to the pool record itself as well as to the audit log — the composed-system view may differ: pool records whose state has been [Closed] for longer than the deployment's retention schedule for closed-pool records may be archived to cold storage or purged entirely, mirroring Invariant 9's treatment of audit-log entries. The atom's contribution is the durability discipline (no atom-defined action removes a pool record); the deployment's Retention Window policy is the other half of what determines whether a regulator querying a stale [Pool Id] receives [Not Known] because the pool was never declared or because its record was purged — the rejection surface is identical to the caller (named explicitly in *Examples → Rejection paths → [Not Known]*), and the regulator distinguishes the two by reading the deployment's retention manifest, not the atom's records.

**Invariant 2 — State membership exclusivity.** Every pool known to the system is in exactly one of {[Open], [Suspended], [Closed]} at all times.

**Invariant 3 — Closed is absorbing for state transitions and for new allocations.** Once a pool enters [Closed], no action transitions it elsewhere. [Allocate], [Adjust Capacity], [Suspend Pool], and [Resume Pool] against a [Closed] pool are rejected. [Release] is the single mutating action admitted in [Closed]; the running total can be decremented by composing patterns unwinding in-flight allocations. The rationale is cross-pattern data consistency: composing patterns such as Provisional Commitment maintain per-allocation records that may still be in non-terminal states (e.g., Held) when [Close Pool] is called. When those per-allocation records reach their own terminal states (Released, Expired), the composing system calls [Release] on the pool to keep the pool's running total aligned with the truth on the composing side. Rejecting [Release] in [Closed] would not block the composing pattern from reaching its terminal states — Provisional Commitment's terminal transitions are internal to it — but it would permanently strand the pool's running total at its close-time value, producing an audit log whose final [Allocated] figure does not match any observable reality. Permitting [Release] in [Closed] preserves the data-consistency property without weakening the state-machine's terminal semantics for the operationally-meaningful transitions (suspend/resume/close, [Allocate], [Adjust Capacity]).

**Invariant 4 — Capacity constraint.** For every pool at every instant, [Allocated] ≤ [Capacity], conditional on the host obligations the atom names as deployment-shaped concepts (see *Edge cases → Concurrency and atomicity (concurrent-call atomicity)*, *Edge cases → Crash atomicity (mid-action process failure)*, and *Edge cases → Integer arithmetic precision*): serializable concurrent execution against the same [Pool Id], crash-atomic multi-record writes across the action's audit-log entry and running-total update, and overflow-safe integer arithmetic for [Allocated] + [Count]. Under those conditions, the atom enforces the invariant by precondition on [Allocate] (rejects if [Allocated] + [Count] > [Capacity]) and on [Adjust Capacity] (rejects if [New Capacity] < [Allocated]); there is no action sequence the atom accepts that produces a state with [Allocated] > [Capacity]. This is the load-bearing arithmetic invariant; it is what composing patterns may rely on without re-implementing the constraint, *contingent on the named host obligations being met*. A deployment that violates any of the three obligations produces an environment in which the invariant can be observed to fail despite the atom's preconditions; such a failure is a deployment-side gap, not an atom-side guarantee failure, and the deployment's audit posture must acknowledge it as such.

**Invariant 5 — Non-negativity.** For every pool at every instant, [Allocated] ≥ 0. The atom enforces this by precondition on [Release] (rejects if [Count] > [Allocated]). There is no action sequence the atom accepts that produces a negative running total.

**Invariant 6 — Capacity non-negativity.** For every pool at every instant, [Capacity] ≥ 0. The atom enforces this by precondition on [Declare Pool] and [Adjust Capacity] (both reject negative values).

**Invariant 7 — Declaration fields immutable.** [Pool Id], [Declared At], [Declaring Actor Ref], and [Declaration Reason] are set on [Declare Pool] and never change.

**Invariant 8 — Audit-log events have two surfaces with distinct lifecycles.** Every recorded event has an *audit-identifier surface* — event id, [Pool Id], event class, arithmetic fields ([Count], [Allocated Before], [Allocated After], [Prior Capacity], [New Capacity]), state fields where applicable ([Prior State], [New State]), and [Recorded At] timestamp — that the atom defines no action to modify; and an *attribution surface* — `*_actor_ref` and [Reason] — that the atom likewise defines no action to modify but the composing Retention Window pattern may erase under GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Article 17 obligations when the deployment encodes personally-identifying information into those fields. Composing systems read the two surfaces with different lifecycles: the audit-identifier surface persists for as long as the event persists; the attribution surface persists until Retention Window scrubs it, after which the records still verify the arithmetic chain but no longer identify the actor. The split is structural, not stylistic — the audit-identifier surface is what makes the structural audit queries (Invariant 4 verification, Invariant 5 verification, capacity-adjustment replay, state-change replay) verifiable from records alone; the attribution surface is what makes the records personally-identifying and therefore subject to erasure obligations the audit chain must not depend on. A regulator reading the invariant must understand the operational reality: the atom's records are what the atom's actions write and never re-write, but under the Retention Window composition the atom recommends for regulated deployments, the attribution surface is by-design mutable on the composing pattern's schedule.

**Invariant 9 — Audit-log events are append-only under this atom's actions; the composed-system view is bounded by the deployment's retention policy.** The atom defines no action that removes an event from a pool's audit log, no action that re-orders events, and no action that inserts an event before any prior event. Under the atom's actions alone, the log grows monotonically in length and in insertion order. Under composition with Retention Window — the composition the atom recommends for every regulated deployment — events that fall outside the deployment's retention window may be archived to cold storage or purged entirely, and the composed-system view of the audit log is *bounded by the retention schedule, not by the atom's append-only discipline*. The arithmetic chain (Invariant 4 verification) is reconstructable from records within the active retention window; reconstruction of pre-retention history requires the archive when one exists, and is bounded out when purge has occurred without archive. The Generation acceptance section names the verification scope explicitly. The "under this atom's actions" qualifier is load-bearing: a regulator querying the records is reading the *composed-system* view, which the atom does not single-handedly govern; the atom's append-only discipline is necessary for the composed-system audit chain but not sufficient — the deployment's retention policy is the other half of what determines what the regulator sees.

**Invariant 10 — State-change events are auditable.** Every transition ([Open] → [Suspended], [Suspended] → [Open], any non-[Closed] → [Closed]) produces a durable state-change entry in the pool's audit log with a fresh [State Change Id], naming the [Prior State], [New State], [Acting Actor Ref], [Reason], and timestamp. No state transition is silent.

**Invariant 11 — Capacity-adjustment events are auditable.** Every capacity change produces a durable adjustment entry in the audit log with a fresh [Adjustment Event Id], naming the [Prior Capacity], the [New Capacity], the [Adjusting Actor Ref], [Reason], and timestamp. No capacity change is silent.

**Invariant 12 — Id stability.** A pool's [Pool Id] is set on [Declare Pool] and never changes. An allocation, release, adjustment, or state-change event's id is set when the event is written and never changes.

**Invariant 13 — No id reuse.** No two pools share a [Pool Id]; no two events of the same class share an event id; no event id is reused across classes — across the lifetime of the system.

**Invariant 14 — Action atomicity.** Each action either commits all of its intended records — pool record (for [Declare Pool]), audit-log event (for [Allocate], [Release], [Adjust Capacity], [Suspend Pool], [Resume Pool], [Close Pool]), running-total or capacity or state update — or none, conditional on the deployment providing crash-atomic multi-record writes (see *Edge cases → Crash atomicity (mid-action process failure)*). A [Storage Failure] rejection on any action guarantees no partial record, across any record type written by that action, has been persisted *under the return-value path* — the host's write subsystem surfaced failure and the action did not commit; the crash-atomicity obligation extends the same all-or-none property to the *no-return path* in which the host fails between the audit-log append and the running-total update with no rejection delivered to the caller. Under both paths the total count of pool records is monotonically non-decreasing. A deployment that does not meet the crash-atomicity obligation can produce recovered states in which some of an action's records committed and others did not; this is a deployment-side gap, not an atom-side guarantee failure.

Invariants 4 and 5 together give the *bounded-arithmetic* property — at every reachable state, 0 ≤ [Allocated] ≤ [Capacity], conditional on the host obligations Invariant 4 names. This is the property composing patterns may treat as a precondition under those obligations; without it, every caller would have to defend the bound at every call site. Invariants 8, 9, 10, and 11 together give the *successful-change-audit* property — every *successful* change to the pool's capacity, allocation count, or state is recorded as an event whose audit-identifier surface no atom-defined action modifies, in append-only insertion order under the atom's actions; the composed-system view is bounded by Retention Window per Invariants 1, 8, and 9. The change history of successful operations is reconstructable from the records within the active retention window per the per-event and absolute modes named in Generation acceptance. *Rejected* operations produce no event at this layer; deployments requiring rejection visibility (PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for handling cardholder data) Req. 10.2.4 invalid-access logging, breach-investigation traces of denied allocations) compose with Event Log around the atom's call surface. See *Edge cases and explicit non-goals → Rejection visibility* for the boundary. Invariant 3 gives the *terminal closure* property — a closed pool cannot be silently reopened, and post-close cleanup via [Release] is the only post-terminal mutation permitted.

---

## Examples

The same atom, five domains, identical mechanic.

### Airline — non-overbooking seat pool

A regional carrier configures its booking system to enforce strict no-overbooking for a 50-seat regional jet.

1. `declare_pool(capacity=50, declaring_actor_ref="rev_mgmt_4", reason="flight-NK1234-2026-05-14-seat-inventory") → pool_id = pool_f1234`
2. Reservations arrive. Each successful ticket purchase invokes `allocate(pool_f1234, count=1, allocating_actor_ref="booking_svc") → allocation_event_id`. After 50 successful allocates, `allocated = 50`.
3. The 51st purchase attempt: `allocate(pool_f1234, count=1, ...) → rejected(over-capacity)`. The booking system surfaces the failure to the customer; no allocation event is recorded.
4. A cancellation: `release(pool_f1234, count=1, releasing_actor_ref="booking_svc") → release_event_id`. `allocated = 49`; one more seat is available.
5. Post-departure, the carrier closes the pool: `close_pool(pool_f1234, closing_actor_ref="rev_mgmt_4", reason="flight-departed-on-time") → state_change_id`. Refund-driven releases within the carrier's refund window — a deployment-defined operational window, not enforced at the atom — remain admissible against the closed pool; new bookings are not. The atom itself admits `release` in Closed indefinitely; the bounded window is the deployment's policy.

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

### Rejection paths

The domain examples above exercise `over-capacity` (airline step 3, banking step 3) and `over-allocated` (healthcare step 3) rejections. The remaining named rejection reasons are exercised by the following scenarios. These walk the rejection surface that callers and composing patterns must handle without producing an audit-log event at this layer (see *Edge cases → Rejection visibility*).

**`over-release` — releasing more than is allocated.** A connection-pool client mistakenly tracks its own release count and double-releases: `release(pool_conn_primary, count=2, releasing_actor_ref="orders_svc")` when `allocated = 1`. The atom rejects with `over-release`; `allocated` remains 1, no event is recorded. The caller's coordination bug is signaled by the rejection reason; the running total stays consistent with reality.

**`suspended` — allocate against a suspended pool.** During the database failover window from the connection-pool example, a new request invokes `allocate(pool_conn_primary, count=1, allocating_actor_ref="orders_svc") → rejected(suspended)`. The orders service retries after the resume event, or routes to a fallback. No allocation event is recorded; the pool's running total is unchanged.

**`closed` — [Allocate] or [Adjust Capacity] against a closed pool.** After a carrier closes the flight pool, a late booking attempt: `allocate(pool_f1234, count=1, ...) → rejected(closed)`. Separately, an operator attempts to revise capacity on the same closed pool: `adjust_capacity(pool_f1234, new_capacity=55, ...) → rejected(closed)`. Both are rejected on state-validity before any field or arithmetic check; the pool's records are unchanged.

**`not-known` — action against an unknown [Pool Id].** A caller passes a stale or typo'd pool reference: `query(pool_garbage_id) → rejected(not-known)`. Same rejection for any action taking `pool_id`. The atom does not distinguish "never declared" from "purged by deployment policy" — the surface is the same.

**`already-closed` / `not-open` / `not-suspended` — state-prereq violations on lifecycle actions.** An operator double-closes a pool: `close_pool(pool_c882, ...) → rejected(already-closed)` on the second call. An operator attempts to resume a pool that's already Open: `resume_pool(pool_ward_3w, ...) → rejected(not-suspended)`. An operator attempts to suspend a closed pool: `suspend_pool(pool_f1234, ...) → rejected(already-closed)`. Each communicates the specific state-prereq failure; no state change occurs.

**`invalid-request` — malformed call against an otherwise-valid target.** An operator passes a negative count to allocate: `allocate(pool_conn_primary, count=-3, allocating_actor_ref="orders_svc")` against an Open pool. Per the priority ordering, the state check passes (Open) and the field-format check rejects with `invalid-request`. Same surface for empty actor references, whitespace-only reasons, non-integer capacity values, *and a no-op `adjust_capacity` whose `new_capacity` equals the pool's current `capacity`* — the call would not change the bound and is rejected at the boundary rather than admitted as an audit-log no-op.

**`storage-failure` — durable-write failure surfaces as a named rejection.** A transient write failure during `allocate` produces `rejected(storage-failure)`. Per Invariant 14, no partial record is persisted: the running total is unchanged, no audit-log entry exists. The caller's options are retry (typically via Duplicate Prevention composition to ensure idempotency) or treat the call as having failed cleanly.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit — "show me every allocation that took the pool over its declared capacity."** An auditor querying a credit-line pool under SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) scope (or an airline seat pool under no-overbooking commitments, or a healthcare bed pool under licensed-capacity rules) asks the structural question: at any point in the pool's history, did `allocated` exceed `capacity`? The answer is recoverable from records alone — the auditor replays the audit log in insertion order, maintaining the running `(capacity, allocated)` pair across each allocation event, release event, and capacity-adjustment event. Invariant 4 is the structural guarantee: there is no action sequence the atom accepts that produces `allocated > capacity`, so the audit query returns the empty set for a clean implementation. A non-empty result is evidence either of a bug in the atom's enforcement or of a host-environment serialization failure under concurrency — both auditor-actionable findings. Invariants 8 and 9 (audit-log immutability and append-only insertion order) foreclose the possibility that a violation was recorded and then erased.

**Disputed transaction — "the customer claims their credit limit was exceeded on this specific transaction; show me the running total and capacity at the event index of the disputed allocation."** The bank's compliance team retrieves the allocation event whose `allocation_event_id` matches the disputed transaction's pool-allocation reference. The investigator replays the audit log in insertion order up to (but not including) that event; the running `(capacity, allocated)` pair at that point is the answer to "what was the pool's state when this allocation was admitted?" Invariant 11 (capacity-adjustment auditability) ensures the capacity in effect at that event is reconstructable — any prior `adjust_capacity` events name the prior and new capacities with attribution. If the running total + the disputed count exceeded capacity at that event index, the atom's records will not show the allocation event at all (the precondition would have rejected with `over-capacity`); if the records do show the allocation event, the structural answer is that the allocation was admitted under the capacity then in effect.

**Breach or incident investigation — "during the breach window, were any unauthorized allocations placed against the pool, or were any unauthorized capacity adjustments made?"** An investigator filters the audit log by event index (or, when Trusted Timestamping is composed, by wall-time) and inspects each event's `*_actor_ref` against the expected actor population. Unexpected attributions (allocations by an actor outside the authorized set, adjustments by an actor outside the operator set) are immediate findings. The append-only, immutable-event discipline (Invariants 8, 9) forecloses the possibility that an attacker altered the audit log to conceal unauthorized events; any gap in event-index continuity is itself a finding. The state-change events (Invariant 10) anchor the investigation to the pool's state at each window boundary.

---

## Generation acceptance

A derived implementation of Capacity Constraint Enforcement is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the pool record set and its audit log together with the records of any composing patterns the deployment uses (Provisional Commitment commitments, Duplicate Prevention idempotency tokens, Actor Identity attestations, Audit Trail composite recordings, Retention Window archive manifests *and retention-boundary snapshots*, Permissions authorization decisions), can do all of the following without recourse to source code, runbooks, or developer narration. The "records alone" framing is bounded in three ways. First, this atom's records suffice for *per-event* arithmetic verification within the active retention window with no external dependency. Second, *absolute* reconstruction across the entire pool lifecycle (the running ([Capacity], [Allocated], [State]) triple at any event index from declaration onward) requires the deployment's Retention Window to produce boundary snapshots when its purge policy removes [Declare Pool] or other early events; without those snapshots, absolute reconstruction is bounded out for the purged window and the auditor falls back to per-event consistency verification. Third, composing-pattern records supply the cross-reference surface (Provisional Commitment, Duplicate Prevention, Actor Identity), the rejection-visibility surface (Event Log), and the authorization decision surface (Permissions) that this atom does not own.

**Reconstruct the pool's successful-change history within the active retention window.** Two reconstruction modes the records support, with different evidentiary scope:

*Per-event consistency verification — records-alone verifiable from the active retention window with no external starting state.* For each surviving event, the auditor verifies that the snapshots are internally consistent: for allocate events, [Allocated After] == [Allocated Before] + [Count] and [Allocated After] ≤ capacity in effect at this event index; for release events, [Allocated After] == [Allocated Before] − [Count] and [Allocated After] ≥ 0; for adjustment events, the [Prior Capacity] / [New Capacity] pair is present and [New Capacity] differs from [Prior Capacity] (the no-op-adjust rejection rule); for state-change events, the [Prior State] / [New State] pair is present. The per-event symmetric snapshots (Outputs section) and Invariants 8, 9, 10, 11, and 14 together make this mode verifiable from records within the active retention window with no dependency on any pre-window history — each event is internally self-witnessing.

*Absolute reconstruction — ([Capacity], [Allocated], [State]) at any event index.* Replay the audit log forward in insertion order from [Declare Pool] (canonical starting state: [Allocated] = 0, [Capacity] = declared capacity, [State] = [Open]), maintaining the running triple across each event. This mode is records-alone verifiable for the lifetime of the pool only when [Declare Pool] is among the surviving records. Under composition with Retention Window where purging has removed [Declare Pool] (and possibly other early events), absolute reconstruction starting from the earliest surviving event requires a *retention-boundary snapshot* — the ([Capacity], [Allocated], [State]) triple immediately before the earliest surviving event — that the composing Retention Window pattern must produce alongside its purge action. Without the boundary snapshot, absolute reconstruction is bounded out for the purged window: the auditor falls back to per-event consistency verification (the mode above) and accepts that the *absolute* state at any purged-window index is not records-alone derivable from this atom's records. The atom's responsibility is the per-event snapshots that make per-event consistency verifiable; Retention Window's responsibility is the boundary snapshot when its purging policy removes the starting record; together the two records sets restore absolute reconstruction. When the Trusted Timestamping composition binds insertion order to verifiable wall-time, both modes extend to wall-time queries on top of event-index queries; without that composition, both modes are event-index-authoritative and timestamps are advisory.

**Verify the capacity constraint holds at every event index from records alone.** For every allocation event in the log, ([Allocated Before] + [Count]) must satisfy ≤ capacity in effect at this event index, and [Allocated After] must equal [Allocated Before] + [Count]. Invariant 4 is structurally enforced by the atom's allocate precondition; the auditor's query is a finite walk over the log returning the empty set for clean records. The auditor may verify Invariant 4 *per-event* by inspecting [Allocated After] ≤ capacity in effect directly — records-alone verifiable from the active retention window without dependency on pre-window history — or *cumulatively* by replay from [Declare Pool] when that record survives; both modes are supported by the symmetric snapshot fields. The capacity in effect at any event index is derivable from the audit log: it is the capacity declared at [Declare Pool] adjusted by every [Adjust Capacity] event preceding the current event in insertion order *when [Declare Pool] is among the surviving records*. Under Retention Window purge that has removed [Declare Pool], the capacity in effect at the earliest surviving event is supplied by the Retention Window boundary snapshot (see the reconstruction check above); from that snapshot forward, capacity-in-effect derivation proceeds in insertion order over surviving [Adjust Capacity] events.

**Verify the non-negativity invariant holds at every event index from records alone.** For every release event, the [Count] must satisfy ≤ [Allocated Before], and [Allocated After] must equal [Allocated Before] − [Count] and must be ≥ 0. Invariant 5 is enforced by the release precondition; the per-event verification mode is supported by the snapshot fields, and the structural guarantee mirrors Invariant 4.

**Confirm every successful state change and capacity adjustment is attributed to an actor with a reason.** Each state-change event (Invariant 10) and each capacity-adjustment event (Invariant 11) carries [Acting Actor Ref] and [Reason]. Allocation and release events carry [Allocating Actor Ref] / [Releasing Actor Ref] (no [Reason] field — these are routine arithmetic operations). The auditor can trace every successful change to an attributing actor and, for policy-driven changes (suspend/resume/close/adjust), to a stated rationale. When `*_actor_ref` or [Reason] fields have been scrubbed under Retention Window composition (per Invariant 8's audit-identifier/attribution split), the arithmetic chain remains verifiable; the attribution surface is bounded to whatever the retention policy preserved. *Attribution is not authorization.* The atom's records establish *who acted*; they do not establish *that the actor was permitted to act*. An auditor asking "was this release authorized?" reads Permissions' records for the decision and this atom's records for the action the decision admitted — the two surfaces compose, per *Edge cases → Authorization* and the Permissions Composition note.

**Identify the composing patterns active in this deployment from cross-reference records.** Whether Provisional Commitment is wired in for per-allocation lifecycle (the auditor inspects PC's commitment records, each of which cross-references an [Allocation Event Id] from this atom), whether Duplicate Prevention is wired in for idempotent allocation under retry (DP's idempotency tokens point at the prior [Allocation Event Id]), whether Actor Identity is wired in for non-repudiable attribution (AI's attestations are keyed by event id), whether Trusted Timestamping is wired in for verifiable wall-time anchoring (TT's anchor records reference event ids), whether Audit Trail is wired in for tamper-evident composite recording (Audit Trail composes Event Log + Actor Identity + Retention Window + Tamper Evidence around this atom's event surface), and whether Retention Window is wired in for audit-log lifecycle (RW's retention manifests name the policy in effect for this pool). Identification is from the composing pattern's records, not from this atom's records — the atom emits the event-id surface that composing patterns key against.

**Rejection visibility is explicitly out-of-scope at this atom.** An auditor asking "show me every rejected allocate during the breach window" or "how many over-capacity rejections did this pool emit?" cannot answer from this atom's records alone — rejections produce no event at this layer. Deployments under PCI DSS Req. 10.2.4 (invalid-access logging) or whose breach-investigation surface requires denied-attempt visibility compose with Event Log around the atom's call surface; Event Log records the call site, the rejection reason, and the actor reference, producing the rejection-visibility surface this atom does not. The Generation acceptance bar for rejection visibility is satisfied at the composed-system level, not by this atom in isolation.

---

## Edge cases and explicit non-goals

What this atom does not cover:

**Per-allocation identity.** Units are fungible at this atom's grain. An [Allocate] of 5 units produces one allocation event with one id, not five sub-records or five allocation ids. If a caller needs to track specific resources (this seat, this bed, this connection handle), the composing Provisional Commitment atom supplies the per-allocation lifecycle; this atom supplies only the pool's arithmetic. The boundary is sharp: Provisional Commitment owns "this specific resource is held for this specific requester for this specific window"; Capacity Constraint Enforcement owns "the running total against the pool's bound." Reserve from Pool is the composition that wires them together.

**Fairness, priority, and contention policy.** Two concurrent allocates against a pool with one unit of headroom resolve under the host environment's serialization guarantees; whichever wins the race takes the unit, the loser receives [Over Capacity]. The atom does not implement FIFO ordering, priority queueing, or any other fairness discipline. A deployment that needs fairness composes a Queueing or Priority Scheduling pattern in front of [Allocate].

**Authorization.** The atom attributes each action to the caller's `*_actor_ref` field but does not constrain who may invoke which action. A caller with knowledge of [Pool Id] and the current [Allocated] value can drive the running total to zero via [Release] calls they are not entitled to make; an actor outside the operator set can adjust capacity downward (subject only to the arithmetic precondition) or close a pool, and the records will show every such action faithfully attributed without recording whether the attribution was *permitted*. The atom's actions accept any non-empty actor reference because authorization is a different concept — who is permitted to act on this pool is a separate state machine (role assignments, capability grants, scope checks) that recurs across every regulated atom and ought to compose with the host, not be absorbed into it. The composing pattern is [Permissions](./permissions.md), which sits in front of [Allocate], [Release], [Adjust Capacity], [Suspend Pool], [Resume Pool], and [Close Pool] and rejects unauthorized callers before they reach this atom's surface. Without that composition, the atom's records satisfy attribution (Invariants 8, 10, 11 — who acted, with what reason, against what state) but not authorization (was the actor entitled to act); a regulator querying "was this release authorized?" reads Permissions' records for the decision and this atom's records for the action that the decision admitted. Deployments under regulators requiring explicit authorization controls (SOX segregation-of-duties for credit-line adjustments, HIPAA (Health Insurance Portability and Accountability Act — US federal law governing healthcare data privacy and security) minimum-necessary for healthcare bed allocation, PCI DSS Req. 7 for least-privilege access to payment-related capacity pools) compose with Permissions; the atom contributes the call surface and the attribution field, Permissions contributes the authorization decision.

**Preemption and eviction.** The atom does not evict existing allocations to make room for new ones. A high-priority allocate request against a fully-allocated pool is rejected with [Over Capacity] regardless of any priority signal; the caller's options are to release something (which requires knowing what to release — a per-allocation concept) or to wait. Preemption logic — releasing the lowest-priority allocation to admit a higher-priority one — is a composing concept at a layer that has per-allocation identity to act on.

**Capacity bursting, overcommit, and soft limits.** Some operational systems permit short-term overcommit (the airline industry's overbooking practice, the database engine's connection-pool-with-burst headroom). This atom enforces a hard constraint and rejects on the bound; deployments needing overcommit compose with a separate Burst Capacity or Soft Limit pattern that maintains a tolerance margin and emits warning signals before hard rejection.

**Allocation expiry and per-allocation lifecycle.** The atom does not model allocations with a bounded lifetime. An allocate-without-corresponding-release leaves the units consumed indefinitely. A deployment that needs allocations to time out and auto-release composes with Provisional Commitment (which has Held/Confirmed/Released/Expired states) or with a Lease pattern; this atom handles the arithmetic regardless of which lifecycle pattern governs each allocation.

**Resource semantics.** What a "unit" represents — a seat, a bed, a dollar, a connection handle, a physical SKU — is a host-system policy decision encoded in the [Count] values the caller passes. The atom does not interpret units beyond their arithmetic.

**Pool migration, merging, and splitting.** The atom does not provide actions to move units between pools or to merge two pools into one. A deployment that needs migration composes by closing the source pool and declaring a new one with adjusted capacity; the per-allocation re-allocation against the new pool is the composing system's to handle.

**Notification on state change or near-capacity.** Pool transitions ([Open] → [Suspended], drained-condition reached) may be operationally significant signals downstream — page the on-call, throttle upstream traffic, route to a fallback pool. The atom emits state-change events to its audit log; propagating those events to consumers composes with Subscription and Notification.

**Concurrency and atomicity (concurrent-call atomicity).** Concurrent actions against the same [Pool Id] resolve under the host environment's serialization guarantees. Each action's effects (running-total update, audit-log append) are atomic with respect to other concurrent calls — but the atom does not specify the serialization mechanism. Multi-action transactions (e.g., release-N-from-pool-A-and-allocate-N-to-pool-B atomically) belong to a Transaction composition.

**Crash atomicity (mid-action process failure).** Invariant 14 promises all-or-none commit signaled by [Storage Failure] rejection when the host's write subsystem surfaces failure as a return value. A *crash* — host process termination or kernel panic between (a) audit-log append and (b) running-total update, with no rejection returned to the caller — is a distinct failure mode the atom names as a deployment obligation. The deployment must provide crash-atomic multi-record writes: either a transactional store that commits or rolls back the action's records atomically across host failure (so that crash recovery observes only the "all" or "none" state), or a write-ahead log with replay-on-recovery that achieves the same effect. Without that guarantee, a crash can leave Invariant 4 violable — the audit-log event may show an allocation that did not increment the running total, or vice versa, and a regulator asking "show me your evidence that no in-progress action at the moment of crash violated the capacity bound" cannot be answered from the atom's records alone. The atom does not specify the mechanism (database transactions, append-only WAL — write-ahead log, a durability technique that records intended changes before applying them, journaling filesystem, replicated state machine); the obligation lives with the deployment, and the deployment's choice is auditable as part of the implementation's claim to Generation acceptance. The caller's reconciliation surface — "did my call succeed?" after a crash that swallowed the return value — composes with Duplicate Prevention (caller-supplied idempotency token surfaces the prior result without producing a second allocation) and with [Query] against the pool's post-recovery state.

**Integer arithmetic precision.** The atom traffics in non-negative integer capacity and positive integer counts; the load-bearing arithmetic invariant (Invariant 4) depends on [Allocated] + [Count] being computable without loss. Integer width (32-bit, 64-bit, arbitrary-precision) is handled at the deployment layer. A deployment that uses fixed-width signed integers and admits [Allocated] + [Count] > `MAX_INT` could observe silent wraparound that violates Invariant 4 — the atom's precondition would compare a wrapped (negative) sum against [Capacity], see the comparison pass, and commit an allocation that puts the running total above capacity. Implementations are expected to use overflow-safe arithmetic (arbitrary-precision integers, or fixed-width with explicit overflow detection that surfaces as [Invalid Request]); the atom does not specify the mechanism but the obligation lives with the deployment. Similar consideration applies to [Release] ([Allocated] − [Count], which can't go negative under the precondition, but the subtraction itself must be computed safely) and [Adjust Capacity] ([New Capacity] ≥ [Allocated]).

**Id-generation discipline.** The atom requires the deployment to produce [Pool Id] and event-id values that are unique across the lifetime of the system: no two pools share a [Pool Id]; no two events of the same class share an event id; no event id is reused across classes (Invariants 12 and 13). The atom does not specify the generation mechanism — UUIDv4 / UUIDv7 (Universally Unique Identifier, versions 4 and 7 — standard 128-bit random or time-ordered identifiers), content-hashed identifiers, or a coordinated monotonic sequence generator are all viable — but the obligation lives with the deployment. A generator that admits collisions under concurrent [Declare Pool] calls (e.g., a sequence counter without coordination across writers) or that re-uses ids after Retention Window purge violates Invariants 12 and 13, and the audit chain's appeal to "the event identified by [Allocation Event Id] = X" becomes ambiguous: a regulator who finds two events sharing an id has found evidence of a generator failure that invalidates downstream cross-references, and no atom-side discipline can compensate. The cross-reference surfaces this atom supports for composing patterns (Provisional Commitment commitments keyed by [Allocation Event Id], Actor Identity attestations keyed by event id, Audit Trail composite recordings keyed by event id, Permissions decisions keyed by call surface) depend structurally on id uniqueness. Implementations are expected to use a generator whose collision probability over the deployment's lifetime is negligible — UUIDv4 is the typical floor for distributed deployments; in-database generators with serialized id allocation are appropriate when a single writer can coordinate. The obligation extends across deployments that perform Retention Window purge: a purged id must not be reused for a subsequently-declared pool or event, even though the originally-bearing record no longer exists in the active log.

**Clock semantics.** Wall-time is supplied as a pipeline-injected input at the seam (the execution contract injects `clock_t` there; it is not threaded through any of the eight action signatures); the host reads the clock and supplies [Now] before the transition runs, so the core transition remains a pure function of its inputs and reads no clock internally. The same injected [Now] stamps [Declared At] on [Declare Pool] and [Recorded At] on every audit-log event; nothing else consumes it, and no guard in this atom is time-gated. Clock quality — skew, monotonicity, timezone handling — remains a deployment matter. Because no precondition consults [Now], a dishonest or non-monotonic clock degrades only the annotation: timestamps on log entries are best-effort wall-time metadata, and **insertion order — not timestamp order — is the authoritative ordering** for "after," "between," and "most recent" references throughout this spec. Trusted Timestamping composes to bind insertion order to externally-verifiable wall-time for deployments whose regulators audit the wall-time claim.

**Retention of audit-log entries and pool records.** Invariants 1, 8, and 9 establish what the atom's actions never modify or remove (the pool record itself; events' audit-identifier surface; events' append-only insertion order). The atom does not set the retention policy for how long pool records and audit-log entries remain queryable before archival or purge. Composing systems whose regulators require multi-year retention of capacity-management evidence (SOX-scope credit-limit pools, FRCP-scope (Federal Rules of Civil Procedure — the rules governing civil lawsuits in US federal courts) inventory adjustments) compose with Retention Window. Under that composition the composed-system view of both surfaces — the pool record and the audit log — is bounded by the retention schedule; the atom's Generation acceptance reconstruction is scoped to records within the active window, with archived history out-of-scope when the deployment maintains no archive. The split between scrubbing (Retention Window erasing PII-bearing `*_actor_ref` and [Reason] fields while preserving the audit-identifier surface) and purging (Retention Window removing events or pool records entirely) is named in Invariants 1, 8, and 9 and elaborated in the Retention Window Composition note.

**Rejection visibility.** A rejected action — [Over Capacity], [Over Release], [Over Allocated], [Not Known], [Suspended], [Closed], [Not Open], [Not Suspended], [Already Closed], [Invalid Request], [Storage Failure] — produces no event in this atom's audit log. The atom's records witness *successful* state changes; the *attempt* surface is invisible at this layer. The boundary is deliberate: the load-bearing arithmetic invariant is about pool state, not about call attempts, and recording every rejection (especially [Not Known] and [Invalid Request], which are typically caller-side bugs in volume) would conflate "the pool's state changed" with "someone tried." Deployments whose regulators require visibility into rejected attempts compose with Event Log around the atom's call surface: Event Log records the call site, the rejection reason, the actor reference, and the wall-time, producing a deployment-grain attempt journal alongside the atom's pool-grain change journal. The PCI DSS Req. 10.2.4 obligation (logging invalid logical access attempts), the breach-investigation surface for denial-pattern probing, and the regulator-audit question "how many over-capacity rejections did this pool emit during the window?" are all satisfied at the composed-system level through Event Log, not by this atom in isolation. The atom names the rejection reasons precisely so that the composing Event Log has a stable vocabulary to record against.

**Cross-pool invariants.** The atom maintains per-pool invariants. Cross-pool rules (e.g., "the sum of allocations across all flight pools serving a corridor cannot exceed the carrier's network-wide cap") are composing concepts at a layer that aggregates over pools.

Where the atom breaks down: when the underlying resource is not actually fungible at any meaningful grain (every seat is distinct because of legroom or premium status — at which point per-allocation identity belongs at this layer too, which is a sign the deployment wants Provisional Commitment, not this atom); when capacity is not a single integer but a multi-dimensional vector (memory bytes *and* CPU shares *and* network bandwidth — a generalized resource-bundle pool, not the single-resource pool this atom models); when the constraint must be probabilistic rather than hard (a TCP-style (Transmission Control Protocol — the core internet protocol whose congestion control backs off under load) admission control with backoff — that's a Rate Limiter pattern, not this atom).

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Declare Pool

The behavior that creates a new bounded pool. It records the supplied [Capacity], [Declaring Actor Ref], and [Declaration Reason], enters the pool in [Open] with [Allocated] = 0, stamps [Declared At], and returns the fresh [Pool Id].

Kind: Operation

#### Allocate

The behavior that consumes units against a pool, incrementing [Allocated] by [Count] when the pool is [Open] and the bound admits it. Returns an [Allocation Event Id]. Rejected [Over Capacity] when [Allocated] + [Count] > [Capacity], [Suspended] or [Closed] when the pool is not [Open].

Kind: Operation

#### Release

The behavior that returns units to a pool, decrementing [Allocated] by [Count]. Admitted in every state ([Open], [Suspended], [Closed]) so in-flight allocations can be unwound. Returns a [Release Event Id]; rejected [Over Release] when [Count] > [Allocated].

Kind: Operation

#### Adjust Capacity

The behavior that revises a pool's [Capacity] to a [New Capacity] without changing [Allocated]. Permitted while not [Closed], when [New Capacity] differs from the current [Capacity] and is ≥ [Allocated]. Returns an [Adjustment Event Id]; rejected [Over Allocated] when [New Capacity] < [Allocated], [Invalid Request] on a no-op, [Closed] when the pool is closed.

Kind: Operation

#### Suspend Pool

The behavior that moves a pool [Open] → [Suspended], halting new allocations while still admitting [Release] and [Adjust Capacity]. Returns a [State Change Id]; rejected [Not Open] if already suspended, [Already Closed] if closed.

Kind: Operation

#### Resume Pool

The behavior that moves a pool [Suspended] → [Open], readmitting allocations. Returns a [State Change Id]; rejected [Not Suspended] if already open, [Already Closed] if closed.

Kind: Operation

#### Close Pool

The behavior that moves a pool to the terminal [Closed] state. New allocations and capacity adjustments are refused thereafter; [Release] is still admitted. Returns a [State Change Id]; rejected [Already Closed] if already closed.

Kind: Operation

#### Query

The read-only behavior that returns a pool's current { [Capacity], [Allocated], [Available], [State] } snapshot. It changes nothing and writes no audit-log entry.

Kind: Operation

#### Pool Id

The opaque, immutable identity of a pool, host-allocated at the I/O seam on [Declare Pool] and never reused. The declaration metadata, [Capacity], [Allocated], and [State] are properties of the pool, not its identity.

Kind:     Field
Field of: Pool
Projects: pool_id

#### Capacity

The current declared maximum total allocation a pool admits — a non-negative integer. Set on [Declare Pool], modified only by [Adjust Capacity]. The load-bearing bound: [Allocated] ≤ [Capacity] always holds (Invariant 4).

Kind:     Field
Field of: Pool
Projects: capacity

#### Allocated

The pool's current running total of consumed units — a non-negative integer. Modified only by [Allocate] (increment) and [Release] (decrement); never exceeds [Capacity] (Invariant 4) and never goes below 0 (Invariant 5).

Kind:     Field
Field of: Pool
Projects: allocated

#### Available

The derived headroom, [Capacity] − [Allocated], reported by [Query]. Recomputed from [Capacity] and [Allocated]; not stored independently.

Kind:     Field
Field of: Pool
Projects: available

#### State

The pool's lifecycle state — one of [Open], [Suspended], [Closed]. Set to [Open] on [Declare Pool]; modified only by [Suspend Pool], [Resume Pool], [Close Pool].

Kind:     Field
Field of: Pool
Projects: state

#### Declared At

The wall-time a pool was declared, stamped from the seam-injected [Now] on [Declare Pool]. Immutable thereafter.

Kind:     Field
Field of: Pool
Projects: declared_at

#### Declaring Actor Ref

The opaque reference to the actor that declared the pool. Set on [Declare Pool], immutable thereafter. Attribution only; non-repudiable proof composes with Actor Identity.

Kind:     Field
Field of: Pool
Projects: declaring_actor_ref

#### Declaration Reason

The caller-supplied reason recorded at [Declare Pool]. Immutable thereafter.

Kind:     Field
Field of: Pool
Projects: declaration_reason

#### Allocation Event Id

The opaque, immutable id of an allocation event, host-allocated at the I/O seam on each [Allocate] and individually addressable on the pool's audit log. Composing patterns key against it.

Kind:     Field
Field of: the allocation event
Projects: allocation_event_id

#### Release Event Id

The opaque, immutable id of a release event, host-allocated at the I/O seam on each [Release].

Kind:     Field
Field of: the release event
Projects: release_event_id

#### Adjustment Event Id

The opaque, immutable id of a capacity-adjustment event, host-allocated at the I/O seam on each [Adjust Capacity].

Kind:     Field
Field of: the capacity-adjustment event
Projects: adjustment_event_id

#### State Change Id

The opaque, immutable id of a state-change event, host-allocated at the I/O seam on each [Suspend Pool], [Resume Pool], or [Close Pool].

Kind:     Field
Field of: the state-change event
Projects: state_change_id

#### Count

The positive-integer number of units an [Allocate] or [Release] operates on, recorded on the resulting event. Zero is not a legitimate count.

Kind:     Field
Field of: the allocation/release event
Projects: count

#### Allocated Before

The pool's [Allocated] value immediately before an allocation or release event — the before half of the event's symmetric snapshot.

Kind:     Field
Field of: the allocation/release event
Projects: allocated_before

#### Allocated After

The pool's [Allocated] value immediately after an allocation or release event ([Allocated Before] + [Count] for allocate, − [Count] for release) — the witness that lets an auditor verify Invariant 4 or 5 per-event.

Kind:     Field
Field of: the allocation/release event
Projects: allocated_after

#### Prior Capacity

The pool's [Capacity] immediately before a capacity-adjustment event.

Kind:     Field
Field of: the capacity-adjustment event
Projects: prior_capacity

#### New Capacity

The revised [Capacity] supplied to [Adjust Capacity] and recorded on the adjustment event. Must be non-negative, differ from the current [Capacity], and be ≥ [Allocated].

Kind:     Field
Field of: the capacity-adjustment event
Projects: new_capacity

#### Prior State

The pool's [State] immediately before a state-change event.

Kind:     Field
Field of: the state-change event
Projects: prior_state

#### New State

The pool's [State] immediately after a state-change event.

Kind:     Field
Field of: the state-change event
Projects: new_state

#### Recorded At

The wall-time an event was appended to the audit log, stamped from the seam-injected [Now]. Best-effort metadata; insertion order, not timestamp order, is authoritative.

Kind:     Field
Field of: the audit-log event
Projects: recorded_at

#### Allocating Actor Ref

The opaque reference to the actor performing an [Allocate], recorded on the allocation event.

Kind:     Field
Field of: the allocation event
Projects: allocating_actor_ref

#### Releasing Actor Ref

The opaque reference to the actor performing a [Release], recorded on the release event.

Kind:     Field
Field of: the release event
Projects: releasing_actor_ref

#### Adjusting Actor Ref

The opaque reference to the actor performing an [Adjust Capacity], recorded on the adjustment event.

Kind:     Field
Field of: the capacity-adjustment event
Projects: adjusting_actor_ref

#### Acting Actor Ref

The opaque reference to the actor performing a state transition, recorded on the state-change event.

Kind:     Field
Field of: the state-change event
Projects: acting_actor_ref

#### Reason

The caller-supplied reason string recorded on a capacity-adjustment or state-change event (and, as [Declaration Reason], on the pool). Required on [Declare Pool], [Adjust Capacity], [Suspend Pool], [Resume Pool], [Close Pool]; not required on the routine [Allocate]/[Release].

Kind:     Field
Field of: the audit-log event
Projects: reason

#### Now

The current wall-clock reading, pipeline-injected at the single I/O seam (the execution contract supplies `clock_t` there) before a transition runs — never a caller-supplied action parameter. Consumed only to stamp [Declared At] and each event's [Recorded At]; no guard consults it. Not stored under this name; the stored forms are the timestamps.

Kind:         Parameter
Parameter of: Declare Pool, Allocate, Release, Adjust Capacity, Suspend Pool, Resume Pool, Close Pool
Projects:     now

#### Open

The entry and operating state: the pool accepts [Allocate] calls subject to the bound. Reached on [Declare Pool] and on [Resume Pool]; left by [Suspend Pool] or [Close Pool].

Kind:      Member
Member of: the pool state
Role:      Outcome

#### Suspended

The paused state: new [Allocate] calls are refused regardless of headroom, while [Release] and [Adjust Capacity] remain admitted. Reached by [Suspend Pool]; left by [Resume Pool] (to [Open]) or [Close Pool]. Also the rejection reason [Allocate] returns against a suspended pool.

Kind:      Member
Member of: the pool state
Role:      Outcome

#### Closed

The terminal state: [Allocate] and [Adjust Capacity] are refused, [Release] still admitted so in-flight allocations unwind. Reached by [Close Pool]; absorbing (Invariant 3). Also the rejection reason [Allocate]/[Adjust Capacity] return against a closed pool.

Kind:      Member
Member of: the pool state
Role:      Outcome

#### Over Capacity

The refusal [Allocate] returns when [Allocated] + [Count] > [Capacity] — the allocation would breach the bound. No event is recorded; the pool remains [Open].

Kind:      Member
Member of: the Allocate rejection
Role:      Outcome
Projects:  over-capacity

#### Over Release

The refusal [Release] returns when [Count] > [Allocated] — releasing more than is allocated would drive the running total negative. No event is recorded.

Kind:      Member
Member of: the Release rejection
Role:      Outcome
Projects:  over-release

#### Over Allocated

The refusal [Adjust Capacity] returns when [New Capacity] < [Allocated] — the requested bound would put already-allocated units over capacity. No change, no event.

Kind:      Member
Member of: the Adjust Capacity rejection
Role:      Outcome
Projects:  over-allocated

#### Not Known

The refusal any [Pool Id]-taking action returns when the id references no recorded pool — a lookup miss, checked before every other precondition. After deployment-side purge it also subsumes once-declared-but-purged pools.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Not Open

The refusal [Suspend Pool] returns when the pool is not in [Open] state (it is already [Suspended]).

Kind:      Member
Member of: the Suspend Pool rejection
Role:      Outcome
Projects:  not-open

#### Not Suspended

The refusal [Resume Pool] returns when the pool is not in [Suspended] state (it is [Open]).

Kind:      Member
Member of: the Resume Pool rejection
Role:      Outcome
Projects:  not-suspended

#### Already Closed

The refusal [Suspend Pool], [Resume Pool], or [Close Pool] returns when the pool is already [Closed] — terminal, no further state transitions.

Kind:      Member
Member of: the lifecycle-action rejection
Role:      Outcome
Projects:  already-closed

#### Invalid Request

The refusal any action returns when a required field is malformed — a null/empty/whitespace-only or control/zero-width/bidi-tainted string, a wrong-signed integer, or a no-op [Adjust Capacity] whose [New Capacity] equals the current [Capacity]. A field-format rejection before any arithmetic check or store write.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Storage Failure

The refusal any action returns when the durable write fails after all preconditions pass. All-or-none: no partial record, no audit-log entry, no running-total change (Invariant 14).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Declare Pool]: #declare-pool
[Allocate]: #allocate
[Release]: #release
[Adjust Capacity]: #adjust-capacity
[Suspend Pool]: #suspend-pool
[Resume Pool]: #resume-pool
[Close Pool]: #close-pool
[Query]: #query
[Pool Id]: #pool-id
[Capacity]: #capacity
[Allocated]: #allocated
[Available]: #available
[State]: #state
[Declared At]: #declared-at
[Declaring Actor Ref]: #declaring-actor-ref
[Declaration Reason]: #declaration-reason
[Allocation Event Id]: #allocation-event-id
[Release Event Id]: #release-event-id
[Adjustment Event Id]: #adjustment-event-id
[State Change Id]: #state-change-id
[Count]: #count
[Allocated Before]: #allocated-before
[Allocated After]: #allocated-after
[Prior Capacity]: #prior-capacity
[New Capacity]: #new-capacity
[Prior State]: #prior-state
[New State]: #new-state
[Recorded At]: #recorded-at
[Allocating Actor Ref]: #allocating-actor-ref
[Releasing Actor Ref]: #releasing-actor-ref
[Adjusting Actor Ref]: #adjusting-actor-ref
[Acting Actor Ref]: #acting-actor-ref
[Reason]: #reason
[Now]: #now
[Open]: #open
[Suspended]: #suspended
[Closed]: #closed
[Over Capacity]: #over-capacity
[Over Release]: #over-release
[Over Allocated]: #over-allocated
[Not Known]: #not-known
[Not Open]: #not-open
[Not Suspended]: #not-suspended
[Already Closed]: #already-closed
[Invalid Request]: #invalid-request
[Storage Failure]: #storage-failure

---

## Composition notes

Capacity Constraint Enforcement is freestanding and is designed to compose with other atoms rather than absorb their concepts:

- **[Provisional Commitment](./provisional-commitment.md)** — for the per-allocation lifecycle. The composing system calls `allocate` on a Capacity Constraint pool at the moment Provisional Commitment moves a commitment into Held; calls `release` at the moment the commitment moves to Released or Expired; the Confirmed transition does not release (the unit remains consumed in the binding allocation). The composition is realized as the [Reserve from Pool](../compositions/reserve-from-pool.md) composition (`grounded` 2026-06-04 — the pool-arithmetic superset of Idempotent Reservation, wiring this atom with Provisional Commitment, Duplicate Prevention, Event Log, and Actor Identity; its load-bearing emergent invariant is allocation coherence, `allocated` in lockstep with the live-reservation set). The boundary: Provisional Commitment owns per-commitment state and the absorbing terminal transitions; Capacity Constraint Enforcement owns the running total and the bound; Reserve from Pool owns the binding between them.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for idempotent allocation under retry. The composing system supplies an idempotency token (a client-supplied token that makes repeated submissions safe); on a retry of `allocate` with the same token, Duplicate Prevention returns the prior `allocation_event_id` rather than producing a second allocation. The atom itself is not idempotent — a retry without the composition produces two allocations and double-counts the resource.
- **[Event Log](./event-log.md)** — for two distinct deployment-grain journals built around the atom's call surface. *First*, a unified system-wide event stream that includes pool-management events (the successful state changes this atom records internally) alongside other systems' events; the atom's internal audit log is the canonical record at the pool's grain, Event Log is the journal at the deployment's grain. *Second*, the attempt-journal that captures rejected calls — Event Log records the call site, rejection reason, actor, and wall-time for every `over-capacity`, `over-release`, `over-allocated`, `suspended`, `closed`, `invalid-request`, `storage-failure`, etc. that this atom emits. The second use case is what makes the atom's rejection-visibility boundary (see *Edge cases → Rejection visibility*) tractable: deployments under PCI DSS Req. 10.2.4 or with breach-investigation requirements for denied-attempt visibility wire Event Log around the call surface and read the rejection journal from there.
- **[Actor Identity](./actor-identity.md)** — for non-repudiable attribution. The atom's `*_actor_ref` fields supply attribution; Actor Identity supplies the cryptographic or procedural binding that makes the attribution survive a regulated audit. Each `allocate`, `release`, `adjust_capacity`, `suspend_pool`, `resume_pool`, and `close_pool` action's event id is the surface Actor Identity attests against.
- **[Permissions](./permissions.md)** — for authorization, the boundary this atom does not enforce (see *Edge cases → Authorization*). Where Actor Identity binds an action to a specific actor (who acted?), Permissions decides whether that actor was entitled to act (was the action permitted?). The composition sits in front of `allocate`, `release`, `adjust_capacity`, `suspend_pool`, `resume_pool`, and `close_pool`; an unauthorized caller is rejected at the Permissions layer before reaching this atom, so the atom's records contain only actions whose Permissions check passed. Deployments under regulators requiring explicit authorization controls (SOX segregation-of-duties for capacity adjustments, HIPAA minimum-necessary for healthcare allocations, PCI DSS Req. 7 for least-privilege access to payment-related capacity pools) compose this atom with Permissions and Actor Identity together — Permissions for the authorization decision, Actor Identity for the non-repudiable attribution of the admitted action.
- **Trusted Timestamping** *(forthcoming)* — for binding the atom's insertion-order audit log to externally-verifiable wall-time. The atom's `recorded_at` timestamps are best-effort wall-time metadata from the seam-injected clock; under skew or clock adjustment they may not be monotonic, and insertion order is authoritative for the atom's own consistency. Trusted Timestamping composes by anchoring event ids (or batches of event ids) to externally-verifiable wall-time, producing a record that both (a) the event was recorded at the claimed wall-time and (b) the insertion order is consistent with monotonic wall-time. Deployments whose regulators audit wall-time claims (SOX-scope material transactions with end-of-period cutoff, healthcare event-time attribution under HIPAA, payment-network settlement windows) compose Trusted Timestamping to make the wall-time surface defensible. Without that composition, the *Clock semantics* edge case applies: timestamps are advisory, insertion order is authoritative.
- **[Retention Window](./retention-window.md)** — for governing how long audit-log entries *and pool records themselves* remain actively accessible, including the distinction between *scrubbing* (erasing personally-identifying attribution while preserving the audit-identifier surface) and *purging* (removing entries entirely). Invariants 1, 8, and 9 each name the atom's contribution (no atom-defined action removes a pool record or modifies/removes an event) and acknowledge that the composed-system view differs under retention schedules: Invariant 1 covers the pool record; Invariant 8 covers the event-level attribution/audit-identifier split; Invariant 9 covers the audit log's append-only discipline. *Scrubbing scope*: when the composing deployment's `*_actor_ref` or `reason` fields contain personally-identifying information (a credit-line pool's `declaration_reason` referencing a customer by id; a healthcare pool's `reason` naming a patient cohort), Retention Window may erase those fields under GDPR Article 17 or post-retention obligations. The audit-identifier surface that survives scrubbing is: `pool_id`, all event ids (`allocation_event_id`, `release_event_id`, `adjustment_event_id`, `state_change_id`), `declared_at`, per-event `recorded_at`, arithmetic fields (`capacity`, `count`, `allocated_before`, `allocated_after`, `prior_capacity`, `new_capacity`, `prior_state`, `new_state`), and event-class indicator. The arithmetic chain remains reconstructable across scrubbing — Invariant 4 is verifiable from the scrubbed records. *Purging scope*: Retention Window may additionally remove entries entirely from the active log under post-retention regulatory schedules, optionally moving them to an archive maintained by the deployment. Once purged, the arithmetic chain for pre-purge history is no longer reconstructable from active records; Generation acceptance scopes reconstruction to the active retention window (see Generation acceptance preamble). Deployments that need verifiable pre-retention history must maintain the archive; deployments that operate under purge-without-archive (regulatory minimums met by the active retention) accept the bounded reconstruction surface.
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical regulated-audit composition (Event Log + Actor Identity + Retention Window + Tamper Evidence) wrapped around the atom's event surface to produce tamper-evident composite recording. Where the *Event Log* composition supplies a deployment-grain journal and the *Actor Identity* composition supplies attribution binding, *Audit Trail* supplies the composite — including the Tamper Evidence layer that makes any post-hoc modification to the recorded event stream detectable. Deployments whose regulators require tamper-evident audit (SOX §404 records-alone-defensible evidence, PCI DSS Req. 10.5 audit-trail integrity, GDPR Article 30 records-of-processing under tamper-evident discipline) compose Audit Trail rather than Event Log alone. The atom's contribution to the composition is the event-id surface and the immutable audit-identifier fields under Invariant 8; Audit Trail layers the other obligations on top.
- **[Subscription](./subscription.md) + [Notification](./notification.md)** — for propagating pool state changes (Open → Suspended, drained-condition reached, capacity adjusted) to downstream consumers. Composes via the existing Notification Fanout pattern.
- **Burst Capacity / Soft Limit** *(forthcoming)* — for deployments that need to permit short-term overcommit with warnings before hard rejection. Wraps `allocate` with a tolerance margin and emits warnings before rejecting at the burst bound.
- **Queueing / Priority Scheduling** *(forthcoming)* — for deployments that need fairness or priority under contention. Sits in front of `allocate` and orders concurrent requests before they hit the atom's serialization layer.
- **[Reserve from Pool](../compositions/reserve-from-pool.md)** (`grounded` 2026-06-04) — the canonical composition wiring this atom with Provisional Commitment, Duplicate Prevention, Event Log, and Actor Identity to produce a full reservation arc; its allocation-coherence invariant is what keeps this pool's `allocated` total a faithful image of the live-reservation set.

---

## Standards references

Capacity Constraint Enforcement is a utility primitive; no single regulator owns capacity enforcement directly. Its standards relevance comes through composition with regulated patterns whose audit surface relies on the running-total invariant.

- **ISO 9001:2015 §8.1 (Operational planning and control)** — the International Organization for Standardization's quality-management standard; production systems must operate within declared capacity boundaries; the atom is the structural enforcement for that obligation when the constrained resource is a production asset (manufacturing-line slots, certified-operator headroom, equipment utilization).
- **Basel III Liquidity Coverage Ratio (BCBS 238 — Basel Committee on Banking Supervision, the international body that sets bank-capital and liquidity standards)** — bank credit-line and counterparty-limit pools must be enforced as hard constraints with auditable adjustments; the atom is the operational form of a regulator-facing credit-limit headroom pool.
- **Sarbanes-Oxley §404 (Internal Control over Financial Reporting)** — where confirmed allocations against a pool are material to the books (credit-limit consumption flowing to the balance sheet, inventory allocation flowing to cost-of-goods-sold), the controls around pool adjustments and the audit trail of who-allocated-what-when become SOX-scope. Composes with Audit Trail to produce the records-alone-defensible evidence §404 attestations require.
- **PCI DSS Requirement 10 (Logging and monitoring)** — when the pool governs payment-related capacity (a payment-gateway connection pool, a card-authorization headroom pool), every successful allocation and state change must be logged with attribution; this atom's audit-log invariants supply the structural form for the successful-change surface. Req. 10.2.4 specifically requires logging of *invalid logical access attempts* (rejected calls), which this atom does not produce events for; the composing Event Log around the atom's call surface (see Composition notes → Event Log) records the rejection journal. The full PCI DSS Req. 10 obligation is satisfied by the atom + Event Log composition, not by the atom alone.
- **The Joint Commission, *Provision of Care, Treatment, and Services*** — healthcare bed-management and ward-capacity standards require capacity changes (closures for renovation, surge expansions) to be auditable with attribution and reason. The atom's `adjust_capacity` event-recording discipline is the operational form.
- **GDPR Article 30 (Records of processing)** — where the pool's allocation events touch personal data (per-customer credit-line pools, per-patient bed allocations referencing the patient by id), the audit log is itself a processing activity subject to controller-records obligations. Composes with Audit Trail and Retention Window for the full obligation surface.
- **Authorization-related standards (SOX §404 segregation-of-duties, HIPAA Privacy Rule §164.508 minimum-necessary, PCI DSS Requirement 7 restrict access by business need-to-know)** — these regimes require enforcement of *who may act*, not merely attribution of *who did act*. This atom records the attribution surface (`*_actor_ref`) for every successful action but does not constrain who may invoke which action; the authorization decision composes with Permissions (see *Edge cases → Authorization* and the Permissions Composition note). Composing with Permissions and Actor Identity together produces the *was-permitted-and-was-attested* surface these standards require — Permissions for the decision that admitted the call, Actor Identity for the non-repudiable record of who the decision admitted.

The atom inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture and the explicit refusal to absorb per-allocation identity, fairness policy, preemption, and overcommit.
- **Eiffel's design-by-contract** — preconditions on each action, named rejection reasons, and the *preserve-by-precondition* discipline (rejecting actions that would violate an invariant rather than silently clamping).
- **Database connection pooling and operating-system semaphore conventions** — the count-up / count-down arithmetic the atom abstracts; here exposed as visible business state rather than hidden inside a transactional or kernel primitive.
- **Token-bucket and leaky-bucket rate-limiter constructions** — for the kinship the atom has with rate-limit enforcement; the rate-limit pattern is a sibling primitive with time-varying capacity rather than a fixed bound.

---

## Status

`partially resolved` — downgraded 2026-08-24 by a load-bearing touch (the Logic Confinement clock-injection fix, below) whose closing fresh-reader round (Final Critique 6, Opus, Happy-Torvalds-X2) returned **two foundational findings**; the atom holds at `partially resolved` until they are closed and a round returns with zero foundational. The clock fix itself cleared the round. Prior grounding: `grounded on Final Critique 5 — 2026-05-20` (formal layer complete 2026-06-04 — TLA+ model `capacity-constraint-enforcement.tla` with `release` action makes Inv5 non-vacuous; buggy twin rejects on `Inv5_NonNegativity` (unguarded release underflow); Inv 14 vote reconsidered to out-of-scope (within-action, not an interleaving); coverage matrix updated. Cleared `grounded (English) — formal layer pending`, briefly held after the 2026-06-03 formal-layer vote; full prose round was `grounded — 2026-05-20`. See `tools/harness/coverage/capacity-constraint-enforcement.md`.) — capacity arithmetic atom; load-bearing invariant `allocated ≤ capacity` enforced by preconditions on `allocate` and `adjust_capacity`; suspend/resume/close state machine; audit-log discipline with the two-surfaces split (audit-identifier vs. attribution lifecycles); four host obligations named (serializable per-pool execution, overflow-safe integer arithmetic, crash-atomic multi-record writes, system-wide id uniqueness); regulated overlay complete. Foundation round complete (Pass 1 GRID — the nine-node structural-completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof — + 1 foundational finding closed; Pass 2 EOS clean; Pass 3 Linus + 5 foundational findings closed). Phase 4 Opus clearance gate (Angry Torvalds X2) ran twice on 2026-05-15: round 1 closed 11 foundational findings + 2 sub-finding style notes; round 2 closed 3 foundational + 5 refining + 1 rhetorical. Grounded at this revision per the 92%-good threshold ([`pressure-testing.md`](../pressure-testing.md) §"What grounded means"): foundational density after round 2 = 0. Authored 2026-05-14; revised 2026-05-15 (round 1); revised 2026-05-15 (round 2). Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's Opus clearance gate ran twice — round 1 (11 foundational findings) is retro-labeled Final Critique 4; round 2 (which cleared the remainder) is retro-labeled Final Critique 5 — so the pattern grounds on Final Critique 5; the original round-naming in the Lineage notes below is preserved as historical record.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Capacity Constraint Enforcement is atom #8 in the ROADMAP's draft order and the third entry in `resource-lifecycle` after Provisional Commitment and Soft Delete. The closest existing pattern is Provisional Commitment — same category, same kind of resource-encumbrance concern — and the draft mirrors its shape, identity-model discipline, and authoring conventions. The regulated-overlay conventions (Regulated adversarial scenarios, Generation acceptance) are included per the methodology's required-when clause — three of the five domain examples (airline, banking, healthcare) invoke regulated domains. The conventions are inherited from the methodology directly rather than re-derived from predecessor patterns.

The composing forthcoming-link debts named in this draft are: Reserve from Pool, Burst Capacity / Soft Limit, Queueing / Priority Scheduling. None are yet authored. The existing Composition notes in Provisional Commitment named Capacity Constraint Enforcement as a forthcoming composing atom; that link will resolve in Provisional Commitment's next touch-triggered re-pass.

**Pass 1 — GRID. Clean (1 finding closed in-pattern).**

Nine MUSE v1.1 (the completeness framework, version 1.1, from which GRID's nine nodes are drawn) nodes resolved; reference graph walked (Friction → Flow; Decision → State/Behavior; Proof → Intent).

- *F-P1.1 — Release-in-Closed silent disagreement between action signature and transitions table* — foundational → action signature, Decision points for `release`, and Invariant 3 now all explicitly state `release` is admitted in every state including Closed for cross-pattern unwinding.

**Pass 2 — EOS. Clean (no over-absorptions).**

Tested: audit log (kept internal — tightly bound to pool lifecycle); Open/Suspended/Closed state machine (kept internal — Suspended *means* "rejects allocate"); idempotency (external — Duplicate Prevention); non-repudiation (external — Actor Identity); fairness/preemption (external — Queueing forthcoming); burst/overcommit (external — Soft Limit forthcoming); notification (external — Subscription + Notification); retention (external — Retention Window); per-allocation lifecycle (external — Provisional Commitment).

**Pass 3 — Linus. Clean (5 findings, all foundational, closed in-pattern).**

- *F-P3.1 — Priority ordering listed arithmetic before field-format* — foundational → reordered to not-known → state-validity → field-format → arithmetic → store; rationale in-line.
- *F-P3.2 — Integer overflow / arithmetic precision unaddressed* — foundational → new *Integer arithmetic precision* edge case; Invariant 4 made contingent on host overflow-safety.
- *F-P3.3 — Release-in-Closed defense conflated two concerns* — foundational → Invariant 3 rationale rewritten as cross-pattern data consistency.
- *F-P3.4 — Regulated overlay missing despite required-when clause applying* — foundational → Regulated adversarial scenarios (3 reads) + Generation acceptance (5 checks) added; inherited from methodology directly.
- *F-P3.5 — Retention Window scrubbing surface unspecified* — foundational → Retention Window Composition note names the immutable audit-identifier surface vs. the scrubbable attribution surface.

**Phase 4 — Opus clearance gate (Angry Torvalds X2). Two rounds on 2026-05-15.**

*Round 1 — 11 foundational findings + 2 sub-finding style notes; all closed in-pattern.* Pass 1 and Pass 2 clean at standard intensity; Pass 3 at X2 attacked defenses. Gate ran with fresh-reader discipline modulo one disclosed priming caveat (prior chat had named four contested decisions by category without rationale).

- *F-R1.1 — Rejection visibility absent from records; regulated-overlay claims assumed it* — foundational → Rejection visibility edge case; Generation acceptance preamble scoped; PCI DSS Req. 10.2.4 framed as composed-system obligation; Event Log composition note covers both successful-event and rejection-attempt journals.
- *F-R1.2 — Allocate events lacked the running-total snapshot release events carried* — foundational → symmetric `allocated_before` / `allocated_after` on both classes.
- *F-R1.3 — Priority-ordering defense covered field-before-arithmetic but not state-before-field* — foundational → each ordering decision now defended in-line separately.
- *F-R1.4 — Crash atomicity conflated with concurrent-call atomicity* — foundational → split into two edge cases; preamble names three host obligations.
- *F-R1.5 — Invariant 8 overstated immutability vs. Retention Window scrubbing* — foundational → Invariant 8 split into immutable audit-identifier surface and mutable attribution surface.
- *F-R1.6 — Invariant 9 promised monotonic growth that Retention Window purge breaks* — foundational → Invariant 9 qualified; Generation acceptance scoped to active retention window; scrubbing vs. purging split formalized.
- *F-R1.7 — Trusted Timestamping referenced in body but absent from Composition notes* — foundational → added as `*(forthcoming)*` entry; wall-time-anchor role named.
- *F-R1.8 — Audit Trail in Standards refs but not Composition notes* — foundational → added as distinct entry; relationship to Event Log clarified.
- *F-R1.9 — 8 of 10 rejection paths unexercised in examples* — foundational → *Rejection paths* subsection added covering all 8.
- *F-R1.10 — Preamble blockquote elided host conditions* — foundational → blockquote names three host obligations (fourth added in round 2).
- *F-R1.11 — Generation acceptance "records alone" overstated for check #5* — foundational → preamble scoped; check #5 names cross-reference fields each composing pattern keys against.

Sub-finding style notes (neither blocking nor counted toward foundational class):
- Airline example "24-hour" release window → rephrased to "carrier's refund window — a deployment-defined operational window" (atom admits release in Closed indefinitely).
- Action-signature rejection-reason listing order → signatures are reference enumerations not check sequences; not changed.

*Round 2 — 9 findings (3 foundational, 5 refining, 1 rhetorical); all closed in-pattern.* Strict fresh-reader discipline against spec body lines 1–435 before Lineage notes read. Pass 1 and Pass 2 clean.

- *F-R2.1 — Authorization silently absent; attribution mis-sold as covering it* — foundational → *Authorization* edge case; Permissions Composition note; Generation acceptance check #3 split: attribution ≠ authorization.
- *F-R2.2 — Invariants 4 & 14 conditionality landed in preamble (R1.F10 fix), not on the invariant texts* — refining → conditionality moved into Invariant 4 & 14 statements with edge-case cross-refs.
- *F-R2.3 — "At this atom's grain" qualifier on Invariants 8/9 was tautological prose* — rhetorical → Invariants 8 & 9 rewritten to foreground the operational composing-side reality; "under this atom's actions" now load-bearing rather than tautological.
- *F-R2.4 — Invariant 1 lacked the grain-aware framing R1 applied to Invariants 8/9* — refining → Invariant 1 mirrors Invariant 9's structure; Retention Window scope extended to pool records.
- *F-R2.5 — `query` return shape (4-field projection) contradicted Outputs section (full record)* — refining → Outputs section distinguishes persisted pool record from runtime read surface; projection-vs-record split explicit.
- *F-R2.6 — No-op `adjust_capacity` (new == current) silently admitted; asymmetric with allocate/release positive-count rule* — foundational → rejected as `invalid-request` across Inputs/Outputs, Decision points, State transitions, Behavior, Rejection paths, Generation acceptance per-event check.
- *F-R2.7 — Generation acceptance reconstruction needed a starting snapshot the atom didn't specify* — refining → reconstruction split into per-event consistency (records-alone from active window) and absolute reconstruction (requires Retention Window boundary snapshot when `declare_pool` purged).
- *F-R2.8 — Uniform validation rule was thin for strings* — foundational → expanded with codepoint length, rejection of control / zero-width / bidi-override characters, no-normalization and no-case-folding stances.
- *F-R2.9 — System-wide id-uniqueness deployment obligation unstated* — refining → preamble names a fourth host obligation; *Id-generation discipline* edge case added.

**Grounding decision — 2026-05-15.** Round 2 closed 3 foundational findings (F-R2.1, F-R2.6, F-R2.8); refining and rhetorical findings closed in-pattern alongside. Foundational density after round 2 = 0 → grounded per the 92%-good threshold ([`pressure-testing.md`](../pressure-testing.md) §"What grounded means"). Touch-rule applies on any future edit; methodology amendment was applied to pressure-testing.md in the same session that closed round 2.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 4 (bounded arithmetic allocated ≤ capacity across every reachable state under serializable concurrency) is an arithmetic-bound interleaving property; Invariants 5/14 (non-negativity, action atomicity). Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal-layer vote reconsideration — 2026-06-04: Inv 14 reconsidered to out-of-scope (within-action, not an interleaving).** The original vote named Invariant 14 (action atomicity) as load-bearing alongside Invariants 4 and 5. On reconsideration, Invariant 14 is a within-action host obligation — "each action either commits all its records or none" — which is not a claim about how concurrent *actions* interleave, but about whether a single action's multi-record write is crash-atomic. TLA+ trace models check action-vs-action interleaving properties; within-action atomicity is a deployment obligation on the host's write subsystem, exactly parallel to how Party Identity treats Invariant 11 (action atomicity — out-of-scope, within-action, not an action-vs-action interleaving). The buggy twin demonstrates *why* atomicity is needed (the TOCTOU non-atomic allocate in the original twin reachably overshoots, proving the need for serializable atomic execution), but the crash-atomicity question — whether the audit-log append and running-total update co-commit under process failure — is not a reachable state in a trace model. Invariant 14's formal-layer vote is therefore reconsidered to **out-of-scope (within-action, not an interleaving)**.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** The derived model is [`capacity-constraint-enforcement.tla`](./capacity-constraint-enforcement.tla) with config [`capacity-constraint-enforcement.cfg`](./capacity-constraint-enforcement.cfg), checked by the repo's `tla-checker` WASM model checker via `tools/harness/check.mjs`.

*What it checks.* `Workers` concurrent allocators and releasers each holding at most one unit against a pool of fixed `Capacity`; `allocated` is the running total; `status[w]` tracks whether each worker is "idle" (can allocate) or "allocated" (can release). The load-bearing **Invariant 4** (capacity constraint — `allocated ≤ capacity`) is checked under every interleaving of concurrent atomic allocations. **Invariant 5** (non-negativity — `allocated ≥ 0`) is checked under every interleaving of concurrent allocations and releases; `ReleaseAtomic(w)` guards on `status[w] = "allocated" ∧ allocated ≥ 1`, so the non-negativity invariant is non-vacuous — it is genuinely exercised by the release path, not just trivially satisfied by an allocate-only model.

*Modeling choices.* The correct model makes `allocate` a single **atomic check-and-commit** step — the serializable execution Invariant 4's host obligation requires. `release` is similarly atomic and guarded: `status[w] = "allocated"` (one unit per worker) and `allocated ≥ 1` together enforce the English spec's `count ≤ allocated` precondition. The guard is the real enforcement surface for Inv5; the buggy twin omits it to prove the check has teeth.

*Bounds and scope.* `Capacity = 2`, `Workers = {w1, w2, w3}` (more workers than capacity, so the bound binds). Exhaustive: 7 reachable states, all invariants hold. Bound saturation verified: at `Capacity = 3`, `Workers = {w1, w2, w3, w4}` → 15 states (C(4,0..3) = 1+4+6+4); at `Capacity = 3`, `Workers = {w1, w2, w3, w4, w5}` → 26 states (C(5,0..3) = 1+5+10+10); state count grows by exact binomial increments, invariants hold at each — saturated. Deliberately **out of model scope**: adjust_capacity / suspend / resume / close lifecycle (the bound is exercised by allocate and release against fixed capacity); field-validation and storage-failure guards; audit-log append (Invariants 9–11); crash atomicity (Invariant 14 — a within-action obligation, not an interleaving one; see formal-layer vote reconsideration 2026-06-04).

*Buggy twin (vacuity guard).* [`capacity-constraint-enforcement-buggy.tla`](./capacity-constraint-enforcement-buggy.tla) drops both the `status[w] = "allocated"` guard and the `allocated ≥ 1` guard from `ReleaseBuggy` — modeling a **release-without-prior-allocation bug**: `ReleaseBuggy` fires on any worker in any state. `AllocateAtomic` is retained unchanged so that Inv4 is not violated; the bug isolates to the release path and Inv5_NonNegativity. The checker rejects the twin at 3 states in a single step: `Init` (allocated = 0, all workers "idle"), `ReleaseBuggy(w1)` (allocated → -1) — Inv5_NonNegativity violated immediately because no status guard prevents a release-with-nothing-allocated. The twin proves the release guard is load-bearing: drop it and non-negativity is reachably violated from the initial state; keep it and the invariant holds under every interleaving. The Inv 4 TOCTOU non-atomic-allocate hazard is retained as a **second isolated twin**, [`capacity-constraint-enforcement-buggy-toctou.tla`](./capacity-constraint-enforcement-buggy-toctou.tla) (`AllocateObserve`/`AllocateCommit` split lets two workers observe the last free unit and both commit, overshooting to 3 > 2; rejected at 27 states on `Inv4_CapacityConstraint`, with Inv5 holding). The two isolated twins give Inv 4 and Inv 5 each their own dedicated counterexample; both are auto-discovered and required-to-reject by `tools/harness/audit.mjs`.

*Conflict-protocol outcome.* None triggered. The model **corroborates** the English — under atomic allocate and guarded release both the capacity bound and non-negativity hold across every interleaving, exactly as Invariants 4 and 5 claim contingent on the host obligations, and the buggy twin makes the contingency mechanical. No counterexample flowed back; the canonical English is unchanged. Reproduce with `cd tools/harness && bash bootstrap.sh && node check.mjs ../../atoms/capacity-constraint-enforcement.tla` (and `… capacity-constraint-enforcement-buggy.tla --buggy`).

---

**Logic Confinement clock-injection touch + Final Critique 6 — 2026-08-24.** Load-bearing touch: the atom declared an *implicit clock*, inconsistent with [`execution-contract.md`](../execution-contract.md) §Logic Confinement rule 3 and with Retention Window's own Final Critique 5 treatment (2026-06-23). Changes: Inputs bullet rewritten to seam injection; a *Logic confinement (clock and id)* note added to Decision points; *Clock semantics* rewritten. **Caller signatures are UNCHANGED** (the seam, not a parameter, is the contract for clock entry), so the change is additive with no constituent-change cascade. Gates: linter 0 findings; harness re-run green — `capacity-constraint-enforcement.tla` PASS at 7 states, `capacity-constraint-enforcement-buggy.tla --buggy` rejected at 3 states and `capacity-constraint-enforcement-buggy-toctou.tla --buggy` rejected at 27 states; the clock is out of model scope, so the formal-layer vote is unchanged.

*Final Critique 6 — closing fresh-reader round (Opus, Happy-Torvalds-X2, fresh-reader throughout; Lineage withheld from the reviewer until findings were formed). Verdict: **not clean — two foundational findings**; atom downgraded to `partially resolved` pending closure.* The clock work itself cleared the round. Findings recorded as surfaced, **open**:

- *C-F1 — capabilities pinned on Retention Window that it does not expose — foundational →* Invariant 8 rests on Retention Window "erasing" attribution fields, Invariants 1 and 9 on it "archiving to cold storage", and Generation acceptance on a "retention-boundary snapshot" — but Retention Window declares only `place_under_retention` and `purge`, has no field-level scrub and no snapshot surface, and routes tiering to Storage Tier. Re-home each to a declared source per §Capability provenance.
- *C-F2 — [Declare Pool] behavior on an id collision is undefined — foundational →* There is no guard and no `id-collision` rejection, yet the *Id-generation discipline* edge case explicitly contemplates a colliding generator; "overwrite the existing pool" is a compliant reading of the current text and silently destroys a pool's arithmetic. Name the runtime response or state seam-guaranteed non-collision as a hard precondition.
- *Refining/rhetorical (open):* C-F3 Invariants 5 and 13 unconditional where Invariant 4 is conditional; C-F4 [Now] card's `Parameter of` list (partially addressed 2026-08-24 — list completed to all seven consuming operations; the reviewer's objection to `Kind: Parameter` itself is declined, since Retention Window's [Now] card uses the identical kind); C-F5 undefined acronyms and the AI/PC/DP/TT/RW initialism cluster; C-F6 edge cases name composing patterns without links; C-F7 in-atom audit log's EOS boundary asserted not defended; C-F8 Intent's "one rule and one rule only" falsified by the atom's own surface; C-F9 Summary calls the log "permanent, attributed"; C-F10 no-op-adjust rejection is state-relative but assigned the field-format reason; C-F11 [Pool Id] has no primitive policy; C-F12 store-read failure has no named outcome; C-F13 [Available] both stored and derived; C-F14 `suspended`/`closed` rejection tokens have no cards.

**Showcase pass — 2026-06-29 (from-scratch full-showcase conversion).** This atom had no `[Term]` annotation; this pass does the four-kind annotation **and** the showcase disciplines together, mirroring the [`duplicate-prevention.md`](./duplicate-prevention.md), [`provisional-commitment.md`](./provisional-commitment.md), and [`session.md`](./session.md) exemplars — the largest conversion in the corpus (8 operations, four audit-event classes, 14 invariants). **Annotation inventory (46 Terms):** eight **Operations** ([Declare Pool], [Allocate], [Release], [Adjust Capacity], [Suspend Pool], [Resume Pool], [Close Pool], [Query]); twenty-five **Fields** — the pool-level [Pool Id], [Capacity], [Allocated], [Available], [State], [Declared At], [Declaring Actor Ref], [Declaration Reason], plus the four event ids ([Allocation Event Id], [Release Event Id], [Adjustment Event Id], [State Change Id]) and the per-event data fields ([Count], [Allocated Before], [Allocated After], [Prior Capacity], [New Capacity], [Prior State], [New State], [Recorded At], [Allocating Actor Ref], [Releasing Actor Ref], [Adjusting Actor Ref], [Acting Actor Ref], [Reason]); one **Parameter** ([Now], the implicit clock, never stored under that name); and twelve **Members** — the three states [Open]/[Suspended]/[Closed] (no `Projects:` — pure states; [Suspended]/[Closed] double as the `allocate`-against-that-state rejection reasons) and the nine rejection reasons [Over Capacity], [Over Release], [Over Allocated], [Not Known], [Not Open], [Not Suspended], [Already Closed], [Invalid Request], [Storage Failure]. The discriminator *stored-as-itself → Field, consumed/transient → Parameter* placed every datum: [Count]/[New Capacity]/the actor refs/[Reason] are stored on events (Fields) even though they are also action arguments; only the clock reading [Now] is consumed-not-stored. No **Type** card — the record is referred to plainly as "a pool" (Fields are *Field of: Pool* or *Field of:* their event class), mirroring [`permissions.md`](./permissions.md). Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). Survivors kept backticked: the eight action signatures' projected-contract forms; the concrete example invocations and their literal values/returns throughout Flow and Examples (the domain walkthroughs are illustrative wire-level calls, kept concrete as in the exemplars); the `*_actor_ref` wildcard and the `MAX_INT` / `WAL` literals. **Disciplines:** Summary moved to the very top + the descriptive blockquote folded out as redundant (every claim already carried by Summary/Intent/State/Invariants) + [`prose.md`](../working-ideas/prose.md) cut #1 (Summary run-on split, lossless); cut #5 — the State `Transitions:` list (twenty mixed lifecycle-and-arithmetic bullets) rendered as a **transition table** (action · from state · guard · effect · result), with three cell-resistant semantics kept in prose beside it (rejected-action-writes-nothing; [Release] the one mutation admitted in every state; store-write-failure all-or-none plus the fixed rejection priority cross-referenced to Decision points); Lineage collapsed into this `<details>`. Cuts #2/#3 assessed and skipped (acronyms inline; provenance lives in the invariants/Composition notes). **Representational only** — every invariant and its number (1–14) is unchanged in force, including Invariant 4's [Allocated] ≤ [Capacity] bound with its three named host obligations, Invariant 5's non-negativity, the per-event snapshot arithmetic ([Allocated After] = [Allocated Before] ± [Count]), the audit-identifier/attribution two-surface split (Invariant 8), and the append-only discipline (Invariant 9); all eight projected-contract signatures, the priority ordering, and the Generation-acceptance reconstruction modes are identical; every `[Term]` resolves to its card. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 5 — 2026-05-20`. Gates: linter 0 (incl. the O-term resolver — all of this page's markers resolve against the registry); the TLA+ model `capacity-constraint-enforcement.tla` and **both** buggy twins (`capacity-constraint-enforcement-buggy.tla`, `capacity-constraint-enforcement-buggy-toctou.tla`) are **UNTOUCHED** and still PASS / correctly-rejected (Inv5 underflow and Inv4 TOCTOU hazards); the derived manifest projects an identifier kind (Field) and an enumerated kind (Member); `git status` shows only this `.md` modified (no `.tla`/`.cfg`); diff read line-by-line against the same-claim-or-weaker test.

</details>
