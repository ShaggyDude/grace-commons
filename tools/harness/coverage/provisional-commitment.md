# Coverage matrix — `provisional-commitment`

- **Pattern:** `atoms/provisional-commitment.md`
- **Model:** `provisional-commitment.tla` (+ two isolated buggy twins: `provisional-commitment-buggy.tla` (resolution hazard), `provisional-commitment-buggy-window.tla` (window hazard))
- **Reviewer / date:** agent coverage cross-check — 2026-06-03; Inv8 closed — 2026-06-04; **derive-expiry refactor reverted, model restored to FC4 stored-Expired shape and re-aligned — 2026-06-23**
- **Formal-layer vote load-bearing claims:** Invariant 7 (confirmation within the window — `confirm`/`release` rejected if `now ≥ expires_at`, `expire` rejected if `now < expires_at`), Invariant 2 (single-resolution), Invariant 8 (transition timestamps strictly after placement), Invariant 3 (terminal absorption)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/provisional-commitment.tla` → `PASS` ✓ *(12 states, all invariants hold — 2026-06-23 re-run with PlacedAt=1, ExpiresAt=2, MaxClock=3)*
- Buggy twin (resolution hazard): `node check.mjs ../../atoms/provisional-commitment-buggy.tla --buggy` → `PASS` (rejected) ✓ *(9 states — `ConfirmBuggy` drops the `state = Held` guard; Release then ConfirmBuggy re-resolves an already-Released commitment; `Inv_SingleResolution` violated. Confirmed isolated: `Inv_ConfirmWithinWindow` holds in this twin.)*
- Buggy twin (window hazard): `node check.mjs ../../atoms/provisional-commitment-buggy-window.tla --buggy` → `PASS` (rejected) ✓ *(6 states — `ConfirmBuggy` admits at `clock <= ExpiresAt`; tick to ExpiresAt then confirm a lapsed hold stamps `confirmedAt = ExpiresAt`; `Inv_ConfirmWithinWindow` violated. Confirmed isolated: `Inv_SingleResolution` holds in this twin.)*

## Step 2 — coverage matrix

The spec has 10 invariants. The model covers single-resolution over the three stored terminals (Invariant 2), the confirm-within-window timing race (Invariant 7), terminal absorption (Invariant 3), and transition timestamps after placement (Invariant 8) for all three terminal transitions.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Membership exclusivity | No | by-construction | `TypeOK` constrains `state \in States`; `state` is always one of {Held, Confirmed, Released, Expired}. Per model note: "Invariant 1 (membership exclusivity) is TypeOK." |
| Invariant 2 — Single-resolution | YES | **covered** | `Inv_SingleResolution == (resolution # "none") => (state = resolution)`; ghost `resolution` records the first stored terminal reached, so a re-resolution is detectable. The resolution buggy twin (drops the `state = Held` guard) confirms the checker can reject a second resolution. |
| Invariant 3 — Terminal absorption | YES (vote) | **covered** | `Inv3_TerminalAbsorbing == everTerminal => (state \in Terminals)` (history-flag form). A transition out of a terminal would violate it; downstream of the resolution twin's re-resolution. |
| Invariant 4 — Id stability | No | out-of-scope (no id model; per model header: "id discipline…out of scope") | Acceptable. |
| Invariant 5 — Resource and requester immutability | No | out-of-scope (no resource/requester fields modeled) | Acceptable: not load-bearing per vote. |
| Invariant 6 — Hold window monotonicity (`placed_at < expires_at`) | No | out-of-scope (no `place_hold` action modeled; commitment starts in Held at PlacedAt with `ExpiresAt` fixed as a constant) | Acceptable: not load-bearing per vote. |
| Invariant 7 — Confirmation within the window | YES | **covered** | `Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)`; ghost `confirmedAt` records clock value at confirm; `Confirm`/`Release` guard `clock < ExpiresAt`; `Expire` guards `clock >= ExpiresAt` (mutually exclusive). The window buggy twin (admit at `clock <= ExpiresAt`) confirms the checker can reject. |
| Invariant 8 — Transition timestamps strictly after placement | YES (vote) | **covered** | `Inv8_TransitionsAfterPlacement`: asserts `confirmedAt >= PlacedAt`, `releasedAt >= PlacedAt`, `expiredAt >= PlacedAt` in respective terminal states. Ghost variables `confirmedAt`/`releasedAt`/`expiredAt`; `PlacedAt = 1` constant gives real teeth (sentinel 0 is strictly below PlacedAt). |
| Invariant 9 — No id reuse | No | out-of-scope (no id model) | Acceptable. |
| Invariant 10 — Commitment store durability | No | out-of-scope (single commitment model; no deletion surface; per model header) | Acceptable: not load-bearing per vote. |

## Step 3 — bound saturation

`PlacedAt=1`, `ExpiresAt=2`, `MaxClock=3` → **12 states**, all invariants hold. `MaxClock > ExpiresAt > PlacedAt` ensures: the within-window guard can fire, expiry is reachable (Expire enabled at clock ∈ {2, 3}), and confirm/release at clock ∈ {1} are covered. The clock is modeled as an advancing input, so the raw state count grows with `MaxClock` while the behavior space saturates once the clock crosses `ExpiresAt`; all distinct behavioral interleavings (confirm/release within window, expire at or after window) are present at `MaxClock=3`. Semantically saturated at `MaxClock=3`.

## Outcome

- GAP rows: **none** — all four load-bearing invariants (Inv 2, Inv 3, Inv 7, Inv 8) are covered by explicit predicates, each with a non-vacuous buggy twin (the two hazards split across two isolated twins so each load-bearing guarantee has its own reachable, checker-rejected counterexample).
- Restore note (2026-06-23): the "derive expiry at read time" refactor was withdrawn for this atom because its lapse has a side effect (returns a resource / pool slot to availability); the model returns to the FC4 stored-`Expired` shape with an explicit `Expire` transition. Single-resolution (`Inv_SingleResolution`) is retained as the resolution-twin target; the window hazard is the window-twin target.
- Result: **all load-bearing invariants covered** with explicit named predicates and non-vacuous, hazard-isolated buggy twins.
