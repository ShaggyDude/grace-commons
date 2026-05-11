---
title: Idempotent Reservation
parent: Applications
nav_order: 2
---

# Idempotent Reservation

> An application: every state-changing call against Provisional Commitment is safely retryable. Composes Provisional Commitment with Duplicate Prevention to give the caller *exactly-once-within-window* semantics — same idempotency token, same result, regardless of how many times the call is retried, regardless of which terminal state the commitment is currently in.

---

## Intent

Real reservation systems run over unreliable networks. A client submits `place_hold`; the network drops the response before it arrives; the client retries. Without idempotency, the second call produces a *second* commitment — two distinct ids, two distinct audit trails, one unintended double-hold of the resource. The same hazard recurs for `confirm`, `release`, and `expire`: a retry past Provisional Commitment's terminal-absorption boundary returns `rejected(not-held)`, which the caller cannot distinguish from a *new* failure without out-of-band information.

This application solves the problem at the composition layer rather than absorbing it into Provisional Commitment. The caller supplies an **`idempotency_token`** on every state-changing call. The application checks the token against a [Duplicate Prevention](../patterns/temporal/duplicate-prevention.md) instance; if the token has been seen within the window, the application returns the *original* response (the same commitment id, the same `ok`, the same rejection reason) without invoking [Provisional Commitment](../patterns/resource-lifecycle/provisional-commitment.md) a second time. The constituent atoms are unchanged; the application is the wiring.

This is the same composition that runs in every payment processor in production today — Stripe's `Idempotency-Key`, Adyen's idempotency header, ISO 20022's message uniqueness identifier, the IETF draft idempotency-key spec. Different vocabularies; identical mechanic.

---

## Composes

- **[Provisional Commitment](../patterns/resource-lifecycle/provisional-commitment.md)** — provides the underlying lifecycle (Held → Confirmed | Released | Expired) and the nine invariants every commitment satisfies. The application maintains exactly one Provisional Commitment instance.
- **[Duplicate Prevention](../patterns/temporal/duplicate-prevention.md)** — provides the temporally-bounded recency guard against repeated tokens. The application maintains exactly one Duplicate Prevention instance, configured with the idempotency window and token-equality matching.

---

## Composition logic

### Application state

The application owns one piece of emergent state that neither constituent atom carries:

- **`token_results`** — a map from `idempotency_token` to a recorded outcome: `(action_type, parameters_digest, result)`. `action_type` is one of `place_hold`, `confirm`, `release`, `expire`. `parameters_digest` is a deterministic digest of the non-token call parameters. `result` is the original response — either the produced `id` (for `place_hold`) or `ok`, or the rejection reason — exactly as returned to the caller on the first call.

The map's lifetime is governed by the Duplicate Prevention window. Entries are evicted when their token leaves Duplicate Prevention's `recorded` set, by the eventual-expiry invariant of that atom.

### Action wiring

The application replaces Provisional Commitment's direct API surface. Each action carries a required `idempotency_token` parameter; otherwise the parameters and return shape match Provisional Commitment's.

- **`place_hold(resource, requester, duration, idempotency_token) → id | rejected(reason)`**
  1. Validate `idempotency_token` is well-formed (non-empty, within length); otherwise `invalid-request`.
  2. Call `DuplicatePrevention.check(idempotency_token)`.
     - If `seen`: look up `token_results[idempotency_token]`. If the recorded `action_type` is `place_hold` and the recorded `parameters_digest` matches the current call's digest, return the recorded `result` (the original `id` or rejection reason). Otherwise reject as `token-collision`.
     - If `not-seen`: delegate to `ProvisionalCommitment.place_hold(resource, requester, duration)`. Whatever the constituent returns — `id`, `resource-unavailable`, `invalid-request` — record it: `token_results[idempotency_token] = (place_hold, digest, result)`. Call `DuplicatePrevention.record(idempotency_token)`. Return the result to the caller.

- **`confirm(id, idempotency_token) → ok | rejected(reason)`** — same wiring; delegates to `ProvisionalCommitment.confirm(id)`; records the result against the token.

- **`release(id, idempotency_token) → ok | rejected(reason)`** — same wiring; delegates to `ProvisionalCommitment.release(id)`.

- **`expire(id, idempotency_token) → ok | rejected(reason)`** — same wiring; delegates to `ProvisionalCommitment.expire(id)`.

Read-only queries (listing Held commitments, inspecting a commitment by id) pass through to Provisional Commitment without token consultation; idempotency applies only to state-changing actions.

### The cache-the-failure rule

A non-obvious correctness requirement: the application records *every* outcome against the token, success or rejection. If the first `place_hold` returns `resource-unavailable` and the retry is allowed to re-call Provisional Commitment, the retry might succeed (the resource may have become available in between). That violates the *same token, same result* contract — the caller would observe different responses to what they intended as the same operation. Caching the failure preserves the invariant; the caller's retry returns the original `resource-unavailable`, and the caller (or a wrapping policy) decides whether to attempt the call again with a *fresh* token.

The only outcome the application does *not* cache is the `invalid-request` rejection for a malformed `idempotency_token`, because there is no valid token to cache against.

---

## Application-level invariants

These invariants emerge from the composition. None of them belong to a single constituent atom; each requires both atoms working together to hold.

- **Invariant 1 — Idempotent place_hold within the window.** For any `idempotency_token` currently within the Duplicate Prevention window, repeated `place_hold(... , idempotency_token)` calls with matching `parameters_digest` return the same response — the same `id` on success, or the same rejection reason on failure.
- **Invariant 2 — Idempotent state transitions within the window.** Same property holds for `confirm`, `release`, and `expire`. A retry within the window returns the cached response; the constituent atom is not invoked a second time.
- **Invariant 3 — Token-to-commitment one-to-one within the window.** At most one commitment id is bound to any given `idempotency_token` while that token is in the window. Two distinct commitments cannot share a token.
- **Invariant 4 — Token-action binding.** Each `idempotency_token` is bound to one logical operation. Reusing the same token for a different `action_type` or with a different `parameters_digest` is rejected as `token-collision`.
- **Invariant 5 — Provisional Commitment's invariants preserved.** All nine invariants from Provisional Commitment hold over the underlying instance. The application never bypasses preconditions; the constituent's rejections (`resource-unavailable`, `not-held`, `window-elapsed`, etc.) flow through unchanged and are cached against the token.
- **Invariant 6 — Duplicate Prevention's invariants preserved.** All four invariants from Duplicate Prevention hold. The application calls `record` exactly once per first invocation of each token; subsequent retries do not extend the window (single-recording invariant).
- **Invariant 7 — Token expiry releases the binding.** After Duplicate Prevention's eventual-expiry invariant elapses the token, `token_results[token]` is evicted in the same step. A subsequent call with the same token is treated as a fresh request and may produce a new commitment id.
- **Invariant 8 — Exactly-once effect within the window.** For any state change the caller intends — placing one hold, confirming one commitment, releasing one commitment, expiring one — the underlying Provisional Commitment instance observes exactly one corresponding action invocation regardless of retry count, as long as all retries use the same token within the window.

Idempotent place_hold and exactly-once effect together give the *no-double-spend* property — the contract that makes this composition usable in payments, healthcare, and every other domain where a duplicated state change is a defect rather than a no-op. Token-action binding gives the *token-discipline* property that prevents accidental reuse across distinct operations.

---

## Examples

### Walkthrough

A client behind a flaky network reserves a hotel room. The application is configured with a 10-minute idempotency window.

1. **First call:** `place_hold(room_307, guest_g91, 24h, idem_x73a)` → application calls `check(idem_x73a) → not-seen`; delegates to Provisional Commitment; receives `rm_b4c`. Records `token_results[idem_x73a] = (place_hold, digest_α, rm_b4c)` and `DuplicatePrevention.record(idem_x73a)`. Returns `rm_b4c` to the client. State: `rm_b4c` Held.
2. **Network drops the response. Client retries:** `place_hold(room_307, guest_g91, 24h, idem_x73a)` → `check(idem_x73a) → seen`; lookup matches; returns cached `rm_b4c`. *Provisional Commitment is not invoked.* No second commitment is created.
3. **Client retries twice more:** identical outcome. Provisional Commitment still sees only one `place_hold`.
4. **Two hours later, client confirms** with a fresh token: `confirm(rm_b4c, idem_y22)` → `check(idem_y22) → not-seen`; delegates to `ProvisionalCommitment.confirm(rm_b4c)` → `ok`. Records and returns `ok`. State: `rm_b4c` Confirmed.
5. **Client retries the confirm** (browser back button or replay): `confirm(rm_b4c, idem_y22)` → `check → seen`; returns cached `ok`. Crucially, the second call does *not* return `rejected(not-held)` — which is what would happen if the retry hit Provisional Commitment directly, because `rm_b4c` has already moved Held → Confirmed. The idempotency cache hides the terminal-absorption rejection from the legitimate retry.
6. **Eleven minutes later, client retries the original `place_hold`** with `idem_x73a`. The 10-minute window has elapsed; `idem_x73a` is no longer in `DuplicatePrevention.recorded` (eventual-expiry invariant); `token_results[idem_x73a]` was evicted. `check → not-seen`; the application delegates afresh. Provisional Commitment receives `place_hold` against `room_307`; the room is no longer hold-able because `rm_b4c` is in Confirmed; it returns `resource-unavailable`. The application caches *that* rejection against the new occurrence of the token. The client sees `resource-unavailable` — accurately reflecting the current state of the resource, not the stale identity of an old token.

### Banking — credit-hold authorization with retry

A merchant POS submits a $250 authorization with an idempotency key (ISO 20022 BizMsgIdr or scheme-defined equivalent). The acquirer's network glitches; the POS retries within seconds. The composition guarantees the cardholder is charged once, not twice. This is exactly what every modern payment processor implements — Stripe's `Idempotency-Key` HTTP header on `POST /v1/charges` produces the same behavior. The composition's `Invariant 8 — Exactly-once effect within the window` is the contract Stripe documents to merchants.

### Healthcare — bed assignment with double-click

An emergency department coordinator clicks *Assign Bed* on the dashboard. The dashboard hangs; she clicks again. Two `place_hold(bed_307, patient_p41, 2h, ...)` requests arrive at the bed-management service within 800 milliseconds. The dashboard supplies a session-bound idempotency token on every action; both requests carry the same token. The application accepts the first, returns the bed assignment id; the second hits the idempotency cache and returns the same id. One bed assigned to one patient. The unit's regulatory audit (Joint Commission care-coordination standards) sees one assignment record, not two.

### Retail — inventory reservation with mobile retry

A shopper on flaky mobile WiFi taps *Reserve* on a one-of-one luxury item. The app generates an idempotency token from the cart session id and the item sku, attaches it to the request, and retries on network failure with exponential backoff. The composition guarantees the shopper either reserves the item once and sees a successful reservation, or sees a single `resource-unavailable` rejection (someone else got there first) regardless of how many retries the network handler attempts. No phantom *two reservations* state.

### Airline — seat hold with session replay

A travel agency's booking system replays the previous hour's requests after a database failover. Every hold request carries the original idempotency token. The reservation system replays correctly: holds that were already produced return their original commitment ids; holds whose tokens have since expired produce fresh commitments only if their seats are still available. No seat is held twice. The composition's `Invariant 7 — Token expiry releases the binding` is the failure mode the agency's operations team must understand: tokens older than the window are treated as fresh requests.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts, beyond happy-path:

- **Regulator audit — "show me every double-charge."** An auditor queries the underlying Provisional Commitment instance for commitments sharing a `(resource, requester, placed_at-near)` signature. The composition's `Invariant 3 — Token-to-commitment one-to-one within the window` guarantees the query returns the empty set within the window; outside the window the audit must distinguish *legitimate sequential holds* (separate logical operations with separate tokens) from *retry-induced doubles* (which the composition has structurally prevented). The auditor sees a structural guarantee, not a procedural promise.
- **Disputed transaction — "you charged me twice."** The investigator inspects the application's `token_results` map (or its persistent journal). If two of the customer's submitted requests carried the *same* token, the composition's cache produced one commitment and replayed the response — there is no double-spend to dispute. If the customer's client generated *different* tokens for what they intended as the same operation, the application correctly processed them as independent operations; the dispute belongs to the client's token-generation logic, not to the reservation system.
- **Replay attack — adversary captures and replays a token.** An adversary captures an in-flight request and replays it later within the window. The composition correctly returns the cached result. The replay produces no new state change — `Invariant 2 — Idempotent state transitions within the window`. Replays *outside* the window are treated as fresh requests; the adversary may succeed in placing a new commitment if the resource is available and they hold valid credentials, but that is an authentication / authorization failure (see [Actor Identity](../patterns/compliance/actor-identity.md)), not an idempotency failure.

---

## Edge cases and explicit non-goals

What this application does not cover:

- **Cross-instance idempotency.** If the application runs on multiple servers, all instances must share the `token_results` map and the underlying Duplicate Prevention state for the guarantee to hold. Shared state is a deployment concern; a Coordination or Consistent Storage pattern composes naturally. A naïve per-instance deployment produces idempotency only within a single server's sticky-session domain.
- **Durability of the token-results map.** If the application crashes between recording a commitment in Provisional Commitment and persisting the corresponding `token_results` entry, a retry would observe the token as not-seen and produce a second commitment. The application's invariants assume the map is persisted atomically with each successful action, which is an implementation requirement. The spec names this; the implementation owns it.
- **Token format and entropy.** The atom treats the token as opaque. Implementations must ensure tokens have sufficient entropy that two distinct logical operations do not accidentally collide (the IETF idempotency-key draft recommends at least 16 bytes of randomness). Collision risk is the caller's contract to maintain; the application enforces token discipline by digest-matching the request parameters and rejecting accidental cross-action reuse.
- **Long-running idempotency.** The window is bounded by Duplicate Prevention. For idempotency horizons longer than what the recency window can support (hours rather than minutes), compose with a persistent History pattern that records token outcomes durably beyond the recency window.
- **Idempotency under partial composition failure.** If `DuplicatePrevention.record` succeeds but the application crashes before storing `token_results`, the next retry sees `seen` but finds no entry to return — a defect. The implementation must order operations such that the cache is durable before `record` reports success, or use a single transactional boundary across both. This is a Pass-3 finding documented in Lineage notes.
- **Window size selection.** Too short and legitimate retries fall outside the window (producing doubles); too long and the `token_results` map grows unboundedly under load. Window selection is a deployment-shaped concern. Typical values: 60 seconds for HTTP retry envelopes, 5–10 minutes for client-side replay, 24 hours for the slowest payment-rail reconciliation cycles.
- **Selective idempotency.** All four state-changing actions carry idempotency. The application does not permit idempotency on some actions and not others — a partial-idempotency surface would let callers accidentally retry the non-idempotent ones and break Invariant 8. If a host system wants idempotency on only `place_hold`, the wrapping pattern can expose only that action.
- **Token rotation across clients.** If two distinct callers (different requesters, different sessions) generate the same `idempotency_token` value, the second call's `parameters_digest` will not match the first's, and the composition rejects as `token-collision`. This is the right outcome — sharing tokens across callers is a protocol violation — but it imposes the token-uniqueness obligation on the calling layer, not the application.
- **Cancellation of in-flight retries.** If the first call is still in progress when the retry arrives, the application must serialize: the second call waits for the first to complete and then returns the cached result. Concurrent execution of two calls with the same token could produce two underlying actions before the cache is populated. Serialization is a serializable-by-token requirement on the implementation; the spec assumes it.

Where the composition breaks down: when the underlying Duplicate Prevention instance loses recorded tokens (durability failure) and Provisional Commitment retains the corresponding commitments — leading to a token treated as not-seen and a fresh commitment placed alongside the existing one; when the client generates a fresh token on every retry (token discipline lost at the client); when the resource registry's *availability* check is non-deterministic and the first call's outcome is genuinely not reproducible.

---

## Standards references

This composition draws on:

- **IETF draft-ietf-httpapi-idempotency-key-header** — the HTTP idempotency-key convention; an industry-standard wire format for the `idempotency_token`.
- **ISO 20022 (financial messaging)** — `BizMsgIdr` and related message-uniqueness identifiers; the financial-industry standard for at-most-once message semantics.
- **HL7 FHIR `Bundle.identifier`, `MessageHeader.id`** — healthcare-industry standard for at-most-once message processing.
- **Stripe Idempotency-Key, Adyen idempotency header, AWS request-ID** — de-facto industry conventions; this composition formalizes what they all implement.
- **PCI DSS Requirement 10 (logging and monitoring)** — composing with Event Log, the commitment record and the token-mapping together produce the audit-evidence PCI requires.

The two atoms it composes carry their own standards inheritance — Provisional Commitment (ISO 9001 §8.5.2 and §8.5.4, Basel III BCBS 238, Joint Commission, IATA, PCI DSS, GDPR Art. 30, SOX §404, HIPAA §164.312(b)) and Duplicate Prevention (IETF HTTP idempotency-key draft, payment-processor idempotency conventions, message-queue exactly-once-within-window literature).

It inherits from:

- **Stripe's idempotency design document** — the public formalization of *same key, same result* as the contract that makes retry-safe APIs practical.
- **Distributed-systems exactly-once-delivery literature** — Kafka's `enable.idempotence`, RabbitMQ's deduplication, the broader academic line on at-most-once messaging.
- **Pat Helland, *Idempotence is Not a Medical Condition*** — the seminal write-up on idempotency as an API-design discipline rather than an infrastructure trick.

---

## Generation acceptance

A derived implementation of Idempotent Reservation is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the application's `token_results` store plus the underlying Provisional Commitment and Duplicate Prevention instances, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Reconstruct the lifecycle of any commitment.** Through the underlying Provisional Commitment instance, as specified by that atom's Generation acceptance.
- **Verify all eight application-level invariants over the record set.** Idempotent place_hold, idempotent state transitions, token-to-commitment one-to-one, token-action binding, Provisional Commitment invariants preserved, Duplicate Prevention invariants preserved, token expiry releases binding, exactly-once effect.
- **Trace every commitment to its originating idempotency token** (within the window), and verify no two distinct commitments share a token (Invariant 3).
- **Verify the cache-the-failure rule.** Every recorded `token_results` entry contains the original outcome, success or rejection; retries within the window do not invoke the underlying Provisional Commitment.
- **Identify the composing atoms active in this deployment** and their configurations (window duration, token format, digest function).

This is the generator's contract: any code generated from this application must produce records and a runtime surface that pass the five checks above. The bar is the regulator's question — *"can you prove no duplicate state change occurred?"* — answered structurally, not procedurally.

---

## Status

`grounded` — composition logic specified; emergent state (`token_results`) named; action wiring covers all four state-changing surfaces; eight application-level invariants stated and justified; walkthrough plus four cross-domain examples (banking, healthcare, retail, airline) and three adversarial scenarios; edge cases enumerate the deployment-shaped concerns (cross-instance coordination, durability ordering, token entropy, window-size selection); Generation acceptance bar explicit. Second entry in `compositions/`. First regulated application in the library. Demonstrates that two existing atoms compose into the *exactly-once-within-window* contract that every production reservation and payment system implements today.

---

## Lineage notes

This application survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md)) on its first iteration.

**Conventions inherited from prior work.** Drafted with the *Regulated adversarial scenarios* examples subsection and *Generation acceptance* standalone section baked in from the first draft, following the conventions canonicalized in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`PRESSURE_TESTING.md`](../PRESSURE_TESTING.md). The composition pattern (wrap each underlying action with a token-cache check, cache every outcome, preserve constituent invariants) follows the structural template Undo History established for applications.

**Pass 1 — Structural completeness (GRID).** Clean. All nine GRID nodes resolved with their references intact. The user-level Flow is captured in the Walkthrough example rather than as a dedicated Flow subsection — the same convention Undo History uses, where the per-action wiring in Composition logic carries the substantive structure and a separate flow would duplicate it. Application state (`token_results`) is named explicitly, with its lifetime governed by Duplicate Prevention's eventual-expiry invariant — no orphan state.

**Pass 2 — Conceptual independence (EOS).** Clean. The application is properly scoped: it composes Provisional Commitment + Duplicate Prevention without absorbing concerns that belong to additional atoms. The seven concerns named under Edge cases (cross-instance coordination, durability of the token-results map, token format and entropy, long-running idempotency, partial composition failure, window size selection, cancellation of in-flight retries) are correctly named as deployment-shaped concerns or future composing patterns rather than folded into this application. The temptation to absorb durability into the application was real — the *cache-the-failure* rule depends on atomic persistence — but durability is a deployment concern that every persistent atom must address, not a property of this composition specifically.

**Pass 3 — Adversarial scrutiny (Linus mode).** Three findings, all closed in-pattern:

- *Cache-the-failure rule was implicit.* The first draft assumed retries would re-invoke Provisional Commitment if the original call had failed. Resolved: explicit *cache-the-failure rule* subsection naming the contract — every outcome is cached, including rejections; the only outcome not cached is `invalid-request` on a malformed token because there is no valid token to cache against. The walkthrough was updated to cover the eleventh-minute scenario where a stale token is re-presented after the window has elapsed and the application correctly delegates afresh rather than serving stale cached state.
- *Token-action binding was unclear.* Could the same token be reused for `place_hold` and a later `confirm`? The first draft was silent. Resolved: explicit Invariant 4 — *Token-action binding* — and `token-collision` rejection on cross-action or cross-parameter reuse. The application enforces this by digest-matching the call parameters; the caller must use a fresh token for each logical operation.
- *Concurrent retry of the same token was not addressed.* If two retries with the same token arrive simultaneously before the cache is populated, the application could invoke Provisional Commitment twice. Resolved: Edge cases entry *Cancellation of in-flight retries* names the serializable-by-token requirement on the implementation; the spec assumes per-token serialization. The implementation owns the coordination primitive (per-token mutex, optimistic concurrency on the cache row, single-writer queue).

The three passes together exercise the architecture as designed: GRID checks structural completeness of an application (no missing wiring, every emergent property has a named state component); EOS keeps the application from absorbing concerns that belong to deployment or to other atoms; Linus catches the hidden contracts (failure caching, token discipline, retry concurrency) that would otherwise hide beneath the *"just use Stripe-style idempotency keys"* summary. The application is stronger because all three checks happened.
