---
title: Consent
parent: Compliance
grand_parent: Atoms
nav_order: 6
has_toc: true
toc: true
---

# Consent

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

> A compliance primitive: a binding of a data subject's affirmative agreement to a specified processing purpose, with a full lifecycle from grant through revocation and expiry. Each consent grant has an opaque immutable id; the subject reference, purpose scope, granting actor, and grant timestamp are immutable properties set at grant. Three terminal-bound states — Granted, Revoked, Expired. A revoked grant is terminal; a new processing need requires a new grant. Revocation is not retroactive — it does not erase the record of prior processing under valid consent, only terminates future reliance on it.

---

## Intent

Every system that processes personal data must answer a question before it acts: does it have the data subject's agreement to do what it is about to do? In many regulatory regimes — GDPR, CCPA/CPRA, HIPAA — that agreement is a formal legal prerequisite for certain categories of processing, not merely a courtesy. The record of that agreement, its scope, its duration, and its eventual termination is both an operational control and a legal artifact.

Consent is the specification of that record. A data subject grants consent for a named processing purpose: `marketing:email`, `analytics:behavioral`, `research:anonymized`. The grant is the moment of agreement — timestamped, attributed to the granting actor (the system or agent that received the data subject's affirmative signal), and scoped to a stated purpose. The grant is not a blanket authorization; it covers one purpose scope per record. If a system needs consent for three purposes, it holds three consent records.

The grant may terminate in two ways: the data subject revokes it, or it expires because it was time-bounded at grant. Either way, the terminal state is permanent — a revoked or expired grant is not reactivated. A data subject who revokes consent and later wishes to re-consent creates a new grant; the prior record remains as evidence of the prior agreement and its termination. This is not a limitation — it is the evidentiary structure that regulatory regimes require: the full history of when consent was given, for what, and when it ended, recoverable from the records alone.

The atom is structurally distinct from [Permissions](./permissions.md) in a load-bearing way: Permissions governs what an internal actor may do within the system — it is an authorization surface pointing inward. Consent governs what the system may do *to or with* a data subject's data — it is an authorization surface pointing outward, held by the data subject, not the system operator. The two atoms are composing peers, not alternatives. A system may have both: a data subject's Consent for `marketing:email` (outward authorization) and an internal actor's Permission to trigger the email campaign (inward authorization). Consent is not a replacement for access control; it is the data subject's contribution to the authorization decision.

The atom also models revocation as a first-class action, not as a state flag. Revocation is an event with its own timestamp, its own actor attribution, and its own stated reason. GDPR Article 7(3) requires that withdrawal of consent be as easy to exercise as grant — the `revoke` action is the specification of that requirement. Expiry is not an action; it is a condition. When a Granted consent's `expires_at` timestamp is reached, the consent becomes Expired. The transition is passive — no actor triggers it, no action is required. The `check` action evaluates the current state including expiry; the composing system does not need to poll for expiry separately.

This is a freestanding concept in the EOS sense. It carries its own state (the consent record set), its own actions (`grant`, `revoke`, `check`, `read`), and its own invariants (grant immutability, three-state exclusivity, terminal absorption, revocation non-retroactivity, expiry, attribution completeness, store durability). Composing patterns add propagation on revocation, cross-record purpose enforcement, and integration with access control surfaces.

---

## Structure

### Store instance model

The Consent atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per jurisdiction, product line, or data controller entity. `consent_id` values are unique within a store instance; uniqueness across instances is a composing concern. `subject_ref` and `purpose` together do not form a unique key — a subject may hold multiple Granted consents for the same purpose (for example, re-consent after expiry with a fresh grant while the prior grant's record is retained). `consent_id` is the only unique identity anchor. Calls implicitly target a single routed instance; instance selection is a deployment-routing concern.

### Identity model

Each consent record has an opaque, immutable, system-generated `consent_id` — assigned on `grant`, never reused, never reassigned within the store instance. The id is the record's identity; the subject reference, purpose, granting actor, and timestamps are properties of the record, not its identity.

`subject_ref` is an opaque reference to the data subject whose consent is recorded. Set on `grant`, immutable. The atom does not validate that the data subject exists in any other system; `subject_ref` is the caller's responsibility.

`purpose` is an opaque string naming the processing purpose scope for which consent is granted (e.g., `marketing:email`, `analytics:behavioral`, `hipaa:treatment`). Set on `grant`, immutable. The atom does not interpret purpose semantics — purposes are caller-declared vocabulary. Two consent records with the same `subject_ref` and `purpose` are distinct records with distinct `consent_id`s; the atom does not enforce uniqueness across (subject, purpose) pairs.

`granted_by` is an opaque reference to the actor who recorded the data subject's affirmative agreement — typically the system or integration that received the consent signal. Set on `grant`, immutable. It is the attribution anchor for the consent event; empty or whitespace-only values are rejected.

`expires_at` is an optional timestamp. If supplied, the consent expires at that instant — the `check` action returns `expired` for any query at or after `expires_at`. `expires_at` must be in the future at grant time. If not supplied, the consent does not expire by time; only explicit `revoke` terminates it.

### Inputs

- `grant` calls from consent collection surfaces — web forms, mobile apps, verbal consent capture integrations, API clients — each carrying a subject reference, purpose scope, granting actor, optional expiry timestamp, and optional metadata.
- `revoke` calls documenting the data subject's withdrawal of consent, carrying the consent id, the revoking actor, a required reason, and an optional explicit timestamp.
- `check` queries from processing systems evaluating whether a subject holds valid consent for a purpose at a given moment — the operational gate check before each consent-dependent action.
- `read` queries from compliance dashboards, DSAR workflows, audit processes, and regulatory reporting tools.

### Actions

- `grant(subject_ref, purpose, granted_by, expires_at?, metadata?) → consent_id | rejected(invalid-request | storage-failure)` — record a data subject's affirmative agreement to processing for the named purpose. Assigns a fresh `consent_id`, records `subject_ref`, `purpose`, `granted_by`, `granted_at` (wall clock), and `expires_at` if supplied. The consent enters Granted state. `subject_ref`, `purpose`, and `granted_by` must each contain at least one non-whitespace character; `expires_at`, if supplied, must be strictly in the future at the moment of the call — any violation is `invalid-request`. `storage-failure` if the store write fails after all preconditions pass; no `consent_id` is issued and no record enters the store.

- `revoke(consent_id, revoked_by, reason, revoked_at?) → revoked | rejected(not-known | already-revoked | already-expired | invalid-request | storage-failure)` — document the data subject's withdrawal of consent and transition the record to Revoked. Records `revoked_by`, `revocation_reason`, and `revoked_at` (wall clock if not supplied; must not be in the future and must be ≥ `granted_at`); all are immutable after the transition. `revoked_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`). `storage-failure` leaves the record in Granted state; the caller must retry. Rejection priority: `not-known` → `already-revoked` → `already-expired` → `invalid-request` → `storage-failure`.

- `check(subject_ref, purpose, at_time?) → granted | revoked | expired | not-known` — evaluate the consent state for a subject and purpose at a given instant. `at_time` defaults to the current wall clock if not supplied. Returns `granted` if a Granted consent for (subject, purpose) exists and `at_time` is before `expires_at` (or no `expires_at` is set). Returns `expired` if the most-recent consent for (subject, purpose) is Granted but `at_time` ≥ `expires_at`. Returns `revoked` if the most-recent consent for (subject, purpose) is Revoked. Returns `not-known` if no consent record exists for (subject, purpose). When multiple consent records exist for the same (subject, purpose), `check` evaluates the most recently granted one — the one with the latest `granted_at` among all records for that pair. `check` never rejects; it returns one of the four first-class outcome tags.

- `read(query) → ordered_sequence_of_consents | rejected(invalid-query)` — return consent records matching the query, ordered by `granted_at` ascending, then by `consent_id` ascending as a stable tiebreaker. A query may filter by `consent_id`, `subject_ref`, `purpose`, `granted_by`, `state`, or any combination including time ranges on `granted_at`, `revoked_at`, or `expires_at`. A query supplying only a `consent_id` returns at most one record. A well-formed query matching no records returns an empty sequence, not a rejection. A query with no filters returns every consent record in the store. A time range filter on `revoked_at` applied where `state: Granted` returns an empty sequence — Granted records carry no `revoked_at`. Only malformed parameters surface as `invalid-query`: a syntactically invalid `consent_id` (non-null, non-empty), an unrecognized state value, or a time range with end before start.

### Outputs

- For `grant`: a fresh `consent_id`, or a rejection.
- For `revoke`: the outcome token `revoked`, or a rejection.
- For `check`: one of `granted | revoked | expired | not-known` — always a first-class result, never a rejection.
- For `read`: a (possibly empty) ordered sequence of consent records. Fields present on every record: `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, `state`. Optional field present when supplied at grant: `expires_at`, `metadata`. State-specific fields: `revoked_by`, `revocation_reason`, `revoked_at` on Revoked records. A Revoked record carries all placement fields and all revocation fields simultaneously.

### State

Each consent record is in exactly one state:

- **Granted** — the data subject's agreement is in effect for the named purpose. If `expires_at` is set and the current time ≥ `expires_at`, `check` returns `expired` even though the record's stored state remains Granted until an explicit state transition is written. The record carries `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, and `expires_at` (if supplied). May be revoked (transitioning to Revoked) or evaluated via `check`.
- **Revoked** — the data subject has withdrawn consent. Carries `revoked_by`, `revocation_reason`, and `revoked_at` (all immutable from the moment `revoke` completes), plus all grant fields. Terminal; no further transitions.
- **Expired** — the consent's `expires_at` has passed. The record's stored state transitions to Expired when evaluated as such; the `check` action returns `expired` for queries at or after `expires_at`. Terminal; no further transitions. A subject who wishes to re-consent for the same purpose after expiry requires a new `grant` call producing a new `consent_id`.

Valid transitions:

- `grant(...)` → new record enters Granted
- Granted → Revoked (via `revoke`)
- Granted → Expired (passive, on `expires_at` elapsing)

No other transitions exist. Neither Revoked nor Expired can be re-activated; a new consent need requires a new `grant`.

### Flow

1. **Consent collection.** A user onboarding to a health app is presented with a consent form for `analytics:behavioral`. They affirm. The app calls `grant(subject_ref: "user-4491", purpose: "analytics:behavioral", granted_by: "onboarding_service", expires_at: "2027-05-13T00:00:00Z")` → `consent_id: "cns-0001"`. The record enters Granted.
2. **Processing gate check.** Before emitting a behavioral analytics event, the analytics pipeline calls `check(subject_ref: "user-4491", purpose: "analytics:behavioral")` → `granted`. Processing proceeds.
3. **Revocation.** User submits a "withdraw consent" request via the app's privacy settings. The privacy service calls `revoke("cns-0001", revoked_by: "privacy_service", reason: "User-initiated withdrawal via privacy settings — 2026-05-13")` → `revoked`. The record transitions to Revoked.
4. **Post-revocation gate check.** The analytics pipeline checks again: `check(subject_ref: "user-4491", purpose: "analytics:behavioral")` → `revoked`. Processing is suppressed.
5. **Re-consent.** Six months later the user re-enables analytics. The app calls `grant(subject_ref: "user-4491", purpose: "analytics:behavioral", granted_by: "onboarding_service", expires_at: "2028-11-13T00:00:00Z")` → `consent_id: "cns-0088"`. A new Granted record exists; cns-0001 remains Revoked as an audit record. `check` now returns `granted` — it evaluates the most recently granted record (cns-0088).
6. **DSAR audit.** A data subject access request queries `read({subject_ref: "user-4491"})` — returns both cns-0001 (Revoked) and cns-0088 (Granted), with full attribution on each. The complete consent history is recoverable from the store.

### Decision points

- **At `grant`** — `subject_ref`, `purpose`, and `granted_by` must each contain at least one non-whitespace character; `expires_at`, if supplied, must be strictly in the future at call time (checked against receiving node's wall clock). Any violation is `invalid-request`. `storage-failure` if the store write fails; no `consent_id` is issued, no record enters the store.

- **At `revoke`** — `not-known` if the `consent_id` does not exist in the store; `already-revoked` if the record is in Revoked state; `already-expired` if the record is in Expired state. If none of the above: `revoked_by` and `reason` must each be non-empty and non-whitespace-only (`invalid-request`); `revoked_at`, if supplied, must not be in the future and must be ≥ the record's `granted_at` (`invalid-request`). `storage-failure` leaves the record in Granted state; the caller must retry. Rejection priority: `not-known` → `already-revoked` → `already-expired` → `invalid-request` → `storage-failure`.

- **At `check`** — `at_time`, if supplied, may be any timestamp — past, present, or future; `check` is a point-in-time query and accepts future `at_time` values (useful for "will this consent still be valid in 30 days?" pre-flight checks). The action never rejects; it returns one of four first-class outcome tags.

- **At `read`** — any supplied `consent_id` must be syntactically valid (non-null, non-empty). Any supplied state filter must be one of {`Granted`, `Revoked`, `Expired`}. A time range filter must have end ≥ start. A well-formed query matching no records returns an empty sequence. Only malformed parameters surface as `invalid-query`.

### Behavior

- **Consent records are durable on success.** Once `grant` returns a `consent_id`, the record is in the store and will appear in subsequent reads and `check` evaluations.
- **`grant` is not idempotent.** Two `grant` calls for the same `subject_ref` and `purpose` create two independent consent records with distinct `consent_id`s. Both are valid until individually revoked or expired.
- **Revocation is not retroactive.** Revoking a consent does not erase the record of prior consent or invalidate processing that occurred while the consent was Granted. It terminates the basis for *future* processing. The revocation record is the evidence that the data subject exercised their right; the grant record is the evidence that prior processing was lawful.
- **`check` evaluates the most recently granted record.** When multiple consent records exist for the same (subject, purpose), `check` uses the one with the latest `granted_at`. This means re-consent after revocation produces a `granted` result without requiring the prior Revoked record to be altered. The full history is preserved; the gate check reflects current intent.
- **Expiry is passive.** There is no `expire` action. A Granted record with `expires_at` in the past is evaluated as Expired by `check`; its stored `state` transitions to Expired when the system first evaluates or persists the expiry. Implementations may write the Expired state eagerly (at the moment `expires_at` elapses) or lazily (on first read after elapsing); both are conforming as long as `check` returns `expired` for any query at or after `expires_at`.
- **Revoked and Expired records are retained.** Terminal records are never removed from the store. They are the evidence of prior consent and its lawful termination — deleting them would destroy the proof of data subject intent.
- **The atom does not enforce processing suppression.** Whether a system actually stops processing a data subject's data after revocation is an enforcement concern of the composing layer. The atom records that consent has been withdrawn; the composing system checks `check` before each consent-dependent action.
- **Reads are repeatable; the consent store is monotonic with respect to records.** `grant` adds records; `revoke` and expiry transition state. An unfiltered read at `t2 > t1` returns every record visible at `t1` plus any granted in between, with updated state on records that transitioned.

### Feedback

- After `grant` — a new Granted record exists; `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, and `expires_at` (if supplied) are set and immutable.
- After `revoke` — the record is now Revoked; `revoked_by`, `revocation_reason`, and `revoked_at` are set and immutable. All grant fields are unchanged.
- After `check` — a first-class outcome tag: `granted`, `revoked`, `expired`, or `not-known`. No state change occurs.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Grant immutability.** After a successful `grant`, the fields `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, and `expires_at` never change, regardless of any subsequent action.

- **Invariant 2 — Membership exclusivity.** Every consent record known to the store is in exactly one of {Granted, Revoked, Expired} at all times.

- **Invariant 3 — Terminal absorption.** Once a record transitions to Revoked or Expired, no action transitions it further. Neither terminal state has an outbound transition.

- **Invariant 4 — Revocation attribution is complete.** Every Revoked record carries non-empty `revoked_by`, `revocation_reason`, and `revoked_at`. An anonymous revocation or an unexplained withdrawal is a conformance failure — it defeats the audit trail that demonstrates the data subject exercised their right and that the system honored it.

- **Invariant 5 — Temporal ordering on revocation.** For every Revoked record, `revoked_at ≥ granted_at`. A consent cannot be documented as revoked before it was granted.

- **Invariant 6 — Expiry coherence.** A record with `expires_at` set: if `expires_at` has elapsed at the time of evaluation, `check` returns `expired` and the record's stored state is Expired. `expires_at` must be strictly in the future at grant time — a consent that is already expired at the moment of grant is meaningless.

- **Invariant 7 — Grant attribution is complete.** Every consent record, in any state, carries non-empty `consent_id`, `subject_ref`, `purpose`, `granted_by`, and `granted_at`. Invariant 1 guarantees these are immutable; this invariant guarantees they are never empty. An anonymous grant or an unscoped purpose is a conformance failure — neither answers the regulatory question of who agreed to what and when.

- **Invariant 8 — Consent store durability.** No consent record is removed from the store. The total record count is monotonically non-decreasing. A `consent_id` returned by a successful `grant` is durably persisted; a `storage-failure` rejection guarantees no partial record was written. Terminal records are retained as audit evidence of prior consent and its lawful termination.

- **Invariant 9 — Revocation non-retroactivity.** Transitioning a record to Revoked does not alter the `granted_at` timestamp, the `purpose`, or any other grant field. The record of prior consent is preserved unchanged. Revocation terminates future reliance; it does not rewrite history.

---

## Examples

### Happy path — grant, check, revoke, re-consent

See Flow section. The full arc is walked there: initial grant, affirmative gate check, user-initiated revocation, suppressed gate check, re-consent producing a new record, and DSAR audit recovering the complete history.

### Rejection path — revoke an already-revoked record

A retry after a network timeout: `revoke("cns-0001", revoked_by: "privacy_service", reason: "retry")` → `rejected(already-revoked)`. The record is unchanged. The caller detects the rejection and suppresses the retry.

### Rejection path — grant with empty purpose

`grant(subject_ref: "user-8823", purpose: "  ", granted_by: "consent_ui")` → `rejected(invalid-request)`. Whitespace-only purpose is treated as empty. No record is created.

### Rejection path — expires_at in the past

`grant(subject_ref: "user-9001", purpose: "marketing:sms", granted_by: "consent_ui", expires_at: "2020-01-01T00:00:00Z")` → `rejected(invalid-request)`. A consent expiring in the past is already expired at the moment of grant — not a meaningful consent.

### check — expired consent

User granted consent for `analytics:behavioral` expiring `2026-05-01T00:00:00Z`. On `2026-05-13`, the analytics pipeline calls `check(subject_ref: "user-4491", purpose: "analytics:behavioral")` → `expired`. Processing is suppressed.

### check — future at_time pre-flight

Before queuing a 30-day marketing campaign, the system calls `check(subject_ref: "user-4491", purpose: "marketing:email", at_time: "2026-06-13T00:00:00Z")` → `granted` (consent expires `2027-01-01`). The campaign is scheduled with confidence that consent will be valid at delivery time.

---

## Regulated adversarial scenarios

### Regulator audit — GDPR Article 7 validity challenge

A data protection authority investigates whether a data controller had valid consent before processing personal data for `analytics:behavioral` purposes on a given date. The controller queries `read({subject_ref: "user-4491", purpose: "analytics:behavioral"})` and retrieves all consent records for that subject and purpose. The authority evaluates: (a) was a Granted record in effect on the processing date? — confirmed by `granted_at` and the absence of `revoked_at` or `expires_at` before that date; (b) was consent freely given, specific, informed, and unambiguous — `granted_by` names the collection point; the `purpose` field names the scope; the `metadata` field (if used) carries the consent form version or signal type. (c) Is the grant record immutable — confirmed by Invariants 1 and 7. The authority confirms that consent was valid for the period in question; the controller does not need to produce any witness testimony or developer narration.

### Disputed revocation — data subject claims non-compliance

A data subject submits a complaint claiming that the controller continued sending marketing emails after they withdrew consent. The controller queries `read({subject_ref: "user-4491", purpose: "marketing:email"})`. The result shows: `cns-0001` Granted on `2025-03-01`; `cns-0001` Revoked on `2026-01-15` (`revoked_by: "privacy_portal"`, `revocation_reason: "User withdrawal via preferences page"`). The controller can show exactly when revocation was recorded and by which system. If marketing emails were sent after `2026-01-15`, that is a processing system failure — the Consent atom faithfully records the withdrawal; whether the processing system checked `check` before sending is the composing layer's conformance question. The atom's records answer the when-was-consent-withdrawn question precisely.

### Cross-purpose consent audit — HIPAA Authorization review

A covered entity receives an HHS inquiry about whether patient `patient-7712` consented to disclosure of PHI to a research partner under `hipaa:research:partner-univ-cardiology`. The entity queries `read({subject_ref: "patient-7712", purpose: "hipaa:research:partner-univ-cardiology"})`. The result shows a Granted record with `granted_at: 2025-09-01`, `expires_at: 2026-09-01`, and `granted_by: "clinical_consent_kiosk"`. The disclosure occurred on `2026-01-10` — within the consent window. `check(subject_ref: "patient-7712", purpose: "hipaa:research:partner-univ-cardiology", at_time: "2026-01-10T00:00:00Z")` → `granted`. The entity demonstrates valid HIPAA Authorization at the time of disclosure from the records alone.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Grant completeness check.** For a set of `consent_id`s known to have been issued, confirm that `read({consent_id: X})` returns each of them across all states. No issued `consent_id` may be absent from the store.

2. **Grant attribution check.** For every consent record in the store: confirm `consent_id`, `subject_ref`, `purpose`, `granted_by`, and `granted_at` are all non-empty (Invariant 7). A record missing any attribution field is a conformance failure.

3. **Revocation attribution check.** For every Revoked record: confirm `revoked_by`, `revocation_reason`, and `revoked_at` are all non-empty, and that `revoked_at ≥ granted_at` (Invariant 5). A Revoked record with an empty attribution field or inverted temporal ordering is a conformance failure.

4. **check reflects current state.** For a Granted record: call `check(subject_ref, purpose)` → `granted`. Revoke it. Call `check(subject_ref, purpose)` again → `revoked`. Re-grant. Call `check(subject_ref, purpose)` → `granted` (evaluating the new, most-recent grant). Confirms Invariant 3 (terminal absorption) and `check` most-recent-grant semantics.

5. **Expiry enforcement check.** Grant a consent with `expires_at` in the near future. Wait for expiry. Call `check(subject_ref, purpose)` → `expired`. Confirm the record is now in Expired state. Confirms Invariant 6.

6. **Terminal absorption check.** Attempt `revoke` against a known Revoked record → `rejected(already-revoked)`. Attempt `revoke` against a known Expired record → `rejected(already-expired)`. Confirm neither record's fields change after the attempted action.

7. **No-destruction check.** For a set of `consent_id`s including Revoked and Expired records, confirm that `read({consent_id: X})` returns each of them. Terminal records must remain in the store as audit evidence (Invariant 8).

---

## Edge cases and explicit non-goals

- **`grant` is not idempotent.** A consent collection surface that retries after a network timeout creates a duplicate consent record if the first call succeeded. Both records are valid. For at-most-once semantics on grant, compose with [Duplicate Prevention](../temporal/duplicate-prevention.md).

- **Multiple Granted consents for the same (subject, purpose).** The atom allows it — re-consent after a prior grant is still Active (before revocation or expiry) creates two Granted records. `check` evaluates the most recently granted one. This is the correct model: the data subject's most recent affirmative signal governs; prior grants are retained as history. A deployment that wants to enforce single-active-grant-per-(subject, purpose) must enforce uniqueness at the composing layer, not within this atom.

- **Revocation of one grant does not affect other grants for the same (subject, purpose).** If a subject holds two Granted records for `marketing:email` (for example, from two re-consent events), revoking one leaves the other unaffected. `check` returns `granted` until all Granted records for that pair are revoked or expired. This is consistent with the independence principle from Legal Hold — each record has its own lifecycle.

- **`metadata` field.** The optional `metadata` parameter at `grant` carries caller-supplied context: consent form version, signal type (`click`, `verbal`, `api`), jurisdiction, or language of the consent form presented. The atom stores it as an opaque payload; it does not interpret or validate it. Metadata is immutable after grant (Invariant 1). For regulated contexts requiring specific metadata fields — GDPR record-of-processing, HIPAA Authorization elements — the composing layer enforces required metadata content before calling `grant`.

- **Purpose vocabulary.** The atom does not define what purposes are valid. `purpose` is an opaque string; `marketing:email` and `42` are equally valid to the atom. Purpose taxonomy governance — what scopes exist, how they compose, which imply which — is a deployment concern. Fine-grained purpose hierarchies (e.g., `research:anonymized` implying `analytics:aggregate`) are composing-layer concerns.

- **Consent withdrawal propagation.** When a data subject revokes consent, downstream systems holding data processed under that consent may need to act — delete derived data, cease ongoing processing, notify third parties. That propagation is out of scope for this atom. The atom records the revocation; the Consent & Preference Management composition (C2) wires the propagation. The atom is the single source of truth for whether consent exists; it is not the orchestrator of what happens when it is withdrawn.

- **GDPR lawful bases other than consent.** GDPR Article 6 names six lawful bases for processing personal data; consent (Article 6(1)(a)) is one of them. Legitimate interest, contract necessity, and legal obligation are others. This atom models only consent as a lawful basis — it does not model all GDPR Article 6 bases. A system relying on `legitimate_interest` as its lawful basis does not use this atom for that basis; it may use this atom for other purposes where consent is the chosen basis.

- **Access control.** Who may grant consent on a data subject's behalf, who may revoke it, and who may read consent records is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In regulated contexts, proxy consent (consent granted by a guardian or authorized representative on behalf of a data subject) requires specific authorization controls not modeled here.

- **Consent for minors.** Jurisdictions vary on the age of consent for data processing (GDPR sets 16, with member-state option to lower to 13; COPPA sets 13 in the US). Parental or guardian consent for data subjects below the threshold is a composing concern — it requires a Party Identity or guardian-relationship record to establish the proxy relationship. The atom records the grant faithfully; the composing layer establishes that the granting actor has the authority to consent on the subject's behalf.

- **Clock semantics.** `granted_at` defaults to the receiving node's wall clock. `expires_at`, if supplied, must be strictly in the future at grant time. `revoked_at` defaults to the receiving node's wall clock; must not be in the future and must be ≥ `granted_at`. Back-dated `revoked_at` values are accepted — documenting a revocation recognized or communicated at an earlier time is valid. Clock skew, timezone normalization, and monotonicity are deployment concerns.

- **Expiry implementation.** The atom does not mandate whether Expired state transitions are written eagerly or lazily. An implementation that writes Expired eagerly (a background job at `expires_at`) and one that writes lazily (on first read after `expires_at`) are both conforming as long as `check` returns `expired` for any query at or after `expires_at`. Audit queries via `read` must reflect the Expired state accurately; an implementation that returns a Granted record via `read` for a consent past its `expires_at` is non-conforming.

---

## Composition notes

Consent is the data subject's authorization primitive — the complement to Permissions (which governs internal actor authorization) and the legal basis record that processing systems check before acting on personal data:

- **[Permissions](./permissions.md)** — composing peer, not substitute. Permissions governs what an internal actor may do; Consent governs what the system may do to the data subject's data. Both may be required for the same action.
- **[Actor Identity](./actor-identity.md)** — `granted_by` and `revoked_by` are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors. In regulated contexts (HIPAA, 21 CFR Part 11), consent collection and revocation are electronic records requiring verifiable authorship.
- **[Audit Trail](../../compositions/audit-trail.md)** — every `grant` and `revoke` event is an auditable action; Audit Trail provides the tamper-evident, attributed, retention-governed record of every consent lifecycle event.
- **[Retention Window](./retention-window.md)** — consent records must themselves be retained for regulatory proof periods (GDPR: "as long as necessary"; HIPAA: six years from grant or last effective date). The retention clock on consent records is a composing obligation.
- **[Tamper Evidence](./tamper-evidence.md)** — seals consent records against post-hoc modification. Court-admissible and regulator-admissible consent records require cryptographic integrity guarantees beyond this atom's spec-level immutability.
- **[Legal Hold](./legal-hold.md)** — a consent record under active litigation (e.g., a class-action data subject dispute) may be subject to a legal hold overriding its retention window.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for at-most-once semantics on consent grant under retry conditions.
- **Forthcoming:** Consent & Preference Management with Revocation Propagation (C2) — Consent + Audit Trail + Retention Window + Permissions + Event Log, wired to propagate revocation downstream and provide regulatory proof of consent management. Data Subject Rights Fulfillment (C6) — Consent records are the primary artifact answered by a DSAR right-of-access request.

---

## Standards references

- **GDPR Article 6(1)(a)** — consent as a lawful basis for processing personal data. A Granted consent record in effect at processing time is the legal basis documentation.
- **GDPR Article 7** — conditions for consent: must be freely given, specific, informed, and unambiguous; burden of proof on the controller (Invariant 7, Generation acceptance check 2); withdrawal must be as easy as giving (the `revoke` action, same surface as `grant`); withdrawal does not affect lawfulness of prior processing (Invariant 9, revocation non-retroactivity).
- **GDPR Article 17(1)(b)** — right to erasure applies when the data subject withdraws consent and there is no other lawful basis for processing. The `revoke` action is the trigger; whether erasure follows is a composing-layer decision.
- **GDPR Article 30** — record of processing activities must include the purpose of processing and the legal basis. Consent records with `purpose` and `granted_at` supply the Article 30 documentation surface.
- **CCPA / CPRA** — right to opt-out of sale or sharing of personal information; right to opt-in for sensitive personal information. The `grant` and `revoke` actions are the opt-in and opt-out mechanisms. CPRA extends consent requirements to sensitive personal information categories.
- **HIPAA §164.508 (Authorization)** — required elements for a valid authorization include: a description of the information to be used or disclosed (`purpose`), the name of the person authorized to make the disclosure (`granted_by` + composing Actor Identity), an expiration date or event (`expires_at`), and the right to revoke (`revoke` action). The consent record's fields map directly to the required Authorization elements.
- **HIPAA §164.522** — right of an individual to request restrictions on certain uses and disclosures of PHI. Consent records with granular `purpose` scoping are the mechanism.
- **21 CFR Part 11** — electronic records and signatures in FDA-regulated contexts. Consent records for clinical trial participation are regulated records under Part 11; `granted_by` and `revoked_by` map to electronic signature requirements when composed with Actor Identity.
- **ICH E6 Good Clinical Practice §4.8** — informed consent requirements for clinical trial subjects, including documentation, right of withdrawal, and retention of consent records. The consent record lifecycle (grant, revoke, retain) is the Part 4.8 compliance mechanism.
- **Children's Online Privacy Protection Act (COPPA)** — verifiable parental consent required for data collection from children under 13. Proxy consent (guardian granting on behalf of minor subject) is a composing concern; the atom records the grant faithfully.
- **ePrivacy Directive (Cookie Law)** — consent required for non-essential cookies and tracking. Web consent banners produce `grant` calls; user withdrawal produces `revoke` calls. The consent record is the ePrivacy audit artifact.

---

## Status

`unresolved` — foundation round complete (Pass 1 GRID, Pass 2 EOS, Pass 3 Linus). Human refinement rounds and AI adversarial round not yet completed.

---

## Lineage notes

Regulated atom. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)), baked in from the first draft. Legal Hold and Retention Window are the reference shapes for regulated compliance atoms; Permissions is the reference for the authorization-surface contrast in Intent.

**Pass 1 — Structural completeness (GRID).** Four findings, all closed in-pattern.

- *Store instance model absent.* Parallel finding to Legal Hold and every other multi-instance atom. Fixed: *Store instance model* subsection added. `consent_id` uniqueness scoped to instance; `subject_ref` + `purpose` noted as not forming a unique key (multiple grants valid); instance selection named as deployment-routing concern.

- *`check` return type not first-class.* Initial draft returned `granted` or `rejected(...)` for `check`. This is wrong — `revoked`, `expired`, and `not-known` are all valid, non-error outcomes. A caller that cannot distinguish these outcomes cannot make a lawful processing decision. Fixed: `check` returns one of four first-class outcome tags (`granted | revoked | expired | not-known`); never rejects.

- *Expiry transition mechanism unspecified.* The initial draft stated that Expired is a state but did not define whether the transition is eager (background job), lazy (on-read), or event-driven. An audit reading `read` after expiry would not know whether Expired state was reflected in stored records. Fixed: Behavior bullet and Edge case added specifying both eager and lazy implementations as conforming, with the requirement that `check` must return `expired` for any query at or after `expires_at` and that `read` must reflect Expired state accurately.

- *Outputs section incomplete.* `check` output not enumerated alongside `grant`, `revoke`, and `read`. Fixed: Outputs section now enumerates all four actions with their respective return types.

All nine GRID nodes resolved.

**Pass 2 — Conceptual independence (EOS).** Clean. Four extraction candidates evaluated; all kept in-pattern.

- *`metadata` field as over-absorption candidate.* Could `metadata` imply that consent form management or signal-type classification belongs in-atom? Evaluated: `metadata` is an opaque payload — the atom stores it, does not interpret it, and makes no claims about its structure. Parallel to `case_ref` in Legal Hold. Clean.

- *`purpose` vocabulary governance as hidden concern.* Could the atom need to define what purposes are valid? Evaluated: purpose is caller-declared vocabulary. The atom treats it as an opaque string. Purpose taxonomy governance (what scopes exist, hierarchies between them) is a deployment or composing-layer concern. The atom's job is to record that a subject agreed to a named scope, not to validate or interpret the scope. Clean.

- *`check` most-recent-grant semantics as hidden composition.* Could "evaluate the most recently granted record" mean the atom is secretly composing multiple consent records into an aggregate? Evaluated: `check` is a read operation over the consent store. The "most recently granted" selection is a deterministic query result, not a composition of independent state machines. No separate aggregate state is maintained. Clean.

- *Consent propagation on revocation as missing concern.* Should the atom propagate revocation to downstream systems? Evaluated: propagation requires knowing what downstream systems exist and importing their interfaces — a clear freestanding violation. The atom records the revocation; the Consent & Preference Management composition (C2) wires propagation. Clean; explicitly named as out-of-scope in Edge cases.

**Pass 3 — Adversarial scrutiny (Linus mode).** Five findings, all closed in-pattern.

- *Multiple Granted records for the same (subject, purpose) — `check` behavior not specified.* If a subject has two Granted records for `marketing:email`, which does `check` evaluate? Leaving this unspecified makes `check` non-deterministic and breaks the processing gate. Fixed: `check` evaluates the most recently granted record (latest `granted_at`); Behavior bullet and Decision point updated. Edge case added: revocation of one grant does not affect others.

- *`revoke` against an Expired record — rejection tag not named.* The initial draft only named `already-revoked` as a terminal-state rejection for `revoke`. An Expired record is also terminal; attempting `revoke` on it should be `already-expired`, not silently absorbed. Fixed: `already-expired` added to `revoke` rejection set; rejection priority updated: `not-known` → `already-revoked` → `already-expired` → `invalid-request` → `storage-failure`.

- *`expires_at` in the past at grant time — not addressed.* A caller supplying `expires_at: "2020-01-01"` would create a consent that is already expired at the moment of creation. This is meaningless and misleading. Fixed: Decision point at `grant` updated — `expires_at`, if supplied, must be strictly in the future at call time (`invalid-request`). Rejection path example added.

- *Revocation non-retroactivity not stated as an invariant.* The Intent section described it; nothing in the Invariants section locked it. An auditor checking the spec's behavioral claims against the invariants would find a gap. Fixed: Invariant 9 added — "Transitioning a record to Revoked does not alter the `granted_at` timestamp, the `purpose`, or any other grant field."

- *`check` with future `at_time` — validity not addressed.* The initial draft was silent on whether `at_time` could be in the future. This is a valid and useful pre-flight check ("will consent still be valid when I deliver this email in 30 days?"). Leaving it unspecified invites implementations to reject future `at_time` values unnecessarily. Fixed: Decision point at `check` explicitly permits future `at_time`; example added.
