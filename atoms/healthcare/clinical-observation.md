---
title: Clinical Observation
parent: Healthcare
grand_parent: Atoms
nav_order: 1
---

# Clinical Observation

> A healthcare primitive: an immutable record of a single clinical measurement — vital sign, lab result, assessment score — attributed to a clinician and scoped to a patient. Corrections create successor records; the original is never edited.

---

## Intent

A clinician records a measurement about a patient — blood pressure, temperature, blood glucose, pain score, oxygen saturation. The record must be trustworthy: what was recorded, who recorded it, and when must be permanently fixed. Errors are corrected by recording a successor observation that supersedes the original; the original does not disappear, it is marked as amended. Erroneous observations recorded for the wrong patient or under the wrong type are retracted, not edited.

The pattern addresses a clinical requirement that is universal and recurring: the medical record must show both what was originally recorded *and* what the correction was, so that the history of clinical reasoning is recoverable. A mutable record system fails this requirement by definition — once a nurse edits a blood pressure value, the original is gone and the reason for the edit is invisible. The append-and-supersede model preserves both.

This is a freestanding concept in the EOS sense. It carries its own state (the observation record set), its own actions (`record`, `amend`, `retract`, `read`), and its own invariants (immutability, amendment traceability, retraction finality). Composing patterns add retention policy, tamper-evidence, access control, and longitudinal analytics. The Clinical Observation atom imposes no semantics on what the value means clinically; it imposes only the structural guarantee that the record is faithful to what was recorded and by whom.

---

## Structure

### Identity model

Each observation has an opaque, immutable, system-generated `observation_id` — assigned on `record`, never reused, never reassigned. The id is the observation's identity; the clinical content is a property of the observation, not its identity.

`patient_ref` is an opaque reference to the patient. It is set on `record` and is immutable. It is not the observation's identity — two observations for the same patient have different `observation_id`s. `patient_ref` is inherited unchanged by any successor observation created by `amend`.

`recorded_by` is an opaque reference to the clinician who performed the measurement. It is set on `record` and is immutable. Amendments carry their own `amended_by`; the original `recorded_by` is never changed.

### Inputs

- `record` calls from clinicians or clinical systems, each carrying a patient reference, clinician reference, observation type, value, unit, and an optional explicit timestamp.
- `amend` calls that correct a prior observation, carrying the id being corrected, the correcting clinician, the corrected value and unit, and a required reason.
- `retract` calls that withdraw an erroneous observation, carrying the id being retracted, the retracting clinician, and a required reason.
- `read` queries from clinical systems, analytics pipelines, and audit processes.

### Actions

- `record(patient_ref, recorded_by, observation_type, value, unit, recorded_at?) → observation_id | rejected(invalid-observation | storage-failure)` — create a new Recorded observation. `recorded_at` defaults to the system clock if not supplied; when supplied, it must not be in the future.
- `amend(observation_id, amended_by, value, unit, reason) → new_observation_id | rejected(not-known | already-amended | already-retracted | invalid-observation | storage-failure)` — create a successor observation that corrects the named one. The original transitions to Amended; the successor is Recorded with a `predecessor_id` referencing the original. `observation_type` and `patient_ref` are inherited from the original and may not be changed — a wrong observation type requires retraction and a fresh `record`, not amendment.
- `retract(observation_id, retracted_by, reason) → retracted | rejected(not-known | already-retracted | storage-failure)` — mark the observation as Retracted. The record remains; no observation data is destroyed. An Amended observation may be retracted; doing so retracts only that link in the chain — prior and successor records are not affected.
- `read(query) → ordered_sequence_of_observations | rejected(invalid-query)` — return observations matching the query, ordered by `recorded_at` ascending. A query may filter by `patient_ref`, `observation_type`, time range, state (Recorded / Amended / Retracted), or any combination.

### Outputs

- For `record`: a fresh `observation_id`, or a rejection naming the failed precondition.
- For `amend`: a fresh `observation_id` for the successor observation, or a rejection.
- For `retract`: the token `retracted`, or a rejection.
- For `read`: a (possibly empty) ordered sequence of observations. Each carries its `observation_id`, `patient_ref`, `recorded_by`, `observation_type`, `value`, `unit`, `recorded_at`, `state`, and — if applicable — `predecessor_id` (for a successor) or `successor_id` (for an amended original) or `retraction_reason` and `retracted_by` (for a retracted observation).

### State

Each observation is in exactly one state:

- **Recorded** — the observation stands. It may be amended or retracted.
- **Amended** — the observation has been superseded by a correction. It is retained and visible but carries a `successor_id` pointing to the correcting observation. An Amended observation may still be retracted.
- **Retracted** — the observation was withdrawn as erroneous. It is retained and visible but flagged as invalid. No further transitions from Retracted.

Valid transitions:

- Recorded → Amended (via `amend`)
- Recorded → Retracted (via `retract`)
- Amended → Retracted (via `retract`)

Purged is not a state in this atom. Clinical records are not deleted; their retention and eventual destruction under legal hold or regulatory obligation belong to composing patterns ([Retention Window](../compliance/retention-window.md), [Legal Hold](../../ROADMAP.md)).

### Flow

1. **Clinician takes a measurement.** Calls `record(patient_ref, recorded_by, observation_type, value, unit)`. The atom assigns `observation_id`, sets `state = Recorded`, records `recorded_at`. Returns `observation_id`.
2. **Clinician discovers an error in the value.** Calls `amend(observation_id, amended_by, corrected_value, corrected_unit, reason)`. The atom marks the original as Amended (sets `successor_id`), creates a new Recorded observation with `predecessor_id` referencing the original. Returns the new `observation_id`.
3. **Clinician discovers the observation was recorded for the wrong patient or wrong type.** Calls `retract(observation_id, retracted_by, reason)`. The atom marks the observation as Retracted. The clinician then calls `record` to create the correct observation.
4. **Clinical system queries a patient's observations.** Calls `read({patient_ref, observation_type, state: "Recorded"})`. Receives the current (non-superseded, non-retracted) observations in chronological order.

### Decision points

- **At `record`** — `patient_ref` and `recorded_by` must be non-empty opaque references; `observation_type` must be non-empty; `value` must satisfy the configured value constraint for the observation type (the atom does not define what a valid blood pressure value is — that is deployment policy; it requires only that the constraint be declared and applied); `unit` must be non-empty; `recorded_at`, if supplied, must not be in the future. Any violation rejects as `invalid-observation`. If the store write fails after all preconditions are satisfied, the atom returns `rejected(storage-failure)`; the `observation_id` is not returned.
- **At `amend`** — the named `observation_id` must exist (`not-known` if absent); must be in Recorded or Amended state (`already-amended` rejected only if the caller tries to amend an already-Amended observation — callers should amend the current end of the chain, not an intermediate node; see Edge cases); must not be Retracted (`already-retracted`); corrected `value` and `unit` must satisfy the same constraints as `record`. `observation_type` and `patient_ref` may not be changed — these are inherited from the original.
- **At `retract`** — the named `observation_id` must exist (`not-known`); must not already be Retracted (`already-retracted`). Recorded and Amended observations may both be retracted.
- **At `read`** — query parameters must be well-formed (time range valid, state filter valid). A well-formed query matching no observations returns an empty sequence, not a rejection.

### Behavior

- **Records are durable on success.** Once `record` returns an `observation_id`, the observation is in the store and will appear in subsequent reads.
- **Amendment is additive, not destructive.** `amend` creates a new record; the original remains. Both are visible to `read`; queries filtering for `state: "Recorded"` return only the current end of the chain.
- **Retraction is permanent.** A retracted observation cannot be un-retracted. It remains in the store, visible to queries that include `state: "Retracted"`, but excluded from queries for current (Recorded) observations.
- **Reads are repeatable and monotonic.** The observation store only grows; a read at time `t2 > t1` returns at least the observations visible at `t1`, plus any added or transitioned in between.
- **`observation_type` is stable across the amendment chain.** All observations in an amendment chain share the same `observation_type`. A chain models the history of one measurement type for one patient; a different type is a different chain.

### Feedback

- After `record` — a new Recorded observation exists. `observation_id`, `patient_ref`, `recorded_by`, `observation_type`, `value`, `unit`, `recorded_at`, `state: Recorded` are set and immutable.
- After `amend` — the original observation is now Amended (acquires `successor_id`); a new Recorded observation exists with `predecessor_id` referencing the original. The original's fields are unchanged.
- After `retract` — the named observation is now Retracted (acquires `retraction_reason`, `retracted_by`). Its other fields are unchanged.
- After `read` — a sequence of matching observations. The store is unchanged.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Observation immutability.** After a successful `record`, an observation's `observation_id`, `patient_ref`, `recorded_by`, `observation_type`, `value`, `unit`, and `recorded_at` never change, regardless of subsequent `amend` or `retract` actions against it.
- **Invariant 2 — Amendment produces a successor.** Every `amend` creates a new observation; it does not modify the original. After `amend`, the original is in Amended state with a `successor_id`; the successor is in Recorded state with a `predecessor_id`.
- **Invariant 3 — Amendment chains are linear.** Each observation has at most one `successor_id` and at most one `predecessor_id`. Amendment chains are singly-linked; branching is not permitted.
- **Invariant 4 — Patient ref is stable across amendment chains.** All observations in an amendment chain share the same `patient_ref`. An `amend` call that would change `patient_ref` is rejected as `invalid-observation`.
- **Invariant 5 — Observation type is stable across amendment chains.** All observations in an amendment chain share the same `observation_type`. An `amend` call that would change `observation_type` is rejected as `invalid-observation`.
- **Invariant 6 — Retraction is terminal.** A Retracted observation accepts no further state transitions. `amend` and `retract` against a Retracted observation are rejected as `already-retracted`.
- **Invariant 7 — No observation is destroyed.** `amend` and `retract` never remove records from the store. Every `observation_id` ever issued remains queryable for the lifetime of the store instance.
- **Invariant 8 — Recorded_at is set once.** `recorded_at` is set at the moment of `record` (from the supplied value or the system clock) and never changes, even after amendment. The successor observation carries its own `recorded_at`, reflecting when the correction was recorded, not when the original measurement was taken.

---

## Examples

### Happy path — vital sign recorded and queried

A nurse records a patient's blood pressure: `record(patient_ref: "p42", recorded_by: "nurse_chen", observation_type: "blood_pressure_systolic", value: 128, unit: "mmHg")` → `observation_id: "obs-001"`. The charge nurse later queries current observations: `read({patient_ref: "p42", observation_type: "blood_pressure_systolic", state: "Recorded"})` → `[{observation_id: "obs-001", value: 128, unit: "mmHg", state: "Recorded", recorded_at: "..."}]`.

### Amendment — correcting a transcription error

The nurse realizes she recorded 128 instead of 138. Calls `amend("obs-001", amended_by: "nurse_chen", value: 138, unit: "mmHg", reason: "transcription error — entered 128, correct value is 138")` → `observation_id: "obs-002"`. The store now contains obs-001 (Amended, `successor_id: "obs-002"`) and obs-002 (Recorded, `predecessor_id: "obs-001"`, value 138). A query for `state: "Recorded"` returns obs-002 only. A query for all states returns both, preserving the full correction history.

### Retraction — wrong patient

An observation is recorded for the wrong patient. Calls `retract("obs-003", retracted_by: "dr_patel", reason: "recorded against wrong patient — intended patient_ref p17, not p12")` → `retracted`. A correct observation is then recorded against p17. obs-003 remains in the store, visible to audit queries, flagged as Retracted.

### Rejection path — amending a retracted observation

A caller attempts to amend an observation that was retracted. `amend("obs-003", ...)` → `rejected(already-retracted)`. The caller must `record` a fresh observation instead.

---

## Regulated adversarial scenarios

### Regulator audit — verify amendment trail integrity

A HIPAA auditor queries all observations for patient p42 across all states: `read({patient_ref: "p42"})`. The result must include every observation ever recorded for this patient — Recorded, Amended, and Retracted — in chronological order. For every Amended observation, the auditor verifies that a `successor_id` is present and that the successor is in the store. For every Retracted observation, the auditor verifies that a `retraction_reason` and `retracted_by` are present. No observation is missing; no amendment is unattributed; no retraction is unexplained. The audit passes by Invariants 2, 3, and 7.

### Disputed observation — patient challenges a recorded value

A patient disputes a recorded blood glucose value, claiming the measurement was taken incorrectly. The clinical record must show: the original observation (by Invariant 1, its value and `recorded_by` are immutable); whether it was amended and why (by Invariant 2, the amendment record names the correcting clinician and the reason); or whether it was retracted and why. The patient's dispute is answered from the records alone — the clinician's identity, the timestamp, and the reason for any correction are all present and unalterable.

### Breach investigation — unauthorized observations

A security investigation suspects that observations were recorded for a patient by an unauthorized actor. The investigator queries `read({patient_ref: "p99"})` and cross-references each observation's `recorded_by` against the authorized clinical staff list at `recorded_at` time. Invariant 1 guarantees `recorded_by` is immutable — it cannot have been edited to cover tracks after the fact. Every observation's author is permanently attributed.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Immutability check.** For a known `observation_id`, retrieve the observation at two different points in time and compare all fields. `observation_id`, `patient_ref`, `recorded_by`, `observation_type`, `value`, `unit`, and `recorded_at` must be identical in both reads. State may differ if an `amend` or `retract` occurred between the reads.
2. **Amendment chain check.** For a known Amended observation, retrieve its `successor_id` and confirm the successor exists, is in Recorded or Retracted state, and carries a `predecessor_id` equal to the original's `observation_id`. Confirm the successor shares the same `patient_ref` and `observation_type` as the original.
3. **Retraction finality check.** Attempt `amend` against a known Retracted observation. The call must return `rejected(already-retracted)`. Confirm the observation's fields are unchanged.
4. **No-destruction check.** For a set of `observation_id`s known to have been issued — including Amended and Retracted ones — confirm that `read` returns each of them when queried by id across all states. No issued id may be absent from the store.
5. **Attribution check.** For every observation in the store, confirm that `recorded_by` is non-empty and that every Retracted observation has a non-empty `retracted_by` and `retraction_reason`. An observation with an empty `recorded_by` is a conformance failure.

---

## Edge cases and explicit non-goals

- **Amending an intermediate node in a chain.** The atom permits amending any Recorded or non-Retracted node, including intermediate nodes in an amendment chain. Callers should amend the current end of the chain (the most recent Recorded observation) to keep the chain semantically clean; amending an intermediate node creates a branch point, which Invariant 3 prohibits. Implementations must enforce that an already-Amended observation cannot be amended again (`already-amended`) — the chain is linear.
- **Amending to change `observation_type`.** Rejected as `invalid-observation`. A clinician who recorded "temperature" when they meant "oxygen_saturation" must retract and re-record. The amendment chain models value corrections within a type, not type changes.
- **Amending to change `patient_ref`.** Rejected as `invalid-observation`. A wrong-patient entry must be retracted and re-recorded against the correct patient. The amendment chain is patient-scoped.
- **Future-dated `recorded_at`.** Rejected as `invalid-observation`. Clinical observations are records of what was measured; a future timestamp is a logical impossibility.
- **Back-dated `recorded_at`.** Permitted, with deployment policy governing the allowable look-back window. A nurse recording a bedside observation taken thirty minutes ago is a normal workflow. An observation recorded_at two years prior is unusual and may warrant additional scrutiny — but the atom does not enforce a look-back limit; that is deployment policy.
- **Value constraint definition.** The atom requires that a value constraint for each `observation_type` be declared and applied; it does not define what the constraints are. Blood pressure ranges, glucose units, pain scale bounds — these are deployment-specific. Implementations must declare the constraint; the atom enforces that it is checked.
- **Access control.** Who may record, amend, or retract an observation is not defined by this atom. That is the obligation of a composing [Permissions](../compliance/permissions.md) pattern. The atom records `recorded_by` and `retracted_by` for attribution; it does not enforce that those actors have the right to perform the action.
- **Retention and destruction.** The atom retains all observations indefinitely. Time-bounded retention under HIPAA minimum necessary standards and eventual destruction under defensible deletion belong to [Retention Window](../compliance/retention-window.md) and [Legal Hold](../../ROADMAP.md) as composing patterns.
- **Tamper-evidence.** The atom guarantees immutability by spec; it does not cryptographically prevent a store administrator from rewriting records. Compose with [Tamper Evidence](../compliance/tamper-evidence.md) for cryptographic guarantees.
- **Observation aggregation and trending.** Longitudinal analytics — trend lines, delta from prior, reference range comparison — are composing concerns. This atom provides the substrate; the analytics layer reads it.
- **Units and terminology standardization.** LOINC codes, SNOMED CT, UCUM units — the atom treats `observation_type` and `unit` as opaque strings. Standardization to controlled vocabularies is a deployment concern, not an atom-level concern.
- **Concurrency.** Two clinicians recording observations for the same patient simultaneously is permitted — each receives a distinct `observation_id`. The atom does not detect or prevent concurrent amendments to the same observation; implementations must serialize `amend` and `retract` against a given `observation_id`.

---

## Composition notes

Clinical Observation composes naturally with the existing library:

- **[Event Log](../temporal/event-log.md)** — the observation record set is structurally a specialized Event Log (append-only, immutable entries, ordered by `recorded_at`). The two are not identical — Clinical Observation has amendment and retraction semantics that Event Log does not — but they share the same architectural instinct. A composing implementation may layer Event Log as the persistence substrate.
- **[Actor Identity](../compliance/actor-identity.md)** — `recorded_by`, `amended_by`, and `retracted_by` are opaque references; Actor Identity provides the attestation store that verifies those references are real, credentialed actors at the time of recording.
- **[Tamper Evidence](../compliance/tamper-evidence.md)** — seals the observation store against post-hoc modification, complementing the spec-level immutability guarantee with a cryptographic one.
- **[Retention Window](../compliance/retention-window.md)** — governs the minimum and maximum retention period for observation records under HIPAA and applicable state law.
- **[Audit Trail](../../compositions/audit-trail.md)** — the canonical composition for regulated record-keeping; Clinical Observation feeds it.
- **Forthcoming:** Medication Order, Care Plan — compositions that consume Clinical Observation as evidence for clinical decision-making.

---

## Standards references

- **HIPAA §164.312(b)** — audit controls: covered entities must implement hardware, software, and procedural mechanisms to record and examine activity in information systems that contain ePHI. The observation record, with its immutable `recorded_by` and `recorded_at`, is the primary audit surface.
- **HL7 FHIR Observation resource** — the canonical interoperability representation of a clinical observation; this atom's structure maps directly to FHIR Observation's `subject`, `performer`, `code`, `value[x]`, `issued`, and `status` fields. FHIR's `status` values (final, amended, cancelled) correspond to Recorded, Amended, Retracted.
- **21 CFR Part 11** — electronic records in FDA-regulated clinical trials; each observation is a regulated electronic record requiring attribution, timestamp, and amendment trail.
- **Joint Commission Record of Care standards** — require that corrections to medical records be dated, timed, and attributed; the amendment model satisfies this directly.
- **IHE PCC (Patient Care Coordination)** — the Clinical Document Architecture (CDA) and FHIR-based profiles that govern how observations are exchanged across care settings.
- **SNOMED CT / LOINC / UCUM** — controlled vocabularies for `observation_type` and `unit`; recommended deployment conventions, not atom-level obligations.

---

## Status

`unresolved` — first draft; no pressure-testing passes completed.

---

## Lineage notes

First draft. No passes run. Three-pass pressure-testing required before this atom advances.
