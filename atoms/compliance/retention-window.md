---
title: Retention Window
parent: Compliance
grand_parent: Atomic Concepts
nav_order: 2
has_toc: true
toc: true
---

# Retention Window

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A compliance primitive: a record is kept under retention for a known period, then purged. Each retention has an opaque (system-generated, with no meaningful content) immutable (unchangeable once written) id; the record reference, retention policy, retention-end deadline, and purge deadline are immutable properties, set at retention-start. Two states — Retained, Purged. Purge is forbidden before the retention period ends; purge after the period is the expected transition; the gap between retention-end and purge-deadline is the *purge window*, and operating past it is observable overshoot — visible in the records, prevented only by policy.

---

## Intent

Every regulated record has a bounded life. Tax records must be kept seven years and then permitted to be destroyed; medical records must be kept six years (federal HIPAA) or longer per state law; cardholder data must be retained as briefly as the business need permits; broker-dealer communications must survive three-to-seven years under SEC rules; audit workpapers must persist seven years under SOX §802. The shape is constant across domains — a record enters retention, the retention clock runs, the record becomes eligible (or obligated) for purge, the record is purged. The deviation is the data: too-short retention violates obligation; too-long retention violates data-minimization; neither is acceptable to a regulator.

The pattern addresses the *how long* question that record-keeping discipline cannot answer with documentation alone. A retention policy says *"keep for seven years."* The retention atom enforces that promise structurally — purge cannot happen before the policy's clock runs out, and the record's lifecycle is observable to any external evaluator from the record's own fields.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the retention record), its own actions (place under retention, purge), and its own operational principles (the retention window is binding for its duration; purge is terminal; the audit can see whether retention obligations were met). It does not implement storage tier (active vs. cold), legal hold, cryptographic shredding, policy registry management, or right-to-erasure. Each is a separate composable atom; see Composition notes.

---

## Summary

Retention Window is the compliance atom (a freestanding pattern spec — one that does not name any other pattern — that captures a single software concept with its own state and actions) that enforces the structural rule that a record must be kept for a minimum period and then becomes eligible for destruction. It answers the question *"has this record's retention obligation been honored?"* by recording, for every managed record, exactly which retention policy applies, when the retention period ends, and when the latest acceptable purge date falls. The atom prevents premature deletion: calling `purge` before the retention period has elapsed is rejected outright. It also surfaces overdue records: any record still retained past its purge deadline is visible in the data as an overshoot metric, observable by any compliance dashboard without needing developer narration.

Each retention has two key deadlines computed at the time it is placed: `retention_until` (the earliest date purge is permitted) and `purge_deadline` (the latest date the regulator expects purge to occur). The window between those two dates is the purge window — the period during which the record's destruction is both legally permissible and expected. The atom enforces the opening boundary (no purge before `retention_until`) but treats the closing boundary as observable rather than enforced: a record purged past its deadline is a compliance finding surfaced by the records themselves, not a rejected operation, because refusing a late purge would compound the violation rather than resolve it.

The most common uses are: seven-year SOX (Sarbanes-Oxley Act — US financial reporting law) retention of transaction and audit records in financial systems; HIPAA (US Health Insurance Portability and Accountability Act) retention of medical records to federal and state minimums; PCI DSS data-minimization requirements for cardholder data, where the goal is to purge as quickly as the business need permits; SEC retention of broker-dealer communications; and contract retention beyond the end of the contract's commercial life because legal claims can outlast the underlying transaction.

Retention Window does not cover storage tier (where a record lives physically), legal hold (suspending purge during litigation), cryptographic shredding (destroying keys to make encrypted records irrecoverable), the right to erasure under GDPR (EU General Data Protection Regulation), or the registry of what retention policies exist. Each is a separate composable pattern. The atom's responsibility is the retention lifecycle of a single record: place, wait, purge, and produce an audit trail of the entire arc.

---

## Structure

### Identity model

Every retention known to the system has a **`retention_id`** — an opaque, immutable, system-generated identifier produced by `place_under_retention`. The id is the retention's identity; the record reference, policy reference, and the derived deadlines are immutable *properties* of the retention, not its identity.

Two retentions over the same record (one expiring, replaced by another under a new policy) have distinct ids — each retention is its own audit record. Ids are not reused.

The opaque-id model preserves the same per-event audit discipline the other regulated atoms enforce. Identifying a retention by `(record_ref, policy_ref)` would collapse legitimate policy-change scenarios (an old policy retention completing, a new policy retention beginning over the same record); identifying by start timestamp would lose precision under concurrent placements. Opaque ids preserve the one-retention-one-id discipline that lets auditors reconstruct the policy history of any record.

### Inputs

- A record reference identifying *what* is being retained. The atom treats this as opaque — the host system defines what counts as a record and how to reference it.
- A policy reference identifying *which retention rules apply*. Also opaque — the policy registry is a separate concern. The atom requires only that the policy expose a `duration` (the retention period) and a `max_purge_delay` (the maximum allowed lag between retention-end and purge).
- Actions:
  - `place_under_retention(record_ref, policy_ref) → retention_id | rejected(invalid-request | invalid-policy | policy-not-found | storage-failure)`
  - `purge(retention_id) → ok | rejected(not-retained | not-known | retention-period-not-elapsed | storage-failure)`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of Retained retentions.
- The current set of Purged retentions.
- For each retention: `retention_id`, `record_ref`, `policy_ref`, `retained_at`, `retention_until`, `purge_deadline`, state, and (if applicable) `purged_at`.
- Action acknowledgements — success (returning `retention_id` for `place_under_retention`, `ok` otherwise) or rejection with a named reason.

### State

A retention, once created, occupies exactly one of two states:

- **Retained** — the record is under active retention obligation. The retention window may or may not have elapsed; purge has not yet occurred.
- **Purged** — the record has been purged; the retention is terminal.

Two states only. *Storage tier* (active storage vs. cold storage) is a separate axis, owned by a Storage Tier composing pattern — a record may move from active to cold storage at any time without changing its retention state. This is the Pass 2 finding documented in Lineage notes: archive-as-state-transition would absorb a concern that recurs across many regulated records and belongs to its own atom.

Each retention carries:

- **`retention_id`** — opaque, immutable, system-generated. Set on `place_under_retention`. Never changes.
- **`record_ref`** — the record reference. Set on `place_under_retention`. Never changes.
- **`policy_ref`** — the policy reference. Set on `place_under_retention`. Never changes.
- **`retained_at`** — set on `place_under_retention`. Never changes.
- **`retention_until`** — set on `place_under_retention` as `retained_at + policy.duration`. Never changes.
- **`purge_deadline`** — set on `place_under_retention` as `retention_until + policy.max_purge_delay`. Never changes. This is the *latest* the regulator expects purge to occur; operating past it is observable overshoot.
- **`purged_at`** — set on `purge`, present only in Purged.

Transitions:

- `place_under_retention(record_ref, policy_ref)` → retention enters Retained with a fresh `retention_id`, `retained_at = now`, derived `retention_until` and `purge_deadline`. Returns `retention_id`.
- `purge(retention_id)` → retention moves Retained → Purged; `purged_at = now`. Returns `ok`.

### Flow

1. **Place under retention.** The host system records the record under retention, with a policy. The atom records the retention in Retained, with the derived deadlines.
2. **Retention period runs.** While `now < retention_until`, the record is under active retention obligation; purge is forbidden. The record may move between storage tiers (active to cold) per the composing pattern, but its retention state does not change.
3. **Retention period elapses.** At `now ≥ retention_until`, the record is eligible for purge. Until purge occurs, the retention remains in Retained.
4. **Purge.** The host system invokes `purge(retention_id)`. The retention transitions Retained → Purged; the underlying record is destroyed by the storage layer (or shredded cryptographically — see Composition notes).
5. **Settled.** The retention record persists in Purged indefinitely from the atom's perspective. The retention record itself is metadata about a destroyed record; what happens to the retention record under its own lifetime is the meta-question composing patterns address.

### Decision points

- **At `place_under_retention(record_ref, policy_ref)`** — `record_ref` and `policy_ref` must each contain at least one non-whitespace character; otherwise `invalid-request`. The `policy_ref` must resolve to a known policy in the policy registry; otherwise `policy-not-found`. The resolved policy's `duration` must be positive and `max_purge_delay` must be non-negative; otherwise `invalid-policy`. If the retention store write fails after all preconditions pass, the atom returns `rejected(storage-failure)` — no retention is recorded. The host system is responsible for ensuring the `record_ref` refers to an existing record; the atom does not validate against the host's record store.
- **At `purge(retention_id)`** — `retention_id` must reference a retention currently in Retained; otherwise `not-retained` (already Purged) or `not-known` (no such id). `now ≥ retention_until` must hold; otherwise `retention-period-not-elapsed`. The atom does *not* reject purges that arrive past `purge_deadline` — at that point the regulator expects purge to have happened, and refusing the late purge would compound the overshoot. The lateness is observable in `purged_at` relative to `purge_deadline`; the audit names it. If the Retained → Purged transition fails to persist, the atom returns `rejected(storage-failure)` — the retention remains in Retained and the underlying record is not destroyed. The caller must retry; see *Purge persistence failure* in Edge cases.

### Behavior

Observed behavior, derived from how regulated systems use retention:

- A retention is not a promise of immediate destruction at `retention_until`. The regulator expects purge to occur between `retention_until` and `purge_deadline` — the *purge window*. The atom enforces that purge cannot run before `retention_until`; it observes (but does not enforce) the upper bound. This is the regulator's actual posture: too-early purge is a violation of retention obligation; too-late purge is a violation of data-minimization; the atom prevents the first and surfaces the second.
- The retention policy is immutable for any given `retention_id`. Extending or shortening a retention requires releasing the current retention (impossible by design — terminal absorption) or placing a new retention under a different policy when the underlying record is in a state that allows it. Policy mutation through this atom is not supported; legal hold and similar dynamic encumbrances belong to composing patterns.
- The retention record itself outlives the underlying data. After `purge(retention_id)` succeeds, the underlying record is destroyed, but the retention record (with `retained_at`, `purged_at`, `policy_ref`) remains — it is the audit evidence that retention was honored. What happens to that audit record (its own retention, archival, anonymization) is a recursive question composing patterns handle.
- Concurrent purge invocations for the same `retention_id` resolve serially under the host environment's serialization guarantees. The first wins; the second receives `not-retained`. This is the same idempotency story Provisional Commitment names; an [Idempotent Reservation](../../compositions/idempotent-reservation.md)-style composition supplies retry safety.
- Wall-time is best-effort. Clock skew, daylight saving, timezone handling are deployment concerns. Where retention deadlines have legal force (statute of limitations, regulatory clock), the implementation must source time from a trustworthy clock; a composed Trusted Timestamping pattern produces the verifiable time-anchor.

### Feedback

Each successful action produces an observable, measurable change:

- After `place_under_retention(record_ref, policy_ref)` — a new retention appears in Retained with a fresh `retention_id`, `retained_at`, `retention_until`, and `purge_deadline`. Retained count and total count each increase by one. The id is returned to the caller.
- After `purge(retention_id)` — the retention moves Retained → Purged with `purged_at`. Retained count decreases by one; Purged count increases by one; total count unchanged.

Each rejected action produces an observable refusal: `invalid-request`, `invalid-policy`, `policy-not-found`, or `storage-failure` (for `place_under_retention`); `not-retained`, `not-known`, `retention-period-not-elapsed`, or `storage-failure` (for `purge`).

The Retained and Purged sets are queryable. The *overshoot* metric — for any Purged retention, `purged_at - purge_deadline` if positive — is computable from the records alone. The *active overdue* metric — for any Retained retention, `now - purge_deadline` if positive — is similarly computable. Both surface to compliance dashboards as derived views; the atom does not compute them but does not hide them.

### Invariants

The following invariants (conditions that must always hold, regardless of what sequence of actions has occurred) constitute the verification surface of the pattern:

- **Invariant 1 — Membership exclusivity.** For every retention `r` known to the system, `r` is in exactly one of {Retained, Purged}.
- **Invariant 2 — Retain-then-Retained persistence.** After a successful `place_under_retention`, the resulting retention is in Retained and remains so until `purge` is invoked.
- **Invariant 3 — Terminal absorption.** Once a retention enters Purged, no action transitions it elsewhere. The atom has no *un-purge* or *restore* surface.
- **Invariant 4 — Id stability.** A retention's `retention_id` is set on `place_under_retention` and never changes.
- **Invariant 5 — Record_ref and policy_ref immutability.** A retention's `record_ref` and `policy_ref` are set on `place_under_retention` and never change. Re-retaining the same record under a different policy produces a new retention with a new id.
- **Invariant 6 — Retention window monotonicity.** For every retention, `retained_at < retention_until ≤ purge_deadline`. The policy's `duration` is positive and `max_purge_delay` is non-negative.
- **Invariant 7 — No early purge.** A retention can transition to Purged only while `now ≥ retention_until`. Purge before retention-end is rejected; this is the regulator's structural guarantee that retention obligations cannot be silently shortened.
- **Invariant 8 — Purge timestamp consistency.** For any Purged retention, `retention_until ≤ purged_at`. The atom does not constrain `purged_at` relative to `purge_deadline` — overshoot is observable but not forbidden. This invariant is best-effort under non-monotonic clocks; a clock that moves backward between the eligibility check (`now ≥ retention_until`) and the timestamp capture (`purged_at = now`) can violate the inequality. The implementor is responsible for the monotonicity guarantee; see Clock semantics in Edge cases.
- **Invariant 9 — No id reuse.** No two distinct retentions share a `retention_id` across the lifetime of the system.
- **Invariant 10 — Retention store durability.** Retention records are never deleted from the store. `purge` transitions a retention from Retained to Purged; it does not remove the record. The total retention count is monotonically non-decreasing. A `retention_id` returned by a successful `place_under_retention` call is durably persisted; a `storage-failure` rejection guarantees no partial record was written. The retention record in Purged state is the audit evidence that the underlying record was lawfully destroyed; deleting it would destroy that evidence.

Membership exclusivity and terminal absorption together give the *audit-friendly* property — once purged, the record is irrecoverable, and the audit trail of the destruction is durable. No-early-purge gives the *retention-honored* property — the regulator's structural guarantee. Purge-timestamp-consistency lets auditors compute overshoot directly from the record without trusting any external clock.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Banking — transaction-record retention under SOX

A bank places every settled transaction under retention with a 7-year policy (`policy_sox_settled_txn`: duration = 7 years, max_purge_delay = 30 days). At the seven-year mark, the records become eligible for purge; the bank's records-management system invokes `purge(retention_id)` within the 30-day purge window. Each purge is logged for SOX (Sarbanes-Oxley Act — US financial reporting law) §802 audit. An external auditor querying *"any transaction record purged before its 7-year obligation?"* gets the empty set — Invariant 7 guarantees it.

### Healthcare — medical-record retention under HIPAA and state law

A hospital places each patient encounter record under retention with the maximum of HIPAA's (US Health Insurance Portability and Accountability Act) federal 6-year baseline (45 CFR §164.530(j)) and the state's longer requirement (often 10–25 years for adult records, longer for pediatric). The policy_ref captures the applicable rule; the retention's `retention_until` is the patient-specific deadline. Purges occur on a rolling schedule; the audit reads the retention records to demonstrate compliance with the longer of the applicable rules.

### Payments — cardholder-data retention under PCI DSS

A payment processor places cardholder-data records (PAN, expiration, CVV-substitute tokens) under retention with the *shortest* viable policy — typically days for transient transaction data, never longer than business need requires. PCI DSS Requirement 3.1 mandates data minimization. The atom's no-early-purge invariant becomes less relevant here (windows are short); the overshoot metric becomes the audit's primary concern, surfacing any cardholder data still Retained past `purge_deadline`.

### Communications — broker-dealer communications under SEC Rule 17a-4

A registered broker-dealer places every business communication (email, chat, voice transcript) under retention with policies derived from SEC Rule 17a-4 — generally 3 years, with the first 2 years in immediately-accessible storage. The atom carries the retention obligation; storage-tier transitions (immediately-accessible to less-accessible) belong to a Storage Tier composition. A FINRA examination reads the retention records to confirm that every required communication was retained for the full period and purged only after.

### Legal — contract retention beyond contract term

A company places each executed contract under retention with policy = max(contract duration + 6 years, statute-of-limitations for relevant claim types). The retention extends past the operational life of the contract because the contract's audit obligations outlive its commercial life. Litigation hold composes by suspending purge eligibility during pending litigation (a Legal Hold composition; out of scope for the atom).

### Rejection paths

**Premature purge attempt.** A records-management system attempts to purge a transaction record four years into a seven-year SOX retention period:

```
purge(retention_id: "ret-0047")
→ rejected(retention-period-not-elapsed)
```

`retention_until` has not been reached; the atom rejects the purge outright. No state change occurs; the record remains in Retained. The rejection is the structural enforcement of Invariant 7 — early purge is not just refused, it is structurally impossible.

**Policy reference not resolvable.** A host system calls `place_under_retention` with a policy reference that does not resolve to a known policy:

```
place_under_retention(record_ref: "txn-1188", policy_ref: "policy-obsolete-v1")
→ rejected(policy-not-found)
```

No retention is created. The host system must supply a valid, resolvable policy reference before any retention can be placed.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator audit — "show me every record purged before its retention period elapsed."** The auditor queries the Purged set for any record where `purged_at < retention_until`. Invariant 7 makes this set structurally empty — the precondition on `purge` prevents it. The auditor sees the empty result as a structural guarantee, not a procedural promise.
- **Data minimization audit — "show me every record still Retained past its purge deadline."** Common under GDPR Article 5(1)(e) reviews. The auditor queries Retained for records where `now > purge_deadline`. The atom does not refuse late purges (rejecting them would compound the overshoot), so this query returns a non-empty set when the organization is behind on its purge schedule. The overshoot is the finding; the records themselves are the evidence; the remediation is to purge the listed records and document the lateness.
- **Litigation discovery — "produce all records of type X from 2020-2022."** Counsel queries the host system; the host system reads the retention records to determine which matching records still exist (Retained) versus which have been Purged. Purged records are unrecoverable — that is the atom's terminal-absorption invariant working as designed. The discovery response distinguishes *records retained and produced* from *records lawfully destroyed under the policy in effect at the time*, with the retention records themselves as the audit trail. Litigation hold should have been placed earlier — if it wasn't, that is a Legal Hold composition failure, not a retention failure.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Storage tier (active vs. cold).** Where a record physically lives — immediately-accessible storage, near-line storage, off-site cold archive — is orthogonal to retention. A Storage Tier composing pattern owns the active/cold transition; this atom records only whether the retention obligation is open or closed. SEC Rule 17a-4's "first two years immediately accessible" requirement, for example, composes Retention Window with a Storage Tier pattern that times the active-to-cold transition.
- **Legal hold / litigation hold.** Pending litigation, regulatory investigation, or other legal preservation orders suspend the host system's ability to purge. The atom does not represent this — `purge` would still be valid at `retention_until`, which is wrong under a hold. A Legal Hold composing pattern intercepts purge attempts and rejects them while the hold is active. The hold itself is a separate retention-like state with its own lifecycle.
- **Cryptographic shredding.** Some records cannot be directly deleted (append-only logs, distributed-system replicas, immutable storage). Effective purge in those cases means destroying the cryptographic keys that make the records readable — the record persists in encrypted form but becomes irrecoverable. A Cryptographic Shredding composing pattern implements this; this atom's `purge` action treats both forms — direct deletion and key destruction — as the same state transition. The implementation chooses which mechanism applies.
- **Right-to-be-forgotten (GDPR Art. 17).** A data subject's erasure request can trump scheduled retention. The atom does not represent this — early purge under erasure right is forbidden by Invariant 7. The composing pattern is a coordinated Erasure pattern that either (a) cryptographically shreds the personal-data fields while preserving the structural retention record, or (b) demonstrates that the retention obligation overrides the erasure right (HIPAA-mandated retention typically does). Legal counsel adjudicates.
- **Policy registry management.** What policies exist, who defines them, how they are versioned, who attests to their alignment with regulation — out of scope. A Policy Registry composing pattern owns this. The atom takes `policy_ref` as opaque.
- **Retention extension by policy change.** Once a retention is in Retained with a given `policy_ref`, the atom does not allow the policy to change. Mid-retention regulatory changes (a statute that retroactively extends a retention period, for instance) require composing patterns that place new retentions under the new policy and reconcile against the original. This is real and consequential; legal counsel is in the loop.
- **Recursive retention of the retention records.** The atom's records themselves are subject to retention. The atom does not loop on itself; the host system manages the meta-retention with a separate policy.
- **Concurrency and atomicity.** State transitions are atomic per `retention_id`. A crash mid-transition that leaves a retention in neither Retained nor Purged violates Invariant 1; the implementor is responsible for the transactional boundary. Multi-retention transactions (purging a batch atomically) belong to a Transaction pattern.
- **Clock semantics.** Wall-time from the implicit clock. Where retention deadlines have legal force, the implementation must source time from a trustworthy clock; a composed Trusted Timestamping pattern produces the verifiable time-anchor.
- **What counts as "purged."** Full deletion, tombstone marking, cryptographic shredding, off-site overwrite — all valid implementations of `purge`. The atom requires only that, post-purge, the underlying record become irrecoverable through ordinary queries. The specific destruction technique is implementation policy.
- **Non-repudiation of the purge action.** Who authorized the purge, and the verifiable proof of that authorization, is the job of an [Actor Identity](./actor-identity.md) composition. Without it, the purge record names a `purger` field opaquely; with it, the field is a verifiable attestation. Required under several regulatory regimes (21 CFR Part 11, HIPAA audit-control rules) for destruction of regulated records.
- **Multiple simultaneous retentions for the same record.** The atom allows multiple Retained retentions for the same `record_ref` — one under policy A and another under policy B, both simultaneously active. This is legitimate in policy-transition scenarios (an old policy retention completing, a new policy retention started under revised rules), but operationally tricky: the composing system must ensure the applicable policy is selected correctly, and purge eligibility is governed by the *longer* retention (both must be purged, not just one). The atom records each retention independently; the composing system is responsible for semantics of overlapping retentions.
- **Purge persistence failure.** If the Retained → Purged state transition is computed but the store write fails, the atom returns `rejected(storage-failure)` and the retention remains in Retained — the underlying record is not destroyed. Unlike `grant` storage failures, this is not a security failure but a data-minimization failure: the record should have been destroyed but wasn't. Callers must treat `storage-failure` from `purge` as unresolved and retry. High-assurance deployments should alert on `storage-failure` from `purge` and implement automatic retry.
- **Divergence between retention state and underlying record.** If the retention transitions to Purged but the storage layer fails to actually destroy the underlying record, the audit shows "purged" but the data still exists — a compliance failure. The atom's `purge` action signals the storage layer to destroy the record, but the atom has no way to confirm the destruction succeeded. The storage layer's destruction confirmation and the retention state transition must be coordinated; if the storage layer cannot confirm destruction, the `purge` must return `rejected(storage-failure)` rather than `ok`. The implementation owns this coordination; see *What counts as "purged"* above.

Where the atom breaks down: when the retention obligation is a function of *content* (records about minors might extend retention until the minor's age of majority, requiring policy lookup against the record itself); when the storage layer cannot guarantee irrecoverability after `purge` succeeds (append-only logs, distributed replicas, backup systems with their own retention); when the regulatory clock and the system clock are dramatically out of sync (a deployment-shaped concern that breaks every wall-time-based deadline).

---

## Composition notes

Retention Window is freestanding and is the lifetime-management contract every regulated record composes with:

- **[Event Log](../temporal/event-log.md)** — every Event Log instance under regulatory scope places each appended event under retention. The atom's `record_ref` references the `event_id`; retention policy depends on the host system's regulatory regime (SOX 7 years, HIPAA 6+ years, PCI DSS days, etc.). Event Log's retention-as-out-of-scope is now resolved by this composition.
- **[Provisional Commitment](../resource-lifecycle/provisional-commitment.md)** — terminal-state commitments (Confirmed, Released, Expired) are placed under retention per the host system's regulatory regime. Financial commitments under SOX retain 7 years; healthcare bed assignments under HIPAA retain 6 years; reservation records under PCI DSS retain only as long as transaction-investigation needs require.
- **[Actor Identity](./actor-identity.md)** — attestation records are placed under retention. The retention period typically matches the retention of the underlying actions; an attestation lives at least as long as the record it attests to.
- **Storage Tier** *(forthcoming)* — orthogonal axis; manages active-vs-cold storage transitions independent of retention state.
- **[Defensible Retention](../../compositions/defensible-retention.md)** — the primary composition naming Retention Window as a direct constituent. Defensible Retention wires Legal Hold + Retention Window + Audit Trail substrate to enforce that purge is blocked while any Active hold covers the record. Retention Window's `retention_until` and `purge` surface are the mechanism; Defensible Retention is the gate that makes hold-blocked purge the enforced policy.
- **Legal Hold** *(forthcoming)* — pauses purge eligibility during litigation, regulatory investigation, or other legal preservation orders.
- **Cryptographic Shredding** *(forthcoming)* — implements `purge` for records that cannot be directly deleted (immutable logs, distributed replicas, encrypted-at-rest storage).
- **Erasure Coordination** *(forthcoming)* — handles GDPR Article 17 erasure requests against retention obligations, in coordination with legal counsel and Cryptographic Shredding.
- **Policy Registry** *(forthcoming)* — manages the definition, versioning, and attestation of retention policies. Supplies the `policy_ref` this atom consumes opaquely.
- **Trusted Timestamping** *(forthcoming, per RFC 3161)* — verifiable time-anchor for retention deadlines.

The canonical regulated-audit stack composes [Event Log](../temporal/event-log.md) + [Actor Identity](./actor-identity.md) + Retention Window + [Tamper Evidence](./tamper-evidence.md) as four freestanding atoms; the **[Audit Trail](../../compositions/audit-trail.md)** application is the wiring.

---

## Standards references

Retention Window is one of the most heavily standardized concepts in compliance; its standards inheritance is correspondingly rich:

- **ISO 15489-1 (Information and documentation — Records management)** — the international standard for records-management practice. Defines retention as a managed lifecycle with policy-governed start, retention period, and disposition. The atom's two-state model is the operational core of ISO 15489's lifecycle framing.
- **GDPR Article 5(1)(e) — Storage limitation principle** — personal data must be kept *no longer than necessary*. The atom's overshoot metric is the operational form of GDPR's data-minimization audit; persisting personal data past `purge_deadline` is a violation surfaced by the record itself.
- **HIPAA §164.530(j) — Documentation retention** — 6-year federal baseline for required HIPAA documentation; state law commonly extends this for clinical records. The atom's policy_ref carries the applicable rule; the host system reconciles federal-state-policy overlap.
- **Sarbanes-Oxley §802 — Retention of records relevant to audits and reviews** — 7-year retention for audit workpapers, with criminal penalties for early destruction. The atom's no-early-purge invariant is the structural fix for SOX §802's anti-shredding mandate.
- **SEC Rule 17a-4 — Records to be preserved by certain exchange members, brokers, and dealers** — 3-to-7-year retention with specific access-tier requirements (first two years immediately accessible). Storage-tier sub-requirements compose with Storage Tier; the retention obligation itself is this atom.
- **FINRA Rule 4511 — General requirements for books and records** — incorporates SEC retention rules for FINRA-registered entities.
- **21 CFR Part 11 — FDA electronic records and electronic signatures** — records covered by Part 11 are retained for the longer of the predicate-rule period or 7 years; destruction must be authorized and audited. Composes with Actor Identity for the destruction-authorization attestation.
- **DoD 5015.02-STD — Design criteria standard for electronic records management software applications** — the U.S. government's records-management software baseline. The atom's separation of retention obligation from storage tier and from disposition mechanism matches DoD 5015's architecture.
- **PCI DSS Requirement 3 — Protect stored cardholder data** — including 3.1 (data retention and disposal). The atom carries the *as briefly as possible* posture by allowing very short policy durations.
- **IRS retention guidelines (Publication 583, etc.)** — generally 3-year retention for tax records, longer for specific circumstances (assessments, fraud, employment tax). Policy_ref encodes the rule.
- **NARA General Records Schedules (U.S. federal)** — government-wide retention schedules; the policy registry the atom composes with would normally derive from NARA for federal-agency deployments.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing storage tier, legal hold, cryptographic shredding, and policy registry as separate concepts.
- **Eiffel's design-by-contract** — preconditions on `purge`; named rejection reasons.
- **Linear temporal logic** — retain-then-Retained persistence, terminal absorption, and the no-early-purge precondition expressed as temporal properties.
- **Records management literature** — Ranganathan's principles applied to organizational records; Schellenberg's appraisal theory of which records merit which retention.

---

## Generation acceptance

A derived implementation of Retention Window is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the retention record set, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Determine the retention policy applied to any record.** From the retention record's `policy_ref` plus the composed Policy Registry's policy definitions, the auditor can read the applicable retention rule for any record.
- **Verify the no-early-purge invariant.** Query the Purged set for any retention where `purged_at < retention_until`. Invariant 7 makes this set structurally empty; the auditor sees the empty result as a guarantee, not a procedural claim.
- **Compute overshoot for any retention.** For Purged retentions, `purged_at - purge_deadline` (positive means late); for Retained retentions still past their `purge_deadline`, `now - purge_deadline`. Both are computable from the records alone.
- **Reconstruct the policy history of any record.** When a record has been re-retained under successive policies, the retention records form a sequence indexed by `record_ref`, each with its own policy_ref and lifecycle.
- **Identify the composing patterns active in this deployment.** Whether Storage Tier, Legal Hold, Cryptographic Shredding, Erasure Coordination, Policy Registry, and Trusted Timestamping are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce records that pass the five checks above. The bar is the regulator's question — *"can you prove every record's retention obligation was honored, and surface any current overshoot?"* — answered structurally from the records, not procedurally from runtime claims.

---

## Status

`grounded — 2026-05-20` — all required structural elements resolved; identity model explicit; transition preconditions with fully-named rejection taxonomies including `policy-not-found` and `storage-failure`; ten invariants including retention store durability (Invariant 10) and clock-qualified Invariant 8; five cross-domain examples plus two rejection-path examples; regulated adversarial scenarios; fourteen edge cases including concurrent retentions for the same record, purge persistence failure, and divergence between retention state and underlying record destruction (all added in refinement round 1). Second entry in `atoms/compliance/`. Survived one foundation pass and one refinement round.

---

## Lineage notes

This atom survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)) on its first iteration. The two regulated-pattern conventions documented in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) — *Regulated adversarial scenarios* and *Generation acceptance* — were baked in from the first draft, the first regulated atom drafted entirely against the canonical methodology rather than against earlier worked examples.

**Pass 1 — Structural completeness (GRID).** Clean. All nine GRID nodes resolved with their references intact. The Friction node is captured implicitly via Edge cases — the atom is operating-by-default and surfaces friction only at composition boundaries (legal hold pausing purge, erasure right trumping retention, storage tier reshaping access). State is unusually small for a regulated atom — two states only — because Pass 2 extracted what early drafts wanted to absorb.

**Pass 2 — Conceptual independence (EOS).** One significant finding, closed by extraction; eight further concerns correctly named as composing patterns from the start.

- *Archive-as-state-transition was extracted.* The first draft modeled three states: Retained → Archived → Purged. Pass 2 caught it: archival is a *storage tier* concern (active vs. cold) that recurs across many regulated records and is orthogonal to retention obligation. A record can be in cold storage during its retention window; another can be in active storage past its retention window. Active-vs-cold is performance-and-cost; retained-vs-purged is regulatory obligation. Different state machines, different audits, different evaluators. Resolved: State now names two states (Retained, Purged); Edge cases names Storage Tier as the composing pattern for the active/cold axis; Composition notes describes how SEC Rule 17a-4's *"first two years immediately accessible"* requirement composes the two atoms.

The eight further concerns named as composing patterns from the start: legal hold, cryptographic shredding, right-to-erasure (GDPR Art. 17), policy registry management, retention extension by policy change, recursive meta-retention, non-repudiation of purge, and trusted timestamping. Each recurs across many regulated atoms and is properly someone else's concept.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern.

- *Late-purge handling was ambiguous.* The first draft's `purge` action was silent on what happens past `purge_deadline`. Two coherent options: reject the late purge (forcing manual intervention) or accept it with the lateness observable. Resolved: the atom accepts late purges and surfaces the overshoot in the record. The rationale is that refusing a late purge compounds the overshoot — the record still violates data-minimization, just twice over. The audit names the lateness; the remediation is to purge.
- *`purge_deadline` framing was muddled.* The first draft described the deadline as a hard limit. Resolved: explicit framing in Behavior — "the regulator expects purge to occur between `retention_until` and `purge_deadline`" — with the upper bound observable but not enforced. The atom prevents too-early purge (regulatory violation of retention obligation); the host enforces too-late purge through policy and monitoring (regulatory violation of data minimization).
- *Storage-layer responsibility for irrecoverability.* The first draft assumed `purge` immediately made the record irrecoverable. For some storage layers (append-only logs, distributed replicas, backup systems with independent retention), this is false. Resolved: Edge cases names *what counts as purged* explicitly — direct deletion, tombstone marking, cryptographic shredding, off-site overwrite are all valid; the atom requires only that the record become irrecoverable through ordinary queries; the storage-layer technique is implementation policy. Composing Cryptographic Shredding handles the difficult cases.
- *Non-repudiation of purge was unaddressed.* Who authorized destruction of a regulated record — and the verifiable proof of that authorization — is required under 21 CFR Part 11, HIPAA audit-controls, and SOX. Absorbing the cryptographic-signing concern would be a Pass 2 over-absorption (it recurs across every regulated action). Resolved: Edge cases names non-repudiation as an explicit non-goal and points to the [Actor Identity](./actor-identity.md) composition that supplies the verifiable attestation on the destruction action.

Three deferred concerns are named as explicit out-of-scope rather than fixed in-pattern: concurrency and atomicity, clock semantics, and content-dependent retention policies (where the retention period depends on the record's content, like minor-age cases). Each is deployment-shaped or belongs to a composing pattern.

The three passes together exercise the architecture as designed: GRID checks structural completeness (two-state model is small but complete); EOS catches the archive-as-state-transition over-absorption (the largest finding); Linus catches the four operational gaps (late-purge handling, deadline framing, irrecoverability semantics, non-repudiation). The atom is stronger because all three checks happened.

**Refinement round 1 — re-run of all three passes.** Six findings, all closed in-pattern:

- *Action signature incompleteness (Pass 1 / Pass 3).* Both actions carried `rejected(reason)` as placeholders. Resolved: `place_under_retention` updated to `rejected(invalid-request | invalid-policy | policy-not-found | storage-failure)`; `purge` updated to `rejected(not-retained | not-known | retention-period-not-elapsed | storage-failure)`. Two reasons are new: `policy-not-found` and `storage-failure` — see below.
- *`policy-not-found` rejection unnamed (Pass 3).* The atom must resolve `policy_ref` to obtain `duration` and `max_purge_delay`, but the taxonomy didn't distinguish between a policy that is found but invalid (`invalid-policy`) and a policy that cannot be resolved at all. Resolved: `policy-not-found` added as a distinct rejection reason; Decision points updated to explicitly name the resolution step and its failure mode.
- *`storage-failure` unnamed for both actions (Pass 3).* Same pattern as Actor Identity, Permissions, and Audit Trail. If `place_under_retention`'s store write fails, no retention is recorded — a missing retention obligation. If `purge`'s state transition fails to persist, the record remains Retained — a data-minimization failure. Resolved: `storage-failure` added to both signatures; Decision points updated with failure description and retry obligation; edge case added.
- *Invariant 8 not qualified for non-monotonic clocks (Pass 3).* The invariant (`retention_until ≤ purged_at`) is stated absolutely but is vulnerable to a backward clock skew between the eligibility check and the timestamp capture — the same gap caught in Permissions' Invariant 9. Resolved: best-effort qualifier added, citing clock semantics edge case.
- *No retention store durability invariant (Pass 3).* Purge transitions state; it does not remove the record. The Purged retention record is the audit evidence of lawful destruction. No formal invariant said this. Resolved: Invariant 10 (*Retention store durability*) added, naming the monotonically non-decreasing count, the absence of a deletion surface, and the audit-evidence framing.
- *Three additional edge cases (Pass 3).* Three operational gaps were unnamed: (a) multiple simultaneous Retained retentions for the same `record_ref` — the atom allows it, but the composing system must select the governing policy and purge all of them; (b) purge persistence failure — `storage-failure` from `purge` leaves the record Retained and the underlying data undestroyed, requiring retry; (c) divergence between the retention record state and the actual underlying record destruction — if the storage layer fails to destroy the record after the retention moves to Purged, the audit says "purged" but the data still exists. All three named and resolved in Edge cases.

Pass 2 was clean: no new over-absorptions. All six fixes are in-pattern.

**Scheduled rescan: 2026-05-20.** Pass 1 clean. Pass 2 clean. Pass 3: two refining findings closed in-pattern. (1) Decision points used "well-formed and non-empty" for `record_ref` and `policy_ref` — inconsistent with the canonical library wording. Resolved: reworded to "must each contain at least one non-whitespace character." (2) Examples exercised only happy paths and adversarial scenarios — no rejection-path example showed `rejected(retention-period-not-elapsed)` or `rejected(policy-not-found)`. Resolved: two rejection-path examples added showing a premature purge attempt and a policy-not-found response, using concrete field values. All nine GRID nodes confirmed resolved; no over-absorptions identified; no foundational findings. **Scheduled rescan: 2026-05-20 — clean.**
