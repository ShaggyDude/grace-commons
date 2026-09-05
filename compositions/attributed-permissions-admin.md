---
title: Attributed Permissions Admin
parent: Conceptual Compositions
nav_order: 8
has_toc: true
toc: true
---

# Attributed Permissions Admin

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Attributed Permissions Admin makes sure every access grant and every revocation comes with verifiable proof of who authorized it. It combines two patterns: one that records access grants and answers "is this allowed?" (Permissions) and one that records a verifiable attestation binding a named actor to an action (Actor Identity). Neither knows about the other — the permission system records grants but not who issued them, and the attestation system records who attested to an action but knows nothing about grants. The composition wires them so that issuing or revoking a grant always does both, in a fixed order, and records the pairing, so there is no way through the composition to create a grant without an attestation or revoke one without proof of authorization. That makes the regulator's question — "who granted this access, when, and under what credential?" — answerable from the records alone. Combining the two produces guarantees neither has alone: no grant lacks attribution, every revocation is attributed, and given any grant you can recover who authorized it and the proof. (One honest limit: someone with direct write access to the underlying grant store could still insert an unattributed grant, bypassing the composition entirely; closing that gap requires the separate Tamper Evidence pattern.) This is the foundation that role-based access control, delegation, and attribute-based policies can build on without reinventing the who-authorized-this layer.

The most common uses are administrative access-control panels in SOX (Sarbanes-Oxley Act)-scoped financial systems, HIPAA (Health Insurance Portability and Accountability Act)-regulated electronic health record systems where every patient-record access grant must be attributable to the granting administrator, PCI DSS (Payment Card Industry Data Security Standard)-scoped payment systems where Requirement 7 mandates attributed authorization, FDA (US Food and Drug Administration)-regulated software pipelines under 21 CFR (Code of Federal Regulations) Part 11 where branch-protection grants must carry a verifiable approver, and legal document management systems where matter-level access grants must be attributable to the responsible partner. In every case the mechanic is the same — attest first, grant second, record the pairing — and the audit answer is structural: the records alone establish who authorized which access, when, and under what credential.

This composition does not implement role management, attribute-based policy evaluation, scope hierarchy, explicit deny, delegation, time-bounded grants, mass deprovisioning, or grantor authorization (whether the grantor was *permitted* to issue this grant per organizational policy). Each is a separate composable pattern; see Composition notes in the constituent atoms.

---

## Intent

Permissions alone records *that* a grant exists. Actor Identity alone records *that* an actor attested to an action. Neither tells the auditor *who issued this specific grant*, and neither prevents an unattested grant from being inserted into the permissions store directly — by a database administrator, a misconfigured automation, or an attacker with write access to the grant table. The audit question the regulator actually asks — *"who authorized this access, and can you prove they did?"* — has no structural answer at the bare-atom layer.

This composition addresses that gap. Every [Issue Grant] call walks two atoms in sequence: Actor Identity records the grantor's attestation over a proposal (subject, scope, intent-to-grant), and then Permissions records the grant. The two records are paired in the composition's emergent state — the grant's `grant_id` is bound to the attestation's `attestation_id`, and the binding is recoverable from either side. Revocations follow the same pattern: the revoker attests, then Permissions revokes, and the pairing is recorded against the grant.

The pattern matters because regulated systems consistently fail this audit question when the atoms are wired by hand at the calling layer. A developer who calls `Permissions.grant` without also calling `Actor Identity.attest` produces an unattributed grant — silent at the schema level, fatal at audit time. The composition makes the omission impossible *through its exposed surface*: there is no path through the composition that records a grant without attesting, or records a revocation without attesting. The bare atoms remain unchanged; the composition is the wiring that turns *two separate records you can forget to coordinate* into *one administered action you cannot bypass through the composition's surface*. An adversary with direct write access to the underlying Permissions store can still insert unattributed grants, bypassing the composition entirely — this is the exact tamper surface the breach-forensics adversarial scenario exposes and the Tamper Evidence composing pattern addresses.

This is not a Role-Based Access Control (RBAC) layer, not a delegation system, and not an attribute-based policy evaluator. Each of those is a separate composing pattern. This composition supplies only the bottom rung — every grant has a verifiable grantor; every revocation has a verifiable revoker — on top of which delegation, RBAC, ABAC (Attribute-Based Access Control — permissions decided from attributes of the actor, resource, and context), and policy reconciliation can compose without re-inventing the attribution surface.

---

## Composes

- **[Permissions](../atoms/permissions.md)** — provides the grant store and the evaluation surface: `grant`, `revoke`, `permitted`. The composition maintains exactly one Permissions instance scoped to the administered authorization domain. The composition wraps `grant` and `revoke` behind its own actions; `permitted` is passed through unchanged.
- **[Actor Identity](../atoms/actor-identity.md)** — provides the attestation surface: `attest`, `verify`. The composition maintains exactly one Actor Identity instance whose attestations bind grantors and revokers to composition-defined action references. The composition wraps `attest` behind its own actions and surfaces `verify` results inside the composition's read-only query.

---

## Composition logic

### Composition state

**Identity model for emergent state.** The composition introduces no new entity identity. Its emergent state is keyed by `grant_id` — the opaque, system-generated id owned by the Permissions atom. There is no separate composition-level id for a pairing record; `grant_id` is the unique handle through which both maps are accessed, the same id the Permissions store uses as the grant's identity.

The composition owns two pieces of emergent state that neither constituent atom carries. Both carry their Contract classification per [`execution-contract.md`](../execution-contract.md) §Composition state — and both classify **extraction-pending**, because the pairing they hold is truth no constituent store replays:

- **`grant_attribution`** — a map from `grant_id` to `attestation_id`. Populated when [Issue Grant] records both a grant in Permissions and the corresponding attestation in Actor Identity; the pair is durably written before the action returns. Read by [Verify Grant Attribution] and by audit-time reconstruction. The composition exposes no surface to modify or delete these entries; see Invariant 6 — *Pairing-map durability*. **Contract classification: extraction-pending.** The pairing is not derivable from either store: the grant attestation's proposal reference is `{subject_ref, action_scope, nonce, requested_at}` — the `grant_id` does not exist when the attestation is written (attest-before-record is the load-bearing order), so no attestation payload names it — and the Permissions grant record carries no attestation field. The `(grant_id, attestation_id)` pair is born in step 5's write and lives nowhere else. Per the Contract, a composition element carrying truth no constituent store holds is a not-yet-extracted atom: the proposed atom is a **Binding Registry** *(forthcoming)* — a registry-shaped pairing store (key ↔ key, write-once, durable) that the composition-state audit also names as the candidate home for Authenticated Actor's principal↔actor namespace bijection, the same shape recurring across compositions. Until that extraction lands, the map is declared recorded debt riding the extraction's schedule, and Invariant 6's durability obligation is the debt's safety net: losing an entry loses the attribution fact itself, not an index over it.

- **`revocation_attribution`** — a map from `grant_id` to `attestation_id`. Populated when [Revoke Grant] records both a revocation in Permissions and the corresponding attestation in Actor Identity. Each grant has at most one revocation attestation (revocation is terminal per Permissions' Invariant 3 — status monotonicity is its Invariant 2; terminality is 3). Read by [Verify Grant Attribution] for revoked grants and by audit-time reconstruction. The composition exposes no surface to modify or delete these entries; see Invariant 6. **Contract classification: extraction-pending, with the near-derivability honestly bounded.** Unlike the grant side, the fixed revocation proposal body *does* carry the `grant_id`, so a namespace-filtered enumeration of the Actor Identity store recovers every *candidate* attestation for a grant — but not the pairing: a failed revocation attempt (`not-known`, `not-active`, storage failure at the revocation write) leaves an orphan attestation naming the *same* `grant_id`, and when several attestations name one grant, which of them paired with the committed revocation is a fact only this map records (timestamps are advisory and cannot arbitrate). The same **Binding Registry** extraction is the proposed home; until it lands, the enumeration is the audit's orphan-detection surface (Generation acceptance check 5), never a rebuild.

The two maps' lifetimes match the Permissions store's lifetime: while a grant exists in the Permissions store (Active or Revoked), its attribution record exists in the corresponding map. Map entry lifecycle after a retention purge is governed by the composing Retention Window pattern's scope — see *Retention of attribution records* in Edge cases.

- **[Orphan Log]** — an append-only operational record of attestations that were successfully written to Actor Identity but whose corresponding grant or revocation writes failed. Each entry has the shape: `{attestation_id, proposal_ref, requested_at, underlying_reason}`. `underlying_reason` is one of `grant-storage-failure`, `revocation-storage-failure`, `invalid-request` (grant side), `not-known` (revocation side), `not-active` (revocation side), or `pairing-write-failure`. The orphan log is the composing system's operational surface for retry and manual review; it is not the audit mechanism for orphan detection. The audit's structural orphan detection — Generation acceptance check 5 — operates by cross-referencing the Actor Identity store against the two attribution maps directly and does not depend on the orphan log being populated or retained. The orphan log is populated in step 4 of [Issue Grant], step 5 of [Issue Grant], step 4 of [Revoke Grant], and step 5 of [Revoke Grant]; it is never modified after a write — see Invariant 8 — *Orphan log durability*. **Contract classification: re-house-on-Event-Log.** The log is history-shaped coordination memory — a journal of what the composition's own failed sequences left behind — and the Contract's record-coordination rule assigns exactly that to a composed Event Log rather than a bespoke composition store; this composition's cut has no Event Log constituent, so the log is declared recorded debt: when the re-housing lands (an Event Log instance composed for the operational journal), Invariant 8's durability obligation transfers to the composed log's own append-only guarantee, and until then the log is composition-held truth carried under Invariant 8. The audit surface is unaffected either way — Generation acceptance check 5's orphan detection deliberately does not depend on this log.

### Configuration

The composition exposes one deployment-settable knob:

- **`grant_proposal_format`** — type: structured reference; default: `{subject_ref, action_scope, nonce, requested_at}` serialized in a canonical order (e.g., sorted key-value pairs with length prefixes). The format defines the synthetic `action_ref` that Actor Identity's `attest` call binds the grantor's proof to. Two rules the deployment must enforce: (1) the format must include a unique-per-grant element (the nonce is the canonical solution) so that two distinct grant attempts for the same `(subject_ref, action_scope)` pair produce distinct proposal references and therefore distinct attestations; (2) the format must include a deployment-specific namespace prefix (e.g., `apa:grant:` prepended to the serialized proposal body) that distinguishes composition-issued proposal references from attestations issued by other composing systems sharing the same Actor Identity store. Without the namespace prefix, Generation acceptance check 5 — *identify orphan attestations* — cannot be completed from the records alone: the auditor has no structural criterion by which to filter composition-issued `action_ref` values from foreign ones. Deployments under regulation that mandates a specific proposal-encoding format (e.g., a national e-prescribing scheme) must conform to that format; the composition's only requirements are uniqueness per proposal and namespace enumerability.

**`revocation_proposal_format` for [Revoke Grant] is fixed (not configurable): `{grant_id, requested_at}` serialized canonically with the same deployment namespace prefix as `grant_proposal_format`.** The namespace prefix requirement for revocation proposals is a hard rule, not a rationale: the revocation proposal body must be prefixed with the same deployment-specific namespace prefix used for grant proposals (e.g., if grant proposals use `apa:grant:`, revocation proposals must also begin with that prefix, yielding `apa:grant:{grant_id, requested_at}`). Without this rule, a deployment could apply the namespace prefix to grant proposals but omit it from revocation proposals, making revocation-phase orphan attestations indistinguishable from foreign attestations in a shared Actor Identity store and breaking Generation acceptance check 5 for the revocation-side orphan population. **Principle.** A revocation is uniquely identified by the grant it terminates; the revoker's intent-claim is `{grant_id, requested_at}` — which grant, requested when. Neither a nonce nor a configurable shape serves any audit purpose here. **Likely objection.** "Shouldn't the revocation proposal format be as configurable as the grant proposal format, for symmetry?" **Mechanism that resolves it.** The grant proposal format needs two configurable properties: nonce uniqueness (so that two grant attempts for the same pair produce distinct attestations) and namespace prefix (so that orphan attestations are enumerable audit-side). Neither applies to revocation proposals. `grant_id` uniqueness is already guaranteed by Permissions' invariants — no nonce needed. Namespace enumerability for revocation-proposal orphans is satisfied by the *same* namespace prefix as the grant proposal (the composition issues both; the auditor applies the same filter). Providing a separate `revocation_proposal_format` knob would allow a misconfigured deployment to produce revocation proposals that do not share the grant namespace, making orphan detection incomplete and violating the requirement the namespace prefix is intended to satisfy. **Result.** `revocation_proposal_format` is fixed; correctness requires it, not convenience.

`requested_at` in both proposal formats is the **seam-injected clock reading** — per the Logic Confinement Principle ([`execution-contract.md`](../execution-contract.md)), the host reads the clock once per invocation and injects `now` (`clock_t`) at the composition's single I/O seam before the orchestration runs; no action reads a wall clock inside a transition and no signature carries a `now` parameter (the seam, not a parameter, is the contract for clock entry). One injected reading per invocation serves the proposal's `requested_at`; no guard at this layer is time-gated, so a skewed reading can only mis-annotate a proposal, never admit or refuse a call. The same clock-quality caveat that applies to Permissions' `granted_at` and Actor Identity's `attested_at` (each stamped from the reading injected at *that* constituent's own seam) applies here: monotonicity is best-effort under NTP adjustments, not guaranteed, and the readings are per-seam, never claimed equal. Composing with Trusted Timestamping (RFC 3161) supplies an adversarially-defensible time anchor if the deployment requires it.

### Primitive policies

The composition accepts these string-typed inputs at its outer boundary. Validation rules are stated explicitly; each input that fails validation produces a rejection at the composition layer before either constituent atom is invoked.

- **`subject_ref`** (input to [Issue Grant]) — opaque reference. Validation: non-empty; whitespace-trimmed at the composition layer (the composition normalizes by trimming leading and trailing whitespace before passing to Permissions); case-sensitive (matching Permissions' exact-match semantics); length cap 256 characters. Empty or all-whitespace inputs produce `rejected(invalid-request)`.
- **`action_scope`** (input to [Issue Grant]) — opaque reference. Same validation as `subject_ref`. The scope vocabulary itself is deployment-defined; this composition treats every scope as opaque.
- **`grantor_ref`** (input to [Issue Grant]) — opaque reference. Same validation. Passed directly to Actor Identity's `attest`.
- **`grantor_credential`** (input to [Issue Grant]) — credential material. Validation: non-empty; structural well-formedness checked by Actor Identity (which produces `invalid-credential` if it fails). The composition does not inspect credential contents.
- **`grant_id`** (input to [Revoke Grant]) — opaque id previously returned by [Issue Grant]. Validation: non-empty; existence checked by Permissions (which produces `not-known` if the id is unknown). The composition does not query Permissions ahead of `revoke` to pre-validate.
- **`revoker_ref`** (input to [Revoke Grant]) — same validation as `grantor_ref`.
- **`revoker_credential`** (input to [Revoke Grant]) — same validation as `grantor_credential`.

Whitespace normalization is performed once at the composition layer for each opaque reference; downstream stores receive the normalized value. This forecloses the *"whitespace-only difference between the grant and the revocation query"* class of Pass 3 finding.

### Action wiring

The composition exposes two state-changing actions ([Issue Grant], [Revoke Grant]), one read-only attribution query ([Verify Grant Attribution]), and one passthrough evaluation query (`permitted`). Each state-changing action walks both constituent atoms in a fixed order; any failure at either step is surfaced at the composition's boundary with a fully-named rejection taxonomy.

- **`issue_grant(subject_ref, action_scope, grantor_ref, grantor_credential) → (grant_id, attestation_id) | rejected(invalid-request | invalid-credential | attribution-storage-failure | orphan-attestation)`**
  1. Validate inputs per *Primitive policies*. If any input fails validation, return `rejected(invalid-request)` without invoking either constituent.
  2. Construct the proposal reference per `grant_proposal_format`: `{subject_ref, action_scope, nonce, requested_at}` serialized canonically. The nonce is the injected `id_t`, allocated at the composition's I/O seam (fresh and opaque per call — never minted inside the transition); `requested_at` is the seam-injected clock reading for this invocation (see the Logic-confinement clock note in *Configuration*).
  3. Call `ActorIdentity.attest(proposal_ref, grantor_ref, grantor_credential)`. Outcomes:
     - `attestation_id` → proceed to step 4.
     - `rejected(invalid-credential)` → return `rejected(invalid-credential)`. No grant recorded.
     - `rejected(invalid-request)` → return `rejected(invalid-request)`. No grant recorded. (This code from `ActorIdentity.attest` indicates the composition-assembled `proposal_ref` violated Actor Identity's request format — a configuration error in `grant_proposal_format`, not a caller-input error. The composition surfaces it as `invalid-request` since the effective cause is a malformed proposal reference.)
     - `rejected(storage-failure)` → return `rejected(attribution-storage-failure)`. No grant recorded. (The token names a storage failure of the *attestation* write — the attribution's first half; failures of the pairing write itself surface as `orphan-attestation`, the naming split being fail-before-grant vs fail-after-grant.)
  4. Call `Permissions.grant(subject_ref, action_scope)`. Outcomes:
     - `grant_id` → proceed to step 5.
     - `rejected(invalid-request)` → an orphan attestation now exists in Actor Identity with no corresponding grant. Return `rejected(orphan-attestation)` after logging the orphan for the composing system's orphan-resolution process (see *Edge cases*). The composition does not delete the attestation — Actor Identity's Invariant 9 (*Attestation durability*) forbids it.
     - `rejected(storage-failure)` → same orphan handling as `invalid-request` above. Return `rejected(orphan-attestation)` after logging. The underlying cause (storage failure vs. invalid request) is recorded in the orphan log; the composition's external signal is always [Orphan Attestation] when a grant-side failure leaves an unmatched attestation.
  5. Write the pairing: `grant_attribution[grant_id] = attestation_id`. This write must be durable before the action returns; if it fails, the composition returns `rejected(orphan-attestation)` and logs the orphan. Under the mandated transactional discipline (Invariant 1's condition: same transactional boundary or write-ahead-log), the Permissions write is then absent-or-invisible too, and the orphan is the attestation alone; only an implementation that lets the Permissions write commit independently leaves a grant in Permissions that cannot be attributed without the pairing record — see *Edge cases* for the implementation requirement.
  6. Return `(grant_id, attestation_id)` to the caller.

- **`revoke_grant(grant_id, revoker_ref, revoker_credential) → (ok, attestation_id) | rejected(invalid-request | invalid-credential | not-known | not-active | attribution-storage-failure | orphan-attestation)`**

  **Orphan side-effect note.** All rejection codes from step 4 onward — including `not-known` and `not-active` — produce an orphan attestation in the Actor Identity store. `orphan-attestation` is the explicit signal for composition-failure orphans (storage failures). `not-known` and `not-active` are caller-error codes: they surface the Permissions rejection directly and do not return `orphan-attestation`, because the error is caller-caused rather than composition-caused. However, an orphan attestation is created in both cases and is logged internally. Callers who implement retry logic against `not-known` or `not-active` should be aware that each failed attempt leaves an orphan attestation in Actor Identity. The orphan log and Generation acceptance check 5 are the recovery and audit surfaces.

  1. Validate inputs per *Primitive policies*. If any input fails, return `rejected(invalid-request)`.
  2. Construct the revocation proposal reference: `{grant_id, requested_at}` serialized canonically. `requested_at` is the seam-injected clock reading for this invocation (see the Logic-confinement clock note in *Configuration*).
  3. Call `ActorIdentity.attest(revocation_proposal_ref, revoker_ref, revoker_credential)`. Outcomes:
     - `attestation_id` → proceed to step 4.
     - `rejected(invalid-credential)` → return `rejected(invalid-credential)`. No revocation recorded.
     - `rejected(invalid-request)` → return `rejected(invalid-request)`. No revocation recorded. (The `revocation_proposal_format` is fixed, and Actor Identity declares no structural validation of actor references beyond non-null/non-empty — the atom does not know what a valid actor looks like — so an `invalid-request` response at this step indicates a composition implementation error in the fixed serialization or a request-shape violation, not a deeper reference check the constituent does not perform.)
     - `rejected(storage-failure)` → return `rejected(attribution-storage-failure)`. No revocation recorded.
  4. Call `Permissions.revoke(grant_id)`. Outcomes:
     - `ok` → proceed to step 5.
     - `rejected(not-known)` → orphan attestation exists; return `rejected(not-known)` after logging the orphan. (The caller passed a `grant_id` that does not exist; the attestation now exists but binds the revoker to a non-existent grant. This is correctly classified as caller error; the orphan attestation stands as evidence of the attempt.)
     - `rejected(not-active)` → orphan; return `rejected(not-active)` after logging. (The grant exists but is already revoked. The new attestation binds the revoker to an already-terminal action; the original revocation attestation is the authoritative one.)
     - `rejected(storage-failure)` → orphan; return `rejected(orphan-attestation)` after logging. (Same unification as [Issue Grant] step 4: the composition's external signal for any revocation-side failure that leaves an unmatched attestation is `orphan-attestation`; the underlying cause is in the orphan log.)
  5. Write the pairing: `revocation_attribution[grant_id] = attestation_id`. Same durability requirement as [Issue Grant] step 5; failure produces `rejected(orphan-attestation)` after logging.
  6. Return `(ok, attestation_id)` to the caller.

- **`verify_grant_attribution(grant_id) → (grant_record, issuance_attestation_id, issuance_verify_result, revocation_attestation_id?, revocation_verify_result?) | not-known | attribution-inconsistency`**

  `grant_record` shape: `{grant_id, subject_ref, action_scope, status, granted_at, revoked_at?}` — the Permissions store's full record for the grant. `status` is one of `Active` or `Revoked`. `revoked_at` is present only when `status = Revoked`.

  [Attribution Inconsistency] is a distinct result tag from `not-known`. `not-known` means the grant does not exist in Permissions. `attribution-inconsistency` means the grant exists in Permissions but the corresponding attribution map entry is unpopulated — either a violation of Invariant 1 (*Attribution completeness*) at step 2a (grant exists, no `grant_attribution` entry), or a violation of Invariant 2 (*Revocation attribution*) at step 4a (grant is Revoked, no `revocation_attribution` entry). Both cases indicate a pairing-write failure under their respective invariants' conditional-durability requirement. These are structurally different from a normal lookup miss and require different caller responses: `not-known` is a normal miss; `attribution-inconsistency` is a forensic finding under the *Caller contract* below.

  1. Look up the grant in Permissions. If not present, return `not-known`.
  2. Look up `grant_attribution[grant_id]` → `issuance_attestation_id`. (Invariant 1 — *Attribution completeness* — guarantees this lookup succeeds under normal operation for every grant in the store.)
  2a. If `grant_attribution[grant_id]` is unpopulated despite the grant existing in step 1: return `attribution-inconsistency`. Invariant 1 is conditional on pairing-write durability; if the pairing write failed after the Permissions write succeeded (Cross-store consistency edge case), this state is reachable. The caller must treat `attribution-inconsistency` as a forensic finding and log the inconsistency — the grant exists without an attribution record. This state must not be silently coerced to `not-known`.
  3. Call `ActorIdentity.verify(issuance_attestation_id)` → `issuance_verify_result` (one of `verified`, `failed-verification(reason)`, `not-known`). A result of `not-known` from `ActorIdentity.verify` here is a tamper signal: Invariant 6 (*Pairing-map durability*) and Actor Identity's Invariant 9 (*Attestation durability*) together guarantee this `attestation_id` should exist; if Actor Identity does not recognize it, the attestation record has been deleted or the `grant_attribution` map has been rewritten — both prohibited by the respective invariants. The caller must treat `not-known` at this step as a forensic finding, not a normal lookup miss.
  4. If the grant is Revoked, look up `revocation_attribution[grant_id]` → `revocation_attestation_id`. (Invariant 2 — *Revocation attribution* — guarantees this lookup succeeds under normal operation for every Revoked grant.)
  4a. If `revocation_attribution[grant_id]` is unpopulated despite the grant being Revoked in step 1: return `attribution-inconsistency`. Invariant 2 is conditional on pairing-write durability; if the pairing write failed after `Permissions.revoke` succeeded (Cross-store consistency edge case), this state is reachable. The caller must treat `attribution-inconsistency` as a forensic finding and log the inconsistency — the grant is Revoked without a revocation attestation record. This state must not be silently coerced to `not-known` or to a "no revocation attestation" case. Same caller contract as step 2a — see *Caller contract* below.
  5. Call `ActorIdentity.verify(revocation_attestation_id)` → `revocation_verify_result`. Same tamper interpretation applies if `ActorIdentity.verify` returns `not-known`: per Invariant 6 (*Pairing-map durability*) and Actor Identity's Invariant 9 (*Attestation durability*), the attestation should exist; `not-known` here is a tamper signal, not a normal lookup miss.
  6. Return the tuple. The caller (typically an auditor or the administration UI) inspects each verify result to determine whether the attribution stands or has been compromised.

  **Caller contract — forensic-finding result codes.** Three of [Verify Grant Attribution]'s outcomes are *forensic findings*, not routine lookup results, and require distinct caller handling. The composition surfaces them with explicit names so the caller cannot conflate them with normal lookup outcomes:

    - `attribution-inconsistency` (returned from step 2a or step 4a). The grant exists in Permissions, but the corresponding attribution map entry is unpopulated — a violation of Invariant 1 (step 2a) or Invariant 2 (step 4a) under their respective pairing-write-durability conditionals. The caller MUST log the inconsistency naming which invariant was violated and which `grant_id` is affected; MUST NOT retry the original administrative action against the same `grant_id` as a normal retry (the original grant or revocation has already committed in Permissions; a retry would create a duplicate administrative event without resolving the attribution gap); MUST NOT coerce the result to `not-known` (which is a distinct condition — the grant does not exist); MUST surface the finding to the forensic / orphan-resolution process (e.g., the Failed-Grant Reconciliation pattern named in *Edge cases*).

    - `not-known` from `ActorIdentity.verify` at step 3 (issuance attestation) or step 5 (revocation attestation). The attribution map points at an `attestation_id` that Actor Identity does not recognize — a violation of Invariant 6 (*Pairing-map durability*) together with Actor Identity's Invariant 9 (*Attestation durability*). The caller MUST treat this as a tamper signal, log the finding naming the affected `attestation_id` and `grant_id`, and surface to the forensic process. The caller MUST NOT treat this as equivalent to step 1's `not-known` — the same result word appears at two structurally different positions and the caller's handling logic must distinguish them by step.

    - `failed-verification(reason)` from `ActorIdentity.verify`. Distinct from the above two; the attestation record exists but its proof does not verify. This is a tamper or credential-history finding handled per the *Disputed grant* regulated adversarial scenario and the Compromise Disclosure composing pattern. Not a routine outcome.

  `not-known` returned from step 1 (grant not found in Permissions) is the only [Verify Grant Attribution] outcome the caller may handle as a normal lookup miss.

- **`permitted(subject_ref, action_scope) → permitted | denied`** — passes through directly to `Permissions.permitted(subject_ref, action_scope)` unchanged. The composition does not interpose on evaluation, only on administration. Its contract is about *how grants are created and revoked*, not about *how access is evaluated at request time*. **One asymmetry is named rather than hidden:** administration inputs are whitespace-trimmed at this composition's boundary (Primitive policies), but the evaluation passthrough is untrimmed by design — so an evaluation query whose `subject_ref` or `action_scope` differs from the trimmed, stored form only by surrounding whitespace evaluates `denied` under Permissions' exact-match semantics. Callers of `permitted` normalize as the administration surface does, or accept the exact-match miss; the composition does not silently trim a query it merely relays.

### The load-bearing wiring decision — attest-before-record

The composition's central architectural decision: every state-changing administrative action attests *before* recording the corresponding state change in Permissions. The order is fixed; the reverse order would let an attacker (or a buggy implementation) record a grant in Permissions without an attestation and have the composition fail to detect it after the fact.

**Principle.** No grant exists in the Permissions store without its attestation in Actor Identity. The attestation is a prerequisite, not a complement.

**Likely objection.** "Why not record both as one transaction? Attesting first creates an orphan-attestation risk if the Permissions write fails."

**Mechanism that resolves it.** A single transactional boundary across two atoms requires either (a) the atoms to share a database backend (which neither atom requires or specifies — both are vocabulary-neutral about storage) or (b) a distributed-transaction protocol at the composition layer (which is out of scope for the simplest two-atom composition). The attest-first ordering is the correct sequential approach because Actor Identity's records are by construction immutable and verifiable independently — an orphan attestation is a *recoverable* anomaly (the composing system flags it, attempts the corresponding grant on retry, or accepts it as evidence of an attempted-but-failed administrative action). A grant in Permissions with no attestation, by contrast, is *unrecoverable* — the composition has no way to know what credential to attest with after the fact. The asymmetry of the failure modes makes attest-first the correct order.

**Result.** Composition-level Invariant 1 (*Attribution completeness*) holds structurally — *conditionally on the pairing-write durability requirement its own statement carries* (same transactional boundary or write-ahead-log; the Invariants section states the condition and this paragraph does not waive it): any grant the composition records was preceded by a successful attestation. Orphan attestations on the Actor Identity side are an acknowledged operational edge case handled in *Edge cases*, but they do not violate Invariant 1.

The same logic applies to [Revoke Grant]: attest the revocation first, then mutate Permissions. An orphan revocation attestation is recoverable evidence of an attempted revocation; a revoked grant with no revocation attestation would be an unattributed state change.

---

## Composition-level invariants

These invariants emerge from the composition. None belongs to a single constituent atom: most require both atoms working together to hold, and two (Invariants 6 and 8) govern the composition's own emergent state — state neither constituent carries at all.

- **Invariant 1 — Attribution completeness.** For every `grant_id` in the Permissions store, `grant_attribution[grant_id]` is populated with a corresponding `attestation_id` in the Actor Identity store. At the composition's own surface (and only there — a direct store write bypasses both properties, as Intent acknowledges): no surface records a grant without first recording its attestation. This invariant holds conditionally on the implementation satisfying the pairing-write durability requirement stated in *issue_grant* step 5 — the pairing write must be in the same transactional boundary as the Permissions write, or the implementation must use a write-ahead-log discipline that ensures either both succeed or neither is visible as committed. An implementation that permits the Permissions write to commit independently of the pairing write can violate this invariant during a failure window; the failure mode and the implementation requirement are named in *Edge cases* under *Cross-store consistency under failure*. (Established by *issue_grant* steps 3–5 and the attest-before-record wiring decision.)

- **Invariant 2 — Revocation attribution.** For every grant in Revoked state in the Permissions store, `revocation_attribution[grant_id]` is populated with a corresponding `attestation_id` in the Actor Identity store. At the composition's own surface (and only there): no surface revokes a grant without first recording the revoker's attestation. This invariant holds conditionally on the implementation satisfying the pairing-write durability requirement stated in *revoke_grant* step 5 — the pairing write must be in the same transactional boundary as the `Permissions.revoke` write, or the implementation must use a write-ahead-log discipline that ensures either both succeed or neither is visible as committed. An implementation that permits the `Permissions.revoke` write to commit independently of the pairing write can violate this invariant during a failure window; the failure mode mirrors Invariant 1's, named in *Edge cases* under *Cross-store consistency under failure*. [Verify Grant Attribution] step 4a returns `attribution-inconsistency` when this conditional fails. (Established by *revoke_grant* steps 3–5 and the attest-before-record wiring decision.)

- **Invariant 3 — Attribution recoverability.** Given any `grant_id` known to Permissions, the composition's records yield, without recourse to logs or developer narration: the grant's full state (per Permissions' invariants), the issuance attestation (per Invariant 1), the issuance attestation's verify result, and — if the grant is Revoked — the revocation attestation and its verify result. [Verify Grant Attribution] is the canonical query.

- **Invariant 4 — Attribution-time monotonicity.** For every grant, `attestation.attested_at ≤ grant.granted_at`. The attestation precedes (or equals) the grant in wall-time because the attestation is recorded before the grant is recorded. Equivalent for revocations, where the revocation attestation exists (in the Invariant-2 conditional-failure window there is a revoked grant with no paired attestation, and this clause is then vacuous rather than violated): `revocation_attestation.attested_at ≤ grant.revoked_at`. This invariant is best-effort under two conditions: (1) non-monotonic clocks per node — it holds under a monotonic clock and may be violated by NTP (Network Time Protocol) adjustments (the same clock-semantics caveat that applies to Permissions' Invariant 9 and Actor Identity's `attested_at`); (2) cross-system clock skew — `attested_at` is written by the Actor Identity store's clock and `granted_at` / `revoked_at` is written by the Permissions store's clock; if the two stores run on nodes with unsynchronized clocks, the inequality can be violated even when each node's clock is monotonic. Deployments where Actor Identity and Permissions share a single clock source are protected against (2); deployments with separate clock sources should treat this invariant as a clock-alignment signal rather than a strong audit guarantee. Composing with Trusted Timestamping (RFC 3161) supplies an adversarially-defensible time anchor that addresses both conditions.

- **Invariant 5 — Constituent invariants preserved.** All invariants of the Permissions atom hold over the Permissions instance. All invariants of the Actor Identity atom hold over the Actor Identity instance. The composition never bypasses preconditions; constituent rejections flow through unchanged (or are wrapped with composition-layer names like [Attribution Storage Failure] to distinguish their origin).

- **Invariant 6 — Pairing-map durability.** Once an entry is written to `grant_attribution` or `revocation_attribution` by the composition, it is never modified or deleted by the composition. The composition exposes no surface to update or remove either map; the only writes are the initial pairing writes in *issue_grant* step 5 and *revoke_grant* step 5. This is the composition-level analog of Actor Identity's Invariant 9 (*Attestation durability*) and Permissions' Invariant 10 applied to the composition's own emergent state. An adversary with direct write access to the composition's storage can rewrite the maps — the tamper surface named in *Edge cases* under *Tamper-evidence over the composition's emergent state*; composing with Tamper Evidence over the composition's emergent state addresses that surface.

- **Invariant 7 — Attestation exclusivity.** Every attestation record referenced by the composition's attribution maps is used exactly once and for exactly one purpose. Formally: `grant_attribution` is injective — no two grants share an issuance attestation; `revocation_attribution` is injective — no two grants share a revocation attestation; and the ranges of the two maps are disjoint — no attestation record serves as both issuance proof and revocation proof for any combination of grants. This invariant is enforced structurally by two mechanisms with distinct jobs: **injectivity** follows from Actor Identity's per-call attestation-identity freshness plus the one-attestation-write-per-call wiring (the constituent mints a distinct attestation id for every `attest` call, even for byte-identical proposal references), while the grant proposal's unique nonce buys **proposal-content distinctness** (two grant attempts for the same pair produce distinguishable proposal bodies for the audit), and the revocation proposal format `{grant_id, requested_at}` is structurally distinct from the grant proposal format by construction. (Surfaced by formal modeling — Alloy, a formal modeling language for checking structural and temporal properties of a design: the prose review had argued the nonce mechanism in Configuration as sufficient, and the model revealed that a mechanism argument does not substitute for a named invariant.)

- **Invariant 8 — Orphan log durability.** Once an entry is written to the orphan log by the composition, it is never modified or deleted by the composition. The composition exposes no surface to update or remove orphan log entries; the only writes are in *issue_grant* step 4, *issue_grant* step 5, *revoke_grant* step 4, and *revoke_grant* step 5. This is the composition-level analog of Invariant 6 (*Pairing-map durability*) applied to the orphan log surface — same append-only discipline, same evidence-preservation purpose, same prohibition on the composition's own surface mutating recorded entries. An adversary with direct write access to the composition's storage can rewrite the orphan log — the same tamper surface named in *Edge cases* under *Tamper-evidence over the composition's emergent state*; composing with Tamper Evidence over the orphan log addresses that surface. As with the attribution maps under Invariant 6, an externally-coordinated Retention Window purge may remove entries when its scope explicitly includes the orphan log; the *Retention of attribution records* edge case names that requirement. (Surfaced by Round 3; the append-only behavior was stated in Composition state prose but never promoted to a named, checkable invariant. Generation acceptance check 5's structural orphan detection is independent of the orphan log being populated or retained, but the log's append-only durability is the operational-retry surface's contract and warrants the same named-invariant status the attribution maps carry.)

Attribution completeness and attribution recoverability together give the *attributable-by-construction* property — the regulator's question *"who authorized this grant?"* has a structural answer for every grant in the store, not a procedural one. Attribution-time monotonicity gives the *audit-timeline-coherent* property: the records cannot describe a grant that was issued before its grantor attested to it.

---

## Examples

### Walkthrough

A healthcare organization administers HIPAA-regulated access to ward-level patient records. A grant administrator issues a new grant for Dr. Chen.

1. **The administrator (admin_a7) submits an issuance request.** Subject: `dr_chen`. Scope: `records:ward-7-patients`. Grantor: `admin_a7`. Credential: admin_a7's smart-card-bound credential, presented at the admin UI. Composition call: `issue_grant(dr_chen, records:ward-7-patients, admin_a7, admin_a7_credential)`.
2. **The composition validates inputs.** All fields non-empty and within length caps. Whitespace-normalized. Proceeds to step 3.
3. **The composition constructs the proposal reference.** `proposal_ref = {dr_chen, records:ward-7-patients, nonce_n91a, 2026-05-18T14:32:11Z}`, serialized canonically.
4. **The composition calls `ActorIdentity.attest(proposal_ref, admin_a7, admin_a7_credential)`.** The smart-card-bound credential validates; the attestation is recorded with `attestation_id = att_q88r`. Returned to the composition.
5. **The composition calls `Permissions.grant(dr_chen, records:ward-7-patients)`.** The grant is recorded with `grant_id = grt_p44c`. Returned to the composition.
6. **The composition writes `grant_attribution[grt_p44c] = att_q88r`.** The pairing is durable.
7. **Return `(grt_p44c, att_q88r)` to the caller.** The administrator's UI displays "Grant issued — id grt_p44c, attestation att_q88r."

Six months later, an internal compliance officer audits the ward-7 grants.

8. **Audit query: `verify_grant_attribution(grt_p44c)`.** The composition retrieves the grant from Permissions: subject `dr_chen`, scope `records:ward-7-patients`, status Active, `granted_at 2026-05-18T14:32:12Z`. It retrieves `grant_attribution[grt_p44c] = att_q88r`. It calls `ActorIdentity.verify(att_q88r) → verified`. Returns the full tuple: the grant record, `att_q88r`, `verified`, no revocation.
9. **The compliance officer concludes structurally:** admin_a7 issued the grant on 2026-05-18, the attestation verifies under admin_a7's currently-published key, and Dr. Chen has held the grant continuously since. The audit answer is the records' answer; no developer testimony is consulted.

Later, Dr. Chen rotates to a different ward. Another administrator (admin_a8) revokes the grant.

10. **Revocation request: `revoke_grant(grt_p44c, admin_a8, admin_a8_credential)`.** Validation passes. Revocation proposal `{grt_p44c, 2026-08-01T09:15:00Z}` is constructed.
11. **`ActorIdentity.attest(...) → att_r53s`.** admin_a8's credential validates.
12. **`Permissions.revoke(grt_p44c) → ok`.** The grant moves Active → Revoked with `revoked_at`.
13. **`revocation_attribution[grt_p44c] = att_r53s`** is written durably.
14. **Return `(ok, att_r53s)`.** The administrator's UI displays "Grant revoked — attestation att_r53s."

At year-end audit, `verify_grant_attribution(grt_p44c)` returns the full tuple including both attestations: admin_a7 issued; admin_a8 revoked. Both verify. The four-question audit answer (who, what, when, by whose authority) is complete from the records.

### Rejection-path examples

**`invalid-credential` on [Issue Grant].** An administrator's smart card has expired. Call: `issue_grant(contractor_c12, source:production:read, admin_a7, a7_expired_credential)`. Step 1 validates inputs — all well-formed. Step 2 constructs `proposal_ref = {contractor_c12, source:production:read, nonce_x04b, 2026-05-18T16:00:00Z}`. Step 3 calls `ActorIdentity.attest(proposal_ref, admin_a7, a7_expired_credential)` → `rejected(invalid-credential)` (the smart-card validation service rejects the expired token). The composition immediately returns `rejected(invalid-credential)` to the caller. No grant recorded. No orphan attestation — the `attest` call was rejected before any record was written in Actor Identity.

**`not-active` on [Revoke Grant] (double-revocation attempt).** A previous revocation of grant `grt_p44c` succeeded (attestation `att_r53s` was recorded in a prior call). A second revocation attempt arrives — perhaps a UI retry after a network timeout that did not actually fail server-side. Call: `revoke_grant(grt_p44c, admin_a8, admin_a8_credential)`. Step 1 validates inputs. Step 2 constructs `revocation_proposal_ref = {grt_p44c, 2026-08-01T09:15:42Z}`. Step 3 calls `ActorIdentity.attest(...)` → `att_r99z` (the attestation is recorded — Actor Identity does not know the grant is already revoked). Step 4 calls `Permissions.revoke(grt_p44c)` → `rejected(not-active)` (Permissions sees the grant is already Revoked). An orphan attestation `att_r99z` now exists; the composition logs the orphan (with the underlying `not-active` reason) and returns `rejected(not-active)` to the caller. The original revocation attestation `att_r53s` is unaffected; `att_r99z` is recoverable evidence of the attempted double-revocation.

**`orphan-attestation` on [Issue Grant] (grant-side storage failure).** A write-heavy deployment experiences intermittent storage pressure. Call: `issue_grant(dr_chen, records:ward-8-patients, admin_a7, admin_a7_credential)`. Step 3 calls `ActorIdentity.attest(...)` → `att_q77t` (attestation recorded successfully). Step 4 calls `Permissions.grant(dr_chen, records:ward-8-patients)` → `rejected(storage-failure)` (the Permissions store returns a transient error). An orphan attestation `att_q77t` now exists in Actor Identity with no corresponding grant in Permissions. The composition logs the orphan (attestation id, proposal ref, timestamp, underlying reason `grant-storage-failure`) and returns `rejected(orphan-attestation)` to the caller. The caller's appropriate response: retry [Issue Grant] (which will produce a new nonce and a new `proposal_ref`, and therefore a new attestation on retry — the prior orphan attestation `att_q77t` remains in Actor Identity as evidence of the failed attempt). The Failed-Grant Reconciliation pattern described in *Edge cases* is responsible for periodically confirming that `att_q77t` remains an orphan or flagging it for manual review.

### Banking — SOX-scoped wire-transfer authorization grants

A bank's controls require that the ability to approve high-value wires (>$25,000) be granted by a named manager and that the grant itself carry the manager's verifiable approval. `issue_grant(supervisor_s4, approve:transfer, ops_manager_m9, m9_credential) → (grt_b1, att_b1)`. Six months later a SOX §404 internal-control review queries the grant store: every active `approve:transfer` grant must be linked to a verified attestation under a current operations manager's credential. The composition's audit query produces the structural answer; no audit-tool integration is needed to cross-reference grant records against an external approval log.

### Healthcare — HIPAA minimum-necessary access grants with named granter

A hospital's HIPAA compliance program requires that every patient-record access grant be attributable to the privacy officer or their delegate who issued it. `issue_grant(dr_chen, records:ward-7-patients, privacy_officer_p2, p2_credential) → (grt_h1, att_h1)`. When OCR (HHS Office for Civil Rights) audits the hospital after an unrelated breach, the audit team enumerates active grants on PHI (Protected Health Information) scopes and verifies each grant's attestation. Any grant whose attestation fails to verify (because the named granter's credential was rotated and the registry no longer recognizes the original key) is flagged for re-attestation or revocation; the failure is a finding, but a finding the records surface structurally rather than one that hides until the next audit.

### Payments — PCI DSS Requirement 7 attributed authorization

PCI DSS Requirement 7 mandates restricted access to cardholder data with formal access authorization documented in records. `issue_grant(analyst_a6, cardholder-data:read, security_lead_l3, l3_credential) → (grt_p1, att_p1)`. A QSA's (Qualified Security Assessor — the PCI-certified auditor role) annual assessment walks the cardholder-data grants. For each: who is the subject, what scope, who authorized it, can the authorization be cryptographically verified? The composition's [Verify Grant Attribution] is the structural answer to all four questions per grant.

### Legal — matter-staffing grants with partner attribution

A law firm's matter-management system grants associates access to documents in matters they are staffed on. The firm's professional-responsibility rules require that staffing decisions be attributable to the responsible partner. `issue_grant(associate_j, documents:matter-2024-91, partner_k, partner_k_credential) → (grt_l1, att_l1)`. When opposing counsel's discovery request asks the firm to demonstrate matter-team composition over time, the firm produces the grant records with verified partner attestations — a structurally defensible answer to the question of who decided who had access.

### Source control — FDA-regulated branch-protection grants

An FDA-cleared medical-device team restricts merge access to the release branch and requires every grant to be issued by the release engineer's manager. `issue_grant(release_engineer_r, branch:release:merge, eng_director_d, d_credential) → (grt_s1, att_s1)`. During an FDA 21 CFR Part 11 software-validation audit, the auditor queries the grant store and verifies every active release-branch grant's attestation. Grants whose attestations verify under the current director's credential satisfy the regulatory bar; grants whose attestations fail to verify (because the original director left the company and their credential is no longer registered) are surfaced for re-attestation under the new director.

The mechanic is identical across all five. What differs: the scope vocabulary, the regulatory regime (SOX, HIPAA, PCI DSS, professional responsibility, 21 CFR Part 11), the credential mechanism (smart card, hardware token, qualified electronic signature), and the composing patterns active around it (Audit Trail composition for the grant-issuance event log, Retention Window for grant-record lifetime, Tamper Evidence over the grant store, RBAC for role-based grant batching).

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

- **Regulator audit — "show me every active grant and prove who authorized each one."** A regulator (HIPAA's enforcing office — HHS OCR, the US Department of Health and Human Services Office for Civil Rights; a SOX auditor; a PCI QSA; an FDA inspector) queries the composition: for each Active grant in the Permissions store, produce the grantor's verified attestation. The composition's [Verify Grant Attribution] returns the tuple for each grant. Invariants 1 and 3 are the structural answer: every grant in the store has a paired attestation (Invariant 1); the pairing is recoverable from the records alone (Invariant 3). Grants whose attestations fail to verify are themselves structurally observable — the audit query distinguishes `verified` from `failed-verification(...)` from `not-known` and the regulator sees the distribution directly. There is no developer testimony in the loop.

- **Disputed grant — "I never authorized this grant."** A named grantor claims they did not issue a specific grant. The investigator calls `verify_grant_attribution(grant_id)`. If `issuance_verify_result = verified`, the proof binds the named grantor to the grant proposal at `attested_at` (Actor Identity's Invariant 8 — non-repudiation contract). The grantor cannot plausibly deny it without claiming credential compromise — which is then an out-of-band investigation governed by a Compromise Disclosure composing pattern. If `failed-verification(...)`, the dispute is upheld and the grant's status is reconsidered (revocation is the typical follow-on action, itself recorded as an attributed administrative action).

- **Breach forensics — "the grant store may have been tampered with."** A security incident suggests an attacker may have inserted unauthorized grants directly into the Permissions store, bypassing the composition. The investigator enumerates all grants in the Permissions store and, for each, calls [Verify Grant Attribution]. Any grant for which `grant_attribution[grant_id]` is unpopulated, or for which the paired attestation verifies as `not-known` (the attestation id was never recorded), or for which the attestation verifies as `failed-verification(proof-invalid)` (the attestation exists but the proof does not bind the named grantor) is flagged as a structurally illegitimate grant — with one benign cause distinguishable before escalation: a legitimate grant caught in the pairing-write failure window presents the same unpopulated-map signature, and the orphan log's corresponding entry (same proposal reference, `pairing-write-failure` reason) is what separates it from an adversarial insertion. The investigation's forensic boundary is exactly the population of grants whose attestations fail and lack that benign explanation; everything inside the boundary is structurally defensible. Composing with Tamper Evidence over the Permissions store and the Actor Identity store turns the breach scope into a verifiable cryptographic claim rather than an investigator's assertion.

---

## Generation acceptance

A derived implementation of Attributed Permissions Admin is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the two constituent stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

Checks the composition's records alone answer:

1. **For every grant in the Permissions store, produce the issuance attestation and its verify result.** From `grant_id`: look up `grant_attribution[grant_id]` (Invariant 1 guarantees the lookup succeeds); call `ActorIdentity.verify(attestation_id)`; report the result. The composition exposes [Verify Grant Attribution] as the canonical query. Composition-level Invariant 1 and Invariant 3 are the structural answer.

2. **For every Revoked grant, produce the revocation attestation and its verify result.** Same as above, against `revocation_attribution[grant_id]`. Composition-level Invariant 2.

3. **Verify the attribution-time monotonicity contract for every grant.** For each grant, check `attestation.attested_at ≤ grant.granted_at`. Composition-level Invariant 4. Under non-monotonic clocks or cross-system clock skew the contract is best-effort; the auditor sees the inequality directly and can flag exceptions.

4. **Verify each constituent atom's Generation acceptance bar over its own instance.** Permissions' Generation acceptance (enumerate every grant with full history, reconstruct authorization state at any past point in time, confirm denial by absence, confirm revocation is terminal and immediate, identify active composing patterns). Actor Identity's Generation acceptance (enumerate every attestation, verify every attestation against the actor registry, distinguish `verified` from `failed-verification` from `not-known` outcomes).

5. **Identify orphan attestations.** Using the deployment's configured namespace prefix (required by `grant_proposal_format` and the fixed `revocation_proposal_format` — see *Configuration*), enumerate all attestations in the Actor Identity store whose `action_ref` begins with that prefix. This set is the complete population of composition-issued attestations (both grant proposals and revocation proposals share the namespace). Cross-reference each `attestation_id` against `grant_attribution` and `revocation_attribution`: any attestation whose id is absent from both maps is an orphan — a structurally observable failed-issuance-or-revocation. Each orphan is evidence of an attempted action that did not complete; the audit either accepts it as benign (retried and succeeded, or abandoned) or queries the failed-grant-reconciliation pattern that handles them. The audit's ability to enumerate orphans completely — and to bound the orphan population rather than merely sample it — depends directly on the namespace prefix being present and consistent in both proposal formats. A deployment that omits the namespace prefix from either proposal format cannot satisfy this check from the records alone; `action_ref` values become indistinguishable from attestations issued by other composing systems and the orphan population cannot be bounded. The audit's distinction between "orphan attestation we can see" and "missing attestation we can't see" is the composition's contribution to forensic completability; the namespace prefix is the structural requirement that makes the distinction possible. Note: the orphan log in Composition state is the composition's operational retry surface; the audit's orphan detection described here is independent — it operates structurally against Actor Identity and the two maps, and does not require the orphan log to be populated or retained.

6. **Verify attestation exclusivity (Invariant 7).** Enumerate `grant_attribution` and `revocation_attribution`. Confirm no `attestation_id` appears more than once in `grant_attribution` (injectivity of issuance map). Confirm no `attestation_id` appears more than once in `revocation_attribution` (injectivity of revocation map). Confirm the two sets of `attestation_id` values are disjoint — no attestation appears in both maps. Any violation is a structural breach of Invariant 7 — Attestation Exclusivity — surfacing either a nonce-uniqueness failure (two grant proposals produced the same `proposal_ref`), a fixed-format collision (a revocation proposal somehow matched a grant proposal), or adversarial reuse of an attestation across roles. Composition-level Invariant 7.

### Externally-clearable checks

Questions that arise around the composition but require external evidence to answer:

- **Was the grantor *authorized* to issue this grant per organizational policy?** The composition records *that* the named grantor attested; it does not record *whether* organizational policy permits that grantor to issue this scope. A Delegation composing pattern (forthcoming) or an external policy registry supplies the answer.

- **Has the grantor's credential been compromised since `attested_at`?** Actor Identity's non-repudiation contract is conditional on credential integrity; reinterpretation under compromise belongs to a Compromise Disclosure composing pattern. The composition's records do not invalidate themselves under credential compromise — invariants 1 and 5 are immutable — but the meaning of `verified` results may shift under external disclosure.

- **Does the composition's emergent state itself preserve tamper-evidence?** `grant_attribution` and `revocation_attribution` are deployment-owned maps; without composing with Tamper Evidence over them, the auditor must trust the implementation's storage discipline. Composing with Tamper Evidence elevates the trust to a verifiable cryptographic claim.

- **Was the grant's scope vocabulary recognized by the system at the time of grant?** The composition treats `action_scope` as opaque; whether a given scope was a valid scope per the deployment's policy belongs to a Scope Registry composing pattern.

This is the generator's contract: any code generated from this composition must produce records and a runtime surface that pass the *Audit-Trail-traversal-clearable* checks above. The *Externally-clearable* checks document the boundary of what the composition itself can prove; they are not the composition's own contract to satisfy but they are part of an honest answer to the regulator when the composition's evidence ends.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Grantor authorization (separation-of-duties).** Whether `grantor_ref` is *permitted* to issue a grant for the given `action_scope` belongs to a higher-layer policy: a Delegation composing pattern (which checks that the grantor holds a meta-grant covering "grant for scope X"), an RBAC layer (which checks that the grantor holds an "admin" role for the scope's domain), or organizational policy reviewed externally. This composition records the grantor's attestation; it does not validate the grantor's authority to grant. *Externally-clearable* in the *Generation acceptance* split below.

- **Role management.** Mapping a role name to a set of `(subject, scope)` grants — and revoking the set when the role is rescinded — belongs to a RBAC composing pattern that calls this composition once per grant. The bare composition handles individual grants; bulk role operations are the composing layer's responsibility.

- **Mass revocation on grantor deprovisioning.** When an administrator leaves the organization, every grant they issued remains valid (the attestation stands as a permanent record of the historical authorization). What may need re-attestation is a separate organizational decision: do the grants the departing administrator issued still represent the organization's intent? This composition records the historical attribution; the decision to re-attest or revoke belongs to organizational policy.

- **Orphan attestation handling.** If `Permissions.grant` fails after `ActorIdentity.attest` succeeds, an orphan attestation exists in the Actor Identity store with no corresponding grant. The composition acknowledges the orphan, returns a composition-layer rejection naming it, and logs the orphan for the composing system's orphan-resolution process. The composition does *not* delete the orphan — Actor Identity's Invariant 9 (*Attestation durability*) forbids it. High-assurance deployments should compose with a Failed-Grant Reconciliation pattern that periodically enumerates Actor Identity attestations under composition-issued proposal references and confirms each has a corresponding `grant_attribution` entry; orphans are flagged for manual review or retry.

- **Cross-store consistency under failure.** If `Permissions.grant` succeeds but writing `grant_attribution[grant_id] = attestation_id` fails (durability failure), the composition has a grant in the store with no recorded pairing — the worst case for Invariant 1. The symmetric case exists for revocation: if `Permissions.revoke` succeeds but writing `revocation_attribution[grant_id] = attestation_id` fails, the composition has a Revoked grant with no recorded revocation pairing — the worst case for Invariant 2. The composition's contract for both cases: the pairing write must be in the same transactional boundary as the corresponding Permissions write, or the implementation must use a write-ahead-log discipline that ensures either both writes succeed or both are absent. The bare composition spec names the requirement; the implementation owns the mechanism. [Verify Grant Attribution] step 2a returns `attribution-inconsistency` for the Invariant 1 failure window; step 4a returns the same code for the Invariant 2 failure window — both surfaced as forensic findings under the *Caller contract* paragraph in Action wiring, not as normal lookup misses. A Cross-Store Coordination composing pattern (the same one Audit Trail names) handles the general case.

- **Concurrent issuance of the same grant.** Two simultaneous `issue_grant(subject_ref, action_scope, ...)` calls for the same `(subject_ref, action_scope)` pair from different grantors produce two distinct attestations and two distinct grants — Permissions' Edge case *Concurrent grant proliferation* allows this. The composition does not prevent it; whether the duplicate is intentional (a second grantor confirming) or accidental (a UI double-click before the first request returned) is handled at the composing layer. Deployments that need single-issuance semantics should compose with Idempotent Reservation or wrap [Issue Grant] with a token-based deduplication layer.

- **Credential rotation between issuance and revocation.** A grantor who issues a grant under credential C1 may later revoke under rotated credential C2. The composition records two separate attestations; the historical attribution facts are stable, but **verification uses the registry's current public material** (Actor Identity's own `verify` behavior — it consults the registry's current view, not a historical snapshot), so after rotation the issuance attestation signed under the original credential verifies only if the registry retains that credential's material. The attribution record remains; the verification result depends on the registry's handling of credential history. Composing with an Actor Registry that maintains historical credential material is required for full historical verification.

- **Clock semantics for proposal references.** The `requested_at` field in both `grant_proposal_format` and `revocation_proposal_format` is the clock reading injected at the composition's I/O seam for that invocation (Logic Confinement — the host reads the clock once and injects it; no transition samples a clock of its own). This field is informational within the proposal — the nonce ensures proposal uniqueness regardless of whether two proposals share the same `requested_at`. If the wall-time clock is adjusted backward (NTP correction), `requested_at` may be earlier than the previous call's `requested_at`; this does not affect uniqueness but will appear as a timestamp discontinuity in audit records. If the clock is significantly ahead of the constituent stores' clocks, Invariant 4 (*Attribution-time monotonicity*) may appear violated (`attested_at < granted_at` may not hold) even for legitimate proposals — see Invariant 4's cross-system clock skew condition and the clock note in *Configuration*. Implementations should record the wall-time clock source alongside the composition's emergent state to enable post-hoc disambiguation of clock anomalies.

- **Tamper-evidence over the composition's emergent state.** `grant_attribution` and `revocation_attribution` are emergent maps; if an adversary with write access can rewrite them, they can re-pair grants to different attestations and forge attribution. Cryptographic hash chains, Merkle-tree commitment, or external anchoring over the emergent state belong to a Tamper Evidence composing pattern applied to the composition's state — the same composition Audit Trail applies to its emergent state. The bare composition assumes the emergent state has not been adversarially rewritten.

- **Retention of attribution records.** The Permissions store and the Actor Identity store each have their own retention obligations (typically the longer of the two applies to the pair). The composition does not specify a retention policy; composing with Retention Window (or with the Audit Trail composition over the pair of stores) supplies the retention discipline. However, a Retention Window composing pattern that purges records from the Permissions or Actor Identity stores must explicitly scope its purge to include the corresponding entries in `grant_attribution`, `revocation_attribution`, and the orphan log — otherwise, after a Permissions grant is purged, orphaned map entries persist indefinitely (Invariant 6 forbids the composition from deleting map entries on its own; only an externally-scoped retention purge can do so). A purge that removes a grant from Permissions without removing its `grant_attribution` and `revocation_attribution` entries leaves dangling map entries pointing at deleted records; the Composition state lifetime claim ("while a grant exists in the Permissions store, its attribution record exists in the map") cannot be inverted without explicit cross-store coordination in the Retention Window scope. The bare composition names the requirement; the retention composing pattern owns the mechanism.

- **Multi-actor authorization (m-of-n grant issuance).** A grant that requires two or more administrators to attest jointly is a separate composing pattern (Witness / Co-signature, or Multi-Party Approval over a `grant-issuance` action type). This composition records one attestation per grant; multi-actor schemes wrap it with an additional layer that aggregates multiple attestations before invoking [Issue Grant].

- **Grant *modification* (as distinct from revoke-and-re-issue).** Permissions has no `edit` surface — `subject_ref` and `action_scope` are immutable per Invariant 1. To "modify" a grant, the composing system revokes the original and issues a new one. Both administrative actions are attributed under this composition; the audit trail shows the revocation and the new issuance as separate attributed events. The composition does not provide a `modify` shortcut.

- **`permitted` query attribution.** The composition does not attribute `permitted` queries (i.e., it does not record who asked whether a subject was permitted). Whether and how to log access checks belongs to an Event Log composing pattern; the composition's contract is about administrative state changes (grants and revocations), not about evaluation queries.

Where the composition breaks down: when the host environment lacks an actor registry the verifier can consult (Actor Identity's `verify` cannot complete); when the grantor's credential mechanism cannot produce a verifiable proof (shared-secret credentials); when the Permissions store and the Actor Identity store have inconsistent retention policies such that attestations are purged while grants persist (or vice versa) — composing Retention Window placements over the pair (or the full Defensible Retention composition where holds and gated purge are also needed) handles this.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are: the two state-changing actions it exposes ([Issue Grant], [Revoke Grant]) and the read-only attribution query ([Verify Grant Attribution]); the append-only [Orphan Log] of attestations whose grant or revocation write failed; and its own rejection/finding taxonomy — the attest-before-record failure ([Orphan Attestation]), the wrapped storage failure ([Attribution Storage Failure]), and the verify forensic finding ([Attribution Inconsistency]). Its load-bearing guarantee — attest-before-record: no grant or revocation is recorded without a preceding verifiable attestation, so every grant is attributable-by-construction (Invariants 1–4) — is a structural property, not a datum. Its emergent state (`grant_attribution`, `revocation_attribution`) is a pair of pairing maps from `grant_id` to `attestation_id`, left as backticked tokens; there is no composition-introduced entity identity — `grant_id` is the Permissions atom's own id. The grant/attestation outcomes (`Active` / `Revoked`, `verified` / `failed-verification`), the constituent calls — Permissions' `grant` / `revoke` / `permitted`, Actor Identity's `attest` / `verify` — stay backticked as wire values, as do the passthrough evaluation query (`permitted`), the relayed constituent tokens (`grant_id`, `attestation_id`, `subject_ref`, `action_scope`, `grantor_ref`, `revoker_ref`, `grantor_credential`, `revoker_credential`, `proposal_ref`), the composition output fields left uncarded (`grant_record`, `issuance_verify_result`, `revocation_verify_result`, `underlying_reason`), the generic/relayed rejections (`invalid-request`, `invalid-credential`, `not-known`, `not-active`), the deployment configuration knobs (`grant_proposal_format`, `revocation_proposal_format`), and concrete example ids. Constituent atom names remain the existing full links to `../atoms/*`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Issue Grant

The composition's grant action: attest *first* (Actor Identity binds the grantor's credential to the grant proposal), then record the grant in Permissions, then write the pairing to `grant_attribution` — so no grant exists without its attribution (Invariant 1). Returns `(grant_id, attestation_id)`; a grant-side failure after the attestation leaves an [Orphan Attestation].

Kind: Operation

#### Revoke Grant

The composition's revocation action: attest the revocation first (under the revoker's credential), then revoke in Permissions, then write the pairing to `revocation_attribution` — so every Revoked grant carries its revoker's attestation (Invariant 2). Returns `(ok, attestation_id)`.

Kind: Operation

#### Verify Grant Attribution

The read-only query that, for any `grant_id`, returns the grant record, its issuance attestation and verify result, and (if Revoked) its revocation attestation and verify result — the records-alone answer to *who authorized this access, when, and under what credential?* (Invariant 3). Surfaces [Attribution Inconsistency] as a forensic finding when a grant exists with no attribution record.

Kind: Operation

#### Orphan Log

The composition's append-only operational record of attestations that were written to Actor Identity but whose corresponding grant or revocation write failed — the surface a composing system uses for retry and manual review. Never modified after a write (Invariant 8); distinct from the audit's structural orphan detection, which cross-references the stores directly.

Kind: Type
Role: the append-only orphan record

#### Orphan Attestation

The composition's rejection when a grant or revocation write fails *after* its attestation committed, leaving an unmatched attestation in Actor Identity — the recoverable failure mode the attest-before-record ordering deliberately accepts (an orphan attestation is evidence of an attempted action; a grant with no attestation would be unrecoverable). Logged to the [Orphan Log].

Kind:      Member
Member of: the administration rejection
Role:      Rejection
Projects:  orphan-attestation

#### Attribution Storage Failure

The composition's rejection wrapping a constituent `storage-failure` at the attestation step — surfaced under a composition-layer name so its origin (the attribution write) is distinguishable from a caller error.

Kind:      Member
Member of: the administration rejection
Role:      Rejection
Projects:  attribution-storage-failure

#### Attribution Inconsistency

The [Verify Grant Attribution] forensic finding: the grant exists in Permissions but its attribution-map entry is unpopulated (a pairing-write-durability failure under Invariant 1 or 2) — a distinct condition from `not-known` (grant absent), never to be silently coerced to it.

Kind:      Member
Member of: the verify result
Role:      Forensic finding
Projects:  attribution-inconsistency

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Issue Grant]: #issue-grant
[Revoke Grant]: #revoke-grant
[Verify Grant Attribution]: #verify-grant-attribution
[Orphan Log]: #orphan-log
[Orphan Attestation]: #orphan-attestation
[Attribution Storage Failure]: #attribution-storage-failure
[Attribution Inconsistency]: #attribution-inconsistency

---

## Standards references

This composition draws on:

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-53 Rev. 5, AC-3 (Access Enforcement) + AU-2 (Event Logging) + IA-2 (Identification and Authentication, Organizational Users)** — the combined administrative-action-with-attribution surface that AC-3 + AU-2 together require, with IA-2 supplying the grantor identity discipline.
- **SOX §404 (Internal Control over Financial Reporting)** — segregation-of-duties controls over access provisioning; the composition produces the records §404 examines.
- **HIPAA §164.312(a)(1) + §164.312(b) (Technical Safeguards — Access Control + Audit Controls)** — the combined access-control-with-audit-controls bar that the two paragraphs together establish; the composition is the structural form that satisfies both without the system administrator filling the gap by hand.
- **PCI DSS Requirement 7 (Restrict Access to System Components and Cardholder Data) + Requirement 10 (Track and Monitor Access)** — Requirement 7 mandates that access authorization be documented; Requirement 10 mandates that the documentation be tamper-evident and attributable. The composition satisfies the first; composing with Tamper Evidence over its stores satisfies the second.
- **21 CFR Part 11 §11.10 (Controls for closed systems) + §11.50 (Signature manifestations)** — Part 11's electronic-signature regime applied to the grantor's attestation on an administrative action.
- **GDPR (General Data Protection Regulation) Article 25 (Data Protection by Design and by Default) + Article 30 (Records of Processing Activities)** — the composition's records satisfy the Article 30 record-keeping obligation for the access-control processing activity.
- **ISO/IEC 27001 §A.9.2 (User access management)** — the International Organization for Standardization / International Electrotechnical Commission information-security standard; formal user-access-management procedure with records of authorization; the composition is the structural answer.

The two atoms it composes carry their own standards inheritance — Permissions (NIST SP 800-53 AC family, NIST SP 800-207 Zero Trust, ISO/IEC 27001 §A.9, HIPAA §164.312(a)(1), SOX §404, PCI DSS Req. 7, GDPR Art. 25, NIST SP 800-63-3) and Actor Identity (eIDAS Regulation — Electronic Identification, Authentication and Trust Services, the EU electronic-signature regulation — qualified electronic signatures, DEA EPCS — US Drug Enforcement Administration Electronic Prescriptions for Controlled Substances — for controlled-substance prescriptions, ISO 14533 and CAdES for long-term signature preservation, 21 CFR Part 11 §11.50).

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the composition discipline: a composition is the wiring of freestanding concepts, not a new primitive. Attribution and authorization are separate concepts; the composition wires them rather than absorbing attribution into Permissions.
- **The principle of attributable administrative action** — the structural form of what professional-responsibility codes (legal, medical, financial), regulatory regimes (SOX, HIPAA, PCI DSS), and security frameworks (NIST, ISO 27001) all require: every state-changing administrative action carries a verifiable record of who authorized it. The composition gives the principle a single composable concept.

---

## Status

`grounded on Final Critique 7 — 2026-08-26` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 7 — 2026-08-26
formal: verified — attributed-permissions-admin.als + attributed-permissions-admin.tla + 1 twin, 2026-06-12
last gate: 2026-08-26 — Final Critique 7, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/attributed-permissions-admin.md`.
