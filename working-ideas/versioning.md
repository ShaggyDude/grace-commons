# Versioning — Direction

**Status:** Direction — **decisions resolved (2026-06-16); awaiting a confirming fresh-reader re-pass before it grounds.** The eleven seams the torvalds pass surfaced (§7) have been decided and folded into §1–6; §7 now records the decisions and the mechanical residuals. On a clean re-pass it grounds and moves to its canonical home (a root `versioning.md`, with the field/grammar pieces folding into [`spec-format.md`](../spec-format.md) and [`pressure-testing.md`](../pressure-testing.md)). Until then it stays here in `working-ideas/` and does not yet bind.

**Covers:** how every spec is versioned, how versions relate across the graph, how the audit produces them, and where the *pre-spec* (sketch) stage hands off to the version pipeline.

---

## Principles

1. **Invent as little as possible.** Versioning is [SemVer 2.0.0](https://semver.org) adopted whole. This document defines no new scheme; it states what SemVer's existing levels and stages *mean* for a behavioral spec, which is derived-from / refined-against, not called.
2. **The change is canonical; the version is derived.** A version is not metadata applied after the fact. It is the output of the audit the change triggers (§5) — the same spine as *code is a derived artifact; the spec is canonical*, lifted one level.
3. **One unit, one version.** Each atom and each composition versions on its own behavior. Nothing versions the corpus as a whole.

> Clean per-unit versioning is what lets the corpus be addressed by, and interoperate with, external knowledge-base and semantic systems — and replaced by the corpus later, if desired. That payoff depends on the version being precise and local.

---

## 0. Lifecycle — pencil, ink, dry

Versioning governs *specs*, not *ideas*. The stage before a spec exists is the **sketch**: a pre-spec idea, in pencil, dated free-text in `working-ideas/` — the stage [`contributing.md`](../contributing.md) currently calls *Proposal* (aligned to one word; §7). Most sketches go in the trash; that is the expected outcome. A sketch carries no version — there is nothing to version yet.

A sketch that clears Gate 3 ([`pressure-testing.md`](../pressure-testing.md) §the three gates) **earns a spec**. The pencil goes to ink and the **version is born at `-alpha`** the moment the spec exists — defined crisply (the bit-flip): **structured English exists when the file carries an Intent and at least one Invariant, not merely an empty template.** It stays "wet" through `-alpha → -beta → -rc` (revisable, no number bumps — pre-release is unstable by SemVer) and **dries at `1.0.0`** — grounded, in the canon.

**Re-entry.** Grounding is not the end of the pipeline; it is one lap of it. Any later edit to a grounded spec **re-enters** the pipeline — `1.0.0` → `1.1.0-alpha → … → 1.1.0` — because the methodology touch-triggers a full re-pass on every edit to a grounded pattern ([`pressure-testing.md`](../pressure-testing.md) §Touch triggers re-pass). The suffix drops again only when that re-pass closes clean. So "grounded ⇔ no pre-release suffix" holds at every moment, first grounding and every re-pass after.

```
   sketch            →   draft spec            →   grounded
   (pencil, no ver)      -alpha → -beta → -rc       1.0.0
   working-ideas/        atoms/ | compositions/
   dated free-text       version is identity; "when" → changelog (§5)

   re-entry:  1.0.0  --edit-->  1.1.0-alpha → -beta → -rc  -->  1.1.0
```

---

## 1. Spec fields

Every **spec** (not a sketch) carries three fields, recorded in **spec metadata / frontmatter** (git tags are *publication* artifacts, not the canonical home — §5).

| Field | Axis | Values | Answers |
|---|---|---|---|
| **Visibility** | distribution | `draft` · `published` · `deprecated` | Is it in the public corpus? |
| **Scope** | semantic | `universal` · `local` | Shared commons, or local to one org? |
| **Version** | identity | SemVer string (§3) | Which one, and what changed? |

Scope and Visibility are independent (a `universal` spec can be `draft`; a `local` spec can be `published`). Version and Visibility are *correlated*, not free — an `-alpha` spec is effectively never `published` — so treat the table as three axes with a sparse reachable-state product, not three fully-orthogonal dials.

**Two identities, complementary (not competing).** The **Version** is the spec's *semantic* identity — which one, and what changed. [`governance.md`](../governance.md)'s content-hash **seal** is the *cryptographic* identity of a specific reviewed artifact at that version — the tamper-proof fingerprint of the exact bytes that were reviewed. Every grounded version is sealed; the version names it, the seal pins it. A new grounded version takes a new seal; "pin to a sealed version" (governance) means pin the `(version, seal)` pair.

---

## 2. Versioning unit: the version graph

- **The atom is the unit.** An atom versions on changes to its own behavior. The corpus is never versioned as a whole — that would bump unrelated atoms (a Retention change forcing a new Consent) and re-introduce the coupling the corpus exists to remove.
- **Compositions version independently.** A composition carries its own version; changing it never bumps the atoms it relates. The thing versioned is a **graph**: atoms and compositions as nodes, *references* as edges, each node versioned on its own behavior. Edges point at versioned nodes — **including composition→composition edges** (a composition naming a substrate composition, e.g. Defensible Retention → Audit Trail) — so it is not a clean atoms-nodes / compositions-edges bipartite split.
- **Extensions pin with a caret.** A `local` extension names the *versioned* universal spec it extends and, where it relies on a relationship, the *versioned* composition too. The pin is a **caret range — `^2.3` (`>=2.3.0 <3.0.0`)**, not `2.x`: if the extension relies on a feature added in a MINOR, it is not safe below that minor, and the pin must say so. It MUST name every dependency it actually has.

---

## 3. The version string

`MAJOR.MINOR.PATCH[-prerelease][+build]` — standard SemVer. The numbers say *what the behavior is*; the pre-release suffix says *how far through grounding it is*. Orthogonal: hardening `alpha → beta` never bumps the numbers.

### Numbers — defined behaviorally

| Level | Meaning for a spec | Examples |
|---|---|---|
| **MAJOR** | Removes or constrains. A previously-legal operation becomes illegal, or a previously-derived artifact becomes wrong. | Removed state; added or tightened precondition; removed or restricted transition; an optional field made required; a narrowed permission. |
| **MINOR** | Adds without constraining. Backward-compatible — everything that validated before still validates. | New optional state; a new transition that doesn't constrain existing ones; a widened permission. |
| **PATCH** | No behavioral change. Render, prose, or comment only. | Reworded structured English; clarified note; fixed typo. |

MAJOR's definition is load-bearing: the seam pin (§2) and the propagation cascade (§4) treat MAJOR as the only level that forces downstream re-examination. MAJOR means exactly *"this can break something downstream."*

**Classifying PATCH — pinned to a concrete surface.** Diff the formal artifact (Alloy / TLA+) first; if it changed, the change is MINOR or MAJOR. But formal-byte-identical does **not** by itself prove PATCH — the formal model is a *partial* oracle (every coverage matrix lists invariants it doesn't model). So:

> **PATCH** = formal artifact byte-identical (where one exists) **AND** no change to any **invariant, action signature, precondition, state, transition, or permission** in the prose. For vote-*no* (English-only) specs, that prose-structural surface — the numbered Invariant headers, the action-signature lines, the named states/transitions/permissions — stands alone. Only then may the audit auto-classify (§5).

### Pre-release suffix — a *derived projection* of the status grammar

The suffix is **not** a second maturity track. The canonical maturity vocabulary is the CI-pinned Status grammar ([`pressure-testing.md`](../pressure-testing.md) §Status line format; the SSOT decision is [`open-questions.md`](../open-questions.md) §Status-line grammar, which pinned *one* grammar and CI-linted it to end six competing shapes). **The Status token is canonical; the suffix is read off it** — a lossy projection for the version string's convenience, never a competitor:

| Status token (canonical) | → suffix (derived) |
|---|---|
| *(sketch — pre-spec)* | no version |
| `draft` (Intent + ≥1 Invariant; no model) | `-alpha` |
| modeled, not yet pressure-tested (vote-*yes* only) | `-beta` |
| `partially resolved` / cleared the passes, awaiting Phase 4 | `-rc` |
| `grounded on Final Critique N` | *(none)* — `1.0.0` first time |
| `grounded (English) — formal layer pending` | *(none, with the formal qualifier carried by the **token**, not the suffix)* |
| `grounded — <named item> pending` | *(none, qualifier on the token)* |

Because the token carries states a single linear suffix cannot (formal-pending; a bounded `<named item> pending`), the **token is consulted for those finer facts**; the suffix only ever answers "pre-release or not." `-beta` is conditional on the formal-layer vote being *yes* (a vote-*no* spec grounds English-only and never has one).

**Grounded is machine-checkable:** a spec is grounded iff its version has no pre-release suffix — which, since the suffix is derived, is true iff its Status token is a grounded form. **First grounding is `1.0.0`**; numbers begin bumping only on changes after it (re-entry, §0).

### Build metadata

`+build` is the only place a literal datestamp may appear *in the version string* (e.g. `1.2.0+20260616`); never affects precedence, not used by default. (This scopes the version string only — the canonical Status token still carries its mandated `YYYY-MM-DD`, §5.)

---

## 4. Propagation — this *is* the constituent-change cascade

A MAJOR on a node forces re-examination of everything downstream: every composition referencing the atom, every composition naming the substrate composition, and every local extension pinned to it.

This is the cascade [`pressure-testing.md`](../pressure-testing.md) §Constituent-change cascade **already defines** — a *breaking* constituent change triggers a touch-triggered re-pass on every grounded composition naming it; an *additive* change does not (the "all invariants from [Atom]" reference form is forward-compatible). A **MAJOR** is exactly the breaking change that populates a blast radius; a **MINOR** is the additive change whose blast radius is empty by construction. Versioning adds no second mechanism — it *names* the existing one and reads its trigger off the version graph. A forced re-examination that finds the downstream still compatible re-pins (e.g. `^2.3` → `^3.0`) and re-passes, bumping the downstream's own version only if *its* behavior changed.

---

## 5. Audit as the version source

A change to a spec triggers an audit; the audit *classifies* the change, and the classification **is** the version bump. **The scheduled-rescan automated council emits the bump** as part of its consolidate step ([`pressure-testing.md`](../pressure-testing.md) §The default executor) — not an unnamed manual step. Every audit produces three things:

1. **A version bump** — PATCH auto-classifies off the formal diff *plus* the prose-structural surface (§3); **MINOR vs MAJOR is a human classification** (the irreducible triage judgment — *humans triage, councils conduct*).
2. **A changelog entry** — `unit · old → new · level · what changed · timestamp`. Generated by the council's consolidate step, never hand-maintained, so it cannot drift.
3. **A blast-radius list** — every downstream artifact flagged for re-examination (§4), read off the version graph. Empty for PATCH and MINOR by construction; populated only on MAJOR.

**Datestamps: the changelog and the Status token, nowhere else in the version string.** "When" is the changelog timestamp (a fact about a release) and the date mandated inside the canonical Status token (`grounded on Final Critique N — YYYY-MM-DD`). The version string carries no datestamp except `+build`. Date-stamped *identifiers* are removed from spec text — the version graph is the system of record for identity, the changelog for history. The Version and the seal both live in **frontmatter**; git tags are publication artifacts, not canonical.

---

## 6. Deprecation

- **Cyclic, never silent.** A breaking change is a MAJOR bump with a migration path; the old major line is deprecated through a cycle, not deleted out from under its dependents.
- **A MAJOR on a *universal* spec requires governance sign-off** ([`governance.md`](../governance.md)); a migration path alone is insufficient, because a breaking change to a shared commons spec can strand consumers the org-local case cannot. (A MAJOR on a `local` spec needs no commons governance.) The version graph already identifies exactly who the consumers are (§4).
- **Ceremony scales with load.** The detailed cycle — notice period, migration-path format, end-of-life policy — stays minimal while the corpus has few external dependents, and hardens once a removed major line would strand real consumers.

---

## 7. Resolved (2026-06-16) — decisions folded, residuals, and the torvalds trail

The eleven seams the torvalds pass raised were decided and folded into §1–6. The record:

| # | Seam | Decision (folded into) |
|---|---|---|
| 1 | Suffix vs. status grammar | Status grammar is canonical; the suffix is a **derived projection** of the token (§3). |
| 2 | Subsequent-change re-entry | Any edit to a grounded spec **re-enters** the pipeline — `1.1.0-alpha → … → 1.1.0` (§0). |
| 3 | Audit runner / classifier | The **scheduled-rescan council emits** the bump; **humans classify MINOR vs MAJOR** (§5). |
| 4 | Seal vs. version identity | Version = **semantic** identity; seal = **cryptographic** identity of a reviewed artifact version; complementary (§1, §5). |
| 5 | Lifecycle word | Use **sketch** for the pre-spec stage (the pencil metaphor; already half-adopted via "gate-sketched") and align `contributing.md`'s *Proposal* to it (§0). |
| 6 | First-version numbering | `1.0.0-alpha → 1.0.0` (§3). |
| 7 | The `-alpha` bit-flip | A spec exists at **Intent + ≥1 Invariant**, not an empty template (§0). |
| 8 | PATCH surface | No change to invariants, action signatures, preconditions, states, transitions, or permissions (§3). |
| 9 | Pin lower bound | Caret **`^2.3`**, not `2.x` (§2). |
| 10 | Version provenance | Version and seal live in **frontmatter**; git tags are publication artifacts (§1, §5). |
| 11 | Universal MAJOR | Requires **governance sign-off** ([`governance.md`](../governance.md)); migration path alone insufficient (§6). |

**Mechanical residuals** (to *build*, not decide): (a) the **stale-pin lint check** — flag a `local` extension whose pinned major line was superseded or deprecated; the CI analog of `D-stale-forthcoming`, enforcing §4. (b) **Align `contributing.md`**: the pre-spec stage is **sketch** — rename or alias its *Proposal* so the corpus uses one word. (c) The **retro-version migration sweep** — assign each grounded pattern a starting version (`1.0.0`) by projecting its current Status token through §3's table; a worker-tier sweep, Opus-gated, ridden on the scheduled-rescan automation.

**Torvalds pass — fresh-reader Opus, 2026-06-16 (history).** A fresh reader ran a hard X2 adversarial pass and confirmed the spine sound (SemVer-whole, version-as-derived-artifact, per-unit versioning, MAJOR-drives-the-cascade, the PATCH partial-oracle catch), while surfacing that the original sketch documented the *entry* into versioning and rationalized past the *steady state*. Its three foundational catches — subsequent-change re-entry, the audit runner, and the seal-vs-version identity — are resolved above (#2, #3, #4). It also corrected two author errors since fixed: the datestamp claim (the Status token mandates a date) and the orthogonality overstatement (Version and Visibility are correlated). Its single highest-leverage instruction — subordinate the suffix to the pinned grammar — is decision #1.

---

*Decisions resolved; the next gate is a confirming fresh-reader re-pass on this resolved version. On a clean pass it inks fully — moves to a root `versioning.md`, the field/grammar pieces fold into `spec-format.md` and `pressure-testing.md`, and the residuals above run as a worker-tier sweep.*
