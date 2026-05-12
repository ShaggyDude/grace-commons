---
title: Audit Trail
parent: Compositions
nav_order: 3
---

# Audit Trail

> A regulated application: every action of consequence is recorded, attributed to a verifiable actor, retained for its regulatory lifetime, and protected against after-the-fact rewriting. Composes Event Log, Actor Identity, Retention Window, and Tamper Evidence into the canonical audit primitive that SOX, HIPAA, PCI DSS, 21 CFR Part 11, SEC Rule 17a-4, and every other industrial audit regime requires but none name as a single composable concept. With this application, four freestanding atoms become the one structure the regulator actually asks about.

---

## Intent

Every regulated system carries the same obligation: when the auditor arrives, the system must be able to answer four questions about any action of consequence — *what happened, who authorized it, has the record been altered, and was the retention obligation honored?* Each question maps cleanly onto one of the four constituent atoms; the auditor's actual ask is all four at once, for any record, on demand, over the regulatory horizon.

The application addresses what the four atoms cannot answer alone. Event Log records the fact but does not bind it to an actor. Actor Identity binds the actor but does not commit to the records' integrity. Retention Window bounds the lifetime but does not detect rewriting. Tamper Evidence detects rewriting but does not name the actor. Stacked correctly, the four answer the regulator's question in one structure: a record that is observable, attributable, integrity-protected, and lifetime-bounded.

This is a composition, not a new primitive. The four atoms are unchanged; the application is the wiring that makes them coherent — one consolidated audit surface rather than four parallel record stores the auditor has to correlate by hand. The construction is the same one that runs in every audit-grade system in production today: signed events appended to an immutable log, sealed periodically against a tamper-evident structure, governed by a retention policy with a structural no-early-purge guarantee. Different vocabularies; identical mechanic.

---

## Composes

- **[Event Log](../atoms/temporal/event-log.md)** — provides the append-only, totally-ordered sequence the audit's *what happened* answer is read from. The application maintains exactly one Event Log instance (the audit log).
- **[Actor Identity](../atoms/compliance/actor-identity.md)** — provides the verifiable attribution the audit's *who authorized it* answer is read from. The application maintains exactly one Actor Identity instance (the attestation store).
- **[Retention Window](../atoms/compliance/retention-window.md)** — provides the policy-bounded lifetime the audit's *was the retention honored* answer is read from. The application maintains one Retention Window instance configured with the host's regulatory policy (or a policy selector for content-derived rules).
- **[Tamper Evidence](../atoms/compliance/tamper-evidence.md)** — provides the integrity proof the audit's *has the record been altered* answer is read from. The application maintains exactly one Tamper Evidence instance (the seal store) sealing over ranges of the audit log on a configured cadence.

---

## Composition logic

### Application state

The application owns emergent state that wires the four constituent atoms into one queryable audit surface:

- **`event_to_attestation`** — map from `event_id` to the `attestation_id` produced by Actor Identity at record time. Lets the auditor traverse from any event to its attribution without scanning.
- **`event_to_retention`** — map from `event_id` to the `retention_id` produced by Retention Window at record time. Lets the auditor read the policy under which the event is held.
- **`seal_coverage`** — for each `evidence_id` in the seal store, the contiguous range of `event_id`s (or equivalently, sequence-number range) the seal commits to. Lets the verifier present the correct record set to `verify`.
- **`sealed_through`** — the most recent `sequence_number` covered by any seal. Events with `sequence_number > sealed_through` are in the *unsealed tail*; the next seal cadence covers them.

### Configuration

- **`retention_policy`** — the policy reference applied at `record_action` time, or a policy selector function `(action_ref, actor_ref, data) → policy_ref` for content-derived rules (medical records under HIPAA, cardholder data under PCI DSS).
- **`seal_cadence`** — *per-event* (strongest, expensive), *interval-based* (every N events or every T seconds), or *on-demand* (the host calls `seal_now`). The cadence directly bounds the forensic window for any detected tampering — tighter cadence narrows the window.
- **`seal_mechanism`** — the Tamper Evidence mechanism (hash chain, Merkle tree, RFC 3161-anchored timestamp). Mechanism choice is implementation policy; the Tamper Evidence atom is neutral.

### Action wiring

The application exposes one *record* action that wraps all four constituents, plus *verify* and *purge* actions over the composed surface. Read-only queries (list events, fetch an event by id, walk attestations) pass through to the appropriate constituent without orchestration.

- **`record_action(action_ref, actor_ref, credential, data) → event_id | rejected(invalid-credential | invalid-request | recording-failure)`**
  1. `ActorIdentity.attest(action_ref, actor_ref, credential)` → `attestation_id` (or `rejected(invalid-credential | invalid-request)` — surfaced to the caller; nothing further is recorded).
  2. `EventLog.append({action_ref, actor_ref, attestation_id, data, recorded_at})` → `event_id`.
  3. `RetentionWindow.place_under_retention(event_id, retention_policy)` → `retention_id`.
  4. Record `event_to_attestation[event_id] = attestation_id` and `event_to_retention[event_id] = retention_id`.
  5. Under per-event cadence, immediately seal the singleton range; under interval cadence, defer to the next batch.
  6. Return `event_id`. If any of steps 2–4 fail after step 1 has succeeded, the application returns `rejected(recording-failure)` and the implementation must address the orphan attestation per the *Partial attestation on step failure* edge case.

- **`seal_now() → evidence_id | rejected(nothing-to-seal | mechanism-failure)`** — under interval or on-demand cadence, seals the current unsealed tail. Returns `rejected(nothing-to-seal)` if the unsealed tail is empty (no events since `sealed_through`); `rejected(mechanism-failure)` if the underlying seal mechanism is unavailable (hardware failure, TSA unreachable under anchored mode). The presented record set is the slice `[sealed_through + 1 .. tail]`; the call delegates to `TamperEvidence.seal(slice_ref, mechanism_credential)`, records `seal_coverage[evidence_id]` and advances `sealed_through`.

- **`verify_record(event_id, original_event_payload) → verified | failed-verification(reason) | not-known`**
  1. If `event_id` not present in the event log → `not-known`.
  2. `ActorIdentity.verify(event_to_attestation[event_id])` — propagates any `failed-verification(reason)` with the reason prefixed `attestation-` (e.g., `attestation-proof-invalid`).
  3. Locate the `evidence_id` whose `seal_coverage` includes `event_id`; if none, the event is in the unsealed tail — return `failed-verification(unsealed)` per the deployment's policy, or `verified` if unsealed events are acceptable for the verifier (configurable; the application names the choice).
  4. `TamperEvidence.verify(evidence_id, original_event_payload)` — propagates with the reason prefixed `seal-`. Note that the verifier must present the original record set the seal committed to; the application passes `original_event_payload` through.
  5. If retention is in *Purged* for the event, return `failed-verification(purged)` — the record is structurally gone and no integrity claim is possible. This is the expected outcome for events past their `purge_deadline`; the audit query distinguishes *lawfully destroyed* from *missing*.
  6. All checks pass → `verified`.

- **`purge_eligible() → list of event_ids`** and **`purge_event(event_id) → ok | rejected(not-known | not-eligible)`** — for any event whose retention has elapsed (`now ≥ retention_until`), the application cascades. Returns `rejected(not-known)` if the `event_id` is not in the log; `rejected(not-eligible)` if `now < retention_until` for the event. Deployments composing a Legal Hold pattern may additionally surface `rejected(under-legal-hold)` when a hold intercepts the cascade:
  1. `RetentionWindow.purge(retention_id)` — moves the retention Retained → Purged with `purged_at`.
  2. Destroy or tombstone the event in the Event Log per the deployment's chosen purge mechanism (direct deletion, tombstone, cryptographic shredding — see Edge cases).
  3. Mark the corresponding `seal_coverage` entry as *records-purged*. The seal record itself is retained as audit evidence of the destruction (a seal for a destroyed record set is structurally meaningless for content verification but remains useful for purge-record verification); when the seal's own retention elapses under a meta-retention policy, it too is purged.
  4. Retain the attestation record only as long as the underlying event's retention; on cascade, also purge the attestation per its meta-retention policy.

### The cascade-on-purge rule

The application's load-bearing wiring decision: when an event's retention elapses, the cascade purges the event, then the attestation (its meaning depends on the event), then marks the seal coverage as records-purged. The seal record itself outlives the cascade until its own meta-retention elapses — because the *fact* that a record existed and was lawfully destroyed is itself audit evidence the regulator queries. This matches Tamper Evidence's *retention coupling* edge case: tamper-evidence outlives the records it commits to only as far as the records are retained; cascading purge of evidence alongside records is the composing pattern's responsibility — this application is that pattern.

---

## Application-level invariants

These invariants emerge from the composition. None belongs to a single constituent atom; each requires the four atoms working together to hold.

- **Invariant 1 — Attribution coverage.** Every event in the audit log has a corresponding attestation: for every `event_id` in the log, `event_to_attestation[event_id]` references a recorded attestation, and the attestation's `action_ref` matches the event's `action_ref` and its `actor_ref` matches the event's `actor_ref`.
- **Invariant 2 — Retention coverage.** Every event in the audit log has a corresponding retention: for every `event_id` in the log, `event_to_retention[event_id]` references a recorded retention currently in either *Retained* or *Purged*.
- **Invariant 3 — Integrity coverage (modulo unsealed tail).** Every event in the audit log with `sequence_number ≤ sealed_through` is covered by exactly one seal in the seal store. The unsealed tail is observable as a bounded gap; tighter `seal_cadence` shrinks it. A seal whose coverage is subsequently marked *records-purged* still satisfies this coverage claim for events that have since been purged — the seal record persists as audit evidence of lawful destruction even when the content it committed to is gone.
- **Invariant 4 — Cascade-on-purge.** When an event is purged, its corresponding attestation is purged in the same cascade operation (per its meta-retention policy) and its `seal_coverage` entry is marked records-purged — either in a single transaction or via a compensating record that acknowledges and resolves any partial state. No retained event is left without attestation or integrity coverage; no purged event leaves dangling attestation or seal-content claims. The transactional boundary that enforces this is implementation-owned; see *Cross-store consistency under failure* in Edge cases.
- **Invariant 5 — Constituent invariants preserved.** All invariants from the four constituent atoms hold over their respective instances: Event Log's append-only and total order, Actor Identity's eight invariants (immutability, action binding, actor binding, non-repudiation contract, etc.), Retention Window's nine invariants (membership exclusivity, no early purge, retention window monotonicity, etc.), and Tamper Evidence's eight invariants (evidence immutability, detectability of tampering, record-set binding, etc.).
- **Invariant 6 — Forensic completability.** For any retained `event_id`, the application's audit query returns the action, the actor, the verified attestation, `sealed_at` of the most recent covering seal, the retention policy and deadlines, and `verify_record` returns one of `verified`, `failed-verification(reason)`, or `not-known` deterministically.
- **Invariant 7 — Verification asymmetry preserved.** `verify_record` requires the original event payload to be re-presented (inheriting Tamper Evidence's *verification self-containment given the originating records*); it does not require the actor's credential beyond the registry's public material (inheriting Actor Identity's *verification self-containment*). The asymmetry is intentional and surfaces at the application's API boundary.
- **Invariant 8 — Honest representation of destruction.** A `verify_record` result of `failed-verification(purged)` distinguishes *lawfully destroyed under retention policy* from *missing without record*; the latter does not occur — every event in the log is either *Retained* (verifiable against its seal and attestation) or *Purged* (with a retention record proving it was destroyed lawfully).

Attribution coverage and retention coverage together give the *complete-record* property — every event in the audit log has the metadata the regulator's first three questions need. Integrity coverage modulo unsealed tail names the cadence trade-off honestly. Cascade-on-purge is the wiring contract that prevents dangling state across the four stores. Honest representation of destruction is the property that distinguishes a *complete* audit trail from a *suspicious* one.

---

## Examples

### Walkthrough

A regulated bank deploys this application as the canonical audit trail for its core ledger. The application is configured with `retention_policy = sox_7_year`, `seal_cadence = every 1000 events or 60 seconds, whichever first`, `seal_mechanism = SHA-256 hash chain anchored hourly to RFC 3161 TSA`.

1. **A wire-transfer authorization arrives.** The system calls `record_action(wire_w91, supervisor_s12, supervisor_credential, {amount: 50000, counterparty: ...})`. The application invokes Actor Identity → `attestation_a44`; Event Log → `event_e9301`; Retention Window → `retention_r9301` with `retention_until = 2033-05-10`; the event lands in the unsealed tail. Returns `event_e9301`.
2. **The cadence fires.** Within 60 seconds, `seal_now` runs over the slice `[..e9301]`, the mechanism computes a hash-chain proof, the chain tail is anchored to the TSA, and `evidence_s127` is recorded with `anchored_at = 2026-05-10T14:33:00Z`. `sealed_through` advances.
3. **Six years later, a SOX §404 audit.** The auditor asks *"show me the supervisor authorization on wire w91, and prove it hasn't been altered."* The audit team queries `verify_record(e9301, original_event_payload)` with the event payload retrieved from cold storage. The application verifies the attestation against `s12`'s public material, locates `s127` as the covering seal, verifies the proof against the presented payload, and confirms retention is *Retained*. Returns `verified`. The auditor sees one structural answer to all four questions.
4. **Seven years and one month later.** The retention has elapsed. The application runs `purge_eligible` nightly; `e9301` is on the list. The cascade purges the event, the attestation, and marks `s127`'s coverage as records-purged. `verify_record(e9301, ...)` now returns `failed-verification(purged)` — the record is lawfully destroyed; the retention record `r9301` remains in *Purged* state as audit evidence that the destruction was lawful.
5. **A subsequent regulator inquiry.** *"What happened to wire w91?"* The auditor queries the retention store, finds `r9301` in *Purged* with `purged_at` within the lawful window, and the inquiry resolves to *lawfully destroyed under SOX §802 retention policy*. The seal store retains `s127` (now marked records-purged) under its own meta-retention until that elapses too.

### Banking — financial-controls audit under SOX §404

Every action against the general ledger — journal entries, control activations, exception overrides, period-close operations — is recorded with the controller's attested approval, retained 7 years per SOX §802, and sealed in a hash-chained log anchored to an RFC 3161 qualified TSA. The annual external auditor walks the audit trail without privileged access to the production database; `verify_record` over each in-scope action produces a structural answer the audit opinion is built on. The composition is what *"adequate internal controls"* operationally means.

### Healthcare — PHI access audit under HIPAA §164.312(b)

Every read of, write to, or amendment of protected health information is recorded with the accessing clinician's attestation (smart-card-bound credential under EPCS for controlled substances, regular EHR credential otherwise), retained for the longer of HIPAA's 6-year baseline or state law, and sealed in a per-patient Merkle tree. A patient's data-access request under §164.524 is answered by walking the patient's audit trail and producing the verified history. A breach investigation walks the same trail to identify when anomalous access began.

### Payments — cardholder-data access audit under PCI DSS Requirement 10

Every access to cardholder data, every account-data export, every key-management operation is recorded with the operator's attestation, retained per the shortest viable policy under PCI DSS Requirement 3.1, and HMAC-chained per Requirement 10.5. The annual QSA assessment runs `verify_record` over the prior year's high-risk actions; any tampering — to hide an exfiltration or to forge access for a fraudulent dispute — is detected from the trail itself.

### Pharmaceutical — batch-record audit under 21 CFR Part 11

Every change to an electronic batch record in a pharmaceutical manufacturing system — material additions, parameter adjustments, deviation reports, release approvals — is recorded with the operator's qualified electronic signature, retained per the predicate rule (often 7+ years), and sealed in a hash chain. An FDA inspection produces the verified history of any batch on demand; the *attributable, contemporaneous, original, accurate* ALCOA principles are the application's emergent property.

### Communications — broker-dealer audit under SEC Rule 17a-4

Every business communication (email, chat, voice transcript, trade message) at a registered broker-dealer is recorded with the originator's attestation, retained 3–7 years per Rule 17a-4 with the first two years in immediately-accessible storage (composing with a Storage Tier pattern), and Merkle-tree sealed. A FINRA examination walks the trail to confirm completeness; a litigation discovery walks the same trail to produce the verified history of any communication thread. WORM (Write-Once-Read-Many) storage is one mechanism this composition can be realized over; this application names the structural form.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

- **Regulator audit — "show me the complete, verifiable history of action X over the retention horizon."** The auditor queries the application for every event referencing action X. For each retained event, `verify_record` returns `verified` (with attestation and seal both checked); for each purged event, the retention record proves lawful destruction. Invariants 1, 2, 3, and 8 are the structural answer. The auditor does not consult source code, runbooks, or developer narration — every claim is verified from the records.
- **Disputed action — "I didn't do that."** The investigator retrieves the event, calls `verify_record`. If `verified`, the attestation binds the named actor to the named action at `attested_at` (Actor Identity's non-repudiation contract, propagated through Invariant 5). The actor cannot plausibly deny it without claiming credential compromise — and a Compromise Disclosure composing pattern handles that reinterpretation, never by mutating the trail.
- **Breach forensics — "when was the trail compromised?"** An incident responder walks the seal store in `sealed_at` order, running `verify_record` against representative events in each seal's coverage. The most recent seal that returns `verified` end-to-end and the next seal that returns `failed-verification(seal-proof-invalid)` bound the forensic window. Where the seals carry `anchored_at` from a TSA outside the adversary's reach, the upper bound on the time of tampering is independently established. The cadence governs the resolution; the four-atom stack governs the certainty.

---

## Edge cases and explicit non-goals

What this application does not cover:

- **Multi-instance Audit Trails.** A real system may have many audit trails (one per audited subsystem, one per jurisdictional scope). The application specifies one instance; multi-instance configuration, cross-instance query, and federation are deployment concerns. A higher-order Audit Federation pattern composes naturally.
- **Pre-attestation legacy events.** Events imported from a legacy system without verifiable attribution have no usable Actor Identity binding. The application accepts these only under an explicit legacy-import path that records a *system-asserted* attestation marker (no actor binding); the auditor reads such events as *attribution-deferred* rather than *attributed*. Subsequent legal review establishes whether the gap is acceptable for the audit horizon.
- **Seal cadence vs. write rate.** Tighter cadence (per-event) narrows the forensic window but increases the seal-store growth rate and verify-time cost; coarser cadence is cheaper but widens the window. Selection is a deployment-shaped concern. The application surfaces the trade-off; the deployment owns the choice.
- **Compromised credential mid-window.** If an actor's credential is compromised and the discovery is later than the compromise, attestations made during the compromise window verify but should be reinterpreted. The application does *not* retroactively invalidate (inheriting Actor Identity's contract); a Compromise Disclosure composing pattern produces *new* records that reframe the previously-verified attestations as untrustworthy. Required reading for breach response runbooks.
- **Policy disagreement across overlapping rules.** When multiple regulations apply to one event (HIPAA + state law + GDPR + GLBA), the *retention_policy* must reconcile to the longest applicable retention, the strictest data-minimization posture, and any conflicting destruction rules. A Policy Reconciliation composing pattern owns this; the application takes the reconciled `policy_ref` as input.
- **Right-to-be-forgotten vs. retention obligation.** A GDPR Article 17 erasure request can collide with a regulatory retention obligation (HIPAA, SOX). The application does not adjudicate; an Erasure Coordination composing pattern (with legal counsel in the loop) decides whether to honor the request, cryptographically shred the personal-data fields while preserving the structural audit record, or document the retention override.
- **Legal hold suspension of purge.** Pending litigation or investigation must suspend `purge_eligible` for the affected scope. A Legal Hold composing pattern intercepts purges and rejects them while the hold is active; the application's cascade defers until the hold is released.
- **Storage tier (active vs. cold).** SEC Rule 17a-4's *first two years immediately accessible* is orthogonal to retention obligation and to integrity. A Storage Tier composing pattern owns the active-to-cold transition; the application's `verify_record` accepts records retrieved from either tier identically.
- **Durability across crashes.** The application's emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) must persist atomically with each successful `record_action`. A crash that records the event in Event Log but not in the application's maps leaves a dangling event without attribution linkage — a defect. The implementor owns the transactional boundary; the spec assumes it.
- **Cross-store consistency under failure.** If `EventLog.append` succeeds but `RetentionWindow.place_under_retention` fails, the application is in an invariant-violating state (an event in the log without retention). The implementation must order operations so that either all four constituent calls succeed atomically or the application records the failure as a *recording-failure* event that itself attests to the partial state. Two-phase commit, saga compensation, or single-transaction storage all satisfy; the spec names the requirement, the implementation chooses the mechanism.
- **Verification of the unsealed tail.** Events in the tail (between `sealed_through` and the current append point) are not yet covered by a seal. The application's `verify_record` returns `failed-verification(unsealed)` for these under strict mode, or `verified` under lenient mode (where the deployment accepts the per-event Event Log immutability as sufficient until the next seal cadence). The choice is deployment policy; the spec surfaces it.
- **Failed attribution attempts.** A `record_action` call rejected at step 1 (Actor Identity rejects the credential) leaves no trace in the audit log — the attempt is not recorded. For high-assurance deployments where failed attribution attempts are themselves auditable events (an insider retrying with forged credentials, for example), a Failed-Attempt Log composing pattern records the rejected attempt as its own event. This application does not absorb that concern: its audit surface is committed actions, not attempted actions.
- **Partial attestation on step failure.** If step 1 (Actor Identity.attest) succeeds but step 2 (EventLog.append) fails, an attestation record exists in the Actor Identity store with no corresponding event in the audit log — an orphan attestation. Actor Identity's records are immutable once committed (by design), so synchronous rollback is not available. The implementation must flag the orphan, return `rejected(recording-failure)` to the caller, and treat the orphan as an anomaly requiring resolution — either a compensating tombstone record or manual investigation. High-assurance deployments should treat any unresolved orphan attestation as a gap in the audit surface and alert accordingly.
- **Clock source for cadence and purge.** The application uses `now` in two places it directly owns: the `seal_cadence` timer and `purge_eligible`'s `now ≥ retention_until` comparison. The authoritative source of `now` for both is deployment-shaped: the deployer configures the clock (system clock, GPS-disciplined clock, NTP-synchronized cluster clock) and must ensure it is monotonically non-decreasing. Clock skew across nodes in a distributed deployment can cause non-deterministic `purge_eligible` results and inconsistent cadence firing; the deployer owns the monotonicity guarantee. For deployments composing a Trusted Timestamping pattern, the TSA's anchored time may serve as the authoritative source; that composing pattern owns the clock-authority contract.

Where the composition breaks down: when the four constituent stores share an adversary with write access to all of them and external anchoring is absent; when the host environment cannot supply a stable, reproducibly-addressable record set at verify time (mutable event payloads under non-versioned references); when the retention policy and the integrity-coverage cadence are mismatched (events purged before their covering seal is verified against them); when the actor registry's historical public material is not retained and old attestations begin failing verification under a new key.

---

## Standards references

This composition is the structural form of what every major audit regime requires:

- **SOX §404 (Internal control over financial reporting)** and **§802 (Records-retention)** — financial-system audit trails with 7-year retention and anti-shredding protection. The application is the operational form.
- **HIPAA §164.312(b) (Audit controls)** and **§164.530(j) (Documentation retention)** — record-and-examine PHI access; retain the audit documentation. Composes with state-law retention extensions.
- **PCI DSS Requirement 10 (Track and monitor all access)** — including 10.2 (audit-log content), 10.3 (audit-log entries), 10.5 (secure audit trails so they cannot be altered), and 10.7 (audit-trail retention). The composition is the structural form across all four sub-requirements.
- **21 CFR Part 11 (Electronic records and electronic signatures)** — *attributable, contemporaneous, original, accurate* (ALCOA) plus *complete, consistent, enduring, available* (ALCOA+). The four-atom stack is the structural form of every ALCOA+ property simultaneously.
- **SEC Rule 17a-4 / FINRA Rule 4511** — broker-dealer record retention with access-tier requirements. Composes with Storage Tier.
- **ISO/IEC 27001 §A.12.4 (Logging and monitoring)** — the international information-security baseline. The composition satisfies §A.12.4.1 (event logging), §A.12.4.2 (protection of log information), §A.12.4.3 (administrator and operator logs), and §A.12.4.4 (clock synchronization, via Trusted Timestamping composition) at once.
- **GDPR Article 30 (Records of processing activities)** and **Article 32 (Security of processing)** — Article 30's records-of-processing obligation and Article 32's integrity property of processing both map onto the application.
- **eIDAS Regulation (EU 910/2014)** — qualified preservation services. The composition is one shape a qualified preservation service can take, with `anchored_at` from a qualified TSA giving the eIDAS-grade time anchor.
- **DoD 5015.02-STD** — the U.S. government records-management software baseline. The application's separation of attribution, retention, and integrity matches DoD 5015's architecture.
- **NIST SP 800-92 (Guide to Computer Security Log Management)** — names attribution, integrity, and retention as baseline log-management properties.
- **Basel III BCBS 239 (Principles for effective risk-data aggregation and risk reporting)** — the audit-trail integrity principles for banking risk data.

The four atoms it composes carry their own deep standards inheritance — see each constituent's Standards references.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the composition discipline: an application is the wiring of freestanding concepts, not a new primitive.
- **The audit-grade systems literature** — every industrial audit framework (COSO, COBIT, SOC 2) names attribution, integrity, retention, and event recording as the four pillars of audit. The application is the formal composition the frameworks assume but never specify.
- **Tamper-evident logging literature** (Schneier and Kelsey 1999; *Secure Audit Logs to Support Computer Forensics*) — the original formal framing of cryptographically-protected audit logs.

---

## Generation acceptance

A derived implementation of Audit Trail is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the application's emergent state plus the four constituent stores, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Answer all four audit questions for any event.** From `event_id`: what (Event Log's data field), who (Actor Identity's verified attestation), integrity (Tamper Evidence's verified seal over the event range), retention (Retention Window's record). The composition's verify surface is the regulator's actual question.
- **Verify all eight application-level invariants over the record set.** Attribution coverage, retention coverage, integrity coverage modulo unsealed tail, cascade-on-purge, constituent invariants preserved, forensic completability, verification asymmetry preserved, honest representation of destruction.
- **Verify each constituent atom's Generation acceptance bar over its own instance.** Event Log's append-only and total order, Actor Identity's five-check bar, Retention Window's five-check bar, Tamper Evidence's six-check bar — all satisfied independently and observable from each constituent's records.
- **Bound the forensic window of any detected tampering.** Using Tamper Evidence's per-seal verification cascade, the auditor identifies the latest verified seal and the first failed seal; the cadence and the seals' `sealed_at` (and `anchored_at` where present) give the window.
- **Distinguish lawfully destroyed from missing.** `verify_record` returning `failed-verification(purged)` is backed by a Retention Window record in *Purged* state; *missing* — an event with no retention record at all — does not occur and the auditor sees the absence as a structural guarantee.
- **Identify the composing patterns active in this deployment.** Whether External Anchoring, Trusted Timestamping, Storage Tier, Legal Hold, Compromise Disclosure, Erasure Coordination, Policy Reconciliation, and Mechanism Registry are wired in, and with what configuration.

This is the generator's contract: any code generated from this application must produce records and a runtime surface that pass the six checks above. The bar is the regulator's question — *"can you prove what happened, who did it, when, that it hasn't been altered, and that the retention obligation was honored?"* — answered structurally from the records and the proofs, not procedurally from runtime claims.

---

## Status

`grounded` — composition logic specified across all four constituent atoms; emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) named; action wiring covers record, seal, verify, and cascading purge with fully-named rejection taxonomies; eight application-level invariants stated and justified; walkthrough plus five cross-domain examples (banking SOX, healthcare HIPAA + 21 CFR Part 11, payments PCI DSS, pharmaceutical 21 CFR Part 11, broker-dealer SEC Rule 17a-4) and three adversarial scenarios; eleven edge cases (multi-instance, legacy events, cadence trade-off, credential compromise, policy reconciliation, right-to-erasure, legal hold, storage tier, durability, cross-store consistency, unsealed-tail policy, failed attribution attempts, partial attestation on step failure, clock source for cadence and purge); Generation acceptance bar explicit. Third entry in `compositions/`. Survived one foundation pass and one refinement round.

---

## Lineage notes

This application survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md)) on its first iteration. The two regulated-pattern conventions canonicalized in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md) — *Regulated adversarial scenarios* and *Generation acceptance* — were baked in from the first draft. The composition pattern (wrap each constituent's action behind one application-level action, name emergent state, preserve each constituent's invariants, surface cross-atom invariants explicitly) follows the structural template Idempotent Reservation established and extends it to four constituents.

**Structural milestone.** This application is the destination the library has been building toward since the first regulated atom landed. With Event Log, Actor Identity, Retention Window, and Tamper Evidence all grounded as freestanding atoms, the four-constituent composition becomes available — what SOX §404, HIPAA §164.312(b), PCI DSS Requirement 10, 21 CFR Part 11, SEC Rule 17a-4, and ISO/IEC 27001 §A.12.4 all require but none name as a single composable concept. The forthcoming-link references each constituent carried (*"the canonical regulated-audit stack composes [the four] as four freestanding atoms; the Audit Trail application is the wiring"*) are now resolved.

**Pass 1 — Structural completeness (GRID).** Clean. All nine GRID nodes resolved with their references intact. As with Idempotent Reservation, the user-level Flow is captured in the Walkthrough example rather than as a dedicated Flow subsection — the per-action wiring under Composition logic carries the substantive structure. Application state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) is named explicitly, with cascade-on-purge governing its lifecycle — no orphan state.

**Pass 2 — Conceptual independence (EOS).** Clean. The application is properly scoped: it composes the four atoms without absorbing concerns that belong to additional atoms. Eight concerns named under Edge cases (multi-instance federation, legacy-import attribution, cadence vs. write rate, credential compromise reinterpretation, policy reconciliation, right-to-erasure adjudication, legal hold suspension, storage tier) are correctly named as deployment-shaped concerns or future composing patterns rather than folded in. The temptation to absorb policy reconciliation into the application was real — multi-rule overlap is endemic to regulated audit — but reconciliation recurs across every regulated atom that takes a policy reference (Retention Window already names it; this application would just re-derive it) and is correctly externalized.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern:

- *Verify asymmetry surfaced at the application boundary.* Early drafts hid Tamper Evidence's `verify(evidence_id, original_record_set)` second argument inside the application, presenting a `verify_record(event_id)` API that fetched the payload internally. Pass 3 caught it: the asymmetry is structural and the verifier must know they are presenting the record set, not trusting the application to fetch it. Resolved: `verify_record(event_id, original_event_payload)` with the payload as an explicit second argument, Invariant 7 naming the asymmetry, and the walkthrough showing the auditor retrieving the payload from cold storage rather than from the live system.
- *Cascade-on-purge wiring was implicit.* The first draft assumed events, attestations, and seals would purge in step but did not specify which store cascades to which. Pass 3 caught it: an event purged without its attestation purged leaves the attestation referring to a destroyed action, and an event purged without its seal coverage updated leaves a seal that cannot be verified. Resolved: explicit *cascade-on-purge rule* subsection naming the order — event, then attestation per meta-retention, then seal coverage marked records-purged — and Invariant 4 making the contract verifiable from the records.
- *Unsealed-tail policy was undefined.* Events not yet covered by a seal sit in the tail; the first draft did not say what `verify_record` returns for these. Resolved: explicit *strict* vs. *lenient* mode in Action wiring and Edge cases, with the deployment owning the choice. Strict mode treats unsealed events as integrity-unverified; lenient mode accepts per-event Event Log immutability as sufficient until the cadence catches up.
- *Honest representation of destruction.* The first draft treated `failed-verification(purged)` and `not-known` as undistinguished. Pass 3 caught it: lawful destruction and missing record are very different audit outcomes, and the application must distinguish them. Resolved: Invariant 8 (*honest representation of destruction*) names the contract; the cascade-on-purge rule guarantees that every purged event leaves a retention record in *Purged*; `not-known` is reserved for *event_id not in the log at all* (which, given Event Log's append-only invariant, only happens when the caller has a fabricated id).

Three deferred concerns are named as explicit out-of-scope rather than fixed in-pattern: durability of the application's emergent state (deployment-shaped), cross-store consistency under partial failure (transactional boundary owned by the implementation), and unsealed-tail policy selection (deployment policy). Each is correctly external to the composition.

The three passes together exercise the architecture as designed: GRID checks structural completeness of a four-atom composition (no missing wiring; every emergent property has a named state component); EOS keeps the application from absorbing the eight concerns that recur across regulated audit and belong elsewhere; Linus catches the four hidden contracts (verify asymmetry at the boundary, cascade order, unsealed-tail semantics, honest representation of destruction) that would otherwise hide beneath the *"just compose the four atoms"* summary. The application is stronger because all three checks happened.

**Refinement round 1 — re-run of all three passes.** Eight findings, all closed in-pattern:

- *Action signature incompleteness (Pass 1 / Pass 3).* Three actions carried `rejected(reason)` as a placeholder rather than a named rejection taxonomy: `record_action` (only Actor Identity's reasons listed; `recording-failure` absent), `seal_now` (no reasons at all), `purge_event` (no reasons). Resolved: `record_action` now enumerates `rejected(invalid-credential | invalid-request | recording-failure)`; `seal_now` enumerates `rejected(nothing-to-seal | mechanism-failure)`; `purge_event` enumerates `rejected(not-known | not-eligible)`, with a note that Legal Hold composition adds `under-legal-hold`.
- *Failed attribution attempts leave no trace (Pass 3).* A `record_action` rejected at step 1 is silent in the audit log. The spec had not named this. Resolved: explicit edge case (*Failed attribution attempts*) stating that attempted-but-rejected actions are out of scope for this application, with a Failed-Attempt Log composing pattern named as the resolution for high-assurance deployments.
- *Orphan attestation on step failure (Pass 3).* If Actor Identity.attest (step 1) succeeds but EventLog.append (step 2) fails, an immutable orphan attestation exists with no corresponding event. Not previously addressed. Resolved: new edge case (*Partial attestation on step failure*) naming the gap, noting that Actor Identity's immutability forecloses rollback, and specifying that the implementation must flag and resolve the orphan; `record_action`'s step 6 updated to reference this case.
- *Invariant 4 atomicity claim inconsistency (Pass 3).* The invariant said "same cascade step" — an atomicity claim — but the spec explicitly defers the transactional boundary to the implementation. The absoluteness of the invariant contradicted the deferral. Resolved: "same cascade step" replaced with "same cascade operation — either in a single transaction or via a compensating record," and a cross-reference to the *Cross-store consistency under failure* edge case added.
- *Invariant 3 silent on records-purged seals (Pass 3).* The invariant required every event with `sequence_number ≤ sealed_through` to be covered by a seal, but did not address events whose covering seal is subsequently marked records-purged. A strict reading suggested those events violated the invariant after purge. Resolved: clarifying sentence added stating that records-purged seals still satisfy coverage for events that have since been purged — the seal persists as destruction evidence.
- *Clock source for cadence and purge_eligible (Pass 3).* The application uses `now` for the seal cadence timer and the `now ≥ retention_until` comparison in `purge_eligible`. The authoritative clock source was unspecified. Resolved: new edge case (*Clock source for cadence and purge*) naming the deployment-shaped nature of the clock authority, the monotonicity requirement, and the Trusted Timestamping composing pattern as the resolution for deployments requiring an authoritative external source.

Pass 2 was clean on this refinement round: no new over-absorptions surfaced. The six fixes are all in-pattern resolutions or new edge-case entries; none required extraction of a new atom.
