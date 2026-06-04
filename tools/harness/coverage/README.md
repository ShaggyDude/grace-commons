# Coverage cross-check — inaugural sweep (2026-06-03)

The first full run of the formal-layer **coverage cross-check** (PRESSURE_TESTING.md
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
  check: Party Identity (after the Inv 6 promotion), Assignment, Preference,
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

### Genuine GAPs (need model work)

| Pattern | Invariant | Nature / candidate fix |
|---|---|---|
| Medication Order | **Inv 3 & 4** — amendment pre-dispensing only; linear amendment chains | Vote-named load-bearing, deferred "to Alloy" but **no Alloy model exists**. Fix: a small `medication-order.als` mirroring `clinical-observation.als` (same linear-amendment property). |
| Credential | **Inv 7** — rotation-chain integrity | Model tracks statuses but no `successor` link. Fix: add a successor relation + a "every Rotated has a successor in the same (principal,type)" check. |
| Legal Hold | **Inv 6** — `released_at ≥ placed_at` | Model has no clock. Fix: a two-clock model with `released ⇒ releasedAt ≥ placedAt`, **or** reconsider the vote (best-effort clock → out-of-scope). |
| Provisional Commitment | **Inv 8** — transition timestamps after placement | Confirm-window (the primary claim) is checked; release/expire timestamp ordering is not. Fix: extend, **or** reclassify the timestamp half as best-effort clock. |
| Capacity Constraint | **Inv 5** — non-negativity | Passes trivially because `release` is not modeled (allocated only grows). Fix: add a `release` action so the check is non-vacuous. |
| Capacity Constraint | **Inv 14** — action atomicity | Vote-named, but within-action (not an interleaving). Fix: reconsider the vote (within-action atomicity → out-of-scope, consistent with other atoms). |

## Status note

By the strict methodology rule a load-bearing GAP blocks *unqualified* `grounded`,
so the five affected patterns (Medication Order, Credential, Legal Hold,
Provisional Commitment, Capacity Constraint) carry a named coverage-pending item
until closed. This is a refinement of formal coverage, not an English regression —
the recommended honest label is `grounded` with a "formal coverage: Inv N pending"
note in the Status line, pending the punch-list above. The cheap promotions close
in minutes each; the genuine GAPs are early-sprint model work.
