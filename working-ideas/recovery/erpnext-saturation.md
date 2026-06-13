# Concept recovery — run 3: ERPNext saturation sample (2026-06-13)

> **Status: internal staging, not canonical.** Phase-2 *saturation* run (not a single-concept recovery). Subject: [`frappe/erpnext`](https://github.com/frappe/erpnext) (~600MB; 21 modules; 527 top-level DocTypes, 248 of them child tables). Method per `concept-recovery.md`: mine the **DocType metadata** (Frappe's declarative JSON schemas), not the Python — the schema *is* the concept skeleton. Question answered: **as you mine a real ERP, do the library's ~27 atoms keep showing up as the substrate, or does the corpus keep minting primitives the library lacks?** This is the falsifiability test of the taxonomy, run in reverse. Depth: 6 DocTypes classified in detail (GL Entry, Stock Ledger Entry, Sales Order, Payment Entry, Asset, Material Request) + an aggregate scan over all 527. **Verdict: strong saturation — the transactional backbone reduces to a small recurring primitive set the library already owns, plus 2–3 candidate atoms.**

---

## Aggregate scan (all 527 DocTypes)

| Signal | Count | Reading |
|---|---|---|
| Non-child top-level DocTypes | 279 | the "real" concept surface (248 are child tables = composition components) |
| **Submittable (`docstatus` state machine)** | **82 (29%)** | the immutable-on-submit transactional backbone |
| Carry a `status` Select field | 80 (28%) | explicit domain state machines |
| Named `*Entry` / `*Ledger` | 15 | append-only ledgers |
| Use `naming_series` (sequential id) | 64 (22%) | a recurring identity primitive |
| `track_changes` (versioned/audited) | 308 | over half the corpus is audit-tracked |
| Link fields (relationship edges) | 2151 (~4/DocType) | dense composition graph — DocTypes wire primitives together |

The shape is already legible from the aggregate: a **small set of primitives** (a submit state machine, ledgers, sequential ids, change-tracking) recurring under **hundreds of domain objects** wired together by ~2000 links. That is exactly the "80% is patterns implemented thousands of times" thesis, measured.

## The backbone primitive — `docstatus` (the single biggest saturation hit)

Every one of the 6 sampled DocTypes — and 82 across the corpus — is *submittable*, carrying Frappe's `docstatus` lifecycle: **Draft (0) → Submitted (1) → Cancelled (2)**, where a submitted document is **immutable** (no edits; to change it you *cancel* and *amend*, which creates a new linked document). Zero DocTypes use the optional Frappe Workflow doctype for this — `docstatus` *is* the universal state machine. It decomposes cleanly into existing atoms:

- **Workflow State Machine** — a named instance through declared states/transitions. `docstatus` is the minimal universal instance.
- **Immutable Transaction Ledger / Event Log** — immutable-on-submit is the append-only/no-rewrite discipline at the document grain.
- **Reversal via compensation** — cancel→amend is *correction without destructive edit*: you don't mutate, you post a reversal and a new version (the `amended_from` lineage link). Structurally the Undo-History / immutable-ledger compensating-event pattern.

One framework field, three library atoms, 82 instances. This alone largely answers the saturation question.

## The 6-DocType sample, classified

| DocType | Module | Recovered substrate (atoms) | Notes |
|---|---|---|---|
| **GL Entry** | Accounts | Immutable Transaction Ledger + Event Log + **binding-bijection** (double-entry: debits = credits) | Append-only postings; sequential `ACC-GLE-.YYYY.-.#####`. The canonical immutable ledger. |
| **Stock Ledger Entry** | Stock | Immutable Ledger + Event Log + **Capacity Constraint** (warehouse balance) | `qty_after_transaction` is a **derived index** (running balance rebuildable from the ledger). |
| **Sales Order** | Selling | Workflow State Machine + **derived indexes** (`delivery_status` ⊥ `billing_status`) + commitment | Domain *composition*; orthogonal sub-lifecycles (see gap 2). |
| **Payment Entry** | Accounts | Submittable txn → GL postings (Immutable Ledger) + **binding/allocation** (payment ↔ invoices) | Allocation against invoices is a binding-bijection. |
| **Asset** | Assets | Workflow State Machine (13 states) + **Provenance/custody** (owner/location/custodian) + scheduled depreciation | Custody transitions are Chain-of-Custody-shaped; depreciation is a derived time-schedule. |
| **Material Request** | Stock | Workflow State Machine + **Approval** + **derived fulfillment rollup** (Ordered/Received from downstream docs) | Status is a derived index over downstream POs/Receipts. |

Across the sample, **every transactional DocType decomposes into the same recurring kit**: Workflow State Machine (docstatus + status) · Immutable Ledger/Event Log (postings) · derived indexes (status rollups, running balances) · with Provenance, Approval, Capacity Constraint, and binding-bijection appearing where the domain calls for them. **No DocType in the sample required a transactional primitive the library lacks.** The DocTypes themselves are domain *compositions* over the primitives — confirmed by the ~4 links/DocType and the 248 child tables.

## Saturation verdict

**The taxonomy holds against a real 279-DocType ERP at the substrate level.** Mining did *not* keep minting new primitives; it kept resurfacing the same handful — exactly the outcome the falsifiability metric predicts if the atoms carve real joints rather than fit the library's own examples. For a project Scott names as "the type we are targeting to build," the load-bearing claim lands: a real ERP's transactional backbone is expressible as compositions over the existing atom set plus a small number of new primitives.

This is the emergent-invariant/taxonomy-saturation thesis confirmed from the reverse direction, and at scale — the strongest evidence yet that the library's primitive set is approximately *sufficient*, not just internally consistent.

## Candidate atoms surfaced (where saturation is incomplete — the valuable gaps)

1. **Sequential Identifier / Naming Series** (64 DocTypes, 22%). ERPNext's `naming_series` mints human-meaningful, scope-and-year-bounded, monotonic, unique ids (`ACC-GLE-.YYYY.-.#####`). The library gives every atom an *opaque* immutable id but has **no atom for sequential human-readable naming**, which carries its own invariants: per-scope monotonicity, uniqueness, and gap/rollover behavior on cancel. Strong Gate-1 recurrence (64 witnesses in one corpus). **Best new-atom candidate from this run.**
2. **Orthogonal / multi-dimensional state** (Sales Order `delivery_status` ⊥ `billing_status`; Asset's 13-state lifecycle). One entity running *concurrent independent sub-lifecycles*. The library's Workflow State Machine is single-dimensional (Harel-statechart orthogonal regions are unmodeled). Either a composition pattern over multiple state machines or a genuine gap — needs the gates.
3. **Derived fulfillment rollup** (Material Request "Partially Received"; Sales Order "Partly Delivered"). Status computed from the state of *downstream documents*. This is the existing derived-index construct, but as a recurring *cross-document rollup* it may warrant a named composition pattern. Likely composition, not atom.

## Eval (run 3)

- **Method scales via metadata.** Reading DocType JSON (not Python) made a 600MB ERP tractable as a sampling exercise — the Frappe-is-declarative bet paid off exactly as `concept-recovery.md` predicted.
- **Saturation: strong/confirmed** on the transactional backbone. The library's atoms recur as substrate under hundreds of domain objects; no transactional concept in the sample needed a missing primitive.
- **Yield:** quantified recurrence (82 submit machines, 15 ledgers, 64 sequential ids, 308 audited), a clean decomposition of 6 representative DocTypes, and **3 candidate atoms** (Sequential Identifier the strongest) that feed the backlog — the reverse-direction taxonomy test generating new atoms, as designed.
- **Caveat 1 — sample, not full mine.** 6 deep + aggregate signals. Exercises the transactional/accounting/stock/selling/assets backbone; CRM, Manufacturing (BOM/Work Order), Projects, Quality, and Subcontracting are unsampled and may surface domain primitives the backbone doesn't (Manufacturing's BOM-explosion and routing are the most likely to).
- **Caveat 2 — structure recovered, invariants INFERRED not verified (the load-bearing honesty).** This run mined DocType *metadata* (declarative schema), which yields concept *skeletons* — state, relationships, naming, lifecycle. It does **not** yield *invariants*, which live in the Python controllers (`validate()`, `on_submit`) this run never read. So the aggregate recurrence counts (82 submit machines, 64 naming series, etc.) are *computed facts*, but the per-DocType atom mappings (e.g. GL Entry → "binding-bijection / debits = credits") are *inferred from domain knowledge*, not recovered from code and not checked. The verifying, bug-finding depth that made runs 1–2 compelling is absent here by construction. **Breadth mode answers "does the taxonomy hold"; it cannot find a bug or confirm an invariant — that needs depth mode on the controllers.**
- **Two recovery modes (methodology note).** Breadth/saturation (metadata sampling) scales to large codebases cheaply, needs no extractor, answers taxonomy questions — this run. Depth/verification (read logic, recover + check invariants against tests) does *not* scale, needs an AST extractor past small targets, answers "what are the invariants, are they violated" — runs 1–2. **The workflow is breadth-triages-for-depth:** the cheap wide scan flags the high-value targets (here: the Sequential Identifier candidate), then depth mode dives selectively (read Frappe's `naming.py` to recover and check its monotonicity/uniqueness invariants). The SpecGraph-scanner / AST-extractor question stays open only for *depth at scale*, not for saturation sampling, which metadata-read covers now.

## Manufacturing extension (tier-1 + tier-2, 2026-06-13) — the falsification attempt, partially successful

Manufacturing was flagged in this report as *the module most likely to break saturation*. Ran tier-1 (48 DocTypes) + tier-2 (BOM, BOM Item, BOM Explosion Item, Work Order, Routing, BOM Operation). Result: **the lifecycle backbone saturates a third time, but a genuine structural gap surfaced.**

- **Backbone saturates again (third confirmation).** BOM, Work Order, Production Plan, Job Card are all `docstatus`-submittable + multi-state `status` machines; `amended_from` is the universal cancel→amend reversal lineage. Workflow State Machine + immutable-on-submit + reversal-via-amend cover the lifecycle layer, again. No new primitive needed *here*.
- **GAP #1 — recursive containment / acyclic DAG (the BOM). The strongest new-atom candidate of the whole exercise.** A BOM is a recursive bill of materials: `bom_item.bom_no → BOM` (confirmed tier-2 — a BOM's line items reference sub-BOMs). The library has **no recursive-structure / DAG / hierarchical-composition primitive** (Provenance is a *linear* chain; `is_tree` DocTypes are simple hierarchies; nothing carries a recursive bill with rollup). Its load-bearing invariant is the tell that it's a real concept, not wiring: **acyclicity** (a BOM cannot contain itself, transitively — or the explosion never terminates) plus **quantity rollup** along the structure. Candidate atom: *Acyclic Recursive Composition / Bill-of-Materials* (acyclicity + terminating explosion + quantity multiplication).
  - *Decomposition note:* the gap is partly already-owned. BOM carries both `items` (the recursive structure) **and** `exploded_items → BOM Explosion Item` (the fully-flattened transitive closure) — and the latter is the library's existing **derived index** (a materialized rebuildable projection over the recursive structure). So the gap factors as **derived index (have) + acyclic-recursive-composition (NEW)**. Only the structural primitive is missing.
- **GAP #2 (weaker) — sequenced operations / routing.** `routing.operations` / `work_order.operations` are ordered steps each with per-step state (Pending/WIP/Completed). May be a composition of Workflow State Machines rather than a new atom — needs the gates. Lower priority than #1.

**Tiering honesty:** recursion is tier-2 *confirmed* (the `bom_no → BOM` self-reference is in the schema). "Explosion = derived index" is tier-2 *inferred* — the schema shows the materialized `exploded_items` table, but the traversal/rollup logic that populates it (and the acyclicity enforcement) lives in the BOM controller, a **tier-3** read not yet done.

**Why this is the good outcome:** saturation held for the lifecycle/transactional backbone across *three* domains (accounting/stock/selling/assets + manufacturing), and the one place it cracked is a structurally novel, invariant-bearing primitive (recursive acyclic composition) — a clean new-atom candidate, not a mushy "the taxonomy fails." Falsification that surfaces a *named, gated* gap is the taxonomy working, not breaking. **The BOM is now the prime tier-3 target:** reading its controller would recover the actual acyclicity + rollup invariants (confirming the atom) and is the most likely place in ERPNext to find a real invariant violation — i.e., the partnership proof-of-value dive.

## Actions

- **Backlog (Grace Commons):** **Sequential Identifier / Naming Series** atom — 64-witness recurrence in one corpus; run the three gates. Orthogonal-state and cross-document-rollup as composition-pattern candidates, lower priority.
- **Thesis (Jackson call):** this run is the headline saturation evidence — "a real 279-DocType ERP's transactional backbone reduces to compositions over the existing ~27 atoms plus ~3 new primitives." Pairs with the falsifiability-metric framing as the reverse-direction confirmation.
- **Next mine (optional):** Manufacturing + Projects modules — the two most likely to surface a primitive the accounting/stock backbone doesn't.
