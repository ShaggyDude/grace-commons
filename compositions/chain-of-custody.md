---
title: Chain of Custody
parent: Conceptual Compositions
nav_order: 17
has_toc: true
toc: true
---

# Chain of Custody

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Chain of Custody is a regulated composition (a spec that wires two or more atoms — freestanding, self-contained pattern specs — together) that solves the chain-of-custody problem no single atom solves alone: proving, from the records alone, that an artifact moved through an unbroken sequence of verified, non-repudiable custodians, that no entry was tampered with, and that the chain was kept for the required period. It wires two constituents: Provenance (the append-only custody chain with structural continuity — one current custodian at all times, hand-to-hand transfers) and the Audit Trail substrate (the tamper-evident — designed so unauthorized changes are detectable — regulated-audit substrate that attribution-stamps and seals every custody event via the Event Log, Actor Identity, Retention Window, and Tamper Evidence atoms it contains).

The composition's defining emergent guarantee is records-alone custody proof: a single query, `verify_custody(chain_id)`, returns the full ordered chain with, per entry, the verified attribution of the acting custodian (who authorized this step), the tamper-evident seal status (has the entry been altered), and the retention state (is the entry still held lawfully) — plus a continuity check confirming that every transfer's outgoing custodian equals the prior holder. This is the structural answer to the regulator's, judge's, or auditor's four questions — *who held it, was the transfer unbroken, was the record altered, was it kept long enough* — from the records alone, without developer narration. Neither Provenance alone nor Audit Trail alone produces this answer; the composition is what wires them into a single custody-proof surface.

this composition's most common uses are pharmaceutical chain of custody under FDA 21 CFR Part 211 and DEA 21 CFR Part 1304 (controlled substance inventory), physical-evidence authentication under FRE 901(b)(9), financial instrument custody records under SEC (US Securities and Exchange Commission) Rule 17a-4, and digital-file chain of custody under ISO 23081 (records-management metadata). Any system that must prove, from records alone, that every step in an artifact's journey was attributed, sealed, and retention-governed is a candidate for this composition.

---

## Intent

Every domain that must account for an artifact's journey faces the same four-part requirement: the chain must be unbroken (no gap in custody, hand-to-hand transfers with no unattributed interval), the custodians must be verified (each hand-off attributed to a real actor, not just an opaque reference), the chain must be tamper-evident (any after-the-fact rewrite detectable from the records alone), and the chain must be retention-governed (retained for its regulatory lifetime and lawfully destroyable with a defensible record of destruction). No single atom satisfies all four. Provenance supplies the first. Audit Trail supplies the third and fourth, and transitively the second via Actor Identity. But neither provides the full custody-proof surface until they are wired together: Provenance does not verify its opaque `custodian_ref` values and does not seal its chain; Audit Trail does not know what a custody chain is or that its events need to be tied to custody entries. The wiring is this composition.

The cross-domain structural identity is the composition's thesis. Under FDA 21 CFR Part 211 (Current Good Manufacturing Practice for Finished Pharmaceuticals), a pharmaceutical manufacturer must demonstrate an unbroken, attributed, tamper-protected, retention-compliant chain of custody from manufacture through distribution to dispensing. Under FRE 901(b)(9) (Authentication by Process or System), an officer presenting physical evidence at trial must authenticate the exhibit via an unbroken custody chain in which every handler is identified. Under DEA 21 CFR Part 1304 (Controlled Substance Inventory Records), a complete, accurate record of every change of custody for a controlled substance is a legal obligation. The structural form is identical across all three domains: one artifact, one current custodian at all times, hand-to-hand transfers, each hand-off attributed and verifiable, the record sealed against tampering, and the record retained for its regulatory lifetime. One grounded composition satisfies all three.

This is a composition, not a new primitive. Provenance and Audit Trail (with its constituent atoms, Event Log, Actor Identity, Retention Window, and Tamper Evidence — reached transitively) are unchanged. The composition is the wiring that makes them coherent as a single chain-of-custody surface. It introduces emergent actions — [Originate Custody], [Transfer Custody], [Transform Custody], [Disclose Custody], [Archive Custody], [Verify Custody] — that belong to no single constituent and exist only because the two are wired together. [Verify Custody] in particular belongs to neither constituent alone: Provenance can verify structural continuity but cannot verify attribution or tamper-evidence; Audit Trail can verify attribution and tamper-evidence but does not know which events constitute a custody chain. The composition is the layer that answers: *is this custody chain complete, attributed, sealed, and within its retention horizon?*

What the composition is *not*: it is not a DAG-model provenance tracker (the linear single-artifact constraint is inherited from Provenance); it is not a multi-party simultaneous custody surface; it is not the legal-hold suspension layer over custody chains (that is Legal Hold / Defensible Retention); it is not the artifact-registry layer (validating that `artifact_ref` names a real artifact in the host system is the host's obligation); and it is not the clock-authority layer (inherited from Audit Trail). Each is named explicitly in Edge cases.

---

## Composes

- **[Provenance](../atoms/provenance.md)** — the structural custody chain. Supplies the core guarantee: custody continuity (Invariant 4 — one current custodian at all times, every transfer is hand-to-hand with `from_custodian_ref` read from chain state). The composition calls `originate`, `transfer`, `transform`, `disclose`, `archive`, and `read`. Provenance is the subject-scoped chain that Event Log cannot replicate; the composition does not re-derive its custody-continuity guarantee but adds attribution verification and tamper-evidence coverage to each entry via the Audit Trail substrate wiring.

- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every custody action the composition exposes records here as one `AuditTrail.record_action` call, producing an Event Log entry (append-only, totally ordered), an Actor Identity attestation (binding the acting custodian's `custodian_ref` to a verified credential), a Retention Window record (for the audit event), and a Tamper Evidence seal per the cadence. The composition maintains exactly one Audit Trail instance configured with the host's regulatory retention policy for the custody audit events. **Actor Identity, Tamper Evidence, Retention Window, and Event Log are reached transitively through Audit Trail** — the composition does not maintain separate instances of those four atoms at this layer. The Audit Trail's `record_action` is the mechanism by which each custody entry receives an attributed, sealed, retention-governed audit event, closing the gap Provenance's `custodian_ref` Edge case named: *"Non-repudiable custodian identity → Actor Identity."*

The Event Log, Actor Identity, Retention Window (for audit events), and Tamper Evidence atoms are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms at this layer. This follows the *Compositions of compositions* convention (see [`spec-format.md`](../spec-format.md) §Compositions of compositions): naming Audit Trail as the substrate is what satisfies the Actor Identity, Tamper Evidence, and Retention Window requirement — they are reached transitively, not maintained as separate instances at this composition layer.

---

## Composition logic

### Composition state

The composition owns one piece of emergent state that wires the two constituents into a queryable, records-alone-defensible custody-proof surface:

- **`entry_to_event`** — map from Provenance `entry_id` to the Audit Trail `event_id` that attributes, seals, and retention-governs that custody entry. This is the traversal backbone: given any custody entry, the composition can locate its corresponding attributed audit event, verify its attestation (who authorized this step), verify its seal (was the entry tampered with), and confirm its retention state (is it still lawfully held). **Contract classification: derived index** ([`execution-contract.md`](../execution-contract.md) §Composition state; reclassified 2026-06-11, closing part of the Invariant-4 coverage-gap finding). Every fact in the map is reconstructible from constituent stores — the named rebuild procedure enumerates the Audit Trail substrate's events whose `data.entry_id` names an entry of the chain (every custody `record_action` carries `entry_id` in its data payload) and re-keys them by that field. The Contract's obligations follow: the map sits **outside the per-action atomicity surface** — the truth-bearing atomicity obligation (Invariant 4) binds the Provenance entry and the audit event, and the map's population, occurring only after both writes succeed, is *evidence* that obligation was met, never a peer write whose failure the compensation protocol must handle; a missing or lost map entry is a **rebuild trigger, not data loss** — reads consult the index with rebuild-on-miss semantics, and an entry that still lacks an audit event after rebuild is the real orphan (Invariant 4's surfaced finding); and the map claims no cross-constituent transactional consistency. Never modified after insertion. An `entry_id` whose rebuild yields no audit event is the partial-failure orphan surfaced per the *Cross-store consistency under partial failure* edge case; an `event_id` carrying a `data.entry_id` not present in Provenance is a structural finding (Invariant 4's inverse orphan — unreachable through this composition's wiring).

The Provenance chain state (entries, `current_custodian`, chain lifecycle) and the Audit Trail substrate state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) are owned by their respective constituent instances. The composition does not duplicate them; it indexes into them via `entry_to_event`.

### Configuration

- **`audit_trail_retention_policy`** — the policy reference (or content-derived policy selector) configured on this composition's single Audit Trail instance, governing the lifetime of the custody audit events (the `record_action` entries in the Event Log, not the Provenance chain entries themselves). This is set once on the Audit Trail instance; Audit Trail's `record_action` takes no per-call retention argument — every this composition custody-audit event inherits this configured policy. The custody audit record should persist at least as long as the Provenance chain it describes, and typically longer for regulatory defensibility after the artifact's chain has been archived. For pharmaceutical deployments under 21 CFR Part 211 the policy must encode at least the predicate-rule retention minimum; for legal-evidence deployments under FRE 901(b)(9) the policy must outlast the matter's litigation horizon. Multi-jurisdiction policy reconciliation (when FDA, DEA, and court-rule retention obligations overlap) is a Policy Reconciliation composing pattern concept; this composition takes the reconciled `policy_ref` as input.

- **`seal_cadence`** — inherited from the Audit Trail substrate's configuration (`per-event`, `interval-based`, or `on-demand`). For regulated chain-of-custody deployments, per-event or tight interval-based cadences are recommended: every custody event should be covered by a seal as promptly as possible because the unsealed tail is the window during which tampering is structurally undetectable at verification time. Pharmaceutical 21 CFR Part 11 ALCOA (Attributable, Contemporaneous, Original, Accurate) and legal-evidence FRE 901(b)(9) authentication both benefit from a narrow unsealed-tail window. The deployer configures `seal_cadence` on the Audit Trail instance; this composition does not impose an override, but the custody-proof verification outcome (Invariant 2 — tamper-evident coverage) names the unsealed-tail policy consequence explicitly.

- **`recovery_identity`** — a deployment-provisioned `actor_ref` + `credential` pair under which a *compensating* `AuditTrail.record_action` is attested when the original custodian's credential is deterministically rejected (`invalid-credential` / `invalid-request`, first detectable only after the irreversible Provenance write — see the uniform rejection-mapping rule and the *Cross-store consistency under partial failure* edge case). Retrying the original call cannot land a deterministic rejection, so the compensation re-attests under this identity; events so attested carry `cascade_recovery = true` and name the original `custodian_ref` in `data`, keeping attribution honest — the record shows which operational identity attested the compensation and which custodian performed the custody step. Mirrors the composition-actor convention established in Multi-Party Approval's Configuration. A deployment that wires a credential pre-check above this composition (per the uniform mapping rule) may never exercise this identity; it must still be declared wherever the deterministic-rejection arm is reachable. *(Added 2026-06-11 with the Invariant 4 safety + liveness restatement — the liveness arm's deterministic-rejection leg rests on this declared capability.)*

### Primitive policies

The composition takes string-typed inputs at its action boundaries; each is validated either at this layer or by a constituent.

- **`chain_id`** — opaque, system-generated by Provenance's `originate` (wrapped by [Originate Custody]). Supplied by callers to address an existing chain. The composition does not normalize, case-fold, or trim; `chain_id` equality is opaque byte-identity. An unknown `chain_id` yields `not-known` from the relevant action; the composition propagates Provenance's `not-known` at this boundary.
- **`entry_id`** — opaque, system-generated by Provenance per entry. Returned in action results; used as the key in `entry_to_event`. Byte-identity equality as a map key; never normalized.
- **`event_id`** — opaque, system-generated by Audit Trail's Event Log. Returned in action results; stored as the value in `entry_to_event`. Byte-identity equality; never normalized.
- **`artifact_ref`** — opaque reference to the artifact whose custody this chain tracks. Must contain at least one non-whitespace character (Provenance's requirement); validated by the constituent at `originate`. The composition propagates Provenance's `invalid-ref`. This composition does not validate `artifact_ref` against an external artifact registry; the host system is responsible for ensuring the reference is meaningful.
- **`custodian_ref`** — opaque reference to the custodian performing or receiving a custody action. Must contain at least one non-whitespace character; validated by Provenance at each action. The composition maps this to the `actor_ref` passed to `AuditTrail.record_action` — the two are the same identity: the custodian *is* the actor whose credential the Audit Trail binds. The distinction between the opaque `custodian_ref` (as recorded in the Provenance chain) and the `actor_ref` / `credential` pair (as consumed by Audit Trail's Actor Identity) is the acting-custodian attribution rule: see *The load-bearing wiring decision* below for the per-action custodian-to-actor mapping.
- **`credential`** — opaque credential material consumed only by `AuditTrail.record_action` (specifically by the Actor Identity inside the substrate). The composition does not inspect it; the substrate's Actor Identity validates it at the audit write and surfaces `invalid-credential`, which the composition maps per the uniform rejection-mapping rule below.
- **`genesis_type`** — must be exactly `originated` or `received` (Provenance's rule). Propagated from Provenance's `invalid-genesis-type` if violated.
- **`transformation_descriptor`** — non-empty, non-whitespace-only string describing a transformation applied by the current custodian. Validated by Provenance; `invalid-descriptor` propagated to the composition boundary.
- **`recipient_ref`** — opaque reference to the party receiving a disclosure. Must contain at least one non-whitespace character; validated by Provenance. Propagated as `invalid-ref` if violated.
- **`metadata`** — optional opaque payload at [Originate Custody]. Passed through to Provenance; no composition-layer validation.

**Uniform `record_action` rejection-mapping rule.** For every `AuditTrail.record_action` call in the action wiring below, the substrate's rejection taxonomy (`invalid-credential | invalid-request | recording-failure`) is mapped uniformly:
- Where the audit write *precedes* any Provenance state change — no such case exists in this composition's wiring (Provenance writes first in all actions; see the acting-custodian attribution rule) — `invalid-credential` and `invalid-request` would surface as the action's pre-state clean rejection.
- Where the audit write *follows* a successful Provenance write (all of this composition's actions), the Provenance entry is immutable once committed and cannot be rolled back. There, `invalid-credential`/`invalid-request`/`recording-failure` from Audit Trail all surface as `rejected(recording-failure)` at this composition's boundary. **For this reason `invalid-credential` is not listed as a distinct returnable code in the action signatures above** — it is unreachable as a clean pre-state rejection in this composition (the only Actor Identity surface is the transitive one inside the post-Provenance-write audit call), so credential invalidity always manifests as `recording-failure` plus an orphan. The resulting orphan — a Provenance custody entry with no corresponding Audit Trail event and no `entry_to_event` binding — is surfaced per the *Cross-store consistency under partial failure* edge case. Deployments requiring credential pre-validation before the irreversible Provenance write wire an Actor Identity pre-check above this composition (a composing peer); this composition alone cannot pre-validate because its only Actor Identity surface is the transitive one inside the Audit Trail write, which occurs after the Provenance write.

No primitive is case-sensitivity-normalized at the composition layer; deployments wanting normalization wire it at the calling layer before invoking composition actions.

### Action wiring

The composition exposes six orchestrating actions and one read passthrough. Every custody-state-changing action records in Audit Trail; `read` passes through to `Provenance.read` without recording. All `entry_to_event` insertions occur only after both the Provenance write and the Audit Trail write succeed — the population of the map is the evidence that the atomicity obligation was met.

The full rejection taxonomy for each action enumerates every reason the action can fail; constituent rejections are either propagated (with the same name), renamed (with the mapping noted), or surfaced as a new code at the composition's boundary. Silent rejection-code drift is a Pass 1 reference-graph finding.

---

#### `originate_custody`

```
originate_custody(
  artifact_ref,
  custodian_ref,
  genesis_type,
  credential,
  metadata?
) →
    {chain_id, entry_id, event_id}
  | rejected(
      invalid-ref
    | invalid-genesis-type    | recording-failure
    )
```

Opens a new Provenance chain for `artifact_ref` under the custody of `custodian_ref`, and immediately binds the genesis entry to an attributed Audit Trail event.

Steps:

1. Validate `artifact_ref`, `custodian_ref`, `credential` per Primitive policies. Any failure → `rejected(invalid-ref)` for empty/whitespace `artifact_ref` or `custodian_ref`; `invalid-genesis-type` if `genesis_type ∉ {originated, received}`. Stop.
2. `Provenance.originate(artifact_ref, custodian_ref, genesis_type, [metadata])` → `chain_id` and the genesis `entry_id` (the genesis entry is at `sequence_number = 1`). Map constituent rejections: `invalid-ref` → `rejected(invalid-ref)`; `invalid-genesis-type` → `rejected(invalid-genesis-type)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref = custody.originated, actor_ref = custodian_ref, credential, data = {chain_id, entry_id, artifact_ref, genesis_type, recorded_at = now})` → `event_id`. (Throughout the action wiring, `now` denotes the substrate-injected clock value — read from the Audit Trail substrate's clock authority at record time and composed into the payload, never a clock this composition samples itself; see the *Clock source* edge case.) The genesis custodian is the actor — they are attesting that the artifact entered custody under their hand. If this call fails (the Provenance entry landed in step 2 but the audit write fails here): return `rejected(recording-failure)` per the uniform mapping rule; the orphan (Provenance chain with no Audit Trail event, no `entry_to_event` binding) is surfaced per the *Cross-store consistency under partial failure* edge case. Stop on failure.
4. Record `entry_to_event[entry_id] = event_id`.
5. Return `{chain_id, entry_id, event_id}`.

---

#### `transfer_custody`

```
transfer_custody(
  chain_id,
  to_custodian_ref,
  credential
) →
    {entry_id, event_id}
  | rejected(
      not-known
    | archived
    | invalid-ref    | recording-failure
    )
```

Records a hand-to-hand custody transfer on the chain. The **acting custodian is the outgoing (current) custodian** — they are releasing the artifact; their credential attests the release. The incoming custodian (`to_custodian_ref`) is named in the Provenance entry's `to_custodian_ref` field but does not attest the receiving step (they will attest their own subsequent actions under their custody).

Steps:

1. Validate `to_custodian_ref`, `credential` per Primitive policies. `to_custodian_ref` must contain at least one non-whitespace character; `credential` is opaque (consumed by Actor Identity inside Audit Trail). Any failure → `rejected(invalid-ref)`. Stop.
2. `Provenance.transfer(chain_id, to_custodian_ref)` → `entry_id`. The atom reads `from_custodian_ref = current_custodian` from chain state — the outgoing custodian's identity is structural, not caller-supplied (Provenance Invariant 4). Map: `not-known` → `rejected(not-known)`; `archived` → `rejected(archived)`; `invalid-ref` → `rejected(invalid-ref)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. Read `from_custodian_ref` from the just-written entry (or equivalently from the chain's pre-transfer `current_custodian`, which the entry records as its `from_custodian_ref`). This is the actor who is releasing custody and whose credential this action binds.
4. `AuditTrail.record_action(action_ref = custody.transferred, actor_ref = from_custodian_ref, credential, data = {chain_id, entry_id, from_custodian_ref, to_custodian_ref, recorded_at = now})` → `event_id`. (`now` is the substrate-injected reading — see *Clock source*.) The **outgoing** custodian's credential is the one bound here — they are releasing; the composition attests *that* custodian's release. If this call fails: `rejected(recording-failure)`; orphan per the *Cross-store consistency under partial failure* edge case. Stop on failure.
5. Record `entry_to_event[entry_id] = event_id`.
6. Return `{entry_id, event_id}`.

**Acting custodian for transfer — design note (see The load-bearing wiring decision for the full defense).** `credential` is the outgoing custodian's credential, not the incoming custodian's. This is the structurally correct choice: the transfer records a *release* by the current holder; the current holder is who the chain shows as responsible; their credential attests the hand-off. The incoming custodian does not attest the receipt in this action — their subsequent [Transform Custody], [Disclose Custody], or [Archive Custody] calls will bind their own credential, confirming they took real custody. This matches the real-world chain-of-custody discipline in both pharmaceutical and legal-evidence handling.

---

#### `transform_custody`

```
transform_custody(
  chain_id,
  custodian_ref,
  transformation_descriptor,
  credential
) →
    {entry_id, event_id}
  | rejected(
      not-known
    | archived
    | not-current-custodian
    | invalid-ref
    | invalid-descriptor    | recording-failure
    )
```

Records a transformation of the artifact by the current custodian. Only the current holder may record a transformation.

Steps:

1. Validate `custodian_ref`, `transformation_descriptor`, `credential` per Primitive policies. `custodian_ref` must contain at least one non-whitespace character; `transformation_descriptor` must contain at least one non-whitespace character. Any failure → `rejected(invalid-ref)` for `custodian_ref`, `rejected(invalid-descriptor)` for `transformation_descriptor`. Stop.
2. `Provenance.transform(chain_id, custodian_ref, transformation_descriptor)` → `entry_id`. Map: `not-known` → `rejected(not-known)`; `archived` → `rejected(archived)`; `not-current-custodian` → `rejected(not-current-custodian)`; `invalid-ref` → `rejected(invalid-ref)`; `invalid-descriptor` → `rejected(invalid-descriptor)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref = custody.transformed, actor_ref = custodian_ref, credential, data = {chain_id, entry_id, custodian_ref, transformation_descriptor, recorded_at = now})` → `event_id`. (`now` is the substrate-injected reading — see *Clock source*.) The current custodian's credential is bound — only the holder can transform. If this call fails: `rejected(recording-failure)`; orphan per the *Cross-store consistency under partial failure* edge case. Stop on failure.
4. Record `entry_to_event[entry_id] = event_id`.
5. Return `{entry_id, event_id}`.

---

#### `disclose_custody`

```
disclose_custody(
  chain_id,
  custodian_ref,
  recipient_ref,
  credential
) →
    {entry_id, event_id}
  | rejected(
      not-known
    | archived
    | not-current-custodian
    | invalid-ref    | recording-failure
    )
```

Records a disclosure by the current custodian to a named recipient. Custody is NOT transferred — the current custodian retains custody after a disclosure. Used to record that the artifact was shown or a copy provided to a party, for the purpose of placing that fact on the custody timeline.

Steps:

1. Validate `custodian_ref`, `recipient_ref`, `credential` per Primitive policies. Each must contain at least one non-whitespace character. Any failure → `rejected(invalid-ref)`. Stop.
2. `Provenance.disclose(chain_id, custodian_ref, recipient_ref)` → `entry_id`. Map: `not-known` → `rejected(not-known)`; `archived` → `rejected(archived)`; `not-current-custodian` → `rejected(not-current-custodian)`; `invalid-ref` → `rejected(invalid-ref)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref = custody.disclosed, actor_ref = custodian_ref, credential, data = {chain_id, entry_id, custodian_ref, recipient_ref, recorded_at = now})` → `event_id`. (`now` is the substrate-injected reading — see *Clock source*.) If this call fails: `rejected(recording-failure)`; orphan per the partial-failure edge case. Stop on failure.
4. Record `entry_to_event[entry_id] = event_id`.
5. Return `{entry_id, event_id}`.

---

#### `archive_custody`

```
archive_custody(
  chain_id,
  custodian_ref,
  credential
) →
    {entry_id, event_id}
  | rejected(
      not-known
    | already-archived
    | not-current-custodian
    | invalid-ref    | recording-failure
    )
```

Records the terminal disposition of the artifact by the current custodian and transitions the chain to Archived. No further custody entries are accepted after this action. The archiving custodian's credential attests the terminal disposition.

Steps:

1. Validate `custodian_ref`, `credential` per Primitive policies. Any failure → `rejected(invalid-ref)`. Stop.
2. `Provenance.archive(chain_id, custodian_ref)` → `entry_id`. Map: `not-known` → `rejected(not-known)`; `already-archived` → `rejected(already-archived)`; `not-current-custodian` → `rejected(not-current-custodian)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref = custody.archived, actor_ref = custodian_ref, credential, data = {chain_id, entry_id, custodian_ref, recorded_at = now})` → `event_id`. (`now` is the substrate-injected reading — see *Clock source*.) If this call fails: `rejected(recording-failure)`; the Provenance chain is in Archived state but the terminal audit event is missing — a high-priority orphan per the partial-failure edge case (an archived chain without an attributed terminal record is a deficiency in the custody-proof surface, though not a custody-gap finding because the Provenance `archived` entry still anchors the terminal disposition). Stop on failure.
4. Record `entry_to_event[entry_id] = event_id`.
5. Return `{entry_id, event_id}`.

---

#### `verify_custody`

```
verify_custody(chain_id, original_event_payloads) →
    custody-proof
  | rejected(not-known)
```

The emergent verification action. `original_event_payloads` is a map from `entry_id` (or its bound `event_id`) to the original event payload the seal committed to; it is a **required argument** because tamper-evidence verification is self-contained only given the originating records (Audit Trail Invariant 7 — verification asymmetry preserved). Surfacing the payloads at the signature, rather than having the composition fetch them internally, is intentional: the verifier must present the record set, not trust the composition to supply it. For an entry whose payload is not present in the map, the per-entry `attestation_verification` is reported as `unverifiable(payload-not-supplied)` rather than failing — partial verification (continuity + attribution + retention for the entries whose payloads are supplied) is still useful, and the missing-payload entries are named in the verdict. Constructs and returns the **records-alone custody proof** for the chain identified by `chain_id`. This action is the composition's defining emergent contribution: neither Provenance (structural continuity only, no attribution or seal) nor Audit Trail (attribution, seal, and retention, but no custody continuity) can answer this query alone. Only the composition can, because it holds `entry_to_event` — the binding that lets the verifier traverse from each custody entry to its attributed, sealed, retention-governed audit event.

The returned [Custody Proof] is a structured artifact containing:
- **`chain_id`** — the identifier of the chain being verified.
- **`chain_state`** — the Provenance chain's current state (`Open` or `Archived`).
- **[Continuity Check]** — the result of replaying the Provenance entries in `sequence_number` ascending order, maintaining a running current-custodian cursor, and verifying that for every `transferred` entry the `from_custodian_ref` equals the current custodian in effect immediately before that transfer — equivalently, the `to_custodian_ref` of the most recent *preceding* `transferred` entry, or the genesis `custodian_ref` if no prior transfer exists. Intervening `transformed` and `disclosed` entries do not change custody, so the cursor carries the holder through them; comparing a transfer's `from` against the immediately adjacent entry (which may be a transform by the same holder) would be wrong. Result: `continuous` or `gap-detected(entry_id, expected_from, actual_from)`. This is Provenance Invariant 4 replayed on demand.
- **`entries`** — an ordered sequence (by `sequence_number`) of per-entry verification records. Each record contains:
  - `entry_id`, `sequence_number`, `event_type`, `custodian_ref` (or `from_custodian_ref`/`to_custodian_ref` for transfers), `recorded_at` — from Provenance.
  - `event_id` — from `entry_to_event[entry_id]`. `absent` if the entry has no binding (Invariant 4 — binding bijection — violation; flagged in the proof as `binding-gap`).
  - `attestation_verification` — the result of `AuditTrail.verify_record(event_id, original_event_payloads[entry_id])` for the bound `event_id`. Returns `verified`, `failed-verification(reason)`, `not-known` (the audit event is unknown — a `binding-gap`), or `unverifiable(payload-not-supplied)` (the caller did not include this entry's payload in `original_event_payloads`, so the seal check cannot run). The attestation verification answers: was the acting custodian's credential valid, is the audit event covered by a verifying seal, and is the retention record in Retained state?
  - `retention_state` — the retention state of the audit event (derived from the Audit Trail substrate's `event_to_retention` for this `event_id`): `Retained`, `Purged`, or `unknown` (if the `event_id` is not bound).
- **[Overall Verdict]** — a summary verdict: [Custody Proof Complete] (continuity continuous, every entry has a binding, every `attestation_verification` returns `verified` or `failed-verification(purged)` — the latter is lawfully destroyed), or [Custody Proof Incomplete] enumerating the specific failure classes (gap-detected, binding-gap, attestation-failed, retention-lapsed, seal-failed, or payload-not-supplied). `payload-not-supplied` is distinguished from the genuine-failure classes: it signals an incomplete verification input, not a defect in the custody record.

Steps:

1. Look up `chain_id` in the Provenance store. If not present → `rejected(not-known)`. Stop.
2. Read all Provenance entries for `chain_id` via `Provenance.read(chain_id)` in `sequence_number` ascending order.
3. Execute the continuity check: replay entries, verifying the `from_custodian_ref` / `to_custodian_ref` chain (Provenance Invariant 4). Record the result.
4. For each entry `e` in the ordered sequence:
   a. Look up `event_id = entry_to_event[e.entry_id]`. If absent, record `binding-gap` for this entry.
   b. If `event_id` present, look up `original_event_payloads[e.entry_id]`. If absent, record `attestation_verification = unverifiable(payload-not-supplied)` and continue. If present, call `AuditTrail.verify_record(event_id, original_event_payloads[e.entry_id])` (Audit Trail Invariant 7 requires the original payload to be re-presented; the caller supplies it via the argument). Record the verification result.
   c. Read retention state for `event_id` from the Audit Trail substrate's `event_to_retention` map.
5. Compute `overall_verdict` from the collected results.
6. Return `custody-proof` with all fields populated.

**Note on `original_event_payloads` at verify_custody.** The asymmetry is surfaced at the signature: `original_event_payloads` is a required argument, not an internally-fetched value (Audit Trail Invariant 7 — verification asymmetry preserved: the verifier must present the original record set, not trust the composition to fetch it). For interactive audits, the auditor retrieves payloads from cold storage and supplies the full map. For operational monitoring queries, the system supplies the payloads from its own store. A caller who supplies a partial map (or none) receives a partial proof: entries without a supplied payload report `unverifiable(payload-not-supplied)` and the verdict names them, while continuity, attribution, and retention for the supplied entries are still verified. This mirrors Audit Trail's own `verify_record(event_id, original_event_payload)` design, where the payload is an explicit second argument rather than a hidden fetch.

---

#### `read` (passthrough)

```
read(chain_id, query?) →
    ordered_sequence_of_entries
  | rejected(not-known | invalid-query)
```

Passes directly to `Provenance.read(chain_id, [query])` without modification. No Audit Trail event is recorded — this is a pure read that changes no state. Returns entries in `sequence_number` ascending order. The composition does not enrich the entries with Audit Trail data at the read layer; enrichment occurs in [Verify Custody].

---

### The load-bearing wiring decision — custody-event ⇒ audit-event binding

The composition's structural reason to exist: **every Provenance custody action emits, in the same transactional boundary, an Audit Trail `record_action` that (a) names the custody `entry_id` in its data payload, (b) attributes the acting custodian via credential (Actor Identity through Audit Trail), and (c) is thereby sealed and placed under retention. The binding is recorded in `entry_to_event`.**

*Principle.* A court-admissible or regulator-acceptable chain of custody requires four properties simultaneously: continuity (no gap, hand-to-hand), verified attribution (each custodian non-repudiably identified), tamper-evidence (any rewrite detectable from the records alone), and retention governance (retained for the regulatory lifetime, lawfully destroyable with a defensible record). No single atom satisfies all four. Provenance supplies continuity and a structural custody record. Audit Trail supplies attribution, tamper-evidence, and retention governance. The gap is the binding: without a per-entry link between the Provenance custody chain and the Audit Trail's attributed, sealed, retained event, the two stores are parallel but unjoined — an auditor can verify continuity separately and attribution separately, but cannot prove continuity-and-attribution-and-seal-and-retention *together for the same entry*. The `entry_to_event` binding closes that gap.

*Likely objection.* Why not fold attribution, tamper-evidence, and retention directly into Provenance, so the chain itself carries all four properties?

*Mechanism that resolves it.* Those are exactly the concepts Provenance deliberately extracted during its EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) Pass 2 to remain freestanding. Provenance's Edge cases name all three: *"Non-repudiable custodian identity → Actor Identity"*, *"Cryptographic tamper-evidence on the chain → Tamper Evidence"*, *"Retention and defensible disposal → Retention Window / Defensible Retention."* The composition is precisely where those concepts re-converge. And the re-convergence is efficient: Audit Trail already wires all three (Actor Identity + Tamper Evidence + Retention Window + Event Log) into a single regulated-audit substrate. The composition needs only one binding — custody entry to audit event — and Audit Trail provides the full attribution+seal+retention surface transitively. Absorbing those three concepts into Provenance would destroy Provenance's freestanding status and force every non-regulated use of a custody chain to carry the regulated overhead.

*Result.* A records-alone-defensible custody proof that neither Provenance nor Audit Trail provides alone. An auditor holding `entry_to_event` plus the Provenance chain plus the Audit Trail substrate can answer the four regulator/court questions for any custody entry without developer narration, without source code, without runbooks.

**The acting-custodian attribution rule (per action):**

This is a Pass-3-prone detail that the wiring decision must state explicitly. The `credential` passed to each composition action binds a specific actor via Audit Trail's Actor Identity. The rule is:

- **[Originate Custody]** → the **genesis custodian** attests. They are creating the chain and taking initial custody; their credential is bound at genesis.
- **[Transfer Custody]** → the **outgoing (current) custodian** attests. They are *releasing* custody; `from_custodian_ref` is read from Provenance's chain state (Provenance Invariant 4 — it cannot be forged), and the composition passes that reference as `actor_ref` to `AuditTrail.record_action`. The incoming custodian (`to_custodian_ref`) does not attest the receipt in this action — their subsequent actions on the chain (transform, disclose, archive, or transfer) will bind their own credential, evidencing that they took active custody.
- **[Transform Custody]** → the **current custodian** attests. They are performing the transformation under their custody; Provenance enforces that only the current holder can call `transform` (`not-current-custodian` guard), so the actor and the current holder are the same.
- **[Disclose Custody]** → the **current custodian** attests. Same discipline as transform.
- **[Archive Custody]** → the **current custodian** attests. They are recording terminal disposition from their hand; the archiving custodian is the chain's last-recorded holder.

This rule closes the gap Provenance's Edge case named: *"Non-repudiable custodian identity → Actor Identity."* By passing `custodian_ref` (or `from_custodian_ref` for transfers) as the `actor_ref` to `AuditTrail.record_action`, the composition binds each Provenance opaque custodian reference to a verified actor credential — transforming structural continuity into attributed, non-repudiable continuity.

---

## Composition-level invariants

These invariants (conditions that must always hold) emerge from the composition. None belongs to a single constituent; each requires both Provenance and the Audit Trail substrate working together to hold.

- **Invariant 1 — Attributed custody.** Every custody entry in the Provenance chain has exactly one corresponding Audit Trail event (via `entry_to_event`) whose verified attestation binds the acting custodian's `custodian_ref` to a verified credential, and whose `action_ref` matches the entry's `event_type`. No custody entry exists in the Provenance chain without an attributable, attribution-verified audit record. *Rests on:* Provenance Invariant 1 (entry immutability), Provenance Invariant 7 (custodian presence — every entry has a non-empty `custodian_ref`), and Audit Trail Invariant 1 (attribution coverage — every Audit Trail event has a verified attestation). Established by the `entry_to_event` population step in each action wiring.

- **Invariant 2 — Tamper-evident custody chain.** Every custody entry in the Provenance chain is covered by the Audit Trail seal via its `entry_to_event` binding: any rewrite of any custody entry's corresponding audit event is detectable from the records alone, and [Verify Custody]'s per-entry `attestation_verification` will return `failed-verification(seal-...)` for the affected entry. *Rests on:* Audit Trail Invariant 3 (integrity coverage modulo unsealed tail) and Audit Trail Invariant 7 (verification asymmetry preserved). The unsealed tail is observable and bounded by the configured `seal_cadence`; a tighter cadence narrows the tamper-detection window.

- **Invariant 3 — Retention-governed custody and honest disposal.** Every custody audit event is placed under retention by the Audit Trail substrate at `record_action` time; no custody event is purged before its retention obligation is honored; when retention expires, the cascade purges the audit event, its attestation, and its seal coverage per the Audit Trail substrate's cascade-on-purge rule; and [Verify Custody]'s per-entry `attestation_verification` returns `failed-verification(purged)` for lawfully destroyed entries — distinguishing lawfully destroyed from missing. *Rests on:* Audit Trail Invariant 2 (retention coverage), Audit Trail Invariant 4 (cascade-on-purge), and Audit Trail Invariant 8 (honest representation of destruction).

- **Invariant 4 — Binding bijection / no dangling partial (safety + liveness).** A one-to-one binding between Provenance custody entries created through this composition and Audit Trail custody events: every such entry has exactly one corresponding `record_action` event whose `data.entry_id` points back to it, and vice versa. The two truth-bearing writes (the Provenance entry and the audit event; the `entry_to_event` map is a derived index outside this surface — see Composition state) are committed atomically *or* the failure path of the *Cross-store consistency under partial failure* edge case runs. Because Provenance entries are immutable once committed and synchronous rollback is unavailable, the orphan state — a custody entry with no audit event — *is* reachable under the prescribed design, durably, until compensation lands. The honest claim therefore splits:

  - **Safety — no *unsurfaced* orphan.** At all times, every orphan is detectable from the records alone (enumerate the Provenance chain against the Audit Trail events through the substrate's read surface). Surfacing has two mandatory legs: a partial failure that *returns* surfaces the orphan as a high-priority compliance finding in the same outcome that returns `rejected(recording-failure)`; a partial failure that *cannot* return — a process crash between the two truth-bearing writes — is caught by the mandated **reconciliation scan** (the same orphan enumeration, run at restart and on a fixed cadence; see the partial-failure edge case), so no orphan survives unsurfaced past the scan bound. Never a quiet inconsistency. A custody audit event naming an `entry_id` absent from the Provenance chain (the inverse orphan) is unreachable through this composition's wiring. Recovered bindings remain distinguishable from clean ones via the `cascade_recovery` marker on the compensating event.
  - **Liveness — every orphan is eventually bound.** The mandated compensation (retry the failed `AuditTrail.record_action` until it lands) restores the bijection: an orphan is a surfaced transient under compensation, never a steady state of a conforming implementation. Formally: *Orphan(e) ↝ Bound(e)* under weak fairness on the retry — the eventuality lives in the implementation's retry obligation; the formal model carries its enabledness half (the retry action is enabled in exactly the orphan configuration, so no orphan state is a dead end). The retry discharges *transient* failures (`recording-failure`); a *deterministic* rejection of the audit write (`invalid-credential` / `invalid-request` — first detectable after the irreversible Provenance write, per the uniform rejection-mapping rule) cannot land by repetition, so there the compensation re-attests under the deployment's declared `recovery_identity` (see Configuration and the partial-failure edge case) — the eventuality holds across both failure classes, by retry on one and by recovery-attestation on the other.

  *This is the load-bearing claim* and the formal-model subject — the model covers both arms, the atomic commit and the compensated partial failure; it mirrors Audit Trail Invariant 4 (cascade-on-purge atomicity across four stores) at the entry-creation boundary. A violation — an *unsurfaced* custody-entry orphan, or an orphan outside compensation — is a high-priority finding surfaced per the partial-failure edge case.

- **Invariant 5 — Records-alone custody proof (forensic completability).** `verify_custody(chain_id)` lets an auditor prove, from the records alone, that the chain has: (a) unbroken structural custody continuity (Provenance Invariant 4 replayed as `continuity_check = continuous`), (b) a verified attribution for every non-purged entry (`attestation_verification = verified`), (c) tamper-evident seal coverage for every non-purged entry (inherited from `attestation_verification`'s seal check), and (d) an honest retention state for every entry (`Retained` for non-expired entries, `Purged` with honest-destruction provenance for expired ones). The `overall_verdict = custody-proof-complete` is the emergent guarantee neither Provenance (no attribution or seal) nor Audit Trail (no custody continuity) provides alone. *Rests on:* Invariants 1–4 above, Provenance Invariants 1 and 4, and Audit Trail Invariants 1, 3, 6, 7, and 8.

- **Invariant 6 — Constituent invariants preserved.** All Provenance invariants (1–10) hold over the Provenance chain instance; all Audit Trail invariants (1–8) hold over the Audit Trail substrate instance, and transitively all Event Log, Actor Identity, Retention Window, and Tamper Evidence invariants hold over their constituent instances within the substrate. The composition does not weaken or override any constituent invariant.

---

## Examples

### Walkthrough — pharmaceutical chain of custody under 21 CFR Part 211

A pharmaceutical manufacturer uses this composition to track batch X-91 from manufacturing through distribution to dispensing. Configuration: `audit_trail_retention_policy = pharma_7yr_predicate_rule` (encoding the applicable predicate-rule retention minimum), `seal_cadence = per-event` (ALCOA — Attributable, Contemporaneous, Original, Accurate — requires contemporaneous, tamper-evident records; per-event sealing satisfies this at the strongest cadence).

1. **Manufacturer originates the batch.** The quality-release officer calls `originate_custody(artifact_ref="batch-x91", custodian_ref="manuf-lab-7", genesis_type=originated, credential=<qro_credential>)` → `{chain_id="chain-0041", entry_id="e1", event_id="ev_1001"}`. Provenance opens the chain; `AuditTrail.record_action(custody.originated, actor_ref="manuf-lab-7", qro_credential, ...)` → `ev_1001`; `entry_to_event["e1"] = "ev_1001"`. The genesis is attributed and sealed.

2. **Transfer to regional distributor.** `transfer_custody(chain_id="chain-0041", to_custodian_ref="dist-region-3", credential=<lab7_credential>)` → `{entry_id="e2", event_id="ev_1002"}`. Provenance writes the transferred entry (`from_custodian_ref="manuf-lab-7"`, `to_custodian_ref="dist-region-3"`); the composition reads `from_custodian_ref = "manuf-lab-7"` and passes it as `actor_ref` to Audit Trail. The outgoing custodian's credential attests the release. `entry_to_event["e2"] = "ev_1002"`.

3. **Distributor transfers to hospital pharmacy.** `transfer_custody("chain-0041", "pharm-hosp-9", <dist_credential>)` → `{entry_id="e3", event_id="ev_1003"}`. `entry_to_event["e3"] = "ev_1003"`.

4. **Pharmacist transforms (dispenses dose).** `transform_custody("chain-0041", "pharm-hosp-9", "dispensed 10mg dose into dispensing unit D44", <pharm_credential>)` → `{entry_id="e4", event_id="ev_1004"}`. `entry_to_event["e4"] = "ev_1004"`.

5. **Archive at terminal disposition.** `archive_custody("chain-0041", "pharm-hosp-9", <pharm_credential>)` → `{entry_id="e5", event_id="ev_1005"}`. `entry_to_event["e5"] = "ev_1005"`. The Provenance chain is now Archived.

6. **FDA inspection.** The FDA (Food and Drug Administration — US federal agency regulating drugs and medical devices) inspector asks: *"Prove unbroken, attributed, tamper-evident, retention-compliant custody of batch X-91 under 21 CFR Part 211."* The system calls `verify_custody("chain-0041")`, passing the original event payloads from cold storage. The result:
   - `continuity_check = continuous` (every `from_custodian_ref` matches the prior holder).
   - For each of `e1`–`e5`: `attestation_verification = verified` (each attributed, each seal valid, each in `Retained` retention state).
   - `overall_verdict = custody-proof-complete`.
   The inspector sees a single structural answer to all four questions. Invariants 1–5 are the structural guarantees behind each field. The inspector consults no source code, no runbooks, no developer narration.

### Legal evidence — physical exhibit at trial under FRE 901(b)(9)

A detective collects exhibit-A at a crime scene, handled through forensic lab, evidence room, and courtroom. Each step uses this composition with `credential` bound to the individual officer's or lab's verified identity via the Audit Trail's Actor Identity. At trial, defense counsel challenges authentication under FRE 901(b)(9).

The prosecution calls `verify_custody(chain_id_of_exhibit_A)`. The returned `custody-proof`:
- `continuity_check = continuous` — every transfer's `from_custodian_ref` matches the prior holder; no unattributed handler appears.
- Every entry's `attestation_verification = verified` — each custodian's credential was valid at the time of their action.
- `overall_verdict = custody-proof-complete`.

Defense counsel's claim — that the exhibit passed through an unrecorded, unverified handler — has no structural basis. Invariant 1 (attributed custody) and Provenance Invariant 4 (custody continuity) are the structural rebuttal. The exhibit is authenticated under FRE 901(b)(9)'s process-or-system standard.

### Rejection path — transfer by non-current custodian

A prior custodian, `"manuf-lab-7"`, attempts to record a transformation after having transferred to `"dist-region-3"`: `transform_custody("chain-0041", "manuf-lab-7", "added label update", <lab7_credential>)` → `rejected(not-current-custodian)`. Provenance's `not-current-custodian` guard catches this at step 2; no Provenance entry is written, no Audit Trail event is recorded, no `entry_to_event` binding is created. The chain's integrity is unchanged.

### Rejection path — custody action on an Archived chain

After the pharmaceutical chain is Archived (example step 5), a downstream system attempts another transfer: `transfer_custody("chain-0041", "disposal-unit-1", <credential>)` → `rejected(archived)`. Propagated from Provenance. No state is written anywhere.

### DEA controlled substance — 21 CFR Part 1304 inventory custody

A DEA-licensed pharmacy tracks each controlled substance dispensing as a separate artifact with its own this composition chain. Each [Originate Custody] (pharmacy receives from supplier) → [Transfer Custody] (to dispensing cabinet) → [Transform Custody] (patient dispensing recorded) → [Archive Custody] sequence produces a complete attributed, sealed, retention-governed custody record per substance unit. A DEA (Drug Enforcement Administration) compliance inspection calls [Verify Custody] for each in-scope chain and verifies the returned `custody-proof-complete` verdict. Every change of custody is attribution-stamped; every record is sealed; every record is retained per the applicable predicate rule.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

**Regulator audit — pharma: prove unbroken, attributed, tamper-evident, retention-honored custody of batch X-91 under 21 CFR Part 211.**

An FDA inspector runs `verify_custody("chain-0041")` with original event payloads. The returned `custody-proof`:
- `continuity_check = continuous`: by Provenance Invariant 4, every `from_custodian_ref` equals the prior `to_custodian_ref` (or genesis `custodian_ref`). The chain cannot have a gap because Provenance reads `from_custodian_ref` from chain state — no forged predecessor is possible.
- Per-entry `attestation_verification = verified`: by Invariant 1 (attributed custody), each entry has an Audit Trail event whose Actor Identity attestation binds the `custodian_ref` to a credential. The Tamper Evidence seal (via Audit Trail Invariant 3) confirms no entry was rewritten.
- Per-entry `retention_state = Retained`: by Invariant 3, every entry is under active retention per the configured predicate-rule policy; none has elapsed.
- `overall_verdict = custody-proof-complete`.
The inspector's four questions — unbroken custody, verified attribution, tamper-evidence, retention honored — are answered from the records alone. No developer narration is required. Invariants 1–5 are the structural basis for each answer.

**Disputed transaction — legal evidence: defense claims tampering or an unattributed handler under FRE 901(b)(9).**

Defense counsel claims: (a) custody was broken (an unrecorded handler existed), or (b) a custodian was unverified (their identity was not attributable), or (c) the chain was tampered with (an entry was altered after the fact). The prosecution's [Verify Custody] result addresses each:
- Claim (a): `continuity_check = continuous`, resting on Provenance Invariant 4. If there were a gap, a transfer would have been recorded with a `from_custodian_ref` that did not match the prior holder — structurally impossible because Provenance reads `from_custodian_ref` from chain state.
- Claim (b): per-entry `attestation_verification = verified`, resting on Invariant 1 and Audit Trail Invariant 1. Each custodian's credential was verified by Actor Identity at the time of their action; the attestation is in the record.
- Claim (c): per-entry `attestation_verification` seal check (Invariant 2, Audit Trail Invariant 3). Any rewrite of an audit event produces a `failed-verification(seal-proof-invalid)` result. A rewrite of the Provenance chain itself is not covered by this composition's seal (Provenance is not directly sealed by this composition; it is the Audit Trail events that are sealed). However, the `entry_to_event` binding means any Provenance entry lacking a corresponding sealed Audit Trail event is a `binding-gap` in the `custody-proof` — itself a finding that the composition surfaces explicitly.

**Breach or incident investigation: reconstruct custody during an anomaly window and bound the time of tampering via the Audit Trail seal cadence.**

An incident responder suspects a custody record was tampered with between two dates. The responder calls `verify_custody(chain_id)` with payloads from the suspect window. For each entry in the window:
- `attestation_verification = verified` for entries whose covering seal predates the anomaly: the seal is intact.
- `attestation_verification = failed-verification(seal-proof-invalid)` for entries whose seal was tampered with: the first such entry, and its seal's `sealed_at` and `anchored_at` (from the Tamper Evidence atom via Audit Trail), bound the window. The most recent seal that returns `verified` end-to-end and the first that returns `failed-verification(seal-proof-invalid)` define the forensic window; the `seal_cadence` governs the window's resolution.
- `attestation_verification = failed-verification(unsealed)` for entries in the unsealed tail: these are covered by Event Log per-event immutability but not yet seal-verified; a tighter `seal_cadence` would have narrowed this window.
Where seals carry `anchored_at` from a TSA (Time-Stamp Authority — a trusted third party that signs proofs of when data existed) outside the adversary's reach, the upper bound on tampering time is independently established. The forensic picture comes from the records alone.

---

## Generation acceptance

A derived implementation of Chain of Custody is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state (`entry_to_event`) plus the Provenance chain store and the Audit Trail substrate stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

These checks are answerable by reading the composition's records (including the Audit Trail substrate):

1. **Every custody entry has a verified attribution.** For every `entry_id` in the Provenance chain, confirm `entry_to_event[entry_id]` is populated. For every populated binding, call `AuditTrail.verify_record(event_id, payload)` and confirm it returns `verified` (or `failed-verification(purged)` for entries whose retention has elapsed — lawful destruction distinguished from missing). An entry with no `entry_to_event` binding, or whose `attestation_verification` returns `failed-verification(attestation-...)`, is a conformance failure. Invariant 1 is the contract.

2. **Every custody entry is tamper-evidently sealed.** For every `event_id` in `entry_to_event.values()`, confirm the Audit Trail substrate's `seal_coverage` includes the `event_id` (i.e., the event has `sequence_number ≤ sealed_through` or the deployment's unsealed-tail policy explicitly permits a pending seal). For covered events, `AuditTrail.verify_record`'s seal check returns `verified`. A sealed event that returns `failed-verification(seal-proof-invalid)` is a conformance failure; an unsealed event is a seal-cadence-gap finding. Invariant 2 is the contract.

3. **Custody is continuous.** Replay the Provenance chain entries in `sequence_number` ascending order and confirm the `from_custodian_ref` / `to_custodian_ref` continuity property (Provenance Invariant 4): for every `transferred` entry, `from_custodian_ref` equals the `to_custodian_ref` of the immediately preceding `transferred` entry (or the genesis `custodian_ref` for the first transfer). A discrepancy at any entry is a conformance failure. Invariant 5 (records-alone custody proof) rests on this continuity check.

4. **Retention is honored; honest disposal is provable.** For every `event_id` in `entry_to_event.values()`, confirm the Audit Trail substrate's `event_to_retention` contains a retention record in `Retained` or `Purged` state. For `Retained` entries: `now < retention_until`, so no early purge has occurred (Audit Trail Invariant 2 + Retention Window Invariant 7). For `Purged` entries: a retention record in `Purged` state with `purged_at ≥ retention_until` is present — lawful destruction is provable from the records alone; `AuditTrail.verify_record` returns `failed-verification(purged)`, distinguishing lawfully destroyed from missing (Audit Trail Invariant 8). A custody entry whose `event_id` is purged without a `Purged`-state retention record is a conformance failure. Invariant 3 is the contract.

5. **Binding bijection is complete.** For every `entry_id` in the Provenance chain, `entry_to_event[entry_id]` is populated (no dangling custody entry). For every `event_id` in `entry_to_event.values()`, the corresponding Audit Trail event's `data.entry_id` points back to a Provenance entry in the same chain (no orphan audit event). An `entry_id` without a binding, or an `event_id` whose `data.entry_id` does not match its key in `entry_to_event`, is a conformance failure. Invariant 4 is the contract.

6. **Constituent Generation acceptance bars.** Verify each constituent's own Generation acceptance bar over its respective store: Provenance's six checks (entry attribution, single-origin, custody continuity, sequence-number order, archived-terminal, no mutation), and Audit Trail's six checks (all four audit questions answerable, all eight composition-level invariants verifiable, each constituent atom's GA bar satisfied, forensic window boundable, honest destruction distinguishable, composing patterns identifiable). The composition's invariants depend on the correctness of the constituents' invariants.

### Externally-clearable checks

These audit questions arise around this composition but cannot be answered from the composition's records alone:

- **Whether the `custodian_ref` corresponds to a real, authorized actor.** This composition records `custodian_ref` values in Provenance and binds each to a credential via Audit Trail's Actor Identity. It does not verify that the `custodian_ref` is the *correct* individual for the custody step (e.g., that the quality-release officer was authorized under the deployment's organizational policy to release batch X-91). That requires a Permissions instance scoped to custody-transfer authority — a composing peer, not a constituent of this composition.
- **Whether the `artifact_ref` corresponds to a real artifact in the host system.** This composition records `artifact_ref` as an opaque reference. It does not validate that the reference names a real, active artifact in the deployment's artifact registry. Verification requires the host system's artifact registry; this composition records the reference but cannot attest to its real-world meaning.
- **Whether the chain satisfies jurisdiction-specific requirements beyond the structural form.** This composition satisfies the structural form (attributed, continuous, sealed, retention-governed). Whether the specific actions taken, custodians involved, or retention periods meet a particular court's evidentiary standard (FRE 901(b)(9) authentication beyond structural continuity) or a specific agency's substantive requirements (FDA 21 CFR Part 211 predicate-rule content) requires court documentation, regulatory guidance, or inspector judgment. This composition provides the structural form; the substantive assessment is the external evaluator's.

---

## Edge cases and explicit non-goals

- **DAG-style multi-artifact custody and artifact splitting.** Inherited from Provenance as an explicit non-goal. W3C PROV (Provenance Data Model — W3C's directed-acyclic-graph representation of provenance with `wasDerivedFrom` and `wasGeneratedBy` relationships) `wasDerivedFrom` relationships — one artifact derived from or split into others — are out of scope. This composition is a linear single-artifact chain; custody continuity (Invariant 4) depends on the linearity. A pharmaceutical sample aliquoted into sub-samples requires separate chains, each with its own `originate_custody(genesis_type=received)` call; this composition records each independently.

- **Multi-party simultaneous custody.** Dual custody (two parties must jointly hold the artifact), escrow, and similar shared-custody arrangements are out of scope (inherited from Provenance). The composition's state machine has exactly one `current_custodian` at all times; Provenance Invariant 4 enforces this. Composing patterns that require dual-control gates (e.g., dual-key access to a controlled substance vault) must model joint custody above this composition.

- **Legal-hold suspension of purge over the custody chain.** When litigation or investigation requires suspension of normal purge over custody audit events, a Legal Hold pattern intercepts purge calls against the Audit Trail substrate's retention records. [Defensible Retention](./defensible-retention.md) composes Legal Hold + Retention Window + Audit Trail into the hold-blocks-purge surface; this composition does not absorb this concept. A deployment composing this composition + Defensible Retention gets both the custody-proof surface and the hold-blocks-purge gate over the custody audit events.

- **Right-to-erasure vs. retention obligation over custody chains.** A GDPR (EU General Data Protection Regulation — Europe's data-privacy law) Article 17 erasure request can collide with a regulatory retention obligation (FDA, DEA, FRE). This composition does not adjudicate; the Erasure Coordination composing pattern (with legal counsel in the loop) decides whether to honor, defer, or document the override. Inherited from the Audit Trail substrate's edge case.

- **Cross-store consistency under partial failure.** Every this composition custody action writes to Provenance first, then to Audit Trail, then updates `entry_to_event` (a derived index outside the atomicity surface — see Composition state). A failure after the Provenance write but before the Audit Trail write produces an orphan custody entry: a Provenance entry with no Audit Trail event. Provenance's entries are immutable once committed, so synchronous rollback is not available. The implementation must (a) retry the failed `AuditTrail.record_action` until it lands, (b) immediately surface the orphan to the compliance dashboard as a high-priority finding in the same outcome that returns `rejected(recording-failure)`, and (c) once the compensating Audit Trail event lands, populate `entry_to_event` and mark the event with `cascade_recovery = true` so an auditor can distinguish a clean custody step from a recovered one. Two legs complete the protocol (added 2026-06-11 with Invariant 4's safety + liveness restatement): **the reconciliation scan** — the same orphan enumeration (Provenance entries against audit events through the substrate's read surface), run at restart and on a fixed cadence — catches the *crash-orphan*, a process death between the two truth-bearing writes that leaves no returning outcome to surface the finding, bounding how long any orphan can remain unsurfaced; and **the deterministic-rejection arm** — where the audit write's failure is deterministic rather than transient (`invalid-credential` / `invalid-request`, per the uniform rejection-mapping rule), retrying the same call cannot land it, so the compensating `record_action` is re-attested under the deployment's declared `recovery_identity` (see Configuration), still marked `cascade_recovery = true` and naming the original custodian in `data`. The [Archive Custody] partial failure is the most consequential: an Archived chain without its terminal audit event is a deficiency in the custody-proof surface, though not a custody-gap finding (the Provenance `archived` entry still anchors the terminal disposition). Deployments under FDA 21 CFR Part 11 ALCOA and FRE 901(b)(9) exposure must treat any orphan custody entry as a hard alerting condition.

- **Pre-genesis external custody.** When a chain opens with `genesis_type = received`, the artifact had custody history outside this system before intake. This composition records custody only from the genesis entry forward; it makes no claim about pre-intake custody. Provenance Invariant 4 (custody continuity) applies *from genesis onward*, not before. Pre-intake provenance, where required, is a separate chain or an external record the host links via `metadata` at [Originate Custody].

- **Clock source.** Two `recorded_at` readings appear in this composition's records, and **this composition samples neither**. The Provenance entry's own `recorded_at` is stamped by Provenance from the wall-time reading injected at *that atom's* I/O seam when the entry is written (Provenance's *Wall-time is best-effort* rule and its own Logic-confinement note — the atom reads no clock inside its transition either). The `recorded_at = now` carried in each `AuditTrail.record_action` data payload is read from the Audit Trail substrate's clock authority at record time — an input *injected* by the substrate into the action at the seam, not a composition-internal nondeterministic sample; logic-confinement ([`execution-contract.md`](../execution-contract.md) §Logic Confinement Principle, rule 3) is preserved by delegating time acquisition to the constituent rather than reading a clock inside this composition's own transition, and no action signature carries a `now` parameter (the seam, not a parameter, is the contract for clock entry). This follows Immutable Transaction Ledger's *Clock source* and Resolve a Person's Data Rights' *Clock semantics* edge cases. Both readings are best-effort wall-time annotations; `sequence_number` is the authoritative order source (inherited from Provenance). For deployments where custodial timestamps have legal force (chain-of-custody timestamps in court proceedings, pharmaceutical distribution records under ALCOA), the implementation must source time from a trustworthy clock; a Trusted Timestamping composition (per RFC 3161 — the Internet standard for trusted time-stamping) provides the verifiable time anchor. Audit Trail's *Clock source for cadence and purge* edge case governs the seal-cadence and retention-purge clock — and, transitively, the host-injected reading the substrate supplies as `now`; this composition inherits it.

- **Concurrent transfer attempts.** Two callers simultaneously attempting [Transfer Custody] on the same chain must be serialized by the underlying implementation. The first write wins; the second observes an updated `current_custodian` and either succeeds (if the new holder is the intended recipient) or fails. The composition does not provide compare-and-swap semantics for conditional transfer; Provenance's *Concurrent transfer attempts* edge case governs. Implementations serializing on `chain_id` satisfy the requirement.

- **Seal cadence vs. custody-proof completeness.** Events in the Audit Trail's unsealed tail (between `sealed_through` and the current append point) are not yet covered by a seal; `attestation_verification` for those events returns `failed-verification(unsealed)` under strict mode, or `verified` under lenient mode. Under lenient mode, per-event Event Log immutability is accepted as sufficient until the next seal cadence. The `seal_cadence` configuration governs the window; tighter cadence gives stronger real-time tamper-detection. Deployments under ALCOA (pharmaceutical) or FRE 901(b)(9) (legal evidence) should use per-event or tight interval-based cadences. Inherited from Audit Trail's *Verification of the unsealed tail* edge case.

- **`custodian_ref` binding across rename.** If a deployment renames a custodian's reference (identity migration, staff change), Audit Trail's Actor Identity continues to verify attestations against the historical public material as long as that material is retained. This composition records the opaque `custodian_ref` as it was at the time of the action; a rename does not retroactively alter historical entries (Provenance Invariant 1 — entry immutability). The binding between the old `custodian_ref` and the real-world actor is externally clearable (see Generation acceptance).

- **Artifact `transform` without custody change — disclosure-scope accounting.** Provenance's `disclose` records only the custody-timeline fact that a disclosure occurred — to whom, at what point in the chain. What *subset* of the artifact's data was disclosed and under what authority is the [Selective Disclosure](../atoms/selective-disclosure.md) concept. This composition wraps Provenance's `disclose` faithfully; deployments requiring disclosure-scope accounting compose Selective Disclosure alongside this composition.

- **Retention of the Provenance chain vs. the custody audit events.** This composition's `audit_trail_retention_policy` governs the lifetime of the *custody audit events* (the attributed, sealed `record_action` entries), not the Provenance chain entries themselves. Provenance is append-only and retains its chain indefinitely from its own perspective — its spec names retention and defensible disposal as composing concepts. The consequence: when a custody audit event reaches its retention end and is lawfully purged via the Audit Trail cascade, the corresponding Provenance entry persists, and [Verify Custody] reports that entry's `attestation_verification = failed-verification(purged)` — lawful destruction of the attribution and seal, honestly distinguished from missing (Invariant 3). Defensible disposal of the Provenance chain *itself* — destroying the custody entries, not just their audit attribution — is a separate composing concept: a Retention Window / [Defensible Retention](./defensible-retention.md) instance applied to the Provenance chain directly. This composition does not absorb full-chain disposal; it governs the attributed audit layer and names chain disposal as the composing concept.

- **Auditing the custody-proof query itself.** [Verify Custody] is a pure read; it records no Audit Trail event. For high-assurance deployments that must also account for *who requested a custody proof and when* — an access-audit over the forensic-query surface — an access-logging composing pattern wraps this composition's read surface, mirroring how Audit Trail names attempted-but-not-committed actions as a Failed-Attempt Log composing concept rather than absorbing them. This composition's own audit surface is committed custody *actions*, not custody *queries*.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are: the six custody actions it exposes — the five custody-recording actions ([Originate Custody], [Transfer Custody], [Transform Custody], [Disclose Custody], [Archive Custody]) and the emergent verification ([Verify Custody]); the structure that verification returns ([Custody Proof]) with its custody-continuity replay ([Continuity Check]) and summary [Overall Verdict]; and the two verdict values ([Custody Proof Complete], [Custody Proof Incomplete]). Its load-bearing guarantee — every Provenance custody entry binds to an attributed, sealed, retention-governed Audit Trail event, so records-alone custody proof (continuity + attribution + tamper-evidence + retention) holds from origin to disposition (the custody-event ⇒ audit-event binding, Invariant 4) — is a structural property, not a datum. Its emergent state (`entry_to_event`) is a single derived index over the Audit Trail substrate, left as a backticked token; the chain lifecycle states (`Open` / `Archived`) are the Provenance constituent's, and its rejection taxonomy is entirely relayed (Provenance's `not-known` / `archived` / `already-archived` / `not-current-custodian` / `invalid-ref` / `invalid-genesis-type` / `invalid-descriptor`) or the uniform `recording-failure`, so none is carded. The custody audit event types (`custody.originated`, `custody.transferred`, `custody.transformed`, `custody.disclosed`, `custody.archived`) and the per-entry verification values (`verified`, `failed-verification(reason)`, `unverifiable(payload-not-supplied)`, and the continuity/failure classes `continuous`, `gap-detected`, `binding-gap`, `attestation-failed`, `retention-lapsed`, `seal-failed`, `payload-not-supplied`) stay backticked as wire values, as do the read passthrough (`read`), the constituent calls and their outcomes — Provenance's `originate` / `transfer` / `transform` / `disclose` / `archive` / `read`, Audit Trail's `record_action` / `verify_record` — the relayed constituent tokens (`chain_id`, `entry_id`, `event_id`, `artifact_ref`, `custodian_ref`, `from_custodian_ref`, `to_custodian_ref`, `recipient_ref`, `genesis_type`, `transformation_descriptor`, `credential`), the composition output fields left uncarded (`entries`, `chain_state`, `attestation_verification`, `retention_state`, `sequence_number`), the deployment configuration knobs (`audit_trail_retention_policy`, `seal_cadence`, `recovery_identity`), and concrete example ids. Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Originate Custody

The composition action that opens a new Provenance custody chain for an artifact under a genesis custodian, binding the genesis entry to an attributed Audit Trail event (`custody.originated`). Returns `{chain_id, entry_id, event_id}`; the genesis custodian's credential attests the artifact entered custody under their hand.

Kind: Operation

#### Transfer Custody

The composition action that records a hand-to-hand transfer to a new custodian. The **outgoing** custodian attests the release — `from_custodian_ref` is read from Provenance's chain state (unforgeable, Provenance Invariant 4) and bound as the actor on the `custody.transferred` event; the incoming custodian attests their own later actions.

Kind: Operation

#### Transform Custody

The composition action recording a transformation of the artifact by the *current* custodian (Provenance enforces holder-only), bound to an attributed `custody.transformed` event.

Kind: Operation

#### Disclose Custody

The composition action recording a disclosure of the artifact by the current custodian to a named recipient — custody is *not* transferred — bound to an attributed `custody.disclosed` event.

Kind: Operation

#### Archive Custody

The composition action recording the terminal disposition by the current custodian and transitioning the chain to Archived — no further entries are accepted — bound to an attributed `custody.archived` event.

Kind: Operation

#### Verify Custody

The composition's emergent verification: construct the records-alone [Custody Proof] for a chain by replaying Provenance continuity ([Continuity Check]) and, for each entry, verifying its bound Audit Trail event's attestation, seal, and retention. Neither constituent can answer it alone; the caller presents the original event payloads (Audit Trail's verification asymmetry).

Kind: Operation

#### Custody Proof

The structured artifact [Verify Custody] returns: the chain's state, its [Continuity Check] result, an ordered per-entry sequence of attestation / seal / retention verifications, and a summary [Overall Verdict]. The records-alone proof of unbroken + attributed + tamper-evident + retention-governed custody that neither Provenance nor Audit Trail provides alone.

Kind: Type
Role: the records-alone custody proof

#### Continuity Check

The [Custody Proof] field carrying the result of replaying the Provenance entries in order and confirming every transfer's `from_custodian_ref` equals the custodian in effect immediately before it (Provenance Invariant 4, replayed on demand): `continuous`, or `gap-detected` naming the entry and the mismatch.

Kind:      Field
Field of:  the custody proof
Role:      the custody-continuity result
Projects:  continuity_check

#### Overall Verdict

The [Custody Proof]'s summary field: [Custody Proof Complete] when continuity holds, every entry is bound, and every supplied verification passes (or is lawful destruction), else [Custody Proof Incomplete] naming the specific failure classes.

Kind:      Field
Field of:  the custody proof
Role:      the summary verdict
Projects:  overall_verdict

#### Custody Proof Complete

The [Overall Verdict] value when the chain's continuity is unbroken, every entry has its audit-event binding, and every supplied attestation verifies (or is a lawful `failed-verification(purged)`) — the full custody is proven from the records alone.

Kind:      Member
Member of: the overall verdict
Role:      Verdict
Projects:  custody-proof-complete

#### Custody Proof Incomplete

The [Overall Verdict] value when at least one failure class applies (a continuity gap, a binding gap, a failed or lapsed attestation, a seal failure, or a not-supplied payload) — the proof is not fully self-proving, and the verdict names why.

Kind:      Member
Member of: the overall verdict
Role:      Verdict
Projects:  custody-proof-incomplete

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Originate Custody]: #originate-custody
[Transfer Custody]: #transfer-custody
[Transform Custody]: #transform-custody
[Disclose Custody]: #disclose-custody
[Archive Custody]: #archive-custody
[Verify Custody]: #verify-custody
[Custody Proof]: #custody-proof
[Continuity Check]: #continuity-check
[Overall Verdict]: #overall-verdict
[Custody Proof Complete]: #custody-proof-complete
[Custody Proof Incomplete]: #custody-proof-incomplete

---

## Standards references

This composition is the structural form of the chain-of-custody requirement across its canonical domains:

- **FDA 21 CFR Part 211 (Current Good Manufacturing Practice — Finished Pharmaceuticals)** — requires an unbroken, attributed, tamper-protected, retention-compliant chain of custody from manufacture through distribution for drug substances and products. The composition's [Originate Custody] → [Transfer Custody] → [Archive Custody] sequence, with per-entry attribution and seal via the Audit Trail substrate, is the operational form of Part 211's custodial recording requirement. The ALCOA / ALCOA+ (Attributable, Contemporaneous, Original, Accurate, plus Complete, Consistent, Enduring, Available) principles are all satisfied simultaneously by the four-atom stack inside the Audit Trail substrate, applied to every custody entry.

- **DEA 21 CFR Part 1304 (Controlled Substance Inventory Records)** — requires complete, accurate records of every change of custody of a controlled substance. Invariant 1 (attributed custody) and Invariant 5 (records-alone custody proof) are the structural implementation of this requirement at every transfer step.

- **Federal Rules of Evidence 901(b)(9) (Authenticating or Identifying Evidence — Process or System)** — the US evidentiary rule for authenticating physical or electronic evidence via chain-of-custody records. The composition's [Verify Custody] result — `continuity_check = continuous` plus per-entry `attestation_verification = verified` — is the structural form of the unbroken, attributed chain courts require for authentication. Invariant 4 (custody continuity) and Invariant 1 (attributed custody) are the rebuttal to authentication challenges.

- **ISO 23081 (Information and documentation — Managing metadata for records)** — the ISO (International Organization for Standardization) standard on records-management metadata. The composition's custody entries map directly to the origin, transfer, transformation, and disclosure metadata elements ISO 23081 specifies; the Audit Trail attribution and retention satisfy ISO 23081's authenticity and retention obligations.

- **W3C PROV (Provenance Data Model — W3C's RDF (Resource Description Framework)-based standard for representing provenance as a directed acyclic graph)** — this composition implements the linear single-entity spine of a W3C PROV graph: the `wasGeneratedBy`, `used`, and `wasAttributedTo` relationships along a single entity's chain. The deliberate non-goal of `wasDerivedFrom` (DAG derivation) and artifact splitting are explicitly out of scope relative to the full PROV model.

- **SEC Rule 17a-4 (Records to be preserved by certain exchange members, brokers, and dealers)** — requires broker-dealer records (including custody records for financial instruments) to be preserved in a non-rewriteable, non-erasable format. The Audit Trail substrate's Tamper Evidence (Invariant 2) satisfies the integrity requirement; the configured `audit_trail_retention_policy` satisfies the lifetime requirement.

this composition inherits the broader standards compliance of its constituents:

- Through **Audit Trail** (and its transitive atoms): SOX (Sarbanes-Oxley Act) §802 record retention, HIPAA (Health Insurance Portability and Accountability Act) §164.312(b) audit controls, PCI DSS (Payment Card Industry Data Security Standard) Requirement 10, 21 CFR Part 11 electronic records, ISO/IEC 27001 §A.12.4 logging and monitoring, GDPR Articles 30 and 32, and the full Audit Trail standards inheritance. Deployments composing this composition for pharmaceutical or legal-evidence purposes receive these as the substrate's contribution; they are framed as inherited, not as this composition's own primary standards anchors.

- Through **Provenance**: ISO 23081, W3C PROV, FDA 21 CFR Part 211, DEA 21 CFR Part 1304, FRE 901(b)(9), and SEC Rule 17a-4 at the structural custody-chain layer. This composition lifts these to the full attributed+sealed+retention-governed form those standards actually require but that Provenance alone cannot satisfy.

---

## Status

`grounded on Final Critique 4 — 2026-06-11` (English grounded 2026-06-04; coverage GAP closed 2026-06-11 — the TLA+ model [`chain-of-custody.tla`](./chain-of-custody.tla) + buggy twin verified in `tools/harness/` now cover **both arms** of Invariant 4, the atomic commit and the compensated partial failure; see the coverage matrix and Lineage §Formal model). Sonnet-drafted against an Opus architectural plan, then Opus-gated through Pass 1 (GRID structural), Pass 2 (EOS conceptual independence — substrate convention holds; no over-absorption), Pass 3 (Linus adversarial), and a Final Critique round: two foundational findings and three refining findings, all closed in-pattern (see Lineage notes). Regulated-pattern conventions (Regulated adversarial scenarios; Generation acceptance with the two-subsection split) baked in from the first draft, inherited from the methodology directly per [`pressure-testing.md`](../pressure-testing.md) §Regulated-pattern conventions. The formal-layer vote was YES; the derived TLA+ model verifies green with a buggy twin the checker rejects, and the English cleared the 92%-good threshold (foundational findings at zero). The 2026-06-10 coverage cross-check surfaced the original model's atomic-commit idealization as an uncovered GAP on Invariant 4's compensated arm (the Invariant-4 coverage-gap finding, recorded in [`../tools/harness/coverage/chain-of-custody.md`](../tools/harness/coverage/chain-of-custody.md)); the 2026-06-11 touch-triggered round closed it — Invariant 4 restated as safety + liveness, the model revised to sequential-with-compensation covering both arms (16 states, all invariants hold; twin rejected at 2 states), `entry_to_event` reclassified as a derived index outside the atomicity surface, and the `recovery_identity` configuration declared. First composition to compose the Provenance atom; the cross-domain pharma↔legal-evidence custody reference case.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Regulated composition. The two regulated-overlay conventions — *Regulated adversarial scenarios* and *Generation acceptance* (with the Audit-Trail-traversal-clearable / externally-clearable split, established in Multi-Party Approval's Round 3 and applied retroactively) — are **inherited from the methodology directly** ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft, not re-derived from predecessor patterns. [Customer Onboarding](./customer-onboarding.md) and [Defensible Retention](./defensible-retention.md) are the primary structural references for the substrate-composition shape, the two-subsection Generation acceptance split, and the cross-store-consistency-under-partial-failure treatment.

**Structural milestone.** This composition retires the `Chain of Custody *(forthcoming)*` forthcoming-link in [`atoms/provenance.md`](../atoms/provenance.md)'s Edge cases and Composition notes — specifically the entry: *"The full chain-of-custody surface. The complete chain-of-custody guarantee — attribution (non-repudiable custodians via Actor Identity), structural continuity (this atom), tamper-evidence (Tamper Evidence), and retention (Retention Window / Defensible Retention) — is the Chain of Custody composition *(forthcoming)*."* When this composition grounds, that forthcoming-link is resolved. This composition is also the cross-domain reference case: it grounds the thesis that pharmaceutical chain of custody (FDA 21 CFR Part 211, DEA 21 CFR Part 1304) and legal-evidence chain of custody (FRE 901(b)(9)) are the same structure — one composition serves both.

**Opus-led gating review — 2026-06-04 (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus + Final Critique).** Sonnet drafted against the Opus plan; Opus gated. Two foundational findings and three refining findings, all closed in-pattern:

- *F1 — `verify_custody` hid the verification payload — foundational (Pass 3).* The signature was `verify_custody(chain_id)` while its own steps required the caller to supply the original event payloads for the seal check — the same verification-asymmetry contradiction Audit Trail fixed in its Round 3. → `original_event_payloads` is now an explicit required argument; entries whose payload is not supplied report `attestation_verification = unverifiable(payload-not-supplied)` (partial proof, not failure) and the verdict names them. The asymmetry is visible at the API boundary.
- *F3 — continuity check compared the wrong predecessor — foundational (Pass 3).* `continuity_check` said a transfer's `from_custodian_ref` must equal the `to_custodian_ref` of the *immediately preceding entry* — wrong when a `transformed`/`disclosed` entry (by the same holder) intervenes between two transfers. → Restated as a current-custodian cursor carried through non-transfer entries: a transfer's `from` equals the `to` of the most recent *preceding transfer* (or the genesis custodian) — exactly Provenance Invariant 4. The Generation-acceptance check already used the correct form.
- *F2 — unreachable `invalid-credential` in signatures — refining (Pass 3).* All five custody actions listed `invalid-credential` as a returnable code, but Provenance writes first in every action and the only Actor Identity surface is the transitive post-write one, so credential invalidity always collapses to `recording-failure` + an orphan. → Removed `invalid-credential` from the five signatures; the uniform mapping rule now states explicitly why it is unreachable as a clean rejection.
- *F4 — chain-vs-audit retention asymmetry — refining (Pass 3).* The retention story governed the audit events but did not address that Provenance entries persist after their audit events are lawfully purged. → New edge case: this composition's retention governs the attributed audit layer; defensible disposal of the Provenance chain itself composes Retention Window / Defensible Retention over the chain directly. Reconciles with Invariant 3's honest-disposal claim.
- *F5 — auditing the query itself — refining (Pass 3).* → New edge case naming an access-log composing pattern over the `verify_custody` read surface; this composition's own audit surface is committed custody actions, not queries (mirrors Audit Trail).

Pass 1 GRID clean (all composition sections present; reference graph intact — Provenance, Audit Trail, Defensible Retention, Customer Onboarding, Selective Disclosure all exist). Pass 2 EOS clean: the substrate convention keeps Actor Identity / Tamper Evidence / Retention Window transitive (not re-listed); Permissions (who may transfer), Legal Hold, Selective Disclosure (disclosure scope), and Erasure Coordination are correctly externalized — no over-absorption survives. The English clears the 92%-good threshold (foundational findings at zero); the TLA+ binding-atomicity model is the remaining grounding prerequisite per the YES vote.

**Formal-layer vote: YES (model pending).** The load-bearing **binding bijection / no-dangling-partial atomicity** (Invariant 4) — the claim that the Provenance custody-entry write and the Audit Trail `record_action` write are committed atomically or compensated, leaving no reachable state with a custody entry lacking its attributed audit event — is an ordering/atomicity claim across two stores. This is a TLA+ (Temporal Logic of Actions — a formal specification language for concurrent and distributed systems)-class claim: the correct model performs the Provenance write and Audit Trail write as a single atomic action; the buggy twin performs them as two separate, interleavable sub-steps with no compensation, leaving a reachable state where a custody entry exists without its `entry_to_event` binding and its Audit Trail event. This mirrors `audit-trail.tla`'s correct/buggy pair (which demonstrated the same atomicity requirement for cascade-on-purge across four stores). The TLA+ model is pending; Opus authors it during gating. Until the model is authored and verifies, the pattern remains `draft` (it will clear to `grounded (English) — formal layer pending` when the prose passes are complete, and to `grounded` when the formal model lands and verifies). Findings from the formal model flow back into this English spec per the conflict protocol in [`pressure-testing.md`](../pressure-testing.md) §Formal models. *(Superseded 2026-06-04: the prose passes cleared and the TLA+ model landed and verifies — see the entry immediately below; this paragraph is preserved as the record of the vote as cast.)*

**Formal model — 2026-06-04: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`chain-of-custody.tla`](./chain-of-custody.tla) with config [`chain-of-custody.cfg`](./chain-of-custody.cfg), checked via `tools/harness/check.mjs` (the repo's `tla-checker` WASM checker). *What it checks:* per custody entry, three sub-writes — `provState` (Provenance custody entry), `auditState` (Audit Trail `record_action` event), `bound` (the `entry_to_event` binding). Three composition-level safety invariants under every interleaving: the load-bearing **Invariant 4** (`Inv4_BindingBijection` — every entry is in one of two coherent configurations, uncreated or fully-committed; never a dangling partial), `Inv4_NoDanglingProv` (a Provenance entry implies its audit event and binding), and `Inv4_NoOrphanAudit` (a custody audit event implies its Provenance entry). The CORRECT model performs the three sub-writes as a single atomic action (the single-transaction form Invariant 4 permits); 4 reachable states, all invariants hold. *Bounds/saturation:* `Entries = {e1, e2}`; the property is per-entry local (each entry independently uncreated→committed), insensitive to entry count — `Entries = {e1, e2, e3}` holds at 8 states with no new behavior; the verification value lives in the buggy twin, exactly as in `audit-trail.tla`. *Buggy twin:* [`chain-of-custody-buggy.tla`](./chain-of-custody-buggy.tla) splits the commit into three separate, interleavable sub-steps (`WriteProv` → `WriteAudit` → `Bind`) with no compensation — the naive implementation the *Cross-store consistency under partial failure* edge case warns against. TLC stops after `WriteProv(e)` alone: `provState = present, auditState = absent, bound = FALSE` — a dangling Provenance custody entry with no attributed audit event. The checker rejects it at 2 states on `Inv4_BindingBijection`. This is the model's load-bearing contribution: it demonstrates mechanically that the atomicity (or compensation) in Invariant 4 is required, not decorative — a non-atomic custody commit is reachably unsafe, leaving an unattributed custody entry. *Conflict-protocol outcome:* none — the model corroborates the English; the spec already requires "committed atomically or compensated," which is exactly the correct/buggy distinction. Canonical English unchanged. Reproduce: `cd tools/harness && node check.mjs ../../compositions/chain-of-custody.tla` (and `… chain-of-custody-buggy.tla --buggy`). *(Superseded 2026-06-11: the model described here verified only Invariant 4's atomic-commit arm — see the coverage cross-check finding and the revision entry immediately below; this paragraph is preserved as the record of the model as first landed.)*

**Formal model — 2026-06-11: revised to cover Invariant 4's compensated arm; coverage GAP closed; pattern returns to `grounded`.** Touch-triggered round riding the 2026-06-10 coverage cross-check finding (matrix: [`../tools/harness/coverage/chain-of-custody.md`](../tools/harness/coverage/chain-of-custody.md)). *What was wrong:* the 2026-06-04 model committed three sub-writes as one atomic action — an idealization over a design whose own *Cross-store consistency under partial failure* edge case mandates sequential-with-compensation (Provenance writes first, irreversibly; synchronous rollback unavailable) — so the spec-mandated compensated path was unmodeled; the model's third sub-write also placed the `entry_to_event` binding inside the atomicity surface, in tension with its derived-index classification. *The revision* (template: [`immutable-transaction-ledger.tla`](./immutable-transaction-ledger.tla), the compensated-arm closure): per entry, two truth-bearing sub-writes — `provState` (absent | present) and `auditState` (absent | clean | recovered) — plus `surfaced` (the compliance finding); three actions — `CommitClean` (the transactional-boundary form), `FailPartial` (the reachable, surfaced orphan: the Provenance write lands, the audit write fails, the orphan is durable and visible), and `RetryAudit` (the compensation, marked `cascade_recovery`, enabled in exactly the orphan configuration so no orphan state is a dead end). Four safety invariants checked: `Inv4_SafetyBijection` (every reachable configuration is coherent or a *surfaced* orphan-under-compensation), `Inv4_NoUnsurfacedOrphan`, `Inv4_NoOrphanAudit`, and `Inv4_RecoveryDistinguishable` (clean bindings never surfaced a finding; recovered bindings always did). Liveness — *Orphan(e) ↝ Bound(e)* — is canonical in the English (Invariant 4's liveness arm); the model discharges its enabledness half. The `entry_to_event` derived index is omitted from the model per [`execution-contract.md`](../execution-contract.md) §Composition state, obligation 2. *Spec-side changes in the same round:* Invariant 4 restated as safety + liveness; the partial-failure edge case gained the reconciliation-scan leg (crash-orphans) and the deterministic-rejection recovery-attestation leg; `recovery_identity` added to Configuration (the deployment-declared identity attesting compensating events — capability provenance: a deployment-declared configuration capability); Composition state reclassifies `entry_to_event` as a derived index with its named rebuild procedure (enumerate audit events by `data.entry_id`). *Harness:* correct model — 16 states, all invariants hold; buggy twin ([`chain-of-custody-buggy.tla`](./chain-of-custody-buggy.tla), sequential-without-compensation: the silent orphan, no surfacing, no retry) — rejected at 2 states on `Inv4_SafetyBijection`. *Bounds/saturation:* `Entries = {e1, e2}` → 16 states; `{e1, e2, e3}` → 64 (the 4ⁿ per-entry-independence form, matching the Immutable Transaction Ledger precedent), all invariants hold → saturated. *Conflict-protocol outcome:* case 2 — the English was right and the derivation under-covered it; the model was extended, and the English sharpening (the safety/liveness split) states what "committed atomically or compensated" already meant, changing no behavior. Reproduce: `cd tools/harness && node check.mjs ../../compositions/chain-of-custody.tla` (and `… chain-of-custody-buggy.tla --buggy`).

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed (the invariant count held at six). (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added after Edge cases (11 terms, full four-kind): 6 Operations — the five custody-recording actions ([Originate Custody], [Transfer Custody], [Transform Custody], [Disclose Custody], [Archive Custody]) and the emergent verification ([Verify Custody]); 1 Type — the [Custody Proof] structure; 2 Fields — its [Continuity Check] and summary [Overall Verdict]; and 2 Members — the verdict values ([Custody Proof Complete], [Custody Proof Incomplete]). Every own-action prose reference is linked; the `#### \`name\`` signature headings (restored) with their fenced contract blocks and example calls stay backticked; the verdict Members are enum values, so their concept references are linked at representative homes while wire forms stay backticked. **No own rejection cards:** the rejection taxonomy is entirely relayed from Provenance (`not-known`, `archived`, `already-archived`, `not-current-custodian`, `invalid-ref`, `invalid-genesis-type`, `invalid-descriptor`) or the uniform `recording-failure`, so all stay backticked. The chain lifecycle states (`Open` / `Archived`) are the Provenance constituent's and are not carded. *One representational tidy:* the fenced signatures' optional-argument notation `[metadata]` / `[query]` was normalized to `metadata?` / `query?` — identical meaning (an optional argument), which also keeps the bracket from being read as a `[Term]` marker inside the fenced block. Survivors left backticked: the signature headings and example calls; the custody audit event types (`custody.originated`, `custody.transferred`, `custody.transformed`, `custody.disclosed`, `custody.archived`); the read passthrough (`read`) and the per-entry verification / continuity values (`verified`, `failed-verification(reason)`, `unverifiable(payload-not-supplied)`, `continuous`, `gap-detected`, `binding-gap`); every qualified constituent call (Provenance's `originate` / `transfer` / `transform` / `disclose` / `archive` / `read`, Audit Trail's `record_action` / `verify_record`) and their outcomes; the composition output fields left uncarded (`entries`, `chain_state`, `attestation_verification`, `retention_state`); the relayed constituent tokens and configuration knobs; and concrete example ids. Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent); it was already three paragraphs, moved as-is (cut #1 already satisfied); the descriptive top blockquote folded out after confirming each claim (the Provenance + Audit-Trail-substrate wiring; the custody-event ⇒ audit-event binding; records-alone custody proof; the cross-domain thesis) is carried by Summary / Intent / Composes / the load-bearing wiring decision; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #5 — skipped (with reason):** the composition owns no emergent state machine — the chain lifecycle (Open → Archived) is the Provenance constituent's, and the composition's own logic is the uniform custody-event → audit-event binding already stated crisply in Action wiring and the load-bearing decision. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-11`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (11 terms); six composition-level invariants preserved; the `.tla` models untouched — harness re-run green: `chain-of-custody.tla` PASS + `chain-of-custody-buggy.tla --buggy` rejected.

</details>
