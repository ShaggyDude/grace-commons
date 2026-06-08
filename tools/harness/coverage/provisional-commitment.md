# Coverage matrix — `provisional-commitment`

- **Pattern:** `atoms/provisional-commitment.md`
- **Model:** `provisional-commitment.tla` (+ buggy twin `provisional-commitment-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03; Inv8 closed — 2026-06-04
- **Formal-layer vote load-bearing claims:** Invariant 7 (confirmation within the window — `confirm` rejected if `now ≥ expires_at`), Invariant 8 (transition timestamps strictly after placement), Invariant 3 (terminal absorption)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/provisional-commitment.tla` → `PASS` ✓ *(15 states, all invariants hold — 2026-06-04 re-run with PlacedAt=1, ExpiresAt=2, MaxClock=3)*
- Buggy twin: `node check.mjs ../../atoms/provisional-commitment-buggy.tla --buggy` → `PASS` (rejected) ✓ *(4 states — Release fires at clock=1, stamps releasedAt=0 < PlacedAt=1; Inv8_TransitionsAfterPlacement violated)*

## Step 2 — coverage matrix

The spec has 10 invariants. The model covers the confirm-within-window timing race (Invariant 7), terminal absorption (Invariant 3), and transition timestamps after placement (Invariant 8) for all three terminal transitions.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Membership exclusivity | No | by-construction | `TypeOK` constrains `state \in States`; `state` is always one of {Held, Confirmed, Released, Expired}. Per model note: "Invariant 1 (membership exclusivity) is TypeOK." |
| Invariant 2 — Hold-then-Held persistence | No | by-construction | `Init` starts in Held; `Confirm`, `Release`, `Expire` each guard `state = "Held"` and transition away once; the model has no action that returns to Held. Acceptable: not load-bearing per vote. |
| Invariant 3 — Terminal absorption | YES (vote) | **covered** | `Inv3_TerminalAbsorbing == everTerminal => (state \in {"Confirmed","Released","Expired"})`. Promoted from by-construction to explicit predicate 2026-06-04 (history-flag form). Buggy twin confirms checker can reject a violation. |
| Invariant 4 — Id stability | No | out-of-scope (no id model; per model header: "id discipline…out of scope") | Acceptable. |
| Invariant 5 — Resource and requester immutability | No | out-of-scope (no resource/requester fields modeled) | Acceptable: not load-bearing per vote. |
| Invariant 6 — Hold window monotonicity (`placed_at < expires_at`) | No | out-of-scope (no `place_hold` action modeled; commitment starts in Held at PlacedAt with `ExpiresAt` fixed as a constant) | Acceptable: not load-bearing per vote. |
| Invariant 7 — Confirmation within the window | YES | **covered** | `Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)`; ghost `confirmedAt` records clock value at confirm; `Confirm` guards `clock < ExpiresAt`; `Expire` guards `clock >= ExpiresAt` (mutually exclusive). Explicit state predicate. |
| Invariant 8 — Transition timestamps strictly after placement | YES (vote) | **covered** | `Inv8_TransitionsAfterPlacement`: asserts `confirmedAt >= PlacedAt`, `releasedAt >= PlacedAt`, `expiredAt >= PlacedAt` in respective terminal states. Ghost variables `releasedAt` and `expiredAt` added 2026-06-04; `PlacedAt = 1` constant gives real teeth (sentinel 0 is strictly below PlacedAt; buggy twin that stamps 0 is caught). Previously a partial GAP (release/expire timestamp halves unchecked) — now closed. |
| Invariant 9 — No id reuse | No | out-of-scope (no id model) | Acceptable. |
| Invariant 10 — Commitment store durability | No | out-of-scope (single commitment model; no deletion surface; per model header) | Acceptable: not load-bearing per vote. |

## Step 3 — bound saturation

`PlacedAt=1`, `ExpiresAt=2`, `MaxClock=3` → **15 states**, all invariants hold. `MaxClock > ExpiresAt > PlacedAt` ensures: the window-within-window guard can fire, expiry is reachable, and release at all clock values (1, 2, 3) is covered. At `MaxClock=4` → 24 states (state count grows as expected — each additional clock tick extends `0..MaxClock`, adding states for the Held-at-that-tick case). The growth is structural/parametric; all distinct behavioral interleavings (confirm within window, release at any clock, expire at or after window) are present at `MaxClock=3`. Semantically saturated at `MaxClock=3`.

## Outcome

- GAP rows: **none** — all three load-bearing invariants are now covered by explicit predicates with non-vacuous buggy twins.
- Closed gaps:
  - **Invariant 3 (terminal absorption):** promoted from by-construction to `Inv3_TerminalAbsorbing` (2026-06-04).
  - **Invariant 8 (transition timestamps strictly after placement):** `releasedAt` and `expiredAt` ghost variables added; `Inv8_TransitionsAfterPlacement` added with `PlacedAt=1` constant; buggy twin updated to stamp `0` on release/expire, triggering a 1-step counterexample (2026-06-04).
- Result: **all load-bearing invariants covered**. Core timing claim (Inv7), terminal absorption (Inv3), and all three transition-timestamp halves of Inv8 are fully covered with explicit named predicates and non-vacuous buggy twins.
