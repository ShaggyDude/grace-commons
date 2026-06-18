# Versioning — Direction

**Status:** Direction — **round-2 confirming re-pass folded (2026-06-16); awaiting a third confirming re-pass before it grounds.** The torvalds pass's eleven seams were decided and folded; the confirming re-pass then found the fold had opened a connected cluster (all rooted in conflating versioning's graded axis with the methodology's binary touch-trigger), now resolved by two further decisions — a single `-beta` suffix, and MAJOR-only human classification — plus forced corrections (§7). On a clean re-pass it grounds and moves to its canonical home (a root `versioning.md`, with the field/grammar pieces folding into [`spec-format.md`](../spec-format.md) and [`pressure-testing.md`](../pressure-testing.md)). Until then it stays here in `working-ideas/` and does not yet bind.

**Covers:** how every spec is versioned, how versions relate across the graph, how the audit produces them, and where the *pre-spec* (sketch) stage hands off to the version pipeline.

---

## Principles

1. **Invent as little as possible.** Versioning is [SemVer 2.0.0](https://semver.org) adopted whole. This document defines no new scheme; it states what SemVer's existing levels and stages *mean* for a behavioral spec, which is derived-from / refined-against, not called.
2. **The change is canonical; the version is derived.** A version is not metadata applied after the fact. It is the output of the audit the change triggers (§5) — the same spine as *code is a derived artifact; the spec is canonical*, lifted one level.
3. **One unit, one version.** Each atom and each composition versions on its own behavior. Nothing versions the corpus as a whole.

> Clean per-unit versioning is what lets the corpus be addressed by, and interoperate with, external knowledge-base and semantic systems — and replaced by the corpus later, if desired. That payoff depends on the version being precise and local.

---

## 0. Lifecycle — pencil, ink, dry

Versioning governs *specs*, not *ideas*. The stage before a spec exists is the **sketch**: a pre-spec idea, in pencil, dated free-text in `working-ideas/` — the stage [`contributing.md`](../contributing.md) calls *Proposal*, to be aliased to one word (§7). Most sketches go in the trash; that is the expected outcome. A sketch carries no version — there is nothing to version yet.

A sketch that clears Gate 3 ([`pressure-testing.md`](../pressure-testing.md) §the three gates) **earns a spec**. The pencil goes to ink and the **version is born at `1.0.0-beta`** the moment the spec exists — the bit-flip: **structured English exists when the file carries an Intent and at least one *substantive* Invariant** (a `not-yet-drafted` stub does not count; for a composition, a Composition-level invariant). It stays "wet" — `-beta`, freely revisable, no number bumps — through the passes, and **dries at `1.0.0`** when it grounds.

**Re-entry.** Grounding is one lap, not the end. Any later edit to a grounded spec touch-triggers a full re-pass ([`pressure-testing.md`](../pressure-testing.md) §Touch triggers re-pass), which downgrades its Status token to `partially resolved` — and that token projects to `-beta` (§3). So the spec re-enters: `1.0.0` → (edit) → `1.1.0-beta` → (re-pass closes clean, token returns to grounded) → `1.1.0`. The re-pass trigger is **binary** — *any* touch re-passes, including a render-only PATCH — and is **orthogonal to the version level**: a PATCH re-enters `-beta` and re-passes too, but carries no blast radius and no governance, dropping back to no suffix as `1.0.1` on a clean pass. "Grounded ⇔ no pre-release suffix" therefore holds at every moment.

```
   sketch            →   spec exists           →   grounded
   (pencil, no ver)      1.0.0-beta   (wet)         1.0.0   (dry)
   working-ideas/        atoms/ | compositions/
   dated free-text       version is identity; "when" → changelog (§5)

   re-entry:  1.0.0  --edit (token → partially resolved)-->  1.1.0-beta  -->  1.1.0
```

---

## 1. Spec fields

Every **spec** (not a sketch) carries three fields, recorded in **spec metadata / frontmatter** (git tags are *publication* artifacts, not the canonical home — §5).

| Field | Axis | Values | Answers |
|---|---|---|---|
| **Visibility** | distribution | `draft` · `published` · `deprecated` | Is it in the public corpus? |
| **Scope** | semantic | `universal` · `local` | Shared commons, or local to one org? |
| **Version** | identity | SemVer string (§3) | Which one, and what changed? |

Scope and Visibility are independent (a `universal` spec can be `draft`; a `local` spec can be `published`). Version and Visibility are *correlated*, not free — a `-beta` (pre-release) spec is effectively never `published`, and **Visibility flips `draft → published` at grounding** (for a `universal` spec, on Council admission — [`governance.md`](../governance.md)). So treat the table as three axes with a sparse reachable-state product, not three fully-orthogonal dials.

**Two identities, complementary (not competing).** The **Version** is the spec's *semantic* identity — which one, and what changed. [`governance.md`](../governance.md)'s content-hash **seal** is the *cryptographic* identity of a specific reviewed artifact — the tamper-proof fingerprint of the exact bytes that were reviewed. The two answer different questions: a consumer wanting *identical behavior* pins the version; one wanting *identical bytes* pins the seal. Consequences, stated so they're not surprises: a PATCH (new version, same behavior, changed prose) **re-seals** (the bytes changed); and pre-release (`-beta`) versions are **unsealed** by construction (sealing happens at grounding/admission), so extensions pin only grounded (sealed) versions — the `(version, seal)` pair governance speaks of exists only at grounding.

---

## 2. Versioning unit: the version graph

- **The atom is the unit.** An atom versions on changes to its own behavior. The corpus is never versioned as a whole — that would bump unrelated atoms (a Retention change forcing a new Consent) and re-introduce the coupling the corpus exists to remove.
- **Compositions version independently.** A composition carries its own version; changing it never bumps the atoms it relates. The thing versioned is a **graph**: atoms and compositions as nodes, *references* as edges, each node versioned on its own behavior. Edges point at versioned nodes — **including composition→composition edges** (a composition naming a substrate composition, e.g. Defensible Retention → Audit Trail) — so it is not a clean atoms-nodes / compositions-edges bipartite split.
- **Extensions pin with a caret.** A `local` extension names the *versioned* universal spec it extends and, where it relies on a relationship, the *versioned* composition too. The pin is a **caret range — `^2.3` (`>=2.3.0 <3.0.0`)**, not `2.x`: if the extension relies on a feature added in a MINOR, it is not safe below that minor, and the pin must say so. It MUST name every dependency it actually has — and pin only grounded (sealed) versions (§1).

---

## 3. The version string

`MAJOR.MINOR.PATCH[-prerelease][+build]` — standard SemVer. The numbers say *what the behavior is*; the pre-release suffix says *whether it is grounded yet* — a single `-beta` (pre-release) or none (grounded). The two are orthogonal: revising within `-beta` never bumps the numbers.

### Numbers — defined behaviorally

| Level | Meaning for a spec | Examples |
|---|---|---|
| **MAJOR** | Removes or constrains. A previously-legal operation becomes illegal, or a previously-derived artifact becomes wrong. | Removed state; added or tightened precondition; removed or restricted transition; an optional field made required; a narrowed permission. |
| **MINOR** | Adds without constraining. Backward-compatible — everything that validated before still validates. | New optional state; a new transition that doesn't constrain existing ones; a widened permission. |
| **PATCH** | No behavioral change. Render, prose, or comment only. | Reworded structured English; clarified note; fixed typo. |

MAJOR's definition is load-bearing: the seam pin (§2) and the propagation cascade (§4) treat MAJOR as the only level that forces downstream re-examination. MAJOR means exactly *"this can break something downstream."*

**Classifying PATCH — pinned to a concrete surface.** Diff the formal artifact (Alloy / TLA+) first; if it changed, the change is MINOR or MAJOR. But formal-byte-identical does **not** by itself prove PATCH — the formal model is a *partial* oracle (every coverage matrix lists invariants it doesn't model). So:

> **PATCH** = formal artifact byte-identical (where one exists) **AND** no change to the prose-structural surface — the numbered Invariant *statements*, the action-signature lines, the named states/transitions/permissions. Only then may the audit auto-classify (§5).

A change to a **precondition** that lives only in prose (no canonical section owns it) is **not** mechanically diffable, so it is *not* auto-PATCH — it goes to the council's MINOR/MAJOR judgment (§5).

### Pre-release suffix — a single `-beta`, derived from the status grammar

There is **one** pre-release suffix, `-beta`, and it is **not** a second maturity track: it is read off the canonical, CI-pinned Status grammar ([`pressure-testing.md`](../pressure-testing.md) §Status line format; SSOT [`open-questions.md`](../open-questions.md) §Status-line grammar). The projection is **total over the canonical tokens** and trivial:

| Status token (canonical) | → version |
|---|---|
| *(sketch — pre-spec, no spec file)* | no version |
| `draft` · `unresolved` · `partially resolved` | `…-beta` |
| `grounded (English) … — formal layer pending` | `…-beta` (not fully grounded) |
| `grounded … — <named item> pending` | `…-beta` (not fully grounded) |
| `grounded on Final Critique N — YYYY-MM-DD` (or legacy `grounded — YYYY-MM-DD`) | *(no suffix)* |

So **no suffix ⇔ the token is a fully-grounded form** — a clean biconditional, because every not-fully-grounded token (including the two qualified-grounded forms that carry a trailing `pending`) projects to `-beta`. The earlier `alpha/beta/rc` gradation is **dropped**: it required maturity tokens the grammar does not have ("modeled"), which would have re-created the very second track this resolution forbids. `-beta` says exactly one thing — *pre-release, not yet fully grounded* — and the Status token carries every finer fact (which round, formal-pending, `<named item>` pending).

**Grounded is machine-checkable:** grounded ⇔ no pre-release suffix ⇔ the Status token is a fully-grounded form. A spec is born at `1.0.0-beta` (the bit-flip, §0) and **first grounds at `1.0.0`** (suffix dropped); numbers begin bumping only on changes after it (re-entry, §0).

### Build metadata

`+build` is the only place a literal datestamp may appear *in the version string* (e.g. `1.2.0+20260616`); never affects precedence, not used by default, and never a substitute for the changelog timestamp or the Status token's date (§5).

---

## 4. Propagation — this *is* the constituent-change cascade

A MAJOR on a node forces re-examination of everything downstream: every composition referencing the atom, every composition naming the substrate composition, and every local extension pinned to it.

This is the cascade [`pressure-testing.md`](../pressure-testing.md) §Constituent-change cascade **already defines** — a *breaking* constituent change triggers a touch-triggered re-pass on every grounded composition naming it; an *additive* change does not (the "all invariants from [Atom]" reference form is forward-compatible). A **MAJOR** is exactly the breaking change that populates a blast radius; a **MINOR** is the additive change whose blast radius is empty by construction. Versioning adds no second mechanism — it *names* the existing one and reads its trigger off the version graph. A forced re-examination that finds the downstream still compatible re-pins (e.g. `^2.3` → `^3.0`) and re-passes, bumping the downstream's own version only if *its* behavior changed.

---

## 5. Audit as the version source

A change to a spec triggers an audit; the audit *classifies* the change, and the classification **is** the version bump. The bump is **emitted by whichever council round the change triggers — a touch-triggered re-pass or a scheduled rescan — at its consolidate step** ([`pressure-testing.md`](../pressure-testing.md) §The default executor), never an unnamed manual step. (Emitting a version bump is a council capability to declare in `pressure-testing.md`; see §7.) Every audit produces three things:

1. **A version bump** — PATCH auto-classifies off the formal diff *plus* the prose-structural surface (§3); the council proposes MINOR; **only MAJOR, and genuinely ambiguous cases, need a human** — councils conduct, humans triage.
2. **A changelog entry** — `unit · old → new · level · what changed · timestamp`. Generated by the consolidate step, never hand-maintained, so it cannot drift.
3. **A blast-radius list** — every downstream artifact flagged for re-examination (§4), read off the version graph. Empty for PATCH and MINOR by construction; populated only on MAJOR.

**Datestamps: the changelog and the Status token, nowhere else.** "When" is the changelog timestamp (a fact about a release) and the date mandated inside the canonical Status token (`grounded on Final Critique N — YYYY-MM-DD`). The version string carries no datestamp except `+build`. Date-stamped *identifiers* are removed from spec text — the version graph is the system of record for identity, the changelog for history. The Version and the seal both live in **frontmatter**; git tags are publication artifacts, not canonical.

---

## 6. Deprecation

- **Cyclic, never silent.** A breaking change is a MAJOR bump with a migration path; the old major line is deprecated through a cycle, not deleted out from under its dependents.
- **A MAJOR on a *universal* spec requires governance sign-off** ([`governance.md`](../governance.md)); a migration path alone is insufficient, because a breaking change to a shared commons spec can strand consumers the org-local case cannot. (A MAJOR on a `local` spec needs no commons governance.) The version graph already identifies exactly who the consumers are (§4).
- **Ceremony scales with load.** The detailed cycle — notice period, migration-path format, end-of-life policy — stays minimal while the corpus has few external dependents, and hardens once a removed major line would strand real consumers.

---

## 7. Resolution record, residuals, and the review trail

**Torvalds pass — fresh-reader Opus, 2026-06-16 (round 1).** Confirmed the spine sound (SemVer-whole, version-as-derived, per-unit, MAJOR-drives-the-cascade, the PATCH partial-oracle catch) and surfaced eleven seams; the original sketch documented the *entry* into versioning and rationalized past the *steady state*. Decided and folded into §1–6:

| # | Seam | Decision |
|---|---|---|
| 1 | Suffix vs. status grammar | Status grammar canonical; suffix a **derived projection** — settled to a single `-beta` in round 2 (§3). |
| 2 | Subsequent-change re-entry | Any edit re-enters the pipeline `1.1.0-beta → 1.1.0` via the `partially resolved` token (§0). |
| 3 | Audit runner / classifier | The triggering council round **emits** the bump; PATCH auto, council proposes MINOR, **only MAJOR + ambiguity need a human** (§5). |
| 4 | Seal vs. version identity | Version = **semantic** identity; seal = **cryptographic** identity of the reviewed bytes; complementary (§1). |
| 5 | Lifecycle word | Use **sketch** for the pre-spec stage; alias `contributing.md`'s *Proposal* to it (§0; residual b). |
| 6 | First-version numbering | Born `1.0.0-beta`, first grounds `1.0.0` (§0, §3). |
| 7 | The bit-flip | A spec exists at **Intent + ≥1 substantive Invariant** (§0). |
| 8 | PATCH surface | Formal diff + the prose-structural surface; a prose-only precondition routes to the council (§3, §5). |
| 9 | Pin lower bound | Caret **`^2.3`**, not `2.x` (§2). |
| 10 | Version provenance | Version and seal in **frontmatter**; git tags publication-only (§1, §5). |
| 11 | Universal MAJOR | Requires **governance sign-off** (§6). |

**Confirming re-pass — fresh-reader Opus, 2026-06-16 (round 2).** Confirmed the spine again, but found the round-1 fold had opened a connected foundational cluster, **all rooted in one confusion** — treating versioning's graded axis (PATCH/MINOR/MAJOR) and the methodology's binary one (*any touch re-passes*) as the same axis. The lever was a non-total projection table that re-invented a maturity vocabulary (`alpha/beta/rc` against tokens the grammar lacks). Resolved by two decisions and forced corrections, now folded:

- **Single `-beta` suffix** — the projection is now total over the canonical tokens (grounded-unqualified → no suffix; everything else → `-beta`), which makes *grounded ⇔ no suffix* a true biconditional and retires the invented vocabulary (§3).
- **MAJOR-only human classification** — PATCH auto, council proposes MINOR, human only on MAJOR/ambiguity, so a human is not gated onto every additive edit (§5).
- **Forced corrections:** the bump is emitted by the *triggering* council round, touch or scheduled (§5); re-entry runs through the `partially resolved` token (§0); PATCH and the re-pass trigger are orthogonal — a PATCH still re-passes and re-enters `-beta` but carries no blast radius (§0); plus refining fixes (seal-pins-bytes / PATCH-re-seals / pre-release-unsealed §1; visibility flips at grounding §1; substantive-invariant + composition bit-flip §0; the `+build` datestamp note §3).

**Mechanical residuals** (to *build*, not decide): (a) the **stale-pin lint check** — flag a `local` extension whose pinned major line was superseded or deprecated; the CI analog of `D-stale-forthcoming`, enforcing §4. (b) **Align `contributing.md`** — alias its *Proposal* to **sketch** so the corpus uses one word. (c) The **retro-version migration sweep** — assign each grounded pattern `1.0.0` by projecting its Status token through §3's table; worker-tier, Opus-gated, on the scheduled-rescan automation. (d) **Declare the council's "emit a version bump" capability** in `pressure-testing.md` (capability provenance — §5 leans on a consolidate-step capability the methodology does not yet grant).

---

*Round-2 fixes folded; the next gate is a third confirming fresh-reader re-pass on this version. On a clean pass it inks fully — moves to a root `versioning.md`, the field/grammar pieces fold into `spec-format.md` and `pressure-testing.md`, and the residuals run as a worker-tier sweep.*
