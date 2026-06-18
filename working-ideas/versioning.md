# Versioning — Direction

**Status:** Direction — **fourth confirming fresh-reader re-pass clean, 0 foundational (2026-06-16) → inkable.** Ready to promote to its canonical home (root `versioning.md`, field/grammar pieces folding into [`spec-format.md`](../spec-format.md) and [`pressure-testing.md`](../pressure-testing.md)) and run the residual sweep; four refining findings folded, the rest ride the sweep. The torvalds pass's eleven seams were decided and folded; the confirming re-pass then found the fold had opened a connected cluster (all rooted in conflating versioning's graded axis with the methodology's binary touch-trigger), now resolved by two further decisions — a single `-beta` suffix, and MAJOR-only human classification — plus forced corrections (§7). On a clean re-pass it grounds and moves to its canonical home (a root `versioning.md`, with the field/grammar pieces folding into [`spec-format.md`](../spec-format.md) and [`pressure-testing.md`](../pressure-testing.md)). Until then it stays here in `working-ideas/` and does not yet bind.

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

**Re-entry — content re-passes, presentation does not.** Grounding is one lap, not the end. A change that touches **content, meaning, or dependencies** re-enters the pipeline: a **corrected cross-reference**, a **dependency re-point**, or a **behavioral** MINOR/MAJOR touch-triggers a full re-pass ([`pressure-testing.md`](../pressure-testing.md) §Touch triggers re-pass), downgrading the Status token to `partially resolved` → projecting to `-beta` (§3); the spec re-enters `1.0.0` → `1.x.y-beta` → (clean re-pass, token back to grounded) → `1.x.y`. A **pure rename / render / metadata / version-stamp** is *not an edit* in this sense — nothing to re-validate — so it does **not** re-pass: it stays grounded (a later inert PATCH increments the patch number via the CI/audit step, §5; the v1 bootstrap *mints* `1.0.0`, there being no prior number to increment). The line is **content vs presentation**: a corrected cross-reference changes the meaning graph and dependency interpretation, so it re-passes; a rename touches only the label, so it does not. (`pressure-testing.md`'s touch-trigger gains a pure-presentation exemption — §7 residual e; its content triggers, including corrected cross-reference, are unchanged.) "Grounded ⇔ no pre-release suffix" holds at every moment.

```
   sketch            →   spec exists           →   grounded
   (pencil, no ver)      1.0.0-beta   (wet)         1.0.0   (dry)
   working-ideas/        atoms/ | compositions/
   dated free-text       version is identity; "when" → changelog (§5)

   re-enter (cross-ref / re-point / MINOR / MAJOR):  1.0.0 --> 1.x.y-beta --> 1.x.y      inert (rename/render/metadata):  1.0.0 --> 1.0.1  (grounded)
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

**Grounded is machine-checkable:** grounded ⇔ no pre-release suffix ⇔ the Status token is a fully-grounded form. A spec is born at `1.0.0-beta` (the bit-flip, §0) and **first grounds at `1.0.0`** (suffix dropped); numbers begin bumping only on changes after it (re-entry, §0). Whether a change re-enters `-beta` follows the content-vs-presentation line (§0), not the version level: a content change — corrected cross-reference, dependency re-point, or behavioral MINOR/MAJOR — re-enters `-beta`; a pure-presentation PATCH (rename / render / metadata) stays grounded, bumping only the number. (The linter's coarse `grounded` flag matches any `grounded…` token — used only for forthcoming / model-present checks — and is *not* this layer's *fully-grounded* predicate.)

### Build metadata

`+build` is the only place a literal datestamp may appear *in the version string* (e.g. `1.2.0+20260616`); never affects precedence, not used by default, and never a substitute for the changelog timestamp or the Status token's date (§5).

---

## 4. Propagation — this *is* the constituent-change cascade

A MAJOR on a node forces re-examination of everything downstream: every composition referencing the atom, every composition naming the substrate composition, and every local extension pinned to it.

This is the cascade [`pressure-testing.md`](../pressure-testing.md) §Constituent-change cascade **already defines** — a *breaking* constituent change triggers a touch-triggered re-pass on every grounded composition naming it; an *additive* change does not (the "all invariants from [Atom]" reference form is forward-compatible). A **MAJOR** is exactly the breaking change that populates a blast radius; a **MINOR** is the additive change whose blast radius is empty by construction. Versioning adds no second mechanism — it *names* the existing one and reads its trigger off the version graph. A forced re-examination that finds the downstream still compatible re-pins (e.g. `^2.3` → `^3.0`) and re-passes, bumping the downstream's own version only if *its* behavior changed.

---

## 5. Audit as the version source

A change to a spec triggers an audit; the audit *classifies* the change, and the classification **is** the version bump. An **inert change** (pure rename / render / metadata / the v1 stamp) does not re-pass — its bump is emitted by a **CI/audit step** (a forthcoming capability, to be declared in `pressure-testing.md` — §7 residual d), the spec staying grounded. Anything that **re-enters the pipeline** — a corrected cross-reference, a dependency re-point, or a behavioral MINOR/MAJOR — is emitted by the **re-pass round's consolidate step** ([`pressure-testing.md`](../pressure-testing.md) §The default executor). A **scheduled rescan that closes clean** emits *no* bump — the spec was already grounded and ratcheting confidence does not change its identity; the version stays put (the Status-token date updates, per the methodology, but no `+build` is minted). (Both emitter steps are capabilities to declare in `pressure-testing.md`; see §7.) Every audit produces three things:

1. **A version bump** — PATCH auto-classifies off the formal diff *plus* the prose-structural surface (§3); the council proposes MINOR; **only MAJOR, and genuinely ambiguous cases, need a human** — councils conduct, humans triage.
2. **A changelog entry** — `unit · old → new · level · what changed · timestamp`. Generated by whichever step emits the bump (the CI/audit step for an inert PATCH, the consolidate step for a re-entering change), never hand-maintained, so it cannot drift.
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
| 2 | Subsequent-change re-entry | A content / dependency / behavioral change re-enters via the `partially resolved` token → `1.x.y-beta → 1.x.y`; pure presentation does not (§0). |
| 3 | Audit runner / classifier | Re-entering changes emit from the re-pass consolidate step, inert PATCHes from a named CI/audit step; PATCH auto, council proposes MINOR, **only MAJOR + ambiguity need a human** (§5). |
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
- **Forced corrections:** a MINOR/MAJOR bump is emitted by the re-pass round it triggers, a PATCH directly by the audit (§5); re-entry runs through the `partially resolved` token on a MINOR/MAJOR (§0); **a PATCH — render / rename / metadata — does *not* re-pass: it bumps the number and stays grounded**, establishing that a rename / render / metadata change does not re-pass — *refined in round 3 below: the exemption is **presentation-only**; a corrected cross-reference is content and re-passes* (residual e); plus refining fixes (seal-pins-bytes / PATCH-re-seals / pre-release-unsealed §1; visibility flips at grounding §1; substantive-invariant + composition bit-flip §0; the `+build` datestamp note §3).

**Confirming re-pass — fresh-reader Opus, 2026-06-16 (round 3).** Re-confirmed the spine and the `-beta` biconditional, and caught that the round-2 touch-trigger correction **overreached** — it lumped a *corrected cross-reference* into the no-re-pass bucket, but the methodology deliberately re-passes a corrected cross-reference (it re-points a dependency — load-bearing, Pass-1 territory), and that trigger underpins the single-document decline-argument in `pressure-testing.md` §The methodology applied to itself. Resolved by the **content-vs-presentation boundary**: pure rename / render / metadata / version-stamp → no re-pass; corrected cross-reference, dependency re-point, behavioral change → re-pass (§0). With that line, **F2** (a clean scheduled rescan emits no bump; the version stays put — §5) and **F3** (re-entering changes emit from the consolidate step, inert PATCHes from a named CI/audit step; the §5 changelog-executor split is fixed) both fall out.

**Confirming re-pass — fresh-reader Opus, 2026-06-16 (round 4) — CLEAN.** Verified the content-vs-presentation boundary coheres across §0/§3/§5/§7, the `-beta` biconditional and the spine hold against all sources, and the recurring fix-opens-a-seam failure did **not** materially recur — the one place it could (the inert-PATCH emitter) the doc already deferred honestly. **Verdict: inkable, 0 foundational.** Four refining findings, folded: F1 — §5 calls the CI/audit emitter a *forthcoming* capability (matching residual d), not an existing step; F2 — a clean rescan updates the Status-token date but mints no `+build` (§5); F3 — the v1 bootstrap *mints* `1.0.0` while a later inert edit *increments* (§0); F4 — a note that the linter's coarse `grounded` flag is not this layer's *fully-grounded* predicate (§3).

**Mechanical residuals** (to *build*, not decide): (a) the **stale-pin lint check** — flag a `local` extension whose pinned major line was superseded or deprecated; the CI analog of `D-stale-forthcoming`, enforcing §4. (b) **Align `contributing.md`** — alias its *Proposal* to **sketch** so the corpus uses one word. (c) The **retro-version migration sweep** — stamp each grounded pattern `1.0.0` (plus Visibility `published`, Scope `universal`, and its seal) by projecting its Status token through §3's table; worker-tier, Opus-gated. The bootstrap is a metadata stamp, **not** a behavioral edit, so it does not touch-trigger a re-pass — a name/version label is not an edit. (d) **Declare the two bump-emitter steps** in `pressure-testing.md` — the re-pass consolidate step (re-entering changes) and a CI/audit step (inert PATCHes); neither capability is granted there yet (capability provenance). (e) **Add a pure-presentation exemption to `pressure-testing.md`'s touch-trigger** — a rename / render / metadata stamp / version label does not re-pass; the *content* triggers, including corrected cross-reference and editorial corrections that re-point a dependency, are unchanged and still re-pass.

---

*Fourth re-pass clean (0 foundational) — **inkable**. Inking = promote to a root `versioning.md`, fold the field/grammar pieces into `spec-format.md` and `pressure-testing.md`, and run the residuals worker-tier. Four refining fixes folded; the rest ride the sweep.*
