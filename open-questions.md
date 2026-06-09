---
title: Open Questions
nav_order: 998
---

# Open questions

The complement to [`discoveries.md`](./discoveries.md): discoveries record what has been *found*; this records what is *open*. It is the SSOT for the library's **authored** architectural questions — the deliberately-deferred decisions, documented honestly rather than re-litigated each session. (CLAUDE.md points here and stays agent-operational; it no longer carries these.)

When a session has a strong case for resolving one, the move is: (a) write the case down, (b) execute the resulting refactor as a single discrete pass that updates every reference across the library, (c) update this file.

---

## Authored architectural questions

### Taxonomy axes

Current pattern categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`, `messaging`, `workflow`, `healthcare`) mix conceptual axes — `healthcare` is domain-scoped while the others are concept-scoped; `compliance` mixes pure-compliance-infrastructure atoms with atoms that happen to be regulated. The right axial split will be forced by content as the catalog grows past the size where preemptive cuts are reasonable; restructuring earlier would relocate the same confusion under different labels. The `workflow/` sub-question — whether one atom justifies the category — is **resolved** (2026-06-04): the category now holds two grounded atoms, Approval Step (the fixed-state pole — states fixed by the atom) and Workflow / State Machine (atom #9, the general-declared pole — states declared by the deployment), so it stands on present catalog evidence rather than on a planned atom. The broader axial split question across all categories is independently open. See the *Open question on the current axes* paragraph in the Taxonomy section of [`the-spec-layer.md`](./the-spec-layer.md), and [`roadmap.md`](./roadmap.md) §"Open taxonomy question" for the parallel ROADMAP framing.

**Status (2026-06-08): RESOLVED — executed.** The usage-derived taxonomy ([`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)) landed: atoms are stored flat (`atoms/<name>.md`), cross-cutting classification (regulated / security / standards) is *derived* from the composition graph as overlays, and `domain` is the one intrinsic, EOS-gated axis. This dissolves the mixed-axes problem — there is no longer one folder per atom to mis-assign. See the 2026-06-08 entry in [`discoveries.md`](./discoveries.md).

### Regulation as folder vs. attribute

The former `compliance/` folder conflated two things: atoms whose primary domain *is* compliance infrastructure (Actor Identity, Retention Window, Tamper Evidence — these have no meaningful non-regulated use case), and atoms that belong to other domains but carry a heavy regulated surface (Soft Delete is `resource-lifecycle` by nature; Medication Order and Clinical Observation are `healthcare`; Legal Hold could reasonably be `resource-lifecycle` or `temporal`). As the library grows, "regulation" may belong as a frontmatter attribute — `regulated: true`, or a `standards: [GDPR, HIPAA, FRCP]` field — rather than a folder that atoms are placed in by consequence rather than by domain. The practical implication: the `compliance/` folder may eventually narrow to pure compliance infrastructure primitives, while regulated atoms in other domains carry their regulatory surface as metadata. This restructuring will cause significant tree churn and cross-reference updates across every regulated atom's Composition notes; it should be executed as a single discrete refactor pass once the content forces the decision, not incrementally. Deferred until the catalog is large enough to make the right cut obvious.

**Status (2026-06-08): RESOLVED — executed.** `regulated` / `standards` / `security` are now *derived* from the composition graph (never a folder, never a stored attribute); the move landed flat storage plus generated browse-by-overlay views. The live sub-questions carry forward in [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md): uncomposed atoms, and the regulated-overlay stewardship obligation that is intrinsic to compliance-infrastructure atoms even when derived classification says otherwise (e.g. `selective-disclosure`, which the generated view should lint for the overlay sections separately from classification).

### Guided-process state → phase → action mapping

For the human-facing guided process (the double-diamond entry model — create/select/extract at the vision / composition / atom levels, seeded rough, refined by diverge→converge), the irreducible thing to define is the mapping from an artifact's *state* — MUSE completeness state, pressure-testing round, conformance status, `## Composes` graph position — to its diamond *phase* and the prescribed next diverge/converge *action*. The state substrate already exists; the mapping does not. It is the prerequisite the guided tooling would project from (the tooling derives "where am I / what's next" from artifact state rather than asking the human to declare it). Open — to define.

---

## Generated index (planned, not built)

Open questions are *also* scattered through the artifacts as markers: `*(forthcoming)*` links, atoms/compositions marked `unresolved` / `partially resolved`, open CORNERS items, and the sub-question sections in proposals (e.g. `atoms/TAXONOMY.md`). Those are **derivable** — a future generator should project them into an index appended here rather than anyone hand-maintaining the list. Same discipline as the taxonomy itself: name the irreducible (the authored architectural questions above), derive the rest.
