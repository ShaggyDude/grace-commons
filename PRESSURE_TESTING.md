---
title: Pressure Testing (The Crucible)
nav_order: 3
has_toc: true
toc: true
---

# Pressure Testing

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> The foundation review every Grace Commons pattern survives before being considered grounded (fully reviewed, complete, and reliable). Minimum standard: three rounds of three passes (structured review sweeps) each — nine passes total. Round 1 is the foundation (Pass 1 → 2 → 3, author-led). Round 2 is at least one human refinement run; additional refinement rounds follow until a complete round surfaces no new findings. Round 3 is a mandatory AI-conducted adversarial pass (where an AI reviewer actively attacks the spec looking for weaknesses) of all three passes. The minimum is a floor: a pattern that appears clean after the foundation still completes Round 2 before proceeding to Round 3 — the clean result is the confirmation, not a reason to skip the round.

A pattern's spec is incomplete in three different ways at once. Each of the three passes below catches a different class of incompleteness. None substitutes for the others. Together they constitute the mandatory foundation for atoms (in `atoms/`) and compositions (in `compositions/`).

The foundation passes are not a single-shot quality bar. Fixing a Pass 1 gap changes the document, and the changed document has new surface area for Pass 3 to find. A spec that passes all three cleanly on the first attempt has either been authored with extraordinary care or has not been reviewed adversarially enough. Refinement passes — re-running the same three passes after each round of fixes — are expected, not exceptional. There is no fixed number of refinement passes; the loop runs until a complete pass surfaces no new findings.

The three passes are recursive in a useful way: applying them to a pattern produces a Lineage notes section, and the Lineage notes themselves can be pressure-tested by re-running the same three passes. Each fresh application becomes evidence the architecture is doing real work.

---

## Pass 1 — Structural completeness (GRID)

**What it checks.** For each of GRID's nine nodes (GRID is a nine-checkpoint completeness framework — each node is one checkpoint) — Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof — is the node specified? Does the spec satisfy the node's completeness rule? Are the node's references to other nodes resolved?

**What it catches.** Missing pieces. Nodes that aren't addressed at all. Friction items that don't reference a Flow step. Decisions that aren't linked to a State or Behavior. Intent claims that aren't testable.

**How to run it.** Mechanical. Walk the nine nodes one by one with their MUSE v1.1 (the completeness framework GRID is built on) rules:

| Node | Completeness rule |
|------|-------------------|
| Intent | Must be testable — falsifiable by observable behavior |
| System | Must reference real components, not hypothetical ones |
| Friction | Must reference a specific system node or behavior |
| Flow | Must have a defined start, end, and at least one branch |
| Decision | Must be linked to a State or Behavior node |
| Feedback | Must be measurable — tied to a specific signal or metric |
| State | Must name what changes and under what condition |
| Behavior | Must be observable — not inferred |
| Proof | Must be measurable and defined before development begins, and must name its verification surface — records-alone checks, and/or a derived formal model where the formal-layer vote requires one (see *Formal models* below) |

Then check the reference graph: every Friction links to a Flow step; every Decision links to State and Behavior; every Proof links to Intent. Orphaned references (links that point to something not defined in the spec) are violations.

Then check accessibility completeness — two structural checks that are mechanical, not adversarial, and belong in Pass 1:

- **Summary is Tier 1 clean.** Does the Summary contain any unexplained acronym, undefined jargon, or technical term that is not everyday English? Every such term must be defined inline. A Summary that a non-engineer with domain knowledge cannot read without a glossary is a Pass 1 structural gap, not a stylistic preference.
- **No undefined acronym anywhere in the spec.** Does any acronym or initialisation (HIPAA, GDPR, EOS, GRID, NFC, FATF, BSA/AML, KYC, CDD, PCI DSS, etc.) appear without being spelled out and briefly glossed at its first use in the document? First-use definition is required globally — in any section, not just the Summary. An undefined acronym is an implicit "you know where to look" cross-reference and is treated as a reference-graph violation.

For compositions that define a named semantics subsection (Replay semantics, Evaluation rules, Provisioning cascade, or similar): every action wiring step that defers execution to that subsection — by saying "recompute", "evaluate", "apply", "cascade", or equivalent — must name the subsection explicitly. An action wiring step that says "recompute the derived state" without citing the Replay semantics section is an intra-document orphaned reference and is a Pass 1 finding.

**Time:** 15–30 minutes for an atom; longer for an application with multiple constituents.

**Personal Todo example.** First pass surfaced five gaps: actor (Behavior was incomplete — *who* acts?), description mutability (State + Decision were silent on edit), temporal metadata (State omitted timestamps), observability (Feedback didn't say what's queryable), identity policy (Decision punted on duplicate handling). Four were closed in-pattern; the fifth was extracted to Duplicate Prevention by Pass 2.

---

## Pass 2 — Conceptual independence (EOS — Essence of Software)

**What it checks.** For each concern named in the spec, does that concern belong to *this* concept, or to a different concept that ought to compose with it?

**What it catches.** Over-absorption (when a spec takes on more than it should — grabbing concerns that belong to a different concept). A spec absorbing a concern that is generic, recurs across many concepts, and deserves its own freestanding atom. EOS calls these *concerns that should be freestanding* — they are not properties of the host concept; they are concepts in their own right.

**How to run it.** For each concern, ask:

- Does this concern recur across many domains? (Identity stability, recency guards, audit logging, time windows, ordering, retention, tamper-evidence — usually a separate concept.)
- Does this concern have its own state machine, distinct from the host concept's? (If so, almost certainly its own concept.)
- Could the host concept be specified without this concern, with the concern composed in? (If yes, extract.)
- Would another concept that needs this concern reinvent it? (If yes, extract.)

**Time:** 10–20 minutes once familiar with the existing atom catalog. Faster as the catalog grows — a quick scan against existing atoms surfaces most over-absorptions.

**Personal Todo example.** First-pass identity policy was absorbed in-pattern as a 24-hour deletion record. Pass 2 caught it: the same concern appears in comment double-post, payment idempotency, newsletter double-subscribe, form submission. It is not a property of Personal Todo — it is its own concept. Extracted as Duplicate Prevention. Personal Todo got cleaner; three other concepts now have a place to compose from.

---

## Pass 3 — Adversarial scrutiny (Linus mode — named after Linus Torvalds, creator of Linux, known for blunt and unsparing code reviews)

**What it checks.** Read the spec like someone with low patience for hand-waving. Look for muddled thinking, decisions deferred dressed up as deliberate ambiguity, marketing claims without justification, examples that exercise only happy paths, invariants that aren't actually invariant.

**What it catches.** Hidden decisions and sloppy thinking. The load-bearing decisions that have been pushed below the surface where they don't have to argue for themselves.

**How to run it.** Adopt the posture of a senior reviewer who is allergic to abstraction-as-evasion. Sample questions to ask of every spec:

- **Identity.** What concretely *is* the identity model? Is identity an opaque id, or is it a property like name or description? What happens if the identity-property changes — is that the same entity or a different one? Pick a side. State it.
- **Action signatures.** What does each action *return* on success? On failure? What are the rejection reasons, named?
- **Primitive policies.** For every string, number, date, identifier in the spec — what are the rules? Empty allowed? Whitespace? Unicode normalization? Length cap? Trim? Case-sensitivity?
- **Invariant precision.** Are invariants (rules that must always be true, no matter what) stated with proper conditional structure when terms are optional? A chain inequality `a ≤ b ≤ c` is wrong if any term may be undefined.
- **Examples.** Do they exercise rejection paths, edge cases, and the explicit non-goals — or only the happy path?
- **Deferred concerns.** Are concurrency (multiple operations happening at the same time), atomicity (an operation either fully completes or fully fails — no in-between), clock semantics (rules about where timestamps come from and whether they can be trusted), and persistence named explicitly as out-of-scope, or implicitly assumed away?
- **Marketing.** Does the spec claim it *extends* or *is informed by* or *is built on* something? Is the claim accurate, or sleight-of-hand papering over a different model?
- **Atomicity.** Are state transitions atomic? What about a crash mid-transition — is an invariant violated? Whose problem is that?
- **Time.** Where does `now` come from? Whose clock? What about skew, monotonicity, timezone?
- **Cross-references.** Does every step, invariant, or claim that depends on content defined elsewhere name that section explicitly? Does every section that defines a mechanism used by another section get named by those users? Implicit "you know where to look" is a finding — all references must be explicit in both directions.
- **Logic confinement.** Does any action embed async work, IO, crypto, or clock reads inside the core transition? Time, identity, and cryptographic material must be injected inputs, not internal calls. A transition that generates `now` or a random id inside itself is non-deterministic — flag it. See *Logic Confinement Principle* in `EXECUTION_CONTRACT.md`.

**Adversarial postures (run all three).** The questions above check *topics*; these check the spec from a hostile *stance*, and catch what a topic-checklist misses:

- **The cheapest-compliant implementer.** "Read this as someone trying to ship the cheapest possible implementation that still *technically* satisfies every sentence." Whatever they could get away with is an under-specification — close it.
- **Two engineers who dislike each other.** "Find any sentence two senior engineers who want each other to be wrong could read two different ways." Each such sentence is a determinism leak — pin the reading.
- **The unstated-assumption hunt.** "Name every implicit assumption about clocks, ordering, or identity the spec relies on but does not state." Each one is a hidden load-bearing decision — surface it or name it out-of-scope.

**Time:** 30–60 minutes for a thorough pass. The most labor-intensive of the three.

**Personal Todo example.** Surfaced five gaps in the simplified post-Pass-1-and-2 spec: identity model muddled, `add` return value unspecified, description rules unspecified, timestamp monotonicity (the requirement that timestamps always move forward, never backward) malformed (chain inequality with optional terms), examples were happy-path only. All five fixed in a third revision; three additional concerns (concurrency, atomicity, clock semantics) named as explicit out-of-scope rather than fixed in-pattern.

---

## Formal models — the parallel verification surface

The three passes above operate on structured English. They catch ambiguity, incompleteness, over-absorption, and hidden decisions — the classes of gap a careful reader can frame as a question. They cannot catch the class of gap *no reader thought to look for*. That class is what formal models exist to catch.

A pattern may carry one or more formal-model siblings — `.als` for Alloy, `.tla` + `.cfg` for TLA+ — in the same directory as its canonical `.md`. Alloy checks structural invariants via bounded exhaustive search; TLA+ checks behavioural sequences via exhaustive interleaving under TLC. Both run at design time, before any implementation exists. Both treat the canonical English as the source — the formal artifact is a validator of the spec, not a replacement for it.

Formal models complement the three passes; they never replace them. Whether one is a *prerequisite* for `grounded` is no longer left implicit — it is decided by the **formal-layer vote** (below), cast and recorded for every pattern. When a model exists it is a first-class artifact in its own right. The Alloy model for Attributed Permissions Admin surfaced Invariant 7 (Attestation Exclusivity) after sixteen prose-review findings had already closed, because no human reviewer thought to ask *could an attestation be used twice?* That is the load-bearing contribution: the formal layer asks questions the prose layer cannot frame.

Findings from formal models are recorded in Lineage notes under a *Formal model* entry, in the same arc as Pass 1–3 findings. The entry must carry plain-English summary sufficient for a reader who does not know the tool — what the artifact is, where it lives, what invariants it checks (named, not by syntax), the bounds or scope used, any deliberate scope exclusions and why, and the result. See `CONTRIBUTING.md` §Formal-model artifacts for the full convention: location and tier discipline (spec-layer artifacts; not in `demos/` or build folders), base TLA+ as the default flavor (PlusCal only when intra-action protocol semantics genuinely warrant it, and defended in the Lineage entry where used), and the human-readability requirement (every formal construct annotated in plain English). The artifact-side annotation and the Lineage-entry summary together discharge the *minimum-formalism principle*'s accessibility contract — the formal layer is free to use the most expressive tool that earns its keep precisely because the canonical English carries the bridge to every other reader.

---

### The English/formal SSOT contract

The canonical English spec is the single source of truth. A formal model is a *derived* artifact — the same ontological status as generated code in the library's thesis (*code is a build artifact; the spec is canonical*): the model is a second build artifact, lowered from the same English source, whose job is to *prove* the source's load-bearing claims hold under exhaustive search or interleaving. It is a validator and a discovery instrument, not a second source of record. This holds along the library's compile-to-binary roadmap, where the pipeline is **English (source) → formal verification (gate) → binary (output)**: both the model and the binary are derived from the one English source, and the formal layer is the *type-checker of the compiler* — the proof-carrying gate that refuses to emit a binary when the source's stated invariants do not hold. Compiling meaning directly to a binary *reinforces* English-as-SSOT (one source compiles) and *requires* the formal layer (the source must be provably deterministic enough to lower). It is both, never either.

**The one carve-out.** A property that cannot be stated in English without loss — true liveness, fairness, certain temporal conditions only crisp in LTL/TLA+ — is canonical *in the formal assertion*, and the English carries an explicitly-labelled gloss that points to it (*precise statement: see assertion L3*). That is the only place "English and formal together" is literally true. Everywhere else — the overwhelming majority of every spec — English is canonical and the formal model is derived.

**The conflict protocol.** A disagreement between the English and a derived artifact (a model counterexample, or two artifacts that lowered differently) is a *diagnosis trigger, not an auto-fix*. Three cases, three different repairs:

1. **The model found a real counterexample the English permits.** The English has a genuine logic gap — a missing precondition, an ordering that does not hold under interleaving. Fix the English, regenerate the model, re-verify. This is the model earning its keep; the finding lands in Lineage as a *Formal model* entry and is written back into the canonical English.
2. **The model was mis-derived** — wrong predicate, wrong bound, an action omitted from the translation. The English is correct; the encoding is wrong. Fix the derivation; the English is untouched. Never edit the English to match a buggy validator.
3. **The English was ambiguous enough that two derived artifacts (model and binary) lowered it differently.** Neither derived artifact is wrong — the source was under-specified. Disambiguate the English, regenerate both. Under the compile-to-binary target this becomes the dominant and most valuable signal: the compiler telling you the source is ambiguous before it ships.

The invariant across all three: **you only ever edit the English to change meaning; you only ever edit the derivation to fix translation; and you never hand-patch a model to silence a counterexample.** Triage which artifact holds the defect, then repair the right one. (Today some models are hand-authored, so "regenerate" is partly manual; the roadmap's endgame makes the model and the binary both build targets off the English, at which point regeneration is a button and hand-maintained models are a transition-phase artifact to be eliminated.)

### The formal-layer vote

Before any pattern may declare `grounded`, it casts an explicit **formal-layer vote**, recorded in Lineage: *does this pattern carry load-bearing temporal, ordering, concurrency, or safety claims that a formal model would verify — yes or no, with a one-line rationale?* The vote is mandatory; the model is not. The vote enforces *explicit-over-implicit* on the methodology itself — the same information-management discipline the library applies to specs — so that no pattern grounds without the formal layer having been *considered*, even when the considered answer is no.

- **Vote = no.** The pattern grounds English-only. The recorded vote is the evidence the formal layer was weighed and judged unwarranted (the *minimum-formalism principle* — do not put Alloy on Personal Todo). The English remains the sole SSOT and carries the full proof burden in prose, which is why an English-only pattern's prose must be correspondingly rigorous and verbose: nothing downstream is checking it.
- **Vote = yes.** A derived formal model becomes a *grounding prerequisite* for that pattern. Until it exists and verifies, the pattern is `grounded (English) — formal layer pending`: the three-pass baseline and Final Critique may be clean, but the load-bearing temporal claims have not yet been discharged on the surface best suited to them. The model's findings are folded into Lineage and written back into the English per the conflict protocol; only then does the pattern reach unqualified `grounded`.

**What "the model exists and verifies" means — the "model present" bar.** A model *file* existing is not the formal layer being discharged. The phrase "model present" in a Lineage entry or vote means **all** of the following, on the record:

1. **It runs green in the reproducible harness.** The model passes `tools/harness/` mechanically — not "ran once in the Alloy GUI," not "a sibling Python checker agrees." The committed artifact verifies on command. (A model that does not typecheck, or that a TLA+ checker reports `NoInitialStates` for, has *not* run — treat a typecheck/parse error or empty initial-state set as a hard failure, never a skip.)
2. **It ships a buggy twin the checker rejects.** Every model carries a deliberately-wrong sibling (`<name>-buggy.tla` / `-buggy.als`) that re-introduces a real hazard the spec defends against; the harness must *reject* it (TLA+: an invariant violation; Alloy: at least one `check` finds a counterexample). The twin is the **vacuity guard** — without it, a model that passes proves nothing, because a check can pass simply because its antecedent is never satisfiable. The twin proving the checker *can* fail is what makes the correct model's green meaningful.
3. **Its checks are non-vacuous.** Every Alloy `check` is accompanied by a satisfiable `run` that exercises the same predicate (so the guarantee is quantified over a non-empty set, not vacuously true); every TLA+ model explores a state space that **saturates** at the chosen bound (raise the bound until the state count stops growing, then keep headroom — a passing run at an arbitrary low bound is not coverage). The tell to refuse: a `check` that *holds* while its paired `run` is *vacuous* — that guarantee is unenforced.

These three are the bar that the `capability.als` typecheck error, its vacuous transition layer, and `privilegedAccessProvisioning.tla`'s unrunnable `request_to_chain` (finding R5-F1) all slipped past historically — each was recorded as "model present" while the artifact was not actually verifying anything. The bar exists to close that loophole: until a vote-yes pattern clears all three, it stays `grounded (English) — formal layer pending`, never `grounded`.

This vote replaces the prior rule that formal models were simply "not prerequisites for `grounded`." That rule predated the shift toward the formal layer as the load-bearing verification surface; it left the decision implicit, which allowed a pattern with heavy temporal claims to ground without anyone deciding whether prose review was the right gate for it. The vote closes that gap without over-correcting into a blanket formal-for-everything mandate.

### Formal-model authoring pitfalls

These are the recurring traps that surfaced authoring the formal layer across the library. Each one produced a model that *looked* verified while checking nothing, or a model that diverged from the spec it was meant to validate. They are authoring discipline, not tooling trivia; the tool-specific and operational specifics (checker dialect, harness provisioning) live in [`tools/harness/README.md`](./tools/harness/README.md). The single thread connecting them: **a model that passes is worthless unless you have established it *could* have failed.**

- **Vacuity is the silent killer.** A `check` passes whenever its antecedent is unsatisfiable — it then constrains nothing while reporting success. This is the failure mode behind most false confidence. Defend against it structurally, not by inspection: every guarantee gets a satisfiable companion (an Alloy `run` that exercises the predicate; a TLA+ buggy twin that the checker rejects). The diagnostic tell is a *holds* check paired with a *vacuous* run — when you see it, the guarantee is unenforced. (See the "model present" bar above; this is why criteria 2 and 3 exist.)

- **Static models lie about transitions.** In a static structural model (Alloy snapshots), a "transition" is a `pre`/`post` pair representing *one entity across a step* — but a global identity-or-uniqueness fact (`all disj r1, r2 | r1.id != r2.id`) treats `pre` and `post` as two *co-existing* records and forbids them from sharing the id, making every transition unsatisfiable. The result is both vacuous demonstration `run`s and vacuously-passing transition `check`s (the `capability.als` defect). **Fix:** scope identity/uniqueness facts to the records co-existing in a store snapshot (a `Store { records : set Rec }` sig), so free `pre`/`post` transition atoms are exempt. A pre/post pair is the same entity at two times, not two entities at one time.

- **Derive idealizations; do not lag them with a flag.** Specs idealize — membership auto-expires the instant a window passes; visible state *is* the replay of non-undone events. Modeling such an idealization as a separate variable that you remember to update creates a transient the spec forbids (the flag lags the clock), and the checker correctly rejects your *correct* model (the Duplicate Prevention case-2 mis-encoding). **Fix:** model the idealization as a *derived* predicate computed from the underlying state (`Seen == everRecorded /\ now - recordedAt < Window`), not as a tracked flag with its own update rule.

- **Do not beg the question.** It is tempting to track the load-bearing invariant *as* state, updated by the same rule as the action guard — then the check is a tautology and the buggy twin can't break it. **Fix:** derive the load-bearing predicate from the *actual history* (the log, the records, the insertion order), then assert against that. Then a buggy twin genuinely produces a violating history the check catches — which is the only evidence the check has teeth.

- **Saturate the bound; a low-bound pass is not coverage.** A model that passes at an arbitrary small bound may simply be truncating the reachable state space before the interesting interleavings occur (the `externalOnboarding` `MaxClock=3` truncation to 44 of 172 reachable states). **Fix:** raise the bound until the explored-state count *stops growing* (the space has saturated), then keep headroom. Record the saturation point in the model config so the next reader knows the bound is deliberate, not arbitrary.

- **Conflate nothing between "exists" and "verifies."** A `.tla`/`.als` file in the directory, a model that ran once in a GUI, or a sibling checker in another language that "agrees" are all *not* the formal layer being discharged. Only a green run of the committed artifact in the reproducible harness, with a rejected buggy twin, counts. This is the discipline the "model present" bar encodes; the pitfalls above are the specific ways an artifact silently fails it.

### The coverage cross-check (formal-layer rescan sub-step)

The "model present" bar establishes that a model verifies *what it checks* and that what it checks is non-vacuous. It does **not** establish that the model checks the *right* and the *whole* load-bearing surface. That residual — *did a load-bearing invariant go unchecked, or get silently scoped out?* — is the dominant property-fidelity risk, and it is the one the harness cannot catch on its own: a model can be green, twin-rejected, and non-vacuous while quietly omitting an invariant the spec calls load-bearing.

The **coverage cross-check** closes it. It is a structured read-and-diff, not new tooling or heavier search — deliberately cheap, so it rides the existing scheduled-rescan cadence rather than requiring a separate effort (inductive theorem-proving and large-scope blow-up are the expensive levers, and they chase smaller, lower-probability residuals; do not reach for them to discharge this one). A fresh-context reviewer (a fresh-reader AI is ideal — it surfaces the gaps the model's author rationalized past) is the right executor; it is parallelizable across patterns.

**Procedure.** For each pattern carrying a vote-yes model, produce a *coverage matrix*: one row per invariant in the spec's **Invariants** section (and per load-bearing claim named in the formal-layer vote), each classed into exactly one verdict:

- **covered** — a named `check`/invariant in the model asserts it (cite the construct).
- **by-construction** — the model makes it structurally impossible to violate rather than asserting it (e.g. an append-only log modeled with no remove action). Acceptable, but recorded as an *assumption, not a verified property* — because the model cannot catch a regression that a future edit introduces. Flag for promotion to a real `check` if the property is load-bearing.
- **out-of-scope (named reason)** — deliberately not modeled, with the reason stated: a within-action atomicity claim (not an interleaving), a structural/relational property better suited to the other tool, a best-effort clock property, etc.
- **GAP** — load-bearing, uncovered, and with no defensible out-of-scope reason. A GAP is a finding, routed through the standard channel (Pass-3-shaped) and blocking unqualified `grounded` until closed.

Add one **bound-saturation line**: raise the model's scope once (N or MaxClock + k), confirm the explored-state count does not grow and the invariant still holds, and record the saturation point. This is the cheap guard against a low-bound pass that truncated the reachable space before the interesting interleavings.

**Worked example — Party Identity.** The formal-layer vote named Invariants 4 and 6 load-bearing.

| Spec invariant | Verdict |
|---|---|
| 2 — State membership exclusivity | covered (`Inv2_StateExclusivity` / `TypeOK`) |
| 3 — Closed is absorbing | covered (`Inv3_ClosedAbsorbing`, history-flag form) |
| **4 — Verified requires a passed verification after the most recent suspend** | **covered** (`Inv4_PassedAfterSuspend`, derived from the log) — *load-bearing, verified* |
| **6 — Append-only in insertion order** | **GAP → resolved.** Was **by-construction** (the model only appended, never removed — an assumption, not an asserted check) despite being *load-bearing per the vote*. Promoted 2026-06-03 to an explicit check, `Inv6_AppendOnlyPrefix` (the log is a contiguous filled prefix); now **covered**. |
| 1, 5, 7 — record permanence / event & field immutability | out-of-scope (immutability is structural; the relational/Alloy surface, not this interleaving model) |
| 8 — state-change events auditable | out-of-scope (records-shape property, discharged in prose + Generation acceptance) |
| 9, 10 — id stability / no id reuse | out-of-scope (structural identity; Alloy-class, not TLC-class) |
| 11 — action atomicity | out-of-scope (within-action, not an action-vs-action interleaving) |

Bound saturation: at `MaxEvents = 6`, 532 states; `MaxEvents = 7` holds at 532 → *saturated.* ✓

Note what the cross-check surfaced on the very first pattern: Invariant 6, *named load-bearing by the vote*, was only **by-construction** in the model, not asserted — exactly the kind of silent partial-coverage the green checkmark hides. That is the finding the cross-check exists to produce, and it was closed the same way: Invariant 6 was promoted to an explicit checked predicate (`Inv6_AppendOnlyPrefix`) in both the model and its twin, the correct model still holds (532 states) and the twin is still rejected. Surfaced and closed on the first real run — the worked example *is* the cross-check earning its keep.

A blank fill-in matrix lives at [`tools/harness/coverage-matrix.template.md`](./tools/harness/coverage-matrix.template.md); one filled matrix per vote-yes pattern is the rescan artifact, and any GAP row is a routed finding.

## Defending each claim in-line

The three passes are review tools — they catch gaps. Authoring well in the first place reduces what the passes find. The strongest writing discipline for architectural specs: **every claim is defended in-line by the same paragraph that introduces it.**

**The four-step rubric** (rubric: a structured guide for evaluating something)**:**

1. **State the principle.** The architectural claim, expressed cleanly.
2. **Name the likely objection or barrier.** What would a senior reviewer push back on? What historical concern attaches to this claim?
3. **Show the mechanism that resolves it.** What specifically defuses the objection — a counter-argument, an architectural choice, a tooling capability?
4. **Land the result.** The principle stands, and the reader's likely concern has been addressed without them needing to raise it.

Readers bring objections; in-line answers are more persuasive than principles that let objections surface unanswered. A claim that survives this discipline rarely needs Pass 3's adversarial review to defend it — the defense is built in.

**Worked example** (from THE_SPEC_LAYER.md):

> *Verbosity is the architecture of the bridge. Compress the language and one side loses access; preserve it and both sides — humans and machines — traverse the same canonical artifact. AI removes the historical barrier of too-long-to-read: the canonical text stays long because it must be verifiable; AI-generated summaries stay short because they only need to orient; diagrams support summaries without replacing the canonical text underneath. Readers choose the detail level appropriate to the task; the canonical layer keeps all levels consistent with each other.*

Tracing the rubric through it:

- *Principle:* verbosity is structural, not stylistic.
- *Objection:* "long specs go unread."
- *Mechanism:* AI summarizes on demand; diagrams orient; canonical text stays verifiable.
- *Result:* readers choose detail level; consistency preserved.

**Apply to every architectural claim.** Atomic-pattern specs, application specs, methodology documents, and outreach material all benefit from this discipline. Where an architectural claim does not yet have a defended-in-line form, that is a writing gap to fix in the next revision — not a structural gap that needs a pass.

---

## Regulated-pattern conventions

Two structural conventions emerged as Pass 3 findings on the first regulated atom in the library and have stabilized as required sections for any pattern with external acceptance bars. Both are *structural fixes* to recurring Pass 3 gaps — not optional polish.

### Regulated adversarial scenarios

**The Pass 3 gap.** Early-draft examples are almost always happy-path biased: they walk what users *do*, not what auditors *check*. Pass 3 catches this routinely. The historical fix was to add rejection-path examples — what the system *refuses*. That helps, but it still misses a third class: what external evaluators *ask*. A regulator querying "show me every commitment confirmed after its declared window" is exercising the invariant from the outside, in the language they use, against the records they can see.

**The structural fix.** A dedicated `Examples` subsection — *Regulated adversarial scenarios* — walking three canonical adversarial reads: **regulator audit** (a query against the records that must return the expected result by virtue of an invariant), **disputed transaction or data-subject request** (an external party challenges the system's claim and the records must answer), and **breach or incident investigation** (an investigator queries during or after an anomaly). The three classes exercise different invariant surfaces: audit checks structural guarantees, dispute exercises the contract under hostile interpretation, breach exercises forensic queryability.

**Worked examples.** [Provisional Commitment's adversarial scenarios](atoms/resource-lifecycle/provisional-commitment.md#regulated-adversarial-scenarios) walk regulator-audit-of-confirmation-window, GDPR-erasure-on-personal-data (GDPR is Europe's data protection law — it gives people the right to have their data deleted), and breach-window-forensics. [Actor Identity's](atoms/compliance/actor-identity.md#regulated-adversarial-scenarios) walk regulator-audit-of-attribution, disputed-transaction-by-actor, and compromised-credential-discovery. [Idempotent Reservation's](compositions/idempotent-reservation.md#regulated-adversarial-scenarios) walk regulator-audit-for-double-charges, disputed-double-charge, and replay-attack — exercising the *emergent* invariants of the composition rather than the constituents' invariants.

### Generation acceptance

**The Pass 3 gap.** Success criteria for derived implementations are almost always implicit — the *"the invariants hold and rejections surface"* assumption. For regulated atoms, that assumption fails to specify what an external auditor reading the records must be able to *do*. The MUSE Proof node (the "Proof" checkpoint in GRID's nine-node framework — requires success criteria be testable and defined upfront) requires success criteria be "measurable and defined before development begins," but the bar is rarely written down; it lives in the architect's head.

**The structural fix.** A standalone `Generation acceptance` section naming what a derived implementation must produce, framed as the bar an external auditor must be able to clear *from the records alone*, with no recourse to source code, runbooks, or developer narration. Typically four-to-six checks: reconstruct lifecycles from records, verify every invariant from records, observe every rejection-outcome class, identify composing patterns in use, trace ids across boundaries. The framing is *"any code generated from this atom must produce records and a runtime surface that pass the following checks"* — the generator's contract.

**Worked examples.** [Provisional Commitment's Generation acceptance](atoms/resource-lifecycle/provisional-commitment.md#generation-acceptance) names four checks an external auditor performs against the commitment record set plus the composed Event Log. [Actor Identity's](atoms/compliance/actor-identity.md#generation-acceptance) names five checks against the attestation store plus the actor registry's public material. [Idempotent Reservation's](compositions/idempotent-reservation.md#generation-acceptance) names five checks that span the composition — including the token-to-commitment tracing that neither constituent atom owns alone.

### When the conventions apply

Both conventions are **required** for patterns in `atoms/compliance/`, patterns elsewhere whose examples invoke regulated domains (banking, healthcare, payments, hospitality with personal data, airline reservations), and applications that compose any of the above.

Both are **optional** for non-regulated primitives — Personal Todo's adversarial scenarios would be contrived, Event Log's Generation acceptance is implicit in its invariants. Use judgment; the test is whether an external evaluator with no developer access would have a meaningfully different verification surface from the atom's existing structure. If yes, the conventions earn their keep. If no, they are over-specification.

The conventions are **inherited rather than reinvented** in each new pattern. Each new regulated atom or application that lands lists "*conventions inherited from prior work*" in its Lineage notes and either points back to this section or to the worked examples it most closely follows.

---

## Order and iteration

**Phase 1 — Foundation: runs 1 → 2 → 3, once each.** Pass 1 is mechanical and produces a list of structural gaps. Pass 2 looks at the in-pattern resolutions and asks whether they belong elsewhere. Pass 3 attacks what survives. All three must run before any refinement begins; the foundation is not optional and cannot be skipped.

**Phase 2 — Refinement: re-run 1 → 2 → 3 as many times as needed.** Each round of fixes changes the document and can surface new findings in any of the three passes. Pass 2's extractions can re-introduce Pass 1 gaps. Pass 3 fixes can expose gaps that Pass 1 should have caught. The refinement loop has no fixed count — it runs until a complete pass across all three surfaces no new findings. This is expected: a complex atom with a novel structure may require two or three refinement rounds; a simpler atom closely following a prior pattern may need none. Both outcomes are normal.

**Multi-file refinement order.** When running refinement rounds across a library — all atoms and compositions in a single sweep — process in dependency order: atoms before any composition that names them. Compositions depend on their constituents' APIs (rejection reasons, invariant counts, action signatures); refining a composition before its constituent forces guesses about the constituent's details, and guesses introduce errors.

The corollary follows immediately: when a constituent's refinement round changes its API — adds a rejection reason, corrects a reason name, adds an invariant — every composition naming that constituent needs a follow-up pass to absorb the change. This propagation is structural, not optional. An invariant count that was accurate at authoring time becomes stale the moment its constituent gains an invariant.

The motivating evidence is from the library's own first refinement sweep. Shared Todo and Undo History were refined before Personal Todo; both used `invalid-request` for Personal Todo's description-validation rejection, which turned out to be `invalid-description`. The error was only discoverable when Personal Todo was refined last and the correct name was confirmed. Strict dependency order — Personal Todo before any composition naming it — would have surfaced the discrepancy in-round rather than requiring retroactive correction. The same sweep also produced stale invariant counts in Shared Todo (referencing "nine Assignment invariants" after Assignment gained a tenth during its own refinement round), again a consequence of refining the composition before its constituent had fully settled.

The practical rule: before beginning a library-wide refinement sweep, topologically sort the files (order them so that each atom comes before any composition that depends on it). If a composition's refinement reveals that a constituent's details are needed but not yet confirmed, pause the composition and refine the constituent first. This is not a performance optimization — it is a correctness requirement for the cross-reference surface the library accumulates.

**Phase 3 — Final AI adversarial round: mandatory before `grounded`.** After human refinement rounds have settled, one complete round of all three passes is conducted by a high-functioning AI reviewer before the pattern can declare `grounded`. This is not a repeat of Phase 2 — it is a structurally different kind of scrutiny. A human author who has written and revised a spec has emotional investment in the choices, accumulated blind spots from having reasoned through each decision, and a mental model that paper over gaps the written text does not actually close. An AI reviewer has none of these: it reads only what is written, applies the same pass questions without fatigue or sympathy, and has no stake in the outcome.

The AI round runs all three passes, not Pass 3 alone. Pass 1 and Pass 2 benefit from the same fresh-reader quality: the AI checks GRID completeness against what the spec actually says, not what the author knows it means; and it applies the EOS extraction test without the author's sense of "we already talked about this." Pass 3 is where the AI's adversarial posture is most distinctive — it will surface muddled identity, sloppy invariants, and happy-path-only examples that a sympathetic human reviewer may rationalize past.

**What counts as a high-functioning AI reviewer.** The bar is not model-specific — it is prompt discipline and structured question coverage. The AI must be given the full pass question sets from this document, the pattern under review in full, and no additional context about the author's intent beyond what the spec itself states. The reviewer's job is to surface findings, not to guess what the author meant. A review that paraphrases the spec back is not a pass — it is a read. A pass produces findings, named as findings, or a clean result with explicit confirmation that each question was applied and no gap was found.

**Recording the AI round in Lineage notes.** AI-conducted rounds are recorded in the same format as human rounds, but distinguished: the entry notes "AI-conducted round" and names the model used. This is not for model attribution — it is for reproducibility. A future reader who wants to re-run the round knows what prompt discipline and reviewer type produced the original findings. Findings closed in the AI round are recorded the same way as findings closed in human rounds: what was found, how it was resolved.

**Fresh-reader discipline, defined operationally.** *Fresh-reader* is the structural property that makes Phase 3 different from refinement Pass 3, not the human/AI distinction. A reviewer satisfies fresh-reader discipline when, for the round in question, the reviewer receives: (a) the full pass question sets from this document; (b) the pattern under review in full; and (c) **nothing else** — no author intent, no rationale, no prior-round findings from this pattern, no summary of what the author thinks the spec says. A reviewer who reads prior-round findings before applying Pass 3 is conducting *refinement Pass 3*, which is also valuable but is not Phase 3. The discipline forecloses two specific failure modes: the reviewer rationalizing past a gap because a prior round noted and resolved an adjacent one ("the author addressed this nearby concern, so this nearby gap is probably intentional"), and the reviewer pattern-matching to prior findings instead of attacking the text on its own terms. Refinement rounds can use findings context to drive convergence; the closing Phase 3 round cannot.

**Automated councils satisfying Phase 3.** Phase 3 may be conducted by a single AI reviewer in one session or by an automated council that decomposes the three passes across agents (typically one agent per pass plus a consolidate step). The Phase 3 discipline applies *uniformly* to Pass 3: **Pass 3 always runs in fresh-reader mode**, in every round, regardless of whether the round is refinement or final. Pass 1 and Pass 2 findings drive document changes between rounds (applied by a human, an apply-agent, or whatever the council provides); Pass 3 then reads the resulting document with no findings context. Every Pass 3 invocation is structurally a Phase 3 candidate; the invocation that surfaces no findings — i.e., a clean Pass 3 in a round where Passes 1 and 2 were also clean — grants `grounded` eligibility. There is no mode switch, no "final round" detection, no escalation logic. The rule chooses simplicity and discipline over convergence speed: redundant findings during refinement (Pass 3 surfacing the same gap across rounds before the document fully absorbs the fix) is a small cost; priming Pass 3 with prior findings is the exact failure the fresh-reader discipline exists to foreclose. Pass 1 and Pass 2 may flow findings forward within a round (Pass 2 may read Pass 1's findings; Pass 1 has no prior to read) — those passes are structural and conceptual rather than adversarial, and findings context does not undermine their job. Lineage notes record the council pattern used (which model per agent, which formula) and confirm that Pass 3 ran in fresh-reader mode throughout.

**Phase 4 — Readiness check: Opus at Happy Torvalds X2.** (Opus is Anthropic's most capable AI model; "Happy Torvalds X2" means applying Opus's full intelligence to confirm the spec is generation-ready — not to achieve perfection, but to clear the bar for shipping.) After the nine-pass minimum has been satisfied and Phase 3 returns clean, one additional mandatory pass runs before the pattern may declare `grounded`. This pass is conducted by Opus — the most capable available model — at twice the analytical depth of standard Pass 3 (Linus mode). It is not a fourth round in the same sense as Phases 1–3; it is a single-pass readiness check whose job is to confirm the spec is good enough to generate from. Code can be regenerated at any time as the spec improves; the goal here is to ship fast and good, then iterate.

*Why a separate check, and why Opus at X2.* A pattern that has survived nine passes has been iterated and defended. Standard Phase 3 uses "a high-functioning AI reviewer" with structured question coverage and fresh-reader discipline; that bar is correct for the closing AI round of a refinement sequence. Phase 4 applies Opus's full intelligence to answer one question: *is this spec ready to generate reliable code from?* Opus at X2 depth catches anything that would produce bad generated output — gaps in the identity model, invariants that break under real conditions, concern boundaries that would cause generation to go wrong — while staying focused on generation-readiness rather than theoretical perfection. The safety net is regeneration: because code is derived from the spec, any future improvement to the spec is immediately realizable. A grounded spec is the starting point for that cycle.

*What X2 depth means operationally.* The reviewer receives the full pass question sets, the pattern in full, and nothing else — fresh-reader discipline still applies. Pass 1 and Pass 2 run at standard intensity. Pass 3 runs at X2: the reviewer brings full intelligence to bear on whether the spec is generation-ready. Every concern boundary is tested — is it real, or would it cause generated code to absorb the wrong responsibility? Every invariant is tested for conditionality gaps — does it hold under real conditions, not just the happy path? Every example is tested for coverage — would a regulator or a real user find a scenario the spec doesn't handle? The posture is not "achieve perfection" but "confirm this is good enough to ship from, knowing iteration will follow."

*Recording the clearance gate in Lineage notes.* The Lineage entry notes "Opus clearance gate — Happy Torvalds X2" and the model version used. Each finding is classified at the time it is recorded — *foundational* (missing methodology-required content; blocks grounding until closed), *refining* (sharpens content the spec already has; closed in-pattern but does not block), or *rhetorical* (prose-only attack on sound content; recorded with classification but does not block). The Lineage per-finding format is *F-id — short name — class → fix in one or two sentences*. If foundational findings remain after the round's fixes land, the gate runs again; the pattern remains `partially resolved` until the gate returns with zero foundational findings (the 92%-good threshold — see §"What grounded means"). A gate result that meets the threshold is the final Lineage entry before `grounded` is declared.

**The minimum standard stated plainly.** Three rounds × three passes = nine passes minimum, plus one Opus clearance gate (Phase 4), plus the formal-layer vote (and, where the vote is *yes*, a verifying derived formal model before unqualified `grounded`). Round 1 is the foundation (Pass 1 → 2 → 3, once each). Rounds 2 through N−1 are human or council refinement, running until a complete round surfaces no new findings. Round N is the final AI adversarial round (Phase 3), running all three passes with fresh-reader discipline — single-reviewer or automated-council, the discipline is what counts. After Round N returns clean, the Opus clearance gate (Phase 4) runs as the tenth and final step. A pattern that has not cleared the Phase 4 gate has not met the minimum standard and should not declare `grounded`, regardless of how many refinement rounds it has survived.

**Round structure and naming — the canonical grounding marker.** The phases above describe *what* runs; this paragraph canonicalizes *how rounds are counted and named*, because two numbering schemes circulated before it was written down. The **3×3 baseline** is three rounds of the three passes — Round 1 runs Pass 1 / Pass 2 / Pass 3; Round 2 runs Pass 1 / Pass 2 / Pass 3; Round 3 runs Pass 1 / Pass 2 / Pass 3. **Pass numbering resets per round**, so "Pass 3" always means the Linus adversarial pass, never the third pass-of-nine. After the baseline, **Final Critique** runs as the AI-conducted closing round starting at Round 4 — in current practice the Phase 3 final adversarial round and the Phase 4 Opus clearance gate run together as this single Opus round (fresh-reader discipline throughout, X2 depth on Pass 3, findings classified foundational / refining / rhetorical). If Final Critique 4 closes clean, the pattern is **`grounded on Final Critique 4`**; if it surfaces findings, a refinement round absorbs them and the pattern grounds on Final Critique 5, then 6, and so on until the threshold clears — foundational findings at zero; refining and rhetorical findings may remain (the 92%-good threshold, §"What grounded means"). `grounded on Final Critique N` is the **canonical grounding marker** recorded in the pattern's Status line and Lineage notes. Older patterns that used cumulative Pass 1–9 numbering (Defensible Retention is the worked example) carry a retro-mapping note explaining the relabel; the unified convention is per-round Pass 1/2/3 + Final Critique.

**Skipping is not an option.** Each pass catches a different class of gap. A pattern that has only survived Pass 1 is structurally complete but probably absorbs concerns it shouldn't and contains hidden decisions. A pattern that has only survived Pass 3 is precise but may be missing entire GRID nodes. Either is incomplete. Refinement passes do not substitute for the foundation — they extend it. The AI round does not substitute for human refinement — it concludes it.

---

## What "grounded" means

A pattern reaches the `grounded` status — the state declared in its Status section — when:

- All nine GRID nodes are resolved (Pass 1 clean).
- All concerns belong to the pattern they're in; no over-absorptions remain (Pass 2 clean).
- No muddled identity, sloppy invariants, happy-path-only examples, or hidden load-bearing decisions remain (Pass 3 clean).
- All three conditions above have been confirmed by a final AI-conducted round (Phase 3), with findings recorded in Lineage notes.
- The Opus readiness check (Phase 4 — Happy Torvalds X2) has returned *at-or-above the 92%-good threshold* (see below), with the gate result recorded in Lineage notes as the final entry before `grounded` is declared.
- The **formal-layer vote** has been cast and recorded in Lineage (see *Formal models — The formal-layer vote*). If the vote is *yes*, the derived formal model exists and verifies; until it does, the pattern is `grounded (English) — formal layer pending`, not `grounded`.

`grounded` is a launch point, not a finish line. The spec is ready to generate from; further refinement rounds will continue to improve it; and because code is derived from the spec, every improvement is immediately realizable by regenerating.

**The 92%-good grounding threshold.** A pattern grounds when the Phase 4 readiness check's *foundational* findings reach zero, even if refining and rhetorical findings remain. "92%-good" is the colloquial label: foundationally complete, generation-ready, no methodology-required content missing. The threshold is intentionally not 100% for two reasons. First, X2 depth has no convergence ceiling — a sufficiently thorough reviewer can always find prose to sharpen regardless of whether the underlying content is sound, and demanding zero refining or rhetorical findings would mean a spec never ships. Second, perfection isn't required: code is a derived artifact that regenerates from the spec. Any improvement to the spec after grounding is immediately realizable. The goal is to ship a spec that generates reliable code today and keep improving it — not to spend indefinite refinement rounds chasing a spec that will never run.

Each gate finding is classified into one of three classes, recorded with the finding in Lineage notes:

*Foundational* — the spec is missing content the methodology's pass questions require: a state-machine gap, an unstated invariant, an unaddressed pass question, a regulated-overlay section missing despite the required-when clause applying, a composing concern silently absorbed or silently absent, a deployment-obligation not named anywhere. The fix adds previously-absent content. **Foundational findings block grounding** — they must be closed in-pattern before the gate counts as clean.

*Refining* — the spec contains the required content but a section overstates a claim, two sections disagree, a fix from a prior round didn't propagate everywhere it should, a primitive policy is too thin to defend, a deployment obligation is named in one place but missing from the obligations list. The fix sharpens content the spec already has. **Refining findings do not block grounding** — they are closed in-pattern alongside foundational ones (the fix is cheap and improves the spec) but the load-bearing surface was already present.

*Rhetorical* — the spec's content is sound and the methodology's pass questions are answered, but the reviewer at X2 intensity has attacked the *phrasing* the spec uses to defend a claim. The fix is a prose rewrite that says the same thing in different words. **Rhetorical findings do not block grounding** — they are recorded with classification visible and either closed (rewritten) or accepted (recorded as-is with rationale) per the author's call.

**The threshold operationally.** A clearance gate counts as clean for grounding purposes when its foundational finding count is zero — regardless of how many refining or rhetorical findings the same gate surfaced. If foundational findings remain after the round's fixes land, the pattern remains `partially resolved` and another round runs. The grounding bar is foundational completeness, not absence-of-all-reviewer-findings.

The "~92%, not 100%" framing recognizes that complex patterns produce refining and rhetorical surface area as a side effect of their defenses; demanding zero of either at X2 is demanding the prose and cross-section consistency be unattackable, which is a different bar than demanding the content be correct. Round 1 of any pattern is typically 100% foundational by classification (foundation gaps). Round 2 typically surfaces a mix as the foundational surface fills in. Subsequent rounds shift the mix toward refining and rhetorical with diminishing returns. The pattern grounds when foundational density reaches zero — empirically the second-or-third round for richly-surfaced atoms, the first round for simpler primitives.

The classification is the reviewer's call. The Lineage notes per-finding format is: *F-id — short name — class → fix in one or two sentences.* Future readers can audit the classification by inspection.

**Status line format.** The Status section of every grounded pattern carries a rescan date:

> `` `grounded — YYYY-MM-DD` `` — [description of what was resolved]

The date is the date of the most recent complete three-pass round. It is updated every time a touch triggers a re-pass. A pattern whose rescan date is significantly older than the current date — particularly one that predates atoms it now composes with — is a candidate for the next scheduled sweep.

Patterns that have survived only one or two passes should not declare `grounded`. Patterns that have completed human refinement but not the AI round should declare `partially resolved`. A pattern whose formal-layer vote is *yes* but whose verifying model does not yet exist declares `grounded (English) — formal layer pending` — the prose review is complete and clean, but the temporal claims await discharge on the formal surface. Honest partial completion is more useful than false confidence.

**Grandfathered patterns.** Patterns that reached `grounded` before the AI adversarial round was codified as a requirement are grandfathered at their current status. They have all completed at least one full three-pass round and carry self-documented Lineage notes — the foundation is sound. They will be brought to the full nine-pass standard in a dedicated re-pass sweep.

**Touch triggers re-pass.** Any edit to a grounded pattern — invariant change, action signature update, new edge case, corrected cross-reference — requires a full three-pass round before the pattern may retain its `grounded` status. The AI round is included. This is not punitive; it is the mechanism that keeps `grounded` meaningful as the library grows. A pattern touched without a re-pass should be downgraded to `partially resolved` until the round completes.

**Constituent-change cascade.** A *breaking* change to a grounded atom — an invariant removed, an action signature incompatibly altered, a state machine transition removed — triggers a touch-triggered re-pass on every grounded composition that names that atom in its Composes section. Each affected composition is downgraded to `partially resolved` until its re-pass completes. An *additive* change (new invariant, new edge case, new example, editorial correction) does not trigger a cascade downgrade; the "all invariants from [Atom]" cross-reference form means the composition's claim is already forward-compatible with constituent growth. Additive atom changes should note "Compositions affected: [list]" in the atom's Lineage entry so the next scheduled sweep can prioritize them.

**Scheduled rescan.** Grounded patterns are also re-passed on a regular schedule — a weekly or weekend batch is the working default — regardless of whether anything has touched them. A scheduled rescan is the same complete three-pass round as a touch-triggered re-pass; it is not a lighter check. Its purpose is not to find regressions (the spec hasn't changed, so the spec itself can't have regressed) but to **ratchet confidence** in the pattern as the library's surrounding context evolves. Each clean rescan is independent corroborating evidence that the pattern still holds against the current state of the library's vocabulary, the current state of the constituent atoms it composes with, and (for AI rounds) the current state of reviewer models. A pattern that has survived five scheduled rescans without findings is materially more reliable than one that has survived one — the *number* of clean rescans is part of what `grounded` means in practice, even though the status word is the same.

A scheduled rescan can surface findings for reasons the prior round could not have caught. Three of the common cases:

- *A constituent atom has been refined since the last rescan*, gaining a new invariant or renaming a rejection reason; the composition's cross-references are now stale. This is the multi-file refinement order rule operating at the timescale of weeks rather than within a single sweep.
- *Methodology conventions added since the last rescan apply retroactively.* The two regulated-pattern conventions (Regulated adversarial scenarios; Generation acceptance) and the Audit-Trail-traversal-clearable / externally-clearable split from Multi-Party Approval's Round 3 are examples; both were applied retroactively to earlier patterns once codified.
- *The reviewer (human or AI) has improved.* An adversarial pass conducted today by a sharper reviewer than the prior round can surface a finding the prior round missed without the spec having changed.

A scheduled rescan that closes with no findings updates the rescan date in the Status line and adds a one-line Lineage entry: *"Scheduled rescan: YYYY-MM-DD — clean."* A scheduled rescan that surfaces findings is treated identically to a touch-triggered re-pass — full Lineage entry naming what each pass found, fixes applied, status preserved at `grounded` only if the round closes clean across all three passes. Findings from a scheduled rescan are not a failure of the prior round; they are the rescan doing its job.

For a pattern carrying a vote-yes formal model, the rescan's formal-layer portion is three cheap mechanical steps, all of which ride this same cadence: (1) re-run the model and its buggy twin through `tools/harness/` (the twin must still be rejected); (2) run the **coverage cross-check** (see §"The coverage cross-check") — emit the coverage matrix, route any GAP row as a finding; (3) take the one bound-saturation bump. None of these requires new tooling or heavier search; the coverage cross-check in particular is the highest-yield-per-minute step for closing the property-fidelity residual, which is why it belongs in every formal-layer rescan rather than in an occasional special pass.

The cadence is deployment-shaped. The working default is weekly with weekends as the batch window, but a library churning slowly may rescan less often, and a library under active multi-author refinement may rescan more often. The discipline is that the cadence is *fixed and externally driven*, not "when somebody remembers." The whole point is to ratchet confidence on a rhythm independent of any particular author's attention.

---

## Where the journey gets recorded

Each pattern's spec carries a **Lineage notes** section that records what each pass surfaced and how it was resolved. The arc is the artifact: future readers see *why* the spec is the shape it is, not just *what* shape it landed in.

See [`atoms/productivity/personal-todo.md`](atoms/productivity/personal-todo.md) for a worked example. Two passes recorded explicitly; ten gaps closed across the two; three deferred concerns named as out-of-scope. The Lineage notes section is the *evidence* the pattern has been pressure-tested.

A freshly-drafted pattern's Lineage notes are short or absent — there is nothing to record yet. As the pattern survives passes, the section accumulates. A pattern with no Lineage notes is not necessarily un-pressure-tested, but a pattern with rich Lineage notes is provably *evidence-bearing*.

---

## Recursive application

The methodology applied to a pattern produces Lineage notes. The Lineage notes themselves can be pressure-tested by re-running the three passes — does the recorded reasoning hold up under structural, conceptual-independence, and adversarial scrutiny?

The methodology document itself is subject to its own three passes. This file has been written through the same arc that produced Personal Todo: name the structure, check for over-absorption, attack the remaining vagueness. If you find this document hand-waving anywhere, that is a Pass-3 finding against the methodology, and it should be fixed here the same way it would be fixed in any other spec.

Each fresh application of the methodology becomes evidence the architecture is doing real work — both for the pattern under review and for the methodology itself.

---

## Three classes of gap, three classes of fix

| Phase | Pass | Class of gap | Lens | Typical fix |
|-------|------|--------------|------|-------------|
| 1–3 | 1 — GRID | Missing pieces | Structural completeness | Specify the missing node; resolve dangling references |
| 1–3 | 2 — EOS | Over-absorption | Conceptual independence | Extract the concern as a separate atom; document the composition |
| 1–3 | 3 — Linus | Hidden decisions | Adversarial scrutiny | State the load-bearing decision explicitly; tighten invariants; add rejection-path examples |
| 4 | Clearance gate | Foundational / refining / rhetorical findings | Opus — Happy Torvalds X2 | Close foundational gaps (blocks grounding); close refining findings in-pattern (does not block); record rhetorical findings with classification (does not block). Ground at zero foundational — the 92%-good threshold; see §"What grounded means" |

A pattern is `grounded` when rows 1–3 are clean and row 4's foundational-finding count is zero. Until then, the pattern is *in process* — and that is a respectable state to be in, provided the actual state is declared honestly.

---

*The shortest path to a grounded pattern is to run all three passes early and iterate through as many refinement rounds as the pattern needs. The longest path is to declare `grounded` prematurely — whether after one pass or after three passes that were not adversarial enough. Premature grounding means the spec, the implementations that depend on it, and the contributors who reviewed it must all be revisited together when the gaps surface later. Refinement passes are cheaper before `grounded` than after.*
