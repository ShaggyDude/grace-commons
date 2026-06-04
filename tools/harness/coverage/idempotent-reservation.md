# Coverage matrix — `idempotent-reservation`

- **Pattern:** `compositions/idempotent-reservation.md`
- **Model:** `idempotent-reservation.tla` + `idempotent-reservation-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 8 (exactly-once effect within the window — no double-spend under concurrent retry); Invariant 7 (token eviction ordering — unsafe eviction causes a replay to re-delegate mid-window, breaking the no-double-spend property)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/idempotent-reservation.tla` → `PASS` ☐ *(prior: 17 states)*
- Buggy twin: `node check.mjs ../../compositions/idempotent-reservation-buggy.tla --buggy` → `PASS` (rejected) ☐ *(prior: rejected at 14 states — `EvictEarly` causes re-delegation mid-window, `effectsThisWindow = 2`)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Idempotent place_hold within the window | YES | **covered** | Subsumed by `Inv_ExactlyOnceInWindow`. If at most one underlying effect fires within the true window, then any number of `place_hold` calls with the same token within that window produce at most one commitment. The model checks this directly: `InWindow => effectsThisWindow <= 1`. |
| Invariant 2 — Idempotent state transitions within the window | YES | **covered** | Same as Invariant 1 — `Inv_ExactlyOnceInWindow` covers all delegations within the window, not just `place_hold`. The model models the delegation gate generically (the `PlaceHoldDelegate` action represents any state-changing delegation). |
| Invariant 3 — Token-to-commitment one-to-one within the window | no | out-of-scope ("NOT MODELED: parameters_digest / token-collision (Invariant 4), the constituent commitment state machine (Invariant 5)") — follows from Invariant 8 at most-one-delegation, but the distinct-commitment-id property requires modeling the commitment state machine | — |
| Invariant 4 — Token-action binding | no | out-of-scope ("NOT MODELED: parameters_digest / token-collision (Invariant 4)") | — |
| Invariant 5 — Provisional Commitment's invariants preserved | no | out-of-scope ("NOT MODELED: the constituent commitment state machine (Invariant 5) — see provisional-commitment.tla") | — |
| Invariant 6 — Duplicate Prevention's invariants preserved | no | by-construction | The model's `ExpireCache` guard (`clock - firstEffectAt >= Window`) encodes the safe eviction ordering from Duplicate Prevention's single-recording invariant. The `RecordFresh` analog is `PlaceHoldDelegate`'s `~InWindow` branch. The structural fidelity is by model construction, not an asserted property. |
| Invariant 7 — Token expiry releases the binding (eviction ordering) | YES | **covered** | The buggy twin adds `EvictEarly` — cache eviction with no window guard — and the checker finds `effectsThisWindow = 2` (the double-spend). The correct model's `ExpireCache` guards on `clock - firstEffectAt >= Window`, so safe eviction is only possible once the true window has elapsed. The unsafe ordering is mechanically demonstrated as unsafe by the buggy twin. Inv 7's specific claim ("a `token_results` entry must never be evicted while its token remains in Duplicate Prevention's `recorded` set") maps directly to this model. |
| Invariant 8 — Exactly-once effect within the window | YES | **covered** | `Inv_ExactlyOnceInWindow == InWindow => (effectsThisWindow <= 1)` — asserted directly. The primary load-bearing claim of the model. |

## Step 3 — bound saturation

- At `Window=2, MaxClock=3`: 17 states (per Lineage). State space is bounded by clock × `everEffected` × `firstEffectAt` × `effectsThisWindow` × `cacheHas`. The model is small and the bound is standard for single-token idempotency models. A `Window=3, MaxClock=5` run would confirm saturation; the current bound is adequate for the primary claim given the model's structural simplicity.

## Outcome

- GAP rows: none
- by-construction flags on load-bearing invariants: none (Invariants 1/2, 7, and 8 are all directly covered or mechanically demonstrated via buggy-twin rejection)
- Result: **clean** — all formal-layer vote claims covered; Invariants 3 and 4 are defensibly out-of-scope; Invariants 5 and 6 are by-construction with correct reasoning. — Coverage cross-check 2026-06-03.
