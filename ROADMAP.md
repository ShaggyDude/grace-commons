---
title: Roadmap
nav_order: 6
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

## Current state — 2026-05-18

Twenty atoms and eight compositions are `grounded`. Nothing is in-progress. The next move is one of the three remaining unblocked atoms (#7, #9, #10 below) or one of the unblocked compositions (any of C2, C3, C6, C7, C8, C9 — see compositions section).

**Atoms grounded:**

- `atoms/compliance/` (8): Actor Identity, Consent, Legal Hold, Party Identity, Permissions, Retention Window, Selective Disclosure, Tamper Evidence
- `atoms/healthcare/` (2): Clinical Observation, Medication Order
- `atoms/messaging/` (2): Notification, Subscription
- `atoms/productivity/` (2): Assignment, Personal Todo
- `atoms/resource-lifecycle/` (3): Capacity Constraint Enforcement, Provisional Commitment, Soft Delete
- `atoms/temporal/` (2): Duplicate Prevention, Event Log
- `atoms/workflow/` (1): Approval Step

**Compositions grounded:** Attributed Permissions Admin, Audit Trail, Defensible Retention, Idempotent Reservation, Multi-Party Approval, Notification Fanout, Shared Todo, Undo History.

The healthcare atoms (Clinical Observation, Medication Order) are outside the core dependency-ordered sequence — they were authored as worked examples of the methodology applied to a domain where the regulatory surface is HIPAA and 21 CFR Part 11 rather than the BSA/AML/GDPR/SOX cluster the compliance atoms anchor. They are grounded and composable; their downstream compositions (e.g., a Clinical Trial Data Capture composition, a Medication Administration Record composition) are not on this roadmap yet because the worked-example value is in the atoms themselves rather than in any specific composition the library is committed to delivering next.

---

## Remaining atoms — in draft order

Three atoms remain on the planned-sequence list. They are sequenced by how many downstream compositions they unblock.

---

### 7. Provenance

**Category:** `atoms/compliance/` *(possibly `atoms/temporal/`; to be resolved at authoring time)*

**Status:** Not started.

**What it is.** A compliance and temporal primitive: an append-only chain recording the origin, custody history, and transformation history of a record or artifact. Provenance answers *where did this come from, who has handled it, and what has been done to it*. It is distinct from Event Log (which records what happened in a system) and from Actor Identity (which verifies who performed an action) — Provenance specifically models the chain of custody of a *thing*, not a stream of system events. Each custody event is immutable once recorded; the chain is append-only.

**Why it's next.** Of the remaining atoms, Provenance is the highest-leverage in terms of composing surface: it strictly blocks Chain of Custody (C12) — the library's cross-domain reference case spanning pharmaceutical and legal-evidence custody — and additionally enriches Immutable Transaction Ledger (C6), Data Subject Rights Fulfillment (C7), and KYC / Customer Onboarding (C8) as an optional composing atom for chain-of-custody guarantees. The scoping requires careful EOS Pass 2 work to establish what "this thing's custody history" means without absorbing the event-log or actor-identity concerns — the boundary against Event Log is the key conceptual-independence test.

**Key invariants (anticipated).** Each provenance entry is immutable once recorded. The chain is append-only — no entry is removed or reordered. Every entry names a custodian (an actor reference), a timestamp, and an event type (originated, received, transformed, transferred, disclosed, archived). The chain is complete — no custody gap is permitted between recorded entries; a gap is a finding, not a valid state.

**Standards anchored.** ISO 23081 (records management metadata — provenance as a required metadata element); W3C PROV (data provenance ontology); FDA 21 CFR Part 211 (pharmaceutical chain of custody); SEC Rule 17a-4 (records must be maintained as originally created — provenance of the original form).

**Unlocks.** Strictly blocks Chain of Custody (C12) — Provenance is C12's core atom, not an enrichment. Additionally enriches Immutable Transaction Ledger (C6), DSAR (C7), and KYC (C8) as an optional composing atom for chain-of-custody guarantees; those three are unblocked without Provenance but gain emergent invariants when composed with it.

---

### 9. Workflow / State Machine

**Category:** `atoms/workflow/`

**Status:** Not started.

**What it is.** A workflow primitive: a named entity moving through a defined, finite set of states via explicitly declared transitions. The atom does not know what the entity is — it knows the entity's current state, the transitions that are valid from that state, and the history of how it got there. States and transitions are declared at instantiation; the atom enforces that only declared transitions are applied and that the full transition history is auditable. A Workflow instance has exactly one current state at all times; concurrent active states and fork-join constructs are composing concerns, not atom-level concerns.

**Why it's after Capacity Constraint.** Approval Step (atom #4, grounded) opened the `workflow/` category but left it a single-entry category. Workflow / State Machine is the general primitive that justifies the category: Approval Step is a specific kind of state machine (one designed for human approval decisions); Workflow / State Machine is the general case. The two atoms compose into Stateful Workflow Execution (C10), which produces multi-actor gated workflows with tamper-evident transition histories — a pattern that recurs in regulated manufacturing, financial operations, and HR processes. Once this atom lands, the workflow category stands on its own and the broader axial-split taxonomy question can be revisited with two workflow atoms as evidence.

**Key invariants (anticipated).** Only declared transitions are valid — an undeclared transition is rejected with `invalid-transition`. The current state is always exactly one of the declared states. The full transition history — prior state, target state, triggering action, timestamp, actor — is auditable and append-only. A state declared as terminal at instantiation is absorbing — no further transitions are accepted. Transition guards are declared at instantiation; the atom enforces that a guard must be `satisfied` before a transition fires, but does not evaluate the guard — that is the caller's obligation.

**Standards anchored.** FDA 21 CFR Part 11 (electronic records in regulated workflows — each state transition is a regulated event); ISO 9001 §8.5.1 (production workflow controls); BPMN 2.0 (the canonical notation for stateful workflow — this atom is the primitive behind a BPMN state diagram); HL7 FHIR Task resource (clinical workflow state machine — Task states map directly to this atom's state machine).

**Unlocks.** Stateful Workflow Execution (C10). Resolves the workflow-category one-atom question.

---

### 10. Preference / Personalization

**Category:** `atoms/messaging/`

**Status:** Not started.

**What it is.** A messaging primitive: a durable binding of a principal's delivery preferences — channel priority, frequency limits, quiet hours, format preferences, per-topic opt-downs — that governs *how* a notification reaches a recipient, independently of *whether* they are subscribed (Subscription) or *whether* processing is legally permitted (Consent). The three atoms are distinct: Subscription governs which topics a principal follows; Consent governs whether the system may process or communicate with the principal at all; Preference governs the delivery envelope when Subscription and Consent have both permitted the notification. States: Active, Suspended (preferences retained but delivery suppressed for the principal), Deleted.

**Why it's last.** Subscription, Notification, and Notification Fanout are all grounded; Consent is grounded. The next natural question in the messaging surface is: *how does a subscriber control the shape of delivery?* Preference / Personalization is the atom that answers it. It sits last in the planned sequence because the composing surface (Preference-Aware Notification Fanout, C11) is narrower than the other remaining atoms', not because the atom is less important — it just unblocks one composition rather than several.

**Key invariants (anticipated).** A principal has at most one active Preference record — preferences are not additive; a new preference set replaces the prior one (with the prior set retained in history). Preference updates are not retroactive — a notification already queued before an update is delivered under the prior preferences; the update governs future deliveries only. A Suspended Preference record suppresses delivery without removing subscriptions — the subscriber retains their topic bindings while suppressing notifications. Preference / Personalization does not define what channels exist or what format options are valid — those are deployment-specific enumerations declared at instantiation.

**Standards anchored.** CAN-SPAM Act (opt-out and frequency controls for commercial email); TCPA (frequency and consent controls for SMS and phone marketing); GDPR Article 7(3) (preference changes must be as easy as the original grant — the Preference atom's update action is the mechanism).

**Unlocks.** Preference-Aware Notification Fanout (C11).

---

## Grounded atoms — short status (formerly atoms #1–#6, #8)

The seven atoms below were on the planned sequence and have shipped. Detailed authoring notes are in the atom files themselves; the entries below are retained as roadmap-history.

- **[Legal Hold](./atoms/compliance/legal-hold.md)** — `grounded` 2026-05-13. Compliance primitive; actor-issued hold preventing record purge regardless of retention eligibility. Unblocked C1 (Defensible Retention, now grounded) and C7 (DSAR).
- **[Consent](./atoms/compliance/consent.md)** — `grounded` 2026-05-13. Compliance primitive; data subject's agreement to a specified processing purpose with grant/revoke/expire lifecycle. Unblocked C2 (Consent & Preference Management), C7 (DSAR), C8 (KYC).
- **[Soft Delete](./atoms/resource-lifecycle/soft-delete.md)** — `grounded` 2026-05-13. Resource-lifecycle primitive; recoverable deletion with explicit purge. Unblocked C3 (Forensic Recovery).
- **[Approval Step](./atoms/workflow/approval-step.md)** — `grounded` 2026-05-13. Workflow primitive; single approval gate with Pending/Approved/Rejected/Withdrawn lifecycle. Unblocked C4 (Multi-Party Approval, now grounded). First entry in `atoms/workflow/`.
- **[Selective Disclosure](./atoms/compliance/selective-disclosure.md)** — `grounded` 2026-05-13. Compliance primitive; durable record of what subset of a record was disclosed, to whom, when, and under what authority. Unblocked C6 (Immutable Transaction Ledger) and C7 (DSAR).
- **[Party Identity](./atoms/compliance/party-identity.md)** — `grounded` 2026-05-14. Compliance primitive; persistent verifiable identity record for an external party with Unverified/Verified/Suspended/Closed lifecycle. Unblocked C8 (KYC / Customer Onboarding). Survived foundation round plus Opus Phase 4 clearance gate; six clearance-gate findings closed in-pattern.
- **[Capacity Constraint Enforcement](./atoms/resource-lifecycle/capacity-constraint-enforcement.md)** — `grounded` 2026-05-15. Resource-lifecycle primitive; named, bounded pool of a finite resource with arithmetic enforcing *total allocated never exceeds declared capacity* under four named host obligations. Unblocked C9 (Reservation Lifecycle). Foundation round plus two Phase 4 Opus clearance-gate rounds (round 1: 11 foundational findings closed; round 2: 3 foundational + 5 refining + 1 rhetorical closed). First atom grounded under the 95%-good threshold codified in this revision of PRESSURE_TESTING.md.

---

## Compositions — current state

Compositions are sequenced by readiness. Of the twelve C-numbered compositions, three are grounded (C1, C4, C5); six are unblocked and not started (C2, C3, C6, C7, C8, C9); three are blocked on remaining atoms (C10 on Workflow / State Machine, C11 on Preference / Personalization, C12 on Provenance). Provenance also enriches three other compositions (C6, C7, C8) as an optional composing atom for chain-of-custody guarantees — those compositions remain unblocked without it, but gain emergent invariants when composed with it once it lands.

---

### Grounded

- **[C1. Regulated Record Retention & Defensible Deletion](./compositions/defensible-retention.md)** — `grounded` 2026-05-13. Legal Hold + Audit Trail + Retention Window. Foundation, Round 2, and AI-conducted Round 3 (Opus) all clean. Anchors SOX, HIPAA, SEC Rule 17a-4, GDPR Article 17, FRCP Rule 37(e).
- **[C4. Multi-Party Approval](./compositions/multi-party-approval.md)** — `grounded` 2026-05-13. Approval Step + Permissions + Assignment + Audit Trail (substrate). Foundation, Round 2 (human), and Round 3 (Opus Super-Torvalds) all clean. Anchors SOX §404, FDA 21 CFR Part 11, ICH E6 GCP, ISO 9001 §8.5.1.
- **[C5. Notification Fanout](./compositions/notification-fanout.md)** — `grounded` 2026-05-13. Subscription + Notification. Foundation plus Opus adversarial pass (26 findings, all resolved). Completes the messaging atom pair and formalizes the fan-out boundary rule from the Execution Contract.

---

### Unblocked, not started

These compositions have all their constituent atoms grounded. They are ready for authoring; sequencing is by regulatory-coverage value and emergent-invariant interest.

#### C2. Consent & Preference Management with Revocation Propagation

**Prerequisites:** Consent + Audit Trail + Retention Window + Permissions + Event Log — all grounded.

**What it adds.** Consent made operational — checked before every processing action, propagated on revocation, auditable for regulatory proof. Emergent invariants: no processing action proceeds under a Consent basis without a `permitted` result for the relevant purpose scope; a revocation triggers an audit record naming every downstream scope affected; the full consent history is recoverable from the records alone.

**Standards anchored.** GDPR Articles 6–7, GDPR Article 7(3), CCPA/CPRA, HIPAA Authorization §164.508.

#### C3. Forensic Recovery

**Prerequisites:** Soft Delete + Event Log + Actor Identity + Audit Trail — all grounded.

**What it adds.** Soft deletion made forensically complete — every deletion, restoration, and purge is attribution-stamped and tamper-evident; the full lifecycle of every soft-deleted record is recoverable from the audit trail. Emergent invariant: no soft-deleted record is purged without an auditable record naming who purged it, when, and under what authority.

**Standards anchored.** GDPR Article 17, HIPAA PHI destruction, e-discovery preservation obligation.

#### C6. Immutable Transaction Ledger with Selective Disclosure

**Prerequisites:** Selective Disclosure + Event Log + Tamper Evidence + Actor Identity + Retention Window + Idempotent Reservation — all grounded.

**What it adds.** A transaction record both non-repudiable and selectively shareable — the full ledger is tamper-evident and attribution-stamped; a subset can be disclosed without breaking the integrity of the remainder. Emergent invariant: a disclosed subset is itself tamper-evident; the undisclosed portion is not compromised by the disclosure.

**Standards anchored.** Financial services (trade confirmation, settlement records); healthcare billing; clinical trials (regulatory submission).

#### C7. Data Subject Rights Fulfillment (DSAR)

**Prerequisites:** Legal Hold + Consent + Selective Disclosure + Audit Trail + Retention Window + Actor Identity + Event Log — all grounded.

**What it adds.** Data subject rights made mechanically answerable — a DSAR request triggers a structured query across the composition's records; the response is provably complete, accurate, and timely. Emergent invariants: no record touching the data subject is omitted without an auditable reason (active Legal Hold, third-party confidentiality); every disclosure made in response is recorded in the Selective Disclosure store.

**Standards anchored.** GDPR Articles 15–20, CCPA/CPRA, HIPAA individual right of access (§164.524).

#### C8. KYC / Customer Onboarding with Ongoing Monitoring

**Prerequisites:** Party Identity + Consent + Audit Trail + Event Log + Idempotent Reservation + Retention Window + Actor Identity — all grounded (Party Identity completed 2026-05-14).

**What it adds.** Customer onboarding made regulatorily complete — every identity verification step is attribution-stamped and tamper-evident; the onboarding record is immutable from the moment the customer is enrolled; ongoing screening triggers (sanctions list match, PEP status change, adverse media) are recorded as events against the Party Identity record. Emergent invariant: no customer proceeds to active status without a verified Party Identity record; no Party Identity verification is performed without a corresponding Audit Trail entry.

**Standards anchored.** FATF Recommendations 10–12, BSA/AML (31 CFR §1020.220), FinCEN beneficial ownership rule (31 CFR §1010.230), EU 5th Anti-Money Laundering Directive.

**Newly unblocked.** This composition was blocked on Party Identity through 2026-05-13; it is unblocked as of 2026-05-14 and is the natural first composition to author after the Party Identity gate cleared.

#### C9. Reservation Lifecycle

**Prerequisites:** Capacity Constraint Enforcement + Provisional Commitment + Duplicate Prevention + Event Log + Actor Identity — all grounded (Capacity Constraint Enforcement completed 2026-05-15).

**What it adds.** The full arc of a reservation: capacity query against the pool, provisional hold against a specific slot, idempotent confirmation under concurrent demand, and eventual resolution — confirmed, cancelled, or expired. Emergent invariants: confirmed reservations never exceed pool capacity; a cancelled or expired reservation releases its slot back to the pool atomically; no reservation transitions to Confirmed unless its provisional hold is still Active at confirmation time.

**Standards anchored.** Booking and ticketing systems; financial settlement (credit limit enforcement); supply chain and inventory.

**Newly unblocked.** This composition was blocked on Capacity Constraint Enforcement through 2026-05-14; it is unblocked as of 2026-05-15.

---

### Blocked on remaining atoms

#### C12. Chain of Custody

**Prerequisites:** Provenance *(atom #7 — not started)* + Actor Identity + Tamper Evidence + Retention Window + Audit Trail — all grounded except Provenance.

**What it adds.** A complete chain-of-custody record for a thing — a physical item, a digital artifact, a sample, a document — from origin through every transfer, transformation, and terminal disposition. Every custody event is attribution-stamped and tamper-evident; the full chain is reconstructable from the records alone with no gaps permitted. Emergent invariants: no custody event is recorded without a named custodian and a timestamp; no gap between consecutive custody events is a valid state; the chain is append-only and tamper-evident at every link.

**The cross-domain thesis in one example.** Pharmaceutical chain of custody (FDA 21 CFR Part 211 — drug sample from manufacturer through distributor to pharmacy) and evidence chain of custody (legal forensics — item from crime scene through lab to court) are structurally identical. Same atoms, same emergent invariants, different domain vocabulary. One grounded composition serves both. This is the library's core claim made concrete: the pattern belongs in one place, not reinvented in every domain that needs it.

**Standards anchored.** FDA 21 CFR Part 211 (pharmaceutical chain of custody); DEA 21 CFR Part 1304 (controlled substance handling records); Federal Rules of Evidence 901(b)(9) (chain of custody as authentication for physical evidence); ISO 17025 (laboratory sample handling and traceability); ASTM E1492 (evidence handling in forensic science).

**Unlocks.** A worked example of cross-domain pattern reuse — the library's strongest argument for the open-commons model. Natural reference case for grant submissions and early adopter conversations in healthcare and legal tech.

---

#### C10. Stateful Workflow Execution

**Prerequisites:** Workflow / State Machine *(atom #9 — not started)* + Approval Step (grounded) + existing: Permissions, Assignment, Event Log, Actor Identity, Audit Trail.

**What it adds.** A multi-actor gated workflow made auditably complete — declared-state transitions enforced by the Workflow / State Machine atom; human approval gates enforced by Approval Step instances; assignment of work to actors enforced by Assignment; permissions to trigger transitions enforced by Permissions. Emergent invariants: no state transition proceeds without the required approval gate cleared; no approval is granted by an actor lacking the required permission; the full workflow history is tamper-evident and attribution-stamped.

**Standards anchored.** SOX §404, FDA 21 CFR Part 11, ISO 9001 §8.5.1, BPMN 2.0.

#### C11. Preference-Aware Notification Fanout

**Prerequisites:** Preference / Personalization *(atom #10 — not started)* + existing: Subscription, Notification (grounded); Notification Fanout composition (grounded).

**What it adds.** Notification Fanout extended with per-subscriber delivery shaping — the fanout step consults each subscriber's Preference record and adjusts channel, format, and rate. Emergent invariants: a Suspended Preference record suppresses delivery even when Subscription is Active; frequency-cap violations are held or dropped per declared policy rather than silently delivered; the `failed` list distinguishes delivery-attempted-and-failed from delivery-suppressed-by-preference.

**Standards anchored.** CAN-SPAM, TCPA, GDPR Article 7(3).

---

## Summary table

| # | Pattern | Type | Status | Unblocks / Notes |
|---|---------|------|--------|------------------|
| — | Personal Todo, Assignment | Atoms | `grounded` 2026-05-13 | `atoms/productivity/` |
| — | Duplicate Prevention, Event Log | Atoms | `grounded` 2026-05-13 | `atoms/temporal/` |
| — | Provisional Commitment | Atom | `grounded` 2026-05-13 | `atoms/resource-lifecycle/` |
| — | Actor Identity, Retention Window, Tamper Evidence, Permissions | Atoms | `grounded` 2026-05-13 | `atoms/compliance/` |
| — | Subscription, Notification | Atoms | `grounded` 2026-05-13 | `atoms/messaging/` |
| — | Clinical Observation, Medication Order | Atoms | `grounded` 2026-05-13 | `atoms/healthcare/` (outside core sequence) |
| 1 | Legal Hold | Atom | `grounded` 2026-05-13 | C1, C7 |
| 2 | Consent | Atom | `grounded` 2026-05-13 | C2, C7, C8 |
| 3 | Soft Delete | Atom | `grounded` 2026-05-13 | C3 |
| 4 | Approval Step | Atom | `grounded` 2026-05-13 | C4 |
| 5 | Selective Disclosure | Atom | `grounded` 2026-05-13 | C6, C7 |
| 6 | Party Identity | Atom | `grounded` 2026-05-14 | C8 |
| 7 | Provenance | Atom | Not started | Enriches C6, C7, C8 (optional) |
| 8 | Capacity Constraint Enforcement | Atom | `grounded` 2026-05-15 | C9 |
| 9 | Workflow / State Machine | Atom | Not started | C10; resolves workflow-category question |
| 10 | Preference / Personalization | Atom | Not started | C11 |
| — | Undo History | Composition | `grounded` 2026-05-13 | Personal Todo + Event Log |
| — | Idempotent Reservation | Composition | `grounded` 2026-05-13 | Provisional Commitment + Duplicate Prevention |
| — | Audit Trail | Composition | `grounded` 2026-05-13 | Event Log + Actor Identity + Retention Window + Tamper Evidence |
| — | Shared Todo | Composition | `grounded` 2026-05-13 | Personal Todo + Permissions + Assignment |
| — | Notification Fanout | Composition | `grounded` 2026-05-13 | Subscription + Notification |
| — | Attributed Permissions Admin | Composition | `grounded` 2026-05-18 | Permissions + Actor Identity; first two-compliance-atom composition; ships with dynamic Alloy trace model |
| C1 | Defensible Retention | Composition | `grounded` 2026-05-13 | Legal Hold + Audit Trail + Retention Window |
| C2 | Consent & Preference Management | Composition | Unblocked; not started | Consent (grounded) |
| C3 | Forensic Recovery | Composition | Unblocked; not started | Soft Delete (grounded) |
| C4 | Multi-Party Approval | Composition | `grounded` 2026-05-13 | Approval Step + Permissions + Assignment + Audit Trail |
| C6 | Immutable Transaction Ledger | Composition | Unblocked; not started | Selective Disclosure (grounded) |
| C7 | Data Subject Rights Fulfillment | Composition | Unblocked; not started | Legal Hold + Consent + Selective Disclosure (all grounded) |
| C8 | KYC / Customer Onboarding | Composition | Unblocked; not started — **newly unblocked 2026-05-14** | Party Identity + Consent (both grounded) |
| C9 | Reservation Lifecycle | Composition | Unblocked; not started — **newly unblocked 2026-05-15** | Capacity Constraint Enforcement (grounded) + Provisional Commitment + Duplicate Prevention |
| C10 | Stateful Workflow Execution | Composition | Blocked on atom #9 | Workflow / State Machine + Approval Step |
| C12 | Chain of Custody | Composition | Blocked on atom #7 | Provenance + Actor Identity + Tamper Evidence + Retention Window + Audit Trail — cross-domain reference case (pharma + legal evidence = same atoms) |
| C11 | Preference-Aware Notification Fanout | Composition | Blocked on atom #10 | Preference / Personalization |

---

## Methodology debts — open

These are methodology-level items the library has accumulated and not yet resolved. They are recorded here so a future session picks them up rather than re-deriving them.

**1. Propagation pass for the 95%-good threshold and three-class finding taxonomy.** [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) §"What grounded means" was extended on 2026-05-15 with the *95%-good grounding threshold* (a pattern grounds when the Phase 4 clearance gate's foundational findings reach zero, even if refining and rhetorical findings remain) and the *foundational / refining / rhetorical* three-class finding taxonomy. Capacity Constraint Enforcement is the first atom whose Lineage notes were authored under the new taxonomy and the new compact finding-→-fix line format (*F-id — short name — class → fix in one or two sentences*). All other grounded patterns retain Lineage notes in the prior narrative-paragraph form and Status lines that reference the prior unbounded "gate runs again until clean" rule rather than the threshold. A propagation pass should: (a) update each grounded pattern's Status line to reference the threshold and the foundational-density-at-grounding count, (b) refactor each pattern's Lineage notes to the compact format with explicit class labels per finding, (c) process in dependency order (atoms before compositions that name them) so cross-references stay stable. Priority order for the pass: Party Identity (most recent prior gate-clearing atom; the format is most directly comparable), then the canonical regulated-audit stack (Event Log, Actor Identity, Retention Window, Tamper Evidence, Audit Trail), then the remaining atoms and compositions in their grounded-date order.

**2. Methodology cross-reference from existing pattern Lineage notes to the threshold.** Patterns whose Lineage notes refer to "the gate runs again until clean" or similar pre-threshold phrasing should be updated to point at PRESSURE_TESTING.md §"The 95%-good grounding threshold" once the propagation pass runs. This is a substring-search-and-replace rather than a content rewrite; the existing findings and fixes stay, only the methodology rationale anchors update.

**3. Decide whether the threshold counts toward grandfathering.** Patterns grandfathered at `grounded` before the AI adversarial round was codified (per PRESSURE_TESTING.md §"What grounded means" — "Grandfathered patterns") have not been subjected to a Phase 4 clearance gate at all, much less under the 95%-good threshold. The grandfathering clause currently says they will be brought to the full nine-pass standard in a dedicated re-pass sweep. Question for that future sweep: does running Phase 4 under the threshold count as bringing them to standard, or is a pre-threshold-era clean Phase 4 required first? The pragmatic read is yes — the threshold is a refinement on what *clean* means, not a different standard — but the question should be resolved when the sweep is scheduled, not before.

**4. Author-fatigue / round-count signal.** Capacity Constraint Enforcement required two Phase 4 rounds (11 + 9 findings closed across both) before clearing under the new threshold. The library's prior gate-clearing pattern (Party Identity) cleared in one round (6 findings). The two-round count for CCE is correlated with the atom's surface area — 14 invariants, four host obligations, two state machines, regulated overlay, eight composing patterns. The empirical pattern: more surface = more rounds, with diminishing structural-finding density per round. The threshold is what makes the loop terminate cleanly. No action required, but a useful data point for future rich-surface atoms (Workflow / State Machine and Provenance are likely candidates).

---

## Open taxonomy question

The `workflow/` category currently holds one atom (Approval Step). The category will be on firmer footing once Workflow / State Machine (atom #9) lands as the second workflow-category atom; until then, the one-atom-category concern noted in [`CLAUDE.md`](./CLAUDE.md) remains open.

The broader axial-split question across all categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`, `messaging`, `workflow`, `healthcare`) also remains open. The current categories mix conceptual axes — `healthcare` is domain-scoped while the others are concept-scoped; `compliance` mixes pure-compliance-infrastructure atoms with atoms-that-happen-to-be-regulated. The right axial split (potentially: domain as a frontmatter attribute rather than a folder; regulation as a `regulated: true` flag rather than a folder placement) will be forced by content as the catalog grows past the size where preemptive cuts are reasonable. Restructuring earlier would relocate the same confusion under different labels.

---

*The roadmap is a living document. Patterns are added as the library's content forces resolution of open questions, not on a fixed schedule.*
