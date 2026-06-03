---
title: KYC / Customer Onboarding with Ongoing Monitoring
parent: Compositions
nav_order: 16
has_toc: true
toc: true
---

# KYC (Know Your Customer) / Customer Onboarding with Ongoing Monitoring

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A regulated composition: the full Customer Due Diligence arc for an external party — identity established and verified before regulated activity, the verified state gated as the single precondition any activity system may consume, ongoing monitoring driving re-verification and adverse-trigger suspension, and a post-closure retention floor that survives the relationship's end. The composition wires Party Identity, Retention Window, and the Audit Trail substrate into the structure FATF (Financial Action Task Force — the international AML standard-setter) Recommendations 10–12 and BSA/AML (Bank Secrecy Act / Anti-Money Laundering) 31 CFR (Code of Federal Regulations) §1020.220 require but neither atom names alone. The load-bearing emergent guarantee is verification-gates-activity: a party reaches regulated activity only through an attributed, tamper-evident verification recorded in the Audit Trail, and the gate query is the single surface activity systems consume. Every state-changing action — initiation, verification, monitoring trigger, review clearance, closure — is attribution-stamped and retention-bounded; every adverse monitoring trigger is ordered in the records before any suspension it precipitates; and a closed party's record cannot be purged before the BSA/AML five-year post-closure floor elapses, provable from the composition's records alone.

---

## Intent

Every financial institution that admits an external customer faces the same regulated arc, and the arc is the same whether the institution is a retail bank, a broker-dealer, a payments processor, or a crypto exchange. The customer's identity must be established and verified before regulated activity begins; the verified status must be the precondition any account-opening, transaction, or service-provisioning system checks; the relationship must be monitored on an ongoing basis so that a sanctions match, a politically-exposed-person (PEP — Politically Exposed Person) status change, or adverse media triggers suspension and re-verification; and when the relationship ends, the identity record and its Customer Due Diligence (CDD) evidence must survive for a regulator-mandated period after closure. FATF (Financial Action Task Force — the international standard-setter for anti-money-laundering and counter-terrorist-financing rules) Recommendations 10–12 name the arc as Customer Due Diligence: identify, verify, conduct ongoing monitoring. BSA/AML (Bank Secrecy Act / Anti-Money Laundering) 31 CFR §1020.220 fixes the record-retention floor at five years after the business relationship ends. The domain varies; the structural obligation is constant.

Neither Party Identity nor Retention Window, alone, enforces this arc. Party Identity owns the verification lifecycle — Unverified, Verified, Suspended, Closed — and the structural guarantee that a party cannot reach Verified without a recorded `passed` verification after the most recent suspension (Party Identity Invariant 4). But Party Identity exposes no gate: it records that a party is Verified, but it does not enforce that activity systems consult that state, and it does not know what "regulated activity" means. Retention Window owns the record-lifetime clock, but it has no knowledge of when a relationship begins or ends; it takes a `policy_ref` and a `record_ref` and enforces a no-early-purge guarantee, nothing more. The Audit Trail substrate records attributed, tamper-evident, retention-bounded events, but it does not know which events constitute a verification chain or a monitoring history. The structure that makes the three coherent as a single KYC surface — the gate that centralizes the verification precondition, the monitoring schedule that drives re-verification, the two distinct retention placements that bracket the relationship — belongs to no single constituent. It belongs to the composition, and this composition is that structure.

This is a composition, not a new primitive. Party Identity, Retention Window, and Audit Trail are unchanged; the composition is the wiring that makes them coherent as a single Customer Due Diligence surface. It introduces emergent actions — `initiate_kyc`, `clear_review`, `activity_permitted` — that belong to no single constituent and exist only because the three are wired together. The `clear_review` action, in particular, wraps a Party Identity `verify(passed)`, a Party Identity `reinstate`, and two Audit Trail records into one named surface, so that clearing an adverse-trigger investigation is a single auditable act rather than a sequence of leaked atom internals an operator must orchestrate by hand.

What the composition is *not*: it is not the verification workflow (document OCR (Optical Character Recognition), biometric check, sanctions-database query — those produce the `verification_result` Party Identity records); it is not the risk-scoring or enhanced-due-diligence (EDD) engine (whether a party requires EDD versus standard CDD is Party Identity's named composing concern, not this composition's); it is not the consent surface for downstream non-obligatory processing (KYC's processing basis is GDPR (General Data Protection Regulation) Article 6(1)(c) legal obligation, not consent — see Lineage notes Pass 2 finding 2); and it is not the scheduling engine (the composition holds schedule state but an external scheduler fires the monitoring triggers). Each is named explicitly in Edge cases.

---

## Summary

KYC (Know Your Customer) / Customer Onboarding with Ongoing Monitoring is a regulated composition (a spec that wires two or more atoms — freestanding, self-contained pattern specs — together) that solves a problem none of its constituents solves alone: ensuring that an external party (customer, counterparty, beneficial owner) reaches regulated activity only after their identity has been verified through an attributed, tamper-evident process, that the relationship is monitored on an ongoing basis with adverse triggers driving suspension, and that the identity record survives for the regulator-mandated period after the relationship ends. It wires three constituents: Party Identity (the persistent, verifiable identity record with its Unverified → Verified → Suspended → Closed lifecycle), Retention Window (the policy-bounded record lifetime, used in two distinct placements — one at relationship start, one at relationship end), and the Audit Trail substrate (the tamper-evident — designed so unauthorized changes are detectable — regulated-audit substrate that attribution-stamps and seals every state-changing decision).

The composition's defining emergent guarantee (a property that appears only when atoms are combined — no single atom carries it) is verification-gates-activity: a single read-only query, `activity_permitted(party_id)`, returns `permitted` if and only if Party Identity reports the party in `Verified` state. Activity systems consume this query rather than reading Party Identity directly, so the gate is implemented exactly once instead of re-implemented (or skipped) per activity system. The composition is the layer that centralizes both that the `Verified` state was reached through an attributed, tamper-evident verification (recorded in the Audit Trail) and that the gate query is the single surface activity consumes. This is the structural form of the BSA/AML CDD-before-activity obligation.

Beyond the gate, the composition guarantees four further emergent properties. Every `Unverified → Verified` transition produces a tamper-evident Audit Trail event carrying the verification identifiers. Every adverse monitoring trigger produces an Audit Trail event ordered before any suspension it precipitates, so no trigger-driven suspension exists in the records without its precipitating trigger ordered ahead of it. A party reinstated after an adverse trigger has a `passed` verification recorded after the most recent suspend (Party Identity Invariant 4, surfaced at the composition layer with audit coverage). And a closed party's record cannot be purged before its post-closure Retention Window floor (the BSA/AML five-year period under 31 CFR §1020.220) elapses.

This composition is `draft`. Its most common uses are retail and commercial bank customer onboarding under BSA/AML, broker-dealer counterparty onboarding, payments-processor merchant onboarding, and crypto-exchange customer onboarding under the EU 5th Anti-Money Laundering Directive (AMLD5). Any system that must prove, from records alone, that every party with regulated activity was verified before that activity, that adverse triggers were acted on, and that closed-party records were retained for the mandated post-closure period, is a candidate for this composition.

---

## Composes

- **[Party Identity](../atoms/compliance/party-identity.md)** — the primary data-bearing constituent: the persistent, verifiable identity record with the Unverified → Verified → Suspended → Closed lifecycle. The composition calls `enroll` (only on the direct-enrollment path; see Flow), `verify`, `suspend`, `reinstate`, and `close`. The composition maintains exactly one Party Identity instance. Party Identity's structural guarantee that `Verified` requires a `passed` verification after the most recent suspend (Invariant 4) is the foundation the verification-gates-activity decision rests on; the composition adds the gate query and the audit coverage that Party Identity by design does not.
- **[Retention Window](../atoms/compliance/retention-window.md)** — the policy-bounded record lifetime. The composition uses **two distinct retention placements over the same `party_id`**, both against this single Retention Window instance: an *active-relationship* placement at `initiate_kyc` (governing the party/CDD record while the relationship is live) and a *post-closure* placement at `close_party` (the BSA/AML five-year floor under 31 CFR §1020.220). The two are separate Retention Window records with distinct `retention_id`s and distinct policy references; Retention Window's own edge case on *multiple simultaneous retentions for the same record* is the constituent guarantee that makes the two-placement model valid. This Retention Window instance is **distinct from the Retention Window instance inside the Audit Trail substrate**, which governs the audit *events*; the two instances and their policies differ (see Edge cases — *Two Retention Window instances*). C8 calls `place_under_retention` only; `purge` is the host's or a composing Defensible Retention layer's responsibility, so Retention Window's purge-family rejections (`not-retained`, `retention-period-not-elapsed`) do not surface at the C8 boundary.
- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every state-changing action the composition exposes records here as one `record_action` call, producing an Event Log entry, an Actor Identity attestation, a Retention Window record (for the audit event), and a Tamper Evidence seal per the substrate's cadence. The composition maintains exactly one Audit Trail instance configured with the host's regulatory retention policy for audit events. **Actor Identity is reached transitively through Audit Trail** — the composition does not maintain a separate Actor Identity instance; the `actor_ref` and `credential` passed to each composition action flow to `AuditTrail.record_action`, which binds the actor cryptographically via the Actor Identity atom inside the substrate. Event Log, Tamper Evidence, and the audit-event Retention Window are likewise reached transitively.

The Event Log, Actor Identity, Tamper Evidence, and audit-event Retention Window atoms are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms at this layer.

---

## Composition logic

### Application state

The composition owns emergent state that wires the three constituents into one queryable Customer Due Diligence surface. None of this state belongs to a single constituent.

- **`case_to_monitoring`** — map from `kyc_case_id` to `{party_id, opened_at, next_review_due}`. The monitoring schedule entry for an active KYC case. Populated by `initiate_kyc`; `next_review_due` advanced by `record_verification` (on a state-changing pass), `trigger_monitoring_review` (on periodic-review-due), and `clear_review`. The entry persists for the life of the active relationship; it is the composition's record that a party is under continuing monitoring. A `Verified` party with no entry here is a structural finding, not a valid state (Invariant 6). This is the auditor's first query surface for monitoring continuity.
- **`party_to_kyc_case`** — map from `party_id` to `{kyc_case_id, enrollment_path, active}` where `enrollment_path ∈ {direct, c16}` records whether the party was enrolled by this composition (`direct`) or admitted upstream by External Onboarding / C16 (`c16`), and `active` is a boolean cleared by `close_party`. Required so the composition can resolve a `party_id` back to its case for the gate query and the closure path, and so an auditor can join activity records (keyed by `party_id`) to the KYC case. Populated by `initiate_kyc`; `active` set false by `close_party`.
- **`case_to_retentions`** — map from `kyc_case_id` to `{active_relationship_retention_id, post_closure_retention_id?}`. Records the two distinct Retention Window `retention_id`s placed over the party record. `active_relationship_retention_id` is populated by `initiate_kyc`; `post_closure_retention_id` is populated by `close_party`. The presence of both is the records-alone evidence that both retention placements occurred (Invariant 5).
- **`case_to_open_triggers`** — map from `kyc_case_id` to the set of open adverse-trigger records `{trigger_id, trigger_type, trigger_ref, triggered_at}`. An adverse trigger is added by `trigger_monitoring_review` (adverse path) and removed by `clear_review`. A non-empty set means the party is under an unresolved adverse investigation and is in `Suspended` state. `clear_review` requires a matching open trigger; closing the trigger is part of clearing the review.

The Party Identity store (party records, verification events, state-change events), the Retention Window store (retention records), and the Audit Trail substrate's emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) are owned by their respective constituent instances. The composition does not duplicate them; it indexes into them via the maps above.

### Configuration

- **`active_relationship_policy_ref`** — the Retention Window policy reference applied at `initiate_kyc` for the active-relationship retention of the party/CDD record. The deployment sets this to the policy governing how long an active customer's CDD record is held under active retention before the relationship ends. Must resolve in the Retention Window's Policy Registry. Multi-jurisdiction policy reconciliation (selecting the longer of competing obligations) is out of scope; a Policy Reconciliation composing pattern produces the reconciled `policy_ref` this composition consumes.
- **`post_closure_retention_policy_ref`** — the Retention Window policy reference applied at `close_party`. For deployments under BSA/AML this must encode the 31 CFR §1020.220 five-year-after-relationship-end floor; the deployment must not configure a policy whose `duration` is shorter than the applicable post-closure regulatory minimum. Like the active-relationship policy, it must resolve in the Policy Registry and is the deployment's reconciled value.
- **`audit_trail_retention_policy`** — the policy reference passed to the Audit Trail instance at each `record_action` call, governing the lifetime of the *audit events* (distinct from the party-record retentions above). The audit trail of a KYC decision should persist at least as long as the party record it describes, and often longer for litigation defensibility after the party record is purged.
- **`monitoring_interval`** — the duration added to `now` to compute `next_review_due` whenever a verification passes or a periodic review fires. Deployment-configurable; must be a positive duration (e.g., `P1Y` for annual). The minimum interval for a given party tier (standard CDD vs. EDD) is a deployment-policy obligation driven by the risk-tiering framework; C8 enforces that the interval is positive but does not impose a minimum value. Absent a configured value, `initiate_kyc` rejects with `invalid-request`.

- **`adverse_trigger_types`** — the set of `trigger_type` values the deployment treats as *adverse* (driving suspension). The canonical adverse set is `{sanctions-match, pep-status-change, adverse-media}`; the deployment may extend it. Any `trigger_type` not in this set and not equal to `periodic-review-due` is rejected by `trigger_monitoring_review` with `invalid-request`. `periodic-review-due` is always a non-adverse trigger and is not configurable into the adverse set.

### Primitive policies

The composition takes string-typed inputs at its action boundaries; each is validated either at this layer or by a constituent.

- **`party_id`** — opaque, system-generated by Party Identity's `enroll`. When supplied to `initiate_kyc` (the C16 path), it must reference a party known to the Party Identity instance; otherwise `initiate_kyc` rejects with `party-not-known`. The composition does not normalize, case-fold, or trim; `party_id` equality is opaque byte-identity.
- **`kyc_case_id`** — opaque, system-generated by the composition at `initiate_kyc`. Immutable; never reused.
- **`enrollment_fields`** — the Party Identity enrollment tuple (`name`, `date_of_birth`, `document_type`, `document_ref`) plus `enrolling_actor_ref`, supplied only on the direct-enrollment path. Validated by Party Identity's `enroll`; the composition propagates Party Identity's `invalid-request` without imposing additional rules.
- **`actor_ref`, `verifying_actor_ref`, `closing_actor_ref`** — opaque actor identifiers. Each must contain at least one non-whitespace character; empty/whitespace-only is rejected with `invalid-request`. The substrate's Actor Identity binds them cryptographically via the paired `credential`.
- **`credential`** — opaque credential material consumed only by `AuditTrail.record_action` (and, where the substrate verifies before recording, by the Actor Identity inside the substrate). The composition does not inspect it; the substrate surfaces `invalid-credential`, which this composition maps to `invalid-request` at its caller boundary where it surfaces.
- **`method`, `evidence_ref`** — Party Identity verification metadata; each must contain at least one non-whitespace character. Validated by Party Identity's `verify`; the composition propagates the constituent's `invalid-request`.
- **`verification_result`** — must be exactly `passed` or `failed` (Party Identity's rule). `clear_review` always passes `passed`; `record_verification` accepts either.
- **`trigger_type`** — must be `periodic-review-due` or a member of `adverse_trigger_types`; otherwise `invalid-request`.
- **`trigger_ref`** — opaque reference to the external screening result or review record that precipitated the trigger; must contain at least one non-whitespace character.
- **`reason`** — free-form string supplied to `clear_review` (passed to `reinstate`) and `close_party` (passed to `close`); must contain at least one non-whitespace character (Party Identity's rule on `reason`). No length cap beyond Party Identity's 2000-character cap is imposed at this layer.
- **`retention_policy_ref`** — the active-relationship policy reference supplied to `initiate_kyc`. Validated by Retention Window's `place_under_retention`; `invalid-policy` and `policy-not-found` from the constituent are mapped to `invalid-request` at this composition's boundary.

No primitive is case-sensitivity-normalized at the composition layer; deployments wanting normalization wire it at the calling layer before invoking composition actions.

### Action wiring

The composition exposes six actions. Five are state-changing and record in the Audit Trail; the sixth, `activity_permitted`, is a read-only gate query and records nothing (a read-only query produces no state change, so an audit event would be a false positive in the action record). Every constituent rejection is mapped — propagated, renamed, or surfaced as a new code — at the composition's boundary; silent rejection-code drift is a reference-graph finding.

#### `initiate_kyc`

```
initiate_kyc(
  party_id?,
  enrollment_fields?,
  actor_ref,
  credential,
  retention_policy_ref
) →
    kyc_case_id
  | rejected(
      invalid-request
    | party-not-known
    | enrollment-failed(reason)
    | recording-failure
    )
```

Opens a KYC case for a party. The `party_id` argument is **optional**, and the two branches are explicit:

- **Direct-enrollment branch (`party_id` absent).** The composition enrolls the party itself.
- **C16-admitted branch (`party_id` present).** External Onboarding (C16) has already admitted the party in `Unverified` state; the composition skips enrollment and proceeds straight to retention placement and monitoring-schedule opening.

Both branches converge on the same downstream verification workflow (`record_verification`).

Steps:

1. Validate `actor_ref`, `credential`, and `retention_policy_ref` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
2. Resolve the party:
   - **If `party_id` is absent:** require `enrollment_fields` present; if absent → `rejected(invalid-request)`. Call `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id` (or, on `rejected(invalid-request | storage-failure)`, surface as `rejected(enrollment-failed(<constituent-reason>))` and stop — no case is opened, no retention placed). Set `enrollment_path = direct`.
   - **If `party_id` is present:** confirm it references a known party via the Party Identity instance; if not → `rejected(party-not-known)`. Stop. (`enrollment_fields`, if supplied on this branch, are ignored — the party already exists and Party Identity enrollment fields are immutable.) Set `enrollment_path = c16`.
3. Generate `kyc_case_id` (opaque, fresh).
4. Place the party record under **active-relationship retention**: `Retention Window.place_under_retention(record_ref=party_id, policy_ref=active_relationship_policy_ref)` → `active_relationship_retention_id` (or map `invalid-policy`/`policy-not-found`/`invalid-request` to `rejected(invalid-request)` and `storage-failure` to `rejected(recording-failure)`; stop on either — if the party was enrolled in step 2's direct branch, the enrolled Party Identity record persists as an `Unverified` party with no KYC case, surfaced per the *Cross-store consistency under partial failure* edge case).
5. Open the monitoring-schedule entry: `case_to_monitoring[kyc_case_id] = {party_id, opened_at = now, next_review_due = now + monitoring_interval}`. Record `party_to_kyc_case[party_id] = {kyc_case_id, enrollment_path, active = true}` and `case_to_retentions[kyc_case_id] = {active_relationship_retention_id, post_closure_retention_id = null}`.
6. Record: `AuditTrail.record_action(action_ref=kyc.initiated, actor_ref, credential, data={kyc_case_id, party_id, enrollment_path, active_relationship_retention_id}, retention_policy=audit_trail_retention_policy)` → `event_id`. If this call fails after steps 2 and 4 succeeded → `rejected(recording-failure)`; the implementation surfaces the orphan (enrolled-and-retained party with no audit record of initiation) per the *Cross-store consistency under partial failure* edge case.
7. Return `kyc_case_id`.

#### `record_verification`

```
record_verification(
  kyc_case_id,
  verifying_actor_ref,
  method,
  verification_result,
  evidence_ref,
  credential
) →
    verified
  | rejected(
      not-known
    | invalid-request
    | already-closed
    | recording-failure
    )
```

Records a verification result against the case's party. This is the action that drives the `Unverified → Verified` transition (when `verification_result = passed` against an `Unverified` party) and that records periodic re-verifications.

Steps:

1. Look up `kyc_case_id` in `case_to_monitoring`. If not present → `rejected(not-known)`. Stop. Resolve `party_id` from the entry.
2. Validate `verifying_actor_ref`, `method`, `evidence_ref`, `credential`, and `verification_result` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
3. Call `Party Identity.verify(party_id, verifying_actor_ref, method, verification_result, evidence_ref)` → `{verification_id, state_change_id?}` (or map: `already-closed` → `rejected(already-closed)`; `not-known` → `rejected(not-known)` — this would indicate the case's `party_id` is unknown to Party Identity, an internal-consistency anomaly; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.). `state_change_id` is present iff this call drove an `Unverified → Verified` transition.
4. Record: `AuditTrail.record_action(action_ref=kyc.verification-recorded, actor_ref=verifying_actor_ref, credential, data={kyc_case_id, party_id, verification_id, state_change_id, result=verification_result}, retention_policy=audit_trail_retention_policy)` → `event_id`. If this call fails after step 3 succeeded → `rejected(recording-failure)`; the verification exists in Party Identity but is unattested. This is the composition's most consequential atomicity gap; recovery is named in the *Cross-store consistency under partial failure* edge case.
5. If `verification_result = passed` **and** `state_change_id` is present (the `Unverified → Verified` transition occurred): advance `next_review_due` in `case_to_monitoring[kyc_case_id]` to `now + monitoring_interval`. (A re-verification of an already-Verified party — `state_change_id` absent — does not advance the schedule by this path; periodic-review handling is `trigger_monitoring_review`'s concern.)
6. Return `verified`.

#### `trigger_monitoring_review`

```
trigger_monitoring_review(
  kyc_case_id,
  trigger_type,
  trigger_ref,
  actor_ref,
  credential
) →
    recorded
  | rejected(
      not-known
    | invalid-request
    | not-verified(state)
    | recording-failure
    )
```

The entry point an external monitoring scheduler or screening system calls. **Audit-first discipline: the trigger is recorded before any resulting state transition.** This is the structural guarantee behind Invariant 3 — no trigger-driven suspension exists in the records without its precipitating trigger ordered ahead of it.

Steps:

1. Look up `kyc_case_id` in `case_to_monitoring`. If not present → `rejected(not-known)`. Stop. Resolve `party_id`.
2. Validate `actor_ref`, `credential`, `trigger_ref` per Primitive policies. Validate `trigger_type`: it must be `periodic-review-due` or a member of `adverse_trigger_types`; otherwise → `rejected(invalid-request)`. Stop on any.
3. **Record the trigger first:** `AuditTrail.record_action(action_ref=kyc.monitoring-triggered, actor_ref, credential, data={kyc_case_id, party_id, trigger_type, trigger_ref, triggered_at = now}, retention_policy=audit_trail_retention_policy)` → `trigger_event_id`. If this fails → `rejected(recording-failure)` and **no state transition is attempted** (the record-first ordering guarantees that no suspension occurs without its trigger event landing). Stop.
4. Branch on `trigger_type`:
   - **Adverse** (`trigger_type ∈ adverse_trigger_types`): call `Party Identity.suspend(party_id, suspending_actor_ref=actor_ref, reason="monitoring-trigger:" + trigger_type + ":" + trigger_ref)`. Map rejections: `not-verifiable` (party is `Unverified` — never reached Verified, nothing to suspend) → `rejected(not-verified(Unverified))`; `already-suspended` (a concurrent or prior adverse trigger already suspended the party) → treat as success-for-idempotency: skip the suspend, proceed to add the trigger to the open set, and record the second audit event noting the party was already suspended (see step 5); `already-closed` → `rejected(not-verified(Closed))`; `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`.
   - **Periodic** (`trigger_type = periodic-review-due`): no state transition. Advance `next_review_due` in `case_to_monitoring[kyc_case_id]` to `now + monitoring_interval`. Proceed to return (the `kyc.monitoring-triggered` event recorded in step 3 is the complete record for a periodic review). Return `recorded`.
5. **Adverse path only** — after a successful `suspend` (or the already-suspended idempotent case): record the suspension: `AuditTrail.record_action(action_ref=kyc.party-suspended, actor_ref, credential, data={kyc_case_id, party_id, trigger_type, trigger_ref, state_change_id (from suspend, or "already-suspended"), suspended_at = now}, retention_policy=audit_trail_retention_policy)`. If this fails → `rejected(recording-failure)`; the party is Suspended but the suspension is unattested (the precipitating `kyc.monitoring-triggered` event from step 3 already landed, so the suspension is not *uncaused* in the records, but it is *unrecorded as a suspension* — surfaced per the *Cross-store consistency under partial failure* edge case).
6. Add the trigger to the open set: `case_to_open_triggers[kyc_case_id] ∪= {trigger_id (fresh), trigger_type, trigger_ref, triggered_at}`.
7. Return `recorded`.

#### `clear_review`

```
clear_review(
  kyc_case_id,
  verifying_actor_ref,
  method,
  evidence_ref,
  actor_ref,
  credential,
  reason
) →
    cleared
  | rejected(
      not-known
    | no-open-trigger
    | invalid-request
    | verification-failed
    | recording-failure
    )
```

The single emergent action that clears an adverse-trigger investigation and returns the party to `Verified`. It wraps `Party Identity.verify(passed)` + `Party Identity.reinstate` + two Audit Trail records into one named surface, so clearing a review is one auditable act rather than a sequence of leaked atom internals. Party Identity Invariant 4 requires a `passed` verification recorded after the most recent suspend before `reinstate` will succeed; this action satisfies that precondition in the same call.

Steps:

1. Look up `kyc_case_id` in `case_to_monitoring`. If not present → `rejected(not-known)`. Stop. Resolve `party_id`.
2. Confirm an open adverse trigger exists: `case_to_open_triggers[kyc_case_id]` is non-empty. If empty → `rejected(no-open-trigger)`. Stop. (Clearing a review with no open trigger is a caller error — there is nothing to clear.)
3. Validate `verifying_actor_ref`, `method`, `evidence_ref`, `actor_ref`, `credential`, `reason` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
4. Record fresh evidence: `Party Identity.verify(party_id, verifying_actor_ref, method, passed, evidence_ref)` → `{verification_id, state_change_id?}`. (Against a `Suspended` party, `verify(passed)` records the event but does not change state, so `state_change_id` is absent — this is expected and correct.) Map rejections: `already-closed` → `rejected(verification-failed)` with the party Closed; `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
5. Record the clearance: `AuditTrail.record_action(action_ref=kyc.review-cleared, actor_ref, credential, data={kyc_case_id, party_id, verification_id, reason, cleared_at = now}, retention_policy=audit_trail_retention_policy)` → `event_id`. If this fails → `rejected(recording-failure)`; the fresh verification exists but the clearance is unattested. Stop (the `reinstate` in step 6 is **not** attempted — clearing without the audit record landing would leave a reinstatement uncaused in the records).
6. Reinstate: `Party Identity.reinstate(party_id, reinstating_actor_ref=actor_ref, reason)` → `state_change_id`. The `passed` verification recorded at step 4 satisfies Party Identity's `no-passed-verification-since-suspend` precondition. Map rejections: `no-passed-verification-since-suspend` → `rejected(verification-failed)` (should not occur given step 4 succeeded, but mapped for completeness — a concurrent suspend between step 4 and step 6 could in principle re-arm it); `not-suspended` → `rejected(verification-failed)` (the party was not Suspended — a concurrent reinstate raced in); `already-closed` → `rejected(verification-failed)`; `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
7. Record the reinstatement: `AuditTrail.record_action(action_ref=kyc.party-reinstated, actor_ref, credential, data={kyc_case_id, party_id, state_change_id, reinstated_at = now}, retention_policy=audit_trail_retention_policy)`. If this fails → `rejected(recording-failure)`; the party is Verified again but the reinstatement is unattested.
8. Close the open trigger(s): clear `case_to_open_triggers[kyc_case_id]` (the clearance resolves the adverse investigation; all open triggers for the case are closed by the single clearance — a deployment requiring per-trigger clearance wires that distinction above the composition layer).
9. Advance `next_review_due` in `case_to_monitoring[kyc_case_id]` to `now + monitoring_interval`.
10. Return `cleared`.

#### `close_party`

```
close_party(
  kyc_case_id,
  closing_actor_ref,
  reason,
  credential
) →
    closed
  | rejected(
      not-known
    | not-active
    | invalid-request
    | recording-failure
    )
```

Closes the relationship and places the **post-closure retention** — the second of the two Retention Window operations, setting the BSA/AML five-year-after-relationship-end floor.

Steps:

1. Look up `kyc_case_id` in `case_to_monitoring` (and `party_to_kyc_case`). If not present → `rejected(not-known)`. Stop. Resolve `party_id`.
2. Confirm the case is active: `party_to_kyc_case[party_id].active = true`. If already closed → `rejected(not-active)`. Stop.
3. Validate `closing_actor_ref`, `reason`, `credential` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
4. Close the party: `Party Identity.close(party_id, closing_actor_ref, reason)` → `state_change_id`. Map rejections: `already-closed` → `rejected(not-active)` (the party is already Closed — consistent with step 2 but possible under a concurrent close); `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
5. Place **post-closure retention**: `Retention Window.place_under_retention(record_ref=party_id, policy_ref=post_closure_retention_policy_ref)` → `post_closure_retention_id`. This is the second Retention Window operation; it establishes the 31 CFR §1020.220 five-year-after-relationship-end floor and is distinct from the active-relationship retention placed at `initiate_kyc`. Map `invalid-policy`/`policy-not-found`/`invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. If this fails after step 4 succeeded, the party is Closed but the post-closure floor is not placed — a high-priority finding surfaced per the *Cross-store consistency under partial failure* edge case (the active-relationship retention from `initiate_kyc` still governs the record, so the record is not unprotected, but the post-closure floor that must outlast it is missing).
6. Record `case_to_retentions[kyc_case_id].post_closure_retention_id = post_closure_retention_id`.
7. Record: `AuditTrail.record_action(action_ref=kyc.party-closed, actor_ref=closing_actor_ref, credential, data={kyc_case_id, party_id, state_change_id, post_closure_retention_id, reason, closed_at = now}, retention_policy=audit_trail_retention_policy)` → `event_id`. If this fails → `rejected(recording-failure)`; surfaced per the partial-failure edge case.
8. Mark the case closed: `party_to_kyc_case[party_id].active = false`. The `case_to_monitoring` entry is retained (it is the record that monitoring was in force during the relationship); monitoring no longer fires for a closed party because the scheduler reads `active`.
9. Return `closed`.

#### `activity_permitted`

```
activity_permitted(party_id) →
    permitted
  | rejected(not-verified(state))
```

The read-only verification-gates-activity query. **No Audit Trail record is produced** — this is a read-only query that changes no state, and recording it would falsely populate the action record with non-actions. Activity systems consume this query as their single gate; they must not read Party Identity state directly (see Edge cases — *Activity systems reading Party Identity directly*).

Steps:

1. Read the party's current state from the Party Identity instance for `party_id`. (If `party_id` is unknown to Party Identity, the read returns no state; the gate returns `rejected(not-verified(not-known))` — an unknown party is, definitionally, not verified.)
2. If the state is `Verified` → return `permitted`.
3. Otherwise → return `rejected(not-verified(state))`, naming the actual state: `Unverified`, `Suspended`, `Closed`, or `not-known`. The named state lets the calling activity system distinguish *not yet verified* (retry after verification) from *suspended* (under investigation) from *closed* (relationship ended) from *unknown* (bad reference).

### The load-bearing wiring decision — verification-gates-activity

The composition's structural reason to exist: **a party reaches regulated activity only through the `Verified` state, that state is reached only through an attributed and tamper-evident verification, and the gate query `activity_permitted` is the single surface every activity system consumes.**

*Principle.* BSA/AML and FATF Recommendations 10–12 require that Customer Due Diligence be completed before a business relationship's regulated activity begins. Structurally, that means: no account opening, no transaction, no service provisioning may proceed for a party who is not in a substantiated `Verified` state, and the system must be able to prove — from the records alone — both that the party was verified and that no activity preceded the verification.

*Likely objection.* Party Identity already owns the `Verified` state and already guarantees (Invariant 4) that `Verified` is not reachable without a `passed` verification after the most recent suspend. Why not have each activity system simply read Party Identity's state directly? The atom already enforces the substance of the gate.

*Mechanism that resolves it.* Party Identity owns the `Verified` state but exposes no gate — it records the state but does not enforce that activity systems consult it, and it does not know what "regulated activity" means (it is a freestanding atom; importing the notion of an activity system would break its freestanding status). The Audit Trail substrate records attributed, tamper-evident events but does not know which events constitute a verification chain. Neither can, alone, guarantee the two halves of the obligation. The composition is the layer that wires them: it ensures that every `Unverified → Verified` transition flows through `record_verification`, which records a `kyc.verification-recorded` Audit Trail event carrying both the `verification_id` and the `state_change_id` (so the verification is attributed and tamper-evident, Invariant 2); and it exposes `activity_permitted` as the *single* gate query, so the precondition is implemented exactly once at the composition boundary rather than re-implemented — or quietly skipped — in each activity system. If activity systems read Party Identity directly, the gate is re-implemented per system, and the first system that forgets the check (or reads a stale state) breaks the structural guarantee silently. Centralizing the gate at the composition is what makes the BSA/AML before-activity guarantee structural rather than conventional.

*Result.* The gate is structural and centralized. An auditor can verify, from the records alone, that for every party with regulated activity a `kyc.verification-recorded` event with a `state_change_id` predates the activity (Generation acceptance check 1), and that no activity system held its own copy of the gate logic to drift from. The single-surface discipline is the records-alone-defensible signal: the verification precondition lives in one place, is exercised through one query, and produces one tamper-evident event class the auditor reads.

---

## Composition-level invariants

These invariants emerge from the composition. None belongs to a single constituent; each requires two or more working together to hold.

- **Invariant 1 — Verification gates activity.** `activity_permitted(party_id)` returns `permitted` if and only if Party Identity reports the party in `Verified` state. No C8 surface advances a party to regulated activity from any other state, and no C8 surface other than `activity_permitted` is the gate an activity system consumes. *Defended in-line:* `activity_permitted` step 2 returns `permitted` only on `Verified`; every other state returns `rejected(not-verified(state))`. The one structural obligation pushed to deployment: activity systems must call `activity_permitted` rather than reading Party Identity directly (named in Edge cases — *Activity systems reading Party Identity directly*); a system that bypasses the gate is a composition-bypass finding, not a valid path.

- **Invariant 2 — Verification audit coverage.** Every `Unverified → Verified` transition driven through C8 (i.e., through `record_verification` with `verification_result = passed` against an `Unverified` party) produces a `kyc.verification-recorded` Audit Trail event carrying the `verification_id` and the `state_change_id`, tamper-evident via the substrate seal. *Rests on:* Party Identity's return of `state_change_id` on the transition (Party Identity Behavior), `record_verification` step 4, and Audit Trail's attribution and seal coverage (Audit Trail Invariants 1 and 3).

- **Invariant 3 — Adverse trigger precedes state transition.** Every adverse monitoring trigger produces a `kyc.monitoring-triggered` Audit Trail event before any resulting `suspend` transition; no suspension driven by a trigger exists in the records without its precipitating `kyc.monitoring-triggered` event ordered before it in the log. *Defended in-line:* `trigger_monitoring_review` records the trigger (step 3) before attempting `suspend` (step 4) and recording `kyc.party-suspended` (step 5); a step-3 recording failure aborts before any state transition. The Event Log's total order (reached transitively through Audit Trail) is what makes "ordered before" a records-alone fact.

- **Invariant 4 — Reinstatement reflects fresh evidence.** A party reinstated after an adverse trigger has a `passed` verification recorded after the most recent `suspend`, with a corresponding `kyc.review-cleared` Audit Trail event carrying the `verification_id`. *Rests on:* Party Identity Invariant 4 (the atom rejects `reinstate` without a `passed` verification since the most recent suspend) plus `clear_review`'s ordering (step 4 records the fresh `passed` verification before step 6 reinstates, and step 5 records the clearance carrying the `verification_id`). The composition cannot reinstate without fresh recorded evidence because the constituent forbids it and the composition records it.

- **Invariant 5 — Post-closure retention floor.** A `Closed` party record cannot be purged before its post-closure Retention Window record's `retention_until` elapses. *Rests on:* Party Identity Invariant 1 (party records are never deleted by the atom outright) plus Retention Window Invariant 7 (no early purge — purge before `retention_until` is rejected). The post-closure retention placed at `close_party` step 5 governs when archive/scrub becomes permitted; `case_to_retentions[kyc_case_id].post_closure_retention_id` is the records-alone evidence that the placement occurred.

- **Invariant 6 — Monitoring continuity for active parties.** Every party in `Verified` state governed by C8 with an active case has an open `case_to_monitoring` entry. A `Verified`, active party with no `case_to_monitoring` entry is a structural finding, not a valid state. *Rests on:* `initiate_kyc` populating `case_to_monitoring` for every case it opens, and no C8 action removing the entry while the case is active (`close_party` marks the case inactive but retains the entry as the record that monitoring was in force).

Verification-gates-activity (Invariant 1) plus verification audit coverage (Invariant 2) together give the *substantiated-access* property — every party that can reach activity was verified through an attributed, tamper-evident process. Adverse-trigger ordering (Invariant 3) plus reinstatement-reflects-fresh-evidence (Invariant 4) give the *defensible-monitoring* property — every suspension is caused-in-the-records and every reinstatement is evidenced-in-the-records. Post-closure retention floor (Invariant 5) plus monitoring continuity (Invariant 6) close the relationship lifecycle: the record survives its mandated post-closure period and was monitored throughout its active life.

---

## Examples

### Walkthrough — retail bank customer onboarding under BSA/AML (direct-enrollment path)

A bank uses C8 to onboard a retail customer who has no prior system identity. Configuration: `active_relationship_policy_ref = bsa_active_cdd`, `post_closure_retention_policy_ref = bsa_5yr_post_closure` (31 CFR §1020.220 five-year floor), `audit_trail_retention_policy = bsa_audit_9yr`, `adverse_trigger_types = {sanctions-match, pep-status-change, adverse-media}`.

1. **Initiate (direct path).** `initiate_kyc(party_id=absent, enrollment_fields={name:"Amara Osei", date_of_birth:"1981-03-14", document_type:"passport", document_ref:"doc_p901", enrolling_actor_ref:"officer_r3"}, actor_ref="officer_r3", credential=<officer_r3>, retention_policy_ref="bsa_active_cdd") → kyc_case_id = case_5501`. Internally: `Party Identity.enroll` → `party_9017` in `Unverified`; `Retention Window.place_under_retention(party_9017, bsa_active_cdd)` → `ret_active_9017`; `case_to_monitoring[case_5501] = {party_9017, opened_at, next_review_due}`; Audit Trail records `kyc.initiated` with `enrollment_path = direct`.

2. **Gate check before verification.** An account-opening system calls `activity_permitted(party_9017) → rejected(not-verified(Unverified))`. The account is not opened. The gate fired correctly — the party is not yet verified.

3. **Verification.** The KYC workflow runs automated OCR on the passport and calls `record_verification(case_5501, verifying_actor_ref="system_kyc_auto", method="automated-ocr", verification_result="passed", evidence_ref="evidence_ocr_442", credential=<system_kyc_auto>) → verified`. Internally: `Party Identity.verify(party_9017, ..., passed, ...)` → `{verification_id: verif_1101, state_change_id: sc_4401}` (the `Unverified → Verified` transition); Audit Trail records `kyc.verification-recorded` carrying `verif_1101` and `sc_4401`; `next_review_due` advances.

4. **Gate check after verification.** `activity_permitted(party_9017) → permitted`. The account-opening system proceeds; `account_a883` is opened and linked to `party_9017`. Invariant 1 fired; Invariant 2's audit event is in the records.

5. **Periodic review.** A year later the external scheduler fires `trigger_monitoring_review(case_5501, trigger_type="periodic-review-due", trigger_ref="annual-review-2027", actor_ref="system_monitor", credential=<system_monitor>) → recorded`. Internally: Audit Trail records `kyc.monitoring-triggered`; no state transition; `next_review_due` advances.

6. **Closure.** Ten years later: `close_party(case_5501, closing_actor_ref="officer_r3", reason="account-closed-customer-request", credential=<officer_r3>) → closed`. Internally: `Party Identity.close(party_9017, ...)` → `Closed`; `Retention Window.place_under_retention(party_9017, bsa_5yr_post_closure)` → `ret_postclose_9017` (the second retention placement — the five-year floor); Audit Trail records `kyc.party-closed` carrying `ret_postclose_9017`; `party_to_kyc_case[party_9017].active = false`.

7. **Gate check after closure.** `activity_permitted(party_9017) → rejected(not-verified(Closed))`. No new activity proceeds for the closed party.

### C16-admitted path — External Onboarding upstream

A broker-dealer admits a counterparty through External Onboarding (C16), which enrolls the party in `Unverified` state and registers a credential. C8 then runs the verification gate downstream:

1. `initiate_kyc(party_id="party_4421", enrollment_fields=absent, actor_ref="onboard_svc", credential=<onboard_svc>, retention_policy_ref="bsa_active_cdd") → kyc_case_id = case_6602`. The `party_id` is present, so C8 skips enrollment: it confirms `party_4421` is known to Party Identity, places the active-relationship retention, opens the monitoring schedule, and records `kyc.initiated` with `enrollment_path = c16`. The verification workflow then proceeds identically to the direct path via `record_verification`.

### Adverse trigger and clearance — sanctions match

An existing `Verified` party, `party_7732` (case `case_7700`), triggers a sanctions screening alert:

1. **Adverse trigger.** `trigger_monitoring_review(case_7700, trigger_type="sanctions-match", trigger_ref="ofac-sdn-12894", actor_ref="compliance_mgr_01", credential=<compliance_mgr_01>) → recorded`. Internally: Audit Trail records `kyc.monitoring-triggered` **first** (step 3); then `Party Identity.suspend(party_7732, ...)` → `Suspended` with `state_change_id = sc_7701`; then Audit Trail records `kyc.party-suspended` carrying `sc_7701`; the trigger is added to `case_to_open_triggers[case_7700]`. Invariant 3 holds: the trigger event is ordered before the suspension event.

2. **Gate check during investigation.** `activity_permitted(party_7732) → rejected(not-verified(Suspended))`. Downstream transaction systems freeze new activity.

3. **Clearance.** Investigation confirms the match was a false positive. `clear_review(case_7700, verifying_actor_ref="compliance_analyst_02", method="database-check", evidence_ref="evidence_db_clearance_882", actor_ref="compliance_mgr_01", credential=<compliance_mgr_01>, reason="ofac-match-resolved-different-individual") → cleared`. Internally: `Party Identity.verify(party_7732, ..., passed, evidence_db_clearance_882)` → `{verif_3901, state_change_id absent}` (verify against a Suspended party records the event but does not change state); Audit Trail records `kyc.review-cleared` carrying `verif_3901`; `Party Identity.reinstate(party_7732, ..., reason)` → `sc_7702` (the fresh `passed` verification satisfies Party Identity's precondition); Audit Trail records `kyc.party-reinstated` carrying `sc_7702`; the open trigger is cleared from `case_to_open_triggers`; `next_review_due` advances. Invariant 4 holds: the reinstatement has a `passed` verification recorded after the most recent suspend, with the `kyc.review-cleared` event carrying its `verification_id`.

4. **Gate check after clearance.** `activity_permitted(party_7732) → permitted`. Transaction systems resume.

### Rejection path — clearing a review with no open trigger

A compliance officer mistakenly calls `clear_review(case_5501, ...)` for a party with no open adverse trigger: `clear_review` step 2 finds `case_to_open_triggers[case_5501]` empty → `rejected(no-open-trigger)`. No verification is recorded, no reinstatement is attempted; there was nothing to clear.

### Rejection path — periodic trigger against an unknown case

The scheduler fires a trigger against a case that does not exist: `trigger_monitoring_review("case_bogus", ...) → rejected(not-known)` at step 1. No audit event is recorded — the case is unknown, so there is no party to attribute a trigger to.

### Regulated adversarial scenarios

**Regulator audit — "show me every active customer was verified before regulated activity."** A FATF/BSA examiner queries the Audit Trail and the activity records. For every party with an activity record (e.g., an opened account linked to `party_id`), the examiner confirms a `kyc.verification-recorded` Audit Trail event with a `state_change_id` (the `Unverified → Verified` transition) exists, that `AuditTrail.verify_record` returns `verified` for it, and that its event timestamp predates the first activity record. Invariant 1 (verification gates activity) is the structural guarantee that no activity path other than `activity_permitted → permitted` exists; Invariant 2 (verification audit coverage) is the guarantee that the verifying transition is in the records, attributed and tamper-evident. The examiner consults no source code or runbooks; every party's verification chain is reconstructable from the records. A party with an activity record but no predating `kyc.verification-recorded` event with a `state_change_id` is a conformance failure.

**Disputed onboarding — party claims they were never properly verified.** A party's counsel challenges the bank's claim that their identity was verified before their account was opened. The investigator retrieves the `kyc.verification-recorded` events for the party's `kyc_case_id`; each carries `verification_id`, `result`, and (for the transition) `state_change_id`. The investigator then retrieves the Party Identity verification event for each `verification_id`, which names `verifying_actor_ref`, `method`, `evidence_ref`, and `verified_at`. Party Identity Invariant 5 (verification events immutable) and Invariant 6 (append-only in insertion order) establish that no verification event was altered or back-inserted; the Audit Trail seal (Tamper Evidence, reached transitively) establishes that the `kyc.verification-recorded` event itself was not altered. The `evidence_ref` points to the document record that supported the verification — the dispute is resolved by producing that evidence alongside the immutable, sealed verification chain. Invariant 2 plus Party Identity Invariants 5–6 are the rebuttal.

**Breach or incident forensics — which parties were Verified during the compromise window, and were any verifications altered.** An incident investigator is given a window (e.g., 2027-03-01 through 2027-03-15) and must reconstruct which parties were in `Verified` state during it and whether any verification chain was tampered with. The investigator replays each case's `kyc.verification-recorded`, `kyc.monitoring-triggered`, `kyc.party-suspended`, and `kyc.party-reinstated` events in Event Log insertion order (reached transitively through Audit Trail) to determine each party's state at the window's bounds, then runs `AuditTrail.verify_record` against representative events in each seal's coverage to bound any tampering window. Invariant 3 (adverse trigger precedes state transition) is load-bearing here: the investigator can confirm that every suspension in the window has a precipitating trigger ordered ahead of it; a suspension with no precipitating trigger — or a trigger inserted *after* its suspension — is itself a finding (and the append-only, sealed log forecloses an attacker silently reordering them). Invariant 6 (monitoring continuity) lets the investigator confirm that every `Verified`, active party in the window had an open monitoring entry; a `Verified` party with no monitoring entry during the window is a structural anomaly the investigator flags. Where the window has legal force as wall-time (rather than event-index) bounds, a Trusted Timestamping composition supplies the time-anchor; absent it, the reconstruction is event-index-authoritative.

---

## Generation acceptance

A derived implementation of C8 is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the Party Identity, Retention Window, and Audit Trail substrate stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

These checks are answerable by reading the composition's records (including the Audit Trail substrate):

1. **Verification-before-activity.** For every party with a regulated-activity record, there exists a `kyc.verification-recorded` Audit Trail event carrying a non-absent `state_change_id`, whose event timestamp predates the activity record, and for which `AuditTrail.verify_record` returns `verified`. Invariant 1 and Invariant 2 are the contract. A party with activity but no predating, verified `kyc.verification-recorded` event with a `state_change_id` is a conformance failure.

2. **Every Verified party is substantiated.** For every party currently in `Verified` state, there exists a `passed` verification event in Party Identity recorded after the party's most recent `suspend` (or after `enroll` if never suspended). Party Identity Invariant 4 makes this set structurally non-empty; the composition's `record_verification` and `clear_review` are the only C8 paths that reach `Verified`, and both record the verification. The auditor sees the structural guarantee, not a procedural claim.

3. **Adverse-trigger ordering.** For every `kyc.party-suspended` Audit Trail event caused by a monitoring trigger, there exists a `kyc.monitoring-triggered` event for the same `kyc_case_id` and `trigger_ref` ordered before it in the Event Log. A `kyc.party-suspended` event with no precipitating `kyc.monitoring-triggered` event ordered ahead of it is a conformance failure. Invariant 3 is the contract.

4. **Post-closure retention.** For every party in `Closed` state, the Retention Window store contains a post-closure retention record (the `post_closure_retention_id` in `case_to_retentions`) in `Retained` state, and that record's `retention_until` reflects the post-closure policy's duration. No `Closed` party's record is purged before its post-closure `retention_until` elapses (Retention Window Invariant 7). Invariant 5 is the contract.

5. **Monitoring continuity.** For every party currently in `Verified` state with an active case, there exists an open `case_to_monitoring` entry. Invariant 6 is the contract; a `Verified`, active party with no monitoring entry is a conformance failure.

6. **Constituent Generation acceptance bars.** Verify each constituent's own Generation acceptance bar over its respective store: Party Identity's six checks, Retention Window's five checks, Audit Trail's six checks. The composition's invariants depend on the correctness of the constituents' invariants.

### Externally-clearable checks

These audit questions arise around C8 but cannot be answered from the composition's records alone:

- **Whether the verification method was adequate for the party's risk tier.** The composition records the `method` each verification used; it does not verify that the method was adequate for the party's risk classification (enhanced due diligence versus standard CDD). Risk scoring and EDD orchestration are Party Identity's named composing concern, out of scope here; verification of method-adequacy requires the deployment's risk-tiering policy.
- **Whether the sanctions/PEP screening lookup queried a current list.** The composition records the `trigger_result` (via `trigger_ref`) of a screening, but it cannot prove the external sanctions or PEP list the screening queried was live and current at screening time. That assurance requires the screening provider's own evidence; the composition records the trigger, not the freshness of the list behind it.
- **Whether the actor who recorded a verification was authorized to do so.** The composition records `verifying_actor_ref` and binds it cryptographically via the Audit Trail's Actor Identity attestation. It does not verify that the actor was *authorized under the deployment's organizational policy* to record verifications. That requires a Permissions instance scoped to verification authority — a composing peer, not a constituent of C8.
- **Whether downstream non-obligatory processing had a lawful basis.** C8's processing basis is GDPR Article 6(1)(c) legal obligation; the composition does not record or adjudicate the lawful basis for any *non-obligatory* downstream processing (marketing, profiling, data sharing beyond the KYC obligation). That is the concern of C2 (Consent & Preference Management), a composing peer.

---

## Edge cases and explicit non-goals

- **Cross-store consistency under partial failure.** Several C8 actions write to two or three stores in sequence; a failure between writes leaves partial state, and the consequence differs by action. The most consequential gap is in `record_verification`: step 3 drives a Party Identity state transition, then step 4 writes the Audit Trail event; if step 4 fails, the verification exists in Party Identity but is **unattested** — a `Verified` party with no `kyc.verification-recorded` event, violating Invariant 2. Party Identity's verification events are immutable once committed, so synchronous rollback is not available. The implementation must (a) retry the failed `record_action` until it lands, and (b) immediately surface the orphan (a verification with no corresponding Audit Trail event) to the compliance dashboard as a high-priority finding, with the compensating Audit Trail entry, once it lands, carrying a `cascade_recovery = true` marker so an auditor can distinguish a clean verification from a recovered one. The analogous gaps in `initiate_kyc` (enrolled-and-retained party with no `kyc.initiated`), `trigger_monitoring_review` (Suspended party with no `kyc.party-suspended` — though the precipitating `kyc.monitoring-triggered` already landed, so the suspension is not *uncaused*), `clear_review` (reinstated party with no `kyc.party-reinstated`), and `close_party` (Closed party with no post-closure retention, or with no `kyc.party-closed`) are each handled the same way: retry the failed write, surface the orphan, mark the compensating record. The ordering disciplines built into the actions (record-the-trigger-first in `trigger_monitoring_review`; record-the-clearance-before-reinstate in `clear_review`; audit-before-the-irreversible-step where possible) minimize the window in which a state change exists without its caused-in-the-records audit event. Deployments under BSA/AML exposure must treat any such orphan as a hard alerting condition. This mirrors Defensible Retention's treatment of its `purge_record` atomicity hole.

- **Two Retention Window instances and two placements over one record.** There are two distinct Retention Window concerns, and conflating them is a reference ambiguity. (1) The **party-record Retention Window instance** named in *Composes* holds **two placements** over the same `party_id`: the active-relationship retention placed at `initiate_kyc` (step 4) and the post-closure retention placed at `close_party` (step 5). These are two Retention Window *records* with distinct `retention_id`s under one Retention Window *instance*; Retention Window's edge case on multiple simultaneous retentions for the same `record_ref` is the constituent guarantee that makes this valid, and purge eligibility for the party record is governed by the *longer* of the two (the post-closure floor outlasts the active-relationship retention). (2) The **audit-event Retention Window instance** lives *inside the Audit Trail substrate* and governs the lifetime of the KYC audit *events* (`kyc.initiated`, `kyc.verification-recorded`, etc.), configured via `audit_trail_retention_policy`. The two instances are separate and their policies differ — audit events should persist at least as long as the party record they describe, and often longer.

- **Monitoring scheduler boundary.** C8 holds the schedule *state* (`next_review_due` in `case_to_monitoring`) but is not the scheduling *engine*. An external scheduler reads `next_review_due` (and the case's `active` flag) and calls `trigger_monitoring_review` when a review is due; C8 does not set timers, does not fire on a clock, and does not own the cadence policy. A deployment's scheduling engine is the composing surface that drives periodic reviews; C8 records each trigger and advances the schedule when one fires.

- **Beneficial ownership / ownership graph.** Each beneficial owner of a legal-entity customer is a Party Identity record in their own right, and C8 verifies each independently as its own KYC case. C8 does **not** model the ownership graph — the relationship between a beneficial owner and the entity (ownership percentage, control type) under FinCEN Beneficial Ownership Rule 31 CFR §1010.230. That is the concern of an Ownership Structure / Beneficial Owner composing pattern *(forthcoming)*, which composes multiple Party Identity records into an ownership structure; C8 is one of its constituents, not its replacement.

- **Duplicate Prevention as optional enrichment.** For deployments that need at-most-once semantics on verification jobs under retry (e.g., a screening pipeline that may re-deliver the same verification result), a Duplicate Prevention atom can be wired as an **optional enrichment** in front of `record_verification` or `trigger_monitoring_review` to deduplicate retried jobs. It is **not a constituent** of C8. (This is the Idempotent Reservation demotion recorded in Lineage Pass 2: Party Identity's `verify` is append-only and idempotent-safe at the *state* level — a re-applied `passed` verification against an already-`Verified` party records a redundant event but drives no spurious transition — so C8 does not require provisional-commitment semantics; deployments that additionally want job-level deduplication compose Duplicate Prevention.)

- **Activity systems reading Party Identity directly.** Activity systems (account-opening, transaction, service-provisioning) must call `activity_permitted` and must **not** read Party Identity's state directly. The prohibition is structural, not stylistic: if each activity system reads Party Identity and applies its own `Verified` check, the gate is re-implemented per system, and the first system that forgets the check, reads a stale state, or applies a subtly different state predicate breaks the BSA/AML before-activity guarantee silently and per-system. Centralizing the gate at `activity_permitted` makes the guarantee exist exactly once. A deployment in which an activity system reads Party Identity directly is a composition-bypass finding (Invariant 1's deployment obligation), remediated by routing the system through the gate query.

- **Risk scoring and enhanced due diligence (EDD).** Whether a party requires EDD based on risk factors (country of origin, transaction volume, PEP status) — and the resulting choice of verification method and re-verification cadence — is out of scope for C8. C8 records the verification lifecycle and the monitoring schedule; risk classification and EDD orchestration belong to **[Party Identity](../atoms/compliance/party-identity.md)** as the composing peer (Party Identity names risk scoring and EDD as its own out-of-scope concern). C8 consumes the verification results; it does not decide the rigor required to produce them.

- **The verification workflow itself.** What happens *during* verification — document OCR, biometric check, sanctions-database query, adverse-media search — is not modeled by C8. The composing verification workflow produces the `verification_result`, `method`, and `evidence_ref` that `record_verification` and `clear_review` record. C8 is the lifecycle and gate; the workflow is upstream.

- **Asynchronous verification.** `record_verification` takes `verification_result` at call time; C8 does not model in-progress or pending verification states (the party simply remains `Unverified` until a `passed` result is recorded). The composing workflow owns the coordination of asynchronous determination, exactly as Party Identity's own *Asynchronous verification workflows* edge case names.

- **What "Closed" means for open commitments.** `close_party` closes the party and gates new activity, but does not automatically unwind existing open accounts, positions, or contracts. The composing system owns the policy for unwinding open commitments against a closed party; C8's contract is that `activity_permitted` returns `rejected(not-verified(Closed))` after closure, signaling that no new activity may proceed.

- **Concurrency.** Concurrent state-changing actions for the same `kyc_case_id` / `party_id` (e.g., a `trigger_monitoring_review` adverse path racing a `clear_review`, or two `close_party` calls) resolve under the host environment's serialization guarantees; Party Identity's named edge case on concurrent state transitions governs the constituent layer (the first transition wins, the second observes the updated state and is rejected). C8's rejection mappings (`not-active`, `not-verified(state)`, `verification-failed`) surface the loser's outcome. Deployments must serialize state-changing C8 actions on a given `party_id`.

- **Clock semantics.** `now` in `next_review_due` computation and in audit-event timestamps comes from the application's implicit clock. Where review deadlines or onboarding timestamps have legal force (FATF / BSA/AML require recording when CDD was performed), the implementation must source time from a trustworthy clock; a composed Trusted Timestamping pattern supplies the verifiable time-anchor and binds Event Log insertion order to wall-time. Absent it, insertion order is authoritative and timestamps are advisory.

---

## Standards references

- **FATF Recommendations 10–12** — Customer Due Diligence: identify the customer and verify identity using reliable independent sources (R.10), identify and verify beneficial owners (R.10, with R.10's ongoing-due-diligence limb), and conduct ongoing monitoring of the business relationship (R.10). C8's `initiate_kyc` → `record_verification` → `trigger_monitoring_review` arc is the structural form of CDD's identify–verify–monitor obligation; the verification-gates-activity decision is the before-relationship-activity limb.
- **BSA/AML — 31 CFR §1020.220 (Customer Identification Program)** — minimum identity attributes, verification, and **record retention for five years after the business relationship ends**. C8's `close_party` post-closure retention placement (the second Retention Window operation) is the structural form of the five-year-post-closure floor (Invariant 5).
- **FinCEN Beneficial Ownership Rule — 31 CFR §1010.230** — legal-entity customers must identify and verify beneficial owners owning ≥25% and a single control person. Each beneficial owner is a Party Identity record verified through its own C8 case; the ≥25% relationship graph is the Ownership Structure composing pattern's concern, not C8's.
- **EU 5th Anti-Money Laundering Directive (AMLD5)** — enhanced CDD requirements, beneficial-ownership registries, and ongoing-monitoring obligations; alignment with FATF. C8 is the onboarding-and-monitoring surface AMLD5 deployments build on.
- **GDPR Article 6(1)(c) — legal obligation as processing basis.** KYC processing rests on Article 6(1)(c) (compliance with a legal obligation), **not** Article 6(1)(a) (consent). The distinction is load-bearing: the customer cannot revoke the basis for KYC processing while the AML obligation stands, so Consent is not a C8 constituent (see Lineage Pass 2 finding 2). Consent governs *non-obligatory* downstream processing, which is C2's concern.
- **HIPAA (Health Insurance Portability and Accountability Act) §164.312(a)(1) (Access control)** — in covered healthcare deployments where a verified party identity is the precondition to granting access to protected health information, C8's verification-gates-activity decision is the structural form of the access-granting event: access is provisioned only through a substantiated, audited verification. (C8 is anchored in the BSA/AML/FATF cluster; the HIPAA mapping applies where a covered entity uses verification-based provisioning.)

The three constituents carry their own deep standards inheritance — see each constituent's Standards references.

---

## Status

`draft` — first pass. Composition logic specified across all three constituents (Party Identity + Retention Window + Audit Trail substrate); emergent state (`case_to_monitoring`, `party_to_kyc_case`, `case_to_retentions`, `case_to_open_triggers`) named with population and cleanup discipline; six actions wired (`initiate_kyc` with both enrollment branches, `record_verification`, `trigger_monitoring_review` with audit-first ordering, the emergent `clear_review`, `close_party` with the second retention placement, and the read-only `activity_permitted` gate) with fully-named rejection taxonomies; the load-bearing verification-gates-activity decision defended in four parts; six composition-level invariants stated; walkthrough plus C16-admitted path, adverse-trigger-and-clearance run, and two rejection-path examples; three regulated adversarial scenarios; Generation acceptance split between Audit-Trail-traversal-clearable and externally-clearable checks; eleven edge cases including cross-store consistency, the two-Retention-Window-instances distinction, the scheduler boundary, beneficial ownership, the Duplicate Prevention enrichment demotion, and the activity-systems-must-use-the-gate prohibition. Awaiting the three-pass pressure-testing baseline.

---

## Lineage notes

Regulated composition. The two regulated-overlay conventions — *Regulated adversarial scenarios* and *Generation acceptance* (split per the regulated-composition convention) — are **inherited from the methodology directly** ([`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md)), baked in from the first draft, not re-derived from predecessor patterns. Defensible Retention is the primary structural reference for the substrate-composition shape, the two-distinct-Retention-Window-instances distinction, the cross-store-consistency-under-partial-failure treatment, and the Generation acceptance split. External Onboarding (C16) is the upstream-adjacent reference for the audit-first step discipline and the Party Identity + Audit Trail shape.

**Structural milestone.** This composition retires the `*(forthcoming, C8)*` link in [`atoms/compliance/party-identity.md`](../atoms/compliance/party-identity.md)'s Composition notes — the entry naming "KYC / Customer Onboarding with Ongoing Monitoring" as the primary composition that gates regulated activity on the party being Verified, orchestrates the verification workflow, handles ongoing monitoring via periodic `verify` calls, and composes Actor Identity (transitively, through Audit Trail) for attestation and Retention Window for record lifetime. When this composition grounds, that forthcoming-link is resolved.

The following two findings are recorded against Pass 2 (EOS conceptual independence) of the forthcoming baseline; they are the constituent-set decisions made before drafting and are logged here as the reasoning that shaped the Composes list. They are stated as findings to be confirmed by the baseline Pass 2, not as a completed pass.

**Pass 2 finding 1 — Idempotent Reservation evaluated as a constituent and demoted to optional Duplicate Prevention enrichment.** Idempotent Reservation was considered as a fourth constituent (to give at-most-once semantics on verification jobs under retry). It does not survive EOS Pass 2 as a constituent: there is no finite pool C8 reserves against, and no provisional-commitment semantics in the KYC arc — a verification is recorded, not reserved-then-confirmed. Party Identity's `verify` is append-only and idempotent-safe at the *state* level (a re-applied `passed` verification against an already-`Verified` party records a redundant event but drives no spurious transition), and concurrency is handled by Party Identity's own named edge case. Job-level deduplication, where a deployment needs it, is a *Duplicate Prevention* optional enrichment in front of the recording actions — named in Edge cases — not a constituent. The composition is correct with three constituents.

**Pass 2 finding 2 — Consent evaluated as a constituent and resolved as a composing peer at the deployment layer.** Consent was considered as a constituent (every system that identifies and processes personal data composes Party Identity and Consent). It is resolved as a composing peer, not a C8 constituent: KYC's processing basis is GDPR Article 6(1)(c) legal obligation, not Article 6(1)(a) consent, and the customer cannot revoke the basis for KYC processing while the AML obligation stands. Consent governs *non-obligatory* downstream processing (marketing, profiling, data sharing beyond the KYC obligation), which is **C2 (Consent & Preference Management)**'s concern — named as a composing peer in the externally-clearable Generation acceptance checks and in Composition notes, not folded into C8. Folding Consent in would conflate the legal-obligation basis (which C8 enforces structurally via the verification gate) with the consent basis (which governs a different class of processing C8 does not touch).

---

## Composition notes

These are adjacent compositions, **not** constituents of C8:

- **[External Onboarding](./external-onboarding.md)** — the upstream admission gate (C16). C16 admits a party in `Unverified` state (enroll + credential registration + invitation acceptance, all audited); C8 is the verification gate downstream. A deployment requiring `Verified` status before granting access places C8 downstream of C16: C16's `party_id` flows into C8's `initiate_kyc` on the C16-admitted branch (`enrollment_path = c16`). External Onboarding is the admission gate; C8 is the verification gate.
- **C2 Consent & Preference Management** *(forthcoming)* — governs non-obligatory processing beyond the KYC legal obligation. C8's processing basis is GDPR Article 6(1)(c); C2 governs the Article 6(1)(a) consent basis for downstream processing C8 does not touch. (Pass 2 finding 2.)
- **C7 Data Subject Rights Fulfillment** *(forthcoming)* — handles GDPR data-subject access and erasure requests against party records, adjudicating the tension between an erasure request and C8's post-closure retention floor (the legal-obligation exception under GDPR Article 17(3)(b)). C8 records the retention state at request time; C7 adjudicates.
- **Ownership Structure / Beneficial Owner** *(forthcoming)* — models the ownership graph across Party Identity records under FinCEN 31 CFR §1010.230. Each beneficial owner is verified through its own C8 case; the ≥25% relationship graph is the Ownership Structure pattern's concern. C8 is a constituent of that pattern, not its replacement.
