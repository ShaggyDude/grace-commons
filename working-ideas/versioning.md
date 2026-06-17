# Versioning — Direction (sketch)

**Status:** `sketch` — working staging, not canonical (2026-06-16). Pencil, not ink: this captures the versioning direction and, honestly, the open questions it still has to survive. It grounds — and moves to its canonical home (a root `versioning.md`, with the spec-field and maturity-grammar pieces folding into [`spec-format.md`](../spec-format.md) and [`pressure-testing.md`](../pressure-testing.md)) — only after a hard adversarial pass. Until then nothing here binds; §7 is the to-do list for the inking.

**Covers:** how every spec is versioned, how versions relate across the graph, how the audit produces them — and where the *pre-spec* (sketch) stage hands off to the version pipeline.

---

## Principles

1. **Invent as little as possible.** Versioning is [SemVer 2.0.0](https://semver.org) adopted whole. This document defines no new scheme; it states what SemVer's existing levels and stages *mean* for a behavioral spec — because SemVer's definitions assume an API surface, and our specs are derived-from / refined-against, not called.
2. **The change is canonical; the version is derived.** A version is not metadata applied after the fact. It is the output of the audit the change triggers (§5) — the same spine as *code is a derived artifact; the spec is canonical*, lifted one level.
3. **One unit, one version.** Each atom and each composition versions on its own behavior. Nothing versions the corpus as a whole.

> Clean per-unit versioning is what lets the corpus be addressed by, and interoperate with, external knowledge-base and semantic systems — and replaced by the corpus later, if desired. That payoff depends on the version being precise and local. This document makes it so.

---

## 0. Lifecycle — pencil, ink, dry

Versioning governs *specs*. It does not govern *ideas*. The stage before a spec exists is the **sketch**: a pre-spec idea, in pencil, living in `working-ideas/` as dated free-text. Most sketches go in the trash; that is the expected outcome, not a failure. A sketch carries no version — there is nothing to version yet.

A sketch that clears Gate 3 (*wiring freestanding concepts, with an emergent invariant no constituent owns* — [`pressure-testing.md`](../pressure-testing.md) §the three gates) **earns a spec**. The moment structured English exists in `atoms/` or `compositions/`, the pencil goes to ink and the **version is born**, at `-alpha` (§3). It stays "wet" through `-alpha → -beta → -rc` (revisable, no number bumps — pre-release is unstable by SemVer) and **dries at `1.0.0`** — grounded, in the canon. After that, nothing changes without a version bump (§3–5).

```
   sketch            →     draft spec        →    grounded
   (pencil, no ver)        -alpha → -beta → -rc     1.0.0  (suffix dropped)
   working-ideas/          atoms/ | compositions/
   dated free-text         version is identity; "when" moves to the changelog (§5)
```

The boundary is a **bit-flip on form**, not on effort: a sketch can be heavily worked (source-grounded, gate-checked) and still be a sketch, because it is dated notes, not structured English. *(Open — §7: the bit-flip needs a crisp definition. Is a stub with three empty headings a `-alpha` spec yet, or still a sketch?)*

---

## 1. Spec fields

Every **spec** (not sketch) MUST carry three fields. They are orthogonal — a value on one says nothing about the others.

| Field | Axis | Values | Answers |
|---|---|---|---|
| **Visibility** | distribution | `draft` · `published` · `deprecated` | Is it in the public corpus? |
| **Scope** | semantic | `universal` · `local` | Shared commons, or local to one org? |
| **Version** | identity | SemVer string (§3) | Which one, and what changed? |

Orthogonality is the point:

- A `universal` spec can be `draft` — a shared concept, not yet released.
- A `local` spec can be `published` — an org extension shared as a worked example.

Grounding maturity is carried *inside* the Version field, as the pre-release suffix (§3), independent of Visibility: a spec can be **grounded** (no suffix) yet `draft` (unpublished), or `published` yet not grounded.

*(Open — §7: where these fields physically live — frontmatter? the Status section? — is a [`spec-format.md`](../spec-format.md) edit; and `draft` is now overloaded, Visibility `draft` vs `-alpha`'s "drafting", with **sketch** sitting cleanly before both.)*

---

## 2. Versioning unit: the version graph

- **The atom is the unit.** An atom versions on changes to its own behavior. The corpus is never versioned as a whole — that would bump unrelated atoms (a Retention change forcing a new Consent) and re-introduce the coupling the corpus exists to remove.
- **Compositions version independently.** A composition is its own term, so it carries its own version; changing a composition never bumps the atoms it relates. The thing versioned is a **graph**: atoms and compositions as nodes, *references* as edges, each node versioned on its own behavior. Edges point at versioned nodes — **including composition→composition edges** (a composition naming a substrate composition, e.g. Defensible Retention → Audit Trail), so the graph is not a clean atoms-nodes / compositions-edges bipartite split.
- **Extensions pin across the seam.** A `local` extension names the *versioned* universal spec it extends and, where it relies on a relationship, the *versioned* composition too. The pin declares the compatibility range it was examined against, and MUST name every dependency it actually has. *(Open — §7: the pin's lower bound. If an extension relies on a feature added in a MINOR, `2.x` is wrong — it is not safe below that minor; the honest pin is `^2.3` (`>=2.3.0 <3.0.0`), not the whole major line.)*

---

## 3. The version string

`MAJOR.MINOR.PATCH[-prerelease][+build]` — standard SemVer. The numbers say *what the behavior is*; the pre-release suffix says *how far through grounding it is*. Orthogonal: hardening `alpha → beta` never bumps the numbers.

### Numbers — defined behaviorally

| Level | Meaning for a spec | Examples |
|---|---|---|
| **MAJOR** | Removes or constrains. A previously-legal operation becomes illegal, or a previously-derived artifact becomes wrong. | Removed state; added or tightened precondition; removed or restricted transition; an optional field made required. |
| **MINOR** | Adds without constraining. Backward-compatible — everything that validated before still validates. | New optional state; a new transition that does not constrain existing ones; a widened permission. |
| **PATCH** | No behavioral change. Render, prose, or comment only. | Reworded structured English; clarified note; fixed typo. |

Why MAJOR's definition is load-bearing: the seam pin (§2) and the propagation cascade (§4) treat MAJOR as the only level that forces downstream re-examination. Define it loosely and the pin is a false promise. MAJOR means exactly *"this can break something downstream."*

**Classifying PATCH — the formal diff is necessary, not sufficient.** First test: diff the formal artifact (Alloy / TLA+). If it changed, the change is MINOR or MAJOR and needs human classification of *how*. **But formal-byte-identical does not by itself prove PATCH** — the formal model is a *partial* oracle (every coverage matrix lists invariants the model deliberately does not cover; Saga checks Inv 4/6/7 and scopes out 1/2/3/5/8/9), so a prose change to an out-of-model-scope behavior leaves the `.tla` untouched yet is a real MINOR/MAJOR. And vote-*no* specs have no artifact to diff at all. So:

> **PATCH** = formal artifact byte-identical (where one exists) **AND** no change to any numbered invariant, action signature, precondition, state, or transition in the prose. For vote-*no* (English-only) specs the prose-structural check stands alone. Only then may the audit auto-classify (§5).

### Pre-release suffix — the grounding pipeline

The suffix picks up where the **sketch** stage hands off (§0); it begins at `-alpha`, the moment the spec exists.

| Suffix | Stage | Meaning |
|---|---|---|
| *(sketch)* | pre-spec | Idea in `working-ideas/`, dated text, **no version** — not part of the string. |
| `-alpha` | drafting | Structured English exists; no formal model yet. |
| `-beta` | modeled | Formal model drafted, not yet pressure-tested. **Conditional:** only vote-*yes* specs pass through `-beta`; a vote-*no* spec grounds English-only and skips it. |
| `-rc` | tested | Cleared the three-pass review (GRID / EOS / Linus) and the fresh-reader Final Critique; awaiting the Phase 4 clearance gate. |
| *(none)* | **grounded** | Cleared the gate. The corpus's canonical state. |

**Grounded is machine-checkable:** a spec is grounded iff its version has no pre-release suffix.

**First grounding is `1.0.0`** *(recommendation).* The numbers do not move during drafting — hardening is not a behavior change — so the whole first pass lives at `1.0.0-*` and the suffix simply drops at grounding. Numbers begin bumping only on changes *after* `1.0.0`. *(Open — §7: the alternative is SemVer's `0.y.z` "initial development" numbering pre-grounding. `1.0.0-alpha → 1.0.0` is recommended because it makes "grounded ⇔ drop the suffix" exact.)*

### Build metadata

`+build` is SemVer's sanctioned home for information that does not affect identity or ordering — the *only* place a literal datestamp may appear (e.g. `1.2.0+20260616`). Not used by default; never affects precedence. Datestamps appear nowhere in spec prose.

---

## 4. Propagation — this *is* the constituent-change cascade

A MAJOR on a node forces re-examination of everything downstream: every composition that references the atom, every composition that names the substrate composition, and every local extension pinned to it.

This is the cascade [`pressure-testing.md`](../pressure-testing.md) §Constituent-change cascade **already defines** — a *breaking* constituent change triggers a touch-triggered re-pass on every grounded composition naming it; an *additive* change does not (the "all invariants from [Atom]" reference form is forward-compatible). Read against this document: a **MAJOR** is exactly the breaking change that populates a blast radius; a **MINOR** is the additive change whose blast radius is empty by construction. Versioning adds no second propagation mechanism — it *names* the existing one and reads its trigger off the version graph instead of by manual trace. Because every dependent names a *versioned* reference (§2), the set to re-examine is the dependents pinned to the node's previous major line; the audit emits it (§5).

---

## 5. Audit as the version source

A change to a spec triggers an audit. The audit *classifies* the change, and the classification **is** the version bump — the version is the audit's output. Every audit produces three things:

1. **A version bump** — the level (§3) determined by what changed. PATCH may auto-classify off the formal diff *plus* the prose-structural check (§3); MINOR and MAJOR require human classification.
2. **A changelog entry** — `unit · old → new · level · what changed · timestamp`. Generated, never hand-maintained, so it cannot drift from what actually happened.
3. **A blast-radius list** — every downstream artifact flagged for re-examination (§4), read off the version graph. Empty for PATCH and MINOR by construction; populated only on MAJOR.

**Datestamps live here and only here.** "When" is the timestamp on a changelog entry — a fact about a release, not an identity for a spec. The version answers *which one* and *what changed*; the timestamp answers *when*. Date-stamped identifiers are removed from spec text.

*(Open — §7: three change-history surfaces now coexist — per-pattern **Lineage notes** (the review arc), the existing repo-level **[`changelog.md`](../changelog.md)**, and this **generated version-changelog**. Single-home discipline says assign each fact one owner — identity → the version graph; per-release history → the generated changelog; review arc → Lineage — and make the rest derive or defer.)*

---

## 6. Deprecation

Deprecation is decided in principle and intentionally thin in operation until there is consumer load to justify more. A scoping decision, not an open question.

- **Rule (fixed now):** deprecation is cyclic, never silent. A breaking change is a MAJOR bump with a migration path; the old major line is deprecated through a cycle, not deleted out from under its dependents.
- **Ceremony (scales with load):** the detailed cycle — notice period, migration-path format, end-of-life policy — stays minimal while the corpus has few external dependents, and hardens once a removed major line would strand real consumers. The version graph already identifies exactly who those consumers are (§4).

---

## 7. Open — the inking to-do (torvalds targets)

This is a sketch; these are the questions it must survive before it grounds. Each is a real seam, not a polish item.

1. **Reconcile the suffix pipeline with the existing status grammar — the big one.** [`pressure-testing.md`](../pressure-testing.md) §Status line format already owns a maturity vocabulary (`draft` / `partially resolved` / `grounded on Final Critique N` / `grounded (English) — formal layer pending`). The `-alpha/-beta/-rc/(none)` suffix is a *second* track for the same fact; one must be canonical and the other derive, or they drift. The hard case: `grounded (English) — formal layer pending` separates *prose* maturity from *formal* maturity, but a single linear suffix cannot encode two axes — so either the suffix gains a dimension, or that status maps to a defined `-rc`-ish point by rule.
2. **The `-alpha` bit-flip (§0).** "Structured English exists" must be an unambiguous trigger, or the version's birth moment is fuzzy and "the change is canonical, the version is derived" loses its anchor.
3. **PATCH soundness (§3).** The formal-diff-plus-prose-structural-check rule needs the prose-structural surface defined tightly enough to be partly mechanical (invariant set, action signatures, preconditions, transitions, states).
4. **`-beta` conditional on the formal-layer vote (§3)** — confirm the pipeline reads cleanly for vote-*no* specs that never model.
5. **First-version numbering (§3)** — `1.0.0-alpha → 1.0.0` vs `0.y.z`. Decide.
6. **Pin lower bound (§2)** — `^2.3` vs `2.x`.
7. **Field placement + the `draft` overload (§1)** — a [`spec-format.md`](../spec-format.md) edit.
8. **Single-home for change history (§5)** — Lineage / `changelog.md` / generated version-changelog.
9. **Terminology.** This document's torvalds pass should use the methodology's existing names ("Linus mode" = Pass 3; "Happy Torvalds X2" = the Phase 4 Opus clearance gate), not invent an "Angry Torvalds" — so there are not three Torvaldses.
10. **Migration: retro-version the grounded corpus.** The grounded patterns carry no version yet; adopting this assigns each a starting version (`1.0.0` for grounded) and reconciles the suffix against its current status token. A mechanical sweep (worker-tier model, Opus-gated), best ridden on the scheduled-rescan automation.

---

*This sketch will either ground into canonical direction or go in the trash. While it is pencil, treat §1–6 as the proposed shape and §7 as the reason it is not yet ink.*
