---
title: Customer Onboarding
parent: Conceptual Compositions
nav_order: 16
has_toc: true
toc: true
---

# Customer Onboarding

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Customer Onboarding is a regulated composition (a spec that wires two or more atoms — freestanding, self-contained pattern specs — together) that solves a problem none of its constituents solves alone: ensuring that an external party (customer, counterparty, beneficial owner) reaches regulated activity only after their identity has been verified through an attributed, tamper-evident process, that the relationship is monitored on an ongoing basis with adverse triggers driving suspension, and that the identity record survives for the regulator-mandated period after the relationship ends. It wires three constituents: Party Identity (the persistent, verifiable identity record with its Unverified → Verified → Suspended → Closed lifecycle), Retention Window (the policy-bounded record lifetime, used in two distinct placements — one at relationship start, one at relationship end), and the Audit Trail substrate (the tamper-evident — designed so unauthorized changes are detectable — regulated-audit substrate that attribution-stamps and seals every state-changing decision).

The composition's defining emergent guarantee (a property that appears only when atoms are combined — no single atom carries it) is verification-gates-activity: a single read-only query, `activity_permitted(party_id)`, returns `permitted` if and only if Party Identity reports the party in `Verified` state. Activity systems consume this query rather than reading Party Identity directly, so the gate is implemented exactly once instead of re-implemented (or skipped) per activity system. The composition is the layer that centralizes both that the `Verified` state was reached through an attributed, tamper-evident verification (recorded in the Audit Trail) and that the gate query is the single surface activity consumes. This is the structural form of the BSA/AML CDD-before-activity obligation.

Beyond the gate, the composition guarantees four further emergent properties. Every `Unverified → Verified` transition produces a tamper-evident Audit Trail event carrying the verification identifiers. Every adverse monitoring trigger produces an Audit Trail event ordered before any suspension it precipitates, so no trigger-driven suspension exists in the records without its precipitating trigger ordered ahead of it. A party reinstated after an adverse trigger has a `passed` verification recorded after the most recent suspend (Party Identity Invariant 4, surfaced at the composition layer with audit coverage). And a closed party's record cannot be purged before its post-closure Retention Window floor (the BSA/AML five-year period under 31 CFR §1020.220) elapses.

 Its most common uses are retail and commercial bank customer onboarding under BSA/AML, broker-dealer counterparty onboarding, payments-processor merchant onboarding, and crypto-exchange customer onboarding under the EU 5th Anti-Money Laundering Directive (AMLD5). Any system that must prove, from records alone, that every party with regulated activity was verified before that activity, that adverse triggers were acted on, and that closed-party records were retained for the mandated post-closure period, is a candidate for this composition.

---

## Intent

Every financial institution that admits an external customer faces the same regulated arc, and the arc is the same whether the institution is a retail bank, a broker-dealer, a payments processor, or a crypto exchange. The customer's identity must be established and verified before regulated activity begins; the verified status must be the precondition any account-opening, transaction, or service-provisioning system checks; the relationship must be monitored on an ongoing basis so that a sanctions match, a politically-exposed-person (PEP — Politically Exposed Person) status change, or adverse media triggers suspension and re-verification; and when the relationship ends, the identity record and its Customer Due Diligence (CDD) evidence must survive for a regulator-mandated period after closure. FATF (Financial Action Task Force — the international standard-setter for anti-money-laundering and counter-terrorist-financing rules) Recommendations 10–12 name the arc as Customer Due Diligence: identify, verify, conduct ongoing monitoring. BSA/AML (Bank Secrecy Act / Anti-Money Laundering) 31 CFR §1020.220 fixes the record-retention floor at five years after the business relationship ends. The domain varies; the structural obligation is constant.

Neither Party Identity nor Retention Window, alone, enforces this arc. Party Identity owns the verification lifecycle — Unverified, Verified, Suspended, Closed — and the structural guarantee that a party cannot reach Verified without a recorded `passed` verification after the most recent suspension (Party Identity Invariant 4). But Party Identity exposes no gate: it records that a party is Verified, but it does not enforce that activity systems consult that state, and it does not know what "regulated activity" means. Retention Window owns the record-lifetime clock, but it has no knowledge of when a relationship begins or ends; it takes a `policy_ref` and a `record_ref` and enforces a no-early-purge guarantee, nothing more. The Audit Trail substrate records attributed, tamper-evident, retention-bounded events, but it does not know which events constitute a verification chain or a monitoring history. The structure that makes the three coherent as a single Customer Due Diligence surface — the gate that centralizes the verification precondition, the monitoring schedule that drives re-verification, the two distinct retention placements that bracket the relationship — belongs to no single constituent. It belongs to the composition, and this composition is that structure.

This is a composition, not a new primitive. Party Identity, Retention Window, and Audit Trail are unchanged; the composition is the wiring that makes them coherent as a single Customer Due Diligence surface. It introduces emergent actions — [Initiate Onboarding], [Clear Review], [Activity Permitted] — that belong to no single constituent and exist only because the three are wired together. The [Clear Review] action, in particular, wraps a Party Identity `verify(passed)`, a Party Identity `reinstate`, and two Audit Trail records into one named surface, so that clearing an adverse-trigger investigation is a single auditable act rather than a sequence of leaked atom internals an operator must orchestrate by hand.

What the composition is *not*: it is not the verification workflow (document OCR (Optical Character Recognition), biometric check, sanctions-database query — those produce the `verification_result` Party Identity records); it is not the risk-scoring or enhanced-due-diligence (EDD) engine (whether a party requires EDD versus standard CDD is Party Identity's named composing concept, not this composition's); it is not the consent surface for downstream non-obligatory processing (the Customer Due Diligence processing basis is GDPR (General Data Protection Regulation) Article 6(1)(c) legal obligation, not consent — see Lineage notes Pass 2 finding 2); and it is not the scheduling engine (the composition holds schedule state but an external scheduler fires the monitoring triggers). Each is named explicitly in Edge cases.

---

## Composes

- **[Party Identity](../atoms/party-identity.md)** — the primary data-bearing constituent: the persistent, verifiable identity record with the Unverified → Verified → Suspended → Closed lifecycle. The composition calls `enroll` (only on the direct-enrollment path; see Flow), `verify`, `suspend`, `reinstate`, and `close`. The composition maintains exactly one Party Identity instance. Party Identity's structural guarantee that `Verified` requires a `passed` verification after the most recent suspend (Invariant 4) is the foundation the verification-gates-activity decision rests on; the composition adds the gate query and the audit coverage that Party Identity by design does not.
- **[Retention Window](../atoms/retention-window.md)** — the policy-bounded record lifetime. The composition uses **two distinct retention placements over the same `party_id`**, both against this single Retention Window instance: an *active-relationship* placement at [Initiate Onboarding] (governing the party/CDD record while the relationship is live) and a *post-closure* placement at [Close Party] (the BSA/AML five-year floor under 31 CFR §1020.220). The two are separate Retention Window records with distinct `retention_id`s and distinct policy references; Retention Window's own edge case on *multiple simultaneous retentions for the same record* is the constituent guarantee that makes the two-placement model valid. This Retention Window instance is **distinct from the Retention Window instance inside the Audit Trail substrate**, which governs the audit *events*; the two instances and their policies differ (see Edge cases — *Two Retention Window instances*). This composition calls `place_under_retention` only; `purge` is the host's or a composing Defensible Retention layer's responsibility, so Retention Window's purge-family rejections (`not-retained`, `retention-period-not-elapsed`) do not surface at this composition's boundary.
- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every state-changing action the composition exposes records here as one `record_action` call, producing an Event Log entry, an Actor Identity attestation, a Retention Window record (for the audit event), and a Tamper Evidence seal per the substrate's cadence. The composition maintains exactly one Audit Trail instance configured with the host's regulatory retention policy for audit events. **Actor Identity is reached transitively through Audit Trail** — the composition does not maintain a separate Actor Identity instance; the `actor_ref` and `credential` passed to each composition action flow to `AuditTrail.record_action`, which binds the actor cryptographically via the Actor Identity atom inside the substrate. Event Log, Tamper Evidence, and the audit-event Retention Window are likewise reached transitively.

The Event Log, Actor Identity, Tamper Evidence, and audit-event Retention Window atoms are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms at this layer.

---

## Composition logic

### Composition state

The composition owns emergent state that wires the three constituents into one queryable Customer Due Diligence surface. None of this state belongs to a single constituent.

- **`case_to_monitoring`** — map from `case_id` to `{party_id, opened_at, next_review_due}`. The monitoring schedule entry for an active onboarding case. Populated by [Initiate Onboarding]; [Next Review Due] advanced by [Record Verification] (on a state-changing pass), [Trigger Monitoring Review] (on periodic-review-due), and [Clear Review]. It does **not** advance on an adverse-trigger suspension or on a re-verification of an already-`Verified` party; a long-`Suspended` party's `next_review_due` intentionally does not roll forward until [Clear Review] reinstates the party. The entry persists for the life of the active relationship; it is the composition's record that a party is under continuing monitoring. A `Verified` party with no entry here is a structural finding, not a valid state (Invariant 6). This is the auditor's first query surface for monitoring continuity.
- **`party_to_case`** — map from `party_id` to `{case_id, enrollment_path, active}` where `enrollment_path ∈ {direct, external-onboarding}` records whether the party was enrolled by this composition (`direct`) or admitted upstream by External Onboarding (`external-onboarding`), and `active` is a boolean cleared by [Close Party]. Required so the composition can resolve a `party_id` back to its case for the gate query and the closure path, and so an auditor can join activity records (keyed by `party_id`) to the onboarding case. Populated by [Initiate Onboarding]; `active` set false by [Close Party].
- **`case_to_retentions`** — map from `case_id` to `{active_relationship_retention_id, post_closure_retention_id?}`. Records the two distinct Retention Window `retention_id`s placed over the party record. `active_relationship_retention_id` is populated by [Initiate Onboarding]; `post_closure_retention_id` is populated by [Close Party]. The presence of both is the records-alone evidence that both retention placements occurred (Invariant 5).
- **`case_to_open_triggers`** — map from `case_id` to the set of open adverse-trigger records `{trigger_id, trigger_type, trigger_ref, triggered_at}`. An adverse trigger is added by [Trigger Monitoring Review] (adverse path) and removed by [Clear Review]. A non-empty set means the party is under an unresolved adverse investigation and is in `Suspended` state. [Clear Review] requires a matching open trigger; closing the trigger is part of clearing the review.

The Party Identity store (party records, verification events, state-change events), the Retention Window store (retention records), and the Audit Trail substrate's emergent state (`event_to_attestation`, `event_to_retention`, `seal_coverage`, `sealed_through`) are owned by their respective constituent instances. The composition does not duplicate them; it indexes into them via the maps above.

### Configuration

- **`active_relationship_policy_ref`** — the recommended Retention Window policy reference for the active-relationship retention of the party/CDD record. The caller passes it (or a per-party CDD-tier policy) as the **required** `retention_policy_ref` argument to [Initiate Onboarding], which step 4 consumes. The composition holds no default it substitutes — the argument is authoritative and required; this Configuration entry is the deployment's recommended value, not a fallback the action applies when the argument is omitted. The deployment sets this to the policy governing how long an active customer's CDD record is held under active retention before the relationship ends. Must resolve in the Retention Window's Policy Registry. Multi-jurisdiction policy reconciliation (selecting the longer of competing obligations) is out of scope; a Policy Reconciliation composing pattern produces the reconciled `policy_ref` this composition consumes.
- **`post_closure_retention_policy_ref`** — the Retention Window policy reference applied at [Close Party]. For deployments under BSA/AML this must encode the 31 CFR §1020.220 five-year-after-relationship-end floor; the deployment must not configure a policy whose `duration` is shorter than the applicable post-closure regulatory minimum. Like the active-relationship policy, it must resolve in the Policy Registry and is the deployment's reconciled value.
- **`audit_trail_retention_policy`** — the `retention_policy` configured on this composition's single Audit Trail instance (a policy reference, or a content-derived policy selector), governing the lifetime of the *audit events* (distinct from the party-record retentions above). It is set once on the instance; Audit Trail's `record_action` takes **no per-call retention argument**, so every audit write this composition makes inherits this configured policy. The audit trail of an onboarding decision should persist at least as long as the party record it describes, and often longer for litigation defensibility after the party record is purged.
- **`monitoring_interval`** — the duration added to `now` to compute `next_review_due` whenever a verification passes or a periodic review fires. Deployment-configurable; must be a positive duration (e.g., `P1Y` for annual). The minimum interval for a given party tier (standard CDD vs. EDD) is a deployment-policy obligation driven by the risk-tiering framework; this composition enforces that the interval is positive but does not impose a minimum value. Absent a configured value, [Initiate Onboarding] rejects with `invalid-request`. It is instance configuration validated at instance setup and re-checked at [Initiate Onboarding] step 1; the schedule-advancing actions ([Record Verification], [Trigger Monitoring Review], [Clear Review]) consume the validated instance value without re-validating it per call.

- **`adverse_trigger_types`** — the set of `trigger_type` values the deployment treats as *adverse* (driving suspension). The canonical adverse set is `{sanctions-match, pep-status-change, adverse-media}`; the deployment may extend it. Any `trigger_type` not in this set and not equal to `periodic-review-due` is rejected by [Trigger Monitoring Review] with `invalid-request`. `periodic-review-due` is always a non-adverse trigger and is not configurable into the adverse set.

### Primitive policies

The composition takes string-typed inputs at its action boundaries; each is validated either at this layer or by a constituent.

- **`party_id`** — opaque, system-generated by Party Identity's `enroll`. When supplied to [Initiate Onboarding] (the External Onboarding path), it must reference a party known to the Party Identity instance; otherwise [Initiate Onboarding] rejects with [Party Not Known]. The composition does not normalize, case-fold, or trim; `party_id` equality is opaque byte-identity.
- **`case_id`** — opaque, system-generated by the composition at [Initiate Onboarding]. Immutable; never reused. Composition-generated ids (`case_id`, `trigger_id`) use byte-identity equality as map keys; never normalized.
- **`trigger_id`** — opaque, system-generated by the composition at [Trigger Monitoring Review] (generated in step 3, before the trigger event is recorded). Immutable; never reused. Carried in the `customer-onboarding.monitoring-triggered`, `customer-onboarding.party-suspended` / `customer-onboarding.trigger-on-suspended-party`, and `customer-onboarding.review-cleared` audit-event data, so the trigger lifecycle — raised, suspended-on, cleared — is reconstructable from the records alone (the clearance-to-trigger join does not depend on volatile in-memory state).
- **`enrollment_fields`** — the Party Identity enrollment tuple (`name`, `date_of_birth`, `document_type`, `document_ref`) plus `enrolling_actor_ref`, supplied only on the direct-enrollment path. Validated by Party Identity's `enroll`; the composition propagates Party Identity's `invalid-request` without imposing additional rules.
- **`actor_ref`, `verifying_actor_ref`, `closing_actor_ref`** — opaque actor identifiers. Each must contain at least one non-whitespace character; empty/whitespace-only is rejected with `invalid-request`. The substrate's Actor Identity binds them cryptographically via the paired `credential`. On the direct-enrollment branch, `actor_ref` (the case-opening actor, attributed on `customer-onboarding.initiated`) and `enrollment_fields.enrolling_actor_ref` (attributed on the Party Identity enrollment record) may differ — case-opening service vs. enrolling officer — and both appear in the records; the composition does not require them equal. The `credential` supplied to an action must belong to the actor its audit write binds: `verifying_actor_ref` for [Record Verification], `closing_actor_ref` for [Close Party], the top-level `actor_ref` otherwise — that actor/credential pair is what the substrate's Actor Identity binds.
- **`credential`** — opaque credential material consumed only by `AuditTrail.record_action` (and, where the substrate verifies before recording, by the Actor Identity inside the substrate). The composition does not inspect it; the substrate's Actor Identity validates it at the audit write and may surface `invalid-credential`, mapped per the Action wiring preamble's uniform `record_action` rejection rule (to `invalid-request` when the audit write precedes any state change, otherwise to `recording-failure` as an orphan).
- **`method`, `evidence_ref`** — Party Identity verification metadata; each must contain at least one non-whitespace character. Validated by Party Identity's `verify`; the composition propagates the constituent's `invalid-request`.
- **`verification_result`** — must be exactly `passed` or `failed` (Party Identity's rule). [Clear Review] always passes `passed`; [Record Verification] accepts either.
- **`trigger_type`** — must be `periodic-review-due` or a member of `adverse_trigger_types`; otherwise `invalid-request`.
- **`trigger_ref`** — opaque reference to the external screening result or review record that precipitated the trigger; must contain at least one non-whitespace character.
- **`reason`** — free-form string supplied to [Clear Review] (passed to `reinstate`) and [Close Party] (passed to `close`); must contain at least one non-whitespace character (Party Identity's rule on `reason`). No length cap beyond Party Identity's 2000-character cap is imposed at this layer.
- **`retention_policy_ref`** — the active-relationship policy reference supplied to [Initiate Onboarding]. Validated by Retention Window's `place_under_retention`; `invalid-policy` and `policy-not-found` from the constituent are mapped to `invalid-request` at this composition's boundary.

No primitive is case-sensitivity-normalized at the composition layer; deployments wanting normalization wire it at the calling layer before invoking composition actions.

### Logic confinement (clock and id)

The clock is an **injected input at the composition's single I/O seam**, never read inside a guard or a transition and never threaded through a caller signature. Per the Logic Confinement Principle ([`execution-contract.md`](../execution-contract.md)), the host reads the clock once per invocation and injects `now` (`clock_t`) at the seam before the orchestration runs; the actions below are pure functions of the stored records plus that injected `now`. Because the clock enters at the seam rather than as a parameter, the action signatures below carry **no** `now` argument — the same discipline Retention Window pins for `place_under_retention`.

`now` is consumed for exactly two clearly separated purposes:

- **Stamping immutable timestamps** on a committed write — `opened_at` in the `case_to_monitoring` entry at [Initiate Onboarding], and the audit-event stamps `triggered_at` and `suspended_at` / `recorded_at` at [Trigger Monitoring Review], `cleared_at` and `reinstated_at` at [Clear Review], and `closed_at` at [Close Party].
- **Computing the derived monitoring deadline** from the configured interval — [Next Review Due] `= now + monitoring_interval`, written at [Initiate Onboarding] and re-derived by each schedule-advancing action ([Record Verification] on a state-changing pass, [Trigger Monitoring Review] on `periodic-review-due`, [Clear Review]). `monitoring_interval` is instance configuration validated at setup; the deadline is computed from it and the injected `now`, never from a clock sampled inside the transition.

**No clock-bearing guard, and no stored review-due flag.** [Activity Permitted] — the composition's only gate — consults `party_to_case` and the live Party Identity state; it compares no timestamp and reads no clock, so the gate is clock-independent by construction. The composition stores the [Next Review Due] deadline, never a derived "review due" or "overdue" boolean: whether a review is due is a read-time projection of the stored deadline against an injected `now` at the moment the question is asked, so nothing can lag the clock (the same discipline Retention Window pins in its Invariant 11). Nor does the composition run a scheduler (Edge cases — *Monitoring scheduler boundary*); the external scheduler that reads [Next Review Due] evaluates due-ness against the `now` injected at its own seam and calls [Trigger Monitoring Review].

**One injected `now` per invocation, shared.** Within a single invocation the same injected `now` serves every stamp and every deadline computation in that call. At [Initiate Onboarding], `opened_at` and [Next Review Due] derive from one reading, so `next_review_due − opened_at` is exactly `monitoring_interval` rather than the interval plus an inter-read drift. At [Trigger Monitoring Review], `triggered_at` and the adverse path's `suspended_at` / `recorded_at` carry the same instant — Invariant 3's *ordered before* claim rests on the Event Log's insertion order (reached transitively through Audit Trail), not on a timestamp gap that two separate clock reads would manufacture. At [Clear Review], `cleared_at`, `reinstated_at`, and the advanced [Next Review Due] all derive from one reading. Ids come from the seam or from the constituents: `case_id` and `trigger_id` are the injected `id_t`, allocated at the seam; `party_id`, `verification_id`, `state_change_id`, `retention_id`, and `event_id` are minted by Party Identity, Retention Window, and Audit Trail at their own seams. This composition mints no id inside a transition and generates no cryptographic material.

### Action wiring

The composition exposes six actions. Five are state-changing and record in the Audit Trail; the sixth, [Activity Permitted], is a read-only gate query and records nothing (a read-only query produces no state change, so an audit event would be a false positive in the action record). Every constituent rejection is mapped — propagated, renamed, or surfaced as a new code — at the composition's boundary; silent rejection-code drift is a reference-graph finding.

For every `AuditTrail.record_action` call below, the substrate's rejection taxonomy (`invalid-credential | invalid-request | recording-failure`) is mapped uniformly. Where the audit write *precedes* any constituent state change — the audit-first [Trigger Monitoring Review] step 3 — `invalid-credential` and `invalid-request` surface as `rejected(invalid-request)`, a clean pre-state rejection. Where the audit write *follows* a constituent state change (all other state-changing actions), credential and request validity cannot be pre-empted at this composition's boundary: Actor Identity is reached transitively through the substrate, so the credential is first consumed at the audit write, after the irreversible enroll/verify/suspend/close has committed. There, `invalid-credential`/`invalid-request` surface as `rejected(recording-failure)` and the resulting orphan (a committed state change with no audit event) is handled per the *Cross-store consistency under partial failure* edge case. Deployments that must reject an invalid credential *before* any state mutation wire a Permissions / Actor Identity pre-check above this composition (a composing peer); this composition alone cannot pre-validate the credential because its only Actor Identity surface is the transitive one inside the audit write.

#### `initiate_onboarding`

```
initiate_onboarding(
 party_id?,
 enrollment_fields?,
 actor_ref,
 credential,
 retention_policy_ref
) →
  case_id
 | rejected(
   invalid-request
  | party-not-known
  | enrollment-failed(invalid-request | storage-failure)
  | recording-failure
  )
```

Opens an onboarding case for a party. The `party_id` argument is **optional**, and the two branches are explicit:

- **Direct-enrollment branch (`party_id` absent).** The composition enrolls the party itself.
- **External-Onboarding-admitted branch (`party_id` present).** External Onboarding has already admitted the party in `Unverified` state; the composition skips enrollment and proceeds straight to retention placement and monitoring-schedule opening.

Both branches converge on the same downstream verification workflow ([Record Verification]).

Steps:

1. Validate `actor_ref`, `credential`, and `retention_policy_ref` per Primitive policies, and confirm `monitoring_interval` is configured and is a positive duration (the Configuration obligation that the monitoring schedule can be computed). Any failure → `rejected(invalid-request)`. Stop.
2. Resolve the party:
  - **If `party_id` is absent:** require `enrollment_fields` present; if absent → `rejected(invalid-request)`. Call `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id` (or, on `rejected(invalid-request | storage-failure)`, surface as `rejected(enrollment-failed(<constituent-reason>))` and stop — no case is opened, no retention placed). Set `enrollment_path = direct`. (Enroll's `storage-failure` is wrapped as [Enrollment Failed] rather than flattened to `recording-failure` precisely because it occurs *before* any case or retention exists — there is no orphan to recover; a `storage-failure` at retention placement (step 4) or the audit write (step 5) occurs *after* partial state and therefore surfaces as `recording-failure` with an orphan, which is the deliberate asymmetry.)
  - **If `party_id` is present:** confirm it references a known party via the Party Identity instance; if not → `rejected(party-not-known)`. Stop. (`enrollment_fields`, if supplied on this branch, are ignored — the party already exists and Party Identity enrollment fields are immutable.) Set `enrollment_path = external-onboarding`.
3. Consume the seam-injected `id_t` as `case_id` (opaque, fresh — allocated at the seam, not minted inside the transition; see *Logic confinement*).
4. Place the party record under **active-relationship retention**: `Retention Window.place_under_retention(record_ref=party_id, policy_ref=retention_policy_ref)` → `active_relationship_retention_id` (the per-call `retention_policy_ref` argument is authoritative — it carries the active-relationship policy, defaulting to the configured `active_relationship_policy_ref` when the deployment uses a single policy; the action consumes the argument so per-party CDD-tier policies are possible, and there is no silent substitution of a configured value for the caller's) (or map `invalid-policy`/`policy-not-found`/`invalid-request` to `rejected(invalid-request)` and `storage-failure` to `rejected(recording-failure)`; stop on either — if the party was enrolled in step 2's direct branch, the enrolled Party Identity record persists as an `Unverified` party with no onboarding case, surfaced per the *Cross-store consistency under partial failure* edge case).
5. Record initiation **first** (audit-first discipline, matching [Trigger Monitoring Review]): `AuditTrail.record_action(action_ref=customer-onboarding.initiated, actor_ref, credential, data={case_id, party_id, enrollment_path, active_relationship_retention_id})` → `event_id`. If this call fails after steps 2 and 4 succeeded → `rejected(recording-failure)`; **no composition maps are populated**, so no `case_id` becomes resolvable by a downstream action without its `customer-onboarding.initiated` event having landed, and the implementation surfaces the orphan (enrolled-and-retained party with no case and no initiation event) per the *Cross-store consistency under partial failure* edge case.
6. Populate composition state only after the initiation event has landed: `case_to_monitoring[case_id] = {party_id, opened_at = now, next_review_due = now + monitoring_interval}` — `opened_at` and [Next Review Due] both derived from the **single seam-injected `now`** for this invocation (see *Logic confinement*), so the interval between them is exactly `monitoring_interval` — `party_to_case[party_id] = {case_id, enrollment_path, active = true}`, and `case_to_retentions[case_id] = {active_relationship_retention_id, post_closure_retention_id = null}`.
7. Return `case_id`.

#### `record_verification`

```
record_verification(
 case_id,
 verifying_actor_ref,
 method,
 verification_result,
 evidence_ref,
 credential
) →
  recorded
 | rejected(
   not-known
  | invalid-request
  | already-closed
  | recording-failure
  )
```

Records a verification result against the case's party. This is the action that drives the `Unverified → Verified` transition (when `verification_result = passed` against an `Unverified` party) and that records periodic re-verifications.

Steps:

1. Look up `case_id` in `case_to_monitoring`. If not present → `rejected(not-known)`. Stop. Resolve `party_id` from the entry.
2. Validate `verifying_actor_ref`, `method`, `evidence_ref`, `credential`, and `verification_result` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
3. Call `Party Identity.verify(party_id, verifying_actor_ref, method, verification_result, evidence_ref)` → `{verification_id, state_change_id?}` (or map: `already-closed` → `rejected(already-closed)`; `not-known` → `rejected(recording-failure)` — a `not-known` here means the case's `party_id` is unknown to Party Identity, an internal-consistency anomaly distinct from the caller-supplied unknown-case `not-known` of step 1, surfaced as a recording-failure orphan per the *Cross-store consistency under partial failure* edge case; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.). `state_change_id` is present iff this call drove an `Unverified → Verified` transition.
4. Record: `AuditTrail.record_action(action_ref=customer-onboarding.verification-recorded, actor_ref=verifying_actor_ref, credential, data={case_id, party_id, verification_id, state_change_id, result=verification_result})` → `event_id`. If this call fails after step 3 succeeded → `rejected(recording-failure)`; the verification exists in Party Identity but is unattested. This is the composition's most consequential atomicity gap; recovery is named in the *Cross-store consistency under partial failure* edge case.
5. If `verification_result = passed` **and** `state_change_id` is present (the `Unverified → Verified` transition occurred): advance `next_review_due` in `case_to_monitoring[case_id]` to `now + monitoring_interval`, computed from the seam-injected `now` for this invocation (see *Logic confinement*). (A re-verification of an already-Verified party — `state_change_id` absent — does not advance the schedule by this path; periodic-review handling belongs to [Trigger Monitoring Review].) Periodic re-reviews **must** be driven through `trigger_monitoring_review(periodic-review-due)`, which advances the schedule; a bare [Record Verification] against a `Verified` party records evidence but is intentionally not a schedule-advancing path, so a deployment that ran periodic checks only through [Record Verification] would leave `next_review_due` stale. Deployments route periodic reviews through the trigger action.
6. Return `recorded` — the action's guarantee is that a verification event was recorded and attested, **not** that the party is now `Verified` (a `failed` result, or a `passed` result against a `Suspended` party, records the event and drives no transition). Callers query [Activity Permitted] for the resulting gate state.

#### `trigger_monitoring_review`

```
trigger_monitoring_review(
 case_id,
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

1. Look up `case_id` in `case_to_monitoring`. If not present → `rejected(not-known)`. Stop. Resolve `party_id`.
2. Validate `actor_ref`, `credential`, `trigger_ref` per Primitive policies. Validate `trigger_type`: it must be `periodic-review-due` or a member of `adverse_trigger_types`; otherwise → `rejected(invalid-request)`. Stop on any.
3. **Record the trigger first:** consume the seam-injected `id_t` as `trigger_id` (fresh, opaque — allocated at the seam, not minted inside the transition; see *Logic confinement*). `AuditTrail.record_action(action_ref=customer-onboarding.monitoring-triggered, actor_ref, credential, data={case_id, party_id, trigger_id, trigger_type, trigger_ref, triggered_at = now})` → `trigger_event_id`, where `triggered_at` is stamped from the seam-injected `now` for this invocation (see *Logic confinement*). If this fails → `rejected(recording-failure)` and **no state transition is attempted** (the record-first ordering guarantees that no suspension occurs without its trigger event landing). Stop.
4. Branch on `trigger_type`:
  - **Adverse** (`trigger_type ∈ adverse_trigger_types`): call `Party Identity.suspend(party_id, suspending_actor_ref=actor_ref, reason="monitoring-trigger:" + trigger_type + ":" + trigger_ref)`. Map rejections: `not-verifiable` (party is `Unverified` — never reached Verified, nothing to suspend) → `rejected(not-verified(Unverified))`; `already-suspended` (a concurrent or prior adverse trigger already suspended the party) → treat as success-for-idempotency: skip the suspend, proceed to add the trigger to the open set, and record the second audit event noting the party was already suspended (see step 5); `already-closed` → `rejected(not-verified(Closed))`; `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`.
  - **Periodic** (`trigger_type = periodic-review-due`): no state transition. Advance `next_review_due` in `case_to_monitoring[case_id]` to `now + monitoring_interval`, computed from the **same seam-injected `now`** that stamped the step-3 `triggered_at` (see *Logic confinement*). Proceed to return (the `customer-onboarding.monitoring-triggered` event recorded in step 3 is the complete record for a periodic review). Return `recorded`.
5. **Adverse path only** — record the outcome, with the event class reflecting whether a transition actually occurred. After a *successful* `suspend` (a real `Verified → Suspended` transition): `AuditTrail.record_action(action_ref=customer-onboarding.party-suspended, actor_ref, credential, data={case_id, party_id, trigger_id, trigger_type, trigger_ref, state_change_id (from suspend), suspended_at = now})`, where `suspended_at` is stamped from the **same seam-injected `now`** that stamped step 3's `triggered_at` (see *Logic confinement*) — the two events therefore carry one instant, and Invariant 3's *ordered before* claim reads the Event Log's insertion order rather than a timestamp gap. In the *already-suspended idempotent case* (no new transition — a prior adverse trigger already suspended the party): record instead `AuditTrail.record_action(action_ref=customer-onboarding.trigger-on-suspended-party, actor_ref, credential, data={case_id, party_id, trigger_id, trigger_type, trigger_ref, prior_state=Suspended, recorded_at = now})` — `recorded_at` stamped from that same injected `now`; a distinct event class, so a second adverse trigger is not read as a second suspension and an auditor does not miscount transitions. If either record fails → `rejected(recording-failure)`; the party is Suspended but this outcome is unattested (the precipitating `customer-onboarding.monitoring-triggered` event from step 3 already landed, so the suspension is not *uncaused* in the records, but it is *unrecorded as this trigger's outcome* — surfaced per the *Cross-store consistency under partial failure* edge case).
6. Add the trigger to the open set: `case_to_open_triggers[case_id] ∪= {trigger_id (from step 3), trigger_type, trigger_ref, triggered_at}`.
7. Return `recorded`.

#### `clear_review`

```
clear_review(
 case_id,
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
  | already-closed
  | recording-failure
  )
```

The single emergent action that clears an adverse-trigger investigation and returns the party to `Verified`. It wraps `Party Identity.verify(passed)` + `Party Identity.reinstate` + two Audit Trail records into one named surface, so clearing a review is one auditable act rather than a sequence of leaked atom internals. Party Identity Invariant 4 requires a `passed` verification recorded after the most recent suspend before `reinstate` will succeed; this action satisfies that precondition in the same call.

Steps:

1. Look up `case_id` in `case_to_monitoring`. If not present → `rejected(not-known)`. Stop. Resolve `party_id`.
2. Confirm an open adverse trigger exists: `case_to_open_triggers[case_id]` is non-empty. If empty → `rejected(no-open-trigger)`. Stop. (Clearing a review with no open trigger is a caller error — there is nothing to clear.)
3. Validate `verifying_actor_ref`, `method`, `evidence_ref`, `actor_ref`, `credential`, `reason` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
4. Record fresh evidence: `Party Identity.verify(party_id, verifying_actor_ref, method, passed, evidence_ref)` → `{verification_id, state_change_id?}`. (Against a `Suspended` party, `verify(passed)` records the event but does not change state, so `state_change_id` is absent — this is expected and correct.) Map rejections: `already-closed` → `rejected(already-closed)` (the party was Closed — terminal; clearing is futile and the caller must not retry); `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
5. Record the clearance: `AuditTrail.record_action(action_ref=customer-onboarding.review-cleared, actor_ref, credential, data={case_id, party_id, verification_id, closed_triggers = {the trigger_id/trigger_ref pairs currently in case_to_open_triggers[case_id]}, reason, cleared_at = now})` → `event_id`, where `cleared_at` is stamped from the seam-injected `now` for this invocation (see *Logic confinement*). The `closed_triggers` set makes the clearance-to-trigger join records-alone even when a single clearance resolves multiple open triggers. If this fails → `rejected(recording-failure)`; the fresh verification exists but the clearance is unattested. Stop (the `reinstate` in step 6 is **not** attempted — clearing without the audit record landing would leave a reinstatement uncaused in the records).
6. Reinstate: `Party Identity.reinstate(party_id, reinstating_actor_ref=actor_ref, reason)` → `state_change_id`. The `passed` verification recorded at step 4 satisfies Party Identity's `no-passed-verification-since-suspend` precondition. Map rejections: `no-passed-verification-since-suspend` → `rejected(verification-failed)` (should not occur given step 4 succeeded, but mapped for completeness — a concurrent suspend between step 4 and step 6 could in principle re-arm it; reachable only if the host fails to honor the serialization obligation of Edge cases — *Concurrency*, so it is a defense-in-depth code); `not-suspended` → `rejected(verification-failed)` (the party was not Suspended — a concurrent reinstate raced in); `already-closed` → `rejected(already-closed)` (a concurrent close raced in — terminal, do not retry); `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
7. Record the reinstatement: `AuditTrail.record_action(action_ref=customer-onboarding.party-reinstated, actor_ref, credential, data={case_id, party_id, state_change_id, reinstated_at = now})` — `reinstated_at` stamped from the **same seam-injected `now`** that stamped step 5's `cleared_at` (see *Logic confinement*), so the clearance and the reinstatement it authorizes carry one instant. If this fails → `rejected(recording-failure)`; the party is Verified again but the reinstatement is unattested.
8. Close the open trigger(s): clear `case_to_open_triggers[case_id]` (the clearance resolves the adverse investigation; all open triggers for the case are closed by the single clearance and are enumerated in the `customer-onboarding.review-cleared` event's `closed_triggers` set recorded at step 5, so the closure is records-alone auditable — a deployment requiring per-trigger clearance wires that distinction above the composition layer).
9. Advance `next_review_due` in `case_to_monitoring[case_id]` to `now + monitoring_interval`, computed from that same seam-injected `now` (see *Logic confinement*).
10. Return `cleared`.

#### `close_party`

```
close_party(
 case_id,
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

1. Look up `case_id` in `case_to_monitoring` (and `party_to_case`). If not present → `rejected(not-known)`. Stop. Resolve `party_id`.
2. Confirm the case is active: `party_to_case[party_id].active = true`. If already closed → `rejected(not-active)`. Stop.
3. Validate `closing_actor_ref`, `reason`, `credential` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
4. Close the party: `Party Identity.close(party_id, closing_actor_ref, reason)` → `state_change_id`. Map rejections: `already-closed` → `rejected(not-active)` (the party is already Closed — consistent with step 2 but possible under a concurrent close); `not-known` → `rejected(not-known)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any.
5. Place **post-closure retention**: `Retention Window.place_under_retention(record_ref=party_id, policy_ref=post_closure_retention_policy_ref)` → `post_closure_retention_id`. This is the second Retention Window operation; it establishes the 31 CFR §1020.220 five-year-after-relationship-end floor and is distinct from the active-relationship retention placed at [Initiate Onboarding]. Map `invalid-policy`/`policy-not-found`/`invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. If this fails after step 4 succeeded, the party is Closed but the post-closure floor is not placed — a high-priority finding surfaced per the *Cross-store consistency under partial failure* edge case (the active-relationship retention from [Initiate Onboarding] still governs the record, so the record is not unprotected, but the post-closure floor that must outlast it is missing).
6. Record `case_to_retentions[case_id].post_closure_retention_id = post_closure_retention_id`.
7. Record: `AuditTrail.record_action(action_ref=customer-onboarding.party-closed, actor_ref=closing_actor_ref, credential, data={case_id, party_id, state_change_id, post_closure_retention_id, reason, closed_at = now})` → `event_id`, where `closed_at` is stamped from the seam-injected `now` for this invocation (see *Logic confinement*). If this fails → `rejected(recording-failure)`; surfaced per the partial-failure edge case.
8. Mark the case closed: `party_to_case[party_id].active = false`. The `case_to_monitoring` entry is retained (it is the record that monitoring was in force during the relationship); monitoring no longer fires for a closed party because the scheduler reads `active`.
9. Return `closed`.

#### `activity_permitted`

```
activity_permitted(party_id) →
  permitted
 | rejected(not-verified(state))  // state ∈ {Unverified, Suspended, Closed}
 | rejected(not-known)       // party not governed by an onboarding case
```

The read-only verification-gates-activity query. **No Audit Trail record is produced** — this is a read-only query that changes no state, and recording it would falsely populate the action record with non-actions. Activity systems consume this query as their single gate; they must not read Party Identity state directly (see Edge cases — *Activity systems reading Party Identity directly*).

Steps:

1. Resolve `party_to_case[party_id]`. If absent → `rejected(not-known)` — the party is not governed by an onboarding case (it was never run through [Initiate Onboarding], or `party_id` is unknown), so this composition makes no verification claim about it. This check is what makes the gate enforce *verified-through this composition*, not merely *Verified*: only a party this composition itself initiated has a case entry, and Invariant 2 guarantees that case's `Unverified → Verified` transition is audited. A party driven to `Verified` outside this composition has no entry and fails the gate here.
2. Read the party's current state from the Party Identity instance for `party_id`.
3. If the state is `Verified` → return `permitted`.
4. Otherwise → return the [Not Verified] rejection, naming the actual state: `Unverified`, `Suspended`, or `Closed`. The named state lets the calling activity system distinguish *not yet verified* (retry after verification) from *suspended* (under investigation) from *closed* (relationship ended).

### The load-bearing wiring decision — verification-gates-activity

The composition's structural reason to exist: **a party reaches regulated activity only through the `Verified` state, that state is reached only through an attributed and tamper-evident verification, and the gate query [Activity Permitted] is the single surface every activity system consumes.**

*Principle.* BSA/AML and FATF Recommendations 10–12 require that Customer Due Diligence be completed before a business relationship's regulated activity begins. Structurally, that means: no account opening, no transaction, no service provisioning may proceed for a party who is not in a substantiated `Verified` state, and the system must be able to prove — from the records alone — both that the party was verified and that no activity preceded the verification.

*Likely objection.* Party Identity already owns the `Verified` state and already guarantees (Invariant 4) that `Verified` is not reachable without a `passed` verification after the most recent suspend. Why not have each activity system simply read Party Identity's state directly? The atom already enforces the substance of the gate.

*Mechanism that resolves it.* Party Identity owns the `Verified` state but exposes no gate — it records the state but does not enforce that activity systems consult it, and it does not know what "regulated activity" means (it is a freestanding atom; importing the notion of an activity system would break its freestanding status). The Audit Trail substrate records attributed, tamper-evident events but does not know which events constitute a verification chain. Neither can, alone, guarantee the two halves of the obligation. The composition is the layer that wires them: it ensures that every `Unverified → Verified` transition flows through [Record Verification], which records a `customer-onboarding.verification-recorded` Audit Trail event carrying both the `verification_id` and the `state_change_id` (so the verification is attributed and tamper-evident, Invariant 2); and it exposes [Activity Permitted] as the *single* gate query, so the precondition is implemented exactly once at the composition boundary rather than re-implemented — or quietly skipped — in each activity system. If activity systems read Party Identity directly, the gate is re-implemented per system, and the first system that forgets the check (or reads a stale state) breaks the structural guarantee silently. The gate consults this composition's case index (`party_to_case`) as well as Party Identity state, so it returns `permitted` only for a party this composition itself initiated and verified — a party driven to `Verified` outside this composition has no case entry and fails with `not-known`. The attribution-and-tamper-evidence half of the guarantee is delivered by Invariant 2 (every `Unverified → Verified` transition driven through this composition is audited) together with the exclusive-ownership obligation (Edge cases — *Exclusive verification ownership of the Party Identity instance*), not by the state read alone; the gate's own job is to confine `permitted` to the `Verified` parties this composition governs. Centralizing the gate at the composition is what makes the BSA/AML before-activity guarantee structural rather than conventional.

*Result.* The gate is structural and centralized. An auditor can verify, from the records alone, that for every party with regulated activity a `customer-onboarding.verification-recorded` event with a `state_change_id` predates the activity (Generation acceptance check 1), and that no activity system held its own copy of the gate logic to drift from. The single-surface discipline is the records-alone-defensible signal: the verification precondition lives in one place, is exercised through one query, and produces one tamper-evident event class the auditor reads.

---

## Composition-level invariants

These invariants emerge from the composition. None belongs to a single constituent; each requires two or more working together to hold.

- **Invariant 1 — Verification gates activity.** Two claims, distinguished by what enforces each. *(a) Query result — composition-enforced:* `activity_permitted(party_id)` returns `permitted` if and only if the party has an onboarding case entry (`party_to_case[party_id]`) **and** Party Identity reports it in `Verified` state. *Defended in-line:* [Activity Permitted] step 1 rejects a party with no onboarding case as `not-known`, and step 3 returns `permitted` only on `Verified`; every other state returns `rejected(not-verified(state))` — the biconditional is exact and the composition enforces it, so a party driven to `Verified` outside this composition cannot pass the gate. *(b) Gating property — deployment-conditional:* a party reaches regulated activity only through this gate, which holds exactly when activity systems consume [Activity Permitted] rather than reading Party Identity directly. This is the one structural obligation pushed to deployment (named in Edge cases — *Activity systems reading Party Identity directly*); a system that bypasses the gate is a composition-bypass finding, not a valid path. The "iff" is a property of the query result; the gate guarantee additionally requires the single-surface obligation to be honored.

- **Invariant 2 — Verification audit coverage.** Every `Unverified → Verified` transition driven through this composition (i.e., through [Record Verification] with `verification_result = passed` against an `Unverified` party) produces a `customer-onboarding.verification-recorded` Audit Trail event carrying the `verification_id` and the `state_change_id`, tamper-evident via the substrate seal. *Rests on:* Party Identity's return of `state_change_id` on the transition (Party Identity Behavior), [Record Verification] step 4, and Audit Trail's attribution and seal coverage (Audit Trail Invariants 1 and 3).

- **Invariant 3 — Adverse trigger precedes state transition.** Every adverse monitoring trigger produces a `customer-onboarding.monitoring-triggered` Audit Trail event before any resulting `suspend` transition; no suspension driven by a trigger exists in the records without its precipitating `customer-onboarding.monitoring-triggered` event ordered before it in the log. *Defended in-line:* [Trigger Monitoring Review] records the trigger (step 3) before attempting `suspend` (step 4) and recording the outcome event (step 5 — `customer-onboarding.party-suspended` for a real transition, or `customer-onboarding.trigger-on-suspended-party` for the already-suspended idempotent case, both carrying the step-3 `trigger_id`); a step-3 recording failure aborts before any state transition. The Event Log's total order (reached transitively through Audit Trail) is what makes "ordered before" a records-alone fact.

- **Invariant 4 — Reinstatement reflects fresh evidence.** A party reinstated after an adverse trigger has a `passed` verification recorded after the most recent `suspend`, with a corresponding `customer-onboarding.review-cleared` Audit Trail event carrying the `verification_id`. *Rests on:* Party Identity Invariant 4 (the atom rejects `reinstate` without a `passed` verification since the most recent suspend) plus [Clear Review]'s ordering (step 4 records the fresh `passed` verification before step 6 reinstates, and step 5 records the clearance carrying the `verification_id`). The composition cannot reinstate without fresh recorded evidence because the constituent forbids it and the composition records it. (The `customer-onboarding.party-reinstated` event recorded at [Clear Review] step 7 is *supplementary* attestation of the transition; Invariant 4 rests on the `customer-onboarding.review-cleared` event of step 5, which lands before the reinstate — so a lost `customer-onboarding.party-reinstated` event is an orphan to recover per the partial-failure edge case, not an Invariant 4 violation.)

- **Invariant 5 — Post-closure retention floor.** A `Closed` party record cannot be purged before its post-closure Retention Window record's `retention_until` elapses. *Rests on:* Party Identity Invariant 1 (party records are never deleted by the atom outright) plus Retention Window Invariant 7 (no early purge — purge before `retention_until` is rejected). The post-closure retention placed at [Close Party] step 5 governs when archive/scrub becomes permitted; `case_to_retentions[case_id].post_closure_retention_id` is the records-alone evidence that the placement occurred.

- **Invariant 6 — Monitoring continuity for active parties.** Every party in `Verified` state governed by this composition with an active case has an open `case_to_monitoring` entry. A `Verified`, active party with no `case_to_monitoring` entry is a structural finding, not a valid state. *Rests on:* [Initiate Onboarding] populating `case_to_monitoring` for every case it opens, and no this composition action removing the entry while the case is active ([Close Party] marks the case inactive but retains the entry as the record that monitoring was in force).

- **Invariant 7 — Open-trigger/suspension correspondence.** For a case under this composition's exclusive ownership of its party's verification transitions, `case_to_open_triggers[case_id]` is non-empty if and only if the party is in `Suspended` state by an unresolved adverse trigger (the correspondence holds under this composition's serialization obligation — Edge cases — *Concurrency*). *Rests on:* the adverse path of [Trigger Monitoring Review] adds a `trigger_id` to the set exactly when it suspends (or re-triggers an already-suspended party), the periodic path never touches the set, and [Clear Review] empties the set exactly when it records the clearance and reinstates; no other this composition action mutates the set. The correspondence is what makes [Clear Review]'s [No Open Trigger] rejection a faithful "nothing to clear" signal and makes the open-trigger set a records-checkable index of triggers not yet cleared. A single [Clear Review] resolves *all* open triggers for the case at once; the `closed_triggers` set on the `customer-onboarding.review-cleared` event records exactly which triggers were swept, so a multi-trigger sweep (a second adverse trigger raised before the first was investigated) remains records-auditable even though one clearance closed them together — a deployment requiring per-trigger investigation before clearance wires that above the composition layer.

Verification-gates-activity (Invariant 1) plus verification audit coverage (Invariant 2) together give the *substantiated-access* property — every party that can reach activity was verified through an attributed, tamper-evident process. Adverse-trigger ordering (Invariant 3) plus reinstatement-reflects-fresh-evidence (Invariant 4) give the *defensible-monitoring* property — every suspension is caused-in-the-records and every reinstatement is evidenced-in-the-records. Post-closure retention floor (Invariant 5) plus monitoring continuity (Invariant 6) close the relationship lifecycle: the record survives its mandated post-closure period and was monitored throughout its active life. Invariant 7 (open-trigger/suspension correspondence) keeps the composition's adverse-investigation index faithful to the constituent's `Suspended` state, so an auditor reading the open-trigger set sees exactly the unresolved investigations.

---

## Examples

### Walkthrough — retail bank customer onboarding under BSA/AML (direct-enrollment path)

A bank uses this composition to onboard a retail customer who has no prior system identity. Configuration: `active_relationship_policy_ref = bsa_active_cdd`, `post_closure_retention_policy_ref = bsa_5yr_post_closure` (31 CFR §1020.220 five-year floor), `audit_trail_retention_policy = bsa_audit_9yr`, `adverse_trigger_types = {sanctions-match, pep-status-change, adverse-media}`.

1. **Initiate (direct path).** `initiate_onboarding(party_id=absent, enrollment_fields={name:"Amara Osei", date_of_birth:"1981-03-14", document_type:"passport", document_ref:"doc_p901", enrolling_actor_ref:"officer_r3"}, actor_ref="officer_r3", credential=<officer_r3>, retention_policy_ref="bsa_active_cdd") → case_id = case_5501`. Internally: `Party Identity.enroll` → `party_9017` in `Unverified`; `Retention Window.place_under_retention(party_9017, bsa_active_cdd)` → `ret_active_9017`; `case_to_monitoring[case_5501] = {party_9017, opened_at, next_review_due}`; Audit Trail records `customer-onboarding.initiated` with `enrollment_path = direct`.

2. **Gate check before verification.** An account-opening system calls `activity_permitted(party_9017) → rejected(not-verified(Unverified))`. The account is not opened. The gate fired correctly — the party is not yet verified.

3. **Verification.** The verification workflow runs automated OCR on the passport and calls `record_verification(case_5501, verifying_actor_ref="system_verification_auto", method="automated-ocr", verification_result="passed", evidence_ref="evidence_ocr_442", credential=<system_verification_auto>) → recorded`. Internally: `Party Identity.verify(party_9017, ..., passed, ...)` → `{verification_id: verif_1101, state_change_id: sc_4401}` (the `Unverified → Verified` transition); Audit Trail records `customer-onboarding.verification-recorded` carrying `verif_1101` and `sc_4401`; `next_review_due` advances.

4. **Gate check after verification.** `activity_permitted(party_9017) → permitted`. The account-opening system proceeds; `account_a883` is opened and linked to `party_9017`. Invariant 1 fired; Invariant 2's audit event is in the records.

5. **Periodic review.** A year later the external scheduler fires `trigger_monitoring_review(case_5501, trigger_type="periodic-review-due", trigger_ref="annual-review-2027", actor_ref="system_monitor", credential=<system_monitor>) → recorded`. Internally: Audit Trail records `customer-onboarding.monitoring-triggered`; no state transition; `next_review_due` advances.

6. **Closure.** Ten years later: `close_party(case_5501, closing_actor_ref="officer_r3", reason="account-closed-customer-request", credential=<officer_r3>) → closed`. Internally: `Party Identity.close(party_9017, ...)` → `Closed`; `Retention Window.place_under_retention(party_9017, bsa_5yr_post_closure)` → `ret_postclose_9017` (the second retention placement — the five-year floor); Audit Trail records `customer-onboarding.party-closed` carrying `ret_postclose_9017`; `party_to_case[party_9017].active = false`.

7. **Gate check after closure.** `activity_permitted(party_9017) → rejected(not-verified(Closed))`. No new activity proceeds for the closed party.

### External-Onboarding-admitted path — upstream enrollment

A broker-dealer admits a counterparty through External Onboarding, which enrolls the party in `Unverified` state and registers a credential. This composition then runs the verification gate downstream:

1. `initiate_onboarding(party_id="party_4421", enrollment_fields=absent, actor_ref="onboard_svc", credential=<onboard_svc>, retention_policy_ref="bsa_active_cdd") → case_id = case_6602`. The `party_id` is present, so this composition skips enrollment: it confirms `party_4421` is known to Party Identity, places the active-relationship retention, opens the monitoring schedule, and records `customer-onboarding.initiated` with `enrollment_path = external-onboarding`. The verification workflow then proceeds identically to the direct path via [Record Verification].

### Adverse trigger and clearance — sanctions match

An existing `Verified` party, `party_7732` (case `case_7700`), triggers a sanctions screening alert:

1. **Adverse trigger.** `trigger_monitoring_review(case_7700, trigger_type="sanctions-match", trigger_ref="ofac-sdn-12894", actor_ref="compliance_mgr_01", credential=<compliance_mgr_01>) → recorded`. Internally: Audit Trail records `customer-onboarding.monitoring-triggered` **first** (step 3); then `Party Identity.suspend(party_7732, ...)` → `Suspended` with `state_change_id = sc_7701`; then Audit Trail records `customer-onboarding.party-suspended` carrying `sc_7701`; the trigger is added to `case_to_open_triggers[case_7700]`. Invariant 3 holds: the trigger event is ordered before the suspension event.

2. **Gate check during investigation.** `activity_permitted(party_7732) → rejected(not-verified(Suspended))`. Downstream transaction systems freeze new activity.

3. **Clearance.** Investigation confirms the match was a false positive. `clear_review(case_7700, verifying_actor_ref="compliance_analyst_02", method="database-check", evidence_ref="evidence_db_clearance_882", actor_ref="compliance_mgr_01", credential=<compliance_mgr_01>, reason="ofac-match-resolved-different-individual") → cleared`. Internally: `Party Identity.verify(party_7732, ..., passed, evidence_db_clearance_882)` → `{verif_3901, state_change_id absent}` (verify against a Suspended party records the event but does not change state); Audit Trail records `customer-onboarding.review-cleared` carrying `verif_3901`; `Party Identity.reinstate(party_7732, ..., reason)` → `sc_7702` (the fresh `passed` verification satisfies Party Identity's precondition); Audit Trail records `customer-onboarding.party-reinstated` carrying `sc_7702`; the open trigger is cleared from `case_to_open_triggers`; `next_review_due` advances. Invariant 4 holds: the reinstatement has a `passed` verification recorded after the most recent suspend, with the `customer-onboarding.review-cleared` event carrying its `verification_id`.

4. **Gate check after clearance.** `activity_permitted(party_7732) → permitted`. Transaction systems resume.

### Rejection path — clearing a review with no open trigger

A compliance officer mistakenly calls `clear_review(case_5501, ...)` for a party with no open adverse trigger: [Clear Review] step 2 finds `case_to_open_triggers[case_5501]` empty → `rejected(no-open-trigger)`. No verification is recorded, no reinstatement is attempted; there was nothing to clear.

### Rejection path — periodic trigger against an unknown case

The scheduler fires a trigger against a case that does not exist: `trigger_monitoring_review("case_bogus", ...) → rejected(not-known)` at step 1. No audit event is recorded — the case is unknown, so there is no party to attribute a trigger to.

### Regulated adversarial scenarios

**Regulator audit — "show me that every active customer was verified before regulated activity."** A FATF/BSA examiner queries the Audit Trail and the activity records. For every party with an activity record (e.g., an opened account linked to `party_id`), the examiner confirms a `customer-onboarding.verification-recorded` Audit Trail event with a `state_change_id` (the `Unverified → Verified` transition) exists, that `AuditTrail.verify_record` returns `verified` for it, and that its event timestamp predates the first activity record. Invariant 1 (verification gates activity) is the structural guarantee that no activity path other than `activity_permitted → permitted` exists; Invariant 2 (verification audit coverage) is the guarantee that the verifying transition is in the records, attributed and tamper-evident. The examiner consults no source code or runbooks; every party's verification chain is reconstructable from the records. A party with an activity record but no predating `customer-onboarding.verification-recorded` event with a `state_change_id` is a conformance failure.

**Disputed onboarding — party claims they were never properly verified.** A party's counsel challenges the bank's claim that their identity was verified before their account was opened. The investigator retrieves the `customer-onboarding.verification-recorded` events for the party's `case_id`; each carries `verification_id`, `result`, and (for the transition) `state_change_id`. The investigator then retrieves the Party Identity verification event for each `verification_id`, which names `verifying_actor_ref`, `method`, `evidence_ref`, and `verified_at`. Party Identity Invariant 5 (verification events immutable) and Invariant 6 (append-only in insertion order) establish that no verification event was altered or back-inserted; the Audit Trail seal (Tamper Evidence, reached transitively) establishes that the `customer-onboarding.verification-recorded` event itself was not altered. The `evidence_ref` points to the document record that supported the verification — the dispute is resolved by producing that evidence alongside the immutable, sealed verification chain. Invariant 2 plus Party Identity Invariants 5–6 are the rebuttal.

**Breach or incident forensics — which parties were Verified during the compromise window, and were any verifications altered.** An incident investigator is given a window (e.g., 2027-03-01 through 2027-03-15) and must reconstruct which parties were in `Verified` state during it and whether any verification chain was tampered with. The investigator replays each case's `customer-onboarding.verification-recorded`, `customer-onboarding.monitoring-triggered`, `customer-onboarding.party-suspended`, `customer-onboarding.trigger-on-suspended-party` (a trigger raised against an already-suspended party — no transition, but part of the monitoring history), and `customer-onboarding.party-reinstated` events in Event Log insertion order (reached transitively through Audit Trail) to determine each party's state at the window's bounds, then runs `AuditTrail.verify_record` against representative events in each seal's coverage to bound any tampering window. Invariant 3 (adverse trigger precedes state transition) is load-bearing here: the investigator can confirm that every suspension in the window has a precipitating trigger ordered ahead of it; a suspension with no precipitating trigger — or a trigger inserted *after* its suspension — is itself a finding (and the append-only, sealed log forecloses an attacker silently reordering them). Invariant 6 (monitoring continuity) lets the investigator confirm that every `Verified`, active party in the window had an open monitoring entry; a `Verified` party with no monitoring entry during the window is a structural anomaly the investigator flags. Where the window has legal force as wall-time (rather than event-index) bounds, a Trusted Timestamping composition supplies the time-anchor; absent it, the reconstruction is event-index-authoritative. The newest events — those in the Audit Trail's unsealed tail — carry Event Log per-event immutability but become seal-verifiable (`AuditTrail.verify_record → verified`) only after the next seal cadence; until then a tail event returns `failed-verification(unsealed)`, so the integrity bound the investigator can assert on the most recent events is the substrate's unsealed-tail policy (a tighter `seal_cadence` narrows it).

---

## Generation acceptance

A derived implementation of this composition is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the Party Identity, Retention Window, and Audit Trail substrate stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

These checks are answerable by reading the composition's records (including the Audit Trail substrate):

1. **Verification-before-activity.** For every party with a regulated-activity record, there exists a `customer-onboarding.verification-recorded` Audit Trail event carrying a non-absent `state_change_id`, whose event timestamp predates the activity record, and for which `AuditTrail.verify_record` returns `verified`. Invariant 1 and Invariant 2 are the contract. A party with activity but no predating, verified `customer-onboarding.verification-recorded` event with a `state_change_id` is a conformance failure. (This check assumes this composition's exclusive ownership of verification transitions on its Party Identity instance — see Edge cases — *Exclusive verification ownership of the Party Identity instance*.)

2. **Every Verified party is substantiated.** For every party currently in `Verified` state, there exists a `passed` verification event in Party Identity recorded after the party's most recent `suspend` (or after `enroll` if never suspended). Party Identity Invariant 4 makes this set structurally non-empty; the composition's [Record Verification] and [Clear Review] are the only this composition paths that reach `Verified`, and both record the verification. The auditor sees the structural guarantee, not a procedural claim.

3. **Adverse-trigger ordering.** For every `customer-onboarding.party-suspended` (real transition) or `customer-onboarding.trigger-on-suspended-party` (idempotent re-trigger) Audit Trail event, there exists a `customer-onboarding.monitoring-triggered` event with the same `trigger_id` (and `case_id`) ordered before it in the Event Log. Such an outcome event with no precipitating `customer-onboarding.monitoring-triggered` event ordered ahead of it is a conformance failure. Invariant 3 is the contract.

4. **Post-closure retention (existence).** For every party in `Closed` state, the Retention Window store contains a post-closure retention record (the `post_closure_retention_id` in `case_to_retentions`) in `Retained` state, and no `Closed` party's record is purged before that record's `retention_until` elapses (Retention Window Invariant 7). Invariant 5 is the contract. (Whether the record's `retention_until` *meets the applicable post-closure regulatory minimum* is an externally-clearable check — see below — because it depends on the deployment's configured `post_closure_retention_policy_ref`, not on this composition's records.)

5. **Monitoring continuity.** For every party currently in `Verified` state with an active case, there exists an open `case_to_monitoring` entry. Invariant 6 is the contract; a `Verified`, active party with no monitoring entry is a conformance failure.

6. **Constituent Generation acceptance bars.** Verify each constituent's own Generation acceptance bar over its respective store: Party Identity's six checks, Retention Window's six checks, Audit Trail's six checks. The composition's invariants depend on the correctness of the constituents' invariants.

### Externally-clearable checks

These audit questions arise around this composition but cannot be answered from the composition's records alone:

- **Whether the verification method was adequate for the party's risk tier.** The composition records the `method` each verification used; it does not verify that the method was adequate for the party's risk classification (enhanced due diligence versus standard CDD). Risk scoring and EDD orchestration are Party Identity's named composing concept, out of scope here; verification of method-adequacy requires the deployment's risk-tiering policy.
- **Whether the sanctions/PEP screening lookup queried a current list.** The composition records the `trigger_result` (via `trigger_ref`) of a screening, but it cannot prove the external sanctions or PEP list the screening queried was live and current at screening time. That assurance requires the screening provider's own evidence; the composition records the trigger, not the freshness of the list behind it.
- **Whether the actor who recorded a verification was authorized to do so.** The composition records `verifying_actor_ref` and binds it cryptographically via the Audit Trail's Actor Identity attestation. It does not verify that the actor was *authorized under the deployment's organizational policy* to record verifications. That requires a Permissions instance scoped to verification authority — a composing peer, not a constituent of this composition.
- **Whether downstream non-obligatory processing had a lawful basis.** This composition's processing basis is GDPR Article 6(1)(c) legal obligation; the composition does not record or adjudicate the lawful basis for any *non-obligatory* downstream processing (marketing, profiling, data sharing beyond the Customer Due Diligence obligation). That belongs to Propagate Consent Revocation Downstream, a composing peer.
- **Whether the post-closure retention duration meets the regulatory floor.** This composition records that a post-closure retention exists and its `retention_until`, but verifying that the configured `post_closure_retention_policy_ref` encodes at least the applicable post-closure minimum (the 31 CFR §1020.220 five-year floor under BSA/AML) requires the deployment's Retention Window policy registry and knowledge of the regulatory floor — a Configuration deployment obligation, not a records-alone fact (the existence of the Retained record is records-alone clearable per check 4; its regulatory sufficiency is not).

---

## Edge cases and explicit non-goals

- **Cross-store consistency under partial failure.** Several this composition actions write to two or three stores in sequence; a failure between writes leaves partial state, and the consequence differs by action. The most consequential gap is in [Record Verification]: step 3 drives a Party Identity state transition, then step 4 writes the Audit Trail event; if step 4 fails, the verification exists in Party Identity but is **unattested** — a `Verified` party with no `customer-onboarding.verification-recorded` event, violating Invariant 2. Party Identity's verification events are immutable once committed, so synchronous rollback is not available. The implementation must (a) retry the failed `record_action` until it lands, and (b) immediately surface the orphan (a verification with no corresponding Audit Trail event) to the compliance dashboard as a high-priority finding, with the compensating Audit Trail entry, once it lands, carrying a `cascade_recovery = true` marker so an auditor can distinguish a clean verification from a recovered one. The analogous gaps in [Initiate Onboarding] (enrolled-and-retained party with no `customer-onboarding.initiated`), [Trigger Monitoring Review] (Suspended party with no `customer-onboarding.party-suspended` — though the precipitating `customer-onboarding.monitoring-triggered` already landed, so the suspension is not *uncaused*), [Clear Review] (reinstated party with no `customer-onboarding.party-reinstated`), and [Close Party] (Closed party with no post-closure retention, or with no `customer-onboarding.party-closed`) are each handled the same way: retry the failed write, surface the orphan, mark the compensating record. The ordering disciplines built into the actions (record-the-trigger-first in [Trigger Monitoring Review]; record-the-clearance-before-reinstate in [Clear Review]; audit-before-the-irreversible-step where possible) minimize the window in which a state change exists without its caused-in-the-records audit event. Deployments under BSA/AML exposure must treat any such orphan as a hard alerting condition. This mirrors Defensible Retention's treatment of its `purge_record` atomicity hole.

- **Two Retention Window instances and two placements over one record.** There are two distinct Retention Window concepts, and conflating them is a reference ambiguity. (1) The **party-record Retention Window instance** named in *Composes* holds **two placements** over the same `party_id`: the active-relationship retention placed at [Initiate Onboarding] (step 4) and the post-closure retention placed at [Close Party] (step 5). These are two Retention Window *records* with distinct `retention_id`s under one Retention Window *instance*; Retention Window's edge case on multiple simultaneous retentions for the same `record_ref` is the constituent guarantee that makes this valid, and purge eligibility for the party record is governed by the *longer* of the two (the post-closure floor outlasts the active-relationship retention). (2) The **audit-event Retention Window instance** lives *inside the Audit Trail substrate* and governs the lifetime of the onboarding audit *events* (`customer-onboarding.initiated`, `customer-onboarding.verification-recorded`, etc.), configured via `audit_trail_retention_policy`. The two instances are separate and their policies differ — audit events should persist at least as long as the party record they describe, and often longer.

- **Monitoring scheduler boundary.** This composition holds the schedule *state* (`next_review_due` in `case_to_monitoring`) but is not the scheduling *engine*. An external scheduler reads `next_review_due` (and the case's `active` flag) and calls [Trigger Monitoring Review] when a review is due; this composition does not set timers, does not fire on a clock, and does not own the cadence policy. A deployment's scheduling engine is the composing surface that drives periodic reviews; this composition records each trigger and advances the schedule when one fires.

- **Beneficial ownership / ownership graph.** Each beneficial owner of a legal-entity customer is a Party Identity record in their own right, and this composition verifies each independently as its own onboarding case. This composition does **not** model the ownership graph — the relationship between a beneficial owner and the entity (ownership percentage, control type) under FinCEN Beneficial Ownership Rule 31 CFR §1010.230. That is handled by an Ownership Structure / Beneficial Owner composing pattern *(forthcoming)*, which composes multiple Party Identity records into an ownership structure; this composition is one of its constituents, not its replacement.

- **Duplicate Prevention as optional enrichment.** For deployments that need at-most-once semantics on verification jobs under retry (e.g., a screening pipeline that may re-deliver the same verification result), a Duplicate Prevention atom can be wired as an **optional enrichment** in front of [Record Verification] or [Trigger Monitoring Review] to deduplicate retried jobs. It is **not a constituent** of this composition. (This is the Idempotent Reservation demotion recorded in Lineage Pass 2: Party Identity's `verify` is append-only and idempotent-safe at the *state* level — a re-applied `passed` verification against an already-`Verified` party records a redundant event but drives no spurious transition — so this composition does not require provisional-commitment semantics; deployments that additionally want job-level deduplication compose Duplicate Prevention.)

- **Activity systems reading Party Identity directly.** Activity systems (account-opening, transaction, service-provisioning) must call [Activity Permitted] and must **not** read Party Identity's state directly. The prohibition is structural, not stylistic: if each activity system reads Party Identity and applies its own `Verified` check, the gate is re-implemented per system, and the first system that forgets the check, reads a stale state, or applies a subtly different state predicate breaks the BSA/AML before-activity guarantee silently and per-system. Centralizing the gate at [Activity Permitted] makes the guarantee exist exactly once. A deployment in which an activity system reads Party Identity directly is a composition-bypass finding (Invariant 1's deployment obligation), remediated by routing the system through the gate query.

- **Exclusive verification ownership of the Party Identity instance.** This composition assumes it is the *only* writer of verification and state transitions on its single Party Identity instance. [Activity Permitted] reads Party Identity state directly, so a party driven to `Verified` by a writer outside this composition on a shared instance would pass the gate with no `customer-onboarding.verification-recorded` event — breaking Invariant 2's coverage and Generation acceptance check 1. A deployment that shares the Party Identity instance with another verification writer is a composition-bypass finding, the write-side analogue of an activity system bypassing the gate; this composition requires exclusive ownership of the instance's verification transitions.

- **Risk scoring and enhanced due diligence (EDD).** Whether a party requires EDD based on risk factors (country of origin, transaction volume, PEP status) — and the resulting choice of verification method and re-verification cadence — is out of scope for this composition. This composition records the verification lifecycle and the monitoring schedule; risk classification and EDD orchestration belong to **[Party Identity](../atoms/party-identity.md)** as the composing peer (Party Identity names risk scoring and EDD as its own out-of-scope concept). This composition consumes the verification results; it does not decide the rigor required to produce them.

- **The verification workflow itself.** What happens *during* verification — document OCR, biometric check, sanctions-database query, adverse-media search — is not modeled by this composition. The composing verification workflow produces the `verification_result`, `method`, and `evidence_ref` that [Record Verification] and [Clear Review] record. This composition is the lifecycle and gate; the workflow is upstream.

- **Asynchronous verification.** [Record Verification] takes `verification_result` at call time; this composition does not model in-progress or pending verification states (the party simply remains `Unverified` until a `passed` result is recorded). The composing workflow owns the coordination of asynchronous determination, exactly as Party Identity's own *Asynchronous verification workflows* edge case names.

- **What "Closed" means for open commitments.** [Close Party] closes the party and gates new activity, but does not automatically unwind existing open accounts, positions, or contracts. The composing system owns the policy for unwinding open commitments against a closed party; this composition's contract is that [Activity Permitted] returns `rejected(not-verified(Closed))` after closure, signaling that no new activity may proceed.

- **Concurrency.** Concurrent state-changing actions for the same `case_id` / `party_id` (e.g., a [Trigger Monitoring Review] adverse path racing a [Clear Review], or two [Close Party] calls) resolve under the host environment's serialization guarantees; Party Identity's named edge case on concurrent state transitions governs the constituent layer (the first transition wins, the second observes the updated state and is rejected). This composition's rejection mappings (`not-active`, `not-verified(state)`, [Verification Failed]) surface the loser's outcome. Deployments must serialize state-changing this composition actions on a given `party_id`. [Activity Permitted] is read-only and excluded from that serialization obligation; its two reads (`party_to_case`, then the live Party Identity state) need not be atomic, because the Party Identity state read is authoritative and any skew fails safe — a stale or torn read can only yield a spurious `not-known` or a conservative `not-verified(state)`, never a false `permitted`.

- **Clock semantics.** `now` — used to stamp `opened_at` and the audit-event timestamps (`triggered_at`, `suspended_at` / `recorded_at`, `cleared_at`, `reinstated_at`, `closed_at`) and to compute the derived deadline [Next Review Due] — is the injected `clock_t` supplied at the composition's single I/O seam (see *Logic confinement*); no action reads a wall clock internally and no signature carries a `now` parameter. Clock quality — honesty, monotonicity, skew relative to the constituents' own seams — remains a deployment matter. Where review deadlines or onboarding timestamps have legal force (FATF / BSA/AML require recording when CDD was performed), the deployment must inject a reading sourced from a trustworthy clock; a composed Trusted Timestamping pattern supplies the verifiable time-anchor and binds Event Log insertion order to wall-time. Absent it, insertion order is authoritative and timestamps are advisory — which is also why Invariant 3's *ordered before* claim reads the Event Log's insertion order rather than a timestamp difference: a trigger event and the suspension it precipitates are stamped from the **same** injected `now` and are expected to be *identical*, not merely adjacent, so a divergence between them is a conformance failure (an implementation that read a clock twice instead of sharing the injected reading), not clock granularity. Ids are likewise seam-allocated rather than generated in-transition: `case_id` and `trigger_id` are the injected `id_t`, and `party_id` / `verification_id` / `state_change_id` / `retention_id` / `event_id` are minted at the constituents' own seams. The residual risk under injection is a deployment that injects a dishonest `now`, not an internal race.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are: the six actions it exposes — the case intake ([Initiate Onboarding]), the verification record ([Record Verification]), the monitoring trigger ([Trigger Monitoring Review]), the adverse-review clearance ([Clear Review]), the closure ([Close Party]), and the read-only gate ([Activity Permitted]); the [Next Review Due] monitoring-schedule datum; and its own rejections — the load-bearing gate rejection ([Not Verified]), the clearance guard ([No Open Trigger]), the enroll-wrapper ([Enrollment Failed]), the external-path lookup ([Party Not Known]), and the reinstate failure ([Verification Failed]). Its load-bearing guarantee — verification-gates-activity: a party reaches regulated activity only through an attributed, tamper-evident Verified state, and [Activity Permitted] is the single gate every activity system consumes (Invariants 1–2) — is a structural property, not a datum. Its emergent state (`case_to_monitoring`, `party_to_case`, `case_to_retentions`, `case_to_open_triggers`) indexes the three constituent stores into one Customer-Due-Diligence surface, left as backticked tokens; the party lifecycle states (`Unverified` → `Verified` → `Suspended` → `Closed`) are the Party Identity constituent's, not carded here. The `customer-onboarding.*` audit event types (`customer-onboarding.initiated`, `customer-onboarding.verification-recorded`, `customer-onboarding.monitoring-triggered`, `customer-onboarding.party-suspended`, `customer-onboarding.review-cleared`, `customer-onboarding.party-reinstated`, `customer-onboarding.party-closed`) and the deployment trigger vocabulary (`periodic-review-due`, `sanctions-match`, `pep-status-change`, `adverse-media`) stay backticked as wire values, as do the constituent calls and their outcomes — Party Identity's `enroll` / `verify` / `suspend` / `reinstate` / `close`, Retention Window's `place_under_retention`, Audit Trail's `record_action` — the relayed constituent tokens (`party_id`, `case_id`, `trigger_id`, `retention_id`, `verification_id`, `state_change_id`, `actor_ref`, `credential`, `enrollment_path`, `verification_result`), the generic/relayed rejections (`invalid-request`, `recording-failure`, `not-known`, `already-closed`, `not-active`), the deployment configuration knobs (`active_relationship_policy_ref`, `post_closure_retention_policy_ref`, `audit_trail_retention_policy`, `monitoring_interval`, `adverse_trigger_types`), and concrete example ids. Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Initiate Onboarding

The composition's intake action: open a Customer Due Diligence case for a party — enrolling it directly, or admitting one External Onboarding already enrolled (the `enrollment_path` records which) — placing the active-relationship retention, opening the monitoring schedule, and auditing the case (`customer-onboarding.initiated`). Returns the `case_id`.

Kind: Operation

#### Record Verification

The composition action that records a verification result against a case's party (driving the `Unverified → Verified` transition on a passed first verification) and audits it (`customer-onboarding.verification-recorded`) carrying both the verification and state-change identifiers — the attribution-and-tamper-evidence half of verification-gates-activity (Invariant 2). Advances [Next Review Due] on a state-changing pass.

Kind: Operation

#### Trigger Monitoring Review

The audit-first entry point an external monitoring or screening system calls: it records the trigger *before* any resulting transition (Invariant 3), then — for an adverse trigger — suspends the party, or — for a `periodic-review-due` trigger — advances [Next Review Due]. No suspension exists in the records without its precipitating trigger ordered ahead of it.

Kind: Operation

#### Clear Review

The single emergent action that clears an adverse-trigger investigation and returns the party to Verified — wrapping a fresh `passed` verification, `Party Identity.reinstate`, and two audit records into one act. Requires an open trigger ([No Open Trigger] otherwise); closes every open trigger for the case in one clearance.

Kind: Operation

#### Close Party

The composition action that ends the relationship and places the *post-closure* retention — the second Retention Window placement, setting the BSA/AML five-year-after-relationship-end floor — then audits the closure (`customer-onboarding.party-closed`).

Kind: Operation

#### Activity Permitted

The read-only verification-gates-activity query every activity system consumes (rather than reading Party Identity directly): returns `permitted` only for a party this composition itself initiated and drove to Verified, else [Not Verified] naming the actual state, or `not-known`. Produces no audit event — it changes no state.

Kind: Operation

#### Next Review Due

The monitoring-schedule datum in each `case_to_monitoring` entry: the timestamp by which the party's next periodic review is due, advanced by `monitoring_interval` on a state-changing verification pass, a periodic-review trigger, or a review clearance. It deliberately does not roll forward while a party is Suspended. A Verified party with no monitoring entry is a structural finding (Invariant 6).

Kind:      Field
Field of:  the monitoring-schedule entry
Role:      the next-periodic-review deadline
Projects:  next_review_due

#### Not Verified

The load-bearing [Activity Permitted] gate rejection — parameterized by the party's actual state (`Unverified`, `Suspended`, or `Closed`) — returned when the party is not in Verified state, so an activity system can distinguish *not yet verified* from *suspended* from *closed*. Also the `not-verified(state)` outcome of [Trigger Monitoring Review]'s suspend on a never-verified party.

Kind:      Member
Member of: the gate rejection
Role:      Rejection
Projects:  not-verified

#### No Open Trigger

The [Clear Review] rejection when the case has no open adverse trigger — there is nothing to clear.

Kind:      Member
Member of: the clear-review rejection
Role:      Rejection
Projects:  no-open-trigger

#### Enrollment Failed

The [Initiate Onboarding] rejection wrapping a Party Identity `enroll` failure on the direct-enrollment branch — surfaced under a composition-layer name (rather than flattened to `recording-failure`) precisely because it occurs before any case or retention exists, so there is no orphan to recover.

Kind:      Member
Member of: the initiate rejection
Role:      Rejection
Projects:  enrollment-failed

#### Party Not Known

The [Initiate Onboarding] rejection on the External-Onboarding-admitted branch when the supplied `party_id` references no party known to the Party Identity instance.

Kind:      Member
Member of: the initiate rejection
Role:      Rejection
Projects:  party-not-known

#### Verification Failed

The [Clear Review] rejection when `Party Identity.reinstate` cannot proceed — the party's reinstatement precondition is unmet (a concurrent suspend re-armed it, or the party was not Suspended) — a defense-in-depth code reachable only when the host fails the per-case serialization obligation.

Kind:      Member
Member of: the clear-review rejection
Role:      Rejection
Projects:  verification-failed

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Initiate Onboarding]: #initiate-onboarding
[Record Verification]: #record-verification
[Trigger Monitoring Review]: #trigger-monitoring-review
[Clear Review]: #clear-review
[Close Party]: #close-party
[Activity Permitted]: #activity-permitted
[Next Review Due]: #next-review-due
[Not Verified]: #not-verified
[No Open Trigger]: #no-open-trigger
[Enrollment Failed]: #enrollment-failed
[Party Not Known]: #party-not-known
[Verification Failed]: #verification-failed

---

## Standards references

- **FATF Recommendations 10–12** — R.10 (Customer Due Diligence) gathers all the CDD limbs: identify and verify the customer using reliable independent sources, identify and verify beneficial owners, and conduct ongoing due diligence/monitoring of the business relationship. R.11 (record-keeping) requires CDD and transaction records be kept at least five years. R.12 extends enhanced CDD to politically-exposed persons. This composition's [Initiate Onboarding] → [Record Verification] → [Trigger Monitoring Review] arc is the structural form of R.10's identify–verify–monitor obligation; the post-closure retention placement carries R.11's record-keeping floor; the verification-gates-activity decision is the before-relationship-activity limb.
- **BSA/AML — 31 CFR §1020.220 (Customer Identification Program)** — minimum identity attributes, verification, and **record retention for five years after the business relationship ends**. This composition's [Close Party] post-closure retention placement (the second Retention Window operation) is the structural form of the five-year-post-closure floor (Invariant 5).
- **FinCEN Beneficial Ownership Rule — 31 CFR §1010.230** — legal-entity customers must identify and verify beneficial owners owning ≥25% and a single control person. Each beneficial owner is a Party Identity record verified through its own onboarding case; the ≥25% relationship graph belongs to the Ownership Structure composing pattern, not this composition.
- **EU 5th Anti-Money Laundering Directive (AMLD5)** — enhanced CDD requirements, beneficial-ownership registries, and ongoing-monitoring obligations; alignment with FATF. This composition is the onboarding-and-monitoring surface AMLD5 deployments build on.
- **GDPR Article 6(1)(c) — legal obligation as processing basis.** Customer Due Diligence processing rests on Article 6(1)(c) (compliance with a legal obligation), **not** Article 6(1)(a) (consent). The distinction is load-bearing: the customer cannot revoke the basis for Customer Due Diligence processing while the AML obligation stands, so Consent is not a constituent of this composition (see Lineage Pass 2 finding 2). Consent governs *non-obligatory* downstream processing, which is handled by Propagate Consent Revocation Downstream.
- **HIPAA (Health Insurance Portability and Accountability Act) §164.312(a)(1) (Access control)** — in covered healthcare deployments where a verified party identity is the precondition to granting access to protected health information, this composition's verification-gates-activity decision is the structural form of the access-granting event: access is provisioned only through a substantiated, audited verification. (this composition is anchored in the BSA/AML/FATF cluster; the HIPAA mapping applies where a covered entity uses verification-based provisioning.)

The three constituents carry their own deep standards inheritance — see each constituent's Standards references.

---

## Status

`grounded on Final Critique 4 — 2026-06-03` (formal layer landed 2026-06-03 — TLA+ model `customer-onboarding.tla` + buggy twin verified; see Lineage §Formal model. Cleared `grounded (English) — formal layer pending`; full prose round was `grounded on Final Critique 4`.) — 2026-06-03. Three-pass baseline (3×3) plus the AI-conducted Final Critique and Phase-4 Opus clearance gate are complete; foundational findings surfaced and closed in each baseline round, and the Final Critique gate returned zero foundational findings (see Lineage notes — *Three-pass baseline* and *Final Critique*). Composition logic specified across all three constituents (Party Identity + Retention Window + Audit Trail substrate); emergent state (`case_to_monitoring`, `party_to_case`, `case_to_retentions`, `case_to_open_triggers`) named with population and cleanup discipline; six actions wired (`initiate_onboarding` with both enrollment branches, `record_verification`, `trigger_monitoring_review` with audit-first ordering, the emergent `clear_review`, `close_party` with the second retention placement, and the read-only `activity_permitted` gate) with fully-named rejection taxonomies; the load-bearing verification-gates-activity decision defended in four parts; seven composition-level invariants stated; walkthrough plus External-Onboarding-admitted path, adverse-trigger-and-clearance run, and two rejection-path examples; three regulated adversarial scenarios; Generation acceptance split between Audit-Trail-traversal-clearable and externally-clearable checks; thirteen edge cases including cross-store consistency, the two-Retention-Window-instances distinction, the scheduler boundary, beneficial ownership, the Duplicate Prevention enrichment demotion, the activity-systems-must-use-the-gate prohibition, and exclusive verification ownership. The AI-conducted Final Critique (Phase-4 Opus clearance gate, Happy Torvalds X2) returned zero foundational findings; its refining findings were closed in-pattern. `grounded on Final Critique 4` (2026-06-03).

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Regulated composition. The two regulated-overlay conventions — *Regulated adversarial scenarios* and *Generation acceptance* (split per the regulated-composition convention) — are **inherited from the methodology directly** ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft, not re-derived from predecessor patterns. Defensible Retention is the primary structural reference for the substrate-composition shape, the two-distinct-Retention-Window-instances distinction, the cross-store-consistency-under-partial-failure treatment, and the Generation acceptance split. External Onboarding is the upstream-adjacent reference for the audit-first step discipline and the Party Identity + Audit Trail shape.

**Structural milestone.** This composition retires the `*(forthcoming)*` link in [`atoms/party-identity.md`](../atoms/party-identity.md)'s Composition notes — the entry naming "Customer Onboarding" as the primary composition that gates regulated activity on the party being Verified, orchestrates the verification workflow, handles ongoing monitoring via periodic `verify` calls, and composes Actor Identity (transitively, through Audit Trail) for attestation and Retention Window for record lifetime. When this composition grounds, that forthcoming-link is resolved.

The following two findings are recorded against Pass 2 (EOS conceptual independence) of the forthcoming baseline; they are the constituent-set decisions made before drafting and are logged here as the reasoning that shaped the Composes list. They are stated as findings to be confirmed by the baseline Pass 2, not as a completed pass.

**Pass 2 finding 1 — Idempotent Reservation evaluated as a constituent and demoted to optional Duplicate Prevention enrichment.** Idempotent Reservation was considered as a fourth constituent (to give at-most-once semantics on verification jobs under retry). It does not survive EOS Pass 2 as a constituent: there is no finite pool this composition reserves against, and no provisional-commitment semantics in the onboarding arc — a verification is recorded, not reserved-then-confirmed. Party Identity's `verify` is append-only and idempotent-safe at the *state* level (a re-applied `passed` verification against an already-`Verified` party records a redundant event but drives no spurious transition), and concurrency is handled by Party Identity's own named edge case. Job-level deduplication, where a deployment needs it, is a *Duplicate Prevention* optional enrichment in front of the recording actions — named in Edge cases — not a constituent. The composition is correct with three constituents.

**Pass 2 finding 2 — Consent evaluated as a constituent and resolved as a composing peer at the deployment layer.** Consent was considered as a constituent (every system that identifies and processes personal data composes Party Identity and Consent). It is resolved as a composing peer, not a constituent of this composition: Customer Due Diligence processing rests on GDPR Article 6(1)(c) legal obligation, not Article 6(1)(a) consent, and the customer cannot revoke the basis for Customer Due Diligence processing while the AML obligation stands. Consent governs *non-obligatory* downstream processing (marketing, profiling, data sharing beyond the Customer Due Diligence obligation), which is **Propagate Consent Revocation Downstream**'s concern — named as a composing peer in the externally-clearable Generation acceptance checks and in Composition notes, not folded into this composition. Folding Consent in would conflate the legal-obligation basis (which this composition enforces structurally via the verification gate) with the consent basis (which governs a different class of processing this composition does not touch).

---

**Three-pass baseline (3×3), conducted 2026-06-03.** Round 1 Pass 1/2 author-led; every Pass 3 run in fresh-reader mode (full pass question set + the pattern only, no prior-round findings) per the Phase-3 discipline, model Opus. Findings classified *foundational* (blocks grounding) / *refining* / *rhetorical*.

**Round 1.**
- *Pass 1 (GRID).* R1·P1-a — edge-case count — *refining* → Status undercounted edge cases; corrected. R1·P1-b — `monitoring_interval` unwired — *foundational* → Configuration promised `initiate_onboarding` rejects when `monitoring_interval` is unconfigured, but step 1 did not check it; validation added to step 1.
- *Pass 2 (EOS).* Constituent set (Party Identity + Retention Window + Audit Trail) re-confirmed; prior Idempotent-Reservation and Consent demotions hold. Observation: the adverse-trigger investigation lifecycle (`case_to_open_triggers`, open→cleared) is a latent Investigation/Review-Case concept, kept inline as minimal wiring state (no independent state machine beyond open/closed), flagged for extraction if it grows.
- *Pass 3 (Linus, fresh-reader).* P3-4 — `retention_policy_ref` argument accepted but never consumed (step 4 used the Configuration value, a silent policy substitution) — *foundational* → made the per-call argument authoritative, reframed the Configuration entry as the default. P3-8/P3-3/P3-2 — `trigger_id` never written to any audit event, so the clearance→trigger join was not records-reconstructable — *refining (defensibility)* → added `trigger_id` primitive policy, carried it in the monitoring-triggered / suspended / review-cleared events, split the already-suspended idempotent case to a distinct `customer-onboarding.trigger-on-suspended-party` event class, added `closed_triggers` to `customer-onboarding.review-cleared`. P3-5/6/9/10/11/12 — *refining/rhetorical* → `activity_permitted` state-set declared; `record_verification` internal `not-known` remapped to `recording-failure`; determinism note added; Invariant 1 split into query-result (enforced) vs gating (deployment-conditional); scenario header grammar; FATF R.10–12 attribution corrected. Accepted-with-rationale: P3-1 (two `recording-failure` causes collapsed — library convention).

**Round 2.**
- *Pass 1 (GRID).* R2·P1 — propagation — *refining* → Round 1's new `customer-onboarding.trigger-on-suspended-party` event class was not reflected in the breach-forensics replay set, Generation-acceptance check 3, or Invariant 3's defense; all three updated.
- *Pass 2 (EOS).* Clean — Round 1 edits added identity/audit surface to existing concepts, no new over-absorption.
- *Pass 3 (Linus, fresh-reader).* **Audit Trail boundary cluster.** R2·P3-1 — every `record_action` call passed a `retention_policy` argument the constituent's signature does not accept (it is Audit Trail *instance* configuration) — *foundational* → removed the per-call argument from all calls; reframed `audit_trail_retention_policy` as the instance's configured policy. R2·P3-2/P3-3 — Audit Trail's `invalid-credential`/`invalid-request` rejections were never mapped at this composition's boundary, and credential validity is only checkable at the audit write (after the irreversible state change for state-first actions) — *foundational* → added the uniform `record_action` rejection-mapping rule (pre-state writes → `invalid-request`; post-state writes → `recording-failure` orphan) and named the deployment obligation for credential pre-validation. R2·P3-5 — gate admits parties verified outside this composition on a shared instance — *foundational* → added the *Exclusive verification ownership* edge case + GA-check-1 note (hardened further in Round 3). R2·P3-7 — `already-closed` collapsed into `verification-failed` (also flagged R1) — *refining* → added `already-closed` as a distinct `clear_review` rejection. R2·P3-4/6/8/9 — *refining* → `enrollment-failed` parameter domain named; periodic-review routing stated; **Invariant 7 (open-trigger/suspension correspondence) added**; `customer-onboarding.party-reinstated` noted supplementary to Invariant 4.

**Round 3.**
- *Pass 1 (GRID).* Round 2 additions (Invariant 7, exclusive-ownership edge case, updated counts) re-checked internally consistent; clean.
- *Pass 2 (EOS).* Clean.
- *Pass 3 (Linus, fresh-reader).* R3·P3-9 — the load-bearing decision prose and Generation-acceptance check 1 still claimed the gate guarantees verification-*through this composition*, while `activity_permitted` read only Party Identity state — *foundational* → tightened the gate to consult `party_to_case` (a `Verified` party outside this composition now fails with `not-known`), promoted `not-known` to a first-class result tag, and sharpened the decision prose to attribute the attribution-coverage half to Invariant 2 + exclusive ownership. R3·P3-12 — `initiate_onboarding` map-first vs `trigger_monitoring_review` audit-first asymmetry let a `case_id` become resolvable before its `customer-onboarding.initiated` event landed — *borderline foundational* → reordered `initiate_onboarding` to audit-first. R3·P3-1/3/4/6/7/8/17/19 — *refining/rhetorical* → actor/credential pairing stated; `next_review_due` advancement rule made explicit (with its negative cases); `monitoring_interval` framed as validated instance config; storage-failure asymmetry defended; Invariant 7 serialization caveat; `verification-failed` flagged defense-in-depth; composition-id byte-identity stated.

**Baseline outcome.** The 3×3 baseline surfaced and closed foundational findings in all three rounds — the last in Round 3 (the gate-attribution tightening). Because a foundational finding closed in the final baseline round, the baseline did not close clean; per methodology the pattern is **`partially resolved`** pending the AI-conducted Final Critique (Super Torvalds, Round 4+) and the Phase-4 Opus clearance gate before `grounded`. Constituent cross-references (Party Identity Inv 1/4/5/6, Retention Window Inv 7, Audit Trail Inv 1/3, the no-per-call-retention-argument fact, constituent Generation-acceptance check counts) were verified accurate across all three rounds.

**Final Critique — Phase-4 Opus clearance gate (Happy Torvalds X2), 2026-06-03.** Fresh-reader Opus; all three passes, Pass 3 at X2 depth. Pass 1 (GRID) and Pass 2 (EOS) clean. Pass 3 surfaced ten findings, **zero foundational** — the gate clears at the 92%-good threshold. Refining findings closed in-pattern: *Final Critique 4/Final Critique 5* — `record_verification`'s success tag `verified` overstated the outcome for a `failed` result or a `passed` result against a `Suspended` party (both record an event and drive no transition) → renamed to `recorded`, guarantee restated, walkthrough updated. *Final Critique 1* — Invariant 7's "unresolved investigations" prose understated the clear-all-at-once behavior → reworded to "triggers not yet cleared," with the `closed_triggers` set keeping a multi-trigger sweep records-auditable. *Final Critique 3* — `activity_permitted`'s two reads are not atomic → added the fail-safe-toward-denial argument to the Concurrency edge case. *Final Critique 6* — Configuration `active_relationship_policy_ref` overstated itself as a substituted default → reworded to a recommended value behind the required, authoritative argument. *Final Critique 8* — Generation-acceptance check 4 conflated records-alone existence with externally-clearable regulatory-floor adequacy → split, duration-adequacy half moved to the externally-clearable list. Rhetorical findings: *Final Critique 9* (breach scenario now names the unsealed-tail integrity boundary) closed; *Final Critique 2*, *Final Critique 7*, *Final Critique 10* recorded and accepted as-is (defended decisions / optional example coverage). **Gate result: zero foundational findings → `grounded on Final Critique 4`.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Adverse-trigger ordering (Inv 3 — monitoring-triggered event ordered before any suspend, a records-alone total-order fact) and open-trigger/suspension correspondence (Inv 7, across two concurrent-access surfaces) are temporal/ordering claims. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`customer-onboarding.tla`](./customer-onboarding.tla) + config [`customer-onboarding.cfg`](./customer-onboarding.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* one party; `state` in {Verified, Suspended}; `openTriggers` counts open adverse triggers (`MaxTriggers = 2`). Raising a trigger drives the suspend (adverse-trigger-precedes-suspend), and resolving the last trigger reinstates. The load-bearing biconditional **open-trigger ⇔ Suspended** (Invariant 7) is checked as boolean equality `(openTriggers > 0) = (state = Suspended)`. Exhaustive: 3 states, holds. *Buggy twin* [`customer-onboarding-buggy.tla`](./customer-onboarding-buggy.tla) adds a `SuspendWithoutTrigger` action (a suspend with no preceding adverse trigger), breaking both adverse-trigger-precedes-suspend and the biconditional; rejected at 3 states (Suspended while `openTriggers = 0`). *Out of model scope:* the Party Identity verification lifecycle (see `atoms/party-identity.tla`), the Audit Trail substrate (see `audit-trail.tla`), Retention Window, trigger identity/attribution. *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed (the invariant count held at seven). (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added after Edge cases (12 terms): 6 Operations — the case intake ([Initiate Onboarding]), the verification record ([Record Verification]), the monitoring trigger ([Trigger Monitoring Review]), the adverse-review clearance ([Clear Review]), the closure ([Close Party]), and the read-only gate ([Activity Permitted]); 1 Field — the [Next Review Due] monitoring-schedule datum; and 5 Members — the load-bearing gate rejection ([Not Verified]) and the composition's own rejections [No Open Trigger], [Enrollment Failed], [Party Not Known], and [Verification Failed]. Every own-action prose reference is linked; the `#### \`name\`` signature headings (restored) with their fenced contract blocks and example calls stay backticked; the rejection Members are enum values, so their concept references are linked at representative homes while wire forms — including the parameterized `not-verified(state)` — stay backticked. **No Type card:** the composition owns no record store — its emergent state (`case_to_monitoring`, `party_to_case`, `case_to_retentions`, `case_to_open_triggers`) indexes the three constituent stores, left as backticked tokens. The party lifecycle states (`Unverified` → `Verified` → `Suspended` → `Closed`) are the Party Identity constituent's and are not carded. The generic/relayed rejections (`invalid-request`, `recording-failure`, `not-known`, `already-closed`, `not-active`) stay backticked. Survivors left backticked: the signature headings and example calls; the `customer-onboarding.*` audit event types; the deployment trigger vocabulary (`periodic-review-due`, `sanctions-match`, `pep-status-change`, `adverse-media`); every qualified constituent call (Party Identity's `enroll` / `verify` / `suspend` / `reinstate` / `close`, Retention Window's `place_under_retention`, Audit Trail's `record_action`) and their outcomes; the relayed constituent tokens and configuration knobs; and concrete example ids. Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *One representational tidy:* a malformed nested-backtick span in `clear_review` step 5 — the inner `` `trigger_id` `` / `` `trigger_ref` `` / `` `case_to_open_triggers[case_id]` `` backticks broke the surrounding `record_action` code span and exposed a bare `[case_id]` — was corrected to a single well-formed code span (identical content), which also keeps `[case_id]` from being read as a `[Term]` marker once the registry activates the page-wide check. (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent); it was already four paragraphs, moved as-is (cut #1 already satisfied); the descriptive top blockquote folded out after confirming each claim (the Party-Identity + Retention-Window + Audit-Trail-substrate wiring; verification-gates-activity; the audit-first monitoring/suspension ordering; the post-closure retention floor) is carried by Summary / Intent / Composes / the load-bearing wiring decision; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block (closing before the separate `## Composition notes` section). (d) **prose cut #5 — skipped (with reason):** the composition owns no emergent state machine — the party lifecycle (Unverified → Verified → Suspended → Closed) is the Party Identity constituent's, and the composition's own logic is the uniform validate → constituent-call → audit-record wiring plus the gate, already stated crisply in Action wiring and the load-bearing decision. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-03`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (12 terms); seven composition-level invariants preserved; the `.tla` models untouched — harness re-run green: `customer-onboarding.tla` PASS + `customer-onboarding-buggy.tla --buggy` rejected.

</details>

---

## Composition notes

These are adjacent compositions, **not** constituents of this composition:

- **[External Onboarding](./external-onboarding.md)** — the upstream admission gate. External Onboarding admits a party in `Unverified` state (enroll + credential registration + invitation acceptance, all audited); this composition is the verification gate downstream. A deployment requiring `Verified` status before granting access places this composition downstream of External Onboarding: External Onboarding's `party_id` flows into this composition's `initiate_onboarding` on the External-Onboarding-admitted branch (`enrollment_path = external-onboarding`). External Onboarding is the admission gate; this composition is the verification gate.
- **[Propagate Consent Revocation Downstream](./propagate-consent-revocation-downstream.md)** (`grounded` 2026-06-04) — governs non-obligatory processing beyond the Customer Due Diligence legal obligation. This composition's processing basis is GDPR Article 6(1)(c); Propagate Consent Revocation Downstream governs the Article 6(1)(a) consent basis for downstream processing this composition does not touch. (Pass 2 finding 2.)
- **Resolve a Person's Data Rights** *(forthcoming)* — handles GDPR data-subject access and erasure requests against party records, adjudicating the tension between an erasure request and this composition's post-closure retention floor (the legal-obligation exception under GDPR Article 17(3)(b)). This composition records the retention state at request time; Resolve a Person's Data Rights adjudicates.
- **Ownership Structure / Beneficial Owner** *(forthcoming)* — models the ownership graph across Party Identity records under FinCEN 31 CFR §1010.230. Each beneficial owner is verified through its own onboarding case; the ≥25% relationship graph belongs to the Ownership Structure pattern. This composition is a constituent of that pattern, not its replacement.
