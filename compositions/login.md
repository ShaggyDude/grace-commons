---
title: Login
parent: Compositions
nav_order: 13
has_toc: true
toc: true
---

# Login

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A regulated composition: a principal's presented credential material is verified against the durable binding in Credential, then — on success — a time-limited Session is issued and both lifecycle events are recorded in one tamper-evident Audit Trail. Revocation of a Credential cascades to every Session derived from it: the composition maintains a `credential_to_sessions` map that `revoke_sessions_for_credential` walks to invalidate the full derived set in a single operation. The cascade is the composition's load-bearing emergent invariant — it belongs to neither constituent atom alone.

---

## Intent

Every system that authenticates principals eventually faces the same composability problem: credential verification is a momentary check, session management is a bounded persistence concept, and audit recording is a regulated obligation — and none of the three atoms can see the other two. Credential answers *"does this material match what was registered?"* and returns immediately. Session issues a time-bounded token but makes no authentication judgment — it issues a session for whatever principal it is given, trusting entirely that the caller verified authentication first. Audit Trail records events but knows nothing about the semantics of the events it records. The question of *what should happen at the boundary where these three concepts meet* — how the transition from credential verification to session issuance should be wired, what should be recorded and when, and especially what should happen to open sessions when a credential is revoked — belongs to no single atom. It belongs to the composition.

Login is that composition. It provides three services: the `login` action wires `Credential.verify → Session.issue` in the correct order, with every login attempt (successful or failed) recorded in the Audit Trail before returning. The `logout` action wires `Session.revoke` with attribution and Audit Trail recording. And `revoke_sessions_for_credential` provides the cascade: when a Credential is revoked — whether by the credential owner, an administrator, or an automated compromise-response process — every Session derived from that Credential is revoked in the same operation, and the full cascade is recorded.

The cascade is load-bearing for downstream compositions. Privileged Access Provisioning's `exercise_access` action depends on Session validity as its first guard: a session invalidated by credential revocation will block all subsequent `exercise_access` calls for any Capability issued to that principal's sessions. The cascade path is: `Credential.revoke` (outside this composition's surface) → caller invokes `revoke_sessions_for_credential` → Login walks `credential_to_sessions[credential_id]` → `Session.revoke` for each Active session → Audit Trail records each revocation → Privileged Access Provisioning's session check thereafter returns `rejected(session-invalid)`. The Login composition is the mechanism that makes this arc visible and traceable from records alone.

This composition does not implement multi-factor authentication (MFA — requiring two or more independent proofs of identity), account lockout, rate limiting, or session renewal. It implements the minimal correct wiring of three atoms for the common authenticated-session case — the pattern that every other authentication-adjacent composition either calls or depends on.

---

## Summary

Login wires together the full lifecycle of logging in: checking the presented credential, issuing a time-limited session on success, logging out, and — crucially — cancelling every session that came from a credential when that credential is revoked. It combines three patterns: one that verifies credentials (Credential), one that issues and tracks time-limited sessions (Session), and the tamper-evident audit record that spans all of it (Audit Trail). Its central guarantee is that a session can never be issued without a successful credential check first — the wiring makes it structurally impossible, and an auditor can confirm it from the records because every session-issued event is preceded by a matching login-succeeded event. Its second guarantee is cascade completeness: when a credential is revoked, every still-active session derived from it is cancelled before the operation returns, leaving none behind. Every login attempt (success or failure), every logout, and every cascaded revocation is recorded, so an investigator can answer from the records alone which credentials established which sessions, whether a session rested on a valid credential, and when and by whom sessions were revoked. The cascade is the load-bearing guarantee that appears only when the three patterns are combined — it belongs to none of them alone — and it is what lets higher-level patterns reliably cut off access the moment a credential is pulled.

---

## Composes

- **[Credential](../atoms/credential.md)** — the verification surface. The composition calls `Credential.verify(principal_ref, credential_type, presented_material)` as the first action of `login`. A `verified` result is the gate; any `failed-verification(reason)` terminates the `login` call with `rejected(credential-invalid)` and records a failed-login event in the Audit Trail without issuing a session. The composition also queries the credential store directly (read-only) to retrieve the `credential_id` of the active credential after a successful `verify`, for population of `credential_to_sessions`. The composition does not call `Credential.register`, `rotate`, or `revoke` — those belong to the identity-management surface. `revoke_sessions_for_credential` is called externally by whatever revokes the credential; this composition provides only the downstream cascade, not the credential revocation itself.

- **[Session](../atoms/session.md)** — the time-bounded session record. The composition calls `Session.issue(principal_ref, issued_by_ref, session_duration)` inside `login`, after credential verification succeeds. The composition calls `Session.revoke(session_token, revoked_by_ref, reason)` inside `logout` and inside each step of `revoke_sessions_for_credential`. The composition calls `Session.validate(session_token)` inside `revoke_sessions_for_credential` to confirm a session is still Active before attempting revocation (so that expired sessions are skipped without error). The composition does not call `Session.expire` — expiry is handled by a background scheduler or lazy-validate path. Callers needing to validate sessions on subsequent requests call `Session.validate` directly; `validate` is not re-exposed on this composition's surface.

- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. One Audit Trail instance is maintained for all three of Login's actions. `login` writes a `login_succeeded` or `login_failed` event. `logout` writes a `logout_event`. `revoke_sessions_for_credential` writes one `credential_revocation_cascade_initiated` event and one `session_revoked_by_cascade` event per revoked session. Event Log, Actor Identity, Retention Window, and Tamper Evidence are reached transitively through Audit Trail; the composition does not maintain separate instances of those atoms.

---

## Composition logic

### Composition state

The composition owns emergent state that is not representable inside any single constituent atom:

- **`credential_to_sessions`** — map from `credential_id → Set<session_token>`. Populated atomically with each `Session.issue` call inside `login`: the `credential_id` of the verified credential maps to the newly issued `session_token`. Entries are never deleted from the set — the set includes all sessions ever issued for the credential, including expired and revoked ones. The cascade action (`revoke_sessions_for_credential`) iterates the full set and skips non-Active sessions; it does not modify the set. `credential_id` is the key because credentials are the upstream identity anchor: two different credentials for the same principal (different types, or a rotation successor) are tracked as separate cascade roots, each with their own derived-session set.

- **`session_to_credential`** — reverse map from `session_token → credential_id`. Maintained as the strict inverse of `credential_to_sessions`: every atomic write that adds a `session_token` to a `credential_id`'s set also writes the corresponding entry to `session_to_credential` in the same transaction. Used for per-session traceability — given a `session_token`, an auditor can recover the `credential_id` that produced it without a full scan. Entries are immutable once written and never deleted.

- **`login_event_log`** — append-only record of every `login` call, whether successful or failed. Each entry carries: `event_id` (opaque, system-generated), `principal_ref`, `credential_type`, `outcome` (one of: `success` | `success-with-map-failure` | `failed-verification(reason)` | `failed-storage-failure(stage)`), `credential_id` (null on credential-verification failure), `session_token` (null on failure; present on `success` and `success-with-map-failure`), `attempted_at`. `success-with-map-failure` means `Session.issue` succeeded and the session was returned to the caller, but the cascade-map write (step 5) failed; `failed-storage-failure(stage)` means the call failed at the named stage (`credential-id-lookup` or `session-issue`) before any session was issued. This log is the composition's own state; the Audit Trail is the regulated-audit record of the same events. The two are redundant by design: the `login_event_log` is the composition-layer fast query surface; the Audit Trail is the tamper-evident external-auditor surface.

### Configuration

- **`default_session_duration`** — the `session_duration` passed to `Session.issue` when the caller does not supply one. Deployment-configurable. Must be a positive duration; absent default returns `invalid-request`.

- **`audit_trail_retention_policy`** — the retention policy reference passed to Audit Trail at each `record_action` call. Typically `hipaa_6_year`, `sox_7_year`, or `pci_dss_1_year` depending on the regulated domain. Deployment-configurable.

- **`application_actor_ref` and `application_credential`** — the composition's service identity, used to attribute system-originated events (cascade revocations) in the Audit Trail. The same service-identity discipline as documented in Multi-Party Approval's Configuration section: the deployment provisions and rotates this credential; its compromise surface and forgery defense follow the same reasoning as documented there.

- **`failed_login_audit_trail`** — whether failed `login` attempts are recorded in the Audit Trail (in addition to the `login_event_log`). Defaults to `true`. Regulated deployments should leave this enabled; turning it off reduces the Audit Trail's forensic completeness for breach investigations. Disabling does not affect the `login_event_log`, which records all attempts regardless.

### Action wiring

**`login(principal_ref, credential_type, presented_material, issued_by_ref, session_duration?) → session_token | rejected(invalid-request | credential-invalid | storage-failure)`**

1. Validate: `principal_ref`, `credential_type`, `presented_material`, `issued_by_ref` must be non-null and non-empty; `session_duration` must be positive if supplied. Any violation: `invalid-request`.
2. Call `Credential.verify(principal_ref, credential_type, presented_material)`.
   - If `failed-verification(reason)`: append to `login_event_log`: `{principal_ref, credential_type, outcome: failed-verification(reason), credential_id: null, session_token: null, attempted_at: now}`. If `failed_login_audit_trail` is enabled, call `Audit Trail.record_action(actor_ref: principal_ref, action: login_failed, detail: {credential_type, reason}, ...)`. Return `rejected(credential-invalid)`.
3. Query the credential store to retrieve `credential_id` of the active credential for `(principal_ref, credential_type)`. This is a direct read — `Credential.verify` returned `verified` in step 2, confirming an Active credential exists; the read is a lookup of the record whose state was just confirmed. If the read fails unexpectedly (storage inconsistency): append to `login_event_log`: `{principal_ref, credential_type, outcome: failed-storage-failure(credential-id-lookup), credential_id: null, session_token: null, attempted_at: now}`; if `failed_login_audit_trail` is enabled, record `login_failed(credential-id-lookup-failure)` in Audit Trail; return `rejected(storage-failure)`.
4. Call `Session.issue(principal_ref, issued_by_ref, session_duration ?? default_session_duration)`.
   - If `rejected(storage-failure)`: append to `login_event_log`: `{principal_ref, credential_type, outcome: failed-storage-failure(session-issue), credential_id, session_token: null, attempted_at: now}`; if `failed_login_audit_trail` is enabled, record `login_failed(session-issue-failure)` in Audit Trail; return `rejected(storage-failure)`.
   - On success: `session_token` is the returned token.
5. Atomically: add `session_token` to `credential_to_sessions[credential_id]`; write `session_to_credential[session_token] = credential_id`.
   - If this write **succeeds**: proceed to step 6.
   - If this write **fails**: the session has been issued (step 4 committed). Append to `login_event_log`: `{principal_ref, credential_type, outcome: success-with-map-failure, credential_id, session_token, attempted_at: now}`. Call `Audit Trail.record_action(actor_ref: principal_ref, action: login_map_write_failure, detail: {session_token, credential_id}, ...)`. Return `session_token` to the caller — the session is valid even if the cascade map is incomplete; the map write failure is a finding to investigate and remediate separately, not a reason to deny the authenticated session to the principal. Steps 6–8 are not reached.
6. Append to `login_event_log`: `{principal_ref, credential_type, outcome: success, credential_id, session_token, attempted_at: now}`.
7. Call `Audit Trail.record_action(actor_ref: principal_ref, action: login_succeeded, detail: {credential_type, credential_id, session_token}, ...)`.
8. Return `session_token`.

**`logout(session_token, actor_ref, reason?) → logged-out | rejected(invalid-request | not-known | already-terminal | storage-failure)`**

1. Validate: `session_token` and `actor_ref` must be non-null and non-empty. If `reason` is not supplied, default to `"user-initiated-logout"`.
2. Call `Session.revoke(session_token, revoked_by_ref: actor_ref, reason)`.
   - If `rejected(not-known)`: return `rejected(not-known)`.
   - If `rejected(already-terminal)`: return `rejected(already-terminal)`.
   - If `rejected(invalid-request)`: return `rejected(invalid-request)`.
   - If `rejected(storage-failure)`: return `rejected(storage-failure)`.
3. Call `Audit Trail.record_action(actor_ref, action: logout, detail: {session_token, reason}, ...)`.
4. Return `logged-out`.

*Note: `logout` does not modify `credential_to_sessions` or `session_to_credential`. The session_token remains in both maps as a durable history entry. The session's `status = Revoked` in the Session store is the authoritative terminal-state record; the cascade action skips sessions whose `Session.validate` returns non-`valid`.*

**`revoke_sessions_for_credential(credential_id, revoked_by_ref, reason) → {revoked: N, skipped: M, not_found: K} | rejected(invalid-request | storage-failure)`**

*This action is called by whatever external process revokes a credential — typically the identity-management surface or a compromise-response process — to cascade that revocation to all derived Sessions.*

1. Validate: `credential_id`, `revoked_by_ref`, `reason` must be non-null and non-empty. Any violation: `invalid-request`.
2. Look up `sessions = credential_to_sessions.get(credential_id)`. If `credential_id` is not in the map (no sessions were ever issued for this credential through this Login composition): `sessions` is the empty set. Proceed — the action is a no-op for a credential with no recorded sessions, and returning `{revoked: 0, skipped: 0}` is the correct outcome. The caller can inspect the credential record directly to determine whether the credential exists; the composition does not perform that check.
3. Call `Audit Trail.record_action(actor_ref: revoked_by_ref, action: credential_revocation_cascade_initiated, detail: {credential_id, session_count: sessions.size}, ...)`. If the Audit Trail write fails: return `rejected(storage-failure)`. Do not proceed to step 4 — cascading without an initiation record produces orphaned `session_revoked_by_cascade` events that cannot satisfy GA check 3's reconciliation, making the cascade non-auditable.
4. Initialize counters: `revoked = 0`, `skipped = 0`, `not_found = 0`.
5. For each `session_token` in `sessions`:
   a. Call `Session.validate(session_token)`.
   b. If `valid(...)`: call `Session.revoke(session_token, revoked_by_ref, reason: "credential-revocation-cascade: " + reason)`. If `revoke` succeeds: increment `revoked`; call `Audit Trail.record_action(actor_ref: revoked_by_ref, action: session_revoked_by_cascade, detail: {session_token, credential_id}, ...)`. If `revoke` returns `storage-failure`: call `Audit Trail.record_action(actor_ref: revoked_by_ref, action: session_revoke_failure_during_cascade, detail: {session_token, credential_id, error: storage-failure}, ...)`; continue to next session (do not abort the cascade — partial revocation is better than no revocation; the failure is an open finding that must be remediated). If `revoke` returns `already-terminal`: the session became terminal between the `Session.validate` call and the `Session.revoke` call — a normal TOCTOU race (another process revoked or expired the session in the narrow window). Increment `skipped` and continue. No Audit Trail event needed; the terminal transition is already recorded in the Session store.
   c. If `invalid(expired)` or `invalid(revoked)`: increment `skipped`. The session is already terminal; no `Session.revoke` call is needed.
   d. If `invalid(not-known)`: increment `not_found`; call `Audit Trail.record_action(actor_ref: revoked_by_ref, action: session_not_found_during_cascade, detail: {session_token, credential_id}, ...)`. This indicates a session_token is present in `credential_to_sessions` but absent from the Session store — a data integrity gap that is distinct from a normal terminal-state skip and should surface for investigation.
6. Return `{revoked: N, skipped: M, not_found: K}`.

### Composition-level invariants

**Invariant 1 — Credential gates issuance.** A `session_token` appears in `session_to_credential` only if `Credential.verify(principal_ref, credential_type, presented_material)` returned `verified` during the `login` call that produced it, and that `verify` was the immediately preceding call in the same `login` invocation. There is no path through the composition's action wiring that calls `Session.issue` without first receiving `verified` from `Credential.verify`.

**Invariant 2 — Cascade completeness (snapshot-scoped).** After `revoke_sessions_for_credential(credential_id, ...)` returns, every session that was in `credential_to_sessions[credential_id]` *at the time step 2 read the set* and was `Active` at the time its cascade step executed is in a terminal state in the Session store — except in the case of a `Session.revoke` `storage-failure` during step 5 (which is recorded in the Audit Trail as `session_revoke_failure_during_cascade` and is an implementation finding, not a conformant terminal state). The cascade guarantee is scoped to the snapshot: sessions added to `credential_to_sessions[credential_id]` by concurrent `login` calls after the step-2 snapshot is taken are not covered by this cascade invocation and require a subsequent `revoke_sessions_for_credential` call to close. Callers executing a cascade as part of a breach response should confirm that `Credential.revoke` has committed (making the credential terminal) before calling `revoke_sessions_for_credential`; once the credential is terminal, no new sessions can be established, and a single cascade call covers all sessions that will ever appear in the map for that credential.

**Invariant 2a — Cascade coverage.** The set `credential_to_sessions[credential_id]` contains every `session_token` that was ever produced by a `login` call that verified against `credential_id`, across the full lifetime of the composition, *except* for sessions whose step-5 map write failed (those sessions are recorded as `login_map_write_failure` Audit Trail events and `success-with-map-failure` entries in `login_event_log`, and are absent from the cascade map). A `login_map_write_failure` Audit Trail event is the canonical signal that a session was issued but is not covered by cascade revocation; each such event names the `session_token` and `credential_id` and must be remediated (by backfilling the map entry or confirming the session has reached a terminal state) before Invariant 2a is considered fully satisfied.

**Invariant 3 — Session-credential traceability.** For every `session_token` in `session_to_credential`, the value `credential_id` is the `credential_id` of the Active credential for `(principal_ref, credential_type)` at the time the `login` call that produced the session was made. The mapping is immutable once written. An auditor can trace any session to its originating credential without consulting any source outside the composition's own state.

**Invariant 4 — Login event log completeness.** Every `login` call — regardless of outcome — produces exactly one entry in `login_event_log`. The `outcome` vocabulary is: `success` (session issued, map written), `success-with-map-failure` (session issued but map write failed), `failed-verification(reason)` (credential check failed), `failed-storage-failure(credential-id-lookup)` (step 3 store failure), `failed-storage-failure(session-issue)` (step 4 store failure). An entry with outcome `success` or `success-with-map-failure` has non-null `session_token`; all failure outcomes have null `session_token`. An entry with any outcome other than `failed-verification(reason)` has a non-null `credential_id` (because the credential was verified successfully before the failure point), except for `failed-storage-failure(credential-id-lookup)` entries which have null `credential_id` (the id could not be retrieved).

**Invariant 5 — Audit Trail completeness.** Every `login_succeeded` event in the Audit Trail has a corresponding `session_token` that appears in `session_to_credential`. Every `session_revoked_by_cascade` event in the Audit Trail has a corresponding `session_token` that was in `Active` status in the Session store immediately before the cascade step that produced the event. No Audit Trail event of type `session_revoked_by_cascade` exists without a corresponding `credential_revocation_cascade_initiated` event bearing the same `credential_id` and an earlier timestamp.

**Invariant 6 — Map inverse consistency.** `credential_to_sessions` and `session_to_credential` are strict inverses. For every `(credential_id, session_token)` pair in `credential_to_sessions`, the entry `session_to_credential[session_token] = credential_id` exists. For every `(session_token, credential_id)` pair in `session_to_credential`, `session_token` appears in `credential_to_sessions[credential_id]`. A discrepancy between the two maps is evidence of a failed atomic write during `login` step 5.

---

## Examples

### Successful login and session use

A user enters their password in a financial system. The host system calls `login(principal_ref: user_u91, credential_type: "password", presented_material: <raw-password>, issued_by_ref: login_svc_l01)`.

Step 2: `Credential.verify(user_u91, "password", <raw-password>) → verified`. Step 3: credential store query returns `credential_id: cred_c01`. Step 4: `Session.issue(user_u91, login_svc_l01, 3600) → session_token: tok_abc123`. Step 5: `credential_to_sessions[cred_c01]` = `{tok_abc123}`; `session_to_credential[tok_abc123]` = `cred_c01`. Steps 6–7: `login_event_log` entry and Audit Trail `login_succeeded` event recorded. Return: `tok_abc123`.

The host system sets a session cookie. On the next request, the host system (or Privileged Access Provisioning) calls `Session.validate(tok_abc123) → valid(principal_ref: user_u91, expires_at: 2026-09-01T11:00:00Z)`.

### Failed login — wrong password

The user enters an incorrect password. `login(user_u91, "password", <wrong-password>, login_svc_l01)`. Step 2: `Credential.verify → failed-verification(material-mismatch)`. Step 2 path: `login_event_log` entry with `outcome: failed-verification(material-mismatch)`; Audit Trail `login_failed` event. Return: `rejected(credential-invalid)`. No session is issued; no entry appears in `credential_to_sessions` or `session_to_credential`.

### Logout

The user clicks "Log out." The host system calls `logout(session_token: tok_abc123, actor_ref: user_u91, reason: "user-initiated-logout")`. Step 2: `Session.revoke(tok_abc123, user_u91, "user-initiated-logout") → revoked`. Step 3: Audit Trail `logout_event`. Return: `logged-out`. Subsequent `Session.validate(tok_abc123) → invalid(revoked)`.

### Cascading revocation — compromise response

An incident-response team determines that `cred_c01` (user_u91's password credential) was likely compromised. The identity-management surface calls `Credential.revoke(cred_c01, revoked_by_ref: security_team_s01, reason: "suspected-compromise-2026-09-12")`. The response team then calls `revoke_sessions_for_credential(credential_id: cred_c01, revoked_by_ref: security_team_s01, reason: "suspected-compromise-2026-09-12")`.

Step 2: `credential_to_sessions[cred_c01]` = `{tok_abc123, tok_def456}` (two sessions were issued over the credential's lifetime). Step 3: Audit Trail `credential_revocation_cascade_initiated` event for `cred_c01`, `session_count: 2`. Step 5a — `tok_abc123`: `Session.validate → valid(...)` → `Session.revoke(tok_abc123, security_team_s01, "credential-revocation-cascade: suspected-compromise-2026-09-12") → revoked`; Audit Trail `session_revoked_by_cascade`. Step 5b — `tok_def456`: `Session.validate → invalid(expired)` → skipped. Return: `{revoked: 1, skipped: 1}`.

Any subsequent Privileged Access Provisioning `exercise_access` call under `tok_abc123` will return `rejected(session-invalid)` at step 1, before the Capability is presented.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts:

**Regulator audit.** A SOX (Sarbanes-Oxley Act) auditor asks *"was the session used to exercise access to financial control FC-789 at 09:14 on 2026-10-15 established under a valid, non-revoked credential?"* The auditor reads the Privileged Access Provisioning `session_access_log` to find `session_token: tok_abc123` was used at that time. The auditor queries `session_to_credential[tok_abc123]` → `credential_id: cred_c01`. The auditor reads the Credential store: `cred_c01` was `Active` at `09:14` (it was revoked at `11:40` on the same day, after the access). The Audit Trail's `login_succeeded` event for `tok_abc123` shows `logged_in_at: 2026-10-15T08:52:00Z`, `credential_id: cred_c01`, `principal_ref: user_u91`. Invariant 1 (credential gates issuance) is the structural guarantee that the session could not exist without a prior verified credential. The auditor has their answer from the records alone.

**Disputed login event.** A user claims *"I did not log in from that location at 03:00 AM on 2026-11-20."* The investigator queries the `login_event_log` for `principal_ref: user_u91` on that date. The entry shows `attempted_at: 2026-11-20T03:00:12Z`, `outcome: success`, `credential_id: cred_c01`, `session_token: tok_xyz789`. The Audit Trail's `login_succeeded` event corroborates the timestamp and credential used. Credential's Invariant 3 (sole-holder verification) means the presented material matched the verifier registered for user_u91's password credential — the login succeeded because someone presented the correct password. Whether that was the legitimate user or an attacker with the compromised password is a separate investigation; Login's records bound the forensic window: the session was issued at `03:00:12Z` after a successful credential check.

**Breach investigation — cascade completeness.** A security team is investigating a credential compromise. They ask *"how many active sessions were revoked when we cascaded the revocation of cred_c01, and is there any evidence that any session slipped through?"* The Audit Trail shows: `credential_revocation_cascade_initiated` at `2026-12-03T14:22:00Z` for `cred_c01`, `session_count: 5`. Five subsequent `session_revoked_by_cascade` events appear, each naming a distinct `session_token`. There are no `login_map_write_failure` events for `cred_c01`. Invariant 2 (cascade completeness) is the structural guarantee: all 5 sessions are accounted for. The investigator can confirm by querying `credential_to_sessions[cred_c01]` directly — 5 entries, each with `Session.validate → invalid(...)`. Cascade is confirmed complete.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Multi-factor authentication.** This composition verifies one credential of one type per `login` call. Requiring a principal to satisfy two or more credential checks before a session is issued — password then TOTP (Time-based One-Time Password), hardware key then PIN — is handled at the composing-pattern layer, beyond Login's scope. A multi-factor login composition would call `Credential.verify` twice (for different `credential_type` values) before calling `Session.issue`, and would carry its own cascade map across both credential types.
- **Credential registration, rotation, and revocation.** Login does not call `Credential.register`, `rotate`, or `revoke`. Those are the identity-management surface's actions. `revoke_sessions_for_credential` handles the downstream cascade after an external revocation; it does not initiate the credential revocation.
- **Failed-attempt tracking and account lockout.** Login records every failed attempt in `login_event_log` and (if configured) in the Audit Trail, but it does not count failed attempts, implement exponential backoff, or lock credentials after N failures. Those are handled at the deployment layer. A deployment that wants lockout must add a rate-limiting or lockout layer above this composition that inspects `login_event_log` and decides when to reject further `login` calls for a given `principal_ref`.
- **Session renewal and sliding-window expiry.** Login issues a session with a fixed `expires_at`. Sliding-window renewal — where the session's effective expiry extends on each active request — requires the composing layer to call `login` again (producing a new session) and revoke the old one, delivering the new token to the caller. Login provides the primitives; the renewal policy belongs to the composing layer.
- **Session validation on incoming requests.** Callers needing to validate a session on each request call `Session.validate(session_token)` directly. Login does not re-expose a `validate_session` action. Compositions that gate actions on session validity (Privileged Access Provisioning, Session-Gated Authorization C14) call `Session.validate` directly, not through Login.
- **Credential recovery and account recovery.** Reset-by-email, backup codes, recovery keys — these flows produce new `credential_material` that is then rotated in via `Credential.rotate`. Login sees only the normal `login` call after recovery is complete; it is not involved in the recovery flow itself.
- **Concurrent session limits.** Login imposes no limit on how many Active sessions a given `principal_ref` may have simultaneously. A principal who logs in from five devices has five active sessions. Enforcing a per-principal session limit requires the composing layer to query `credential_to_sessions` or the Session store and revoke excess sessions before issuing new ones.
- **Credential-revocation initiation.** `revoke_sessions_for_credential` is the cascade action; it does not call `Credential.revoke`. The caller is responsible for revoking the credential through Credential's own surface before calling the cascade action. A deployment that calls `revoke_sessions_for_credential` without first revoking the credential has revoked the sessions but left the credential Active — the principal can still log in and get a new session. The correct sequence is always `Credential.revoke` then `revoke_sessions_for_credential`.
- **Device binding and session fixation protection.** Whether a session token is bound to a device fingerprint, IP address, or browser context is handled at the composing-pattern layer. Login stores no device information. Session fixation defense (ensuring a pre-authentication session token is not re-used post-authentication) requires the composing deployment to generate a fresh `session_token` after authentication, which is the default: `Session.issue` always generates a fresh `session_token`.
- **Authorization to perform logout.** Login does not verify that `actor_ref` has the right to terminate `session_token`. It accepts any non-null, non-empty `actor_ref` supplied by the caller and passes it to `Session.revoke` as the revocation actor. Whether `actor_ref` must be the session's own `principal_ref`, an administrator, or any authenticated caller is a Permissions decision the composing layer must enforce before calling `logout`. A deployment that exposes `logout` without an upstream authorization check allows any caller with a valid `actor_ref` to terminate any session they know the token for. The Audit Trail records who called `logout` (`actor_ref`) and which session was terminated, providing the forensic record regardless of whether the revocation was authorized by the principal or by an administrator.
- **Credential rotation and session cascade.** `revoke_sessions_for_credential` works identically whether the named `credential_id` is in `Revoked` or `Rotated` status — the composition does not check the credential's current status before cascading. Callers who rotate a credential (via `Credential.rotate`) may choose to cascade sessions established under the old credential or preserve them briefly for graceful handoff. The correct sequence for rotation-with-cascade is: call `Credential.rotate` (old credential goes to `Rotated`), then call `revoke_sessions_for_credential(old_credential_id, ...)`. New sessions will be established under the new credential_id, which has a separate cascade map entry.
- **OpenID Connect and federated identity.** External identity providers (IdPs) present a different authentication model: the credential verification happens at the IdP, and the composing system receives a signed assertion rather than raw credential material. Wiring an OIDC authorization-code flow into this composition's `login` action requires treating the IdP's signed assertion as the `presented_material` and registering a verifier-derivation function that validates OIDC ID tokens. The atom and composition mechanics are the same; the derivation function is the deployment-configured extension point.

---

## Standards references

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63B §7 (Session Management)** — the primary standard for session lifecycle in authenticated systems. The composition's `login → Session.issue` wiring implements the session binding requirement; `logout → Session.revoke` implements the session termination requirement. The `revoke_sessions_for_credential` cascade implements the reauthentication-on-credential-change requirement: when a credential is revoked, all dependent sessions must be terminated.
- **NIST SP 800-53 AC-12 (Session Termination)** — requires that sessions terminate after a defined condition. The composition's `logout` and `revoke_sessions_for_credential` actions are the two termination surfaces; the `expires_at` immutability of Session is the time-bounded termination mechanism.
- **OWASP ASVS V3.1 (Authentication) and V3.3 (Session Termination)** — the OWASP (Open Worldwide Application Security Project) Application Security Verification Standard; the `login` action's sequencing (verify then issue, with failed attempts recorded) and `logout`'s full revocation (not just cookie deletion) correspond to ASVS requirements for authentication event logging and session invalidation on logout.
- **GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Article 32 (Security of Processing)** — the `login_event_log` and Audit Trail recording of all authentication events, including failures, contribute to the "appropriate technical measures" Article 32 requires. The `revoke_sessions_for_credential` cascade is a breach-response mechanism that reduces the blast radius of a compromised credential.
- **HIPAA (US Health Insurance Portability and Accountability Act) §164.312(d) (Person or Entity Authentication)** — the composition's `Credential.verify → Session.issue` wiring is the structural implementation of this requirement: a session is issued only after the principal's identity is confirmed. The Audit Trail records the authentication event for post-incident investigation.
- **PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for cardholder data) Requirement 8.2 (User Identification and Authentication)** and **Requirement 8.6 (Session Management)** — authentication event logging (all login attempts, successful and failed), session termination on logout, and revocation on credential change correspond to PCI DSS structural requirements. The `login_event_log` is the composition-layer record; the Audit Trail is the tamper-evident external-auditor record.
- **SOX §302 / §404 (Internal Controls)** — the `credential_to_sessions` map and its cascade action are the structural mechanism for ensuring that a compromised credential's access window can be closed completely and auditedly. An auditor can verify cascade completeness from the Audit Trail records alone without consulting the incident-response team.
- **OpenID Connect Core 1.0** — the composition is the Grace Commons expression of the OIDC (OpenID Connect — an identity layer built on OAuth 2.0) login flow: authorization code exchange (credential verification), session establishment (session issuance), and session revocation on logout or token revocation. The atoms' `principal_ref` maps to the OIDC `sub` claim.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture that makes the cascade an emergent property of the composition rather than a feature bolted onto either Credential or Session.
- **NIST 800-63B §4 (Authenticator and Verifier Requirements)** — the upstream standard for Credential's verifier-not-material storage discipline, which this composition inherits transitively.

---

## Generation acceptance

A derived implementation of Login is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's state (`credential_to_sessions`, `session_to_credential`, `login_event_log`) and the constituent atoms' stores (Session records, Audit Trail events), can do all of the following without recourse to source code, runbooks, or developer narration:

- **Verify that every session in `session_to_credential` has a corresponding `login_succeeded` Audit Trail event.** For every `(session_token, credential_id)` pair in `session_to_credential`, confirm that the Audit Trail contains a `login_succeeded` event with matching `session_token` and `credential_id`. A session in `session_to_credential` without a corresponding `login_succeeded` event is evidence of a bypass of the credential-gates-issuance invariant (Invariant 1).
- **Verify map inverse consistency.** For every `(credential_id, session_token)` pair in `credential_to_sessions`, confirm that `session_to_credential[session_token] = credential_id`. For every `(session_token, credential_id)` pair in `session_to_credential`, confirm that `session_token` appears in `credential_to_sessions[credential_id]`. Any discrepancy is a map write failure (step 5 of `login`) and is a finding.
- **Verify cascade completeness for any credential revocation event.** For any `credential_revocation_cascade_initiated` Audit Trail event with `credential_id = C` and `session_count = N`, confirm that the sum of subsequent `session_revoked_by_cascade`, `session_revoke_failure_during_cascade`, and `session_not_found_during_cascade` events with the same `credential_id` equals N. This reconciliation confirms that every session in the cascade's snapshot was accounted for. Confirm that all `session_token` values from `session_revoked_by_cascade` events are in a terminal status in the Session store (`Revoked`). `session_revoke_failure_during_cascade` and `session_not_found_during_cascade` events are findings requiring remediation; their presence does not satisfy cascade completeness. An Active session in `credential_to_sessions[C]` after a cascade that has no corresponding `session_revoke_failure_during_cascade` event is evidence of a cascade implementation defect (missed session) or a post-cascade concurrent login (requires a second cascade call per Invariant 2's snapshot-scoped guarantee).
- **Verify login event log and Audit Trail consistency.** For every `login_event_log` entry with `outcome = success`, confirm that the Audit Trail contains a `login_succeeded` event with matching `session_token` and `credential_id`. For every entry with `outcome = success-with-map-failure`, confirm that the Audit Trail contains a `login_map_write_failure` event with matching `session_token` and `credential_id`. A success entry without a corresponding Audit Trail event is evidence of an Audit Trail write failure during `login` step 7; a `success-with-map-failure` entry without a corresponding Audit Trail event is evidence of an Audit Trail write failure during the step-5 failure branch. Either is a finding.
- **Reconstruct the session history for any principal.** Given a `principal_ref`, query `login_event_log` for all entries with that `principal_ref`. For each entry with `outcome = success` or `outcome = success-with-map-failure`, follow `session_token` to the Session store to determine the session's current status and `expires_at`. The result is a complete timeline of: when the principal authenticated, with which credential, which session was issued, whether the session was revoked (and by what mechanism), and whether the session expired naturally. No external data source is required.
- **Confirm all `login_map_write_failure` events are resolved.** Query the Audit Trail for all `login_map_write_failure` events. For each, confirm one of: (a) the named `session_token` has been manually reconciled into `credential_to_sessions` and `session_to_credential` via a remediation process, or (b) the session has reached a terminal state in the Session store (`Expired` or `Revoked`). An unresolved `login_map_write_failure` event with an Active session in the Session store represents a session not covered by cascade revocation — a gap in Invariant 2a that is an open finding.

This is the generator's contract: any implementation derived from this composition must produce state that passes all six checks above. The bar is the regulator's question — *"can you prove that every session in this system was established under a verified credential, and that every session derived from a revoked credential was terminated?"* — not the developer's intuition.

---

## Status

`grounded on Final Critique 5 — 2026-05-23` — three baseline rounds (Pass 1/2/3 each) plus Final Critique 4 plus Round 5 (touch-triggered re-pass — TLA+ operational-peer verification) complete. Twelve findings across baseline + Final Critique 4; all resolved in-pattern. Round 5 closed clean with no new findings: TLC verified the seven named composition-level invariants and TypeOK across 1188 reachable distinct states under exhaustive-interleaving semantics at bounds `CredentialIds = {c1, c2}`, `SessionTokens = {s1, s2, s3}`, `MaxClock = 3`. FC1's TOCTOU race (Logout × cascade) and the step-5 map-write-failure path are both exercised in the interleaving model and discharge cleanly.

---

## Lineage notes

**Conventions inherited.** This is a regulated composition (composes atoms from `compliance` and records regulated events in Audit Trail) and carries *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`pressure-testing.md`](../pressure-testing.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

**Structural decisions made in draft.**

- *`credential_to_sessions` keyed on `credential_id`, not `principal_ref`.* A principal with multiple credential types (password + TOTP, password + FIDO2) would have sessions derived from different credentials. Keying the cascade map on `credential_id` rather than `principal_ref` means revoking a principal's password credential cascades only to sessions established via that credential, not to sessions established via their hardware key. This is the correct behavior: the scope of the cascade matches the scope of what was compromised.
- *`revoke_sessions_for_credential` does not initiate `Credential.revoke`.* The cascade action is a downstream consequence of credential revocation, not a combined action. Separating them allows the caller to choose whether to cascade (e.g., a credential rotation where the old session should be preserved briefly for graceful handoff might not cascade immediately). Making the cascade automatic at `Credential.revoke` time would require Credential to know about Login, breaking the atom's freestanding property.
- *`login` returns `session_token` even if map write fails (step 5).* A principal who successfully authenticated should receive their session token even if the cascade-map write fails; denying a valid session because of a bookkeeping write failure would be a worse outcome than the map inconsistency. The write failure is surfaced in the Audit Trail as a finding for remediation.
- *`logout` does not require the caller to own the session.* The action takes `actor_ref` as the revocation identity and passes it to `Session.revoke`. Whether the `actor_ref` is the session's own `principal_ref` or an administrative identity is not checked by Login — that authorization check is the composing layer's concern (e.g., a Permissions check before calling `logout`). Login's job is to wire the revocation and the audit record, not to authorize who may perform it.
- *`revoke_sessions_for_credential` returns `{revoked: 0, skipped: 0}` when `credential_id` has no map entry.* A credential that was registered but never used to log in (no sessions issued) produces an empty map entry. Returning `rejected(not-known)` for this case would conflate "no sessions exist" with "the credential itself doesn't exist," which are structurally different situations the composition cannot distinguish without querying the Credential store. The composition does not perform that check; the caller handles it. A no-op return is correct: the cascade is vacuously satisfied when there are no sessions to revoke.
- *Failed login attempts are recorded in both `login_event_log` and Audit Trail (when configured).* The `login_event_log` is the composition-layer query surface for rate-limiting and lockout logic. The Audit Trail is the tamper-evident external-auditor surface. Both record the same event in different stores because the two audiences have different query patterns and trust models.

**Forthcoming-link resolution.** This composition is the `Login (not started)` reference in Credential's Composition notes and Session's Composition notes. Both atoms now have a live target. The update to those atoms' Composition notes (removing `*(not started)*` markers and linking to this file) is a separate task.

---

**Round 1.**

*Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).* One finding. **F1 — Generation acceptance gap: `login_map_write_failure` events not covered.** The five-check GA set covered sessions in `session_to_credential`, map inverse consistency, cascade completeness, event log vs. Audit Trail counts, and session history reconstruction. None covered the inverse: sessions issued by Login's `Session.issue` that are NOT in `credential_to_sessions` due to a step-5 map write failure. The `login_map_write_failure` Audit Trail event is the only signal for these, but no GA check asked the auditor to look for it or confirm resolution. Additionally, GA check 4 (login_event_log count vs. Audit Trail count) was incorrect because: (a) `failed_login_audit_trail = false` means not all failed logins produce Audit Trail events, making a direct count comparison wrong; (b) `success-with-map-failure` entries produce a `login_map_write_failure` Audit Trail event, not a `login_succeeded` event, so the count formula was off. Fixed: GA check 4 rewritten as a consistency check (each `login_event_log` outcome maps to the expected Audit Trail event type); GA check 6 added for unresolved `login_map_write_failure` events.

*Pass 2 — EOS (the Essence of Software, Daniel Jackson's concept framework) conceptual independence.* Clean. The composition is properly bounded. No over-absorption detected. Login's concerns (cascade map, login event log, credential-gates-session wiring) belong to the composition layer and cannot live in any constituent atom.

*Pass 3 — Linus adversarial.* Three findings.

- **F2 — `login_event_log` outcome vocabulary undefined for failure paths in steps 3, 4, and 5:** The Composition state section defined `outcome` as `success | failed-verification(reason)`, but the action wiring's failure paths at steps 3, 4, and 5 used unspecified outcome values ("append failed event," "record the inconsistency"). Fixed: extended vocabulary to `success | success-with-map-failure | failed-verification(reason) | failed-storage-failure(stage)`; named the specific outcome in each failure path.
- **F3 — Invariant 2a violated by step-5 failure path:** Invariant 2a asserted "No session produced by a `login` call against this credential is absent from the set" — a claim refuted by the step-5 map write failure, which produces exactly such an absent session. Fixed: qualified Invariant 2a with the map-write-failure exception; `login_map_write_failure` Audit Trail events are named as the canonical remediation signal.
- **F4 — `revoke_sessions_for_credential` `rejected(not-known)` conflates two unrelated situations:** Returning `not-known` when a `credential_id` has no map entry conflates "no sessions issued" with "the credential doesn't exist" — two situations the composition cannot distinguish without querying the Credential store (which it does not do). A caller receiving `not-known` cannot tell which case applies. Fixed: step 2 now returns `{revoked: 0, skipped: 0}` when the map has no entry (the cascade is vacuously satisfied); `not-known` removed from the action's rejection vocabulary; structural decisions note updated.

Round 1 closed. Four findings; all resolved in-pattern; none deferred.

---

**Round 2.**

*Pass 1 — GRID structural.* Clean. All nine MUSE nodes consistent after Round 1 fixes.

*Pass 2 — EOS conceptual independence.* Clean. No new concerns introduced by Round 1 fixes. The composition's three stores (`credential_to_sessions`, `session_to_credential`, `login_event_log`) are properly scoped to the composition layer; none overlap with any constituent atom's state. Step 3's direct credential-store read is within the composing-pattern access model (the Credential atom's Feedback section states the store is queryable to composing patterns).

*Pass 3 — Linus adversarial.* Two findings.

- **F5 — Invariant 2 overclaims cascade completeness (foundational, fixed in-pattern).** Invariant 2 stated: "After `revoke_sessions_for_credential` returns, no session in `credential_to_sessions[credential_id]` is in `Active` status." This is false for sessions added to the map by concurrent `login` calls after the cascade's step-2 snapshot was taken. A session established concurrently with the cascade is in the map after the action returns but is still Active — a direct violation of Invariant 2. The cascade only covers sessions in the step-2 snapshot. Fixed: Invariant 2 qualified to "snapshot-scoped" — the completeness guarantee applies to sessions in the snapshot, not to sessions added concurrently. Added: a note that callers should ensure `Credential.revoke` commits before calling `revoke_sessions_for_credential`; once the credential is terminal, no new sessions can be established and a single cascade call covers all future sessions.
- **F6 — `Session.revoke` storage-failure event unnamed in cascade (refining, fixed in-pattern).** Step 5b failure path said "record failure in Audit Trail" without naming the event type. Fixed: event named `session_revoke_failure_during_cascade` with `detail: {session_token, credential_id, error: storage-failure}`.

Round 2 closed. Two findings; both resolved in-pattern; none deferred.

---

**Round 3.**

*Pass 1 — GRID structural.* One finding. **F7 — `revoke_sessions_for_credential` conflates `invalid(not-known)` with `invalid(expired/revoked)` under `skipped`.** When `Session.validate` returns `invalid(not-known)` for a session_token in the cascade map, the session token is present in `credential_to_sessions` but absent from the Session store — a data integrity gap structurally different from a session that was simply terminal. Counting both as `skipped` obscures the integrity gap. Fixed: added `not_found` counter; `Session.validate → invalid(not-known)` increments `not_found` and writes a `session_not_found_during_cascade` Audit Trail event; `Session.validate → invalid(expired)` or `invalid(revoked)` increments `skipped` as before. Action return type updated to `{revoked: N, skipped: M, not_found: K}`.

*Pass 2 — EOS conceptual independence.* Clean. No new concerns introduced by Round 2 fixes.

*Pass 3 — Linus adversarial.* Three findings, all resolved in-pattern.

- **F8 — Credential rotation case undocumented (refining).** The spec illustrated `revoke_sessions_for_credential` only in the revocation context. Callers who rotate a credential and want to cascade sessions for the old credential would naturally reach for this action but the spec was silent on whether it applies. Fixed: added Edge case "Credential rotation and session cascade" documenting that the action works identically for `Rotated` credentials and explaining the correct sequence (rotate first, then cascade the old credential_id).
- **F9 — `logout` authorization concern absent from Edge cases (refining).** The structural decision in Lineage notes noted that authorization is a composing-layer concern, but the Edge cases section — the surface a future implementer reads — said nothing about the authorization gap. A deployment exposing `logout` to unauthenticated callers could allow any caller to terminate any session. Fixed: added Edge case "Authorization to perform logout" making the authorization gap explicit with the Audit Trail forensic note.
- **F10 — GA check 3 count incorrect (refining).** GA check 3 said "exactly N `session_revoked_by_cascade` events" where N = `session_count` at cascade initiation. But `session_count` counts all sessions in the snapshot, including already-terminal ones (`skipped`) and not-found ones (`not_found`). The correct reconciliation is: `session_revoked_by_cascade + session_revoke_failure_during_cascade + session_not_found_during_cascade = session_count`. Fixed: GA check 3 rewritten to use the three-event reconciliation.

Round 3 closed. Four findings; all resolved in-pattern; none deferred. Baseline complete (Rounds 1–3). Proceeding to Final Critique.

---

**Final Critique 4 (Super Torvalds).**

Two findings — one foundational (fixed in-pattern), one refining (fixed in-pattern).

**FC1 — `Session.revoke → already-terminal` unhandled in cascade step 5b (foundational, fixed in-pattern).** Step 5b handled `Session.revoke` returning success or `storage-failure` but omitted the `already-terminal` case. This case occurs when a session is valid at `Session.validate` time but becomes terminal before `Session.revoke` executes — a normal TOCTOU race (expiry fires during the narrow window, or a concurrent `logout` or cascade call terminates the session first). The unhandled case left the cascade with no counter increment and no Audit Trail event for the affected session — a silent dead path that made the GA check 3 reconciliation non-total (revoked + skipped + not_found would not sum to session_count for TOCTOU-affected sessions). Fixed: step 5b now handles `already-terminal` by incrementing `skipped` and continuing — the session is terminal, which is the cascade's goal, and the terminal transition is already recorded in the Session store. Invariant 2 (cascade completeness, snapshot-scoped) is preserved: sessions that were Active at `Session.validate` time and became terminal during the cascade step are still terminal after the action returns, satisfying the invariant.

**FC2 — Cascade proceeds without initiation Audit Trail record on write failure (refining, fixed in-pattern).** Step 3 wrote the `credential_revocation_cascade_initiated` event but did not specify behavior on Audit Trail write failure. Proceeding to step 4 without a successful initiation record would produce `session_revoked_by_cascade` events with no parent initiation event — orphaned events that cannot satisfy GA check 3's reconciliation requirement ("sum of three event types equals session_count from initiation event"). Fixed: step 3 now returns `rejected(storage-failure)` if the Audit Trail write fails, preventing the cascade from proceeding without its audit anchor.

Final Critique 4 closed clean. Foundational findings: zero remaining. Refining findings: zero remaining. Login is `grounded on Final Critique 4`.

---

**Formal model — TLA+ operational peer (precipitating touch for Round 5).** `compositions/login.tla` (+ `login.cfg`). The TLA+ artifact was authored prior to this Lineage entry but was unrun via the CLI; the first canonical CLI-driven TLC execution on 2026-05-23 constituted an effective touch and, per `pressure-testing.md` §Touch triggers re-pass, triggered the full three-pass Round 5 recorded below. Models the operational state machine implied by §Composition logic and §Action wiring: `Login` (happy-path issuance), `LoginMapWriteFailure` (step-5 cascade-map write failure producing the `success-with-map-failure` outcome named in §Edge cases), `Logout` (the concurrent-with-cascade case discharging FC1's TOCTOU concern), and `RevokeSessionsForCredential` (snapshot-scoped cascade). Checks the seven named application-level invariants (Credential gates issuance, Cascade completeness snapshot-scoped, Cascade coverage, Session-credential traceability, Login event log completeness, Cascade audit ordering, Map inverse consistency) plus TypeOK under TLC's exhaustive-interleaving semantics. Bounds: `CredentialIds = {c1, c2}`, `SessionTokens = {s1, s2, s3}`, `MaxClock = 3`. Result: all seven invariants and TypeOK hold across 1188 reachable distinct states (2945 generated, depth 7, complete graph search; estimated fingerprint-collision probability 1.1E-13). FC1's TOCTOU race (Logout firing concurrent with `RevokeSessionsForCredential` such that the cascade snapshot includes an already-terminal session) and the step-5 map-write-failure path (sessions in `session_to_credential` but absent from `cred_to_sessions`, tracked in `map_write_failed` to exclude from Invariant 6's strict-inverse clause) are both exercised in the interleaving model and discharge cleanly. Scope exclusions: Audit Trail substrate (delegated to the Audit Trail composition's own model — Invariant 5's audit-trail completeness is verified at composition time, not here); storage-failure on session record write (modeled by precondition rather than as an action); cross-system clock skew (single logical clock); `Credential.verify` internals (modeled as a guard predicate on `cred_status`). The TLA+ artifact's module declaration was renamed `MODULE Login` → `MODULE login` on the same day to satisfy SANY's filename↔module-name rule; the rename is the cross-cutting repo-wide concern recorded in [`discoveries.md`](../discoveries.md) §2026-05-23 and applied to all four `.tla` files in `compositions/`.

**Pass 1 — Structural completeness (GRID), Round 5 (touch-triggered re-pass, 2026-05-23).** *Complete.* No findings. All nine GRID nodes still resolved after the prior four rounds. The TLA+ Lineage entry above carries the plain-English summary, artifact locations, bounds, scope exclusions, and result per `contributing.md` §Formal-model artifacts.

**Pass 2 — Conceptual independence (EOS), Round 5.** *Complete.* No findings. The TLA+ artifact introduces no new concept embedded in the composition that requires extraction as a separate atom. The state variables (`cred_status`, `session_status`, `session_to_cred`, `cred_to_sessions`, `map_write_failed`, `log_sessions`, `cascade_initiated`, `cascade_revoked`, `clock`) all map to constituent-atom state or to the composition's own emergent state already named in §Composition state.

**Pass 3 — Adversarial (Linus), Round 5.** *Complete.* No findings. TLC's exhaustive enumeration of 1188 reachable distinct states at the chosen bounds produced no counterexample to any of the seven named invariants or to TypeOK. The two load-bearing concurrent paths the prose review explicitly defended — FC1's TOCTOU race (Logout × cascade) and the step-5 map-write-failure asymmetry — both survive every interleaving the bounded model can produce. No new spec finding. No new model finding. The verification is reproducible from a fresh checkout: `java -cp tla2tools.jar tlc2.TLC -config login.cfg -workers 4 login.tla` against the canonical files produces the identical state count.

Round 5 closed clean. Foundational findings: zero. Refining findings: zero. Login moves from `grounded on Final Critique 4` to `grounded on Final Critique 5`.

**Formal-layer vote — 2026-06-03: YES (model present).** Cascade completeness (Inv 2, concurrent-snapshot-scoped with named interleaving gaps) and map-inverse consistency (Inv 6) are interleaving properties; verified by the TLA+ model. Verified by the sibling formal model (`login.tla`); the pattern remains `grounded`. Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.
