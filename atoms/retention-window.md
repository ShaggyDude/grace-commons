---
title: Retention Window
parent: Atomic Concepts
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


## Summary

Retention Window enforces the rule that a record must be kept for a minimum period and only then becomes eligible for destruction. For every managed record it stores which retention policy applies, when the keep-period ends, and the latest date by which destruction is expected. It blocks early deletion outright. Trying to destroy ("purge") a record before its period is up is refused. It also makes overdue records visible: anything still kept past its deadline shows up in the data as an "overshoot" that a compliance dashboard can spot, without anyone having to explain it. Two dates are fixed when a record is placed under retention: the earliest date destruction is allowed, and the latest date it is expected. The span between them is the window in which destruction is both permitted and expected. The pattern enforces the early boundary — no destruction before the period ends. It only observes the late one. A record destroyed past its deadline is flagged in the records as a finding, not refused, because refusing a late destruction would only make the overdue situation worse. This is the mechanism behind multi-year retention of financial and medical records, data-minimization rules for payment-card data, and contract retention that outlasts the deal. It does not handle where records physically live, litigation holds, or privacy-law erasure — those are separate patterns.

---

## Intent

Every regulated record has a bounded life. Tax records must be kept seven years and then permitted to be destroyed; medical records must be kept six years (federal HIPAA — the Health Insurance Portability and Accountability Act, the US healthcare-data privacy law) or longer per state law; cardholder data must be retained as briefly as the business need permits; broker-dealer communications must survive three-to-seven years under SEC (US Securities and Exchange Commission — the federal securities-markets regulator) rules; audit workpapers must persist seven years under SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) §802. The shape is constant across domains — a record enters retention, the retention clock runs, the record becomes eligible (or obligated) for purge, the record is purged. The deviation is the data: too-short retention violates obligation; too-long retention violates data-minimization; neither is acceptable to a regulator.

The pattern addresses the *how long* question that record-keeping discipline cannot answer with documentation alone. A retention policy says *"keep for seven years."* The retention atom enforces that promise structurally — [Purge] cannot happen before the policy's clock runs out, and the record's lifecycle is observable to any external evaluator from the record's own fields.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the retention record), its own actions ([Place Under Retention], [Purge]), and its own operational principles (the [Retention Window] is binding for its duration; [Purge] is terminal; the audit can see whether retention obligations were met). It does not implement storage tier (active vs. cold), legal hold, cryptographic shredding, policy registry management, or right-to-erasure. Each is a separate composable atom; see Composition notes.

---

## Structure

### Identity model

Every retention known to the system has a **[Retention Id]** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it) produced by [Place Under Retention]. The id is the retention's identity; the [Record Ref], [Policy Ref], and the derived deadlines are immutable *properties* of the retention, not its identity.

Two retentions over the same record (one expiring, replaced by another under a new policy) have distinct ids — each retention is its own audit record. Ids are not reused.

The opaque-id model preserves the same per-event audit discipline the other regulated atoms enforce. Identifying a retention by [Record Ref] and [Policy Ref] together would collapse legitimate policy-change scenarios (an old policy retention completing, a new policy retention beginning over the same record); identifying by start timestamp would lose precision under concurrent placements. Opaque ids preserve the one-retention-one-id discipline that lets auditors reconstruct the policy history of any record.

### Inputs

- A [Record Ref] identifying *what* is being retained. The atom treats this as opaque — the host system defines what counts as a record and how to reference it.
- A [Policy Ref] identifying *which retention rules apply*. Also opaque — the policy registry is a separate concept. The atom requires only that the policy expose a [Duration] (the retention period) and a [Max Purge Delay] (the maximum allowed lag between retention-end and purge).
- Actions (the current clock reading [Now] is **pipeline-injected at the I/O seam**, not a parameter of the action — the execution contract supplies the pipeline's `clock_t` at the seam before the transition runs, so the caller signatures below carry no [Now]; it is not read inside the transition and not trusted from the business caller):
  - [Place Under Retention] — record a new retention over a [Record Ref] under a [Policy Ref], returning the fresh [Retention Id]. (Projected contract: `place_under_retention(record_ref, policy_ref) → retention_id | rejected(invalid-request | invalid-policy | policy-not-found | storage-failure)`.)
  - [Purge] — transition a retention to [Purged], permitted only once its retention period has elapsed. (Projected contract: `purge(retention_id) → ok | rejected(not-retained | not-known | retention-period-not-elapsed | storage-failure)`.)
- A clock providing wall-time timestamps and an id source for [Retention Id] allocation, both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the [Retention Id] at the seam before the transition runs; the pure transition receives [Now] and [Retention Id] as injected inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic. The clock enters at a single seam (the execution contract injects `clock_t` there, so the seam is not a signature parameter); [Now] is consumed for exactly two clearly separated purposes — stamping immutable timestamps on a write ([Retained At], [Purged At]) and evaluating the pure [Now] ≥ [Retention Until] eligibility guard in [Purge] (no write) — and the read-time [Purge Eligible] projection below. Policy resolution is also performed at the seam: the host resolves [Policy Ref] against the policy registry at the seam and injects the resolved [Duration] and [Max Purge Delay] scalars; the transition computes [Retention Until] and [Purge Deadline] from those injected scalars and does not call into a registry internally.

### Outputs

- The current set of [Retained] retentions.
- The current set of [Purged] retentions.
- For each retention: [Retention Id], [Record Ref], [Policy Ref], [Retained At], [Retention Until], [Purge Deadline], state, and (if applicable) [Purged At].
- Action acknowledgements — success (returning [Retention Id] for [Place Under Retention], `ok` otherwise) or rejection with a named reason.

**Read surface (render time).** Reads accept the injected [Now] and, for each [Retained] retention, carry a derived **[Purge Eligible]** projection: [Purge Eligible] ⟺ state = [Retained] ∧ [Now] ≥ [Retention Until]. It is `true` exactly when the retention is still under guard *and* its retention period has elapsed — i.e., when a [Purge] call would pass the [Retention Period Not Elapsed] guard. [Purge Eligible] is a **pure function of the stored record (state, [Retention Until]) and the injected [Now]**; it is computed at read time and **never stored** — there is no `eligible` flag on the record, so nothing can lag the clock. ([Purged] retentions are not eligible — they have already been purged; [Purge Eligible] is `false` for them, which a reader may treat as not-applicable.) This is the same eligibility predicate the [Purge] guard evaluates, surfaced for read so callers and dashboards can list purge-ready records without attempting a write. The existing [Overshoot] / [Active Overdue] metrics (see Feedback) are read-time projections of the same kind.

### State

A retention, once created, occupies exactly one of two states:

- **[Retained]** — the record is under active retention obligation. The [Retention Window] may or may not have elapsed; purge has not yet occurred.
- **[Purged]** — the record has been purged; the retention is terminal.

Two states only. *Storage tier* (active storage vs. cold storage) is a separate axis, owned by a Storage Tier composing pattern — a record may move from active to cold storage at any time without changing its retention state. This is the Pass 2 finding documented in Lineage notes: archive-as-state-transition would absorb a concept that recurs across many regulated records and belongs to its own atom.

Each retention carries:

- **[Retention Id]** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on [Place Under Retention]. Never changes.
- **[Record Ref]** — the record reference. Set on [Place Under Retention]. Never changes.
- **[Policy Ref]** — the policy reference. Set on [Place Under Retention]. Never changes.
- **[Retained At]** — set on [Place Under Retention]. Never changes.
- **[Retention Until]** — set on [Place Under Retention] as [Retained At] + [Duration]. Never changes.
- **[Purge Deadline]** — set on [Place Under Retention] as [Retention Until] + [Max Purge Delay]. Never changes. This is the *latest* the regulator expects purge to occur; operating past it is observable [Overshoot].
- **[Purged At]** — set on [Purge], present only in [Purged].

Transitions — writes only; each write below stamps its timestamp from the injected [Now], and no transition reads the clock internally. Purge-eligibility is listed for contrast: it is not a transition and writes nothing.

| action | from | to | guard | stamps | result | rejections |
|--------|------|----|-------|--------|--------|-----------|
| [Place Under Retention] | *(no record)* | **[Retained]** | — | fresh [Retention Id]; [Retained At] = [Now]; [Retention Until] = [Retained At] + [Duration]; [Purge Deadline] = [Retention Until] + [Max Purge Delay] | the new [Retention Id] | [Invalid Request]; [Policy Not Found]; [Invalid Policy]; [Storage Failure] |
| [Purge] | [Retained] | **[Purged]** | [Now] ≥ [Retention Until] | [Purged At] = [Now] | `ok` | [Not Known]; [Not Retained]; [Retention Period Not Elapsed]; [Storage Failure] |
| *purge-eligibility (derived — not a transition)* | [Retained] | *[Retained]* (unchanged) | [Now] ≥ [Retention Until] | **nothing written** | *shown* [Purge Eligible] | — |

Five semantics the cells cannot hold:

- *The no-early-purge guard is a pure function that writes nothing when it fails.* [Purge] is legal only while [Now] ≥ [Retention Until] (Invariant 7). The guard reads [Retention Until] from the record and compares it to the injected [Now]; when [Now] < [Retention Until] it rejects [Retention Period Not Elapsed] and **writes nothing** — the retention is left [Retained]. The atom never records a purge before the retention period elapses.
- *A late purge is observed, not refused.* The atom does **not** reject a [Purge] that arrives past [Purge Deadline]. Past that point the regulator expects purge to have happened, and refusing the late purge would compound the [Overshoot]. The lateness is observable in [Purged At] relative to [Purge Deadline]; the audit names it. Refusing it is not a row.
- *Purge-eligibility is derived at read time, never stored.* Whether a [Retained] retention is ready to purge is the [Purge Eligible] projection — computed at read time from the immutable [Retention Until] and the injected [Now] (Invariant 11). No `eligible` flag is stored, no scheduler runs, and no field is written when a retention crosses [Retention Until]. It is the one row whose "to" column is unchanged and whose "stamps" column is empty by design.
- *A single [Now] per [Purge] closes the backward-skew window.* The eligibility guard and the [Purged At] stamp read the **same** injected [Now] of that [Purge] call. Because both consult one value rather than two separate clock reads, [Retention Until] ≤ [Purged At] holds with no internal skew gap (Invariant 8); the residual risk is genuinely-external clock dishonesty, not an internal race.
- *Rejection priority is fixed.* For [Purge] the order is identity/state ([Not Known], [Not Retained]) → the time gate ([Retention Period Not Elapsed]) → [Storage Failure]; for [Place Under Retention] it is [Invalid Request] → [Policy Not Found] → [Invalid Policy] → [Storage Failure]. The full per-action preconditions are in Decision points.

### Flow

1. **Place under retention.** The host system records the record under retention, with a policy. The atom records the retention in [Retained], with the derived deadlines.
2. **Retention period runs.** While [Now] < [Retention Until], the record is under active retention obligation; purge is forbidden. The record may move between storage tiers (active to cold) per the composing pattern, but its retention state does not change.
3. **Retention period elapses.** At [Now] ≥ [Retention Until], the record is eligible for purge — its read-time [Purge Eligible] projection now reads `true` (derived, not written). Until purge occurs, the retention remains in [Retained].
4. **Purge.** The host system invokes [Purge]. The eligibility guard confirms [Now] ≥ [Retention Until] (against the seam-injected clock), the retention transitions [Retained] → [Purged], and the underlying record is destroyed by the storage layer (or shredded cryptographically — see Composition notes).
5. **Settled.** The retention record persists in [Purged] indefinitely from the atom's perspective. The retention record itself is metadata about a destroyed record; what happens to the retention record under its own lifetime is the meta-question composing patterns address.

### Decision points

**Logic confinement (clock and id).** The clock and the id are **injected inputs at the I/O seam**, never produced inside a transition and never passed as action parameters. [Now] (`clock_t`) is read once by the pipeline and injected at the seam before the transition runs; the [Retention Id] is the injected `id_t`, host-allocated at the seam (likewise the resolved [Duration] and [Max Purge Delay] policy scalars). Because the clock is pipeline-injected at the seam rather than threaded through the caller signatures, the action signatures carry no [Now] parameter. [Now] is consumed for exactly two clearly separated purposes — stamping immutable write timestamps inside a committed transition ([Retained At] on [Place Under Retention], [Purged At] on [Purge]), and evaluating the pure no-early-purge eligibility guard in [Purge]: [Purge Eligible](record, now) ≜ record.state = [Retained] ∧ [Now] ≥ record.[Retention Until], which **writes nothing** when it fails. The same predicate is what the read-time [Purge Eligible] projection surfaces (eligibility is *derived*, never stamped or stored). No transition reads a wall clock internally. Purge rejection priority: identity/state rejections ([Not Known], [Not Retained]) → the time gate ([Retention Period Not Elapsed]) → [Storage Failure].

- **At [Place Under Retention]** — preconditions are checked in this rejection-priority order: malformed input first — [Record Ref] and [Policy Ref] must each contain at least one non-whitespace character; otherwise [Invalid Request]. Then [Policy Ref] must resolve to a known policy in the policy registry; otherwise [Policy Not Found]. Then the resolved policy must be valid — its [Duration] must be positive and [Max Purge Delay] must be non-negative; otherwise [Invalid Policy]. [Retained At] = [Now] is stamped from the injected [Now], and [Retention Until] / [Purge Deadline] are computed once from the injected scalars and stored immutably. Finally, if the retention store write fails after all preconditions pass, the atom returns [Storage Failure] — no retention is recorded. (Priority order: [Invalid Request] → [Policy Not Found] → [Invalid Policy] → [Storage Failure].) The host system is responsible for ensuring the [Record Ref] refers to an existing record; the atom does not validate against the host's record store.
- **At [Purge]** — [Retention Id] must reference a retention currently in [Retained]; otherwise [Not Retained] (already [Purged]) or [Not Known] (no such id). Identity and state rejections ([Not Known], [Not Retained]) are checked before the time gate. **Eligibility guard (pure, no write):** [Now] ≥ [Retention Until] must hold; otherwise [Retention Period Not Elapsed]. This guard is a **pure function of the stored record and the injected [Now]** — it reads [Retention Until] from the record, compares it to the injected clock, and rejects without writing anything; it is the same predicate the read-time [Purge Eligible] projection exposes. The guard is kept (not weakened): no-early-purge (Invariant 7) is the regulator's structural guarantee. The atom does *not* reject purges that arrive past [Purge Deadline] — at that point the regulator expects purge to have happened, and refusing the late purge would compound the [Overshoot]. The lateness is observable in [Purged At] relative to [Purge Deadline]; the audit names it. On success, [Purged At] = [Now] is stamped from the same injected [Now] that the guard read (this single-[Now] discipline is what closes the backward-skew window in Invariant 8). If the [Retained] → [Purged] transition fails to persist, the atom returns [Storage Failure] — the retention remains in [Retained] and the underlying record is not destroyed. The caller must retry; see *Purge persistence failure* in Edge cases.

### Behavior

Observed behavior, derived from how regulated systems use retention:

- A retention is not a promise of immediate destruction at [Retention Until]. The regulator expects purge to occur between [Retention Until] and [Purge Deadline] — the *purge window*. The atom enforces that purge cannot run before [Retention Until]; it observes (but does not enforce) the upper bound. This is the regulator's actual posture: too-early purge is a violation of retention obligation; too-late purge is a violation of data-minimization; the atom prevents the first and surfaces the second.
- The retention policy is immutable for any given [Retention Id]. Extending or shortening a retention requires releasing the current retention (impossible by design — terminal absorption) or placing a new retention under a different policy when the underlying record is in a state that allows it. Policy mutation through this atom is not supported. Legal hold and similar dynamic encumbrances belong to composing patterns.
- The retention record itself outlives the underlying data. After [Purge] succeeds, the underlying record is destroyed, but the retention record (with [Retained At], [Purged At], [Policy Ref]) remains — it is the audit evidence that retention was honored. What happens to that audit record (its own retention, archival, anonymization) is a recursive question composing patterns handle.
- Concurrent purge invocations for the same [Retention Id] resolve serially under the host environment's serialization guarantees. The first wins; the second receives [Not Retained]. This is the same idempotency story Provisional Commitment names; an [Idempotent Reservation](../compositions/idempotent-reservation.md)-style composition supplies retry safety.
- **Purge-eligibility is derived, not written.** Whether a [Retained] retention is ready to purge is computed at read time from [Retention Until] and the injected [Now] (the [Purge Eligible] projection), and re-evaluated by the pure guard at [Purge] time against the injected [Now] of that call. The atom stores no eligibility flag, runs no scheduler, and has no `become_eligible` action — eligibility is a derived condition, not a stored state, so it can never lag the clock. This mirrors the "derive the idealization, do not lag it with a flag" discipline ([`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls): note that [Purged] is, by contrast, a *real write* — it records that the purge actually happened — so it is correctly stored, not derived.
- Wall-time is supplied as a pipeline-injected input at the seam (the execution contract injects `clock_t` at the seam; it is not an action parameter); the core transition reads no wall clock internally. Clock quality — honesty, monotonicity, skew relative to the regulatory clock — remains a deployment matter. Where retention deadlines have legal force (statute of limitations, regulatory clock), the implementation must source time from a trustworthy clock; a composed Trusted Timestamping pattern produces the verifiable time-anchor.

### Feedback

Each successful action produces an observable, measurable change:

- After [Place Under Retention] — a new retention appears in [Retained] with a fresh [Retention Id], [Retained At], [Retention Until], and [Purge Deadline]. [Retained] count and total count each increase by one. The id is returned to the caller.
- After [Purge] — the retention moves [Retained] → [Purged] with [Purged At]. [Retained] count decreases by one; [Purged] count increases by one; total count unchanged.
- On reaching [Retention Until] — **no change**: a [Retained] retention's [Purge Eligible] projection reads `true` once [Now] ≥ [Retention Until], but no field is written, no count changes, and no transition fires. Eligibility is observable only through the read surface (the derived [Purge Eligible]), never through a write.

Each rejected action produces an observable refusal: [Invalid Request], [Invalid Policy], [Policy Not Found], or [Storage Failure] (for [Place Under Retention]); [Not Retained], [Not Known], [Retention Period Not Elapsed], or [Storage Failure] (for [Purge]).

The [Retained] and [Purged] sets are queryable. The [Purge Eligible] projection — for any [Retained] retention, [Now] ≥ [Retention Until] — is computable from the record and the injected clock alone. The [Overshoot] metric — for any [Purged] retention, [Purged At] − [Purge Deadline] if positive — is computable from the records alone. The [Active Overdue] metric — for any [Retained] retention, [Now] − [Purge Deadline] if positive — is similarly computable. All three surface to compliance dashboards as derived views; the atom does not compute them but does not hide them, and none is stored.

### Invariants

The following invariants (conditions that must always hold, regardless of what sequence of actions has occurred) constitute the verification surface of the pattern:

- **Invariant 1 — Membership exclusivity.** For every retention `r` known to the system, `r` is in exactly one of {[Retained], [Purged]}.
- **Invariant 2 — Retain-then-Retained persistence.** After a successful [Place Under Retention], the resulting retention is in [Retained] and remains so until [Purge] is invoked.
- **Invariant 3 — Terminal absorption.** Once a retention enters [Purged], no action transitions it elsewhere. The atom has no *un-purge* or *restore* surface.
- **Invariant 4 — Id stability.** A retention's [Retention Id] is set on [Place Under Retention] and never changes.
- **Invariant 5 — Record_ref and policy_ref immutability.** A retention's [Record Ref] and [Policy Ref] are set on [Place Under Retention] and never change. Re-retaining the same record under a different policy produces a new retention with a new id.
- **Invariant 6 — Retention window monotonicity.** For every retention, [Retained At] < [Retention Until] ≤ [Purge Deadline]. The policy's [Duration] is positive and [Max Purge Delay] is non-negative.
- **Invariant 7 — No early purge.** A retention can transition to [Purged] only while [Now] ≥ [Retention Until]. Purge before retention-end is rejected; this is the regulator's structural guarantee that retention obligations cannot be silently shortened.
- **Invariant 8 — Purge timestamp consistency.** For any [Purged] retention, [Retention Until] ≤ [Purged At]. The atom does not constrain [Purged At] relative to [Purge Deadline] — [Overshoot] is observable but not forbidden. This invariant is best-effort under non-monotonic clocks; a clock that moves backward between the eligibility check ([Now] ≥ [Retention Until]) and the timestamp capture can violate the inequality. Under a single injected [Now] per [Purge] action, both the eligibility check and the timestamp capture read the same value, closing the backward-skew window that would otherwise exist between two separate clock reads; residual risk is genuinely-external clock dishonesty (a deployment that injects a false [Now]) rather than an internal race. The implementor is responsible for the clock discipline that makes the injected [Now] honest; see Clock semantics in Edge cases.
- **Invariant 9 — No id reuse.** No two distinct retentions share a [Retention Id] across the lifetime of the system.
- **Invariant 10 — Retention store durability.** Retention records are never deleted from the store. [Purge] transitions a retention from [Retained] to [Purged]; it does not remove the record. The total retention count is monotonically non-decreasing. A [Retention Id] returned by a successful [Place Under Retention] call is durably persisted; a [Storage Failure] rejection guarantees no partial record was written. The retention record in [Purged] state is the audit evidence that the underlying record was lawfully destroyed; deleting it would destroy that evidence.

- **Invariant 11 — Purge-eligibility is derived, never stored.** No retention record carries a stored "eligible" or "expired" flag. A retention's purge-eligibility is the value of the pure projection [Purge Eligible](record, now) ⟺ (state = [Retained] ∧ [Now] ≥ [Retention Until]), computed at read time from the immutable [Retention Until] and the injected clock [Now], and re-evaluated by the same predicate in the [Purge] guard. The clock is never read inside a transition, and no write fires when a retention crosses [Retention Until] — only the actual [Purge] writes (recording that the purge happened). This removes the stored-flag-that-lags-the-clock failure mode and keeps no-early-purge (Invariant 7) ranging over the single [Now] injected at the [Purge] seam.

Membership exclusivity and terminal absorption together give the *audit-friendly* property — once purged, the record is irrecoverable, and the audit trail of the destruction is durable. No-early-purge gives the *retention-honored* property — the regulator's structural guarantee. Purge-timestamp-consistency lets auditors compute [Overshoot] directly from the record without trusting any external clock. Purge-eligibility-is-derived (Invariant 11) is what lets the records be evaluated for readiness without a scheduler and without a flag that could drift from the clock.

---

## Examples

The same atom, five regulated domains, identical mechanic.

### Banking — transaction-record retention under SOX

A bank places every settled transaction under retention with a 7-year policy (`policy_sox_settled_txn`: duration = 7 years, max_purge_delay = 30 days) via [Place Under Retention]. At the seven-year mark, the records' [Purge Eligible] projection flips to `true` (derived from the injected clock, not written); the bank's records-management system lists those records and invokes [Purge] within the 30-day purge window. Each purge is logged for SOX (Sarbanes-Oxley Act — US financial reporting law) §802 audit. An external auditor querying *"any transaction record purged before its 7-year obligation?"* gets the empty set — Invariant 7 guarantees it.

### Healthcare — medical-record retention under HIPAA and state law

A hospital places each patient encounter record under retention with the maximum of HIPAA's (US Health Insurance Portability and Accountability Act) federal 6-year baseline (45 CFR (Code of Federal Regulations) §164.530(j)) and the state's longer requirement (often 10–25 years for adult records, longer for pediatric). The [Policy Ref] captures the applicable rule; the retention's [Retention Until] is the patient-specific deadline. Purges occur on a rolling schedule; the audit reads the retention records to demonstrate compliance with the longer of the applicable rules.

### Payments — cardholder-data retention under PCI DSS

A payment processor places cardholder-data records (PAN — Primary Account Number, the card number; expiration; CVV-substitute tokens — stand-ins for the card security code) under retention with the *shortest* viable policy — typically days for transient transaction data, never longer than business need requires. PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for handling cardholder data) Requirement 3.1 mandates data minimization. The atom's no-early-purge invariant becomes less relevant here (windows are short); the [Overshoot] metric is what the audit primarily surfaces — any cardholder data still [Retained] past [Purge Deadline].

### Communications — broker-dealer communications under SEC Rule 17a-4

A registered broker-dealer places every business communication (email, chat, voice transcript) under retention with policies derived from SEC Rule 17a-4 — generally 3 years, with the first 2 years in immediately-accessible storage. The atom carries the retention obligation; storage-tier transitions (immediately-accessible to less-accessible) belong to a Storage Tier composition. A FINRA (Financial Industry Regulatory Authority) examination reads the retention records to confirm that every required communication was retained for the full period and purged only after.

### Legal — contract retention beyond contract term

A company places each executed contract under retention with policy = max(contract duration + 6 years, statute-of-limitations for relevant claim types). The retention extends past the operational life of the contract because the contract's audit obligations outlive its commercial life. Litigation hold composes by suspending purge eligibility during pending litigation (a Legal Hold composition; out of scope for the atom).

### Rejection paths

**Premature purge attempt.** A records-management system attempts to purge a transaction record four years into a seven-year SOX retention period:

```
purge(retention_id: "ret-0047")          # seam injects now = 2026-06-22T00:00:00Z
→ rejected(retention-period-not-elapsed)
```

The pure eligibility guard evaluates [Now] ≥ [Retention Until] against the seam-injected [Now] and finds it false — [Retention Until] has not been reached; the atom rejects the purge outright and **writes nothing**. No state change occurs; the record remains in [Retained], and its [Purge Eligible] projection reads `false`. The rejection is the structural enforcement of Invariant 7 — early purge is not just refused, it is structurally impossible.

**Policy reference not resolvable.** A host system calls [Place Under Retention] with a policy reference that does not resolve to a known policy:

```
place_under_retention(record_ref: "txn-1188", policy_ref: "policy-obsolete-v1")
→ rejected(policy-not-found)
```

No retention is created. The host system must supply a valid, resolvable policy reference before any retention can be placed.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator audit — "show me every record purged before its retention period elapsed."** The auditor queries the [Purged] set for any record where [Purged At] < [Retention Until]. Invariant 7 makes this set structurally empty — the precondition on [Purge] prevents it. The auditor sees the empty result as a structural guarantee, not a procedural promise.
- **Data minimization audit — "show me every record still Retained past its purge deadline."** Common under GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Article 5(1)(e) reviews. The auditor reads [Retained] with the injected [Now] and selects records where [Now] > [Purge Deadline] (the [Active Overdue] projection; these are necessarily [Purge Eligible] too, since [Purge Deadline] ≥ [Retention Until]). The atom does not refuse late purges (rejecting them would compound the [Overshoot]), so this query returns a non-empty set when the organization is behind on its purge schedule. The [Overshoot] is the finding; the records themselves are the evidence; the remediation is to [Purge] the listed records and document the lateness.
- **Litigation discovery — "produce all records of type X from 2020-2022."** Counsel queries the host system; the host system reads the retention records to determine which matching records still exist ([Retained]) versus which have been [Purged]. [Purged] records are unrecoverable — that is the atom's terminal-absorption invariant working as designed. The discovery response distinguishes *records retained and produced* from *records lawfully destroyed under the policy in effect at the time*, with the retention records themselves as the audit trail. Litigation hold should have been placed earlier — if it wasn't, that is a Legal Hold composition failure, not a retention failure.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Storage tier (active vs. cold).** Where a record physically lives — immediately-accessible storage, near-line storage, off-site cold archive — is orthogonal to retention. A Storage Tier composing pattern owns the active/cold transition; this atom records only whether the retention obligation is open or closed. SEC Rule 17a-4's "first two years immediately accessible" requirement, for example, composes Retention Window with a Storage Tier pattern that times the active-to-cold transition.
- **Legal hold / litigation hold.** Pending litigation, regulatory investigation, or other legal preservation orders suspend the host system's ability to purge. The atom does not represent this — [Purge] would still be valid at [Retention Until], which is wrong under a hold. A Legal Hold composing pattern intercepts purge attempts and rejects them while the hold is active. The hold itself is a separate retention-like state with its own lifecycle.
- **Cryptographic shredding.** Some records cannot be directly deleted (append-only logs, distributed-system replicas, immutable storage). Effective purge in those cases means destroying the cryptographic keys that make the records readable — the record persists in encrypted form but becomes irrecoverable. A Cryptographic Shredding composing pattern implements this; this atom's [Purge] action treats both forms — direct deletion and key destruction — as the same state transition. The implementation chooses which mechanism applies.
- **Right-to-be-forgotten (GDPR Art. 17).** A data subject's erasure request can trump scheduled retention. The atom does not represent this — early purge under erasure right is forbidden by Invariant 7. The composing pattern is a coordinated Erasure pattern that either (a) cryptographically shreds the personal-data fields while preserving the structural retention record, or (b) demonstrates that the retention obligation overrides the erasure right (HIPAA-mandated retention typically does). Legal counsel adjudicates.
- **Policy registry management.** What policies exist, who defines them, how they are versioned, who attests to their alignment with regulation — out of scope. A Policy Registry composing pattern owns this. The atom takes [Policy Ref] as opaque.
- **Retention extension by policy change.** Once a retention is in [Retained] with a given [Policy Ref], the atom does not allow the policy to change. Mid-retention regulatory changes (a statute that retroactively extends a retention period, for instance) require composing patterns that place new retentions under the new policy and reconcile against the original. This is real and consequential; legal counsel is in the loop.
- **Recursive retention of the retention records.** The atom's records themselves are subject to retention. The atom does not loop on itself; the host system manages the meta-retention with a separate policy.
- **Concurrency and atomicity.** State transitions are atomic per [Retention Id]. A crash mid-transition that leaves a retention in neither [Retained] nor [Purged] violates Invariant 1; the implementor is responsible for the transactional boundary. Multi-retention transactions (purging a batch atomically) belong to a Transaction pattern.
- **Clock semantics.** Wall-time is supplied as a pipeline-injected input at the seam (the execution contract injects `clock_t` at the seam; it is not threaded through the [Place Under Retention] / [Purge] signatures); the host reads the clock and supplies [Now] before the transition runs, so the core transition remains a pure function of its inputs. The same injected [Now] drives the immutable timestamp stamps ([Retained At], [Purged At]), the pure no-early-purge guard, and the read-time [Purge Eligible] projection. Clock quality — honesty, monotonicity, skew relative to the regulatory clock — remains a deployment matter. Where retention deadlines have legal force, the implementation must source time from a trustworthy clock; a composed Trusted Timestamping pattern produces the verifiable time-anchor. Because purge-eligibility is *derived* rather than stamped, two readers evaluating [Purge Eligible] with slightly skewed clocks near [Retention Until] may briefly disagree on whether a record is eligible — the standard read-time-derivation consequence, bounded by the deployment's clock-skew envelope and harmless because no write is at stake (the binding decision is made by the single [Now] injected at the [Purge] call, where Invariant 8's single-[Now] discipline applies).
- **What counts as "purged."** Full deletion, tombstone marking, cryptographic shredding, off-site overwrite — all valid implementations of [Purge]. The atom requires only that, post-purge, the underlying record become irrecoverable through ordinary queries. The specific destruction technique is implementation policy.
- **Non-repudiation of the purge action.** Who authorized the purge, and the verifiable proof of that authorization, is the job of an [Actor Identity](./actor-identity.md) composition. This atom does not model an actor on the purge — there is no purger field in its state; the actor surface (who destroyed the record, and the verifiable attestation of that authority) belongs to the composing Actor Identity pattern, which adds it. Required under several regulatory regimes (21 CFR Part 11, HIPAA audit-control rules) for destruction of regulated records.
- **Multiple simultaneous retentions for the same record.** The atom allows multiple [Retained] retentions for the same [Record Ref] — one under policy A and another under policy B, both simultaneously active. This is legitimate in policy-transition scenarios (an old policy retention completing, a new policy retention started under revised rules), but operationally tricky. **No-early-purge (Invariant 7) is a per-retention guarantee** (gated per [Retention Id]): each retention's [Purge] is gated against *its own* [Retention Until] and nothing else. Overlapping retentions over one record are **not jointly enforced by the atom** — the atom records each retention independently and never cross-references siblings over the same [Record Ref]. The hazard this opens is concrete: purging the shorter retention (its own [Retention Until] having elapsed) destroys the underlying record while a longer retention over the same record is still in force — a record destroyed before the end of an obligation that the atom never saw, because the obligation lived on a different [Retention Id]. Closing it is the composing pattern's job: the composing system must select the governing policy correctly and ensure purge is governed by the *longest* live retention over the record (the record may be destroyed only once every retention over it is purge-eligible). The atom supplies per-retention enforcement; cross-retention joint enforcement is out of scope.
- **Purge persistence failure.** If the [Retained] → [Purged] state transition is computed but the store write fails, the atom returns [Storage Failure] and the retention remains in [Retained] — the underlying record is not destroyed. Unlike `grant` storage failures, this is not a security failure but a data-minimization failure: the record should have been destroyed but wasn't. Callers must treat [Storage Failure] from [Purge] as unresolved and retry. High-assurance deployments should alert on [Storage Failure] from [Purge] and implement automatic retry.
- **Divergence between retention state and underlying record.** If the retention transitions to [Purged] but the storage layer fails to actually destroy the underlying record, the audit shows "purged" but the data still exists — a compliance failure. The atom's [Purge] action signals the storage layer to destroy the record, but the atom has no way to confirm the destruction succeeded. The storage layer's destruction confirmation and the retention state transition must be coordinated; if the storage layer cannot confirm destruction, the [Purge] must return [Storage Failure] rather than `ok`. The implementation owns this coordination; see *What counts as "purged"* above.

Where the atom breaks down: when the retention obligation is a function of *content* (records about minors might extend retention until the minor's age of majority, requiring policy lookup against the record itself); when the storage layer cannot guarantee irrecoverability after [Purge] succeeds (append-only logs, distributed replicas, backup systems with their own retention); when the regulatory clock and the system clock are dramatically out of sync (a deployment-shaped condition that breaks every wall-time-based deadline).

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Retention Window

The compliance primitive this atom defines: a record is kept under retention for a known period, then becomes eligible for purge. Each retention is its own record with an opaque [Retention Id]; it carries a [Record Ref], [Policy Ref], the derived deadlines [Retention Until] and [Purge Deadline], and (once purged) [Purged At]. It occupies one of two states — [Retained] or [Purged].

Kind: Type

#### Place Under Retention

The behavior the host invokes to record a new retention over a [Record Ref] under a [Policy Ref]. It resolves the policy at the seam, stamps [Retained At] from the injected [Now], computes [Retention Until] and [Purge Deadline] from the injected [Duration] and [Max Purge Delay], records the retention in [Retained], and returns the fresh [Retention Id].

Kind: Operation

#### Purge

The behavior the host invokes to transition a retention to [Purged], destroying the underlying record. It is permitted only once the retention period has elapsed (the pure [Now] ≥ [Retention Until] guard, which writes nothing when it fails); on success it stamps [Purged At] from the same injected [Now]. It does not refuse late purges — the lateness is observed as [Overshoot], not rejected.

Kind: Operation

#### Retention Id

The opaque, immutable identity of a retention, host-allocated at the I/O seam on [Place Under Retention] and never reused. The [Record Ref], [Policy Ref], and the derived deadlines are properties of the retention, not its identity.

Kind:     Field
Field of: Retention Window
Projects: retention_id

#### Record Ref

The opaque reference to *what* is being retained — the record the retention covers. The atom does not interpret it; the host defines what counts as a record and how to reference it. Set on [Place Under Retention], immutable thereafter.

Kind:     Field
Field of: Retention Window
Projects: record_ref

#### Policy Ref

The opaque reference to *which* retention rules apply. The policy registry is a separate concept; the atom requires only that the policy expose a [Duration] and a [Max Purge Delay]. Set on [Place Under Retention], immutable thereafter.

Kind:     Field
Field of: Retention Window
Projects: policy_ref

#### Retained At

The wall-time the retention was placed under retention, stamped from the injected [Now] on [Place Under Retention]. Immutable thereafter. It is the anchor from which [Retention Until] is derived.

Kind:     Field
Field of: Retention Window
Projects: retained_at

#### Retention Until

The earliest time purge is permitted — the end of the retention period, derived once as [Retained At] + [Duration] on [Place Under Retention] and immutable thereafter. The [Purge] guard admits a purge only while [Now] ≥ [Retention Until].

Kind:     Field
Field of: Retention Window
Projects: retention_until

#### Purge Deadline

The latest time the regulator expects purge to occur, derived once as [Retention Until] + [Max Purge Delay] on [Place Under Retention] and immutable thereafter. Operating past it is observable [Overshoot]; the atom observes this bound but does not enforce it.

Kind:     Field
Field of: Retention Window
Projects: purge_deadline

#### Purged At

The wall-time the retention was purged, stamped from the injected [Now] on [Purge]. Present only in [Purged]. Its relation to [Purge Deadline] is what makes [Overshoot] computable from the record alone.

Kind:     Field
Field of: Retention Window
Projects: purged_at

#### Purge Eligible

The derived read-surface projection that reads `true` exactly when a retention is still [Retained] *and* its period has elapsed — `state = Retained ∧ [Now] ≥ [Retention Until]`. It is a pure function of the stored record and the injected [Now], computed at read time and **never stored** (Invariant 11). It is the same predicate the [Purge] guard evaluates.

Kind:     Field
Field of: Retention Window
Projects: purge_eligible

#### Overshoot

The derived metric, for a [Purged] retention, of [Purged At] − [Purge Deadline] when positive — the amount by which purge ran late. Computable from the records alone; surfaced to compliance dashboards but never stored. It is the data-minimization finding the audit reads from the record itself.

Kind:     Field
Field of: Retention Window
Projects: overshoot

#### Active Overdue

The derived metric, for a still-[Retained] retention, of [Now] − [Purge Deadline] when positive — a record overdue for purge that has not yet been purged. Computable from the record and the injected [Now] alone; surfaced as a derived view, never stored.

Kind:     Field
Field of: Retention Window
Projects: active_overdue

#### Now

The current wall-clock reading, pipeline-injected at the single I/O seam (the execution contract supplies `clock_t` there) before a transition runs — never a caller-supplied action parameter. It is consumed to stamp [Retained At] / [Purged At] on a write and to evaluate the pure [Purge] eligibility guard, and it drives the read-time [Purge Eligible] projection; it is never stored under this name.

Kind:         Parameter
Parameter of: Place Under Retention and Purge
Projects:     now

#### Duration

The retention period the policy exposes — the injected scalar from which [Retention Until] is computed. The atom requires it to be positive (Invariant 6). It is resolved from the [Policy Ref] at the seam and consumed by [Place Under Retention]; it is never stored under this name (the stored result is [Retention Until]).

Kind:         Parameter
Parameter of: Place Under Retention
Projects:     duration

#### Max Purge Delay

The maximum allowed lag between retention-end and purge the policy exposes — the injected scalar from which [Purge Deadline] is computed. The atom requires it to be non-negative (Invariant 6). It is resolved from the [Policy Ref] at the seam and consumed by [Place Under Retention]; it is never stored under this name (the stored result is [Purge Deadline]).

Kind:         Parameter
Parameter of: Place Under Retention
Projects:     max_purge_delay

#### Retained

The state of a retention under active retention obligation — placed but not yet purged. A retention enters [Retained] on [Place Under Retention] and leaves it only on [Purge] (to [Purged]). Its retention period may or may not have elapsed.

Kind:      Member
Member of: the retention state
Role:      Outcome

#### Purged

The terminal state of a retention whose underlying record has been destroyed. A retention enters [Purged] on a successful [Purge] and never leaves it — there is no un-purge or restore surface (Invariant 3). The [Purged] record is the audit evidence that the record was lawfully destroyed.

Kind:      Member
Member of: the retention state
Role:      Outcome

#### Invalid Request

The refusal [Place Under Retention] returns when [Record Ref] or [Policy Ref] is malformed — neither contains a non-whitespace character. A guard rejection that fails before any store write; no retention is recorded.

Kind:      Member
Member of: the Place Under Retention rejection
Role:      Outcome
Projects:  invalid-request

#### Policy Not Found

The refusal [Place Under Retention] returns when [Policy Ref] does not resolve to a known policy in the policy registry. Distinct from [Invalid Policy] (a policy that resolves but is invalid). A guard rejection; no retention is recorded.

Kind:      Member
Member of: the Place Under Retention rejection
Role:      Outcome
Projects:  policy-not-found

#### Invalid Policy

The refusal [Place Under Retention] returns when the resolved policy is invalid — its [Duration] is not positive or its [Max Purge Delay] is negative. Distinct from [Policy Not Found] (the policy could not be resolved at all). A guard rejection; no retention is recorded.

Kind:      Member
Member of: the Place Under Retention rejection
Role:      Outcome
Projects:  invalid-policy

#### Not Retained

The refusal [Purge] returns when the [Retention Id] references a retention not currently in [Retained] — it is already [Purged]. An identity/state rejection, checked before the time gate.

Kind:      Member
Member of: the Purge rejection
Role:      Outcome
Projects:  not-retained

#### Not Known

The refusal [Purge] returns when the supplied [Retention Id] references no recorded retention — a lookup miss. An identity/state rejection, checked before the time gate.

Kind:      Member
Member of: the Purge rejection
Role:      Outcome
Projects:  not-known

#### Retention Period Not Elapsed

The refusal [Purge] returns when the eligibility guard finds [Now] < [Retention Until] — the retention period has not yet elapsed. The pure no-early-purge gate (Invariant 7); it writes nothing when it fails.

Kind:      Member
Member of: the Purge rejection
Role:      Outcome
Projects:  retention-period-not-elapsed

#### Storage Failure

The refusal either [Place Under Retention] or [Purge] returns when the store write fails after all preconditions pass. For [Place Under Retention] no retention is recorded; for [Purge] the retention remains in [Retained] and the underlying record is not destroyed. The caller must treat it as definitive and retry.

Kind:      Member
Member of: the Place Under Retention / Purge rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Retention Window]: #retention-window
[Place Under Retention]: #place-under-retention
[Purge]: #purge
[Retention Id]: #retention-id
[Record Ref]: #record-ref
[Policy Ref]: #policy-ref
[Retained At]: #retained-at
[Retention Until]: #retention-until
[Purge Deadline]: #purge-deadline
[Purged At]: #purged-at
[Purge Eligible]: #purge-eligible
[Overshoot]: #overshoot
[Active Overdue]: #active-overdue
[Now]: #now
[Duration]: #duration
[Max Purge Delay]: #max-purge-delay
[Retained]: #retained
[Purged]: #purged
[Invalid Request]: #invalid-request
[Policy Not Found]: #policy-not-found
[Invalid Policy]: #invalid-policy
[Not Retained]: #not-retained
[Not Known]: #not-known
[Retention Period Not Elapsed]: #retention-period-not-elapsed
[Storage Failure]: #storage-failure

---

## Composition notes

Retention Window is freestanding and is the lifetime-management contract every regulated record composes with:

- **[Event Log](./event-log.md)** — every Event Log instance under regulatory scope places each appended event under retention. The atom's [Record Ref] references the [Event Id](./event-log.md#event-id); retention policy depends on the host system's regulatory regime (SOX 7 years, HIPAA 6+ years, PCI DSS days, etc.). Event Log's retention-as-out-of-scope is now resolved by this composition.
- **[Provisional Commitment](./provisional-commitment.md)** — terminal-state commitments (Confirmed, Released, Expired) are placed under retention per the host system's regulatory regime. Financial commitments under SOX retain 7 years; healthcare bed assignments under HIPAA retain 6 years; reservation records under PCI DSS retain only as long as transaction-investigation needs require.
- **[Actor Identity](./actor-identity.md)** — attestation records are placed under retention. The retention period typically matches the retention of the underlying actions; an attestation lives at least as long as the record it attests to.
- **Storage Tier** *(forthcoming)* — orthogonal axis; manages active-vs-cold storage transitions independent of retention state.
- **[Defensible Retention](../compositions/defensible-retention.md)** — the primary composition naming Retention Window as a direct constituent. Defensible Retention wires Legal Hold + Retention Window + Audit Trail substrate to enforce that purge is blocked while any Active hold covers the record. Retention Window's [Retention Until] and [Purge] surface are the mechanism; Defensible Retention is the gate that makes hold-blocked purge the enforced policy.
- **Legal Hold** *(forthcoming)* — pauses purge eligibility during litigation, regulatory investigation, or other legal preservation orders.
- **Cryptographic Shredding** *(forthcoming)* — implements [Purge] for records that cannot be directly deleted (immutable logs, distributed replicas, encrypted-at-rest storage).
- **Erasure Coordination** *(forthcoming)* — handles GDPR Article 17 erasure requests against retention obligations, in coordination with legal counsel and Cryptographic Shredding.
- **Policy Registry** *(forthcoming)* — manages the definition, versioning, and attestation of retention policies. Supplies the [Policy Ref] this atom consumes opaquely.
- **Trusted Timestamping** *(forthcoming, per RFC 3161)* — verifiable time-anchor for retention deadlines.

The canonical regulated-audit stack composes [Event Log](./event-log.md) + [Actor Identity](./actor-identity.md) + Retention Window + [Tamper Evidence](./tamper-evidence.md) as four freestanding atoms; the **[Audit Trail](../compositions/audit-trail.md)** composition is the wiring.

---

## Standards references

Retention Window is one of the most heavily standardized concepts in compliance; its standards inheritance is correspondingly rich:

- **ISO 15489-1 (Information and documentation — Records management)** — the International Organization for Standardization's standard for records-management practice. Defines retention as a managed lifecycle with policy-governed start, retention period, and disposition. The atom's two-state model is the operational core of ISO 15489's lifecycle framing.
- **GDPR Article 5(1)(e) — Storage limitation principle** — personal data must be kept *no longer than necessary*. The atom's [Overshoot] metric is the operational form of GDPR's data-minimization audit; persisting personal data past [Purge Deadline] is a violation surfaced by the record itself.
- **HIPAA §164.530(j) — Documentation retention** — 6-year federal baseline for required HIPAA documentation; state law commonly extends this for clinical records. The atom's [Policy Ref] carries the applicable rule; the host system reconciles federal-state-policy overlap.
- **Sarbanes-Oxley §802 — Retention of records relevant to audits and reviews** — 7-year retention for audit workpapers, with criminal penalties for early destruction. The atom's no-early-purge invariant is the structural fix for SOX §802's anti-shredding mandate.
- **SEC Rule 17a-4 — Records to be preserved by certain exchange members, brokers, and dealers** — 3-to-7-year retention with specific access-tier requirements (first two years immediately accessible). Storage-tier sub-requirements compose with Storage Tier; the retention obligation itself is this atom.
- **FINRA Rule 4511 — General requirements for books and records** — incorporates SEC retention rules for FINRA-registered entities.
- **21 CFR Part 11 — FDA electronic records and electronic signatures** — records covered by Part 11 are retained for the longer of the predicate-rule period or 7 years; destruction must be authorized and audited. Composes with Actor Identity for the destruction-authorization attestation.
- **DoD 5015.02-STD — Design criteria standard for electronic records management software applications** — the U.S. government's records-management software baseline. The atom's separation of retention obligation from storage tier and from disposition mechanism matches DoD 5015's architecture.
- **PCI DSS Requirement 3 — Protect stored cardholder data** — including 3.1 (data retention and disposal). The atom carries the *as briefly as possible* posture by allowing very short policy durations.
- **IRS retention guidelines (Publication 583, etc.)** — generally 3-year retention for tax records, longer for specific circumstances (assessments, fraud, employment tax). [Policy Ref] encodes the rule.
- **NARA General Records Schedules (U.S. federal)** — government-wide retention schedules; the policy registry the atom composes with would normally derive from NARA for federal-agency deployments.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing storage tier, legal hold, cryptographic shredding, and policy registry as separate concepts.
- **Eiffel's design-by-contract** — preconditions on [Purge]; named rejection reasons.
- **Linear temporal logic** — retain-then-Retained persistence, terminal absorption, and the no-early-purge precondition expressed as temporal properties.
- **Records management literature** — Ranganathan's principles applied to organizational records; Schellenberg's appraisal theory of which records merit which retention.

---

## Generation acceptance

A derived implementation of Retention Window is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the retention record set, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Determine the retention policy applied to any record.** From the retention record's [Policy Ref] plus the composed Policy Registry's policy definitions, the auditor can read the applicable retention rule for any record.
- **Verify the no-early-purge invariant.** Query the [Purged] set for any retention where [Purged At] < [Retention Until]. Invariant 7 makes this set structurally empty; the auditor sees the empty result as a guarantee, not a procedural claim.
- **Confirm purge-eligibility is derived, never stored.** Confirm that **no** retention record carries a stored "eligible" or "expired" flag. For any [Retained] retention, the auditor computes [Purge Eligible] ⟺ [Now] ≥ [Retention Until] from the immutable [Retention Until] and the read-time clock — reproducing exactly what the read surface returns and what the [Purge] guard evaluates. Invariant 11 is the guarantee; a stored eligibility flag is a defect.
- **Compute overshoot for any retention.** For [Purged] retentions, [Purged At] − [Purge Deadline] (positive means late); for [Retained] retentions still past their [Purge Deadline], [Now] − [Purge Deadline]. Both are computable from the records alone.
- **Reconstruct the policy history of any record.** When a record has been re-retained under successive policies, the retention records form a sequence indexed by [Record Ref], each with its own [Policy Ref] and lifecycle.
- **Identify the composing patterns active in this deployment.** Whether Storage Tier, Legal Hold, Cryptographic Shredding, Erasure Coordination, Policy Registry, and Trusted Timestamping are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce records that pass the six checks above. The bar is the regulator's question — *"can you prove every record's retention obligation was honored, and surface any current overshoot?"* — answered structurally from the records, not procedurally from runtime claims.

---

## Status

`grounded on Final Critique 5 — 2026-06-23` — the **execution/render-time refactor** is complete and the closing fresh-reader Final Critique (Final Critique 5) returned clean. This was the LIGHT transform: there was no stored expiry flag to remove (Purged is a real write — it records that the purge happened — so it correctly stays stored, not derived). The injected clock `now` is **pipeline-injected at the I/O seam** (the execution contract supplies `clock_t` at the seam), so the `place_under_retention(record_ref, policy_ref)` and `purge(retention_id)` caller signatures carry **no** `now` parameter — an interim draft of this refactor threaded `now` into both signatures and was **reverted** (the seam, not a parameter, is the contract for clock entry; the revert also dissolves a spurious constituent-change cascade — see Lineage F2). The `retention-period-not-elapsed` guard is marked a **pure** function of the stored record and the injected `now` (`state = Retained ∧ now ≥ retention_until`) and is kept, not weakened (it is the residual execution-time check, clearly marked, not derived away); and a derived read-time **`purge_eligible`** projection plus **Invariant 11** (purge-eligibility is derived, never stored) make eligibility a computed condition rather than a stamped/stored flag. A Logic-confinement note was added to Decision points. Refining fixes folded in on the re-pass: F1 (Generation acceptance "five"→"six" checks), F4 (`place_under_retention` rejection-priority order), F5 (no-early-purge stated as a per-`retention_id` guarantee; overlapping-retention hazard named as the composing pattern's to close), F6 (undefined `purger` field dropped). Prior grounding: `grounded on Final Critique 4 — 2026-06-18` (formal-layer vote stands **NO** — English-only; confirmed NO on this re-pass — the revert and refining fixes change no load-bearing temporal/safety claim). See Lineage §Execution/render-time refactor — 2026-06-21 and §Final Critique 5.

Prior status detail (retained for the audit trail): all required structural elements resolved; identity model explicit; transition preconditions with fully-named rejection taxonomies including `policy-not-found` and `storage-failure`; invariants including retention store durability (Invariant 10) and clock-qualified Invariant 8; five cross-domain examples plus two rejection-path examples; regulated adversarial scenarios; fourteen edge cases including concurrent retentions for the same record, purge persistence failure, and divergence between retention state and underlying record destruction (all added in refinement round 1). Second entry in `compliance`.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

This atom survived all three pressure-testing passes (see [`pressure-testing.md`](../pressure-testing.md)) on its first iteration. The two regulated-pattern conventions documented in [`contributing.md`](../contributing.md) and [`pressure-testing.md`](../pressure-testing.md) — *Regulated adversarial scenarios* and *Generation acceptance* — were baked in from the first draft, the first regulated atom drafted entirely against the canonical methodology rather than against earlier worked examples.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine GRID nodes resolved with their references intact. The Friction node is captured implicitly via Edge cases — the atom is operating-by-default and surfaces friction only at composition boundaries (legal hold pausing purge, erasure right trumping retention, storage tier reshaping access). State is unusually small for a regulated atom — two states only — because Pass 2 extracted what early drafts wanted to absorb.

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

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 7 (no-early-purge — purge gated by now ≥ retention_until) is a time-gated safety property; Invariant 6 the temporal chain retained_at < retention_until ≤ purge_deadline. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal-layer vote — reconsidered 2026-06-03: NO (formal-not-warranted); pattern restored to `grounded`.** On a second pass over the aggressive-bar sweep, this YES was downgraded. Invariant 7 (no-early-purge) is a *precondition on a single action* — `purge` is admitted only when `now ≥ retention_until` — not an action-vs-action interleaving. A violation is visible in the records alone (`purged_at < retention_until`), so the records-alone Generation-acceptance bar plus the prose discharge the claim; nothing downstream needs a model to check it. The genuine race on this axis — *hold-blocks-purge*, where a Legal Hold must intercept an otherwise-eligible purge — is not the atom's: it is an emergent property of the **Defensible Retention** composition, which retains its YES vote and its own model. Invariant 6's temporal chain (`retained_at < retention_until ≤ purge_deadline`) is an ordering among fields set at one action, likewise records-checkable. The reconsideration follows the *minimum-formalism principle*: do not put a model on a precondition prose already pins. (The original YES remains recorded above for the audit trail of the decision.)

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This atom grounded 2026-05-20 under the early process — foundation plus refinement, with no fresh-reader AI adversarial round — and carried the legacy grandfathered token. This round is that missing AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the atom's Final Critique 4 (Rounds 1–3 the foundation/refinement baseline, per pressure-testing.md §Round structure). One foundational finding closed: F1 Logic Confinement — the clock and `retention_id` are now host-injected at the I/O seam (was 'implicit clock'/`= now`/'system-generated'), and Invariant 8 is strengthened to note that a single injected `now` per action makes the eligibility check and the timestamp capture read the same value, closing the internal backward-skew window. Refining: policy resolution stated as a seam activity (the resolved `duration`/`max_purge_delay` are injected scalars); purge rejection ordering pinned (identity/state rejections before the time gate). Caller signatures unchanged and the invariant set held at 10, so the fixes are additive with no constituent-change cascade. Formal-layer vote stands NO (English-only); F1 secures the records-alone basis the vote relies on. Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, no new surface. Compositions affected — confirming check only, NOT a re-pass: Audit Trail, Defensible Retention, Customer Onboarding, Propagate Consent Revocation Downstream (and transitively Resolve a Person's Data Rights). Grounds at Final Critique 4.

---

**Execution/render-time refactor — 2026-06-21 (touch-triggered; status downgraded to `partially resolved`; signature decision reverted on re-pass).** Direction (Scott): *derive expiry/eligibility at read time; reduce execution-time clock dependence; clearly mark the residual.* The confirmed decision for this corpus-wide sweep of clock-gated atoms: keep clock-gated guards as **pure** guards that read the injected `now` and reject without writing. (An earlier draft of this entry also threaded `now` **explicitly** into the action signatures; that decision has been **reverted** — `now` is **pipeline-injected at the I/O seam** per the execution contract, not an action parameter — see *Signature revert* below.) Retention Window is the **LIGHT** case in this sweep (contrast the worked reference, [`invitation.md`](./invitation.md), where a stored `Expired` state, an `expired_at` field, and an `expire` action were removed): here there is **no stored expiry flag to remove**, because Purged is a *real write* — it records that the purge actually happened — so Purged correctly stays stored, not derived. Changes:

- *Signature revert — `now` is pipeline-injected, not a parameter.* `place_under_retention(record_ref, policy_ref)` and `purge(retention_id)` carry **no** `now` parameter. The clock is `clock_t`, injected by the execution contract at the single I/O seam before the transition runs (the seam, per the Logic Confinement Principle, is where the host reads the clock, allocates `retention_id`, and resolves the policy scalars). An interim draft of this refactor threaded `now` into both signatures (mirroring an early invitation.md draft); that was reverted because the seam is the contract for clock entry — making it a signature parameter implied a caller-supplied, caller-visible `now` and produced a spurious constituent-change cascade (see F2 below). The two purposes `now` serves — stamping `retained_at`/`purged_at` on a write, and the pure `now ≥ retention_until` eligibility guard (no write) — are unchanged; only its delivery (seam, not parameter) is pinned. **Caller signatures are therefore UNCHANGED from Final Critique 4.**
- *F2 (FOUNDATIONAL — self-contradiction + cascade, RESOLVED by the revert).* The interim draft put this entry in direct contradiction with the Final Critique 4 entry above: Final Critique 4 records "caller signatures unchanged … no constituent-change cascade," while the interim 2026-06-21 text called threading `now` "a surface change whose compositions take a touch-triggered re-pass." Reverting the signature resolves the contradiction at its root: `now` is pipeline-injected, so the caller signatures of `place_under_retention` and `purge` are **unchanged**, and there is **no signature-driven cascade** — the Final Critique 4 statement stands as written. Retention Window also had **no removed action** in this refactor (unlike invitation.md, which lost `expire`): `purge` and `place_under_retention` persist with their original signatures and the invariant set holds. With the revert there is therefore **no breaking constituent change at all** — neither a removed action nor a changed signature — so the compositions need no signature-driven re-pass on this account.
- *No-early-purge guard marked pure, kept (not weakened).* The `retention-period-not-elapsed` guard is now stated as a pure function of the stored record and the injected `now` — `purge_eligible(record, now) ≜ state = Retained ∧ now ≥ retention_until` — that **writes nothing** when it fails. It is the residual, genuinely execution-time check that gets *clearly marked* rather than derived away (no-early-purge, Invariant 7, is the regulator's structural guarantee and is preserved verbatim in force).
- *Derived read-time `purge_eligible` projection added.* The read surface now carries `purge_eligible` (the same predicate the guard evaluates), so eligibility is **derived** at read time, never stamped or stored. New **Invariant 11 — Purge-eligibility is derived, never stored** locks this. Decision points gained a **Logic confinement (clock and id)** note (clock/id injected at the seam; the eligibility guard and the projection both pure over the stored record + injected `now`; no clock read inside a transition; purge rejection priority pinned).
- *Refining fixes folded in on the re-pass (F1, F4, F5, F6):*
  - **F1 (Generation acceptance count).** The closing prose said "the five checks above" but the section lists **six** bullets. Corrected to "six."
  - **F4 (`place_under_retention` rejection-priority order).** Decision points now gives `place_under_retention` an explicit rejection-priority order mirroring the `purge` treatment: malformed `record_ref`/`policy_ref` (`invalid-request`) → `policy-not-found` → policy validity (`invalid-policy`) → `storage-failure`.
  - **F5 (no-early-purge scope; overlapping-retention hazard).** The *Multiple simultaneous retentions* edge case now states that no-early-purge (Invariant 7) is a **per-`retention_id`** guarantee — each `purge` is gated against its own `retention_until` only; overlapping retentions over one record are **not jointly enforced by the atom**. The hazard is named explicitly: purging a shorter retention destroys a record still under a longer obligation (which lived on a different `retention_id` the atom never cross-references), and closing it is the composing pattern's job.
  - **F6 (undefined `purger` field).** The *Non-repudiation of the purge action* edge case previously referenced a `purger` field the atom never defines. Resolved by **dropping** the `purger`-field language: the atom models no actor on the purge; the actor surface belongs to the composing Actor Identity pattern.
- *No formal model exists* (formal-layer vote is NO, English-only), so there is no model to re-derive; the records-alone basis the vote relies on is unchanged and is in fact reinforced (eligibility is now explicitly records-derivable). **Formal-layer vote confirmed NO** (formal-not-warranted) — the signature revert and refining fixes change no load-bearing temporal/safety claim; no-early-purge stays a records-checkable precondition on a single action, exactly the basis the NO vote rested on.
- *No constituent-change cascade (Lineage-only note; composition files NOT edited):* with the signature revert (above), `now` is pipeline-injected and the `place_under_retention` / `purge` caller signatures are **unchanged** — there is **no surface change** to Retention Window and therefore **no signature-driven re-pass** owed to its compositions on this account. (For the record, the compositions naming Retention Window as a direct constituent are **Defensible Retention**, **Audit Trail** (the canonical regulated-audit stack), **Chain of Custody**, **Immutable Transaction Ledger**, and **Customer Onboarding**; transitively, Propagate Consent Revocation Downstream and Resolve a Person's Data Rights reach it through those substrates. None requires a touch-triggered re-pass from this refactor, the signature being unchanged.)

**Final Critique 5 — 2026-06-23 — clean (fresh-reader re-gate; council-run).** Closing fresh-reader Final Critique (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus at X2) over the execution/render-time refactor batch returned **zero foundational findings**. Formal-layer vote NO reconfirmed (records-alone checks; no model warranted). Regrounded at Final Critique 5.

**Annotation conversion — 2026-06-29 (annotation.md second-batch rollout, foundations-first with Actor Identity, Tamper Evidence, Permissions, Provisional Commitment, Session).** Converted every concept reference in the live body to a `[Term]` marker and added the per-page Terms registry, applying the resolved four-kind ontology — **Type**, **Operation**, **Field** (a datum a Type carries — *what does it carry?*), **Parameter** (a value an Operation needs — *what does it need?*), and **Member**. Inventory: one **Type** ([Retention Window]); two **Operations** ([Place Under Retention], [Purge]); ten **Fields** the [Retention Window] carries — the seven stored data ([Retention Id], [Record Ref], [Policy Ref], [Retained At], [Retention Until], [Purge Deadline], [Purged At]) plus three derived read-surface projections that are computed and never stored ([Purge Eligible], [Overshoot], [Active Overdue]); three **Parameters** consumed at the seam but never stored under their own names ([Now], the pipeline-injected clock, and the resolved policy scalars [Duration] and [Max Purge Delay]); and nine **Members** — the two retention states ([Retained], [Purged], pure state with no wire form, so no `Projects:` line) and the seven named rejections ([Invalid Request], [Policy Not Found], [Invalid Policy] for [Place Under Retention]; [Not Retained], [Not Known], [Retention Period Not Elapsed] for [Purge]; and [Storage Failure] for both). The discriminator *stored-as-itself → Field, consumed/supplied-but-not-stored-under-that-name → Parameter* placed every datum cleanly: [Now] is consumed to stamp [Retained At] / [Purged At] and evaluate the [Purge] guard but is never stored as itself; [Duration] / [Max Purge Delay] are injected scalars from which [Retention Until] / [Purge Deadline] are computed, never stored under their own names; [Purge Eligible] / [Overshoot] / [Active Overdue] are derived projections the record surfaces (Fields the [Retention Window] carries at read time) but never persists. Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). The two Operation contracts (`place_under_retention(record_ref, policy_ref) → …`, `purge(retention_id) → …`) are kept once each in Inputs as the labeled *projected contract*; the concrete example invocations in Examples (`purge(retention_id: "ret-0047")`, `place_under_retention(record_ref: "txn-1188", …)`) and their literal returns are left verbatim as illustrative wire-level calls, as are the pinned wire returns `ok` / `true` / `false` and the example policy literal `policy_sox_settled_txn`. Cross-page handling: the [Record Ref]-references-event-id sentence in Composition notes became a full cross-page link `[Event Id](./event-log.md#event-id)` now that Event Log is converted; the `grant` reference (Permissions' Operation, not yet converted in this batch) stays backticked until that page carries a registry; the page-level Type links (`[Event Log](./event-log.md)`, `[Actor Identity](./actor-identity.md)`, `[Tamper Evidence](./tamper-evidence.md)`, etc.) are unchanged. Expression only — all eleven invariants hold their exact claims ([Retained At] < [Retention Until] ≤ [Purge Deadline] is the identical ordering; the no-early-purge gate [Now] ≥ [Retention Until] is the identical precondition), the invariant count is unchanged at eleven and nothing was renumbered, and dependents' references to Retention Window's surface remain accurate. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 5 — 2026-06-23`. Gates: linter 0 (incl. the O-term-resolver, resolving all of this page's markers against its registry); no formal model exists (formal-layer vote NO, English-only), so the harness gate is N/A; the derived manifest projects an identifier kind (Field) and an enumerated/wire kind (Member); diff read line-by-line against the same-claim-or-weaker test.

**Showcase pass — 2026-06-29.** Brought to the full showcase standard, matching the [`duplicate-prevention.md`](./duplicate-prevention.md), [`provisional-commitment.md`](./provisional-commitment.md), and [`session.md`](./session.md) exemplars, on top of the already-applied annotation conversion. Changes are representational only: (1) **Summary/blockquote merge** — the plain Tier-1 [`prose.md`](../working-ideas/prose.md) cut-#4 Summary moved to the very top (before Intent), and the descriptive top blockquote folded out as redundant. Every blockquote claim was confirmed already carried before deletion: record-kept-then-purged (Summary, Intent); the opaque immutable host-allocated id (Identity model, the [Retention Id] card, Invariant 4); [Record Ref]/[Policy Ref]/deadlines immutable (Invariants 4, 5, 6); the two states [Retained]/[Purged] (Summary, State); no purge before retention-end (Summary, Invariant 7); purge-after-period expected (Summary, Behavior); the *purge window* between retention-end and [Purge Deadline] (Behavior, Summary's permitted-and-expected span); and overshoot observable-not-prevented (Summary, Invariant 8, Behavior). No claim was unique, so nothing needed folding in; the blockquote was the last raw-casing carrier on the page (it still wrote `Retained` / `Purged` / *purge window* in flowing prose), and removing it leaves the Summary plain. No *also-known-as* line is invented (none existed). (2) **Lineage collapse** — the Lineage notes wrapped in the collapsed `<details>` block mirroring the exemplars, body unchanged, the `---` kept before it. (3) **prose.md cut #1 (one idea per sentence)** — the Summary, one long run-on, split into short declaratives (the blocks-early-deletion clause, the early-boundary-vs-late-observation clause), lossless; one further safe split in the Behavior policy-immutability bullet. The load-bearing precision protected by [`prose.md`](../working-ideas/prose.md) §Leave it alone was left untouched — the no-early-purge guard prose, the single-[Now] discipline, the per-retention-vs-cross-retention enforcement nuance, and the derived-eligibility semantics keep every caveat. (4) **prose.md cut #5 (prose→structure) — APPLIED.** The State section's `Transitions:` prose list rendered as a transition table (action · from · to · guard · stamps · result · rejections), sharper than the prose because the per-action guard, stamps, and rejection sets are now glanceable columns and the derived purge-eligibility row sits beside the two real transitions for contrast. Five cell-resistant semantics are kept in prose *beside* the table per the cut-#5 caveat, never in a cell: (a) the no-early-purge guard is a **pure** function that **writes nothing** when it fails ([Retention Period Not Elapsed], Invariant 7); (b) a late purge past [Purge Deadline] is **observed** as [Overshoot], not refused (refusing would compound the overshoot); (c) purge-eligibility is **derived** at read time ([Purge Eligible]) and never stored (Invariant 11) — no scheduler, no flag; (d) the single-[Now]-per-[Purge] discipline (guard and [Purged At] stamp read the same injected [Now], closing the backward-skew window, Invariant 8); (e) the fixed rejection priority for both actions (cross-referenced to Decision points, where the full per-action preconditions stay). Cuts #2 (glossary) and #3 (cross-ref footer) were assessed and **skipped** as N/A: acronyms are already spelled-out-once inline per the corpus convention here, and provenance already lives in the invariants' supporting prose, Composition notes, and the `Rests on`-style Standards references rather than being re-cited mid-sentence. Expression only — every invariant and its number (1–11) is unchanged in force (Invariant 6's [Retained At] < [Retention Until] ≤ [Purge Deadline] chain, Invariant 7's no-early-purge, Invariant 8's [Retention Until] ≤ [Purged At], and Invariant 11's derived-eligibility are verbatim in force), both projected-contract signatures (`place_under_retention(record_ref, policy_ref) → …`, `purge(retention_id) → …`) and every guarantee are unchanged, and every `[Term]` marker still resolves to its card with the Terms registry intact and the read-surface [Purge Eligible] / [Overshoot] / [Active Overdue] derived-projection definitions preserved. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 5 — 2026-06-23`. The atom has **no formal model** (formal-layer vote NO, English-only), so the harness gate is **N/A** — no model run was performed or claimed. Gates: linter 0 (incl. the O-term resolver — all markers resolve against the registry); the derived manifest projects an identifier kind (Field) and an enumerated/wire kind (Member); `git status` shows no `.tla`/`.cfg`/`.als` change (none exists); diff read line-by-line against the same-claim-or-weaker test.

</details>
