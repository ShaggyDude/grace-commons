---
title: Spec Format
nav_order: 4
has_toc: true
toc: true
---

# Spec Format

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

> The canonical reference for the shape of a Grace Commons spec. Every grounded atom and composition in the library conforms to one of the three shapes enumerated here. This document is the authoritative source for what sections a spec must contain, what each section is for, and which sections are required versus optional. The drafter agent in the Gas City spec council reads from this document; future contributors — human or AI — derive a complete spec by following it.

---

## Three reading tiers

Every Grace Commons spec is written for three audiences simultaneously, and each section belongs to exactly one tier:

- **Tier 1 — Summary (anyone).** Plain language. Zero unexplained jargon. Every acronym spelled out and defined at first use, except the short common-acronym whitelist (see Authoring conventions). No assumed vocabulary. A non-engineer with domain knowledge (a compliance officer, a clinician, a product manager) should be able to read the Summary and understand what the pattern does, what it guarantees, and when they would use it. The formal layer carries the precision; the Summary carries the accessibility.
- **Tier 2 — Main text (technical readers).** Intent, state machine, action wiring, invariants, examples, edge cases. Can use domain and engineering terms, but every term that is not everyday English must be defined inline at its first appearance in the spec. Acronyms must be spelled out at first use globally — not just in the Summary, but anywhere they first appear in the document — except the short common-acronym whitelist (see Authoring conventions). "Emergent invariant" must be defined the first time it appears; so must GRID, EOS, HIPAA, PCI DSS, and every other initialisation or term-of-art. The main text is complete and defended; the formal layer can supersede it for precision but does not replace it for human communication.
- **Tier 3 — Formal models (experts only).** Alloy, TLA+, and associated artifacts. Dense and tight. Readers at this tier are expected to bring the vocabulary. These files are siblings of the canonical spec, not sections within it.

This three-tier discipline reflects the library's core bridge principle: the same canonical artifact must serve the compliance officer and the formal-methods engineer. Tier 1 is the bridge to the first; Tier 3 is the bridge to the second; Tier 2 is the shared crossing.

---

## Purpose and scope

The Grace Commons library expresses every pattern as structured natural language with a fixed set of named sections in a fixed order. Section names are load-bearing — they signal to humans and AI readers what kind of content lives where, and they let the pressure-testing methodology (GRID structural completeness, EOS conceptual independence, Linus adversarial scrutiny) operate against predictable structure. Deviations from the canonical shape are review findings, not stylistic choices.

This document does not duplicate the methodology — see [`pressure-testing.md`](./pressure-testing.md) for what each pass checks. It enumerates the *containers*; the methodology checks the *contents*.

Three shapes are canonical:

1. **Atom shape** — a freestanding concept's specification. Specification does not name another atom. Files live flat in `atoms/` (`atoms/<name>.md`); classification is derived, not a folder (see [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)).
2. **Composition shape** — a composition of two or more atoms. Specification names the atoms it composes. Files live in `compositions/`.
3. **Regulated overlay** — additional mandatory sections that apply to any pattern (atom or composition) whose acceptance bar is set by an external evaluator (regulator, auditor). Applies to atoms carrying the regulated overlay, to atoms in other categories whose examples invoke regulated domains, and to any composition naming a regulated atom.

The overlay is *additive*: a regulated atom carries the atom shape's sections plus the overlay's two extra sections. A regulated composition carries the composition shape's sections plus the overlay's two extras.

---

## Ownership seam with the Execution Contract

Two core documents describe a Grace Commons spec, and every rule about specs lives in exactly one of them. **This document owns the containers**: which sections exist, what each is for, their required order, the three shapes, and the three reading tiers. **The Execution Contract owns the runtime semantics of section contents**: what each section means to a conforming implementation — how it compiles, what it obligates at runtime, and what state a composition may carry ([`execution-contract.md`](./execution-contract.md)). Where a subsection here states what content must be present (a container question), the Contract states what that content means when lowered (a semantics question). No rule is stated in both documents. A rule that appears in both is a finding against whichever statement is not the owner's — this seam was assigned 2026-06-10 precisely because composition-state semantics had come to be claimed by both documents at once, and the two claims had diverged.

**The Contract's mapping tables are the SSOT bridge.** The Contract's two section-mapping tables — atom section → compilation target, and spec section → test type — are the canonical record of the correspondence between this document's section names and the runtime, together with the section-name classification that accompanies them there (§Section-name classification in the Contract). This document never restates that correspondence. A section renamed or added here without a corresponding classification entry there is silent drift — the same failure class as a mirrored library-state count — and the section-name lint check specified alongside the Contract's classification exists to catch it mechanically.

**Merge the view, not the source.** If a single unified "language reference" spanning containers and semantics is ever wanted, it is generated as a projection of this document and the Contract — text-canonical / views-derived, the library's own diagram discipline applied to its own documentation. The two sources do not merge: they serve different audiences (drafters versus implementers) and change at different rates, and a merged source would bury the human-bridge material in runtime semantics.

---

## Atom shape

Reference examples: [`atoms/personal-todo.md`](./atoms/personal-todo.md) for the simplest non-regulated shape; [`atoms/actor-identity.md`](./atoms/actor-identity.md) for the regulated shape with the overlay.

### Required sections, in order

1. **Frontmatter** (Jekyll: `title`, `parent`, `nav_order`, `has_toc`, `toc`). Drives site rendering; the site nav order is per-category.

2. **Title and summary blockquote.** The atom's name as an H1, followed immediately by a one-paragraph blockquote summarizing what the atom is, what responsibility it isolates, and what its load-bearing contribution to a composing system is. The blockquote is the elevator pitch a reader sees before scrolling.

3. **Intent.** Several paragraphs of prose explaining the business or regulatory problem the atom addresses, why that problem recurs across domains, and what the atom does and does not commit to. The Intent must be testable — falsifiable by observable behavior of an implementation. This is GRID's Intent node.

4. **Summary.** *(Grounded specs only — write the Summary as part of grounding confirmation, when the spec is stable enough to anchor from.)* **Tier 1 — plain language for anyone.** 3–6 sentences answering: what is this, what does it do, and what does it guarantee? Zero unexplained jargon. Every acronym spelled out and defined inline at first use, except the short common-acronym whitelist (see Authoring conventions). Every technical term that is not everyday English — including "invariant", "state machine", "composition", "atom" — defined in plain language the first time it appears in the Summary. The formal layer and the main text carry the precision; the Summary carries the accessibility. A Summary that a non-engineer with domain knowledge cannot read without a glossary is a Pass 1 finding.

5. **Identity model.** What identifies an instance of the atom's primary record. State explicitly whether identity is an opaque system-generated id (the usual answer) and which fields are immutable properties set on the creating action. Never use a content field (description, name, reason) as identity. Identity model precision is the single most common Pass 3 finding when missing.

7. **Inputs and Outputs.** What the atom takes and produces. For each input: the type, validity rules (empty allowed? whitespace? Unicode normalization? length cap?), and rejection-reason name if violated. For each output: the shape and which fields are present in which states.

8. **State.** The state machine. Name every state, every transition, and the action that drives each transition. Terminal states are named explicitly. State must name what changes and under what condition. This is GRID's State node.

9. **Flow.** The lifecycle a typical record traverses from creation to terminal state, with the actions that drive each step. At least one branch must be named (happy path versus rejection, or two valid lifecycle paths). This is GRID's Flow node.

10. **Decision points.** Where the atom's logic chooses a path — quorum evaluation, eligibility check, rejection-priority ordering, etc. Each decision links to a State or Behavior node. This is GRID's Decision node.

11. **Behavior.** The observable consequences of each action — what the caller sees, what state has changed, what records have been written. Behavior must be observable, not inferred. This is GRID's Behavior node.

12. **Feedback.** The signals the atom produces that a composing system can read — measurable counts, status fields, returned tuples, observable rejection codes. Feedback must be tied to a specific signal or metric. This is GRID's Feedback node.

13. **Invariants.** Named descriptively first, then numbered. Format: `**Invariant N — Descriptive name.** Statement.` Never letter-prefix codes (no Invariant A.1, B.2). Each invariant is a property that holds across every reachable state of the atom; together they are what an implementation must produce records to prove. This is GRID's Proof node.

14. **Examples.** A happy-path walkthrough and at least one rejection-path walkthrough using concrete values. Examples expose what the actions actually look like in use; happy-path-only examples are a Pass 3 finding.

15. **Edge cases and explicit non-goals.** Out-of-scope responsibilities named explicitly, each pointing at the composing pattern or external mechanism that owns it. Edge cases that name another atom or composition do so by link, with `*(forthcoming)*` if the referenced pattern hasn't landed yet.

16. **Composition notes.** Which composing patterns name this atom (with links). New entries land here when a new composition is grounded; forthcoming-links resolve when the composition lands.

17. **Standards references.** The regulatory or industry standards the atom's invariants satisfy or contribute toward, with section anchors where applicable. Cite only standards that genuinely apply at this layer; frame standards that belong to a composing pattern as the composing pattern's obligation.

18. **Status.** A status line carrying exactly one token of the canonical status grammar — [`pressure-testing.md`](./pressure-testing.md) §Status line format owns the token forms and their semantics; this document requires only the container (`## Status` section, token-first line).

19. **Lineage notes.** The per-pattern record of what each pressure-testing pass surfaced and how it was resolved. Pass 1 GRID findings, Pass 2 EOS extractions, Pass 3 Linus fixes, and any Round 2 / Round 3 / scheduled-rescan entries — what was found, what was closed in-pattern, what was deferred as explicit out-of-scope. The Lineage notes section is the evidence the atom has been pressure-tested; an absence here is not necessarily a problem but a rich Lineage section is provably evidence-bearing.

---

## Composition shape

Reference examples: [`compositions/idempotent-reservation.md`](./compositions/idempotent-reservation.md) for the simplest two-atom composition; [`compositions/audit-trail.md`](./compositions/audit-trail.md) and [`compositions/defensible-retention.md`](./compositions/defensible-retention.md) for the regulated four- and three-atom canonical examples.

### Required sections, in order

1. **Frontmatter, title, summary blockquote.** Same as atom shape. The blockquote captures what the composition wires together and what the emergent guarantee is.

2. **Intent.** Several paragraphs explaining the friction at the boundary between the composed atoms, the emergent rule the composition exists to enforce, and what the composition is *not* (typically: not a new primitive — the constituent atoms are unchanged).

3. **Summary.** *(Grounded specs only.)* Same Tier 1 rule as the atom shape: plain language for anyone, 3–6 sentences, zero unexplained jargon, every acronym spelled out and defined inline. For compositions, name what the composition wires together and what the resulting guarantee is — the property no single constituent can provide alone — in plain terms. "Composition guarantees that only appear when the atoms work together" is the plain-language form of "emergent invariant"; use whichever fits the sentence, but define the term the first time it appears.

4. **Composes.** A list of the constituent atoms (or substrate compositions — see *Compositions of compositions* below). Each entry: the constituent's name (linked), a one-line description of the role it plays in this composition, and a note on how the composition uses its surface (which actions are wrapped, which queries are passed through, which state is consulted).

5. **Composition logic.** The main body of the composition's specification. Always contains the following named subsections, in this order:

   - **Composition state** (titled `Application state` before the 2026-06-11 vocabulary direction; corpus headings migrate in the vocabulary sweep) — the emergent state the composition carries (maps, indexes, derived records) that does not belong to any single constituent. What a composition may carry, and what each classification *means*, are runtime semantics **owned by the Execution Contract** — see [`execution-contract.md`](./execution-contract.md) §Composition state; this document does not restate them. This subsection is the container. For each state element: what it maps, what populates it, what removes it, what reads it, and its Contract classification — *derived index* or *extraction-pending* — per §Composition state, supplying the per-element detail that section requires (the rebuild procedure for a derived index; the proposed atom for an extraction-pending element). The State node's completeness rule (*what changes and under what condition*) is verified against this subsection.

   - **Configuration** — deployment-settable knobs. Each knob: its name, type, default value, and the rule the deployment uses to set it (regulated deployments must use *X*; deployments under regulation *Y* must not configure *Z*). The configuration surface is what a deployment touches to specialize the composition; if the spec is silent, the runtime fills the gap silently — a Pass 3 finding.

   - **Primitive policies** — composition-boundary input validation rules for every string-typed input the composition accepts (record references, actor references, credentials, reasons, identifiers, optional timestamps). For each input: empty allowed? whitespace? normalization? case-sensitivity? length cap? where validation occurs (composition layer or propagated from a constituent)? This subsection forecloses the "but what does *X* mean exactly?" Pass 3 finding by stating the rules up front. Added as a canonical subsection in Defensible Retention's Round 3.

   - **Action wiring** — the orchestrating actions the composition exposes. Each action: its signature (`action(args) → result | rejected(reason | reason | ...)`), the rejection taxonomy enumerated, and numbered steps walking the action's flow. Steps name constituent calls, emergent state updates, audit recordings, and return points. Every constituent rejection is accounted for at the composition's boundary, mapped per the Contract's rejection-mapping rule (see [`execution-contract.md`](./execution-contract.md) §Substrate composition invocation); silent rejection-code drift is a Pass 1 reference-graph finding. The action surface may include **emergent actions** — actions that belong to no single constituent atom and exist only because the composition wires its constituents together. `undo()` in Undo History is the canonical example: neither Personal Todo nor Event Log has an undo surface; the composition introduces it as the action that makes the two atoms coherent. Emergent actions are expected and correct; their presence does not indicate over-absorption.

   - **The load-bearing wiring decision** — the structural reason the composition exists. Each composition turns on one decision the constituents cannot make alone (a quorum evaluation, a hold-blocks-purge gate, a cascade rule). This subsection names that decision and defends it in-line in four parts: *Principle* (the rule the decision enforces), *Likely objection* (the question a sharp reader would ask), *Mechanism that resolves it* (why the decision lives at the composition layer rather than being pushed into a constituent or out to the calling layer), and *Result* (what the decision produces structurally — typically a records-alone-defensible signal). The defended-in-line discipline prevents Pass 3 from re-litigating a settled architectural choice; the choice is made visible and justified up front.

6. **Composition-level invariants.** The emergent invariants — properties that arise only at composition time and belong to no single constituent. Numbered, descriptively named. Each invariant should reference the constituent invariants it depends on and the action wiring step that establishes it. The composition's defending claim is that each of these invariants holds; the Generation acceptance section is how an auditor verifies it.

7. **Examples.** A walkthrough using concrete values (an end-to-end run of the load-bearing action sequence) plus several domain examples that exercise different regulatory regimes or different parameter combinations. The walkthrough must show the load-bearing wiring decision firing in both its accepting and rejecting modes if applicable; happy-path-only examples are a Pass 3 finding.

8. **Edge cases and explicit non-goals.** Same structure as atom shape — out-of-scope responsibilities named explicitly with the composing pattern or external mechanism that owns each. Cross-store consistency under partial failure (for compositions that write to multiple stores in sequence) is a canonical edge case that should be addressed for every multi-step action.

9. **Standards references.** Regulations and industry standards the composition satisfies — typically broader than any single constituent because the composition is what produces the records-alone defensibility the regulation actually requires.

10. **Status.** Same form as atom shape.

11. **Lineage notes.** Same form as atom shape, with one addition: a *Structural milestone* paragraph naming which forthcoming-link debts the composition retires. New compositions typically resolve one or more `*(forthcoming)*` references that previous patterns left behind; making this explicit closes the loop on the library's accumulating cross-reference surface.

### Compositions of compositions

A composition may name another composition as a substrate rather than re-listing its constituent atoms. Audit Trail composes four atoms; Defensible Retention names *Audit Trail* in its Composes section rather than re-listing the four. The convention: a substrate composition is named in Composes the same way an atom is named, noting that its constituents are reached transitively. Instance topology — one shared instance by default, or deliberately declared multiple instances of the same atom — is a runtime-semantics rule owned by the Execution Contract; see [`execution-contract.md`](./execution-contract.md) §Substrate composition invocation.

---

## Regulated overlay

Applies to any atom carrying the regulated overlay, any atom in another category whose acceptance bar is set by an external evaluator, and any composition naming a regulated atom. Two additional sections are *required* — they sit alongside the standard sections of the atom or composition shape, not in place of them.

### Required additions

**Regulated adversarial scenarios** — an Examples subsection (placed after the standard happy-path and domain examples within the Examples section) that walks the three canonical adversarial reads: *regulator audit*, *disputed transaction or data-subject request*, and *breach or incident investigation*. All three must be walked; conflating them into one scenario loses the structural three-class requirement and is a Pass 3 finding. What each read must demonstrate — the invariant a regulator's query rests on, the structural rebuttal to a dispute, the forensic-window bound for a breach — is methodology content owned by [`pressure-testing.md`](./pressure-testing.md) §Regulated-pattern conventions; this document fixes only the subsection's placement and the three-class requirement.

**Generation acceptance** — a standalone section (placed after Examples, before Edge cases and explicit non-goals) naming what a derived implementation must produce. The bar — what an auditor must be able to clear *from the records alone*, with no recourse to source code, runbooks, or developer narration — is methodology content owned by [`pressure-testing.md`](./pressure-testing.md) §Regulated-pattern conventions. This document fixes the section's placement and, for compositions, its two-subsection structure:

- **Audit-Trail-traversal-clearable checks** — the checks an auditor can answer by reading the composition's records (including the Audit Trail substrate where applicable). Each check references the composition-level invariant it verifies.
- **Externally-clearable checks** — questions that arise around the composition but require external evidence (a Policy Registry, a Permissions registry, court documentation) to answer. These are the *audit-gap* questions — important to surface, but not the composition's own contract to satisfy.

The split convention was established in Multi-Party Approval's Round 3 and applied retroactively to regulated compositions; the bar an external auditor can clear from the records alone is structurally distinct from the bar the composing organization must clear with its own governance evidence.

Both regulated-overlay conventions are *inherited from the methodology directly* (see [`pressure-testing.md`](./pressure-testing.md)'s *Regulated-pattern conventions*), not re-derived from predecessor patterns. Lineage notes for new regulated patterns cite the methodology, not earlier worked examples.

---

## Cross-cutting authoring conventions — and what's not in this document

This document enumerates sections — and, as of 2026-06-11, it **owns the cross-cutting authoring conventions** every section must honor (ownership moved here from the session-bootstrap index — now `AGENTS.md`, reached via the `CLAUDE.md` shim — which carries only a pointer). [`pressure-testing.md`](./pressure-testing.md) enforces these conventions through its Pass 1 and Pass 3 questions without restating them, with one named exception: the defended-in-line *rubric* (Principle / Likely objection / Mechanism / Result) is methodology and stays owned by [`pressure-testing.md`](./pressure-testing.md) §Defending each claim in-line — the bullet below points there. The conventions, regardless of which shape:

- **Three reading tiers, always.** Every spec has a Summary (Tier 1 — anyone), a main text (Tier 2 — technical readers), and optional formal models (Tier 3 — experts). The Summary is plain language with zero unexplained jargon. The main text defines every non-everyday term inline at first use. Formal models are dense and expert-only. See *Three reading tiers* above.
- **Never leave an acronym unexplained — except the common-acronym whitelist.** Every acronym or initialisation (HIPAA, GDPR, EOS, GRID, NFC, PCI DSS, FATF, BSA, AML, CDD, KYC…) must be spelled out and briefly glossed the first time it appears in the document — in any section, not just the Summary. A reader who encounters an undefined acronym has hit a wall; the library's bridge principle requires a door instead. **The one exception is a short whitelist of universally-known acronyms,** fixed by an external test rather than a reviewer's taste: an acronym is exempt from spell-out only if it is a headword in a general English dictionary (equivalently, one a general-audience publication leaves undefined on first use). The seed list is **SMS, GPS, URL, HTML, US/USA, ID, PDF, FAQ**; it grows only by amending this line under the same test, never case-by-case inside a pattern. Everything domain-, legal-, or library-specific stays spelled out — the HIPAA/GDPR/GRID/KYC class above is exactly what the rule exists for — and a borderline term of art (API, OCAP) resolves toward spelling out, since the Tier-1 reader is a compliance officer or clinician, not an engineer. Conversely, *glossing* a whitelisted acronym (`SMS (Short Message Service…)`) is redundant noise and is itself a finding (the linter flags it).
- **Complete over concise (main text).** In the main text, a section is done when it fully conveys its intent — not when it hits a line count. Brevity that loses meaning is a defect; length that preserves it is a feature. This rule does *not* apply to the Summary, where concision is the discipline.
- **Assume intelligence, not vocabulary.** Write for a smart reader who may not share your specific technical vocabulary. Define key terms inline at first use — in the Summary, in the Intent, and anywhere a term is load-bearing. The spec should teach the reader the vocabulary it needs them to know, not assume they already have it. This is the mechanism by which the library teaches itself: each spec that defines its terms consistently builds the reader's vocabulary without requiring them to look anything up elsewhere.
- Invariants named descriptively first, then numbered (never letter-prefix codes)
- Identity model explicit, opaque-id over content-field
- Action signatures explicit, with every rejection reason named. Queries with multiple legitimate outcomes use first-class result tags rather than a success-or-reject pair; the tag set is per-query — two outcomes (`permitted | denied`), three (`verified | failed-verification(reason) | not-known`), or more (`granted | revoked | expired | not-known`) — no arm or arity is mandatory beyond fitting the query's real outcome space
- **All references explicit in all directions.** Any step, invariant, or claim that depends on content defined elsewhere must name that section explicitly. Any section that defines a mechanism used elsewhere must be named by those users. Implicit "you know where to look" cross-references are a Pass 3 finding.
- **Structural-relation invariants.** When a spec declares a relation — across constituents or self-referential — its required invariants are drawn from a fixed canonical set (referential integrity, orphan-freedom, inverse consistency, acyclicity / well-foundedness), surfaced with plain-language descriptions and precise forms in §Structural-relation invariant templates below. The governing semantics remain the methodology's Relations line ([`pressure-testing.md`](./pressure-testing.md) Pass 3 §Relations).
- Defended-in-line: every architectural claim follows the four-step rubric (principle, likely objection, mechanism, result) owned by [`pressure-testing.md`](./pressure-testing.md) §Defending each claim in-line
- Edge cases name composing patterns by link
- Standards inheritance is selective (cite what genuinely applies at this layer)

This document also does not enumerate the *content* expected at each pass. That is the methodology's job — Pass 1's GRID completeness rules, Pass 2's EOS extraction questions, Pass 3's adversarial question set. See [`pressure-testing.md`](./pressure-testing.md).

Nor does it state the runtime semantics of any section's contents — those belong to the Execution Contract per the ownership seam above (see *Ownership seam with the Execution Contract*).

---

## Structural-relation invariant templates

Most of a spec describes one record's lifecycle. But the moment a record *points at another* — a composition wiring two constituents, or a record referencing its own kind — the **pointing itself** has to stay honest, and keeping it honest is no single record's own invariant. These are the small, fixed set of truth-conditions that do it: the relation-integrity primitives of the spec layer. When a spec declares a relation — its cardinality and modality, per [`pressure-testing.md`](./pressure-testing.md) Pass 3 §Relations — it draws its required invariants from this set rather than each author re-inventing the phrasing.

The property that defines the whole family — and the reason they live here as templates rather than as atoms — is that **a relation invariant owns no state of its own.** It is always a constraint *on a relation that some atom or composition already declares*, so it always has a host concept. (That is the exact line that kept *acyclicity* from becoming an atom: it constrains state owned elsewhere; it owns none itself.)

| Template | What it keeps honest | When it applies | Owns state? |
|---|---|---|---|
| **Referential integrity** | Every pointer leads somewhere real — no reference to a record that isn't there. | Any reference between records. | No |
| **Orphan-freedom** | A required link is never silently left dangling; if a failure breaks it, that is surfaced and repaired within the compensation window, not ignored. | Only where a side of the relation is *mandatory*. | No |
| **Inverse consistency** | "What points at me" agrees with "what I point at" — the relation reads the same from both ends. | Any relation read from both directions. | No — the inverse is a derived index |
| **Acyclicity / well-foundedness** | A thing can't contain itself, directly or down a chain — so the structure bottoms out and can be fully expanded. | Only where the relation is *self-referential* (a record related to its own kind: hierarchies, bills-of-materials, groupings). | No — the expanded view is a derived index |

**Precise forms — the verification surface under the plain language above.** *Referential integrity:* every reference resolves to an existing record of the named constituent. *Orphan-freedom* (only where a side is mandatory), stated **at quiescence** — safety (no action of this composition leaves a mandatory side unbound) plus liveness (a binding orphaned by partial failure is surfaced and reconciled within the declared compensation window), modulo declared compensation and the retention horizon — never a static "always both sides." *Inverse consistency:* the inverse direction agrees with the forward references, classified per [`execution-contract.md`](./execution-contract.md) §Composition state (derived index by default). *Acyclicity / well-foundedness* (only where the relation is self-referential — a constituent related to its own kind, directly or transitively): no record is its own ancestor under the relation's transitive closure, so the closure is well-founded and finite (a forest where single-parent, a DAG where multi-parent); the flattened / exploded view is a derived index per [`execution-contract.md`](./execution-contract.md) §Composition state, and where edges carry quantities the rollup sums diamond-correctly.

These are **owned here so tooling that auto-inserts them cites one home rather than minting phrasing; the governing semantics remain the methodology's Relations line** ([`pressure-testing.md`](./pressure-testing.md) Pass 3 §Relations). The set is fixed but extensible: referential integrity, orphan-freedom, and inverse consistency landed 2026-06-11 (guided-tool design review, F4); *acyclicity / well-foundedness* landed 2026-06-13, routed here by the concept-recovery exercise rather than promoted to a new atom precisely because it owns no state — the State Machine atom precedent was weighed and declined (see [`roadmap.md`](./roadmap.md) §Concept-recovery atom backlog and [`working-ideas/acyclic-recursive-composition-plan.md`](./working-ideas/acyclic-recursive-composition-plan.md)). A fifth member earns its place the same way: a relation-wide truth-condition that recurs and owns no state.

---

## When to deviate

The canonical shape is the default. A pattern may legitimately omit a section if the section is *not applicable* — for example, an atom with no configurable deployment knobs has no Configuration subsection. A pattern may *not* legitimately omit a section because the author hasn't thought through what would go there; that's a draft-quality issue and a Pass 1 finding once the spec enters review.

A pattern in `draft` or `partially resolved` status may carry a section labeled explicitly `not-yet-drafted` so the pressure-testing rounds can act on the gap as a finding rather than missing it as silent omission. This is the discipline the drafter agent in the Gas City spec council uses: produce every required section or mark the section's content `not-yet-drafted`.

---

## Reference: canonical examples by shape

| Shape | Canonical example | Why it's the reference |
|-------|-------------------|-----------------------|
| Atom — simplest | [`Personal Todo`](./atoms/personal-todo.md) | Smallest atom with a two-iteration Lineage record |
| Atom — regulated | [`Actor Identity`](./atoms/actor-identity.md) | Carries both regulated-overlay conventions |
| Composition — simplest | [`Idempotent Reservation`](./compositions/idempotent-reservation.md) | Two-atom composition with all required sections |
| Composition — substrate use | [`Audit Trail`](./compositions/audit-trail.md) | Composes four atoms; the canonical regulated-audit substrate other compositions name |
| Composition — composition-of-composition | [`Defensible Retention`](./compositions/defensible-retention.md) | Names Audit Trail as a substrate composition rather than re-listing its four atoms; carries the full regulated overlay including the Generation acceptance split |

When drafting a new pattern, additionally read the most structurally adjacent existing pattern — mirror its shape. The canonical examples above are the references for *new* patterns; existing patterns in the same category are the references for *extensions* of an established pattern family.

---

## Status.

`grounded — 2026-05-20` — first version of the canonical spec format reference. Enumerates the three shapes (atom, composition, regulated overlay) as exercised across the grounded corpus through Defensible Retention's Round 3 — [`roadmap.md`](./roadmap.md) is the single source of truth for the corpus's current contents and counts; this document states no library-state snapshot. Revised 2026-06-10 (Refactor 1): the ownership seam with the Execution Contract assigned (§Ownership seam with the Execution Contract), the composition-state subsection's semantics (then titled `Application state`) deferred to the Contract's composition-state rule, and the drifted pattern-count snapshot this line previously carried removed under the no-snapshot rule ([`CLAUDE.md`](./CLAUDE.md) §Current state of the library). Revised 2026-06-11: the cross-cutting authoring conventions gained the structural-relation invariant templates (guided-tool design review, F4), and the vocabulary direction landed — the composition shape's state subsection renamed `Application state` → **Composition state**, with the working nouns banned by lint rules J and K scoped out of this document. Revised 2026-06-13: the structural-relation invariant templates gained a fourth member — *acyclicity / well-foundedness* for self-referential relations — landing the concept-recovery exercise's strongest candidate as a template rather than a new atom (see [`roadmap.md`](./roadmap.md) §Concept-recovery atom backlog); the four templates were then promoted from an inline cross-cutting-conventions bullet to their own §Structural-relation invariant templates section with a plain-language table (presentation only — semantics unchanged, still cross-referenced to [`pressure-testing.md`](./pressure-testing.md) Pass 3 §Relations and [`execution-contract.md`](./execution-contract.md) §Composition state). Future refinements land via the standard scheduled-rescan and touch-triggered re-pass disciplines.
