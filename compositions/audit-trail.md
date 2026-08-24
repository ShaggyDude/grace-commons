---
title: Audit Trail
parent: Conceptual Compositions
nav_order: 3
has_toc: true
toc: true
---

# Audit Trail

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Audit Trail answers, all at once, the four questions a regulator or investigator asks about any consequential action: what happened, who authorized it, has the record been altered, and was it kept long enough?

It does this by combining four simpler patterns into one queryable record: an add-only event log (what happened), cryptographic attribution tying each event to the actor who performed it (who), tamper-evident sealing that makes any after-the-fact change detectable (has it been altered), and a retention policy that fixes how long records must be kept (kept long enough).

None of the four answers the full question alone — the event log does not name the actor, the attribution does not protect integrity, the retention does not detect rewriting, the sealing does not name the actor — but stacked together they produce a record that is observable, attributable, tamper-evident, and lifetime-bounded.

Combining them also produces guarantees none has alone: every event is simultaneously logged, attributed, retention-tracked, and sealed; when retention expires, all four are purged together so no dangling references remain; and a query on any kept event returns a definite, verifiable answer that distinguishes a lawfully destroyed record from a missing one.

This is the canonical audit primitive behind financial-controls, healthcare-access, cardholder-data, and broker-dealer audit requirements, and it is reused as a building block by other compositions.

---

## Intent

Every regulated system carries the same obligation: when the auditor arrives, the system must be able to answer four questions about any action of consequence — *what happened, who authorized it, has the record been altered, and was the retention obligation honored?* Each question maps cleanly onto one of the four constituent atoms; the auditor's actual ask is all four at once, for any record, on demand, over the regulatory horizon.

The composition addresses what the four atoms cannot answer alone. Event Log records the fact but does not bind it to an actor. Actor Identity binds the actor but does not commit to the records' integrity. Retention Window bounds the lifetime but does not detect rewriting. Tamper Evidence detects rewriting but does not name the actor. Stacked correctly, the four answer the regulator's question in one structure: an [Audit Record] that is observable, attributable, integrity-protected, and lifetime-bounded.

This is a composition, not a new primitive. The four atoms are unchanged; the composition is the wiring that makes them coherent — one consolidated audit surface rather than four parallel record stores the auditor has to correlate by hand. The construction is the same one that runs in every audit-grade system in production today: signed events appended to an immutable (unchangeable once written) log, sealed periodically against a tamper-evident structure, governed by a retention policy with a structural no-early-purge guarantee. Different vocabularies; identical mechanic.

---

## Composes

- **[Event Log](../atoms/event-log.md)** — provides the append-only, totally-ordered sequence the audit's *what happened* answer is read from. The composition maintains exactly one Event Log instance (the audit log).
- **[Actor Identity](../atoms/actor-identity.md)** — provides the verifiable attribution the audit's *who authorized it* answer is read from. The composition maintains exactly one Actor Identity instance (the attestation store).
- **[Retention Window](../atoms/retention-window.md)** — provides the policy-bounded lifetime the audit's *was the retention honored* answer is read from. The composition maintains one Retention Window instance configured with the host's regulatory policy (or a policy selector for content-derived rules).
- **[Tamper Evidence](../atoms/tamper-evidence.md)** — provides the integrity proof the audit's *has the record been altered* answer is read from. The composition maintains exactly one Tamper Evidence instance (the seal store) sealing over ranges of the audit log on a configured cadence.

---

## Composition logic

### Composition state

The composition owns emergent state that wires the four constituent atoms into one queryable audit surface:

- **`event_to_attestation`** — map from `event_id` to the `attestation_id` produced by Actor Identity at record time. Lets the auditor traverse from any event to its attribution without scanning.
- **`event_to_retention`** — map from `event_id` to the `retention_id` produced by Retention Window at record time. Lets the auditor read the policy under which the event is held.
- **`seal_coverage`** — for each `evidence_id` in the seal store, the contiguous range of `event_id`s (or equivalently, sequence-number range) the seal commits to. Lets the verifier present the correct record set to `verify`.
- **`sealed_through`** — the most recent `sequence_number` covered by any seal. Events with `sequence_number > sealed_through` are in the *unsealed tail*; the next seal cadence covers them.

### Configuration

- **`retention_policy`** — the policy reference applied at [Record Action] time, or a policy selector function `(action_ref, actor_ref, data) → policy_ref` for content-derived rules (medical records under HIPAA, cardholder data under PCI DSS).
- **`seal_cadence`** — *per-event* (strongest, expensive), *interval-based* (every N events or every T seconds), or *on-demand* (the host calls [Seal Now]). The cadence directly bounds the forensic window for any detected tampering — tighter cadence narrows the window.
- **`seal_mechanism`** — the Tamper Evidence mechanism (hash chain, Merkle tree, RFC 3161-anchored timestamp — RFC 3161 is the Internet standard for trusted time-stamping). Mechanism choice is implementation policy; the Tamper Evidence atom is neutral.

### Action wiring

The composition exposes one *record* action that wraps all four constituents, plus *verify* and *purge* actions over the composed surface. Read-only queries (list events, fetch an event by id, walk attestations) pass through to the appropriate constituent without orchestration.

- **[Record Action]** — (Projected contract: `record_action(action_ref, actor_ref, credential, data) → event_id | rejected(invalid-credential | invalid-request | recording-failure)`)
  1. `ActorIdentity.attest(action_ref, actor_ref, credential)` → `attestation_id` (or `rejected(invalid-credential | invalid-request)` — surfaced to the caller; nothing further is recorded).
  2. `EventLog.append({action_ref, actor_ref, attestation_id, data})` → `event_id`. The composition does not supply `recorded_at`; Event Log stamps it at its own seam from the host-injected clock (per Event Log's Identity model / Inputs and the Logic Confinement Principle). Where the audit event's timestamp is read back later, it is Event Log's stamped `recorded_at`. If a business event-time is needed it lives inside the opaque `data`, distinct from Event Log's `recorded_at`. `EventLog.append`'s `storage-failure` maps to the composition's [Recording Failure]; `invalid-payload` is unreachable because the composition constructs a well-formed payload.
  3. `RetentionWindow.place_under_retention(event_id, retention_policy)` → `retention_id`.
  4. Record `event_to_attestation[event_id] = attestation_id` and `event_to_retention[event_id] = retention_id`.
  5. Under per-event cadence, immediately seal the singleton range; under interval cadence, defer to the next batch.
  6. Return `event_id`. If any of steps 2–4 fail after step 1 has succeeded, the composition returns `rejected(recording-failure)` (step 2's `storage-failure` surfaces here; `invalid-payload` is unreachable) and the implementation must address the orphan attestation per the *Partial attestation on step failure* edge case.

- **[Seal Now]** — (Projected contract: `seal_now() → evidence_id | rejected(nothing-to-seal | mechanism-failure)`) — under interval or on-demand cadence, seals the current unsealed tail. Returns [Nothing To Seal] if the unsealed tail is empty (no events since `sealed_through`); [Mechanism Failure] if the underlying seal mechanism is unavailable (hardware failure, TSA unreachable under anchored mode). The presented record set is the slice `[sealed_through + 1 .. tail]`; the call delegates to `TamperEvidence.seal(slice_ref, mechanism_credential)`, records `seal_coverage[evidence_id]` and advances `sealed_through`.

- **[Verify Record]** — (Projected contract: `verify_record(event_id, original_event_payload) → verified | failed-verification(reason) | not-known`)
  1. If `event_id` not present in the event log → `not-known`.
  2. `ActorIdentity.verify(event_to_attestation[event_id])` — propagates any `failed-verification(reason)` with the reason prefixed `attestation-` (e.g., `attestation-proof-invalid`).
  3. Locate the `evidence_id` whose `seal_coverage` includes `event_id`; if none, the event is in the unsealed tail — return `failed-verification(unsealed)` per the deployment's policy, or `verified` if unsealed events are acceptable for the verifier (configurable; the composition names the choice).
  4. `TamperEvidence.verify(evidence_id, original_event_payload)` — propagates with the reason prefixed `seal-`. Note that the verifier must present the original record set the seal committed to; the composition passes `original_event_payload` through. An absent or wrong presented payload surfaces as `failed-verification(seal-record-set-mismatch)`, propagated from Tamper Evidence; this is distinct from the composition's own `not-known`, which is reserved for a fabricated `event_id` (lookup miss at step 1 only).
  5. If retention is in *Purged* for the event, return `failed-verification(purged)` — the record is structurally gone and no integrity claim is possible. This is the expected outcome for events past their `purge_deadline`; the audit query distinguishes *lawfully destroyed* from *missing*.
  6. All checks pass → `verified`.

- **[Purge Eligible]** — (Projected contract: `purge_eligible() → list of event_ids`) and **[Purge Event]** — (Projected contract: `purge_event(event_id) → ok | rejected(not-known | not-eligible)`) — for any event whose retention has elapsed (`now ≥ retention_until`), the composition cascades (triggers a secondary effect automatically from a primary event). Returns `rejected(not-known)` if the `event_id` is not in the log; [Not Eligible] if `now < retention_until` for the event. Deployments composing a Legal Hold (a legally mandated preservation order suspending normal deletion) pattern may additionally surface `rejected(under-legal-hold)` when a hold intercepts the cascade:
  1. `RetentionWindow.purge(retention_id)` — moves the retention Retained → Purged with `purged_at`.
  2. Destroy or tombstone the event in the Event Log per the deployment's chosen purge mechanism (direct deletion, tombstone, cryptographic shredding — see Edge cases).
  3. Mark the corresponding `seal_coverage` entry as *records-purged*. The seal record itself is retained as audit evidence of the destruction (a seal for a destroyed record set is structurally meaningless for content verification but remains useful for purge-record verification); when the seal's own retention elapses under a meta-retention policy, it too is purged.
  4. Retain the attestation record only as long as the underlying event's retention; on cascade, also purge the attestation per its meta-retention policy.

### The cascade-on-purge rule

The composition's load-bearing wiring decision: when an event's retention elapses, the cascade purges the event, then the attestation (its meaning depends on the event), then marks the seal coverage as records-purged. The seal record itself outlives the cascade until its own meta-retention elapses — because the *fact* that a record existed and was lawfully destroyed is itself audit evidence the regulator queries. This matches Tamper Evidence's *retention coupling* edge case: tamper-evidence outlives the records it commits to only as far as the records are retained; cascading purge of evidence alongside records is the composing pattern's responsibility — this composition is that pattern.

---

## Composition-level invariants

These invariants (conditions that must always hold) emerge from the composition. None belongs to a single constituent atom; each requires the four atoms working together to hold.

- **Invariant 1 — Attribution coverage.** Every event in the audit log has a corresponding attestation: for every `event_id` in the log, `event_to_attestation[event_id]` references a recorded attestation, and the attestation's `action_ref` matches the event's `action_ref` and its `actor_ref` matches the event's `actor_ref`.
- **Invariant 2 — Retention coverage.** Every event in the audit log has a corresponding retention: for every `event_id` in the log, `event_to_retention[event_id]` references a recorded retention currently in either *Retained* or *Purged*.
- **Invariant 3 — Integrity coverage (modulo unsealed tail).** Every event in the audit log with `sequence_number ≤ sealed_through` is covered by exactly one seal in the seal store. The unsealed tail is observable as a bounded gap; tighter `seal_cadence` shrinks it. A seal whose coverage is subsequently marked *records-purged* still satisfies this coverage claim for events that have since been purged — the seal record persists as audit evidence of lawful destruction even when the content it committed to is gone.
- **Invariant 4 — Cascade-on-purge.** When an event is purged, its corresponding attestation is purged in the same cascade operation (per its meta-retention policy) and its `seal_coverage` entry is marked records-purged — either in a single transaction or via a compensating record that acknowledges and resolves any partial state. No retained event is left without attestation or integrity coverage; no purged event leaves dangling attestation or seal-content claims. The transactional boundary that enforces this is implementation-owned; see *Cross-store consistency under failure* in Edge cases.
- **Invariant 5 — Constituent invariants preserved.** All invariants from the four constituent atoms hold over their respective instances: Event Log's append-only and total order, all Actor Identity's invariants (immutability, action binding, actor binding, non-repudiation contract, attestation durability, etc.), all Retention Window's invariants (membership exclusivity, no early purge, retention window monotonicity, retention store durability, etc.), and all Tamper Evidence's invariants (evidence immutability, detectability of tampering, record-set binding, seal store durability, etc.).
- **Invariant 6 — Forensic completability** (an investigator can reconstruct the full history from records alone). For any retained `event_id`, the composition's audit query returns the action, the actor, the verified attestation, `sealed_at` of the most recent covering seal, the retention policy and deadlines, and [Verify Record] returns one of `verified`, `failed-verification(reason)`, or `not-known` deterministically.
- **Invariant 7 — Verification asymmetry preserved.** [Verify Record] requires the original event payload to be re-presented (inheriting Tamper Evidence's *verification self-containment given the originating records*); it does not require the actor's credential beyond the registry's public material (inheriting Actor Identity's *verification self-containment*). The asymmetry is intentional and surfaces at the composition's API boundary.
- **Invariant 8 — Honest representation of destruction.** A [Verify Record] result of `failed-verification(purged)` distinguishes *lawfully destroyed under retention policy* from *missing without record*; the latter does not occur — every event in the log is either *Retained* (verifiable against its seal and attestation) or *Purged* (with a retention record proving it was destroyed lawfully).

Attribution coverage and retention coverage together give the *complete-record* property — every event in the audit log has the metadata the regulator's first three questions need. Integrity coverage modulo unsealed tail names the cadence trade-off honestly. Cascade-on-purge is the wiring contract that prevents dangling state across the four stores. Honest representation of destruction is the property that distinguishes a *complete* audit trail from a *suspicious* one.

---

## Examples

### Walkthrough

A regulated bank deploys this composition as the canonical audit trail for its core ledger. The composition is configured with `retention_policy = sox_7_year`, `seal_cadence = every 1000 events or 60 seconds, whichever first`, `seal_mechanism = SHA-256 hash chain anchored hourly to RFC 3161 TSA` (SHA-256 is a standard cryptographic hash function; a TSA is a Time-Stamp Authority — a trusted third party that signs proofs of when data existed).

1. **A wire-transfer authorization arrives.** The system calls `record_action(wire_w91, supervisor_s12, supervisor_credential, {amount: 50000, counterparty: ...})`. The composition invokes Actor Identity → `attestation_a44`; Event Log → `event_e9301`; Retention Window → `retention_r9301` with `retention_until = 2033-05-10`; the event lands in the unsealed tail. Returns `event_e9301`.
2. **The cadence fires.** Within 60 seconds, [Seal Now] runs over the slice `[..e9301]`, the mechanism computes a hash-chain proof, the chain tail is anchored to the TSA, and `evidence_s127` is recorded with `anchored_at = 2026-05-10T14:33:00Z`. `sealed_through` advances.
3. **Six years later, a SOX §404 audit.** The auditor asks *"show me the supervisor authorization on wire w91, and prove it hasn't been altered."* The audit team queries `verify_record(e9301, original_event_payload)` with the event payload retrieved from cold storage. The composition verifies the attestation against `s12`'s public material, locates `s127` as the covering seal, verifies the proof against the presented payload, and confirms retention is *Retained*. Returns `verified`. The auditor sees one structural answer to all four questions.
4. **Seven years and one month later.** The retention has elapsed. The composition runs [Purge Eligible] nightly; `e9301` is on the list. The cascade purges the event, the attestation, and marks `s127`'s coverage as records-purged. `verify_record(e9301, ...)` now returns `failed-verification(purged)` — the record is lawfully destroyed; the retention record `r9301` remains in *Purged* state as audit evidence that the destruction was lawful.
5. **A subsequent regulator inquiry.** *"What happened to wire w91?"* The auditor queries the retention store, finds `r9301` in *Purged* with `purged_at` within the lawful window, and the inquiry resolves to *lawfully destroyed under SOX §802 retention policy*. The seal store retains `s127` (now marked records-purged) under its own meta-retention until that elapses too.

### Banking — financial-controls audit under SOX §404

Every action against the general ledger — journal entries, control activations, exception overrides, period-close operations — is recorded with the controller's attested approval, retained 7 years per SOX §802, and sealed in a hash-chained log anchored to an RFC 3161 qualified TSA. The annual external auditor walks the audit trail without privileged access to the production database; [Verify Record] over each in-scope action produces a structural answer the audit opinion is built on. The composition is what *"adequate internal controls"* operationally means.

### Healthcare — PHI (Protected Health Information — individually identifiable health data) access audit under HIPAA §164.312(b)

Every read of, write to, or amendment of protected health information is recorded with the accessing clinician's attestation (smart-card-bound credential under EPCS — Electronic Prescriptions for Controlled Substances — for controlled substances, regular EHR — Electronic Health Record — credential otherwise), retained for the longer of HIPAA's 6-year baseline or state law, and sealed in a per-patient Merkle tree. A patient's data-access request under §164.524 is answered by walking the patient's audit trail and producing the verified history. A breach investigation walks the same trail to identify when anomalous access began.

### Payments — cardholder-data access audit under PCI DSS Requirement 10

Every access to cardholder data, every account-data export, every key-management operation is recorded with the operator's attestation, retained per the shortest viable policy under PCI DSS Requirement 3.1, and HMAC-chained per Requirement 10.5. The annual QSA assessment runs [Verify Record] over the prior year's high-risk actions; any tampering — to hide an exfiltration or to forge access for a fraudulent dispute — is detected from the trail itself.

### Pharmaceutical — batch-record audit under 21 CFR Part 11

Every change to an electronic batch record in a pharmaceutical manufacturing system — material additions, parameter adjustments, deviation reports, release approvals — is recorded with the operator's qualified electronic signature, retained per the predicate rule (often 7+ years), and sealed in a hash chain. An FDA inspection produces the verified history of any batch on demand; the *attributable, contemporaneous, original, accurate* ALCOA principles are the composition's emergent property.

### Communications — broker-dealer audit under SEC Rule 17a-4

Every business communication (email, chat, voice transcript, trade message) at a registered broker-dealer is recorded with the originator's attestation, retained 3–7 years per Rule 17a-4 with the first two years in immediately-accessible storage (composing with a Storage Tier pattern), and Merkle-tree sealed. A FINRA (Financial Industry Regulatory Authority) examination walks the trail to confirm completeness; a litigation discovery walks the same trail to produce the verified history of any communication thread. WORM (Write-Once-Read-Many) storage is one mechanism this composition can be realized over; this composition names the structural form.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

- **Regulator audit — "show me the complete, verifiable history of action X over the retention horizon."** The auditor queries the composition for every event referencing action X. For each retained event, [Verify Record] returns `verified` (with attestation and seal both checked); for each purged event, the retention record proves lawful destruction. Invariants 1, 2, 3, and 8 are the structural answer. The auditor does not consult source code, runbooks, or developer narration — every claim is verified from the records.
- **Disputed action — "I didn't do that."** The investigator retrieves the event, calls [Verify Record]. If `verified`, the attestation binds the named actor to the named action at `attested_at` (Actor Identity's non-repudiation contract, propagated through Invariant 5). The actor cannot plausibly deny it without claiming credential compromise — and a Compromise Disclosure composing pattern handles that reinterpretation, never by mutating the trail.
- **Breach forensics — "when was the trail compromised?"** An incident responder walks the seal store in `sealed_at` order, running [Verify Record] against representative events in each seal's coverage. The most recent seal that returns `verified` end-to-end and the next seal that returns `failed-verification(seal-proof-invalid)` bound the forensic window. Where the seals carry `anchored_at` from a TSA outside the adversary's reach, the upper bound on the time of tampering is independently established. The cadence governs the resolution; the four-atom stack governs the certainty.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Multi-instance Audit Trails.** A real system may have many audit trails (one per audited subsystem, one per jurisdictional scope). The composition specifies one instance; multi-instance configuration, cross-instance query, and federation are handled at the deployment layer. A higher-order Audit Federation pattern composes naturally.
- **Pre-attestation legacy events.** Events imported from a legacy system without verifiable attribution have no usable Actor Identity binding. The composition accepts these only under an explicit legacy-import path that records a *system-asserted* attestation marker (no actor binding); the auditor reads such events as *attribution-deferred* rather than *attributed*. Subsequent legal review establishes whether the gap is acceptable for the audit horizon.
- **Seal cadence vs. write rate.** Tighter cadence (per-event) narrows the forensic window but increases the seal-store growth rate and verify-time cost; coarser cadence is cheaper but widens the window. Selection is handled at the deployment layer. The composition surfaces the trade-off; the deployment owns the choice.
- **Compromised credential mid-window.** If an actor's credential is compromised and the discovery is later than the compromise, attestations made during the compromise window verify but should be reinterpreted. The composition does *not* retroactively invalidate (inheriting Actor Identity's contract); a Compromise Disclosure composing pattern produces *new* records that reframe the previously-verified attestations as untrustworthy. Required reading for breach response runbooks.
- **Policy disagreement across overlapping rules.** When multiple regulations apply to one event (HIPAA + state law + GDPR (EU General Data Protection Regulation) + GLBA — the US Gramm-Leach-Bliley Act, governing financial-data privacy), the `retention_policy` must reconcile to the longest applicable retention, the strictest data-minimization posture, and any conflicting destruction rules. A Policy Reconciliation composing pattern owns this; the composition takes the reconciled `policy_ref` as input.
- **Right-to-be-forgotten vs. retention obligation.** A GDPR Article 17 erasure request can collide with a regulatory retention obligation (HIPAA, SOX). The composition does not adjudicate; an Erasure Coordination composing pattern (with legal counsel in the loop) decides whether to honor the request, cryptographically shred the personal-data fields while preserving the structural audit record, or document the retention override.
- **Legal hold suspension of purge.** Pending litigation or investigation must suspend [Purge Eligible] for the affected scope. A Legal Hold composing pattern intercepts purges and rejects them while the hold is active; the composition's cascade defers until the hold is released.
- **Storage tier (active vs. cold).** SEC Rule 17a-4's *first two years immediately accessible* is orthogonal to retention obligation and to integrity. A Storage Tier composing pattern owns the active-to-cold transition; the composition's [Verify Record] accepts records retrieved from either tier identically.
- **Durability across crashes.** The composition's emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) must persist atomically with each successful [Record Action]. A crash that records the event in Event Log but not in the composition's maps leaves a dangling event without attribution linkage — a defect. The implementor owns the transactional boundary; the spec assumes it.
- **Cross-store consistency under failure.** If `EventLog.append` succeeds but `RetentionWindow.place_under_retention` fails, the composition is in an invariant-violating state (an event in the log without retention). The implementation must order operations so that either all four constituent calls succeed atomically or the composition records the failure as a `recording-failure` event that itself attests to the partial state. Two-phase commit, saga compensation, or single-transaction storage all satisfy; the spec names the requirement, the implementation chooses the mechanism.
- **Verification of the unsealed tail.** Events in the tail (between `sealed_through` and the current append point) are not yet covered by a seal. The composition's [Verify Record] returns `failed-verification(unsealed)` for these under strict mode, or `verified` under lenient mode (where the deployment accepts the per-event Event Log immutability as sufficient until the next seal cadence). The choice is deployment policy; the spec surfaces it.
- **Failed attribution attempts.** A [Record Action] call rejected at step 1 (Actor Identity rejects the credential) leaves no trace in the audit log — the attempt is not recorded. For high-assurance deployments where failed attribution attempts are themselves auditable events (an insider retrying with forged credentials, for example), a Failed-Attempt Log composing pattern records the rejected attempt as its own event. This composition does not absorb that concept: its audit surface is committed actions, not attempted actions.
- **Partial attestation on step failure.** If step 1 (Actor Identity.attest) succeeds but step 2 (EventLog.append) fails, an attestation record exists in the Actor Identity store with no corresponding event in the audit log — an orphan attestation. Actor Identity's records are immutable once committed (by design), so synchronous rollback is not available. The implementation must flag the orphan, return `rejected(recording-failure)` to the caller, and treat the orphan as an anomaly requiring resolution — either a compensating tombstone record or manual investigation. High-assurance deployments should treat any unresolved orphan attestation as a gap in the audit surface and alert accordingly.
- **Clock source for cadence and purge.** The composition uses `now` in two places it directly owns: the `seal_cadence` timer and [Purge Eligible]'s `now ≥ retention_until` comparison. The composition's `now` for both purposes is a host-injected input read at the composition's I/O seam before the action's transition runs (per `execution-contract.md` §Logic Confinement), so the orchestration transition is a pure function of injected `now`; a single injected `now` per [Purge Eligible]/[Purge Event] invocation is shared with any downstream `RetentionWindow.purge`, matching Retention Window's Invariant 8. The authoritative source of `now` for both is deployment-shaped: the deployer configures the clock (system clock, GPS-disciplined clock, NTP-synchronized cluster clock) and must ensure it is monotonically non-decreasing. Clock skew across nodes in a distributed deployment can cause non-deterministic [Purge Eligible] results and inconsistent cadence firing; the deployer owns the monotonicity guarantee. For deployments composing a Trusted Timestamping pattern, the TSA's anchored time may serve as the authoritative source; that composing pattern owns the clock-authority contract.

Where the composition breaks down: when the four constituent stores share an adversary with write access to all of them and external anchoring is absent; when the host environment cannot supply a stable, reproducibly-addressable record set at verify time (mutable event payloads under non-versioned references); when the retention policy and the integrity-coverage cadence are mismatched (events purged before their covering seal is verified against them); when the actor registry's historical public material is not retained and old attestations begin failing verification under a new key.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the composed action-wirings it exposes ([Record Action], [Seal Now], [Verify Record], [Purge Event]) and the derived read over eligible events ([Purge Eligible]), the consolidated [Audit Record] the four atoms together present, and its own rejections ([Recording Failure], [Nothing To Seal], [Mechanism Failure], [Not Eligible]). Its emergent state is entirely a **derived index** wiring the four constituent stores (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) — it stores no truth the constituents do not, so those linkage maps are left as backticked derived-index tokens rather than carded. References to the constituent atoms and their operations — Event Log's `append` / `read`, Actor Identity's `attest` / `verify`, Retention Window's `place_under_retention` / `purge`, Tamper Evidence's `seal` / `verify` — the inherited outcome and rejection tokens (`invalid-credential`, `invalid-request`, `not-known`, `verified`, and `failed-verification(...)` with its `attestation-*` / `seal-*` / `unsealed` / `purged` reasons), the constituent id tokens (`event_id`, `attestation_id`, `retention_id`, `evidence_id`), and the deployment configuration knobs (`retention_policy`, `seal_cadence`, `seal_mechanism`) all remain qualified/backticked, not carded here. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Record Action

The composition's core action: it attests the actor via Actor Identity, appends the event to the Event Log, places the event under Retention Window, links the two in the composition's maps, and (under per-event cadence) seals the singleton range. Returns the new `event_id`, or [Recording Failure] when a store fails after attestation (Event Log's `storage-failure` maps here), or Actor Identity's `invalid-credential` / `invalid-request` before anything is recorded.

Kind: Operation

#### Seal Now

The composition action that seals the current unsealed tail under interval or on-demand cadence — it delegates to Tamper Evidence's `seal` over the slice `[sealed_through + 1 .. tail]`, records the coverage, and advances `sealed_through`. Returns the `evidence_id`, [Nothing To Seal] when the tail is empty, or [Mechanism Failure] when the seal mechanism is unavailable.

Kind: Operation

#### Verify Record

The composition's four-way verification query: given an `event_id` and the re-presented original payload, it checks the attestation (Actor Identity), the covering seal (Tamper Evidence), and the retention state, returning `verified`, a prefixed `failed-verification(reason)` (including `purged` for a lawfully destroyed record), or `not-known` for a fabricated id. The payload must be re-presented (Invariant 7).

Kind: Operation

#### Purge Eligible

The derived read query returning the list of `event_id`s whose retention has elapsed (`now ≥ retention_until`) and are therefore eligible for the cascade.

Kind: Operation

#### Purge Event

The composition action that cascades destruction for a retention-elapsed event: it purges the retention record, destroys or tombstones the event, marks the `seal_coverage` records-purged (the seal itself outlives as destruction evidence), and purges the attestation per meta-retention. Returns `ok`, `not-known`, or [Not Eligible] when retention has not elapsed; a composed Legal Hold may additionally surface `under-legal-hold`.

Kind: Operation

#### Audit Record

The composition's emergent output: the single consolidated structure the four atoms together present for one event — the event bound to its attestation (who), its retention (how long), and its seal coverage (integrity) — observable, attributable, tamper-evident, and lifetime-bounded. The one structure the regulator actually queries; no constituent presents it alone.

Kind: Type

#### Recording Failure

The composition's own rejection from [Record Action] — returned when a store fails after the actor has been attested (Event Log's `storage-failure` maps here); the caller must resolve the resulting orphan attestation (Edge cases).

Kind:      Member
Member of: the record-action rejection
Role:      Rejection
Projects:  recording-failure

#### Nothing To Seal

The composition's own rejection from [Seal Now] — returned when the unsealed tail is empty (no events since `sealed_through`).

Kind:      Member
Member of: the seal rejection
Role:      Rejection
Projects:  nothing-to-seal

#### Mechanism Failure

The composition's own rejection from [Seal Now] — returned when the underlying Tamper Evidence seal mechanism is unavailable (hardware failure, TSA unreachable under anchored mode).

Kind:      Member
Member of: the seal rejection
Role:      Rejection
Projects:  mechanism-failure

#### Not Eligible

The composition's own rejection from [Purge Event] — returned when the event's retention has not elapsed (`now < retention_until`), so the no-early-purge gate refuses the cascade.

Kind:      Member
Member of: the purge rejection
Role:      Rejection
Projects:  not-eligible

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Record Action]: #record-action
[Seal Now]: #seal-now
[Verify Record]: #verify-record
[Purge Eligible]: #purge-eligible
[Purge Event]: #purge-event
[Audit Record]: #audit-record
[Recording Failure]: #recording-failure
[Nothing To Seal]: #nothing-to-seal
[Mechanism Failure]: #mechanism-failure
[Not Eligible]: #not-eligible

---

## Standards references

This composition is the structural form of what every major audit regime requires:

- **SOX §404 (Internal control over financial reporting)** and **§802 (Records-retention)** — financial-system audit trails with 7-year retention and anti-shredding protection. The composition is the operational form.
- **HIPAA §164.312(b) (Audit controls)** and **§164.530(j) (Documentation retention)** — record-and-examine PHI access; retain the audit documentation. Composes with state-law retention extensions.
- **PCI DSS Requirement 10 (Track and monitor all access)** — including 10.2 (audit-log content), 10.3 (audit-log entries), 10.5 (secure audit trails so they cannot be altered), and 10.7 (audit-trail retention). The composition is the structural form across all four sub-requirements.
- **21 CFR Part 11 (Electronic records and electronic signatures)** — *attributable, contemporaneous, original, accurate* (ALCOA) plus *complete, consistent, enduring, available* (ALCOA+). The four-atom stack is the structural form of every ALCOA+ property simultaneously.
- **SEC Rule 17a-4 / FINRA Rule 4511** — broker-dealer record retention with access-tier requirements. Composes with Storage Tier.
- **ISO/IEC 27001 §A.12.4 (Logging and monitoring)** — the International Organization for Standardization / International Electrotechnical Commission information-security baseline. The composition satisfies §A.12.4.1 (event logging), §A.12.4.2 (protection of log information), §A.12.4.3 (administrator and operator logs), and §A.12.4.4 (clock synchronization, via Trusted Timestamping composition) at once.
- **GDPR Article 30 (Records of processing activities)** and **Article 32 (Security of processing)** — Article 30's records-of-processing obligation and Article 32's integrity property of processing both map onto the composition.
- **eIDAS Regulation (EU 910/2014)** — qualified preservation services. The composition is one shape a qualified preservation service can take, with `anchored_at` from a qualified TSA giving the eIDAS-grade time anchor.
- **DoD 5015.02-STD** — the U.S. government records-management software baseline. The composition's separation of attribution, retention, and integrity matches DoD 5015's architecture.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-92 (Guide to Computer Security Log Management)** — names attribution, integrity, and retention as baseline log-management properties.
- **Basel III BCBS 239 (Principles for effective risk-data aggregation and risk reporting)** — the audit-trail integrity principles for banking risk data.

The four atoms it composes carry their own deep standards inheritance — see each constituent's Standards references.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the composition discipline: a composition is the wiring of freestanding concepts, not a new primitive.
- **The audit-grade systems literature** — every industrial audit framework (COSO, COBIT, SOC 2) names attribution, integrity, retention, and event recording as the four pillars of audit. The composition is the formal form the frameworks assume but never specify.
- **Tamper-evident logging literature** (Schneier and Kelsey 1999; *Secure Audit Logs to Support Computer Forensics*) — the original formal framing of cryptographically-protected audit logs.

---

## Generation acceptance

A derived implementation of Audit Trail is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the four constituent stores, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Answer all four audit questions for any event.** From `event_id`: what (Event Log's data field), who (Actor Identity's verified attestation), integrity (Tamper Evidence's verified seal over the event range), retention (Retention Window's record). The composition's verify surface is the regulator's actual question.
- **Verify all eight composition-level invariants over the record set.** Attribution coverage, retention coverage, integrity coverage modulo unsealed tail, cascade-on-purge, constituent invariants preserved, forensic completability, verification asymmetry preserved, honest representation of destruction.
- **Verify each constituent atom's Generation acceptance bar over its own instance.** Event Log's append-only and total order, Actor Identity's five-check bar, Retention Window's six-check bar, Tamper Evidence's six-check bar — all satisfied independently and observable from each constituent's records.
- **Bound the forensic window of any detected tampering.** Using Tamper Evidence's per-seal verification cascade, the auditor identifies the latest verified seal and the first failed seal; the cadence and the seals' `sealed_at` (and `anchored_at` where present) give the window.
- **Distinguish lawfully destroyed from missing.** [Verify Record] returning `failed-verification(purged)` is backed by a Retention Window record in *Purged* state; *missing* — an event with no retention record at all — does not occur and the auditor sees the absence as a structural guarantee.
- **Identify the composing patterns active in this deployment.** Whether External Anchoring, Trusted Timestamping, Storage Tier, Legal Hold, Compromise Disclosure, Erasure Coordination, Policy Reconciliation, and Mechanism Registry are wired in, and with what configuration.

This is the generator's contract: any code generated from this composition must produce records and a runtime surface that pass the six checks above. The bar is the regulator's question — *"can you prove what happened, who did it, when, that it hasn't been altered, and that the retention obligation was honored?"* — answered structurally from the records and the proofs, not procedurally from runtime claims.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed one foundational finding — a `recorded_at` coherence break introduced by the Event Log re-grounding; caller signatures unchanged; see Lineage. Formal-layer vote stands YES (model present); `recorded_at` and orchestration are out of model scope, so the fix does not reopen it. The composition was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — composition logic specified across all four constituent atoms; emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) named; action wiring covers record, seal, verify, and cascading purge with fully-named rejection taxonomies; eight composition-level invariants stated and justified; walkthrough plus five cross-domain examples (banking SOX, healthcare HIPAA + 21 CFR Part 11, payments PCI DSS, pharmaceutical 21 CFR Part 11, broker-dealer SEC Rule 17a-4) and three adversarial scenarios; eleven edge cases (multi-instance, legacy events, cadence trade-off, credential compromise, policy reconciliation, right-to-erasure, legal hold, storage tier, durability, cross-store consistency, unsealed-tail policy, failed attribution attempts, partial attestation on step failure, clock source for cadence and purge); Generation acceptance bar explicit. Third entry in `compositions/`.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

This application survived all three pressure-testing passes (see [`pressure-testing.md`](../pressure-testing.md)) on its first iteration. The two regulated-pattern conventions canonicalized in [`contributing.md`](../contributing.md) and [`pressure-testing.md`](../pressure-testing.md) — *Regulated adversarial scenarios* and *Generation acceptance* — were baked in from the first draft. The composition pattern (wrap each constituent's action behind one application-level action, name emergent state, preserve each constituent's invariants, surface cross-atom invariants explicitly) follows the structural template Idempotent Reservation established and extends it to four constituents.

**Structural milestone.** This application is the destination the library has been building toward since the first regulated atom landed. With Event Log, Actor Identity, Retention Window, and Tamper Evidence all grounded as freestanding atoms, the four-constituent composition becomes available — what SOX §404, HIPAA §164.312(b), PCI DSS Requirement 10, 21 CFR Part 11, SEC Rule 17a-4, and ISO/IEC 27001 §A.12.4 all require but none name as a single composable concept. The forthcoming-link references each constituent carried (*"the canonical regulated-audit stack composes (the four) as four freestanding atoms; the Audit Trail application is the wiring"*) are now resolved.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine GRID nodes resolved with their references intact. As with Idempotent Reservation, the user-level Flow is captured in the Walkthrough example rather than as a dedicated Flow subsection — the per-action wiring under Composition logic carries the substantive structure. Composition state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) is named explicitly, with cascade-on-purge governing its lifecycle — no orphan state.

**Pass 2 — Conceptual independence (EOS — Essence of Software, Daniel Jackson's framework for specifying software concepts as freestanding, composable units).** Clean. The application is properly scoped: it composes the four atoms without absorbing concerns that belong to additional atoms. Eight concerns named under Edge cases (multi-instance federation, legacy-import attribution, cadence vs. write rate, credential compromise reinterpretation, policy reconciliation, right-to-erasure adjudication, legal hold suspension, storage tier) are correctly named as deployment-shaped concerns or future composing patterns rather than folded in. The temptation to absorb policy reconciliation into the application was real — multi-rule overlap is endemic to regulated audit — but reconciliation recurs across every regulated atom that takes a policy reference (Retention Window already names it; this application would just re-derive it) and is correctly externalized.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern:

- *Verify asymmetry surfaced at the application boundary.* Early drafts hid Tamper Evidence's `verify(evidence_id, original_record_set)` second argument inside the application, presenting a `verify_record(event_id)` API that fetched the payload internally. Pass 3 caught it: the asymmetry is structural and the verifier must know they are presenting the record set, not trusting the application to fetch it. Resolved: `verify_record(event_id, original_event_payload)` with the payload as an explicit second argument, Invariant 7 naming the asymmetry, and the walkthrough showing the auditor retrieving the payload from cold storage rather than from the live system.
- *Cascade-on-purge wiring was implicit.* The first draft assumed events, attestations, and seals would purge in step but did not specify which store cascades to which. Pass 3 caught it: an event purged without its attestation purged leaves the attestation referring to a destroyed action, and an event purged without its seal coverage updated leaves a seal that cannot be verified. Resolved: explicit *cascade-on-purge rule* subsection naming the order — event, then attestation per meta-retention, then seal coverage marked records-purged — and Invariant 4 making the contract verifiable from the records.
- *Unsealed-tail policy was undefined.* Events not yet covered by a seal sit in the tail; the first draft did not say what [Verify Record] returns for these. Resolved: explicit *strict* vs. *lenient* mode in Action wiring and Edge cases, with the deployment owning the choice. Strict mode treats unsealed events as integrity-unverified; lenient mode accepts per-event Event Log immutability as sufficient until the cadence catches up.
- *Honest representation of destruction.* The first draft treated `failed-verification(purged)` and `not-known` as undistinguished. Pass 3 caught it: lawful destruction and missing record are very different audit outcomes, and the application must distinguish them. Resolved: Invariant 8 (*honest representation of destruction*) names the contract; the cascade-on-purge rule guarantees that every purged event leaves a retention record in *Purged*; `not-known` is reserved for *event_id not in the log at all* (which, given Event Log's append-only invariant, only happens when the caller has a fabricated id).

Three deferred concerns are named as explicit out-of-scope rather than fixed in-pattern: durability of the application's emergent state (deployment-shaped), cross-store consistency under partial failure (transactional boundary owned by the implementation), and unsealed-tail policy selection (deployment policy). Each is correctly external to the composition.

The three passes together exercise the architecture as designed: GRID checks structural completeness of a four-atom composition (no missing wiring; every emergent property has a named state component); EOS keeps the application from absorbing the eight concerns that recur across regulated audit and belong elsewhere; Linus catches the four hidden contracts (verify asymmetry at the boundary, cascade order, unsealed-tail semantics, honest representation of destruction) that would otherwise hide beneath the *"just compose the four atoms"* summary. The application is stronger because all three checks happened.

**Refinement round 1 — re-run of all three passes.** Eight findings, all closed in-pattern:

- *Action signature incompleteness (Pass 1 / Pass 3).* Three actions carried `rejected(reason)` as a placeholder rather than a named rejection taxonomy: [Record Action] (only Actor Identity's reasons listed; `recording-failure` absent), [Seal Now] (no reasons at all), [Purge Event] (no reasons). Resolved: [Record Action] now enumerates `rejected(invalid-credential | invalid-request | recording-failure)`; [Seal Now] enumerates `rejected(nothing-to-seal | mechanism-failure)`; [Purge Event] enumerates `rejected(not-known | not-eligible)`, with a note that Legal Hold composition adds `under-legal-hold`.
- *Failed attribution attempts leave no trace (Pass 3).* A [Record Action] rejected at step 1 is silent in the audit log. The spec had not named this. Resolved: explicit edge case (*Failed attribution attempts*) stating that attempted-but-rejected actions are out of scope for this application, with a Failed-Attempt Log composing pattern named as the resolution for high-assurance deployments.
- *Orphan attestation on step failure (Pass 3).* If Actor Identity.attest (step 1) succeeds but EventLog.append (step 2) fails, an immutable orphan attestation exists with no corresponding event. Not previously addressed. Resolved: new edge case (*Partial attestation on step failure*) naming the gap, noting that Actor Identity's immutability forecloses rollback, and specifying that the implementation must flag and resolve the orphan; [Record Action]'s step 6 updated to reference this case.
- *Invariant 4 atomicity claim inconsistency (Pass 3).* The invariant said "same cascade step" — an atomicity claim — but the spec explicitly defers the transactional boundary to the implementation. The absoluteness of the invariant contradicted the deferral. Resolved: "same cascade step" replaced with "same cascade operation — either in a single transaction or via a compensating record," and a cross-reference to the *Cross-store consistency under failure* edge case added.
- *Invariant 3 silent on records-purged seals (Pass 3).* The invariant required every event with `sequence_number ≤ sealed_through` to be covered by a seal, but did not address events whose covering seal is subsequently marked records-purged. A strict reading suggested those events violated the invariant after purge. Resolved: clarifying sentence added stating that records-purged seals still satisfy coverage for events that have since been purged — the seal persists as destruction evidence.
- *Clock source for cadence and purge_eligible (Pass 3).* The application uses `now` for the seal cadence timer and the `now ≥ retention_until` comparison in [Purge Eligible]. The authoritative clock source was unspecified. Resolved: new edge case (*Clock source for cadence and purge*) naming the deployment-shaped nature of the clock authority, the monotonicity requirement, and the Trusted Timestamping composing pattern as the resolution for deployments requiring an authoritative external source.

Pass 2 was clean on this refinement round: no new over-absorptions surfaced. The six fixes are all in-pattern resolutions or new edge-case entries; none required extraction of a new atom.

**Scheduled rescan: 2026-05-20.** Pass 1 clean, with three refining findings on constituent invariant counts (all closed in-pattern). Pass 2 clean. Pass 3: one rhetorical finding, recorded with classification.

- *R1 — Stale Actor Identity invariant count (Pass 1 / refining).* Invariant 5 cited "Actor Identity's eight invariants"; Actor Identity gained Invariant 9 (Attestation durability) in its Refinement round 1. Resolved: updated to "nine invariants" with "attestation durability" added to the parenthetical list.
- *R2 — Stale Retention Window invariant count (Pass 1 / refining).* Invariant 5 cited "Retention Window's nine invariants"; Retention Window has ten invariants (Invariant 10 — Retention store durability). Resolved: updated to "ten invariants" with "retention store durability" added to the parenthetical list.
- *R3 — Stale Tamper Evidence invariant count (Pass 1 / refining).* Invariant 5 cited "Tamper Evidence's eight invariants"; Tamper Evidence has nine invariants (Invariant 9 — Seal store durability, added in Refinement round 1). Resolved: updated to "nine invariants" with "seal store durability" added to the parenthetical list.
- *R4 — verify_record reason enumeration not surfaced at signature (Pass 3 / rhetorical).* The [Verify Record] signature uses `failed-verification(reason)` without enumerating the reason vocabulary inline (the prefix-delegation scheme — `attestation-*`, `seal-*`, `unsealed`, `purged` — is described in the numbered action steps). The content is sound and the delegation scheme is clearly explained; the issue is presentational. Recorded with classification; accepted as-is. An enumerated signature would require choosing between listing every prefixed sub-reason (verbose and coupled to constituent internals) or describing the prefix scheme at the signature level (redundant with the steps). The current shape — signature notes the open-ended result, steps walk the vocabulary — is the better trade-off.

No constituent atom API changes (from today's rescans) require further update to this composition beyond the invariant count corrections. The tamper-evidence fix (mechanism_credential may be empty for unkeyed mechanisms) propagates through [Seal Now]'s delegation to `TamperEvidence.seal` without change — the composition passes the credential through; the precondition check lives in the constituent. **Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Cascade-on-purge (Inv 4 — purge, attestation purge, seal-coverage update compose atomically or via compensating record) and honest-representation-of-destruction (Inv 8) are ordering/state-machine correctness claims across four stores. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** The derived model is [`audit-trail.tla`](./audit-trail.tla) with config [`audit-trail.cfg`](./audit-trail.cfg), checked by the repo's `tla-checker` WASM model checker via `tools/harness/check.mjs`.

*What it checks.* The four constituent stores are modeled per event as a tuple of state fields — `evState` (Event Log content: present/purged), `attState` (Actor Identity attestation: live/purged), `sealCov` (Tamper Evidence coverage: covered/records-purged), `retState` (Retention Window record: Retained/Purged) — plus a per-event `eligible` flag modeling Retention Window's no-early-purge gate. Three composition-level safety invariants are checked under every interleaving: the load-bearing **Invariant 4** (cascade-on-purge — the four stores are always in one of two *coherent* configurations, never a dangling partial), **Invariant 8** (honest representation of destruction — `evState = purged ⇒ retState = Purged`, i.e. content is gone only with a retention record proving lawful destruction, so "missing without record" is unreachable), and **Invariant 1** (attribution coverage — a Retained event always has a live attestation).

*Bounds and scope.* `Events = {e1, e2}`. Exhaustive: 9 reachable states, all invariants hold. The correct model performs the cascade as a **single atomic action** (the single-transaction form Invariant 4 permits); atomicity collapses the partial-state space, which is *why* the correct model is small — the verification value lives in the buggy twin. Deliberately **out of model scope**: [Record Action]/[Seal Now] orchestration and rejection guards; [Verify Record] outcome plumbing (Invariants 6–7, query-shape properties); and the constituent atoms' internal invariants (Invariant 5), each checked in its own model (e.g. `event-log.tla`) rather than re-proven here.

*Buggy twin (vacuity guard).* [`audit-trail-buggy.tla`](./audit-trail-buggy.tla) performs the cascade as four separate, interleavable sub-steps with **no compensating record** — the naive non-atomic implementation the *Cross-store consistency under failure* edge case and Invariant 4 warn against. The sub-steps follow the spec's stated order (retention → destroy event → purge attestation → mark seal records-purged), but because they are distinct actions TLC stops the cascade partway: after `PurgeRetention(e)` alone the event is `{retState = Purged, evState = present, attState = live, sealCov = covered}` — neither coherent configuration, a dangling cross-store partial. The checker rejects it at 4 states. This is the model's load-bearing contribution: it demonstrates mechanically that the atomicity (or compensation) in Invariant 4 is required, not decorative — a non-atomic cascade is reachably unsafe.

*Conflict-protocol outcome.* None triggered. The model **corroborates** the English — the atomic cascade keeps all four stores coherent under every interleaving, and the spec already requires "single transaction or compensating record," which is exactly the distinction the correct/buggy pair makes mechanical. No counterexample flowed back; the canonical English is unchanged. Reproduce with `cd tools/harness && bash bootstrap.sh && node check.mjs ../../compositions/audit-trail.tla` (and `… audit-trail-buggy.tla --buggy`).

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This composition grounded 2026-05-20 under the early process — foundation plus refinement, no fresh-reader AI adversarial round — and carried the legacy grandfathered token; its constituent atoms were re-grounded at Final Critique 4 on 2026-06-18. This round is that missing AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the composition's Final Critique 4 (Rounds 1–3 the foundation/refinement baseline, per pressure-testing.md §Round structure). One foundational finding closed: F-1 — [Record Action] no longer passes `recorded_at` into `EventLog.append` (Event Log's Final Critique 4 made `recorded_at` host-stamped at its own seam, not caller-supplied); Event Log stamps it and the composition reads it back, so [Record Action]'s caller signature is unchanged. Refining: the composition's own `now` for seal cadence and purge-eligibility stated as host-injected at the seam; [Verify Record] routes an absent/wrong payload to `failed-verification(seal-record-set-mismatch)` (distinct from `not-known`); `EventLog.append`'s `storage-failure` mapped to `recording-failure`.. Caller signatures unchanged and the invariant set held at 8 (read the actual count from the spec and confirm no change), so the fixes are additive with no constituent-change cascade. Formal-layer vote stands YES (model present); `recorded_at` and orchestration are out of model scope, so the fix does not reopen it. Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, no new surface. Compositions affected — confirming check only, NOT a re-pass (record_action/verify_record signatures, invariant numbering 1–8, and the six-check Generation-acceptance bar are all unchanged): Customer Onboarding, Chain of Custody, Forensic Recovery, Immutable Transaction Ledger, Defensible Retention, Resolve a Person's Data Rights, Multi-Party Approval, Privileged Access Provisioning, and the other substrate consumers. Grounds at Final Critique 4.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed (the invariant count held at eight). (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added after Edge cases (10 terms): 5 Operations — the four composed action-wirings ([Record Action], [Seal Now], [Verify Record], [Purge Event]) plus the derived read ([Purge Eligible]); 1 Type — the composition's emergent consolidated [Audit Record] (the one structure the four atoms together present); and 4 Members — the composition's own rejections ([Recording Failure], [Nothing To Seal], [Mechanism Failure], [Not Eligible]). **No emergent record store carded:** the composition's own state is entirely a derived index wiring the four constituent stores (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`), left as backticked derived-index tokens. Survivors left backticked: the one labeled projected-contract signature per composed Operation; the qualified constituent calls (Event Log's `append` / `read`, Actor Identity's `attest` / `verify`, Retention Window's `place_under_retention` / `purge`, Tamper Evidence's `seal` / `verify`); the inherited outcome and rejection tokens (`invalid-credential`, `invalid-request`, `not-known`, `verified`, `failed-verification(...)` and its `attestation-*` / `seal-*` / `unsealed` / `purged` reasons — deliberately left as the prefix-delegated vocabulary per the Refinement-round R4 finding); the constituent id tokens (`event_id`, `attestation_id`, `retention_id`, `evidence_id`); the deployment configuration knobs (`retention_policy`, `seal_cadence`, `seal_mechanism`); and concrete example ids, policies, and payloads. Constituent atom names remain the existing full links to `../atoms/*`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim (recorded/attributed/retained/tamper-protected, the four-atom composition, the canonical-audit-primitive framing, four freestanding atoms as one structure) is carried by Summary / Intent / Composes / Standards references; no *also-known-as* line existed, so none was invented. *Note:* the folded blockquote also carried inline glossary expansions of SOX / HIPAA / PCI DSS / 21 CFR Part 11 / SEC Rule 17a-4; these acronyms remain in self-describing regulatory context (§404, §164.312(b), Requirement 10, Part 11, Rule 17a-4) and are described in Standards references, so no claim was lost. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-paragraph units, lossless. (e) **prose cut #5 — skipped (with reason):** the composition owns no emergent state machine of its own — the only lifecycle states are the constituents' (Retention Window's Retained→Purged, etc.); the composition's own logic is a uniform wrap-the-four-and-cascade shape already stated crisply in Action wiring and the cascade-on-purge rule. One representational fix outside the Terms work: a single bare `retention_policy` in an Edge case (previously italicized) was backticked to match the survivor convention (anchor-neutral, invariant-diff-safe). Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-18`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (10 terms); eight composition-level invariants preserved; the `.tla` models untouched — harness re-run green: `audit-trail.tla` PASS + `audit-trail-buggy.tla --buggy` rejected.

</details>
