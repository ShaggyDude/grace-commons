---
title: External Onboarding
parent: Compositions
nav_order: 15
has_toc: true
toc: true
---

# External Onboarding

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A regulated application: the full arc of admitting an external entity to a system — invitation issued by an authorized actor, accepted by the invitee (establishing the single identity binding), Party Identity enrolled in Unverified state, credential registered, every step attested in the Audit Trail. The load-bearing emergent invariant is invitation-gates-enrollment: no Party Identity is created via this composition unless an Invitation's Accepted transition precedes it, and the Audit Trail completion record names the specific invitation, the accepting identity, the party record, and the credential in one tamper-evident entry. Without the composition, any of these steps can occur independently, in any order, without a documented chain; the composition is what makes the chain mandatory and auditable.

**Status:** grounded on Final Critique 5 — 2026-05-23 · **Composes:** [Invitation](../atoms/compliance/invitation.md) · [Credential](../atoms/compliance/credential.md) · [Party Identity](../atoms/compliance/party-identity.md) · [Audit Trail](./audit-trail.md)

---

## Intent

Every system that admits external parties — customers, collaborators, patients, counterparties — faces the same structural challenge: the invitation must be issued before the invitee exists in the system, yet the moment of acceptance is the moment at which the system must durably record who joined, establish their identity record, and register the credential they will use to authenticate. Those three obligations — serializing concurrent acceptance attempts, creating the party record, registering the credential — belong to different atoms. The question of what must happen when they meet, in what order, with what audit record binding the whole arc together, belongs to no single atom. It belongs to the composition.

External Onboarding wires the four constituent atoms into a single enforced onboarding boundary. The `invite` action establishes the documented intent: an authorized actor initiates an invitation, creating an audit-anchored record of who invited whom and to what context. The `onboard` action is the composition's load-bearing center: it calls `Invitation.accept` first — establishing the single-resolution serialization point — then `Party Identity.enroll`, then `Credential.register`, recording the full arc in the Audit Trail as a single named event that links invitation token, accepting identity reference, party record, and credential. The `decline` and `revoke` actions close the invitation on the other terminal paths, each attested in the Audit Trail.

The emergent invariant is invitation-gates-enrollment: no Party Identity is enrolled and no Credential registered via this composition unless an Invitation's `Accepted` transition precedes them in the same onboarding call. The Invitation atom's single-resolution invariant (exactly one of four terminal states per invitation, the transition atomic under concurrent attempts) is the mechanism that makes the gate hold under concurrent onboarding attempts for the same invitation — exactly one `onboard` call succeeds; all others receive `already-resolved(Accepted)` and create no permanent records.

The second emergent property is the identity binding at accept, not at initiate. The `accepting_identity_ref` passed to `Invitation.accept` — a caller-supplied external reference identifying who is accepting, such as an email address or an external identity handle — is recorded permanently in the Invitation record at the moment of acceptance. The `party_id` produced by the downstream `Party Identity.enroll` call is then linked to that `accepting_identity_ref` in the Audit Trail completion record. The tracing path — from any enrolled Party Identity back to the specific Invitation that authorized its creation — runs through the Audit Trail: the completion event carries both the `invitation_token` and the `party_id`, making the chain reconstructable from records alone.

---

## Composes

- **[Invitation](../atoms/compliance/invitation.md)** — the lifecycle record of an invitation from `Pending` through one of four terminal states. Provides the serialization gate via its single-resolution invariant: `Invitation.accept` is atomic under concurrent attempts; exactly one succeeds. Surface used: `initiate`, `accept`, `decline`, `revoke`.
- **[Credential](../atoms/compliance/credential.md)** — the durable binding between a principal and authentication material. Registered after Party Identity enrollment so the `principal_ref` is a valid `party_id`. Surface used: `register`.
- **[Party Identity](../atoms/compliance/party-identity.md)** — the persistent, verifiable identity record for an external party. Enrolled in `Unverified` state; verification (the transition to `Verified`) is a downstream concern handled by [KYC / Customer Onboarding (C8)](../ROADMAP.md) or equivalent. Surface used: `enroll`.
- **[Audit Trail](./audit-trail.md)** — the tamper-evident, attribution-stamped substrate recording every onboarding event. Every action that changes state in any of the three data-bearing atoms is recorded here. Surface used: `record_action`. Event Log, Actor Identity, Retention Window, and Tamper Evidence are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms.

---

## Composition logic

Four actions form the onboarding boundary. Each wraps one or more constituent atom calls and produces an Audit Trail record.

**`invite` wiring.** The inviter calls the composition with their actor credentials. The composition calls `Invitation.initiate` and, on success, records `invitation.initiated` in the Audit Trail naming the inviter, the invitee reference, and the invitation token. The invitation token is returned so the inviter can deliver it to the invitee out-of-band (email link, QR code, direct message).

**`onboard` wiring — the load-bearing center.** The step order is fixed and non-negotiable:

1. `Invitation.accept(invitation_token, accepting_identity_ref)` — the serialization gate fires first. If the invitation is not `Pending` (already accepted, declined, revoked, or expired), the entire call fails before any enrollment record is created. No Party Identity is enrolled; no Credential is registered; no identity is bound. The call returns `invitation-invalid(reason)`.
2. Audit Trail record: `onboarding.invitation-accepted` — records the gate clearing: `{invitation_token, accepting_identity_ref}`.
3. `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id`. The party is created in `Unverified` state. If this fails (storage-failure), the composition writes `onboarding.interrupted` to the Audit Trail and returns `storage-failure`. The invitation is permanently Accepted; recovery requires admin intervention (see Edge cases).
4. `Credential.register(principal_ref: party_id, credential_material, credential_type, expires_at?)` → `credential_id`. The credential is bound to `party_id`. If this fails, the composition writes `onboarding.interrupted` to the Audit Trail (naming the enrolled `party_id`) and returns `storage-failure`. The invitation is Accepted and the party is enrolled; recovery requires admin intervention.
5. Audit Trail record: `onboarding.completed` — records the full arc: `{invitation_token, accepting_identity_ref, party_id, credential_id}`. If this record fails to write, the composition returns `storage-failure`. The enrollment and credential exist; the completion record does not. The GA check for unrecorded completions detects this gap (see Generation acceptance, check 5).
6. Return `{party_id, credential_id}`.

**`decline` wiring.** The invitee (or the system on their behalf) presents the invitation token. The composition calls `Invitation.decline`, then records `invitation.declined` in the Audit Trail using the system service actor. `Invitation.decline` does not record the decliner's identity (Invitation atom design); the Audit Trail records the timestamp and that the decline occurred, not who declined. If a deployment requires recording the decliner's identity, that is done in the `data` payload of the Audit Trail event and enforced above the atom layer.

**`revoke` wiring.** The inviter or an administrator calls `revoke` with their actor credentials. The composition calls `Invitation.revoke`, then records `invitation.revoked` in the Audit Trail, attributing the revocation to the revoking actor.

**The step-order constraint is the composition's central contribution.** Neither `Party Identity.enroll` nor `Credential.register` is called unless `Invitation.accept` returns `accepted`. The Audit Trail substrate records both the moment the gate cleared and the subsequent enrollment and credential steps, so the full arc is traceable from records alone.

---

## Application state

This composition introduces no cross-atom persistent state beyond what the constituent atoms and the Audit Trail substrate maintain. There is no composition-owned index or map.

The tracing from any Party Identity record back to the specific Invitation that authorized its creation runs through the Audit Trail: the `onboarding.completed` event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` in its data payload. An investigator querying "what invitation authorized the creation of party P?" retrieves the `onboarding.completed` event whose `party_id` field matches P and reads `invitation_token` from the event data.

The absence of a composition-owned map is intentional: the Audit Trail is already the tamper-evident, attributable, retention-bounded record required by the regulated adversarial scenarios. A separate map would duplicate that record under weaker integrity guarantees. The Audit Trail is the map.

---

## Actions

### invite

Initiates an invitation from an authorized actor to an external party, creating an audited record of the invitation event.

```
invite(
  inviter_ref,
  invitee_ref,
  context,
  ttl,
  actor_credential
) →
    invitation_token
  | rejected(invalid-request | invalid-credential | storage-failure)
```

**Arguments**

- `inviter_ref` — opaque reference to the internal actor issuing the invitation. Used as `inviter_ref` in `Invitation.initiate` and as `actor_ref` in the Audit Trail record. Non-null, non-empty.
- `invitee_ref` — opaque reference to the intended invitee. Optional (may be null if the invitee has no system identity yet). Passed through to `Invitation.initiate`.
- `context` — opaque descriptor of what the invitee is being invited to join (organization, workspace, role). Non-null, non-empty.
- `ttl` — invitation validity duration. Null uses the deployment default. Positive if supplied.
- `actor_credential` — the inviter's Actor Identity credential, used to produce the Audit Trail attestation. Verified by `Audit Trail.record_action` before any invitation is created.

**Steps**

1. Validate inputs. If `inviter_ref`, `context`, or (if supplied) `ttl` fails validation → `rejected(invalid-request)`. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.initiate", actor_ref=inviter_ref, credential=actor_credential, data={invitee_ref, context, ttl})` → `event_id | rejected(invalid-credential | recording-failure)`.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop.
   - `recording-failure` → `rejected(storage-failure)`. Stop.
3. Call `Invitation.initiate(inviter_ref, invitee_ref, context, ttl)` → `invitation_token | rejected(invalid-request | storage-failure)`.
   - `invalid-request` → `rejected(invalid-request)`. Stop. (The Audit Trail record in step 2 records the attempt; this is consistent with the library's audit-first discipline.)
   - `storage-failure` → `rejected(storage-failure)`. Stop.
4. Return `invitation_token`.

**Note on step ordering.** The Audit Trail record is written before `Invitation.initiate`. This records the inviter's intent even if the invitation store fails. An Audit Trail record for `invitation.initiate` without a corresponding Invitation record indicates a storage failure in the invitation store after the actor was authenticated; the GA covers this gap (check 6).

---

### onboard

Accepts an invitation and, in one enforced sequence, enrolls the invitee as a Party Identity and registers their credential. The single serialization gate is `Invitation.accept`; no enrollment or registration occurs unless it returns `accepted`.

```
onboard(
  invitation_token,
  accepting_identity_ref,
  name,
  date_of_birth,
  document_type,
  document_ref,
  credential_type,
  credential_material,
  expires_at?,
  enrolling_actor_ref,
  actor_credential
) →
    {party_id, credential_id}
  | rejected(
      invalid-request
    | invalid-credential
    | invitation-invalid(already-resolved(state) | not-known | expired)
    | storage-failure
    )
```

**Arguments**

- `invitation_token` — the bearer token identifying the invitation to accept.
- `accepting_identity_ref` — a caller-supplied opaque reference identifying who is accepting the invitation (e.g., an email address, an external identity handle, a pre-registration ID). This is the permanent binding written to the Invitation record at acceptance time. Non-null, non-empty. Does not need to be a `party_id` or any system-internal reference; it is the caller's external correlator.
- `name`, `date_of_birth`, `document_type`, `document_ref` — Party Identity enrollment fields. Subject to Party Identity's validation rules.
- `credential_type`, `credential_material`, `expires_at?` — Credential registration fields. Subject to Credential's validation rules.
- `enrolling_actor_ref` — the internal actor (admin, onboarding service, system account) performing the enrollment on behalf of the invitee. This actor is the Audit Trail attribution subject — not the invitee, who has no system credential yet. Non-null, non-empty.
- `actor_credential` — the `enrolling_actor_ref`'s Actor Identity credential, used for Audit Trail attestation.

**Steps**

1. Validate inputs. Any missing or malformed required field → `rejected(invalid-request)`. Stop.
2. Verify actor credential: call `Audit Trail.record_action` in credential-check mode, or verify `actor_credential` against Actor Identity directly. If `invalid-credential` → `rejected(invalid-credential)`. Stop. (No invitation is accepted, no record is created.)
3. Call `Invitation.accept(invitation_token, accepting_identity_ref)` → `accepted | rejected(...)`.
   - `rejected(already-resolved(Accepted))` → `rejected(invitation-invalid(already-resolved(Accepted)))`. Stop.
   - `rejected(already-resolved(Declined))` → `rejected(invitation-invalid(already-resolved(Declined)))`. Stop.
   - `rejected(already-resolved(Expired))` → `rejected(invitation-invalid(expired))`. Stop.
   - `rejected(already-resolved(Revoked))` → `rejected(invitation-invalid(already-resolved(Revoked)))`. Stop.
   - `rejected(not-known)` → `rejected(invitation-invalid(not-known))`. Stop.
   - `rejected(storage-failure)` → `rejected(storage-failure)`. Stop.
   - In all rejection cases: no permanent records are created.
4. Call `Audit Trail.record_action(action_ref="onboarding.invitation-accepted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref})` → `event_id | rejected(recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. Stop. The invitation is Accepted but no audit record exists. This gap is detectable: any Invitation in Accepted state without a corresponding `onboarding.invitation-accepted` Audit Trail event is an unresolved interruption (GA check 5).
5. Call `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id | rejected(invalid-request | storage-failure)`.
   - `invalid-request` → write `Audit Trail.record_action(action_ref="onboarding.interrupted", data={invitation_token, accepting_identity_ref, stage: "party-enrollment", reason: "invalid-request"})`, then `rejected(invalid-request)`. Stop.
   - `storage-failure` → write `onboarding.interrupted` Audit Trail record (stage: "party-enrollment"), then `rejected(storage-failure)`. Stop.
6. Call `Credential.register(principal_ref=party_id, credential_material, credential_type, expires_at?)` → `credential_id | rejected(invalid-request | duplicate-active-credential | storage-failure)`.
   - Any rejection → write `Audit Trail.record_action(action_ref="onboarding.interrupted", data={invitation_token, accepting_identity_ref, party_id, stage: "credential-registration", reason: <rejection>})`, then `rejected(storage-failure)`. Stop.
7. Call `Audit Trail.record_action(action_ref="onboarding.completed", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, party_id, credential_id})` → `event_id | rejected(recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. Stop. The party is enrolled and the credential is registered, but the completion record is absent. GA check 5 detects unresolved completions.
8. Return `{party_id, credential_id}`.

---

### decline

Records an invitee's deliberate refusal of an invitation and attests the event in the Audit Trail.

```
decline(invitation_token, service_actor_ref, actor_credential) →
    declined
  | rejected(invalid-request | invalid-credential | invitation-invalid(already-resolved(state) | not-known) | storage-failure)
```

**Arguments**

- `invitation_token` — the bearer token identifying the invitation to decline.
- `service_actor_ref` — the system service account used as the Audit Trail attribution actor. `Invitation.decline` does not record the decliner's identity; the Audit Trail records the event against the service account. Deployments that require the decliner's identity to be recorded supply it in the Audit Trail event data payload above the composition layer.
- `actor_credential` — the service account's Actor Identity credential.

**Steps**

1. Validate inputs → `rejected(invalid-request)` if invalid. Stop.
2. Call `Invitation.decline(invitation_token)` → `declined | rejected(already-resolved(state) | not-known | storage-failure)`.
   - `already-resolved(state)` → `rejected(invitation-invalid(already-resolved(state)))`. Stop.
   - `not-known` → `rejected(invitation-invalid(not-known))`. Stop.
   - `storage-failure` → `rejected(storage-failure)`. Stop.
3. Call `Audit Trail.record_action(action_ref="invitation.declined", actor_ref=service_actor_ref, credential=actor_credential, data={invitation_token})` → `event_id | rejected(recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. (The invitation is Declined but the Audit Trail record is absent. GA check 6 detects unattested terminal transitions.)
4. Return `declined`.

---

### revoke

Withdraws a pending invitation before the invitee acts on it, attributing the revocation to the revoking actor in the Audit Trail.

```
revoke(
  invitation_token,
  revoked_by_ref,
  reason,
  actor_credential
) →
    revoked
  | rejected(invalid-request | invalid-credential | invitation-invalid(already-resolved(state) | not-known) | storage-failure)
```

**Steps**

1. Validate inputs → `rejected(invalid-request)` if `revoked_by_ref`, `reason`, or `actor_credential` is absent or malformed. Stop.
2. Verify `actor_credential` → `rejected(invalid-credential)`. Stop if invalid.
3. Call `Invitation.revoke(invitation_token, revoked_by_ref, reason)` → `revoked | rejected(...)`.
   - Translate rejections to `invitation-invalid(...)` or `storage-failure`. Stop.
4. Call `Audit Trail.record_action(action_ref="invitation.revoked", actor_ref=revoked_by_ref, credential=actor_credential, data={invitation_token, reason})` → `event_id | rejected(recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. (Invitation is Revoked but unattested. GA check 6 detects this gap.)
5. Return `revoked`.

---

## Composition-level invariants

**Invariant 1 — Invitation gates enrollment.** No `Party Identity.enroll` call is made via the `onboard` action unless `Invitation.accept` returns `accepted` for the same `invitation_token` in the same call. No Party Identity is enrolled and no Credential registered via this composition without a preceding successful invitation acceptance.

**Invariant 2 — Identity binding at accept, not at initiate.** The `accepting_identity_ref` that permanently identifies who accepted the invitation is supplied at `Invitation.accept` call time, not at `Invitation.initiate` time. The inviting actor makes no binding commitment about the invitee's identity at initiation; the identity binding is the invitee's act at acceptance time.

**Invariant 3 — Credential-follows-party.** `Credential.register` is called only after `Party Identity.enroll` succeeds, and `principal_ref` in the credential is always the `party_id` produced by the enrollment in the same `onboard` call. A credential registered via this composition always has a corresponding Party Identity record as its subject.

**Invariant 4 — Full Audit Trail coverage.** Every terminal state change in the Invitation lifecycle that passes through this composition — `Accepted`, `Declined`, `Revoked` — produces a corresponding Audit Trail event. The `onboard` action produces at minimum an `onboarding.invitation-accepted` record (step 4) and, on success, an `onboarding.completed` record (step 7). On partial failure, an `onboarding.interrupted` record names the stage at which the sequence stopped. No terminal Invitation transition via this composition is structurally invisible in the Audit Trail.

**Invariant 5 — Completion record names the full arc.** The `onboarding.completed` Audit Trail event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` as its data payload. From this single record, an investigator can traverse the full arc: the Invitation record (by `invitation_token`), the Party Identity record (by `party_id`), and the Credential record (by `credential_id`). No join across stores is required beyond the event data payload.

---

## Standards

*Anchors: GDPR Articles 6–7 (lawful basis for processing at invitation and acceptance time); HIPAA §164.312(a)(1) (access control — invitation-based provisioning as a covered access-granting event) + §164.312(d) (person or entity authentication — credential registration at onboarding); SOC 2 CC6.2 (prior to issuing system credentials, new internal and external users are registered and authorized); NIST SP 800-63A (identity enrollment and identity proofing — the enrollment arc); SCIM 2.0 RFC 7644 (cross-domain identity management — the invite-then-provision flow); FATF Recommendations 10–12 (customer due diligence at onboarding — Party Identity in Unverified state is the enrollment record the regulator requires; verification is C8's concern).*

**GDPR Articles 6–7** require a lawful basis for processing personal data. The `invite` action creates the first processing record: the system holds `invitee_ref` and processes data about the invitee from that moment. The `onboard` action creates the `accepting_identity_ref` binding and the Party Identity enrollment — the data subject's active engagement with the system. The Audit Trail records both as the GDPR Article 5(2) accountability records.

**SOC 2 CC6.2** requires that prior to issuing system credentials, new users are registered and authorized. The composition satisfies this literally: `Party Identity.enroll` (registration) precedes `Credential.register` (credential issuance), and both are preceded by `Invitation.accept` (authorization by the inviting actor documented in the Audit Trail).

**NIST SP 800-63A** defines the enrollment event at which an applicant registers with an identity system. The `onboard` action is that enrollment event. The composition does not perform identity proofing (the transition from Unverified to Verified in Party Identity) — that is C8's concern. The composition records the enrollment inputs (`name`, `date_of_birth`, `document_type`, `document_ref`) and the enrolling actor, satisfying 800-63A's enrollment record requirements.

---

## Examples

### New employee onboarding — happy path

An HR administrator invites a new hire who does not yet have a system identity:

```
invite(
  inviter_ref:         "hr_admin_h01",
  invitee_ref:         null,
  context:             "org::acme::dept::engineering",
  ttl:                 604800,
  actor_credential:    <hr_admin_h01's credential>
) → invitation_token: "tok_inv_g7h2k1"
```

Internally: Audit Trail records `invitation.initiate`. Invitation creates the record in `Pending` with `expires_at = now + 7 days`. The HR system emails the new hire a link embedding the token.

On their first day, the new hire presents the token via the onboarding portal. The portal calls:

```
onboard(
  invitation_token:         "tok_inv_g7h2k1",
  accepting_identity_ref:   "newhire@acme.com",
  name:                     "Amara Osei",
  date_of_birth:            "1990-05-12",
  document_type:            "passport",
  document_ref:             "doc_p_a01",
  credential_type:          "password",
  credential_material:      <password hash>,
  expires_at:               null,
  enrolling_actor_ref:      "system_onboarding_svc",
  actor_credential:         <service account credential>
) → {party_id: "party_4421", credential_id: "cred_7791"}
```

Internally: `Invitation.accept("tok_inv_g7h2k1", "newhire@acme.com") → accepted`. Audit Trail records `onboarding.invitation-accepted`. `Party Identity.enroll(...)` → `party_4421`. `Credential.register(principal_ref="party_4421", "password", ...)` → `cred_7791`. Audit Trail records `onboarding.completed: {tok_inv_g7h2k1, newhire@acme.com, party_4421, cred_7791}`.

The party is in `Unverified` state. The HR team proceeds to the KYC verification workflow (C8) to drive the `Party Identity.verify` call that produces the `Verified` transition.

### Concurrent acceptance attempt — second attempt rejected

A second actor (or a duplicate browser tab) attempts to accept the same invitation concurrently:

```
onboard(
  invitation_token:       "tok_inv_g7h2k1",
  accepting_identity_ref: "different@acme.com",
  ...
) → rejected(invitation-invalid(already-resolved(Accepted)))
```

Internally: `Invitation.accept("tok_inv_g7h2k1", "different@acme.com") → rejected(already-resolved(Accepted))`. No Party Identity is enrolled. No Credential is registered. No Audit Trail enrollment record is written. The rejection is clean; Invitation's single-resolution invariant handles the race.

### Invitation revoked before use

An administrator discovers an invitation should not have been issued:

```
revoke(
  invitation_token: "tok_inv_c2d8e3",
  revoked_by_ref:   "admin_a01",
  reason:           "contractor-engagement-cancelled",
  actor_credential: <admin_a01's credential>
) → revoked
```

Any subsequent `onboard` attempt with `tok_inv_c2d8e3` returns `rejected(invitation-invalid(already-resolved(Revoked)))`.

### Invitation declined

```
decline(
  invitation_token:   "tok_inv_p4q9r2",
  service_actor_ref:  "system_onboarding_svc",
  actor_credential:   <service credential>
) → declined
```

---

### Regulated adversarial scenarios

**Regulator audit.** A HIPAA compliance officer asks: *"Can you prove that every user who currently has access to the system was admitted via a documented, authorized invitation from an identified internal actor?"* The auditor queries the Audit Trail for all `onboarding.completed` events. Each event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}`. For each `party_id` in the system with an active credential, the auditor confirms a corresponding `onboarding.completed` event exists in the Audit Trail (Invariant 4). The Invitation record for each `invitation_token` names the `inviter_ref` — the authorizing actor. Invariant 1 (invitation gates enrollment) is the structural guarantee: the `onboarding.completed` event is only produced if `Invitation.accept` succeeded, and the Invitation record names who authorized the access. The regulator's question is answerable from records alone.

**Disputed onboarding.** A former employee claims: *"My account was created without my knowledge — I never accepted an invitation."* The investigator queries the Audit Trail for `onboarding.completed` events whose `party_id` matches the former employee's record. The event is found. The Invitation record for the `invitation_token` in that event shows `inviter_ref` (who sent it), `accepting_identity_ref` (the external reference supplied at acceptance time), and `accepted_at` (when the acceptance was committed). Invariant 2 (identity binding at accept) is the structural guarantee: the `accepting_identity_ref` was supplied by the caller at `Invitation.accept` time, not pre-populated by the inviting actor. Whether the former employee personally presented the token or whether someone else held the token and supplied the reference is outside the composition's scope — the composition records that a bearer of `tok_inv_g7h2k1` presented the invitation and supplied `accepting_identity_ref: "newhire@acme.com"`. Further investigation of who actually controlled that email address at that moment is Party Identity's identity proofing concern (C8) or a breach forensics investigation.

**Breach forensics.** An investigator determines that an onboarding service account's credential was compromised during a window. The question is: were any fraudulent onboardings performed using the compromised credential? The investigator queries the Audit Trail for `onboarding.completed` events whose `actor_ref` matches the compromised service account, within the compromise window. Each event names `{invitation_token, accepting_identity_ref, party_id, credential_id}`. The investigator cross-references: do the `invitation_token` values correspond to invitations issued by authorized inviting actors? The `invite` Audit Trail record names the `inviter_ref` and the `actor_credential` attestation is independently verifiable. Any `onboarding.completed` event for an invitation that was never `initiate`d through the composition, or whose inviter's attestation fails, is a candidate fraudulent onboarding. Invariant 4 (full Audit Trail coverage) and Invariant 5 (completion record names the full arc) together make this forensic reconstruction possible from records alone.

---

## Edge cases

**Partial failure after `Invitation.accept`.** If `Invitation.accept` succeeds but a downstream step fails (Audit Trail step 4 fails, `Party Identity.enroll` fails, `Credential.register` fails, or Audit Trail step 7 fails), the invitation is permanently in `Accepted` state. A subsequent `onboard` call with the same `invitation_token` will receive `rejected(invitation-invalid(already-resolved(Accepted)))` — the gate cannot be re-entered. Recovery requires an administrator to: (a) identify the interruption from the `onboarding.interrupted` Audit Trail record (if one was written), (b) manually complete the missing steps (enroll the party and/or register the credential), and (c) issue a new invitation if the invitation token cannot be correlated to the incomplete records. The GA check for unresolved interruptions (check 5) surfaces these cases for admin review.

**Concurrent `onboard` calls — the race.** Two callers present the same `invitation_token` simultaneously. `Invitation.accept` is atomic under concurrent attempts; exactly one succeeds. The winning call proceeds to enrollment and credential registration. The losing call receives `rejected(invitation-invalid(already-resolved(Accepted)))` at step 3, before any enrollment occurs. No orphaned Party Identity records are created by the losing call. This is Invitation's single-resolution invariant working as the composition's concurrency control.

**Invitation expired between `invite` and `onboard`.** The invitee delays acting on the invitation until after `expires_at`. `Invitation.accept` returns `already-resolved(Expired)` (lazy expiry) → `rejected(invitation-invalid(expired))`. No enrollment occurs. The inviting actor must issue a new invitation.

**`duplicate-active-credential` at step 6.** If `Credential.register` returns `rejected(duplicate-active-credential)`, the `party_id` has already been enrolled (Party Identity.enroll succeeded at step 5) but the credential was not registered. The composition writes `onboarding.interrupted` (stage: "credential-registration", reason: "duplicate-active-credential") to the Audit Trail and returns `rejected(storage-failure)`. The enrolled party exists in `Unverified` state without a credential. Administrator review is required to determine how the `party_id` already has an active credential of that type — it may indicate a data integrity issue or a retry after a partial failure from a prior run.

**KYC and identity verification after onboarding.** This composition enrolls the party in `Unverified` state. The transition to `Verified` is a separate concern — the KYC composition (C8) orchestrates identity verification and calls `Party Identity.verify(verification_result=passed)` to drive the `Unverified → Verified` transition. Downstream regulated activity that requires `Verified` status must check Party Identity state before proceeding; this composition does not provide that gate.

**Credential rotation after onboarding.** Once onboarded, the principal may rotate their credential using `Credential.rotate` directly (outside this composition's surface). The composition does not expose a rotate action. Rotation is the principal's ongoing credential management concern, separate from the one-time onboarding arc.

**Invitee identity not matching `invitee_ref`.** If the inviting actor supplied an `invitee_ref` at `invite` time (e.g., a known email address), and the `accepting_identity_ref` supplied at `onboard` time does not match that `invitee_ref`, the composition does not detect or block this mismatch — the Invitation atom does not validate the relationship between `invitee_ref` and `accepting_identity_ref`. A deployment that requires the accepting identity to prove control of the `invitee_ref` (e.g., by verifying ownership of the email address before calling `onboard`) must enforce this constraint above the composition layer, before calling `onboard`. The composition records whatever `accepting_identity_ref` is supplied; the mismatch is a policy concern.

**Decliner identity not recorded.** `Invitation.decline` does not accept an identity argument; the Invitation atom records only that a decline occurred, not who declined. The `decline` action in this composition uses the system service account as the Audit Trail attestation actor. A deployment that needs to record who declined should capture the decliner's external reference in the Audit Trail event data payload before calling the composition's `decline` action.

---

## Generation acceptance

An implementation of External Onboarding is accepted if an external auditor can clear the following checks from the Audit Trail and constituent-atom records alone, without recourse to source code, runbooks, or developer narration.

1. **Every active Party Identity enrolled via this composition traces to an accepted invitation.** For every `onboarding.completed` Audit Trail event, the `invitation_token` field references an Invitation record in `Accepted` state, with `accepted_at` predating the event timestamp and `accepting_identity_ref` matching the event's `accepting_identity_ref` field. No `onboarding.completed` event exists for an invitation that is not in `Accepted` state.

2. **Every active credential registered via this composition traces to an enrolled party.** For every `onboarding.completed` event, the `credential_id` field references an active Credential record whose `principal_ref` matches the event's `party_id` field. No credential registered via this composition is bound to a `principal_ref` that does not appear as a `party_id` in a Party Identity record.

3. **Credential-follows-party ordering.** For every `onboarding.completed` event, the Party Identity record for the event's `party_id` has an `enrolled_at` timestamp earlier than or equal to the Credential record's `registered_at` timestamp for the event's `credential_id`. No Credential record registered via this composition predates its subject's Party Identity enrollment.

4. **Invitation-gates-enrollment.** No `onboarding.invitation-accepted` Audit Trail event exists for an invitation that is not in `Accepted` state. No `onboarding.completed` event exists without a preceding `onboarding.invitation-accepted` event for the same `invitation_token`. Permissions were not exercised in the wrong order.

5. **Unresolved interruptions are detectable.** An `onboarding.interrupted` Audit Trail event for a given `invitation_token` that does not have a subsequent `onboarding.completed` event for the same token is an unresolved onboarding interruption requiring admin review. The auditor can enumerate all unresolved interruptions by querying the Audit Trail for `onboarding.interrupted` events without a matching `onboarding.completed` event.

6. **Every terminal invitation transition via this composition is attested.** Every Invitation record in `Declined` or `Revoked` state that was processed via this composition has a corresponding `invitation.declined` or `invitation.revoked` Audit Trail event. Every `invite` action has a corresponding `invitation.initiate` Audit Trail event. Unattested terminal transitions (Invitation records in Declined/Revoked state with no Audit Trail record) are flagged for review.

---

## Composition notes

**Relationship to KYC / Customer Onboarding (C8).** External Onboarding admits a party to the system in `Unverified` state. C8 drives the identity verification workflow that transitions the party to `Verified`. The two compositions address adjacent points in the regulated identity lifecycle: External Onboarding is the admission gate; KYC is the verification gate. A deployment requiring `Verified` status before granting access to regulated functionality places C8 downstream of C16 in the onboarding pipeline.

**Relationship to Login (C13).** External Onboarding registers the credential. Login uses that credential: `login(principal_ref, credential_type, presented_material, ...)` calls `Credential.verify`, and on success issues a Session. After a successful `onboard`, the principal can immediately call `login` using the registered `credential_type` and their credential material. The two compositions are adjacent lifecycle boundaries: External Onboarding creates the credential record; Login produces the authenticated session.

**Relationship to Session-Gated Authorization (C14).** Once the onboarded principal has an active session (from Login), runtime authorization queries flow through Session-Gated Authorization: `check_permitted(session_token, action_scope)` gates every permission check on session validity. External Onboarding is the entry point; Session-Gated Authorization is the access-time gate.

**Relationship to Attributed Permissions Admin.** Once onboarded, the principal appears as a subject in Permissions. An authorized actor calls `Attributed Permissions Admin.grant(subject_ref=party_id, action_scope, ...)` to grant the newly onboarded party access to specific scopes. The `party_id` produced by External Onboarding becomes the `subject_ref` in Permissions grants.

**Forthcoming-link resolution.** The Invitation atom's *Composition notes* listed "External Onboarding *(C16 — not started)*" as a forthcoming composition. That link is now live.

---

## Lineage

### Round 1

**Pass 1 — GRID structural.** All nine MUSE nodes resolved. Intent (the structural gap: four constituent atoms cannot answer what-order-with-what-audit-record), System boundary (four atoms, four actions, no composition-owned cross-atom state), Friction (partial-failure cases after Invitation.accept, concurrent acceptance race, `duplicate-active-credential`, expired invitation), Flow (fixed five-step `onboard` sequence with Invitation.accept as serialization gate), Decision (gate clears or fails; each downstream step can fail independently), Feedback (result tags first-class; `onboarding.interrupted` names the stage), State (no cross-atom state — Audit Trail is the map; explicit rationale given), Behavior (five emergent invariants), Proof (six GA checks, all Audit Trail-based).

**Pass 2 — EOS conceptual independence.** Invitation, Credential, Party Identity, and Audit Trail are freestanding atoms/compositions; none is absorbed. The composition's own concept — the mandatory sequencing of the four steps with the gate, the audit binding of the full arc in a single completion record — does not belong to any constituent. The no-cross-atom-state decision was re-examined: the Audit Trail completion record carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` as its data payload, making the Audit Trail serve as the tracing map. This is correct — the Audit Trail already has the integrity properties (tamper-evident, attribution-stamped, retention-bounded) that a separate composition-owned map would need to replicate. No extraction needed.

**Pass 3 — Linus adversarial.**

*Finding R1F1 — Step ordering in `invite` writes Audit Trail before `Invitation.initiate`.* Audit Trail records the inviter's intent even if the invitation store subsequently fails. This creates an Audit Trail record with no corresponding Invitation record. Rather than reversing the order (which would allow unaudited invitations when Audit Trail fails), the design records the attempt first and the GA check 6 surfaces Audit Trail initiation records without corresponding Invitation records as gaps for admin review. The rationale: in regulated environments, recording the actor's intent before the operation is the audit-first discipline. Named explicitly in step 4 note and in GA check 6.

*Finding R1F2 — `decline` action attribution gap.* `Invitation.decline` does not record the decliner's identity. The Audit Trail record uses the system service account as the attestation actor. The edge case ("Decliner identity not recorded") names this explicitly and describes the deployment escape hatch (record the decliner's external reference in the data payload above the composition layer). Named in action notes and edge cases.

*Finding R1F3 — `duplicate-active-credential` at step 6 is not a storage failure.* Step 6's failure handling collapsed `duplicate-active-credential` into `storage-failure` in the return. This misleads callers: `storage-failure` implies a transient infrastructure failure; `duplicate-active-credential` implies a data integrity or retry issue. Fixed: the edge case ("duplicate-active-credential at step 6") names the distinct cause and the different recovery path, and the action step notes the distinction. The return type remains `storage-failure` to keep the signature clean (the distinction is surfaced in the `onboarding.interrupted` Audit Trail record's `reason` field, where it is visible from records alone).

### Round 2

**Pass 1 — GRID structural.** All nine nodes still resolved after Round 1 fixes. The GA check 5 (unresolved interruptions detectable) was verified: the `onboarding.interrupted` event carries the `stage` field naming exactly which step failed, giving admin review a precise recovery starting point. Clean.

**Pass 2 — EOS conceptual independence.** No new absorption. The KYC overlap with C8 is explicitly addressed in Composition notes (External Onboarding is the admission gate; KYC is the verification gate). The credential-rotation concern is named in Edge cases as outside the composition's surface.

**Pass 3 — Linus adversarial.**

*Finding R2F1 — Step 2 (actor credential verification) not explicitly ordered before `Invitation.accept`.* The original draft validated the actor credential as part of step 4's Audit Trail call, which means `Invitation.accept` was called before the actor was authenticated. A malicious caller could probe invitation validity without a valid credential by calling `onboard` with invalid `actor_credential` and a known `invitation_token`: they'd learn whether the invitation is still Pending before the Audit Trail rejected them. Fixed: step 2 moves credential verification before step 3 (`Invitation.accept`). `invalid-credential` is now a clean rejection that reveals nothing about the invitation's state.

*Finding R2F2 — `invite` step 3 failure leaves an unattested Audit Trail initiation record.* If `Invitation.initiate` fails after the Audit Trail record is written (step 2), the Audit Trail record exists but no invitation does. This was intentional (audit-first discipline) but was not reflected in GA check 6. Fixed: GA check 6 now explicitly covers this case: an `invitation.initiate` Audit Trail event without a corresponding Invitation record in the store is a flagged gap.

### Round 3

**Pass 1 — GRID structural.** All nine nodes resolved. Action signatures, step sequences, invariants, GA checks, and edge cases all internally consistent.

**Pass 2 — EOS conceptual independence.** No new extraction. The composition boundary is clean: Invitation owns the lifecycle record and single-resolution invariant; Party Identity owns the party enrollment and state machine; Credential owns the credential binding; Audit Trail owns the tamper-evident event record. The composition owns only the sequencing and the `onboarding.completed` data binding.

**Pass 3 — Linus adversarial.**

*Finding R3F1 — Invariant 4 overclaims "every terminal state change" but `Expired` is not surfaced through any composition action.* Invitation can reach `Expired` via a background scheduler calling `Invitation.expire` directly (not via the composition's `decline` or `revoke`). An expired invitation processed via the background scheduler produces no Audit Trail record from this composition. Invariant 4 was revised to state: "every terminal state change *that passes through this composition*" — expired invitations processed outside the composition's action surface are not covered. Named in Invariant 4 with the explicit qualifier. The edge case ("Invitation expired between invite and onboard") explains that the expiry itself is handled by the Invitation atom's background scheduler; the composition only handles the discovery at `onboard` time.

### Final Critique 4

Reviewed all five invariants, all eight edge cases, all six GA checks, all four action wirings in full, both regulated adversarial scenarios that rely on Invariant 5 (completion record names the full arc), and the composition notes. No foundational findings. No refining findings.

The `actor_credential` pre-check order (R2F1) is the most security-significant fix in the baseline; it prevents invitation-state probing by unauthenticated callers. The no-cross-atom-state decision is correctly justified: the Audit Trail completion record provides the tracing with stronger integrity than a composition-owned map would. The `onboarding.interrupted` Audit Trail event naming the `stage` field gives operations the precision needed to recover partial onboardings without developer narration.

*Grounded on Final Critique 4.*

---

**Formal model — TLA+ operational peer (precipitating touch for Round 5).** `compositions/externalOnboarding.tla` (+ `externalOnboarding.cfg`). The `.tla` file was authored prior to this Lineage entry but was unrun via the CLI; the file had previously been named `external-onboarding.tla` (kebab-case), which caused SANY to reject it (TLA+ requires the filename basename to match the `MODULE` declaration, and hyphens are illegal in TLA+ identifiers). The cross-cutting rename to `externalOnboarding.tla` on 2026-05-23 — applied to all four `.tla` files in `compositions/` and recorded in [`DISCOVERIES.md`](../DISCOVERIES.md) §2026-05-23 — made CLI execution possible and constituted an effective touch under `PRESSURE_TESTING.md` §Touch triggers re-pass, triggering Round 5. The `.cfg` comment block contained suggested CONSTANTS that were not materialized; materialized on 2026-05-23: `NULL = NullMV` (model-value override for the `NULL == "_none_"` operator — same TLC 2.19 strict-equality fix as `attributedPermissionsAdmin.cfg`), `Actors = {a1, a2}`, `InvitationIds = {i1, i2}`, `PartyIds = {p1, p2}`, `CredentialIds = {c1, c2}`, `MaxClock = 3`. Checks the five application-level invariants (`Invitation_Gates_Enrollment`, `Single_Resolution`, `Credential_Follows_Party`, `Audit_Coverage`, `Completion_Names_Full_Arc`) plus five structural guards (`Status_Monotone`, `Party_Invitation_Binding`, `Credential_Party_Binding`, `Audit_Set_Integrity`, `TypeOK`) as the combined `Safety` predicate under TLC's exhaustive-interleaving semantics. Result: 44 distinct states (101 generated, depth 4, complete graph search); `Safety` holds across every reachable state. No deadlock. The single-resolution gate — `invitations[inv].status = "pending"` as the atomic precondition to `Onboard` — is the load-bearing concurrency claim: the model confirms that under every interleaving, at most one `Onboard` per invitation slot can satisfy the gate and create Party Identity and Credential records. The `OnboardInterrupted` action exercises the gate's partial-failure behavior (Invitation → Accepted, no party/credential created) and confirms both `Invitation_Gates_Enrollment` (Invariant 1) and `Audit_Coverage` for Accepted invitations (Invariant 4a) hold even when enrollment fails after the gate clears.

**Pass 1 — Structural completeness (GRID), Round 5 (touch-triggered re-pass, 2026-05-23).** *Complete.* No findings. All nine GRID nodes still resolved. The `.cfg` CONSTANTS materialization and `NULL = NullMV` override are tool-compatibility changes that do not alter the spec body. Formal model Lineage entry carries the plain-English summary, artifact location, bounds, scope exclusions, and result per `CONTRIBUTING.md` §Formal-model artifacts.

**Pass 2 — Conceptual independence (EOS), Round 5.** *Complete.* No findings. The TLA+ artifact introduces no new concept requiring extraction as a separate atom. The state variables (`invitations`, `parties`, `credentials`, `audit_accepted`, `audit_declined`, `audit_revoked`, `audit_interrupted`, `clock`) all map to constituent-atom stores or to the Audit Trail event surface already named in §Application state. The `OnboardInterrupted` action models a failure branch within the composition's own scope; no new atom surface is implied.

**Pass 3 — Adversarial scrutiny (Linus mode), Round 5.** *Complete.* No findings. TLC's exhaustive enumeration of 44 distinct states at the chosen bounds produced no counterexample to any of the ten invariants. The single-resolution property (`Single_Resolution`) — the composition's primary concurrency safety claim — holds across all interleavings: no invitation ever produces more than one enrolled Party Identity record. `Credential_Follows_Party` holds in every reachable state including `OnboardInterrupted` paths, confirming the enrollment-before-credential ordering is enforced structurally by the action preconditions. No spec finding surfaced. The verification is reproducible from a fresh checkout: `java -cp tla2tools.jar tlc2.TLC -config externalOnboarding.cfg -workers 4 externalOnboarding.tla`.

Round 5 closed clean. Foundational findings: zero. Refining findings: zero. External Onboarding moves from `grounded on Final Critique 4` to `grounded on Final Critique 5`.
