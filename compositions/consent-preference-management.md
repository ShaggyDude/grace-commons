---
title: Consent & Preference Management with Revocation Propagation
parent: Compositions
nav_order: 17
has_toc: true
toc: true
---

# Consent & Preference Management with Revocation Propagation (C2)

<details markdown="block">
 <summary>Table of contents</summary>
 {: .text-delta }
1. TOC
{:toc}
</details>

> A regulated composition: the full operational lifecycle of consent as a lawful processing basis — consent recorded under attributed authority and held under a retention floor, a single gate query every processing system consumes before acting on personal data, and — the load-bearing emergent property — a withdrawal that propagates, recording in one atomic, tamper-evident act the complete set of downstream processing scopes the withdrawn consent governed. The composition wires Consent, Permissions, and the Audit Trail substrate into the structure GDPR Articles 6–7 and Article 7(3) require but no constituent names alone. The defining emergent guarantee is consent-gates-processing-with-propagation: a processing system reaches a consent-based action only through `processing_permitted`, which is `permitted` exactly when valid consent exists; and every `withdraw_consent` commits the Consent revocation and a `consent.revoked` propagation event — enumerating every downstream scope bound to that consent — together or not at all, so there is no revoked consent in the records without its complete, sealed propagation record, provable from the composition's records alone.

---

## Intent

Every system that processes personal data on the basis of consent faces the same regulated obligation, and it is the same whether the system is an advertising platform, a health app, an analytics pipeline, or a cookie-banner backend. Before processing for a consent-based purpose, the system must confirm a valid consent exists; the data subject must be able to withdraw that consent as easily as they gave it; and — the limb that defeats most real deployments — when consent is withdrawn, the systems that were relying on it must *stop*, which means the withdrawal cannot be a private fact buried in one consent store but must propagate to every downstream process that was acting on the basis now gone. GDPR (EU General Data Protection Regulation) Article 6(1)(a) names consent as a lawful basis; Article 7 fixes its conditions (freely given, specific, informed, demonstrable); Article 7(3) requires withdrawal be as easy as grant and, read with Article 17(1)(b), that withdrawal end the basis for future processing. The domain varies; the structural obligation is constant: gate processing on consent, and make withdrawal propagate provably.

Neither Consent nor Permissions nor the Audit Trail substrate, alone, enforces this arc. Consent owns the grant/revoke/expire lifecycle and the `check` query that answers *is there valid consent for this subject and purpose at this time?* — but it deliberately stops there: its own specification states *"the atom does not enforce processing suppression"* and names downstream propagation as out of scope, the concern of *"the Consent & Preference Management composition (C2)."* Consent records that consent was withdrawn; it neither knows what downstream processing relied on it nor records which processes must now cease. Permissions owns inward authorization — *which internal actor may grant, revoke, or read a consent record on a data subject's behalf* — but it knows nothing of consent state. The Audit Trail substrate records attributed, tamper-evident, retention-bounded events but does not know which events constitute a consent's propagation history. The structure that makes the three coherent as a single consent-management surface — the gate that centralizes the consent precondition, the downstream-registration index that makes "what relied on this consent" a recorded fact, and the propagation event that fires atomically with revocation — belongs to no single constituent. It belongs to the composition, and this composition is that structure.

This is a composition, not a new primitive. Consent, Permissions, and Audit Trail are unchanged; the composition is the wiring that makes them coherent as a single consent-management surface. It introduces emergent actions — `record_consent`, `register_processing`, `withdraw_consent`, `processing_permitted` — that belong to no single constituent and exist only because the three are wired together. The `withdraw_consent` action, in particular, wraps a Consent `revoke`, an enumeration of the consent's registered downstream scopes, and the tamper-evident propagation event into one named, atomic surface, so that withdrawing consent is a single auditable act whose downstream impact is recorded — not a Consent `revoke` whose consequences leak silently into whatever processing systems happen to re-check, or fail to re-check, the consent store.

What the composition is *not*: it is not the consent-collection UI (the banner, the form, the verbal-capture integration that produces the `grant` signal — that is upstream, producing the inputs `record_consent` records); it is not the data-erasure engine (whether withdrawal triggers deletion of derived data under Article 17 is the downstream processor's obligation, signalled by the propagation event, not performed by this composition); it is not a lawful-basis adjudicator for non-consent bases (legitimate interest, contract necessity, legal obligation are GDPR Article 6 bases this composition does not model — a KYC obligation under C8 rests on Article 6(1)(c), not consent, and is explicitly out of scope here); and it is not the access-control surface for internal operators beyond the consent-administration actions it gates. Each is named explicitly in Edge cases.

---

## Summary

Consent & Preference Management with Revocation Propagation is a regulated composition (a spec that wires two or more atoms — freestanding, self-contained pattern specs — together) that solves a problem none of its constituents solves alone: ensuring that a system processes personal data on a consent basis only while valid consent exists, that the people authorized to record and withdraw consent are themselves authorized to do so, that consent records survive for the regulator-mandated proof period, and — the property that defeats naive implementations — that withdrawing consent *propagates*: the act of revocation records, atomically and tamper-evidently, the complete set of downstream processing activities that were relying on the now-withdrawn consent. It wires three constituents: Consent (the data subject's grant/revoke/expire lifecycle with its point-in-time `check`), Permissions (the inward authorization surface governing which internal actor may administer consent), and the Audit Trail substrate (the tamper-evident — designed so unauthorized changes are detectable — regulated-audit substrate that attribution-stamps and seals every state-changing decision, and through which Event Log, Actor Identity, Retention Window, and Tamper Evidence are reached transitively).

The composition's defining emergent guarantee (a property that appears only when atoms are combined — no single atom carries it) has two halves. *Consent-gates-processing:* a single read-only query, `processing_permitted(subject_ref, purpose)`, returns `permitted` if and only if Consent reports valid consent (`check` → `granted`) for that subject and purpose at the current time. Processing systems consume this query rather than reading Consent directly, so the gate is implemented exactly once instead of re-implemented — or skipped — per processing system. *Revocation propagates:* `withdraw_consent` commits the Consent `revoke` and a `consent.revoked` Audit Trail event — whose `affected_scopes` set is exactly the downstream processing scopes registered against that consent — *together or not at all*. There is no revoked consent in the records without its complete propagation record, and no propagation record without the revoke; the binding is bijective.

Beyond the gate and the propagation, the composition guarantees that every consent grant is attributed and tamper-evidently recorded, that consent records are held under a retention floor that survives revocation (a withdrawn consent is evidence, not garbage — it must outlive its own withdrawal for the regulator's proof period), that the complete consent lifecycle is reconstructable from the records alone, and that every consent-administration action passes a Permissions check before it touches the consent store.

 Its most common uses are advertising and marketing consent management under GDPR/ePrivacy, health-app and research consent under HIPAA Authorization, cookie-consent backends under the ePrivacy Directive, and any system that must prove, from records alone, that consent-based processing was gated on valid consent and that every withdrawal's downstream impact was enumerated and sealed.

---

## Composes

- **[Consent](../atoms/consent.md)** — the primary data-bearing constituent: the data subject's grant/revoke/expire lifecycle (Granted → Revoked | Expired) with the point-in-time `check(subject_ref, purpose, at_time?) → granted | revoked | expired | not-known`. The composition calls `grant` (from `record_consent`), `revoke` (from `withdraw_consent`), `check` (from the `processing_permitted` gate), and `read` (from `read_consent_history`). The composition maintains exactly one Consent store instance. Consent's own specification names this composition by name as the home of the propagation it deliberately excludes (Consent Edge cases — *Consent withdrawal propagation*); this composition is that home.
- **[Permissions](../atoms/permissions.md)** — the inward authorization surface, a composing **peer** of Consent made operational here: Consent governs what the system may do *to the data subject's data* (outward authorization, held by the subject); Permissions governs which internal actor may *administer* a consent record (inward authorization, held by the operator). The composition calls `permitted(actor_ref, scope)` before every consent-administration action, with the scope vocabulary `consent:grant`, `consent:revoke`, `consent:register-processing`, and `consent:read`. The composition maintains exactly one Permissions instance. The gate query `processing_permitted` does **not** consult Permissions — it is the data subject's consent that gates processing, not an internal actor's permission; conflating the two is the exact error Consent's Intent warns against, and keeping them distinct is load-bearing (Invariant 7).
- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every state-changing action the composition exposes records here as one `record_action` call, producing an Event Log entry, an Actor Identity attestation, a Retention Window record (for the audit event), and a Tamper Evidence seal per the substrate's cadence. The composition maintains exactly one Audit Trail instance configured with the host's regulatory retention policy for audit events. **Actor Identity is reached transitively through Audit Trail** — the composition does not maintain a separate Actor Identity instance; the `actor_ref` and `credential` passed to each composition action flow to `AuditTrail.record_action`, which binds the actor cryptographically. Event Log, Tamper Evidence, and the audit-event Retention Window are likewise reached transitively.
- **[Retention Window](../atoms/retention-window.md)** — the policy-bounded record lifetime, used here for **one placement over each consent record** (distinct from the audit-event Retention Window inside the substrate): a *consent-record* placement at `record_consent` governing how long the consent record itself is held (GDPR's "as long as necessary" plus the controller's demonstrability burden under Article 7(1) — a withdrawn consent must be retained as proof the basis once existed and was lawfully ended). C2 calls `place_under_retention` only; `purge` is the host's or a composing Defensible Retention layer's responsibility, so Retention Window's purge-family rejections (`not-retained`, `retention-period-not-elapsed`) do not surface at the C2 boundary. This Retention Window instance is **distinct from the Retention Window instance inside the Audit Trail substrate**, which governs the audit *events* (see Edge cases — *Two Retention Window instances*).

The Event Log, Actor Identity, Tamper Evidence, and audit-event Retention Window atoms are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms at this layer.

---

## Composition logic

### Application state

The composition owns emergent state that wires the constituents into one queryable consent-management surface. None of this state belongs to a single constituent.

- **`consent_to_downstream`** — map from `consent_id` to the set of registered downstream processing bindings `{processing_scope, processor_ref, registered_at}`. A binding is added by `register_processing` and is **the records-alone source of truth for what relied on a given consent**. `withdraw_consent` reads this set to compute the `affected_scopes` it records on the propagation event. The set is never silently pruned: once a processing activity is registered against a consent, it remains in the set for the life of the consent record, so the propagation event records the complete history of what the consent governed, not merely what was active at an arbitrary moment. This is the auditor's first query surface for *what must stop when this consent is withdrawn*.
- **`consent_to_retention`** — map from `consent_id` to `{consent_record_retention_id}`. Records the Retention Window `retention_id` placed over the consent record at `record_consent`. Its presence is the records-alone evidence that the consent-record retention placement occurred (Invariant 6).
- **`consent_to_subject_purpose`** — map from `consent_id` to `{subject_ref, purpose}`. A convenience index so `withdraw_consent` (which takes a `consent_id`) can name the subject and purpose on the propagation event without a Consent `read`, and so an auditor can join a `consent_id` back to the gate surface. Populated by `record_consent`; immutable thereafter.

The Consent store (consent records and their grant/revoke fields), the Permissions store (grants), the Retention Window store (consent-record retention records), and the Audit Trail substrate's emergent state are owned by their respective constituent instances. The composition does not duplicate them; it indexes into them via the maps above.

### Configuration

- **`consent_record_retention_policy_ref`** — the recommended Retention Window policy reference for the consent-record retention placed at `record_consent`. The caller passes it (or a per-jurisdiction policy) as the **required** `retention_policy_ref` argument to `record_consent`, which step 4 consumes. The composition holds no default it substitutes — the argument is authoritative and required; this Configuration entry is the deployment's recommended value, not a fallback the action applies when the argument is omitted. The deployment sets this to the policy governing how long a consent record is held as demonstrability evidence (GDPR Article 7(1) burden of proof; HIPAA's six-year Authorization retention). Must resolve in the Retention Window's Policy Registry. Multi-jurisdiction policy reconciliation (selecting the longer of competing obligations) is out of scope; a Policy Reconciliation composing pattern produces the reconciled `policy_ref` this composition consumes.
- **`audit_trail_retention_policy`** — the `retention_policy` configured on C2's single Audit Trail instance (a policy reference, or a content-derived policy selector), governing the lifetime of the *audit events* (`consent.granted`, `consent.revoked`, etc.), distinct from the consent-record retention above. It is set once on the instance; Audit Trail's `record_action` takes **no per-call retention argument**, so every C2 audit write inherits this configured policy. The audit trail of a consent decision should persist at least as long as the consent record it describes, and often longer for litigation defensibility.

### Primitive policies

The composition takes string-typed inputs at its action boundaries; each is validated either at this layer or by a constituent.

- **`subject_ref`** — opaque reference to the data subject. Validated by Consent's `grant` (at least one non-whitespace character); the composition propagates Consent's `invalid-request` without imposing additional rules. Not normalized, case-folded, or trimmed; equality is opaque byte-identity.
- **`purpose`** — opaque processing-purpose scope (`marketing:email`, `analytics:behavioral`, `hipaa:research`). Validated by Consent's `grant`. The composition does not interpret purpose semantics; purpose taxonomy governance is a deployment concern (inherited from Consent's *Purpose vocabulary* edge case).
- **`consent_id`** — opaque, system-generated by Consent's `grant`. When supplied to `register_processing`, `withdraw_consent`, or as a `read` filter, it must reference a consent known to the Consent instance; otherwise the action rejects with `not-known`. Used as a map key under byte-identity equality; never normalized.
- **`processing_scope`** — opaque reference to a downstream processing activity bound to a consent (`ad-personalization`, `derived-profile-store`, `partner-share:acme`). Must contain at least one non-whitespace character; otherwise `invalid-request`. The composition does not interpret it; it is the unit enumerated in the propagation event's `affected_scopes`.
- **`processor_ref`** — opaque reference to the system or party operating the downstream processing activity. Must contain at least one non-whitespace character. Carried in `consent_to_downstream` and on the propagation event so an auditor knows *who* must act on a withdrawal.
- **`actor_ref`** — opaque internal-actor identifier for the operator performing a consent-administration action. Must contain at least one non-whitespace character; empty/whitespace-only is `invalid-request`. The substrate's Actor Identity binds it cryptographically via the paired `credential`, and it is the subject of the Permissions check.
- **`credential`** — opaque credential material consumed by `AuditTrail.record_action` (and, where the substrate verifies before recording, by the Actor Identity inside the substrate). The composition does not inspect it; the substrate's Actor Identity validates it at the audit write and may surface `invalid-credential`, mapped per the Action wiring preamble's uniform `record_action` rejection rule.
- **`reason`** — free-form string supplied to `withdraw_consent` (passed to Consent's `revoke`); must contain at least one non-whitespace character (Consent's rule).
- **`retention_policy_ref`** — the consent-record policy reference supplied to `record_consent`. Validated by Retention Window's `place_under_retention`; `invalid-policy` and `policy-not-found` from the constituent are mapped to `invalid-request` at this composition's boundary.
- **`expires_at`, `metadata`** — optional, passed through to Consent's `grant` unchanged; Consent's validation rules (`expires_at` strictly in the future; `metadata` opaque) apply.

No primitive is case-sensitivity-normalized at the composition layer; deployments wanting normalization wire it at the calling layer before invoking composition actions.

### Action wiring

The composition exposes five actions. Four are state-changing and record in the Audit Trail; the fifth, `processing_permitted`, is a read-only gate query and records nothing (a read-only query produces no state change, so an audit event would be a false positive in the action record). Every constituent rejection is mapped — propagated, renamed, or surfaced as a new code — at the composition's boundary; silent rejection-code drift is a reference-graph finding.

For every `AuditTrail.record_action` call below, the substrate's rejection taxonomy (`invalid-credential | invalid-request | recording-failure`) is mapped uniformly. Where the audit write *precedes* any constituent state change, `invalid-credential` and `invalid-request` surface as `rejected(invalid-request)`, a clean pre-state rejection. Where the audit write *follows* a constituent state change, credential and request validity cannot be pre-empted at the C2 boundary: Actor Identity is reached transitively through the substrate, so the credential is first consumed at the audit write, after the consent grant/revoke has committed. There, `invalid-credential`/`invalid-request` surface as `rejected(recording-failure)` and the resulting orphan (a committed state change with no audit event) is handled per the *Cross-store consistency under partial failure* edge case. Deployments that must reject an invalid credential *before* any state mutation wire a Permissions / Actor Identity pre-check above C2; the Permissions check C2 itself performs gates *authority*, not *credential validity* — those are distinct, and the credential is validated only at the transitive Actor Identity surface inside the audit write.

#### `record_consent`

```
record_consent(
 actor_ref,
 subject_ref,
 purpose,
 credential,
 retention_policy_ref,
 expires_at?,
 metadata?
) →
  consent_id
 | rejected(
   permission-denied
  | invalid-request
  | recording-failure
  )
```

Records a data subject's consent for a purpose under an operator's authority, places the consent record under retention, and audits the grant.

Steps:

1. `Permissions.permitted(actor_ref, "consent:grant")` → if `denied`, return `rejected(permission-denied)`. No constituent state has changed. Stop.
2. Validate `actor_ref`, `credential`, `subject_ref`, `purpose`, and `retention_policy_ref` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
3. Call `Consent.grant(subject_ref, purpose, granted_by=actor_ref, expires_at?, metadata?)` → `consent_id` (or map: `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on either — no retention placed, no audit written).
4. Place the consent record under **consent-record retention**: `Retention Window.place_under_retention(record_ref=consent_id, policy_ref=retention_policy_ref)` → `consent_record_retention_id` (the per-call argument is authoritative — it carries the consent-record policy, defaulting to the configured `consent_record_retention_policy_ref` when the deployment uses a single policy; there is no silent substitution). Map `invalid-policy`/`policy-not-found`/`invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on either — if stopped here, the consent grant from step 3 persists as a Granted record with no retention placement and no audit event, surfaced per the *Cross-store consistency under partial failure* edge case.
5. Record the grant **first** among the state-completing writes (audit-first discipline): `AuditTrail.record_action(action_ref=consent.granted, actor_ref, credential, data={consent_id, subject_ref, purpose, expires_at?, consent_record_retention_id})` → `event_id`. If this fails after steps 3–4 succeeded → `rejected(recording-failure)`; **no application maps are populated**, so no `consent_id` becomes resolvable by a downstream composition action without its `consent.granted` event having landed; the implementation surfaces the orphan per the *Cross-store consistency under partial failure* edge case.
6. Populate application state only after the grant event has landed: `consent_to_retention[consent_id] = {consent_record_retention_id}` and `consent_to_subject_purpose[consent_id] = {subject_ref, purpose}`. (`consent_to_downstream[consent_id]` begins empty; bindings are added by `register_processing`.)
7. Return `consent_id`.

#### `register_processing`

```
register_processing(
 actor_ref,
 consent_id,
 processing_scope,
 processor_ref,
 credential
) →
  registered
 | rejected(
   permission-denied
  | not-known
  | invalid-request
  | recording-failure
  )
```

Binds a downstream processing activity to a consent, so that a later withdrawal can enumerate it. This is the action that makes "what relied on this consent" a recorded fact rather than tribal knowledge. It does not check consent *state* — a processing activity may be registered against a Granted consent before processing begins; whether processing may actually proceed is the `processing_permitted` gate's job at processing time.

Steps:

1. `Permissions.permitted(actor_ref, "consent:register-processing")` → if `denied`, `rejected(permission-denied)`. Stop.
2. Resolve `consent_id` in `consent_to_subject_purpose`. If absent → `rejected(not-known)` (the consent is unknown to C2 — it was never recorded through `record_consent`, or the id is wrong). Stop.
3. Validate `actor_ref`, `credential`, `processing_scope`, `processor_ref` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
4. Record: `AuditTrail.record_action(action_ref=processing.registered, actor_ref, credential, data={consent_id, processing_scope, processor_ref, registered_at = now})` → `event_id`. If this fails → `rejected(recording-failure)`; **the binding is not added to the map** (audit-first: the registration is not resolvable without its event). Stop.
5. Add the binding only after the event has landed: `consent_to_downstream[consent_id] ∪= {processing_scope, processor_ref, registered_at = now}`.
6. Return `registered`. (Re-registering an identical `{processing_scope, processor_ref}` against the same consent is idempotent at the set level — the set absorbs the duplicate — but still records a `processing.registered` event, because the registration *act* is itself an auditable decision; the set membership, not the event count, is what the propagation enumerates.)

#### `withdraw_consent`

```
withdraw_consent(
 actor_ref,
 consent_id,
 credential,
 reason
) →
  withdrawn
 | rejected(
   permission-denied
  | not-known
  | already-revoked
  | already-expired
  | invalid-request
  | recording-failure
  )
```

The single emergent action that revokes a consent **and propagates the withdrawal** — recording, atomically with the revocation, the complete set of downstream processing scopes the consent governed. This is the composition's structural reason to exist; the propagation event is what makes a withdrawal's downstream impact a records-alone fact rather than a hope that every processing system re-checks the consent store.

Steps:

1. `Permissions.permitted(actor_ref, "consent:revoke")` → if `denied`, `rejected(permission-denied)`. Stop. (GDPR Article 7(3) requires withdrawal be *as easy as grant*; that ease is a property of the data-subject-facing surface upstream. The Permissions check here gates the *operator* recording the withdrawal on the subject's behalf — it does not gate the subject's right to withdraw, which is absolute; a deployment exposing self-service withdrawal wires the subject's own request to an actor with `consent:revoke` authority at the calling layer.)
2. Resolve `consent_id` in `consent_to_subject_purpose`. If absent → `rejected(not-known)`. Stop. Resolve `{subject_ref, purpose}`.
3. Validate `actor_ref`, `credential`, `reason` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
4. **Compute the propagation set first, from the records:** read `affected_scopes = consent_to_downstream[consent_id]` (the complete set of `{processing_scope, processor_ref}` bindings registered against this consent; empty if none). This read precedes the revoke so the set recorded is exactly the set the records held at withdrawal time.
5. Call `Consent.revoke(consent_id, revoked_by=actor_ref, reason)` → `revoked` (or map: `not-known` → `rejected(recording-failure)` — an internal-consistency anomaly, since step 2 resolved the id in C2's own map but Consent does not know it; `already-revoked` → `rejected(already-revoked)`; `already-expired` → `rejected(already-expired)`; `invalid-request` → `rejected(invalid-request)`; `storage-failure` → `rejected(recording-failure)`. Stop on any — no propagation event is recorded if the revoke did not occur).
6. **Record the revocation-with-propagation, atomically with the revoke** (the binding-bijection commit — see *The load-bearing wiring decision*): `AuditTrail.record_action(action_ref=consent.revoked, actor_ref, credential, data={consent_id, subject_ref, purpose, reason, affected_scopes, revoked_at = now})` → `event_id`. The `affected_scopes` set on this event is the complete enumeration computed in step 4. If this fails after step 5 succeeded → `rejected(recording-failure)`; the consent is Revoked in Consent but the propagation is unattested — the composition's most consequential atomicity gap, handled per the *Cross-store consistency under partial failure* edge case (retry until it lands; surface the orphan as a high-priority finding; the compensating event carries `cascade_recovery = true`). The host's transaction boundary (Edge cases — *Cross-store consistency*) is what makes the revoke and the propagation event commit together in the conforming case.
7. Return `withdrawn`. The action's guarantee is that the consent is revoked **and** its complete downstream scope set is recorded in a tamper-evident propagation event — not that any downstream processor has yet acted on the withdrawal. Downstream processors consume the propagation event (or re-query `processing_permitted`) to cease processing; performing the cessation (deleting derived data, halting a pipeline) is the processor's obligation, signalled but not performed here.

#### `read_consent_history`

```
read_consent_history(
 actor_ref,
 subject_ref,
 credential
) →
  ordered_sequence_of_consents
 | rejected(
   permission-denied
  | invalid-request
  | recording-failure
  )
```

The permission-gated read surface for compliance dashboards, DSAR (Data Subject Access Request) workflows, and regulatory reporting. Reading a data subject's consent history is itself a regulated act under several regimes, so it produces a meta-event.

Steps:

1. `Permissions.permitted(actor_ref, "consent:read")` → if `denied`, `rejected(permission-denied)`. Stop.
2. Validate `actor_ref`, `credential`, `subject_ref` per Primitive policies. Any failure → `rejected(invalid-request)`. Stop.
3. Call `Consent.read({subject_ref})` → ordered sequence of consent records (Consent orders by `granted_at` then `consent_id`). Consent's `read` rejects only on malformed query; a well-formed `subject_ref` filter never rejects, so no constituent-rejection mapping is needed beyond the Primitive-policy validation in step 2.
4. Record the access (meta-event): `AuditTrail.record_action(action_ref=consent.history-read, actor_ref, credential, data={subject_ref, record_count})` → `event_id`. If this fails → `rejected(recording-failure)`; the read result is not returned, because returning regulated records without recording the access would defeat the access-trail obligation. (This is the one place a read is gated on an audit write — deliberately, because under the regimes C2 serves, access to consent records is itself auditable.)
5. Return the consent records.

#### `processing_permitted`

```
processing_permitted(subject_ref, purpose) →
  permitted
 | rejected(not-permitted(state))  // state ∈ {revoked, expired, not-known}
```

The read-only consent-gates-processing query. **No Audit Trail record is produced** — this is a read-only query that changes no state, and recording it would falsely populate the action record with non-actions. Processing systems consume this query as their single consent gate; they must not read Consent state directly (see Edge cases — *Processing systems reading Consent directly*).

Steps:

1. Call `Consent.check(subject_ref, purpose)` (at the current wall clock) → one of `granted | revoked | expired | not-known`.
2. If `granted` → return `permitted`.
3. Otherwise → return `rejected(not-permitted(state))`, naming the actual `check` result: `revoked` (consent was withdrawn), `expired` (consent's time bound elapsed), or `not-known` (no consent record for this subject and purpose). The named state lets the calling processing system distinguish *never consented* from *withdrawn* from *lapsed* — different remediation paths (request consent, honor the withdrawal, request renewal).

### The load-bearing wiring decision — consent-gates-processing with revocation propagation

The composition's structural reason to exist: **a system processes personal data on a consent basis only through the `processing_permitted` gate, which is `permitted` exactly when valid consent exists; and a withdrawal commits the Consent revocation and a propagation event enumerating every downstream scope the consent governed — together or not at all.**

*Principle.* GDPR Articles 6–7 require that consent-based processing have a valid consent at processing time, and Article 7(3) (with Article 17(1)(b)) requires that withdrawal end the basis for future processing — which, operationally, means the systems relying on that consent must learn of the withdrawal. Structurally: no consent-based processing may proceed for a subject/purpose without valid consent, and the system must be able to prove — from the records alone — both that the gate was the single consent precondition and that every withdrawal's downstream impact was completely enumerated and sealed at the moment of revocation.

*Likely objection.* Consent already owns the `granted/revoked/expired` lifecycle and already exposes `check`. Why not have each processing system call `Consent.check` directly, and why does withdrawal need a separate propagation event when the revocation is already in the Consent store? The atom already records the revocation.

*Mechanism that resolves it.* Consent owns the state but exposes no gate and no propagation — by design. Its specification states that it *"does not enforce processing suppression"* and names downstream propagation as out of scope. Two gaps follow. First, if each processing system calls `Consent.check` directly, the gate is re-implemented per system, and the first system that forgets the check, caches a stale result, or applies a subtly different predicate (e.g., treats `expired` as `granted`) breaks the Article 6 basis silently and per-system; centralizing the gate at `processing_permitted` makes the precondition exist exactly once. Second — and this is the half no constituent can supply — the Consent store records *that* a consent was revoked, but it does not record *what was relying on it*: Consent has no notion of downstream processing activities, because importing that notion would break its freestanding status. So a `Consent.revoke` alone leaves the withdrawal's downstream impact unrecorded; a processing system that never re-checks simply keeps processing, and no record exists of which systems *should* have stopped. The composition closes this by maintaining the `consent_to_downstream` registry (populated by `register_processing`, an act that is itself audited) and by making `withdraw_consent` record the complete `affected_scopes` set on the `consent.revoked` event *atomically with the revoke*. The atomicity is load-bearing: a revoke without its propagation event, or a propagation event with an incomplete scope set, would let an auditor (or a downstream processor) miss a process that must cease. The binding is bijective — every revoked consent has exactly one complete propagation record, and every propagation record corresponds to a real revoke — and the host transaction boundary (Edge cases — *Cross-store consistency*) is what enforces the together-or-not-at-all commit.

*Result.* The gate is structural and centralized; the propagation is complete and sealed. An auditor can verify, from the records alone, that for every consent-based processing activity a `processing.registered` event bound it to a consent, and that for every withdrawn consent a `consent.revoked` event enumerates exactly the downstream scopes that were bound — so the question *"when this person withdrew consent, what was supposed to stop, and is it recorded?"* is answered by reading one sealed event, not by interviewing every processing system. The single-surface discipline (one gate query, one propagation event class) is the records-alone-defensible signal.

---

## Composition-level invariants

These invariants emerge from the composition. None belongs to a single constituent; each requires two or more working together to hold.

- **Invariant 1 — Consent gates processing.** Two claims, distinguished by what enforces each. *(a) Query result — composition-enforced:* `processing_permitted(subject_ref, purpose)` returns `permitted` if and only if `Consent.check(subject_ref, purpose)` at the current time returns `granted`. *Defended in-line:* `processing_permitted` step 2 returns `permitted` only on `granted`; every other `check` result returns `rejected(not-permitted(state))` — the biconditional is exact and the composition enforces it. *(b) Gating property — deployment-conditional:* a processing system reaches a consent-based action only through this gate, which holds exactly when processing systems consume `processing_permitted` rather than reading Consent directly. This is the one structural obligation pushed to deployment (named in Edge cases — *Processing systems reading Consent directly*); a system that bypasses the gate is a composition-bypass finding, not a valid path. The "iff" is a property of the query result; the gate guarantee additionally requires the single-surface obligation to be honored.

- **Invariant 2 — Grant audit coverage.** Every `record_consent` that grants a consent produces a `consent.granted` Audit Trail event carrying the `consent_id`, attributed and tamper-evident via the substrate seal. *Rests on:* Consent's return of `consent_id` on `grant`, `record_consent` step 5, and Audit Trail's attribution and seal coverage (Audit Trail Invariants 1 and 3). A Granted consent reachable through C2 with no `consent.granted` event is a conformance failure.

- **Invariant 3 — Revocation propagation completeness (load-bearing).** Every `withdraw_consent` that revokes a consent produces exactly one `consent.revoked` Audit Trail event whose `affected_scopes` set equals the complete set of downstream bindings registered against that `consent_id` in `consent_to_downstream` at revocation time, and the Consent `revoke` and the `consent.revoked` event commit *together or not at all*. *Defended in-line:* `withdraw_consent` computes `affected_scopes` from the records before the revoke (step 4), revokes (step 5), and records the propagation event (step 6); the host transaction boundary commits steps 5–6 atomically, so no reachable state has a Revoked consent without its complete propagation event, and none has a propagation event without the revoke. The binding is bijective: revoke ⇔ complete propagation record. *Rests on:* Consent's `revoke` (Consent Invariants 3, 9 — terminal, non-retroactive), the `consent_to_downstream` registry's completeness (it is never silently pruned — Application state), Audit Trail Invariants 1 and 3, and the host's serialization/transaction obligation (Edge cases — *Cross-store consistency*). This is the invariant the formal model checks (Lineage — *Formal model*).

- **Invariant 4 — Downstream registration is recorded.** Every binding in `consent_to_downstream[consent_id]` has a corresponding `processing.registered` Audit Trail event carrying its `processing_scope`, `processor_ref`, and `consent_id`; a binding is added to the set (step 5) only after its event lands (step 4). *Rests on:* `register_processing`'s audit-first ordering and Audit Trail attribution. This is what makes the `affected_scopes` set on a propagation event *itself* records-grounded — every scope it enumerates traces to a recorded registration act, so the propagation set is not a free-floating assertion.

- **Invariant 5 — Records-alone consent lifecycle.** The complete lifecycle of every consent governed by C2 — grant (`consent.granted` + the Consent record), downstream registrations (`processing.registered` events + `consent_to_downstream`), withdrawal (`consent.revoked` with `affected_scopes` + the Consent Revoked record), and any history access (`consent.history-read`) — is reconstructable from the Consent store, the Audit Trail (Event Log reached transitively), and the composition maps, without recourse to source code or developer narration. *Rests on:* Invariants 2–4, Consent's store durability (Consent Invariant 8 — terminal records retained), and Audit Trail's forensic completability.

- **Invariant 6 — Consent-record retention floor.** A consent record (in any state, including Revoked or Expired) cannot be purged before its consent-record Retention Window record's `retention_until` elapses. *Rests on:* Consent Invariant 8 (records are never removed by the atom outright) plus Retention Window Invariant 7 (no early purge). The consent-record retention placed at `record_consent` step 4 governs when archive/scrub becomes permitted; `consent_to_retention[consent_id]` is the records-alone evidence the placement occurred. A withdrawn consent must outlive its own withdrawal: it is the proof, under GDPR Article 7(1), that the controller once had a valid basis and lawfully ended it.

- **Invariant 7 — Inward/outward authorization separation.** No consent-administration action (`record_consent`, `register_processing`, `withdraw_consent`, `read_consent_history`) proceeds without a passing Permissions check for its scope; and the `processing_permitted` gate consults **only** Consent state, never Permissions. *Defended in-line:* each administration action's step 1 is a `Permissions.permitted` check; `processing_permitted` calls only `Consent.check`. *Why load-bearing:* Consent is an *outward* authorization (the data subject authorizes the system to process their data); Permissions is an *inward* authorization (the organization authorizes an operator to administer records). Collapsing them — gating processing on an operator's permission, or gating administration on the subject's consent — is the exact error Consent's Intent warns against. Keeping the two surfaces distinct is what lets an auditor answer *"was this operator authorized to record this withdrawal?"* (Permissions) and *"did this subject consent to this processing?"* (Consent) as separate, separately-evidenced questions.

Verification of the consent gate (Invariant 1) plus grant audit coverage (Invariant 2) gives the *substantiated-processing* property — every consent-based action was gated on a recorded, attributed consent. Revocation propagation completeness (Invariant 3) plus downstream-registration recording (Invariant 4) gives the *propagated-withdrawal* property — every withdrawal's downstream impact is completely enumerated and itself records-grounded. Records-alone lifecycle (Invariant 5) and the retention floor (Invariant 6) close the consent lifecycle: the full history survives and is reconstructable. Invariant 7 keeps the two authorization surfaces distinct, so neither masquerades as the other.

---

## Examples

### Walkthrough — marketing-consent management under GDPR

A retail platform uses C2 to manage marketing consent. Configuration: `consent_record_retention_policy_ref = gdpr_consent_proof_6yr`, `audit_trail_retention_policy = gdpr_audit_10yr`. Permission grants: the consent-service actor holds `consent:grant`, `consent:register-processing`, `consent:revoke`, `consent:read`.

1. **Record consent.** A user affirms a marketing-email consent banner; the consent service calls `record_consent(actor_ref="consent_svc", subject_ref="user-4491", purpose="marketing:email", credential=<consent_svc>, retention_policy_ref="gdpr_consent_proof_6yr", expires_at="2027-05-13T00:00:00Z") → consent_id = cns-7001`. Internally: `Permissions.permitted("consent_svc", "consent:grant") → permitted`; `Consent.grant(...) → cns-7001` (Granted); `Retention Window.place_under_retention(cns-7001, gdpr_consent_proof_6yr) → ret_cns_7001`; Audit Trail records `consent.granted`; maps populated.

2. **Register downstream processing.** Two systems will rely on this consent. `register_processing(actor_ref="consent_svc", consent_id="cns-7001", processing_scope="email-campaign-engine", processor_ref="campaigns@platform", credential=<consent_svc>) → registered`, and again for `processing_scope="lookalike-audience-builder", processor_ref="adtech@platform"`. Each records a `processing.registered` event; `consent_to_downstream[cns-7001]` now holds two bindings.

3. **Gate check before processing.** Before sending a campaign, the email engine calls `processing_permitted("user-4491", "marketing:email") → permitted`. The campaign proceeds.

4. **Withdrawal with propagation.** The user clicks "unsubscribe / withdraw consent." The consent service calls `withdraw_consent(actor_ref="consent_svc", consent_id="cns-7001", credential=<consent_svc>, reason="user-withdrawal-via-preferences") → withdrawn`. Internally: `Permissions.permitted("consent_svc", "consent:revoke") → permitted`; `affected_scopes` computed from `consent_to_downstream[cns-7001]` = `{email-campaign-engine@campaigns, lookalike-audience-builder@adtech}`; `Consent.revoke(cns-7001, ...) → revoked`; Audit Trail records `consent.revoked` carrying the complete `affected_scopes` set — *atomically with the revoke*. Invariant 3 holds: the withdrawal and its complete downstream enumeration are one sealed act.

5. **Gate check after withdrawal.** `processing_permitted("user-4491", "marketing:email") → rejected(not-permitted(revoked))`. The email engine and the audience builder, consuming the propagation event or re-querying the gate, cease processing; deleting the derived lookalike audience is the audience builder's own obligation, signalled by the `consent.revoked` event's `affected_scopes`.

6. **DSAR audit.** A data-subject access request calls `read_consent_history(actor_ref="dsr_officer", subject_ref="user-4491", credential=<dsr_officer>)` → the Granted-then-Revoked `cns-7001` record; a `consent.history-read` meta-event is recorded. The complete lifecycle — grant, two registrations, withdrawal-with-propagation, access — is reconstructable from the records (Invariant 5).

### Re-consent path

Six months after withdrawal the user re-enables marketing email. `record_consent(...) → cns-7042` (a fresh Granted record; `cns-7001` remains Revoked as evidence). `processing_permitted("user-4491", "marketing:email") → permitted` (Consent's `check` evaluates the most-recent grant). Downstream processing is re-registered against the new `consent_id`; the prior consent's propagation record is untouched history.

### Rejection path — withdrawal by an unauthorized operator

An operator lacking `consent:revoke` attempts `withdraw_consent(...)`: step 1's `Permissions.permitted → denied` → `rejected(permission-denied)`. No consent state changes; no propagation event is recorded. (Invariant 7 — administration is permission-gated.)

### Rejection path — withdrawing an already-revoked consent

A retry after a timeout: `withdraw_consent(actor_ref="consent_svc", consent_id="cns-7001", credential=<consent_svc>, reason="retry")` → step 5 maps Consent's `already-revoked` → `rejected(already-revoked)`. No second propagation event is recorded; the single `consent.revoked` event from the first withdrawal stands. (Consent Invariant 3 — terminal absorption — surfaced at the composition boundary.)

### Rejection path — gate query for a subject who never consented

`processing_permitted("user-9999", "marketing:email")` where no consent record exists → `Consent.check → not-known` → `rejected(not-permitted(not-known))`. The processing system distinguishes *never consented* from *withdrawn* and requests consent rather than honoring a withdrawal that never happened.

---

## Regulated adversarial scenarios

**Regulator audit — "prove every consent-based processing activity was gated on valid consent, and that withdrawals propagated."** A data protection authority examines the Audit Trail and the processing records. For every downstream processing activity, the examiner confirms a `processing.registered` event bound it to a `consent_id` (Invariant 4); for the consent governing it, the examiner confirms a `consent.granted` event (Invariant 2) and that `AuditTrail.verify_record` returns `verified` for both. For every withdrawn consent, the examiner confirms exactly one `consent.revoked` event whose `affected_scopes` enumerates every `processing.registered` binding for that `consent_id` (Invariant 3) — a withdrawal whose `affected_scopes` omits a registered binding, or a revoked Consent record with no `consent.revoked` event at all, is a conformance failure. The examiner consults no source code or runbooks; the gate is the single processing precondition (Invariant 1) and the propagation event is the single record of downstream impact.

**Disputed withdrawal — data subject claims processing continued after they withdrew consent.** A data subject complains that marketing continued after withdrawal. The investigator retrieves the `consent.revoked` event for the subject's consent: it carries `revoked_at`, `reason`, and the complete `affected_scopes` set naming `email-campaign-engine@campaigns` and `lookalike-audience-builder@adtech`. The investigator can therefore name *exactly which processors were on notice* and when. Consent Invariant 9 (revocation non-retroactivity) and the Audit Trail seal establish the withdrawal record was not altered or back-dated. If a named processor continued after `revoked_at`, that is that processor's compliance failure — C2's records prove the withdrawal was recorded, propagated, and enumerated; whether each named processor *acted* on it is the processor's obligation, signalled but not performed by C2. The propagation event is the rebuttal to "we were never told."

**Breach or incident forensics — which subjects had withdrawn consent during the compromise window, and was any withdrawal record altered.** An incident investigator is given a window and must reconstruct which consents were Granted versus Revoked during it and whether any withdrawal or its propagation set was tampered with. The investigator replays each consent's `consent.granted`, `processing.registered`, and `consent.revoked` events in Event Log insertion order (reached transitively through Audit Trail), determining each consent's state and downstream-binding set at the window's bounds, then runs `AuditTrail.verify_record` against representative events in each seal's coverage to bound any tampering window. Invariant 3 is load-bearing: a `consent.revoked` event whose `affected_scopes` was silently shrunk to hide a processor that should have stopped is foreclosed by the append-only, sealed log — the propagation set is part of the hashed event payload, so an alteration breaks the seal. The newest events in the Audit Trail's unsealed tail carry Event Log per-event immutability but become seal-verifiable only after the next seal cadence; until then a tail event returns `failed-verification(unsealed)`, so the integrity bound on the most recent withdrawals is the substrate's unsealed-tail policy (a tighter `seal_cadence` narrows it).

---

## Generation acceptance

A derived implementation of C2 is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the Consent, Permissions, Retention Window, and Audit Trail substrate stores, can do all of the following without recourse to source code, runbooks, or developer narration.

### Audit-Trail-traversal-clearable checks

1. **Grant coverage.** For every consent reachable through C2 in any state, there exists a `consent.granted` Audit Trail event carrying its `consent_id`, for which `AuditTrail.verify_record` returns `verified`. A C2-governed consent with no `consent.granted` event is a conformance failure (Invariant 2).

2. **Propagation completeness.** For every Revoked consent (per the Consent store) governed by C2, there exists exactly one `consent.revoked` event whose `affected_scopes` set equals the set of `processing.registered` bindings for that `consent_id`, and `AuditTrail.verify_record` returns `verified` for it. A Revoked consent with no `consent.revoked` event, with more than one, or with an `affected_scopes` set that omits a registered binding, is a conformance failure (Invariant 3).

3. **Registration grounding.** For every `processing_scope`/`processor_ref` pair appearing in any `consent.revoked` event's `affected_scopes`, there exists a `processing.registered` event with the same `consent_id` ordered before that revocation in the Event Log. An `affected_scope` with no precipitating registration event is a conformance failure (Invariant 4).

4. **Gate-result consistency.** For a sample of `(subject_ref, purpose)` pairs, `processing_permitted` returns `permitted` exactly when `Consent.check` returns `granted` (Invariant 1). The auditor re-runs both and confirms agreement.

5. **Consent-record retention (existence).** For every consent governed by C2, the Retention Window store contains a consent-record retention (the `consent_record_retention_id` in `consent_to_retention`) in `Retained` state, and no consent record is purged before its `retention_until` elapses (Retention Window Invariant 7; Invariant 6). (Whether the configured policy's duration *meets the applicable regulatory proof-period minimum* is an externally-clearable check.)

6. **Constituent Generation acceptance bars.** Verify each constituent's own Generation acceptance bar over its store: Consent's seven checks, Permissions' checks, Retention Window's five checks, Audit Trail's six checks.

### Externally-clearable checks

These audit questions arise around C2 but cannot be answered from the composition's records alone:

- **Whether a named downstream processor actually ceased processing after a withdrawal.** C2 records that a withdrawal was propagated and which scopes it named; it cannot prove that `lookalike-audience-builder` deleted its derived audience. That assurance requires the processor's own records — the propagation event is notice, not enforcement.
- **Whether the consent was freely given, specific, and informed.** C2 records the grant, its `granted_by`, `purpose`, and (via `metadata`) the consent-form version; the GDPR Article 7 quality of the consent (was the banner non-deceptive, was consent unbundled) is a UX-and-legal question the records cannot settle alone.
- **Whether the operator who recorded a consent action was authorized under organizational policy.** C2 enforces a Permissions check and binds the operator cryptographically via the Audit Trail's Actor Identity, but whether the *grant of that permission* reflected correct organizational authority is the Permissions-administration layer's concern (a composing peer — Attributed Permissions Admin).
- **Whether the consent-record retention duration meets the regulatory proof-period floor.** C2 records that a consent-record retention exists and its `retention_until`; verifying that the configured `consent_record_retention_policy_ref` encodes at least the applicable minimum requires the deployment's Retention Window policy registry and knowledge of the regulatory floor — a Configuration deployment obligation.
- **Whether processing rested on consent at all.** C2 governs the consent basis (GDPR Article 6(1)(a)); whether a given processing activity should have rested on a *different* lawful basis (legitimate interest, legal obligation) is a basis-selection question outside C2 — a KYC obligation under C8 rests on Article 6(1)(c), not consent, and is not a C2 concern.

---

## Edge cases and explicit non-goals

- **Cross-store consistency under partial failure.** Several C2 actions write to two or three stores in sequence; a failure between writes leaves partial state. The most consequential gap is in `withdraw_consent`: step 5 revokes in Consent, then step 6 records the `consent.revoked` propagation event; if step 6 fails, the consent is Revoked but the withdrawal is **unpropagated** — a Revoked consent with no `consent.revoked` event, violating Invariant 3. Consent's revocation is immutable once committed, so synchronous rollback is not available. The conforming implementation commits steps 5–6 within one host transaction boundary so they land together or not at all; where the host cannot provide that atomicity, the implementation must (a) retry the failed `record_action` until it lands, and (b) immediately surface the orphan (a Revoked consent with no propagation event) to the compliance dashboard as a high-priority finding, with the compensating `consent.revoked` event, once it lands, carrying a `cascade_recovery = true` marker so an auditor can distinguish a clean withdrawal from a recovered one. The analogous gaps in `record_consent` (granted-and-retained consent with no `consent.granted` event), `register_processing` (binding intended but its event lost — mitigated by audit-first ordering: the binding is added to the map only after the event lands, so a lost event means the binding simply is not registered, a fail-safe-toward-omission that a retry corrects), and `read_consent_history` (records read but access unrecorded — mitigated by recording before returning) are each handled the same way. This mirrors Defensible Retention's and KYC's treatment of their cross-store atomicity holes. Deployments under GDPR exposure must treat a Revoked-but-unpropagated consent as a hard alerting condition.

- **Two Retention Window instances.** There are two distinct Retention Window concerns, and conflating them is a reference ambiguity. (1) The **consent-record Retention Window instance** named in *Composes* holds one placement per consent record (at `record_consent`), governing the consent record's lifetime as demonstrability evidence. (2) The **audit-event Retention Window instance** lives *inside the Audit Trail substrate* and governs the lifetime of the consent audit *events* (`consent.granted`, `consent.revoked`, etc.), configured via `audit_trail_retention_policy`. The two instances are separate and their policies differ — audit events should persist at least as long as the consent record they describe, and often longer for litigation defensibility after the consent record is purged.

- **The composition does not perform downstream cessation.** `withdraw_consent` records that a withdrawal occurred and enumerates the downstream scopes that relied on the consent; it does **not** delete derived data, halt pipelines, or notify third parties. Those are the downstream processors' obligations, signalled by the `consent.revoked` event's `affected_scopes`. C2 is the system of record for *that* consent was withdrawn and *what* relied on it; it is not the orchestrator of *cessation*. A deployment that needs guaranteed cessation wires a downstream-action engine (or a Notification Fanout to the named processors) that consumes the propagation event — a composing peer, not a constituent.

- **`register_processing` does not gate on consent state.** A processing activity may be registered against a Granted consent before processing begins, and the registration neither requires nor checks that consent is currently `granted` — that is the `processing_permitted` gate's job at processing time. Registering against a consent that is later revoked is exactly the case the propagation is for: the binding is in `consent_to_downstream`, so withdrawal enumerates it. Registering against an already-Revoked consent is permitted (the binding records intent) but pointless — `processing_permitted` will reject — and a deployment that wants to forbid it wires the check above C2.

- **Processing systems reading Consent directly.** Processing systems must call `processing_permitted` and must **not** read Consent's `check` directly. The prohibition is structural, not stylistic: if each processing system reads Consent and applies its own predicate, the gate is re-implemented per system, and the first system that treats `expired` as `granted`, caches a stale result, or forgets the check breaks the Article 6 basis silently and per-system. Centralizing the gate at `processing_permitted` makes the guarantee exist exactly once. A deployment in which a processing system reads Consent directly is a composition-bypass finding (Invariant 1's deployment obligation).

- **Self-service withdrawal and Article 7(3) ease.** GDPR Article 7(3) requires withdrawal be as easy as grant. That ease is a property of the data-subject-facing surface (the unsubscribe link, the preferences toggle) upstream of C2. C2's `withdraw_consent` is permission-gated because it is the *operator-side* recording of a withdrawal; a self-service deployment wires the subject's own withdrawal request to an actor holding `consent:revoke` at the calling layer, so the subject's absolute right to withdraw is honored without granting the subject internal Permissions. C2 does not model the data-subject-facing surface; it records the withdrawal the surface produces.

- **Consent for non-consent lawful bases.** GDPR Article 6 names six lawful bases; C2 governs only consent (6(1)(a)). Processing that rests on legitimate interest, contract necessity, or legal obligation (e.g., KYC under C8, which rests on 6(1)(c)) is not gated by C2 and must not be — a customer cannot withdraw the basis for AML-mandated processing. C2's gate applies only to consent-based purposes; basis selection is upstream.

- **Preference management beyond consent.** The composition's title names "Preference Management." Communication *preferences* that are not lawful-basis consent (preferred channel, frequency caps, quiet hours) are the [Preference / Personalization](../atoms/preference.md) atom's concern and are governed by Preference-Aware Notification Fanout (C11), not C2. C2 governs *consent as a lawful basis*; where a deployment's "preferences" are in fact consent (opt-in to a marketing channel), they are C2's; where they are delivery-shaping under an existing basis, they are C11's. The boundary is whether the toggle is the *lawful basis* for processing (C2) or the *shape* of processing already lawful (C11).

- **Concurrency.** Concurrent state-changing actions for the same `consent_id` (e.g., two `withdraw_consent` calls, or a `register_processing` racing a `withdraw_consent`) resolve under the host environment's serialization guarantees; Consent's named edge case on concurrent `revoke` governs the constituent layer (the first revoke wins, the second observes `already-revoked`). A `register_processing` that commits its binding *after* a concurrent `withdraw_consent` computed its `affected_scopes` (step 4) would leave that binding out of the propagation event — so deployments must serialize `register_processing` and `withdraw_consent` on a given `consent_id`, or accept that a registration racing a withdrawal may not be enumerated (a fail-toward-omission the host must close where it matters). `processing_permitted` is read-only and excluded from the serialization obligation; its single `Consent.check` read is authoritative and any skew fails safe — a stale read can only yield a spurious `not-permitted`, never a false `permitted`.

- **Clock semantics.** `now` in `registered_at`, `revoked_at`, and audit-event timestamps comes from the application's implicit clock. Where withdrawal timestamps have legal force (Article 7(3) disputes turn on *when* consent was withdrawn), the implementation must source time from a trustworthy clock; a composed Trusted Timestamping pattern supplies the verifiable time-anchor and binds Event Log insertion order to wall-time. Absent it, insertion order is authoritative and timestamps are advisory. *Determinism note:* `now`-reads and the generation of fresh ids occur inside the state-changing actions, following the inherited atom pattern; the authoritative ordering is the Event Log's insertion order (reached transitively through Audit Trail).

---

## Standards references

- **GDPR Article 6(1)(a)** — consent as a lawful basis for processing. C2's `processing_permitted` gate is the structural form of the before-processing basis check; a `permitted` result is the records-alone evidence that a valid consent existed at processing time.
- **GDPR Article 7(1)** — the controller bears the burden of demonstrating consent. C2's `consent.granted` events plus the retained Consent records (held under the consent-record Retention Window — Invariant 6) are the demonstrability surface; a withdrawn consent is retained as proof the basis once existed.
- **GDPR Article 7(3)** — withdrawal must be as easy as grant, and withdrawal does not affect the lawfulness of prior processing. `withdraw_consent` is the recording surface; the data-subject-facing ease is upstream (Edge cases — *Self-service withdrawal*); non-retroactivity is inherited from Consent Invariant 9.
- **GDPR Article 17(1)(b)** — right to erasure when consent is withdrawn and no other basis applies. The `consent.revoked` event's `affected_scopes` is the notice that triggers downstream erasure obligations; C2 signals, the downstream processor erases (Edge cases — *The composition does not perform downstream cessation*).
- **GDPR Article 30** — records of processing activities must name purposes and legal bases. C2's Consent records (`purpose`, `granted_at`) plus the `processing.registered` bindings supply the Article 30 documentation surface for consent-based processing.
- **CCPA / CPRA** — right to opt out of sale/sharing and opt in for sensitive personal information. C2's `record_consent` / `withdraw_consent` are the opt-in/opt-out recording surfaces; the propagation event names the processors a do-not-sell signal must reach.
- **HIPAA §164.508 (Authorization)** — required Authorization elements (purpose, expiration, right to revoke) map to the Consent record fields; C2 adds the operator-authority gate (Permissions) and the tamper-evident audit the regulated context requires.
- **ePrivacy Directive (Cookie Law)** — consent for non-essential cookies and tracking. A cookie-consent backend records `grant`/`revoke` through C2; the `consent.revoked` propagation names the tracking systems that must stop.
- **ISO/IEC 29184 (Online privacy notices and consent)** — consent record content and lifecycle. C2's grant/registration/withdrawal records are the lifecycle artifacts the standard describes.

The four constituents carry their own deep standards inheritance — see each constituent's Standards references.

---

## Status

`grounded on Final Critique 4 — 2026-06-04` (formal layer complete 2026-06-04 — TLA+ model [`consent-preference-management.tla`](./consent-preference-management.tla) + buggy twin verified in `tools/harness/`; see Lineage §Formal model). Authored end-to-end 2026-06-04: Opus-gated through Pass 1 (GRID), Pass 2 (EOS — Permissions confirmed a constituent (inward-authorization surface) rather than a peer, the constituent set Consent + Permissions + Audit Trail substrate (+ consent-record Retention Window) confirmed, downstream-cessation and preference-management-beyond-consent extracted as composing concerns), Pass 3 (Linus), and a Final Critique round; foundational and refining findings closed in-pattern (see Lineage notes). Regulated-pattern conventions (Regulated adversarial scenarios; Generation acceptance split) baked in from the first draft. Composition logic specified across all constituents; emergent state (`consent_to_downstream`, `consent_to_retention`, `consent_to_subject_purpose`) named with population discipline; five actions wired (`record_consent`, `register_processing`, `withdraw_consent` with the load-bearing propagation, `read_consent_history` with its access meta-event, and the read-only `processing_permitted` gate) with fully-named rejection taxonomies; the load-bearing consent-gates-processing-with-propagation decision defended in four parts; seven composition-level invariants stated; walkthrough plus re-consent path and three rejection-path examples; three regulated adversarial scenarios; Generation acceptance split between Audit-Trail-traversal-clearable and externally-clearable checks; nine edge cases including cross-store consistency, the two-Retention-Window-instances distinction, the no-downstream-cessation boundary, the processing-systems-must-use-the-gate prohibition, the self-service-withdrawal/Article-7(3) boundary, and the preference-management-beyond-consent (C11) boundary. The formal-layer vote was YES; the derived TLA+ model — the revocation-propagation binding bijection (revoke ⇔ complete propagation record), mirroring `audit-trail.tla` / `forensic-recovery.tla` — verifies green with a buggy twin the checker rejects. This brings the library to **44 grounded patterns (17 grounded compositions)** and retires the C2 forthcoming-links in Consent, KYC (C8), and the compositions catalog.

---

## Lineage notes

Regulated composition. The two regulated-overlay conventions — *Regulated adversarial scenarios* and *Generation acceptance* (split per the regulated-composition convention) — are **inherited from the methodology directly** ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft, not re-derived from predecessor patterns. KYC / Customer Onboarding (C8) is the primary structural reference for the substrate-composition shape, the gate-query pattern (`activity_permitted` → `processing_permitted`), the two-Retention-Window-instances distinction, the cross-store-consistency-under-partial-failure treatment, the composition-owned-maps discipline, and the Generation acceptance split. Defensible Retention is the secondary reference for the retention-floor invariant. The revocation-propagation binding bijection is modeled on Audit Trail's cascade-atomicity and the binding-bijection compositions (Chain of Custody / Forensic Recovery).

**Structural milestone.** This composition retires the `*(forthcoming)*` C2 links in [`atoms/consent.md`](../atoms/consent.md)'s Composition notes and Edge cases (the *Consent withdrawal propagation* edge case names C2 as the home of the propagation Consent excludes), and the C2 composing-peer references in [`compositions/kyc-customer-onboarding.md`](./kyc-customer-onboarding.md). When this composition grounds, those forthcoming-links resolve.

**Pass 2 (EOS conceptual independence) — constituent-set decisions.**

- *Permissions: constituent, not peer.* Permissions was evaluated as a composing peer (as it is in Consent's own Intent, which frames the two as peers). For C2 it is a **constituent**: the composition itself calls `Permissions.permitted` at every administration action's boundary, so Permissions is wired into C2's action logic, not merely adjacent to it. The peer relationship Consent describes is between the two *authorization surfaces* (inward vs outward); C2 operationalizes that relationship by making Permissions the gate on administration while keeping it out of the processing gate (Invariant 7). Resolved: Permissions is a constituent; the inward/outward distinction is preserved as an invariant.
- *Downstream cessation extracted.* Performing the cessation a withdrawal demands (deleting derived data, halting pipelines, notifying third parties) was evaluated as in-scope. It is extracted: importing the notion of "perform the downstream action" would require C2 to know the interface of every downstream processor, breaking the composition's boundary. C2 *signals* (the propagation event's `affected_scopes`); a downstream-action engine or Notification Fanout *acts*. Named in Edge cases.
- *Preference management beyond consent extracted.* The title names "Preference Management," but delivery-shaping preferences (channel, frequency, quiet hours) that are not lawful-basis consent belong to the Preference atom and C11 (Preference-Aware Notification Fanout). C2 governs consent-as-lawful-basis; the boundary (basis vs shape-of-already-lawful-processing) is named in Edge cases.
- *Event Log / Retention Window / Actor Identity / Tamper Evidence reached transitively.* Per the compositions-of-compositions convention, naming Audit Trail as the substrate satisfies the Event Log + Actor Identity + Tamper Evidence + audit-event Retention Window requirement transitively; the only directly-named Retention Window is the distinct consent-record instance. This matches KYC's substrate treatment.

**Pass 1 (GRID) — findings closed in-pattern.**

- *Gate result-set not first-class.* The initial `processing_permitted` returned `permitted | denied`, collapsing *never consented*, *withdrawn*, and *expired* into one `denied`. A processing system cannot choose a remediation (request consent vs honor withdrawal vs request renewal) from a bare `denied`. Fixed: `rejected(not-permitted(state))` names the actual `Consent.check` result.
- *`register_processing` audit-first ordering unstated.* The first draft added the `consent_to_downstream` binding before recording its event, so a lost event would leave a binding with no `processing.registered` record — breaking Invariant 4 silently. Fixed: the binding is added only after the event lands (step 5 after step 4), a fail-toward-omission a retry corrects.
- *`affected_scopes` computation point unspecified.* Whether the propagation set is read before or after the revoke was ambiguous; reading it after a concurrent `register_processing` could include or exclude a racing binding non-deterministically. Fixed: step 4 computes `affected_scopes` from the records *before* the revoke, and the Concurrency edge case names the serialization obligation.

**Pass 3 (Linus, adversarial) — findings closed in-pattern.**

- *The propagation could be a no-op and still "pass."* If `consent_to_downstream[consent_id]` is empty (no processing ever registered), `withdraw_consent` records a `consent.revoked` event with an empty `affected_scopes`. Is that vacuous? No — an empty set is the *correct, complete* enumeration (nothing relied on the consent), and the event still records the withdrawal. The binding bijection holds with an empty set. Documented: the invariant is *completeness*, and the empty set is complete when nothing was registered. The formal model checks the non-empty case to avoid a vacuous guarantee (Lineage — *Formal model*).
- *Read-gated-on-audit-write is unusual — defend it.* `read_consent_history` refuses to return records if its `consent.history-read` meta-event fails to record. A reviewer flagged this as surprising (reads usually don't fail on audit). Defended in-pattern: under the regimes C2 serves (and following the first render's Demo-2 `audit.viewed` meta-event precedent), *access to consent records is itself a regulated act*; returning regulated records without recording the access defeats the access trail. The behavior is deliberate and named in the action.
- *Permissions on `withdraw_consent` vs the subject's absolute right to withdraw.* Gating withdrawal on an operator Permission appears to conflict with GDPR Article 7(3)'s "as easy as grant." Resolved in-pattern: the Permissions check gates the *operator recording* the withdrawal, not the *subject's right*; self-service withdrawal wires the subject's request to a `consent:revoke`-holding actor at the calling layer. Named in Edge cases — *Self-service withdrawal*.
- *Gate must not consult Permissions.* An early draft of `processing_permitted` was tempted to also check that the *processing system* held a permission. That conflates inward and outward authorization — processing is gated by the *subject's consent*, not the system's permission. Fixed: `processing_permitted` consults only `Consent.check`; Invariant 7 locks the separation.

**Final Critique — Phase-4 Opus clearance gate (Happy Torvalds X2), 2026-06-04.** Fresh-reader Opus; all three passes, Pass 3 at X2 depth. Pass 1 and Pass 2 clean. Pass 3 surfaced refining findings, zero foundational — the gate clears at the 92%-good threshold. Refining: the `register_processing` idempotence-vs-event-count nuance was clarified (set membership, not event count, is what the propagation enumerates); the Concurrency edge case's register-racing-withdrawal fail-toward-omission was made explicit; the externally-clearable check "whether a named processor actually ceased" was sharpened to distinguish notice from enforcement. **Gate result: zero foundational findings → `grounded`.**

**Formal-layer vote — 2026-06-04: YES.** The load-bearing claim is Invariant 3 — revocation-propagation completeness as a binding bijection (revoke ⇔ complete, atomic propagation record). This is a cross-store cascade-atomicity claim of exactly the shape `audit-trail.tla` (cascade-on-purge atomicity) and the binding-bijection composition models (`chain-of-custody.tla`, `forensic-recovery.tla`) verify: under interleaving, no reachable state may have a revoked consent without its propagation record, and none may have a partial/incomplete propagation. Invariant 1 (gate result) and Invariant 7 (authorization separation) are records-alone/precondition claims English carries; the propagation atomicity is the interleaving claim a model earns its keep on.

**Formal model — 2026-06-04: TLA+ authored and verified.** Derived model [`consent-preference-management.tla`](./consent-preference-management.tla) + config + buggy twin [`consent-preference-management-buggy.tla`](./consent-preference-management-buggy.tla), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* per consent, three sub-writes model the withdrawal-with-propagation — `revoked` (Consent revoke committed), `propagated` (the `consent.revoked` event recorded), and `scopesComplete` (the event's `affected_scopes` equals the registered downstream set). The **correct** model commits all three as one atomic action, so every reachable state is coherent (`Inv3_BindingBijection`: a consent is revoked iff it is propagated-with-complete-scopes); no reachable state has a revoked-but-unpropagated consent (`Inv_NoDanglingRevoke`) or a propagation without its revoke (`Inv_NoOrphanPropagation`). The **buggy twin** splits the withdrawal into separate, interleavable sub-steps with no compensation (revoke, then separately propagate) — the naive non-atomic implementation the *Cross-store consistency* edge case warns against — and TLC finds the dangling partial (a revoked consent with no propagation event) that violates `Inv3_BindingBijection` and `Inv_NoDanglingRevoke`. The twin proving the checker *can* fail is the vacuity guard. *Out of model scope:* the Consent grant/expire lifecycle (see `atoms/consent.md` — voted English-only), the Permissions gate (precondition), the Audit Trail substrate internals (`audit-trail.tla`), Retention Window. *Conflict-protocol outcome:* none — the model corroborates the English; canonical English unchanged.

**Forthcoming-link resolution — 2026-06-12 (cross-file fix, recorded per workflow step 5).** Two Composition-notes peer entries resolved when their compositions landed: the Preference-Aware Notification Fanout entry (C11) dropped its *forthcoming* marker and gained its live link on C11's landing; and the Data Subject Rights Fulfillment entry (C7) — found carrying a stale *forthcoming* marker **and** a mis-targeted link to the KYC file after C7 had grounded 2026-06-09 — corrected to link `data-subject-rights-fulfillment.md`. Cross-reference fixes only; no invariant, action, or example content touched.

---

## Composition notes

These are adjacent compositions, **not** constituents of C2:

- **[KYC / Customer Onboarding](./kyc-customer-onboarding.md)** (C8) — a composing peer. C8's processing basis is GDPR Article 6(1)(c) legal obligation; C2 governs the Article 6(1)(a) consent basis for downstream non-obligatory processing C8 does not touch. The two coexist for the same party: C8 gates AML-obligatory activity on verification; C2 gates marketing/profiling on consent.
- **[Data Subject Rights Fulfillment](./data-subject-rights-fulfillment.md)** (C7) — answers DSAR access and erasure requests across the data estate. C2's `read_consent_history` and `consent.revoked` propagation are primary inputs to a C7 right-of-access or right-to-erasure response; C7 orchestrates the cross-system fulfillment, C2 supplies the consent surface.
- **[Preference-Aware Notification Fanout](./preference-aware-notification-fanout.md)** (C11) — governs delivery-shaping preferences (channel, frequency, quiet hours) under an existing lawful basis. C2 governs consent-as-basis; C11 governs the shape of processing already lawful. The boundary is named in Edge cases — *Preference management beyond consent*.
- **Downstream-action engine / Notification Fanout** — a deployment that needs guaranteed cessation (not just notice) on withdrawal wires a consumer of the `consent.revoked` propagation event that performs the downstream actions. C2 signals; the engine acts.
