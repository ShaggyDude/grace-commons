# Coverage cross-check — inaugural sweep (2026-06-03)

The first full run of the formal-layer **coverage cross-check** (pressure-testing.md
§"The coverage cross-check") across all 22 vote-yes models. Each per-pattern
matrix in this directory classifies every spec invariant as `covered` /
`by-construction` / `out-of-scope(reason)` / **GAP**. Run by fresh-context
reviewers, gated by Opus.

**This is the cross-check doing its job.** It converted the abstract "property-
fidelity is the soft spot" into a concrete, actionable punch-list: most models
verified their *primary* load-bearing invariant rigorously (with a rejected buggy
twin), but in several cases a *second* invariant named load-bearing by the formal-
layer vote was left only by-construction or genuinely uncovered. None of these are
English-spec defects; all are derived-model coverage debt (conflict-protocol
case 2). The patterns remain `grounded` on the English (full three-pass + Final
Critique + Opus gate); what is pending is *complete formal coverage of every
vote-named invariant*.

## Result

- **14 fully clean** — every vote-named load-bearing invariant covered by a named
  check: Party Identity (after the Inv 6 promotion), Assignment, Message Preference,
  Invitation, Audit Trail, Idempotent Reservation, Defensible Retention, KYC,
  Shared Todo (Inv 2 covered by delegation to `assignment.tla`), Undo History,
  Permissions, Notification, Subscription, Clinical Observation.
- **4 cheap promotions** (load-bearing held by-construction → add an explicit
  check, exactly as Inv 6 was promoted on Party Identity).
- **6 genuine GAPs across 5 patterns** (a vote-named invariant with partial or no
  formal coverage → needs model work).

## Punch-list

### Cheap promotions — RESOLVED 2026-06-04

On inspection these split 2-and-2: two promote cleanly to real checks, two are
genuinely *frame / action-enablement* properties where a contrived state-predicate
would add no checking power, so the honest resolution is an explicitly-recorded
deliberate by-construction assumption (the methodology's other sanctioned outcome).

| Pattern | Invariant | Resolution |
|---|---|---|
| Event Log | Inv 1 — append-only | ✅ **promoted** to `Inv1_AppendOnlyPrefix` (contiguous filled prefix); 119 states, twin still rejected |
| Provisional Commitment | Inv 3 — terminal absorption | ✅ **promoted** to `Inv3_TerminalAbsorbing` (history-flag form, cf. Party Identity); 17 states, twin still rejected |
| Approval Step | Inv 9 — concurrent independence | ✅ **recorded** — a TLA+ frame property (each action's `EXCEPT` touches only its own step); not naturally a state predicate. Deliberate by-construction. |
| Medication Order | Inv 9 — On Hold accepts only reinstate | ✅ **recorded** — an action-enablement property (every forward action guards on a non-OnHold source); not naturally a state predicate. Deliberate by-construction. |

(Duplicate Prevention Inv 1/4 are by-construction under derived membership —
acceptable as documented; promote only if the model gains an explicit Expire
action. Shared Todo Inv 2 is covered by delegation to `assignment.tla` — verified.)

### Genuine GAPs — ALL RESOLVED 2026-06-04 (see Status note)

| Pattern | Invariant | Nature / candidate fix |
|---|---|---|
| Medication Order | **Inv 3 & 4** — amendment pre-dispensing only; linear amendment chains | Vote-named load-bearing, deferred "to Alloy" but **no Alloy model exists**. Fix: a small `medication-order.als` mirroring `clinical-observation.als` (same linear-amendment property). |
| Credential | **Inv 7** — rotation-chain integrity | Model tracks statuses but no `successor` link. Fix: add a successor relation + a "every Rotated has a successor in the same (principal,type)" check. |
| Legal Hold | **Inv 6** — `released_at ≥ placed_at` | Model has no clock. Fix: a two-clock model with `released ⇒ releasedAt ≥ placedAt`, **or** reconsider the vote (best-effort clock → out-of-scope). |
| Provisional Commitment | **Inv 8** — transition timestamps after placement | Confirm-window (the primary claim) is checked; release/expire timestamp ordering is not. Fix: extend, **or** reclassify the timestamp half as best-effort clock. |
| Capacity Constraint | **Inv 5** — non-negativity | Passes trivially because `release` is not modeled (allocated only grows). Fix: add a `release` action so the check is non-vacuous. |
| Capacity Constraint | **Inv 14** — action atomicity | Vote-named, but within-action (not an interleaving). Fix: reconsider the vote (within-action atomicity → out-of-scope, consistent with other atoms). |

## Resolution — 2026-06-04

All six GAPs are closed; every vote-named load-bearing invariant across the five
patterns is now covered by a named check, each with its own dedicated,
checker-rejected buggy twin. Produced by parallel Sonnet subagents, Opus-gated
(diff review + independent harness re-run before any status flip).

| Pattern | Invariant | How closed | Artifact(s) |
|---|---|---|---|
| Medication Order | Inv 3 & 4 | New Alloy structural model mirroring `clinical-observation.als`; pre-dispensing guard + linear-chain checks | `medication-order.als` + `medication-order-buggy.als` (twin flags both Inv 3 and Inv 4) |
| Credential | Inv 7 | Added `successor` link + `Inv_RotationChain` (every Rotated slot has a non-null successor; same-pair clause by single-pair scope) | `credential.tla` (138 states) + **two isolated twins**: `credential-buggy.tla` (Inv 7 dangling rotation; rejected at 5 states) and `credential-buggy-toctou.tla` (Inv 2 register TOCTOU; rejected at 33 states) |
| Legal Hold | Inv 6 | Two-clock extension: global `now` + ghost `placedAt`/`releasedAt`, `Inv_TemporalOrdering` | `legal-hold.tla` (370 states) + **two isolated twins**: `legal-hold-buggy.tla` (Inv 6) and `legal-hold-buggy-cascade.tla` (Inv 4) |
| Provisional Commitment | Inv 8 | Ghost `releasedAt`/`expiredAt` + `Inv8_TransitionsAfterPlacement` with `PlacedAt=1` | `provisional-commitment.tla` (15 states) + **two isolated twins**: `…-buggy.tla` (Inv 8) and `…-buggy-window.tla` (Inv 7) |
| Capacity Constraint | Inv 5 | Added `ReleaseAtomic` so non-negativity is non-vacuous on the release path | `capacity-constraint-enforcement.tla` (7 states) + **two isolated twins**: `…-buggy.tla` (Inv 5 underflow) and `…-buggy-toctou.tla` (Inv 4 overshoot) |
| Capacity Constraint | Inv 14 | **Vote reconsidered → out-of-scope** (within-action atomicity is a host obligation, not an action-vs-action interleaving; parallels Party Identity Inv 11). Documented in Lineage §Formal-layer vote. | — (no model; by-design) |

Gating note: the three TLA+ extensions (Legal Hold, Provisional Commitment,
Capacity Constraint) initially repointed the single existing twin at the *new*
invariant, which silently dropped the previously-covered invariant's
counterexample. The Opus gate caught this and added a **second isolated twin**
per model so each load-bearing invariant retains its own dedicated rejecting
twin — both auto-discovered and required-to-reject by `audit.mjs`. The five
patterns now carry unqualified `grounded` (no "formal coverage: Inv N pending"
caveat remains).

Follow-up (2026-06-04): a verification audit found Credential had *not* received
the same treatment — its single `credential-buggy.tla` carried both the Inv 2
TOCTOU and the Inv 7 dangling-rotation hazards, and because TLC reports only the
shortest counterexample, the Inv 7 violation (5 states) masked the Inv 2 violation
(33 states), leaving Inv 2 with no demonstrated rejection in `audit.mjs`. Credential
was split into two isolated twins to match the discipline above: `credential-buggy.tla`
(Inv 7 only — `register` stays atomic, so Inv 2 holds at 105 states when checked
alone) and `credential-buggy-toctou.tla` (Inv 2 only — `rotate` stays correct, so
Inv 7 holds at 233 states when checked alone). Both are auto-discovered and
required-to-reject by `audit.mjs`. No English-spec or correct-model change (the
correct `credential.tla` already asserts both invariants and holds at 138 states);
this was a vacuity-guard/coverage-artifact correction only.
