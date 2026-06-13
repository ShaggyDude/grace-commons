# Idempotency Result Memo — atom skeleton (STAGING DRAFT, 2026-06-13)

> **Status: internal staging, NOT canonical, NOT grounded.** A draft skeleton for the backlog atom proposed in `roadmap.md` (2026-06-10) and corroborated by concept-recovery run 2 (`working-ideas/recovery/asgi-idempotency-header.md`). This is a **Shape/early-Specify** artifact — assembled (not authored from scratch) by harvesting existing canonical fragments (the roadmap proposal, Idempotent Reservation's `token_results` + Invariant 7, Duplicate Prevention's shape) and the two recovery witnesses. It has **not** been through GRID / EOS / Linus / Final Critique / Opus gate, and carries no verified formal model. The "Provenance & what the passes still owe" section at the end states exactly what is pre-done vs. outstanding. Mirror-shape source: `atoms/duplicate-prevention.md`.

> Proposed summary line: *A composable temporal concept: a write-once, window-governed record of the result a token produced, so a retry can be replayed the original result instead of re-executing. The result-replay companion to Duplicate Prevention's membership check.*

---

## Intent

Duplicate Prevention answers *have I seen this identity?* — membership, no payload. It explicitly disclaims acting on the result. But idempotent-replay semantics need the other half: *what did I return for this token?* — so a retry can be handed the **original result** rather than re-executed. That half is this atom.

The concept records, exactly once per token, the outcome that token produced (an id, an `ok`, or a rejection reason), and returns it on subsequent lookups within a window. It is freestanding in the EOS sense — its own state (token→result), its own actions (record, get), its own operational principle (write-once, replay-faithful, window-evicted) — and is designed to **compose with** Duplicate Prevention (which owns membership) rather than absorb it. The two together are what makes an operation idempotent-with-replay; neither does it alone. The split is not theoretical: real implementations keep membership and result in *separate stores* (recovery run 2 — `asgi-idempotency-header` uses a set for membership and a dict for results; Idempotent Reservation uses `DuplicatePrevention.recorded` + `token_results`).

---

## Summary

When a system makes an operation idempotent, two questions arise on a retry: *is this token in flight or already handled?* and *if it was handled, what did it return?* The first is Duplicate Prevention's job. This concept owns the second: it keeps a short-term, write-once record mapping each token to the result it produced, so a retry replays that exact result — the same id, the same `ok`, even the same rejection — without running the operation again. The record is written once and never rewritten (so a retry can't change history), and it is evicted on a window so the memory doesn't grow forever. The one rule that makes it safe is about *when* it may be evicted: the result must outlive its membership — if the system still believes a token has been "seen," the result for that token must still be there to return. Evicting the result while membership lingers produces the worst outcome — "seen, but nothing to replay" — which surfaces as a stuck request that can never complete or re-run.

---

## Structure

### Inputs
- An opaque token (idempotency key), supplied by the containing pattern.
- A result value to record — the original outcome (produced id, `ok`, or rejection reason), supplied by the containing pattern.
- A window duration and an eviction coupling to the companion membership guard, supplied by the containing pattern.
- *(Optional, per Idempotent Reservation enrichment)* an `action_type` and `parameters_digest` recorded alongside the result, to detect token-collision (same token, different operation/parameters).
- An implicit wall-time clock.

### Actions
- `record_result(token, result) → ok` — write-once. Records `result` against `token` with `recorded_at = now`. Total on first call; a second `record_result` for a live token is a no-op (the result is immutable for the token's life) — *(open authoring question: no-op vs. reject; see passes-owe).*
- `get_result(token) → result | none` — replay lookup. Returns the recorded result if the token is present and within the window; otherwise `none`. Does not modify state.

### Outputs
- For `get_result(token)`: the recorded `result`, or `none`.
- Implicit: the `results` map, queryable for diagnostics only.

### State
- **`results`** — map `token → (result, recorded_at)` *(optionally `(result, action_type, parameters_digest, recorded_at)`)*. Entries enter via `record_result` and leave on window-governed eviction, coupled to the membership guard (Invariant 3).

### Flow
The concept has no user-driven flow; a containing pattern invokes it, in concert with a membership guard (Duplicate Prevention):
1. Containing pattern completes an operation for `token` → calls `record_result(token, result)` (and `DuplicatePrevention.record(token)`), durably and atomically (Invariant 5).
2. A retry arrives → containing pattern calls `DuplicatePrevention.check(token)`. If `seen`, it calls `get_result(token)` and replays the result. If `not-seen`, it executes afresh.
3. Window elapses → the membership guard expires the token; the result is evicted **no earlier** than the membership (Invariant 3). Subsequent `get_result` → `none`.

### Decision points
- **At `record_result`** — write-once: if `token` already has a live result, preserve it (no overwrite).
- **At `get_result`** — no precondition; result depends only on presence + window.
- **At eviction** — a result may be evicted only once its companion membership no longer reports `seen` (Invariant 3 — the load-bearing constraint).

### Invariants *(harvested from IR Invariant 7 + durability/partial-failure edge cases; corroborated by recovery)*
- **Invariant 1 — Write-once.** A token's recorded result is immutable for the token's life; `record_result` does not overwrite a live entry. (A retry cannot rewrite history.)
- **Invariant 2 — Replay fidelity.** `get_result(token)` returns exactly the result recorded by the first `record_result`, unchanged, for the token's life.
- **Invariant 3 — Eviction ordering (LOAD-BEARING).** A `results` entry must not be evicted while its companion membership guard still reports the token as `seen`. Equivalently: the result outlives-or-equals its membership. Violating it yields *seen-with-no-result*, a defect. *(This is Idempotent Reservation's Invariant 7, lifted to the atom; it is the invariant `asgi-idempotency-header` violates — see Edge cases.)*
- **Invariant 4 — Window-governed eviction.** Results expire after the window; eviction is a derived predicate / native TTL, no sweeper (derive-don't-lag).
- **Invariant 5 — Atomic durable record.** A result is durably recorded atomically with (or before) the companion membership reporting the token `seen`. If membership reports `seen` before the result is durable, a retry observes `seen` with no result — the partial-failure defect.

---

## Examples *(seeded; passes must broaden to ≥3 distinct domains per the template)*

### Payment retry (Stripe-style idempotency key)
A charge succeeds; the processor records `record_result(key, {charge_id})` atomically with marking the key seen. A retry within the window: `check → seen`, `get_result → {charge_id}`, the original charge id is replayed — no second charge. After the window, both membership and result evict together; a reused key is a fresh request.

### Reservation hold (Idempotent Reservation, the worked extraction case)
`token_results[idem_x73a] = (place_hold, digest, rm_b4c)`. A retry with the same token and matching digest replays `rm_b4c`; a mismatched `action_type`/digest yields `token-collision`. The Memo owns the result store; Duplicate Prevention owns membership; Invariant 3 couples their eviction.

---

## Edge cases and explicit non-goals

- **Membership not co-bounded with result → the asgi bug (recovery run 2).** If the membership guard outlives the result (e.g., membership has no TTL while the result does), then once the result evicts, the guard still reports `seen` but `get_result → none`: *seen-with-no-result*. In `asgi-idempotency-header` this surfaces as a permanent `409 "Request already pending"` for a token whose response merely expired — the token is bricked, and the membership set grows unboundedly. This is a **direct violation of Invariant 3** and the canonical reason the eviction-ordering constraint is load-bearing. The atom's contract forbids it by construction.
- **Partial failure on record (Invariant 5).** If membership is marked `seen` before the result is durable and the process crashes between, a retry sees `seen` with no result. The containing pattern must order writes so the result is durable before membership reports `seen`, or commit both in one transactional boundary.
- **Membership is not this atom's job.** The "is this token in flight / already handled" question belongs to Duplicate Prevention. The Memo owns only the result. *(Architectural decision corroborated by both witnesses keeping the two in separate stores.)*
- **Persistence / cross-instance sharing.** Durability across restarts and sharing across nodes are deployment concerns (compose a Consistent Storage / Coordination pattern). A per-instance store gives replay only within a sticky-session domain.
- **Clock semantics.** Wall-time window; skew/monotonicity are deployment concerns (compose a Logical Clock pattern), inherited verbatim from Duplicate Prevention.
- **Result mutation / versioning.** Out of scope — Invariant 1 makes results immutable. A use case needing evolving results is a different concept.

---

## Standards references
- **HTTP idempotency keys** (IETF idempotency-key draft); **Stripe idempotent requests** (the canonical token→result replay design `asgi-idempotency-header` models); **ISO 20022 BizMsgIdr** (financial-message idempotency). Inherits from Daniel Jackson, *The Essence of Software* (freestanding concept), and the distributed-systems exactly-once-within-window literature.

---

## Provenance & what the passes still owe (the speedup ledger)

**Pre-done by harvest + recovery (Spark→Shape collapsed):**
- *Existence / Gate 1 (recurrence):* three independent witnesses — IR `token_results`, `asgi-idempotency-header`, Stripe's design. Largely made.
- *Gate 2/3 (distinct emergent surface, new state):* membership-vs-result split, evidenced by both witnesses keeping separate stores.
- *State machine, action surface, invariant set:* lifted from IR Invariant 7 + durability/partial-failure edge cases + recovery; Invariants 1–5 above.
- *A Pass-3 adversarial finding, pre-computed:* the asgi *seen-with-no-result* bug is a reproduced Linus-class hazard, and it doubles as the **buggy-twin hazard** for the formal model (evict result while membership remains → the checker must reject).

**Still owed by the pipeline (the irreducible work):**
- Full prose to template completeness; ≥3 distinct-domain examples; reading tiers.
- The three passes (GRID / EOS / Linus) + Final Critique + Opus clearance gate, with Scott as the architectural vertex adjudicating each finding.
- Resolve the open authoring questions flagged inline (record-twice: no-op vs. reject; whether `action_type`/`parameters_digest` are core or a configured enrichment; exact eviction-coupling contract with the membership guard).
- Decompose decision: confirm the atom boundary is *Memo (result) + Duplicate Prevention (membership) wired*, vs. a fused concept. (Both witnesses vote for the split.)
- Formal-layer vote (expected YES — at-most-once, eviction-ordering, atomic-durable-record are temporal/safety claims) → TLA+ model + buggy twin verified in `tools/harness/`. The roadmap notes the obligations "lift substantially from `idempotent-reservation.tla` (exactly-once-in-window, unsafe-eviction-ordering)"; the twin hazard is the asgi bug above.

The ledger is the point: recovery + harvest carried the concept from *Spark* to here; the pipeline below the line is the bulk of the grounding effort and remains, with Scott's judgment the only scarce input.

---

## Lineage notes

> This draft has **not** entered the three-pass review arc. The entries below record *origin and provenance only*; GRID / EOS / Linus / Final Critique / Opus-gate are all outstanding (see the speedup ledger above). When the atom enters authoring proper, this section converts to the standard Pass 1/2/3 + Final Critique structure and these origin notes move under a "Provenance" sub-head.

**Origin — recovery-driven harvest, 2026-06-13 (Cowork session; Scott Romack architectural vertex, AI-assisted draft).** This skeleton was not authored from a blank Spark. It was assembled by harvesting four pre-existing sources and composing them into the atom shape:

- **The backlog proposal** — `roadmap.md` (2026-06-10, Refactor 1): "Idempotency Result Memo — token → result, single write, window-governed eviction… the result-replay half of idempotent-replay semantics that Duplicate Prevention's own spec explicitly disclaims." Names the formal obligations as lifting from `idempotent-reservation.tla` (exactly-once-in-window, unsafe-eviction-ordering).
- **The worked extraction-pending case** — Idempotent Reservation's `token_results` (`compositions/idempotent-reservation.md`) and its **Invariant 7** (eviction ordering: a `token_results` entry must never be evicted while its token remains in Duplicate Prevention's recorded set). Invariant 3 of this draft *is* IR Invariant 7 lifted to the atom. Durability (IR's "token-results map persisted atomically") and the partial-failure Pass-3 finding (IR Edge cases) seed Invariant 5.
- **The sibling atom's shape** — `atoms/duplicate-prevention.md` supplied the section template, the membership/result boundary (DP owns membership; this owns result), and the clock-semantics / cross-instance / fail-policy edge-case conventions, inherited verbatim.
- **Concept-recovery witnesses** — run 2 (`working-ideas/recovery/asgi-idempotency-header.md`) confirmed the membership/result split in production code (separate stores) and, critically, **reproduced a real-world violation of Invariant 3** (membership outliving result → *seen-with-no-result* → bricked key). That bug is recorded here as the load-bearing edge case *and* as the pre-computed buggy-twin hazard for the eventual formal model — a Pass-3-class adversarial finding delivered before Pass 1. Run 1 (`recovery/rec.md`) is cited only as method precedent.

**Gate posture (provisional, not adjudicated).** Gate 1 (recurrence): three independent witnesses on record — strong. Gate 2 (emergent surface no constituent owns): the result-replay surface DP explicitly disclaims — provisionally yes. Gate 3 (new state, not wiring): token→result is truth no replay of Provisional Commitment + Duplicate Prevention reproduces (the settled non-derivable pole of the composition-state audit) — provisionally yes. **These are author-provisional and await the EOS pass; recorded as a starting position, not a verdict.**

**Formal-layer vote — not yet cast.** Expected YES on the evidence (at-most-once, eviction-ordering, atomic-durable-record are temporal/safety claims); obligations lift from `idempotent-reservation.tla`; buggy-twin hazard pre-identified (the asgi violation). The vote is formally outstanding until the atom enters authoring.

**No passes run. No findings closed. Status: pre-Spark-complete staging draft.**
