# Guided Decomposition Tool — Design

> **Design doc, not built.** It specifies the tool before any code — the discipline the tool teaches (the spec is canonical; code is derived). It carries no Status line or Lineage because it is a tool-design doc, not a library pattern. It has been pressure-tested twice: a correctness Super-Torvalds pass (8 foundational findings → v2) and a **UX Super-Torvalds pass** (→ this v3). Two decisions are now settled and shape everything below: **(1)** the tool has a deterministic core *and* an **opt-in AI challenger** — a live reviewer that interrogates the user's answers but never supplies them; **(2)** v1 serves the **outsider** audience for real, not just contributors. Both are recorded under *Design review*. The acceptance bar is the closing line, now joined by a user-facing one: a newcomer must be able to *finish*.

---

## Purpose

The library's moat is the **decomposition discipline** — give every concern one home, name what each piece is, attack each piece before trusting it. It is a skill, which is what makes it both defensible and a bottleneck. This tool transfers it.

The honest mechanism, learned from the UX review: a tool that only *asks* and records is a blank form with anxiety — it ships the hard part back to the person who came for help. The skill does not live in the first question ("does this have its own state machine?"); it lives in the **second** one ("you said no — then what owns the `approved` → `revoked` transition you just wrote?"). So the tool is two things at once: a **deterministic core** that asks the right questions in the right order, retrieves, lints, and scaffolds — and an **opt-in AI challenger** that asks the second question, the way a fresh-reader does in Pass 3. The core guarantees completeness and ordering; the challenger raises the floor of the answers. Together they transfer the discipline; neither alone does.

**Who it is for — the outsider, and only the outsider.** The tool is designed to the *hardest* reader's bar: someone applying the method to their own domain with no library vocabulary. Contributors are not a second design target and need no separate mode. A fluent contributor either **works raw** — hand-authoring with the full manual discipline, the way the library's own authors do (decompose in their head, draft directly, run councils) — or uses this same tool, where the tiered output lets them skim at speed. Designing for the outsider covers the contributor for free; the reverse is not true, and the v2 design's quiet failure was building for the contributor and *calling* it the outsider's tool. There is one tool, aimed at the demanding case.

---

## What the tool is — and the two things it never does

**The deterministic core.** Elicits the concern list, retrieves candidate matches from the catalog, walks the required sections, runs mechanical lint, records answers, scaffolds the draft. Zero npm dependencies (Node built-ins only), fully functional **offline**. This is the spine; everything works without a network.

**The AI challenger (opt-in).** A live reviewer that reads what the user wrote and **interrogates** it — plays the Pass-3 postures against their own prose, flags likely over-absorption, asks the sharper follow-up, makes them defend a cut. It runs through Node's built-in `fetch` against a configured AI endpoint (the user's own key, or, for in-tree runs, the council's), so it adds no package dependency; absent a configured endpoint, the tool degrades cleanly to the deterministic core. The challenger is the project's *own* discipline made live: the methodology already mandates an AI fresh-reader (the Final Critique is AI-conducted and required for grounding) precisely because it calls author-self-review the weakest configuration it knows. A wizard that let an author self-review with no fresh reader would contradict the very method it front-ends.

**The two hard nevers** — the guardrails that keep the challenger a *guide*, not an oracle:

1. **It never mints `grounded`.** Status ceiling is `partially resolved`. (Below.)
2. **It never *answers*.** It does not propose spec content, does not decide atom-vs-composition, does not classify a finding's severity, does not close a finding, and does not block progress. Its challenges land in the draft's Lineage notes as *open questions the user chose to carry or resolve*. This is the bright line against the answer-giver tool (branch b), which would let a novice rubber-stamp a confident-wrong spec with nice headings and dissolve the discipline. The one exception is **catalog retrieval** — surfacing candidate existing atoms by search — which is information, not judgment, and ships even in the no-AI core.

The split between *"never answers"* (a principle) and *"never asks a responsive follow-up"* (a UX cop-out) is deliberate: the tool asks and challenges; it does not answer or adjudicate.

---

## The bar the tool must never cross

A single interactive sitting is **one author-led round**, even with the challenger raising its quality — not the 3×3 baseline plus an independent fresh-reader Final Critique plus (for vote-yes) a verified model that grounding requires. So the tool's output is honestly partial: a **`partially resolved`** draft, with the independent review and the formal layer deferred and queued. Grounding is never the tool's to grant — it is the outcome of the batch lane. The challenger improves the draft and gives an outsider a *real* fresh-reader pass they otherwise could not get; it does not substitute for the canonical, independent Final Critique that grounding still demands.

---

## Two lanes

**Lane A — interactive, fast (this tool).** Decompose → author → one author-led round (with the opt-in challenger) → cast the formal-layer vote. Output: a `partially resolved` draft, findings in its Lineage notes, and queue entries.

**Lane B — batch, asynchronous.** Drains the queues: the **review queue** (the independent Final Critique grounding requires) and the **formal queue** (the model, authored and verified through [`tools/harness/`](../harness/)). Grounding happens here. **Failure branch:** a deferred model that finds a counterexample is conflict-protocol case 1 — fix the English, re-verify, take a touch-triggered re-pass, and cascade-downgrade any composition already naming the pattern. Deferring the model does not defer the consequences of it failing.

**For the outsider, Lane B must be reachable, not an institution they lack.** A contributor's queue is drained by the council/harness. An outsider has neither — so their queue entry is emitted as a **human-runnable review brief**: a self-contained prompt they can paste, with their draft, into any capable AI to get the independent Final Critique, plus plain instructions for reading the findings back. The same challenger that ran live during authoring *is* this review, run once more at the end by a fresh context. The outsider's deferred payoff is addressed to an action they can take, not a council they don't have.

---

## The arc — three phases

### Phase 1 — Decompose (a loop, not a line)

**1a — Elicit the pieces (the first mile, now designed).** The hardest step is getting the concern list *out* of the user, and it cannot be assumed. The tool runs **domain-walking probes** — *What records exist in this domain? Who acts on them, and how? What must never be allowed to happen? What would an auditor or regulator ask you to prove?* — each answer emitting candidate concerns into a **visible, editable list** before any triage begins.

**1b — Retrieve, don't assign homework.** For each concern, the tool **surfaces** the closest existing atoms — keyword-matching the concern statement against atom summary blockquotes and showing the top few with one-line descriptions — and asks *reuse / extend / new*. A newcomer cannot be expected to know their "history of who approved what" is **Event Log**; the tool shows them the candidate rather than sending them to read the catalog. This is retrieval, not judgment — the user still decides — and it is what stops a novice re-minting Event Log, Actor Identity, and Audit Trail under new names.

**1c — Triage, with worked examples.** For a genuinely new concern, the directory-placement test (*must specifying it name another concern?* → composition vs atom) and the EOS extraction questions (own state machine? recurs across domains? host specifiable without it?). **Every judgment question ships one concrete yes-instance and one no-instance** drawn from the library's worked examples (Personal Todo, Duplicate Prevention) — because defining "state machine" does not tell a user whether *theirs* has one; a matched pair of examples does. The composition-layer extraction gate runs only when a concern recurs across catalog compositions the retrieval step surfaced.

**Phase 1 is a loop over a mutable list** — add, edit, **merge, split, re-triage** — because triaging concern five routinely reveals that concern two was actually two concerns. A wizard with no back button fossilizes first guesses; this phase has one.

**Emits:** `<domain>.decomposition.md` (see *Artifacts*).

### Phase 2 — Author

Walk the required sections in order for the chosen pattern's shape, per [`spec-format.md`](../../spec-format.md), each prompt carrying its governing convention inline. **Prose sections open in `$EDITOR`** (a temp file seeded with the prompt and conventions as comments) rather than fighting a single-line prompt; short answers stay inline. A run may **resume**: re-ingesting a partial scaffold and skipping filled sections, so the multi-hour arc is not a mandatory single sitting. At pattern choice the tool emits a **session plan** — *"this composition needs atoms A and B first; that's roughly three sittings, in this order"* — turning the atoms-before-compositions ordering constraint from an ambush into a roadmap. The Summary (Tier 1) is written at grounding, not draft time, and is skipped here.

**The structural-relation sub-flow (compositions).** When authoring a composition's invariants, the deterministic core watches for relational language — *owns, contains, belongs to, member of, parent/child of* — and, on a hit, **forces a structural-relation declaration** rather than letting the relation stay loose: pick its **cardinality** (one-to-one / one-to-many / many-to-many) and the **modality** of each side (mandatory / optional). From those two answers the core auto-inserts the required invariants in canonical phrasing (referential integrity; no-orphans *only where a side is mandatory*; inverse consistency), seeds the relation's **composition-state classification** at *derived index* (the default — the inverse is rebuilt from the forward references, not a second stored map), seeds the **Alloy multiplicity** for the formal-queue entry, and queues an auto-generated **orphan / dangling-reference / inverse-inconsistency buggy-twin** scenario. This makes executable the **Pass 3 *Relations* checklist line** (`pressure-testing.md`) — vocabulary that is precise and universally legible (data-modeling cardinality, not new jargon), with *maintenance* deferred to the composition-state rule so the tool never nudges an author toward a stored dual-write. (The rule landed as a single Pass 3 bullet rather than a standalone convention — smallest machinery that closes the gap; the tool enforces that one line.) The **challenger** then interrogates the relation a deterministic check cannot: *"you declared one-to-many, parent mandatory — show me the action that could leave a child with no parent; if none can, what structurally prevents it?"* and *"is the inverse derived or stored? if stored, justify the second map against the composition-state rule."*

**Emits:** `<name>.md` — canonical section order, answers filled, thin sections marked `not-yet-drafted`, a seeded `## Lineage notes`.

### Phase 3 — One author-led round, the challenger, and the vote

Run the three passes, recording findings **into the draft's Lineage notes** (the canonical home — a standalone review file alongside the pattern is a documented process error), per-finding `F-id — short name — class → fix`.

- **Pass 1 — GRID** + the mechanical lint the core can run without judgment: section presence and order, undefined acronyms, dangling cross-references, Tier-1 Summary cleanliness if present.
- **Pass 2 — EOS** extraction questions, re-run against what was written.
- **Pass 3 — Linus.** The three postures are **forced per-section prompts**, not an open invitation to find nothing — *"what would the cheapest-compliant implementer do with this `approve()` signature?"* And where configured, the **AI challenger** conducts a live fresh-reader interrogation here: it reads the draft cold and pushes back, its challenges recorded in Lineage as open questions.
- **The formal-layer vote**, asked in **plain-language probes** the user can actually answer — *Can two of these actions happen at the same time? Does the order of steps ever change what's allowed? Is there a moment where a half-finished action would break a rule?* — from which the yes/no is derived and shown back for confirmation. No outsider can parse "load-bearing temporal claims" cold.

**The exit gate is decoupled from self-graded severity.** Blocking a draft's progress on a finding the *user* labeled "foundational" creates a fatigue-hour incentive to downgrade — teaching the opposite of the discipline. Instead: any finding may be explicitly **carried out as open, deferred to the Final Critique**, recorded as such in Lineage. Honesty about a finding never costs the user their exit; the unresolved-and-*unacknowledged* draft is the only one held back. The tool then records the vote and recommends a status from `{ unresolved, draft, partially resolved }` — never higher — and emits the queue entries (review always; formal if vote-yes).

---

## Progressive disclosure — an output property, not a tool mode

There is no verbosity mode and no audience mode. What makes a spec readable to a newcomer *and* fast for a fluent reader is **progressive disclosure**, and it lives in the **output**: the library's three reading tiers — Tier 1 (plain-language Summary), Tier 2 (main text), Tier 3 (formal models) — held consistent with each other (the bridge principle). The same artifact serves both readers; there is nothing to toggle. The tool's job is to produce specs that carry the tiers: Summary plain, main text defining each term inline at first use, formal layer queued. (The interview defines terms inline as ordinary good prompting — always on, no switch.) The only real setting is **`--out`**: where output lands (the user's own directory by default, or in-tree), independent of everything else.

---

## Orientation, contract, reward — the UX chrome

A multi-hour, ~25-step arc with no instrument panel abandons its user. v1 specifies:

- **An opening contract.** Before Phase 1: what this sitting produces (a complete reviewable draft + a queued independent review), what it explicitly does *not* (a `grounded` pattern), and the rough time budget. The honest ceiling is spoken at minute zero, not sprung at the end.
- **A progress panel.** At every transition: phase, section *n*-of-*m*, and the methodology's own published time estimates. Hard-codable because v1's arc is hard-coded.
- **A closing report.** At completion: sections done, findings raised and resolved (and carried), the vote and its rationale, and exactly what Lane B does next and when. `partially resolved` is made legible as *"you finished your half"* — which is the true claim, and the difference between an accomplishment and an anticlimax.

---

## Artifacts — schemas pinned

- **Decomposition map** — `<domain>.decomposition.md`. Per concern: name; one-line statement; catalog result (`reuse <x>` / `extend <x>` / `new`); classification (`atom`/`composition`) with the triage answers that decided it; constituents (compositions); extraction rationale.
- **Concern list** — the live, mutable working set behind Phase 1, persisted with the map so a resumed run reloads it.
- **Spec scaffold** — `<name>.md`. Canonical section order; answers filled; `not-yet-drafted` on thin sections; a seeded `## Lineage notes`.
- **Review log** — **no separate file**; folded into the scaffold's `## Lineage notes`.
- **Review-queue entry** — draft path, shape, date, "independent Final Critique owed." For own-directory runs, rendered as the **human-runnable review brief** (above).
- **Formal-queue entry** (vote-yes only) — draft path; shape; vote rationale; named load-bearing invariants the model must cover; suggested tool (Alloy/TLA+) per the roadmap's formal-triage table; date; status `model pending`.
- **Session plan** — emitted at pattern choice: the constituent-first ordering and rough sitting count for the chosen pattern's dependency set.

**Locations.** An in-tree run (`--out` into the repo) writes queue entries to `internal/queue/{review,formal}.md` (council/harness reads them). An own-directory run (default cwd) writes the whole bundle to the user's directory. **Mid-run quit** is safe: artifacts are written incrementally and valid-as-partial; the status recommendation is withheld until Phase 3 completes; a later run resumes from what is on disk.

---

## The queues — lifecycle, not just emission

A queue with no owner and no drain cadence rots the way the methodology warns its own rescan dates can ("it silently stops running… quiet fiction") — the live precedent being the 2026-06-10 C12/C3 `formal coverage of Invariant 4 pending` correction. So: **home & owner** — in-tree `internal/queue/*.md`, drained by the council (review; it *authors* the model, the harness only *verifies* it) and harness (formal); for outsiders, the human-runnable review brief is the drain. **Consumer interface** — the entry's fields are exactly a drain run's work order, which is why the schema is fixed here. **Staleness** — a `pending` qualifier older than the drain cadence is a flagged finding, not silent; each entry is dated so staleness is computable.

---

## Form and fit

- **Deterministic core:** a CLI in [`tools/guide/`](.), Node ESM, **zero npm dependencies** (built-ins only), offline. It does not inherit a convention from neighbors — `tools/harness/` carries a `tla-checker` dependency and `tools/recipe/` is Python; the no-deps choice stands on its own (a front-door tool should run with nothing to install).
- **Challenger:** opt-in, via built-in `fetch` to a configured AI endpoint (the user's key, or the council's for in-tree runs) — still zero *package* dependencies; a configured endpoint is runtime config, not an installed package. No endpoint → the core runs unchanged.
- **Question sets** live in a data module the CLI imports, **citing the canonical docs** (`pressure-testing.md`, `spec-format.md`, `CLAUDE.md`, `roadmap.md`) as SSOT, hand-curated with mandatory source citations and a drift check (a test that fails if a cited anchor stops resolving). An automatic generator is desirable but undesigned, so unclaimed.

---

## v1 scope, non-goals, and the user-success bar

**In scope (decision B — outsiders day one):** the full Lane A arc with the Phase-1 elicitation interview, candidate retrieval, per-question worked examples, the mutable concern-list loop, `$EDITOR` prose, resume, the UX chrome, the human-runnable outsider Lane B, the opt-in AI challenger, and the mechanical lint.

**Non-goals (deferred, not forgotten):**
- **No answer-giving AI (branch b)** beyond catalog retrieval — no AI-proposed decomposition, drafting, classification, or finding-closure. The challenger interrogates; it never answers.
- **No cross-run guided state machine.** Resume reloads a partial draft; deriving "where am I / what's next" from artifact state (vs the hard-coded arc) is the `open-questions.md` §state→phase→action mapping, still unbuilt.
- **No multi-pattern authoring in one run.** Decompose surfaces many; author walks one; the session plan sequences the rest across runs.

**User-success acceptance bar (the UX's Proof node).** The tool fails if its users fail. Falsifiable bar: *an outsider with domain knowledge and no library vocabulary completes Phase 1 — producing a decomposition map they can defend — in under an hour, unaided.* Builder-facing bar (unchanged): an implementer can build the tool from this doc without inventing a load-bearing decision.

---

## How this connects to what exists

- The **`state → phase → action` mapping** in [`open-questions.md`](../../open-questions.md) is the substrate this tool first projects; v1 hard-codes a near-linear arc (looped within Phase 1), and resolving that question is what lets a later version derive next-steps from artifact state.
- The **contribution lifecycle** in [`contributing.md`](../../contributing.md) (Proposal → Draft → Pressure-tested → Grounded) is the ladder the tool walks a user up — stopping, by design, at the Pressure-tested rung.
- The **two-lane split** is the methodology's formal-layer vote (`pressure-testing.md` §Formal models) plus the model backlog (a `roadmap.md` construct) made an explicit authoring workflow; the **challenger** is its AI-conducted fresh-reader Final Critique pulled forward, live, in non-binding form.

---

## Design review

This design was pressure-tested before any code — the dogfood the thesis demands. Two passes, both folded:

- **Fable Super-Torvalds (correctness) — 2026-06-11 → v2.** Eight foundational findings folded: the tool minting forbidden `grounded` from one author-led round (→ the bar + two-lane ceiling at `partially resolved`); the undefined Lane B failure path; the owner-less, outsider-undrainable queue; decompose never reading the catalog; the undecided findings loop; contributor findings colliding with Lineage-not-sibling hygiene; the incoherent multi-pattern workflow; missing artifact schemas. Plus the lint-vs-judge boundary, the over-broad moat claim, a false "matches harness/recipe conventions" citation, a non-existent question generator, and a miscited backlog source.
- **Fable UX Super-Torvalds (experience) — 2026-06-11 → v3.** Verdict: the v2 wizard served contributors, not the outsiders it listed first — losing the median outsider in an *undesigned* Phase 1 and a one-sitting marathon. Two decisions taken: **the live AI challenger (deterministic core + opt-in challenger; answer-giver rejected except retrieval)** — decisive because the methodology already mandates an AI fresh-reader for grounding, so a non-challenging wizard contradicted its own method; and **full outsider support in v1 (decision B)**. Findings folded: the undesigned first mile (→ elicitation interview); the catalog wall (→ candidate retrieval); definition-is-not-discrimination (→ per-question yes/no examples); no back button (→ mutable concern-list loop); the one-sitting fantasy (→ resume to v1); prose in a line prompt (→ `$EDITOR`); self-graded severity as exit gate (→ decoupled, carry-as-open); the vote with no floor (→ plain-language probes); no instrument panel / opening contract / closing report (→ UX chrome); the vapor outsider Lane B (→ human-runnable review brief); the bait-and-switch one-of-many (→ session plan); and no user-success bar (→ the Proof node above).

A fresh adversarial read of *this* v3 is the honest next step before code — v1 took eight foundational hits and the UX pass took more; v3 has earned scrutiny, not trust.

---

*Design first. Build second. If this document cannot describe the tool completely — and if a newcomer cannot finish a run — the tool is not ready to be written.*
