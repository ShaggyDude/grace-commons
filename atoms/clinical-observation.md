---
title: Clinical Observation
parent: Atomic Concepts
has_toc: true
toc: true
---

# Clinical Observation

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Clinical Observation records a single measurement about a patient — a vital sign, a lab result, an assessment score — in a permanent, attributed form that cannot be silently edited. It answers what a clinician or regulator must be able to ask: what was recorded, who recorded it, and when — and if there were corrections, what they were, who made them, and why. Errors are never edited away. A correction is recorded as a new observation that supersedes the original, and the original stays in the record marked as [Amended]. An observation logged for the wrong patient or wrong type is instead retracted — formally withdrawn with a required explanation, the original still kept — and a fresh correct one recorded separately. This keeps the full history of clinical reasoning recoverable, so a later reviewer can tell a transcription fix apart from a real change in the patient's condition. Each observation is [Recorded] (current), [Amended] (superseded by a correction), or [Retracted] (withdrawn as erroneous); retraction is final, and queries can return just the current observations or the full corrected history. It underlies electronic health records, regulated clinical-trial data capture, and healthcare audit-trail requirements.

---

## Intent

A clinician records a measurement about a patient — blood pressure, temperature, blood glucose, pain score, oxygen saturation. The record must be trustworthy: what was recorded, who recorded it, and when must be permanently fixed. Errors are corrected by recording a successor observation that supersedes the original; the original does not disappear, it is marked as amended (a correction added to a record without replacing it — the original remains). Erroneous observations recorded for the wrong patient or under the wrong type are retracted (formally withdrawn, with reason documented, but not deleted), not edited.

The pattern addresses a clinical requirement that is universal and recurring: the medical record must show both what was originally recorded *and* what the correction was, so that the history of clinical reasoning is recoverable. A mutable record system fails this requirement by definition — once a nurse edits a blood pressure value, the original is gone and the reason for the edit is invisible. The append-and-supersede model (corrections are added as new records that supersede the original — neither the original nor the correction is destroyed) preserves both.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the observation record set), its own actions (`record`, `amend`, `retract`, `read`), and its own invariants (immutability, amendment traceability, retraction finality). Composing patterns add retention policy, tamper-evidence, access control, and longitudinal analytics. The Clinical Observation atom imposes no semantics on what the value means clinically; it imposes only the structural guarantee that the record is faithful to what was recorded and by whom.

---

## Structure

### Store instance model

The Clinical Observation atom operates against a named store instance. A [Store Name] identifies the instance; multiple instances coexist in real systems — one per hospital, per department, or per care team, depending on deployment topology. The atom specifies what one instance is and how it behaves; composing patterns and deployment configuration determine how many instances to instantiate. [Observation Id] values are unique within a store instance; uniqueness across instances is a composing concept. [Patient Ref] is an opaque reference scoped globally — the same [Patient Ref] may appear in multiple store instances for the same patient across care settings.

### Identity model

Each observation has an opaque, immutable, system-generated [Observation Id] — assigned on [Record], never reused, never reassigned within the store instance. The id is the observation's identity; the clinical content is a property of the observation, not its identity.

[Patient Ref] is an opaque reference to the patient. It is set on [Record] and is immutable. It is not the observation's identity — two observations for the same patient have different [Observation Id]s. [Patient Ref] is inherited unchanged by any successor observation created by [Amend].

[Recorded By] is an opaque reference to the clinician who performed the measurement. It is set on [Record] and is immutable. Amendments carry their own [Amended By]; the original [Recorded By] is never changed.

### Inputs

- [Record] calls from clinicians or clinical systems, each carrying a [Patient Ref], a clinician reference ([Recorded By]), an [Observation Type], a [Value], a [Unit], and an optional explicit [Recorded At] timestamp.
- [Amend] calls that correct a prior observation, carrying the id being corrected, the correcting clinician, the corrected [Value] and [Unit], and a required [Reason].
- [Retract] calls that withdraw an erroneous observation, carrying the id being retracted, the retracting clinician, and a required [Reason].
- [Read] queries from clinical systems, analytics pipelines, and audit processes.

### Actions

- (Projected contract: `record(patient_ref, recorded_by, observation_type, value, unit, recorded_at?) → observation_id | rejected(invalid-observation | storage-failure)`) — [Record] creates a new [Recorded] observation. [Recorded At] defaults to the receiving node's wall clock if not supplied; when supplied, it must not be in the future (see the *Clock semantics* edge case).
- (Projected contract: `amend(observation_id, amended_by, value, unit, reason) → new_observation_id | rejected(not-known | already-amended | already-retracted | invalid-request | invalid-observation | storage-failure)`) — [Amend] creates a successor observation that corrects the named one. The original transitions to [Amended]; the successor is [Recorded] with a [Predecessor Id] referencing the original. [Observation Type] and [Patient Ref] are inherited from the original by construction — [Amend] does not accept either as a parameter, so a wrong observation type requires retraction and a fresh [Record], not amendment. [Invalid Request] covers empty [Amended By] or empty [Reason]; [Invalid Observation] covers [Value] or [Unit] failures against the per-type content constraints.
- (Projected contract: `retract(observation_id, retracted_by, reason) → retracted | rejected(not-known | already-retracted | invalid-request | storage-failure)`) — [Retract] marks the observation as [Retracted]. The record remains; no observation data is destroyed. An [Amended] observation may be retracted; doing so retracts only that link in the chain — prior and successor records are not affected.
- (Projected contract: `read(query) → ordered_sequence_of_observations | rejected(invalid-query)`) — [Read] returns observations matching the [Query], ordered by [Recorded At] ascending. A query may filter by [Observation Id], [Patient Ref], [Observation Type], time range, state ([Recorded] / [Amended] / [Retracted]), or any combination. A query supplying only an [Observation Id] returns at most one observation; all other filter dimensions are combinable and may return zero or more.

### Outputs

- For [Record]: a fresh [Observation Id], or a rejection naming the failed precondition.
- For [Amend]: a fresh [Observation Id] for the successor observation, or a rejection.
- For [Retract]: the token `retracted`, or a rejection.
- For [Read]: a (possibly empty) ordered sequence of observations. Each carries its [Observation Id], [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit], [Recorded At], and [State]. The transition-metadata fields are present when applicable, and multiple may co-occur on a single observation per the State transitions: [Predecessor Id], [Amended By], and [Amendment Reason] are set on any successor observation (one that corrects an earlier record); [Successor Id] is set on any [Amended]-state original (one that has been corrected); [Retracted By] and [Retraction Reason] are set on any [Retracted]-state observation. An observation that was first amended (originating a successor) and then retracted carries both [Successor Id] and the retraction-metadata fields. A successor observation that was itself later amended carries both [Predecessor Id] (from the prior amend) and [Successor Id] (from the later amend). The combinations follow mechanically from the State transitions; they are not special cases.

### State

Each observation is in exactly one state:

- **[Recorded]** — the observation stands. It may be amended or retracted.
- **[Amended]** — the observation has been superseded by a correction. It is retained and visible but carries a [Successor Id] pointing to the correcting observation. An [Amended] observation may still be retracted. The successor observation that supersedes it carries [Predecessor Id], [Amended By] (the clinician who made the correction), and [Amendment Reason] (required, non-empty) — set at [Amend] time and immutable thereafter.
- **[Retracted]** — the observation was withdrawn as erroneous. It is retained and visible but flagged as invalid. No further transitions from [Retracted].

Transitions — every successful write either creates a record or transitions one in place; no write ever edits or destroys an observation's content:

| action | from | to | effect | result |
|--------|------|----|--------|--------|
| [Record] | *(no record)* | **[Recorded]** | assigns [Observation Id]; stamps [Recorded At]; sets [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit] | the new [Observation Id] |
| [Amend] | [Recorded] | original → **[Amended]** | original gains [Successor Id]; a new [Recorded] successor is created with [Predecessor Id], [Amended By], [Amendment Reason], and a fresh [Recorded At] | the successor [Observation Id] |
| [Retract] | [Recorded] or [Amended] | **[Retracted]** | stamps [Retracted By], [Retraction Reason] | `retracted` |

Three semantics the cells cannot hold:

- *Amendment is additive, never destructive.* [Amend] creates a successor and marks the original [Amended]; it never edits the original's content. Both records persist and are visible to [Read] (Invariant 2). The original's [Successor Id] and the successor's [Predecessor Id] / [Amended By] / [Amendment Reason] are write-once (Invariant 9).
- *Chains are linear and retraction is terminal.* Each observation has at most one [Successor Id] and one [Predecessor Id] — a second [Amend] against an already-[Amended] original is rejected [Already Amended] (no branching, Invariant 3). A [Retracted] observation accepts no further transition (Invariant 6); [Amend] or [Retract] against it is rejected [Already Retracted].
- *[Amend]'s two writes are atomic.* Creating the successor and updating the original to [Amended] must both commit or neither; on failure the atom returns [Storage Failure] with no observable change (Invariant 7; see the *[Amend] two-write atomicity* edge case).

Purged is not a state in this atom. Clinical records are not deleted; their retention and eventual destruction under legal hold or regulatory obligation belong to composing patterns ([Retention Window](./retention-window.md), [Legal Hold](../roadmap.md)).

### Flow

1. **Clinician takes a measurement.** Calls [Record] with a [Patient Ref], [Recorded By], [Observation Type], [Value], and [Unit]. The atom assigns an [Observation Id], sets [State] = [Recorded], stamps [Recorded At]. Returns the [Observation Id].
2. **Clinician discovers an error in the value.** Calls [Amend] with the [Observation Id], [Amended By], the corrected [Value] and [Unit], and a [Reason]. The atom marks the original as [Amended] (sets [Successor Id]) and creates a new [Recorded] observation with [Predecessor Id] referencing the original. Returns the new [Observation Id].
3. **Clinician discovers the observation was recorded for the wrong patient or wrong type.** Calls [Retract] with the [Observation Id], [Retracted By], and a [Reason]. The atom marks the observation as [Retracted]. The clinician then calls [Record] to create the correct observation.
4. **Clinical system queries a patient's observations.** Calls [Read] filtering by [Patient Ref], [Observation Type], and [State] = [Recorded]. Receives the current (non-superseded, non-retracted) observations in chronological order.

### Decision points

- **At [Record]** — [Patient Ref] and [Recorded By] must be non-empty opaque references; [Observation Type] must be non-empty AND must have a declared value constraint at the deployment (an [Observation Type] with no declared constraint cannot be safely validated and is rejected as [Invalid Observation], not silently accepted); [Value] must satisfy the declared value constraint for the observation type (the atom does not define what a valid blood pressure value is — that is deployment policy; it requires only that the constraint be declared and applied); [Unit] must be non-empty; [Recorded At], if supplied, must not be in the future (checked against the receiving node's wall clock). Any violation rejects as [Invalid Observation]. If the store write fails after all preconditions are satisfied, the atom returns [Storage Failure]; the [Observation Id] is not returned.
- **At [Amend]** — the named [Observation Id] must exist ([Not Known] if absent); must be in [Recorded] state — an observation already in [Amended] state has a successor and cannot be amended again without creating a branch, which Invariant 3 prohibits ([Already Amended]); must not be [Retracted] ([Already Retracted]); corrected [Value] and [Unit] must satisfy the same per-[Observation Type] constraints as [Record] ([Invalid Observation]); [Amended By] must be non-empty and [Reason] must be non-empty — a blank reason defeats the audit trail ([Invalid Request] for either being empty). [Observation Type] and [Patient Ref] are inherited from the original by construction — the action does not admit either as a parameter. If both writes (successor creation and original state update) cannot be made durable, the atom returns [Storage Failure] and no observable state change occurs: the successor is not created and the original remains in [Recorded] state. See the *[Amend] two-write atomicity* edge case for the implementation obligation.
- **At [Retract]** — the named [Observation Id] must exist ([Not Known]); must not already be [Retracted] ([Already Retracted]); [Retracted By] must be non-empty; [Reason] must be non-empty — both are required for the audit trail ([Invalid Request] for either being empty). [Recorded] and [Amended] observations may both be retracted. If the state transition cannot be made durable, the atom returns [Storage Failure]; the observation's state is unchanged and no [Retracted By] or [Retraction Reason] is attached.
- **At [Read]** — query parameters must be well-formed: any supplied [Observation Id] is a syntactically valid id (non-null, non-empty); any supplied time range has start ≤ end; any supplied state filter names one of [Recorded], [Amended], [Retracted]. A query with no filters is well-formed and returns every observation in the store. A well-formed query matching no observations returns an empty sequence, not a rejection. Only malformed parameters (e.g., end before start, unrecognized state value) surface as [Invalid Query].

### Behavior

- **Records are durable on success.** Once [Record] returns an [Observation Id], the observation is in the store and will appear in subsequent reads.
- **Amendment is additive, not destructive.** [Amend] creates a new record; the original remains. Both are visible to [Read]; queries filtering for [State] = [Recorded] return only the current end of the chain.
- **Retraction is permanent.** A retracted observation cannot be un-retracted. It remains in the store, visible to queries that include [State] = [Retracted], but excluded from queries for current ([Recorded]) observations.
- **Reads are repeatable; the underlying store is monotonic.** The observation store only grows — every [Observation Id] ever issued remains addressable indefinitely (Invariant 7). An unfiltered read at time `t2 > t1` therefore returns every observation visible at `t1` plus any added in between. State-filtered reads are *not* monotonic in their result set: an observation visible at `t1` under [State] = [Recorded] is excluded at `t2` if it transitioned to [Amended] or [Retracted] in between. Filtered queries reflect the current state of each observation, not the state at the time of a previous read.
- **[Observation Type] is stable across the amendment chain.** All observations in an amendment chain share the same [Observation Type]. A chain models the history of one measurement type for one patient; a different type is a different chain.

### Feedback

- After [Record] — a new [Recorded] observation exists. [Observation Id], [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit], [Recorded At], [State] = [Recorded] are set and immutable.
- After [Amend] — the original observation is now [Amended] (acquires [Successor Id]); a new [Recorded] observation exists with [Predecessor Id] referencing the original, [Amended By] set to the correcting clinician, and [Amendment Reason] set to the supplied reason. All three fields on the successor are immutable. The original's fields are unchanged.
- After [Retract] — the named observation is now [Retracted] (acquires [Retraction Reason], [Retracted By]). Its other fields are unchanged.
- After [Read] — a sequence of matching observations. The store is unchanged.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Observation immutability.** After a successful [Record], an observation's [Observation Id], [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit], and [Recorded At] never change, regardless of subsequent [Amend] or [Retract] actions against it.
- **Invariant 2 — Amendment produces a successor.** Every [Amend] creates a new observation; it does not modify the original. After [Amend], the original is in [Amended] state with a [Successor Id]; the successor is in [Recorded] state with a [Predecessor Id].
- **Invariant 3 — Amendment chains are linear.** Each observation has at most one [Successor Id] and at most one [Predecessor Id]. Amendment chains are singly-linked; branching is not permitted.
- **Invariant 4 — Patient ref is inherited across amendment chains.** All observations in an amendment chain share the same [Patient Ref]. The successor inherits [Patient Ref] from the original by construction: [Amend] does not accept [Patient Ref] as a parameter, so divergence is structurally impossible — not enforced by a runtime check on inputs that cannot be supplied.
- **Invariant 5 — Observation type is inherited across amendment chains.** All observations in an amendment chain share the same [Observation Type]. The successor inherits [Observation Type] from the original by construction: [Amend] does not accept [Observation Type] as a parameter. A clinician who recorded the wrong observation type must retract and re-record; the amendment chain cannot model a type change.
- **Invariant 6 — Retraction is terminal.** A [Retracted] observation accepts no further state transitions. [Amend] and [Retract] against a [Retracted] observation are rejected as [Already Retracted].
- **Invariant 7 — Observation store durability.** No [Observation Id] is removed from the store. [Amend] and [Retract] transition state; they do not destroy records. The observation count is monotonically non-decreasing for the lifetime of the store instance, and the store admits no deletion surface by spec. A [Storage Failure] response from [Record], [Amend], or [Retract] guarantees that no partial record is observable: the action either makes all its required writes durable or has no observable effect on the store. This guarantee is *jointly enforced* — the spec mandates the atomicity (notably for [Amend]'s two-write transition, see the *[Amend] two-write atomicity* edge case); the implementation provides it, through transactional store semantics or a crash-recovery scan that detects and repairs dangling transitions on restart. An implementation that returns [Storage Failure] while leaving a partial record visible is non-conforming.
- **Invariant 8 — Recorded At is set once.** [Recorded At] is set at the moment of [Record] (from the supplied value or, if not supplied, the receiving node's wall clock — see the *Clock semantics* edge case) and never changes, even after amendment. The successor observation carries its own [Recorded At], reflecting when the correction was recorded, not when the original measurement was taken.
- **Invariant 9 — Transition metadata is write-once.** Every field written by a state-transition action is immutable after the transition completes. When [Amend] writes [Successor Id] to the original observation, that value never changes thereafter — Invariant 3 (linear chains) and the [Already Amended] rejection together prevent any second [Amend] against the same observation from overwriting it. When [Retract] writes [Retracted By] and [Retraction Reason], those values never change — Invariant 6 (retraction is terminal) prevents any further state transition that could overwrite them. The successor observation's [Predecessor Id], [Amended By], and [Amendment Reason] are immutable from the moment [Amend] completes, inheriting the same protection as any other observation's fields under Invariant 1. Taken together with Invariants 1 and 8, no field of any observation — original, successor, or retracted — ever changes after it is first written.

---

## Examples

### Happy path — vital sign recorded and queried

A nurse records a patient's blood pressure: `record(patient_ref: "p42", recorded_by: "nurse_chen", observation_type: "blood_pressure_systolic", value: 128, unit: "mmHg")` → `observation_id: "obs-001"`. The charge nurse later queries current observations: `read({patient_ref: "p42", observation_type: "blood_pressure_systolic", state: "Recorded"})` → `[{observation_id: "obs-001", value: 128, unit: "mmHg", state: "Recorded", recorded_at: "..."}]`.

### Amendment — correcting a transcription error

The nurse realizes she recorded 128 instead of 138. Calls `amend("obs-001", amended_by: "nurse_chen", value: 138, unit: "mmHg", reason: "transcription error — entered 128, correct value is 138")` → `observation_id: "obs-002"`. The store now contains obs-001 (Amended, `successor_id: "obs-002"`) and obs-002 (Recorded, `predecessor_id: "obs-001"`, value 138). A query for `state: "Recorded"` returns obs-002 only. A query for all states returns both, preserving the full correction history.

### Retraction — wrong patient

An observation is recorded for the wrong patient. Calls `retract("obs-003", retracted_by: "dr_patel", reason: "recorded against wrong patient — intended patient_ref p17, not p12")` → `retracted`. A correct observation is then recorded against p17. obs-003 remains in the store, visible to audit queries, flagged as Retracted.

### Rejection path — invalid record

A system submits a `record` call with an empty `recorded_by` field. `record(patient_ref: "p42", recorded_by: "", observation_type: "heart_rate", value: 72, unit: "bpm")` → `rejected(invalid-observation)`. No `observation_id` is issued; no record enters the store. The system must supply a non-empty clinician reference before the observation can be accepted.

### Rejection path — amending a non-existent observation

A clinical system submits an `amend` call against an `observation_id` that was never issued in this store instance. `amend("obs-999", amended_by: "nurse_chen", value: 138, unit: "mmHg", reason: "correcting a prior entry")` → `rejected(not-known)`. No state transitions and no record is created; the caller must verify the `observation_id` before retrying. A common cause is cross-instance referencing — `obs-999` may exist in a sibling store instance but is not visible here.

### Rejection path — amending an already-amended observation

obs-001 has already been corrected once; obs-002 is its successor (Recorded). A caller attempts another correction against obs-001 rather than against the current end of the chain. `amend("obs-001", amended_by: "nurse_chen", value: 140, unit: "mmHg", reason: "further correction")` → `rejected(already-amended)`. To record a further correction, the caller must amend obs-002 — the current Recorded end of the chain. Invariant 3 (linear chains) is what makes this a rejection rather than a branch creation.

### Rejection path — amending a retracted observation

A caller attempts to amend an observation that was retracted. `amend("obs-003", ...)` → `rejected(already-retracted)`. The caller must `record` a fresh observation instead.

---

## Regulated adversarial scenarios

### Regulator audit — verify amendment trail integrity

A HIPAA (US Health Insurance Portability and Accountability Act) auditor queries all observations for patient p42 across all states: `read({patient_ref: "p42"})`. The result must include every observation ever recorded for this patient — [Recorded], [Amended], and [Retracted] — in chronological order. For every [Amended] observation, the auditor verifies that a [Successor Id] is present and that the successor is in the store. For every [Retracted] observation, the auditor verifies that a [Retraction Reason] and [Retracted By] are present. No observation is missing; no amendment is unattributed; no retraction is unexplained. The audit passes by Invariants 2, 3, 7, and 9 — completeness (7), correct amendment-chain structure (2, 3), and the write-once guarantee that prevents retroactive rewiring of [Successor Id], [Retracted By], or [Retraction Reason] (9).

### Disputed observation — patient challenges a recorded value

A patient disputes a recorded blood glucose value, claiming the measurement was taken incorrectly. The clinical record must show: the original observation (by Invariant 1, its [Value] and [Recorded By] are immutable); whether it was amended and why (by the State definition for [Amended] observations and Invariant 9, the successor record names the correcting clinician via [Amended By] and the reason via [Amendment Reason], both write-once); or whether it was retracted and why (by the same Invariant 9, [Retracted By] and [Retraction Reason] are write-once on the original). The patient's dispute is answered from the records alone — the clinician's identity, the timestamp, and the reason for any correction are all present and unalterable.

### Breach investigation — unauthorized observations

A security investigation suspects that observations were recorded for a patient by an unauthorized actor. The investigator queries `read({patient_ref: "p99"})` and cross-references each observation's [Recorded By] against the authorized clinical staff list at [Recorded At] time. Invariant 1 guarantees [Recorded By] is immutable — it cannot have been edited to cover tracks after the fact. Every observation's author is permanently attributed.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Immutability check.** For a known [Observation Id], retrieve the observation at two different points in time and compare all fields. [Observation Id], [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit], and [Recorded At] must be identical in both reads. [State] may differ if an [Amend] or [Retract] occurred between the reads. Additionally, any transition-metadata field that is set in either read — [Successor Id], [Predecessor Id], [Amended By], [Amendment Reason], [Retracted By], [Retraction Reason] — must hold the same value in any later read where it is set (Invariant 9, write-once). A transition-metadata field that changes between two reads is a conformance failure.
2. **Amendment chain check.** For a known [Amended] observation, retrieve its [Successor Id] and confirm the successor exists, is in [Recorded] or [Retracted] state, and carries a [Predecessor Id] equal to the original's [Observation Id]. Confirm the successor shares the same [Patient Ref] and [Observation Type] as the original.
3. **Retraction finality check.** Attempt [Amend] against a known [Retracted] observation. The call must return [Already Retracted]. Confirm the observation's fields are unchanged.
4. **No-destruction check.** For a set of [Observation Id]s known to have been issued — including [Amended] and [Retracted] ones — confirm that [Read] returns each of them when queried by id across all states. No issued id may be absent from the store.
5. **Attribution check.** For every observation in the store, confirm that [Recorded By] is non-empty and that every [Retracted] observation has a non-empty [Retracted By] and [Retraction Reason]. An observation with an empty [Recorded By] is a conformance failure.

---

## Edge cases and explicit non-goals

- **Amending an intermediate node in a chain.** The atom permits amending any [Recorded] or non-[Retracted] node, including intermediate nodes in an amendment chain. Callers should amend the current end of the chain (the most recent [Recorded] observation) to keep the chain semantically clean; amending an intermediate node creates a branch point, which Invariant 3 prohibits. Implementations must enforce that an already-[Amended] observation cannot be amended again ([Already Amended]) — the chain is linear.
- **Amending to change [Observation Type].** Structurally impossible — [Amend] does not accept an [Observation Type] parameter; the successor inherits the original's type by construction (Invariant 5). A clinician who recorded `temperature` when they meant `oxygen_saturation` must retract and re-record. The amendment chain models value corrections within a type, not type changes.
- **Amending to change [Patient Ref].** Structurally impossible — [Amend] does not accept a [Patient Ref] parameter; the successor inherits the original's patient by construction (Invariant 4). A wrong-patient entry must be retracted and re-recorded against the correct patient. The amendment chain is patient-scoped.
- **Future-dated [Recorded At].** Rejected as [Invalid Observation]. Clinical observations are records of what was measured; a future timestamp is a logical impossibility.
- **Back-dated [Recorded At].** Permitted, with deployment policy governing the allowable look-back window. A nurse recording a bedside observation taken thirty minutes ago is a normal workflow. An observation recorded two years prior is unusual and may warrant additional scrutiny — but the atom does not enforce a look-back limit; that is deployment policy.
- **Value constraint definition.** The atom requires that a value constraint for each [Observation Type] be declared and applied; it does not define what the constraints are. Blood pressure ranges, glucose units, pain scale bounds — these are deployment-specific. Implementations must declare the constraint; the atom enforces that it is checked. A [Record] call carrying an [Observation Type] for which no constraint has been declared is rejected as [Invalid Observation] — accepting unknown types without validation would defeat the per-type integrity guarantee and is therefore not permitted. Deployments add new observation types by first declaring their value constraints; the atom never silently accepts a type it has no validation for.
- **Access control.** Who may [Record], [Amend], or [Retract] an observation is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. The atom records [Recorded By] and [Retracted By] for attribution; it does not enforce that those actors have the right to perform the action.
- **Retention and destruction.** The atom retains all observations indefinitely. Time-bounded retention under HIPAA minimum necessary standards and eventual destruction under defensible deletion belong to [Retention Window](./retention-window.md) and [Legal Hold](../roadmap.md) as composing patterns.
- **Tamper-evidence.** The atom guarantees immutability by spec; it does not cryptographically prevent a store administrator from rewriting records. Compose with [Tamper Evidence](./tamper-evidence.md) for cryptographic guarantees.
- **Observation aggregation and trending.** Longitudinal analytics — trend lines, delta from prior, reference range comparison — are composing concepts. This atom provides the substrate; the analytics layer reads it.
- **Units and terminology standardization.** LOINC (Logical Observation Identifiers Names and Codes — a standard for lab and clinical observation codes), SNOMED CT (Systematized Nomenclature of Medicine — Clinical Terms, a comprehensive clinical vocabulary), UCUM (Unified Code for Units of Measure) units — the atom treats [Observation Type] and [Unit] as opaque strings. Standardization to controlled vocabularies is handled at the deployment layer, not at the atom level.
- **Concurrency.** Two clinicians recording observations for the same patient simultaneously is permitted — each receives a distinct [Observation Id]. The atom does not detect or prevent concurrent amendments to the same observation; implementations must serialize [Amend] and [Retract] against a given [Observation Id].
- **Store instance selection.** The atom specifies what one store instance is and how it behaves; it does not specify how a caller selects which instance to call against. No action accepts [Store Name] as a parameter — calls implicitly target a single routed instance. Selection is handled at the deployment-routing layer: typically a service binding, URL endpoint, namespace prefix, or similar configuration supplied by the deployment. Composing patterns that need to operate across multiple instances (a multi-hospital audit query, a network-wide patient history) must compose at a layer above this atom, providing their own cross-instance routing or aggregation. [Patient Ref] is the only field designed to be portable across instances (global scope by spec); [Observation Id]s are scoped to one instance and must not be assumed unique elsewhere.
- **[Record] idempotency.** [Record] is not idempotent at this layer. A clinical system that retries [Record] after a network timeout — uncertain whether the previous call reached the store — creates a duplicate observation if the previous call did succeed; both calls return distinct [Observation Id]s. The atom takes no position on whether duplicate observations are clinically meaningful; that depends on the observation type and care setting. For systems requiring at-most-once semantics on record submission, compose with [Duplicate Prevention](./duplicate-prevention.md), which provides idempotency keys above this atom. [Amend] and [Retract] are naturally semi-idempotent: a retry against an already-amended observation returns [Already Amended], and a retry against an already-retracted observation returns [Already Retracted]. The caller can recover from a timeout by reading the affected observation to discover whether the prior call succeeded — the [Successor Id] or [Retraction Reason] reveals the outcome. Neither action creates duplicate state transitions on retry.
- **[Amend] two-write atomicity.** The [Amend] operation requires two durable writes: creating the successor observation and updating the original to [Amended] state with a [Successor Id]. A crash between writes leaves the store in an inconsistent state — either the successor exists without the original pointing at it (violates Invariant 2) or the original is marked [Amended] with a [Successor Id] that does not exist in the store (violates Invariant 3). Resolving mid-transition crashes is out of scope for this atom; implementations must provide atomic transaction support across both writes, or a crash-recovery scan that detects and repairs dangling amendment links on restart. Per the Decision point for [Amend], a [Storage Failure] response is the observable signal of an aborted two-write attempt; per Invariant 7 (Observation store durability), no partial record is visible after such a response.
- **[Amend] does not accept [Recorded At].** While [Record] accepts an optional [Recorded At], [Amend] does not. The successor observation's [Recorded At] is always set to the receiving node's wall clock at amendment time. This is by design: an amendment's timestamp is its own audit provenance — when the correction was identified and entered, not when the original measurement was taken. Allowing a caller-supplied [Recorded At] on [Amend] would let a back-dated amendment masquerade as a contemporaneous correction, weakening the audit trail and the regulator-audit scenario below. The original observation's [Recorded At] (set on [Record]) remains the canonical measurement time and is unchanged by amendment, per Invariant 8.
- **Whitespace-only required strings.** All required string fields — [Patient Ref], [Recorded By], [Observation Type], [Unit], [Amended By], [Retracted By], and the [Reason] on [Amend] and [Retract] — must contain at least one non-whitespace character. A field consisting solely of whitespace characters (spaces, tabs, newlines, Unicode whitespace) is treated as empty and surfaces the same rejection as a literally empty string ([Invalid Observation] for [Record]'s content fields; [Invalid Request] for [Amend]'s [Amended By]/[Reason] and [Retract]'s [Retracted By]/[Reason]). Implementations must either trim or check for visible content before recording; they must not accept whitespace-only as a meaningful clinician identity, reason, or content value.
- **Clock semantics.** [Recorded At] defaults to the receiving node's wall clock when not supplied by the caller. "Must not be in the future" is checked against the receiving node's clock at the moment of the [Record] call. Clock skew between the caller and the receiving node is handled at the deployment layer — an observation submitted from a client with a slightly fast clock may be rejected as future-dated even if the measurement occurred in the past. Timezone normalization (storage in UTC) is a deployment convention; the atom does not enforce a timezone. Under an unreliable or skewed clock, [Recorded At] may not be monotonically increasing across observations; there is no sequence-number equivalent here. Ordering within a patient's observation history should be treated as best-effort wall time, not authoritative causal order.
- **Rejection priority.** When multiple precondition violations exist on the same call, the rejection returned follows a defined priority — cheapest and most-structural checks first, persistence last. For [Amend]: [Not Known] (id existence) → [Already Amended] / [Already Retracted] (id state) → [Invalid Request] (request metadata, empty [Amended By] / [Reason]) → [Invalid Observation] (content, [Value] / [Unit] constraint) → [Storage Failure] (persistence). For [Retract]: [Not Known] → [Already Retracted] → [Invalid Request] → [Storage Failure]. For [Record]: [Invalid Observation] (any content/metadata violation including unknown [Observation Type]) → [Storage Failure]. For [Read]: [Invalid Query] is the only rejection. A caller that fixes one rejection class may receive a different rejection on retry as the next-priority check fires; this is expected and not a regression. The priority order is the same across conforming implementations so callers can write deterministic retry logic.
- **Tie-breaking for identical [Recorded At].** When two or more observations carry the same [Recorded At] — concurrent records from two clinicians, a back-dated record colliding with a current entry, or coarse-grained clock resolution — the relative order in a [Read] result sequence is implementation-defined but must be stable across consecutive reads of the same store state. The atom does not prescribe a tie-breaker; common choices are [Observation Id] lexical order (deterministic but arbitrary across implementations) or insertion order (deterministic within an implementation). Callers that depend on a specific tie-breaking rule must establish it as a deployment convention rather than relying on cross-implementation portability.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Record

The behavior a clinician or clinical system invokes to create a new [Recorded] observation. It assigns an [Observation Id], sets [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit], and [Recorded At], and returns the [Observation Id] (or a rejection). It validates [Value] against the declared per-type constraint and rejects an unknown [Observation Type].

Kind: Operation

#### Amend

The behavior that corrects a [Recorded] observation by creating a successor. The original transitions to [Amended] with a [Successor Id]; the successor is [Recorded] with a [Predecessor Id], [Amended By], and [Amendment Reason], inheriting [Patient Ref] and [Observation Type] by construction. It does not edit the original and does not accept [Patient Ref], [Observation Type], or [Recorded At] as parameters.

Kind: Operation

#### Retract

The behavior that withdraws an erroneous observation, marking it [Retracted] with [Retracted By] and [Retraction Reason]. The record is retained, not destroyed. A [Recorded] or [Amended] observation may be retracted; a [Retracted] one may not (terminal).

Kind: Operation

#### Read

The read-only behavior that returns the observations matching a [Query], ordered by [Recorded At] ascending. It changes nothing. Filters by [Observation Id], [Patient Ref], [Observation Type], time range, or [State] are combinable.

Kind: Operation

#### Observation Id

The opaque, immutable, system-generated identity of an observation, assigned on [Record], never reused or reassigned within the store instance. The clinical content is a property of the observation, not its identity.

Kind:     Field
Field of: Observation
Projects: observation_id

#### Patient Ref

The opaque, globally-scoped reference to the patient the observation is about. Set on [Record], immutable, and inherited unchanged by any successor across an amendment chain (Invariant 4).

Kind:     Field
Field of: Observation
Projects: patient_ref

#### Recorded By

The opaque reference to the clinician who performed the measurement. Set on [Record], immutable; an amendment carries its own [Amended By] and never changes the original [Recorded By].

Kind:     Field
Field of: Observation
Projects: recorded_by

#### Observation Type

The opaque string naming what was measured (a vital sign, lab result, assessment score). Set on [Record], immutable, inherited across an amendment chain (Invariant 5). It must have a declared value constraint at the deployment.

Kind:     Field
Field of: Observation
Projects: observation_type

#### Value

The measured value, validated against the declared per-[Observation Type] constraint at [Record] and [Amend] time. Set on [Record], immutable on the record it belongs to; a correction is a new successor [Value], not an edit.

Kind:     Field
Field of: Observation
Projects: value

#### Unit

The unit of measure for the [Value], a non-empty opaque string. Set on [Record], immutable on its record; terminology standardization (UCUM) is a deployment convention.

Kind:     Field
Field of: Observation
Projects: unit

#### Recorded At

The wall-time the observation was recorded — supplied to [Record] or defaulted from the receiving node's wall clock; must not be future-dated. Set once (Invariant 8), immutable. A successor carries its own [Recorded At] (when the correction was entered), not the original measurement time.

Kind:     Field
Field of: Observation
Projects: recorded_at

#### State

The observation's lifecycle state — [Recorded], [Amended], or [Retracted]. Set to [Recorded] on [Record]; transitions via [Amend] (original → [Amended]) and [Retract] (→ [Retracted]).

Kind:     Field
Field of: Observation
Projects: state

#### Predecessor Id

The [Observation Id] of the record a successor corrects — set on the successor at [Amend] time, immutable thereafter (Invariant 9). At most one per observation (linear chains, Invariant 3).

Kind:     Field
Field of: Observation
Projects: predecessor_id

#### Successor Id

The [Observation Id] of the correcting record — set on the original when it is [Amended], immutable thereafter (Invariant 9). At most one per observation (linear chains, Invariant 3).

Kind:     Field
Field of: Observation
Projects: successor_id

#### Amended By

The opaque reference to the clinician who made a correction — set on the successor at [Amend] time, immutable thereafter.

Kind:     Field
Field of: Observation
Projects: amended_by

#### Amendment Reason

The required, non-empty reason for a correction — set on the successor at [Amend] time, immutable thereafter. A blank reason defeats the audit trail and is rejected.

Kind:     Field
Field of: Observation
Projects: amendment_reason

#### Retracted By

The opaque reference to the clinician who withdrew an observation — set at [Retract] time, immutable thereafter (Invariant 9).

Kind:     Field
Field of: Observation
Projects: retracted_by

#### Retraction Reason

The required, non-empty reason for a retraction — set at [Retract] time, immutable thereafter. A blank reason is rejected.

Kind:     Field
Field of: Observation
Projects: retraction_reason

#### Store Name

The identifier of the store instance an observation belongs to. Multiple instances coexist; [Observation Id]s are unique within an instance, while [Patient Ref] is portable across instances. No action accepts it as a parameter — instance selection is handled at the deployment-routing layer.

Kind:     Field
Field of: the store instance
Projects: store_name

#### Reason

The required, non-empty reason string [Amend] and [Retract] consume — written into [Amendment Reason] or [Retraction Reason] respectively. Not stored under this name; an empty or whitespace-only value is rejected [Invalid Request].

Kind:         Parameter
Parameter of: Amend
Projects:     reason

#### Query

The selection [Read] consumes — a filter over [Observation Id], [Patient Ref], [Observation Type], time range, and/or [State]. Supplied per call, not stored; a malformed one is rejected [Invalid Query].

Kind:         Parameter
Parameter of: Read
Projects:     query

#### Recorded

The state of a current, standing observation. A record enters [Recorded] on [Record] (or as the successor of an [Amend]); it may be amended or retracted.

Kind:      Member
Member of: the observation state
Role:      Outcome

#### Amended

The state of an observation that has been superseded by a correction. Retained and visible, carrying a [Successor Id]; it may still be retracted but not amended again (linear chains, Invariant 3).

Kind:      Member
Member of: the observation state
Role:      Outcome

#### Retracted

The terminal state of an observation withdrawn as erroneous. Retained and visible but flagged invalid, carrying [Retracted By] and [Retraction Reason]; no further transition (Invariant 6).

Kind:      Member
Member of: the observation state
Role:      Outcome

#### Invalid Observation

The refusal [Record] (or [Amend]) returns when observation content fails — an empty/whitespace [Patient Ref], [Recorded By], [Observation Type], or [Unit]; a [Value] failing the per-type constraint; an [Observation Type] with no declared constraint; or a future-dated [Recorded At].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-observation

#### Storage Failure

The refusal any writing action returns when a durable write fails after preconditions pass. All-or-none: no partial record is observable (Invariant 7).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The refusal [Amend] or [Retract] returns when the named [Observation Id] references no record in this store instance — a lookup miss (a common cause is cross-instance referencing).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Already Amended

The refusal [Amend] returns when the target is already [Amended] — it has a successor, and amending it again would branch the chain, which Invariant 3 prohibits.

Kind:      Member
Member of: the Amend rejection
Role:      Outcome
Projects:  already-amended

#### Already Retracted

The refusal [Amend] or [Retract] returns when the target is already [Retracted] — retraction is terminal (Invariant 6).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-retracted

#### Invalid Request

The refusal [Amend] or [Retract] returns when request metadata fails — an empty or whitespace-only [Amended By], [Retracted By], or [Reason].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Invalid Query

The refusal [Read] returns when query parameters are malformed — a time range with end before start, an unrecognized state value, or a syntactically invalid [Observation Id].

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Record]: #record
[Amend]: #amend
[Retract]: #retract
[Read]: #read
[Observation Id]: #observation-id
[Patient Ref]: #patient-ref
[Recorded By]: #recorded-by
[Observation Type]: #observation-type
[Value]: #value
[Unit]: #unit
[Recorded At]: #recorded-at
[State]: #state
[Predecessor Id]: #predecessor-id
[Successor Id]: #successor-id
[Amended By]: #amended-by
[Amendment Reason]: #amendment-reason
[Retracted By]: #retracted-by
[Retraction Reason]: #retraction-reason
[Store Name]: #store-name
[Reason]: #reason
[Query]: #query
[Recorded]: #recorded
[Amended]: #amended
[Retracted]: #retracted
[Invalid Observation]: #invalid-observation
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Already Amended]: #already-amended
[Already Retracted]: #already-retracted
[Invalid Request]: #invalid-request
[Invalid Query]: #invalid-query

---

## Composition notes

Clinical Observation composes naturally with the existing library:

- **[Event Log](./event-log.md)** — the observation record set is structurally a specialized Event Log (append-only, immutable entries, ordered by [Recorded At]). The two are not identical — Clinical Observation has amendment and retraction semantics that Event Log does not — but they share the same architectural instinct. A composing implementation may layer Event Log as the persistence substrate.
- **[Actor Identity](./actor-identity.md)** — [Recorded By], [Amended By], and [Retracted By] are opaque references; Actor Identity provides the attestation store that verifies those references are real, credentialed actors at the time of recording.
- **[Tamper Evidence](./tamper-evidence.md)** — seals the observation store against post-hoc modification, complementing the spec-level immutability guarantee with a cryptographic one.
- **[Retention Window](./retention-window.md)** — governs the minimum and maximum retention period for observation records under HIPAA and applicable state law.
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical composition for regulated record-keeping; Clinical Observation feeds it.
- **[Medication Order](./medication-order.md)** — carries an optional `clinical_evidence_ref` field that holds an opaque reference to the Clinical Observation(s) that informed the prescribing decision. The relationship is advisory and unidirectional: Clinical Observation provides the upstream evidence substrate; Medication Order records the clinical response. Clinical Observation does not depend on Medication Order to be specified.
- **Forthcoming:** Care Plan — a composition modeling a structured set of medication orders, clinical observations, and clinical goals; Clinical Observation is a constituent.

---

## Standards references

- **HIPAA §164.312(b)** — audit controls: covered entities must implement hardware, software, and procedural mechanisms to record and examine activity in information systems that contain ePHI (electronic Protected Health Information — individually identifiable health data in digital form). The observation record, with its immutable [Recorded By] and [Recorded At], is the primary audit surface.
- **HL7 FHIR (Health Level 7 Fast Healthcare Interoperability Resources — a standard for exchanging healthcare information) Observation resource** — the canonical interoperability representation of a clinical observation; this atom's core fields map to FHIR Observation's `subject` ([Patient Ref]), `performer` ([Recorded By]), `value[x]` ([Value] + [Unit]), `issued` ([Recorded At]), and `status` (final → [Recorded], amended → [Amended], cancelled → [Retracted]). FHIR's `code` field is a CodeableConcept (LOINC or SNOMED CT), not an opaque string — this atom deliberately defers terminology binding to deployment convention. FHIR carries many additional fields (category, encounter, bodySite, interpretation, referenceRange) not present here; those are composing-layer concepts.
- **21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 11** — electronic records in FDA-regulated (US Food and Drug Administration) clinical trials; each observation is a regulated electronic record requiring attribution, timestamp, and amendment trail.
- **Joint Commission Record of Care standards** — require that corrections to medical records be dated, timed, and attributed; the amendment model satisfies this directly.
- **IHE PCC (Integrating the Healthcare Enterprise — Patient Care Coordination)** — the Clinical Document Architecture (CDA) and FHIR-based profiles that govern how observations are exchanged across care settings.
- **SNOMED CT / LOINC / UCUM** — controlled vocabularies for [Observation Type] and [Unit]; recommended deployment conventions, not atom-level obligations.

---

## Status

`grounded on Final Critique 4 — 2026-05-20` (formal layer landed 2026-06-03 — Alloy structural model `clinical-observation.als` + buggy twin verified; see Lineage §Formal model. Cleared `grounded (English) — formal layer pending`; full prose round was `grounded — 2026-05-20`.) — foundation passes complete (Pass 1, Pass 2, Pass 3), two human refinement rounds complete (Refinement rounds 1 and 2), and one AI-conducted adversarial round complete (Refinement round 3, Torvalds X2 posture, Claude Opus 4.7). All nine GRID (the nine-node structural-completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof) nodes resolved, all concepts independent, all known adversarial gaps closed or named as explicit out-of-scope. Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's Refinement round 3 (AI-conducted adversarial round, Torvalds X2 posture, Claude Opus 4.7) is retro-labeled Final Critique 4; the original round-naming in the Lineage notes below is preserved as historical record.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

**Pass 1 — Structural completeness (GRID).** Two findings, both closed in-pattern.

- *Store instance model absent.* The atom referenced "the store" throughout without defining whether one global store or multiple named instances are valid. Fixed: added a *Store instance model* subsection to Structure, mirroring Event Log's named-instance model. `observation_id` uniqueness is now explicitly scoped to a store instance; `patient_ref` is noted as globally scoped across instances.
- *`amended_by` and `amendment_reason` not persisted.* The `amend` action accepted both as inputs but neither appeared in the State field listing, Outputs, or Feedback — making them unrecoverable from the records. The regulated adversarial scenarios and Generation acceptance check 2 both depend on amendment attribution. Fixed: both fields added to the Amended state description in State, to Outputs (per-record field list for successor observations), and to Feedback after `amend`. Both are set at `amend` time and immutable thereafter.

All nine GRID nodes resolved. No extractions.

**Pass 2 — Conceptual independence (EOS).** Clean. No over-absorptions found. One judgment call recorded: amendment chain semantics (predecessor_id, successor_id, amended_by, amendment_reason, Recorded → Amended transition) were evaluated as an extraction candidate. Kept in-pattern because the mechanic is definitional to the atom — it cannot be specified without knowing which fields can and cannot change across an amendment, making a generic "Amendment Trail" atom dependent on the host for its constraints, which inverts the composition direction. All cross-cutting concerns (actor verification, tamper-evidence, retention, access control, terminology) correctly deferred to named composing patterns. One flag forwarded to Pass 3: concurrent amendment serialization obligation unstated.

**Pass 3 — Adversarial scrutiny (Linus mode).** Six findings: four real, two minor. All closed in-pattern.

- *Contradictory `amend` precondition.* Decision points said "Recorded or Amended state" — contradicting Invariant 3 (linear chains) and the Edge case requiring implementations to reject amending an already-Amended observation. Fixed: Decision point now states "Recorded state only"; `already-amended` fires for any observation in Amended state; the rationale (amending an Amended observation would create a branch, prohibited by Invariant 3) is stated inline.
- *`retract` missing input validation.* Decision points had no validation for `retracted_by` or `reason`; both could be empty; the signature lacked a rejection reason for invalid inputs. Fixed: `invalid-request` added to `retract` signature; Decision point now explicitly requires `retracted_by` non-empty and `reason` non-empty, with `invalid-request` as the rejection.
- *`record` rejection example absent.* All examples showed successful `record` calls. Fixed: added *Rejection path — invalid record* example showing `rejected(invalid-observation)` for an empty `recorded_by`.
- *`amend` two-write atomicity gap.* The `amend` operation requires two durable writes; a crash between them violates Invariants 2 or 3. Fixed: new edge case added naming this as out-of-scope and requiring atomic transaction support or crash-recovery logic from implementations.
- *Clock semantics unstated (minor).* `recorded_at` defaults to "the system clock" without specifying whose clock, monotonicity, timezone, or skew behavior. Fixed: new edge case added stating `recorded_at` is best-effort wall time from the receiving node's clock; skew, timezone normalization, and monotonicity are deployment concerns.
- *"Maps directly" to FHIR overclaims (minor).* FHIR `code` is a CodeableConcept, not an opaque string; FHIR carries many additional fields not present in this atom. Fixed: Standards reference updated to "core fields map to" with explicit field-by-field correspondence and a note on what FHIR carries that this atom defers to composing layers.

**Refinement round 1 — re-run of all three passes.** Eight findings, all closed in-pattern. Conventions inherited from prior worked examples (Actor Identity's Invariant 9 durability framing, the per-action rejection-vocabulary split from Permissions and Retention Window) rather than re-derived.

- *Rejection-reason naming inconsistency between `amend` and `retract` (Pass 3).* The two actions validate analogous request-metadata fields (`amended_by` / `retracted_by` non-empty, `reason` non-empty), but `amend` surfaced those violations as `invalid-observation` while `retract` surfaced them as `invalid-request`. A reader of the signatures alone could not predict the naming split. Resolved: `amend`'s rejection vocabulary updated to use `invalid-request` for empty `amended_by` or `reason` and `invalid-observation` for `value`/`unit` content failures. The signature and Decision points are split accordingly. The split now follows a principled rule — `invalid-observation` is reserved for failures of observation content; `invalid-request` for failures of request metadata.
- *`amend` and `retract` storage-failure behavior unstated in Decision points (Pass 1 / Pass 3).* The signatures named `storage-failure` but the Decision points did not describe its effect on observed state. A reader of those sections alone could not predict whether a `storage-failure` left the original in Amended state, a successor partially written, or no state change at all. Resolved: Decision points for both actions now state that `storage-failure` leaves no observable state change — for `amend`, the successor is not created and the original remains Recorded; for `retract`, the observation's state is unchanged and no `retracted_by` or `retraction_reason` is attached. The two-write atomicity edge case is cross-referenced.
- *Invariants 4 and 5 described unreachable rejections (Pass 3).* Both invariants ended with "An `amend` call that would change `patient_ref` (or `observation_type`) is rejected as `invalid-observation`." But `amend`'s signature does not accept `patient_ref` or `observation_type` as parameters, so such a call is structurally impossible — the rejection clauses were dead code dressed as enforcement. The same misalignment had propagated into the *Amending to change `observation_type`* and *Amending to change `patient_ref`* edge cases, both of which also asserted `invalid-observation` rejection. Resolved: both invariants reframed as inheritance guarantees — the successor inherits the original's `patient_ref` and `observation_type` by construction, because the action signature does not admit either field as input — and both edge cases updated to describe the change as structurally impossible rather than runtime-rejected. The mechanism is structural, not predicate-checked.
- *`read` filter list omitted `observation_id` (Pass 1 / Pass 3).* The Actions description and Decision points enumerated `read` filters as `patient_ref`, `observation_type`, time range, and state — but not `observation_id`. Generation acceptance check 4 ("retrieve each of them when queried by id") requires id-based lookup, leaving a gap between the conformance bar and the documented action surface. Resolved: `observation_id` added to the filter list in Actions; the `read` Decision point now defines well-formedness across all filter dimensions and reserves `invalid-query` for malformed parameters (end-before-start time ranges, unrecognized state values, syntactically invalid ids).
- *Observation store durability not formally invariant (Pass 3).* Invariant 7 stated no observation is destroyed but did not state the consistency guarantee between `storage-failure` responses and the absence of partial records — the convention used by Actor Identity's Invariant 9 and Retention Window's Invariant 10. Resolved: Invariant 7 strengthened (and renamed to *Observation store durability*) to name the monotonically non-decreasing observation count, the absence of a deletion surface, and the explicit guarantee that `storage-failure` from any action leaves no partial record observable.
- *Rejection-path examples covered only one rejection class (Pass 3).* Round 1 added a `record` rejection example but did not extend coverage; `not-known` and `already-amended` had no worked examples despite being the most likely failure modes for `amend` callers. Resolved: two rejection-path examples added — *amending a non-existent observation* (returns `not-known`, with a note on cross-instance referencing as a common cause) and *amending an already-amended observation* (returns `already-amended`, tied to Invariant 3's linear-chain rule). Together with the existing *amending a retracted observation* example, all three precondition-class rejections for `amend` are now exemplified.
- *`amend` lacked `recorded_at` rationale (Pass 3, minor).* `record` accepts optional `recorded_at`; `amend` does not. The design intent is that an amendment's timestamp is unambiguously "when the correction was identified and entered," but the rationale was implicit. A reader could plausibly assume the omission was incidental and consider adding `recorded_at` to `amend` in an implementation, which would let a back-dated amendment masquerade as a contemporaneous correction and weaken the audit trail. Resolved: edge case added explicitly stating the omission is intentional, naming the audit-trail rationale, and reaffirming that the original's `recorded_at` remains the canonical measurement time.
- *Whitespace-only string handling unstated (Pass 3, minor).* Decision points required fields to be "non-empty" without specifying whether whitespace-only strings counted. An implementation taking "non-empty" literally would accept `recorded_by: "   "` as a valid clinician reference, defeating the attribution guarantee underwriting the regulator-audit and breach scenarios. Resolved: edge case added clarifying that all required string fields are treated as empty if they contain only whitespace; implementations must either trim or check for visible content before recording.

Pass 2 was clean. The amendment-chain mechanic was re-examined as an extraction candidate (as in Round 1) and again kept in-pattern: the Round 1 rationale — that a generic Amendment Trail atom would depend on the host for its constraints, inverting the composition direction — still holds, and no new over-absorption candidates surfaced. All eight fixes are in-pattern; none required extraction or new composing patterns.

**Refinement round 2 — re-run of all three passes.** Four findings, all closed in-pattern. The findings cluster around surface area that Round 2's fixes touched (the transition-metadata vocabulary made richer by the rejection-vocab split and the strengthened Invariant 7) plus two operational gaps that survived the first refinement.

- *Monotonic-reads claim overclaimed for filtered queries (Pass 1).* The Behavior bullet read "Reads are repeatable and monotonic. The observation store only grows; a read at time `t2 > t1` returns at least the observations visible at `t1`, plus any added or transitioned in between." This is true for *unfiltered* reads but false for state-filtered reads — an observation visible at `t1` under `state: "Recorded"` is excluded at `t2` if it transitioned to Amended or Retracted in between, so the filtered result set is not monotonic. The earlier wording conflated store monotonicity (real, per Invariant 7) with result-set monotonicity (only real for unfiltered reads). Resolved: bullet rewritten to distinguish the two — the underlying store is monotonic; filtered queries reflect current state and may shrink as observations transition.
- *Transition metadata not invariant-grade immutable (Pass 3).* Invariant 1 enumerated immutable fields as `observation_id`, `patient_ref`, `recorded_by`, `observation_type`, `value`, `unit`, and `recorded_at` — explicitly omitting `successor_id`, `predecessor_id`, `amended_by`, `amendment_reason`, `retracted_by`, and `retraction_reason`. The State section called these fields "immutable thereafter" in prose, but no Invariant formally protected them. A composing implementation reading the Invariants alone could rationalize rewriting `successor_id` retroactively — for instance, "stitching" a new successor in after the fact — without violating any explicit invariant. The Round 2 strengthening of Invariant 7 (durability and partial-record absence) did not close this gap; it addressed write atomicity, not write-once semantics on transition metadata. Resolved: Invariant 9 added (*Transition metadata is write-once*), spelling out that every transition-written field is immutable after the transition completes, with the mechanism (Invariants 3 and 6 plus the `already-amended` / `already-retracted` rejections) cited inline. Generation acceptance check 1 extended to cover the new invariant — transition-metadata fields must hold the same value across reads where they are set.
- *`record` idempotency policy unstated (Pass 3).* A clinical system retrying `record` after a network timeout — uncertain whether the previous call reached the store — creates a duplicate observation if the previous call did succeed; both calls return distinct `observation_id`s with no deduplication. The atom never named this gap, despite the library having Duplicate Prevention available and Idempotent Reservation already worked as a composition pattern. A reader could plausibly assume `record` provides at-most-once semantics under retry; it does not. Resolved: new edge case *`record` idempotency* names the gap, defers the at-most-once requirement to a composing [Duplicate Prevention](./duplicate-prevention.md), and notes that `amend` and `retract` are naturally semi-idempotent — a retry returns the appropriate `already-amended` or `already-retracted` rejection, and the caller can recover by reading the observation to discover whether the prior call succeeded.
- *Tie-breaking for identical `recorded_at` unspecified (Pass 3).* `read` returns observations ordered by `recorded_at` ascending, but the ordering when two or more observations share the same `recorded_at` was undefined. Concurrent records from two clinicians, back-dated entries colliding with current ones, or coarse-grained clock resolution can all produce ties. A caller comparing two read results across implementations (or across query times in some implementations) could observe inconsistent orderings. Resolved: new edge case *Tie-breaking for identical `recorded_at`* requires stable ordering across consecutive reads of the same store state, leaves the specific tie-breaker as implementation-defined (with `observation_id` lexical order or insertion order named as common choices), and warns callers that cross-implementation portability requires a deployment convention.

Pass 2 was clean. The amendment-chain extraction was re-examined a third time and still belongs in-pattern; value-constraint declaration and observation-type classification were checked as new extraction candidates and both correctly remain deployment concerns (the atom requires they exist and be applied, but does not absorb their declaration). All four fixes are in-pattern; none required extraction or new composing patterns.

One regulator-audit-scenario wording candidate was considered and dropped — the scenario's "chronological order" expectation reads cleanly under the Clock semantics edge case's wall-time-best-effort caveat, and revising it would be polish without substance.

**Refinement round 3 — AI-conducted adversarial round.** Reviewer: Claude Opus 4.7, Torvalds X2 posture (low-patience, allergic to abstraction-as-evasion, every claim and citation contested, no sympathy for prior decisions). Full pass-question set from [`pressure-testing.md`](../pressure-testing.md) applied. Seven findings surfaced, all closed in-pattern; Pass 2 clean with a documented settled-judgment note.

- *Value-constraint behavior for unknown `observation_type` unstated (Pass 1 / Pass 3).* The `record` Decision point required `value` to satisfy "the configured value constraint for the observation type" and the Value-constraint-definition edge case required implementations to declare constraints — but neither said what happens when a `record` arrives carrying an `observation_type` that has no declared constraint. Reject? Accept without validation? Auto-register a default? A hidden decision dressed as a deployment-policy reference; two conforming implementations could differ. Resolved: the `record` Decision point and the Value-constraint-definition edge case both updated to require rejection as `invalid-observation` when no constraint is declared for the supplied type. Accepting unknown types without validation would defeat the per-type integrity guarantee underwriting the regulator-audit and dispute scenarios; the spec now closes that door explicitly. Deployments add new types by first declaring constraints.
- *Store-instance selection mechanism unstated (Pass 1).* The Store-instance model defines `store_name` as identifier and notes that multiple instances coexist, but no action accepts `store_name` as a parameter and no Decision point describes how a caller's call lands on a specific instance. The cross-reference graph in GRID failed: System named the instances; no Decision or Behavior linked them to call routing. Resolved: new edge case *Store instance selection* names this as a deployment-routing concern (service binding, URL endpoint, namespace prefix) and clarifies that calls implicitly target a routed instance, that `patient_ref` is the only field portable across instances by design, and that multi-instance composition lives in a layer above this atom.
- *Invariant 7's no-partial-record claim stated unconditionally (Pass 3).* The strengthened Invariant 7 added in Round 1 said *a `storage-failure` response guarantees no partial record is observable* — without qualification. But the *`amend` two-write atomicity* edge case explicitly said implementations must provide atomicity or a crash-recovery scan; the guarantee is *joint*, not unilateral. Stated unconditionally, the invariant overclaimed. A reader could misread it as the atom enforcing atomicity by spec alone, when in reality the atom *mandates* it and the implementation *provides* it. Resolved: Invariant 7 amended to state the joint enforcement explicitly — spec mandates, implementation provides — with the two-write atomicity edge case cross-referenced and an implementation that violates the guarantee named as non-conforming.
- *Outputs field-listing used exclusive "or" where State transitions allow co-occurrence (Pass 3).* The Outputs description for `read` enumerated transition-metadata fields with "or" between successor-side fields, the original's `successor_id`, and retraction-side fields — reading as exclusive cases. But the State section allows Amended → Retracted: an observation that was first amended (originating a successor) and then retracted carries **both** `successor_id` AND retraction metadata. Similarly, a successor observation that is itself later amended carries both `predecessor_id` (from the first amend) and `successor_id` (from the second). The exclusive "or" silently misrepresented the data model. Resolved: Outputs description rewritten to enumerate the conditional fields with explicit co-occurrence rules — multiple transition-metadata fields can be set on a single observation, and which ones follow mechanically from the State transitions. The two canonical combinations (Amended-then-Retracted, successor-also-amended) are called out explicitly.
- *Citation drift in disputed-observation scenario (Pass 3).* The scenario claimed *by Invariant 2, the amendment record names the correcting clinician and the reason*. Invariant 2 is about successor creation; it says nothing about `amended_by` or `amendment_reason`. The attribution actually rests on the State definition for Amended observations (which names the successor's fields and their write-once timing) and Invariant 9 (which protects them from rewriting). The bad citation made the scenario look correct without actually following from the invariant it cited. A reader cross-checking the citation would discover the gap; a reader trusting it would have a false sense of audit-trail completeness. Resolved: citation rewritten to name the State definition and Invariant 9 explicitly; the retraction-metadata claim also cited Invariant 9 (previously uncited).
- *Rejection priority unspecified across all actions (Pass 3).* When multiple precondition violations exist on the same call — say, `amend("obs-999", amended_by: "", value: "garbage", unit: "", reason: "")`, which fails id-existence AND request-metadata AND content — the atom said nothing about which rejection fires first. Two conforming implementations could produce different rejections for the same call; a caller fixing the visible rejection might see an unrelated one on retry with no documented expectation. Resolved: new edge case *Rejection priority* specifies the order across all four actions — cheapest and most-structural checks first, persistence last — and names this as the same across conforming implementations so callers can write deterministic retry logic. The order on `amend` is: `not-known` → `already-amended`/`already-retracted` → `invalid-request` → `invalid-observation` → `storage-failure`; analogous orderings for `retract`, `record`, and `read`.
- *"System clock" vs "wall clock" wording inconsistency (Pass 3, minor).* Invariant 8 said "system clock"; the Clock-semantics edge case said "receiving node's wall clock"; the `record` Decision point also said "system clock"; the `record` Action signature said "system clock." Three different places, two different wordings for the same concept. An AI adversarial pass should catch this. Resolved: all references harmonized to "receiving node's wall clock" with the Clock-semantics edge case cross-referenced from Invariant 8, the `record` Action signature, and the `record` Decision point.

Pass 2 was clean. The amendment-chain extraction question was steelmanned one more time at maximum pressure — a parameterized "Supersession Chain" atom taking immutable-fields and correctable-fields at instantiation, applying chain logic generically — and the extraction still loses: the fields operated on are host-specific (no generic record_id, no generic patient_ref/observation_type), the immutability invariants name specific fields, and composing a generic chain over a generic Record type inverts the dependency direction. After four examinations across four rounds with the same answer, this judgment is documented as **settled**; future rounds need not re-litigate it unless new evidence — a second concrete host atom that would benefit from the same mechanic — emerges. The state-machine extraction question was also examined and similarly resolved as host-specific; once State Machine (roadmap atom #9) lands, the Composition notes will mention that this atom's state model can be specified as a Workflow instance, but the state machine remains inlined here for the same definitional reasons.

The AI-conducted round closed the gaps a sympathetic human reviewer would have rationalized past — the unconditional Invariant 7 framing, the exclusive-"or" Outputs description, the bad Invariant 2 citation, the unspecified rejection priority, the silent unknown-`observation_type` behavior. Each finding was a real semantic gap or a real precision failure; none was paraphrased-back commentary. The pattern is stronger because the AI pass had no investment in the prior choices.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 3 (linear amendment chains, no branching), Invariant 2 (amend creates successor without modifying original), and amend two-write atomicity carry ordering/sequencing load. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: Alloy structural model authored and verified; pattern promoted to `grounded`.** Derived model [`clinical-observation.als`](./clinical-observation.als) + buggy twin [`clinical-observation-buggy.als`](./clinical-observation-buggy.als), checked headless by the `org.alloytools.alloy.dist` analyzer via `tools/harness/check.mjs` (drafted by a Sonnet subagent, gated by Opus review + an independent buggy-twin run). *What it checks:* a static structural model of observation records linked by a `successor`/`predecessor` relation (both `lone` — at most one each). Twelve named `check` asserts cover the load-bearing **Invariant 3** (linear amendment chains — at most one successor, at most one predecessor, no branching via `lone (successor.x)`, no cycles via `no x | x in x.^successor`), **Invariant 2** (Amended ⇔ has-successor; successor/predecessor are strict inverses), and Invariants 4/5/6/9 (patient and obsType consistency along the chain, retraction terminal, attribution-field placement) — all UNSAT. Six `run` predicates are all satisfiable (non-vacuity), critically `ShowThreeLinkChain` (A→B→C) so the linearity check is exercised against a real multi-link chain, not a vacuously-empty one. *Buggy twin* changes the `successor` field from `lone Obs` to `set Obs` and removes the `LinearChain` fact, allowing an observation to have two successors (a branch in the amendment chain); the checker finds counterexamples on `A_Inv3_AtMostOneSuccessor` and `A_Inv2_AmendedHasSuccessor`. *Out of model scope:* amend two-write atomicity (a transition-time property; the structural model checks the resulting chain shape). *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

---

**Showcase pass — 2026-06-29 (from-scratch full-showcase conversion).** This atom had no `[Term]` annotation; this pass does the four-kind annotation **and** the showcase disciplines together, mirroring the [`duplicate-prevention.md`](./duplicate-prevention.md), [`provisional-commitment.md`](./provisional-commitment.md), and [`session.md`](./session.md) exemplars. **Annotation inventory (31 Terms):** four **Operations** ([Record], [Amend], [Retract], [Read]); fifteen **Fields** — [Observation Id], [Patient Ref], [Recorded By], [Observation Type], [Value], [Unit], [Recorded At], [State], the chain links [Predecessor Id] and [Successor Id], the amendment metadata [Amended By] and [Amendment Reason], the retraction metadata [Retracted By] and [Retraction Reason], and the store-instance [Store Name] (*Field of: Observation*, except [Store Name] which is *Field of: the store instance*); two **Parameters** consumed but not stored under their own name — [Reason] (→ [Amendment Reason] / [Retraction Reason]) and [Query] (the [Read] filter); and ten **Members** — the three states [Recorded] / [Amended] / [Retracted] (pure states, no `Projects:`) and the seven rejection reasons [Invalid Observation], [Storage Failure], [Not Known], [Already Amended], [Already Retracted], [Invalid Request], [Invalid Query]. No **Type** card — the record is referred to plainly as "an observation" (Fields are *Field of: Observation*), mirroring [`permissions.md`](./permissions.md). The discriminator *stored-as-itself → Field, consumed/transient → Parameter* placed every datum: [Value]/[Unit]/[Recorded At] are stored even though also supplied to [Record]/[Amend]; only [Reason] (written under a state-specific name) and [Query] are Parameters. Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). Survivors kept backticked: the four projected-contract signatures; the concrete Example invocations and their literal values/returns (`record(patient_ref: "p42", …) → observation_id: "obs-001"`, the `state: "Recorded"` query literals, `retracted`); and the external standard tokens in Standards references (FHIR `subject`/`performer`/`value[x]`/`issued`/`status`/`code`). **Disciplines:** Summary moved to the very top + the descriptive blockquote folded out as redundant (its claims — immutable single measurement, clinician/patient attribution, successor-on-correction, never-edited — already carried by Summary/Intent/State/Invariants) + [`prose.md`](../working-ideas/prose.md) cut #1 (Summary run-on split, lossless); cut #5 — the *Valid transitions* list rendered as a transition table (action · from · to · effect · result) with three cell-resistant semantics kept in prose beside it (amendment additive-never-destructive; chains linear and retraction terminal; [Amend]'s two-write atomicity); Lineage collapsed into this `<details>`. Cuts #2/#3 assessed and skipped (acronyms inline; provenance in Invariants/Composition notes). **Representational only** — all nine invariants and their numbers are unchanged in force, including Invariant 2's amend-produces-a-successor, Invariant 3's linear chains, Invariant 6's terminal retraction, Invariant 7's joint-enforcement durability, and Invariant 9's write-once transition metadata; every `[Term]` resolves to its card. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 4 — 2026-05-20`. Gates: linter 0 (incl. the O-term resolver — all markers resolve against the registry); the Alloy model `clinical-observation.als` and its buggy twin `clinical-observation-buggy.als` are **UNTOUCHED** and still PASS / correctly-rejected; the derived manifest projects an identifier kind (Field) and an enumerated kind (Member); `git status` shows only this `.md` modified (no `.als`); diff read line-by-line against the same-claim-or-weaker test.

</details>
