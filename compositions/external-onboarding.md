---
title: External Onboarding
parent: Conceptual Compositions
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


## Summary

External Onboarding is the full arc of admitting an external entity to a system — invitation issued by an authorized actor, accepted by the invitee (establishing the single identity binding), Party Identity enrolled in Unverified state, credential registered, every step attested in the Audit Trail.

The load-bearing emergent invariant is invitation-gates-enrollment: no Party Identity is created via this composition unless an Invitation's Accepted transition precedes it, and the Audit Trail completion record names the specific invitation, the accepting identity, the party record, and the credential in one tamper-evident entry.

Without the composition, any of these steps can occur independently, in any order, without a documented chain; the composition is what makes the chain mandatory and auditable.

**Composes:** [Invitation](../atoms/invitation.md) · [Credential](../atoms/credential.md) · [Party Identity](../atoms/party-identity.md) · [Audit Trail](./audit-trail.md)

---

## Intent

Every system that admits external parties — customers, collaborators, patients, counterparties — faces the same structural challenge: the invitation must be issued before the invitee exists in the system, yet the moment of acceptance is the moment at which the system must durably record who joined, establish their identity record, and register the credential they will use to authenticate. Those three obligations — serializing concurrent acceptance attempts, creating the party record, registering the credential — belong to different atoms. The question of what must happen when they meet, in what order, with what audit record binding the whole arc together, belongs to no single atom. It belongs to the composition.

External Onboarding wires the four constituent atoms into a single enforced onboarding boundary. The [Invite] action establishes the documented intent: an authorized actor initiates an invitation, creating an audit-anchored record of who invited whom and to what context. The [Onboard] action is the composition's load-bearing center: it calls `Invitation.accept` first — establishing the single-resolution serialization point — then `Party Identity.enroll`, then `Credential.register`, recording the full arc in the Audit Trail as a single named event that links invitation token, accepting identity reference, party record, and credential. The [Decline] and [Revoke] actions close the invitation on the other terminal paths, each attested in the Audit Trail.

The emergent invariant is invitation-gates-enrollment: no Party Identity is enrolled and no Credential registered via this composition unless an Invitation's `Accepted` transition precedes them in the same onboarding call. The Invitation atom's single-resolution invariant (at most one write to one of three stored terminal states per invitation — a lapsed invitation is shown `Expired` by derivation, never written — the transition atomic under concurrent attempts) is the mechanism that makes the gate hold under concurrent onboarding attempts for the same invitation — exactly one [Onboard] call succeeds; all others receive `already-resolved(Accepted)` and create no permanent records.

The second emergent property is the identity binding at accept, not at initiate. The `accepting_identity_ref` passed to `Invitation.accept` — a caller-supplied external reference identifying who is accepting, such as an email address or an external identity handle — is recorded permanently in the Invitation record at the moment of acceptance. The `party_id` produced by the downstream `Party Identity.enroll` call is then linked to that `accepting_identity_ref` in the Audit Trail completion record. The tracing path — from any enrolled Party Identity back to the specific Invitation that authorized its creation — runs through the Audit Trail: the completion event carries both the `invitation_token` and the `party_id`, making the chain reconstructable from records alone.

---

## Composes

- **[Invitation](../atoms/invitation.md)** — the lifecycle record of an invitation from `Pending` through **one write to one of three stored terminal states** (`Accepted`, `Declined`, `Revoked`); a lapsed invitation is *shown* `Expired` by the atom's read-time derivation, never written (its Invariant 12 — there is no `expire` action, no `expired_at` field, and no stored `Expired`), and a write attempted on a lapsed invitation is rejected with the distinct `expired` token, never `already-resolved(Expired)` (its Invariant 6). Provides the serialization gate via its single-resolution invariant: `Invitation.accept` is atomic under concurrent attempts; exactly one succeeds. Surface used: `initiate`, `accept`, `decline`, `revoke`. **Instance posture and routing obligation, declared:** the composition maintains **exactly one dedicated Invitation instance**, and the deployment routes every lifecycle action on that instance — `initiate`, `accept`, `decline`, `revoke` — through this composition's four actions (the substrate's own exactly-one-instance discipline, applied here as a deployment obligation). Direct atom access to the instance, or invitations managed on other instances or through sibling patterns, sit outside this composition's audit claims — this is the membership criterion Generation acceptance's store-quantified checks assume, without which a lawfully-elsewhere invitation would be condemned as a recording failure. (Credential and Party Identity are shared surfaces by design — `Credential.rotate` and downstream verification run outside this composition — and no check quantifies over their stores in the store-to-records direction.)
- **[Credential](../atoms/credential.md)** — the durable binding between a principal and authentication material. Registered after Party Identity enrollment so the `principal_ref` is a valid `party_id`. Surface used: `register`.
- **[Party Identity](../atoms/party-identity.md)** — the persistent, verifiable identity record for an external party. Enrolled in `Unverified` state; verification (the transition to `Verified`) is handled downstream by [Customer Onboarding](./customer-onboarding.md) or equivalent. Surface used: `enroll`.
- **[Audit Trail](./audit-trail.md)** — the tamper-evident, attribution-stamped substrate recording every onboarding event. Every action that changes state in any of the three data-bearing atoms is recorded here. Surface used: `record_action`. Event Log, Actor Identity, Retention Window, and Tamper Evidence are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms.

---

## Composition logic

Four actions form the onboarding boundary. Each wraps one or more constituent atom calls and produces an Audit Trail record.

**One gate discipline for all four actions.** Every state-changing action opens with an **attempt record** — an `Audit Trail.record_action` whose Actor Identity attestation, made inside the substrate's own declared surface, *is* the credential gate: an `invalid-credential` there stops the action before any Invitation write, and the attempt itself is auditable. (The substrate exposes no dry-run credential check, and none is needed — the attest is the check. An attempt refused at the gate lands no event; auditing *those* is the **Failed-Attempt Log** *(forthcoming)* pattern's business, as in the substrate's own edge case.) The action's outcome is then recorded by its own post-write event.

**The validation the gate rule rests on, stated once.** Each action's step 1 validates every caller string against the surfaces that will carry it: non-null, non-empty, and non-whitespace; each actor reference within the wired Audit Trail instance's `reference_length_cap` (the substrate's own caller-input rule, adopted at this layer so its `invalid-request` cannot fire on a reference this layer already passed); and the constructed data of every event the action will emit within the instance's payload budget — **sized with the deployment's declared minted-id width bounds**, the maximum widths the wired constituents allocate for `invitation_token`, `party_id`, `credential_id`, and `event_id` (the substrate's own `attestation_id_width` move), so a payload carrying ids that do not exist yet at step 1 is sizable before anything commits. Under this rule the record steps' `invalid-request` arm is genuinely unreachable for validated inputs. **And its observation has one landing, stated once:** a `record_action` `invalid-request` observed after step 1 passed means the declared caps and the wired instance disagree — a deployment fault, never the caller's — surfaced as `rejected(storage-failure)` with a hard alert naming the true cause; every "unreachable per step 1" in the actions below carries exactly this landing.

**[Invite] wiring.** The inviter calls the composition with their actor credentials. The composition records the `invitation.initiate-attempt` gate event, calls `Invitation.initiate`, and, on success, records `invitation.initiated` in the Audit Trail naming the inviter, the invitee reference, and — because this record follows the constituent's success — the invitation token itself, which is what makes the records-alone token correlation in the forensics walk executable. The invitation token is returned so the inviter can deliver it to the invitee out-of-band (email link, QR (Quick Response) code, direct message).

**[Onboard] wiring — the load-bearing center.** The step order is fixed and non-negotiable:

1. Audit Trail record: `onboarding.accept-attempt` — the credential gate (the discipline above). An `invalid-credential` stops the call before any Invitation write.
2. `Invitation.accept(invitation_token, accepting_identity_ref)` — the serialization gate. If the gate refuses — the invitation was already resolved by a write (`already-resolved(Accepted | Declined | Revoked)`), its window has lapsed (the atom's derived-expiry `expired` rejection — the record stays `Pending` and reads `Expired` by projection, nothing written), or it is unknown — the entire call fails before any enrollment record is created. No Party Identity is enrolled; no Credential is registered; no identity is bound. The call returns `invitation-invalid(reason)`.
3. Audit Trail record: [Onboarding Invitation Accepted] — records the gate clearing: `{invitation_token, accepting_identity_ref}`.
4. `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id`. The party is created in `Unverified` state. If this fails (the atom's `invalid-request` or `storage-failure`), the composition writes `onboarding.interrupted` to the Audit Trail and relays the atom's rejection. The invitation is permanently Accepted; recovery requires admin intervention (see Edge cases).
5. `Credential.register(principal_ref: party_id, credential_material, credential_type, expires_at?)` → `credential_id`. The credential is bound to `party_id`. If this fails, the composition writes [Onboarding Interrupted] to the Audit Trail (naming the enrolled `party_id`) and relays the atom's rejection under its own name. The invitation is Accepted and the party is enrolled; recovery requires admin intervention.
6. Audit Trail record: [Onboarding Completed] — records the full arc: `{invitation_token, accepting_identity_ref, party_id, credential_id}`. If this record fails to write, the composition returns `storage-failure`. The enrollment and credential exist; the completion record does not. The Generation-acceptance (GA) check for unrecorded completions detects this gap (see Generation acceptance, check 5).
7. Return `{party_id, credential_id}`.

**[Decline] wiring.** The invitee (or the system on their behalf) presents the invitation token. The composition records the `invitation.decline-attempt` gate event under the system service actor, calls `Invitation.decline`, then records `invitation.declined` in the Audit Trail. `Invitation.decline` does not record the decliner's identity (Invitation atom design); the Audit Trail records the timestamp and that the decline occurred, not who declined. If a deployment requires recording the decliner's identity, that is done in the `data` payload of the Audit Trail event and enforced above the atom layer.

**[Revoke] wiring.** The inviter or an administrator calls [Revoke] with their actor credentials. The composition records the `invitation.revoke-attempt` gate event, calls `Invitation.revoke`, then records `invitation.revoked` in the Audit Trail, attributing the revocation to the revoking actor.

**The step-order constraint is the composition's central contribution.** Neither `Party Identity.enroll` nor `Credential.register` is called unless `Invitation.accept` returns `accepted`. The Audit Trail substrate records both the moment the gate cleared and the subsequent enrollment and credential steps, so the full arc is traceable from records alone.

---

## Composition state

This composition introduces no cross-atom persistent state beyond what the constituent atoms and the Audit Trail substrate maintain — **Contract classification: conforming, no stored composition state** ([`execution-contract.md`](../execution-contract.md) §Composition state). There is no composition-owned index or map.

The tracing from any Party Identity record back to the specific Invitation that authorized its creation runs through the Audit Trail: the `onboarding.completed` event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` in its data payload. An investigator querying "what invitation authorized the creation of party P?" finds the `onboarding.completed` event whose `party_id` field matches P and reads `invitation_token` from the event data. **The retrieval mechanism is named, not assumed:** the substrate's declared query surface is a sequence-range enumeration, not a payload-field lookup, so every payload-keyed retrieval in this spec — here and in Generation acceptance — is an **enumerate-and-filter**: read the trail through the substrate's declared list surface and filter on the event data in the auditor's or composition's own code (the same move the substrate uses for its own rebuilds). A deployment wanting an indexed payload lookup composes the forthcoming **Reverse Index** pattern over the trail; nothing here depends on it.

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
- `ttl` — time-to-live: the invitation validity duration. Null uses the deployment default. Positive if supplied.
- `actor_credential` — the inviter's Actor Identity credential, used to produce the Audit Trail attestation. Verified by the attempt record's attest (the gate discipline) before any invitation is created.

**Steps**

1. Validate inputs per the gate discipline's validation rule (Composition logic): `inviter_ref`, `context`, and (if supplied) `ttl` well-formed, references within the instance's `reference_length_cap`, and the constructed event data of both records below — the step-4 payload sized with the declared `invitation_token` width bound — within the payload budget. Any violation → `rejected(invalid-request)`. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.initiate-attempt", actor_ref=inviter_ref, credential=actor_credential, data={invitee_ref, context, ttl})` → `event_id | rejected(invalid-request | invalid-credential | recording-failure)` — the credential gate.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop.
   - `recording-failure` → `rejected(storage-failure)`. Stop.
   - `invalid-request` → unreachable per step 1 (the gate discipline's stated landing applies if observed).
3. Call `Invitation.initiate(inviter_ref, invitee_ref, context, ttl)` → `invitation_token | rejected(invalid-request | storage-failure)`.
   - `invalid-request` → `rejected(invalid-request)`. Stop. (The attempt record in step 2 stands as the record of the try.)
   - `storage-failure` → `rejected(storage-failure)`. Stop.
4. Call `Audit Trail.record_action(action_ref="invitation.initiated", actor_ref=inviter_ref, credential=actor_credential, data={invitation_token, invitee_ref, context, ttl})` → the post-success record, carrying the token — the records-alone correlation surface the forensics scenarios walk.
   - `recording-failure` → `rejected(storage-failure)`. The invitation exists in `Pending` but its `invitation.initiated` record is absent **and the token was not returned**: no one holds the bearer token, so the invitation can never be accepted and lapses harmlessly at its `expires_at`; the inviter retries with a fresh [Invite]. The gap is GA check 6's invitation-without-`invitation.initiated`-event signature.
   - `invalid-credential` → a rotation race (the same credential attested at step 2 moments earlier); same landing and same detectable gap as `recording-failure`, returned as `rejected(invalid-credential)` so the caller learns the true cause.
5. Return `invitation_token`.

**Note on step ordering.** The attempt record (step 2) is written before `Invitation.initiate` — it authenticates the inviter and records the intent even if the invitation store fails; the `invitation.initiated` record (step 4) follows the constituent's success, which is the only point the token exists to be recorded. An `invitation.initiate-attempt` event without a following `invitation.initiated` marks a failed or interrupted initiate (not correlatable to a token, by construction — no token was minted); an Invitation record without its `invitation.initiated` event marks a post-initiate recording failure or crash. GA check 6 enumerates the second signature.

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
    | duplicate-active-credential
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

1. Validate inputs per the gate discipline's validation rule (Composition logic): required fields present and well-formed, references within the instance's `reference_length_cap`, and every event payload this action will emit — the completion record sized with the declared `party_id` and `credential_id` width bounds — within the payload budget. Any violation → `rejected(invalid-request)`. Stop.
2. Call `Audit Trail.record_action(action_ref="onboarding.accept-attempt", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref})` → the credential gate (the discipline in Composition logic): the attest inside the substrate's own declared surface is the verification — no dry-run mode exists, and none is needed.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop. (No invitation is accepted, no constituent record is created; the refused attempt lands no event — Failed-Attempt Log territory.)
   - `recording-failure` → `rejected(storage-failure)`. Stop.
   - `invalid-request` → unreachable per step 1; a deployment fault if observed.
3. Call `Invitation.accept(invitation_token, accepting_identity_ref)` → `accepted | rejected(invalid-request | expired | already-resolved(state) | not-known | storage-failure)`.
   - `rejected(expired)` → `rejected(invitation-invalid(expired))`. Stop. The atom's derived-expiry rejection: the record is still stored `Pending`, reads `Expired` by projection, and nothing was written.
   - `rejected(already-resolved(Accepted))` → `rejected(invitation-invalid(already-resolved(Accepted)))`. Stop.
   - `rejected(already-resolved(Declined))` → `rejected(invitation-invalid(already-resolved(Declined)))`. Stop.
   - `rejected(already-resolved(Revoked))` → `rejected(invitation-invalid(already-resolved(Revoked)))`. Stop.
   - `rejected(not-known)` → `rejected(invitation-invalid(not-known))`. Stop.
   - `rejected(invalid-request)` → `rejected(invalid-request)`. Stop. (Step 1's validation makes this unreachable for well-formed inputs; the atom's own guard is the backstop.)
   - `rejected(storage-failure)` → `rejected(storage-failure)`. Stop.
   - In all rejection cases: no permanent records are created beyond the step-2 attempt event, which stands as the record of the try.
4. Call `Audit Trail.record_action(action_ref="onboarding.invitation-accepted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref})` → `event_id | rejected(invalid-request | invalid-credential | recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. Stop. The invitation is Accepted but no acceptance record exists. This gap is detectable: any Invitation in stored `Accepted` state without a corresponding `onboarding.invitation-accepted` Audit Trail event is an unresolved interruption (GA check 5's first signature).
   - `invalid-credential` → a rotation race over a committed acceptance (the same credential attested at step 2); `rejected(invalid-credential)`, same detectable gap.
   - `invalid-request` → unreachable per step 1.
5. Call `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id | rejected(invalid-request | storage-failure)`.
   - `invalid-request` → write `Audit Trail.record_action(action_ref="onboarding.interrupted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, stage: "party-enrollment", reason: "invalid-request"})`, then `rejected(invalid-request)`. Stop.
   - `storage-failure` → write the `onboarding.interrupted` record (same full signature; stage: "party-enrollment"), then `rejected(storage-failure)`. Stop.
   - If the `onboarding.interrupted` record itself fails to land, the composition still returns the original rejection; the resulting gap — an `onboarding.invitation-accepted` with no subsequent `completed` *or* `interrupted` — is GA check 5's second signature.
6. Call `Credential.register(principal_ref=party_id, credential_material, credential_type, expires_at?)` → `credential_id | rejected(invalid-request | duplicate-active-credential | storage-failure)`.
   - Each arm → write `Audit Trail.record_action(action_ref="onboarding.interrupted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, party_id, stage: "credential-registration", reason: <the atom's rejection>})`, then **relay the atom's rejection under its own name** — `rejected(invalid-request)`, `rejected(duplicate-active-credential)`, or `rejected(storage-failure)` — a caller fault, a state conflict, and an infrastructure fault are three different things and are not collapsed. Stop. The failed-interrupted-write rule of step 5 applies here too.
7. Call `Audit Trail.record_action(action_ref="onboarding.completed", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, party_id, credential_id})` → `event_id | rejected(invalid-request | invalid-credential | recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. Stop. The party is enrolled and the credential is registered, but the completion record is absent — GA check 5's second signature detects it.
   - `invalid-credential` → the rotation race again; `rejected(invalid-credential)`, same gap.
   - `invalid-request` → unreachable per step 1.
8. Return `{party_id, credential_id}`.

---

### decline

Records an invitee's deliberate refusal of an invitation and attests the event in the Audit Trail.

```
decline(invitation_token, service_actor_ref, actor_credential) →
    declined
  | rejected(invalid-request | invalid-credential | invitation-invalid(already-resolved(state) | not-known | expired) | storage-failure)
```

**Arguments**

- `invitation_token` — the bearer token identifying the invitation to decline.
- `service_actor_ref` — the system service account used as the Audit Trail attribution actor. `Invitation.decline` does not record the decliner's identity; the Audit Trail records the event against the service account. Deployments that require the decliner's identity to be recorded supply it in the Audit Trail event data payload above the composition layer.
- `actor_credential` — the service account's Actor Identity credential.

**Steps**

1. Validate inputs per the gate discipline's validation rule (references within the `reference_length_cap`; constructed event data within the payload budget) → `rejected(invalid-request)` if invalid. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.decline-attempt", actor_ref=service_actor_ref, credential=actor_credential, data={invitation_token})` — the credential gate.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop, nothing written. (This is the arm the signature declares; the gate is what produces it.)
   - `recording-failure` → `rejected(storage-failure)`. Stop.
   - `invalid-request` → unreachable per step 1.
3. Call `Invitation.decline(invitation_token)` → `declined | rejected(expired | already-resolved(state) | not-known | storage-failure)`.
   - `expired` → `rejected(invitation-invalid(expired))`. Stop. The atom's derived-expiry rejection — the record stays `Pending`, reads `Expired` by projection, and a lapsed invitation needs no decline.
   - `already-resolved(state)` → `rejected(invitation-invalid(already-resolved(state)))`. Stop.
   - `not-known` → `rejected(invitation-invalid(not-known))`. Stop.
   - `storage-failure` → `rejected(storage-failure)`. Stop.
4. Call `Audit Trail.record_action(action_ref="invitation.declined", actor_ref=service_actor_ref, credential=actor_credential, data={invitation_token})` → `event_id | rejected(invalid-request | invalid-credential | recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. (The invitation is Declined but the record is absent. GA check 6 detects unattested terminal transitions.)
   - `invalid-credential` → a rotation race over the committed decline (the same credential attested at step 2 moments earlier); `rejected(invalid-credential)`, the same check-6 gap.
   - `invalid-request` → unreachable per step 1.
5. Return `declined`.

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
  | rejected(invalid-request | invalid-credential | invitation-invalid(already-resolved(state) | not-known | expired) | storage-failure)
```

**Steps**

1. Validate inputs per the gate discipline's validation rule → `rejected(invalid-request)` if `revoked_by_ref`, `reason`, or `actor_credential` is absent or malformed, a reference exceeds the `reference_length_cap`, or the constructed event data exceeds the payload budget. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.revoke-attempt", actor_ref=revoked_by_ref, credential=actor_credential, data={invitation_token, reason})` — the credential gate.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop, nothing written.
   - `recording-failure` → `rejected(storage-failure)`. Stop.
   - `invalid-request` → unreachable per step 1.
3. Call `Invitation.revoke(invitation_token, revoked_by_ref, reason)` → `revoked | rejected(invalid-request | expired | already-resolved(state) | not-known | storage-failure)`.
   - `expired` → `rejected(invitation-invalid(expired))`. Stop. A lapsed invitation already reads `Expired` by the atom's projection and needs no withdrawal; nothing is written.
   - `already-resolved(state)` → `rejected(invitation-invalid(already-resolved(state)))`. Stop.
   - `not-known` → `rejected(invitation-invalid(not-known))`. Stop.
   - `invalid-request` → `rejected(invalid-request)`. Stop. (Step 1 forecloses it for well-formed inputs; the atom's guard is the backstop.)
   - `storage-failure` → `rejected(storage-failure)`. Stop.
4. Call `Audit Trail.record_action(action_ref="invitation.revoked", actor_ref=revoked_by_ref, credential=actor_credential, data={invitation_token, reason})` → `event_id | rejected(invalid-request | invalid-credential | recording-failure)`.
   - `recording-failure` → `rejected(storage-failure)`. (Invitation is Revoked but unattested. GA check 6 detects this gap.)
   - `invalid-credential` → the rotation race over the committed revocation; `rejected(invalid-credential)`, the same check-6 gap.
   - `invalid-request` → unreachable per step 1.
5. Return `revoked`.

---

## Composition-level invariants

**Invariant 1 — Invitation gates enrollment.** No `Party Identity.enroll` call is made via the [Onboard] action unless `Invitation.accept` returns `accepted` for the same `invitation_token` in the same call. No Party Identity is enrolled and no Credential registered via this composition without a preceding successful invitation acceptance.

**Invariant 2 — Identity binding at accept, not at initiate.** The `accepting_identity_ref` that permanently identifies who accepted the invitation is supplied at `Invitation.accept` call time, not at `Invitation.initiate` time. The inviting actor makes no binding commitment about the invitee's identity at initiation; the identity binding is the invitee's act at acceptance time.

**Invariant 3 — Credential-follows-party.** `Credential.register` is called only after `Party Identity.enroll` succeeds, and `principal_ref` in the credential is always the `party_id` produced by the enrollment in the same [Onboard] call. A credential registered via this composition always has a corresponding Party Identity record as its subject.

**Invariant 4 — Audit coverage as safety plus detectability.** Every terminal state change in the Invitation lifecycle that passes through this composition — `Accepted`, `Declined`, `Revoked` — either has its corresponding Audit Trail event, or is detectable as a **named gap signature** from the records alone: a stored-`Accepted` invitation without its `onboarding.invitation-accepted` event; an `onboarding.invitation-accepted` without a subsequent `onboarding.completed` or `onboarding.interrupted` for the same token; a `Declined` or `Revoked` invitation without its event; an Invitation record without its `invitation.initiated` event. GA checks 5 and 6 enumerate exactly these signatures — the claim is not that a recording step cannot fail (each action's arms admit it), but that no terminal transition through this composition is *silently* invisible: the absent record is itself detectable evidence. The claim and its signatures quantify **within the configured retention horizon**: an arc whose events have been lawfully purged reads as destruction (the substrate's Retention Window records in *Purged* state), never as a recording failure — the GA standing rules carry the same bound. The [Onboard] action produces at minimum its `onboarding.accept-attempt` and `onboarding.invitation-accepted` records and, on success, an `onboarding.completed` record; on partial failure, an `onboarding.interrupted` record names the stage at which the sequence stopped, where that record itself could land.

**Invariant 5 — Completion record names the full arc.** The `onboarding.completed` Audit Trail event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` as its data payload. From this single record, an investigator can traverse the full arc: the Invitation record (by `invitation_token`), the Party Identity record (by `party_id`), and the Credential record (by `credential_id`). No correlation index is required — the traversal is a record-by-record lookup keyed by the event's own fields. The traversal claim holds within the configured retention horizon; past it, the purged completion event's payload is lawfully unreadable, and the surviving attestation fields plus the undeletable constituent records are the post-horizon evidence surface.

---

## Standards

*Anchors: GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Articles 6–7 (lawful basis for processing at invitation and acceptance time); HIPAA (US Health Insurance Portability and Accountability Act) §164.312(a)(1) (access control — invitation-based provisioning as a covered access-granting event) + §164.312(d) (person or entity authentication — credential registration at onboarding); SOC 2 (Service Organization Control 2 — an audit standard for service-provider security controls) CC6.2 (prior to issuing system credentials, new internal and external users are registered and authorized); NIST (National Institute of Standards and Technology) SP 800-63A (identity enrollment and identity proofing — the enrollment arc); SCIM 2.0 RFC 7644 (System for Cross-domain Identity Management — the invite-then-provision flow); FATF (Financial Action Task Force — the international anti-money-laundering standard-setter) Recommendations 10–12 (customer due diligence at onboarding — Party Identity in Unverified state is the enrollment record the regulator requires; verification belongs to Customer Onboarding).*

**GDPR Articles 6–7** require a lawful basis for processing personal data. The [Invite] action creates the first processing record: the system holds `invitee_ref` and processes data about the invitee from that moment. The [Onboard] action creates the `accepting_identity_ref` binding and the Party Identity enrollment — the data subject's active engagement with the system. The Audit Trail records both as the GDPR Article 5(2) accountability records.

**SOC 2 CC6.2** requires that prior to issuing system credentials, new users are registered and authorized. The composition satisfies this literally: `Party Identity.enroll` (registration) precedes `Credential.register` (credential issuance), and both are preceded by `Invitation.accept` (authorization by the inviting actor documented in the Audit Trail).

**NIST SP 800-63A** defines the enrollment event at which an applicant registers with an identity system. The [Onboard] action is that enrollment event. The composition does not perform identity proofing (the transition from Unverified to Verified in Party Identity) — that belongs to Customer Onboarding. The composition records the enrollment inputs (`name`, `date_of_birth`, `document_type`, `document_ref`) and the enrolling actor, satisfying 800-63A's enrollment record requirements.

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

Internally: Audit Trail records `invitation.initiate-attempt` (the credential gate clears). Invitation creates the record in `Pending` with `expires_at = now + 7 days`. Audit Trail records `invitation.initiated` carrying `tok_inv_g7h2k1`. The HR system emails the new hire a link embedding the token.

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

Internally: Audit Trail records `onboarding.accept-attempt` (the service account's credential gate clears). `Invitation.accept("tok_inv_g7h2k1", "newhire@acme.com") → accepted`. Audit Trail records `onboarding.invitation-accepted`. `Party Identity.enroll(...)` → `party_4421`. `Credential.register(principal_ref="party_4421", "password", ...)` → `cred_7791`. Audit Trail records `onboarding.completed: {tok_inv_g7h2k1, newhire@acme.com, party_4421, cred_7791}`.

The party is in `Unverified` state. The HR team proceeds to the Customer Onboarding verification workflow to drive the `Party Identity.verify` call that produces the `Verified` transition.

### Concurrent acceptance attempt — second attempt rejected

A second actor (or a duplicate browser tab) attempts to accept the same invitation concurrently:

```
onboard(
  invitation_token:       "tok_inv_g7h2k1",
  accepting_identity_ref: "different@acme.com",
  ...
) → rejected(invitation-invalid(already-resolved(Accepted)))
```

Internally: the `onboarding.accept-attempt` gate event lands (the record of the try), then `Invitation.accept("tok_inv_g7h2k1", "different@acme.com") → rejected(already-resolved(Accepted))`. No Party Identity is enrolled. No Credential is registered. No acceptance, enrollment, or completion record is written — the attempt event is the only trace. The rejection is clean; Invitation's single-resolution invariant handles the race.

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

Any subsequent [Onboard] attempt with `tok_inv_c2d8e3` returns `rejected(invitation-invalid(already-resolved(Revoked)))`.

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

**Disputed onboarding.** A former employee claims: *"My account was created without my knowledge — I never accepted an invitation."* The investigator queries the Audit Trail for `onboarding.completed` events whose `party_id` matches the former employee's record. The event is found. The Invitation record for the `invitation_token` in that event shows `inviter_ref` (who sent it), `accepting_identity_ref` (the external reference supplied at acceptance time), and `accepted_at` (when the acceptance was committed). Invariant 2 (identity binding at accept) is the structural guarantee: the `accepting_identity_ref` was supplied by the caller at `Invitation.accept` time, not pre-populated by the inviting actor. Whether the former employee personally presented the token or whether someone else held the token and supplied the reference is outside the composition's scope — the composition records that a bearer of `tok_inv_g7h2k1` presented the invitation and supplied `accepting_identity_ref: "newhire@acme.com"`. Further investigation of who actually controlled that email address at that moment belongs to Party Identity's identity proofing concept (Customer Onboarding) or a breach forensics investigation.

**Breach forensics.** An investigator determines that an onboarding service account's credential was compromised during a window. The question is: were any fraudulent onboardings performed using the compromised credential? The investigator queries the Audit Trail for `onboarding.completed` events whose `actor_ref` matches the compromised service account, within the compromise window. Each event names `{invitation_token, accepting_identity_ref, party_id, credential_id}`. The investigator cross-references: do the `invitation_token` values correspond to invitations issued by authorized inviting actors? The `invitation.initiated` event for each token names the `inviter_ref`, and its `actor_credential` attestation is independently verifiable — this is the record that carries the token, which is what makes the correlation executable from the trail alone. Any `onboarding.completed` event whose token has no `invitation.initiated` event through the composition, or whose inviter's attestation fails, is a candidate fraudulent onboarding. Invariant 4 (full Audit Trail coverage) and Invariant 5 (completion record names the full arc) together make this forensic reconstruction possible from records alone.

---

## Edge cases

**Partial failure after `Invitation.accept`.** If `Invitation.accept` succeeds but a downstream step fails (Audit Trail step 4 fails, `Party Identity.enroll` fails, `Credential.register` fails, or Audit Trail step 7 fails), the invitation is permanently in `Accepted` state. A subsequent [Onboard] call with the same `invitation_token` will receive `rejected(invitation-invalid(already-resolved(Accepted)))` — the gate cannot be re-entered. Recovery requires an administrator to: (a) identify the interruption from the `onboarding.interrupted` Audit Trail record (if one was written), (b) manually complete the missing steps (enroll the party and/or register the credential), and (c) issue a new invitation if the invitation token cannot be correlated to the incomplete records. The GA check for unresolved interruptions (check 5) surfaces these cases for admin review.

**Concurrent [Onboard] calls — the race.** Two callers present the same `invitation_token` simultaneously. `Invitation.accept` is atomic under concurrent attempts; exactly one succeeds. The winning call proceeds to enrollment and credential registration. The losing call receives `rejected(invitation-invalid(already-resolved(Accepted)))` at step 3, before any enrollment occurs. No orphaned Party Identity records are created by the losing call. This is Invitation's single-resolution invariant working as the composition's concurrency control.

**Invitation expired between [Invite] and [Onboard].** The invitee delays acting on the invitation until after `expires_at`. `Invitation.accept` returns the atom's derived-expiry rejection `expired` → `rejected(invitation-invalid(expired))`. Nothing is written by the refusal: the record remains stored `Pending` and is *shown* `Expired` by the atom's read-time projection (its Invariant 12 — expiry is derived, never written; there is no stored `Expired` terminal for `already-resolved` to name). No enrollment occurs. The inviting actor must issue a new invitation.

**`duplicate-active-credential` at step 6.** If `Credential.register` returns `rejected(duplicate-active-credential)`, the `party_id` has already been enrolled (Party Identity.enroll succeeded at step 5) but the credential was not registered. The composition writes `onboarding.interrupted` (stage: "credential-registration", reason: "duplicate-active-credential") to the Audit Trail and relays `rejected(duplicate-active-credential)` — a state conflict, not an infrastructure failure, and the caller is told which. The enrolled party exists in `Unverified` state without a credential. Administrator review is required to determine how the `party_id` already has an active credential of that type — it may indicate a data integrity issue or a retry after a partial failure from a prior run.

**Identity verification after onboarding.** This composition enrolls the party in `Unverified` state. The transition to `Verified` is a separate concept — the Customer Onboarding composition orchestrates identity verification and calls `Party Identity.verify(verification_result=passed)` to drive the `Unverified → Verified` transition. Downstream regulated activity that requires `Verified` status must check Party Identity state before proceeding; this composition does not provide that gate.

**Credential rotation after onboarding.** Once onboarded, the principal may rotate their credential using `Credential.rotate` directly (outside this composition's surface). The composition does not expose a rotate action. Rotation belongs to the principal's ongoing credential management, separate from the one-time onboarding arc.

**Invitee identity not matching `invitee_ref`.** If the inviting actor supplied an `invitee_ref` at [Invite] time (e.g., a known email address), and the `accepting_identity_ref` supplied at [Onboard] time does not match that `invitee_ref`, the composition does not detect or block this mismatch — the Invitation atom does not validate the relationship between `invitee_ref` and `accepting_identity_ref`. A deployment that requires the accepting identity to prove control of the `invitee_ref` (e.g., by verifying ownership of the email address before calling [Onboard]) must enforce this constraint above the composition layer, before calling [Onboard]. The composition records whatever `accepting_identity_ref` is supplied; the mismatch is a policy matter for the calling layer.

**Decliner identity not recorded.** `Invitation.decline` does not accept an identity argument; the Invitation atom records only that a decline occurred, not who declined. The [Decline] action in this composition uses the system service account as the Audit Trail attestation actor. A deployment that needs to record who declined should capture the decliner's external reference in the Audit Trail event data payload before calling the composition's [Decline] action.

---

## Generation acceptance

An implementation of External Onboarding is accepted if an external auditor can clear the following checks from the Audit Trail and constituent-atom records alone, without recourse to source code, runbooks, or developer narration. Four standing rules govern how the checks run. **Retrieval:** every payload-keyed query below is an enumerate-and-filter over the substrate's declared sequence-range read (Composition state names the mechanism); no payload-index surface is assumed. **Cross-store timestamps:** each constituent stamps its records at its own seam, so a comparison between two stores' stamps (or a store's stamp and an event's) is evidence-trail auditing under the deployment's operating skew — a check condemns only violations wider than that skew and reads boundary-width discrepancies as inconclusive rather than as findings. **Store scope:** every Invitation-store quantifier below ranges over the composition's one dedicated instance under the deployment's routing obligation (*Composes*); records living outside it are outside these claims. **Retention horizon:** the trail is retention-bounded by configuration while Invitation records are undeletable, so every trail-walking check quantifies over arcs whose events are within the configured retention horizon — a purged event is lawful destruction under the substrate's honest-representation invariant, its Retention Window record in *Purged* state being the evidence, never a gap signature — and past the horizon the surviving evidence surface is the attestation's own `action_ref` / `actor_ref` / `attested_at` (which the substrate's purge preserves) plus the undeletable constituent records themselves. Checks 1, 4, 5, and 6 all read under these rules.

1. **Every active Party Identity enrolled via this composition traces to an accepted invitation.** For every `onboarding.completed` Audit Trail event, the `invitation_token` field references an Invitation record in `Accepted` state, with `accepted_at` predating the event timestamp and `accepting_identity_ref` matching the event's `accepting_identity_ref` field. No `onboarding.completed` event exists for an invitation that is not in `Accepted` state.

2. **Every active credential registered via this composition traces to an enrolled party.** For every `onboarding.completed` event, the `credential_id` field references an active Credential record whose `principal_ref` matches the event's `party_id` field. No credential registered via this composition is bound to a `principal_ref` that does not appear as a `party_id` in a Party Identity record.

3. **Credential-follows-party ordering.** For every `onboarding.completed` event, the Party Identity record for the event's `party_id` has an `enrolled_at` timestamp earlier than or equal to the Credential record's `registered_at` timestamp for the event's `credential_id`. No Credential record registered via this composition predates its subject's Party Identity enrollment.

4. **Invitation-gates-enrollment.** No `onboarding.invitation-accepted` Audit Trail event exists for an invitation that is not in stored `Accepted` state. No `onboarding.completed` event exists without a preceding `onboarding.invitation-accepted` event for the same `invitation_token`. The acceptance gate preceded enrollment in every arc.

5. **Interruption signatures are enumerated, both kinds.** The auditor enumerates two failure signatures, not one: **(a)** every Invitation record in stored `Accepted` state with no `onboarding.invitation-accepted` event for its token — the step-4 recording-failure or crash window, an acceptance the trail never registered; **(b)** every `onboarding.invitation-accepted` event with no subsequent `onboarding.completed` *or* `onboarding.interrupted` event for the same token — the mid-sequence crash or failed-interrupted-write window, an arc that stopped without its stage record. An `onboarding.interrupted` event without a subsequent `onboarding.completed` for the same token is the third, explicit signature: an unresolved interruption awaiting admin review. All three are enumerable by the declared enumerate-and-filter; together they cover every partial-failure path the [Onboard] wiring admits.

6. **Every terminal invitation transition via this composition is attested — in both directions.** Every Invitation record in `Declined` or `Revoked` state that was processed via this composition has a corresponding `invitation.declined` or `invitation.revoked` Audit Trail event. Every Invitation record — in any state — has a corresponding `invitation.initiated` event carrying its token; a record without one marks a post-initiate recording failure or crash ([Invite] step 4's declared gap), flagged for review alongside the unattested Declined/Revoked records. In the other direction, every `invitation.initiated` event names an Invitation record that exists. (`invitation.initiate-attempt` events carry no token by construction and are not per-invitation signatures; a sustained excess of attempts over `invitation.initiated` events is a coarse operational indicator, not a per-record finding.)

---

## Composition notes

**Relationship to Customer Onboarding.** External Onboarding admits a party to the system in `Unverified` state. Customer Onboarding drives the identity verification workflow that transitions the party to `Verified`. The two compositions address adjacent points in the regulated identity lifecycle: External Onboarding is the admission gate; Customer Onboarding is the verification gate. A deployment requiring `Verified` status before granting access to regulated functionality places Customer Onboarding downstream of this composition in the onboarding pipeline.

**Relationship to Login.** External Onboarding registers the credential. Login uses that credential: `login(principal_ref, credential_type, presented_material, ...)` calls `Credential.verify`, and on success issues a Session. After a successful [Onboard], the principal can immediately call `login` using the registered `credential_type` and their credential material. The two compositions are adjacent lifecycle boundaries: External Onboarding creates the credential record; Login produces the authenticated session.

**Relationship to Session-Gated Authorization.** Once the onboarded principal has an active session (from Login), runtime authorization queries flow through Session-Gated Authorization: `check_permitted(session_token, action_scope)` gates every permission check on session validity. External Onboarding is the entry point; Session-Gated Authorization is the access-time gate.

**Relationship to Attributed Permissions Admin.** Once onboarded, the principal appears as a subject in Permissions. An authorized actor calls `Attributed Permissions Admin.grant(subject_ref=party_id, action_scope, ...)` to grant the newly onboarded party access to specific scopes. The `party_id` produced by External Onboarding becomes the `subject_ref` in Permissions grants.

**Forthcoming-link resolution.** The Invitation atom's *Composition notes* listed "External Onboarding *(not started)*" as a forthcoming composition. That link is now live.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are: the four onboarding actions it exposes ([Invite], [Onboard], [Decline], [Revoke]) and the three composition-introduced Audit Trail event types that record the arc ([Onboarding Invitation Accepted] — the gate clearing; [Onboarding Completed] — the full-arc completion naming invitation, identity, party, and credential in one entry; [Onboarding Interrupted] — the partial-failure record). Its load-bearing guarantee — invitation-gates-enrollment: no Party Identity is enrolled through this composition unless an Invitation's Accepted transition precedes it (Invariant 1) — is a structural property, not a datum. The composition owns no cross-atom state (the Audit Trail *is* the map — Composition state), so there is no store to card as a Type. The `invitation.*` audit event types (`invitation.initiated`, `invitation.declined`, `invitation.revoked`), the attempt-gate event types (`invitation.initiate-attempt`, `onboarding.accept-attempt`, `invitation.decline-attempt`, `invitation.revoke-attempt`), and the composition's parameterized invitation-state rejection (`invitation-invalid(already-resolved(state) | not-known | expired)`) stay backticked as wire values, as do the constituent calls and their outcomes — Invitation's `initiate` / `accept` / `decline` / `revoke` (and its `Pending` / `Accepted` / `Declined` / `Revoked` / `Expired` states), Credential's `register`, Party Identity's `enroll` (and its `Unverified` / `Verified` states), Audit Trail's `record_action` — the relayed constituent tokens (`invitation_token`, `accepting_identity_ref`, `party_id`, `credential_id`, `inviter_ref`, `invitee_ref`, `enrolling_actor_ref`, `actor_credential`), the generic/relayed rejections (`invalid-request`, `invalid-credential`, `duplicate-active-credential`, `storage-failure`, `recording-failure`, `not-known`), and concrete example ids. Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Invite

The composition action that initiates an invitation from an authorized actor to an external party — the `invitation.initiate-attempt` gate event first (the attest is the credential check, recorded before the Invitation is created), then `Invitation.initiate`, then the post-success `invitation.initiated` record carrying the token — returning the `invitation_token` the inviter delivers out-of-band.

Kind: Operation

#### Onboard

The composition's load-bearing action: accept an invitation and, in one fixed sequence gated by `Invitation.accept`, enroll the invitee as a Party Identity (Unverified) and register their Credential — recording [Onboarding Invitation Accepted], then [Onboarding Completed] (or [Onboarding Interrupted] on a mid-sequence failure). No enrollment occurs unless the acceptance gate clears (Invariant 1).

Kind: Operation

#### Decline

The composition action that records an invitee's deliberate refusal of an invitation (`Invitation.decline`) and attests it (`invitation.declined`) under the system service actor.

Kind: Operation

#### Revoke

The composition action that withdraws a pending invitation before the invitee acts (`Invitation.revoke`), attributing the revocation to the revoking actor (`invitation.revoked`).

Kind: Operation

#### Onboarding Invitation Accepted

The Audit Trail event [Onboard] records the moment the `Invitation.accept` gate clears — carrying the `invitation_token` and `accepting_identity_ref`. An Invitation in Accepted state with no such event is an unresolved interruption (Generation acceptance check 5).

Kind:      Member
Member of: the onboarding event
Role:      Audit event
Projects:  onboarding.invitation-accepted

#### Onboarding Completed

The Audit Trail event [Onboard] records on a successful full arc — naming the invitation, the accepting identity, the party record, and the credential in one tamper-evident entry (`{invitation_token, accepting_identity_ref, party_id, credential_id}`). The records-alone answer to *what invitation authorized this party's creation?*

Kind:      Member
Member of: the onboarding event
Role:      Audit event
Projects:  onboarding.completed

#### Onboarding Interrupted

The Audit Trail event [Onboard] writes when a step after the acceptance gate fails (Party Identity enrollment or Credential registration) — naming the stage and reason, so a partially-completed onboarding is detectable and recoverable rather than silent.

Kind:      Member
Member of: the onboarding event
Role:      Audit event
Projects:  onboarding.interrupted

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Invite]: #invite
[Onboard]: #onboard
[Decline]: #decline
[Revoke]: #revoke
[Onboarding Invitation Accepted]: #onboarding-invitation-accepted
[Onboarding Completed]: #onboarding-completed
[Onboarding Interrupted]: #onboarding-interrupted

---

## Status

`partially resolved` — see the Ledger.

## Ledger

```
status: partially resolved
formal: verified — external-onboarding.tla, no twin, 2026-06-03
last gate: 2026-08-26 — Final Critique 7, fresh reader — 6 foundational (4 since closed), 10 refining, 3 rhetorical

open:
- 2026-08-26-a · foundational · Generation acceptance check 2 · "active Credential record" is falsified by lawful rotation, so a conforming implementation fails the check the day a principal rotates → require a Credential record in any lifecycle state whose `principal_ref` matches, walking `successor_credential_id`; drop the activeness quantifier
- 2026-08-26-b · foundational · Summary; Examples, forensics walk; Standards references, SOC 2 CC6.2 · inviter/revoker authorization is claimed and neither wired nor declared out of scope; the gate authenticates but does not authorize → declare the authorization gate an above-composition obligation in a named edge case (a Permissions instance over `invitations:initiate` / `invitations:revoke`), downgrade the prose to authenticated-and-attributed, re-scope the CC6.2 paragraph
- 2026-08-26-c · refining · every substrate-arm transcription · bare `recording-failure` where the contract is `recording-failure(step)` → carry the `(step)`
- 2026-08-26-d · refining · [Invite] step 4 · "can never be accepted" overclaims; the atom's `read` projection returns the token to a store-reader → narrow the claim
- 2026-08-26-e · refining · [Decline] · the decliner-identity sentence points at a `data` parameter the signature does not carry → pin the edge case's above-layer reading
- 2026-08-26-f · refining · step 1 validation, all actions · validation depth unpinned; whether constituent semantic validation runs pre-gate decides whether a typo permanently consumes the invitation → pin that it runs pre-gate, citing the constituents' field rules, with steps 5/6's arms as backstop
- 2026-08-26-g · refining · [Onboard], `duplicate-active-credential` · the causal story is impossible for a freshly minted `party_id` → re-derive as a cross-namespace `principal_ref` collision with an external writer
- 2026-08-26-h · refining · [Revoke] · lacks its Arguments subsection → add it
- 2026-08-26-i · refining · Invariant 2 · restates the constituent's Invariants 3/4 as composition-emergent → re-scope to the completion-record linkage
- 2026-08-26-j · refining · Standards references · RFC and SP unglossed → gloss
- 2026-08-26-k · refining · Examples, happy path · `Credential.register` argument order and the `<password hash>` material contradict the atom's raw-material model → match the atom
- 2026-08-26-l · refining · Intent · "create no permanent records" for losing racers contradicts the attempt-event trace → restate
- 2026-08-26-m · rhetorical · Composition logic overview; Actions · the same sequence numbered differently → number once
- 2026-08-26-n · rhetorical · Invariant 4 · "exactly these" over-tightens against check 5's third signature → loosen
- 2026-08-26-o · rhetorical · Invariant 4 · mixed marker/backtick notation and a sentence fragment → clean up
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/external-onboarding.md`.

- **2026-08-26 — The attempt record is the credential gate on all four actions.** *Chose:* every state-changing action opens with a `record_action` attempt event whose Actor Identity attestation, made inside the substrate's declared surface, is the credential check; an attempt refused at the gate lands no event. *Over:* a dry-run mode the substrate does not declare, or reaching Actor Identity directly, which is a transitive constituent. *Because:* the check must live on a surface the composition actually consumes, and the attempt is then auditable for free.
- **2026-08-26 — Invariant 4 is safety plus detectability, not totality.** *Chose:* the arc's completeness is claimed over named gap signatures that checks 5 and 6 enumerate. *Over:* the unconditional statement over paths that admit invisible terminal transitions. *Because:* the composition is stateless by design and carries no marker discipline, so detectability through records is the recovery posture it can honestly offer.
