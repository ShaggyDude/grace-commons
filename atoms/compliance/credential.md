---
title: Credential
parent: Compliance
grand_parent: Atomic Concepts
nav_order: 9
has_toc: true
toc: true
---

# Credential

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A compliance primitive: a durable binding between a principal and a secret or token the principal presents to prove they are who they claim to be. Each binding is a *credential record* with an opaque (system-generated, immutable) id; the principal reference, credential type, and verifier are immutable properties set on `register`. The contract the atom enforces is **sole-holder verification** — `verify` returns `verified` only for the principal bound at registration, against the credential material registered at that time. Rotation never mutates a prior record; it produces a new record and transitions the prior record to the terminal state `Rotated`. Revocation is absorbing: once `Revoked`, no future `verify` succeeds.

---

## Intent

Authenticated systems require that an actor prove their identity before taking actions of consequence — withdrawing funds, prescribing medication, signing a contract, provisioning a new user, accessing a protected record. The proof mechanism is a credential: something the actor knows (a memorized secret), something the actor has (a hardware token, a smart card), or something the actor is (a biometric bound to a signing key). What is constant across all three classes is the *binding* — the association between a specific principal and specific credential material, established at registration time and queryable at verification time.

The pattern isolates that binding from the surrounding machinery. Credential does not implement login flows, session management, identity proofing, multi-factor orchestration, or authorization decisions. It answers one structural question: *given this principal and this credential type, does the presented material match what was registered?* The answer is binary — `verified` or a named reason for failure — and the question is answerable from stored records alone without consulting the system's runtime state or the calling actor's testimony.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the credential record and its status), its own actions (`register`, `verify`, `rotate`, `revoke`), and its own operational principles (verifiers are stored, not raw material; rotation produces a new record; revocation is absorbing). It does not implement the identity proofing that establishes *who a principal is* before they can register a credential — that is Party Identity's surface. It does not implement the session that persists the result of a successful verification — that is Session's surface. It does not implement the permission check that gates what an authenticated principal may do — that is Permissions' surface. Each is a separate composable atom; see Composition notes.

---

## Summary

Credential is the compliance atom (a freestanding pattern spec — one that does not name any other pattern — that captures a single software concept with its own state and actions) that answers the question *"does this presented material belong to this principal, for this credential type?"* It does this through credential records: durable bindings that associate a principal (any entity — a user, a service account, a system actor — identified by an opaque reference) with credential material processed into a verifier (a stored artifact derived from the raw material in a way that allows later comparison without recovering the original). The verifier, not the raw material, is what persists; raw credential material is consumed on `register` and on `verify` and is never stored.

Each credential record has a `status` that traverses a simple state machine: `Active` is the only non-terminal state; `Rotated`, `Revoked`, and `Expired` are the three terminal states. A principal may have at most one `Active` credential of a given type at any time — uniqueness is enforced per `(principal_ref, credential_type)` pair. Rotation replaces an `Active` credential with a new one: `rotate` registers the new material as a fresh record (producing a new `credential_id`), then atomically transitions the prior record to `Rotated`, recording a `successor_credential_id` link. This link makes the full rotation chain auditable from the record store alone. `revoke` transitions an `Active` credential to `Revoked`, recording who revoked it, when, and why. Expiry is the third terminal path: a credential whose `expires_at` has passed transitions to `Expired`, either eagerly via a scheduled process or lazily at the next `verify` call — both are conformant, and the observable behavior is the same: no `verify` call returns `verified` for an expired credential.

The most common uses are: password-based authentication (the verifier is a salted hash; `verify` hashes the presented password and compares); public-key authentication (the verifier is the public key; `verify` checks a presented signature against the stored public key); TOTP code verification (the verifier is a shared secret; `verify` generates the expected code and compares); API token validation (the verifier is a token hash; `verify` hashes the presented token and compares); and hardware security key binding (the verifier is an attestation public key; `verify` checks a signed assertion). In every case the mechanic is the same — register once, verify on each challenge — and the result is the same: the question *"did this principal present valid credentials?"* has a structural answer derivable from stored records, not from runtime state or developer testimony.

Credential does not cover identity proofing (establishing who a principal is before they can register), multi-factor orchestration (sequencing two or more verification checks), session issuance (persisting a successful verification result over time), or authorization (deciding what a verified principal may do). This atom's responsibility begins when `register` is called with credential material and ends when `verify` returns its result.

---

## Structure

### Identity model

Every credential known to the system has a **`credential_id`** — an opaque, immutable, system-generated identifier produced by `register`. The id is the credential's identity; `principal_ref`, `credential_type`, `verifier`, `status`, and `registered_at` are immutable properties of the record, set on `register` and never changed. (Status is the one field that transitions, but transitions are always to terminal states — once a credential leaves `Active`, it never returns.)

Two credential records for the same principal of the same type have different ids — one is a rotation successor, the other the rotated predecessor. The link from predecessor to successor is carried by `successor_credential_id` on the predecessor record. Ids are not reused.

The opaque-id model matters here for the same reason it matters in other atoms: identifying a credential by `(principal_ref, credential_type)` would conflate the rotation history into a single mutable record, losing the auditability the library's invariants require. Separate records with separate ids preserve the one-credential-one-record discipline that makes rotation-chain reconstruction tractable.

### Inputs and Outputs

**Actions:**

- `register(principal_ref, credential_material, credential_type) → credential_id | rejected(invalid-request | duplicate-active-credential | storage-failure)`
- `verify(principal_ref, credential_type, presented_material) → verified | failed-verification(material-mismatch | no-active-credential)`
- `rotate(credential_id, new_credential_material) → new_credential_id | rejected(not-active | not-known | invalid-request | storage-failure)`
- `revoke(credential_id, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-terminal | not-known)`

**Inputs:**

- `principal_ref` — an opaque reference to the principal whose credential is being managed. The atom treats this as opaque; it does not validate that the principal exists in any registry. That is the caller's responsibility.
- `credential_material` — the raw secret or token the principal provides at registration. Consumed on `register`; never persisted. Non-null and non-empty required; minimum entropy and format constraints are deployment-configurable.
- `credential_type` — a caller-supplied label identifying the kind of credential (e.g., `password`, `totp-secret`, `public-key`, `api-token`). Opaque to the atom; used only to enforce the one-active-per-`(principal_ref, credential_type)` uniqueness rule and to select the correct verifier derivation function.
- `presented_material` — the raw secret or token the principal presents at verification time. Consumed on `verify`; never persisted.
- `credential_id` — references a specific credential record. Used by `rotate` and `revoke`.
- `revoked_by_ref` — an opaque reference to the actor performing the revocation. Recorded on the revoked credential. Non-null and non-empty required.
- `reason` — a caller-supplied reason string for the revocation. Recorded on the revoked credential. Non-null and non-empty required.

**Outputs:**

- The current set of credential records. For each: `credential_id`, `principal_ref`, `credential_type`, `status`, `registered_at`, `expires_at` (nullable), `rotated_at` (nullable), `successor_credential_id` (nullable), `revoked_at` (nullable), `revoked_by_ref` (nullable), `revocation_reason` (nullable). The stored `verifier` is not exposed in outputs — it is an internal artifact.
- `register` returns a new `credential_id` on success, or a rejection naming the failed precondition.
- `verify` returns `verified` or `failed-verification(reason)`. No state change.
- `rotate` returns the new `credential_id` on success, or a rejection.
- `revoke` returns `revoked` on success, or a rejection.

### State

Each credential record carries a `status` field. The state machine is:

- **Active** — the credential can be used for verification. This is the only non-terminal state.
- **Rotated** — a successor credential has been registered for this `(principal_ref, credential_type)` pair. This credential can no longer be used for verification. Terminal.
- **Revoked** — explicitly revoked. This credential can no longer be used for verification. Terminal.
- **Expired** — `expires_at` has passed. This credential can no longer be used for verification. Terminal.

Transitions:

- `register(principal_ref, credential_material, credential_type)` → a new record is created in `Active` with a fresh `credential_id`, the supplied `principal_ref` and `credential_type`, the derived verifier, and `registered_at = now`. Returns `credential_id`.
- `rotate(credential_id, new_credential_material)` → atomically: (1) a new record is created in `Active` for the same `(principal_ref, credential_type)` pair, with a fresh `credential_id` and `registered_at = now`; (2) the prior record's `status` transitions from `Active` to `Rotated`, and `rotated_at = now` and `successor_credential_id = new_credential_id` are recorded on the prior record. The prior record's other fields are never changed.
- `revoke(credential_id, revoked_by_ref, reason)` → the record's `status` transitions from `Active` to `Revoked`; `revoked_at = now`, `revoked_by_ref`, and `revocation_reason` are recorded. No other fields change.
- Clock advance past `expires_at` → `status` transitions from `Active` to `Expired`. May be triggered eagerly by a scheduled process or lazily at the next `verify` call; both are conformant. No other fields change.
- *(no transitions out of Rotated, Revoked, or Expired)*

Each credential record carries:

- **`credential_id`** — opaque, immutable, system-generated. Set on `register`. Never changes.
- **`principal_ref`** — opaque reference to the principal. Set on `register`. Never changes.
- **`credential_type`** — caller-supplied type label. Set on `register`. Never changes.
- **`verifier`** — the processed artifact derived from credential_material. Set on `register`. Never changes. Never exposed in outputs.
- **`status`** — current status. Set to `Active` on `register`. Transitions to terminal states via their respective actions or clock advance. Never returns to `Active` once terminal.
- **`registered_at`** — wall-time when `register` was called. Immutable.
- **`expires_at`** — optional expiry timestamp. Null means no expiry. Set on `register` (from caller-supplied value or deployment policy). Immutable once set.
- **`rotated_at`** — set when status transitions to `Rotated`. Null otherwise. Immutable once set.
- **`successor_credential_id`** — the `credential_id` of the new credential produced by `rotate`. Null otherwise. Immutable once set.
- **`revoked_at`** — set when status transitions to `Revoked`. Null otherwise. Immutable once set.
- **`revoked_by_ref`** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **`revocation_reason`** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Composing pattern establishes a new principal and needs to bind credential material to them.** Calls `register(principal_ref, credential_material, credential_type)`. The atom derives the verifier, records the credential, and returns a `credential_id`. The composing pattern stores the `credential_id` alongside the principal's record if needed; the atom retains the binding internally.
2. **Time passes; the principal attempts to authenticate.** The composing pattern collects the principal's identity claim (`principal_ref`) and presented material. Calls `verify(principal_ref, credential_type, presented_material)`. The atom finds the `Active` credential for this `(principal_ref, credential_type)` pair, derives the verifier from presented_material, and compares. Returns `verified` or `failed-verification(reason)`.
3. **The principal rotates their credential** (e.g., a periodic password change or key rotation policy). Composing pattern calls `rotate(credential_id, new_credential_material)`. The atom creates a new `Active` record, transitions the prior record to `Rotated`, and returns the new `credential_id`.
4. **A credential is revoked** (e.g., compromise suspected, account closure, administrative action). Composing pattern calls `revoke(credential_id, revoked_by_ref, reason)`. The atom records who revoked it, when, and why, and transitions the credential to `Revoked`.
5. **A credential expires.** Either a background scheduler detects `expires_at < now` and transitions the credential to `Expired`, or the next `verify` call detects expiry and returns `failed-verification(no-active-credential)` while the transition occurs lazily. Both paths produce the same observable outcome: no further `verify` succeeds for an expired credential.

### Decision points

**At `register(principal_ref, credential_material, credential_type)`:**
- `principal_ref`, `credential_material`, and `credential_type` must be non-null and non-empty; otherwise `invalid-request`.
- The atom checks for an existing `Active` credential for `(principal_ref, credential_type)`. If one exists, `duplicate-active-credential` — the caller must `rotate` the existing credential rather than registering a new one.
- The verifier is derived from `credential_material` using the derivation function registered for this `credential_type`. The derivation function is deployment-configured (see Configuration in Composition logic of composing patterns); the atom does not mandate a specific cryptographic mechanism beyond the one-way constraint. Raw material is consumed and discarded after derivation.
- If the store write fails after verifier derivation, `storage-failure` is returned with no partial record in the store.

**At `verify(principal_ref, credential_type, presented_material)`:**
- The atom finds the `Active` credential for `(principal_ref, credential_type)`. If none exists — because no credential was ever registered, or all credentials for this pair are in terminal states — `failed-verification(no-active-credential)`. This result does not distinguish between "never registered" and "was rotated/revoked/expired," preventing enumeration of the reason no Active credential exists.
- The atom derives the verifier from `presented_material` using the same derivation function used at `register`. It compares the derived value against the stored verifier. If they do not match, `failed-verification(material-mismatch)`.
- `verify` does not modify state and does not update any record. It is a pure read-only query over the credential store plus the derivation function.
- Expiry check: if the Active credential's `expires_at` is non-null and `now >= expires_at`, the credential is treated as expired. The atom may lazily transition it to `Expired` at this point; regardless, `failed-verification(no-active-credential)` is returned.

**At `rotate(credential_id, new_credential_material)`:**
- `credential_id` must reference a known record; otherwise `not-known`.
- The referenced credential's status must be `Active`; otherwise `not-active`. A `Rotated`, `Revoked`, or `Expired` credential cannot be rotated.
- `new_credential_material` must be non-null and non-empty; otherwise `invalid-request`.
- The two writes — new record creation and prior record status update — are atomic. If the store write fails, `storage-failure` is returned with neither write committed.

**At `revoke(credential_id, revoked_by_ref, reason)`:**
- `credential_id` must reference a known record; otherwise `not-known`.
- The referenced credential's status must be `Active`; otherwise `already-terminal`. A credential already in `Rotated`, `Revoked`, or `Expired` state cannot be revoked.
- `revoked_by_ref` and `reason` must be non-null and non-empty; otherwise the call is rejected as `invalid-request`. (This keeps revocation attribution and reason mandatory — a revocation without an identified revoker or a stated reason is a finding, not a valid record.)

### Behavior

- **Verifier storage, not material storage.** The atom stores the output of a one-way derivation function applied to the raw credential material. The raw material is never stored — not in any field, not in a log, not in a temporary record. This holds for both `register` (where the raw material arrives as input) and `verify` (where the presented material arrives for comparison). An implementation that stores raw credential material has violated this behavioral commitment regardless of whether any invariant could detect it from the record store alone.
- **`verify` is a pure read.** No record is written, no counter is incremented, no state is changed as a result of a `verify` call. The atom does not implement rate limiting, lockout, or failed-attempt tracking — those are composing-pattern concerns.
- **Rotation is a create-then-transition, not a mutate.** The new credential record is a fresh document with its own `credential_id`. The prior record's `verifier` field is never overwritten; the prior record's `principal_ref` and `credential_type` fields are never changed. The only change to the prior record on rotation is the `status` field (Active → Rotated), `rotated_at`, and `successor_credential_id`. This is what makes the rotation history auditable.
- **Revocation records the revoking actor.** `revoked_by_ref` is recorded on the revoked credential. This is the mechanism by which an auditor can determine who revoked a credential and when, from the records alone. The atom does not validate that `revoked_by_ref` is a valid or currently active principal; it is opaque to the atom.
- **`no-active-credential` does not distinguish sub-cases.** Whether there is no record for this `(principal_ref, credential_type)` pair, or whether all records are terminal, the `verify` result is the same: `failed-verification(no-active-credential)`. Distinguishing between "never registered" and "was revoked" at the `verify` surface leaks state to callers who should not know the reason a credential is unavailable. Composing patterns that need to distinguish these cases (e.g., an administrative surface) may query the credential store directly.

### Feedback

Each successful action produces an observable, measurable change:

- After `register` — a new credential record appears in `Active` status with a fresh `credential_id`, `principal_ref`, `credential_type`, `registered_at`, and (if specified) `expires_at`. Total record count increases by one.
- After `verify` — no state change. Returns `verified` or `failed-verification(reason)`.
- After `rotate` — two observable changes: a new credential record appears in `Active` status with a fresh `credential_id`; the prior record's `status` transitions to `Rotated` with `rotated_at` and `successor_credential_id` set.
- After `revoke` — the target credential record's `status` transitions to `Revoked` with `revoked_at`, `revoked_by_ref`, and `revocation_reason` set.

Rejected actions produce named rejection codes observable to the caller: `invalid-request`, `duplicate-active-credential`, `storage-failure`, `not-active`, `not-known`, `already-terminal`. `verify`'s two failure outcomes (`material-mismatch`, `no-active-credential`) are first-class results, not rejections — they are the normal vocabulary of a verification query that did not succeed.

The credential store is queryable. Per-record fields (credential_id, principal_ref, credential_type, status, registered_at, expires_at, rotated_at, successor_credential_id, revoked_at, revoked_by_ref, revocation_reason) are observable to authorized administrative surfaces. The stored verifier is not exposed.

### Invariants

The following invariants constitute the verification surface of the pattern:

**Invariant 1 — Registration immutability.** Once a credential record is created, `principal_ref`, `credential_type`, `verifier`, `credential_type`, and `registered_at` never change. The only mutable field after registration is `status` (and its associated timestamp fields set when a terminal transition fires).

**Invariant 2 — Active uniqueness.** At most one credential record per `(principal_ref, credential_type)` pair is in `Active` status at any time. The `rotate` action's atomicity guarantee (new record Active, prior record Rotated, both committed together) is the mechanism that maintains this invariant under concurrent operations.

**Invariant 3 — Sole-holder verification.** `verify(principal_ref, credential_type, presented_material)` returns `verified` only when `presented_material` was derived from the same original material registered at `register` for this `(principal_ref, credential_type)` pair. A presented material that does not match never produces `verified`, regardless of the caller's identity.

**Invariant 4 — Revocation absorbing.** Once a credential record's status is `Revoked`, no subsequent `verify` call for the same `(principal_ref, credential_type)` pair returns `verified` via that record. Because at most one `Active` record exists per pair (Invariant 2), revocation of the Active record means no `verified` result is possible until a new credential is registered.

**Invariant 5 — Terminal state absorbing.** A credential in any terminal state (`Rotated`, `Revoked`, `Expired`) admits no further state transitions. `rotate` on a non-Active credential returns `not-active`; `revoke` on a terminal credential returns `already-terminal`.

**Invariant 6 — Rotation non-mutation.** `rotate(credential_id, ...)` never modifies the `verifier`, `principal_ref`, `credential_type`, or `registered_at` of the prior credential record. It creates a new record and writes `status = Rotated`, `rotated_at = now`, and `successor_credential_id = new_credential_id` to the prior record — and nothing else.

**Invariant 7 — Rotation chain integrity.** Every credential record in `Rotated` status has a non-null `successor_credential_id` that references another credential record with the same `principal_ref` and `credential_type`. The chain from any `Rotated` record to its eventual `Active` (or further-terminal) successor is reconstructable from the record store alone.

**Invariant 8 — Credential material never persisted.** No credential record, log entry, or observable output of the atom contains the raw credential material supplied to `register` or the presented material supplied to `verify`. The stored `verifier` is an artifact derived from the raw material via a one-way function; recovery of the raw material from the verifier is computationally infeasible under the deployment's chosen derivation function.

**Invariant 9 — Revocation attribution completeness.** Every credential record in `Revoked` status has non-null `revoked_at`, `revoked_by_ref`, and `revocation_reason`. A revocation record without all three fields present is evidence of a process violation; the atom's `revoke` action enforces the non-null constraint at call time.

**Invariant 10 — Credential durability.** Once `register` returns a `credential_id`, the credential record is durably persisted. A `storage-failure` rejection guarantees no partial record was written. The record count is monotonically non-decreasing; the atom provides no deletion surface. Cascading deletion under a retention policy is the composing application's responsibility, not the atom's.

Invariants 2 and 3 together give the *authentication integrity* property — a principal's `verify` call is answered by exactly the credential they registered, and only them. Invariants 4 and 5 give the *terminal finality* property — the system cannot be tricked into verifying against a revoked or rotated credential via race conditions or state-reversion. Invariants 6 and 7 give the *rotation auditability* property — the full history of how a principal's credential evolved over time is reconstructable without consulting source code or runbooks.

---

## Examples

### Password authentication — registration and verification

A user creates an account in a financial application. The application calls `register(principal_ref: user_u91, credential_material: <raw-password>, credential_type: "password") → credential_id: cred_c01`. The atom derives the salted hash (the verifier) from the raw password and discards the raw password. The record is `Active`.

Two hours later, the user logs in. The application calls `verify(principal_ref: user_u91, credential_type: "password", presented_material: <presented-password>) → verified`. The atom finds the one `Active` password credential for user_u91, derives the hash of the presented password, and compares it to the stored verifier. Match confirmed; `verified` is returned. No state changes.

### Public-key authentication — rotation

A developer's SSH public key is registered: `register(principal_ref: dev_d44, credential_material: <public-key-bytes>, credential_type: "ssh-public-key") → credential_id: cred_c12`. The verifier is the canonical encoding of the public key.

Six months later, the organization's key-rotation policy triggers. The developer generates a new key pair and calls `rotate(credential_id: cred_c12, new_credential_material: <new-public-key-bytes>) → new_credential_id: cred_c13`. The atom creates `cred_c13` in `Active` with the new verifier, and writes `status = Rotated`, `rotated_at = 2026-11-15T09:00:00Z`, `successor_credential_id = cred_c13` to `cred_c12`. `cred_c12` is now immutably in `Rotated` status. Future `verify` calls for `(dev_d44, "ssh-public-key")` resolve against `cred_c13`.

### Rejection paths

**`register` — `duplicate-active-credential`:** An administrator attempts to register a second TOTP secret for a principal that already has one: `register(principal_ref: user_u91, credential_material: <totp-seed>, credential_type: "totp") → rejected(duplicate-active-credential)`. The atom finds the existing `Active` TOTP credential for user_u91 and rejects the call. To replace it, the caller must `rotate` the existing credential.

**`verify` — `failed-verification(material-mismatch)`:** A user enters an incorrect password. `verify(principal_ref: user_u91, credential_type: "password", presented_material: <wrong-password>) → failed-verification(material-mismatch)`. The atom finds the `Active` password credential, derives the hash of the presented password, and finds it does not match the stored verifier. The credential record is unchanged. The composing Login pattern increments its failed-attempt counter (the atom does not track this) and decides whether to lock the account.

**`verify` — `failed-verification(no-active-credential)`:** An administrator revokes a user's API token: `revoke(credential_id: cred_c08, revoked_by_ref: admin_a01, reason: "suspected-compromise") → revoked`. Subsequently, the API client attempts a request with the revoked token: `verify(principal_ref: user_u91, credential_type: "api-token", presented_material: <token>) → failed-verification(no-active-credential)`. The atom finds no `Active` credential for this pair — the only record is in `Revoked` status — and returns the failure without distinguishing the specific terminal state.

**`rotate` — `not-active`:** An incident-response process attempts to rotate a credential that was already revoked: `rotate(credential_id: cred_c08, new_credential_material: <new-token>) → rejected(not-active)`. The atom finds that `cred_c08` is `Revoked` and rejects the rotation. To issue a new credential for this principal, the caller must use `register`.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A PCI DSS auditor asks *"was the service account's API credential rotated within the 90-day policy window?"* The auditor queries the credential store for all records with `principal_ref: svc_account_s03` and `credential_type: "api-token"`, ordered by `registered_at`. Each `Rotated` record carries `rotated_at` and `successor_credential_id`. The auditor walks the chain: `cred_c02 → Rotated at 2026-02-01 → cred_c07 → Rotated at 2026-04-28 → cred_c11 (Active, registered_at: 2026-04-28)`. The gap between each `registered_at` and the predecessor's `rotated_at` is within 90 days. Invariant 7 (rotation chain integrity) is the structural guarantee that the chain is complete — no rotation event is omitted from the record.

**Disputed transaction.** A user claims *"I did not log in from that IP address at 2026-08-14T03:22Z."* The investigator queries the composing Login pattern's records (which are a separate concern) for the session established at that time, identifying the `credential_id` used. The credential record shows: `credential_id: cred_c01`, `principal_ref: user_u91`, `credential_type: "password"`, `status: Active` (at the time of the login), `registered_at: 2026-01-10`. The investigator confirms the credential was `Active` at the time and has not been retroactively revoked. Invariant 3 (sole-holder verification) is the structural rebuttal: if `verified` was returned at 2026-08-14T03:22Z, the presented material matched the verifier registered for user_u91's password credential — the only explanation is that the raw password was known to the caller. Whether that caller was the legitimate user or an attacker with a compromised password is a separate investigation; the atom's records bound the forensic window.

**Breach or incident investigation.** An incident-response team discovers that a batch of API tokens for a service account may have been exposed in a log file. The investigator queries all credential records for `principal_ref: svc_account_s03` and `credential_type: "api-token"`. The records show: `cred_c02` (`Active`, registered 2026-01-01, no expiry), `cred_c07` not found — no rotation or revocation was performed before the exposure. The investigator notes the window of potential unauthorized use. The response team calls `revoke(credential_id: cred_c02, revoked_by_ref: admin_a01, reason: "log-exposure-2026-09-12")`. The revocation record is immutable: `revoked_at: 2026-09-12T11:40:00Z`, `revoked_by_ref: admin_a01`, `revocation_reason: "log-exposure-2026-09-12"`. Invariant 9 (revocation attribution completeness) ensures that a future auditor reading only the record store can reconstruct exactly when the credential was revoked, by whom, and why.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Identity proofing.** Establishing that a `principal_ref` corresponds to a real, identified person or organization — verifying a government ID, confirming a phone number, checking against a sanctions list — belongs to Party Identity and the KYC/Customer Onboarding composition (C8). Credential takes `principal_ref` as opaque; it does not know or care who or what the principal is. A principal with a registered credential is not thereby a verified identity.
- **Multi-factor orchestration.** Sequencing two or more credential checks (password then TOTP code; hardware key then PIN) is a composing-pattern concern. This atom verifies one credential at a time. The Login composition (C13) is where multi-factor sequencing is expressed.
- **Session management.** A `verified` result is a momentary signal, not a persistent state. Persisting the result of a successful verification into a time-bounded session is Session's surface (atom #12). The atom does not know about sessions.
- **Failed-attempt tracking and lockout.** The atom does not count failed `verify` calls, implement exponential backoff, or lock credentials after N failures. These are composing-pattern concerns. The composing Login pattern (or its deployment configuration) owns the lockout policy.
- **Authorization.** What a verified principal is permitted to do is Permissions' surface. Credential answers *"is this the right principal?"*; Permissions answers *"is this principal allowed to do this?"*.
- **Credential recovery.** Account recovery flows (reset via email, backup codes, recovery keys) are composing-pattern concerns. The recovery mechanism produces a new `credential_material` that the caller then `rotate`s in; the atom sees only the rotate call.
- **Credential sharing and delegation.** A credential is bound to exactly one `principal_ref`. The atom has no model for credentials shared between principals or delegated to an agent on behalf of a principal. Capability (atom #13) is the library's model for bearer-token delegation where the holder's identity is intentionally irrelevant.
- **Credential type enumeration.** The atom does not enumerate valid credential types; that is deployment configuration. A deployment must configure the derivation function for each credential type it supports. If `credential_type` is unrecognized by the deployment's derivation function registry, `register` returns `invalid-request`.
- **Derivation function agility.** When a deployment changes its verifier derivation function (e.g., upgrading from bcrypt to argon2), existing credentials remain valid under the old function. Migrating stored verifiers to the new function is a deployment operation outside the atom's scope. The atom stores the derivation function identifier alongside the verifier (as an implementation concern); `verify` uses the stored identifier to select the correct function for comparison.
- **Clock accuracy.** `registered_at`, `rotated_at`, `revoked_at`, and `expires_at` are captured from the deployment's clock. Whether that clock is honest, monotonic, or synchronized is a deployment concern. Trusted timestamping (RFC 3161) is a composing pattern that supplies a verifiable time-anchor.
- **Credential store tamper-evidence.** The atom assumes the credential store has not been rewritten by an adversary with write access. Cryptographic chaining and external anchoring belong to Tamper Evidence. The atom composes naturally with Tamper Evidence for high-assurance deployments.
- **Compromise disclosure.** A credential later determined to have been compromised before revocation does not cause the atom to retroactively change any record. The records remain as written. Reinterpretation of authentication events during the compromise window belongs to a Compromise Disclosure composing pattern, which produces new records that reframe the prior `verified` results as untrustworthy. The credential store remains immutable; the meaning of its records changes via composition, not via mutation.
- **Biometric binding.** Where credential_material is a biometric template, the atom stores the template's processed verifier. Whether biometric templates constitute personal data under GDPR or HIPAA (and thus require special-category handling) is a deployment concern outside the atom's scope. The atom's `credential_material`-is-never-persisted invariant does not relieve a deployment of its special-category obligations if the derived verifier is itself biometric data.

---

## Composition notes

Credential is freestanding. It is named by Login (C13) and External Onboarding (C16) as a constituent atom. It also composes naturally with the regulatory stack:

- **[Actor Identity](./actor-identity.md)** — `revoke` records `revoked_by_ref`, an opaque reference to the revoking actor. In regulated deployments, the Login composition's successful `verify` will typically be followed by an Actor Identity `attest` call to produce a non-repudiable record that the principal authenticated. The two atoms are distinct: Credential answers *"did the right material arrive?"*; Actor Identity answers *"who authorized this action and can you prove it?"*
- **[Permissions](./permissions.md)** — composing patterns combine Credential verification with Permissions checks. Session-Gated Authorization (C14) gates every Permissions query on Session validity; the upstream `verify` is Credential's surface.
- **[Party Identity](./party-identity.md)** — Party Identity is the persistent verifiable identity of an external party. Credential is the authentication mechanism that principal binds to their Party Identity record. External Onboarding (C16) is the composition that wires them: an Invitation is accepted, a Party Identity is created, a Credential is registered.
- **[Tamper Evidence](./tamper-evidence.md)** — for regulated deployments, the credential store (including the rotation and revocation history) should be hash-chained and externally anchored so that any rewrite of credential records is detectable from the records alone.
- **[Audit Trail](../../compositions/audit-trail.md)** — in regulated deployments, every `register`, `rotate`, and `revoke` call should be recorded in the Audit Trail. The atom itself does not mandate this; it is a composing-pattern obligation. Login (C13) is where the audit-recording wiring lives.
- **Authentication** *(this is Credential — the `Authentication *(forthcoming)*` debt in [`atoms/compliance/actor-identity.md`](./actor-identity.md) is retired by this atom)* — see Composition notes in Actor Identity.
- **Session** *(atom #12 — not started)* — Session records the result of a successful `verify`. Login (C13) is the composition that wires `verify → verified` to `Session.issue`.
- **Login** *(C13 — not started)* — wires Credential verification to Session issuance, both attested under the verified principal. Carries the cascade invariant: revocation of a Credential invalidates every Session derived from it.
- **External Onboarding** *(C16 — not started)* — credential registration is the final step of the onboarding arc: Invitation accepted → Party Identity created → Credential registered → all steps attested.
- **Compromise Disclosure** *(forthcoming)* — handles retroactive reinterpretation of `verified` results for credentials that were active during a compromise window, without mutating the credential store.

---

## Standards references

- **NIST SP 800-63B (Digital Identity Guidelines — Authentication and Lifecycle Management)** — the primary technical standard for credential management. Authenticator Assurance Levels (AAL 1/2/3), verifier requirements (stored verifiers, not raw secrets), rotation and revocation requirements, and session lifecycle all correspond directly to this atom's behavioral commitments. The atom is mechanism-neutral within the 800-63B envelope — it does not mandate a specific authenticator type. Identity proofing (NIST 800-63A) is explicitly *not* cited here; that belongs to Party Identity.
- **FIDO2 / WebAuthn (W3C Web Authentication Level 2)** — the Web Authentication standard for phishing-resistant hardware authenticators. The atom's `credential_type: "fido2"` case corresponds to WebAuthn's authenticator binding: `credential_material` is the attestation object; the `verifier` is the public key extracted from it; `verify` checks a presented authentication assertion against the stored public key.
- **RFC 7519 (JSON Web Token)** — JWT is a common encoding for API tokens. The atom's `credential_type: "api-token"` case can store a token hash (the verifier) derived from the raw JWT; `verify` hashes the presented JWT and compares. The atom does not interpret JWT claims — that is a composing-pattern concern.
- **OpenID Connect Core 1.0** — the OpenID Connect login flow produces a credential verification event that this atom models. The Login composition (C13) is the Grace Commons expression of the OIDC authorization code flow.
- **PCI DSS Requirement 8 (Identify and Authenticate Access to System Components)** — password complexity, rotation frequency, and account lockout requirements for payment-system credentials. The atom's invariants satisfy the structural requirements (unique active credential per account, rotation produces new record, revocation is recorded); the PCI DSS configuration knobs (rotation period, complexity rules, lockout threshold) are deployment-configurable.
- **ISO/IEC 27001 §A.9.4 (System and Application Access Control)** — access control for system and application authentication. The atom's registration, rotation, and revocation lifecycle corresponds to the credential management controls in §A.9.4.
- **GDPR Article 32 (Security of Processing)** — the atom's `credential_material`-is-never-persisted invariant (Invariant 8) and the one-way verifier storage discipline contribute to the "appropriate technical measures" Article 32 requires. Deployments storing biometric verifiers should assess Article 9 (special category data) obligations separately.
- **HIPAA §164.312(d) (Person or Entity Authentication)** — verification that a person or entity seeking access to electronic protected health information is the one claimed. The atom's `verified` result is the structural mechanism for this requirement.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing identity proofing, session management, authorization, and multi-factor orchestration as separate atoms rather than absorbing them here.
- **NIST 800-132 (Recommendation for Password-Based Key Derivation)** — the derivation function guidance the `verifier` storage discipline is built on. The atom mandates one-way derivation; 800-132 is the reference for which derivation functions satisfy that property.

---

## Generation acceptance

A derived implementation of Credential is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the credential record store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Verify active uniqueness.** For any `(principal_ref, credential_type)` pair, confirm that at most one record has `status = Active`. A pair with two `Active` records is a violation of Invariant 2 and evidence of an implementation defect.
- **Walk any rotation chain to completion.** Starting from any `Rotated` credential record, follow `successor_credential_id` links to the end of the chain. Confirm that every link resolves to a record with the same `principal_ref` and `credential_type`, and that the chain terminates in either an `Active` record or a further terminal state (if the successor was itself later revoked or rotated). Invariant 7 is the structural guarantee; a broken link — a `successor_credential_id` that references a non-existent `credential_id` — is evidence of an implementation defect.
- **Confirm revocation attribution completeness.** For every record with `status = Revoked`, confirm that `revoked_at`, `revoked_by_ref`, and `revocation_reason` are all non-null. A `Revoked` record missing any of these fields is a violation of Invariant 9 and evidence of a process violation. Determine who revoked each credential and the stated reason, without consulting any external system.
- **Confirm no raw credential material is present.** Inspect all fields of all records and confirm that no field contains raw credential material (no plaintext passwords, no private keys, no unprocessed TOTP secrets). The `verifier` field should contain a hash, encoded public key, or other one-way artifact. Confirm that the `verifier` field is absent from any observable API output. This is the behavioral commitment of Invariant 8; a record store that fails this check has violated the foundational security contract of the atom.
- **Reconstruct the credential lifecycle for any principal.** Given a `principal_ref` and `credential_type`, query all records for that pair ordered by `registered_at`. The records should tell the complete story: initial registration, each rotation with timestamp and successor link, and (if applicable) the revocation record. No gap in the chain should be unexplained. Invariant 10 (credential durability) is the guarantee that no record was deleted between registration and the audit.
- **Confirm terminal state finality.** For any record in a terminal state (`Rotated`, `Revoked`, `Expired`), confirm that no subsequent record for the same `credential_id` exists showing a non-terminal status. Terminal records are absorbing; a record store showing a transition from `Revoked` back to `Active` is evidence of an implementation defect.

This is the generator's contract: any implementation derived from this atom must produce a credential store that passes all six checks above. The bar is the regulator's question — *"can you prove this credential was managed with integrity throughout its lifecycle?"* — not the developer's intuition.

---

## Status

`draft` — first draft. All required structural elements present: identity model, action signatures with fully-named rejection and outcome reasons, state machine (Active → Rotated | Revoked | Expired), ten invariants, four examples (two happy path, two rejection path), three regulated adversarial scenarios, six-check Generation acceptance. Awaiting three-pass pressure testing.

*Provisional placement note: this atom is filed in `atoms/compliance/` as the initial home for authentication and credential-management infrastructure. Credential is not pure compliance infrastructure (it has meaningful non-regulated applications wherever authentication is required). A future taxonomy refactor may relocate it to `atoms/security/` or `atoms/identity/`, carrying `regulated: true` as a frontmatter attribute. See the Open taxonomy question in ROADMAP.md and Methodology debt #5.*

---

## Lineage notes

First draft. No pressure-testing passes have run. Sections will be populated as passes complete.

**Conventions inherited.** This atom is a regulated atom (provisional `atoms/compliance/` placement) and carries *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

**Structural decisions made in draft.**

- *`verify` signature.* Takes `(principal_ref, credential_type, presented_material)` rather than `(credential_id, presented_material)`. Rationale: the natural call pattern from a Login composition is principal-scoped, not credential-id-scoped. The Login composition knows the principal's identity claim; it does not need to pre-resolve the active credential_id. The atom handles the lookup of the active credential for the `(principal_ref, credential_type)` pair internally.
- *`no-active-credential` does not distinguish sub-cases.* `verify` returns `failed-verification(no-active-credential)` whether no credential was ever registered or all credentials are terminal. Collapsing the sub-cases prevents enumeration attacks (knowing that a principal has credentials but all are revoked leaks state a caller should not have). Composing patterns with administrative needs may query the store directly.
- *Uniqueness per `(principal_ref, credential_type)`, not per `principal_ref`.* A principal may have one active password AND one active hardware key; they are different types. But two active passwords for the same principal is a violation. This is the correct granularity for real authentication systems.
- *`revoked_by_ref` and `reason` are mandatory on `revoke`.* A revocation without attribution and stated reason is a compliance finding, not a valid record. Making them mandatory at the action boundary prevents partial revocation records from entering the store.

**Forthcoming-link resolution.** This atom retires the `Authentication *(forthcoming)*` debt in [`atoms/compliance/actor-identity.md`](./actor-identity.md). That atom's Composition notes read: *"Authentication *(forthcoming)* — produces the credential the atom consumes."* With Credential grounded, that link resolves. The update to actor-identity.md's Composition notes is a separate task.
