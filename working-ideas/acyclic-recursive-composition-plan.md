# Gate-plan — Acyclic Recursive Composition (2026-06-13)

> **Status: internal staging, not canonical. This is a PLAN, not the atom.** It maps the path to grounding the strongest concept-recovery candidate and front-loads the decision that makes or breaks it. It deliberately does **not** write `atoms/<name>.md`, state final invariants as spec text, or run any pressure-testing round — that is the build, and the build is not authorized yet. When the build is greenlit, this plan is the brief it runs from. Provenance: the candidate and its six witnesses are in [`roadmap.md`](../roadmap.md) §Concept-recovery atom backlog and the run files in [`recovery/`](./recovery/).

> **SUPERSEDED 2026-06-13 — verdict resolved: NOT an atom.** Pushed by GPT's invariant framing, Grok's re-adjudication, and the witnesses (all six are self-referential relations on *existing* concepts' records, so nothing owns freestanding state), the Gate-3 call landed on a **structural-relation invariant template** — *acyclicity / well-foundedness* — now canon in [`spec-format.md`](../spec-format.md) §Structural-relation invariant templates, the fourth member alongside referential integrity / orphan-freedom / inverse consistency. The atom case below (the Workflow / State Machine precedent) was weighed and **declined**: Workflow owns its state, an acyclic-containment relation does not. This file is retained as the record of the analysis that produced that verdict, not as a live build brief.

---

## The candidate, in one line

A record **composed of records of its own kind**, under an **acyclicity** invariant, whose whole can be **expanded (transitive closure)** from its parts. Recovered six times across five languages and six domains: ERPNext BOM, Odoo `mrp.bom`, OpenMRS `obsGroup`/`ConceptSet`, Akaunting `Category`, FHIR `Observation.hasMember`, OpenBoxes `Location`/`ProductComponent` — the most-witnessed gap in the exercise.

## The decisive question — concept, or data structure? (resolve before anything else)

This atom lives or dies on EOS Pass 2 / Gate 3 (`pressure-testing.md` §the three gates), and the honest framing is adversarial:

**The case against (route to *not-an-atom*).** The roadmap's healthcare backlog already rules a bare self-referencing foreign key *not-an-atom* ("Billing Encounter Link → a cross-reference / foreign key — composition-layer state, not an atom"). A `parent_id` column is structure, not a concept. "Acyclic directed graph" is a **data structure** — like "tree" or "list" — and the library specifies *concepts* (purposive, with an operational principle), not data structures. On this reading the real concepts are the *instances* (Bill-of-Materials, Category Hierarchy, Org Chart), and "acyclic recursive composition" is just the shape they share — not itself an atom.

**The case for (route to *new-atom*) — and why it's the stronger case.** A bare FK is structure; this candidate carries **two things a bare FK does not**:
1. **An acyclicity invariant.** A `parent_id` permits cycles; the concept *forbids* them. Enforcing acyclicity requires a check over the **transitive closure**, not a column constraint — that is behaviour with a must-be-true, not a foreign key.
2. **A derived closure (and, for weighted edges, a rollup).** "Expand the whole from its parts" is an operation with its own invariant (closure well-defined because acyclic; rollup-by-summation, diamond-correct). The bare FK has no such surface.

The clinching precedent: the library **already grounded a structural primitive** — **Workflow / State Machine** (a named entity over declared states/transitions, with Approval Step as a specific instance). Acyclic Recursive Composition is the *same move* one shape over: the general structural concept, with BOM / Category Hierarchy as its Approval-Step-style instances. If Workflow / State Machine earns atomhood as "the general declared-state machine," this earns it as "the general acyclic containment." The operational principle that makes it purposive rather than merely structural: *a thing built from things of its own kind, where the build cannot cycle and the whole is recoverable from the parts.*

**Provisional verdict: plausible pass, by the Workflow precedent — but this is the finding EOS Pass 2 must adjudicate first, in writing, before a spec is drafted.** If Pass 2 routes it to *data-structure / not-an-atom*, stop and record that; do not force it.

## Scope decisions to settle before drafting (each is a Pass-2 input)

1. **Tree vs DAG — one atom or two?** Single-parent (Location, Category, Org chart, OpenMRS roles) is a *tree/forest*; multi-parent (BOM, `ProductComponent`, ConceptSet) is a *DAG*. They share acyclicity; they differ in parent cardinality. **Lean: one atom with a declared parent-cardinality** (single → tree, many → DAG), mirroring how Workflow / State Machine declares its states — cardinality is configuration, the invariant (acyclicity) and the closure are shared. Confirm in Pass 2; the alternative (two atoms) is the fallback if the DAG's closure/rollup proves to carry invariants the tree does not.
2. **Quantity rollup — core or optional?** BOM multiplies quantities along edges and sums across paths (diamond-correct); Category/Location/role trees carry no weights. **Lean: not core.** Core = acyclic containment + closure; **weighted edges + rollup-by-summation is a declared/optional aspect** (present for BOM, absent for hierarchies). Keeps the atom minimal (KISS) and avoids over-absorbing arithmetic the tree forms never use.
3. **The flattened/exploded view is NOT the atom's state.** The transitive closure / exploded BOM is the existing **derived-index** construct (`execution-contract.md` §Composition state) — rebuildable, named rebuild procedure, best-effort, carries no truth. Confirmed independently in the wild (ERPNext BOM-explosion tier-3, run 3). The atom owns the **structure + the acyclicity invariant**; the closure is a derived index over it, not owned state. State this explicitly so Pass 2 doesn't mistake the cache for the concept.
4. **Boundaries against neighbours** (Pass-2 EOS checklist): distinct from **Provenance** (a *linear* custody chain, single-predecessor, no branching/cycle question); not **Event Log** (append-only stream, no containment); not **Workflow / State Machine** (states of one entity, not containment of like entities); composes *with* Soft Delete / Actor Identity / Audit Trail like any atom but absorbs none of them.

## Naming — a real collision to resolve

**"Composition" is load-bearing library vocabulary** ([`glossary.md`](../glossary.md), [`readme.md`](../readme.md)): a *composition* is the wiring of atoms, **never a new concept**. Naming an **atom** "Acyclic Recursive *Composition*" directly clashes with that — a reader sees "composition" and expects a `compositions/` artifact. The working name must change before drafting. Candidates (domain-neutral, structural, per house style): **Recursive Containment**, **Acyclic Containment**, **Composable Hierarchy**, or naming it after the canonical instance the way Workflow/State Machine is (**Bill of Materials**, too domain-narrow — reject). **Lean: "Recursive Containment"** (says what it is, no vocabulary clash, covers both tree and DAG). Decide in Pass 1.

## Atom-spec shape it would take (sketch only — per `spec-format.md` atom shape)

Not written here; this is the section map the drafter fills:

- **Identity model** — opaque id per node; the containment *edge* (parent→child, or assembly→component+qty) is the relation. Reject content-field identity.
- **State** — the node set + the containment relation; states are minimal (a node exists / is removed). The "machine" is the relation's integrity, not a per-node lifecycle.
- **Inputs / Outputs** — `add_child` / `attach(component)` (guarded by acyclicity), `remove_child`, queries: `children`, `descendants` (closure), `ancestors`, `roll_up(qty)` (weighted form). Each with named rejections.
- **Decision points** — the acyclicity guard: reject an edge whose child is the node itself (self-loop) or an ancestor of the node (would-create-cycle); for single-parent form, reject a second parent.
- **Invariants** — (1) **Acyclicity**: no node is its own ancestor under the containment relation (the load-bearing one). (2) optional **Rollup-by-summation**: the weighted closure sums correctly across diamonds (weighted form only). (3) closure well-definedness (entailed by acyclicity).
- **Examples** — happy + rejection paths across ≥2 domains (BOM assembly + category tree, say) and the cycle-rejection path.
- **Edge cases / non-goals** — ordering of children (out of scope unless declared), the closure cache (derived index, named elsewhere), deletion-of-a-referenced-node (Soft Delete's job).
- Standard sections (Intent, Summary, Flow, Behavior, Feedback, Composition notes, Standards, Status, Lineage) per the shape.

## Formal layer (anticipated vote: **YES → Alloy**)

Acyclicity is a **structural / relational** property over a bounded graph — squarely Alloy's wheelhouse (the same class as the existing structural `.als` models), not a temporal/interleaving property (so not TLA+). The vote should be cast and recorded in Lineage like any other; the anticipated rationale: *the load-bearing claim (no cycle in the containment relation) is a relational invariant a bounded exhaustive check can discharge.* Model sketch (for the build, not now):
- `sig Node { contains: set Node }`; fact/predicate that `contains` is acyclic (`no n: Node | n in n.^contains`).
- `check` no node reaches itself through the transitive closure `^contains`; `run` a satisfiable non-trivial instance (so the check isn't vacuous — model-present bar criterion 3).
- **Buggy twin** (`-buggy.als`, the vacuity guard): drop the acyclicity fact; the checker must find a cycle counterexample (model-present bar criterion 2).
This clears the "model present" bar (`pressure-testing.md`): green in `tools/harness/`, twin rejected, non-vacuous.

## Path to grounding (the build, when authorized)

1. **EOS Pass 2 first, standalone** — adjudicate the concept-vs-data-structure question above *in writing* before drafting. Gate decision recorded. (If it routes to not-an-atom, stop.)
2. **Pass 1 (name + GRID) → draft** the spec per the shape, with the name resolved.
3. **3×3 baseline + Final Critique**, per `pressure-testing.md`. Because I'd be drafting it, the **Pass 3 / Final Critique runs via fresh-context subagents** (the automated-council mechanism) to preserve fresh-reader discipline — I cannot cold-review my own draft.
4. **Formal-layer vote + Alloy model + buggy twin**, verified in `tools/harness/`; then the **coverage cross-check** matrix.
5. **Catalog surfaces** — roadmap status row, `atoms/index.md` regen, no forthcoming-links to retire (it's net-new; nothing names it yet). Counts move only on grounding, never before.
6. Author adjudicates every finding; nothing grounds without the Opus clearance gate at zero foundational findings.

## Open risks / what could kill or reshape it

- **Gate-3 "it's a data structure" verdict** — the main risk; resolved-or-not by Pass 2. The Workflow precedent is the defence, but Pass 2 owns the call.
- **Tree-vs-DAG might be two concepts** if the DAG's closure/rollup carries invariants the tree lacks — fallback to two atoms.
- **Quantity-rollup creep** — keep it optional or the atom over-absorbs arithmetic; watch in Pass 2 (over-absorption is exactly what Pass 2 catches).
- **Name** — must shed "composition" before drafting.
- **Verdict could be "composition, not atom"** — if the acyclicity invariant turns out to rest entirely on a guard with no owned state, it could route to a composition/derived-index pattern instead. Low probability (acyclicity is a genuine emergent must-be-true), but it is the same Gate-3 spectrum and Pass 2 decides.

## What this plan does not do

It does not create `atoms/recursive-containment.md` (or any name), does not write final invariant text, does not author the Alloy model, and does not run a pressure-testing round. Those are the build. This is the brief.
