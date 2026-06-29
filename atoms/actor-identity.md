---
title: Actor Identity
parent: Atomic Concepts
has_toc: true
toc: true
---

# Actor Identity

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Actor Identity answers one question: "who authorized this action, and can you prove it?" It works through attestations — permanent records that tie a specific person or system to a specific action by way of a proof. A proof is a tamper-resistant artifact, computed from the actor's private credential, that anyone can later check without needing the credential itself. Creating an attestation consumes the credential to produce the proof and then throws the credential away; only the proof is kept. Checking one is purely read-only. Given an attestation's identifier, the system re-checks the stored proof against the recorded action and actor, using only public information about the actor. The guarantee is non-repudiation. If the check passes, the named actor really did authorize the named action and cannot credibly deny it — short of claiming their credential was stolen. This is the mechanism behind supervisor sign-off on large wire transfers, doctors' electronic prescriptions for controlled drugs, chip-and-PIN card payments, legally binding e-signatures, and signed code commits in regulated software. Attest when the action happens, verify at audit time, and the answer comes from the records rather than from anyone's word.

---

## Intent

Regulated systems require that every action of consequence be attributable to an actor who authorized it, and that the attribution survive adversarial scrutiny — disputed transactions, regulator audits, breach investigations, court proceedings. The shape is constant across domains: at action time, the actor produces a [Proof] (a signature, a cryptographic attestation, a witnessed approval) that binds their identity to the specific action. At verification time, anyone with access to the [Attestation] can confirm the binding without trusting the system that recorded it.

The pattern addresses the *who* question that audit trails alone cannot answer. An event log records *what happened*; an [Attestation] records *who authorized it* in a form the regulator accepts as binding. Without attestations, the audit trail is the system's claim about who acted; with attestations, the audit trail is the actor's own commitment to having acted.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the [Attestation] record), its own actions ([Attest], [Verify]), and its own operational principles (proofs are immutable; verification is a read-only function of the [Attestation] and the actor registry's public material). It does not implement actor registration, credential lifecycle, authentication flows, authorization rules, multi-actor witness schemes, or compromise disclosure. Each is a separate composable atom; see Composition notes.

---

## Structure

### Identity model

Every [Attestation] known to the system has an **[Attestation Id]** — an opaque, immutable identifier allocated by the host id source at the I/O seam on [Attest] (per the Logic Confinement Principle in [`execution-contract.md`](../execution-contract.md), the id is injected into the transition, not generated inside it; see Inputs and Behavior). The id is the [Attestation]'s identity; the [Action Ref], [Actor Ref], [Proof], and [Attested At] are immutable *properties* of the [Attestation], not its identity.

Two attestations for the same action by the same actor have different ids — re-attestations after credential rotation, retries after partial failures, and multi-action sequences are distinct attestations with their own records. Ids are not reused.

The opaque-id model matters here for the same reason it mattered in Provisional Commitment: identifying an [Attestation] by [Action Ref] and [Actor Ref] together would collapse legitimate re-attestations, and identifying by timestamp would lose precision under concurrent attestations. Opaque ids preserve the one-attestation-one-id discipline that makes per-event audit reconstruction tractable.

### Inputs

- An [Action Ref] identifying *what* is being attested. The atom treats this as opaque — the host pattern defines what an action is and how to reference it.
- An [Actor Ref] identifying *who* is attesting. Also opaque — the actor registry is a separate concept.
- A [Credential] — the private material the actor uses to produce the [Proof]. The atom consumes this at [Attest] time and never persists it.
- [Attest] — record a new [Attestation] binding an [Actor Ref] to an [Action Ref]. (Projected contract: `attest(action_ref, actor_ref, credential) → attestation_id | rejected(invalid-request | invalid-credential | storage-failure)`.)
- [Verify] — confirm a recorded [Attestation] is valid, by id. (Projected contract: `verify(attestation_id) → verified | failed-verification(proof-invalid | actor-unknown-in-registry | registry-unavailable) | not-known`.)
- A clock providing wall-time timestamps, an id source for [Attestation Id] allocation, and the cryptographic primitive (and any entropy) the [Proof] computation requires — all injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock, allocates the [Attestation Id], and supplies the cryptographic material at the seam, *before* the transition runs. The pure transition receives them as inputs. It reads no clock, mints no id, and generates no randomness internally. None of these is supplied by the business caller; the [Credential] remains the only caller-supplied secret. Confining them to the seam is what keeps the transition deterministic.

### Outputs

- The current set of attestations.
- For each [Attestation]: [Attestation Id], [Action Ref], [Actor Ref], [Attested At], and the [Proof].
- [Attest] returns the new [Attestation Id] on success, or a rejection naming the failed precondition.
- [Verify] returns [Verified], [Failed Verification], or [Not Known]. The [Verify] call itself does not modify state.

### State

A single stable state: **[Attested]**. There are no transitions out of [Attested] — the atom has no surface for revoking, invalidating, or modifying an [Attestation] once it is recorded. Verification is a read-only query over the [Attestation]'s stored fields and the actor registry's public material. Whether a verification result *changes over time* — because the actor registry's view of the actor changes (key rotation, public material updates) — is a property of the composing actor registry, not of the atom.

Each [Attestation] carries:

- **[Attestation Id]** — opaque, immutable, host-allocated at the seam (see Inputs). Set on [Attest]. Never changes.
- **[Action Ref]** — opaque reference to the action being attested. Set on [Attest]. Never changes.
- **[Actor Ref]** — opaque reference to the actor doing the attesting. Set on [Attest]. Never changes.
- **[Proof]** — the cryptographic or procedural artifact that binds [Actor Ref] to [Action Ref]. Set on [Attest]. Never changes.
- **[Attested At]** — wall-time when the [Attestation] was recorded. Set on [Attest]. Never changes.

Transitions:

- [Attest] → a new [Attestation] is recorded in [Attested] with the injected [Attestation Id], the supplied [Action Ref] and [Actor Ref], the [Proof] computed from the [Credential] and the injected cryptographic material, and [Attested At] stamped from the injected clock (all read at the seam before the transition; see Inputs). Returns [Attestation Id].
- *(no other transitions)*

### Flow

1. **Composing pattern initiates an action that requires attribution** (attribution — the binding of an action to the actor who performed it). It calls [Attest] with the actor's [Credential] in hand.
2. **Atom validates the [Credential] and computes the [Proof].** If the [Credential] does not validate against the actor's public material, the call is rejected. Otherwise the atom records the [Attestation] and returns the id.
3. **Time passes; the [Attestation] persists.** The host system stores the [Attestation Id] alongside whatever it represents (the commitment record, the event log entry, the contract artifact).
4. **An auditor, verifier, or composing pattern queries the [Attestation].** Calls [Verify]. The atom retrieves the [Attestation], checks the [Proof] against [Action Ref] and [Actor Ref] using the actor registry's public material, and returns the verification result.

### Decision points

**At [Attest].** [Action Ref], [Actor Ref], and [Credential] must be non-null and non-empty; otherwise [Invalid Request]. (Further structural validation of the opaque references is the composing pattern's responsibility — the atom does not know what a valid action or actor looks like.) The [Credential] must validate against the actor registry's public material for [Actor Ref]; otherwise [Invalid Credential]. The [Credential] is *consumed*, never stored. If the attestation store write fails after successful credential validation, the atom returns [Storage Failure]. No [Attestation] is recorded. Durability of the attestation store is implementation-owned; see Edge cases.

**At [Verify].** The atom resolves the outcome in a fixed precedence order: it confirms the [Attestation] exists, then checks the [Proof], and only then returns [Verified]. The first matching condition decides the outcome.

| Order | Condition | Outcome |
|-------|-----------|---------|
| 1 | [Attestation Id] references no recorded [Attestation] | [Not Known] |
| 2 | actor registry cannot return public material for [Actor Ref] (actor deleted from the registry) | [Failed Verification] ([Actor Unknown In Registry]) |
| 2 | actor registry is unreachable at verify time | [Failed Verification] ([Registry Unavailable]) |
| 2 | stored [Proof] does not check out against the stored [Action Ref] and [Actor Ref] under current public material | [Failed Verification] ([Proof Invalid]) |
| 3 | none of the above — the [Proof] checks out | [Verified] |

The order is what keeps the outcomes distinct. [Not Known] is a lookup miss, resolved first, before any proof check. The three [Failed Verification] reasons are then distinguished by *why* the check could not pass: [Actor Unknown In Registry] is missing actor material (may be permanent), [Registry Unavailable] is a transient registry outage (retryable), and [Proof Invalid] is a proof that exists but fails (for example, after a key rotation). All three are distinct from [Not Known] (the id is not in the store) and from each other. [Verify] never *rejects* in the same sense as the other action calls. [Verified], [Failed Verification], and [Not Known] are three legitimate first-class outcomes, and a composing pattern should treat each distinctly. [Verify] writes nothing in any case — it is a read-only query that leaves the [Attestation] record untouched.

### Behavior

Observed behavior, derived from how regulated systems use attestations:

- An [Attestation] is a cryptographic or procedural artifact, not merely a logged claim. The atom is vocabulary-neutral about the mechanism (asymmetric signature, MAC — Message Authentication Code, a short tag computed over data with a shared secret — over a shared secret, smart-card-bound proof, qualified electronic signature, witnessed approval) — the contract is only that the [Proof] verifies later from the recorded fields alone.
- Verification needs no out-of-band lookup at verify time beyond the actor registry's public material. The [Attestation] is self-contained relative to the registry; a verifier with the [Attestation] and the registry's view of the actor can decide.
- [Attest] never modifies an existing [Attestation]. It always creates a new one. Re-attesting the same action by the same actor produces a separate record with its own id — useful for credential-rotation scenarios where multiple proofs over the same action accumulate.
- The [Credential] is consumed by [Attest] and never persisted by the atom. Credential management — storage, rotation, recovery, HSM (Hardware Security Module — a dedicated tamper-resistant device for storing keys and performing cryptographic operations) binding — is an entirely separate concept.
- **Time, id, and cryptographic material are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (`execution-contract.md`), the host reads the clock, allocates the [Attestation Id], and supplies the cryptographic primitive and entropy at the deployment seam before [Attest]'s transition runs; [Verify]'s cryptographic check likewise runs against injected primitive material. The core transition is a pure function of its caller inputs and these injected inputs — it reads no wall clock, mints no id, and improvises no crypto internally. This is the determinism the execution contract requires, and it leaves the caller signatures ([Attest], [Verify]) unchanged.
- [Verify] results depend on the actor registry's current view of [Actor Ref]. If the registry's public material for the actor changes (key rotation), previously-verified attestations may begin to fail verification under the new key, unless the registry maintains historical material. Whether the registry does so belongs to the registry, not the atom.
- The atom does not retroactively invalidate attestations made with a [Credential] later determined to have been compromised. That reinterpretation belongs to a Compromise Disclosure composing pattern; see Edge cases.

### Feedback

Each successful action produces an observable, measurable change:

- After [Attest] — a new [Attestation] appears in the system with a fresh [Attestation Id], the supplied [Action Ref] and [Actor Ref], the computed [Proof], and [Attested At]. Total count increases by one. The id is returned.
- After [Verify] — no state change. The atom returns one of [Verified], [Failed Verification], or [Not Known].

Each rejected [Attest] action produces an observable refusal: [Invalid Request], [Invalid Credential], or [Storage Failure]. Each [Verify] outcome is a first-class result (not a rejection): [Verified], [Failed Verification] (for [Proof Invalid], [Actor Unknown In Registry], or [Registry Unavailable]), or [Not Known].

The attestation set is queryable. Per-attestation fields ([Attestation Id], [Action Ref], [Actor Ref], [Attested At], [Proof]) are observable to auditors and operators; whether end-users see them is a presentation policy of the host system.

### Invariants

The following invariants (conditions that must always hold, regardless of what sequence of actions has occurred) constitute the verification surface of the pattern:

- **Invariant 1 — Attestation immutability.** Once recorded, an [Attestation]'s [Attestation Id], [Action Ref], [Actor Ref], [Proof], and [Attested At] never change.
- **Invariant 2 — Action binding.** For any [Attestation] in the system, the recorded [Proof] verifies cryptographically or procedurally against the recorded [Action Ref]. A [Proof] produced for a different action does not verify against this [Attestation].
- **Invariant 3 — Actor binding.** For any [Attestation] in the system, the recorded [Proof] verifies against the recorded [Actor Ref] using the actor registry's public material. A [Proof] produced by a different actor does not verify against this [Attestation].
- **Invariant 4 — Id stability.** An [Attestation]'s [Attestation Id] is set on [Attest] and never changes.
- **Invariant 5 — No id reuse.** No two attestations share an [Attestation Id] across the lifetime of the system.
- **Invariant 6 — Self-containment.** [Verify] requires only the [Attestation]'s stored fields and the actor registry's public material for [Actor Ref]. No additional out-of-band data is consulted at verify time. This holds for the atom's design; specific credential mechanisms (X.509 certificate-based credentials requiring revocation status checks) may require additional data at verify time if revocation status is not embedded in the [Proof] — see *Certificate revocation status* in Edge cases.
- **Invariant 7 — Verification consistency under fixed registry state.** For any [Attestation] and any fixed view of the actor registry, repeated [Verify] calls return the same result.
- **Invariant 8 — Non-repudiation contract.** If [Verify] returns [Verified], then under the assumption that the actor's [Credential] was not compromised at or before [Attested At], the actor referenced by [Actor Ref] authorized the action referenced by [Action Ref] at [Attested At]. The contract is conditional on credential integrity; reinterpretation under compromise belongs to a Compromise Disclosure composing pattern.
- **Invariant 9 — Attestation durability.** Once recorded, an [Attestation] is never deleted by the atom. The attestation store's record count is monotonically non-decreasing. The atom provides no deletion surface; cascading deletion under a retention policy is the composing pattern's responsibility (see Tamper Evidence and Retention Window in Composition notes). An [Attestation Id] returned by a successful [Attest] call is durably persisted; a [Storage Failure] rejection guarantees no partial record was written.

Action binding and actor binding together give the *attribution* property — the regulator's question *"who authorized this action?"* has a structural answer rather than a procedural one. Attestation immutability and self-containment together give the *survivability* property — attestations remain verifiable independent of the system that recorded them. The non-repudiation contract names the regulatory bar the atom is built to clear.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Banking — wire transfer authorization

A teller initiates a $50,000 wire. Bank policy requires supervisor approval for wires over $10,000. The supervisor reviews and attests — `attest(wire_w91, supervisor_s12, supervisor_credential) → attestation_a44`. The attestation is stored alongside the wire record. Six months later, an internal auditor reviewing the day's high-value wires queries `verify(a44)` and receives `verified` — confirming supervisor s12 authorized wire w91 at the recorded time, without trusting the teller's account of the conversation that preceded it.

### Healthcare — electronic prescription for a controlled substance

A physician writes a Schedule II prescription. DEA (US Drug Enforcement Administration) Electronic Prescriptions for Controlled Substances (EPCS) regulations require two-factor cryptographic attestation. The physician's EHR (Electronic Health Record — the digital patient chart system) computes `attest(rx_r37, dr_park, dr_park_credential)` using the physician's smart-card-bound credential and a second factor. The prescription transmits to the pharmacy with `attestation_a91`. The pharmacy calls `verify(a91)` before dispensing; `verified` → fill. Two years later, during a DEA audit, the same verification proves Dr. Park authorized that specific prescription on that specific date.

### Payments — chip-and-PIN transaction

A cardholder taps a chip card at a terminal and enters their PIN. The card produces a cryptographic attestation: `attest(transaction_t883, card_c41, card_credential)`. The terminal forwards the attestation with the transaction. The issuer calls `verify` before authorizing the charge. Months later, the cardholder disputes the charge as unauthorized; the issuer produces `attestation` and re-verifies. `verified` → the card was physically present and the correct PIN was entered, shifting liability to the cardholder per scheme rules. `failed-verification` → the dispute is upheld.

### Legal — qualified electronic signature on a contract

Two parties sign a contract via a qualified electronic signature service. Each invokes `attest(contract_c12, party_ref, qualified_signature_credential)` using credentials issued by a qualified trust service provider. Two attestations are stored alongside the contract. Any future party — opposing counsel, mediator, court — invokes `verify` on either attestation. Under eIDAS Regulation (Electronic Identification, Authentication and Trust Services — the EU regulation governing electronic signatures and identity), qualified electronic signatures carry the same legal effect as handwritten signatures, and the verification result is admissible evidence of authorship.

### Source control — signed commits in regulated software

A developer at an FDA-cleared (US Food and Drug Administration — the federal agency regulating drugs and medical devices) medical-device company pushes a commit signed with their hardware-key-backed credential. The version-control system records the attestation: `attest(commit_c44a, dev_smith, smith_credential) → attestation_a17`. CI infrastructure calls `verify(a17)` before allowing merge into the release branch. During an FDA software-of-unknown-provenance audit, the auditor walks the release branch and re-verifies every commit's attestation. SOX (Sarbanes-Oxley Act — US financial reporting law)-scoped financial systems and Common Criteria evaluated products follow the same pattern.

The mechanic is identical across all five. What differs: the credential mechanism (smart card, software key, qualified signature instrument, hardware token, chip-card secure element), the verification frequency (every action vs. on dispute vs. on audit), the regulatory consequence of [Failed Verification], and the composing patterns active around it (two-factor for prescriptions, witness signatures for some legal contracts, MFA — Multi-Factor Authentication, requiring two or more independent proofs of identity — for high-value wires).

### Rejection paths

**[Verify] → [Failed Verification] ([Proof Invalid]):** An auditor reviewing a batch of wire authorizations calls `verify(attestation_a17)`. The actor's key has been rotated since the [Attestation] was recorded, and the registry's current public material for `actor_ref: supervisor_s12` no longer matches the stored [Proof]. The atom returns `failed-verification(proof-invalid)`. The auditor notes the failure; the composing audit workflow escalates for manual review. The [Attestation] record is unchanged — Invariant 1 prevents modification; the failure is a verification-time result, not a record defect.

**[Verify] → [Not Known]:** A composing pattern references an [Attestation Id] that was never written (a partial-failure scenario where [Attest] returned [Storage Failure] and the composing pattern cached the id before confirming success). `verify(attestation_a_unknown)` returns `not-known` — the id is not in the attestation store. This is structurally distinct from [Failed Verification]: the id does not reference any [Attestation]. The composing pattern must treat [Not Known] as a missing record (requiring re-attestation) rather than a verification failure.

**[Attest] → [Invalid Credential]:** A supervisor approves a high-value wire using a [Credential] that was rotated out earlier that day. `attest(wire_w55, supervisor_s12, rotated_credential)` → the [Credential] fails to validate against the registry's current public material for `supervisor_s12`; the atom returns `rejected(invalid-credential)`. No [Attestation] is recorded — [Invalid Credential] is a guard rejection that fails before any store write (see Decision points); the composing workflow prompts re-attestation with the current [Credential].

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator audit.** A regulator asks *"who confirmed commitment c41?"* The auditor follows the commitment record to its [Attestation Id], calls [Verify], and reads [Actor Ref] from the verified [Attestation]. The verification is performed against stored fields and registry public material — not against developer testimony, log integrity, or system trust. Invariants 2 and 3 are the structural answer.
- **Disputed transaction.** An actor claims they did not authorize an action. The investigator retrieves the [Attestation] and calls [Verify]. If [Verified], the [Proof] binds the named actor to the named action at [Attested At] (Invariant 8). The actor cannot plausibly deny it without claiming credential compromise — an out-of-band investigation governed by a separate Compromise Disclosure pattern. If [Failed Verification], the dispute is upheld and the system's record is corrected.
- **Compromised credential discovered.** A [Credential] is later determined to have been compromised before some date. The atom does *not* retroactively invalidate attestations made with that [Credential] — Invariant 1 forbids modifying recorded attestations, and Invariant 8 is conditional on credential integrity. Reinterpretation of attestations made during the compromise window belongs to a Compromise Disclosure composing pattern, which produces *new* records that reframe the previously-verified attestations as untrustworthy. The atom's attestation store remains immutable; the meaning of its records changes via composition, not via mutation.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Actor lifecycle.** Actor registration, deactivation, suspension, revocation, and recovery belong to an Actor Registry / Identity Provisioning pattern. The atom takes [Actor Ref] as opaque and consults the registry's public material via [Verify].
- **Authentication.** Login flows, session management, MFA challenge-response — these produce the [Credential] the atom consumes. The atom does not opine on how the [Credential] reaches [Attest].
- **Authorization.** Whether the actor was *permitted* to take the action is a separate question from whether they *authorized* it. Authorization / RBAC (Role-Based Access Control — permissions granted via roles) / ABAC (Attribute-Based Access Control — permissions decided from attributes of the actor, resource, and context) is a composing pattern.
- **Credential management.** Storage, rotation, recovery, HSM-binding, biometric protection — implementation concepts. The atom never persists the credential.
- **Multi-actor attestation.** Witness signatures, m-of-n approvals, co-signed contracts, dual-control workflows — each [Attest] call records one actor's binding. Multi-actor schemes compose with a Witness / Co-signature pattern.
- **Retroactive credential revocation.** As discussed above, attestations are immutable; reinterpretation under compromise belongs to Compromise Disclosure.
- **Tamper-evidence on the attestation store.** The bare atom assumes the attestation store has not been rewritten by an adversary with write access. Cryptographic hash chains, Merkle trees, and timestamp-authority anchoring belong to a Tamper Evidence composing pattern. (Many credential mechanisms — qualified signatures, blockchain-anchored attestations — provide tamper-evidence as a side effect; the atom does not require it but composes naturally with it.)
- **Time-of-attestation veracity.** [Attested At] is stamped from the injected clock at the seam (see Inputs and Behavior); clock *access* is confined to the seam, but clock *quality* — whether that clock is honest, monotonic, or synchronized — is handled at the deployment layer. Trusted timestamping (RFC 3161 — the Internet standard, "Request for Comments" document 3161, defining a trusted time-stamping protocol) is a composing pattern that supplies a verifiable time-anchor.
- **Action-content immutability.** The atom binds [Action Ref], not action content. If the action's content can be mutated after attestation (an editable document, a modifiable transaction record), the binding loses meaning. The host pattern is responsible for either binding to immutable content (e.g., a content hash) or composing with a Content Lock pattern.
- **Cross-system identity portability.** [Actor Ref] is opaque to the atom; portability across trust domains (federated identity, cross-organizational verification) belongs to an Identity Federation pattern.
- **Group attestations, pseudonyms, anonymous credentials.** Single actor reference per [Attestation]. Group signatures, ring signatures, and selective-disclosure credentials are separate concepts.
- **Verification result caching.** [Verify] is read-only and idempotent under fixed registry state, but the atom does not specify whether implementations may cache the result. Caching is implementation policy; a stale cache under a registry change is handled at the deployment layer.
- **Certificate revocation status.** For attestations using X.509 (the standard format for public-key certificates) certificate-based credentials, verification may require determining whether the certificate was revoked at or before [Attested At]. OCSP (Online Certificate Status Protocol — a way to check in real time whether a certificate has been revoked) stapling embeds the revocation status proof in the credential mechanism and keeps verification self-contained (satisfying Invariant 6); without stapling, the verifier must query a live OCSP responder or CRL (Certificate Revocation List — a published list of revoked certificates) distribution point, which introduces an out-of-band dependency that weakens Invariant 6. Short-lived certificates that expire before revocation is likely also satisfy self-containment. The credential mechanism choice — stapling, live revocation check, or short-lived certificates — is handled at the deployment layer; the atom's self-containment invariant holds for mechanisms that embed revocation status in the [Proof] and must be noted as conditional for mechanisms that rely on external revocation services at verify time.
- **Attestation store durability.** [Attest] writes a new record as a single atomic operation; a write failure after credential validation returns [Storage Failure] with no partial record in the store. Durability across crashes, replication lag, and storage-engine failure is implementation-owned. High-assurance deployments should compose with a Write-Ahead Log or equivalent mechanism to ensure that a [Storage Failure] response and the absence of a persisted record are consistent.

Where the atom breaks down: when *authorization* cannot be reduced to a single actor (truly anonymous attestation in regulated contexts is a contradiction in terms); when the credential mechanism cannot produce a verifiable proof (shared secrets where anyone with the secret could forge an attestation); when the host environment has no actor registry the verifier can consult.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Attestation

The record this atom defines: a permanent, verifiable binding of one action to the actor who authorized it. It carries its [Attestation Id], [Action Ref], [Actor Ref], [Proof], and [Attested At]; nothing about it changes once recorded, and the atom offers no surface to revoke or modify it.

Kind: Type

#### Attest

The behavior a composing pattern invokes at action time to record a new [Attestation]. It consumes the supplied [Credential] to compute the [Proof], binds the [Actor Ref] to the [Action Ref], stamps [Attested At], and returns the [Attestation Id]. It always creates a new record — it never modifies an existing one — and never persists the [Credential].

Kind: Operation

#### Verify

The read-only behavior an auditor or composing pattern invokes to confirm a recorded [Attestation], by id. It re-checks the stored [Proof] against the recorded [Action Ref] and [Actor Ref] using the actor registry's public material, and returns [Verified], [Failed Verification], or [Not Known]. It changes nothing.

Kind: Operation

#### Action Ref

The opaque reference to *what* is being attested — the action the [Attestation] binds. The atom does not interpret it; the composing pattern defines what an action is and how to reference it. Set on [Attest], immutable thereafter.

Kind:     Field
Field of: Attestation
Projects: action_ref

#### Actor Ref

The opaque reference to *who* is attesting — the actor the [Attestation] binds. The actor registry that holds the actor's public material is a separate concept. Set on [Attest], immutable thereafter.

Kind:     Field
Field of: Attestation
Projects: actor_ref

#### Attestation Id

The opaque, immutable identity of an [Attestation], host-allocated at the I/O seam on [Attest] and never reused. The [Action Ref], [Actor Ref], [Proof], and [Attested At] are properties of the [Attestation], not its identity.

Kind:     Field
Field of: Attestation
Projects: attestation_id

#### Proof

The cryptographic or procedural artifact that binds the [Actor Ref] to the [Action Ref] — a signature, a MAC, a smart-card-bound attestation, a qualified electronic signature. Computed by [Attest] from the [Credential] and the injected cryptographic material, stored on the [Attestation], and the thing [Verify] re-checks. Set on [Attest], immutable thereafter.

Kind:     Field
Field of: Attestation
Projects: proof

#### Attested At

The wall-time the [Attestation] was recorded, stamped from the host-injected clock on [Attest]. Immutable thereafter. The non-repudiation contract binds the actor to the action *at* this time.

Kind:     Field
Field of: Attestation
Projects: attested_at

#### Credential

The private material the actor supplies to [Attest] to produce the [Proof]. It is *consumed* per call — used to compute the [Proof] and then discarded — and never stored under this name (or any name) by the atom. It is the only caller-supplied secret.

Kind:         Parameter
Parameter of: Attest
Projects:     credential

#### Attested

The atom's single stable state: an [Attestation] that has been recorded. There are no transitions out of it — the atom has no surface to revoke, invalidate, or modify an [Attestation] once recorded.

Kind:      Member
Member of: the attestation state
Role:      Outcome

#### Verified

The outcome [Verify] returns when the stored [Proof] checks out against the recorded [Action Ref] and [Actor Ref] under the registry's current public material. It is the [Verified] half of the non-repudiation contract: the named actor authorized the named action (conditional on credential integrity).

Kind:      Member
Member of: the Verify outcome
Role:      Outcome
Projects:  verified

#### Failed Verification

The outcome [Verify] returns when the [Attestation] exists but does not verify, carrying a reason — [Proof Invalid], [Actor Unknown In Registry], or [Registry Unavailable]. Distinct from [Not Known], which is a lookup miss.

Kind:      Member
Member of: the Verify outcome
Role:      Outcome
Projects:  failed-verification

#### Not Known

The outcome [Verify] returns when the supplied [Attestation Id] references no recorded [Attestation] — a lookup miss, not a verification failure. A composing pattern treats it as a missing record (requiring re-attestation), not as a denial of authorship.

Kind:      Member
Member of: the Verify outcome
Role:      Outcome
Projects:  not-known

#### Proof Invalid

The [Failed Verification] reason returned when the stored [Proof] does not check out against the recorded [Action Ref] and [Actor Ref] under the registry's current public material — for example, after the actor's key was rotated.

Kind:      Member
Member of: the Failed Verification reason
Role:      Outcome
Projects:  proof-invalid

#### Actor Unknown In Registry

The [Failed Verification] reason returned when the actor registry cannot return public material for the recorded [Actor Ref] — because the actor has been deleted from the registry. May be permanent.

Kind:      Member
Member of: the Failed Verification reason
Role:      Outcome
Projects:  actor-unknown-in-registry

#### Registry Unavailable

The [Failed Verification] reason returned when the actor registry is unreachable at verify time — a transient, retryable condition, distinct from [Actor Unknown In Registry].

Kind:      Member
Member of: the Failed Verification reason
Role:      Outcome
Projects:  registry-unavailable

#### Invalid Request

The refusal [Attest] returns when [Action Ref], [Actor Ref], or [Credential] is null or empty. A guard rejection that fails before any store write; no [Attestation] is recorded.

Kind:      Member
Member of: the Attest rejection
Role:      Outcome
Projects:  invalid-request

#### Invalid Credential

The refusal [Attest] returns when the supplied [Credential] does not validate against the actor registry's public material for the [Actor Ref]. A guard rejection that fails before any store write; no [Attestation] is recorded.

Kind:      Member
Member of: the Attest rejection
Role:      Outcome
Projects:  invalid-credential

#### Storage Failure

The refusal [Attest] returns when the store write fails after the [Credential] validates. No partial [Attestation] is recorded — the caller must treat it as definitive and re-attest with a fresh [Credential].

Kind:      Member
Member of: the Attest rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Attestation]: #attestation
[Attest]: #attest
[Verify]: #verify
[Action Ref]: #action-ref
[Actor Ref]: #actor-ref
[Attestation Id]: #attestation-id
[Proof]: #proof
[Attested At]: #attested-at
[Credential]: #credential
[Attested]: #attested
[Verified]: #verified
[Failed Verification]: #failed-verification
[Not Known]: #not-known
[Proof Invalid]: #proof-invalid
[Actor Unknown In Registry]: #actor-unknown-in-registry
[Registry Unavailable]: #registry-unavailable
[Invalid Request]: #invalid-request
[Invalid Credential]: #invalid-credential
[Storage Failure]: #storage-failure

---

## Composition notes

Actor Identity is freestanding and is the non-repudiation contract that several other atoms reference:

- **[Provisional Commitment](./provisional-commitment.md)** — every [Place Hold](./provisional-commitment.md#place-hold), [Confirm](./provisional-commitment.md#confirm), [Release](./provisional-commitment.md#release), and [Expire](./provisional-commitment.md#expire) produces an [Attestation]; the commitment's audit trail includes [Attestation Id]s alongside per-transition timestamps. This is the non-repudiation composition Provisional Commitment's Lineage notes anticipated.
- **[Event Log](./event-log.md)** — every appended event carries an [Attestation Id] in its payload (or as a structured sidecar); readers verify before trusting the recorded `actor` field. Event Log's existing edge case naming Actor Identity as forthcoming is now resolved by this atom.
- **[Permissions](./permissions.md)** — every [Grant](./permissions.md#grant) and [Revoke](./permissions.md#revoke) is paired atomically with an [Attestation] under the issuing actor's [Credential]; the records alone answer *"who granted this access, when, and under what credential?"* The **[Attributed Permissions Admin](../compositions/attributed-permissions-admin.md)** composition is the formalization of this wiring, with eight emergent invariants (attribution completeness, revocation attribution, attestation-time monotonicity, attestation exclusivity, orphan-log durability, and more) and a dynamic Alloy (a formal modeling language for checking structural and temporal properties of a design) trace model verifying its temporal claims. This is the bottom rung on which Authorization / RBAC and Delegation compose without re-inventing the attribution surface.
- **Actor Registry / Identity Provisioning** *(forthcoming)* — supplies the public material [Verify] consults and the actor lifecycle (registration, key rotation, suspension, revocation).
- **[Credential](./credential.md)** — produces the [Credential] the atom consumes. Credential answers *"did the right material arrive?"*; Actor Identity answers *"who authorized this action and can you prove it?"* The two atoms are distinct freestanding atoms sharing the same `principal_ref` / [Actor Ref] namespace. Their relationship — cascade on revocation, permitted interchangeability of secret material, audit identity unification — is owned by the **[Authenticated Actor](../compositions/authenticated-actor.md)** composition. See `demos/attributed-permissions-admin/CORNERS.md` §Cross-atom identity surface aliasing for the implementation-discovered gap that surfaces the need for that composition.
- **[Authenticated Actor](../compositions/authenticated-actor.md)** — wires Credential and Actor Identity under a single principal, owning the three invariants neither atom currently specifies: revocation cascade, secret surface separation, and `principal_ref` / [Actor Ref] namespace binding.
- **Authorization / RBAC** *(forthcoming)* — combines what an actor *can* do with what they *did do*. Attestation answers the second; authorization answers the first.
- **Compromise Disclosure** *(forthcoming)* — handles retroactive credential invalidation by producing reinterpretation records, never by mutating the attestation store.
- **Witness / Co-signature** *(forthcoming)* — multi-actor attestations (m-of-n approval, dual control, qualified witness signatures).
- **[Tamper Evidence](./tamper-evidence.md)** — cryptographic chaining (or Merkle-tree commitment, or external anchoring) of the attestation store, so that any rewrite of recorded attestations is detectable from the records alone.
- **Trusted Timestamping** *(forthcoming, per RFC 3161)* — verifiable time-anchor for [Attested At].

The canonical regulated-audit stack composes [Event Log](./event-log.md) + Actor Identity + [Retention Window](./retention-window.md) + [Tamper Evidence](./tamper-evidence.md) as four freestanding atoms; the **[Audit Trail](../compositions/audit-trail.md)** composition is the wiring.

---

## Standards references

Actor Identity is a foundational compliance primitive with deep regulatory anchoring:

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63-3 (Digital Identity Guidelines)** — Identity Assurance Levels (IAL), Authenticator Assurance Levels (AAL), Federation Assurance Levels (FAL) — graded measures of how strongly identity, authentication, and federation are established. The atom's credential-consumed-not-stored discipline and verification self-containment correspond to NIST's authenticator and verifier requirements.
- **eIDAS Regulation (EU 910/2014)** — qualified, advanced, and basic electronic signatures. Qualified electronic signatures carry the same legal effect as handwritten signatures across the EU; the atom's non-repudiation contract is the operational form.
- **FIPS 186-4 / FIPS 186-5 (Federal Information Processing Standards — mandatory US government computing standards; here the Digital Signature Standard)** — cryptographic foundation for asymmetric attestation. The atom is mechanism-neutral but FIPS 186 is the canonical credential-mechanism anchor.
- **ISO/IEC 27001 §A.9 (Access Control) and §A.12.4 (Logging and Monitoring)** — the International Organization for Standardization / International Electrotechnical Commission information-security standard; actor attribution as an access-control and audit requirement.
- **21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 11 (FDA Electronic Records and Electronic Signatures)** — for healthcare, pharmaceuticals, and medical devices: requires electronic signatures to be uniquely attributable to one individual, with cryptographic or procedural binding that resists repudiation.
- **HIPAA (US Health Insurance Portability and Accountability Act) §164.312(d) (Person or Entity Authentication)** — verification that a person or entity seeking access is the one claimed.
- **DEA EPCS (21 CFR §1311)** — Electronic Prescriptions for Controlled Substances: two-factor cryptographic attestation requirements.
- **GDPR (EU General Data Protection Regulation) Article 32 (Security of Processing)** — names "ensuring the ongoing confidentiality, integrity, availability and resilience of processing systems and services"; non-repudiation is a recognized security property under Article 32's scope.
- **Sarbanes-Oxley §302 and §404** — officer certifications and internal control over financial reporting. Authenticated attestations on financial-system changes are §302 / §404 evidence.
- **PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for handling cardholder data) Requirement 8 (Identify and Authenticate Access)** — for payment systems handling cardholder data.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing authentication, authorization, registry, witness, and compromise concepts as separate atoms.
- **Eiffel's design-by-contract** — preconditions on `attest`; named rejection and verification reasons.
- **Public-key cryptography literature** (Diffie-Hellman, RSA — Rivest-Shamir-Adleman, ECDSA — Elliptic Curve Digital Signature Algorithm, EdDSA — Edwards-curve Digital Signature Algorithm; standard digital-signature schemes) — the foundational mechanism for verifiable proofs of authorship.
- **Non-repudiation literature in computer security** (Zhou and Gollmann, ISO/IEC 13888) — the formal framing of non-repudiation services as distinct from authentication.

---

## Generation acceptance

A derived implementation of Actor Identity is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the attestation store plus the composing actor registry's public material, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct any attestation from its stored fields.** [Attestation Id], [Action Ref], [Actor Ref], [Proof], [Attested At] are sufficient for the verifier; no additional state is consulted at verify time beyond the registry's public material.
- **Verify each attestation independently.** [Verify] is a function of the [Attestation] and the registry's current view of the actor. The auditor can run verification themselves with no privileged access beyond the public material.
- **Confirm action binding and actor binding.** The [Proof] verifies against the recorded [Action Ref] and [Actor Ref], and only against those (Invariants 2 and 3).
- **Distinguish the three verify outcomes.** [Verified], [Failed Verification], and [Not Known] are observable as distinct first-class results, not collapsed into a single boolean.
- **Identify the composing patterns active in this deployment.** Whether actor registry, authentication mechanism, witness scheme, compromise disclosure, tamper evidence, and trusted timestamping are wired in, with what configuration.

This is the generator's contract: any code generated from this atom must produce attestations and a verification surface that pass the five checks above. The bar is the regulator's question — *"can you prove who authorized this action?"* — not the developer's intuition.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed three foundational logic-confinement findings: clock, cryptographic material, and `attestation_id` are now host-injected at the I/O seam rather than generated inside the `attest` transition; caller signatures unchanged; see Lineage. Formal-layer vote is NO, 2026-06-03 — English-only, minimum-formalism. The pattern was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — all required structural elements resolved; identity model explicit; attest and verify action signatures with fully-named rejection and outcome reasons; nine invariants including attestation durability (Invariant 9); five cross-domain examples spanning banking, healthcare, payments, legal, and source control, plus an `attest` rejection-path example; regulated adversarial scenarios cover regulator audit, disputed transaction, and compromised credential; fifteen edge cases including certificate revocation status and attestation store durability. First entry in `compliance`.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

This atom survived all three pressure-testing passes (see [`pressure-testing.md`](../pressure-testing.md)) on its first iteration.

**Conventions inherited from prior work.** This atom is the second regulated atom in the library and was drafted with the two conventions Provisional Commitment first introduced — *Regulated adversarial scenarios* as an examples subsection and *Generation acceptance* as a standalone section — baked in from the first draft rather than added in a second iteration. (Both conventions have since been promoted to canonical status in [`contributing.md`](../contributing.md) and [`pressure-testing.md`](../pressure-testing.md); patterns drafted after this one inherit from the methodology directly rather than from any specific predecessor.) This atom is also the first to resolve a forthcoming-link that another published atom (Provisional Commitment) named; the existence of Actor Identity converts Provisional Commitment's `(forthcoming)` markers into resolved cross-references.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. The State node is unusually small (one stable state, Attested, and no transitions out) — early drafts considered modeling Attestation → Revoked or Attestation → Superseded but both were caught by Pass 2 as over-absorption (revocation belongs to the actor registry; superseding belongs to a re-attestation that produces a separate record). All nine GRID nodes resolved with their references intact, including a small but meaningful one: verify is captured under Decision points with its three first-class outcomes rather than forced into the success-or-rejection mold the other atoms use.

**Pass 2 — Conceptual independence (EOS).** Clean. Seven concerns were candidates for absorption and all seven are correctly named as composing patterns rather than folded in:

- *Actor registration and lifecycle* — generic across every system with identified actors. Composes with Actor Registry / Identity Provisioning.
- *Authentication flows* — generic across every system requiring login. Composes with an Authentication pattern.
- *Authorization rules* — generic across every system distinguishing what an actor can do from what they did. Composes with Authorization / RBAC.
- *Multi-actor attestation* — recurs in any high-stakes regulated context. Composes with Witness / Co-signature.
- *Compromise disclosure* — recurs across every cryptographic system. Composes with Compromise Disclosure.
- *Tamper-evidence on the attestation store* — recurs across every regulated record. Composes with Tamper Evidence.
- *Trusted timestamping* — recurs whenever the time of action matters to the verifier. Composes with Trusted Timestamping.

The temptation to absorb authentication into Actor Identity was the strongest of these — both concern *who is acting* — but the distinction matters: authentication answers *"is this caller the actor they claim to be, right now?"* and produces a credential; attestation answers *"can a future verifier confirm this actor authorized this action?"* and consumes the credential. Different state machines, different verification surfaces, different lifecycle. Keeping them separate is what makes Authentication composable with non-attestation actions and Actor Identity composable with non-interactive verification.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern:

- *`verify` return shape.* Early drafts had `verify(id) → ok | rejected(reason)`, which collapsed the lookup-miss case (`not-known`) with verification failure (`proof-invalid`). Resolved: three first-class outcomes — `verified`, `failed-verification(reason)`, `not-known`. Decision points names them explicitly and Behavior cautions composing patterns to treat them distinctly.
- *Credential storage.* The first draft was silent on whether the atom persisted the credential. Resolved: explicit *credential is consumed by `attest` and never persisted* in Inputs, Behavior, and the Edge cases entry on credential management. The atom takes a credential as input; the atom does not become a credential store.
- *Verification result drift under registry change.* The first draft asserted `verify` is idempotent. Resolved: Invariant 7 is qualified as *under fixed registry state*; Behavior explicitly names that registry changes (key rotation, public material updates) may change verification results, and that historical-material retention is the registry's concern, not the atom's.
- *Non-repudiation contract preconditions.* The first draft's Invariant 8 read as unconditional — *if verified, the actor authorized the action.* Resolved: the contract is explicitly *conditional on credential integrity*, with reinterpretation under compromise deferred to Compromise Disclosure. The conditional framing matches what cryptography literature actually claims and what regulators actually accept.

Three deferred concerns are named as explicit out-of-scope rather than fixed in-pattern: time-of-attestation veracity (clock semantics), action-content immutability (host pattern's responsibility), and verification result caching (implementation policy).

The three passes together exercise the architecture as designed: GRID catches structural completeness (the single-state model is small but complete, with verify under Decision points); EOS catches the seven over-absorption temptations; Linus catches the four hidden decisions (verify outcomes, credential storage, registry drift, contract preconditions). The atom is stronger because all three checks happened.

**Refinement round 1 — re-run of all three passes.** Six findings, all closed in-pattern:

- *Action signature incompleteness — `attest` (Pass 1 / Pass 3).* The Inputs signature used `rejected(reason)` while the actual reasons (`invalid-request`, `invalid-credential`) were only named in the Feedback section. A reader of the Inputs section alone could not enumerate the rejection vocabulary. Resolved: Inputs signature updated to `rejected(invalid-request | invalid-credential | storage-failure)`; `storage-failure` added as a new named reason (see next finding).
- *Persistence failure during `attest` unnamed (Pass 3).* If the credential validates and proof is computed but the store write fails, the atom had no named outcome for this. The credential is consumed; a retry would require a fresh credential. Resolved: `storage-failure` added as a rejection reason; Decision points updated to specify that `storage-failure` leaves no partial record; new edge case (*Attestation store durability*) specifies the consistency guarantee.
- *`verify` failure taxonomy incomplete (Pass 3).* Only `proof-invalid` was named for `failed-verification(reason)`. Registry unavailability and actor deletion are real failure modes with different operational meaning — registry unavailable is transient and retryable; actor unknown in registry may be permanent. Resolved: `failed-verification(proof-invalid | actor-unknown-in-registry | registry-unavailable)` in both Inputs and Feedback; Decision points updated with explicit descriptions of each.
- *"Well-formed" for opaque refs undefined (Pass 3).* Decision points said `action_ref` and `actor_ref` "must be well-formed" without defining what that means for opaque inputs. Resolved: "well-formed" replaced with "non-null and non-empty" as the atom's minimum constraint, with a note that further structural validation is the composing pattern's responsibility.
- *Certificate revocation status (Pass 3).* Invariant 6 (self-containment) claims verify requires only stored fields and registry public material. For X.509-based credentials, OCSP revocation status may be required at verify time unless stapling embeds it in the proof — a real out-of-band dependency that Invariant 6 did not address. Resolved: Invariant 6 updated with a caveat referencing the new *Certificate revocation status* edge case; new edge case names OCSP stapling, live OCSP, and short-lived certificates as the resolution options and defers the mechanism choice to deployment.
- *No attestation durability invariant (Pass 3).* The State section's single-state model implied records are permanent but no formal invariant stated it. The atom's design provides no deletion surface — this is a structural guarantee worth formalizing, analogous to Notification's Invariant 9 added in its second pass. Resolved: Invariant 9 (*Attestation durability*) added; it names the monotonically non-decreasing record count, the absence of a deletion surface, and the consistency guarantee between `storage-failure` responses and the absence of partial records.

Pass 2 was clean: no new over-absorptions surfaced. All six fixes are in-pattern resolutions or new edge-case entries.

**Scheduled rescan: 2026-05-20.** Pass 1 clean. Pass 2 clean. Pass 3 surfaced one refining finding: the main Examples section contained five domain examples showing only successful `attest` + `verify → verified` paths; no concrete example showed `verify → failed-verification` or `verify → not-known`. The regulated adversarial scenarios section covered the adversarial paths conceptually (disputed transaction and compromised credential), but without a concrete action-call-and-result walkthrough of the failure outcomes. Resolved: two rejection-path examples added to the Examples section — `verify → failed-verification(proof-invalid)` (key rotation scenario) and `verify → not-known` (missing attestation id from a storage-failure scenario). No foundational findings. Status date updated to 2026-05-20.

**Formal-layer vote — 2026-06-03: NO.** Invariants are single-state immutability and a monotonically non-decreasing attestation store; `verify` is a pure query with no state transitions, concurrency, or ordering-across-sequences surface. Grounds English-only (minimum-formalism). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This atom grounded 2026-05-20 under the early process — one foundation pass plus one refinement round, with Pass 3 "Linus mode" author-conducted and no fresh-reader AI adversarial round — and carried the legacy `grounded — 2026-05-20` token (grandfathered). This round is that missing AI-conducted adversarial round, run by a fresh-reader Opus (Happy-Torvalds-X2); it is the atom's Final Critique 4 (Rounds 1–3 being the foundation/refinement baseline, per `pressure-testing.md` §Round structure). Three foundational findings, all the same root — the atom predated the Logic Confinement Principle and described time, identity, and cryptographic material as generated *inside* the `attest` transition — all closed in-pattern by adopting the corpus-canonical host-injected-at-seam formulation (as in Session and Capability):

- *F4-1 — clock.* `attested_at = now` / "implicit clock" → the clock is injected at the I/O seam and `attested_at` is stamped from it before the transition runs (Inputs, State transition, Edge cases *Time-of-attestation veracity*).
- *F4-2 — cryptographic material.* The proof was "computed from the credential" with no seam declaration → the cryptographic primitive and any entropy are deployment-supplied at the seam, `verify`'s check runs against injected primitive material, and the core transition improvises no crypto (Inputs, new Behavior bullet).
- *F4-3 — `attestation_id`.* "system-generated … produced by `attest`" (minted in-transition) → allocated by the host id source at the seam and injected (Identity model, State, blockquote).

The caller signatures `attest(action_ref, actor_ref, credential)` and `verify(attestation_id)` are unchanged — time/id/crypto are host-injected, not caller-supplied. The confinement commitment is pinned in a Behavior bullet rather than a new numbered invariant, so the invariant set stays at nine and dependents' "Actor Identity invariants (1–9)" references (Authenticated Actor, Audit Trail) remain accurate. Refining/rhetorical folded: an `attest → rejected(invalid-credential)` rejection-path example; the *Time-of-attestation veracity* edge case reworded to the access-confined / quality-deployment distinction; "system-generated" → "host-allocated" throughout.

Confirming fresh-reader Opus clearance gate (2026-06-18): **CLEAR, 0 foundational** — all three fixes verified genuinely closed against the canonical reference atoms and the execution contract, caller signatures and invariant numbering confirmed stable at all wrap sites, no new surface. **Compositions affected — confirming check only, NOT a re-pass** (signatures, invariant set/numbering, states, and transitions all stable): Authenticated Actor, Actor Suspension, Audit Trail, Attributed Permissions Admin, Reserve from Pool, and the patterns reached through Audit Trail. Grounds at Final Critique 4.

**Annotation conversion — 2026-06-29 (annotation.md second-batch rollout, foundations-first with Retention Window, Tamper Evidence, Permissions, Provisional Commitment, Session).** Converted every concept reference to a `[Term]` marker and added the per-page Terms registry, applying the resolved four-kind ontology — **Type**, **Operation**, **Field** (a datum a Type carries — *what does it carry?*), **Parameter** (a value an Operation needs — *what does it need?*), and **Member**. This atom (the corpus's most heavily-referenced substrate) was the priority foundation. Inventory: one **Type** ([Attestation]); two **Operations** ([Attest], [Verify]); five **Fields** stored on the [Attestation] — [Action Ref], [Actor Ref], [Attestation Id], [Proof], [Attested At]; one **Parameter** consumed by [Attest] but never stored — [Credential] (the discriminator *stored-as-itself → Field, consumed → Parameter* placing it cleanly: the [Credential] is used to compute the [Proof], then discarded); and the **Members** — the single state [Attested], the three [Verify] outcomes ([Verified], [Failed Verification], [Not Known]) with [Failed Verification]'s three reasons ([Proof Invalid], [Actor Unknown In Registry], [Registry Unavailable]), and the three [Attest] rejections ([Invalid Request], [Invalid Credential], [Storage Failure]). Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). The two Operation contracts (`attest(action_ref, actor_ref, credential) → …`, `verify(attestation_id) → …`) are kept once each in Inputs as the labeled *projected contract*; the concrete example invocations in Examples (e.g. `attest(wire_w91, supervisor_s12, supervisor_credential) → attestation_a44`, `verify(a44)`) and their literal returns are left verbatim as illustrative wire-level calls. Cross-page references became full links now that the owner pages convert in this same batch: Provisional Commitment's `place_hold`/`confirm`/`release`/`expire` → `[Place Hold](./provisional-commitment.md#place-hold)` etc., and Permissions' `grant`/`revoke` → `[Grant](./permissions.md#grant)`/`[Revoke](./permissions.md#revoke)`. `principal_ref` (Credential's namespace) and Event Log's `actor` payload field stay backticked — Credential is not yet converted, and `actor` is Event Log's field, not this atom's. Expression only — all nine invariants hold their exact claims (Invariant 8's non-repudiation contract is the identical conditional relation), the invariant set stays at nine, and dependents' "Actor Identity invariants (1–9)" references remain accurate. **Re-verified, not re-grounded:** Status stays at Final Critique 4. Gates: linter 0 (incl. the O-term-resolver, resolving all of this page's markers against its registry); no formal model exists, so the harness gate is N/A (English-only, per the 2026-06-03 NO vote); the derived manifest projects an identifier kind (Field) and an enumerated kind (Member); diff read line-by-line against the same-claim-or-weaker test.

**Showcase pass — 2026-06-29.** Brought to the full showcase standard, matching the [`duplicate-prevention.md`](./duplicate-prevention.md) and [`provisional-commitment.md`](./provisional-commitment.md) exemplars, on top of the already-applied annotation conversion. Changes are representational only: (1) **Summary/blockquote merge** — the plain Tier-1 [`prose.md`](../working-ideas/prose.md) cut-#4 Summary moved to the very top (immediately after the TOC, before Intent), and the descriptive top blockquote ("A compliance primitive…") folded out as redundant. Every load-bearing claim the blockquote carried was already present in the Summary, the Identity model, the State section, the Behavior bullets, or Invariant 8 (the verifiable action-actor binding; the opaque host-allocated id with the action/actor/proof/timestamp as immutable properties; verification as a read-only query; the non-repudiation contract), so no claim needed folding in before deletion. No *also-known-as* line was added: this atom has never carried aliases, and none were invented. (2) **Lineage collapse** — the Lineage notes wrapped in the collapsed `<details>` block (with its `---` separator kept before it) mirroring the exemplars; no existing Lineage text altered. (3) **prose.md cut #1 (one idea per sentence)** — the Summary's single enormous sentence split into short declaratives; the seam-injection Inputs bullet (clock / id / cryptographic material) split into separate declaratives; the [Attest] and [Verify] Decision-points run-ons split, lossless. (4) **prose.md cut #5 (prose→structure)** — the [Verify] outcome logic, which carries a real precedence order ([Not Known] first → the three [Failed Verification] reasons → [Verified]), rendered as a small precedence/decision table, with the distinctions and fail-closed semantics kept in prose *beside* it per the cut-#5 caveat: the lookup-miss-resolved-first ordering, the *why-each-reason-differs* distinctions ([Actor Unknown In Registry] may be permanent, [Registry Unavailable] is transient/retryable, [Proof Invalid] is a present-but-failing proof), the three-first-class-outcomes framing, and the *writes-nothing* read-only guarantee. The state machine is a single state ([Attested]) with no transitions, so it warrants no transition table and was left as prose. Cuts #2 (glossary) and #3 (cross-ref footer) were assessed and **skipped**: acronyms are already spelled-out-once inline per the corpus convention here, and provenance already lives in the supporting prose and Composition notes rather than being re-cited mid-sentence. Expression only — every invariant and its number (1–9), both projected-contract signatures (`attest(action_ref, actor_ref, credential) → …`, `verify(attestation_id) → …`), every guarantee (Invariant 8's conditional non-repudiation contract included), and the invariant count (nine) are unchanged in force; every `[Term]` marker still resolves to its card and the Terms registry is intact. The heading anchors inbound references rely on (`#attest`, `#verify`, `#grant` and the rest) are unchanged. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 4 — 2026-06-18`. Gates: linter 0 (incl. the O-term-resolver — all of this page's markers resolve against its registry); no formal model exists, so the harness gate is **N/A** (English-only, per the 2026-06-03 formal-layer NO vote); the derived manifest projects an identifier kind (Field) and an enumerated kind (Member); `git status` shows only this `.md` modified, no `.tla`/`.cfg`/`.als`; diff read line-by-line against the same-claim-or-weaker test.

</details>
