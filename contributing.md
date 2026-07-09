---
title: Contributing
nav_order: 1
parent: Community
has_toc: true
toc: true
---

# Contributing to Grace Commons

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


Grace Commons is early but stable (as of mid-June 2026). The pattern library is being built. This is the right time to help establish the structure — before conventions calcify and before the easy decisions get made by default.

---

## What we need right now

**Pattern proposals.** If you recognize a business logic pattern that recurs across domains and belongs in a shared library, we want to know about it. A pattern proposal does not need to be complete — a name, a brief description, and one or two examples from different domains is enough to start.

**Domain expertise.** The patterns that matter most are the ones that appear in regulated industries with formal standards behind them — healthcare, finance, logistics, government. If you work in one of these domains and recognize the problem this library is trying to solve, your knowledge of what the standards actually say is directly valuable.

**Honest criticism.** The architectural philosophy is in `the-spec-layer.md`. If you think it is wrong in ways that matter, say so. The most useful response is the honest one.

---

## Atoms vs. compositions

Grace Commons distinguishes **atoms** from **compositions**.

The test: does the contribution's specification name another atom? If no, it's an atom — store it flat as `atoms/<name>.md`. If yes, it's a composition — file it under `compositions/`.

Atoms are freestanding: state, actions, and operational principles independent of every other atom. Personal Todo, Duplicate Prevention, Event Log.

Compositions wire two or more atoms together with composition logic. Audit Trail (Event Log + retention + tamper-evidence + actor identity), Shared Todo (Personal Todo + Permissions + Assignment), Idempotent Reservation (Provisional Commitment + Duplicate Prevention).

If you are not sure which side your contribution falls on, open an issue. The overhead of a conversation is lower than the overhead of placing it in the wrong folder.

---

## What an atom looks like

A pattern spec lives flat in `atoms/` as `atoms/<name>.md` — classification is derived from the composition graph, not a folder (see [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)). It is a structured natural language document, not code — because plain English is the form that includes every reader at once: business stakeholders, auditors, engineers, AI systems, future contributors. Inherit anything good from any source (formal-methods notation, ISO/IEEE standards, BDD, decision tables, design-by-contract, ADR templates, requirements-engineering identifiers); the output form is consistent. At minimum the spec should define:

- **Name** — clear, domain-neutral where possible
- **Intent** — what business need does this pattern address
- **Structure** — the logical shape: inputs, outputs, invariants, states
- **Examples** — the same pattern appearing in at least two different domains
- **Edge cases** — what the pattern does not cover, or where it breaks down
- **Standards references** — where relevant, anchors to ISO, IEEE, domain standards

Atoms do not need to be complete to be submitted. An incomplete atom with honest gaps marked as open decisions is more useful than a polished one with hidden assumptions.

### Additional sections for regulated atoms

Atoms operating in regulated domains carry two further sections beyond the base shape. Both emerged as Pass 3 findings on the first regulated atom in the library ([Provisional Commitment](./atoms/provisional-commitment.md)) and have since stabilized as required conventions for any atom — or composition built on one — whose acceptance bar is set by an external evaluator rather than an internal user. The full convention — what each adversarial read must show, and how the records-alone bar is cleared — is owned by [`pressure-testing.md`](./pressure-testing.md) §Regulated-pattern conventions, and the section shapes by [`spec-format.md`](./spec-format.md) §Regulated overlay; what follows is a contributor's orientation.

- **Regulated adversarial scenarios** — an `Examples` subsection walking the three reads external evaluators actually perform: *regulator audit*, *disputed transaction / data-subject request*, and *breach investigation*. (Worked examples: Provisional Commitment; [Actor Identity](./atoms/actor-identity.md).) **Required** for atoms carrying the regulated overlay and for atoms whose examples invoke regulated domains.
- **Generation acceptance** — a standalone section naming what a derived implementation must produce, judged *from the records alone* — the regulator's question (*"can you prove no commitment was confirmed after its declared window?"*), not the developer's intuition. **Required** for any atom or composition whose acceptance bar is set by an external evaluator (regulators, auditors, integration partners); optional for productivity primitives whose bar reduces to *the invariants hold and rejections surface*.

Both conventions also apply to compositions that compose regulated atoms. [Idempotent Reservation](./compositions/idempotent-reservation.md) is the worked composition example carrying both.

For non-regulated primitives (Personal Todo, Event Log, Duplicate Prevention), these sections are optional and often over-specification — Personal Todo's adversarial scenarios would be contrived, and its Generation acceptance bar reduces to *"the invariants hold and rejections surface."* Use judgment; the test is whether an external evaluator with no developer access would have a meaningfully different verification surface from the atom's existing structure.

---

## What a composition looks like

A composition spec lives directly in `compositions/` (no subdirectories). It declares the atoms it composes and the logic that wires them together. At minimum it should define:

- **Name** — describes the composed result
- **Composes** — the atoms it brings together, by name and link
- **Composition logic** — how the atoms are wired: which actions in one trigger which in another, what policy parameters each atom is configured with, how cross-atom invariants are maintained
- **Composition-level invariants** — invariants that emerge from composition and don't belong to any single constituent
- **Examples** — concrete scenarios showing the composition in action
- **Edge cases** — failure modes that arise from composition, including conflicts between constituent atoms

Compositions are where the architecture is exercised. A reader should be able to verify, from the file alone, that the named atoms could plausibly compose to produce the claimed behavior.

Compositions that compose regulated atoms follow the same *Regulated adversarial scenarios* and *Generation acceptance* conventions as their constituent atoms. The composition's adversarial scenarios exercise the *emergent* invariants — what the composition guarantees that no single constituent does — and the composition's Generation acceptance bar adds checks that span the constituents (e.g., the token-to-commitment mapping in Idempotent Reservation). See [Idempotent Reservation](./compositions/idempotent-reservation.md) for the worked example.

---

## Verification layers

A Grace Commons spec participates in three distinct verification layers. Each catches a different class of defect at a different point in a pattern's lifecycle. None substitutes for the others.

**Layer 1 — Structured English and decision constructs (specification time).** The spec itself is the first verification layer. Structured natural language with explicit invariants, named rejection reasons, defended-in-line architectural decisions, and complete action signatures catches the class of defect that comes from ambiguity and incompleteness — the underspecified edge case, the invariant that has no corresponding action, the rejection reason with no name. Decision tables and decision trees may be embedded inline wherever conditional logic is complex enough to benefit from structured presentation. These constructs are self-explanatory and require no prose commentary beyond what the surrounding spec provides — they are the one class of structured construct that can appear without a human-readable gloss alongside it.

**Layer 2 — Formal models (design time).** Alloy and TLA+ catch the class of defect that structured language cannot: unknown unknowns — structural properties or behavioral sequences that no reviewer thought to probe. A three-pass review catches what a careful reader notices; a formal model catches what nobody thought to ask. Alloy checks valid-state invariants via bounded exhaustive search; TLA+ checks operation-sequence properties via model checking. Both run at design time, before any implementation exists. The Alloy model for Attributed Permissions Admin found a missing invariant that sixteen prose-review findings missed. See *Formal-model artifacts* below for conventions.

**Layer 3 — Property-based and exhaustive tests (implementation time).** Once a spec is compiled to running code via the Execution Contract, the spec's invariants become checkable properties in a property-based testing framework (Hypothesis, fast-check, QuickCheck). The framework generates and exhausts the input space against the stated properties, verifying that the implementation satisfies every invariant the spec declares. This layer does not live in the spec library — Grace Commons defers implementations — but it belongs in the pipeline that derives implementations from specs. The verification harness is derived directly from the Generation acceptance bar and the composition-level invariants. This approach has been demonstrated in practice; it is not yet codified as a formal convention in this library.

These three layers are the full verification stack. The spec is canonical; the formal model checks it before implementation; the property tests verify the implementation against it. The governing principle is the *minimum-formalism principle* in `the-spec-layer.md`: plain English by default, formalism introduced only when irreducible complexity requires it, high-logic tooling always under the hood.

---

## Formal-model artifacts

Formal-model artifacts (Layer 2 above) are recognized companion artifacts to any Grace Commons spec. Whether one is a *prerequisite* for `grounded` is decided per pattern by the **formal-layer vote** (see [`pressure-testing.md`](./pressure-testing.md) §Formal models — The formal-layer vote): a pattern carrying load-bearing temporal, ordering, concurrency, or safety claims votes *yes*, and its derived model must exist and verify before the pattern reaches unqualified `grounded` (until then it is `grounded (English) — formal layer pending`); a pattern without such claims votes *no* and grounds English-only under the minimum-formalism principle. When a model exists it is a first-class artifact with its own conventions.

**Recognized tools.** Alloy and TLA+ are the current recognized tools. Alloy (relational, bounded exhaustive model finder) is the right first choice for structural invariant checking — valid states, structural properties, reachability. TLA+ (temporal/behavioral model checker) is the right choice for operation-sequence properties — does a sequence of actions preserve invariants, are there liveness or fairness questions. Other tools may be added as the library grows.

**Value.** Both tools generate checks rather than tests. The distinction matters: a test says "it worked for the cases I tried"; a model check says "there is no counterexample within scope N." This provides coverage of the unknown unknowns — the structural gaps no reviewer thought to probe — and is categorically stronger than any prose review.

**Location convention.** Formal artifacts live as sibling files alongside their spec, sharing the same base name with a tool-appropriate extension:

- `atoms/actor-identity.md` → `atoms/actor-identity.als`, `atoms/actor-identity.tla` (+ `actor-identity.cfg` for the model checker)
- `compositions/attributed-permissions-admin.md` → `compositions/attributed-permissions-admin.als`, `compositions/attributed-permissions-admin.tla` (+ `attributed-permissions-admin.cfg`)

Same directory, same base name, different extension — kebab-case for every file type. The extension identifies the tool; the naming makes the relationship self-evident without subdirectories. (Subdirectories are avoided because they interfere with Jekyll HTML generation from `.md` files.)

**TLA+ filename rule (superseded 2026-06-14 — kebab-case is canonical).** Standard TLA+ tooling (SANY, the parser) requires a `.tla` file to declare `MODULE <name>` matching its basename exactly, and TLA+ identifiers cannot contain hyphens — which originally forced `.tla` / `.cfg` filenames to lower-camelCase as the one exception to base-name sharing (see [`discoveries.md`](./discoveries.md) §2026-05-23). That trade is retired: canonical `.tla` and `.cfg` files are kebab-case like every other artifact. The repo's harness checker tolerates hyphenated module names, so the kebab file runs in-harness as-is; for standard-TLC runs, [`tools/harness/tla-adapter.mjs`](./tools/harness/tla-adapter.mjs) derives a TLC-valid camelCase copy on demand (rewriting the `MODULE` line; output in git-ignored `build-tlc/`). The TLC-facing name is a derived artifact, never a hand-maintained variant — derive-don't-lag, applied to filenames. See [`discoveries.md`](./discoveries.md) §2026-06-14 for the supersession record.

**Tier discipline.** Formal artifacts are *spec-layer* artifacts. They live in the same tier as their canonical `.md` (`atoms/` for atoms, `compositions/` for compositions). They do not live in `demos/`, build-tier folders, POC subdirectories, or anywhere else downstream of the spec. The spec is canonical; the formal model validates the spec; both belong on the canonical side of the spec-versus-build line. A formal model that lives under a specific implementation's folder implicitly claims the implementation as its referent — which inverts SSOT, treats one build as the canonical artifact, and walls off other builds. Build-tier tooling (TLC runners, CI integration, build-specific harnesses) may live in implementation folders or in a top-level `tools/` location; the canonical `.tla`/`.als`/`.cfg` files do not.

**TLA+ flavor.** Base TLA+ is the default. Each action expressed as an atomic predicate matches the structured-English spec's §Action wiring directly — one action, one conjunction, line-by-line mappable to the spec. PlusCal is reserved for compositions where the load-bearing race lives *inside* a single action (multi-step protocols, intra-action asynchronous message ordering) and the imperative-with-labels style genuinely earns its keep. When PlusCal is used, the choice is defended in the Lineage entry naming the model — *Principle, Likely objection, Mechanism, Result* — the same four-step rubric every other architectural claim in the library is held to.

**Human-readability requirement.** Every formal construct — every `sig`, `fact`, `assert`, `check`, `pred`, `run` in Alloy; every definition, invariant, and property in TLA+ — MUST be accompanied by a prose comment legible to a reader who does not know the tool. The comment should explain what the construct is checking and why it matters, not just restate the syntax. A formal artifact that requires tool expertise to interpret is a wall; one with plain-English commentary alongside every construct is a bridge. The bridge is the standard. See `compositions/attributed-permissions-admin.als` and `compositions/attributed-permissions-admin.tla` for the reference examples.

**Lineage recording.** Findings from formal models are recorded in the spec's Lineage notes under a *Formal model* entry, following the same pattern as Pass 1–3 findings. Each entry MUST carry enough plain-English summary that a reader who does not know the tool can read the Lineage entry alone and know what the model contributes: the artifact's location, what invariants it checks (named, not by syntax), the bounds used (for TLC) or scope (for Alloy), any deliberate scope exclusions and why, and the result. The artifact-level commentary requirement above governs the `.tla` and `.als` files; this Lineage-entry requirement governs the canonical `.md` text. The two together discharge the *minimum-formalism principle*'s accessibility contract — the formal layer is free to use the most expressive tool that earns its keep precisely because the canonical English carries the bridge to every other reader.

---

## Three perspectives

Grace Commons needs three mindsets in the core review of every pattern, not in separate committees:

- **Rigor (academic perspective).** Pressure-tests the formal properties. Catches missing invariants, incomplete state transitions, hand-waved decision logic.
- **Clarity (design perspective).** Forces brutal readability. Catches jargon, hidden ambiguity, structural opacity to non-specialists.
- **Implementability (engineering perspective).** Proves the pattern can produce working code. Catches under-specified primitives, missing edge cases, and the *"this never happens in production"* assumption.

All three must touch every pattern before it is considered `grounded`. The classic failure mode in projects like this is one perspective dominating: papers nobody reads, beautiful designs nobody can build, pragmatic code that drifts from intent within a quarter.

**The hard rule:** *No pattern is accepted until a non-engineer can understand the summary and a working engineer can implement from it.* Both halves matter. A pattern that fails the first is too jargon-heavy; one that fails the second is too abstract.

The three perspectives complement the three-pass pressure-testing methodology described below. Perspectives are *who* reviews; passes are *what* they check. Both are needed.

---

## The quality bar

Every Grace Commons pattern — atom or composition — is reviewed through three passes, each catching a different class of gap:

- **Pass 1 — Structural completeness (GRID — the nine-checkpoint completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Are all nine GRID nodes resolved with their references intact?
- **Pass 2 — Conceptual independence (EOS — *The Essence of Software*, Daniel Jackson's framework of freestanding, composable concepts).** Does the spec absorb any responsibility that belongs in a separate freestanding atom?
- **Pass 3 — Adversarial scrutiny (Linus mode — named for Linus Torvalds's blunt, unsparing code reviews).** Are there muddled identities, sloppy invariants, happy-path-only examples, or hidden load-bearing decisions?

Each pass catches a different class of gap; none substitutes for the others. One clean sweep of the three is not grounding. The full bar is a **3×3 baseline** — three rounds of the three passes, nine passes — followed by a **Final Critique**, an AI-conducted adversarial round run at Opus *Happy Torvalds X2* depth and repeated until foundational findings reach zero, plus the **formal-layer vote** (and, where it votes *yes*, a verifying derived model). See [`pressure-testing.md`](./pressure-testing.md) for the full methodology and [`atoms/personal-todo.md`](./atoms/personal-todo.md) for a worked example whose Lineage notes record the arc.

A pattern that has only survived part of that arc is *in process* — and that is a respectable state, provided the actual state is declared honestly per the status taxonomy (`unresolved`, `partially resolved`, `grounded (English) — formal layer pending`, `grounded`).

---

## What we are not looking for right now

- Code implementations
- Framework integrations
- Language bindings

Grace Commons is a specification library. The implementations come later, elsewhere. Formal-model artifacts (Alloy, TLA+) are not code in this sense — they are formal specifications, not implementations, and they are welcome per the *Formal-model artifacts* section above.

---

## Contribution lifecycle

A pattern moves through four states: **Proposal** (an issue describing the recurring pattern) → **Draft** (a first spec, almost certainly `unresolved` or `partially resolved`) → **Pressure-tested** (the 3×3 baseline run, gaps fixed or deferred) → **Grounded** (the Final Critique clean — foundational findings at zero — with the formal-layer vote cast and any required model verifying; Lineage notes recorded). The lifecycle is iterative; a `grounded` pattern can return to `partially resolved` if LIVE evidence later contradicts an invariant, or if a touch or scheduled rescan surfaces a finding.

---

## Workflow for adding a new pattern

*(Ownership moved here 2026-06-11 from the session-bootstrap index — now `AGENTS.md`, reached via the `CLAUDE.md` shim.)*

1. **Triage atom vs. composition.** Apply the directory-placement test (does the specification name another pattern?) and confirm against EOS Pass 2. The deeper criterion: does the responsibility have its own state machine, recur across many domains, deserve its own atom?
2. **Identify the closest existing pattern.** Read it carefully; mirror its shape, vocabulary, and conventions. [Actor Identity](./atoms/actor-identity.md) and [Retention Window](./atoms/retention-window.md) are the references for new regulated atoms; [Personal Todo](./atoms/personal-todo.md) is the reference for productivity primitives; [Idempotent Reservation](./compositions/idempotent-reservation.md) and [Audit Trail](./compositions/audit-trail.md) are the references for compositions.
3. **Draft.** For regulated atoms or compositions that compose them, bake in *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, and honor the cross-cutting authoring conventions owned by [`spec-format.md`](./spec-format.md) §Cross-cutting authoring conventions (identity model and action signatures explicit; invariants named descriptively then numbered; the rest of that list).
4. **Run the three passes in order and iterate** — GRID, then EOS, then Linus — until a complete round surfaces no new findings, per [`pressure-testing.md`](./pressure-testing.md) §Order and iteration, which owns the round structure. Lineage notes record what each pass found and how it was resolved.
5. **Resolve forthcoming-links.** Any existing pattern that names the new one as `*(forthcoming)*` gets the marker removed and the reference linked. (Discovery method: search the corpus for `(forthcoming)` near your pattern's name; the new pattern's Lineage *Structural milestone* paragraph lists what it retires — see [`spec-format.md`](./spec-format.md) §Composition shape, Lineage notes.)
6. **Update the catalog surfaces — three different mechanisms.** (a) Add the pattern's status row and sequencing notes to [`roadmap.md`](./roadmap.md), the single source of truth for library state — the roadmap's status cell mirrors the pattern's own Status line exactly (the status-mirror lint check enforces this). (b) Regenerate the browse-by-overlay catalog: `python3 tools/taxonomy/generate_views.py .` — this rewrites `atoms/index.md` and nothing else; atom classification is derived, never hand-edited. (c) For compositions only: hand-add a one-line entry naming the composition and the standards it anchors to `compositions/README.md`. (`readme.md` carries no library-state snapshot by rule — see [`pressure-testing.md`](./pressure-testing.md) §The no-snapshot rule; there is nothing to update there.)

---

## Implementation-discovered findings

*(Ownership moved here 2026-06-11 from the session-bootstrap index — now `AGENTS.md`, reached via the `CLAUDE.md` shim.)* Building demos or production systems against a spec sometimes surfaces problems the three-pass review missed. The discipline below keeps the spec-as-canonical story honest without silencing implementation discoveries.

A **finding** is a contradiction *inside* the spec — or inside a derived artifact such as a formal model, which is the same class (the worked precedent: Privileged Access Provisioning's dead-variable finding, a TLA+ model whose `vars` and `Init` disagreed). An action wiring and an invariant disagree, two passages describe different behavior for the same case, a CHECK and a trigger cannot both hold, an example violates an invariant, a forthcoming-link points at something that already landed under a different name. Findings are Pass-3-shaped and belong in the pattern's Lineage notes as a new pass. Log them; route them through the standard review channel; do not modify the spec mid-build.

A **preference** is anything else — *"this would be cleaner if…"*, *"I'd rather have one table than four"*, *"the column name is awkward"*, *"this collapses to a simpler form in my implementation"*. Preferences are implementation choice and belong in the implementation's own follow-up tracker (e.g., a `CORNERS.md` alongside the build), not in the spec.

The single distinguishing question: does the observation name a contradiction *inside* the spec, or a preference *outside* it? If the answer is not obviously the first, it is the second. The bar is "contradiction, not preference" — deliberately not "very wrong," because *very wrong* slides under any sustained effort and *contradiction* does not. A contradiction can be named by pointing at the two passages that disagree; a preference cannot.

Builds proceed against the spec as written. The spec changes only through a review pass, not through a code commit. An agent that rewrites the spec inline during a build has made a process error, regardless of whether the rewrite is correct — the correct path is to log the finding, finish the build against the existing spec, and let the review channel adjudicate.

---

## How to contribute

Open an issue or submit a pull request. If you are unsure whether something belongs, open an issue first and describe what you have in mind. The overhead of a conversation is lower than the overhead of a rejected PR.

---

*We are not inventors here. We are curators — connecting dots from brilliant but unfinished work across decades. If you recognize the problem, you are probably already a contributor.*
