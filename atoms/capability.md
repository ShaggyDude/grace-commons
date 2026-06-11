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


> A security primitive: an unforgeable bearer token that carries its own authorization to access a specific resource or perform a specific action. Possession of the token is sufficient authorization — the redeemer's identity is permanently and intentionally not checked and not recorded. Each capability is an opaque (system-generated, cryptographically random) token; the allocator reference, scope, redemption limit, and expiry are immutable properties set on `allocate`. The contract the atom enforces is **bearer redemption** — `redeem` succeeds on possession alone, with no identity argument — paired with **allocation provenance** — the allocator's identity is recorded permanently and is the only identity in the capability's record. Three structurally distinct terminal modes: exhaustion (the redemption counter reaches zero → `Redeemed`), expiry (`expires_at` passes → `Expired`), and explicit revocation (`revoke` call → `Revoked`). These are never conflated.

---

## Intent

Many authorization problems are not about *who is asking* but about *what is being presented*. A password-reset link grants the right to set a new password to whoever holds the link — whether that is the legitimate account owner who received it by email, a trusted friend who was handed it, or an attacker who intercepted it. An API (Application Programming Interface) token grants access to a specific resource to whatever service presents it — no per-request identity verification is performed. A pre-signed URL (Uniform Resource Locator — a web address) grants read access to a file to anyone with the URL for its lifetime. In all three cases, the authorization is embedded in the token itself; the holder's identity is irrelevant by design.

The library's existing authorization model, Permissions, is identity-keyed: a permission check gates on *who is asking*, matching an actor reference against an access control list. Permissions is the right model when authorization is principal-bound — when it matters *which* actor is requesting access, not merely that someone with a token is requesting it. But Permissions is the wrong model for bearer-token authorization: modeling a password-reset link as a Permissions grant would require creating a principal for the link recipient before the link is sent, which defeats the purpose of a bearer credential. The two authorization primitives are structurally distinct and belong to separate atoms.

Capability is the library's expression of object-capability (OCAP — a security model in which unforgeable references to objects carry their own authority, eliminating the need for a separate access control list) theory as a structured-natural-language pattern. The atom isolates the bearer-token authorization primitive: `allocate` creates a capability, records who created it and what it authorizes, and returns a token; `redeem` accepts the token, checks that it is valid and not exhausted, and returns the authorization scope — with no identity argument and no identity record on the redemption side. The asymmetry between allocator (always known) and redeemer (intentionally unknown) is structural, not accidental, and is the atom's primary contribution to the composing system's audit record.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the capability record and its redemption counter), its own actions (`allocate`, `redeem`, `revoke`), and its own operational principles (bearer-key authorization, immutable scope, counter monotonicity). It does not implement the policy that governs when a capability should be allocated, the logic that interprets the scope returned by `redeem`, the audit trail that records what was done after redemption, or the identity verification that establishes the allocator's authority to allocate. Each is a composing-pattern concern; see Composition notes.

---

## Summary

Capability expresses bearer-token authorization: holding the token grants the right, no matter who is holding it. Each capability ties a scope (what it authorizes — opaque to the pattern, interpreted by whatever uses it) to a redemption envelope (how many times it can be used, and until when), and is identified by a cryptographically random token that doubles as the credential presented to redeem it — nothing else is required to redeem, and crucially no identity is asked for or recorded on the redemption side. The defining feature is this audit asymmetry: who created the capability is always recorded, but who used it is deliberately not — the record reads "allocated by X, scope Y, redeemed N times," never "redeemed by Z." A capability ends in one of three clearly separated ways: it runs out of redemptions (Redeemed), its time expires (Expired), or it is explicitly cancelled (Revoked); the default is single-use. This is the mechanism behind password-reset links, pre-signed file URLs, scoped API tokens, and OAuth (Open Authorization — the web's delegated-authorization framework) authorization codes. It deliberately does not decide when a capability should be issued, interpret the scope, or record what was done after redemption — and where the act of redeeming must bind an identity, that is a different pattern (Invitation), not this one.

---

## Structure

### Identity model

Every capability known to the system has a **`capability_token`** — an opaque, cryptographically random, immutable, system-generated value produced by `allocate`. The token is both the record's identity and the bearer credential the caller presents to `redeem` and `revoke`. Because the token is the bearer credential, it must be unguessable: sufficient entropy (the random material is an injected input from the deployment's entropy source — see the injected-inputs commitment in Behavior) and unpredictable from any public information about the allocator, the scope, or the allocation time.

The fields set on `allocate` — `allocator_ref`, `scope`, `max_redemptions`, `allocated_at`, `expires_at` — are immutable properties, never changed after allocation. The `remaining_redemptions` counter is the one field that changes between allocation and terminal transition; it decrements monotonically toward zero and never increases. All other terminal-state fields (`redeemed_at`, `revoked_at`, `revoked_by_ref`, `revocation_reason`) are null until set by their respective transitions, and immutable once set.

Tokens are not reused after a capability reaches a terminal state.

### Inputs and Outputs

**Actions:**

- `allocate(allocator_ref, scope, max_redemptions, ttl) → capability_token | rejected(invalid-request | storage-failure)`
- `redeem(capability_token) → redeemed(scope, allocator_ref) | invalid(exhausted | expired | revoked | not-known)`
- `revoke(capability_token, revoked_by_ref, reason) → revoked | rejected(invalid-request | already-terminal | not-known | storage-failure)`

**Inputs:**

- `allocator_ref` — an opaque reference to the actor or mechanism allocating the capability. Recorded as an immutable property of the record. Non-null and non-empty required. The atom does not validate that `allocator_ref` is a currently active principal; that is the caller's responsibility.
- `scope` — an opaque value describing what the capability authorizes. The atom treats this as a black box: it stores the scope on `allocate` and returns it on `redeem`. The composing pattern (e.g., Capability-Backed Sharing, C15) is responsible for defining and interpreting scope values. Non-null and non-empty required.
- `max_redemptions` — the maximum number of times the capability may be redeemed. Must be a positive integer. Null defaults to `1` (single-use). Zero and negative values are rejected as `invalid-request`.
- `ttl` (time-to-live — a validity duration) — a duration value specifying how long the capability is valid. Null uses the deployment's default capability TTL. `expires_at = allocated_at + ttl`. Must be positive if supplied; zero or negative is rejected as `invalid-request`.
- `capability_token` — the bearer credential the caller presents to `redeem` and `revoke`. Produced by `allocate`; supplied by the caller on subsequent calls.
- `revoked_by_ref` — an opaque reference to the actor or mechanism performing the revocation. Non-null and non-empty required.
- `reason` — caller-supplied reason string for the revocation. Non-null and non-empty required.

**String input policy (applies to every string input above).** Values are treated byte-exact: no trimming, no Unicode normalization, no case folding is applied before storage or comparison — `allocator_ref` equality (including the audit queries in Feedback and the Regulated scenarios) is byte-for-byte, so callers own canonicalization; two refs differing only in normalization form are two distinct allocators to this atom. A whitespace-only string counts as empty and is rejected wherever non-empty is required. The deployment sets a maximum length per string input (including `scope`); a value exceeding it is rejected as `invalid-request`.

**Outputs:**

- The current set of capability records. For each: `capability_token`, `allocator_ref`, `scope`, `max_redemptions`, `remaining_redemptions`, `allocated_at`, `expires_at`, `status`, `redeemed_at` (set when status transitions to Redeemed; null otherwise), `revoked_at` (nullable), `revoked_by_ref` (nullable), `revocation_reason` (nullable).
- `allocate` returns a new `capability_token` on success, or a rejection.
- `redeem` returns `redeemed(scope, allocator_ref)` on success, or `invalid(reason)`. Note: `redeem` is not a rejection-based action — all five outcomes (`redeemed`, `invalid(exhausted)`, `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)`) are first-class results, not errors. The caller is expected to handle all five.
- `revoke` returns `revoked` on success, or a rejection.

### State

Each capability record carries a `status` field and a `remaining_redemptions` counter. The state machine is:

- **Allocated** — the capability may be redeemed. `remaining_redemptions > 0`. This is the only non-terminal state.
- **Redeemed** — the capability's redemption counter reached zero. Terminal.
- **Expired** — `expires_at` has passed. Terminal.
- **Revoked** — explicitly revoked. Terminal.

Transitions:

- `allocate(allocator_ref, scope, max_redemptions, ttl)` → a new capability record is created in `Allocated` status with a fresh `capability_token`, the supplied `allocator_ref` and `scope`, `max_redemptions` (or 1 if null), `remaining_redemptions = max_redemptions`, `allocated_at = now`, and `expires_at = now + ttl` (or `now + default_ttl` if ttl is null). Returns `capability_token`.
- `redeem(capability_token)` when `Allocated` and `remaining_redemptions > 1` → `remaining_redemptions` is decremented by 1. Status remains `Allocated`. Returns `redeemed(scope, allocator_ref)`.
- `redeem(capability_token)` when `Allocated` and `remaining_redemptions = 1` → `remaining_redemptions` is decremented to 0; status transitions atomically from `Allocated` to `Redeemed`; `redeemed_at = now` is recorded. Returns `redeemed(scope, allocator_ref)`. This is the exhaustion transition.
- Clock advance past `expires_at` → status transitions from `Allocated` to `Expired`. May be triggered eagerly by a background scheduler or lazily at the next `redeem` or `revoke` call that detects `now >= expires_at`. Both paths are conformant.
- `revoke(capability_token, revoked_by_ref, reason)` → status transitions from `Allocated` to `Revoked`; `revoked_at = now`, `revoked_by_ref`, and `revocation_reason` are recorded.
- *(no transitions out of Redeemed, Expired, or Revoked)*

Each capability record carries:

- **`capability_token`** — opaque, cryptographically random, immutable, system-generated. Set on `allocate`. Never changes. The bearer credential.
- **`allocator_ref`** — opaque reference to the allocating actor. Set on `allocate`. Never changes.
- **`scope`** — opaque authorization descriptor. Set on `allocate`. Never changes.
- **`max_redemptions`** — total redemptions permitted. Set on `allocate`. Never changes.
- **`remaining_redemptions`** — redemptions remaining. Set to `max_redemptions` on `allocate`. Decremented by 1 on each successful `redeem`. Reaches 0 on exhaustion. Never increases.
- **`allocated_at`** — wall-time when `allocate` was called. Immutable.
- **`expires_at`** — absolute expiry time. Set on `allocate` as `allocated_at + ttl`. Immutable. Never null — every capability has a finite lifetime.
- **`status`** — Allocated | Redeemed | Expired | Revoked. Set to `Allocated` on `allocate`. Never returns to `Allocated` once terminal.
- **`redeemed_at`** — set when status transitions to `Redeemed` (exhaustion). Null otherwise. Immutable once set.
- **`revoked_at`** — set when status transitions to `Revoked`. Null otherwise. Immutable once set.
- **`revoked_by_ref`** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **`revocation_reason`** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Allocating actor decides to grant bearer-token access.** Calls `allocate(allocator_ref, scope, max_redemptions, ttl) → capability_token`. The atom creates the record and returns the token. The allocating actor delivers the token to the intended bearer — by email, by URL, by API response, by QR code — through whatever out-of-band channel is appropriate.
2. **Bearer presents the token.** The bearer's system calls `redeem(capability_token)`. The atom finds the record, checks status and expiry, decrements `remaining_redemptions`, and returns `redeemed(scope, allocator_ref)`. The calling pattern receives the scope and acts on it.
3. **Bearer continues to use a multi-use capability.** Each subsequent `redeem(capability_token)` decrements `remaining_redemptions` further. The capability remains in `Allocated` status as long as `remaining_redemptions > 0` and `expires_at` has not passed.
4. **Capability exhausts.** The `redeem` call that brings `remaining_redemptions` to zero atomically transitions the capability to `Redeemed`. The same call returns `redeemed(scope, allocator_ref)` — the last redemption succeeds. All future `redeem` calls for this token return `invalid(exhausted)`.
5. **Capability expires before exhaustion.** Either a background scheduler detects `now >= expires_at` and transitions the capability to `Expired`, or the next call that touches the capability — `redeem` (returning `invalid(expired)`) or `revoke` (returning `already-terminal`) — detects expiry lazily. Remaining redemptions are forfeit; the `remaining_redemptions` counter is not decremented by expiry.
6. **Allocating actor revokes the capability.** Calls `revoke(capability_token, revoked_by_ref, reason)`. The atom transitions the capability to `Revoked` and records the attribution. Future `redeem` calls return `invalid(revoked)`.

### Decision points

**At `allocate(allocator_ref, scope, max_redemptions, ttl)`:**
- `allocator_ref` and `scope` must be non-null and non-empty; otherwise `invalid-request`.
- `max_redemptions` must be a positive integer if supplied; null defaults to 1; zero or negative is `invalid-request`.
- `ttl` must be a positive duration if supplied; null uses the deployment default. Zero or negative is `invalid-request`. The deployment default must be configured; if absent, `allocate` returns `invalid-request`. (A capability store with no TTL policy is a deployment misconfiguration.)
- `expires_at` is computed as `allocated_at + ttl` once at `allocate` time and stored as immutable. The atom never re-derives `expires_at` from the current time.
- If the store write fails, `storage-failure` is returned with no partial record.

**At `redeem(capability_token)`:**
- The atom looks up the capability by `capability_token`. If no record is found, `invalid(not-known)`.
- If the record is found and `status = Redeemed`, `invalid(exhausted)`. The capability's redemption counter reached zero on a prior `redeem` call; no further redemptions are possible.
- If the record is found and `status = Revoked`, `invalid(revoked)`.
- If the record is found and (`status = Expired` OR `now >= expires_at`), `invalid(expired)`. In the lazy-expiry path, the atom may atomically write the `Expired` status transition at this point.
- If the record is found, `status = Allocated`, `now < expires_at`, and `remaining_redemptions > 0`:
  - Decrement `remaining_redemptions` by 1.
  - If `remaining_redemptions` is now 0: atomically transition status to `Redeemed` and set `redeemed_at = now`.
  - Return `redeemed(scope, allocator_ref)`.
- **No identity argument is accepted.** `redeem` takes exactly one argument: the `capability_token`. There is no `redeemer_ref`, no `caller_id`, no `principal` parameter. If a caller attempts to pass identity information, the atom does not record it. This is a deliberate design constraint, not an omission.

**At `revoke(capability_token, revoked_by_ref, reason)`:** preconditions are evaluated in the order listed — `not-known`, then `already-terminal`, then `invalid-request` — so any two conformant implementations return the same rejection for the same input (a `revoke` on a terminal capability with an empty `reason` returns `already-terminal`, never `invalid-request`):
- `capability_token` must reference a known record; otherwise `not-known`.
- The referenced capability's `status` must be `Allocated`; otherwise `already-terminal`. A capability whose `expires_at` has passed is treated as terminal for the purpose of this check — `revoke` returns `already-terminal` and may lazily transition the record to `Expired`.
- `revoked_by_ref` and `reason` must be non-null and non-empty; otherwise `invalid-request`.
- The transition to `Revoked` and the writes of `revoked_at`, `revoked_by_ref`, and `revocation_reason` are atomic. If the store write fails after all preconditions pass, `storage-failure` is returned with no state change committed.

### Behavior

- **`redeem` accepts no identity argument — by design, not by omission.** The bearer-key principle is that possession of the token is sufficient authorization. Accepting a `redeemer_ref` argument would create the appearance of identity-keyed authorization while the actual check is still bearer-keyed — a misleading interface that obscures the authorization model from the composing system. The atom's `redeem` signature makes the bearer-key semantics explicit and unambiguous. Composing patterns that need to record who redeemed a capability (e.g., for audit purposes) may do so in their own records; the atom's record will never show a redeemer identity.
- **The redemption counter is the only mutable field between allocation and terminal transition.** All other fields are immutable after `allocate`. This makes the capability's authorization envelope fully auditable from the allocation record alone: what was authorized (`scope`), how many times (`max_redemptions`), until when (`expires_at`), by whom (`allocator_ref`). The counter's current value indicates how many redemptions remain.
- **Exhaustion, expiry, and revocation are structurally distinct.** A `Redeemed` record has `redeemed_at` non-null and `remaining_redemptions = 0`. An `Expired` record has `expires_at <= now` — the boundary instant `now = expires_at` is on the dead side, matching the transition trigger `now >= expires_at` and the redemption guard `now < expires_at` (and no `redeemed_at` unless it coincidentally expired and was separately exhausted — which cannot happen since a terminal state is absorbing). A `Revoked` record has `revoked_at`, `revoked_by_ref`, and `revocation_reason` non-null. An implementation that collapses these into a single "invalid" state loses the structural distinction that makes the audit record informative.
- **Lazy terminal transitions are best-effort bookkeeping; `status` is not the liveness authority.** A capability past its `expires_at` that no call or scheduler has yet touched legitimately shows `status = Allocated` in the store. Liveness is therefore a derived predicate — `status = Allocated AND now < expires_at` — never the raw `status` field; a raw `Allocated` with `expires_at` in the past is a not-yet-reaped Expired record, not a live capability. Auditors and administrative queries (including the Regulated scenarios' "still in `Allocated` status" triage) must apply the derived predicate. The lazy write itself is a guarded compare-and-set on `status = Allocated`, so it never double-fires against a concurrent terminal transition, and a lazy write lost to a crash is harmless — the determination is recomputed from `expires_at` on every call.
- **`now` and the token's random material are injected inputs.** Every action that reads the clock takes `now` as an explicit injected input, and `allocate`'s cryptographically random token material is supplied by the deployment's entropy source (a cryptographically secure generator, sufficient for Invariant 12's negligible-collision requirement) at the seam — per the Logic Confinement Principle (see `execution-contract.md`), the core transition neither reads a wall clock nor generates randomness internally, so each transition is a pure function of its inputs and both sources remain auditable at the deployment layer. Clock quality (honesty, monotonicity, skew) remains a deployment concern (see Edge cases).
- **`redeem` is not idempotent.** Each call to `redeem` on an `Allocated` capability decrements `remaining_redemptions`. Two concurrent `redeem` calls on a capability with `remaining_redemptions = 1` must result in exactly one succeeding (returning `redeemed(...)`) and one failing (returning `invalid(exhausted)`). The decrement-and-check operation must be atomic. This is the one place where the atom's behavior under concurrency matters structurally: the exhaustion invariant (Invariant 4) must hold even under concurrent redemptions.
- **`allocate` makes no policy judgment.** The atom allocates a capability for whatever `scope`, `max_redemptions`, and `ttl` the caller supplies. Whether those values are appropriate, who is permitted to allocate capabilities for a given scope, and whether the allocator has the authority they claim are all composing-pattern concerns. An actor who calls `allocate` is recorded as `allocator_ref`; whether they had the right to do so is a policy question the atom cannot answer.

### Feedback

Each successful action produces an observable, measurable change:

- After `allocate` — a new capability record appears in `Allocated` status with a fresh `capability_token`, `allocator_ref`, `scope`, `max_redemptions`, `remaining_redemptions = max_redemptions`, `allocated_at`, and `expires_at`. Total record count increases by one. The token is returned to the caller.
- After `redeem` (succeeding) — `remaining_redemptions` decrements by 1. If `remaining_redemptions` reaches 0, `status` transitions to `Redeemed` and `redeemed_at` is set. Returns `redeemed(scope, allocator_ref)`.
- After `redeem` (failing) — returns `invalid(exhausted | expired | revoked | not-known)`. No state change, except: when the lazy-expiry path fires (`status = Allocated` and `now >= expires_at`), the atom atomically writes the `Expired` status transition as a housekeeping side-effect before returning `invalid(expired)`.
- After `revoke` — `status` transitions to `Revoked`; `revoked_at`, `revoked_by_ref`, and `revocation_reason` are set.

The capability store is queryable. Per-record fields (all listed above) are observable to authorized administrative surfaces. Composing patterns may query capabilities by `allocator_ref` or by `status` to support audit and administrative operations.

### Invariants

**Invariant 1 — Allocation provenance immutability.** Once a capability record is created, `capability_token`, `allocator_ref`, `scope`, `max_redemptions`, `allocated_at`, and `expires_at` never change. These fields constitute the capability's authorization envelope and are fully auditable from the record alone.

**Invariant 2 — Redemption counter monotonic.** `remaining_redemptions` is set to `max_redemptions` on `allocate` and decremented by exactly 1 on each successful `redeem`. It never increases. A record showing `remaining_redemptions > max_redemptions` is evidence of an implementation defect.

**Invariant 3 — Bearer redemption.** `redeem` takes exactly one argument: `capability_token`. No identity claim, no principal reference, no authentication check is performed. The redeemer's identity is not recorded in the capability record or in any output of the atom. This invariant is violated by any implementation that accepts, validates, or records redeemer identity as part of the `redeem` operation.

**Invariant 4 — Exhaustion atomicity.** The decrement of `remaining_redemptions` to zero and the transition of `status` to `Redeemed` occur as a single atomic operation. Under concurrent `redeem` calls on a capability with `remaining_redemptions = 1`, exactly one call succeeds (decrement to 0, transition to Redeemed, return `redeemed(...)`) and all others see the terminal state (return `invalid(exhausted)`). No implementation may permit `remaining_redemptions` to go below zero or allow more than `max_redemptions` total successful `redeem` calls. The atomicity boundary is the store: the decrement-and-transition must be one committed write (a compare-and-swap on `remaining_redemptions`, or equivalent serializable isolation on the record); a crash between an in-flight decrement and its status write must leave the pre-decrement state — partial writes are not a valid observable state, and an implementation whose store cannot guarantee this cannot host the atom.

**Invariant 5 — Audit asymmetry.** The allocation event permanently records `allocator_ref`. The redemption events record no redeemer identity. This asymmetry is structural: given the capability store, an auditor can always determine who allocated a capability (Invariant 1) but can never determine who redeemed it — by design. An implementation that attempts to infer redeemer identity from surrounding context and store it on the capability record has violated this invariant.

**Invariant 6 — Three structurally distinct terminal modes.** Exhaustion (status = `Redeemed`, `remaining_redemptions = 0`, `redeemed_at` non-null), expiry (status = `Expired`, `expires_at` in the past), and revocation (status = `Revoked`, `revoked_at` non-null, `revoked_by_ref` non-null, `revocation_reason` non-null) are distinguishable from each other in the record store. An implementation that collapses any two of these into a single terminal representation violates this invariant.

**Invariant 7 — Terminal state absorbing.** A capability in `Redeemed`, `Expired`, or `Revoked` status admits no further state transitions. `redeem` on a terminal capability returns the appropriate `invalid(...)` outcome. `revoke` on a terminal capability returns `already-terminal`.

**Invariant 8 — Scope immutability.** The `scope` field is set on `allocate` and never changes. A capability cannot be re-scoped after allocation. Changing what a capability authorizes requires allocating a new capability and revoking the old one.

**Invariant 9 — Revocation attribution completeness.** Every capability record in `Revoked` status has non-null `revoked_at`, `revoked_by_ref`, and `revocation_reason`. A `Revoked` record missing any of these is evidence of a process violation.

**Invariant 10 — Every capability has a finite lifetime.** `expires_at` is never null. Every capability issued by this atom has a deterministic expiry time. Capabilities that do not expire are not expressible by this atom; an implementation that allocates capabilities without an `expires_at` has violated this invariant.

**Invariant 11 — Capability durability.** Once `allocate` returns a `capability_token`, the capability record is durably persisted. A `storage-failure` rejection guarantees no partial record was written. The atom provides no deletion surface.

**Invariant 12 — Capability token uniqueness.** No two capability records share a `capability_token` across the lifetime of the system. Tokens are not reused after a capability reaches a terminal state. This invariant requires that the token generation mechanism produce values with negligible collision probability; the deployment must configure appropriate entropy (the token's random material is an injected input — see the injected-inputs commitment in Behavior). Without this invariant, `redeem(capability_token)` lookup semantics are undefined when two records share a token.

Invariants 1 and 3 together give the *authorization envelope* property — the capability's full authorization is readable from a single immutable record, and no identity check contaminates the bearer semantics. Invariants 2 and 4 give the *redemption integrity* property — the counter decrements exactly once per redemption, even under concurrency, and the exhaustion transition is atomic. Invariants 5 and 6 give the *audit clarity* property — the audit record for a capability always answers "who allocated it and what it authorized" and never answers "who redeemed it," and the terminal state is always unambiguous. Invariant 12 gives the *lookup determinism* property — `redeem` always resolves to exactly one record or none.

Two emergent properties — not stated as numbered invariants but entailed by the combination of the above — confirmed by the formal model ([`capability.als`](./capability.als), this spec's sibling file):

- **Zero counter implies Redeemed.** `remaining_redemptions = 0` is only reachable via the exhaustion transition, which atomically sets `status = Redeemed` (Invariants 2 and 4). `expire` and `revoke` do not decrement the counter. Therefore `remaining_redemptions = 0` and `status ≠ Redeemed` is an unreachable configuration. An implementation that reaches this state has violated Invariant 4.
- **Revoked records always have `remaining_redemptions > 0`.** `revoke` requires `status = Allocated` (hence `remaining_redemptions > 0`, by Invariant 4's structural half) and preserves the counter. Terminal states are absorbing (Invariant 7). Therefore a `Revoked` record with `remaining_redemptions = 0` is unreachable; it would require a revoke-after-exhaustion path that the action wiring disallows.

---

## Examples

### Single-use password-reset link

An account service allocates a capability when a user requests a password reset:

`allocate(allocator_ref: account_svc_a01, scope: "password-reset::user_u91", max_redemptions: 1, ttl: 900) → capability_token: tok_cap_x7y2z9`

The atom creates a record: `status: Allocated`, `remaining_redemptions: 1`, `allocated_at: 2026-10-01T14:00:00Z`, `expires_at: 2026-10-01T14:15:00Z`.

The service emails the user a link embedding `tok_cap_x7y2z9`. The user clicks the link within 15 minutes. The password-reset handler calls:

`redeem(capability_token: tok_cap_x7y2z9) → redeemed(scope: "password-reset::user_u91", allocator_ref: account_svc_a01)`

The atom decrements `remaining_redemptions` from 1 to 0 and atomically transitions status to `Redeemed`, writing `redeemed_at: 2026-10-01T14:03:22Z`. The handler interprets the scope, presents the new-password form to the user, and accepts the new password. No identity check was performed at `redeem` time.

If the user tries the link again: `redeem(tok_cap_x7y2z9) → invalid(exhausted)`. The capability is in `Redeemed` status; no further redemptions are possible.

### Multi-use pre-signed read token

A document service allocates a 10-use capability granting read access to a specific document:

`allocate(allocator_ref: doc_svc_d01, scope: "read::document::doc_d448", max_redemptions: 10, ttl: 86400) → capability_token: tok_cap_r3q8p1`

Five colleagues redeem the token over the course of the day, each calling `redeem(tok_cap_r3q8p1)` from their respective systems. After each call, `remaining_redemptions` decrements: 10 → 9 → 8 → 7 → 6 → 5. No redeemer identity is recorded. After the 10th redemption, the capability transitions to `Redeemed`.

### Rejection paths

**`redeem` — `invalid(expired)`:** A capability allocated with a 1-hour TTL is not redeemed within the hour. A colleague emails the token link to someone who opens it 90 minutes later:

`redeem(capability_token: tok_cap_x7y2z9b) → invalid(expired)`

The atom finds the record: `status: Allocated` (not yet formally transitioned), `expires_at: 2026-10-02T09:00:00Z`, `now: 2026-10-02T10:30:00Z`. Expiry detected lazily; the atom atomically transitions status to `Expired`. `remaining_redemptions` is unchanged at 1 — the unredeemed allocation is forfeit.

**`redeem` — `invalid(revoked)`:** A data-sharing capability is revoked after the sharing window closes:

`revoke(capability_token: tok_cap_r3q8p1b, revoked_by_ref: admin_a01, reason: "sharing-window-closed-2026-10-31") → revoked`

A system that cached the token and attempts redemption after revocation:

`redeem(tok_cap_r3q8p1b) → invalid(revoked)`

**`revoke` — `already-terminal`:** An automated cleanup script attempts to revoke a capability that already exhausted itself:

`revoke(capability_token: tok_cap_x7y2z9, revoked_by_ref: cleanup_svc, reason: "post-expiry-cleanup") → rejected(already-terminal)`

The capability is in `Redeemed` status. The script notes the state and moves on; no revocation record is written.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A GDPR (General Data Protection Regulation) auditor asks *"who authorized the disclosure of data subject DS-99's records that occurred on 2026-11-14?"* The composing Capability-Backed Sharing pattern (C15) links the disclosure event to the capability token used. The auditor queries the capability store for that token and reads the record: `allocator_ref: data_controller_dc01`, `scope: "disclose::subject::DS-99::fields::[name,address,dob]"`, `allocated_at: 2026-11-14T10:00:00Z`, `expires_at: 2026-11-14T18:00:00Z`. Invariant 1 (allocation provenance immutability) is the structural answer: the auditor knows who authorized the disclosure (the data controller), what was authorized (the specific field set), and the time window in which it was valid — from the record alone. The auditor cannot determine who redeemed the capability; Invariant 3 (bearer redemption) makes this structurally unavailable, and the auditor's question is satisfied by knowing the allocator, not the redeemer.

**Disputed disclosure.** An external recipient claims *"I never received any data from you — there must be a data leak elsewhere."* The composing Capability-Backed Sharing pattern's audit record shows that capability `tok_cap_r3q8p1c` was redeemed (status: Redeemed, `remaining_redemptions: 0`, `redeemed_at: 2026-11-14T14:22:00Z`). The capability's `scope` shows exactly which data was authorized for disclosure. The audit trail (from the composing pattern) shows a disclosure event correlated with this redemption. Invariant 5 (audit asymmetry) clarifies the forensic boundary: the capability record proves a disclosure was authorized and occurred, but does not prove the identity of the system that redeemed it — only that a bearer of the token presented it at the recorded time. Whether the recipient's denial is accurate (the token was stolen before redemption) or inaccurate is a question the atom's records cannot resolve; they bound the forensic window without resolving identity.

**Breach investigation.** A security team discovers that a batch of capability tokens was exposed in a log file between `2026-12-01T00:00:00Z` and `2026-12-03T12:00:00Z`. The team queries the capability store for all capabilities allocated by `allocator_ref: api_gateway_g01` during that window. The query returns 23 capabilities across various scopes. The team calls `revoke` on all 23 that are still live — applying the derived liveness predicate `status = Allocated AND now < expires_at` (see Behavior; a raw `Allocated` with `expires_at` in the past is a not-yet-reaped Expired record and needs no revocation) — recording `revoked_by_ref: security_team_s01` and `reason: "log-exposure-incident-2026-12-03"`. For those already in terminal states, the team notes whether they were `Redeemed` (redemption may have been legitimate or by an attacker), `Expired` (never redeemed; no action needed), or `Revoked` (already handled). Invariant 6 (three structurally distinct terminal modes) makes this triage possible from the record store alone.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Allocator authorization.** Whether the actor referenced by `allocator_ref` has the right to allocate a capability for the given `scope` is a policy question the atom cannot answer. The atom records whoever calls `allocate` as `allocator_ref` without validating their authority. A composing pattern (e.g., one that gates capability allocation on a Permissions check) is where allocator authorization is enforced.
- **Scope interpretation.** The atom treats `scope` as an opaque blob. Whether `scope: "read::document::doc_d448"` is a valid scope, what it means operationally, and what the redeemer does with the `scope` value returned by `redeem` are entirely the composing pattern's concern. The atom stores it and returns it; it does not evaluate it.
- **Redeemer identity recording.** By design, the atom records no redeemer identity. If a composing pattern needs to know who redeemed a capability (for audit, accountability, or compliance purposes), it must record that information in its own records, outside the atom's boundary. The atom's bearer-key semantics make redeemer identity a composing-layer concern, not an atom-layer concern.
- **Token delivery channel.** How the `capability_token` reaches the intended bearer — email link, API response, QR code, direct message — is entirely outside the atom's scope. The atom produces a token; the caller delivers it.
- **Token confidentiality in transit.** Whether the token is transmitted over an encrypted channel, embedded in a signed envelope, or protected by any other transport-layer mechanism is a deployment concern. The atom commits that the token is cryptographically random; it does not commit to any transport security.
- **Capability chaining and delegation.** A bearer who redeems a capability cannot use the atom to sub-allocate a narrowed capability to a third party — that would require calling `allocate` with a narrowed scope, which is a separate allocation event under a new `allocator_ref`. Whether that kind of delegation is permitted in a given system is a composing-pattern policy concern.
- **Revocation notification.** When a capability is revoked, the atom does not notify the bearer, the allocator, or any downstream system. Notification is a composing-pattern concern.
- **Identity-bound authorization.** If the authorization model requires knowing *who* is requesting access — not just that they hold a token — Permissions is the correct primitive, not Capability. The two atoms are structurally distinct and are not interchangeable. The OCAP model deliberately separates possession from identity; a system that needs both checks should compose both atoms.
- **Invitation semantics.** Invitation (atom #14) is a related but distinct primitive: it also uses bearer-token transport, but the resolution of an Invitation binds an identity (`Declined` is a named terminal state; the accepting party is identified at redemption time). If what is needed is an onboarding flow that concludes with an identity binding, Invitation is the correct atom. The distinction is addressed in the Open taxonomy question in roadmap.md.
- **Clock accuracy and replay.** `allocated_at` and `expires_at` are captured from the deployment's clock. A token can be replayed (presented multiple times) up to `max_redemptions` and until `expires_at`; these are the only guards the atom provides. Replay protection beyond what the counter and expiry provide (e.g., nonce-based one-time-use validation) is a deployment-configuration concern.
- **Capability store tamper-evidence.** The atom does not implement cryptographic chaining on the capability store. Composing with Tamper Evidence is available for deployments that require proof that no capability record was retroactively altered.
- **External purge and retention.** The atom provides no deletion surface (Invariant 11), but it does not prohibit the deployment from purging old terminal records under a retention policy — that is the composing application's call (Retention Window / Defensible Retention are the patterns). The consequence is named, not hidden: a purged token presented to `redeem` or `revoke` returns `not-known`, which therefore subsumes "never allocated" and "allocated, terminal, and since purged" — the atom cannot distinguish them, and Invariant 12's lifetime-uniqueness claim is scoped to the records the store retains. A deployment whose audit obligations require distinguishing these cases must retain terminal records (or their Audit Trail projection) for the obligation's window.

---

## Composition notes

Capability is freestanding. It is the sole constituent atom of Capability-Backed Sharing (C15) and contributes the bearer-key authorization primitive:

- **[Selective Disclosure](./selective-disclosure.md)** — in Capability-Backed Sharing (C15), a capability's `scope` authorizes disclosure of a specific record subset. Selective Disclosure is the atom that records what was disclosed, to whom, and under what authority. The two atoms are distinct: Capability says "bearer of this token is authorized to see fields X, Y, Z of record R"; Selective Disclosure says "fields X, Y, Z of record R were disclosed on this date." The composition wires `redeem → redeemed(scope)` to a Selective Disclosure `disclose` call.
- **[Actor Identity](./actor-identity.md)** — `allocate` records `allocator_ref`. In regulated deployments, the allocation event is paired with an Actor Identity `attest` call to produce a non-repudiable record that a specific actor created the capability. The audit trail then reads "capability X was allocated by actor Y (attested)" rather than just "capability X was allocated by allocator_ref Y (unattested)."
- **[Audit Trail](../compositions/audit-trail.md)** — in regulated deployments, both `allocate` and each successful `redeem` call should be recorded in the Audit Trail. The atom does not mandate this; it is the composing pattern's obligation. Capability-Backed Sharing (C15) is the composition that wires capability lifecycle events into the audit record.
- **[Permissions](./permissions.md)** — Permissions is identity-keyed (gates on who is asking); Capability is bearer-keyed (gates on what token is presented). The two atoms are not interchangeable and are not in conflict — they express different authorization models. A system may use both: a permission check determines whether an actor may allocate a capability; the capability token determines whether the bearer may access the resource. The allocation-authorization surface is Permissions' concern; the redemption-authorization surface is Capability's concern.
- **[Tamper Evidence](./tamper-evidence.md)** — capability records, including the `allocator_ref` and `scope` fields, should be hash-chained in regulated deployments to ensure that the allocation provenance cannot be retroactively altered.
- **[Privileged Access Provisioning](../compositions/privileged-access-provisioning.md)** — calls `Capability.allocate` to provision the bearer token when the Multi-Party Approval chain reaches `Approved`, `Capability.redeem` inside `exercise_access` after session validation, and `Capability.revoke` via `revoke_access`. The redeemer's identity is intentionally not recorded by this atom; attribution for the full arc is carried in the Audit Trail.
- **[Capability-Backed Sharing](../compositions/capability-backed-sharing.md)** (C15) — the composition that wires Capability redemption to Selective Disclosure, producing the bearer-token/regulated-audit worked example. The emergent invariant: the audit record reads "disclosed by bearer of capability X, allocated by actor Y" — allocator is identified, redeemer is structurally not.
- **[Invitation](./invitation.md)** — Invitation is a related bearer-token primitive for identity onboarding. See Edge cases (Invitation semantics) and the Open taxonomy question in roadmap.md for the Capability-vs-Invitation design boundary.

---

## Standards references

- **Daniel Jackson, *Software Abstractions*** — `Capability [Resource]` is a concept in Jackson's concept catalog. The atom's `scope` field (what the capability authorizes), `allocate` and `redeem` actions, and the bearer-key semantics correspond directly to Jackson's formulation. Grace Commons expresses this concept in the atom format; the structural decisions are inherited from the concept catalog.
- **Mark Miller and the object-capability (OCAP) literature** — the formal theoretical grounding for bearer-key authorization. The principle *"an unforgeable reference to an object carries the authority to use that object"* is the foundation. Miller's work on capability-based security, including the E language and the Waterken server, establishes the invariants this atom formalizes.
- **Levy, H.M. (1984), *Capability-Based Computer Systems*** — the canonical reference for capability-based security systems. Levy establishes the three properties of capabilities: unforgeability, transferability, and access control by possession. The atom satisfies unforgeability (the `capability_token` — cryptographically random, opaque, system-generated) and access-control-by-possession (the bearer semantics of `redeem`); transferability and attenuation are deliberately outside the atom's surface — the atom neither prohibits, tracks, nor models token sharing or scope-narrowing delegation (see Edge cases — Capability chaining), so its claim on the OCAP literature is the bearer/unforgeability subset, not full conformance.
- **Birgisson, A., Politz, J.G., Erlingsson, Ú., Taly, A., Vrable, M., Lentczner, M. (2014), *Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud*** — Macaroons are a constrained Capability variant: a capability token that can be attenuated (scope narrowed) by adding caveats before being passed to a third party. The atom models the base Capability concept without macaroon-style attenuation; composing patterns that need contextual caveats may build on this atom.
- **RFC 6749 §1.4 (OAuth 2.0 — Access Tokens)** — OAuth 2.0 (the open authorization framework, version 2.0) access tokens are a widely deployed capability-adjacent pattern: a bearer token scoped to specific resources, with limited lifetime, that grants access without per-request identity verification. Cited with explicit caveats: OAuth 2.0 conflates bearer-token authorization with identity-bound flows (the authorization server authenticates the client; the token is identity-linked in practice even if the resource server checks only the token). This atom defines the pure OCAP surface — the token IS the authorization, with no identity linkage — which is a stricter and simpler model than OAuth 2.0 in full. Composing patterns that implement OAuth 2.0-compatible flows will compose this atom with identity-aware patterns.
- **GDPR Article 32 (Security of Processing)** — capability tokens are an access-control mechanism for regulated data disclosures. The `allocator_ref` and `scope` fields, immutably recorded and auditable from the capability store alone, satisfy the "appropriate technical measures" requirement for demonstrating that disclosures were authorized.
- **HIPAA (Health Insurance Portability and Accountability Act) §164.514(d) (Minimum Necessary Standard)** — the HIPAA requirement that disclosures be limited to the minimum necessary information. A capability's `scope` is the mechanism for encoding the minimum necessary field set; the composing Capability-Backed Sharing pattern (C15) is where the minimum-necessary constraint is enforced against the disclosure.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of separating bearer-key authorization (Capability) from identity-keyed authorization (Permissions) and from identity-binding onboarding (Invitation).
- **Eiffel's design-by-contract** — named rejection reasons; preconditions on `allocate` and `revoke`; first-class `redeem` outcomes.

---

## Generation acceptance

A derived implementation of Capability is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the capability record store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm allocation provenance for every capability.** For every record in the store, confirm that `allocator_ref`, `scope`, `max_redemptions`, `allocated_at`, and `expires_at` are non-null and unchanged from the values at allocation. The `capability_token` field should not expose raw entropy but should be opaque and stable. Invariant 1 is the structural guarantee; a record with a null or mutated `allocator_ref` is evidence of an implementation defect.
- **Confirm the redemption counter invariant.** For every record, confirm that `remaining_redemptions >= 0` and `remaining_redemptions <= max_redemptions`. Confirm that for records with `status = Redeemed`, `remaining_redemptions = 0` and `redeemed_at` is non-null. Confirm that for records with `status = Allocated`, `remaining_redemptions > 0`. Invariants 2 and 4 are the structural guarantees.
- **Confirm no redeemer identity is present in any record.** Inspect all fields of all records and confirm that no field records information identifying a redeemer. The absence of a `redeemer_ref`, `redeemed_by`, or equivalent field is the behavioral commitment of Invariant 3. An implementation that adds a redeemer identity field — even as an optional or informational field — has violated the bearer-key semantics the atom is built on.
- **Confirm the three terminal modes are structurally distinct.** Verify that `Redeemed` records have `redeemed_at` non-null and `remaining_redemptions = 0`; that `Expired` records have `expires_at` in the past; that `Revoked` records have `revoked_at`, `revoked_by_ref`, and `revocation_reason` non-null. No two terminal states should be indistinguishable from the record alone. Invariant 6 is the structural guarantee.
- **Confirm terminal state finality.** For records with `status = Redeemed`: confirm that `remaining_redemptions = 0` and `redeemed_at` is non-null, and that no further decrement of `remaining_redemptions` below zero is present — the exhaustion transition is the terminal event, and the counter cannot go lower. For records with `status = Expired` or `status = Revoked`: confirm that `remaining_redemptions` retains whatever value it held at the time of the terminal transition (expiry and revocation forfeit remaining redemptions without decrementing the counter). Note that whether any `redeem` call was *attempted* after terminal transition is not auditable from the record store alone — failing `redeem` calls leave no trace in the record. Terminal finality for `Expired` and `Revoked` records is enforced by the implementation (Invariant 7), not reconstructable from records.
- **Confirm revocation attribution completeness.** For every record with `status = Revoked`, confirm that `revoked_at`, `revoked_by_ref`, and `revocation_reason` are all non-null. Invariant 9 is the guarantee.

---

## Status

`grounded on Final Critique 4 — 2026-06-10` (scheduled rescan, council-run — three rounds to clean, findings folded, buggy twin `capability-buggy.als` landed, first coverage matrix emitted; see Lineage §Scheduled rescan 2026-06-10). Prose grounding: `grounded on Final Critique 4` — three baseline rounds (Pass 1/2/3 each) plus Final Critique 4 complete. Seven findings total; all resolved in-pattern. Final Critique 4 closed clean (foundational findings: zero; refining findings: one documented, not blocking).

*Classification (post-flatten): stored flat as `atoms/capability.md` — no category folder. Capability is an authorization primitive with significant non-regulated uses (bearer-token authorization wherever it is needed), so its **regulated** and **security** classifications are overlays derived from its composers, not a folder it is filed under. This resolves the atom's former provisional `compliance/` placement and the question of relocating it to a security folder: under the [usage-derived taxonomy](./TAXONOMY.md), `security` is an overlay it carries (derived from its identity/access standards), not a domain or a directory.*

---

## Lineage notes

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

**FC1 — Missing `capability_token` uniqueness invariant (foundational, fixed in-pattern).** The Identity Model stated "Tokens are not reused after a capability reaches a terminal state" — addressing only temporal reuse. There was no invariant asserting that no two capability records ever share a `capability_token`. Without this, `redeem(capability_token)` lookup semantics are undefined in the event of a collision, however negligible the probability. Session had an explicit token-uniqueness invariant (Session Invariant 7); Capability lacked the analog. Fixed: added Invariant 12 — "Capability token uniqueness" — mirroring Session Invariant 7's language. Updated the closing property summary to add "lookup determinism" to the property cluster.

**FC2 — Generation acceptance check 5 overstated what records can prove (refining, fixed for correctness).** Check 5 claimed to confirm "that no successful `redeem` call occurs after exhaustion, expiry, or revocation." For `Redeemed` records this is auditable (`remaining_redemptions = 0`, `redeemed_at` set). For `Expired` and `Revoked` records it is not — failing `redeem` calls leave no trace in the record store. The check overstated the auditor's power for two of the three terminal states. Fixed: check 5 rephrased to scope the auditable portions correctly — counter inspection for `Redeemed`, counter-value retention for `Expired`/`Revoked`, and an explicit note that post-terminal `redeem` attempt detection is not auditable from records alone.

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

*Formal-layer finding (surfaced before any council pass ran):* **`capability.als` shipped no committed buggy twin** — the only Alloy model in the corpus without one. The 2026-06-03 fix above verified the checks' teeth via an ad-hoc injected mutation that was never committed, which is the "ran once" class the model-present bar (criterion 2) exists to forbid. Closed in-round: [`capability-buggy.als`](./capability-buggy.als) authored — the injected defect drops the exhaustion transition (`redeem_success` decrements but always leaves `status = Allocated`, the "implementation forgot the terminal write" hazard Invariant 4 forbids), with the two guarding facts weakened so the hazard is constructible rather than vacuously blocked. The harness rejects it on exactly the three expected counterexamples (`A_AllocatedHasRemaining`, `A_ZeroCounterMeansRedeemed`, `A_ExhaustionSetsRedeemed`) while the correct model stays green (22 checks UNSAT, 10 runs SAT). Scope bump: all checks re-run one scope up (`for 7`) — hold. First coverage matrix for this pattern emitted: [`tools/harness/coverage/capability.md`](../tools/harness/coverage/capability.md) — no GAP rows; the concurrent-redeem interleaving is recorded as a deliberate tool-split residual (TLC-class; exercised at the composition layer in C15 and PAP models).

Three council rounds to a clean close:

- *Round 1.* Pass 1: two refining findings folded (the formal-model path corrected from `formal/capability.als` to the sibling [`capability.als`](./capability.als); OAuth glossed in the Summary). Pass 2: clean. Pass 3 (fresh-reader): eight findings — seven *refining* + one *rhetorical*, all folded — `revoke` precondition evaluation order pinned (`not-known` → `already-terminal` → `invalid-request`, with the terminal-plus-empty-reason tie-break named); string input policy (byte-exact `allocator_ref` equality, whitespace-only = empty, deployment length caps including `scope`); `now` and the token's random material declared injected inputs per the Logic Confinement Principle; the `expires_at` boundary instant pinned to the dead side (`expires_at <= now` in Behavior, matching the `now >= expires_at` transition trigger and the `now < expires_at` redemption guard); Invariant 4's atomicity boundary named (one committed write — compare-and-swap or equivalent serializable isolation; a crash between decrement and status write leaves the pre-decrement state); the external-purge consequence named as a new Edge case (`not-known` subsumes purged-terminal records; Invariant 12's lifetime-uniqueness scoped to retained records; deployments with audit obligations must retain terminal records or their Audit Trail projection); the Levy/OCAP claim narrowed to the bearer/unforgeability subset (transferability and attenuation deliberately outside the surface — the rhetorical item); the derived liveness predicate (`status = Allocated AND now < expires_at`) made canonical for auditors and applied in the breach-investigation scenario.
- *Round 2.* Pass 1: two refining findings folded (stale peer-status markers — "C15 partially resolved", "atom #14 not started" — dropped in favor of bare links, per the no-snapshot rule's spirit: a peer's status mirrored into this file drifts, the linked file's own Status line is the SSOT; the two dangling "see Configuration in composing patterns" references repointed at the injected-inputs Behavior commitment). Pass 2 / Pass 3: clean.
- *Round 3.* Clean across all three passes — round closed; `grounded` retained; Status rescan date bumped to 2026-06-10.

*Measured cost (cost-model data point):* 9 council-agent invocations (6 Sonnet, 3 Opus) across 3 rounds, ≈520k subagent tokens, plus the twin authoring and three harness runs; also recorded in `ai-usage-log.md`.
