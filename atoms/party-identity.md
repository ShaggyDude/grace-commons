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

## Summary

Party Identity is a lasting, verifiable identity record for an external party — a customer, patient, counterparty, or beneficial owner (the individual who ultimately owns or controls a company). It answers the question every regulated system must settle before doing business: who is this party, and has their identity been checked?

The record keeps the party's initial enrollment, the full history of identity checks (each one's method, result, and supporting evidence), and every later change — suspension, reinstatement, closure — with who did it and why. A party is in one of four states: Unverified, Verified, Suspended, or Closed; Closed is permanent, and a party who returns after closure needs a fresh enrollment.

The central guarantee is that a party cannot be marked Verified without at least one recorded passing check since its most recent suspension — the system enforces this itself, so a downstream process can require "a verified party" and trust that the verified status rests on real, on-record evidence rather than a flipped flag.

The pattern records the results of identity checks; it does not perform them (no document scanning, biometric matching, or sanctions screening), and it does not deduplicate parties — those belong to surrounding patterns. It is the foundation for regulatory customer-identity onboarding, patient enrollment, and counterparty identity management. (It is distinct from Actor Identity, which is about internal operators signing actions; a party is verified, an actor signs.)

---

## Intent

Every regulated system that interacts with external parties — banks onboarding customers, hospitals enrolling patients, broker-dealers establishing counterparties, employers verifying staff — must establish *who* the party is before regulated activity begins, and must maintain that identity record through the party's full lifecycle. The shape is constant across domains: identity attributes are collected, verified against external evidence (government-issued document, biometric check, reference database), the party transitions to a verified state, and subsequent regulated activity can rely on the verified record. When circumstances change — a sanctions match emerges, a document expires, a legal investigation begins — the party can be suspended, re-verified, and either reinstated or permanently closed.

The compliance framing is consistent across regulatory regimes. FATF (Financial Action Task Force — the international standard-setter for anti-money-laundering and counter-terrorist-financing rules) Recommendations 10–12 require Customer Due Diligence (CDD — the process of identifying and verifying a customer's identity before establishing a business relationship) before establishing a business relationship: collect identity attributes, verify identity using reliable independent sources, understand ownership and control structures, and conduct ongoing due diligence. The BSA (Bank Secrecy Act — US law requiring financial institutions to assist in detecting money laundering) / AML (Anti-Money Laundering — regulations requiring financial institutions to detect and report suspicious activity) Customer Identification Program (31 CFR (Code of Federal Regulations) Part 1020) specifies minimum identity attributes and requires record retention for at least five years after the business relationship ends. GDPR (EU General Data Protection Regulation) Article 4(1) defines the identity attributes collected here as personal data, subject to Articles 5–6 lawful-basis requirements. HIPAA (Health Insurance Portability and Accountability Act) requires patient identity be established before clinical records are created. The domain varies; the structural obligation is the same.

Party Identity is distinct from Actor Identity, and the distinction is not cosmetic. Actor Identity models *internal actors who authorize system actions* — an employee, service account, or credentialed operator producing a cryptographic proof that binds their identity to a specific action. Party Identity models *external parties whose regulated identity must be established* — a customer, patient, or counterparty who is the *subject* of the system's activity rather than its *operator*. An actor signs; a party is verified. The two atoms model different obligations, carry different state machines, and compose when the same natural person is both a verified external party and a credentialed internal actor (common in employee-onboarding, professional-licensing, and counterparty scenarios where the party is also given system access). The composition is explicit; the atoms remain freestanding.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state machine (Unverified → Verified via successful verification; Verified → Suspended via suspend; Suspended → Verified via reinstate; any non-Closed state → Closed via close), its own actions (`enroll`, `verify`, `suspend`, `reinstate`, `close`, and the `read` query surface), and its own invariants (party records are never deleted; verification events are immutable and append-only; Closed is absorbing; Verified requires a passed verification). It does not implement the verification workflow, the document check, the sanctions screen, the ongoing monitoring schedule, risk scoring, or enhanced due diligence. Each is a composing pattern. See Composition notes.

---

## Structure

### Identity model

Every party known to the system has a **[Party Id]** — an opaque, immutable, system-generated identifier produced by [Enroll]. The id is the party's identity; all other fields ([Name], [Date Of Birth], [Document Type], [Document Ref]) are immutable *properties* set at enrollment, not the identity itself.

This matters because an external party's legal name, document number, or address may change — through legal name change, document renewal, address update — without the party ceasing to be *the same party*. Using a content field like name or document number as identity would collapse legitimate attribute evolution with distinct-party disambiguation. Opaque ids preserve the one-party-one-id discipline that makes lifelong identity chain-of-custody tractable and lets the composing Customer Onboarding composition link all activity — past and future — to a single durable reference.

Each call to [Verify] produces a **[Verification Id]** — opaque, immutable, system-generated — associated with the party. [Verification Event]s are separate records, append-only; the current state reflects the outcome of the most recent successful verification, but all past events are preserved as the chain-of-custody for the party's verification history.

Each [State-Change Event] produced by [Suspend], [Reinstate], [Close], or a [Verify]-driven [Unverified] → [Verified] transition has a **[State Change Id]** — opaque, immutable, system-generated — so that composing patterns (Actor Identity attestations, Audit Trail entries) can reference a specific suspension, reinstatement, or closure event by id rather than by timestamp or position in the log. [State-Change Event]s accumulate on the party record as a time-ordered, append-only log; they are sub-records of the party, not independently stored record types, but each is individually addressable by its [State Change Id].

Two enrollments for the same natural person produce two records with two distinct [Party Id] values. The atom does not deduplicate; deduplication is the composing system's responsibility. See Edge cases.

### Inputs and Outputs

- A legal [Name] identifying the party at enrollment. Non-empty, non-whitespace-only. Maximum 500 characters. The atom stores the name as supplied; Unicode normalization, case folding, and transliteration are deployment policy.
- A [Date Of Birth] expressed as an ISO 8601 date (the International Organization for Standardization's date format, `YYYY-MM-DD`). Must parse as a valid calendar date; must not be in the future.
- A [Document Type] identifying the class of identity document presented (`passport`, `national-id`, `drivers-license`, or similar). Non-empty, non-whitespace-only. The atom treats this as an opaque string; which values are valid for which regulatory regime belongs to the composing system.
- A [Document Ref] — an opaque pointer to the identity document record in the composing identity-document store. Non-empty, non-whitespace-only. The atom does not validate the reference against the document store.
- An [Enrolling Actor Ref] — an opaque pointer to the internal actor performing enrollment. Non-empty, non-whitespace-only. Attribution only; verification and non-repudiation of the enrollment action compose with Actor Identity.
- Actions:
  - [Enroll] — (Projected contract: `enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref) → party_id | rejected(invalid-request | storage-failure)`)
  - [Verify] — (Projected contract: `verify(party_id, verifying_actor_ref, verification_method, verification_result, evidence_ref) → (verification_id, state_change_id?) | rejected(not-known | already-closed | invalid-request | storage-failure)`)
  - [Suspend] — (Projected contract: `suspend(party_id, suspending_actor_ref, reason) → state_change_id | rejected(not-known | not-verifiable | already-suspended | already-closed | invalid-request | storage-failure)`)
  - [Reinstate] — (Projected contract: `reinstate(party_id, reinstating_actor_ref, reason) → state_change_id | rejected(not-known | not-suspended | already-closed | no-passed-verification-since-suspend | invalid-request | storage-failure)`)
  - [Close] — (Projected contract: `close(party_id, closing_actor_ref, reason) → state_change_id | rejected(not-known | already-closed | invalid-request | storage-failure)`)
  - [Read] — (Projected contract: `read(query) → ordered_sequence_of_party_records | rejected(invalid-query)`)
- A clock reading, injected per the Execution Contract's pipeline — one reading per action invocation, read at the guard step and shared with the transition ([`execution-contract.md`](../execution-contract.md) §The execution pipeline) — providing the wall-time timestamps this atom stamps. The atom's actions accept no caller-supplied timestamps (defended in Edge cases §Clock semantics).

**On [Verify]:** [Verification Result] must be exactly `passed` or `failed`; any other value is [Invalid Request]. [Verification Method] is an opaque non-empty, non-whitespace-only string naming the method used (`manual-document-review`, `automated-ocr`, `biometric-match`, `database-check`, etc.). [Evidence Ref] is an opaque non-empty, non-whitespace-only pointer to the verification evidence record. [Verifying Actor Ref] is non-empty, non-whitespace-only. All four required string fields must be present; any missing field, or any field that is empty or whitespace-only, is [Invalid Request].

**On [Suspend], [Reinstate], [Close]:** [Reason] is required; non-empty, non-whitespace-only; maximum 2000 characters; stored as supplied, no normalization. [Suspending Actor Ref], [Reinstating Actor Ref], and [Closing Actor Ref] are opaque non-empty, non-whitespace-only references.

**On [Read]:** the read-only query surface — it changes nothing and appends nothing. The supported filter axes of the [Query] are exactly: [Party Id], [Current State], and a time range on [Enrolled At] of the form `{after: <timestamp>, before: <timestamp>}` (both sub-keys optional; both bounds inclusive; a range carrying only one sub-key is unbounded on the other side; filter keys are flat strings, not dot-notation paths). Any combination of supported axes is valid. A [Query] supplying only a [Party Id] returns at most one record; a [Query] with no filters returns every party in the store; a well-formed [Query] matching no parties returns an empty sequence, not a rejection. Results are ordered by enrollment insertion order — the same insertion-order authority §Ordering pins for every other sequence in this atom, so no sortable-id format obligation is introduced on [Party Id]. Each returned record carries the full field set named in Outputs below, including the complete [State-Change Log] and the full ordered [Verification Event] list — the per-party histories travel with the record rather than through separate query surfaces, which is what makes the Generation acceptance checks and the adversarial-scenario reconstructions executable from this one surface. An [Enrolled At] range filters on advisory wall-time metadata (§Ordering): under clock skew its result set is best-effort; reconstructions needing authoritative bounds use insertion order, with the composing Trusted Timestamping pattern as the wall-time anchor. **Malformed-query rules ([Invalid Query]):** a [Party Id] filter value that is null, empty, or whitespace-only; a [Current State] filter value not one of `Unverified`, `Verified`, `Suspended`, `Closed`; a time range with end before start; or an unrecognized filter key — any key outside the supported axes — each is [Invalid Query], rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

**Outputs** — via [Read]: the party records matching the caller's [Query], in enrollment insertion order; for each party: [Party Id], [Name], [Date Of Birth], [Document Type], [Document Ref], [Enrolled At], [Enrolling Actor Ref], [Current State], [State-Change Log], and the full ordered list of [Verification Event]s. For each verification event: [Verification Id], [Party Id], [Verifying Actor Ref], [Verification Method], [Verification Result], [Evidence Ref], [Verified At]. Action returns: [Party Id] from [Enroll]; `(verification_id, state_change_id?)` from [Verify] — [State Change Id] is present iff the call drove an [Unverified] → [Verified] transition, absent otherwise; [State Change Id] from [Suspend], [Reinstate], [Close]. Every action that produces a state-change event returns the [State Change Id] directly so the caller can bind to Actor Identity for attestation and to Audit Trail for tamper-evident recording without a follow-up query — symmetric with [Enroll] returning [Party Id] and [Verify] returning [Verification Id].

### State

A party, once enrolled, occupies exactly one of four states:

- **[Unverified]** — enrolled but no successful verification has been recorded (or all verifications so far returned `failed`). Entry state for every newly enrolled party.
- **[Verified]** — at least one `verify(verification_result=passed)` call has been recorded and no subsequent [Suspend] or [Close] has occurred.
- **[Suspended]** — previously [Verified]; activity suspended pending investigation, re-verification, or a regulatory preservation order. [Verification Event]s may continue to be recorded during [Suspended]; the state does not change to [Verified] until [Reinstate] is called.
- **[Closed]** — terminal. The party record persists; the party may not be the subject of new regulated activity. [Verify], [Suspend], and [Reinstate] are rejected for Closed parties.

Each party record carries:

- **[Party Id]** — opaque, immutable, system-generated. Set on [Enroll]. Never changes.
- **[Name]** — set on [Enroll]. Never changes.
- **[Date Of Birth]** — set on [Enroll]. Never changes.
- **[Document Type]** — set on [Enroll]. Never changes.
- **[Document Ref]** — set on [Enroll]. Never changes.
- **[Enrolled At]** — wall-time of enrollment. Set on [Enroll]. Never changes.
- **[Enrolling Actor Ref]** — set on [Enroll]. Never changes.
- **[Current State]** — one of {[Unverified], [Verified], [Suspended], [Closed]}. Changes on `verify(passed)`, [Suspend], [Reinstate], [Close].
- **[State-Change Log]** — ordered, append-only list of [State-Change Event]s. Each carries: [State Change Id] (opaque, immutable, system-generated), [Prior State], [New State], [Acting Actor Ref], timestamp, and [Reason]. [Reason] is present for [Suspend]-, [Reinstate]-, and [Close]-driven transitions; absent for [Verify]-driven [Unverified] → [Verified] transitions (the [Verify] action carries no [Reason] field).

**Ordering.** The [State-Change Log] and the [Verification Event] list are ordered by insertion sequence. References elsewhere in this spec to "after the most recent X," "between X and Y," or "most recent X" mean by insertion order, not by timestamp order. Timestamps ([Enrolled At], [Verified At], and state-change-event timestamps) are best-effort wall-time metadata sourced from the injected clock reading; under skew or clock adjustment, timestamps may not be monotonic. A composing **Trusted Timestamping** pattern *(forthcoming)* supplies a verifiable time-anchor that binds insertion order to externally-verifiable wall-time; without it, timestamps are advisory and insertion order is authoritative.

**Transitions.** Each row is fail-closed: a rejected action writes no record and leaves the party's state unchanged. The [Invalid Request] (field-format) and [Storage Failure] (write-failure) guards apply to every action and are omitted from the table for brevity; their precedence among rejection reasons is specified under Decision points. "now" is the injected clock reading at the call (the pipeline's `clock_t`).

| Action | From state | Condition | To state | Effect |
|---|---|---|---|---|
| [Enroll] | — (new) | valid request | [Unverified] | party created with fresh [Party Id], `enrolled_at = now` |
| [Verify] | [Unverified] | `verification_result=passed` | [Verified] | [Verification Event] + [State-Change Event] appended; both [Verification Id] and [State Change Id] returned |
| [Verify] | [Unverified] | `verification_result=failed` | [Unverified] | [Verification Event] appended (`failed`); only [Verification Id] returned |
| [Verify] | [Verified] | `passed` (re-verification) | [Verified] | [Verification Event] appended; only [Verification Id] returned |
| [Verify] | [Verified] | `failed` | [Verified] | [Verification Event] appended (`failed`); only [Verification Id] returned |
| [Verify] | [Suspended] | any result | [Suspended] | [Verification Event] appended; only [Verification Id] returned |
| [Verify] | [Closed] | — | (rejected) | [Already Closed] |
| [Suspend] | [Verified] | — | [Suspended] | [State-Change Event] appended |
| [Suspend] | [Unverified] | — | (rejected) | [Not Verifiable] |
| [Suspend] | [Suspended] | — | (rejected) | [Already Suspended] |
| [Suspend] | [Closed] | — | (rejected) | [Already Closed] |
| [Reinstate] | [Suspended] | ≥ 1 `passed` [Verification Event] after the most recent [Suspend] (insertion order) | [Verified] | [State-Change Event] appended |
| [Reinstate] | [Suspended] | no `passed` verification after the most recent [Suspend] | (rejected) | [No Passed Verification Since Suspend] |
| [Reinstate] | [Unverified] or [Verified] | — | (rejected) | [Not Suspended] |
| [Reinstate] | [Closed] | — | (rejected) | [Already Closed] |
| [Close] | any non-[Closed] | — | [Closed] | [State-Change Event] appended |
| [Close] | [Closed] | — | (rejected) | [Already Closed] |

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

**Uniform validation rule.** Across all actions, every required string field — names, document attributes, actor references, verification metadata, reasons — must be non-null, non-empty, and non-whitespace-only; otherwise [Invalid Request]. The rule applies uniformly so that the audit-trail surface (especially the [Reason] field on [Suspend], [Reinstate], and [Close]) cannot be vacuously satisfied by a whitespace placeholder. The [Party Id] parameter on [Verify], [Suspend], [Reinstate], and [Close] is covered by the same rule and is checked *before* the store is consulted: a null, empty, or whitespace-only [Party Id] is [Invalid Request] — the caller passed garbage, not a reference to a missing party — while [Not Known] is reserved for a well-formed [Party Id] that references no known party (the same malformed-id-before-existence ordering Approval Step pins for its step id). Action-specific format constraints (e.g., [Verification Result] must be `passed` or `failed`; [Date Of Birth] must parse as a valid past-or-present ISO 8601 date) are stated per action below.

**At [Enroll]:** All five fields must satisfy the uniform validation rule; otherwise [Invalid Request]. [Date Of Birth] must parse as a valid ISO 8601 date (`YYYY-MM-DD`) and must not be a future date; otherwise [Invalid Request]. If the party store write fails after all preconditions pass, the atom returns [Storage Failure] — no party record is created. The atom does not check for duplicate party records; whether two records represent the same natural person is the composing system's responsibility.

**At [Verify]:** [Party Id] must reference a known party; otherwise [Not Known]. The party must not be [Closed]; otherwise [Already Closed]. [Verifying Actor Ref], [Verification Method], and [Evidence Ref] must satisfy the uniform validation rule; [Verification Result] must be exactly `passed` or `failed`; otherwise [Invalid Request]. If the verification event store write fails, [Storage Failure] — no event is recorded and the party's state does not change. [Verify] may be called against a [Suspended] party; the event is recorded but the party remains [Suspended]. When `verify(verification_result=passed)` against an [Unverified] party succeeds, the call produces both a [Verification Event] and a [State-Change Event] in a single atomic unit (Invariant 11); both ids are returned to the caller.

**At [Suspend]:** [Party Id] must reference a known party; otherwise [Not Known]. The party must be in [Verified] state. If [Unverified] (party has not yet successfully verified — there is no active Verified status to suspend), [Not Verifiable]. If [Suspended] (party is already suspended — double-suspend), [Already Suspended]. [Not Verifiable] and [Already Suspended] are distinct because a composing system receiving [Not Verifiable] knows to look at the verification workflow, while one receiving [Already Suspended] knows a concurrent or duplicate suspend call has raced in. If [Closed], [Already Closed]. [Suspending Actor Ref] and [Reason] must satisfy the uniform validation rule; otherwise [Invalid Request]. If the state-change write fails, [Storage Failure].

**At [Reinstate]:** [Party Id] must reference a known party; otherwise [Not Known]. The party must be in [Suspended] state. [Not Suspended] is returned for both [Unverified] and [Verified] parties — both mean there is no active suspension to lift, and a composing system need not distinguish them to decide its next action. A composing system that does need to distinguish (e.g., to surface a different error message) must query the party state separately; the atom does not split this into two codes because the rejection semantics are the same: reinstate is inapplicable. If [Closed], [Already Closed]. The party must have at least one [Verification Event] with `verification_result = passed` recorded after the most recent [Suspend] action in insertion order; otherwise [No Passed Verification Since Suspend]. This enforces that reinstatement reflects fresh evidence rather than a flag toggle: a suspension represents revoked trust in the prior verification, and a [Reinstate] call without an intervening `passed` verification has no recorded basis for restoring trust. The atom owns this rule directly rather than delegating it to composing workflows; every composition that uses Party Identity inherits the invariant automatically. [Reinstating Actor Ref] and [Reason] must satisfy the uniform validation rule; otherwise [Invalid Request]. If the state-change write fails, [Storage Failure].

**At [Close]:** [Party Id] must reference a known party; otherwise [Not Known]. The party must not already be [Closed]; otherwise [Already Closed]. [Closing Actor Ref] and [Reason] must satisfy the uniform validation rule; otherwise [Invalid Request]. If the state-change write fails, [Storage Failure].

**At [Read]:** every supplied filter value must be well-formed for its axis, per the malformed-query rules under *On [Read]* (Inputs and Outputs); any violation is [Invalid Query]. [Read] performs no write and never returns [Storage Failure]; a well-formed [Query] matching no parties returns an empty sequence.

**Priority ordering among rejection reasons:** For any action, the malformed-[Party Id] check ([Invalid Request], per the uniform validation rule above) precedes the store lookup; [Not Known] is checked next, before state-validity checks; state-validity checks are checked before semantic-precondition checks (e.g., [Reinstate]'s fresh-verification check); semantic-precondition checks are checked before the remaining field-format checks; all checks precede the store write. For [Reinstate] specifically, the order is: malformed [Party Id] ([Invalid Request]) → [Not Known] → [Already Closed] or [Not Suspended] (state validity, mutually exclusive) → [No Passed Verification Since Suspend] (semantic precondition, only reached when the party is [Suspended]) → [Invalid Request] (remaining field format) → [Storage Failure].

### Behavior

Observed behavior, derived from how regulated systems use external party identity:

[Enroll] always creates a new party record in [Unverified], regardless of whether another record with the same name and document already exists. Two concurrent onboarding flows for the same natural person produce two distinct [Party Id] values. The atom does not deduplicate; the composing system detects and resolves duplicates. This design keeps the atom's obligations narrow and makes the enrollment record the immutable original — merging or closing a duplicate party is always an explicit, auditable act, not a silent collision.

`verify(verification_result=failed)` records the failure event and leaves state unchanged. The atom's job is to record that a verification was attempted, who attempted it, what method was used, and what the result was. Whether to retry, escalate, or close after N failures is the composing system's policy. The atom does not count attempts.

`verify(verification_result=passed)` against a [Suspended] party records the passed event but does not reinstate the party. This allows verification evidence to be gathered during an investigation — e.g., a fresh document check may be required before the compliance team makes the reinstate/close decision — without the `passed` result implicitly clearing the suspension. Reinstatement requires an explicit [Reinstate] call with an actor and reason, and the atom further requires that at least one such `passed` verification be recorded after the most recent suspend before [Reinstate] will succeed (Invariant 4). Reinstatement therefore always reflects fresh, recorded evidence — never a flag toggle.

When `verify(verification_result=passed)` against an [Unverified] party drives the [Unverified] → [Verified] transition, the action returns both the new [Verification Id] and the new [State Change Id]. The two ids refer to different facets of the same event-time: the [Verification Event] records the inputs and result of the verification (method, evidence, actor); the [State-Change Event] records the transition itself (prior state, new state, actor, timestamp). Composing patterns bind to the appropriate id — Actor Identity attestation of the verification action binds to [Verification Id]; Actor Identity attestation of the state transition and Audit Trail tamper-evident recording bind to [State Change Id]. Returning both ids directly keeps the verify-driven state change symmetric with suspend/reinstate/close and removes the need for a follow-up query.

[Close] is callable from any non-[Closed] state. Enrolling a party and immediately closing it (enrollment-in-error) is a valid sequence; the record persists in [Closed] with the stated reason, giving the audit trail evidence of the error. There is no way to retroactively hide an enrollment; the atom's delete-surface absence is structural.

[Read] is repeatable and the party store is monotonic: parties are never deleted (Invariant 1), so an unfiltered [Read] at a later time returns every party visible earlier plus any enrolled in between, and each party's [State-Change Log] and [Verification Event] list only grow (Invariants 6 and 8). State-filtered reads are not monotonic: a party visible under `Verified` at one read may appear under [Suspended] or [Closed] at the next.

No action modifies enrollment fields ([Name], [Date Of Birth], [Document Type], [Document Ref], [Enrolled At], [Enrolling Actor Ref]) after [Enroll]. A legal name change, document renewal, or address update does not modify the enrollment record — those are events in the party's real-world attributes that compose via an Attribute Update pattern. The enrollment record captures what was known and verified at the time of onboarding; subsequent changes layer on top without overwriting the original.

### Feedback

Each successful action produces an observable, measurable change:

- After [Enroll] — a new party appears in [Unverified] with fresh [Party Id] and [Enrolled At]. Total party count increases by one.
- After [Verify] — a new [Verification Event] appears in the party's event list, with fresh [Verification Id] and [Verified At]. If the result was `passed` and the party was [Unverified], the party's state is now [Verified] (observable on the party record), a state-change entry appears with a fresh [State Change Id] returned to the caller alongside the [Verification Id], and the Unverified-count decreases by one while the Verified-count increases by one. If the party was [Suspended] or [Verified] at call time, the state is unchanged, the event count grows by one, and only [Verification Id] is returned.
- After [Suspend] — the party's state is [Suspended]. A state-change entry appears on the party record with a fresh [State Change Id] (returned to the caller), [Prior State] ([Verified]), [New State] ([Suspended]), [Suspending Actor Ref], timestamp, and [Reason]. Verified-count decreases by one; Suspended-count increases by one.
- After [Reinstate] — the party's state is [Verified]. State-change entry appended; fresh [State Change Id] returned to caller. Suspended-count decreases by one; Verified-count increases by one.
- After [Close] — the party's state is [Closed]. State-change entry appended; fresh [State Change Id] returned to caller. The relevant state-count ([Unverified], [Verified], or [Suspended]) decreases by one; Closed-count increases by one. Total party count is unchanged.
- After [Read] — nothing changes; the matching records (possibly an empty sequence) are returned in enrollment insertion order.

Each rejected action produces an observable refusal with a named reason. The state-count segmentation ([Unverified], [Verified], [Suspended], [Closed]) is computable from the party record set at any time; the atom does not maintain pre-aggregated counters but does not hide the underlying records.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

**Invariant 1 — Party record permanence.** Once enrolled, a party record is never deleted from the system. The [Party Id] returned by a successful [Enroll] call is durably persisted and remains in the system indefinitely, regardless of subsequent state transitions including [Close]. A [Storage Failure] rejection on [Enroll] guarantees no partial record was written.

**Invariant 2 — State membership exclusivity.** Every party known to the system is in exactly one of {[Unverified], [Verified], [Suspended], [Closed]} at all times.

**Invariant 3 — Closed is absorbing.** Once a party enters [Closed], no action transitions it elsewhere. [Verify], [Suspend], and [Reinstate] against a [Closed] party are rejected.

**Invariant 4 — Verified requires a passed verification after the most recent suspend.** A party in [Verified] state has at least one [Verification Event] with `verification_result = passed` recorded after the most recent [Suspend] action in insertion order (or, if never suspended, after [Enroll]). The atom enforces this invariant directly: the only paths to [Verified] state are (a) `verify(verification_result=passed)` against an [Unverified] party, which records the required `passed` event as part of the transition, and (b) [Reinstate] against a [Suspended] party, where [Reinstate] itself requires at least one passed verification recorded after the most recent suspend before it will succeed. There is no action sequence the atom accepts that produces a [Verified] party without the required passed verification on record.

**Invariant 5 — Verification events are immutable.** Once recorded, a [Verification Event]'s [Verification Id], [Party Id], [Verifying Actor Ref], [Verification Method], [Verification Result], [Evidence Ref], and [Verified At] never change.

**Invariant 6 — Verification events are append-only in insertion order.** [Verification Event]s are only added to the set in insertion order; no event is removed and no event is inserted before any prior event. The [Verification Event] list of any party grows monotonically in length.

**Invariant 7 — Enrollment fields immutable under the atom's action contract.** No action exposed by this atom modifies [Name], [Date Of Birth], [Document Type], [Document Ref], [Enrolled At], or [Enrolling Actor Ref] after [Enroll]. Field-level scrubbing of the identifiable enrollment fields ([Name], [Date Of Birth], [Document Ref]) under GDPR Article 17 erasure obligations or post-retention obligations operates outside the atom's action contract and belongs to a composing **Erasure Coordination** pattern *(forthcoming)* — the owner [Retention Window](./retention-window.md) itself names for privacy-law erasure; Retention Window's declared surface is retention-period governance (place-under-retention and purge gating), not field scrubbing. The scrub is recorded by that composing erasure pattern as an attributed event. [Party Id], [Enrolled At], and [Enrolling Actor Ref] survive scrubbing as the record's durable audit-identifier surface, so the chain of custody — who enrolled this party, when, and the full event history — remains traceable even after personal data is removed.

**Invariant 8 — State-change events are auditable.** Every transition ([Unverified] → [Verified], [Verified] → [Suspended], [Suspended] → [Verified], any → [Closed]) produces a durable state-change entry on the party record with a fresh [State Change Id], naming the [Prior State], [New State], acting actor reference, and timestamp. [Reason] is present for [Suspend]-, [Reinstate]-, and [Close]-driven transitions; it is absent for [Verify]-driven transitions (the [Verify] action carries no [Reason] field). No state transition is silent.

**Invariant 9 — Id stability.** A party's [Party Id] is set on [Enroll] and never changes. A [Verification Event]'s [Verification Id] is set on [Verify] and never changes. A [State-Change Event]'s [State Change Id] is set when the event is written and never changes.

**Invariant 10 — No id reuse.** No two parties share a [Party Id]; no two verification events share a [Verification Id]; no two state-change events share a [State Change Id], across the lifetime of the system.

**Invariant 11 — Action atomicity.** Each action either commits all of its intended records — party record, verification event, state-change event, as applicable to the action — or none. A [Storage Failure] rejection on any action guarantees no partial record, across any record type written by that action, has been persisted. The verify-on-Unverified case writes both a [Verification Event] and a [State-Change Event] in a single atomic unit; if either write fails, neither is persisted and the action returns [Storage Failure]. [Suspend], [Reinstate], and [Close] each write a single [State-Change Event]; [Enroll] writes a party record. The total count of party records is monotonically non-decreasing.

Invariants 1, 5, 6, and 8 together give the *identity chain-of-custody* property: the full history of a party's identity — who enrolled them, every verification attempt, every state change — is recoverable from the records alone and cannot be silently altered. Each [State-Change Event] is individually addressable by [State Change Id], so Actor Identity attestations and Audit Trail entries can reference a specific suspension or closure event by id. Invariant 4 gives the *verification integrity* property: [Verified] state is not self-asserted. Invariant 3 gives the *terminal closure* property: a [Closed] party cannot be silently reopened.

---

## Examples

The same atom, four regulated domains, identical mechanic.

### Banking — Customer Onboarding under BSA/AML

A bank onboards a new retail customer. The officer collects identity attributes and runs the CIP (Customer Identification Program — the BSA/AML requirement to collect and verify minimum customer-identity data) verification workflow.

1. `enroll(name="Amara Osei", date_of_birth="1981-03-14", document_type="passport", document_ref="doc_p901", enrolling_actor_ref="officer_r3") → party_id = party_9017`
2. Automated OCR (Optical Character Recognition — software that extracts text from images of documents) system checks the passport. `verify(party_id="party_9017", verifying_actor_ref="system_verification_auto", verification_method="automated-ocr", verification_result="passed", evidence_ref="evidence_ocr_442") → (verification_id = verif_1101, state_change_id = sc_4401)` — party transitions Unverified → Verified; both ids returned so Actor Identity attestation of the verification can bind to `verif_1101` and Actor Identity attestation of the state transition can bind to `sc_4401`.
3. The Customer Onboarding composition gates account opening on the party being Verified; account_a883 is opened and linked to party_9017.
4. Six months later, annual re-verification. `verify(party_id="party_9017", verifying_actor_ref="officer_r3", verification_method="manual-document-review", verification_result="passed", evidence_ref="evidence_doc_556") → (verification_id = verif_1184, state_change_id = absent)` — party remains Verified; second verification event appended; no state-change event produced because the party was already Verified.
5. Ten years later, account closure. `close(party_id="party_9017", closing_actor_ref="officer_r3", reason="account-closed-customer-request-26-05-14") → state_change_id = sc_4988` — party enters Closed. BSA requires retention of CDD records for 5 years after closure; the composing [Retention Window](./retention-window.md) pattern governs the record's retention lifecycle from this point.

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

**Regulator audit — "show me every party that proceeded to regulated activity without a verified identity, and every party reinstated without fresh evidence."** The auditor's first query is for any regulated activity record linked to a [Party Id] in [Unverified] or [Closed] state; Invariant 4 is the structural answer for the verification chain — the only paths to [Verified] state are `verify(verification_result=passed)` from [Unverified] and [Reinstate] from [Suspended], and [Reinstate] itself requires a `passed` [Verification Event] recorded after the most recent [Suspend] in insertion order. The auditor's second query — "any party currently in Verified state whose verification chain breaks at the most recent suspend" — is structurally empty by Invariant 4: the atom rejects [Reinstate] calls that would produce such a state, so no party in [Verified] state can lack the required passed-verification record. Any composing system that gates regulated activity on the party being in [Verified] state can demonstrate compliance from the records alone; the party's [State-Change Log] and [Verification Event] list answer both queries without developer narration. The auditor does not need to trust the system's claim; they can reconstruct any party's state at any point in insertion order from the [State-Change Log] (Invariant 8), and the composing Trusted Timestamping pattern *(forthcoming)* supplies the wall-time anchor when the audit query is bounded by clock time rather than event index.

**Disputed identity — "the party claims they were never verified; show me the verification chain."** The party (or their counsel) challenges the claim that their identity was verified before account opening. The investigator retrieves the [Verification Event] list for the [Party Id]: each event names [Verifying Actor Ref], [Verification Method], [Evidence Ref], and [Verified At]. Invariant 5 (immutability) and Invariant 6 (append-only) establish that no [Verification Event] can have been altered or inserted after the fact. The [Evidence Ref] on each `passed` event points to the document or database record that supported the verification — the dispute is resolved by producing the evidence record alongside the immutable [Verification Event]. If the [Evidence Ref] record cannot be produced, the [Verification Event] is an unsubstantiated claim; that is an evidence-management failure at the document store, not a Party Identity failure.

**Breach or incident investigation — "during the breach window, which verified parties' records may have been accessed or altered?"** An incident investigator is given a time window (e.g., 2026-04-01 through 2026-04-15) and needs to reconstruct which Party Identity records were in [Verified] state during that window and which state changes occurred. The [State-Change Log] (Invariant 8) records every transition in insertion order with a wall-time timestamp; the investigator replays each party's log in insertion order to determine its state at the window's start and end. The [Verification Event] list (Invariant 6, append-only in insertion order) shows what verification evidence was on file during the window. Together, these bound the scope of affected records from the records alone, without requiring log files from an external system. The atom's append-only, immutable-event discipline forecloses the possibility that an attacker altered the verification history to conceal unauthorized state changes; any gap in the [State-Change Log] is itself a finding. Where the breach scope requires wall-time bounds (rather than event-index bounds), the composing Trusted Timestamping pattern supplies the time-anchor that binds insertion order to externally-verifiable wall-time; without it, the investigator's reconstruction is event-index-authoritative and timestamps are advisory only.

---

## Generation acceptance

A derived implementation of Party Identity is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the party record set and the verification event set, can do all of the following without recourse to source code, runbooks, or developer narration:

**Reconstruct any party's state at any point in the event log.** The [State-Change Log] (Invariant 8) provides a complete, insertion-ordered transition history from [Enroll] through the current state. The auditor can replay the log forward in insertion order from [Enroll] and arrive at the party's state as of any given event index. When the composing Trusted Timestamping pattern *(forthcoming)* binds insertion order to verifiable wall-time, the auditor can also arrive at the party's state as of any given wall-time instant; without it, the reconstruction is event-index-authoritative and timestamps are advisory.

**Verify that every party in Verified state has at least one passed verification event after the most recent suspend.** Query the [Verification Event] set for each party in [Verified] state (via [Read] with a `current_state = Verified` filter — each returned record carries its full [Verification Event] list and [State-Change Log]); confirm the existence of a `verification_result = passed` event recorded after the most recent [Suspend] action in insertion order (or after [Enroll] if never suspended). Invariant 4 makes this set structurally non-empty for every [Verified] party — the atom enforces the condition directly at [Reinstate] time via the [No Passed Verification Since Suspend] rejection, so the records cannot exhibit a [Verified] party that fails this check. The auditor sees the structural guarantee, not a procedural claim.

**Confirm that every verification event is attributed to an actor and method.** Each event records [Verifying Actor Ref], [Verification Method], [Evidence Ref], and [Verified At]. An auditor can trace every verification decision to the actor and method that produced it, and to the evidence record that supported it, from the event store alone.

**Trace the complete lifecycle of any party from enrollment to current state.** The enrollment fields (Invariant 7) capture the initial attributes; the [State-Change Log] (Invariant 8) captures every subsequent transition; the [Verification Event] list (Invariants 5–6) captures the complete verification history. Together they form a complete, time-ordered, append-only biography of the party record.

**Identify every party currently in each state.** The [Current State] field on each party record, queryable as a set (a [Read] with a [Current State] filter per state), partitions the party population into [Unverified], [Verified], [Suspended], and [Closed]. Counts per state are derivable from the set.

**Identify the composing patterns active in this deployment.** Whether Actor Identity attestation is wired into state transitions (attributing each [Suspend], [Reinstate], [Close] action to a verifiable proof), whether Audit Trail is active for tamper-evident recording, whether Retention Window governs party record lifetime, and whether ongoing monitoring is wired to produce periodic [Verify] calls.

---

## Edge cases and explicit non-goals

What this atom does not cover:

**Duplicate detection and deduplication.** The atom does not detect or prevent two [Party Id] records for the same natural person or entity. Detecting that two enrollments represent the same individual — whether by biometric match, document comparison, or external identity resolution — is a composing concept. The atom models the lifecycle of a single party record; the graph of records and their deduplication relationships is external.

**Identity attribute updates.** No action modifies [Name], [Date Of Birth], [Document Type], or [Document Ref] after enrollment. A legal name change, document renewal, or address update does not overwrite the enrollment fields. The principle: the enrollment record is the auditable original, capturing what was known at onboarding. The objection: real parties' attributes change and the system must reflect current information. The mechanism: a composing Attribute Update pattern appends versioned attribute events to the party record without mutating the enrollment fields; queries that need the current view read the latest attribute event; queries that need the at-time-of-onboarding view read the enrollment fields. The result: the audit trail for any party's attributes is complete and no prior state is silently overwritten. Attribute Update is distinct from retention/erasure-driven anonymization (Invariant 7): Attribute Update layers new attribute values without removing the original; Erasure Coordination scrubbing (see Invariant 7) removes personal data entirely when retention or erasure obligations require it. The two composing patterns operate on different lifecycle events with different audit semantics — attribute update preserves history; anonymization removes personal data while preserving the audit identifier.

**The verification workflow.** What happens *during* verification — document OCR, biometric check, sanctions database query, adverse media search — is not modeled by this atom. The atom records that a verification was performed, by whom, using what method, with what result, against what evidence. The workflow that produces those inputs is a composing Customer Onboarding / AML verification pattern.

**Ongoing monitoring scheduling.** Periodic re-verification, sanctions re-screening, PEP (Politically Exposed Person — a category of high-risk client in financial regulation, such as a foreign government official or their close associate) re-check — these are composing patterns that call [Verify] on a schedule or trigger basis. The atom records each result; the scheduling policy is external.

**Risk scoring and enhanced due diligence.** Whether a party requires enhanced due diligence based on risk factors (country of origin, transaction volume, PEP status) is a composing concept. The atom records identity and verification lifecycle; risk classification and enhanced-due-diligence (EDD) orchestration belong to the [Customer Onboarding](../compositions/customer-onboarding.md) composition.

**Beneficial ownership.** A beneficial owner of a legal entity is a Party Identity record in their own right; the relationship between the beneficial owner and the entity (ownership percentage, control type) is a composing Ownership Structure pattern. The atom records each party independently; the ownership graph does not belong to this atom.

**Authorized representatives and power of attorney.** An individual acting on behalf of a party — guardian, attorney-in-fact, corporate officer — is a composing Delegation / Representation pattern. The atom records the party being represented; the representative's authority is separate.

**Cross-system identity portability.** [Party Id] is opaque and scoped to the issuing system. Linking a [Party Id] in one system to a record in another trust domain belongs to an Identity Federation composing pattern.

**Notification of state changes.** When a party is Suspended or Closed, downstream systems may need to freeze activity (block transactions, freeze accounts, suppress notifications). Propagating state changes to downstream systems composes with Subscription and Notification; it is not the atom's responsibility.

**Retention of party records.** Invariant 1 guarantees party records are never deleted by the atom, but does not set the retention policy governing how long records must be actively accessible before archival or anonymization. FATF and BSA/AML require retention of CDD records for at least five years after the business relationship ends; GDPR Article 17 creates competing erasure obligations that legal counsel adjudicates. The [Retention Window](./retention-window.md) atom governs the retention-period lifecycle — when destruction becomes permitted and expected; the field-level scrub itself belongs to the composing Erasure Coordination pattern *(forthcoming)*, the only mechanism authorized to scrub identifiable enrollment fields ([Name], [Date Of Birth], [Document Ref]) under Invariant 7. The audit-identifier fields ([Party Id], [Enrolled At], [Enrolling Actor Ref]) and the full event history ([Verification Event]s, [State-Change Event]s) survive scrubbing — the chain of custody remains intact for any party whose personal data has been anonymized, so a regulator can still confirm that the party's lifecycle existed and reconstruct its sequence of state transitions even when the personal attributes have been removed.

**What "Closed" means for existing open commitments.** Closing a party prevents new regulated activity but does not automatically terminate existing open accounts, positions, or contracts. The composing system owns the policy for unwinding open commitments against a Closed party; the atom's contract is that [Verify], [Suspend], and [Reinstate] are rejected for [Closed] parties, signaling to composing systems that the party is no longer eligible for new activity.

**Concurrency.** Concurrent state transitions for the same [Party Id] (e.g., simultaneous [Suspend] and [Close] calls) resolve under the host environment's serialization guarantees. The first wins; the second observes the updated state and is rejected accordingly ([Already Closed], [Already Suspended], [Not Suspended], etc.). Multi-action transactions belong to a Transaction composition.

**Indeterminate storage outcomes.** [Storage Failure] and Invariant 11's all-or-nothing guarantee are store-side: the store either committed the action's records or it did not. The *caller's* knowledge can be weaker — a transport failure after the store committed (a lost response) leaves the caller unable to distinguish "rejected, nothing written" from "succeeded, response lost." A caller with an indeterminate outcome must re-query (via [Read]) before retrying. Retrying [Enroll] after an indeterminate outcome can create a duplicate party record — enrollment is not idempotent and the atom does not deduplicate; compose with [Duplicate Prevention](./duplicate-prevention.md) for at-most-once enrollment under retry. Retries of [Suspend], [Reinstate], and [Close] are self-detecting: if the original call committed, the retry is rejected ([Already Suspended], [Not Suspended], [Already Closed] respectively). A [Verify] retry is *not* self-detecting — a repeated call records a second [Verification Event] for the same real-world check as a distinct event; the composing workflow owns retry discipline for verification recording.

**Asynchronous verification workflows.** The [Verify] action takes [Verification Result] as a field that must be `passed` or `failed` at call time. The atom does not model in-progress or pending verification states. Real-world verification workflows are frequently asynchronous — a document is submitted, an external service runs a check, and the result arrives seconds to days later. The composing workflow owns this coordination: the party remains in [Unverified] while the external check runs; when the result is known, the composing workflow calls [Verify] with the outcome. The atom's [Verification Result] field is the recording surface for a result that has already been determined; the orchestration of asynchronous determination is a composing concept.

**Clock semantics.** State-change timestamps and verification timestamps come from the injected clock reading — the pipeline's `clock_t` ([`execution-contract.md`](../execution-contract.md) §Logic Confinement Principle: time is an explicit injected input, never an internal read). The atom deliberately accepts no caller-supplied timestamps, unlike siblings whose records document externally-communicated moments (Approval Step's backdated decision times). The principle: here a timestamp's only job is to say when the *record* was made. The objection: the check itself may have been performed earlier — an OCR run yesterday, a document reviewed last week. The mechanism: the moment the check was actually performed is evidence content and lives in the record behind [Evidence Ref], not in the event's own stamp; and because §Ordering makes insertion order authoritative and timestamps advisory, a caller-supplied stamp would buy no guarantee while opening an audit-surface ambiguity between record-time and claimed-time. The result: record-time and claimed-time cannot be conflated, and neither can be silently substituted for the other. Where onboarding and verification timestamps have legal force (FATF, BSA/AML require recording when CDD was performed), implementations must source time from a trustworthy clock. Trusted Timestamping composes to supply a verifiable time-anchor.

Where the atom breaks down: when the same natural person must hold multiple concurrent identity records under different regulatory regimes (some regulated domains require jurisdiction-specific records that cannot share a single [Party Id]); when the verification obligation requires real-time sanctions database access that the atom cannot gate on (the atom records the result but cannot enforce that the lookup was performed — the composing workflow owns that guarantee); when personal data must be purged under GDPR Article 17 while a BSA/AML retention obligation is still active (the legal tension is real and the resolution belongs to legal counsel and the composing Retention Window, Erasure Coordination *(forthcoming)*, and Consent patterns, not to this atom).

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Enroll

The behavior that creates a new party record in [Unverified] with a fresh [Party Id], capturing the enrollment attributes ([Name], [Date Of Birth], [Document Type], [Document Ref]) and the [Enrolling Actor Ref], and stamping [Enrolled At]. Returns the [Party Id], or a rejection ([Invalid Request], [Storage Failure]).

Kind: Operation

#### Verify

The behavior that records a [Verification Event] against a known, non-[Closed] party, driving an [Unverified] party to [Verified] on a `passed` result and otherwise leaving state unchanged. Returns the [Verification Id] — plus a [State Change Id] when it drove the transition — or a rejection ([Not Known], [Already Closed], [Invalid Request], [Storage Failure]).

Kind: Operation

#### Suspend

The behavior that transitions a [Verified] party to [Suspended], appending a [State-Change Event]. Rejected for a party that is [Unverified] ([Not Verifiable]), already [Suspended] ([Already Suspended]), or [Closed] ([Already Closed]).

Kind: Operation

#### Reinstate

The behavior that returns a [Suspended] party to [Verified], appending a [State-Change Event] — but only when a `passed` [Verification Event] has been recorded after the most recent [Suspend], else [No Passed Verification Since Suspend].

Kind: Operation

#### Close

The behavior that transitions any non-[Closed] party to terminal [Closed], appending a [State-Change Event]. Rejected for an already-[Closed] party ([Already Closed]).

Kind: Operation

#### Read

The read-only behavior that returns the party records matching a [Query], in enrollment insertion order, each carrying its full field set including the [State-Change Log] and [Verification Event] list. A well-formed [Query] matching no parties returns an empty sequence; a malformed one is rejected [Invalid Query]. It changes nothing.

Kind: Operation

#### Verification Event

The append-only, immutable record of one identity check against a party — produced by [Verify]. It carries its [Verification Id], [Party Id], [Verifying Actor Ref], [Verification Method], [Verification Result], [Evidence Ref], and [Verified At]; nothing about it changes once recorded (Invariants 5–6).

Kind: Type

#### State-Change Event

The append-only record of one lifecycle transition on a party — produced by [Suspend], [Reinstate], [Close], or a [Verify]-driven [Unverified] → [Verified] transition. It carries its [State Change Id], [Prior State], [New State], [Acting Actor Ref], a timestamp, and (where the action supplies one) a [Reason]. Individually addressable by [State Change Id] (Invariant 8).

Kind: Type

#### Party Id

The opaque, immutable, system-generated identity of a party — produced by [Enroll], never reused (Invariant 10), never changed (Invariant 9). The party's other attributes are properties of the record, not its identity.

Kind:     Field
Field of: the party record
Projects: party_id

#### Name

The party's legal name at enrollment, non-empty and at most 500 characters, stored as supplied. Set on [Enroll], immutable under the atom's action contract (Invariant 7); scrubbable only via the composing Erasure Coordination pattern (see Invariant 7).

Kind:     Field
Field of: the party record
Projects: name

#### Date Of Birth

The party's date of birth as an ISO 8601 calendar date that must parse and not be in the future. Set on [Enroll], immutable under the atom's action contract (Invariant 7).

Kind:     Field
Field of: the party record
Projects: date_of_birth

#### Document Type

The class of identity document presented at enrollment (an opaque string such as `passport` or `national-id`). Set on [Enroll], immutable (Invariant 7).

Kind:     Field
Field of: the party record
Projects: document_type

#### Document Ref

The opaque pointer to the identity document record in the composing document store. Set on [Enroll], immutable under the atom's action contract (Invariant 7); the atom neither validates nor interprets it.

Kind:     Field
Field of: the party record
Projects: document_ref

#### Enrolled At

The wall-time of enrollment, stamped from the injected clock reading at [Enroll]. Immutable; survives erasure-driven scrubbing as an audit identifier (Invariant 7).

Kind:     Field
Field of: the party record
Projects: enrolled_at

#### Enrolling Actor Ref

The opaque reference to the internal actor that performed [Enroll] — attribution only. Immutable; survives scrubbing as an audit identifier (Invariant 7).

Kind:     Field
Field of: the party record
Projects: enrolling_actor_ref

#### Current State

The party's lifecycle state — [Unverified], [Verified], [Suspended], or [Closed]. Set to [Unverified] on [Enroll]; changes only via the lifecycle actions, and is always exactly one value (Invariant 2).

Kind:     Field
Field of: the party record
Projects: state

#### State-Change Log

The ordered, append-only list of [State-Change Event]s on a party record. Insertion order is authoritative for every "most recent" and "after" reference (Invariant 8).

Kind:     Field
Field of: the party record
Projects: state_change_log

#### Verification Id

The opaque, immutable, system-generated identity of a [Verification Event] — produced by [Verify], never reused (Invariant 10), never changed (Invariant 9).

Kind:     Field
Field of: the verification event
Projects: verification_id

#### Verifying Actor Ref

The opaque reference to the actor that performed the verification. Recorded on the [Verification Event]; immutable (Invariant 5).

Kind:     Field
Field of: the verification event
Projects: verifying_actor_ref

#### Verification Method

The opaque string naming the method used for the check (`manual-document-review`, `automated-ocr`, and similar). Recorded on the [Verification Event]; immutable (Invariant 5).

Kind:     Field
Field of: the verification event
Projects: verification_method

#### Verification Result

The outcome of the check — exactly `passed` or `failed`. Recorded on the [Verification Event]; a `passed` result against an [Unverified] party drives the transition to [Verified].

Kind:     Field
Field of: the verification event
Projects: verification_result

#### Evidence Ref

The opaque pointer to the evidence record supporting the check. Recorded on the [Verification Event]; immutable (Invariant 5); the atom does not validate it.

Kind:     Field
Field of: the verification event
Projects: evidence_ref

#### Verified At

The wall-time the verification was recorded, stamped from the injected clock reading at [Verify]. Recorded on the [Verification Event]; immutable (Invariant 5).

Kind:     Field
Field of: the verification event
Projects: verified_at

#### State Change Id

The opaque, immutable, system-generated identity of a [State-Change Event] — set when the event is written, never reused (Invariant 10), never changed (Invariant 9). Lets composing patterns reference a specific transition by id.

Kind:     Field
Field of: the state-change event
Projects: state_change_id

#### Prior State

The party's state immediately before the transition a [State-Change Event] records.

Kind:     Field
Field of: the state-change event
Projects: prior_state

#### New State

The party's state immediately after the transition a [State-Change Event] records.

Kind:     Field
Field of: the state-change event
Projects: new_state

#### Acting Actor Ref

The opaque reference to the actor that drove the transition, recorded on the [State-Change Event] — sourced from the action's actor-ref parameter ([Suspending Actor Ref], [Reinstating Actor Ref], or [Closing Actor Ref]).

Kind:     Field
Field of: the state-change event
Projects: acting_actor_ref

#### Reason

The required, non-empty justification recorded on a [Suspend]-, [Reinstate]-, or [Close]-driven [State-Change Event]; absent for [Verify]-driven transitions. Stored as supplied (no normalization); an empty or whitespace-only value is [Invalid Request].

Kind:     Field
Field of: the state-change event
Projects: reason

#### Suspending Actor Ref

The opaque reference to the actor invoking [Suspend], consumed for attribution and recorded on the resulting [State-Change Event] as its [Acting Actor Ref] — not stored under this name. Empty or whitespace-only is [Invalid Request].

Kind:         Parameter
Parameter of: Suspend
Projects:     suspending_actor_ref

#### Reinstating Actor Ref

The opaque reference to the actor invoking [Reinstate], consumed for attribution and recorded on the resulting [State-Change Event] as its [Acting Actor Ref] — not stored under this name. Empty or whitespace-only is [Invalid Request].

Kind:         Parameter
Parameter of: Reinstate
Projects:     reinstating_actor_ref

#### Closing Actor Ref

The opaque reference to the actor invoking [Close], consumed for attribution and recorded on the resulting [State-Change Event] as its [Acting Actor Ref] — not stored under this name. Empty or whitespace-only is [Invalid Request].

Kind:         Parameter
Parameter of: Close
Projects:     closing_actor_ref

#### Query

The selection a caller passes to [Read] to scope which parties are returned — any combination of the supported filter axes ([Party Id], [Current State], and a time range on [Enrolled At]). Consumed per call; never stored.

Kind:         Parameter
Parameter of: Read
Projects:     query

#### Unverified

The entry state of every newly enrolled party: enrolled, with no `passed` verification on record. May transition to [Verified] via [Verify] or to [Closed] via [Close].

Kind:      Member
Member of: the party state
Role:      Outcome

#### Verified

The state of a party with at least one `passed` [Verification Event] after its most recent [Suspend] (Invariant 4). Reached from [Unverified] via [Verify] or from [Suspended] via [Reinstate]; may move to [Suspended] or [Closed].

Kind:      Member
Member of: the party state
Role:      Outcome

#### Suspended

The state of a previously [Verified] party whose activity is paused pending investigation or re-verification. [Verify] may record events but does not change state; only [Reinstate] returns it to [Verified], and only [Close] otherwise leaves it.

Kind:      Member
Member of: the party state
Role:      Outcome

#### Closed

The terminal, absorbing state of a party (Invariant 3). The record persists, but [Verify], [Suspend], and [Reinstate] are rejected and the party is no longer eligible for new regulated activity.

Kind:      Member
Member of: the party state
Role:      Outcome

#### Invalid Request

The rejection [Enroll], [Verify], [Suspend], [Reinstate], or [Close] returns when a required field is null, empty, or whitespace-only, or fails its format rule (e.g., a [Verification Result] other than `passed`/`failed`, or a future [Date Of Birth]).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Storage Failure

The rejection any action returns when the backing-store write fails after all preconditions pass; guarantees no partial record was persisted (Invariant 11).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The rejection [Verify], [Suspend], [Reinstate], or [Close] returns when a well-formed [Party Id] references no known party (a malformed [Party Id] is [Invalid Request], checked first).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Already Closed

The rejection [Verify], [Suspend], [Reinstate], or [Close] returns when the target party is already [Closed] (Invariant 3).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-closed

#### Not Verifiable

The rejection [Suspend] returns when the party is [Unverified] — there is no active [Verified] status to suspend.

Kind:      Member
Member of: the Suspend rejection
Role:      Outcome
Projects:  not-verifiable

#### Already Suspended

The rejection [Suspend] returns when the party is already [Suspended] — a double-suspend, distinct from [Not Verifiable].

Kind:      Member
Member of: the Suspend rejection
Role:      Outcome
Projects:  already-suspended

#### Not Suspended

The rejection [Reinstate] returns when the party is [Unverified] or [Verified] — there is no active suspension to lift.

Kind:      Member
Member of: the Reinstate rejection
Role:      Outcome
Projects:  not-suspended

#### No Passed Verification Since Suspend

The rejection [Reinstate] returns when no `passed` [Verification Event] has been recorded after the party's most recent [Suspend] — reinstatement requires fresh evidence, not a flag toggle (Invariant 4).

Kind:      Member
Member of: the Reinstate rejection
Role:      Outcome
Projects:  no-passed-verification-since-suspend

#### Invalid Query

The rejection [Read] returns when a filter is malformed — a blank [Party Id] filter value, a [Current State] value outside the four states, a time range with end before start, or an unrecognized filter key (rejected rather than silently ignored).

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Enroll]: #enroll
[Verify]: #verify
[Suspend]: #suspend
[Reinstate]: #reinstate
[Close]: #close
[Read]: #read
[Query]: #query
[Invalid Query]: #invalid-query
[Verification Event]: #verification-event
[State-Change Event]: #state-change-event
[Party Id]: #party-id
[Name]: #name
[Date Of Birth]: #date-of-birth
[Document Type]: #document-type
[Document Ref]: #document-ref
[Enrolled At]: #enrolled-at
[Enrolling Actor Ref]: #enrolling-actor-ref
[Current State]: #current-state
[State-Change Log]: #state-change-log
[Verification Id]: #verification-id
[Verifying Actor Ref]: #verifying-actor-ref
[Verification Method]: #verification-method
[Verification Result]: #verification-result
[Evidence Ref]: #evidence-ref
[Verified At]: #verified-at
[State Change Id]: #state-change-id
[Prior State]: #prior-state
[New State]: #new-state
[Acting Actor Ref]: #acting-actor-ref
[Reason]: #reason
[Suspending Actor Ref]: #suspending-actor-ref
[Reinstating Actor Ref]: #reinstating-actor-ref
[Closing Actor Ref]: #closing-actor-ref
[Unverified]: #unverified
[Verified]: #verified
[Suspended]: #suspended
[Closed]: #closed
[Invalid Request]: #invalid-request
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Already Closed]: #already-closed
[Not Verifiable]: #not-verifiable
[Already Suspended]: #already-suspended
[Not Suspended]: #not-suspended
[No Passed Verification Since Suspend]: #no-passed-verification-since-suspend

---

## Composition notes

Party Identity is freestanding and is the external-party identity contract that regulated composing systems declare:

- **[Consent](./consent.md)** — Party Identity establishes *who* the party is; Consent establishes *what* the system may do with or to their data. Every system that both identifies and processes personal data for an external party composes both. Consent basis is checked per processing action against the party's Consent record; the party's [Party Id] is the data subject reference in the Consent atom.
- **[Actor Identity](./actor-identity.md)** — each [Verify], [Suspend], [Reinstate], and [Close] action should be attested by the internal actor performing it; the `*_actor_ref` fields are the attribution surface. Actor Identity supplies the non-repudiable proof that a specific actor authorized each state transition. Customer Onboarding wires Actor Identity into every state-changing call.
- **[Retention Window](./retention-window.md)** — Invariant 1 makes party records permanent from the atom's perspective; the composing system places the party record under a retention policy governing how long the record must be kept and when destruction becomes permitted and expected. Retention Window owns the *when* of retention; it does not perform field-level scrubbing — its own spec routes privacy-law erasure to a separate pattern. BSA/AML requires five years post-closure.
- **Erasure Coordination** *(forthcoming)* — the owner of field-level scrubbing under GDPR Article 17 and post-retention obligations: the pattern [Retention Window](./retention-window.md) names for privacy-law erasure, coordinating retention obligations against erasure rights with legal-counsel adjudication. Under Invariant 7 it is the only mechanism authorized to scrub the identifiable enrollment fields; the audit-identifier fields and the full event history survive its scrub.
- **[Audit Trail](../compositions/audit-trail.md)** — every state transition event and verification event should be surfaced through the Audit Trail composition for tamper-evident, attribution-stamped recording that survives the Audit Trail's own regulated adversarial scenarios.
- **[External Onboarding](../compositions/external-onboarding.md)** — accepts an authorized invitation and calls `Party Identity.enroll` to create the party record in [Unverified] state, establishing the identity-binding at accept time. The `accepting_identity_ref` supplied at `Invitation.accept` and the resulting [Party Id] are both named in the Audit Trail completion record, making the chain from invitation to enrolled party reconstructable from records alone.
- **[Customer Onboarding](../compositions/customer-onboarding.md)** — the primary composition that names this atom. Gates regulated activity on the party being in [Verified] state; orchestrates the verification workflow; handles ongoing monitoring via periodic [Verify] calls; composes Actor Identity for attestation and Retention Window for record lifetime.
- **Identity Document Store** *(forthcoming)* — holds the document records that [Document Ref] and [Evidence Ref] reference. The atom treats both as opaque; the document store's content is the external evidence supporting each verification.
- **Attribute Update** *(forthcoming)* — handles changes to [Name], [Date Of Birth], or document references for an existing party. Appends versioned attribute events without mutating enrollment fields.
- **Ownership Structure / Beneficial Owner** *(forthcoming)* — models the ownership relationships between Party Identity records (individuals, legal entities, beneficial owners). Each beneficial owner is a Party Identity record; the graph of relationships is the composition.
- **Trusted Timestamping** *(forthcoming)* — binds this atom's insertion-order authority to externally-verifiable wall-time. Without it, timestamps are advisory metadata and every reconstruction is event-index-authoritative (§Ordering); with it, audit and breach queries can be bounded by clock time. Named by the Ordering rule, both time-bounded adversarial scenarios, and Generation acceptance.
- **Identity Federation** *(forthcoming)* — links [Party Id] records across trust domains; handles cross-system identity resolution.
- **Delegation / Representation** *(forthcoming)* — models authorized representatives (guardians, attorneys-in-fact, corporate officers) acting on behalf of an enrolled party.

---

## Standards references

- **FATF Recommendations 10–12** — Customer Due Diligence: identify the customer and verify identity using reliable, independent source documents, data, or information; identify and verify beneficial owners; understand the ownership and control structure; conduct ongoing due diligence on the business relationship. The atom's [Enroll] / [Verify] lifecycle is the structural form of FATF's CDD obligation.
- **Bank Secrecy Act / Anti-Money Laundering — 31 CFR Part 1020 (FinCEN — the US Financial Crimes Enforcement Network)** — Customer Identification Program: minimum identity attributes (name, date of birth, address, identification number), verification using documentary or non-documentary methods, and record retention for five years after account closure or the date the record was made. The atom's [Verification Method] and [Evidence Ref] fields satisfy the CIP's recording requirements.
- **FinCEN Beneficial Ownership Rule — 31 CFR §1010.230** — legal entity customers must identify and verify beneficial owners owning ≥25% and a single control person. Each beneficial owner is a Party Identity record; the Ownership Structure composition holds the ≥25% relationship graph.
- **EU 5th Anti-Money Laundering Directive (AMLD5)** — enhanced CDD requirements including beneficial ownership registries; alignment with FATF.
- **GDPR Article 4(1)** — the identity attributes collected by this atom (name, date of birth, document type and reference) are personal data under GDPR; all processing is subject to Articles 5–6.
- **GDPR Articles 5–6** — lawful basis for processing identity data; typically Article 6(1)(c) (legal obligation) or Article 6(1)(b) (performance of a contract). The composing [Consent](./consent.md) atom governs data processing *beyond* the regulatory obligation.
- **GDPR Article 17** — right to erasure; creates tension with BSA/AML and FATF retention obligations. The atom does not resolve this tension (see Edge cases); Retention Window, Erasure Coordination *(forthcoming)*, and legal-counsel adjudication compose for this.
- **HIPAA 45 CFR §164.514** — patient identity is required for the creation of protected health information records; the patient is a Party Identity in the healthcare context.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63A (Identity Assurance Levels)** — IAL1, IAL2, IAL3 (Identity Assurance Levels — graded strength of identity proofing: self-asserted, remote with document evidence, in-person with biometric). The atom's [Verification Method] field implicitly captures the IAL level; explicit IAL tagging and method-to-IAL mapping is a composing concept.
- **ISO/IEC 29115 (Entity Authentication Assurance)** — the International Organization for Standardization / International Electrotechnical Commission analog to NIST SP 800-63A; defines four levels of entity authentication assurance. The atom's [Verification Method] field is the recording surface for the assurance level achieved.
- **OFAC SDN Compliance** — the US Office of Foreign Assets Control's sanctions screening requires parties to be checked against the SDN (Specially Designated Nationals) list; the [Suspend] → investigate → [Reinstate] or [Close] lifecycle is the operational form of a sanctions match process. The atom records the lifecycle; the screening system is a composing concept.

---

## Status

`grounded on Final Critique 5 — 2026-07-12` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 5 — 2026-07-12
formal: verified — party-identity.tla + 1 twin, 2026-06-03
last gate: 2026-07-12 — Final Critique 5, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/party-identity.md`.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes — SUPERSEDED by the Ledger and Decisions above; deleted with every other Lineage in the migration's closing commit</h2>
</summary>

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

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (42 terms): 5 Operations ([Enroll], [Verify], [Suspend], [Reinstate], [Close]); 2 Types ([Verification Event], [State-Change Event] — the party record itself stays a plain-noun referent with no Type card); 20 Fields — 9 on the party record ([Party Id], [Name], [Date Of Birth], [Document Type], [Document Ref], [Enrolled At], [Enrolling Actor Ref], [Current State], [State-Change Log]), 6 on the verification event ([Verification Id], [Verifying Actor Ref], [Verification Method], [Verification Result], [Evidence Ref], [Verified At]), 5 on the state-change event ([State Change Id], [Prior State], [New State], [Acting Actor Ref], [Reason]); 3 Parameters ([Suspending Actor Ref], [Reinstating Actor Ref], [Closing Actor Ref] — each consumed for attribution and stored as the event's [Acting Actor Ref], not under its own name); and 12 Members — the 4 lifecycle states ([Unverified], [Verified], [Suspended], [Closed]) plus 8 rejections ([Invalid Request], [Storage Failure], [Not Known], [Already Closed], [Not Verifiable], [Already Suspended], [Not Suspended], [No Passed Verification Since Suspend]). Survivors left backticked: the one labeled projected-contract signature per Operation; the `passed`/`failed` [Verification Result] value literals; the `(verification_id, state_change_id?)` return-shape literal; the `verify(verification_result=passed)`/`verify(passed)` call-shape literals; qualified cross-atom calls (`Party Identity.enroll`, `Invitation.accept`) and the external field `accepting_identity_ref`; concrete example calls, ids, document/evidence values, and timestamps; and external standard tokens (`YYYY-MM-DD`, document-type and method strings). The implicit clock stamps [Enrolled At]/[Verified At] and the state-change timestamps but derives no status, so there is no `[Now]` term (mirrors legal-hold). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim is carried by Summary/Intent/State/Invariant 4; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-sentence paragraphs, lossless. (e) **prose cut #5** — the State "Transitions" list rendered as a transition table (action / from state / condition / to state / effect), with the fail-closed, write-nothing, and rejection-precedence semantics kept in the prose beside it. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-05-20`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (42 terms); 11 invariants preserved; `.tla` untouched — harness re-run green: `party-identity.tla` PASS + `party-identity-buggy.tla --buggy` rejected.

---

**Final Critique 5 — scheduled rescan, 2026-07-12 (AI-conducted, fresh-reader discipline; claude-fable-5).** Six findings; all closed in-pattern. Round conducted cold against the full spec plus the pass question sets; formal-layer portion re-ran the harness (model PASS at 532 states — matching the recorded saturation point — twin rejected at 22; coverage matrix unchanged: Invariants 2, 3, 4, 6 covered, the rest carry their recorded out-of-scope verdicts). Per-finding record:

- *F1 — Invariant 7's erasure carve-out rested on a capability Retention Window explicitly disclaims — foundational (capability provenance) →* Invariant 7 and the *Retention of party records* edge case pinned field-level scrubbing on "the Retention Window composition," with the scrub "recorded as a Retention Window event." Retention Window is an atom whose declared surface is place-under-retention and purge gating; its own spec states it does not handle privacy-law erasure and routes GDPR Article 17 scrubbing to a coordinated erasure pattern — no scrub action or "Retention Window event" surface exists in the peer. Exactly the Immutable Transaction Ledger Final Critique 5 class; the 2026-06-08 provenance sweep covered compositions only, which is how this atom-level instance survived it. Re-declared per the legitimate-source rules: scrubbing now belongs to a composing **Erasure Coordination** pattern *(forthcoming — the owner Retention Window itself names)*, recorded by that pattern as an attributed event; Retention Window's role is scoped to retention-period governance. Invariant 7, both edge cases, the [Name] and [Enrolled At] Terms cards, Composition notes (Retention Window entry adjusted; Erasure Coordination entry added), and the Standards references aligned; the "composition" kind misnomer on Retention Window and Consent corrected throughout.
- *F2 — no read/query surface — foundational →* five write actions and no [Read]: every adversarial scenario, Generation acceptance check, and Feedback claim presumed a retrieval surface the spec never defined or deferred. A minimal [Read] is now specified (per the batch triage decision, mirroring Approval Step's template scoped to this atom): `read(query) → ordered_sequence_of_party_records | rejected(invalid-query)`; filter axes [Party Id] / [Current State] / [Enrolled At] range; results in enrollment insertion order (the atom's own §Ordering authority — no sortable-id obligation introduced); full field set per record including [State-Change Log] and [Verification Event] list; malformed-query taxonomy with reject-not-ignore semantics; [Read] added to Inputs, Decision points, Behavior (store-monotonicity bullet), Feedback, the Intent action list, and the Terms registry ([Read], [Query], [Invalid Query] cards — 45 terms).
- *F3 — Trusted Timestamping was an unmarked phantom — refining →* cited six times as "the Trusted Timestamping composition" (Ordering, two adversarial scenarios, Generation acceptance, Clock semantics) with no file, no link, no *(forthcoming)* marker, and no Composition-notes entry while five other unlanded patterns were dutifully listed. Now marked *(forthcoming)* at its load-bearing mentions, kind-neutralized to "composing pattern," and given a Composition-notes entry naming its wall-time-anchor role.
- *F4 — malformed [Party Id] handling undefined; priority inverted against the sibling — refining →* the uniform validation rule's enumeration omitted [Party Id] and [Not Known] was checked first, so a whitespace id fell to [Not Known] while Approval Step rejects malformed ids as [Invalid Request] before the store lookup. Pinned to the sibling's ordering: malformed [Party Id] → [Invalid Request] before the store is consulted; uniform rule, priority ordering, and the [Not Known] card updated.
- *F5 — "implicit clock" wording sat on the corpus's named anti-pattern; the no-caller-timestamp decision was undefended — refining →* Inputs declared "an implicit clock" and the transition table read "the implicit clock reading" while execution-contract.md §Logic Confinement makes time an explicit injected input (and its 2026-07-12 placement revision moved the read to the guard step). Rewired to "the injected clock reading (the pipeline's `clock_t`)" at Inputs, §Ordering, the transition-table note, and both timestamp Terms cards; Clock semantics gained the defended-in-line rationale for accepting no caller-supplied timestamps (record-time vs claimed-time: the moment a check was actually performed is evidence content behind [Evidence Ref], and with insertion order authoritative a caller stamp buys no guarantee while opening ambiguity).
- *F6 — caller-side storage indeterminacy unnamed; minor gloss/link nits — refining →* new *Indeterminate storage outcomes* edge case (store-side vs caller-side knowledge; re-query-before-retry; [Duplicate Prevention](./duplicate-prevention.md) for enroll retries; suspend/reinstate/close self-detecting; [Verify] retry explicitly *not* self-detecting — the composing workflow owns verification-retry discipline). EDD bound to "enhanced due diligence" at first use with Customer Onboarding linked; Consent's kind corrected in Standards references; the Status prose notes the Angry→Happy Torvalds persona rename. Considered and declined: length caps on actor/document/evidence refs — siblings' opaque refs are uniformly uncapped, and a cap here would be a corpus-wide primitive-policy decision, not a per-atom patch.

Gates after fixes: linter clean on the touched files (O-term resolver — all 45 terms resolve; every card used); harness green (`party-identity.tla` PASS 532 states / twin rejected 22 — model untouched this round). Status advanced to `grounded on Final Critique 5 — 2026-07-12`; ROADMAP status mirror updated in the same change.

</details>
