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

## Current state — 2026-05-25

Twenty-four atoms and twelve compositions are `grounded`; one atom (Preference / Personalization, atom #10) is `partially resolved` — author-conducted foundation passes complete, awaiting fresh-reader AI Phase 3 round and the Opus Phase 4 readiness check. The next move on the atom side is one of the two remaining unstarted planned atoms (#7 Provenance, #9 Workflow / State Machine), advancing Preference through Phase 3 and Phase 4 to `grounded`, or one of the nine unblocked compositions (C2, C3, C6, C7, C8, C9, C15, C17, C18 — see compositions section); C11 unblocks once Preference grounds.

**Atoms grounded:**

- `atoms/compliance/` (12): Actor Identity, Capability, Consent, Credential, Invitation, Legal Hold, Party Identity, Permissions, Retention Window, Selective Disclosure, Session, Tamper Evidence
- `atoms/healthcare/` (2): Clinical Observation, Medication Order
- `atoms/messaging/` (2): Notification, Subscription
- `atoms/productivity/` (2): Assignment, Personal Todo
- `atoms/resource-lifecycle/` (3): Capacity Constraint Enforcement, Provisional Commitment, Soft Delete
- `atoms/temporal/` (2): Duplicate Prevention, Event Log
- `atoms/workflow/` (1): Approval Step

**Atoms partially resolved:**

- `atoms/messaging/`: Preference / Personalization — drafted 2026-05-25; author-conducted Pass 1 / Pass 2 / Pass 3 plus one refinement round complete; Phase 3 fresh-reader AI round and Phase 4 Opus clearance gate outstanding.

**Compositions grounded:** Attributed Permissions Admin, Audit Trail, Defensible Retention, External Onboarding, Idempotent Reservation, Login, Multi-Party Approval, Notification Fanout, Privileged Access Provisioning, Session-Gated Authorization, Shared Todo, Undo History.

The healthcare atoms (Clinical Observation, Medication Order) are outside the core dependency-ordered sequence — they were authored as worked examples of the methodology applied to a domain where the regulatory surface is HIPAA and 21 CFR Part 11 rather than the BSA/AML/GDPR/SOX cluster the compliance atoms anchor. They are grounded and composable; their downstream compositions (e.g., a Clinical Trial Data Capture composition, a Medication Administration Record composition) are not on this roadmap yet because the worked-example value is in the atoms themselves rather than in any specific composition the library is committed to delivering next.

---

## Remaining atoms — in draft order

Seven atoms remain on the planned-sequence list. They are sequenced by how many downstream compositions they unblock.

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

**Status:** `partially resolved` 2026-05-25 — drafted. Author-conducted foundation passes (Pass 1 GRID, Pass 2 EOS, Pass 3 Linus) and one refinement round complete; Phase 3 fresh-reader AI round and Phase 4 Opus Happy Torvalds X2 clearance gate outstanding. The drafted atom lives at [`atoms/messaging/preference.md`](./atoms/messaging/preference.md). The five anticipated invariants below are realized in the draft as ten invariants spanning record immutability, status monotonicity, at-most-one-currently-in-effect, supersession atomicity, channel-set membership at creation, value-preserving suspension, query determinism, no id reuse, store durability, and timestamp ordering.

**What it is.** A messaging primitive: a durable binding of a principal's delivery preferences — channel priority, frequency limits, quiet hours, format preferences, per-topic opt-downs — that governs *how* a notification reaches a recipient, independently of *whether* they are subscribed (Subscription) or *whether* processing is legally permitted (Consent). The three atoms are distinct: Subscription governs which topics a principal follows; Consent governs whether the system may process or communicate with the principal at all; Preference governs the delivery envelope when Subscription and Consent have both permitted the notification. States: Active, Suspended (preferences retained but delivery suppressed for the principal), Deleted.

**Why it's last.** Subscription, Notification, and Notification Fanout are all grounded; Consent is grounded. The next natural question in the messaging surface is: *how does a subscriber control the shape of delivery?* Preference / Personalization is the atom that answers it. It sits last in the planned sequence because the composing surface (Preference-Aware Notification Fanout, C11) is narrower than the other remaining atoms', not because the atom is less important — it just unblocks one composition rather than several.

**Key invariants (anticipated).** A principal has at most one active Preference record — preferences are not additive; a new preference set replaces the prior one (with the prior set retained in history). Preference updates are not retroactive — a notification already queued before an update is delivered under the prior preferences; the update governs future deliveries only. A Suspended Preference record suppresses delivery without removing subscriptions — the subscriber retains their topic bindings while suppressing notifications. Preference / Personalization does not define what channels exist or what format options are valid — those are deployment-specific enumerations declared at instantiation.

**Standards anchored.** CAN-SPAM Act (opt-out and frequency controls for commercial email); TCPA (frequency and consent controls for SMS and phone marketing); GDPR Article 7(3) (preference changes must be as easy as the original grant — the Preference atom's update action is the mechanism).

**Unlocks.** Preference-Aware Notification Fanout (C11).

---

### 11. Credential

**Category:** `atoms/compliance/` *(provisional; candidate for a future `atoms/security/` or `atoms/identity/` category if the taxonomy refactor executes — see Open taxonomy question)*

**Status:** Not started.

**What it is.** An authentication primitive: a durable binding between a principal and a secret or token that the principal presents to prove they are who they claim to be. Credential models the registration of that binding, the verification of presented material against it, the rotation of the binding to a new secret while retiring the prior one, and the revocation of the binding entirely. Each credential record is tied to exactly one principal at registration and that binding is immutable; rotation produces a *new* credential record bound to the same principal, never a mutation of the prior one. The prior record transitions to the terminal state `Rotated`, preserving the full rotation history in the record store. Actions: `register`, `verify`, `rotate`, `revoke`.

**Why it's next.** Credential retires the `Authentication *(forthcoming)*` debt in [`atoms/compliance/actor-identity.md`](./atoms/compliance/actor-identity.md) — Actor Identity verifies *who* an actor is; Credential is the mechanism by which that verification is operationalized as a bound secret the actor can present. The two atoms are distinct: Actor Identity is a persistent identity record; Credential is the authentication surface the identity record can bind. Of the four new atoms, Credential and Session are the highest-leverage pair: Credential strictly blocks C13 (Login), which wires Credential verification to Session issuance. It additionally enriches C16 (External Onboarding), where a credential is registered at the moment an invited party's identity is accepted.

**Key invariants (anticipated).** `verify` returns `verified` only for the principal bound at registration — sole-holder verification is absolute. Once a credential transitions to `Revoked`, no future `verify` call returns `verified` — revocation is absorbing. Rotation never mutates the prior credential record; it produces a new record and transitions the prior record to `Rotated`. State machine: Active → Rotated | Revoked | Expired (three terminal states). The full rotation and revocation history is auditable from the record store alone.

**Standards anchored.** NIST SP 800-63B (authenticator assurance levels — IAL/AAL tiers); OpenID Connect Core 1.0 (credential material exchange); RFC 7519 (JWT — credential token encoding); FIDO2/WebAuthn (phishing-resistant authenticator binding); PCI DSS Requirement 8 (credential management controls); ISO/IEC 27001 §A.9.4 (system and application access controls). Explicitly not citing NIST 800-63A — identity proofing belongs upstream to Party Identity.

**Unlocks.** Strictly blocks C13 (Login — Credential + Session + Actor Identity). Additionally enriches C16 (External Onboarding — the credential registration step in the onboarding arc).

---

### 12. Session

**Category:** `atoms/compliance/` *(provisional; candidate for `atoms/security/` or `atoms/identity/` if the taxonomy refactor executes)*

**Status:** Not started.

**What it is.** A time-limited authenticated channel primitive: a record attesting that a given principal was authenticated at a specific moment and that the authentication remains valid until the session expires or is explicitly revoked. Session does not perform authentication — that is Credential's surface. Session records the *result* of a successful authentication and makes it queryable by composing systems for the duration of its validity. Each session carries an `expires_at` timestamp set at issuance and never mutated; extension of a session produces a new session record, not a modification of the prior one. Actions: `issue`, `validate`, `expire`, `revoke`. State machine: Active → Expired | Revoked (two terminal states).

**Why it's next.** Session is the time-bounding surface that Credential verification produces: a successful `verify` produces a short-lived authenticated channel; that channel is a Session. Without Session, Credential verification has no durable expression that composing systems can query — Login (C13) needs both. Session additionally unblocks Session-Gated Authorization (C14), which gates every permission check on session validity before the permission check runs.

**Key invariants (anticipated).** A session is valid if and only if it has been issued, `now < expires_at`, and it has not been revoked — the validity bound is conjunctive. `validate(token)` returns `valid | invalid(expired | revoked | not-known)` — three first-class invalid outcomes, mirroring Actor Identity's `verify` discipline, never collapsed to a single `invalid`. Revocation is absorbing: a revoked session cannot be re-validated. `expires_at` is set at issue time and never mutated; a session that needs a longer lifetime is re-issued, not extended in place.

**Standards anchored.** NIST SP 800-63B §7 (session management and reauthentication requirements); OWASP ASVS V3 (session management verification standard); RFC 6265 (HTTP state management — cookie-based session binding); SAML 2.0 §4.1.4 (session establishment and termination); RFC 6819 (OAuth 2.0 threat model, session-related threat mitigations); OIDC Session Management 1.0 (session lifecycle and logout across identity providers).

**Unlocks.** Strictly blocks C13 (Login — Credential + Session + Actor Identity) and C14 (Session-Gated Authorization — Session + Permissions).

---

### 13. Capability

**Category:** `atoms/compliance/` *(provisional; the object-capability literature anchors this as a security primitive — candidate for `atoms/security/` if the taxonomy refactor executes)*

**Status:** Not started.

**What it is.** A bearer-token authorization primitive: an unforgeable token that carries its own authorization to access a specific resource or perform a specific action. The defining property of a Capability is that possession of the token is sufficient authorization — the redeemer's identity is intentionally irrelevant at redemption time. Capability generalizes single-use links (a password-reset link), multi-use API tokens (a service credential scoped to a single resource), and pre-authorized action tokens under one structural pattern. Each capability carries a `remaining_redemptions` counter set at allocation (default 1) and decremented monotonically on each redemption; a capability with `remaining_redemptions = 0` is exhausted and terminal. Actions: `allocate`, `redeem`. State machine: Allocated → Redeemed | Expired | Revoked (three terminal states, with exhaustion via counter being the structural route to Redeemed).

**Why it's next.** Capability is the library's forcing function for making the OCAP-vs-Permissions distinction explicit. Permissions is identity-keyed: a permission check gates on *who* is asking. Capability is bearer-keyed: the token gates on *what is being presented*, with no identity check at redemption time. The two atoms compose into structurally distinct patterns with different audit signatures. Without a Capability atom, a composing system is forced to model bearer-token semantics inside Permissions or an ad-hoc construct, hiding the architectural distinction the library exists to make visible. Capability strictly blocks C15 (Capability-Backed Sharing), the library's worked example of bearer-token semantics composing with regulated audit.

**Key invariants (anticipated).** Redemption requires only possession of the token — no identity check at redemption time; the redeemer's identity is structurally irrelevant and intentionally so. The allocator's identity is recorded at allocation time and attestable via Actor Identity, producing an asymmetric audit record: allocator is known, redeemer is not. `remaining_redemptions` is set at allocation and decremented monotonically; it never increases. Exhaustion (counter at 0), expiry, and revocation are three structurally distinct terminal modes and are never conflated in the record or in validation logic.

**Standards anchored.** Daniel Jackson, *Software Abstractions* — `Capability [Resource]` concept (the atom's structural core); Mark Miller and the object-capability (OCAP) literature (bearer-key authorization semantics); Levy (1984), *Capability-Based Computer Systems* (canonical reference for bearer-token capability semantics); Birgisson et al. (2014), *Macaroons* (context-limited bearer credentials — a constrained Capability variant); RFC 6749 §1.4 (OAuth 2.0 access tokens — cited with explicit caveats about OAuth's identity-bound conflations diverging from pure OCAP; this atom defines the pure OCAP surface, not the OAuth surface).

**Unlocks.** Strictly blocks C15 (Capability-Backed Sharing — Capability + Selective Disclosure + Audit Trail substrate). The atom's primary value on EOS Pass 2 is forcing the OCAP-vs-Permissions distinction to be made explicit in the library.

---

### 14. Invitation

**Category:** `atoms/compliance/` *(provisional; plausible future `atoms/identity/` candidate given that its core concern is onboarding an external entity into a system identity context, not compliance infrastructure per se)*

**Status:** Not started.

**What it is.** A lifecycle primitive for inviting an external entity to join a context: a durable record of the invitation event itself, from the moment the invitation is issued through its resolution — accepted, declined, expired, or revoked before resolution. The defining property of Invitation is that the invitee's identity may not be known or validatable at initiation time; the moment of acceptance is when an identity is bound. Actions: `initiate`, `accept`, `decline`, `revoke`, `expire`. State machine: Pending → Accepted | Declined | Expired | Revoked (four terminal states). `accept` carries an `accepting_identity_ref` argument — the identity is bound at the moment of acceptance and is immutable thereafter.

**Why it's next.** Invitation is the library's mechanism for onboarding an unknown external entity into a system identity context. Party Identity (atom #6, grounded) models a persistent verifiable identity; Invitation is the gate through which an external party first enters the identity surface. Without Invitation, the library has no structured account of how an external party comes to exist in the system at all — C16 (External Onboarding) cannot be specified without it. Invitation also completes the Capability-vs-Invitation design question (see Open taxonomy question): both atoms use bearer-token transport; the distinction is that Invitation carries `Declined` as a first-class semantic outcome (a human decision, not a system event) and binds an identity at resolution — two properties Capability does not have.

**Key invariants (anticipated).** Exactly one transition out of `Pending` — once an invitation has been accepted, declined, expired, or revoked, any subsequent action attempt returns `already-resolved(state)`. The `invitee_ref` at initiation may not resolve to a known system identity; it is not validated at initiate time and is not required to match the `accepting_identity_ref` at accept time — opaque invitee at initiation is structurally intentional. The identity bound at acceptance (`accepting_identity_ref`) is immutable once set; it cannot be rebound or updated after the accept transition.

**Standards anchored.** GDPR Article 32 (security of processing — invitation tokens are credentials in transit and must be treated accordingly); HIPAA §164.312 (access control requirements — invitation-based provisioning is a covered access-granting mechanism); SCIM 2.0 (System for Cross-domain Identity Management — invitation-style user provisioning is adjacent to SCIM's `POST /Users` with an invite flow). Standards anchoring is lighter for Invitation than for Credential, Session, or Capability; the atom earns its keep on EOS Pass 2 conceptual independence rather than regulatory depth.

**Unlocks.** Strictly blocks C16 (External Onboarding — Invitation + Party Identity + Credential + Audit Trail substrate).

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

Compositions are sequenced by readiness. Of the seventeen C-numbered compositions, six are grounded (C1, C4, C5, C13, C14, C16); eight are unblocked and not started (C2, C3, C6, C7, C8, C9, C15, C17); three are blocked on remaining atoms (C10 on Workflow / State Machine, C11 on Preference / Personalization, C12 on Provenance). Provenance also enriches three other compositions (C6, C7, C8) as an optional composing atom for chain-of-custody guarantees — those compositions remain unblocked without it, but gain emergent invariants when composed with it once it lands.

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

#### C17. Authenticated Actor

**Prerequisites:** Credential (atom #11 — `grounded` 2026-05-19) + Actor Identity (grounded). Both grounded; unblocked as of 2026-05-21.

**What it adds.** The formal relationship between a principal's authentication credential and their attestation key — two identity surfaces the individual atoms define independently but whose relationship they leave unspecified. Three emergent invariants the individual atoms do not own: (1) **Revocation cascade** — whether `Credential.revoke` must cascade to invalidate the Actor Identity attest surface, closing the gap where a principal whose login is revoked can still sign attestations; (2) **Secret surface separation** — whether the same cryptographic material may serve both as the Credential verifier and the Actor Identity attest key, or whether the surfaces must be distinct; (3) **Namespace binding** — how `principal_ref` (Credential's identity key) and `actor_ref` (Actor Identity's identity key) are formally bound to the same human or system principal, preventing an audit record attributed to a different identity surface than the session record it corresponds to. Implementation-discovered gap: see `demos/attributed-permissions-admin/CORNERS.md` §Cross-atom identity surface aliasing.

**Standards anchored.** NIST SP 800-63B §5.2 (verifier requirements — separation of authentication secrets from signing keys); NIST SP 800-57 Part 1 (key management — key separation by purpose); PCI DSS Requirement 8.6 (management of system and application accounts and authentication factors — distinct credential surfaces for distinct purposes); FIPS 140-3 (cryptographic module separation requirements).

**Newly unblocked.** Both constituent atoms grounded as of 2026-05-19. The gap was surfaced by implementation pressure on the Attributed Permissions Admin demo on 2026-05-21.

---

#### C18. Actor Suspension

**Prerequisites:** Actor Identity (grounded) + Permissions (grounded) + Session (grounded — via C13 Login) + Audit Trail (grounded). All grounded; unblocked at this entry's creation date. Optionally composes Credential (grounded) where policy requires deactivating the actor's credentials alongside their grants and sessions.

**What it adds.** Coordinated deactivation of an actor's authorization and authentication surfaces in one transactional boundary, with a single tamper-evident `actor.suspended` Audit Trail event naming the full scope of what was revoked. Three emergent invariants the individual atoms do not own: (1) **Atomicity of multi-surface revocation** — after `suspend_actor` returns success, the actor holds zero active grants in Permissions and zero active sessions in Session, all written under one transaction; a partial state (grants revoked but sessions still active, or vice versa) is not a reachable post-state. (2) **Audit completeness of revocation scope** — the `actor.suspended` event enumerates every `grant_id` and `session_token` revoked by the call, so an auditor can reconstruct from records alone which surfaces were taken offline at suspension time; a revocation that touches a grant or session whose id is not in the event payload is a finding. (3) **Suspension cascade ordering** — Actor Identity's status transition (Active → Suspended) is the precondition for the cascade; the cascade reads Actor Identity status as the gate, the same way Login's `revoke_sessions_for_credential` reads credential status. An attempted cascade against an already-Suspended actor is a no-op return with `{grants_revoked: 0, sessions_revoked: 0}`, not an error. The composition's Pass-3-shaped TOCTOU concern mirrors Login's FC1: one constituent revocation succeeds, another storage-fails, actor is now in a partial state. The default discipline is all-or-nothing under a single transaction boundary (matching Login's atomic-action commit pattern); a best-effort variant with partial-state attestation is named as a deployment-policy alternative.

**Standards anchored.** NIST SP 800-53 AC-2(3) (account management — disable accounts when no longer required) + AC-6(5) (least privilege — revoke unnecessary privileges); SOX §404 (internal controls over user access); HIPAA §164.308(a)(3)(ii)(C) (termination procedures — terminate access when employment ends); PCI DSS Requirement 8.1.3 (immediately revoke access for terminated users); ISO/IEC 27001 §A.9.2.6 (removal or adjustment of access rights).

**Newly unblocked.** All four constituent atoms grounded as of 2026-05-21. Named as a stretch item for the Clinical Trial Portal demo (`compositions/Demo2-plan.md` §Phase 7 — "soft-revoke pattern" for coordinated revocation of an actor's grants and sessions in one transaction emitting `actor.suspended`).

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

#### C13. Login

**Prerequisites:** Credential (atom #11 — `grounded` 2026-05-19) + Session (atom #12 — `grounded` 2026-05-19) + Audit Trail substrate (grounded). **Status: `grounded` 2026-05-20.**

**What it adds.** Credential verification wired to Session issuance, both attested under the verified principal. Login is the composition where a successful `verify` produces a record that persists the authentication result — the Session — rather than returning it as a transient signal. Emergent invariant: a Session is valid only if the Credential it was derived from remains Active; revocation of a Credential invalidates every Session derived from it — the cascade rule. The cascade lives in Login's emergent state (a derivation map from credential to issued sessions), not in either constituent atom, because neither atom alone knows the other exists. A composing system that revokes a Credential without cascading to sessions has produced a record set that violates the cascade invariant but not any invariant of either constituent atom alone — the gap is exactly the composition layer's job to close.

**Standards anchored.** NIST SP 800-63B (authenticator verification producing a bound session); OIDC Core 1.0 (the authorization-code login flow producing an ID token and session); SAML 2.0 (SSO authentication producing a session assertion).

#### C14. Session-Gated Authorization

**Prerequisites:** Session (atom #12 — `grounded` 2026-05-19) + Permissions (grounded). **Status: `grounded` 2026-05-20.**

**What it adds.** Every permission check gated on session validity — expired or revoked sessions reject all permission queries before the Permissions check runs. The gate is a pre-check at the composition boundary, not inside either constituent atom. Principal binding is the load-bearing emergent invariant: the `principal_ref` passed to `Permissions.permitted` is always the principal extracted from the validated session — never a caller-supplied value. A caller cannot interrogate permissions for an arbitrary principal by presenting an arbitrary session token. The composition introduces no cross-atom state; the gate is a sequencing constraint. Forensic coverage of individual authorization decisions requires [Audit Trail](../atoms/compliance/event-log.md) composed in as a substrate. Four emergent invariants: session gates authorization, principal binding, denial is not rejection, default deny. Grounded on Final Critique 4; three rounds of findings (GA two-tier restructure, implementation-boundary bypass edge case, Permissions fail-safe assumption named).

**Standards anchored.** NIST SP 800-53 AC-3 (Access Enforcement); NIST SP 800-53 AC-12 (Session Termination); NIST SP 800-63B §7 (session management); OWASP ASVS V3.3 (session expiry enforced at the resource level); PCI DSS Requirement 7 + 8; HIPAA §164.312(a)(1) + §164.312(d); ISO/IEC 27001 §A.9.4.1.

#### C15. Capability-Backed Sharing

**Prerequisites:** Capability *(atom #13 — not started)* + Selective Disclosure (grounded) + Audit Trail substrate (grounded).

**What it adds.** A capability token allocated to authorize disclosure of a record subset; redemption triggers the disclosure and the audit record in one wired step. The emergent invariant is the audit-subject asymmetry: the audit record reads "disclosed by bearer of capability X, allocated by actor Y at time T" — the allocator is identified (via the Capability atom's allocation provenance invariant), the redeemer is structurally not. This is the library's worked example of bearer-token semantics composing with regulated audit without breaking either: Selective Disclosure's invariants are satisfied (a disclosure record exists); Capability's bearer-key semantics are satisfied (no identity check at redemption); the Audit Trail records what was disclosed, by whom it was authorized, and that a bearer redeemed it. The load-bearing wiring decision: the audit-subject asymmetry is defended in-line in the composition because it is a property of the wiring, not of either constituent.

**Standards anchored.** GDPR Article 32 (security of sharing — capability tokens as access-control mechanism for regulated disclosures); HIPAA §164.514 (minimum necessary standard — a Capability can carry a scope constraint limiting what subset is accessible); OCAP literature (bearer-key authorization semantics, as anchored in Capability atom #13).

#### C16. External Onboarding

**Prerequisites:** Invitation (atom #14 — `grounded` 2026-05-19) + Credential (atom #11 — `grounded` 2026-05-19) + Party Identity (grounded) + Audit Trail substrate (grounded). **Status: `grounded` 2026-05-21.**

**What it adds.** The full arc of admitting an external entity: invitation issued by an authorized actor, accepted (binding the invitee's external identity reference at accept time, not initiate time), Party Identity enrolled in Unverified state, credential registered, every step attested in the Audit Trail. Load-bearing emergent invariant: invitation-gates-enrollment — no Party Identity is created unless `Invitation.accept` precedes it in the same `onboard` call, and the `onboarding.completed` Audit Trail event names invitation token, accepting identity reference, party record, and credential in one tamper-evident entry. The actor credential pre-check fires before `Invitation.accept` so unauthenticated callers cannot probe invitation validity. Five emergent invariants. Three rounds of findings resolved in-pattern (audit-first step ordering, invitation-state probing prevention, `duplicate-active-credential` vs `storage-failure` distinction, Invariant 4 qualifier for background-scheduler expiry). Grounded on Final Critique 4.

**Standards anchored.** GDPR Articles 6–7; HIPAA §164.312(a)(1) + §164.312(d); SOC 2 CC6.2; NIST SP 800-63A; SCIM 2.0 RFC 7644; FATF Recommendations 10–12 (enrollment record as the CDD starting point; verification is C8's concern).

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
| 10 | Preference / Personalization | Atom | `partially resolved` 2026-05-25 | C11; drafted at `atoms/messaging/preference.md`; awaiting Phase 3 fresh-reader AI round and Phase 4 Opus clearance gate |
| 11 | Credential | Atom | `grounded` 2026-05-19 | C13 (Login); enriches C16; retires Authentication forthcoming-link in actor-identity.md |
| 12 | Session | Atom | `grounded` 2026-05-19 | C13 (Login), C14 (Session-Gated Authorization) |
| 13 | Capability | Atom | `grounded` 2026-05-19 | C15 (Capability-Backed Sharing) |
| 14 | Invitation | Atom | `grounded` 2026-05-19 | C16 (External Onboarding) |
| — | Undo History | Composition | `grounded` 2026-05-13 | Personal Todo + Event Log |
| — | Idempotent Reservation | Composition | `grounded` 2026-05-13 | Provisional Commitment + Duplicate Prevention |
| — | Audit Trail | Composition | `grounded` 2026-05-13 | Event Log + Actor Identity + Retention Window + Tamper Evidence |
| — | Shared Todo | Composition | `grounded` 2026-05-13 | Personal Todo + Permissions + Assignment |
| — | Notification Fanout | Composition | `grounded` 2026-05-13 | Subscription + Notification |
| — | Attributed Permissions Admin | Composition | `grounded` 2026-05-18 | Permissions + Actor Identity; first two-compliance-atom composition; ships with dynamic Alloy trace model |
| — | Privileged Access Provisioning | Composition | `grounded` 2026-05-20 | Multi-Party Approval + Credential + Session + Capability + Audit Trail; approval-gates-provisioning invariant; session-gated exercise; TLA+ behavioral model ships alongside |
| — | Login | Composition | `grounded` 2026-05-20 | Credential + Session + Audit Trail; cascade invariant: Credential revocation invalidates all derived Sessions; `credential_to_sessions` map is the cascade mechanism |
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
| C11 | Preference-Aware Notification Fanout | Composition | Pending Preference grounding (atom #10 `partially resolved`) | Preference / Personalization + existing Subscription, Notification, Notification Fanout |
| C13 | Login | Composition | `grounded` 2026-05-20 | Credential + Session + Audit Trail; cascade invariant: Credential revocation invalidates all derived Sessions via `credential_to_sessions` map |
| C14 | Session-Gated Authorization | Composition | `grounded` 2026-05-20 | Session + Permissions; principal binding as emergent invariant — session-extracted principal gates every permission query |
| C15 | Capability-Backed Sharing | Composition | Unblocked; not started — **newly unblocked 2026-05-20** | Capability + Selective Disclosure + Audit Trail; library's worked example of bearer-token semantics composing with regulated audit |
| C16 | External Onboarding | Composition | `grounded` 2026-05-21 | Invitation + Credential + Party Identity + Audit Trail; invitation-gates-enrollment as load-bearing invariant; actor credential pre-check before Invitation.accept |
| C17 | Authenticated Actor | Composition | Unblocked; not started — **newly unblocked 2026-05-21** | Credential + Actor Identity; owns revocation cascade, secret surface separation, and principal_ref / actor_ref namespace binding. Implementation-discovered gap via APA demo. |
| C18 | Actor Suspension | Composition | Unblocked; not started — **newly unblocked 2026-05-23** | Actor Identity + Permissions + Session + Audit Trail; emergent invariants: atomicity of multi-surface revocation under one transaction, audit completeness over revocation scope, and suspension cascade ordering. Outbound-side counterpart to C13 Login's inbound credential cascade. Named as Demo2 Phase 7 stretch item. |

---

## Formal model coverage

Per `PRESSURE_TESTING.md §Formal models`, Alloy and TLA+ artifacts complement the three-pass methodology but are not prerequisites for `grounded` status. The inventory below records which grounded patterns currently ship formal-model siblings, and which have explicit deferred-formal-models entries in their Lineage notes.

### Shipped

| Pattern | Type | Alloy | TLA+ | Files |
|---|---|---|---|---|
| Capability | Atom | ✓ | — | `atoms/compliance/capability.als` + `capability_check.py` |
| Attributed Permissions Admin | Composition | ✓ | ✓ | `compositions/attributed-permissions-admin.als`, `attributedPermissionsAdmin.tla` + `.cfg` |
| Privileged Access Provisioning | Composition | — | ✓ | `compositions/privilegedAccessProvisioning.tla` + `.cfg` + `privileged_access_provisioning_check.py` |
| Login | Composition | — | ✓ | `compositions/login.tla` + `.cfg` |
| External Onboarding | Composition | — | ✓ | `compositions/externalOnboarding.tla` + `.cfg` |
| Session-Gated Authorization | Composition | ✓ | — | `compositions/session-gated-authorization.als` |

### Deferred — recorded in Lineage notes

| Pattern | Type | Candidate artifacts | Recorded |
|---|---|---|---|
| Preference / Personalization | Atom | TLA+ on supersession atomicity (Invariant 4) + linearizable-per-`principal_ref` requirement + check-4 indistinguishability; Alloy on the records relation (preference + configuration records, Invariants 5 and 10, bootstrap-ordering) | `atoms/messaging/preference.md` Lineage notes, Phase 4 round, *Deferred work — formal models* item |

### All other grounded patterns

No formal-model siblings shipped and no deferred-formal-models Lineage entry. Per the methodology this is a respectable state — `grounded` is the bar, formal models are the complement. New deferred candidates should land as a *Deferred work — formal models* item in the relevant pattern's Lineage notes (mirroring the Preference pattern), and graduate to this table's *Shipped* section when the artifact lands.

### Convention

A pattern moves from *Deferred* to *Shipped* when (a) the artifact exists at the path named here, (b) a *Formal model* entry is recorded in the pattern's Lineage notes per `PRESSURE_TESTING.md` (what the artifact is, what it checks, bounds/scope, deliberate exclusions, result), and (c) the row in this table is updated. Findings from formal-model runs route through the standard review channel — a contradiction inside the spec becomes a Pass-3-shaped finding in Lineage notes, not an in-flight spec rewrite.

---

## Methodology debts — open

These are methodology-level items the library has accumulated and not yet resolved. They are recorded here so a future session picks them up rather than re-deriving them.

**1. Propagation pass for the 95%-good threshold and three-class finding taxonomy.** [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) §"What grounded means" was extended on 2026-05-15 with the *95%-good grounding threshold* (a pattern grounds when the Phase 4 clearance gate's foundational findings reach zero, even if refining and rhetorical findings remain) and the *foundational / refining / rhetorical* three-class finding taxonomy. Capacity Constraint Enforcement is the first atom whose Lineage notes were authored under the new taxonomy and the new compact finding-→-fix line format (*F-id — short name — class → fix in one or two sentences*). All other grounded patterns retain Lineage notes in the prior narrative-paragraph form and Status lines that reference the prior unbounded "gate runs again until clean" rule rather than the threshold. A propagation pass should: (a) update each grounded pattern's Status line to reference the threshold and the foundational-density-at-grounding count, (b) refactor each pattern's Lineage notes to the compact format with explicit class labels per finding, (c) process in dependency order (atoms before compositions that name them) so cross-references stay stable. Priority order for the pass: Party Identity (most recent prior gate-clearing atom; the format is most directly comparable), then the canonical regulated-audit stack (Event Log, Actor Identity, Retention Window, Tamper Evidence, Audit Trail), then the remaining atoms and compositions in their grounded-date order.

**2. Methodology cross-reference from existing pattern Lineage notes to the threshold.** Patterns whose Lineage notes refer to "the gate runs again until clean" or similar pre-threshold phrasing should be updated to point at PRESSURE_TESTING.md §"The 95%-good grounding threshold" once the propagation pass runs. This is a substring-search-and-replace rather than a content rewrite; the existing findings and fixes stay, only the methodology rationale anchors update.

**3. Decide whether the threshold counts toward grandfathering.** Patterns grandfathered at `grounded` before the AI adversarial round was codified (per PRESSURE_TESTING.md §"What grounded means" — "Grandfathered patterns") have not been subjected to a Phase 4 clearance gate at all, much less under the 95%-good threshold. The grandfathering clause currently says they will be brought to the full nine-pass standard in a dedicated re-pass sweep. Question for that future sweep: does running Phase 4 under the threshold count as bringing them to standard, or is a pre-threshold-era clean Phase 4 required first? The pragmatic read is yes — the threshold is a refinement on what *clean* means, not a different standard — but the question should be resolved when the sweep is scheduled, not before.

**4. Author-fatigue / round-count signal.** Capacity Constraint Enforcement required two Phase 4 rounds (11 + 9 findings closed across both) before clearing under the new threshold. The library's prior gate-clearing pattern (Party Identity) cleared in one round (6 findings). The two-round count for CCE is correlated with the atom's surface area — 14 invariants, four host obligations, two state machines, regulated overlay, eight composing patterns. The empirical pattern: more surface = more rounds, with diminishing structural-finding density per round. The threshold is what makes the loop terminate cleanly. No action required, but a useful data point for future rich-surface atoms (Workflow / State Machine and Provenance are likely candidates).

**6. Formal verification pass — Alloy for snapshots, TLA+ for traces.** The library has no codified formal verification step. The three-pass methodology (GRID / EOS / Linus) plus Final Critique does the intellectual work that formal verification depends on — defining system state, naming actions, stating invariants, eliminating ambiguity — but stops short of machine-checked verification. The discovery (captured in `DISCOVERIES.md`, 2026-05-19): once a Grace Commons spec is grounded, generating Alloy or TLA+ models from it is largely mechanical, because the spec already contains the named actions, preconditions, postconditions, and numbered invariants the model requires. The feedback loop is: *English specification → formal model → counterexamples → refined specification*. The formal pass is not a separate discipline; it is a mechanical extension of the same thinking.

The tool split, by question type rather than by artifact type: **Alloy handles snapshot questions** — "is there any configuration of state where this invariant is violated?" (structural soundness, impossible constraints, reference validity, audit chain completeness). **TLA+ handles trace questions** — "is there any sequence of steps where this property breaks?" (concurrent action invariant violations, atomicity of operations, failures leaving state unchanged, temporal always/eventually properties, interleaving possibilities). In practice, atoms tend to generate structural questions (Alloy) and compositions tend to generate temporal and concurrency questions (TLA+), but the mapping is by question type, not artifact type — Invitation's concurrent-accept is TLA+ territory even though it is an atom; a simple two-atom structural composition may be fully checkable in Alloy.

The ordering is fixed by the discovery: prose first, formal second. The English spec is canonical; the formal model translates from it, not the other way around. A formal model written before the prose spec is grounded is built on shifting ground — the three-pass review will change the spec and break the model.

What needs to land in `PRESSURE_TESTING.md`: a named Step 4 — formal verification — with the Alloy/TLA+ question-type split, the prose-first ordering rationale, and guidance on when the step is required (regulated atoms and compositions with concurrency-critical invariants) vs. optional (structural-only compositions with no temporal emergent invariants). The Attributed Permissions Admin composition is the canonical worked example: it shipped with a static Alloy structural model and a dynamic Alloy 6 LTL model verifying its load-bearing temporal claims.

**7. Logic Confinement Principle — full application to projector and verification harness.** The Logic Confinement Principle is now a first-class architectural commitment in `EXECUTION_CONTRACT.md`. The Beacon reference implementation satisfies rules 1 (core is pure), 2 (single seam), 3 (explicit inputs for clock/id), and 6 (async at the edge) fully. Two rules remain partially satisfied: rule 4 (explicit construction — `createEvent` before `appendEvent` — rather than hidden work inside transactional functions) and rule 5 (compiler-emitted local invariant assertions, not distributed runtime assumptions). Closing these requires: (a) separating event construction from event insertion in the composition layer, making the constructed event an explicit value before the transaction boundary; (b) designing the projector to emit local invariant assertions compiled from each atom's named invariant set. First natural targets: the projector architecture and the verification harness derivation pipeline. Scoped to the NLnet grant period as a named deliverable; surfaced 2026-05-29.

**5. Compliance-folder sustainability under the #11–#14 cluster.** Atoms #11–#14 (Credential, Session, Capability, Invitation) are all provisionally placed in `atoms/compliance/`, but none is pure compliance infrastructure in the way Actor Identity, Retention Window, and Tamper Evidence are — atoms whose primary use case is regulatory compliance and which have no meaningful non-regulated application. Credential and Session are authentication and session-management primitives; Capability is an object-capability authorization primitive; Invitation is an onboarding lifecycle primitive. All four carry regulated surfaces (NIST 800-63B, PCI DSS, OWASP ASVS, GDPR), but that is because regulation touches authentication and access — not because the atoms are *of* compliance in the way the existing `compliance/` atoms are. If all four land in `atoms/compliance/` without the taxonomy refactor executing, the folder will contain twelve atoms, of which at most half are pure compliance infrastructure and the rest are regulated atoms from other conceptual domains. That is the forcing function the open taxonomy question has been waiting for: at that point, the correct response is a discrete refactor pass moving Credential, Session, Capability, and Invitation to `atoms/security/` or `atoms/identity/` as appropriate, with `regulated: true` carried as a frontmatter attribute rather than folder placement as the regulatory signal. The refactor should be executed as a single pass updating every reference across the library; it should not be done incrementally as atoms land.

**8. Spec-to-implementation lineage manifest (the "recipe").** Each reference implementation (Beacon, the Multi-Party Approval demo, and every future projection) currently records its derivation from the spec corpus only implicitly — recoverable only by reverse-engineering imports and domain-file names, as a 2026-05-29 audit of Beacon's spec set demonstrated when its composition list had to be inferred rather than read. That implicit lineage is a gap, not a convenience: the grant's round-trip benchmark ("regenerate the reference implementation from its grounded specifications") cannot run without an explicit statement of *which* specifications, and the implementation-discovered-findings loop ([`CLAUDE.md`](./CLAUDE.md) §"Implementation-discovered findings") cannot close without it either — a spec that moves on Final Critique N must be able to name the implementations it has just made stale, and a finding surfaced during a build must route to a specific spec passage rather than to a whole file. The deliverable is a machine-readable per-implementation manifest that is (a) **bidirectional** — implementation → the spec files and grounding versions it derives from, and spec → its dependent implementations; (b) **version-pinned** — each dependency carries the spec's grounding marker or commit so drift is detectable; and (c) **granular enough to route findings** — a code symbol (table, guard, invariant check) traces to a named action or numbered invariant in the spec, not merely to the file. Discipline: the manifest is generated from the implementation's actual references and CI-checked against the corpus, never hand-authored — a hand-maintained lineage file is itself an unverified artifact, exactly the drift the methodology exists to prevent. The canonical manifest is structured; the human-readable lineage view is a projection of it — Grace Commons applied to itself. Scoped to the NLnet grant period as a named deliverable underpinning both the projector and the round-trip benchmark; surfaced 2026-05-29.

---

## Open taxonomy question

The `workflow/` category currently holds one atom (Approval Step). The category will be on firmer footing once Workflow / State Machine (atom #9) lands as the second workflow-category atom; until then, the one-atom-category concern noted in [`CLAUDE.md`](./CLAUDE.md) remains open.

The broader axial-split question across all categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`, `messaging`, `workflow`, `healthcare`) also remains open. The current categories mix conceptual axes — `healthcare` is domain-scoped while the others are concept-scoped; `compliance` mixes pure-compliance-infrastructure atoms with atoms-that-happen-to-be-regulated. The right axial split (potentially: domain as a frontmatter attribute rather than a folder; regulation as a `regulated: true` flag rather than a folder placement) will be forced by content as the catalog grows past the size where preemptive cuts are reasonable. Restructuring earlier would relocate the same confusion under different labels.

**Capability-vs-Invitation bearer-token question.** Both Capability (atom #13) and Invitation (atom #14) use bearer-token transport: the holder of the token is authorized to take an action, with no identity check at the point of action. Both are time-bounded and both can be revoked. The argued distinction is that Capability is for *resource access* — the token authorizes access to a specific resource or action, and the redeemer's identity is permanently and intentionally irrelevant — while Invitation is for *identity onboarding* — the token authorizes a single entry event, and the resolution of that event binds an identity that is then permanently recorded. The structural difference is `Declined` as a first-class outcome: a Capability has no `declined` state because a bearer either redeems it or doesn't; an Invitation carries `Declined` as a named terminal state because a human's deliberate refusal is semantically distinct from non-use. The authoring discipline resolves this: draft Capability first (atom #13) and use it as the Pass 2 mirror when drafting Invitation. If Invitation cannot be specified as freestanding — if its specification must name Capability's structure to distinguish itself — the two collapse into one atom (bearer-token-with-lifecycle) and the distinction is carried as a mode or subtype rather than a separate atom.

---

## Q3 2026 – Q2 2027: Year 1 Goal — ~100 Near-Perfect Atoms

**Target:** Reach approximately 100 high-quality, pressure-tested atoms and compositions by the end of the first year, with strong healthcare coverage and initial cross-domain atoms. The current 24 atoms and 12 compositions were produced in roughly three weeks while simultaneously building the methodology, the framework, and the live demo — with a second architect and dedicated tooling, this target is directional but realistic.

### Key Initiatives

**1. Logic Confinement Principle.**
Formalize and fully apply the Logic Confinement Principle across the entire library and tooling. Core must remain pure (synchronous, deterministic, no I/O, no implicit time, randomness, or crypto). Single seam discipline, explicit inputs, behavior as data transformation, and async-at-the-edge rules apply to all projections. Update projector and verification harness to enforce these constraints mechanically. Beacon demo refactored to fully conform as the reference implementation.

**2. Tag-Based Ontology (not folders).**
Replace folder hierarchy with a rich, multi-dimensional tagging system driven by data rather than card-sorting. Tags will cover: Domain, Behavioral Property, Lifecycle Stage, Regulatory Anchor, Composition Role, Technical Property, Maturity. Enables dynamic views — "All EHDS-relevant atoms", "All audit-related patterns", "Cross-domain universals". Ontology evolves organically from actual composition usage, regulatory overlap, and implementation data. This is the resolution of the open taxonomy question currently documented above.

**3. Healthcare Core Expansion.**
Ground 55–65 new healthcare-focused atoms, building on the existing Clinical Observation and Medication Order base. Primary downstream target: EHDS implementation patterns.

**4. Cross-Domain Attack.**
Begin deliberate extraction and generalization of universal atoms — Audit Trail, Multi-Party Approval, Defensible Retention, Consent Propagation variants and related patterns. This phase will intentionally stress and evolve the ontology.

**5. Tooling Maturity.**
Deliver second-author-ready projector and verification harness — the core NLnet grant deliverable. The tooling makes the ~100-atom target achievable by a two-person team within the grant period.

---

*The roadmap is a living document. Patterns are added as the library's content forces resolution of open questions, not on a fixed schedule.*
