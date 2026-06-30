---
title: Medication Order
domain: healthcare
parent: Atomic Concepts
has_toc: true
toc: true
---

# Medication Order

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Medication Order records the whole life of a prescription, from when a prescriber places it through to its end. The order names the drug, patient, dose, route, frequency, and duration, then moves through a regulated chain of custody — a pharmacist verifies it before anything is dispensed, a dispenser releases the medication, a nurse or patient administers it, and the course completes or is stopped — with the actor at every step permanently recorded. The guarantee is that this chain is unchangeable and complete: no step is silently skipped, no actor silently omitted, no record altered after the fact. The drug, dose, route, and frequency are fixed when the order is placed. A correction before dispensing creates a successor order (which must be re-verified), while a correction after dispensing requires stopping the order and placing a new one, because the physical medication has already left the pharmacy. The order is always in one of nine clearly-defined states ([Ordered], [Verified], [Dispensed], [Administered], [Completed], [Cancelled], [Discontinued], [Amended], [On Hold]), with a reversible [On Hold] for pauses like a surgical hold or an interaction review. The distinction between an order cancelled before any drug was dispensed and one discontinued after dispensing is enforced structurally because it matters for controlled-substance accounting. This underlies hospital and pharmacy medication systems and controlled-substance tracking.

---

## Intent

A prescriber — physician, nurse practitioner, physician assistant, or authorized clinical system — places a medication order specifying what drug to give, to whom, in what dose and form, by what route, on what schedule, and for how long. That prescription drives a regulated chain of custody: a pharmacist verifies it before any dispensing occurs; a dispenser prepares and releases the medication; a nurse or patient administers it; the course completes or is terminated. At every step, the actor who performs the action is permanently attributed.

The pattern addresses three simultaneous clinical requirements. First, the prescription record must be faithful to what was ordered — the medication identity, dose, route, and frequency are fixed at order time; errors are corrected by explicit amendment (before dispensing) or explicit cancellation and reorder (after dispensing), never by silent edit. Second, every role in the chain — prescriber, verifier, dispenser, administerer — must be permanently attributed to the actions they take, and that attribution must survive adversarial scrutiny: DEA (US Drug Enforcement Administration) controlled-substance audit, wrong-medication dispute, diversion investigation. Third, the amendment boundary at dispensing is clinically load-bearing: a dose change before the pharmacy has acted is a simple correction; a change after medication has left the pharmacy requires discontinuing the active order and placing a new one.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the medication order record set), its own actions (`order`, `amend`, `verify`, `hold`, `reinstate`, `dispense`, `administer`, `complete`, `cancel`, `discontinue`, `read`), and its own invariants (core-field immutability, pre-dispensing amendment only, hold-and-reinstate mechanics, terminal-state finality, role attribution). Composing patterns add access control, cryptographic non-repudiation, retention policy, tamper-evidence, and controlled-substance DEA reporting. The atom imposes no semantics on what the medication is clinically; it imposes the structural guarantee that the order is faithful to what was prescribed, by whom, and how that prescription was fulfilled.

The atom models the full prescription lifecycle — including dispensing and administration — as a unified record rather than decomposing those stages into separate entities, as HL7 FHIR (Health Level 7 Fast Healthcare Interoperability Resources — a standard for exchanging healthcare information) does with MedicationRequest, MedicationDispense, and MedicationAdministration. The FHIR decomposition serves interoperability across independently-operated systems that may own separate pieces of the prescription lifecycle; this atom prioritizes a single auditable chain of custody within a deployment. Dispensing and administration here are state transitions on the order record, not independent freestanding entities — they carry no state machines of their own, and their records are meaningful only relative to the order they act on. The case for separating them does not arise until a second domain in the library requires generic material-issuance semantics (blood products, implants, durable medical equipment) independent of a prescription record; absent that evidence, separating them adds coordination overhead without proportional benefit and fragments the attribution chain this atom is built to preserve.

---

## Structure

### Store instance model

The Medication Order atom operates against a named store instance. A [Store Name] identifies the instance; multiple instances coexist in real systems — one per health system, facility, department, or care team, depending on deployment topology. The atom specifies what one instance is and how it behaves; composing patterns and deployment configuration determine how many instances to instantiate. [Order Id] values are unique within a store instance; uniqueness across instances is a composing concept. [Patient Ref] is an opaque reference scoped globally — the same [Patient Ref] may appear in multiple store instances for the same patient across care settings. Calls implicitly target a single routed instance; the mechanism by which a caller's call reaches a specific instance (service binding, URL endpoint, namespace prefix) is handled at the deployment-routing layer, not defined by this atom.

### Identity model

Each order has an opaque, immutable, system-generated [Order Id] — assigned on [Order], never reused, never reassigned within the store instance. The id is the order's identity; the medication, dosing details, and lifecycle events are properties of the order, not its identity.

[Patient Ref] is an opaque reference to the patient. Set on [Order], immutable. It is not the order's identity — two orders for the same patient have different [Order Id]s. [Patient Ref] is inherited unchanged by any successor order created by [Amend].

[Prescriber Ref] is an opaque reference to the prescriber who placed the order. Set on [Order], immutable. [Prescriber Ref] is inherited unchanged by any successor order created by [Amend] — prescribing authorship belongs to the original prescriber. Amendments (corrections added to a record without replacing it — the original remains) carry their own [Amended By] to record who made the correction; the original [Prescriber Ref] is never changed on any order in the amendment chain.

[Medication Ref] is an opaque reference identifying the specific drug and formulation (for example, a formulary item code or National Drug Code). Set on [Order], immutable. [Medication Ref] is inherited unchanged by any successor order created by [Amend]. An order placed for the wrong medication must be cancelled and re-ordered; amendment cannot change the medication identity. This is a structural property of the atom — [Amend] does not accept [Medication Ref] as a parameter, making a medication change via amendment architecturally impossible rather than runtime-rejected.

### Inputs

- [Order] calls from prescribers, each carrying a patient reference, prescriber reference, medication reference, prescribed dose, dose unit, route, frequency, optional duration, optional clinical evidence reference, and optional explicit timestamp.
- [Amend] calls that correct dosing parameters on a pre-dispensing order, carrying the order id, the amending clinician, updated dosing parameters, and a required reason.
- [Verify] calls from pharmacists who have reviewed and cleared the order for dispensing.
- [Hold] calls that temporarily suspend the order, carrying the actor and a required reason.
- [Reinstate] calls that resume a held order, returning it to its pre-hold state.
- [Dispense] calls recording the pharmacy releasing the medication, carrying the dispenser reference, quantity, optional lot number, and optional timestamp.
- [Administer] calls recording the medication given to the patient.
- [Complete] calls closing the order after the full course is administered.
- [Cancel] calls terminating the order before any dispensing has occurred.
- [Discontinue] calls terminating the order after dispensing has begun.
- [Read] queries from clinical systems, pharmacy systems, analytics pipelines, and audit processes.

### Actions

- [Order] — (Projected contract: `order(patient_ref, prescriber_ref, medication_ref, dose, dose_unit, route, frequency, duration?, clinical_evidence_ref?, ordered_at?) → order_id | rejected(invalid-order | storage-failure)`) — create a new [Ordered] medication order. [Ordered At] defaults to the receiving node's wall clock if not supplied; when supplied, it must not be in the future. [Duration] is optional — its absence models an open-ended order with no predetermined termination date; open-ended orders remain active until explicitly completed or discontinued. [Clinical Evidence Ref] is an optional opaque reference to clinical evidence (such as a Clinical Observation `observation_id`) that informed the prescribing decision; it is advisory metadata on the order, not a structural dependency — the atom does not interpret it. If supplied, it must contain at least one non-whitespace character; a supplied empty or whitespace-only value is [Invalid Order]. When absent, the field is not present on the order record; there is no nil-vs-absent distinction for this field.

- [Amend] — (Projected contract: `amend(order_id, amended_by, dose?, dose_unit?, route?, frequency?, duration?, reason) → new_order_id | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-dispensed | invalid-request | storage-failure)`) — create a successor order correcting one or more dosing parameters of the named order. Valid only for orders in [Ordered] or [Verified] state. The original transitions to [Amended] and acquires a [Successor Id]; the successor is [Ordered] with a [Predecessor Id] referencing the original. [Medication Ref], [Patient Ref], and [Prescriber Ref] are inherited by construction — [Amend] does not accept these as parameters. The successor starts in [Ordered] state regardless of whether the original was [Ordered] or [Verified], because the amendment changes the clinical content and requires fresh pharmacist review before the revised order may be dispensed. At least one of the dosing parameters ([Dose], [Dose Unit], [Route], [Frequency], [Duration]) must differ from the original's current values; an [Amend] call whose supplied parameters all match the original is [Invalid Request] — an amendment that changes nothing is not an amendment. Setting [Duration] to nil in an [Amend] call is valid and converts a duration-bounded order to an open-ended one. [Amended By] and [Reason] must each contain at least one non-whitespace character; either being empty or whitespace-only is [Invalid Request]. [Already Dispensed] covers [Dispensed], [Administered], and [Completed] states — all post-dispensing. An [Amend] operation requires two durable writes; see *`amend` two-write atomicity* in Edge cases.

- [Verify] — (Projected contract: `verify(order_id, verifier_ref) → verified | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-in-ordered-state | invalid-request | storage-failure)`) — record pharmacist review and clearance. Valid only for orders in [Ordered] state. [Verifier Ref] must contain at least one non-whitespace character ([Invalid Request]). Records [Verifier Ref] and [Verified At] on the order; both are immutable thereafter. [Already Completed] covers [Completed] state — a terminal order. [Not In Ordered State] covers [Verified], [Dispensed], and [Administered] states — the order has already been verified or has progressed beyond the verification stage.

- [Hold] — (Projected contract: `hold(order_id, held_by, reason) → held | rejected(not-known | already-on-hold | already-completed | already-cancelled | already-discontinued | already-amended | invalid-request | storage-failure)`) — temporarily suspend the order from any actionable state ([Ordered], [Verified], [Dispensed], or [Administered]). Records the current state as [Prior State], records [Held By], [Hold Reason], and [Held At]; all are set at hold time. [Held By] and [Reason] must each contain at least one non-whitespace character ([Invalid Request]). Hold fields are set once per hold transition (Invariant 12); a subsequent [Hold] after reinstatement overwrites these fields with the new hold's values — see Invariant 12 and *Multiple hold cycles* in Edge cases.

- [Reinstate] — (Projected contract: `reinstate(order_id, reinstated_by) → reinstated | rejected(not-known | not-on-hold | invalid-request | storage-failure)`) — resume a held order, returning it to the state stored in [Prior State]. Records [Reinstated By] and [Reinstated At]. [Reinstated By] must contain at least one non-whitespace character ([Invalid Request]). [Not On Hold] covers all non-[On Hold] states; terminal and [Amended] states cannot be on hold in the first place, so their specific rejections are not needed here.

- [Dispense] — (Projected contract: `dispense(order_id, dispenser_ref, quantity, lot_number?, dispensed_at?) → dispensed | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-verified | already-dispensed | invalid-request | storage-failure)`) — record the pharmacy releasing the medication. Valid only for orders in [Verified] state. Records [Dispenser Ref], [Quantity] (a positive number), [Lot Number] (if supplied), and [Dispensed At] (wall clock if not supplied); all are immutable after the dispense transition. [Dispenser Ref] must be non-empty and non-whitespace-only; [Quantity] must be strictly positive; either violation is [Invalid Request]. [Not Verified] covers [Ordered] state — an order awaiting pharmacist review may not be dispensed.

- [Administer] — (Projected contract: `administer(order_id, administerer_ref, administered_at?) → administered | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-dispensed | already-administered | invalid-request | storage-failure)`) — record the medication given to the patient. Valid only for orders in [Dispensed] state. Records [Administerer Ref] and [Administered At] (wall clock if not supplied); both are immutable after the administration transition. [Administerer Ref] must be non-empty and non-whitespace-only ([Invalid Request]). [Already Administered] covers orders already in [Administered] state — the order stays [Administered] until explicitly completed or discontinued; subsequent dose events for multi-dose regimens are a composing concept (see *Multi-dose regimens* in Edge cases).

- [Complete] — (Projected contract: `complete(order_id, completed_by, completed_at?) → completed | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-administered | invalid-request | storage-failure)`) — close the order after the full course has been administered. Valid only for orders in [Administered] state. Records [Completed By] and [Completed At] (wall clock if not supplied); both are immutable after the completion transition. [Completed By] must be non-empty and non-whitespace-only ([Invalid Request]).

- [Cancel] — (Projected contract: `cancel(order_id, cancelled_by, reason) → cancelled | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | already-dispensed | invalid-request | storage-failure)`) — terminate the order before any dispensing. Valid only for orders in [Ordered] or [Verified] state. To cancel a held pre-dispensing order, the caller must first reinstate it. Records [Cancelled By], [Cancellation Reason], and [Cancelled At]; all immutable. [Cancelled By] and [Reason] must each be non-empty and non-whitespace-only ([Invalid Request]). [Already Dispensed] covers [Dispensed] and [Administered] states — use [Discontinue] for orders that have been dispensed.

- [Discontinue] — (Projected contract: `discontinue(order_id, discontinued_by, reason) → discontinued | rejected(not-known | on-hold | already-amended | already-cancelled | already-discontinued | already-completed | not-dispensed | invalid-request | storage-failure)`) — terminate the order after dispensing has begun. Valid only for orders in [Dispensed] or [Administered] state. To discontinue a held post-dispensing order, the caller must first reinstate it. Records [Discontinued By], [Discontinuation Reason], and [Discontinued At]; all immutable. [Discontinued By] and [Reason] must each be non-empty and non-whitespace-only ([Invalid Request]). [Not Dispensed] covers [Ordered] and [Verified] states — use [Cancel] for orders that have not been dispensed.

- [Read] — (Projected contract: `read(query) → ordered_sequence_of_orders | rejected(invalid-query)`) — return orders matching the [Query], ordered by [Ordered At] ascending. A query may filter by [Order Id], [Patient Ref], [Medication Ref], [Prescriber Ref], [State], time ranges on [Ordered At], or any combination. A time range filter on [Ordered At] takes the form `{after: <timestamp>, before: <timestamp>}` with both sub-keys optional; `after` is an inclusive lower bound and `before` is an inclusive upper bound. A query supplying only an [Order Id] returns at most one order. A well-formed query matching no orders returns an empty sequence, not a rejection. A query with no filters returns every order in the store. Only malformed parameters surface as [Invalid Query]: a syntactically invalid [Order Id] (non-null, non-empty), an unrecognized state value, or a time range with end before start.

### Outputs

- For [Order]: a fresh [Order Id], or a rejection.
- For [Amend]: a fresh [Order Id] for the successor order, or a rejection.
- For [Verify], [Hold], [Reinstate], [Dispense], [Administer], [Complete], [Cancel], [Discontinue]: the named outcome token (`verified`, `held`, `reinstated`, `dispensed`, `administered`, `completed`, `cancelled`, `discontinued`), or a rejection.
- For [Read]: a (possibly empty) ordered sequence of orders. Each order carries its full field set for its current state. The core fields present on every order are: [Order Id], [Patient Ref], [Prescriber Ref], [Medication Ref], [Dose], [Dose Unit], [Route], [Frequency], [Duration] (if bounded), [Clinical Evidence Ref] (if supplied), [Ordered At], and [State]. State-specific field groups are cumulative: once a group is written by a transition, it persists on the order record in all subsequent states regardless of further transitions, including transitions to [On Hold], terminal states, or [Amended]. The state in which each group first appears is the earliest state from which that group is readable. Amendment fields ([Predecessor Id], [Amended By], [Amendment Reason] on a successor; [Successor Id] on an [Amended] original) — first present when [Amend] completes. Verification fields ([Verifier Ref], [Verified At]) — first present at [Verified]; persist through [Dispensed], [Administered], [Completed], [Discontinued] (if dispensed), [On Hold] (when [Prior State] is [Verified] or a later state), and [Amended] (when amended from [Verified] state). Hold fields ([Held By], [Hold Reason], [Held At], [Prior State]) — present on any order that has been held, including orders currently [On Hold] (most recent hold only; full history requires Event Log). Reinstate fields ([Reinstated By], [Reinstated At]) — present on orders that have been reinstated at least once (most recent reinstate only; full history requires Event Log). Dispense fields ([Dispenser Ref], [Quantity], [Lot Number], [Dispensed At]) — first present at [Dispensed]; persist through [Administered], [Completed], [Discontinued], and [On Hold] (when [Prior State] is [Dispensed], [Administered], or a later state). Administration fields ([Administerer Ref], [Administered At]) — first present at [Administered]; persist through [Completed], [Discontinued] (if administered before discontinuation), and [On Hold] (when [Prior State] is [Administered]). Completion fields ([Completed By], [Completed At]) — present on [Completed] orders only. Cancellation fields ([Cancelled By], [Cancellation Reason], [Cancelled At]) — present on [Cancelled] orders only. Discontinuation fields ([Discontinued By], [Discontinuation Reason], [Discontinued At]) — present on [Discontinued] orders only. The combinations follow mechanically from the state transitions; a [Completed] order carries verification, dispense, and administration field groups simultaneously, and an [On Hold] order from [Dispensed] state carries verification and dispense field groups alongside the hold fields.

### State

Each order is in exactly one state:

- **[Ordered]** — the order has been placed and awaits pharmacist verification. May be verified, amended, held, or cancelled.
- **[Verified]** — a pharmacist has reviewed and cleared the order for dispensing. Carries [Verifier Ref] and [Verified At] (immutable). May be dispensed, amended, held, or cancelled.
- **[Amended]** — the order has been superseded by a successor. Retained and visible; carries [Successor Id] pointing to the correcting order. No further transitions from [Amended]. The successor carries [Predecessor Id], [Amended By], and [Amendment Reason] (all immutable from the moment [Amend] completes).
- **[On Hold]** — the order has been temporarily suspended. Carries [Prior State] (the state before the hold), [Held By], [Hold Reason], and [Held At]. May only be reinstated (returning to [Prior State]); all other state-changing actions are rejected.
- **[Dispensed]** — the pharmacy has prepared and released the medication. Carries [Dispenser Ref], [Quantity], [Lot Number] (if recorded), and [Dispensed At] (all immutable). May be administered, held, or discontinued.
- **[Administered]** — at least one dose has been given to the patient. Carries [Administerer Ref] and [Administered At] (immutable). May be completed, held, or discontinued.
- **[Completed]** — the full course has been administered. Carries [Completed By] and [Completed At] (immutable). Terminal; no further transitions.
- **[Cancelled]** — the order was terminated before any dispensing. Carries [Cancelled By], [Cancellation Reason], and [Cancelled At] (immutable). Terminal; no further transitions.
- **[Discontinued]** — the order was terminated after dispensing had begun. Carries [Discontinued By], [Discontinuation Reason], and [Discontinued At] (immutable). Terminal; no further transitions.

Valid transitions — writes only; terminal states ([Completed], [Cancelled], [Discontinued]) and [Amended] are absorbing, and [On Hold] admits only [Reinstate] (Invariants 7, 8, 9):

| action | from | to |
| --- | --- | --- |
| [Verify] | [Ordered] | **[Verified]** |
| [Amend] | [Ordered] or [Verified] | original → **[Amended]**, successor → **[Ordered]** |
| [Hold] | [Ordered], [Verified], [Dispensed], [Administered] | **[On Hold]** ([Prior State] recorded) |
| [Reinstate] | [On Hold] | **[Prior State]** |
| [Dispense] | [Verified] | **[Dispensed]** |
| [Administer] | [Dispensed] | **[Administered]** |
| [Complete] | [Administered] | **[Completed]** |
| [Cancel] | [Ordered] or [Verified] | **[Cancelled]** |
| [Discontinue] | [Dispensed] or [Administered] | **[Discontinued]** |

No other transitions exist. Successor orders created by [Amend] always start in [Ordered] state, regardless of whether the original was [Ordered] or [Verified]. A purged or deleted state does not exist in this atom. Retention and eventual destruction belong to composing patterns ([Retention Window](./retention-window.md), [Legal Hold](../roadmap.md)).

### Flow

1. **Prescriber places the order.** Calls `order(patient_ref: "p77", prescriber_ref: "dr_osei", medication_ref: "med-lisinopril-10mg", dose: 10, dose_unit: "mg", route: "oral", frequency: "QD", duration: 30)`. The atom assigns [Order Id], sets [State] = [Ordered], records [Ordered At]. Returns [Order Id].
2. **Pharmacist reviews and clears.** Calls `verify(order_id, verifier_ref: "pharm_wu")`. Records [Verifier Ref] and [Verified At], transitions to [Verified]. Returns `verified`.
3. **Pharmacy dispenses.** Calls `dispense(order_id, dispenser_ref: "tech_jones", quantity: 30)`. Records dispense fields, transitions to [Dispensed]. Returns `dispensed`.
4. **Nurse administers the first dose.** Calls `administer(order_id, administerer_ref: "nurse_kim")`. Records administration fields, transitions to [Administered]. Returns `administered`.
5. **Course completes.** Calls `complete(order_id, completed_by: "nurse_kim")`. Records completion fields, transitions to [Completed]. Returns `completed`.

Alternate paths: prescriber amends before dispensing (creates successor in [Ordered]); order held for surgery then reinstated; order cancelled before dispensing; order discontinued after dispensing begins.

### Decision points

- **At [Order]** — [Patient Ref], [Prescriber Ref], and [Medication Ref] must each contain at least one non-whitespace character; [Dose] must be a positive number; [Dose Unit], [Route], and [Frequency] must each contain at least one non-whitespace character; [Duration], if supplied, must be a positive number; [Clinical Evidence Ref], if supplied, must contain at least one non-whitespace character; [Ordered At], if supplied, must not be in the future (checked against the receiving node's wall clock). Any violation rejects as [Invalid Order]. [Storage Failure] if the store write fails after all preconditions pass; no [Order Id] is issued and no record enters the store.

- **At [Amend]** — [Not Known] if the [Order Id] does not exist; `on-hold` if the order is [On Hold] (reinstate first); [Already Amended] if [Amended]; [Already Cancelled] or [Already Discontinued] if terminal; [Already Dispensed] if [Dispensed], [Administered], or [Completed]. If none of the above: [Amended By] must be non-empty and non-whitespace-only, [Reason] must be non-empty and non-whitespace-only — either failing is [Invalid Request]. At least one supplied dosing parameter must differ from the original's current values — an amend that changes nothing is [Invalid Request]. The change-detection check treats an absent parameter (not supplied in the call) as "keep the original value" and an explicitly nil [Duration] as "remove the duration, converting the order to open-ended." Setting [Duration] to nil when the original has a duration is therefore a valid change. Setting [Duration] to nil when the original already has no duration is not a change and is rejected as [Invalid Request] if it is the only parameter supplied. If either the successor creation or the original's state update cannot be made durable, `rejected(storage-failure)` and no observable state change occurs: the successor is not created and the original remains in its prior state. See *`amend` two-write atomicity* in Edge cases.

- **At [Verify]** — [Not Known]; `on-hold`; [Already Amended], [Already Cancelled], [Already Discontinued], [Already Completed] (terminal/inactive); [Not In Ordered State] for [Verified], [Dispensed], and [Administered] states — the order has already been verified or has progressed beyond the verification stage. [Verifier Ref] must be non-empty and non-whitespace-only ([Invalid Request]). [Storage Failure] if the state update cannot be made durable; order remains [Ordered].

- **At [Hold]** — [Not Known]; [Already On Hold]; [Already Completed], [Already Cancelled], [Already Discontinued], [Already Amended] (terminal/inactive). Valid source states: [Ordered], [Verified], [Dispensed], [Administered]. [Held By] and [Reason] must each be non-empty and non-whitespace-only ([Invalid Request]). [Storage Failure] leaves the order's state unchanged.

- **At [Reinstate]** — [Not Known]; [Not On Hold] for any non-[On Hold] state. [Reinstated By] must be non-empty and non-whitespace-only ([Invalid Request]). Reinstates to the state stored in [Prior State] — the target state is not a parameter. [Storage Failure] leaves the order [On Hold].

- **At [Dispense]** — [Not Known]; `on-hold`; [Already Amended], [Already Cancelled], [Already Discontinued], [Already Completed] (terminal/inactive); [Not Verified] for [Ordered] state — an unverified order may not be dispensed; [Already Dispensed] for [Dispensed] and [Administered] states. [Dispenser Ref] must be non-empty and non-whitespace-only; [Quantity] must be strictly positive; either failing is [Invalid Request]. [Lot Number], if supplied, must be non-empty and non-whitespace-only. [Storage Failure] leaves the order [Verified].

- **At [Administer]** — [Not Known]; `on-hold`; [Already Amended], [Already Cancelled], [Already Discontinued], [Already Completed] (terminal/inactive); [Not Dispensed] for [Ordered] and [Verified] states ([Amended] orders return [Already Amended] at higher priority and do not reach this check); [Already Administered] for [Administered] state. [Administerer Ref] must be non-empty and non-whitespace-only ([Invalid Request]). [Storage Failure] leaves the order [Dispensed].

- **At [Complete]** — [Not Known]; `on-hold`; [Already Amended], [Already Cancelled], [Already Discontinued], [Already Completed] (terminal/inactive); [Not Administered] for [Ordered], [Verified], and [Dispensed] states. [Completed By] must be non-empty and non-whitespace-only ([Invalid Request]). [Storage Failure] leaves the order [Administered].

- **At [Cancel]** — [Not Known]; `on-hold` (reinstate first to surface the order's lifecycle position before terminating it — see Invariant 9 and Behavior); [Already Amended], [Already Cancelled], [Already Discontinued], [Already Completed] (terminal/inactive); [Already Dispensed] for [Dispensed] or [Administered] states — use [Discontinue] instead. Valid source states: [Ordered], [Verified]. [Cancelled By] and [Reason] must each be non-empty and non-whitespace-only ([Invalid Request]). [Storage Failure] leaves the order's state unchanged.

- **At [Discontinue]** — [Not Known]; `on-hold` (reinstate first); [Already Amended], [Already Cancelled], [Already Discontinued], [Already Completed] (terminal/inactive); [Not Dispensed] for [Ordered], [Verified], and [Amended] states — use [Cancel] instead. Valid source states: [Dispensed], [Administered]. [Discontinued By] and [Reason] must each be non-empty and non-whitespace-only ([Invalid Request]). [Storage Failure] leaves the order's state unchanged.

- **At [Read]** — any supplied [Order Id] must be syntactically valid (non-null, non-empty). Any supplied state filter must name one of the nine valid states. A time range filter on [Ordered At] must have `after` ≤ `before` when both are supplied; a range with `after` > `before` is [Invalid Query]. A query with no filters is well-formed. A well-formed query matching no orders returns an empty sequence, not a rejection. Only malformed parameters surface as [Invalid Query].

### Behavior

- **Orders are durable on success.** Once [Order] returns an [Order Id], the order is in the store and will appear in subsequent reads.
- **Amendment is additive, not destructive.** [Amend] creates a new order record; the original is retained in [Amended] state. Both are visible to [Read]; queries filtering for non-[Amended] states return only active orders.
- **The successor always starts in [Ordered] state.** An amendment to a [Verified] order produces a successor requiring fresh pharmacist verification before dispensing. The original [Verified] order's [Verifier Ref] and [Verified At] remain on the [Amended] original and do not transfer to the successor.
- **Hold is reversible; reinstate returns to [Prior State].** [Prior State] is set at hold time and determines where reinstate returns. No action other than [Reinstate] (and [Read]) is valid against an [On Hold] order.
- **[Cancel] and [Discontinue] require reinstate before acting on held orders.** This is deliberate friction: a held order's lifecycle position is suspended. Explicitly reinstating it (acknowledging where in the lifecycle the order stands) before terminating it prevents accidental termination of orders paused for procedural reasons.
- **Terminal states are absorbing.** [Completed], [Cancelled], and [Discontinued] orders accept no further state transitions. [Amended] orders are similarly inactive.
- **Reads are repeatable; the underlying store is monotonic.** The order store only grows. An unfiltered read at `t2 > t1` returns every order visible at `t1` plus any added in between. State-filtered reads are not monotonic: an order visible at `t1` under a given state filter may be absent at `t2` if it transitioned.

### Feedback

- After [Order] — a new [Ordered] record exists; [Order Id], core fields, and [Ordered At] are set and immutable.
- After [Amend] — the original is now [Amended] (acquires [Successor Id]); a new [Ordered] successor exists with [Predecessor Id], [Amended By], and [Amendment Reason] set and immutable. The original's core fields are unchanged.
- After [Verify] — the order is now [Verified]; [Verifier Ref] and [Verified At] are set and immutable.
- After [Hold] — the order is now [On Hold]; [Prior State], [Held By], [Hold Reason], and [Held At] are set.
- After [Reinstate] — the order is now in the state named by [Prior State]; [Reinstated By] and [Reinstated At] are set. They reflect the most recent reinstate; a subsequent hold/reinstate cycle will overwrite them — see Invariant 12 and *Multiple hold cycles* in Edge cases.
- After [Dispense] — the order is now [Dispensed]; [Dispenser Ref], [Quantity], [Lot Number] (if supplied), and [Dispensed At] are set and immutable.
- After [Administer] — the order is now [Administered]; [Administerer Ref] and [Administered At] are set and immutable.
- After [Complete] — the order is now [Completed]; [Completed By] and [Completed At] are set and immutable.
- After [Cancel] — the order is now [Cancelled]; [Cancelled By], [Cancellation Reason], and [Cancelled At] are set and immutable.
- After [Discontinue] — the order is now [Discontinued]; [Discontinued By], [Discontinuation Reason], and [Discontinued At] are set and immutable.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Order immutability.** After a successful [Order], the fields [Order Id], [Patient Ref], [Prescriber Ref], [Medication Ref], [Dose], [Dose Unit], [Route], [Frequency], [Duration], [Clinical Evidence Ref], and [Ordered At] never change, regardless of any subsequent actions.

- **Invariant 2 — Successor inherits identity fields.** The successor created by [Amend] carries the same [Patient Ref] and [Medication Ref] as the original, by construction: [Amend] does not accept either as a parameter, making divergence structurally impossible. [Prescriber Ref] is also inherited; [Amended By] records who made the amendment, but prescribing authorship belongs to the original prescriber. A clinician who needs to change the medication must cancel the original and place a new order.

- **Invariant 3 — Amendment is pre-dispensing only.** [Amend] is rejected for any order in [Dispensed], [Administered], [Completed], [On Hold], [Cancelled], [Discontinued], or [Amended] state. An order that has crossed the dispensing boundary requires discontinuing and reordering, not amendment, because the medication has left the pharmacy's custody.

- **Invariant 4 — Amendment chains are linear.** Each order has at most one [Successor Id] and at most one [Predecessor Id]. Amendment chains are singly-linked; branching is not permitted. An already-[Amended] order rejects [Amend] with [Already Amended].

- **Invariant 5 — Hold carries [Prior State]; reinstate returns to it.** When [Hold] transitions an order to [On Hold], the current state is recorded as [Prior State]. [Reinstate] transitions the order to the state named in [Prior State] — the atom does not accept a target state as a parameter, so deviation from the recorded prior state is structurally impossible.

- **Invariant 6 — Cancel is pre-dispensing; discontinue is post-dispensing.** [Cancel] is rejected for orders in [Dispensed], [Administered], or [Completed] state — use [Discontinue]. [Discontinue] is rejected for orders in [Ordered] or [Verified] state — use [Cancel]. This boundary is clinically and regulatorily load-bearing: a cancelled order (medication never reached the patient) has materially different implications for pharmacy accounting, DEA controlled-substance reconciliation, and adverse-event investigation than a discontinued order (medication was dispensed or administered but stopped).

- **Invariant 7 — Terminal states are absorbing.** An order in [Completed], [Cancelled], or [Discontinued] state accepts no further state transitions. Any action other than [Read] against such an order is rejected with the appropriate already-terminal reason.

- **Invariant 8 — Amended state is inactive.** An order in [Amended] state accepts no further state transitions. All actions other than [Read] against an [Amended] order are rejected with [Already Amended]. Clinical workflow continues on the successor.

- **Invariant 9 — On Hold accepts only reinstate.** An order in [On Hold] state accepts no state-changing actions other than [Reinstate]. All other state-changing actions return `on-hold`. This enforces that an order's lifecycle position is explicitly surfaced before any further action is taken.

- **Invariant 10 — All actor references are required and non-whitespace.** Every action that writes an actor attribution field requires the value to contain at least one non-whitespace character: [Prescriber Ref] at [Order]; [Amended By] at [Amend]; [Verifier Ref] at [Verify]; [Held By] at [Hold]; [Reinstated By] at [Reinstate]; [Dispenser Ref] at [Dispense]; [Administerer Ref] at [Administer]; [Completed By] at [Complete]; [Cancelled By] at [Cancel]; [Discontinued By] at [Discontinue]. Whitespace-only values are treated as empty and rejected as [Invalid Request] (or [Invalid Order] for [Order]). Attribution is the core non-repudiation property of this atom; an empty actor reference undermines every regulated adversarial scenario.

- **Invariant 11 — Reason fields are required and non-whitespace.** [Hold Reason] (at [Hold]), [Cancellation Reason] (at [Cancel]), [Discontinuation Reason] (at [Discontinue]), and [Amendment Reason] (at [Amend]) must each contain at least one non-whitespace character. These reasons are the clinical and administrative explanations that make the record interpretable in audit, dispute, and forensic investigation. An empty reason defeats the audit trail the same way an empty actor reference does.

- **Invariant 12 — Transition metadata is write-once, with two exceptions.** Every field written by a state-transition action is immutable after that transition completes — with two related exceptions. First, a second [Hold] call on an order that has been reinstated overwrites the prior hold fields ([Held By], [Hold Reason], [Held At], [Prior State]) with the new hold's values. Second, a second [Reinstate] call (following a second hold) overwrites the prior reinstate fields ([Reinstated By], [Reinstated At]) with the new reinstate's values. Neither is a violation of immutability in the per-transition sense: each individual hold and each individual reinstate transition writes its fields once and those fields are immutable until the next cycle. The order record carries the most recent hold's and most recent reinstate's metadata; a full hold/reinstate history requires composing with Event Log or Audit Trail (see *Multiple hold cycles* in Edge cases). All other transition metadata fields — [Verifier Ref], [Verified At], all dispense fields, all administration fields, all completion/cancellation/discontinuation fields, all amendment chain fields — are written once and never change.

- **Invariant 13 — [Ordered At] is set once.** [Ordered At] is set at [Order] time (from the supplied value or the receiving node's wall clock) and never changes. The successor order created by [Amend] carries its own [Ordered At], reflecting when the amendment was placed.

- **Invariant 14 — Order store durability.** No [Order Id] is removed from the store. State transitions never destroy records. The order count is monotonically non-decreasing for the lifetime of the store instance, and the store admits no deletion surface by spec. A [Storage Failure] response from any action guarantees that no partial record or partial state change is observable: the action either makes all required writes durable or has no observable effect. An implementation that returns [Storage Failure] while leaving a partial record visible is non-conforming.

---

## Examples

### Happy path — inpatient order through completion

A physician orders a blood pressure medication: `order(patient_ref: "p77", prescriber_ref: "dr_osei", medication_ref: "med-lisinopril-10mg", dose: 10, dose_unit: "mg", route: "oral", frequency: "QD", duration: 30)` → `order_id: "ord-001"`. The clinical pharmacist verifies: `verify("ord-001", verifier_ref: "pharm_wu")` → `verified`. The pharmacy tech dispenses: `dispense("ord-001", dispenser_ref: "tech_jones", quantity: 30, lot_number: "LOT-2026-A")` → `dispensed`. The morning nurse administers the first dose: `administer("ord-001", administerer_ref: "nurse_kim")` → `administered`. After 30 days: `complete("ord-001", completed_by: "nurse_kim")` → `completed`. The order now carries all five attribution fields — prescriber, verifier, dispenser, administerer, completer — each immutable.

### Amendment — dose correction before dispensing

The physician realizes the dose should be 5mg before the pharmacist has dispensed. Calls `amend("ord-001", amended_by: "dr_osei", dose: 5, reason: "prescribing error — weight-based dose is 5mg, not 10mg")` → `order_id: "ord-002"`. The store now contains ord-001 ([Amended], `successor_id: "ord-002"`) and ord-002 ([Ordered], `predecessor_id: "ord-001"`, dose 5mg, `amended_by: "dr_osei"`, `amendment_reason: "prescribing error..."`). The pharmacist receives ord-002 for verification. A query for non-[Amended] orders returns only ord-002; the audit record preserves both the original dose and the correction.

### Hold and reinstate — surgical pause

An order for warfarin (anticoagulant) is [Verified]. Before dispensing, the patient is scheduled for surgery. Nurse calls `hold("ord-003", held_by: "nurse_chen", reason: "surgical hold — patient NPO, anticoagulation contraindicated per surgical consult")` → `held`. `prior_state: Verified` is recorded. After surgery: `reinstate("ord-003", reinstated_by: "nurse_chen")` → `reinstated`. The order returns to [Verified] and is again eligible for dispensing.

### Rejection path — amendment attempted after dispensing

The pharmacy has already dispensed ord-001. The prescriber attempts to correct the dose: `amend("ord-001", amended_by: "dr_osei", dose: 5, reason: "dose correction")` → `rejected(already-dispensed)`. The prescriber must instead discontinue the active order and place a new one with the corrected dose. This is an intentional constraint: a dose change after the medication has left the pharmacy cannot be undone by amending the record — the physical medication in the patient's possession exists at the original dose.

### Rejection path — cancel attempted after dispensing

A prescriber calls `cancel("ord-001", cancelled_by: "dr_osei", reason: "no longer needed")` against an order in [Dispensed] state → `rejected(already-dispensed)`. For an order that has left the pharmacy, [Discontinue] is the correct action. The distinction matters for DEA accounting: a cancelled order implies no medication was ever dispensed; a discontinued order implies medication was dispensed and must be reconciled.

### Rejection path — dispense without verification

A pharmacy system attempts to dispense an order still in [Ordered] state: `dispense("ord-005", dispenser_ref: "tech_jones", quantity: 30)` → `rejected(not-verified)`. No medication is released; the pharmacist must verify the order before any dispensing occurs.

### Rejection path — action against an on-hold order

A physician attempts to amend an order while it is [On Hold]: `amend("ord-006", amended_by: "dr_osei", dose: 5, reason: "dose correction")` → `rejected(on-hold)`. The order must be reinstated first. This enforces that the lifecycle position is explicitly acknowledged — the prescriber must surface whether the hold is still appropriate before modifying the order.

---

## Regulated adversarial scenarios

### Regulator audit — DEA controlled substance prescription trail

A DEA auditor investigating Schedule II controlled substance dispensing requests the complete lifecycle history for a specific order. Queries `read({order_id: "ord-cs-017"})`. The result must show: the prescriber ([Prescriber Ref], [Ordered At]) — immutable by Invariant 1; the pharmacist who verified ([Verifier Ref], [Verified At]) — immutable by Invariant 12; the dispenser ([Dispenser Ref], [Quantity], [Lot Number], [Dispensed At]) — immutable by Invariant 12; and the administerer ([Administerer Ref], [Administered At]) — immutable by Invariant 12. If the order was amended before dispensing, the amendment chain — original ([Amended], with [Successor Id]), intermediate orders, and the final dispensed successor — is traceable via [Predecessor Id] / [Successor Id] links, with each link's [Amended By] and [Amendment Reason] immutable by Invariant 12. No gap in the chain is permitted. The audit clears when the records alone account for every controlled unit: who prescribed, who cleared, who released, and who administered — without recourse to developer testimony, runbooks, or log integrity.

### Disputed order — wrong medication or wrong dose alleged

A patient alleges they were administered a different medication than prescribed, or a dose different from what their physician ordered. The investigator queries the order record for `ord-022`. Invariant 1 guarantees [Medication Ref] is immutable — it cannot have been edited to cover the discrepancy. The dispenser record ([Dispenser Ref], [Quantity], [Dispensed At]) and the administration record ([Administerer Ref], [Administered At]) are both immutable by Invariant 12. If there is an amendment chain, every amendment carries [Amended By] and [Amendment Reason] (immutable by Invariant 12), and the ordering of events is deterministic via the [Predecessor Id] / [Successor Id] chain and [Ordered At] timestamps. The dispute is answered from the records alone: the medication identity, dose, attributing actors, and timing are all permanently fixed, and no field can have been retroactively altered.

### Breach investigation — controlled substance diversion

An internal audit detects a quantity discrepancy: a controlled substance lot appears dispensed but no administration record exists for the corresponding order. The investigator queries `read({medication_ref: "med-oxycodone-5mg"})` across the date range and filters for orders in [Dispensed] state. The result surfaces orders that have reached [Dispensed] but not [Administered] or [Completed]. For each such order, [Dispenser Ref] and [Quantity] are on record and immutable by Invariant 12 — the dispenser attribution cannot have been edited after the fact. The absence of an [Administer] transition on an order that was dispensed is itself a forensic signal. If the order was discontinued without administration, [Discontinued By] (required non-empty by Invariant 10) and [Discontinuation Reason] (required non-empty by Invariant 11) must both be present and immutable — an unexplained discontinuation with no actor or no reason is a conformance failure. The investigation has the dispenser identity, the dispensing timestamp, the lot number, and the quantity; the audit trail either closes the chain or names the gap.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Core field immutability check.** For a known [Order Id], retrieve the order at two different times and compare all core fields. [Order Id], [Patient Ref], [Prescriber Ref], [Medication Ref], [Dose], [Dose Unit], [Route], [Frequency], [Duration], [Clinical Evidence Ref], and [Ordered At] must be identical in both reads. Any transition-metadata field that is set in either read must hold the same value in any later read where it is present. A transition-metadata field that changes between two reads (other than hold fields overwritten by a subsequent hold cycle, per Invariant 12) is a conformance failure.

2. **Amendment chain integrity check.** For a known [Amended] order, retrieve its [Successor Id] and confirm the successor exists, carries a [Predecessor Id] equal to the original's [Order Id], and shares the same [Patient Ref] and [Medication Ref] as the original. Confirm [Amended By] and [Amendment Reason] are non-empty on the successor. Confirm that the original's [Verifier Ref] and [Verified At] are NOT present on the successor — the original's verification does not transfer; if the successor carries [Verifier Ref], it must have been set by a subsequent [Verify] call using the successor's own [Order Id] (verifiable by confirming the successor has been in [Verified] or a downstream state).

3. **Terminal state finality check.** Attempt a state-changing action ([Verify], [Dispense], [Hold], [Cancel], or [Discontinue]) against a known [Completed], [Cancelled], and [Discontinued] order respectively. All calls must return the appropriate already-terminal rejection. Confirm each order's fields are unchanged after the attempted action.

4. **Pre-dispensing amendment boundary check.** Attempt [Amend] against a known [Dispensed] order. The call must return `rejected(already-dispensed)`. Confirm no successor order was created and the original's state is unchanged.

5. **Role attribution completeness check.** For every order in the store: confirm [Prescriber Ref] is non-empty. For every order currently carrying [Verifier Ref] (any order whose record includes this field, regardless of current state — including [On Hold] orders that were verified before being held, and terminal orders that passed through [Verified]): confirm [Verifier Ref] is non-empty. For every order currently carrying [Dispenser Ref]: confirm [Dispenser Ref] is non-empty and [Quantity] is positive. For every order currently carrying [Administerer Ref]: confirm [Administerer Ref] is non-empty. Additionally, for every order in [Dispensed], [Administered], or [Completed] state: confirm [Verifier Ref] is present — these states are only reachable via the [Verified] state, so a missing [Verifier Ref] is a conformance failure regardless of how the audit is timed. An order missing a required attribution field is a conformance failure.

6. **No-destruction check.** For a set of [Order Id]s known to have been issued — including [Amended], [Cancelled], and [Discontinued] ones — confirm that [Read] returns each of them when queried by [Order Id] across all states. No issued id may be absent from the store.

---

## Edge cases and explicit non-goals

- **Amending to remove duration.** Setting [Duration] to nil in an [Amend] call converts a duration-bounded order to an open-ended one; this counts as a change and is valid. The reverse — supplying a [Duration] on an amendment when the original had none — is also valid. Open-ended orders that have been amended to be bounded must be explicitly completed or discontinued when the course ends.

- **Multiple hold cycles.** An order may be held and reinstated more than once. Each [Hold] call overwrites the prior hold fields on the order record ([Held By], [Hold Reason], [Held At], [Prior State]) with the new values; each [Reinstate] call overwrites the prior reinstate fields ([Reinstated By], [Reinstated At]) with the new values. The order record carries the most recent hold's metadata and the most recent reinstate's metadata. A complete history of every hold and reinstatement event requires composing with [Event Log](./event-log.md) or [Audit Trail](../compositions/audit-trail.md), which capture every state transition as an immutable event. This behavior is consistent with Invariant 12's "write-once per transition" framing — each hold and each reinstate is its own transition that writes its fields once.

- **`amend` two-write atomicity.** The [Amend] operation requires two durable writes: creating the successor order and updating the original to [Amended] state with a [Successor Id]. A crash between writes leaves the store inconsistent — either a successor exists without the original pointing to it, or the original is marked [Amended] with a [Successor Id] that does not exist (both violate Invariant 4). Implementations must provide atomic transaction support across both writes, or a crash-recovery scan that detects and repairs dangling amendment links on restart. A [Storage Failure] response is the observable signal of an aborted two-write attempt; per Invariant 14, no partial record is visible after such a response.

- **Multi-dose regimens.** The [Administer] action transitions the order from [Dispensed] to [Administered] on the first recorded administration and returns [Already Administered] on any subsequent call. For multi-dose regimens (daily medication for 30 days, weekly chemotherapy), individual dose events beyond the first are not modeled by this atom. Individual dose event tracking is a composing concept: a Medication Administration Record layer composed with Event Log captures each subsequent dose. This atom tracks the order's lifecycle state; the individual-dose surface belongs to the composing layer.

- **`order` idempotency.** [Order] is not idempotent. A prescriber system that retries after a network timeout creates a duplicate order if the first call succeeded; both calls return distinct [Order Id]s. For at-most-once semantics on order submission, compose with [Duplicate Prevention](./duplicate-prevention.md). DEA EPCS (Electronic Prescriptions for Controlled Substances) two-factor attestation requirements belong to [Actor Identity](./actor-identity.md).

- **Entered-in-error orders.** An order placed by mistake (wrong patient, system glitch, duplicate submission) should be cancelled with a reason identifying it as an entry error. The atom has no separate `entered-in-error` state; [Cancel] with an appropriate reason is the mechanism. The [Cancellation Reason] field carries the semantic distinction between a clinical decision and a clerical correction. For controlled substances, entered-in-error cancellations may carry additional DEA reporting obligations; those belong to a DEA-reporting composing pattern.

- **Refills.** Outpatient prescriptions often carry refill counts. A refill is a new dispensing event against a prior prescription. This atom does not model refills; each refill would require either a new order or a composing layer on top of this atom. The atom closes at Completed or Discontinued.

- **Access control.** Who may place, verify, dispense, administer, or terminate an order is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. DEA prescriber-authorization and pharmacist-licensure checks are access-control concepts.

- **Controlled substance schedule.** Whether [Medication Ref] refers to a DEA-scheduled substance, and the regulatory obligations that attach (DEA registration, EPCS two-factor, refill restrictions, quantity limits), are not modeled by this atom. [Medication Ref] is opaque. Deployments handling controlled substances compose with appropriate regulatory controls.

- **Retention and destruction.** The atom retains all orders indefinitely. Retention under HIPAA (US Health Insurance Portability and Accountability Act) and applicable state law, and eventual defensible destruction, belong to [Retention Window](./retention-window.md) and [Legal Hold](../roadmap.md).

- **Tamper-evidence.** The atom guarantees immutability by spec; it does not cryptographically prevent a store administrator from rewriting records. Compose with [Tamper Evidence](./tamper-evidence.md) for cryptographic guarantees. DEA EPCS non-alteration requirements are satisfied at the layer Tamper Evidence provides.

- **Concurrency.** Two systems concurrently calling [Verify] on the same order, or [Dispense] after concurrent verifications, is not handled at this layer. Implementations must serialize state transitions on a given [Order Id].

- **Clock semantics.** [Ordered At] and all `_at` timestamp fields default to the receiving node's wall clock when not supplied. The future-timestamp restriction applies only to [Ordered At] — a prescription cannot logically be dated in the future. All other `_at` fields ([Verified At], [Dispensed At], [Administered At], [Completed At], [Cancelled At], [Discontinued At], [Held At], [Reinstated At]) accept caller-supplied values including back-dated ones, with no look-back limit imposed by this atom. Back-dating is normal in clinical documentation: a nurse charting a dose administered six hours earlier, or a pharmacist recording a dispense that occurred before the system was available, produces a back-dated timestamp that the atom accepts. Clock skew, timezone normalization (storage in UTC), and monotonicity are handled at the deployment layer. When two or more orders share the same [Ordered At], the relative order in a [Read] result is implementation-defined but must be stable across consecutive reads of the same store state.

- **Rejection priority.** When multiple precondition violations exist on the same call, the rejection returned follows a defined priority: [Not Known] (id existence) → `on-hold` (for actions that reject on hold) → [Already Amended] / [Already Cancelled] / [Already Discontinued] / [Already Completed] (terminal/inactive states) → state-specific rejections ([Not In Ordered State], [Not Verified], [Not Dispensed], [Not Administered], [Already Dispensed], [Already Administered], [Already On Hold]) → [Invalid Request] (actor references, reason fields, content) → [Storage Failure] (persistence). This order is the same across conforming implementations.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Order

The behavior a prescriber invokes to place a new prescription. It assigns a fresh [Order Id], records the core clinical fields ([Patient Ref], [Prescriber Ref], [Medication Ref], [Dose], [Dose Unit], [Route], [Frequency], [Duration], [Clinical Evidence Ref]) and [Ordered At], and returns the [Order Id] (or [Invalid Order] / [Storage Failure]). The order enters [Ordered].

Kind: Operation

#### Amend

The behavior that corrects a pre-dispensing order's dosing parameters by creating a successor. The original transitions to [Amended] with a [Successor Id]; the successor is [Ordered] with a [Predecessor Id], [Amended By], and [Amendment Reason], inheriting [Patient Ref], [Prescriber Ref], and [Medication Ref] by construction. Valid only from [Ordered] or [Verified] (Invariant 3).

Kind: Operation

#### Verify

The behavior recording pharmacist review and clearance for dispensing. Valid only from [Ordered]; records [Verifier Ref] and [Verified At] and transitions to [Verified].

Kind: Operation

#### Hold

The behavior that temporarily suspends an actionable order, recording the current state as [Prior State] plus [Held By], [Hold Reason], and [Held At], and transitioning to [On Hold]. Valid from [Ordered], [Verified], [Dispensed], or [Administered].

Kind: Operation

#### Reinstate

The behavior that resumes an [On Hold] order, returning it to the state stored in [Prior State] and recording [Reinstated By] and [Reinstated At]. The target state is not a parameter (Invariant 5).

Kind: Operation

#### Dispense

The behavior recording the pharmacy releasing the medication. Valid only from [Verified]; records [Dispenser Ref], [Quantity], [Lot Number], and [Dispensed At] and transitions to [Dispensed].

Kind: Operation

#### Administer

The behavior recording the medication given to the patient. Valid only from [Dispensed]; records [Administerer Ref] and [Administered At] and transitions to [Administered]. Subsequent calls return [Already Administered]; individual dose events are a composing concept.

Kind: Operation

#### Complete

The behavior that closes the order after the full course. Valid only from [Administered]; records [Completed By] and [Completed At] and transitions to terminal [Completed].

Kind: Operation

#### Cancel

The behavior that terminates a pre-dispensing order. Valid only from [Ordered] or [Verified]; records [Cancelled By], [Cancellation Reason], and [Cancelled At] and transitions to terminal [Cancelled]. Post-dispensing orders use [Discontinue] (Invariant 6).

Kind: Operation

#### Discontinue

The behavior that terminates a post-dispensing order. Valid only from [Dispensed] or [Administered]; records [Discontinued By], [Discontinuation Reason], and [Discontinued At] and transitions to terminal [Discontinued]. Pre-dispensing orders use [Cancel] (Invariant 6).

Kind: Operation

#### Read

The read-only behavior that returns the orders matching a [Query], ordered by [Ordered At] ascending. It changes nothing. Filters by [Order Id], [Patient Ref], [Medication Ref], [Prescriber Ref], [State], or time range are combinable.

Kind: Operation

#### Order Id

The opaque, immutable, system-generated identity of an order, assigned on [Order], never reused or reassigned within the store instance. The clinical content and lifecycle events are properties of the order, not its identity.

Kind:     Field
Field of: the order record
Projects: order_id

#### Patient Ref

The opaque, globally-scoped reference to the patient. Set on [Order], immutable, inherited unchanged by any successor across an amendment chain (Invariant 2).

Kind:     Field
Field of: the order record
Projects: patient_ref

#### Prescriber Ref

The opaque reference to the prescriber who placed the order. Set on [Order], immutable, inherited by any successor (Invariant 2); a correction carries its own [Amended By] and never changes [Prescriber Ref]. Non-null required (Invariant 10).

Kind:     Field
Field of: the order record
Projects: prescriber_ref

#### Medication Ref

The opaque reference to the drug and formulation. Set on [Order], immutable, inherited across an amendment chain (Invariant 2). [Amend] does not accept it — a wrong medication requires [Cancel] and re-order.

Kind:     Field
Field of: the order record
Projects: medication_ref

#### Dose

The prescribed dose, a positive number. Set on [Order]; correctable pre-dispensing via [Amend] (which creates a successor, not an edit).

Kind:     Field
Field of: the order record
Projects: dose

#### Dose Unit

The unit of the [Dose] (e.g., mg). A non-empty string set on [Order]; correctable via [Amend].

Kind:     Field
Field of: the order record
Projects: dose_unit

#### Route

The administration route (e.g., oral, IV). A non-empty string set on [Order]; correctable via [Amend].

Kind:     Field
Field of: the order record
Projects: route

#### Frequency

The dosing frequency (e.g., QD). A non-empty string set on [Order]; correctable via [Amend].

Kind:     Field
Field of: the order record
Projects: frequency

#### Duration

The optional course length, a positive number if supplied; absent ⇒ open-ended. Set on [Order]; correctable via [Amend], where setting it to nil converts a bounded order to open-ended.

Kind:     Field
Field of: the order record
Projects: duration

#### Clinical Evidence Ref

The optional opaque reference to the clinical evidence (e.g., a Clinical Observation) that informed prescribing — advisory metadata the atom does not interpret. Set on [Order] if supplied (non-empty); absent otherwise.

Kind:     Field
Field of: the order record
Projects: clinical_evidence_ref

#### Ordered At

The wall-time the order was placed — supplied or defaulted to the receiving node's wall clock; must not be future. Set once on [Order], immutable (Invariant 13). The ordering key for [Read].

Kind:     Field
Field of: the order record
Projects: ordered_at

#### State

The order's lifecycle state — one of [Ordered], [Verified], [Amended], [On Hold], [Dispensed], [Administered], [Completed], [Cancelled], or [Discontinued]. Exactly one at any time; transitions per the table in State.

Kind:     Field
Field of: the order record
Projects: state

#### Successor Id

The [Order Id] of the correcting order, written onto the original when it is [Amended]. At most one per order (linear chains, Invariant 4); write-once (Invariant 12).

Kind:     Field
Field of: the order record
Projects: successor_id

#### Predecessor Id

The [Order Id] of the order a successor corrects — set on the successor at [Amend] time. At most one per order (Invariant 4); write-once.

Kind:     Field
Field of: the order record
Projects: predecessor_id

#### Amended By

The opaque reference to the clinician who made the correction — set on the successor at [Amend] time, write-once (Invariant 12). Non-null required (Invariant 10).

Kind:     Field
Field of: the order record
Projects: amended_by

#### Amendment Reason

The required, non-empty reason for the correction — set on the successor at [Amend] time, write-once (Invariants 11 and 12).

Kind:     Field
Field of: the order record
Projects: amendment_reason

#### Verifier Ref

The opaque reference to the pharmacist who verified the order. Set at [Verify], write-once (Invariant 12); does not transfer to an amendment successor. Non-null required.

Kind:     Field
Field of: the order record
Projects: verifier_ref

#### Verified At

The timestamp of [Verify]. Set once, immutable (Invariant 12).

Kind:     Field
Field of: the order record
Projects: verified_at

#### Held By

The opaque reference to the actor who placed the hold. Set at [Hold]; non-null required (Invariant 10). Overwritten by a subsequent hold cycle (Invariant 12).

Kind:     Field
Field of: the order record
Projects: held_by

#### Hold Reason

The required, non-empty reason for the hold — written from the [Reason] parameter at [Hold] (Invariant 11). Overwritten by a subsequent hold cycle.

Kind:     Field
Field of: the order record
Projects: hold_reason

#### Held At

The timestamp of [Hold]. Overwritten by a subsequent hold cycle (Invariant 12).

Kind:     Field
Field of: the order record
Projects: held_at

#### Prior State

The state recorded at [Hold] time; [Reinstate] returns the order to exactly this state (Invariant 5). Overwritten by a subsequent hold cycle.

Kind:     Field
Field of: the order record
Projects: prior_state

#### Reinstated By

The opaque reference to the actor who reinstated the order. Set at [Reinstate]; non-null required (Invariant 10). Overwritten by a subsequent reinstate (Invariant 12).

Kind:     Field
Field of: the order record
Projects: reinstated_by

#### Reinstated At

The timestamp of [Reinstate]. Overwritten by a subsequent reinstate (Invariant 12).

Kind:     Field
Field of: the order record
Projects: reinstated_at

#### Dispenser Ref

The opaque reference to the actor who released the medication. Set at [Dispense], write-once (Invariant 12); non-null required.

Kind:     Field
Field of: the order record
Projects: dispenser_ref

#### Quantity

The dispensed quantity, a strictly positive number. Set at [Dispense], immutable.

Kind:     Field
Field of: the order record
Projects: quantity

#### Lot Number

The optional lot number recorded at [Dispense] (non-empty if supplied). Immutable.

Kind:     Field
Field of: the order record
Projects: lot_number

#### Dispensed At

The timestamp of [Dispense] — supplied or wall-clock-defaulted. Set once, immutable.

Kind:     Field
Field of: the order record
Projects: dispensed_at

#### Administerer Ref

The opaque reference to the actor who administered the medication. Set at [Administer], write-once; non-null required.

Kind:     Field
Field of: the order record
Projects: administerer_ref

#### Administered At

The timestamp of [Administer] — supplied or wall-clock-defaulted; back-dating permitted. Set once, immutable.

Kind:     Field
Field of: the order record
Projects: administered_at

#### Completed By

The opaque reference to the actor who closed the order. Set at [Complete], write-once; non-null required.

Kind:     Field
Field of: the order record
Projects: completed_by

#### Completed At

The timestamp of [Complete]. Set once, immutable.

Kind:     Field
Field of: the order record
Projects: completed_at

#### Cancelled By

The opaque reference to the actor who cancelled the order. Set at [Cancel], write-once; non-null required (Invariant 10).

Kind:     Field
Field of: the order record
Projects: cancelled_by

#### Cancellation Reason

The required, non-empty reason for cancellation — written from the [Reason] parameter at [Cancel] (Invariant 11). Carries the entry-error-vs-clinical-decision distinction.

Kind:     Field
Field of: the order record
Projects: cancellation_reason

#### Cancelled At

The timestamp of [Cancel]. Set once, immutable.

Kind:     Field
Field of: the order record
Projects: cancelled_at

#### Discontinued By

The opaque reference to the actor who discontinued the order. Set at [Discontinue], write-once; non-null required (Invariant 10).

Kind:     Field
Field of: the order record
Projects: discontinued_by

#### Discontinuation Reason

The required, non-empty reason for discontinuation — written from the [Reason] parameter at [Discontinue] (Invariant 11).

Kind:     Field
Field of: the order record
Projects: discontinuation_reason

#### Discontinued At

The timestamp of [Discontinue]. Set once, immutable.

Kind:     Field
Field of: the order record
Projects: discontinued_at

#### Store Name

The identifier of the store instance an order belongs to. Multiple instances coexist; [Order Id]s are unique within an instance, while [Patient Ref] is portable across instances. No action accepts it as a parameter — instance selection is handled at the deployment-routing layer.

Kind:     Field
Field of: the store instance
Projects: store_name

#### Reason

The required, non-empty reason string [Amend], [Hold], [Cancel], and [Discontinue] consume — written into [Amendment Reason], [Hold Reason], [Cancellation Reason], or [Discontinuation Reason] respectively. Not stored under this name; empty or whitespace-only is rejected [Invalid Request].

Kind:         Parameter
Parameter of: Amend
Projects:     reason

#### Query

The selection [Read] consumes — a filter over [Order Id], [Patient Ref], [Medication Ref], [Prescriber Ref], [State], and/or a time range on [Ordered At]. Supplied per call, not stored; a malformed one is rejected [Invalid Query].

Kind:         Parameter
Parameter of: Read
Projects:     query

#### Ordered

The initial state of a placed order awaiting pharmacist [Verify]. May be verified, amended, held, or cancelled.

Kind:      Member
Member of: the order state
Role:      Outcome

#### Verified

The state of an order a pharmacist has cleared for dispensing; carries [Verifier Ref] and [Verified At]. May be dispensed, amended, held, or cancelled.

Kind:      Member
Member of: the order state
Role:      Outcome

#### Amended

The inactive state of an order superseded by a successor; carries [Successor Id]. No transitions other than [Read] (Invariant 8).

Kind:      Member
Member of: the order state
Role:      Outcome

#### On Hold

The temporarily-suspended state of an order; carries [Prior State], [Held By], [Hold Reason], and [Held At]. Admits only [Reinstate] (Invariant 9).

Kind:      Member
Member of: the order state
Role:      Outcome

#### Dispensed

The state of an order whose medication the pharmacy has released; carries [Dispenser Ref], [Quantity], [Lot Number], and [Dispensed At]. May be administered, held, or discontinued.

Kind:      Member
Member of: the order state
Role:      Outcome

#### Administered

The state of an order at least one dose of which has been given; carries [Administerer Ref] and [Administered At]. May be completed, held, or discontinued.

Kind:      Member
Member of: the order state
Role:      Outcome

#### Completed

The terminal state of a fully-administered order; carries [Completed By] and [Completed At]. Absorbing (Invariant 7).

Kind:      Member
Member of: the order state
Role:      Outcome

#### Cancelled

The terminal state of an order terminated before dispensing; carries [Cancelled By], [Cancellation Reason], and [Cancelled At]. Absorbing (Invariant 7).

Kind:      Member
Member of: the order state
Role:      Outcome

#### Discontinued

The terminal state of an order terminated after dispensing began; carries [Discontinued By], [Discontinuation Reason], and [Discontinued At]. Absorbing (Invariant 7).

Kind:      Member
Member of: the order state
Role:      Outcome

#### Invalid Order

The refusal [Order] returns when order fields fail — an empty/whitespace [Patient Ref], [Prescriber Ref], [Medication Ref], [Dose Unit], [Route], [Frequency], or [Clinical Evidence Ref]; a non-positive [Dose] or [Duration]; or a future [Ordered At].

Kind:      Member
Member of: the Order rejection
Role:      Outcome
Projects:  invalid-order

#### Invalid Request

The refusal a state-changing action returns when request metadata fails — an empty/whitespace actor reference or [Reason] (Invariants 10 and 11), a non-positive [Quantity], or an amendment that changes nothing.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Storage Failure

The refusal any writing action returns when a durable write fails after preconditions pass. All-or-none: no partial record or partial state change is observable (Invariant 14).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The refusal any id-taking action returns when the named [Order Id] references no order in this store instance.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Already Amended

The refusal returned when the target is already [Amended] — inactive (Invariant 8).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-amended

#### Already Cancelled

The refusal returned when the target is already in terminal [Cancelled].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-cancelled

#### Already Discontinued

The refusal returned when the target is already in terminal [Discontinued].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-discontinued

#### Already Completed

The refusal returned when the target is already in terminal [Completed].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-completed

#### Already Dispensed

The refusal [Amend] or [Cancel] returns when the order has already reached [Dispensed], [Administered], or [Completed] — use [Discontinue].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-dispensed

#### Already Administered

The refusal [Administer] returns when the order is already [Administered].

Kind:      Member
Member of: the Administer rejection
Role:      Outcome
Projects:  already-administered

#### Already On Hold

The refusal [Hold] returns when the order is already [On Hold].

Kind:      Member
Member of: the Hold rejection
Role:      Outcome
Projects:  already-on-hold

#### Not In Ordered State

The refusal [Verify] returns when the order is [Verified], [Dispensed], or [Administered] — already verified or beyond the verification stage.

Kind:      Member
Member of: the Verify rejection
Role:      Outcome
Projects:  not-in-ordered-state

#### Not Verified

The refusal [Dispense] returns when the order is still [Ordered] — pharmacist review is required first.

Kind:      Member
Member of: the Dispense rejection
Role:      Outcome
Projects:  not-verified

#### Not Dispensed

The refusal [Administer], [Complete], or [Discontinue] returns when the order has not reached [Dispensed].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-dispensed

#### Not Administered

The refusal [Complete] returns when the order has not reached [Administered].

Kind:      Member
Member of: the Complete rejection
Role:      Outcome
Projects:  not-administered

#### Not On Hold

The refusal [Reinstate] returns for any non-[On Hold] order.

Kind:      Member
Member of: the Reinstate rejection
Role:      Outcome
Projects:  not-on-hold

#### Invalid Query

The refusal [Read] returns when query parameters are malformed — a syntactically invalid [Order Id], an unrecognized state value, or a time range with end before start.

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Order]: #order
[Amend]: #amend
[Verify]: #verify
[Hold]: #hold
[Reinstate]: #reinstate
[Dispense]: #dispense
[Administer]: #administer
[Complete]: #complete
[Cancel]: #cancel
[Discontinue]: #discontinue
[Read]: #read
[Order Id]: #order-id
[Patient Ref]: #patient-ref
[Prescriber Ref]: #prescriber-ref
[Medication Ref]: #medication-ref
[Dose]: #dose
[Dose Unit]: #dose-unit
[Route]: #route
[Frequency]: #frequency
[Duration]: #duration
[Clinical Evidence Ref]: #clinical-evidence-ref
[Ordered At]: #ordered-at
[State]: #state
[Successor Id]: #successor-id
[Predecessor Id]: #predecessor-id
[Amended By]: #amended-by
[Amendment Reason]: #amendment-reason
[Verifier Ref]: #verifier-ref
[Verified At]: #verified-at
[Held By]: #held-by
[Hold Reason]: #hold-reason
[Held At]: #held-at
[Prior State]: #prior-state
[Reinstated By]: #reinstated-by
[Reinstated At]: #reinstated-at
[Dispenser Ref]: #dispenser-ref
[Quantity]: #quantity
[Lot Number]: #lot-number
[Dispensed At]: #dispensed-at
[Administerer Ref]: #administerer-ref
[Administered At]: #administered-at
[Completed By]: #completed-by
[Completed At]: #completed-at
[Cancelled By]: #cancelled-by
[Cancellation Reason]: #cancellation-reason
[Cancelled At]: #cancelled-at
[Discontinued By]: #discontinued-by
[Discontinuation Reason]: #discontinuation-reason
[Discontinued At]: #discontinued-at
[Store Name]: #store-name
[Reason]: #reason
[Query]: #query
[Ordered]: #ordered
[Verified]: #verified
[Amended]: #amended
[On Hold]: #on-hold
[Dispensed]: #dispensed
[Administered]: #administered
[Completed]: #completed
[Cancelled]: #cancelled
[Discontinued]: #discontinued
[Invalid Order]: #invalid-order
[Invalid Request]: #invalid-request
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Already Amended]: #already-amended
[Already Cancelled]: #already-cancelled
[Already Discontinued]: #already-discontinued
[Already Completed]: #already-completed
[Already Dispensed]: #already-dispensed
[Already Administered]: #already-administered
[Already On Hold]: #already-on-hold
[Not In Ordered State]: #not-in-ordered-state
[Not Verified]: #not-verified
[Not Dispensed]: #not-dispensed
[Not Administered]: #not-administered
[Not On Hold]: #not-on-hold
[Invalid Query]: #invalid-query

---

## Composition notes

Medication Order composes naturally with the existing library:

- **[Actor Identity](./actor-identity.md)** — [Prescriber Ref], [Verifier Ref], [Dispenser Ref], [Administerer Ref], and the various `_by` fields are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors who authorized their respective actions. DEA EPCS two-factor attestation at prescribe time is the Actor Identity composition for controlled-substance orders; it converts this atom's attribution fields from trusted assertions to non-repudiable proofs.
- **[Clinical Observation](./clinical-observation.md)** — a medication order is often placed in response to a clinical observation (elevated blood pressure → antihypertensive order; abnormal lab result → treatment initiation). The optional [Clinical Evidence Ref] field carries an opaque reference to the observation(s) that informed the prescribing decision. Clinical Observation provides the upstream substrate; Medication Order carries the downstream response. The relationship is advisory — [Clinical Evidence Ref] is opaque metadata on the order, not a structural dependency. Clinical Observation's Composition notes identified Medication Order as a forthcoming pattern that "consumes Clinical Observation as evidence"; this is the concrete form that relationship takes.
- **[Tamper Evidence](./tamper-evidence.md)** — seals the order store against post-hoc modification, complementing the spec-level immutability guarantee with a cryptographic one. DEA EPCS non-alteration requirements are satisfied at this layer.
- **[Retention Window](./retention-window.md)** — governs the minimum retention period for medication order records under HIPAA (generally six years for adult records, longer for pediatric records, with state variation).
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical composition for regulated record-keeping; Medication Order feeds it. Every state transition is an auditable event.
- **[Event Log](./event-log.md)** — provides the substrate for capturing individual dose events in multi-dose regimens and a complete hold/reinstate history across multiple hold cycles.
- **[Permissions](./permissions.md)** — governs who may place, verify, dispense, administer, and terminate orders; composes access control onto this atom's attribution model.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for at-most-once semantics on order submission, preventing duplicate orders from network retries.
- **Forthcoming:** Care Plan — a composition modeling a structured set of medication orders, clinical observations, and clinical goals; Medication Order is a constituent.

---

## Standards references

- **HIPAA §164.312(b)** — audit controls: covered entities must implement mechanisms to record and examine activity in systems containing ePHI (electronic Protected Health Information — individually identifiable health data in digital form). The order record, with its immutable attribution fields at every lifecycle stage, is the primary audit surface.
- **HL7 FHIR MedicationRequest resource** — the canonical interoperability representation of a medication order. This atom's core fields map to FHIR's `subject` ([Patient Ref]), `requester` ([Prescriber Ref]), `medication[x]` ([Medication Ref]), `dosageInstruction` ([Dose], [Dose Unit], [Route], [Frequency], [Duration]), `authoredOn` ([Ordered At]), and `status` (`active` → [Ordered]/[Verified]; `on-hold` → [On Hold]; `cancelled` → [Cancelled]; `stopped` → [Discontinued]; `completed` → [Completed]). FHIR separates MedicationRequest, MedicationDispense, and MedicationAdministration into three resources; this atom models the full lifecycle in one record — a deliberate choice that prioritizes attribution traceability over FHIR's resource decomposition. FHIR's MedicationRequest carries many additional fields (encounter, reasonCode, substitution, priorPrescription) not present here; those are composing-layer concepts.
- **DEA 21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 1306** — prescription requirements for Schedule II–V controlled substances: prescriber DEA registration, patient identification, medication and quantity, directions for use, Schedule II refill prohibition. [Prescriber Ref] and [Medication Ref] are the record substrate for Part 1306 compliance; DEA registration verification is a composing pattern.
- **DEA 21 CFR Part 1311 (EPCS)** — Electronic Prescriptions for Controlled Substances: requires two-factor cryptographic authentication at order time. Actor Identity composing with this atom is the implementation surface.
- **21 CFR Part 11** — electronic records in FDA-regulated contexts; each state transition is a regulated electronic record event requiring attribution and timestamp.
- **Joint Commission Medication Management standards (MM.04.01.01)** — require that medication orders be complete, legible, and attributable. The immutable core fields and mandatory attribution fields satisfy these requirements structurally.
- **ISMP (Institute for Safe Medication Practices)** — prescribing safeguards including required order elements (drug name, dose, route, frequency) align with this atom's mandatory fields; ISMP's error-reporting surface is the motivation for the amendment audit trail.
- **RxNorm (a standardized drug-naming system) / NDC (National Drug Code) / SNOMED CT (Systematized Nomenclature of Medicine — Clinical Terms)** — controlled vocabularies for [Medication Ref]; recommended deployment conventions for the opaque medication reference, not atom-level obligations.

---

## Status

`grounded on Final Critique 4 — 2026-05-20` (formal layer complete 2026-06-04 — TLA+ model `medication-order.tla` + buggy twin verified (Invariants 5, 9); Alloy model `medication-order.als` + buggy twin verified (Invariants 3, 4, 2); all GAPs from coverage cross-check 2026-06-04 closed; see Lineage §Formal model.) — foundation round, two human refinement rounds, and AI adversarial round (Torvalds X2) complete. Last full rescan: 2026-05-20. Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's AI adversarial round (Torvalds X2) is retro-labeled Final Critique 4; the original round-naming in the Lineage notes below is preserved as historical record.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Regulated atom. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft. Conventions are not re-derived from Clinical Observation or Actor Identity.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Three findings, all closed in-pattern.

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

**Refinement round 1 — re-run of all three passes.** Five findings, all closed in-pattern. Round conducted with Grok's structured review of the two foundation-round judgment calls (dispense/administer in-pattern, hold-field overwrite) plus a fresh re-running of all three passes.

- *Outputs description for hold fields incorrect (Pass 1).* The Outputs section said hold fields are present "on orders that have been held and reinstated" — but hold fields are present on On Hold orders too, regardless of whether reinstate has been called. An On Hold order's `held_by`, `hold_reason`, `held_at`, and `prior_state` are readable from `read` before any reinstate occurs. The phrasing implied the fields were only visible post-reinstate, which would make an On Hold order's hold attribution invisible to a reader of the record. Resolved: Outputs updated to "on orders that have been held, including orders currently in On Hold state; reinstate fields on orders that have been reinstated at least once."

- *`amend` nil-duration vs. omitted-duration ambiguity (Pass 3).* The `amend` action's no-change check said "at least one supplied parameter must differ" without distinguishing between a parameter being absent (keep original value) and a parameter being explicitly nil (clear the value). For `duration`, these have different meanings: absent means "leave the original duration unchanged"; nil means "remove the duration, making the order open-ended." An `amend` supplying only `duration: nil` against an already-open-ended order is not a change and should be `invalid-request`, but the spec was silent. Resolved: Decision point for `amend` updated with an explicit statement of the absent-vs-nil distinction, naming the "nil on already-open-ended" case as a no-change rejection.

- *Future-timestamp restriction applies only to `ordered_at` — not stated (Pass 3).* The Clock semantics edge case named the `ordered_at` future-timestamp restriction but was silent on whether `dispensed_at`, `administered_at`, and other `_at` fields have similar restrictions. A reader could infer the restriction applies everywhere. Clinical documentation workflows routinely back-date events (a nurse charting a dose administered six hours ago); the other `_at` fields must permit back-dating. Resolved: Clock semantics edge case updated to explicitly state that the future-timestamp restriction applies only to `ordered_at`, that all other `_at` fields accept back-dated values with no look-back limit, and that back-dating is a normal clinical documentation workflow.

- *Dispensing/administration scope decision not defended inline (Pass 3 / Grok review).* The decision to model dispensing and administration as transitions on the order record rather than separate entities was documented in the foundation round's Pass 2 Lineage notes but not in the atom's main text. A reader of the Intent section alone would not encounter the rationale; it was a hidden decision visible only in the Lineage. Resolved: Intent section extended with a defended-in-line paragraph naming the FHIR decomposition as the alternative, stating the reason for the unified-record design (single auditable chain of custody, no freestanding state machines for dispense/administer), and naming the extraction trigger (a second domain with generic material-issuance semantics). Grok's structured review confirmed the in-pattern judgment, specifically noting that FHIR's three-resource decomposition serves broad interoperability while this atom prioritizes a tight, auditable primitive — a valid and often preferable trade-off for implementation-focused modeling.

- *`hold` action not cross-referencing Invariant 12 (Pass 3 / Grok review).* The `hold` action description referenced the *Multiple hold cycles* edge case but did not cite Invariant 12 by name, making it easy to miss the write-once-per-transition caveat and the hold-field overwrite exception. A reader of the `hold` action alone could not discover the overwrite behavior without finding the edge case. Resolved: `hold` action description updated to cite Invariant 12 explicitly alongside the edge case reference. Grok's review validated the hold-field overwrite design: the behavior is explicit, honest (via Invariant 12), and aligns with the "expedient but auditable via composition" principle.

Pass 2 was clean. The dispense/administer extraction was re-examined with Grok's independent review confirming the in-pattern judgment. The amendment chain extraction was re-examined and remains settled for the same reasons as in the foundation round. All five fixes are in-pattern resolutions; none required extraction or new composing patterns.

**Refinement round 2 — re-run of all three passes.** Five findings, all closed in-pattern.

- *Reinstate fields overwrite ambiguity (Pass 1 / Pass 3).* Invariant 12 named only hold fields in its overwrite carve-out, while Feedback for `reinstate` said "`reinstated_by` and `reinstated_at` are set and immutable." By symmetry with hold fields — where the most recent hold's metadata is operationally relevant and a second hold overwrites the prior values — reinstate fields should behave identically on a second reinstate cycle. The spec was silent, leaving conformance ambiguous: an implementation could plausibly retain the first reinstate's values or overwrite them. Resolved: Invariant 12 extended from "one exception" to "two exceptions" naming reinstate fields alongside hold fields. Feedback for `reinstate` updated to remove "and immutable" and explain the overwrite behavior with a cross-reference to Invariant 12. Outputs updated with "(most recent reinstate only; full history requires Event Log)." The behavior is consistent with the "expedient but auditable via composition" principle established for hold fields in Refinement round 1.

- *Generation acceptance check 2 — successor state claim time-sensitive (Pass 1 / Pass 3).* Check 2 said to confirm the successor "is in Ordered or a downstream state (never Verified or later unless re-verified on its own merits)" — a claim that depends on when the check is run. By the time an auditor runs this check, the successor may have already been verified and dispensed; "in Ordered state" would then be a false failure. The key invariant being checked — that the original's Verified status does not transfer to the successor — is not captured by the current state at all; it belongs to whether `verifier_ref` is present on the successor and, if so, whether it was set by a `verify` call on the successor's own `order_id`. Resolved: replaced the state claim with a field-based check: "confirm the original's `verifier_ref` and `verified_at` are NOT present on the successor — the original's verification does not transfer." This check is unambiguous regardless of when it runs.

- *`administer` Decision point incorrectly lists Amended under `not-dispensed` (Pass 3).* The Decision point said "`not-dispensed` for Ordered, Verified, and Amended states" — but per the Rejection priority, Amended orders return `already-amended` before reaching the `not-dispensed` check. The `complete` Decision point already correctly omits Amended from its `not-administered` list. The `administer` Decision point was inconsistent with both the priority order and its sibling `complete`. Resolved: updated to "`not-dispensed` for Ordered and Verified states (Amended orders return `already-amended` at higher priority and do not reach this check)."

- *Generation acceptance check 5 has blind spots for On Hold and terminal orders (Pass 3).* Check 5 used "Verified state or beyond" / "Dispensed state or beyond" to determine which orders must carry attribution fields. This formulation misses On Hold orders (whose current state is On Hold, not Verified or Dispensed, but which may have been verified before being held) and terminal orders (whose current state is Cancelled or Discontinued but which may have passed through Verified or Dispensed). An On Hold order held from Verified state carries `verifier_ref` and any attribution check relying on "current state = Verified" would silently pass over it. Resolved: reformulated to field-based checks ("for every order currently carrying `verifier_ref`...") supplemented by a state-based check for the provably necessary case ("for every order in Dispensed, Administered, or Completed state, confirm `verifier_ref` is present — these states are only reachable via Verified"). This formulation is correct regardless of current state.

- *`dispense` signature missing `already-completed` (Pass 3).* Every other state-changing action that can be called against terminal orders includes `already-completed` in its rejection vocabulary: `hold`, `cancel`, `administer`, `complete`, `discontinue` all carry it. `dispense` did not. Without `already-completed`, a Completed order hitting `dispense` falls through the priority order past the terminal-state tier (since `already-completed` is not declared) and returns `already-dispensed` — technically accurate (a Completed order has been dispensed) but inconsistent with the priority order's explicit terminal-state tier and with every other action's behavior. The Decision point compounded this by listing "already-dispensed for Dispensed, Administered, or Completed state," which was wrong — Completed orders should surface `already-completed` first. Resolved: added `already-completed` to the `dispense` signature; updated the `dispense` Decision point to include `already-completed` in the terminal-state check tier and narrow `already-dispensed` to Dispensed and Administered states only.

Pass 2 was clean. All five fixes are in-pattern resolutions. No extractions required.

**AI adversarial round (Torvalds X2) — re-run of all three passes with fresh-reader discipline.** Six findings; all closed in-pattern. Pass 2 clean.

- *`prescriber_ref` not documented as inherited by successor in Identity model (Pass 1).* The Identity model explicitly stated "`patient_ref` is inherited unchanged by any successor order created by `amend`" and "`medication_ref` is inherited unchanged by any successor order created by `amend`" — but `prescriber_ref` only said "Set on `order`, immutable. Amendments carry their own `amended_by`; the original `prescriber_ref` is never changed." That last clause describes the original, not the successor. A reader of the Identity model section who did not also read Invariant 2 would not know whether the successor inherits `prescriber_ref` or leaves it unset. Invariant 2 covered it, but the Identity model was inconsistent with its own pattern for the other two inherited reference fields. Resolved: `prescriber_ref` description updated to explicitly state "inherited unchanged by any successor order created by `amend`," parallel to `patient_ref` and `medication_ref`.

- *Outputs field listing incomplete for On Hold and Discontinued orders with accumulated fields (Pass 1).* The Outputs section listed "verification fields on Verified, Dispensed, Administered, and Completed orders" — omitting On Hold orders that were verified before being held, and Discontinued orders. Similarly "dispense fields on Dispensed, Administered, and Completed orders" omitted On Hold (from Dispensed or Administered) and Discontinued orders. "Administration fields on Administered and Completed orders" omitted On Hold (from Administered) and Discontinued (from Administered). The field listing was inaccurate for any order that transitioned to On Hold or Discontinued after accumulating fields. Resolved: Outputs field listing restructured around the cumulative principle — field groups are cumulative; once written by a transition they persist regardless of subsequent state changes — with the first-appearance state noted for each group and explicit examples of On Hold and Discontinued orders carrying accumulated field groups.

- *`verify` signature missing `already-completed`, inconsistent with Rejection priority (Pass 3).* The Rejection priority edge case states `already-completed` is checked in the terminal-state tier before state-specific rejections and this order is "the same across conforming implementations." But `verify` did not have `already-completed` in its signature. A Completed order hitting `verify` would fall through the terminal-state tier (no `already-completed` to match) and surface `not-in-ordered-state` — technically accurate but inconsistent with the stated priority ordering, and inconsistent with `hold`, `cancel`, `administer`, `complete`, and `discontinue`, all of which carry `already-completed`. Resolved: `already-completed` added to the `verify` signature; `not-in-ordered-state` description updated to cover Verified, Dispensed, and Administered states only.

- *`clinical_evidence_ref` validation silent when supplied as empty string (Pass 3).* Every other reference field in the atom requires at least one non-whitespace character. `clinical_evidence_ref` was described as "optional" and "advisory" but the spec was silent on what happens if the caller supplies an empty or whitespace-only string. An implementation could accept it and store an empty field; another could silently drop it; a third could reject it — three divergent behaviors, all spec-compliant. Resolved: `order` action description updated to state "If supplied, it must contain at least one non-whitespace character; a supplied empty or whitespace-only value is `invalid-order`. When absent, the field is not present on the order record; there is no nil-vs-absent distinction for this field." `order` Decision point updated to include `clinical_evidence_ref` in the validation checklist.

- *"Multiple hold cycles" edge case not updated when Invariant 12 was extended (Pass 3).* Refinement round 2 extended Invariant 12 to cover reinstate fields as a second overwrite exception, but the "Multiple hold cycles" edge case prose was not correspondingly updated — it still only mentioned hold fields being overwritten. A reader of the edge case who did not also check Invariant 12 would not know that `reinstated_by` and `reinstated_at` follow the same pattern on subsequent reinstate cycles. Resolved: edge case updated to explicitly state that each `reinstate` call overwrites `reinstated_by` and `reinstated_at`, parallel to the hold-field overwrite statement, consistent with the updated Invariant 12.

- *Diversion investigation regulated adversarial scenario conflates Invariant 10 and Invariant 11 (Pass 3).* The scenario stated "`discontinued_by` and `discontinuation_reason` must be present (required by Invariant 11)." But Invariant 11 governs only reason fields — `hold_reason`, `cancellation_reason`, `discontinuation_reason`, `amendment_reason`. Actor reference fields, including `discontinued_by`, are governed by Invariant 10. Citing Invariant 11 for an actor field is an incorrect attribution: an auditor who checks the cited invariant would not find `discontinued_by` mentioned there, undermining confidence in the regulated adversarial scenario's correctness. Resolved: updated to "discontinued_by (Invariant 10) and `discontinuation_reason` (Invariant 11) must both be present and non-empty."

**Scheduled rescan: 2026-05-20.** One refining finding; closed in-pattern.

- *`read` action description and Decision point inconsistent on time-range filter support (Pass 1 / Pass 3).* The `read` action description listed supported filter axes as "`order_id`, `patient_ref`, `medication_ref`, `prescriber_ref`, state, or any combination" with no mention of time ranges. The Decision point, however, named "a time range with end before start is `invalid-query`" — implying time-range filters are a supported axis. An implementor reading only the action description would not add time-range support; one reading only the Decision point would. The cross-section disagreement was a reference-graph violation (Pass 1) and an implementable ambiguity (Pass 3). Resolution: `read` action description updated to add time ranges on `ordered_at` as a supported filter axis, using the same `{after, before}` sub-key format Approval Step established. `read` Decision point updated to specify that an `ordered_at` time range with `after` > `before` is `invalid-query`. This also aligns with the DEA audit use case (querying orders by date range), which Approval Step's time-range-filtered `read` supports for its scope query but which Medication Order's `read` previously could not.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 5 (hold carries prior_state; reinstate returns to exactly that state), Invariants 3/4 (pre-dispensing-only, linear amendment chains), Invariant 9 (On Hold accepts only reinstate) form a multi-state reachability/ordering surface under hold/reinstate interleavings. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`medication-order.tla`](./medication-order.tla) + config [`medication-order.cfg`](./medication-order.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* the lifecycle (Ordered, Verified, Dispensed, Administered, Completed, Cancelled, Discontinued, On Hold) with the load-bearing **Invariant 5** (hold carries prior_state; reinstate returns to *exactly* it). A ghost `heldFrom` records the state at the most recent hold and `justReinstated` flags the post-reinstate step, so the round-trip `justReinstated ⇒ state = heldFrom` is a falsifiable predicate, not a tautology; `Inv5_PriorValid` additionally checks On Hold always carries a holdable prior. Exhaustive: 31 states, holds. **Invariant 9** (On Hold accepts only reinstate) is enforced by construction (every forward action guards on a non-OnHold source). *Buggy twin* [`medication-order-buggy.tla`](./medication-order-buggy.tla) reinstates to a fixed default ("Ordered") instead of reading prior_state; rejected at 11 states (hold from Dispensed → reinstate lands in Ordered ≠ heldFrom). *Out of model scope:* amend / successor chains (Invariants 3,4 — linear-amendment is the Alloy-class structural property), field validation, storage-failure, id discipline. *Conflict-protocol outcome:* none — the model **corroborates** the English (reinstate-to-prior_state is structural); canonical English unchanged.

**Formal model — 2026-06-04: Alloy model authored and verified; Invariants 3 & 4 GAPs closed.** Derived model [`medication-order.als`](./medication-order.als) + buggy twin [`medication-order-buggy.als`](./medication-order-buggy.als), checked by Alloy headless via `tools/harness/check.mjs`. *What it checks:* **Invariant 4** (amendment chains are linear — at most one successor per order, at most one predecessor, no cycles, no branching/merging) and **Invariant 3** (amendment is pre-dispensing only — orders in Dispensed, Administered, Completed, Cancelled, Discontinued, or On Hold state must not acquire a successor). Also encodes **Invariant 2** (successor inherits patient_ref, prescriber_ref, medication_ref by construction) and the inverse consistency of the successor/predecessor link. *Model shape:* static structural model (snapshots). Nine states as named singletons; four opaque reference types (PatientRef, PrescriberRef, MedicationRef, ClinRef). Amendment chain modeled as a `lone` successor relation. Scope 8 for checks and runs; 13 `check` commands (all UNSAT), 7 `run` commands (all SAT). *Checks mapping to invariants:* Inv 4 — `A_Inv4_AtMostOneSuccessor`, `A_Inv4_AtMostOnePredecessor`, `A_Inv4_NoBranching`, `A_Inv4_NoCycles`, `A_Inv4_AmendedHasSuccessor`, `A_Inv4_SuccessorHasPredecessor`, `A_SuccessorPredecessorAreInverse`; Inv 3 — `A_Inv3_NoSuccessorAfterDispensing`, `A_Inv3_SuccessorOnlyFromPreDispensing`; Inv 2 — `A_Inv2_PatientRefChainConsistency`, `A_Inv2_PrescriberRefChainConsistency`, `A_Inv2_MedicationRefChainConsistency`; Inv 12 — `A_Inv12_AmendedBySetOnSuccessorOnly`. *Buggy twin* [`medication-order-buggy.als`](./medication-order-buggy.als): two mutations — (1) successor multiplicity changed `lone` → `set` and LinearChain fact removed, permitting branching (breaks Inv 4); (2) PreDispensingOnlyAmendment fact removed and AmendedIffHasSuccessor relaxed to `Amended implies some successor`, permitting Dispensed/Administered/etc. orders to acquire successors (breaks Inv 3). Twin correctly rejected: counterexamples on `A_Inv4_AtMostOneSuccessor`, `A_Inv3_NoSuccessorAfterDispensing`, `A_Inv3_SuccessorOnlyFromPreDispensing`, `A_Inv4_AmendedHasSuccessor`. *Saturation note:* key Inv 3 and Inv 4 structural claims (`A_Inv4_OneSucc`, `A_Inv4_NoCyc`, `A_Inv3_NoPost`, `A_Inv3_SrcAmend`) confirmed UNSAT at scope 9 (Order-only reduced model, reference sigs suppressed for tractability); saturated — no new structural topology emerges above scope 8. *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, state machine, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (78 terms): 11 Operations ([Order], [Amend], [Verify], [Hold], [Reinstate], [Dispense], [Administer], [Complete], [Cancel], [Discontinue], [Read]); 39 Fields — the full prescription-lifecycle record (core clinical fields, amendment-chain, verification, hold/reinstate, dispense, administration, completion/cancellation/discontinuation field groups, plus [Store Name]), all "Field of: the order record" (or the store instance), with no separate Type card mirroring the plain-noun "order record" referent; 2 Parameters ([Reason], [Query]); 26 Members (the 9 lifecycle states [Ordered]/[Verified]/[Amended]/[On Hold]/[Dispensed]/[Administered]/[Completed]/[Cancelled]/[Discontinued] + 17 rejections). Survivors left backticked: the one labeled projected-contract signature per Operation; the success tokens (`verified`, `held`, `reinstated`, `dispensed`, `administered`, `completed`, `cancelled`, `discontinued`); the `on-hold` rejection (kept a literal to avoid an anchor collision with the [On Hold] state); the `_by`/`_at` field-suffix wildcards; the non-existent `entered-in-error`; concrete example calls, ids, and field:value records; FHIR/external tokens; model filenames; and dated Status/Lineage registers. (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim is carried by Summary/Intent/State/Invariants; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the densest Summary run-on split into one-idea sentences, lossless. (e) **prose cut #5** — the 9-state "Valid transitions" list rendered as a transition table (action / from / to), with terminal-absorption, [On Hold]-admits-only-[Reinstate], and successor-starts-[Ordered] semantics kept in the prose beside it. Wall-clock timestamps are stamped from the receiving node's clock (this atom is not in the seam-injected-clock family — no `[Now]` term). Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-05-20`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (78 terms); 14 invariants preserved; `.tla`/`.cfg`/`.als` untouched — harness re-run green: `medication-order.tla` PASS + `medication-order-buggy.tla --buggy` rejected (Invariants 5, 9), `medication-order.als` PASS + `medication-order-buggy.als --buggy` rejected (Invariants 3, 4, 2).

</details>
