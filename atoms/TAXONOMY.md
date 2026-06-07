---
title: Usage-Derived Taxonomy (atoms)
nav_exclude: true
---

# Usage-derived taxonomy for atoms — proposal + one-pass migration

**Status:** proposal, doc-first. Per CLAUDE.md *Open architectural questions*, the
move is (a) write the case down — this doc — (b) execute the refactor as a single
discrete pass that updates every reference, (c) update the open-questions section.
Nothing in the tree moves until this is approved. The move, when it happens, happens
**once**.

## The decision, in one line

Stop filing atoms in category folders. Store them flat (`atoms/<name>.md`) and let
their classification be a **generated reverse index of the `## Composes` edges that
already exist in every composition** — *name the concept, derive the classification.*

## Why (the case)

This resolves two questions CLAUDE.md already has open:

- **Regulation as folder vs. attribute.** `atoms/compliance/` conflates pure
  compliance-infrastructure atoms (Actor Identity, Tamper Evidence) with atoms that
  belong to other domains but carry a regulated surface (Soft Delete = resource
  lifecycle; Medication Order = healthcare; Legal Hold = temporal). One folder, two
  meanings.
- **Taxonomy axes.** The folders mix axes — `healthcare` is domain-scoped, the rest
  concept-scoped — so every atom is forced into one *primary* home and made to lie
  about its other axes.

The root problem is that a folder is simultaneously a **name** (where the file lives)
and a **classification** (what kind of thing it is), and an atom has *several* true
classifications (domain, regulation, standards, the contexts it serves). Forcing one
folder means guessing which axis wins.

Usage-derivation removes the guess. A composition already declares the atoms it
composes; that declaration is the ground truth of "what is this atom for." So an
atom's classification is not asserted by a human picking a folder — it is **read off
the composition graph**:

- An atom is **regulated** iff a regulated composition composes it.
- An atom's **standards** are the union of the standards its composers carry (Audit
  Trail names HIPAA / SOX / PCI / 21 CFR Part 11 …).
- An atom's **domains / contexts** are the domains of its composers, plus the *role*
  it plays (the `## Composes` bullet already says "provides the append-only sequence
  the audit's *what happened* answer is read from").

Derived facts can't drift and never need re-guessing: regenerate them from source.
This is the same discipline the library already uses for RECIPEs (generated from
code) and conformance (derived from spec prose) — applied to taxonomy. The call
graph *is* the taxonomy.

## The principle: name concepts, derive classifications

Usage-derivation cleanly supplies the **contextual** axes — the ones the folders
forced you to guess. It does **not** supply the **intrinsic** one: Event Log is a
temporal append-only sequence regardless of who composes it. So:

- **Named (intrinsic):** the concept itself — its name, state, actions, invariants.
  This is the irreducible work the library already calls "the work."
- **Derived (contextual):** regulation, standards, domain, the contexts served —
  read from the `## Composes` graph.

Folders tried to be both with one label and failed. This separates them.

## Design

1. **Flat storage.** `atoms/<name>.md`, one file per atom, named by concept. Each
   atom's formal-model siblings (`.als` / `.tla` / `.cfg` / `.py`) move with it.
2. **The taxonomy is generated.** A reverse-index generator parses every
   `compositions/*.md` `## Composes` section, inverts it to `atom → [composers]`, and
   propagates each composer's standards/domains/regulated-status onto the atoms it
   composes. Mirrors / extends `tools/recipe/generate_recipe.py`.
3. **Generated views replace folders.** The per-category `README.md` catalogs, the
   docs-site nav, and any "regulated atoms" list become **generated artifacts** of the
   reverse index — not hand-maintained folders. Browse-by-domain, browse-by-standard,
   browse-by-regulated all fall out of the same index for free.
4. **Frontmatter carries intrinsic identity only** — title, a one-line concept
   summary, status (e.g. `grounded`). Classification (`category`, `regulated`,
   `standards`) is **not stored** in the atom; storing it would re-introduce a second,
   driftable source of truth for something that is derivable.
5. **The atom-vs-composition distinction is untouched.** `atoms/` vs `compositions/`
   stays; only the *category subfolders inside* `atoms/` dissolve. The directory-
   placement test ("does the spec name another pattern?") is unaffected — it only gets
   simpler, because the intra-atom category guess disappears.

## Facts that make this cheap and safe (measured)

- **27 atoms** across 7 category folders (compliance 13, messaging 3,
  resource-lifecycle 3, healthcare 2, productivity 2, temporal 2, workflow 2).
- **Zero filename collisions** across categories — so flat `atoms/<name>.md` is safe
  with no renames.
- **Edges already structured:** 19/19 compositions link their atoms via `## Composes`
  (SPEC_FORMAT mandates "a composition names the atoms it composes"). The generator
  has clean input today.
- **Churn surface (why it must be one pass):** **76** markdown files repo-wide
  reference `atoms/<category>/…` paths, and **72** formal-model files live under
  `atoms/` and travel with their atoms. Every one of those references is rewritten in
  the single pass; none is left to "fix later."

## Open sub-questions (settle before the pass)

1. **Uncomposed atoms.** An atom no composition composes yet has empty usage →
   honestly "foundational / unused." Treat that as real signal (a primitive awaiting
   composition, or a gap worth noticing), or add a fallback label? Recommendation:
   surface it as-is; the generator lists "uncomposed atoms" as its own view.
2. **Regulated-overlay authoring obligation.** "Regulated" becoming *derived* is fine
   for classification, but the overlay **sections** (Regulated adversarial scenarios,
   Generation acceptance) are authored *content* in the atom file. So derived-regulated
   must trigger an authoring obligation — and that obligation can newly attach when a
   later composition adopts an atom. Rule needed: the generator flags any
   derived-regulated atom missing the overlay sections (a lint, mirroring the
   conformance `--reconcile` check).
3. **Does any intrinsic axis need a declared name?** The conceptual *shape* (sequence
   / state-machine / config-singleton) is the one thing usage can't derive. Is the
   concept name + summary enough, or do we declare a `shape` in frontmatter? Lean: name
   + summary; add `shape` only if a real consumer needs it.
4. **Domain-intrinsic-but-uncomposed.** A domain-specific atom not yet composed (a
   healthcare atom no composition uses yet) gets no domain from usage. Accept
   "untagged until composed," or let the intrinsic concept carry it? Tie-break with (1).
5. **Does the principle extend to compositions?** Compositions are already flat in
   `compositions/`, but their "classification" (e.g. substrate-compositions like
   Multi-Party Approval composing Audit Trail) is equally derivable from who composes
   *them*. Out of scope for this pass; noted as the natural follow-on.

## Migration plan — one discrete pass

Ordered so the taxonomy is proven correct *before* any file moves:

1. **Build + validate the generator first.** Write the reverse-index generator; run it
   against the current 19 compositions; eyeball that the derived classification
   (regulated set, standards, domains, role text) matches reality. No files move yet —
   if the derived taxonomy is wrong, fix the generator (or a `## Composes` link), not
   the tree.
2. **Pre-flight checks.** Re-confirm zero basename collisions (true today); enumerate
   each atom's formal-model siblings; grep the full reference set (`atoms/<category>/`
   across `*.md` and the formal files' relative includes).
3. **Decide frontmatter schema** (intrinsic-only) and the resolutions to the open
   sub-questions above.
4. **The atomic move.** `git mv atoms/<category>/<name>.* atoms/<name>.*` for all 27
   atoms + their 72 formal siblings, then a scripted rewrite of every reference
   `atoms/<category>/<name>` → `atoms/<name>` across all 76 referencing markdown files
   (composition `## Composes` links, atom↔atom links, EXECUTION_CONTRACT,
   THE_SPEC_LAYER, SPEC_FORMAT, CLAUDE.md, readme, ROADMAP, demos / RECIPEs) and any
   relative paths inside the formal files. One commit.
5. **Replace folders with generated views.** Delete the per-category `README.md`s and
   the folder-driven nav; wire the generator's output (catalog + nav + regulated list)
   into the build.
6. **Update the canonical docs that describe the taxonomy.** SPEC_FORMAT ("Files live
   in `atoms/<category>/`" → "`atoms/<name>.md`; classification is derived"),
   THE_SPEC_LAYER's Taxonomy section, ROADMAP's open-taxonomy note, and CLAUDE.md's two
   open questions → marked resolved with a pointer here.
7. **Verify.** Repo-wide link-check (zero dangling `atoms/<category>/` references), the
   generated catalog/nav builds, the site builds, and the Alloy/TLA models still run
   (their file/module paths intact after the flatten).

## What it resolves

Closes both CLAUDE.md open questions; simplifies the directory-placement test;
narrows the conceptual surface a contributor must guess at (none — they name the
concept and link the atoms a composition uses, and the taxonomy writes itself). The
risk CLAUDE.md warned about — "restructuring early just relocates the same confusion
under different labels" — does not apply here precisely *because there is no
relabeling judgment*: the classification is derived, not re-guessed. The only real
risk is mechanical (the 76 + 72 file churn), which is why the move is scripted,
link-checked, and done once.
