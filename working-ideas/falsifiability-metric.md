# Falsifiability metric — emergent-invariant growth (draft, 2026-06-12)

> **Status: internal staging, not canonical.** A defensible definition of the metric that makes the Grace Commons thesis falsifiable, drafted for the 2026-06-24 call and as the honest version of a claim previously made hand-wavily ("emergent invariants per composition stays flat"). Corrects an external-review draft (Grok, 2026-06-12) whose counting rule double-counted preservation invariants. Nothing here is canon; if adopted it folds into `the-spec-layer.md` (the thesis-as-experiment framing) with the *computation* living as a generated view, never a hand-maintained snapshot (no-snapshot rule). Cross-refs: `pressure-testing.md` §the three gates, §The no-snapshot rule; `roadmap.md` (SSOT for counts).

---

## The claim under test

The library's thesis is that **composition is sub-linear**: wiring n freestanding concepts together costs far less than the product of their complexity, because separation is the default and entanglement must be explicitly declared. The measurable consequence: as the corpus grows, the *new* must-be-trues a composition introduces — the ones no constituent owns — stay **bounded per composition**, and the atom taxonomy **saturates** (new atoms get rarer; new compositions are mostly wiring over an existing vocabulary).

The thesis **fails** if the opposite holds: every new composition keeps minting emergent invariants that cannot be refactored into atoms, so the seam cost grows with the corpus instead of flattening. That is the feature-interaction nightmare (telecom) reappearing — and it is exactly what the metric must be able to detect.

## Why the naive count is wrong (the correction)

A composition's "Composition-level invariants" section is **not** a list of emergent invariants. It mixes three species, and only one counts:

- **Emergent** — a must-be-true no single constituent owns, introducing state or a constraint that exists only at the seam. *(Counts.)* Example: Undo History's *identity preservation across delete/undo*; Attributed Permissions Admin's *attestation exclusivity* (Inv 7).
- **Preservation** — "constituent X's invariants hold over the derived state." *(Does not count — it asserts the constituent still works, not that anything new is true.)* Example: Undo History Inv 4 ("Personal Todo's invariants are preserved"), Inv 5 ("Event Log's invariants are preserved"); APA Inv 5 ("Constituent invariants preserved").
- **Structural / typing** — entailed by the wiring's declared shape (range validity, etc.). *(Does not count — by-construction, no new obligation.)*

So the raw section counts (Undo History 7, APA 8) are **not** the metric. Filtered to genuinely emergent: Undo History ≈ 5 (drop Inv 4, 5), APA ≈ 7 (drop Inv 5). Using the raw number would both over-count and be gameable — split a preservation invariant to inflate, or hide an emergent one in prose to deflate.

## Counting rule (anchored to the gates, not invented fresh)

An invariant counts toward a composition's **emergent load** iff it passes the gates the library already uses to decide what is emergent (`pressure-testing.md` §the three gates):

1. **Named.** It appears as a named invariant in the composition's Composition-level invariants section (prose-only must-be-trues are a separate finding — promote, don't count loosely).
2. **No constituent owns it** (Gate 2). Violating it is not a violation of any single constituent's own stated invariants — it is a failure of the interaction. This excludes preservation invariants by construction.
3. **It introduces new state or a new cross-constituent constraint** (Gate 3 — the decisive test). It is not entailed by the wiring's declared types (excludes structural/typing invariants) and not the mechanical conjunction of constituent invariants.

The unit of measurement is the **top-level composition** (the wiring unit that produces a runnable surface). A substrate composition reused by another is counted once, in its own right; the composing pattern counts only the *additional* emergent invariants it introduces on top of the substrate — otherwise substrate invariants get recounted in every consumer and the metric inflates with reuse (which would perversely punish the architecture's best move).

## The extraction adjustment (the part the naive version misses)

The metric is not raw emergent count — it is emergent count **net of extraction pressure**. The architecture's response to a *recurring* emergent invariant is to promote it to a new atom (Gate 1 recurrence → extraction), after which it stops being emergent anywhere. So two derived signals matter more than the raw count:

- **Extraction-resistant rate.** Of the emergent invariants introduced over the last N groundings, what fraction are *novel and non-recurring* (genuine one-offs, fine) versus *recurring but un-extracted* (the warning sign — a seam the taxonomy should have absorbed but didn't)? A rising un-extracted-recurrence rate is the real red flag, not the raw count.
- **Taxonomy saturation.** New-atom groundings per M new compositions. The thesis predicts this trends *down* — the vocabulary stabilizes. If every new composition still needs a new atom, concepts aren't actually freestanding/reusable.

## Trip-wires (provisional — values are placeholders, not canon)

Stated as a shape, not a snapshot (per the no-snapshot rule the *current numbers* live in the generated view, never here):

- **Green:** emergent-per-composition bounded (small constant) as the corpus grows; un-extracted-recurrence near zero; new-atom rate trending down.
- **Yellow:** emergent count rising but concentrated in a few hot domains (e.g. permission/consent-heavy compositions), and the hot ones are extraction candidates not yet acted on. A backlog signal, not a thesis crisis.
- **Red (thesis stress):** emergent-per-composition rising corpus-wide **and** a persistent population of recurring emergent invariants that resist atomization — i.e. extraction stops keeping pace. This is the falsifier.

The trip-wire is a *direction and a mechanism*, deliberately not a magic number — a single threshold would itself violate the no-snapshot discipline and would be the kind of fake precision a sharp student should puncture.

## How it's measured — derive, don't lag

Faithful to the architecture's own rule: the metric is a **generated view over the specs**, not a hand-maintained table that drifts (the failure mode the no-snapshot rule exists to kill). A small script reads each composition's Composition-level invariants section, classifies each invariant (emergent / preservation / structural) by the gate criteria, and emits the current numbers on demand. The classification per invariant can be recorded *once* in each pattern's own Lineage (the coverage-cross-check already does invariant-by-invariant classification — this rides that surface), so the count is reconstructible and auditable, never snapshotted into a core doc. Counts, as always, resolve through `roadmap.md`.

First action (pre-call): run the filter by hand on the two richest cases (APA, Undo History) to record baseline emergent-vs-preservation splits and confirm the gate classification is unambiguous on real specs. If two readers disagree on whether a given invariant is emergent, the *criterion* needs sharpening before the metric is trustworthy — that disagreement is itself a useful finding.

## Worked baseline (done 2026-06-12)

Ran the filter by hand on both richest specs. Headline: **the raw section counts overstate emergent load by 25–30%**, and the pass surfaced a *third* non-counting bucket the rule did not anticipate.

**Attributed Permissions Admin — 8 named → 6 emergent.**

| # | Invariant | Class | Why |
|---|---|---|---|
| 1 | Attribution completeness | **emergent** | the `grant_attribution` map is composition state; no constituent owns it |
| 2 | Revocation attribution | **emergent** | the `revocation_attribution` map; same |
| 3 | Attribution recoverability | *entailed* | spec says "per Invariant 1" — a derived query over existing state, not a fresh obligation |
| 4 | Attribution-time monotonicity | **emergent** | cross-store ordering (`attested_at ≤ granted_at`) neither store owns alone |
| 5 | Constituent invariants preserved | *preservation* | asserts the constituents still hold; no new truth |
| 6 | Pairing-map durability | **emergent** | durability of composition-owned map state |
| 7 | Attestation exclusivity | **emergent** | the showcase one — the seam the Round 1 model surfaced |
| 8 | Orphan-log durability | **emergent** | durability of composition-owned orphan log |

**Undo History — 7 named → 5 emergent.**

| # | Invariant | Class | Why |
|---|---|---|---|
| 1 | Log faithfulness | **emergent** | the action↔append contract; neither atom owns it |
| 2 | State equivalence | **emergent** | visible state = replay; the event-sourcing seam |
| 3 | Undo targets most-recent forward event | **emergent** | undo semantics; the modeled property |
| 4 | Personal Todo's invariants preserved | *preservation* | constituent still holds |
| 5 | Event Log's invariants preserved | *preservation* | constituent still holds |
| 6 | Identity preservation across delete/undo | **emergent** | the showcase emergent property |
| 7 | Reachability of prior states | **emergent** | undo-reachability; neither atom owns it |

**Findings:**

1. **Raw counts are not the metric** — confirmed concretely: 8→6 and 7→5. A reader who saw "Event Log's invariants are preserved" tallied as an *emergent* invariant would (rightly) distrust the whole number. The gates fix this cleanly.
2. **The rule needs a third non-counting bucket: *entailed*.** APA Invariant 3 is neither preservation (it's not "a constituent still holds") nor a fresh emergent obligation — it is *recoverability entailed by completeness*, a derived query the spec itself marks "per Invariant 1." It must not count (it adds no independent seam) but it isn't preservation either. **Action:** the counting rule's exclusion list becomes three buckets — preservation, structural/by-construction, and **entailed-by-another-invariant** — and the generated view classifies into four total (emergent + the three exclusions). This is exactly the kind of sharpening the baseline pass existed to surface.
3. **Classification was unambiguous on all 15 invariants** once "entailed" was admitted — no judgment calls left genuinely contested, which is the precondition for trusting the metric. The two showcase emergent invariants (APA-7, Undo-6) are also the two the formal models target — a nice corroboration that "emergent" and "load-bearing enough to model" track each other.

## What to say on the 24th

> "The thesis is falsifiable and the experiment is instrumented in principle. The unit is emergent invariants per composition — *emergent* meaning it passes the same gates we use to decide what's a real seam versus just wiring, which excludes the preservation invariants that pad the raw counts. The honest part: the precise trip-wire is unspecified, because a single threshold would be fake precision. What we watch is a direction and a mechanism — does the atom taxonomy keep absorbing the recurring seams, or do compositions start minting emergent invariants that resist extraction? Twenty-four compositions in, extraction is keeping pace. Ask me again at a hundred."

This is stronger than a number you can't defend, and it invites exactly the scrutiny the architecture wants.

---

## Triage note on the external draft (Grok, 2026-06-12)

Kept: the priority call (do Q4 now, checklist later), the per-composition normalization instinct, the green/yellow/red shape, the "extraction reduces future count" observation (promoted here from a throwaway line to the core of the metric). Corrected: the counting rule (Grok counted all named section invariants, which double-counts preservation invariants — the central fix above); the emergence test (Grok's "no dependency declared in the wiring" is incoherent — wiring is where dependencies are declared; replaced with the gates); the storage location (Grok suggested a hand-maintained table in `measurement.md` — that risks the exact staleness the no-snapshot rule forbids; replaced with a generated view).
