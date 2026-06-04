---
title: Consent
parent: Compliance
grand_parent: Atomic Concepts
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

Every system that processes personal data must answer a question before it acts: does it have the data subject's agreement to do what it is about to do? In many regulatory regimes — GDPR (EU General Data Protection Regulation), CCPA/CPRA (California Consumer Privacy Act / Privacy Rights Act), HIPAA (US Health Insurance Portability and Accountability Act) — that agreement is a formal legal prerequisite for certain categories of processing, not merely a courtesy. The record of that agreement, its scope, its duration, and its eventual termination is both an operational control and a legal artifact.

Consent is the specification of that record. A data subject (the individual whose personal data is held — the rights-bearer under privacy law) grants consent for a named processing purpose (a declared, specific reason for which personal data may be used): `marketing:email`, `analytics:behavioral`, `research:anonymized`. The grant is the moment of agreement — timestamped, attributed to the granting actor (the system or agent that received the data subject's affirmative signal), and scoped to a stated purpose. The grant is not a blanket authorization; it covers one purpose scope per record. If a system needs consent for three purposes, it holds three consent records.

The grant may terminate in two ways: the data subject revokes it, or it expires because it was time-bounded at grant. Either way, the terminal state is permanent — a revoked or expired grant is not reactivated. A data subject who revokes consent and later wishes to re-consent creates a new grant; the prior record remains as evidence of the prior agreement and its termination. This is not a limitation — it is the evidentiary structure that regulatory regimes require: the full history of when consent was given, for what, and when it ended is carried in the records themselves, immutable by specification. Cryptographic protection of those records against post-hoc modification — the bar for court-admissible and regulator-admissible evidence — is added by composition with [Tamper Evidence](./tamper-evidence.md) (an atom that seals records with a cryptographic hash so any alteration is detectable); this atom does not provide it alone.

The atom is structurally distinct from [Permissions](./permissions.md) in a load-bearing way: Permissions governs what an internal actor may do within the system — it is an authorization surface pointing inward. Consent governs what the system may do *to or with* a data subject's data — it is an authorization surface pointing outward, held by the data subject, not the system operator. The two atoms are composing peers, not alternatives. A system may have both: a data subject's Consent for `marketing:email` (outward authorization) and an internal actor's Permission to trigger the email campaign (inward authorization). Consent is not a replacement for access control; it is the data subject's contribution to the authorization decision.

The atom also models revocation (withdrawal — revocation of previously given consent) as a first-class action, not as a state flag. Revocation is an event with its own timestamp, its own actor attribution, and its own stated reason. GDPR Article 7(3) requires that withdrawal of consent be as easy to exercise as grant — the `revoke` action is the specification of that requirement. Expiry is not an action; it is a condition. When a Granted consent's `expires_at` timestamp is reached, the consent becomes Expired. The transition is passive — no actor triggers it, no action is required. The `check` action evaluates the current state including expiry; the composing system does not need to poll for expiry separately.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the consent record set), its own actions (`grant`, `revoke`, `check`, `read`), and its own invariants (grant immutability, three-state exclusivity, terminal absorption, revocation non-retroactivity, expiry, attribution completeness, store durability). Composing patterns add propagation on revocation, cross-record purpose enforcement, and integration with access control surfaces.

---

## Summary

Consent records a person's agreement to have their personal data used for a specific, named purpose — for example, "marketing emails" or "behavioral analytics." Each record captures when the agreement was given, who collected it, what it covers, and how it ends: either the person withdraws it (revocation) or it runs out (expiry, if a time limit was set when it was granted). Every record is in one of three states — Granted, Revoked, or Expired — and the two ending states are permanent: once consent ends, you cannot revive it; the person has to give fresh agreement instead. The records are kept unchanged forever: when consent is withdrawn, that withdrawal is logged as its own dated, attributed event rather than by editing the original, so the proof that earlier use was permitted is never lost — withdrawing ends future use, it does not rewrite the past. The key operation is a check: before doing anything that depends on consent, a system asks "is there valid consent for this person and purpose?" — and it can ask about a past date (for an audit) or a future date (to confirm consent will still hold when, say, a campaign goes out next month). This is the mechanism behind privacy-law consent management, patient authorizations, and cookie opt-ins.

---

## Structure

### Store instance model

The Consent atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per jurisdiction, product line, or data controller entity. `consent_id` values are unique within a store instance; uniqueness across instances is a composing concern. `subject_ref` and `purpose` together do not form a unique key — a subject may hold multiple Granted consents for the same purpose (for example, re-consent after expiry with a fresh grant while the prior grant's record is retained). `consent_id` is the only unique identity anchor. Calls implicitly target a single routed instance; instance selection is a deployment-routing concern.

### Identity model

Each consent record has an opaque, immutable, system-generated `consent_id` — assigned on `grant`, never reused, never reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic `read` ordering and for `check` tiebreaking. The id is the record's identity; the subject reference, purpose, granting actor, and timestamps are properties of the record, not its identity.

`subject_ref` is an opaque reference to the data subject whose consent is recorded. Set on `grant`, immutable. The atom does not validate that the data subject exists in any other system; `subject_ref` is the caller's responsibility.

`purpose` is an opaque string naming the processing purpose scope for which consent is granted (e.g., `marketing:email`, `analytics:behavioral`, `hipaa:treatment`). Set on `grant`, immutable. The atom does not interpret purpose semantics — purposes are caller-declared vocabulary. Two consent records with the same `subject_ref` and `purpose` are distinct records with distinct `consent_id`s; the atom does not enforce uniqueness across (subject, purpose) pairs.

`granted_by` is an opaque reference to the actor who recorded the data subject's affirmative agreement — typically the system or integration that received the consent signal. Set on `grant`, immutable. It is the attribution anchor for the consent event; empty or whitespace-only values are rejected.

`expires_at` is an optional timestamp. If supplied, the consent expires at that instant — the `check` action returns `expired` for any query at or after `expires_at`. `expires_at` must be in the future at grant time. If not supplied, the consent does not expire by time; only explicit `revoke` terminates it.

### Inputs

- `grant` calls from consent collection surfaces — web forms, mobile apps, verbal consent capture integrations, API clients — each carrying a subject reference, purpose scope, granting actor, optional expiry timestamp, and optional metadata.
- `revoke` calls documenting the data subject's withdrawal of consent, carrying the consent id, the revoking actor, a required reason, and an optional explicit timestamp.
- `check` queries from processing systems evaluating whether a subject holds valid consent for a purpose at a given moment — the operational gate check before each consent-dependent action.
- `read` queries from compliance dashboards, DSAR (Data Subject Access Request — a request by an individual to see, correct, or erase the personal data an organization holds about them) workflows, audit processes, and regulatory reporting tools.

### Actions

For optional parameters across `grant`, `revoke`, and `check`, "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies. `metadata` is an opaque value the atom does not parse or validate — the same "supplied" semantics apply, and if not supplied (or if null, missing, or empty), no metadata is stored on the record. Deployment-specific content rules on metadata (required form-version fields, signal-type enumerations) are enforced by the composing layer before `grant` is called.

- `grant(subject_ref, purpose, granted_by, expires_at?, metadata?) → consent_id | rejected(invalid-request | storage-failure)` — record a data subject's affirmative agreement to processing for the named purpose. Assigns a fresh `consent_id`, records `subject_ref`, `purpose`, `granted_by`, `granted_at` (wall clock), and `expires_at` and `metadata` if supplied. The consent enters Granted state. `subject_ref`, `purpose`, and `granted_by` must each contain at least one non-whitespace character; `expires_at`, if supplied, must be strictly in the future at the moment of the call — any violation is `invalid-request`. `metadata`, if supplied, is stored as an opaque value; no validation is performed against its content. `storage-failure` if the store write fails after all preconditions pass; no `consent_id` is issued and no record enters the store.

- `revoke(consent_id, revoked_by, reason, revoked_at?) → revoked | rejected(invalid-request | not-known | already-revoked | already-expired | storage-failure)` — document the data subject's withdrawal of consent and transition the record to Revoked. The `consent_id` parameter must itself contain at least one non-whitespace character (`invalid-request`); a null, empty, or whitespace-only `consent_id` is malformed and rejected before any existence check is performed. Records `revoked_by`, `revocation_reason`, and `revoked_at` (wall clock if not supplied; must not be in the future and must be ≥ `granted_at`); all are immutable after the transition. The resolved `revoked_at` — whether caller-supplied or wall-clock-defaulted — must be ≥ `granted_at`; a value less than `granted_at` is `invalid-request` regardless of how it was derived (this enforces Invariant 5 against clock-skew artifacts as well as caller-supplied backdated values). `revoked_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`). `storage-failure` leaves the record in Granted state; the caller must retry. Rejection priority: malformed `consent_id` (`invalid-request`) → `not-known` → `already-revoked` → `already-expired` → attribution/temporal (`invalid-request`) → `storage-failure`.

- `check(subject_ref, purpose, at_time?) → granted | revoked | expired | not-known` — evaluate the consent state for a subject and purpose **as of `at_time`**. `at_time` defaults to the current wall clock if not supplied; it may be past, present, or future. `check` is a point-in-time query and must answer the question the caller asked: *what was the consent state at the moment `at_time`?* — not *what is the current stored state of the most-recent record?* A regulator auditing whether processing on a past date was lawful, and a system pre-flight-checking whether consent will be valid for a future delivery, depend on the same semantics.

  The algorithm: among all consent records for (subject, purpose), find the record R with the latest `granted_at` ≤ `at_time`. If no such record exists (every record for the pair was granted after `at_time`, or no record exists for the pair at all), return `not-known`. Otherwise, evaluate R at `at_time`:

  - If R's `revoked_at` is set and `revoked_at` ≤ `at_time` → return `revoked`.
  - Else if R's `expires_at` is set and `expires_at` ≤ `at_time` → return `expired`.
  - Else → return `granted`.

  When multiple records for the pair share the same latest `granted_at` ≤ `at_time`, the one with the highest `consent_id` in lexicographic byte-order is selected as a deterministic tiebreaker. A consent revoked or expired *after* `at_time` does not change the result of a query for `at_time`; the records remain a faithful point-in-time history. `check` never rejects; it returns one of the four first-class outcome tags.

- `read(query) → ordered_sequence_of_consents | rejected(invalid-query)` — return consent records matching the query, ordered by `granted_at` ascending, then by `consent_id` ascending in lexicographic byte-order as a stable tiebreaker. Implementations must assign `consent_id` values in a format where string byte-order sort produces a total order (e.g., ULID — Universally Unique Lexicographically Sortable Identifier, UUID v7 — version 7 of the Universally Unique Identifier, which is time-ordered, or zero-padded integer string). The supported filter axes are exactly: `consent_id`, `subject_ref`, `purpose`, `granted_by`, `state`, and time ranges on `granted_at`, `revoked_at`, or `expires_at`. Any combination of supported axes is valid. A query supplying only a `consent_id` returns at most one record. A well-formed query matching no records returns an empty sequence, not a rejection. A query with no filters returns every consent record in the store.

  **Time-range filters on absent fields.** A time-range filter on a field implicitly excludes records that do not carry that field. `revoked_at` is present only on Revoked records; a `revoked_at` filter implicitly excludes Granted and Expired records, regardless of whether a `state` filter is also supplied. `expires_at` is present only on records granted with an expiry; an `expires_at` filter implicitly excludes records that were granted without an expiry. A `state` filter combined with a time-range filter on a field absent from records of that state returns an empty sequence by the same rule — for example, `{state: Granted, revoked_at: {after: X}}` is well-formed and returns an empty sequence.

  **Malformed-query rules (`invalid-query`):** a `consent_id`, `subject_ref`, `purpose`, or `granted_by` filter value that is null, empty, or whitespace-only is `invalid-query` (the filter axes exist; the values are malformed). A `state` filter value that is not one of {`Granted`, `Revoked`, `Expired`} is `invalid-query`. A time range with end before start is `invalid-query`. A query carrying an unrecognized filter key — any key outside the supported axes named above — is `invalid-query`; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

### Outputs

- For `grant`: a fresh `consent_id`, or a rejection.
- For `revoke`: the outcome token `revoked`, or a rejection.
- For `check`: one of `granted | revoked | expired | not-known` — always a first-class result, never a rejection.
- For `read`: a (possibly empty) ordered sequence of consent records. Fields present on every record (any state): `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, `state`. Optional fields set at grant (independent of state): `expires_at` (if supplied at `grant`; absent otherwise) and `metadata` (if supplied at `grant`; absent otherwise) — both immutable thereafter. State-specific fields: `revoked_by`, `revocation_reason`, and `revoked_at` are present on Revoked records only. A Revoked record carries all grant fields (including `expires_at` and `metadata` if they were supplied) and all revocation fields simultaneously.

### State

The atom distinguishes two notions of state that the spec uses load-bearingly:

- **Semantic state** — the state implied by the record's fields evaluated against a point in time (default: now). Granted if `revoked_at` is not set and `expires_at` (if set) is in the future; Revoked if `revoked_at` is set and ≤ the evaluation time; Expired if `expires_at` is set and ≤ the evaluation time and `revoked_at` is not set or is after the evaluation time. Semantic state is what `check` returns and what an external evaluator reads from the records.
- **Stored state** — the persisted `state` field on the record. Eager implementations write the state transition (Granted → Expired) at the moment `expires_at` elapses, so stored state equals current semantic state. Lazy implementations write the transition on first evaluation past `expires_at`; until then, stored state may lag current semantic state. Both strategies are conforming as long as every `check` and `read` returns the semantic state of the record at the requested time.

Each consent record is in exactly one semantic state at any given evaluation time:

- **Granted** — the data subject's agreement is in effect for the named purpose. The record carries `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, and `expires_at` (if supplied). May be revoked (transitioning to Revoked) or evaluated via `check`.
- **Revoked** — the data subject has withdrawn consent. Carries `revoked_by`, `revocation_reason`, and `revoked_at` (all immutable from the moment `revoke` completes), plus all grant fields. Terminal; no further transitions.
- **Expired** — the consent's `expires_at` has elapsed and no revocation occurred at or before the elapse. Stored-state transition to Expired is written by the implementation per the eager or lazy strategy named above; semantic state changes the moment `expires_at` passes, independent of when the write occurs. Terminal; no further transitions. A subject who wishes to re-consent for the same purpose after expiry requires a new `grant` call producing a new `consent_id`.

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

- **At `revoke`** — the `consent_id` parameter is checked first: if null, empty, or whitespace-only, the call is `invalid-request` (the caller passed garbage, not a reference to a missing record). If `consent_id` is well-formed, the store is consulted: `not-known` if no record with this id exists; `already-revoked` if the record is in Revoked state; `already-expired` if the record is in Expired state (semantic state — Invariant 2). If none of the above, attribution and temporal checks apply: `revoked_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`); the resolved `revoked_at` — caller-supplied or wall-clock-defaulted — must not be in the future (the future-bound applies only when caller-supplied, because a wall-clock default is "now" by construction) and must be ≥ the record's `granted_at`. The `≥ granted_at` bound applies to the resolved `revoked_at` regardless of how it was derived; this enforces Invariant 5 against clock-skew artifacts as well as caller-supplied backdated values. A violation is `invalid-request`. `storage-failure` leaves the record in Granted state; the caller must retry. Rejection priority: malformed `consent_id` (`invalid-request`) → `not-known` → `already-revoked` → `already-expired` → attribution/temporal (`invalid-request`) → `storage-failure`.

- **At `check`** — `at_time`, if supplied, may be any timestamp — past, present, or future; `check` is a point-in-time query and accepts arbitrary `at_time` values. The action evaluates the record state as of `at_time` per the algorithm in the action description: find the record with the latest `granted_at` ≤ `at_time` for (subject, purpose); evaluate it at `at_time` using `revoked_at` and `expires_at` against `at_time`, not against current time. When multiple records share the same latest `granted_at` ≤ `at_time`, the record with the highest `consent_id` in lexicographic byte-order is selected as a deterministic tiebreaker. The action never rejects; it returns one of four first-class outcome tags.

- **At `read`** — every supplied filter value must be well-formed for its axis. A `consent_id`, `subject_ref`, `purpose`, or `granted_by` filter value that is null, empty, or whitespace-only is `invalid-query`. A `state` filter value not in {`Granted`, `Revoked`, `Expired`} is `invalid-query`. A time range with end before start is `invalid-query`. An unrecognized filter key — any key outside the supported axes — is `invalid-query`; the spec rejects rather than ignores unknown keys. Time-range filters on fields absent from a state's records (e.g., `revoked_at` on Granted records, `expires_at` on records granted without an expiry) implicitly return empty sequences for those records. A well-formed query matching no records returns an empty sequence.

### Behavior

- **Consent records are durable on success.** Once `grant` returns a `consent_id`, the record is in the store and will appear in subsequent reads and `check` evaluations.
- **`grant` is not idempotent.** Two `grant` calls for the same `subject_ref` and `purpose` create two independent consent records with distinct `consent_id`s. Both are valid until individually revoked or expired.
- **Revocation is not retroactive.** Revoking a consent does not erase the record of prior consent or invalidate processing that occurred while the consent was Granted. It terminates the basis for *future* processing. The revocation record is the evidence that the data subject exercised their right; the grant record is the evidence that prior processing was lawful.
- **`check` evaluates the consent state as of `at_time`.** The result reflects the records' fields evaluated against `at_time`, not the records' current stored state. Among all records for (subject, purpose), the record with the latest `granted_at` ≤ `at_time` is selected; ties on `granted_at` are broken by highest `consent_id` in lexicographic byte-order. The selected record is then evaluated at `at_time`: `revoked_at` ≤ `at_time` produces `revoked`; otherwise `expires_at` ≤ `at_time` produces `expired`; otherwise `granted`. A consent revoked or expired *after* `at_time` does not change the result for a query whose `at_time` is before that event — the records are a faithful point-in-time history. A new `grant` after a prior record's terminal event is the only way to restore a `granted` result at a `granted_at` after that event.
- **Expiry is passive.** There is no `expire` action. A record's semantic state is Expired whenever `expires_at` is set and ≤ the evaluation time (with no `revoked_at` ≤ that same time); its stored `state` field transitions to Expired when the system first evaluates or persists the expiry. Implementations may write the Expired state eagerly (at the moment `expires_at` elapses) or lazily (on first read or check after elapsing); both are conforming as long as `check` returns `expired` for any query whose `at_time` is ≥ `expires_at` (and not preceded by revocation), and `read` reflects Expired stored state for any record evaluated past its `expires_at`.
- **Revoked and Expired records are retained.** Terminal records are never removed from the store. They are the evidence of prior consent and its lawful termination — deleting them would destroy the proof of data subject intent.
- **The atom does not enforce processing suppression.** Whether a system actually stops processing a data subject's data after revocation is an enforcement concern of the composing layer. The atom records that consent has been withdrawn; the composing system checks `check` before each consent-dependent action.
- **Reads are repeatable; the consent store is monotonic with respect to records.** `grant` adds records; `revoke` and expiry transition state. An unfiltered read at `t2 > t1` returns every record visible at `t1` plus any granted in between, with updated state on records that transitioned.

### Feedback

- After `grant` — a new Granted record exists; `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, and `expires_at` (if supplied) are set and immutable.
- After `revoke` — the record is now Revoked; `revoked_by`, `revocation_reason`, and `revoked_at` are set and immutable. All grant fields are unchanged.
- After `check` — a first-class outcome tag: `granted`, `revoked`, `expired`, or `not-known`. No state change occurs.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Grant immutability.** After a successful `grant`, the fields `consent_id`, `subject_ref`, `purpose`, `granted_by`, `granted_at`, `expires_at`, and `metadata` (if supplied) never change, regardless of any subsequent action.

- **Invariant 2 — Membership exclusivity.** At every evaluation time, every consent record known to the store has exactly one semantic state in {Granted, Revoked, Expired}, defined in the State section against the record's `granted_at`, `revoked_at`, and `expires_at` fields. Stored state must equal semantic state at the moment the record is read or checked; an eager implementation maintains this equality continuously, a lazy implementation establishes it within the same operation that returns the result.

- **Invariant 3 — Terminal absorption.** Once a record transitions to Revoked or Expired, no action transitions it further. Neither terminal state has an outbound transition.

- **Invariant 4 — Revocation attribution is complete.** Every Revoked record carries `revoked_by` and `revocation_reason` each containing at least one non-whitespace character, and a `revoked_at` timestamp that is set. An anonymous revocation, a whitespace-only reason, or a missing revocation timestamp is a conformance failure — each defeats the audit trail that demonstrates the data subject exercised their right and that the system honored it.

- **Invariant 5 — Temporal ordering on revocation.** For every Revoked record, `revoked_at ≥ granted_at`. A consent cannot be documented as revoked before it was granted. The constraint applies to the value persisted in the record, regardless of whether `revoked_at` was caller-supplied or wall-clock-defaulted; the `revoke` Decision point enforces this against the resolved value before the transition is committed.

- **Invariant 6 — Expiry coherence.** A record with `expires_at` set must produce `expired` from `check` for any query whose `at_time` is ≥ `expires_at` and where no `revoked_at` ≤ `at_time` precedes the expiry (revocation before expiry produces `revoked`, not `expired` — the earlier terminal event wins). `expires_at` must be strictly in the future at grant time — a consent already expired at grant is meaningless and is rejected (`invalid-request`). The Expired stored-state transition must be written before the result of any `check` or `read` operation that evaluates the record past its `expires_at` (and not preceded by revocation) is returned to the caller — whether that write occurs eagerly (background job at `expires_at`) or lazily (at first evaluation). An implementation that returns a Granted-semantic result for a record whose semantic state at the queried time is Expired, without having written the corresponding stored-state transition, is non-conforming.

- **Invariant 7 — Grant attribution is complete.** Every consent record, in any state, carries `consent_id`, `subject_ref`, `purpose`, and `granted_by` each containing at least one non-whitespace character, and a `granted_at` timestamp that is set. Invariant 1 guarantees these fields are immutable; this invariant guarantees they are never blank or unset. An anonymous grant, a whitespace-only purpose, or a missing grant timestamp is a conformance failure — none answers the regulatory question of who agreed to what and when.

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

A covered entity receives an HHS (US Department of Health and Human Services — the federal agency that enforces HIPAA) inquiry about whether patient `patient-7712` consented to disclosure of PHI (Protected Health Information — individually identifiable health data covered by HIPAA) to a research partner under `hipaa:research:partner-univ-cardiology`. The entity queries `read({subject_ref: "patient-7712", purpose: "hipaa:research:partner-univ-cardiology"})`. The result shows a Granted record with `granted_at: 2025-09-01`, `expires_at: 2026-09-01`, and `granted_by: "clinical_consent_kiosk"`. The disclosure occurred on `2026-01-10` — within the consent window. `check(subject_ref: "patient-7712", purpose: "hipaa:research:partner-univ-cardiology", at_time: "2026-01-10T00:00:00Z")` → `granted`. The entity demonstrates valid HIPAA Authorization at the time of disclosure from the records alone.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Grant completeness check.** For a set of `consent_id`s known to have been issued, confirm that `read({consent_id: X})` returns each of them across all states. No issued `consent_id` may be absent from the store.

2. **Grant attribution check.** For every consent record in the store: confirm `consent_id`, `subject_ref`, `purpose`, and `granted_by` each contain at least one non-whitespace character, and confirm `granted_at` is set (Invariant 7). A record with a blank attribution string or a missing `granted_at` is a conformance failure.

3. **Revocation attribution check.** For every Revoked record: confirm `revoked_by` and `revocation_reason` each contain at least one non-whitespace character, confirm `revoked_at` is set, and confirm `revoked_at ≥ granted_at` (Invariant 5). A Revoked record with a blank attribution string, a missing `revoked_at`, or an inverted temporal ordering is a conformance failure.

4. **check reflects current state.** For a Granted record: call `check(subject_ref, purpose)` → `granted`. Revoke it. Call `check(subject_ref, purpose)` again → `revoked`. Re-grant. Call `check(subject_ref, purpose)` → `granted` (evaluating the new, most-recent grant). Confirms Invariant 3 (terminal absorption) and `check` most-recent-grant semantics.

5. **Expiry enforcement check.** Grant a consent with `expires_at` in the near future. Wait for expiry. Call `check(subject_ref, purpose)` → `expired`. Confirm the record is now in Expired state. Confirms Invariant 6.

6. **Terminal absorption check.** Attempt `revoke` against a known Revoked record → `rejected(already-revoked)`. Attempt `revoke` against a known Expired record → `rejected(already-expired)`. Confirm neither record's fields change after the attempted action.

7. **No-destruction check.** For a set of `consent_id`s including Revoked and Expired records, confirm that `read({consent_id: X})` returns each of them. Terminal records must remain in the store as audit evidence (Invariant 8).

---

## Edge cases and explicit non-goals

- **`grant` is not idempotent.** A consent collection surface that retries after a network timeout creates a duplicate consent record if the first call succeeded. Both records are valid. For at-most-once semantics on grant, compose with [Duplicate Prevention](../temporal/duplicate-prevention.md).

- **Multiple Granted consents for the same (subject, purpose).** The atom allows it — re-consent after a prior grant is still Active (before revocation or expiry) creates two Granted records. `check` evaluates the most recently granted one. This is the correct model: the data subject's most recent affirmative signal governs; prior grants are retained as history. A deployment that wants to enforce single-active-grant-per-(subject, purpose) must enforce uniqueness at the composing layer, not within this atom.

- **Revocation of one grant does not affect the lifecycle of other grants for the same (subject, purpose).** Each record has its own lifecycle — revoking one does not change the stored state of any other. However, which record `check` evaluates depends on `granted_at` ordering: revoking the most recently granted record causes `check` to return `revoked`, even if an older Granted record exists. Revoking an older record while a newer Granted record exists has no effect on `check`'s result. To restore a `granted` result after the most-recent record is revoked, a new `grant` call producing a new `consent_id` is required. The prior records remain in the store as history; the gate check reflects the most recently expressed intent.

- **`metadata` field.** The optional `metadata` parameter at `grant` carries caller-supplied context: consent form version, signal type (`click`, `verbal`, `api`), jurisdiction, or language of the consent form presented. The atom stores it as an opaque payload; it does not interpret or validate it. Metadata is immutable after grant (Invariant 1). For regulated contexts requiring specific metadata fields — GDPR record-of-processing, HIPAA Authorization elements — the composing layer enforces required metadata content before calling `grant`.

- **Purpose vocabulary.** The atom does not define what purposes are valid. `purpose` is an opaque string; `marketing:email` and `42` are equally valid to the atom. Purpose taxonomy governance — what scopes exist, how they compose, which imply which — is a deployment concern. Fine-grained purpose hierarchies (e.g., `research:anonymized` implying `analytics:aggregate`) are composing-layer concerns.

- **Consent withdrawal propagation.** When a data subject revokes consent, downstream systems holding data processed under that consent may need to act — delete derived data, cease ongoing processing, notify third parties. That propagation is out of scope for this atom. The atom records the revocation; the [Consent & Preference Management composition (C2)](../../compositions/consent-preference-management.md) wires the propagation. The atom is the single source of truth for whether consent exists; it is not the orchestrator of what happens when it is withdrawn.

- **GDPR lawful bases other than consent.** GDPR Article 6 names six lawful bases for processing personal data; consent (Article 6(1)(a)) is one of them. Legitimate interest, contract necessity, and legal obligation are others. This atom models only consent as a lawful basis — it does not model all GDPR Article 6 bases. A system relying on `legitimate_interest` as its lawful basis does not use this atom for that basis; it may use this atom for other purposes where consent is the chosen basis.

- **Access control.** Who may grant consent on a data subject's behalf, who may revoke it, and who may read consent records is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In regulated contexts, proxy consent (consent granted by a guardian or authorized representative on behalf of a data subject) requires specific authorization controls not modeled here.

- **Consent for minors.** Jurisdictions vary on the age of consent for data processing (GDPR sets 16, with member-state option to lower to 13; COPPA sets 13 in the US). Parental or guardian consent for data subjects below the threshold is a composing concern — it requires a Party Identity or guardian-relationship record to establish the proxy relationship. The atom records the grant faithfully; the composing layer establishes that the granting actor has the authority to consent on the subject's behalf.

- **Clock semantics.** `granted_at` defaults to the receiving node's wall clock. `expires_at`, if supplied, must be strictly in the future at grant time. `revoked_at` defaults to the receiving node's wall clock; must not be in the future and must be ≥ `granted_at`. Back-dated `revoked_at` values are accepted — documenting a revocation recognized or communicated at an earlier time is valid. Clock skew, timezone normalization, and monotonicity are deployment concerns.

- **Expiry implementation.** The atom does not mandate whether Expired state transitions are written eagerly or lazily, but the write must occur atomically within the same operation that first evaluates the record past its `expires_at` (and not preceded by revocation), before the result is returned. An implementation that writes Expired eagerly (a background job at `expires_at`) is conforming; one that writes lazily must ensure the state write completes before the `check` or `read` response is returned to the caller. Either way, semantic state and stored state must agree at the moment a result is returned to a caller. An implementation that returns a Granted-semantic result for a record whose semantic state at the queried time is Expired is non-conforming.

- **Concurrency.** Two systems concurrently calling `revoke` on the same `consent_id` must be serialized. The first succeeds and writes the Revoked transition; the second receives `already-revoked`. Two readers (or one reader and one writer) concurrently triggering lazy expiry for the same record must serialize the Expired stored-state write so it occurs at most once — both observe the same post-write state. Concurrent `grant` calls for the same (`subject_ref`, `purpose`) are not a race: each produces an independent record with a distinct `consent_id` (the atom does not enforce uniqueness across the pair; Behavior bullet *"`grant` is not idempotent"*). Implementations must serialize state transitions on a given `consent_id`.

---

## Composition notes

Consent is the data subject's authorization primitive — the complement to Permissions (which governs internal actor authorization) and the legal basis record that processing systems check before acting on personal data:

- **[Permissions](./permissions.md)** — composing peer, not substitute. Permissions governs what an internal actor may do; Consent governs what the system may do to the data subject's data. Both may be required for the same action.
- **[Actor Identity](./actor-identity.md)** — `granted_by` and `revoked_by` are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors. In regulated contexts (HIPAA, 21 CFR (Code of Federal Regulations) Part 11), consent collection and revocation are electronic records requiring verifiable authorship.
- **[Audit Trail](../../compositions/audit-trail.md)** — every `grant` and `revoke` event is an auditable action; Audit Trail provides the tamper-evident, attributed, retention-governed record of every consent lifecycle event.
- **[Retention Window](./retention-window.md)** — consent records must themselves be retained for regulatory proof periods (GDPR: "as long as necessary"; HIPAA: six years from grant or last effective date). The retention clock on consent records is a composing obligation.
- **[Tamper Evidence](./tamper-evidence.md)** — seals consent records against post-hoc modification. Court-admissible and regulator-admissible consent records require cryptographic integrity guarantees beyond this atom's spec-level immutability.
- **[Legal Hold](./legal-hold.md)** — a consent record under active litigation (e.g., a class-action data subject dispute) may be subject to a legal hold overriding its retention window.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for at-most-once semantics on consent grant under retry conditions.
- **[Consent & Preference Management with Revocation Propagation](../../compositions/consent-preference-management.md)** (C2, `grounded` 2026-06-04) — Consent + Permissions + Audit Trail (substrate, → Event Log + Actor Identity + Retention Window + Tamper Evidence) + a distinct consent-record Retention Window placement, wired to gate processing on consent (`processing_permitted`) and propagate revocation downstream: every `withdraw_consent` records, atomically with the revoke, the complete set of downstream processing scopes the consent governed. This composition is the home of the propagation this atom deliberately excludes.
- **Forthcoming:** Data Subject Rights Fulfillment (C6) — Consent records are the primary artifact answered by a DSAR right-of-access request.

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
- **ICH E6 Good Clinical Practice §4.8** — the International Council for Harmonisation's E6 guideline; informed consent requirements for clinical trial subjects, including documentation, right of withdrawal, and retention of consent records. The consent record lifecycle (grant, revoke, retain) is the Part 4.8 compliance mechanism.
- **Children's Online Privacy Protection Act (COPPA)** — verifiable parental consent required for data collection from children under 13. Proxy consent (guardian granting on behalf of minor subject) is a composing concern; the atom records the grant faithfully.
- **ePrivacy Directive (Cookie Law)** — consent required for non-essential cookies and tracking. Web consent banners produce `grant` calls; user withdrawal produces `revoke` calls. The consent record is the ePrivacy audit artifact.

---

## Status

`grounded` (formal-layer vote **reconsidered 2026-06-03 to NO — formal-not-warranted**; the aggressive-bar YES was downgraded on a second pass — earlier-terminal-event-wins (revoke vs expiry) is precedence fixed by insertion order in the append-only record, resolvable from the records alone, with terminal absorption already structural. See Lineage §Formal-layer vote. Cleared `grounded (English) — formal layer pending`.) — foundation round (Pass 1 + 2 + 3 author-led), and two AI-conducted adversarial rounds complete: Refinement round 1 (Sonnet, batched with Legal Hold and Soft Delete) and Refinement round 2 (Opus single-atom, Torvalds X2 posture). All nine GRID (the nine-node structural-completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof) nodes resolved; all concerns conceptually independent; all surfaced adversarial gaps closed in-pattern or named as explicit out-of-scope.

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

**Refinement round 1 — AI-conducted adversarial round (Sonnet, batched with Legal Hold and Soft Delete).** Surfaced no findings beyond those already closed in the foundation passes. Recorded as a clean round for reproducibility per the methodology requirement that AI rounds be named and dated; the batched-attention caveat motivated the subsequent single-atom Opus round documented below.

**Refinement round 2 — AI-conducted adversarial round (Opus single-atom, Torvalds X2 posture) — 2026-05-13.** Reviewer: Claude Opus, low-patience adversarial posture, full pass-question set from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) applied, no recourse to prior rationales. Sixteen findings surfaced, all closed in-pattern. The pass exposed three classes of defect the cooperative rounds and the batched Sonnet round missed: (a) a semantic gap in `check`'s point-in-time logic that broke the regulator audit use case the spec itself uses as a worked example; (b) an internal contradiction in Invariant 2 between stored and semantic state that the lazy-expiry policy made unavoidable; and (c) terminological and categorization drift shared with legal-hold's pre-fix state.

- *`check` ignored `at_time` for state evaluation, only honoring it for expiry.* The action accepted past, present, and future `at_time` and was framed as a point-in-time query, but the algorithm returned the most-recent record's *current* stored state for the Revoked branch — a consent revoked at any point after `at_time` would falsely return `revoked` for queries about earlier processing. The HIPAA Authorization review scenario in the atom's own *Regulated adversarial scenarios* relied on point-in-time correctness; it worked only by accident, because the example happened to involve no intervening revocation. Fixed: `check` action description, `check` Decision point, and the corresponding Behavior bullet rewritten. The algorithm now selects the record with the latest `granted_at` ≤ `at_time` and evaluates that record's fields against `at_time` (not current time): `revoked_at` ≤ `at_time` → `revoked`; `expires_at` ≤ `at_time` → `expired`; otherwise `granted`. A consent revoked or expired after `at_time` does not change the result for a query whose `at_time` precedes that event. This is the semantics regulator audits actually require.

- *Invariant 2 conflated stored state with semantic state.* The invariant asserted that every record is in exactly one of {Granted, Revoked, Expired} "at all times," but lazy-expiry implementations have a window in which a record's stored state is Granted while its semantic state is Expired. Invariant 2 was self-contradictory with Invariant 6 (which permits lazy writes). Fixed: State section now defines "semantic state" (derived from the record's fields evaluated against a point in time) and "stored state" (the persisted `state` field) explicitly. Invariant 2 rewritten to assert semantic state and require stored state to equal semantic state at the moment of any read or check.

- *"Non-empty" applied to timestamp fields.* Invariants 4 and 7 listed `revoked_at` and `granted_at` among "non-empty" fields. Timestamps are not strings; "non-empty" is a string predicate. Generation acceptance checks 2 and 3 carried the same defect. Fixed: invariants and acceptance checks split by field type — strings require "at least one non-whitespace character"; timestamps require "set."

- *"Non-empty" inconsistent with the Decision-point validation rule.* Invariants 4 and 7 used "non-empty"; action signatures and Decision points required "at least one non-whitespace character." A whitespace-only string is non-empty by ordinary meaning; an implementer reading the invariants alone would have accepted whitespace-only attribution. Fixed: invariants now use the explicit phrase, matching the rest of the spec.

- *`revoke` Decision point used the outdated two-clause phrasing.* The Decision point said *"non-empty and non-whitespace-only,"* while the action signature said *"at least one non-whitespace character."* Same content, divergent wording. Fixed: Decision point rewritten to the single-clause form.

- *`revoke` Decision point silent on malformed `consent_id`.* A null, empty, or whitespace-only `consent_id` parameter would have fallen into `not-known` (no record has that id), telling the caller the wrong thing. Fixed: `revoke` action signature and Decision point check `consent_id` syntactic validity first; malformed → `invalid-request` with priority over the existence check. Rejection priority list updated.

- *`revoke` Decision point did not enforce `revoked_at ≥ granted_at` against wall-clock-defaulted values.* Same defect class as legal-hold finding #1: the check was qualified "if supplied," leaving a wall-clock-defaulted `revoked_at` on a clock-skewed node free to violate Invariant 5. Fixed: the bound applies to the resolved `revoked_at` regardless of how it was derived. Invariant 5 statement extended to name the enforcement point.

- *`read` Decision point ambiguous on null/empty filter parameters.* The original wording — *"a syntactically invalid `consent_id` (non-null, non-empty)"* — left a reader unable to tell whether null or empty filter values were rejected or accepted as degenerate filters. Fixed: `read` action and Decision point now state that null, empty, or whitespace-only filter values on `consent_id`, `subject_ref`, `purpose`, or `granted_by` are `invalid-query`.

- *`read` unspecified on unknown filter keys.* The spec listed supported filter axes but did not say what happened if a caller passed an unknown axis. Fixed: unknown keys are `invalid-query`; strict over silent, since silent-ignore would return a result set inconsistent with caller intent.

- *`read` time-range-on-absent-field rule was limited to one combination.* The spec covered `state: Granted` + `revoked_at` filter (empty result) but not the parallel cases (`state: Expired` + `revoked_at`; `expires_at` filter on records granted without an expiry). Fixed: rule generalized — a time-range filter on a field implicitly excludes records that do not carry that field; `state` + time-range combinations on absent fields return empty sequences by the same rule.

- *"Supplied" semantics undefined for optional parameters.* `expires_at?`, `metadata?`, `revoked_at?`, and `at_time?` defaulted "if not supplied," but "supplied" was undefined — absent, null, empty all plausible. Fixed: a definition statement added before the action list, parallel to legal-hold.

- *`metadata` parameter had no validation rules.* The action signature accepted `metadata?` but neither the action description nor the Decision point said anything about it. Different implementers would resolve null vs. empty vs. structured-vs-blob differently. Fixed: action description and Decision point state that `metadata` is an opaque value the atom does not parse or validate; null, missing, and empty are equivalent to "not supplied"; structural/content rules belong in the composing layer.

- *Status mis-categorized as `unresolved`.* Per [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md), patterns that have completed human refinement but not the AI round declare `partially resolved`; `unresolved` is the label for "nothing done." Fixed: with this Opus round complete and all findings closed, Status advances to `grounded — 2026-05-13`.

- *AI adversarial round (Sonnet) not recorded in Lineage notes.* The methodology requires AI rounds be recorded with model identification for reproducibility. The Sonnet round was named only in Status. Fixed: Refinement round 1 entry added above, recording the Sonnet round and naming the batched-attention caveat.

- *No Concurrency edge case.* Legal-hold carries a Concurrency edge case naming the concurrent-`release` race; consent's parallel scenario was unaddressed, leaving the concurrent-`revoke` race and the lazy-expiry write race unspecified. Fixed: Concurrency edge case added covering concurrent `revoke` (serialize; first succeeds, second receives `already-revoked`), concurrent lazy-expiry writes (serialize so the Expired write occurs at most once), and concurrent `grant` for the same (subject, purpose) (no race — independent records by design).

- *Intent claim "recoverable from the records alone" overstated without naming Tamper Evidence.* The Intent paragraph asserted that the full consent history is "recoverable from the records alone" without qualifying that cryptographic protection against post-hoc modification is provided by Tamper Evidence composition. The Edge case *"Tamper Evidence"* conceded the same point. Fixed: Intent paragraph rewritten to claim that the history is carried in the records and immutable by specification, and to name Tamper Evidence as the composition that adds cryptographic protection for court-admissible and regulator-admissible evidence.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 6 (earlier terminal event wins — revoke-before-expiry yields `revoked`) and Invariant 5 (revoked_at ≥ granted_at) are ordering-across-terminal-events claims. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) §Formal models — The formal-layer vote.

**Formal-layer vote — reconsidered 2026-06-03: NO (formal-not-warranted); pattern restored to `grounded`.** On a second pass the aggressive-bar YES was downgraded. Invariant 6 (earlier-terminal-event-wins) resolves the revoke-vs-expiry contest by *insertion order in the append-only record* — whichever terminal event was recorded first is the binding one, and the records carry that order directly; there is no hidden interleaving whose outcome prose cannot state, because the resolution rule *is* "read which terminal event came first." Invariant 5 (`revoked_at ≥ granted_at`) is an ordering among fields set across two actions on one record, records-checkable. Terminal absorption (a revoked or expired consent admits no further transition) is a structural guarantee already carried in prose. The reconsideration follows the *minimum-formalism principle*: a precedence the records make directly observable does not need a model to confirm it. (Original YES retained above for the decision audit trail.)
