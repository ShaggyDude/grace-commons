---
title: Soft Delete
parent: Resource Lifecycle
grand_parent: Atoms
nav_order: 2
has_toc: true
toc: true
---

# Soft Delete

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

> A resource-lifecycle primitive: a record is marked as deleted and hidden from normal query surfaces, but retained in recoverable form until an explicit purge. Each soft-deleted record has an opaque immutable id; the deletion actor, deletion timestamp, and optional reason are immutable properties set at deletion. Three states — Active, Deleted, Purged. Deleted is reversible; Purged is terminal. A Purged record cannot be restored.

---

## Intent

Most systems eventually need to delete records. The naive implementation — remove the row, free the storage — is irreversible and destroys information that may still be needed: by the user who wants to undo a mistake, by an auditor tracing a decision, by a regulator exercising a right of access, or by a legal hold requiring preservation of records that would otherwise be subject to purge.

Soft Delete separates the two concerns that a hard delete conflates: *hiding* a record from normal operation, and *destroying* it permanently. Deletion in this atom means the first: the record is marked as removed, excluded from standard read surfaces, and no longer available for normal use — but it is retained, attributable, and recoverable. Purge means the second: the record is permanently destroyed, with full attribution of who authorized the destruction and when. Between deletion and purge, restoration is available — the record can return to Active as though it had never been deleted.

The three-state lifecycle (Active → Deleted → Purged, with the Deleted → Active restoration path) appears across nearly every domain that handles records with any kind of lifecycle significance: content moderation (posts hidden but not erased), account management (accounts deactivated before closure), clinical records (superseded entries marked inactive but retained for audit), financial records (voided transactions retained for reconciliation), and e-discovery (records preserved in a recoverable state pending a hold decision). The states are constant across domains even when the vocabulary differs — "archived," "deactivated," "tombstoned," "voided" are all Deleted by another name.

The atom does not define what "hidden from normal query" means operationally. That is deployment policy — the atom defines the state and the recoverability guarantee; the deployment decides which read surfaces exclude Deleted records. This is deliberate: a social media platform hides deleted posts from public feeds but may surface them in moderator queues; a clinical system hides deleted observations from clinical summaries but returns them on full audit export. Neither deployment is wrong; both correctly implement the Deleted state.

Purge is the destruction surface. It is irreversible and requires explicit attribution — who authorized the destruction, when, and why. This makes Purge the atom's regulated interface: GDPR Article 17 erasure, HIPAA record destruction, and e-discovery spoliation risk all attach to the Purge action, not to the Deleted state. The atom records the purge faithfully; whether a purge is legally permissible at a given moment — whether a legal hold is active, whether the retention window has elapsed — is a composing-layer concern.

This is a freestanding concept in the EOS sense. It carries its own state (the record's lifecycle state plus deletion and purge attribution), its own actions (`soft_delete`, `restore`, `purge`, `read`), and its own invariants (terminal absorption, Purge irreversibility, attribution completeness, audit retention). Composing patterns add purge gate enforcement, access control, batch operations, and retention-window and legal-hold integration.

---

## Structure

### Store instance model

The Soft Delete atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per data domain or application boundary. `record_id` values are unique within a store instance; uniqueness across instances is a composing concern. The atom tracks lifecycle state and attribution for records whose content is managed by the host system — Soft Delete is a lifecycle overlay, not a content store. Calls implicitly target a single routed instance; instance selection is a deployment-routing concern.

### Identity model

Each record tracked by the atom has an opaque `record_id` — the identity of the record in the host system, supplied by the caller on `soft_delete`. The atom does not generate ids; it accepts them. `record_id` is immutable once a lifecycle record exists for it in the atom's store.

`deleted_by` is an opaque reference to the actor who performed the deletion. Set on `soft_delete`, immutable. Empty or whitespace-only values are rejected.

`purged_by` is an opaque reference to the actor who authorized and performed the purge. Set on `purge`, immutable. Empty or whitespace-only values are rejected.

`deletion_reason` is an optional opaque string carrying the stated reason for deletion. Set on `soft_delete`, immutable. `purge_reason` is an optional opaque string carrying the stated reason for purge. Set on `purge`, immutable.

### Inputs

- `soft_delete` calls from application logic, moderation systems, administrative interfaces, and automated lifecycle pipelines, each carrying a record id, deleting actor, optional reason, and optional explicit timestamp.
- `restore` calls from undo mechanisms, administrative recovery workflows, and appeal resolutions, carrying the record id, restoring actor, optional reason, and optional explicit timestamp.
- `purge` calls from data destruction workflows, GDPR erasure processors, retention-window expiry handlers, and administrative purge tools, carrying the record id, purging actor, required reason, and optional explicit timestamp.
- `read` queries from audit tools, moderation dashboards, compliance workflows, and DSAR processors.

### Actions

- `soft_delete(record_id, deleted_by, reason?, deleted_at?) → deleted | rejected(already-deleted | already-purged | invalid-request | storage-failure)` — mark the record as deleted. Transitions the record from Active to Deleted. Records `deleted_by`, `deletion_reason` (if supplied), and `deleted_at` (wall clock if not supplied; must not be in the future). `deleted_by` must contain at least one non-whitespace character (`invalid-request`). On the first `soft_delete` call for a `record_id` that has no lifecycle record, the atom implicitly creates the lifecycle record and transitions it to Deleted; no prior registration is required. `already-deleted` if the record is in Deleted state; `already-purged` if the record is in Purged state. `storage-failure` leaves the record in Active state; the caller must retry. Rejection priority: `already-deleted` → `already-purged` → `invalid-request` → `storage-failure`.

- `restore(record_id, restored_by, reason?, restored_at?) → restored | rejected(not-known | not-deleted | already-purged | invalid-request | storage-failure)` — return a Deleted record to Active state. Records `restored_by`, `restoration_reason` (if supplied), and `restored_at` (wall clock if not supplied; must not be in the future and must be ≥ `deleted_at`). `restored_by` must contain at least one non-whitespace character (`invalid-request`). `not-deleted` if the record is in Active state (not currently deleted). `already-purged` if the record is in Purged state — Purged records cannot be restored. `storage-failure` leaves the record in Deleted state; the caller must retry. Rejection priority: `not-known` → `not-deleted` → `already-purged` → `invalid-request` → `storage-failure`.

- `purge(record_id, purged_by, reason, purged_at?) → purged | rejected(not-known | not-deleted | invalid-request | storage-failure)` — permanently destroy the record and transition to Purged. `reason` is required for purge (not optional — the destruction of a record is an auditable decision that must carry a stated justification). Records `purged_by`, `purge_reason`, and `purged_at` (wall clock if not supplied; must not be in the future and must be ≥ `deleted_at`). `purged_by` and `reason` must each contain at least one non-whitespace character (`invalid-request`). `not-deleted` if the record is in Active state — a record must be soft-deleted before it can be purged. `storage-failure` leaves the record in Deleted state; the caller must retry. Rejection priority: `not-known` → `not-deleted` → `invalid-request` → `storage-failure`.

- `read(query) → ordered_sequence_of_records | rejected(invalid-query)` — return lifecycle records matching the query, ordered by the most recent transition timestamp descending, then by `record_id` ascending in lexicographic byte-order as a stable tiebreaker. The host system must supply `record_id` values in a format where string byte-order sort is total and deterministic. A query may filter by `record_id`, `deleted_by`, `purged_by`, `state`, or any combination including time ranges on `deleted_at`, `restored_at`, or `purged_at`. A query supplying only a `record_id` returns at most one record. A well-formed query matching no records returns an empty sequence. A time range filter on `purged_at` applied where `state: Active` or `state: Deleted` returns an empty sequence — those records carry no `purged_at`. Only malformed parameters surface as `invalid-query`: a syntactically invalid `record_id` (non-null, non-empty), an unrecognized state value, or a time range with end before start.

### Outputs

- For `soft_delete`: the outcome token `deleted`, or a rejection.
- For `restore`: the outcome token `restored`, or a rejection.
- For `purge`: the outcome token `purged`, or a rejection.
- For `read`: a (possibly empty) ordered sequence of lifecycle records. Fields present on every record: `record_id`, `state`, `deleted_by`, `deleted_at`. Optional field on deletion: `deletion_reason`. Additional fields on Deleted records that have been restored at least once: `restored_by`, `restored_at`, `restoration_reason` (most recent restore only; full restore history requires Event Log). Fields present on Purged records: `purged_by`, `purge_reason`, `purged_at` — plus all deletion fields.

### State

Each record is in exactly one state:

- **Active** — the record is in normal operation. Visible to standard read surfaces. May be soft-deleted.
- **Deleted** — the record is marked as removed and hidden from normal query surfaces. Deletion fields are set and immutable. May be restored (returning to Active) or purged (transitioning to Purged).
- **Purged** — the record has been permanently destroyed. Carries full deletion and purge attribution. Terminal; no further transitions. The lifecycle record itself is retained in the atom's store as the audit evidence of destruction — only the content of the underlying record is destroyed.

Valid transitions:

- `soft_delete(...)` → Active → Deleted
- `restore(...)` → Deleted → Active
- `purge(...)` → Deleted → Purged

No other transitions exist. A Purged record cannot be restored; a new record requires a new `record_id` registered as Active.

### Flow

1. **User deletes a post.** A social media user deletes a post. The platform calls `soft_delete(record_id: "post-8821", deleted_by: "user-4491", reason: "User-initiated delete")` → `deleted`. The post is hidden from the public feed; it remains in the atom's store in Deleted state.
2. **User restores the post.** The user reconsiders and uses the platform's "undo delete" feature within 30 days. `restore(record_id: "post-8821", restored_by: "user-4491", reason: "User-initiated restore — undo")` → `restored`. The post returns to Active; it is visible on the feed again.
3. **User deletes again; purge threshold reached.** The user deletes the post again. After 90 days in Deleted state, the platform's retention policy triggers: `purge(record_id: "post-8821", purged_by: "retention_service", reason: "90-day deleted-record purge policy")` → `purged`. The post content is destroyed. The lifecycle record in the atom's store transitions to Purged and is retained as audit evidence.
4. **Attempted restore after purge.** A support ticket asks whether the post can be recovered. `restore(record_id: "post-8821", restored_by: "support_agent_lee", reason: "Customer request")` → `rejected(already-purged)`. The purge is irreversible. The support agent can see the full lifecycle record — when it was deleted, when it was restored, when it was deleted again, and when it was purged — via `read({record_id: "post-8821"})`.
5. **GDPR erasure request.** A data subject submits an Article 17 erasure request. The DSAR workflow calls `soft_delete(record_id: "profile-4491", deleted_by: "dsar_service", reason: "GDPR Art. 17 erasure request — ticket DSR-2026-0441")` → `deleted`, then — after confirming no active legal hold blocks the purge — `purge(record_id: "profile-4491", purged_by: "dsar_service", reason: "GDPR Art. 17 erasure confirmed — no blocking hold — ticket DSR-2026-0441")` → `purged`. The lifecycle record proves the erasure was performed, attributed, and documented.

### Decision points

- **At `soft_delete`** — on first call for a `record_id` with no lifecycle record, the atom implicitly creates the lifecycle record and transitions to Deleted; there is no separate `register` action and `not-known` is not returned for new `record_id`s. `already-deleted` if the record is in Deleted state; `already-purged` if the record is in Purged state. `deleted_by` must be non-empty and non-whitespace-only. `deleted_at`, if supplied, must not be in the future. Any violation: `invalid-request`. `storage-failure` leaves the record in Active.

- **At `restore`** — `not-known` if the `record_id` has no lifecycle record; `not-deleted` if the record is Active; `already-purged` if the record is Purged. `restored_by` must be non-empty; `restored_at`, if supplied, must not be in the future and must be ≥ `deleted_at`. `storage-failure` leaves the record in Deleted.

- **At `purge`** — `not-known` if the `record_id` has no lifecycle record; `not-deleted` if the record is Active (a record must pass through Deleted before Purge — direct Active → Purge is not a valid path). `purged_by` and `reason` must each be non-empty; `purged_at`, if supplied, must not be in the future and must be ≥ `deleted_at`. `storage-failure` leaves the record in Deleted.

- **At `read`** — any supplied `record_id` must be syntactically valid (non-null, non-empty). Any supplied state filter must be one of {`Active`, `Deleted`, `Purged`}. A time range filter must have end ≥ start. Only malformed parameters surface as `invalid-query`.

### Behavior

- **Deletion and restoration are reversible; purge is not.** The Deleted → Active path is the atom's recoverability guarantee. Once a record reaches Purged, no action in this atom can recover it.
- **Purge requires a prior soft-delete.** There is no direct Active → Purged path. A record that needs to be destroyed must first be soft-deleted, making the destruction a two-step action. This is intentional: the soft-delete step creates a decision point where the record is hidden but recoverable; the purge step is the deliberate, attributed act of destruction. Systems that need immediate hard-delete behavior are outside the scope of this atom.
- **The lifecycle record survives purge.** When a record is Purged, its content is destroyed; its lifecycle record in the atom's store is retained. The Purged record carries full attribution of the deletion and the purge. Deleting the lifecycle record itself would destroy the audit evidence of the destruction, defeating the purpose of tracked purge.
- **Multiple delete/restore cycles are valid.** A record may be soft-deleted and restored multiple times before being purged. Each restore overwrites the deletion fields with the most recent delete's attribution; the full cycle history requires Event Log composition. Purge is only available from the Deleted state regardless of how many prior cycles the record has had.
- **The atom does not enforce purge eligibility.** Whether a record is legally permissible to purge — whether a legal hold is active, whether the retention window has elapsed — is a composing-layer concern. The atom records that a purge was performed; the Forensic Recovery composition and Regulated Record Retention & Defensible Deletion composition enforce the gate checks.
- **Reads are stable across states.** `read({record_id: X})` returns the lifecycle record regardless of its current state — Active, Deleted, or Purged. A query filtered to `state: Active` will not return Deleted or Purged records, but an unfiltered query by `record_id` always returns the record.

### Feedback

- After `soft_delete` — the record is now Deleted; `deleted_by`, `deleted_at`, and `deletion_reason` (if supplied) are set and immutable.
- After `restore` — the record is now Active; `restored_by`, `restored_at`, and `restoration_reason` (if supplied) are set. Prior deletion fields remain on the record.
- After `purge` — the record is now Purged; `purged_by`, `purge_reason`, and `purged_at` are set and immutable. All deletion fields are retained.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Deletion attribution is immutable within a deletion epoch.** The fields `deleted_by`, `deleted_at`, and `deletion_reason` set by a `soft_delete` call do not change as a result of `restore` or `purge`. A subsequent `soft_delete` following a `restore` replaces all three fields with the new deletion's attribution — the prior epoch's attribution is not retained by this atom. Full delete/restore cycle history requires Event Log composition. A Purged record carries the `deleted_by`, `deleted_at`, and `deletion_reason` from the most recent `soft_delete` that preceded the purge, immutably.

- **Invariant 2 — Membership exclusivity.** Every record known to the atom's store is in exactly one of {Active, Deleted, Purged} at all times.

- **Invariant 3 — Purge is terminal.** Once a record transitions to Purged, no action transitions it further. The atom has no restore-from-purge surface.

- **Invariant 4 — Purge requires prior deletion.** There is no valid transition from Active to Purged. Every Purged record passed through Deleted; every Purged record carries non-empty `deleted_by` and `deleted_at` as evidence of the deletion step.

- **Invariant 5 — Purge attribution is complete.** Every Purged record carries non-empty `purged_by`, `purge_reason`, and `purged_at`. An anonymous purge or an unexplained destruction is a conformance failure — it defeats the audit record that legal proceedings, regulatory inspections, and GDPR compliance demonstrations require.

- **Invariant 6 — Temporal ordering within each transition.** For every Purged record: `deleted_at` ≤ `purged_at`. For every restore event: `restored_at` ≥ the `deleted_at` that was current at the time `restore` was called (enforced by the Decision point). After a subsequent `soft_delete` following a restore, `deleted_at` is overwritten with the new deletion's timestamp; the stored `restored_at` from the prior cycle then predates the new `deleted_at`. This is expected: the stored fields reflect the most recent deletion epoch and the most recent restore epoch independently. Cross-epoch ordering is not guaranteed from stored fields alone; it is verifiable only via Event Log composition, which retains the full ordered history of all transitions.

- **Invariant 7 — Lifecycle record durability.** The lifecycle record for a `record_id` is never removed from the atom's store once created. The total lifecycle record count is monotonically non-decreasing. A Purged record's lifecycle record is retained as permanent audit evidence of the destruction.

- **Invariant 8 — Deletion attribution completeness.** Every record in any state carries non-empty `deleted_by` and `deleted_at` (set on first `soft_delete`). A record with no deletion attribution in Deleted or Purged state is a conformance failure.

---

## Examples

### Happy path — delete, restore, delete, purge

See Flow section. The full arc is walked there: user-initiated delete, undo restore, second delete, retention-driven purge, and failed restore attempt against the Purged record.

### Rejection path — purge an Active record

An automated purge job mistakenly targets a record that was never soft-deleted: `purge(record_id: "doc-0099", purged_by: "purge_job", reason: "scheduled purge")` → `rejected(not-deleted)`. The record is unchanged. The purge job logs the rejection and flags the record for manual review.

### Rejection path — restore a Purged record

`restore(record_id: "post-8821", restored_by: "support_agent", reason: "customer request")` → `rejected(already-purged)`. The lifecycle record is still readable; the content is gone.

### Rejection path — purge with empty reason

`purge(record_id: "profile-4491", purged_by: "dsar_service", reason: "  ")` → `rejected(invalid-request)`. Whitespace-only reason is treated as empty. The record remains in Deleted state.

### Rejection path — deleted_at in the future

`soft_delete(record_id: "order-7712", deleted_by: "admin_chen", deleted_at: "2027-01-01T00:00:00Z")` → `rejected(invalid-request)`. A deletion documented as occurring in the future has no operational meaning.

---

## Edge cases and explicit non-goals

- **`soft_delete` is not idempotent.** Calling `soft_delete` on an already-Deleted record returns `rejected(already-deleted)`, not a silent success. For idempotent delete semantics (where retrying a delete after a network timeout should not error), the caller must catch `already-deleted` and treat it as success. The atom's non-idempotency is intentional — a second `soft_delete` call is likely a bug or a retry, not a new delete intent; the caller should handle the distinction.

- **Content destruction is a host-system concern.** This atom manages lifecycle state and attribution. It does not destroy the underlying record's content — that is the host system's responsibility on receiving the `purged` outcome. The atom guarantees the Purged lifecycle record exists and is attributed; it does not implement the content deletion. A deployment that transitions to Purged without destroying content is non-conforming to the spirit of the atom but conforming to the atom's invariants — the atom cannot verify content destruction.

- **Multiple delete/restore cycles and attribution.** Each `soft_delete` overwrites `deleted_by`, `deleted_at`, and `deletion_reason` with the new deletion's attribution. Each `restore` overwrites `restored_by`, `restored_at`, and `restoration_reason`. The atom retains only the most recent deletion attribution; the full history of all cycles requires composition with [Event Log](../temporal/event-log.md).

- **Purge gate enforcement.** Whether a Deleted record is eligible for purge — whether a legal hold blocks it, whether the retention window has elapsed — is not enforced by this atom. The atom records a purge when called; it does not gate the call. Purge gate enforcement belongs to the [Forensic Recovery](../../compositions/) composition (Soft Delete + Event Log + Actor Identity + Audit Trail) and the [Regulated Record Retention & Defensible Deletion](../../ROADMAP.md) composition. Deployments that call `purge` without checking eligibility are operationally non-conforming but syntactically valid from this atom's perspective.

- **Batch operations.** One `soft_delete` call operates on one `record_id`. Bulk deletion (all records matching a query) is a composing-layer operation. Atomic bulk deletion — where all records in a set are deleted or none are — requires a transaction wrapper in the composing layer.

- **Access control.** Who may soft-delete, restore, or purge a record is not defined by this atom. That is the obligation of a composing [Permissions](../compliance/permissions.md) pattern. In regulated deployments, purge in particular is a privileged action — unrestricted purge access defeats the audit guarantee.

- **Tombstoning in distributed systems.** In distributed systems, Deleted records serve as tombstones — markers that prevent a deleted record from being re-created by a concurrent operation that hasn't yet seen the deletion. The Soft Delete atom's Deleted state serves this purpose; the Purge action removes the tombstone. Whether removing a tombstone can cause re-creation issues is a distributed-systems concern; the atom records the state faithfully.

- **GDPR Article 17 and active legal holds.** A data subject's right to erasure under GDPR Article 17 does not apply when processing is necessary for the establishment, exercise, or defence of legal claims (Article 17(3)(e)). This means a DSAR erasure request may need to be blocked if an active Legal Hold covers the record. The atom does not enforce this — it will execute a `purge` call if called. The composing layer (DSAR workflow + Legal Hold) must check for active holds before calling `purge`.

- **Clock semantics.** `deleted_at`, `restored_at`, and `purged_at` default to the receiving node's wall clock when not supplied. Each must not be in the future. Each must be ≥ the timestamp of the state transition it follows: `restored_at ≥ deleted_at`, `purged_at ≥ deleted_at`. Back-dated timestamps are accepted — documenting a deletion or purge recognized at an earlier time is valid. Clock skew, timezone normalization, and monotonicity are deployment concerns.

---

## Composition notes

Soft Delete is the recoverability and destruction primitive. Every atom that produces records with a lifecycle longer than a single session potentially composes with it:

- **[Event Log](../temporal/event-log.md)** — provides the full delete/restore cycle history that the atom retains only in summary (most-recent-delete attribution). The Event Log is the append-only record of every state transition; Soft Delete's lifecycle record is the current-state summary.
- **[Actor Identity](../compliance/actor-identity.md)** — `deleted_by`, `restored_by`, and `purged_by` are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors. In regulated contexts, purge is a regulated action requiring verifiable authorship.
- **[Audit Trail](../../compositions/audit-trail.md)** — every `soft_delete`, `restore`, and `purge` event is an auditable action; Audit Trail provides the tamper-evident, attributed, retention-governed record of the full destruction lifecycle.
- **[Legal Hold](../compliance/legal-hold.md)** — a Deleted record under an Active Legal Hold must not be purged. The Legal Hold atom records the preservation obligation; the composing layer enforces the gate. Soft Delete does not check for Legal Holds before executing `purge`.
- **[Retention Window](../compliance/retention-window.md)** — Deleted records accumulate toward or past their retention deadline. The Retention Window atom governs when purge becomes eligible; Soft Delete executes the purge when called. The two are composing peers.
- **[Permissions](../compliance/permissions.md)** — governs who may soft-delete, restore, or purge. Purge in particular should be a restricted action in any deployment handling regulated records.
- **[Duplicate Prevention](../temporal/duplicate-prevention.md)** — for deployments requiring idempotent delete semantics under retry.
- **Forthcoming:** Forensic Recovery (C3) — Soft Delete + Event Log + Actor Identity + Audit Trail, providing the complete recoverable-destruction audit surface. Regulated Record Retention & Defensible Deletion (C1) — adds Legal Hold and Retention Window gate checks to the purge path.

---

## Standards references

- **GDPR Article 17 (Right to erasure / Right to be forgotten)** — the data subject's right to request destruction of personal data. The `purge` action is the implementation surface; the Purged lifecycle record is the compliance proof. Article 17(3) exceptions (legal claims, public interest, etc.) are composing-layer concerns — the atom records the purge; the composing workflow enforces eligibility.
- **GDPR Article 5(1)(e) (Storage limitation)** — personal data may not be kept in identifiable form longer than necessary. Soft Delete + Retention Window is the structural implementation: deletion marks the record for eventual destruction; the retention clock governs when purge becomes eligible.
- **HIPAA §164.310(d)(2)(i) (Disposal)** — covered entities must implement policies for the final disposition of electronic PHI. The `purge` action + Purged lifecycle record is the disposal audit surface.
- **HIPAA §164.312(b) (Audit controls)** — electronic information systems must record and examine activity. Every `soft_delete`, `restore`, and `purge` event is an auditable action; composed with Audit Trail, the full destruction history is available for HIPAA audit.
- **Federal Rules of Civil Procedure Rule 37(e)** — failure to preserve ESI when litigation is reasonably anticipated can result in sanctions. A `purge` executed while an Active Legal Hold covers the record is the spoliation event; the Purged lifecycle record is the evidence. The atom faithfully records the destruction; whether it was permissible is a legal question.
- **SOX §802 (18 U.S.C. §1519)** — criminal obstruction-of-justice provision for destruction of documents subject to federal investigation. Purge of a record under an Active Legal Hold is the §802 risk surface; the atom's records provide the audit trail.
- **ISO 15489-1 (Records management)** — the international standard for records management. Soft Delete maps to ISO 15489's "suspension of disposition" (Deleted state); Purge maps to "authorized destruction." The two-step destruction path (soft_delete then purge) aligns with ISO 15489's requirement that destruction be deliberate and authorized.
- **NIST SP 800-88 (Guidelines for Media Sanitization)** — purge-level destruction of storage media. The `purge` action's attribution fields document who authorized the destruction; the implementation of the actual data destruction is a media-sanitization concern outside this atom's scope.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Lifecycle record retention check.** For a set of `record_id`s including Purged records, confirm that `read({record_id: X})` returns each of them. A Purged record's lifecycle record must remain in the store (Invariant 7); no `record_id` with a lifecycle record may be absent from the store.

2. **Purge attribution completeness check.** For every Purged record in the store: confirm `purged_by`, `purge_reason`, and `purged_at` are all non-empty, and that `purged_at ≥ deleted_at` (Invariant 5, Invariant 6). A Purged record with an empty attribution field or a reversed temporal ordering is a conformance failure.

3. **Two-step purge path enforcement check.** Attempt `purge` on a record in Active state (one that has never been soft-deleted). Confirm the response is `rejected(not-deleted)` and the lifecycle record is unchanged. Invariant 4 prohibits the Active → Purged direct path; this check verifies it.

4. **Terminal absorption check.** Attempt `restore` on a known Purged record. Confirm the response is `rejected(already-purged)` and the lifecycle record is unchanged. Invariant 3 guarantees Purged is terminal.

5. **Multi-cycle coherence check.** For a record: (a) `soft_delete`, record `deleted_at` as T1 and `deleted_by` as A1; (b) `restore`; (c) `soft_delete` again, record `deleted_at` as T2 and `deleted_by` as A2 (T2 > T1); (d) `purge`. Confirm the final Purged lifecycle record carries `deleted_at: T2`, `deleted_by: A2`, and `purged_at ≥ T2`, all non-empty. Confirms the most-recent-epoch attribution is correct and that the prior epoch was replaced (Invariant 1).

6. **Deletion attribution completeness check.** For every record in Deleted or Purged state: confirm `deleted_by` and `deleted_at` are non-empty (Invariant 8). A record in either state lacking deletion attribution is a conformance failure.

---

## Status

`unresolved` — foundation round and AI adversarial round complete (Sonnet, batched with Legal Hold and Consent). Human refinement round and single-atom Opus adversarial pass pending before `grounded`.

---

## Lineage notes

Non-regulated atom in `atoms/resource-lifecycle/`, with regulated obligations. *Regulated adversarial scenarios* are not required; however, given the atom's direct role in GDPR erasure, HIPAA disposal, and e-discovery spoliation, a *Generation acceptance* section is required and has been added above. Provisional Commitment is the reference shape for resource-lifecycle atoms; Legal Hold is the reference for the attribution and terminal-state patterns carried here.

**Pass 1 — Structural completeness (GRID).** Three findings, all closed in-pattern.

- *`soft_delete` first-call semantics ambiguous.* The initial draft was silent on what happens when `soft_delete` is called for a `record_id` that has never been registered. Should the atom require an explicit `register` action first, or should `soft_delete` implicitly create the lifecycle record? Evaluated: a separate `register` action adds a step that callers would universally skip or forget, and creates a failure mode (calling `soft_delete` on an unregistered record) that has no clear recovery. The implicit-registration model — first `soft_delete` creates the lifecycle record — is cleaner and matches how composing systems naturally call the atom. Fixed: Decision point at `soft_delete` specifies implicit creation.

- *Outputs section under-specified.* Multiple restore cycles produce multiple sets of `restored_by`/`restored_at` fields; the spec was silent on whether the atom tracks all of them or only the most recent. Fixed: Outputs now states "most recent restore only; full restore history requires Event Log composition" — parallel to Medication Order's cumulative field principle.

- *`read` ordering not defined.* Initial draft had no stated ordering. Fixed: `read` ordered by most recent transition timestamp descending, then `record_id` ascending as stable tiebreaker. "Most recent transition" is the right primary sort for a lifecycle-audit tool — the most recently changed records surface first.

All nine GRID nodes resolved.

**Pass 2 — Conceptual independence (EOS).** Clean. Three extraction candidates evaluated; all kept in-pattern.

- *Content destruction as over-absorption candidate.* Should the atom destroy the underlying record's content, or only manage its lifecycle state? Evaluated: content destruction requires knowing the host system's storage model — database rows, blob storage, file system. Absorbing that knowledge breaks freestanding status. The atom signals `purged`; the host system executes the content destruction. This is the correct EOS boundary. Clean; explicitly named in Edge cases.

- *Purge gate as over-absorption candidate.* Should the atom check Legal Hold and Retention Window before executing `purge`? Evaluated: checking Legal Hold requires importing Legal Hold semantics; checking Retention Window requires importing Retention Window semantics. Both break freestanding status. The purge gate belongs to the composition. Clean; explicitly named as out-of-scope.

- *Multiple delete/restore cycle history as separate atom candidate.* Could the full cycle history justify extraction as a separate atom? Evaluated: cycle history is Event Log applied to this atom's state transitions — it is not a new concept, it is a composition. The atom retains only current-state attribution; the Event Log composition provides the full history. Clean; composition note added.

**Pass 3 — Adversarial scrutiny (Linus mode).** Five findings, all closed in-pattern.

- *Direct Active → Purged path not explicitly prohibited.* The initial draft described valid transitions but did not state that Active → Purged is invalid. An implementor could read the state diagram as permitting direct purge if the Deleted step was inconvenient. The two-step requirement is load-bearing: it creates a recovery window and makes destruction a two-decision process. Fixed: Invariant 4 added — "There is no valid transition from Active to Purged." Decision point at `purge` updated — `not-deleted` if the record is Active.

- *`purge_reason` was optional in the initial draft.* Every other reason field in the library is optional (`deletion_reason`, `restoration_reason`). Purge reason was made optional by analogy. But purge is categorically different from deletion — it is an irreversible destruction of a record that may have legal significance. An unexplained purge defeats the audit trail at the most consequential point. Fixed: `purge` action signature updated — `reason` is required, not optional. Decision point reflects the non-empty validation.

- *Temporal ordering between timestamps not guaranteed by any invariant.* A Purged record with `purged_at < deleted_at` is incoherent. A restored record with `restored_at < deleted_at` is incoherent. No invariant named these bounds. Fixed: Invariant 6 added — temporal ordering on `deleted_at`, `restored_at`, and `purged_at`. Decision points at `restore` and `purge` updated to validate the lower bound.

- *Lifecycle record survival after purge not stated as invariant.* The intent said the lifecycle record persists; the Behavior section said it; but no Invariant locked it. An implementor optimizing storage could delete the lifecycle record on purge and still claim compliance. Fixed: Invariant 7 added — lifecycle record durability; the lifecycle record is retained permanently after purge.

- *`soft_delete` non-idempotency handling not addressed.* A calling system that retries after a network timeout receives `already-deleted` on the second call and may treat this as an error. The spec was silent on whether `already-deleted` should be treated as success by callers. Fixed: Edge case added — `soft_delete` is not idempotent; callers that need idempotent semantics must catch `already-deleted` and treat it as success.
