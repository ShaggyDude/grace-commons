# Concept recovery — run 2: `asgi-idempotency-header` (2026-06-13)

> **Status: internal staging, not canonical.** Second concept-recovery run (pipeline in `working-ideas/concept-recovery.md`). Subject: [`sondrelg/asgi-idempotency-header`](https://github.com/sondrelg/asgi-idempotency-header) v0.2.0 (on PyPI; Starlette/FastAPI middleware). The *medium* target — chosen because, unlike `rec`, it has a runtime surface (clock, store, request lifecycle) that actually exercises the four-destination routing. **Three headline results: (1) it confirms the library's predicted `Idempotency Result Memo` atom in the wild; (2) the routing test does real work and confirms `derive-don't-lag` in production; (3) the recovered invariant catches a real latent bug — a bricked-key / memory-leak defect the test suite misses — and this time the bug maps directly onto a *named library invariant*, not just a local contract.**

---

## Subject

ASGI middleware making `POST`/`PATCH` endpoints idempotent. Client sends an `Idempotency-Key` header; the middleware caches the JSON response and replays it on repeat requests, rejecting still-in-flight duplicates with `409`. Modelled on Stripe's idempotent-requests design. Backends: in-memory (dict + set) and Redis (`sadd`/`set`/`expire`). The middleware (`middleware.py`) is the orchestration; `backends/base.py` is the abstract contract; `memory.py` / `redis.py` implement it.

## Stage 3 — classification (routing test + three gates)

The routing test finally does work (vs. `rec`'s pure algebra — all four destinations appear):

- **VALUE — the clock.** Expiry is computed from `time.time()` (memory) / Redis TTL. In execution-contract terms the clock is a value; here it's read *ambiently inside the backend* rather than injected — a recovered deviation from Logic Confinement, but a benign one for this concern.
- **CONCEPT(s) — two of them, and the split is the headline.** (a) the **idempotency-key membership record** (the `keys` set / Redis `KEYS_KEY`): a temporally-bounded "have I seen this key, is it in flight?" — **Duplicate Prevention**. (b) the **key→response memo** (`response_store` dict / Redis payload+status keys): token→result, window-governed — **exactly the `Idempotency Result Memo`** the library proposed. Two *separate* methods (`store_idempotency_key` membership vs `store_response_data` result) over two *separate* stores.
- **OBLIGATION — atomic check-and-insert.** `store_idempotency_key` must atomically "add if absent, report whether it existed." `base.py` states this as a contract ("implementations most likely will want to implement some locking mechanism to prevent race conditions and double execution"); Redis realizes it with `sadd`. Textbook **behavior-vs-mechanism**: the *behavior* (atomic CAS) is declared on the backend interface; the *mechanism* (sadd / lock) is the backend's free choice. No concept holds a transaction handle.
- **No CALLER — `derive-don't-lag` confirmed in the wild.** There is *no sweeper*. Expiry is a lazy predicate (memory: checked and deleted on read) or native TTL (Redis). The biggest daemon — cache eviction — has dissolved into a derived check, exactly as the library predicts.
- **Wiring — the middleware.** A stateless interpreter of a directed sequence (method check → key present → replay-if-stored → reject-if-pending → proceed → capture response → store-if-JSON). Carries no truth itself; delegates all state to the backend.

**Ground-truth match — prediction CONFIRMED.** The shortlist predicted this maps to **Idempotent Reservation / Duplicate Prevention** *and* would surface the **`token_results` → Idempotency Result Memo** atom flagged extraction-pending in `composition-state-audit.md`. It does, structurally and exactly: membership (the pending-set, returns a bool) is a *distinct store and method* from the result memo (key→response). The library argued that idempotent-replay needs a token→result store that Duplicate Prevention (membership-only, "does not act on the result") cannot provide. **This production middleware independently implements that exact split.** Strong corroboration of a library prediction in real-world code — the run-2 headline.

## Recovered invariants

- **I1 — At-most-once execution per key.** A request whose key is already pending is rejected (`409`) before reaching the app; the app runs at most once per key. (Rests on the atomic check-and-insert obligation.)
- **I2 — Same-key → same-response (idempotent replay).** Once a response is stored, repeat requests return it verbatim (`Idempotent-Replayed: true`), never re-execute.
- **I3 — Membership/result separation.** Pending-membership and the result memo are distinct state with distinct lifecycles. (The structural basis for the Memo extraction.)
- **I4 — Atomicity precondition (the obligation).** `store_idempotency_key` must be an atomic CAS or two concurrent requests both proceed (double execution). Declared behavior; backend mechanism.
- **I5 — Window-governed eviction.** Stored state expires after `expiry`; eviction is a derived predicate / native TTL, no sweeper.
- **Scoping invariant.** Only configured methods + JSON responses + a present key are cached; non-JSON or decode-error responses *clear the key and do not cache* (a failed response must not poison the cache).

## Stage 4 — verification against the test suite

- `test_multiple_concurrent_requests` (req1 `200`, req2 `409`) → corroborates **I1**. ✓
- `test_idempotence_works_for_json_responses` (2nd call returns same body + `idempotent-replayed: true`) → corroborates **I2**. ✓
- `test_non_json_responses` / `test_wrong_response_encoding` (not replayed) → corroborates the **scoping invariant**. ✓

All recovered invariants that the tests exercise hold. But — as in run 1 — the more valuable stage-4 output is a recovered invariant the code *violates*:

→ **Finding F (latent bug — confirmed by execution).** **After a successful (JSON) request, the middleware stores the response but never calls `clear_idempotency_key`, so the key stays in the pending set forever.** The backend contract (`base.py`) explicitly says the key *should* be cleared on completion — and the middleware *does* clear it on the two failure-completion branches (non-JSON, decode error) but **not** on the success branch. The asymmetry (clears on 2 of 3 completion paths) is the tell.

While the cached response is alive this is harmless — replay short-circuits before the pending check. But **the result memo is window-bounded while the pending-membership is not** (the `keys` set / Redis `KEYS_KEY` carry no expiry/TTL). So once the response expires:

```
store_idempotency_key (first)        -> already_pending=False   (proceed)
keys set after success               -> {'key-123'}             (key still 'pending' — never cleared)
get_stored_response (alive)          -> REPLAY ok
get_stored_response (after expiry)   -> None (expired, deleted)
store_idempotency_key (after expiry) -> already_pending=True
>>> 409 'Request already pending' for a key that is NOT pending. Key is bricked.
```

(Reproduced against the real `MemoryBackend`, `expiry=1s`.) Two consequences, both backends: **(a)** any client reusing a key after the expiry window gets a permanent, false `409` — the key is bricked; **(b)** the pending set grows without bound (a slow memory leak in the memory backend; unbounded `KEYS_KEY` set in Redis), since successful keys are never removed.

The test suite misses it because no test advances time past `expiry` — the same blind spot as run 1 (the suite never exercises the path the bug lives on).

**Why this is the thesis, sharper than run 1.** The bug is precisely what a *named library invariant* forbids. The library's **Duplicate Prevention** atom is defined as a *temporally-bounded* record of seen identities — the seen-set expires by construction. This implementation bounds the *result* store but not the *membership* store, and that asymmetric eviction *is* the defect. A spec-conformant Duplicate Prevention would window-bound the membership set and the bug could not exist. Run 1 recovered a *local contract* (Apply returns O) that caught what types/tests missed; run 2 recovered a *named domain invariant* (membership is temporally bounded) that caught what tests missed — a stronger demonstration, because the catch comes from the library's ontology, not just from reading one function's docstring.

## Cross-validation with the library

- The **membership/result split** the library argued for (Duplicate Prevention = membership only; Idempotency Result Memo = token→result) is implemented verbatim here — independent evidence the extraction argument carves a real joint.
- The **behavior-vs-mechanism** rule (declared atomic CAS, backend-chosen realization) appears exactly as the no-global-services paper predicts an obligation should.
- **`derive-don't-lag`** (no sweeper; expiry as predicate / native TTL) is confirmed in production code, not just asserted.

## Eval (run 2)

- **The routing test did real work** — value, concept(s), obligation, wiring all present and cleanly sorted; the absence of a caller is itself a positive finding (`derive-don't-lag`). This is the validation `rec` couldn't provide.
- **A library prediction was confirmed in the wild** (the Idempotency Result Memo split) — the reverse direction validating the taxonomy, exactly the falsifiability spirit of the emergent-invariant metric.
- **A real, higher-severity bug** was found (bricked keys + unbounded growth in a published, used package), via a recovered invariant that maps onto a *named* library concept — and missed by the test suite. Two-for-two: the lens finds what types and tests don't.
- **Severity note:** unlike `rec` (10-year-old, niche), this is a live FastAPI/Starlette middleware on PyPI; the bug has real-world bite (idempotency keys reused after the 24h default expiry break; pending sets leak). Worth an upstream issue if Scott chooses — clean repro above.

## Actions

- **Backlog (Grace Commons):** the `Idempotency Result Memo` extraction-pending atom now has a *second* real-world witness (after the composition-state audit's IR/`token_results` case) — strengthens its Gate-1 recurrence case toward authoring.
- **Upstream (optional):** `asgi-idempotency-header` — success path should `clear_idempotency_key` (or give the pending key the same TTL as the response). One-branch fix; repro included.
- **Eval roll-up:** two runs, two confirmed bugs, one confirmed prediction. The method holds on both pure-algebra and real-middleware shapes. Next scale step is the ERPNext saturation target — but that needs the extractor question resolved first (per `concept-recovery.md`).
