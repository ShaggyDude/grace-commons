---
title: Selective Disclosure
parent: Atomic Concepts
has_toc: true
toc: true
---

# Selective Disclosure

<details open markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Selective Disclosure keeps a permanent, add-only record of every time someone's data was shared with anyone other than that person — answering the question regulators and individuals routinely ask: what was shared about this person, with whom, under what authority, and when?

The pattern does not do the sharing — it does not fetch, redact, or transmit data. Instead, right after a disclosure happens, the system calls it to log the subject, the recipient, the scope of what was shared, and the authority for sharing, which must be one of exactly three kinds: consent (the person agreed), legal hold (a legal process compelled it), or regulatory (a regulation required it).

Once written, a record can never be changed or deleted, and nothing is ever removed from the store — which is precisely what guarantees the sharing history is complete and cannot be quietly altered. The records can be queried by subject, recipient, authority type, or date, producing the disclosure accounting that privacy and securities regulations demand.

A few questions need other patterns to answer — whether a referenced consent was actually valid at the time, whether every disclosure was in fact logged, and whether a backdated timestamp is honest — and those boundaries are spelled out in the Generation acceptance section.

---

## Intent

Regulated systems that handle personal data, financial records, or protected health information are required to maintain a complete and durable account of every disclosure made — what data was shared, with whom, under what legal authority, and when. A GDPR (EU General Data Protection Regulation) supervisory authority conducting an Article 15 review asks what was disclosed to which recipients. An HHS OCR (Office for Civil Rights) inspector validating HIPAA (US Health Insurance Portability and Accountability Act) compliance asks for the accounting of disclosures required by §164.528. An SEC (Securities and Exchange Commission) examiner reviewing broker-dealer records asks for the disclosure trail that Rule 17a-4 mandates. The obligation across all three regimes is the same: the system must answer these questions from its records alone, without recourse to developer testimony, log reconstruction, or institutional memory.

Selective Disclosure is the accountability layer that makes those answers possible. When a disclosure occurs — when subject data is transmitted to a party other than the subject — the calling system records it: `record(subject_ref, recipient, scope, authority, ...)` produces a disclosure record. That record is the durable, immutable proof that the disclosure happened, was authorized, and was made in the declared scope. The atom does not perform the disclosure itself. It does not redact records, resolve what data falls within scope, route transmissions, or decide whether a disclosure is permitted. Those are the calling system's concepts to address. This atom is the layer that makes the calling system's decisions auditable.

The distinction between recording and performing is the atom's load-bearing EOS boundary. An atom that also performed disclosures — retrieving subject data, applying redaction logic, routing to recipients — would absorb concepts from storage layers, redaction engines, and notification systems. Each of those concepts has its own state, its own invariants, and its own composing pattern. Absorbing them here would destroy freestanding status and produce a spec that cannot be composed independently of the implementation technologies it would need to name. The atom specifies the accountability obligation; the implementation specifies the mechanics of disclosure delivery.

The atom is structurally distinct from four adjacent concepts, and the distinctions are load-bearing:

**Selective Disclosure vs. Audit Trail.** [Audit Trail](../compositions/audit-trail.md) is a general-purpose tamper-evident, attributed log of system actions — any action, any actor, any subject. It answers *what happened in this system?* Selective Disclosure is specific to one class of event: the disclosure of subject data to a party other than the subject. It answers *what was disclosed about this subject, to whom, under what authority?* The two are composing peers: a disclosure is a system event that Audit Trail would capture; the Selective Disclosure record is the structured, authority-bearing form that regulators require for disclosure accounting. Neither replaces the other. In regulated deployments, the Selective Disclosure record and the Audit Trail event coexist: the event log captures that an action occurred; the disclosure record carries the authority field that only disclosure accounting requires.

**Selective Disclosure vs. Consent.** The forthcoming Consent atom governs *authorization* — whether a data subject (the individual whose personal data is held — the rights-bearer under privacy law) has granted permission for a category of processing. Selective Disclosure records *that a disclosure occurred*, after the fact, whether authorized by Consent, by Legal Hold, or by regulation. Consent is a precondition check; Selective Disclosure is a post-disclosure accountability record. A system that checks Consent before disclosing and then records the disclosure in Selective Disclosure is using both atoms as intended: Consent answers *"may I?"* and Selective Disclosure records *"I did."* The authority field in a Selective Disclosure record may reference a Consent record id, but the atom does not import Consent's lifecycle semantics. The presence of a Consent id in `authority.reference` is an opaque pointer into the Consent store; validation that the Consent was valid at time of disclosure is the calling system's obligation.

**Selective Disclosure vs. Legal Hold.** [Legal Hold](./legal-hold.md) governs *compelled preservation* — records cannot be destroyed while a hold is Active. Selective Disclosure records *compelled disclosure* — when a legal process requires the system to share records with a third party (a regulator, a court, an investigation team), the disclosure of those records must itself be recorded. A Legal Hold id may appear as the authority under which a disclosure was made (`authority.type: legal-hold`), but Legal Hold and Selective Disclosure are addressing opposite obligations: Legal Hold prevents records from leaving the system under normal operation; Selective Disclosure records that records have left the system under authorized operation. Neither atom imports the other's semantics; both may be active simultaneously on the same subject's records.

**Selective Disclosure vs. Actor Identity.** [Actor Identity](./actor-identity.md) answers *who authorized an action* — it binds an actor to an action via a verifiable proof. Selective Disclosure answers *to whom was subject data disclosed* — it records the recipient of subject data, the scope of what was shared, and the legal authority for the transfer. Both atoms carry attribution fields (`recipient` in Selective Disclosure; `actor_ref` in Actor Identity), but they are different kinds of attribution. A disclosure to a regulator under a HIPAA mandate names the regulator as `recipient` in the Selective Disclosure record and may name the compliance officer who authorized the disclosure in a composing Actor Identity attestation. Neither atom replaces the other; disclosures in regulated systems require both the disclosure record (this atom) and the actor attestation (Actor Identity) for non-repudiation.

Cryptographic protection of disclosure records against post-hoc modification — the bar for court-admissible evidence and for SEC Rule 17a-4's non-erasable, non-rewritable standard — is added by composition with [Tamper Evidence](./tamper-evidence.md); this atom does not provide it alone.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the disclosure record set), its own actions (`record`, `read`), and its own invariants (record immutability, append-only durability, authority completeness, no-disclosure-unrecorded as an integration obligation). Composing patterns add authorization checks, tamper evidence, retention governance, and actor attribution.

---

## Structure

### Store instance model

The Selective Disclosure atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per organization, jurisdiction, or regulated business unit, depending on deployment topology. [Disclosure Id] values are unique within a store instance; uniqueness across instances is handled at the composing layer. The same [Subject Ref] may appear in many disclosure records within the same store instance — one per disclosure event involving that subject. Calls implicitly target a single routed instance; instance selection is handled at the deployment-routing layer, not defined by this atom.

### Identity model

Each disclosure record has an opaque, immutable [Disclosure Id]. The id is **the injected `id_t`** — supplied to [Record] at the I/O seam, fresh by construction, never read or generated inside the transition (mirroring the clock's pipeline-injected treatment; see the Logic-confinement note in Decision points). Because the seam supplies a fresh `id_t` per creation event, every successful [Record] call produces a fresh, never-reused, never-reassigned id at the action level. [Disclosure Id] must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic [Read] ordering. The id is the disclosure record's identity; the subject reference, recipient, scope, authority, and timestamp are properties of the record, not its identity.

[Subject Ref] is an opaque reference to the data subject whose data was disclosed. Set on [Record], immutable. The atom does not validate that the subject exists in any other system — [Subject Ref] is the caller's responsibility. Two disclosure records for the same subject have distinct [Disclosure Id]s; each is its own audit record.

[Recipient] is a non-empty string naming the party to whom the data was disclosed. Set on [Record], immutable. This is the entity that received the disclosed data — a regulator's identifier, a counterparty's name, a business unit's id, a research institution's reference. The atom does not interpret recipient semantics or validate that the recipient is a known party in any external system. Must contain at least one non-whitespace character.

[Scope] is a non-empty string naming what subset of the subject's data was disclosed. Set on [Record], immutable. The atom does not interpret scope semantics — it records the scope as declared by the calling system. Examples: `"medical-record:summary"`, `"financial:transaction-history:2023"`, `"personal-data:contact-fields"`. Must contain at least one non-whitespace character.

[Authority] is a structured field — a record with exactly two sub-fields — naming the legal or contractual basis under which the disclosure was made:

- [Authority Type] — one of exactly three named values: `consent`, `legal-hold`, or `regulatory`. No other values are valid.
- [Authority Reference] — an opaque string identifying the specific authority: a Consent record id for `type: consent`, a Legal Hold id for `type: legal-hold`, or a regulatory requirement citation for `type: regulatory` (for example, `"HIPAA §164.512(b) — public health reporting"` or `"GDPR Article 6(1)(c) — legal obligation"`). Must contain at least one non-whitespace character.

The three authority types cover the complete space of legitimate disclosure authorities: data-subject authorization (`consent`), legal compulsion (`legal-hold`), and regulatory mandate (`regulatory`). A disclosure not falling into one of these three categories is not a legitimate disclosure; the atom's rejection of any other [Authority Type] value is a structural enforcement of that bound. The separation into type and reference keeps the [Authority] field machine-queryable by type while preserving a human-readable reference string.

[Disclosed At] is the timestamp of the disclosure event. Set on [Record], immutable. If not supplied by the caller, it defaults to the **injected clock reading `now`** (the pipeline's `clock_t`, read by the host at the I/O seam — see the Logic-confinement note in Decision points), not a wall clock read inside the transition. The atom enforces that the persisted [Disclosed At] — whether caller-supplied or defaulted to the injected `now` — is not in the future relative to that injected `now`. [Disclosed At] may be backdated — documenting a disclosure recognized after the fact is valid in some regulated contexts — but not forward-dated.

### Inputs

- [Record] calls from the calling system immediately following each disclosure event, carrying the subject reference, recipient, scope, authority, and optional explicit timestamp.
- [Read] queries from compliance teams, regulators, data subjects asserting their Article 15 rights, incident responders, and auditors.
- The current clock reading `now` (the pipeline's `clock_t`) and the fresh [Disclosure Id] (the pipeline's `id_t`), **pipeline-injected at the atom's single I/O seam** — not parameters of any action. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and generates the id at the seam before the transition runs; the transition reads no wall clock and generates no id internally, and neither is supplied by the business caller. The injected `now` is consumed only to default [Disclosed At] when not supplied and to evaluate the pure not-in-future guard (see Decision points); the injected `id_t` becomes the new record's [Disclosure Id]. [Read] is a pure query over stored records and consumes neither `now` nor a fresh id.

### Actions

For optional parameters in `record`, "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies.

- [Record] — (Projected contract: `record(subject_ref, recipient, scope, authority, disclosed_at?) → recorded(disclosure_id) | rejected(invalid-request | unknown-authority-type | storage-failure)`) — create a new disclosure record. The clock reading `now` (the pipeline's `clock_t`) and the [Disclosure Id] (the pipeline's `id_t`) are **pipeline-injected at the I/O seam** — read by the host before the transition runs, never read or generated inside it, and never trusted from the caller — so they do not appear in the signature (see the Logic-confinement note in Decision points). The injected `now` is consumed for exactly two purposes: (a) defaulting [Disclosed At] to `now` when the caller does not supply it, and (b) the pure not-in-future guard below. Takes the injected `id_t` as the record's [Disclosure Id], records [Subject Ref], [Recipient], [Scope], [Authority] (both `type` and `reference`), and [Disclosed At] (the injected `now` if not supplied; the resolved value must not be in the future). The record enters the store permanently; it is immutable and cannot be retracted. [Subject Ref], [Recipient], [Scope], and [Authority Reference] must each contain at least one non-whitespace character — any violation is [Invalid Request]. [Authority] itself must be present and must carry both `type` and `reference` sub-fields — a missing or structurally malformed [Authority] field is [Invalid Request]. The resolved [Disclosed At] — caller-supplied or defaulted to the injected `now` — must not be in the future relative to that same injected `now` ([Invalid Request]). [Invalid Request] is checked before [Unknown Authority Type]; structural and field-content validation completes before the authority type is evaluated. If all field-level preconditions pass, [Authority Type] is checked: if it is not one of {`consent`, `legal-hold`, `regulatory`}, the call is rejected as [Unknown Authority Type]. [Storage Failure] denotes solely an infrastructure write failure: if the store write fails after all preconditions pass, no record is durably persisted and `recorded(disclosure_id)` is not returned (the injected `id_t` is simply discarded with the failed write — it is never reused, by the seam's fresh-per-call construction). Rejection priority: [Invalid Request] → [Unknown Authority Type] → [Storage Failure].

- [Read] — (Projected contract: `read(filters) → results | rejected(invalid-query)`) — query the disclosure store and return matching disclosure records. Results are ordered by [Disclosed At] ascending, then by [Disclosure Id] ascending in lexicographic byte-order as a stable tiebreaker. Implementations must assign [Disclosure Id] values in a format where string byte-order sort produces a total order (e.g., ULID, UUID v7, or zero-padded integer string). The supported filter axes are exactly: [Disclosure Id], [Subject Ref], [Recipient], [Authority Type], and [Disclosed At] (as a time range). The [Disclosed At] range filter takes two optional sub-keys, `after` and `before`, each a timestamp; the match is a **closed (inclusive) interval** — a record matches when `after ≤ disclosed_at ≤ before`. Either sub-key may be omitted: supplying only `after` matches `disclosed_at ≥ after` (open upper bound), supplying only `before` matches `disclosed_at ≤ before` (open lower bound). Any combination of supported axes is valid. A query supplying only a [Disclosure Id] returns at most one record. A well-formed query matching no records returns an empty sequence, not a rejection — an empty result means no disclosures matching the filters have been recorded, which is itself a meaningful compliance answer (the system has not disclosed subject data in the queried scope). A query with no filters returns every record in the store.

  The [Authority Type] filter axis takes one of {`consent`, `legal-hold`, `regulatory`} as its value; it matches records where [Authority Type] equals that value. It is distinct from [Authority Reference] — reference-level filtering is not supported by this atom; reference searches are a composing-layer concept.

  **Malformed-query rules ([Invalid Query]):** a [Disclosure Id], [Subject Ref], or [Recipient] filter value that is null, empty, or whitespace-only is [Invalid Query]. An [Authority Type] filter value that is not one of {`consent`, `legal-hold`, `regulatory`} is [Invalid Query]. A time range on [Disclosed At] with end before start is [Invalid Query]. A query carrying an unrecognized filter key — any key outside the five supported axes named above — is [Invalid Query]; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

### Outputs

- For [Record]: the outcome token `recorded` carrying the fresh [Disclosure Id], or a rejection.
- For [Read]: a (possibly empty) ordered sequence of disclosure records. Each record carries its full field set: [Disclosure Id], [Subject Ref], [Recipient], [Scope], [Authority] (both `type` and `reference`), and [Disclosed At]. Every field is set on every record in the store; there are no optional fields that some records carry and others do not. The [Authority] field is always present in structured form with both sub-fields.

### State

The Selective Disclosure atom has no state machine on individual records. Each disclosure event creates one record; that record is immediately and permanently in the disclosure store. There are no states, no transitions, and no terminal conditions on a disclosure record. The concept is categorically different from the state-machine atoms (Legal Hold: Active/Released; Approval Step: Pending/Approved/Rejected/Withdrawn) — a disclosure record simply *is*, from the moment it is created, without lifecycle transitions.

The store-level state is the set of all disclosure records. That set is strictly append-only: [Record] adds to it; nothing removes from it or modifies records already in it. The store grows monotonically.

Fields on every disclosure record: [Disclosure Id], [Subject Ref], [Recipient], [Scope], [Authority Type], [Authority Reference], [Disclosed At] — all immutable from the moment [Record] completes.

### Flow

1. **Disclosure event occurs.** The calling system has shared subject data with a recipient. This may be a GDPR-mandated data subject access request response, a HIPAA-compelled disclosure to a public health authority, a Consent-authorized sharing with a third-party research partner, or a Legal-Hold-compelled disclosure to a regulatory investigator.
2. **Calling system calls [Record].** Immediately following the disclosure, the calling system calls [Record] with the subject, recipient, scope, and authority. The atom takes the pipeline-injected `id_t` as the record's [Disclosure Id], records all fields, and returns `recorded(disclosure_id)`.
3. **Disclosure record persists indefinitely.** The record is in the store. It will appear in subsequent [Read] queries. Retention governance — how long it must be kept — is a composing [Retention Window](./retention-window.md) concept. Tamper protection — ensuring it cannot be altered by a store administrator — is a composing [Tamper Evidence](./tamper-evidence.md) concept.
4. **Auditor or data subject queries.** At any future time, a data subject exercising Article 15 rights, a GDPR supervisory authority, an HHS OCR inspector, or an SEC examiner queries `read({subject_ref: X})`. The result is the complete disclosure history for subject X: every disclosure event, every recipient, every scope, every authority, every timestamp. The atom answers the regulatory question from its records alone.

### Decision points

**Logic confinement (clock and id).** The clock and the id are **pipeline-injected at the I/O seam** — read/generated by the host before the transition runs, never produced inside it — and so are *not* parameters of any action (the signature stays `record(subject_ref, recipient, scope, authority, disclosed_at?)`; `now` and the id are supplied by the pipeline, not the business caller). `now` is the injected `clock_t`; the [Disclosure Id] is the injected `id_t` — fresh by construction at the seam, hence never reused and never generated inside the transition. `now` is consumed for exactly two purposes: defaulting [Disclosed At] when the caller does not supply it, and the not-in-future guard. That guard is a **pure function of the resolved [Disclosed At] and the injected `now`** — `not_future(disclosed_at, now) ≜ disclosed_at ≤ now` — and it **rejects without writing** when it fails. This is genuinely execution-time *validation* (the residual that is *clearly marked*, not derived away): a disclosure cannot be recorded as having happened in the future, and that determination must be made against the injected clock at the moment of recording. No clock is read and no id is generated inside the transition. Rejection priority for [Record]: [Invalid Request] → [Unknown Authority Type] → [Storage Failure].

- **At [Record]** — field-level checks complete first (rejection reason: [Invalid Request]): [Subject Ref], [Recipient], [Scope], and [Authority Reference] must each contain at least one non-whitespace character; [Authority] must be present as a structured field carrying both `type` and `reference` sub-fields; the resolved [Disclosed At] — caller-supplied or defaulted to the injected `now` — must not be in the future relative to that injected `now` (the pure not-in-future guard above; writes nothing on failure). All field-level preconditions are checked before the authority type is evaluated. Then semantic check: [Authority Type] must be one of {`consent`, `legal-hold`, `regulatory`}; any other value is [Unknown Authority Type]. Then persistence: [Storage Failure] if the store write fails. Rejection priority: [Invalid Request] → [Unknown Authority Type] → [Storage Failure].

- **At [Read]** — every supplied filter value must be well-formed for its axis. A [Disclosure Id], [Subject Ref], or [Recipient] filter value that is null, empty, or whitespace-only is [Invalid Query]. An [Authority Type] filter value not in {`consent`, `legal-hold`, `regulatory`} is [Invalid Query]. A time range on [Disclosed At] with end before start is [Invalid Query]. An unrecognized filter key — any key outside the five supported axes — is [Invalid Query]; the spec rejects rather than ignores unknown keys. A well-formed query matching no records returns an empty sequence.

### Behavior

- **Records are durable on success.** Once [Record] returns `recorded(disclosure_id)`, the record is in the store and will appear in subsequent reads.
- **Record creation is not idempotent.** Two [Record] calls with the same [Subject Ref], [Recipient], [Scope], and [Authority] create two independent disclosure records with distinct [Disclosure Id]s. If the calling system needs at-most-once semantics under retry conditions, compose with [Duplicate Prevention](./duplicate-prevention.md).
- **Concurrent [Record] calls for the same subject are not an error.** Multiple disclosures of subject data may occur concurrently — for example, a batch disclosure to multiple recipients processed in parallel. Each call produces its own [Disclosure Id] and its own record. There is no serialization constraint across distinct [Record] calls; each call's result is independent of every other call's result. Implementations must serialize only on a given [Disclosure Id] for consistency of the record's own fields, not across calls for the same [Subject Ref].
- **No record is modified after creation.** The atom has no `amend`, `retract`, `correct`, or `delete` surface. A disclosure that was recorded incorrectly — wrong scope, wrong recipient — produces a record that stands permanently. If a disclosure was recorded in error, the correct response is to create a new [Record] with accurate fields and a [Scope] or [Authority Reference] that narrates the relationship to the prior record. The original record remains in the store as evidence of what was recorded; the new record provides the accurate account. This is the same pattern Legal Hold uses for case-reference updates — immutability of the original record is structural, not correctable.
- **The atom does not enforce that every disclosure is recorded.** Whether the calling system calls [Record] after every disclosure is an integration obligation the calling system must honor; the atom cannot enforce it from inside. The no-disclosure-unrecorded invariant (Invariant 5) is an integration invariant and a calling-system obligation. An external auditor who finds a disclosure that was not recorded has found a system conformance failure, not an atom conformance failure.
- **Reads are repeatable; the disclosure store is monotonic.** The store only grows — [Record] adds records; nothing removes them. An unfiltered read at `t2 > t1` returns every record visible at `t1` plus any added between `t1` and `t2`.

### Feedback

- After [Record] — a new disclosure record exists in the store; [Disclosure Id], [Subject Ref], [Recipient], [Scope], [Authority Type], [Authority Reference], and [Disclosed At] are set and immutable. The [Disclosure Id] is returned as `recorded(disclosure_id)`.
- After [Read] — no state change. A (possibly empty) ordered sequence of disclosure records is returned. Each record carries its full field set.

Each rejected [Record] action produces an observable refusal naming the failed precondition. Each rejected [Read] action produces an observable refusal: [Invalid Query], naming the filter axis or condition that was malformed.

### Invariants

- **Invariant 1 — Record immutability.** After a successful [Record], the fields [Disclosure Id], [Subject Ref], [Recipient], [Scope], [Authority Type], [Authority Reference], and [Disclosed At] never change, regardless of any subsequent action. There is no action in this atom that modifies a stored disclosure record.

- **Invariant 2 — Authority completeness.** Every disclosure record in the store carries [Authority Type] as one of {`consent`, `legal-hold`, `regulatory`} and [Authority Reference] containing at least one non-whitespace character. A disclosure record with a missing [Authority] field, an unrecognized [Authority Type], or an empty [Authority Reference] is a conformance failure — it cannot answer the regulator's question *"under what authority was this disclosure made?"* and defeats the accountability purpose of the atom.

- **Invariant 3 — Field completeness.** Every disclosure record in the store carries [Disclosure Id], [Subject Ref], [Recipient], [Scope], [Authority Type], [Authority Reference], and [Disclosed At] each set to a non-absent value. [Subject Ref], [Recipient], [Scope], and [Authority Reference] each contain at least one non-whitespace character. [Disclosed At] is a timestamp that is set. No field may be null, missing, or (for strings) whitespace-only in a conforming record. A record missing any field is a conformance failure.

- **Invariant 4 — Temporal soundness.** For every disclosure record in the store, [Disclosed At] is not in the future relative to the injected clock reading `now` at the time the record was created. The constraint is enforced against the resolved [Disclosed At] — whether caller-supplied or defaulted to the injected `now` — by the pure not-in-future guard at the [Record] Decision point, before the record is written (the guard reads the injected `now`, not a clock inside the transition). A disclosure record whose [Disclosed At] is in the future is a conformance failure; it would mean the system claims to have recorded a disclosure that had not yet happened at the time of recording.

- **Invariant 5 — No-disclosure-unrecorded (integration invariant).** Every transmission of subject data to a party other than the subject is a disclosure event that must produce a disclosure record in this atom. This invariant cannot be enforced internally — the atom records when called; it cannot intercept disclosures that occur without calling it. It is stated here as an integration obligation and a calling-system conformance requirement. Deployments that omit [Record] calls for some disclosure events are non-conforming to this invariant. An external auditor who identifies a disclosure event for which no record exists in the store has identified a system conformance failure. The atom's accountability purpose is voided by any deployment that does not honor this obligation.

- **Invariant 6 — Disclosure store durability and append-only nature.** No disclosure record is removed from the store. No disclosure record is modified after creation. The total record count is monotonically non-decreasing. A [Disclosure Id] returned by a successful [Record] call is durably persisted; a [Storage Failure] rejection guarantees no partial record was written. The append-only nature is the structural guarantee that the disclosure history for any subject is complete from the records alone — deletion or modification of a record would break that guarantee in ways an external auditor could not detect without cryptographic tamper evidence.

---

## Examples

### Happy path — Consent-authorized disclosure to a research partner

A health research platform has collected patient data from subject `patient-sub-7842`. The subject previously granted consent for their de-identified data to be shared with a named research partner for oncology research; the Consent record id is `consent-8821`. The platform executes the disclosure and immediately calls:

```
record(
  subject_ref: "patient-sub-7842",
  recipient: "oncology-research-partner-RP3",
  scope: "medical-record:de-identified:oncology-fields",
  authority: { type: "consent", reference: "consent-8821" },
  disclosed_at: "2026-05-13T10:15:00Z"
)
→ recorded(disclosure_id: "disc-0099")
```

The record is in the store. Six months later, the subject exercises GDPR Article 15 rights and asks what data has been shared about them and with whom. The compliance team queries `read({subject_ref: "patient-sub-7842"})` and returns the full disclosure history, including `disc-0099`. The subject sees: data was disclosed to `oncology-research-partner-RP3` on 2026-05-13, under consent `consent-8821`, covering the de-identified oncology fields. The question is answered from the records alone.

### Happy path — Regulatory-mandate disclosure to a public health authority

A covered healthcare entity must report a communicable disease case to the state public health department under HIPAA §164.512(b) — public health reporting. This is a mandatory disclosure that does not require the patient's consent. The entity executes the report and calls:

```
record(
  subject_ref: "patient-sub-3317",
  recipient: "state-public-health-dept-CA",
  scope: "medical-record:communicable-disease-report",
  authority: { type: "regulatory", reference: "HIPAA §164.512(b) — public health reporting" }
)
→ recorded(disclosure_id: "disc-0100")
```

[Disclosed At] is defaulted to the injected `now`. The record is in the store. When HHS OCR reviews the entity's accounting of disclosures, this record confirms the disclosure was made, names the authority, and identifies the recipient. The accounting is complete without recourse to paper logs or developer narration.

### Rejection path — missing authority field

A calling system fails to populate the `authority` field:

```
record(
  subject_ref: "customer-sub-0441",
  recipient: "analytics-vendor-AV7",
  scope: "behavioral-data:clickstream:2026"
)
→ rejected(invalid-request)
```

The `authority` field is missing entirely — a structural violation. No record is created.

### Rejection path — unknown authority type

A calling system passes an authority type not in the three named values:

```
record(
  subject_ref: "customer-sub-0441",
  recipient: "fraud-prevention-partner-FP2",
  scope: "financial-data:transaction-history:90d",
  authority: { type: "legitimate-interest", reference: "fraud-prevention-basis" }
)
→ rejected(unknown-authority-type)
```

`type: "legitimate-interest"` is not one of {`consent`, `legal-hold`, `regulatory`}. The rejection is [Unknown Authority Type] because all field-level checks pass — [Subject Ref], [Recipient], [Scope], [Authority Reference] are all non-empty and well-formed — but the authority type semantic check fails. No record is created.

### Happy path — Legal-Hold-compelled disclosure to a regulatory investigator

A financial institution is subject to an active Legal Hold (`lh-5502`) requiring preservation and disclosure of transaction records to an SEC investigation team. The institution discloses the records and calls:

```
record(
  subject_ref: "account-sub-0187",
  recipient: "SEC-investigation-team-ENF-2026-04",
  scope: "financial-data:transaction-records:2023-2025",
  authority: { type: "legal-hold", reference: "lh-5502" }
)
→ recorded(disclosure_id: "disc-0101")
```

[Disclosed At] is defaulted to the injected `now`. The record is in the store. When the SEC examiner requests the institution's disclosure accounting under Rule 17a-4, this record confirms the compelled disclosure was made, names the legal process under which it was made, and identifies the receiving team. The accounting is complete from the records alone.

### Rejection path — future-dated `disclosed_at`

A calling system mistakenly supplies a timestamp in the future:

```
record(
  subject_ref: "patient-sub-7842",
  recipient: "insurance-carrier-IC9",
  scope: "medical-record:billing-summary",
  authority: { type: "consent", reference: "consent-9910" },
  disclosed_at: "2027-01-01T00:00:00Z"
)
→ rejected(invalid-request)
```

The resolved [Disclosed At] is in the future relative to the injected `now`. The pure not-in-future guard rejects it without writing — a disclosure cannot be recorded as having occurred before it has happened. No record is created.

---

## Regulated adversarial scenarios

### Regulator audit — GDPR Article 15 data subject rights request

A GDPR supervisory authority receives a complaint from a data subject who believes their personal data was disclosed to third parties without proper authorization. The authority requests evidence from the data controller. The compliance team queries `read({subject_ref: "data-subject-DS-2204"})` — the complete disclosure history for the data subject. The result is every disclosure record for this subject: recipient, scope, authority type and reference, and timestamp for each event. The authority examines each record:

- For records where [Authority Type] is `consent`, the authority cross-references [Authority Reference] (the Consent record id) against the Consent store to confirm the consent was valid and in scope at the time of disclosure. This cross-referencing is a composing-layer operation; the Selective Disclosure atom provides the reference that makes it possible.
- For records where [Authority Type] is `regulatory`, the authority evaluates whether the cited regulation ([Authority Reference]) genuinely required or permitted the disclosure.
- For records where [Authority Type] is `legal-hold`, the authority confirms the disclosure was compelled by the named legal process.

Invariant 2 guarantees that every record carries a complete, non-empty [Authority] field. Invariant 3 guarantees that no required field is absent. The supervisory authority has a structurally complete accountability record; no disclosure can be hidden by the absence of a field.

### Disputed disclosure — data subject challenges authorization

A data subject asserts that a disclosure to a named recipient (`marketing-partner-MP5`) was not authorized by any consent they provided and no regulatory mandate permitted it. The system's compliance team queries `read({subject_ref: "data-subject-DS-9871", recipient: "marketing-partner-MP5"})`. The result is every disclosure record naming that recipient for that subject.

Each record is examined. Suppose the result contains two records: one with `authority.type: consent, authority.reference: "consent-3301"` and one with `authority.type: regulatory, authority.reference: "GDPR Art. 6(1)(f) — legitimate interests"`. The data subject's challenge goes to whether `consent-3301` was a valid, informed, specific consent at the time of disclosure, and whether Article 6(1)(f) was a valid basis for the second disclosure. The Selective Disclosure atom does not adjudicate these questions — it does not validate Consent records or evaluate regulatory interpretation. It provides the authority references that let the compliance team and the data subject each direct the dispute to the right place: the Consent store for the first record, a legal analysis of Article 6(1)(f) for the second. Without these records, the dispute cannot be investigated. With them, the investigation has a complete, immutable starting point.

### Breach or incident forensics — determining what data left the system

During a security incident investigation, the incident response team needs to establish what subject data was disclosed in the 72-hour window surrounding the suspected breach (2026-05-10T00:00:00Z through 2026-05-12T23:59:59Z), to identify whether any unauthorized disclosures occurred under cover of or in addition to authorized ones. The team queries:

```
read({disclosed_at: {after: "2026-05-10T00:00:00Z", before: "2026-05-12T23:59:59Z"}})
```

The result is every disclosure record in the window. The team reviews each record: was each recipient a legitimate recipient? Does each authority reference correspond to a valid Consent record, a real Legal Hold, or a genuine regulatory mandate? Are there records naming recipients the team does not recognize as authorized parties?

Because Invariant 6 guarantees the store is append-only and no record can be deleted, the team can rely on the completeness of the result — any disclosure that was recorded is in the result; any gap between a known disclosure event and the result set is a system conformance failure under Invariant 5 (no-disclosure-unrecorded). The forensic question *"what data left the system in this window?"* is answerable from the records alone. A subsequent query `read({disclosed_at: {after: "2026-05-10T00:00:00Z", before: "2026-05-12T23:59:59Z"}, authority_type: "consent"})` returns only consent-authorized disclosures in the window, enabling the team to compare the consent-authorized set against the full set and identify any records with `authority_type: legal-hold` or `authority_type: regulatory` that warrant additional scrutiny.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Disclosure record completeness check (test/audit environment).** For a set of [Disclosure Id]s known to have been issued — observed from the `recorded(disclosure_id)` return values, which requires a test or audit environment where those return values are captured — confirm that `read({disclosure_id: X})` returns each of them. No issued [Disclosure Id] may be absent from the store. An implementation that loses records after creation fails this check. (A *production* auditor reading only the store cannot enumerate every issued [Disclosure Id] independently of the original [Record] responses; for the equivalent assurance from the store alone — that no record present at an earlier read has since vanished — that auditor relies on check 3, the append-only / record-immutability check.)

2. **Field completeness check.** For every disclosure record in the store: confirm that [Disclosure Id], [Subject Ref], [Recipient], [Scope], [Authority Type], [Authority Reference], and [Disclosed At] are each present and non-null. Confirm that [Subject Ref], [Recipient], [Scope], and [Authority Reference] each contain at least one non-whitespace character. Confirm that [Disclosed At] is a set timestamp. Confirm that [Authority Type] is one of {`consent`, `legal-hold`, `regulatory`}. A record missing any field or carrying a whitespace-only string field or an unrecognized [Authority Type] is a conformance failure under Invariants 2 and 3.

3. **Record immutability check.** At time `t1`, issue `read({})` (unfiltered) and record the result set S1. Create one new disclosure record and confirm the [Record] call returned `recorded(disclosure_id)`. At time `t2 > t1`, issue `read({})` again and record result set S2. Confirm every record in S1 appears in S2 by [Disclosure Id] (no record removed). For each record in both S1 and S2, confirm all fields are unchanged in S2 — every field is immutable per Invariant 1. The total record count in S2 is ≥ the count in S1 (store is append-only per Invariant 6). A record whose fields changed between S1 and S2 is a conformance failure; a record present in S1 but absent in S2 is a conformance failure.

4. **Authority type enforcement check.** Attempt [Record] with [Authority Type] set to a value not in {`consent`, `legal-hold`, `regulatory`} (for example, `"legitimate-interest"` or `"internal-policy"`). Confirm the call returns `rejected(unknown-authority-type)`. Confirm no record is created. Then attempt [Record] with each of the three valid [Authority Type] values and a well-formed [Authority Reference]; confirm each returns `recorded(disclosure_id)` and a record appears in the store with the correct [Authority Type]. Invariant 2 guarantees authority completeness; this check verifies that the enforcement boundary is operative.

5. **Subject disclosure history queryability check.** Record at least three disclosure events for the same [Subject Ref], each with a different [Recipient] and [Authority]. Query `read({subject_ref: X})`. Confirm the result contains all three records. Query `read({subject_ref: X, authority_type: "consent"})`. Confirm only records with `authority.type: consent` appear. Confirm that `read({subject_ref: X})` for a subject with no disclosure records returns an empty sequence (not a rejection). This check verifies the primary regulatory use case — the complete disclosure history for a data subject is queryable from the records alone. The empty-result case verifies that the absence of disclosure records is a valid (non-error) answer.

6. **Temporal soundness check.** Attempt [Record] with a [Disclosed At] value in the future (a timestamp at least one second beyond the injected `now`). Confirm the call returns `rejected(invalid-request)` (the pure not-in-future guard rejects without writing). Confirm no record is created. Then confirm that a [Record] call without a [Disclosed At] parameter succeeds and produces a record whose [Disclosed At] is not in the future relative to the injected `now` at the time of the call. Invariant 4 guarantees temporal soundness; this check verifies it is enforced against both caller-supplied and injected-`now`-defaulted values.

### Audit gaps: what cannot be cleared from these records alone

The six checks above cover every invariant the atom enforces internally. Three audit questions arise around this atom that *cannot* be answered from these records alone; an external auditor must compose with other patterns to clear them. They are named here so the audit boundary is explicit and so the auditor knows where to direct each unclearable question.

- **Authority *legitimacy* is unclearable.** Check 4 verifies that [Authority Type] is one of the three named values and that [Authority Reference] is non-empty. It does not — and cannot — verify that the referenced authority was actually valid at [Disclosed At]. A record carrying `authority: { type: "consent", reference: "consent-3301" }` discloses that the calling system claimed Consent record `consent-3301` as the basis; whether that Consent was granted, in scope, and not revoked at [Disclosed At] is unclearable from this atom's records. Auditors verify authority legitimacy by composing with the [Consent](./consent.md) store (for `type: consent`), the [Legal Hold](./legal-hold.md) store (for `type: legal-hold`), or by reading the cited regulation (for `type: regulatory`). Semantic consistency between [Authority Type] and [Authority Reference] — e.g., a `type: consent` carrying a reference that is plainly a regulatory citation — is also unclearable here; it is the calling system's obligation (named in the [Authority Reference] field description and in Edge cases).
- **Invariant 5 conformance is unclearable from inside the store.** Whether the calling system called [Record] after every disclosure event cannot be verified by reading the disclosure store alone — gaps are invisible to a query that only sees what *was* recorded. An external auditor verifies Invariant 5 by cross-referencing the disclosure store against the calling system's [Event Log](./event-log.md), against transmission logs at the egress boundary, against complaint records, or against the recipient's own intake records, and finding any disclosure event for which no corresponding record exists here. The atom's records are the *positive* evidence (what was recorded); Invariant 5 conformance also requires *negative* evidence (no disclosure occurred outside the store), which lives outside this atom.
- **Backdating detection requires a recording timestamp this atom does not store.** The atom stores [Disclosed At] (the declared disclosure time) but no separate creation timestamp. A [Record] call invoked today with `disclosed_at: "2024-01-01"` produces a record that looks like a 2024 disclosure. Detection that the record was actually written today requires comparing the disclosure record against the corresponding [Event Log](./event-log.md) entry's receipt timestamp; the [Audit Trail](../compositions/audit-trail.md) composition is the audit surface where this comparison is exposed. See the clock-semantics Edge case for the full statement.

---

## Edge cases and explicit non-goals

- **The atom does not perform disclosures.** The atom records that a disclosure occurred; it does not retrieve subject data, apply redaction or anonymization, route data to recipients, or validate that the disclosed data matches the declared scope. All of these are the calling system's to address. The [Scope] field is the calling system's declaration of what was disclosed; the atom does not verify it. A system that records `scope: "contact-fields-only"` but actually transmitted the full medical record has produced an inaccurate disclosure record — this is a calling-system failure, not an atom failure.

- **Subject-comprehensible [Scope] vocabulary is a calling-system obligation.** The atom records [Scope] as an opaque string; it imposes no vocabulary, no controlled list, and no readability requirement. A data subject exercising GDPR Article 15(1)(c) rights must be told the *categories* of data disclosed in language they can act on; a [Scope] value of `"tbl_disc_oncology_42"` would satisfy this atom but fail the Article 15 obligation. The calling system is responsible for choosing a [Scope] vocabulary that is meaningful to the regulatory audience that will read the record — data subjects under GDPR, OCR inspectors under HIPAA §164.528, examiners under SEC Rule 17a-4. Parallel to the [Recipient] vocabulary obligation immediately below: both fields are opaque to this atom, and both place a readability obligation on the calling system that this atom cannot enforce. An auditor cannot verify subject-comprehensibility of [Scope] strings from the records alone without familiarity with the calling system's vocabulary; this is the documented audit gap for [Scope] semantics.

- **Subject-recognizable [Recipient] vocabulary is a calling-system obligation.** The atom records [Recipient] as an opaque string. GDPR Article 15(1)(c) requires the controller to name *the recipients or categories of recipients* to whom personal data has been or will be disclosed, in terms the data subject can act on. A [Recipient] value of `"partner-AV7"` is structurally valid here but does not satisfy Article 15 if the data subject cannot resolve it to a named legal entity. The calling system is responsible for choosing [Recipient] strings that are either directly subject-recognizable or for maintaining a calling-system-side mapping from opaque recipient ids to subject-facing recipient names; the atom records what the calling system declares and exposes it through [Read]. Reference-axis filtering of [Recipient] is exact-match, not name-resolved — a query `read({subject_ref: X, recipient: "Acme Marketing Inc"})` matches only records whose [Recipient] field is exactly that string. Cross-reference with a recipient registry is a composing-layer operation, not provided by this atom.

- **Authority reference validation is the calling system's obligation.** For `authority.type: consent`, the atom does not validate that [Authority Reference] is a real Consent record id, that the Consent record is in a valid state, or that the disclosure scope falls within the Consent's granted scope. For `authority.type: legal-hold`, the atom does not validate that [Authority Reference] is a real Legal Hold id or that the hold is Active. For `authority.type: regulatory`, the atom does not validate that the regulatory citation is accurate or applicable. All validation of authority reference validity is the calling system's obligation. The atom enforces only structural completeness: that the [Authority] field is present, that [Authority Type] is one of the three named values, and that [Authority Reference] contains at least one non-whitespace character.

- **[Record] is not idempotent.** Two [Record] calls with the same parameters create two independent disclosure records with distinct [Disclosure Id]s. If the calling system needs at-most-once semantics under retry conditions — for example, when a disclosure is recorded in a distributed system and the network acknowledgment is lost — compose with [Duplicate Prevention](./duplicate-prevention.md).

- **Correction of an inaccurate disclosure record.** Once a disclosure record is created, it cannot be modified or deleted. A [Record] call that captured an incorrect [Scope], wrong [Recipient], or wrong authority reference produces a permanent record. The correct approach when an error is discovered is to create a new [Record] with accurate fields, with a [Scope] or [Authority Reference] narrative that identifies the relationship to the inaccurate record. The original record remains in the store as evidence of what was recorded at the time; the new record provides the accurate account. An auditor reviewing both records sees the full history, including the correction. This pattern parallels Legal Hold's approach to case-reference updates: immutability of the original is not a bug; it is the structural guarantee that records cannot be silently altered after the fact.

- **Disclosures to the subject themselves.** A data subject requesting a copy of their own records under GDPR Article 15 is exercising a right that requires a response, but the atom's no-disclosure-unrecorded obligation does not apply to the response to that request. The Article 15 response is the disclosure of data to the data subject themselves; the obligation in Article 15(1)(c) is to disclose the *recipients to whom the data has been communicated*, not to record the act of communicating the data to the subject as a Selective Disclosure event. Whether the Article 15 response itself should be recorded is a deployment policy question. This atom does not resolve it; the compliance team decides based on their regulatory interpretation.

- **Bulk disclosures.** One [Record] call creates one disclosure record for one subject-recipient-scope event. A disclosure of data for multiple subjects simultaneously — for example, a batch report to a public health authority covering many patient records — requires one [Record] call per subject. The atom does not support batch [Record] calls. Bulk recording is a composing-layer operation that calls [Record] for each subject. For atomic all-or-none semantics (either all subjects are recorded or none are), a transaction wrapper in the composing layer is required; this atom does not provide it.

- **Retention Window interaction.** Disclosure records are created with no inherent expiry. How long they must be retained — and when (if ever) they may be purged — is a composing [Retention Window](./retention-window.md) concept. GDPR Article 30 requires records of processing activities to be maintained as long as the processing occurs and typically beyond; HIPAA §164.528(d) requires the accounting of disclosures to be retained for six years. The composing layer applies the appropriate retention policy. This atom does not define or enforce retention windows.

- **Tamper-evidence.** The atom guarantees immutability by specification — no action in the atom modifies a stored record. It does not cryptographically prevent a store administrator with write access from altering disclosure records. For court-admissible accountability records and for SEC Rule 17a-4's non-erasable, non-rewritable standard, compose with [Tamper Evidence](./tamper-evidence.md), which provides cryptographic sealing. Tamper-evident disclosure records are required under several regulatory regimes.

- **Access control.** Who may call [Record] and who may call [Read] — and with what filter scope — is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In regulated deployments, unrestricted access to the full disclosure store may expose subject identity and disclosure patterns to actors who should not have that access; scoped read access (a data subject may query their own records; a regulator may query a scoped window; compliance staff have broader access) is handled at the deployment layer.

- **Non-repudiation of the recording actor.** The atom records that a [Record] call was made and what it contained; it does not record who made the call or bind a cryptographic proof to the recording action. If the calling system's identity must be non-repudiably bound to the disclosure record — for example, to prove that the compliance officer who recorded a disclosure actually made the call — compose with [Actor Identity](./actor-identity.md). The disclosure record is the gate; Actor Identity provides the signature.

- **Clock semantics.** [Disclosed At] defaults to the **injected clock reading `now`** (the pipeline's `clock_t`, read by the host at the I/O seam and pipeline-injected — not a parameter of [Record]) when not supplied by the caller; the transition reads no wall clock internally. The resolved [Disclosed At] must not be in the future — enforced by the pure not-in-future guard at the Decision point against the resolved value (caller-supplied or defaulted to the injected `now`), relative to that same injected `now`. Backdated [Disclosed At] values are accepted — documenting a disclosure that was recognized or reported after the fact is valid in some regulated contexts, including breach notification timelines — but a backdated value records the declared disclosure time, not the current time. The atom imposes no lower bound on [Disclosed At]: a value of `"1970-01-01T00:00:00Z"` would be accepted. Clock skew between caller and the injected `now` can cause a caller-supplied [Disclosed At] that is "current" by the caller's clock to be rejected as [Invalid Request] when the injected `now` places it in the future; this is the correct rejection — the temporal invariant is enforced against the injected `now`, not against the caller's belief about the time. Backdating detection — distinguishing the declared [Disclosed At] from the time the [Record] call was actually received — is not a property of this atom; the atom stores only [Disclosed At]. The composing [Event Log](./event-log.md) entry that captures each [Record] call carries the call's receipt timestamp; a Selective Disclosure record with a [Disclosed At] materially earlier than its corresponding Event Log entry's receipt timestamp is the audit signal that the disclosure was backdated. The [Audit Trail](../compositions/audit-trail.md) composition surfaces this comparison; this atom does not. Clock skew, timezone normalization, and monotonicity are handled at the deployment layer.

- **Concurrency.** Multiple concurrent [Record] calls — including multiple concurrent calls for the same [Subject Ref] — do not conflict and do not require serialization with each other. Each produces its own [Disclosure Id] and its own independent record. Implementations must serialize only the store write for a single call to ensure that a single [Disclosure Id] is issued exactly once per successful [Record] call.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Record

The behavior that appends one immutable disclosure record: it takes the injected `id_t` as the record's [Disclosure Id], stores [Subject Ref], [Recipient], [Scope], [Authority] (both [Authority Type] and [Authority Reference]), and [Disclosed At] (the injected clock `now` if not supplied; rejected [Invalid Request] if in the future), and returns `recorded(disclosure_id)`. Rejection priority: [Invalid Request] → [Unknown Authority Type] → [Storage Failure].

Kind: Operation

#### Read

The read-only query returning the matching disclosure records in [Disclosed At] then [Disclosure Id] ascending order, filtered by any of [Disclosure Id], [Subject Ref], [Recipient], [Authority Type], or a [Disclosed At] range. Never writes; an empty result is not a rejection. Rejected [Invalid Query] for a malformed filter.

Kind: Operation

#### Disclosure Id

The opaque, immutable identity of a disclosure record — the injected `id_t`, supplied at the I/O seam (fresh per call, never reused), byte-order sortable for deterministic [Read] ordering (Invariant 6). It is the record's identity; the other fields are properties.

Kind:     Field
Field of: the disclosure record
Projects: disclosure_id

#### Subject Ref

The opaque reference to the data subject whose data was disclosed. Set on [Record], immutable, non-whitespace (Invariant 3); the same subject may appear in many records.

Kind:     Field
Field of: the disclosure record
Projects: subject_ref

#### Recipient

The non-empty string naming the party the data was disclosed to. Set on [Record], immutable (Invariants 1 and 3); opaque and exact-match on [Read] (subject-recognizable naming is the calling system's obligation).

Kind:     Field
Field of: the disclosure record
Projects: recipient

#### Scope

The non-empty string naming what subset of the subject's data was disclosed, as declared by the calling system. Set on [Record], immutable; opaque (subject-comprehensible vocabulary is the calling system's obligation).

Kind:     Field
Field of: the disclosure record
Projects: scope

#### Authority

The structured field naming the legal basis for the disclosure — exactly two sub-fields, [Authority Type] and [Authority Reference]. Always present in structured form (Invariant 2). Set on [Record], immutable.

Kind:     Field
Field of: the disclosure record
Projects: authority

#### Authority Type

The kind of authority — exactly `consent`, `legal-hold`, or `regulatory` (any other value is [Unknown Authority Type]). The machine-queryable half of [Authority]; the [Read] filter axis of the same name matches on it.

Kind:     Field
Field of: the authority field
Projects: authority.type

#### Authority Reference

The opaque, non-whitespace string identifying the specific authority — a Consent id, a Legal Hold id, or a regulatory citation. The human-readable half of [Authority]; the atom validates its presence, not its legitimacy.

Kind:     Field
Field of: the authority field
Projects: authority.reference

#### Disclosed At

The timestamp of the disclosure event. Set on [Record] or defaulted to the injected clock `now`; immutable. Must not be in the future relative to the injected `now` (Invariant 4); may be backdated. Best-effort — the wall clock, not this atom, bounds its honesty.

Kind:     Field
Field of: the disclosure record
Projects: disclosed_at

#### Invalid Request

The rejection [Record] returns when a required field ([Subject Ref], [Recipient], [Scope], or [Authority Reference]) is missing or whitespace-only, [Authority] is structurally malformed, or the resolved [Disclosed At] is in the future.

Kind:      Member
Member of: the record rejection
Role:      Outcome
Projects:  invalid-request

#### Unknown Authority Type

The rejection [Record] returns when [Authority Type] is not one of `consent`, `legal-hold`, or `regulatory` — checked after all field-level validation passes.

Kind:      Member
Member of: the record rejection
Role:      Outcome
Projects:  unknown-authority-type

#### Storage Failure

The rejection [Record] returns when the store write fails after all preconditions pass; guarantees no partial record was persisted (Invariant 6).

Kind:      Member
Member of: the record rejection
Role:      Outcome
Projects:  storage-failure

#### Invalid Query

The rejection [Read] returns when a filter value is malformed — a null or whitespace [Disclosure Id], [Subject Ref], or [Recipient]; an [Authority Type] outside the three values; a reversed [Disclosed At] range; or an unrecognized filter key.

Kind:      Member
Member of: the read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Record]: #record
[Read]: #read
[Disclosure Id]: #disclosure-id
[Subject Ref]: #subject-ref
[Recipient]: #recipient
[Scope]: #scope
[Authority]: #authority
[Authority Type]: #authority-type
[Authority Reference]: #authority-reference
[Disclosed At]: #disclosed-at
[Invalid Request]: #invalid-request
[Unknown Authority Type]: #unknown-authority-type
[Storage Failure]: #storage-failure
[Invalid Query]: #invalid-query

---

## Composition notes

Selective Disclosure is the disclosure accountability primitive that regulated data-handling systems compose with when they must prove what was shared, with whom, and under what authority:

- **[Actor Identity](./actor-identity.md)** — provides non-repudiable attribution of the actor who recorded the disclosure. [Record] calls are themselves actions of consequence in regulated systems; Actor Identity binds the compliance officer or system actor who made the call to the disclosure record, satisfying the chain of custody requirement for the recording action as distinct from the disclosure event itself.
- **[Legal Hold](./legal-hold.md)** — a Legal Hold id may appear as [Authority Reference] when [Authority Type] is `legal-hold`, indicating that the disclosure was compelled by an active legal process. Legal Hold and Selective Disclosure are composing peers: Legal Hold governs preservation of records; Selective Disclosure records when those records were disclosed to third parties under compulsion. Neither atom imports the other's semantics; both may be active simultaneously on the same subject's records.
- **[Consent](./consent.md)** — a Consent record id appears as [Authority Reference] when [Authority Type] is `consent`. Consent governs whether the data subject has authorized a category of processing; Selective Disclosure records that a disclosure under that authorization occurred. The Consent atom validates whether consent was granted; the Selective Disclosure atom records that the disclosure happened.
- **[Retention Window](./retention-window.md)** — governs how long disclosure records must be retained before they may be purged. GDPR Article 30 and HIPAA §164.528(d) impose specific retention obligations on disclosure accounting records; Retention Window is the atom that enforces them. Selective Disclosure creates the records; Retention Window governs their lifecycle.
- **[Tamper Evidence](./tamper-evidence.md)** — cryptographically seals disclosure records against post-hoc modification. For SEC Rule 17a-4, HIPAA, and court-admissible disclosure accounting, tamper-evident records are required. Tamper Evidence is the composing atom that lifts this atom's spec-level immutability guarantee to a cryptographically verifiable guarantee.
- **[Event Log](./event-log.md)** — disclosure events are system events that an Event Log captures in its general-purpose stream. The Selective Disclosure record is the structured, authority-bearing disclosure-specific form; the Event Log entry is the timestamped, attributed, general-purpose record. Both coexist in regulated deployments; neither replaces the other.
- **[Permissions](./permissions.md)** — governs who may call [Record] and who may query the disclosure store with what filter scope. Scoped read access is essential in deployments where the disclosure store contains sensitive subject identity and disclosure pattern information.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for at-most-once semantics on [Record] calls under retry conditions.
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical regulated-audit stack (Event Log + Actor Identity + Retention Window + Tamper Evidence) captures every disclosure recording action with attribution and tamper evidence; the Selective Disclosure record is a structured sidecar to the Audit Trail entry.
- **[Immutable Transaction Ledger with Selective Disclosure](../compositions/immutable-transaction-ledger.md)** (`grounded` 2026-06-08) — the Audit Trail substrate (Event Log + Actor Identity + Tamper Evidence + Retention Window, reached transitively) wired to Selective Disclosure, with Idempotent Reservation / Duplicate Prevention as an optional at-most-once-append enrichment (named, not core). Makes a transaction ledger both non-repudiable and selectively shareable: the full ledger is immutable, attributed, and tamper-evident; a subset can be disclosed to a counterparty or regulator both *accountably* — each disclosure is itself an immutable, attributed `ledger.disclosed` event (the binding bijection) — and *verifiably* — the disclosed subset is independently provable authentic against the ledger seal — without compromising the undisclosed remainder. Immutable Transaction Ledger is the composing pattern that structurally closes this atom's Invariant 5 (no-disclosure-unrecorded), by making its `disclose_subset` the only disclosure surface and having it always record.
- **[Resolve a Person's Data Rights](../compositions/resolve-a-persons-data-rights.md)** — Selective Disclosure + Defensible Retention (substrate → Legal Hold + Retention Window + Audit Trail) + Consent (read-only oracle). Makes data subject access and erasure mechanically answerable with one recorded, attributed disposition per record across the subject's whole enumerated universe (no-silent-omission). Selective Disclosure is used **both ways**: *read* to answer the Article 15(1)(c) recipients limb (*to whom was the subject's data disclosed*), and *written* to record each fulfillment response itself as an accountable disclosure to the requester — Resolve a Person's Data Rights thereby resolves, for the DSAR-response case, the deployment-policy question this atom's *Disclosures to the subject themselves* edge case leaves open.

---

## Standards references

- **GDPR Article 15(1)(c)** — the data subject's right of access includes the right to know the recipients or categories of recipients to whom their personal data has been or will be disclosed. Selective Disclosure is the accountability layer that makes Article 15(1)(c) responses structurally answerable from records alone. Every disclosure record's [Recipient] field and [Authority] field are the data the Article 15 response draws from.
- **GDPR Article 30 (Records of processing activities)** — controllers must maintain records of processing activities, including categories of recipients to whom personal data has been or will be disclosed, and transfers to third countries or international organizations. Disclosure records under this atom are the processing-activity records Article 30 requires for the disclosure category of processing.
- **HIPAA §164.528 (Accounting of disclosures of protected health information)** — individuals have the right to receive an accounting of disclosures of their PHI (Protected Health Information — individually identifiable health data covered by HIPAA) made by a covered entity or business associate. The accounting must include the date of each disclosure, the name and address of the recipient, a brief description of the PHI disclosed, and a brief statement of the purpose. Each field maps directly: [Disclosed At] (date), [Recipient] (recipient name), [Scope] (description of PHI), [Authority Reference] (purpose statement). The atom is the structural implementation of §164.528's accounting obligation.
- **SEC Rule 17a-4** — broker-dealers must preserve records in non-rewriteable, non-erasable format, accessible to regulators on demand. Disclosure records for broker-dealer records are themselves required records under 17a-4. Composing with Tamper Evidence satisfies the non-rewriteable, non-erasable standard; this atom provides the disclosure record structure.

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

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/selective-disclosure.md`.
