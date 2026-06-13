# Concept recovery — run 3, tier-3 dive: the BOM controller (2026-06-13)

> **Status: internal staging, not canonical.** Tier-3 (read the logic, recover the real invariants) on the strongest gap from the ERPNext saturation run: the recursive BOM. Subject: `erpnext/manufacturing/doctype/bom/bom.py` (1420 lines) + `services/exploded_items.py`. **Headline: not a flashy bug — a *confirmation* plus a *methodological limit*. The candidate atom (acyclic recursive composition) is confirmed at the controller level, and its flattening independently implements the library's own derived-index discipline. Two minor smells flagged. And the honest constraint: I could not execute Frappe here (no bench/DB), so unlike runs 1–2 these findings are reasoned-from-source, not run — which is itself the point.**

---

## Recovered invariants (tier-3 confirmed from source)

- **I1 — Acyclicity.** A BOM cannot be an ancestor or descendant of itself. Enforced by `check_recursion`, called from **`on_update`** (post-write), immediately after `frappe.cache().hdel("bom_children", self.name)` clears self's child cache. It `traverse_tree()`s the now-persisted tree (BFS over `_get_bom_children`), fetches all descendant BOM Items, and throws `BOMRecursionError` if any descendant references `self.name` (or if the same finished-good item reappears with a BOM). *Self-correction during the dive:* I first suspected a TOCTOU hole because `traverse_tree` reads committed/cached state — but the guard runs in `on_update` (after the edges are written) with self's cache freshly cleared, so it does see the new edges. The smell did not survive reading the lifecycle order.
- **I2 — Quantity rollup (the multiplication law).** Exploded qty = child's `qty_consumed_per_unit × this level's stock_qty`, *summed* across paths. `add_to_cur_exploded_items` accumulates into a dict keyed by item (or item+operation): `cur[key]["stock_qty"] += args.stock_qty`. **Shared sub-assemblies (diamonds) are correctly summed, not deduped** — the obvious rollup bug (dedup-by-item under-counting a legitimately-repeated component) is *not* present.
- **I3 — Materialized flat BOM = a memoized derived index.** The explosion is **not** a live recursive traversal. To explode A, `get_child_exploded_items` reads each child B's *already-stored* `BOM Explosion Item` rows (`_fetch_child_flat_bom_items`: `WHERE parent = B AND docstatus = 1`) and scales them. Each BOM's flat BOM is computed once from its children's *materialized* flat BOMs — dynamic-programming memoization, not re-traversal. This **confirms the tier-2 inference** ("exploded_items = materialized derived index") and refines it: the rebuild reads children's materialized projections rather than re-exploding them.

## The headline finding — a confirmation, not a bug

**ERPNext's BOM explosion independently implements the library's derived-index / composition-state rule.** `exploded_items` is a materialized projection that (a) carries no truth not derivable from the recursive `items` structure, (b) has an **explicit named rebuild procedure** — the **BOM Update Tool** / **BOM Update Log** (`bom_updation_utils.py`, which clears the global `bom_children` cache and re-explodes dependents), and (c) is **best-effort consistent**: a single-BOM save re-explodes only *that* BOM, so a parent's stored flat BOM is **stale w.r.t. a changed child until the parent is re-saved or the Update Tool runs**. That staleness window is not a hidden bug — the BOM Update Tool *exists precisely to close it*, which means ERPNext is aware of and manages it exactly as the library's composition-state rule prescribes: *derived index + named rebuild + no cross-source consistency claim.*

This is the more valuable result. A real, mature, widely-deployed ERP, with no knowledge of Grace Commons, built the recursive-composition flattening as a derived index with an explicit rebuild — independent corroboration that the composition-state rule (`execution-contract.md` §Composition state) carves a real joint. The candidate atom now has controller-level confirmation:

- **Acyclic Recursive Composition (Bill-of-Materials)** — state: a recursive `parent → (component, qty, sub-BOM?)` structure; invariants: **I1 acyclicity**, **I2 quantity-rollup-by-summation**; companion **derived index** (the flat BOM) with a **named rebuild** and best-effort consistency. The structural primitive is new to the library; its flattening is the library's existing derived-index construct. Strong new-atom candidate, now invariant-confirmed.

## Minor smells (candidates — NOT confirmed; would need a bench)

1. **Heterogeneous sort key (`exploded_items.py:118`).** `sorted(self.doc.cur_exploded_items, key=itemgetter(0))` — but the dict's keys are *heterogeneous*: a bare `item_code` string when no operation, or an `(item_code, operation)` tuple when there is one (lines 51–53). `itemgetter(0)` returns the **first character** of a string key but the **whole item_code** of a tuple key, so the flat-BOM rows are ordered by an inconsistent key. No crash (both yield strings, no `TypeError`) and **quantities are unaffected** (summed before sorting) — purely a row-*ordering* defect, cosmetic/low severity. Concrete and evident from reading; flagged for a bench check.
2. **Division by `self.doc.quantity` (`exploded_items.py:123`).** `qty_consumed_per_unit = flt(ch.stock_qty) / flt(self.doc.quantity)` — a `BOM.quantity` of 0 would raise `ZeroDivisionError`. Almost certainly prevented by an upstream positive-quantity validation, but not guarded *here*; candidate edge case.

Neither is the load-bearing acyclicity/rollup invariant — those are sound. Both are the kind of finding tier-3 *should* surface and exactly the kind that needs execution to confirm severity.

## The methodological limit (the honest, important part)

Runs 1–2 (`rec`, `asgi`) ended in **executed proof** — I ran the code and reproduced the bug. **This run could not: Frappe needs a full bench + database I can't stand up in the sandbox.** So tier-3-on-ERPNext degraded from *verified* to *deeply read*: the invariant recovery is solid (the controller is explicit and unambiguous), but the bug candidates are *suggestive, not reproduced*. This is precisely the earlier methodology claim landing as lived experience — **depth at scale needs the environment.** The breadth tiers (1–2) ran free on metadata; the depth tier (3) hit the wall the two-modes note predicted: invariants live in the controllers, and *checking* them (not just reading them) needs the running system. For the partnership proof-of-value dive, this is the operative constraint: a *confirmed* invariant violation in ERPNext requires a bench, test fixtures, and ideally the project's own test suite as the trace source — the asgi method, transplanted, with infrastructure.

## Eval (tier-3)

- **Candidate atom confirmed** (acyclic recursive composition + derived-index flattening), invariants recovered from source.
- **Strong corroboration** of the composition-state / derived-index rule by independent real-world code (the BOM Update Tool *is* the rule's "named rebuild procedure").
- **No confirmed bug**; two honest minor smells flagged for a bench check (the heterogeneous sort key is the more concrete).
- **Methodological limit made explicit:** tier-3 without a running instance is read-not-run; the next real depth dive needs a Frappe bench to reach asgi-grade *executed* findings.

## Actions

- **Backlog (Grace Commons):** **Acyclic Recursive Composition / Bill-of-Materials** atom — now controller-confirmed (acyclicity + rollup invariants, derived-index flattening). Run the three gates; it is the strongest structurally-novel candidate from the ERPNext exercise.
- **Partner thesis:** the proof-of-value bug-hunt is *real but gated on infrastructure* — stand up a Frappe bench and use ERPNext's own test suite as the trace source (the asgi method at scale). The two smells above are the first places to point it.
- **Methodology:** fold the read-not-run limit into `concept-recovery.md`'s tier-3 description — tier-3 on framework-heavy targets requires the runtime, or it is honestly "deep read," labeled as such.
