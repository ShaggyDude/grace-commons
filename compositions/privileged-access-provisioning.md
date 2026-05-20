---
title: Privileged Access Provisioning
parent: Compositions
nav_order: 9
has_toc: true
toc: true
---

# Privileged Access Provisioning

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A regulated application: a principal's request for elevated access to a protected resource is gated by a mandatory multi-party approval chain; only after all required approvals commit does the composition allocate a time-limited, scoped Capability token to the requesting principal. Session validity is checked before every access exercise. The full arc — request, approvals, provisioning, access exercise, expiry, and revocation — is auditable from records alone, with attribution at every decision point.

---

## Intent

Privileged access — access to financial controls, patient records, production credentials, source-of-truth databases, cryptographic key material — differs from ordinary access in two ways. First, the grant itself must be authorized by more than one party: a single administrator who can self-approve elevated access to any resource is a control failure under every regulated framework from SOX to HIPAA to PCI DSS. Second, the access must be time-limited and scoped: indefinite standing access to privileged resources is the most common finding in security audits, because standing access that outlives the business need is indistinguishable from residual access that was never intended.

The constituent atoms address neither property alone. [Multi-Party Approval](./multi-party-approval.md) enforces the approval gate but does not produce the access artifact. [Capability](../atoms/compliance/capability.md) produces the time-limited scoped access token but knows nothing about whether an approval chain cleared. [Session](../atoms/compliance/session.md) validates the authenticated channel but does not gate any downstream action. [Credential](../atoms/compliance/credential.md) authenticates the principal but does not know what they are requesting access to. The composition is the layer that wires these concerns into a single, enforceable arc: no Capability is issued without an Approved chain; no access exercise succeeds without an active Session; the full arc is recorded in one tamper-evident Audit Trail.

The load-bearing design decision is that privileged access is modeled as a Capability token rather than a Permissions grant. Permissions grants are persistent until revoked and identity-keyed — they say "this actor may perform this action, indefinitely." Capability tokens are time-bounded, scoped, and bearer-keyed — they say "whoever holds this token may exercise this specific access once (or N times), until this date." Privileged access is temporary authorization, not standing access. The bearer-key property of Capability is a feature here: the access token can be handed off to an automated system or a break-glass process without requiring the executing agent to carry the principal's identity. The Capability's audit record names the allocator (the composition, acting on behalf of the approved request) and the requestor (via the request record); it intentionally does not name the redeemer. This is the audit-subject asymmetry the composition must defend: the approval chain names every approver; the access exercise names only the session under which it occurred, not the bearer who presented the token.

This composition is the library's worked example of approval-gated provisioning — the pattern that recurs in privileged access management (PAM), break-glass access, time-boxed administrative escalation, and regulated change-control access in financial, healthcare, and government systems.

---

## Summary

Privileged Access Provisioning is a regulated composition that enforces the full lifecycle of a privileged access request: initiation under a named requestor, mandatory multi-party approval, Capability-token provisioning on approval, session-validated access exercise, and explicit revocation or natural expiry. It composes five constituents: Multi-Party Approval (the approval-gate substrate), Credential (authentication of the requesting principal and the approvers), Session (the time-limited authenticated channel checked before every access exercise), Capability (the provisioned access token), and Audit Trail (the regulated-audit substrate shared across all five stages of the arc).

The composition's central structural commitment is **approval-gates-provisioning**: no Capability token exists for a privileged access request without a corresponding Approved chain record in Multi-Party Approval. The check is not advisory — the composition's action wiring makes it structurally impossible to allocate a Capability for a request whose chain has not reached `Approved`. An auditor can verify this from the records alone by confirming that every Capability token in the provisioned-access store has a corresponding `Approved` chain record; a Capability without an Approved chain is evidence of a bypass.

The second structural commitment is **session-gated exercise**: `exercise_access` validates the caller's `session_token` against Session's validity surface before redeeming the Capability. A Session that has expired or been revoked — including cascading invalidation triggered by Credential revocation under the Login composition — blocks the access exercise before the Capability is even presented. The session check is not advisory; it is the first operation of `exercise_access`, and a non-`valid` result from `Session.validate` returns `rejected(session-invalid)` without touching the Capability.

The third commitment is **single Audit Trail across all five stages**: approval chain events (from Multi-Party Approval), provisioning events (Capability allocation, attribution pairing), and access-exercise events are all recorded in the same Audit Trail instance, producing one tamper-evident chain from which the full arc is reconstructable. An auditor reading the Audit Trail can trace any access exercise backward to the Capability, to the provisioning event, to the Approved chain record, to the individual approver attestations, to the original request. There is no gap in the chain and no second store to correlate.

The resulting arc has six states: `Pending` (request submitted, approval chain in progress), `Approved` (chain cleared, provisioning cascade firing — internal transient state, not externally stable; transitions to `Provisioned` or quarantined-failure atomically within the same action), `Provisioned` (Capability token active), `Denied` (approval chain rejected), `Withdrawn` (request withdrawn before approval), `Revoked` (Capability revoked after provisioning). Expiry of the Capability is reflected in the Capability store rather than as a separate request state; a request in `Provisioned` state with an `Expired` Capability record is fully readable from the two stores together.

---

## Composes

- **[Multi-Party Approval](./multi-party-approval.md)** — the approval-gate substrate. The composition maintains one Multi-Party Approval instance whose chain-store `subject_ref` is the `request_id` and whose `scope` is the `access_scope` of the request. Every privileged access request maps one-to-one to a Multi-Party Approval chain. Chain-level actions (`initiate_chain`, `approve_step`, `reject_step`, `withdraw_chain`) are exposed through this composition's surface, which adds session-validation and Audit Trail recording around the passthrough. Multi-Party Approval's own Audit Trail substrate is the same Audit Trail instance this composition uses for provisioning and access-exercise events — one Audit Trail instance for the full arc.

- **[Credential](../atoms/compliance/credential.md)** — the authentication surface for the requesting principal and for the approvers. The composition calls `Credential.verify` to confirm the requestor's credential is Active before a request is accepted, and again before each approver step is routed (ensuring the approver has not been revoked between chain initiation and decision). Credential is not independently managed by this composition — it is queried read-only. The composition does not call `register`, `rotate`, or `revoke` on any Credential; those are Login's (C13) or the identity-management surface's concern.

- **[Session](../atoms/compliance/session.md)** — the time-limited authenticated channel. The composition calls `Session.validate(session_token)` as the first step of `exercise_access`. If the session is not `valid` — expired, revoked, or not known — the exercise is rejected before the Capability is presented. Session is not independently managed by this composition; it is queried read-only. Sessions are issued by the Login composition (C13). The cascade from Credential revocation through Session invalidation through blocked `exercise_access` calls is the composition's cascading-revocation emergent invariant.

- **[Capability](../atoms/compliance/capability.md)** — the provisioned access token. The composition calls `Capability.allocate` once, on the event that the Multi-Party Approval chain reaches `Approved`, producing the bearer token delivered to the requestor. `max_redemptions` is deployment-configurable (default 1 for single-exercise privileged access; higher for break-glass or time-boxed access with multiple permitted uses). `Capability.redeem` is called inside `exercise_access` after Session validation passes. `Capability.revoke` is called by `revoke_access`. The redeemer's identity is intentionally not recorded by the Capability atom; the session under which `exercise_access` was called is the closest the audit record comes to a redeemer identity.

- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. One Audit Trail instance is maintained across all five stages of the arc. Multi-Party Approval's approval-chain events, the provisioning event (`access_provisioned`), and each access-exercise event (`access_exercised`) and revocation event (`access_revoked`) are all recorded in this instance. The instance is configured with the host's regulatory retention policy at deployment. Event Log, Actor Identity, Retention Window, and Tamper Evidence are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms.

---

## Composition logic

### Application state

The composition owns emergent state that wires the constituent atoms into one queryable access-request surface:

- **`request_store`** — the set of access request records. Each record carries `request_id`, `requestor_ref`, `resource_ref`, `access_scope`, `justification`, `requested_at`, `expires_at` (computed from `ttl` at request time), `state` (Pending | Approved | Provisioned | Denied | Withdrawn | Revoked), and `denial_reason` (nullable; set when state transitions to `Denied`). `request_id`, `requestor_ref`, `resource_ref`, `access_scope`, `justification`, `requested_at`, and `expires_at` are immutable once written. `state` is the only mutable field; it advances forward only.

- **`request_to_chain`** — map from `request_id` to the `chain_id` in Multi-Party Approval. Set at `request_access` time and immutable. Every request maps to exactly one chain.

- **`request_to_capability`** — map from `request_id` to the `capability_token` in Capability. Set at provisioning time (the transition from `Approved` to `Provisioned`) and immutable. Only requests in `Provisioned`, `Revoked`, or (implicitly) `Expired` state have an entry in this map.

- **`session_access_log`** — append-only record of each `exercise_access` call that reached the Capability redeem step. Each entry carries `request_id`, `session_token`, `capability_token`, `exercised_at`, and `result` (`redeemed` | `capability-invalid(reason)`). Populated regardless of whether the Capability.redeem call succeeds or fails (if Session.validate succeeds and the call reaches the Capability step). Never modified after write.

### Configuration

- **`default_ttl`** — the Capability token's time-to-live if the requestor does not supply a `ttl`. Deployment-configurable. Must be positive. Absent default is `invalid-request`.

- **`max_redemptions_default`** — the `max_redemptions` value passed to `Capability.allocate` when not overridden by the requestor. Defaults to 1 (single-exercise). Deployments permitting multi-use privileged access tokens configure higher values; the maximum permitted value is itself deployment-configurable.

- **`credential_check_on_request`** — whether `Credential.verify` is called against the requestor's credential before accepting the request. Defaults to `true`. Deployments that manage requestor credential verification upstream may disable; disabling does not change the session-validation requirement at `exercise_access`.

- **`approver_set_minimum`** — passed through to Multi-Party Approval's configuration. The composition enforces that privileged access requires genuine multi-party approval by defaulting this to 2. A deployment that wants single-approver privileged access explicitly sets this to 1; the audit record reflects the single-approver configuration.

- **`audit_trail_retention_policy`** — the policy reference passed to Audit Trail at each `record_action` call. Typically `sox_7_year`, `hipaa_6_year`, or `pci_dss_1_year` depending on the regulated domain. Deployment-configurable.

- **`application_actor_ref` and `application_credential`** — the composition's service identity, used to attribute system-originated events (provisioning, cascade steps) in the Audit Trail. Same discipline as Multi-Party Approval's `application_actor_ref`. The deployment provisions and rotates this credential; its compromise surface and forgery defense follow the same reasoning as documented in Multi-Party Approval's Configuration section.

### Action wiring

**`request_access(requestor_ref, resource_ref, access_scope, justification, approver_set, quorum_rule, ttl?, credential?) → request_id | rejected(invalid-request | permission-denied | credential-invalid | storage-failure)`**

1. Validate: `requestor_ref`, `resource_ref`, `access_scope`, `justification` must be non-null and non-empty; `ttl` must be positive if supplied. Any violation: `invalid-request`.
2. Call `Permissions.permitted(requestor_ref, requests:initiate)` → if `denied`, return `permission-denied`.
3. If `credential_check_on_request` is enabled: call `Credential.verify(credential, requestor_ref)` → if not `verified`, return `credential-invalid`.
4. Allocate a fresh `request_id`. Record the request in `request_store` with `state = Pending`, `requested_at = now`, `expires_at = now + ttl` (or default).
5. Call `MultiPartyApproval.initiate_chain(actor_ref=requestor_ref, subject_ref=request_id, scope=access_scope, approver_set, quorum_rule)` → `chain_id | rejected(...)`. On rejection, roll back the `request_store` write and surface `invalid-request` or `storage-failure` as appropriate.
6. Record `request_to_chain[request_id] = chain_id`.
7. Call `AuditTrail.record_action(action_ref=access_requested, actor_ref=requestor_ref, credential, data={request_id, resource_ref, access_scope, justification, approver_set, quorum_rule, expires_at}, retention_policy)`.
8. If any write after step 4 fails, roll back and return `storage-failure`.
9. Return `request_id`.

**`approve_step(actor_ref, request_id, step_id, reason?, credential) → approved | rejected(invalid-request | not-known | not-pending | unauthorized | credential-invalid | recording-failure)`**

1. Look up `chain_id = request_to_chain[request_id]`. If not found, `not-known`.
2. Call `Credential.verify(credential, actor_ref)` → if not `verified`, return `credential-invalid`. The approver's credential must be Active at decision time.
3. Call `MultiPartyApproval.approve_step(actor_ref, chain_id, step_id, reason?)` → propagates rejection taxonomy unchanged. On `recording-failure`, surface unchanged.
4. Call `AuditTrail.record_action(action_ref=approval_step_decided, actor_ref, credential, data={request_id, step_id, decision=approved, reason})`.
5. **Chain state evaluation**: query `MultiPartyApproval.read_chain(chain_id)`. If chain `state` is now `Approved`, fire the **provisioning cascade** (see below). If chain `state` is `Rejected`, transition `request_store[request_id].state` to `Denied`, set `denial_reason`, and call `AuditTrail.record_action(action_ref=access_denied, actor_ref=application_actor_ref, ...)`.
6. Return `approved`.

**`reject_step(actor_ref, request_id, step_id, reason, credential) → rejected_outcome | rejected(invalid-request | not-known | not-pending | unauthorized | credential-invalid | recording-failure)`**

Mirrors `approve_step` steps 1–4 with `decision=rejected`. At step 5: if chain `state` is `Rejected`, transition request to `Denied`. `reason` is required (Approval Step Invariant 6 enforces it at the atom level).

**`withdraw_request(actor_ref, request_id, reason, credential) → withdrawn | rejected(invalid-request | not-known | not-pending | unauthorized | credential-invalid | recording-failure)`**

1. Look up `request_id`. If not found, `not-known`. If `state` is not `Pending`, `not-pending`.
2. Call `Credential.verify(credential, actor_ref)`.
3. Check Permissions: the requestor may withdraw their own request; an actor with `requests:withdraw` scope may withdraw any request.
4. Call `MultiPartyApproval.withdraw_chain(actor_ref, chain_id=request_to_chain[request_id], reason)`.
5. Transition `request_store[request_id].state` to `Withdrawn`.
6. Call `AuditTrail.record_action(action_ref=access_request_withdrawn, actor_ref, credential, data={request_id, reason})`.
7. Return `withdrawn`.

**`exercise_access(session_token, capability_token) → exercised | rejected(session-invalid(reason) | capability-invalid(reason) | not-known)`**

1. Call `Session.validate(session_token)` → `valid | invalid(expired | revoked | not-known)`. If not `valid`, return `rejected(session-invalid(reason))`. The session check is the first operation; a non-`valid` result returns immediately without touching the Capability.
2. Look up `request_id` via inverse lookup on `request_to_capability`. If `capability_token` is not in the map, `not-known`.
3. Call `Capability.redeem(capability_token)` → `redeemed | invalid(exhausted | expired | revoked | not-known)`.
4. Append to `session_access_log` regardless of step 3's outcome: `{request_id, session_token, capability_token, exercised_at=now, result}` where `result` is `redeemed` on success or `capability-invalid(reason)` on failure. The log records every `exercise_access` call that reached the Capability step — including failed attempts — because a presented-but-exhausted, presented-but-expired, or presented-but-revoked token is itself an auditable event.
5. If step 3 returned `invalid(reason)`, call `AuditTrail.record_action(action_ref=access_exercise_failed, actor_ref=application_actor_ref, data={request_id, capability_token, session_token, reason})` and return `rejected(capability-invalid(reason))`.
6. Call `AuditTrail.record_action(action_ref=access_exercised, actor_ref=application_actor_ref, data={request_id, capability_token, session_token, exercised_at})`.
7. Return `exercised`.

Note: the Audit Trail entry records `session_token` but not the session's `principal_ref` — the composition does not look up the session's owner. The `session_token` is sufficient for an auditor who can cross-reference the Session store to recover the principal. This preserves the architecture's layering: the composition does not reach inside the Session atom to extract fields it was not given.

**`revoke_access(actor_ref, request_id, reason, credential) → revoked | rejected(invalid-request | not-known | not-provisioned | credential-invalid | recording-failure)`**

1. Look up `request_id`. If not found, `not-known`. If `state` is not `Provisioned`, `not-provisioned`.
2. Call `Credential.verify(credential, actor_ref)`.
3. Check Permissions: actor must hold `requests:revoke` scope.
4. Call `Capability.revoke(capability_token=request_to_capability[request_id], revoked_by_ref=actor_ref, reason)`.
5. Transition `request_store[request_id].state` to `Revoked`.
6. Call `AuditTrail.record_action(action_ref=access_revoked, actor_ref, credential, data={request_id, reason})`.
7. Return `revoked`.

### Provisioning cascade

The provisioning cascade fires when `MultiPartyApproval.read_chain` returns `state = Approved` after an `approve_step` call. It is internal to the composition:

1. Call `Capability.allocate(allocated_by_ref=application_actor_ref, scope=request.access_scope, resource_ref=request.resource_ref, max_redemptions=max_redemptions_default, ttl=request.expires_at - now)` → `capability_token | rejected(...)`. On rejection, the request transitions to a quarantined sub-state (chain `Approved` but capability allocation failed); this is a `recording-failure` surfaced to the `approve_step` caller.
2. Record `request_to_capability[request_id] = capability_token`.
3. Transition `request_store[request_id].state` from `Approved` to `Provisioned`.
4. Call `AuditTrail.record_action(action_ref=access_provisioned, actor_ref=application_actor_ref, data={request_id, capability_token, requestor_ref=request.requestor_ref, resource_ref, access_scope})`.
5. Deliver `capability_token` to the requestor via the deployment's notification or return channel.

The provisioning cascade is the composition's most critical operation. Invariant 1 (approval-gates-provisioning) depends on this cascade being the only path through which a `capability_token` enters `request_to_capability`. Any implementation path that writes to `request_to_capability` without going through the cascade violates Invariant 1.

### Scope vocabulary

The composition defines these scopes for its Permissions instance:

| Scope | Permits |
|-------|---------|
| `requests:initiate` | Call `request_access` |
| `requests:withdraw` | Withdraw any access request (requestors may always withdraw their own) |
| `requests:revoke` | Call `revoke_access` on any provisioned request |
| `requests:read` | Query request records and their associated chain, capability, and audit events |

---

## Behavior

- **Approval-gates-provisioning is structurally enforced, not advisory.** The action wiring makes it impossible to allocate a Capability for a request via the composition's surface without the Multi-Party Approval chain for that request reaching `Approved`. The provisioning cascade is the only path from chain-approval to capability-allocation; there is no `provision_access` action a caller can invoke directly. An implementation that provides a direct provisioning path outside the cascade violates Invariant 1.

- **Session validity is the first check at access exercise, not an afterthought.** `exercise_access` calls `Session.validate` before touching the Capability. A revoked or expired session blocks the exercise regardless of whether the Capability is still valid. This is the composition's enforcement of the cascading-revocation invariant: Credential revocation → Session invalidation (via Login/C13) → `exercise_access` returns `session-invalid` → privileged access blocked without any direct action on the Capability or the request record.

- **The Capability's bearer-key property is preserved, not subverted.** The composition does not add an identity check at redemption time. `exercise_access` takes a `session_token` (to verify the authenticated channel) and a `capability_token` (to present to the Capability atom). It records both in the access log and the Audit Trail. The Audit Trail entry names the `session_token` — traceable to a principal by an auditor querying the Session store — but does not name the principal directly in the access-exercise record. The audit-subject asymmetry is intentional and documented: the approval chain names every approver; the access exercise names the authenticated channel, not the bearer's identity at the moment of presentation.

- **One Audit Trail covers the full arc.** Every event from `access_requested` through approval decisions through `access_provisioned` through each `access_exercised` through `access_revoked` is recorded in the same Audit Trail instance. The temporal sequence of these events in the Event Log is the structural form of the full arc. No second store is required to reconstruct the arc; no correlation step is needed.

- **Credential revocation blocks both new requests and existing approvals.** If an approver's Credential is revoked between chain initiation and their decision, step 2 of `approve_step` (Credential.verify) returns `not-verified` and the step is rejected with `credential-invalid`. The approval chain remains in-flight; the revoked approver's step remains Pending. The chain can be withdrawn and re-initiated with a replacement approver. This is the correct behavior: a decision from a revoked actor is not valid evidence of approval.

---

## Invariants

**Invariant 1 — Approval-gates-provisioning.** Every Capability token in `request_to_capability` has a corresponding Multi-Party Approval chain record in `Approved` state. A `capability_token` whose `request_id` maps to a chain that is not `Approved` is evidence of a provisioning bypass — a critical control failure. The provisioning cascade is the only write path to `request_to_capability` through the composition's surface.

**Invariant 2 — Request-capability bijection.** Each `request_id` maps to at most one `capability_token` across the lifetime of the system. A second Capability is never allocated for a request that has already been provisioned; re-access requires a new request with a new approval chain. This preserves the audit property that each access token traces back to exactly one documented approval decision.

**Invariant 3 — Session-gated exercise.** Every `access_exercised` event in the Audit Trail was preceded in the same session by a `valid` result from `Session.validate`. No `capability_token` is redeemed through this composition's surface without a prior session-validity confirmation in the same `exercise_access` call.

**Invariant 4 — Cascading-revocation chain.** Revoking the requestor's Credential invalidates all Sessions derived from it (Login/C13 cascade). Any subsequent `exercise_access` call under an invalidated session returns `session-invalid` before the Capability is presented. The chain spans three composition layers (Credential → Session → exercise_access gate) and is not expressible at any single constituent atom layer.

**Invariant 5 — Audit-arc completeness.** Every access request record in `request_store` has at least one corresponding Audit Trail event with `action_ref = access_requested`. Every provisioned request has at least one `access_provisioned` event. Every access exercise recorded in `session_access_log` with `result = redeemed` has a corresponding `access_exercised` Audit Trail entry. An auditor can reconstruct the full arc — from first request to last access — from the Audit Trail alone.

**Invariant 6 — Approver-credential completeness.** Every approval decision (`approve_step`, `reject_step`) has a `Credential.verify` check against the approving actor's credential immediately before the step is recorded. No approval decision is attributed to an actor whose Credential was not Active at the time of decision. A decision attributed to a revoked or expired credential is evidence of a verification bypass.

**Invariant 7 — Denial completeness.** Every request that transitions to `Denied` has a corresponding `access_denied` Audit Trail event naming the chain's final state and the `denial_reason`. An auditor can determine from the records alone which requests were denied, by which quorum failure, and when.

**Invariant 8 — Immutable request identity.** Once a request record is created, `request_id`, `requestor_ref`, `resource_ref`, `access_scope`, `justification`, `requested_at`, and `expires_at` never change. The `state` field advances forward only; no terminal state returns to `Pending`.

**Invariant 9 — Single Audit Trail instance.** The same Audit Trail instance receives events from Multi-Party Approval (approval chain events), from the provisioning cascade (`access_provisioned`), and from `exercise_access` and `revoke_access`. A deployment that routes these event classes to separate Audit Trail instances violates this invariant and fragments the arc — an auditor reading one instance will see an incomplete record.

**Invariant 10 — Session-access-log durability.** Once written, entries in `session_access_log` are never modified or deleted. The log records every `exercise_access` call that reached the Capability step — including calls where `Capability.redeem` returned `invalid` — and is the operational-audit surface for access-exercise frequency, failed-presentation detection, session correlation, and capability exhaustion analysis. A log entry with `result = capability-invalid(revoked)` is evidence that someone presented a revoked token under a valid session; that signal is auditable from the log alone.

---

## Examples

### Happy path — privileged database access under two-approver gate

An engineer requests read access to a production database for incident investigation:

`request_access(requestor_ref: eng_u42, resource_ref: db::prod::incidents, access_scope: "read", justification: "INC-2891 investigation — prod log correlation", approver_set: [mgr_u10, sec_u03], quorum_rule: all-of-2, ttl: 3600) → request_id: req_p7h3k2`

Both approvers receive Assignment in-tray notifications. The security lead approves first:

`approve_step(actor_ref: sec_u03, request_id: req_p7h3k2, step_id: step_s1, reason: "INC-2891 confirmed active", credential: cred_s03)`

The chain is still Pending (one of two). The manager approves:

`approve_step(actor_ref: mgr_u10, request_id: req_p7h3k2, step_id: step_s2, reason: "authorized", credential: cred_m10)`

The chain reaches `Approved`. The provisioning cascade fires: `Capability.allocate(scope: "read", resource_ref: db::prod::incidents, max_redemptions: 1, ttl: 3600)` → `capability_token: cap_9f2d1e`. The request transitions to `Provisioned`. The engineer receives `cap_9f2d1e`.

The engineer authenticates (via Login, out of scope here) and acquires `session_token: sess_a4b7c1`. They exercise the access:

`exercise_access(session_token: sess_a4b7c1, capability_token: cap_9f2d1e) → exercised`

Session validates as `valid`. Capability redeems as `redeemed` (counter: 0 → exhausted, terminal). Access log entry written. Audit Trail records `access_exercised`.

### Rejection path — first approver rejects; quorum unachievable

A request under `all-of-2` quorum receives a rejection from the first approver:

`reject_step(actor_ref: sec_u03, request_id: req_q5m8n1, step_id: step_s1, reason: "requestor does not have business need for this scope", credential: cred_s03)`

Under `all-of-2`, one rejection makes quorum unachievable. Multi-Party Approval transitions the chain to `Rejected`. The composition detects this at step 5 of `reject_step` and transitions the request to `Denied`, recording `denial_reason`. The Audit Trail records `access_denied`. No Capability is ever allocated. Any subsequent `exercise_access` attempt returns `not-known` (the `capability_token` was never issued; the `request_to_capability` map has no entry for this `request_id`).

### Rejection path — session invalid at exercise time

An engineer was provisioned access (Capability token issued after approval). Before they can exercise it, an administrator revokes their Credential (employment terminated):

`Credential.revoke(credential_id: cred_e42, revoked_by_ref: hr_admin, reason: "employment-terminated")`

The Login composition detects this and invalidates all Sessions derived from `cred_e42`, including `sess_a4b7c1`. The Session record transitions to `Revoked`.

The engineer (or an attacker with their token) attempts:

`exercise_access(session_token: sess_a4b7c1, capability_token: cap_9f2d1e) → rejected(session-invalid(revoked))`

`Session.validate(sess_a4b7c1)` returns `invalid(revoked)`. The Capability is never presented. The Capability token `cap_9f2d1e` remains in `Allocated` state — unconsumed and revocable. The access log records no entry for this attempt (the session check failed before reaching the Capability step).

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

**Regulator audit — SOX §404 privileged access control.** An external auditor asks *"can you prove that no one accessed the production financial database with elevated privileges without documented, multi-party authorization?"* The auditor queries the Audit Trail for all `access_exercised` events with `resource_ref` matching the financial database. For each event, they trace backward: `access_exercised` → `access_provisioned` (same `request_id`) → Multi-Party Approval chain (same `chain_id`) → individual `approval_step_decided` events with approver references and credentials. Invariant 5 (audit-arc completeness) guarantees the chain is in the Audit Trail. Invariant 1 (approval-gates-provisioning) guarantees that every `access_exercised` event traces to an `Approved` chain. The auditor verifies both invariants from the records alone: count the `access_exercised` events; confirm each has a corresponding `access_provisioned`; confirm each `access_provisioned` has a corresponding chain in `Approved` state with the required number of decision records. No gap and no single-approver grants appear. SOX §404 is satisfied from the records alone.

**Disputed access — former employee denies using privileged token.** A security investigation reveals that the production credentials database was queried at `2026-11-14T03:22:00Z`. A former employee claims they did not access it. The investigator queries `session_access_log` for `access_exercised` entries with `resource_ref = db::prod::credentials` and `exercised_at` in the window. The log returns one entry: `{request_id: req_r9s4t1, session_token: sess_x7y2z9, capability_token: cap_3a1b2c, exercised_at: 2026-11-14T03:22:11Z}`. The investigator queries the Session store for `sess_x7y2z9`: the session was issued to `principal_ref: user_u88` (the former employee's identity) at `03:15Z` on the same date and expired at `04:15Z`. The approval chain for `req_r9s4t1` shows the former employee was the `requestor_ref` and both approvers approved on `2026-11-14T02:58Z`. Invariant 3 (session-gated exercise) guarantees the session was `valid` at the moment of exercise; Invariant 5 (audit-arc completeness) guarantees the access record is in the Audit Trail. The former employee's bearer of `cap_3a1b2c` operated under a session tied to their identity. The investigation has a structural record.

**Breach investigation — approval gate bypassed?** A security team discovers that access to a high-security vault was exercised (`access_exercised` appears in the Audit Trail at `2026-12-01T18:44Z`). They want to confirm the approval gate was not bypassed. They query `request_to_capability` for the `capability_token` in the audit entry, recovering `request_id: req_v2w5x8`. They query `request_store[req_v2w5x8]`: state is `Provisioned`, `chain_id` is present. They query Multi-Party Approval for `chain_id`: state is `Approved`, two decision records present, both with verified approver credentials. Invariant 1 is satisfied. They also check: is there any `capability_token` in the Capability store that is *not* in `request_to_capability`? Any such token would be evidence of out-of-band allocation. The Capability store lists all allocated tokens; cross-referencing against `request_to_capability` is the structural bypass-detection check. If all tokens are accounted for, the approval gate was not bypassed. Invariant 1 makes this check deterministic.

---

## Edge cases and explicit non-goals

- **Approval chain composition is Multi-Party Approval's concern.** This composition surfaces the chain-initiation and step-decision actions as pass-throughs. The quorum rules (`all-of-N`, `M-of-N`, `one-of-N`), the trailing-decision behavior, the partial-failure recovery paths, and the cascading withdrawal logic are all owned by Multi-Party Approval. See its specification for those details.

- **Capability expiry is lazy.** When a `Provisioned` request's Capability TTL passes without exercise, the Capability transitions to `Expired` at the next `exercise_access` call or `Capability.revoke` call that detects the expiry (lazy-expiry path per the Capability atom). The request record's `state` remains `Provisioned` in the `request_store`; the Capability record carries `Expired`. An auditor reading both records sees the full picture. A background scheduler may eagerly call `Capability.expire` per the Capability atom's `expire` action; if it does, the request record remains `Provisioned` and the Capability record transitions to `Expired` before any `exercise_access` attempt. In either case, a subsequent `exercise_access` returns `rejected(capability-invalid(expired))`.

- **Re-access after expiry or revocation requires a new request.** There is no `renew` or `re-provision` action. If access is needed after the Capability expires or is revoked, the requestor calls `request_access` again with a fresh justification, which initiates a new approval chain. The old request record and its chain remain in the store as immutable history. Invariant 2 (request-capability bijection) guarantees no second Capability is issued against the old `request_id`.

- **Credential revocation of the requestor does not auto-revoke the Capability.** Revoking the requestor's Credential invalidates their Sessions, which blocks `exercise_access` via the session check. But the Capability token itself remains `Allocated` until its TTL expires or an administrator calls `revoke_access`. A deployment that requires immediate Capability revocation on Credential revocation must implement a listener that calls `revoke_access` when Credential revocation events appear in the Audit Trail. This composition does not implement that listener; it is a composing-system obligation. The composition provides the `revoke_access` action precisely to support this pattern.

- **Who receives the Capability token is a delivery concern.** The composition allocates the Capability token and records it in `request_to_capability`. Delivering it to the requestor — via notification, response payload, or a secure channel — is the deployment's responsibility. The Capability atom's `allocate` action returns the token to the composition; the composition records it and surfaces it in the provisioning cascade's step 5. The delivery mechanism (push notification, pull from a secure store, email link) is out of scope.

- **This composition does not implement Login.** Session issuance (Credential verification → Session.issue) is C13 (Login). This composition assumes sessions have already been established by Login and validates them at access-exercise time. A deployment that has not wired Login must satisfy the session-validation precondition through an equivalent mechanism.

- **Authorization policy — who may request access to what — is a deployment configuration.** The composition checks Permissions for `requests:initiate` before accepting a request, but it does not define the policy for which principals may request access to which resources. That policy is encoded in the Permissions store's grant records and is owned by the deployment's authorization surface. This composition enforces that the policy is checked; it does not define the policy.

- **Multi-use Capability tokens.** `max_redemptions` defaults to 1 (single-exercise), but the composition supports `max_redemptions > 1` for break-glass or time-boxed access scenarios. When `max_redemptions > 1`, the `session_access_log` records each exercise separately; the Capability's `remaining_redemptions` counter decrements on each `redeem` call; the request transitions to effectively-exhausted when the counter reaches 0 (Capability state: `Redeemed`), but the `request_store` state remains `Provisioned` until explicit revocation or natural expiry. An auditor reading both stores recovers the full usage picture.

---

## Composition notes

- **[Login (C13)](../ROADMAP.md)** — the upstream composition that issues Sessions. This composition depends on Sessions being issued by Login (Credential.verify → Session.issue → session_token returned to principal). Without Login or an equivalent session-issuance surface, `exercise_access` always returns `session-invalid(not-known)`. Login is a peer composition, not a constituent; the two share the same Session and Credential atoms but own distinct composition-level surfaces.

- **[Session-Gated Authorization (C14)](../ROADMAP.md)** — a peer composition that gates permission checks on session validity. Privileged Access Provisioning gates Capability redemption on session validity; Session-Gated Authorization gates Permissions.permitted checks. The two are structurally parallel: both call `Session.validate` before a downstream action, neither managing Session issuance. A deployment that wires both ensures that session validity is checked consistently at every protected surface — Capability redemption and Permissions evaluation alike.

- **[External Onboarding (C16)](../ROADMAP.md)** — in regulated deployments where privileged users are external contractors or auditors rather than internal employees, External Onboarding (Invitation → Party Identity → Credential registration) is the upstream surface that establishes the requestor's Credential. A `request_access` call with an unregistered `requestor_ref` fails the Credential.verify check at step 2. External Onboarding establishes the Credential that this composition verifies.

- **[Capability-Backed Sharing (C15)](../ROADMAP.md)** — a peer composition that uses Capability for resource disclosure rather than privileged access. The two compositions share the Capability atom but wire it to different upstream gates: C15 gates on Selective Disclosure policy; this composition gates on Multi-Party Approval. The structural similarity — approve first, allocate Capability second, record in Audit Trail third — is the pattern the library names as approval-gated capability provisioning.

- **Tamper Evidence** — in regulated deployments where the approval chain records and the Capability provisioning record are used as legal evidence (court proceedings, regulatory enforcement), composing with Tamper Evidence directly on the `request_store` and `request_to_capability` maps provides cryptographic proof that no provisioning record was retroactively inserted or modified. The Audit Trail already applies Tamper Evidence to the event log; the composition's emergent state maps are an additional surface for those deployments that require it.

---

## Standards references

- **SOX §404 (Management Assessment of Internal Controls)** — privileged access to financial systems requires documented, multi-party authorization. This composition's approval-gates-provisioning invariant and its Audit Trail arc are the structural implementation of the §404 access-control evidence requirement. Every `access_exercised` event traces to a documented, approved request with named approvers.

- **HIPAA §164.312(a)(1) (Access Control)** — covered entities must implement technical policies and procedures for electronic information systems that allow access only to authorized users. The composition's multi-party approval gate is the authorization policy; the Credential.verify checks at both request and approval time ensure the actors in the arc are authenticated; the Session.validate check ensures the principal is currently authenticated at exercise time.

- **PCI DSS Requirements 7 and 8 (Restrict Access and Identify Users)** — Requirement 7 mandates that access to system components and cardholder data is restricted to only those individuals whose job requires such access. Requirement 8 mandates that all users are assigned a unique ID before access is allowed. This composition enforces both: the approval chain documents the business need; the `requestor_ref` and the Session record establish the unique user identity.

- **NIST SP 800-53 AC-2 (Account Management) and AC-6 (Least Privilege)** — AC-2 requires that privileged user accounts are authorized by senior officials and reviewed regularly. AC-6 requires that privileged access is limited to the minimum required. This composition models the authorization record (AC-2) and the time-limited, scoped Capability (AC-6's minimum-necessary principle expressed as a token with explicit TTL and scope).

- **NIST SP 800-53 AC-17 (Remote Access)** — in deployments where privileged access is exercised remotely, the session-gated exercise check enforces that remote access is only permitted under an authenticated session. The Audit Trail records the session token for every remote access exercise, satisfying the remote-access audit requirement.

- **ISO/IEC 27001 §A.9.2.3 (Management of Privileged Access Rights)** — the standard requires that the allocation and use of privileged access rights is controlled and restricted. This composition directly implements that control: allocation is gated by approval; use is gated by session validity; both are recorded in a tamper-evident log.

---

## Generation acceptance

A derived implementation of Privileged Access Provisioning is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the `request_store`, `request_to_capability`, `session_access_log`, Multi-Party Approval chain records, Capability records, Session records, and the shared Audit Trail, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm approval-gates-provisioning for every provisioned request.** For every entry in `request_to_capability`, confirm that a Multi-Party Approval chain record exists with `subject_ref = request_id` and `state = Approved`, and that the chain contains the required number of `approval_step_decided` records in `Approved` state consistent with the declared quorum rule. A `capability_token` without a corresponding `Approved` chain is evidence of a provisioning bypass. Invariant 1 is the structural guarantee.

- **Confirm session-gated exercise for every access exercise.** For every entry in `session_access_log` with `result = redeemed`, confirm that the `session_token` field references a Session record that was in `Active` state (i.e., `now < expires_at` and not revoked) at the recorded `exercised_at` timestamp. A redeemed access exercise under an expired or revoked session is evidence of a session-gate bypass. Invariant 3 is the structural guarantee.

- **Confirm approver-credential validity at decision time.** For every `approval_step_decided` Audit Trail entry, confirm that the approving actor's Credential record shows `Active` state at the recorded decision timestamp (i.e., `registered_at ≤ decision_at` and either no `expires_at` set or `expires_at > decision_at` and not revoked before that time). A decision by an actor whose Credential was not Active at decision time is evidence of a verification bypass. Invariant 6 is the structural guarantee.

- **Confirm denial completeness.** For every request in `request_store` with `state = Denied`, confirm that the Audit Trail contains an `access_denied` event for that `request_id` and that the corresponding Multi-Party Approval chain record shows `state = Rejected`. No denied request should be undocumented. Invariant 7 is the structural guarantee.

- **Reconstruct the full arc for any request.** Given a `request_id`, the following arc should be recoverable from the records alone without developer narration: who requested, against which resource and scope, when, with which justification; who the required approvers were and what each decided (with timestamps and credential references); when the Capability was provisioned; when and under which session each access exercise occurred; whether and when the access was revoked. This reconstruction requires no data beyond the stores named in this section.

---

## Status

`draft` — first draft. All required structural elements present: identity model, action wiring with complete rejection vocabularies, state machine (Pending → Approved → Provisioned | Denied | Withdrawn; Provisioned → Revoked), ten invariants, five examples (two happy path, one rejection path, three regulated adversarial scenarios), Generation acceptance (five checks), Standards references. Awaiting three-pass pressure testing.

---

## Lineage notes

First draft. No pressure-testing passes have run. Sections will be populated as passes complete.

**Conventions inherited.** This composition composes regulated atoms (Credential, Session, Capability) and a regulated composition (Multi-Party Approval, itself composing Audit Trail). It inherits the *Regulated adversarial scenarios* and *Generation acceptance* conventions from [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md) as a regulated composition.

**Structural decisions made in draft.**

- *Capability over Permissions for the provisioned access token.* The access token is a time-limited, scoped Capability rather than a Permissions grant. Rationale: privileged access should be temporary authorization, not standing access. Permissions grants are indefinite until revoked; Capability tokens carry an explicit TTL and a redemption counter. The time-bound property is the PAM (Privileged Access Management) industry's core discipline for break-glass and just-in-time access. The composing-system concern is scoping the Capability correctly at allocation time — the composition passes `access_scope` and `resource_ref` from the request record to `Capability.allocate`.

- *Single Audit Trail instance across all five stages.* Multi-Party Approval's approval-chain events and this composition's provisioning and access-exercise events are all recorded in the same Audit Trail instance. This is a deliberate departure from treating Multi-Party Approval's Audit Trail as internal state: the regulated audit question is about the full arc, not the approval chain in isolation. A deployment that routes approval events and access events to separate Audit Trail instances cannot answer the arc-reconstruction check in Generation acceptance without correlating two stores — which the records-alone bar disallows.

- *Session token (not principal identity) in the access-exercise audit record.* `access_exercised` records `session_token` rather than the session's `principal_ref`. Rationale: the composition does not look inside the Session atom to extract fields it was not given; the `session_token` is sufficient for an auditor who can cross-reference the Session store. This preserves the layering discipline: each atom owns its own field surface.

- *Credential.verify on every approver step.* The approver's Credential is verified immediately before each step decision. This ensures that approval decisions are only recorded against Active credentials. A decision from a recently-revoked approver is not accepted. The cost is one Credential.verify call per step decision; the benefit is that every recorded decision in the Audit Trail is backed by a verified Credential at decision time.
