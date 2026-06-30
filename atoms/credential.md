---
title: Credential
parent: Atomic Concepts
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


## Summary

Credential answers the question "does this presented material belong to this principal, for this kind of credential?" — where a principal is whatever entity is being authenticated (a user, a service account, a system actor). It works through credential records that bind a principal to a verifier: a stored artifact derived from the secret material (a hashed password, a public key) that lets the system check a later presentation without ever keeping the original secret. The raw secret is used at registration and at each check, then discarded — only the verifier persists. Each record is [Active] (the one live stored state) or in one of two permanent stored end states: [Rotated] (replaced by a newer credential) or [Revoked] (deliberately cancelled, with who/when/why recorded). A credential also *expires* — but expiry is not a stored state. When the deadline (`expires_at`) passes, a still-[Active] record is simply *shown* as [Expired]. That status is worked out on the fly at read time by comparing the clock to the deadline; it is never written into the record and never the result of a transition. A principal can have only one *effective-Active* credential of a given type at a time, where effective-Active means stored [Active] and not yet past its deadline. A stored-Active-but-lapsed credential no longer occupies that slot, so a fresh registration is permitted. Rotation is handled cleanly: the new credential is registered as a fresh record and the old one is moved to [Rotated] with a link to its successor, so the whole chain of replacements is auditable. This is the mechanism behind password login, public-key authentication, one-time codes, API tokens, and hardware security keys. It deliberately does not handle proving who the principal is in the first place, sequencing multiple factors, keeping someone logged in, or deciding what they are allowed to do — each is a separate pattern.

---

## Intent

Authenticated systems require that an actor prove their identity before taking actions of consequence — withdrawing funds, prescribing medication, signing a contract, provisioning a new user, accessing a protected record. The proof mechanism is a credential: something the actor knows (a memorized secret), something the actor has (a hardware token, a smart card), or something the actor is (a biometric bound to a signing key). What is constant across all three classes is the *binding* — the association between a specific principal and specific credential material, established at registration time and queryable at verification time.

The pattern isolates that binding from the surrounding machinery. Credential does not implement login flows, session management, identity proofing, multi-factor orchestration, or authorization decisions. It answers one structural question: *given this principal and this credential type, does the presented material match what was registered?* The answer is binary — `verified` or a named reason for failure — and the question is answerable from stored records alone without consulting the system's runtime state or the calling actor's testimony.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the credential record and its status), its own actions (`register`, `verify`, `rotate`, `revoke`), and its own operational principles (verifiers are stored, not raw material; rotation produces a new record; revocation is absorbing). It does not implement the identity proofing that establishes *who a principal is* before they can register a credential — that is Party Identity's surface. It does not implement the session that persists the result of a successful verification — that is Session's surface. It does not implement the permission check that gates what an authenticated principal may do — that is Permissions' surface. Each is a separate composable atom; see Composition notes.

---

## Structure

### Identity model

Every credential known to the system has a **[Credential Id]** — an opaque, immutable, system-generated identifier produced by [Register]. The id is the credential's identity; [Principal Ref], [Credential Type], [Verifier], [Status], [Registered At], and [Expires At] are immutable properties of the record, set on [Register] and never changed. (Status is the one field that transitions, but transitions are always to **stored** terminal states — [Rotated] or [Revoked] — and once a credential leaves [Active], it never returns. [Expired] is **not** a value of [Status]: it is derived at read time, never written; see State.) [Expires At] is set once at [Register] and is the sole stored input the expiry derivation needs thereafter — there is no stored [Expired] flag to keep consistent with it.

Two credential records for the same principal of the same type have different ids — one is a rotation successor, the other the rotated predecessor. The link from predecessor to successor is carried by [Successor Credential Id] on the predecessor record. Ids are not reused.

The opaque-id model matters here for the same reason it matters in other atoms: identifying a credential by `(principal_ref, credential_type)` would conflate the rotation history into a single mutable record, losing the auditability the library's invariants require. Separate records with separate ids preserve the one-credential-one-record discipline that makes rotation-chain reconstruction tractable.

### Inputs and Outputs

**Actions:** The current clock reading [Now] (the pipeline's `clock_t`) is **not** an action parameter. It is injected by the pipeline at the I/O seam — supplied to the contract, not passed by the caller and not read inside any transition — and the contract makes it available to the action's pure guards and to its write-time timestamp stamps. [Now] is consumed for two clearly separated purposes: stamping immutable timestamps on a write (execution time), and evaluating the pure expiry/effective-Active derivation in a guard (no write). Because it arrives at the seam rather than through the signature, it does not appear in the action parameter lists below. See the Logic-confinement note in Decision points.

- [Register] — (Projected contract: `register(principal_ref, credential_material, credential_type, expires_at?) → credential_id | rejected(invalid-request | duplicate-active-credential | storage-failure)`)
- [Verify] — (Projected contract: `verify(principal_ref, credential_type, presented_material) → verified | failed-verification(material-mismatch | no-active-credential)`)
- [Rotate] — (Projected contract: `rotate(credential_id, new_credential_material) → new_credential_id | rejected(not-active | not-known | invalid-request | storage-failure)`)
- [Revoke] — (Projected contract: `revoke(credential_id, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-terminal | not-known | storage-failure)`)

There is **no `expire` action**. A lapsed credential needs no write to be shown [Expired]; expiry is surfaced by the read projection below. The `no-active-credential` failure on [Verify] covers the lapsed case by derivation — no write fires.

**Inputs:**

- [Principal Ref] — an opaque reference to the principal whose credential is being managed. The atom treats this as opaque; it does not validate that the principal exists in any registry. That is the caller's responsibility.
- [Credential Material] — the raw secret or token the principal provides at registration. Consumed on [Register]; never persisted. Non-null and non-empty required; minimum entropy and format constraints are deployment-configurable.
- [Credential Type] — a caller-supplied label identifying the kind of credential (e.g., `password`, `totp-secret`, `public-key`, `api-token`). Opaque to the atom; used only to enforce the one-active-per-`(principal_ref, credential_type)` uniqueness rule and to select the correct verifier derivation function.
- [Expires At] — an optional timestamp (supplied to [Register]) specifying when the credential expires. Null means no expiry; the credential remains effective-Active until explicitly rotated or revoked. If supplied, must be a future timestamp relative to the injected [Now] at the time of the [Register] call; a past or present value ([Expires At] <= [Now]) is rejected as [Invalid Request]. If omitted, the deployment policy determines the default (no expiry or a configured default window). Immutable once set. It is the sole stored input to the expiry derivation — there is no separate stored [Expired] flag.
- [Presented Material] — the raw secret or token the principal presents at verification time. Consumed on [Verify]; never persisted.
- [Credential Id] — references a specific credential record. Used by [Rotate] and [Revoke].
- [Revoked By Ref] — an opaque reference to the actor performing the revocation. Recorded on the revoked credential. Non-null and non-empty required.
- [Reason] — a caller-supplied reason string for the revocation. Recorded on the revoked credential. Non-null and non-empty required.
- [Now] — the injected clock reading (`clock_t`). It is **not** an action parameter and **not** caller-trusted: the pipeline reads it once and injects it at the I/O seam, where the contract makes it available to the action without threading it through the signature, and it is **not** read inside any transition. It is used only to stamp immutable write timestamps (execution time — [Registered At], [Rotated At], [Revoked At]) and to evaluate the pure expiry/effective-Active derivation in a guard and in the [Effective Status] projection (no write).

**String input policy (applies to every string input above).** Values are treated byte-exact: no trimming, no Unicode normalization, no case folding is applied before storage or comparison. This matters most for the `(principal_ref, credential_type)` uniqueness key (Invariant 2): equality is byte-for-byte, so `"password"`, `"Password"`, and `"password "` are three distinct credential types to this atom — which is why [Credential Type] values should come from the deployment's declared derivation-function registry (see Decision points at [Register]) rather than free-form caller input; a value naming no registered derivation function is rejected, which forecloses accidental near-duplicate types. A whitespace-only string counts as empty and is rejected wherever non-empty is required. The deployment sets a maximum length per string input; a value exceeding it is rejected as [Invalid Request]. ([Credential Material] and [Presented Material] are exempt from the length cap only insofar as the deployment's derivation function defines its own input bounds.)

**Read surface (render time):**

- [Read] — (Projected contract: `read(filter) → records`) — each returned record carries its stored fields plus a derived **[Effective Status]**: [Expired] when [Status] = [Active] ∧ [Now] ≥ [Expires At] (and [Expires At] is non-null), otherwise the stored [Status]. [Effective Status] is a pure projection over the record and the injected [Now] (supplied at the read seam, not a [Read] parameter); it is never stored.

**Outputs:**

- The current set of credential records. For each: [Credential Id], [Principal Ref], [Credential Type], [Status] (the **stored** status: [Active], [Rotated], or [Revoked]), [Registered At], [Expires At] (nullable), [Rotated At] (nullable), [Successor Credential Id] (nullable), [Revoked At] (nullable), [Revoked By Ref] (nullable), [Revocation Reason] (nullable), and the derived [Effective Status] (the stored [Status], except [Expired] when [Status] = [Active] ∧ [Expires At] is non-null ∧ [Now] ≥ [Expires At]). The stored [Verifier] is not exposed in outputs — it is an internal artifact. There is **no `expired_at` field**: expiry is derived at read time, never written.
- [Register] returns a new [Credential Id] on success, or a rejection naming the failed precondition.
- [Verify] returns `verified` or `failed-verification(reason)`. No state change. A credential whose window has lapsed ([Now] ≥ [Expires At]) yields `failed-verification(no-active-credential)` by derivation — no write.
- [Rotate] returns the new [Credential Id] on success, or a rejection. A lapsed credential is treated as no longer effective-Active: [Rotate] returns [Not Active] by derivation, writing nothing.
- [Revoke] returns `revoked` on success, or a rejection. A lapsed credential is treated as no longer effective-Active: [Revoke] returns [Already Terminal] by derivation, writing nothing.

### State

Each credential record carries a stored [Status] field. The state machine has one non-terminal stored state and two **stored** terminal states; [Expired] is a third status that is **derived, never stored**:

- **[Active]** — the credential is stored-Active and, while [Now] < [Expires At], can be used for verification. This is the only non-terminal stored state.
- **[Rotated]** — a successor credential has been registered for this `(principal_ref, credential_type)` pair. This credential can no longer be used for verification. Stored terminal.
- **[Revoked]** — explicitly revoked. This credential can no longer be used for verification. Stored terminal.
- **[Expired]** *(derived — never stored)* — a still-[Active] record whose window has lapsed ([Expires At] is non-null ∧ [Now] ≥ [Expires At]). Computed at read time by the [Effective Status] projection from the immutable [Expires At] and the injected clock; no transition fires and no field is written when a credential lapses.

**Effective-Active.** Because expiry is derived, the operative notion for both the uniqueness rule and verification is *effective-Active*: a record is **effective-Active** ⟺ stored [Status] = [Active] **and** ([Expires At] is null **or** [Now] < [Expires At]). A stored-[Active]-but-lapsed record is **not** effective-Active — it reads [Expired] and does not occupy the Active slot. This is the load-bearing subtlety of this atom's render-time form: every guard that asks "is there an Active credential?" means *effective-Active*, evaluated against the injected [Now] (see Decision points).

Transitions (every transition is a **write**; every write below stamps its timestamp from the injected [Now]; no transition reads the clock internally). Expiry is listed for contrast: it is *not* a transition and writes nothing.

| action | from | to | guard (against injected [Now]) | stamps (writes) | result |
| --- | --- | --- | --- | --- | --- |
| [Register] | *(no record)* | **[Active]** | no effective-Active credential for the pair ∧ ([Expires At] null ∨ [Expires At] > [Now]) | fresh [Credential Id]; [Principal Ref]; [Credential Type]; [Verifier]; [Expires At]; [Registered At] = [Now] | the new [Credential Id] |
| [Rotate] | [Active] *(effective-Active)* | prior → **[Rotated]**, new → **[Active]** | prior effective-Active ([Status] = [Active] ∧ [Now] < [Expires At]) | on prior: [Rotated At] = [Now], [Successor Credential Id]; on new: fresh [Credential Id], [Registered At] = [Now] | the new [Credential Id] |
| [Revoke] | [Active] *(effective-Active)* | **[Revoked]** | effective-Active | [Revoked At] = [Now]; [Revoked By Ref]; [Revocation Reason] | `revoked` |
| *expiry (derived — not a transition)* | [Active] | *[Active]* (unchanged) | [Expires At] non-null ∧ [Now] ≥ [Expires At] | **nothing written** | *shown* [Expired] |

The transitions in detail, with the precedence, atomicity, and writes-nothing semantics that the table abbreviates:

- `register(principal_ref, credential_material, credential_type, expires_at?)` → a new record is created in [Active] with a fresh [Credential Id], the supplied [Principal Ref], [Credential Type], and [Expires At] (or the deployment-policy default if not supplied), the derived [Verifier], and [Registered At] = [Now] (the injected [Now]). Returns [Credential Id]. (The uniqueness guard reads the injected [Now]: registration is permitted only when no *effective-Active* credential exists for the pair.)
- `rotate(credential_id, new_credential_material)` → permitted only when the referenced credential is *effective-Active* (stored [Active] ∧ [Now] < [Expires At], against the injected [Now]). Atomically: (1) a new record is created in [Active] for the same `(principal_ref, credential_type)` pair, with a fresh [Credential Id] and [Registered At] = [Now]; (2) the prior record's [Status] transitions from [Active] to [Rotated], and [Rotated At] = [Now] and [Successor Credential Id] = `new_credential_id` are recorded on the prior record. The prior record's other fields are never changed.
- `revoke(credential_id, revoked_by_ref, reason)` → permitted only when the referenced credential is *effective-Active*; the record's [Status] transitions from [Active] to [Revoked]; [Revoked At] = [Now] (the injected [Now]), [Revoked By Ref], and [Revocation Reason] are recorded. No other fields change.
- **Expiry is not a transition.** When [Expires At] is non-null ∧ [Now] ≥ [Expires At], a still-[Active] record is *shown* [Expired] by [Read]'s [Effective Status] projection; nothing is written, no scheduler is required, and there is no `expire` action. This is the "derive the idealization, do not lag it with a stored flag" discipline — the lapsed state is computed from [Expires At] and the clock, not remembered.
- *(no transitions out of [Rotated] or [Revoked]; [Expired] is derived, so nothing transitions into or out of it.)*

Each credential record carries:

- **[Credential Id]** — opaque, immutable, system-generated. Set on [Register]. Never changes.
- **[Principal Ref]** — opaque reference to the principal. Set on [Register]. Never changes.
- **[Credential Type]** — caller-supplied type label. Set on [Register]. Never changes.
- **[Verifier]** — the processed artifact derived from [Credential Material]. Set on [Register]. Never changes. Never exposed in outputs.
- **[Status]** — the **stored** status: [Active], [Rotated], or [Revoked]. Set to [Active] on [Register]. Transitions to a stored terminal ([Rotated], [Revoked]) only via the corresponding action's **write**. Never returns to [Active] once terminal. The derived [Expired] is *not* a value of this field — it appears only in the [Effective Status] read projection.
- **[Registered At]** — wall-time when [Register] was called, stamped from the injected [Now]. Immutable.
- **[Expires At]** — optional expiry timestamp. Null means no expiry. Set on [Register] (from caller-supplied value or deployment policy). Immutable once set. The sole stored input to the expiry derivation; there is no separate stored [Expired] flag or `expired_at` timestamp.
- **[Rotated At]** — set when status transitions to [Rotated]. Null otherwise. Immutable once set.
- **[Successor Credential Id]** — the [Credential Id] of the new credential produced by [Rotate]. Null otherwise. Immutable once set.
- **[Revoked At]** — set when status transitions to [Revoked]. Null otherwise. Immutable once set.
- **[Revoked By Ref]** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **[Revocation Reason]** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Composing pattern establishes a new principal and needs to bind credential material to them.** Calls `register(principal_ref, credential_material, credential_type, expires_at?)`. The atom checks (against the injected [Now]) that no *effective-Active* credential exists for the pair, derives the [Verifier], records the credential, and returns a [Credential Id]. The composing pattern stores the [Credential Id] alongside the principal's record if needed; the atom retains the binding internally.
2. **Time passes; the principal attempts to authenticate.** The composing pattern collects the principal's identity claim ([Principal Ref]) and presented material. Calls `verify(principal_ref, credential_type, presented_material)`. The atom looks for the *effective-Active* credential for this `(principal_ref, credential_type)` pair — stored [Active] and [Now] < [Expires At] against the injected [Now]. If the only stored-[Active] record has lapsed ([Now] ≥ [Expires At]), the atom returns `failed-verification(no-active-credential)` **by derivation, writing nothing**. Otherwise it derives the [Verifier] from [Presented Material] and compares, returning `verified` or `failed-verification(reason)`.
3. **The principal rotates their credential** (e.g., a periodic password change or key rotation policy). Composing pattern calls `rotate(credential_id, new_credential_material)`. The atom confirms the referenced credential is *effective-Active*, creates a new [Active] record, transitions the prior record to [Rotated], and returns the new [Credential Id].
4. **A credential is revoked** (e.g., compromise suspected, account closure, administrative action). Composing pattern calls `revoke(credential_id, revoked_by_ref, reason)`. The atom confirms the referenced credential is *effective-Active*, records who revoked it, when, and why, and transitions the credential to [Revoked].
5. **A credential lapses (expiry, derived).** The deadline passes without rotation or revocation. No action and no write are required: a still-[Active] record now reads [Expired] via [Read]'s [Effective Status] projection ([Now] ≥ [Expires At]), and it is no longer *effective-Active*. A subsequent [Verify] returns `failed-verification(no-active-credential)`; [Rotate] returns [Not Active]; [Revoke] returns [Already Terminal] — each by derivation against the injected [Now], writing nothing. Because the lapsed record no longer occupies the Active slot, a fresh [Register] for the same `(principal_ref, credential_type)` pair is permitted (it produces a new effective-Active credential alongside the old, still-stored-[Active] lapsed record). All paths produce the same observable outcome: no further [Verify] succeeds against the lapsed credential, and neither [Rotate] nor [Revoke] proceeds against it.

### Decision points

**Logic confinement (clock and id).** The clock and the id are **injected at the I/O seam, not signature parameters**, and are never produced inside a transition. [Now] (`clock_t`) is read once by the pipeline and made available to the action *at the seam* — the contract supplies it to the action's guards and write-time stamps without threading it through the action's parameter list, exactly as the pipeline supplies the [Credential Id]'s injected `id_t`. (This is the corpus convention: `clock_t` and `id_t` are pipeline-implicit, injected by the contract at the seam, not enumerated arguments.) A guard's expiry/effective-Active test is a **pure function of the stored record and the injected [Now]** — `is_effective_active(record, now) ≜ record.status = Active ∧ (record.expires_at = null ∨ now < record.expires_at)` — and it **writes nothing**. The only clock *writes* are the immutable timestamp stamps inside a committed transition ([Registered At], [Rotated At], [Revoked At]), each set from the same injected [Now]. Expiry itself never writes; it is surfaced only by the [Effective Status] projection and by the `is_effective_active` guard. Per the Logic Confinement Principle ([`execution-contract.md`](../execution-contract.md)), the core transition never reads a wall clock internally, so each transition is a pure function of (record state, inputs, and the seam-injected [Now]).

**At `register(principal_ref, credential_material, credential_type, expires_at?)`:**
- [Principal Ref], [Credential Material], and [Credential Type] must be non-null and non-empty; otherwise [Invalid Request].
- If [Expires At] is supplied, it must be strictly future relative to the injected [Now] ([Expires At] > [Now]); a past or present value is [Invalid Request].
- **Effective-Active uniqueness guard (reads [Now]).** The atom checks for an existing *effective-Active* credential for `(principal_ref, credential_type)` — a stored-[Active] record with [Expires At] = null or [Now] < [Expires At]. If one exists, [Duplicate Active Credential] — the caller must [Rotate] the existing credential rather than registering a new one. A stored-[Active]-but-lapsed record ([Now] ≥ [Expires At]) is **not** effective-Active and does **not** block registration: it reads [Expired] and no longer occupies the Active slot, so the new registration produces the single effective-Active credential while the lapsed record remains stored unchanged. This is the load-bearing subtlety of the render-time form — the uniqueness rule is evaluated against the derivation, not the bare stored flag.
- [Credential Type] must name a derivation function in the deployment's registry; an unrecognized type is rejected as [Invalid Request] (a caller-configuration error, structurally distinct from [Storage Failure] — no store interaction has occurred).
- The [Verifier] is derived from [Credential Material] using the derivation function registered for this [Credential Type]. The derivation function is deployment-configured (see Configuration in Composition logic of composing patterns); the atom does not mandate a specific cryptographic mechanism beyond the one-way constraint. Raw material is consumed and discarded after derivation.
- If the store write fails after verifier derivation, [Storage Failure] is returned with no partial record in the store.

**At `verify(principal_ref, credential_type, presented_material)`:**
- The atom finds the *effective-Active* credential for `(principal_ref, credential_type)`. If none exists — because no credential was ever registered, or every stored-[Active] record for this pair has lapsed ([Now] ≥ [Expires At]), or all records are stored terminal ([Rotated]/[Revoked]) — `failed-verification(no-active-credential)`. This result does not distinguish between "never registered," "was rotated/revoked," and "lapsed (reads [Expired])," preventing enumeration of the reason no effective-Active credential exists.
- **Expiry check (derived, no write).** Before any verifier comparison, the atom evaluates `is_effective_active(record, now)` against the injected [Now]. If the only stored-[Active] record for the pair has [Expires At] non-null and [Now] ≥ [Expires At], it is **not** effective-Active: `failed-verification(no-active-credential)` is returned **and nothing is written** — no record transitions, there is no `expired_at` field to stamp, and there is no `expire` action. (A reader sees [Effective Status] = [Expired].) This is the load-bearing ordering: the derivation is evaluated *first*, so no `verified` can ever be returned in the window between the deadline passing and any housekeeping — there is no housekeeping write to wait on.
- The atom derives the [Verifier] from [Presented Material] using the same derivation function used at [Register]. It compares the derived value against the stored [Verifier]. If they do not match, `failed-verification(material-mismatch)`. The comparison must be timing-side-channel resistant (constant-time comparison) — an ordinary short-circuiting byte comparison opens a timing oracle on the stored [Verifier]. Where the deployment's derivation function provides its own comparison primitive (as many password-hashing libraries do), using it discharges this obligation.

**At `rotate(credential_id, new_credential_material)`:**
- [Credential Id] must reference a known record; otherwise [Not Known].
- The referenced credential must be *effective-Active* (stored [Active] ∧ [Now] < [Expires At]); otherwise [Not Active]. A [Rotated] or [Revoked] credential cannot be rotated. A stored-[Active] credential whose [Expires At] has passed is **not** effective-Active — it reads [Expired] by derivation — so [Rotate] returns [Not Active] **by derivation, writing nothing** (no record transitions; there is no [Expired] write).
- `new_credential_material` must be non-null and non-empty; otherwise [Invalid Request].
- The two writes — new record creation and prior record status update — are atomic. If the store write fails, [Storage Failure] is returned with neither write committed.

**At `revoke(credential_id, revoked_by_ref, reason)`:**
- [Credential Id] must reference a known record; otherwise [Not Known].
- The referenced credential must be *effective-Active*; otherwise [Already Terminal]. A credential already in stored [Rotated] or [Revoked] state cannot be revoked. A stored-[Active] credential whose [Expires At] has passed is **not** effective-Active — it reads [Expired] by derivation — so [Revoke] returns [Already Terminal] **by derivation, writing nothing**. (A caller wishing to revoke a credential *before* its window lapses calls [Revoke] while [Now] < [Expires At]; once lapsed, the credential already reads [Expired] and no [Verify] against it can succeed, so withdrawal is moot.)
- [Revoked By Ref] and [Reason] must be non-null and non-empty; otherwise the call is rejected as [Invalid Request]. (This keeps revocation attribution and reason mandatory — a revocation without an identified revoker or a stated reason is a finding, not a valid record.)
- If the store write fails after all preconditions pass, [Storage Failure] is returned with no state change committed. The credential record remains as it was before the call.

*(There is no `expire` action: a lapsed credential requires no write to read [Expired] — see the `is_effective_active` guard above and [Read]'s [Effective Status] projection.)*

### Behavior

- **Verifier storage, not material storage.** The atom stores the output of a one-way derivation function applied to the raw credential material. The raw material is never stored — not in any field, not in a log, not in a temporary record. This holds for both [Register] (where the raw material arrives as input) and [Verify] (where the presented material arrives for comparison). An implementation that stores raw credential material has violated this behavioral commitment regardless of whether any invariant could detect it from the record store alone.
- **[Verify] writes nothing.** No record is changed as a result of a [Verify] call; the atom does not implement rate limiting, lockout, or failed-attempt tracking — those are composing concepts. There is **no longer any lazy-expiry side-effect**: a credential whose [Expires At] has passed is not transitioned to any stored state. When [Verify] encounters a stored-[Active] record with [Now] ≥ [Expires At], it is **not** effective-Active, so [Verify] returns `failed-verification(no-active-credential)` **by derivation** — no field is written, no record transitions. The expiry determination is recomputed from [Expires At] and the injected [Now] on every call, never read from a stored flag; there is no stored flag to lag the clock, and so no best-effort housekeeping write to lose to a crash.
- **Expiry is derived, not written.** When [Expires At] is non-null ∧ [Now] ≥ [Expires At], a still-[Active] credential is *shown* [Expired] by [Read]'s [Effective Status] projection, and a [Verify]/[Rotate]/[Revoke] against it is rejected by derivation (`no-active-credential` / [Not Active] / [Already Terminal] respectively) — but **no record is written**, there is no `expired_at` field, and there is no `expire` action. The clock that decides expiry is the injected [Now], consumed by a pure derivation; it is never read inside a transition and never lags behind a stored flag. This is the "derive the idealization, do not lag it with a flag" discipline (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls).
- **[Now] is injected at the seam, not a parameter.** For every action ([Register], [Verify], [Rotate], [Revoke]) the clock reading [Now] is supplied by the pipeline at the deployment I/O seam — injected into the contract, **not** an action parameter and **not** caller-passed (the corpus convention: `clock_t`, like `id_t`, is pipeline-implicit, not threaded through signatures). Per the Logic Confinement Principle (see `execution-contract.md`), the core transition never reads a wall clock internally, so each transition is a pure function of (record state, inputs, and the seam-injected [Now]). [Now] is consumed only by (a) pure expiry/effective-Active derivations in guards (no write) and (b) immutable timestamp stamps inside committed transitions ([Registered At], [Rotated At], [Revoked At]). Clock quality — honesty, monotonicity, skew — is handled at the deployment layer; clock *access* is structurally confined to the seam.
- **Effective-Active, not stored-Active, governs uniqueness and verification.** Every guard that asks "is there an Active credential?" — the [Register] uniqueness check, the [Verify] lookup, the [Rotate]/[Revoke] precondition — means *effective-Active*: stored [Status] = [Active] **and** [Now] < [Expires At]. A stored-[Active]-but-lapsed record does not satisfy it. This is why a fresh [Register] succeeds against a pair whose only stored-[Active] record has lapsed: the lapsed record reads [Expired] and does not occupy the Active slot, so registering a successor does not create two *effective-Active* credentials (Invariant 2 ranges over effective-Active).
- **Rotation is a create-then-transition, not a mutate.** The new credential record is a fresh document with its own [Credential Id]. The prior record's [Verifier] field is never overwritten; the prior record's [Principal Ref] and [Credential Type] fields are never changed. The only change to the prior record on rotation is the [Status] field ([Active] → [Rotated]), [Rotated At], and [Successor Credential Id]. This is what makes the rotation history auditable.
- **Revocation records the revoking actor.** [Revoked By Ref] is recorded on the revoked credential. This is the mechanism by which an auditor can determine who revoked a credential and when, from the records alone. The atom does not validate that [Revoked By Ref] is a valid or currently active principal; it is opaque to the atom.
- **`no-active-credential` does not distinguish sub-cases.** Whether there is no record for this `(principal_ref, credential_type)` pair, or whether all records are terminal, the [Verify] result is the same: `failed-verification(no-active-credential)`. Distinguishing between "never registered" and "was revoked" at the [Verify] surface leaks state to callers who should not know the reason a credential is unavailable. Composing patterns that need to distinguish these cases (e.g., an administrative surface) may query the credential store directly.

### Feedback

Each successful action produces an observable, measurable change:

- After [Register] — a new credential record appears in stored [Active] status with a fresh [Credential Id], [Principal Ref], [Credential Type], [Registered At], and (if specified) [Expires At]. Total record count increases by one.
- After [Verify] — returns `verified` or `failed-verification(reason)`. **No state change at all** — including when a lapsed credential is encountered: the lapsed determination is derived from [Expires At] and the injected [Now], and no record is written.
- After [Rotate] — two observable changes: a new credential record appears in stored [Active] status with a fresh [Credential Id]; the prior record's [Status] transitions to [Rotated] with [Rotated At] and [Successor Credential Id] set.
- After [Revoke] — the target credential record's [Status] transitions to [Revoked] with [Revoked At], [Revoked By Ref], and [Revocation Reason] set.
- On expiry — **no change**: when [Now] ≥ [Expires At], a still-[Active] record's [Effective Status] reads [Expired], but no field is written, the record count does not change, and no transition fires. Expiry is observable only through [Read] (the derived [Effective Status]), never through a write.

Rejected actions produce named rejection codes observable to the caller: [Invalid Request], [Duplicate Active Credential], [Storage Failure], [Not Active], [Not Known], [Already Terminal]. [Verify]'s two failure outcomes (`material-mismatch`, `no-active-credential`) are first-class results, not rejections — they are the normal vocabulary of a verification query that did not succeed; the lapsed (derived-[Expired]) case is folded into `no-active-credential`.

The credential store is queryable. Per-record stored fields ([Credential Id], [Principal Ref], [Credential Type], [Status], [Registered At], [Expires At], [Rotated At], [Successor Credential Id], [Revoked At], [Revoked By Ref], [Revocation Reason]), and each record's derived [Effective Status], are observable to authorized administrative surfaces. The stored [Verifier] is not exposed.

### Invariants

The following invariants constitute the verification surface of the pattern:

**Invariant 1 — Registration immutability.** Once a credential record is created, [Credential Id], [Principal Ref], [Credential Type], [Verifier], and [Registered At] never change. The only fields that change after registration are [Status] and the terminal-transition fields ([Rotated At], [Successor Credential Id], [Revoked At], [Revoked By Ref], [Revocation Reason]) — and each terminal-transition field is **write-once**: set exactly once by the terminal transition that owns it, null before it, and never overwritten thereafter. A post-hoc rewrite of any terminal-transition field — a "re-link" of [Successor Credential Id], an edited [Revocation Reason] — is an invariant violation, not an update; without the write-once clause, the rotation-auditability property below would rest on prose rather than on the verification surface.

**Invariant 2 — Effective-Active uniqueness.** At most one credential record per `(principal_ref, credential_type)` pair is **effective-Active** at any time — where effective-Active ⟺ stored [Status] = [Active] **and** ([Expires At] is null **or** [Now] < [Expires At]). The uniqueness rule ranges over *effective-Active*, not over the bare stored [Active] flag: a stored-[Active]-but-lapsed record ([Now] ≥ [Expires At]) reads [Expired] by derivation and does **not** count toward this bound, so a pair may transiently hold one lapsed stored-[Active] record alongside a freshly registered effective-Active successor without violating the invariant. Two mechanisms maintain it. For [Rotate]: the two writes (new record [Active], prior record [Rotated]) are committed together atomically, so the pair never has two effective-Active records in the transition window. For [Register]: the *effective-Active* uniqueness check (which reads the injected [Now]) and the new record write must be executed under a storage-level uniqueness constraint (e.g., a unique partial index on `(principal_ref, credential_type)` where `status = Active` **and** the credential is not past [Expires At]) so that two concurrent [Register] calls for the same pair cannot both succeed against the same open window — the second write is rejected by the constraint, and the caller receives [Duplicate Active Credential]. Evaluating the guard against the bare stored flag instead of the derivation is the time-of-check/time-of-use hazard the formal twin `credential-buggy-toctou.tla` reintroduces.

**Invariant 3 — Sole-holder verification.** `verify(principal_ref, credential_type, presented_material)` returns `verified` only when [Presented Material] was derived from the same original material registered at [Register] for this `(principal_ref, credential_type)` pair **and** the credential is effective-Active at the injected [Now]. A presented material that does not match never produces `verified`, regardless of the caller's identity; nor does a match against a lapsed (derived-[Expired]) credential.

**Invariant 4 — Revocation absorbing.** Once a credential record's status is [Revoked], no subsequent [Verify] call for the same `(principal_ref, credential_type)` pair returns `verified` via that record. Because at most one effective-Active record exists per pair (Invariant 2), revocation of the effective-Active record means no `verified` result is possible until a new credential is registered.

**Invariant 5 — Terminal state absorbing.** A credential in any **stored** terminal state ([Rotated], [Revoked]) admits no further state transitions: [Rotate] on such a record returns [Not Active] and [Revoke] returns [Already Terminal], by the stored-terminal status itself. A lapsed stored-[Active] credential (derived-[Expired]) yields the *same* rejection codes ([Rotate] → [Not Active], [Revoke] → [Already Terminal]) but for a **distinct** reason — it is **not** a stored terminal; it is excluded because it is not effective-Active. Every transition guard requires effective-Active, evaluated against the injected [Now], so a lapsed record admits no [Rotate], no [Revoke], and no `verified` — by derivation against the clock, not by a stored-terminal status. This invariant proper ranges over the two stored terminals; the lapsed case is attributed to effective-Active (Invariants 11 and 12), and is restated here only so the symmetry of the rejection codes is not mistaken for a shared mechanism.

**Invariant 6 — Rotation non-mutation.** `rotate(credential_id, ...)` never modifies the [Verifier], [Principal Ref], [Credential Type], or [Registered At] of the prior credential record. It creates a new record and writes [Status] = [Rotated], [Rotated At] = [Now], and [Successor Credential Id] = `new_credential_id` to the prior record — and nothing else. Those writes are themselves write-once per Invariant 1: a later overwrite of [Successor Credential Id] would silently rewrite the rotation chain Invariant 7 reconstructs, so chain integrity rests on the write-once clause, not on the absence of a re-link API.

**Invariant 7 — Rotation chain integrity.** Every credential record in [Rotated] status has a non-null [Successor Credential Id] that references another credential record with the same [Principal Ref] and [Credential Type]. The chain from any [Rotated] record to its eventual [Active] (or further-terminal) successor is reconstructable from the record store alone.

**Invariant 8 — Credential material never persisted.** No credential record, log entry, or observable output of the atom contains the raw credential material supplied to [Register] or the presented material supplied to [Verify]. The stored [Verifier] is an artifact derived from the raw material via a one-way function; recovery of the raw material from the verifier is computationally infeasible under the deployment's chosen derivation function.

**Invariant 9 — Revocation attribution completeness.** Every credential record in [Revoked] status has non-null [Revoked At], [Revoked By Ref], and [Revocation Reason]. A revocation record without all three fields present is evidence of a process violation; the atom's [Revoke] action enforces the non-null constraint at call time.

**Invariant 10 — Credential durability.** Once [Register] returns a [Credential Id], the credential record is durably persisted. A [Storage Failure] rejection guarantees no partial record was written. The record count is monotonically non-decreasing; the atom provides no deletion surface. Cascading deletion under a retention policy is the composing pattern's responsibility, not the atom's.

**Invariant 11 — Expiry precludes verification (derived).** A lapsed credential never produces `verified`: once [Expires At] is non-null ∧ [Now] ≥ [Expires At], no [Verify] call returns `verified` via that record, even though its stored [Status] remains [Active]. This guarantee does **not** rest on any stored [Expired] flag — there is none. It rests on derivation: the [Verify] Decision points evaluate `is_effective_active(record, now)` (against the seam-injected [Now]) *before* any verifier comparison, so a lapsed record is excluded by the read-time projection, not by a status write. That check ordering is the load-bearing mechanism. Because at most one effective-Active record exists per pair (Invariant 2), once the effective-Active record lapses no `verified` result is possible until a new credential is registered. This invariant is the expiry analog of Invariant 4 (Revocation absorbing); the difference is that revocation is a stored terminal (a write) while expiry is a pure derivation (no write). It is a structural consequence of effective-Active uniqueness (Invariant 2) combined with the derived-expiry discipline (Invariant 12), made explicit so the verification surface is symmetrically stated.

**Invariant 12 — Expiry is derived, never written.** No credential record carries a stored [Expired] status or an `expired_at` field. A credential's [Expired] condition is the value of the pure projection `effective_status(record, now) = Expired ⟺ (status = Active ∧ expires_at` is non-null `∧ now ≥ expires_at)`, computed at read time from the immutable [Expires At] and the injected clock [Now]. The clock is never read inside a transition, and no write fires when a credential lapses. This is what lets effective-Active uniqueness (Invariant 2) and the verification guards range over a read-time derivation rather than a stored flag, and it removes the stored-flag-that-lags-the-clock failure mode (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls). An implementation that stores [Expired], adds an `expired_at` column, or transitions a credential to a stored [Expired] state violates this invariant.

Invariants 2 and 3 together give the *authentication integrity* property — a principal's [Verify] call is answered by exactly the credential they registered, only them, and only while it is effective-Active. Invariants 4, 5, 11, and 12 give the *terminal finality* property — the system cannot be tricked into verifying against a revoked, rotated, or lapsed credential via race conditions or state-reversion; expiry achieves this by derivation (no stored flag to revert), revocation and rotation by stored-terminal finality. Invariants 6 and 7 give the *rotation auditability* property — the full history of how a principal's credential evolved over time is reconstructable without consulting source code or runbooks.

---

## Examples

### Password authentication — registration and verification

A user creates an account in a financial system. At `2026-01-10T08:00:00Z` the host system calls `register(principal_ref: user_u91, credential_material: <raw-password>, credential_type: "password") → credential_id: cred_c01`. The atom checks that no effective-Active password credential exists for user_u91 (none does), derives the salted hash (the [Verifier]) from the raw password, discards the raw password, and stamps [Registered At] from the injected [Now] (`2026-01-10T08:00:00Z`). The record is stored [Active].

Two hours later, at `2026-01-10T10:00:00Z`, the user logs in. The host system calls `verify(principal_ref: user_u91, credential_type: "password", presented_material: <presented-password>) → verified`. The atom finds the one effective-Active password credential for user_u91 (stored [Active], no [Expires At]), derives the hash of the presented password, and compares it to the stored [Verifier]. Match confirmed; `verified` is returned. No state changes.

### Public-key authentication — rotation

A developer's SSH public key is registered at `2026-05-15T09:00:00Z`: `register(principal_ref: dev_d44, credential_material: <public-key-bytes>, credential_type: "ssh-public-key") → credential_id: cred_c12`. The [Verifier] is the canonical encoding of the public key.

Six months later, at `2026-11-15T09:00:00Z`, the organization's key-rotation policy triggers. The developer generates a new key pair and calls `rotate(credential_id: cred_c12, new_credential_material: <new-public-key-bytes>) → new_credential_id: cred_c13`. The atom confirms `cred_c12` is effective-Active, creates `cred_c13` in stored [Active] with the new [Verifier], and writes `status = Rotated`, `rotated_at = 2026-11-15T09:00:00Z` (the injected [Now]), `successor_credential_id = cred_c13` to `cred_c12`. `cred_c12` is now immutably in stored [Rotated] status. Future [Verify] calls for `(dev_d44, "ssh-public-key")` resolve against `cred_c13`.

### Credential lapses (expiry, derived)

A short-lived API token is registered with an expiry one hour out. At `2026-06-20T12:00:00Z` the host calls `register(principal_ref: svc_account_s03, credential_material: <token-seed>, credential_type: "api-token", expires_at: 2026-06-20T13:00:00Z) → credential_id: cred_c20`. The atom confirms [Expires At] > [Now] (against the injected [Now] = `2026-06-20T12:00:00Z`), derives the [Verifier], stamps [Registered At] = [Now], and stores the record [Active].

Within the window, at `2026-06-20T12:30:00Z`, verification succeeds: `verify(principal_ref: svc_account_s03, credential_type: "api-token", presented_material: <token>) → verified`. The atom evaluates `is_effective_active(cred_c20, now)` against the injected [Now] — stored [Active] and [Now] < [Expires At] — then compares the [Verifier]. Match; `verified`.

After the deadline, at `2026-06-20T13:30:00Z`, verification fails **by derivation**: `verify(principal_ref: svc_account_s03, credential_type: "api-token", presented_material: <token>) → failed-verification(no-active-credential)`. The atom evaluates `is_effective_active(cred_c20, now)` first against the injected [Now] — stored [Active] but [Now] ≥ [Expires At], so **not** effective-Active — and returns the failure *before* any [Verifier] comparison. **Nothing is written**: `cred_c20` stays stored-[Active], there is no `expired_at` field, and no transition fires. A [Read] of the record now reports [Effective Status] = [Expired], derived from the immutable [Expires At] and the read-time clock. The same lapsed record likewise rejects [Rotate] ([Not Active]) and [Revoke] ([Already Terminal]), each by derivation, writing nothing.

Because the lapsed `cred_c20` no longer occupies the effective-Active slot, a fresh registration for the same pair is permitted. At `2026-06-20T14:00:00Z` the host calls `register(principal_ref: svc_account_s03, credential_material: <new-seed>, credential_type: "api-token", expires_at: 2026-06-20T15:00:00Z) → credential_id: cred_c21`. The effective-Active uniqueness guard (Invariant 2) reads the injected [Now] and sees no effective-Active credential — `cred_c20` reads [Expired] — so it admits `cred_c21`. The store now holds two stored-[Active] records for the pair (`cred_c20` lapsed, `cred_c21` open) but exactly **one** effective-Active credential, which is what the invariant ranges over.

### Rejection paths

**[Register] — [Duplicate Active Credential]:** At `2026-03-01T09:00:00Z` an administrator attempts to register a second TOTP (Time-based One-Time Password — the standard for rolling 6-digit authenticator-app codes) secret for a principal that already has one: `register(principal_ref: user_u91, credential_material: <totp-seed>, credential_type: "totp") → rejected(duplicate-active-credential)`. The atom finds an existing *effective-Active* TOTP credential for user_u91 (stored [Active], [Now] < [Expires At] against the injected [Now]) and rejects the call. To replace it, the caller must [Rotate] the existing credential. (Had the existing TOTP credential already lapsed, it would read [Expired] and not block this registration.)

**[Verify] — `failed-verification(material-mismatch)`:** A user enters an incorrect password. At `2026-03-02T09:00:00Z`: `verify(principal_ref: user_u91, credential_type: "password", presented_material: <wrong-password>) → failed-verification(material-mismatch)`. The atom finds the effective-Active password credential, derives the hash of the presented password, and finds it does not match the stored [Verifier]. The credential record is unchanged. The composing Login pattern increments its failed-attempt counter (the atom does not track this) and decides whether to lock the account.

**[Verify] — `failed-verification(no-active-credential)`:** At `2026-03-03T09:00:00Z` an administrator revokes a user's API token: `revoke(credential_id: cred_c08, revoked_by_ref: admin_a01, reason: "suspected-compromise") → revoked`. Subsequently, at `2026-03-03T10:00:00Z`, the API client attempts a request with the revoked token: `verify(principal_ref: user_u91, credential_type: "api-token", presented_material: <token>) → failed-verification(no-active-credential)`. The atom finds no effective-Active credential for this pair — the only record is in stored [Revoked] status — and returns the failure without distinguishing the specific reason (revoked, rotated, lapsed, or never registered).

**[Rotate] — [Not Active]:** At `2026-03-03T11:00:00Z` an incident-response process attempts to rotate a credential that was already revoked: `rotate(credential_id: cred_c08, new_credential_material: <new-token>) → rejected(not-active)`. The atom finds that `cred_c08` is stored [Revoked] and rejects the rotation. To issue a new credential for this principal, the caller must use [Register].

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A PCI DSS (Payment Card Industry Data Security Standard) auditor asks *"was the service account's API credential rotated within the 90-day policy window?"* The auditor queries the credential store for all records with `principal_ref: svc_account_s03` and `credential_type: "api-token"`, ordered by [Registered At]. Each [Rotated] record carries [Rotated At] and [Successor Credential Id]. The auditor walks the chain: `cred_c02 → Rotated at 2026-02-01 → cred_c07 → Rotated at 2026-04-28 → cred_c11 (Active, registered_at: 2026-04-28)`. The gap between each [Registered At] and the predecessor's [Rotated At] is within 90 days. Invariant 7 (rotation chain integrity) is the structural guarantee that the chain is complete — no rotation event is omitted from the record.

**Disputed transaction.** A user claims *"I did not log in from that IP address at 2026-08-14T03:22Z."* The investigator queries the composing Login pattern's records (which belong to that pattern) for the session established at that time, identifying the [Credential Id] used. The credential record shows: `credential_id: cred_c01`, `principal_ref: user_u91`, `credential_type: "password"`, `status: Active` (at the time of the login), `registered_at: 2026-01-10`. The investigator confirms the credential was [Active] at the time and has not been retroactively revoked. Invariant 3 (sole-holder verification) is the structural rebuttal: if `verified` was returned at 2026-08-14T03:22Z, the presented material matched the [Verifier] registered for user_u91's password credential — the only explanation is that the raw password was known to the caller. Whether that caller was the legitimate user or an attacker with a compromised password is a separate investigation; the atom's records bound the forensic window.

**Breach or incident investigation.** An incident-response team discovers that a batch of API tokens for a service account may have been exposed in a log file. The investigator queries all credential records for `principal_ref: svc_account_s03` and `credential_type: "api-token"`. The records show: `cred_c02` ([Active], registered 2026-01-01, no expiry), `cred_c07` not found — no rotation or revocation was performed before the exposure. The investigator notes the window of potential unauthorized use. At `2026-09-12T11:40:00Z` the response team calls `revoke(credential_id: cred_c02, revoked_by_ref: admin_a01, reason: "log-exposure-2026-09-12")`. The atom confirms `cred_c02` is effective-Active (stored [Active], no [Expires At]), then writes the immutable revocation record: `revoked_at: 2026-09-12T11:40:00Z` (stamped from the injected [Now]), `revoked_by_ref: admin_a01`, `revocation_reason: "log-exposure-2026-09-12"`. Invariant 9 (revocation attribution completeness) ensures that a future auditor reading only the record store can reconstruct exactly when the credential was revoked, by whom, and why.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Identity proofing.** Establishing that a [Principal Ref] corresponds to a real, identified person or organization — verifying a government ID, confirming a phone number, checking against a sanctions list — belongs to Party Identity and the Customer Onboarding composition. Credential takes [Principal Ref] as opaque; it does not know or care who or what the principal is. A principal with a registered credential is not thereby a verified identity.
- **Multi-factor orchestration.** Sequencing two or more credential checks (password then TOTP code; hardware key then PIN) is a composing concept, not part of this atom. This atom verifies one credential at a time. The Login composition is where multi-factor sequencing is expressed.
- **Session management.** A `verified` result is a momentary signal, not a persistent state. Persisting the result of a successful verification into a time-bounded session is Session's surface (atom #12). The atom does not know about sessions.
- **Failed-attempt tracking and lockout.** The atom does not count failed [Verify] calls, implement exponential backoff, or lock credentials after N failures. These are composing concepts. The composing Login pattern (or its deployment configuration) owns the lockout policy.
- **Authorization.** What a verified principal is permitted to do is Permissions' surface. Credential answers *"is this the right principal?"*; Permissions answers *"is this principal allowed to do this?"*.
- **Credential recovery.** Account recovery flows (reset via email, backup codes, recovery keys) are composing concepts. The recovery mechanism produces a new [Credential Material] that the caller then [Rotate]s in; the atom sees only the rotate call.
- **Credential sharing and delegation.** A credential is bound to exactly one [Principal Ref]. The atom has no model for credentials shared between principals or delegated to an agent on behalf of a principal. Capability (atom #13) is the library's model for bearer-token delegation where the holder's identity is intentionally irrelevant.
- **Credential type enumeration.** The atom does not enumerate valid credential types; that is deployment configuration. A deployment must configure the derivation function for each credential type it supports. If [Credential Type] is unrecognized by the deployment's derivation function registry, [Register] returns [Invalid Request].
- **Derivation function agility.** When a deployment changes its verifier derivation function (e.g., upgrading to a stronger password-hashing algorithm), existing credentials remain valid under the old function. Migrating stored verifiers to the new function is a deployment operation outside the atom's scope. The atom stores the derivation function identifier alongside the [Verifier] (as an implementation detail); [Verify] uses the stored identifier to select the correct function for comparison.
- **Clock accuracy and the injected clock.** The write timestamps [Registered At], [Rotated At], and [Revoked At] are stamped from the **injected** clock [Now] (the pipeline's `clock_t`), never read inside a transition; the same injected [Now] drives the pure expiry/effective-Active derivation, [Read]'s [Effective Status], and [Expires At]'s future-timestamp check at [Register]. [Expires At] itself is a caller- or policy-supplied absolute deadline, immutable once set. The atom assumes a single deployment clock; clock skew, monotonicity, and timezone normalization are deployment concerns. Trusted timestamping (RFC 3161 — the Internet standard "Request for Comments" document 3161 defining a trusted time-stamping protocol) is a composing pattern for deployments requiring externally verifiable timestamps. Because expiry is *derived* rather than stamped, two readers evaluating [Effective Status] (or two guards evaluating `is_effective_active`) with slightly skewed clocks near [Expires At] may briefly disagree on whether a record is [Expired] — the standard read-time-derivation consequence, bounded by the deployment's clock-skew envelope and harmless because no write is at stake (no `verified` is returned for a lapsed credential under any reader's clock, and no stored state diverges).
- **Credential store tamper-evidence.** The atom assumes the credential store has not been rewritten by an adversary with write access. Cryptographic chaining and external anchoring belong to Tamper Evidence. The atom composes naturally with Tamper Evidence for high-assurance deployments.
- **Compromise disclosure.** A credential later determined to have been compromised before revocation does not cause the atom to retroactively change any record. The records remain as written. Reinterpretation of authentication events during the compromise window belongs to a Compromise Disclosure composing pattern, which produces new records that reframe the prior `verified` results as untrustworthy. The credential store remains immutable; the meaning of its records changes via composition, not via mutation.
- **Biometric binding.** Where [Credential Material] is a biometric template, the atom stores the template's processed [Verifier]. Whether biometric templates constitute personal data under GDPR (General Data Protection Regulation) or HIPAA (and thus require special-category handling) is handled at the deployment layer and is outside the atom's scope. The atom's [Credential Material]-is-never-persisted invariant does not relieve a deployment of its special-category obligations if the derived verifier is itself biometric data.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Register

The behavior that creates a new credential record binding a principal to a [Verifier] derived from supplied [Credential Material]. It assigns a fresh [Credential Id], records [Principal Ref], [Credential Type], [Expires At] (if supplied), and [Registered At] = [Now], and returns the [Credential Id] (or a rejection). Permitted only when no *effective-Active* credential exists for the pair (else [Duplicate Active Credential]).

Kind: Operation

#### Verify

The pure read-only behavior that answers whether [Presented Material] matches the [Verifier] of the *effective-Active* credential for a (principal, [Credential Type]) pair. Returns `verified` or `failed-verification(material-mismatch | no-active-credential)`; never writes. The effective-Active (derived-expiry) check is evaluated *before* any comparison, so a lapsed credential yields `no-active-credential`.

Kind: Operation

#### Rotate

The behavior that replaces an *effective-Active* credential: atomically creates a new [Active] record for the same pair and transitions the prior record to [Rotated] with [Rotated At] and [Successor Credential Id] set. Returns the new [Credential Id], or a rejection ([Not Known] / [Not Active] / [Invalid Request] / [Storage Failure]). Never mutates the prior record's [Verifier], [Principal Ref], or [Credential Type].

Kind: Operation

#### Revoke

The behavior that cancels an *effective-Active* credential, transitioning it to [Revoked] and recording [Revoked By Ref], [Revocation Reason], and [Revoked At]. Returns `revoked`, or a rejection ([Not Known] / [Already Terminal] / [Invalid Request] / [Storage Failure]). Absorbing: a stored terminal or lapsed credential is rejected, writing nothing.

Kind: Operation

#### Read

The read-only behavior that returns credential records matching a `filter`. Each record carries its stored fields plus the derived [Effective Status]; it changes nothing. The [Verifier] is never exposed.

Kind: Operation

#### Credential Id

The opaque, immutable, system-generated identity of a credential record, produced by [Register] (the injected `id_t`), never reused or reassigned. The principal, type, verifier, status, and timestamps are properties of the record, not its identity.

Kind:     Field
Field of: Credential
Projects: credential_id

#### Principal Ref

The opaque reference to the principal the credential authenticates. Set on [Register], immutable. The atom does not validate that the principal exists anywhere; it is the caller's responsibility.

Kind:     Field
Field of: Credential
Projects: principal_ref

#### Credential Type

The caller-supplied label naming the kind of credential (e.g., `password`, `public-key`). Set on [Register], immutable, treated byte-exact. Used for the one-effective-Active-per-(principal, type) uniqueness rule and to select the verifier derivation function; must name a registered derivation function.

Kind:     Field
Field of: Credential
Projects: credential_type

#### Verifier

The one-way artifact derived from [Credential Material] at [Register]. Set on [Register], immutable, never exposed in outputs. [Verify] compares the derivation of [Presented Material] against it; the raw material is never stored (Invariant 8).

Kind:     Field
Field of: Credential
Projects: verifier

#### Status

The **stored** lifecycle status — [Active], [Rotated], or [Revoked]. Set to [Active] on [Register]; transitions to a stored terminal only via the owning action's write. [Expired] is **not** a value of this field — it is the derived [Effective Status], never stored.

Kind:     Field
Field of: Credential
Projects: status

#### Registered At

The wall-time [Register] was called, stamped from the injected [Now]. Set once, immutable (Invariant 1). The ordering key for lifecycle reconstruction.

Kind:     Field
Field of: Credential
Projects: registered_at

#### Expires At

The optional absolute deadline at which the credential lapses. Set on [Register] (must be future relative to the injected [Now]); null means no expiry; immutable once set. The sole stored input to the expiry derivation — there is no stored [Expired] flag or `expired_at` field.

Kind:     Field
Field of: Credential
Projects: expires_at

#### Rotated At

The timestamp the prior record transitioned to [Rotated], stamped from the injected [Now]. Null until rotation; write-once thereafter (Invariant 1).

Kind:     Field
Field of: Credential
Projects: rotated_at

#### Successor Credential Id

The [Credential Id] of the new credential a [Rotate] produced, written onto the prior record. Null until rotation; write-once thereafter (Invariants 1 and 6). Makes the rotation chain reconstructable (Invariant 7).

Kind:     Field
Field of: Credential
Projects: successor_credential_id

#### Revoked At

The timestamp the credential transitioned to [Revoked], stamped from the injected [Now]. Null until revocation; write-once thereafter (Invariant 1).

Kind:     Field
Field of: Credential
Projects: revoked_at

#### Revoked By Ref

The opaque reference to the actor who revoked the credential. Set at [Revoke], write-once; non-null required (Invariant 9). The atom does not validate it.

Kind:     Field
Field of: Credential
Projects: revoked_by_ref

#### Revocation Reason

The required, non-empty reason for revocation — written from the [Reason] parameter. Set at [Revoke], write-once; non-null required (Invariant 9).

Kind:     Field
Field of: Credential
Projects: revocation_reason

#### Effective Status

The derived liveness status [Read] surfaces: [Expired] when [Status] = [Active] ∧ [Expires At] is non-null ∧ [Now] ≥ [Expires At], otherwise the stored [Status]. A pure projection over the record and the injected [Now]; **never stored** (Invariant 12).

Kind:     Field
Field of: Credential
Projects: effective_status

#### Credential Material

The raw secret or token the principal supplies at [Register]. Consumed to derive the [Verifier], then discarded — never persisted (Invariant 8). Non-null and non-empty required.

Kind:         Parameter
Parameter of: Register
Projects:     credential_material

#### Presented Material

The raw secret or token the principal presents at [Verify]. Consumed to derive a value compared against the stored [Verifier], then discarded — never persisted.

Kind:         Parameter
Parameter of: Verify
Projects:     presented_material

#### Reason

The required, non-empty reason string [Revoke] consumes — written into [Revocation Reason]. Not stored under this name; an empty or whitespace-only value is rejected [Invalid Request].

Kind:         Parameter
Parameter of: Revoke
Projects:     reason

#### Now

The current clock reading the pipeline consumes — the injected `clock_t`, supplied at the I/O seam, never read inside a transition and never a signature parameter. It stamps the immutable write timestamps ([Registered At], [Rotated At], [Revoked At]) and drives the pure expiry/effective-Active derivation in guards and [Read] (no write).

Kind:         Parameter
Parameter of: Register
Projects:     now

#### Active

The only non-terminal stored [Status]: the credential can be used for verification while [Now] < [Expires At]. A still-[Active] record past its deadline reads [Expired] by derivation and no longer occupies the Active slot.

Kind:      Member
Member of: the credential status
Role:      Outcome

#### Rotated

The stored terminal [Status] of a credential replaced by a successor. Carries [Rotated At] and [Successor Credential Id]; admits no further transition (Invariant 5).

Kind:      Member
Member of: the credential status
Role:      Outcome

#### Revoked

The stored terminal [Status] of a deliberately cancelled credential. Carries [Revoked At], [Revoked By Ref], and [Revocation Reason]; absorbing — no [Verify] succeeds via it thereafter (Invariants 4 and 5).

Kind:      Member
Member of: the credential status
Role:      Outcome

#### Expired

The **derived** status (never stored) of a still-[Active] record whose [Expires At] has lapsed against the evaluating clock. Computed by the [Effective Status] projection; it precludes verification by derivation, writing nothing (Invariants 11 and 12).

Kind:      Member
Member of: the credential status
Role:      Outcome

#### Invalid Request

The rejection [Register], [Rotate], or [Revoke] returns when request fields fail — a null/empty/whitespace [Principal Ref], [Credential Material], [Credential Type], [Revoked By Ref], or [Reason]; an [Expires At] not in the future at [Register]; an unrecognized [Credential Type]; or an over-length value.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Duplicate Active Credential

The rejection [Register] returns when an *effective-Active* credential already exists for the (principal, [Credential Type]) pair. The caller must [Rotate] the existing credential instead.

Kind:      Member
Member of: the Register rejection
Role:      Outcome
Projects:  duplicate-active-credential

#### Storage Failure

The rejection any writing action returns when a durable write fails after preconditions pass. All-or-none: no partial record is observable, and the prior state is unchanged (Invariant 10).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Active

The rejection [Rotate] returns when the target is not *effective-Active* — a stored terminal ([Rotated]/[Revoked]) by its status, or a lapsed stored-[Active] credential by derivation. Writes nothing.

Kind:      Member
Member of: the Rotate rejection
Role:      Outcome
Projects:  not-active

#### Not Known

The rejection [Rotate] or [Revoke] returns when the named [Credential Id] references no record in the store.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Already Terminal

The rejection [Revoke] returns when the target is not *effective-Active* — a stored terminal ([Rotated]/[Revoked]) by its status, or a lapsed stored-[Active] credential by derivation. Writes nothing.

Kind:      Member
Member of: the Revoke rejection
Role:      Outcome
Projects:  already-terminal

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Register]: #register
[Verify]: #verify
[Rotate]: #rotate
[Revoke]: #revoke
[Read]: #read
[Credential Id]: #credential-id
[Principal Ref]: #principal-ref
[Credential Type]: #credential-type
[Verifier]: #verifier
[Status]: #status
[Registered At]: #registered-at
[Expires At]: #expires-at
[Rotated At]: #rotated-at
[Successor Credential Id]: #successor-credential-id
[Revoked At]: #revoked-at
[Revoked By Ref]: #revoked-by-ref
[Revocation Reason]: #revocation-reason
[Effective Status]: #effective-status
[Credential Material]: #credential-material
[Presented Material]: #presented-material
[Reason]: #reason
[Now]: #now
[Active]: #active
[Rotated]: #rotated
[Revoked]: #revoked
[Expired]: #expired
[Invalid Request]: #invalid-request
[Duplicate Active Credential]: #duplicate-active-credential
[Storage Failure]: #storage-failure
[Not Active]: #not-active
[Not Known]: #not-known
[Already Terminal]: #already-terminal

---

## Composition notes

Credential is freestanding. It is named by Login and External Onboarding as a constituent atom. It also composes naturally with the regulatory stack:

- **[Actor Identity](./actor-identity.md)** — [Revoke] records [Revoked By Ref], an opaque reference to the revoking actor. In regulated deployments, the Login composition's successful [Verify] will typically be followed by an Actor Identity `attest` call to produce a non-repudiable record that the principal authenticated. The two atoms are distinct: Credential answers *"did the right material arrive?"*; Actor Identity answers *"who authorized this action and can you prove it?"*
- **[Authenticated Actor](../compositions/authenticated-actor.md)** — wires Credential and Actor Identity under a single principal, owning three invariants the individual atoms leave unspecified: (1) whether Credential revocation cascades to the Actor Identity attest surface, (2) whether the same secret material may serve both credential surfaces, and (3) how the `principal_ref` and `actor_ref` namespaces are formally bound. All three are specified in the Authenticated Actor composition spec linked above; their origin was an implementation-discovered gap, recorded at `demos/attributed-permissions-admin/CORNERS.md` §Cross-atom identity surface aliasing.
- **[Permissions](./permissions.md)** — composing patterns combine Credential verification with Permissions checks. [Session-Gated Authorization](../compositions/session-gated-authorization.md) gates every Permissions query on Session validity; the upstream [Verify] is Credential's surface.
- **[Party Identity](./party-identity.md)** — Party Identity is the persistent verifiable identity of an external party. Credential is the authentication mechanism that principal binds to their Party Identity record. External Onboarding is the composition that wires them: an Invitation is accepted, a Party Identity is created, a Credential is registered.
- **[Tamper Evidence](./tamper-evidence.md)** — for regulated deployments, the credential store (including the rotation and revocation history) should be hash-chained and externally anchored so that any rewrite of credential records is detectable from the records alone.
- **[Audit Trail](../compositions/audit-trail.md)** — in regulated deployments, every [Register], [Rotate], and [Revoke] call should be recorded in the Audit Trail. The atom itself does not mandate this; it is a composing-pattern obligation. Login is where the audit-recording wiring lives.
- **[Session](./session.md)** — Session records the result of a successful [Verify]. [Login](../compositions/login.md) is the composition that wires [Verify] → `verified` to `Session.issue`.
- **[Login](../compositions/login.md)** — wires Credential verification to Session issuance, both attested under the verified principal. Carries the cascade invariant: revocation of a Credential invalidates every Session derived from it.
- **[External Onboarding](../compositions/external-onboarding.md)** — credential registration is the final step of the onboarding arc: Invitation accepted → Party Identity created → Credential registered → all steps attested.
- **[Privileged Access Provisioning](../compositions/privileged-access-provisioning.md)** — calls `Credential.verify` against the requestor's credential before accepting a privileged access request (`request_access` step 3), and again before each approver step decision (`approve_step` and `reject_step` step 2) to ensure no decision is attributed to a revoked or expired credential. Credential is queried read-only; this composition does not register, rotate, or revoke credentials.
- **Compromise Disclosure** *(forthcoming)* — handles retroactive reinterpretation of `verified` results for credentials that were active during a compromise window, without mutating the credential store.

---

## Standards references

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63B (Digital Identity Guidelines — Authentication and Lifecycle Management)** — the primary technical standard for credential management. Authenticator Assurance Levels (AAL 1/2/3 — graded measures of authentication strength), verifier requirements (stored verifiers, not raw secrets), rotation and revocation requirements, and session lifecycle all correspond directly to this atom's behavioral commitments. The correspondence is to 800-63B's *verifier-storage and lifecycle* requirements specifically; authenticator-*strength* requirements (minimum length, breached-password screening, entropy floors) are not enforceable by this atom — they live in the deployment-configured derivation function and material constraints, and a conforming deployment must discharge them there. The atom is mechanism-neutral within the 800-63B envelope — it does not mandate a specific authenticator type. Identity proofing (NIST 800-63A) is explicitly *not* cited here; that belongs to Party Identity.
- **FIDO2 / WebAuthn (W3C Web Authentication Level 2)** — FIDO2 (Fast IDentity Online 2) and WebAuthn (the W3C — World Wide Web Consortium — Web Authentication standard) for phishing-resistant hardware authenticators. The atom's `credential_type: "fido2"` case corresponds to WebAuthn's authenticator binding: [Credential Material] is the attestation object; the [Verifier] is the public key extracted from it; [Verify] checks a presented authentication assertion against the stored public key.
- **RFC 7519 (JSON Web Token)** — JWT (a compact, signed token format carrying claims) is a common encoding for API (Application Programming Interface) tokens. The atom's `credential_type: "api-token"` case can store a token hash (the [Verifier]) derived from the raw JWT; [Verify] hashes the presented JWT and compares. The atom does not interpret JWT claims — that belongs to the composing pattern.
- **OpenID Connect Core 1.0** — the OpenID Connect (an identity layer built on top of OAuth 2.0) login flow produces a credential verification event that this atom models. The Login composition is the Grace Commons expression of the OIDC (OpenID Connect) authorization code flow.
- **PCI DSS Requirement 8 (Identify and Authenticate Access to System Components)** — password complexity, rotation frequency, and account lockout requirements for payment-system credentials. The atom's invariants satisfy the structural requirements (unique active credential per account, rotation produces new record, revocation is recorded); the PCI DSS configuration knobs (rotation period, complexity rules, lockout threshold) are deployment-configurable.
- **ISO/IEC 27001 §A.9.4 (System and Application Access Control)** — the International Organization for Standardization / International Electrotechnical Commission information-security standard; access control for system and service authentication. The atom's registration, rotation, and revocation lifecycle corresponds to the credential management controls in §A.9.4.
- **GDPR Article 32 (Security of Processing)** — the atom's [Credential Material]-is-never-persisted invariant (Invariant 8) and the one-way verifier storage discipline contribute to the "appropriate technical measures" Article 32 requires. Deployments storing biometric verifiers should assess Article 9 (special category data) obligations separately.
- **HIPAA §164.312(d) (Person or Entity Authentication)** — verification that a person or entity seeking access to electronic protected health information is the one claimed. The atom's `verified` result is the structural mechanism for this requirement.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing identity proofing, session management, authorization, and multi-factor orchestration as separate atoms rather than absorbing them here.
- **NIST 800-132 (Recommendation for Password-Based Key Derivation)** — the derivation function guidance the `verifier` storage discipline is built on. The atom mandates one-way derivation; 800-132 is the reference for which derivation functions satisfy that property.

---

## Generation acceptance

A derived implementation of Credential is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the credential record store (and the read-time clock the `read` surface uses), can do all of the following without recourse to source code, runbooks, or developer narration:

- **Verify effective-Active uniqueness.** For any `(principal_ref, credential_type)` pair, confirm that at most one record is *effective-Active* — stored [Status] = [Active] **and** ([Expires At] is null **or** [Now] < [Expires At]) against the read-time clock. A pair with two effective-Active records is a violation of Invariant 2 and evidence of an implementation defect. Note that two stored-[Active] records may legitimately coexist for a pair if one has lapsed ([Now] ≥ [Expires At]); the lapsed one reads [Expired] and does not count — so the check is against the *derived* effective-Active, not the bare [Status] = [Active] flag.
- **Confirm expiry is derived, never stored.** Confirm that **no** record carries a stored [Expired] status value or an `expired_at` field. For any stored-[Active] record with a non-null [Expires At], the auditor computes `effective_status = Expired ⟺ now ≥ expires_at` from the immutable [Expires At] and the read-time clock — reproducing exactly what [Read] returns. Invariant 12 is the guarantee; a stored [Expired], or an `expired_at` column, is a defect.
- **Walk any rotation chain to completion.** Starting from any [Rotated] credential record, follow [Successor Credential Id] links to the end of the chain. Confirm that every link resolves to a record with the same [Principal Ref] and [Credential Type], and that the chain terminates in either an [Active] record (effective-Active or lapsed) or a further stored terminal (if the successor was itself later revoked or rotated). Invariant 7 is the structural guarantee; a broken link — a [Successor Credential Id] that references a non-existent [Credential Id] — is evidence of an implementation defect.
- **Confirm revocation attribution completeness.** For every record with [Status] = [Revoked], confirm that [Revoked At], [Revoked By Ref], and [Revocation Reason] are all non-null. A [Revoked] record missing any of these fields is a violation of Invariant 9 and evidence of a process violation. Determine who revoked each credential and the stated reason, without consulting any external system.
- **Confirm no raw credential material is present.** Inspect all fields of all records and confirm that no field contains raw credential material (no plaintext passwords, no private keys, no unprocessed TOTP secrets). The [Verifier] field should contain a hash, encoded public key, or other one-way artifact. Confirm that the [Verifier] field is absent from any observable API output. This is the behavioral commitment of Invariant 8; a record store that fails this check has violated the foundational security contract of the atom.
- **Reconstruct the credential lifecycle for any principal.** Given a [Principal Ref] and [Credential Type], query all records for that pair ordered by [Registered At]. The records should tell the complete story: initial registration, each rotation with timestamp and successor link, the revocation record (if applicable), and the derived [Expired] status (computed from [Expires At] and the read-time clock) for any lapsed stored-[Active] record. No gap in the chain should be unexplained. Invariant 10 (credential durability) is the guarantee that no record was deleted between registration and the audit.
- **Confirm stored terminal-state finality.** For any record in a **stored** terminal state ([Rotated], [Revoked]), confirm that no subsequent record for the same [Credential Id] exists showing a non-terminal status. Stored terminal records are absorbing; a record store showing a transition from [Revoked] back to [Active] is evidence of an implementation defect. (Expiry is not a stored terminal — a lapsed stored-[Active] record is permitted to remain stored-[Active]; it is excluded from verification by derivation, not by a status write.)

This is the generator's contract: any implementation derived from this atom must produce a credential store that passes all seven checks above. The bar is the regulator's question — *"can you prove this credential was managed with integrity throughout its lifecycle?"* — not the developer's intuition.

---

## Status

`grounded on Final Critique 5 — 2026-06-23` — the **execution/render-time refactor** is complete and the closing fresh-reader Final Critique (Final Critique 5) returned clean. The stored `Expired` state, the "clock advance past `expires_at` → `Expired`" transition, and all lazy-expiry writes were removed; `Expired` is now a derived `effective_status` projection computed at read time from the injected clock and the immutable `expires_at` (Invariant 12). The single-Active uniqueness rule was reworded to range over **effective-Active** (stored `Active` ∧ `now < expires_at`) so a stored-`Active`-but-lapsed credential does not occupy the Active slot (Invariant 2). The clock `now` is injected by the pipeline at the I/O seam (pipeline-implicit `clock_t`, **not** an action parameter — the 2026-06-21 now-explicit-signatures experiment was reverted) and consumed only by pure derivations (guards) and timestamp stamps (writes). The TLA+ model was re-verified green in the harness with both buggy twins rejected and the coverage matrix regenerated clean against the refactored model (see Lineage). Prior grounding: `grounded on Final Critique 4 — 2026-06-10` (scheduled rescan, council-run — five rounds to clean, findings folded; see Lineage §Scheduled rescan 2026-06-10. Formal layer complete 2026-06-04 — TLA+ model `credential.tla` + buggy twin verified; see Lineage §Formal model and §Formal model — Inv 7 extension. Formal coverage: Invariant 7 (rotation-chain integrity) covered by `Inv_RotationChain` — coverage GAP closed 2026-06-04; see `tools/harness/coverage/credential.md`.) See Lineage §Execution/render-time refactor and §Final Critique 5.

*Classification (post-flatten): stored flat as `atoms/credential.md` — no category folder. Credential is an authentication / credential-management primitive with meaningful non-regulated uses (wherever authentication is required), so its **regulated** and **security** classifications are overlays derived from its composers, not a folder it is filed under. This resolves the atom's former provisional `compliance/` placement and the question of relocating it to a security or identity folder: under the [usage-derived taxonomy](./TAXONOMY.md), `security` is an overlay it carries (derived from its identity/access standards), not a domain or a directory.*

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

**Conventions inherited.** This atom carries the **regulated** and **security** overlays (both derived from its composers) and includes *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`pressure-testing.md`](../pressure-testing.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

**Structural decisions made in draft.**

- *`verify` signature.* Takes `(principal_ref, credential_type, presented_material)` rather than `(credential_id, presented_material)`. Rationale: the natural call pattern from a Login composition is principal-scoped, not credential-id-scoped. The Login composition knows the principal's identity claim; it does not need to pre-resolve the active credential_id. The atom handles the lookup of the active credential for the `(principal_ref, credential_type)` pair internally.
- *`no-active-credential` does not distinguish sub-cases.* `verify` returns `failed-verification(no-active-credential)` whether no credential was ever registered or all credentials are terminal. Collapsing the sub-cases prevents enumeration attacks (knowing that a principal has credentials but all are revoked leaks state a caller should not have). Composing patterns with administrative needs may query the store directly.
- *Uniqueness per `(principal_ref, credential_type)`, not per `principal_ref`.* A principal may have one active password AND one active hardware key; they are different types. But two active passwords for the same principal is a violation. This is the correct granularity for real authentication systems.
- *`revoked_by_ref` and `reason` are mandatory on `revoke`.* A revocation without attribution and stated reason is a compliance finding, not a valid record. Making them mandatory at the action boundary prevents partial revocation records from entering the store.

**Forthcoming-link resolution.** This atom retires the `Authentication *(forthcoming)*` debt in [`atoms/actor-identity.md`](./actor-identity.md). That atom's Composition notes read: *"Authentication *(forthcoming)* — produces the credential the atom consumes."* With Credential grounded, that link resolves. The update to actor-identity.md's Composition notes is a separate task.

---

**Round 1.**

*Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).* One finding. **F1 — Invariant 1 typo:** The immutable-fields list read "`principal_ref`, `credential_type`, `verifier`, `credential_type`, and `registered_at`" — `credential_type` duplicated and `credential_id` absent despite being stated immutable in the Identity Model. Fixed in-pattern: list now reads `credential_id`, `principal_ref`, `credential_type`, `verifier`, `registered_at`. Eight other GRID nodes clean.

*Pass 2 — EOS conceptual independence.* Clean. Atom is freestanding; no other atom named in the specification. All four actions (register, verify, rotate, revoke) belong to Credential's own concern. All deferred concerns (session, multi-factor, authorization, rate limiting, identity proofing, recovery) correctly named as out-of-scope. No over-absorption detected.

*Pass 3 — Linus adversarial.* Four findings, all closed in-pattern.

- **F2 — `register` signature missing `expires_at?`:** The State section stated `expires_at` could be "caller-supplied at registration time," but the action signature `register(principal_ref, credential_material, credential_type)` offered no parameter for it. Fixed: signature updated to `register(principal_ref, credential_material, credential_type, expires_at?)`; `expires_at` added to Inputs with future-timestamp validation; Decision points updated.
- **F3 — `revoke` missing `storage-failure`:** `revoke` writes to the store (status, revoked_at, revoked_by_ref, revocation_reason) but its rejection vocabulary stopped at `invalid-request | already-terminal | not-known`, unlike `register` and `rotate` which both include `storage-failure`. Fixed: `storage-failure` added to `revoke` signature and Decision points.
- **F4 — Lazy expiry interacts silently with `rotate` and `revoke`:** The lazy-expiry mechanism fires only in `verify`. A credential whose `expires_at` passed but whose `status` was still technically `Active` (lazy transition not yet fired) could be successfully `rotate`d or `revoke`d — an undocumented decision. Fixed: `rotate` and `revoke` Decision points now state that a credential whose `expires_at` has passed is treated as terminal; `rotate` returns `not-active` and `revoke` returns `already-terminal`, and both may lazily transition the record to `Expired`.
- **F5 — Invariant 2 concurrent `register` unaddressed:** Invariant 2 named only `rotate`'s atomicity as the uniqueness mechanism. Two simultaneous `register` calls for the same `(principal_ref, credential_type)` could both pass the duplicate-active-credential check and both write, violating Active uniqueness. Fixed: Invariant 2 updated to name both mechanisms — `rotate` atomicity (commit-together) and `register` storage-level unique constraint (unique partial index on `(principal_ref, credential_type)` where `status = Active`).

Round 1 closed. Five findings; all resolved in-pattern; none deferred.

---

**Round 2.**

*Pass 1 — GRID structural.* One finding. **F6 — Flow step 5 and State transition inconsistent with F4 fix:** Both stated that lazy expiry fires "at the next `verify` call" only — but Round 1's F4 fix added lazy-expiry detection to `rotate` and `revoke` Decision points as well. Fixed: State transition and Flow step 5 now say lazy expiry may fire at the next `verify`, `rotate`, or `revoke` call that encounters the credential.

*Pass 2 — EOS conceptual independence.* Clean. No new concerns introduced by Round 1 fixes.

*Pass 3 — Linus adversarial.* One finding. **F7 — Behavior section and Feedback section contradicted lazy expiry at `verify`:** The Behavior section stated "`verify` is a pure read. No record is written, no counter is incremented, no state is changed" — a direct contradiction of the lazy-expiry side-effect that fires when `verify` encounters an expired-but-not-transitioned credential. The Feedback section also said "After `verify` — no state change." Fixed: Behavior section updated to "verify does not modify substantive state" with an explicit carve-out for the housekeeping lazy-expiry side-effect; Feedback section updated to acknowledge the possible lazy transition.

Round 2 closed. Two findings; both resolved in-pattern; none deferred.

---

**Round 3.**

*Pass 1 — GRID structural.* Clean. All nine nodes consistent after Round 1 and Round 2 fixes.

*Pass 2 — EOS conceptual independence.* Clean.

*Pass 3 — Linus adversarial.* One finding. **F8 — `verify` Decision points internal contradiction and expiry-check ordering:** The third bullet said "`verify` does not modify state and does not update any record. It is a pure read-only query" — directly contradicted by the fourth bullet describing the lazy expiry side-effect. The F7 fix (Round 2) corrected Behavior and Feedback but left Decision points self-contradictory. Additionally, the expiry check was ordered after the verifier comparison — logically it belongs first (no point deriving a verifier for an already-expired credential). Fixed: removed the "pure read-only query" bullet; moved expiry check before verifier comparison; expiry carve-out now clearly scoped as a housekeeping side-effect that does not constitute substantive state modification.

Round 3 closed. One finding; resolved in-pattern; none deferred. Baseline complete (Rounds 1–3). Proceeding to Final Critique.

---

**Final Critique 4 (Super Torvalds).**

One foundational finding; one refining finding.

**Final Critique 1 — Missing "Expiry absorbing" invariant (foundational, fixed in-pattern).** Invariant 4 (Revocation absorbing) explicitly stated that a `Revoked` credential never produces `verified` via that record. The analogous property for `Expired` was only implicitly derivable — by chaining Invariant 2 (active uniqueness) + Invariant 5 (terminal absorbing for transitions) + Decision points logic. The asymmetry with Invariant 4 is a structural gap: a reader auditing the invariant set sees "Revocation absorbing" and correctly asks where the expiry analog is. Fixed: added Invariant 11 — "Expiry absorbing" — mirroring Invariant 4's language. Updated the closing property summary paragraph to include Invariant 11 in the *terminal finality* cluster. Note: Invariant 11 is a runtime invariant enforceable by the implementation; like Invariant 3 (sole-holder verification), it cannot be verified from records alone, and accordingly no additional Generation acceptance check was added. The existing check 6 (terminal state finality) is the closest auditable proxy.

**Final Critique 2 — Generation acceptance has no check for Invariant 1 (registration immutability) (refining, documented, not blocking).** The six-check Generation acceptance covers Invariants 2, 5, 7, 8, 9, 10 but has no check corresponding to Invariant 1 (non-status fields — `credential_id`, `principal_ref`, `credential_type`, `verifier`, `registered_at` — never change post-creation). An immutability check is only expressible from the store schema (no UPDATE surface permitted) or from an audit log of write operations, not from records alone. Because the Generation acceptance is scoped to what an auditor can verify from the record store alone, this gap is not closeable within that scope. Leaving as a noted observation: deployments should constrain the credential store schema to prevent UPDATE operations on non-status fields; this is a store-design requirement, not a record-content check.

Final Critique 4 closed clean. Foundational findings: zero remaining. Refining findings: one (Final Critique 2), documented, not blocking. Credential is `grounded on Final Critique 4`.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 2 (active uniqueness under concurrent `register`) is interleaving safety; Invariant 7 (rotation-chain reconstructable to a terminal) is a reachability property. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`credential.tla`](./credential.tla) + config [`credential.cfg`](./credential.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* one `(principal, type)` pair with up to `MaxC = 3` credential slots {none, Active, Rotated, Revoked, Expired}; the load-bearing **Invariant 2** (active uniqueness — at most one Active credential for the pair) under every interleaving of atomic `register`, atomic `rotate`, `revoke`, and `expire`. Exhaustive: 105 states, holds. Rotate atomicity (prior→Rotated, successor→Active in one step) is what holds uniqueness *through* a rotation. *Buggy twin* [`credential-buggy.tla`](./credential-buggy.tla) splits `register` into a non-atomic check-then-commit (the `duplicate-active-credential` TOCTOU); rejected at 33 states (two registers both observe `ActiveCount = 0`, both commit → two Active). *Out of model scope:* id discipline, verify/material derivation, `expires_at` clock arithmetic (Expired modeled as a nondeterministic transition). *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**Formal model — Inv 7 extension — 2026-06-04: rotation-chain integrity coverage GAP closed.** Extended [`credential.tla`](./credential.tla) to cover **Invariant 7** (rotation-chain integrity), the second formal-layer vote load-bearing claim. *Change:* added `successor` variable (`1..MaxC -> 0..MaxC`; 0 = null), assigned in `Init` (all zeros); `RotateAtomic` now sets `successor[k] = m` when it transitions slot `k` to Rotated and slot `m` to Active; `RegisterAtomic`, `Revoke`, and `Expire` leave `successor` unchanged. *New invariant:* `Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0` — every Rotated slot has a non-null successor link. The same-`(principal_ref, credential_type)` clause of Invariant 7 holds by-construction: the model scopes all slots to one fixed pair, so no link can reference a different pair; this is recorded honestly in `tools/harness/coverage/credential.md`. *State count:* 138 states at `MaxC = 3` (up from 105; the increase reflects the `successor` dimension added to the state space). Invariants hold. *Buggy twins — two isolated (2026-06-04):* each load-bearing invariant carries its own dedicated, checker-rejected twin, so neither counterexample masks the other. A single combined twin would surface only the shorter violation — the Inv 7 counterexample at 5 states would mask the Inv 2 counterexample at 33 states, leaving Inv 2 with no demonstrated rejection in `audit.mjs` (this is the isolated-twin discipline applied to Legal Hold, Provisional Commitment, and Capacity Constraint on the same date). [`credential-buggy.tla`](./credential-buggy.tla) targets **Invariant 7**: `RotateAtomic_Buggy` transitions a slot to Rotated without writing the successor link (a dangling chain); `register` stays atomic, so `Inv_ActiveUniqueness` still holds (verified: holds at 105 states when checked alone) and the rejection is isolated to `Inv_RotationChain` (violated at 5 states). [`credential-buggy-toctou.tla`](./credential-buggy-toctou.tla) targets **Invariant 2**: `register` is split into a non-atomic check-then-commit (the `duplicate-active-credential` TOCTOU — two registers both observe `ActiveCount = 0` and both commit); `rotate` stays atomic and sets the successor link, so `Inv_RotationChain` still holds (verified: holds at 233 states when checked alone) and the rejection is isolated to `Inv_ActiveUniqueness` (violated at 33 states). Both twins are auto-discovered and required-to-reject by `audit.mjs`. *Saturation note:* state count grows with `MaxC` (138 at 3; 1089 at 4; 10008 at 5) — this is expected for a slot-parametric model where each additional slot opens new reachable status/successor combinations. The claim is fully exercised at `MaxC = 3` (two rotations possible in a 3-slot chain); bound is deliberate, not arbitrary. *Conflict-protocol outcome:* none — model corroborates the English; no spec change.

---

**Scheduled rescan — 2026-06-10 (council-run; the first rescan under the automated-executor convention).** Selected by risk-weighted ordering: oldest rescan date in the corpus (2026-05-19, Final Critique 4) with the highest composition fan-in (5 — Login, External Onboarding, Privileged Access Provisioning, Authenticated Actor, Actor Suspension). Council formula: one agent per pass per round — Pass 1 / Pass 2 `claude-sonnet-4-6` (constituent and peer-spec verification permitted), Pass 3 `claude-opus-4-8` in strict fresh-reader mode (pass question sets + this spec, nothing else); finding triage and folds by the conducting session (`claude-fable-5`). Five rounds to a clean close:

- *Round 1.* Pass 1: two reported stale-C-number findings **rejected in triage** as false positives — the agent validated composition numbers against `nav_order` front-matter instead of the ROADMAP SSOT (Customer Onboarding and External Onboarding are correct); the triage lesson (verify against the roadmap, not nav_order) was folded into subsequent council prompts. Pass 2: clean. Pass 3 (fresh-reader): eight findings, all triaged *refining*, all folded — constant-time verifier comparison named as an obligation at `verify`; unrecognized `credential_type` → `invalid-request` stated at `register`'s Decision points (was edge-case-only); string input policy added (byte-exact equality for the `(principal_ref, credential_type)` uniqueness key — the most material finding, since a whitespace-variant type could otherwise defeat Invariant 2's intent — whitespace-only = empty, deployment length caps); `now` declared an injected input per the Logic Confinement Principle; lazy-expiry write specified as a guarded compare-and-set, best-effort, crash-harmless; Invariant 11 now cites the expiry-check-before-comparison ordering as its load-bearing mechanism; the Authenticated Actor bullet updated — the three cross-atom invariants are specified in Authenticated Actor, with CORNERS.md kept as the historical origin; the NIST 800-63B correspondence narrowed to verifier-storage/lifecycle requirements, authenticator-strength explicitly disclaimed.
- *Round 2.* Pass 1: one refining finding folded (Session-Gated Authorization cross-reference linked). Pass 2 / Pass 3: clean.
- *Round 3* (Pass 3 only completed; Pass 1/2 were aborted by an environment session limit and re-ran as Round 4): one refining finding folded — the terminal-transition fields (`rotated_at`, `successor_credential_id`, `revoked_at`, `revoked_by_ref`, `revocation_reason`) made explicitly **write-once** in Invariants 1 and 6, closing the audit-chain-rewrite hole the prose's "immutable once set" had left off the invariant surface.
- *Round 4.* Pass 1: one refining finding folded (a redundant self-referential "Authentication" retirement bullet removed from Composition notes; the retirement record lives in this Lineage section). Pass 2 / Pass 3: clean.
- *Round 5.* Clean across all three passes — round closed; `grounded` retained; Status rescan date bumped to 2026-06-10.

*Formal-layer portion (vote-yes):* `credential.tla` re-run green in `tools/harness/` (138 states, all invariants hold); both isolated twins still rejected (`credential-buggy.tla` at 5 states, `credential-buggy-toctou.tla` at 33). Bound-saturation bump: `MaxC` 3→4, invariants hold at 1,089 states (headroom confirmed; the slot-parametric model has no flat saturation point by design). Coverage matrix updated: [`tools/harness/coverage/credential.md`](../tools/harness/coverage/credential.md) — verdicts unchanged, no GAP rows; the rescan's prose changes add no new load-bearing temporal claim. *Measured cost (cost-model data point):* 13 council-agent invocations (8 Sonnet, 5 Opus) across 5 rounds, ≈850k subagent tokens; also recorded in `ai-usage-log.md`.

---

**Execution/render-time refactor — 2026-06-21 (touch-triggered; status downgraded to `partially resolved`).** Direction (Scott): *derive expiry at read time; reduce execution-time clock dependence; clearly mark the residual.* This atom is a clock-gated atom in the corpus-wide sweep for which Invitation is the reference case. Changes:

- *Stored `Expired` removed; expiry derived.* Stored states are now `Active`, `Rotated`, `Revoked` (the two stored terminals are `Rotated` and `Revoked`). `Expired` is a derived `effective_status` projection — `Expired ⟺ status = Active ∧ expires_at` is non-null `∧ now ≥ expires_at` — computed at read time from the immutable `expires_at` and the injected clock. New **Invariant 12**. The "clock advance past `expires_at` → `Expired`" transition is gone. Applies the "derive the idealization, do not lag it with a flag" pitfall ([`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls) to the canonical English.
- *Lazy-expiry writes removed entirely.* The lazy `Expired` transition at the next `verify`/`rotate`/`revoke` (Round 1 F4 / Round 2 F6 / the Behavior carve-out / Flow step 5 / the Decision-points clauses) is removed: no write fires on expiry. There is no `expired_at` field and no `expire` action. A `verify` against a lapsed credential returns `failed-verification(no-active-credential)` by derivation; `rotate` returns `not-active`; `revoke` returns `already-terminal` — each by derivation against the injected `now`, writing nothing.
- *Single-Active → single-**effective-Active** (the load-bearing nuance of this refactor).* With expiry derived, "Active" for the uniqueness rule (Invariant 2) now means *effective-Active* = stored `Active` **and** `now < expires_at`. A stored-`Active`-but-lapsed credential does **not** occupy the Active slot, so `register`/`rotate` evaluate the uniqueness guard against effective-Active (reading the injected `now`), and a fresh `register` is admitted against a pair whose only stored-`Active` record has lapsed. This is stated explicitly in the blockquote, Summary, State (a dedicated *Effective-Active* paragraph), Decision points (`register`'s effective-Active uniqueness guard and a Logic-confinement note), Behavior, and Invariant 2 — it is the one place a careless reader would otherwise reintroduce a TOCTOU bug, so it is called out repeatedly.
- *Clock injected at the seam (pipeline-implicit).* `now` (the pipeline's `clock_t`) is injected by the contract at the I/O seam — **not** an action parameter and **not** caller-passed — and consumed only by (a) pure expiry/effective-Active derivations in guards (no write) and (b) immutable timestamp stamps inside committed transitions (`registered_at`, `rotated_at`, `revoked_at`). The `read(filter)` surface returns each record's stored fields plus the derived `effective_status` (again projected against the seam-injected `now`). Invariant 11 reworded from "Expiry absorbing" (a stored-terminal framing) to "Expiry precludes verification (derived)," resting on the expiry-check-before-comparison ordering against the injected `now`, not on a status write. (The initial 2026-06-21 draft of this refactor threaded `now` into the action **signatures**; that was reverted on the same date — see the *Signature revert + coverage-matrix regen* sub-entry below — to keep `clock_t` pipeline-implicit per the corpus convention.)
- *Sections updated:* summary blockquote, Intent (unchanged — already scope-only), Summary, Identity model, Inputs/Outputs (+ a `read` surface with `effective_status`; stored status `Active|Rotated|Revoked`; `expired_at` removed; `now` declared a seam-injected input, **not** a signature parameter), State (stored states + *Effective-Active* definition; transitions are writes only; expiry-not-a-transition note), Decision points (Logic-confinement note; `register` effective-Active uniqueness guard; `verify`/`rotate`/`revoke` derived-expiry guards with lazy writes removed; rejection-by-derivation), Behavior (lazy-expiry carve-out replaced with derived-expiry + effective-Active bullets), Feedback (no-write-on-expiry; `effective_status` queryable), Invariants 2/3/4/5/11 reworded and 12 added, Examples (clock shown as prose context, not a call argument; new "Credential lapses (expiry, derived)" example; rejection paths and adversarial `revoke` updated), Edge cases (clock note rewritten for injected clock + derived expiry), Generation acceptance (effective-Active uniqueness, derived-expiry check added, stored-terminal-finality reworded; now seven checks). *(The signatures and Examples were re-touched on the signature revert — see the sub-entry below; the descriptions here reflect the post-revert state.)*
- *Design point — resolved (signature revert).* The initial draft threaded `now` into the action **signatures** to make injection explicit (mirroring Invitation's first cut). That deviated from the corpus convention of leaving `clock_t` pipeline-implicit, and was **resolved by reverting**: `now` is now injected at the seam and does not appear in any action signature, while the derived-expiry and effective-Active design is retained in full. See the *Signature revert + coverage-matrix regen* sub-entry below. (This was the design point the prior text had flagged for confirmation; it is no longer open.)
- *Constituent-change cascade.* Removing the stored `Expired` value and the `expire`-style lazy transition, and reworking the verify/rotate/revoke guards to effective-Active, is a **breaking** change to Credential's surface (callers can no longer rely on a stored `Expired` status or on a credential being auto-transitioned out of `Active` on expiry; expiry is now a read-time derivation). The action signatures themselves are **unchanged** from the pre-refactor shape after the signature revert — `now` stays pipeline-injected, not a parameter — so no caller needs to thread a clock argument; the surface break is semantic (derived expiry, effective-Active uniqueness), not in the parameter lists. Every composition naming `credential.md` still requires a touch-triggered re-pass: **Login** (wires `verify → verified` to `Session.issue`; its cascade invariant), **Authenticated Actor** (the three cross-atom invariants and the revocation-cascade surface), **External Onboarding** (credential registration as the final onboarding step), **Privileged Access Provisioning** (calls `Credential.verify` read-only before `request_access` step 3 and each `approve_step`/`reject_step` decision — must read the derived effective-Active/`no-active-credential` rather than a stored `Expired`), and **Actor Suspension** (names credential in its suspension/reinstatement surface). None of these were edited here (compositions are out of scope for this touch); each is flagged for its own re-pass.
- *Formal model.* `credential.tla` + both isolated buggy twins re-derived to the new shape and re-run through `tools/harness/check.mjs`. The model now carries an injected clock `now` (advances via `Tick`), a fixed `ExpiresAt`, **no stored Expired** (stored set `{none, Active, Rotated, Revoked}`), a derived `EffStatus(k, now)` / `EffActive(k, now)`, and the uniqueness invariant phrased over the derivation — `Inv_EffectiveActiveUniqueness == EffActiveCount(now) <= 1` — plus `Inv_RotationChain`, `Inv_NoStoredExpired`, and `Inv_DerivedExpiryCoherent`. `register`/`rotate`/`revoke` guard on effective-Active (reading `now`). The correct model holds (274 states, all invariants). Both twins preserve intent and isolate one invariant each: [`credential-buggy.tla`](./credential-buggy.tla) reintroduces the dangling-rotation-chain hazard (`RotateAtomic_Buggy` sets `Rotated` without the successor link → `Inv_RotationChain` violated at 6 states; sibling `Inv_EffectiveActiveUniqueness` verified to still hold at 208 states when checked alone); [`credential-buggy-toctou.tla`](./credential-buggy-toctou.tla) reintroduces the time-of-check/time-of-use hazard against the *effective-Active* guard (split `RegisterObserve`/`RegisterCommit` — two registers both observe `EffActiveCount(now) = 0` and both commit → two effective-Active, `Inv_EffectiveActiveUniqueness` violated at 46 states; sibling `Inv_RotationChain` verified to still hold at 496 states when checked alone). `.cfg` CONSTANTS: `ExpiresAt = 2`, `MaxClock = 3`, `MaxC = 3`. A trap check confirms the derivation is load-bearing, not vacuous: on the correct model, *two stored-`Active` records can coexist* (a "at most one stored-Active" trap is violated at 67 states) while `Inv_EffectiveActiveUniqueness` still holds — exactly the "a stored-Active-but-lapsed credential does not occupy the Active slot" nuance, mechanically verified. The full coverage cross-check (a matrix over Invariants 1–12) was **regenerated against this model on 2026-06-21** ([`tools/harness/coverage/credential.md`](../tools/harness/coverage/credential.md) — see the sub-entry below); the bound-saturation review is folded into it (the raw state count is **linear in `MaxClock`** because `now` is an injected clock, while the *behavior* space **saturates once `now` crosses `ExpiresAt`** — at/after the deadline every stored-`Active` slot reads `Expired` and `EffActiveCount(now)` is 0 regardless of slot count, so further ticks add no new behavior).

**Signature revert + coverage-matrix regen — 2026-06-21 (same-day continuation of the refactor; pre-gate housekeeping, no re-grounding).** Two corrections to the initial refactor draft, plus the deferred matrix regeneration:

- *Signature revert (resolves the flagged design point / Final Critique F3).* The `now` parameter was removed from every action signature — `register(principal_ref, credential_material, credential_type, expires_at?)`, `verify(principal_ref, credential_type, presented_material)`, `rotate(credential_id, new_credential_material)`, `revoke(credential_id, revoked_by_ref, reason)` — and from the `read(filter)` surface and the Examples' call sites (the clock now appears in the Examples as prose context — "at `T`" — not as a call argument). `now` is now described as **pipeline-injected at the I/O seam**, the corpus convention for `clock_t`/`id_t`, consistent with the formal model (which advances `now` only via `Tick` and never threads it through an "action" parameter). The derived-expiry design, the effective-Active uniqueness logic (Invariant 2), and the "Logic confinement (clock and id)" note are all **kept** — the note is reworded so the clock is injected at the seam and consumed by the pure effective-Active/expiry guards (`is_effective_active(record, now)` remains a pure *derivation function* taking `now`, which is correct — only the *action* signatures lose it). This resolves the design point the initial draft had flagged for confirmation (was "keep `now` in signatures, or revert?"): **reverted**. It also resolves Final Critique finding **F3** ("`now` in signatures" was flagged as an unresolved design point) — now resolved by the revert; the "flagged for confirmation" framing is removed.
- *Invariant 5 wording tightened (folds refining finding F5).* Invariant 5 now cleanly separates the two rejection mechanisms that share rejection codes: a **stored** terminal (`Rotated`/`Revoked`) rejects `rotate`/`revoke` by its stored status, whereas a lapsed stored-`Active` (derived-`Expired`) credential yields the *same* codes but for a **distinct** reason — it is excluded because it is not effective-Active (Invariants 11/12), not because it is a stored terminal. The symmetry of the codes is explicitly called out as not implying a shared mechanism.
- *Coverage matrix regenerated (resolves foundational finding F1).* [`tools/harness/coverage/credential.md`](../tools/harness/coverage/credential.md) had documented the **deleted pre-refactor model** — it listed Invariant 11 as "Expiry absorbing … by-construction via an `Expire` action" (the `Expire` action was removed), cited pre-refactor state counts (138/105/33/5/233), carried **no row for Invariant 12**, and its load-bearing-claims header named "Invariant 2 (active uniqueness)" rather than *effective-Active*. It is regenerated against the refactored `credential.tla`: rows for Invariants 1–12; **covered** rows for effective-Active uniqueness (`Inv_EffectiveActiveUniqueness`; twin `credential-buggy-toctou.tla` rejected @46), rotation-chain (`Inv_RotationChain`; twin `credential-buggy.tla` rejected @6), and Invariant 12 / no-stored-Expired (`Inv_NoStoredExpired` + `Inv_DerivedExpiryCoherent`, with the 67-state stored-Active-coexistence trap proving two stored-`Active` coexist while effective-Active uniqueness holds); corrected counts (274 correct / 208 buggy-sibling / 46 toctou / 6 buggy / 496 toctou-sibling); and a bound note recording the **linear-in-`MaxClock`** raw growth with behavior **saturating once `now ≥ ExpiresAt`**.
- *Harness re-verified (this session):* `node tools/harness/check.mjs atoms/credential.tla` → **PASS (274 states)**; `node tools/harness/check.mjs atoms/credential-buggy.tla --buggy` → **PASS** (`Inv_RotationChain` violated @6); `node tools/harness/check.mjs atoms/credential-buggy-toctou.tla --buggy` → **PASS** (`Inv_EffectiveActiveUniqueness` violated @46). Sibling-isolation and trap counts confirmed against the live model: buggy-twin sibling `Inv_EffectiveActiveUniqueness` holds @208; toctou-twin sibling `Inv_RotationChain` holds @496; the stored-Active-coexistence trap is violated @67 on the correct model while uniqueness holds. No `.tla`/`.cfg`/composition edits — the model already carried the refactored shape; this session edited only `credential.md` and the coverage matrix.

**Final Critique 5 — 2026-06-23 — clean (fresh-reader re-gate; council-run).** Closing fresh-reader Final Critique (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus at X2) over the execution/render-time refactor batch returned **zero foundational findings**. Formal model re-verified green in the harness, buggy twin(s) rejected, coverage cross-check clean (no GAP rows), bound saturated. Regrounded at Final Critique 5.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, derived-expiry discipline, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (32 terms): 5 Operations ([Register], [Verify], [Rotate], [Revoke], [Read]); 13 Fields ([Credential Id], [Principal Ref], [Credential Type], [Verifier], [Status], [Registered At], [Expires At], [Rotated At], [Successor Credential Id], [Revoked At], [Revoked By Ref], [Revocation Reason], and the derived-never-stored [Effective Status] — all "Field of: Credential", no separate Type card, mirroring the capability reference case); 4 Parameters ([Credential Material], [Presented Material], [Reason], and the seam-injected [Now]); 10 Members ([Active], [Rotated], [Revoked] stored statuses + the derived [Expired]; [Invalid Request], [Duplicate Active Credential], [Storage Failure], [Not Active], [Not Known], [Already Terminal] rejections). Survivors left backticked: the one labeled projected-contract signature per Operation; the `verify` outcome tags (`verified`, `material-mismatch`, `no-active-credential`); `new_credential_material` and the `(principal_ref, credential_type)` compound key; the `is_effective_active(...)` / `effective_status(...)` predicate definitions; `clock_t`/`id_t`; the non-existent `expire`/`expired_at`; concrete example calls, ids, and timestamps; model filenames; and dated Status/Lineage registers. (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each of its eight claims is carried by Summary/Intent/State/Invariants; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the densest Summary run-ons split into one-idea sentences, lossless. (e) **prose cut #5** — the State transition list rendered as a transition table (action / from / to / guard / stamps / result), with the rotate atomic-two-write, effective-Active precedence, terminal absorption, and derived-expiry-writes-nothing semantics kept in the prose bullets beside it. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 5 — 2026-06-23`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (32 terms); 12 invariants preserved; `.tla`/`.cfg` untouched — harness re-run green: `credential.tla` PASS (274 states), `credential-buggy.tla --buggy` rejected (`Inv_RotationChain` @6), `credential-buggy-toctou.tla --buggy` rejected (`Inv_EffectiveActiveUniqueness` @46).

</details>
