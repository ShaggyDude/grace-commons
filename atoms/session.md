---
title: Session
parent: Atomic Concepts
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


## Summary

Session answers the question "is this login still good, and for whom?" without re-checking the password on every request. When a principal (whoever has been authenticated) logs in, a session is issued: a record tying that principal to a time-limited validity window, identified by a random token the caller presents on later requests. Checking a token returns one of four clearly separated answers — valid (and for which principal, and until when), expired, revoked, or unknown. They are never lumped into a single "no," because a lapsed login, a deliberately cancelled one, and a token that never existed call for different responses. A session is stored as Active until it is deliberately cancelled (Revoked, with who/when/why recorded), which is permanent. It can also simply run out: when its window passes, the session is *shown* as expired — a status worked out on the fly by comparing the clock to the deadline, never written into the record and never a stored state. The expiry time is fixed when the session is issued and never changed. A session that needs to last longer is re-issued as a new record rather than extended in place. That keeps each session's validity window fully auditable from the record alone. This is the mechanism behind browser sessions, API (Application Programming Interface) access tokens, mobile logins, and short-lived elevated-access windows. It deliberately does not check credentials, decide what the principal may do, or run the login flow — each is a separate pattern.

*Also known as: a login session, an authenticated session, an access token, a session ticket.*

---

## Intent

Systems that authenticate principals once and then permit them to act across multiple requests for some bounded period — a browser session, an API (Application Programming Interface) access window, a mobile-client login — need a way to answer the question *"is this principal still authenticated?"* without repeating the full credential verification on every request. The answer to that question is a [Session]: a bounded-lifetime record attesting that a principal completed authentication at a specific time and that the result has not been invalidated since.

The pattern isolates that bounded-lifetime attestation from the surrounding machinery. Session does not perform credential verification — that is Credential's surface. Session does not decide what the authenticated principal may do — that is Permissions' surface. Session does not implement the login flow that sequences credential checking, multi-factor challenges, and session issuance — that is Login's surface. Session answers one structural question: *given this [Session Token], is there an active, non-expired, non-revoked [Session] for a known principal?* The answer is one of four first-class outcomes, derivable from stored records alone.

The time-bounding discipline is the atom's core structural commitment. [Expires At] is set on [Issue] from the caller-supplied [Session Duration] (or the deployment's default) and is never mutated thereafter. A [Session] that needs a longer lifetime is re-issued — a new record with a new token — not extended in place. This immutability makes every [Session]'s validity window fully auditable from the record alone: there is no need to consult a history table, an event log, or a developer's account of whether and when extensions were granted. The record says when validity ends; that field never changes.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the [Session] record and its [Status]), its own actions ([Issue], [Validate], [Revoke]), and its own operational principles (immutable expiry, expiry-is-derived, four first-class validation outcomes, revocation is absorbing). It does not implement the credential check that precedes [Issue], the permission check that follows [Validate], the multi-device token management that links sessions across devices, or the logout flow that is visible to the end user. Each is a separate composable atom or composing pattern; see Composition notes.

---

## Structure

### Identity model

Every [Session] known to the system has a **[Session Token]** — an opaque, cryptographically random, immutable, system-generated value produced by [Issue]. The token is both the [Session]'s record identity and the bearer credential the caller presents to [Validate]. Because the token is the bearer credential, its security properties matter: it must be unguessable (sufficient entropy — see Configuration) and unpredictable from any public information about the principal or the issuance time.

Two sessions for the same principal issued at different times have different tokens; there is no relationship between a [Session]'s token and any property of the principal. Tokens are not reused after a [Session] expires or is revoked.

The token-as-identity model is deliberate: it mirrors how session systems actually work (the cookie IS the session identifier) and makes [Validate] a simple lookup — the caller presents a token and the atom looks it up by that token. The alternative (a separate opaque `session_id` plus a separate [Session Token]) adds indirection without structural benefit for this atom's scope.

### Configuration

Two deployment-set parameters govern the atom; both are named here because other sections depend on them:

- **Default session duration** — the [Expires At] window applied when [Issue] is called with a null [Session Duration]. Must be configured; a session store with no duration policy is a deployment misconfiguration, and [Issue] rejects with [Invalid Request] when the default is absent (see Decision points).
- **Token entropy** — the [Session Token]'s random material must come from a cryptographically secure random source with at least 128 bits of entropy, sufficient for negligible collision probability (Invariant 7) and unguessability (Identity model). Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the random material is an **injected input** to [Issue] — supplied by the deployment's entropy source at the seam, never generated inside the core transition — so the transition remains a pure function of its inputs and the entropy source remains auditable at the deployment layer.

Token format and token storage security (raw vs. hashed at rest) remain deployment-configuration concepts; see Edge cases.

### Inputs and Outputs

**Actions:** Every action receives the current clock reading [Now] as a **pipeline-injected input** (the pipeline's `clock_t`, supplied at the I/O seam — not read inside the transition, not trusted from the caller, and not shown as a signature parameter). [Now] is consumed for two clearly separated purposes: stamping immutable timestamps on a write (execution time), and evaluating the pure expiry derivation in [Validate] (no write). See the Logic-confinement note in Decision points.

- [Issue] — record a new [Session] for a principal and return its [Session Token]. (Projected contract: `issue(principal_ref, issued_by_ref, session_duration) → session_token | rejected(invalid-request | storage-failure)`.)
- [Validate] — answer, by token, whether there is a live [Session]. (Projected contract: `validate(session_token) → valid(principal_ref, expires_at) | invalid(expired | revoked | not-known)`.)
- [Revoke] — explicitly cancel a [Session], with attribution. (Projected contract: `revoke(session_token, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-terminal | not-known | storage-failure)`.)

There is **no `expire` action**. A lapsed [Session] needs no write to be treated as expired; [Validate] derives the lapsed condition from the stored record and the injected [Now], and the read surface below surfaces it as [Effective Status]. The stored [Status] is only ever [Active] or [Revoked].

**Read surface (render time):**

- [Read] — return the matching [Session] records, each carrying its derived [Effective Status]. (Projected contract: `read(filter) → records`.) Each returned record carries its stored fields plus a derived **[Effective Status]**: [Expired] when `[Status] = [Active] ∧ [Now] ≥ [Expires At]`, otherwise the stored [Status]. [Effective Status] is a pure projection over the record and the injected [Now]; it is never stored. This is the predicate every liveness query must apply — a raw [Active] with [Expires At] in the past is a lapsed [Session], not a live one.

**Inputs:**

- [Principal Ref] — an opaque reference to the principal for whom the [Session] is being issued. The atom treats this as opaque; it does not validate that the principal exists in any registry or that they were actually authenticated. The caller (the Login composition, or whatever issues sessions) is responsible for ensuring [Issue] is called only after successful authentication.
- [Issued By Ref] — an opaque reference to the mechanism that issued the [Session] (e.g., a Login service, an SSO (Single Sign-On) system, an administrative process). Recorded as an immutable property of the [Session]. Non-null and non-empty required.
- [Session Duration] — a duration value (in seconds, or a deployment-standard unit) specifying how long the [Session] should be valid. If null, the deployment's default session duration applies. Must be a positive value; zero or negative is rejected as [Invalid Request].
- [Session Token] — the bearer credential the caller presents to [Validate] and [Revoke]. Produced by [Issue]; presented by the caller on subsequent calls.
- [Revoked By Ref] — an opaque reference to the actor or mechanism performing the revocation. Recorded as an immutable property of the revocation event. Non-null and non-empty required.
- [Reason] — a caller-supplied reason string for the revocation. Recorded as an immutable property of the revocation event (under [Revocation Reason]). Non-null and non-empty required.
- [Now] — the injected clock reading (`clock_t`), supplied by the pipeline at the I/O seam on every action. It is **not** caller-trusted, is **not** read inside any transition, and is **not** shown as an action signature parameter (it is pipeline-implicit). It is used only to stamp immutable write timestamps (execution time — [Issued At], [Revoked At]) and to evaluate the pure expiry derivation in [Validate] and in [Read]'s [Effective Status] projection (no write).

**String input policy (applies to every string input above).** Values are treated byte-exact: no trimming, no Unicode normalization, no case folding is applied before storage or comparison — equality (including the [Principal Ref] query surface in Feedback) is byte-for-byte. A whitespace-only string counts as empty and is rejected wherever non-empty is required. The deployment sets a maximum length per string input; a value exceeding it is rejected as [Invalid Request]. The opaque references ([Principal Ref], [Issued By Ref], [Revoked By Ref]) are caller-supplied identifiers — byte-exactness means callers own canonicalization; two refs differing only in case or normalization form are two distinct principals to this atom.

**Outputs:**

- The current set of [Session] records. For each: [Session Token], [Principal Ref], [Issued By Ref], [Issued At], [Expires At], [Status] (the stored status: [Active] or [Revoked]), [Revoked At] (nullable), [Revoked By Ref] (nullable), [Revocation Reason] (nullable), and the derived [Effective Status] (the stored [Status], except [Expired] when `[Status] = [Active] ∧ [Now] ≥ [Expires At]`). There is **no `expired_at` field**: expiry is derived at read time, never stamped, so there is no stored expiry timestamp to keep consistent.
- [Issue] returns a new [Session Token] on success, or a rejection naming the failed precondition.
- [Validate] returns [Valid] (carrying [Principal Ref] and [Expires At]) or an invalid result naming its reason. No state change — including no write when the [Session] has lapsed; [Invalid Expired] is derived from the stored [Active] record and the injected [Now].
- [Revoke] returns [Revoked] on success, or a rejection.

### State

Each [Session] record carries a stored [Status] field. The state machine has one non-terminal stored state and one **stored** terminal state; [Expired] is a third status that is **derived, never stored**:

- **[Active]** — the [Session] has been issued and may be validated. [Validate] derives expiry and returns [Valid] or [Invalid Expired] depending on the injected [Now] vs. the immutable [Expires At]. The only non-terminal stored state.
- **[Revoked]** — explicitly revoked. The [Session] can no longer be validated as [Valid]. Stored terminal.
- **[Expired]** *(derived — never stored)* — a still-[Active] record whose window has lapsed (`[Now] ≥ [Expires At]`). Computed at read time by the [Effective Status] projection from the immutable [Expires At] and the injected clock; no transition fires and no field is written when a [Session] lapses.

Transitions — writes only; every write below stamps its timestamp from the pipeline-injected [Now], and no transition reads the clock internally. Expiry is listed for contrast: it is not a transition and writes nothing.

| action | from (stored) | to (stored) | guard | stamps | result | rejections |
|--------|---------------|-------------|-------|--------|--------|-----------|
| [Issue] | *(no record)* | **[Active]** | — | fresh [Session Token]; [Principal Ref]; [Issued By Ref]; [Issued At] = [Now]; [Expires At] = [Now] + [Session Duration] | the new [Session Token] | [Invalid Request]; [Storage Failure] |
| [Revoke] | [Active] | **[Revoked]** | — | [Revoked At] = [Now]; [Revoked By Ref]; [Revocation Reason] | [Revoked] | [Not Known]; [Already Terminal]; [Invalid Request]; [Storage Failure] |
| *expiry (derived — not a transition)* | [Active] | *[Active]* (unchanged) | [Now] ≥ [Expires At] | **nothing written** | *shown* [Expired]; [Validate] returns [Invalid Expired] | — |

Four semantics the cells cannot hold:

- *Expiry is derived, never written.* When `[Now] ≥ [Expires At]`, a still-[Active] record is *shown* as [Expired] by [Read]'s [Effective Status] projection and [Validate] returns [Invalid Expired] — but **no record is written**, no scheduler is required, and there is no `expire` action. This is the "derive the idealization, do not lag it with a stored flag" discipline: the lapsed state is computed from [Expires At] and the clock, not remembered. It is the one row in the table whose "to" column is unchanged and whose "stamps" column is empty by design (Invariant 12).
- *The stored terminal is absorbing.* There are no transitions out of [Revoked]; the atom has no `un-revoke` or `reactivate` surface. A [Revoke] on a stored-terminal ([Revoked]) [Session] is rejected [Already Terminal] (Invariant 5).
- *A lapsed [Session] is not a stored terminal, so it may still be revoked.* The only stored terminal that blocks [Revoke] is [Revoked]; a still-[Active] record past its [Expires At] reads [Expired] by derivation but remains revocable, so a deployment may record attributed closure (who/when/why) of a lapsed [Session]. See Behavior.
- *Rejection priority is fixed.* [Revoke]'s order is [Not Known] → [Already Terminal] → [Invalid Request] → [Storage Failure]; [Issue]'s is [Invalid Request] → [Storage Failure]. The full per-action preconditions are in Decision points.

Each [Session] record carries:

- **[Session Token]** — opaque, cryptographically random, immutable, system-generated. Set on [Issue]. Never changes.
- **[Principal Ref]** — opaque reference to the authenticated principal. Set on [Issue]. Never changes.
- **[Issued By Ref]** — opaque reference to the issuing mechanism. Set on [Issue]. Never changes.
- **[Issued At]** — wall-time when [Issue] was called. Immutable.
- **[Expires At]** — the time at which this [Session] expires. Set on [Issue] as `[Issued At] + [Session Duration]`. Never changes. Never null — every [Session] has a finite lifetime. It is the sole stored input the expiry derivation needs.
- **[Status]** — the **stored** status: [Active] | [Revoked]. Set to [Active] on [Issue]; transitions to [Revoked] via [Revoke], and never returns to [Active] once terminal. The derived [Expired] is *not* a value of this field — it appears only in the [Effective Status] read projection.
- **[Revoked At]** — set when [Status] transitions to [Revoked]. Null otherwise. Immutable once set.
- **[Revoked By Ref]** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **[Revocation Reason]** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Principal completes authentication.** The composing Login pattern calls [Issue]. The atom creates the [Session] record and returns the token. Login delivers the token to the caller (typically as a cookie or Authorization header value).
2. **Principal makes a subsequent request.** The caller presents the [Session Token]. The composing pattern calls [Validate]. If [Valid] is returned, the composing pattern proceeds with the [Principal Ref] as the authenticated identity. If an invalid result is returned, the composing pattern redirects to re-authentication.
3. **[Session] window lapses (expiry, derived).** The deadline passes without revocation. No action and no write are required: a still-[Active] record now reads as [Expired] via [Read]'s [Effective Status] projection (`[Now] ≥ [Expires At]`), and the next [Validate] returns [Invalid Expired] by derivation — its guard compares the pipeline-injected [Now] to [Expires At], writing nothing. No background scheduler is needed; the record itself is untouched.
4. **Principal logs out, or an administrative action invalidates the [Session].** The composing pattern calls [Revoke]. The atom records who revoked it, when, and why, and transitions the [Session] to [Revoked]. Subsequent [Validate] calls return [Invalid Revoked].
5. **Principal re-authenticates.** The composing Login pattern issues a new [Session]: [Issue] produces a new token. The prior [Session] (revoked, or lapsed and shown [Expired]) remains in the record store as an immutable history entry.

### Decision points

**Logic confinement (clock and id).** The clock and the token are **pipeline-injected at the I/O seam** (Step 3 of the execution contract), never produced inside a transition and not shown as action signature parameters. [Now] (`clock_t`) is read once by the pipeline at the seam and consumed by the action; the [Session Token] is the injected `id_t` (the random material backing it is likewise injected — see Configuration). The expiry test is a **pure function of the stored record and the injected [Now]** — a record is lapsed exactly when `[Status] = [Active] ∧ [Now] ≥ [Expires At]` — and it **writes nothing**. The only clock *writes* are the immutable timestamp stamps inside a committed transition ([Issued At] on [Issue], [Revoked At] on [Revoke]), each set from the same injected [Now]. Expiry itself never writes; it is surfaced only by [Validate]'s derived outcome and [Read]'s [Effective Status] projection. Rejection/outcome priority for [Validate]: [Not Known] → [Invalid Revoked] → [Invalid Expired] → [Valid]. Rejection priority for [Revoke]: [Not Known] → [Already Terminal] → [Invalid Request] → [Storage Failure].

**At [Issue]:**
- [Principal Ref] and [Issued By Ref] must be non-null and non-empty; otherwise [Invalid Request].
- [Session Duration] must be positive if supplied; null uses the deployment default. A zero or negative value returns [Invalid Request].
- The deployment default session duration must be configured; if absent, [Issue] returns [Invalid Request]. (A session store with no duration policy is a deployment misconfiguration, not a valid operating state.)
- [Expires At] is computed as `[Issued At] + [Session Duration]` from the injected [Now] (`[Issued At] = [Now]`). This computation happens once, at issue time, and the result is stored as an immutable field. The atom never re-derives [Expires At] from any later clock reading.
- If the store write fails, [Storage Failure] is returned with no partial record in the store.

**At [Validate]** — the outcome is decided in strict precedence order; the first row whose condition holds is the outcome, and [Validate] writes nothing on any row:

| # | Outcome | Condition (checked in this order) | Carries / note |
|---|---------|-----------------------------------|----------------|
| i | [Not Known] | the [Session Token] references no record | a lookup miss, structurally distinct from a validation failure on a known [Session] |
| ii | [Invalid Revoked] | the record's stored [Status] is [Revoked] | returned regardless of whether [Expires At] is still in the future — revocation takes precedence over expiry |
| iii | [Invalid Expired] | the record is stored-[Active] and `[Now] ≥ [Expires At]` | reached **by derivation, with no write** — never a stored status |
| iv | [Valid] | the record is stored-[Active] and `[Now] < [Expires At]` | carries [Principal Ref] and [Expires At] |

Three semantics the cells cannot hold:

- *The order is load-bearing, not an optimization.* The [Active] guard (rows iii–iv) is consulted only *after* the [Revoked] check (row ii), so a revoked-and-past-deadline [Session] returns [Invalid Revoked], never [Invalid Expired]. An implementation must **not** short-circuit on the cheap `[Now] ≥ [Expires At]` numeric test before consulting [Status]; the precedence is structural (Invariant 3), not a performance hint.
- *The expiry boundary is exact, and the lapsed condition is derived.* [Valid] holds strictly while `[Now] < [Expires At]`; at `[Now] = [Expires At]` and beyond, row iii fires. [Invalid Expired] is computed from the immutable [Expires At] against the injected [Now] — it is the [Effective Status] projection, not a stored flag, so no field is written when the boundary is crossed.
- *[Validate] is a pure read on every row.* It modifies no record under any path — including when the [Session] has lapsed (the lapsed condition is derived, not stamped). It increments no counter, touches no field, and produces no side effect.

**At [Revoke]:**
- [Session Token] must reference a known record; otherwise [Not Known].
- The referenced [Session]'s stored [Status] must be [Active]; otherwise [Already Terminal]. The only stored terminal is [Revoked], so this rejects a re-revoke. A [Session] whose window has lapsed is **not** a stored terminal — it is still stored [Active] and reads [Expired] by derivation — so [Revoke] on a lapsed [Session] is permitted and writes [Revoked] (revocation is a deliberate, attributed act the deployment may want recorded even past the deadline; see Behavior). A caller wishing to end a still-live [Session] *before* its window lapses calls [Revoke] while `[Now] < [Expires At]`.
- [Revoked By Ref] and [Reason] must be non-null and non-empty; otherwise [Invalid Request]. Revocation without attribution and a stated reason is a compliance process violation; the atom enforces the constraint at call time.
- The transition to [Revoked] and the writes of `[Revoked At] = [Now]`, [Revoked By Ref], and [Revocation Reason] are atomic. If the store write fails, [Storage Failure] is returned with no state change committed.

*(There is no `expire` action: a lapsed [Session] requires no write to be treated as expired — see the expiry derivation in [Validate] above and [Read]'s [Effective Status] projection.)*

### Behavior

- **[Validate] is a pure read — no exception.** The atom updates no counter, touches no field, and produces no side effect as a result of [Validate], including when the [Session] has lapsed: [Invalid Expired] is *derived* from the stored [Active] record and the injected [Now], never accompanied by a write. There is no lazy [Expired] transition because there is no stored [Expired] to transition to.
- **Expiry is derived, not written; [Status] is not the liveness authority.** When `[Now] ≥ [Expires At]`, a still-[Active] [Session] is *shown* [Expired] by [Read]'s [Effective Status] projection and [Validate] returns [Invalid Expired] — but **no record is written**, there is no `expired_at` field, and there is no `expire` action. Every validity determination derives from the timestamps ([Expires At], [Revoked At]) against the injected [Now], never from stored [Status] alone: a stored [Active] does **not** imply non-expired. Any query for live sessions (including the administrative queries in Feedback and the auditor reconstruction in Generation acceptance) must apply the derived predicate `[Status] = [Active] AND [Now] < [Expires At]`; a raw stored [Active] with [Expires At] in the past is a lapsed (derived-[Expired]) [Session], not a live one. This is the "derive the idealization, do not lag it with a flag" discipline (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls): the clock that decides expiry is the injected [Now], consumed by a pure derivation, never read inside a transition and never lagging behind a stored flag.
- **[Now] is pipeline-injected at the seam, not a signature parameter.** Every action receives [Now] (the pipeline's `clock_t`) injected at the I/O seam — per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the core transition never reads a wall clock internally, so each transition is a pure function of (record state, inputs, [Now]). The injected [Now] is consumed only by (a) the pure expiry derivation in [Validate] and [Read] (no write) and (b) the immutable timestamp stamps inside a committed transition ([Issued At], [Revoked At]). Clock quality — honesty, monotonicity, skew — is handled at the deployment layer (see Edge cases), but clock *access* is structurally confined to the seam.
- **Expiry timestamp immutability is absolute.** No action the atom exposes can change [Expires At]. Extending a [Session] requires calling [Issue] again, which produces a new record with a new token. The old record remains in the store. A composing system that wants to refresh a [Session] must issue a new one and deliver the new token to the caller; the old token becomes independently invalid at its own [Expires At].
- **Revocation precedes expiry in validation logic.** A [Session] that was revoked before its [Expires At] returns [Invalid Revoked], not [Invalid Expired], even if both conditions hold at validate time. The distinction matters operationally: a revoked [Session] implies a deliberate decision (logout, compromise response, administrative action); a lapsed (derived-[Expired]) [Session] implies normal end-of-life. The composing system may take different actions in each case. The precedence is structural — [Validate] consults the stored [Status] (the only stored terminal is [Revoked]) before deriving expiry from the clock.
- **A lapsed [Session] may still be revoked.** Because the lapsed condition is *derived* and not a stored terminal, a still-[Active] record past its [Expires At] is not closed to [Revoke]: the only stored terminal that blocks [Revoke] is [Revoked]. A deployment that wants an attributed record (who/when/why) of closing a [Session] that had already lapsed may call [Revoke] on it; the write succeeds and stamps [Revoked At] from the injected [Now]. This differs from the prior stored-[Expired] design, where a past-deadline [Session] was treated as already-terminal for [Revoke].
- **[Issue] makes no authentication judgment.** The atom issues a [Session] for whatever [Principal Ref] it is given. It does not verify that the principal was actually authenticated, that a valid credential exists, or that any upstream check was performed. That responsibility belongs entirely to the caller. An implementation that calls [Issue] without first verifying a credential has a process error that the atom cannot detect or prevent — it is the Login composition's wiring that ensures [Issue] is called only after `Credential.verify` returns `verified`.
- **Revocation attribution is mandatory and immutable.** [Revoked By Ref] and [Revocation Reason] are required inputs to [Revoke]; null or empty values are rejected. Once written, they do not change. An auditor reading the [Session] record after revocation can determine who revoked the [Session] and why without consulting any external system.

### Feedback

Each successful action produces an observable, measurable change:

- After [Issue] — a new [Session] record appears in [Active] status with a fresh [Session Token], the supplied [Principal Ref] and [Issued By Ref], [Issued At], and [Expires At]. Total record count increases by one. The token is returned to the caller.
- After [Validate] — no state change under any path. Returns [Valid] or an invalid result naming its reason.
- After [Revoke] — the target [Session]'s [Status] transitions to [Revoked]; [Revoked At], [Revoked By Ref], and [Revocation Reason] are set.
- On expiry — **no change**: when `[Now] ≥ [Expires At]`, a still-[Active] record's [Effective Status] reads [Expired] and [Validate] returns [Invalid Expired], but no field is written, the record count does not change, and no transition fires. Expiry is observable only through [Validate]'s derived outcome and [Read]'s [Effective Status] projection, never through a write.

Rejected actions produce named rejection codes observable to the caller: [Invalid Request], [Storage Failure], [Not Known], [Already Terminal]. [Validate]'s four outcomes ([Valid], [Invalid Expired], [Invalid Revoked], [Not Known]) are first-class results, not rejections — they are the normal vocabulary of a validation query, each carrying distinct operational meaning; [Invalid Expired] is reached by derivation, with no write.

The session store is queryable. Per-record fields (all fields except the deployment's internal token storage format), and each record's derived [Effective Status], are observable to authorized administrative surfaces. Composing patterns may query sessions by [Principal Ref] (applying the derived live predicate `[Status] = [Active] AND [Now] < [Expires At]`) to support "show all active sessions for this account" and "revoke all sessions for this account" administrative operations.

### Invariants

**Invariant 1 — Issue immutability.** Once a [Session] record is created, [Session Token], [Principal Ref], [Issued By Ref], [Issued At], and [Expires At] never change. The only fields that may change after issue are the stored [Status] ([Active] → [Revoked]) and the revocation timestamp fields set when [Revoke] fires. (There is no `expired_at` field — expiry is derived, Invariant 12.)

**Invariant 2 — Expiry timestamp immutability.** [Expires At] is computed once at [Issue] time from the injected [Now] and never mutated by any action the atom exposes. The distinction it draws: [Expires At] states *when* validity ends; whether a [Session] has lapsed is *derived* from [Expires At] against the injected clock (Invariant 12), never recorded as a stored status change.

**Invariant 3 — Validity bound conjunctive (by derivation).** A [Validate] call returns [Valid] if and only if all three conditions hold simultaneously: the [Session Token] references a known record, the stored [Status] is [Active] (i.e. not [Revoked]), and `[Now] < [Expires At]`. The third conjunct is a **read-time derivation** over the immutable [Expires At] and the injected [Now], not a stored flag. Any single condition failing produces an invalid result. The conditions are checked in this order: [Not Known] first (lookup miss), then revoked (stored [Revoked] takes precedence), then expired (derived from `[Now] ≥ [Expires At]`), then valid.

**Invariant 4 — Revocation absorbing.** Once a [Session]'s stored [Status] is [Revoked], no subsequent [Validate] call for that token returns [Valid]. Because the stored terminal is absorbing (Invariant 5), a revoked [Session] cannot be un-revoked. The [Invalid Revoked] outcome is permanent for a given token.

**Invariant 5 — Stored terminal absorbing.** The only stored terminal is [Revoked]; a [Session] in [Revoked] status admits no further state transitions. [Revoke] on a stored-terminal ([Revoked]) [Session] returns [Already Terminal]. ([Expired] is not a stored state and so is not subject to this invariant — it is derived, Invariant 12; a lapsed but still-stored-[Active] [Session] may still be revoked, see Behavior.)

**Invariant 6 — Four structurally distinct validate outcomes.** [Valid] (carrying [Principal Ref] and [Expires At]), [Invalid Expired], [Invalid Revoked], and [Not Known] are always structurally distinct result values. No implementation may collapse [Invalid Expired] and [Invalid Revoked] into a single invalid result, nor collapse [Not Known] with either failure case. Each outcome carries different operational meaning and must be distinguishable by the caller.

**Invariant 7 — Session token uniqueness.** No two [Session] records share a [Session Token] across the lifetime of the system. Tokens are not reused after a [Session] lapses or is revoked. This invariant requires that the token generation mechanism produce values with negligible collision probability — see Configuration.

**Invariant 8 — Revocation attribution completeness.** Every [Session] record in [Revoked] status has non-null [Revoked At], [Revoked By Ref], and [Revocation Reason]. A [Revoked] record missing any of these fields is evidence of a process violation; the atom's [Revoke] action enforces the non-null constraint at call time.

**Invariant 9 — Session durability.** Once [Issue] returns a [Session Token], the [Session] record is durably persisted. A [Storage Failure] rejection guarantees no partial record was written. The record count is monotonically non-decreasing; the atom provides no deletion surface. Cascading deletion under a retention policy is the composing pattern's responsibility.

**Invariant 10 — Every session has a finite lifetime.** [Expires At] is never null. Every [Session] issued by this atom has a deterministic expiry time. Sessions that do not expire are not expressible; an implementation that issues sessions without an [Expires At] has violated this invariant.

**Invariant 11 — Expiry absorbing (by derivation).** Once a [Session]'s [Expires At] has passed, no subsequent [Validate] call for that token returns [Valid]. A [Session] past its [Expires At] cannot satisfy the conjunctive validity condition of Invariant 3 (which requires `[Now] < [Expires At]`), and because [Expires At] is immutable (Invariant 2) and the clock advances monotonically at the deployment layer, the derived-[Expired] outcome is permanent for a given token once [Expires At] is reached — without any stored terminal. This invariant is the expiry analog of Invariant 4 (Revocation absorbing); the asymmetry is structural — revocation is an absorbing *stored* state, expiry is an absorbing *derived* condition (Invariant 12) — and both are made explicit here so the verification surface is symmetrically stated across both paths that preclude further valid sessions.

**Invariant 12 — Expiry is derived, never written.** No [Session] record carries a stored [Expired] status or an `expired_at` field. A [Session]'s lapsed condition is the value of the pure projection `[Effective Status] = [Expired] ⟺ ([Status] = [Active] ∧ [Now] ≥ [Expires At])`, computed at read time from the immutable [Expires At] and the injected clock [Now]; this same derivation is what makes [Validate] return [Invalid Expired]. The clock is never read inside a transition, and **no write fires when a [Session] lapses**. This is what lets the stored state space be just {[Active], [Revoked]} and removes the stored-flag-that-lags-the-clock failure mode (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls). An implementation that stores [Expired], adds an `expired_at` column, or writes any field when a [Session] lapses violates this invariant.

Invariants 1, 2, and 10 together give the *temporal auditability* property — every [Session]'s validity window is fully determined from a single record with no mutable validity fields. Invariants 3, 6, and 12 give the *validation clarity* property — the outcome of any [Validate] call is unambiguous, distinguishable, and computed from the stored record and the injected clock alone. Invariants 4 and 11 give the *terminal finality* property — neither a revoked (stored) nor a lapsed (derived) [Session] can resurface as valid via any path.

---

## Examples

### Browser login — issue and validate

A user logs in via the Login composition. After successful credential verification, Login calls [Issue]: `issue(principal_ref: user_u91, issued_by_ref: login_svc_l01, session_duration: 3600) → session_token: tok_abc123` (pipeline injects `now: 2026-09-01T10:00:00Z` at the seam). The atom creates a [Session] record: `status: Active`, `issued_at: 2026-09-01T10:00:00Z` (stamped from the injected [Now]), `expires_at: 2026-09-01T11:00:00Z` (`issued_at + 3600s`). The token is delivered to the user's browser as a session cookie.

Twenty minutes later, the user requests a protected page. The host system calls [Validate]: `validate(session_token: tok_abc123) → valid(principal_ref: user_u91, expires_at: 2026-09-01T11:00:00Z)` (pipeline injects `now: 2026-09-01T10:20:00Z`). The atom finds the record, confirms stored `status = Active` and `now (10:20Z) < expires_at (11:00Z)`, and returns the result. No state changes. The host system serves the page to user_u91.

### Logout — revoke

The user clicks "Log out." The host system calls [Revoke]: `revoke(session_token: tok_abc123, revoked_by_ref: user_u91, reason: "user-initiated-logout") → revoked` (pipeline injects `now: 2026-09-01T10:45:00Z`). The atom transitions the record to [Revoked], writing `revoked_at: 2026-09-01T10:45:00Z` (stamped from the injected [Now]), `revoked_by_ref: user_u91`, `revocation_reason: "user-initiated-logout"`. The record's [Expires At] is unchanged at `2026-09-01T11:00:00Z` — that field is immutable.

If the user's browser re-presents the old cookie: `validate(session_token: tok_abc123) → invalid(revoked)` (pipeline injects `now: 2026-09-01T10:50:00Z`). The stored [Revoked] status takes precedence; the atom does not return [Invalid Expired] even though the [Session] would have lapsed naturally in 10 minutes.

### Session expiry — derived

The user closes their browser without logging out. The [Session]'s window passes at `11:00Z`. **No write occurs and no `expire` call is made** — there is no such action. At `11:30Z`, the user opens a new browser tab that still has the cookie and makes a request. The host system calls [Validate]: `validate(session_token: tok_abc123) → invalid(expired)` (pipeline injects `now: 2026-09-01T11:30:00Z`). The atom finds the record: stored `status = Active` (it was never transitioned), `expires_at = 2026-09-01T11:00:00Z`. Its guard evaluates the lapsed condition — stored `status = Active` and `now (11:30Z) ≥ expires_at (11:00Z)` — and returns [Invalid Expired] **by derivation**. Nothing is written: the record stays stored-[Active], there is no `expired_at` field, and the record count is unchanged. A [Read] of the record now reports `effective_status = Expired`. The host system redirects to re-authentication.

### Rejection paths

**[Issue] — [Invalid Request] (zero-duration):** A host system accidentally calls `issue(principal_ref: svc_s03, issued_by_ref: api_gateway_g01, session_duration: 0) → rejected(invalid-request)` (pipeline injects `now: 2026-09-01T10:00:00Z`). A zero-duration [Session] is not a valid operating state; the atom rejects it at issue time.

**[Revoke] — [Already Terminal] (re-revoke):** An incident-response script attempts to revoke a [Session] that was already revoked: `revoke(session_token: tok_abc123, revoked_by_ref: admin_a01, reason: "incident-response") → rejected(already-terminal)` (pipeline injects `now: 2026-09-01T10:50:00Z`). The stored [Status] is already [Revoked] — the only stored terminal — so the atom rejects the call; the existing [Revocation Reason] is unchanged. (A [Session] that has merely *lapsed* is **not** a stored terminal: it remains stored-[Active] and reads [Expired] by derivation, so a [Revoke] on a lapsed-but-unrevoked [Session] would *succeed* and record attribution — see Behavior. Only a prior [Revoke] blocks a later one.)

**[Validate] — [Not Known]:** A caller presents a token that was never issued (or was generated by a different system): `validate(session_token: tok_forged_xyz) → invalid(not-known)` (pipeline injects `now: 2026-09-01T10:20:00Z`). The atom finds no record for this token. This result is structurally distinct from [Invalid Revoked] — no [Session] was revoked; no [Session] exists.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A HIPAA (Health Insurance Portability and Accountability Act) compliance auditor asks *"can you prove that access to patient record PR-4411 at 14:32 UTC on 2026-10-15 was under a valid, non-revoked session?"* The auditor queries the session store for the [Session] covering `14:32Z` for the principal involved. The query finds `tok_abc123`: stored `status: Active`, `issued_at: 2026-10-15T14:00:00Z`, `expires_at: 2026-10-15T15:00:00Z`, `revoked_at: null` (it now reads `effective_status = Expired` against any post-15:00Z clock, but its *stored* status was never written). Invariant 3 (validity bound conjunctive, by derivation) is the structural answer: at `14:32Z`, the [Session] was stored-[Active] and [Expires At] had not yet passed, so [Validate] (with the pipeline injecting `now = 14:32Z`) would have returned [Valid]. The auditor can verify this from the record alone — [Issued At], [Expires At], and `revoked_at: null` against the access-time clock are sufficient; there is no stored expiry flag to corroborate, only the immutable deadline.

**Disputed access event.** A user claims *"I did not access my account at 03:15 AM on 2026-11-20 — someone else was using my session."* The investigator queries the session store for sessions belonging to the user's [Principal Ref] that were [Active] at `03:15`. The query finds `tok_abc123`: `issued_at: 2026-11-19T22:00:00Z`, `expires_at: 2026-11-20T06:00:00Z`, `issued_by_ref: login_svc_l01`. The [Session] was active at the time of the disputed access. Whether the [Session Token] was stolen (and by whom) is a separate investigation; the atom's records bound the forensic window: the [Session] was issued through the Login service at 22:00, was valid at 03:15, and was never revoked before the access occurred. The composing Login pattern's attestation records (from Actor Identity) establish who authenticated at 22:00 and what credential was verified.

**Breach investigation.** A security team discovers that session tokens were exposed in a log file. They need to know which principals are affected. The investigator queries the session store for all sessions `issued_by_ref: api_gateway_g01` between `2026-12-01T00:00:00Z` and `2026-12-03T12:00:00Z` (the exposure window). The query returns 47 sessions across 31 distinct [Principal Ref] values; reading each record's [Effective Status] against the investigation-time clock, the team sees which are still live (stored [Active] and `[Now] < [Expires At]`), which have lapsed (derived [Expired]), and which were already [Revoked]. The team calls [Revoke] — `revoke(…, revoked_by_ref: security_team_s01, reason: "log-exposure-incident-2026-12-03")` — on every not-already-revoked [Session], including any that have merely lapsed, so the closure is attributed (a lapsed [Session] is still stored-[Active] and accepts [Revoke]; see Behavior). Invariant 8 (revocation attribution completeness) ensures that an auditor reading the records six months later can reconstruct exactly which sessions were revoked, by whom, when, and why — without consulting the incident response team or their runbooks.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Credential verification.** Whether the principal was actually authenticated before [Issue] was called is entirely the caller's responsibility. The atom issues a [Session] for whatever [Principal Ref] it receives. The Login composition is the pattern that wires Credential verification to Session issuance; without that wiring, [Issue] can be called for any principal by any caller. The atom provides no guard against this.
- **Multi-factor sequencing.** Requiring that a principal present two credentials before a [Session] is issued (password then TOTP (Time-based One-Time Password); hardware key then PIN (Personal Identification Number)) is a composing-pattern concept. Login is where multi-factor sequencing is expressed. The atom sees only the final [Issue] call.
- **Session renewal and sliding windows.** The atom does not implement session renewal (extending [Expires At] by some duration on each active request). Sliding-window sessions require the composing pattern to issue a new [Session] (new token, new [Expires At]) on some renewal trigger and to invalidate the prior token. Both operations are within scope of the atom's actions; the renewal policy is the composing pattern's concept.
- **Device binding.** Whether a [Session Token] is bound to a specific device, browser fingerprint, or IP address is a composing-pattern concept. The atom stores no device information; binding a token to a device context is an additional validation step the composing system performs before calling [Validate].
- **Session concurrency limits.** Whether a principal may have N concurrent active sessions (and what happens when the limit is exceeded) is a composing-pattern concept. The atom imposes no limit on how many [Active] sessions a given [Principal Ref] may have. Enforcing a one-session-per-principal or K-sessions-per-principal rule is the composing Login pattern's obligation.
- **Logout propagation across devices.** When a user logs out on device A, ensuring their session on device B is also revoked requires the composing system to query sessions by [Principal Ref] and revoke all of them. The atom supports this via its [Principal Ref]-queryable store, but does not implement the propagation automatically.
- **Permission checking.** What the principal identified by [Validate]'s [Principal Ref] result is permitted to do is Permissions' surface. Session answers *"is this principal currently authenticated?"*; Permissions answers *"is this principal allowed to do this thing?"* Session-Gated Authorization is the composition that wires them: Permissions checks are blocked if [Validate] returns an invalid result.
- **Token format and encoding.** The atom produces an opaque [Session Token]. Whether that token is a random hex string, a UUID (Universally Unique Identifier), a JWT (JSON Web Token — a compact, signed token format carrying claims), or an opaque blob is a deployment-configuration concept. If the token is a JWT, the atom's immutability invariants take precedence over JWT's native extension claims — `exp` in a JWT must match the stored [Expires At] and the token must not be extended without re-issuance.
- **Token storage security.** Whether the [Session Token] is stored in the record store as a raw value or as a cryptographic hash (to prevent a database breach from yielding usable tokens) is a deployment-configuration concept. Storing tokens raw is simpler; storing hashed tokens (and matching presented tokens by hashing them before lookup) is more secure. Both are conformant with the atom's invariants. The choice should be documented in the composing Login pattern's configuration.
- **Clock accuracy and the injected clock.** The write timestamps [Issued At] and [Revoked At], and the computed [Expires At], are stamped from the **injected** clock [Now] (the pipeline's `clock_t`), never read inside a transition; the same injected [Now] drives the pure expiry derivation in [Validate] and [Read]'s [Effective Status]. The atom assumes a single deployment clock; whether that clock is honest, monotonic, or synchronized is a deployment concern. Trusted timestamping (RFC (Request for Comments — the internet engineering standards series) 3161) is a composing pattern for deployments that require externally verifiable timestamps. Because expiry is *derived* rather than stamped, two readers evaluating [Effective Status] (or two [Validate] calls) with slightly skewed clocks near [Expires At] may briefly disagree on whether a [Session] has lapsed — the standard read-time-derivation consequence, bounded by the deployment's clock-skew envelope and harmless because no write is at stake and revocation (the only stored terminal) is unaffected.
- **Session store tamper-evidence.** As with all atoms in the compliance cluster, the session store can be composed with Tamper Evidence for deployments requiring cryptographic proof that no session record was retroactively altered.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Session

The record this atom defines: a time-limited authenticated channel — a durable attestation that a principal was authenticated at a specific moment, queryable until the [Session] lapses or is revoked. It carries its [Session Token], [Principal Ref], [Issued By Ref], [Issued At], [Expires At], [Status], and the revocation fields; its [Expires At] is set once on [Issue] and never mutated. A [Session] that needs a longer lifetime is re-issued, never extended.

Kind: Type

#### Issue

The behavior the composing Login pattern invokes to record a new [Session] for a principal. It creates the record in [Active] with a fresh [Session Token], stamps [Issued At] and computes [Expires At] from the injected [Now] and the [Session Duration], and returns the [Session Token]. It makes no authentication judgment — it issues a [Session] for whatever [Principal Ref] it is given.

Kind: Operation

#### Validate

The read-only behavior a composing pattern invokes to answer, by [Session Token], whether there is a live [Session]. It returns one of four structurally distinct outcomes — [Valid], [Invalid Expired], [Invalid Revoked], or [Not Known] — deriving the lapsed condition from the stored record and the injected [Now]. It writes nothing under any path, including when the [Session] has lapsed.

Kind: Operation

#### Revoke

The behavior a composing pattern invokes to explicitly cancel a [Session], with attribution. It is permitted only on a stored-[Active] record; it transitions [Status] to [Revoked] and records [Revoked At], [Revoked By Ref], and [Revocation Reason]. A [Session] that has merely lapsed is still stored-[Active] and so may still be revoked; only a prior [Revoked] blocks it.

Kind: Operation

#### Read

The render-time behavior that returns the matching [Session] records, each carrying its derived [Effective Status]. It only reads; no record changes. It is the surface every liveness query applies, since a raw [Active] with [Expires At] in the past is a lapsed [Session], not a live one.

Kind: Operation

#### Session Token

The opaque, cryptographically random, immutable, system-generated value [Issue] produces — both the [Session]'s record identity and the bearer credential the caller presents to [Validate] and [Revoke]. It is the injected `id_t`; no two sessions share one, and it is not reused after a [Session] lapses or is revoked.

Kind:     Field
Field of: Session
Projects: session_token

#### Principal Ref

The opaque reference to the authenticated principal for whom the [Session] is issued. The atom treats it as opaque — it does not validate that the principal exists or was authenticated. Set on [Issue], immutable thereafter; the value [Validate] returns in a [Valid] result.

Kind:     Field
Field of: Session
Projects: principal_ref

#### Issued By Ref

The opaque reference to the mechanism that issued the [Session] (a Login service, an SSO system, an administrative process). Recorded as an immutable property of the [Session]. Set on [Issue], immutable thereafter.

Kind:     Field
Field of: Session
Projects: issued_by_ref

#### Issued At

The wall-time when [Issue] was called, stamped from the injected [Now]. Immutable thereafter. [Expires At] is computed once as `[Issued At] + [Session Duration]`.

Kind:     Field
Field of: Session
Projects: issued_at

#### Expires At

The time at which this [Session] expires — set on [Issue] as `[Issued At] + [Session Duration]`, never null, and never mutated by any action. It states *when* validity ends; whether the [Session] has lapsed is *derived* from it against the injected [Now], never recorded as a stored status change. It is the sole stored input the expiry derivation needs.

Kind:     Field
Field of: Session
Projects: expires_at

#### Status

The stored status of a [Session]: [Active] or [Revoked]. Set to [Active] on [Issue]; transitions to [Revoked] via [Revoke] and never returns to [Active]. The derived [Expired] is *not* a value of this field — it appears only in the [Effective Status] read projection.

Kind:     Field
Field of: Session
Projects: status

#### Revoked At

The wall-time the [Session]'s [Status] transitioned to [Revoked], stamped from the injected [Now]. Null until revocation; immutable once set.

Kind:     Field
Field of: Session
Projects: revoked_at

#### Revoked By Ref

The opaque reference to the actor or mechanism that performed the revocation. Required at [Revoke]; null until revocation; immutable once set.

Kind:     Field
Field of: Session
Projects: revoked_by_ref

#### Revocation Reason

The caller-supplied reason recorded for the revocation (from the [Reason] parameter). Required at [Revoke]; null until revocation; immutable once set.

Kind:     Field
Field of: Session
Projects: revocation_reason

#### Effective Status

The status [Read] attaches to each returned [Session] record: [Expired] when `[Status] = [Active] ∧ [Now] ≥ [Expires At]`, otherwise the stored [Status]. It is a pure projection over the record and the injected [Now] — **derived at read time, never stored** — and is what makes [Validate] return [Invalid Expired]. Every liveness query applies it.

Kind:     Field
Field of: Session
Projects: effective_status

#### Session Duration

The duration value [Issue] consumes to compute [Expires At] (`[Issued At] + [Session Duration]`). Supplied per call; if null, the deployment's default applies; zero or negative is rejected. It is never stored under its own name — only the computed [Expires At] is stored.

Kind:         Parameter
Parameter of: Issue
Projects:     session_duration

#### Now

The current clock reading (the pipeline's `clock_t`), pipeline-injected at the I/O seam on every action — not caller-trusted, not read inside any transition, not shown as a signature parameter. It is consumed only to stamp immutable write timestamps ([Issued At], [Revoked At]) and to evaluate the pure expiry derivation in [Validate] and [Read] (no write).

Kind:         Parameter
Parameter of: Validate
Projects:     now

#### Reason

The caller-supplied reason string [Revoke] consumes and writes into the [Session]'s [Revocation Reason]. Required non-null and non-empty. It is not stored under its own name — only [Revocation Reason] is stored.

Kind:         Parameter
Parameter of: Revoke
Projects:     reason

#### Filter

The selection a caller passes to [Read] to scope which [Session] records are returned. Consumed per call; never stored.

Kind:         Parameter
Parameter of: Read
Projects:     filter

#### Active

The only non-terminal stored state: the [Session] has been issued and may be validated. [Validate] derives expiry from the injected [Now] against the immutable [Expires At] and returns [Valid] or [Invalid Expired]. A still-[Active] record past its [Expires At] reads [Expired] by derivation but is *not* a stored terminal.

Kind:      Member
Member of: the stored status
Role:      Outcome

#### Revoked

The only stored terminal state: the [Session] was explicitly revoked. It can no longer be validated as [Valid], and admits no further transitions; a re-[Revoke] returns [Already Terminal]. Revocation takes precedence over expiry in [Validate]'s outcome vocabulary.

Kind:      Member
Member of: the stored status
Role:      Outcome

#### Expired

The derived status a lapsed [Session] reads as — **never stored**. It is the value of [Effective Status] when `[Status] = [Active] ∧ [Now] ≥ [Expires At]`, computed at read time from the immutable [Expires At] and the injected clock. No transition fires and no field is written when a [Session] lapses.

Kind:      Member
Member of: the derived effective status
Role:      Outcome

#### Valid

The [Validate] outcome when the [Session Token] references a known record that is stored-[Active] and `[Now] < [Expires At]`. It carries the [Principal Ref] and [Expires At]. It is the one outcome the conjunctive validity bound (Invariant 3) admits; any single condition failing yields an invalid result instead.

Kind:      Member
Member of: the validate outcome
Role:      Outcome
Projects:  valid

#### Invalid Expired

The [Validate] outcome when the record is stored-[Active] and `[Now] ≥ [Expires At]` — reached **by derivation, with no write**. Structurally distinct from [Invalid Revoked]; the [Active] guard is checked first so a revoked-and-past-deadline [Session] returns [Invalid Revoked], never this.

Kind:      Member
Member of: the validate outcome
Role:      Outcome
Projects:  expired

#### Invalid Revoked

The [Validate] outcome when the record's stored [Status] is [Revoked] — regardless of whether [Expires At] is still in the future. Revocation takes precedence over expiry, so this is returned even when the [Session] would also have lapsed. Permanent for a given token (Invariant 4).

Kind:      Member
Member of: the validate outcome
Role:      Outcome
Projects:  revoked

#### Not Known

The lookup-miss outcome: the supplied [Session Token] references no record. [Validate] returns it as the structurally-distinct fourth outcome (no [Session] was revoked; no [Session] exists), and [Revoke] returns it as a rejection when its target token is unknown.

Kind:      Member
Member of: the lookup-miss outcome
Role:      Outcome
Projects:  not-known

#### Invalid Request

The rejection [Issue] returns when [Principal Ref] or [Issued By Ref] is null or empty, when [Session Duration] is zero or negative, or when the deployment default duration is absent; and [Revoke] returns when [Revoked By Ref] or [Reason] is null or empty.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Already Terminal

The rejection [Revoke] returns when the target [Session]'s stored [Status] is already [Revoked] — a re-revoke. The only stored terminal is [Revoked]; a merely-lapsed [Session] is not terminal and is not rejected here.

Kind:      Member
Member of: the revoke rejection
Role:      Outcome
Projects:  already-terminal

#### Storage Failure

The rejection [Issue] or [Revoke] returns when the underlying store write fails. [Issue] leaves no partial record; [Revoke] commits no state change. The caller must treat it as definitive.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Session]: #session
[Issue]: #issue
[Validate]: #validate
[Revoke]: #revoke
[Read]: #read
[Session Token]: #session-token
[Principal Ref]: #principal-ref
[Issued By Ref]: #issued-by-ref
[Issued At]: #issued-at
[Expires At]: #expires-at
[Status]: #status
[Revoked At]: #revoked-at
[Revoked By Ref]: #revoked-by-ref
[Revocation Reason]: #revocation-reason
[Effective Status]: #effective-status
[Session Duration]: #session-duration
[Now]: #now
[Reason]: #reason
[Filter]: #filter
[Active]: #active
[Revoked]: #revoked
[Expired]: #expired
[Valid]: #valid
[Invalid Expired]: #invalid-expired
[Invalid Revoked]: #invalid-revoked
[Not Known]: #not-known
[Invalid Request]: #invalid-request
[Already Terminal]: #already-terminal
[Storage Failure]: #storage-failure

---

## Composition notes

Session is freestanding. It is named by Login and Session-Gated Authorization as a constituent atom:

- **[Credential](./credential.md)** — Credential verifies the principal's authentication material; Session persists the result. The Login composition is the wiring: a successful `Credential.verify` produces a [Issue] call. The two atoms are distinct: Credential answers *"did the right material arrive?"*; Session answers *"is this principal still within a valid authentication window?"*
- **[Actor Identity](./actor-identity.md)** — in regulated deployments, the [Issue] call may be paired with an Actor Identity [Attest](./actor-identity.md#attest) call to produce a non-repudiable record that a specific actor initiated the session. The Audit Trail substrate is where this attribution is recorded.
- **[Permissions](./permissions.md)** — Session-Gated Authorization gates every Permissions query on Session validity. The composing pattern calls [Validate] before calling any Permissions action; if [Validate] returns an invalid result, the Permissions check is skipped and the action is rejected.
- **[Audit Trail](../compositions/audit-trail.md)** — in regulated deployments, [Issue] and [Revoke] events should be recorded in the Audit Trail. The atom does not mandate this; it is the Login composition's obligation to wire session lifecycle events into the audit record.
- **[Tamper Evidence](./tamper-evidence.md)** — for regulated deployments, the session store (including the revocation attribution history) should be hash-chained and externally anchored.
- **[Login](../compositions/login.md)** — wires Credential verification to Session issuance, both attested under the verified principal. Carries the cascade invariant: revocation of the underlying Credential invalidates every Session derived from it — a property of the Login composition's emergent state, not of either constituent atom alone.
- **[Session-Gated Authorization](../compositions/session-gated-authorization.md)** — gates every Permissions check on Session validity. The pre-check fires before the Permissions call; a stale or revoked session rejects the check before Permissions is consulted.
- **[External Onboarding](../compositions/external-onboarding.md)** — registers the principal's credential during onboarding; the principal then calls [Login](../compositions/login.md) with that credential to establish their first session. External Onboarding is the identity admission gate; Login is the first-session issuance step. Session is not a constituent of External Onboarding — it enters the picture via Login in the step immediately following a successful `onboard` call.
- **[Privileged Access Provisioning](../compositions/privileged-access-provisioning.md)** — calls [Validate] (`Session.validate(session_token)`) as the first step of `exercise_access`. A non-[Valid] result — [Invalid Expired] (derived), [Invalid Revoked], or [Not Known] — blocks the access exercise before the Capability token is presented. Session is queried read-only; this composition does not issue or revoke sessions, and a lapse it observes is a derived outcome, not a write.

---

## Standards references

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63B §7 (Session Management)** — the primary standard for session management in authentication systems. Requirements for session binding, session duration, reauthentication triggers, and session termination correspond directly to this atom's behavioral commitments. The atom's [Expires At] immutability and re-issuance discipline implement 800-63B's requirement that session extensions produce new session identifiers.
- **OWASP ASVS V3 (Application Security Verification Standard — Session Management)** — the OWASP (Open Worldwide Application Security Project) verification standard for session management security. Requirements for session token randomness, expiry, revocation on logout, and protection against fixation attacks are the deployment-configuration surface of this atom.
- **RFC 6265 (HTTP State Management Mechanism)** — the cookie standard. The atom's [Session Token] is the value delivered in a `Set-Cookie` response header in browser-based deployments. The atom does not specify cookie attributes (Secure, HttpOnly, SameSite) — those are the composing pattern's configuration obligations.
- **SAML 2.0 §4.1.4 (Session Establishment and Termination)** — the SAML (Security Assertion Markup Language — an XML standard for exchanging authentication data between identity and service providers) session model maps to this atom: `AuthnStatement` issuance corresponds to [Issue]; `SessionNotOnOrAfter` corresponds to [Expires At]; `SLO` (Single Logout) corresponds to [Revoke]. The atom's re-issuance discipline aligns with SAML's prohibition on reusing assertion IDs.
- **RFC 6819 (OAuth 2.0 Threat Model and Security Considerations)** — identifies session-related threats (token theft, session fixation, CSRF — Cross-Site Request Forgery) that the deployment-configuration layer of this atom addresses. The atom's immutability and revocation invariants mitigate token theft's blast radius: a stolen token is bounded by [Expires At] and can be revoked.
- **OIDC Session Management 1.0 (OpenID Connect Session Management)** — the OpenID Connect (OIDC — an identity layer built on OAuth 2.0) session management specification. The atom's [Session Token] corresponds to an OIDC session's identifier; [Revoke] corresponds to OIDC's Front-Channel and Back-Channel Logout protocols, and natural lapse (the derived [Expired]) corresponds to a session reaching its `SessionNotOnOrAfter` bound without an explicit logout.
- **HIPAA §164.312(a)(2)(iii) (Automatic Logoff)** — the HIPAA automatic logoff requirement: electronic information systems must terminate after a period of inactivity. The atom's [Expires At] field is the structural mechanism for this requirement; the composing deployment configures the timeout.
- **PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for cardholder data) Requirement 8.6 (Session Management)** — session timeout and re-authentication requirements for payment systems. The atom's [Expires At] immutability and re-issuance discipline satisfy the structural portion of these requirements.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of keeping credential verification, session persistence, permission checking, and logout propagation as separate composable atoms rather than absorbing them here.
- **IETF (Internet Engineering Task Force) RFC 4120 (Kerberos)** — Kerberos tickets are the canonical precedent for time-bounded, revocable authentication session records. The atom's immutable [Expires At], single-stored-terminal ([Revoked]) state machine with a derived-[Expired] read projection, and revocation attribution discipline are the structured-natural-language expression of Kerberos' core concepts — a Kerberos ticket's lifetime likewise lapses by the clock against its end-time without a status write, while explicit invalidation is the recorded act.

---

## Generation acceptance

A derived implementation of Session is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the session record store (and the read-time clock the [Validate]/[Read] surfaces use), can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm that every session has a finite, immutable expiry.** For every [Session] record in the store, confirm that [Expires At] is non-null and that no record shows two different values for [Expires At] (i.e., confirm the field never changes after issue). A [Session] with a null or ever-changing [Expires At] violates Invariants 2 and 10 and is evidence of an implementation defect.
- **Confirm expiry is derived, never stored.** Confirm that **no** record carries a stored [Expired] status value or an `expired_at` field, and that no field is written when a [Session] lapses. For any stored-[Active] record, the auditor computes `[Effective Status] = [Expired] ⟺ [Now] ≥ [Expires At]` from the immutable [Expires At] and the read-time clock — reproducing exactly what [Validate] and [Read] return. Invariant 12 is the guarantee; a stored [Expired], an `expired_at` column, or any lapse-triggered write is a defect.
- **Reconstruct which sessions were active at any historical point in time.** Given a timestamp T, query all records where `issued_at <= T` and `expires_at > T` and `(revoked_at is null OR revoked_at > T)`. This is exactly the derivation [Validate] applies — the stored [Status] need not even be consulted beyond "not [Revoked] at T," because the lapsed condition is computed from [Expires At] against T, not stored. The result is the set of sessions that [Validate] would have returned [Valid] for at time T (with the pipeline injecting `now = T` at the seam). This reconstruction requires no external data beyond the session store and the clock.
- **Confirm revocation attribution completeness.** For every record with [Status] = [Revoked], confirm that [Revoked At], [Revoked By Ref], and [Revocation Reason] are all non-null and are consistent with the record's [Status]. A [Revoked] record missing any of these fields is a violation of Invariant 8 and evidence of a process violation.
- **Confirm the four validate outcomes are structurally distinct.** Inspect the implementation's [Validate] return surface and confirm that [Valid], [Invalid Expired], [Invalid Revoked], and [Not Known] are distinguishable values — not collapsed into a boolean or a single invalid code. This check may require examining the implementation's API contract rather than the record store alone; it is the behavioral commitment of Invariant 6.
- **Confirm stored terminal finality.** The only stored terminal is [Revoked]. For any record with stored [Status] = [Revoked], confirm that the [Status] field has not been changed back to [Active]. Because each [Session Token] is unique (Invariant 7), there is no "second record" to look for; the check is whether the record itself shows a stored terminal that is irrevocably set. A record whose [Status] appears as [Active] after a [Revoked] transition was recorded is evidence of an implementation defect — the stored terminal is absorbing and may not be reversed. (Lapse is not a stored terminal and so is not checked here; it is verified by the derived-expiry check above.)

This is the generator's contract: any implementation derived from this atom must produce a session store that passes all six checks above. The six checks operationalize the Intent section's structural question — *given this [Session Token], is there an active, non-expired, non-revoked [Session] for a known principal?* — as records-alone (plus read-time clock) verification. The bar is the regulator's question — *"can you prove that authenticated access to protected resources was bounded by valid, non-revoked sessions throughout?"* — not the developer's intuition.

---

## Status

`grounded on Final Critique 5 — 2026-06-23` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 5 — 2026-06-23
formal: not applicable — vote no 2026-06-03
last gate: 2026-06-23 — Final Critique 5, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/session.md`.

- **2026-06-21 — Expiry is derived at read time, never stored.** *Chose:* the stored state space is `{Active, Revoked}`; `Expired` is the projection `status = Active ∧ now ≥ expires_at` computed from the immutable `expires_at` and the injected clock (Invariant 12). *Over:* a stored `Expired` terminal written by a lazy or scheduled transition. *Because:* a stored flag lags the clock it idealizes, and a session's lapse has no side effect that would need a write to carry it.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes — SUPERSEDED by the Ledger and Decisions above; deleted with every other Lineage in the migration's closing commit</h2>
</summary>

**Conventions inherited.** This atom carries the **regulated** and **security** overlays (both derived from its composers) and includes *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`pressure-testing.md`](../pressure-testing.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

**Structural decisions made in draft.**

- *`session_token` as identity.* The token presented to `validate` is also the record's identity — there is no separate `session_id`. Rationale: this mirrors how session systems actually operate (the cookie IS the session identifier) and keeps `validate` a simple lookup. The alternative (separate session_id + session_token) adds indirection without structural benefit at the atom layer; token storage security (raw vs. hashed) is a deployment-configuration concern, not an atom-layer distinction.
- *Four structurally distinct `validate` outcomes.* `valid`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)` are never collapsed. Collapsing expired and revoked into a single `invalid` would obscure operationally distinct situations — a revoked session implies a deliberate action; an expired session implies normal end-of-life. Collapsing not-known with the failure cases would merge a lookup miss with a validation failure on a known session, losing forensic precision.
- *Revocation takes precedence over expiry in validation ordering.* A session that is both `Revoked` and past its `expires_at` returns `invalid(revoked)`, not `invalid(expired)`. Rationale: revocation is a deliberate act and should surface to the caller as such, even when the session would have expired anyway. The composing system takes a different action (e.g., clearing revocation-reason vs. simply prompting re-authentication) depending on which outcome it receives.
- *`expires_at` is never null.* Every session has a finite lifetime. The atom rejects zero-duration and null-duration sessions at issue time. Infinite sessions are not expressible. This makes "every session eventually terminates" a structural property rather than a policy aspiration.
- *`issue` makes no authentication judgment.* The atom does not validate that authentication occurred. This is intentional: the atom's job is time-bounded session management, not authentication. Ensuring `issue` is called only after authentication is the Login composition's wiring obligation. The atom trusting the caller is an explicit, defended architectural choice — not an oversight.

---

**Round 1.**

*Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).* Two findings. **F1 — `revoke` missing `storage-failure`:** `revoke` writes four fields atomically but its rejection vocabulary did not include `storage-failure`, unlike `issue`. Fixed: `storage-failure` added to `revoke` signature and Decision points. **F2 — `expire` missing `storage-failure`:** same pattern — `expire` writes `status` and `expired_at` atomically but had no `storage-failure`. Fixed: `storage-failure` added to `expire` signature and Decision points.

*Pass 2 — EOS conceptual independence.* Clean. Atom is freestanding; no other atom named in the specification body.

*Pass 3 — Linus adversarial.* Two findings. **F3 — `revoke` on a session past `expires_at` but `status` still `Active`:** If the lazy expiry transition has not yet fired, a session past `expires_at` has `status = Active`. The Decision points for `revoke` only checked `status`; a session in this state could be revoked, producing `status = Revoked` on a session that had already effectively expired. This creates the same operational ambiguity caught in Credential (F4). Fixed: `revoke` Decision points now state that a session whose `expires_at` has passed is treated as terminal — `revoke` returns `already-terminal` and may lazily transition the record to `Expired`. **F4 — `expire` allows pre-expiry calls:** Decision points only checked `status = Active`; a buggy scheduler or operator could call `expire(token)` while the session was still within its validity window, formally terminating a live session. Early termination belongs to `revoke`. Fixed: added pre-expiry check to `expire` Decision points — `now >= expires_at` is required; calls where `now < expires_at` return `invalid-request`. `invalid-request` added to `expire` signature accordingly.

Round 1 closed. Four findings; all resolved in-pattern; none deferred.

---

**Round 2.**

*Pass 1 — GRID structural.* Clean. All nine nodes consistent after Round 1 fixes.

*Pass 2 — EOS conceptual independence.* Clean. (Note: the Behavior section's `issue`-makes-no-authentication-judgment paragraph references Login and `Credential.verify` by name; these are parenthetical explanatory references placing the atom's design choice in context, not dependency declarations. The atom remains freestanding — it does not require Credential or Login to function.)

*Pass 3 — Linus adversarial.* Clean. No new findings.

Round 2 closed. Zero findings.

---

**Round 3.**

*Pass 1 — GRID structural.* Clean.

*Pass 2 — EOS conceptual independence.* Clean.

*Pass 3 — Linus adversarial.* Clean. All nine invariants consistent with updated action signatures. Validation ordering (not-known → revoked → expired → valid) correctly stated and consistent with `validate` Decision points.

Round 3 closed. Zero findings. Baseline complete (Rounds 1–3). Proceeding to Final Critique.

---

**Final Critique 4 (Super Torvalds).**

One foundational finding fixed; one refining finding fixed for wording; one refining finding noted.

**Final Critique 1 — Missing "Expiry absorbing" invariant (foundational, fixed in-pattern).** Invariant 4 (Revocation absorbing) explicitly states that a Revoked session never returns `valid` via that token. The symmetric property for Expired sessions — once `expires_at` is reached, no validate returns `valid` — was only derivable by chaining Invariant 3 (conjunctive validity bound requiring `now < expires_at`) with Invariant 5 (terminal state absorbing). The missing explicit invariant left the verification surface asymmetrically stated. Fixed: added Invariant 11 — "Expiry absorbing" — mirroring Invariant 4's language and confirming the symmetry. Updated the closing property summary paragraph to include Invariant 11 in the *terminal finality* cluster. As with Credential's Final Critique 1, Invariant 11 is a runtime invariant; it cannot be independently verified from records alone and accordingly no new Generation acceptance check was added.

**Final Critique 2 — Generation acceptance check 5 wording misleading (refining, fixed in-pattern).** Check 5 said "confirm that no subsequent record for the same `session_token` exists showing `status = Active`." But Invariant 7 guarantees `session_token` uniqueness — no two records share a token, so the check was looking for something that cannot exist by construction. The real check is whether the existing record's `status` field was reset to `Active` after a terminal transition. Fixed: rephrased to "confirm that the record's `status` field has not been changed back to `Active`," with an explicit note that terminal states are absorbing and irreversible.

**Final Critique 3 — Generation acceptance has no check for Invariant 1 (issue immutability of non-status fields) (refining, noted, not blocking).** The five-check Generation acceptance covers Invariants 2, 3 (partially), 6, 8, 9, 10 but has no check that `session_token`, `principal_ref`, `issued_by_ref`, and `issued_at` were never modified post-issue. As with Credential Final Critique 2, this is verifiable only from store schema (no UPDATE surface) rather than from record content. Not closeable as a record-store check. Noted as a store-design requirement: deployments should constrain the session store schema to prevent UPDATE operations on non-status fields.

Final Critique 4 closed clean. Foundational findings: zero remaining. Refining findings: one noted (Final Critique 3), not blocking. Session is `grounded on Final Critique 4`.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 3 (conjunctive validity with revoked-takes-precedence-over-expired) and Invariant 4 (revocation absorbing) are reachability/precedence claims — no interleaving of expire/revoke may yield `valid`. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal-layer vote — reconsidered 2026-06-03: NO (formal-not-warranted); pattern restored to `grounded`.** On a second pass the aggressive-bar YES was downgraded. Invariant 3's validity is a *conjunction of record fields* — `issued ∧ now < expires_at ∧ ¬revoked` — evaluated at query time, not an action-vs-action interleaving; `validate` cannot return `valid` for a record whose `revoked` flag is set or whose `expires_at` has passed, by direct field inspection. "Revoked precedes expired" is a precedence already fixed by insertion order in the append-only record and surfaced as the `invalid(revoked | expired | not-known)` result tag; the records carry the answer. Invariant 4 (revocation absorbing) is terminal-absorption, a structural guarantee. The interleaving that genuinely warrants a model — gating a permission check on session validity so a caller cannot interrogate permissions for an arbitrary principal — is **Session-Gated Authorization**'s emergent property, and that composition keeps its YES vote and its Alloy model. Per the *minimum-formalism principle*, the atom's conjunctive-validity claim is prose-and-records sufficient. (Original YES retained above for the decision audit trail.)

---

**Scheduled rescan — 2026-06-10 (council-run; the first rescan batch under the automated-executor convention).** Selected by risk-weighted ordering: oldest rescan date (2026-05-19, Final Critique 4), composition fan-in 4 (Login, Session-Gated Authorization, Privileged Access Provisioning, Actor Suspension). Council formula: one agent per pass per round — Pass 1 / Pass 2 `claude-sonnet-4-6` (peer-spec verification permitted), Pass 3 `claude-opus-4-8` in strict fresh-reader mode (question sets + this spec, nothing else); triage and folds by the conducting session (`claude-fable-5`). Three rounds to a clean close:

- *Round 1.* Pass 1: eight reported; five triaged *refining* and folded — the lede/Intent "three outcomes" miscount corrected to four (a genuine internal contradiction: the lede enumerated four outcomes while calling them three); the two dangling "see Configuration" references resolved by adding the §Configuration subsection (deployment default session duration; token entropy ≥128 bits from a cryptographically secure source, injected per the Logic Confinement Principle); RFC / IETF / PIN first-use glosses; Generation acceptance now names the Intent question it operationalizes. Two **rejected in triage**: "Friction node absent" (the Edge cases section carries the Friction node — presence, not heading names, is the Pass 1 rule) and "composition-number sigils unexplained" (the compositions are named in full at each use; the numbers are roadmap cross-references, not acronyms). Pass 2: clean. Pass 3 (fresh-reader): six findings, all *refining*, all folded — `expire` precondition evaluation order pinned (`not-known` → `not-active` → `invalid-request`); `now` declared an injected input; lazy terminal transitions specified as best-effort guarded compare-and-set with `status` explicitly **not** the liveness authority (the derived predicate `status = Active AND now < expires_at` governs all liveness queries); string input policy (byte-exact, whitespace-only = empty, deployment length caps); the `validate` expired branch syntactically gated behind `status != Revoked` so the cheap numeric short-circuit cannot defeat revoked-takes-precedence; token entropy floor + injected random material.
- *Round 2.* Pass 1: one refining finding folded ("API" glossed inline in the Summary). Pass 2 / Pass 3: clean.
- *Round 3.* Clean across all three passes — round closed; `grounded` retained; Status rescan date bumped to 2026-06-10.

*Formal-layer portion:* none — the vote stands at NO (formal-not-warranted, 2026-06-03 reconsideration above); no model to re-run. *Measured cost (cost-model data point):* 9 council-agent invocations (6 Sonnet, 3 Opus) across 3 rounds, ≈470k subagent tokens; also recorded in `ai-usage-log.md`.

---

**Execution/render-time refactor — 2026-06-21 (touch-triggered; status downgraded to `partially resolved`).** Direction (Scott): *derive expiry at read time; reduce execution-time clock dependence; clearly mark the residual.* Session is a clock-gated atom in the corpus-wide sweep for which Invitation is the worked reference case; this entry mirrors that one. Changes:

- *Stored `Expired` removed; expiry derived.* The stored state space is now `{Active, Revoked}`. A lapsed session is a derived `effective_status` projection — `Expired ⟺ status = Active ∧ now ≥ expires_at` — computed at read time from the immutable `expires_at` and the injected clock, and is what makes `validate` return `invalid(expired)`. New **Invariant 12**. Applies the "derive the idealization, do not lag it with a flag" pitfall ([`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls) to the canonical English. The four `validate` outcomes (Invariant 6) are unchanged — `invalid(expired)` is now reached by derivation rather than from a stored `Expired` status.
- *`expired_at` field, `expire` action, and all lazy-expiry writes removed.* Expiry never writes. There is no stored expiry timestamp and no scheduler/lazy-reap path; `validate` is now a pure read with no exception. The `not-active` rejection (an `expire`-only code) is gone.
- *Clock surfaced as an explicit injected input (subsequently reverted — see below).* Every action took `now` (the pipeline's `clock_t`) as a signature parameter, consumed only by (a) the pure expiry derivation in `validate` and `read` (no write) and (b) immutable timestamp stamps inside committed transitions (`issued_at` on `issue`, `revoked_at` on `revoke`). This made explicit, in the signatures, the injection that the 2026-06-10 rescan had already required in prose ("`now` is an injected input"). The now-explicit experiment was subsequently reverted — see the signature-revert note below.
- *`revoke` semantics on a lapsed session changed (judgment call, flagged for the re-pass).* Previously a past-`expires_at` session was treated as already-terminal for `revoke` and rejected `already-terminal` (Round 1 F3). With no stored `Expired` terminal, the only stored terminal is `Revoked`; `revoke` now rejects only a prior `Revoked` (re-revoke) and **permits** revoking a still-stored-`Active` session that has merely lapsed — so a deployment can record attributed closure (who/when/why) of a lapsed session. `revoke` gains no `expired` rejection (unlike Invitation's write actions, which carry one); the resolving-write surface here is just `revoke`. This is the one genuine behavioral change beyond the mechanical derive-don't-store transform, and the re-pass must ratify it (alternative: add an `expired` rejection to `revoke` and forbid revoking a lapsed session, matching Invitation's shape more closely).
- *Sections updated:* summary blockquote, Intent, Summary, Inputs/Outputs (+ a `read` surface with `effective_status`; `now` added as an input; `expired_at` and `not-active` removed), State (stored `{Active, Revoked}`; "Expired is derived, never stored"; "expiry is not a transition"; transitions are writes only), Decision points (+ Logic-confinement note and rejection/outcome priority; `validate` derives expiry; `expire` block removed; `revoke` reworded), Behavior, Feedback (no `expire`; "no write on expiry"; `not-active` dropped from the rejection list), Invariants 1/2/3/4/5/7/11 reworded and **12 added**, Examples (`now` threaded into issue/validate/revoke; the lazy-path expiry example converted to a derived-expiry `validate`; the `already-terminal` example reworked to re-revoke; regulated scenarios touched for `effective_status`), Edge cases (clock note: injected `now` + skew-near-boundary), Standards (OIDC, Kerberos phrasings), Composition notes (Privileged Access Provisioning `validate(…, now)`), Generation acceptance (dropped the `expired_at`-based assumptions; added "confirm expiry is derived, never stored"; six checks now).
- *Formal layer:* unchanged — the vote stays **NO (formal-not-warranted)** as recorded (2026-06-03 reconsideration); no model exists for Session and none is created. The interleaving worth modeling remains Session-Gated Authorization's emergent property, and that composition keeps its Alloy model.
- *Constituent-change cascade.* Removing the `expire` action and the stored `Expired` value is a **breaking** change to Session's surface. Every composition naming Session needs a touch-triggered re-pass. Confirmed by grepping `compositions/` for `session.md`: **Login** ([login.md](../compositions/login.md)), **Session-Gated Authorization** ([session-gated-authorization.md](../compositions/session-gated-authorization.md) — re-confirm its `validate` outcome handling and re-run its Alloy model against the new outcome set), **Privileged Access Provisioning** ([privileged-access-provisioning.md](../compositions/privileged-access-provisioning.md) — `exercise_access` gate), and **Actor Suspension** ([actor-suspension.md](../compositions/actor-suspension.md)) name `session.md` directly; **Authenticated Actor** ([authenticated-actor.md](../compositions/authenticated-actor.md)) also names Session. Per the convention, composition files are **not edited here** — this cascade is recorded for the re-pass only.

**Final Critique 5 — 2026-06-23 — clean (fresh-reader re-gate; council-run).** Closing fresh-reader Final Critique (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus at X2) over the execution/render-time refactor batch returned **zero foundational findings**. Formal-layer vote NO reconfirmed (records-alone checks; no model warranted). This atom was already clean at the first Final Critique; its only change since was the meaning-preserving signature revert (clock returned to pipeline-implicit), classified **editorial** under the recalibrated touch trigger (pressure-testing.md §Touch triggers re-pass), so it regrounds with the batch. Regrounded at Final Critique 5.

*Signature revert — `now` returned to pipeline-implicit per the FC council; the now-explicit experiment is reverted; clock/id injection is stated in prose (the Logic-confinement note), not in signatures.*

---

**Annotation conversion — 2026-06-29 (annotation.md second-batch rollout, foundations-first with Actor Identity, Retention Window, Tamper Evidence, Permissions, Provisional Commitment).** Converted every concept reference to a `[Term]` marker and added the per-page Terms registry, applying the resolved four-kind ontology — **Type**, **Operation**, **Field** (a datum a Type carries — *what does it carry?*), **Parameter** (a value an Operation needs — *what does it need?*), and **Member**. Session is a clock/expiry-oriented atom, so the discriminator (*stored-as-itself → Field, consumed/supplied-but-not-stored → Parameter*) was the load-bearing call and it lands cleanly. Inventory: one **Type** ([Session]); four **Operations** ([Issue], [Validate], [Revoke], [Read]); ten **Fields** on the [Session] record — [Session Token], [Principal Ref], [Issued By Ref], [Issued At], [Expires At], [Status], [Revoked At], [Revoked By Ref], [Revocation Reason], and the read-time-derived [Effective Status] (a datum the record carries on read, *never stored* — its definition says so); four **Parameters** consumed but not stored under their own name — [Session Duration] (computed into [Expires At]), [Now] (the injected `clock_t`, never stored), [Reason] (written into [Revocation Reason]), and [Filter] (the [Read] query argument); and the **Members** — the stored states [Active] and [Revoked] plus the derived [Expired] (pure state values, no `Projects:` line, mirroring Personal Todo's Pending/Done; [Expired] is the derived-status value that the [Effective Status] projection yields), the four [Validate] outcomes ([Valid], [Invalid Expired], [Invalid Revoked], and the lookup-miss [Not Known]), and the rejections ([Invalid Request], [Already Terminal], [Storage Failure]). The discriminator placed the timestamps/ids/refs as Fields (stored on the record as themselves) and the injected clock / supplied duration / query argument as Parameters (consumed, never stored under that name), exactly as duplicate-prevention split `recordedAt` from `now`/`window`. Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). The three Operation contracts (`issue(principal_ref, issued_by_ref, session_duration) → …`, `validate(session_token) → …`, `revoke(session_token, revoked_by_ref, reason) → …`) plus the `read(filter) → records` surface are kept once each in Inputs/Outputs as the labeled *projected contract*; the concrete example invocations in Examples (e.g. `issue(principal_ref: user_u91, … session_duration: 3600) → session_token: tok_abc123`, `validate(session_token: tok_abc123) → valid(…)`) and their literal field values (`status: Active`, `expires_at: …`, `revoked_at: null`) and the auditor query predicates (`issued_at <= T and expires_at > T …`) are left verbatim as illustrative wire-level calls. The expiry formula was Term-ified to match duplicate-prevention: the lapsed condition is `[Status] = [Active] ∧ [Now] ≥ [Expires At]` and the projection is `[Effective Status] = [Expired] ⟺ ([Status] = [Active] ∧ [Now] ≥ [Expires At])` (identical relations); the internal `is_expired(record, now)` helper name was dropped in favour of the Term-ified condition. Cross-page references became full links now that the owner page converts in this same batch: Actor Identity's `attest` → `[Attest](./actor-identity.md#attest)`. `Credential.verify`/`verified` stay backticked (Credential is not yet converted), and the external-standard tokens (`AuthnStatement`, `SessionNotOnOrAfter`, `SLO`, `Set-Cookie`, the JWT `exp` claim) and the deliberately-non-existent `expired_at` field stay verbatim. Anchor collisions were handled per the playbook: the [Revoke] Operation (`#revoke`) and the [Revoked] state (`#revoked`) are distinct; the [Expired] derived-state (`#expired`) and the [Invalid Expired] outcome (`#invalid-expired`) are distinct. Expression only — all twelve invariants hold their exact claims (Invariant 3's conjunctive validity bound, Invariant 6's four structurally-distinct outcomes, and Invariant 12's derive-don't-store discipline are the identical relations), the invariant set stays at twelve, and the numbering is untouched. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 5 — 2026-06-23`. Gates: linter 0 (incl. the O-term-resolver, resolving all of this page's markers against its registry); **no formal model exists for Session, so the harness gate is N/A** (English-only, per the 2026-06-03 NO formal-layer vote — the interleaving worth modeling lives in Session-Gated Authorization, which keeps its Alloy model); the derived manifest projects an identifier kind (Field) and an enumerated kind (Member); diff read line-by-line against the same-claim-or-weaker test.

**Showcase pass — 2026-06-29.** Brought to the full showcase standard, matching the [`duplicate-prevention.md`](./duplicate-prevention.md) exemplar and mirroring the [`provisional-commitment.md`](./provisional-commitment.md) lifecycle pass, on top of the already-applied annotation conversion. Changes are representational only: (1) **Summary/blockquote merge (fixes the known defect)** — the plain Tier-1 [`prose.md`](../working-ideas/prose.md) cut-#4 Summary moved to the very top (before Intent), the descriptive top blockquote folded out as redundant, and an *also-known-as* italic line added. This removed the page's last stale raw casing: the blockquote still carried `issue` / `expires_at` / `now < expires_at` / `validate(session_token)` / `valid(principal_ref, expires_at)` / `invalid(expired)` / `now ≥ expires_at` / `clock_t` while the body was already casing-free. (2) **Lineage collapse** — the Lineage notes wrapped in the collapsed `<details markdown="block">` block, byte-mirroring the exemplars. (3) **prose.md cut #1 (one idea per sentence)** — the two densest run-on sentences in the Summary (the four-outcome "never lumped into a single 'no'" sentence and the expiry-immutability/re-issue/auditability sentence) split into short declaratives, lossless. (4) **prose.md cut #5 (prose→structure), two tables** — the State section's `Transitions:` prose list rendered as a **transition table** (action · from · to · guard · stamps · result · rejections), with the derived-expiry row shown for contrast (its "to" unchanged, "stamps" empty by design); and the Decision-points `**At [Validate]:**` bullet block rendered as a **four-outcome decision matrix** in strict precedence order ([Not Known] → [Invalid Revoked] → [Invalid Expired] → [Valid]). Per the cut-#5 caveat the cell-resistant semantics are kept in prose *beside* each table — for the transition table: expiry-is-derived-never-written (Invariant 12), stored-terminal absorption (Invariant 5), a-lapsed-session-is-still-revocable, and the fixed [Revoke]/[Issue] rejection priority (cross-referenced to Decision points); for the validate matrix: the load-bearing precedence (the [Active] guard consulted only after the [Revoked] check, no short-circuit on the cheap numeric test — Invariant 3), the exact expiry boundary at `[Now] = [Expires At]` with the lapsed condition derived (no write at the boundary), and [Validate]-is-a-pure-read-on-every-row. (5) Two flowing-prose raw-cased formula survivors that the annotation pass had left (`status = Active ∧ now ≥ expires_at` in the [Read] Inputs bullet and the [Effective Status] Outputs bullet) were Term-ified to `[Status] = [Active] ∧ [Now] ≥ [Expires At]`, matching the rest of the body; the concrete worked-example invocations in Examples (e.g. `now (10:20Z) < expires_at (11:00Z)`, `status = Active`) stay verbatim as illustrative wire-level calls per the annotation convention. Cuts #2 (glossary) and #3 (cross-ref footer) were assessed and **skipped**: acronyms are already spelled-out-once inline per the corpus convention here, and provenance already lives in the invariants' supporting prose and Composition notes rather than being re-cited mid-sentence. Expression only — all twelve invariants and their numbers, the `[Now] < [Expires At]` / `[Now] ≥ [Expires At]` window relations and the `[Now] = [Expires At]` boundary, the conjunctive validity bound (Invariant 3), the four structurally-distinct [Validate] outcomes (Invariant 6), the derive-don't-store discipline (Invariant 12), all three projected-contract signatures plus the `read(filter) → records` surface, and every guarantee are unchanged in force; every `[Term]` marker still resolves to its card and the Terms registry is intact. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 5 — 2026-06-23`. Gates: linter 0 (incl. the O-term resolver — all markers resolve); **no formal model exists for Session, so the harness gate is N/A** (English-only, per the 2026-06-03 NO formal-layer vote); the derived manifest projects cleanly; `git status` shows only `atoms/session.md` modified (no model files); diff read line-by-line against the same-claim-or-weaker test.

</details>
