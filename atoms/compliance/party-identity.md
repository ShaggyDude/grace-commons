---
title: Party Identity
parent: Compliance
grand_parent: Atoms
nav_order: 8
has_toc: true
toc: true
---

# Party Identity

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A compliance primitive: a persistent, verifiable identity record for an external party — customer, patient, counterparty, beneficial owner — with a verification lifecycle distinct from Actor Identity. Where Actor Identity models an internal actor's ability to sign actions with credentials, Party Identity models an external party's verified existence and identity attributes, which may be re-verified, suspended, or closed as circumstances change. States: Unverified, Verified, Suspended, Closed. The load-bearing contribution: a verified Party Identity record is the precondition any composing system (KYC onboarding, clinical enrollment, counterparty risk management) may declare before proceeding to regulated activity with a named party.

---

## Intent

Every regulated system that interacts with external parties — banks onboarding customers, hospitals enrolling patients, broker-dealers establishing counterparties, employers verifying staff — must establish *who* the party is before regulated activity begins, and must maintain that identity record through the party's full lifecycle. The shape is constant across domains: identity attributes are collected, verified against external evidence (government-issued document, biometric check, reference database), the party transitions to a verified state, and subsequent regulated activity can rely on the verified record. When circumstances change — a sanctions match emerges, a document expires, a legal investigation begins — the party can be suspended, re-verified, and either reinstated or permanently closed.

The compliance framing is consistent across regulatory regimes. FATF Recommendations 10–12 require Customer Due Diligence (CDD) before establishing a business relationship: collect identity attributes, verify identity using reliable independent sources, understand ownership and control structures, and conduct ongoing due diligence. The BSA/AML Customer Identification Program (31 CFR Part 1020) specifies minimum identity attributes and requires record retention for at least five years after the business relationship ends. GDPR Article 4(1) defines the identity attributes collected here as personal data, subject to Articles 5–6 lawful-basis requirements. HIPAA requires patient identity be established before clinical records are created. The domain varies; the structural obligation is the same.

Party Identity is distinct from Actor Identity, and the distinction is not cosmetic. Actor Identity models *internal actors who authorize system actions* — an employee, service account, or credentialed operator producing a cryptographic proof that binds their identity to a specific action. Party Identity models *external parties whose regulated identity must be established* — a customer, patient, or counterparty who is the *subject* of the system's activity rather than its *operator*. An actor signs; a party is verified. The two atoms model different obligations, carry different state machines, and compose when the same natural person is both a verified external party and a credentialed internal actor (common in employee-onboarding, professional-licensing, and counterparty scenarios where the party is also given system access). The composition is explicit; the atoms remain freestanding.

This is a freestanding atom in the EOS sense. It has its own state machine (Unverified → Verified via successful verification; Verified → Suspended via suspend; Suspended → Verified via reinstate; any non-Closed state → Closed via close), its own actions (`enroll`, `verify`, `suspend`, `reinstate`, `close`), and its own invariants (party records are never deleted; verification events are immutable and append-only; Closed is absorbing; Verified requires a passed verification). It does not implement the verification workflow, the document check, the sanctions screen, the ongoing monitoring schedule, risk scoring, or enhanced due diligence. Each is a composing pattern. See Composition notes.

---

## Structure

### Identity model

Every party known to the system has a **`party_id`** — an opaque, immutable, system-generated identifier produced by `enroll`. The id is the party's identity; all other fields (name, date of birth, document type, document reference) are immutable *properties* set at enrollment, not the identity itself.

This matters because an external party's legal name, document number, or address may change — through legal name change, document renewal, address update — without the party ceasing to be *the same party*. Using a content field like name or document number as identity would collapse legitimate attribute evolution with distinct-party disambiguation. Opaque ids preserve the one-party-one-id discipline that makes lifelong identity chain-of-custody tractable and lets the composing KYC composition link all activity — past and future — to a single durable reference.

Each call to `verify` produces a **`verification_id`** — opaque, immutable, system-generated — associated with the party. Verification events are separate records, append-only; the current state reflects the outcome of the most recent successful verification, but all past events are preserved as the chain-of-custody for the party's verification history.

Each state-change event produced by `suspend`, `reinstate`, `close`, or a `verify`-driven Unverified → Verified transition has a **`state_change_id`** — opaque, immutable, system-generated — so that composing patterns (Actor Identity attestations, Audit Trail entries) can reference a specific suspension, reinstatement, or closure event by id rather than by timestamp or position in the log. State-change events accumulate on the party record as a time-ordered, append-only log; they are sub-records of the party, not independently stored record types, but each is individually addressable by its `state_change_id`.

Two enrollments for the same natural person produce two records with two distinct `party_id` values. The atom does not deduplicate; deduplication is the composing system's responsibility. See Edge cases.

### Inputs and Outputs

- A legal name identifying the party at enrollment. Non-empty, non-whitespace-only. Maximum 500 characters. The atom stores the name as supplied; Unicode normalization, case folding, and transliteration are deployment policy.
- A date of birth expressed as an ISO 8601 date (`YYYY-MM-DD`). Must parse as a valid calendar date; must not be in the future.
- A document type identifying the class of identity document presented (`passport`, `national-id`, `drivers-license`, or similar). Non-empty. The atom treats this as an opaque string; which values are valid for which regulatory regime is the composing system's concern.
- A document reference — an opaque pointer to the identity document record in the composing identity-document store. Non-empty. The atom does not validate the reference against the document store.
- An enrolling actor reference — an opaque pointer to the internal actor performing enrollment. Non-empty. Attribution only; verification and non-repudiation of the enrollment action compose with Actor Identity.
- Actions:
  - `enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref) → party_id | rejected(invalid-request | storage-failure)`
  - `verify(party_id, verifying_actor_ref, verification_method, verification_result, evidence_ref) → verification_id | rejected(not-known | already-closed | invalid-request | storage-failure)`
  - `suspend(party_id, suspending_actor_ref, reason) → ok | rejected(not-known | not-verifiable | already-suspended | already-closed | invalid-request | storage-failure)`
  - `reinstate(party_id, reinstating_actor_ref, reason) → ok | rejected(not-known | not-suspended | already-closed | invalid-request | storage-failure)`
  - `close(party_id, closing_actor_ref, reason) → ok | rejected(not-known | already-closed | invalid-request | storage-failure)`
- An implicit clock providing wall-time timestamps.

**On `verify`:** `verification_result` must be exactly `passed` or `failed`; any other value is `invalid-request`. `verification_method` is an opaque non-empty string naming the method used (`manual-document-review`, `automated-ocr`, `biometric-match`, `database-check`, etc.). `evidence_ref` is an opaque non-empty pointer to the verification evidence record. All three fields are required; any empty or missing field is `invalid-request`.

**On `suspend`, `reinstate`, `close`:** `reason` is required; non-empty; maximum 2000 characters; stored as supplied, no normalization. `*_actor_ref` fields are opaque non-empty references.

**Outputs** — the current set of party records; for each party: `party_id`, `name`, `date_of_birth`, `document_type`, `document_ref`, `enrolled_at`, `enrolling_actor_ref`, current state, state-change log, and the full ordered list of verification events. For each verification event: `verification_id`, `party_id`, `verifying_actor_ref`, `verification_method`, `verification_result`, `evidence_ref`, `verified_at`. Action returns: `party_id` from `enroll`; `verification_id` from `verify`; `ok` from `suspend`, `reinstate`, `close`.

### State

A party, once enrolled, occupies exactly one of four states:

- **Unverified** — enrolled but no successful verification has been recorded (or all verifications so far returned `failed`). Entry state for every newly enrolled party.
- **Verified** — at least one `verify(verification_result=passed)` call has been recorded and no subsequent `suspend` or `close` has occurred.
- **Suspended** — previously Verified; activity suspended pending investigation, re-verification, or a regulatory preservation order. Verification events may continue to be recorded during Suspended; the state does not change to Verified until `reinstate` is called.
- **Closed** — terminal. The party record persists; the party may not be the subject of new regulated activity. `verify`, `suspend`, and `reinstate` are rejected for Closed parties.

Each party record carries:

- **`party_id`** — opaque, immutable, system-generated. Set on `enroll`. Never changes.
- **`name`** — set on `enroll`. Never changes.
- **`date_of_birth`** — set on `enroll`. Never changes.
- **`document_type`** — set on `enroll`. Never changes.
- **`document_ref`** — set on `enroll`. Never changes.
- **`enrolled_at`** — wall-time of enrollment. Set on `enroll`. Never changes.
- **`enrolling_actor_ref`** — set on `enroll`. Never changes.
- **current state** — one of {Unverified, Verified, Suspended, Closed}. Changes on `verify(passed)`, `suspend`, `reinstate`, `close`.
- **state-change log** — ordered, append-only list of state-change events. Each carries: `state_change_id` (opaque, immutable, system-generated), prior state, new state, acting actor ref, timestamp, and reason. Reason is present for `suspend`-, `reinstate`-, and `close`-driven transitions; absent for `verify`-driven Unverified → Verified transitions (the `verify` action carries no `reason` field).

Transitions:

- `enroll(...)` → party created in **Unverified** with fresh `party_id` and `enrolled_at = now`.
- `verify(party_id, ..., verification_result=passed)` when Unverified → **Verified**; new verification event appended.
- `verify(party_id, ..., verification_result=failed)` when Unverified → remains **Unverified**; new verification event appended with `failed` result.
- `verify(party_id, ..., verification_result=passed)` when Verified → remains **Verified** (re-verification); new verification event appended.
- `verify(party_id, ..., verification_result=failed)` when Verified → remains **Verified**; new verification event appended with `failed` result.
- `verify(party_id, ..., *)` when Suspended → remains **Suspended**; new verification event appended.
- `verify(party_id, ..., *)` when Closed → `rejected(already-closed)`.
- `suspend(party_id, ...)` when Verified → **Suspended**; state-change event appended.
- `suspend(party_id, ...)` when Unverified → `rejected(not-verifiable)`.
- `suspend(party_id, ...)` when Suspended → `rejected(already-suspended)`.
- `suspend(party_id, ...)` when Closed → `rejected(already-closed)`.
- `reinstate(party_id, ...)` when Suspended → **Verified**; state-change event appended.
- `reinstate(party_id, ...)` when Unverified or Verified → `rejected(not-suspended)`.
- `reinstate(party_id, ...)` when Closed → `rejected(already-closed)`.
- `close(party_id, ...)` when not Closed → **Closed**; state-change event appended.
- `close(party_id, ...)` when Closed → `rejected(already-closed)`.

### Flow

**Standard onboarding — happy path:**

1. An onboarding officer calls `enroll(...)` → party enters Unverified, `party_id` returned.
2. The verification workflow collects documents and conducts identity checks (out of scope for this atom).
3. Officer (or automated system) calls `verify(party_id, ..., verification_result=passed)` → party enters Verified, `verification_id` returned.
4. Composing KYC composition proceeds: the party is now eligible for regulated activity; `party_id` is recorded on every downstream record as the verified party reference.
5. Periodic re-verification (required under ongoing monitoring obligations) produces additional `verify(verification_result=passed)` calls; each appends a new verification event; the party remains Verified.
6. When the relationship ends, the officer calls `close(party_id, ..., reason="relationship-ended")` → party enters Closed.

**Suspension and reinstatement — sanctions match:**

1. An existing Verified party triggers a sanctions screening alert.
2. Compliance officer calls `suspend(party_id, ..., reason="potential-ofac-match-sdn-ref-12894")` → party enters Suspended.
3. Ongoing verification evidence may be collected during the investigation: `verify(party_id, ..., verification_result=passed)` is recorded but does not change state.
4. Investigation clears; officer calls `reinstate(party_id, ..., reason="ofac-match-resolved-mismatch-confirmed")` → party returns to Verified.
5. Or investigation confirms the match; officer calls `close(party_id, ..., reason="ofac-match-confirmed-account-blocked")` → party enters Closed.

**Failed verification — rejection path:**

1. `enroll(...)` → party enters Unverified, `party_id` returned.
2. `verify(party_id, ..., verification_result=failed)` → verification event appended with `failed`; party remains Unverified.
3. Composing system retries or escalates; after N failed attempts, decides not to proceed.
4. `close(party_id, ..., reason="kyc-verification-failed-after-3-attempts")` → party enters Closed; record persists as evidence of the attempted onboarding.

### Decision points

**At `enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)`:** All five fields must be present, non-null, non-empty, and non-whitespace-only; otherwise `rejected(invalid-request)`. `date_of_birth` must parse as a valid ISO 8601 date (`YYYY-MM-DD`) and must not be a future date; otherwise `rejected(invalid-request)`. If the party store write fails after all preconditions pass, the atom returns `rejected(storage-failure)` — no party record is created. The atom does not check for duplicate party records; whether two records represent the same natural person is the composing system's responsibility.

**At `verify(party_id, verifying_actor_ref, verification_method, verification_result, evidence_ref)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must not be Closed; otherwise `rejected(already-closed)`. All four remaining fields must be non-empty; `verification_result` must be exactly `passed` or `failed`; otherwise `rejected(invalid-request)`. If the verification event store write fails, `rejected(storage-failure)` — no event is recorded and the party's state does not change. `verify` may be called against a Suspended party; the event is recorded but the party remains Suspended.

**At `suspend(party_id, suspending_actor_ref, reason)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must be in Verified state. If Unverified (party has not yet successfully verified — there is no active Verified status to suspend), `rejected(not-verifiable)`. If Suspended (party is already suspended — double-suspend), `rejected(already-suspended)`. `not-verifiable` and `already-suspended` are distinct because a composing system receiving `not-verifiable` knows to look at the verification workflow, while one receiving `already-suspended` knows a concurrent or duplicate suspend call has raced in. If Closed, `rejected(already-closed)`. `suspending_actor_ref` and `reason` must be non-empty; otherwise `rejected(invalid-request)`. If the state-change write fails, `rejected(storage-failure)`.

**At `reinstate(party_id, reinstating_actor_ref, reason)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must be in Suspended state. `not-suspended` is returned for both Unverified and Verified parties — both mean there is no active suspension to lift, and a composing system need not distinguish them to decide its next action. A composing system that does need to distinguish (e.g., to surface a different error message) must query the party state separately; the atom does not split this into two codes because the rejection semantics are the same: reinstate is inapplicable. If Closed, `rejected(already-closed)`. `reinstating_actor_ref` and `reason` must be non-empty; otherwise `rejected(invalid-request)`. If the state-change write fails, `rejected(storage-failure)`.

**At `close(party_id, closing_actor_ref, reason)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must not already be Closed; otherwise `rejected(already-closed)`. `closing_actor_ref` and `reason` must be non-empty; otherwise `rejected(invalid-request)`. If the state-change write fails, `rejected(storage-failure)`.

**Priority ordering among rejection reasons:** For any action, `not-known` is checked before state-validity checks; state-validity checks are checked before field-format checks; all checks precede the store write.

### Behavior

Observed behavior, derived from how regulated systems use external party identity:

`enroll` always creates a new party record in Unverified, regardless of whether another record with the same name and document already exists. Two concurrent onboarding flows for the same natural person produce two distinct `party_id` values. The atom does not deduplicate; the composing system detects and resolves duplicates. This design keeps the atom's obligations narrow and makes the enrollment record the immutable original — merging or closing a duplicate party is always an explicit, auditable act, not a silent collision.

`verify(verification_result=failed)` records the failure event and leaves state unchanged. The atom's job is to record that a verification was attempted, who attempted it, what method was used, and what the result was. Whether to retry, escalate, or close after N failures is the composing system's policy. The atom does not count attempts.

`verify(verification_result=passed)` against a Suspended party records the passed event but does not reinstate the party. This allows verification evidence to be gathered during an investigation — e.g., a fresh document check may be required before the compliance team makes the reinstate/close decision — without the `passed` result implicitly clearing the suspension. Reinstatement requires an explicit `reinstate` call with an actor and reason.

`close` is callable from any non-Closed state. Enrolling a party and immediately closing it (enrollment-in-error) is a valid sequence; the record persists in Closed with the stated reason, giving the audit trail evidence of the error. There is no way to retroactively hide an enrollment; the atom's delete-surface absence is structural.

No action modifies enrollment fields (`name`, `date_of_birth`, `document_type`, `document_ref`, `enrolled_at`, `enrolling_actor_ref`) after `enroll`. A legal name change, document renewal, or address update does not modify the enrollment record — those are events in the party's real-world attributes that compose via an Attribute Update pattern. The enrollment record captures what was known and verified at the time of onboarding; subsequent changes layer on top without overwriting the original.

### Feedback

Each successful action produces an observable, measurable change:

- After `enroll` — a new party appears in Unverified with fresh `party_id` and `enrolled_at`. Total party count increases by one.
- After `verify` — a new verification event appears in the party's event list, with fresh `verification_id` and `verified_at`. If the result was `passed` and the party was Unverified, the party's state is now Verified (observable on the party record). If the party was Suspended or Verified, the state is unchanged but the event count grows by one.
- After `suspend` — the party's state is Suspended. A state-change entry appears on the party record with a fresh `state_change_id`, prior state (Verified), new state (Suspended), `suspending_actor_ref`, timestamp, and reason. Verified-count decreases by one; Suspended-count increases by one.
- After `reinstate` — the party's state is Verified. State-change entry appended with a fresh `state_change_id`. Suspended-count decreases by one; Verified-count increases by one.
- After `close` — the party's state is Closed. State-change entry appended with a fresh `state_change_id`. The relevant state-count (Unverified, Verified, or Suspended) decreases by one; Closed-count increases by one. Total party count is unchanged.

Each rejected action produces an observable refusal with a named reason. The state-count segmentation (Unverified, Verified, Suspended, Closed) is computable from the party record set at any time; the atom does not maintain pre-aggregated counters but does not hide the underlying records.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

**Invariant 1 — Party record permanence.** Once enrolled, a party record is never deleted from the system. The `party_id` returned by a successful `enroll` call is durably persisted and remains in the system indefinitely, regardless of subsequent state transitions including `close`. A `storage-failure` rejection on `enroll` guarantees no partial record was written.

**Invariant 2 — State membership exclusivity.** Every party known to the system is in exactly one of {Unverified, Verified, Suspended, Closed} at all times.

**Invariant 3 — Closed is absorbing.** Once a party enters Closed, no action transitions it elsewhere. `verify`, `suspend`, and `reinstate` against a Closed party are rejected.

**Invariant 4 — Verified requires a passed verification.** A party in Verified state has at least one verification event with `verification_result = passed` recorded after the most recent `suspend` action (or, if never suspended, after `enroll`). There is no path to Verified state except through a `verify(verification_result=passed)` call.

**Invariant 5 — Verification events are immutable.** Once recorded, a verification event's `verification_id`, `party_id`, `verifying_actor_ref`, `verification_method`, `verification_result`, `evidence_ref`, and `verified_at` never change.

**Invariant 6 — Verification events are append-only.** Verification events are only added to the set; no event is removed. The full verification history of any party is monotonically growing.

**Invariant 7 — Enrollment fields are immutable.** `name`, `date_of_birth`, `document_type`, `document_ref`, `enrolled_at`, and `enrolling_actor_ref` are set on `enroll` and never change.

**Invariant 8 — State-change events are auditable.** Every transition (Unverified → Verified, Verified → Suspended, Suspended → Verified, any → Closed) produces a durable state-change entry on the party record with a fresh `state_change_id`, naming the prior state, new state, acting actor reference, and timestamp. `reason` is present for `suspend`-, `reinstate`-, and `close`-driven transitions; it is absent for `verify`-driven transitions (the `verify` action carries no `reason` field). No state transition is silent.

**Invariant 9 — Id stability.** A party's `party_id` is set on `enroll` and never changes. A verification event's `verification_id` is set on `verify` and never changes. A state-change event's `state_change_id` is set when the event is written and never changes.

**Invariant 10 — No id reuse.** No two parties share a `party_id`; no two verification events share a `verification_id`; no two state-change events share a `state_change_id`, across the lifetime of the system.

**Invariant 11 — Party store durability.** The total count of party records is monotonically non-decreasing. A `storage-failure` rejection on any action guarantees no partial write has occurred for that action.

Invariants 1, 5, 6, and 8 together give the *identity chain-of-custody* property: the full history of a party's identity — who enrolled them, every verification attempt, every state change — is recoverable from the records alone and cannot be silently altered. Each state-change event is individually addressable by `state_change_id`, so Actor Identity attestations and Audit Trail entries can reference a specific suspension or closure event by id. Invariant 4 gives the *verification integrity* property: Verified state is not self-asserted. Invariant 3 gives the *terminal closure* property: a closed party cannot be silently reopened.

---

## Examples

The same atom, four regulated domains, identical mechanic.

### Banking — KYC customer onboarding under BSA/AML

A bank onboards a new retail customer. The officer collects identity attributes and runs the CIP verification workflow.

1. `enroll(name="Amara Osei", date_of_birth="1981-03-14", document_type="passport", document_ref="doc_p901", enrolling_actor_ref="officer_r3") → party_id = party_9017`
2. Automated OCR system checks the passport. `verify(party_id="party_9017", verifying_actor_ref="system_kyc_auto", verification_method="automated-ocr", verification_result="passed", evidence_ref="evidence_ocr_442") → verification_id = verif_1101` — party transitions Unverified → Verified.
3. KYC composition gates account opening on the party being Verified; account_a883 is opened and linked to party_9017.
4. Six months later, annual re-verification. `verify(party_id="party_9017", verifying_actor_ref="officer_r3", verification_method="manual-document-review", verification_result="passed", evidence_ref="evidence_doc_556") → verif_1184` — party remains Verified; second event appended.
5. Ten years later, account closure. `close(party_id="party_9017", closing_actor_ref="officer_r3", reason="account-closed-customer-request-26-05-14") → ok` — party enters Closed. BSA requires retention of CDD records for 5 years after closure; the Retention Window composition governs the record's lifetime from this point.

### Healthcare — patient identity enrollment under HIPAA

A hospital registers a new patient presenting for emergency treatment.

1. `enroll(name="Bui Thi Thu", date_of_birth="1994-07-22", document_type="national-id", document_ref="doc_n402", enrolling_actor_ref="registrar_h7") → party_id = party_4451`
2. Registrar verifies the document manually. `verify(party_id="party_4451", verifying_actor_ref="registrar_h7", verification_method="manual-document-review", verification_result="passed", evidence_ref="evidence_img_204") → verif_2019` — party transitions Unverified → Verified.
3. Clinical record creation is gated on party_4451 being Verified; encounter enc_7723 is created and linked to party_4451.

### Financial services — sanctions match and resolution

An existing customer, party_7732 (Verified), triggers a sanctions screening alert.

1. `suspend(party_id="party_7732", suspending_actor_ref="compliance_mgr_01", reason="potential-ofac-sdn-match-entry-ref-12894") → ok` — party enters Suspended. Downstream systems observe the Suspended state and freeze new transaction initiation.
2. Compliance team gathers additional verification. `verify(party_id="party_7732", verifying_actor_ref="compliance_analyst_02", verification_method="database-check", verification_result="passed", evidence_ref="evidence_db_ofac_clearance_882") → verif_3901` — event recorded; party remains Suspended.
3. Investigation confirms mismatch; officer reinstates. `reinstate(party_id="party_7732", reinstating_actor_ref="compliance_mgr_01", reason="ofac-match-resolved-different-individual-confirmed") → ok` — party returns to Verified.

Alternative closing path (match confirmed): `close(party_id="party_7732", closing_actor_ref="compliance_mgr_01", reason="ofac-sdn-match-confirmed-account-terminated") → ok` — party enters Closed.

### Enrollment-in-error — rejection path into closure

1. `enroll(name="Test Entry", date_of_birth="2000-01-01", document_type="passport", document_ref="doc_p000", enrolling_actor_ref="officer_r7") → party_id = party_9030`
2. Officer identifies this as a test entry made in the production system.
3. Attempted deletion: no deletion surface exists (Invariant 1). The correct action: `close(party_id="party_9030", closing_actor_ref="officer_r7", reason="enrolled-in-error-test-entry-production") → ok` — party enters Closed.
4. The record persists in Closed. The audit shows who enrolled it, when, and who closed it and why. The error is auditable; it is not hidden.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit — "show me every party that proceeded to regulated activity without a verified identity."** The auditor queries the composing KYC system for any regulated activity record linked to a `party_id` in Unverified or Closed state. Invariant 4 is the structural answer: the only path to Verified state is through a `verify(verification_result=passed)` call. Any composing system that gates regulated activity on the party being in Verified state can demonstrate compliance from the records alone — the party's state-change log and verification event list answer the question without developer narration. The auditor does not need to trust the system's claim; they can reconstruct any party's state at any point in time from the state-change log (Invariant 8).

**Disputed identity — "the party claims they were never verified; show me the verification chain."** The party (or their counsel) challenges the claim that their identity was verified before account opening. The investigator retrieves the verification event list for the `party_id`: each event names `verifying_actor_ref`, `verification_method`, `evidence_ref`, and `verified_at`. Invariant 5 (immutability) and Invariant 6 (append-only) establish that no verification event can have been altered or inserted after the fact. The `evidence_ref` on each `passed` event points to the document or database record that supported the verification — the dispute is resolved by producing the evidence record alongside the immutable verification event. If the `evidence_ref` record cannot be produced, the verification event is an unsubstantiated claim; that is an evidence-management failure at the document store, not a Party Identity failure.

**Breach or incident investigation — "during the breach window, which verified parties' records may have been accessed or altered?"** An incident investigator is given a time window (e.g., 2026-04-01 through 2026-04-15) and needs to reconstruct which Party Identity records were in Verified state during that window and which state changes occurred. The state-change log (Invariant 8) records every transition with a timestamp; the investigator can replay any party's state as of any given instant. The verification event list (Invariant 6) shows what verification evidence was on file during the window. Together, these bound the scope of affected records from the records alone, without requiring log files from an external system. The atom's append-only, immutable-event discipline forecloses the possibility that an attacker altered the verification history to conceal unauthorized state changes; any gap in the state-change log is itself a finding.

---

## Generation acceptance

A derived implementation of Party Identity is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the party record set and the verification event set, can do all of the following without recourse to source code, runbooks, or developer narration:

**Reconstruct any party's state at any point in time.** The state-change log (Invariant 8) provides a complete, time-ordered transition history from `enroll` through the current state. The auditor can replay the log forward from any start point and arrive at the party's state as of any given timestamp.

**Verify that every party in Verified state has at least one passed verification event.** Query the verification event set for each party in Verified state; confirm the existence of a `verification_result = passed` event after the most recent `suspend` action (or after `enroll` if never suspended). Invariant 4 makes this set structurally non-empty for every Verified party; the auditor sees the structural guarantee, not a procedural claim.

**Confirm that every verification event is attributed to an actor and method.** Each event records `verifying_actor_ref`, `verification_method`, `evidence_ref`, and `verified_at`. An auditor can trace every verification decision to the actor and method that produced it, and to the evidence record that supported it, from the event store alone.

**Trace the complete lifecycle of any party from enrollment to current state.** The enrollment fields (Invariant 7) capture the initial attributes; the state-change log (Invariant 8) captures every subsequent transition; the verification event list (Invariants 5–6) captures the complete verification history. Together they form a complete, time-ordered, append-only biography of the party record.

**Identify every party currently in each state.** The current state field on each party record, queryable as a set, partitions the party population into Unverified, Verified, Suspended, and Closed. Counts per state are derivable from the set.

**Identify the composing patterns active in this deployment.** Whether Actor Identity attestation is wired into state transitions (attributing each `suspend`, `reinstate`, `close` action to a verifiable proof), whether Audit Trail is active for tamper-evident recording, whether Retention Window governs party record lifetime, and whether ongoing monitoring is wired to produce periodic `verify` calls.

---

## Edge cases and explicit non-goals

What this atom does not cover:

**Duplicate detection and deduplication.** The atom does not detect or prevent two `party_id` records for the same natural person or entity. Detecting that two enrollments represent the same individual — whether by biometric match, document comparison, or external identity resolution — is a composing concern. The atom models the lifecycle of a single party record; the graph of records and their deduplication relationships is external.

**Identity attribute updates.** No action modifies `name`, `date_of_birth`, `document_type`, or `document_ref` after enrollment. A legal name change, document renewal, or address update does not overwrite the enrollment fields. The principle: the enrollment record is the auditable original, capturing what was known at onboarding. The objection: real parties' attributes change and the system must reflect current information. The mechanism: a composing Attribute Update pattern appends versioned attribute events to the party record without mutating the enrollment fields; queries that need the current view read the latest attribute event; queries that need the at-time-of-onboarding view read the enrollment fields. The result: the audit trail for any party's attributes is complete and no prior state is silently overwritten.

**The verification workflow.** What happens *during* verification — document OCR, biometric check, sanctions database query, adverse media search — is not modeled by this atom. The atom records that a verification was performed, by whom, using what method, with what result, against what evidence. The workflow that produces those inputs is a composing KYC / AML Verification pattern.

**Ongoing monitoring scheduling.** Periodic re-verification, sanctions re-screening, PEP (Politically Exposed Persons) re-check — these are composing patterns that call `verify` on a schedule or trigger basis. The atom records each result; the scheduling policy is external.

**Risk scoring and enhanced due diligence.** Whether a party requires enhanced due diligence based on risk factors (country of origin, transaction volume, PEP status) is a composing concern. The atom records identity and verification lifecycle; risk classification and EDD orchestration belong to the KYC composition.

**Beneficial ownership.** A beneficial owner of a legal entity is a Party Identity record in their own right; the relationship between the beneficial owner and the entity (ownership percentage, control type) is a composing Ownership Structure pattern. The atom records each party independently; the ownership graph is not the atom's concern.

**Authorized representatives and power of attorney.** An individual acting on behalf of a party — guardian, attorney-in-fact, corporate officer — is a composing Delegation / Representation pattern. The atom records the party being represented; the representative's authority is separate.

**Cross-system identity portability.** `party_id` is opaque and scoped to the issuing system. Linking a `party_id` in one system to a record in another trust domain belongs to an Identity Federation composing pattern.

**Notification of state changes.** When a party is Suspended or Closed, downstream systems may need to freeze activity (block transactions, freeze accounts, suppress notifications). Propagating state changes to downstream systems composes with Subscription and Notification; it is not the atom's responsibility.

**Retention of party records.** Invariant 1 guarantees party records are never deleted by the atom, but does not set the retention policy governing how long records must be actively accessible before archival or anonymization. FATF and BSA/AML require retention of CDD records for at least five years after the business relationship ends; GDPR Article 17 creates competing erasure obligations that legal counsel adjudicates. The Retention Window composition governs this lifecycle.

**What "Closed" means for existing open commitments.** Closing a party prevents new regulated activity but does not automatically terminate existing open accounts, positions, or contracts. The composing system owns the policy for unwinding open commitments against a Closed party; the atom's contract is that `verify`, `suspend`, and `reinstate` are rejected for Closed parties, signaling to composing systems that the party is no longer eligible for new activity.

**Concurrency.** Concurrent state transitions for the same `party_id` (e.g., simultaneous `suspend` and `close` calls) resolve under the host environment's serialization guarantees. The first wins; the second observes the updated state and is rejected accordingly (`already-closed`, `already-suspended`, `not-suspended`, etc.). Multi-action transactions belong to a Transaction composition.

**Asynchronous verification workflows.** The `verify` action takes `verification_result` as a field that must be `passed` or `failed` at call time. The atom does not model in-progress or pending verification states. Real-world verification workflows are frequently asynchronous — a document is submitted, an external service runs a check, and the result arrives seconds to days later. The composing workflow owns this coordination: the party remains in Unverified while the external check runs; when the result is known, the composing workflow calls `verify` with the outcome. The atom's `verification_result` field is the recording surface for a result that has already been determined; the orchestration of asynchronous determination is a composing concern.

**Clock semantics.** State-change timestamps and verification timestamps come from an implicit clock. Where onboarding and verification timestamps have legal force (FATF, BSA/AML require recording when CDD was performed), implementations must source time from a trustworthy clock. Trusted Timestamping composes to supply a verifiable time-anchor.

Where the atom breaks down: when the same natural person must hold multiple concurrent identity records under different regulatory regimes (some regulated domains require jurisdiction-specific records that cannot share a single `party_id`); when the verification obligation requires real-time sanctions database access that the atom cannot gate on (the atom records the result but cannot enforce that the lookup was performed — the composing workflow owns that guarantee); when personal data must be purged under GDPR Article 17 while a BSA/AML retention obligation is still active (the legal tension is real and the resolution belongs to legal counsel and the Retention Window + Consent compositions, not to this atom).

---

## Composition notes

Party Identity is freestanding and is the external-party identity contract that regulated composing systems declare:

- **[Consent](./consent.md)** — Party Identity establishes *who* the party is; Consent establishes *what* the system may do with or to their data. Every system that both identifies and processes personal data for an external party composes both. Consent basis is checked per processing action against the party's Consent record; the party's `party_id` is the data subject reference in the Consent atom.
- **[Actor Identity](./actor-identity.md)** — each `verify`, `suspend`, `reinstate`, and `close` action should be attested by the internal actor performing it; the `*_actor_ref` fields are the attribution surface. Actor Identity supplies the non-repudiable proof that a specific actor authorized each state transition. KYC / Customer Onboarding (C8) wires Actor Identity into every state-changing call.
- **[Retention Window](./retention-window.md)** — Invariant 1 makes party records permanent from the atom's perspective, but the composing system places the party record under a retention policy that governs how long the record is actively accessible and when archival or anonymization becomes permitted. BSA/AML requires five years post-closure; GDPR Article 17 erasure obligations compose through legal counsel adjudication.
- **[Audit Trail](../../compositions/audit-trail.md)** — every state transition event and verification event should be surfaced through the Audit Trail composition for tamper-evident, attribution-stamped recording that survives the Audit Trail's own regulated adversarial scenarios.
- **KYC / Customer Onboarding with Ongoing Monitoring** *(forthcoming, C8)* — the primary composition that names this atom. Gates regulated activity on the party being in Verified state; orchestrates the verification workflow; handles ongoing monitoring via periodic `verify` calls; composes Actor Identity for attestation and Retention Window for record lifetime.
- **Identity Document Store** *(forthcoming)* — holds the document records that `document_ref` and `evidence_ref` reference. The atom treats both as opaque; the document store's content is the external evidence supporting each verification.
- **Attribute Update** *(forthcoming)* — handles changes to `name`, `date_of_birth`, or document references for an existing party. Appends versioned attribute events without mutating enrollment fields.
- **Ownership Structure / Beneficial Owner** *(forthcoming)* — models the ownership relationships between Party Identity records (individuals, legal entities, beneficial owners). Each beneficial owner is a Party Identity record; the graph of relationships is the composition.
- **Identity Federation** *(forthcoming)* — links `party_id` records across trust domains; handles cross-system identity resolution.
- **Delegation / Representation** *(forthcoming)* — models authorized representatives (guardians, attorneys-in-fact, corporate officers) acting on behalf of an enrolled party.

---

## Standards references

- **FATF Recommendations 10–12** — Customer Due Diligence: identify the customer and verify identity using reliable, independent source documents, data, or information; identify and verify beneficial owners; understand the ownership and control structure; conduct ongoing due diligence on the business relationship. The atom's `enroll` / `verify` lifecycle is the structural form of FATF's CDD obligation.
- **Bank Secrecy Act / Anti-Money Laundering — 31 CFR Part 1020 (FinCEN)** — Customer Identification Program: minimum identity attributes (name, date of birth, address, identification number), verification using documentary or non-documentary methods, and record retention for five years after account closure or the date the record was made. The atom's `verification_method` and `evidence_ref` fields satisfy the CIP's recording requirements.
- **FinCEN Beneficial Ownership Rule — 31 CFR §1010.230** — legal entity customers must identify and verify beneficial owners owning ≥25% and a single control person. Each beneficial owner is a Party Identity record; the Ownership Structure composition holds the ≥25% relationship graph.
- **EU 5th Anti-Money Laundering Directive (AMLD5)** — enhanced CDD requirements including beneficial ownership registries; alignment with FATF.
- **GDPR Article 4(1)** — the identity attributes collected by this atom (name, date of birth, document type and reference) are personal data under GDPR; all processing is subject to Articles 5–6.
- **GDPR Articles 5–6** — lawful basis for processing identity data; typically Article 6(1)(c) (legal obligation) or Article 6(1)(b) (performance of a contract). The Consent composition governs data processing *beyond* the regulatory obligation.
- **GDPR Article 17** — right to erasure; creates tension with BSA/AML and FATF retention obligations. The atom does not resolve this tension (see Edge cases); Retention Window + legal counsel adjudication composes for this.
- **HIPAA 45 CFR §164.514** — patient identity is required for the creation of protected health information records; the patient is a Party Identity in the healthcare context.
- **NIST SP 800-63A (Identity Assurance Levels)** — IAL1 (self-asserted), IAL2 (remote identity proofing with document evidence), IAL3 (in-person proofing with biometric). The atom's `verification_method` field implicitly captures the IAL level; explicit IAL tagging and method-to-IAL mapping is a composing concern.
- **ISO/IEC 29115 (Entity Authentication Assurance)** — international analog to NIST SP 800-63A; defines four levels of entity authentication assurance. The atom's `verification_method` field is the recording surface for the assurance level achieved.
- **OFAC SDN Compliance** — U.S. sanctions screening requires parties to be checked against the Specially Designated Nationals list; the `suspend` → investigate → `reinstate` or `close` lifecycle is the operational form of a sanctions match process. The atom records the lifecycle; the screening system is a composing concern.

---

## Status

`draft`

---

## Lineage notes

This is the foundation draft of Party Identity. The three pressure-testing passes — Pass 1 GRID structural completeness, Pass 2 EOS conceptual independence, Pass 3 Linus adversarial scrutiny — have not yet been run against this draft. The atom is sequenced #6 in the ROADMAP's draft order and is the first item with status "Not started" as of 2026-05-14.

The regulated-overlay conventions (Regulated adversarial scenarios and Generation acceptance) are included from the first draft in accordance with the methodology's inheritance discipline documented in PRESSURE_TESTING.md and established by Actor Identity and Retention Window. This atom cites the methodology directly rather than treating either predecessor as its canonical reference.

Two composing patterns named throughout this draft — Consent (grounded 2026-05-13) and Actor Identity (grounded 2026-05-13) — are both available; forthcoming-link markers for those two are resolved. The remaining forthcoming-link debts (KYC / Customer Onboarding C8, Identity Document Store, Attribute Update, Ownership Structure, Identity Federation, Delegation / Representation) are named explicitly and will resolve as those patterns land.

**Pass 3 — Adversarial scrutiny (Linus mode), applied to the foundation draft. Five findings, all closed in-pattern.**

- *`suspend` and `reinstate` action signatures missing `already-closed`.* Decision points named `already-closed` as a rejection reason for both actions when the party is Closed, but the Inputs signatures only listed `not-known | not-verifiable | invalid-request | storage-failure` and `not-known | not-suspended | invalid-request | storage-failure` respectively. Inconsistency between signature and logic. Resolved: `already-closed` added to both signatures.

- *`not-verifiable` conflated Unverified and Suspended.* `suspend` returned `not-verifiable` for both an Unverified party (never verified — correct semantics) and a Suspended party (already suspended — double-suspend, different semantics). A composing system receiving `not-verifiable` could not distinguish the two without re-querying state. Resolved: `already-suspended` added as a separate rejection reason for the double-suspend case; `not-verifiable` retained for the Unverified case; both named and distinguished in Decision points and the transition table. `not-suspended` for `reinstate` is intentionally kept as a single code for both Unverified and Verified parties — both mean "no active suspension to lift" and the rejection semantics are the same; the Decision points entry names this choice explicitly.

- *State-change events had no individual id, asymmetric with verification events.* Verification events carried `verification_id`; state-change events accumulated as a log with no individual addressability. This meant Actor Identity attestations and Audit Trail entries could not reference a specific suspension or closure event by id. Resolved: `state_change_id` (opaque, immutable, system-generated) added to each state-change event; Identity model, State section, Feedback, Invariants 8–10, and the chain-of-custody paragraph all updated.

- *Invariant 8 "(where applicable)" undefined.* The invariant stated state-change entries include "reason (where applicable)" without defining when reason is absent. Applicable meant: present for `suspend`/`reinstate`/`close`-driven transitions, absent for `verify`-driven Unverified → Verified transitions (which carry no `reason` field). Resolved: Invariant 8 rewritten to state the condition explicitly; the state-change log field description in State section updated to match.

- *Async verification not named as explicit non-goal.* The `verify` action takes `verification_result` at call time, implying the result is known before the call. Async verification workflows — document submitted, result arrives later — are the common case in practice. The composing workflow's role (hold the party in Unverified, call `verify` when the result arrives) was not named. Resolved: "Asynchronous verification workflows" added to Edge cases.
