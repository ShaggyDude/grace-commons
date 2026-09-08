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

This composition solves the problem at the composition layer rather than absorbing it into Provisional Commitment. The caller supplies an **`idempotency_token`** on every state-changing call. The composition checks the token against a [Duplicate Prevention](../atoms/duplicate-prevention.md) instance; if the token has been seen within the window (the configurable time period during which repeated tokens are detected and deduplicated), the composition returns the *original* response (the same commitment id, the same `ok`, the same rejection reason) without invoking [Provisional Commitment](../atoms/provisional-commitment.md) a second time — with one exception Invariant 2 states: a resolving action whose first invocation died before recording the constituent's answer is re-run, effect-free by the constituent's own single-resolution invariant. The constituent atoms are unchanged; the composition is the wiring.

This is the same composition that runs in every payment processor in production today — Stripe's `Idempotency-Key`, Adyen's idempotency header, ISO 20022's (the International Organization for Standardization standard for financial-messaging data) message uniqueness identifier, the IETF (Internet Engineering Task Force — the body that develops internet standards) draft idempotency-key spec. Different vocabularies; identical mechanic.

---

## Composes

- **[Provisional Commitment](../atoms/provisional-commitment.md)** — provides the underlying lifecycle (Held → Confirmed | Released | Expired) and all the invariants every commitment satisfies. The composition maintains exactly one Provisional Commitment instance.
- **[Duplicate Prevention](../atoms/duplicate-prevention.md)** — provides the temporally-bounded recency guard against repeated tokens. The composition maintains exactly one Duplicate Prevention instance, configured with the idempotency window and token-equality matching.

---

## Composition logic

### Composition state

The composition owns one piece of state that neither constituent atom carries:

- **`token_results`** — a map from `idempotency_token` to a recorded outcome: `(action_type, parameters_digest, result, pending_at, completed_at)`. [Action Type] is one of `place_hold`, `confirm`, `release`, `expire`. [Parameters Digest] is a collision-resistant digest of the non-token call parameters, **computed by a pure function or configured digest mechanism at the composition's I/O seam and injected into the transition** — the digest is an explicit input derived from the already-present non-token call parameters, not cryptography improvised inside core logic (see Configuration §`digest_function`; the mechanism-capability pattern per [`execution-contract.md`](../execution-contract.md) §Logic Confinement Principle). The serialization format must be stable and canonical (e.g., sorted key-value pairs encoded with a length prefix); the digest function and serialization convention must be consistent across all instances sharing the `token_results` store — inconsistency across replicas or versions causes legitimate retries to be misclassified as `token-collision`. [Result] is the original response — either the produced `id` (for [Place Hold]) or `ok`, or the rejection reason — exactly as returned to the caller on the first call. An entry has **one writer per act**: the invocation that wrote it as `pending` — `(action_type, parameters_digest, pending, pending_at, —)`, the intent, written before Provisional Commitment is called — and overwrites it in place with the [Result] and `completed_at` once the constituent has answered; or, where that invocation died first, the re-entry arm of Action wiring that overwrites the `pending` entry with `recovery = true`. Never both. `pending_at` and `completed_at` are the composition's own seam readings (the same injected `now` its constituents consume; never a signature parameter); a complete entry keeps its `pending_at`, because the window the entry lives in is measured from it. An entry still `pending` after its invocation has returned or died is the record that an act *may* have happened, and it is kept, not evicted, for the lifetime a recorded token would have had (the eviction leg, below).

**Classification: extraction-pending.** `token_results` carries non-derivable truth — which result was returned for a given token — that no replay of Provisional Commitment plus Duplicate Prevention can reproduce: Duplicate Prevention answers *have I seen this identity?* (membership, no payload) and does not act on the result. Per [`execution-contract.md`](../execution-contract.md) §Composition state, a composition element that carries truth not reconstructible from constituent stores is a not-yet-extracted atom, and until that atom lands the element is declared here as recorded debt riding the extraction's schedule. The proposed atom is an **Idempotency Result Memo** (token → result; write-once; window-governed eviction); the extraction is opened as a roadmap proposal (see [`roadmap.md`](../roadmap.md)).

The map's lifetime is governed by the Duplicate Prevention window. Entries are evicted by **the eviction leg** — a composition-introduced surface, the one leg this composition runs outside an invocation — bounded at both edges and exclusive with the invocations it runs beside: **(i)** it takes the token's section (`per_token_serialization`, Configuration) before it examines an entry, and skips any token whose section it cannot take, because a live invocation holds it; **(ii)** it examines no entry younger than `reservation_completion_bound` (Configuration) measured from `pending_at` — the lower edge, below which an invocation may still be in flight; **(iii)** under the section it evicts an entry only when **both** `DuplicatePrevention.check(token) → not-seen` **and** `idempotency_window` has elapsed since `pending_at` — the upper edge, past which Invariant 7 already treats the token as fresh. A `seen` token's entry is never evicted (the ordering Invariant 7 requires), and a `not-seen` entry younger than the window — `pending` or complete — is kept, because it is the only record that its invocation acted or may have. The leg evicts and does nothing else: it repairs nothing, re-delegates nothing, and promises no closure window (a stale entry is a leak, not a defect — Invariant 7), so it owes no liveness inequality and runs on whatever schedule the deployment chooses. Both stamps it compares are the composition's own seam readings; no constituent stamp decides an eviction.

### Configuration

Deployment-settable knobs:

- **`idempotency_window`** — the duration of the Duplicate Prevention window; passed to the Duplicate Prevention instance at initialization. Default: 60 seconds for HTTP retry envelopes; 5–10 minutes for client-side replay scenarios; 24 hours for slow payment-rail reconciliation. Regulated deployments (PCI DSS (Payment Card Industry Data Security Standard), ISO 20022) must select a window long enough to cover the slowest legitimate retry cycle for the most critical action. Window-size selection considerations are elaborated in Edge cases.
- **`token_max_length`** — the maximum byte length of a well-formed `idempotency_token`. Default: 256 bytes. Must be large enough to accommodate the token format used by the caller (IETF idempotency-key draft recommends at least 16 bytes of randomness; UUIDs are 36 characters; composed keys may be longer).
- **`digest_function`** — the hash function and serialization convention used to compute `parameters_digest`. The digest is computed by a pure function or configured digest mechanism at the composition's I/O seam (injected as an explicit input into the transition; never computed inside core logic — Logic Confinement Principle). Must be specified and consistent across all instances sharing the `token_results` store; inconsistency across replicas or versions causes legitimate retries to be misclassified as `token-collision`.
- **`per_token_serialization`** — an **instance capability requirement**: a host-supplied critical section keyed by `idempotency_token`, **shared across every instance that shares the `token_results` store** (one section per token corpus-wide, not one per server), taken by every state-changing invocation before its first write and by the eviction leg before it examines an entry. Neither constituent grants it — Duplicate Prevention's `check` is read-only and its `record` is total, and Provisional Commitment serializes [Place Hold] per *resource* under its own host's guarantees, not per token — so the deployment declares it or the exactly-once guarantee (Invariant 8) is not made. Semantics: the section is released on the holder's return or death; where the host implements it as a lease, the lease is exactly `reservation_completion_bound` long and its expiry is the invocation's terminus — the invocation attempts no further write once it has lapsed; every write after the invocation's first (the `pending` entry) is made only while the section is held; a section found lost is re-taken before any pre-check is re-read. This is what makes the look-then-write pre-check of Action wiring exact: a second call carrying the same token waits on the section and re-reads `token_results` under it, so it finds the first call's entry instead of racing it. *Default:* none — declared per deployment.
- **`reservation_completion_bound`** — the longest an invocation of any state-changing action may take between its first write (the `pending` entry) and its last (`DuplicatePrevention.record`), measured against the composition's own seam reading. It is three things at once: the lease length of `per_token_serialization`; the terminus of an invocation's retry of its [Result] write — an invocation that has not landed the [Result] by the bound returns `rejected(recording-failure(outcome))` and yields; and the lower edge of the eviction leg, which examines nothing younger. Must be strictly less than `idempotency_window`; checked at instance start, and a deployment whose knobs fail the check refuses to start. *Default:* none.
- **`token_results_durability`** — a deployment obligation of the composition's own, declared here rather than assumed: the `token_results` store is durable across process restarts for at least `idempotency_window + reservation_completion_bound` past each entry's `pending_at` — the token's own guard runs from its `record`, which lands up to the bound after `pending_at`, so an entry that outlives its Duplicate Prevention guard by that margin cannot leave a lawfully recorded token on the *no entry, `seen`* arm — and each write to it — the `pending` entry, the [Result] — is acknowledged only once durable. Invariants 7 and 8 rest on it; it is the durability obligation the extraction-pending element carries until the Idempotency Result Memo atom lands. The composition claims **no atomicity** between this store and Provisional Commitment's — the constituent's own edge case sends multi-commitment transactions to a Transaction pattern — and instead orders its writes and recovers each reachable partial (Edge cases — *Durability and partial failure*). *Default:* none.
- **`duplicate_prevention_store`** — the two host obligations Duplicate Prevention's own contract declines and this composition spends: the recorded set is **durable across process restarts** (the atom: *"Volatile in-memory implementations are valid"* — not here), and `check` store unavailability is resolved **fail-closed** (the atom leaves the choice to the deployment; fail-open would admit the double Invariant 8 forbids). Under fail-closed an unavailable store answers `seen`; a token with no entry then lands `rejected(outcome-unknown)` for [Place Hold] — the false rejection the atom names as fail-closed's cost, retried later under the same token — while the resolving actions re-run safely. Invariant 8's condition (c). *Default:* none.
- **`commitment_store_acknowledged_atomic`** — the obligation Provisional Commitment's own contract places on its implementor and this composition transcribes: *"State transitions are atomic … the implementor owns the transactional boundary"*, so that its `storage-failure` means what the atom says — *no Commitment is created* on [Place Hold], *the Commitment remains in Held* on a resolving action — and an acknowledged write is durable. Where the deployment declares it, the constituent's `storage-failure` is **definitive** and is cached against the token like any other rejection. Where it cannot, the composition does not know whether the write that failed to acknowledge landed, and caches `outcome-unknown(candidates)` — the in-doubt landing — in its place, never *nothing committed*. Routed to the externally-clearable check. *Default:* declared.

### Primitive policies

Composition-boundary validation for string-typed inputs:

- **`idempotency_token`** — must be non-null and non-empty (rejection: `invalid-request`); must not exceed `token_max_length` bytes (rejection: `invalid-request`). The atom treats the token as opaque — no whitespace normalization, no Unicode normalization, no case folding. Comparison is byte-exact. Validation occurs at the composition layer before the Duplicate Prevention check; a malformed token is rejected before any constituent is consulted.
- **`resource`, `requester`, `duration`** — validated by Provisional Commitment's own preconditions; failures propagate as `invalid-request` from Provisional Commitment and are cached against the token (unless the token itself was malformed, in which case there is no token to cache against).

### Action wiring

The composition replaces Provisional Commitment's direct API surface. Each action carries a required [Idempotency Token] parameter; otherwise the parameters and return shape match Provisional Commitment's.

- **[Place Hold]** — (Projected contract: `place_hold(resource, requester, duration, idempotency_token) → id | rejected(invalid-request | token-collision | resource-unavailable | storage-failure | outcome-unknown(candidates) | recording-failure(intent | outcome(id?)))`)
  1. Validate `idempotency_token` is well-formed (non-empty, within length); otherwise `rejected(invalid-request)`. Nothing has been written.
  2. Take the token's section (`per_token_serialization`, Configuration). Then call `DuplicatePrevention.check(idempotency_token)` and look up `token_results[idempotency_token]` **under the section** — the look-then-write pre-check is re-read under the serialization, never before it. Four cases:
     - **A complete entry** (a recorded [Result]). First the window, on the composition's own stamps alone: an entry whose `pending_at` is older than `idempotency_window` **and** whose token `check` reports `not-seen` is expired — under the section the invocation evicts it in place and proceeds as the *no entry, `not-seen`* arm below, which is how Invariant 7's fresh request is reached without waiting for the eviction leg (an entry past the window whose token is still `seen` is under guard and replays — Invariant 7's ordering). Inside the window, whether `check` said `seen` or `not-seen`: if the recorded `action_type` is `place_hold` and the recorded `parameters_digest` matches the current call's digest, return the recorded `result` (the original `id` or rejection reason) — and where `check` said `not-seen`, first call `DuplicatePrevention.record(idempotency_token)` again, because the first invocation's `record` did not land (a silent write miss, or a crash between its [Result] write and its `record`). If `action_type` differs or `parameters_digest` does not match, return `rejected(token-collision)`.
     - **No entry, `not-seen`** — a fresh request. Write the intent: `token_results[idempotency_token] = (place_hold, digest, pending, pending_at, —)`. If that write fails, release the section and return `rejected(recording-failure(intent))` — nothing is committed anywhere, and the whole action may be retried; where the write in fact landed unacknowledged, the same-token retry finds a `pending` entry and lands the `pending` arm, which is safe (its empty-candidates case proceeds as never delegated). Then delegate to `ProvisionalCommitment.place_hold(resource, requester, duration)`. Whatever the constituent returns — `id`, `resource-unavailable`, `invalid-request`, `storage-failure` — overwrite the entry in place with it: `token_results[idempotency_token] = (place_hold, digest, result, pending_at, completed_at)`; `storage-failure` is recorded as itself only under `commitment_store_acknowledged_atomic` (Configuration), and as `outcome-unknown(candidates)` where the deployment does not declare it. Attempt that write until it lands or `reservation_completion_bound` elapses; if it has not landed by the bound, return `rejected(recording-failure(outcome(id?)))` **carrying the constituent's answer — the committed `id` where there is one** — and yield: the caller must not re-run the act under a fresh token, and a retry under the same token lands the `pending` arm below. Once the [Result] is recorded, call `DuplicatePrevention.record(idempotency_token)`, release the section, and return the result to the caller.
     - **A `pending` entry** — the section is held, so the invocation that wrote it has returned or died between its `pending` write and its [Result] write, and whether Provisional Commitment committed for it is **not re-derivable** from any record the composition holds: the constituent's record carries no token. The composition therefore **does not re-delegate**. If `action_type` or the digest does not match, `rejected(token-collision)`. Otherwise compute `candidates` — the composition's own filter, its own code, not a constituent read, over Provisional Commitment's exported set of Held commitments, keeping those whose `resource` and `requester` equal this call's. **Empty candidates: the entry is treated as never delegated** — the constituent holds nothing for these parameters, so the dead invocation did not reach it (or its `pending` write landed unacknowledged, the `recording-failure(intent)` case) — and the invocation proceeds from the delegation step of the *no entry, `not-seen`* arm under the same entry; this is exact wherever the hold's `duration` exceeds the time to the retry, and a hold that had already expired by then is the resource's history, not a live double. **Non-empty candidates:** overwrite the entry with `result = outcome-unknown(candidates)`, `completed_at`, and `recovery = true`; call `DuplicatePrevention.record(idempotency_token)`; release the section; return `rejected(outcome-unknown(candidates))`, replayed for every later call carrying this token (the cache-the-failure rule). The caller, or an operator, resolves the candidates — releasing a hold that was not meant, adopting one that was — and proceeds under a fresh token.
     - **No entry, `seen`** — Duplicate Prevention remembers the token and the composition does not: a breach of `token_results_durability`, or a fail-closed `check` against an unavailable store (`duplicate_prevention_store`). The composition cannot tell a lost entry from a fresh token and does not re-delegate: release the section and return `rejected(outcome-unknown(candidates))`, computed as above, recording nothing — the composition did not act, so there is nothing to cache — and a later call under the same token, once `check` can answer, is decided afresh.
  3. Release the section on every return; a section found lost mid-invocation (a lapsed lease) is the invocation's terminus — no further write is attempted on the strength of the pre-check made under it.

- **[Confirm]** — (Projected contract: `confirm(id, idempotency_token) → ok | rejected(invalid-request | token-collision | not-known | not-held | window-elapsed | storage-failure | outcome-unknown(candidates) | recording-failure(intent | outcome(result)))`) — same wiring as [Place Hold], delegating to `ProvisionalCommitment.confirm(id)`, with one difference in the `pending` arm and the *no entry, `seen`* arm: a resolving action **re-runs** rather than naming candidates, because Provisional Commitment's single-resolution invariant (its Invariant 2) makes a second call effect-free — the commitment reaches at most one terminal state, so the constituent either commits the one transition the caller intended or answers `not-held` — and exactly-once effect is preserved by the constituent's own contract. The re-run overwrites the `pending` entry (or, on the *no entry, `seen`* arm, writes a fresh one) with the constituent's answer and `recovery = true`, calls `record`, and returns it; the response may differ from the one the dead invocation would have returned (`not-held` where it would have said `ok`), which the entry's `recovery = true` records. Constituent rejections (`not-known`, `not-held`, `window-elapsed`, and — under `commitment_store_acknowledged_atomic` — `storage-failure`) pass through and are cached; `recording-failure(outcome(result))` carries the constituent's `ok` or rejection where the [Result] write did not land by the bound.

- **[Release]** — (Projected contract: `release(id, idempotency_token) → ok | rejected(invalid-request | token-collision | not-known | not-held | window-elapsed | storage-failure | outcome-unknown(candidates) | recording-failure(intent | outcome(result)))`) — same wiring as [Confirm], delegating to `ProvisionalCommitment.release(id)`; a resolving action, so its `pending` arm re-runs.

- **[Expire]** — (Projected contract: `expire(id, idempotency_token) → ok | rejected(invalid-request | token-collision | not-known | not-held | window-not-elapsed | storage-failure | outcome-unknown(candidates) | recording-failure(intent | outcome(result)))`) — same wiring as [Confirm], delegating to `ProvisionalCommitment.expire(id)`; a resolving action, so its `pending` arm re-runs. The constituent's `window-not-elapsed` passes through and is cached like its siblings.

Read-only queries (listing Held commitments, inspecting a commitment by id) pass through to Provisional Commitment without token consultation; idempotency applies only to state-changing actions.

### The cache-the-failure rule

A non-obvious correctness requirement: the composition records *every* outcome against the token, success or rejection. If the first [Place Hold] returns `resource-unavailable` and the retry is allowed to re-call Provisional Commitment, the retry might succeed (the resource may have become available in between). That violates the *same token, same result* contract — the caller would observe different responses to what they intended as the same operation. Caching the failure preserves the invariant; the caller's retry returns the original `resource-unavailable`, and the caller (or a wrapping policy) decides whether to attempt the call again with a *fresh* token.

The composition does *not* cache three things, and in each the reason is that it did not act and holds no entry to cache against: the `invalid-request` rejection for a malformed `idempotency_token`, because there is no valid token; the `outcome-unknown` returned on the *no entry, `seen`* arm, because the composition recorded nothing and the next `check` may answer; and the two `recording-failure` positions, which report a write that did not land rather than an outcome — the `outcome` position leaves a `pending` entry behind, and the `pending` arm is what a same-token retry lands.

---

## Composition-level invariants

These invariants emerge from the composition. None of them belong to a single constituent atom; each requires both atoms working together to hold.

- **Invariant 1 — Idempotent [Place Hold] within the window.** For any `idempotency_token` currently within the Duplicate Prevention window, repeated `place_hold(... , idempotency_token)` calls with matching `parameters_digest` return the same response — the same `id` on success, or the same rejection reason on failure.
- **Invariant 2 — Idempotent state transitions within the window.** Same property holds for [Confirm], [Release], and [Expire]. A retry within the window returns the cached response; the constituent atom is not invoked a second time — except on the `pending` re-entry arm, where the first invocation died before recording the constituent's answer and the re-run is effect-free by Provisional Commitment Invariant 2 (single-resolution).
- **Invariant 3 — Token-to-commitment one-to-one within the window.** At most one commitment id is bound to any given `idempotency_token` while that token is in the window. Two distinct commitments cannot share a token.
- **Invariant 4 — Token-action binding.** Each `idempotency_token` is bound to one logical operation. Reusing the same token for a different `action_type` or with a different `parameters_digest` is rejected as `token-collision`.
- **Invariant 5 — Provisional Commitment's invariants preserved.** All invariants from Provisional Commitment hold over the underlying instance. The composition never bypasses preconditions; the constituent's rejections (`resource-unavailable`, `not-held`, `window-elapsed`, etc.) flow through unchanged and are cached against the token — `storage-failure` included only where `commitment_store_acknowledged_atomic` (Configuration) makes it definitive; otherwise the composition caches `outcome-unknown(candidates)` in its place.
- **Invariant 6 — Duplicate Prevention's invariants preserved.** All invariants from Duplicate Prevention hold. The composition calls `record` once per first invocation of each token, and again in two arms: where the first `record` demonstrably did not land (`check → not-seen` against a complete entry), which by Duplicate Prevention Invariant 2 starts a guard rather than extending one; and on the resolving actions' *no entry, `seen`* arm, where the token is already under guard and the re-record is harmless by the same invariant, which preserves the original Recorded At; subsequent retries do not extend the window (single-recording invariant).
- **Invariant 7 — Token expiry releases the binding.** Once Duplicate Prevention's eventual-expiry invariant has elapsed the token *and* `idempotency_window` has elapsed since the entry's `pending_at`, the eviction leg (*Composition state*) evicts `token_results[token]`. A subsequent call with the same token is treated as a fresh request and may produce a new commitment id. The critical eviction ordering constraint: a `token_results` entry must never be evicted while its corresponding token remains in Duplicate Prevention's recorded set — that would cause `check → seen` with no result to return, the arm the wiring lands as `outcome-unknown`. The safe direction is the reverse: a stale `token_results` entry for an already-evicted token is a memory leak but not a correctness failure, which is why the leg promises no closure window. The ordering is enforced by the leg's own arm — no entry is evicted unless `DuplicatePrevention.check(token) → not-seen` under the token's section — or, alternatively, discharged as a **declared coupling** in which the `token_results` store and the Duplicate Prevention store share a single eviction boundary (e.g., a single store keyed on the token and governed by one time-to-live no shorter than `idempotency_window` from `pending_at`), making the ordering a structural property of the deployment rather than a procedural check. *Rests on:* `token_results_durability` and `per_token_serialization` (Configuration).
- **Invariant 8 — Exactly-once effect within the window.** *Conditional on* three deployment-declared capabilities, each a Configuration entry: (a) `per_token_serialization` — concurrent calls carrying one token are serialized, so the cache is populated before any second execution branch can delegate to Provisional Commitment, and the eviction leg writes under the same section (*Composition state*; Edge cases — *Section, terminus, and the second writer*); (b) `token_results_durability` — the `pending` entry and the [Result] are durable when acknowledged and survive restarts for the window; (c) `duplicate_prevention_store` — the recorded set survives restarts and an unavailable store fails closed, the two obligations Duplicate Prevention's own contract leaves to the deployment and this invariant spends. Provided all three hold: for any state change the caller intends — placing one hold, confirming one commitment, releasing one commitment, expiring one — the underlying Provisional Commitment instance observes exactly one *effective* action invocation regardless of retry count, as long as all retries use the same token within the window: [Place Hold] is delegated at most once per token, and a resolving action re-run on the `pending` arm is effect-free by Provisional Commitment Invariant 2. Where a partial leaves the first delegation's outcome unknowable, the composition answers `outcome-unknown` and delegates nothing further (Edge cases — *Durability and partial failure*).

Idempotent [Place Hold] and exactly-once effect together give the *no-double-spend* property — the contract that makes this composition usable in payments, healthcare, and every other domain where a duplicated state change is a defect rather than a no-op. Token-action binding gives the *token-discipline* property that prevents accidental reuse across distinct operations.

---

## Examples

### Walkthrough

A client behind a flaky network reserves a hotel room. The composition is configured with a 10-minute idempotency window.

1. **First call:** `place_hold(room_307, guest_g91, 24h, idem_x73a)` → composition takes the token's section; `check(idem_x73a) → not-seen`, no entry; writes `token_results[idem_x73a] = (place_hold, digest_α, pending, pending_at, —)`; delegates to Provisional Commitment; receives `rm_b4c`. Overwrites the entry with `(place_hold, digest_α, rm_b4c, pending_at, completed_at)`, calls `DuplicatePrevention.record(idem_x73a)`, releases the section. Returns `rm_b4c` to the client. State: `rm_b4c` Held.
2. **Network drops the response. Client retries:** `place_hold(room_307, guest_g91, 24h, idem_x73a)` → `check(idem_x73a) → seen`; lookup matches; returns cached `rm_b4c`. *Provisional Commitment is not invoked.* No second commitment is created.
3. **Client retries twice more:** identical outcome. Provisional Commitment still sees only one [Place Hold].
4. **Two hours later, client confirms** with a fresh token: `confirm(rm_b4c, idem_y22)` → `check(idem_y22) → not-seen`; delegates to `ProvisionalCommitment.confirm(rm_b4c)` → `ok`. Records and returns `ok`. State: `rm_b4c` Confirmed.
5. **Client retries the confirm** (browser back button or replay): `confirm(rm_b4c, idem_y22)` → `check → seen`; returns cached `ok`. Crucially, the second call does *not* return `rejected(not-held)` — which is what would happen if the retry hit Provisional Commitment directly, because `rm_b4c` has already moved Held → Confirmed. The idempotency cache hides the terminal-absorption rejection from the legitimate retry.
6. **Eleven minutes later, client retries the original [Place Hold]** with `idem_x73a`. The 10-minute window has elapsed; `idem_x73a` is no longer in `DuplicatePrevention.recorded` (eventual-expiry invariant). `check → not-seen`; once the eviction leg has run, `token_results[idem_x73a]` is gone and the call is a fresh request — and where it has not yet run (its timing is not promised), the complete-entry arm finds an entry past the window with a `not-seen` token, evicts it in place under the section, and proceeds identically. Either way the composition delegates afresh. Provisional Commitment receives [Place Hold] against `room_307`; the room is no longer hold-able because `rm_b4c` is in Confirmed; it returns `resource-unavailable`. The composition caches *that* rejection against the new occurrence of the token. The client sees `resource-unavailable` — accurately reflecting the current state of the resource, not the stale identity of an old token.

### Banking — credit-hold authorization with retry

A merchant POS submits a $250 authorization with an idempotency key (ISO 20022 BizMsgIdr or scheme-defined equivalent). The acquirer's network glitches; the POS retries within seconds. The composition guarantees the cardholder is charged once, not twice. This is exactly what every modern payment processor implements — Stripe's `Idempotency-Key` HTTP header on `POST /v1/charges` produces the same behavior. The composition's `Invariant 8 — Exactly-once effect within the window` is the contract Stripe documents to merchants.

### Healthcare — bed assignment with double-click

An emergency department coordinator clicks *Assign Bed* on the dashboard. The dashboard hangs; she clicks again. Two `place_hold(bed_307, patient_p41, 2h, ...)` requests arrive at the bed-management service within 800 milliseconds. The dashboard supplies a session-bound idempotency token on every action; both requests carry the same token. The composition accepts the first, returns the bed assignment id; the second hits the idempotency cache and returns the same id. One bed assigned to one patient. The unit's regulatory audit (Joint Commission care-coordination standards) sees one assignment record, not two.

### Retail — inventory reservation with mobile retry

A shopper on flaky mobile WiFi taps *Reserve* on a one-of-one luxury item. The app generates an idempotency token from the cart session id and the item sku, attaches it to the request, and retries on network failure with exponential backoff. The composition guarantees the shopper either reserves the item once and sees a successful reservation, or sees a single `resource-unavailable` rejection (someone else got there first) regardless of how many retries the network handler attempts — or, where the service died between reserving and recording, one of the two honest answers in place of a second reservation: `recording-failure(outcome(id?))` carrying the reservation's `id`, or `outcome-unknown(candidates)` naming the hold it can see but cannot pair, which the app resolves before trying again under a fresh token. No phantom *two reservations* state.

### Airline — seat hold with session replay

A travel agency's booking system replays the previous hour's requests after a database failover. Every hold request carries the original idempotency token. The reservation system replays correctly: holds that were already produced return their original commitment ids; holds whose tokens have since expired produce fresh commitments only if their seats are still available. No seat is held twice. The composition's `Invariant 7 — Token expiry releases the binding` is the failure mode the agency's operations team must understand: tokens older than the window are treated as fresh requests.

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts, beyond happy-path:

- **Regulator audit — "show me every double-charge."** An auditor filters the underlying Provisional Commitment instance's exported commitment sets — the atom exports the sets and each record's fields, not a query keyed by them, so the filter is the auditor's own — for commitments sharing a `(resource, requester, placed_at-near)` signature. The composition's `Invariant 3 — Token-to-commitment one-to-one within the window` guarantees the query returns the empty set within the window; outside the window the audit must distinguish *legitimate sequential holds* (separate logical operations with separate tokens) from *retry-induced doubles* (which the composition has structurally prevented). The auditor sees a structural guarantee, not a procedural promise.
- **Disputed transaction — "you charged me twice."** The investigator inspects the composition's `token_results` map (or its persistent journal). If two of the customer's submitted requests carried the *same* token, the composition's cache produced one commitment and replayed the response — there is no double-spend to dispute. If the customer's client generated *different* tokens for what they intended as the same operation, the composition correctly processed them as independent operations; the dispute belongs to the client's token-generation logic, not to the reservation system.
- **Replay attack — adversary captures and replays a token.** An adversary captures an in-flight request and replays it later within the window. The composition correctly returns the cached result. The replay produces no new state change — `Invariant 2 — Idempotent state transitions within the window`. Replays *outside* the window are treated as fresh requests; the adversary may succeed in placing a new commitment if the resource is available and they hold valid credentials, but that is an authentication / authorization failure (see [Actor Identity](../atoms/actor-identity.md)), not an idempotency failure.
- **Token reuse collision — caller accidentally reuses a token across two operations.** A developer reuses `idem_x73a` (originally used for `place_hold(room_307, ...)`) in a subsequent `confirm(rm_b4c, idem_x73a)` call. The composition checks: `DuplicatePrevention.check(idem_x73a) → seen`; looks up `token_results[idem_x73a]` and finds `action_type = place_hold`. Current call's `action_type = confirm` — mismatch. Returns `rejected(token-collision)`. No state change occurs. The caller must use a fresh token for the confirm. Invariant 4 (*Token-action binding*) is the structural guarantee; [Token Collision] is its observable form.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Cross-instance idempotency.** If the composition runs on multiple servers, all instances must share the `token_results` map, the underlying Duplicate Prevention state, and the `per_token_serialization` section (Configuration) — a section held on one server and not on another is no section — for the guarantee to hold. Shared state is handled at the deployment layer; a Coordination or Consistent Storage pattern composes naturally. A naïve per-instance deployment produces idempotency only within a single server's sticky-session domain.
- **Durability and partial failure.** The composition claims no atomicity across its own store and Provisional Commitment's — the constituent's edge case, *"Multi-commitment transactions belong to a Transaction pattern"*, sends the two-store case away, and a claim that the two commit together would be false on the page. It states the write order instead — `pending` entry → `ProvisionalCommitment.<action>` → [Result] → `DuplicatePrevention.record` — and the recovery for each partial a crash can leave, under `token_results_durability` and `duplicate_prevention_store` (Configuration): *(i)* crash before the `pending` write — nothing anywhere; a retry is a fresh request. *(ii)* crash after `pending`, before the [Result] — the constituent may or may not have committed and nothing the composition holds says which; the retry's `pending` arm names candidates for [Place Hold] and re-runs the effect-free resolving actions, and never re-delegates a [Place Hold] — what cannot be re-derived is not re-emitted. *(iii)* crash after the [Result], before `record` — `check → not-seen` against a complete entry; the retry returns the entry and lands the missed `record`. *(iv)* `record`'s own silent write miss — indistinguishable from (iii) and handled by the same arm. *(v)* the entry lost while `check → seen` — a durability breach, landed as `outcome-unknown` with nothing re-delegated. No partial produces a second commitment for one token, and no recovery writes a result it did not read from the constituent.
- **Token format and entropy.** The atom treats the token as opaque. Implementations must ensure tokens have sufficient entropy that two distinct logical operations do not accidentally collide (the IETF idempotency-key draft recommends at least 16 bytes of randomness). Collision risk is the caller's contract to maintain; the composition enforces token discipline by digest-matching the request parameters and rejecting accidental cross-action reuse.
- **Long-running idempotency.** The window is bounded by Duplicate Prevention. For idempotency horizons longer than what the recency window can support (hours rather than minutes), compose with a persistent History pattern that records token outcomes durably beyond the recency window.
- **Section, terminus, and the second writer.** Every write after the `pending` entry is made while the token's section is held (`per_token_serialization`); an invocation that cannot land its [Result] by `reservation_completion_bound` returns `rejected(recording-failure(outcome))` carrying the constituent's answer and yields, and its section (or lease) lapses with it. The only other writer over an entry is the eviction leg, which takes the same section, so an invocation and the leg — or two runs of the leg, on one node or two — never both act on one token; a stalled invocation that wakes after its lease has lapsed finds its section lost and re-takes it before re-reading the entry, never writing on the strength of a pre-check it made before. The `seen`-with-no-entry defect was a Pass-3 finding in the pattern's first rounds, recorded in the commit history; it is closed by the section and the four arms of Action wiring rather than by write ordering alone, which left the mirror partial — entry present, `record` not landed — open.
- **Window size selection.** Too short and legitimate retries fall outside the window (producing doubles); too long and the `token_results` map grows unboundedly under load. Window selection is handled at the deployment layer. Typical values: 60 seconds for HTTP retry envelopes, 5–10 minutes for client-side replay, 24 hours for the slowest payment-rail reconciliation cycles.
- **Selective idempotency.** All four state-changing actions carry idempotency. The composition does not permit idempotency on some actions and not others — a partial-idempotency surface would let callers accidentally retry the non-idempotent ones and break Invariant 8. If a host system wants idempotency on only [Place Hold], the wrapping pattern can expose only that action.
- **Token rotation across clients.** If two distinct callers (different requesters, different sessions) generate the same `idempotency_token` value, the second call's `parameters_digest` will not match the first's, and the composition rejects as `token-collision`. This is the right outcome — sharing tokens across callers is a protocol violation — but it imposes the token-uniqueness obligation on the calling layer, not the composition.
- **Cancellation of in-flight retries.** If the first call is still in progress when the retry arrives, the retry waits on the token's section (`per_token_serialization`, Configuration) and then re-reads `token_results` under it, finding the first call's entry — complete, and returned as the cached result; or `pending`, if the first call died or yielded, and handled by the `pending` arm. Concurrent execution of two calls with the same token, which could produce two underlying actions before the cache is populated, is what the declared section forecloses; it is a deployment-declared instance capability, not an assumption.

Where the composition breaks down: when a deployment breaches both `duplicate_prevention_store` and `token_results_durability` at once — the Duplicate Prevention instance loses its recorded tokens *and* the entry is lost, or `check` fails open against a lost entry — while Provisional Commitment retains the corresponding commitments, so that a token is decided fresh and a second commitment is placed alongside the existing one (a loss of either store alone is landed by the wiring's arms); when the client generates a fresh token on every retry (token discipline lost at the client); when the resource registry's *availability* check is non-deterministic and the first call's outcome is genuinely not reproducible.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the retry-safe action-wirings it exposes ([Place Hold], [Confirm], [Release], [Expire]), the [Idempotency Token] it introduces on every call, and the fields of the recorded outcome it caches ([Action Type], [Parameters Digest], [Result]) plus its own [Token Collision], [Outcome Unknown] and [Recording Failure] rejections. It carries one piece of own state — the `token_results` map (classified extraction-pending, the proposed *Idempotency Result Memo* atom) — left as a backticked store token rather than carded as a Type, so its Fields are carded against the plain-noun recorded outcome. References to the constituent atoms and their operations — Provisional Commitment's `place_hold`/`confirm`/`release`/`expire`, Duplicate Prevention's `check`/`record` — the inherited rejection tokens (`resource-unavailable`, `not-known`, `not-held`, `window-elapsed`, `window-not-elapsed`, `storage-failure`, `invalid-request`), the entry states and stamps (`pending`, `recovery`, `pending_at`, `completed_at`), and the deployment configuration knobs (`idempotency_window`, `token_max_length`, `digest_function`, `per_token_serialization`, `reservation_completion_bound`, `token_results_durability`, `duplicate_prevention_store`, `commitment_store_acknowledged_atomic`) all remain qualified/backticked, not carded here. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Place Hold

The composition action that places a hold, made retry-safe: it validates the [Idempotency Token], and on a first call writes the `pending` intent against the token, then delegates to Provisional Commitment's `place_hold` and overwrites the intent with the outcome; a retry within the window replays the cached [Result] instead of delegating again. Returns the commitment `id`, or a cached / delegated rejection.

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

The recorded outcome's copy of the original response — the produced `id` or `ok`, or the rejection reason — exactly as returned to the caller on the first call, or the `outcome-unknown(candidates)` the re-entry arm wrote in place of an answer nobody recorded. Every outcome is cached, success or rejection (the cache-the-failure rule).

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

#### Outcome Unknown

The composition's own rejection for a token whose earlier invocation may have acted and did not record its answer — a `pending` entry found under the token's section, or a token Duplicate Prevention remembers and `token_results` does not. For [Place Hold] it carries the candidate Held commitments matching the call's resource and requester, filtered composition-side from Provisional Commitment's exported set; the composition re-delegates nothing (the resolving actions re-run instead, effect-free by Provisional Commitment Invariant 2). Replayed for the token's window when written against a `pending` entry; uncached when no entry existed.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  outcome-unknown

#### Recording Failure

The composition's own rejection for a write to `token_results` that did not land, carrying its position and, at the outcome position, the constituent's answer. `intent`: the `pending` entry failed — nothing is committed, and the whole action may be retried (a write that landed unacknowledged is found by the retry's `pending` arm, whose empty-candidates case proceeds as never delegated). `outcome(id?)` for [Place Hold], `outcome(result)` for the resolving actions: the constituent has answered — the committed `id` where there is one, else its rejection or `ok` — and the [Result] could not be recorded by `reservation_completion_bound`; the act must not be re-run under a fresh token, and a same-token retry lands the `pending` arm.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  recording-failure

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
[Outcome Unknown]: #outcome-unknown
[Recording Failure]: #recording-failure

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
- **Verify the cache-the-failure rule and the one-writer rule.** Every complete `token_results` entry contains the original outcome, success or rejection, written by one invocation — an entry carrying `recovery = true` names the re-entry arm as its writer, and no entry carries two results. For [Place Hold], no two commitments share a token: the records-observable form of *not invoked a second time*, since the constituent records no rejected or absent invocations, and non-invocation of a resolving action leaves no record at all — that half is routed to the externally-clearable tier below.

### Externally-clearable checks

These questions arise around the composition but require deployment configuration or external evidence to answer:

- **Identify the composing atoms active in this deployment** and their configurations (window duration, token format, digest function). The window duration, digest function, and token max-length are deployment-settable; the auditor must obtain these from the deployment configuration record or the operator, not from the commitment or token-results stores alone.
- **Confirm the four host obligations the invariants spend.** From the deployment configuration record: `per_token_serialization` is supplied with the declared release-on-return-or-death semantics and, where it is a lease, a lease exactly `reservation_completion_bound` long; `reservation_completion_bound < idempotency_window` is checked at instance start; `token_results_durability` (for `idempotency_window + reservation_completion_bound` past `pending_at`) and `duplicate_prevention_store` (durable across restarts, fail-closed on `check` unavailability) are met; and whether `commitment_store_acknowledged_atomic` is declared — which decides whether a cached `storage-failure` is definitive or the composition caches `outcome-unknown(candidates)` in its place. And that a retry of a resolving action within the window does not invoke the constituent except on the `pending` re-entry arm — a runtime-surface claim, not one the records carry.

This is the generator's contract: any code generated from this composition must produce records and a runtime surface that pass the four record-clearable checks above. The bar is the regulator's question — *"can you prove no duplicate state change occurred?"* — answered structurally, not procedurally.

---

## Status

`partially resolved` — see the Ledger.

## Ledger

```
status: partially resolved
formal: pending — re-derivation, 2026-08-30: the model has each invocation as one atomic step, with no `pending` intent, no per-token section with a lease terminus, and no eviction leg as a second process over one token; was verified — idempotent-reservation.tla + 1 twin, 2026-06-03
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open:
- 2026-08-30-a · refining · formal · the invocation is one atomic step — no `pending` intent, no per-token section with a lease terminus, no eviction leg as a second process over one token, no `outcome-unknown` arm; the twin's early-eviction hazard is now the leg's (iii) → extend it
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/idempotent-reservation.md`.

- **2026-08-30 — The intent is written before the act, the writer is one per token, and what cannot be re-derived is not re-run.** *Chose:* a `pending` entry written to `token_results` before Provisional Commitment is called, with a re-entry arm that — finding it under the token's section — names candidate holds for [Place Hold] and re-runs only the resolving actions, whose second call is effect-free by the constituent's single-resolution invariant; `per_token_serialization` declared as an instance capability requirement (released on return or death; a lease exactly `reservation_completion_bound` long whose expiry is the invocation's terminus) and taken by the eviction leg too, so the invocation and the leg never both write one token; the leg bounded at both edges — nothing younger than the bound, eviction only past the window and only for a `not-seen` token; `recording-failure(intent | outcome)` on every signature, the `outcome` position carrying the committed `id`, and Provisional Commitment's `storage-failure`, `not-known` and `window-not-elapsed` transcribed; Duplicate Prevention's disclaimed durability and its fail-open/fail-closed choice declared as `duplicate_prevention_store`, condition (c) of Invariant 8; `token_results` durability housed in Configuration; the claimed atomicity between the two stores replaced by write order, five reachable partials, and a recovery for each; and, from the closure check the same day, the complete-entry arm guarded by the window on the composition's own stamps (an expired `not-seen` entry evicted in place, so Invariant 7's fresh request does not wait on the leg), `pending_at` kept on the complete entry with `completed_at` beside it, the section declared shared across every instance sharing the store, `commitment_store_acknowledged_atomic` transcribing the constituent's own write obligation so that `storage-failure` is cached as definitive only where it is, and the `pending` arm's empty-candidates case proceeding as never delegated. *Over:* "persisted atomically with each successful action" as an implementation requirement, an eviction surface that read an in-flight invocation as evictable, a serialization the spec "assumed", and four signatures that told a caller nothing was committed when a commitment existed. *Because:* the constituent's record carries no token, so a crash between the act and its record leaves an outcome no retry can re-derive — and a retry that re-delegates is the double this composition exists to prevent; two writers over one token land two results; and a caller who cannot tell `intent` from `outcome` re-runs a committed act (the frozen rules of 2026-08-30 — *A compensator is exclusive*, *A composition's own rejection arm carries the retry bit*, and *Capability provenance* frozen — with §*A reconciliation is bounded at both ends* and §*Recovery commits under a declared service identity* of 2026-08-29).
