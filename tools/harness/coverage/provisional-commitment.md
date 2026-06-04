# Coverage matrix — `provisional-commitment`

- **Pattern:** `atoms/resource-lifecycle/provisional-commitment.md`
- **Model:** `provisional-commitment.tla` (+ buggy twin `provisional-commitment-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 7 (confirmation within the window — `confirm` rejected if `now ≥ expires_at`), Invariant 8 (transition timestamps strictly after placement), Invariant 3 (terminal absorption)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/resource-lifecycle/provisional-commitment.tla` → `PASS` ☐ *(per Lineage: 17 states, holds)*
- Buggy twin: `node check.mjs ../../atoms/resource-lifecycle/provisional-commitment-buggy.tla --buggy` → `PASS` (rejected) ☐ *(per Lineage: rejected at 10 states — confirm fires at clock = ExpiresAt)*

## Step 2 — coverage matrix

The spec has 10 invariants. The model focuses on the confirm-within-window timing race (Invariant 7); other invariants are either by-construction or out-of-scope.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Membership exclusivity | No | by-construction | `TypeOK` constrains `state \in States`; `state` is always one of {Held, Confirmed, Released, Expired}. Per model note: "Invariant 1 (membership exclusivity) is TypeOK." |
| Invariant 2 — Hold-then-Held persistence | No | by-construction | `Init` starts in Held; `Confirm`, `Release`, `Expire` each guard `state = "Held"` and transition away once; the model has no action that returns to Held. Acceptable: not load-bearing per vote. |
| Invariant 3 — Terminal absorption | YES (vote) | by-construction | `Confirm`, `Release`, `Expire` all guard `state = "Held"`; once a terminal state is entered, no further transitions are enabled. Per model note explicitly. **Flag: load-bearing per vote, held by-construction rather than explicit state predicate.** |
| Invariant 4 — Id stability | No | out-of-scope (no id model; per model header: "id discipline…out of scope") | Acceptable. |
| Invariant 5 — Resource and requester immutability | No | out-of-scope (no resource/requester fields modeled) | Acceptable: not load-bearing per vote. |
| Invariant 6 — Hold window monotonicity (`placed_at < expires_at`) | No | out-of-scope (no `place_hold` action modeled; commitment starts in Held at clock=0 with `ExpiresAt` fixed) | Acceptable: not load-bearing per vote. |
| Invariant 7 — Confirmation within the window | YES | covered | `Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)`; ghost `confirmedAt` records clock value at confirm; `Confirm` guards `clock < ExpiresAt`; `Expire` guards `clock >= ExpiresAt` (mutually exclusive). Explicit state predicate. |
| Invariant 8 — Transition timestamps strictly after placement | YES (vote) | out-of-scope (clock model is a bounded counter starting at 0; `placed_at = 0` by convention; `confirmedAt >= 0 = placed_at` trivially holds, but `released_at` and `expired_at` are not modeled as ghost variables) | **Partial coverage.** The model verifies `confirmedAt < ExpiresAt` (the within-window part) but does not separately assert `confirmedAt >= placed_at` (the after-placement part of Inv8). For `Release` and `Expire`, no timestamp ghost is captured, so their `≥ placed_at` requirements are unchecked. This is a coverage gap on the release/expire timestamp aspects of Inv8. |
| Invariant 9 — No id reuse | No | out-of-scope (no id model) | Acceptable. |
| Invariant 10 — Commitment store durability | No | out-of-scope (single commitment model; no deletion surface; per model header) | Acceptable: not load-bearing per vote. |

## Step 3 — bound saturation

Per Lineage: `ExpiresAt=2`, `MaxClock=3` → 17 reachable states. `MaxClock > ExpiresAt` is required to show that clock can advance past the window, making `Expire` enabled and `Confirm` disabled. Three clock ticks with four state values produces a modest but sufficient state space for the timing race. Appear adequate.

## Outcome

- GAP rows:
  - **Invariant 8 (transition timestamps strictly after placement) — partial GAP.** Load-bearing per vote. The model verifies `confirmedAt < ExpiresAt` but does not separately check `confirmedAt ≥ placed_at` (trivially true here since both start at 0, but not an explicit assertion), and does not capture ghost timestamps for `Release` or `Expire` at all. The release/expire halves of Inv8 are unchecked. Route as finding.
- by-construction flags on load-bearing invariants: **Invariant 3 (terminal absorption) — load-bearing per vote, held by-construction.** Flag for promotion to an explicit predicate, e.g., `Inv3_TerminalAbsorption == state \in {"Confirmed","Released","Expired"} => []( state \in {"Confirmed","Released","Expired"} )` (liveness form) or simply confirming via TypeOK that no action has a Confirmed/Released/Expired → anything else step.
- Result: **one partial GAP (Inv8 release/expire timestamps unchecked), one by-construction flag on load-bearing Inv3.** Route Inv8 as a finding. The core timing claim (Inv7) is fully covered.
