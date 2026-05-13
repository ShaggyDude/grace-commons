---
title: Medication Order
parent: Healthcare
grand_parent: Atoms
nav_order: 2
---

# Medication Order

> A healthcare primitive: an immutable prescription record binding a prescriber, a patient, a medication, and a dosing regimen — from initial order through verification, dispensing, administration, and terminal resolution. Amendments before dispensing create successor orders; orders stopped after dispensing become Discontinued; orders terminated before dispensing are Cancelled.

---

## Intent

A prescriber — physician, nurse practitioner, physician assistant, or authorized clinical system — places a medication order specifying what drug to give, to whom, in what dose and form, by what route, on what schedule, and for how long. That prescription drives a regulated chain of custody: a pharmacist verifies it before any dispensing occurs; a dispenser prepares and releases the medication; a nurse or patient administers it; the course completes or is terminated. At every step, the actor who performs the action is permanently attributed.

The pattern addresses three simultaneous clinical requirements. First, the prescription record must be faithful to what was ordered — the medication identity, dose, route, and frequency are fixed at order time; errors are corrected by explicit amendment (before dispensing) or explicit cancellation and reorder (after dispensing), never by silent edit. Second, every role in the chain — prescriber, verifier, dispenser, administerer — must be permanently attributed to the actions they take, and that attribution must survive adversarial scrutiny: DEA controlled-substance audit, wrong-medication dispute, diversion investigation. Third, the amendment boundary at dispensing is clinically load-bearing: a dose change before the pharmacy has acted is a simple correction; a change after medication has left the pharmacy requires discontinuing the active order and placing a new one.

This is a freestanding concept in the EOS sense. It carries its own state (the medication order record set), its own actions (`order`, `amend`, `verify`, `hold`, `reinstate`, `dispense`, `administer`, `complete`, `cancel`, `discontinue`, `read`), and its own invariants (core-field immutability, pre-dispensing amendment only, hold-and-reinstate mechanics, terminal-state finality, role attribution). Composing patterns add access control, cryptographic non-repudiation, retention policy, tamper-evidence, and controlled-substance DEA reporting. The atom imposes no semantics on what the medication is clinically; it imposes the structural guarantee that the order is faithful to what was prescribed, by whom, and how that prescription was fulfilled.

---

## Structure

### Store instance model

The Medication Order atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per health system, facility, department, or care team, depending on deployment topology. The atom specifies what one instance is and how it behaves; composing patterns and deployment configuration determine how many instances to instantiate. `order_id` values are unique within a store instance; uniqueness across instances is a composing concern. `patient_ref` is an opaque reference scoped globally — the same `patient_ref` may appear in multiple store instances for the same patient across care settings. Calls implicitly target a single routed instance; the mechanism by which a caller's call reaches a specific instance (service binding, URL endpoint, namespace prefix) is a deployment-routing concern, not defined by this atom.

### Identity model

Each order has an opaque, immutable, system-generated `order_id` — assigned on `order`, never reused, never reassigned within the store instance. The id is the order's identity; the medication, dosing details, and lifecycle events are properties of the order, not its identity.

`patient_ref` is an opaque reference to the patient. Set on `order`, immutable. It is not the order's identity — two orders for the same patient have different `order_id`s. `patient_ref` is inherited unchanged by any successor order created by `amend`.

`prescriber_ref` is an opaque reference to the prescriber who placed the order. Set on `order`, immutable. Amendments carry their own `amended_by`; the original `prescriber_ref` is never changed.

`medication_ref` is an opaque reference identifying the specific drug and formulation (for example, a formulary item code or National Drug Code). Set on `order`, immutable. `medication_ref` is inherited unchanged by any successor order created by `amend`. An order placed for the wrong medication must be cancelled and re-ordered; amendment cannot change the medication identity. This is a structural property of the atom — `amend` does not accept `medication_ref` as a parameter, making a medication change via amendment architecturally impossible rather than runtime-rejected.

### Inputs

- `order` calls from prescribers, each carrying a patient reference, prescriber reference, medication reference, prescribed dose, dose unit, route, frequency, optional duration, optional clinical evidence reference, and optional explicit timestamp.
- `amend` calls that correct dosing parameters on a pre-dispensing order, carrying the order id, the amending clinician, updated dosing parameters, and a required reason.
- `verify` calls from pharmacists who have reviewed and cleared the order for dispensing.
- `hold` calls that temporarily suspend the order, carrying the actor and a required reason.
- `reinstate` calls that resume a held order, returning it to its pre-hold state.
- `dispense` calls recording the pharmacy releasing the medication, carrying the dispenser reference, quantity, optional lot number, and optional timestamp.
- `administer` calls recording the medication given to the patient.
- `complete` calls closing the order after the full course is administered.
- `cancel` calls terminating the order before any dispensing has occurred.
- `discontinue` calls terminating the order after dispensing has begun.
- `read` queries from clinical systems, pharmacy systems, analytics pipelines, and audit processes.

### Actions

- `order(patient_ref, prescriber_ref, medication_ref, dose, dose_unit, route, frequency, duration?, clinical_evidence_ref?, ordered_at?) → order_id | rejected(invalid-order | storage-failure)` — create a new Ordered medication order. `ordered_at` defaults to the receiving node's wall clock if not supplied; when supplied, it must not be in the future. `duration` is optional — its absence models an open-ended order with no predetermined termination date; open-ended orders remain active until explicitly completed or discontinued. `clinical_evidence_ref` is an optional opaque reference to clinical evidence (such as a Clinical Observation `observation_id`) that informed the prescribing decision; it is advisory metadata on the order, not a structural dependency — the atom does not interpret it.

- `amend(order_id, amended_by, dose?, dose_unit?, route?, frequency?, duration?, reason) → new_order_id | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-dispensed | invalid-request | storage-failure)` — create a successor order correcting one or more dosing parameters of the named order. Valid only for orders in Ordered or Verified state. The original transitions to Amended and acquires a `successor_id`; the successor is Ordered with a `predecessor_id` referencing the original. `medication_ref`, `patient_ref`, and `prescriber_ref` are inherited by construction — `amend` does not accept these as parameters. The successor starts in Ordered state regardless of whether the original was Ordered or Verified, because the amendment changes the clinical content and requires fresh pharmacist review before the revised order may be dispensed. At least one of the dosing parameters (`dose`, `dose_unit`, `route`, `frequency`, `duration`) must differ from the original's current values; an `amend` call whose supplied parameters all match the original is `invalid-request` — an amendment that changes nothing is not an amendment. Setting `duration` to nil in an `amend` call is valid and converts a duration-bounded order to an open-ended one. `amended_by` and `reason` must each contain at least one non-whitespace character; either being empty or whitespace-only is `invalid-request`. `already-dispensed` covers Dispensed, Administered, and Completed states — all post-dispensing. An `amend` operation requires two durable writes; see *`amend` two-write atomicity* in Edge cases.

- `verify(order_id, verifier_ref) → verified | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | not-in-ordered-state | invalid-request | storage-failure)` — record pharmacist review and clearance. Valid only for orders in Ordered state. `verifier_ref` must contain at least one non-whitespace character (`invalid-request`). Records `verifier_ref` and `verified_at` on the order; both are immutable thereafter. `not-in-ordered-state` covers Verified, Dispensed, Administered, and Completed states — the order has already been verified or has progressed beyond the verification stage.

- `hold(order_id, held_by, reason) → held | rejected(not-known | already-on-hold | already-completed | already-cancelled | already-discontinued | already-amended | invalid-request | storage-failure)` — temporarily suspend the order from any actionable state (Ordered, Verified, Dispensed, or Administered). Records the current state as `prior_state`, records `held_by`, `hold_reason`, and `held_at`; all are set at hold time. `held_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`). See *Multiple hold cycles* in Edge cases for behavior when an order is held more than once over its lifetime.

- `reinstate(order_id, reinstated_by) → reinstated | rejected(not-known | not-on-hold | invalid-request | storage-failure)` — resume a held order, returning it to the state stored in `prior_state`. Records `reinstated_by` and `reinstated_at`. `reinstated_by` must contain at least one non-whitespace character (`invalid-request`). `not-on-hold` covers all non-On Hold states; terminal and Amended states cannot be on hold in the first place, so their specific rejections are not needed here.

- `dispense(order_id, dispenser_ref, quantity, lot_number?, dispensed_at?) → dispensed | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | not-verified | already-dispensed | invalid-request | storage-failure)` — record the pharmacy releasing the medication. Valid only for orders in Verified state. Records `dispenser_ref`, `quantity` (a positive number), `lot_number` (if supplied), and `dispensed_at` (wall clock if not supplied); all are immutable after the dispense transition. `dispenser_ref` must be non-empty and non-whitespace-only; `quantity` must be strictly positive; either violation is `invalid-request`. `not-verified` covers Ordered state — an order awaiting pharmacist review may not be dispensed.

- `administer(order_id, administerer_ref, administered_at?) → administered | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-dispensed | already-administered | invalid-request | storage-failure)` — record the medication given to the patient. Valid only for orders in Dispensed state. Records `administerer_ref` and `administered_at` (wall clock if not supplied); both are immutable after the administration transition. `administerer_ref` must be non-empty and non-whitespace-only (`invalid-request`). `already-administered` covers orders already in Administered state — the order stays Administered until explicitly completed or discontinued; subsequent dose events for multi-dose regimens are a composing concern (see *Multi-dose regimens* in Edge cases).

- `complete(order_id, completed_by, completed_at?) → completed | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-administered | invalid-request | storage-failure)` — close the order after the full course has been administered. Valid only for orders in Administered state. Records `completed_by` and `completed_at` (wall clock if not supplied); both are immutable after the completion transition. `completed_by` must be non-empty and non-whitespace-only (`invalid-request`).

- `cancel(order_id, cancelled_by, reason) → cancelled | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | already-dispensed | invalid-request | storage-failure)` — terminate the order before any dispensing. Valid only for orders in Ordered or Verified state. To cancel a held pre-dispensing order, the caller must first reinstate it. Records `cancelled_by`, `cancellation_reason`, and `cancelled_at`; all immutable. `cancelled_by` and `reason` must each be non-empty and non-whitespace-only (`invalid-request`). `already-dispensed` covers Dispensed and Administered states — use `discontinue` for orders that have been dispensed.

- `discontinue(order_id, discontinued_by, reason) → discontinued | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-dispensed | invalid-request | storage-failure)` — terminate the order after dispensing has begun. Valid only for orders in Dispensed or Administered state. To discontinue a held post-dispensing order, the caller must first reinstate it. Records `discontinued_by`, `discontinuation_reason`, and `discontinued_at`; all immutable. `discontinued_by` and `reason` must each be non-empty and non-whitespace-only (`invalid-request`). `not-dispensed` covers Ordered and Verified states — use `cancel` for orders that have not been dispensed.

- `read(query) → ordered_sequence_of_orders | rejected(invalid-query)` — return orders matching the query, ordered by `ordered_at` ascending. A query may filter by `order_id`, `patient_ref`, `medication_ref`, `prescriber_ref`, state, or any combination. A query supplying only an `order_id` returns at most one order. A well-formed query matching no orders returns an empty sequence, not a rejection. A query with no filters returns every order in the store. Only malformed parameters surface as `invalid-query`: a syntactically invalid `order_id` (non-null, non-empty), an unrecognized state value, or a time range with end before start.

### Outputs

- For `order`: a fresh `order_id`, or a rejection.
- For `amend`: a fresh `order_id` for the successor order, or a rejection.
- For `verify`, `hold`, `reinstate`, `dispense`, `administer`, `complete`, `cancel`, `discontinue`: the named outcome token (`verified`, `held`, `reinstated`, `dispensed`, `administered`, `completed`, `cancelled`, `discontinued`), or a rejection.
- For `read`: a (possibly empty) ordered sequence of orders. Each order carries its full field set for its current state. The core fields present on every order are: `order_id`, `patient_ref`, `prescriber_ref`, `medication_ref`, `dose`, `dose_unit`, `route`, `frequency`, `duration` (if bounded), `clinical_evidence_ref` (if supplied), `ordered_at`, and `state`. State-specific fields are present when applicable and may co-occur: amendment fields (`predecessor_id`, `amended_by`, `amendment_reason` on a successor; `successor_id` on an Amended original); verification fields (`verifier_ref`, `verified_at`) on Verified, Dispensed, Administered, and Completed orders; hold fields (`held_by`, `hold_reason`, `held_at`, `prior_state`) and reinstate fields (`reinstated_by`, `reinstated_at`) on orders that have been held and reinstated; dispense fields (`dispenser_ref`, `quantity`, `lot_number`, `dispensed_at`) on Dispensed, Administered, and Completed orders; administration fields (`administerer_ref`, `administered_at`) on Administered and Completed orders; completion fields (`completed_by`, `completed_at`) on Completed orders; cancellation fields (`cancelled_by`, `cancellation_reason`, `cancelled_at`) on Cancelled orders; discontinuation fields (`discontinued_by`, `discontinuation_reason`, `discontinued_at`) on Discontinued orders. Multiple state-specific field groups may be present on a single order — a Completed order carries verification, dispense, and administration fields simultaneously. The combinations follow mechanically from the state transitions.

### State

Each order is in exactly one state:

- **Ordered** — the order has been placed and awaits pharmacist verification. May be verified, amended, held, or cancelled.
- **Verified** — a pharmacist has reviewed and cleared the order for dispensing. Carries `verifier_ref` and `verified_at` (immutable). May be dispensed, amended, held, or cancelled.
- **Amended** — the order has been superseded by a successor. Retained and visible; carries `successor_id` pointing to the correcting order. No further transitions from Amended. The successor carries `predecessor_id`, `amended_by`, and `amendment_reason` (all immutable from the moment `amend` completes).
- **On Hold** — the order has been temporarily suspended. Carries `prior_state` (the state before the hold), `held_by`, `hold_reason`, and `held_at`. May only be reinstated (returning to `prior_state`); all other state-changing actions are rejected.
- **Dispensed** — the pharmacy has prepared and released the medication. Carries `dispenser_ref`, `quantity`, `lot_number` (if recorded), and `dispensed_at` (all immutable). May be administered, held, or discontinued.
- **Administered** — at least one dose has been given to the patient. Carries `administerer_ref` and `administered_at` (immutable). May be completed, held, or discontinued.
- **Completed** — the full course has been administered. Carries `completed_by` and `completed_at` (immutable). Terminal; no further transitions.
- **Cancelled** — the order was terminated before any dispensing. Carries `cancelled_by`, `cancellation_reason`, and `cancelled_at` (immutable). Terminal; no further transitions.
- **Discontinued** — the order was terminated after dispensing had begun. Carries `discontinued_by`, `discontinuation_reason`, and `discontinued_at` (immutable). Terminal; no further transitions.

Valid transitions:

- Ordered → Verified (via `verify`)
- Ordered → Amended (via `amend`; successor starts Ordered)
- Ordered → On Hold (via `hold`; `prior_state: Ordered`)
- Ordered → Cancelled (via `cancel`)
- Verified → Dispensed (via `dispense`)
- Verified → Amended (via `amend`; successor starts Ordered)
- Verified → On Hold (via `hold`; `prior_state: Verified`)
- Verified → Cancelled (via `cancel`)
- On Hold → prior_state (via `reinstate`)
- Dispensed → Administered (via `administer`)
- Dispensed → On Hold (via `hold`; `prior_state: Dispensed`)
- Dispensed → Discontinued (via `discontinue`)
- Administered → Completed (via `complete`)
- Administered → On Hold (via `hold`; `prior_state: Administered`)
- Administered → Discontinued (via `discontinue`)

Successor orders created by `amend` always start in Ordered state, regardless of whether the original was Ordered or Verified. A purged or deleted state does not exist in this atom. Retention and eventual destruction belong to composing patterns ([Retention Window](../compliance/retention-window.md), [Legal Hold](../../ROADMAP.md)).

### Flow

1. **Prescriber places the order.** Calls `order(patient_ref: "p77", prescriber_ref: "dr_osei", medication_ref: "med-lisinopril-10mg", dose: 10, dose_unit: "mg", route: "oral", frequency: "QD", duration: 30)`. The atom assigns `order_id`, sets `state = Ordered`, records `ordered_at`. Returns `order_id`.
2. **Pharmacist reviews and clears.** Calls `verify(order_id, verifier_ref: "pharm_wu")`. Records `verifier_ref` and `verified_at`, transitions to Verified. Returns `verified`.
3. **Pharmacy dispenses.** Calls `dispense(order_id, dispenser_ref: "tech_jones", quantity: 30)`. Records dispense fields, transitions to Dispensed. Returns `dispensed`.
4. **Nurse administers the first dose.** Calls `administer(order_id, administerer_ref: "nurse_kim")`. Records administration fields, transitions to Administered. Returns `administered`.
5. **Course completes.** Calls `complete(order_id, completed_by: "nurse_kim")`. Records completion fields, transitions to Completed. Returns `completed`.

Alternate paths: prescriber amends before dispensing (creates successor in Ordered); order held for surgery then reinstated; order cancelled before dispensing; order discontinued after dispensing begins.

### Decision points

- **At `order`** — `patient_ref`, `prescriber_ref`, and `medication_ref` must each contain at least one non-whitespace character; `dose` must be a positive number; `dose_unit`, `route`, and `frequency` must each contain at least one non-whitespace character; `duration`, if supplied, must be a positive number; `ordered_at`, if supplied, must not be in the future (checked against the receiving node's wall clock). Any violation rejects as `invalid-order`. `storage-failure` if the store write fails after all preconditions pass; no `order_id` is issued and no record enters the store.

- **At `amend`** — `not-known` if the `order_id` does not exist; `on-hold` if the order is On Hold (reinstate first); `already-amended` if Amended; `already-cancelled` or `already-discontinued` if terminal; `already-dispensed` if Dispensed, Administered, or Completed. If none of the above: `amended_by` must be non-empty and non-whitespace-only, `reason` must be non-empty and non-whitespace-only — either failing is `invalid-request`. At least one supplied dosing parameter must differ from the original's current values — an amend that changes nothing is `invalid-request`. Setting `duration` to nil when the original has a duration is a valid change. If either the successor creation or the original's state update cannot be made durable, `rejected(storage-failure)` and no observable state change occurs: the successor is not created and the original remains in its prior state. See *`amend` two-write atomicity* in Edge cases.

- **At `verify`** — `not-known`; `on-hold`; `already-amended`, `already-cancelled`, `already-discontinued` (terminal/inactive); `not-in-ordered-state` for Verified, Dispensed, Administered, or Completed state. `verifier_ref` must be non-empty and non-whitespace-only (`invalid-request`). `storage-failure` if the state update cannot be made durable; order remains Ordered.

- **At `hold`** — `not-known`; `already-on-hold`; `already-completed`, `already-cancelled`, `already-discontinued`, `already-amended` (terminal/inactive). Valid source states: Ordered, Verified, Dispensed, Administered. `held_by` and `reason` must each be non-empty and non-whitespace-only (`invalid-request`). `storage-failure` leaves the order's state unchanged.

- **At `reinstate`** — `not-known`; `not-on-hold` for any non-On Hold state. `reinstated_by` must be non-empty and non-whitespace-only (`invalid-request`). Reinstates to the state stored in `prior_state` — the target state is not a parameter. `storage-failure` leaves the order On Hold.

- **At `dispense`** — `not-known`; `on-hold`; `already-amended`, `already-cancelled`, `already-discontinued` (terminal/inactive); `not-verified` for Ordered state — an unverified order may not be dispensed; `already-dispensed` for Dispensed, Administered, or Completed state. `dispenser_ref` must be non-empty and non-whitespace-only; `quantity` must be strictly positive; either failing is `invalid-request`. `lot_number`, if supplied, must be non-empty and non-whitespace-only. `storage-failure` leaves the order Verified.

- **At `administer`** — `not-known`; `on-hold`; `already-amended`, `already-cancelled`, `already-discontinued`, `already-completed` (terminal/inactive); `not-dispensed` for Ordered, Verified, and Amended states; `already-administered` for Administered state. `administerer_ref` must be non-empty and non-whitespace-only (`invalid-request`). `storage-failure` leaves the order Dispensed.

- **At `complete`** — `not-known`; `on-hold`; `already-amended`, `already-cancelled`, `already-discontinued`, `already-completed` (terminal/inactive); `not-administered` for Ordered, Verified, and Dispensed states. `completed_by` must be non-empty and non-whitespace-only (`invalid-request`). `storage-failure` leaves the order Administered.

- **At `cancel`** — `not-known`; `on-hold` (reinstate first to surface the order's lifecycle position before terminating it — see Invariant 9 and Behavior); `already-amended`, `already-cancelled`, `already-discontinued`, `already-completed` (terminal/inactive); `already-dispensed` for Dispensed or Administered states — use `discontinue` instead. Valid source states: Ordered, Verified. `cancelled_by` and `reason` must each be non-empty and non-whitespace-only (`invalid-request`). `storage-failure` leaves the order's state unchanged.

- **At `discontinue`** — `not-known`; `on-hold` (reinstate first); `already-amended`, `already-cancelled`, `already-discontinued`, `already-completed` (terminal/inactive); `not-dispensed` for Ordered, Verified, and Amended states — use `cancel` instead. Valid source states: Dispensed, Administered. `discontinued_by` and `reason` must each be non-empty and non-whitespace-only (`invalid-request`). `storage-failure` leaves the order's state unchanged.

- **At `read`** — any supplied `order_id` must be syntactically valid (non-null, non-empty). Any supplied state filter must name one of the nine valid states. A query with no filters is well-formed. A well-formed query matching no orders returns an empty sequence, not a rejection. Only malformed parameters surface as `invalid-query`.

### Behavior

- **Orders are durable on success.** Once `order` returns an `order_id`, the order is in the store and will appear in subsequent reads.
- **Amendment is additive, not destructive.** `amend` creates a new order record; the original is retained in Amended state. Both are visible to `read`; queries filtering for non-Amended states return only active orders.
- **The successor always starts in Ordered state.** An amendment to a Verified order produces a successor requiring fresh pharmacist verification before dispensing. The original Verified order's `verifier_ref` and `verified_at` remain on the Amended original and do not transfer to the successor.
- **Hold is reversible; reinstate returns to prior_state.** `prior_state` is set at hold time and determines where reinstate returns. No action other than `reinstate` (and `read`) is valid against an On Hold order.
- **`cancel` and `discontinue` require reinstate before acting on held orders.** This is deliberate friction: a held order's lifecycle position is suspended. Explicitly reinstating it (acknowledging where in the lifecycle the order stands) before terminating it prevents accidental termination of orders paused for procedural reasons.
- **Terminal states are absorbing.** Completed, Cancelled, and Discontinued orders accept no further state transitions. Amended orders are similarly inactive.
- **Reads are repeatable; the underlying store is monotonic.** The order store only grows. An unfiltered read at `t2 > t1` returns every order visible at `t1` plus any added in between. State-filtered reads are not monotonic: an order visible at `t1` under a given state filter may be absent at `t2` if it transitioned.

### Feedback

- After `order` — a new Ordered record exists; `order_id`, core fields, and `ordered_at` are set and immutable.
- After `amend` — the original is now Amended (acquires `successor_id`); a new Ordered successor exists with `predecessor_id`, `amended_by`, and `amendment_reason` set and immutable. The original's core fields are unchanged.
- After `verify` — the order is now Verified; `verifier_ref` and `verified_at` are set and immutable.
- After `hold` — the order is now On Hold; `prior_state`, `held_by`, `hold_reason`, and `held_at` are set.
- After `reinstate` — the order is now in the state named by `prior_state`; `reinstated_by` and `reinstated_at` are set and immutable.
- After `dispense` — the order is now Dispensed; `dispenser_ref`, `quantity`, `lot_number` (if supplied), and `dispensed_at` are set and immutable.
- After `administer` — the order is now Administered; `administerer_ref` and `administered_at` are set and immutable.
- After `complete` — the order is now Completed; `completed_by` and `completed_at` are set and immutable.
- After `cancel` — the order is now Cancelled; `cancelled_by`, `cancellation_reason`, and `cancelled_at` are set and immutable.
- After `discontinue` — the order is now Discontinued; `discontinued_by`, `discontinuation_reason`, and `discontinued_at` are set and immutable.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Order immutability.** After a successful `order`, the fields `order_id`, `patient_ref`, `prescriber_ref`, `medication_ref`, `dose`, `dose_unit`, `route`, `frequency`, `duration`, `clinical_evidence_ref`, and `ordered_at` never change, regardless of any subsequent actions.

- **Invariant 2 — Successor inherits identity fields.** The successor created by `amend` carries the same `patient_ref` and `medication_ref` as the original, by construction: `amend` does not accept either as a parameter, making divergence structurally impossible. `prescriber_ref` is also inherited; `amended_by` records who made the amendment, but prescribing authorship belongs to the original prescriber. A clinician who needs to change the medication must cancel the original and place a new order.

- **Invariant 3 — Amendment is pre-dispensing only.** `amend` is rejected for any order in Dispensed, Administered, Completed, On Hold, Cancelled, Discontinued, or Amended state. An order that has crossed the dispensing boundary requires discontinuing and reordering, not amendment, because the medication has left the pharmacy's custody.

- **Invariant 4 — Amendment chains are linear.** Each order has at most one `successor_id` and at most one `predecessor_id`. Amendment chains are singly-linked; branching is not permitted. An already-Amended order rejects `amend` with `already-amended`.

- **Invariant 5 — Hold carries prior_state; reinstate returns to it.** When `hold` transitions an order to On Hold, the current state is recorded as `prior_state`. `reinstate` transitions the order to the state named in `prior_state` — the atom does not accept a target state as a parameter, so deviation from the recorded prior state is structurally impossible.

- **Invariant 6 — Cancel is pre-dispensing; discontinue is post-dispensing.** `cancel` is rejected for orders in Dispensed, Administered, or Completed state — use `discontinue`. `discontinue` is rejected for orders in Ordered or Verified state — use `cancel`. This boundary is clinically and regulatorily load-bearing: a cancelled order (medication never reached the patient) has materially different implications for pharmacy accounting, DEA controlled-substance reconciliation, and adverse-event investigation than a discontinued order (medication was dispensed or administered but stopped).

- **Invariant 7 — Terminal states are absorbing.** An order in Completed, Cancelled, or Discontinued state accepts no further state transitions. Any action other than `read` against such an order is rejected with the appropriate already-terminal reason.

- **Invariant 8 — Amended state is inactive.** An order in Amended state accepts no further state transitions. All actions other than `read` against an Amended order are rejected with `already-amended`. Clinical workflow continues on the successor.

- **Invariant 9 — On Hold accepts only reinstate.** An order in On Hold state accepts no state-changing actions other than `reinstate`. All other state-changing actions return `on-hold`. This enforces that an order's lifecycle position is explicitly surfaced before any further action is taken.

- **Invariant 10 — All actor references are required and non-whitespace.** Every action that writes an actor attribution field requires the value to contain at least one non-whitespace character: `prescriber_ref` at `order`; `amended_by` at `amend`; `verifier_ref` at `verify`; `held_by` at `hold`; `reinstated_by` at `reinstate`; `dispenser_ref` at `dispense`; `administerer_ref` at `administer`; `completed_by` at `complete`; `cancelled_by` at `cancel`; `discontinued_by` at `discontinue`. Whitespace-only values are treated as empty and rejected as `invalid-request` (or `invalid-order` for `order`). Attribution is the core non-repudiation property of this atom; an empty actor reference undermines every regulated adversarial scenario.

- **Invariant 11 — Reason fields are required and non-whitespace.** `hold_reason` (at `hold`), `cancellation_reason` (at `cancel`), `discontinuation_reason` (at `discontinue`), and `amendment_reason` (at `amend`) must each contain at least one non-whitespace character. These reasons are the clinical and administrative explanations that make the record interpretable in audit, dispute, and forensic investigation. An empty reason defeats the audit trail the same way an empty actor reference does.

- **Invariant 12 — Transition metadata is write-once, with one exception.** Every field written by a state-transition action is immutable after that transition completes — except that a second `hold` call on an order that has been reinstated overwrites the prior hold fields (`held_by`, `hold_reason`, `held_at`, `prior_state`) with the new hold's values. This is not a violation of immutability in the per-transition sense: each individual hold transition writes its fields once and those fields are immutable until the order is reinstated and a subsequent `hold` call is made. The order record carries the most recent hold's metadata; a full hold history requires composing with Event Log or Audit Trail (see *Multiple hold cycles* in Edge cases). All other transition metadata fields — `verifier_ref`, `verified_at`, all dispense fields, all administration fields, all completion/cancellation/discontinuation fields, all amendment chain fields — are written once and never change.

- **Invariant 13 — ordered_at is set once.** `ordered_at` is set at `order` time (from the supplied value or the receiving node's wall clock) and never changes. The successor order created by `amend` carries its own `ordered_at`, reflecting when the amendment was placed.

- **Invariant 14 — Order store durability.** No `order_id` is removed from the store. State transitions never destroy records. The order count is monotonically non-decreasing for the lifetime of the store instance, and the store admits no deletion surface by spec. A `storage-failure` response from any action guarantees that no partial record or partial state change is observable: the action either makes all required writes durable or has no observable effect. An implementation that returns `storage-failure` while leaving a partial record visible is non-conforming.

---

## Examples

### Happy path — inpatient order through completion

A physician orders a blood pressure medication: `order(patient_ref: "p77", prescriber_ref: "dr_osei", medication_ref: "med-lisinopril-10mg", dose: 10, dose_unit: "mg", route: "oral", frequency: "QD", duration: 30)` → `order_id: "ord-001"`. The clinical pharmacist verifies: `verify("ord-001", verifier_ref: "pharm_wu")` → `verified`. The pharmacy tech dispenses: `dispense("ord-001", dispenser_ref: "tech_jones", quantity: 30, lot_number: "LOT-2026-A")` → `dispensed`. The morning nurse administers the first dose: `administer("ord-001", administerer_ref: "nurse_kim")` → `administered`. After 30 days: `complete("ord-001", completed_by: "nurse_kim")` → `completed`. The order now carries all five attribution fields — prescriber, verifier, dispenser, administerer, completer — each immutable.

### Amendment — dose correction before dispensing

The physician realizes the dose should be 5mg before the pharmacist has dispensed. Calls `amend("ord-001", amended_by: "dr_osei", dose: 5, reason: "prescribing error — weight-based dose is 5mg, not 10mg")` → `order_id: "ord-002"`. The store now contains ord-001 (Amended, `successor_id: "ord-002"`) and ord-002 (Ordered, `predecessor_id: "ord-001"`, dose 5mg, `amended_by: "dr_osei"`, `amendment_reason: "prescribing error..."`). The pharmacist receives ord-002 for verification. A query for non-Amended orders returns only ord-002; the audit record preserves both the original dose and the correction.

### Hold and reinstate — surgical pause

An order for warfarin (anticoagulant) is Verified. Before dispensing, the patient is scheduled for surgery. Nurse calls `hold("ord-003", held_by: "nurse_chen", reason: "surgical hold — patient NPO, anticoagulation contraindicated per surgical consult")` → `held`. `prior_state: Verified` is recorded. After surgery: `reinstate("ord-003", reinstated_by: "nurse_chen")` → `reinstated`. The order returns to Verified and is again eligible for dispensing.

### Rejection path — amendment attempted after dispensing

The pharmacy has already dispensed ord-001. The prescriber attempts to correct the dose: `amend("ord-001", amended_by: "dr_osei", dose: 5, reason: "dose correction")` → `rejected(already-dispensed)`. The prescriber must instead discontinue the active order and place a new one with the corrected dose. This is an intentional constraint: a dose change after the medication has left the pharmacy cannot be undone by amending the record — the physical medication in the patient's possession exists at the original dose.

### Rejection path — cancel attempted after dispensing

A prescriber calls `cancel("ord-001", cancelled_by: "dr_osei", reason: "no longer needed")` against an order in Dispensed state → `rejected(already-dispensed)`. For an order that has left the pharmacy, `discontinue` is the correct action. The distinction matters for DEA accounting: a cancelled order implies no medication was ever dispensed; a discontinued order implies medication was dispensed and must be reconciled.

### Rejection path — dispense without verification

A pharmacy system attempts to dispense an order still in Ordered state: `dispense("ord-005", dispenser_ref: "tech_jones", quantity: 30)` → `rejected(not-verified)`. No medication is released; the pharmacist must verify the order before any dispensing occurs.

### Rejection path — action against an on-hold order

A physician attempts to amend an order while it is on hold: `amend("ord-006", amended_by: "dr_osei", dose: 5, reason: "dose correction")` → `rejected(on-hold)`. The order must be reinstated first. This enforces that the lifecycle position is explicitly acknowledged — the prescriber must surface whether the hold is still appropriate before modifying the order.

---

## Regulated adversarial scenarios

### Regulator audit — DEA controlled substance prescription trail

A DEA auditor investigating Schedule II controlled substance dispensing requests the complete lifecycle history for a specific order. Queries `read({order_id: "ord-cs-017"})`. The result must show: the prescriber (`prescriber_ref`, `ordered_at`) — immutable by Invariant 1; the pharmacist who verified (`verifier_ref`, `verified_at`) — immutable by Invariant 12; the dispenser (`dispenser_ref`, `quantity`, `lot_number`, `dispensed_at`) — immutable by Invariant 12; and the administerer (`administerer_ref`, `administered_at`) — immutable by Invariant 12. If the order was amended before dispensing, the amendment chain — original (Amended, with `successor_id`), intermediate orders, and the final dispensed successor — is traceable via `predecessor_id` / `successor_id` links, with each link's `amended_by` and `amendment_reason` immutable by Invariant 12. No gap in the chain is permitted. The audit clears when the records alone account for every controlled unit: who prescribed, who cleared, who released, and who administered — without recourse to developer testimony, runbooks, or log integrity.

### Disputed order — wrong medication or wrong dose alleged

A patient alleges they were administered a different medication than prescribed, or a dose different from what their physician ordered. The investigator queries the order record for `ord-022`. Invariant 1 guarantees `medication_ref` is immutable — it cannot have been edited to cover the discrepancy. The dispenser record (`dispenser_ref`, `quantity`, `dispensed_at`) and the administration record (`administerer_ref`, `administered_at`) are both immutable by Invariant 12. If there is an amendment chain, every amendment carries `amended_by` and `amendment_reason` (immutable by Invariant 12), and the ordering of events is deterministic via the `predecessor_id` / `successor_id` chain and `ordered_at` timestamps. The dispute is answered from the records alone: the medication identity, dose, attributing actors, and timing are all permanently fixed, and no field can have been retroactively altered.

### Breach investigation — controlled substance diversion

An internal audit detects a quantity discrepancy: a controlled substance lot appears dispensed but no administration record exists for the corresponding order. The investigator queries `read({medication_ref: "med-oxycodone-5mg"})` across the date range and filters for orders in Dispensed state. The result surfaces orders that have reached Dispensed but not Administered or Completed. For each such order, `dispenser_ref` and `quantity` are on record and immutable by Invariant 12 — the dispenser attribution cannot have been edited after the fact. The absence of an `administer` transition on an order that was dispensed is itself a forensic signal. If the order was discontinued without administration, `discontinued_by` and `discontinuation_reason` must be present (required by Invariant 11) and immutable — an unexplained discontinuation with no reason is a conformance failure. The investigation has the dispenser identity, the dispensing timestamp, the lot number, and the quantity; the audit trail either closes the chain or names the gap.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Core field immutability check.** For a known `order_id`, retrieve the order at two different times and compare all core fields. `order_id`, `patient_ref`, `prescriber_ref`, `medication_ref`, `dose`, `dose_unit`, `route`, `frequency`, `duration`, `clinical_evidence_ref`, and `ordered_at` must be identical in both reads. Any transition-metadata field that is set in either read must hold the same value in any later read where it is present. A transition-metadata field that changes between two reads (other than hold fields overwritten by a subsequent hold cycle, per Invariant 12) is a conformance failure.

2. **Amendment chain integrity check.** For a known Amended order, retrieve its `successor_id` and confirm the successor exists, carries a `predecessor_id` equal to the original's `order_id`, and is in Ordered or a downstream state (never Verified or later unless re-verified on its own merits). Confirm the successor shares the same `patient_ref` and `medication_ref` as the original. Confirm `amended_by` and `amendment_reason` are non-empty on the successor.

3. **Terminal state finality check.** Attempt a state-changing action (`verify`, `dispense`, `hold`, `cancel`, or `discontinue`) against a known Completed, Cancelled, and Discontinued order respectively. All calls must return the appropriate already-terminal rejection. Confirm each order's fields are unchanged after the attempted action.

4. **Pre-dispensing amendment boundary check.** Attempt `amend` against a known Dispensed order. The call must return `rejected(already-dispensed)`. Confirm no successor order was created and the original's state is unchanged.

5. **Role attribution completeness check.** For every order in the store: confirm `prescriber_ref` is non-empty. For every order in Verified state or beyond: confirm `verifier_ref` is non-empty. For every order in Dispensed state or beyond: confirm `dispenser_ref` is non-empty and `quantity` is positive. For every order in Administered state or beyond: confirm `administerer_ref` is non-empty. An order missing a required attribution field at any lifecycle stage is a conformance failure.

6. **No-destruction check.** For a set of `order_id`s known to have been issued — including Amended, Cancelled, and Discontinued ones — confirm that `read` returns each of them when queried by `order_id` across all states. No issued id may be absent from the store.

---

## Edge cases and explicit non-goals

- **Amending to remove duration.** Setting `duration` to nil in an `amend` call converts a duration-bounded order to an open-ended one; this counts as a change and is valid. The reverse — supplying a `duration` on an amendment when the original had none — is also valid. Open-ended orders that have been amended to be bounded must be explicitly completed or discontinued when the course ends.

- **Multiple hold cycles.** An order may be held and reinstated more than once. Each `hold` call overwrites the prior hold fields on the order record (`held_by`, `hold_reason`, `held_at`, `prior_state`) with the new values. The order record carries the most recent hold's metadata. A complete history of every hold and reinstatement event requires composing with [Event Log](../temporal/event-log.md) or [Audit Trail](../../compositions/audit-trail.md), which capture every state transition as an immutable event. This behavior is consistent with Invariant 12's "write-once per transition" framing — each hold is its own transition that writes once.

- **`amend` two-write atomicity.** The `amend` operation requires two durable writes: creating the successor order and updating the original to Amended state with a `successor_id`. A crash between writes leaves the store inconsistent — either a successor exists without the original pointing to it, or the original is marked Amended with a `successor_id` that does not exist (both violate Invariant 4). Implementations must provide atomic transaction support across both writes, or a crash-recovery scan that detects and repairs dangling amendment links on restart. A `storage-failure` response is the observable signal of an aborted two-write attempt; per Invariant 14, no partial record is visible after such a response.

- **Multi-dose regimens.** The `administer` action transitions the order from Dispensed to Administered on the first recorded administration and returns `already-administered` on any subsequent call. For multi-dose regimens (daily medication for 30 days, weekly chemotherapy), individual dose events beyond the first are not modeled by this atom. Individual dose event tracking is a composing concern: a Medication Administration Record layer composed with Event Log captures each subsequent dose. This atom tracks the order's lifecycle state; the individual-dose surface belongs to the composing layer.

- **`order` idempotency.** `order` is not idempotent. A prescriber system that retries after a network timeout creates a duplicate order if the first call succeeded; both calls return distinct `order_id`s. For at-most-once semantics on order submission, compose with [Duplicate Prevention](../temporal/duplicate-prevention.md). DEA EPCS two-factor attestation requirements belong to [Actor Identity](../compliance/actor-identity.md).

- **Entered-in-error orders.** An order placed by mistake (wrong patient, system glitch, duplicate submission) should be cancelled with a reason identifying it as an entry error. The atom has no separate `entered-in-error` state; `cancel` with an appropriate reason is the mechanism. The `cancellation_reason` field carries the semantic distinction between a clinical decision and a clerical correction. For controlled substances, entered-in-error cancellations may carry additional DEA reporting obligations; those belong to a DEA-reporting composing pattern.

- **Refills.** Outpatient prescriptions often carry refill counts. A refill is a new dispensing event against a prior prescription. This atom does not model refills; each refill would require either a new order or a composing layer on top of this atom. The atom closes at Completed or Discontinued.

- **Access control.** Who may place, verify, dispense, administer, or terminate an order is not defined by this atom. That is the obligation of a composing [Permissions](../compliance/permissions.md) pattern. DEA prescriber-authorization and pharmacist-licensure checks are access-control concerns.

- **Controlled substance schedule.** Whether `medication_ref` refers to a DEA-scheduled substance, and the regulatory obligations that attach (DEA registration, EPCS two-factor, refill restrictions, quantity limits), are not modeled by this atom. `medication_ref` is opaque. Deployments handling controlled substances compose with appropriate regulatory controls.

- **Retention and destruction.** The atom retains all orders indefinitely. Retention under HIPAA and applicable state law, and eventual defensible destruction, belong to [Retention Window](../compliance/retention-window.md) and [Legal Hold](../../ROADMAP.md).

- **Tamper-evidence.** The atom guarantees immutability by spec; it does not cryptographically prevent a store administrator from rewriting records. Compose with [Tamper Evidence](../compliance/tamper-evidence.md) for cryptographic guarantees. DEA EPCS non-alteration requirements are satisfied at the layer Tamper Evidence provides.

- **Concurrency.** Two systems concurrently calling `verify` on the same order, or `dispense` after concurrent verifications, is not handled at this layer. Implementations must serialize state transitions on a given `order_id`.

- **Clock semantics.** `ordered_at` and all `_at` timestamp fields default to the receiving node's wall clock when not supplied. "Must not be in the future" (for `ordered_at`) is checked against the receiving node's clock at call time. Clock skew, timezone normalization, and monotonicity are deployment concerns. When two or more orders share the same `ordered_at`, the relative order in a `read` result is implementation-defined but must be stable across consecutive reads of the same store state.

- **Rejection priority.** When multiple precondition violations exist on the same call, the rejection returned follows a defined priority: `not-known` (id existence) → `on-hold` (for actions that reject on hold) → `already-amended` / `already-cancelled` / `already-discontinued` / `already-completed` (terminal/inactive states) → state-specific rejections (`not-in-ordered-state`, `not-verified`, `not-dispensed`, `not-administered`, `already-dispensed`, `already-administered`, `already-on-hold`) → `invalid-request` (actor references, reason fields, content) → `storage-failure` (persistence). This order is the same across conforming implementations.

---

## Composition notes

Medication Order composes naturally with the existing library:

- **[Actor Identity](../compliance/actor-identity.md)** — `prescriber_ref`, `verifier_ref`, `dispenser_ref`, `administerer_ref`, and the various `_by` fields are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors who authorized their respective actions. DEA EPCS two-factor attestation at prescribe time is the Actor Identity composition for controlled-substance orders; it converts this atom's attribution fields from trusted assertions to non-repudiable proofs.
- **[Clinical Observation](./clinical-observation.md)** — a medication order is often placed in response to a clinical observation (elevated blood pressure → antihypertensive order; abnormal lab result → treatment initiation). The optional `clinical_evidence_ref` field carries an opaque reference to the observation(s) that informed the prescribing decision. Clinical Observation provides the upstream substrate; Medication Order carries the downstream response. The relationship is advisory — `clinical_evidence_ref` is opaque metadata on the order, not a structural dependency. Clinical Observation's Composition notes identified Medication Order as a forthcoming pattern that "consumes Clinical Observation as evidence"; this is the concrete form that relationship takes.
- **[Tamper Evidence](../compliance/tamper-evidence.md)** — seals the order store against post-hoc modification, complementing the spec-level immutability guarantee with a cryptographic one. DEA EPCS non-alteration requirements are satisfied at this layer.
- **[Retention Window](../compliance/retention-window.md)** — governs the minimum retention period for medication order records under HIPAA (generally six years for adult records, longer for pediatric records, with state variation).
- **[Audit Trail](../../compositions/audit-trail.md)** — the canonical composition for regulated record-keeping; Medication Order feeds it. Every state transition is an auditable event.
- **[Event Log](../temporal/event-log.md)** — provides the substrate for capturing individual dose events in multi-dose regimens and a complete hold/reinstate history across multiple hold cycles.
- **[Permissions](../compliance/permissions.md)** — governs who may place, verify, dispense, administer, and terminate orders; composes access control onto this atom's attribution model.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for at-most-once semantics on order submission, preventing duplicate orders from network retries.
- **Forthcoming:** Care Plan — a composition modeling a structured set of medication orders, clinical observations, and clinical goals; Medication Order is a constituent.

---

## Standards references

- **HIPAA §164.312(b)** — audit controls: covered entities must implement mechanisms to record and examine activity in systems containing ePHI. The order record, with its immutable attribution fields at every lifecycle stage, is the primary audit surface.
- **HL7 FHIR MedicationRequest resource** — the canonical interoperability representation of a medication order. This atom's core fields map to FHIR's `subject` (patient_ref), `requester` (prescriber_ref), `medication[x]` (medication_ref), `dosageInstruction` (dose, dose_unit, route, frequency, duration), `authoredOn` (ordered_at), and `status` (active → Ordered/Verified; on-hold → On Hold; cancelled → Cancelled; stopped → Discontinued; completed → Completed). FHIR separates MedicationRequest, MedicationDispense, and MedicationAdministration into three resources; this atom models the full lifecycle in one record — a deliberate choice that prioritizes attribution traceability over FHIR's resource decomposition. FHIR's MedicationRequest carries many additional fields (encounter, reasonCode, substitution, priorPrescription) not present here; those are composing-layer concerns.
- **DEA 21 CFR Part 1306** — prescription requirements for Schedule II–V controlled substances: prescriber DEA registration, patient identification, medication and quantity, directions for use, Schedule II refill prohibition. `prescriber_ref` and `medication_ref` are the record substrate for Part 1306 compliance; DEA registration verification is a composing pattern.
- **DEA 21 CFR Part 1311 (EPCS)** — Electronic Prescriptions for Controlled Substances: requires two-factor cryptographic authentication at order time. Actor Identity composing with this atom is the implementation surface.
- **21 CFR Part 11** — electronic records in FDA-regulated contexts; each state transition is a regulated electronic record event requiring attribution and timestamp.
- **Joint Commission Medication Management standards (MM.04.01.01)** — require that medication orders be complete, legible, and attributable. The immutable core fields and mandatory attribution fields satisfy these requirements structurally.
- **ISMP (Institute for Safe Medication Practices)** — prescribing safeguards including required order elements (drug name, dose, route, frequency) align with this atom's mandatory fields; ISMP's error-reporting surface is the motivation for the amendment audit trail.
- **RxNorm / NDC / SNOMED CT** — controlled vocabularies for `medication_ref`; recommended deployment conventions for the opaque medication reference, not atom-level obligations.

---

## Status

`unresolved` — foundation round complete (Pass 1 GRID, Pass 2 EOS, Pass 3 Linus). Human refinement rounds (Round 2+) and AI adversarial round not yet completed.

---

## Lineage notes

Regulated atom. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)), baked in from the first draft. Conventions are not re-derived from Clinical Observation or Actor Identity.

**Pass 1 — Structural completeness (GRID).** Three findings, all closed in-pattern.

- *Store instance model absent.* The atom referenced "the store" without defining whether one global store or multiple named instances are valid, and no action accepted `store_name` as a parameter or named instance selection as a routing concern. Fixed: added a *Store instance model* subsection to Structure, mirroring Clinical Observation and Event Log. `order_id` uniqueness is now explicitly scoped to a store instance; `patient_ref` is noted as globally scoped; store instance selection is named as a deployment-routing concern and added to Edge cases.
- *Hold and reinstate metadata not in State field listing.* `held_by`, `hold_reason`, `held_at`, `prior_state`, `reinstated_by`, `reinstated_at` were described in the Actions section but not listed as fields in the On Hold state description or in Outputs. The regulated adversarial scenarios and Generation acceptance check 1 both depend on hold attribution being durably recorded and readable from the order record. Fixed: all hold and reinstate fields added to the On Hold state description, to Outputs (per-record field list), and to Feedback after `hold` and `reinstate`.
- *Multiple hold cycles field overwrite unstated.* The spec was silent on what happens when an order is held, reinstated, then held again — whether each `hold` call accumulates a history or overwrites prior hold fields. Implementations could diverge. Fixed: Edge case *Multiple hold cycles* added, stating that each `hold` overwrites the prior hold fields on the order record and that a full hold history requires composing with Event Log or Audit Trail. Invariant 12 updated with an explicit carve-out for hold-field overwrite behavior, preserving the "write-once per transition" semantics while naming the exception honestly.

All nine GRID nodes resolved. No extractions.

**Pass 2 — Conceptual independence (EOS).** Clean. Two extraction candidates evaluated; both kept in-pattern. One composition boundary judgment recorded.

- *`dispense` and `administer` extraction candidate.* The dispensing and administration sub-actions map to FHIR's separate MedicationDispense and MedicationAdministration resources and could be separate atoms. Evaluated: in this model, dispensing and administration are state transitions on the order record, not independent entities with their own identities or lifecycles. They do not have freestanding state machines — the dispenser and administerer records only make sense relative to the order they act on. A separate MedicationDispense atom would require the order's identity to specify it, inverting the composition direction. Kept in-pattern. Noted: if a second domain in the library requires generic "material-issuance" or "care-delivery" mechanics independent of a prescription context, that recurrence may motivate extraction.
- *Amendment chain mechanics extraction candidate.* Same argument as Clinical Observation's Pass 2 evaluation. A generic "Supersession Chain" atom still loses: the fields operated on (`medication_ref`, `patient_ref` as non-amendable; `dose`, `route`, `frequency`, `duration` as correctable) are order-specific; the invariants name specific fields; a generic chain depends on the host for its constraints. Kept in-pattern.
- *`clinical_evidence_ref` absorption check.* An optional opaque reference; the atom does not interpret it, does not import Clinical Observation's lifecycle, and does not name Clinical Observation in its specification. Clean.

**Pass 3 — Adversarial scrutiny (Linus mode).** Eight findings: six real, two minor. All closed in-pattern.

- *Successor starts in Ordered regardless of original state — not stated.* An amendment to a Verified order would plausibly produce a Verified successor if the spec was read quickly — the pharmacist had already verified, so why would the successor need re-verification? The spec never stated that the successor always starts in Ordered. Resolved: explicit statement added to the `amend` Action, the State section (successor orders start in Ordered), and Behavior. The rationale — the amendment changes the clinical content and requires fresh pharmacist review — is stated inline. Also noted: the original Verified order's `verifier_ref` and `verified_at` remain on the Amended original and do not transfer to the successor.
- *`cancel` and `discontinue` from On Hold — design decision not stated.* Should a clinician be able to cancel a held pre-dispense order directly, or must they reinstate first? The spec named `on-hold` as a rejection for both but did not state the rationale. Without an explanation, a reviewer would reasonably ask "why not just cancel it?". Resolved: Behavior section adds the rationale explicitly — the `on-hold` rejection for `cancel` and `discontinue` is deliberate friction that prevents accidental termination of orders paused for procedural reasons; reinstating first surfaces the order's lifecycle position and forces an explicit acknowledgment before termination.
- *Invariant 6 (cancel vs. discontinue boundary) not defended inline.* The distinction was stated but not justified. A reader could view the two-action split as bureaucratic rather than load-bearing. Resolved: Invariant 6 adds the clinical and regulatory rationale inline — DEA controlled-substance reconciliation and adverse-event investigation both depend on the distinction between medication-never-dispensed (cancel) and medication-dispensed-but-stopped (discontinue). The invariant now reads as a defended claim, not a policy assertion.
- *`already-amended`, `already-cancelled`, `already-discontinued` absent from several action signatures.* `verify`, `dispense`, `administer`, and `complete` originally listed only their state-specific rejection (`not-in-ordered-state`, `not-verified`, `not-dispensed`, `not-administered`) without naming terminal-and-inactive-state rejections that logically precede the state check in the priority order. A caller receiving `not-verified` for a `dispense` call against a Cancelled order would have a confusing diagnostic experience. Resolved: all four action signatures updated to include the terminal/inactive state rejections in the vocabulary; Decision points updated with the priority order stating these are checked before the state-specific rejections.
- *`already-cancelled` absent from `administer` signature.* Following from the above, a Cancelled order would return `not-dispensed` from `administer` — technically accurate (cancelled orders were never dispensed) but semantically confusing to a caller expecting `already-cancelled`. Resolved: `already-cancelled` added to `administer`'s signature and Decision point; in the priority order it is checked before `not-dispensed`.
- *Invariant 12 inconsistency with hold overwrite.* The original Invariant 12 stated all transition metadata is write-once; but the *Multiple hold cycles* edge case (closed in Pass 1) stated that hold fields are overwritten on a second hold. The two claims were contradictory. Resolved: Invariant 12 rewritten to "write-once per transition, with one exception" — the exception for hold-field overwrite on subsequent hold cycles is named explicitly. The invariant preserves the core claim (per-transition immutability) while being accurate about the overwrite behavior.
- *`order` not defended as non-idempotent (minor).* The spec was silent on whether `order` provides at-most-once semantics under retry. A caller could assume retry-safety. Resolved: Edge case *`order` idempotency* added, naming the gap and pointing to Duplicate Prevention as the composing pattern. The framing follows Clinical Observation's analogous edge case.
- *`amend` two-write atomicity not named (minor).* Same class of finding as Clinical Observation's Pass 3. Resolved: Edge case *`amend` two-write atomicity* added, naming the two-write requirement and mandating either atomic transaction support or a crash-recovery scan from implementations.
