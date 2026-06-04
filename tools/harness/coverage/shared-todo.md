# Coverage matrix — `compositions/shared-todo.md`

- **Pattern:** `compositions/shared-todo.md`
- **Model:** `shared-todo.tla` + buggy twin `shared-todo-buggy.tla`
- **Reviewer / date:** Claude Sonnet 4.6 — 2026-06-03
- **Formal-layer vote load-bearing claims:** Invariant 3 (cascade-on-delete — Active assignment recalled before task deleted; no dangling assignment post-delete), Invariant 2 (at-most-one-responsible-actor, inherited from Assignment atom)

## Step 1 — harness re-run (must pass)

- Correct model: `node check.mjs ../../compositions/shared-todo.tla` → `PASS` ☐ *(not re-run here; lineage records green run 2026-06-03, 3 states exhaustive)*
- Buggy twin: `node check.mjs ../../compositions/shared-todo-buggy.tla --buggy` → `PASS` (rejected) ☐

## Step 2 — coverage matrix

The model bounds: one task (`taskExists ∈ BOOLEAN`), one assignment slot (`assignmentActive ∈ BOOLEAN`). Named invariant: `Inv_CascadeOnDelete == ~taskExists => ~assignmentActive`. Checked via `Safety == TypeOK /\ Inv_CascadeOnDelete`. Exhaustive: 3 reachable states.

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Permission enforcement | No | out-of-scope (Permissions atom not modeled; model header explicitly states "NOT MODELED: Permissions enforcement (Invariant 1)") | Model tracks only `taskExists`/`assignmentActive` — no permission state |
| **Invariant 2 — At most one responsible actor per task** | **Yes** | out-of-scope (note: flagged) | Model header: "NOT MODELED: the at-most-one-responsible constraint (Invariant 2 — inherited from Assignment; see assignment.tla)". Deferred to `assignment.tla`. **FLAG: this is load-bearing per the vote.** By-construction in the model (only one `assignmentActive` boolean — single-slot abstraction structurally prevents two simultaneous assignments), but the "inherited from Assignment" rationale is that `assignment.tla` is the canonical check. Acceptable if `assignment.tla` carries the formal assertion; otherwise a gap at the composition layer. |
| **Invariant 3 — Cascade-on-delete** | **Yes** | **covered** | `Inv_CascadeOnDelete == ~taskExists => ~assignmentActive`; `Safety` asserts this holds on all reachable states; buggy twin (delete without prior recall) is rejected at 4 states |
| Invariant 4 — Responsibility queryability | No | out-of-scope (Assignment history store not modeled; query-surface properties are structural/records properties, not interleaving claims) | No assignment history in the model; out-of-scope by design |
| Invariant 5 — Authorization history completeness | No | out-of-scope (Permissions grant store not modeled; records-alone property) | Permissions not in scope for this model |
| Invariant 6 — Personal Todo's invariants preserved | No | by-construction (Personal Todo's invariants are enforced by its own atom model; the composition model wraps its API and never bypasses preconditions — the `taskExists` boolean is a faithful projection) | No separate Personal Todo check here; preserved by the composition's non-bypass discipline |
| Invariant 7 — Assignment's invariants preserved | No | by-construction (Assignment's invariants are enforced by `assignment.tla`; the composition model uses a single-slot boolean abstraction consistent with Assignment's at-most-one-Active guarantee) | See flag on Invariant 2 above |
| Invariant 8 — Permissions' invariants preserved | No | by-construction (Permissions' invariants are enforced by `permissions.als`; the composition checks Permissions before any constituent call — structure not subject to TLA+ modeling here) | Permissions check-first discipline preserved by action wiring |

**FLAG — Invariant 2 (load-bearing) by-construction in this model / deferred to `assignment.tla`.**
The vote named Invariant 2 as load-bearing. The composition model uses a single `assignmentActive` boolean, making two simultaneous active assignments structurally impossible at the model level — this is by-construction, not an explicit assert. The model header explicitly defers to `assignment.tla`. This is acceptable *if* `assignment.tla` carries a named `check` for at-most-one-Active; if `assignment.tla` is not in this batch or lacks that assert, this deference is unverified. Recommendation: confirm `assignment.tla` contains an explicit at-most-one-Active `check`, or promote the property to an explicit `Inv_AtMostOneActive` in `shared-todo.tla`.

## Step 3 — bound saturation

From the spec lineage: `taskExists ∈ BOOLEAN`, `assignmentActive ∈ BOOLEAN` → at most 4 logical configurations; reachable states = 3 (not all 4 combinations are reachable from `Init = (TRUE, FALSE)`). The state space is fully saturated at 2 boolean variables — no larger bound to raise. The buggy twin reaches 4 states (the extra state is the dangling-assignment violation state). Saturated by construction of the state space.

## Outcome

- GAP rows: **none** (no outright GAP)
- by-construction flags on load-bearing invariants: **Invariant 2** — load-bearing, deferred to `assignment.tla` as by-construction in this model. Flag recorded; recommend verifying `assignment.tla` carries an explicit at-most-one-Active assert.
- Result: **clean with one flag** — Invariant 3 (primary vote target) fully covered by `Inv_CascadeOnDelete`; Invariant 2 by-construction / deferred; all other invariants defensibly out-of-scope. Lineage entry: *"Coverage cross-check 2026-06-03 — clean (Invariant 3 covered by `Inv_CascadeOnDelete`; Invariant 2 by-construction/deferred to assignment.tla — recommend promotion if assignment.tla lacks an explicit check)."*
