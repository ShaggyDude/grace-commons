---
title: Session
parent: Compliance
grand_parent: Atomic Concepts
nav_order: 10
has_toc: true
toc: true
---

# Session

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A compliance primitive: a time-limited authenticated channel — a durable record attesting that a given principal was authenticated at a specific moment and that the authentication result remains queryable until the session expires or is explicitly revoked. Each session is an opaque (system-generated, immutable) token; the principal reference, issuer reference, and expiry timestamp are immutable properties set on `issue`. The contract the atom enforces is **validity bound**: a session is valid if and only if it has been issued, `now < expires_at`, and it has not been revoked. `validate` returns three structurally distinct outcomes — `valid(principal_ref, expires_at)`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)` — never collapsed. Expiry timestamps are immutable; extending a session produces a new session record, never a mutation of the prior one.

---

## Intent

Systems that authenticate principals once and then permit them to act across multiple requests for some bounded period — a browser session, an API access window, a mobile application login — need a way to answer the question *"is this principal still authenticated?"* without repeating the full credential verification on every request. The answer to that question is a session: a bounded-lifetime record attesting that a principal completed authentication at a specific time and that the result has not been invalidated since.

The pattern isolates that bounded-lifetime attestation from the surrounding machinery. Session does not perform credential verification — that is Credential's surface. Session does not decide what the authenticated principal may do — that is Permissions' surface. Session does not implement the login flow that sequences credential checking, multi-factor challenges, and session issuance — that is Login's surface (C13). Session answers one structural question: *given this session token, is there an active, non-expired, non-revoked session for a known principal?* The answer is one of four first-class outcomes, derivable from stored records alone.

The time-bounding discipline is the atom's core structural commitment. `expires_at` is set on `issue` from the caller-supplied `session_duration` (or the deployment's default) and is never mutated thereafter. A session that needs a longer lifetime is re-issued — a new record with a new token — not extended in place. This immutability makes every session's validity window fully auditable from the record alone: there is no need to consult a history table, an event log, or a developer's account of whether and when extensions were granted. The record says when validity ends; that field never changes.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the session record and its status), its own actions (`issue`, `validate`, `expire`, `revoke`), and its own operational principles (immutable expiry, three first-class validation outcomes, revocation is absorbing). It does not implement the credential check that precedes `issue`, the permission check that follows `validate`, the multi-device token management that links sessions across devices, or the logout flow that is visible to the end user. Each is a separate composable atom or composing pattern; see Composition notes.

---

## Summary

Session is the compliance atom (a freestanding pattern spec — one that does not name any other pattern — that captures a single software concept with its own state and actions) that answers the question *"is this session token currently valid, and for which principal?"* It does this through session records: durable bindings that associate a principal (any entity authenticated by an upstream mechanism, identified by an opaque reference) with a time-bounded validity window. Each session record has a `session_token` — an opaque, system-generated value that functions as both the record's identity and the bearer credential the caller presents to `validate`. The token is cryptographically random; whether the deployment stores the token raw or hashed is a configuration decision documented in the composing Login pattern.

Each session record has a `status` that traverses a simple state machine: `Active` is the only non-terminal state; `Expired` and `Revoked` are the two terminal states. The `expires_at` timestamp is set on `issue` (as `issued_at + session_duration`) and is the one field, besides `status`, that governs validation outcomes — a session past its `expires_at` is invalid regardless of status. Revocation transitions the session to `Revoked` regardless of how much time remains; revocation is absorbing and produces an immutable attribution record (who revoked it, when, and why). Expiry transitions the session to `Expired` — either lazily at the next `validate` call that finds the session past its `expires_at`, or eagerly by a background scheduler; both paths are conformant and produce the same observable outcome.

`validate(session_token)` is the atom's primary query surface. It returns one of four structurally distinct outcomes:

- `valid(principal_ref, expires_at)` — the session is Active, not yet expired, not revoked. The caller receives the principal_ref the session was issued for, and when it expires.
- `invalid(expired)` — the session's `expires_at` has passed, or the session is in `Expired` status.
- `invalid(revoked)` — the session is in `Revoked` status.
- `invalid(not-known)` — the session_token does not reference any known session record.

These four outcomes are never collapsed into a single `invalid` result — collapsing them would obscure structurally different situations (a token that never existed is different from a token that existed and was revoked; a revoked session may require a different response from the composing system than an expired one).

The most common uses are: browser session management (a cookie-backed session token checked on every authenticated request); API access tokens (a bearer credential with a configurable expiry, validated before each API call); mobile application sessions (a token persisted on the device, validated against the session record on the server); and short-lived administrative sessions (issued at elevation time, expired after a brief window without requiring full re-authentication). In every case the mechanic is the same — issue once, validate on each request, expire or revoke on logout or anomaly detection — and the result is the same: the question *"is this principal still authenticated?"* has a structural answer derivable from stored records, not from runtime state or developer testimony.

Session does not cover identity proofing, credential verification, multi-factor orchestration, permission checking, or session re-establishment after expiry. This atom's responsibility begins when `issue` is called with a principal reference and ends when `validate` returns its result.

---

## Structure

### Identity model

Every session known to the system has a **`session_token`** — an opaque, cryptographically random, immutable, system-generated value produced by `issue`. The token is both the session's record identity and the bearer credential the caller presents to `validate`. Because the token is the bearer credential, its security properties matter: it must be unguessable (sufficient entropy — see Configuration) and unpredictable from any public information about the principal or the issuance time.

Two sessions for the same principal issued at different times have different tokens; there is no relationship between a session's token and any property of the principal. Tokens are not reused after a session expires or is revoked.

The token-as-identity model is deliberate: it mirrors how session systems actually work (the cookie IS the session identifier) and makes `validate` a simple lookup — the caller presents a token and the atom looks it up by that token. The alternative (a separate opaque `session_id` plus a separate `session_token`) adds indirection without structural benefit for this atom's scope.

### Inputs and Outputs

**Actions:**

- `issue(principal_ref, issued_by_ref, session_duration) → session_token | rejected(invalid-request | storage-failure)`
- `validate(session_token) → valid(principal_ref, expires_at) | invalid(expired | revoked | not-known)`
- `expire(session_token) → expired | rejected(not-active | not-known)`
- `revoke(session_token, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-terminal | not-known)`

**Inputs:**

- `principal_ref` — an opaque reference to the principal for whom the session is being issued. The atom treats this as opaque; it does not validate that the principal exists in any registry or that they were actually authenticated. The caller (the Login composition, or whatever issues sessions) is responsible for ensuring `issue` is called only after successful authentication.
- `issued_by_ref` — an opaque reference to the mechanism that issued the session (e.g., a Login service, an SSO system, an administrative process). Recorded as an immutable property of the session. Non-null and non-empty required.
- `session_duration` — a duration value (in seconds, or a deployment-standard unit) specifying how long the session should be valid. If null, the deployment's default session duration applies. Must be a positive value; zero or negative is rejected as `invalid-request`.
- `session_token` — the bearer credential the caller presents to `validate`, `expire`, and `revoke`. Produced by `issue`; presented by the caller on subsequent calls.
- `revoked_by_ref` — an opaque reference to the actor or mechanism performing the revocation. Recorded as an immutable property of the revocation event. Non-null and non-empty required.
- `reason` — a caller-supplied reason string for the revocation. Recorded as an immutable property of the revocation event. Non-null and non-empty required.

**Outputs:**

- The current set of session records. For each: `session_token`, `principal_ref`, `issued_by_ref`, `issued_at`, `expires_at`, `status`, `expired_at` (nullable), `revoked_at` (nullable), `revoked_by_ref` (nullable), `revocation_reason` (nullable).
- `issue` returns a new `session_token` on success, or a rejection naming the failed precondition.
- `validate` returns `valid(principal_ref, expires_at)` or `invalid(reason)`. No state change.
- `expire` returns `expired` on success, or a rejection.
- `revoke` returns `revoked` on success, or a rejection.

### State

Each session record carries a `status` field. The state machine is:

- **Active** — the session may be validated. `validate` checks expiry and returns `valid` or `invalid(expired)` depending on `now` vs. `expires_at`. This is the only non-terminal state.
- **Expired** — `expires_at` has passed. The session can no longer be validated as `valid`. Terminal.
- **Revoked** — explicitly revoked. The session can no longer be validated as `valid`. Terminal.

Transitions:

- `issue(principal_ref, issued_by_ref, session_duration)` → a new session record is created in `Active` with a fresh `session_token`, the supplied `principal_ref` and `issued_by_ref`, `issued_at = now`, and `expires_at = now + session_duration` (or the deployment default if session_duration is null). Returns `session_token`.
- `expire(session_token)` → the record's `status` transitions from `Active` to `Expired`; `expired_at = now` is recorded. No other fields change. May be called by a background scheduler, or triggered lazily as a side effect of `validate` detecting `now >= expires_at`. In the lazy path, the transition occurs atomically with the `validate` call that detects expiry; the `validate` returns `invalid(expired)`.
- `revoke(session_token, revoked_by_ref, reason)` → the record's `status` transitions from `Active` to `Revoked`; `revoked_at = now`, `revoked_by_ref`, and `revocation_reason` are recorded. No other fields change.
- *(no transitions out of Expired or Revoked)*

Each session record carries:

- **`session_token`** — opaque, cryptographically random, immutable, system-generated. Set on `issue`. Never changes.
- **`principal_ref`** — opaque reference to the authenticated principal. Set on `issue`. Never changes.
- **`issued_by_ref`** — opaque reference to the issuing mechanism. Set on `issue`. Never changes.
- **`issued_at`** — wall-time when `issue` was called. Immutable.
- **`expires_at`** — the time at which this session expires. Set on `issue` as `issued_at + session_duration`. Never changes. Never null — every session has a finite lifetime.
- **`status`** — current status. Set to `Active` on `issue`. Transitions to `Expired` or `Revoked` via their respective actions. Never returns to `Active` once terminal.
- **`expired_at`** — set when `status` transitions to `Expired`. Null otherwise. Immutable once set.
- **`revoked_at`** — set when `status` transitions to `Revoked`. Null otherwise. Immutable once set.
- **`revoked_by_ref`** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **`revocation_reason`** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Principal completes authentication.** The composing Login pattern calls `issue(principal_ref, issued_by_ref, session_duration) → session_token`. The atom creates the session record and returns the token. Login delivers the token to the caller (typically as a cookie or Authorization header value).
2. **Principal makes a subsequent request.** The caller presents the session_token. The composing pattern calls `validate(session_token)`. If `valid(principal_ref, expires_at)` is returned, the composing pattern proceeds with the principal_ref as the authenticated identity. If `invalid(...)` is returned, the composing pattern redirects to re-authentication.
3. **Session approaches or reaches expiry.** Either a background scheduler detects sessions where `now >= expires_at` and calls `expire(session_token)` on each, or the next `validate` call for the expired session detects expiry lazily and atomically transitions the record to `Expired`. Both paths produce the same observable outcome: `validate` returns `invalid(expired)`.
4. **Principal logs out, or an administrative action invalidates the session.** The composing pattern calls `revoke(session_token, revoked_by_ref, reason)`. The atom records who revoked it, when, and why, and transitions the session to `Revoked`. Subsequent `validate` calls return `invalid(revoked)`.
5. **Principal re-authenticates.** The composing Login pattern issues a new session: `issue(...)` produces a new token. The prior session (expired or revoked) remains in the record store as an immutable history entry.

### Decision points

**At `issue(principal_ref, issued_by_ref, session_duration)`:**
- `principal_ref` and `issued_by_ref` must be non-null and non-empty; otherwise `invalid-request`.
- `session_duration` must be positive if supplied; null uses the deployment default. A zero or negative value returns `invalid-request`.
- The deployment default session duration must be configured; if absent, `issue` returns `invalid-request`. (A session store with no duration policy is a deployment misconfiguration, not a valid operating state.)
- `expires_at` is computed as `issued_at + session_duration` (using the wall clock at the moment `issue` executes). This computation happens once, at issue time, and the result is stored as an immutable field. The atom never re-derives `expires_at` from the current time.
- If the store write fails, `storage-failure` is returned with no partial record in the store.

**At `validate(session_token)`:**
- The atom looks up the session by `session_token`. If no record is found, `invalid(not-known)`. This is a lookup miss — structurally distinct from a validation failure on a known session.
- If the record is found and `status = Revoked`, `invalid(revoked)` — regardless of whether `expires_at` is still in the future. Revocation takes precedence over expiry in the outcome vocabulary; a session can be revoked before it expires.
- If the record is found and (`status = Expired` OR `now >= expires_at`), `invalid(expired)`. In the lazy-expiry path, the atom may atomically write the `Expired` status transition at this point.
- If the record is found, `status = Active`, and `now < expires_at`, `valid(principal_ref, expires_at)`.
- `validate` does not modify any record except for the lazy `Expired` transition described above. It increments no counter, touches no other field, and produces no other side effect.

**At `expire(session_token)`:**
- `session_token` must reference a known record; otherwise `not-known`.
- The referenced session's `status` must be `Active`; otherwise `not-active`. A session already in `Expired` or `Revoked` status cannot be expired again.
- The transition to `Expired` and the write of `expired_at` are atomic.

**At `revoke(session_token, revoked_by_ref, reason)`:**
- `session_token` must reference a known record; otherwise `not-known`.
- The referenced session's `status` must be `Active`; otherwise `already-terminal`.
- `revoked_by_ref` and `reason` must be non-null and non-empty; otherwise `invalid-request`. Revocation without attribution and a stated reason is a compliance process violation; the atom enforces the constraint at call time.
- The transition to `Revoked` and the writes of `revoked_at`, `revoked_by_ref`, and `revocation_reason` are atomic.

### Behavior

- **`validate` is a pure read (with one narrow exception).** The atom does not update any counters, touch any fields, or produce any side effects as a result of `validate`, except: when the lazy-expiry path fires (the session is Active but `now >= expires_at`), the atom atomically writes the `Expired` status transition as part of the `validate` call. This is the only state change `validate` may produce, and it is bounded — the transition happens at most once per session, and only in the direction of termination.
- **Expiry timestamp immutability is absolute.** No action the atom exposes can change `expires_at`. Extending a session requires calling `issue` again, which produces a new record with a new token. The old record remains in the store. A composing system that wants to refresh a session must issue a new one and deliver the new token to the caller; the old token becomes independently invalid at its own `expires_at`.
- **Revocation precedes expiry in validation logic.** A session that was revoked before its `expires_at` returns `invalid(revoked)`, not `invalid(expired)`, even if both conditions hold at validate time. The distinction matters operationally: a revoked session implies a deliberate decision (logout, compromise response, administrative action); an expired session implies normal end-of-life. The composing system may take different actions in each case.
- **`issue` makes no authentication judgment.** The atom issues a session for whatever `principal_ref` it is given. It does not verify that the principal was actually authenticated, that a valid credential exists, or that any upstream check was performed. That responsibility belongs entirely to the caller. An implementation that calls `issue` without first verifying a credential has a process error that the atom cannot detect or prevent — it is the Login composition's (C13) wiring that ensures `issue` is called only after `Credential.verify` returns `verified`.
- **Revocation attribution is mandatory and immutable.** `revoked_by_ref` and `revocation_reason` are required inputs to `revoke`; null or empty values are rejected. Once written, they do not change. An auditor reading the session record after revocation can determine who revoked the session and why without consulting any external system.

### Feedback

Each successful action produces an observable, measurable change:

- After `issue` — a new session record appears in `Active` status with a fresh `session_token`, the supplied `principal_ref` and `issued_by_ref`, `issued_at`, and `expires_at`. Total record count increases by one. The token is returned to the caller.
- After `validate` — no state change (except possible lazy Expired transition). Returns `valid(principal_ref, expires_at)` or `invalid(reason)`.
- After `expire` — the target session's `status` transitions to `Expired`; `expired_at` is set.
- After `revoke` — the target session's `status` transitions to `Revoked`; `revoked_at`, `revoked_by_ref`, and `revocation_reason` are set.

Rejected actions produce named rejection codes observable to the caller: `invalid-request`, `storage-failure`, `not-active`, `not-known`, `already-terminal`. `validate`'s four outcomes (`valid`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)`) are first-class results, not rejections — they are the normal vocabulary of a validation query, each carrying distinct operational meaning.

The session store is queryable. Per-record fields (all fields except the deployment's internal token storage format) are observable to authorized administrative surfaces. Composing patterns may query sessions by `principal_ref` to support "show all active sessions for this account" and "revoke all sessions for this account" administrative operations.

### Invariants

**Invariant 1 — Issue immutability.** Once a session record is created, `session_token`, `principal_ref`, `issued_by_ref`, `issued_at`, and `expires_at` never change. The only fields that may change after issue are `status` (and the associated terminal-state timestamp fields set when a terminal transition fires).

**Invariant 2 — Expiry timestamp immutability.** `expires_at` is computed once at `issue` time and never mutated by any action the atom exposes. An `expire` action does not change `expires_at`; it changes `status` to `Expired`. The distinction matters: `expires_at` states *when* validity ends; `status = Expired` states *that* the terminal transition has been formally recorded.

**Invariant 3 — Validity bound conjunctive.** A `validate` call returns `valid(...)` if and only if all three conditions hold simultaneously: the session token references a known record, `status = Active`, and `now < expires_at`. Any single condition failing produces an `invalid(...)` result. The conditions are checked in this order: not-known first (lookup miss), then revoked (Revoked status takes precedence), then expired (Expired status or now >= expires_at), then valid.

**Invariant 4 — Revocation absorbing.** Once a session's `status` is `Revoked`, no subsequent `validate` call for that token returns `valid`. Because the terminal state is absorbing (Invariant 5), a revoked session cannot be un-revoked. The `invalid(revoked)` outcome is permanent for a given token.

**Invariant 5 — Terminal state absorbing.** A session in `Expired` or `Revoked` status admits no further state transitions. `expire` on a non-Active session returns `not-active`; `revoke` on a terminal session returns `already-terminal`.

**Invariant 6 — Four structurally distinct validate outcomes.** `valid(principal_ref, expires_at)`, `invalid(expired)`, `invalid(revoked)`, and `invalid(not-known)` are always structurally distinct result values. No implementation may collapse `invalid(expired)` and `invalid(revoked)` into a single `invalid` result, nor collapse `invalid(not-known)` with either failure case. Each outcome carries different operational meaning and must be distinguishable by the caller.

**Invariant 7 — Session token uniqueness.** No two session records share a `session_token` across the lifetime of the system. Tokens are not reused after a session expires or is revoked. This invariant requires that the token generation mechanism produce values with negligible collision probability — see Configuration.

**Invariant 8 — Revocation attribution completeness.** Every session record in `Revoked` status has non-null `revoked_at`, `revoked_by_ref`, and `revocation_reason`. A `Revoked` record missing any of these fields is evidence of a process violation; the atom's `revoke` action enforces the non-null constraint at call time.

**Invariant 9 — Session durability.** Once `issue` returns a `session_token`, the session record is durably persisted. A `storage-failure` rejection guarantees no partial record was written. The record count is monotonically non-decreasing; the atom provides no deletion surface. Cascading deletion under a retention policy is the composing application's responsibility.

**Invariant 10 — Every session has a finite lifetime.** `expires_at` is never null. Every session issued by this atom has a deterministic expiry time. Sessions that do not expire are not expressible; an implementation that issues sessions without an `expires_at` has violated this invariant.

Invariants 1, 2, and 10 together give the *temporal auditability* property — every session's validity window is fully determined from a single record with no mutable fields. Invariants 3 and 6 give the *validation clarity* property — the outcome of any `validate` call is unambiguous, distinguishable, and determined by record state alone. Invariant 4 gives the *revocation finality* property — a revoked session cannot resurface as valid via any path.

---

## Examples

### Browser login — issue and validate

A user logs in via the Login composition. After successful credential verification, Login calls `issue(principal_ref: user_u91, issued_by_ref: login_svc_l01, session_duration: 3600) → session_token: tok_abc123`. The atom creates a session record: `status: Active`, `issued_at: 2026-09-01T10:00:00Z`, `expires_at: 2026-09-01T11:00:00Z`. The token is delivered to the user's browser as a session cookie.

Twenty minutes later, the user requests a protected page. The application calls `validate(session_token: tok_abc123) → valid(principal_ref: user_u91, expires_at: 2026-09-01T11:00:00Z)`. The atom finds the record, confirms `status = Active` and `now (10:20Z) < expires_at (11:00Z)`, and returns the result. No state changes. The application serves the page to user_u91.

### Logout — revoke

The user clicks "Log out." The application calls `revoke(session_token: tok_abc123, revoked_by_ref: user_u91, reason: "user-initiated-logout") → revoked`. The atom transitions the record to `Revoked`, writing `revoked_at: 2026-09-01T10:45:00Z`, `revoked_by_ref: user_u91`, `revocation_reason: "user-initiated-logout"`. The record's `expires_at` is unchanged at `2026-09-01T11:00:00Z` — that field is immutable.

If the user's browser re-presents the old cookie: `validate(session_token: tok_abc123) → invalid(revoked)`. The revoked status takes precedence; the atom does not return `invalid(expired)` even though the session could have expired naturally in 15 minutes.

### Session expiry — lazy path

The user closes their browser without logging out. The session expires at `11:00Z`. No `expire` call is made. At `11:30Z`, the user opens a new browser tab that still has the cookie and makes a request. The application calls `validate(session_token: tok_abc123) → invalid(expired)`. The atom finds the record: `status = Active` (not yet formally transitioned), `expires_at = 2026-09-01T11:00:00Z`, and `now = 2026-09-01T11:30:00Z`. Since `now >= expires_at`, the atom atomically transitions the record to `Expired` (writing `expired_at: 2026-09-01T11:30:00Z`) and returns `invalid(expired)`. The application redirects to re-authentication.

### Rejection paths

**`issue` — `invalid-request` (zero-duration):** An application accidentally calls `issue(principal_ref: svc_s03, issued_by_ref: api_gateway_g01, session_duration: 0) → rejected(invalid-request)`. A zero-duration session is not a valid operating state; the atom rejects it at issue time.

**`revoke` — `already-terminal`:** An incident-response script attempts to revoke a session that already expired naturally: `revoke(session_token: tok_abc123, revoked_by_ref: admin_a01, reason: "incident-response") → rejected(already-terminal)`. The session is already in `Expired` status; the atom rejects the revoke call. The session's `revocation_reason` is not set — the session was not revoked, it expired. If the composing system needs to record an administrative annotation on an expired session, that is a composing-pattern concern outside the atom's scope.

**`validate` — `invalid(not-known)`:** A caller presents a token that was never issued (or was generated by a different system): `validate(session_token: tok_forged_xyz) → invalid(not-known)`. The atom finds no record for this token. This result is structurally distinct from `invalid(revoked)` — no session was revoked; no session exists.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A HIPAA compliance auditor asks *"can you prove that access to patient record PR-4411 at 14:32 UTC on 2026-10-15 was under a valid, non-revoked session?"* The auditor queries the session store for all sessions active at `14:32Z` for the principal involved. The query finds `tok_abc123`: `status: Active` (at the time; now Expired), `issued_at: 2026-10-15T14:00:00Z`, `expires_at: 2026-10-15T15:00:00Z`, `revoked_at: null`. Invariant 3 (validity bound conjunctive) is the structural answer: at `14:32Z`, the session was `Active` and `expires_at` had not yet passed, so `validate` would have returned `valid` at that time. The auditor can verify this from the record alone — `issued_at`, `expires_at`, and `revoked_at: null` are sufficient.

**Disputed access event.** A user claims *"I did not access my account at 03:15 AM on 2026-11-20 — someone else was using my session."* The investigator queries the session store for sessions belonging to the user's `principal_ref` that were `Active` at `03:15`. The query finds `tok_abc123`: `issued_at: 2026-11-19T22:00:00Z`, `expires_at: 2026-11-20T06:00:00Z`, `issued_by_ref: login_svc_l01`. The session was active at the time of the disputed access. Whether the session token was stolen (and by whom) is a separate investigation; the atom's records bound the forensic window: the session was issued through the Login service at 22:00, was valid at 03:15, and was never revoked before the access occurred. The composing Login pattern's attestation records (from Actor Identity) establish who authenticated at 22:00 and what credential was verified.

**Breach investigation.** A security team discovers that session tokens were exposed in a log file. They need to know which principals are affected. The investigator queries the session store for all sessions `issued_by_ref: api_gateway_g01` between `2026-12-01T00:00:00Z` and `2026-12-03T12:00:00Z` (the exposure window). The query returns 47 sessions across 31 distinct `principal_ref` values. The response team calls `revoke` on all 47 sessions (for those not yet expired or revoked), recording `revoked_by_ref: security_team_s01` and `reason: "log-exposure-incident-2026-12-03"`. Invariant 8 (revocation attribution completeness) ensures that an auditor reading the records six months later can reconstruct exactly which sessions were revoked, by whom, when, and why — without consulting the incident response team or their runbooks.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Credential verification.** Whether the principal was actually authenticated before `issue` was called is entirely the caller's responsibility. The atom issues a session for whatever `principal_ref` it receives. The Login composition (C13) is the pattern that wires Credential verification to Session issuance; without that wiring, `issue` can be called for any principal by any caller. The atom provides no guard against this.
- **Multi-factor sequencing.** Requiring that a principal present two credentials before a session is issued (password then TOTP; hardware key then PIN) is a composing-pattern concern. Login (C13) is where multi-factor sequencing is expressed. The atom sees only the final `issue` call.
- **Session renewal and sliding windows.** The atom does not implement session renewal (extending `expires_at` by some duration on each active request). Sliding-window sessions require the composing pattern to issue a new session (new token, new `expires_at`) on some renewal trigger and to invalidate the prior token. Both operations are within scope of the atom's actions; the renewal policy is the composing pattern's concern.
- **Device binding.** Whether a session token is bound to a specific device, browser fingerprint, or IP address is a composing-pattern concern. The atom stores no device information; binding a token to a device context is an additional validation step the composing system performs before calling `validate`.
- **Session concurrency limits.** Whether a principal may have N concurrent active sessions (and what happens when the limit is exceeded) is a composing-pattern concern. The atom imposes no limit on how many Active sessions a given `principal_ref` may have. Enforcing a one-session-per-principal or K-sessions-per-principal rule is the composing Login pattern's obligation.
- **Logout propagation across devices.** When a user logs out on device A, ensuring their session on device B is also revoked requires the composing system to query sessions by `principal_ref` and revoke all of them. The atom supports this via its `principal_ref`-queryable store, but does not implement the propagation automatically.
- **Permission checking.** What the principal identified by `validate`'s `principal_ref` result is permitted to do is Permissions' surface. Session answers *"is this principal currently authenticated?"*; Permissions answers *"is this principal allowed to do this thing?"* Session-Gated Authorization (C14) is the composition that wires them: Permissions checks are blocked if `validate` returns `invalid`.
- **Token format and encoding.** The atom produces an opaque `session_token`. Whether that token is a random hex string, a UUID, a JWT (JSON Web Token), or an opaque blob is a deployment-configuration concern. If the token is a JWT, the atom's immutability invariants take precedence over JWT's native extension claims — `exp` in a JWT must match the stored `expires_at` and the token must not be extended without re-issuance.
- **Token storage security.** Whether the `session_token` is stored in the record store as a raw value or as a cryptographic hash (to prevent a database breach from yielding usable tokens) is a deployment-configuration concern. Storing tokens raw is simpler; storing hashed tokens (and matching presented tokens by hashing them before lookup) is more secure. Both are conformant with the atom's invariants. The choice should be documented in the composing Login pattern's configuration.
- **Clock accuracy.** `issued_at`, `expired_at`, `revoked_at`, and `expires_at` are captured from the deployment's clock. Whether that clock is honest, monotonic, or synchronized is a deployment concern. Trusted timestamping (RFC 3161) is a composing pattern for deployments that require externally verifiable timestamps.
- **Session store tamper-evidence.** As with all atoms in the compliance cluster, the session store can be composed with Tamper Evidence for deployments requiring cryptographic proof that no session record was retroactively altered.

---

## Composition notes

Session is freestanding. It is named by Login (C13) and Session-Gated Authorization (C14) as a constituent atom:

- **[Credential](./credential.md)** — Credential verifies the principal's authentication material; Session persists the result. The Login composition (C13) is the wiring: a successful `Credential.verify` produces a `Session.issue` call. The two atoms are distinct: Credential answers *"did the right material arrive?"*; Session answers *"is this principal still within a valid authentication window?"*
- **[Actor Identity](./actor-identity.md)** — in regulated deployments, the `issue` call may be paired with an Actor Identity `attest` call to produce a non-repudiable record that a specific actor initiated the session. The Audit Trail substrate is where this attribution is recorded.
- **[Permissions](./permissions.md)** — Session-Gated Authorization (C14) gates every Permissions query on Session validity. The composing pattern calls `validate` before calling any Permissions action; if `validate` returns `invalid`, the Permissions check is skipped and the action is rejected.
- **[Audit Trail](../../compositions/audit-trail.md)** — in regulated deployments, `issue` and `revoke` events should be recorded in the Audit Trail. The atom does not mandate this; it is the Login composition's (C13) obligation to wire session lifecycle events into the audit record.
- **[Tamper Evidence](./tamper-evidence.md)** — for regulated deployments, the session store (including the revocation attribution history) should be hash-chained and externally anchored.
- **Login** *(C13 — not started)* — wires Credential verification to Session issuance, both attested under the verified principal. Carries the cascade invariant: revocation of the underlying Credential invalidates every Session derived from it — a property of the Login composition's emergent state, not of either constituent atom alone.
- **Session-Gated Authorization** *(C14 — not started)* — gates every Permissions check on Session validity. The pre-check fires before the Permissions call; a stale or revoked session rejects the check before Permissions is consulted.
- **External Onboarding** *(C16 — not started)* — may issue an initial session as the final step of onboarding, once the invited principal's credential is registered. Whether it does so is a deployment configuration of C16.

---

## Standards references

- **NIST SP 800-63B §7 (Session Management)** — the primary standard for session management in authentication systems. Requirements for session binding, session duration, reauthentication triggers, and session termination correspond directly to this atom's behavioral commitments. The atom's `expires_at` immutability and re-issuance discipline implement 800-63B's requirement that session extensions produce new session identifiers.
- **OWASP ASVS V3 (Application Security Verification Standard — Session Management)** — the OWASP verification standard for session management security. Requirements for session token randomness, expiry, revocation on logout, and protection against fixation attacks are the deployment-configuration surface of this atom.
- **RFC 6265 (HTTP State Management Mechanism)** — the cookie standard. The atom's `session_token` is the value delivered in a `Set-Cookie` response header in browser-based deployments. The atom does not specify cookie attributes (Secure, HttpOnly, SameSite) — those are the composing pattern's configuration obligations.
- **SAML 2.0 §4.1.4 (Session Establishment and Termination)** — the SAML session model maps to this atom: `AuthnStatement` issuance corresponds to `issue`; `SessionNotOnOrAfter` corresponds to `expires_at`; `SLO` (Single Logout) corresponds to `revoke`. The atom's re-issuance discipline aligns with SAML's prohibition on reusing assertion IDs.
- **RFC 6819 (OAuth 2.0 Threat Model and Security Considerations)** — identifies session-related threats (token theft, session fixation, CSRF) that the deployment-configuration layer of this atom addresses. The atom's immutability and revocation invariants mitigate token theft's blast radius: a stolen token is bounded by `expires_at` and can be revoked.
- **OIDC Session Management 1.0 (OpenID Connect Session Management)** — the OpenID Connect session management specification. The atom's `session_token` corresponds to an OIDC session's identifier; `expire` and `revoke` correspond to OIDC's Front-Channel and Back-Channel Logout protocols.
- **HIPAA §164.312(a)(2)(iii) (Automatic Logoff)** — the HIPAA automatic logoff requirement: electronic information systems must terminate after a period of inactivity. The atom's `expires_at` field is the structural mechanism for this requirement; the composing deployment configures the timeout.
- **PCI DSS Requirement 8.6 (Session Management)** — session timeout and re-authentication requirements for payment systems. The atom's `expires_at` immutability and re-issuance discipline satisfy the structural portion of these requirements.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of keeping credential verification, session persistence, permission checking, and logout propagation as separate composable atoms rather than absorbing them here.
- **IETF RFC 4120 (Kerberos)** — Kerberos tickets are the canonical precedent for time-bounded, revocable authentication session records. The atom's immutable `expires_at`, two-terminal-state machine, and revocation attribution discipline are the structured-natural-language expression of Kerberos' core concepts.

---

## Generation acceptance

A derived implementation of Session is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the session record store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm that every session has a finite, immutable expiry.** For every session record in the store, confirm that `expires_at` is non-null and that no record shows two different values for `expires_at` (i.e., confirm the field never changes after issue). A session with a null or ever-changing `expires_at` violates Invariants 2 and 10 and is evidence of an implementation defect.
- **Reconstruct which sessions were active at any historical point in time.** Given a timestamp T, query all records where `issued_at <= T` and `expires_at > T` and `(revoked_at is null OR revoked_at > T)`. The result is the set of sessions that `validate` would have returned `valid` for at time T. This reconstruction requires no external data beyond the session store.
- **Confirm revocation attribution completeness.** For every record with `status = Revoked`, confirm that `revoked_at`, `revoked_by_ref`, and `revocation_reason` are all non-null and are consistent with the record's `status`. A `Revoked` record missing any of these fields is a violation of Invariant 8 and evidence of a process violation.
- **Confirm the four validate outcomes are structurally distinct.** Inspect the implementation's `validate` return surface and confirm that `valid`, `invalid(expired)`, `invalid(revoked)`, and `invalid(not-known)` are distinguishable values — not collapsed into a boolean or a single `invalid` code. This check may require examining the implementation's API contract rather than the record store alone; it is the behavioral commitment of Invariant 6.
- **Confirm terminal state finality.** For any record in a terminal state (`Expired` or `Revoked`), confirm that no subsequent record for the same `session_token` exists showing `status = Active`. Terminal records are absorbing; a record showing re-activation from a terminal state is evidence of an implementation defect.

This is the generator's contract: any implementation derived from this atom must produce a session store that passes all five checks above. The bar is the regulator's question — *"can you prove that authenticated access to protected resources was bounded by valid, non-revoked sessions throughout?"* — not the developer's intuition.

---

## Status

`draft` — first draft. All required structural elements present: identity model, action signatures with fully-named rejection and outcome reasons, state machine (Active → Expired | Revoked), ten invariants, five examples (two happy path, three rejection path), three regulated adversarial scenarios, five-check Generation acceptance. Awaiting three-pass pressure testing.

*Provisional placement note: this atom is filed in `atoms/compliance/` as the initial home for authentication-adjacent infrastructure. Session is not pure compliance infrastructure (it has meaningful non-regulated applications wherever authentication persistence is required). A future taxonomy refactor may relocate it to `atoms/security/` or `atoms/identity/`, carrying `regulated: true` as a frontmatter attribute. See the Open taxonomy question in ROADMAP.md and Methodology debt #5.*

---

## Lineage notes

First draft. No pressure-testing passes have run. Sections will be populated as passes complete.

**Conventions inherited.** This atom is a regulated atom (provisional `atoms/compliance/` placement) and carries *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

**Structural decisions made in draft.**

- *`session_token` as identity.* The token presented to `validate` is also the record's identity — there is no separate `session_id`. Rationale: this mirrors how session systems actually operate (the cookie IS the session identifier) and keeps `validate` a simple lookup. The alternative (separate session_id + session_token) adds indirection without structural benefit at the atom layer; token storage security (raw vs. hashed) is a deployment-configuration concern, not an atom-layer distinction.
- *Four structurally distinct `validate` outcomes.* `valid`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)` are never collapsed. Collapsing expired and revoked into a single `invalid` would obscure operationally distinct situations — a revoked session implies a deliberate action; an expired session implies normal end-of-life. Collapsing not-known with the failure cases would merge a lookup miss with a validation failure on a known session, losing forensic precision.
- *Revocation takes precedence over expiry in validation ordering.* A session that is both `Revoked` and past its `expires_at` returns `invalid(revoked)`, not `invalid(expired)`. Rationale: revocation is a deliberate act and should surface to the caller as such, even when the session would have expired anyway. The composing system takes a different action (e.g., clearing revocation-reason vs. simply prompting re-authentication) depending on which outcome it receives.
- *`expires_at` is never null.* Every session has a finite lifetime. The atom rejects zero-duration and null-duration sessions at issue time. Infinite sessions are not expressible. This makes "every session eventually terminates" a structural property rather than a policy aspiration.
- *`issue` makes no authentication judgment.* The atom does not validate that authentication occurred. This is intentional: the atom's job is time-bounded session management, not authentication. Ensuring `issue` is called only after authentication is the Login composition's wiring obligation. The atom trusting the caller is an explicit, defended architectural choice — not an oversight.
