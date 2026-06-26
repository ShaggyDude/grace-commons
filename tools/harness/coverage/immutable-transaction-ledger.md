# Coverage matrix — Immutable Transaction Ledger with Selective Disclosure (C6)

> Formal-layer **coverage cross-check** (pressure-testing.md §"The coverage cross-check").
> First emitted 2026-06-10 (Refactor 1, C6 batch round) — the round that closed finding
> the compensated-arm GAP row: the prior model verified the atomic idealization of Invariant 1 and
> left the "or the failure is compensated" arm uncovered.

- **Pattern:** `compositions/immutable-transaction-ledger.md`
- **Model:** `immutable-transaction-ledger.tla` (+ buggy twin `immutable-transaction-ledger-buggy.tla`)
- **Reviewer / date:** Claude (Refactor 1 session 2) — 2026-06-10
- **Formal-layer vote load-bearing claims:** Invariant 1 — disclosure-accountability binding bijection (restated 2026-06-10 as safety + liveness; both the atomic-commit arm and the compensated partial-failure arm are load-bearing)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/immutable-transaction-ledger.tla` → `PASS` ☑ (16 states, all invariants hold)
- Buggy twin: `node check.mjs ../../compositions/immutable-transaction-ledger-buggy.tla --buggy` → `PASS` (rejected) ☑ (violation at 2 states — the silent unsurfaced orphan after `WriteSD` alone)

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — binding bijection, **safety arm, atomic-commit path** (both truth-bearing writes land together) | **yes** | **covered** | `CommitClean(d)`; asserted by `Inv1_SafetyBijection` |
| Invariant 1 — binding bijection, **safety arm, compensated path** ("or the failure is compensated": orphan reachable → surfaced → retried → bijection restored; no *unsurfaced* orphan at any reachable state) | **yes** | **covered** *(was GAP — closed 2026-06-10, the compensated-arm finding)* | `FailPartial(d)` makes the orphan a real reachable inter-action state; `RetryAudit(d)` is the compensation; asserted by `Inv1_SafetyBijection` + `Inv1_NoUnsurfacedOrphan` across every interleaving of the three actions |
| Invariant 1 — safety arm, **inverse orphan** (no `ledger.disclosed` event without its disclosure record) | yes | covered | `Inv1_NoOrphanAudit` |
| Invariant 1 — safety arm, **recovery distinguishability** (recovered bindings carry `cascade_recovery`; clean bindings never do) | yes | covered | `auditState ∈ {clean, recovered}` + `Inv1_RecoveryDistinguishable` |
| Invariant 1 — **liveness arm** (every orphan is eventually bound: *Orphan(d) ↝ Bound(d)* under weak fairness on the retry) | yes | out-of-scope (named reason) — *enabledness half covered* | The harness's WASM checker verifies safety invariants, not temporal properties. The model carries the obligation's structural half: `RetryAudit(d)`'s enabling condition is exactly the orphan configuration, so no orphan state is a dead end; the eventuality itself is the implementation's mandated retry loop (a weak-fairness assumption stated in the English, which is canonical for this arm). The buggy twin deletes the compensation action entirely and is rejected on safety — sequential-without-compensation is mechanically unsafe. |
| Invariant 1 — safety arm, **crash-orphan surfacing** (a process crash between the two truth-bearing writes produces an orphan with no returning outcome; surfaced by the mandated reconciliation scan within the scan bound) | yes (post-vote sharpening; batch-round Pass 3 finding Final Critique 6-P3-2) | out-of-scope (named reason) | Within-action process death is not an action-vs-action interleaving (the model's states are action outcomes). The English carries the obligation: the reconciliation scan (restart + fixed cadence) runs the same records-alone orphan enumeration; its operation is the externally-clearable orphan-surfacing check. Named in the model's NOT MODELED block. |
| Invariant 1 — **no double-append under retry** (check-then-retry: a lost-acknowledgment retry must not produce two `ledger.disclosed` events for one disclosure; batch-round Pass 3 finding Final Critique 6-P3-1) | yes | covered (structurally) | `RetryAudit(d)`'s enabling condition `auditState[d] = "absent"` is the check-then-retry rule made structural — the retrier observes the records (the rebuild read) and the already-landed state disables the append; `Inv1_SafetyBijection`'s "exactly one" holds across every interleaving. The two-retriers race is closed in English by per-`disclosure_id` compensation serialization. |
| Invariant 1 — **retention-horizon arm** (bijection modulo honest destruction: a purged `ledger.disclosed` event leaves its disclosure record lawfully, distinguishably unbound — `binding-purged`; added 2026-06-10 by the batch round's Pass 2 finding Final Critique 6-P2-2) | no (post-vote addition; distinguishability, not an interleaving) | out-of-scope (named reason) | Purge is the substrate's lifecycle, modeled in `audit-trail.tla` (cascade-on-purge); the arm's distinguishability rests on Audit Trail Invariant 8's surviving `Purged` retention record — a records-shape property discharged in prose + Generation acceptance check 1 + `verify_ledger` step 2(b), inherited by reference per the Contract's recursive-conformance rule. |
| (Application state) `disclosure_to_event` derived index | no | out-of-scope (named reason) | Outside the atomicity surface per `execution-contract.md` §Composition state obligation 2 — the model models the two truth-bearing stores and omits the index; a lost entry is a rebuild trigger, not data loss. *(Was the model's third sub-write before 2026-06-10; removed by the derived-index reclassification.)* |
| Invariant 2 — verifiable partial disclosure | no | out-of-scope (named reason) | Behavioral capability obligation on the configured mechanism, conditional on `tamper_evidence_supports_partial_disclosure`; discharged in prose + Generation acceptance + the deployment's security review. Not an interleaving property. |
| Invariant 3 — immutable, attributed, retention-governed ledger | no | out-of-scope (named reason) | The Audit Trail substrate's property, modeled in `audit-trail.tla`; inherited by reference, not re-proven (Contract §Substrate composition invocation, recursive conformance). |
| Invariant 4 — no-disclosure-unrecorded, structurally closed | no | out-of-scope (named reason) | Single-write-path argument (one disclosure surface that always writes both records); a wiring-shape property, not an interleaving. |
| Invariant 5 — constituent invariants preserved | no | out-of-scope (named reason) | Each constituent's own bar (Selective Disclosure English-only; Audit Trail in `audit-trail.tla`). |

## Step 3 — bound saturation

- At `Disclosures = {d1, d2}`: 16 states, all invariants hold.
- At `Disclosures = {d1, d2, d3}`: 64 states, all invariants hold → **saturated** ☑ — the property is per-disclosure local (each disclosure independently traverses the same four-configuration lattice: uncreated → {clean commit | surfaced orphan → recovered}); the count grows as 4^n with no new per-disclosure behavior.

## Outcome

- GAP rows: **none** — the compensated arm's GAP (the compensated-arm finding) is closed by this revision.
- by-construction flags on load-bearing invariants: none.
- Result: **clean** — *"Coverage cross-check 2026-06-10 — clean (both arms of Invariant 1's safety covered, incl. the compensated path; liveness arm's enabledness half carried by the model, eventuality canonical in English; saturation confirmed at 4^n)."*
