---
title: Open Questions
nav_order: 998
---

# Open questions

The complement to [`DISCOVERIES.md`](./DISCOVERIES.md): discoveries record what has been *found*; this records what is *open*. It is the SSOT for the library's **authored** architectural questions — the deliberately-deferred decisions, documented honestly rather than re-litigated each session. (CLAUDE.md points here and stays agent-operational; it no longer carries these.)

When a session has a strong case for resolving one, the move is: (a) write the case down, (b) execute the resulting refactor as a single discrete pass that updates every reference across the library, (c) update this file.

---

## Authored architectural questions

### Taxonomy axes

Current pattern categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`, `messaging`, `workflow`, `healthcare`) mix conceptual axes — `healthcare` is domain-scoped while the others are concept-scoped; `compliance` mixes pure-compliance-infrastructure atoms with atoms that happen to be regulated. The right axial split will be forced by content as the catalog grows past the size where preemptive cuts are reasonable; restructuring earlier would relocate the same confusion under different labels. The `workflow/` sub-question — whether one atom justifies the category — is **resolved** (2026-06-04): the category now holds two grounded atoms, Approval Step (the fixed-state pole — states fixed by the atom) and Workflow / State Machine (atom #9, the general-declared pole — states declared by the deployment), so it stands on present catalog evidence rather than on a planned atom. The broader axial split question across all categories is independently open. See the *Open question on the current axes* paragraph in the Taxonomy section of [`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md), and [`ROADMAP.md`](./ROADMAP.md) §"Open taxonomy question" for the parallel ROADMAP framing.

**Status (2026-06):** a concrete proposal now exists — [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md) (usage-derived taxonomy) would resolve this together with the next question, by deriving classification from the composition graph rather than choosing one folder per atom. Open pending that proposal's execution.

### Regulation as folder vs. attribute

The current `atoms/compliance/` folder conflates two things: atoms whose primary domain *is* compliance infrastructure (Actor Identity, Retention Window, Tamper Evidence — these have no meaningful non-regulated use case), and atoms that belong to other domains but carry a heavy regulated surface (Soft Delete is `resource-lifecycle` by nature; Medication Order and Clinical Observation are `healthcare`; Legal Hold could reasonably be `resource-lifecycle` or `temporal`). As the library grows, "regulation" may belong as a frontmatter attribute — `regulated: true`, or a `standards: [GDPR, HIPAA, FRCP]` field — rather than a folder that atoms are placed in by consequence rather than by domain. The practical implication: the `compliance/` folder may eventually narrow to pure compliance infrastructure primitives, while regulated atoms in other domains carry their regulatory surface as metadata. This restructuring will cause significant tree churn and cross-reference updates across every regulated atom's Composition notes; it should be executed as a single discrete refactor pass once the content forces the decision, not incrementally. Deferred until the catalog is large enough to make the right cut obvious.

**Status (2026-06):** addressed by the same proposal ([`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)): `regulated` / `standards` become *derived* from the composition graph, not stored as a folder or a frontmatter attribute. Open pending execution; that doc carries the live sub-questions (uncomposed atoms; the regulated-overlay stewardship obligation, which is intrinsic to compliance-infrastructure atoms even when derived classification says otherwise).

### Guided-process state → phase → action mapping

For the human-facing guided process (the double-diamond entry model — create/select/extract at the vision / composition / atom levels, seeded rough, refined by diverge→converge), the irreducible thing to define is the mapping from an artifact's *state* — MUSE completeness state, pressure-testing round, conformance status, `## Composes` graph position — to its diamond *phase* and the prescribed next diverge/converge *action*. The state substrate already exists; the mapping does not. It is the prerequisite the guided tooling would project from (the tooling derives "where am I / what's next" from artifact state rather than asking the human to declare it). Open — to define.

---

## Generated index (planned, not built)

Open questions are *also* scattered through the artifacts as markers: `*(forthcoming)*` links, atoms/compositions marked `unresolved` / `partially resolved`, open CORNERS items, and the sub-question sections in proposals (e.g. `atoms/TAXONOMY.md`). Those are **derivable** — a future generator should project them into an index appended here rather than anyone hand-maintaining the list. Same discipline as the taxonomy itself: name the irreducible (the authored architectural questions above), derive the rest.
