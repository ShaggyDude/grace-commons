---
title: Invitation
parent: Compliance
grand_parent: Atomic Concepts
nav_order: 12
has_toc: true
toc: true
---

# Invitation

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A compliance primitive: the lifecycle record of an invitation issued to an external entity to join a context. An invitation begins `Pending`, with the invitee's identity optionally unresolved, and resolves exactly once to one of four terminal states: `Accepted` (a binding identity is recorded), `Declined` (a deliberate refusal, semantically distinct from non-use), `Expired` (the invitation window closed without resolution), or `Revoked` (the invitation was withdrawn before resolution). The contract the atom enforces is **single-resolution** — once resolved, no further action is accepted; **opaque invitee at initiation** — the invitee reference need not resolve to a known identity when `initiate` is called; and **identity binding at acceptance** — the `accepting_identity_ref` supplied to `accept` is the permanent, immutable record of who joined.

---

## Intent

Systems that admit external entities — new employees joining an organization, customers enrolling in a service, collaborators gaining access to a shared workspace, patients registering with a provider — face a structural challenge: the invitation must be issued before the invitee's system identity exists, yet the moment of acceptance is when the system identity must be established. The invitation is the bridge between "external stranger" and "registered participant," and it must carry a record of the entire arc: who invited whom, when, whether the invitee responded, and — at the critical moment of acceptance — which identity was bound.

The pattern isolates that lifecycle record from the surrounding machinery. Invitation does not implement the credential registration that follows acceptance — that is Credential's surface (atom #11). It does not implement the identity record that the accepted invitee becomes — that is Party Identity's surface. It does not implement the session issued to the newly accepted participant — that is Session's surface. It does not implement the onboarding workflow that sequences all of these steps — that is External Onboarding's surface (C16). Invitation answers one structural question: *what is the current state of this invitation, and if it was accepted, who accepted it?* The answer is derivable from the invitation record alone.

The `Declined` terminal state is what distinguishes Invitation from Capability (atom #13) at the EOS Pass 2 boundary. Both atoms use bearer-token transport: the holder of a token presents it to resolve the invitation or redeem the capability. Both are time-bounded; both can be revoked. The structural difference is that `Declined` represents a deliberate human decision — a named participant chose to refuse — which is semantically distinct from the invitation simply not being used (which produces `Expired`). Capability has no `declined` state because a bearer either redeems a capability or they do not; the non-use is not a decision that the system records as a first-class outcome. Invitation has `Declined` because a potential participant's refusal matters to the system's audit record independently of whether the invitation token was simply never presented.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the invitation record and its resolution), its own actions (`initiate`, `accept`, `decline`, `revoke`, `expire`), and its own operational principles (single-resolution, opaque invitee at initiation, identity binding at acceptance). It does not implement the downstream provisioning that follows acceptance, the notification that delivers the invitation token, or the policy governing who may invite whom. Each is a composing-pattern concern; see Composition notes.

---

## Summary

Invitation tracks the life of an invitation issued to an outside party to join something — a new employee, a customer, a collaborator, a patient. It answers "what is the state of this invitation, and who accepted it?" An invitation is issued before the invitee even has an identity in the system, which is exactly what makes it useful: it is the bridge from outsider to registered participant. Each invitation is identified by a random token that the invitee presents to act on it, and it starts Pending and resolves exactly once to one of four end states — Accepted (recording, permanently, the identity that joined), Declined (a deliberate refusal, recorded as its own outcome), Expired (the window closed with no response), or Revoked (the inviter withdrew it). Resolving exactly once is the core guarantee: after it resolves, any further attempt is told it is already resolved, which also cleanly handles two people trying to accept at the same time — one wins, the other is told. The key moment is acceptance, where a concrete identity is bound to what may have started as an invitation to an unknown party. Declined is what sets this apart from a plain bearer token: a refusal is a recorded human decision, distinct from simply never using the invitation. It deliberately does not handle the credential setup, identity record, or login that usually follow acceptance — those are separate patterns.

---

## Structure

### Identity model

Every invitation known to the system has an **`invitation_token`** — an opaque, cryptographically random, immutable, system-generated value produced by `initiate`. The token is both the record's identity and the bearer credential the invitee presents to `accept` or `decline`. The token's security properties follow the same reasoning as Capability: it must be unguessable and unpredictable.

The fields set on `initiate` — `inviter_ref`, `invitee_ref`, `context`, `initiated_at`, `expires_at` — are immutable properties of the record. The resolution fields (`accepting_identity_ref`, `accepted_at`, `declined_at`, `revoked_at`, `revoked_by_ref`, `revocation_reason`, `expired_at`) are null until the relevant terminal transition fires and immutable once set.

`invitee_ref` is optional at `initiate` time: the inviting actor may not know the invitee's system identity when the invitation is created (the invitee may not yet be registered in any system). Whether the `invitee_ref` resolves to a known identity, matches the `accepting_identity_ref`, or is null at all are matters the atom treats as valid operating states. The composing pattern decides what to do with any mismatch.

Tokens are not reused after an invitation reaches a terminal state.

### Inputs and Outputs

**Actions:**

- `initiate(inviter_ref, invitee_ref, context, ttl) → invitation_token | rejected(invalid-request | storage-failure)`
- `accept(invitation_token, accepting_identity_ref) → accepted | rejected(invalid-request | already-resolved(state) | not-known | storage-failure)`
- `decline(invitation_token) → declined | rejected(already-resolved(state) | not-known | storage-failure)`
- `revoke(invitation_token, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-resolved(state) | not-known | storage-failure)`
- `expire(invitation_token) → expired | rejected(invalid-request | not-pending | not-known | storage-failure)`

**Inputs:**

- `inviter_ref` — an opaque reference to the actor issuing the invitation. Recorded as an immutable property. Non-null and non-empty required.
- `invitee_ref` — an opaque reference to the intended invitee. Optional — may be null if the inviting actor does not know the invitee's system identity at initiation time. When supplied, stored as an immutable property and never validated by the atom.
- `context` — an opaque descriptor of what the invitee is being invited to join (e.g., an organization identifier, a workspace reference, a role). Opaque to the atom; interpreted by the composing pattern. Non-null and non-empty required.
- `ttl` — a duration value specifying how long the invitation is valid. Null uses the deployment's default invitation TTL. `expires_at = initiated_at + ttl`. Must be positive if supplied.
- `invitation_token` — the bearer token the invitee presents to `accept`, `decline`; the inviting party or administrator presents to `revoke`; the system presents to `expire`.
- `accepting_identity_ref` — an opaque reference to the identity that is accepting the invitation. Supplied to `accept`. This is the binding: whoever calls `accept` provides the identity that will be permanently recorded as having accepted. Non-null and non-empty required.
- `revoked_by_ref` — opaque reference to the actor withdrawing the invitation. Non-null and non-empty required.
- `reason` — caller-supplied reason for revocation. Non-null and non-empty required.

**Outputs:**

- The current set of invitation records. For each: `invitation_token`, `inviter_ref`, `invitee_ref` (nullable), `context`, `initiated_at`, `expires_at`, `status`, `accepting_identity_ref` (nullable), `accepted_at` (nullable), `declined_at` (nullable), `expired_at` (nullable), `revoked_at` (nullable), `revoked_by_ref` (nullable), `revocation_reason` (nullable).
- `initiate` returns a new `invitation_token` on success, or a rejection.
- `accept` returns `accepted` on success, or a rejection (including `already-resolved(state)` if the invitation has already reached a terminal state).
- `decline` returns `declined` on success, or a rejection.
- `revoke` returns `revoked` on success, or a rejection.
- `expire` returns `expired` on success, or a rejection.

### State

Each invitation record carries a `status` field. The state machine is:

- **Pending** — the invitation has been issued and awaits resolution. This is the only non-terminal state.
- **Accepted** — the invitation was accepted and an identity was bound. Terminal.
- **Declined** — the invitation was deliberately declined. Terminal.
- **Expired** — the invitation window closed without resolution. Terminal.
- **Revoked** — the invitation was withdrawn before resolution. Terminal.

Transitions:

- `initiate(inviter_ref, invitee_ref, context, ttl)` → a new invitation record is created in `Pending` status with a fresh `invitation_token`, the supplied `inviter_ref`, `invitee_ref` (nullable), `context`, `initiated_at = now`, and `expires_at = now + ttl` (or default). Returns `invitation_token`.
- `accept(invitation_token, accepting_identity_ref)` → status transitions from `Pending` to `Accepted`; `accepting_identity_ref` and `accepted_at = now` are recorded. Returns `accepted`.
- `decline(invitation_token)` → status transitions from `Pending` to `Declined`; `declined_at = now` is recorded. Returns `declined`.
- Clock advance past `expires_at` → status transitions from `Pending` to `Expired`; `expired_at = now` is recorded. May be triggered eagerly by a background scheduler or lazily at the next `accept`, `decline`, or `revoke` call that detects expiry; the lazy path returns `already-resolved(Expired)` to the caller.
- `revoke(invitation_token, revoked_by_ref, reason)` → status transitions from `Pending` to `Revoked`; `revoked_at = now`, `revoked_by_ref`, and `revocation_reason` are recorded. Returns `revoked`.
- `expire(invitation_token)` → status transitions from `Pending` to `Expired`; `expired_at = now` is recorded. Returns `expired`. Called by a background scheduler; may also be called administratively.
- *(no transitions out of Accepted, Declined, Expired, or Revoked)*

Each invitation record carries:

- **`invitation_token`** — opaque, cryptographically random, immutable, system-generated. Set on `initiate`. Never changes. The bearer credential.
- **`inviter_ref`** — opaque reference to the inviting actor. Set on `initiate`. Never changes.
- **`invitee_ref`** — opaque reference to the intended invitee. Nullable. Set on `initiate`. Never changes.
- **`context`** — opaque descriptor of what the invitee is being invited to join. Set on `initiate`. Never changes.
- **`initiated_at`** — wall-time when `initiate` was called. Immutable.
- **`expires_at`** — absolute expiry time. Set on `initiate`. Immutable. Never null.
- **`status`** — Pending | Accepted | Declined | Expired | Revoked. Set to `Pending` on `initiate`. Terminal once resolved.
- **`accepting_identity_ref`** — the identity that accepted the invitation. Null until `accept` fires. Immutable once set.
- **`accepted_at`** — set when status transitions to `Accepted`. Null otherwise. Immutable once set.
- **`declined_at`** — set when status transitions to `Declined`. Null otherwise. Immutable once set.
- **`expired_at`** — set when status transitions to `Expired`. Null otherwise. Immutable once set.
- **`revoked_at`** — set when status transitions to `Revoked`. Null otherwise. Immutable once set.
- **`revoked_by_ref`** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **`revocation_reason`** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Inviting actor creates an invitation.** Calls `initiate(inviter_ref, invitee_ref, context, ttl) → invitation_token`. The atom creates the record and returns the token. The inviting actor delivers the token to the invitee through an appropriate out-of-band channel (email link, direct message, printed QR code).
2. **Invitee accepts.** Calls (or the system calls on their behalf after presenting the token) `accept(invitation_token, accepting_identity_ref) → accepted`. The atom records the accepting identity and transitions the invitation to `Accepted`. The composing pattern (e.g., External Onboarding, C16) proceeds to create a Party Identity record, register a Credential, and issue a Session.
3. **Invitee declines.** Calls `decline(invitation_token) → declined`. The atom records the refusal and transitions the invitation to `Declined`. The composing pattern notifies the inviting actor and closes the onboarding arc.
4. **Invitation expires.** The deadline passes without resolution. Either a background scheduler calls `expire(invitation_token)` or the next action call detects expiry and returns `already-resolved(Expired)`. The composing pattern notifies the inviting actor that the invitation lapsed.
5. **Inviting actor revokes.** Calls `revoke(invitation_token, revoked_by_ref, reason)`. The atom transitions to `Revoked` and records the attribution. Future action attempts return `already-resolved(Revoked)`.

### Decision points

**At `initiate(inviter_ref, invitee_ref, context, ttl)`:**
- `inviter_ref` and `context` must be non-null and non-empty; otherwise `invalid-request`.
- `invitee_ref` may be null — the atom permits uninvited-style invitations where the intended recipient is not yet a known system entity. Whether the deployment permits null `invitee_ref` is a configuration concern.
- `ttl` must be positive if supplied; null uses the deployment default. Zero or negative is `invalid-request`. The deployment default must be configured; absent, `invalid-request`.
- `expires_at` is computed once as `initiated_at + ttl` and stored immutably.
- If the store write fails, `storage-failure` is returned with no partial record.

**At `accept(invitation_token, accepting_identity_ref)`:**
- The atom looks up the invitation by `invitation_token`. If no record is found, `not-known`.
- If the record is found but `status` is not `Pending` (i.e., it is already Accepted, Declined, Expired, or Revoked), `already-resolved(state)` naming the current terminal state. This is the single-resolution invariant in action.
- Expiry check: if `status = Pending` and `now >= expires_at`, the atom treats the invitation as expired. It may lazily transition to `Expired` at this point and return `already-resolved(Expired)`.
- `accepting_identity_ref` must be non-null and non-empty; otherwise `invalid-request`.
- The transition to `Accepted` and the writes of `accepting_identity_ref` and `accepted_at` are atomic. Under concurrent `accept` calls, exactly one commits the transition; all others receive `already-resolved(Accepted)`.
- If the store write fails, `storage-failure` is returned; the record remains `Pending`.
- The atom does not validate that `accepting_identity_ref` matches `invitee_ref`. Whether the accepting identity was the intended invitee is the composing pattern's concern.

**At `decline(invitation_token)`:**
- The atom looks up the invitation by `invitation_token`. If no record, `not-known`.
- If not `Pending`, `already-resolved(state)`.
- If `status = Pending` and `now >= expires_at`, the atom treats the invitation as expired. It may lazily transition to `Expired` at this point and return `already-resolved(Expired)`.
- The transition to `Declined` and the write of `declined_at` are atomic. If the store write fails, `storage-failure`; the record remains `Pending`.
- `decline` takes no identity argument: the declining actor's identity is not recorded. The deliberate refusal is recorded as a terminal state (`Declined`), not as an attribution record. Whether the declining actor is the intended invitee is not validated. Composing patterns that need to record who declined may do so in their own records.

**At `revoke(invitation_token, revoked_by_ref, reason)`:**
- The atom looks up the invitation by `invitation_token`. If no record, `not-known`.
- If not `Pending`, `already-resolved(state)`.
- A token whose `expires_at` has passed is treated as terminal: `revoke` returns `already-resolved(Expired)` and may lazily transition the record to `Expired`.
- `revoked_by_ref` and `reason` must be non-null and non-empty; otherwise `invalid-request`.
- The transition to `Revoked` and the writes of `revoked_at`, `revoked_by_ref`, and `revocation_reason` are atomic. If the store write fails, `storage-failure`.

**At `expire(invitation_token)`:**
- The atom looks up the invitation by `invitation_token`. If no record, `not-known`.
- If `status` is not `Pending`, `not-pending` — expiry is inapplicable to already-resolved invitations.
- If `now < expires_at`, the invitation has not yet reached its expiry window: `invalid-request`. Only an invitation whose `expires_at` has passed may be expired. A caller wishing to end a `Pending` invitation before its natural expiry should use `revoke`.
- The transition to `Expired` and the write of `expired_at` are atomic. If the store write fails, `storage-failure`.

### Behavior

- **Single-resolution is the atom's central invariant.** Every action that resolves an invitation — `accept`, `decline`, `revoke`, `expire` — checks the current status as its first operation. If the invitation is not `Pending`, the action returns `already-resolved(state)` without modifying any record. Lazy expiry extends this: if the invitation is `Pending` but `now >= expires_at`, the resolving action (`accept`, `decline`, or `revoke`) returns `already-resolved(Expired)` and may atomically write the `Expired` terminal transition as a housekeeping side-effect. This check-and-commit must be atomic (see Invariant 2). An implementation that resolves the same invitation twice has violated the atom's core contract.
- **`accept` binds an identity; `decline` does not.** `accept` requires `accepting_identity_ref` and records it permanently. `decline` records only `declined_at`. This asymmetry is intentional: acceptance creates a system relationship (a new participant joined); declination closes the open invitation without creating a relationship. Whether to record who declined is a composing-pattern decision.
- **Opaque invitee at initiation is a feature, not a gap.** The `invitee_ref` field is optional and the atom never validates it against the `accepting_identity_ref` at accept time. This accommodates the common real-world scenario where an invitation is sent to an email address that does not yet correspond to any system identity, and the identity is only created at acceptance time. The composing External Onboarding pattern (C16) decides what relationship between `invitee_ref` and `accepting_identity_ref` is required by the deployment.
- **`Declined` is a named terminal state, not a fallback.** A declined invitation is not an expired invitation and is not a revoked invitation. It represents a deliberate act by a party who held the invitation token and chose to refuse. An implementation that maps `Declined` to `Expired` or to `Revoked` loses the structural distinction. The audit record should be able to distinguish "was never opened" (Expired), "was seen and refused" (Declined), and "was withdrawn by the inviter" (Revoked).
- **The `already-resolved(state)` rejection carries the terminal state name.** When an action is called on a resolved invitation, the rejection includes the current terminal state so the caller knows why the action failed and what the resolution was. `already-resolved(Accepted)` signals something different to the composing pattern than `already-resolved(Declined)` or `already-resolved(Revoked)`.

### Feedback

Each successful action produces an observable, measurable change:

- After `initiate` — a new invitation record appears in `Pending` status with a fresh `invitation_token`, `inviter_ref`, `invitee_ref` (nullable), `context`, `initiated_at`, and `expires_at`. Total record count increases by one. The token is returned to the caller.
- After `accept` — `status` transitions to `Accepted`; `accepting_identity_ref` and `accepted_at` are set.
- After `decline` — `status` transitions to `Declined`; `declined_at` is set.
- After `expire` — `status` transitions to `Expired`; `expired_at` is set.
- After `revoke` — `status` transitions to `Revoked`; `revoked_at`, `revoked_by_ref`, and `revocation_reason` are set.

Rejected actions produce named rejection codes observable to the caller. `already-resolved(state)` is the most important — it carries the terminal state that blocked the action, giving the caller a complete picture of why the invitation cannot be acted upon.

The invitation store is queryable. Per-record fields are observable to authorized administrative surfaces. Composing patterns may query by `inviter_ref` to list pending invitations for an actor, by `context` to audit onboarding activity for a specific workspace, or by resolution status to generate acceptance-rate metrics.

### Invariants

**Invariant 1 — Initiation immutability.** Once an invitation record is created, `invitation_token`, `inviter_ref`, `invitee_ref`, `context`, `initiated_at`, and `expires_at` never change. The resolution fields are null until the terminal transition fires and immutable once set.

**Invariant 2 — Single-resolution.** Every invitation resolves exactly once. Exactly one of the four terminal states — `Accepted`, `Declined`, `Expired`, `Revoked` — is reached per invitation record, and no further state transitions are permitted after that. Any action called on a resolved invitation returns `already-resolved(state)`. The check-and-commit from `Pending` to a terminal state must be atomic to enforce this invariant under concurrent resolution attempts.

**Invariant 3 — Acceptance binds identity.** When an invitation transitions to `Accepted`, `accepting_identity_ref` and `accepted_at` are recorded atomically with the status transition. A record with `status = Accepted` and a null `accepting_identity_ref` is evidence of an implementation defect. The `accepting_identity_ref` is immutable once set.

**Invariant 4 — Opaque invitee at initiation.** `invitee_ref` may be null at `initiate` time. The atom never validates `invitee_ref` against `accepting_identity_ref` at `accept` time. These are two independent, opaque references; whether they represent the same real-world entity is the composing pattern's concern.

**Invariant 5 — Four structurally distinct terminal states.** `Accepted`, `Declined`, `Expired`, and `Revoked` are distinguishable from each other in the record store. A record with `status = Accepted` has non-null `accepting_identity_ref` and `accepted_at`. A record with `status = Declined` has non-null `declined_at`. A record with `status = Expired` has non-null `expired_at`. A record with `status = Revoked` has non-null `revoked_at`, `revoked_by_ref`, and `revocation_reason`. No two terminal states share an identical field pattern. An implementation that collapses any two terminal states into a single representation violates this invariant.

**Invariant 6 — `already-resolved` carries terminal state.** Every rejection of an action on a resolved invitation includes the current terminal state name in the rejection payload: `already-resolved(Accepted)`, `already-resolved(Declined)`, `already-resolved(Expired)`, or `already-resolved(Revoked)`. A bare `already-resolved` without the state name is not conformant.

**Invariant 7 — Expiry timestamp immutability.** `expires_at` is computed once at `initiate` time and never mutated. Extending an invitation's validity window requires revoking the existing invitation and initiating a new one.

**Invariant 8 — Revocation attribution completeness.** Every invitation record with `status = Revoked` has non-null `revoked_at`, `revoked_by_ref`, and `revocation_reason`. A `Revoked` record missing any of these is evidence of a process violation.

**Invariant 9 — Every invitation has a finite lifetime.** `expires_at` is never null. Invitations that do not expire are not expressible; an implementation that initiates invitations without an `expires_at` violates this invariant.

**Invariant 10 — Invitation durability.** Once `initiate` returns an `invitation_token`, the invitation record is durably persisted. A `storage-failure` rejection guarantees no partial record was written. The atom provides no deletion surface.

**Invariant 11 — Token uniqueness.** No two invitation records share an `invitation_token` across the lifetime of the system. Tokens are not reused after an invitation reaches a terminal state. This guarantees lookup determinism: a token resolves to exactly one invitation record, and actions on that token are unambiguous.

Invariants 2 and 3 together give the *onboarding integrity* property — the identity binding at acceptance is trustworthy because it is produced by exactly one atomic transition, never overwritten, and requires a non-null identity at call time. Invariant 4 (opaque invitee at initiation) is what makes Invitation usable before the invitee has a system identity. Invariant 5 (four distinct terminal states) is what makes the audit record informative: an external evaluator reading the invitation store can distinguish every possible resolution path.

---

## Examples

### New employee onboarding — accept

An HR system initiates an invitation for a new hire:

`initiate(inviter_ref: hr_admin_h01, invitee_ref: null, context: "org::acme::dept::engineering", ttl: 604800) → invitation_token: tok_inv_g7h2k1`

`invitee_ref` is null because the new hire does not yet have a system identity. `expires_at = initiated_at + 7 days`.

The HR system emails the new hire a link embedding the token. On their first day, the new hire clicks the link and creates their account. The onboarding handler calls:

`accept(invitation_token: tok_inv_g7h2k1, accepting_identity_ref: user_u114) → accepted`

The atom transitions the invitation to `Accepted`, recording `accepting_identity_ref: user_u114` and `accepted_at: 2026-09-08T09:14:00Z`. These fields are now immutable. The composing External Onboarding pattern (C16) proceeds: it creates a Party Identity record for user_u114, registers their credential, and issues their first session.

### Workspace collaboration — decline

A user receives an invitation to join a shared project workspace:

`initiate(inviter_ref: user_u91, invitee_ref: user_u55, context: "workspace::project-alpha", ttl: 172800) → invitation_token: tok_inv_p4q9r2`

The invitee sees the invitation in their notification panel and clicks "Decline":

`decline(invitation_token: tok_inv_p4q9r2) → declined`

The atom transitions to `Declined`, recording `declined_at: 2026-10-15T11:22:00Z`. The inviting user_u91 is notified that the invitation was declined. The invitation record is permanently `Declined` — it cannot be accepted, re-declined, revoked, or expired. Any subsequent action returns `already-resolved(Declined)`.

### Invitation revoked before use

An administrator initiates an invitation but then discovers the intended recipient should not be admitted:

`initiate(inviter_ref: admin_a01, invitee_ref: user_u77, context: "org::acme::role::contractor", ttl: 86400) → invitation_token: tok_inv_c2d8e3`

`revoke(invitation_token: tok_inv_c2d8e3, revoked_by_ref: admin_a01, reason: "contractor-engagement-cancelled") → revoked`

The atom transitions to `Revoked`, recording `revoked_at`, `revoked_by_ref: admin_a01`, and `revocation_reason: "contractor-engagement-cancelled"`. If the intended recipient had received the link and attempts to use it:

`accept(tok_inv_c2d8e3, accepting_identity_ref: user_u77) → rejected(already-resolved(Revoked))`

The caller learns not only that the invitation cannot be acted on, but that it was `Revoked` — not merely expired or already accepted.

### Rejection paths

**`accept` — `already-resolved(Accepted)` (concurrent attempt):** Two requests to accept the same invitation arrive simultaneously. The first commits atomically: `accept(tok_inv_g7h2k1, user_u114) → accepted`. The second arrives microseconds later and finds `status = Accepted`: `accept(tok_inv_g7h2k1, user_u115) → rejected(already-resolved(Accepted))`. User u115's attempt is rejected. The invitation is resolved to exactly one identity — user_u114. This is Invariant 2 in action.

**`decline` — `already-resolved(Expired)`:** An invitee receives an invitation but takes two weeks to decide, by which time the 7-day window has passed. They click "Decline":

`decline(invitation_token: tok_inv_p4q9r2b) → rejected(already-resolved(Expired))`

The atom detects `now >= expires_at`, lazily transitions the invitation to `Expired`, and returns `already-resolved(Expired)`. The invitation was not declined; it expired. The audit record reflects this: `status = Expired`, `expired_at` set, `declined_at = null`.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A HIPAA (Health Insurance Portability and Accountability Act) compliance officer asks *"can you prove that every user who accessed patient records joined via a documented, auditable invitation from an authorized administrator?"* The auditor queries the invitation store for all `Accepted` invitations with `context` referencing the patient records system. Each accepted invitation record shows: `inviter_ref` (the administrator who invited them), `accepted_at` (when they joined), and `accepting_identity_ref` (the identity that was bound). Invariant 3 (acceptance binds identity) is the structural guarantee: every `Accepted` record has an immutable `accepting_identity_ref` and an immutable `inviter_ref`. The auditor can trace every current system user back to the specific invitation — and the specific administrator — that admitted them. No participant entered the system without a documented invitation.

**Disputed onboarding.** A former employee claims *"I never accepted an invitation to this system — my account was created without my knowledge."* The investigator queries the invitation store for invitations with `accepting_identity_ref` matching the employee's identity. The query finds one: `status: Accepted`, `accepted_at: 2026-03-15T10:42:00Z`, `invitation_token: tok_inv_e5f6g7`. Invariant 2 (single-resolution) means there is exactly one resolved invitation for this identity. The record shows when the token was presented and the acceptance was committed. Whether the former employee personally clicked the link or whether someone else acted with their token is outside the atom's scope — the atom records that a bearer of `tok_inv_e5f6g7` presented the invitation at `10:42Z` on that date and supplied `accepting_identity_ref: user_u114`. The composing External Onboarding pattern's Audit Trail records the surrounding context (what device, what IP, what credential was registered) which the investigator pursues separately.

**Breach investigation.** A security team discovers that invitation tokens for a high-security system were exposed in an application log between `2026-11-01` and `2026-11-07`. They query the invitation store for all invitations with `initiated_at` in that window and `context` referencing the high-security system. The query returns 12 invitations. Five are `Accepted` (the security team verifies these acceptances were legitimate by cross-referencing the `accepting_identity_ref` values against known employees). Four are `Pending` — the team revokes these immediately. Two are `Expired` — already terminal; no action needed. One is `Declined`. Invariant 5 (four distinct terminal states) makes this triage possible from the invitation store alone: each invitation's status, and its associated timestamp and attribution fields, tell the team exactly what happened to it.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Downstream provisioning.** The atom records that an invitation was accepted and by whom. It does not create a Party Identity record, register a Credential, issue a Session, grant Permissions, or take any other action in response to acceptance. All of that is the composing External Onboarding pattern's (C16) responsibility. The invitation record is the trigger and the audit anchor; the provisioning steps are the composing pattern's wiring.
- **Invitee notification.** The atom does not send emails, push notifications, or any other communications to the invitee. Delivering the `invitation_token` to the invitee is the caller's responsibility. The atom produces the token; the delivery channel is outside its scope.
- **Who-may-invite-whom policy.** Whether a given `inviter_ref` is authorized to invite participants to the given `context` is a composing-pattern policy concern. The atom records whatever `inviter_ref` is supplied; it does not validate the inviter's authority.
- **Invitee-vs-accepting-identity matching.** The atom does not validate that `accepting_identity_ref` matches `invitee_ref`. A composing pattern that requires matching (e.g., the invitation was addressed to a specific external email, and the accepting party must prove control of that email) enforces this constraint above the atom layer.
- **Re-invitation after declination or expiry.** If an invitee declines and the inviting actor wants to try again, the actor calls `initiate` again to create a new invitation. The declined invitation record remains in the store as immutable history. The atom provides no "re-open" action.
- **Invitation transfer.** The atom does not model passing an invitation from one potential invitee to another. The `invitation_token` is a bearer credential; whoever presents it to `accept` becomes the `accepting_identity_ref`. Whether this is acceptable in a given deployment is a policy concern. Composing patterns that prohibit transfer may validate `invitee_ref` against `accepting_identity_ref` before calling `accept`.
- **Multi-use invitations.** Each invitation is single-use: `accept` resolves it permanently. A "team invitation link" that many people can follow is not an Invitation in this atom's sense — it is a Capability (atom #13) with `max_redemptions = N` and a `scope` that encodes the team onboarding action. Each redemption of the Capability triggers a separate Invitation `initiate` + `accept` sequence for that specific invitee.
- **Identity proofing.** The atom records who accepted the invitation but does not verify the accepting identity's real-world credentials (government ID, professional license, liveness check). Identity proofing belongs to Party Identity and the KYC (Know Your Customer) composition (C8). The invitation establishes *that* someone joined via a documented channel; it does not establish *who they really are*.
- **Clock accuracy.** `initiated_at`, `accepted_at`, `declined_at`, `expired_at`, and `revoked_at` are captured from the deployment clock. Trusted timestamping (RFC 3161 — the Internet standard "Request for Comments" document 3161 defining a trusted time-stamping protocol) is a composing pattern for deployments requiring externally verifiable timestamps.
- **Invitation store tamper-evidence.** Composing with Tamper Evidence provides cryptographic proof that no invitation record was retroactively altered — useful in regulated deployments where the `inviter_ref` and `accepting_identity_ref` fields are used as legal evidence.

---

## Composition notes

Invitation is freestanding. It is the onboarding-lifecycle constituent of External Onboarding (C16):

- **[Party Identity](./party-identity.md)** — Party Identity is the persistent verifiable identity record of an external party. Invitation is the gate through which that party enters the system. External Onboarding (C16) wires them: an Invitation is accepted, supplying `accepting_identity_ref`, and a Party Identity record is created for that reference. Without Invitation, the library has no structured account of how an external party came to be in the system at all.
- **[Credential](./credential.md)** — in External Onboarding (C16), credential registration follows acceptance. The `accepting_identity_ref` from the Invitation is the `principal_ref` passed to `Credential.register`. The Invitation record is the audit anchor that traces the credential back to the specific invitation event.
- **[Actor Identity](./actor-identity.md)** — in regulated deployments, the `accept` call may be paired with an Actor Identity `attest` call to produce a non-repudiable record that the accepting identity committed to the acceptance. The `inviter_ref` is similarly attestable at `initiate` time.
- **[Audit Trail](../../compositions/audit-trail.md)** — in regulated deployments, `initiate`, `accept`, `decline`, and `revoke` events should be recorded in the Audit Trail. The atom does not mandate this; it is the composing External Onboarding pattern's obligation.
- **[Tamper Evidence](./tamper-evidence.md)** — the invitation store, including the `inviter_ref`, `accepting_identity_ref`, and `revoked_by_ref` fields, should be hash-chained for regulated deployments where invitation records serve as legal evidence.
- **Capability** *(atom #13, grounded)* — Capability and Invitation share bearer-token transport but are structurally distinct. A Capability is for resource access; an Invitation is for identity onboarding. The structural difference: Invitation carries `Declined` as a named terminal state (a deliberate human refusal, not mere non-use) and binds an identity at acceptance. Capability has neither. See the Open taxonomy question in ROADMAP.md for the full Capability-vs-Invitation design boundary. The authoring discipline: Capability was drafted first (atom #13); this spec was written using Capability as the Pass 2 mirror to confirm the two atoms cannot be collapsed.
- **[External Onboarding](../../compositions/external-onboarding.md)** — the composition that wires Invitation acceptance to Party Identity creation, Credential registration, and Audit Trail attestation. The load-bearing emergent invariant is invitation-gates-enrollment: no Party Identity is created unless `Invitation.accept` precedes it in the same `onboard` call, and the `onboarding.completed` Audit Trail event names the invitation token, accepting identity reference, party record, and credential in one tamper-evident entry.

---

## Standards references

- **GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Articles 6 and 7 (Lawful Basis and Consent for Processing)** — the `initiate` call creates a processing record: the system now holds the `invitee_ref` and will process data on behalf of or about the invitee if they accept. The `initiated_at` and `inviter_ref` fields constitute the processing-event record the GDPR requires. The `accept` call — and the `accepting_identity_ref` bound at that moment — is the record of the data subject's active engagement with the system. The invitation record is the lawful-basis evidence for the processing that follows onboarding.
- **HIPAA §164.312(a)(1) (Access Control)** — invitation-based user provisioning is a covered access-granting mechanism. The `inviter_ref` (the authorized administrator who granted access) and `accepting_identity_ref` (the identity that gained access) are the access-control audit record.
- **SCIM 2.0 (System for Cross-domain Identity Management — RFC 7644)** — SCIM's `POST /Users` with an invite flow maps to the Invitation → External Onboarding arc. The `invitee_ref` in the invitation corresponds to the SCIM user's external identity reference; the `accepting_identity_ref` corresponds to the provisioned SCIM user ID.
- **SOC 2 CC6.2 (Prior to Issuing System Credentials, New Internal and External Users Are Registered and Authorized)** — the invitation record is the registration and authorization event SOC 2 CC6.2 requires. `inviter_ref` is the authorizing party; `accepted_at` and `accepting_identity_ref` are the registration event.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63A (Digital Identity Guidelines — Enrollment and Identity Proofing)** — the enrollment event at which an applicant registers with an identity system maps to the Invitation → accept arc. The atom models the enrollment record; identity proofing (NIST 800-63A's primary concern) is Party Identity's surface and is not in scope here.

Standards anchoring for Invitation is lighter than for Credential, Session, or Capability, consistent with the ROADMAP entry: the atom earns its keep on EOS Pass 2 conceptual independence — the `Declined` state, the single-resolution invariant, and the identity-binding-at-acceptance are what justify a separate atom rather than folding Invitation into Capability.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of separating the lifecycle record of an invitation (this atom) from the provisioning steps that follow acceptance (composing patterns).
- **Grace Commons regulated-atom conventions** — *Regulated adversarial scenarios* and *Generation acceptance* inherited from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md), not re-derived from predecessor atoms.

---

## Generation acceptance

A derived implementation of Invitation is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the invitation record store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm single-resolution for every invitation.** For every record in the store, confirm that exactly one terminal-state timestamp field is non-null (`accepted_at`, `declined_at`, `expired_at`, or `revoked_at`) — never more than one, never zero for a non-`Pending` record. A record with two non-null terminal timestamps is evidence of a double-resolution defect. Invariant 2 is the structural guarantee.
- **Confirm identity binding completeness for accepted invitations.** For every record with `status = Accepted`, confirm that `accepting_identity_ref` and `accepted_at` are both non-null. An `Accepted` record with a null `accepting_identity_ref` violates Invariant 3 and is evidence of an implementation defect. Determine from the record alone who accepted each invitation.
- **Confirm the four terminal states are structurally distinct.** Verify that `Accepted` records have non-null `accepting_identity_ref` and `accepted_at`; `Declined` records have non-null `declined_at`; `Expired` records have non-null `expired_at`; `Revoked` records have non-null `revoked_at`, `revoked_by_ref`, and `revocation_reason`. No two terminal states should be indistinguishable from the record alone. Invariant 5 is the structural guarantee.
- **Confirm revocation attribution completeness.** For every record with `status = Revoked`, confirm that `revoked_at`, `revoked_by_ref`, and `revocation_reason` are all non-null. Determine from the record who revoked each invitation and why. Invariant 8 is the guarantee.
- **Reconstruct the invitation arc for any context.** Given a `context` value (e.g., an organization or workspace identifier), query all invitation records for that context. The records should tell the complete story: how many invitations were issued, by whom (`inviter_ref`), how each resolved (`status`), who accepted (`accepting_identity_ref`), and when. This reconstruction requires no data beyond the invitation store.

---

## Status

`grounded` (formal layer landed 2026-06-03 — TLA+ model `invitation.tla` + buggy twin verified; see Lineage §Formal model. Cleared `grounded (English) — formal layer pending`; full prose round was `grounded on Final Critique 4`.) — three-pass pressure testing (Rounds 1–3, each with Pass 1 GRID structural — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof / Pass 2 EOS conceptual independence / Pass 3 Linus adversarial) plus Final Critique (Round 4, Super Torvalds) complete. Four findings resolved across Round 1; one foundational finding resolved in Final Critique 4. Final Critique 4 closed clean.

*Provisional placement note: this atom is filed in `atoms/compliance/` as the initial home for identity-onboarding lifecycle records. Invitation is not pure compliance infrastructure — it has meaningful non-regulated applications wherever invitation-based onboarding is used. A future taxonomy refactor may relocate it to `atoms/identity/`, carrying `regulated: true` as a frontmatter attribute for regulated deployments. See the Open taxonomy question in ROADMAP.md and Methodology debt #5.*

---

## Lineage notes

**Conventions inherited.** This atom is a regulated atom (provisional `atoms/compliance/` placement) and carries *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

---

**Round 1 — Pass 1 (GRID structural).** Four findings.

*F1 — `accept`, `decline`, and `revoke` missing `storage-failure`.* All three write to the store but their signatures and Decision points omitted `storage-failure`. Fixed: signatures updated to include `storage-failure`; Decision points for `accept`, `decline`, and `revoke` each gained a terminal clause — "If the store write fails, `storage-failure`; the record remains `Pending`."

*F2 — `expire` missing `storage-failure`, `invalid-request`, and pre-expiry check.* `expire` wrote to the store (missing `storage-failure`) and had no guard against being called before `expires_at` has passed (missing `invalid-request`). Fixed: signature updated to `→ expired | rejected(invalid-request | not-pending | not-known | storage-failure)`; Decision points gained: "If `now < expires_at`, the invitation has not yet reached its expiry window: `invalid-request`. Only an invitation whose `expires_at` has passed may be expired. A caller wishing to end a `Pending` invitation before its natural expiry should use `revoke`."

*F3 — Token uniqueness invariant missing.* No invariant stated that `invitation_token` values are globally unique across the system's lifetime and non-reusable after terminal resolution. Fixed: Invariant 11 added: "No two invitation records share an `invitation_token` across the lifetime of the system. Tokens are not reused after an invitation reaches a terminal state."

*F4 — `revoke` Decision points inconsistent with State section on lazy expiry.* State section (line 112) stated that lazy expiry fires at `accept`, `decline`, or `revoke`, but `revoke`'s own Decision points omitted the expiry check. An implementer reading Decision points alone would not fire lazy expiry at `revoke`. Fixed: `revoke` Decision points gained: "A token whose `expires_at` has passed is treated as terminal: `revoke` returns `already-resolved(Expired)` and may lazily transition the record to `Expired`." Behavior section updated to state: "Lazy expiry extends this: if the invitation is `Pending` but `now >= expires_at`, the resolving action (`accept`, `decline`, or `revoke`) returns `already-resolved(Expired)` and may atomically write the `Expired` terminal transition as a housekeeping side-effect."

**Round 1 — Pass 2 (EOS conceptual independence).** Clean. State, Behavior, and Invariants fully freestanding. Composition notes and Intent name other atoms for scope-delimitation only.

**Round 1 — Pass 3 (Linus adversarial).** No additional findings beyond F1–F4.

---

**Round 2 — Pass 1 (GRID structural).** Clean. All nine MUSE (the completeness framework, version 1.1, GRID's nodes are drawn from) nodes fully resolved after Round 1 fixes.

**Round 2 — Pass 2 (EOS conceptual independence).** Clean.

**Round 2 — Pass 3 (Linus adversarial).** Clean. No foundational gaps. One refining observation noted: Invariant 5 names which timestamp fields are non-null for each terminal state but does not explicitly state that the other terminal timestamp fields must remain null. Combined with Invariant 1 (resolution fields immutable once set) and Invariant 2 (single-resolution), the correctness is adequate; the gap is rhetorical, not structural.

---

**Round 3 — Pass 1 (GRID structural).** Clean.

**Round 3 — Pass 2 (EOS conceptual independence).** Clean.

**Round 3 — Pass 3 (Linus adversarial).** Clean.

---

**Final Critique (Round 4 — Super Torvalds).** One foundational finding.

*FC1 — `decline` Decision points used implicit cross-reference for expiry check.* `decline`'s Decision points said "Expiry check applies as above" — a reference to `accept`'s expiry check. An auditor reading only `decline`'s Decision points received no expiry logic. Fixed: `decline` Decision points now state the check explicitly inline: "If `status = Pending` and `now >= expires_at`, the atom treats the invitation as expired. It may lazily transition to `Expired` at this point and return `already-resolved(Expired)`." The implicit cross-reference is removed.

Final Critique 4 closed clean after FC1 fix.

**Structural decisions made in draft.**

- *`Declined` is a named terminal state.* The atom could have treated declination as the invitee simply not accepting (i.e., letting the invitation expire). It does not. `Declined` is a deliberate, named terminal state because a human's active refusal is semantically different from passive non-use, and the audit record should be able to distinguish them. This is the primary EOS Pass 2 distinction from Capability (which has no `declined` state).
- *`decline` takes no identity argument.* The declining actor's identity is not recorded. Rationale: the invitation is a bearer token; the atom cannot verify that the decliner is the intended invitee; recording an unverified identity on the declination record would create false confidence. Composing patterns that need to record who declined may do so. The atom records only the fact of declination and the timestamp.
- *`invitee_ref` is nullable.* The atom permits initiating an invitation without a known system identity for the invitee, because this matches the most common real-world scenario: an invitation is sent to an email address before the person has a system account. Forcing non-null `invitee_ref` would require a two-step process (create a placeholder identity, then invite) that belongs to the composing pattern, not the atom.
- *`already-resolved(state)` carries the terminal state.* The rejection includes the specific terminal state so the caller knows what resolution occurred, not just that the invitation is no longer actionable. This is load-bearing for concurrent acceptance handling: the second concurrent `accept` call learns that the invitation is already `Accepted` (not `Declined` or `Revoked`), and the composing External Onboarding pattern can proceed with the appropriate response.
- *EOS Pass 2 confirmation against Capability.* This spec was written with Capability (atom #13) as the explicit Pass 2 mirror. The question was: can Invitation be specified without naming Capability? Yes — the atom's state machine, actions, and invariants are fully specified without referencing Capability. The distinction (`Declined` state, identity binding at acceptance) is internal to Invitation's own specification. The two atoms do not collapse.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 2 (single-resolution — check-and-commit Pending→terminal must be atomic under concurrent accept/decline/revoke) is a concurrency-safety claim. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`invitation.tla`](./invitation.tla) + config [`invitation.cfg`](./invitation.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* one invitation, `state` in {Pending, Accepted, Declined, Expired, Revoked}; the load-bearing **Invariant 2** (single-resolution — exactly one transition out of Pending, immutable thereafter) via a ghost `resolution` recording the first terminal reached: `Inv_SingleResolution == resolution # none ⇒ state = resolution`. Each resolving action guards on `state = Pending`, so under concurrent accept/decline/revoke the first interleaved winner resolves and every later attempt is disabled (the already-resolved rejection). Exhaustive: 5 states, holds. *Buggy twin* [`invitation-buggy.tla`](./invitation-buggy.tla) drops the Pending guard on `Accept`, allowing an already-resolved invitation to be re-resolved; rejected at 6 states (Decline → AcceptBuggy → state Accepted while resolution Declined). *Out of model scope:* identity binding at accept, field validation, id discipline. *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.
