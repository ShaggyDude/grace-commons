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

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage</h2>
</summary>

### Round 1

**Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** All nine MUSE (the v1.1 completeness framework GRID's nodes are drawn from) nodes resolved. Intent (the structural gap: four constituent atoms cannot answer what-order-with-what-audit-record), System boundary (four atoms, four actions, no composition-owned cross-atom state), Friction (partial-failure cases after Invitation.accept, concurrent acceptance race, `duplicate-active-credential`, expired invitation), Flow (fixed five-step `onboard` sequence with Invitation.accept as serialization gate), Decision (gate clears or fails; each downstream step can fail independently), Feedback (result tags first-class; `onboarding.interrupted` names the stage), State (no cross-atom state — Audit Trail is the map; explicit rationale given), Behavior (five emergent invariants), Proof (six GA checks, all Audit Trail-based).

**Pass 2 — EOS (the Essence of Software, Daniel Jackson's concept framework) conceptual independence.** Invitation, Credential, Party Identity, and Audit Trail are freestanding atoms/compositions; none is absorbed. The composition's own concept — the mandatory sequencing of the four steps with the gate, the audit binding of the full arc in a single completion record — does not belong to any constituent. The no-cross-atom-state decision was re-examined: the Audit Trail completion record carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` as its data payload, making the Audit Trail serve as the tracing map. This is correct — the Audit Trail already has the integrity properties (tamper-evident, attribution-stamped, retention-bounded) that a separate composition-owned map would need to replicate. No extraction needed.

**Pass 3 — Linus adversarial.**

*Finding R1F1 — Step ordering in `invite` writes Audit Trail before `Invitation.initiate`.* Audit Trail records the inviter's intent even if the invitation store subsequently fails. This creates an Audit Trail record with no corresponding Invitation record. Rather than reversing the order (which would allow unaudited invitations when Audit Trail fails), the design records the attempt first and the GA check 6 surfaces Audit Trail initiation records without corresponding Invitation records as gaps for admin review. The rationale: in regulated environments, recording the actor's intent before the operation is the audit-first discipline. Named explicitly in step 4 note and in GA check 6.

*Finding R1F2 — `decline` action attribution gap.* `Invitation.decline` does not record the decliner's identity. The Audit Trail record uses the system service account as the attestation actor. The edge case ("Decliner identity not recorded") names this explicitly and describes the deployment escape hatch (record the decliner's external reference in the data payload above the composition layer). Named in action notes and edge cases.

*Finding R1F3 — `duplicate-active-credential` at step 6 is not a storage failure.* Step 6's failure handling collapsed `duplicate-active-credential` into `storage-failure` in the return. This misleads callers: `storage-failure` implies a transient infrastructure failure; `duplicate-active-credential` implies a data integrity or retry issue. Fixed: the edge case ("duplicate-active-credential at step 6") names the distinct cause and the different recovery path, and the action step notes the distinction. The return type remains `storage-failure` to keep the signature clean (the distinction is surfaced in the `onboarding.interrupted` Audit Trail record's `reason` field, where it is visible from records alone).

### Round 2

**Pass 1 — GRID structural.** All nine nodes still resolved after Round 1 fixes. The GA check 5 (unresolved interruptions detectable) was verified: the `onboarding.interrupted` event carries the `stage` field naming exactly which step failed, giving admin review a precise recovery starting point. Clean.

**Pass 2 — EOS conceptual independence.** No new absorption. The Customer Onboarding overlap is explicitly addressed in Composition notes (External Onboarding is the admission gate; Customer Onboarding is the verification gate). The credential-rotation concern is named in Edge cases as outside the composition's surface.

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

**Formal model — TLA+ operational peer (precipitating touch for Round 5).** `compositions/external-onboarding.tla` (+ `external-onboarding.cfg`). The `.tla` file was authored prior to this Lineage entry but was unrun via the CLI; the file had previously been named `external-onboarding.tla` (kebab-case), which caused SANY to reject it (TLA+ requires the filename basename to match the `MODULE` declaration, and hyphens are illegal in TLA+ identifiers). The cross-cutting rename to `external-onboarding.tla` on 2026-05-23 — applied to all four `.tla` files in `compositions/` and recorded in [`discoveries.md`](../discoveries.md) §2026-05-23 — made CLI execution possible and constituted an effective touch under `pressure-testing.md` §Touch triggers re-pass, triggering Round 5. The `.cfg` comment block contained suggested CONSTANTS that were not materialized; materialized on 2026-05-23: `NULL = NullMV` (model-value override for the `NULL == "_none_"` operator — same TLC 2.19 strict-equality fix as `attributed-permissions-admin.cfg`), `Actors = {a1, a2}`, `InvitationIds = {i1, i2}`, `PartyIds = {p1, p2}`, `CredentialIds = {c1, c2}`, `MaxClock = 3`. Checks the five application-level invariants (`Invitation_Gates_Enrollment`, `Single_Resolution`, `Credential_Follows_Party`, `Audit_Coverage`, `Completion_Names_Full_Arc`) plus five structural guards (`Status_Monotone`, `Party_Invitation_Binding`, `Credential_Party_Binding`, `Audit_Set_Integrity`, `TypeOK`) as the combined `Safety` predicate under TLC's exhaustive-interleaving semantics. Result: 44 distinct states (101 generated, depth 4, complete graph search); `Safety` holds across every reachable state. No deadlock. The single-resolution gate — `invitations[inv].status = "pending"` as the atomic precondition to `Onboard` — is the load-bearing concurrency claim: the model confirms that under every interleaving, at most one `Onboard` per invitation slot can satisfy the gate and create Party Identity and Credential records. The `OnboardInterrupted` action exercises the gate's partial-failure behavior (Invitation → Accepted, no party/credential created) and confirms both `Invitation_Gates_Enrollment` (Invariant 1) and `Audit_Coverage` for Accepted invitations (Invariant 4a) hold even when enrollment fails after the gate clears.

**Pass 1 — Structural completeness (GRID), Round 5 (touch-triggered re-pass, 2026-05-23).** *Complete.* No findings. All nine GRID nodes still resolved. The `.cfg` CONSTANTS materialization and `NULL = NullMV` override are tool-compatibility changes that do not alter the spec body. Formal model Lineage entry carries the plain-English summary, artifact location, bounds, scope exclusions, and result per `contributing.md` §Formal-model artifacts.

**Pass 2 — Conceptual independence (EOS), Round 5.** *Complete.* No findings. The TLA+ artifact introduces no new concept requiring extraction as a separate atom. The state variables (`invitations`, `parties`, `credentials`, `audit_accepted`, `audit_declined`, `audit_revoked`, `audit_interrupted`, `clock`) all map to constituent-atom stores or to the Audit Trail event surface already named in §Composition state. The `OnboardInterrupted` action models a failure branch within the composition's own scope; no new atom surface is implied.

**Pass 3 — Adversarial scrutiny (Linus mode), Round 5.** *Complete.* No findings. TLC's exhaustive enumeration of 44 distinct states at the chosen bounds produced no counterexample to any of the ten invariants. The single-resolution property (`Single_Resolution`) — the composition's primary concurrency safety claim — holds across all interleavings: no invitation ever produces more than one enrolled Party Identity record. `Credential_Follows_Party` holds in every reachable state including `OnboardInterrupted` paths, confirming the enrollment-before-credential ordering is enforced structurally by the action preconditions. No spec finding surfaced. The verification is reproducible from a fresh checkout: `java -cp tla2tools.jar tlc2.TLC -config external-onboarding.cfg -workers 4 external-onboarding.tla`.

Round 5 closed clean. Foundational findings: zero. Refining findings: zero. External Onboarding moves from `grounded on Final Critique 4` to `grounded on Final Critique 5`.

**Formal-layer vote — 2026-06-03: YES (model present).** Invitation-gates-enrollment (Inv 1) and credential-follows-party (Inv 3) define a strict accept→enroll→register ordering under concurrent onboarding; verified by the TLA+ model. Verified by the sibling formal model (`external-onboarding.tla`); the pattern remains `grounded`. Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — bound correction, 2026-06-03 (harness audit finding).** The 2026-06-03 `tools/harness/` sweep ran `external-onboarding.tla` and flagged that it explored only **44 states** — a low count worth checking. Diagnosis: the model's `clock` advances on every action and is capped by `MaxClock`, so `MaxClock = 3` truncated traces at 3 actions deep, well before the 2-invitation system exhausts its reachable transitions. The reachable space **saturates at 172 states by `MaxClock = 4`** and is stable thereafter (5 and 6 give the same 172). `MaxClock` was raised 3 → 6 in `external-onboarding.cfg` (headroom over the saturation point); the model now explores the complete reachable space and **Safety holds across all 172 states**. The original 44-state run was not wrong — every state it explored satisfied Safety — but the bound was too low to claim full coverage; the corrected bound discharges the invariant over the whole reachable space. This is a conflict-protocol case-2 correction (a derivation/bound defect in the model config, not a spec defect); the canonical English spec was untouched. Widening the id scope as an independent check (3 invitations/parties/credentials) also keeps Safety holding (179 states), confirming the model is not over-constrained.

**Composition-state classification fold — 2026-08-26 (batched pre-convention tail, methodology debt #9; gated by Final Critique 6 below).** Convention retrofit for the composition-state rule adjudicated 2026-06-10, which postdates this composition's grounding. Change: the existing no-composition-owned-map declaration given the rule's vocabulary — **conforming, no stored composition state** — with the note that "the Audit Trail is the map" (the tracing rides the `onboarding.completed` event payload through a constituent's declared record) is exactly the shape the 2026-06-10 rule later canonized: this composition anticipated it. **Caller signatures UNCHANGED**; no invariant number, signature, or rejection taxonomy changed. Gate: closed by Final Critique 6 below.

**Final Critique 6 — 2026-08-26: not clean (5 foundational; ROUTED, not folded — the tail round ends here).** The closing fresh-reader gate over the 2026-08-26 convention fold (AI-conducted, claude-fable-5, Happy-Torvalds-X2, fresh-reader discipline throughout — pass question sets, the spec body, and the four constituent specs for structural checking only; no Lineage, no prior findings). The fold's conforming/no-stored-state declaration and the Audit-Trail-is-the-map decision were confirmed (Pass 2 substantially clean; the enroll/register wiring, step order, and concurrency story verified faithful — the concurrent-acceptance race correctly grounded in Invitation Invariant 2). It surfaced **five foundational findings** — concentrated in the expiry model, the credential-check seam, and the audit surface's detection claims — plus nine refining and three rhetorical. Per the stop rule, all are recorded as **open routed findings**; the composition is downgraded to `partially resolved` until they close and a round returns zero foundational. The five foundational:

- *FC6-F1 — Expired treated as a stored terminal against the constituent's derived-expiry contract — foundational (OPEN) →* the composition maps `already-resolved(Expired)`, a token Invitation's Invariant 6 says is never produced ("there is no stored `Expired` to name"), maps nothing to the `expired` token the constituent actually returns from `accept`/`decline`/`revoke`, speaks of "four terminal states" where the constituent stores three, and describes "lazy expiry" — a write-on-touch model Invitation's Invariant 12 forbids. A lapsed invitation presented to [Decline] or [Revoke] has undefined behavior at this boundary. Fix: map `expired → invitation-invalid(expired)` on all three actions, restate the constituent characterization (at most one write to one of three stored terminals; Expired derived), delete "lazy expiry."
- *FC6-F2 — credential verification rests on a capability no declared constituent exposes — foundational (OPEN) →* "call `record_action` in credential-check mode, or verify against Actor Identity directly": the substrate declares no dry-run mode, and Actor Identity is reached transitively, not declared as a used surface — the check gating [Onboard] and [Revoke] is orphaned. Fix: declare Actor Identity's verification surface as used, or adopt the audit-first pattern (the attest inside a pre-accept `record_action` is the gate, the attempt auditable).
- *FC6-F3 — detection claims cite Generation-acceptance checks that do not perform them — foundational (OPEN) →* the step-4 and step-7 interruption paths leave event patterns check 5's query never enumerates (an Accepted invitation with no `invitation-accepted` event; an `invitation-accepted` with no `completed`/`interrupted`), and the invite-gap claim cites check 6, which checks the opposite direction. Fix: extend checks 5 and 6 to enumerate the actual failure signatures.
- *FC6-F4 — the [Invite] audit event cannot carry the token two sections and the forensics guarantee assume it does — foundational (OPEN) →* the audit-first write at step 2 precedes `Invitation.initiate`, so the event cannot name the token, yet the wiring prose and the breach-forensics correlation both assume it does — the records-alone reconstruction is unexecutable as wired. Fix: a post-success audit event carrying the token (audit-first preserved for the attempt), or an explicit re-route of the correlation through the Invitation store's `inviter_ref` with a stated matching rule.
- *FC6-F5 — `record_action` rejection enumerations incomplete at all six call sites — foundational (OPEN) →* `invalid-request` (payload over cap) and `invalid-credential` (revoked between check and attest) are reachable and unmapped at various sites; [Decline]'s declared `invalid-credential` is producible by no enumerated step while its only credential-consuming call's arm is unmapped post-terminal-write. Fix: enumerate and map all three arms at each site; define the post-terminal-write `invalid-credential` semantics.

*Refining/rhetorical (open, from Final Critique 6):* the `invitation.initiated` vs `invitation.initiate` wire-token disagreement (byte-identity queries find nothing); step 6 collapsing `Credential.register`'s caller/config faults into `storage-failure` (inconsistent with step 5's preserved `invalid-request`); the Composition-logic/Actions disagreement on enroll-failure arms; the `onboarding.interrupted` calls omitting the substrate's required `actor_ref`/`credential` arguments with no failed-interrupted-write story; Generation-acceptance checks 1/3 resting on cross-store timestamp comparisons the constituents declare advisory (state the single-clock assumption or an insertion-order alternative); check 4's stale Permissions phrase (not a constituent); the payload-field queries throughout relying on the lookup shape Audit Trail routes to the forthcoming Reverse Index (name the dependency or the enumeration fallback); Invariant 4 stated unconditionally over paths that admit invisible terminal transitions (restate as safety + detectability once FC6-F3's checks land); step 3's `invalid-request` omission without the foreclosure argument. Rhetorical — "GA" never bound at first use; Invariant 5's "no join across stores" (the traversal is a join; the claim is no correlation index); QR code and ttl unspelled.

**Final Critique 6 findings closure — 2026-08-26 (all five foundational + nine refining + three rhetorical folded; gate pending).** Implementation pass closing every routed Final Critique 6 finding, under the re-grounding campaign. **One uniform mechanism added: the attempt-record credential gate.** Every state-changing action now opens with an `Audit Trail.record_action` attempt event whose Actor Identity attestation — made inside the substrate's own declared surface — *is* the credential check (`invitation.initiate-attempt`, `onboarding.accept-attempt`, `invitation.decline-attempt`, `invitation.revoke-attempt`); no dry-run mode is invoked and Actor Identity stays transitive. **Two additive signature changes:** [Onboard] gains a relayed `duplicate-active-credential` arm, and [Decline] / [Revoke] gain the `expired` member in their `invitation-invalid(...)` union. The composition stays stateless (no marker discipline imported — detectability through named gap signatures remains its recovery posture). One line each, foundational first:

- *FC6-F1 — closed →* the expiry model restated to the constituent's contract everywhere: `expired` mapped on all three resolving actions (`invitation-invalid(expired)`), the `already-resolved(Expired)` line deleted, the Composes characterization now one-write-to-one-of-three-stored-terminals with derived `Expired` (Invitation Invariants 6/12 cited), "lazy expiry" and "four terminal states" removed from the edge case and Summary.
- *FC6-F2 — closed →* the orphaned credential check replaced by the attempt-record gate on all four actions: the attest inside the pre-write `record_action` is the verification, the attempt auditable, an attempt refused at the gate landing no event (Failed-Attempt Log territory, matching the substrate's posture); [Revoke]'s free-floating "verify actor_credential" step and [Onboard]'s "credential-check mode" both gone.
- *FC6-F3 — closed →* checks 5 and 6 now enumerate the actual failure signatures: check 5 gains the stored-`Accepted`-without-acceptance-event and accepted-without-`completed`-or-`interrupted` signatures (covering the step-4 and mid-sequence crash windows plus the failed-interrupted-write); check 6 gains the invitation-without-`invitation.initiated`-event direction; Invariant 4 restated as safety plus detectability over exactly those signatures.
- *FC6-F4 — closed →* [Invite] gains a post-success `invitation.initiated` record carrying the token (the attempt event keeps audit-first for the try; the token is recorded at the only point it exists), the forensics correlation re-routed through it, and the token-loss recording-failure landing defined (the invitation lapses harmlessly — no one holds the bearer token).
- *FC6-F5 — closed →* all three `record_action` arms mapped at every call site: `invalid-request` foreclosed by constructed-event-data size checks at each action's validation step (deployment fault if observed), `invalid-credential` produced by the gate pre-write and defined as the rotation-race landing post-write (the committed act stands; the same detectable gap as `recording-failure`), [Decline]'s declared `invalid-credential` now producible by its gate.

*Refining/rhetorical, one line each:* the `invitation.initiated` / `invitation.initiate` wire-token disagreement resolved by the attempt/success pair (`invitation.initiate-attempt` / `invitation.initiated`), examples and check 6 updated; step 6 relays `Credential.register`'s arms under their own names (caller fault, state conflict, infrastructure fault distinguished; the `duplicate-active-credential` edge case corrected); the Composition-logic wiring list and the Actions section now agree on the enroll-failure arms (`invalid-request` relayed); the `onboarding.interrupted` calls carry the full `record_action` signature (`actor_ref`, `credential`) and the failed-interrupted-write lands in check 5's second signature; GA's intro states the two standing rules — enumerate-and-filter retrieval (payload-index lookups routed to the forthcoming Reverse Index) and cross-store timestamp comparisons qualified by operating skew (covering checks 1 and 3); check 4's stale Permissions sentence replaced; Invariant 4's unconditional form replaced by safety-plus-detectability; [Onboard] step 3's `invalid-request` arm mapped with the foreclosure argument. Rhetorical — Generation acceptance (GA) bound at first use; Invariant 5's "no join across stores" recast as no-correlation-index; QR (Quick Response) and `ttl` (time-to-live) glossed.

*Model impact:* none — `external-onboarding.tla` models the accept-gate sequencing, which is unchanged; the attempt events precede the gate and add no state the model abstracts. Harness untouched. Terms: no new cards — the attempt events and `invitation.initiated` join the backticked wire-value roster in the registry preamble.

**Final Critique 7 — 2026-08-26: not clean (6 foundational; ROUTED, not folded — closure round ends here).** The closing fresh-reader gate over the Final Critique 6 closure (AI-conducted, claude-fable-5, Happy-Torvalds-X2, fresh-reader discipline throughout — pass question sets, the spec body, and the four constituent specs for structural checking only; no Lineage, no prior findings). All five Final Critique 6 foundational closures held — the expiry model, the attempt-record gate, the gap signatures, the token-carrying `invitation.initiated`, and the per-site arm mappings were each verified faithful — but the gate surfaced **six new foundational findings**: two introduced by the closure's own unreachability claims and gate landings, four pre-existing and newly visible under the sharper audit surface (two of them — the retention-horizon blindness and the store-scope quantification — corpus-recurring shapes). Plus ten refining and three rhetorical. Per the stop rule (one gate, then route), all are recorded as **open routed findings**; the pattern holds at `partially resolved` until they close and a round returns zero foundational. The six foundational:

- *FC7-F1 — the record-step `invalid-request` "unreachable" claim is false as validated — foundational (CLOSED 2026-08-26 — the triager's validation round; see the closure entry below) →* step 1 validates refs only non-empty while the substrate rejects an `actor_ref` over its `reference_length_cap`, and the payload pre-check cannot cover values minted mid-call (`invitation_token`, `party_id`, `credential_id`) with no declared width bounds. Fix: replicate the substrate's caller-input caps at step 1 (refs within the wired instance's `reference_length_cap`; free text within the payload budget) and declare minted-id width bounds the budget arithmetic uses (the substrate's own `attestation_id_width` move), after which the unreachability claim is true; otherwise withdraw it and map the arm.
- *FC7-F2 — an observed record-step `invalid-request` has no declared landing in three of four actions — foundational (CLOSED 2026-08-26 — the triager's validation round; see the closure entry below) →* only [Invite] step 2 names a return (`storage-failure`); the other sites say "a deployment fault if observed" with no token, so two implementations diverge. Fix: state the landing once in the gate-discipline paragraph — surfaced as `rejected(storage-failure)` with a deployment alert, never as the caller's `invalid-request` (their inputs passed validation) — and reference it from every site.
- *FC7-F3 — check 2's "active Credential record" is falsified by lawful rotation — foundational (OPEN) →* the registered credential is legitimately Rotated, Revoked, or lapsed later (the spec's own rotation edge case), so a conforming implementation fails the check the day a principal rotates. Fix: require the `credential_id` to reference a Credential record in *any* lifecycle state whose `principal_ref` matches, walking `successor_credential_id` where rotated; drop the activeness quantifier.
- *FC7-F4 — the records-alone tracing claims ignore the substrate's purge horizon — foundational (CLOSED 2026-08-26 — the triager's crash-seam round; see the closure entry below) →* the tracing chain lives in event payloads (the substrate's `purge_event` cascade destroys the `data` field entirely) while Invitation records are undeletable, so past the retention horizon every old arc reads as check 5(a)/6 gap signatures and Invariants 4–5's claims fail — the trail is retention-bounded by declaration and the checks never say so. Fix: qualify Invariant 4 and checks 1, 4, 5, 6 to arcs within the configured retention horizon (purged events read as lawful destruction per the substrate's honest-representation invariant, not as gaps), and name what survives a purge (the attestation's `action_ref`/`actor_ref`/`attested_at`) as the post-horizon evidence surface.
- *FC7-F5 — inviter/revoker authorization is claimed but neither wired nor declared out-of-scope — foundational (OPEN) →* Invitation expressly hands who-may-invite policy to the composing pattern; this composition's gate authenticates but does not authorize, while the Summary, forensics walk, and the SOC 2 CC6.2 paragraph all say "authorized." Fix: declare the authorization gate an explicit above-composition obligation in a named edge case (a Permissions instance over an `invitations:initiate` / `invitations:revoke` vocabulary being the canonical realization a deployment wires), downgrade the prose claims to authenticated-and-attributed, and re-scope the CC6.2 paragraph to what the composition itself enforces.
- *FC7-F6 — checks 5(a) and 6 quantify over an undeclared store scope — foundational (CLOSED 2026-08-26 — the triager's crash-seam round; see the closure entry below) →* nothing declares dedicated constituent instances or a routing obligation, so an invitation resolved through direct atom use or a sibling pattern is condemned as a recording failure. Fix: declare the instance posture (one dedicated Invitation instance whose lifecycle traffic routes through this composition — the substrate's own exactly-one-instance discipline) as a deployment obligation the checks assume, and scope the checks to that instance.

*Refining/rhetorical (open, from Final Critique 7):* every substrate-arm transcription writes bare `recording-failure` where the contract is `recording-failure(step)`; [Invite] step 4's "can never be accepted" overclaims (the atom's `read` projection returns the token to a store-reader); [Decline]'s decliner-identity sentence points at a `data` parameter the signature does not carry (pin the edge case's above-layer reading); step-1 validation depth unpinned — whether constituent semantic validation runs pre-gate decides whether a typo permanently consumes the invitation (pin: it does run pre-gate, citing the constituents' declared field rules, with steps 5/6's arms as the backstop); the `duplicate-active-credential` causal story impossible for a freshly-minted `party_id` (re-derive: a cross-namespace `principal_ref` collision with an external writer); [Revoke] lacks its Arguments subsection; Invariant 2 restates the constituent's Invariants 3/4 as composition-emergent (re-scope to the completion-record linkage); RFC and SP unglossed; the happy-path `Credential.register` argument order and the `<password hash>` material contradict the atom's raw-material model; Intent's "create no permanent records" for losing racers contradicts the attempt-event trace. Rhetorical — the wiring overview and Actions section number the same sequence differently; Invariant 4's "exactly these" over-tightens against check 5's third signature; mixed marker/backtick notation and a fragment in Invariant 4.

*What this round confirmed clean (per the reviewer's pass confirmations):* all nine GRID nodes; every Invitation signature and rejection vocabulary including the derived-expiry split; `enroll` / `register` contracts; the concurrency story on Invitation Invariant 2; the clock discipline with skew-bounded evidence checks; the post-accept interruption signatures covering every crash window; and the EOS ownership map with no extraction firing.

**Final Critique 7 — F4/F6 closure (the crash-seam round) — 2026-08-26 (2 of 6 foundational closed; F1, F2, F3, F5 remain open).** Second themed round of the routed-residue triage: this pattern's two audit-surface-scope findings, adjacent to the crash-seam family, closed together. **The retention horizon named (F4):** Generation acceptance gains two standing rules — the trail-walking checks quantify over arcs within the configured retention horizon, a purged event reading as lawful destruction (the substrate's *Purged* Retention Window records the evidence) never as a gap signature, with the post-horizon evidence surface named (the attestation's surviving `action_ref` / `actor_ref` / `attested_at` plus the undeletable constituent records) — and Invariants 4 and 5 carry the same bound. **The store scope declared (F6):** the Composes Invitation bullet now declares the instance posture and routing obligation — exactly one dedicated Invitation instance, every lifecycle action on it routed through this composition's four actions, the substrate's own exactly-one-instance discipline applied as a deployment obligation — giving checks 5(a) and 6 the decidable membership criterion they quantified without, with the shared posture of Credential and Party Identity stated by contrast. No wiring, signature, or event changed. **Gate deferred, stated rather than skipped:** with four foundational findings known open, a gate cannot return zero; these closures are verified at the pattern's full-residue closing round.

**Final Critique 7 — F1/F2 closure (the validation round) — 2026-08-26 (F1, F2, F4, F6 now closed; F3 and F5 remain open).** Third themed round of the routed-residue triage: the validation/foreclosure family. One stated rule closes both findings, added to the gate-discipline paragraph so it is declared once and inherited everywhere. **The unreachability claims are now earned (F1):** step 1 in all four actions validates against the surfaces that will carry each value — the substrate's `reference_length_cap` adopted for actor references, and the payload budget checked over constructed event data **sized with declared minted-id width bounds** (`invitation_token`, `party_id`, `credential_id`, `event_id` — the substrate's `attestation_id_width` move), so payloads carrying ids minted mid-call are sizable before anything commits. **The observed arm has one landing (F2):** a post-validation `record_action` `invalid-request` is a caps-vs-instance deployment fault — surfaced as `rejected(storage-failure)` with a hard alert naming the true cause — stated once in the gate discipline and carried by every "unreachable per step 1" site. No caller signature changed. **Gate deferred, stated rather than skipped:** with FC7-F3 (check 2 vs lawful rotation) and FC7-F5 (the unwired authorization claims) known open, a gate cannot return zero foundational; these closures are verified at the pattern's full-residue closing round.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed (the invariant count held at five). (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Status (7 terms): 4 Operations — the four onboarding actions ([Invite], [Onboard], [Decline], [Revoke]); and 3 Members — the composition-introduced Audit Trail event types that record the arc ([Onboarding Invitation Accepted], [Onboarding Completed], [Onboarding Interrupted]). Every own-action prose reference is linked; the action names are also `### name` section headings, so a marker resolves to the action's own section (the anchors collide by construction — the login / reserve-from-pool precedent — and the linter does not check anchor targets). **`decline` / `revoke` disambiguation:** these names are *also* Invitation's constituent methods; the Composes *"Surface used"* list keeps `initiate` / `accept` / `decline` / `revoke` backticked as the constituent surface, while the composition's own action refs are linked. **No Type card:** the composition owns no cross-atom state — the Audit Trail *is* the map (Composition state). The `invitation.*` event types and the parameterized `invitation-invalid(...)` rejection stay backticked as wire values. Survivors left backticked: the fenced signatures and example ids; the `invitation.initiate` / `invitation.declined` / `invitation.revoked` event types; every qualified constituent call (Invitation's `initiate` / `accept` / `decline` / `revoke`, Credential's `register`, Party Identity's `enroll`, Audit Trail's `record_action`) and the constituent states (`Pending` / `Accepted` / `Declined` / `Revoked` / `Expired`, `Unverified` / `Verified`); the relayed constituent tokens; and the generic/relayed rejections (`invalid-request`, `invalid-credential`, `storage-failure`, `recording-failure`, `not-known`). Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). (b) **Summary promoted from the top blockquote** — the file carried no `## Summary`, only the descriptive top blockquote; it was promoted to a `## Summary` at the top (subject named, split one-idea-per-paragraph, lossless), leaving the existing `**Composes:**` teaser line intact. (c) **Lineage collapsed** into a `<details markdown="block">` block (the `### Round 1`–`### Final Critique 4` subsections collapse inside). (d) **prose cut #5 — skipped (with reason):** the composition owns no emergent state machine — the invitation lifecycle (Pending → Accepted | Declined | Revoked | Expired) is the Invitation constituent's, and the composition's own logic is the fixed accept-gate → enroll → register → audit sequence already stated crisply in Composition logic and Invariant 1. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 5 — 2026-05-23`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (7 terms); five composition-level invariants preserved; the `.tla` model untouched — harness re-run green: `external-onboarding.tla` PASS (no buggy twin exists for this pattern).

</details>
