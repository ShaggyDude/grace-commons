# Coverage matrix — Forensic Recovery (C3)

> Formal-layer **coverage cross-check** (pressure-testing.md §"The coverage cross-check").
> Emitted 2026-06-10 (Refactor 1, C6 batch round's mirror check): C6's Lineage names C3 as
> sharing the binding-bijection model shape, so the C6-2 finding class (atomic idealization
> verified over a compensating design) was checked here. **It is present.** This matrix is
> finding **MC-C3-1**'s record of record (the Refactor 1 staging handoff that first logged it
> has since been dispersed and deleted); the fix rides C3's own touch-triggered round —
> nothing was edited in-pattern by this check.
>
> **RESOLVED 2026-06-11.** The touch-triggered round landed: the model was revised to
> sequential-with-compensation covering both arms of Invariant 4 (template:
> `immutable-transaction-ledger.tla`, the C6-2 closure), Invariant 4 was restated in the
> English as safety + liveness, and `record_to_events` was reclassified as a derived index
> outside the atomicity surface. Invariant 2's compensated-path coverage, which rode the GAP,
> closed with it. The pattern returned to `grounded`. Rows below updated in place with the
> arc preserved; see the pattern's Lineage §Formal model (2026-06-11 entry).

- **Pattern:** `compositions/forensic-recovery.md`
- **Model:** `forensic-recovery.tla` (+ buggy twin `forensic-recovery-buggy.tla`)
- **Reviewer / date:** Claude (Refactor 1 session 2, mirror check) — 2026-06-10
- **Formal-layer vote load-bearing claims:** Invariant 4 — binding bijection / no-dangling-partial atomicity (Soft Delete write + Audit Trail `record_action`, "committed atomically or compensated"); structurally carries Invariant 2 (purge accountability) via `Inv_NoDanglingSoft`

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/forensic-recovery.tla` → `PASS` ☑ (revised model 2026-06-11: 16 states, all invariants hold; was 4 states in the atomic-only form)
- Buggy twin: `node check.mjs ../../compositions/forensic-recovery-buggy.tla --buggy` → `PASS` (rejected) ☑ (violation at 2 states — the silent unsurfaced orphan, rejected on `Inv4_SafetyBijection`)

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 4 — binding bijection, **atomic-commit arm** | **yes** | covered | Single atomic commit action; `Inv4_BindingBijection` / `Inv_NoDanglingSoft` / `Inv_NoOrphanAudit` |
| Invariant 4 — binding bijection, **compensated arm** ("or the failure is compensated": the *Cross-store consistency under partial failure* edge case mandates retry + surfacing + `cascade_recovery`, and the uniform rejection-mapping rule makes the orphan *reachable by design* — credential invalidity always manifests as `recording-failure` plus an orphan) | **yes** | **GAP → resolved (2026-06-11): covered** | *Was:* the correct model committed all three sub-writes as one atomic action — the spec-mandated sequential-with-compensation path unmodeled (finding MC-C3-1, same class as C6's closed C6-2), with the stakes on C3's headline invariant (a purge without its audit record), and the third sub-write placed `record_to_events` inside the atomicity surface against its derived-index classification. *Now:* the revised model is sequential-with-compensation per the C6 template — `FailPartial` makes the orphan reachable and surfaced (for a purge: Invariant 2's worst case, visible the whole time), `RetryAudit` compensates (marked `recovered`/`cascade_recovery`, enabled in exactly the orphan configuration), and the derived index is omitted per execution-contract §Composition state obligation 2. Covered by `Inv4_SafetyBijection` / `Inv4_NoUnsurfacedOrphan` / `Inv4_RecoveryDistinguishable`; liveness's enabledness half is structural (no orphan dead end). |
| Invariant 1 — lifecycle attribution coverage | no | out-of-scope (named reason) | Attribution is Audit Trail Invariant 1's property; not an interleaving. |
| Invariant 2 — purge accountability | yes (structural form) | covered (2026-06-11 — both arms) | Rode MC-C3-1 and closed with it: the purge-orphan window (a destroyed record awaiting its compensating audit event) is now a modeled, *surfaced* configuration — `Inv4_NoUnsurfacedOrphan` is Invariant 2's compensated-path form (a Purged record's missing audit event can exist only as a visible finding under compensation), and the coherent-or-recovered end state restores the accountability record. |
| Invariant 3 — forensic completeness / full-history recoverability | no | out-of-scope (named reason) | Replay/query-shape property over Event Log total order (Event Log Invariants 2, 3); discharged in prose + Generation acceptance. |
| Invariant 5 — constituent invariants preserved | no | out-of-scope (named reason) | Each constituent's own bar. |

## Step 3 — bound saturation

- *Atomic-only model (historical):* `Transitions = {t1, t2}` → 4 states; per-transition local, insensitive to count.
- **Revised compensated model (2026-06-11):** `Transitions = {t1, t2}` → 16 states; `{t1, t2, t3}` → 64 — the 4ⁿ per-transition-independence form, matching the C6 precedent; all invariants hold at both bounds → saturated ☑

## Outcome

- GAP rows: **zero** (was one — the compensated arm, finding **MC-C3-1**, resolved 2026-06-11: Invariant 4 restated as safety + liveness; model revised to sequential-with-compensation per the C6 template; `record_to_events` derived-index reclassification folded; Invariant 2's compensated-path coverage closed with it). The pattern returned to `grounded`.
- by-construction flags on load-bearing invariants: none.
- Result: **clean** — *"Coverage cross-check 2026-06-10 — GAP: Invariant 4's compensated arm unmodeled; routed as MC-C3-1. Resolved 2026-06-11 — both arms covered; harness green (16 states; twin rejected at 2); pattern `grounded`."*
