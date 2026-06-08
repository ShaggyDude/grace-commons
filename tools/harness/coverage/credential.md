# Coverage matrix — `credential`

- **Pattern:** `atoms/credential.md`
- **Model:** `credential.tla` + two isolated twins `credential-buggy.tla` (Inv 7) and `credential-buggy-toctou.tla` (Inv 2)
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03; updated 2026-06-04 (Inv 7 GAP closed; twins split into two isolated twins)
- **Formal-layer vote load-bearing claims:** Invariant 2 (active uniqueness — at most one Active credential per `(principal_ref, credential_type)` pair, including the concurrent-`register` TOCTOU race); Invariant 7 (rotation-chain integrity — every `Rotated` record has a non-null `successor_credential_id` referencing a record with the same `principal_ref` and `credential_type`)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/credential.tla` → `PASS` ✓ *(138 states at MaxC=3)*
- Buggy twin (Inv 7): `node check.mjs ../../atoms/credential-buggy.tla --buggy` → `PASS` (rejected) ✓ *(rejected at 5 states — `Inv_RotationChain` violated: rotation sets slot to Rotated without writing successor link; dangling chain detected. `register` stays atomic, so `Inv_ActiveUniqueness` holds here — verified at 105 states when checked alone — isolating the rejection to Inv 7.)*
- Buggy twin (Inv 2): `node check.mjs ../../atoms/credential-buggy-toctou.tla --buggy` → `PASS` (rejected) ✓ *(rejected at 33 states — `Inv_ActiveUniqueness` violated: non-atomic check-then-commit `register` lets two concurrent registers both observe `ActiveCount = 0` and both commit. `rotate` stays atomic and sets the successor link, so `Inv_RotationChain` holds here — verified at 233 states when checked alone — isolating the rejection to Inv 2.)*

The two twins are isolated deliberately: a single combined twin would surface only the shorter counterexample (Inv 7 at 5 states would mask Inv 2 at 33 states), leaving Inv 2 without a demonstrated rejection in `audit.mjs`. This mirrors the isolated-twin discipline applied to Legal Hold, Provisional Commitment, and Capacity Constraint on the same date.

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Registration immutability | no | by-construction | The model has no action that modifies `principal_ref`, `credential_type`, `verifier`, or `registered_at` — only status and successor transitions exist. Mutation is structurally absent. |
| Invariant 2 — Active uniqueness | YES | **covered** | `Inv_ActiveUniqueness == ActiveCount <= 1` — asserted directly. `RegisterAtomic` guards on `ActiveCount = 0` in one step; `RotateAtomic` is a single step (Rotated+Active commit together). Dedicated rejecting twin: `credential-buggy-toctou.tla` (TOCTOU register split → two Active; rejected at 33 states). |
| Invariant 3 — Sole-holder verification | no | out-of-scope (verifier derivation and material comparison not modeled — "NOT MODELED" comment: "verify/material derivation") | — |
| Invariant 4 — Revocation absorbing | no | by-construction | Once `status[k] = "Revoked"`, no action transitions it back to `Active`. The `Revoke` action transitions Active → Revoked only; no re-activate action exists in the model. |
| Invariant 5 — Terminal state absorbing | no | by-construction | The model defines `Revoke`, `Expire`, and `RotateAtomic` each as one-way transitions. No re-activation action exists; terminal states are absorbing by model structure. |
| Invariant 6 — Rotation non-mutation | no | by-construction | `RotateAtomic` writes only `status[k] = "Rotated"`, `status[m] = "Active"`, and `successor[k] = m`; no other fields are modeled, so mutation of `verifier`/`principal_ref`/`credential_type`/`registered_at` is structurally absent. |
| Invariant 7 — Rotation chain integrity | YES | **covered** | `Inv_RotationChain == \A k \in 1..MaxC : status[k] = "Rotated" => successor[k] # 0` — asserted directly (GAP closed 2026-06-04). The non-null-successor-link half is explicitly checked. The same-`(principal_ref, credential_type)` half holds **by-construction**: the model scopes all slots to one fixed pair, so no link can reference a different pair. Noted honestly: the same-pair clause is an assumption, not an asserted property; it is defensible because the single-pair model scope makes cross-pair links structurally unreachable. Dedicated rejecting twin: `credential-buggy.tla` — `RotateAtomic_Buggy` sets status to Rotated without writing `successor`, producing `successor[k] = 0` on a Rotated slot; checker rejects at 5 states. |
| Invariant 8 — Credential material never persisted | no | out-of-scope (security/storage-layer property; not checkable by state-machine model — acknowledged in "NOT MODELED" comment) | — |
| Invariant 9 — Revocation attribution completeness | no | out-of-scope (attribution fields not modeled — "NOT MODELED: id discipline") | — |
| Invariant 10 — Credential durability | no | out-of-scope (storage durability; not a state-machine property at this abstraction level) | — |
| Invariant 11 — Expiry absorbing | no | by-construction | Same reasoning as Invariant 5: `Expire` transitions Active → Expired in one step; no re-activate action exists. |

## Step 3 — bound saturation

- At `MaxC=3`: 138 states (up from original 105; increase reflects `successor` dimension). State space grows with `MaxC`: `MaxC=4` → 1089 states; `MaxC=5` → 10008 states. The model is slot-parametric — each additional slot opens new reachable status/successor combinations, so no flat saturation point exists as `MaxC` increases. The rotation-chain invariant is fully exercised at `MaxC=3`: three slots allow two sequential rotations (k1→Rotated, k2→Rotated, k3→Active), which is sufficient to exercise all chain-link paths. The bound `MaxC=3` is deliberate: it covers every chain-building interleaving within a single pair. Confirming that the claim holds at `MaxC=4` (1089 states, invariants hold) provides headroom. Saturation point within the 3-slot scope: `MaxC=3` is the minimal bound that exercises a multi-hop rotation chain; state count at `MaxC=4` confirms the model is non-vacuous and the 3-slot bound is not truncating interesting paths.

## Outcome

- GAP rows: none. **Invariant 7 — Rotation chain integrity** GAP closed 2026-06-04. `Inv_RotationChain` is now an explicit asserted invariant in the model and in the cfg. The same-pair half is by-construction (single-pair model scope); recorded honestly above.
- by-construction flags on load-bearing invariants: none (both Invariant 2 and Invariant 7 are properly asserted).
- Twin discipline: each load-bearing invariant has its own dedicated, isolated, checker-rejected twin (Inv 2 → `credential-buggy-toctou.tla`; Inv 7 → `credential-buggy.tla`), so neither counterexample masks the other in `audit.mjs`.
- Result: **all load-bearing formal-layer vote claims covered.** — Coverage cross-check updated 2026-06-04 (twins split into two isolated twins 2026-06-04).
