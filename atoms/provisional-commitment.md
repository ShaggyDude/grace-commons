---
title: Provisional Commitment
parent: Atomic Concepts
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


## Summary

Provisional Commitment models the everyday business act of "holding" something for someone while they decide whether to go through with it — a credit-card authorization, a hospital bed, an item in a cart, a hotel room, an airline seat. A hold starts when it is placed and stays active for a fixed decision window. It is resolved into one of three recorded end states: Confirmed (the person went through with it), Released (they gave it back), or Expired (the window closed with no decision). The window is a promise in both directions. The system keeps the resource reserved until the window closes. The person must decide before it does, or the hold expires. Resolving exactly once is the core guarantee. After a hold reaches an end state, any further attempt is told it is already resolved. A confirm or release attempted after the window has closed is told the window has elapsed. An expire attempted before the window has closed is told the window has not yet elapsed. Each hold gets a permanent internal identifier. The resource, the requester, and the window are all fixed when the hold is placed and never change. So once a hold settles, it is a clean, unambiguous record of what happened — one an auditor can reconstruct from the records alone. The pattern deliberately leaves out related concepts — making retries safe, keeping a full step-by-step history, and enforcing pool-wide limits like overbooking caps — because each of those is handled by a separate pattern that attaches to this one, which keeps this pattern small and its guarantees clear.

*Also known as: a hold, a reservation, a tentative reservation, a two-phase reservation.*

---

## Intent

A requester needs a resource whose grant is not yet certain. The system promises to hold the resource for the requester for a known period, during which the requester decides whether to confirm (taking the resource into a binding allocation) or release (returning it to availability). If the requester does neither before the period elapses, the hold expires: the resource returns to availability and the [Commitment] moves to a terminal [Expired] state recorded by an [Expire] event (fired by a scheduler/sweep at the deadline or lazily on the next access). Expiry is a real transition with a side effect — returning the resource (and, in a pool-backed composition, a capacity slot) to availability — which is why it is an explicit recorded event rather than a status inferred at read time.

The pattern addresses a class of needs that recur across virtually every regulated industry: credit-limit holds at banks (pending settlement), bed assignments at hospitals (pending admission), inventory reservations at retailers (pending checkout), room bookings at hotels (pending check-in), seat holds at airlines (pending purchase). The shape is constant — a resource is encumbered for a bounded window, the encumbrance resolves into commitment or release (or its window lapses), and the audit record of the encumbrance is itself a regulated asset.

This is a freestanding atom (can be specified without naming any other pattern) in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the [Commitment] record and its resolution), its own actions ([Place Hold], [Confirm], [Release], [Expire]), and its own operational principles (single-resolution, the honored-window guard, and the three terminal transitions are absorbing). It does not implement idempotency (submitting the same operation twice produces the same result as once) under retry, the full audit trail of every observation, or aggregate capacity constraints over a resource pool. Each is a separate composable atom; see Composition notes.

---

## Structure

### Identity model

Every [Commitment] known to the system has an **[Id]** — an opaque, immutable, assigned on [Place Hold] from injected id material at the seam. The id is the [Commitment]'s identity; the [Resource] binding, [Requester], and hold window are immutable *properties* of the [Commitment], not its identity.

Two commitments for the same [Resource] have different ids — sequential or concurrent commitments are distinct, even when they share a [Resource] or a [Requester]. Ids are not reused after a [Commitment] is resolved ([Confirmed], [Released], or [Expired]).

The opaque-id model is load-bearing. Identifying a [Commitment] by its `(resource, requester)` pair would muddle re-holds — a requester re-holding the same resource after an earlier release is a *different* [Commitment] with its own audit trail. Identifying by hold timestamp would lose precision under concurrent commitments. Opaque ids preserve the one-commitment-one-id discipline that makes per-event audit reconstruction tractable, which is the regulatory expectation in every domain this atom covers.

### Inputs

- A [Resource] reference identifying what is being held. The atom treats this as opaque — the implementation defines the resource registry and what *availability* means.
- A [Requester] reference identifying who the hold is for.
- A hold window [Duration], supplied at creation. The window opens at [Placed At] and closes at [Expires At] = [Placed At] + [Duration].
- User- or system-initiated actions. Every action consumes the current clock reading [Now] as a **pipeline-implicit input** (the pipeline's `clock_t`, supplied at the I/O seam — not read inside the transition, not trusted from the caller, and not shown as a signature parameter). [Now] is consumed for two clearly separated purposes: stamping immutable timestamps on a transition (execution time), and evaluating the pure honored-window guard. See the Logic-confinement note in Decision points.
  - [Place Hold] — record a new [Commitment] held for a [Requester]. (Projected contract: `place_hold(resource, requester, duration) → id | rejected(invalid-request | resource-unavailable | storage-failure)`.)
  - [Confirm] — take a held [Commitment] into a binding allocation. (Projected contract: `confirm(id) → ok | rejected(not-known | not-held | window-elapsed | storage-failure)`.)
  - [Release] — return a held [Commitment]'s resource to availability. (Projected contract: `release(id) → ok | rejected(not-known | not-held | window-elapsed | storage-failure)`.)
  - [Expire] — move a lapsed held [Commitment] to its terminal [Expired] state and return the resource. (Projected contract: `expire(id) → ok | rejected(not-known | not-held | window-not-elapsed | storage-failure)`.)
- [Not Held] names a *terminal* [Commitment] — already [Confirmed], [Released], or [Expired]. [Window Elapsed] is the distinct rejection when [Confirm]/[Release] is attempted on a still-[Held] [Commitment] past the window; [Window Not Elapsed] is the symmetric rejection when [Expire] is attempted before the window has closed.
- Id material (the source of opaque, unique commitment identifiers) is likewise injected at the seam and not generated internally.

### Outputs

- The current set of [Held] commitments.
- The current set of [Confirmed], [Released], and [Expired] commitments (the three terminal states).
- For each [Commitment]: [Id], [Resource], [Requester], [Placed At], [Expires At], the state ([Held], [Confirmed], [Released], or [Expired]), and the timestamp of the most recent transition.
- Action acknowledgements — success (returning `id` for [Place Hold], `ok` otherwise) or rejection with a named reason.

### State

Each [Commitment] carries a state field. The state machine has one non-terminal state and three terminal states:

- **[Held]** — the resource is encumbered for the requester; the window is open; no resolution has occurred. The only non-terminal state.
- **[Confirmed]** — the requester confirmed within the window; the resource is taken into a binding allocation. Terminal.
- **[Released]** — the requester (or a system acting on their behalf) released within the window; the resource returns to availability. Terminal.
- **[Expired]** — the window lapsed ([Now] ≥ [Expires At]) with the [Commitment] still [Held], and an [Expire] event then fired (by a scheduler/sweep or lazily on access), moving it to this terminal state and returning the resource to availability. Terminal.

There is no *Unheld* state in the system's record. Unheld describes the period before [Place Hold] is called and after a commitment's effect on the resource has concluded — it is a property of the resource, not of the [Commitment]. The commitment lifecycle proceeds: Unheld → ([Place Hold]) → [Held] → one of {[Confirmed], [Released], [Expired]}. All three terminal states are absorbing.

Each [Commitment] carries:

- **[Id]** — opaque, immutable, assigned on [Place Hold] from injected id material at the seam. Never changes.
- **[Resource]** — the resource reference. Set on [Place Hold]. Never changes.
- **[Requester]** — the requester reference. Set on [Place Hold]. Never changes.
- **[Placed At]** — set on [Place Hold] from the implicit [Now]. Never changes.
- **[Expires At]** — set on [Place Hold] as [Placed At] + [Duration]. Immutable. Never changes.
- **state** — [Held] | [Confirmed] | [Released] | [Expired]. Set to [Held] on [Place Hold]; immutable once it reaches a terminal.
- **[Confirmed At]** — set on [Confirm], present only in [Confirmed]. Immutable once set.
- **[Released At]** — set on [Release], present only in [Released]. Immutable once set.
- **[Expired At]** — set on [Expire], present only in [Expired]. Immutable once set. ([Expires At] ≤ [Expired At]: the expire event fires only once the window has closed.)

Transitions — every transition below stamps its timestamp from the pipeline-implicit [Now], and no transition reads the clock internally:

| action | from | to | window guard | stamps | result | rejections |
|--------|------|----|--------------|--------|--------|-----------|
| [Place Hold] | *Unheld* (no record) | **[Held]** | — | fresh [Id]; [Placed At] = [Now]; [Expires At] = [Now] + [Duration] | the new `id` | [Invalid Request]; [Resource Unavailable]; [Storage Failure] |
| [Confirm] | [Held] | **[Confirmed]** | [Now] < [Expires At] | [Confirmed At] = [Now] | `ok` | [Not Known]; [Not Held]; [Window Elapsed]; [Storage Failure] |
| [Release] | [Held] | **[Released]** | [Now] < [Expires At] | [Released At] = [Now] | `ok` | [Not Known]; [Not Held]; [Window Elapsed]; [Storage Failure] |
| [Expire] | [Held] | **[Expired]** | [Now] ≥ [Expires At] | [Expired At] = [Now]; resource returns to availability | `ok` | [Not Known]; [Not Held]; [Window Not Elapsed]; [Storage Failure] |

Four semantics the cells cannot hold:

- *The window boundary is exact, and a failed guard writes nothing.* [Confirm] and [Release] are legal strictly while [Now] < [Expires At]; [Expire] is legal only once [Now] ≥ [Expires At]. The boundary at [Now] = [Expires At] is the single point where the clock decides which transition may fire — resolution below it, expiry at or above it. When the guard fails, the record is left [Held] and nothing is written: a late [Confirm]/[Release] is rejected [Window Elapsed], a premature [Expire] is rejected [Window Not Elapsed]. The atom never records a resolution after the window closes, nor an expiry before it.
- *Expiry may fire eagerly or lazily.* The [Expire] event may be fired eagerly by a scheduler/sweep at the deadline, or lazily on the next access to a lapsed hold — a deployment-shaped choice (see Behavior and Edge cases). Either way the resource (and, in a pool-backed composition, a capacity slot) returns to availability, which is why the lapse is a written transition and not a read-time inference.
- *The three terminal states are absorbing.* There are no transitions out of [Confirmed], [Released], or [Expired]; the atom has no `unconfirm`, `un-release`, or `reactivate` surface. A resolving action on an already-terminal [Commitment] is rejected [Not Held] (Invariant 3).
- *Rejection priority is fixed.* For each resolving action the order is [Not Known] → [Not Held] → the window guard ([Window Elapsed] for [Confirm]/[Release], [Window Not Elapsed] for [Expire]) → [Storage Failure]; for [Place Hold] it is [Invalid Request] → [Resource Unavailable] → [Storage Failure]. The full per-action preconditions are in Decision points.

### Flow

1. **Place hold.** The requester signals intent to use the resource without binding. The system records the [Commitment] in [Held] with a fresh id, [Placed At], and [Expires At]. Returns the id. *(Start.)*
2. **Wait.** While the [Commitment] is in [Held] and [Now] < [Expires At], the resource is encumbered for the requester.
3. **Resolve, or expire.** While [Now] < [Expires At], exactly one of two resolving transitions may occur: [Confirm] ([Held] → [Confirmed]) or [Release] ([Held] → [Released]). If neither fires before the window closes, the [Commitment] **expires**: once [Now] ≥ [Expires At], an [Expire] event ([Held] → [Expired]) returns the resource to availability and records [Expired At]. A [Confirm]/[Release] attempted after the window is rejected [Window Elapsed]; an [Expire] attempted before the window is rejected [Window Not Elapsed].
4. **Settled.** The [Commitment] is in one of three terminal states ([Confirmed], [Released], or [Expired]). Its record persists for audit. *(End.)*

### Decision points

Each action carries explicit preconditions. Violations are rejected, not silently absorbed.

**Logic confinement (clock and id).** The clock and the id are **pipeline-implicit, supplied at the I/O seam** (Step 3 of the execution contract), never produced inside a transition and not shown as action signature parameters. [Now] (`clock_t`) is read once by the pipeline at the seam and consumed by the action; the [Id] is assigned from injected `id_t` id material at the seam, not generated internally (per the Logic Confinement Principle, see [`execution-contract.md`](../execution-contract.md)). A guard's window test is a **pure function of the record and the implicit [Now]** — state = [Held] ∧ [Now] < [Expires At] for [Confirm]/[Release], and state = [Held] ∧ [Now] ≥ [Expires At] for [Expire]. The clock is consumed by (a) those pure guards and (b) the immutable timestamp stamps inside a committed transition ([Placed At], [Confirmed At], [Released At], [Expired At]), each set from the same implicit [Now]. Each transition is thereby a pure function of its record state, inputs, [Now], and id material, with both sources auditable at the deployment layer. Rejection priority for each action: [Not Known] → [Not Held] → window guard ([Window Elapsed] for [Confirm]/[Release], [Window Not Elapsed] for [Expire]) → [Storage Failure].

- **At [Place Hold]** — [Resource], [Requester], and [Duration] must be well-formed; otherwise [Invalid Request]. [Duration] must be positive and within implementation bounds; otherwise [Invalid Request]. The resource must be available for holding under the registry's availability rules; otherwise [Resource Unavailable]. [Placed At] = [Now] and [Expires At] = [Now] + [Duration] are computed once from the implicit [Now] and stored immutably. If the store write fails, the atom returns [Storage Failure]; no [Commitment] is created.
- **At [Confirm]** — [Id] must reference a known [Commitment]; otherwise [Not Known]. The referenced [Commitment] must have state = [Held]; otherwise [Not Held] (it is already a terminal — [Confirmed], [Released], or [Expired]). **Window guard:** if [Now] ≥ [Expires At] — a lapsed, still-[Held] [Commitment] — confirmation is rejected as [Window Elapsed]; the record is left [Held] and nothing is written. The atom never writes a resolution after the window closes. If the store write fails, the atom returns [Storage Failure]; the [Commitment] remains in [Held].
- **At [Release]** — [Id] must reference a known [Commitment]; otherwise [Not Known]. The referenced [Commitment] must have state = [Held]; otherwise [Not Held]. **Window guard:** if [Now] ≥ [Expires At], release is rejected as [Window Elapsed]; the record is left [Held] and nothing is written. (A caller wishing to return a resource *before* its window closes calls [Release] while [Now] < [Expires At]; after the window closes the [Commitment] is [Expire]d instead, which also frees the resource.) If the store write fails, the atom returns [Storage Failure]; the [Commitment] remains in [Held].
- **At [Expire]** — [Id] must reference a known [Commitment]; otherwise [Not Known]. The referenced [Commitment] must have state = [Held]; otherwise [Not Held]. **Window guard:** if [Now] < [Expires At], expiry is rejected as [Window Not Elapsed]; the record is left [Held] and nothing is written. The atom never expires a [Commitment] before its window closes. If the store write fails, the atom returns [Storage Failure]; the [Commitment] remains in [Held].

### Behavior

Observed behavior, derived from how regulated systems use provisional commitments:

- **Single-resolution is the atom's central guarantee.** Each resolving transition — [Confirm], [Release], [Expire] — checks the state as its first operation. If the state is already a terminal ([Confirmed], [Released], or [Expired]), the action returns [Not Held] without modifying any record. The check-and-commit from [Held] to a terminal must be atomic: under concurrent resolving transitions, exactly one commits and the rest see [Not Held]. An implementation that writes two terminal states for one [Commitment] has violated the atom's core contract.
- A hold is not a promise of confirmation. The requester is free to release at any time before the window elapses; release is a normal audited outcome, not a failure mode.
- The hold window is a contract with two faces: a commitment to the requester (the resource is theirs to confirm within the window) and a constraint on the requester (decide within the window or the hold expires). Both faces are load-bearing — auditors check both.
- **Expiry may be eager or lazy, but it is always a recorded transition with a side effect.** When [Now] ≥ [Expires At], an [Expire] event moves a still-[Held] [Commitment] to [Expired] and returns the resource to availability. A deployment may fire it **eagerly** — a scheduler/sweep that calls [Expire] at (or shortly after) [Expires At] — or **lazily** — [Expire] fired on the next access to a lapsed hold. The eager-vs-lazy choice has audit implications: under lazy expiry a lapsed-but-not-yet-expired [Commitment] is still [Held] until something touches it, so the resource is reclaimed at sweep/access time rather than precisely at [Expires At]. The side effect — returning the resource (and, in a pool-backed composition, a capacity slot) to availability — is why expiry is an explicit event rather than a read-time inference: a side-effect-free lapse could be derived, but this lapse releases a resource and so needs a write. A [Confirm]/[Release] attempted on a lapsed hold is rejected [Window Elapsed] before any expire fires; an [Expire] attempted before the window closes is rejected [Window Not Elapsed].
- Concurrent [Place Hold] calls for the same resource resolve serially under a **declared deployment obligation**, not an ambient host guarantee: the registry runs the availability read and the hold write for one resource as a single section on that resource, released on the caller's return or death, and a registry that cannot supply it is the breakdown case named in Edge cases. Whichever call wins the race produces a [Held] [Commitment]; the loser receives [Resource Unavailable].
- The [Commitment] record persists in its terminal state indefinitely from the atom's perspective. Retention, archival, and purge (permanent, unrecoverable removal from storage) are composing concepts; the regulated-deployment composition is with [Retention Window](./retention-window.md).
- Audit trails read the [Commitment] record directly. Every transition has a timestamp; every [Commitment] names a [Requester] and a [Resource]. This is the minimum surface a regulator expects.
- **[Now] and the id material are pipeline-implicit at the deployment seam, not signature parameters.** Every action consumes [Now] (the pipeline's `clock_t`) supplied at the I/O seam, and [Place Hold]'s id material is supplied by the deployment's source at the seam — per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the core transition neither reads a wall clock nor generates an id internally. [Now] is consumed only by (a) the pure window guards and (b) the immutable timestamp stamps inside committed transitions ([Placed At], [Confirmed At], [Released At], [Expired At]), so each transition is a pure function of its record state, inputs, [Now], and id material, with both sources auditable at the deployment layer.

### Feedback

Each successful action produces an observable, measurable change:

- After [Place Hold] — a new [Commitment] appears in [Held] with a fresh [Id], [Placed At], [Expires At]. Held count and total count each increase by one. The id is returned to the caller.
- After [Confirm] — the [Commitment] moves [Held] → [Confirmed] with [Confirmed At]. Held count decreases by one; Confirmed count increases by one; total count unchanged.
- After [Release] — the [Commitment] moves [Held] → [Released] with [Released At]. Held count decreases by one; Released count increases by one; total count unchanged.
- After [Expire] — the [Commitment] moves [Held] → [Expired] with [Expired At]; the resource returns to availability. Held count decreases by one; Expired count increases by one; total count unchanged.

Each rejected action produces an observable refusal naming the failed precondition: [Invalid Request], [Resource Unavailable], [Not Held], [Not Known], [Window Elapsed], [Window Not Elapsed], or [Storage Failure].

The [Held], [Confirmed], [Released], and [Expired] sets are queryable — operators can list, filter, and count them at any time. Per-commitment fields are observable to operators and (where appropriate) to requesters.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Membership exclusivity.** For every [Commitment] `c` known to the system, `c` is in exactly one of {[Held], [Confirmed], [Released], [Expired]}, never in two states, never in none.
- **Invariant 2 — Single-resolution.** A [Commitment] reaches **at most one** terminal state — [Confirmed], [Released], or [Expired] — and no further transition is permitted after that. Any resolving action ([Confirm], [Release], [Expire]) called on an already-terminal [Commitment] returns [Not Held]. The check-and-commit from [Held] to a terminal must be atomic, so that under concurrent resolution attempts exactly one commits.
- **Invariant 3 — Terminal absorption.** Once a [Commitment] enters [Confirmed], [Released], or [Expired], no action transitions it elsewhere. The atom has no `unconfirm`, `un-release`, or `reactivate` surface.
- **Invariant 4 — Id stability.** A [Commitment]'s [Id] is set on [Place Hold] and never changes.
- **Invariant 5 — Resource and requester immutability.** A [Commitment]'s [Resource] and [Requester] are set on [Place Hold] and never change. Re-holding the same resource for the same requester produces a *new* [Commitment] with a new id.
- **Invariant 6 — Hold window monotonicity.** For every [Commitment], [Placed At] < [Expires At]. The [Duration] supplied to [Place Hold] is positive.
- **Invariant 7 — Confirmation within the window.** A [Commitment] can transition to [Confirmed] (or [Released]) only while [Now] < [Expires At]. After the window elapses, confirmation and release are rejected [Window Elapsed]; the only legal terminal transition from [Held] is [Expire] (guarded [Now] ≥ [Expires At]). This is what guarantees no resolution is ever recorded after the declared window closes, and no expiry before it.
- **Invariant 8 — Transition timestamps strictly after placement.** For any [Commitment]: if [Confirmed At] is defined, [Placed At] ≤ [Confirmed At]; if [Released At] is defined, [Placed At] ≤ [Released At]; if [Expired At] is defined, [Expires At] ≤ [Expired At] (expiry cannot run before its scheduled time).
- **Invariant 9 — No id reuse.** No two distinct commitments share an [Id], across the lifetime of the system.
- **Invariant 10 — Commitment store durability.** Once recorded, a [Commitment] is never deleted from the store. [Confirm], [Release], and [Expire] transition a [Commitment] to a terminal state; they do not remove the record. The total commitment count is monotonically non-decreasing. Retention, archival, and purge are composing concepts ([Retention Window](./retention-window.md)).

Membership exclusivity, single-resolution, and terminal absorption together give the *audit-friendly* property — once a [Commitment] settles, its record is a fact about the past, not a candidate for revision. Confirmation within the window (Invariant 7) gives the *honored-window* property — auditors can verify, structurally, that no [Commitment] was confirmed or released after its declared window, and none expired before it. Resource and requester immutability gives the *one-commitment-one-id* property that makes per-event audit reconstruction tractable. Commitment store durability gives the *irrevocable-record* property — the audit surface cannot be silently reduced by deletion.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Banking — credit-limit hold

A merchant submits a $250 authorization against a customer's card. The bank calls `place_hold(card_resource, cardholder, 7-days)` → `id` = `auth_c41` (`placed_at = now`, `expires_at = now + 7 days` per scheme rules). The cardholder's available credit drops by $250. Three days later the merchant captures the authorization — `confirm(auth_c41)`; the window is still open (`now < expires_at`), so the $250 becomes a settled charge. Alternatively the merchant voids the authorization within seven days — `release(auth_c41)`; available credit restores. If the merchant does neither, on the eighth day the authorization expires — `expire(auth_c41)` (fired by the scheme's settlement sweep once `now ≥ expires_at`); the $250 hold is dropped and available credit restores; any late `confirm(auth_c41)` is rejected `window-elapsed`. Each transition is recorded for liquidity reporting under the bank's BCBS-aligned (Basel Committee on Banking Supervision — the international body that sets bank-capital and liquidity standards) framework.

### Healthcare — bed assignment

The emergency department requests a bed for a patient awaiting admission. The bed-management system calls `place_hold(bed_resource, patient, 2-hours)` → `id` = `bed_h17` (`placed_at = 14:00`, `expires_at = 16:00`). The bed shows as *encumbered* on the unit dashboard. At 14:45 the patient arrives on the unit — `confirm(bed_h17)`; `now < expires_at`, so the bed becomes officially assigned. Alternatively the patient is discharged from the ED instead — `release(bed_h17)`; the bed returns to available. If neither happens by 16:00, the bed-management system's sweep fires `expire(bed_h17)` (`now ≥ expires_at`); the hold moves to Expired and the bed returns to the available pool. The Joint-Commission-aligned care-coordination audit reads the commitment record directly.

### Retail — inventory reservation

A shopper adds a $1,200 laptop to their cart at an online retailer with inventory of one unit. The order-management system calls `place_hold(sku_resource, shopper, 15-minutes)` → `id` = `inv_r93` (`placed_at = 19:14`, `expires_at = 19:29`). The product page shows *one in stock, reserved* to other shoppers. At 19:18 the shopper completes checkout — `confirm(inv_r93)`; the unit transfers to the order. Alternatively the shopper empties their cart — `release(inv_r93)`; the unit returns. If the shopper abandons the cart silently, the cart sweep fires `expire(inv_r93)` from 19:29 (`now ≥ expires_at`); the hold moves to Expired, the unit is returned to available stock for other shoppers, and a late `confirm(inv_r93)` is rejected `window-elapsed`.

### Hospitality — room booking

A guest reserves a hotel room with a guaranteed-by-credit-card hold for two nights, check-in tomorrow. The property-management system calls `place_hold(room_resource, guest, duration)` → `id` = `rm_b58` (`placed_at = today 11:00`, `expires_at = tomorrow 18:00` — the property's standard cancellation cutoff). The room is unavailable to other reservations. The guest checks in at 17:30 tomorrow — `confirm(rm_b58)`; `now < expires_at`, so the booking becomes a stay. Alternatively the guest cancels by 18:00 tomorrow — `release(rm_b58)`; the room reopens. If neither happens, the property's sweep fires `expire(rm_b58)` from tomorrow 18:00 (`now ≥ expires_at`); the hold moves to Expired, the room reopens, and the property's no-show fee policy (a separate composing pattern, triggered off the Expired transition) takes effect.

### Airline — seat hold

A passenger selects a fare and a seat during booking. The reservation system calls `place_hold(seat_resource, passenger, 15-minutes)` → `id` = `seat_a22` (`placed_at = 09:33`, `expires_at = 09:48` — the carrier's standard 15-minute fare-lock per IATA (International Air Transport Association — the airline industry's global trade body) practice). The seat is unavailable to other booking sessions. The passenger pays at 09:40 — `confirm(seat_a22)`; the seat is ticketed. Alternatively the passenger backs out — `release(seat_a22)`; the seat returns. If the passenger abandons the booking flow, the fare-lock sweep fires `expire(seat_a22)` from 09:48 (`now ≥ expires_at`); the hold moves to Expired and the seat returns to availability for other sessions. The attached fare quote is invalidated whenever the hold leaves availability — on a `Released` or an `Expired` transition the composing layer observes the terminal state (a composing Fare Quote atom; out of scope here).

The mechanic is identical across all five. What differs: resource semantics, hold-window duration, the regulatory framing of the audit trail, and the composing atoms that handle fare locks, capacity caps, no-show fees, payment idempotency, and the like. In every case the expiry of an undecided hold is a recorded `expire` transition that returns the resource to availability.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts, beyond happy-path and rejection-path:

- **Regulator audit.** An auditor asks *"show me every credit-limit hold that was confirmed (or released) after its declared window."* The query reads the commitment records, filters where [Confirmed At] (or [Released At]) is defined and exceeds [Expires At], and returns the empty set. Invariant 7 (confirmation within the window) guarantees this structurally — the [Window Elapsed] rejection at the [Confirm]/[Release] actions makes a post-window resolution impossible to record, and the symmetric [Window Not Elapsed] guard on [Expire] makes a premature expiry impossible. The auditor sees a structural guarantee, not a procedural promise.
- **Data subject request.** A customer invokes their GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) right to erasure on personal data referenced by [Requester]. The atom on its own cannot satisfy erasure while preserving the structural audit trail — that tension is the same one Event Log names under right-to-be-forgotten. Composing with a Cryptographic Shredding or Erasure Tombstone pattern alongside legal counsel redacts the personal-data field while keeping [Id], [Placed At], [Expires At], state, and transition timestamps intact. The lifecycle — including the [Expire] transition — remains auditable; the personal data does not persist.
- **Breach investigation.** An incident responder needs the universe of resources committed during a window of suspected unauthorized access — say, 02:00–04:00 UTC (Coordinated Universal Time — the global time standard) on a given date. Each [Commitment] carries [Placed At]; the query reads the commitment record set and returns the matching set directly, with no log replay required. For each, the responder reads the terminal state and its timestamp to see which holds were resolved ([Confirmed]/[Released]) versus which expired. The Event Log composition adds the per-transition timeline needed to determine the exact ordering of the resolutions during the same window.

These scenarios exercise the atom against the questions regulators actually ask. Happy-path and rejection-path examples cover what users do; adversarial scenarios cover what auditors, data subjects, and investigators do.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Idempotency under retry.** If a requester invokes [Place Hold] twice for the same logical intent (network retry, double-click), the atom on its own produces two commitments. Idempotent reservation composes with [Duplicate Prevention](./duplicate-prevention.md), keyed on an idempotency token (a client-supplied token that makes repeated submissions safe) supplied by the requester. See Composition notes.
- **Full audit trail of state transitions.** The [Commitment] record carries one timestamp per terminal transition ([Confirmed At], [Released At], or [Expired At]), sufficient for *terminal-state* audit. Reconstructing the full sequence of observations — every read, every retry, every observer — requires composing with [Event Log](./event-log.md). The commitment record is the projection; the Event Log is the journal.
- **Aggregate capacity constraints.** Rules like *no more than 110 concurrent holds against a 100-seat aircraft* (overbooking limits, fractional reserves, inventory pool caps) belong to a separate Capacity Constraint Enforcement atom — *forthcoming*. The bare Provisional Commitment atom holds *one* resource per [Commitment] and does not opine on pool-level rules.
- **Partial release.** A [Commitment] is for one resource and resolves in full. Holding ten units and releasing three is two operations against two commitments at the registry's grain, not a partial transition of one [Commitment].
- **Renewal or extension of the hold window.** The atom forbids changing [Expires At] after placement (Invariant 6). Patterns that need a longer hold must place a new [Commitment] (a still-[Held], not-yet-expired original may be [Release]d first), producing a fresh id and a new audit entry. Mutating [Expires At] would silently break the honored-window property — and would retroactively change when [Expire] becomes legal.
- **Retroactive cancellation of a Confirmed commitment.** Once [Confirmed], the atom has no `unconfirm` action — terminal absorption is invariant. Refund, admission reversal, return-to-stock, and similar effects compose this atom with a separate Reversal pattern that produces a *new* compensating commitment, not a state change on the original.
- **Resource availability semantics.** The atom rejects [Place Hold] with [Resource Unavailable] if the registry says the resource is not hold-able, but does not define *hold-able*. The registry — a separate concept — owns that decision (another active hold, a maintenance lock, an out-of-stock signal, an account-level freeze).
- **Concurrency and atomicity.** State transitions are atomic. A crash mid-transition that leaves a [Commitment] in neither [Held] nor a terminal state violates membership exclusivity; the implementor owns the transactional boundary. Multi-commitment transactions belong to a Transaction pattern.
- **Clock semantics and the implicit clock.** Wall-time is accessed at the deployment seam — [Now] (the pipeline's `clock_t`) is supplied to each action by the pipeline rather than read from an internal clock, and the same implicit [Now] drives the pure window guards. The timestamps [Placed At], [Confirmed At], [Released At], and [Expired At] are stamped from that implicit [Now], never read inside a transition. Skew between the implicit [Now] and the underlying wall source, monotonicity, and timezone handling are handled at the deployment layer (clock quality is a deployment-layer decision, not part of this atom's contract); a composed Event Log's `sequence_number` is the authoritative order when transitions race. The window's correctness is best-effort under an adversarial clock; the action-vs-clock boundary at [Now] = [Expires At] — confirm/release legal strictly below it, expire legal at or above it — is the one place execution-time clock reads gate which transition may fire.
- **Eager vs. lazy expiry policy.** The atom requires [Expire] to be invoked to move a lapsed hold to [Expired], but does not mandate *when*. Eager expiry (scheduled sweeps firing at [Expires At]) bounds the Held-past-[Expires At] lag — the sweep cadence plus the [Expire] write latency, which the deployment that wires the sweep declares to lie strictly inside whatever reclamation window it promises — and reclaims the resource (and any composed pool slot) within that bound; lazy expiry (at next observation) is cheaper but lets a [Commitment] linger in [Held] past its window in records that have not been read, holding the resource until something touches it. Both are valid; the choice is deployment-shaped with different audit and resource-reclamation implications. (Because the lapse has a side effect — returning the resource to availability — it is a written transition either way, not a read-time derivation.)
- **The business meaning of confirmation.** The atom treats [Confirm] as a request from the requester (or a system acting on their behalf) and accepts it under preconditions. *Confirmation* meaning funds settled, patient admitted, item shipped, guest arrived, ticket issued, is host-system policy — not part of this atom. A confirmation later judged premature is the host's problem to compensate.
- **Non-repudiation.** The atom names a [Requester] reference on each [Commitment] but does not require cryptographic, procedural, or authentication-context binding of the action to the named requester. An adversary with write access to the commitment record could place or confirm a [Commitment] that the named requester did not authorize, and nothing in the atom's surface would surface the discrepancy. Verifiable attribution — signed authorization, MFA-bound (Multi-Factor Authentication — requiring two or more independent proofs of identity) caller context, witnessed approval — belongs to an [Actor Identity](./actor-identity.md) composition. See Composition notes.

Where the atom breaks down: when the resource is fungible at a finer grain than per-commitment (a block of 100 seats sold to a travel agent who sub-allocates to passengers — a multi-tier composition, not one commitment); when the hold window must be paused (medical urgency suspending elective procedure holds — a Pause/Resume pattern); when the resource registry cannot supply atomic, serialized place-hold semantics.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Commitment

The record this atom defines: a single resource held for a single requester for a bounded window, then resolved to exactly one terminal state. It carries its [Id], [Resource], [Requester], [Placed At], [Expires At], the state field below, and a transition timestamp ([Confirmed At], [Released At], or [Expired At]); the [Id], [Resource], [Requester], and hold window are immutable from creation. Its state field holds one of [Held], [Confirmed], [Released], or [Expired].

Kind: Type
Projects: state

#### Place Hold

The behavior that records a new [Commitment]. It assigns a fresh [Id] from injected id material at the seam, sets [Resource], [Requester], [Placed At] = [Now], and [Expires At] = [Now] + [Duration], enters the [Commitment] in [Held], and returns the [Id] (or a rejection naming the failed precondition).

Kind: Operation

#### Confirm

The resolving behavior that takes a [Held] [Commitment] into a binding allocation. Permitted only while state = [Held] and [Now] < [Expires At]; it moves the [Commitment] [Held] → [Confirmed] and stamps [Confirmed At]. After the window closes it is rejected [Window Elapsed]; on an already-terminal [Commitment] it is rejected [Not Held].

Kind: Operation

#### Release

The resolving behavior that returns a [Held] [Commitment]'s resource to availability before the window closes. Permitted only while state = [Held] and [Now] < [Expires At]; it moves the [Commitment] [Held] → [Released] and stamps [Released At]. After the window closes it is rejected [Window Elapsed]; on an already-terminal [Commitment] it is rejected [Not Held].

Kind: Operation

#### Expire

The resolving behavior — the side-effecting lapse event — that moves a lapsed [Held] [Commitment] to [Expired] and returns its resource (and, in a pool-backed composition, a capacity slot) to availability. Permitted only while state = [Held] and [Now] ≥ [Expires At]; it stamps [Expired At]. Before the window closes it is rejected [Window Not Elapsed]. May be fired eagerly by a scheduler/sweep or lazily on the next access.

Kind: Operation

#### Id

The opaque, immutable identity of a [Commitment], assigned on [Place Hold] from injected id material at the seam and never reused. The [Resource], [Requester], and hold window are properties of the [Commitment], not its identity.

Kind:     Field
Field of: Commitment
Projects: id

#### Resource

The reference identifying what is being held. The atom treats it as opaque — the implementation defines the resource registry and what *availability* means. Set on [Place Hold], immutable thereafter.

Kind:     Field
Field of: Commitment
Projects: resource

#### Requester

The reference identifying who the hold is for. Set on [Place Hold], immutable thereafter. The atom names the [Requester] but does not by itself bind the action to a verifiable actor — that is an [Actor Identity](./actor-identity.md) composition.

Kind:     Field
Field of: Commitment
Projects: requester

#### Placed At

The wall-time the [Commitment] was placed, stamped from the implicit [Now] on [Place Hold]. Immutable thereafter. The window opens here; [Placed At] < [Expires At] always holds.

Kind:     Field
Field of: Commitment
Projects: placed_at

#### Expires At

The wall-time the hold window closes, set on [Place Hold] as [Placed At] + [Duration]. Immutable thereafter. It is the boundary the window guards read: [Confirm]/[Release] are legal while [Now] < [Expires At], [Expire] once [Now] ≥ [Expires At].

Kind:     Field
Field of: Commitment
Projects: expires_at

#### Confirmed At

The wall-time the [Commitment] was confirmed, stamped from [Now] on [Confirm]. Present only in [Confirmed]; immutable once set. [Placed At] ≤ [Confirmed At] always holds.

Kind:     Field
Field of: Commitment
Projects: confirmed_at

#### Released At

The wall-time the [Commitment] was released, stamped from [Now] on [Release]. Present only in [Released]; immutable once set. [Placed At] ≤ [Released At] always holds.

Kind:     Field
Field of: Commitment
Projects: released_at

#### Expired At

The wall-time the [Commitment] expired, stamped from [Now] on [Expire]. Present only in [Expired]; immutable once set. [Expires At] ≤ [Expired At] always holds — expiry cannot run before its scheduled time.

Kind:     Field
Field of: Commitment
Projects: expired_at

#### Duration

The hold window length supplied to [Place Hold]. It sizes the window — [Expires At] = [Placed At] + [Duration] — but is not stored on the [Commitment] under its own name; the immutable [Placed At] and [Expires At] are what persist. It must be positive and within implementation bounds.

Kind:         Parameter
Parameter of: Place Hold
Projects:     duration

#### Now

The current clock reading every action consumes — the pipeline's `clock_t`, supplied at the I/O seam, never read inside the transition and never a signature parameter. It is consumed by (a) the pure window guards and (b) the immutable timestamp stamps inside committed transitions ([Placed At], [Confirmed At], [Released At], [Expired At]).

Kind:         Parameter
Parameter of: Place Hold
Projects:     now

#### Held

The single non-terminal state: the resource is encumbered for the requester, the window is open, and no resolution has occurred. The lifecycle proceeds [Held] → one of {[Confirmed], [Released], [Expired]}.

Kind:      Member
Member of: the commitment state
Role:      Outcome

#### Confirmed

The terminal state a [Commitment] reaches when the requester confirmed within the window — the resource is taken into a binding allocation. Absorbing: no action transitions it elsewhere.

Kind:      Member
Member of: the commitment state
Role:      Outcome

#### Released

The terminal state a [Commitment] reaches when it was released within the window — the resource returns to availability. Absorbing: no action transitions it elsewhere.

Kind:      Member
Member of: the commitment state
Role:      Outcome

#### Expired

The terminal state a [Commitment] reaches when the window lapsed with the [Commitment] still [Held] and an [Expire] event then fired — the resource returns to availability. Absorbing: no action transitions it elsewhere.

Kind:      Member
Member of: the commitment state
Role:      Outcome

#### Invalid Request

The refusal [Place Hold] returns when [Resource], [Requester], or [Duration] is not well-formed, or [Duration] is not positive or out of bounds. A guard rejection that fails before any store write; no [Commitment] is created.

Kind:      Member
Member of: the Place Hold rejection
Role:      Outcome
Projects:  invalid-request

#### Resource Unavailable

The refusal [Place Hold] returns when the registry says the resource is not hold-able under its availability rules. The loser of a concurrent place-hold race for the same resource also receives this. No [Commitment] is created.

Kind:      Member
Member of: the Place Hold rejection
Role:      Outcome
Projects:  resource-unavailable

#### Not Known

The refusal [Confirm], [Release], or [Expire] returns when the supplied [Id] references no known [Commitment]. A lookup miss, distinct from a state or window rejection.

Kind:      Member
Member of: the resolving-action rejection
Role:      Outcome
Projects:  not-known

#### Not Held

The refusal [Confirm], [Release], or [Expire] returns when the referenced [Commitment] is already terminal — [Confirmed], [Released], or [Expired]. This is the single-resolution guard: a resolving action on an already-resolved [Commitment] is refused without modifying any record.

Kind:      Member
Member of: the resolving-action rejection
Role:      Outcome
Projects:  not-held

#### Window Elapsed

The refusal [Confirm] or [Release] returns when [Now] ≥ [Expires At] — the still-[Held] [Commitment]'s window has closed. The record is left [Held] and nothing is written; the atom never records a resolution after the window closes.

Kind:      Member
Member of: the resolving-action rejection
Role:      Outcome
Projects:  window-elapsed

#### Window Not Elapsed

The refusal [Expire] returns when [Now] < [Expires At] — the window has not yet closed. The symmetric counterpart to [Window Elapsed]: the record is left [Held] and nothing is written; the atom never expires a [Commitment] before its window closes.

Kind:      Member
Member of: the Expire rejection
Role:      Outcome
Projects:  window-not-elapsed

#### Storage Failure

The refusal any action returns when the store write fails after the preconditions pass. No [Commitment] is created (for [Place Hold]) or the [Commitment] remains in [Held] (for the resolving actions); the caller must treat it as definitive, which rests on a declared deployment obligation — the store's write is acknowledged-atomic (it commits and acknowledges, or fails and leaves nothing), so a [Storage Failure] is never an in-doubt write — and a deployment whose store cannot supply that obligation routes the retry through the [Duplicate Prevention](./duplicate-prevention.md) composition rather than treating the refusal as definitive.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Commitment]: #commitment
[Place Hold]: #place-hold
[Confirm]: #confirm
[Release]: #release
[Expire]: #expire
[Id]: #id
[Resource]: #resource
[Requester]: #requester
[Placed At]: #placed-at
[Expires At]: #expires-at
[Confirmed At]: #confirmed-at
[Released At]: #released-at
[Expired At]: #expired-at
[Duration]: #duration
[Now]: #now
[Held]: #held
[Confirmed]: #confirmed
[Released]: #released
[Expired]: #expired
[Invalid Request]: #invalid-request
[Resource Unavailable]: #resource-unavailable
[Not Known]: #not-known
[Not Held]: #not-held
[Window Elapsed]: #window-elapsed
[Window Not Elapsed]: #window-not-elapsed
[Storage Failure]: #storage-failure

---

## Composition notes

Provisional Commitment is freestanding and is designed to compose with other atoms rather than absorb their concepts:

- **[Duplicate Prevention](./duplicate-prevention.md)** — for idempotent reservation. The container calls `check(idempotency_token)` before [Place Hold] and `record(idempotency_token)` after a successful [Place Hold], mapping the resulting commitment [Id] to the token. A retry with the same token returns the previously-produced [Id] rather than creating a second [Commitment]. Window duration is the implementation's choice; typical values match the underlying network retry envelope (minutes). This composition is realized as the [Idempotent Reservation](../compositions/idempotent-reservation.md) composition.
- **[Event Log](./event-log.md)** — for the audit-able commitment history. The container appends an event to a log instance on every successful state-changing action ([Place Hold], [Confirm], [Release], [Expire]), preserving the state-transition sequence for compliance. The commitment record remains the current-state projection; the Event Log is the journal from which the transitions can be replayed and audited.
- **[Retention Window](./retention-window.md)** — places terminal-state commitments ([Confirmed], [Released], [Expired]) under retention per the host's regulatory regime. The retention record itself is the audit evidence; what happens to it is the recursive question Retention Window owns.
- **Capacity Constraint Enforcement** *(forthcoming)* — for aggregate rules over a resource pool. Composes by intercepting [Place Hold] to consult the pool's capacity rule; rejects as `pool-capacity-exceeded` when the rule is violated. The [Expire] transition returns the pool slot to availability — the side effect that the [Reserve from Pool](../compositions/reserve-from-pool.md) composition relies on (it drives `ProvisionalCommitment.expire(id)` and returns the slot to the pool atomically).
- **Hold Window with Expiry** *(forthcoming)* — may extract window-management concepts (eager-expiry sweepers, deadline notifications, grace periods) into a separate atom. The window is intrinsic to this atom because the window is the contract; if window-management policy proves to recur generically across other resource-lifecycle atoms, extraction will be revisited.
- **Reversal** *(forthcoming)* — produces a compensating commitment that offsets a [Confirmed] one (refund, admission reversal, return-to-stock). Composes by referencing the original commitment id; does not mutate it.
- **[Actor Identity](./actor-identity.md)** — binds each action against the atom to a verifiable actor, producing the non-repudiation guarantee regulators expect (signed authorization, MFA-bound caller context, witnessed approval). Provisional Commitment names [Requester] as a property of the [Commitment]; Actor Identity is the contract that says the named requester actually authorized the action and cannot later deny it.

---

## Standards references

Provisional Commitment is the first regulated-business atom in the library; its standards inheritance is correspondingly richer than the productivity primitives.

- **ISO 9001:2015 §8.5.2 (Identification and traceability)** — the minimum anchor. Resources under provisional commitment must be identifiable and traceable through every state transition; the atom's identity model and per-commitment audit fields satisfy this directly.
- **ISO 9001:2015 §8.5.4 (Preservation)** — the resource is preserved in its committed state for the requester during the hold window; the atom's hold-window monotonicity invariant is the operational form.
- **Basel III liquidity framework (BCBS 238 LCR)** — banks' credit-limit holds and intraday liquidity reservations follow the same lifecycle. The atom's terminal-absorption invariant matches Basel's expectation that settlement events are facts about the past, not subject to silent revision.
- **The Joint Commission, *Provision of Care, Treatment, and Services*** — healthcare bed-management and capacity-coordination standards require resource encumbrance to be auditable and time-bounded. The atom's audit-friendly property is the structural correlate.
- **IATA Resolution 830a (and related ticketing-time-limit rules)** — airline reservation systems' fare-lock and seat-hold semantics formalize the hold-window contract this atom abstracts; the atom is vocabulary-neutral, IATA is one instantiation.
- **PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for handling cardholder data) Requirement 10 (logging and monitoring)** — for retail and payment commitments touching cardholder data, every state transition must be logged. Composes with Event Log to deliver this directly.
- **GDPR Article 30 (records of processing activities)** — for commitments whose records contain personal data (named guests, identified patients, ticketed passengers, account holders), the commitment record is itself a processing activity subject to Art. 30's controller-records obligation. The atom's per-commitment audit fields ([Requester], [Placed At], [Expires At], transition timestamps) supply the data points Art. 30 expects; what counts as a *processing purpose* per commitment is host-system policy.
- **Sarbanes-Oxley §404 (internal control over financial reporting)** — where confirmed commitments are material to financial reporting (the banking credit-limit example most clearly; any retail or hospitality commitment whose Confirmed transition flows to the books), the controls around the Held → Confirmed transition are §404-scope. Composes with Event Log to produce the auditable evidence §404 attestations require; the atom is implementation-independent on the specific control framework chosen.

For healthcare commitments touching protected health information, HIPAA's (Health Insurance Portability and Accountability Act — US federal law governing healthcare data privacy and security) audit-controls requirement (45 CFR (Code of Federal Regulations — the codification of US federal agency rules) §164.312(b)) applies to the composing Event Log instance rather than to the commitment record itself; the atom is implementation-independent on this point. The same separation applies to GDPR Art. 30 in EU contexts where the composing Event Log carries the full processing history.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture and the discipline of composing capacity, idempotency, audit, and reversal as separate concepts.
- **Eiffel's design-by-contract** — preconditions on each action; named rejection reasons.
- **Linear temporal logic** — terminal absorption, single-resolution, and confirmation-within-the-window expressed as temporal properties.
- **Two-phase commit and reservation protocols (distributed systems)** — the prepare/commit pattern this atom abstracts; here the prepare phase is the visible business state rather than an implementation hidden under transactional semantics.

---

## Generation acceptance

A derived implementation of Provisional Commitment is *acceptable* — in the regulator-acceptance sense MUSE's (the v1.1 completeness framework whose nine nodes GRID is drawn from) Proof node requires — when an external auditor, given the commitment record set plus the composed Event Log instance, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct the lifecycle of any commitment.** From [Place Hold] to its terminal transition ([Confirmed], [Released], or [Expired]), with every timestamp, the resource and requester references, and the recorded state at each step.
- **Confirm single-resolution for every commitment.** For every record, confirm that **at most one** terminal timestamp is non-null ([Confirmed At], [Released At], or [Expired At]) — never two. A record with two non-null terminal timestamps is evidence of a double-resolution defect (Invariant 2). A record with none is still [Held].
- **Verify all ten invariants hold over the record set.** Membership exclusivity, single-resolution, terminal absorption, id stability, resource and requester immutability, hold-window monotonicity, confirmation within the window, transition timestamps strictly after placement, no id reuse, and commitment store durability. Each invariant is checkable by a query over the records.
- **Observe every rejection reason at its action site.** The seven named reasons ([Invalid Request], [Resource Unavailable], [Not Held], [Not Known], [Window Elapsed], [Window Not Elapsed], [Storage Failure]) are surfaced on the action interface and visible in the audit trail when rejection events are logged.
- **Identify the composing patterns active in this deployment.** Whether idempotency ([Duplicate Prevention](./duplicate-prevention.md)), full audit history ([Event Log](./event-log.md)), pool capacity (Capacity Constraint Enforcement), reversal of confirmed commitments (Reversal), retention of terminal records ([Retention Window](./retention-window.md)), and verifiable attribution ([Actor Identity](./actor-identity.md)) are wired in, and with what configuration.

This is the *generator's contract*: any code generated from this atom must produce records and a runtime surface that pass the checks above. The bar is the regulator's question, not the developer's intuition.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-18
formal: verified — provisional-commitment.tla + 2 twins, 2026-06-04
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/provisional-commitment.md`.

- **2026-06-23 — Expiry stays a stored terminal reached by an explicit `expire` event; the derived-expiry refactor is withdrawn for this atom.** *Chose:* stored `Expired` with `expired_at`, the `window-not-elapsed` rejection and `confirm`'s `window-elapsed` guard restored. *Over:* the corpus-wide derive-expiry-at-read-time move applied two days earlier. *Because:* this atom's lapse has a side effect — `expire` releases the resource, and in a pool-backed composition returns a capacity slot — which Reserve from Pool and Idempotent Reservation call and map; derived expiry is for side-effect-free lapses only.
