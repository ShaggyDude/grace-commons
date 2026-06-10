# Coverage matrix — Chain of Custody (C12)

> Formal-layer **coverage cross-check** (pressure-testing.md §"The coverage cross-check").
> Emitted 2026-06-10 (Refactor 1, C6 batch round's mirror check): C6's Lineage names C12 as
> sharing the binding-bijection model shape, so the C6-2 finding class (atomic idealization
> verified over a compensating design) was checked here. **It is present.** Findings are
> logged through the standard channel (`internal/refactor-1-findings.md` Part C); fixes ride
> C12's own touch-triggered round — nothing was edited in-pattern by this check.

- **Pattern:** `compositions/chain-of-custody.md`
- **Model:** `chain-of-custody.tla` (+ buggy twin `chain-of-custody-buggy.tla`)
- **Reviewer / date:** Claude (Refactor 1 session 2, mirror check) — 2026-06-10
- **Formal-layer vote load-bearing claims:** Invariant 4 — binding bijection / no-dangling-partial atomicity (Provenance write + Audit Trail `record_action`, "committed atomically or compensated")

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/chain-of-custody.tla` → `PASS` ☑ (4 states, all invariants hold)
- Buggy twin: `node check.mjs ../../compositions/chain-of-custody-buggy.tla --buggy` → `PASS` (rejected) ☑ (violation at 2 states)

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 4 — binding bijection, **atomic-commit arm** | **yes** | covered | `CommitEntry`-style single atomic action; `Inv4_BindingBijection` / `Inv4_NoDanglingProv` / `Inv4_NoOrphanAudit` |
| Invariant 4 — binding bijection, **compensated arm** ("or the failure is compensated": the *Cross-store consistency under partial failure* edge case mandates retry + surfacing + `cascade_recovery`, and the uniform rejection-mapping rule makes the orphan *reachable by design* — credential invalidity always manifests as `recording-failure` plus an orphan) | **yes** | **GAP** | The correct model commits all three sub-writes (including the `entry_to_event` binding) as **one atomic action** — an idealization the spec itself says is unrealizable (Provenance writes first, irreversibly; "synchronous rollback is not available"). The buggy twin shows sequential-*without*-compensation is unsafe; **nothing models sequential-with-compensation**, the path the spec mandates. Same class as C6's closed finding C6-2; additionally, the model's third sub-write (`bound`) models the `entry_to_event` map inside the atomicity surface, in tension with its provisional derived-index classification (`internal/composition-state-audit.md` row 35). **Routed as finding MC-C12-1 — blocks unqualified `grounded` until closed; fix rides C12's own round (C6's revised model is the worked template).** |
| Invariant 1 — attributed custody | no | out-of-scope (named reason) | Attribution is Audit Trail Invariant 1's property (substrate model + prose); not an interleaving. |
| Invariant 2 — tamper-evident custody chain | no | out-of-scope (named reason) | Seal coverage is Audit Trail Invariant 3, modulo the unsealed tail; mechanism/records property, not TLC-class. |
| Invariant 3 — retention-governed custody, honest disposal | no | out-of-scope (named reason) | The substrate's cascade-on-purge, modeled in `audit-trail.tla`; inherited by reference. |
| Invariant 5 — records-alone custody proof | no | out-of-scope (named reason) | Query-shape/verification-surface property (`verify_custody` outcome plumbing), discharged in prose + Generation acceptance. |
| Invariant 6 — constituent invariants preserved | no | out-of-scope (named reason) | Each constituent's own bar. |

## Step 3 — bound saturation

- At `Entries = {e1, e2}`: 4 states; the 2026-06-04 Lineage entry records `{e1, e2, e3}` at 8 states with no new behavior → saturated ☑ *(for the atomic model as it stands; the revised compensated model will need its own saturation line, per C6's 4^n precedent).*

## Outcome

- GAP rows: **one** — the compensated arm (finding **MC-C12-1**, logged in `internal/refactor-1-findings.md` Part C). Per the cross-check rule a GAP blocks unqualified `grounded` until closed; the fix (Invariant 4 restated as safety + liveness; model extended with the compensation path; the binding map's derived-index reclassification folded per the audit matrix) rides C12's own touch-triggered round.
- by-construction flags on load-bearing invariants: none.
- Result: **findings routed** — *"Coverage cross-check 2026-06-10 — GAP: Invariant 4's compensated arm unmodeled (atomic idealization over a compensating design); routed as MC-C12-1."*
