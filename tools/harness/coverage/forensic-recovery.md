# Coverage matrix — Forensic Recovery (C3)

> Formal-layer **coverage cross-check** (pressure-testing.md §"The coverage cross-check").
> Emitted 2026-06-10 (Refactor 1, C6 batch round's mirror check): C6's Lineage names C3 as
> sharing the binding-bijection model shape, so the C6-2 finding class (atomic idealization
> verified over a compensating design) was checked here. **It is present.** Findings are
> logged through the standard channel (`internal/refactor-1-findings.md` Part C); fixes ride
> C3's own touch-triggered round — nothing was edited in-pattern by this check.

- **Pattern:** `compositions/forensic-recovery.md`
- **Model:** `forensic-recovery.tla` (+ buggy twin `forensic-recovery-buggy.tla`)
- **Reviewer / date:** Claude (Refactor 1 session 2, mirror check) — 2026-06-10
- **Formal-layer vote load-bearing claims:** Invariant 4 — binding bijection / no-dangling-partial atomicity (Soft Delete write + Audit Trail `record_action`, "committed atomically or compensated"); structurally carries Invariant 2 (purge accountability) via `Inv_NoDanglingSoft`

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/forensic-recovery.tla` → `PASS` ☑ (4 states, all invariants hold)
- Buggy twin: `node check.mjs ../../compositions/forensic-recovery-buggy.tla --buggy` → `PASS` (rejected) ☑ (violation at 2 states)

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 4 — binding bijection, **atomic-commit arm** | **yes** | covered | Single atomic commit action; `Inv4_BindingBijection` / `Inv_NoDanglingSoft` / `Inv_NoOrphanAudit` |
| Invariant 4 — binding bijection, **compensated arm** ("or the failure is compensated": the *Cross-store consistency under partial failure* edge case mandates retry + surfacing + `cascade_recovery`, and the uniform rejection-mapping rule makes the orphan *reachable by design* — credential invalidity always manifests as `recording-failure` plus an orphan) | **yes** | **GAP** | The correct model commits all three sub-writes (including the `record_to_events` binding) as **one atomic action** — an idealization the spec itself qualifies ("synchronous rollback is not universally available"; Purged is terminal). The buggy twin shows sequential-*without*-compensation is unsafe; **nothing models sequential-with-compensation**, the path the spec mandates. The stakes are C3's headline invariant: the most consequential partial failure is a *purge without its audit record* (Invariant 2), and the compensated path that repairs it is exactly the unmodeled arm. Same class as C6's closed finding C6-2; the model's third sub-write also places the `record_to_events` map inside the atomicity surface, in tension with its provisional derived-index classification (`internal/composition-state-audit.md` row 36). **Routed as finding MC-C3-1 — blocks unqualified `grounded` until closed; fix rides C3's own round (C6's revised model is the worked template).** |
| Invariant 1 — lifecycle attribution coverage | no | out-of-scope (named reason) | Attribution is Audit Trail Invariant 1's property; not an interleaving. |
| Invariant 2 — purge accountability | yes (structural form) | covered (via `Inv_NoDanglingSoft`) — *but inherits the GAP* | The model's `Inv_NoDanglingSoft` is Invariant 2's structural form and holds in the atomic model; on the prescribed compensating design, the purge-orphan window (a destroyed record awaiting its compensating audit event) is unmodeled — covered only on the idealized arm. Closure rides MC-C3-1. |
| Invariant 3 — forensic completeness / full-history recoverability | no | out-of-scope (named reason) | Replay/query-shape property over Event Log total order (Event Log Invariants 2, 3); discharged in prose + Generation acceptance. |
| Invariant 5 — constituent invariants preserved | no | out-of-scope (named reason) | Each constituent's own bar. |

## Step 3 — bound saturation

- At `Transitions = {t1, t2}`: 4 states; the property is per-transition local, insensitive to count (per the 2026-06-04 Lineage entry) → saturated ☑ *(for the atomic model as it stands; the revised compensated model will need its own saturation line, per C6's 4^n precedent).*

## Outcome

- GAP rows: **one** — the compensated arm (finding **MC-C3-1**, logged in `internal/refactor-1-findings.md` Part C), with Invariant 2's compensated-path coverage riding it. Per the cross-check rule a GAP blocks unqualified `grounded` until closed; the fix (Invariant 4 restated as safety + liveness; model extended with the compensation path; `record_to_events` derived-index reclassification folded per the audit matrix) rides C3's own touch-triggered round.
- by-construction flags on load-bearing invariants: none.
- Result: **findings routed** — *"Coverage cross-check 2026-06-10 — GAP: Invariant 4's compensated arm unmodeled (atomic idealization over a compensating design); routed as MC-C3-1."*
