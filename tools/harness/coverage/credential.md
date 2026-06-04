# Coverage matrix — `credential`

- **Pattern:** `atoms/compliance/credential.md`
- **Model:** `credential.tla` + `credential-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 2 (active uniqueness — at most one Active credential per `(principal_ref, credential_type)` pair, including the concurrent-`register` TOCTOU race); Invariant 7 (rotation-chain integrity — every `Rotated` record has a non-null `successor_credential_id` referencing a record with the same `principal_ref` and `credential_type`)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/compliance/credential.tla` → `PASS` ☐ *(prior: 105 states)*
- Buggy twin: `node check.mjs ../../atoms/compliance/credential-buggy.tla --buggy` → `PASS` (rejected) ☐ *(prior: rejected at 33 states — two concurrent registers both observe `ActiveCount = 0` and both commit)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Registration immutability | no | by-construction | The model has no action that modifies `principal_ref`, `credential_type`, `verifier`, or `registered_at` — only status transitions exist. Mutation is structurally absent. |
| Invariant 2 — Active uniqueness | YES | **covered** | `Inv_ActiveUniqueness == ActiveCount <= 1` — asserted directly. `RegisterAtomic` guards on `ActiveCount = 0` in one step; `RotateAtomic` is a single step (Rotated+Active commit together). |
| Invariant 3 — Sole-holder verification | no | out-of-scope (verifier derivation and material comparison not modeled — "NOT MODELED" comment: "verify/material derivation") | — |
| Invariant 4 — Revocation absorbing | no | by-construction | Once `status[k] = "Revoked"`, no action transitions it back to `Active`. The `Revoke` action transitions Active → Revoked only; no re-activate action exists in the model. |
| Invariant 5 — Terminal state absorbing | no | by-construction | The model defines `Revoke`, `Expire`, and `RotateAtomic` each as one-way transitions. No re-activation action exists; terminal states are absorbing by model structure. |
| Invariant 6 — Rotation non-mutation | no | by-construction | `RotateAtomic` writes `status[k] = "Rotated"` on the prior slot and `status[m] = "Active"` on the new slot; no other fields are modeled, so mutation of `verifier`/`principal_ref`/`credential_type`/`registered_at` is structurally absent. |
| Invariant 7 — Rotation chain integrity | YES | **GAP** | The model tracks credential statuses (Active/Rotated/Revoked/Expired) but does not model `successor_credential_id` links or assert chain reconstructability. Chain integrity — every Rotated record links to a successor with the same `(principal_ref, credential_type)` — is the second formal-layer vote claim and is entirely absent from the model. No `Inv_RotationChain` or analogous check exists. |
| Invariant 8 — Credential material never persisted | no | out-of-scope (security/storage-layer property; not checkable by state-machine model — acknowledged in "NOT MODELED" comment) | — |
| Invariant 9 — Revocation attribution completeness | no | out-of-scope (attribution fields not modeled — "NOT MODELED: id discipline") | — |
| Invariant 10 — Credential durability | no | out-of-scope (storage durability; not a state-machine property at this abstraction level) | — |
| Invariant 11 — Expiry absorbing | no | by-construction | Same reasoning as Invariant 5: `Expire` transitions Active → Expired in one step; no re-activate action exists. |

## Step 3 — bound saturation

- At `MaxC=3`: 105 states (per Lineage). State space is bounded by status combinations across 3 slots × 5 states = 5^3 = 125 total, 105 reachable. Adequate for the active-uniqueness claim. The chain-integrity claim (Invariant 7) is not modeled so saturation on that dimension is moot until the GAP is closed.

## Outcome

- GAP rows: **Invariant 7 — Rotation chain integrity** is a formal-layer vote claim (load-bearing) and is entirely absent from the model. The model tracks status values but has no `successor_credential_id` variable, no chain-link structure, and no invariant asserting that every Rotated slot has a non-null successor pointing to a slot with the same pair. This is an uncovered load-bearing claim with no defensible reason for exclusion. **Route as a finding; blocks fully clean coverage.**
- by-construction flags on load-bearing invariants: none (Invariant 2 is properly asserted; Invariant 7 is a GAP, not by-construction).
- Result: **findings routed — Invariant 7 GAP.** — Coverage cross-check 2026-06-03.
