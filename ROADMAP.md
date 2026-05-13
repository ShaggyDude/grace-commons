---
title: Roadmap
nav_order: 5
has_toc: true
toc: true
---

# Roadmap

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> What the library is building toward, in dependency order. Atoms before the compositions that name them. Each entry names what it unlocks.

The library's current state is documented in [`readme.md`](./readme.md). This file records what comes next and why, at the granularity of individual patterns. Priority reflects dependency readiness first, regulatory coverage second — a composition that needs three new atoms is lower priority than one that needs one, regardless of business value, because the blocking atoms must land first.

The topological ordering principle is codified in [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md): atoms before compositions, constituents before the applications that name them. This roadmap is organized accordingly.

---

## In-progress

No atoms currently in progress. The messaging atoms that were previously in-progress have reached `grounded`:

- **[Subscription](./atoms/messaging/subscription.md)** — `grounded` 26-05-13
- **[Notification](./atoms/messaging/notification.md)** — `grounded` 26-05-13
- **[Notification Fanout](./compositions/notification-fanout.md)** — `grounded` (composition of the above two)

Work on new atoms (#1 Legal Hold onward) is unblocked.

---

## New atoms — in draft order

The seven atoms below are net-new to the library. They are sequenced by how many other roadmap items they unblock. Each entry names its proposed category, the compositions it gates, and the regulatory surface it covers.

---

### 1. Legal Hold

**Category:** `atoms/compliance/`

**What it is.** A compliance primitive: a named, actor-issued hold placed against one or more records, preventing their purge regardless of the retention window's eligibility signal. A Legal Hold is distinct from a Retention Window — the Retention Window says *how long a record must be kept under normal operation*; the Legal Hold says *this record may not be purged under any circumstance until the hold is explicitly released*, overriding the Retention Window during its term. The hold itself is a record with its own lifecycle: Active → Released.

**Why it's first.** Unblocks Regulated Record Retention & Defensible Deletion immediately — that composition needs only Legal Hold among the new atoms. Also a prerequisite for Data Subject Rights Fulfillment. Legal Hold recurs across every regulated domain (e-discovery, regulatory investigation, litigation, audit freeze) and is generically applicable; it is not a property of any existing atom.

**Key invariants (anticipated).** A held record cannot be purged while the hold is Active, regardless of `retention_until`. Multiple concurrent holds are independent — releasing one does not release others. The full hold history (who placed it, when, for what stated reason, when released) is an auditable record. No hold is retroactive — a hold placed after a purge does not resurrect a purged record.

**Standards anchored.** Federal Rules of Civil Procedure Rule 37(e) (e-discovery preservation duty); SEC Rule 17a-4 (broker-dealer record retention with hold obligations); HIPAA (legal holds on PHI during investigation); SOX (holds on financial records during audit or investigation).

**Unlocks.** Regulated Record Retention & Defensible Deletion (C1); Data Subject Rights Fulfillment (C7).

---

### 2. Consent

**Category:** `atoms/compliance/`

**What it is.** A compliance primitive: a binding of a data subject's affirmative agreement to a specified purpose, with a full lifecycle from grant through revocation and expiry. Consent is distinct from Permissions — Permissions governs what an internal actor may do within a system; Consent governs what the system may do *to or with* a data subject's data. A grant is tied to a specific purpose scope (e.g., `marketing:email`, `analytics:behavioral`, `research:anonymized`); the atom does not interpret scope semantics, treating them as opaque. States: Granted, Revoked, Expired.

**Why it's second.** Consent is a prerequisite for Consent & Preference Management (C2), Data Subject Rights Fulfillment (C7), and KYC / Customer Onboarding (C8). It is genuinely freestanding — own state, own actions (`grant`, `revoke`, `withdraw`, `check`), own invariants — and recurs across every domain that handles personal data. No existing atom covers it; the library has Permissions (internal authorization) and Actor Identity (actor credential verification) but nothing that models the data subject's own authorization of processing.

**Key invariants (anticipated).** Consent at time-of-action is recoverable from the consent store — `check(subject, purpose, at_time)` returns the consent state as of that instant. Revocation is not retroactive — it does not erase the record of prior consent, only terminates future reliance on it. The full consent history (every grant, revocation, withdrawal, and expiry) is an auditable record. A revoked consent cannot be re-granted under the same grant id; re-grant requires a fresh grant record.

**Standards anchored.** GDPR Articles 6–7 (lawful basis, consent conditions), Article 17 (right to erasure triggers on consent withdrawal), Article 7(3) (withdrawal as easy as grant); CCPA/CPRA (opt-out of sale, opt-in for sensitive personal information); HIPAA Authorization (45 CFR §164.508).

**Unlocks.** Consent & Preference Management with Revocation Propagation (C2); Data Subject Rights Fulfillment (C7); KYC / Customer Onboarding (C8).

---

### 3. Soft Delete

**Category:** `atoms/resource-lifecycle/`

**What it is.** A resource-lifecycle primitive: a record is marked as deleted and hidden from normal query surfaces, but retained in recoverable form until an explicit purge. Soft Delete is distinct from Personal Todo's terminal `delete` — that action removes the record from the system entirely. Soft Delete retains the record in a Deleted state from which it can be restored (Deleted → Active) or permanently purged (Deleted → Purged). The three states (Active, Deleted, Purged) form a directed acyclic lifecycle; no backward transitions from Purged exist.

**Why it's third.** Soft Delete is a short, clean atom — own state machine, own actions (`soft_delete`, `restore`, `purge`), own invariants — and it recurs widely: content moderation, account suspension, record archival, tombstoning in distributed systems. Forensic Recovery (C3) depends on it directly. It also composes naturally with Legal Hold (a soft-deleted record under a Legal Hold cannot be purged) and with Retention Window (the retention clock governs when a soft-deleted record becomes eligible for purge).

**Key invariants (anticipated).** A Deleted record is not visible to standard read queries but is recoverable via an explicit restore action. A Purged record is terminal — restore is rejected. The deletion timestamp, the actor who deleted, and the purge timestamp (if purged) are all auditable fields on the record. Soft Delete does not define what "hidden from normal query" means — that is deployment policy; the atom defines the state machine and the recoverability guarantee.

**Standards anchored.** GDPR Article 17 (right to erasure — Purge is the implementation surface); HIPAA (PHI must be recoverable during audit period); general e-discovery preservation (Deleted records are preserved for discovery; Purge is the deliberate post-hold destruction).

**Unlocks.** Forensic Recovery (C3).

---

### 4. Approval Step

**Category:** `atoms/workflow/` *(new category; see taxonomy note below)*

**What it is.** A workflow primitive: a single binding of a required approval to an approver, for a specified action or artifact, with a lifecycle from submission through decision. An Approval Step is freestanding — it does not know what is being approved, only that something requires approval by a named actor under a named scope. States: Pending, Approved, Rejected, Withdrawn. The atom models one approval gate; multi-party approval chains are the composition (Multi-Party Approval), not this atom.

**Why it's fourth.** Multi-Party Approval (C4) needs this atom, and that composition has very high regulatory coverage (SOX, FDA, clinical approvals, financial deal signoffs). The atom is genuinely freestanding — it has its own state machine distinct from Permissions (which governs standing authorization) and Assignment (which governs responsibility binding). Approval Step is a transient, decision-specific binding with a terminal outcome; Permissions is a persistent grant; Assignment is a responsibility binding. The three are composing peers, not overlapping concerns.

**Taxonomy note.** `workflow/` is a proposed new category. Approval Step sits awkwardly in all existing categories — it is not temporal, not a compliance record, not a resource lifecycle, not productivity-scoped. If the taxonomy proves too thin to justify a category (one atom is not a category), Approval Step can sit in `resource-lifecycle/` temporarily and be relocated when a second workflow atom lands. The open-taxonomy question is noted in [`CLAUDE.md`](./CLAUDE.md) and will be resolved by content as the library grows.

**Key invariants (anticipated).** An Approval Step has exactly one terminal outcome: Approved, Rejected, or Withdrawn. Terminal states are absorbing — no further transitions. The decision timestamp, the deciding actor, and any stated reason are auditable fields. An Approval Step in Pending cannot be acted on by any actor other than the named approver (or a designated delegate — delegation is a composing concern).

**Standards anchored.** SOX §404 (control evidence for financial reporting actions); FDA 21 CFR Part 11 (electronic signatures on regulated records — each signature maps to an Approval Step); ICH E6 Good Clinical Practice (investigator approval steps in clinical trial workflows); ISO 9001 §8.5.1 (production and service provision controls).

**Unlocks.** Multi-Party Approval (C4).

---

### 5. Selective Disclosure

**Category:** `atoms/compliance/`

**What it is.** A compliance primitive: a durable record of what subset of a record was disclosed, to whom, at what time, and under what authority. Selective Disclosure does not itself redact records — it records *that* a disclosure of a specified scope occurred, creating an auditable trail of what was shared. The atom is the accountability layer on top of whatever redaction or disclosure mechanism the implementation uses. States: a disclosure record is created on each disclosure event; the record set is append-only.

**Why it's fifth.** Required by both Data Subject Rights Fulfillment (C7) — where GDPR Article 15 requires the system to disclose what data it holds and to whom it has been disclosed — and the Immutable Transaction Ledger with Selective Disclosure (C6). The atom is more novel to scope than the preceding ones (the boundary between "recording that a disclosure happened" and "performing the disclosure" requires careful EOS pass 2 scrutiny). It sits after Legal Hold, Consent, Soft Delete, and Approval Step because those are cleaner atoms with clearer boundaries.

**Key invariants (anticipated).** A disclosure record is immutable once created — the record of what was disclosed cannot be altered. The disclosure record names the recipient, the scope of what was shared, the authority under which the disclosure was made (a Consent id, a Legal Hold id, or a regulatory requirement citation), and the timestamp. No disclosure is unrecorded — every disclosure event produces a record. The full disclosure history for any record is queryable from the disclosure store.

**Standards anchored.** GDPR Article 15(1)(c) (data subject's right to know recipients of their data); GDPR Article 30 (records of processing — disclosures are processing activities); HIPAA §164.528 (accounting of disclosures of PHI); SEC Rule 17a-4 (disclosure records for broker-dealer records).

**Unlocks.** Immutable Transaction Ledger with Selective Disclosure (C6); Data Subject Rights Fulfillment (C7).

---

### 6. Party Identity

**Category:** `atoms/compliance/`

**What it is.** A compliance primitive: a persistent, verifiable identity record for an external party — customer, patient, counterparty, beneficial owner — with a verification lifecycle distinct from the Actor Identity atom. Where Actor Identity models an internal actor's ability to sign actions with credentials, Party Identity models an external party's verified existence and identity attributes, which may be re-verified, suspended, or closed as circumstances change. States: Unverified, Verified, Suspended, Closed.

**Why it's sixth.** Party Identity is a genuine atom — own state machine, own actions (`enroll`, `verify`, `suspend`, `reinstate`, `close`), own invariants around identity chain-of-custody — but it is more complex to scope than the preceding atoms. The line between "what Party Identity records about a party" and "what a KYC/AML workflow does with that record" is the key EOS pass 2 question for this atom. KYC / Customer Onboarding (C8) depends on it.

**Key invariants (anticipated).** A Party Identity record is never deleted — it transitions through states, including Closed, but the full identity history is auditable. Verification events are immutable — each verification attempt (successful or failed) is recorded with the timestamp, the verifying actor, and the verification method used. A Suspended party may not be relied upon for new transactions until reinstated or closed. Closure is terminal for new activity but the record persists for audit.

**Standards anchored.** FATF Recommendations (customer due diligence, beneficial ownership verification); BSA/AML (Bank Secrecy Act — customer identification program requirements); GDPR Article 4(1) (definition of personal data — Party Identity records are personal data); HIPAA (patient identity — the patient record is a Party Identity in the healthcare context).

**Unlocks.** KYC / Customer Onboarding (C8).

---

### 7. Provenance

**Category:** `atoms/compliance/` *(possibly `atoms/temporal/`; to be resolved at authoring time)*

**What it is.** A compliance and temporal primitive: an append-only chain recording the origin, custody history, and transformation history of a record or artifact. Provenance answers *where did this come from, who has handled it, and what has been done to it*. It is distinct from Event Log (which records what happened in a system) and from Actor Identity (which verifies who performed an action) — Provenance specifically models the chain of custody of a *thing*, not a stream of system events. Each custody event is immutable once recorded; the chain is append-only.

**Why it's seventh.** Provenance is the most novel atom on the roadmap — the scoping requires careful EOS pass 2 work to establish what "this thing's custody history" means without absorbing the event-log or actor-identity concerns. It is last among the new atoms because it has no single downstream composition blocking on it; rather, it enriches multiple compositions (Transaction Ledger, DSAR, KYC) without being a strict prerequisite for any of them.

**Key invariants (anticipated).** Each provenance entry is immutable once recorded. The chain is append-only — no entry is removed or reordered. Every entry names a custodian (an actor reference), a timestamp, and an event type (originated, received, transformed, transferred, disclosed, archived). The chain is complete — no custody gap is permitted between recorded entries; a gap is a finding, not a valid state.

**Standards anchored.** ISO 23081 (records management metadata — provenance as a required metadata element); W3C PROV (data provenance ontology); FDA 21 CFR Part 211 (pharmaceutical chain of custody); SEC Rule 17a-4 (records must be maintained as originally created — provenance of the original form).

**Unlocks.** Enriches Immutable Transaction Ledger (C6), DSAR (C7), and KYC (C8) as an optional composing atom.

---

### 8. Capacity Constraint Enforcement

**Category:** `atoms/resource-lifecycle/`

**What it is.** A resource-lifecycle primitive: a named, bounded pool of a finite resource — seats, inventory units, time slots, bandwidth allocations, credit headroom — with actions that allocate from, release back to, and query against the pool. Capacity Constraint Enforcement does not know what is being constrained; it models the pool's arithmetic: declared capacity, currently allocated units, and available units at a point in time. It composes with Provisional Commitment (which issues a hold against a specific resource slot) and Duplicate Prevention (which guards against double-allocation under concurrent requests). States: Open (accepting allocations), Drained (at capacity — new allocations rejected), Suspended (no new allocations; existing allocations held intact), Closed (terminal; existing allocations may complete; pool is decommissioned).

**Why it's eighth.** Reservation Lifecycle — the composition that models the full arc from resource hold through confirmed reservation through cancellation or expiry — is already named as Forthcoming in `compositions/README.md`. That composition is blocked entirely on this atom. Capacity Constraint Enforcement is the missing primitive: Provisional Commitment handles the per-reservation hold, Duplicate Prevention handles idempotency under concurrent demand, but neither enforces that the pool's total allocation never exceeds its stated capacity. That invariant belongs here.

**Key invariants (anticipated).** Total allocated units never exceed pool capacity — an allocation that would exceed capacity is rejected with `over-capacity`. Released units are returned to available immediately; the pool does not retain per-allocation identity — it tracks aggregate counts only. Capacity adjustments (upward or downward) are recorded with the timestamp and the adjusting actor. A downward adjustment that would put current allocation over the new capacity is rejected — the atom enforces the constraint; the caller owns the resolution policy.

**Standards anchored.** General resource management practice (no single regulatory standard owns capacity constraint enforcement; it appears as an implied obligation in ticketing, scheduling, inventory, and financial settlement systems). Composes naturally with SOX-scope financial controls when the constrained resource is a financial limit or credit line.

**Unlocks.** Reservation Lifecycle (C9).

---

### 9. Workflow / State Machine

**Category:** `atoms/workflow/`

**What it is.** A workflow primitive: a named entity moving through a defined, finite set of states via explicitly declared transitions. The atom does not know what the entity is — it knows the entity's current state, the transitions that are valid from that state, and the history of how it got there. States and transitions are declared at instantiation; the atom enforces that only declared transitions are applied and that the full transition history is auditable. A Workflow instance has exactly one current state at all times; concurrent active states and fork-join constructs are composing concerns, not atom-level concerns.

**Why it's ninth.** Approval Step (atom #4) opened the `workflow/` category but left it a single-entry category — noted as an open taxonomy question in CLAUDE.md. Workflow / State Machine is the general primitive that justifies the category: Approval Step is a specific kind of state machine (one designed for human approval decisions); Workflow / State Machine is the general case. The two atoms compose into Stateful Workflow Execution (C10), which produces multi-actor gated workflows with tamper-evident transition histories — a pattern that recurs in regulated manufacturing, financial operations, and HR processes. Two workflow atoms settle the taxonomy question.

**Key invariants (anticipated).** Only declared transitions are valid — an undeclared transition is rejected with `invalid-transition`. The current state is always exactly one of the declared states. The full transition history — prior state, target state, triggering action, timestamp, actor — is auditable and append-only. A state declared as terminal at instantiation is absorbing — no further transitions are accepted. Transition guards are declared at instantiation; the atom enforces that a guard must be `satisfied` before a transition fires, but does not evaluate the guard — that is the caller's obligation.

**Standards anchored.** FDA 21 CFR Part 11 (electronic records in regulated workflows — each state transition is a regulated event); ISO 9001 §8.5.1 (production workflow controls); BPMN 2.0 (the canonical notation for stateful workflow — this atom is the primitive behind a BPMN state diagram); HL7 FHIR Task resource (clinical workflow state machine — Task states map directly to this atom's state machine).

**Unlocks.** Stateful Workflow Execution (C10). Also resolves the open taxonomy question on the `workflow/` category: two atoms justify the category's existence.

---

### 10. Preference / Personalization

**Category:** `atoms/messaging/`

**What it is.** A messaging primitive: a durable binding of a principal's delivery preferences — channel priority, frequency limits, quiet hours, format preferences, per-topic opt-downs — that governs *how* a notification reaches a recipient, independently of *whether* they are subscribed (Subscription) or *whether* processing is legally permitted (Consent). The three atoms are distinct: Subscription governs which topics a principal follows; Consent governs whether the system may process or communicate with the principal at all; Preference governs the delivery envelope when Subscription and Consent have both permitted the notification. States: Active, Suspended (preferences retained but delivery suppressed for the principal), Deleted.

**Why it's tenth.** Subscription and Notification are grounded; Notification Fanout is grounded. The next natural question in the messaging surface is: *how does a subscriber control the shape of delivery?* Preference / Personalization is the atom that answers it. It sits cleanly in `atoms/messaging/` alongside Subscription and Notification — same category, complementary concern, no overlap with either. It composes with Notification Fanout to produce Preference-Aware Notification Fanout (C11), where the fanout step consults each subscriber's preferences before determining the delivery channel and rate. It is also distinct from the regulatory Consent & Preference Management (C2): C2 tracks regulatory consent; this atom tracks delivery ergonomics.

**Key invariants (anticipated).** A principal has at most one active Preference record — preferences are not additive; a new preference set replaces the prior one (with the prior set retained in history). Preference updates are not retroactive — a notification already queued before an update is delivered under the prior preferences; the update governs future deliveries only. A Suspended Preference record suppresses delivery without removing subscriptions — the subscriber retains their topic bindings while suppressing notifications. Preference / Personalization does not define what channels exist or what format options are valid — those are deployment-specific enumerations declared at instantiation.

**Standards anchored.** CAN-SPAM Act (opt-out and frequency controls for commercial email); TCPA (frequency and consent controls for SMS and phone marketing); GDPR Article 7(3) (preference changes must be as easy as the original grant — the Preference atom's update action is the mechanism).

**Unlocks.** Preference-Aware Notification Fanout (C11).

---

## New compositions — in draft order

Compositions are listed after their atom prerequisites are noted as `grounded`. Each entry names its constituents, the emergent invariants anticipated, and the standards it anchors.

---

### C1. Regulated Record Retention & Defensible Deletion

**Prerequisites:** Legal Hold *(grounded)* + existing: Audit Trail, Retention Window, Tamper Evidence, Event Log.

**What it adds.** The composition that makes retention *defensible* — provably complete, provably ordered, provably unaltered. The emergent invariants: a record under a Legal Hold cannot be purged regardless of retention eligibility (Legal Hold overrides Retention Window); every retention decision (place, release hold; set retention; purge) is itself tamper-evident and attribution-stamped; the Audit Trail captures the full lifecycle of every retention decision, making the deletion of any record provably authorized.

**Standards anchored.** SOX (record retention and deletion controls under audit); HIPAA (medical record retention and destruction requirements); SEC Rule 17a-4 (broker-dealer records — non-erasable, immutable, audit-supervised destruction); GDPR Article 17 (right to erasure — the composition answers whether erasure is permissible given active Legal Holds and retention obligations); Federal Rules of Civil Procedure Rule 37(e) (preservation duty — Legal Hold is the operative control).

---

### C2. Consent & Preference Management with Revocation Propagation

**Prerequisites:** Consent *(grounded)* + existing: Audit Trail, Retention Window, Permissions, Event Log.

**What it adds.** The composition that makes consent *operational* — checked before every processing action, propagated on revocation, and auditable for regulatory proof. The emergent invariants: no processing action proceeds under a Consent basis without a `permitted` result from the Consent instance for the relevant purpose scope; a revocation event triggers an audit record that names every downstream scope affected; the full consent history for any data subject is recoverable from the composition's records alone, without recourse to application code.

**Standards anchored.** GDPR Articles 6–7 (lawful basis; consent validity conditions); GDPR Article 7(3) (revocation as easy to exercise as grant); CCPA/CPRA (opt-out and opt-in rights for sensitive personal information); HIPAA Authorization (§164.508 — required elements for valid authorization).

---

### C3. Forensic Recovery

**Prerequisites:** Soft Delete *(grounded)* + existing: Event Log, Actor Identity, Audit Trail.

**What it adds.** The composition that makes soft deletion *forensically complete* — every deletion, restoration, and purge is attribution-stamped and tamper-evident; the full lifecycle of every soft-deleted record is recoverable from the audit trail. The emergent invariant: no soft-deleted record is purged without an auditable record naming who purged it, when, and under what authority; and no purge can be later denied.

**Standards anchored.** GDPR Article 17 (right to erasure — Purge is the implementation; the audit trail is the proof of compliance); HIPAA (PHI destruction must be documented); e-discovery (preservation obligation — Deleted is preserved; Purge is deliberate destruction requiring audit).

---

### C4. Multi-Party Approval

**Prerequisites:** Approval Step *(grounded)* + existing: Permissions, Assignment, Event Log, Actor Identity, Audit Trail. *This composition is grounded.*

**What it adds.** The composition that makes multi-actor authorization *auditably enforced* — no action proceeds until the required approval gates are cleared; the full approval chain (who approved, when, in what order, with what stated authority) is tamper-evident and attribution-stamped. The emergent invariants: a required approval gate cannot be bypassed; approvals are non-repudiable; the minimum quorum for an approval chain (one-of-N, all-of-N, threshold-of-N) is a deployment-configured property of the composition, not of the Approval Step atom.

**Standards anchored.** SOX §404 (control evidence — approval chain is the control); FDA 21 CFR Part 11 (electronic signatures — each Approval Step is a signature event with audit trail); ICH E6 GCP (investigator and IRB approval chains in clinical trials); ISO 9001 §8.5.1 (production controls requiring approval gates).

---

### C5. Notification Fanout

**Prerequisites:** Subscription *(grounded)* + Notification *(grounded)*. This composition is grounded.

**What it adds.** The composition that delivers a single event to all subscribed actors, with delivery guarantees and observability. Depends on both messaging atoms reaching `grounded`. Listed here because it is already forecast in the messaging atoms' Composition notes and is the natural first composition from the messaging category.

---

### C6. Immutable Transaction Ledger with Selective Disclosure

**Prerequisites:** Selective Disclosure *(grounded)* + existing: Event Log, Tamper Evidence, Actor Identity, Retention Window, Idempotent Reservation.

**What it adds.** The composition that makes a transaction record *both* non-repudiable *and* selectively shareable — the full ledger is tamper-evident and attribution-stamped; a subset of the ledger can be disclosed to a counterparty or regulator without breaking the integrity of the chain that remains. The emergent invariant: a disclosed subset is itself tamper-evident (the Selective Disclosure record names exactly what was shared); the undisclosed portion is not compromised by the disclosure.

**Standards anchored.** Financial services (trade confirmation, settlement records); healthcare billing (remittance advice — disclose billing without disclosing clinical detail); clinical trials (regulatory submission — disclose aggregate results without disclosing individual patient records).

---

### C7. Data Subject Rights Fulfillment (DSAR)

**Prerequisites:** Legal Hold *(grounded)* + Consent *(grounded)* + Selective Disclosure *(grounded)* + existing: Audit Trail, Retention Window, Actor Identity, Event Log.

**What it adds.** The composition that makes data subject rights *mechanically answerable* — a DSAR request triggers a structured query across the composition's constituent records; the response is provably complete (every record touching the data subject is accounted for), provably accurate (the Selective Disclosure record proves what was shared), and provably timely (the Audit Trail records when the request was received and when the response was dispatched). The emergent invariants: no record touching the data subject is omitted from the response without an auditable reason (active Legal Hold, third-party confidentiality obligation); every disclosure made in response to the DSAR is itself recorded in the Selective Disclosure store.

**Standards anchored.** GDPR Articles 15–20 (access, rectification, erasure, restriction, portability, objection); CCPA/CPRA (right to know, right to delete, right to opt-out); HIPAA (individual right of access — 45 CFR §164.524).

---

### C8. KYC / Customer Onboarding with Ongoing Monitoring

**Prerequisites:** Party Identity *(new)* + Consent *(new)* + existing: Audit Trail, Event Log, Idempotent Reservation, Retention Window, Actor Identity.

**What it adds.** The composition that makes customer onboarding *regulatorily complete* — every identity verification step is attribution-stamped and tamper-evident; the onboarding record is immutable from the moment the customer is enrolled; ongoing screening triggers (sanctions list match, PEP status change, adverse media) are recorded as events against the Party Identity record; the full onboarding and monitoring history is recoverable from the composition's records alone. The emergent invariant: no customer proceeds to active status without a verified Party Identity record; no Party Identity verification is performed without a corresponding Audit Trail entry.

**Standards anchored.** FATF Recommendations 10–12 (customer due diligence, enhanced due diligence, politically exposed persons); BSA/AML (Bank Secrecy Act — Customer Identification Program, §31 CFR 1020.220); FinCEN beneficial ownership rule (31 CFR §1010.230); EU 5th Anti-Money Laundering Directive.

---

### C9. Reservation Lifecycle

**Prerequisites:** Capacity Constraint Enforcement *(new, atom #8)* + existing: Provisional Commitment, Duplicate Prevention, Event Log, Actor Identity.

**What it adds.** The composition that models the full arc of a reservation: capacity query against the pool, provisional hold against a specific slot, idempotent confirmation under concurrent demand, and eventual resolution — confirmed, cancelled, or expired. The emergent invariants: confirmed reservations never exceed pool capacity (Capacity Constraint Enforcement enforces this at the pool level; Provisional Commitment holds the slot; Duplicate Prevention prevents double-confirmation under retry); a cancelled or expired reservation releases its slot back to the pool atomically from the perspective of the composition's records; no reservation transitions to Confirmed unless its provisional hold is still Active at confirmation time.

**Standards anchored.** Booking and ticketing systems (seat inventory, appointment scheduling); financial settlement (credit limit enforcement — the pool is a credit line, the reservation is a limit check against available headroom); supply chain and inventory management (warehouse allocation — the pool is stock on hand, the reservation is a pick ticket against available units).

---

### C10. Stateful Workflow Execution

**Prerequisites:** Workflow / State Machine *(new, atom #9)* + Approval Step *(new, atom #4)* + existing: Permissions, Assignment, Event Log, Actor Identity, Audit Trail.

**What it adds.** The composition that makes a multi-actor gated workflow *auditably complete* — a workflow instance moves through declared states; each transition that requires human approval is enforced by an Approval Step instance; each assignment of work to an actor is enforced by Assignment; each actor's permission to trigger a transition is enforced by Permissions. The emergent invariants: no state transition proceeds without the required approval gate being cleared; no approval is granted by an actor lacking the required permission; the full workflow history — every state transition, every approval decision, every assignment — is tamper-evident and attribution-stamped. The composition does not define what the states mean or what triggers transitions — those are deployment-declared.

**Standards anchored.** SOX §404 (workflow controls as audit evidence for financial reporting actions); FDA 21 CFR Part 11 (validated workflow with electronic signatures at each regulated transition — each Approval Step is a signature event); ISO 9001 §8.5.1 (controlled production and service provision workflow); BPMN 2.0 (the composition is the executable form of a BPMN process diagram with human task approval gates).

---

### C11. Preference-Aware Notification Fanout

**Prerequisites:** Preference / Personalization *(new, atom #10)* + existing: Subscription, Notification (both `grounded`); Notification Fanout composition (`grounded`).

**What it adds.** The composition that extends Notification Fanout with per-subscriber delivery shaping — before dispatching each notification, the fanout step consults the subscriber's Preference record and adjusts the delivery channel, format, and rate accordingly. The emergent invariants: a subscriber with a Suspended Preference record does not receive a notification even if their Subscription is Active (suppression is the Preference atom's signal; the composition enforces it at fanout time); a notification that would exceed a subscriber's declared frequency limit is held or dropped according to the caller's declared policy, not silently delivered; the `failed` list from the base Notification Fanout action is extended to include subscribers whose Preference record caused suppression, so the caller can distinguish delivery-attempted-and-failed from delivery-suppressed-by-preference.

**Standards anchored.** CAN-SPAM (opt-out controls — a subscriber who has opted down a frequency tier does not receive notifications above that tier); TCPA (frequency caps for SMS — the Preference atom's frequency limit is the enforcement record); GDPR Article 7(3) (preference-based suppression respects the spirit of withdrawal even when Consent is not the delivery legal basis).

---

## Summary table

| # | Pattern | Type | New atoms needed | Existing atoms used | Status |
|---|---------|------|-----------------|--------------------|----|
| — | Subscription | Atom | — | — | Grounded |
| — | Notification | Atom | — | — | Grounded |
| 1 | Legal Hold | Atom | — | — | Grounded 26-05-13 |
| 2 | Consent | Atom | — | — | Grounded 26-05-13 |
| 3 | Soft Delete | Atom | — | — | Grounded 26-05-13 |
| 4 | Approval Step | Atom | — | — | Grounded 26-05-13 |
| 5 | Selective Disclosure | Atom | — | — | Grounded 26-05-13 |
| 6 | Party Identity | Atom | — | — | Not started |
| 7 | Provenance | Atom | — | — | Not started |
| 8 | Capacity Constraint Enforcement | Atom | — | — | Not started |
| 9 | Workflow / State Machine | Atom | — | — | Not started |
| 10 | Preference / Personalization | Atom | — | — | Not started |
| C1 | Regulated Record Retention & Defensible Deletion | Composition | Legal Hold | Audit Trail, Retention Window, Tamper Evidence, Event Log | Unblocked; not started |
| C2 | Consent & Preference Management | Composition | Consent | Audit Trail, Retention Window, Permissions, Event Log | Unblocked; not started |
| C3 | Forensic Recovery | Composition | Soft Delete | Event Log, Actor Identity, Audit Trail | Unblocked; not started |
| C4 | Multi-Party Approval | Composition | Approval Step | Permissions, Assignment, Event Log, Actor Identity, Audit Trail | Grounded 26-05-13 |
| C5 | Notification Fanout | Composition | — | Subscription, Notification | Grounded |
| C6 | Immutable Transaction Ledger | Composition | Selective Disclosure | Event Log, Tamper Evidence, Actor Identity, Retention Window, Idempotent Reservation | Unblocked; not started |
| C7 | Data Subject Rights Fulfillment | Composition | Legal Hold, Consent, Selective Disclosure | Audit Trail, Retention Window, Actor Identity, Event Log | Unblocked; not started |
| C8 | KYC / Customer Onboarding | Composition | Party Identity, Consent | Audit Trail, Event Log, Idempotent Reservation, Retention Window, Actor Identity | Blocked on #6 |
| C9 | Reservation Lifecycle | Composition | Capacity Constraint Enforcement | Provisional Commitment, Duplicate Prevention, Event Log, Actor Identity | Blocked on #8 |
| C10 | Stateful Workflow Execution | Composition | Workflow / State Machine, Approval Step | Permissions, Assignment, Event Log, Actor Identity, Audit Trail | Blocked on #9 |
| C11 | Preference-Aware Notification Fanout | Composition | Preference / Personalization | Subscription, Notification (grounded); Notification Fanout (grounded) | Blocked on #10 |

---

*The roadmap is a living document. Patterns are added as the library's content forces resolution of open questions, not on a fixed schedule. The open taxonomy question on `workflow/` — whether one atom justified the category — is resolved: Workflow / State Machine (atom #9) is the second workflow-category atom, and the category stands on its own. The open taxonomy question that remains is the broader axial split across all categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`, `messaging`, `workflow`); see the open architectural questions section of [`CLAUDE.md`](./CLAUDE.md).*
