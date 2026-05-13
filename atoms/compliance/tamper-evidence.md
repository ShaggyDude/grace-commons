---
title: Tamper Evidence
parent: Compliance
grand_parent: Atoms
nav_order: 3
has_toc: true
toc: true
---

# Tamper Evidence

> A compliance primitive: cryptographic evidence that a set of records has not been altered since its authoritative creation. Each evidence is a *seal* with an opaque immutable id; the record-set reference, proof, seal timestamp, and optional external anchor are immutable properties, set at seal time. Verification is a read-only query, not a state transition, and — unlike Actor Identity's verify — requires the original record set as input, because the proof commits to the records' content. The contract the atom enforces is **detectability**: any tampering with the records since seal is detectable from the records alone, given the proof and the originating record set.

---

## Intent

Regulated systems must demonstrate that the records they keep have not been altered after the fact. Auditors, regulators, and adverse parties accept the system's records only when the integrity of those records survives independent verification. The shape is constant across domains: at record-creation time, or in batch over a record set, the system produces a *proof* — a cryptographic commitment to the records' content — that can later be verified to detect any modification. Hash chains, Merkle trees, and external anchoring to a trust anchor outside the system's control are all valid mechanisms; the atom is neutral about which one a deployment chooses.

The pattern addresses the *has this been altered?* question that audit trails alone cannot answer. An Event Log records what happened; an Actor Identity attestation records who authorized it; a Retention Window record bounds the lifetime; but none of the three answers the regulator's question *"how do I know these records weren't rewritten after the fact?"* Tamper Evidence is the structural answer: tampering is detectable from the records.

This is a freestanding atom in the EOS sense. It has its own state (the seal record), its own actions (seal, verify), and its own operational principles (proofs are immutable; verification is a read-only function of the seal record and the originating record set). It does not implement record storage, the underlying hash function or signature scheme, asynchronous external anchoring, actor-bound non-repudiation of the seal, or the time anchor that gives the seal a trustworthy timestamp. Each is a separate composable concept; see Composition notes.

The atom contracts on *what the proof demonstrates* — any tampering is detectable from the records alone — not on *which crypto primitive produced it*. Implementations choosing hash chains (Git's commit DAG), Merkle trees (Certificate Transparency, blockchain leaf commitments), or qualified-timestamp anchoring (RFC 3161) all satisfy the same contract. The mechanism is implementation policy.

---

## Structure

### Identity model

Every seal known to the system has an **`evidence_id`** — an opaque, immutable, system-generated identifier produced by `seal`. The id is the seal's identity; the record-set reference, proof, seal timestamp, and optional external anchor are immutable *properties* of the seal, not its identity.

Two seals over the same record set — for instance, re-sealing under a new mechanism after an algorithm-deprecation event, or layering a stronger anchor on top of an earlier seal — have different ids. Each is its own audit record. Ids are not reused.

The opaque-id model preserves the per-evidence audit discipline the other regulated atoms enforce. Identifying a seal by `record_set_ref` would collapse legitimate re-seals; identifying by timestamp would lose precision under concurrent seals. Opaque ids let auditors reconstruct the integrity history of any record set as a sequence of seals, each with its own lifecycle.

### Inputs

- A record-set reference identifying *what* is being sealed. The atom treats this as opaque — the host pattern defines what a record set is, how to address it, and how to present it to `verify` later.
- A mechanism credential — opaque material the chosen mechanism consumes at seal time to produce the proof. For unkeyed mechanisms (bare hash chains, public commitments) this may be empty or a configuration handle; for keyed mechanisms (signed roots, HMAC chains, qualified electronic signatures) it is the keying material. The atom consumes the credential at `seal` time and never persists it.
- Actions:
  - `seal(record_set_ref, mechanism_credential) → evidence_id | rejected(invalid-request | mechanism-failure(reason) | storage-failure)`
  - `verify(evidence_id, original_record_set) → verified | failed-verification(proof-invalid | record-set-mismatch | mechanism-verification-unavailable) | not-known`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of seals.
- For each seal: `evidence_id`, `record_set_ref`, `proof`, `sealed_at`, and (if produced at seal time) `anchored_at`.
- `seal` returns the new `evidence_id` on success, or a rejection naming the failed precondition.
- `verify` returns `verified`, `failed-verification(reason)`, or `not-known`. The verify call itself does not modify state.

### State

A single stable state: **Sealed**. There are no transitions out of Sealed — the atom has no surface for revoking, invalidating, modifying, or re-anchoring a seal once it is recorded. Verification is a read-only query over the seal's stored fields and the originating record set the verifier presents. A two-state model that promoted external anchoring to a first-class transition (Pending → Anchored) was considered and rejected; see Lineage notes.

Each seal carries:

- **`evidence_id`** — opaque, immutable, system-generated. Set on `seal`. Never changes.
- **`record_set_ref`** — opaque reference to the record set the proof commits to. Set on `seal`. Never changes.
- **`proof`** — the cryptographic artifact (hash chain, Merkle root, signed root, RFC 3161 timestamp token, blockchain transaction id, or composite) the mechanism produced. Set on `seal`. Never changes.
- **`sealed_at`** — wall-time when the seal was recorded. Set on `seal`. Never changes.
- **`anchored_at`** — present only if the chosen mechanism produced an external anchor at seal time (for example, the seal mechanism called an RFC 3161 timestamp authority synchronously and recorded the timestamp token's time). Set on `seal` if produced; never changes. Absent for mechanisms that do not anchor at seal time. Later, asynchronous anchoring belongs to an External Anchoring composing pattern with its own records.

Transitions:

- `seal(record_set_ref, mechanism_credential)` → a new evidence record is created in Sealed with a fresh `evidence_id`, the supplied `record_set_ref`, the proof computed by the mechanism, `sealed_at = now`, and (if the mechanism produced one) `anchored_at`. Returns `evidence_id`.
- *(no other transitions)*

### Flow

1. **Composing pattern asserts integrity of a record set.** At record-set creation, on a schedule, or on demand, the host calls `seal(record_set_ref, mechanism_credential)`.
2. **Atom invokes the mechanism and records the seal.** The mechanism computes the proof over the record set; the atom records the evidence and returns the id. If the mechanism does external anchoring synchronously, the anchor result is captured in `anchored_at`.
3. **Time passes; the seal persists.** The host system stores the `evidence_id` alongside whatever it represents (the Event Log instance, the document, the record batch).
4. **An auditor, verifier, or composing pattern checks integrity.** The verifier presents both the `evidence_id` and the originating record set: `verify(evidence_id, original_record_set)`. The atom retrieves the seal, re-runs the mechanism's verification function over the record set against the recorded proof, and returns the result.

### Decision points

- **At `seal(record_set_ref, mechanism_credential)`** — `record_set_ref` and `mechanism_credential` must be well-formed and non-empty; otherwise `invalid-request`. The mechanism must be able to compute a proof against the record set; otherwise `mechanism-failure(reason)` — for example, the underlying records are unreadable, the keying material does not satisfy the mechanism's preconditions, or an external anchor service is unreachable for a mechanism that requires synchronous anchoring. The credential is *consumed*, never stored. If the seal store write fails after the proof is computed, the atom returns `rejected(storage-failure)` — no seal is recorded, and the computed proof is discarded. Durability of the seal store is implementation-owned.
- **At `verify(evidence_id, original_record_set)`** — `evidence_id` must reference a recorded seal; otherwise `not-known`. (This is a lookup miss, distinct from verification failure.) The presented `original_record_set` must refer to the same record set the seal was made over; otherwise `failed-verification(record-set-mismatch)`. The mechanism's verification function, run over the presented record set against the stored `proof`, must check out; otherwise `failed-verification(proof-invalid)` — the structural signal of tampering. If the mechanism's verification function requires an external service (e.g., an RFC 3161 TSA's published certificate chain) that is unavailable at verify time, the atom returns `failed-verification(mechanism-verification-unavailable)` — a transient failure; the verifier may retry when the service becomes available. This is distinct from `proof-invalid` (tampering detected) and from `record-set-mismatch` (wrong records presented). Like Actor Identity's `verify`, this call has three first-class outcomes, not a success-or-rejection pair, and composing patterns should treat each distinctly.

### Behavior

Observed behavior, derived from how regulated systems use tamper-evidence:

- The atom is mechanism-neutral. A seal produced by a SHA-256 hash chain, by a Merkle tree with a signed root, or by a blockchain anchor all satisfy the same contract: any tampering is detectable from the records alone, given the proof and the originating record set. The choice of mechanism is implementation policy and is recorded outside the atom (typically in a Mechanism Registry composing pattern, or implicit in the deployment's configuration).
- Verification is *not* self-contained in Actor Identity's sense. Where Actor Identity's `verify` needs only the attestation and the actor registry's public material, Tamper Evidence's `verify` needs the original record set the proof commits to. This asymmetry is structural: the proof commits to the records' content, and the verifier must re-present that content to detect modification. A verifier with only the seal and no records cannot decide; the answer is `not-known` against the records the verifier does not have.
- `seal` never modifies an existing evidence record. It always creates a new one. Re-sealing the same record set under a stronger mechanism (after a hash-function deprecation, after the prior credential is rotated) produces a separate seal with its own id. Multiple seals over the same record set accumulate as independent audit evidence.
- The credential is consumed at seal time and never persisted by the atom. Credential management — storage, rotation, recovery, HSM binding — is an entirely separate concern.
- The atom produces *evidence of tampering*, not *prevention of tampering*. An adversary with write access to both the records and the evidence store can rewrite both in tandem and produce a consistent-looking-but-forged audit trail. What defeats that is external anchoring — committing the proof or its root to a trust anchor outside the adversary's reach. Anchoring is a composing concern; the bare atom names it but does not enforce it.
- Wall-time is best-effort. `sealed_at` is recorded from the implicit clock. Where the time of seal matters to the verifier (statute of limitations, regulatory timing rules), the implementation composes Trusted Timestamping; `anchored_at` from an RFC 3161 timestamp authority is the verifiable form.

### Feedback

Each successful action produces an observable, measurable change:

- After `seal` — a new evidence record appears with a fresh `evidence_id`, the supplied `record_set_ref`, the computed `proof`, `sealed_at`, and (if produced) `anchored_at`. Total count increases by one. The id is returned.
- After `verify` — no state change. The atom returns one of `verified`, `failed-verification(reason)`, or `not-known`.

Each rejected `seal` action produces an observable refusal: `invalid-request`, `mechanism-failure(reason)`, or `storage-failure`. Each `verify` outcome is a first-class result (not a rejection): `verified`, `failed-verification(proof-invalid | record-set-mismatch | mechanism-verification-unavailable)`, or `not-known`.

The seal set is queryable. Per-seal fields are observable to auditors and operators; the original record set required for verification is fetched from the host's record store, not from this atom.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the atom:

- **Invariant 1 — Evidence immutability.** Once recorded, a seal's `evidence_id`, `record_set_ref`, `proof`, `sealed_at`, and `anchored_at` (if present) never change.
- **Invariant 2 — Detectability of tampering.** For any seal in the system, if the record set referenced by `record_set_ref` is modified after `sealed_at`, then `verify(evidence_id, modified_record_set)` returns `failed-verification(proof-invalid)`. The contract is detectability from the records alone, given the proof and the originating record set. This guarantee holds provided the mechanism is cryptographically sound — specifically, that the mechanism's hash function or signature scheme has no known practical collision or forgery attacks. A deprecated mechanism with known weaknesses may fail to detect carefully crafted tampering. Mechanism health is a Mechanism Registry composing concern; seals produced under deprecated mechanisms should be re-sealed under a sound mechanism before the old one is deprecated.
- **Invariant 3 — Record-set binding.** For any seal in the system, the recorded `proof` verifies against the record set referenced by `record_set_ref` and only against that record set. A proof made over a different record set does not verify against this seal.
- **Invariant 4 — Verification self-containment given the originating records.** `verify(evidence_id, original_record_set)` requires only the seal's stored fields and the presented `original_record_set`. No additional out-of-band data is consulted at verify time, except where the chosen mechanism's verification function itself consults an external anchor (for example, an RFC 3161 verification consults the timestamp authority's published certificate). Mechanism-induced external dependencies are themselves implementation policy.
- **Invariant 5 — Id stability.** A seal's `evidence_id` is set on `seal` and never changes.
- **Invariant 6 — No id reuse.** No two seals share an `evidence_id` across the lifetime of the system.
- **Invariant 7 — Verification consistency under a fixed record set.** For any seal and any fixed `original_record_set`, repeated `verify` calls return the same result. Verification results may differ across record-set states — that is detectability working as designed.
- **Invariant 8 — Mechanism opacity.** The atom's contract holds regardless of which mechanism produced the proof. Hash chain, Merkle tree, signed root, RFC 3161 timestamp token, blockchain anchor, or composite — the contract is on what the proof demonstrates, not on which primitive produced it. See Invariant 2's qualification: this holds for cryptographically sound mechanisms.
- **Invariant 9 — Seal store durability.** Once recorded, a seal is never deleted from the store. The seal set is monotonically non-decreasing. The atom provides no deletion surface; cascading deletion under a retention policy is the composing pattern's responsibility (see Retention Window in Composition notes). A `storage-failure` rejection guarantees no partial seal record was written. A seal that survives its originating records provides audit evidence of their existence and integrity up to the seal time; deleting it would destroy that evidence.

Evidence immutability and detectability together give the *integrity* property — the regulator's question *"have these records been altered?"* has a structural answer rather than a procedural one. Verification self-containment given the originating records names the asymmetry from Actor Identity: a verifier must hold the records, not just the seal, to decide.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Financial — transaction-log anchoring under SOX

A bank's settlement system seals each day's transaction journal: `seal(journal_2026-05-10, hsm_signing_key) → evidence_a91`. The mechanism is a SHA-256 hash chain over the day's transactions, with the chain's tail signed by an HSM-bound key. Once per hour, the chain tail is anchored to an RFC 3161 qualified timestamp authority; the authority's timestamp token is recorded as `anchored_at` on the seal. Seven years later, during a SOX §404 audit, the external auditor presents the journal and `verify(a91, journal_2026-05-10) → verified` — confirming the day's transactions were not altered after the seal, with the qualified timestamp giving an upper bound on when they could have been forged.

### Healthcare — EHR change-log integrity under HIPAA and 21 CFR Part 11

A hospital EHR appends every record amendment (correction, addendum, redaction) to a per-patient change log. The change log is sealed on a rolling Merkle-tree basis — each commit produces a new root and a new seal. `verify(seal, patient_change_log) → verified` confirms the log has not been silently rewritten since the seal. A correction added today is a new event in the log, not a modification of yesterday's; if anyone retroactively edited yesterday's entry, today's seal would fail verification. 21 CFR Part 11's electronic-record integrity bar is satisfied structurally.

### Source control — Git's commit DAG

A developer pushes a commit. Git computes the cryptographic hash of the commit object — which includes the hash of its parent commits — and stores the object under that hash. The hash *is* the proof: the commit's content, its parents, and (transitively) the entire history are committed to in one chain. `git fsck` is the verification function; tampering anywhere in the history produces a hash mismatch detectable from the repository alone. The commit DAG is a worked open-source instance of this atom — `evidence_id` = commit hash, `record_set_ref` = the commit's tree and parents, `proof` = the chained hashes, `sealed_at` = the commit timestamp. Linus Torvalds built the world's most widely-deployed Tamper Evidence implementation; the atom names what it does in domain-neutral terms.

### Legal — document notarization under RFC 3161 trusted timestamping

A law firm timestamps an executed contract via a qualified Time-Stamp Authority. The mechanism is RFC 3161: a hash of the contract is submitted to the TSA; the TSA returns a signed TimeStampToken binding the hash to a trusted time. The token *is* the proof; `anchored_at` is set from the TSA's timestamp. Any future dispute — opposing counsel claims the contract was modified post-signing — is resolved by `verify(evidence, contract_pdf) → verified | failed-verification(proof-invalid)`. eIDAS Regulation gives qualified electronic timestamps presumed evidentiary effect across the EU.

### Payments — PAN-handling audit under PCI DSS

A payment processor seals each day's cardholder-data access log: `seal(pan_access_log_2026-05-10, processor_key) → evidence_p41`. The mechanism is an HMAC-SHA-256 chain — each entry's MAC includes the previous entry's MAC and the entry's content. PCI DSS Requirement 10.5 mandates audit-log integrity; the seal is the structural form. A QSA's annual assessment runs `verify` over the prior year's daily logs; any tampering — whether to hide a cardholder-data exfiltration or to forge access for a fraudulent dispute — is detected from the logs themselves.

The mechanic is identical across all five. What differs: the mechanism family (hash chain, Merkle tree, qualified timestamp), the frequency of sealing (per-commit, per-amendment, per-document, per-day), the anchoring story (none, RFC 3161 TSA, blockchain), and the composing patterns active around it (Actor Identity for authored seals, Trusted Timestamping for qualified anchors, External Anchoring for tamper-proof reach).

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator integrity audit.** A regulator asks *"how do I know these records weren't rewritten after the fact?"* The auditor takes the original record set from the host, the `evidence_id` from the seal store, and runs `verify` — independently, with their own implementation of the mechanism's verification function. `verified` is a structural guarantee, not a procedural promise. Where the seal carries `anchored_at` from a qualified TSA outside the host's control, the audit additionally establishes an upper bound on the time the records could have been forged. Invariants 2 and 3 are the structural answer.
- **Breach forensics — "when was the record altered?"** An incident responder discovers anomalous data. They query the seal store for every seal whose `record_set_ref` covers the suspect records, in `sealed_at` order. Running `verify` on each, they identify the most recent seal that returns `verified` (records intact at that time) and the next seal that returns `failed-verification` (records altered between those two seal times). The forensic window is bounded by the seal cadence; tighter cadence narrows the window. The atom does not name *who* altered the records — that is a separate Forensic Attribution composition — but it names *when* with the resolution of the seal schedule.
- **False-tamper-claim disproof.** A counterparty claims *"you modified the contract after I signed."* The system presents the contract and the seal; `verify(evidence, contract) → verified`. The claim is structurally disproven against the unmodified record set the system retains; the counterparty's burden shifts to producing a different record set they claim is the authoritative one, at which point the dispute becomes about *which version is canonical* rather than *whether it was tampered with*. The atom answers the second question; the first belongs to the Content Lock or Document Versioning composing pattern.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Tamper-evident, not tamper-proof.** The atom produces *evidence of tampering*, not *prevention of tampering*. An adversary with write access to both the records and the evidence store can rewrite both in tandem and produce a consistent-looking-but-forged audit trail. What defeats that is external anchoring — committing the proof or its root to a trust anchor outside the adversary's reach (RFC 3161 TSA, public attestation log, blockchain). Anchoring belongs to a composing pattern; the atom names the limit explicitly rather than overclaim.
- **Asynchronous external anchoring.** Where the anchoring step happens later than the seal — periodic anchoring of a Merkle-tree batch, asynchronous blockchain commitment — that is an External Anchoring composing pattern that produces its own records referencing this atom's `evidence_id`. The two-state Pending → Anchored model considered in Lineage notes was rejected to keep this atom freestanding; anchoring at seal time is captured via `anchored_at`, anchoring after the fact via a separate composition.
- **Mechanism details.** Hash-function selection (SHA-256 vs. SHA-3 vs. BLAKE3), Merkle-tree topology, signature scheme (RSA, ECDSA, EdDSA), timestamp-authority choice — all implementation policy. The atom is mechanism-neutral; the Standards references section names the families and the inheritance.
- **Non-repudiation of the seal.** Who claimed this evidence — and the verifiable proof of that claim — is the job of an [Actor Identity](./actor-identity.md) composition. When `mechanism_credential` is an actor's private key, the seal's `proof` itself carries the binding; when the credential is a system-managed key, the seal records that the system asserted the proof but does not bind it to a named actor. Both are valid; the difference is whether non-repudiation flows through. Required under 21 CFR Part 11 and HIPAA audit-control rules when the seal must be attributable to an individual.
- **Time-of-seal veracity.** `sealed_at` is captured from the implicit clock. Where the time of seal has legal force, the implementation composes Trusted Timestamping (RFC 3161); `anchored_at` from a qualified TSA produces the verifiable time-anchor.
- **Retention coupling.** Tamper-evidence outlives the records it commits to only as far as the records are retained. When the underlying record set is purged under [Retention Window](./retention-window.md), `verify` can no longer run — the original records are gone, and the atom returns `failed-verification(record-set-mismatch)` (or the host's lookup returns no record set at all). Cascading purge of seals alongside records is the composing pattern's responsibility; a seal for a destroyed record set is structurally meaningless and should be purged in step.
- **Record-set definition.** What counts as a record set — a single document, an Event Log range, a database table snapshot, a directory tree — is the host pattern's concern. The atom takes `record_set_ref` as opaque. Different mechanisms make different assumptions (Merkle trees expect a defined leaf order; hash chains expect a defined sequence) and the host must present the record set consistently at seal time and at verify time.
- **Concurrent seals on the same record set.** Two `seal` calls over the same record set produce two distinct evidence records. The atom does not deduplicate or order them; both are valid independent proofs. Coordination — *one seal per record set per cadence* — belongs to the composing pattern.
- **Concurrency and atomicity.** A crash mid-seal that leaves a partially-recorded evidence (proof computed but not persisted) is the implementor's transactional concern. The atom assumes `seal` is atomic.
- **Durability of the proof store.** The atom assumes the evidence record itself is durable. Where the evidence store can be silently rewritten by an adversary with write access, tamper-evidence is only as strong as the store's integrity — see *tamper-evident, not tamper-proof* above. External anchoring is the structural remedy.
- **Verification result caching.** `verify` is read-only and deterministic under a fixed record set, but the atom does not specify whether implementations may cache the result. Caching is implementation policy.

Where the atom breaks down: when the host environment cannot supply a stable `record_set_ref` whose contents are reproducibly addressable at verify time (mutable records under non-versioned references); when the chosen mechanism does not actually commit to the records' content (a timestamp over the records' identity alone, with no content hash); when the proof store and the record store share an adversary with write access to both and external anchoring is absent.

---

## Composition notes

Tamper Evidence is freestanding and is the integrity contract every regulated record set composes with for after-the-fact verification:

- **[Event Log](../temporal/event-log.md)** — every Event Log instance under integrity-relevant deployment composes with this atom. Sealing the log periodically — or chain-seal-per-append, for the strongest cadence — gives an external verifier the integrity property the bare Event Log names as out-of-scope. Event Log's *tamper-evidence-is-a-composing-concern* edge case is now resolved by this composition.
- **[Actor Identity](./actor-identity.md)** — when the seal must be attributable to a named actor, the `mechanism_credential` is the actor's private credential and the seal's proof binds both content and authorship. The seal record carries an Actor Identity attestation in its sidecar — or the proof itself is the attestation, when the mechanism is a digital signature over the record set. Without Actor Identity, the seal records that *the system* asserted the proof at a time; with it, the seal records *that the named actor claimed the evidence*.
- **[Retention Window](./retention-window.md)** — seals are placed under retention alongside the records they commit to. Cascading purge of evidence alongside records — when the records leave retention, the seals leave with them — is the host's responsibility. A seal for a destroyed record set is structurally meaningless; it should be purged in step.
- **External Anchoring** *(forthcoming)* — commits the proof or its root to a trust anchor outside the adversary's reach (RFC 3161 TSA, public attestation log, blockchain). Promotes tamper-evidence toward tamper-proof reach. Handles the asynchronous and batched anchoring cases the atom's `anchored_at` does not cover.
- **Trusted Timestamping** *(forthcoming, per RFC 3161)* — verifiable time-anchor for `sealed_at` and `anchored_at`.
- **Mechanism Registry** *(forthcoming)* — manages the definition, versioning, and deprecation of seal mechanisms (hash function families, signature schemes, anchoring providers).

This atom completes the canonical regulated-audit stack: [Event Log](../temporal/event-log.md) + [Actor Identity](./actor-identity.md) + [Retention Window](./retention-window.md) + Tamper Evidence as four freestanding atoms. The **[Audit Trail](../../compositions/audit-trail.md)** application is the wiring; with all four atoms grounded, the composition lands as the canonical regulated-audit primitive the library has been forecasting.

---

## Standards references

Tamper Evidence is a foundational compliance primitive with deep cryptographic and regulatory anchoring:

- **ISO/IEC 27001 §A.12.4 (Logging and Monitoring)** — the international information-security baseline for log integrity. The atom's no-silent-rewrite guarantee is the structural form.
- **FIPS 180-4 (Secure Hash Standard)** — the cryptographic foundation for hash-chain and Merkle-tree mechanisms. The atom is hash-function-neutral; FIPS 180-4 is the canonical family anchor.
- **RFC 3161 (Time-Stamp Protocol)** — the IETF standard for trusted timestamping. Qualified RFC 3161 timestamps are the canonical external-anchoring mechanism for time-of-seal verifiability under eIDAS and elsewhere.
- **NIST SP 800-92 (Guide to Computer Security Log Management)** — names log-integrity protection as a baseline requirement; tamper-evidence is the structural mechanism.
- **21 CFR Part 11 — FDA electronic records and electronic signatures** — requires electronic records to be protected against unauthorized modification and to bear evidence of any change. Composes with Actor Identity for the attribution of any modification (which Part 11 also requires).
- **DoD 5015.02-STD — Design criteria for electronic records management software** — requires records-management systems to protect against unauthorized alteration of records and audit data.
- **GDPR Article 32 (Security of Processing)** — names integrity as a property of processing that controllers must ensure with appropriate technical measures.
- **W3C Verifiable Credentials Data Model** — a standards-track format for tamper-evident attestations, with cryptographic proofs that travel with the data.
- **Certificate Transparency (RFC 9162)** — a worked public Merkle-tree append-only log; the canonical real-world deployment of public, verifiable, externally-anchored tamper-evidence at internet scale.
- **Git's commit DAG** — the most widely-deployed open-source reference for hash-chain tamper-evidence. Every modern source-control system inherits the design.
- **PCI DSS Requirement 10 (Track and monitor all access to network resources and cardholder data)** — including 10.5 (secure audit trails so they cannot be altered). The atom is the structural form.
- **eIDAS Regulation (EU 910/2014)** — qualified electronic timestamps carry presumed evidentiary effect; the atom's `anchored_at` is the operational anchor.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing external anchoring, actor attribution, time-anchor, and mechanism-registry concerns as separate atoms.
- **Eiffel's design-by-contract** — preconditions on `seal`; named rejection and verification reasons.
- **Cryptographic hash-function literature** (Merkle's tree commitments, the Merkle-Damgård construction, the SHA family) — the foundational mechanism for tamper-evident commitments.
- **Tamper-evident logging literature** (Schneier and Kelsey, *Secure Audit Logs to Support Computer Forensics*, 1999) — the formal framing of hash-chain audit logs as forensically-useful primitives.

---

## Generation acceptance

A derived implementation of Tamper Evidence is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the seal store plus the originating record sets, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct any seal from its stored fields.** `evidence_id`, `record_set_ref`, `proof`, `sealed_at`, and `anchored_at` (if present) are sufficient for the verifier; no additional state is consulted beyond the originating record set.
- **Verify each seal independently.** `verify(evidence_id, original_record_set)` is a function of the seal and the presented record set. The auditor can run verification themselves with their own implementation of the mechanism's verification function — no privileged access to the system required.
- **Detect any tampering with the originating records.** A single-byte modification to the record set since `sealed_at` causes `verify` to return `failed-verification(proof-invalid)` (Invariant 2).
- **Distinguish the three verify outcomes.** `verified`, `failed-verification(reason)`, and `not-known` are observable as distinct first-class results, with the reason on `failed-verification` distinguishing record-set-mismatch from proof-invalid.
- **Bound the forensic window of any detected tampering.** Where multiple seals over the same record set exist at different `sealed_at` times, the auditor can run `verify` against each and bound *when* the tampering occurred to between two adjacent seal times.
- **Identify the composing patterns active in this deployment.** Whether External Anchoring, Trusted Timestamping, Actor Identity, Mechanism Registry, and Retention Window are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce seals and a verification surface that pass the six checks above. The bar is the regulator's question — *"can you prove these records weren't altered after the fact?"* — answered structurally from the records and the proof, not procedurally from runtime claims.

---

## Status

`grounded — last full rescan: 2026-05-13` — all required structural elements resolved; identity model explicit; action signatures with fully-named rejection taxonomies including `storage-failure` and `mechanism-verification-unavailable`; nine invariants including seal store durability (Invariant 9) and mechanism-soundness qualification on Invariant 2; five cross-domain examples; regulated adversarial scenarios; eleven edge cases. Third entry in `atoms/compliance/`. Survived one foundation pass and one refinement round.

---

## Lineage notes

This atom survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)) on its first iteration. The two regulated-pattern conventions canonicalized in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) — *Regulated adversarial scenarios* and *Generation acceptance* — were baked in from the first draft; this atom inherits both conventions from the methodology directly rather than from any specific predecessor.

**Pass 1 — Structural completeness (GRID).** Clean. All nine GRID nodes resolved with their references intact. State is a single stable state (Sealed) with no transitions out, matching the shape [Actor Identity](./actor-identity.md) established for read-only-query compliance atoms — verification is captured under Decision points with its three first-class outcomes rather than forced into the success-or-rejection mold the lifecycle atoms use.

**Pass 2 — Conceptual independence (EOS).** Clean. Six concerns were candidates for absorption and all six are correctly named as composing patterns rather than folded in:

- *Asynchronous external anchoring* — a separate concept that recurs across every tamper-evidence deployment that needs tamper-*proof* reach. Composes with an External Anchoring pattern; the atom carries an optional `anchored_at` for the case where the chosen mechanism anchors synchronously at seal time, but later, asynchronous, or batched anchoring is the composition's concern.
- *Mechanism selection and registry* — hash-function family, signature scheme, anchoring provider all evolve over time (algorithm deprecation, key rotation, vendor changes); the atom is mechanism-neutral by design and a Mechanism Registry composing pattern handles the lifecycle.
- *Non-repudiation of the seal* — a recurring composition with [Actor Identity](./actor-identity.md) rather than an absorbed concern. The `mechanism_credential` parameter is the composition point; whether non-repudiation flows through depends on the credential's nature, not on the atom's surface.
- *Time-anchor* — clock-veracity is a deployment concern composing with Trusted Timestamping.
- *Retention coupling* — cascading purge of seals alongside records is the host composition's responsibility, not the atom's; the atom's seals outlive their records only as far as the records are retained.
- *Record-set definition* — what counts as a record set is the host pattern's concern; the atom takes `record_set_ref` as opaque.

The temptation to absorb mechanism into the atom was the strongest of these — naming a specific hash-chain or Merkle-tree shape would have made the spec more concrete — but Pass 2 caught it: the atom's contract is *what the proof demonstrates*, not *which primitive produced it*, and the mechanism-neutrality is what lets Git's commit DAG, RFC 3161 timestamps, and blockchain anchors all be recognized as instances.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern:

- *Verify asymmetry vs. Actor Identity.* Early drafts mirrored Actor Identity's `verify(id) → verified | failed-verification | not-known` signature, with no second argument. Pass 3 caught it: the proof commits to the records' *content*, not to the records' *identity alone*, so the verifier must re-present the original record set to detect modification. Resolved: `verify(evidence_id, original_record_set)` with the asymmetry surfaced explicitly in Behavior, captured in Invariant 4 (verification self-containment *given the originating records*), and called out in Composition notes alongside the implications for retention coupling. This is the load-bearing structural difference between this atom and Actor Identity and the most consequential Pass 3 finding.
- *Two-state model (Pending → Anchored) considered and rejected.* An alternative design promoted external anchoring to a first-class state transition: a seal entered Pending at seal time and transitioned to Anchored when the proof was committed to a trust anchor. Pass 3 surfaced the question; on examination the two-state model absorbed a concern (anchoring) that is mechanism-specific and recurs separately. Some mechanisms (Git) do not anchor at all; some (RFC 3161 timestamps embedded in the proof) anchor synchronously at seal time; some (batched Merkle-root anchoring) anchor asynchronously and on a separate cadence. Resolved: a single Sealed state, with optional `anchored_at` for synchronous anchoring and an External Anchoring composing pattern for asynchronous cases. The atom stays freestanding; the variation lives in composition.
- *Tamper-evident vs. tamper-proof.* Early drafts implied the atom prevented tampering. Resolved: explicit *the atom produces evidence of tampering, not prevention of tampering* in Behavior, with an Edge cases entry naming the limit and pointing to External Anchoring as the structural remedy. The honest framing matches what cryptography literature actually claims and what regulators actually accept.
- *Retention coupling was unaddressed.* The first draft did not name what happens when the records the seal commits to are purged under [Retention Window](./retention-window.md). Resolved: explicit Edge cases entry — tamper-evidence outlives the records it commits to only as far as the records are retained; cascading purge of seals alongside records is the composing pattern's responsibility; a seal for a destroyed record set is structurally meaningless. Surfaced as a Composition notes paragraph as well.

Three deferred concerns are named as explicit out-of-scope rather than fixed in-pattern: concurrency and atomicity, durability of the proof store (composes with External Anchoring), and verification result caching (implementation policy).

**Structural milestone.** This atom is the final constituent of the canonical regulated-audit stack the library has been forecasting since the first regulated atom landed. With [Event Log](../temporal/event-log.md), [Actor Identity](./actor-identity.md), [Retention Window](./retention-window.md), and Tamper Evidence all grounded, the [Audit Trail](../../compositions/audit-trail.md) application — the composition that wires the four atoms into the audit primitive every regulated system implements — now lands as the destination the library has been building toward. Each of the four atoms references the others' forthcoming-link in its Composition notes; with this atom landed, those forthcoming-links became resolvable, and with Audit Trail landed, they are resolved.

The three passes together exercise the architecture as designed: GRID catches structural completeness (the small one-state model is complete, with verify under Decision points); EOS catches the six absorption temptations (especially mechanism, which the atom must remain neutral about); Linus catches the four hidden decisions (verify asymmetry, two-state-model temptation, tamper-evident-vs-tamper-proof framing, retention coupling). The atom is stronger because all three checks happened.

**Refinement round 1 — re-run of all three passes.** Four findings, all closed in-pattern:

- *Action signature incompleteness (Pass 1 / Pass 3).* Both actions carried placeholder reason tokens. `seal` used `rejected(reason)`; `verify` used `failed-verification(reason)`. Resolved: `seal` updated to `rejected(invalid-request | mechanism-failure(reason) | storage-failure)`; `verify` updated to `failed-verification(proof-invalid | record-set-mismatch | mechanism-verification-unavailable)`. Two items are new: `storage-failure` on seal and `mechanism-verification-unavailable` on verify — see below.
- *`storage-failure` on `seal` unnamed (Pass 3).* If the seal store write fails after the proof is computed, the atom had no named outcome. The proof is discarded and no seal is recorded. Resolved: `storage-failure` added to `seal`'s rejection taxonomy; Decision points updated to state the guarantee that no partial record is written and that the computed proof is discarded on failure.
- *`mechanism-verification-unavailable` on `verify` unnamed (Pass 3).* RFC 3161 verification may require consulting the TSA's published certificate chain; if the TSA is unavailable at verify time, neither `proof-invalid` (no tampering) nor `record-set-mismatch` (right records) is correct. The failure is transient and retriable — distinct from the other two permanent failure outcomes. Resolved: `mechanism-verification-unavailable` added as a third `failed-verification` reason; Decision points distinguish it explicitly from `proof-invalid` and note its transient-and-retriable nature.
- *Invariant 2 (detectability) overstated (Pass 3).* The invariant was stated unconditionally: "if the record set is modified after `sealed_at`, then `verify` returns `failed-verification(proof-invalid)`." This holds only when the mechanism is cryptographically sound. A deprecated hash function with known practical collision attacks can produce `verified` on tampered records. The invariant's absoluteness matches what a regulator expects but not what cryptography literature claims. Resolved: Invariant 2 qualified with "provided the mechanism is cryptographically sound"; re-sealing under a sound mechanism before deprecating an old one named as the operational response; Mechanism Registry composing pattern cited.
- *No seal store durability invariant (Pass 3).* The single-state model implies seals are permanent, but no invariant said so explicitly. Resolved: Invariant 9 (*Seal store durability*) added, naming the monotonically non-decreasing seal count, the absent deletion surface, the `storage-failure` consistency guarantee, and the specific reason the seal must survive its originating records (it is the audit evidence of their existence and integrity up to seal time).

Pass 2 was clean: no new over-absorptions. All four fixes are in-pattern.
