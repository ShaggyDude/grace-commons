---
title: Usage-Derived Taxonomy (atoms)
nav_exclude: true
---

# Usage-derived taxonomy for atoms — resolved design

**Status:** **executed 2026-06-08.** The one discrete pass landed: atoms flattened to
`atoms/<name>.md`, the seven category folders dissolved, the per-category README catalogs
replaced by the generated browse-by-overlay view (`atoms/index.md`, emitted by
`tools/taxonomy/generate_views.py` from the reverse index), and `domain: healthcare`
seeded on `medication-order` with `clinical-observation` held. Council-approved
(unanimous, 2026-06-08) **conditioned on continued careful curation** of the one intrinsic
axis (`domain`, EOS-gated) and of overlay attribution — the derivation removes the
relabeling guess, not the stewardship. The decision was validated against the live corpus
by a read-only generator (`tools/taxonomy/reverse_index.py`: 18 compositions / 27 atoms /
47 composition→atom edges); the dry-run assessment is the evidence base for everything
below. The move was scripted, link-checked, and done **once**.

## The decision, in one line

Stop filing atoms in category folders. Store them flat (`atoms/<name>.md`) and split
classification into **three axes, each with one authoritative mechanism**: *structural*
(derived from the atom's own spec), *overlay* (regulated / standards / security / any
future cross-cutting axis — **derived from the composition graph**), and *domain*
(healthcare, banking — the **one** intrinsic axis, an optional tag set only where the
EOS freestanding test says a domain genuinely contributes irreducible semantics).
*Name the concept; derive every cross-cutting classification; tag a domain only where it
is earned.*

## Why folders are wrong — the evidence, not the assertion

The original proposal argued that the former `compliance/` folder *conflates* infrastructure (it
named Actor Identity and Tamper Evidence as "non-regulated infra") with regulated-by-
usage atoms. **The dry run shows that example is wrong** — Actor Identity (composed by 3
regulated compositions) and Tamper Evidence (1) are both regulated-by-usage. The real
argument is sharper and the data is unambiguous:

- **The misfiling runs the *other* way (Analysis B).** `compliance/` actually holds
  together — 12 of its 13 atoms are regulated-by-usage. The genuine defect is **10
  regulated-by-usage atoms filed *outside* it**: `event-log` (`temporal/`, regulated by
  Audit Trail + Reserve from Pool, **14 derived standards**), `soft-delete`
  (`resource-lifecycle/`, 9), `approval-step` and `state-machine` (`workflow/`),
  `assignment` (`productivity/`), `provisional-commitment` / `duplicate-prevention` /
  `capacity-constraint-enforcement`, and `notification` / `subscription` (`messaging/`).
  **Event Log is the proof**: it is the single most heavily-regulated atom in the library
  *by usage*, filed under `temporal/` because that is its intrinsic *shape*. The folder
  forces one primary home and makes the atom lie about its regulated surface.

- **A folder is two facts welded together.** `compliance/` currently holds **two distinct
  overlays at once** — the *security* cluster (7 atoms: actor-identity, capability,
  credential, invitation, party-identity, permissions, session) and the
  *regulation/retention* cluster. `credential` is security-only; `retention-window` is
  regulation-only; `actor-identity` is both. A folder cannot say "both"; an atom has
  several true classifications and a single folder forces a guess about which axis wins.

The root problem is that a folder is simultaneously a **name** (where the file lives) and
a **classification** (what kind of thing it is). Separating those is the whole fix.

## The model — three axes, three mechanisms

Each class of fact about an atom has exactly one authoritative source — the SSOT
discipline the rest of the library already runs on.

| Axis | Authoritative source | Mechanism | Examples |
|---|---|---|---|
| **Structural** | the atom's own `## State` / `## Behavior` | *derivable* (deferred; no metadata) | sequence, state-machine, registry |
| **Overlay** | the composition graph (`## Composes`) + standard families | **derived, regenerated** | regulated, standards, **security** |
| **Domain** | the atom's concept, adjudicated by EOS | *intrinsic*, optional, default-absent | healthcare, banking |

### 1. Structural — derived, no metadata

The conceptual *shape* (sequence / state-machine / registry) is derivable from the atom's
own `## State` / `## Behavior`, so it already has an authoritative source and needs no
`shape:` frontmatter. Declare a `shape`/`kind` only if a real consumer needs it before
that deriver exists; default is none. (Unchanged from the proposal; the corpus confirmed
it — e.g. Clinical Observation's own commit history settles that its state model "can be specified
as a Workflow instance" but is inlined for definitional reasons.)

### 2. Overlay — derived from the graph (and security proves it generalizes)

An overlay is any cross-cutting classification an atom acquires through *use*. It is read
off the graph, never asserted:

- **regulated** — an atom is regulated iff a regulated composition (one carrying a
  `## Generation acceptance` section; 16/18 compositions) composes it.
- **standards** — the union of the standards its composers carry, **attributed per
  composer in the generated view** (`HIPAA via audit-trail`, `FATF via customer-onboarding`), never
  flattened to a bare set. (This answers the one real legibility wrinkle: infra atoms
  accumulate large unions — retention-window derives 19 — which read as over-claim unless
  each standard names the composer that contributes it. The view reports *usage*, not
  essence.)
- **security** — **a new overlay, proven to drop in for free.** Computed identically to
  `regulated` (an atom carries it iff it derives an identity/access/crypto-family
  standard — NIST 800-63/53/207, OWASP ASVS, SCIM, FIPS 180-4), it clusters cleanly onto
  exactly the 7 auth/identity atoms above and stays **off** every domain-payload and
  infrastructure atom (event-log, retention-window, tamper-evidence, soft-delete, …). This
  is the decisive demonstration that **security is an overlay, not a domain**: cross-
  cutting, multi-valued, derived from usage, and an atom can carry it alongside any domain.
  Future cross-cutting axes (privacy, financial-controls) are expected to drop in the same
  way.

The rule, which doubles as the test for anyone tempted to add a field:

> **Classification is derived from usage; generated views therefore report usage facts
> (which compositions, which standards, via whom), never claims about the atom's essence.**

### 3. Domain — the one intrinsic axis, and the only judgment

Domain is the single axis usage cannot derive (the dry run's soft domain-from-standards
hint collapsed almost everything to {finance, healthcare, data-protection} and gave the
two healthcare atoms *nothing*, since they are uncomposed). So domain is an **optional
intrinsic frontmatter field, default absent**, and it is the only place a human judgment
enters. To keep that judgment from re-introducing the folder problem (a per-atom guess),
it is **gated by the EOS freestanding test, not taste**:

> A domain *earns* an intrinsic `domain:` tag only when stripping the domain from the
> concept fails to leave a freestanding, domain-neutral primitive — i.e. when the domain
> contributes irreducible *invariants*, not just a name.

The corpus already contains both outcomes, and they are the worked examples:

- **`medication-order` → `domain: healthcare` (earned).** Its lifecycle is a state machine
  (a neutral shape that already exists as the Workflow/State Machine atom), but its
  *guards* are irreducibly clinical — verification gates dispensing, the
  Verified→Dispensed→Administered pipeline, controlled-substance attestation. You cannot
  derive those from neutral primitives. Domain earned it.

- **`clinical-observation` → no tag (held; masquerade candidate).** Its own spec states it
  "imposes no semantics on what the value means clinically; it imposes only the structural
  guarantee that the record is faithful." Strip "clinical" and the concept is an
  *amendable, attributed, retractable measurement record* — equally a lab value, a
  financial mark, a sensor reading. The concept is domain-neutral; only the **name and
  intent framing** are healthcare. Tagging it `healthcare` would be the trap: domain-
  flavored naming masquerading as domain-intrinsic concept. Its eventual composition (or a
  deliberate reframe to its neutral concept) is left to decide; the tag stays off until
  evidence earns it.

This generalizes to three layers at which "domain" can enter, only one of which is a tag:

1. **via usage** — most domain *relevance* is an overlay fact (HIPAA via audit-trail). Derived.
2. **via irreducible invariants** — rarely, a tight domain-specific invariant bundle bound
   to a specific state-set crystallizes into a genuine domain atom (medication-order). Tagged.
3. **via naming** — a neutral concept dressed in domain clothes (clinical-observation). *Not*
   a domain; the trap the EOS test exists to catch. No tag.

**Evidence decides as the corpus grows.** Healthcare is the only domain with candidates
today; banking is near-term; each future domain atom earns or fails the tag by the same
EOS test. The system is **correct with zero domain tags** — because the proven problem
(Analysis B) is fixed entirely by flat storage + derived overlays. Domain is additive,
never load-bearing, which is exactly why it can be deferred to evidence without blocking
the fix.

## Design specifics

1. **Flat storage.** `atoms/<name>.md`, one file per atom, named by concept. Each atom's
   formal-model siblings (`.als` / `.tla` / `.cfg` / `.py`) move with it. Zero basename
   collisions across the current folders (re-confirm at move time), so the flatten needs
   no renames.
2. **The overlays are generated.** `tools/taxonomy/reverse_index.py` parses every
   `compositions/*.md` `## Composes` section, inverts to `atom → [composers]`, and
   propagates regulated-status / standards (per-composer) / security onto the atoms.
   Mirrors `tools/recipe/generate_recipe.py`.
3. **Generated views replace folders.** The per-category `README.md` catalogs, the docs
   nav, and any "regulated atoms"/"security atoms" list become generated artifacts of the
   reverse index. Browse-by-overlay (regulated, security, a given standard) and browse-by-
   domain all fall out of the same index.
4. **Views report usage, not essence.** Regulated/security/standards are framed as
   composition names + counts + per-composer attribution, never as booleans. An uncomposed
   atom shows "composed by: (none yet)" — honest about usage — not "Regulated: false."
5. **Frontmatter holds the irreducible only:** `title`, a one-line concept summary,
   `status` (e.g. `grounded`), and the optional `domain:` tag where earned. *Not* overlays
   (`regulated`, `standards`, `security` — derived) and *not* `shape`/`kind` (derivable
   from the atom's own structure).
6. **The atom-vs-composition distinction is untouched.** `atoms/` vs `compositions/` stays;
   only the category subfolders inside `atoms/` dissolve. The directory-placement test
   ("does the spec name another pattern?") is unaffected and gets simpler.

## Open edges — named honestly for the council

- **Domain is a judgment, gated but not mechanical.** The EOS test removes taste but still
  requires a careful per-atom read (the corpus already does this — Clinical Observation's
  commit history records a four-round steelman of extracting a generic "Supersession Chain,"
  settled as host-specific). This is the one axis a generator cannot close; we are choosing
  to keep a small human-curated field rather than fake-derive it. Is that the right trade,
  or should domain be deferred entirely until a second domain (banking) gives comparative
  evidence?
- **The universal claim is unproven.** "Atoms are domain-neutral; domains consume concepts"
  holds for everything the graph composed, but the only atoms that could *challenge* it
  (the two uncomposed healthcare atoms) are exactly where the graph is silent, and the
  corpus is small (27) and self-selected (authored under an EOS discipline that already
  prizes neutral primitives). Medication Order already falsifies the *strong* form. We
  adopt only the weak form (domain sometimes earned, EOS-gated) and let evidence rule on
  the rest.
- **`selective-disclosure` is uncomposed but lives on stewardship.** It carries the
  regulated-overlay authoring obligation intrinsically (compliance infrastructure),
  independent of current usage. Derivation drives navigation; the overlay-authoring
  obligation is stewardship that travels with the atom. The generated view should *lint*
  any derived-regulated atom missing the overlay sections (mirroring conformance
  `--reconcile`), separately from classification.
- **Clinical Observation reframe** (rename to its neutral concept, let healthcare consume
  it) is a *separate follow-on*, not part of this pass. Flagged, not bundled.

## Migration plan — one discrete pass

Ordered so the taxonomy is proven correct *before* any file moves (step 1 is already done —
the generator runs and the derived classification was eyeballed against reality).

1. **Generator built + validated.** ✓ (this dry run). Fix the generator or a `## Composes`
   link, never the tree, if anything is wrong.
2. **Pre-flight.** Re-confirm zero basename collisions; enumerate each atom's formal-model
   siblings; re-grep the full reference set (`atoms/<category>/` across `*.md` and the
   formal files' relative includes) and **re-measure the churn** (the proposal's 76 + 72
   figures are stale — count at move time).
3. **Frontmatter schema** (intrinsic identity + optional `domain:`); seed `medication-order:
   healthcare`, hold `clinical-observation`.
4. **The atomic move.** `git mv atoms/<category>/<name>.* atoms/<name>.*` for all atoms +
   formal siblings, then a scripted rewrite of every `atoms/<category>/<name>` →
   `atoms/<name>` reference across all referencing markdown + formal-file relative paths.
   One commit.
5. **Replace folders with generated views.** Delete the per-category READMEs + folder nav;
   wire the generator's output (overlay catalogs + nav) into the build.
6. **Update canonical docs.** SPEC_FORMAT (`atoms/<category>/` → `atoms/<name>.md`;
   classification derived), THE_SPEC_LAYER's Taxonomy section, ROADMAP's open-taxonomy note,
   CLAUDE.md's two open questions → resolved with a pointer here, open-questions.md.
7. **Verify.** Repo-wide link-check (zero dangling `atoms/<category>/`), generated
   catalog/nav builds, site builds, Alloy/TLA models still run (paths intact).

## What it resolves

Closes both CLAUDE.md open questions (regulation-as-folder-vs-attribute → overlay;
taxonomy-axes → the three-axis split); settles the security question with data (overlay,
not domain); and converts the domain question from "which folder?" to "has this domain
earned an intrinsic tag, by the EOS test?" — answered by evidence, atom by atom, as the
catalog grows from healthcare into banking and beyond. The risk CLAUDE.md warned about —
"restructuring early just relocates the same confusion under different labels" — does not
apply, because the overlays carry no relabeling judgment (they are derived) and the one
judgment that remains (domain) is gated by an existing principled test, not taste. The
only real risk is mechanical (the one-pass file churn), which is why the move is scripted,
link-checked, and done once.
