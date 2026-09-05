---
title: Consent
parent: Atomic Concepts
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


## Summary

Consent records a person's agreement to have their personal data used for a specific, named purpose — for example, "marketing emails" or "behavioral analytics." Each record captures when the agreement was given, who collected it, and what it covers. It also captures how the agreement ends: either the person withdraws it (revocation) or it runs out (expiry, if a time limit was set when it was granted). Every record is in one of three states — [Granted], [Revoked], or [Expired]. The two ending states are permanent: once consent ends, you cannot revive it; the person has to give fresh agreement instead. The records are kept unchanged forever. When consent is withdrawn, that withdrawal is logged as its own dated, attributed event rather than by editing the original, so the proof that earlier use was permitted is never lost — withdrawing ends future use, it does not rewrite the past. The key operation is a check: before doing anything that depends on consent, a system asks "is there valid consent for this person and purpose?" The check can ask about a past date (for an audit) or a future date (to confirm consent will still hold when, say, a campaign goes out next month). This is the mechanism behind privacy-law consent management, patient authorizations, and cookie opt-ins.

---

## Intent

Every system that processes personal data must answer a question before it acts: does it have the data subject's agreement to do what it is about to do? In many regulatory regimes — GDPR (EU General Data Protection Regulation), CCPA/CPRA (California Consumer Privacy Act / Privacy Rights Act), HIPAA (US Health Insurance Portability and Accountability Act) — that agreement is a formal legal prerequisite for certain categories of processing, not merely a courtesy. The record of that agreement, its scope, its duration, and its eventual termination is both an operational control and a legal artifact.

Consent is the specification of that record. A data subject (the individual whose personal data is held — the rights-bearer under privacy law) grants consent for a named processing purpose (a declared, specific reason for which personal data may be used): `marketing:email`, `analytics:behavioral`, `research:anonymized`. The grant is the moment of agreement — timestamped, attributed to the granting actor (the system or agent that received the data subject's affirmative signal), and scoped to a stated purpose. The grant is not a blanket authorization; it covers one purpose scope per record. If a system needs consent for three purposes, it holds three consent records.

The grant may terminate in two ways: the data subject revokes it, or it expires because it was time-bounded at grant. Either way, the terminal state is permanent — a revoked or expired grant is not reactivated. A data subject who revokes consent and later wishes to re-consent creates a new grant; the prior record remains as evidence of the prior agreement and its termination. This is not a limitation — it is the evidentiary structure that regulatory regimes require: the full history of when consent was given, for what, and when it ended is carried in the records themselves, immutable by specification. Cryptographic protection of those records against post-hoc modification — the bar for court-admissible and regulator-admissible evidence — is added by composition with [Tamper Evidence](./tamper-evidence.md) (an atom that seals records with a cryptographic hash so any alteration is detectable); this atom does not provide it alone.

The atom is structurally distinct from [Permissions](./permissions.md) in a load-bearing way: Permissions governs what an internal actor may do within the system — it is an authorization surface pointing inward. Consent governs what the system may do *to or with* a data subject's data — it is an authorization surface pointing outward, held by the data subject, not the system operator. The two atoms are composing peers, not alternatives. A system may have both: a data subject's Consent for `marketing:email` (outward authorization) and an internal actor's Permission to trigger the email campaign (inward authorization). Consent is not a replacement for access control; it is the data subject's contribution to the authorization decision.

The atom also models revocation (withdrawal — revocation of previously given consent) as a first-class action, not as a state flag. Revocation is an event with its own timestamp, its own actor attribution, and its own stated reason. GDPR Article 7(3) requires that withdrawal of consent be as easy to exercise as grant — the `revoke` action is the specification of that requirement. Expiry is not an action; it is a condition. When a Granted consent's `expires_at` timestamp is reached, the consent becomes Expired. The transition is passive — no actor triggers it, no action is required. The `check` action evaluates the current state including expiry; the composing system does not need to poll for expiry separately.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the consent record set), its own actions (`grant`, `revoke`, `check`, `read`), and its own invariants (grant immutability, three-state exclusivity, terminal absorption, revocation non-retroactivity, expiry, attribution completeness, store durability). Composing patterns add propagation on revocation, cross-record purpose enforcement, and integration with access control surfaces.

---

## Structure

### Store instance model

The Consent atom operates against a named store instance. A [Store Name] identifies the instance; multiple instances coexist in real systems — one per jurisdiction, product line, or data controller entity. [Consent Id] values are unique within a store instance; uniqueness across instances is a composing concept. [Subject Ref] and [Purpose] together do not form a unique key — a subject may hold multiple [Granted] consents for the same purpose (for example, re-consent after expiry with a fresh grant while the prior grant's record is retained). [Consent Id] is the only unique identity anchor. Calls implicitly target a single routed instance; instance selection is handled at the deployment-routing layer.

### Identity model

Each consent record has an opaque, immutable, system-generated [Consent Id] — assigned on [Grant], never reused, never reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic [Read] ordering and for [Check] tiebreaking. The id is the record's identity; the subject reference, purpose, granting actor, and timestamps are properties of the record, not its identity.

[Subject Ref] is an opaque reference to the data subject whose consent is recorded. Set on [Grant], immutable. The atom does not validate that the data subject exists in any other system; [Subject Ref] is the caller's responsibility.

[Purpose] is an opaque string naming the processing purpose scope for which consent is granted (e.g., `marketing:email`, `analytics:behavioral`, `hipaa:treatment`). Set on [Grant], immutable. The atom does not interpret purpose semantics — purposes are caller-declared vocabulary. Two consent records with the same [Subject Ref] and [Purpose] are distinct records with distinct [Consent Id]s; the atom does not enforce uniqueness across (subject, purpose) pairs.

[Granted By] is an opaque reference to the actor who recorded the data subject's affirmative agreement — typically the system or integration that received the consent signal. Set on [Grant], immutable. It is the attribution anchor for the consent event; empty or whitespace-only values are rejected.

[Expires At] is an optional timestamp. If supplied, the consent expires at that instant — the [Check] action returns `expired` for any query at or after [Expires At]. [Expires At] must be in the future at grant time. If not supplied, the consent does not expire by time; only explicit [Revoke] terminates it.

### Inputs

- [Grant] calls from consent collection surfaces — web forms, mobile apps, verbal consent capture integrations, API clients — each carrying a [Subject Ref], a [Purpose] scope, a granting actor ([Granted By]), an optional [Expires At] timestamp, and optional [Metadata].
- [Revoke] calls documenting the data subject's withdrawal of consent, carrying the [Consent Id], the revoking actor ([Revoked By]), a required [Reason], and an optional explicit [Revoked At] timestamp.
- [Check] queries from processing systems evaluating whether a subject holds valid consent for a [Purpose] at a given moment — the operational gate check before each consent-dependent action.
- [Read] queries from compliance dashboards, DSAR (Data Subject Access Request — a request by an individual to see, correct, or erase the personal data an organization holds about them) workflows, audit processes, and regulatory reporting tools.

### Actions

For optional parameters across [Grant], [Revoke], and [Check], "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies. [Metadata] is an opaque value the atom does not parse or validate — the same "supplied" semantics apply, and if not supplied (or if null, missing, or empty), no [Metadata] is stored on the record. Deployment-specific content rules on metadata (required form-version fields, signal-type enumerations) are enforced by the composing layer before [Grant] is called.

- [Grant] — (Projected contract: `grant(subject_ref, purpose, granted_by, expires_at?, metadata?) → consent_id | rejected(invalid-request | storage-failure)`) — record a data subject's affirmative agreement to processing for the named purpose. The clock is **not a signature parameter**: the execution contract injects the clock reading [Now] (the pipeline's `clock_t`) at the I/O seam — read once by the pipeline, not inside the transition, not trusted from the caller (see the Logic-confinement note in Decision points). Assigns a fresh [Consent Id], records [Subject Ref], [Purpose], [Granted By], [Granted At] = [Now], and [Expires At] and [Metadata] if supplied. The consent enters [Granted] state. [Subject Ref], [Purpose], and [Granted By] must each contain at least one non-whitespace character; [Expires At], if supplied, must be strictly in the future relative to the injected [Now] — any violation is [Invalid Request]. The [Expires At]-in-the-future check is a pure guard over the supplied [Expires At] and the injected [Now] ([Expires At] > [Now]) that rejects without writing. [Metadata], if supplied, is stored as an opaque value; no validation is performed against its content. [Storage Failure] if the store write fails after all preconditions pass; no [Consent Id] is issued and no record enters the store.

- [Revoke] — (Projected contract: `revoke(consent_id, revoked_by, reason, revoked_at?) → revoked | rejected(invalid-request | not-known | already-revoked | already-expired | storage-failure)`) — document the data subject's withdrawal of consent and transition the record to [Revoked]. The clock is **not a signature parameter**: the execution contract injects the clock reading [Now] (the pipeline's `clock_t`) at the I/O seam (see the Logic-confinement note in Decision points). The [Consent Id] parameter must itself contain at least one non-whitespace character ([Invalid Request]); a null, empty, or whitespace-only [Consent Id] is malformed and rejected before any existence check is performed. Records [Revoked By], [Revocation Reason], and [Revoked At] (the injected [Now] if not supplied; must not be in the future relative to the injected [Now] and must be ≥ [Granted At]); all are immutable after the transition. The resolved [Revoked At] — whether caller-supplied or defaulted to the injected [Now] — must be ≥ [Granted At]; a value less than [Granted At] is [Invalid Request] regardless of how it was derived (this enforces Invariant 5 against clock-skew artifacts as well as caller-supplied backdated values). The terminal-state checks ([Already Revoked], [Already Expired]) and the temporal checks are pure guards over the stored record and the injected [Now] that reject without writing. [Revoked By] and [Reason] must each contain at least one non-whitespace character ([Invalid Request]). [Storage Failure] leaves the record in [Granted] state; the caller must retry. Rejection priority: malformed [Consent Id] ([Invalid Request]) → [Not Known] → [Already Revoked] → [Already Expired] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- [Check] — (Projected contract: `check(subject_ref, purpose, at_time?) → granted | revoked | expired | not-known`) — evaluate the consent state for a subject and purpose **as of [At Time]**. [At Time] is the explicit evaluating-clock input; if not supplied it defaults to the injected clock reading [Now] (the pipeline's `clock_t`, read at the I/O seam — never a clock read inside the transition). It may be past, present, or future. [Check] is a **pure point-in-time query** — it reads the stored records and the supplied/injected clock, derives the semantic state, and **never writes and never rejects**. It must answer the question the caller asked: *what was the consent state at the moment [At Time]?* — not *what is the current stored state of the most-recent record?* A regulator auditing whether processing on a past date was lawful, and a system pre-flight-checking whether consent will be valid for a future delivery, depend on the same semantics. (Expiry is *derived* here from [Expires At] vs [At Time]; see the Logic-confinement note and the residual marking on the stored [State] field.)

  The algorithm: among all consent records for (subject, purpose), find the record R with the latest [Granted At] ≤ [At Time]. If no such record exists (every record for the pair was granted after [At Time], or no record exists for the pair at all), return `not-known`. Otherwise, evaluate R at [At Time]:

  - If R's [Revoked At] is set and [Revoked At] ≤ [At Time] → return `revoked`.
  - Else if R's [Expires At] is set and [Expires At] ≤ [At Time] → return `expired`.
  - Else → return `granted`.

  When multiple records for the pair share the same latest [Granted At] ≤ [At Time], the one with the highest [Consent Id] in lexicographic byte-order is selected as a deterministic tiebreaker. A consent revoked or expired *after* [At Time] does not change the result of a query for [At Time]; the records remain a faithful point-in-time history. [Check] never rejects; it returns one of the four first-class outcome tags.

- [Read] — (Projected contract: `read(query) → ordered_sequence_of_consents | rejected(invalid-query)`) — return consent records matching the [Query], ordered by [Granted At] ascending, then by [Consent Id] ascending in lexicographic byte-order as a stable tiebreaker. Implementations must assign [Consent Id] values in a format where string byte-order sort produces a total order (e.g., ULID — Universally Unique Lexicographically Sortable Identifier, UUID v7 — version 7 of the Universally Unique Identifier, which is time-ordered, or zero-padded integer string). The supported filter axes are exactly: [Consent Id], [Subject Ref], [Purpose], [Granted By], [State], and time ranges on [Granted At], [Revoked At], or [Expires At]. Any combination of supported axes is valid. A query supplying only a [Consent Id] returns at most one record. A well-formed query matching no records returns an empty sequence, not a rejection. A query with no filters returns every consent record in the store.

  **Time-range filters on absent fields.** A time-range filter on a field implicitly excludes records that do not carry that field. [Revoked At] is present only on [Revoked] records; a [Revoked At] filter implicitly excludes [Granted] and [Expired] records, regardless of whether a [State] filter is also supplied. [Expires At] is present only on records granted with an expiry; an [Expires At] filter implicitly excludes records that were granted without an expiry. A [State] filter combined with a time-range filter on a field absent from records of that state returns an empty sequence by the same rule — for example, `{state: Granted, revoked_at: {after: X}}` is well-formed and returns an empty sequence.

  **Malformed-query rules ([Invalid Query]):** a [Consent Id], [Subject Ref], [Purpose], or [Granted By] filter value that is null, empty, or whitespace-only is [Invalid Query] (the filter axes exist; the values are malformed). A [State] filter value that is not one of {[Granted], [Revoked], [Expired]} is [Invalid Query]. A time range with end before start is [Invalid Query]. A query carrying an unrecognized filter key — any key outside the supported axes named above — is [Invalid Query]; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

### Outputs

- For [Grant]: a fresh [Consent Id], or a rejection.
- For [Revoke]: the outcome token `revoked`, or a rejection.
- For [Check]: one of `granted | revoked | expired | not-known` — always a first-class result, never a rejection.
- For [Read]: a (possibly empty) ordered sequence of consent records. Fields present on every record (any state): [Consent Id], [Subject Ref], [Purpose], [Granted By], [Granted At], [State]. Optional fields set at grant (independent of state): [Expires At] (if supplied at [Grant]; absent otherwise) and [Metadata] (if supplied at [Grant]; absent otherwise) — both immutable thereafter. State-specific fields: [Revoked By], [Revocation Reason], and [Revoked At] are present on [Revoked] records only. A [Revoked] record carries all grant fields (including [Expires At] and [Metadata] if they were supplied) and all revocation fields simultaneously.

### State

The atom distinguishes two notions of state that the spec uses load-bearingly:

- **Semantic state** — the state implied by the record's fields evaluated against a point in time (default: [Now]). [Granted] if [Revoked At] is not set and [Expires At] (if set) is in the future; [Revoked] if [Revoked At] is set and ≤ the evaluation time; [Expired] if [Expires At] is set and ≤ the evaluation time and [Revoked At] is not set or is after the evaluation time. Semantic state is what [Check] returns and what an external evaluator reads from the records.
- **Stored state** — the persisted [State] field on the record. Eager implementations write the state transition ([Granted] → [Expired]) at the moment [Expires At] elapses, so stored state equals current semantic state. Lazy implementations write the transition on first evaluation past [Expires At]; until then, stored state may lag current semantic state. Both strategies are conforming as long as every [Check] and [Read] returns the semantic state of the record at the requested time.

> **Clearly-marked residual (execution/render-time refactor — 2026-06-21).** The *authoritative* expiry determination is **derived** at read time: [Check] and [Read] both compute the semantic state from [Expires At] (and [Revoked At]) against the evaluating clock, and [Check] is a pure query that never writes (there is no `expire` action — *"Expiry is not an action; it is a condition,"* per Intent). The stored [State] field's Expired value is therefore a **materialized cache of the derived semantic state, not the authority** — it is written for query convenience, and Invariant 6 requires it to equal the semantic state at the moment any result is returned. This stored Expired write is the **residual** of this atom against the render-time target (which would carry *no* stored Expired write at all, deriving the projection on every read as Invitation does). It is *clearly marked here* rather than removed: removing the stored [State] field is a structural change beyond this light refactor, the eager/lazy stored-state design was deliberately introduced (Final Critique 4, to resolve the semantic-vs-stored contradiction), and because the cache is required to equal the derived value at read time it cannot serve as a flag that lags the clock in any conforming implementation. A future re-pass may evaluate collapsing the stored [State] field to a pure read-time projection (mirroring Invitation's `effective_status`); that is recorded as an open design point, not done here.

Each consent record is in exactly one semantic state at any given evaluation time:

- **[Granted]** — the data subject's agreement is in effect for the named purpose. The record carries [Consent Id], [Subject Ref], [Purpose], [Granted By], [Granted At], and [Expires At] (if supplied). May be revoked (transitioning to [Revoked]) or evaluated via [Check].
- **[Revoked]** — the data subject has withdrawn consent. Carries [Revoked By], [Revocation Reason], and [Revoked At] (all immutable from the moment [Revoke] completes), plus all grant fields. Terminal; no further transitions.
- **[Expired]** — the consent's [Expires At] has elapsed and no revocation occurred at or before the elapse. Stored-state transition to [Expired] is written by the implementation per the eager or lazy strategy named above; semantic state changes the moment [Expires At] passes, independent of when the write occurs. Terminal; no further transitions. A subject who wishes to re-consent for the same purpose after expiry requires a new [Grant] call producing a new [Consent Id].

Valid transitions — writes only; every committed transition stamps its timestamp from the injected [Now], and no transition reads a wall clock internally. Expiry is listed for contrast: it is passive, fires no action, and writes only the materialized [State] cache (eager or lazy):

| action | from | to | guard | stamps | result |
| --- | --- | --- | --- | --- | --- |
| [Grant] | *(no record)* | **[Granted]** | [Expires At] (if supplied) > [Now] | fresh [Consent Id]; [Granted At] = [Now]; [Expires At], [Metadata] if supplied | the new [Consent Id] |
| [Revoke] | [Granted] | **[Revoked]** | resolved [Revoked At] not future ∧ ≥ [Granted At] | [Revoked By]; [Revocation Reason]; [Revoked At] (= [Now] if unsupplied) | `revoked` |
| *expiry (passive — no action)* | [Granted] | **[Expired]** | [Expires At] ≤ evaluating clock ([At Time]/[Now]) ∧ no [Revoked At] ≤ that time | derived; stored [State] cache written eager/lazy (Invariant 6) | *surfaced* via [Check]/[Read] |

No other transitions exist. Neither [Revoked] nor [Expired] can be re-activated; a new consent need requires a new [Grant]. Both terminal states are absorbing (Invariant 3) — a [Revoke] against either is rejected ([Already Revoked] / [Already Expired]), writing nothing. When revocation and expiry both apply to the same record, the earlier terminal event wins (revoke before expiry yields `revoked`, per Invariant 6).

### Flow

1. **Consent collection.** A user onboarding to a health app is presented with a consent form for `analytics:behavioral`. They affirm. The app calls `grant(subject_ref: "user-4491", purpose: "analytics:behavioral", granted_by: "onboarding_service", expires_at: "2027-05-13T00:00:00Z")` → `consent_id: "cns-0001"`. [Granted At] is stamped from the seam-injected [Now] (here `2025-05-13T09:00:00Z`); the [Expires At] > [Now] guard passes. The record enters [Granted].
2. **Processing gate check.** Before emitting a behavioral analytics event, the analytics pipeline calls `check(subject_ref: "user-4491", purpose: "analytics:behavioral")` → `granted`. Processing proceeds.
3. **Revocation.** User submits a "withdraw consent" request via the app's privacy settings. The privacy service calls `revoke("cns-0001", revoked_by: "privacy_service", reason: "User-initiated withdrawal via privacy settings — 2026-05-13")` → `revoked`. [Revoked At] is stamped from the seam-injected [Now] (here `2026-05-13T14:30:00Z`, ≥ [Granted At], not in the future). The record transitions to [Revoked].
4. **Post-revocation gate check.** The analytics pipeline checks again: `check(subject_ref: "user-4491", purpose: "analytics:behavioral")` → `revoked`. Processing is suppressed.
5. **Re-consent.** Six months later the user re-enables analytics. The app calls `grant(subject_ref: "user-4491", purpose: "analytics:behavioral", granted_by: "onboarding_service", expires_at: "2028-11-13T00:00:00Z")` → `consent_id: "cns-0088"`. A new [Granted] record exists; cns-0001 remains [Revoked] as an audit record. [Check] now returns `granted` — it evaluates the most recently granted record (cns-0088).
6. **DSAR audit.** A data subject access request queries `read({subject_ref: "user-4491"})` — returns both cns-0001 ([Revoked]) and cns-0088 ([Granted]), with full attribution on each. The complete consent history is recoverable from the store.

### Decision points

**Logic confinement (clock and id).** The clock and the id are **pipeline-injected at the I/O seam, not signature parameters**, and are never produced inside a transition. [Now] (`clock_t`) is read once by the pipeline and supplied to the transitions at the seam — it is *not* threaded through the action signatures ([Grant] and [Revoke] do not carry a [Now] parameter); [Check]'s explicit [At Time] is a caller-supplied query input, and when omitted it defaults to the seam-injected [Now]. The [Consent Id] is the injected `id_t` (system-generated at the seam, never reused). [Now] is consumed for two clearly separated purposes: stamping immutable timestamps on a write ([Granted At], [Revoked At] — execution time), and evaluating pure guards/derivations that **write nothing** — the [Expires At] > [Now] guard on [Grant], the temporal guards on [Revoke], and the expiry **derivation** in [Check]/[Read] ([Expires At] ≤ [At Time] ⇒ `expired`). No transition reads a wall clock internally. The one residual that is *not* a pure read-time derivation is the stored [State] field's Expired write — a materialized cache of the derived semantic state, clearly marked in the State section; it is constrained to equal the derived value at read time, so it never functions as a clock-lagging flag.

- **At [Grant]** — [Subject Ref], [Purpose], and [Granted By] must each contain at least one non-whitespace character; [Expires At], if supplied, must be strictly in the future relative to the injected [Now] (a pure guard, [Expires At] > [Now], that writes nothing on failure). Any violation is [Invalid Request]. [Granted At] = [Now] is stamped from the injected clock. [Storage Failure] if the store write fails; no [Consent Id] is issued, no record enters the store.

- **At [Revoke]** — the [Consent Id] parameter is checked first: if null, empty, or whitespace-only, the call is [Invalid Request] (the caller passed garbage, not a reference to a missing record). If [Consent Id] is well-formed, the store is consulted: [Not Known] if no record with this id exists; [Already Revoked] if the record is in [Revoked] state; [Already Expired] if the record is in [Expired] state (semantic state — Invariant 2; this is the derived semantic state evaluated against the injected [Now]). These terminal-state checks are pure guards over the stored record and the injected [Now] that write nothing on rejection. If none of the above, attribution and temporal checks apply: [Revoked By] and [Reason] must each contain at least one non-whitespace character ([Invalid Request]); the resolved [Revoked At] — caller-supplied or defaulted to the injected [Now] — must not be in the future relative to the injected [Now] (the future-bound applies only when caller-supplied, because the injected-[Now] default is "now" by construction) and must be ≥ the record's [Granted At]. The ≥ [Granted At] bound applies to the resolved [Revoked At] regardless of how it was derived; this enforces Invariant 5 against clock-skew artifacts as well as caller-supplied backdated values. A violation is [Invalid Request]. [Storage Failure] leaves the record in [Granted] state; the caller must retry. Rejection priority: malformed [Consent Id] ([Invalid Request]) → [Not Known] → [Already Revoked] → [Already Expired] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- **At [Check]** — [At Time], if supplied, may be any timestamp — past, present, or future; if not supplied it defaults to the injected [Now]. [Check] is a pure point-in-time query that accepts arbitrary [At Time] values and never writes. The action evaluates the record state as of [At Time] per the algorithm in the action description: find the record with the latest [Granted At] ≤ [At Time] for (subject, purpose); evaluate it at [At Time] using [Revoked At] and [Expires At] against [At Time] (expiry is *derived* here, not read from a stored flag), not against current time. When multiple records share the same latest [Granted At] ≤ [At Time], the record with the highest [Consent Id] in lexicographic byte-order is selected as a deterministic tiebreaker. The action never rejects; it returns one of four first-class outcome tags.

- **At [Read]** — every supplied filter value must be well-formed for its axis. A [Consent Id], [Subject Ref], [Purpose], or [Granted By] filter value that is null, empty, or whitespace-only is [Invalid Query]. A [State] filter value not in {[Granted], [Revoked], [Expired]} is [Invalid Query]. A time range with end before start is [Invalid Query]. An unrecognized filter key — any key outside the supported axes — is [Invalid Query]; the spec rejects rather than ignores unknown keys. Time-range filters on fields absent from a state's records (e.g., [Revoked At] on [Granted] records, [Expires At] on records granted without an expiry) implicitly return empty sequences for those records. A well-formed query matching no records returns an empty sequence.

### Behavior

- **Consent records are durable on success.** Once [Grant] returns a [Consent Id], the record is in the store and will appear in subsequent reads and [Check] evaluations.
- **[Grant] is not idempotent.** Two [Grant] calls for the same [Subject Ref] and [Purpose] create two independent consent records with distinct [Consent Id]s. Both are valid until individually revoked or expired.
- **Revocation is not retroactive.** Revoking a consent does not erase the record of prior consent or invalidate processing that occurred while the consent was [Granted]. It terminates the basis for *future* processing. The revocation record is the evidence that the data subject exercised their right; the grant record is the evidence that prior processing was lawful.
- **[Check] evaluates the consent state as of [At Time].** The result reflects the records' fields evaluated against [At Time], not the records' current stored state. Among all records for (subject, purpose), the record with the latest [Granted At] ≤ [At Time] is selected; ties on [Granted At] are broken by highest [Consent Id] in lexicographic byte-order. The selected record is then evaluated at [At Time]: [Revoked At] ≤ [At Time] produces `revoked`; otherwise [Expires At] ≤ [At Time] produces `expired`; otherwise `granted`. A consent revoked or expired *after* [At Time] does not change the result for a query whose [At Time] is before that event — the records are a faithful point-in-time history. A new [Grant] after a prior record's terminal event is the only way to restore a `granted` result at a [Granted At] after that event.
- **Expiry is passive.** There is no `expire` action. A record's semantic state is [Expired] whenever [Expires At] is set and ≤ the evaluation time (with no [Revoked At] ≤ that same time); its stored [State] field transitions to [Expired] when the system first evaluates or persists the expiry. Implementations may write the [Expired] state eagerly (at the moment [Expires At] elapses) or lazily (on first read or check after elapsing); both are conforming as long as [Check] returns `expired` for any query whose [At Time] is ≥ [Expires At] (and not preceded by revocation), and [Read] reflects [Expired] stored state for any record evaluated past its [Expires At].
- **[Revoked] and [Expired] records are retained.** Terminal records are never removed from the store. They are the evidence of prior consent and its lawful termination — deleting them would destroy the proof of data subject intent.
- **The atom does not enforce processing suppression.** Whether a system actually stops processing a data subject's data after revocation is enforced at the composing layer. The atom records that consent has been withdrawn; the composing system checks [Check] before each consent-dependent action.
- **Reads are repeatable; the consent store is monotonic with respect to records.** [Grant] adds records; [Revoke] and expiry transition state. An unfiltered read at `t2 > t1` returns every record visible at `t1` plus any granted in between, with updated state on records that transitioned.

### Feedback

- After [Grant] — a new [Granted] record exists; [Consent Id], [Subject Ref], [Purpose], [Granted By], [Granted At], and [Expires At] (if supplied) are set and immutable.
- After [Revoke] — the record is now [Revoked]; [Revoked By], [Revocation Reason], and [Revoked At] are set and immutable. All grant fields are unchanged.
- After [Check] — a first-class outcome tag: `granted`, `revoked`, `expired`, or `not-known`. No state change occurs.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Grant immutability.** After a successful [Grant], the fields [Consent Id], [Subject Ref], [Purpose], [Granted By], [Granted At], [Expires At], and [Metadata] (if supplied) never change, regardless of any subsequent action.

- **Invariant 2 — Membership exclusivity.** At every evaluation time, every consent record known to the store has exactly one semantic state in {[Granted], [Revoked], [Expired]}, defined in the State section against the record's [Granted At], [Revoked At], and [Expires At] fields. Stored state must equal semantic state at the moment the record is read or checked; an eager implementation maintains this equality continuously, a lazy implementation establishes it within the same operation that returns the result.

- **Invariant 3 — Terminal absorption.** Once a record transitions to [Revoked] or [Expired], no action transitions it further. Neither terminal state has an outbound transition.

- **Invariant 4 — Revocation attribution is complete.** Every [Revoked] record carries [Revoked By] and [Revocation Reason] each containing at least one non-whitespace character, and a [Revoked At] timestamp that is set. An anonymous revocation, a whitespace-only reason, or a missing revocation timestamp is a conformance failure — each defeats the audit trail that demonstrates the data subject exercised their right and that the system honored it.

- **Invariant 5 — Temporal ordering on revocation.** For every [Revoked] record, [Revoked At] ≥ [Granted At]. A consent cannot be documented as revoked before it was granted. The constraint applies to the value persisted in the record, regardless of whether [Revoked At] was caller-supplied or defaulted to the injected [Now]; the [Revoke] Decision point enforces this (as a pure guard over the resolved value and the injected [Now]) before the transition is committed.

- **Invariant 6 — Expiry coherence.** A record with [Expires At] set must produce `expired` from [Check] for any query whose [At Time] is ≥ [Expires At] and where no [Revoked At] ≤ [At Time] precedes the expiry (revocation before expiry produces `revoked`, not `expired` — the earlier terminal event wins). (The requirement that [Expires At] be strictly in the future at grant time is a [Grant] precondition — a pure [Expires At] > [Now] guard, stated in the [Grant] action and [Grant] Decision point — not part of this expiry-coherence invariant.) The [Expired] stored-state transition must be written before the result of any [Check] or [Read] operation that evaluates the record past its [Expires At] (and not preceded by revocation) is returned to the caller — whether that write occurs eagerly (background job at [Expires At]) or lazily (at first evaluation). An implementation that returns a [Granted]-semantic result for a record whose semantic state at the queried time is [Expired], without having written the corresponding stored-state transition, is non-conforming.

- **Invariant 7 — Grant attribution is complete.** Every consent record, in any state, carries [Consent Id], [Subject Ref], [Purpose], and [Granted By] each containing at least one non-whitespace character, and a [Granted At] timestamp that is set. Invariant 1 guarantees these fields are immutable; this invariant guarantees they are never blank or unset. An anonymous grant, a whitespace-only purpose, or a missing grant timestamp is a conformance failure — none answers the regulatory question of who agreed to what and when.

- **Invariant 8 — Consent store durability.** No consent record is removed from the store. The total record count is monotonically non-decreasing. A [Consent Id] returned by a successful [Grant] is durably persisted; a [Storage Failure] rejection guarantees no partial record was written. Terminal records are retained as audit evidence of prior consent and its lawful termination.

- **Invariant 9 — Revocation non-retroactivity.** Transitioning a record to [Revoked] does not alter the [Granted At] timestamp, the [Purpose], or any other grant field. The record of prior consent is preserved unchanged. Revocation terminates future reliance; it does not rewrite history.

- **Invariant 10 — Point-in-time faithfulness.** For any `check(subject_ref, purpose, at_time)`, the selected record is the one with the greatest [Granted At] ≤ [At Time] among all records for the (subject, purpose) pair, with ties on [Granted At] broken by the greatest [Consent Id] in lexicographic byte-order; only that one record is evaluated against [At Time] (its [Revoked At]/[Expires At] compared to [At Time], never to current time), and the four-way result (`granted | revoked | expired | not-known`) is invariant under any record written with [Granted At], [Revoked At], or [Expires At] timestamps strictly after [At Time]. A consent granted, revoked, or expired after [At Time] — including a fresh grant, a later revocation of the selected record, or the selected record's own later expiry — never changes the answer to a query about [At Time]; the records are a faithful point-in-time history. This is records-checkable: re-running the same [Check] after any strictly-later write must return the identical result. (The tiebreak direction here — *greatest* [Consent Id] — is deliberately opposite to [Read]'s *ascending* [Consent Id] ordering, because [Check] must select the **latest** record among [Granted At]-ties while [Read] enumerates records oldest-first; the two operations break the same tie toward opposite ends on purpose.)

---

## Examples

### Happy path — grant, check, revoke, re-consent

See Flow section. The full arc is walked there: initial grant, affirmative gate check, user-initiated revocation, suppressed gate check, re-consent producing a new record, and DSAR audit recovering the complete history.

### Rejection path — revoke an already-revoked record

A retry after a network timeout: `revoke("cns-0001", revoked_by: "privacy_service", reason: "retry")` → `rejected(already-revoked)`. The [Already Revoked] guard (a pure check over the stored record) rejects without writing; the record is unchanged. The caller detects the rejection and suppresses the retry.

### Rejection path — grant with empty purpose

`grant(subject_ref: "user-8823", purpose: "  ", granted_by: "consent_ui")` → `rejected(invalid-request)`. Whitespace-only purpose is treated as empty. No record is created.

### Rejection path — `expires_at` in the past

`grant(subject_ref: "user-9001", purpose: "marketing:sms", granted_by: "consent_ui", expires_at: "2020-01-01T00:00:00Z")` → `rejected(invalid-request)`. The [Expires At] > [Now] guard fails against the seam-injected [Now]. A consent expiring in the past is already expired at the moment of grant — not a meaningful consent.

### check — expired consent

User granted consent for `analytics:behavioral` expiring `2026-05-01T00:00:00Z`. On `2026-05-13`, the analytics pipeline calls `check(subject_ref: "user-4491", purpose: "analytics:behavioral")` → `expired`. Processing is suppressed.

### check — future `at_time` pre-flight

Before queuing a 30-day marketing campaign, the system calls `check(subject_ref: "user-4491", purpose: "marketing:email", at_time: "2026-06-13T00:00:00Z")` → `granted` (consent expires `2027-01-01`). The campaign is scheduled with confidence that consent will be valid at delivery time.

---

## Regulated adversarial scenarios

### Regulator audit — GDPR Article 7 validity challenge

A data protection authority investigates whether a data controller had valid consent before processing personal data for `analytics:behavioral` purposes on a given date. The controller queries `read({subject_ref: "user-4491", purpose: "analytics:behavioral"})` and retrieves all consent records for that subject and purpose. The authority evaluates: (a) was a [Granted] record in effect on the processing date? — confirmed by [Granted At] and the absence of [Revoked At] or [Expires At] before that date; (b) was consent freely given, specific, informed, and unambiguous — [Granted By] names the collection point; the [Purpose] field names the scope; the [Metadata] field (if used) carries the consent form version or signal type. (c) Is the grant record immutable — confirmed by Invariants 1 and 7. The authority confirms that consent was valid for the period in question; the controller does not need to produce any witness testimony or developer narration.

### Disputed revocation — data subject claims non-compliance

A data subject submits a complaint claiming that the controller continued sending marketing emails after they withdrew consent. The controller queries `read({subject_ref: "user-4491", purpose: "marketing:email"})`. The result shows: `cns-0001` [Granted] on `2025-03-01`; `cns-0001` [Revoked] on `2026-01-15` (`revoked_by: "privacy_portal"`, `revocation_reason: "User withdrawal via preferences page"`). The controller can show exactly when revocation was recorded and by which system. If marketing emails were sent after `2026-01-15`, that is a processing system failure — the Consent atom faithfully records the withdrawal; whether the processing system checked [Check] before sending is the composing layer's conformance question. The atom's records answer the when-was-consent-withdrawn question precisely.

### Cross-purpose consent audit — HIPAA Authorization review

A covered entity receives an HHS (US Department of Health and Human Services — the federal agency that enforces HIPAA) inquiry about whether patient `patient-7712` consented to disclosure of PHI (Protected Health Information — individually identifiable health data covered by HIPAA) to a research partner under `hipaa:research:partner-univ-cardiology`. The entity queries `read({subject_ref: "patient-7712", purpose: "hipaa:research:partner-univ-cardiology"})`. The result shows a [Granted] record with `granted_at: 2025-09-01`, `expires_at: 2026-09-01`, and `granted_by: "clinical_consent_kiosk"`. The disclosure occurred on `2026-01-10` — within the consent window. `check(subject_ref: "patient-7712", purpose: "hipaa:research:partner-univ-cardiology", at_time: "2026-01-10T00:00:00Z")` → `granted`. The entity demonstrates valid HIPAA Authorization at the time of disclosure from the records alone.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Grant completeness check.** For a set of [Consent Id]s known to have been issued, confirm that `read({consent_id: X})` returns each of them across all states. No issued [Consent Id] may be absent from the store.

2. **Grant attribution check.** For every consent record in the store: confirm [Consent Id], [Subject Ref], [Purpose], and [Granted By] each contain at least one non-whitespace character, and confirm [Granted At] is set (Invariant 7). A record with a blank attribution string or a missing [Granted At] is a conformance failure.

3. **Revocation attribution check.** For every [Revoked] record: confirm [Revoked By] and [Revocation Reason] each contain at least one non-whitespace character, confirm [Revoked At] is set, and confirm [Revoked At] ≥ [Granted At] (Invariant 5). A [Revoked] record with a blank attribution string, a missing [Revoked At], or an inverted temporal ordering is a conformance failure.

4. **[Check] reflects current state.** For a [Granted] record: call `check(subject_ref, purpose)` → `granted`. Revoke it. Call `check(subject_ref, purpose)` again → `revoked`. Re-grant. Call `check(subject_ref, purpose)` → `granted` (evaluating the new, most-recent grant). Confirms Invariant 3 (terminal absorption) and [Check] most-recent-grant semantics.

5. **Expiry enforcement check.** Grant a consent with [Expires At] in the near future. Before expiry, call `check(subject_ref, purpose, at_time)` with an [At Time] strictly before [Expires At] → `granted`. At or after expiry, call `check(subject_ref, purpose)` (or `check(subject_ref, purpose, at_time)` with [At Time] ≥ [Expires At]) → `expired`. The conformance assertion is on the [Check] **return value** (`granted` before, `expired` at/after [Expires At]), which derives the semantic state from [Expires At] vs [At Time]; it is **not** an assertion that a stored [Expired] [State] field has been written — that stored field is a materialized cache of the derived value (see State, Invariant 6), conforming only by equalling the derived result at read time, so the records-checkable property is the derived [Check] result, not the cache. Confirms Invariant 6.

6. **Terminal absorption check.** Attempt `revoke` against a known [Revoked] record → `rejected(already-revoked)`. Attempt `revoke` against a known [Expired] record → `rejected(already-expired)`. Confirm neither record's fields change after the attempted action.

7. **No-destruction check.** For a set of [Consent Id]s including [Revoked] and [Expired] records, confirm that `read({consent_id: X})` returns each of them. Terminal records must remain in the store as audit evidence (Invariant 8).

---

## Edge cases and explicit non-goals

- **[Grant] is not idempotent.** A consent collection surface that retries after a network timeout creates a duplicate consent record if the first call succeeded. Both records are valid. For at-most-once semantics on grant, compose with [Duplicate Prevention](./duplicate-prevention.md).

- **Multiple [Granted] consents for the same (subject, purpose).** The atom allows it — re-consent after a prior grant is still active (before revocation or expiry) creates two [Granted] records. [Check] evaluates the most recently granted one. This is the correct model: the data subject's most recent affirmative signal governs; prior grants are retained as history. A deployment that wants to enforce single-active-grant-per-(subject, purpose) must enforce uniqueness at the composing layer, not within this atom.

- **Revocation of one grant does not affect the lifecycle of other grants for the same (subject, purpose).** Each record has its own lifecycle — revoking one does not change the stored state of any other. However, which record [Check] evaluates depends on [Granted At] ordering: revoking the most recently granted record causes [Check] to return `revoked`, even if an older [Granted] record exists. Revoking an older record while a newer [Granted] record exists has no effect on [Check]'s result. To restore a `granted` result after the most-recent record is revoked, a new [Grant] call producing a new [Consent Id] is required. The prior records remain in the store as history; the gate check reflects the most recently expressed intent.

- **[Metadata] field.** The optional [Metadata] parameter at [Grant] carries caller-supplied context: consent form version, signal type (`click`, `verbal`, `api`), jurisdiction, or language of the consent form presented. The atom stores it as an opaque payload; it does not interpret or validate it. [Metadata] is immutable after grant (Invariant 1). For regulated contexts requiring specific metadata fields — GDPR record-of-processing, HIPAA Authorization elements — the composing layer enforces required metadata content before calling [Grant].

- **Purpose vocabulary.** The atom does not define what purposes are valid. [Purpose] is an opaque string; `marketing:email` and `42` are equally valid to the atom. Purpose taxonomy governance — what scopes exist, how they compose, which imply which — is handled at the deployment layer. Fine-grained purpose hierarchies (e.g., `research:anonymized` implying `analytics:aggregate`) are composing-layer concepts.

- **Consent withdrawal propagation.** When a data subject revokes consent, downstream systems holding data processed under that consent may need to act — delete derived data, cease ongoing processing, notify third parties. That propagation is out of scope for this atom. The atom records the revocation; the [Propagate Consent Revocation Downstream composition](../compositions/propagate-consent-revocation-downstream.md) wires the propagation. The atom is the single source of truth for whether consent exists; it is not the orchestrator of what happens when it is withdrawn.

- **GDPR lawful bases other than consent.** GDPR Article 6 names six lawful bases for processing personal data; consent (Article 6(1)(a)) is one of them. Legitimate interest, contract necessity, and legal obligation are others. This atom models only consent as a lawful basis — it does not model all GDPR Article 6 bases. A system relying on `legitimate_interest` as its lawful basis does not use this atom for that basis; it may use this atom for other purposes where consent is the chosen basis.

- **Access control.** Who may [Grant] consent on a data subject's behalf, who may [Revoke] it, and who may [Read] consent records is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In regulated contexts, proxy consent (consent granted by a guardian or authorized representative on behalf of a data subject) requires specific authorization controls not modeled here.

- **Consent for minors.** Jurisdictions vary on the age of consent for data processing (GDPR sets 16, with member-state option to lower to 13; COPPA sets 13 in the US). Parental or guardian consent for data subjects below the threshold is handled at the composing layer — it requires a Party Identity or guardian-relationship record to establish the proxy relationship. The atom records the grant faithfully; the composing layer establishes that the granting actor has the authority to consent on the subject's behalf.

- **Clock semantics.** The clock enters at the I/O seam as the injected [Now] (the pipeline's `clock_t`) — pipeline-injected at the seam, *not* a signature parameter of [Grant] or [Revoke]; [Check]'s explicit [At Time] is a caller-supplied query input that defaults to the seam-injected [Now] when omitted. No transition reads a wall clock internally. [Granted At] = [Now] is stamped from the injected clock. [Expires At], if supplied, must be strictly in the future relative to the injected [Now] at grant time (pure guard). [Revoked At] defaults to the injected [Now]; must not be in the future relative to the injected [Now] and must be ≥ [Granted At]. Back-dated [Revoked At] values are accepted — documenting a revocation recognized or communicated at an earlier time is valid. The expiry *determination* is derived against the evaluating clock ([At Time] in [Check], the injected [Now] otherwise), not stamped; the stored [State] [Expired] write is the clearly-marked residual cache (see State). Clock skew, timezone normalization, and monotonicity are handled at the deployment layer.

- **Expiry implementation.** The atom does not mandate whether [Expired] state transitions are written eagerly or lazily, but the write must occur atomically within the same operation that first evaluates the record past its [Expires At] (and not preceded by revocation), before the result is returned. An implementation that writes [Expired] eagerly (a background job at [Expires At]) is conforming; one that writes lazily must ensure the state write completes before the [Check] or [Read] response is returned to the caller. Either way, semantic state and stored state must agree at the moment a result is returned to a caller. An implementation that returns a [Granted]-semantic result for a record whose semantic state at the queried time is [Expired] is non-conforming.

- **Concurrency.** Two systems concurrently calling [Revoke] on the same [Consent Id] must be serialized. The first succeeds and writes the [Revoked] transition; the second receives `already-revoked`. Two readers (or one reader and one writer) concurrently triggering lazy expiry for the same record must serialize the [Expired] stored-state write so it occurs at most once — both observe the same post-write state. Concurrent [Grant] calls for the same ([Subject Ref], [Purpose]) are not a race: each produces an independent record with a distinct [Consent Id] (the atom does not enforce uniqueness across the pair; Behavior bullet *"[Grant] is not idempotent"*). Implementations must serialize state transitions on a given [Consent Id].

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Grant

The behavior a consent collection surface invokes to record a data subject's affirmative agreement to a named [Purpose]. It assigns a fresh [Consent Id], stamps [Granted At] from the injected [Now], records [Subject Ref], [Purpose], [Granted By], and [Expires At] / [Metadata] if supplied, and returns the [Consent Id] (or a rejection). The consent enters [Granted].

Kind: Operation

#### Revoke

The behavior that documents a data subject's withdrawal of consent, transitioning a [Granted] record to [Revoked]. It records [Revoked By], [Revocation Reason], and [Revoked At], all immutable thereafter. A [Revoked] or [Expired] record cannot be revoked ([Already Revoked] / [Already Expired]) — terminal absorption (Invariant 3).

Kind: Operation

#### Check

The pure point-in-time query that evaluates the consent state for a (subject, [Purpose]) as of [At Time], returning one of `granted | revoked | expired | not-known`. It selects the record with the greatest [Granted At] ≤ [At Time], evaluates that record's [Revoked At] / [Expires At] against [At Time], and never writes and never rejects (Invariant 10).

Kind: Operation

#### Read

The read-only behavior that returns the consent records matching a [Query], ordered by [Granted At] ascending then [Consent Id] ascending. It changes nothing. Filters by [Consent Id], [Subject Ref], [Purpose], [Granted By], [State], or time range are combinable; a malformed one is rejected [Invalid Query].

Kind: Operation

#### Consent Id

The opaque, immutable, system-generated identity of a consent record, assigned on [Grant], never reused or reassigned within the store instance. A non-empty string sortable in lexicographic byte-order — required for deterministic [Read] ordering and [Check] tiebreaking. The subject, purpose, actor, and timestamps are properties of the record, not its identity.

Kind:     Field
Field of: the consent record
Projects: consent_id

#### Subject Ref

The opaque reference to the data subject whose consent is recorded. Set on [Grant], immutable. The atom does not validate that the subject exists elsewhere; it is the caller's responsibility.

Kind:     Field
Field of: the consent record
Projects: subject_ref

#### Purpose

The opaque string naming the processing-purpose scope the consent covers (e.g., `marketing:email`). Set on [Grant], immutable, caller-declared vocabulary the atom does not interpret. Two records with the same [Subject Ref] and [Purpose] are distinct records.

Kind:     Field
Field of: the consent record
Projects: purpose

#### Granted By

The opaque reference to the actor who recorded the data subject's affirmative agreement — the attribution anchor for the consent event. Set on [Grant], immutable; empty or whitespace-only is rejected.

Kind:     Field
Field of: the consent record
Projects: granted_by

#### Granted At

The timestamp the consent was granted, stamped from the injected [Now] at [Grant]. Set once, immutable (Invariant 1). The lower temporal bound for [Revoked At] (Invariant 5) and the selection key for [Check] / ordering key for [Read].

Kind:     Field
Field of: the consent record
Projects: granted_at

#### Expires At

The optional timestamp at which the consent expires. Set on [Grant] (must be strictly in the future relative to the injected [Now]); immutable. When [Expires At] ≤ the evaluating clock and no revocation precedes it, the semantic state is [Expired]. Absent ⇒ the consent never expires by time.

Kind:     Field
Field of: the consent record
Projects: expires_at

#### Metadata

The optional opaque payload supplied at [Grant] — consent form version, signal type, jurisdiction. Stored as-is, never parsed or validated; immutable after grant (Invariant 1). Deployment-specific content rules belong to the composing layer.

Kind:     Field
Field of: the consent record
Projects: metadata

#### Revoked By

The opaque reference to the actor who recorded the withdrawal. Set at [Revoke], immutable thereafter; present on [Revoked] records only. Empty or whitespace-only is rejected [Invalid Request].

Kind:     Field
Field of: the consent record
Projects: revoked_by

#### Revocation Reason

The required, non-empty reason for the withdrawal — written from the [Reason] parameter. Set at [Revoke], immutable thereafter; present on [Revoked] records only. A blank reason defeats the audit trail and is rejected.

Kind:     Field
Field of: the consent record
Projects: revocation_reason

#### Revoked At

The timestamp the consent was revoked — supplied or defaulted to the injected [Now]. Must not be future and must be ≥ [Granted At] (Invariant 5). Set at [Revoke], immutable; present on [Revoked] records only.

Kind:     Field
Field of: the consent record
Projects: revoked_at

#### State

The consent record's lifecycle state — [Granted], [Revoked], or [Expired]. The stored [State] field is a materialized cache of the derived semantic state, constrained to equal it at read time (Invariants 2 and 6) — not the authority for expiry, which is derived.

Kind:     Field
Field of: the consent record
Projects: state

#### Store Name

The identifier of the store instance a consent record belongs to. Multiple instances coexist; [Consent Id]s are unique within an instance. No action accepts it as a parameter — instance selection is handled at the deployment-routing layer.

Kind:     Field
Field of: the store instance
Projects: store_name

#### Now

The current clock reading the pipeline consumes — the injected `clock_t`, supplied at the I/O seam, never read inside a transition and never a signature parameter. It stamps the immutable write timestamps ([Granted At], [Revoked At]) and drives the pure expiry guard / derivation (no write); [At Time] defaults to it when omitted.

Kind:         Parameter
Parameter of: Grant
Projects:     now

#### At Time

The point-in-time the caller is asking [Check] about — a caller-supplied query input, past, present, or future. Not the injected clock (it defaults to the seam-injected [Now] when omitted) and not stored. [Check] evaluates the selected record's fields against [At Time].

Kind:         Parameter
Parameter of: Check
Projects:     at_time

#### Reason

The required, non-empty reason string [Revoke] consumes — written into [Revocation Reason]. Not stored under this name; an empty or whitespace-only value is rejected [Invalid Request].

Kind:         Parameter
Parameter of: Revoke
Projects:     reason

#### Query

The selection [Read] consumes — a filter over [Consent Id], [Subject Ref], [Purpose], [Granted By], [State], and/or a time range. Supplied per call, not stored; a malformed one is rejected [Invalid Query].

Kind:         Parameter
Parameter of: Read
Projects:     query

#### Granted

The state of a consent in effect for its [Purpose]. A record enters [Granted] on [Grant]; it may be revoked or evaluated, and its semantic state becomes [Expired] passively when [Expires At] elapses.

Kind:      Member
Member of: the consent state
Role:      Outcome

#### Revoked

The terminal state of a consent the data subject has withdrawn. Carries [Revoked By], [Revocation Reason], and [Revoked At]; retained as audit evidence, no further transition (Invariant 3).

Kind:      Member
Member of: the consent state
Role:      Outcome

#### Expired

The terminal state of a consent whose [Expires At] has elapsed with no prior revocation. Derived from [Expires At] vs the evaluating clock; the stored [State] cache is written eager/lazy. Retained, no further transition (Invariant 3).

Kind:      Member
Member of: the consent state
Role:      Outcome

#### Not Known

The outcome [Check] returns — and the refusal [Revoke] returns — when no record exists for the queried (subject, [Purpose]) pair, or when the named [Consent Id] references no record in this store instance. A first-class [Check] result, never an error there.

Kind:      Member
Member of: the action outcome
Role:      Outcome
Projects:  not-known

#### Invalid Request

The refusal [Grant] or [Revoke] returns when request fields fail — an empty or whitespace-only [Subject Ref], [Purpose], [Granted By], [Revoked By], or [Reason]; an [Expires At] not in the future at [Grant]; a malformed [Consent Id]; or a [Revoked At] that is future or before [Granted At].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Storage Failure

The refusal any writing action returns when a durable write fails after preconditions pass. All-or-none: no partial record is observable, and the prior state is unchanged (Invariant 8).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Already Revoked

The refusal [Revoke] returns when the target is already [Revoked] — terminal absorption (Invariant 3); a pure guard that writes nothing.

Kind:      Member
Member of: the Revoke rejection
Role:      Outcome
Projects:  already-revoked

#### Already Expired

The refusal [Revoke] returns when the target is already [Expired] — terminal absorption (Invariant 3); a pure guard, evaluated as the derived semantic state, that writes nothing.

Kind:      Member
Member of: the Revoke rejection
Role:      Outcome
Projects:  already-expired

#### Invalid Query

The refusal [Read] returns when query parameters are malformed — a null/empty/whitespace filter value, a [State] value outside {[Granted], [Revoked], [Expired]}, a time range with end before start, or an unrecognized filter key.

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Grant]: #grant
[Revoke]: #revoke
[Check]: #check
[Read]: #read
[Consent Id]: #consent-id
[Subject Ref]: #subject-ref
[Purpose]: #purpose
[Granted By]: #granted-by
[Granted At]: #granted-at
[Expires At]: #expires-at
[Metadata]: #metadata
[Revoked By]: #revoked-by
[Revocation Reason]: #revocation-reason
[Revoked At]: #revoked-at
[State]: #state
[Store Name]: #store-name
[Now]: #now
[At Time]: #at-time
[Reason]: #reason
[Query]: #query
[Granted]: #granted
[Revoked]: #revoked
[Expired]: #expired
[Not Known]: #not-known
[Invalid Request]: #invalid-request
[Storage Failure]: #storage-failure
[Already Revoked]: #already-revoked
[Already Expired]: #already-expired
[Invalid Query]: #invalid-query

---

## Composition notes

Consent is the data subject's authorization primitive — the complement to Permissions (which governs internal actor authorization) and the legal basis record that processing systems check before acting on personal data:

- **[Permissions](./permissions.md)** — composing peer, not substitute. Permissions governs what an internal actor may do; Consent governs what the system may do to the data subject's data. Both may be required for the same action.
- **[Actor Identity](./actor-identity.md)** — `granted_by` and `revoked_by` are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors. In regulated contexts (HIPAA, 21 CFR (Code of Federal Regulations) Part 11), consent collection and revocation are electronic records requiring verifiable authorship.
- **[Audit Trail](../compositions/audit-trail.md)** — every `grant` and `revoke` event is an auditable action; Audit Trail provides the tamper-evident, attributed, retention-governed record of every consent lifecycle event.
- **[Retention Window](./retention-window.md)** — consent records must themselves be retained for regulatory proof periods (GDPR: "as long as necessary"; HIPAA: six years from grant or last effective date). The retention clock on consent records is a composing obligation.
- **[Tamper Evidence](./tamper-evidence.md)** — seals consent records against post-hoc modification. Court-admissible and regulator-admissible consent records require cryptographic integrity guarantees beyond this atom's spec-level immutability.
- **[Legal Hold](./legal-hold.md)** — a consent record under active litigation (e.g., a class-action data subject dispute) may be subject to a legal hold overriding its retention window.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for at-most-once semantics on consent grant under retry conditions.
- **[Propagate Consent Revocation Downstream](../compositions/propagate-consent-revocation-downstream.md)** (Propagate Consent Revocation Downstream, `grounded` 2026-06-04) — Consent + Permissions + Audit Trail (substrate, → Event Log + Actor Identity + Retention Window + Tamper Evidence) + a distinct consent-record Retention Window placement, wired to gate processing on consent (`processing_permitted`) and propagate revocation downstream: every `withdraw_consent` records, atomically with the revoke, the complete set of downstream processing scopes the consent governed. This composition is the home of the propagation this atom deliberately excludes.
- **[Resolve a Person's Data Rights](../compositions/resolve-a-persons-data-rights.md)** — composes Consent as a **read-only authority oracle**: a DSAR erasure fulfillment calls `Consent.check` to make the Article 17(1)(b) determination (*was consent the basis, and is it still in force?*), mapping all four `check` outcomes (`granted` → a ground persists; `revoked`/`expired` → the consent basis is gone; `not-known` → a registry/Consent anomaly), and a right-of-access request answers in part from the consent records. Resolve a Person's Data Rights never grants, revokes, or expires a consent record — the read-only-oracle discipline is one of its emergent invariants.

---

## Standards references

- **GDPR Article 6(1)(a)** — consent as a lawful basis for processing personal data. A [Granted] consent record in effect at processing time is the legal basis documentation.
- **GDPR Article 7** — conditions for consent: must be freely given, specific, informed, and unambiguous; burden of proof on the controller (Invariant 7, Generation acceptance check 2); withdrawal must be as easy as giving (the [Revoke] action, same surface as [Grant]); withdrawal does not affect lawfulness of prior processing (Invariant 9, revocation non-retroactivity).
- **GDPR Article 17(1)(b)** — right to erasure applies when the data subject withdraws consent and there is no other lawful basis for processing. The [Revoke] action is the trigger; whether erasure follows is a composing-layer decision.
- **GDPR Article 30** — record of processing activities must include the purpose of processing and the legal basis. Consent records with [Purpose] and [Granted At] supply the Article 30 documentation surface.
- **CCPA / CPRA** — right to opt-out of sale or sharing of personal information; right to opt-in for sensitive personal information. The [Grant] and [Revoke] actions are the opt-in and opt-out mechanisms. CPRA extends consent requirements to sensitive personal information categories.
- **HIPAA §164.508 (Authorization)** — required elements for a valid authorization include: a description of the information to be used or disclosed ([Purpose]), the name of the person authorized to make the disclosure ([Granted By] + composing Actor Identity), an expiration date or event ([Expires At]), and the right to revoke ([Revoke] action). The consent record's fields map directly to the required Authorization elements.
- **HIPAA §164.522** — right of an individual to request restrictions on certain uses and disclosures of PHI. Consent records with granular [Purpose] scoping are the mechanism.
- **21 CFR Part 11** — electronic records and signatures in FDA-regulated contexts. Consent records for clinical trial participation are regulated records under Part 11; [Granted By] and [Revoked By] map to electronic signature requirements when composed with Actor Identity.
- **ICH E6 Good Clinical Practice §4.8** — the International Council for Harmonisation's E6 guideline; informed consent requirements for clinical trial subjects, including documentation, right of withdrawal, and retention of consent records. The consent record lifecycle (grant, revoke, retain) is the Part 4.8 compliance mechanism.
- **Children's Online Privacy Protection Act (COPPA)** — verifiable parental consent required for data collection from children under 13. Proxy consent (guardian granting on behalf of minor subject) is handled at the composing layer; the atom records the grant faithfully.
- **ePrivacy Directive (Cookie Law)** — consent required for non-essential cookies and tracking. Web consent banners produce [Grant] calls; user withdrawal produces [Revoke] calls. The consent record is the ePrivacy audit artifact.

---

## Status

`grounded on Final Critique 5 — 2026-06-23` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 5 — 2026-06-23
formal: not applicable — vote no 2026-06-03
last gate: 2026-06-23 — Final Critique 5, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/consent.md`.

- **2026-06-23 — Expiry is derived at `check`, with the stored `Expired` cache marked as a residual; `now` is not a signature parameter.** *Chose:* `check` evaluates expiry against the injected clock (or a caller-supplied `at_time?`, a query parameter, not the clock); the stored-Expired transition an implementation may write is a cache and is marked so. *Over:* threading `now` into `grant` / `revoke`, or treating stored `Expired` as the truth. *Because:* the execution contract injects the clock at the seam, and a stored flag that lags the clock is a cache, not a fact.
