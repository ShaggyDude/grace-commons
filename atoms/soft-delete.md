---
title: Soft Delete
parent: Atomic Concepts
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

## Summary

Soft Delete splits apart the two things an ordinary "delete" lumps together: hiding a record from normal use, and destroying it for good.

Here, "deleting" only does the first — the record is marked as removed and kept out of normal views, but it stays in storage, it records who deleted it, and it can be brought back. "Purging" does the second — the record is destroyed permanently, again recording who authorized it and when. Between deletion and purge there is always a way back: a deleted record can be restored as if nothing happened.

The pattern tracks three states — Active, Deleted, and Purged — and once something is Purged there is no return; even then, a small record of the destruction (who, when, why) is kept as evidence, while the actual content is gone.

Purge is the part that regulators care about — it is where data-erasure laws and records-destruction rules apply — but the pattern only records the destruction faithfully; deciding whether a given purge is actually allowed (a legal hold in effect, a retention period not yet elapsed) is left to other patterns that wrap around it.

---

## Intent

Most systems eventually need to delete records. The naive implementation — remove the row, free the storage — is irreversible and destroys information that may still be needed: by the user who wants to undo a mistake, by an auditor tracing a decision, by a regulator exercising a right of access, or by a legal hold requiring preservation of records that would otherwise be subject to purge.

Soft Delete separates the two concepts that a hard delete conflates: *hiding* a record from normal operation, and *destroying* it permanently. Deletion in this atom means the first: the record is marked as removed, excluded from standard read surfaces, and no longer available for normal use — but it is retained, attributable, and recoverable. Purge means the second: the record is permanently destroyed, with full attribution of who authorized the destruction and when. Between deletion and purge, restoration is available — the record can return to Active as though it had never been deleted.

The three-state lifecycle (Active → Deleted → Purged, with the Deleted → Active restoration path) appears across nearly every domain that handles records with any kind of lifecycle significance: content moderation (posts hidden but not erased), account management (accounts deactivated before closure), clinical records (superseded entries marked inactive but retained for audit), financial records (voided transactions retained for reconciliation), and e-discovery (records preserved in a recoverable state pending a hold decision). The states are constant across domains even when the vocabulary differs — "archived," "deactivated," "tombstoned," "voided" are all Deleted by another name.

The atom does not define what "hidden from normal query" means operationally. That is deployment policy — the atom defines the state and the recoverability guarantee; the deployment decides which read surfaces exclude Deleted records. This is deliberate: a social media platform hides deleted posts from public feeds but may surface them in moderator queues; a clinical system hides deleted observations from clinical summaries but returns them on full audit export. Neither deployment is wrong; both correctly implement the Deleted state.

Purge is the destruction surface. It is irreversible and requires explicit attribution — who authorized the destruction, when, and why. This makes Purge the atom's regulated interface: GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Article 17 erasure, HIPAA (Health Insurance Portability and Accountability Act — US federal law governing healthcare data privacy and security) record destruction, and e-discovery spoliation risk all attach to the Purge action, not to the Deleted state. The atom records the purge faithfully; whether a purge is legally permissible at a given moment — whether a legal hold is active, whether the retention window has elapsed — is handled at the composing layer. The records carry the full attribution chain of deletion and destruction, immutable by specification; cryptographic protection of those records against post-hoc modification — the bar for court-admissible and regulator-admissible evidence — is added by composition with [Tamper Evidence](./tamper-evidence.md), not by this atom alone.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the record's lifecycle state plus deletion and purge attribution), its own actions (`soft_delete`, `restore`, `purge`, `read`), and its own invariants — conditions that must always hold — (terminal absorption, Purge irreversibility, attribution completeness, audit retention). Composing patterns add purge gate enforcement, access control, batch operations, and retention-window and legal-hold integration.

---

## Structure

### Store instance model

The Soft Delete atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per data domain or system boundary. [Record Id] values are unique within a store instance; uniqueness across instances is handled at the composing layer. The atom tracks lifecycle state and attribution for records whose content is managed by the host system — Soft Delete is a lifecycle overlay, not a content store. Calls implicitly target a single routed instance; instance selection is handled at the deployment-routing layer.

### Identity model

Each record tracked by the atom has an opaque [Record Id] — the identity of the record in the host system, supplied by the caller on [Soft Delete]. The atom does not generate ids; it accepts them. [Record Id] is immutable (unchangeable once written) once a lifecycle record exists for it in the atom's store.

[Deleted By] is an opaque reference to the actor who performed the deletion. Set on [Soft Delete], immutable. Empty or whitespace-only values are rejected.

[Purged By] is an opaque reference to the actor who authorized and performed the purge. Set on [Purge], immutable. Empty or whitespace-only values are rejected.

[Deletion Reason] is an optional opaque string carrying the stated reason for deletion. Set on [Soft Delete], immutable. [Purge Reason] is an optional opaque string carrying the stated reason for purge. Set on [Purge], immutable.

### Inputs

- [Soft Delete] calls from host-system logic, moderation systems, administrative interfaces, and automated lifecycle pipelines, each carrying a record id, deleting actor, optional reason, and optional explicit timestamp.
- [Restore] calls from undo mechanisms, administrative recovery workflows, and appeal resolutions, carrying the record id, restoring actor, optional reason, and optional explicit timestamp.
- [Purge] calls from data destruction workflows, GDPR erasure processors, retention-window expiry handlers, and administrative purge tools, carrying the record id, purging actor, required reason, and optional explicit timestamp.
- [Read] queries from audit tools, moderation dashboards, compliance workflows, and DSAR (Data Subject Access Request — a request by an individual to see, correct, or erase the personal data an organization holds about them) processors.

### Actions

For optional parameters across [Soft Delete], [Restore], [Purge], and [Read], "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies.

- [Soft Delete] — (Projected contract: `soft_delete(record_id, deleted_by, reason?, deleted_at?) → deleted | rejected(invalid-request | already-deleted | already-purged | storage-failure)`) — mark the record as deleted. Transitions the record from [Active] to [Deleted]. The [Record Id] parameter must itself contain at least one non-whitespace character ([Invalid Request]); a null, empty, or whitespace-only [Record Id] is malformed and rejected before any state check. Records [Deleted By], [Deletion Reason] (if supplied), and [Deleted At] (wall clock if not supplied; must not be in the future — when caller-supplied; a wall-clock default is "now" by construction). [Deleted By] must contain at least one non-whitespace character ([Invalid Request]). On the first [Soft Delete] call for a well-formed [Record Id] that has no lifecycle record, the atom implicitly creates the lifecycle record and transitions it directly to [Deleted]; no prior registration is required. [Already Deleted] if the record is in [Deleted] state; [Already Purged] if the record is in [Purged] state. [Storage Failure] leaves the record in its prior state ([Active] for new records means no record is created; [Active] for restored records means the record stays [Active]); the caller must retry. Rejection priority: malformed [Record Id] ([Invalid Request]) → [Already Deleted] → [Already Purged] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- [Restore] — (Projected contract: `restore(record_id, restored_by, reason?, restored_at?) → restored | rejected(invalid-request | not-known | not-deleted | already-purged | storage-failure)`) — return a [Deleted] record to [Active] state. The [Record Id] parameter must itself contain at least one non-whitespace character ([Invalid Request]); a null, empty, or whitespace-only [Record Id] is rejected before the existence check. Records [Restored By], [Restoration Reason] (if supplied), and [Restored At] (wall clock if not supplied). The resolved [Restored At] — whether caller-supplied or wall-clock-defaulted — must not be in the future (the future-bound applies only when caller-supplied) and must be ≥ the record's current [Deleted At]. The `≥ deleted_at` bound applies to the resolved value regardless of how it was derived; this enforces Invariant 6 against clock-skew artifacts as well as caller-supplied backdated values. [Restored By] must contain at least one non-whitespace character ([Invalid Request]). [Not Deleted] if the record is in [Active] state. [Already Purged] if the record is in [Purged] state — Purged records cannot be restored. [Storage Failure] leaves the record in [Deleted] state; the caller must retry. Rejection priority: malformed [Record Id] ([Invalid Request]) → [Not Known] → [Not Deleted] → [Already Purged] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- [Purge] — (Projected contract: `purge(record_id, purged_by, reason, purged_at?) → purged | rejected(invalid-request | not-known | not-deleted | storage-failure)`) — permanently destroy the record and transition to [Purged]. The [Record Id] parameter must itself contain at least one non-whitespace character ([Invalid Request]); a null, empty, or whitespace-only [Record Id] is rejected before the existence check. [Reason] is required for purge (not optional — the destruction of a record is an auditable decision that must carry a stated justification). Records [Purged By], [Purge Reason], and [Purged At] (wall clock if not supplied). The resolved [Purged At] — whether caller-supplied or wall-clock-defaulted — must not be in the future (the future-bound applies only when caller-supplied) and must be ≥ the record's current [Deleted At]. The `≥ deleted_at` bound applies to the resolved value regardless of how it was derived; this enforces Invariant 6 against clock-skew artifacts as well as caller-supplied backdated values. [Purged By] and [Reason] must each contain at least one non-whitespace character ([Invalid Request]). [Not Deleted] if the record is in [Active] state — a record must be soft-deleted before it can be purged. [Storage Failure] leaves the record in [Deleted] state; the caller must retry. Rejection priority: malformed [Record Id] ([Invalid Request]) → [Not Known] → [Not Deleted] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- [Read] — (Projected contract: `read(query) → ordered_sequence_of_records | rejected(invalid-query)`) — return lifecycle records matching the query, ordered by the most recent transition timestamp descending, then by [Record Id] ascending in lexicographic byte-order as a stable tiebreaker. The host system must supply [Record Id] values in a format where string byte-order sort is total and deterministic. The supported filter axes are exactly: [Record Id], [Deleted By], [Purged By], [State], and time ranges on [Deleted At], [Restored At], or [Purged At]. Any combination of supported axes is valid. A query supplying only a [Record Id] returns at most one record. A well-formed query matching no records returns an empty sequence. [Read] operates only over records that have a lifecycle record in the atom's store — that is, records that have undergone at least one [Soft Delete]. Records that have never been soft-deleted are outside the atom's scope and do not appear in any [Read] result.

  **Time-range filters on absent fields.** A time-range filter on a field implicitly excludes records that do not carry that field at evaluation time. [Purged At] is present only on [Purged] records; a [Purged At] filter implicitly excludes [Active] and [Deleted] records, regardless of whether a [State] filter is also supplied. [Restored At] is present only on records that have been restored at least once ([Active] records returned to Active from Deleted, or [Deleted] records that have a prior restore in their epoch chain); a [Restored At] filter implicitly excludes never-restored records. A [State] filter combined with a time-range filter on a field absent from records of that state returns an empty sequence by the same rule.

  **Malformed-query rules ([Invalid Query]):** a [Record Id], [Deleted By], or [Purged By] filter value that is null, empty, or whitespace-only is [Invalid Query] (the filter axes exist; the values are malformed). A [State] filter value that is not one of {[Active], [Deleted], [Purged]} is [Invalid Query]. A time range with end before start is [Invalid Query]. A query carrying an unrecognized filter key — any key outside the supported axes named above — is [Invalid Query]; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

### Outputs

- For [Soft Delete]: the outcome token `deleted`, or a rejection.
- For [Restore]: the outcome token `restored`, or a rejection.
- For [Purge]: the outcome token `purged`, or a rejection.
- For [Read]: a (possibly empty) ordered sequence of lifecycle records. The atom returns lifecycle records only for [Record Id]s that have undergone at least one [Soft Delete]; records that have never been soft-deleted have no lifecycle record and do not appear. Fields present on every lifecycle record (any state): [Record Id], [State], [Deleted By], [Deleted At] — the deletion fields carry the most recent delete's attribution, retained on the record across subsequent restore and purge transitions. Optional field set on the most recent deletion: [Deletion Reason] (present if supplied on that [Soft Delete]; absent otherwise). Additional fields present on records that have been restored at least once (whether currently [Active] or subsequently re-deleted): [Restored By], [Restored At], [Restoration Reason] (most recent restore only; full restore history requires Event Log composition). Fields present on [Purged] records: [Purged By], [Purge Reason], [Purged At] — plus all deletion and restore fields the record carries. [Active] records (restored from Deleted) and [Deleted] records that have a prior restore in their cycle history both carry the restore fields; the difference is the [State] field value.

### State

**Scope of the atom's state machine.** The atom tracks records that have entered its lifecycle via a [Soft Delete] call. Records that have never been soft-deleted are outside the atom's scope: they are conceptually "Active" in the host system but the atom has no lifecycle record for them, no [Read] result returns them, and they are not "in" any of the atom's states. The state machine below applies to records the atom has a lifecycle record for.

Each tracked record is in exactly one state at any time:

- **[Active]** — the record is in normal operation in the host system. Within the atom, an Active lifecycle record is one that was previously soft-deleted and then restored (`Deleted → Active`); the atom does not have lifecycle records for records that have never been soft-deleted. Active records visible to the atom carry the deletion and restore attribution from the most recent prior cycle. May be soft-deleted again (transitioning back to [Deleted]).
- **[Deleted]** — the record is marked as removed and hidden from normal query surfaces in the host system. Deletion fields are set and are immutable within the current deletion epoch (Invariant 1). May be restored (returning to [Active]) or purged (transitioning to [Purged]).
- **[Purged]** — the record has been permanently destroyed. Carries full deletion and purge attribution. Terminal; no further transitions. The lifecycle record itself is retained in the atom's store as the audit evidence of destruction — only the content of the underlying record is destroyed.

**Valid transitions.** No other transitions exist, and every action is fail-closed — a rejected call writes nothing and leaves the record in its prior state ([Storage Failure] included). [Purged] is terminal ([Restore] and [Purge] against it are rejected). A [Purge] requires a prior [Soft Delete]: there is no direct [Active] → [Purged] path. A new conceptual record requires a new [Record Id] — the atom provides no "untrack" or "reset" surface.

| Action | From | Guard | To | Effect |
|---|---|---|---|---|
| [Soft Delete] | — (no lifecycle record) | valid [Record Id] | [Deleted] | creates the lifecycle record (the entry point into the state machine) |
| [Soft Delete] | [Active] (tracked) | valid [Record Id] | [Deleted] | a re-deletion; overwrites the deletion fields |
| [Restore] | [Deleted] | resolved [Restored At] ≥ [Deleted At] | [Active] | overwrites the restore fields |
| [Purge] | [Deleted] | [Reason] required; resolved [Purged At] ≥ [Deleted At] | [Purged] | content destroyed; lifecycle record retained as audit evidence |

### Flow

1. **User deletes a post.** A social media user deletes a post. The platform calls `soft_delete(record_id: "post-8821", deleted_by: "user-4491", reason: "User-initiated delete")` → `deleted`. The post is hidden from the public feed; it remains in the atom's store in [Deleted] state.
2. **User restores the post.** The user reconsiders and uses the platform's "undo delete" feature within 30 days. `restore(record_id: "post-8821", restored_by: "user-4491", reason: "User-initiated restore — undo")` → `restored`. The post returns to [Active]; it is visible on the feed again.
3. **User deletes again; purge threshold reached.** The user deletes the post again. After 90 days in Deleted state, the platform's retention policy triggers: `purge(record_id: "post-8821", purged_by: "retention_service", reason: "90-day deleted-record purge policy")` → `purged`. The post content is destroyed. The lifecycle record in the atom's store transitions to [Purged] and is retained as audit evidence.
4. **Attempted restore after purge.** A support ticket asks whether the post can be recovered. `restore(record_id: "post-8821", restored_by: "support_agent_lee", reason: "Customer request")` → `rejected(already-purged)`. The purge is irreversible. The support agent can see the full lifecycle record — when it was deleted, when it was restored, when it was deleted again, and when it was purged — via `read({record_id: "post-8821"})`.
5. **GDPR erasure request.** A data subject submits an Article 17 erasure request. The DSAR workflow calls `soft_delete(record_id: "profile-4491", deleted_by: "dsar_service", reason: "GDPR Art. 17 erasure request — ticket DSR-2026-0441")` → `deleted`, then — after confirming no active legal hold blocks the purge — `purge(record_id: "profile-4491", purged_by: "dsar_service", reason: "GDPR Art. 17 erasure confirmed — no blocking hold — ticket DSR-2026-0441")` → `purged`. The lifecycle record proves the erasure was performed, attributed, and documented.

### Decision points

- **At [Soft Delete]** — the [Record Id] parameter is checked first: if null, empty, or whitespace-only, the call is [Invalid Request]. If [Record Id] is well-formed and the atom has no lifecycle record for it, the atom implicitly creates the lifecycle record and transitions it directly to [Deleted]; there is no separate `register` action and [Not Known] is not returned for new [Record Id]s. If a lifecycle record exists: [Already Deleted] if it is in [Deleted] state; [Already Purged] if it is in [Purged] state. Attribution checks: [Deleted By] must contain at least one non-whitespace character ([Invalid Request]); [Deleted At], if supplied, must not be in the future. [Storage Failure] leaves the record in its prior state (no lifecycle record created for new ids; existing tracked records unchanged). Rejection priority: malformed [Record Id] ([Invalid Request]) → [Already Deleted] → [Already Purged] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- **At [Restore]** — the [Record Id] parameter is checked first: if null, empty, or whitespace-only, the call is [Invalid Request]. If well-formed: [Not Known] if no lifecycle record exists for it; [Not Deleted] if the record is [Active]; [Already Purged] if the record is [Purged]. Attribution and temporal checks: [Restored By] must contain at least one non-whitespace character ([Invalid Request]); the resolved [Restored At] (caller-supplied or wall-clock-defaulted) must be ≥ the record's current [Deleted At], and must not be in the future when caller-supplied. The `≥ deleted_at` bound applies to the resolved value regardless of derivation; this enforces Invariant 6 against clock-skew artifacts. [Storage Failure] leaves the record in [Deleted]. Rejection priority: malformed [Record Id] ([Invalid Request]) → [Not Known] → [Not Deleted] → [Already Purged] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- **At [Purge]** — the [Record Id] parameter is checked first: if null, empty, or whitespace-only, the call is [Invalid Request]. If well-formed: [Not Known] if no lifecycle record exists for it; [Not Deleted] if the record is [Active] (a record must pass through [Deleted] before Purge — direct [Active] → Purge is not a valid path). Attribution and temporal checks: [Purged By] and [Reason] must each contain at least one non-whitespace character ([Invalid Request]); the resolved [Purged At] (caller-supplied or wall-clock-defaulted) must be ≥ the record's current [Deleted At], and must not be in the future when caller-supplied. The `≥ deleted_at` bound applies to the resolved value regardless of derivation. [Storage Failure] leaves the record in [Deleted]. Rejection priority: malformed [Record Id] ([Invalid Request]) → [Not Known] → [Not Deleted] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- **At [Read]** — every supplied filter value must be well-formed for its axis. A [Record Id], [Deleted By], or [Purged By] filter value that is null, empty, or whitespace-only is [Invalid Query]. A [State] filter value not in {[Active], [Deleted], [Purged]} is [Invalid Query]. A time range with end before start is [Invalid Query]. An unrecognized filter key — any key outside the supported axes — is [Invalid Query]; the spec rejects rather than ignores unknown keys. Time-range filters on fields absent from a state's records (e.g., [Purged At] on [Active] or [Deleted]; [Restored At] on never-restored records) implicitly return empty sequences for those records. A well-formed query matching no records returns an empty sequence.

### Behavior

- **Deletion and restoration are reversible; purge is not.** The [Deleted] → [Active] path is the atom's recoverability guarantee. Once a record reaches [Purged], no action in this atom can recover it.
- **Purge requires a prior soft-delete.** There is no direct [Active] → [Purged] path. A record that needs to be destroyed must first be soft-deleted, making the destruction a two-step action. This is intentional: the soft-delete step creates a decision point where the record is hidden but recoverable; the purge step is the deliberate, attributed act of destruction. Systems that need immediate hard-delete behavior are outside the scope of this atom.
- **The lifecycle record survives purge.** When a record is [Purged], its content is destroyed; its lifecycle record in the atom's store is retained. The [Purged] record carries full attribution of the deletion and the purge. Deleting the lifecycle record itself would destroy the audit evidence of the destruction, defeating the purpose of tracked purge.
- **Multiple delete/restore cycles are valid.** A record may be soft-deleted and restored multiple times before being purged. Each [Soft Delete] overwrites the deletion fields ([Deleted By], [Deleted At], [Deletion Reason]) with the new deletion's attribution; each [Restore] overwrites the restore fields ([Restored By], [Restored At], [Restoration Reason]) with the new restore's attribution. The atom retains only the most recent attribution in each category; the full cycle history requires Event Log composition. Purge is only available from the [Deleted] state regardless of how many prior cycles the record has had.
- **The atom does not enforce purge eligibility.** Whether a record is legally permissible to purge — whether a legal hold is active, whether the retention window has elapsed — is handled at the composing layer. The atom records that a purge was performed; the Forensic Recovery composition and Regulated Record Retention & Defensible Deletion composition enforce the gate checks.
- **Reads are stable across states.** `read({record_id: X})` returns the lifecycle record regardless of its current state — [Active], [Deleted], or [Purged]. A query filtered to `state: Active` will not return [Deleted] or [Purged] records, but an unfiltered query by [Record Id] always returns the record.

### Feedback

- After [Soft Delete] — the record is now [Deleted]; [Deleted By], [Deleted At], and [Deletion Reason] (if supplied) are set and immutable.
- After [Restore] — the record is now [Active]; [Restored By], [Restored At], and [Restoration Reason] (if supplied) are set. Prior deletion fields remain on the record.
- After [Purge] — the record is now [Purged]; [Purged By], [Purge Reason], and [Purged At] are set and immutable. All deletion fields are retained.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Deletion attribution is immutable within a deletion epoch.** The fields [Deleted By], [Deleted At], and [Deletion Reason] set by a [Soft Delete] call do not change as a result of [Restore] or [Purge]. A subsequent [Soft Delete] following a [Restore] replaces all three fields with the new deletion's attribution — the prior epoch's attribution is not retained by this atom. Full delete/restore cycle history requires Event Log composition. A [Purged] record carries the [Deleted By], [Deleted At], and [Deletion Reason] from the most recent [Soft Delete] that preceded the purge, immutably.

- **Invariant 2 — Membership exclusivity.** Every record the atom has a lifecycle record for (every record that has undergone at least one [Soft Delete]) is in exactly one of {[Active], [Deleted], [Purged]} at all times. Records that have never been soft-deleted are outside the atom's state machine and are not "in" any of these states; they have no lifecycle record.

- **Invariant 3 — Purge is terminal.** Once a record transitions to [Purged], no action transitions it further. The atom has no restore-from-purge surface.

- **Invariant 4 — Purge requires prior deletion.** There is no valid transition from [Active] to [Purged]. Every [Purged] record passed through [Deleted]; every [Purged] record carries [Deleted By] (a string with at least one non-whitespace character) and [Deleted At] (a set timestamp) as evidence of the deletion step.

- **Invariant 5 — Purge attribution is complete.** Every [Purged] record carries [Purged By] and [Purge Reason] each containing at least one non-whitespace character, and a [Purged At] timestamp that is set. An anonymous purge, a whitespace-only reason, or a missing purge timestamp is a conformance failure — each defeats the audit record that legal proceedings, regulatory inspections, and GDPR compliance demonstrations require.

- **Invariant 6 — Temporal ordering within each transition.** For every [Purged] record: [Deleted At] ≤ [Purged At], where [Deleted At] is the most recent deletion's timestamp. For every restore event: [Restored At] ≥ the [Deleted At] that was current at the time [Restore] was called. Both bounds apply to the value persisted in the record, regardless of whether the timestamp was caller-supplied or wall-clock-defaulted; the [Restore] and [Purge] Decision points enforce these bounds against the resolved value before the transition is committed. After a subsequent [Soft Delete] following a restore, [Deleted At] is overwritten with the new deletion's timestamp; the stored [Restored At] from the prior cycle then predates the new [Deleted At]. This is expected: the stored fields reflect the most recent deletion epoch and the most recent restore epoch independently. Cross-epoch ordering is not guaranteed from stored fields alone; it is verifiable only via Event Log composition, which retains the full ordered history of all transitions.

- **Invariant 7 — Lifecycle record durability.** The lifecycle record for a [Record Id] is never removed from the atom's store once created. The total lifecycle record count is monotonically non-decreasing. A [Purged] record's lifecycle record is retained as permanent audit evidence of the destruction.

- **Invariant 8 — Deletion attribution completeness.** Every record the atom has a lifecycle record for (any state — [Active], [Deleted], or [Purged]) carries [Deleted By] (a string with at least one non-whitespace character) and [Deleted At] (a set timestamp), reflecting the most recent [Soft Delete]. A tracked record with a blank [Deleted By] or a missing [Deleted At] is a conformance failure.

---

## Examples

### Happy path — delete, restore, delete, purge

See Flow section. The full arc is walked there: user-initiated delete, undo restore, second delete, retention-driven purge, and failed restore attempt against the Purged record.

### Rejection path — purge an Active record

An automated purge job mistakenly targets a record that was never soft-deleted: `purge(record_id: "doc-0099", purged_by: "purge_job", reason: "scheduled purge")` → `rejected(not-deleted)`. The record is unchanged. The purge job logs the rejection and flags the record for manual review.

### Rejection path — restore a Purged record

`restore(record_id: "post-8821", restored_by: "support_agent", reason: "customer request")` → `rejected(already-purged)`. The lifecycle record is still readable; the content is gone.

### Rejection path — purge with empty reason

`purge(record_id: "profile-4491", purged_by: "dsar_service", reason: "  ")` → `rejected(invalid-request)`. Whitespace-only reason is treated as empty. The record remains in [Deleted] state.

### Rejection path — future-dated `deleted_at`

`soft_delete(record_id: "order-7712", deleted_by: "admin_chen", deleted_at: "2027-01-01T00:00:00Z")` → `rejected(invalid-request)`. A deletion documented as occurring in the future has no operational meaning.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts, beyond happy-path and rejection-path:

- **Regulator audit.** A GDPR supervisory authority asks: *"show me evidence that the data subject's erasure request for profile-4491 was completed — that the record was destroyed, by whom, and when."* The auditor queries `read({record_id: "profile-4491"})`. The [Purged] lifecycle record returns: `state: Purged`, `purged_by: "dsar_service"`, `purge_reason: "GDPR Art. 17 erasure confirmed — no blocking hold — ticket DSR-2026-0441"`, `purged_at: <timestamp>`, and the deletion attribution from the prior [Soft Delete] call. Invariant 5 (purge attribution completeness) and Invariant 7 (lifecycle record durability) together guarantee this record exists and is fully attributed. The auditor sees a structural guarantee — a non-empty, fully-attributed [Purged] record — not a procedural assurance. The same query pattern applies to HIPAA record-disposal audits and SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) §802 records-management reviews.
- **Disputed erasure — data subject challenges the purge.** A data subject claims their profile was not erased or was erased without their request. The compliance team queries `read({record_id: "profile-4491"})`. The Purged lifecycle record names the purge actor, the stated reason (referencing the DSAR ticket), the purge timestamp, and the deletion actor and timestamp from the prior deletion step. Invariant 4 (purge requires prior deletion) and Invariant 5 (purge attribution completeness) together establish the two-step documented chain: who deleted the record and why, who authorized and executed the purge and why. The data subject's challenge is answered by the records alone. If the records show no purge (the record is still [Deleted]), the compliance team has evidence the erasure was not completed and a remediation path.
- **Breach or incident investigation.** An incident responder investigates whether records for users in a compromised account range were purged during the incident window (02:00–04:00 UTC — Coordinated Universal Time, the global time standard — on a given date). The query: `read({state: Purged, purged_at: [start, end]})`. The results list every record purged in the window with full attribution — [Purged By], [Purge Reason], [Purged At]. Each result is cross-checked against the expected authorized purge actors; unexpected attributions are immediate findings. Invariant 7 (lifecycle record durability) guarantees that a purge performed during the window cannot be erased from the store after the fact; Invariant 5 (purge attribution completeness) guarantees that every purge in the result set is fully attributed. If any purge carries an actor outside the authorized set, the incident record names the finding structurally.

These scenarios exercise the atom against the questions regulators, data subjects, and investigators actually ask. Happy-path and rejection-path examples cover what users and operators do; adversarial scenarios cover what auditors, data subjects, and incident responders do.

---

## Edge cases and explicit non-goals

- **[Soft Delete] is not idempotent.** Calling [Soft Delete] on an already-[Deleted] record returns `rejected(already-deleted)`, not a silent success. For idempotent delete semantics (where retrying a delete after a network timeout should not error), the caller must catch [Already Deleted] and treat it as success. The atom's non-idempotency is intentional — a second [Soft Delete] call is likely a bug or a retry, not a new delete intent; the caller should handle the distinction.

- **Content destruction is handled by the host system.** This atom manages lifecycle state and attribution. It does not destroy the underlying record's content — that is the host system's responsibility on receiving the `purged` outcome. The atom guarantees the [Purged] lifecycle record exists and is attributed; it does not implement the content deletion. A deployment that transitions to [Purged] without destroying content is non-conforming to the spirit of the atom but conforming to the atom's invariants — the atom cannot verify content destruction.

- **Multiple delete/restore cycles and attribution.** Each [Soft Delete] overwrites [Deleted By], [Deleted At], and [Deletion Reason] with the new deletion's attribution. Each [Restore] overwrites [Restored By], [Restored At], and [Restoration Reason]. The atom retains only the most recent deletion attribution; the full history of all cycles requires composition with [Event Log](./event-log.md).

- **Purge gate enforcement.** Whether a [Deleted] record is eligible for purge — whether a legal hold blocks it, whether the retention window has elapsed — is not enforced by this atom. The atom records a purge when called; it does not gate the call. Purge gate enforcement belongs to the [Defensible Retention](../compositions/defensible-retention.md) composition (Legal Hold + Retention Window + Audit Trail — the hold-blocks-purge gate; grounded); the [Forensic Recovery](../compositions/forensic-recovery.md) composition (Soft Delete + Audit Trail substrate; `grounded` 2026-06-04) provides the attributed, tamper-evident, full-history-recoverable destruction audit surface but deliberately does not gate purge eligibility. Deployments that call [Purge] without checking eligibility are operationally non-conforming but syntactically valid from this atom's perspective.

- **Batch operations.** One [Soft Delete] call operates on one [Record Id]. Bulk deletion (all records matching a query) is a composing-layer operation. Atomic bulk deletion — where all records in a set are deleted or none are — requires a transaction wrapper in the composing layer.

- **Access control.** Who may soft-delete, restore, or purge a record is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In regulated deployments, purge in particular is a privileged action — unrestricted purge access defeats the audit guarantee.

- **Tombstoning in distributed systems.** In distributed systems, Deleted records serve as tombstones — markers that prevent a deleted record from being re-created by a concurrent operation that hasn't yet seen the deletion. The Soft Delete atom's [Deleted] state serves this purpose; the [Purge] action removes the tombstone. Whether removing a tombstone can cause re-creation issues is handled at the distributed-systems layer; the atom records the state faithfully.

- **GDPR Article 17 and active legal holds.** A data subject's right to erasure under GDPR Article 17 does not apply when processing is necessary for the establishment, exercise, or defence of legal claims (Article 17(3)(e)). This means a DSAR erasure request may need to be blocked if an active Legal Hold covers the record. The atom does not enforce this — it will execute a [Purge] call if called. The composing layer (DSAR workflow + Legal Hold) must check for active holds before calling [Purge].

- **Clock semantics.** [Deleted At], [Restored At], and [Purged At] default to the receiving node's wall clock when not supplied. The future-bound (must not be in the future) applies to caller-supplied values; wall-clock defaults are "now" by construction. The `≥ deleted_at` bound on [Restored At] and [Purged At] applies to the **resolved** value — caller-supplied or wall-clock-defaulted — so a clock-skewed node cannot write a record that violates Invariant 6 even when defaulting. Back-dated timestamps are accepted (subject to the lower bound) — documenting a deletion or purge recognized at an earlier time is valid. Clock skew, timezone normalization, and monotonicity are handled at the deployment layer.

- **Concurrency.** Two systems concurrently calling [Soft Delete] on the same [Record Id] must be serialized; the first transitions the record (or creates it) into [Deleted], the second receives [Already Deleted]. Two systems concurrently calling [Restore] on the same [Record Id] must be serialized; the first transitions [Deleted] → [Active], the second receives [Not Deleted]. Two systems concurrently calling [Purge] on the same [Deleted] [Record Id] must be serialized; the first transitions [Deleted] → [Purged], the second receives [Not Deleted] (the record is no longer in [Deleted] state — [Purged] is not [Deleted]). Implementations must serialize state transitions on a given [Record Id].

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Soft Delete

The behavior that marks a record as removed and hidden but recoverable — transitioning it to [Deleted] (creating the lifecycle record on the first call for a new [Record Id]) and recording [Deleted By], [Deleted At], and an optional [Deletion Reason]. Returns `deleted`, or a rejection ([Invalid Request], [Already Deleted], [Already Purged], [Storage Failure]).

Kind: Operation

#### Restore

The behavior that returns a [Deleted] record to [Active], recording [Restored By], [Restored At], and an optional [Restoration Reason]. Rejected for an unknown ([Not Known]), non-[Deleted] ([Not Deleted]), or [Purged] ([Already Purged]) record.

Kind: Operation

#### Purge

The behavior that permanently destroys a [Deleted] record's content and transitions it to terminal [Purged], recording [Purged By], a required [Purge Reason], and [Purged At]. The lifecycle record survives as audit evidence. Rejected for a non-[Deleted] record ([Not Deleted]).

Kind: Operation

#### Read

The read-only query returning lifecycle records — only for [Record Id]s that have undergone at least one [Soft Delete] — ordered by most-recent transition timestamp then [Record Id]. Filterable by [Record Id], [Deleted By], [Purged By], [State], or time ranges on [Deleted At] / [Restored At] / [Purged At]. Rejected [Invalid Query] for a malformed filter.

Kind: Operation

#### Record Id

The opaque identity of the record in the host system — supplied by the caller on [Soft Delete] (the atom accepts ids, never generates them), immutable once a lifecycle record exists (Invariant 7). Unique within a store instance.

Kind:     Field
Field of: the lifecycle record
Projects: record_id

#### State

The record's lifecycle state — [Active], [Deleted], or [Purged] (Invariant 2). Set on each transition; exactly one value at any time.

Kind:     Field
Field of: the lifecycle record
Projects: state

#### Deleted By

The opaque reference to the actor who performed the most recent deletion. Set on [Soft Delete], non-whitespace (Invariant 8), immutable within the deletion epoch (Invariant 1).

Kind:     Field
Field of: the lifecycle record
Projects: deleted_by

#### Deleted At

The timestamp of the most recent deletion. Set on [Soft Delete] (caller-supplied or wall-clock-defaulted; not in the future); immutable within the epoch. The lower bound for [Restored At] and [Purged At] (Invariant 6).

Kind:     Field
Field of: the lifecycle record
Projects: deleted_at

#### Deletion Reason

The optional stated reason for the most recent deletion — the [Reason] parameter of [Soft Delete], stored under this name. Immutable within the epoch.

Kind:     Field
Field of: the lifecycle record
Projects: deletion_reason

#### Restored By

The opaque reference to the actor who performed the most recent restore. Set on [Restore].

Kind:     Field
Field of: the lifecycle record
Projects: restored_by

#### Restored At

The timestamp of the most recent restore. Set on [Restore]; must be ≥ the then-current [Deleted At] (Invariant 6) and not in the future.

Kind:     Field
Field of: the lifecycle record
Projects: restored_at

#### Restoration Reason

The optional stated reason for the most recent restore — the [Reason] parameter of [Restore], stored under this name.

Kind:     Field
Field of: the lifecycle record
Projects: restoration_reason

#### Purged By

The opaque reference to the actor who authorized and performed the purge. Set on [Purge], non-whitespace (Invariant 5), immutable.

Kind:     Field
Field of: the lifecycle record
Projects: purged_by

#### Purged At

The timestamp of the purge. Set on [Purge]; must be ≥ [Deleted At] (Invariant 6) and not in the future.

Kind:     Field
Field of: the lifecycle record
Projects: purged_at

#### Purge Reason

The required stated reason for the purge — the [Reason] parameter of [Purge], stored under this name. Non-whitespace (Invariant 5), immutable. Unlike the deletion and restore reasons, purge's reason is mandatory.

Kind:     Field
Field of: the lifecycle record
Projects: purge_reason

#### Reason

The stated justification an action carries — optional on [Soft Delete] and [Restore], required on [Purge]. Consumed at the action and stored under the action-specific field name ([Deletion Reason], [Restoration Reason], or [Purge Reason]), not under this name.

Kind:         Parameter
Parameter of: Soft Delete, Restore, Purge
Projects:     reason

#### Active

The state of a tracked record in normal operation — reached only by a [Restore] from [Deleted] (a record never soft-deleted has no lifecycle record and is not in any atom state). May be soft-deleted again.

Kind:      Member
Member of: the lifecycle state
Role:      Outcome

#### Deleted

The state of a record marked as removed and hidden but retained and recoverable. Deletion fields are set and immutable within the epoch (Invariant 1). May be restored or purged.

Kind:      Member
Member of: the lifecycle state
Role:      Outcome

#### Purged

The terminal state of a record whose content has been permanently destroyed; the lifecycle record is retained as audit evidence (Invariant 7). Absorbing — no action transitions out of it (Invariant 3).

Kind:      Member
Member of: the lifecycle state
Role:      Outcome

#### Invalid Request

The rejection [Soft Delete], [Restore], or [Purge] returns for a malformed [Record Id], a missing or whitespace-only attribution field ([Deleted By] / [Restored By] / [Purged By]) or [Reason], or a future-dated or out-of-order timestamp.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Already Deleted

The rejection [Soft Delete] returns when the target record is already in [Deleted] state (non-idempotent by design).

Kind:      Member
Member of: the Soft Delete rejection
Role:      Outcome
Projects:  already-deleted

#### Already Purged

The rejection [Soft Delete] or [Restore] returns when the target record is already [Purged] — a [Purged] record cannot be re-deleted or restored (Invariant 3).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  already-purged

#### Storage Failure

The rejection any write action returns when the store write fails after all preconditions pass; the record is left in its prior state (Invariant 7).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The rejection [Restore] or [Purge] returns when the [Record Id] references no lifecycle record in the store.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Not Deleted

The rejection [Restore] or [Purge] returns when the record is [Active] — there is nothing to restore, and a [Purge] requires a prior [Deleted] state (Invariant 4).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-deleted

#### Invalid Query

The rejection [Read] returns for a malformed filter — a null or whitespace-only [Record Id], [Deleted By], or [Purged By]; a [State] outside the three values; a reversed time range; or an unrecognized filter key.

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Soft Delete]: #soft-delete
[Restore]: #restore
[Purge]: #purge
[Read]: #read
[Record Id]: #record-id
[State]: #state
[Deleted By]: #deleted-by
[Deleted At]: #deleted-at
[Deletion Reason]: #deletion-reason
[Restored By]: #restored-by
[Restored At]: #restored-at
[Restoration Reason]: #restoration-reason
[Purged By]: #purged-by
[Purged At]: #purged-at
[Purge Reason]: #purge-reason
[Reason]: #reason
[Active]: #active
[Deleted]: #deleted
[Purged]: #purged
[Invalid Request]: #invalid-request
[Already Deleted]: #already-deleted
[Already Purged]: #already-purged
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Not Deleted]: #not-deleted
[Invalid Query]: #invalid-query

---

## Composition notes

Soft Delete is the recoverability and destruction primitive. Every atom that produces records with a lifecycle longer than a single session potentially composes with it:

- **[Event Log](./event-log.md)** — provides the full delete/restore cycle history that the atom retains only in summary (most-recent-delete attribution). The Event Log is the append-only (records can be added but never changed or deleted) record of every state transition; Soft Delete's lifecycle record is the current-state summary.
- **[Actor Identity](./actor-identity.md)** — [Deleted By], [Restored By], and [Purged By] are opaque references; Actor Identity provides cryptographic attestation that those references are real, credentialed actors. In regulated contexts, purge is a regulated action requiring verifiable authorship.
- **[Audit Trail](../compositions/audit-trail.md)** — every [Soft Delete], [Restore], and [Purge] event is an auditable action; Audit Trail provides the tamper-evident, attributed, retention-governed record of the full destruction lifecycle.
- **[Legal Hold](./legal-hold.md)** — a [Deleted] record under an Active Legal Hold must not be purged. The Legal Hold atom records the preservation obligation; the composing layer enforces the gate. Soft Delete does not check for Legal Holds before executing [Purge].
- **[Retention Window](./retention-window.md)** — [Deleted] records accumulate toward or past their retention deadline. The Retention Window atom governs when purge becomes eligible; Soft Delete executes the purge when called. The two are composing peers.
- **[Permissions](./permissions.md)** — governs who may soft-delete, restore, or purge. Purge in particular should be a restricted action in any deployment handling regulated records.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for deployments requiring idempotent delete semantics under retry.
- **[Forensic Recovery](../compositions/forensic-recovery.md)** (`grounded` 2026-06-04) — Soft Delete + Audit Trail (substrate), providing the complete attributed, tamper-evident, full-history-recoverable destruction audit surface (every delete/restore/purge attributed and sealed; `recover_history` reconstructs the full ordered lifecycle). **[Defensible Retention](../compositions/defensible-retention.md)** (grounded) — adds the Legal Hold + Retention Window purge-eligibility gate (hold-blocks-purge) that Forensic Recovery deliberately does not.

---

## Standards references

- **GDPR Article 17 (Right to erasure / Right to be forgotten)** — the data subject's right to request destruction of personal data. The [Purge] action is the implementation surface; the [Purged] lifecycle record is the compliance proof. Article 17(3) exceptions (legal claims, public interest, etc.) are handled at the composing layer — the atom records the purge; the composing workflow enforces eligibility.
- **GDPR Article 5(1)(e) (Storage limitation)** — personal data may not be kept in identifiable form longer than necessary. Soft Delete + Retention Window is the structural implementation: deletion marks the record for eventual destruction; the retention clock governs when purge becomes eligible.
- **HIPAA §164.310(d)(2)(i) (Disposal)** — covered entities must implement policies for the final disposition of electronic PHI (Protected Health Information — individually identifiable health data covered by HIPAA). The [Purge] action + [Purged] lifecycle record is the disposal audit surface.
- **HIPAA §164.312(b) (Audit controls)** — electronic information systems must record and examine activity. Every [Soft Delete], [Restore], and [Purge] event is an auditable action; composed with Audit Trail, the full destruction history is available for HIPAA audit.
- **Federal Rules of Civil Procedure (FRCP — the rules governing civil lawsuits in US federal courts) Rule 37(e)** — failure to preserve ESI (Electronically Stored Information — digital records subject to legal discovery) when litigation is reasonably anticipated can result in sanctions. A [Purge] executed while an Active Legal Hold covers the record is the spoliation event; the [Purged] lifecycle record is the evidence. The atom faithfully records the destruction; whether it was permissible is a legal question.
- **SOX §802 (18 U.S.C. §1519)** — criminal obstruction-of-justice provision for destruction of documents subject to federal investigation. Purge of a record under an Active Legal Hold is the §802 risk surface; the atom's records provide the audit trail.
- **ISO 15489-1 (Records management)** — the International Organization for Standardization's standard for records management. Soft Delete maps to ISO 15489's "suspension of disposition" ([Deleted] state); Purge maps to "authorized destruction." The two-step destruction path ([Soft Delete] then [Purge]) aligns with ISO 15489's requirement that destruction be deliberate and authorized.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-88 (Guidelines for Media Sanitization)** — purge-level destruction of storage media. The [Purge] action's attribution fields document who authorized the destruction; the implementation of the actual data destruction is handled at the media-sanitization layer and is outside this atom's scope.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Lifecycle record retention check.** For a set of [Record Id]s including Purged records, confirm that `read({record_id: X})` returns each of them. A [Purged] record's lifecycle record must remain in the store (Invariant 7); no [Record Id] with a lifecycle record may be absent from the store.

2. **Purge attribution completeness check.** For every [Purged] record in the store: confirm [Purged By] and [Purge Reason] each contain at least one non-whitespace character, confirm [Purged At] is set, and confirm `purged_at ≥ deleted_at` (Invariants 5 and 6). A [Purged] record with a blank attribution string, a missing [Purged At], or a reversed temporal ordering is a conformance failure.

3. **Two-step purge path enforcement check.** Attempt [Purge] on a record in [Active] state (one that has never been soft-deleted). Confirm the response is `rejected(not-deleted)` and the lifecycle record is unchanged. Invariant 4 prohibits the [Active] → [Purged] direct path; this check verifies it.

4. **Terminal absorption check.** Attempt [Restore] on a known [Purged] record. Confirm the response is `rejected(already-purged)` and the lifecycle record is unchanged. Invariant 3 guarantees Purged is terminal.

5. **Multi-cycle coherence check.** For a record: (a) [Soft Delete], record [Deleted At] as T1 and [Deleted By] as A1; (b) [Restore]; (c) [Soft Delete] again, record [Deleted At] as T2 and [Deleted By] as A2 (T2 > T1); (d) [Purge]. Confirm the final [Purged] lifecycle record carries `deleted_at: T2`, `deleted_by: A2` (string with at least one non-whitespace character), and [Purged At] set with `purged_at ≥ T2`. Confirms the most-recent-epoch attribution is correct and that the prior epoch was replaced (Invariant 1).

6. **Deletion attribution completeness check.** For every tracked record (any state): confirm [Deleted By] contains at least one non-whitespace character and [Deleted At] is set (Invariant 8). A tracked record with a blank [Deleted By] or a missing [Deleted At] is a conformance failure.

---

## Status

`grounded on Final Critique 4 — 2026-05-20` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-05-20
formal: not applicable — vote no 2026-06-03
last gate: 2026-05-20 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/soft-delete.md`.
