---
title: Party Identity
parent: Atomic Concepts
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


> A compliance primitive: a persistent, verifiable identity record for an external party — customer, patient, counterparty, beneficial owner — with a verification lifecycle distinct from Actor Identity. Where Actor Identity models an internal actor's ability to sign actions with credentials, Party Identity models an external party's verified existence and identity attributes, which may be re-verified, suspended, or closed as circumstances change. States: Unverified, Verified, Suspended, Closed. The load-bearing contribution: a verified Party Identity record is the precondition any composing system (Know Your Customer onboarding, clinical enrollment, counterparty risk management) may declare before proceeding to regulated activity with a named party.

---

## Intent

Every regulated system that interacts with external parties — banks onboarding customers, hospitals enrolling patients, broker-dealers establishing counterparties, employers verifying staff — must establish *who* the party is before regulated activity begins, and must maintain that identity record through the party's full lifecycle. The shape is constant across domains: identity attributes are collected, verified against external evidence (government-issued document, biometric check, reference database), the party transitions to a verified state, and subsequent regulated activity can rely on the verified record. When circumstances change — a sanctions match emerges, a document expires, a legal investigation begins — the party can be suspended, re-verified, and either reinstated or permanently closed.

The compliance framing is consistent across regulatory regimes. FATF (Financial Action Task Force — the international standard-setter for anti-money-laundering and counter-terrorist-financing rules) Recommendations 10–12 require Customer Due Diligence (CDD — the process of identifying and verifying a customer's identity before establishing a business relationship) before establishing a business relationship: collect identity attributes, verify identity using reliable independent sources, understand ownership and control structures, and conduct ongoing due diligence. The BSA (Bank Secrecy Act — US law requiring financial institutions to assist in detecting money laundering) / AML (Anti-Money Laundering — regulations requiring financial institutions to detect and report suspicious activity) Customer Identification Program (31 CFR (Code of Federal Regulations) Part 1020) specifies minimum identity attributes and requires record retention for at least five years after the business relationship ends. GDPR (EU General Data Protection Regulation) Article 4(1) defines the identity attributes collected here as personal data, subject to Articles 5–6 lawful-basis requirements. HIPAA (Health Insurance Portability and Accountability Act) requires patient identity be established before clinical records are created. The domain varies; the structural obligation is the same.

Party Identity is distinct from Actor Identity, and the distinction is not cosmetic. Actor Identity models *internal actors who authorize system actions* — an employee, service account, or credentialed operator producing a cryptographic proof that binds their identity to a specific action. Party Identity models *external parties whose regulated identity must be established* — a customer, patient, or counterparty who is the *subject* of the system's activity rather than its *operator*. An actor signs; a party is verified. The two atoms model different obligations, carry different state machines, and compose when the same natural person is both a verified external party and a credentialed internal actor (common in employee-onboarding, professional-licensing, and counterparty scenarios where the party is also given system access). The composition is explicit; the atoms remain freestanding.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state machine (Unverified → Verified via successful verification; Verified → Suspended via suspend; Suspended → Verified via reinstate; any non-Closed state → Closed via close), its own actions (`enroll`, `verify`, `suspend`, `reinstate`, `close`), and its own invariants (party records are never deleted; verification events are immutable and append-only; Closed is absorbing; Verified requires a passed verification). It does not implement the verification workflow, the document check, the sanctions screen, the ongoing monitoring schedule, risk scoring, or enhanced due diligence. Each is a composing pattern. See Composition notes.

---

## Summary

Party Identity is a lasting, verifiable identity record for an external party — a customer, patient, counterparty, or beneficial owner (the individual who ultimately owns or controls a company). It answers the question every regulated system must settle before doing business: who is this party, and has their identity been checked? The record keeps the party's initial enrollment, the full history of identity checks (each one's method, result, and supporting evidence), and every later change — suspension, reinstatement, closure — with who did it and why. A party is in one of four states: Unverified, Verified, Suspended, or Closed; Closed is permanent, and a party who returns after closure needs a fresh enrollment. The central guarantee is that a party cannot be marked Verified without at least one recorded passing check since its most recent suspension — the system enforces this itself, so a downstream process can require "a verified party" and trust that the verified status rests on real, on-record evidence rather than a flipped flag. The pattern records the results of identity checks; it does not perform them (no document scanning, biometric matching, or sanctions screening), and it does not deduplicate parties — those belong to surrounding patterns. It is the foundation for regulatory customer-identity onboarding, patient enrollment, and counterparty identity management. (It is distinct from Actor Identity, which is about internal operators signing actions; a party is verified, an actor signs.)

---

## Structure

### Identity model

Every party known to the system has a **`party_id`** — an opaque, immutable, system-generated identifier produced by `enroll`. The id is the party's identity; all other fields (name, date of birth, document type, document reference) are immutable *properties* set at enrollment, not the identity itself.

This matters because an external party's legal name, document number, or address may change — through legal name change, document renewal, address update — without the party ceasing to be *the same party*. Using a content field like name or document number as identity would collapse legitimate attribute evolution with distinct-party disambiguation. Opaque ids preserve the one-party-one-id discipline that makes lifelong identity chain-of-custody tractable and lets the composing Customer Onboarding composition link all activity — past and future — to a single durable reference.

Each call to `verify` produces a **`verification_id`** — opaque, immutable, system-generated — associated with the party. Verification events are separate records, append-only; the current state reflects the outcome of the most recent successful verification, but all past events are preserved as the chain-of-custody for the party's verification history.

Each state-change event produced by `suspend`, `reinstate`, `close`, or a `verify`-driven Unverified → Verified transition has a **`state_change_id`** — opaque, immutable, system-generated — so that composing patterns (Actor Identity attestations, Audit Trail entries) can reference a specific suspension, reinstatement, or closure event by id rather than by timestamp or position in the log. State-change events accumulate on the party record as a time-ordered, append-only log; they are sub-records of the party, not independently stored record types, but each is individually addressable by its `state_change_id`.

Two enrollments for the same natural person produce two records with two distinct `party_id` values. The atom does not deduplicate; deduplication is the composing system's responsibility. See Edge cases.

### Inputs and Outputs

- A legal name identifying the party at enrollment. Non-empty, non-whitespace-only. Maximum 500 characters. The atom stores the name as supplied; Unicode normalization, case folding, and transliteration are deployment policy.
- A date of birth expressed as an ISO 8601 date (the International Organization for Standardization's date format, `YYYY-MM-DD`). Must parse as a valid calendar date; must not be in the future.
- A document type identifying the class of identity document presented (`passport`, `national-id`, `drivers-license`, or similar). Non-empty, non-whitespace-only. The atom treats this as an opaque string; which values are valid for which regulatory regime belongs to the composing system.
- A document reference — an opaque pointer to the identity document record in the composing identity-document store. Non-empty, non-whitespace-only. The atom does not validate the reference against the document store.
- An enrolling actor reference — an opaque pointer to the internal actor performing enrollment. Non-empty, non-whitespace-only. Attribution only; verification and non-repudiation of the enrollment action compose with Actor Identity.
- Actions:
  - `enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref) → party_id | rejected(invalid-request | storage-failure)`
  - `verify(party_id, verifying_actor_ref, verification_method, verification_result, evidence_ref) → (verification_id, state_change_id?) | rejected(not-known | already-closed | invalid-request | storage-failure)`
  - `suspend(party_id, suspending_actor_ref, reason) → state_change_id | rejected(not-known | not-verifiable | already-suspended | already-closed | invalid-request | storage-failure)`
  - `reinstate(party_id, reinstating_actor_ref, reason) → state_change_id | rejected(not-known | not-suspended | already-closed | no-passed-verification-since-suspend | invalid-request | storage-failure)`
  - `close(party_id, closing_actor_ref, reason) → state_change_id | rejected(not-known | already-closed | invalid-request | storage-failure)`
- An implicit clock providing wall-time timestamps.

**On `verify`:** `verification_result` must be exactly `passed` or `failed`; any other value is `invalid-request`. `verification_method` is an opaque non-empty, non-whitespace-only string naming the method used (`manual-document-review`, `automated-ocr`, `biometric-match`, `database-check`, etc.). `evidence_ref` is an opaque non-empty, non-whitespace-only pointer to the verification evidence record. `verifying_actor_ref` is non-empty, non-whitespace-only. All four required string fields must be present; any missing field, or any field that is empty or whitespace-only, is `invalid-request`.

**On `suspend`, `reinstate`, `close`:** `reason` is required; non-empty, non-whitespace-only; maximum 2000 characters; stored as supplied, no normalization. `*_actor_ref` fields are opaque non-empty, non-whitespace-only references.

**Outputs** — the current set of party records; for each party: `party_id`, `name`, `date_of_birth`, `document_type`, `document_ref`, `enrolled_at`, `enrolling_actor_ref`, current state, state-change log, and the full ordered list of verification events. For each verification event: `verification_id`, `party_id`, `verifying_actor_ref`, `verification_method`, `verification_result`, `evidence_ref`, `verified_at`. Action returns: `party_id` from `enroll`; `(verification_id, state_change_id?)` from `verify` — `state_change_id` is present iff the call drove an Unverified → Verified transition, absent otherwise; `state_change_id` from `suspend`, `reinstate`, `close`. Every action that produces a state-change event returns the `state_change_id` directly so the caller can bind to Actor Identity for attestation and to Audit Trail for tamper-evident recording without a follow-up query — symmetric with `enroll` returning `party_id` and `verify` returning `verification_id`.

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

**Ordering.** The state-change log and the verification event list are ordered by insertion sequence. References elsewhere in this spec to "after the most recent X," "between X and Y," or "most recent X" mean by insertion order, not by timestamp order. Timestamps (`enrolled_at`, `verified_at`, and state-change-event timestamps) are best-effort wall-time metadata sourced from the implicit clock; under skew or clock adjustment, timestamps may not be monotonic. The Trusted Timestamping composition supplies a verifiable time-anchor that binds insertion order to externally-verifiable wall-time; without that composition, timestamps are advisory and insertion order is authoritative.

Transitions:

- `enroll(...)` → party created in **Unverified** with fresh `party_id` and `enrolled_at = now`.
- `verify(party_id, ..., verification_result=passed)` when Unverified → **Verified**; new verification event appended; new state-change event appended; both `verification_id` and `state_change_id` returned to the caller.
- `verify(party_id, ..., verification_result=failed)` when Unverified → remains **Unverified**; new verification event appended with `failed` result; only `verification_id` returned.
- `verify(party_id, ..., verification_result=passed)` when Verified → remains **Verified** (re-verification); new verification event appended; only `verification_id` returned.
- `verify(party_id, ..., verification_result=failed)` when Verified → remains **Verified**; new verification event appended with `failed` result; only `verification_id` returned.
- `verify(party_id, ..., *)` when Suspended → remains **Suspended**; new verification event appended; only `verification_id` returned.
- `verify(party_id, ..., *)` when Closed → `rejected(already-closed)`.
- `suspend(party_id, ...)` when Verified → **Suspended**; state-change event appended.
- `suspend(party_id, ...)` when Unverified → `rejected(not-verifiable)`.
- `suspend(party_id, ...)` when Suspended → `rejected(already-suspended)`.
- `suspend(party_id, ...)` when Closed → `rejected(already-closed)`.
- `reinstate(party_id, ...)` when Suspended, with at least one verification event recorded with `verification_result = passed` after the most recent `suspend` action in insertion order → **Verified**; state-change event appended.
- `reinstate(party_id, ...)` when Suspended, with no `passed` verification event after the most recent `suspend` action in insertion order → `rejected(no-passed-verification-since-suspend)`.
- `reinstate(party_id, ...)` when Unverified or Verified → `rejected(not-suspended)`.
- `reinstate(party_id, ...)` when Closed → `rejected(already-closed)`.
- `close(party_id, ...)` when not Closed → **Closed**; state-change event appended.
- `close(party_id, ...)` when Closed → `rejected(already-closed)`.

### Flow

**Standard onboarding — happy path:**

1. An onboarding officer calls `enroll(...)` → party enters Unverified, `party_id` returned.
2. The verification workflow collects documents and conducts identity checks (out of scope for this atom).
3. Officer (or automated system) calls `verify(party_id, ..., verification_result=passed)` → party enters Verified, `verification_id` returned.
4. Composing Customer Onboarding composition proceeds: the party is now eligible for regulated activity; `party_id` is recorded on every downstream record as the verified party reference.
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
4. `close(party_id, ..., reason="verification-failed-after-3-attempts")` → party enters Closed; record persists as evidence of the attempted onboarding.

### Decision points

**Uniform validation rule.** Across all actions, every required string field — names, document attributes, actor references, verification metadata, reasons — must be non-null, non-empty, and non-whitespace-only; otherwise `rejected(invalid-request)`. The rule applies uniformly so that the audit-trail surface (especially the `reason` field on suspend, reinstate, and close) cannot be vacuously satisfied by a whitespace placeholder. Action-specific format constraints (e.g., `verification_result` must be `passed` or `failed`; `date_of_birth` must parse as a valid past-or-present ISO 8601 date) are stated per action below.

**At `enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)`:** All five fields must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. `date_of_birth` must parse as a valid ISO 8601 date (`YYYY-MM-DD`) and must not be a future date; otherwise `rejected(invalid-request)`. If the party store write fails after all preconditions pass, the atom returns `rejected(storage-failure)` — no party record is created. The atom does not check for duplicate party records; whether two records represent the same natural person is the composing system's responsibility.

**At `verify(party_id, verifying_actor_ref, verification_method, verification_result, evidence_ref)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must not be Closed; otherwise `rejected(already-closed)`. `verifying_actor_ref`, `verification_method`, and `evidence_ref` must satisfy the uniform validation rule; `verification_result` must be exactly `passed` or `failed`; otherwise `rejected(invalid-request)`. If the verification event store write fails, `rejected(storage-failure)` — no event is recorded and the party's state does not change. `verify` may be called against a Suspended party; the event is recorded but the party remains Suspended. When `verify(verification_result=passed)` against an Unverified party succeeds, the call produces both a verification event and a state-change event in a single atomic unit (Invariant 11); both ids are returned to the caller.

**At `suspend(party_id, suspending_actor_ref, reason)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must be in Verified state. If Unverified (party has not yet successfully verified — there is no active Verified status to suspend), `rejected(not-verifiable)`. If Suspended (party is already suspended — double-suspend), `rejected(already-suspended)`. `not-verifiable` and `already-suspended` are distinct because a composing system receiving `not-verifiable` knows to look at the verification workflow, while one receiving `already-suspended` knows a concurrent or duplicate suspend call has raced in. If Closed, `rejected(already-closed)`. `suspending_actor_ref` and `reason` must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. If the state-change write fails, `rejected(storage-failure)`.

**At `reinstate(party_id, reinstating_actor_ref, reason)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must be in Suspended state. `not-suspended` is returned for both Unverified and Verified parties — both mean there is no active suspension to lift, and a composing system need not distinguish them to decide its next action. A composing system that does need to distinguish (e.g., to surface a different error message) must query the party state separately; the atom does not split this into two codes because the rejection semantics are the same: reinstate is inapplicable. If Closed, `rejected(already-closed)`. The party must have at least one verification event with `verification_result = passed` recorded after the most recent `suspend` action in insertion order; otherwise `rejected(no-passed-verification-since-suspend)`. This enforces that reinstatement reflects fresh evidence rather than a flag toggle: a suspension represents revoked trust in the prior verification, and a `reinstate` call without an intervening `passed` verification has no recorded basis for restoring trust. The atom owns this rule directly rather than delegating it to composing workflows; every composition that uses Party Identity inherits the invariant automatically. `reinstating_actor_ref` and `reason` must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. If the state-change write fails, `rejected(storage-failure)`.

**At `close(party_id, closing_actor_ref, reason)`:** `party_id` must reference a known party; otherwise `rejected(not-known)`. The party must not already be Closed; otherwise `rejected(already-closed)`. `closing_actor_ref` and `reason` must satisfy the uniform validation rule; otherwise `rejected(invalid-request)`. If the state-change write fails, `rejected(storage-failure)`.

**Priority ordering among rejection reasons:** For any action, `not-known` is checked before state-validity checks; state-validity checks are checked before semantic-precondition checks (e.g., `reinstate`'s fresh-verification check); semantic-precondition checks are checked before field-format checks; all checks precede the store write. For `reinstate` specifically, the order is: `not-known` → `already-closed` or `not-suspended` (state validity, mutually exclusive) → `no-passed-verification-since-suspend` (semantic precondition, only reached when the party is Suspended) → `invalid-request` (field format) → `storage-failure`.

### Behavior

Observed behavior, derived from how regulated systems use external party identity:

`enroll` always creates a new party record in Unverified, regardless of whether another record with the same name and document already exists. Two concurrent onboarding flows for the same natural person produce two distinct `party_id` values. The atom does not deduplicate; the composing system detects and resolves duplicates. This design keeps the atom's obligations narrow and makes the enrollment record the immutable original — merging or closing a duplicate party is always an explicit, auditable act, not a silent collision.

`verify(verification_result=failed)` records the failure event and leaves state unchanged. The atom's job is to record that a verification was attempted, who attempted it, what method was used, and what the result was. Whether to retry, escalate, or close after N failures is the composing system's policy. The atom does not count attempts.

`verify(verification_result=passed)` against a Suspended party records the passed event but does not reinstate the party. This allows verification evidence to be gathered during an investigation — e.g., a fresh document check may be required before the compliance team makes the reinstate/close decision — without the `passed` result implicitly clearing the suspension. Reinstatement requires an explicit `reinstate` call with an actor and reason, and the atom further requires that at least one such `passed` verification be recorded after the most recent suspend before `reinstate` will succeed (Invariant 4). Reinstatement therefore always reflects fresh, recorded evidence — never a flag toggle.

When `verify(verification_result=passed)` against an Unverified party drives the Unverified → Verified transition, the action returns both the new `verification_id` and the new `state_change_id`. The two ids refer to different facets of the same event-time: the verification event records the inputs and result of the verification (method, evidence, actor); the state-change event records the transition itself (prior state, new state, actor, timestamp). Composing patterns bind to the appropriate id — Actor Identity attestation of the verification action binds to `verification_id`; Actor Identity attestation of the state transition and Audit Trail tamper-evident recording bind to `state_change_id`. Returning both ids directly keeps the verify-driven state change symmetric with suspend/reinstate/close and removes the need for a follow-up query.

`close` is callable from any non-Closed state. Enrolling a party and immediately closing it (enrollment-in-error) is a valid sequence; the record persists in Closed with the stated reason, giving the audit trail evidence of the error. There is no way to retroactively hide an enrollment; the atom's delete-surface absence is structural.

No action modifies enrollment fields (`name`, `date_of_birth`, `document_type`, `document_ref`, `enrolled_at`, `enrolling_actor_ref`) after `enroll`. A legal name change, document renewal, or address update does not modify the enrollment record — those are events in the party's real-world attributes that compose via an Attribute Update pattern. The enrollment record captures what was known and verified at the time of onboarding; subsequent changes layer on top without overwriting the original.

### Feedback

Each successful action produces an observable, measurable change:

- After `enroll` — a new party appears in Unverified with fresh `party_id` and `enrolled_at`. Total party count increases by one.
- After `verify` — a new verification event appears in the party's event list, with fresh `verification_id` and `verified_at`. If the result was `passed` and the party was Unverified, the party's state is now Verified (observable on the party record), a state-change entry appears with a fresh `state_change_id` returned to the caller alongside the `verification_id`, and the Unverified-count decreases by one while the Verified-count increases by one. If the party was Suspended or Verified at call time, the state is unchanged, the event count grows by one, and only `verification_id` is returned.
- After `suspend` — the party's state is Suspended. A state-change entry appears on the party record with a fresh `state_change_id` (returned to the caller), prior state (Verified), new state (Suspended), `suspending_actor_ref`, timestamp, and reason. Verified-count decreases by one; Suspended-count increases by one.
- After `reinstate` — the party's state is Verified. State-change entry appended; fresh `state_change_id` returned to caller. Suspended-count decreases by one; Verified-count increases by one.
- After `close` — the party's state is Closed. State-change entry appended; fresh `state_change_id` returned to caller. The relevant state-count (Unverified, Verified, or Suspended) decreases by one; Closed-count increases by one. Total party count is unchanged.

Each rejected action produces an observable refusal with a named reason. The state-count segmentation (Unverified, Verified, Suspended, Closed) is computable from the party record set at any time; the atom does not maintain pre-aggregated counters but does not hide the underlying records.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

**Invariant 1 — Party record permanence.** Once enrolled, a party record is never deleted from the system. The `party_id` returned by a successful `enroll` call is durably persisted and remains in the system indefinitely, regardless of subsequent state transitions including `close`. A `storage-failure` rejection on `enroll` guarantees no partial record was written.

**Invariant 2 — State membership exclusivity.** Every party known to the system is in exactly one of {Unverified, Verified, Suspended, Closed} at all times.

**Invariant 3 — Closed is absorbing.** Once a party enters Closed, no action transitions it elsewhere. `verify`, `suspend`, and `reinstate` against a Closed party are rejected.

**Invariant 4 — Verified requires a passed verification after the most recent suspend.** A party in Verified state has at least one verification event with `verification_result = passed` recorded after the most recent `suspend` action in insertion order (or, if never suspended, after `enroll`). The atom enforces this invariant directly: the only paths to Verified state are (a) `verify(verification_result=passed)` against an Unverified party, which records the required `passed` event as part of the transition, and (b) `reinstate` against a Suspended party, where `reinstate` itself requires at least one passed verification recorded after the most recent suspend before it will succeed. There is no action sequence the atom accepts that produces a Verified party without the required passed verification on record.

**Invariant 5 — Verification events are immutable.** Once recorded, a verification event's `verification_id`, `party_id`, `verifying_actor_ref`, `verification_method`, `verification_result`, `evidence_ref`, and `verified_at` never change.

**Invariant 6 — Verification events are append-only in insertion order.** Verification events are only added to the set in insertion order; no event is removed and no event is inserted before any prior event. The verification event list of any party grows monotonically in length.

**Invariant 7 — Enrollment fields immutable under the atom's action contract.** No action exposed by this atom modifies `name`, `date_of_birth`, `document_type`, `document_ref`, `enrolled_at`, or `enrolling_actor_ref` after `enroll`. The Retention Window composition may scrub identifiable fields (`name`, `date_of_birth`, `document_ref`) under GDPR Article 17 erasure obligations or post-retention obligations; that scrubbing operates outside the atom's action contract and is recorded as a Retention Window event with attribution. `party_id`, `enrolled_at`, and `enrolling_actor_ref` survive scrubbing as the record's durable audit-identifier surface, so the chain of custody — who enrolled this party, when, and the full event history — remains traceable even after personal data is removed.

**Invariant 8 — State-change events are auditable.** Every transition (Unverified → Verified, Verified → Suspended, Suspended → Verified, any → Closed) produces a durable state-change entry on the party record with a fresh `state_change_id`, naming the prior state, new state, acting actor reference, and timestamp. `reason` is present for `suspend`-, `reinstate`-, and `close`-driven transitions; it is absent for `verify`-driven transitions (the `verify` action carries no `reason` field). No state transition is silent.

**Invariant 9 — Id stability.** A party's `party_id` is set on `enroll` and never changes. A verification event's `verification_id` is set on `verify` and never changes. A state-change event's `state_change_id` is set when the event is written and never changes.

**Invariant 10 — No id reuse.** No two parties share a `party_id`; no two verification events share a `verification_id`; no two state-change events share a `state_change_id`, across the lifetime of the system.

**Invariant 11 — Action atomicity.** Each action either commits all of its intended records — party record, verification event, state-change event, as applicable to the action — or none. A `storage-failure` rejection on any action guarantees no partial record, across any record type written by that action, has been persisted. The verify-on-Unverified case writes both a verification event and a state-change event in a single atomic unit; if either write fails, neither is persisted and the action returns `storage-failure`. Suspend, reinstate, and close each write a single state-change event; enroll writes a party record. The total count of party records is monotonically non-decreasing.

Invariants 1, 5, 6, and 8 together give the *identity chain-of-custody* property: the full history of a party's identity — who enrolled them, every verification attempt, every state change — is recoverable from the records alone and cannot be silently altered. Each state-change event is individually addressable by `state_change_id`, so Actor Identity attestations and Audit Trail entries can reference a specific suspension or closure event by id. Invariant 4 gives the *verification integrity* property: Verified state is not self-asserted. Invariant 3 gives the *terminal closure* property: a closed party cannot be silently reopened.

---

## Examples

The same atom, four regulated domains, identical mechanic.

### Banking — Customer Onboarding under BSA/AML

A bank onboards a new retail customer. The officer collects identity attributes and runs the CIP (Customer Identification Program — the BSA/AML requirement to collect and verify minimum customer-identity data) verification workflow.

1. `enroll(name="Amara Osei", date_of_birth="1981-03-14", document_type="passport", document_ref="doc_p901", enrolling_actor_ref="officer_r3") → party_id = party_9017`
2. Automated OCR (Optical Character Recognition — software that extracts text from images of documents) system checks the passport. `verify(party_id="party_9017", verifying_actor_ref="system_verification_auto", verification_method="automated-ocr", verification_result="passed", evidence_ref="evidence_ocr_442") → (verification_id = verif_1101, state_change_id = sc_4401)` — party transitions Unverified → Verified; both ids returned so Actor Identity attestation of the verification can bind to `verif_1101` and Actor Identity attestation of the state transition can bind to `sc_4401`.
3. The Customer Onboarding composition gates account opening on the party being Verified; account_a883 is opened and linked to party_9017.
4. Six months later, annual re-verification. `verify(party_id="party_9017", verifying_actor_ref="officer_r3", verification_method="manual-document-review", verification_result="passed", evidence_ref="evidence_doc_556") → (verification_id = verif_1184, state_change_id = absent)` — party remains Verified; second verification event appended; no state-change event produced because the party was already Verified.
5. Ten years later, account closure. `close(party_id="party_9017", closing_actor_ref="officer_r3", reason="account-closed-customer-request-26-05-14") → state_change_id = sc_4988` — party enters Closed. BSA requires retention of CDD records for 5 years after closure; the Retention Window composition governs the record's lifetime from this point.

### Healthcare — patient identity enrollment under HIPAA

A hospital registers a new patient presenting for emergency treatment.

1. `enroll(name="Bui Thi Thu", date_of_birth="1994-07-22", document_type="national-id", document_ref="doc_n402", enrolling_actor_ref="registrar_h7") → party_id = party_4451`
2. Registrar verifies the document manually. `verify(party_id="party_4451", verifying_actor_ref="registrar_h7", verification_method="manual-document-review", verification_result="passed", evidence_ref="evidence_img_204") → (verification_id = verif_2019, state_change_id = sc_2201)` — party transitions Unverified → Verified.
3. Clinical record creation is gated on party_4451 being Verified; encounter enc_7723 is created and linked to party_4451.

### Financial services — sanctions match and resolution

An existing customer, party_7732 (Verified), triggers a sanctions screening alert.

1. `suspend(party_id="party_7732", suspending_actor_ref="compliance_mgr_01", reason="potential-ofac-sdn-match-entry-ref-12894") → state_change_id = sc_7701` — party enters Suspended. Downstream systems observe the Suspended state and freeze new transaction initiation.
2. Premature reinstate attempt before fresh evidence is on file: `reinstate(party_id="party_7732", reinstating_actor_ref="compliance_mgr_01", reason="dispute-cleared-by-phone") → rejected(no-passed-verification-since-suspend)` — the atom rejects the call because no verification event with `verification_result = passed` has been recorded after `sc_7701`. The compliance team cannot toggle the party back to Verified without recording fresh evidence first; the rule is enforced by the atom rather than by workflow discipline.
3. Compliance team gathers additional verification. `verify(party_id="party_7732", verifying_actor_ref="compliance_analyst_02", verification_method="database-check", verification_result="passed", evidence_ref="evidence_db_ofac_clearance_882") → (verification_id = verif_3901, state_change_id = absent)` — event recorded; party remains Suspended; no state-change event produced because verify against a Suspended party does not change state.
4. Investigation confirms mismatch; officer reinstates. `reinstate(party_id="party_7732", reinstating_actor_ref="compliance_mgr_01", reason="ofac-match-resolved-different-individual-confirmed") → state_change_id = sc_7702` — party returns to Verified; the `passed` verification recorded at step 3 satisfies the fresh-verification precondition.

Alternative closing path (match confirmed): `close(party_id="party_7732", closing_actor_ref="compliance_mgr_01", reason="ofac-sdn-match-confirmed-account-terminated") → state_change_id = sc_7703` — party enters Closed.

### Enrollment-in-error — rejection path into closure

1. `enroll(name="Test Entry", date_of_birth="2000-01-01", document_type="passport", document_ref="doc_p000", enrolling_actor_ref="officer_r7") → party_id = party_9030`
2. Officer identifies this as a test entry made in the production system.
3. Attempted deletion: no deletion surface exists (Invariant 1). The correct action: `close(party_id="party_9030", closing_actor_ref="officer_r7", reason="enrolled-in-error-test-entry-production") → state_change_id = sc_9131` — party enters Closed.
4. The record persists in Closed. The audit shows who enrolled it, when, and who closed it and why. The error is auditable; it is not hidden.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit — "show me every party that proceeded to regulated activity without a verified identity, and every party reinstated without fresh evidence."** The auditor's first query is for any regulated activity record linked to a `party_id` in Unverified or Closed state; Invariant 4 is the structural answer for the verification chain — the only paths to Verified state are `verify(verification_result=passed)` from Unverified and `reinstate` from Suspended, and `reinstate` itself requires a `passed` verification event recorded after the most recent `suspend` in insertion order. The auditor's second query — "any party currently in Verified state whose verification chain breaks at the most recent suspend" — is structurally empty by Invariant 4: the atom rejects `reinstate` calls that would produce such a state, so no party in Verified state can lack the required passed-verification record. Any composing system that gates regulated activity on the party being in Verified state can demonstrate compliance from the records alone; the party's state-change log and verification event list answer both queries without developer narration. The auditor does not need to trust the system's claim; they can reconstruct any party's state at any point in insertion order from the state-change log (Invariant 8), and the Trusted Timestamping composition supplies the wall-time anchor when the audit query is bounded by clock time rather than event index.

**Disputed identity — "the party claims they were never verified; show me the verification chain."** The party (or their counsel) challenges the claim that their identity was verified before account opening. The investigator retrieves the verification event list for the `party_id`: each event names `verifying_actor_ref`, `verification_method`, `evidence_ref`, and `verified_at`. Invariant 5 (immutability) and Invariant 6 (append-only) establish that no verification event can have been altered or inserted after the fact. The `evidence_ref` on each `passed` event points to the document or database record that supported the verification — the dispute is resolved by producing the evidence record alongside the immutable verification event. If the `evidence_ref` record cannot be produced, the verification event is an unsubstantiated claim; that is an evidence-management failure at the document store, not a Party Identity failure.

**Breach or incident investigation — "during the breach window, which verified parties' records may have been accessed or altered?"** An incident investigator is given a time window (e.g., 2026-04-01 through 2026-04-15) and needs to reconstruct which Party Identity records were in Verified state during that window and which state changes occurred. The state-change log (Invariant 8) records every transition in insertion order with a wall-time timestamp; the investigator replays each party's log in insertion order to determine its state at the window's start and end. The verification event list (Invariant 6, append-only in insertion order) shows what verification evidence was on file during the window. Together, these bound the scope of affected records from the records alone, without requiring log files from an external system. The atom's append-only, immutable-event discipline forecloses the possibility that an attacker altered the verification history to conceal unauthorized state changes; any gap in the state-change log is itself a finding. Where the breach scope requires wall-time bounds (rather than event-index bounds), the Trusted Timestamping composition supplies the time-anchor that binds insertion order to externally-verifiable wall-time; without that composition, the investigator's reconstruction is event-index-authoritative and timestamps are advisory only.

---

## Generation acceptance

A derived implementation of Party Identity is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the party record set and the verification event set, can do all of the following without recourse to source code, runbooks, or developer narration:

**Reconstruct any party's state at any point in the event log.** The state-change log (Invariant 8) provides a complete, insertion-ordered transition history from `enroll` through the current state. The auditor can replay the log forward in insertion order from `enroll` and arrive at the party's state as of any given event index. When the Trusted Timestamping composition binds insertion order to verifiable wall-time, the auditor can also arrive at the party's state as of any given wall-time instant; without that composition, the reconstruction is event-index-authoritative and timestamps are advisory.

**Verify that every party in Verified state has at least one passed verification event after the most recent suspend.** Query the verification event set for each party in Verified state; confirm the existence of a `verification_result = passed` event recorded after the most recent `suspend` action in insertion order (or after `enroll` if never suspended). Invariant 4 makes this set structurally non-empty for every Verified party — the atom enforces the condition directly at `reinstate` time via the `no-passed-verification-since-suspend` rejection, so the records cannot exhibit a Verified party that fails this check. The auditor sees the structural guarantee, not a procedural claim.

**Confirm that every verification event is attributed to an actor and method.** Each event records `verifying_actor_ref`, `verification_method`, `evidence_ref`, and `verified_at`. An auditor can trace every verification decision to the actor and method that produced it, and to the evidence record that supported it, from the event store alone.

**Trace the complete lifecycle of any party from enrollment to current state.** The enrollment fields (Invariant 7) capture the initial attributes; the state-change log (Invariant 8) captures every subsequent transition; the verification event list (Invariants 5–6) captures the complete verification history. Together they form a complete, time-ordered, append-only biography of the party record.

**Identify every party currently in each state.** The current state field on each party record, queryable as a set, partitions the party population into Unverified, Verified, Suspended, and Closed. Counts per state are derivable from the set.

**Identify the composing patterns active in this deployment.** Whether Actor Identity attestation is wired into state transitions (attributing each `suspend`, `reinstate`, `close` action to a verifiable proof), whether Audit Trail is active for tamper-evident recording, whether Retention Window governs party record lifetime, and whether ongoing monitoring is wired to produce periodic `verify` calls.

---

## Edge cases and explicit non-goals

What this atom does not cover:

**Duplicate detection and deduplication.** The atom does not detect or prevent two `party_id` records for the same natural person or entity. Detecting that two enrollments represent the same individual — whether by biometric match, document comparison, or external identity resolution — is a composing concept. The atom models the lifecycle of a single party record; the graph of records and their deduplication relationships is external.

**Identity attribute updates.** No action modifies `name`, `date_of_birth`, `document_type`, or `document_ref` after enrollment. A legal name change, document renewal, or address update does not overwrite the enrollment fields. The principle: the enrollment record is the auditable original, capturing what was known at onboarding. The objection: real parties' attributes change and the system must reflect current information. The mechanism: a composing Attribute Update pattern appends versioned attribute events to the party record without mutating the enrollment fields; queries that need the current view read the latest attribute event; queries that need the at-time-of-onboarding view read the enrollment fields. The result: the audit trail for any party's attributes is complete and no prior state is silently overwritten. Attribute Update is distinct from retention-driven anonymization (Invariant 7): Attribute Update layers new attribute values without removing the original; Retention Window scrubbing removes personal data entirely when retention or erasure obligations require it. The two compositions operate on different lifecycle events with different audit semantics — attribute update preserves history; anonymization removes personal data while preserving the audit identifier.

**The verification workflow.** What happens *during* verification — document OCR, biometric check, sanctions database query, adverse media search — is not modeled by this atom. The atom records that a verification was performed, by whom, using what method, with what result, against what evidence. The workflow that produces those inputs is a composing Customer Onboarding / AML verification pattern.

**Ongoing monitoring scheduling.** Periodic re-verification, sanctions re-screening, PEP (Politically Exposed Person — a category of high-risk client in financial regulation, such as a foreign government official or their close associate) re-check — these are composing patterns that call `verify` on a schedule or trigger basis. The atom records each result; the scheduling policy is external.

**Risk scoring and enhanced due diligence.** Whether a party requires enhanced due diligence based on risk factors (country of origin, transaction volume, PEP status) is a composing concept. The atom records identity and verification lifecycle; risk classification and EDD orchestration belong to the Customer Onboarding composition.

**Beneficial ownership.** A beneficial owner of a legal entity is a Party Identity record in their own right; the relationship between the beneficial owner and the entity (ownership percentage, control type) is a composing Ownership Structure pattern. The atom records each party independently; the ownership graph does not belong to this atom.

**Authorized representatives and power of attorney.** An individual acting on behalf of a party — guardian, attorney-in-fact, corporate officer — is a composing Delegation / Representation pattern. The atom records the party being represented; the representative's authority is separate.

**Cross-system identity portability.** `party_id` is opaque and scoped to the issuing system. Linking a `party_id` in one system to a record in another trust domain belongs to an Identity Federation composing pattern.

**Notification of state changes.** When a party is Suspended or Closed, downstream systems may need to freeze activity (block transactions, freeze accounts, suppress notifications). Propagating state changes to downstream systems composes with Subscription and Notification; it is not the atom's responsibility.

**Retention of party records.** Invariant 1 guarantees party records are never deleted by the atom, but does not set the retention policy governing how long records must be actively accessible before archival or anonymization. FATF and BSA/AML require retention of CDD records for at least five years after the business relationship ends; GDPR Article 17 creates competing erasure obligations that legal counsel adjudicates. The Retention Window composition governs this lifecycle and is the only mechanism authorized to scrub identifiable enrollment fields (`name`, `date_of_birth`, `document_ref`) under Invariant 7. The audit-identifier fields (`party_id`, `enrolled_at`, `enrolling_actor_ref`) and the full event history (verification events, state-change events) survive scrubbing — the chain of custody remains intact for any party whose personal data has been anonymized, so a regulator can still confirm that the party's lifecycle existed and reconstruct its sequence of state transitions even when the personal attributes have been removed.

**What "Closed" means for existing open commitments.** Closing a party prevents new regulated activity but does not automatically terminate existing open accounts, positions, or contracts. The composing system owns the policy for unwinding open commitments against a Closed party; the atom's contract is that `verify`, `suspend`, and `reinstate` are rejected for Closed parties, signaling to composing systems that the party is no longer eligible for new activity.

**Concurrency.** Concurrent state transitions for the same `party_id` (e.g., simultaneous `suspend` and `close` calls) resolve under the host environment's serialization guarantees. The first wins; the second observes the updated state and is rejected accordingly (`already-closed`, `already-suspended`, `not-suspended`, etc.). Multi-action transactions belong to a Transaction composition.

**Asynchronous verification workflows.** The `verify` action takes `verification_result` as a field that must be `passed` or `failed` at call time. The atom does not model in-progress or pending verification states. Real-world verification workflows are frequently asynchronous — a document is submitted, an external service runs a check, and the result arrives seconds to days later. The composing workflow owns this coordination: the party remains in Unverified while the external check runs; when the result is known, the composing workflow calls `verify` with the outcome. The atom's `verification_result` field is the recording surface for a result that has already been determined; the orchestration of asynchronous determination is a composing concept.

**Clock semantics.** State-change timestamps and verification timestamps come from an implicit clock. Where onboarding and verification timestamps have legal force (FATF, BSA/AML require recording when CDD was performed), implementations must source time from a trustworthy clock. Trusted Timestamping composes to supply a verifiable time-anchor.

Where the atom breaks down: when the same natural person must hold multiple concurrent identity records under different regulatory regimes (some regulated domains require jurisdiction-specific records that cannot share a single `party_id`); when the verification obligation requires real-time sanctions database access that the atom cannot gate on (the atom records the result but cannot enforce that the lookup was performed — the composing workflow owns that guarantee); when personal data must be purged under GDPR Article 17 while a BSA/AML retention obligation is still active (the legal tension is real and the resolution belongs to legal counsel and the Retention Window + Consent compositions, not to this atom).

---

## Composition notes

Party Identity is freestanding and is the external-party identity contract that regulated composing systems declare:

- **[Consent](./consent.md)** — Party Identity establishes *who* the party is; Consent establishes *what* the system may do with or to their data. Every system that both identifies and processes personal data for an external party composes both. Consent basis is checked per processing action against the party's Consent record; the party's `party_id` is the data subject reference in the Consent atom.
- **[Actor Identity](./actor-identity.md)** — each `verify`, `suspend`, `reinstate`, and `close` action should be attested by the internal actor performing it; the `*_actor_ref` fields are the attribution surface. Actor Identity supplies the non-repudiable proof that a specific actor authorized each state transition. Customer Onboarding wires Actor Identity into every state-changing call.
- **[Retention Window](./retention-window.md)** — Invariant 1 makes party records permanent from the atom's perspective, but the composing system places the party record under a retention policy that governs how long the record is actively accessible and when archival or anonymization becomes permitted. BSA/AML requires five years post-closure; GDPR Article 17 erasure obligations compose through legal counsel adjudication.
- **[Audit Trail](../compositions/audit-trail.md)** — every state transition event and verification event should be surfaced through the Audit Trail composition for tamper-evident, attribution-stamped recording that survives the Audit Trail's own regulated adversarial scenarios.
- **[External Onboarding](../compositions/external-onboarding.md)** — accepts an authorized invitation and calls `Party Identity.enroll` to create the party record in `Unverified` state, establishing the identity-binding at accept time. The `accepting_identity_ref` supplied at `Invitation.accept` and the resulting `party_id` are both named in the Audit Trail completion record, making the chain from invitation to enrolled party reconstructable from records alone.
- **[Customer Onboarding](../compositions/customer-onboarding.md)** — the primary composition that names this atom. Gates regulated activity on the party being in Verified state; orchestrates the verification workflow; handles ongoing monitoring via periodic `verify` calls; composes Actor Identity for attestation and Retention Window for record lifetime.
- **Identity Document Store** *(forthcoming)* — holds the document records that `document_ref` and `evidence_ref` reference. The atom treats both as opaque; the document store's content is the external evidence supporting each verification.
- **Attribute Update** *(forthcoming)* — handles changes to `name`, `date_of_birth`, or document references for an existing party. Appends versioned attribute events without mutating enrollment fields.
- **Ownership Structure / Beneficial Owner** *(forthcoming)* — models the ownership relationships between Party Identity records (individuals, legal entities, beneficial owners). Each beneficial owner is a Party Identity record; the graph of relationships is the composition.
- **Identity Federation** *(forthcoming)* — links `party_id` records across trust domains; handles cross-system identity resolution.
- **Delegation / Representation** *(forthcoming)* — models authorized representatives (guardians, attorneys-in-fact, corporate officers) acting on behalf of an enrolled party.

---

## Standards references

- **FATF Recommendations 10–12** — Customer Due Diligence: identify the customer and verify identity using reliable, independent source documents, data, or information; identify and verify beneficial owners; understand the ownership and control structure; conduct ongoing due diligence on the business relationship. The atom's `enroll` / `verify` lifecycle is the structural form of FATF's CDD obligation.
- **Bank Secrecy Act / Anti-Money Laundering — 31 CFR Part 1020 (FinCEN — the US Financial Crimes Enforcement Network)** — Customer Identification Program: minimum identity attributes (name, date of birth, address, identification number), verification using documentary or non-documentary methods, and record retention for five years after account closure or the date the record was made. The atom's `verification_method` and `evidence_ref` fields satisfy the CIP's recording requirements.
- **FinCEN Beneficial Ownership Rule — 31 CFR §1010.230** — legal entity customers must identify and verify beneficial owners owning ≥25% and a single control person. Each beneficial owner is a Party Identity record; the Ownership Structure composition holds the ≥25% relationship graph.
- **EU 5th Anti-Money Laundering Directive (AMLD5)** — enhanced CDD requirements including beneficial ownership registries; alignment with FATF.
- **GDPR Article 4(1)** — the identity attributes collected by this atom (name, date of birth, document type and reference) are personal data under GDPR; all processing is subject to Articles 5–6.
- **GDPR Articles 5–6** — lawful basis for processing identity data; typically Article 6(1)(c) (legal obligation) or Article 6(1)(b) (performance of a contract). The Consent composition governs data processing *beyond* the regulatory obligation.
- **GDPR Article 17** — right to erasure; creates tension with BSA/AML and FATF retention obligations. The atom does not resolve this tension (see Edge cases); Retention Window + legal counsel adjudication composes for this.
- **HIPAA 45 CFR §164.514** — patient identity is required for the creation of protected health information records; the patient is a Party Identity in the healthcare context.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63A (Identity Assurance Levels)** — IAL1, IAL2, IAL3 (Identity Assurance Levels — graded strength of identity proofing: self-asserted, remote with document evidence, in-person with biometric). The atom's `verification_method` field implicitly captures the IAL level; explicit IAL tagging and method-to-IAL mapping is a composing concept.
- **ISO/IEC 29115 (Entity Authentication Assurance)** — the International Organization for Standardization / International Electrotechnical Commission analog to NIST SP 800-63A; defines four levels of entity authentication assurance. The atom's `verification_method` field is the recording surface for the assurance level achieved.
- **OFAC SDN Compliance** — the US Office of Foreign Assets Control's sanctions screening requires parties to be checked against the SDN (Specially Designated Nationals) list; the `suspend` → investigate → `reinstate` or `close` lifecycle is the operational form of a sanctions match process. The atom records the lifecycle; the screening system is a composing concept.

---

## Status

`grounded on Final Critique 4 — 2026-05-20` (formal layer landed 2026-06-03 — TLA+ model `party-identity.tla` authored and verified, plus a buggy twin the checker rejects; see Lineage §Formal model. Cleared `grounded (English) — formal layer pending`, which it briefly held after the 2026-06-03 formal-layer vote.) — foundation round complete (Pass 1 GRID — the nine-node structural-completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof; Pass 2 EOS, Pass 3 Linus all run; findings closed). Phase 4 Opus clearance gate (Angry Torvalds X2) ran against the foundation draft, surfaced six findings, and returned clean after all six were closed in-pattern. The gate also served as the closing AI adversarial round (Phase 3) given the gate's fresh-reader, full-three-pass coverage. Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's Opus clearance gate is retro-labeled Final Critique 4; the original round-naming in the Lineage notes below is preserved as historical record.

---

## Lineage notes

Party Identity began as the #6 atom in the ROADMAP's draft order. The foundation round (Pass 1 GRID, Pass 2 EOS, Pass 3 Linus) ran against the initial draft and produced the entries below; the Phase 4 Opus clearance gate ran against the post-foundation spec, surfaced six findings, and returned clean after all six were closed in-pattern. As of 2026-05-14 the atom is `grounded`.

The regulated-overlay conventions (Regulated adversarial scenarios and Generation acceptance) are included from the first draft in accordance with the methodology's inheritance discipline documented in pressure-testing.md and established by Actor Identity and Retention Window. This atom cites the methodology directly rather than treating either predecessor as its canonical reference.

Three composing patterns named throughout this draft — Consent (grounded 2026-05-13), Actor Identity (grounded 2026-05-13), and Customer Onboarding (grounded on Final Critique 4, 2026-06-03) — are all available; forthcoming-link markers for those three are resolved. The remaining forthcoming-link debts (Identity Document Store, Attribute Update, Ownership Structure, Identity Federation, Delegation / Representation) are named explicitly and will resolve as those patterns land.

**Pass 1 — Structural completeness (GRID). One finding, closed in-pattern.**

All nine GRID nodes resolved. Reference graph clean — Friction items reference specific composing patterns; Decisions link to State transitions and rejection paths; Proof (Invariants + Generation acceptance) links to Intent. One finding: `suspend`, `reinstate`, and `close` returned `ok` despite now creating state-change events with `state_change_id`. The `enroll` / `verify` pattern — returning the id of the created record — is the correct discipline because the caller needs the id to pass to Actor Identity for attestation without a follow-up query. Resolved: all three actions updated to return `state_change_id`; Outputs and Feedback sections updated to match.

**Pass 2 — Conceptual independence (EOS). Clean.**

Eleven concerns examined; all correctly named as composing patterns or explicit non-goals. State-change log as a sub-record of the party record was tested against Event Log: the state-change log is tightly bound to the party record's lifecycle, not a general-purpose system event stream — different concern, different state machine, correctly scoped here. The `*_actor_ref` fields assert attribution without cryptographic binding; Actor Identity composes to add non-repudiation — correctly external. No over-absorptions.

**Pass 3 — Adversarial scrutiny (Linus mode), applied to the foundation draft. Five findings, all closed in-pattern.**

- *`suspend` and `reinstate` action signatures missing `already-closed`.* Decision points named `already-closed` as a rejection reason for both actions when the party is Closed, but the Inputs signatures only listed `not-known | not-verifiable | invalid-request | storage-failure` and `not-known | not-suspended | invalid-request | storage-failure` respectively. Inconsistency between signature and logic. Resolved: `already-closed` added to both signatures.

- *`not-verifiable` conflated Unverified and Suspended.* `suspend` returned `not-verifiable` for both an Unverified party (never verified — correct semantics) and a Suspended party (already suspended — double-suspend, different semantics). A composing system receiving `not-verifiable` could not distinguish the two without re-querying state. Resolved: `already-suspended` added as a separate rejection reason for the double-suspend case; `not-verifiable` retained for the Unverified case; both named and distinguished in Decision points and the transition table. `not-suspended` for `reinstate` is intentionally kept as a single code for both Unverified and Verified parties — both mean "no active suspension to lift" and the rejection semantics are the same; the Decision points entry names this choice explicitly.

- *State-change events had no individual id, asymmetric with verification events.* Verification events carried `verification_id`; state-change events accumulated as a log with no individual addressability. This meant Actor Identity attestations and Audit Trail entries could not reference a specific suspension or closure event by id. Resolved: `state_change_id` (opaque, immutable, system-generated) added to each state-change event; Identity model, State section, Feedback, Invariants 8–10, and the chain-of-custody paragraph all updated.

- *Invariant 8 "(where applicable)" undefined.* The invariant stated state-change entries include "reason (where applicable)" without defining when reason is absent. Applicable meant: present for `suspend`/`reinstate`/`close`-driven transitions, absent for `verify`-driven Unverified → Verified transitions (which carry no `reason` field). Resolved: Invariant 8 rewritten to state the condition explicitly; the state-change log field description in State section updated to match.

- *Async verification not named as explicit non-goal.* The `verify` action takes `verification_result` at call time, implying the result is known before the call. Async verification workflows — document submitted, result arrives later — are the common case in practice. The composing workflow's role (hold the party in Unverified, call `verify` when the result arrives) was not named. Resolved: "Asynchronous verification workflows" added to Edge cases.

**Phase 4 — Opus clearance gate (Angry Torvalds X2), Opus 4.7. Six findings, all closed in-pattern.**

The clearance gate ran with fresh-reader discipline: full pass question sets and the foundation-draft spec, no author intent or prior-round commentary beyond what the spec itself stated. Pass 1 and Pass 2 returned clean at standard intensity. Pass 3 ran at X2 — defenses attacked rather than accepted — and surfaced six findings, all of which were closed in-pattern through this round of edits. Because the foundation Pass 3 had run but no separate AI adversarial round (Phase 3) had been conducted before this gate, the gate also serves as the closing AI round; the structural difference is whether the reviewer received prior-round findings as context (refinement Pass 3) or received only the spec and the question sets (fresh-reader Pass 3 — the Phase 3 and Phase 4 discipline). The reviewer received only the spec and question sets, satisfying both bars in a single round.

- *F1 — verify-driven state-change asymmetry.* `verify(verification_result=passed)` against an Unverified party drives a state transition and therefore creates a state-change event under Invariant 8, but the action signature returned only `verification_id`. The caller could not pass the state-change event id to Actor Identity for attestation or to Audit Trail for tamper-evident recording without a follow-up query — the exact asymmetry the foundation Pass 3 closed for `suspend`/`reinstate`/`close`. Resolved: verify's signature changed to `(verification_id, state_change_id?)` with `state_change_id` present iff the call drove an Unverified → Verified transition; Outputs paragraph, transitions table, Behavior, Feedback, and the banking, healthcare, and financial-services examples all updated to return and consume both ids.

- *F2 — Validation rules for required string fields inconsistent across actions; whitespace-only `reason` accepted.* The Inputs section stated `name` as "non-empty, non-whitespace-only" but `document_type`/`document_ref`/`enrolling_actor_ref` as merely "non-empty"; the enroll Decision points said all five fields "non-null, non-empty, and non-whitespace-only"; verify/suspend/reinstate/close said their fields "non-empty" with no whitespace check. The audit-load-bearing `reason` field could therefore be a single space or tab — a regulator reading the state-change log could not distinguish a meaningful reason from a placeholder. Resolved: uniform "non-empty, non-whitespace-only" rule stated at the top of Decision points and applied across all required string fields (names, document attributes, actor references, verification metadata, reasons); Inputs section updated to match.

- *F3 — Invariant 4 unenforceable by `reinstate`.* Invariant 4 claimed a Verified party has at least one passed verification "after the most recent suspend," but `reinstate` did not require any verification between suspend and reinstate — an explicit "the compliance team gathers fresh evidence" discipline lived in examples and Behavior narration, not in the atom's action contract. Reachable sequence enroll → verify(passed) → suspend → reinstate produced a Verified party with no passed verification after the most recent suspend, violating Invariant 4 from action sequences the atom accepted. Resolved (option a — atom-enforced): new rejection reason `no-passed-verification-since-suspend` added to `reinstate`'s signature; Decision points for reinstate gained the fresh-verification precondition with defended-in-line rationale; priority ordering for reinstate stated explicitly (state-validity before semantic-precondition before field-format); transitions table split the Suspended-reinstate row into "with fresh verify" and "without fresh verify"; Invariant 4 rewritten to state that the atom enforces the condition directly via `reinstate`'s precondition; financial-services example walks the premature-reinstate rejection path before the success path; Generation acceptance check 2 updated to surface the structural enforcement. Rule: a suspension represents revoked trust in the prior verification; reinstatement reflects fresh evidence rather than a flag toggle, and every composing pattern inherits this discipline automatically.

- *F4 — Multi-event action atomicity unspecified.* `verify(verification_result=passed)` against an Unverified party writes two records (a verification event and a state-change event); Invariant 11 said "no partial write" without specifying whether the two writes are atomic together. A partial outcome could either produce a Verified party with no state-change event (Invariant 8 violation) or a recorded passed verification with no corresponding state transition. Resolved: Invariant 11 rewritten as "Action atomicity" — each action commits all of its intended records or none, across any record type written by that action; the verify-on-Unverified two-write case is named explicitly as a single atomic unit.

- *F5 — Temporal ordering ambiguous under deferred clock semantics.* Invariant 4's "after the most recent suspend," Invariant 6's "monotonically growing," and the state-change log's "time-ordered" phrasing all used temporal language while clock semantics were explicitly deferred (skew, monotonicity, timezone). Under clock skew, timestamp-order and insertion-order can diverge; the spec did not say which was authoritative. Resolved: a new Ordering paragraph in the State section pins insertion order as authoritative; all "after"/"between"/"most recent" references now mean by insertion order; timestamps are advisory wall-time metadata; the Trusted Timestamping composition supplies a verifiable time-anchor when wall-time bounds are required. Invariants 4 and 6 rephrased to use insertion-order language; Generation acceptance and the breach-investigation adversarial scenario updated to reflect event-index-authoritative reconstruction with Trusted Timestamping as the optional wall-time anchor.

- *F6 — Invariant 7 conflicted with Retention Window anonymization.* Invariant 7 declared enrollment fields immutable while Composition notes and Edge cases named Retention Window as the composition permitted to anonymize personal data under GDPR Article 17 or post-retention obligations. Anonymization of `name`, `date_of_birth`, or `document_ref` would mutate fields the invariant declared immutable. Resolved: Invariant 7 qualified to "immutable under the atom's action contract"; the surviving audit-identifier set (`party_id`, `enrolled_at`, `enrolling_actor_ref`) named explicitly; Retention Window's authorization to scrub identifiable fields stated in both Invariant 7 and the "Retention of party records" edge case; the Attribute Update / Retention Window distinction surfaced in "Identity attribute updates" so the two compositions' audit semantics are not conflated.

Gate re-run after the six fixes returned clean across all three passes. Status promoted from `partially resolved` to `grounded` with rescan date 2026-05-14.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 4 (Verified requires a `passed` verification after the most recent suspend in insertion order) is an ordering-across-action-sequences claim across verify/suspend/reinstate interleavings; Invariant 6 append-only insertion order. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** The derived model is [`party-identity.tla`](./party-identity.tla) with config [`party-identity.cfg`](./party-identity.cfg), checked by the repo's `tla-checker` WASM model checker via `tools/harness/check.mjs`.

*What it checks.* The model is a single-party state machine over the five lifecycle actions (`verify(passed)`, `verify(failed)`, `suspend`, `reinstate`, `close`), with the party's event stream modeled as an **insertion-ordered log** (a function `1..MaxEvents -> Event`, `len` filled slots; the Sequences module is deliberately avoided to stay within the checker's supported fragment, matching the existing composition models). Four named safety invariants are checked under every reachable interleaving: **Invariant 2** (state membership exclusivity), **Invariant 3** (Closed is absorbing — history-flag form: `everClosed ⇒ pstate = Closed`), the load-bearing **Invariant 4** (Verified ⇒ a `passed` verification exists after the most recent suspend in insertion order), and **Invariant 6** (append-only in insertion order — `Inv6_AppendOnlyPrefix`: the log is a contiguous filled prefix, `i ≤ len ⇔ log[i] ≠ empty`; promoted from a by-construction assumption to an explicit check by the 2026-06-03 coverage cross-check — see below). Invariant 4 is *derived from the log* (`HasPassedAfterSuspend` — a `vp` with no `sus` after it), not tracked as a flag updated by the reinstate guard, so the check is evaluated against the actual insertion-ordered history rather than begging the question.

*Bounds and scope.* `MaxEvents = 6` (room for the longest interesting sequence, `verify(passed) → suspend → verify(passed) → reinstate`, with slack). Exhaustive: 532 reachable states, all invariants hold. Deliberately **out of model scope** — field-format and `storage-failure` rejection guards (pre-write, not ordering claims); multi-record action atomicity (Invariant 11, a within-action property); multi-party id uniqueness (Invariants 9–10, structural — Alloy's bounded-structural surface is the right tool there, not TLC). **Coverage cross-check, 2026-06-03 — Invariant 6 promoted.** The first coverage cross-check (pressure-testing.md §"The coverage cross-check") flagged that Invariant 6, *named load-bearing by the formal-layer vote*, was only enforced *by construction* (every action appends one event and `len` only increments) rather than asserted. Per the coverage discipline it was promoted to an explicit checked invariant, `Inv6_AppendOnlyPrefix == ∀ i : (i ≤ len) ⇔ (log[i] ≠ "e")`, added to both the model and its twin; the correct model still holds at 532 states (a malformed append — a hole or a write past the tail — would now be caught), the twin is still rejected via Invariant 4. This is the cross-check's first real catch, surfaced and closed.

*Buggy twin (vacuity guard).* [`party-identity-buggy.tla`](./party-identity-buggy.tla) is identical except `reinstate` drops the `HasPassedAfterSuspend` guard — i.e. it re-introduces the exact **F3** defect this atom's Phase-4 gate closed. The checker rejects it at 22 states with the counterexample `Unverified →(vp) Verified →(sus) Suspended →(rei) Verified`, log `<<vp, sus, rei>>`: a Verified party whose most recent suspend has no passing verification after it. The twin's rejection confirms the correct model's clean result is non-vacuous.

*Conflict-protocol outcome.* None triggered. The model **corroborates** the English — Invariant 4's atom-enforced `reinstate` precondition admits no violating interleaving — so no counterexample flowed back and the canonical English is unchanged (this is the model-confirms-source case, not a case-1/2/3 repair). The model's contribution is independent corroboration that the F3 fix holds under exhaustive interleaving, and a regression guard (the buggy twin) against the defect's reappearance. Reproduce with `cd tools/harness && bash bootstrap.sh && node check.mjs ../../atoms/party-identity.tla` (and `… party-identity-buggy.tla --buggy`).
