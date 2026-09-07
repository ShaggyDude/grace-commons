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

External Onboarding is the full arc of admitting an external entity to a system — invitation issued by an authenticated, attributed actor, accepted by the invitee (establishing the single identity binding), Party Identity enrolled in Unverified state, credential registered, every step attested in the Audit Trail.

The load-bearing emergent invariant is invitation-gates-enrollment: no Party Identity is created via this composition unless an Invitation's Accepted transition precedes it, and the Audit Trail completion record names the specific invitation, the accepting identity, the party record, and the credential in one tamper-evident entry.

Without the composition, any of these steps can occur independently, in any order, without a documented chain; the composition is what makes the chain mandatory and auditable.

**Composes:** [Invitation](../atoms/invitation.md) · [Credential](../atoms/credential.md) · [Party Identity](../atoms/party-identity.md) · [Audit Trail](./audit-trail.md)

---

## Intent

Every system that admits external parties — customers, collaborators, patients, counterparties — faces the same structural challenge: the invitation must be issued before the invitee exists in the system, yet the moment of acceptance is the moment at which the system must durably record who joined, establish their identity record, and register the credential they will use to authenticate. Those three obligations — serializing concurrent acceptance attempts, creating the party record, registering the credential — belong to different atoms. The question of what must happen when they meet, in what order, with what audit record binding the whole arc together, belongs to no single atom. It belongs to the composition.

External Onboarding wires the four constituent atoms into a single enforced onboarding boundary. The [Invite] action establishes the documented intent: an authenticated actor initiates an invitation, creating an audit-anchored record of who invited whom and to what context. Whether that actor was *permitted* to invite is not this composition's gate — its attempt record authenticates and attributes, and authorization is the above-composition obligation named in Edge cases (*Inviter and revoker authorization*). The [Onboard] action is the composition's load-bearing center: it calls `Invitation.accept` first — establishing the single-resolution serialization point — then `Party Identity.enroll`, then `Credential.register`, recording the full arc in the Audit Trail as a single named event that links invitation token, accepting identity reference, party record, and credential. The [Decline] and [Revoke] actions close the invitation on the other terminal paths, each attested in the Audit Trail.

The emergent invariant is invitation-gates-enrollment: no Party Identity is enrolled and no Credential registered via this composition unless an Invitation's `Accepted` transition precedes them — in the same onboarding call, or, on the resume arm, in the stopped arc that call re-enters. The Invitation atom's single-resolution invariant (at most one write to one of three stored terminal states per invitation — a lapsed invitation is shown `Expired` by derivation, never written — the transition atomic under concurrent attempts) is the mechanism that makes the gate hold under concurrent onboarding attempts for the same invitation — exactly one [Onboard] call clears the gate; all others receive `already-resolved(Accepted)` and create no constituent records — their attempt event is their only trace — unless they are the same acceptor re-entering a stopped arc past the bound, which is the resume arm, one resumer per token.

The second emergent property is the identity binding at accept, not at initiate. The `accepting_identity_ref` passed to `Invitation.accept` — a caller-supplied external reference identifying who is accepting, such as an email address or an external identity handle — is recorded permanently in the Invitation record at the moment of acceptance. The `party_id` produced by the downstream `Party Identity.enroll` call is then linked to that `accepting_identity_ref` in the Audit Trail completion record. The tracing path — from any enrolled Party Identity back to the specific Invitation that authorized its creation — runs through the Audit Trail: the completion event carries both the `invitation_token` and the `party_id`, making the chain reconstructable from records alone.

---

## Composes

- **[Invitation](../atoms/invitation.md)** — the lifecycle record of an invitation from `Pending` through **one write to one of three stored terminal states** (`Accepted`, `Declined`, `Revoked`); a lapsed invitation is *shown* `Expired` by the atom's read-time derivation, never written (its Invariant 12 — there is no `expire` action, no `expired_at` field, and no stored `Expired`), and a write attempted on a lapsed invitation is rejected with the distinct `expired` token, never `already-resolved(Expired)` (its Invariant 6). Provides the serialization gate via its single-resolution invariant: `Invitation.accept` is atomic under concurrent attempts; exactly one succeeds. Surface used: `initiate`, `accept`, `decline`, `revoke`, and `read` (the resume arm's state read and step 1's `resume_party_id` pre-check — Actions, [Onboard]). **What that gate serializes, and does not:** the single-resolution invariant serializes the one write to `Accepted` — *"under concurrent `accept` calls, exactly one commits the transition; all others receive `already-resolved(Accepted)`"* — and nothing after it, so two re-entries of an accepted arc are two callers the atom answers identically and cannot tell apart. The resume arm's own serialization is therefore this composition's obligation (Configuration, `per_token_serialization`), attributed to no constituent. **Instance posture and routing obligation, declared:** the composition maintains **exactly one dedicated Invitation instance**, and the deployment routes every lifecycle action on that instance — `initiate`, `accept`, `decline`, `revoke` — through this composition's four actions (the substrate's own exactly-one-instance discipline, applied here as a deployment obligation). Direct atom access to the instance, or invitations managed on other instances or through sibling patterns, sit outside this composition's audit claims — this is the membership criterion Generation acceptance's store-quantified checks assume, without which a lawfully-elsewhere invitation would be condemned as a recording failure. (Credential and Party Identity are shared surfaces by design — `Credential.rotate` and downstream verification run outside this composition — and no check quantifies over their stores in the store-to-records direction.)
- **[Credential](../atoms/credential.md)** — the durable binding between a principal and authentication material. Registered after Party Identity enrollment so the `principal_ref` is a valid `party_id`. Surface used: `register`, and `read` (filtered to a `principal_ref`) on the resume arm.
- **[Party Identity](../atoms/party-identity.md)** — the persistent, verifiable identity record for an external party. Enrolled in `Unverified` state; verification (the transition to `Verified`) is handled downstream by [Customer Onboarding](./customer-onboarding.md) or equivalent. Surface used: `enroll`, and `read` (an `enrolled_at` range — which the atom's own contract calls *"advisory wall-time metadata … under clock skew its result set is best-effort"* — widened both ends by `clock_skew_allowance` and filtered composition-side on exact fields) on the resume arm.
- **[Audit Trail](./audit-trail.md)** — the tamper-evident, attribution-stamped substrate recording every onboarding event. Every action that changes state in any of the three data-bearing atoms is recorded here. Surface used: `record_action` — consumed at its declared contract, `record_action(action_ref, actor_ref, credential, data) → event_id | rejected(invalid-credential | invalid-request | recording-failure(step))`, with the `(step)` payload carried on every transcription (Composition logic, *The substrate's arms, landed once*) — and the declared pass-through sequence-range read (Composition state). Event Log, Actor Identity, Retention Window, and Tamper Evidence are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms.

---

## Composition logic

Four actions form the onboarding boundary. Each wraps one or more constituent atom calls and produces an Audit Trail record.

**One gate discipline for all four actions.** Every state-changing action opens with an **attempt record** — an `Audit Trail.record_action` whose Actor Identity attestation, made inside the substrate's own declared surface, *is* the credential gate: an `invalid-credential` there stops the action before any Invitation write, and the attempt itself is auditable. (The substrate exposes no dry-run credential check, and none is needed — the attest is the check. An attempt refused at the gate lands no event; auditing *those* is the **Failed-Attempt Log** *(forthcoming)* pattern's business, as in the substrate's own edge case.) The action's outcome is then recorded by its own post-write event.

**The validation the gate rule rests on, stated once.** Each action's step 1 validates every caller string against the surfaces that will carry it: non-null, non-empty, and non-whitespace; each actor reference within the wired Audit Trail instance's `reference_length_cap` (the substrate's own caller-input rule, adopted at this layer so its `invalid-request` cannot fire on a reference this layer already passed); and the constructed data of every event the action will emit — on the fresh arc and the resume arm alike, the largest being [Onboarding Interrupted] with its `party_id`, `stage`, and `reason` (each of the last two one of a fixed token set) — within the instance's payload budget — **sized with the deployment's declared minted-id width bounds**, the maximum widths the wired constituents allocate for `invitation_token`, `party_id`, `credential_id`, and `event_id` (the substrate's own `attestation_id_width` move), so a payload carrying ids that do not exist yet at step 1 is sizable before anything commits. Under this rule the *caller-input* source of the record steps' `invalid-request` arm is foreclosed for validated inputs — but the arm itself is never unreachable, because the substrate has a second source for it that no caller validation touches (below).

**The substrate's arms, landed once.** Every `record_action` below is consumed at the substrate's declared contract — `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))` — and the `(step)` payload is load-bearing, never dropped: the substrate attests at its step 2, appends at its step 3, and places retention at its step 4, so `recording-failure(step-2)` and `recording-failure(step-3)` mean **the event is not in the log** (nothing, or an orphan attestation the substrate's own compensation owns), while `recording-failure(step-4)` means **the event is appended and attested** and only its retention placement failed — the substrate's Invariant 2 liveness arm owns that unretained event, and a retry from this composition would append a second one. The landings are therefore split by step, and each action's arms below cite this rule rather than restate it:

- **Attempt records (the gate, step 2 of every action).** `recording-failure(step)` on any step → `rejected(storage-failure(intent))`, stop — on the `step-4` arm the attempt event stands, which is harmless: attempt events are the record of a try and are not per-invitation signatures (Generation acceptance check 6), so a retried attempt lands a second one and nothing is owed. `invalid-request` → a deployment fault (either source, below), `rejected(storage-failure(intent))` with a hard alert naming the cause; whether the attempt event stands is immaterial for the same reason.
- **Post-write records (each action's record after its constituent commit).** `recording-failure(step-2 | step-3)` → the event is absent and the constituent write it was to record has committed; the action's declared gap landing applies (the signature Generation acceptance checks 5 and 6 enumerate), returned as `rejected(storage-failure(outcome))`. `recording-failure(step-4)` → the event **exists**; the action **proceeds as though the record landed** — returns its result, or continues to its next step — with a hard alert on the unretained event, never a retry. `invalid-request` → a deployment fault with **two sources the token does not distinguish**: the caps disagreement (the declared minted-id width bounds and the wired instance disagree — nothing appended) and the substrate's own retention-configuration fault (Retention Window's `invalid-policy` / `policy-not-found`, which Audit Trail routes onto this arm at its step 4 — **the event is appended**). The composition reads the tail back through the declared enumerate-and-filter read (Composition state), selecting the record's own `action_ref` and `invitation_token`, and lands as the `step-4` arm if the event is found and as the `step-2 | step-3` arm if it is not; a hard alert naming the true cause either way. `invalid-credential` on a post-write record is a rotation race — the same credential attested at the attempt moments earlier — and takes the same gap landing as `step-2 | step-3`, returned as `rejected(invalid-credential)` so the caller learns the true cause.

The composition's own `storage-failure(intent | outcome)` carries the **position** across the caller boundary, because the caller is the one who retries and cannot see the steps (§*A composition's own rejection arm carries the retry bit*): `intent` — no constituent has committed anything (the attempt event may stand, and owes nothing), so the whole action may be retried as written; `outcome` — the action's Invitation write has committed, and a retry of the action re-enters it rather than repeating it: as `already-resolved(state)` on [Decline] and [Revoke], as the resume arm on [Onboard] once the bound has elapsed, and as a fresh invitation on [Invite], the committed `Pending` one lapsing unreachable. The relayed constituent `storage-failure`s take the same position by the same test — Invitation's, refused with nothing written, is `intent`; Party Identity's and Credential's, refused after the acceptance committed, are `outcome`. Inside the action the substrate's `(step)` decides the landing; at the boundary the position rides the code.

**[Invite] wiring.** The inviter calls the composition with their actor credentials. The composition records the `invitation.initiate-attempt` gate event, calls `Invitation.initiate`, and, on success, records `invitation.initiated` in the Audit Trail naming the inviter, the invitee reference, and — because this record follows the constituent's success — the invitation token itself, which is what makes the records-alone token correlation in the forensics walk executable. The invitation token is returned so the inviter can deliver it to the invitee out-of-band (email link, QR (Quick Response) code, direct message).

**[Onboard] wiring — the load-bearing center.** The step order is fixed and non-negotiable:

1. Audit Trail record: `onboarding.accept-attempt` — the credential gate (the discipline above). An `invalid-credential` stops the call before any Invitation write.
2. `Invitation.accept(invitation_token, accepting_identity_ref)` — the serialization gate. If the gate refuses — the invitation was already resolved by a write (`already-resolved(Accepted | Declined | Revoked)`), its window has lapsed (the atom's derived-expiry `expired` rejection — the record stays `Pending` and reads `Expired` by projection, nothing written), or it is unknown — the entire call fails before any enrollment record is created. No Party Identity is enrolled; no Credential is registered; no identity is bound. The call returns `invitation-invalid(reason)`. **One exception, declared:** `already-resolved(Accepted)` where the stored `accepting_identity_ref` equals the one supplied, the acceptance is older than the deployment's `onboarding_completion_bound` by at least `clock_skew_allowance` (Configuration — the stamp is Invitation's seam's and the bound this seam's, so the two are compared only under the declared allowance), and the acceptance is inside the wired trail's retention horizon (`audit_trail_retention_policy`), is not a refusal but the **resume arm** — the caller is re-entering an arc that stopped after its gate cleared, and the call continues, one resumer per token under the deployment's `per_token_serialization`, from the stage the records establish (Actions, [Onboard], *Resume*). A younger acceptance is in flight and is refused as before; so is one whose events may have lawfully aged out.
3. Audit Trail record: [Onboarding Invitation Accepted] — records the gate clearing: `{invitation_token, accepting_identity_ref, document_type, document_ref}` — the documents recorded here are what a resume matches the Party Identity store against, so a dead arc's party is found by what the arc recorded, not by what a resumer types.
4. `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id`. The party is created in `Unverified` state. If this fails (the atom's `invalid-request` or `storage-failure`), the composition writes `onboarding.interrupted` to the Audit Trail and relays the atom's rejection. The invitation is permanently Accepted; recovery is the resume arm (Edge cases, *Partial failure*).
5. `Credential.register(principal_ref: party_id, credential_material, credential_type, expires_at?)` → `credential_id`. The credential is bound to `party_id`. If this fails, the composition writes [Onboarding Interrupted] to the Audit Trail (naming the enrolled `party_id`) and relays the atom's rejection under its own name. The invitation is Accepted and the party is enrolled; recovery is the resume arm, which finds the party from the records.
6. Audit Trail record: [Onboarding Completed] — records the full arc: `{invitation_token, accepting_identity_ref, party_id, credential_id}`. If this record fails to write, the composition returns `storage-failure(outcome)` — the position telling the caller the arc has committed and is resumed, never re-run. The enrollment and credential exist; the completion record does not. The Generation-acceptance (GA) check for unrecorded completions detects this gap (see Generation acceptance, check 5).
7. Return `{party_id, credential_id}`.

**[Decline] wiring.** The invitee (or the system on their behalf) presents the invitation token. The composition records the `invitation.decline-attempt` gate event under the system service actor, calls `Invitation.decline`, then records `invitation.declined` in the Audit Trail. `Invitation.decline` does not record the decliner's identity (Invitation atom design); the Audit Trail records the timestamp and that the decline occurred, not who declined. If a deployment requires recording the decliner's identity, that is done in the `data` payload of the Audit Trail event and enforced above the atom layer.

**[Revoke] wiring.** The inviter or an administrator calls [Revoke] with their actor credentials. The composition records the `invitation.revoke-attempt` gate event, calls `Invitation.revoke`, then records `invitation.revoked` in the Audit Trail, attributing the revocation to the revoking actor.

**The step-order constraint is the composition's central contribution.** Neither `Party Identity.enroll` nor `Credential.register` is called unless `Invitation.accept` returned `accepted` — in this call, or in the stopped arc the resume arm re-enters after reading the invitation's stored `Accepted` state bound to the same acceptor. The Audit Trail substrate records both the moment the gate cleared and the subsequent enrollment and credential steps, so the full arc is traceable from records alone.

---

## Configuration

The composition holds no store and declares no service identity — it performs no unattended commits: every constituent write below is made inside a caller-authenticated invocation, including the resume arm, which is a re-invocation by an authenticated caller rather than a sweep. What it does declare is what its checks and its resume arm read against: a completion bound, a skew allowance, the trail's retention horizon, and the one serialization the resume arm needs. **Clock and ids, stated once.** `now` — the reading every bound below is read against — is injected at this composition's I/O seam per the Execution Contract's pipeline, one reading per invocation, never a parameter of any action and never read inside a step. Every other stamp this composition compares against — an invitation's `accepted_at`, a party's `enrolled_at`, a credential's `registered_at`, an event's `recorded_at` — is written by a constituent from its *own* seam, and this composition compares its reading with theirs only under `clock_skew_allowance`. Ids (`invitation_token`, `party_id`, `credential_id`, `event_id`) are minted at the constituents' seams; this composition mints none.

- **`onboarding_completion_bound`** — *Type:* a duration. The deployment's declared maximum for an [Onboard] or [Invite] invocation between its first constituent write and its last record — from `Invitation.accept` committing to the `onboarding.completed` (or `onboarding.interrupted`) record landing, and from `Invitation.initiate` committing to the `invitation.initiated` record landing — read against the seam clock the reading invocation began under. **Two readers spend it.** Generation acceptance checks 5 and 6 examine only acceptances, initiations, and events older than it plus `clock_skew_allowance` (below); a younger one may be in flight and is inconclusive, not a signature. The resume arm takes an `already-resolved(Accepted)` older than it by at least `clock_skew_allowance` as an arc that stopped and a younger one as an arc still running, which it refuses; it applies the same widened bound to a successor-less `onboarding.resume-intended` (R1). *Default:* none — a deployment must set it, and a bound shorter than the deployment's slowest conforming invocation makes both readers wrong in the unsafe direction (a running arc read as stopped is resumed beside itself).
- **`clock_skew_allowance`** — *Type:* a duration. The deployment-declared bound on the difference between this composition's seam clock and the clocks at Invitation's, Party Identity's, Credential's, and the substrate's seams. Wherever this composition compares a reading of its own against a stamp another seam wrote — step 3's *acceptance older than the bound*, R1's in-flight and horizon edges, R2's `enrolled_at` window, and every cross-store comparison the Generation acceptance standing rule makes — the comparison runs under this allowance, **widened symmetrically**, and **narrows** a decision rather than making one: the resume arm errs toward reading an arc as still running, the horizon edge toward refusing, and R2's window admits candidates it then decides on exact fields (§*A stamp from another seam never decides a write alone*). Party Identity's own contract calls its `enrolled_at` range *best-effort under skew*; this entry is what turns that caveat into a bound this composition can write under. *Default:* none — a deployment must set it, and a skew wider than the declared allowance is outside the resume arm's duplicate-freedom claim exactly as a bound shorter than the slowest invocation is outside the bound's; check 7 is where either shows.
- **`audit_trail_retention_policy`** — the retention policy the wired Audit Trail instance places every onboarding event under (set once on the instance; `record_action` takes no per-call retention argument). Its horizon is the **upper edge** of the resume arm and of every trail-walking check: past it the arc's events are lawfully destroyed, their payloads unreadable, and the survivors — the undeletable Invitation, Party Identity, and Credential records and the attestation fields the purge preserves — are truth-bearing evidence an auditor reports on, never an arc a caller re-runs (R1; Generation acceptance, *Retention horizon*). The policy must outlast the longest interval a deployment allows between an acceptance and its resumption; an acceptance older than the horizon cannot be resumed through this composition at all. *Default:* none.
- **`per_token_serialization`** — an **instance capability requirement**: a deployment-supplied mutual exclusion keyed by `invitation_token`, spanning every node the composition runs on, that [Onboard] holds from `Invitation.accept` committing through its return on a fresh arc, and from R1's first read through its return on the resume arm. Invitation's gate serializes the one write to `Accepted` and nothing after it (*Composes*); no constituent here declares a lease; and the resume arm is a look-then-write compensator — it reads the trail and the Party Identity store and then enrolls, registers, and records — so two resumers with the same acceptor, both past the bound, would each find no party and each enroll one. The section is what makes R1's and R2's reads decisive: every pre-check is re-read under it, never before it, and a stalled original invocation that still holds it is refused rather than raced (R1's unavailable arm). **Its semantics, stated:** the section is **released on the invocation's return or death**; where the host implements it as a **lease**, the lease is at least `onboarding_completion_bound + clock_skew_allowance` long and its **expiry is the invocation's terminus** — an invocation whose lease has expired has yielded the arc, and the widened bound is exactly the point past which a resumer may hold it. **Every write after the invocation's first is made only while the section is held:** an invocation that finds its section lost re-takes it before any pre-check and makes no write it cannot take the section for — on the fresh arc, by re-running R1–R2 as a resume of its own arc (step 3's `accepted` arm); on the resume arm, by re-running R1 from its first read. This composition runs no scan, so no liveness inequality gains a hold term; what the lease bounds is how long a stalled-but-alive holder can keep a resumer out — at most the lease length, after which the holder has yielded (§*A compensator is exclusive*). *Default:* none — a deployment must supply it; one whose section can be lost while its holder lives, or that does not span its nodes, has the second writer check 7 exists to report, and it is a conformance failure there, not a tolerated residue.

---

## Composition state

This composition introduces no cross-atom persistent state beyond what the constituent atoms and the Audit Trail substrate maintain — **Contract classification: conforming, no stored composition state** ([`execution-contract.md`](../execution-contract.md) §Composition state). There is no composition-owned index or map.

The tracing from any Party Identity record back to the specific Invitation that authorized its creation runs through the Audit Trail: the `onboarding.completed` event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` in its data payload. An investigator querying "what invitation authorized the creation of party P?" finds the `onboarding.completed` event whose `party_id` field matches P and reads `invitation_token` from the event data. **The retrieval mechanism is named, not assumed:** the substrate's declared query surface is a sequence-range enumeration, not a payload-field lookup, so every payload-keyed retrieval in this spec — here and in Generation acceptance — is an **enumerate-and-filter**: read the trail through the substrate's declared list surface and filter on the event data in the auditor's or composition's own code (the same move the substrate uses for its own rebuilds). A deployment wanting an indexed payload lookup composes the forthcoming **Reverse Index** pattern over the trail; nothing here depends on it.

The absence of a composition-owned map is intentional: the Audit Trail is already the tamper-evident, attributable, retention-bounded record required by the regulated adversarial scenarios. A separate map would duplicate that record under weaker integrity guarantees. The Audit Trail is the map.

---

## Actions

### invite

Initiates an invitation from an authenticated, attributed actor to an external party, creating an audited record of the invitation event. The action does not check that the actor is permitted to invite (Edge cases — *Inviter and revoker authorization*).

```
invite(
  inviter_ref,
  invitee_ref,
  context,
  ttl,
  actor_credential
) →
    invitation_token
  | rejected(invalid-request | invalid-credential | storage-failure(intent | outcome))
```

**Arguments**

- `inviter_ref` — opaque reference to the internal actor issuing the invitation. Used as `inviter_ref` in `Invitation.initiate` and as `actor_ref` in the Audit Trail record. Non-null, non-empty.
- `invitee_ref` — opaque reference to the intended invitee. Optional (may be null if the invitee has no system identity yet). Passed through to `Invitation.initiate`.
- `context` — opaque descriptor of what the invitee is being invited to join (organization, workspace, role). Non-null, non-empty.
- `ttl` — time-to-live: the invitation validity duration. Null uses the deployment default. Positive if supplied.
- `actor_credential` — the inviter's Actor Identity credential, used to produce the Audit Trail attestation. Verified by the attempt record's attest (the gate discipline) before any invitation is created.

**Steps**

1. Validate inputs per the gate discipline's validation rule (Composition logic): `inviter_ref`, `context`, and (if supplied) `ttl` well-formed, references within the instance's `reference_length_cap`, and the constructed event data of both records below — the step-4 payload sized with the declared `invitation_token` width bound — within the payload budget. Any violation → `rejected(invalid-request)`. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.initiate-attempt", actor_ref=inviter_ref, credential=actor_credential, data={invitee_ref, context, ttl})` → `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))` — the credential gate.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop.
   - `recording-failure(step)` → `rejected(storage-failure(intent))`. Stop (the attempt-record landing — *The substrate's arms, landed once*).
   - `invalid-request` → a deployment fault, `rejected(storage-failure(intent))` with a hard alert (the same rule).
3. Call `Invitation.initiate(inviter_ref, invitee_ref, context, ttl)` → `invitation_token | rejected(invalid-request | storage-failure)`.
   - `invalid-request` → `rejected(invalid-request)`. Stop. (The attempt record in step 2 stands as the record of the try.)
   - `storage-failure` → `rejected(storage-failure(intent))`. Stop — the constituent commits nothing on this arm.
4. Call `Audit Trail.record_action(action_ref="invitation.initiated", actor_ref=inviter_ref, credential=actor_credential, data={invitation_token, invitee_ref, context, ttl})` → `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))` — the post-success record, carrying the token — the records-alone correlation surface the forensics scenarios walk.
   - `recording-failure(step-2 | step-3)` → `rejected(storage-failure(outcome))`. The invitation exists in `Pending` but its `invitation.initiated` record is absent **and the token was not returned to the caller**: no caller holds the bearer token, so through this composition's actions the invitation cannot be accepted and lapses at its `expires_at` — an actor with direct read access to the Invitation store could still read the token, which the routing obligation (*Composes*) places outside this composition's claims. The inviter retries with a fresh [Invite]. The gap is GA check 6's invitation-without-`invitation.initiated`-event signature.
   - `recording-failure(step-4)` → the record exists; proceed to step 5 with a hard alert on the unretained event (*The substrate's arms, landed once*).
   - `invalid-request` → the deployment-fault read-back (the same rule): found → as `step-4`; absent → as `step-2 | step-3`.
   - `invalid-credential` → a rotation race (the same credential attested at step 2 moments earlier); same landing and same detectable gap as `recording-failure(step-2 | step-3)`, returned as `rejected(invalid-credential)` so the caller learns the true cause.
5. Return `invitation_token`.

**Note on step ordering.** The attempt record (step 2) is written before `Invitation.initiate` — it authenticates the inviter and records the intent even if the invitation store fails; the `invitation.initiated` record (step 4) follows the constituent's success, which is the only point the token exists to be recorded. An `invitation.initiate-attempt` event without a following `invitation.initiated` marks a failed or interrupted initiate (not correlatable to a token, by construction — no token was minted); an Invitation record without its `invitation.initiated` event marks a post-initiate recording failure or crash. GA check 6 enumerates the second signature.

---

### onboard

Accepts an invitation and, in one enforced sequence, enrolls the invitee as a Party Identity and registers their credential. The single serialization gate is `Invitation.accept`; no enrollment or registration occurs unless it returned `accepted` — in this call, or in the stopped arc the resume arm re-enters (*Resume*).

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
  actor_credential,
  resume_party_id?
) →
    {party_id, credential_id}
  | rejected(
      invalid-request
    | invalid-credential
    | invitation-invalid(already-resolved(state) | not-known | expired)
    | onboarding-indeterminate(candidates)
    | duplicate-active-credential
    | storage-failure(intent | outcome)
    )
```

**Arguments**

- `invitation_token` — the bearer token identifying the invitation to accept.
- `accepting_identity_ref` — a caller-supplied opaque reference identifying who is accepting the invitation (e.g., an email address, an external identity handle, a pre-registration ID). This is the permanent binding written to the Invitation record at acceptance time. Non-null, non-empty. Does not need to be a `party_id` or any system-internal reference; it is the caller's external correlator.
- `name`, `date_of_birth`, `document_type`, `document_ref` — Party Identity enrollment fields. Subject to Party Identity's validation rules.
- `credential_type`, `credential_material`, `expires_at?` — Credential registration fields. Subject to Credential's validation rules.
- `enrolling_actor_ref` — the internal actor (admin, onboarding service, system account) performing the enrollment on behalf of the invitee. This actor is the Audit Trail attribution subject — not the invitee, who has no system credential yet. Non-null, non-empty.
- `actor_credential` — the `enrolling_actor_ref`'s Actor Identity credential, used for Audit Trail attestation.
- `resume_party_id?` — supplied only on a resume the composition previously refused as `onboarding-indeterminate(candidates)`: the `party_id`, chosen by an administrator from the named candidates, that the interrupted arc enrolled. Must be one of the candidates the refusal named for this token (*Resume*, step R3); any other value is `rejected(invalid-request)` at R3, and a value supplied on a fresh arc — an invitation still stored `Pending` — is `rejected(invalid-request)` at step 1, before the gate, with nothing written.

**Steps**

1. Validate inputs per the gate discipline's validation rule (Composition logic): required fields present and well-formed, references within the instance's `reference_length_cap`, and every event payload this action will emit — the completion, interrupted, and resume-intended records sized with the declared `party_id` and `credential_id` width bounds — within the payload budget. Any violation → `rejected(invalid-request)`. Stop. **Where `resume_party_id` is supplied**, read the invitation now (`Invitation.read(filter)` by token — a read, before the gate, committing nothing): a record stored `Pending` names no arc this call could resume, so the value is malformed → `rejected(invalid-request)`. Stop, nothing written. Any other stored state falls through to step 3, which lands its own code, and R3 validates the value against the candidates.
2. Call `Audit Trail.record_action(action_ref="onboarding.accept-attempt", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, document_type, document_ref})` → the credential gate (the discipline in Composition logic): the attest inside the substrate's own declared surface is the verification — no dry-run mode exists, and none is needed.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop. (No invitation is accepted, no constituent record is created; the refused attempt lands no event — Failed-Attempt Log territory.)
   - `recording-failure(step)` → `rejected(storage-failure(intent))`. Stop (the attempt-record landing — *The substrate's arms, landed once*).
   - `invalid-request` → a deployment fault, `rejected(storage-failure(intent))` with a hard alert (the same rule).
3. Call `Invitation.accept(invitation_token, accepting_identity_ref)` → `accepted | rejected(invalid-request | expired | already-resolved(state) | not-known | storage-failure)`.
   - `accepted` → **take the per-token section** (Configuration, `per_token_serialization`), held through step 8's return and released at every stop below. Unavailable → `rejected(storage-failure(outcome))`, stop, nothing more written: the acceptance has committed, the arc is check 5's first signature until it is resumed, and the position tells the caller so. Every write from step 4 on is made only while the section is held. An invocation that finds its section lost — the host's lease expired, which is its terminus: it has yielded the arc, and past `onboarding_completion_bound + clock_skew_allowance` a resumer may hold it — **re-takes the section and re-runs R1–R2 as a resume of its own arc before any further write**, taking their dispositions as written with one adoption: an `onboarding.completed` for the token is *proceed as landed* — the invocation returns that record's `{party_id, credential_id}` as its own outcome, since a completion the arc reached under another writer is the outcome this caller asked for. Then continue to step 4.
   - `rejected(expired)` → `rejected(invitation-invalid(expired))`. Stop. The atom's derived-expiry rejection: the record is still stored `Pending`, reads `Expired` by projection, and nothing was written.
   - `rejected(already-resolved(Accepted))` → read the invitation (`Invitation.read(filter)` by token). If its stored `accepting_identity_ref` equals the supplied one **and** its `accepted_at` is older than `onboarding_completion_bound + clock_skew_allowance` against the seam clock this invocation began under — `accepted_at` is Invitation's seam's stamp and the bound this seam's, so the comparison runs under the declared allowance and errs toward reading the arc as still running (§*A stamp from another seam never decides a write alone*) — take the **resume arm** (*Resume*, below) — the caller is re-entering an arc that stopped after its gate cleared; the arm's own first act is to bound the arc above (R1). Otherwise — a different acceptor, or an acceptance still inside the widened bound (the concurrent racer, in flight) — `rejected(invitation-invalid(already-resolved(Accepted)))`. Stop.
   - `rejected(already-resolved(Declined))` → `rejected(invitation-invalid(already-resolved(Declined)))`. Stop.
   - `rejected(already-resolved(Revoked))` → `rejected(invitation-invalid(already-resolved(Revoked)))`. Stop.
   - `rejected(not-known)` → `rejected(invitation-invalid(not-known))`. Stop.
   - `rejected(invalid-request)` → `rejected(invalid-request)`. Stop. (Step 1's validation makes this unreachable for well-formed inputs; the atom's own guard is the backstop.)
   - `rejected(storage-failure)` → `rejected(storage-failure(intent))`. Stop — the record remains `Pending` by the atom's own contract.
   - In all rejection cases: no permanent records are created beyond the step-2 attempt event, which stands as the record of the try.
4. Call `Audit Trail.record_action(action_ref="onboarding.invitation-accepted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, document_type, document_ref})` → `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))`.
   - `recording-failure(step-2 | step-3)` → `rejected(storage-failure(outcome))`. Stop. The invitation is Accepted but no acceptance record exists. This gap is detectable: any Invitation in stored `Accepted` state without a corresponding `onboarding.invitation-accepted` Audit Trail event is an unresolved interruption (GA check 5's first signature) — and it is the arc the resume arm re-enters from its first stage.
   - `recording-failure(step-4)` → the record exists; proceed to step 5 with a hard alert on the unretained event (*The substrate's arms, landed once*).
   - `invalid-request` → the deployment-fault read-back (the same rule): found → as `step-4`; absent → as `step-2 | step-3`.
   - `invalid-credential` → a rotation race over a committed acceptance (the same credential attested at step 2); `rejected(invalid-credential)`, same detectable gap.
5. Call `Party Identity.enroll(name, date_of_birth, document_type, document_ref, enrolling_actor_ref)` → `party_id | rejected(invalid-request | storage-failure)`.
   - `invalid-request` → write `Audit Trail.record_action(action_ref="onboarding.interrupted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, stage: "party-enrollment", reason: "invalid-request"})`, then `rejected(invalid-request)`. Stop.
   - `storage-failure` → write the `onboarding.interrupted` record (same full signature; stage: "party-enrollment"), then `rejected(storage-failure(outcome))`. Stop.
   - If the `onboarding.interrupted` record itself fails to land, the composition still returns the original rejection; the resulting gap — an `onboarding.invitation-accepted` with no subsequent `completed` *or* `interrupted` — is GA check 5's second signature.
6. Call `Credential.register(principal_ref=party_id, credential_material, credential_type, expires_at?)` → `credential_id | rejected(invalid-request | duplicate-active-credential | storage-failure)`.
   - Each arm → write `Audit Trail.record_action(action_ref="onboarding.interrupted", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, party_id, stage: "credential-registration", reason: <the atom's rejection>})`, then **relay the atom's rejection under its own name** — `rejected(invalid-request)`, `rejected(duplicate-active-credential)`, or `rejected(storage-failure(outcome))` — a caller fault, a state conflict, and an infrastructure fault are three different things and are not collapsed, and the position on the last tells the caller the acceptance has committed. Stop. The failed-interrupted-write rule of step 5 applies here too. **On the resume arm only**, `duplicate-active-credential` is not an interruption but the expected signal that the interrupted invocation registered the credential before it died: read it back (`Credential.read(filter)` filtered to `principal_ref = party_id` and the supplied `credential_type`, Active) and continue to step 7 with its `credential_id` — the credential the arc issued, whose material the interrupted caller supplied; the material presented on the resume is discarded, which the resume's return makes visible (the returned `credential_id` is the earlier one).
7. Call `Audit Trail.record_action(action_ref="onboarding.completed", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, party_id, credential_id})` → `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))`.
   - `recording-failure(step-2 | step-3)` → `rejected(storage-failure(outcome))`. Stop. The party is enrolled and the credential is registered, but the completion record is absent — GA check 5's second signature detects it, and the resume arm re-enters at this stage.
   - `recording-failure(step-4)` → the record exists; return `{party_id, credential_id}` with a hard alert on the unretained event (*The substrate's arms, landed once*).
   - `invalid-request` → the deployment-fault read-back (the same rule): found → as `step-4`; absent → as `step-2 | step-3`.
   - `invalid-credential` → the rotation race again; `rejected(invalid-credential)`, same gap.
8. Return `{party_id, credential_id}`.

**Resume — re-entering an arc that stopped after its gate cleared.** The gate is single-resolution, so the arc it opens can be completed only by re-entering it, never by accepting again. The resume arm is that re-entry: a caller-authenticated re-invocation (its own attempt record at step 2 is its gate) that establishes from the records where the arc stopped and **re-runs** the remaining steps under the caller's own identity — it never re-emits a record it cannot re-derive, and it never enrolls beside a party the arc already created without saying so. It is taken from step 3's `already-resolved(Accepted)` arm under the two conditions stated there (same acceptor; acceptance older than `onboarding_completion_bound` by at least `clock_skew_allowance`). **One resumer per token.** The gate that admitted the resumer has already fired — Invitation serializes the write to `Accepted` and nothing after it (*Composes*) — so two resumers with the same acceptor, both past the bound, are two callers no constituent can tell apart, and each of R1–R3 is a look-then-write pre-check that both would pass. The whole arm therefore runs inside the deployment's **per-`invitation_token` section** (Configuration, `per_token_serialization`), taken before R1's first read and released at the resume's return or on any refusal; every read below is made under it, never before it, and a stalled original invocation that still holds the section is refused, not raced — until its lease expires, which is its terminus (Configuration) (§*A compensator is exclusive*). The arm proceeds:

- **R1. Bound the arc, then establish the stage from the trail.** Take the section; **unavailable** — held by another resumer, by a living original whose lease has not expired, or not grantable by the host — → `rejected(storage-failure(intent))`, stop, nothing written by this resumer: retryable once the holder returns or its lease expires. **Upper edge first:** if the invitation's `accepted_at` lies **more than `audit_trail_retention_policy`'s horizon less `clock_skew_allowance` in the past** against this invocation's seam reading (Configuration — the stamp is Invitation's seam's, the reading this seam's, so the age errs toward refusing), the arc's events may have been lawfully destroyed and the trail cannot say whether it completed: `rejected(invitation-invalid(already-resolved(Accepted)))`, release, stop. Past the horizon an `onboarding.completed` whose payload the purge has made unreadable is not absent — it is purged, and a leg that read it as absent would complete the arc a second time; the survivors are the truth-bearing evidence an auditor reports on, never an arc a caller re-runs (§*A reconciliation is bounded at both ends*). Then enumerate-and-filter the trail (Composition state) to this token's events, in sequence order. An `onboarding.completed` → the arc finished; `rejected(invitation-invalid(already-resolved(Accepted)))`, release, stop — a second caller with the same acceptor is not a resumer. Otherwise take the **latest** of the token's `onboarding.interrupted` and `onboarding.resume-intended` events. A latest `onboarding.resume-intended` with no successor (no `onboarding.completed` or `onboarding.interrupted` after it in sequence) whose `recorded_at` is younger than `onboarding_completion_bound + clock_skew_allowance` is a resume in flight, or one that died inside the bound — the records cannot tell them apart: `rejected(invitation-invalid(already-resolved(Accepted)))`, release, stop, the same disposition a younger acceptance draws at step 3 for the same reason (a living resumer also holds the section, which is what keeps this branch a refusal rather than a race). An older successor-less `onboarding.resume-intended` is a resume that died, and it makes the stage **unrecorded** whatever the earlier records say — the dead resume may have enrolled a party before it wrote anything more — so R2 runs with that event as one of its anchors. Otherwise the latest `onboarding.interrupted`, if any, names the stage and (for `credential-registration`) the `party_id`; absence of `onboarding.interrupted`, `onboarding.resume-intended`, and `onboarding.invitation-accepted` alike is check 5's first signature (the acceptance record never landed); an `onboarding.invitation-accepted` with no successor is check 5's second signature (the stage is unrecorded). **Then fix the arc's recorded documents:** the `(document_type, document_ref)` pair on the token's `onboarding.invitation-accepted` event, or, where that record is absent, the pairs on the token's `onboarding.accept-attempt` events carrying this `accepting_identity_ref` (a set — a superset, in the safe direction). A resumer whose supplied `document_type` and `document_ref` are not among them is completing a different person's arc: `rejected(invalid-request)`, release, stop, nothing written. Under the section an `onboarding.resume-intended` pairs with the first `onboarding.completed` or `onboarding.interrupted` that follows it in sequence — exact, because one writer per token at a time is what the section supplies.
- **R2. Establish the party where the trail does not.** Where R1 yields no `party_id` and the stage is unrecorded, the invocation that died — the original, or a resume — may have enrolled a party before it did. Read Party Identity (`Party Identity.read(query)`, an `enrolled_at` range) over the **union of the arc's windows**: one window per anchor, the anchors being the invitation's `accepted_at` and the `recorded_at` of every `onboarding.resume-intended` for the token, each window `[anchor − clock_skew_allowance, anchor + onboarding_completion_bound + clock_skew_allowance]`, both ends inclusive — one read spanning the earliest lower edge to the latest upper edge is a superset of the union and serves. The anchors are stamped at Invitation's and the substrate's seams and `enrolled_at` at Party Identity's, which the atom itself calls *advisory wall-time metadata — under clock skew its result set is best-effort*; the widened range is therefore a **narrowing** read, and what decides is the exact-field filter run composition-side over it: records whose `(document_type, document_ref)` is among the **arc's recorded documents** (R1 — the values the trail recorded at the gate clearing or the attempts, never the resumer's inputs, which R1 has already required to match them) and whose `enrolling_actor_ref` is in the **arc's actor set** — the `actor_ref`s of the token's `onboarding.invitation-accepted` and `onboarding.resume-intended` events and, where the acceptance record is absent (check 5's first signature), of the token's `onboarding.accept-attempt` events, which carry the token in their payload (a superset that can only widen the candidate set toward `onboarding-indeterminate`, never narrow it toward a silent second enrollment). The resumer's own `enrolling_actor_ref` is **not** the filter: the arc may have been started by one actor and is being completed by another — an administrator finishing what a service account began, the edge case's own recovery — and a filter on the resumer's identity would find nothing and enroll again. Zero matches → no party; the resume enrolls. Exactly one → the arc's party, resumed from step 6. More than one → `rejected(onboarding-indeterminate(candidates))` naming every matching `party_id`, release, stop: the composition does not choose among parties that are, by their fields, the same person enrolled twice inside one arc — an administrator does, and re-invokes with `resume_party_id` set to the chosen one (R3). No constituent write precedes this refusal. A skew wider than the declared allowance is outside this read's claim, as a bound shorter than the slowest invocation is outside the bound's; check 7 is the records-side test that reports the duplicate either would let through.
- **R3. Honor `resume_party_id`.** Where supplied, it must be among the candidates R2 would name for this token (the same read, re-run under the section); otherwise `rejected(invalid-request)`, release, stop. Where it is, it is the arc's party and the resume continues from step 6.
- **R4. Record the resumption before any constituent commit.** Write `Audit Trail.record_action(action_ref="onboarding.resume-intended", actor_ref=enrolling_actor_ref, credential=actor_credential, data={invitation_token, accepting_identity_ref, document_type, document_ref, resumed_from_stage, party_id?})` — the plan: the stage the records established, the arc's recorded documents (re-recorded so a later resume matches against a record that survives even if the acceptance record never landed), and the party the resume will continue with, if one. Its arms are the post-write landings (*The substrate's arms, landed once*): `recording-failure(step-2 | step-3)` and `invalid-credential` → the record is absent; `rejected(storage-failure(intent))` and `rejected(invalid-credential)` respectively, release, stop — this resume committed nothing and is retried as a whole; `recording-failure(step-4)` → the record **exists**; proceed to R5 as landed, with a hard alert on the unretained event, never a retry; `invalid-request` → the deployment-fault read-back: found → as `step-4`; absent → as `step-2 | step-3`.
- **R5. Re-run from the established stage.** If the acceptance record is absent (R1's first signature), write step 4 now — the record is re-derivable in full from the Invitation record (`invitation_token`, `accepting_identity_ref`), so this is re-derivation, not fabrication — under step 4's arms. Then steps 5 through 8 as written, under the section and releasing it at return, skipping step 5 where a party is established and taking step 6's resume-only `duplicate-active-credential` reading where the credential already exists. The `onboarding.completed` record the resume writes is the arc's completion; its `actor_ref` is the resumer's, and the `onboarding.resume-intended` event preceding it is what tells a reader the arc was completed by a re-entry rather than in one pass.

---

### decline

Records an invitee's deliberate refusal of an invitation and attests the event in the Audit Trail.

```
decline(invitation_token, service_actor_ref, actor_credential) →
    declined
  | rejected(invalid-request | invalid-credential | invitation-invalid(already-resolved(state) | not-known | expired) | storage-failure(intent | outcome))
```

**Arguments**

- `invitation_token` — the bearer token identifying the invitation to decline.
- `service_actor_ref` — the system service account used as the Audit Trail attribution actor. `Invitation.decline` does not record the decliner's identity; the Audit Trail records the event against the service account. Deployments that require the decliner's identity to be recorded supply it in the Audit Trail event data payload above the composition layer.
- `actor_credential` — the service account's Actor Identity credential.

**Steps**

1. Validate inputs per the gate discipline's validation rule (references within the `reference_length_cap`; constructed event data within the payload budget) → `rejected(invalid-request)` if invalid. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.decline-attempt", actor_ref=service_actor_ref, credential=actor_credential, data={invitation_token})` — the credential gate.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop, nothing written. (This is the arm the signature declares; the gate is what produces it.)
   - `recording-failure(step)` → `rejected(storage-failure(intent))`. Stop (the attempt-record landing — *The substrate's arms, landed once*).
   - `invalid-request` → a deployment fault, `rejected(storage-failure(intent))` with a hard alert (the same rule).
3. Call `Invitation.decline(invitation_token)` → `declined | rejected(expired | already-resolved(state) | not-known | storage-failure)`.
   - `expired` → `rejected(invitation-invalid(expired))`. Stop. The atom's derived-expiry rejection — the record stays `Pending`, reads `Expired` by projection, and a lapsed invitation needs no decline.
   - `already-resolved(state)` → `rejected(invitation-invalid(already-resolved(state)))`. Stop.
   - `not-known` → `rejected(invitation-invalid(not-known))`. Stop.
   - `storage-failure` → `rejected(storage-failure(intent))`. Stop — the constituent commits nothing on this arm.
4. Call `Audit Trail.record_action(action_ref="invitation.declined", actor_ref=service_actor_ref, credential=actor_credential, data={invitation_token})` → `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))`.
   - `recording-failure(step-2 | step-3)` → `rejected(storage-failure(outcome))`. (The invitation is Declined but the record is absent; a retry lands `already-resolved(Declined)`. GA check 6 detects unattested terminal transitions.)
   - `recording-failure(step-4)` → the record exists; return `declined` with a hard alert on the unretained event (*The substrate's arms, landed once*).
   - `invalid-request` → the deployment-fault read-back (the same rule): found → as `step-4`; absent → as `step-2 | step-3`.
   - `invalid-credential` → a rotation race over the committed decline (the same credential attested at step 2 moments earlier); `rejected(invalid-credential)`, the same check-6 gap.
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
  | rejected(invalid-request | invalid-credential | invitation-invalid(already-resolved(state) | not-known | expired) | storage-failure(intent | outcome))
```

**Steps**

1. Validate inputs per the gate discipline's validation rule → `rejected(invalid-request)` if `revoked_by_ref`, `reason`, or `actor_credential` is absent or malformed, a reference exceeds the `reference_length_cap`, or the constructed event data exceeds the payload budget. Stop.
2. Call `Audit Trail.record_action(action_ref="invitation.revoke-attempt", actor_ref=revoked_by_ref, credential=actor_credential, data={invitation_token, reason})` — the credential gate.
   - `invalid-credential` → `rejected(invalid-credential)`. Stop, nothing written.
   - `recording-failure(step)` → `rejected(storage-failure(intent))`. Stop (the attempt-record landing — *The substrate's arms, landed once*).
   - `invalid-request` → a deployment fault, `rejected(storage-failure(intent))` with a hard alert (the same rule).
3. Call `Invitation.revoke(invitation_token, revoked_by_ref, reason)` → `revoked | rejected(invalid-request | expired | already-resolved(state) | not-known | storage-failure)`.
   - `expired` → `rejected(invitation-invalid(expired))`. Stop. A lapsed invitation already reads `Expired` by the atom's projection and needs no withdrawal; nothing is written.
   - `already-resolved(state)` → `rejected(invitation-invalid(already-resolved(state)))`. Stop.
   - `not-known` → `rejected(invitation-invalid(not-known))`. Stop.
   - `invalid-request` → `rejected(invalid-request)`. Stop. (Step 1 forecloses it for well-formed inputs; the atom's guard is the backstop.)
   - `storage-failure` → `rejected(storage-failure(intent))`. Stop — the constituent commits nothing on this arm.
4. Call `Audit Trail.record_action(action_ref="invitation.revoked", actor_ref=revoked_by_ref, credential=actor_credential, data={invitation_token, reason})` → `event_id | rejected(invalid-credential | invalid-request | recording-failure(step))`.
   - `recording-failure(step-2 | step-3)` → `rejected(storage-failure(outcome))`. (Invitation is Revoked but unattested; a retry lands `already-resolved(Revoked)`. GA check 6 detects this gap.)
   - `recording-failure(step-4)` → the record exists; return `revoked` with a hard alert on the unretained event (*The substrate's arms, landed once*).
   - `invalid-request` → the deployment-fault read-back (the same rule): found → as `step-4`; absent → as `step-2 | step-3`.
   - `invalid-credential` → the rotation race over the committed revocation; `rejected(invalid-credential)`, the same check-6 gap.
5. Return `revoked`.

---

## Composition-level invariants

**Invariant 1 — Invitation gates enrollment.** No `Party Identity.enroll` call is made via the [Onboard] action unless the invitation named by `invitation_token` is in stored `Accepted` state, bound to the supplied `accepting_identity_ref`, as established in the same call — by `Invitation.accept` returning `accepted`, or, on the resume arm, by the constituent's own record read after `already-resolved(Accepted)` (*Resume*). No Party Identity is enrolled and no Credential registered via this composition without a preceding successful invitation acceptance, and a resumed arc enrolls beside no party the arc already created — **conditional on the deployment's declared `clock_skew_allowance` and `per_token_serialization` holding** (Configuration): R2's read, widened by the allowance and decided on exact fields, with the `onboarding-indeterminate` refusal where it cannot decide, is what keeps a dead arc's party from being enrolled a second time, and the section, one resumer per token, is what keeps two live resumers from enrolling once each; check 7 is where a breach of either shows.

**Invariant 2 — Identity binding at accept, not at initiate.** The `accepting_identity_ref` that permanently identifies who accepted the invitation is supplied at `Invitation.accept` call time, not at `Invitation.initiate` time. The inviting actor makes no binding commitment about the invitee's identity at initiation; the identity binding is the invitee's act at acceptance time.

**Invariant 3 — Credential-follows-party.** `Credential.register` is called only after `Party Identity.enroll` succeeds, and `principal_ref` in the credential is always the `party_id` produced by the enrollment in the same arc — the same [Onboard] call, or the stopped arc the resume arm completes, whose party R1 and R2 establish from the records. A credential registered via this composition always has a corresponding Party Identity record as its subject.

**Invariant 4 — Audit coverage as safety plus detectability.** Every terminal state change in the Invitation lifecycle that passes through this composition — `Accepted`, `Declined`, `Revoked` — either has its corresponding Audit Trail event, or is detectable as a **named gap signature** from the records alone: a stored-`Accepted` invitation without its `onboarding.invitation-accepted` event; an `onboarding.invitation-accepted` without a subsequent `onboarding.completed` or `onboarding.interrupted` for the same token; a `Declined` or `Revoked` invitation without its event; an Invitation record without its `invitation.initiated` event. GA checks 5 and 6 enumerate exactly these signatures — the claim is not that a recording step cannot fail (each action's arms admit it), but that no terminal transition through this composition is *silently* invisible: the absent record is itself detectable evidence. The claim and its signatures quantify **within the configured retention horizon**: an arc whose events have been lawfully purged reads as destruction (the substrate's Retention Window records in *Purged* state), never as a recording failure — the GA standing rules carry the same bound. An [Onboard] call that clears the gate produces at minimum its `onboarding.accept-attempt` and `onboarding.invitation-accepted` records and, on success, an `onboarding.completed` record (a call refused at or before the gate produces the attempt record alone, or nothing); on partial failure, an `onboarding.interrupted` record names the stage at which the sequence stopped, where that record itself could land; a resumed arc additionally carries the `onboarding.resume-intended` record that preceded its re-run, which is how a reader tells a completion reached by re-entry from one reached in a single pass. A token carries at most one `onboarding.completed` and names one `party_id` across its events (check 7); a second of either is a second writer, which the per-token section forecloses and check 7 reports.

**Invariant 5 — Completion record names the full arc.** The `onboarding.completed` Audit Trail event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}` as its data payload. From this single record, an investigator can traverse the full arc: the Invitation record (by `invitation_token`), the Party Identity record (by `party_id`), and the Credential record (by `credential_id`). No correlation index is required — the traversal is a record-by-record lookup keyed by the event's own fields. The traversal claim holds within the configured retention horizon; past it, the purged completion event's payload is lawfully unreadable, and the surviving attestation fields plus the undeletable constituent records are the post-horizon evidence surface.

---

## Standards

*Anchors: GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Articles 6–7 (lawful basis for processing at invitation and acceptance time); HIPAA (US Health Insurance Portability and Accountability Act) §164.312(a)(1) (access control — invitation-based provisioning as a covered access-granting event) + §164.312(d) (person or entity authentication — credential registration at onboarding); SOC 2 (Service Organization Control 2 — an audit standard for service-provider security controls) CC6.2 (prior to issuing system credentials, new internal and external users are registered and authorized); NIST (National Institute of Standards and Technology) SP 800-63A (identity enrollment and identity proofing — the enrollment arc); SCIM 2.0 RFC 7644 (System for Cross-domain Identity Management — the invite-then-provision flow); FATF (Financial Action Task Force — the international anti-money-laundering standard-setter) Recommendations 10–12 (customer due diligence at onboarding — Party Identity in Unverified state is the enrollment record the regulator requires; verification belongs to Customer Onboarding).*

**GDPR Articles 6–7** require a lawful basis for processing personal data. The [Invite] action creates the first processing record: the system holds `invitee_ref` and processes data about the invitee from that moment. The [Onboard] action creates the `accepting_identity_ref` binding and the Party Identity enrollment — the data subject's active engagement with the system. The Audit Trail records both as the GDPR Article 5(2) accountability records.

**SOC 2 CC6.2** requires that prior to issuing system credentials, new users are registered and authorized. The composition supplies the *registration* half and the *ordering* structurally: `Party Identity.enroll` (registration) precedes `Credential.register` (credential issuance), and both are preceded by `Invitation.accept`, whose `invitation.initiated` record attributes the invitation to an authenticated inviting actor. The *authorization* half — that the inviting actor was permitted to admit this user — is not something this composition checks or records: its gate verifies the inviter's credential and attributes the act, and whether the inviter held the authority is the composed Permissions instance's record (Edge cases — *Inviter and revoker authorization*). A CC6.2 claim rests on both records together, and a deployment that wires no authorization gate above [Invite] has the ordering and the attribution but not the authorization.

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

**Regulator audit.** A HIPAA compliance officer asks: *"Can you prove that every user who currently has access to the system was admitted via a documented invitation from an identified, authenticated internal actor — and that the actor was permitted to admit them?"* The auditor queries the Audit Trail for all `onboarding.completed` events. Each event carries `{invitation_token, accepting_identity_ref, party_id, credential_id}`. For each `party_id` in the system with an active credential, the auditor confirms a corresponding `onboarding.completed` event exists in the Audit Trail (Invariant 4) — walking the active credential's rotation chain back through predecessor records to the `credential_id` the event names, since the credential registered at onboarding has usually been rotated since (Generation acceptance check 2). The Invitation record for each `invitation_token` names the `inviter_ref` — the actor whose credential the `invitation.initiate-attempt` record verified. Invariant 1 (invitation gates enrollment) is the structural guarantee: the `onboarding.completed` event is only produced if `Invitation.accept` succeeded, and the Invitation record names who *issued* the access, authenticated and attributed. The second half of the regulator's question — whether that actor was *permitted* to — is answered from the composed Permissions instance's records for `invitations:initiate` at the invitation's `initiated_at`, not from this composition's, which never checks it (Edge cases — *Inviter and revoker authorization*). Both halves are answerable from records alone; they are two records, not one.

**Disputed onboarding.** A former employee claims: *"My account was created without my knowledge — I never accepted an invitation."* The investigator queries the Audit Trail for `onboarding.completed` events whose `party_id` matches the former employee's record. The event is found. The Invitation record for the `invitation_token` in that event shows `inviter_ref` (who sent it), `accepting_identity_ref` (the external reference supplied at acceptance time), and `accepted_at` (when the acceptance was committed). Invariant 2 (identity binding at accept) is the structural guarantee: the `accepting_identity_ref` was supplied by the caller at `Invitation.accept` time, not pre-populated by the inviting actor. Whether the former employee personally presented the token or whether someone else held the token and supplied the reference is outside the composition's scope — the composition records that a bearer of `tok_inv_g7h2k1` presented the invitation and supplied `accepting_identity_ref: "newhire@acme.com"`. Further investigation of who actually controlled that email address at that moment belongs to Party Identity's identity proofing concept (Customer Onboarding) or a breach forensics investigation.

**Breach forensics.** An investigator determines that an onboarding service account's credential was compromised during a window. The question is: were any fraudulent onboardings performed using the compromised credential? The investigator joins by token, not by the completion's actor: the `onboarding.completed` event's `actor_ref` is the resumer's where an arc was resumed, so a completion attested by an uncompromised administrator can still belong to an arc the compromised account began. The investigator queries the Audit Trail for `onboarding.accept-attempt` and `onboarding.invitation-accepted` events whose `actor_ref` matches the compromised service account within the compromise window, takes their `invitation_token`s, and joins each to the token's `onboarding.completed` event. Each such event names `{invitation_token, accepting_identity_ref, party_id, credential_id}`. The investigator cross-references: do the `invitation_token` values correspond to invitations issued by authenticated inviting actors — and, against the composed Permissions instance's records, by actors permitted to invite at the time? The `invitation.initiated` event for each token names the `inviter_ref`, and its `actor_credential` attestation is independently verifiable — this is the record that carries the token, which is what makes the correlation executable from the trail alone. Any `onboarding.completed` event whose token has no `invitation.initiated` event through the composition, or whose inviter's attestation fails, is a candidate fraudulent onboarding. Invariant 4 (full Audit Trail coverage) and Invariant 5 (completion record names the full arc) together make this forensic reconstruction possible from records alone.

---

## Edge cases

**Partial failure after `Invitation.accept`.** If `Invitation.accept` succeeds but a downstream step fails (Audit Trail step 4 fails, `Party Identity.enroll` fails, `Credential.register` fails, or Audit Trail step 7 fails), the invitation is permanently in `Accepted` state and cannot be accepted again. It **can be resumed**: a subsequent [Onboard] call with the same `invitation_token` and the same `accepting_identity_ref`, made after `onboarding_completion_bound + clock_skew_allowance` has elapsed and while the acceptance is inside the trail's retention horizon, takes the resume arm (Actions, [Onboard], *Resume*) — one resumer per token, under the deployment's `per_token_serialization` — establishes the stage from the trail and, where the trail is silent, from the Party Identity store over every window the arc's records anchor, and re-runs the remaining steps under the caller's own authenticated identity behind an `onboarding.resume-intended` record. The caller need not be the actor who began the arc: R2 looks for the arc's party by the actors the trail records, not by the resumer's. The arc's completion record is then written by the composition, so the party traces to its invitation exactly as a single-pass arc does. What the resume does **not** do is guess: where the store shows more than one party enrolled by the arc's actors under the arc's recorded documents inside the arc's windows, it refuses with `onboarding-indeterminate(candidates)` and an administrator chooses, re-invoking with `resume_party_id`. Manual completion of the constituent steps outside the composition is no longer the recovery, and a deployment that performs it produces a party with no completion record — the regulator-audit scenario's failure, by its own hand. The GA check for unresolved interruptions (check 5) surfaces arcs awaiting resumption.

**Concurrent [Onboard] calls — the race.** Two callers present the same `invitation_token` simultaneously. `Invitation.accept` is atomic under concurrent attempts; exactly one succeeds. The winning call proceeds to enrollment and credential registration. The losing call receives `rejected(invitation-invalid(already-resolved(Accepted)))` at step 3, before any enrollment occurs. No orphaned Party Identity records are created by the losing call. This is Invitation's single-resolution invariant working as the composition's concurrency control. The race it cannot see is the one between two **resumers** — same acceptor, both past the bound — because the gate has already fired for both and answers both alike; that race is closed by the per-token section the resume arm runs under (Configuration, `per_token_serialization`) and by R1's in-flight refusal, and a breach of the section is what check 7 reports.

**Invitation expired between [Invite] and [Onboard].** The invitee delays acting on the invitation until after `expires_at`. `Invitation.accept` returns the atom's derived-expiry rejection `expired` → `rejected(invitation-invalid(expired))`. Nothing is written by the refusal: the record remains stored `Pending` and is *shown* `Expired` by the atom's read-time projection (its Invariant 12 — expiry is derived, never written; there is no stored `Expired` terminal for `already-resolved` to name). No enrollment occurs. The inviting actor must issue a new invitation.

**`duplicate-active-credential` at step 6 — two readings, by arm.** On the **resume arm** it is the expected signal: the interrupted invocation registered the credential before it died, and the resume reads it back and completes the arc with it (step 6's resume-only reading). On a **fresh arc** the `party_id` was minted at step 5 of this very call, so no earlier registration under it through this composition is possible; the only causal story left is a `principal_ref` collision — an external writer registering credentials under the same `principal_ref` namespace as this composition's `party_id`s, which the shared-surface posture of Credential (*Composes*) admits and this composition cannot see. The composition writes `onboarding.interrupted` (stage: "credential-registration", reason: "duplicate-active-credential") and relays `rejected(duplicate-active-credential)` — a state conflict, not an infrastructure failure, and the caller is told which. The enrolled party exists in `Unverified` state without a credential of this composition's issuing; administrator review determines whose credential holds the namespace, and the arc is completed by resumption once it is resolved.

**Identity verification after onboarding.** This composition enrolls the party in `Unverified` state. The transition to `Verified` is a separate concept — the Customer Onboarding composition orchestrates identity verification and calls `Party Identity.verify(verification_result=passed)` to drive the `Unverified → Verified` transition. Downstream regulated activity that requires `Verified` status must check Party Identity state before proceeding; this composition does not provide that gate.

**Credential rotation after onboarding.** Once onboarded, the principal may rotate their credential using `Credential.rotate` directly (outside this composition's surface). The composition does not expose a rotate action. Rotation belongs to the principal's ongoing credential management, separate from the one-time onboarding arc — and it does not disturb the arc's record: the `onboarding.completed` event names the credential as registered, and Generation acceptance check 2 reaches the current head by walking `successor_credential_id`, so the binding from party to credential survives every lawful rotation and revocation without the completion record being rewritten.

**Invitee identity not matching `invitee_ref`.** If the inviting actor supplied an `invitee_ref` at [Invite] time (e.g., a known email address), and the `accepting_identity_ref` supplied at [Onboard] time does not match that `invitee_ref`, the composition does not detect or block this mismatch — the Invitation atom does not validate the relationship between `invitee_ref` and `accepting_identity_ref`. A deployment that requires the accepting identity to prove control of the `invitee_ref` (e.g., by verifying ownership of the email address before calling [Onboard]) must enforce this constraint above the composition layer, before calling [Onboard]. The composition records whatever `accepting_identity_ref` is supplied; the mismatch is a policy matter for the calling layer.

**Inviter and revoker authorization is an above-composition obligation.** This composition's gate **authenticates and attributes; it does not authorize.** The attempt record on [Invite] and [Revoke] verifies the presented credential against the actor registry and attributes the act to `inviter_ref` / `revoked_by_ref`, so an invitation or revocation is never issued on an unverified claim — but nothing in the wiring asks whether that actor was *permitted* to invite this party into this context, or to withdraw this invitation, and no constituent here holds that answer (Invitation takes `inviter_ref` as an opaque reference; Audit Trail attests, it does not gate). The authorization gate is therefore a **declared above-composition obligation**: a deployment composes a [Permissions](../atoms/permissions.md) instance over the scopes `invitations:initiate` and `invitations:revoke`, checked by the caller before [Invite] and [Revoke] (or by a wrapping composition such as Session-Gated Authorization or Attributed Permissions Admin — Composition notes), and that instance's records are where "was the inviter authorized?" is answered. Every claim on this page that an invitation was *issued by an authorized actor* is to be read as *issued by an authenticated, attributed actor*; a deployment that wires no such gate has attribution without authorization, and a regulator's authorization question then has no record to answer it. The obligation is named here rather than absorbed because gating on a scope would make Permissions a constituent and this composition the owner of an authorization vocabulary it has no other reason to hold.

**Decliner identity not recorded.** `Invitation.decline` does not accept an identity argument; the Invitation atom records only that a decline occurred, not who declined. The [Decline] action in this composition uses the system service account as the Audit Trail attestation actor. A deployment that needs to record who declined should capture the decliner's external reference in the Audit Trail event data payload before calling the composition's [Decline] action.

---

## Generation acceptance

An implementation of External Onboarding is accepted if an external auditor can clear the following checks from the Audit Trail and constituent-atom records alone, without recourse to source code, runbooks, or developer narration. Four standing rules govern how the checks run. **Retrieval:** every payload-keyed query below is an enumerate-and-filter over the substrate's declared sequence-range read (Composition state names the mechanism); no payload-index surface is assumed. **Cross-store timestamps:** each constituent stamps its records at its own seam, so a comparison between two stores' stamps (or a store's stamp and an event's) is evidence-trail auditing under the declared `clock_skew_allowance` (Configuration) — a check condemns only violations wider than that allowance and reads discrepancies inside it as inconclusive rather than as findings; the same allowance widens the resume arm's windows, so the checks and the writes run under one declared number (§*A stamp from another seam never decides a write alone*). **Store scope:** every Invitation-store quantifier below ranges over the composition's one dedicated instance under the deployment's routing obligation (*Composes*); records living outside it are outside these claims. **Retention horizon:** the trail is retention-bounded by configuration while Invitation records are undeletable, so every trail-walking check quantifies over arcs whose events are within `audit_trail_retention_policy`'s horizon (Configuration) — the same upper edge the resume arm refuses past — a purged event is lawful destruction under the substrate's honest-representation invariant, its Retention Window record in *Purged* state being the evidence, never a gap signature — and past the horizon the surviving evidence surface is the attestation's own `action_ref` / `actor_ref` / `attested_at` (which the substrate's purge preserves) plus the undeletable constituent records themselves. **In-flight bound:** checks 5 and 6 compare a constituent's committed state against events this composition writes later in the same invocation, so an invocation still running reads as a signature; each examines only acceptances, initiations, and events older than `onboarding_completion_bound + clock_skew_allowance` (Configuration) against the auditor's seam clock — the lower edge the resume arm reads under, widened by the same allowance because the stamps are the constituents' — and reports younger ones as inconclusive, never as findings. **Pairing key:** every join below is on `invitation_token`, which is a per-invocation key on every post-gate path by Invitation's single-resolution invariant — at most one accept, one decline, one revoke ever commits per token — so a token pairs at most one gate clearing with at most one outcome, and a resumed arc's `onboarding.resume-intended` and second `onboarding.interrupted` records join to the same arc, never to a second one — within the arc, an `onboarding.resume-intended` pairs with the first `onboarding.completed` or `onboarding.interrupted` that follows it in sequence, exact because the per-token section (Configuration, `per_token_serialization`) admits one writer at a time; the `invitation.initiate-attempt` event, written before a token exists, carries no per-invocation key by construction and no check pairs it; the other attempt events carry the token in their payload, and R2 reads the `onboarding.accept-attempt` events only as a superset source of actors and documents where the acceptance record is absent — no check pairs an attempt to an outcome. Checks 1, 4, 5, 6, and 7 all read under these rules.

1. **Every active Party Identity enrolled via this composition traces to an accepted invitation.** For every `onboarding.completed` Audit Trail event, the `invitation_token` field references an Invitation record in `Accepted` state, with `accepted_at` predating the event timestamp and `accepting_identity_ref` matching the event's `accepting_identity_ref` field. No `onboarding.completed` event exists for an invitation that is not in `Accepted` state.

2. **Every credential registered via this composition traces to an enrolled party — in any lifecycle state.** For every `onboarding.completed` event, the `credential_id` field references a Credential record **in any lifecycle state** — Active, Rotated, Revoked, or lapsed — whose `principal_ref` matches the event's `party_id` field; where that record is Rotated, walk `successor_credential_id` to the current head and confirm every link's `principal_ref` matches the same `party_id`. **Activeness is deliberately not quantified:** lawful rotation retires the registered credential the day the principal rotates (Credential's `rotate` moves the prior record to Rotated and mints a successor), and lawful revocation retires it permanently, and neither unbinds the onboarding the event records — a check that required the registered credential to be *active* would fail a conforming implementation on its first rotation. What the check establishes is the binding: the credential this arc issued, and every successor rotated from it, belongs to the party this arc enrolled. No credential registered via this composition is bound to a `principal_ref` that does not appear as a `party_id` in a Party Identity record.

3. **Credential-follows-party ordering.** For every `onboarding.completed` event, the Party Identity record for the event's `party_id` has an `enrolled_at` timestamp earlier than or equal to the Credential record's `registered_at` timestamp for the event's `credential_id`. No Credential record registered via this composition predates its subject's Party Identity enrollment.

4. **Invitation-gates-enrollment.** No `onboarding.invitation-accepted` Audit Trail event exists for an invitation that is not in stored `Accepted` state. No `onboarding.completed` event exists without a preceding `onboarding.invitation-accepted` event for the same `invitation_token`. The acceptance gate preceded enrollment in every arc.

5. **Interruption signatures are enumerated, both kinds.** The auditor enumerates two failure signatures, not one: **(a)** every Invitation record in stored `Accepted` state with no `onboarding.invitation-accepted` event for its token — the step-4 recording-failure or crash window, an acceptance the trail never registered; **(b)** every `onboarding.invitation-accepted` event with no subsequent `onboarding.completed` *or* `onboarding.interrupted` event for the same token — the mid-sequence crash or failed-interrupted-write window, an arc that stopped without its stage record. An `onboarding.interrupted` event without a subsequent `onboarding.completed` for the same token is the third, explicit signature: an unresolved interruption awaiting resumption. All three are enumerable by the declared enumerate-and-filter; together they cover every partial-failure path the [Onboard] wiring admits. A resumed arc changes none of them: an `onboarding.resume-intended` closes no signature by itself — only the `onboarding.completed` or `onboarding.interrupted` that follows it does — so an arc whose resume died is still signature (b) or the third signature, and is resumed again.

6. **Every terminal invitation transition via this composition is attested — in both directions.** Every Invitation record in `Declined` or `Revoked` state that was processed via this composition has a corresponding `invitation.declined` or `invitation.revoked` Audit Trail event. Every Invitation record — in any state — has a corresponding `invitation.initiated` event carrying its token; a record without one marks a post-initiate recording failure or crash ([Invite] step 4's declared gap), flagged for review alongside the unattested Declined/Revoked records. In the other direction, every `invitation.initiated` event names an Invitation record that exists. (`invitation.initiate-attempt` events carry no token by construction and are not per-invitation signatures; a sustained excess of attempts over `invitation.initiated` events is a coarse operational indicator, not a per-record finding.)

7. **One writer per token.** For every `invitation_token`, at most one `onboarding.completed` event exists, and every `party_id` named across the token's `onboarding.completed`, `onboarding.interrupted` (stage `credential-registration`), and `onboarding.resume-intended` events is one value; in the other direction, every `party_id` an `onboarding.completed` names is named by exactly one token's events. Two completions for one token, two `party_id`s across one token's events, or one party completed under two tokens is a **second writer** — the per-token section (Configuration, `per_token_serialization`) breached, or a skew wider than the declared `clock_skew_allowance` carrying a dead arc's party outside R2's window — and is a conformance failure, never a tolerated residue: the resume arm's duplicate-freedom (Invariant 1) is conditional on those two entries, and this is the check that tests the condition from the records. It runs over arcs older than the in-flight bound and inside the horizon, as the standing rules require; an `onboarding.resume-intended` younger than the bound with no successor is a resume in flight and is inconclusive.

---

## Composition notes

**Relationship to Customer Onboarding.** External Onboarding admits a party to the system in `Unverified` state. Customer Onboarding drives the identity verification workflow that transitions the party to `Verified`. The two compositions address adjacent points in the regulated identity lifecycle: External Onboarding is the admission gate; Customer Onboarding is the verification gate. A deployment requiring `Verified` status before granting access to regulated functionality places Customer Onboarding downstream of this composition in the onboarding pipeline.

**Relationship to Login.** External Onboarding registers the credential. Login uses that credential: `login(principal_ref, credential_type, presented_material, ...)` calls `Credential.verify`, and on success issues a Session. After a successful [Onboard], the principal can immediately call `login` using the registered `credential_type` and their credential material. The two compositions are adjacent lifecycle boundaries: External Onboarding creates the credential record; Login produces the authenticated session.

**Relationship to Session-Gated Authorization.** Once the onboarded principal has an active session (from Login), runtime authorization queries flow through Session-Gated Authorization: `check_permitted(session_token, action_scope)` gates every permission check on session validity. External Onboarding is the entry point; Session-Gated Authorization is the access-time gate.

**Relationship to Attributed Permissions Admin.** Once onboarded, the principal appears as a subject in Permissions. An authorized actor calls `Attributed Permissions Admin.grant(subject_ref=party_id, action_scope, ...)` to grant the newly onboarded party access to specific scopes. The `party_id` produced by External Onboarding becomes the `subject_ref` in Permissions grants.

**Forthcoming-link resolution.** The Invitation atom's *Composition notes* listed "External Onboarding *(not started)*" as a forthcoming composition. That link is now live.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are: the four onboarding actions it exposes ([Invite], [Onboard], [Decline], [Revoke]) and the four composition-introduced Audit Trail event types that record the arc ([Onboarding Invitation Accepted] — the gate clearing; [Onboarding Completed] — the full-arc completion naming invitation, identity, party, and credential in one entry; [Onboarding Interrupted] — the partial-failure record; [Onboarding Resume Intended] — the record a re-entry writes before it re-runs an interrupted arc). Its load-bearing guarantee — invitation-gates-enrollment: no Party Identity is enrolled through this composition unless an Invitation's Accepted transition precedes it (Invariant 1) — is a structural property, not a datum. The composition owns no cross-atom state (the Audit Trail *is* the map — Composition state), so there is no store to card as a Type. The `invitation.*` audit event types (`invitation.initiated`, `invitation.declined`, `invitation.revoked`), the attempt-gate event types (`invitation.initiate-attempt`, `onboarding.accept-attempt`, `invitation.decline-attempt`, `invitation.revoke-attempt`), and the composition's parameterized rejections (`invitation-invalid(already-resolved(state) | not-known | expired)`, `onboarding-indeterminate(candidates)`) stay backticked as wire values, as do the constituent calls and their outcomes — Invitation's `initiate` / `accept` / `decline` / `revoke` (and its `Pending` / `Accepted` / `Declined` / `Revoked` / `Expired` states), Credential's `register`, Party Identity's `enroll` (and its `Unverified` / `Verified` states), Audit Trail's `record_action` — the relayed constituent tokens (`invitation_token`, `accepting_identity_ref`, `party_id`, `credential_id`, `inviter_ref`, `invitee_ref`, `enrolling_actor_ref`, `actor_credential`), the generic/relayed rejections (`invalid-request`, `invalid-credential`, `duplicate-active-credential`, `storage-failure(intent | outcome)`, `recording-failure(step)`, `not-known`), and concrete example ids. Constituent atom and substrate names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Invite

The composition action that initiates an invitation from an authenticated, attributed actor to an external party — the `invitation.initiate-attempt` gate event first (the attest is the credential check, recorded before the Invitation is created), then `Invitation.initiate`, then the post-success `invitation.initiated` record carrying the token — returning the `invitation_token` the inviter delivers out-of-band.

Kind: Operation

#### Onboard

The composition's load-bearing action: accept an invitation and, in one fixed sequence gated by `Invitation.accept`, enroll the invitee as a Party Identity (Unverified) and register their Credential — recording [Onboarding Invitation Accepted], then [Onboarding Completed] (or [Onboarding Interrupted] on a mid-sequence failure). A stopped arc is re-entered through the resume arm — one resumer per token, under the deployment's per-token section, bounded below by the completion bound and above by the trail's retention horizon — never re-accepted. No enrollment occurs unless the acceptance gate clears (Invariant 1).

Kind: Operation

#### Decline

The composition action that records an invitee's deliberate refusal of an invitation (`Invitation.decline`) and attests it (`invitation.declined`) under the system service actor.

Kind: Operation

#### Revoke

The composition action that withdraws a pending invitation before the invitee acts (`Invitation.revoke`), attributing the revocation to the revoking actor (`invitation.revoked`).

Kind: Operation

#### Onboarding Invitation Accepted

The Audit Trail event [Onboard] records the moment the `Invitation.accept` gate clears — carrying the `invitation_token`, `accepting_identity_ref`, and the `document_type` and `document_ref` the arc enrolls under, which a resume matches the Party Identity store against. An Invitation in Accepted state with no such event is an unresolved interruption (Generation acceptance check 5).

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

#### Onboarding Resume Intended

The Audit Trail event the resume arm of [Onboard] writes before it re-runs an arc that stopped after its gate cleared — naming the stage the records established and the party the resume will continue with, if one — so that a completion reached by re-entry is distinguishable from one reached in a single pass, and a resume that itself died is visible as a plan without an outcome — which the next resume reads as *stage unrecorded* (its `recorded_at` an anchor of R2's window) and, while younger than the bound, as a resume in flight.

Kind:      Member
Member of: the onboarding event
Role:      Audit event
Projects:  onboarding.resume-intended

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
[Onboarding Resume Intended]: #onboarding-resume-intended

---

## Status

`partially resolved` — see the Ledger.

## Ledger

```
status: partially resolved
formal: pending — re-derivation, 2026-08-30: external-onboarding.tla, no twin, verified 2026-06-03 over a single-pass arc with no resume; re-derive over two resumers and a stalled original as processes over one token, the per-token section as the point past which only one can write (2026-08-29-a, 2026-08-30-p)
last gate: 2026-08-30 — third gate, fresh reader, under the frozen rules — 6 foundational corrected in-round, 13 refining and 3 rhetorical routed (2 refining since closed), 5 foundational closure residue corrected in a second pass; 2026-08-26 — Final Critique 7, fresh reader — 6 foundational (all since closed), 10 refining, 3 rhetorical

open:
- 2026-08-26-e · refining · [Decline] · the decliner-identity sentence points at a `data` parameter the signature does not carry → pin the edge case's above-layer reading
- 2026-08-26-f · refining · step 1 validation, all actions · validation depth unpinned; whether constituent semantic validation runs pre-gate decides whether a typo permanently consumes the invitation → pin that it runs pre-gate, citing the constituents' field rules, with steps 5/6's arms as backstop
- 2026-08-26-h · refining · [Revoke] · lacks its Arguments subsection → add it
- 2026-08-26-i · refining · Invariant 2 · restates the constituent's Invariants 3/4 as composition-emergent → re-scope to the completion-record linkage
- 2026-08-26-j · refining · Standards references · RFC and SP unglossed → gloss
- 2026-08-26-k · refining · Examples, happy path · `Credential.register` argument order and the `<password hash>` material contradict the atom's raw-material model → match the atom
- 2026-08-29-a · refining · formal · `external-onboarding.tla` predates the resume arm and the step-split landings → extend the model with the resume path, its in-flight bound, and the step-4 proceed arm
- 2026-08-26-m · rhetorical · Composition logic overview; Actions · the same sequence numbered differently → number once
- 2026-08-26-n · rhetorical · Invariant 4 · "exactly these" over-tightens against check 5's third signature → loosen
- 2026-08-26-o · rhetorical · Invariant 4 · mixed marker/backtick notation and a sentence fragment → clean up
- 2026-08-30-c · refining · *Post-write records* · `invalid-request` omits Actor Identity's own arm at the substrate's step 2; the read-back's lower bound is unstated → name the third source; state the high-water mark
- 2026-08-30-d · refining · step 6, resume-only read-back · the `Credential.read` may return a rotation successor, a collision, or nothing → walk predecessors to the earliest in the arc's window, or name the head and adjust check 2
- 2026-08-30-e · refining · R2, R3 · `Party Identity.read`'s `invalid-query` is neither landed nor declared unreachable → add the sentence
- 2026-08-30-f · refining · step 3, R1, R2, Configuration · strict versus inclusive comparison at the bound and the horizon, and window inclusivity, are unpinned → pin
- 2026-08-30-g · refining · *Retention horizon* standing rule · no operational membership test for an Invitation record → state the test
- 2026-08-30-h · refining · Composition state · the relations declare no cardinality or modality → declare
- 2026-08-30-i · refining · Invariants · no *Rests on:* lines → add them
- 2026-08-30-j · refining · Examples; Standards · HR unglossed → gloss (with 2026-08-26-j)
- 2026-08-30-k · refining · R2, R3 · candidates are not filtered by Current State; a Closed duplicate can be a candidate → exclude, or annotate
- 2026-08-30-l · refining · every "hard alert" · names no surface → adopt the substrate's deployment-alerting obligation term
- 2026-08-30-m · rhetorical · Standards, SOC 2 CC6.2 · attributes `invitation.initiated` to `Invitation.accept`; it is [Invite]'s → fix
- 2026-08-30-n · rhetorical · Composition notes, forthcoming-link resolution · Invitation says `accepting_identity_ref` is the `principal_ref` passed to `Credential.register`; this spec passes `party_id` without flagging → note
- 2026-08-30-o · rhetorical · Examples, concurrent acceptance · shows a different acceptor; the same-acceptor race is the one worth showing → change
- 2026-08-30-p · refining · formal · the model has one resumer, no per-token section, and no stalled original; the second writer is unrepresentable → extend it
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/external-onboarding.md`.

- **2026-08-30 — One resumer per token, the arc bounded at both edges, the dead resume's party found by the arc's actors, the skew declared, the position on the code.** *Chose:* a deployment-supplied `per_token_serialization` the resume arm holds from R1's first read to its return and the fresh arc takes at step 3's `accepted` arm and holds to its return, with stated lease semantics — released on return or death, a lease at least the widened bound long whose expiry is the invocation's terminus, every write after the first made only under the section, and an invocation that lost it re-taking it and re-running R1–R2 as a resume of its own arc before writing again — so two resumers never both enroll and a stalled original is refused until its lease expires; the arc's `document_type` and `document_ref` recorded on `onboarding.accept-attempt`, `onboarding.invitation-accepted`, and `onboarding.resume-intended`, R2 matching the store against the recorded pair and a resumer whose inputs differ refused; R4 taking the post-write landings with `step-4` proceeding as landed; with R1 refusing a successor-less `onboarding.resume-intended` younger than the bound and check 7 condemning two completions or two parties per token; an upper edge on the resume arm — `accepted_at` older than `audit_trail_retention_policy`'s horizon is refused, since a purged completion is not an absent one; R1 reading a dead resume's `onboarding.resume-intended` as *stage unrecorded* and R2 reading the union of windows anchored at `accepted_at` and at every resume-intended's `recorded_at`; R2 filtering on the arc's actor set from the trail rather than the resumer's identity; a `clock_skew_allowance` widening every cross-seam comparison — step 3's bound, R1's edges, R2's window, the standing rule — with Invariant 1's duplicate-freedom made conditional on it; `resume_party_id` on a `Pending` invitation refused at step 1 by a read before the gate; and `storage-failure(intent | outcome)` on all four signatures, the relayed constituent tokens taking the position by the same test. *Over:* a resume arm whose only gate had already fired for every resumer; a section claimed in Configuration that no fresh-arc step took, with no release, expiry, or re-take rule; a party matched on documents the resumer typed; a leg with a lower edge and no upper one; a stage read from `onboarding.interrupted` alone and a window anchored at `accepted_at` alone; "equal this invocation's" against "re-run under the caller's own identity"; a write decision on a read the constituent calls best-effort; a declared rejection no step evaluates; and a bare token on both sides of the commit. *Because:* the gate serializes the one write to `Accepted` and nothing after it, so two re-entries are two writers the atom cannot tell apart; a section with no terminus lets a stalled holder block the arc forever and a lost one lets its holder write between a resumer's pre-check and its append; and a filter on the resumer's inputs finds a different person's party or none; a lawfully destroyed completion read as absent completes the arc twice; a resume that enrolled and died leaves its party outside every window the original arc anchors; an administrator finishing a service account's arc is the recovery the edge case names, and a filter on the resumer finds nothing; a stamp another seam wrote can differ from this one's by a sign the bound does not have; and a caller who cannot tell `intent` from `outcome` re-runs a committed act (the frozen rules of 2026-08-30 — *A compensator is exclusive*, *A stamp from another seam never decides a write alone*, *A composition's own rejection arm carries the retry bit*, and *Capability provenance* frozen with its tells for uses — with §*A reconciliation is bounded at both ends*, §*Recovery commits under a declared service identity*, and §*Lawful destruction is answered before absence*; *Liveness is arithmetic* and *An outcome is sized before the intent* were swept and found no shape here beyond naming the resume payloads in step 1's sizing).
- **2026-08-29 — The gate can be re-entered but never re-accepted, and the substrate's arm keeps its step.** *Chose:* a resume arm on [Onboard] — same acceptor, acceptance older than a declared `onboarding_completion_bound`, stage established from the trail and then from the Party Identity store, candidates named where the store cannot decide, an `onboarding.resume-intended` record before any commit, then the remaining steps re-run under the caller's own identity; and every `record_action` transcription carrying `recording-failure(step)`, with the `step-4` arm proceeding as landed and `invalid-request` read back rather than declared unreachable. *Over:* administrator completion of the constituent steps outside the composition, and a single bare `recording-failure` landing. *Because:* manual completion leaves the party with no completion record, which is the regulator-audit scenario's own failure produced by the recovery; and the substrate's step-4 arm means the event is already appended, so a bare token turned the retry into a duplicate-event generator (the frozen rules of 2026-08-29 — *Recovery commits under a declared service identity* and *A transcribed rejection arm keeps its payload*).
- **2026-08-27 — The gate authenticates and attributes; authorization is declared above the composition.** *Chose:* a named edge case declaring a composed Permissions instance over `invitations:initiate` / `invitations:revoke` as the deployment's authorization gate, with every "authorized actor" claim on the page downgraded to authenticated-and-attributed and the SOC 2 CC6.2 paragraph re-scoped to the registration and ordering halves. *Over:* wiring Permissions as a fifth constituent and gating [Invite] and [Revoke] on a scope. *Because:* the claim was made and neither wired nor disclaimed, which is the worst of the three states; absorbing the gate would make this composition the owner of an authorization vocabulary it has no other use for, while declaring it names the record a regulator's authorization question is answered from.
- **2026-08-26 — The attempt record is the credential gate on all four actions.** *Chose:* every state-changing action opens with a `record_action` attempt event whose Actor Identity attestation, made inside the substrate's declared surface, is the credential check; an attempt refused at the gate lands no event. *Over:* a dry-run mode the substrate does not declare, or reaching Actor Identity directly, which is a transitive constituent. *Because:* the check must live on a surface the composition actually consumes, and the attempt is then auditable for free.
- **2026-08-26 — Invariant 4 is safety plus detectability, not totality.** *Chose:* the arc's completeness is claimed over named gap signatures that checks 5 and 6 enumerate. *Over:* the unconditional statement over paths that admit invisible terminal transitions. *Because:* the composition is stateless by design and carries no marker discipline, so detectability through records is the recovery posture it can honestly offer.
