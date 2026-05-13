---
title: Actor Identity
parent: Compliance
grand_parent: Atoms
nav_order: 1
has_toc: true
toc: true
---

# Actor Identity

> A compliance primitive: a verifiable binding of an action to the actor who authorized it. Each binding is an *attestation* with an opaque immutable id; the action reference, actor reference, proof, and timestamp are immutable properties, set at attest time. Verification is a read-only query, not a state transition. The contract the atom enforces is **non-repudiation** — a verified attestation binds the named actor to the named action and the actor cannot plausibly deny it.

---

## Intent

Regulated systems require that every action of consequence be attributable to an actor who authorized it, and that the attribution survive adversarial scrutiny — disputed transactions, regulator audits, breach investigations, court proceedings. The shape is constant across domains: at action time, the actor produces a *proof* (a signature, a cryptographic attestation, a witnessed approval) that binds their identity to the specific action. At verification time, anyone with access to the attestation can confirm the binding without trusting the system that recorded it.

The pattern addresses the *who* question that audit trails alone cannot answer. An event log records *what happened*; an attestation records *who authorized it* in a form the regulator accepts as binding. Without attestations, the audit trail is the system's claim about who acted; with attestations, the audit trail is the actor's own commitment to having acted.

This is a freestanding atom in the EOS sense. It has its own state (the attestation record), its own actions (attest, verify), and its own operational principles (proofs are immutable; verification is a read-only function of the attestation and the actor registry's public material). It does not implement actor registration, credential lifecycle, authentication flows, authorization rules, multi-actor witness schemes, or compromise disclosure. Each is a separate composable atom; see Composition notes.

---

## Structure

### Identity model

Every attestation known to the system has an **`attestation_id`** — an opaque, immutable, system-generated identifier produced by `attest`. The id is the attestation's identity; the action reference, actor reference, proof, and timestamp are immutable *properties* of the attestation, not its identity.

Two attestations for the same action by the same actor have different ids — re-attestations after credential rotation, retries after partial failures, and multi-action sequences are distinct attestations with their own records. Ids are not reused.

The opaque-id model matters here for the same reason it mattered in Provisional Commitment: identifying an attestation by `(action_ref, actor_ref)` would collapse legitimate re-attestations, and identifying by timestamp would lose precision under concurrent attestations. Opaque ids preserve the one-attestation-one-id discipline that makes per-event audit reconstruction tractable.

### Inputs

- An action reference identifying *what* is being attested. The atom treats this as opaque — the host pattern defines what an action is and how to reference it.
- An actor reference identifying *who* is attesting. Also opaque — the actor registry is a separate concern.
- A credential — the private material the actor uses to produce the proof. The atom consumes this at `attest` time and never persists it.
- Actions:
  - `attest(action_ref, actor_ref, credential) → attestation_id | rejected(invalid-request | invalid-credential | storage-failure)`
  - `verify(attestation_id) → verified | failed-verification(proof-invalid | actor-unknown-in-registry | registry-unavailable) | not-known`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of attestations.
- For each attestation: `attestation_id`, `action_ref`, `actor_ref`, `attested_at`, and the `proof`.
- `attest` returns the new `attestation_id` on success, or a rejection naming the failed precondition.
- `verify` returns `verified`, `failed-verification(reason)`, or `not-known`. The verify call itself does not modify state.

### State

A single stable state: **Attested**. There are no transitions out of Attested — the atom has no surface for revoking, invalidating, or modifying an attestation once it is recorded. Verification is a read-only query over the attestation's stored fields and the actor registry's public material. Whether a verification result *changes over time* — because the actor registry's view of the actor changes (key rotation, public material updates) — is a property of the composing actor registry, not of the atom.

Each attestation carries:

- **`attestation_id`** — opaque, immutable, system-generated. Set on `attest`. Never changes.
- **`action_ref`** — opaque reference to the action being attested. Set on `attest`. Never changes.
- **`actor_ref`** — opaque reference to the actor doing the attesting. Set on `attest`. Never changes.
- **`proof`** — the cryptographic or procedural artifact that binds `actor_ref` to `action_ref`. Set on `attest`. Never changes.
- **`attested_at`** — wall-time when the attestation was recorded. Set on `attest`. Never changes.

Transitions:

- `attest(action_ref, actor_ref, credential)` → a new attestation is recorded in Attested with a fresh `attestation_id`, the supplied `action_ref` and `actor_ref`, the proof computed from the credential, and `attested_at = now`. Returns `attestation_id`.
- *(no other transitions)*

### Flow

1. **Composing pattern initiates an action that requires attribution.** It calls `attest(action_ref, actor_ref, credential)` with the actor's credential in hand.
2. **Atom validates the credential and computes the proof.** If the credential does not validate against the actor's public material, the call is rejected. Otherwise the atom records the attestation and returns the id.
3. **Time passes; the attestation persists.** The host application stores the `attestation_id` alongside whatever it represents (the commitment record, the event log entry, the contract artifact).
4. **An auditor, verifier, or composing pattern queries the attestation.** Calls `verify(attestation_id)`. The atom retrieves the attestation, checks the proof against `action_ref` and `actor_ref` using the actor registry's public material, and returns the verification result.

### Decision points

- **At `attest(action_ref, actor_ref, credential)`** — `action_ref`, `actor_ref`, and `credential` must be non-null and non-empty; otherwise `invalid-request`. (Further structural validation of the opaque references is the composing pattern's responsibility — the atom does not know what a valid action or actor looks like.) The credential must validate against the actor registry's public material for `actor_ref`; otherwise `invalid-credential`. The credential is *consumed*, never stored. If the attestation store write fails after successful credential validation, the atom returns `rejected(storage-failure)` — no attestation is recorded. Durability of the attestation store is implementation-owned; see Edge cases.
- **At `verify(attestation_id)`** — `attestation_id` must reference a recorded attestation; otherwise `not-known`. (This is a lookup miss, distinct from a verification failure.) The stored `proof` must check out against the stored `action_ref` and `actor_ref` using the actor registry's current public material; otherwise `failed-verification(proof-invalid)`. If the actor registry cannot return public material for `actor_ref` — because the actor has been deleted from the registry — the atom returns `failed-verification(actor-unknown-in-registry)`; if the registry is unavailable, `failed-verification(registry-unavailable)`. Both are distinct from `proof-invalid` (the proof exists but fails) and from `not-known` (the attestation id is not in the store). The verify call itself never *rejects* in the same sense as other action calls — `verified`, `failed-verification`, and `not-known` are the three legitimate outcomes, and a composing pattern should treat each distinctly.

### Behavior

Observed behavior, derived from how regulated systems use attestations:

- An attestation is a cryptographic or procedural artifact, not merely a logged claim. The atom is vocabulary-neutral about the mechanism (asymmetric signature, MAC over a shared secret, smart-card-bound proof, qualified electronic signature, witnessed approval) — the contract is only that the proof verifies later from the recorded fields alone.
- Verification needs no out-of-band lookup at verify time beyond the actor registry's public material. The attestation is self-contained relative to the registry; a verifier with the attestation and the registry's view of the actor can decide.
- `attest` never modifies an existing attestation. It always creates a new one. Re-attesting the same action by the same actor produces a separate record with its own id — useful for credential-rotation scenarios where multiple proofs over the same action accumulate.
- The credential is consumed by `attest` and never persisted by the atom. Credential management — storage, rotation, recovery, HSM binding — is an entirely separate concern.
- `verify` results depend on the actor registry's current view of `actor_ref`. If the registry's public material for the actor changes (key rotation), previously-verified attestations may begin to fail verification under the new key, unless the registry maintains historical material. Whether the registry does so is the registry's concern, not the atom's.
- The atom does not retroactively invalidate attestations made with a credential later determined to have been compromised. That reinterpretation belongs to a Compromise Disclosure composing pattern; see Edge cases.

### Feedback

Each successful action produces an observable, measurable change:

- After `attest` — a new attestation appears in the system with a fresh `attestation_id`, the supplied `action_ref` and `actor_ref`, the computed `proof`, and `attested_at`. Total count increases by one. The id is returned.
- After `verify` — no state change. The atom returns one of `verified`, `failed-verification(reason)`, or `not-known`.

Each rejected `attest` action produces an observable refusal: `invalid-request`, `invalid-credential`, or `storage-failure`. Each `verify` outcome is a first-class result (not a rejection): `verified`, `failed-verification(proof-invalid | actor-unknown-in-registry | registry-unavailable)`, or `not-known`.

The attestation set is queryable. Per-attestation fields (id, action_ref, actor_ref, attested_at, proof) are observable to auditors and operators; whether end-users see them is a presentation policy of the host system.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Attestation immutability.** Once recorded, an attestation's `attestation_id`, `action_ref`, `actor_ref`, `proof`, and `attested_at` never change.
- **Invariant 2 — Action binding.** For any attestation in the system, the recorded `proof` verifies cryptographically or procedurally against the recorded `action_ref`. A proof produced for a different action does not verify against this attestation.
- **Invariant 3 — Actor binding.** For any attestation in the system, the recorded `proof` verifies against the recorded `actor_ref` using the actor registry's public material. A proof produced by a different actor does not verify against this attestation.
- **Invariant 4 — Id stability.** An attestation's `attestation_id` is set on `attest` and never changes.
- **Invariant 5 — No id reuse.** No two attestations share an `attestation_id` across the lifetime of the system.
- **Invariant 6 — Self-containment.** `verify(attestation_id)` requires only the attestation's stored fields and the actor registry's public material for `actor_ref`. No additional out-of-band data is consulted at verify time. This holds for the atom's design; specific credential mechanisms (X.509 certificate-based credentials requiring revocation status checks) may require additional data at verify time if revocation status is not embedded in the proof — see *Certificate revocation status* in Edge cases.
- **Invariant 7 — Verification consistency under fixed registry state.** For any attestation and any fixed view of the actor registry, repeated `verify` calls return the same result.
- **Invariant 8 — Non-repudiation contract.** If `verify(attestation_id)` returns `verified`, then under the assumption that the actor's credential was not compromised at or before `attested_at`, the actor referenced by `actor_ref` authorized the action referenced by `action_ref` at `attested_at`. The contract is conditional on credential integrity; reinterpretation under compromise belongs to a Compromise Disclosure composing pattern.
- **Invariant 9 — Attestation durability.** Once recorded, an attestation is never deleted by the atom. The attestation store's record count is monotonically non-decreasing. The atom provides no deletion surface; cascading deletion under a retention policy is the composing application's responsibility (see Tamper Evidence and Retention Window in Composition notes). An `attestation_id` returned by a successful `attest` call is durably persisted; a `storage-failure` rejection guarantees no partial record was written.

Action binding and actor binding together give the *attribution* property — the regulator's question *"who authorized this action?"* has a structural answer rather than a procedural one. Attestation immutability and self-containment together give the *survivability* property — attestations remain verifiable independent of the system that recorded them. The non-repudiation contract names the regulatory bar the atom is built to clear.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Banking — wire transfer authorization

A teller initiates a $50,000 wire. Bank policy requires supervisor approval for wires over $10,000. The supervisor reviews and attests — `attest(wire_w91, supervisor_s12, supervisor_credential) → attestation_a44`. The attestation is stored alongside the wire record. Six months later, an internal auditor reviewing the day's high-value wires queries `verify(a44)` and receives `verified` — confirming supervisor s12 authorized wire w91 at the recorded time, without trusting the teller's account of the conversation that preceded it.

### Healthcare — electronic prescription for a controlled substance

A physician writes a Schedule II prescription. DEA Electronic Prescriptions for Controlled Substances (EPCS) regulations require two-factor cryptographic attestation. The physician's EHR computes `attest(rx_r37, dr_park, dr_park_credential)` using the physician's smart-card-bound credential and a second factor. The prescription transmits to the pharmacy with `attestation_a91`. The pharmacy calls `verify(a91)` before dispensing; `verified` → fill. Two years later, during a DEA audit, the same verification proves Dr. Park authorized that specific prescription on that specific date.

### Payments — chip-and-PIN transaction

A cardholder taps a chip card at a terminal and enters their PIN. The card produces a cryptographic attestation: `attest(transaction_t883, card_c41, card_credential)`. The terminal forwards the attestation with the transaction. The issuer calls `verify` before authorizing the charge. Months later, the cardholder disputes the charge as unauthorized; the issuer produces `attestation` and re-verifies. `verified` → the card was physically present and the correct PIN was entered, shifting liability to the cardholder per scheme rules. `failed-verification` → the dispute is upheld.

### Legal — qualified electronic signature on a contract

Two parties sign a contract via a qualified electronic signature service. Each invokes `attest(contract_c12, party_ref, qualified_signature_credential)` using credentials issued by a qualified trust service provider. Two attestations are stored alongside the contract. Any future party — opposing counsel, mediator, court — invokes `verify` on either attestation. Under eIDAS Regulation, qualified electronic signatures carry the same legal effect as handwritten signatures, and the verification result is admissible evidence of authorship.

### Source control — signed commits in regulated software

A developer at an FDA-cleared medical-device company pushes a commit signed with their hardware-key-backed credential. The version-control system records the attestation: `attest(commit_c44a, dev_smith, smith_credential) → attestation_a17`. CI infrastructure calls `verify(a17)` before allowing merge into the release branch. During an FDA software-of-unknown-provenance audit, the auditor walks the release branch and re-verifies every commit's attestation. SOX-scoped financial systems and Common Criteria evaluated products follow the same pattern.

The mechanic is identical across all five. What differs: the credential mechanism (smart card, software key, qualified signature instrument, hardware token, chip-card secure element), the verification frequency (every action vs. on dispute vs. on audit), the regulatory consequence of `failed-verification`, and the composing patterns active around it (two-factor for prescriptions, witness signatures for some legal contracts, MFA for high-value wires).

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator audit.** A regulator asks *"who confirmed commitment c41?"* The auditor follows the commitment record to its `attestation_id`, calls `verify`, and reads `actor_ref` from the verified attestation. The verification is performed against stored fields and registry public material — not against developer testimony, log integrity, or system trust. Invariants 2 and 3 are the structural answer.
- **Disputed transaction.** An actor claims they did not authorize an action. The investigator retrieves the attestation and calls `verify`. If `verified`, the proof binds the named actor to the named action at `attested_at` (Invariant 8). The actor cannot plausibly deny it without claiming credential compromise — an out-of-band investigation governed by a separate Compromise Disclosure pattern. If `failed-verification`, the dispute is upheld and the system's record is corrected.
- **Compromised credential discovered.** A credential is later determined to have been compromised before some date. The atom does *not* retroactively invalidate attestations made with that credential — Invariant 1 forbids modifying recorded attestations, and Invariant 8 is conditional on credential integrity. Reinterpretation of attestations made during the compromise window belongs to a Compromise Disclosure composing pattern, which produces *new* records that reframe the previously-verified attestations as untrustworthy. The atom's attestation store remains immutable; the meaning of its records changes via composition, not via mutation.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Actor lifecycle.** Actor registration, deactivation, suspension, revocation, and recovery belong to an Actor Registry / Identity Provisioning pattern. The atom takes `actor_ref` as opaque and consults the registry's public material via `verify`.
- **Authentication.** Login flows, session management, MFA challenge-response — these produce the credential the atom consumes. The atom does not opine on how the credential reaches `attest`.
- **Authorization.** Whether the actor was *permitted* to take the action is a separate question from whether they *authorized* it. Authorization / RBAC / ABAC is a composing pattern.
- **Credential management.** Storage, rotation, recovery, HSM-binding, biometric protection — implementation concerns. The atom never persists the credential.
- **Multi-actor attestation.** Witness signatures, m-of-n approvals, co-signed contracts, dual-control workflows — each `attest` call records one actor's binding. Multi-actor schemes compose with a Witness / Co-signature pattern.
- **Retroactive credential revocation.** As discussed above, attestations are immutable; reinterpretation under compromise belongs to Compromise Disclosure.
- **Tamper-evidence on the attestation store.** The bare atom assumes the attestation store has not been rewritten by an adversary with write access. Cryptographic hash chains, Merkle trees, and timestamp-authority anchoring belong to a Tamper Evidence composing pattern. (Many credential mechanisms — qualified signatures, blockchain-anchored attestations — provide tamper-evidence as a side effect; the atom does not require it but composes naturally with it.)
- **Time-of-attestation veracity.** `attested_at` is captured from the implicit clock. Whether that clock is honest, monotonic, or synchronized is a deployment concern. Trusted timestamping (RFC 3161) is a composing pattern that supplies a verifiable time-anchor.
- **Action-content immutability.** The atom binds `action_ref`, not action content. If the action's content can be mutated after attestation (an editable document, a modifiable transaction record), the binding loses meaning. The host pattern is responsible for either binding to immutable content (e.g., a content hash) or composing with a Content Lock pattern.
- **Cross-system identity portability.** `actor_ref` is opaque to the atom; portability across trust domains (federated identity, cross-organizational verification) belongs to an Identity Federation pattern.
- **Group attestations, pseudonyms, anonymous credentials.** Single actor reference per attestation. Group signatures, ring signatures, and selective-disclosure credentials are separate concepts.
- **Verification result caching.** `verify` is read-only and idempotent under fixed registry state, but the atom does not specify whether implementations may cache the result. Caching is implementation policy; a stale cache under a registry change is a deployment-shaped concern.
- **Certificate revocation status.** For attestations using X.509 certificate-based credentials, verification may require determining whether the certificate was revoked at or before `attested_at`. OCSP stapling embeds the revocation status proof in the credential mechanism and keeps verification self-contained (satisfying Invariant 6); without stapling, the verifier must query a live OCSP responder or CRL distribution point, which introduces an out-of-band dependency that weakens Invariant 6. Short-lived certificates that expire before revocation is likely also satisfy self-containment. The credential mechanism choice — stapling, live revocation check, or short-lived certificates — is a deployment concern; the atom's self-containment invariant holds for mechanisms that embed revocation status in the proof and must be noted as conditional for mechanisms that rely on external revocation services at verify time.
- **Attestation store durability.** `attest` writes a new record as a single atomic operation; a write failure after credential validation returns `rejected(storage-failure)` with no partial record in the store. Durability across crashes, replication lag, and storage-engine failure is implementation-owned. High-assurance deployments should compose with a Write-Ahead Log or equivalent mechanism to ensure that a `storage-failure` response and the absence of a persisted record are consistent.

Where the atom breaks down: when *authorization* cannot be reduced to a single actor (truly anonymous attestation in regulated contexts is a contradiction in terms); when the credential mechanism cannot produce a verifiable proof (shared secrets where anyone with the secret could forge an attestation); when the host environment has no actor registry the verifier can consult.

---

## Composition notes

Actor Identity is freestanding and is the non-repudiation contract that several other atoms reference:

- **[Provisional Commitment](../resource-lifecycle/provisional-commitment.md)** — every `place_hold`, `confirm`, `release`, and `expire` produces an attestation; the commitment's audit trail includes `attestation_id`s alongside per-transition timestamps. This is the non-repudiation composition Provisional Commitment's Lineage notes anticipated.
- **[Event Log](../temporal/event-log.md)** — every appended event carries an `attestation_id` in its payload (or as a structured sidecar); readers verify before trusting the recorded `actor` field. Event Log's existing edge case naming Actor Identity as forthcoming is now resolved by this atom.
- **Actor Registry / Identity Provisioning** *(forthcoming)* — supplies the public material `verify` consults and the actor lifecycle (registration, key rotation, suspension, revocation).
- **Authentication** *(forthcoming)* — produces the credential the atom consumes. Authenticator Assurance Levels (NIST SP 800-63 IAL/AAL/FAL) belong to that pattern.
- **Authorization / RBAC** *(forthcoming)* — combines what an actor *can* do with what they *did do*. Attestation answers the second; authorization answers the first.
- **Compromise Disclosure** *(forthcoming)* — handles retroactive credential invalidation by producing reinterpretation records, never by mutating the attestation store.
- **Witness / Co-signature** *(forthcoming)* — multi-actor attestations (m-of-n approval, dual control, qualified witness signatures).
- **[Tamper Evidence](./tamper-evidence.md)** — cryptographic chaining (or Merkle-tree commitment, or external anchoring) of the attestation store, so that any rewrite of recorded attestations is detectable from the records alone.
- **Trusted Timestamping** *(forthcoming, per RFC 3161)* — verifiable time-anchor for `attested_at`.

The canonical regulated-audit stack composes [Event Log](../temporal/event-log.md) + Actor Identity + [Retention Window](./retention-window.md) + [Tamper Evidence](./tamper-evidence.md) as four freestanding atoms; the **[Audit Trail](../../compositions/audit-trail.md)** application is the wiring.

---

## Standards references

Actor Identity is a foundational compliance primitive with deep regulatory anchoring:

- **NIST SP 800-63-3 (Digital Identity Guidelines)** — Identity Assurance Levels (IAL), Authenticator Assurance Levels (AAL), Federation Assurance Levels (FAL). The atom's credential-consumed-not-stored discipline and verification self-containment correspond to NIST's authenticator and verifier requirements.
- **eIDAS Regulation (EU 910/2014)** — qualified, advanced, and basic electronic signatures. Qualified electronic signatures carry the same legal effect as handwritten signatures across the EU; the atom's non-repudiation contract is the operational form.
- **FIPS 186-4 / FIPS 186-5 (Digital Signature Standard)** — cryptographic foundation for asymmetric attestation. The atom is mechanism-neutral but FIPS 186 is the canonical credential-mechanism anchor.
- **ISO/IEC 27001 §A.9 (Access Control) and §A.12.4 (Logging and Monitoring)** — actor attribution as an access-control and audit requirement.
- **21 CFR Part 11 (FDA Electronic Records and Electronic Signatures)** — for healthcare, pharmaceuticals, and medical devices: requires electronic signatures to be uniquely attributable to one individual, with cryptographic or procedural binding that resists repudiation.
- **HIPAA §164.312(d) (Person or Entity Authentication)** — verification that a person or entity seeking access is the one claimed.
- **DEA EPCS (21 CFR §1311)** — Electronic Prescriptions for Controlled Substances: two-factor cryptographic attestation requirements.
- **GDPR Article 32 (Security of Processing)** — names "ensuring the ongoing confidentiality, integrity, availability and resilience of processing systems and services"; non-repudiation is a recognized security property under Article 32's scope.
- **Sarbanes-Oxley §302 and §404** — officer certifications and internal control over financial reporting. Authenticated attestations on financial-system changes are §302 / §404 evidence.
- **PCI DSS Requirement 8 (Identify and Authenticate Access)** — for payment systems handling cardholder data.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing authentication, authorization, registry, witness, and compromise concerns as separate atoms.
- **Eiffel's design-by-contract** — preconditions on `attest`; named rejection and verification reasons.
- **Public-key cryptography literature** (Diffie-Hellman, RSA, ECDSA, EdDSA) — the foundational mechanism for verifiable proofs of authorship.
- **Non-repudiation literature in computer security** (Zhou and Gollmann, ISO/IEC 13888) — the formal framing of non-repudiation services as distinct from authentication.

---

## Generation acceptance

A derived implementation of Actor Identity is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the attestation store plus the composing actor registry's public material, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct any attestation from its stored fields.** `attestation_id`, `action_ref`, `actor_ref`, `proof`, `attested_at` are sufficient for the verifier; no additional state is consulted at verify time beyond the registry's public material.
- **Verify each attestation independently.** `verify` is a function of the attestation and the registry's current view of the actor. The auditor can run verification themselves with no privileged access beyond the public material.
- **Confirm action binding and actor binding.** The proof verifies against the recorded `action_ref` and `actor_ref`, and only against those (Invariants 2 and 3).
- **Distinguish the three verify outcomes.** `verified`, `failed-verification(reason)`, and `not-known` are observable as distinct first-class results, not collapsed into a single boolean.
- **Identify the composing patterns active in this deployment.** Whether actor registry, authentication mechanism, witness scheme, compromise disclosure, tamper evidence, and trusted timestamping are wired in, with what configuration.

This is the generator's contract: any code generated from this atom must produce attestations and a verification surface that pass the five checks above. The bar is the regulator's question — *"can you prove who authorized this action?"* — not the developer's intuition.

---

## Status

`grounded — last full rescan: 2026-05-13` — all required structural elements resolved; identity model explicit; attest and verify action signatures with fully-named rejection and outcome reasons; nine invariants including attestation durability (Invariant 9); five cross-domain examples spanning banking, healthcare, payments, legal, and source control; regulated adversarial scenarios cover regulator audit, disputed transaction, and compromised credential; fifteen edge cases including certificate revocation status and attestation store durability (named in refinement round 1). First entry in `atoms/compliance/`. Survived one foundation pass and one refinement round.

---

## Lineage notes

This atom survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)) on its first iteration.

**Conventions inherited from prior work.** This atom is the second regulated atom in the library and was drafted with the two conventions Provisional Commitment first introduced — *Regulated adversarial scenarios* as an examples subsection and *Generation acceptance* as a standalone section — baked in from the first draft rather than added in a second iteration. (Both conventions have since been promoted to canonical status in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md); patterns drafted after this one inherit from the methodology directly rather than from any specific predecessor.) This atom is also the first to resolve a forthcoming-link that another published atom (Provisional Commitment) named; the existence of Actor Identity converts Provisional Commitment's `(forthcoming)` markers into resolved cross-references.

**Pass 1 — Structural completeness (GRID).** Clean. The State node is unusually small (one stable state, Attested, and no transitions out) — early drafts considered modeling Attestation → Revoked or Attestation → Superseded but both were caught by Pass 2 as over-absorption (revocation belongs to the actor registry; superseding belongs to a re-attestation that produces a separate record). All nine GRID nodes resolved with their references intact, including a small but meaningful one: verify is captured under Decision points with its three first-class outcomes rather than forced into the success-or-rejection mold the other atoms use.

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
