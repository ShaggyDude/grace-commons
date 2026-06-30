---
title: Capability
parent: Atomic Concepts
has_toc: true
toc: true
---

# Capability

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Capability expresses bearer-token authorization: holding the token grants the right, no matter who holds it. Each capability ties a [Scope] (what it authorizes — opaque to the pattern, interpreted by whatever uses it) to a redemption envelope: how many times it can be used, and until when. It is identified by a cryptographically random [Capability Token] that doubles as the credential presented to redeem it. Nothing else is required to redeem. Crucially, no identity is asked for or recorded on the redemption side. The defining feature is this audit asymmetry: who created the capability is always recorded, but who used it is deliberately not — the record reads "allocated by X, scope Y, redeemed N times," never "redeemed by Z." A capability ends in one of three clearly separated ways, and the difference between them is load-bearing. It runs out of redemptions ([Redeemed]) or it is explicitly cancelled ([Revoked]) — each a recorded end state written into the record. Or its time window simply passes, in which case it is shown as [Expired], a status worked out on the fly by comparing the clock to the deadline, not written into the record. The default is single-use. This is the mechanism behind password-reset links, pre-signed file URLs, scoped API tokens, and OAuth (Open Authorization — the web's delegated-authorization framework) authorization codes. It deliberately does not decide when a capability should be issued, interpret the [Scope], or record what was done after redemption — and where the act of redeeming must bind an identity, that is a different pattern ([Invitation](./invitation.md)), not this one.

---

## Intent

Many authorization problems are not about *who is asking* but about *what is being presented*. A password-reset link grants the right to set a new password to whoever holds the link — whether that is the legitimate account owner who received it by email, a trusted friend who was handed it, or an attacker who intercepted it. An API (Application Programming Interface) token grants access to a specific resource to whatever service presents it — no per-request identity verification is performed. A pre-signed URL grants read access to a file to anyone with the URL for its lifetime. In all three cases, the authorization is embedded in the token itself; the holder's identity is irrelevant by design.

The library's existing authorization model, Permissions, is identity-keyed: a permission check gates on *who is asking*, matching an actor reference against an access control list. Permissions is the right model when authorization is principal-bound — when it matters *which* actor is requesting access, not merely that someone with a token is requesting it. But Permissions is the wrong model for bearer-token authorization: modeling a password-reset link as a Permissions grant would require creating a principal for the link recipient before the link is sent, which defeats the purpose of a bearer credential. The two authorization primitives are structurally distinct and belong to separate atoms.

Capability is the library's expression of object-capability (OCAP — a security model in which unforgeable references to objects carry their own authority, eliminating the need for a separate access control list) theory as a structured-natural-language pattern. The atom isolates the bearer-token authorization primitive. [Allocate] creates a capability, records who created it and what it authorizes, and returns a token. [Redeem] accepts the token, checks that it is valid and not exhausted, and returns the authorization [Scope] — with no identity argument and no identity record on the redemption side. The asymmetry between allocator (always known) and redeemer (intentionally unknown) is structural, not accidental, and is the atom's primary contribution to the composing system's audit record.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the capability record and its redemption counter), its own actions ([Allocate], [Redeem], [Revoke]), and its own operational principles (bearer-key authorization, immutable [Scope], counter monotonicity, expiry-is-derived). It does not implement the policy that governs when a capability should be allocated, the logic that interprets the [Scope] returned by [Redeem], the audit trail that records what was done after redemption, or the identity verification that establishes the allocator's authority to allocate. Each is a composing-pattern concept; see Composition notes.

---

## Structure

### Identity model

Every capability known to the system has a **[Capability Token]** — an opaque, cryptographically random, immutable, system-generated value produced by [Allocate]. The token is both the record's identity and the bearer credential the caller presents to [Redeem] and [Revoke]. Because the token is the bearer credential, it must be unguessable: sufficient entropy (the random material is an injected input from the deployment's entropy source — see the injected-inputs commitment in Behavior) and unpredictable from any public information about the allocator, the [Scope], or the allocation time.

The fields set on [Allocate] — [Allocator Ref], [Scope], [Max Redemptions], [Allocated At], [Expires At] — are immutable properties, never changed after allocation. [Expires At] is computed once at [Allocate] from the injected clock ([Expires At] = [Allocated At] + [TTL]) and stored; it is the sole input the expiry derivation needs thereafter. The [Remaining Redemptions] counter is the one field that changes between allocation and a stored terminal transition; it decrements monotonically toward zero and never increases. The stored-terminal fields ([Redeemed At], [Revoked At], [Revoked By Ref], [Revocation Reason]) are null until set by their respective **writes**, and immutable once set. There is **no `expired_at` field**: expiry is derived at read time from [Expires At] and the injected clock, never written, so there is no stored expiry timestamp to keep consistent.

Tokens are not reused after a capability reaches a terminal state (a stored terminal, or — for a lapsed [Allocated] record that reads [Expired] — once it has lapsed).

### Inputs and Outputs

**Actions.** Action signatures take only their domain arguments — the clock reading and the token's random material are **not** parameters. They are **pipeline-injected at the I/O seam**: the execution contract reads the clock once and supplies it (the pipeline's `clock_t`, the injected [Now]) to the action, and [Allocate]'s fresh token (the `id_t`) is drawn from the deployment's entropy source at the same seam — neither is read inside a transition, neither is trusted from the caller. The injected [Now] is consumed for two clearly separated purposes: stamping immutable timestamps on a write ([Allocated At], [Redeemed At], [Revoked At] — execution time), and evaluating the pure expiry derivation in a guard or in [Read]'s projection (no write). See the Logic-confinement note in Decision points.

- [Allocate] — (Projected contract: `allocate(allocator_ref, scope, max_redemptions, ttl) → capability_token | rejected(invalid-request | storage-failure)`)
- [Redeem] — (Projected contract: `redeem(capability_token) → redeemed(scope, allocator_ref) | invalid(exhausted | expired | revoked | not-known)`)
- [Revoke] — (Projected contract: `revoke(capability_token, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-terminal | not-known | storage-failure)`)

There is **no `expire` action**. A lapsed capability needs no write to read [Expired]; expiry is surfaced by the read projection below and by [Redeem]'s derived `invalid(expired)` outcome. [Already Terminal] (from [Revoke]) names a *stored* terminal only — [Redeemed] or [Revoked]; the lapsed-window case is the distinct [Expired] outcome of [Redeem] (and [Already Terminal] from [Revoke] on a lapsed record — see Decision points).

**Read surface (render time):**

- [Read] — (Projected contract: `read(filter) → records`) — each returned record carries its stored fields plus a derived **[Effective Status]**: [Expired] when [Status] = [Allocated] ∧ [Now] ≥ [Expires At], otherwise the stored [Status], where [Now] is the seam-injected clock reading. [Effective Status] is a pure projection over the record and the injected clock; it is never stored. This is the derived-liveness predicate auditors and administrative queries apply (a raw stored [Allocated] with [Expires At] in the past reads [Expired], never live).

**Inputs:**

- [Allocator Ref] — an opaque reference to the actor or mechanism allocating the capability. Recorded as an immutable property of the record. Non-null and non-empty required. The atom does not validate that [Allocator Ref] is a currently active principal; that is the caller's responsibility.
- [Scope] — an opaque value describing what the capability authorizes. The atom treats this as a black box: it stores the [Scope] on [Allocate] and returns it on [Redeem]. The composing pattern (e.g., Capability-Backed Sharing) is responsible for defining and interpreting [Scope] values. Non-null and non-empty required.
- [Max Redemptions] — the maximum number of times the capability may be redeemed. Must be a positive integer. Null defaults to `1` (single-use). Zero and negative values are rejected as [Invalid Request].
- [TTL] (time-to-live — a validity duration) — a duration value specifying how long the capability is valid. Null uses the deployment's default capability TTL. [Expires At] = [Allocated At] + [TTL]. Must be positive if supplied; zero or negative is rejected as [Invalid Request].
- [Capability Token] — the bearer credential the caller presents to [Redeem] and [Revoke]. Produced by [Allocate]; supplied by the caller on subsequent calls.
- [Revoked By Ref] — an opaque reference to the actor or mechanism performing the revocation. Non-null and non-empty required.
- [Reason] — caller-supplied reason string for the revocation. Non-null and non-empty required.

**Seam-injected, not a parameter.** The clock reading (`clock_t`) and [Allocate]'s fresh token material (`id_t`) are **not** action arguments and do not appear in any signature above. The execution contract supplies them at the I/O seam: the pipeline reads the clock once and passes it in, and the token's random material is drawn from the deployment's entropy source. Neither is caller-trusted and neither is read inside any transition. The injected clock — referred to as [Now] throughout this spec — is used only to stamp immutable write timestamps ([Allocated At], [Redeemed At], [Revoked At] — execution time) and to evaluate the pure expiry derivation in a guard and in [Read]'s [Effective Status] projection (no write).

**String input policy (applies to every string input above).** Values are treated byte-exact: no trimming, no Unicode normalization, no case folding is applied before storage or comparison — [Allocator Ref] equality (including the audit queries in Feedback and the Regulated scenarios) is byte-for-byte, so callers own canonicalization; two refs differing only in normalization form are two distinct allocators to this atom. A whitespace-only string counts as empty and is rejected wherever non-empty is required. The deployment sets a maximum length per string input (including [Scope]); a value exceeding it is rejected as [Invalid Request].

**Outputs:**

- The current set of capability records. For each: [Capability Token], [Allocator Ref], [Scope], [Max Redemptions], [Remaining Redemptions], [Allocated At], [Expires At], [Status] (the **stored** status: [Allocated], [Redeemed], or [Revoked]), [Redeemed At] (set when status transitions to [Redeemed]; null otherwise), [Revoked At] (nullable), [Revoked By Ref] (nullable), [Revocation Reason] (nullable), and the derived [Effective Status] (the stored [Status], except [Expired] when [Status] = [Allocated] ∧ [Now] ≥ [Expires At]).
- [Allocate] returns a new [Capability Token] on success, or a rejection.
- [Redeem] returns `redeemed(scope, allocator_ref)` on success, or `invalid(reason)`. Note: [Redeem] is not a rejection-based action — all five outcomes (`redeemed`, `invalid(exhausted)`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)`) are first-class results, not errors. The caller is expected to handle all five. `invalid(expired)` is produced by **pure derivation** — the guard compares the injected [Now] to the immutable [Expires At] on a still-[Allocated] record and **writes nothing**; the other four outcomes likewise read stored state only.
- [Revoke] returns `revoked` on success, or a rejection.

### State

Each capability record carries a **stored** [Status] field and a [Remaining Redemptions] counter. The state machine has one non-terminal state and two **stored** terminal states; [Expired] is a third terminal mode that is **derived, never stored**:

- **[Allocated]** — the capability may be redeemed. [Remaining Redemptions] > 0. The only non-terminal stored state.
- **[Redeemed]** — the capability's redemption counter reached zero. Stored terminal.
- **[Revoked]** — explicitly revoked. Stored terminal.
- **[Expired]** *(derived — never stored)* — a still-[Allocated] record whose window has lapsed ([Now] ≥ [Expires At]). Computed at read time by the [Effective Status] projection from the immutable [Expires At] and the injected clock; no transition fires and no field is written when a capability lapses.

Transitions — writes only; every write below stamps its timestamp from the injected [Now], and no transition reads the clock internally. Expiry is listed for contrast: it is not a transition and writes nothing.

| action | from (stored) | to (stored) | guard | stamps / effect | result |
|--------|---------------|-------------|-------|-----------------|--------|
| [Allocate] | *(no record)* | **[Allocated]** | — | fresh [Capability Token]; [Allocator Ref]; [Scope]; [Max Redemptions] (or 1 if null); [Remaining Redemptions] = [Max Redemptions]; [Allocated At] = [Now]; [Expires At] = [Now] + [TTL] (or default) | the new [Capability Token] |
| [Redeem] *(partial)* | [Allocated] | *[Allocated]* (unchanged) | [Now] < [Expires At] ∧ [Remaining Redemptions] > 1 | [Remaining Redemptions] decremented by 1 | `redeemed(scope, allocator_ref)` |
| [Redeem] *(exhausting)* | [Allocated] | **[Redeemed]** | [Now] < [Expires At] ∧ [Remaining Redemptions] = 1 | [Remaining Redemptions] → 0; [Redeemed At] = [Now] | `redeemed(scope, allocator_ref)` |
| [Revoke] | [Allocated] | **[Revoked]** | [Now] < [Expires At] | [Revoked At] = [Now]; [Revoked By Ref]; [Revocation Reason] | `revoked` |
| *expiry (derived — not a transition)* | [Allocated] | *[Allocated]* (unchanged) | [Now] ≥ [Expires At] | **nothing written** | *shown* [Expired] |

Five semantics the cells cannot hold:

- *A failed time-guard writes nothing.* When [Now] ≥ [Expires At], [Redeem] returns `invalid(expired)` and [Revoke] returns [Already Terminal] — each a pure derivation against the injected [Now] that leaves the record [Allocated] and **writes nothing** (no [Expired] status, no `expired_at`, no counter change). A lapsed capability already reads [Expired] and needs no withdrawal.
- *Exhaustion is atomic.* The decrement of [Remaining Redemptions] to zero and the transition to [Redeemed] are one committed write (Invariant 4). Under concurrent [Redeem] calls at [Remaining Redemptions] = 1, exactly one succeeds and the rest see `invalid(exhausted)`; the counter never goes below zero.
- *Expiry is derived, never written.* When [Now] ≥ [Expires At] an [Allocated] record is *shown* [Expired] by [Read]'s [Effective Status] projection (Invariant 13). No `expire` action exists, no scheduler runs, no field is written, and the redemption counter is never decremented by lapse. It is the one row whose "to" column is unchanged and whose "stamps" column is empty by design.
- *The two stored terminals are absorbing.* No transition leaves [Redeemed] or [Revoked]; [Expired] is derived, so nothing transitions into or out of it. [Redeem] on a stored terminal returns `invalid(exhausted | revoked)`; [Revoke] returns [Already Terminal].
- *Rejection priority is fixed.* For [Redeem] the outcome order is `not-known` → `exhausted` → `revoked` → `expired`; for [Revoke] it is [Already Terminal] (a stored terminal *or* a lapsed window) → [Invalid Request] → [Storage Failure]. The full per-action preconditions are in Decision points.

Each capability record carries:

- **[Capability Token]** — opaque, cryptographically random, immutable, system-generated. Set on [Allocate]. Never changes. The bearer credential.
- **[Allocator Ref]** — opaque reference to the allocating actor. Set on [Allocate]. Never changes.
- **[Scope]** — opaque authorization descriptor. Set on [Allocate]. Never changes.
- **[Max Redemptions]** — total redemptions permitted. Set on [Allocate]. Never changes.
- **[Remaining Redemptions]** — redemptions remaining. Set to [Max Redemptions] on [Allocate]. Decremented by 1 on each successful [Redeem]. Reaches 0 on exhaustion. Never increases.
- **[Allocated At]** — wall-time when [Allocate] was called. Immutable.
- **[Expires At]** — absolute expiry time. Set on [Allocate] as [Allocated At] + [TTL] from the injected [Now]. Immutable. Never null — every capability has a finite lifetime. The sole stored input to the expiry derivation.
- **[Status]** — the **stored** status: [Allocated] | [Redeemed] | [Revoked]. Set to [Allocated] on [Allocate]; immutable once written to a stored terminal. The derived [Expired] is *not* a value of this field — it appears only in the [Effective Status] read projection.
- **[Redeemed At]** — set when status transitions to [Redeemed] (exhaustion). Null otherwise. Immutable once set.
- **[Revoked At]** — set when status transitions to [Revoked]. Null otherwise. Immutable once set.
- **[Revoked By Ref]** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **[Revocation Reason]** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Allocating actor decides to grant bearer-token access.** Calls [Allocate] with an [Allocator Ref], a [Scope], [Max Redemptions], and a [TTL], receiving a [Capability Token]. The atom creates the record and returns the token. The allocating actor delivers the token to the intended bearer — by email, by URL, by API response, by QR code — through whatever out-of-band channel is appropriate.
2. **Bearer presents the token.** The bearer's system calls [Redeem] with the [Capability Token]. The atom finds the record, checks [Status] and (by pure derivation against the seam-injected clock) the validity window, decrements [Remaining Redemptions], and returns `redeemed(scope, allocator_ref)`. The calling pattern receives the [Scope] and acts on it.
3. **Bearer continues to use a multi-use capability.** Each subsequent [Redeem] decrements [Remaining Redemptions] further. The capability remains in [Allocated] status as long as [Remaining Redemptions] > 0; it reads [Expired] (and [Redeem] returns `invalid(expired)`) once [Now] ≥ [Expires At].
4. **Capability exhausts.** The [Redeem] call that brings [Remaining Redemptions] to zero atomically transitions the capability to the stored terminal [Redeemed]. The same call returns `redeemed(scope, allocator_ref)` — the last redemption succeeds. All future [Redeem] calls for this token return `invalid(exhausted)`.
5. **Capability lapses before exhaustion (expiry, derived).** The deadline passes without exhaustion or revocation. No action and no write are required: a still-[Allocated] record now reads as [Expired] via [Read]'s [Effective Status] projection ([Now] ≥ [Expires At]). A subsequent [Redeem] on it returns `invalid(expired)` and a subsequent [Revoke] returns [Already Terminal] — each guard compares the injected [Now] to [Expires At] and writes nothing. Remaining redemptions are forfeit; the [Remaining Redemptions] counter is never decremented by lapse, and no [Redeemed At] or `expired_at` is written.
6. **Allocating actor revokes the capability.** Calls [Revoke] with the [Capability Token], a [Revoked By Ref], and a [Reason] while the window is open. The atom transitions the capability to the stored terminal [Revoked] and records the attribution. Future [Redeem] calls return `invalid(revoked)`.

### Decision points

**Logic confinement (clock and id).** The clock and the token are **pipeline-injected at the I/O seam, not action parameters** — neither appears in a signature, and neither is produced inside a transition. The execution contract reads the clock once and supplies it (the pipeline's `clock_t`, referred to as [Now] here) to the action; [Allocate]'s [Capability Token] is the injected `id_t`, its cryptographically random material drawn from the deployment's entropy source at the same seam (see Behavior). A guard's expiry test is a **pure function of the stored record and the injected [Now]** — the record is lapsed exactly when [Status] = [Allocated] ∧ [Now] ≥ [Expires At] — and it **writes nothing**. The only clock *writes* are the immutable timestamp stamps inside a committed transition ([Allocated At], [Redeemed At], [Revoked At]), each set from the same injected [Now]. Expiry itself never writes; it is surfaced only by [Read]'s [Effective Status] projection and by [Redeem]'s derived `invalid(expired)`. Rejection priority for the [Redeem] outcomes: `not-known` → `exhausted` → `revoked` → `expired`. For [Revoke]: [Not Known] → [Already Terminal] (a stored terminal *or* a lapsed window) → [Invalid Request] → [Storage Failure].

**At [Allocate]:**
- [Allocator Ref] and [Scope] must be non-null and non-empty; otherwise [Invalid Request].
- [Max Redemptions] must be a positive integer if supplied; null defaults to 1; zero or negative is [Invalid Request].
- [TTL] must be a positive duration if supplied; null uses the deployment default. Zero or negative is [Invalid Request]. The deployment default must be configured; if absent, [Allocate] returns [Invalid Request]. (A capability store with no TTL policy is a deployment misconfiguration.)
- [Allocated At] = [Now] and [Expires At] = [Allocated At] + [TTL] are computed once from the injected [Now] and stored as immutable. The atom never re-derives [Expires At] from the current time.
- If the store write fails, [Storage Failure] is returned with no partial record.

**At [Redeem]:**
- The atom looks up the capability by [Capability Token]. If no record is found, `invalid(not-known)`.
- If the stored [Status] = [Redeemed], `invalid(exhausted)`. The capability's redemption counter reached zero on a prior [Redeem] call; no further redemptions are possible.
- If the stored [Status] = [Revoked], `invalid(revoked)`.
- **Expiry guard (derived, no write):** if the record is lapsed — stored [Status] = [Allocated] ∧ [Now] ≥ [Expires At] — return `invalid(expired)`. The record is left [Allocated]; **nothing is written** (no [Expired] status, no `expired_at`, no counter change). A reader sees [Effective Status] = [Expired].
- If the stored [Status] = [Allocated], [Now] < [Expires At], and [Remaining Redemptions] > 0:
  - Decrement [Remaining Redemptions] by 1.
  - If [Remaining Redemptions] is now 0: atomically transition status to [Redeemed] and set [Redeemed At] = [Now].
  - Return `redeemed(scope, allocator_ref)`.
- **No identity argument is accepted.** [Redeem] takes exactly one argument: the [Capability Token]. There is no `redeemer_ref`, no `caller_id`, no `principal` parameter (and the clock is seam-injected, not an argument). If a caller attempts to pass identity information, the atom does not record it. This is a deliberate design constraint, not an omission.

**At [Revoke]:** preconditions are evaluated in the order listed — [Not Known], then [Already Terminal], then [Invalid Request] — so any two conformant implementations return the same rejection for the same input (a [Revoke] on a terminal capability with an empty [Reason] returns [Already Terminal], never [Invalid Request]):
- [Capability Token] must reference a known record; otherwise [Not Known].
- The capability must be revocable: its stored [Status] must be [Allocated] **and** the window must be open ([Now] < [Expires At]); otherwise [Already Terminal]. A capability in a stored terminal ([Redeemed] or [Revoked]) is [Already Terminal]; a still-[Allocated] capability whose window has lapsed ([Now] ≥ [Expires At]) is **also** [Already Terminal] — by **pure derivation** against the injected [Now], **writing nothing** (no [Expired] status, no `expired_at`). The lapsed record continues to read [Expired] and needs no withdrawal.
- [Revoked By Ref] and [Reason] must be non-null and non-empty; otherwise [Invalid Request].
- The transition to [Revoked] and the writes of [Revoked At], [Revoked By Ref], and [Revocation Reason] are atomic. If the store write fails after all preconditions pass, [Storage Failure] is returned with no state change committed.

*(There is no `expire` action: a lapsed capability requires no write to read [Expired] — see the expiry guard above and [Read]'s [Effective Status] projection.)*

### Behavior

- **[Redeem] accepts no identity argument — by design, not by omission.** The bearer-key principle is that possession of the token is sufficient authorization. Accepting a `redeemer_ref` argument would create the appearance of identity-keyed authorization while the actual check is still bearer-keyed — a misleading interface that obscures the authorization model from the composing system. The atom's [Redeem] signature makes the bearer-key semantics explicit and unambiguous. Composing patterns that need to record who redeemed a capability (e.g., for audit purposes) may do so in their own records; the atom's record will never show a redeemer identity.
- **The redemption counter is the only mutable field between allocation and terminal transition.** All other fields are immutable after [Allocate]. This makes the capability's authorization envelope fully auditable from the allocation record alone: what was authorized ([Scope]), how many times ([Max Redemptions]), until when ([Expires At]), by whom ([Allocator Ref]). The counter's current value indicates how many redemptions remain.
- **Exhaustion and revocation are stored terminals; expiry is derived.** A [Redeemed] record has [Redeemed At] non-null and [Remaining Redemptions] = 0. A [Revoked] record has [Revoked At], [Revoked By Ref], and [Revocation Reason] non-null. The third mode, **expiry, carries no stored fields of its own**: a lapsed capability is a still-[Allocated] record whose [Effective Status] reads [Expired] because [Now] ≥ [Expires At] — the boundary instant [Now] = [Expires At] is on the dead side, matching the redemption guard [Now] < [Expires At]. An implementation that collapses these into a single "invalid" state, or that stores [Expired] as a status value, loses the structural distinction that makes the audit record informative.
- **Expiry is derived, not written; [Status] is not the liveness authority.** When [Now] ≥ [Expires At], a still-[Allocated] capability is *shown* [Expired] by [Read]'s [Effective Status] projection, and a [Redeem] attempted on it returns `invalid(expired)` (and [Revoke] returns [Already Terminal]) — but **no record is written**, there is no `expired_at` field, and there is no `expire` action and no scheduler. Liveness is therefore a derived predicate — [Status] = [Allocated] AND [Now] < [Expires At] — never the raw stored [Status] field; a stored [Allocated] with [Expires At] in the past reads [Expired], not live. Auditors and administrative queries (including the Regulated scenarios' triage) apply this derived predicate. The clock that decides expiry is the injected [Now], consumed by a pure derivation; it is never read inside a transition and never lags behind a stored flag. This is the "derive the idealization, do not lag it with a flag" discipline (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls). Two readers evaluating [Effective Status] with slightly skewed clocks near [Expires At] may briefly disagree on whether a record reads [Expired] — harmless, because no write is at stake.
- **[Now] and the token's random material are pipeline-injected at the seam, not action parameters.** The clock reading [Now] (the pipeline's `clock_t`) is injected by the execution contract at the I/O seam — not surfaced as an argument on any action signature — and [Allocate]'s cryptographically random token material is likewise supplied at the seam by the deployment's entropy source (a cryptographically secure generator, sufficient for Invariant 12's negligible-collision requirement). Per the Logic Confinement Principle (see `execution-contract.md`), the core transition neither reads a wall clock nor generates randomness internally, so each transition is a pure function of its inputs and both sources remain auditable at the deployment layer. The injected [Now] is consumed only by (a) pure expiry derivations in guards and [Read] (no write) and (b) immutable timestamp stamps inside committed transitions ([Allocated At], [Redeemed At], [Revoked At]). Clock quality (honesty, monotonicity, skew) is handled at the deployment layer (see Edge cases).
- **[Redeem] is not idempotent.** Each call to [Redeem] on an [Allocated] capability decrements [Remaining Redemptions]. Two concurrent [Redeem] calls on a capability with [Remaining Redemptions] = 1 must result in exactly one succeeding (returning `redeemed(...)`) and one failing (returning `invalid(exhausted)`). The decrement-and-check operation must be atomic. This is the one place where the atom's behavior under concurrency matters structurally: the exhaustion invariant (Invariant 4) must hold even under concurrent redemptions.
- **[Allocate] makes no policy judgment.** The atom allocates a capability for whatever [Scope], [Max Redemptions], and [TTL] the caller supplies. Whether those values are appropriate, who is permitted to allocate capabilities for a given [Scope], and whether the allocator has the authority they claim are all composing-pattern concepts. An actor who calls [Allocate] is recorded as [Allocator Ref]; whether they had the right to do so is a policy question the atom cannot answer.

### Feedback

Each successful action produces an observable, measurable change:

- After [Allocate] — a new capability record appears in [Allocated] status with a fresh [Capability Token], [Allocator Ref], [Scope], [Max Redemptions], [Remaining Redemptions] = [Max Redemptions], [Allocated At], and [Expires At]. Total record count increases by one. The token is returned to the caller.
- After [Redeem] (succeeding) — [Remaining Redemptions] decrements by 1. If [Remaining Redemptions] reaches 0, [Status] transitions to [Redeemed] and [Redeemed At] is set. Returns `redeemed(scope, allocator_ref)`.
- After [Redeem] (failing) — returns `invalid(exhausted | expired | revoked | not-known)`. **No state change in every case**, including `invalid(expired)`: the lapsed record stays stored-[Allocated], the counter is unchanged, and nothing is written. Expiry is observable only through [Read] (the derived [Effective Status]) and through [Redeem]'s `invalid(expired)` outcome, never through a write.
- After [Revoke] — [Status] transitions to [Revoked]; [Revoked At], [Revoked By Ref], and [Revocation Reason] are set.
- On lapse — **no change**: when [Now] ≥ [Expires At], a still-[Allocated] record's [Effective Status] reads [Expired], but no field is written, the record count does not change, and no transition fires.

The capability store is queryable. Per-record fields (all listed above), and each record's derived [Effective Status], are observable to authorized administrative surfaces. Composing patterns may query capabilities by [Allocator Ref], by stored [Status], or by derived [Effective Status] to support audit and administrative operations.

### Invariants

**Invariant 1 — Allocation provenance immutability.** Once a capability record is created, [Capability Token], [Allocator Ref], [Scope], [Max Redemptions], [Allocated At], and [Expires At] never change. These fields constitute the capability's authorization envelope and are fully auditable from the record alone.

**Invariant 2 — Redemption counter monotonic.** [Remaining Redemptions] is set to [Max Redemptions] on [Allocate] and decremented by exactly 1 on each successful [Redeem]. It never increases. A record showing [Remaining Redemptions] > [Max Redemptions] is evidence of an implementation defect.

**Invariant 3 — Bearer redemption.** [Redeem] takes exactly one argument: [Capability Token]. No identity claim, no principal reference, no authentication check is performed. The redeemer's identity is not recorded in the capability record or in any output of the atom. This invariant is violated by any implementation that accepts, validates, or records redeemer identity as part of the [Redeem] operation.

**Invariant 4 — Exhaustion atomicity.** The decrement of [Remaining Redemptions] to zero and the transition of [Status] to [Redeemed] occur as a single atomic operation. Under concurrent [Redeem] calls on a capability with [Remaining Redemptions] = 1, exactly one call succeeds (decrement to 0, transition to [Redeemed], return `redeemed(...)`) and all others see the terminal state (return `invalid(exhausted)`). No implementation may permit [Remaining Redemptions] to go below zero or allow more than [Max Redemptions] total successful [Redeem] calls. The atomicity boundary is the store: the decrement-and-transition must be one committed write (a compare-and-swap on [Remaining Redemptions], or equivalent serializable isolation on the record); a crash between an in-flight decrement and its status write must leave the pre-decrement state — partial writes are not a valid observable state, and an implementation whose store cannot guarantee this cannot host the atom.

**Invariant 5 — Audit asymmetry.** The allocation event permanently records [Allocator Ref]. The redemption events record no redeemer identity. This asymmetry is structural: given the capability store, an auditor can always determine who allocated a capability (Invariant 1) but can never determine who redeemed it — by design. An implementation that attempts to infer redeemer identity from surrounding context and store it on the capability record has violated this invariant.

**Invariant 6 — Three structurally distinct terminal modes; two stored, one derived.** The two **stored** terminals are distinguishable in the record store: exhaustion ([Status] = [Redeemed], [Remaining Redemptions] = 0, [Redeemed At] non-null) and revocation ([Status] = [Revoked], [Revoked At] non-null, [Revoked By Ref] non-null, [Revocation Reason] non-null) share no identical field pattern. The third mode, **expiry, is derived and carries no fields of its own** — it is the [Effective Status] of a still-[Allocated] record with [Now] ≥ [Expires At] (Invariant 13), distinct from both stored terminals (an [Expired]-reading record has no [Redeemed At] and no revocation fields). An implementation that collapses any two of these into a single representation, or that stores [Expired] as a status value or adds an `expired_at` field, violates this invariant.

**Invariant 7 — Stored terminal state absorbing.** A capability in a **stored** terminal — [Redeemed] or [Revoked] — admits no further state transitions. [Redeem] on a stored-terminal capability returns the appropriate `invalid(...)` outcome (`exhausted` or `revoked`); [Revoke] returns [Already Terminal]. A lapsed (still-[Allocated], [Now] ≥ [Expires At]) capability is **not** a stored terminal: it admits no further write either — [Redeem] returns `invalid(expired)` and [Revoke] returns [Already Terminal], both by pure derivation writing nothing — but its stored [Status] remains [Allocated]. Either way, no further write ever fires on an exhausted, revoked, or lapsed capability.

**Invariant 8 — Scope immutability.** The [Scope] field is set on [Allocate] and never changes. A capability cannot be re-scoped after allocation. Changing what a capability authorizes requires allocating a new capability and revoking the old one.

**Invariant 9 — Revocation attribution completeness.** Every capability record in [Revoked] status has non-null [Revoked At], [Revoked By Ref], and [Revocation Reason]. A [Revoked] record missing any of these is evidence of a process violation.

**Invariant 10 — Every capability has a finite lifetime.** [Expires At] is never null. Every capability issued by this atom has a deterministic expiry time. Capabilities that do not expire are not expressible by this atom; an implementation that allocates capabilities without an [Expires At] has violated this invariant. The derived [Expired] status (Invariant 13) depends on this field always being present.

**Invariant 11 — Capability durability.** Once [Allocate] returns a [Capability Token], the capability record is durably persisted. A [Storage Failure] rejection guarantees no partial record was written. The atom provides no deletion surface.

**Invariant 12 — Capability token uniqueness.** No two capability records share a [Capability Token] across the lifetime of the system. The token is the injected `id_t`; a write that would reuse an existing [Capability Token] is rejected as [Storage Failure], so uniqueness is **store-enforced**, not merely probabilistic — and the token generation mechanism must additionally produce values with negligible collision probability (the deployment configures appropriate entropy; the token's random material is an injected input — see the injected-inputs commitment in Behavior). Tokens are not reused after a capability reaches a terminal state (stored or lapsed). Without this invariant, [Redeem] lookup semantics are undefined when two records share a token.

**Invariant 13 — Expiry is derived, never written.** No capability record carries a stored [Expired] status or an `expired_at` field. A capability's [Expired] condition is the value of the pure projection [Effective Status] = [Expired] ⟺ ([Status] = [Allocated] ∧ [Now] ≥ [Expires At]), computed at read time from the immutable [Expires At] and the injected clock [Now]. The clock is never read inside a transition, and no write fires when a capability lapses (the counter is not decremented, no status is written). This is what lets the stored-terminal invariants (6, 7) range over writes alone, and it removes the stored-flag-that-lags-the-clock failure mode (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls).

Invariants 1 and 3 together give the *authorization envelope* property — the capability's full authorization is readable from a single immutable record, and no identity check contaminates the bearer semantics. Invariants 2 and 4 give the *redemption integrity* property — the counter decrements exactly once per redemption, even under concurrency, and the exhaustion transition is atomic. Invariants 5, 6, and 13 give the *audit clarity* property — the audit record for a capability always answers "who allocated it and what it authorized" and never answers "who redeemed it," the two stored terminals are always unambiguous, and the derived [Expired] status is reproducible from [Expires At] and the read-time clock. Invariant 12 gives the *lookup determinism* property — [Redeem] always resolves to exactly one record or none.

Two emergent properties — not stated as numbered invariants but entailed by the combination of the above — confirmed by the formal model ([`capability.als`](./capability.als), this spec's sibling file):

- **Zero counter implies Redeemed.** [Remaining Redemptions] = 0 is only reachable via the exhaustion transition, which atomically sets [Status] = [Redeemed] (Invariants 2 and 4). [Revoke] does not decrement the counter, and lapse never writes (Invariant 13). Therefore [Remaining Redemptions] = 0 and [Status] ≠ [Redeemed] is an unreachable configuration. An implementation that reaches this state has violated Invariant 4.
- **Revoked records always have [Remaining Redemptions] > 0.** [Revoke] requires stored [Status] = [Allocated] and an open window (hence [Remaining Redemptions] > 0, by Invariant 4's structural half) and preserves the counter. Stored terminals are absorbing (Invariant 7). Therefore a [Revoked] record with [Remaining Redemptions] = 0 is unreachable; it would require a revoke-after-exhaustion path that the action wiring disallows.

---

## Examples

### Single-use password-reset link

An account service allocates a capability when a user requests a password reset:

`allocate(allocator_ref: account_svc_a01, scope: "password-reset::user_u91", max_redemptions: 1, ttl: 900) → capability_token: tok_cap_x7y2z9`

The seam-injected clock reads `2026-10-01T14:00:00Z`. The atom creates a record: `status: Allocated`, `remaining_redemptions: 1`, `allocated_at: 2026-10-01T14:00:00Z` (stamped from the injected clock), `expires_at: 2026-10-01T14:15:00Z` (`allocated_at + ttl`).

The service emails the user a link embedding `tok_cap_x7y2z9`. The user clicks the link within 15 minutes. The password-reset handler calls:

`redeem(capability_token: tok_cap_x7y2z9) → redeemed(scope: "password-reset::user_u91", allocator_ref: account_svc_a01)`

The seam-injected clock now reads `2026-10-01T14:03:22Z`. The atom checks stored `status = Allocated` and `now < expires_at` (the 15-minute window is still open), decrements `remaining_redemptions` from 1 to 0, and atomically transitions status to the stored terminal `Redeemed`, writing `redeemed_at: 2026-10-01T14:03:22Z` (stamped from the injected clock). The handler interprets the scope, presents the new-password form to the user, and accepts the new password. No identity check was performed at `redeem` time.

If the user tries the link again (clock now `2026-10-01T14:05:00Z`): `redeem(tok_cap_x7y2z9) → invalid(exhausted)`. The capability is in `Redeemed` status; no further redemptions are possible.

### Multi-use pre-signed read token

A document service allocates a 10-use capability granting read access to a specific document:

`allocate(allocator_ref: doc_svc_d01, scope: "read::document::doc_d448", max_redemptions: 10, ttl: 86400) → capability_token: tok_cap_r3q8p1` (clock reads `2026-10-05T08:00:00Z`)

Five colleagues redeem the token over the course of the day, each calling `redeem(tok_cap_r3q8p1)` from their respective systems. After each call, `remaining_redemptions` decrements: 10 → 9 → 8 → 7 → 6 → 5. Each call's guard confirms `now < expires_at` by pure derivation against the seam-injected clock (each redeemer's pipeline reading). No redeemer identity is recorded. After the 10th redemption, the capability transitions to the stored terminal `Redeemed`.

### Rejection paths

**`redeem` — `invalid(expired)` (derived):** A capability allocated with a 1-hour TTL is not redeemed within the hour. A colleague emails the token link to someone who opens it 90 minutes later:

`redeem(capability_token: tok_cap_x7y2z9b) → invalid(expired)` — the seam-injected clock reads `2026-10-02T10:30:00Z`.

The atom finds the record: stored `status: Allocated`, `expires_at: 2026-10-02T09:00:00Z`. The guard evaluates `is_lapsed(record, now)` — stored `status` is still `Allocated` but the injected `now ≥ expires_at` — and returns `invalid(expired)`. **Nothing is written**: the record stays stored-`Allocated`, `remaining_redemptions` stays at 1 (the unredeemed allocation is forfeit), and there is no `expired_at` field. A `read` of the record now reports `effective_status = Expired`, derived from the immutable `expires_at` and the read-time clock.

**`redeem` — `invalid(revoked)`:** A data-sharing capability is revoked after the sharing window closes:

`revoke(capability_token: tok_cap_r3q8p1b, revoked_by_ref: admin_a01, reason: "sharing-window-closed-2026-10-31") → revoked` (clock reads `2026-10-31T17:00:00Z`, window still open)

A system that cached the token and attempts redemption after revocation (clock now `2026-10-31T18:00:00Z`):

`redeem(tok_cap_r3q8p1b) → invalid(revoked)`

**`revoke` — `already-terminal`:** An automated cleanup script attempts to revoke a capability that already exhausted itself:

`revoke(capability_token: tok_cap_x7y2z9, revoked_by_ref: cleanup_svc, reason: "post-exhaustion-cleanup") → rejected(already-terminal)` (clock reads `2026-10-01T15:00:00Z`)

The capability is in stored `Redeemed` status. The script notes the state and moves on; no revocation record is written. (A `revoke` on a still-`Allocated` capability whose window has lapsed likewise returns `already-terminal` — by derivation against the injected `now`, writing nothing.)

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A GDPR (General Data Protection Regulation) auditor asks *"who authorized the disclosure of data subject DS-99's records that occurred on 2026-11-14?"* The composing Capability-Backed Sharing pattern links the disclosure event to the capability token used. The auditor queries the capability store for that token and reads the record: `allocator_ref: data_controller_dc01`, `scope: "disclose::subject::DS-99::fields::[name,address,dob]"`, `allocated_at: 2026-11-14T10:00:00Z`, `expires_at: 2026-11-14T18:00:00Z`. Invariant 1 (allocation provenance immutability) is the structural answer: the auditor knows who authorized the disclosure (the data controller), what was authorized (the specific field set), and the time window in which it was valid — from the record alone. The auditor cannot determine who redeemed the capability; Invariant 3 (bearer redemption) makes this structurally unavailable, and the auditor's question is satisfied by knowing the allocator, not the redeemer.

**Disputed disclosure.** An external recipient claims *"I never received any data from you — there must be a data leak elsewhere."* The composing Capability-Backed Sharing pattern's audit record shows that capability `tok_cap_r3q8p1c` was redeemed (status: Redeemed, `remaining_redemptions: 0`, `redeemed_at: 2026-11-14T14:22:00Z`). The capability's `scope` shows exactly which data was authorized for disclosure. The audit trail (from the composing pattern) shows a disclosure event correlated with this redemption. Invariant 5 (audit asymmetry) clarifies the forensic boundary: the capability record proves a disclosure was authorized and occurred, but does not prove the identity of the system that redeemed it — only that a bearer of the token presented it at the recorded time. Whether the recipient's denial is accurate (the token was stolen before redemption) or inaccurate is a question the atom's records cannot resolve; they bound the forensic window without resolving identity.

**Breach investigation.** A security team discovers that a batch of capability tokens was exposed in a log file between `2026-12-01T00:00:00Z` and `2026-12-03T12:00:00Z`. The team queries the capability store for all capabilities allocated by `allocator_ref: api_gateway_g01` during that window, reading each record's derived `effective_status` against the investigation-time clock. The query returns 23 capabilities across various scopes. The team calls `revoke(..., now)` on every one that is still live — applying the derived liveness predicate `effective_status = Allocated` (i.e. stored `status = Allocated AND now < expires_at`; see Behavior) — recording `revoked_by_ref: security_team_s01` and `reason: "log-exposure-incident-2026-12-03"`. For the rest, the team notes whether each reads `Redeemed` (redemption may have been legitimate or by an attacker), `Expired` (still stored-`Allocated` but past its window, so no write ever occurred and none is needed — any `redeem` on it returns `invalid(expired)`), or `Revoked` (already handled). Invariants 6 and 13 (two stored terminals plus the derived `Expired`) make this triage possible from the record store and the read-time clock alone.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Allocator authorization.** Whether the actor referenced by [Allocator Ref] has the right to allocate a capability for the given [Scope] is a policy question the atom cannot answer. The atom records whoever calls [Allocate] as [Allocator Ref] without validating their authority. A composing pattern (e.g., one that gates capability allocation on a Permissions check) is where allocator authorization is enforced.
- **Scope interpretation.** The atom treats [Scope] as an opaque blob. Whether `scope: "read::document::doc_d448"` is a valid scope, what it means operationally, and what the redeemer does with the [Scope] value returned by [Redeem] belong entirely to the composing pattern. The atom stores it and returns it; it does not evaluate it.
- **Redeemer identity recording.** By design, the atom records no redeemer identity. If a composing pattern needs to know who redeemed a capability (for audit, accountability, or compliance purposes), it must record that information in its own records, outside the atom's boundary. The atom's bearer-key semantics mean redeemer identity belongs to the composing layer, not the atom layer.
- **Token delivery channel.** How the [Capability Token] reaches the intended bearer — email link, API response, QR code, direct message — is entirely outside the atom's scope. The atom produces a token; the caller delivers it.
- **Token confidentiality in transit.** Whether the token is transmitted over an encrypted channel, embedded in a signed envelope, or protected by any other transport-layer mechanism is handled at the deployment layer. The atom commits that the token is cryptographically random; it does not commit to any transport security.
- **Capability chaining and delegation.** A bearer who redeems a capability cannot use the atom to sub-allocate a narrowed capability to a third party — that would require calling [Allocate] with a narrowed [Scope], which is a separate allocation event under a new [Allocator Ref]. Whether that kind of delegation is permitted in a given system is a composing-pattern policy concept.
- **Revocation notification.** When a capability is revoked, the atom does not notify the bearer, the allocator, or any downstream system. Notification is a composing-pattern concept.
- **Identity-bound authorization.** If the authorization model requires knowing *who* is requesting access — not just that they hold a token — Permissions is the correct primitive, not Capability. The two atoms are structurally distinct and are not interchangeable. The OCAP model deliberately separates possession from identity; a system that needs both checks should compose both atoms.
- **Invitation semantics.** Invitation (atom #14) is a related but distinct primitive: it also uses bearer-token transport, but the resolution of an Invitation binds an identity (`Declined` is a named terminal state; the accepting party is identified at redemption time). If what is needed is an onboarding flow that concludes with an identity binding, Invitation is the correct atom. The distinction is addressed in the Open taxonomy question in roadmap.md.
- **Clock accuracy and the injected clock.** [Allocated At] and [Expires At] are stamped from the **injected** clock [Now] (the pipeline's `clock_t`) once at [Allocate], never read inside a transition; the same injected [Now] drives the pure expiry derivation ([Redeem]'s `invalid(expired)`, [Revoke]'s lapsed [Already Terminal]) and [Read]'s [Effective Status]. The atom assumes a single deployment clock; clock skew, monotonicity, and timezone normalization are deployment concerns. Because expiry is *derived* rather than stamped, two readers evaluating [Effective Status] with slightly skewed clocks near [Expires At] may briefly disagree on whether a record reads [Expired] — the standard read-time-derivation consequence, bounded by the deployment's clock-skew envelope and harmless because no write is at stake. A token can be replayed (presented multiple times) up to [Max Redemptions] and until [Expires At]; these are the only guards the atom provides. Replay protection beyond what the counter and expiry provide (e.g., nonce-based one-time-use validation) is handled at the deployment-configuration layer.
- **Capability store tamper-evidence.** The atom does not implement cryptographic chaining on the capability store. Composing with Tamper Evidence is available for deployments that require proof that no capability record was retroactively altered.
- **External purge and retention.** The atom provides no deletion surface (Invariant 11), but it does not prohibit the deployment from purging old terminal records under a retention policy — that is the composing pattern's call (Retention Window / Defensible Retention are the patterns). The consequence is named, not hidden: a purged token presented to [Redeem] or [Revoke] returns [Not Known], which therefore subsumes "never allocated" and "allocated, terminal, and since purged" — the atom cannot distinguish them, and Invariant 12's lifetime-uniqueness claim is scoped to the records the store retains. A deployment whose audit obligations require distinguishing these cases must retain terminal records (or their Audit Trail projection) for the obligation's window.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Allocate

The behavior an allocating actor invokes to create a new capability and receive its [Capability Token]. It records the [Allocator Ref], [Scope], [Max Redemptions], [Allocated At], and [Expires At] = [Allocated At] + [TTL], sets [Remaining Redemptions] = [Max Redemptions], enters the record in [Allocated], and returns the [Capability Token] (or a rejection). It makes no policy judgment about whether the allocation is appropriate.

Kind: Operation

#### Redeem

The behavior a bearer invokes to exercise a capability, presenting only the [Capability Token] — no identity argument. On a live capability it decrements [Remaining Redemptions] and returns `redeemed(scope, allocator_ref)`; the call that brings the counter to zero atomically transitions the record to [Redeemed]. It is not idempotent and records no redeemer identity. Its five outcomes (`redeemed`, `invalid(exhausted | expired | revoked | not-known)`) are all first-class.

Kind: Operation

#### Revoke

The behavior invoked to cancel a still-live capability, with attribution. Permitted only while stored [Status] = [Allocated] and [Now] < [Expires At]; it transitions the record to [Revoked] and stamps [Revoked At], [Revoked By Ref], and [Revocation Reason]. On a stored terminal or a lapsed window it returns [Already Terminal].

Kind: Operation

#### Read

The render-time behavior that returns the matching capability records, each carrying its derived [Effective Status]. It only reads; no record changes. It is the surface every liveness query applies, since a raw [Allocated] with [Expires At] in the past reads [Expired], not live.

Kind: Operation

#### Capability Token

The opaque, cryptographically random, immutable, system-generated value [Allocate] produces — both the record's identity and the bearer credential presented to [Redeem] and [Revoke]. It is the injected `id_t`; no two records share one, and it is not reused after a capability reaches a terminal state.

Kind:     Field
Field of: Capability
Projects: capability_token

#### Allocator Ref

The opaque reference to the actor or mechanism that allocated the capability — the one identity the record permanently carries (the audit asymmetry). Set on [Allocate], immutable thereafter. The atom does not validate that it is an active principal.

Kind:     Field
Field of: Capability
Projects: allocator_ref

#### Scope

The opaque value describing what the capability authorizes, returned to the bearer by [Redeem]. The atom stores and returns it but never interprets it; the composing pattern defines and reads scope values. Set on [Allocate], immutable thereafter.

Kind:     Field
Field of: Capability
Projects: scope

#### Max Redemptions

The total number of redemptions permitted, set on [Allocate] (or 1 if null — the single-use default). Immutable thereafter; [Remaining Redemptions] is initialised from it.

Kind:     Field
Field of: Capability
Projects: max_redemptions

#### Remaining Redemptions

The redemptions still available — the one mutable field between allocation and a stored terminal. Set to [Max Redemptions] on [Allocate], decremented by exactly 1 on each successful [Redeem], never increasing; reaching 0 is the exhaustion transition to [Redeemed].

Kind:     Field
Field of: Capability
Projects: remaining_redemptions

#### Allocated At

The wall-time [Allocate] was called, stamped from the injected [Now]. Immutable thereafter. [Expires At] is computed once as [Allocated At] + [TTL].

Kind:     Field
Field of: Capability
Projects: allocated_at

#### Expires At

The absolute expiry time, set on [Allocate] as [Allocated At] + [TTL]. Never null and never mutated. It is the sole stored input to the expiry derivation: a still-[Allocated] record reads [Expired] once [Now] ≥ [Expires At].

Kind:     Field
Field of: Capability
Projects: expires_at

#### Status

The stored status of a capability: [Allocated], [Redeemed], or [Revoked]. Set to [Allocated] on [Allocate]; transitions once to a stored terminal and never returns. The derived [Expired] is *not* a value of this field — it appears only in the [Effective Status] read projection.

Kind:     Field
Field of: Capability
Projects: status

#### Redeemed At

The wall-time the capability exhausted (its counter reached zero), stamped from the injected [Now]. Present only in [Redeemed]; null otherwise; immutable once set.

Kind:     Field
Field of: Capability
Projects: redeemed_at

#### Revoked At

The wall-time the capability was revoked, stamped from the injected [Now] on [Revoke]. Present only in [Revoked]; null otherwise; immutable once set.

Kind:     Field
Field of: Capability
Projects: revoked_at

#### Revoked By Ref

The opaque reference to the actor or mechanism that performed the revocation. Required at [Revoke]; null until revocation; immutable once set.

Kind:     Field
Field of: Capability
Projects: revoked_by_ref

#### Revocation Reason

The caller-supplied reason recorded for the revocation (from the [Reason] parameter). Required at [Revoke]; null until revocation; immutable once set.

Kind:     Field
Field of: Capability
Projects: revocation_reason

#### Effective Status

The status [Read] attaches to each returned record: [Expired] when [Status] = [Allocated] ∧ [Now] ≥ [Expires At], otherwise the stored [Status]. A pure projection over the record and the injected [Now] — derived at read time, never stored — and what makes [Redeem] return `invalid(expired)`. Every liveness query applies it.

Kind:     Field
Field of: Capability
Projects: effective_status

#### TTL

The validity duration [Allocate] consumes to compute [Expires At] ([Allocated At] + [TTL]). Supplied per call; if null, the deployment's default applies; zero or negative is rejected. It is never stored under its own name — only the computed [Expires At] is stored.

Kind:         Parameter
Parameter of: Allocate
Projects:     ttl

#### Reason

The caller-supplied reason string [Revoke] consumes, written into [Revocation Reason]. Required (non-null, non-empty); not stored under this name.

Kind:         Parameter
Parameter of: Revoke
Projects:     reason

#### Now

The current clock reading every action consumes — the pipeline's `clock_t`, injected at the I/O seam, never read inside a transition and never a signature parameter. It stamps the immutable write timestamps ([Allocated At], [Redeemed At], [Revoked At]) and drives the pure expiry derivation in guards and [Read] (no write).

Kind:         Parameter
Parameter of: Allocate
Projects:     now

#### Allocated

The single non-terminal stored state: the capability may be redeemed, with [Remaining Redemptions] > 0. A record enters [Allocated] on [Allocate] and leaves it only by a write — exhaustion to [Redeemed], revocation to [Revoked]. A still-[Allocated] record past [Expires At] reads [Expired] by derivation.

Kind:      Member
Member of: the capability status
Role:      Outcome

#### Redeemed

The stored terminal a capability reaches when its redemption counter hits zero (exhaustion). Carries [Redeemed At] and [Remaining Redemptions] = 0. Absorbing: no transition leaves it.

Kind:      Member
Member of: the capability status
Role:      Outcome

#### Revoked

The stored terminal a capability reaches when it is explicitly cancelled within its window. Carries [Revoked At], [Revoked By Ref], and [Revocation Reason]. Absorbing: no transition leaves it.

Kind:      Member
Member of: the capability status
Role:      Outcome

#### Expired

The derived terminal mode — never stored. A still-[Allocated] record whose window has lapsed ([Now] ≥ [Expires At]) reads [Expired] via the [Effective Status] projection; no field is written and the counter is never decremented by lapse.

Kind:      Member
Member of: the capability status
Role:      Outcome

#### Not Known

The outcome returned when the supplied [Capability Token] references no record — `invalid(not-known)` from [Redeem], a [Not Known] rejection from [Revoke]. A lookup miss; after external purge it also subsumes once-allocated-but-purged records.

Kind:      Member
Member of: the action outcome
Role:      Outcome
Projects:  not-known

#### Already Terminal

The refusal [Revoke] returns when the capability is not revocable — a stored terminal ([Redeemed] or [Revoked]) *or* a still-[Allocated] record whose window has lapsed (which reads [Expired]). A pure derivation that writes nothing.

Kind:      Member
Member of: the Revoke rejection
Role:      Outcome
Projects:  already-terminal

#### Invalid Request

The refusal [Allocate] or [Revoke] returns when an argument is malformed — a null/empty [Allocator Ref], [Scope], [Revoked By Ref], or [Reason], a non-positive [Max Redemptions] or [TTL], or an absent deployment default. A guard rejection before any store write; no record is created or changed.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Storage Failure

The refusal [Allocate] or [Revoke] returns when the store write fails after the preconditions pass. No partial record is written (for [Allocate]) or no state change is committed (for [Revoke]); a token-reuse write is also rejected here (Invariant 12). The caller must treat it as definitive.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Allocate]: #allocate
[Redeem]: #redeem
[Revoke]: #revoke
[Read]: #read
[Capability Token]: #capability-token
[Allocator Ref]: #allocator-ref
[Scope]: #scope
[Max Redemptions]: #max-redemptions
[Remaining Redemptions]: #remaining-redemptions
[Allocated At]: #allocated-at
[Expires At]: #expires-at
[Status]: #status
[Redeemed At]: #redeemed-at
[Revoked At]: #revoked-at
[Revoked By Ref]: #revoked-by-ref
[Revocation Reason]: #revocation-reason
[Effective Status]: #effective-status
[TTL]: #ttl
[Reason]: #reason
[Now]: #now
[Allocated]: #allocated
[Redeemed]: #redeemed
[Revoked]: #revoked
[Expired]: #expired
[Not Known]: #not-known
[Already Terminal]: #already-terminal
[Invalid Request]: #invalid-request
[Storage Failure]: #storage-failure

---

## Composition notes

Capability is freestanding. It is the sole constituent atom of Capability-Backed Sharing and contributes the bearer-key authorization primitive:

- **[Selective Disclosure](./selective-disclosure.md)** — in Capability-Backed Sharing, a capability's `scope` authorizes disclosure of a specific record subset. Selective Disclosure is the atom that records what was disclosed, to whom, and under what authority. The two atoms are distinct: Capability says "bearer of this token is authorized to see fields X, Y, Z of record R"; Selective Disclosure says "fields X, Y, Z of record R were disclosed on this date." The composition wires `redeem → redeemed(scope)` to a Selective Disclosure `disclose` call.
- **[Actor Identity](./actor-identity.md)** — `allocate` records `allocator_ref`. In regulated deployments, the allocation event is paired with an Actor Identity `attest` call to produce a non-repudiable record that a specific actor created the capability. The audit trail then reads "capability X was allocated by actor Y (attested)" rather than just "capability X was allocated by allocator_ref Y (unattested)."
- **[Audit Trail](../compositions/audit-trail.md)** — in regulated deployments, both `allocate` and each successful `redeem` call should be recorded in the Audit Trail. The atom does not mandate this; it is the composing pattern's obligation. Capability-Backed Sharing is the composition that wires capability lifecycle events into the audit record.
- **[Permissions](./permissions.md)** — Permissions is identity-keyed (gates on who is asking); Capability is bearer-keyed (gates on what token is presented). The two atoms are not interchangeable and are not in conflict — they express different authorization models. A system may use both: a permission check determines whether an actor may allocate a capability; the capability token determines whether the bearer may access the resource. The allocation-authorization surface belongs to Permissions; the redemption-authorization surface belongs to Capability.
- **[Tamper Evidence](./tamper-evidence.md)** — capability records, including the `allocator_ref` and `scope` fields, should be hash-chained in regulated deployments to ensure that the allocation provenance cannot be retroactively altered.
- **[Privileged Access Provisioning](../compositions/privileged-access-provisioning.md)** — calls `Capability.allocate` to provision the bearer token when the Multi-Party Approval chain reaches `Approved`, `Capability.redeem` inside `exercise_access` after session validation, and `Capability.revoke` via `revoke_access`. The redeemer's identity is intentionally not recorded by this atom; attribution for the full arc is carried in the Audit Trail.
- **[Capability-Backed Sharing](../compositions/capability-backed-sharing.md)** — the composition that wires Capability redemption to Selective Disclosure, producing the bearer-token/regulated-audit worked example. The emergent invariant: the audit record reads "disclosed by bearer of capability X, allocated by actor Y" — allocator is identified, redeemer is structurally not.
- **[Invitation](./invitation.md)** — Invitation is a related bearer-token primitive for identity onboarding. See Edge cases (Invitation semantics) and the Open taxonomy question in roadmap.md for the Capability-vs-Invitation design boundary.

---

## Standards references

- **Daniel Jackson, *Software Abstractions*** — `Capability [Resource]` is a concept in Jackson's concept catalog. The atom's `scope` field (what the capability authorizes), `allocate` and `redeem` actions, and the bearer-key semantics correspond directly to Jackson's formulation. Grace Commons expresses this concept in the atom format; the structural decisions are inherited from the concept catalog.
- **Mark Miller and the object-capability (OCAP) literature** — the formal theoretical grounding for bearer-key authorization. The principle *"an unforgeable reference to an object carries the authority to use that object"* is the foundation. Miller's work on capability-based security, including the E language and the Waterken server, establishes the invariants this atom formalizes.
- **Levy, H.M. (1984), *Capability-Based Computer Systems*** — the canonical reference for capability-based security systems. Levy establishes the three properties of capabilities: unforgeability, transferability, and access control by possession. The atom satisfies unforgeability (the `capability_token` — cryptographically random, opaque, system-generated) and access-control-by-possession (the bearer semantics of `redeem`); transferability and attenuation are deliberately outside the atom's surface — the atom neither prohibits, tracks, nor models token sharing or scope-narrowing delegation (see Edge cases — Capability chaining), so its claim on the OCAP literature is the bearer/unforgeability subset, not full conformance.
- **Birgisson, A., Politz, J.G., Erlingsson, Ú., Taly, A., Vrable, M., Lentczner, M. (2014), *Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud*** — Macaroons are a constrained Capability variant: a capability token that can be attenuated (scope narrowed) by adding caveats before being passed to a third party. The atom models the base Capability concept without macaroon-style attenuation; composing patterns that need contextual caveats may build on this atom.
- **RFC 6749 §1.4 (OAuth 2.0 — Access Tokens)** — OAuth 2.0 (the open authorization framework, version 2.0) access tokens are a widely deployed capability-adjacent pattern: a bearer token scoped to specific resources, with limited lifetime, that grants access without per-request identity verification. Cited with explicit caveats: OAuth 2.0 conflates bearer-token authorization with identity-bound flows (the authorization server authenticates the client; the token is identity-linked in practice even if the resource server checks only the token). This atom defines the pure OCAP surface — the token IS the authorization, with no identity linkage — which is a stricter and simpler model than OAuth 2.0 in full. Composing patterns that implement OAuth 2.0-compatible flows will compose this atom with identity-aware patterns.
- **GDPR Article 32 (Security of Processing)** — capability tokens are an access-control mechanism for regulated data disclosures. The `allocator_ref` and `scope` fields, immutably recorded and auditable from the capability store alone, satisfy the "appropriate technical measures" requirement for demonstrating that disclosures were authorized.
- **HIPAA (Health Insurance Portability and Accountability Act) §164.514(d) (Minimum Necessary Standard)** — the HIPAA requirement that disclosures be limited to the minimum necessary information. A capability's `scope` is the mechanism for encoding the minimum necessary field set; the composing Capability-Backed Sharing pattern is where the minimum-necessary constraint is enforced against the disclosure.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of separating bearer-key authorization (Capability) from identity-keyed authorization (Permissions) and from identity-binding onboarding (Invitation).
- **Eiffel's design-by-contract** — named rejection reasons; preconditions on `allocate` and `revoke`; first-class `redeem` outcomes.

---

## Generation acceptance

A derived implementation of Capability is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the capability record store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm allocation provenance for every capability.** For every record in the store, confirm that `allocator_ref`, `scope`, `max_redemptions`, `allocated_at`, and `expires_at` are non-null and unchanged from the values at allocation. The `capability_token` field should not expose raw entropy but should be opaque and stable. Invariant 1 is the structural guarantee; a record with a null or mutated `allocator_ref` is evidence of an implementation defect.
- **Confirm the redemption counter invariant.** For every record, confirm that `remaining_redemptions >= 0` and `remaining_redemptions <= max_redemptions`. Confirm that for records with `status = Redeemed`, `remaining_redemptions = 0` and `redeemed_at` is non-null. Confirm that for records with `status = Allocated`, `remaining_redemptions > 0`. Invariants 2 and 4 are the structural guarantees.
- **Confirm no redeemer identity is present in any record.** Inspect all fields of all records and confirm that no field records information identifying a redeemer. The absence of a `redeemer_ref`, `redeemed_by`, or equivalent field is the behavioral commitment of Invariant 3. An implementation that adds a redeemer identity field — even as an optional or informational field — has violated the bearer-key semantics the atom is built on.
- **Confirm the three terminal modes are structurally distinct — two stored, one derived.** Verify that `Redeemed` records have `redeemed_at` non-null and `remaining_redemptions = 0`, and that `Revoked` records have `revoked_at`, `revoked_by_ref`, and `revocation_reason` non-null. For the derived mode, confirm that **no** record carries a stored `Expired` status value or an `expired_at` field; for any stored-`Allocated` record, the auditor computes `effective_status = Expired ⟺ now ≥ expires_at` from the immutable `expires_at` and the read-time clock — reproducing exactly what `read` returns. No two stored terminals should be indistinguishable from the record alone, and a lapsed record reads `Expired` without any stored field of its own. Invariants 6 and 13 are the structural guarantees; a stored `Expired`, or an `expired_at` column, is a defect.
- **Confirm terminal finality and that expiry never wrote.** For records with `status = Redeemed`: confirm that `remaining_redemptions = 0` and `redeemed_at` is non-null, and that no further decrement of `remaining_redemptions` below zero is present — the exhaustion transition is the terminal event, and the counter cannot go lower. For records with `status = Revoked`: confirm that `remaining_redemptions` retains whatever value it held at the time of the revocation (revocation forfeits remaining redemptions without decrementing the counter). For a stored-`Allocated` record reading `Expired`: confirm `remaining_redemptions` is unchanged from a value consistent with its redemption history and that **no terminal field was written by the lapse** (no `redeemed_at`, no revocation fields, no `expired_at`) — lapse forfeits remaining redemptions by derivation, writing nothing (Invariant 13). Note that whether any `redeem` call was *attempted* after exhaustion, revocation, or lapse is not auditable from the record store alone — failing `redeem` calls leave no trace in the record. Stored-terminal finality is enforced by the implementation (Invariant 7), not reconstructable from records.
- **Confirm revocation attribution completeness.** For every record with `status = Revoked`, confirm that `revoked_at`, `revoked_by_ref`, and `revocation_reason` are all non-null. Invariant 9 is the guarantee.

---

## Status

`grounded on Final Critique 5 — 2026-06-23` — the **execution/render-time refactor** is complete and the closing fresh-reader Final Critique (Final Critique 5) returned clean. The stored `Expired` state, the "Clock advance past `expires_at` → Expired" transition, and all lazy-expiry writes were removed; `Expired` is now a derived `effective_status` projection computed at read time from the injected clock and the immutable `expires_at` (Invariant 13). The two stored terminals are `Redeemed` (exhaustion) and `Revoked`; exhaustion and revocation remain stored writes. The clock `now` is **pipeline-injected at the I/O seam** (not an action parameter — the 2026-06-21 now-explicit-signatures experiment was reverted) and consumed only by pure derivations (guards, `read`) and timestamp stamps (writes). The formal model (`capability.als` + buggy twin) was re-derived and re-verified green in the harness and the coverage matrix regenerated clean (see Lineage). Prior grounding: `grounded on Final Critique 4 — 2026-06-10` (scheduled rescan, council-run — three rounds to clean, findings folded, buggy twin `capability-buggy.als` landed, first coverage matrix emitted; see Lineage §Scheduled rescan 2026-06-10). See Lineage §Execution/render-time refactor and §Final Critique 5.

*Classification (post-flatten): stored flat as `atoms/capability.md` — no category folder. Capability is an authorization primitive with significant non-regulated uses (bearer-token authorization wherever it is needed), so its **regulated** and **security** classifications are overlays derived from its composers, not a folder it is filed under. This resolves the atom's former provisional `compliance/` placement and the question of relocating it to a security folder: under the [usage-derived taxonomy](./TAXONOMY.md), `security` is an overlay it carries (derived from its identity/access standards), not a domain or a directory.*

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

**Conventions inherited.** This atom carries the **regulated** and **security** overlays (both derived from its composers) and includes *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`pressure-testing.md`](../pressure-testing.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

**Structural decisions made in draft.**

- *`redeem` takes exactly one argument.* The signature is `redeem(capability_token)` with no identity argument — by design. An alternative (`redeem(capability_token, caller_ref)`) was considered and rejected: accepting an identity argument while not using it for authorization would create a misleading interface; using it for authorization would compromise the bearer-key semantics. The Decision points section defends this explicitly. Composing patterns that wish to record redeemer identity do so in their own records.
- *`capability_token` as record identity.* Same reasoning as Session: the token IS the identity. A separate `capability_id` would add indirection without structural benefit. The token is the bearer credential; it is also the store key.
- *`remaining_redemptions` as the only mutable non-status field.* This is the key structural departure from Credential and Session, which have no mutable fields between creation and terminal transition. The counter is essential to the multi-use capability model. Its monotonic-decrement invariant (Invariant 2) and atomicity requirement under concurrency (Invariant 4) are the two invariants that most directly require implementation care.
- *Five `redeem` outcomes, not two.* `redeemed(scope, allocator_ref)`, `invalid(exhausted)`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)` — all first-class. Collapsing terminal modes into a single `invalid` would destroy the audit-clarity property (Invariant 6) that makes the Regulated adversarial scenarios answerable from records alone.
- *`expires_at` is never null.* Capabilities without a finite lifetime are not expressible. Same design decision as Session, same rationale: "never expires" is not an auditable statement; "expires in 10 years" is. The deployment configures the default TTL; the atom enforces that one exists.
- *EOS Pass 2 boundary with Invitation.* The Capability-vs-Invitation design question is resolved by the `Declined` state and the identity-binding-at-acceptance that Invitation carries and Capability does not. Capability's `redeem` binds no identity and has no `declined` terminal state; Invitation's `accept` binds an identity and `decline` is a named terminal state representing a human decision. These are structurally distinct concepts. The authoring discipline: if Invitation's spec cannot be written without naming Capability's structure to distinguish itself, they collapse into one atom. The drafter of Invitation reads this spec as the Pass 2 mirror.

---

**Round 1.**

*Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).* One finding. **F1 — `revoke` missing `storage-failure`:** `revoke` writes four fields atomically (status, revoked_at, revoked_by_ref, revocation_reason) but its rejection vocabulary did not include `storage-failure`, unlike `allocate`. Fixed: `storage-failure` added to `revoke` signature and Decision points.

*Pass 2 — EOS conceptual independence.* Clean. Atom is freestanding; no other atom named in the structural elements.

*Pass 3 — Linus adversarial.* Two findings. **F2 — `redeem` Decision points missing the `Redeemed` case:** The Decision points checked not-known → revoked → expired → success path, but `status = Redeemed` was never explicitly handled. A caller presenting a token for an exhausted capability would match no case. Fixed: added explicit "`status = Redeemed` → `invalid(exhausted)`" check after the not-known case. **F3 — `revoke` on a capability past `expires_at` but `status = Allocated`:** A capability past its `expires_at` that had not yet undergone the lazy expiry transition could be successfully revoked, producing a `Revoked` record for a capability that was already effectively dead. Consistent with Credential F4 and Session F3. Fixed: `revoke` Decision points now treat a capability whose `expires_at` has passed as terminal; `revoke` returns `already-terminal` and may lazily transition the record to `Expired`.

Round 1 closed. Three findings; all resolved in-pattern; none deferred.

---

**Round 2.**

*Pass 1 — GRID structural.* One finding. **F4 — Summary and Outputs note said "four" `redeem` outcomes; five are listed:** The Summary said "one of four structurally distinct outcomes" but enumerated five (`redeemed`, `invalid(exhausted)`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)`). The Outputs note had the same off-by-one. Fixed: both updated to "five."

*Pass 2 — EOS conceptual independence.* Clean.

*Pass 3 — Linus adversarial.* One finding. **F5 — State section and Flow step 5 said lazy expiry fires only at `redeem`; inconsistent with F3 fix:** F3 added lazy-expiry detection to `revoke`, but State and Flow still named only `redeem` as the lazy-expiry trigger. Fixed: both updated to say lazy expiry fires at the next `redeem` or `revoke` call.

Round 2 closed. Two findings; both resolved in-pattern; none deferred.

---

**Round 3.**

*Pass 1 — GRID structural.* Clean. All nine nodes consistent after Round 1 and Round 2 fixes.

*Pass 2 — EOS conceptual independence.* Clean.

*Pass 3 — Linus adversarial.* One finding. **F6 — Feedback section said "no state change" for failing `redeem`; contradicted lazy expiry side-effect:** The Feedback section said "After `redeem` (failing) — no state change." But when `redeem` detects `now >= expires_at` on an Allocated capability, it fires the lazy Expired transition — a state change. Same class as Credential F7 and Session's equivalent correction. Fixed: Feedback updated to acknowledge the lazy Expired transition as a possible housekeeping side-effect when expiry is detected.

Round 3 closed. One finding; resolved in-pattern; none deferred. Baseline complete (Rounds 1–3). Proceeding to Final Critique.

---

**Final Critique 4 (Super Torvalds).**

One foundational finding fixed; one refining finding fixed for correctness.

**Final Critique 1 — Missing `capability_token` uniqueness invariant (foundational, fixed in-pattern).** The Identity Model stated "Tokens are not reused after a capability reaches a terminal state" — addressing only temporal reuse. There was no invariant asserting that no two capability records ever share a `capability_token`. Without this, `redeem(capability_token)` lookup semantics are undefined in the event of a collision, however negligible the probability. Session had an explicit token-uniqueness invariant (Session Invariant 7); Capability lacked the analog. Fixed: added Invariant 12 — "Capability token uniqueness" — mirroring Session Invariant 7's language. Updated the closing property summary to add "lookup determinism" to the property cluster.

**Final Critique 2 — Generation acceptance check 5 overstated what records can prove (refining, fixed for correctness).** Check 5 claimed to confirm "that no successful `redeem` call occurs after exhaustion, expiry, or revocation." For `Redeemed` records this is auditable (`remaining_redemptions = 0`, `redeemed_at` set). For `Expired` and `Revoked` records it is not — failing `redeem` calls leave no trace in the record store. The check overstated the auditor's power for two of the three terminal states. Fixed: check 5 rephrased to scope the auditable portions correctly — counter inspection for `Redeemed`, counter-value retention for `Expired`/`Revoked`, and an explicit note that post-terminal `redeem` attempt detection is not auditable from records alone.

Final Critique 4 closed clean. Foundational findings: zero remaining. Refining findings: none outstanding. Capability is `grounded on Final Critique 4`.

---

**Formal verification pass — Alloy structural model.**

Model: `atoms/capability.als` (twin file). Python bounded model checker: `atoms/capability_check.py`. Run (162 valid records generated; stores up to size 3; integer bound 4).

All 16 assertions passed — no counterexample found within scope:

- Structural: `A_CounterNonNeg`, `A_CounterNotExceedsMax`, `A_AllocHasRem`, `A_RedeemedExhausted`, `A_ZeroMeansRedeemed`, `A_RevokedHasAttrib`, `A_NonRevokedNoAttrib`, `A_TokenUniqueness`.
- Transition: `A_ExhaustionSetsRedeemed`, `A_PartialRedeemStaysAlloc`, `A_RedeemDecByOne`, `A_RedeemNonNeg`, `A_RevokePreservesCounter`, `A_RevokedRemPositive`, `A_ExpirePreservesCounter`, `A_TerminalAbsorbing`.

All 8 satisfiability runs found instances — model is not over-constrained. All four statuses (`Allocated`, `Redeemed`, `Expired`, `Revoked`) are reachable. Exhaustion, partial-redeem, revoke, and expire transitions all produce valid post-states.

Two emergent properties confirmed by the model and surfaced to the Invariants section:
- **Zero counter implies Redeemed** (entailed by I2 + I4 + I7).
- **Revoked records always have `remaining_redemptions > 0`** (entailed by revoke precondition + counter-preservation + I7).

No spec findings. The twelve named invariants are mutually consistent and together entail both emergent properties.

**Formal-layer vote — 2026-06-03: YES (model present).** Invariant 4 (exhaustion atomicity — exactly one concurrent `redeem` succeeds at `remaining = 1`) and Invariant 2 (monotonic counter) are interleaving-safety claims; the Alloy model confirms them. Verified by the sibling formal model (`capability.als`); the pattern remains `grounded`. Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — two corrections, 2026-06-03 (harness audit findings).** The 2026-06-03 `tools/harness/` sweep (headless Alloy via the `org.alloytools.alloy.dist` analyzer) ran `capability.als` and surfaced two defects, both now fixed in the model artifact (conflict-protocol case 2 — derived-artifact defects; the canonical English spec was untouched):

- *Never-typechecked assertion (fixed earlier 2026-06-03).* Line 193 read `r.status = Revoked implies no (r.status = Expired)` — `no` applied to a boolean. The file did not typecheck, so `A_TerminalModesDistinguishable` was never checked. Corrected to `r.status = Revoked implies r.status != Expired` (matching the line-191 form).

- *Vacuous transition layer (fixed 2026-06-03).* With the typecheck error cleared, the four transition `run` commands (`ShowExhaustionTransition`, `ShowMultiUsePartialRedeem`, `ShowRevokeTransition`, `ShowExpireTransition`) came back **vacuous** (no instance). Root cause: `fact TokenUniqueness` required *every* pair of distinct `CapabilityRecord` atoms to carry different tokens, but the transition predicates (`redeem_success`, `expire`, `revoke`) require `post.cap_token = pre.cap_token` — the pre/post pair models one capability across a step, not two co-existing records. The all-pairs uniqueness therefore made every transition *unsatisfiable*, which not only emptied the four runs but rendered the transition-level `check` asserts (immutability, counter-decrement, attribution, exhaustion, terminal-absorption) **vacuously true** — they constrained nothing. Fix (store-scoping, mirroring `notification.als`/`subscription.als`): a `Store { records : set CapabilityRecord }` snapshot sig was introduced and token-uniqueness re-scoped to `all s : Store | all disj r1, r2 : s.records | r1.cap_token != r2.cap_token`; the static uniqueness assert was re-scoped to match. Transition predicates were not touched and no assert was weakened. After the fix all four transition runs are satisfiable and the transition checks have teeth — independently verified by injecting a `cap_scope` mutation into `redeem_success`, which now produces a direct counterexample on `A_RedeemPreservesImmutable` (before the fix it held vacuously). Final state: all 22 checks UNSAT, all 10 runs satisfiable, `PASS`. (Drafted via a Sonnet subagent on the precise diagnosis above; gated by Opus re-run + independent bug-injection.)

---

**Scheduled rescan — 2026-06-10 (council-run; the first rescan batch under the automated-executor convention).** Selected by risk-weighted ordering: oldest rescan date (2026-05-19, Final Critique 4), composition fan-in 2 (Privileged Access Provisioning, Capability-Backed Sharing). Council formula: one agent per pass per round — Pass 1 / Pass 2 `claude-sonnet-4-6` (peer-spec verification permitted), Pass 3 `claude-opus-4-8` in strict fresh-reader mode (question sets + this spec, nothing else); triage and folds by the conducting session (`claude-fable-5`).

*Formal-layer finding (surfaced before any council pass ran):* **`capability.als` shipped no committed buggy twin** — the only Alloy model in the corpus without one. The 2026-06-03 fix above verified the checks' teeth via an ad-hoc injected mutation that was never committed, which is the "ran once" class the model-present bar (criterion 2) exists to forbid. Closed in-round: [`capability-buggy.als`](./capability-buggy.als) authored — the injected defect drops the exhaustion transition (`redeem_success` decrements but always leaves `status = Allocated`, the "implementation forgot the terminal write" hazard Invariant 4 forbids), with the two guarding facts weakened so the hazard is constructible rather than vacuously blocked. The harness rejects it on exactly the three expected counterexamples (`A_AllocatedHasRemaining`, `A_ZeroCounterMeansRedeemed`, `A_ExhaustionSetsRedeemed`) while the correct model stays green (22 checks UNSAT, 10 runs SAT). Scope bump: all checks re-run one scope up (`for 7`) — hold. First coverage matrix for this pattern emitted: [`tools/harness/coverage/capability.md`](../tools/harness/coverage/capability.md) — no GAP rows; the concurrent-redeem interleaving is recorded as a deliberate tool-split residual (TLC-class; exercised at the composition layer in Capability-Backed Sharing and PAP models).

Three council rounds to a clean close:

- *Round 1.* Pass 1: two refining findings folded (the formal-model path corrected from `formal/capability.als` to the sibling [`capability.als`](./capability.als); OAuth glossed in the Summary). Pass 2: clean. Pass 3 (fresh-reader): eight findings — seven *refining* + one *rhetorical*, all folded — `revoke` precondition evaluation order pinned (`not-known` → `already-terminal` → `invalid-request`, with the terminal-plus-empty-reason tie-break named); string input policy (byte-exact `allocator_ref` equality, whitespace-only = empty, deployment length caps including `scope`); `now` and the token's random material declared injected inputs per the Logic Confinement Principle; the `expires_at` boundary instant pinned to the dead side (`expires_at <= now` in Behavior, matching the `now >= expires_at` transition trigger and the `now < expires_at` redemption guard); Invariant 4's atomicity boundary named (one committed write — compare-and-swap or equivalent serializable isolation; a crash between decrement and status write leaves the pre-decrement state); the external-purge consequence named as a new Edge case (`not-known` subsumes purged-terminal records; Invariant 12's lifetime-uniqueness scoped to retained records; deployments with audit obligations must retain terminal records or their Audit Trail projection); the Levy/OCAP claim narrowed to the bearer/unforgeability subset (transferability and attenuation deliberately outside the surface — the rhetorical item); the derived liveness predicate (`status = Allocated AND now < expires_at`) made canonical for auditors and applied in the breach-investigation scenario.
- *Round 2.* Pass 1: two refining findings folded (stale peer-status markers — "Capability-Backed Sharing partially resolved", "atom #14 not started" — dropped in favor of bare links, per the no-snapshot rule's spirit: a peer's status mirrored into this file drifts, the linked file's own Status line is the SSOT; the two dangling "see Configuration in composing patterns" references repointed at the injected-inputs Behavior commitment). Pass 2 / Pass 3: clean.
- *Round 3.* Clean across all three passes — round closed; `grounded` retained; Status rescan date bumped to 2026-06-10.

*Measured cost (cost-model data point):* 9 council-agent invocations (6 Sonnet, 3 Opus) across 3 rounds, ≈520k subagent tokens, plus the twin authoring and three harness runs; also recorded in `ai-usage-log.md`.

---

**Execution/render-time refactor — 2026-06-21 (touch-triggered; status downgraded to `partially resolved`).** Direction (Scott): *derive expiry at read time; reduce execution-time clock dependence; clearly mark the residual.* Capability follows [`invitation.md`](./invitation.md) — the reference case for the corpus-wide sweep of clock-gated atoms — but with a key nuance: of Capability's **three** terminal modes, only **Expired** is time-derived, so only it was converted; **Redeemed** (counter reaches zero) and **Revoked** remain stored terminal writes. Changes:

- *Stored `Expired` removed; expiry derived.* Stored terminals are now `Redeemed` (exhaustion) and `Revoked`. `Expired` is a derived `effective_status` projection — `Expired ⟺ status = Allocated ∧ now ≥ expires_at` — computed at read time from the immutable `expires_at` and the injected clock. New **Invariant 13**. Applies the "derive the idealization, do not lag it with a flag" pitfall ([`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls) to the canonical English.
- *The "Clock advance past `expires_at` → Expired" transition, the lazy-expiry writes, and the eager-scheduler path removed.* Expiry never writes. The "lazily at the next `redeem` or `revoke` call that detects `now >= expires_at`" language is gone. A `redeem` on a lapsed (still-`Allocated`) capability returns the derived `invalid(expired)`; a `revoke` on it returns `already-terminal` — both by pure derivation against the injected `now`, writing nothing. The redemption counter is never decremented by lapse.
- *Clock surfaced as an injected input.* The pipeline's `clock_t` (`now`) is consumed only by (a) pure expiry derivations in guards and `read` (no write) and (b) immutable timestamp stamps inside committed transitions (`allocated_at`, `redeemed_at`, `revoked_at`). New Logic-confinement note in Decision points; rejection priority for `redeem` (`not-known` → `exhausted` → `revoked` → `expired`) and `revoke` pinned. *(As first written, this refactor threaded `now` as an explicit parameter on every action signature; that parameter was reverted 2026-06-23 — see the continuation entry below — to the pipeline-implicit form, where the execution contract injects `clock_t`/`id_t` at the seam rather than as arguments. The derived-expiry design is unchanged.)*
- *Token-uniqueness mechanism named.* Invariant 12 now states uniqueness is store-enforced (a write reusing a token is rejected `storage-failure`), not merely probabilistic — mirroring the Invitation refactor.
- *Sections updated:* summary blockquote, Intent, Summary, Identity model, Inputs/Outputs (+ a `read` surface with `effective_status`; stored status `Allocated|Redeemed|Revoked`; `expired_at` removed; the three-terminal-modes language now marks Expired as the derived one), State (stored states; "Expired is derived, never stored"; transitions = writes only — exhaustion→Redeemed, revoke→Revoked; "expiry is not a transition"), Decision points (+ Logic-confinement note and rejection priority), Behavior (audit-asymmetry retained; lazy/expire language rewritten), Feedback, Invariants 6/7/10/12 reworded and 13 added (allocation-provenance Inv 1 and bearer-redemption Inv 3 retained), Examples (now threaded; the expire example converted to a derived `invalid(expired)`), Edge cases (clock note), Generation acceptance (checks 4 and 5).
- *Constituent-change cascade:* removing the stored `Expired` value and the `expire`-by-scheduler/lazy path is a **breaking** change to Capability's surface (`Expired` no longer a stored status; the clock is now seam-injected rather than a stored-flag write). Compositions naming Capability require a touch-triggered re-pass: **[Capability-Backed Sharing](../compositions/capability-backed-sharing.md)** (wires `Capability.allocate`/`redeem`/`revoke`; redemption-and-disclosure surface) and **[Privileged Access Provisioning](../compositions/privileged-access-provisioning.md)** (calls `Capability.allocate`/`redeem`/`revoke`; its `request_to_capability` map note explicitly references Capability's `Expired` state, which is now derived, not stored). Both are flagged for re-pass; per AGENTS.md session hygiene, compositions are **not** edited here — the cascade is recorded only.
- *Formal model:* `capability.als` + `capability-buggy.als` re-derived to the new shape — `Expired` modeled as a **derived predicate** (`Lapsed(r, now) ≜ status = Allocated ∧ now ≥ expiresAt`, projected by `EffStatus`) computed from an injected `now`/clock value carried on the `Store` snapshot, **not** a stored state reached by a transition; the stored `Status` enum is now `{Allocated, Redeemed, Revoked}` with no `Expired` member and no `expire` transition; redemption-exhaustion and revocation stay stored writes. New checks: `A_NoStoredExpired` (store never holds an Expired value), `A_StoredTerminalNeverReadsExpired` and `A_LapsedHasNoTerminalFields` (derived/stored coherence), `A_RedeemOnlyWhenNotLapsed` and `A_RevokeOnlyWhenNotLapsed` (the load-bearing "a lapsed capability cannot be redeemed or revoked" guarantee). New runs `ShowDerivedExpired`, `ShowThreeTerminalModes`, `ShowLiveAndExpiredCoexist` confirm Expired is reachable as a *read* without any stored value. Store-scoped token uniqueness retained (pre/post pairs are the same entity across a step). The buggy twin's injected defect was switched to the render-time analog: it **drops the expiry guard** in `redeem_success` so a lapsed capability becomes redeemable (plus the historical exhaustion weakenings for belt-and-suspenders). Re-verified through `tools/harness/check.mjs` under JRE 17 on 2026-06-21: the correct model **PASS** (24 checks hold, 10 runs satisfiable — 34 commands; the original 2026-06-21 entry miscounted this as "23 checks / 11 runs," corrected 2026-06-23 per Final Critique F1) and the buggy twin **PASS** as `--buggy` (24 checks, 2 runs; 3 counterexamples — `A_RedeemOnlyWhenNotLapsed`, `A_AllocatedHasRemaining`, `A_ZeroCounterMeansRedeemed` — with `ShowBuggyRedeemWhileLapsed` satisfiable).

Pending: the full three-pass re-pass that, when clean, grounds the pattern at **Final Critique 5**.

---

**Refactor continuation — 2026-06-23 (signature revert + Final Critique fixes; Status held at `partially resolved`, re-gate still pending — not regrounded).** Three corrections to the 2026-06-21 work, no new grounding.

- *Signature revert — `now` removed from action signatures (pipeline-implicit).* The 2026-06-21 refactor had threaded `now` as an explicit parameter on every action (`allocate(..., now)`, `redeem(token, now)`, `revoke(..., now)`, `read(filter, now)`). Reverted: the clock reading (`clock_t`) and `allocate`'s token material (`id_t`) are **pipeline-injected at the I/O seam by the execution contract**, not action arguments — per `execution-contract.md`'s Logic Confinement Principle, the seam injects them rather than surfacing them as parameters. Signatures are now `allocate(allocator_ref, scope, max_redemptions, ttl)`, `redeem(capability_token)`, `revoke(capability_token, revoked_by_ref, reason)`, `read(filter)`. The **derived-expiry design is unchanged** (`expires_at` still computed once at allocate and stored; `effective_status` still the read-time projection `Expired ⟺ status = Allocated ∧ now ≥ expires_at`); the Logic-confinement note in Decision points was reworded to state the clock and token are seam-injected, not signature parameters. Sections touched: Inputs/Outputs (signatures + the `now` input bullet rewritten as a "seam-injected, not a parameter" note; `read` surface), State transitions, Flow, Decision points (Logic-confinement note + the three action headers), Behavior (the injected-inputs bullet), Invariant 12, Status block, Examples (all `now:` args dropped from the call lines, with each clock reading folded into the surrounding prose where the timestamp is load-bearing — chiefly the `invalid(expired)` example). The capability.als formal model is **unchanged by the revert** — it already carries the injected clock as an *internal* value on the `Store` snapshot (`Store.now`, read purely in the redeem/revoke guards), which is the correct model of a seam-injected clock and was never a signature parameter in the model.
- *Final Critique F1 — formal-model command count corrected (foundational).* The 2026-06-21 entry recorded "23 checks hold, 11 runs satisfiable"; the committed `capability.als` actually has **24 checks and 10 runs** (34 commands — the count the harness reports). Corrected in the 2026-06-21 *Formal model* bullet. The buggy twin `capability-buggy.als` has 24 checks and 2 runs (26 commands).
- *Final Critique F2 — coverage matrix regenerated.* `tools/harness/coverage/capability.md` was the pre-refactor (2026-06-10) matrix: it cited deleted constructs (`A_ExpirePreservesImmutable`, `A_TerminalAbsorbing`, `A_NoRedeemerField`, an "expire transition", four reachable statuses, 22 checks) and had no row for Invariant 13 or the lapsed-cannot-be-redeemed guarantee. Regenerated against the current `capability.als`: one row per Invariant (1–13) + both emergent claims + the lapsed-cannot-be-redeemed guarantee, each classed covered / by-construction / out-of-scope / GAP with the actual Alloy construct cited (no GAP rows), plus a corrected bound-saturation line (static checks `for 6`, transition checks `for 5 but 4 Int` — the old matrix's `for 7` scope-bump claim did not match the committed model).
- *Harness re-verification (JRE 17, 2026-06-23):* `node tools/harness/check.mjs atoms/capability.als` → **PASS** (24 checks hold, 10 runs satisfiable). `node tools/harness/check.mjs atoms/capability-buggy.als --buggy` → **PASS** (correctly rejected; counterexamples on `A_AllocatedHasRemaining`, `A_ZeroCounterMeansRedeemed`, `A_RedeemOnlyWhenNotLapsed`; `ShowBuggyRedeemWhileLapsed` satisfiable).
- *No composition edits* (the Capability-Backed Sharing / Privileged Access Provisioning cascade flagged in the 2026-06-21 entry remains recorded, not actioned, per session hygiene).

**Final Critique 5 — 2026-06-23 — clean (fresh-reader re-gate; council-run).** Closing fresh-reader Final Critique (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus at X2) over the execution/render-time refactor batch returned **zero foundational findings**. Formal model re-verified green in the harness, buggy twin(s) rejected, coverage cross-check clean (no GAP rows), bound saturated. Regrounded at Final Critique 5.

---

**Showcase pass — 2026-06-29 (from-scratch full-showcase conversion).** This atom had no `[Term]` annotation; this pass does the four-kind annotation **and** the showcase disciplines together, matching the [`duplicate-prevention.md`](./duplicate-prevention.md), [`provisional-commitment.md`](./provisional-commitment.md), and [`session.md`](./session.md) exemplars. **Annotation inventory (28 Terms):** four **Operations** ([Allocate], [Redeem], [Revoke], [Read]); thirteen **Fields** (all *Field of: Capability*) — [Capability Token], [Allocator Ref], [Scope], [Max Redemptions], [Remaining Redemptions], [Allocated At], [Expires At], [Status], [Redeemed At], [Revoked At], [Revoked By Ref], [Revocation Reason], and the derived [Effective Status]; three **Parameters** consumed but not stored under their own name — [TTL] (→ [Expires At]), [Reason] (→ [Revocation Reason]), and the injected [Now]; and eight **Members** — the stored states [Allocated]/[Redeemed]/[Revoked] plus the derived [Expired] (*Member of: the capability status*, no `Projects:` — pure states), and [Not Known], [Already Terminal], [Invalid Request], [Storage Failure]. The discriminator *stored-as-itself → Field, consumed/transient → Parameter* placed every datum cleanly ([Remaining Redemptions] is the one mutable stored Field; [TTL]/[Reason]/[Now] are consumed, never stored under those names). No **Type** card — the record is referred to plainly as "a capability" (Fields are *Field of: Capability*), mirroring [`permissions.md`](./permissions.md). Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). Survivors kept backticked: the labeled projected-contract signatures in Inputs; the [Redeem] outcome wire forms (`redeemed(scope, allocator_ref)`, `invalid(exhausted | expired | revoked | not-known)`); the concrete example invocations and their literal record values/returns in Examples; the pipeline/absent-field literals `clock_t` / `id_t` / `expired_at`; and the qualified `Capability.*` composition-wiring calls and not-yet-converted cross-page terms (Selective Disclosure's `disclose`, Invitation's `Declined`) in Composition notes. **Disciplines:** Summary moved to the very top + the descriptive blockquote folded out as redundant (every claim already carried by Summary/Intent/State/Invariants) + [`prose.md`](../working-ideas/prose.md) cut #1 (Summary run-ons split, lossless); cut #5 — the State `Transitions:` list rendered as a transition table (action · from · to · guard · stamps · result) with a derived-expiry contrast row, the **five** cell-resistant semantics kept in prose beside it (failed-guard *writes-nothing*; exhaustion atomicity; expiry-derived-never-written; the two stored terminals absorbing; the fixed [Redeem]/[Revoke] rejection priority); Lineage collapsed into this `<details>`. Cuts #2 (glossary) and #3 (cross-ref footer) assessed and skipped (acronyms inline per the corpus convention; provenance lives in the invariants/Composition notes). **Representational only** — every invariant and its number (1–13) is unchanged in force, including Invariant 4's exhaustion atomicity, Invariant 13's derived-expiry projection [Effective Status] = [Expired] ⟺ ([Status] = [Allocated] ∧ [Now] ≥ [Expires At]), the bearer-redemption (Invariant 3) and audit-asymmetry (Invariant 5) guarantees, and the two emergent properties; all action signatures and the `[Now] + [TTL]` / `[Now] ≥ [Expires At]` relations are identical; every `[Term]` resolves to its card. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 5 — 2026-06-23`. Gates: linter 0 (incl. the O-term resolver — all of this page's markers resolve against the registry); the Alloy model `capability.als` and its buggy twin `capability-buggy.als` are **UNTOUCHED** and still PASS / correctly-rejected; the derived manifest projects an identifier kind (Field) and an enumerated kind (Member) cleanly; `git status` shows only this `.md` modified (no `.als`); diff read line-by-line against the same-claim-or-weaker test.

</details>
