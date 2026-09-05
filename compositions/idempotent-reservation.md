---
title: Idempotent Reservation
parent: Conceptual Compositions
nav_order: 2
has_toc: true
toc: true
---

# Idempotent Reservation

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Idempotent Reservation makes reservation actions safe to retry. It combines two simpler patterns: one that manages a held resource (Provisional Commitment — a resource held, then Confirmed, Released, or Expired) and one that spots repeated submissions within a set time window (Duplicate Prevention).

The problem it solves is everyday over unreliable networks: a client asks to hold a resource, the reply gets lost, the client retries — and without protection the retry creates a second, accidental hold.

The fix is a token the caller attaches to every action: if the same token has been seen within the window, the system returns the original result (same identifier, same outcome) instead of doing the action again.

The result is "exactly-once" behavior — the underlying reservation sees one real action no matter how many times it is retried, a token is locked to one specific operation (reusing it for something else is rejected), and so a single intended action can never become a double-hold. (Guarantees that appear only when patterns are combined are called emergent guarantees.)

This is the same mechanism every payment processor uses to stop a retried charge from billing twice, and it applies anywhere a duplicated action is a real defect — payments, hospital resource allocation, inventory reservation.

---

## Intent

Real reservation systems run over unreliable networks. A client submits [Place Hold]; the network drops the response before it arrives; the client retries. Without idempotency, the second call produces a *second* commitment — two distinct ids, two distinct audit trails, one unintended double-hold of the resource. The same hazard recurs for [Confirm], [Release], and [Expire]: a retry past Provisional Commitment's terminal-absorption boundary returns `rejected(not-held)`, which the caller cannot distinguish from a *new* failure without out-of-band information.

This composition solves the problem at the composition layer rather than absorbing it into Provisional Commitment. The caller supplies an **`idempotency_token`** on every state-changing call. The composition checks the token against a [Duplicate Prevention](../atoms/duplicate-prevention.md) instance; if the token has been seen within the window (the configurable time period during which repeated tokens are detected and deduplicated), the composition returns the *original* response (the same commitment id, the same `ok`, the same rejection reason) without invoking [Provisional Commitment](../atoms/provisional-commitment.md) a second time. The constituent atoms are unchanged; the composition is the wiring.

This is the same composition that runs in every payment processor in production today — Stripe's `Idempotency-Key`, Adyen's idempotency header, ISO 20022's (the International Organization for Standardization standard for financial-messaging data) message uniqueness identifier, the IETF (Internet Engineering Task Force — the body that develops internet standards) draft idempotency-key spec. Different vocabularies; identical mechanic.

---

## Composes

- **[Provisional Commitment](../atoms/provisional-commitment.md)** — provides the underlying lifecycle (Held → Confirmed | Released | Expired) and all the invariants every commitment satisfies. The composition maintains exactly one Provisional Commitment instance.
- **[Duplicate Prevention](../atoms/duplicate-prevention.md)** — provides the temporally-bounded recency guard against repeated tokens. The composition maintains exactly one Duplicate Prevention instance, configured with the idempotency window and token-equality matching.

---

## Composition logic

### Composition state

The composition owns one piece of state that neither constituent atom carries:

- **`token_results`** — a map from `idempotency_token` to a recorded outcome: `(action_type, parameters_digest, result)`. [Action Type] is one of `place_hold`, `confirm`, `release`, `expire`. [Parameters Digest] is a collision-resistant digest of the non-token call parameters, **computed by a pure function or configured digest mechanism at the composition's I/O seam and injected into the transition** — the digest is an explicit input derived from the already-present non-token call parameters, not cryptography improvised inside core logic (see Configuration §`digest_function`; the mechanism-capability pattern per [`execution-contract.md`](../execution-contract.md) §Logic Confinement Principle). The serialization format must be stable and canonical (e.g., sorted key-value pairs encoded with a length prefix); the digest function and serialization convention must be consistent across all instances sharing the `token_results` store — inconsistency across replicas or versions causes legitimate retries to be misclassified as `token-collision`. [Result] is the original response — either the produced `id` (for [Place Hold]) or `ok`, or the rejection reason — exactly as returned to the caller on the first call.

**Classification: extraction-pending.** `token_results` carries non-derivable truth — which result was returned for a given token — that no replay of Provisional Commitment plus Duplicate Prevention can reproduce: Duplicate Prevention answers *have I seen this identity?* (membership, no payload) and does not act on the result. Per [`execution-contract.md`](../execution-contract.md) §Composition state, a composition element that carries truth not reconstructible from constituent stores is a not-yet-extracted atom, and until that atom lands the element is declared here as recorded debt riding the extraction's schedule. The proposed atom is an **Idempotency Result Memo** (token → result; write-once; window-governed eviction); the extraction is opened as a roadmap proposal (see [`roadmap.md`](../roadmap.md)).

The map's lifetime is governed by the Duplicate Prevention window. Entries are evicted when their token leaves Duplicate Prevention's `recorded` set, by the eventual-expiry invariant of that atom.

### Configuration

Deployment-settable knobs:

- **`idempotency_window`** — the duration of the Duplicate Prevention window; passed to the Duplicate Prevention instance at initialization. Default: 60 seconds for HTTP retry envelopes; 5–10 minutes for client-side replay scenarios; 24 hours for slow payment-rail reconciliation. Regulated deployments (PCI DSS (Payment Card Industry Data Security Standard), ISO 20022) must select a window long enough to cover the slowest legitimate retry cycle for the most critical action. Window-size selection considerations are elaborated in Edge cases.
- **`token_max_length`** — the maximum byte length of a well-formed `idempotency_token`. Default: 256 bytes. Must be large enough to accommodate the token format used by the caller (IETF idempotency-key draft recommends at least 16 bytes of randomness; UUIDs are 36 characters; composed keys may be longer).
- **`digest_function`** — the hash function and serialization convention used to compute `parameters_digest`. The digest is computed by a pure function or configured digest mechanism at the composition's I/O seam (injected as an explicit input into the transition; never computed inside core logic — Logic Confinement Principle). Must be specified and consistent across all instances sharing the `token_results` store; inconsistency across replicas or versions causes legitimate retries to be misclassified as `token-collision`.

### Primitive policies

Composition-boundary validation for string-typed inputs:

- **`idempotency_token`** — must be non-null and non-empty (rejection: `invalid-request`); must not exceed `token_max_length` bytes (rejection: `invalid-request`). The atom treats the token as opaque — no whitespace normalization, no Unicode normalization, no case folding. Comparison is byte-exact. Validation occurs at the composition layer before the Duplicate Prevention check; a malformed token is rejected before any constituent is consulted.
- **`resource`, `requester`, `duration`** — validated by Provisional Commitment's own preconditions; failures propagate as `invalid-request` from Provisional Commitment and are cached against the token (unless the token itself was malformed, in which case there is no token to cache against).

### Action wiring

The composition replaces Provisional Commitment's direct API surface. Each action carries a required [Idempotency Token] parameter; otherwise the parameters and return shape match Provisional Commitment's.

- **[Place Hold]** — (Projected contract: `place_hold(resource, requester, duration, idempotency_token) → id | rejected(invalid-request | token-collision | resource-unavailable)`)
  1. Validate `idempotency_token` is well-formed (non-empty, within length); otherwise `rejected(invalid-request)`.
  2. Call `DuplicatePrevention.check(idempotency_token)`.
     - If `seen`: look up `token_results[idempotency_token]`. If the recorded `action_type` is `place_hold` and the recorded `parameters_digest` matches the current call's digest, return the recorded `result` (the original `id` or rejection reason). If `action_type` differs or `parameters_digest` does not match, return `rejected(token-collision)`.
     - If `not-seen`: delegate to `ProvisionalCommitment.place_hold(resource, requester, duration)`. Whatever the constituent returns — `id`, `resource-unavailable`, `invalid-request` — record it: `token_results[idempotency_token] = (place_hold, digest, result)`. Call `DuplicatePrevention.record(idempotency_token)`. Return the result to the caller.

- **[Confirm]** — (Projected contract: `confirm(id, idempotency_token) → ok | rejected(invalid-request | token-collision | not-held | window-elapsed)`) — same wiring as [Place Hold]. Token validated; `check` consulted. If `seen`: return cached result if `action_type = confirm` and `parameters_digest` matches; otherwise `rejected(token-collision)`. If `not-seen`: delegate to `ProvisionalCommitment.confirm(id)`; record result; return. Constituent rejections (`not-held`, `window-elapsed`) pass through and are cached.

- **[Release]** — (Projected contract: `release(id, idempotency_token) → ok | rejected(invalid-request | token-collision | not-held)`) — same wiring. If `seen` and `action_type = release` with matching digest: return cached result. If `seen` with mismatched action or digest: `rejected(token-collision)`. If `not-seen`: delegate to `ProvisionalCommitment.release(id)`; record and return.

- **[Expire]** — (Projected contract: `expire(id, idempotency_token) → ok | rejected(invalid-request | token-collision | not-held)`) — same wiring. If `seen` and `action_type = expire` with matching digest: return cached result. Otherwise `rejected(token-collision)`. If `not-seen`: delegate to `ProvisionalCommitment.expire(id)`; record and return.

Read-only queries (listing Held commitments, inspecting a commitment by id) pass through to Provisional Commitment without token consultation; idempotency applies only to state-changing actions.

### The cache-the-failure rule

A non-obvious correctness requirement: the composition records *every* outcome against the token, success or rejection. If the first [Place Hold] returns `resource-unavailable` and the retry is allowed to re-call Provisional Commitment, the retry might succeed (the resource may have become available in between). That violates the *same token, same result* contract — the caller would observe different responses to what they intended as the same operation. Caching the failure preserves the invariant; the caller's retry returns the original `resource-unavailable`, and the caller (or a wrapping policy) decides whether to attempt the call again with a *fresh* token.

The only outcome the composition does *not* cache is the `invalid-request` rejection for a malformed `idempotency_token`, because there is no valid token to cache against.

---

## Composition-level invariants

These invariants emerge from the composition. None of them belong to a single constituent atom; each requires both atoms working together to hold.

- **Invariant 1 — Idempotent [Place Hold] within the window.** For any `idempotency_token` currently within the Duplicate Prevention window, repeated `place_hold(... , idempotency_token)` calls with matching `parameters_digest` return the same response — the same `id` on success, or the same rejection reason on failure.
- **Invariant 2 — Idempotent state transitions within the window.** Same property holds for [Confirm], [Release], and [Expire]. A retry within the window returns the cached response; the constituent atom is not invoked a second time.
- **Invariant 3 — Token-to-commitment one-to-one within the window.** At most one commitment id is bound to any given `idempotency_token` while that token is in the window. Two distinct commitments cannot share a token.
- **Invariant 4 — Token-action binding.** Each `idempotency_token` is bound to one logical operation. Reusing the same token for a different `action_type` or with a different `parameters_digest` is rejected as `token-collision`.
- **Invariant 5 — Provisional Commitment's invariants preserved.** All invariants from Provisional Commitment hold over the underlying instance. The composition never bypasses preconditions; the constituent's rejections (`resource-unavailable`, `not-held`, `window-elapsed`, etc.) flow through unchanged and are cached against the token.
- **Invariant 6 — Duplicate Prevention's invariants preserved.** All invariants from Duplicate Prevention hold. The composition calls `record` exactly once per first invocation of each token; subsequent retries do not extend the window (single-recording invariant).
- **Invariant 7 — Token expiry releases the binding.** After Duplicate Prevention's eventual-expiry invariant elapses the token, `token_results[token]` is evicted in the same step. A subsequent call with the same token is treated as a fresh request and may produce a new commitment id. The critical eviction ordering constraint: a `token_results` entry must never be evicted while its corresponding token remains in Duplicate Prevention's recorded set — that would cause `check → seen` with no result to return, a defect. The safe direction is the reverse: a stale `token_results` entry for an already-evicted token is a memory leak but not a correctness failure, because the action wiring only consults `token_results` when `check → seen`. The eviction ordering is enforced by a **composition-introduced eviction surface** that checks Duplicate Prevention membership before evicting any `token_results` entry — no entry is evicted unless `DuplicatePrevention.check(token) → not-seen`; alternatively a deployment may discharge this as a **declared coupling** in which the `token_results` store and the Duplicate Prevention store share a single eviction boundary (e.g., a single TTL-governed store keyed on the token), making the ordering a structural property of the deployment rather than a procedural check. *Conditional on:* `token_results` persisted atomically with each successful action (see Edge cases — Durability of the token-results map).
- **Invariant 8 — Exactly-once effect within the window.** *Conditional on:* (a) per-token serialization — the implementation must serialize concurrent calls carrying the same token so the cache is populated before any second execution branch can delegate to Provisional Commitment (see Edge cases — Cancellation of in-flight retries); (b) `token_results` persisted atomically with each successful action (see Edge cases — Durability of the token-results map). Provided both conditions hold: for any state change the caller intends — placing one hold, confirming one commitment, releasing one commitment, expiring one — the underlying Provisional Commitment instance observes exactly one corresponding action invocation regardless of retry count, as long as all retries use the same token within the window.

Idempotent [Place Hold] and exactly-once effect together give the *no-double-spend* property — the contract that makes this composition usable in payments, healthcare, and every other domain where a duplicated state change is a defect rather than a no-op. Token-action binding gives the *token-discipline* property that prevents accidental reuse across distinct operations.

---

## Examples

### Walkthrough

A client behind a flaky network reserves a hotel room. The composition is configured with a 10-minute idempotency window.

1. **First call:** `place_hold(room_307, guest_g91, 24h, idem_x73a)` → composition calls `check(idem_x73a) → not-seen`; delegates to Provisional Commitment; receives `rm_b4c`. Records `token_results[idem_x73a] = (place_hold, digest_α, rm_b4c)` and `DuplicatePrevention.record(idem_x73a)`. Returns `rm_b4c` to the client. State: `rm_b4c` Held.
2. **Network drops the response. Client retries:** `place_hold(room_307, guest_g91, 24h, idem_x73a)` → `check(idem_x73a) → seen`; lookup matches; returns cached `rm_b4c`. *Provisional Commitment is not invoked.* No second commitment is created.
3. **Client retries twice more:** identical outcome. Provisional Commitment still sees only one [Place Hold].
4. **Two hours later, client confirms** with a fresh token: `confirm(rm_b4c, idem_y22)` → `check(idem_y22) → not-seen`; delegates to `ProvisionalCommitment.confirm(rm_b4c)` → `ok`. Records and returns `ok`. State: `rm_b4c` Confirmed.
5. **Client retries the confirm** (browser back button or replay): `confirm(rm_b4c, idem_y22)` → `check → seen`; returns cached `ok`. Crucially, the second call does *not* return `rejected(not-held)` — which is what would happen if the retry hit Provisional Commitment directly, because `rm_b4c` has already moved Held → Confirmed. The idempotency cache hides the terminal-absorption rejection from the legitimate retry.
6. **Eleven minutes later, client retries the original [Place Hold]** with `idem_x73a`. The 10-minute window has elapsed; `idem_x73a` is no longer in `DuplicatePrevention.recorded` (eventual-expiry invariant); `token_results[idem_x73a]` was evicted. `check → not-seen`; the composition delegates afresh. Provisional Commitment receives [Place Hold] against `room_307`; the room is no longer hold-able because `rm_b4c` is in Confirmed; it returns `resource-unavailable`. The composition caches *that* rejection against the new occurrence of the token. The client sees `resource-unavailable` — accurately reflecting the current state of the resource, not the stale identity of an old token.

### Banking — credit-hold authorization with retry

A merchant POS submits a $250 authorization with an idempotency key (ISO 20022 BizMsgIdr or scheme-defined equivalent). The acquirer's network glitches; the POS retries within seconds. The composition guarantees the cardholder is charged once, not twice. This is exactly what every modern payment processor implements — Stripe's `Idempotency-Key` HTTP header on `POST /v1/charges` produces the same behavior. The composition's `Invariant 8 — Exactly-once effect within the window` is the contract Stripe documents to merchants.

### Healthcare — bed assignment with double-click

An emergency department coordinator clicks *Assign Bed* on the dashboard. The dashboard hangs; she clicks again. Two `place_hold(bed_307, patient_p41, 2h, ...)` requests arrive at the bed-management service within 800 milliseconds. The dashboard supplies a session-bound idempotency token on every action; both requests carry the same token. The composition accepts the first, returns the bed assignment id; the second hits the idempotency cache and returns the same id. One bed assigned to one patient. The unit's regulatory audit (Joint Commission care-coordination standards) sees one assignment record, not two.

### Retail — inventory reservation with mobile retry

A shopper on flaky mobile WiFi taps *Reserve* on a one-of-one luxury item. The app generates an idempotency token from the cart session id and the item sku, attaches it to the request, and retries on network failure with exponential backoff. The composition guarantees the shopper either reserves the item once and sees a successful reservation, or sees a single `resource-unavailable` rejection (someone else got there first) regardless of how many retries the network handler attempts. No phantom *two reservations* state.

### Airline — seat hold with session replay

A travel agency's booking system replays the previous hour's requests after a database failover. Every hold request carries the original idempotency token. The reservation system replays correctly: holds that were already produced return their original commitment ids; holds whose tokens have since expired produce fresh commitments only if their seats are still available. No seat is held twice. The composition's `Invariant 7 — Token expiry releases the binding` is the failure mode the agency's operations team must understand: tokens older than the window are treated as fresh requests.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts, beyond happy-path:

- **Regulator audit — "show me every double-charge."** An auditor queries the underlying Provisional Commitment instance for commitments sharing a `(resource, requester, placed_at-near)` signature. The composition's `Invariant 3 — Token-to-commitment one-to-one within the window` guarantees the query returns the empty set within the window; outside the window the audit must distinguish *legitimate sequential holds* (separate logical operations with separate tokens) from *retry-induced doubles* (which the composition has structurally prevented). The auditor sees a structural guarantee, not a procedural promise.
- **Disputed transaction — "you charged me twice."** The investigator inspects the composition's `token_results` map (or its persistent journal). If two of the customer's submitted requests carried the *same* token, the composition's cache produced one commitment and replayed the response — there is no double-spend to dispute. If the customer's client generated *different* tokens for what they intended as the same operation, the composition correctly processed them as independent operations; the dispute belongs to the client's token-generation logic, not to the reservation system.
- **Replay attack — adversary captures and replays a token.** An adversary captures an in-flight request and replays it later within the window. The composition correctly returns the cached result. The replay produces no new state change — `Invariant 2 — Idempotent state transitions within the window`. Replays *outside* the window are treated as fresh requests; the adversary may succeed in placing a new commitment if the resource is available and they hold valid credentials, but that is an authentication / authorization failure (see [Actor Identity](../atoms/actor-identity.md)), not an idempotency failure.
- **Token reuse collision — caller accidentally reuses a token across two operations.** A developer reuses `idem_x73a` (originally used for `place_hold(room_307, ...)`) in a subsequent `confirm(rm_b4c, idem_x73a)` call. The composition checks: `DuplicatePrevention.check(idem_x73a) → seen`; looks up `token_results[idem_x73a]` and finds `action_type = place_hold`. Current call's `action_type = confirm` — mismatch. Returns `rejected(token-collision)`. No state change occurs. The caller must use a fresh token for the confirm. Invariant 4 (*Token-action binding*) is the structural guarantee; [Token Collision] is its observable form.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Cross-instance idempotency.** If the composition runs on multiple servers, all instances must share the `token_results` map and the underlying Duplicate Prevention state for the guarantee to hold. Shared state is handled at the deployment layer; a Coordination or Consistent Storage pattern composes naturally. A naïve per-instance deployment produces idempotency only within a single server's sticky-session domain.
- **Durability of the token-results map.** If the composition crashes between recording a commitment in Provisional Commitment and persisting the corresponding `token_results` entry, a retry would observe the token as not-seen and produce a second commitment. The composition's invariants assume the map is persisted atomically with each successful action, which is an implementation requirement. The spec names this; the implementation owns it.
- **Token format and entropy.** The atom treats the token as opaque. Implementations must ensure tokens have sufficient entropy that two distinct logical operations do not accidentally collide (the IETF idempotency-key draft recommends at least 16 bytes of randomness). Collision risk is the caller's contract to maintain; the composition enforces token discipline by digest-matching the request parameters and rejecting accidental cross-action reuse.
- **Long-running idempotency.** The window is bounded by Duplicate Prevention. For idempotency horizons longer than what the recency window can support (hours rather than minutes), compose with a persistent History pattern that records token outcomes durably beyond the recency window.
- **Idempotency under partial composition failure.** If `DuplicatePrevention.record` succeeds but the composition crashes before storing `token_results`, the next retry sees `seen` but finds no entry to return — a defect. The implementation must order operations such that the cache is durable before `record` reports success, or use a single transactional boundary across both. This was a Pass-3 finding, recorded in the commit history.
- **Window size selection.** Too short and legitimate retries fall outside the window (producing doubles); too long and the `token_results` map grows unboundedly under load. Window selection is handled at the deployment layer. Typical values: 60 seconds for HTTP retry envelopes, 5–10 minutes for client-side replay, 24 hours for the slowest payment-rail reconciliation cycles.
- **Selective idempotency.** All four state-changing actions carry idempotency. The composition does not permit idempotency on some actions and not others — a partial-idempotency surface would let callers accidentally retry the non-idempotent ones and break Invariant 8. If a host system wants idempotency on only [Place Hold], the wrapping pattern can expose only that action.
- **Token rotation across clients.** If two distinct callers (different requesters, different sessions) generate the same `idempotency_token` value, the second call's `parameters_digest` will not match the first's, and the composition rejects as `token-collision`. This is the right outcome — sharing tokens across callers is a protocol violation — but it imposes the token-uniqueness obligation on the calling layer, not the composition.
- **Cancellation of in-flight retries.** If the first call is still in progress when the retry arrives, the composition must serialize: the second call waits for the first to complete and then returns the cached result. Concurrent execution of two calls with the same token could produce two underlying actions before the cache is populated. Serialization is a serializable-by-token requirement on the implementation; the spec assumes it.

Where the composition breaks down: when the underlying Duplicate Prevention instance loses recorded tokens (durability failure) and Provisional Commitment retains the corresponding commitments — leading to a token treated as not-seen and a fresh commitment placed alongside the existing one; when the client generates a fresh token on every retry (token discipline lost at the client); when the resource registry's *availability* check is non-deterministic and the first call's outcome is genuinely not reproducible.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the retry-safe action-wirings it exposes ([Place Hold], [Confirm], [Release], [Expire]), the [Idempotency Token] it introduces on every call, and the fields of the recorded outcome it caches ([Action Type], [Parameters Digest], [Result]) plus its own [Token Collision] rejection. It carries one piece of own state — the `token_results` map (classified extraction-pending, the proposed *Idempotency Result Memo* atom) — left as a backticked store token rather than carded as a Type, so its Fields are carded against the plain-noun recorded outcome. References to the constituent atoms and their operations — Provisional Commitment's `place_hold`/`confirm`/`release`/`expire`, Duplicate Prevention's `check`/`record` — the inherited rejection tokens (`resource-unavailable`, `not-held`, `window-elapsed`, `invalid-request`), and the deployment configuration knobs (`idempotency_window`, `token_max_length`, `digest_function`) all remain qualified/backticked, not carded here. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Place Hold

The composition action that places a hold, made retry-safe: it validates the [Idempotency Token], and on a first call delegates to Provisional Commitment's `place_hold` and caches the outcome against the token; a retry within the window replays the cached [Result] instead of delegating again. Returns the commitment `id`, or a cached / delegated rejection.

Kind: Operation

#### Confirm

The retry-safe confirm action — same token-check-then-delegate wiring as [Place Hold], delegating to Provisional Commitment's `confirm`. A within-window retry returns the cached `ok`, hiding the terminal-absorption `not-held` a direct retry would hit; a token bound to a different [Action Type] is rejected [Token Collision].

Kind: Operation

#### Release

The retry-safe release action — same wiring, delegating to Provisional Commitment's `release`. A within-window retry returns the cached result; cross-action or cross-parameter reuse is rejected [Token Collision].

Kind: Operation

#### Expire

The retry-safe expire action — same wiring, delegating to Provisional Commitment's `expire`. A within-window retry returns the cached result; cross-action or cross-parameter reuse is rejected [Token Collision].

Kind: Operation

#### Idempotency Token

The caller-supplied key attached to every state-changing call. The composition introduces it (Provisional Commitment's actions do not carry it); it keys the recorded outcome and is the identity recorded in Duplicate Prevention. Treated as opaque, compared byte-exact, and validated (non-empty, within `token_max_length`) before any constituent is consulted.

Kind:         Parameter
Parameter of: the state-changing actions ([Place Hold], [Confirm], [Release], [Expire])
Role:         the idempotency key (also the recorded-outcome key and the Duplicate Prevention identity)
Projects:     idempotency_token

#### Action Type

The recorded outcome's record of which logical operation the token was bound to — one of `place_hold`, `confirm`, `release`, `expire`. A retry whose action differs from the recorded one is rejected [Token Collision] (Invariant 4).

Kind:      Field
Field of:  the recorded outcome
Role:      the token's bound operation
Projects:  action_type

#### Parameters Digest

The recorded outcome's collision-resistant digest of the non-token call parameters, computed at the composition's I/O seam and injected. A retry whose digest differs from the recorded one is rejected [Token Collision]; digest-function drift across replicas misclassifies legitimate retries.

Kind:      Field
Field of:  the recorded outcome
Role:      the token's bound parameters
Projects:  parameters_digest

#### Result

The recorded outcome's copy of the original response — the produced `id` or `ok`, or the rejection reason — exactly as returned to the caller on the first call. Every outcome is cached, success or rejection (the cache-the-failure rule).

Kind:      Field
Field of:  the recorded outcome
Role:      the replayed response
Projects:  result

#### Token Collision

The composition's own rejection — returned when a token already in the window is reused for a different [Action Type] or with a different [Parameters Digest]. Its structural guarantee is Invariant 4 (token-action binding); no state change occurs.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  token-collision

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Place Hold]: #place-hold
[Confirm]: #confirm
[Release]: #release
[Expire]: #expire
[Idempotency Token]: #idempotency-token
[Action Type]: #action-type
[Parameters Digest]: #parameters-digest
[Result]: #result
[Token Collision]: #token-collision

---

## Standards references

This composition draws on:

- **IETF draft-ietf-httpapi-idempotency-key-header** — the HTTP idempotency-key convention; an industry-standard wire format for the `idempotency_token`.
- **ISO 20022 (financial messaging)** — `BizMsgIdr` and related message-uniqueness identifiers; the financial-industry standard for at-most-once message semantics.
- **HL7 (Health Level Seven) FHIR (Fast Healthcare Interoperability Resources) `Bundle.identifier`, `MessageHeader.id`** — healthcare-industry standard for at-most-once message processing.
- **Stripe Idempotency-Key, Adyen idempotency header, AWS request-ID** — de-facto industry conventions; this composition formalizes what they all implement.
- **PCI DSS Requirement 10 (logging and monitoring)** — composing with Event Log, the commitment record and the token-mapping together produce the audit-evidence PCI requires.

The two atoms it composes carry their own standards inheritance — Provisional Commitment (ISO 9001 — the International Organization for Standardization quality-management standard — §8.5.2 and §8.5.4; Basel III BCBS 238 — Basel Committee on Banking Supervision liquidity rules; Joint Commission; IATA — International Air Transport Association; PCI DSS; GDPR — EU General Data Protection Regulation — Art. 30; SOX — Sarbanes-Oxley Act — §404; HIPAA — Health Insurance Portability and Accountability Act — §164.312(b)) and Duplicate Prevention (IETF HTTP idempotency-key draft, payment-processor idempotency conventions, message-queue exactly-once-within-window literature).

It inherits from:

- **Stripe's idempotency design document** — the public formalization of *same key, same result* as the contract that makes retry-safe APIs practical.
- **Distributed-systems exactly-once-delivery literature** — Kafka's `enable.idempotence`, RabbitMQ's deduplication, the broader academic line on at-most-once messaging.
- **Pat Helland, *Idempotence is Not a Medical Condition*** — the seminal write-up on idempotency as an API-design discipline rather than an infrastructure trick.

---

## Generation acceptance

A derived implementation of Idempotent Reservation is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's `token_results` store plus the underlying Provisional Commitment and Duplicate Prevention instances, can do all of the following without recourse to source code, runbooks, or developer narration.

### Record-clearable checks

*(Note: the spec-format template labels this tier "Audit-Trail-traversal-clearable" as a baseline. That label is inapplicable here — this composition does not compose Audit Trail — so "Record-clearable" is the correct adaptation.)*

These checks can be answered by reading the composition's stored records directly:

- **Reconstruct the lifecycle of any commitment.** Through the underlying Provisional Commitment instance, as specified by that atom's Generation acceptance.
- **Verify all eight composition-level invariants over the record set.** Idempotent [Place Hold], idempotent state transitions, token-to-commitment one-to-one, token-action binding, Provisional Commitment invariants preserved, Duplicate Prevention invariants preserved, token expiry releases binding, exactly-once effect.
- **Trace every commitment to its originating idempotency token** (within the window), and verify no two distinct commitments share a token (Invariant 3).
- **Verify the cache-the-failure rule.** Every recorded `token_results` entry contains the original outcome, success or rejection; retries within the window do not invoke the underlying Provisional Commitment.

### Externally-clearable checks

These questions arise around the composition but require deployment configuration or external evidence to answer:

- **Identify the composing atoms active in this deployment** and their configurations (window duration, token format, digest function). The window duration, digest function, and token max-length are deployment-settable; the auditor must obtain these from the deployment configuration record or the operator, not from the commitment or token-results stores alone.

This is the generator's contract: any code generated from this composition must produce records and a runtime surface that pass the four record-clearable checks above. The bar is the regulator's question — *"can you prove no duplicate state change occurred?"* — answered structurally, not procedurally.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-18
formal: verified — idempotent-reservation.tla + 1 twin, 2026-06-03
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/idempotent-reservation.md`.
