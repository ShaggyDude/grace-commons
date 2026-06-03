---
title: Legal Hold
parent: Compliance
grand_parent: Atomic Concepts
nav_order: 5
has_toc: true
toc: true
---

# Legal Hold

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

> A compliance primitive: a named, actor-issued preservation directive placed against a specific record, suspending that record's eligibility for purge regardless of any retention window clock. Each hold has an opaque immutable id; the record reference, placing actor, reason, and timestamp are immutable properties set at placement. Two states — Active, Released. A released hold is terminal; its audit record persists. Multiple concurrent holds on the same record are independent — releasing one does not affect any other.

---

## Intent

When litigation is reasonably anticipated, when a regulatory body opens an investigation, when an audit freeze is ordered, or when a breach response team needs to preserve forensic evidence, the normal retention clock stops being the governing rule. The obligation shifts from *keep this record for N years* to *keep this record until the legal matter resolves, regardless of what the retention schedule says*. That shift is a Legal Hold.

Legal Hold is the enforcement record for that shift. A compliance officer, legal counsel, or automated case management integration places a hold (a legally mandated preservation order — prevents deletion of records potentially relevant to litigation) on a record, naming who placed it, why, and under what legal authority. The record is now preserved. When the matter closes — the litigation settles, the investigation ends, the audit concludes — the hold is released. The record is again governed by its retention window. The full arc, from placement to release, is carried in the hold records themselves: every attribution field, every timestamp, every reason. The atom guarantees the chain is *present* and *immutable by specification*. Cryptographic protection of those records against post-hoc modification — the bar for court-admissible evidence in spoliation litigation (destruction or concealment of evidence relevant to a legal proceeding) — is added by composition with [Tamper Evidence](./tamper-evidence.md); this atom does not provide it alone.

The pattern is structurally distinct from [Retention Window](./retention-window.md) in a load-bearing way: Retention Window answers *how long must this record be kept under normal operation*; Legal Hold answers *this record may not be purged under any circumstances until this hold is explicitly released*. The two coexist as composing peers — a record under both a retention window and a legal hold must satisfy both: it cannot be purged before `retention_until`, and it cannot be purged while any Active hold remains. Neither atom enforces the other's constraint; the composition ([Regulated Record Retention & Defensible Deletion](../../ROADMAP.md)) wires the gate that checks both before permitting purge. This keeps each atom freestanding.

The atom records holds; it does not prevent purge directly. Preventing purge is an enforcement concern belonging to the composition that wires Legal Hold with the system's purge surface. This is deliberate: the atom specifies what a hold *is* and what its records must prove; the deployment decides which purge surfaces check for Active holds before acting. A Legal Hold atom that intercepts purge internally would need to know about storage layers, retention records, and purge mechanisms — absorbing concerns that belong to composing patterns and breaking freestanding status.

Multiple concurrent holds on the same record are structurally independent. This is not a simplification — it is the correct model for real multi-party legal situations. A record under both an internal forensic investigation hold and a state attorney general investigation hold has two independent preservation obligations. If the internal team closes its investigation and releases its hold, the AG's preservation obligation is unaffected. A system that released both holds when one was released would create spoliation risk. Each hold has its own `hold_id`, its own lifecycle, and its own release event. Whether a record is *currently held* — meaning at least one Active hold covers it — is a query result over the hold records, not a separate state on the hold.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the hold record set), its own actions (`place`, `release`, `read`), and its own invariants (hold immutability, two-state exclusivity, terminal absorption, concurrent independence, release attribution, store durability). Composing patterns add the purge gate, access control, case management integration, and cross-record batch holds.

---

## Summary

Legal Hold is a formal instruction to keep a specific record intact — overriding any normal deletion schedule — until the legal matter that triggered it is resolved. When a lawsuit is anticipated, a regulator opens an investigation, or a team needs to freeze evidence, the normal "delete after N years" rule stops applying. The hold records the shift: who issued it, against which record, why, and under what authority. A hold is either Active (preservation in effect) or Released (lifted, permanently — it cannot be reactivated), and both placing and releasing are attributed, timestamped, and never altered afterward, so the full arc of any preservation obligation can be reconstructed from the records alone. Multiple holds can cover the same record independently — a record under both an internal investigation and a government investigation has two separate obligations, and releasing one leaves the other in force, which is exactly what multi-party legal situations require. The pattern does not itself block deletion; it records that an obligation exists, and the system that actually deletes records is responsible for checking for Active holds first. This is the mechanism behind litigation-hold management, breach-response preservation, and any setting where destroying a record during an active legal obligation exposes the organization to penalties.

---

## Structure

### Store instance model

The Legal Hold atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per organization, jurisdiction, or business unit, depending on deployment topology. `hold_id` values are unique within a store instance; uniqueness across instances is a composing concern. `record_ref` is an opaque reference scoped to the host system — the same `record_ref` may be held by multiple simultaneous holds within the same store instance. Calls implicitly target a single routed instance; instance selection is a deployment-routing concern, not defined by this atom.

### Identity model

Each hold has an opaque, immutable, system-generated `hold_id` — assigned on `place`, never reused, never reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic `read` ordering. The id is the hold's identity; the record reference, placing actor, reason, and timestamps are properties of the hold, not its identity.

`record_ref` is an opaque reference to the record being held. Set on `place`, immutable. The atom does not validate that the record exists or is currently retained — `record_ref` is the caller's responsibility. Two holds over the same record have distinct `hold_id`s; each is its own audit record with its own lifecycle.

`placed_by` is an opaque reference to the actor placing the hold. Set on `place`, immutable. It is the attribution anchor for the preservation decision; empty or whitespace-only values are rejected at placement.

`case_ref` is an optional opaque reference to the legal matter, investigation, or audit under which the hold is placed (for example, a case management system identifier or a docket number). Set on `place`, immutable. Its absence is valid — holds may be placed before a formal case is opened, or the case reference system may be external. If supplied, it must contain at least one non-whitespace character.

### Inputs

- `place` calls from legal counsel, compliance officers, case management integrations, or automated preservation workflows, each carrying a record reference, placing actor, reason, optional case reference, and optional explicit timestamp.
- `release` calls documenting that the legal obligation has ended, carrying the hold id, the releasing actor, a required reason, and an optional explicit timestamp.
- `read` queries from legal teams, compliance dashboards, audit processes, and litigation support workflows.

### Actions

For optional parameters in both `place` and `release`, "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies.

- `place(record_ref, placed_by, reason, case_ref?, placed_at?) → hold_id | rejected(invalid-request | storage-failure)` — place a preservation hold on the named record. Assigns a fresh `hold_id`, records `record_ref`, `placed_by`, `hold_reason`, `case_ref` (if supplied), and `placed_at` (wall clock if not supplied; must not be in the future). The hold enters Active state. `record_ref`, `placed_by`, and `reason` must each contain at least one non-whitespace character; `case_ref`, if supplied, must also contain at least one non-whitespace character — any violation is `invalid-request`. `storage-failure` if the store write fails after all preconditions pass; no `hold_id` is issued and no record enters the store.

- `release(hold_id, released_by, reason, released_at?) → released | rejected(invalid-request | not-known | already-released | storage-failure)` — document the end of the preservation obligation and transition the hold to Released. Records `released_by`, `release_reason`, and `released_at` (wall clock if not supplied; must not be in the future — releasing a hold in the future is not meaningful); all are immutable after the transition. The `hold_id` parameter must itself contain at least one non-whitespace character (`invalid-request`); a null, empty, or whitespace-only `hold_id` is malformed and rejected before any existence check is performed. `released_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`). The resolved `released_at` — whether caller-supplied or wall-clock-defaulted — must be ≥ the hold's `placed_at`; a value less than `placed_at` is `invalid-request` regardless of how it was derived (this enforces Invariant 6 against clock-skew artifacts as well as caller-supplied backdated values). Releasing a hold on a record does not affect any other hold on the same record. `storage-failure` leaves the hold in Active state; the caller must retry.

- `read(query) → ordered_sequence_of_holds | rejected(invalid-query)` — return holds matching the query, ordered by `placed_at` ascending, then by `hold_id` ascending in lexicographic byte-order as a stable tiebreaker. Implementations must assign `hold_id` values in a format where string byte-order sort produces a total order (e.g., ULID — Universally Unique Lexicographically Sortable Identifier, UUID v7 — version 7 of the Universally Unique Identifier, which is time-ordered, or zero-padded integer string). The supported filter axes are exactly: `hold_id`, `record_ref`, `placed_by`, `case_ref`, `state`, and time ranges on `placed_at` or `released_at`. Any combination of supported axes is valid. A query supplying only a `hold_id` returns at most one hold. A well-formed query matching no holds returns an empty sequence, not a rejection. A query with no filters returns every hold in the store. A time range filter on `released_at` returns only holds that carry a `released_at` field — i.e., Released holds. Active holds carry no `released_at` field and are implicitly excluded from results whenever a `released_at` filter is present, regardless of whether a `state` filter is also supplied. A query `{released_at: {after: X}}` with no state filter returns Released holds where `released_at > X`; Active holds are not included. A query `{state: Active, released_at: {after: X}}` returns an empty sequence by the same rule. A `case_ref` filter value matches only holds where `case_ref` is set and equals the value; holds without `case_ref` are excluded by any positive `case_ref` filter (a "find holds that have no `case_ref`" predicate is not in the spec; if a deployment needs it, the composing layer adds it). The query `{record_ref: X, state: Active}` returns every Active hold covering a given record — this is the operational check for whether a record is currently held.

  **Malformed-query rules (`invalid-query`):** a `hold_id`, `record_ref`, `placed_by`, or `case_ref` filter value that is null, empty, or whitespace-only is `invalid-query` (the filter axes exist; the values are malformed). A `state` filter value that is not one of {`Active`, `Released`} is `invalid-query`. A time range with end before start is `invalid-query`. A query carrying an unrecognized filter key — any key outside the supported axes named above — is `invalid-query`; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

### Outputs

- For `place`: a fresh `hold_id`, or a rejection.
- For `release`: the outcome token `released`, or a rejection.
- For `read`: a (possibly empty) ordered sequence of holds. Each hold carries its full field set. Fields present on every hold (Active or Released): `hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, `state`. Optional field set at placement (independent of state): `case_ref` (present if supplied at `place`, absent otherwise; immutable thereafter). State-specific fields: `released_by`, `release_reason`, `released_at` are present on Released holds only. A Released hold carries all placement fields (including `case_ref` if it was supplied) and all release fields simultaneously.

### State

Each hold is in exactly one state:

- **Active** — the preservation obligation for `record_ref` is in effect. Any composition wiring this atom to a purge surface must treat an Active hold as blocking purge eligibility; the atom records the obligation but does not enforce it internally. The hold carries `hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, and `case_ref` (if supplied). May only be released (transitioning to Released) or read.
- **Released** — the preservation obligation has ended. Carries `released_by`, `release_reason`, and `released_at` (all immutable from the moment `release` completes), plus all placement fields. Terminal; no further transitions.

Valid transitions:

- `place(...)` → new hold enters Active
- Active → Released (via `release`)

No other transitions exist. A hold cannot be re-activated after release; a new preservation obligation requires a new `place` call producing a new `hold_id`.

### Flow

1. **Litigation trigger.** Counsel determines that records relating to Project Alpha are subject to litigation hold. Calls `place(record_ref: "doc-alpha-0012", placed_by: "counsel_morgan", reason: "Litigation hold — Smith v. Acme Corp., SDNY 2026-cv-4421 — all Project Alpha records", case_ref: "matter-2026-smith-acme")` → `hold_id: "hold-001"`. The hold enters Active.
2. **Second independent hold.** The state AG separately issues a preservation demand covering the same record. Compliance calls `place(record_ref: "doc-alpha-0012", placed_by: "compliance_lee", reason: "NY AG Civil Investigative Demand — Case INV-2026-0089", case_ref: "ag-inv-2026-0089")` → `hold_id: "hold-002"`. Two independent Active holds now cover the record.
3. **Internal matter closes.** Smith v. Acme Corp. settles. Counsel calls `release("hold-001", released_by: "counsel_morgan", reason: "Matter settled with prejudice — May 10 2026")` → `released`. Hold-001 is now Released. Hold-002 remains Active; the record is still held.
4. **AG investigation closes.** AG closes the investigation. `release("hold-002", released_by: "compliance_lee", reason: "NY AG CID withdrawn — May 28 2026")` → `released`. No Active holds remain on the record; the composing layer resumes normal retention governance.
5. **Audit query.** A later audit queries `read({record_ref: "doc-alpha-0012"})` and sees both holds with full placement and release attribution. The record's complete legal hold history is recoverable without recourse to external systems.

### Decision points

- **At `place`** — `record_ref`, `placed_by`, and `reason` must each contain at least one non-whitespace character; `case_ref`, if supplied, must also contain at least one non-whitespace character; `placed_at`, if supplied, must not be in the future (checked against the receiving node's wall clock). Any violation is `invalid-request`. `storage-failure` if the store write fails; no `hold_id` is issued, no record enters the store.

- **At `release`** — the `hold_id` parameter is checked first: if null, empty, or whitespace-only, the call is `invalid-request` (the caller passed garbage, not a reference to a missing hold). If `hold_id` is well-formed, the store is consulted: `not-known` if no hold with this id exists; `already-released` if the hold is in Released state. If neither, attribution and temporal checks apply: `released_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`); the resolved `released_at` — caller-supplied or wall-clock-defaulted — must not be in the future (the future-bound applies only when caller-supplied, because a wall-clock default is "now" by construction) and must be ≥ the hold's `placed_at`. The `≥ placed_at` bound applies to the resolved `released_at` regardless of how it was derived; this enforces Invariant 6 against clock-skew artifacts as well as caller-supplied backdated values. A violation is `invalid-request`. `storage-failure` leaves the hold in Active; the caller must retry. Rejection priority: malformed `hold_id` (`invalid-request`) → `not-known` → `already-released` → attribution/temporal (`invalid-request`) → `storage-failure`.

- **At `read`** — every supplied filter value must be well-formed for its axis. A `hold_id`, `record_ref`, `placed_by`, or `case_ref` filter value that is null, empty, or whitespace-only is `invalid-query`. A `state` filter value not in {`Active`, `Released`} is `invalid-query`. A time range with end before start is `invalid-query`. An unrecognized filter key — any key outside the supported axes — is `invalid-query`; the spec rejects rather than ignores unknown keys. A `released_at` filter implicitly excludes Active holds, which carry no `released_at` field, regardless of whether a `state` filter is also present. A `case_ref` filter excludes holds without `case_ref`. A well-formed query matching no holds returns an empty sequence.

### Behavior

- **Holds are durable on success.** Once `place` returns a `hold_id`, the hold is in the store and will appear in subsequent reads.
- **Hold placement is not idempotent.** Two `place` calls for the same `record_ref`, `placed_by`, and `reason` create two independent holds with distinct `hold_id`s.
- **Concurrent holds are independent.** Multiple Active holds on the same `record_ref` do not interact. Releasing hold A leaves hold B unaffected. The aggregate "is this record held?" question is answered by querying `{record_ref: X, state: Active}` and checking whether the result is non-empty; the atom does not maintain a separate aggregate state.
- **Released state is terminal and auditable.** A Released hold carries the full placement and release record. It is the audit evidence of the complete preservation arc — when the hold was placed, by whom, why, and when it was lifted. Releasing a hold does not remove its record from the store.
- **The atom does not enforce the purge gate.** Whether a held record is actually prevented from being purged is an enforcement concern of the composing layer (Retention Window + Legal Hold composition). The atom records that a preservation obligation exists; the composition enforces it at the purge surface.
- **Reads are repeatable; the hold store is monotonic.** The hold store only grows — `place` adds records, `release` transitions them. An unfiltered read at `t2 > t1` returns every hold visible at `t1` plus any added in between. State-filtered reads are not monotonic: a hold visible under `state: Active` at `t1` may appear under `state: Released` at `t2` if released in between.

### Feedback

- After `place` — a new Active hold record exists; `hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, and `case_ref` (if supplied) are set and immutable.
- After `release` — the hold is now Released; `released_by`, `release_reason`, and `released_at` are set and immutable. All placement fields are unchanged.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Hold immutability.** After a successful `place`, the fields `hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, and `case_ref` never change, regardless of any subsequent action.

- **Invariant 2 — Membership exclusivity.** Every hold known to the store is in exactly one of {Active, Released} at all times.

- **Invariant 3 — Terminal absorption.** Once a hold transitions to Released, no action transitions it further. The atom has no re-activate surface; a new preservation need requires a new `place`.

- **Invariant 4 — Concurrent holds are independent.** Releasing hold H on record R does not change the state of any other hold H′ on the same record R. The Active/Released state of each hold is determined solely by whether `release` has been called on that specific `hold_id`.

- **Invariant 5 — Release attribution is complete.** Every Released hold carries `released_by` and `release_reason` each containing at least one non-whitespace character, and a `released_at` timestamp that is set. An anonymous release, an unexplained release, a whitespace-only attribution string, or a release with no timestamp is a conformance failure — each defeats the audit trail that legal proceedings depend on.

- **Invariant 6 — Temporal ordering.** For every Released hold, `released_at ≥ placed_at`. A hold cannot be documented as released before it was placed. The constraint applies to the value persisted in the record, regardless of whether `released_at` was caller-supplied or wall-clock-defaulted; the `release` Decision point enforces this against the resolved value before the transition is committed.

- **Invariant 7 — Placement attribution is complete.** Every hold, Active or Released, carries `hold_id`, `record_ref`, `placed_by`, and `hold_reason` each containing at least one non-whitespace character, and a `placed_at` timestamp that is set. Invariant 1 guarantees these fields are immutable; this invariant guarantees they are never blank or unset. An anonymous placement, a whitespace-only reason, or a missing timestamp is a conformance failure — it defeats the chain of custody a court requires to establish when and why the preservation obligation was recognized.

- **Invariant 8 — Hold store durability.** No hold record is removed from the store. The total hold count is monotonically non-decreasing. A `hold_id` returned by a successful `place` is durably persisted; a `storage-failure` rejection guarantees no partial record was written. Released holds are retained as audit evidence; deleting a Released hold would destroy the proof that the preservation obligation was honored and lawfully lifted.

---

## Examples

### Happy path — litigation hold through release

See Flow section. A complete hold arc is walked there: placement by counsel, second independent hold by compliance, release of the first, continued preservation under the second, eventual release of the second, and a later audit query recovering the full history.

### Rejection path — release attempted twice

After hold-001 is Released, counsel's paralegal system retries: `release("hold-001", released_by: "system_retry", reason: "automated retry")` → `rejected(already-released)`. The hold record is unchanged. The paralegal system detects the rejection and suppresses the retry.

### Rejection path — place with empty reason

`place(record_ref: "doc-0099", placed_by: "compliance_chen", reason: "   ")` → `rejected(invalid-request)`. Whitespace-only reason is treated as empty. No hold is created.

### Rejection path — release with future timestamp

`release("hold-007", released_by: "counsel_kim", reason: "case closed", released_at: "2027-01-01T00:00:00Z")` → `rejected(invalid-request)`. A release documented as occurring in the future is not operationally meaningful; the atom records the present obligation, not a future intent.

---

## Regulated adversarial scenarios

### Regulator audit — HHS OCR HIPAA investigation

HHS (US Department of Health and Human Services — the federal agency that enforces HIPAA) Office for Civil Rights (OCR) opens an investigation into a reported breach of PHI (Protected Health Information — individually identifiable health data covered by HIPAA, the Health Insurance Portability and Accountability Act, the US federal law governing healthcare data privacy). It issues a preservation demand to the covered entity for all records relating to the incident. The compliance team calls `place` for each record in scope; each placement carries `case_ref: "ocr-hipaa-inv-2026-0334"`. Two months later, OCR requests the preservation record: query `read({case_ref: "ocr-hipaa-inv-2026-0334", state: Active})` returns every Active hold placed under this investigation. Every hold carries `placed_by` and `hold_reason` strings each with at least one non-whitespace character, and a `placed_at` timestamp that is set — immutable by Invariants 1 and 7. OCR confirms that preservation was initiated and that each hold is still Active. The covered entity has a documentable, auditable preservation response; no recourse to developer testimony is needed.

### Spoliation challenge — federal litigation

Opposing counsel in federal litigation argues that the defendant destroyed documents after the duty to preserve was triggered under FRCP (Federal Rules of Civil Procedure — the rules governing civil lawsuits in US federal courts) Rule 37(e). Defendant's counsel queries `read({record_ref: "doc-contract-077"})` for all holds ever placed on the disputed document. The query returns the hold placed on the record, with `placed_at: 2026-02-14` — the date the preservation obligation was recognized. The opposing party claims the document was destroyed on `2026-02-10`. The hold record shows `placed_at` postdating the destruction. If a corresponding purge record from Retention Window shows `purged_at: 2026-02-10` and no Active hold existed at that time, the records faithfully document the chronology — the hold was placed after the purge. If the document was never purged and remains in the store, the hold records confirm ongoing preservation. Either way, the court has the complete record; the atom does not manufacture a defense but it does not hide the facts either.

### Concurrent hold integrity — dual regulatory investigation

A financial institution is simultaneously under a DOJ (US Department of Justice) criminal investigation and an SEC (US Securities and Exchange Commission — the federal regulator of securities markets) civil enforcement action. Both issue preservation demands covering the same set of trading records. The compliance team places holds under both matters:

- `hold-doj-001` through `hold-doj-240`: `case_ref: "doj-crim-2026-0011"`
- `hold-sec-001` through `hold-sec-240`: `case_ref: "sec-enf-2026-0087"`

The DOJ investigation closes first. The compliance team releases all `hold-doj-*` holds. Query `read({record_ref: "trade-record-0042", state: Active})` returns `hold-sec-042` — the SEC hold remains Active. Invariant 4 guarantees that releasing the DOJ holds had no effect on the SEC holds. The institution correctly continues to preserve the records under SEC obligation. An auditor reviewing the hold records sees the full picture: two independent regulatory demands, one resolved, one active, no record destroyed while any Active hold covered it.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Hold completeness check.** For a set of `hold_id`s known to have been issued, confirm that `read({hold_id: X})` returns each of them across all states. No issued `hold_id` may be absent from the store.

2. **Placement attribution check — both states.** For every hold in the store, in any state: confirm `placed_by`, `hold_reason`, `record_ref`, and `hold_id` each contain at least one non-whitespace character, and confirm `placed_at` is set (present, not null). This applies equally to Active and Released holds — Invariant 7 covers both. A hold in either state with a blank attribution string or a missing `placed_at` is a conformance failure under Invariant 7.

3. **Release attribution check.** For every Released hold: confirm `released_by` and `release_reason` each contain at least one non-whitespace character, confirm `released_at` is set, and confirm `released_at ≥ placed_at` (Invariant 6). A Released hold with a blank attribution string, a missing `released_at`, or an inverted temporal ordering is a conformance failure under Invariants 5 and 6.

4. **Hold independence check.** Place two holds on the same `record_ref`. Release the first. Confirm that `read({hold_id: second_hold_id})` returns a hold still in Active state. Confirm that `read({record_ref: X, state: Active})` returns the second hold only. Invariant 4 guarantees independence; this check verifies it.

5. **Terminal absorption check.** Attempt `release` against a known Released hold. The call must return `rejected(already-released)`. Confirm the hold's fields are unchanged after the attempted release.

6. **Store monotonicity check.** At time `t1`, issue `read({})` (unfiltered) and record the result set S1. Place one new hold and confirm the `place` call returned a `hold_id`. At time `t2 > t1`, issue `read({})` again and record result set S2. Confirm every hold in S1 appears in S2 by `hold_id` (no hold is removed). For each hold present in both S1 and S2, confirm the placement fields (`hold_id`, `record_ref`, `placed_by`, `hold_reason`, `placed_at`, and `case_ref` if it was set in S1) are unchanged in S2 — placement fields are immutable per Invariant 1. Release fields (`released_by`, `release_reason`, `released_at`) may newly appear on holds released between t1 and t2; their appearance is conformant with the state machine and is **not** a monotonicity violation. The state of any hold present in both sets may legitimately have transitioned from Active to Released; the reverse transition is a conformance failure. The total hold count in S2 is ≥ the count in S1. Confirms the behavioral guarantee that the hold store is monotonically non-decreasing and that placement fields are immutable, while distinguishing the legitimate Active→Released transition from a violation.

---

## Edge cases and explicit non-goals

- **Hold placed after record is purged.** The atom does not prevent placing a hold on a `record_ref` for which the underlying record has already been destroyed. The hold is created successfully; the `record_ref` is an opaque value the atom does not validate against the storage layer. The hold record faithfully documents that a preservation obligation was recognized after the fact. Legal counsel and the court assess the spoliative implications — the atom records the truth, it does not adjudicate it. Whether post-purge hold placement triggers any remediation is a composing-layer and legal concern.

- **Multiple concurrent holds and aggregate held status.** A record with N Active holds requires N `release` calls to fully lift all holds. The atom has no `release_all` action — bulk release of all holds covering a record is a composing-layer operation that calls `place` and `release` appropriately. The aggregate "is this record currently held?" question is answered by `read({record_ref: X, state: Active})` returning a non-empty sequence; if the sequence is empty, no Active holds cover the record.

- **`place` is not idempotent.** A prescriber system that retries after a network timeout creates a duplicate hold if the first call succeeded. For at-most-once semantics on hold placement, compose with [Duplicate Prevention](../temporal/duplicate-prevention.md).

- **Hold on a record that does not exist in the retention system.** `record_ref` is opaque; the atom does not validate it against a retention store, a document management system, or any other external system. Placing a hold on a non-existent or misspelled `record_ref` creates a hold record. The hold is real from this atom's perspective; the record it names may not be. The composing system is responsible for ensuring `record_ref` values are valid. For high-stakes litigation holds, a validation step against the retention store belongs in the composing workflow.

- **Case reference without a formal case.** `case_ref` is optional precisely because preservation obligations arise before formal litigation is filed — when litigation is "reasonably anticipated" under FRCP, when a regulatory inquiry is received informally, or when an internal investigation is underway without a docket number. Holds without `case_ref` are valid; `hold_reason` carries the narrative explanation. No amendment mechanism exists; the immutability of `case_ref` after placement is load-bearing for legal proceedings. When a formal case reference later attaches to a hold that was placed without one, the correct workflow is to **place a new, independent hold** carrying the `case_ref`, leaving the original hold Active for as long as its underlying preservation obligation persists. The original is **not** released merely to re-catalog under a case reference — releasing it would write `released_at`, `released_by`, and `release_reason` for an obligation that has not actually ended, poisoning the audit trail with a release event that an external evaluator could reasonably read as suspicious record manipulation. Invariant 4 (concurrent holds are independent) makes both holds preserve the record in parallel; the new hold's `hold_reason` can narrate the relationship to the original. The original is released only when its preservation obligation genuinely ends.

- **Purge gate enforcement.** Whether a record covered by an Active hold is actually prevented from being purged is not enforced by this atom. This is deliberately outside scope: enforcement requires the purge surface to check for Active holds, which requires integrating Legal Hold with the storage or retention layer. That integration is the [Regulated Record Retention & Defensible Deletion](../../ROADMAP.md) composition (Legal Hold + Retention Window + Audit Trail). Deployments that query hold records as an advisory check without wiring the gate are non-conforming to the composition's invariants but conforming to this atom's invariants.

- **Access control.** Who may place holds, who may release them, and who may read them is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In many deployments, hold placement is restricted to legal counsel or designated compliance officers; unauthorized placement or release of holds is a serious process failure that Permissions governs.

- **Case management and legal matter lifecycle.** Tracking the legal matter itself — parties, counsel, status, court, settlement terms, matter type — is out of scope. `case_ref` is an opaque pointer into an external case management system. This atom makes no claims about what that system contains.

- **Batch holds across multiple records.** One `place` call creates one hold on one `record_ref`. Bulk holds (all records matching a query, all records in a folder, all records within a date range) are a composing-layer operation. The composing layer iterates the matching records and calls `place` for each; the resulting holds are individually releasable. Atomic batch placement — where all records in a batch are held or none are — requires a transaction wrapper in the composing layer.

- **Retention Window interaction.** Legal Hold and Retention Window are composing peers. This atom does not import Retention Window semantics; it records preservation obligations. The composition that enforces the purge gate must check both: no purge before `retention_until`, and no purge while any Active hold covers the record.

- **Tamper-evidence.** The atom guarantees immutability by specification; it does not cryptographically prevent a store administrator from altering hold records. For court-admissible evidence of record preservation, compose with [Tamper Evidence](./tamper-evidence.md), which provides cryptographic sealing of the hold records. Tamper-evident hold records are required under several regulatory regimes (SEC Rule 17a-4, 21 CFR (Code of Federal Regulations) Part 11 in regulated clinical contexts).

- **Clock semantics.** `placed_at` and `released_at` default to the receiving node's wall clock when not supplied. `placed_at` must not be in the future — a hold cannot logically be placed in the future. Back-dated `placed_at` values are accepted; documenting a preservation obligation recognized late is valid and often necessary. Courts scrutinize backdated hold timestamps in spoliation disputes, but the atom records what the caller supplies without interpretation; legal counsel owns the evidentiary consequences. `released_at` must not be in the future and must be ≥ `placed_at` (enforced at the `release` Decision point). Back-dated `released_at` values are accepted — documenting a release that was communicated or recognized at an earlier time is valid. Clock skew, timezone normalization, and monotonicity are deployment concerns.

- **Concurrency.** Two systems concurrently calling `release` on the same `hold_id` must be serialized. The first succeeds; the second receives `already-released`. Implementations must serialize state transitions on a given `hold_id`.

---

## Composition notes

Legal Hold is the preservation primitive the library has held open since Retention Window was grounded. Every atom in `atoms/compliance/` and every atom in `atoms/healthcare/` ultimately composes with it when records must be preserved against destruction:

- **[Retention Window](./retention-window.md)** — the primary composing peer. Legal Hold overrides Retention Window's purge eligibility: while any Active hold covers a record, `purge` must be rejected regardless of whether `retention_until` has elapsed. Neither atom enforces the other's constraint; the gate belongs to the **[Defensible Retention](../../compositions/defensible-retention.md)** composition.
- **[Audit Trail](../../compositions/audit-trail.md)** — every `place` and `release` event is an auditable action; Audit Trail provides the tamper-evident, attributed, retention-governed record of every hold lifecycle event.
- **[Tamper Evidence](./tamper-evidence.md)** — seals hold records against post-hoc modification. Court-admissible hold records require cryptographic integrity guarantees beyond this atom's spec-level immutability.
- **[Actor Identity](./actor-identity.md)** — `placed_by` and `released_by` are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors who authorized their respective actions. In regulated contexts (SOX — the Sarbanes-Oxley Act, US law on corporate financial reporting and records integrity; 21 CFR Part 11), hold placement is an electronic record requiring verifiable authorship.
- **[Permissions](./permissions.md)** — governs who may place, release, or read holds. Legal hold placement is a privileged action in every regulated deployment.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for at-most-once semantics on hold placement under retry conditions.
- **[Medication Order](../healthcare/medication-order.md)** — in healthcare, an active investigation or litigation hold may cover medication order records and their associated clinical observations. Legal Hold composes directly with any record-producing atom when that record's destruction must be suspended.
- **[Clinical Observation](../healthcare/clinical-observation.md)** — same as Medication Order; clinical observations under malpractice litigation or HHS investigation are subject to legal hold.
- **[Defensible Retention](../../compositions/defensible-retention.md)** — Legal Hold + Retention Window + Audit Trail, wired to enforce the purge gate. **Forthcoming:** Data Subject Rights Fulfillment (C6) — Legal Hold surfaces as the reason an erasure request may be declined.

---

## Standards references

- **Federal Rules of Civil Procedure Rule 37(e)** — the primary U.S. federal standard for electronic discovery preservation. A party must take reasonable steps to preserve ESI (Electronically Stored Information — digital records subject to legal discovery) once litigation is reasonably anticipated; failure to preserve when an Active hold should have been in place exposes the party to sanctions including adverse inference instructions. The `placed_at` timestamp and `hold_reason` field are the record of when and why the preservation obligation was recognized.
- **Federal Rules of Civil Procedure Rule 26(b)** — proportionality doctrine for discovery preservation; not all records must be held, only those reasonably expected to be relevant. `hold_reason` and `case_ref` are the scoping fields that document proportionality.
- **Sedona Conference Principles (3rd ed.)** — the leading authoritative guidance on electronic discovery preservation obligations. Principle 5: a party is not required to preserve every document; preservation must be proportionate. Principle 6: a party should consider adoption of a litigation hold policy. The `hold_reason` field is the policy documentation surface.
- **SOX §802 (18 U.S.C. §1519)** — criminal obstruction-of-justice provision for destruction of documents subject to federal investigation or proceedings. An Active Legal Hold covering the relevant records is the structural defense against §802 exposure.
- **SEC Rule 17a-4(f)** — requires broker-dealers to preserve records in non-rewriteable, non-erasable format, accessible to regulators on demand. Legal Hold composes with Tamper Evidence to meet this standard; the hold record itself is a regulated record under 17a-4.
- **HIPAA §164.530(j)** — documentation retention requirements; HHS investigations trigger preservation obligations over the PHI and administrative records involved. Legal Hold is the preservation mechanism.
- **HIPAA Breach Notification Rule (45 CFR §164.400–414)** — breach investigations generate preservation obligations over the records relating to the incident. `case_ref` references the OCR investigation case identifier.
- **GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Article 17(3)(e)** — erasure right (right to be forgotten) does not apply when processing is necessary for the establishment, exercise, or defence of legal claims. An Active Legal Hold is the operational record that establishes the legal-claim exception to erasure. See Data Subject Rights Fulfillment composition (C6).
- **21 CFR Part 11** — electronic records and signatures in FDA-regulated contexts. Preservation holds on regulated records (clinical trial data, manufacturing batch records) must be attributable and non-alterable. Composes with Actor Identity and Tamper Evidence.
- **E-SIGN Act (Electronic Signatures in Global and National Commerce Act) / UETA (Uniform Electronic Transactions Act)** — electronic hold records carry the same legal force as paper hold notices where these acts apply.
- **ISO 15489-1 (Records management)** — the International Organization for Standardization's standard for records-management practice; hold is the operational mechanism for Section 9.7 (suspension of disposition). The two-state (Active/Released) model maps directly to ISO 15489's hold lifecycle.

---

## Status

`grounded — 2026-05-20` — foundation round (Pass 1 + 2 + 3 author-led), Refinement round 1 (human), and two AI-conducted adversarial rounds complete: Refinement round 2 (Sonnet, batched with Consent and Soft Delete) and Refinement round 3 (Opus single-atom, Torvalds X2 posture). All nine GRID (the nine-node structural-completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof) nodes resolved; all concerns conceptually independent; all surfaced adversarial gaps closed in-pattern or named as explicit out-of-scope.

---

## Lineage notes

Regulated atom. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)), baked in from the first draft. Retention Window and Actor Identity are the reference shapes for regulated compliance atoms.

**Pass 1 — Structural completeness (GRID).** Three findings, all closed in-pattern.

- *Store instance model absent.* Initial draft referenced "the store" without defining instance topology. Parallel finding to Medication Order and every other atom that composes against a store. Fixed: *Store instance model* subsection added, mirroring Retention Window. `hold_id` uniqueness scoped to instance; `record_ref` noted as globally scoped; instance selection named as deployment-routing concern.

- *Outputs section under-specified.* Initial draft listed only `hold_id` and `released` without enumerating which fields are present on which state of hold record. Fixed: Outputs now explicitly names core fields present on every hold and state-specific fields (release fields present only on Released holds), parallel to Medication Order's cumulative field listing.

- *`read` ordering and filter semantics not defined.* The `read` action had no stated ordering, no specification of what constitutes a well-formed vs. malformed query, and no statement of what happens on an empty result. Fixed: `read` action description updated to specify `placed_at` ascending ordering, enumerate valid filter axes, name `invalid-query` conditions, and state that a well-formed query matching no holds returns an empty sequence.

All nine GRID nodes resolved.

**Pass 2 — Conceptual independence (EOS).** Clean. Three extraction candidates evaluated; all kept in-pattern.

- *`case_ref` as over-absorption candidate.* Could `case_ref` imply that case management belongs in-atom? Evaluated: `case_ref` is an opaque advisory reference — the atom does not interpret it, does not import case management lifecycle semantics, and does not name any case management pattern in its specification. Parallel to `clinical_evidence_ref` in Medication Order. The atom records that a hold is associated with a case; it does not model the case. Clean.

- *Two-state machine as over-simplification hiding a richer lifecycle.* Could Legal Hold have intermediate states — e.g., *Pending* (hold requested, not yet confirmed), *Disputed* (opposing party contests the hold scope), *Suspended* (hold temporarily narrowed)? Evaluated: these are workflow-layer concerns. A Pending state would require an approval surface, which belongs to Approval Step (roadmap atom #4). A Disputed state would require legal adjudication tracking, which belongs to a case management composing pattern. A Suspended state would require a second reversibility mechanism identical to hold mechanics — a hold on the hold. None of these is freestanding relative to Legal Hold; each imports concerns from other atoms or the composing layer. The two-state machine (Active → Released) is correct EOS design for this atom. Extraction is not warranted.

- *Hold independence invariant as a hidden composition rule.* Could "concurrent holds are independent" mean that the atom is secretly composing two or more holds into an aggregate held state? Evaluated: no. Each hold is its own record with its own lifecycle. Independence is a constraint on the atom's behavior (releasing hold H does not affect hold H′), not a composition. The aggregate held query `{record_ref: X, state: Active}` is a read operation on the hold set, not a separate state. Clean.

**Refinement round 1 — 2026-05-13.** Six findings across the three passes, all closed in-pattern.

- *`read` ordering tiebreaker absent.* Batch `place` calls occurring in the same instant produce holds with identical `placed_at` values; ordering between them was non-deterministic. An audit tool issuing the same query at two different times could receive results in different order, breaking deterministic replay. Fixed: `read` action now specifies `placed_at` ascending, then `hold_id` ascending as a stable tiebreaker.

- *`release` did not enforce `released_at ≥ placed_at` at the action level.* Invariant 6 claimed the ordering bound but the Decision point only checked that `released_at` is not in the future — a caller supplying a backdated `released_at` earlier than `placed_at` could write an incoherent Released hold. Fixed: Decision point updated to require `released_at ≥ placed_at`; `invalid-request` if violated. Clock semantics edge case updated to explicitly state backdated `released_at` is accepted (no lower bound beyond `placed_at`).

- *`released_at` time range filter on `state: Active` queries was unaddressed.* A well-formed query `{state: Active, released_at: {after: X}}` was ambiguous — it could be read as `invalid-query` or as an empty result. The general rule (well-formed query matching no holds → empty sequence) applied, but the specific case of filtering on a field that Active holds don't carry was not called out. Fixed: `read` action now explicitly states this case returns an empty sequence.

- *Flow step 4 stated composing-layer semantics.* "The record returns to normal retention governance" is a claim about what Retention Window and the purge gate do — not what this atom does. The atom only knows that no Active holds remain. Fixed: tightened to "the composing layer resumes normal retention governance."

- *Non-idempotency cross-reference to Duplicate Prevention in Behavior section.* The Behavior bullet named Duplicate Prevention inline; per CLAUDE.md conventions, cross-atom references belong in Edge cases, not the spec's Behavior section. The same reference already existed in the Edge cases section. Fixed: removed the cross-reference from the Behavior bullet; Edge cases coverage is complete.

**Pass 3 — Adversarial scrutiny (Linus mode) — foundation round.** Six findings, all closed in-pattern.

- *Hold placed after record purged — spec was silent.* The initial draft said nothing about `place` against a `record_ref` whose underlying record has already been destroyed. A reader could assume the atom validates `record_ref` against the retention store (it does not) or that such a hold is rejected (it is not). This is a real and consequential scenario in spoliation litigation — placing a hold after destruction does not undo the destruction, and hiding this from the spec would be dishonest. Fixed: Edge case *Hold placed after record is purged* added, explicitly stating that the hold is created, `record_ref` is not validated against the storage layer, and legal counsel assesses the spoliative implications. The atom records the truth; it does not adjudicate.

- *`release` of a hold on a record with other Active holds — consequence not stated.* The initial draft said nothing about what happens to sibling holds. Invariant 4 covered independence but the action description did not explicitly state it. A reader of the `release` action alone would not know whether releasing a hold affects others. Fixed: `release` action description updated — "Releasing a hold on a record does not affect any other hold on the same record."

- *`released_at` future-timestamp restriction not specified.* `placed_at` future restriction was stated (parallel to `ordered_at` in Medication Order), but `released_at` was silent. A release documented as occurring in the future is not operationally meaningful and could create misleading audit records. Fixed: `release` action description and Decision point updated to state `released_at`, if supplied, must not be in the future.

- *Temporal ordering between `placed_at` and `released_at` not guaranteed by any invariant.* A Released hold with `released_at < placed_at` violates basic temporal coherence and would produce a nonsensical audit record. No invariant named this. Fixed: Invariant 6 added — "For every Released hold, `released_at ≥ placed_at`." Generation acceptance check 3 verifies it.

- *Purge gate enforcement presented ambiguously.* The initial draft implied the atom enforces the purge gate ("the record may not be purged while this hold is Active"). This is accurate as an obligation but misleading as an implementation claim — the atom records the obligation; the composition enforces it. An implementor reading the spec could incorrectly conclude the atom itself intercepts purge calls. Fixed: Behavior section updated — "The atom does not enforce the purge gate" — with explicit rationale; Intent extended to explain why enforcement belongs to the composition. Edge case *Purge gate enforcement* added naming the conformance distinction.

- *`place` non-idempotency not stated.* Same class of finding as `order` in Medication Order and `place_under_retention` in Retention Window. A legal system that retries `place` after a network timeout creates a duplicate hold; both are Active against the record. Fixed: Edge case *`place` is not idempotent* added, pointing to Duplicate Prevention for at-most-once semantics.

**Refinement round 2 — AI-conducted adversarial round (Sonnet, batched with Consent and Soft Delete).** Surfaced no findings beyond those already closed in Refinement round 1. Recorded as a clean round for reproducibility per the methodology requirement that AI rounds be named and dated; the batched-attention caveat motivated the subsequent single-atom Opus round documented below.

**Refinement round 3 — AI-conducted adversarial round (Opus single-atom, Torvalds X2 posture) — 2026-05-13.** Reviewer: Claude Opus, low-patience adversarial posture, full pass-question set from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) applied, no recourse to prior rationales. Thirteen findings surfaced, all closed in-pattern. The pass exposed two classes of defect the cooperative rounds and the batched Sonnet round missed: (a) fixes from Refinement round 1 that carried their own gaps — the `released_at ≥ placed_at` enforcement applied only to caller-supplied values, leaving the wall-clock-defaulted case unenforced — and (b) terminological and categorization drift that quietly contradicts the spec's own validation rules.

- *Invariant 6 enforcement gap on defaulted `released_at`.* Refinement round 1 added the `released_at ≥ placed_at` Decision-point check but qualified it with *"if supplied."* A wall-clock-defaulted `released_at` on a clock-skewed node could yield a value < `placed_at`, writing a Released hold that violates Invariant 6 while the action accepts it. Fixed: `release` action description and Decision point now require the bound be enforced against the **resolved** `released_at`, regardless of whether it was caller-supplied or defaulted. Invariant 6 statement extended to note that the constraint applies to the persisted value and that enforcement is at the Decision point against the resolved value.

- *"Non-empty" terminology inconsistent with the validation rule.* Invariants 5 and 7 said "non-empty"; Decision points and action signatures rejected whitespace-only strings under "at least one non-whitespace character." An implementer reading the invariants alone would have accepted whitespace-only attribution strings. Fixed: invariants 5 and 7 rewritten to say "at least one non-whitespace character" explicitly, matching the Decision points.

- *Type confusion — "non-empty" applied to timestamps.* The same invariants listed `released_at` and `placed_at` among "non-empty" fields. Timestamps are not strings. Fixed: invariants split by field type — strings require "at least one non-whitespace character"; timestamps require "set."

- *Intent overclaimed verifiability without naming Tamper Evidence.* The Intent paragraph asserted *"verify from the records alone"* without qualifying that cryptographic protection against post-hoc modification is provided by Tamper Evidence composition. The Edge case *"Tamper-evidence"* contradicted the Intent. Fixed: Intent paragraph rewritten to claim only that the chain is present in the records and immutable by specification, and to name Tamper Evidence as the composition that adds cryptographic protection for court-admissible evidence.

- *Status mis-categorized as `unresolved`.* Per [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md), patterns that have completed human refinement but not the AI round declare `partially resolved`; `unresolved` is the label for "nothing done." Fixed: with this Opus round complete and all findings closed, Status advances to `grounded — 2026-05-13` per the same methodology section.

- *AI adversarial round (Sonnet) not recorded in Lineage notes.* The methodology requires AI rounds be recorded as such, named with the model, for reproducibility. The prior Sonnet round was named only in Status. Fixed: Refinement round 2 entry added above, recording the Sonnet round as a clean AI round and naming the batched-attention caveat that motivated the Opus follow-up.

- *`case_ref` mis-categorized as a "state-specific" field in Outputs.* `case_ref` is optional and independent of state — present on Active or Released holds if supplied at placement. Grouping it with `released_*` fields under "state-specific" misrepresented the field's nature. Fixed: Outputs separates "optional fields set at placement" (`case_ref`) from "state-specific fields" (the release fields), and notes that Released holds carry placement fields including `case_ref` if it was supplied.

- *Misleading "amendment" advice poisoned the audit trail.* The Edge case *"Case reference without a formal case"* advised that `case_ref` is "added retroactively by placing a new hold with the case reference and releasing the original." Releasing the original writes `released_at`, `released_by`, `release_reason` for an obligation that has not ended — an audit signal an external evaluator could reasonably read as suspicious record manipulation. Fixed: edge case rewritten. The correct workflow is to place a new independent hold with the `case_ref` and leave the original Active for as long as its preservation obligation persists; Invariant 4 makes both holds preserve in parallel. The original is released only when its preservation obligation genuinely ends.

- *`release` Decision point silent on malformed `hold_id`.* A null, empty, or whitespace-only `hold_id` parameter would have fallen into `not-known` (no hold has that id), telling the caller the wrong thing. Fixed: `release` action and Decision point now check `hold_id` syntactic validity first; a malformed `hold_id` is `invalid-request` with priority over the existence check. Rejection priority list updated.

- *Generation acceptance check 6 — "identical field values" assertion was over-strong.* The check asserted that every hold in S1 (the unfiltered read at t1) appears in S2 (at t2) with identical field values. A legitimate `release` between t1 and t2 would add release fields to a hold present in both sets, failing the check on a conforming system. Fixed: check 6 rewritten. The placement fields must be unchanged (Invariant 1); release fields may newly appear on holds released in the interval (legitimate state machine transition); the count in S2 is ≥ S1. The reverse transition (Released → Active) is named as the actual conformance violation.

- *"Supplied" semantics undefined for optional parameters.* `placed_at?` and `released_at?` said "wall clock if not supplied" but did not say what counts as "not supplied" — absent, null, empty all plausible. Fixed: a definition statement added before the action list. For optional parameters, "supplied" means provided as a parseable value of the declared type; null, missing, and empty (or whitespace-only) values are equivalent to "not supplied" and the default applies.

- *`read` Decision point ambiguous on null/empty filter parameters.* The original wording — *"a syntactically invalid `hold_id` (non-null, non-empty)"* — left a reader unable to tell whether null or empty filter values were rejected or accepted as degenerate filters. Fixed: `read` action and Decision point now state explicitly that null, empty, or whitespace-only filter values on `hold_id`, `record_ref`, `placed_by`, and `case_ref` are `invalid-query`. Strict over silent — silent-ignore would return a result set inconsistent with the caller's intent.

- *Unknown filter keys in `read` not specified, and `case_ref` filter on absent-case_ref holds not specified.* The spec listed supported filter axes but did not say what happened if a caller passed an unknown axis name, or how a positive `case_ref` filter handled holds without `case_ref`. Fixed: `read` action and Decision point now reject unknown filter keys as `invalid-query` (strict rather than silent-ignore) and state that a positive `case_ref` filter excludes holds without `case_ref`. A "find holds with no `case_ref`" predicate is named as out-of-scope; deployments needing it add it in the composing layer.

**Scheduled rescan: 2026-05-20 — clean.**
