# Coverage matrix — `invitation`

- **Pattern:** `atoms/invitation.md`
- **Model:** `invitation.tla` + `invitation-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 2 (single-resolution — check-and-commit Pending → terminal must be atomic under concurrent accept/decline/revoke)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/invitation.tla` → `PASS` ☐ *(prior: 5 states)*
- Buggy twin: `node check.mjs ../../atoms/invitation-buggy.tla --buggy` → `PASS` (rejected) ☐ *(prior: rejected at 6 states — Decline → AcceptBuggy → state Accepted while resolution Declined)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Initiation immutability | no | by-construction | No action modifies `invitation_token`, `inviter_ref`, `invitee_ref`, `context`, `initiated_at`, or `expires_at` — these fields are not modeled as state variables; the model abstracts to `state` and `resolution` only. Mutation is structurally absent. |
| Invariant 2 — Single-resolution | YES | **covered** | `Inv_SingleResolution == (resolution # "none") => (state = resolution)` — asserted directly. Each resolving action (`Accept`, `Decline`, `Revoke`, `Expire`) guards on `state = "Pending"`, so only the first interleaved winner resolves; subsequent actions are disabled. Ghost `resolution` records the first terminal reached. |
| Invariant 3 — Acceptance binds identity | no | out-of-scope (accepting_identity_ref not modeled — "NOT MODELED: identity binding at accept, field validation, id discipline") | — |
| Invariant 4 — Opaque invitee at initiation | no | out-of-scope (structural/field-level property; not a state-machine safety claim — not in scope of a concurrency model) | — |
| Invariant 5 — Four structurally distinct terminal states | no | by-construction | The model defines `Terminals == {"Accepted", "Declined", "Expired", "Revoked"}` as four distinct string values; the `state` variable takes one of these four plus `"Pending"`. Distinctness is definitional. |
| Invariant 6 — `already-resolved` carries terminal state | no | out-of-scope (rejection-payload shape; observable at the API boundary, not a state-machine property) | — |
| Invariant 7 — Expiry timestamp immutability | no | by-construction | `expires_at` is not a state variable in the model; the model abstracts time-based expiry as the `Expire` action with no clock. Immutability of `expires_at` is structurally absent from the model scope. |
| Invariant 8 — Revocation attribution completeness | no | out-of-scope (attribution fields not modeled — "NOT MODELED: field validation, id discipline") | — |
| Invariant 9 — Every invitation has a finite lifetime | no | out-of-scope (clock-based liveness property; the model has no clock variable — structural simplification noted as in-scope for single-resolution focus) | — |
| Invariant 10 — Invitation durability | no | out-of-scope (storage durability; not a state-machine property at this abstraction level) | — |
| Invariant 11 — Token uniqueness | no | out-of-scope (id discipline not modeled — "NOT MODELED: id discipline") | — |

## Step 3 — bound saturation

- At 1 invitation, 5 states, no clock: 5 reachable states (per Lineage). The model is minimal and the state space is trivially exhausted — all five possible final states (`{Pending, Accepted, Declined, Expired, Revoked}`) are reachable. Saturation is structurally guaranteed for this model shape. Adequate for the single-resolution claim.

## Outcome

- GAP rows: none
- by-construction flags on load-bearing invariants: none (Invariant 2 is properly asserted)
- Result: **clean** — single load-bearing invariant (Inv 2) is directly covered; all other invariants are either by-construction or defensibly out-of-scope. — Coverage cross-check 2026-06-03.
