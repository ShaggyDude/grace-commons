---
title: Defensible Retention
parent: Compositions
nav_order: 7
has_toc: true
toc: true
---

# Defensible Retention

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A regulated composition: every record under management is governed by a retention window that bounds its normal purge eligibility, and by a Legal Hold mechanism that suspends that eligibility regardless of the clock. The composition wires Legal Hold, Retention Window, and Audit Trail into the single structure that makes retention *defensible* — provably complete, provably ordered, provably unaltered. The emergent guarantee: no record under an Active hold may be purged regardless of retention eligibility; every retention decision (placement, hold placement, hold release, purge) is attribution-stamped, retention-bounded, and tamper-evident; and the lawful destruction of any record is provable from the composition's records alone, without recourse to source code, runbooks, or developer narration.

---

## Intent

A record's life under a regulated system follows two distinct governance tracks that must coexist without one silently overriding the other. The first is the *retention clock*: a record must be kept for a minimum period mandated by statute, regulation, or contract — seven years under SOX, six years under HIPAA, three years for some broker-dealer communications under SEC Rule 17a-4. The second is the *preservation directive*: when litigation is anticipated, when a regulator opens an investigation, when an audit freeze is ordered, the normal retention clock stops being the governing rule. The obligation shifts to *keep this record until the legal matter resolves, regardless of what the schedule says.*

Neither Retention Window nor Legal Hold, alone, enforces this coexistence. Retention Window enforces the clock — it prevents purge before `retention_until` and records the eligibility transition. Legal Hold records the preservation obligation — it documents who placed the hold, why, and when. But neither atom enforces the other's constraint. A record with an elapsed retention window is eligible for `RetentionWindow.purge` without any knowledge of whether a Legal Hold is active. A record with an Active hold is recorded as preserved but the Legal Hold atom does not intercept a purge call issued against the Retention Window. The gate that enforces *no purge while any Active hold covers a record* belongs to the composition — and this composition is that gate.

Audit Trail provides the third leg: every hold placement, every release, every retention placement, and every purge is attribution-stamped, retention-bounded, and tamper-evident. The destruction of any record is defensible because the evidence trail — who held it, who released the hold, who purged it, under what policy, at what time — is itself a regulated, integrity-protected record that can be verified from the records alone.

This is a composition, not a new primitive. Legal Hold, Retention Window, and Audit Trail are unchanged; the composition is the wiring that makes them coherent as a single retention-governance surface. The construction is what every records-management system under SOX, HIPAA, FRCP Rule 37(e), or SEC Rule 17a-4 implements — but rarely names as a composable concept with explicit structural invariants. This composition retires the forthcoming-link debt in Audit Trail's edge case *Legal hold suspension of purge*, which named this composition as the resolution: it is now landed.

---

## Composes

- **[Legal Hold](../atoms/compliance/legal-hold.md)** — provides the preservation directive: a named, actor-issued hold on a record that suspends purge eligibility regardless of the retention window's clock. The composition maintains exactly one Legal Hold store instance. The `place`, `release`, and `read` API are used directly; the composition wraps `place` and `release` with Audit Trail recording.
- **[Retention Window](../atoms/compliance/retention-window.md)** — provides the policy-bounded record lifetime: `place_under_retention` starts the retention clock for a business record; `purge` destroys the record after the clock runs out. The composition maintains exactly one Retention Window instance governing the business records under management (distinct from the Retention Window instance inside Audit Trail, which governs audit events). The hold-check gate is inserted ahead of every `purge` delegation.
- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every hold placement, hold release, retention placement, and purge decision is recorded as one `record_action` call on the Audit Trail instance, producing an Event Log entry, an Actor Identity attestation, a Retention Window record (for the audit event), and a Tamper Evidence seal per the cadence. The application maintains exactly one Audit Trail instance configured with the host's regulatory retention policy for audit events.

The Event Log, Actor Identity, Retention Window (for audit events), and Tamper Evidence atoms named in the roadmap entry for this composition are reached transitively through Audit Trail; the application does not maintain separate instances of those atoms at this layer. The Retention Window instance named in *Composes* above governs the *business records*; the Retention Window instance inside the Audit Trail substrate governs the *audit events* recording those decisions. The two instances are distinct and their retention policies may differ — audit records should persist at least as long as the business records they describe, and often longer.

---

## Composition logic

### Application state

The composition owns emergent state that wires the three constituent elements into one queryable retention-governance surface:

- **`record_to_retentions`** — map from `record_ref` to the set of `retention_id`s covering that record. A record may be under multiple concurrent Retained retentions (policy-transition scenarios; see Retention Window's edge case on concurrent retentions for the same `record_ref`). This is the auditor's first query surface for determining the governance status of any record.
- **`retention_to_record`** — inverse map from `retention_id` to `record_ref`. Required for the hold-check gate in `purge_record` — given a `retention_id`, the composition must know which `record_ref` to check for Active holds before delegating to `RetentionWindow.purge`.

The hold store is owned by the Legal Hold instance; the composition queries it via `LegalHold.read({record_ref: X, state: Active})` to evaluate purge eligibility. The retention store and seal store are owned by their respective constituent instances. The Audit Trail emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) is owned by the Audit Trail substrate.

### Configuration

- **`business_record_retention_policy`** — the policy reference (or a policy selector `(record_ref) → policy_ref` for content-derived rules) applied at `place_record_under_retention` time. The composition passes this to `RetentionWindow.place_under_retention`. Multi-jurisdiction policy reconciliation — selecting the longer of competing obligations (HIPAA + state law, SOX + GDPR) — is out of scope; a Policy Reconciliation composing pattern produces the reconciled `policy_ref` this composition consumes.
- **`audit_trail_retention_policy`** — the policy reference passed to the Audit Trail instance at each `record_action` call. May differ from `business_record_retention_policy` — the audit trail of a retention or hold decision should persist at least as long as the business record it describes, and often longer (for litigation defensibility after the business record is purged). The deployment configures this separately.
- **`hold_check_mode`** — `strict` (default) or `advisory`. Under `strict`, a non-empty Active hold set causes `purge_record` to return `rejected(under-legal-hold)`. Under `advisory`, the hold presence is recorded in the Audit Trail event with `hold_override = true` and purge proceeds — only valid where a deployment has an external authority that can authorize override (e.g., court-ordered destruction superseding a litigation hold). Deployments operating under FRCP Rule 37(e), SEC Rule 17a-4, or SOX must not configure `advisory`; the `strict` default is the required posture for those regimes.

### Action wiring

The composition exposes five orchestrating actions. Every action that changes state records in Audit Trail. Hold-status queries pass through to Legal Hold's `read` without Audit Trail recording — they are read-only and produce no state change.

- **`place_record_under_retention(record_ref, policy_ref, actor_ref, credential) → retention_id | rejected(invalid-request | recording-failure)`**
  1. `RetentionWindow.place_under_retention(record_ref, policy_ref)` → `retention_id` (or propagate `invalid-request | invalid-policy | policy-not-found`; `storage-failure` surfaced as `recording-failure`).
  2. Record `record_to_retentions[record_ref] ∪= {retention_id}` and `retention_to_record[retention_id] = record_ref`.
  3. `AuditTrail.record_action(action_ref=retention_placed, actor_ref, credential, data={record_ref, retention_id, policy_ref, retention_until, purge_deadline}, retention_policy=audit_trail_retention_policy)` → `event_id`. If this call fails after step 1 succeeded, return `rejected(recording-failure)`; the implementation must address the orphan retention record per the *Cross-store consistency under failure* edge case.
  4. Return `retention_id`.

- **`place_hold(record_ref, placed_by, credential, reason, case_ref?, placed_at?) → hold_id | rejected(invalid-request | recording-failure)`**
  1. `LegalHold.place(record_ref, placed_by, reason, case_ref?, placed_at?)` → `hold_id` (or propagate `invalid-request`; `storage-failure` surfaced as `recording-failure`).
  2. `AuditTrail.record_action(action_ref=hold_placed, actor_ref=placed_by, credential, data={hold_id, record_ref, reason, case_ref, placed_at}, retention_policy=audit_trail_retention_policy)`. If this call fails after step 1 succeeded, return `rejected(recording-failure)` and flag the orphan per *Partial recording on step failure* in Edge cases.
  3. Return `hold_id`.

  *Note on credential.* Legal Hold's atom-level `place` takes `placed_by` as an opaque reference; the composition takes an additional `credential` at the application boundary and passes it to `AuditTrail.record_action` for identity verification via Actor Identity. The atom records the opaque reference; the Audit Trail binds it cryptographically. This mirrors how Audit Trail's `record_action` handles the actor-credential pairing.

- **`release_hold(hold_id, released_by, credential, reason, released_at?) → released | rejected(invalid-request | not-known | already-released | recording-failure)`**
  1. `LegalHold.release(hold_id, released_by, reason, released_at?)` → `released` (or propagate rejections; `storage-failure` surfaced as `recording-failure`).
  2. `AuditTrail.record_action(action_ref=hold_released, actor_ref=released_by, credential, data={hold_id, release_reason: reason, released_at}, retention_policy=audit_trail_retention_policy)`. Same orphan-state handling as `place_hold` step 2.
  3. Return `released`.

- **`purge_eligible() → list of (retention_id, record_ref, retention_until, hold_count) tuples`** — returns every Retained retention whose `now ≥ retention_until`, annotated with the current count of Active holds on the corresponding `record_ref`. Records where `hold_count = 0` are *purge-ready*; records where `hold_count > 0` are *hold-blocked*. Both classes are returned; the caller's compliance dashboard distinguishes them. The hold-blocked list is a compliance signal: those records have passed their retention window but are being lawfully preserved under active holds.

- **`purge_record(retention_id, actor_ref, credential) → ok | rejected(not-known | not-eligible | under-legal-hold | recording-failure)`**
  1. If `retention_id` not in `retention_to_record`, return `not-known`.
  2. Look up `record_ref = retention_to_record[retention_id]`.
  3. `hold_check = LegalHold.read({record_ref: record_ref, state: Active})`. **This is the override-retention-on-hold gate.** If the result is non-empty under `strict` mode, return `rejected(under-legal-hold)` — the rejection data includes the count and `hold_id`s of the blocking holds. If the result is non-empty under `advisory` mode, proceed to step 4 with `hold_override = true` recorded in step 5. The check is performed regardless of whether `now ≥ retention_until` has elapsed; a record under an Active hold cannot be purged via this composition even if it is also past its retention window.
  4. `RetentionWindow.purge(retention_id)` → `ok` (or propagate `not-retained` and `not-known` as `not-known`; `retention-period-not-elapsed` as `not-eligible`; `storage-failure` as `recording-failure`).
  5. `AuditTrail.record_action(action_ref=record_purged, actor_ref, credential, data={retention_id, record_ref, hold_check_result: empty, hold_override: false, purged_at: now}, retention_policy=audit_trail_retention_policy)`. Under advisory mode with a non-empty hold check: `hold_check_result: {hold_ids: [...], count: N}, hold_override: true`. The `hold_check_result` field is the auditable proof of what the hold store contained at purge time.
  6. Return `ok`.

### The load-bearing wiring decision — override-retention-on-hold

The composition's structural reason to exist: **a record under an Active Legal Hold cannot be purged regardless of whether its retention window has elapsed.** This rule sits in `purge_record` step 3 — between the hold check and the `RetentionWindow.purge` call — and is the gate neither constituent atom can enforce alone.

*Principle:* Retention Window's `retention-period-not-elapsed` precondition prevents premature purge but has no knowledge of Legal Hold's state. Legal Hold records preservation obligations but does not intercept purge calls. Without the composition wiring the two checks together, a system can lawfully (from each atom's perspective) purge a record that is under an active litigation hold — a spoliation exposure that is structurally invisible to either atom alone.

*Likely objection:* Why not have Legal Hold intercept `RetentionWindow.purge` directly, rather than needing a composition?

*Mechanism that resolves it:* Legal Hold is a freestanding atom. If it imported Retention Window semantics and intercepted purge calls, it would know about storage layers, retention records, and purge mechanisms — absorbing concerns that belong to the composing layer and breaking its freestanding status. The atom records the obligation; the composition enforces it. This discipline was architected deliberately: Legal Hold's Composition notes named this composition as the forthcoming resolution; Retention Window's edge case on *Legal hold* named Legal Hold as the composing pattern that intercepts purge; Audit Trail's edge case *Legal hold suspension of purge* named this composition as the landing point. This composition lands all three forthcoming-links simultaneously.

*Result:* The gate is structural. It cannot be misconfigured away under `strict` mode; it is not a runtime check that a well-intentioned operator bypasses by going directly to `RetentionWindow.purge`. The Audit Trail purge event records `hold_check_result: empty` — the auditable proof that the gate passed. An auditor can verify, from the records alone, that no Active holds existed at the time of any purge.

---

## Application-level invariants

These invariants emerge from the composition. None belongs to a single constituent; each requires two or more working together to hold.

- **Invariant 1 — Hold-blocks-purge.** For every record `r` covered by at least one Active hold at the time of a `purge_record(retention_id)` call, the call returns `rejected(under-legal-hold)` and `RetentionWindow.purge` is not invoked under `strict` mode. No record with `LegalHold.read({record_ref: r, state: Active})` returning a non-empty sequence transitions to Purged state via this composition under `strict` mode. This is the composition's defining emergent invariant — it cannot be derived from Legal Hold (which does not intercept purge calls) or from Retention Window (which does not consult the hold store) alone.

  *Defended in-line.* The check in `purge_record` step 3 evaluates `LegalHold.read` before `RetentionWindow.purge`; a non-empty result is a hard rejection under `strict` mode. The Audit Trail purge record carries `hold_check_result: empty` — the auditor verifies from the record that the gate passed. The one structural gap: a race condition where a hold is placed between the check and the purge call (see *Concurrent hold placement and purge* in Edge cases); named as an explicit out-of-scope and a deployment-serialization obligation.

- **Invariant 2 — Retention coverage.** Every business record placed under management by this composition has a corresponding Retention Window record in Retained or Purged state. `retention_to_record` is populated only on `place_record_under_retention` success; a record not placed via this composition is not in the map and is not subject to the hold-check gate.

- **Invariant 3 — Hold audit coverage.** Every successful `place_hold` and `release_hold` call produces an Audit Trail event carrying the `hold_id`, `record_ref`, and actor attribution. The full hold lifecycle — placement to release — is reconstructible from the Audit Trail and is tamper-evident via the Audit Trail substrate's seal coverage.

- **Invariant 4 — Retention-decision audit coverage.** Every `place_record_under_retention` and every successful `purge_record` call produces an Audit Trail event. The purge event carries `hold_check_result: empty` — the auditable proof that the hold gate passed at purge time.

- **Invariant 5 — Audit completeness modulo Audit Trail's partial-attestation contract.** Every state-changing action produces exactly one `AuditTrail.record_action` call. The invariant inherits Audit Trail's atomicity surface: if Actor Identity's `attest` (inside `record_action`) succeeds but Event Log's `append` fails, an orphan attestation exists without a corresponding event-log entry. This composition does not re-derive Audit Trail's orphan-resolution discipline; it inherits it and requires the implementation to surface and resolve any orphan attestation referencing this composition's `action_ref` values. Invariant 5 holds *modulo* Audit Trail's own partial-attestation contract, as established for regulated compositions in Multi-Party Approval's Invariant 5.

- **Invariant 6 — Non-retroactivity of holds.** A hold placed after a successful `purge_record` does not alter the Retention Window record (terminal in Purged state, by Retention Window's Invariant 3), does not remove the Audit Trail purge event (immutable by Event Log's Invariant 2), and does not change the composition's assessment of the purge's legality. The hold creates a new Legal Hold record with `placed_at` postdating `purged_at`. The records faithfully document the chronology; legal counsel and the court assess the consequences.

- **Invariant 7 — Multi-hold independence.** When N Active holds cover a record, releasing any subset does not make the record purge-eligible unless zero Active holds remain. `purge_eligible()` lists a record as hold-blocked whenever `hold_count ≥ 1`. `purge_record` returns `under-legal-hold` if any Active hold remains, regardless of count. Legal Hold's Invariant 4 (concurrent holds are independent) is the constituent guarantee; this invariant names the aggregate consequence at composition level.

- **Invariant 8 — Defensible destruction.** Every record successfully purged via `purge_record` has, in the composition's records: (a) an Audit Trail purge event with `hold_check_result: empty`, evidencing that the hold gate passed; (b) a Retention Window record in Purged state with `purged_at ≥ retention_until` (Retention Window Invariant 8); (c) the Audit Trail event carrying the purge attribution and timestamp under a tamper-evident seal. An external auditor can verify all three from the records alone without recourse to source code, runbooks, or developer narration.

Attribution coverage (Invariants 3 and 4) plus hold-blocks-purge (Invariant 1) plus defensible destruction (Invariant 8) together give the *provable lawfulness* property — every destruction is either blocked or has auditable proof of authorization. Multi-hold independence (Invariant 7) and non-retroactivity (Invariant 6) close the lifecycle coherence.

---

## Examples

### Walkthrough — regulated bank under SOX §802 and FRCP Rule 37(e)

A multinational bank uses this composition to govern its general-ledger transaction records. Configuration: `business_record_retention_policy = sox_7_year`, `audit_trail_retention_policy = sox_9_year`, `hold_check_mode = strict`.

1. **Retention placed.** `place_record_under_retention(record_ref="txn-2026-0441", policy_ref="sox_7_year", actor_ref="records_system", credential)` → `retention_id = ret-0441`. `retention_until = 2033-05-10`. Audit Trail records the placement.

2. **Litigation anticipated.** Three years later: `place_hold(record_ref="txn-2026-0441", placed_by="counsel_morgan", credential, reason="Litigation hold — anticipated class action re Q3 2026 operations", case_ref="matter-2029-morgan")` → `hold_id = hold-0441-a`. Audit Trail records the hold placement.

3. **Retention window elapses.** In 2033, `purge_eligible()` returns `txn-2026-0441` in the hold-blocked list: `hold_count = 1`, `now ≥ retention_until`. The record is not purged. The compliance dashboard surfaces the hold-blocked status.

4. **Litigation settles.** `release_hold(hold_id="hold-0441-a", released_by="counsel_morgan", credential, reason="Class action settled — May 2033")` → `released`. Audit Trail records the release.

5. **Purge proceeds.** Next `purge_eligible()` run returns `txn-2026-0441` as purge-ready: `hold_count = 0`. `purge_record(retention_id="ret-0441", actor_ref="records_system", credential)` → `ok`. Retention Window record moves to Purged. Audit Trail records the purge with `hold_check_result: empty, purged_at = 2033-05-15`.

6. **SOX §404 audit.** The auditor queries Audit Trail and the hold store. Full lifecycle: retention placed → hold placed → hold released → purge. `verify_record` on each Audit Trail event returns `verified`. The auditor confirms: (a) no purge occurred while the hold was Active; (b) purge occurred within the allowable window after hold release; (c) purge was attributed to a named actor under a verified credential. Defensible destruction proven from the records.

### Banking — concurrent regulatory investigations under SOX

A bank faces simultaneous DOJ criminal and SEC civil enforcement. Both issue preservation demands for the same trading records. Two independent hold sets are placed: `hold-doj-*` (`case_ref: "doj-crim-2026-0011"`) and `hold-sec-*` (`case_ref: "sec-enf-2026-0087"`). When DOJ closes, all `hold-doj-*` holds are released. `purge_eligible()` shows the records as hold-blocked (`hold_count = 1` — SEC holds remain). Invariant 7 guarantees that releasing the DOJ holds had no effect on the SEC holds. Only after the SEC holds are released do the records become purge-ready.

### Healthcare — HIPAA §164.530(j) records under HHS OCR investigation

A hospital places patient encounter records under a 6-year HIPAA retention policy. HHS OCR opens a breach investigation; compliance places holds under `case_ref: "ocr-hipaa-inv-2026-0334"`. The 6-year windows elapse during the investigation; `purge_eligible()` consistently lists the affected records as hold-blocked. After OCR closes the investigation, holds are released and records are purged in the next eligible run. The Audit Trail for each record shows the complete arc: retention placed, OCR hold placed, OCR hold released, purge executed post-hold. An OCR auditor sees a tamper-evident lifecycle confirming preservation obligations were honored throughout.

### Broker-dealer — SEC Rule 17a-4 non-erasable records under FINRA examination

A broker-dealer places all business communications under a 7-year retention policy per SEC Rule 17a-4. When a FINRA examination is announced, holds are placed on all in-scope records under `case_ref: "finra-exam-2026-0112"`. During the exam, `purge_eligible()` returns the in-scope records as hold-blocked; no records are purged. After the exam closes, holds are released; records with elapsed windows are purged in the post-exam run. The Audit Trail provides the WORM-equivalent decision record the examination requires; the composition's Tamper Evidence (via Audit Trail) satisfies Rule 17a-4's integrity requirements.

### E-discovery — FRCP Rule 37(e) preservation duty, disputed destruction

Litigation is anticipated. Counsel places holds on email records under scope `email-project-alpha-*`. Months later, opposing counsel moves for sanctions under FRCP Rule 37(e), claiming documents were destroyed after the duty arose. The defense queries the Audit Trail for `record_purged` events in the disputed scope. Each purge event either (a) has `purged_at` predating the preservation duty trigger date — lawful destruction before the duty arose — or (b) has no corresponding hold placed before the destruction — a finding if the duty had already attached. For every record where a hold was placed before any destruction, the Audit Trail shows `hold_placed` before any `record_purged` event, and `purge_eligible()` at the time would have listed the record as hold-blocked. The composition's records answer the spoliation question structurally, without developer testimony.

### GDPR Article 17 collision — erasure request vs. Legal Hold

A data subject in the EU invokes GDPR Article 17 right to erasure. Before executing, the system queries this composition:

If `LegalHold.read({record_ref: subject_record, state: Active})` returns non-empty, the erasure is deferred. GDPR Article 17(3)(e) explicitly exempts data necessary for the establishment, exercise, or defence of legal claims; the Active hold is the operational record establishing that exception. The system records the deferral in the Audit Trail, citing the blocking `hold_id`s, and notifies the data subject that the request has been received but is suspended while a legal hold is active.

If no Active holds exist but `now < retention_until`, the record is under an active retention obligation that may override the erasure right — HIPAA §164.530(j) and SOX §802 retention requirements are legal obligations under Article 17(3)(b). The system records the retention-obligation ground in the Audit Trail.

If no Active holds and `now ≥ retention_until`, `purge_record` proceeds.

In all three branches, the Audit Trail event is the evidence of the system's decision and the regulatory reasoning. The composition does not adjudicate the legal question — it records the state of the atoms at decision time, giving legal counsel the evidence needed to defend any path taken.

### Regulated adversarial scenarios

**Regulator audit — "prove no record under hold was destroyed during the examination window."**

An SEC examiner queries the Audit Trail for all `record_purged` events during the examination period. For each, the examiner reads the `hold_check_result` field from the event data — `empty` confirms the gate passed — and cross-references with `LegalHold.read({record_ref: X, state: Active, placed_at: {before: purged_at}})` to confirm no hold placed before the purge was still Active at purge time. Invariant 1 (hold-blocks-purge) and Invariant 8 (defensible destruction) are the structural guarantees. The examiner consults no source code or runbooks; every claim is verified from the records.

**Disputed destruction — GDPR erasure request collides with Legal Hold.**

A data subject's representative challenges the system's deferral of their Article 17 erasure request: *"was there really a hold on this record?"* The system presents `LegalHold.read({record_ref: R})` — returning the Active hold with `placed_by`, `hold_reason`, `placed_at`, and `case_ref`, all immutable by Legal Hold's Invariant 1. The Audit Trail entry for the deferral carries the `hold_id` as the stated reason; `AuditTrail.verify_record(event_id, payload) → verified` confirms the event has not been altered. Legal Hold's Invariant 7 (placement attribution is complete) — `placed_by` and `hold_reason` each contain at least one non-whitespace character — ensures the hold record is not anonymously placed. The challenge cannot be sustained without claiming the entire hold store was fabricated, at which point Tamper Evidence's seal (via Audit Trail) is the structural rebuttal.

**Breach forensics — "was a preservation-deferred record improperly purged?"**

During an incident investigation, the team suspects a held record was purged outside this composition's gate. They query the Audit Trail for `record_purged` events for the suspect `record_ref`. If none exist, the record was not purged via this composition — the team investigates direct Retention Window or storage-layer access (a composition-bypass finding). If a `record_purged` event exists, they read its `hold_check_result` field and verify via `LegalHold.read({record_ref: X})` that the hold store confirmed empty Active holds at purge time. `AuditTrail.verify_record(event_id, payload) → verified` confirms the event's tamper-evident integrity. If the purge was preceded by a `hold_released` event with the same `record_ref`, the full arc is in the Audit Trail: hold placed, hold released, purge executed. The forensic window is bounded by the Audit Trail's seal cadence.

---

## Generation acceptance

A derived implementation of Defensible Retention is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the three constituent stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

These checks require reading the Audit Trail substrate (part of the composition's records) in addition to the Legal Hold and Retention Window stores:

1. **Hold-blocks-purge verification.** For every `record_purged` Audit Trail event, confirm the `hold_check_result` field is `empty` (or `hold_override = true` with appropriate authorization for `advisory` mode deployments). Cross-reference with `LegalHold.read({record_ref: X, placed_at: {before: purged_at}, state: Active})` to confirm no hold placed before the purge was still Active at purge time. Invariant 1 is the contract; this check verifies it across the full purge record set. A single `record_purged` event with `hold_check_result` showing non-empty Active holds (under `strict` mode) is a conformance failure.

2. **Hold audit coverage.** For every hold in the Legal Hold store (Active or Released), confirm a corresponding `hold_placed` Audit Trail event exists. For every Released hold, confirm a corresponding `hold_released` Audit Trail event exists. `AuditTrail.verify_record` on each event confirms tamper-evidence. Invariant 3 is the contract.

3. **Retention-decision audit coverage.** For every retention record in the Retention Window store (Retained or Purged), confirm a corresponding `retention_placed` Audit Trail event exists. For every Purged retention, confirm a corresponding `record_purged` Audit Trail event exists with `hold_check_result: empty`. Invariant 4 is the contract.

4. **Forensic completability.** For any `retention_id`, reconstruct the complete governance lifecycle from the records: `retention_placed` event (Audit Trail), associated hold events (Legal Hold store joined via `record_ref`), and — if purged — the `record_purged` event with hold-check confirmation. Invariant 8 is the structural guarantee; this check verifies the reconstruction is complete and consistent.

5. **Constituent Generation acceptance bars.** Verify each constituent's own Generation acceptance bar over its respective store instance: Legal Hold's six checks, Retention Window's five checks, Audit Trail's six checks. The composition's invariants depend on the correctness of the constituents' invariants.

### Externally-clearable checks

These audit questions arise around this composition but cannot be answered from the composition's records alone:

- **Whether the retention policy was correctly chosen.** The composition records the `policy_ref` applied at `place_record_under_retention` time. It does not verify that the declared policy is the *correct* policy for the record type under the deployment's regulatory obligations. Verification requires the deployment's Policy Registry or the applicable regulation. This parallels Retention Window's own named out-of-scope on policy registry management and Multi-Party Approval's named out-of-scope on approver-set policy verification.
- **Whether the hold authority was properly granted.** The composition records `placed_by` and verifies the identity via Audit Trail's Actor Identity attestation. It does not verify that `placed_by` was authorized under the deployment's organizational policy to place holds. Verification requires a Permissions instance scoped to hold-placement authority — a composing pattern, not a constituent of this composition.
- **Whether `advisory` mode override purges were properly authorized.** Under `advisory` mode, `record_purged` events with `hold_override = true` are records of overrides. Verification that each override was properly authorized by a competent authority (e.g., a court order) requires external authorization documentation; the composition records the fact of the override, not its external authorization.

---

## Edge cases and explicit non-goals

- **Multi-jurisdiction policy reconciliation.** When HIPAA, state law, SOX, and GDPR all apply to one record, selecting the governing retention policy is a Policy Reconciliation composing pattern concern. This composition takes the reconciled `policy_ref` as input; it does not adjudicate competing obligations.

- **Mass purge under hold release.** When a Legal Hold covering hundreds of records is released, those records enter the purge-ready list on the next `purge_eligible()` run; they do not automatically purge. The caller's records-management system iterates and calls `purge_record` for each. Atomic batch purge — all records in a scope purged or none — requires a transaction wrapper in the composing layer.

- **Concurrent hold placement and purge.** A race condition where a hold is placed after `purge_record` performs the hold check (step 3) but before `RetentionWindow.purge` executes (step 4) can result in a record being purged while a hold exists — a structural violation of Invariant 1. Implementations must serialize the hold-check-and-purge sequence on a given `record_ref`. Serialization mechanisms (advisory locking, row-level locking, optimistic concurrency with re-validation) are implementation-owned. Deployments under FRCP Rule 37(e) exposure should treat this as a hard serialization requirement.

- **Hold placed after record is purged.** A hold placed on a `record_ref` whose retention record is already in Purged state is accepted by Legal Hold (the atom does not validate `record_ref` against the retention store) and by this composition's `place_hold` action (which also does not validate). The hold record faithfully documents that a preservation obligation was recognized after destruction. Legal counsel and the court assess the consequences; Invariant 6 states explicitly that the post-purge hold does not alter the purge record.

- **Cross-store consistency under failure.** `place_record_under_retention` writes Retention Window first, then Audit Trail. `place_hold` and `release_hold` write Legal Hold first, then Audit Trail. A failure between the two writes leaves partial state. The composition returns `recording-failure`; the implementation must retry the failed Audit Trail call and resolve any orphan state. Unresolved orphan hold-events (a hold in Legal Hold without a corresponding Audit Trail entry) are compliance findings that must alert the compliance dashboard — an un-audited hold placement or release undermines the chain of accountability Invariant 3 requires.

- **Partial recording on step failure.** If `LegalHold.place` succeeds but `AuditTrail.record_action` fails, an Active hold exists without a Audit Trail entry — a violation of Invariant 3. The implementation must flag the orphan, return `rejected(recording-failure)`, and resolve the orphan through a compensating Audit Trail entry once the substrate recovers. This mirrors Audit Trail's own *partial attestation on step failure* edge case, which this composition inherits rather than re-derives.

- **Clock semantics.** `now` in `purge_eligible()` and `purge_record` comes from the application's implicit clock. Clock skew under distributed deployment can cause non-deterministic `purge_eligible` results. For deployments where retention deadlines have legal force, compose with a Trusted Timestamping pattern (referenced in Audit Trail). The hold check in `purge_record` step 3 is not clock-sensitive — Active holds are determined by the hold store's current state, not by timestamp comparison.

- **Access control on hold placement, release, and purge.** Who may place holds, who may release them, and who may purge records is not defined by this composition. A Permissions composing pattern governs these. The action wiring includes `actor_ref` and `credential` parameters at every action boundary; the deployment wires Permissions checks per its organizational policy.

- **Cryptographic shredding.** For records that cannot be directly deleted (append-only logs, distributed replicas, immutable storage), `purge_record` delegates to `RetentionWindow.purge`, which delegates to the storage layer's destruction mechanism. Cryptographic shredding is a composing pattern for those storage scenarios; this composition treats both mechanisms as the same state transition.

- **GDPR Article 17 adjudication.** The composition records the state of holds and retention windows at the time of an erasure request (as shown in the GDPR collision example). It does not adjudicate whether the legal-claims exception under Article 17(3)(e) applies, whether HIPAA retention overrides GDPR erasure for a specific record type, or whether cryptographic shredding satisfies the erasure right. Legal counsel adjudicates. The composition provides the records that inform the decision.

- **Legal hold provenance and authority.** The composition records `placed_by` for each hold and verifies the identity via Audit Trail's Actor Identity attestation. It does not verify that `placed_by` had legal authority to issue the hold — that the actor is counsel or a designated compliance officer, that the hold was authorized by a chain of command, that the `case_ref` references a real legal matter. These are organizational governance questions that a Permissions composing pattern addresses. The composition records the hold; the organization establishes the authority.

- **Retention records' own retention.** The Retention Window records for business records and the Legal Hold records are themselves subject to retention. The Audit Trail instance is configured with `audit_trail_retention_policy` (which should be ≥ `business_record_retention_policy`). Meta-retention of Legal Hold records and Retention Window records is a deployment concern; the composition does not loop on itself.

---

## Standards references

- **Federal Rules of Civil Procedure Rule 37(e)** — preservation duty for electronically stored information. A party that fails to preserve ESI when a hold should have been in place is subject to sanctions including adverse inference. Invariant 1 (hold-blocks-purge) and Invariant 8 (defensible destruction) are the structural forms of the reasonable-steps-to-preserve obligation; the Audit Trail is the evidence.
- **Sarbanes-Oxley §802 (18 U.S.C. §1519)** — criminal obstruction of justice for destruction of records subject to federal investigation. The hold-blocks-purge gate is the structural defense; the Audit Trail purge record with `hold_check_result: empty` is the evidence that destruction was not obstruction.
- **Sarbanes-Oxley §404** — internal controls over financial reporting, including record retention and destruction controls. The composition is the structural form of those controls.
- **HIPAA §164.530(j)** — documentation retention requirements; 6-year federal baseline, longer per state law. The composition governs PHI retention and hold-during-investigation lifecycle; the Audit Trail provides the attribution trail required under HIPAA audit controls.
- **SEC Rule 17a-4(f)** — broker-dealer record preservation in non-rewriteable, non-erasable format. The Audit Trail substrate (with Tamper Evidence) satisfies the integrity requirement; the hold-blocks-purge gate satisfies the non-premature-destruction requirement.
- **GDPR Article 17 (Right to erasure)** — the composition answers whether erasure is permissible: Active holds establish the legal-claims exception under Article 17(3)(e); retention obligations establish the legal-obligation basis under Article 17(3)(b). The GDPR collision example demonstrates the structural answer.
- **GDPR Article 5(1)(e) (Storage limitation)** — personal data must not be kept longer than necessary. The composition's `purge_eligible()` surfaces records past their `purge_deadline`; the purge record proves timely destruction.
- **Federal Rules of Civil Procedure Rule 26(b)** — proportionality in discovery preservation. The `hold_reason` and `case_ref` fields in Legal Hold document the proportionality of each hold; the composition preserves the evidentiary record without adjudicating proportionality.
- **ISO 15489-1 (Records management)** — international standard for records-management practice. Section 9.7 (suspension of disposition) maps to the hold-blocks-purge gate; the two-state (Active/Released) hold lifecycle maps to ISO 15489's hold lifecycle.

The three constituent elements carry their own deep standards inheritance — see each constituent's Standards references.

---

## Status

`partially resolved` — foundation round complete (Pass 1 + Pass 2 + Pass 3, author-led). All nine GRID nodes resolved; all concerns conceptually independent; adversarial gaps closed in-pattern or named as explicit out-of-scope. Human refinement (Round 2) and AI-conducted adversarial round (Round 3) pending.

---

## Lineage notes

Regulated composition. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md)), baked in from the first draft. Audit Trail is the primary structural reference for regulated composition shape. Multi-Party Approval is the secondary structural reference for the substrate-handling pattern (using Audit Trail as a substrate composition rather than re-listing its four constituent atoms at this layer) and for the Generation acceptance split between Audit-Trail-traversal-clearable and externally-clearable checks. Conventions cited from the methodology directly, not re-derived from prior compositions.

**Structural milestone.** This composition retires three simultaneous forthcoming-link debts: Legal Hold's Composition notes named Regulated Record Retention & Defensible Deletion (C1) as the composition that wires the purge gate; Retention Window's edge case on *Legal hold* named Legal Hold as the composing pattern that intercepts purge; Audit Trail's edge case *Legal hold suspension of purge* named this composition as the forthcoming resolution. All three are now resolved.

**Pass 1 — Structural completeness (GRID).** Three findings, all closed in-pattern.

- *Application state lacked the `retention_to_record` inverse map.* The initial draft stored `record_to_retentions` only. The hold-check gate in `purge_record` needs to look up `record_ref` from a `retention_id` before querying Legal Hold; without the inverse map, the gate required scanning the full forward map. Fixed: `retention_to_record` added as a paired inverse map, mirroring the `step_to_chain`/`chain_to_steps` pairing in Multi-Party Approval.

- *`purge_eligible()` return type underspecified.* The initial draft returned only a list of eligible `retention_id`s with no indication of hold-blocked records. A compliance dashboard cannot distinguish *records ready for purge* from *records eligible but blocked by active holds* without this distinction. Fixed: return type extended to `(retention_id, record_ref, retention_until, hold_count)` tuples, distinguishing purge-ready from hold-blocked.

- *`place_hold` and `release_hold` credential parameter asymmetry implicit.* Legal Hold's atom-level `place` takes an opaque `placed_by` reference; Audit Trail's `record_action` requires a verifiable `credential`. The composition wires both, taking `credential` at the application boundary and passing it to Audit Trail while passing the opaque `placed_by` to Legal Hold. The asymmetry was implicit in the initial draft. Fixed: the *Note on credential* paragraph in `place_hold` makes the asymmetry explicit, parallel to how Audit Trail's `record_action` handles the actor-credential pairing.

All nine GRID nodes resolved.

**Pass 2 — Conceptual independence (EOS).** Clean. Four extraction candidates evaluated; none warranted.

- *Override-precedence rule as its own atom.* Could "Legal Hold overrides Retention Window" recur enough to be a freestanding atom? Evaluated: the rule has no state of its own — it is a constraint on the interaction of two specific atoms, enforced at the call site between `LegalHold.read` and `RetentionWindow.purge`. It does not recur across other atom pairings in the current library. A stateless rule with no independent lifecycle is not EOS-grade freestanding. Kept in-composition as the *load-bearing wiring decision*. This is the same conclusion Multi-Party Approval's Pass 2 reached for the Quorum evaluation rule.

- *Policy reconciliation.* Multi-jurisdiction policy selection is named as explicit out-of-scope and belongs to a Policy Reconciliation composing pattern. The composition takes the reconciled `policy_ref` as input.

- *Legal hold provenance and authority.* Who authorized the hold — chain of command, matter-type restrictions — is externalized to a Permissions composing pattern and an external case management system. `placed_by` is an opaque reference; the composition records and verifies the identity but does not evaluate organizational authority.

- *Cross-store consistency primitive.* The two-step writes in `place_record_under_retention`, `place_hold`, and `release_hold` require partial-state recovery. Could a "two-phase write" primitive be extracted? Evaluated: this concern recurs across every composition that writes to two stores in sequence (Audit Trail itself, Multi-Party Approval); it is correctly named as a deployment-owned transactional concern in each. No new atom warranted; the edge case is named as in prior compositions.

No concerns extracted. Pass 2 clean.

**Pass 3 — Adversarial scrutiny (Linus mode), foundation posture.** Six findings, all closed in-pattern or named as explicit out-of-scope.

- *Cascade ordering when a hold lands during a purge.* A hold placed between `purge_record` step 3 (hold check) and step 4 (`RetentionWindow.purge`) can produce a purge that violates Invariant 1 — the race window is invisible to the composition's sequential checks. Foundation draft was silent. Fixed: *Concurrent hold placement and purge* edge case added; serialization requirement stated as implementation-owned; FRCP Rule 37(e) deployment posture named as requiring strict serialization.

- *`verify_record` behavior for a held-and-past-retention record.* Audit Trail's `verify_record` returns `verified` for a record in Retained state — regardless of whether a Legal Hold is active. An Active hold affects purge *eligibility*, not the record's integrity or attribution. A record that is past `retention_until` but hold-blocked remains in Retained state (because `purge_record` was correctly rejected); `verify_record` returns `verified`, which is correct. Foundation draft was silent. Fixed: the breach forensics adversarial scenario explicitly exercises this case, confirming the expected behavior.

- *GDPR Article 17 collision must be explicitly answered.* The ROADMAP entry names GDPR Article 17 as a collision case the spec must address. Foundation draft treated it as a non-goal without the structural answer. Fixed: dedicated GDPR collision example (five-domain examples section) and addressed in the adversarial scenarios. The composition does not adjudicate the legal question; it records the state of holds and retention windows at decision time, which is the structural answer the DSAR composition (C7) will build on.

- *`place_hold` credential asymmetry initially hidden.* Legal Hold's atom-level API takes `placed_by` as an opaque reference with no credential; Audit Trail's `record_action` needs a verifiable credential. The foundation draft composed the two without surfacing the asymmetry, leaving an implementer uncertain about where the credential lives. Fixed: the *Note on credential* paragraph in `place_hold` action wiring (also a Pass 1 finding; closed in-pattern for both passes simultaneously).

- *`hold_check_mode = advisory` needed justification.* The advisory mode option appeared in the foundation draft without explaining the motivating scenario. Fixed: Configuration section names the court-ordered-destruction scenario and explicitly states that FRCP Rule 37(e), SEC Rule 17a-4, and SOX deployments must use `strict`.

- *Generation acceptance split not applied.* Foundation draft's Generation acceptance was a flat list mixing Audit-Trail-traversal-clearable checks with externally-clearable questions. Multi-Party Approval's Round 3 established the split as a structural discipline for regulated compositions. Fixed: split adopted with the same section naming convention as Multi-Party Approval.

Three concerns named as explicit out-of-scope rather than fixed in-pattern: clock semantics under distributed deployment (Trusted Timestamping is the resolution), mass purge under hold release (composing-layer iteration concern, not a composition-level structural question), and GDPR Article 17 adjudication (legal counsel's question, not the composition's).

Deferred to Round 2 and Round 3: precise semantics of `advisory` mode Audit Trail records when hold store is non-empty (is `hold_override = true` sufficient for court-admissibility, or are additional fields required?); whether `business_record_retention_policy` should accept a per-call override at `place_record_under_retention` time; and whether the concurrent-hold-and-purge race condition requires a more formal distributed-systems treatment beyond the current serialization-requirement statement.
