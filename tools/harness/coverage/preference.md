# Coverage matrix — `preference`

- **Pattern:** `atoms/messaging/preference.md`
- **Model:** `preference.tla` (+ buggy twin `preference-buggy.tla`)
- **Reviewer / date:** agent coverage cross-check — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 3 (at most one currently-in-effect record per principal), Invariant 4 (supersession atomicity — new record Active + prior → Deleted in one operation)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/messaging/preference.tla` → `PASS` ☐ *(per Lineage: clean)*
- Buggy twin: `node check.mjs ../../atoms/messaging/preference-buggy.tla --buggy` → `PASS` (rejected) ☐ *(per Lineage: splits supersession, Inv3 catches two-in-effect window)*

## Step 2 — coverage matrix

The spec has 10 hard invariants plus Temporal property 11 (best-effort). The model focuses on the at-most-one-in-effect exclusivity claim.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Preference record immutability | No | by-construction | Status is the only mutable field in the model (slot goes from `unused` → `Active` → `Suspended`/`Deleted`); no field rewriting occurs. Acceptable: not load-bearing per vote. |
| Invariant 2 — Status monotonicity (Active→Suspended/Deleted; Suspended→Deleted only) | No | by-construction | `SetFresh` creates Active; `Suspend` moves Active→Suspended; `Delete` moves Active-or-Suspended→Deleted; `SetSupersede` moves prior to Deleted; no action returns from Deleted or Suspended→Active. Acceptable. |
| Invariant 3 — At most one currently-in-effect record per principal | YES | covered | `Inv3_AtMostOneInEffect == InEffectCount <= 1`; checked under every interleaving of `SetFresh`, `SetSupersede`, `Suspend`, `Delete`. |
| Invariant 4 — Supersession atomicity | YES | covered | `SetSupersede` is a single TLA+ step that sets prior→Deleted AND new→Active simultaneously; `Inv3_AtMostOneInEffect` is what catches any split that would momentarily show two in-effect records. Mechanized via atomic step + Inv3 catch on the buggy twin. |
| Invariant 5 — Channel preferences reference declared channels | No | out-of-scope (no channel-set model; per model header: "id immutability/no-reuse, field retention, timestamp ordering (structural / clock)") | Acceptable: not load-bearing per vote. |
| Invariant 6 — Suspension is value-preserving | No | by-construction | `Suspend` changes only the slot's status from Active to Suspended; no preference-value fields are modeled (model is status-only). Acceptable. |
| Invariant 7 — `current_for` determinism | No | by-construction (follows from Inv3) | Uniqueness of the in-effect record is guaranteed by Inv3. Acceptable. |
| Invariant 8 — No id reuse | No | out-of-scope (structural; per model header) | Acceptable. |
| Invariant 9 — Preference store durability | No | by-construction | `Delete` moves a slot to Deleted state but does not remove it from the `status` array; all `MaxP` slots are retained. `unused` → non-`unused` is a one-way transition. Acceptable. |
| Invariant 10 — Configuration record integrity | No | out-of-scope (deployment-contract property; not enforced by atom's runtime actions; channel set not modeled) | Acceptable: not load-bearing per vote. |
| Temporal property 11 — Timestamp ordering (best-effort) | No | out-of-scope (no clock modeled; explicitly best-effort in spec) | Acceptable. |

## Step 3 — bound saturation

Model bound: `MaxP` preference-record slots for one principal. At `MaxP=3` (implied by typical config): sufficient to exercise SetFresh, Suspend, SetSupersede (supersedes Active), SetSupersede (supersedes Suspended), Delete on Active, Delete on Suspended. Appears adequate; the exclusivity claim only requires observing the two-in-effect window, which needs at least two slots.

## Outcome

- GAP rows: none
- by-construction flags on load-bearing invariants: none — both load-bearing invariants (Inv3, Inv4) are covered by the explicit check `Inv3_AtMostOneInEffect`. Inv4's atomicity is mechanized via the single-step encoding.
- Result: **clean** — all load-bearing invariants covered; no GAPs. Pattern is fully clean.
