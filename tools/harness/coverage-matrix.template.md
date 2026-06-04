# Coverage matrix — `<pattern-name>`

> Fill-in template for the formal-layer **coverage cross-check** (PRESSURE_TESTING.md
> §"The coverage cross-check"). One filled matrix per vote-yes pattern is the
> rescan artifact. A fresh-context reviewer is the ideal executor — it surfaces the
> gaps the model's author rationalized past. This is a read-and-diff, not new
> search; it rides the scheduled-rescan cadence.

- **Pattern:** `<atoms/...|compositions/... .md>`
- **Model:** `<name>.tla|.als` (+ buggy twin `<name>-buggy.*`)
- **Reviewer / date:** `<who> — YYYY-MM-DD`
- **Formal-layer vote load-bearing claims:** `<list the invariants the vote named>`

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../<path>.<tla|als>` → `PASS` ☐
- Buggy twin: `node check.mjs ../../<path>-buggy.<tla|als> --buggy` → `PASS` (rejected) ☐

## Step 2 — coverage matrix

One row per invariant in the spec's **Invariants** section. Verdict ∈
`covered` | `by-construction` | `out-of-scope (reason)` | **GAP**.

- **covered** — cite the model `check`/invariant that asserts it.
- **by-construction** — the model makes violation structurally impossible rather
  than asserting it. Acceptable, but an *assumption, not a verified property*; if
  the invariant is load-bearing, flag to promote to a real `check`.
- **out-of-scope (reason)** — deliberately not modeled, reason named (within-action
  atomicity; structural→other tool; best-effort clock; etc.).
- **GAP** — load-bearing, uncovered, no defensible reason → **route as a finding;
  blocks unqualified `grounded` until closed.**

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — … | | | |
| Invariant 2 — … | | | |
| … | | | |

## Step 3 — bound saturation

Raise the model's scope once and confirm the explored-state count does not grow:

- At `<bound>=N`: `<states>` states.
- At `<bound>=N+k`: `<states>` states → **saturated** ☐ (or: still growing — raise further).

## Outcome

- GAP rows: `<none | list>` → `<routed as findings: ...>`
- by-construction flags on load-bearing invariants: `<none | list → promote/record>`
- Result: `<clean | findings routed>` — record a one-line Lineage entry, e.g.
  *"Coverage cross-check YYYY-MM-DD — clean (all load-bearing invariants covered; saturation confirmed)."*
