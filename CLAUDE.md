# CLAUDE.md — Grace Commons session bootstrap

> Standing instructions for any Claude session working on Grace Commons. Read this first; it points at the canonical documents, names the vocabulary that is load-bearing, and lists the authoring conventions every pattern follows. The repo's own documents are canonical; this file is the index that gets you to them quickly.

---

## What Grace Commons is

Grace Commons is a public library of **atoms** and **compositions** expressed as structured natural language. The thesis: software's canonical unit should shift from code to structured intent — a single semantic source from which code, tests, diagrams, and contracts are all derived. Code is a build artifact; the spec is canonical.

This is the open-foundation track of a broader architecture (the **Spec Layer**) that synthesizes formal-methods, requirements engineering, BDD, design-by-contract, and Daniel Jackson's *Essence of Software* (EOS) into one canonical English-as-truth representation. The Alloy / concept-catalog track is the formal-methods parallel; Grace Commons is the structured-natural-language parallel. Both extend the same EOS-conceptual core; neither displaces the other.

The methodology, philosophy, and full inheritance are in [`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md). Grace Commons is named for Grace Hopper, who first argued that business logic should be readable by the people who understand the business.

---

## Reading order for a fresh session

If you have no prior context, read in this order:

1. **[`readme.md`](./readme.md)** — architecture overview, current contents tree, the three-layers framing (atoms, applications, emergent invariants). Brief.
2. **[`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md)** — the manifesto. The *Principles* section (information-management triad + design-quality inheritances) and *Bridges* section (load-bearing humans↔machines bridge, *does this build a bridge, or build a wall?* litmus test) anchor the framing.
3. **[`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md)** — the three-pass methodology (GRID structural, EOS conceptual independence, Linus adversarial), the four-step authoring rubric, and the **Regulated-pattern conventions** section that canonicalizes *Regulated adversarial scenarios* and *Generation acceptance*.
4. **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** — contribution shape, the three perspectives (rigor / clarity / implementability), the quality bar, and the contribution lifecycle.
5. **An example atom.** [`atoms/productivity/personal-todo.md`](./atoms/productivity/personal-todo.md) for the simplest atom shape with a two-iteration Lineage record. [`atoms/compliance/actor-identity.md`](./atoms/compliance/actor-identity.md) for the regulated-atom shape (carries both regulated-pattern conventions).
6. **An example application.** [`compositions/idempotent-reservation.md`](./compositions/idempotent-reservation.md) for a two-atom composition. [`compositions/audit-trail.md`](./compositions/audit-trail.md) for the four-atom canonical regulated-audit composition.

When drafting a new pattern, additionally read the most structurally adjacent existing pattern — mirror its shape.

---

## Vocabulary — load-bearing terms

| Term | Meaning |
|------|---------|
| **Atom** | A freestanding concept with its own state, actions, invariants. Specification does not name another atom. Files in `atoms/<category>/`. |
| **Application** | A composition of two or more atoms. Specification names the atoms it composes. Files in `compositions/`. |
| **Freestanding** | EOS-sense: the concept can be specified without naming any other concept. Pass 2 enforces this. |
| **Emergent invariant** | A property that appears only at composition time and belongs to no single constituent atom. Applications surface these explicitly under *Application-level invariants*. |
| **Regulated atom** | An atom in `atoms/compliance/`, or one whose acceptance bar is set by an external evaluator (regulator, auditor). Carries two extra sections: *Regulated adversarial scenarios* and *Generation acceptance*. |
| **Lineage notes** | The per-pattern record of what each pressure-testing pass surfaced and how it was resolved. Recursive: the notes themselves can be pressure-tested. |
| **GRID** | The nine-node MUSE v1.1 completeness framework (Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof). Pass 1's checklist. |
| **The canonical regulated-audit stack** | Event Log + Actor Identity + Retention Window + Tamper Evidence → Audit Trail. All four atoms grounded; the four-atom application landed. The library's worked example of multi-atom composition under regulated load. |

---

## Authoring conventions

These are conventions every atom and application follows. Deviations are review findings, not stylistic choices.

- **Atoms are freestanding.** The specification does not name another pattern. Directory placement is the operational form; the deeper criterion is EOS Pass 2 — does the concern have its own state machine, recur across many domains, deserve its own atom.
- **Identity model is always explicit.** Opaque system-generated id (immutable); other fields are immutable properties of the record (set on the creating action, never change). Never use a content field as identity.
- **Action signatures are always explicit.** `action(args) → result | rejected(reason)`. Every rejection reason is named. Queries with multiple legitimate outcomes use first-class result tags (e.g., `verified | failed-verification(reason) | not-known`) rather than a success-or-reject pair.
- **Invariants are named descriptively first, then numbered.** Format: `**Invariant N — Descriptive name.** Statement.` Never letter-prefix codes (no Invariant A.1, B.2, etc.).
- **Defended-in-line.** Each architectural claim states principle, likely objection, mechanism that resolves it, result. Authoring well prevents what Pass 3 would otherwise catch.
- **Examples cover happy path and rejection path.** Regulated atoms additionally include a *Regulated adversarial scenarios* subsection walking the three canonical adversarial classes: regulator audit, disputed transaction / data-subject request, breach forensics.
- **Edge cases name composing patterns by link.** Out-of-scope concerns name the atom or application that handles them. Forthcoming-links resolve to real links when the referenced atom lands.
- **Standards inheritance is selective.** Cite only standards that genuinely apply to the atom; frame standards that belong to a composing pattern as the composing pattern's obligation rather than this atom's.
- **Lineage notes record the three-pass arc.** Pass 1 GRID findings, Pass 2 EOS extractions, Pass 3 Linus fixes — what was found, what was closed in-pattern, what was deferred as explicit out-of-scope. Conventions inherited from the canonical methodology are named as such (not re-derived from predecessor atoms).

---

## The three-pass review

Every pattern survives three pressure-testing passes before reaching `grounded`:

- **Pass 1 — GRID structural.** All nine MUSE nodes resolved with their references intact. Mechanical; 15-30 min for an atom.
- **Pass 2 — EOS conceptual independence.** Every concern belongs to *this* concept; over-absorption is extracted as a separate atom. 10-20 min once familiar with the catalog.
- **Pass 3 — Linus adversarial.** Muddled identities, sloppy invariants, hidden decisions, happy-path-only examples — all surfaced and either fixed in-pattern or named as explicit out-of-scope. 30-60 min; most labor-intensive of the three.

Each pass catches a different class of gap. Skipping is not an option. A pattern that has only survived one or two passes declares its actual status (`unresolved`, `partially resolved`) rather than false `grounded`. See [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) for the full methodology and worked examples.

---

## Regulated-pattern conventions

Two structural sections are **required** for atoms in `atoms/compliance/`, atoms in other categories whose examples invoke regulated domains, and applications composing any of the above:

- **Regulated adversarial scenarios** — an *Examples* subsection walking three canonical adversarial reads: *regulator audit* (a query against records that must return the expected result by virtue of an invariant), *disputed transaction or data-subject request* (an external party challenges the system's claim and the records must answer), *breach or incident investigation* (an investigator queries during or after an anomaly).
- **Generation acceptance** — a standalone section naming what a derived implementation must produce, framed as the bar an external auditor must be able to clear *from the records alone*, with no recourse to source code, runbooks, or developer narration. Typically four-to-six checks.

Both conventions are **inherited from the methodology directly**, not re-derived from predecessor atoms. Lineage notes for new regulated patterns cite the methodology, not earlier worked examples.

---

## Current state of the library

**Atoms (`atoms/`):**

- `productivity/` — Personal Todo, Assignment (both `grounded`)
- `temporal/` — Duplicate Prevention, Event Log (both `grounded`)
- `resource-lifecycle/` — Provisional Commitment (`grounded`)
- `compliance/` — Actor Identity, Retention Window, Tamper Evidence, Permissions (all `grounded`)
- `messaging/` — Subscription, Notification (both `draft`; Notification Fanout composition forthcoming)

**Compositions (`compositions/`)** — all `grounded`:

- Undo History (Personal Todo + Event Log)
- Idempotent Reservation (Provisional Commitment + Duplicate Prevention)
- Audit Trail (Event Log + Actor Identity + Retention Window + Tamper Evidence)
- Shared Todo (Personal Todo + Permissions + Assignment)

The canonical regulated-audit stack — Event Log + Actor Identity + Retention Window + Tamper Evidence → Audit Trail — is complete. Shared Todo (Personal Todo + Permissions + Assignment) is the four-composition milestone; all three constituent atoms are grounded and the composition is landed.

---

## Workflow for adding a new pattern

1. **Triage atom vs. application.** Apply the directory-placement test (does the specification name another pattern?) and confirm against EOS Pass 2. The deeper criterion: does the concern have its own state machine, recur across many domains, deserve its own atom?
2. **Identify the closest existing pattern.** Read it carefully; mirror its shape, vocabulary, and conventions. *Actor Identity* and *Retention Window* are the references for new regulated atoms; *Personal Todo* is the reference for productivity primitives; *Idempotent Reservation* and *Audit Trail* are the references for compositions.
3. **Draft.** For regulated atoms or applications composing regulated atoms, bake in *Regulated adversarial scenarios* and *Generation acceptance* from the first draft. Identity model and action signatures explicit. Invariants named descriptively then numbered.
4. **Run all three passes.** GRID first, EOS second, Linus third. Iterate until clean. Lineage notes record what each pass found and how it was resolved.
5. **Resolve forthcoming-links.** Any existing atom whose Composition notes name the new pattern as `*(forthcoming)*` gets the marker removed and the reference linked.
6. **Update catalog files.** The category README (`atoms/<category>/README.md`), the top-level snapshot in `readme.md`, and — for applications — `compositions/README.md`. Add the new pattern with a one-line description and the standards it anchors.

---

## Open architectural questions

These are deliberately deferred until content or evidence forces resolution; they are documented honestly rather than re-decided each session:

- **Taxonomy axes.** Current pattern categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`) mix conceptual axes. The right axial split will be forced by content as the catalog grows past the size where preemptive cuts are reasonable; restructuring earlier would relocate the same confusion under different labels. See the *Open question on the current axes* paragraph in the Taxonomy section of [`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md).
When a session has a strong case for resolving one of these, the move is to (a) write the case down, (b) execute the resulting refactor as a discrete pass that updates every reference across the library, and (c) update this section.

---

## Canonical documents

- [`readme.md`](./readme.md) — home page, current contents snapshot, three-layers framing.
- [`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md) — the architectural manifesto.
- [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) — three-pass methodology, regulated-pattern conventions.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contribution shape, three perspectives, four-step authoring rubric, lifecycle.
- `atoms/<category>/README.md` — per-category catalogs.
- [`compositions/README.md`](./compositions/README.md) — compositions catalog, vocabulary note.

---

## Tone

Grace Commons authoring is plain, dense, and defended-in-line. The architecture is software engineering one level up; the same principles that discipline good code — DRY, SSOT, explicit-over-implicit, separation of concerns, composition over inheritance, YAGNI, encapsulation, fail-fast, KISS — discipline the canonical spec. The Spec Layer's claimed contribution is the *information-management triad* (DRY/SSOT/explicit) applied at the intent level; the design-quality principles are inherited from existing practice.

When in doubt, say more. Verbosity that preserves meaning is a feature, not a defect. AI summaries can shorten the canonical text for orientation; the canonical text itself stays long because it must be verifiable.

The litmus test for any architectural addition is from the *Bridges* section of the manifesto: *does this build a bridge, or does it build a wall?* Walls exclude an audience to optimize for another; bridges accommodate both. The architecture optimizes for bridges by default.
