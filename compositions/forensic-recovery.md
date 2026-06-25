---
title: Forensic Recovery
parent: Compositions
nav_order: 18
has_toc: true
toc: true
---

# Forensic Recovery

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A regulated composition: soft deletion made forensically complete. Every delete, restore, and purge action against a record is attributed (the acting actor verified via credential), tamper-evident (the Audit Trail substrate seals each event), and retention-governed (the audit events are placed under retention). The composition's headline emergent guarantee is **full ordered lifecycle history recoverability**: a single forensic read action, `recover_history`, reconstructs the complete delete/restore/purge history of any record from the Audit Trail event stream — including prior epochs that Soft Delete's current-state-only summary overwrites — proving, from the records alone, that no record was purged without an auditable record naming who purged it, when, and under what stated authority. Neither Soft Delete (no tamper-evidence, current-state attribution only) nor Audit Trail (no lifecycle-continuity model) provides this guarantee alone; the composition's lifecycle-transition ⇒ audit-event binding is what makes it emergent.

---

## Intent

A record's destruction lifecycle carries two distinct obligations that neither Soft Delete nor an audit substrate satisfies alone. The first is *lifecycle faithfulness*: every step of the Active → Deleted → Purged path — including every restore that returns a record to Active — is individually attributed to a named, verifiable actor, placed in an immutable event stream in the order it occurred, and sealed against post-hoc modification. The second is *full-history recoverability*: given any `record_id`, an investigator must be able to reconstruct the complete ordered sequence of what happened to that record — all the deletes, all the restores, the final purge — not just a snapshot of the most recent state.

Soft Delete provides a lifecycle state machine and current-state attribution: who most recently deleted the record, who most recently restored it, and who purged it. This is a deliberate design choice — Soft Delete is a freestanding (specifiable without naming any other pattern) atom, and retaining a full ordered history would absorb the Event Log concept, breaking that freestanding status. The atom's Behavior section is explicit: "The atom retains only the most recent attribution in each category; the full cycle history requires Event Log composition." The atom's Edge cases name the gap precisely: *"full history of all cycles requires composition with Event Log."* The composition is exactly where that gap is filled.

Audit Trail provides attribution, tamper-evidence, and retention governance for events it is explicitly told about, but it does not know what a deletion lifecycle is. It does not know that a `record_action` labeled `record.soft_deleted` must be followed (eventually) by either `record.restored` or `record.purged` for the same `record_id`. It cannot reconstruct the lifecycle of a specific record across multiple events without a binding structure that names which events belong to which record's lifecycle. The composition provides that binding via its emergent composition state — `record_to_events`, the ordered map from `record_id` to the sequence of Audit Trail `event_id`s for that record's lifecycle transitions.

The load-bearing emergent guarantee this composition exists to enforce is: **no record reaches Purged without an attributed, tamper-evident Audit Trail event naming who purged it, when, and under what stated reason — and the full ordered history of every prior lifecycle transition is recoverable from the same event stream.** The `recover_history` action is the forensic read surface: it walks `record_to_events[record_id]`, returns every transition in order, and calls `AuditTrail.verify_record` on each event to produce a verified, seal-confirmed, retention-governed history with no gaps.

One boundary this composition does not cross is critical to name in Intent: **this composition does not gate purge eligibility.** It does not check whether a Legal Hold is active, whether the Retention Window has elapsed, or whether any other governance condition permits destruction. That gate belongs to [Defensible Retention](./defensible-retention.md), and absorbing it here would duplicate Defensible Retention's hold-blocks-purge logic — the defining emergent invariant of a separate composition. This composition is the *forensic attribution* composition: it records every lifecycle transition faithfully, makes each attributed and tamper-evident, and makes the full history recoverable. Whether a given purge was *permissible* — whether the actor had authority, whether the hold check was clear — is the composing peer's (Defensible Retention's) question. An auditor using this composition can determine *what happened and to whom*, and can verify the records' integrity; whether *what happened was authorized* requires Defensible Retention's records (the hold-check audit events) and external evidence (the Permissions registry). This composition names this boundary explicitly in each relevant section rather than silently absorbing a responsibility that belongs elsewhere.

This is a composition, not a new primitive. Soft Delete and Audit Trail are unchanged. The composition is the wiring that makes them coherent as a single forensic-deletion surface. It introduces two emergent actions — `recover_history` and the three lifecycle-wrapping actions `delete_record`, `restore_record`, `purge_record` — that belong to neither constituent alone and exist only because the two are wired together. `recover_history` in particular belongs to neither alone: Soft Delete can return the current-state summary, but it cannot return the full ordered history because it discards prior epochs; Audit Trail can return all events matching a query, but it cannot identify which events constitute a deletion lifecycle for a specific record without `record_to_events`. The composition is the layer that answers: *what is the complete attributed, sealed, historically-ordered deletion lifecycle of this record?*

---

## Composes

- **[Soft Delete](../atoms/soft-delete.md)** — the recoverable-destruction lifecycle. Supplies the Active → Deleted → Purged state machine (with the Deleted → Active restoration path), the current-state attribution fields (`deleted_by`, `restored_by`, `purged_by`), and the structural requirement that a record pass through Deleted before Purge. The composition calls `soft_delete`, `restore`, `purge`, and `read`. Soft Delete's current-state attribution and lifecycle enforcement are the subject-scoped foundation; the composition does not re-derive the three-state machine but adds full-history recoverability, tamper-evidence, and attribution verification to each transition via the Audit Trail substrate wiring.

- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every lifecycle action the composition exposes records here as one `AuditTrail.record_action` call, producing an Event Log entry (append-only, totally ordered), an Actor Identity attestation (binding the acting actor's `actor_ref` to a verified credential), a Retention Window record (for the audit event), and a Tamper Evidence seal per the configured cadence. The composition maintains exactly one Audit Trail instance configured with the host's regulatory retention policy for the lifecycle audit events. **Actor Identity, Tamper Evidence, Retention Window (for audit events), and Event Log are reached transitively through Audit Trail** — the composition does not maintain separate instances of those four atoms at this layer. The Audit Trail's `record_action` is the mechanism by which each lifecycle transition receives an attributed, sealed, retention-governed audit event, closing the gap Soft Delete's multiple-cycle attribution Edge case named: *"full history of all cycles requires composition with Event Log"* and *"Actor Identity provides cryptographic attestation."*

The Event Log, Actor Identity, Retention Window (for audit events), and Tamper Evidence atoms are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms at this layer. This follows the *Compositions of compositions* convention (see [`spec-format.md`](../spec-format.md) §Compositions of compositions): naming Audit Trail as the substrate is what satisfies the Actor Identity, Tamper Evidence, and Retention Window requirement — they are reached transitively, not maintained as separate instances at this composition layer.

---

## Composition logic

### Composition state

The composition owns one piece of emergent state that wires the two constituents into a forensically complete, records-alone-defensible lifecycle-history surface:

- **`record_to_events`** — map from `record_id` to the *ordered list* of Audit Trail `event_id`s for that record's lifecycle transitions, in the order those transitions were committed. This is the forensic backbone: the complete ordered, attributed, sealed lifecycle history that Soft Delete's current-state summary cannot provide. Each entry in the list corresponds to exactly one successful `delete_record`, `restore_record`, or `purge_record` call — one lifecycle transition, one Audit Trail event, one binding. **Contract classification: derived index** ([`execution-contract.md`](../execution-contract.md) §Composition state; reclassified 2026-06-11, closing part of finding MC-C3-1). Every fact in the map is reconstructible from constituent stores — the named rebuild procedure enumerates the Audit Trail substrate's events whose `action_ref` is one of `record.soft_deleted` / `record.restored` / `record.purged`, groups them by `data.record_id` (every this composition lifecycle `record_action` carries `record_id` in its data payload), and orders each group by the Event Log's total order (Event Log Invariant 3), which is exactly transition-commit order. The Contract's obligations follow: the map sits **outside the per-action atomicity surface** — the truth-bearing atomicity obligation (Invariant 4) binds the Soft Delete transition and the audit event, and the list-append, occurring only after both writes succeed, is *evidence* that obligation was met, never a peer write whose failure the compensation protocol must handle; a missing or lost entry is a **rebuild trigger, not data loss** — reads consult the index with rebuild-on-miss semantics, and a transition that still lacks an audit event after rebuild is the real orphan (Invariant 4's surfaced finding); and the map claims no cross-constituent transactional consistency. The list is append-only: entries are never removed and never reordered after insertion. A committed transition whose rebuild yields no audit event is the partial-failure orphan surfaced per the *Cross-store consistency under partial failure* edge case; an `event_id` in any list that does not carry a `data.record_id` pointing back to the same record is a structural finding (Invariant 4's inverse orphan — unreachable through this composition's wiring).

The Soft Delete store state (lifecycle records, current attribution, state for each `record_id`) and the Audit Trail substrate state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) are owned by their respective constituent instances. The composition does not duplicate them; it indexes into them via `record_to_events`.

### Configuration

- **`audit_trail_retention_policy`** — the policy reference (or content-derived policy selector) configured on this composition's single Audit Trail instance, governing the lifetime of the lifecycle audit events (the `record_action` entries in the Event Log, not the Soft Delete lifecycle records themselves). This is set once on the Audit Trail instance; Audit Trail's `record_action` takes no per-call retention argument — every this composition lifecycle-audit event inherits this configured policy. The audit record should persist at least as long as the Soft Delete lifecycle record it describes, and typically longer for regulatory defensibility after the lifecycle record's last transition. For deployments under GDPR (EU General Data Protection Regulation) Article 17 erasure obligations, the configured policy must account for the meta-question of retaining the *audit record* of an erasure (see *Right-to-erasure vs. retention of audit events* in Edge cases). For HIPAA (Health Insurance Portability and Accountability Act) §164.312(b) audit-controls deployments, the policy must encode the applicable minimum audit-record retention period.

- **`seal_cadence`** — inherited from the Audit Trail substrate's configuration (`per-event`, `interval-based`, or `on-demand`). For regulated deletion-lifecycle deployments, per-event or tight interval-based cadences are recommended: every lifecycle event should be covered by a seal as promptly as possible because the unsealed tail is the window during which tampering is structurally undetectable at verification time. GDPR Article 17 erasure proof, HIPAA §164.310(d)(2) disposal records, and FRCP (Federal Rules of Civil Procedure) Rule 37(e) spoliation-defense audit trails all benefit from a narrow unsealed-tail window. The deployer configures `seal_cadence` on the Audit Trail instance; this composition does not impose an override.

- **`recovery_identity`** — a deployment-provisioned `actor_ref` + `credential` pair under which a *compensating* `AuditTrail.record_action` is attested when the original actor's credential is deterministically rejected (`invalid-credential` / `invalid-request`, first detectable only after the Soft Delete write — see the uniform rejection-mapping rule and the *Cross-store consistency under partial failure* edge case). Retrying the original call cannot land a deterministic rejection, so the compensation re-attests under this identity; events so attested carry `cascade_recovery = true` and name the original `actor_ref` in `data`, keeping attribution honest — the record shows which operational identity attested the compensation and which actor performed the lifecycle action. Mirrors the composition-actor convention established in Multi-Party Approval's Configuration. A deployment that wires a credential pre-check above this composition (per the uniform mapping rule) may never exercise this identity; it must still be declared wherever the deterministic-rejection arm is reachable. *(Added 2026-06-11 with the Invariant 4 safety + liveness restatement — the liveness arm's deterministic-rejection leg rests on this declared capability.)*

- **`permissions_scope_prefix`** — optional. When a Permissions composing pattern is wired above this composition, this prefix defines the scope names expected by that pattern: `forensic:delete`, `forensic:restore`, `forensic:purge`, `forensic:read`. The composition does not enforce Permissions directly; the deployment wires Permissions checks at the calling layer using these scope names. When `permissions_scope_prefix` is absent, no Permissions gate is applied (the composition records whoever calls it; eligibility and authority are externally clearable). See *Access control* in Edge cases for the treatment of authority vs. execution.

### Primitive policies

The composition takes string-typed inputs at its action boundaries; each is validated either at this layer or by a constituent.

- **`record_id`** — opaque byte-identity as established in Soft Delete's identity model. Must contain at least one non-whitespace character (Soft Delete's requirement). The composition validates before any constituent call; empty or whitespace-only → `rejected(invalid-request)`. The composition does not case-fold, normalize, or trim; `record_id` equality is opaque byte-identity.
- **`actor_ref`** — opaque reference to the actor performing the lifecycle action. Must contain at least one non-whitespace character. Validated at this composition layer before any constituent call; empty or whitespace-only → `rejected(invalid-request)`. The same `actor_ref` value is passed as `actor_ref` to `AuditTrail.record_action` and as the relevant attribution field (`deleted_by`, `restored_by`, `purged_by`) in the constituent `SoftDelete` call.
- **`credential`** — opaque credential material consumed only by `AuditTrail.record_action` (specifically by Actor Identity inside the substrate). The composition does not inspect it; the substrate's Actor Identity validates it at the audit write. Because Soft Delete writes first in all lifecycle actions and the only Actor Identity surface is the transitive post-write one inside the Audit Trail `record_action`, credential invalidity always manifests as `rejected(recording-failure)` plus an orphan at the composition boundary rather than as a clean pre-state rejection. See *Uniform `record_action` rejection-mapping rule* below.
- **`reason`** — required on `purge_record` (any non-empty string with at least one non-whitespace character, per Soft Delete's requirement on `purge`); optional on `delete_record` and `restore_record`. Empty or whitespace-only `reason` on `purge_record` → `rejected(invalid-request)` before any constituent call. When present on `delete_record` or `restore_record`, passed through to the respective Soft Delete action; no additional composition-layer validation.
- **`event_id`** — opaque, system-generated by Audit Trail's Event Log. Returned in action results; stored as elements in `record_to_events` lists. Byte-identity equality as a map value and list element; never normalized.

**Uniform `record_action` rejection-mapping rule.** For every `AuditTrail.record_action` call in the action wiring below, the substrate's rejection taxonomy (`invalid-credential | invalid-request | recording-failure`) is mapped uniformly: because Soft Delete writes first in all this composition lifecycle actions and the only Actor Identity surface is the transitive post-Soft-Delete-write one inside the Audit Trail write, `invalid-credential` and `invalid-request` from the Audit Trail call all surface as `rejected(recording-failure)` at this composition's boundary. **For this reason `invalid-credential` is not listed as a distinct returnable code in the lifecycle action signatures** — it is unreachable as a clean pre-state rejection in this composition. The resulting orphan — a Soft Delete lifecycle record with no corresponding Audit Trail event and no `record_to_events` entry — is surfaced per the *Cross-store consistency under partial failure* edge case. Deployments requiring credential pre-validation before the Soft Delete write wire an Actor Identity pre-check above this composition (a composing peer).

No primitive is case-sensitivity-normalized at the composition layer; deployments wanting normalization wire it at the calling layer before invoking composition actions.

### Action wiring

The composition exposes three orchestrating lifecycle actions, one emergent forensic read action, and one read passthrough. Every successful lifecycle-state-changing action records in Audit Trail; `recover_history` and the `read` passthrough produce no Audit Trail event — they are pure reads that change no state. All `record_to_events` list-appends occur only after both the Soft Delete write and the Audit Trail write succeed — the population of the list is the evidence that the atomicity obligation was met.

The full rejection taxonomy for each action enumerates every reason the action can fail; constituent rejections are either propagated (with the same name), renamed (with the mapping noted), or surfaced as a new code at the composition's boundary.

---

#### `delete_record`

```
delete_record(
  actor_ref,
  record_id,
  credential,
  [reason]
) →
    {record_id, event_id}
  | rejected(
      invalid-request
    | already-deleted
    | already-purged
    | recording-failure
    )
```

Soft-deletes the record and immediately binds the transition to an attributed Audit Trail event.

Steps:

1. Validate `actor_ref` and `record_id` per Primitive policies. Empty or whitespace-only → `rejected(invalid-request)`. Stop.
2. `SoftDelete.soft_delete(record_id, deleted_by=actor_ref, reason?, deleted_at=now)` → `deleted`. Map constituent rejections: `invalid-request` → `rejected(invalid-request)`; `already-deleted` → `rejected(already-deleted)`; `already-purged` → `rejected(already-purged)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref=record.soft_deleted, actor_ref, credential, data={record_id, reason, recorded_at=now})` → `event_id`. The acting actor's credential attests the deletion. If this call fails (the Soft Delete write landed in step 2 but the audit write fails here): return `rejected(recording-failure)` per the uniform mapping rule; the orphan (Soft Delete lifecycle record with no Audit Trail event, no `record_to_events` entry) is surfaced per the *Cross-store consistency under partial failure* edge case. Stop on failure.
4. Append `event_id` to `record_to_events[record_id]` (creating the list if this is the record's first entry).
5. Return `{record_id, event_id}`.

---

#### `restore_record`

```
restore_record(
  actor_ref,
  record_id,
  credential,
  [reason]
) →
    {record_id, event_id}
  | rejected(
      invalid-request
    | not-known
    | not-deleted
    | already-purged
    | recording-failure
    )
```

Restores a Deleted record to Active and binds the restore transition to an attributed Audit Trail event.

Steps:

1. Validate `actor_ref` and `record_id` per Primitive policies. Empty or whitespace-only → `rejected(invalid-request)`. Stop.
2. `SoftDelete.restore(record_id, restored_by=actor_ref, reason?, restored_at=now)` → `restored`. Map: `invalid-request` → `rejected(invalid-request)`; `not-known` → `rejected(not-known)`; `not-deleted` → `rejected(not-deleted)`; `already-purged` → `rejected(already-purged)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref=record.restored, actor_ref, credential, data={record_id, reason, recorded_at=now})` → `event_id`. If this call fails: return `rejected(recording-failure)` per the uniform mapping rule; the orphan (Soft Delete record restored with no corresponding attributed audit event, no `record_to_events` entry) is surfaced per the *Cross-store consistency under partial failure* edge case. Stop on failure.
4. Append `event_id` to `record_to_events[record_id]`.
5. Return `{record_id, event_id}`.

---

#### `purge_record`

```
purge_record(
  actor_ref,
  record_id,
  credential,
  reason
) →
    {record_id, event_id}
  | rejected(
      invalid-request
    | not-known
    | not-deleted
    | recording-failure
    )
```

Permanently destroys the record and binds the purge transition to an attributed Audit Trail event. `reason` is required (not optional) — a purge without a stated justification is an attributed destruction with no record of the authority under which it was executed, defeating the forensic guarantee. **This action does NOT check purge eligibility.** It does not consult Legal Hold, Retention Window, or any other governance gate before executing the purge. Whether a purge was permissible at the time it was called — whether a Legal Hold was active, whether the Retention Window had elapsed, whether the actor was authorized — belongs to [Defensible Retention](./defensible-retention.md) (for the hold and retention gate) and a Permissions composing pattern (for the authorization gate). This composition records the purge faithfully; Defensible Retention gates it. Absorbing the eligibility gate here would duplicate Defensible Retention's hold-blocks-purge invariant.

Steps:

1. Validate `actor_ref`, `record_id`, and `reason` per Primitive policies. Empty or whitespace-only `actor_ref`, `record_id`, or `reason` → `rejected(invalid-request)`. Stop.
2. `SoftDelete.purge(record_id, purged_by=actor_ref, reason, purged_at=now)` → `purged`. Map: `invalid-request` → `rejected(invalid-request)`; `not-known` → `rejected(not-known)`; `not-deleted` → `rejected(not-deleted)` (Soft Delete enforces the Deleted → Purged requirement; Active → Purged direct path is prohibited by Soft Delete Invariant 4); `storage-failure` → `rejected(recording-failure)`. Stop on any.
3. `AuditTrail.record_action(action_ref=record.purged, actor_ref, credential, data={record_id, reason, recorded_at=now})` → `event_id`. The actor's credential is bound here — the audit record names who purged the record, when, and under what stated reason. If this call fails: return `rejected(recording-failure)` per the uniform mapping rule. **This is the most consequential partial-failure case**: the Soft Delete purge is irreversible (Purged is terminal per Soft Delete Invariant 3); the record is destroyed but carries no attributed, sealed audit event. Surfaced per the *Cross-store consistency under partial failure* edge case as a high-priority finding. Stop on failure.
4. Append `event_id` to `record_to_events[record_id]`.
5. Return `{record_id, event_id}`.

---

#### `recover_history`

```
recover_history(
  actor_ref,
  record_id,
  original_event_payloads
) →
    lifecycle_history
  | rejected(
      invalid-request
    | not-known
    )
```

The emergent forensic read action. Reconstructs the complete, ordered, attributed, tamper-verified delete/restore/purge history of `record_id` from the `record_to_events` list and the Audit Trail substrate. `original_event_payloads` is a map from `event_id` (or list position) to the original event payload the seal committed to; it is a **required argument** because tamper-evidence verification is self-contained only given the originating records (Audit Trail Invariant 7 — verification asymmetry preserved). Surfacing the payloads at the signature, rather than having the composition fetch them internally, is intentional: the verifier must present the record set, not trust the host system to supply it. For an entry whose payload is not present in the map, the per-event `attestation_verification` is reported as `unverifiable(payload-not-supplied)` rather than failing — partial verification (attribution and retention for the entries whose payloads are supplied) is still useful, and the missing-payload entries are named in the result. This mirrors Chain of Custody's `verify_custody(chain_id, original_event_payloads)` design.

Neither constituent alone can answer this query: Soft Delete returns only the current-state attribution summary, discarding prior epochs on each new `soft_delete` or `restore`; Audit Trail stores every event but does not know which events constitute a deletion lifecycle for a specific `record_id`. The composition is the layer that holds `record_to_events`, the binding that answers: *what is the full ordered history of this record's deletion lifecycle, and is each step attributed, sealed, and within its retention horizon?*

The returned `lifecycle_history` contains:

- **`record_id`** — the identifier of the record being inspected.
- **`current_state`** — the record's current Soft Delete state (`Active`, `Deleted`, or `Purged`), read from `SoftDelete.read({record_id})`.
- **`current_summary`** — the current-state attribution from `SoftDelete.read({record_id})`: `deleted_by`, `deleted_at`, `deletion_reason` (if present), plus `restored_by`, `restored_at`, `restoration_reason` (if the record has been restored), plus `purged_by`, `purge_reason`, `purged_at` (if Purged). This is the summary Soft Delete provides; the `events` sequence below is the full ordered history it cannot provide.
- **`events`** — an ordered list (in `record_to_events[record_id]` append order, which is transition occurrence order) of per-event verification records. Each record contains:
  - `sequence_position` — the 1-based index of this event in the `record_to_events[record_id]` list (1 = first transition ever recorded for this record).
  - `event_id` — the Audit Trail `event_id` for this transition.
  - `action_ref` — the transition type (`record.soft_deleted`, `record.restored`, or `record.purged`).
  - `actor_ref` — from the Audit Trail event's `actor_ref` field — the actor whose credential was bound.
  - `recorded_at` — from the Audit Trail event's `recorded_at` field — the timestamp of the event as recorded in the Event Log.
  - `reason` — from the Audit Trail event's `data.reason` field (present on `record.purged` always; present on `record.soft_deleted` and `record.restored` when supplied at call time).
  - `attestation_verification` — the result of `AuditTrail.verify_record(event_id, original_event_payloads[event_id])` (Audit Trail Invariant 7 requires the original payload to be re-presented; the caller supplies it via the argument). Returns `verified`, `failed-verification(reason)`, `not-known` (the audit event is unknown — a binding-gap), or `unverifiable(payload-not-supplied)` (the caller did not include this event's payload in `original_event_payloads`, so the seal check cannot run).
  - `retention_state` — the retention state of the audit event (derived from the Audit Trail substrate's `event_to_retention` for this `event_id`): `Retained`, `Purged`, or `unknown` (if the `event_id` is not bound).
- **`overall_verdict`** — a summary verdict: `history-complete` (every event in `record_to_events[record_id]` has a binding, every supplied `attestation_verification` returns `verified` or `failed-verification(purged)` — the latter is lawfully destroyed), or `history-incomplete(reasons)` enumerating the specific failure classes (`binding-gap`, `attestation-failed`, `retention-lapsed`, `seal-failed`, or `payload-not-supplied`). `payload-not-supplied` is distinguished from the genuine-failure classes: it signals an incomplete verification input, not a defect in the lifecycle record.

Steps:

1. Validate `actor_ref` and `record_id` per Primitive policies. Empty or whitespace-only → `rejected(invalid-request)`. Stop.
2. Look up `record_id` in Soft Delete's store via `SoftDelete.read({record_id})`. If no lifecycle record exists → `rejected(not-known)`. Stop.
3. Read `current_state` and `current_summary` from the `SoftDelete.read` result.
4. Look up `event_list = record_to_events[record_id]`. If absent (the record exists in Soft Delete's store but has no `record_to_events` entry), treat `event_list` as empty and note the binding-gap in the overall verdict.
5. For each `event_id` in `event_list` (in list order):
   a. Read the Audit Trail event metadata (`action_ref`, `actor_ref`, `recorded_at`, `data.reason`) from the substrate.
   b. Look up `original_event_payloads[event_id]`. If absent, record `attestation_verification = unverifiable(payload-not-supplied)` and continue. If present, call `AuditTrail.verify_record(event_id, original_event_payloads[event_id])` (Audit Trail Invariant 7 preserved). Record the verification result.
   c. Read `retention_state` for `event_id` from the Audit Trail substrate's `event_to_retention` map.
6. Compute `overall_verdict` from the collected results.
7. Return `lifecycle_history` with all fields populated.

**Note on `original_event_payloads` at `recover_history`.** The asymmetry is surfaced at the signature: `original_event_payloads` is a required argument, not an internally-fetched value (Audit Trail Invariant 7 — verification asymmetry preserved: the verifier must present the original record set, not trust the host system to fetch it). For interactive forensic investigations, the investigator retrieves payloads from cold storage or the event log and supplies the full map. For operational monitoring, the system supplies the payloads from its own store. A caller who supplies a partial map receives a partial history: events without a supplied payload report `unverifiable(payload-not-supplied)` and the verdict names them, while attribution and retention for the supplied events are still verified.

---

#### `read` (passthrough)

```
read(record_id, [query]) →
    lifecycle_record
  | rejected(invalid-request | not-known | invalid-query)
```

Passes directly to `SoftDelete.read({record_id, ...query})` without modification. No Audit Trail event is recorded — this is a pure read that changes no state. Returns the current Soft Delete lifecycle record for `record_id`. Does not return the full history (use `recover_history` for that); returns only the current-state summary Soft Delete provides. Propagates `invalid-query` from Soft Delete unchanged.

---

### The load-bearing wiring decision — lifecycle-transition ⇒ audit-event binding (and emergent full-history recoverability)

The composition's structural reason to exist: **every Soft Delete lifecycle action (`soft_delete`, `restore`, `purge`) emits, in the same transactional boundary, an Audit Trail `record_action` that (a) names the `record_id` in its data payload, (b) attributes the acting actor via credential (Actor Identity through Audit Trail), and (c) is thereby sealed and placed under retention. The binding — this transition's event — is appended to `record_to_events[record_id]`.**

*Principle.* A defensible deletion record requires that every delete/restore/purge be attributed to a verified actor, tamper-evidently sealed, and that the *complete* lifecycle history of any record be reconstructable — not just the current-state summary. No single atom satisfies all three. Soft Delete satisfies none of them fully: its attribution fields are immutable by specification but not cryptographically, it explicitly defers full history to Event Log composition, and it explicitly defers tamper-evidence to Tamper Evidence. Audit Trail satisfies attribution, tamper-evidence, and retention but does not know which events belong to which record's deletion lifecycle, so it cannot reconstruct the lifecycle without the `record_to_events` binding.

*Likely objection.* "Soft Delete already records who deleted and who purged — why compose? The lifecycle record carries full attribution."

*Mechanism that resolves it.* Soft Delete keeps only the *most-recent* attribution per category and is immutable only *by specification* (not cryptographically). The atom's own Behavior section states: "The atom retains only the most recent attribution in each category; the full cycle history requires Event Log composition." Its Edge cases state: "full history of all cycles requires composition with Event Log." Its Composition notes state: "Actor Identity provides cryptographic attestation that those references are real, credentialed actors." The composition fills each of these gaps simultaneously via the Audit Trail substrate: the Event Log retains every transition in order (not just the most recent); Tamper Evidence seals them cryptographically (not just by specification); Actor Identity verifies the actor (not just records an opaque reference). The `record_to_events` binding makes all three available per transition and per record.

*Result.* A records-alone-defensible, tamper-evident, fully-recoverable deletion lifecycle that neither constituent provides alone. An investigator holding `record_to_events` plus the Soft Delete store plus the Audit Trail substrate can answer, for any `record_id`, the regulator's questions — who deleted it, who restored it, who purged it, in what order, is the record intact, was it kept long enough — from the records alone, without developer narration, without source code, without runbooks.

---

## Composition-level invariants

These invariants (conditions that must always hold) emerge from the composition. None belongs to a single constituent; each requires both Soft Delete and the Audit Trail substrate working together to hold.

- **Invariant 1 — Lifecycle attribution coverage.** Every `soft_delete`, `restore`, and `purge` transition recorded in the Soft Delete store has exactly one corresponding Audit Trail event (via `record_to_events`) whose verified attestation binds the acting actor's `actor_ref` to a verified credential, and whose `action_ref` matches the transition type (`record.soft_deleted`, `record.restored`, `record.purged` respectively). No lifecycle transition exists without an attributable, attribution-verified audit record. *Rests on:* Soft Delete Invariants 1 and 8 (deletion attribution immutability and completeness), Soft Delete Invariant 5 (purge attribution completeness), and Audit Trail Invariant 1 (attribution coverage — every Audit Trail event has a verified attestation). Established by the `record_to_events` append step in each lifecycle action wiring.

- **Invariant 2 — Purge accountability.** No record reaches Purged without an Audit Trail event naming `actor_ref` (who purged), `recorded_at` (when), and `data.reason` (stated authority/justification), sealed via Tamper Evidence. An anonymous purge, a missing reason, or an unsealed purge event is a conformance failure. This is the composition's headline regulated invariant — the property no downstream auditor, regulator, or court should be able to discover has been violated without the records surfacing it. *Rests on:* Soft Delete Invariant 5 (purge attribution completeness: `purged_by` and `purge_reason` required), Soft Delete Invariant 4 (purge requires prior deletion), and Audit Trail Invariant 3 (integrity coverage — every event covered by a seal, modulo the unsealed-tail window bounded by `seal_cadence`).

- **Invariant 3 — Forensic completeness / full-history recoverability.** `recover_history(record_id)` reconstructs the complete ordered delete/restore/purge history of any record from the `record_to_events` list and the Audit Trail event stream, including prior deletion epochs that Soft Delete's current-state summary overwrote. For every event in the list with a supplied payload, `attestation_verification = verified` confirms attribution and seal integrity. The *complete ordered history* is the emergent guarantee neither constituent provides alone: Soft Delete keeps only the current-state summary; Audit Trail's Event Log keeps every event but cannot associate them with a lifecycle without `record_to_events`. *Rests on:* Event Log Invariant 3 (total order preserved), Event Log Invariant 2 (event immutability), Audit Trail Invariant 7 (verification asymmetry preserved — the verifier supplies original payloads), and the append-only discipline of `record_to_events`.

- **Invariant 4 — Binding bijection / no dangling partial (safety + liveness).** A one-to-one binding between lifecycle transitions committed through this composition and Audit Trail lifecycle events: every such transition has exactly one corresponding `record_action` event whose `data.record_id` points back to it, and vice versa. The two truth-bearing writes (the Soft Delete transition and the audit event; the `record_to_events` map is a derived index outside this surface — see Composition state) are committed atomically *or* the failure path of the *Cross-store consistency under partial failure* edge case runs. Because Soft Delete's transitions are not always reversible (Purged is terminal per Soft Delete Invariant 3) and synchronous rollback is not universally available, the orphan state — a committed transition with no audit event — *is* reachable under the prescribed design, durably, until compensation lands. For a purge transition this is Invariant 2's worst case: a destroyed record awaiting its attributed audit event. The honest claim therefore splits:

  - **Safety — no *unsurfaced* orphan.** At all times, every orphan is detectable from the records alone (enumerate Soft Delete state against the Audit Trail lifecycle events through the substrate's read surface). Surfacing has two mandatory legs: a partial failure that *returns* surfaces the orphan as a compliance finding in the same outcome that returns `rejected(recording-failure)`; a partial failure that *cannot* return — a process crash between the two truth-bearing writes — is caught by the mandated **reconciliation scan** (the same orphan enumeration, run at restart and on a fixed cadence; see the partial-failure edge case), so no orphan survives unsurfaced past the scan bound. Never a quiet inconsistency. A lifecycle audit event naming a `record_id` with no Soft Delete lifecycle record (the inverse orphan) is unreachable through this composition's wiring. Recovered bindings remain distinguishable from clean ones via the `cascade_recovery` marker on the compensating event.
  - **Liveness — every orphan is eventually bound.** The mandated compensation (retry the failed `AuditTrail.record_action` until it lands) restores the bijection: an orphan is a surfaced transient under compensation, never a steady state of a conforming implementation. Formally: *Orphan(t) ↝ Bound(t)* under weak fairness on the retry — the eventuality lives in the implementation's retry obligation; the formal model carries its enabledness half (the retry action is enabled in exactly the orphan configuration, so no orphan state is a dead end). The retry discharges *transient* failures (`recording-failure`); a *deterministic* rejection of the audit write (`invalid-credential` / `invalid-request` — first detectable after the Soft Delete write, per the uniform rejection-mapping rule) cannot land by repetition, so there the compensation re-attests under the deployment's declared `recovery_identity` (see Configuration and the partial-failure edge case) — the eventuality holds across both failure classes, by retry on one and by recovery-attestation on the other.

  *This is the load-bearing claim* and the formal-model subject — the model covers both arms, the atomic commit and the compensated partial failure; it mirrors Audit Trail Invariant 4 (cascade-on-purge atomicity) at the lifecycle-transition-creation boundary, and Invariant 2's purge-accountability coverage rides the same predicates. A violation — an *unsurfaced* transition orphan, or an orphan outside compensation — is a high-priority finding surfaced per the partial-failure edge case.

  **Precondition — this composition is the sole write path to its Soft Delete instance.** The composition maintains exactly one Soft Delete instance and is the only writer of it; every `soft_delete`/`restore`/`purge` against that instance flows through a lifecycle action of this composition and therefore appends to `record_to_events` and emits an Audit Trail event before the action returns. A direct Soft Delete write that bypasses this composition would create a transition with no audit event and is outside the composition's guarantee (and a violation of this invariant). Because Soft Delete retains only current-state attribution — it does not store its own transition history — the **authoritative** record of the full transition sequence is `record_to_events` plus the Audit Trail Event Log, not the Soft Delete store. The bijection's *forward* direction (every `record_to_events` event is a real, back-pointing Audit Trail event) is independently auditable from the records; the *reverse* direction (every committed transition has an event) holds by construction of the sole write path and is corroborated for the *current* state by `SoftDelete.read`, since a re-enumeration of prior-epoch transitions from Soft Delete alone is impossible by design.

- **Invariant 5 — Constituent invariants preserved.** All Soft Delete invariants (1–8) hold over the Soft Delete store instance; all Audit Trail invariants (1–8) hold over the Audit Trail substrate instance, and transitively all Event Log, Actor Identity, Retention Window, and Tamper Evidence invariants hold over their constituent instances within the substrate. The composition does not weaken or override any constituent invariant.

---

## Examples

### Walkthrough — GDPR Article 17 erasure under supervisory authority scrutiny

A healthcare SaaS (Software as a Service) platform uses this composition to govern the deletion lifecycle of patient profile records. Configuration: `audit_trail_retention_policy = hipaa_6yr_audit` (encoding a 6-year audit-record retention minimum per HIPAA §164.312(b)), `seal_cadence = per-event`.

1. **Patient requests erasure.** DSAR (Data Subject Access Request — a request by an individual to see, correct, or erase the personal data an organization holds about them) workflow calls `delete_record(actor_ref="dsar_service", record_id="profile-4491", credential=<dsar_credential>, reason="GDPR Art. 17 erasure request — ticket DSR-2026-0441")` → `{record_id="profile-4491", event_id="ev_5001"}`. Soft Delete transitions `profile-4491` to Deleted; `AuditTrail.record_action(record.soft_deleted, actor_ref="dsar_service", ...)` → `ev_5001`; `record_to_events["profile-4491"] = ["ev_5001"]`. The deletion is attributed and sealed.

2. **Erasure confirmed and purge executed.** After confirming no Legal Hold blocks the purge (that check is the responsibility of a composing [Defensible Retention](./defensible-retention.md) instance in this deployment), the workflow calls `purge_record(actor_ref="dsar_service", record_id="profile-4491", credential=<dsar_credential>, reason="GDPR Art. 17 erasure confirmed — no blocking hold — ticket DSR-2026-0441")` → `{record_id="profile-4491", event_id="ev_5002"}`. Soft Delete transitions `profile-4491` to Purged; `AuditTrail.record_action(record.purged, actor_ref="dsar_service", ...)` → `ev_5002`; `record_to_events["profile-4491"].append("ev_5002")`.

3. **GDPR supervisory authority audit.** A Data Protection Authority (DPA) auditor asks: *"Prove the erasure of profile-4491 was performed, attributed, tamper-evident, and the full lifecycle is recoverable."* The system calls `recover_history(actor_ref="dpa_auditor", record_id="profile-4491", original_event_payloads={ev_5001: <payload_1>, ev_5002: <payload_2>})`.
   - `current_state = Purged`.
   - `events`: `[{sequence_position=1, event_id="ev_5001", action_ref=record.soft_deleted, actor_ref="dsar_service", recorded_at=T1, reason="GDPR Art. 17 erasure request…", attestation_verification=verified, retention_state=Retained}, {sequence_position=2, event_id="ev_5002", action_ref=record.purged, actor_ref="dsar_service", recorded_at=T2, reason="GDPR Art. 17 erasure confirmed…", attestation_verification=verified, retention_state=Retained}]`.
   - `overall_verdict = history-complete`.
   The DPA auditor sees: (a) who deleted the record and why; (b) who purged it, when, and under what stated reason; (c) both events are tamper-evidently sealed; (d) both are under active retention. Invariants 1–3 are the structural guarantees behind each field. No developer narration required.

### Multi-epoch lifecycle — delete, restore, re-delete, purge

A content moderation system uses this composition for post lifecycle management. A post is deleted, then reinstated on appeal, then deleted and purged after the appeal window closes. Soft Delete retains only the most recent deletion attribution; this composition retains the full ordered history.

1. `delete_record(actor_ref="mod_jones", record_id="post-8821", credential=..., reason="Policy violation — review pending")` → `ev_6001`. `record_to_events["post-8821"] = ["ev_6001"]`.
2. `restore_record(actor_ref="appeals_team", record_id="post-8821", credential=..., reason="Appeal upheld — reinstatement")` → `ev_6002`. `record_to_events["post-8821"] = ["ev_6001", "ev_6002"]`.
3. `delete_record(actor_ref="mod_chen", record_id="post-8821", credential=..., reason="Policy violation — appeal exhausted")` → `ev_6003`. `record_to_events["post-8821"] = ["ev_6001", "ev_6002", "ev_6003"]`. At this point Soft Delete's `deleted_by = "mod_chen"`, overwriting `"mod_jones"` — the prior epoch is gone from Soft Delete's current-state summary.
4. `purge_record(actor_ref="retention_service", record_id="post-8821", credential=..., reason="90-day post-appeal purge policy")` → `ev_6004`. `record_to_events["post-8821"] = ["ev_6001", "ev_6002", "ev_6003", "ev_6004"]`.

`recover_history(record_id="post-8821", ...)` returns all four events in order, including `ev_6001` (the original moderation deletion by `"mod_jones"`) that Soft Delete's current-state summary no longer carries. Invariant 3 (forensic completeness) is the structural guarantee: the full ordered history is recoverable from the composition's records even after Soft Delete's current-state attribution has been overwritten by a subsequent epoch.

### Rejection path — purge of an Active record

An automated purge job targets a record that was never soft-deleted: `purge_record(actor_ref="purge_job", record_id="doc-0099", credential=..., reason="scheduled purge")`. Step 2 calls `SoftDelete.purge("doc-0099", ...)` → `rejected(not-deleted)` (per Soft Delete Invariant 4 — Active → Purged direct path is prohibited). The composition returns `rejected(not-deleted)`. No Soft Delete state is written; no Audit Trail event is recorded; `record_to_events` is unchanged. Invariant 4 (binding bijection) is preserved: no transition, no event, no entry.

### Rejection path — `delete_record` on an already-Deleted record

`delete_record(actor_ref="admin", record_id="profile-7723", credential=..., reason="duplicate delete")` where the record is already Deleted. Step 2 calls `SoftDelete.soft_delete("profile-7723", ...)` → `rejected(already-deleted)`. The composition returns `rejected(already-deleted)`. No state is written; no audit event is recorded.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

**Regulator audit — GDPR/HIPAA: prove a data subject's erasure was performed, attributed, tamper-evident, and the full lifecycle is recoverable.**

A GDPR supervisory authority or HIPAA Office for Civil Rights (OCR) investigator queries `recover_history(record_id="profile-4491", ...)` with original event payloads. The returned `lifecycle_history`:
- `current_state = Purged` — the record is destroyed, consistent with the erasure claim.
- For each event in `record_to_events["profile-4491"]`: `attestation_verification = verified` by Invariant 1 (lifecycle attribution coverage) — each transition has an Audit Trail event whose Actor Identity attestation binds `actor_ref` to a credential. The Tamper Evidence seal (via Audit Trail Invariant 3) confirms no event was rewritten after the fact.
- Every event's `retention_state = Retained` — the audit events are under active retention per the configured policy (Audit Trail Invariant 2 — retention coverage).
- `overall_verdict = history-complete`.
The regulator's question — *who deleted the record, who purged it, was the record tampered with, and is the audit trail being kept?* — is answered from the records alone. Invariants 1–3 are the structural basis for each answer. No developer narration is required.

**Disputed erasure — data subject claims their record was not erased, or was erased without their request.**

A data subject or their representative challenges the system: *"I never requested erasure — who deleted my record and why?"* or *"I requested erasure months ago and nothing was done."*

Claim (a) — unauthorized erasure: `recover_history` returns the full event list, including the earliest `record.soft_deleted` event with `actor_ref` and `data.reason`. Invariant 1 (lifecycle attribution coverage) guarantees every transition is attributed. If the `reason` field on the first `record.soft_deleted` event does not reference a DSAR ticket or an authorized process, the attribution is in the record — the actor who performed the deletion is named. The data subject's claim that it was unauthorized is an external-clearable question (whether the actor had authorization is a Permissions/governance matter, not a records matter), but the records name who did it.

Claim (b) — erasure not performed: `SoftDelete.read({record_id})` returns the current lifecycle record. If the record is in Deleted or Active state rather than Purged, the erasure was not completed; the full `record_to_events` list shows every transition taken, and the absence of a `record.purged` event in the list is the structural evidence. The composition records what happened, not what should have happened; the absence of a purge event is the honest answer that the erasure was not completed.

In both cases the records answer from Invariants 1 and 3; the challenge cannot be sustained without claiming the records were fabricated, at which point Audit Trail Invariant 3 (tamper-evident seal) and `attestation_verification = verified` from each event are the structural rebuttal.

**Breach or incident investigation — reconstruct every delete/restore/purge in an anomaly window and detect tampering via seal verification.**

An incident responder suspects records were purged by an unauthorized actor during an anomaly window (02:00–04:00 UTC on a given date). The responder queries the Audit Trail substrate directly for `record.purged` events in the window: `AuditTrail.record_action` events where `action_ref = record.purged` and `recorded_at ∈ [02:00, 04:00]`. For each found `event_id`:
- The `actor_ref` field names who executed the purge. An `actor_ref` outside the authorized purge-actor set is an immediate finding (Invariant 2 — purge accountability requires the purge be attributed; it does not guarantee the actor was authorized, which is externally clearable via Defensible Retention / Permissions, but it names the actor structurally).
- `AuditTrail.verify_record(event_id, payload) → verified` confirms the event has not been tampered with since it was sealed. A `failed-verification(seal-proof-invalid)` result is a finding that the record was altered after sealing.
- `record_to_events[record_id]` can be read for each affected `record_id` to reconstruct the full lifecycle context around the anomaly purge: was the record deleted just before the purge (consistent with a rapid delete + purge sequence), or was it in a long-standing Deleted state (consistent with a scheduled purge)?

An unexpected `actor_ref` on a `record.purged` event, or a `failed-verification` on any event in the window, is a forensic finding. The seal cadence governs the window's resolution: a tighter cadence narrows the range of events that could have been tampered with between seal checkpoints. Invariants 1–4 are the structural basis for the investigation; the composition's records answer the investigation's questions from the records alone.

---

## Generation acceptance

A derived implementation of this composition is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state (`record_to_events`) plus the Soft Delete store and the Audit Trail substrate stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

These checks are answerable by reading the composition's records (including the Audit Trail substrate and the Soft Delete store):

1. **Every lifecycle transition has a verified attribution.** For every `record_id` in `record_to_events`, and for every `event_id` in `record_to_events[record_id]`, call `AuditTrail.verify_record(event_id, payload)` and confirm it returns `verified` (or `failed-verification(purged)` for events whose retention has lawfully elapsed — distinguished from missing per Audit Trail Invariant 8). An entry in `record_to_events` with no corresponding Audit Trail event, or whose `attestation_verification` returns `failed-verification(attestation-...)`, is a conformance failure. Invariant 1 is the contract.

2. **No purge lacks an attributed, tamper-evident audit event.** For every Purged record in the Soft Delete store (identified by `SoftDelete.read({state: Purged})`), confirm `record_to_events[record_id]` contains at least one `event_id` with `action_ref = record.purged`, and that `AuditTrail.verify_record` returns `verified` for that event. Confirm the event's `data.actor_ref` and `data.reason` each contain at least one non-whitespace character. A Purged record with no `record.purged` event in `record_to_events`, or whose purge event has an empty `reason`, is a conformance failure. Invariant 2 is the contract.

3. **Full history is recoverable and replays in order.** For a sample of `record_id`s, call `recover_history(record_id, original_event_payloads)` with all event payloads supplied. Confirm `overall_verdict = history-complete`. Confirm the `events` list length equals the length of `record_to_events[record_id]`. Confirm the `events` are ordered by `sequence_position` ascending (i.e., in transition occurrence order). For records that have had multiple delete/restore cycles, confirm that intermediate delete and restore events appear in the list — events that Soft Delete's current-state summary does not retain. Invariant 3 is the contract.

4. **Binding bijection is complete.** *Forward direction (fully auditable):* for every `record_id` in `record_to_events`, every `event_id` in the list is present in the Audit Trail substrate (not a dangling reference) and carries a `data.record_id` pointing back to the same record. *Reverse direction:* every committed lifecycle transition has an event — this holds by construction (this composition is the sole write path to its Soft Delete instance; each action appends its event before returning) and is corroborated for the *current* state by confirming that `SoftDelete.read({record_id})`'s most-recent transition matches the last relevant `record.soft_deleted`/`record.restored`/`record.purged` event in `record_to_events[record_id]`. Soft Delete does not retain prior-epoch transitions, so `record_to_events` plus the Audit Trail Event Log — not the Soft Delete store — is the authoritative transition history for the reverse-direction check. An `event_id` in `record_to_events` the Audit Trail substrate does not recognize, a back-pointer mismatch, or a current-state transition with no matching tail event is a conformance failure. Invariant 4 is the contract.

5. **Constituent Generation acceptance bars.** Verify each constituent's own Generation acceptance bar over its respective store: Soft Delete's six checks (lifecycle record retention, purge attribution completeness, two-step purge path, terminal absorption, multi-cycle coherence, deletion attribution completeness) and Audit Trail's six checks (all four audit questions answerable, all eight composition-level invariants verifiable, each constituent atom's GA bar satisfied, forensic window boundable, honest destruction distinguishable, composing patterns identifiable). The composition's invariants depend on the correctness of the constituents' invariants.

### Externally-clearable checks

These audit questions arise around this composition but cannot be answered from the composition's records alone:

- **Whether the purge was eligible at the time it was executed.** This composition records that the purge was performed, who performed it, when, and under what stated reason (Invariant 2). It does not record whether a Legal Hold was active at the time, whether the Retention Window had elapsed, or whether any other eligibility condition was satisfied. Answering the eligibility question requires [Defensible Retention](./defensible-retention.md)'s records — specifically its `purge_record` Audit Trail events carrying `hold_check_result: empty` (the hold gate passed) and its Retention Window records. This composition is the forensic-attribution composition; Defensible Retention is the eligibility-gate composition. A deployment composing this composition + Defensible Retention gets both the attributed, sealed lifecycle history and the defensible-eligibility evidence.
- **Whether the acting actor was authorized to perform the lifecycle action.** This composition records `actor_ref` and verifies the credential via Audit Trail's Actor Identity. It does not verify that `actor_ref` was authorized under the deployment's organizational policy to delete, restore, or purge. Authorization requires a Permissions instance scoped to `forensic:delete`, `forensic:restore`, `forensic:purge` (or the deployment's equivalent scopes) — a composing peer. This composition records that an actor with a valid credential performed the action; whether that actor was the right actor is the Permissions question.
- **Whether the record's content was actually destroyed.** This composition records that `SoftDelete.purge` returned `purged` and the audit event was committed. Whether the host system's content deletion was executed — whether the bytes were actually erased from storage — is the host system's obligation, per Soft Delete's Edge case *"Content destruction is handled by the host system."* this composition records the lifecycle transition; content-destruction assurance requires the host system's own attestation or a media-sanitization audit (NIST SP 800-88 — US National Institute of Standards and Technology guidelines for storage media sanitization).

---

## Edge cases and explicit non-goals

- **Purge eligibility gate.** Whether a Deleted record is eligible for purge — whether a Legal Hold blocks it, whether the Retention Window has elapsed — is not enforced by this composition. The composition records a purge when called; it does not gate the call. Purge gate enforcement belongs to [Defensible Retention](./defensible-retention.md), which wires Legal Hold + Retention Window + Audit Trail into the hold-blocks-purge gate. This composition is the forensic-attribution composition; Defensible Retention is the eligibility-gate composition. A deployment requiring both the attributed lifecycle history and the hold-blocks-purge gate composes this composition + Defensible Retention; neither absorbs the other's concept.

- **Content destruction is handled by the host system.** Inherited from Soft Delete. The composition's `purge_record` action delegates to `SoftDelete.purge`, which signals the `purged` outcome; the host system is responsible for executing the content deletion against its own storage layer. This composition records the lifecycle transition; it does not implement or verify content destruction.

- **Cross-store consistency under partial failure.** Every this composition lifecycle action writes to Soft Delete first, then to Audit Trail, then appends to `record_to_events` (a derived index outside the atomicity surface — see Composition state). A failure after the Soft Delete write but before the Audit Trail write produces an orphan lifecycle transition: a Soft Delete state change with no Audit Trail event. Soft Delete's transitions are not always reversible (Purged is terminal per Soft Delete Invariant 3), so synchronous rollback is not universally available. The implementation must (a) retry the failed `AuditTrail.record_action` until it lands, (b) immediately surface the orphan to the compliance dashboard as a finding in the same outcome that returns `rejected(recording-failure)`, and (c) once the compensating Audit Trail event lands, append it to `record_to_events` and mark it with `cascade_recovery = true` so an auditor can distinguish a clean lifecycle transition from a recovered one. Two legs complete the protocol (added 2026-06-11 with Invariant 4's safety + liveness restatement): **the reconciliation scan** — the same orphan enumeration (Soft Delete state against the lifecycle audit events through the substrate's read surface), run at restart and on a fixed cadence — catches the *crash-orphan*, a process death between the two truth-bearing writes that leaves no returning outcome to surface the finding, bounding how long any orphan can remain unsurfaced; and **the deterministic-rejection arm** — where the audit write's failure is deterministic rather than transient (`invalid-credential` / `invalid-request`, per the uniform rejection-mapping rule), retrying the same call cannot land it, so the compensating `record_action` is re-attested under the deployment's declared `recovery_identity` (see Configuration), still marked `cascade_recovery = true` and naming the original actor in `data`. The `purge_record` partial failure is the most consequential: a Purged record with no attributed `record.purged` event is a direct violation of Invariant 2 — visible the whole time it awaits compensation, per Invariant 4's safety arm. Deployments under GDPR Article 17, HIPAA §164.310(d)(2), or FRCP Rule 37(e) exposure must treat any orphan purge transition as a hard alerting condition.

- **Access control.** Who may `delete_record`, `restore_record`, `purge_record`, or `recover_history` is not defined by this composition. That is the obligation of a composing [Permissions](../atoms/permissions.md) pattern. The composition takes `actor_ref` and `credential` at every action boundary; the deployment wires Permissions checks at the calling layer using the scopes `forensic:delete`, `forensic:restore`, `forensic:purge`, and `forensic:read`. Purge in particular should be a restricted action in any deployment handling regulated records. This composition records whoever calls it with a valid credential; it does not gate who is allowed to call it.

- **`recover_history` original-payload asymmetry.** The caller is responsible for supplying `original_event_payloads` to `recover_history`. The composition does not internally fetch payloads from the Audit Trail substrate on the caller's behalf (Audit Trail Invariant 7 — verification asymmetry preserved: the verifier must present the record set, not trust the host system to supply it). For operational monitoring, the system supplies payloads from its own operational store. For forensic investigations, the investigator retrieves payloads from cold storage or the audit event log and supplies the full map. A caller who supplies a partial map receives a partial history: entries without a supplied payload report `unverifiable(payload-not-supplied)` and the verdict names them. This is not a failure of the composition; it is an incomplete verification input. The pattern mirrors `verify_custody` in Chain of Custody (C12).

- **Right-to-erasure vs. retention of the audit events themselves — the meta-question.** A data subject invoking GDPR Article 17 erasure requests destruction of their personal data. This composition deletes and purges the underlying record. The Audit Trail events recording the deletion lifecycle are themselves records that contain `actor_ref`, `reason`, and `recorded_at` — fields that may (depending on their content) themselves constitute personal data. Whether the audit record of an erasure can be erased is the meta-question: GDPR Article 17(3)(b) permits retaining data when processing is necessary for compliance with a legal obligation, and audit records of erasure decisions are typically retained to demonstrate compliance. However, the specific content of the audit events — beyond the structural `action_ref`, `actor_ref` (if opaque), and `recorded_at` — requires legal counsel to assess. This composition does not adjudicate this; the [Audit Trail](./audit-trail.md) substrate's own Edge case *Erasure Coordination* governs the retention of audit events under competing GDPR pressures. This composition inherits that edge case.

- **Concurrent lifecycle actions on the same `record_id`.** Two callers simultaneously attempting `delete_record` or `purge_record` on the same `record_id` must be serialized. Soft Delete's own Concurrency edge case governs: the first write wins; the second observes the updated state and either receives `already-deleted`, `already-purged`, or `not-deleted` depending on the outcome of the first. This composition propagates Soft Delete's serialization requirement: implementations must serialize state transitions on a given `record_id`.

- **`recover_history` coverage of records with prior (pre-this composition) lifecycle transitions.** If a `record_id` has lifecycle transitions in Soft Delete's store that predate the deployment of this composition (i.e., records soft-deleted before this composition's `record_to_events` tracking was in place), `recover_history` will return the current-state summary from `SoftDelete.read` but the `events` list will be incomplete — it will contain only the transitions recorded after this composition was deployed. The `overall_verdict` will be `history-incomplete(binding-gap)` for those pre-this composition transitions. Deployments migrating existing Soft Delete stores into this composition are responsible for backfilling `record_to_events` and corresponding Audit Trail events for pre-existing transitions, or for documenting the coverage boundary explicitly in their compliance posture.

- **Soft Delete store vs. Audit Trail event retention asymmetry.** This composition's `audit_trail_retention_policy` governs the lifetime of the lifecycle audit events (the `record_action` entries in the Audit Trail Event Log). Soft Delete's lifecycle records persist indefinitely by the atom's own discipline (Soft Delete Invariant 7 — lifecycle record durability: the lifecycle record is never removed from the atom's store once created). When a lifecycle audit event reaches its retention end and is lawfully purged via the Audit Trail cascade, the corresponding Soft Delete lifecycle record persists, and `recover_history` reports that event's `attestation_verification = failed-verification(purged)` — lawful destruction of the attribution and seal, honestly distinguished from missing (Audit Trail Invariant 8 — honest representation of destruction). Defensible disposal of the Soft Delete lifecycle records themselves — destroying the lifecycle records, not just their attributed audit events — is a separate composing concept: a [Defensible Retention](./defensible-retention.md) instance applied to the Soft Delete store directly. This composition does not absorb full-lifecycle-record disposal; it governs the attributed audit layer.

- **Auditing the forensic-query itself.** `recover_history` and `read` are pure reads; they record no Audit Trail event. For high-assurance deployments that must also account for *who queried the history and when* — an access-audit over the forensic-query surface — an access-logging composing pattern wraps this composition's read surface. This composition's own audit surface is committed lifecycle *actions*, not lifecycle *queries*. This mirrors Audit Trail's own *Failed attribution attempts* edge case and Chain of Custody's *Auditing the custody-proof query itself* edge case.

- **Batch lifecycle operations.** `delete_record`, `restore_record`, and `purge_record` each operate on one `record_id`. Bulk deletion (all records matching a filter) is a composing-layer operation. Atomic bulk deletion — where all records in a set are deleted or none are — requires a transaction wrapper in the composing layer.

---

## Standards references

This composition is the structural form of the forensic-deletion-lifecycle requirement across its canonical regulated domains:

- **GDPR Article 17 (Right to erasure / Right to be forgotten — EU General Data Protection Regulation)** — the data subject's right to request destruction of personal data. Invariant 2 (purge accountability) and Invariant 3 (forensic completeness) together provide the structural erasure proof: not only is the destruction recorded and attributed, but the full lifecycle leading to the erasure is recoverable. Article 5(1)(e) (storage limitation) is satisfied by the attributed, time-bounded purge record; Article 5(1)(f) (integrity and confidentiality) is supported by the Tamper Evidence sealing via the Audit Trail substrate.

- **HIPAA §164.310(d)(2)(i) (Disposal — Health Insurance Portability and Accountability Act)** — covered entities must implement policies for the final disposition of electronic Protected Health Information (PHI). This composition's `purge_record` + `record.purged` audit event is the disposal-attribution record required by this provision; `recover_history` is the audit surface demonstrating that disposal was attributed and complete.

- **HIPAA §164.312(b) (Audit controls)** — electronic information systems must record and examine activity. The lifecycle audit events produced by this composition (one per `delete_record`, `restore_record`, and `purge_record` call) are the audit-control records for the deletion lifecycle; `recover_history` is the examination surface. The Audit Trail substrate's attribution, retention, and tamper-evidence satisfy the integrity and non-repudiation aspects of the audit-controls requirement.

- **FRCP Rule 37(e) (Federal Rules of Civil Procedure — preservation duty for electronically stored information, spoliation)** — failure to preserve ESI (Electronically Stored Information) when litigation is reasonably anticipated can result in sanctions. A `purge_record` call executed while a Legal Hold is active is the spoliation exposure; this composition's `record.purged` audit event (with `actor_ref`, `reason`, and `recorded_at`) is the structural record of the destruction. Whether the purge was permissible under the legal duty is Defensible Retention's records question; whether the purge happened and who executed it is this composition's records answer. The sealed, attributed, retained audit event is the evidence-grade record FRCP Rule 37(e) sanctions hearings require.

- **SOX §802 (Sarbanes-Oxley Act — 18 U.S.C. §1519, criminal obstruction of justice for records destruction subject to federal investigation)** — this composition's purge accountability invariant (Invariant 2) is the structural defense: no purge occurs without an attributed, sealed, retained audit event naming the actor and the stated reason. Whether a legal hold was active at purge time is Defensible Retention's question; whether the purge was attributed is this composition's guarantee.

- **ISO 15489-1 (Records management — International Organization for Standardization)** — Section 9.7 (suspension of disposition) and Section 9.9 (destruction of records). The Deleted → Purged path in this composition aligns with ISO 15489's deliberate-authorization requirement for records destruction; the attributed audit trail satisfies the accountability requirement for destruction decisions.

- **NIST SP 800-88 (Guidelines for Media Sanitization — US National Institute of Standards and Technology)** — the `purge_reason` field in the `record.purged` audit event documents the stated authority for destruction; the media-sanitization mechanism itself is the host system's obligation (see *Content destruction is handled by the host system* in Edge cases).

This composition inherits the broader standards compliance of its constituents:

- Through **Audit Trail** (and its transitive atoms): SOX §802 record retention, HIPAA §164.312(b) audit controls, PCI DSS (Payment Card Industry Data Security Standard) Requirement 10, 21 CFR Part 11 (US Code of Federal Regulations — electronic records and signatures in regulated industries), SEC (US Securities and Exchange Commission) Rule 17a-4, ISO/IEC 27001 §A.12.4 (logging and monitoring), GDPR Articles 30 and 32, and the full Audit Trail standards inheritance. Deployments composing this composition for regulated-record-lifecycle purposes receive these as the substrate's contribution; they are framed as inherited, not as this composition's own primary standards anchors.

- Through **Soft Delete**: GDPR Article 17, GDPR Article 5(1)(e), HIPAA §164.310(d)(2)(i), HIPAA §164.312(b), FRCP Rule 37(e), SOX §802, ISO 15489-1, and NIST SP 800-88 at the lifecycle-state and attribution layer. This composition lifts these to the full attributed+sealed+full-history-recoverable form those standards actually require but that Soft Delete alone cannot satisfy.

---

## Status

`grounded on Final Critique 4 — 2026-06-11` (English grounded 2026-06-04; coverage GAP MC-C3-1 closed 2026-06-11 — the TLA+ model [`forensic-recovery.tla`](./forensic-recovery.tla) + buggy twin verified in `tools/harness/` now cover **both arms** of Invariant 4, the atomic commit and the compensated partial failure, with Invariant 2's purge-accountability coverage riding the same predicates; see the coverage matrix and Lineage §Formal model). Sonnet-drafted against an Opus plan, then Opus-gated through Pass 1 (GRID), Pass 2 (EOS — the purge-eligibility-gate boundary against Defensible Retention holds; no over-absorption), Pass 3 (Linus), and a Final Critique round: one foundational finding, closed in-pattern (see Lineage notes). Regulated-pattern conventions (Regulated adversarial scenarios; Generation acceptance two-subsection split) baked in from the first draft. The formal-layer vote was YES; the derived TLA+ model verifies green with a buggy twin the checker rejects, and the English cleared the 92%-good threshold (foundational findings at zero). The 2026-06-10 coverage cross-check surfaced the original model's atomic-commit idealization as an uncovered GAP on Invariant 4's compensated arm (finding MC-C3-1, recorded in [`../tools/harness/coverage/forensic-recovery.md`](../tools/harness/coverage/forensic-recovery.md)); the 2026-06-11 touch-triggered round closed it — Invariant 4 restated as safety + liveness, the model revised to sequential-with-compensation covering both arms (16 states, all invariants hold; twin rejected at 2 states), `record_to_events` reclassified as a derived index outside the atomicity surface, and the `recovery_identity` configuration declared.

---

## Lineage notes

Regulated composition. The two regulated-overlay conventions — *Regulated adversarial scenarios* and *Generation acceptance* (with the Audit-Trail-traversal-clearable / externally-clearable split, established in Multi-Party Approval's Round 3 and applied retroactively) — are **inherited from the methodology directly** ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft, not re-derived from predecessor patterns. [Chain of Custody (C12)](./chain-of-custody.md) is the primary structural reference for the substrate-composition shape (atom + Audit Trail substrate, per-transition event binding, binding-bijection invariant, `original_event_payloads`-explicit verification signature, two-subsection Generation acceptance split, Lineage Structural-milestone). [Defensible Retention](./defensible-retention.md) is the primary boundary reference for what this composition is *not* — the purge eligibility gate. [KYC / Customer Onboarding (C8)](./kyc-customer-onboarding.md) is the secondary structural reference for the Audit Trail substrate-composition pattern. Conventions cited from the methodology directly, not re-derived from prior compositions.

**Structural milestone.** This composition retires the `this composition *(forthcoming)*` forthcoming-links in [`atoms/soft-delete.md`](../atoms/soft-delete.md): specifically (a) the *Purge gate enforcement* Edge case entry — *"this composition — Soft Delete + Event Log + Actor Identity + Audit Trail, providing the complete recoverable-destruction audit surface"* — and (b) the *Composition notes* entry — *"Forthcoming: this composition — Soft Delete + Event Log + Actor Identity + Audit Trail, providing the complete recoverable-destruction audit surface."* When this composition grounds, both forthcoming-links are resolved.

**Opus-led gating review — 2026-06-04 (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus + Final Critique).** Sonnet drafted against the Opus plan; Opus gated. One foundational finding, closed in-pattern:

- *F1 — binding bijection needed its sole-write-path precondition and a verifiability correction — foundational (Pass 3).* Invariant 4 asserted a bijection between Soft Delete transitions and Audit Trail events, but (a) it did not state that this composition must be the *sole* write path to its Soft Delete instance — a direct write bypassing this composition would create an unaudited transition — and (b) it implied the reverse direction was auditable by re-enumerating Soft Delete's transitions, which is impossible since Soft Delete deliberately retains only current-state attribution (the very gap this composition exists to fill). → Added the sole-write-path precondition to Invariant 4 and corrected both Invariant 4 and Generation-acceptance check 4: the forward direction (every `record_to_events` event is a real, back-pointing Audit Trail event) is independently auditable; the reverse direction holds by construction of the sole write path and is corroborated for the current state by `SoftDelete.read`, with `record_to_events` + the Audit Trail Event Log as the authoritative transition history.

Pass 1 GRID clean (all composition sections; reference graph intact — Soft Delete, Audit Trail, Defensible Retention, Chain of Custody, KYC, Permissions all exist). Pass 2 EOS clean and the key boundary holds: this composition does *not* absorb the purge-eligibility gate (Legal Hold / Retention Window) — that is Defensible Retention's concern, named in the Intent, the `purge_record` wiring, the *Purge eligibility gate* edge case, and the externally-clearable Generation-acceptance check; `record_to_events` and `recover_history` are composition-owned (Soft Delete has no history map, Audit Trail has no lifecycle query). The draft pre-applied the Chain-of-Custody lessons (explicit `original_event_payloads` on the forensic read; the store-vs-audit retention asymmetry and auditing-the-query edge cases). The English clears the 92%-good threshold (foundational findings at zero); the TLA+ binding-bijection model is the remaining grounding prerequisite per the YES vote.

**Formal-layer vote: YES (model pending).** The load-bearing **binding bijection / no-dangling-partial atomicity** (Invariant 4: every lifecycle transition has its attributed audit event; Soft Delete write + Audit Trail `record_action` commit atomically or are compensated — so "no purge without an audit record" holds under every interleaving) is a cross-store ordering/safety claim → TLA+ (Temporal Logic of Actions — a formal specification language for concurrent and distributed systems), mirroring `chain-of-custody.tla`. The correct model performs the two writes (SoftDelete lifecycle transition + AuditTrail `record_action`) as a single atomic action; the buggy twin performs them as two separate, interleavable sub-steps with no compensation, leaving a reachable state where a lifecycle transition (including a purge) exists in the Soft Delete store without its corresponding `record_to_events` entry and Audit Trail event — the "purge without an audit record" violation Invariant 2 prohibits. This mirrors the `chain-of-custody.tla` correct/buggy pair. *(Superseded 2026-06-04: the prose passes cleared and the TLA+ model landed and verifies — see the entry immediately below; this paragraph is preserved as the record of the vote as cast.)*

**Formal model — 2026-06-04: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`forensic-recovery.tla`](./forensic-recovery.tla) + config [`forensic-recovery.cfg`](./forensic-recovery.cfg), checked via `tools/harness/check.mjs`. *What it checks:* per lifecycle transition, three sub-writes — `softState` (the Soft Delete transition), `auditState` (the Audit Trail `record_action` event), `bound` (the `record_to_events` entry). Three composition-level safety invariants under every interleaving: the load-bearing **Invariant 4** (`Inv4_BindingBijection` — every transition is in one of two coherent configurations, uncommitted or fully-committed; never a dangling partial), `Inv_NoDanglingSoft` (a Soft Delete transition — including a purge — implies its audit event and binding: the structural form of **Invariant 2**, purge accountability), and `Inv_NoOrphanAudit` (a lifecycle audit event implies its Soft Delete transition). The CORRECT model commits the three sub-writes as a single atomic action; 4 reachable states, all invariants hold. *Bounds/saturation:* `Transitions = {t1, t2}`; the property is per-transition local, insensitive to count. *Buggy twin:* [`forensic-recovery-buggy.tla`](./forensic-recovery-buggy.tla) splits the commit into `WriteSoft` → `WriteAudit` → `Bind` with no compensation. TLC stops after `WriteSoft(t)` alone: `softState = present, auditState = absent, bound = FALSE` — a purge/delete with no attributed audit event, the exact "purge without an audit record" violation Invariant 2 prohibits. The checker rejects it at 2 states on `Inv4_BindingBijection`. This is the model's load-bearing contribution: a non-atomic lifecycle commit is reachably unsafe. *Conflict-protocol outcome:* none — the model corroborates the English; canonical English unchanged. Reproduce: `cd tools/harness && node check.mjs ../../compositions/forensic-recovery.tla` (and `… forensic-recovery-buggy.tla --buggy`). *(Superseded 2026-06-11: the model described here verified only Invariant 4's atomic-commit arm — see the coverage cross-check finding MC-C3-1 and the revision entry immediately below; this paragraph is preserved as the record of the model as first landed.)*

**Formal model — 2026-06-11: revised to cover Invariant 4's compensated arm; coverage GAP MC-C3-1 closed; pattern returns to `grounded`.** Touch-triggered round riding the 2026-06-10 coverage cross-check finding (matrix: [`../tools/harness/coverage/forensic-recovery.md`](../tools/harness/coverage/forensic-recovery.md)). *What was wrong:* the 2026-06-04 model committed three sub-writes as one atomic action — an idealization over a design whose own *Cross-store consistency under partial failure* edge case mandates sequential-with-compensation (Soft Delete writes first; Purged is terminal, so rollback is not universally available) — so the spec-mandated compensated path was unmodeled, and with it Invariant 2's worst case (a Purged record awaiting its audit event); the model's third sub-write also placed the `record_to_events` binding inside the atomicity surface, in tension with its derived-index classification. *The revision* (template: [`immutable-transaction-ledger.tla`](./immutable-transaction-ledger.tla), the C6-2 closure; mirrored by the same-day `chain-of-custody.tla` revision): per transition, two truth-bearing sub-writes — `softState` (absent | present) and `auditState` (absent | clean | recovered) — plus `surfaced` (the compliance finding); three actions — `CommitClean` (the transactional-boundary form), `FailPartial` (the reachable, surfaced orphan: the Soft Delete write lands, the audit write fails, the orphan is durable and visible — for a purge, Invariant 2's worst case, visible the whole time), and `RetryAudit` (the compensation, marked `cascade_recovery`, enabled in exactly the orphan configuration so no orphan state is a dead end). Four safety invariants checked: `Inv4_SafetyBijection` (every reachable configuration is coherent or a *surfaced* orphan-under-compensation), `Inv4_NoUnsurfacedOrphan`, `Inv4_NoOrphanAudit`, and `Inv4_RecoveryDistinguishable` (clean bindings never surfaced a finding; recovered bindings always did). Liveness — *Orphan(t) ↝ Bound(t)* — is canonical in the English (Invariant 4's liveness arm); the model discharges its enabledness half. The `record_to_events` derived index is omitted from the model per [`execution-contract.md`](../execution-contract.md) §Composition state, obligation 2. *Spec-side changes in the same round:* Invariant 4 restated as safety + liveness (the sole-write-path precondition unchanged); the partial-failure edge case gained the reconciliation-scan leg (crash-orphans) and the deterministic-rejection recovery-attestation leg; `recovery_identity` added to Configuration (capability provenance: a deployment-declared configuration capability); Composition state reclassifies `record_to_events` as a derived index with its named rebuild procedure (enumerate lifecycle audit events by `data.record_id`, ordered by the Event Log total order). *Harness:* correct model — 16 states, all invariants hold; buggy twin ([`forensic-recovery-buggy.tla`](./forensic-recovery-buggy.tla), sequential-without-compensation: the silent orphan, no surfacing, no retry) — rejected at 2 states on `Inv4_SafetyBijection`. *Bounds/saturation:* `Transitions = {t1, t2}` → 16 states; `{t1, t2, t3}` → 64 (the 4ⁿ per-transition-independence form, matching the C6 precedent), all invariants hold → saturated. *Conflict-protocol outcome:* case 2 — the English was right and the derivation under-covered it; the model was extended, and the English sharpening (the safety/liveness split) states what "committed atomically or compensated" already meant, changing no behavior. Reproduce: `cd tools/harness && node check.mjs ../../compositions/forensic-recovery.tla` (and `… forensic-recovery-buggy.tla --buggy`).
