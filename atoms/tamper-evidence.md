---
title: Tamper Evidence
parent: Atomic Concepts
has_toc: true
toc: true
---

# Tamper Evidence

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Tamper Evidence answers the question "how do I know these records weren't altered after the fact?" It works through seals — permanent records that attach a cryptographic proof to the records they cover. A proof is a mathematical fingerprint of a set of records as they stood at a moment in time. Sealing computes that fingerprint and stores it. Verifying re-computes the fingerprint over the original records and compares. If anything was changed, the fingerprint no longer matches, and the check fails. The crucial limit is that this detects tampering rather than preventing it. It cannot stop someone with full write access from altering both the records and the seal. But it makes any alteration visible to anyone holding the original records and the seal. The pattern is deliberately neutral about the cryptographic method used, as long as the guarantee holds: any change since sealing is detectable from the records alone. This is the mechanism behind sealing financial transaction journals, medical-record change logs, and payment-card access logs so auditors can confirm nothing was rewritten — and behind Git's commit history, the most widely deployed example. It does not, on its own, prevent tampering, prove who created the seal, or guarantee the seal's timestamp. Each of those is a separate pattern layered on top.

---

## Intent

Regulated systems must demonstrate that the records they keep have not been altered after the fact. Auditors, regulators, and adverse parties accept the system's records only when the integrity of those records survives independent verification. The shape is constant across domains: at record-creation time, or in batch over a record set, the system produces a [Proof] — a cryptographic commitment to the records' content — that can later be verified to detect any modification. Hash chains, Merkle trees (a data structure where each entry's hash includes the previous entries' hashes — making the chain tamper-detectable as a whole), and external anchoring to a trust anchor outside the system's control (for example, an RFC 3161 — Internet standard "Request for Comments" document 3161 — qualified timestamp service) are all valid mechanisms; the atom is neutral about which one a deployment chooses.

The pattern addresses the *has this been altered?* question that audit trails alone cannot answer. An [Event Log](./event-log.md) records what happened; an [Actor Identity](./actor-identity.md) attestation records who authorized it; a [Retention Window](./retention-window.md) record bounds the lifetime; but none of the three answers the regulator's question *"how do I know these records weren't rewritten after the fact?"* Tamper Evidence is the structural answer: tampering is detectable from the records.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the [Evidence] record), its own actions ([Seal], [Verify]), and its own operational principles (proofs are immutable; verification is a read-only function of the [Evidence] record and the originating record set). It does not implement record storage, the underlying hash function or signature scheme, asynchronous external anchoring, actor-bound non-repudiation of the [Evidence], or the time anchor that gives the [Evidence] a trustworthy timestamp. Each is a separate composable concept; see Composition notes.

The atom contracts on *what the [Proof] demonstrates* — any tampering is detectable from the records alone — not on *which crypto primitive produced it*. Implementations choosing hash chains (Git's commit DAG — Directed Acyclic Graph, a graph of commits linked by parent hashes), Merkle trees (Certificate Transparency, blockchain leaf commitments), or qualified-timestamp anchoring (RFC 3161) all satisfy the same contract. The mechanism is implementation policy.

---

## Structure

### Identity model

Every [Evidence] known to the system has an **[Evidence Id]** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it); the id is produced by [Seal]. The id is the [Evidence]'s identity; the [Record Set Ref], [Proof], [Sealed At], and optional external anchor are immutable *properties* of the [Evidence], not its identity.

Two [Evidence] records over the same record set — for instance, re-sealing under a new mechanism after an algorithm-deprecation event, or layering a stronger anchor on top of an earlier seal — have different ids. Each is its own audit record. Ids are not reused.

The opaque-id model preserves the per-evidence audit discipline the other regulated atoms enforce. Identifying an [Evidence] by [Record Set Ref] would collapse legitimate re-seals; identifying by timestamp would lose precision under concurrent seals. Opaque ids let auditors reconstruct the integrity history of any record set as a sequence of [Evidence] records, each with its own lifecycle.

### Inputs

- A [Record Set Ref] identifying *what* is being sealed. The atom treats this as opaque — the host pattern defines what a record set is, how to address it, and how to present it to [Verify] later.
- A [Mechanism Credential] — opaque material the chosen mechanism consumes at seal time to produce the [Proof]. For unkeyed mechanisms (bare hash chains, public commitments) this may be empty or a configuration handle; for keyed mechanisms (signed roots, HMAC — Hash-based Message Authentication Code, a hash that also verifies the key used to produce it — chains, qualified electronic signatures) it is the keying material. The atom consumes the [Mechanism Credential] at [Seal] time and never persists it.
- [Seal] — record a new [Evidence] over a record set, computing the [Proof] from the [Mechanism Credential]. (Projected contract: `seal(record_set_ref, mechanism_credential) → evidence_id | rejected(invalid-request | mechanism-failure(reason) | storage-failure)`.)
- [Verify] — confirm a recorded [Evidence] against a presented record set, by id. (Projected contract: `verify(evidence_id, original_record_set) → verified | failed-verification(proof-invalid | record-set-mismatch | mechanism-verification-unavailable) | not-known`.)
- A clock providing wall-time timestamps, an id source for [Evidence Id] allocation, and the cryptographic primitive (and any entropy) the [Proof] computation requires — all injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock, allocates the [Evidence Id], and supplies the cryptographic material at the seam, *before* the transition runs. The pure transition receives them as inputs. It reads no clock, mints no id, and generates no randomness internally. None is supplied by the business caller; the [Mechanism Credential] remains the only caller-supplied secret. Confining them to the seam is what keeps the transition deterministic.

### Outputs

- The current set of [Evidence] records.
- For each [Evidence]: [Evidence Id], [Record Set Ref], [Proof], [Sealed At], and (if produced at seal time) [Anchored At].
- [Seal] returns the new [Evidence Id] on success, or a rejection naming the failed precondition.
- [Verify] returns [Verified], [Failed Verification], or [Not Known]. The [Verify] call itself does not modify state.

### State

A single stable state: **[Sealed]**. There are no transitions out of [Sealed] — the atom has no surface for revoking, invalidating, modifying, or re-anchoring an [Evidence] once it is recorded. Verification is a read-only query over the [Evidence]'s stored fields and the originating record set the verifier presents. A two-state model that promoted external anchoring to a first-class transition (Pending → Anchored) was considered and rejected; see the commit history.

Each [Evidence] carries:

- **[Evidence Id]** — opaque, immutable, host-allocated at the seam (see Inputs). Set on [Seal]. Never changes.
- **[Record Set Ref]** — opaque reference to the record set the [Proof] commits to. Set on [Seal]. Never changes.
- **[Proof]** — the cryptographic artifact (hash chain, Merkle root, signed root, RFC 3161 timestamp token, blockchain transaction id, or composite) the mechanism produced. Set on [Seal]. Never changes.
- **[Sealed At]** — wall-time when the [Evidence] was recorded. Set on [Seal]. Never changes.
- **[Anchored At]** — present only if the chosen mechanism produced an external anchor at seal time (for example, the seal mechanism called an RFC 3161 timestamp authority synchronously and recorded the timestamp token's time). Set on [Seal] if produced; never changes. Absent for mechanisms that do not anchor at seal time. Later, asynchronous anchoring belongs to an External Anchoring composing pattern with its own records.

Transitions:

- [Seal] → a new [Evidence] record is created in [Sealed] with the injected [Evidence Id], the supplied [Record Set Ref], the [Proof] computed from the injected cryptographic primitive material (and the consumed [Mechanism Credential]), [Sealed At] stamped from the injected [Now] (read at the seam before the transition; see Inputs), and (if the mechanism produced one) [Anchored At]. Returns [Evidence Id].
- *(no other transitions)*

### Flow

1. **Composing pattern asserts integrity of a record set.** At record-set creation, on a schedule, or on demand, the host calls [Seal] with a [Record Set Ref] and a [Mechanism Credential].
2. **Atom invokes the mechanism and records the [Evidence].** The mechanism computes the [Proof] over the record set; the atom records the [Evidence] and returns the id. If the mechanism does external anchoring synchronously, the anchor result is captured in [Anchored At].
3. **Time passes; the [Evidence] persists.** The host system stores the [Evidence Id] alongside whatever it represents (the [Event Log](./event-log.md) instance, the document, the record batch).
4. **An auditor, verifier, or composing pattern checks integrity.** The verifier presents both the [Evidence Id] and the originating record set to [Verify], passing the [Original Record Set]. The atom retrieves the [Evidence], re-runs the mechanism's verification function over the record set against the recorded [Proof], and returns the result.

### Decision points

**At [Seal].** [Record Set Ref] must contain at least one non-whitespace character. [Mechanism Credential] must be present — it may be empty for unkeyed mechanisms, but must not be absent entirely. Either failing gives [Invalid Request]. The mechanism must be able to compute a [Proof] against the record set; otherwise [Mechanism Failure] — for example, the underlying records are unreadable, the keying material does not satisfy the mechanism's preconditions, or an external anchor service is unreachable for a mechanism that requires synchronous anchoring. The [Mechanism Credential] is *consumed*, never stored. If the seal store write fails after the [Proof] is computed, the atom returns [Storage Failure]. No [Evidence] is recorded, and the computed [Proof] is discarded. Durability of the seal store is implementation-owned.

**At [Verify].** The atom resolves the outcome in a fixed precedence order: it confirms the [Evidence] exists, then confirms the presented record set matches, then checks the [Proof], and only then returns [Verified]. The first matching condition decides the outcome.

| Order | Condition | Outcome |
|-------|-----------|---------|
| 1 | [Evidence Id] references no recorded [Evidence] | [Not Known] |
| 2 | presented [Original Record Set] does not refer to the record set the [Evidence] was made over | [Failed Verification] ([Record Set Mismatch]) |
| 3 | the mechanism's verification function requires an external service that is unavailable at verify time | [Failed Verification] ([Mechanism Verification Unavailable]) |
| 3 | the mechanism's verification function, run over the presented record set against the stored [Proof], does not check out | [Failed Verification] ([Proof Invalid]) |
| 4 | none of the above — the [Proof] checks out | [Verified] |

The order is what keeps the outcomes distinct. [Not Known] is an [Evidence Id] lookup miss, resolved first, before any record-set or proof check. The asymmetry from [Actor Identity](./actor-identity.md)'s [Verify](./actor-identity.md#verify) is resolved next: [Verify] *requires* the [Original Record Set] because the [Proof] commits to content, so an absent or wrong record set is [Record Set Mismatch] — not [Not Known]. The reasons under [Failed Verification] are then distinguished by *why* the check could not pass. [Proof Invalid] is the structural signal of tampering — a present proof that fails against the presented records. [Record Set Mismatch] is a caller error — the wrong records were presented. [Mechanism Verification Unavailable] is a transient, retryable failure — an external service the mechanism's verification function consults (for example, an RFC 3161 TSA's published certificate chain) is unavailable, and the verifier may retry when it returns. All three are distinct from each other and from [Not Known]. [Verify] never *rejects* in the same sense as [Seal]. [Verified], [Failed Verification], and [Not Known] are three legitimate first-class outcomes, and a composing pattern should treat each distinctly. [Verify] writes nothing on any path — it is a read-only query that leaves the [Evidence] record untouched.

### Behavior

Observed behavior, derived from how regulated systems use tamper-evidence:

- The atom is mechanism-neutral. An [Evidence] produced by a SHA-256 hash chain, by a Merkle tree with a signed root, or by a blockchain anchor all satisfy the same contract: any tampering is detectable from the records alone, given the [Proof] and the originating record set. The choice of mechanism is implementation policy and is recorded outside the atom (typically in a Mechanism Registry composing pattern, or implicit in the deployment's configuration).
- Verification is *not* self-contained in Actor Identity's sense. Where [Actor Identity](./actor-identity.md)'s [Verify](./actor-identity.md#verify) needs only the attestation and the actor registry's public material, Tamper Evidence's [Verify] needs the [Original Record Set] the [Proof] commits to. This asymmetry is structural: the [Proof] commits to the records' content, and the verifier must re-present that content to detect modification. A verifier who presents an absent or wrong record set gets [Failed Verification] for reason [Record Set Mismatch] — not [Not Known]. ([Not Known] is exclusively an [Evidence Id] lookup miss: the id is not in the seal store.)
- [Seal] never modifies an existing [Evidence] record. It always creates a new one. Re-sealing the same record set under a stronger mechanism (after a hash-function deprecation, after the prior credential is rotated) produces a separate [Evidence] with its own id. Multiple [Evidence] records over the same record set accumulate as independent audit evidence.
- The [Mechanism Credential] is consumed at seal time and never persisted by the atom. Credential management — storage, rotation, recovery, HSM binding — is an entirely separate concept.
- The atom produces *evidence of tampering*, not *prevention of tampering*. An adversary with write access to both the records and the evidence store can rewrite both in tandem and produce a consistent-looking-but-forged audit trail. What defeats that is external anchoring — committing the [Proof] or its root to a trust anchor outside the adversary's reach. Anchoring is a composing concept; the bare atom names it but does not enforce it.
- **Time, id, and cryptographic material are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (`execution-contract.md`), the host reads the clock, allocates the [Evidence Id], and supplies the cryptographic primitive and entropy at the deployment seam before [Seal]'s transition runs; [Verify]'s cryptographic check likewise runs against injected primitive material. The core transition is a pure function of its caller inputs and these injected inputs — it reads no wall clock, mints no id, and improvises no crypto internally. This is the determinism the execution contract requires, and it leaves the caller signatures ([Seal], [Verify]) unchanged.
- Wall-time is best-effort. [Sealed At] is stamped from the injected [Now], read at the seam before the transition. Clock *access* is confined to the seam; clock *quality* — whether that clock is honest, monotonic, or synchronized — is a quality-of-deployment question, not something the atom governs. Where the time of seal matters to the verifier (statute of limitations, regulatory timing rules), the implementation composes Trusted Timestamping; [Anchored At] from an RFC 3161 timestamp authority is the verifiable form.

### Feedback

Each successful action produces an observable, measurable change:

- After [Seal] — a new [Evidence] record appears with a fresh [Evidence Id], the supplied [Record Set Ref], the computed [Proof], [Sealed At], and (if produced) [Anchored At]. Total count increases by one. The id is returned.
- After [Verify] — no state change. The atom returns one of [Verified], [Failed Verification], or [Not Known].

Each rejected [Seal] action produces an observable refusal: [Invalid Request], [Mechanism Failure], or [Storage Failure]. Each [Verify] outcome is a first-class result (not a rejection): [Verified], [Failed Verification] (for [Proof Invalid], [Record Set Mismatch], or [Mechanism Verification Unavailable]), or [Not Known].

The [Evidence] set is queryable. Per-[Evidence] fields are observable to auditors and operators; the original record set required for verification is fetched from the host's record store, not from this atom.

### Invariants

The following invariants (conditions that must always hold, regardless of what sequence of actions has occurred) constitute the verification surface of the atom:

- **Invariant 1 — Evidence immutability.** Once recorded, an [Evidence]'s [Evidence Id], [Record Set Ref], [Proof], [Sealed At], and [Anchored At] (if present) never change.
- **Invariant 2 — Detectability of tampering.** For any [Evidence] in the system, if the record set referenced by [Record Set Ref] is modified after [Sealed At], then [Verify] over the modified record set returns [Failed Verification] for reason [Proof Invalid]. The contract is detectability from the records alone, given the [Proof] and the originating record set. This guarantee holds provided the mechanism is cryptographically sound — specifically, that the mechanism's hash function or signature scheme has no known practical collision or forgery attacks. A deprecated mechanism with known weaknesses may fail to detect carefully crafted tampering. Mechanism health is a Mechanism Registry composing concept; seals produced under deprecated mechanisms should be re-sealed under a sound mechanism before the old one is deprecated.
- **Invariant 3 — Record-set binding.** For any [Evidence] in the system, the recorded [Proof] verifies against the record set referenced by [Record Set Ref] and only against that record set. A [Proof] made over a different record set does not verify against this [Evidence].
- **Invariant 4 — Verification self-containment given the originating records.** [Verify], given an [Evidence Id] and the presented [Original Record Set], requires only the [Evidence]'s stored fields and the presented [Original Record Set]. No additional out-of-band data is consulted at verify time, except where the chosen mechanism's verification function itself consults an external anchor (for example, an RFC 3161 verification consults the timestamp authority's published certificate). Mechanism-induced external dependencies are themselves implementation policy.
- **Invariant 5 — Id stability.** An [Evidence]'s [Evidence Id] is set on [Seal] and never changes.
- **Invariant 6 — No id reuse.** No two [Evidence] records share an [Evidence Id] across the lifetime of the system.
- **Invariant 7 — Verification consistency under a fixed record set.** For any [Evidence] and any fixed [Original Record Set], repeated [Verify] calls return the same result. Verification results may differ across record-set states — that is detectability working as designed.
- **Invariant 8 — Mechanism opacity.** The atom's contract holds regardless of which mechanism produced the [Proof]. Hash chain, Merkle tree, signed root, RFC 3161 timestamp token, blockchain anchor, or composite — the contract is on what the [Proof] demonstrates, not on which primitive produced it. See Invariant 2's qualification: this holds for cryptographically sound mechanisms.
- **Invariant 9 — Seal store durability.** Once recorded, an [Evidence] is never deleted from the store. The [Evidence] set is monotonically non-decreasing. The atom provides no deletion surface; cascading deletion under a retention policy is the composing pattern's responsibility (see [Retention Window](./retention-window.md) in Composition notes). A [Storage Failure] rejection guarantees no partial [Evidence] record was written. An [Evidence] that survives its originating records provides audit evidence of their existence and integrity up to the seal time; deleting it would destroy that evidence.

Evidence immutability and detectability together give the *integrity* property — the regulator's question *"have these records been altered?"* has a structural answer rather than a procedural one. Verification self-containment given the originating records names the asymmetry from Actor Identity: a verifier must hold the records, not just the [Evidence], to decide.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Financial — transaction-log anchoring under SOX

A bank's settlement system seals each day's transaction journal: `seal(journal_2026-05-10, hsm_signing_key) → evidence_a91`. The mechanism is a SHA-256 (Secure Hash Algorithm, 256-bit — a standard cryptographic hash function) hash chain over the day's transactions, with the chain's tail signed by an HSM-bound (Hardware Security Module — a dedicated tamper-resistant device for keys) key. Once per hour, the chain tail is anchored to an RFC 3161 qualified timestamp authority; the authority's timestamp token is recorded as [Anchored At] on the seal. Seven years later, during a SOX (Sarbanes-Oxley Act — US financial reporting law) §404 audit, the external auditor presents the journal and `verify(a91, journal_2026-05-10) → verified` — confirming the day's transactions were not altered after the seal, with the qualified timestamp giving an upper bound on when they could have been forged.

### Healthcare — EHR change-log integrity under HIPAA and 21 CFR Part 11

A hospital EHR (Electronic Health Record — the digital patient chart system) appends every record amendment (correction, addendum, redaction) to a per-patient change log. The change log is sealed on a rolling Merkle-tree basis — each commit produces a new root and a new seal. `verify(seal, patient_change_log) → verified` confirms the log has not been silently rewritten since the seal. A correction added today is a new event in the log, not a modification of yesterday's; if anyone retroactively edited yesterday's entry, today's seal would fail verification. 21 CFR Part 11's (the US Code of Federal Regulations rule on electronic records and signatures) and HIPAA's (US Health Insurance Portability and Accountability Act) electronic-record integrity bar is satisfied structurally.

### Source control — Git's commit DAG

A developer pushes a commit. Git computes the cryptographic hash (a fixed-length fingerprint computed from data — any change to the data produces a different fingerprint) of the commit object — which includes the hash of its parent commits — and stores the object under that hash. The hash *is* the [Proof]: the commit's content, its parents, and (transitively) the entire history are committed to in one chain. `git fsck` is the verification function; tampering anywhere in the history produces a hash mismatch detectable from the repository alone. The commit DAG is a worked open-source instance of this atom — [Evidence Id] = commit hash, [Record Set Ref] = the commit's tree and parents, [Proof] = the chained hashes, [Sealed At] = the commit timestamp. Linus Torvalds built the world's most widely-deployed Tamper Evidence implementation; the atom names what it does in domain-neutral terms.

### Legal — document notarization under RFC 3161 trusted timestamping

A law firm timestamps an executed contract via a qualified Time-Stamp Authority (TSA — a trusted third party that issues signed proofs that data existed at a given time). The mechanism is RFC 3161: a hash of the contract is submitted to the TSA; the TSA returns a signed TimeStampToken binding the hash to a trusted time. The token *is* the [Proof]; [Anchored At] is set from the TSA's timestamp. Any future dispute — opposing counsel claims the contract was modified post-signing — is resolved by `verify(evidence, contract_pdf) → verified | failed-verification(proof-invalid)`. eIDAS Regulation (Electronic Identification, Authentication and Trust Services — the EU regulation governing electronic signatures and timestamps) gives qualified electronic timestamps presumed evidentiary effect across the EU.

### Payments — PAN-handling audit under PCI DSS

A payment processor seals each day's cardholder-data access log: `seal(pan_access_log_2026-05-10, processor_key) → evidence_p41`. The mechanism is an HMAC-SHA-256 chain — each entry's MAC (Message Authentication Code) includes the previous entry's MAC and the entry's content. PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for cardholder data; here applied to PAN, the Primary Account Number) Requirement 10.5 mandates audit-log integrity; the seal is the structural form. A QSA's (Qualified Security Assessor — a PCI-certified auditor) annual assessment runs `verify` over the prior year's daily logs; any tampering — whether to hide a cardholder-data exfiltration or to forge access for a fraudulent dispute — is detected from the logs themselves.

The mechanic is identical across all five. What differs: the mechanism family (hash chain, Merkle tree, qualified timestamp), the frequency of sealing (per-commit, per-amendment, per-document, per-day), the anchoring story (none, RFC 3161 TSA, blockchain), and the composing patterns active around it (Actor Identity for authored seals, Trusted Timestamping for qualified anchors, External Anchoring for tamper-proof reach).

### Rejection and verification-failure paths

**Tampering detected — [Proof Invalid].** An incident response team queries a transaction journal seal and presents the journal as it exists now — after a discovered alteration:

```
verify(evidence_id: "evidence_a91", original_record_set: journal_2026-05-10_altered)
→ failed-verification(proof-invalid)
```

The [Proof] no longer matches the altered record set. The team then presents the prior day's backup copy of the journal:

```
verify(evidence_id: "evidence_a91", original_record_set: journal_2026-05-10_backup)
→ verified
```

`verified` confirms the backup matches what was sealed; `proof-invalid` on the altered version confirms the alteration occurred after [Sealed At]. The forensic window is bounded by the two seal timestamps.

**Wrong record set presented — [Record Set Mismatch].** A verifier accidentally presents the wrong day's journal to a seal:

```
verify(evidence_id: "evidence_a91", original_record_set: journal_2026-05-11)
→ failed-verification(record-set-mismatch)
```

The presented record set does not match the [Record Set Ref] the [Evidence] was made over. This is not a tampering signal — it is a caller error, structurally distinguishable from `proof-invalid`.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator integrity audit.** A regulator asks *"how do I know these records weren't rewritten after the fact?"* The auditor takes the original record set from the host, the [Evidence Id] from the seal store, and runs [Verify] — independently, with their own implementation of the mechanism's verification function. [Verified] is a structural guarantee, not a procedural promise. Where the [Evidence] carries [Anchored At] from a qualified TSA outside the host's control, the audit additionally establishes an upper bound on the time the records could have been forged. Invariants 2 and 3 are the structural answer.
- **Breach forensics — "when was the record altered?"** An incident responder discovers anomalous data. They query the seal store for every [Evidence] whose [Record Set Ref] covers the suspect records, in [Sealed At] order. Running [Verify] on each, they identify the most recent [Evidence] that returns [Verified] (records intact at that time) and the next [Evidence] that returns [Failed Verification] (records altered between those two seal times). The forensic window is bounded by the seal cadence; tighter cadence narrows the window. The atom does not name *who* altered the records — that is a separate Forensic Attribution composition — but it names *when* with the resolution of the seal schedule.
- **False-tamper-claim disproof.** A counterparty claims *"you modified the contract after I signed."* The system presents the contract and the [Evidence]; `verify(evidence, contract) → verified`. The claim is structurally disproven against the unmodified record set the system retains; the counterparty's burden shifts to producing a different record set they claim is the authoritative one, at which point the dispute becomes about *which version is canonical* rather than *whether it was tampered with*. The atom answers the second question; the first belongs to the Content Lock or Document Versioning composing pattern.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Tamper-evident, not tamper-proof.** The atom produces *evidence of tampering*, not *prevention of tampering*. An adversary with write access to both the records and the evidence store can rewrite both in tandem and produce a consistent-looking-but-forged audit trail. What defeats that is external anchoring — committing the [Proof] or its root to a trust anchor outside the adversary's reach (RFC 3161 TSA, public attestation log, blockchain). Anchoring belongs to a composing pattern; the atom names the limit explicitly rather than overclaim.
- **Asynchronous external anchoring.** Where the anchoring step happens later than the seal — periodic anchoring of a Merkle-tree batch, asynchronous blockchain commitment — that is an External Anchoring composing pattern that produces its own records referencing this atom's [Evidence Id]. The two-state Pending → Anchored model considered at authoring was rejected to keep this atom freestanding; anchoring at seal time is captured via [Anchored At], anchoring after the fact via a separate composition.
- **Mechanism details.** Hash-function selection (SHA-256 vs. SHA-3 vs. BLAKE3 — alternative cryptographic hash functions), Merkle-tree topology, signature scheme (RSA — Rivest-Shamir-Adleman, ECDSA — Elliptic Curve Digital Signature Algorithm, EdDSA — Edwards-curve Digital Signature Algorithm), timestamp-authority choice — all implementation policy. The atom is mechanism-neutral; the Standards references section names the families and the inheritance.
- **Non-repudiation of the seal.** Who claimed this evidence — and the verifiable proof of that claim — is the job of an [Actor Identity](./actor-identity.md) composition. When [Mechanism Credential] is an actor's private key, the [Evidence]'s [Proof] itself carries the binding; when the credential is a system-managed key, the [Evidence] records that the system asserted the [Proof] but does not bind it to a named actor. Both are valid; the difference is whether non-repudiation flows through. Required under 21 CFR Part 11 and HIPAA audit-control rules when the seal must be attributable to an individual.
- **Time-of-seal veracity.** [Sealed At] is stamped from the injected [Now], read at the seam before the transition (see Inputs and Behavior); clock *access* is confined to the seam, but clock *quality* — whether that clock is honest, monotonic, or synchronized — is a quality-of-deployment question, not something the atom governs. Where the time of seal has legal force, the implementation composes Trusted Timestamping (RFC 3161); [Anchored At] from a qualified TSA produces the verifiable time-anchor.
- **Retention coupling.** Tamper-evidence outlives the records it commits to only as far as the records are retained. When the underlying record set is purged under [Retention Window](./retention-window.md), [Verify] can no longer run — the original records are gone, and the atom returns [Failed Verification] for reason [Record Set Mismatch] (or the host's lookup returns no record set at all). Cascading purge of seals alongside records is the composing pattern's responsibility; a seal for a destroyed record set is structurally meaningless and should be purged in step.
- **Record-set definition.** What counts as a record set — a single document, an [Event Log](./event-log.md) range, a database table snapshot, a directory tree — belongs to the host pattern. The atom takes [Record Set Ref] as opaque. Different mechanisms make different assumptions (Merkle trees expect a defined leaf order; hash chains expect a defined sequence) and the host must present the record set consistently at seal time and at verify time.
- **Concurrent seals on the same record set.** Two [Seal] calls over the same record set produce two distinct [Evidence] records. The atom does not deduplicate or order them; both are valid independent proofs. Coordination — *one seal per record set per cadence* — belongs to the composing pattern.
- **Concurrency and atomicity.** A crash mid-seal that leaves a partially-recorded [Evidence] ([Proof] computed but not persisted) is the implementor's transactional obligation. The atom assumes [Seal] is atomic.
- **Durability of the proof store.** The atom assumes the [Evidence] record itself is durable. Where the evidence store can be silently rewritten by an adversary with write access, tamper-evidence is only as strong as the store's integrity — see *tamper-evident, not tamper-proof* above. External anchoring is the structural remedy.
- **Verification result caching.** [Verify] is read-only and deterministic under a fixed record set, but the atom does not specify whether implementations may cache the result. Caching is implementation policy.

Where the atom breaks down: when the host environment cannot supply a stable [Record Set Ref] whose contents are reproducibly addressable at verify time (mutable records under non-versioned references); when the chosen mechanism does not actually commit to the records' content (a timestamp over the records' identity alone, with no content hash); when the proof store and the record store share an adversary with write access to both and external anchoring is absent.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Evidence

The record this atom defines: a permanent, verifiable seal over a record set — cryptographic evidence that the set has not been altered since its authoritative creation. It is produced by [Seal] and carries its [Evidence Id], [Record Set Ref], [Proof], [Sealed At], and optional [Anchored At]; nothing about it changes once recorded, and the atom offers no surface to revoke, modify, or re-anchor it.

Kind: Type

#### Seal

The behavior a composing pattern invokes at seal time to record a new [Evidence] over a record set. It consumes the supplied [Mechanism Credential] to compute the [Proof], stamps [Sealed At] (and [Anchored At] if the mechanism anchors synchronously), and returns the [Evidence Id]. It always creates a new record — it never modifies an existing one — and never persists the [Mechanism Credential].

Kind: Operation

#### Verify

The read-only behavior an auditor or composing pattern invokes to confirm a recorded [Evidence], by id, against a presented record set. It re-runs the mechanism's verification function over the [Original Record Set] against the stored [Proof] and returns [Verified], [Failed Verification], or [Not Known]. It changes nothing. Unlike Actor Identity's verify, it requires the originating record set as input, because the [Proof] commits to the records' content.

Kind: Operation

#### Evidence Id

The opaque, immutable identity of an [Evidence], host-allocated at the I/O seam on [Seal] and never reused. The [Record Set Ref], [Proof], [Sealed At], and [Anchored At] are properties of the [Evidence], not its identity.

Kind:     Field
Field of: Evidence
Projects: evidence_id

#### Record Set Ref

The opaque reference to *what* the [Evidence] commits to — the record set the [Proof] is computed over. The atom does not interpret it; the host pattern defines what a record set is and how to present it to [Verify] later. Set on [Seal], immutable thereafter.

Kind:     Field
Field of: Evidence
Projects: record_set_ref

#### Proof

The cryptographic artifact that commits to the record set's content — a hash chain, Merkle root, signed root, RFC 3161 timestamp token, blockchain transaction id, or composite. Computed by [Seal] from the [Mechanism Credential] and the injected cryptographic material, stored on the [Evidence], and the thing [Verify] re-checks. Set on [Seal], immutable thereafter.

Kind:     Field
Field of: Evidence
Projects: proof

#### Sealed At

The wall-time the [Evidence] was recorded, stamped from the host-injected [Now] on [Seal]. Immutable thereafter; best-effort, since clock quality is a deployment concern.

Kind:     Field
Field of: Evidence
Projects: sealed_at

#### Anchored At

The wall-time of an external anchor, present only when the chosen mechanism produced one synchronously at seal time (for example, an RFC 3161 timestamp authority called during [Seal]). Set on [Seal] if produced, immutable thereafter, and absent otherwise. Later, asynchronous anchoring belongs to a separate External Anchoring composition.

Kind:     Field
Field of: Evidence
Projects: anchored_at

#### Mechanism Credential

The opaque material the chosen mechanism supplies to [Seal] to produce the [Proof] — keying material for keyed mechanisms, possibly empty or a configuration handle for unkeyed ones. It is *consumed* per call — used to compute the [Proof] and then discarded — and never persisted under this name (or any name) by the atom. It is the only caller-supplied secret.

Kind:         Parameter
Parameter of: Seal
Projects:     mechanism_credential

#### Original Record Set

The originating record set the verifier presents to [Verify], re-checked against the stored [Proof] to detect modification. It is supplied per call and not stored under this name; the asymmetry from Actor Identity's verify is that this content must be re-presented, because the [Proof] commits to the records' content.

Kind:         Parameter
Parameter of: Verify
Projects:     original_record_set

#### Now

The current wall-time reading [Seal] stamps [Sealed At] from, supplied to the pure transition by the host at the I/O seam (never read inside the transition, never supplied by the business caller).

Kind:         Parameter
Parameter of: Seal
Projects:     now

#### Sealed

The atom's single stable state: an [Evidence] that has been recorded. There are no transitions out of it — the atom has no surface to revoke, invalidate, modify, or re-anchor an [Evidence] once recorded.

Kind:      Member
Member of: the evidence state
Role:      Outcome

#### Verified

The outcome [Verify] returns when the stored [Proof] checks out against the presented [Original Record Set] under the chosen mechanism's verification function. It is the structural confirmation that the records were not altered after [Sealed At] (conditional on a cryptographically sound mechanism).

Kind:      Member
Member of: the Verify outcome
Role:      Outcome
Projects:  verified

#### Failed Verification

The outcome [Verify] returns when the [Evidence] exists but does not verify, carrying a reason — [Proof Invalid], [Record Set Mismatch], or [Mechanism Verification Unavailable]. Distinct from [Not Known], which is a lookup miss.

Kind:      Member
Member of: the Verify outcome
Role:      Outcome
Projects:  failed-verification

#### Not Known

The outcome [Verify] returns when the supplied [Evidence Id] references no recorded [Evidence] — a lookup miss, not a verification failure. It is exclusively an [Evidence Id] lookup miss; an absent or wrong record set routes to [Failed Verification] for reason [Record Set Mismatch] instead.

Kind:      Member
Member of: the Verify outcome
Role:      Outcome
Projects:  not-known

#### Proof Invalid

The [Failed Verification] reason returned when the mechanism's verification function, run over the presented record set against the stored [Proof], does not check out — the structural signal of tampering.

Kind:      Member
Member of: the Failed Verification reason
Role:      Outcome
Projects:  proof-invalid

#### Record Set Mismatch

The [Failed Verification] reason returned when the presented [Original Record Set] does not refer to the record set the [Evidence] was made over — a caller error, structurally distinct from [Proof Invalid] (tampering) and from [Not Known] (lookup miss).

Kind:      Member
Member of: the Failed Verification reason
Role:      Outcome
Projects:  record-set-mismatch

#### Mechanism Verification Unavailable

The [Failed Verification] reason returned when the mechanism's verification function requires an external service (for example, an RFC 3161 TSA's published certificate chain) that is unavailable at verify time — a transient, retryable condition, distinct from [Proof Invalid] and [Record Set Mismatch].

Kind:      Member
Member of: the Failed Verification reason
Role:      Outcome
Projects:  mechanism-verification-unavailable

#### Invalid Request

The refusal [Seal] returns when [Record Set Ref] contains no non-whitespace character, or [Mechanism Credential] is absent entirely. A guard rejection that fails before any store write; no [Evidence] is recorded.

Kind:      Member
Member of: the Seal rejection
Role:      Outcome
Projects:  invalid-request

#### Mechanism Failure

The refusal [Seal] returns when the mechanism cannot compute a [Proof] against the record set — the underlying records are unreadable, the keying material fails the mechanism's preconditions, or a required synchronous anchor service is unreachable. No [Evidence] is recorded.

Kind:      Member
Member of: the Seal rejection
Role:      Outcome
Projects:  mechanism-failure

#### Storage Failure

The refusal [Seal] returns when the seal store write fails after the [Proof] is computed. No partial [Evidence] is recorded and the computed [Proof] is discarded — the caller must treat it as definitive.

Kind:      Member
Member of: the Seal rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Evidence]: #evidence
[Seal]: #seal
[Verify]: #verify
[Evidence Id]: #evidence-id
[Record Set Ref]: #record-set-ref
[Proof]: #proof
[Sealed At]: #sealed-at
[Anchored At]: #anchored-at
[Mechanism Credential]: #mechanism-credential
[Original Record Set]: #original-record-set
[Now]: #now
[Sealed]: #sealed
[Verified]: #verified
[Failed Verification]: #failed-verification
[Not Known]: #not-known
[Proof Invalid]: #proof-invalid
[Record Set Mismatch]: #record-set-mismatch
[Mechanism Verification Unavailable]: #mechanism-verification-unavailable
[Invalid Request]: #invalid-request
[Mechanism Failure]: #mechanism-failure
[Storage Failure]: #storage-failure

---

## Composition notes

Tamper Evidence is freestanding and is the integrity contract every regulated record set composes with for after-the-fact verification:

- **[Event Log](./event-log.md)** — every Event Log instance under integrity-relevant deployment composes with this atom. Sealing the log periodically — or chain-seal-per-append, for the strongest cadence — gives an external verifier the integrity property the bare Event Log names as out-of-scope. Event Log's *tamper-evidence-is-a-composing-concept* edge case is now resolved by this composition.
- **[Actor Identity](./actor-identity.md)** — when the seal must be attributable to a named actor, the [Mechanism Credential] is the actor's private credential and the [Evidence]'s [Proof] binds both content and authorship. The [Evidence] record carries an Actor Identity attestation in its sidecar — or the [Proof] itself is the attestation, when the mechanism is a digital signature over the record set. Without Actor Identity, the [Evidence] records that *the system* asserted the [Proof] at a time; with it, the [Evidence] records *that the named actor claimed the evidence*.
- **[Retention Window](./retention-window.md)** — seals are placed under retention alongside the records they commit to. Cascading purge of evidence alongside records — when the records leave retention, the seals leave with them — is the host's responsibility. A seal for a destroyed record set is structurally meaningless; it should be purged in step.
- **External Anchoring** *(forthcoming)* — commits the [Proof] or its root to a trust anchor outside the adversary's reach (RFC 3161 TSA, public attestation log, blockchain). Promotes tamper-evidence toward tamper-proof reach. Handles the asynchronous and batched anchoring cases the atom's [Anchored At] does not cover.
- **Trusted Timestamping** *(forthcoming, per RFC 3161)* — verifiable time-anchor for [Sealed At] and [Anchored At].
- **Mechanism Registry** *(forthcoming)* — manages the definition, versioning, and deprecation of seal mechanisms (hash function families, signature schemes, anchoring providers).

This atom completes the canonical regulated-audit stack: [Event Log](./event-log.md) + [Actor Identity](./actor-identity.md) + [Retention Window](./retention-window.md) + Tamper Evidence as four freestanding atoms. The **[Audit Trail](../compositions/audit-trail.md)** composition is the wiring; with all four atoms grounded, the composition lands as the canonical regulated-audit primitive the library has been forecasting.

---

## Standards references

Tamper Evidence is a foundational compliance primitive with deep cryptographic and regulatory anchoring:

- **ISO/IEC 27001 §A.12.4 (Logging and Monitoring)** — the International Organization for Standardization / International Electrotechnical Commission information-security baseline for log integrity. The atom's no-silent-rewrite guarantee is the structural form.
- **FIPS 180-4 (Secure Hash Standard)** — a Federal Information Processing Standard (mandatory US government computing standard); the cryptographic foundation for hash-chain and Merkle-tree mechanisms. The atom is hash-function-neutral; FIPS 180-4 is the canonical family anchor.
- **RFC 3161 (Time-Stamp Protocol)** — the IETF standard for trusted timestamping. Qualified RFC 3161 timestamps are the canonical external-anchoring mechanism for time-of-seal verifiability under eIDAS and elsewhere.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-92 (Guide to Computer Security Log Management)** — names log-integrity protection as a baseline requirement; tamper-evidence is the structural mechanism.
- **21 CFR Part 11 — FDA electronic records and electronic signatures** — requires electronic records to be protected against unauthorized modification and to bear evidence of any change. Composes with Actor Identity for the attribution of any modification (which Part 11 also requires).
- **DoD 5015.02-STD — Design criteria for electronic records management software** — requires records-management systems to protect against unauthorized alteration of records and audit data.
- **GDPR (EU General Data Protection Regulation) Article 32 (Security of Processing)** — names integrity as a property of processing that controllers must ensure with appropriate technical measures.
- **W3C Verifiable Credentials Data Model** — a standards-track format for tamper-evident attestations, with cryptographic proofs that travel with the data.
- **Certificate Transparency (RFC 9162)** — a worked public Merkle-tree append-only (records can be added but never changed or deleted) log; the canonical real-world deployment of public, verifiable, externally-anchored tamper-evidence at internet scale.
- **Git's commit DAG** — the most widely-deployed open-source reference for hash-chain tamper-evidence. Every modern source-control system inherits the design.
- **PCI DSS Requirement 10 (Track and monitor all access to network resources and cardholder data)** — including 10.5 (secure audit trails so they cannot be altered). The atom is the structural form.
- **eIDAS Regulation (EU 910/2014)** — qualified electronic timestamps carry presumed evidentiary effect; the atom's [Anchored At] is the operational anchor.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing external anchoring, actor attribution, time-anchor, and mechanism-registry concepts as separate atoms.
- **Eiffel's design-by-contract** — preconditions on `seal`; named rejection and verification reasons.
- **Cryptographic hash-function literature** (Merkle's tree commitments, the Merkle-Damgård construction, the SHA family) — the foundational mechanism for tamper-evident commitments.
- **Tamper-evident logging literature** (Schneier and Kelsey, *Secure Audit Logs to Support Computer Forensics*, 1999) — the formal framing of hash-chain audit logs as forensically-useful primitives.

---

## Generation acceptance

A derived implementation of Tamper Evidence is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the seal store plus the originating record sets, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct any seal from its stored fields.** [Evidence Id], [Record Set Ref], [Proof], [Sealed At], and [Anchored At] (if present) are sufficient for the verifier; no additional state is consulted beyond the originating record set.
- **Verify each seal independently.** [Verify], given an [Evidence Id] and the presented [Original Record Set], is a function of the [Evidence] and the presented record set. The auditor can run verification themselves with their own implementation of the mechanism's verification function — no privileged access to the system required.
- **Detect any tampering with the originating records.** A single-byte modification to the record set since [Sealed At] causes [Verify] to return [Failed Verification] for reason [Proof Invalid] (Invariant 2).
- **Distinguish the three verify outcomes.** [Verified], [Failed Verification], and [Not Known] are observable as distinct first-class results, with the reason on [Failed Verification] distinguishing [Record Set Mismatch] from [Proof Invalid].
- **Bound the forensic window of any detected tampering.** Where multiple [Evidence] records over the same record set exist at different [Sealed At] times, the auditor can run [Verify] against each and bound *when* the tampering occurred to between two adjacent seal times.
- **Identify the composing patterns active in this deployment.** Whether External Anchoring, Trusted Timestamping, Actor Identity, Mechanism Registry, and Retention Window are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce seals and a verification surface that pass the six checks above. The bar is the regulator's question — *"can you prove these records weren't altered after the fact?"* — answered structurally from the records and the [Proof], not procedurally from runtime claims.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-18
formal: not applicable — vote no 2026-06-03
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/tamper-evidence.md`.
