# Coverage matrix — `medication-order`

- **Pattern:** `atoms/healthcare/medication-order.md`
- **Model:** `medication-order.tla` (+ buggy twin `medication-order-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 5 (hold carries prior_state; reinstate returns to exactly it), Invariants 3/4 (pre-dispensing-only, linear amendment chains), Invariant 9 (On Hold accepts only reinstate)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/healthcare/medication-order.tla` → `PASS` ☐ *(per Lineage: 31 states, holds)*
- Buggy twin: `node check.mjs ../../atoms/healthcare/medication-order-buggy.tla --buggy` → `PASS` (rejected) ☐ *(per Lineage: rejected at 11 states — reinstates to wrong state)*

## Step 2 — coverage matrix

The spec has 14 invariants. The model focuses on hold/reinstate round-trip (Invariants 5, 9); amendment chain invariants (Invariants 3, 4) are explicitly deferred to Alloy.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Order immutability | No | out-of-scope (structural; field model not present) | Acceptable: not load-bearing per vote. |
| Invariant 2 — Successor inherits identity fields | No | out-of-scope (no `amend`/successor chain in model; per model header) | Acceptable. |
| Invariant 3 — Amendment is pre-dispensing only | YES (vote) | out-of-scope (structural → Alloy) | Per model header: "amend / successor-predecessor chains (Invariants 3,4 — structural, linear amendment is the Alloy-class property)." **Flag: load-bearing per vote, deferred to Alloy but no Alloy model exists yet.** This is a GAP until an Alloy model is authored. |
| Invariant 4 — Amendment chains are linear | YES (vote) | out-of-scope (structural → Alloy) | Same as Invariant 3. **Flag: load-bearing per vote, Alloy-deferred with no Alloy model yet.** GAP. |
| Invariant 5 — Hold carries prior_state; reinstate returns to it | YES | covered | `Inv5_ReinstateRoundTrip == justReinstated => (state = heldFrom)`; ghost `heldFrom` records hold-from state; `justReinstated` flags post-reinstate step. Also `Inv5_PriorValid == (state = "OnHold") => (prior \in Holdable)`. Both are explicit state predicates. |
| Invariant 6 — Cancel is pre-dispensing; discontinue is post-dispensing | No | by-construction | `Cancel` guards `state \in {"Ordered","Verified"}`; `Discontinue` guards `state \in {"Dispensed","Administered"}` — structurally impossible to cross the boundary. Acceptable: not load-bearing per vote. |
| Invariant 7 — Terminal states absorbing | No | by-construction | No action operates on `state \in {"Completed","Cancelled","Discontinued","Amended"}`; all forward actions guard non-terminal source states. Acceptable. |
| Invariant 8 — Amended state is inactive | No | out-of-scope (no `amend` action in model) | Acceptable: not load-bearing per vote. |
| Invariant 9 — On Hold accepts only reinstate | YES | by-construction | Every forward action (Verify, Dispense, Administer, Complete, Cancel, Discontinue) guards on a non-OnHold source state; from OnHold only `Reinstate` is enabled. Per model note explicitly. **Flag: load-bearing per vote, held by-construction rather than explicit check.** |
| Invariant 10 — All actor references non-whitespace | No | out-of-scope (field validation not modeled; per model header) | Acceptable. |
| Invariant 11 — Reason fields non-whitespace | No | out-of-scope (field validation not modeled) | Acceptable. |
| Invariant 12 — Transition metadata write-once (with hold/reinstate exceptions) | No | out-of-scope (field model not present) | Acceptable: not load-bearing per vote. |
| Invariant 13 — `ordered_at` set once | No | out-of-scope (no timestamp model) | Acceptable. |
| Invariant 14 — Order store durability | No | out-of-scope (no deletion surface modeled) | Acceptable. |

## Step 3 — bound saturation

Per Lineage: 31 reachable states. The lifecycle is a single linear path (Ordered → ... → terminal) with a hold/reinstate branch from each of four holdable states; 31 states covers all paths. Appears adequate for the hold/reinstate claim.

## Outcome

- GAP rows:
  - **Invariant 3 (amendment pre-dispensing only) — GAP.** Load-bearing per vote; deferred to Alloy; no Alloy model exists. Until an Alloy model is authored and verified, this invariant has no formal coverage. Route as finding.
  - **Invariant 4 (amendment chains linear) — GAP.** Same. Route as finding.
- by-construction flags on load-bearing invariants: **Invariant 9 (On Hold accepts only reinstate) — load-bearing per vote, held by-construction.** Flag for promotion to an explicit state predicate (e.g., `Inv9_OnHoldOnlyReinstate == state = "OnHold" => [all non-Reinstate actions disabled]`) or at minimum a reachability check.
- Result: **two GAPs (Inv3, Inv4 — Alloy-deferred with no Alloy model), one by-construction flag on load-bearing Inv9.** Route Inv3 and Inv4 as findings pending Alloy model authoring.
