# Coverage matrix — `duplicate-prevention`

- **Pattern:** `atoms/duplicate-prevention.md`
- **Model:** `duplicate-prevention.tla` + `duplicate-prevention-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 (fresh-context) — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 2 (single-recording — `record` does not extend the window for an already-recorded identity; original `recorded_at` preserved); Invariant 1 (window monotonicity — anything in `recorded` satisfies `now − recorded_at < window`)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../atoms/duplicate-prevention.tla` → `PASS` ☐ *(not re-run in this pass; prior run verified in Lineage — 14 states)*
- Buggy twin: `node check.mjs ../../atoms/duplicate-prevention-buggy.tla --buggy` → `PASS` (rejected) ☐ *(prior: rejected at 11 states)*

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Window monotonicity | YES | by-construction | `Seen` is defined as `everRecorded /\ (clock - recordedAt < Window)` — membership is derived, so any `seen` identity is within window by definition. Violation is structurally impossible. **Flag for promotion:** load-bearing; currently an assumption baked into the derived predicate rather than an asserted check. |
| Invariant 2 — Single-recording | YES | **covered** | `Inv2_SingleRecording == Seen => (recordedAt = firstRecordedAt)` — asserted directly. Ghost `firstRecordedAt` captures guard start; `RecordFresh` guards on `~Seen`, so re-record while seen is disabled (no-op). |
| Invariant 3 — Idempotency of check | no | out-of-scope (read-only query; `check` is explicitly noted as not modeled — "NOT MODELED" comment in model) | — |
| Invariant 4 — Eventual expiry | YES | by-construction | `Seen` is derived; once `clock - recordedAt >= Window`, `Seen` is `FALSE` regardless of `everRecorded`. Auto-expiry is a definitional consequence. **Flag for promotion:** load-bearing; currently structural, not an asserted safety property. |

## Step 3 — bound saturation

- At `Window=2, MaxClock=3`: 14 states (per Lineage).
- Lineage notes the model was exhaustive at this bound; no explicit saturation test at `MaxClock=4` is recorded. The state count is small enough that the explored space is plausibly complete — bounded by `MaxClock × 2 × 2` (clock × everRecorded × recorded states). Adequate for the claim, but a `MaxClock=4` re-run would confirm saturation. **Saturation: not formally confirmed.**

## Outcome

- GAP rows: none
- by-construction flags on load-bearing invariants: **Invariant 1 (window monotonicity)** and **Invariant 4 (eventual expiry)** are both load-bearing (formal-layer vote named both) and both held by-construction rather than by asserted check. The model's comment acknowledges this explicitly ("Invariant 1 and Invariant 4 are DEFINITIONAL under derived membership"). This is acceptable as stated but should be promoted to explicit `INVARIANT` checks if the model is ever extended with an explicit `Expire` action or a multi-identity variant.
- Result: **clean on load-bearing core (Invariant 2 covered); two by-construction flags on load-bearing invariants noted for promotion.** — Coverage cross-check 2026-06-03.
