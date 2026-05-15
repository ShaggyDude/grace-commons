---
title: Spec Format
nav_order: 5
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

## Purpose and scope

The Grace Commons library expresses every pattern as structured natural language with a fixed set of named sections in a fixed order. Section names are load-bearing — they signal to humans and AI readers what kind of content lives where, and they let the pressure-testing methodology (GRID structural completeness, EOS conceptual independence, Linus adversarial scrutiny) operate against predictable structure. Deviations from the canonical shape are review findings, not stylistic choices.

This document does not duplicate the methodology — see [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) for what each pass checks. It enumerates the *containers*; the methodology checks the *contents*.

Three shapes are canonical:

1. **Atom shape** — a freestanding concept's specification. Specification does not name another atom. Files live in `atoms/<category>/`.
2. **Composition shape** — a composition of two or more atoms. Specification names the atoms it composes. Files live in `compositions/`.
3. **Regulated overlay** — additional mandatory sections that apply to any pattern (atom or composition) whose acceptance bar is set by an external evaluator (regulator, auditor). Applies to atoms in `atoms/compliance/`, to atoms in other categories whose examples invoke regulated domains, and to any composition naming a regulated atom.

The overlay is *additive*: a regulated atom carries the atom shape's sections plus the overlay's two extra sections. A regulated composition carries the composition shape's sections plus the overlay's two extras.

---

## Atom shape

Reference examples: [`atoms/productivity/personal-todo.md`](./atoms/productivity/personal-todo.md) for the simplest non-regulated shape; [`atoms/compliance/actor-identity.md`](./atoms/compliance/actor-identity.md) for the regulated shape with the overlay.

### Required sections, in order

1. **Frontmatter** (Jekyll: `title`, `parent`, `nav_order`, `has_toc`, `toc`). Drives site rendering; the site nav order is per-category.

2. **Title and summary blockquote.** The atom's name as an H1, followed immediately by a one-paragraph blockquote summarizing what the atom is, what concern it isolates, and what its load-bearing contribution to a composing system is. The blockquote is the elevator pitch a reader sees before scrolling.

3. **Intent.** Several paragraphs of prose explaining the business or regulatory problem the atom addresses, why the concern recurs across domains, and what the atom does and does not commit to. The Intent must be testable — falsifiable by observable behavior of an implementation. This is GRID's Intent node.

4. **Summary.** *(Required for specs over 200 lines; optional but encouraged for shorter specs.)* A 4–6 line plain-English description of what the atom does, what it guarantees, and its most common uses. Placed immediately after Intent. Written assuming intelligence, not vocabulary — define any key terms inline rather than expecting the reader to bring them. The purpose is explicit: give both human readers and AI models a reliable anchor before they enter the atom's machinery. Do not trust implicit comprehension; a reader or model that skims Intent and pattern-matches on vocabulary will occasionally construct the wrong mental model, and wrong mental models compound across every spec that builds on this one. A well-authored Summary forecloses that. The system teaches itself — each Summary that defines its terms inline builds the reader's vocabulary without requiring them to look anything up.

   Template:
   ```md
   ## Summary
   This atom enforces a hard capacity limit on shared resource pools. It guarantees
   that total allocated units never exceed the declared capacity, using a
   hold-then-confirm lifecycle (a two-step process where resources are reserved first
   and confirmed only when the calling system commits). Common uses include seat
   inventory, hospital beds, credit limits, and connection pools.
   ```

6. **Identity model.** What identifies an instance of the atom's primary record. State explicitly whether identity is an opaque system-generated id (the usual answer) and which fields are immutable properties set on the creating action. Never use a content field (description, name, reason) as identity. Identity model precision is the single most common Pass 3 finding when missing.

7. **Inputs and Outputs.** What the atom takes and produces. For each input: the type, validity rules (empty allowed? whitespace? Unicode normalization? length cap?), and rejection-reason name if violated. For each output: the shape and which fields are present in which states.

8. **State.** The state machine. Name every state, every transition, and the action that drives each transition. Terminal states are named explicitly. State must name what changes and under what condition. This is GRID's State node.

9. **Flow.** The lifecycle a typical record traverses from creation to terminal state, with the actions that drive each step. At least one branch must be named (happy path versus rejection, or two valid lifecycle paths). This is GRID's Flow node.

10. **Decision points.** Where the atom's logic chooses a path — quorum evaluation, eligibility check, rejection-priority ordering, etc. Each decision links to a State or Behavior node. This is GRID's Decision node.

11. **Behavior.** The observable consequences of each action — what the caller sees, what state has changed, what records have been written. Behavior must be observable, not inferred. This is GRID's Behavior node.

12. **Feedback.** The signals the atom produces that a composing system can read — measurable counts, status fields, returned tuples, observable rejection codes. Feedback must be tied to a specific signal or metric. This is GRID's Feedback node.

13. **Invariants.** Named descriptively first, then numbered. Format: `**Invariant N — Descriptive name.** Statement.` Never letter-prefix codes (no Invariant A.1, B.2). Each invariant is a property that holds across every reachable state of the atom; together they are what an implementation must produce records to prove. This is GRID's Proof node.

14. **Examples.** A happy-path walkthrough and at least one rejection-path walkthrough using concrete values. Examples expose what the actions actually look like in use; happy-path-only examples are a Pass 3 finding.

15. **Edge cases and explicit non-goals.** Out-of-scope concerns named explicitly, each pointing at the composing pattern or external mechanism that owns the concern. Edge cases that name another atom or composition do so by link, with `*(forthcoming)*` if the referenced pattern hasn't landed yet.

16. **Composition notes.** Which composing patterns name this atom (with links). New entries land here when a new composition is grounded; forthcoming-links resolve when the composition lands.

17. **Standards references.** The regulatory or industry standards the atom's invariants satisfy or contribute toward, with section anchors where applicable. Cite only standards that genuinely apply at this layer; frame standards that belong to a composing pattern as the composing pattern's obligation.

18. **Status.** A one-line status indicator (`grounded — last full rescan: YYYY-MM-DD` for a grounded atom, `partially resolved` for an atom that has not completed all required passes, or `draft` for a freshly authored atom). See [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) for the status taxonomy.

19. **Lineage notes.** The per-pattern record of what each pressure-testing pass surfaced and how it was resolved. Pass 1 GRID findings, Pass 2 EOS extractions, Pass 3 Linus fixes, and any Round 2 / Round 3 / scheduled-rescan entries — what was found, what was closed in-pattern, what was deferred as explicit out-of-scope. The Lineage notes section is the evidence the atom has been pressure-tested; an absence here is not necessarily a problem but a rich Lineage section is provably evidence-bearing.

---

## Composition shape

Reference examples: [`compositions/idempotent-reservation.md`](./compositions/idempotent-reservation.md) for the simplest two-atom composition; [`compositions/audit-trail.md`](./compositions/audit-trail.md) and [`compositions/defensible-retention.md`](./compositions/defensible-retention.md) for the regulated four- and three-atom canonical examples.

### Required sections, in order

1. **Frontmatter, title, summary blockquote.** Same as atom shape. The blockquote captures what the composition wires together and what the emergent guarantee is.

2. **Intent.** Several paragraphs explaining the friction at the boundary between the composed atoms, the emergent rule the composition exists to enforce, and what the composition is *not* (typically: not a new primitive — the constituent atoms are unchanged).

3. **Summary.** *(Required for compositions over 200 lines — which is nearly all of them.)* Same rule as the atom shape: 4–6 lines, plain English, assume intelligence not vocabulary, define key terms inline. For compositions, the Summary should also name what the composition wires together and what emergent guarantee results — the thing no single constituent atom can provide alone.

5. **Composes.** A list of the constituent atoms (or substrate compositions — see *Compositions of compositions* below). Each entry: the constituent's name (linked), a one-line description of the role it plays in this composition, and a note on how the composition uses its surface (which actions are wrapped, which queries are passed through, which state is consulted).

4. **Composition logic.** The main body of the composition's specification. Always contains the following named subsections, in this order:

   - **Application state** — the emergent state the composition owns (maps, indexes, derived records) that does not belong to any single constituent. For each state element: what it maps, what populates it, what removes it, and what reads it. The State node's completeness rule (*what changes and under what condition*) is verified against this subsection.

   - **Configuration** — deployment-settable knobs. Each knob: its name, type, default value, and the rule the deployment uses to set it (regulated deployments must use *X*; deployments under regulation *Y* must not configure *Z*). The configuration surface is what a deployment touches to specialize the composition; if the spec is silent, the runtime fills the gap silently — a Pass 3 finding.

   - **Primitive policies** — composition-boundary input validation rules for every string-typed input the composition accepts (record references, actor references, credentials, reasons, identifiers, optional timestamps). For each input: empty allowed? whitespace? normalization? case-sensitivity? length cap? where validation occurs (composition layer or propagated from a constituent)? This subsection forecloses the "but what does *X* mean exactly?" Pass 3 finding by stating the rules up front. Added as a canonical subsection in Defensible Retention's Round 3.

   - **Action wiring** — the orchestrating actions the composition exposes. Each action: its signature (`action(args) → result | rejected(reason | reason | ...)`), the rejection taxonomy enumerated, and numbered steps walking the action's flow. Steps name constituent calls, emergent state updates, audit recordings, and return points. Every constituent rejection is mapped (propagated, renamed, or surfaced as a new code at the composition's boundary); silent rejection-code drift is a Pass 1 reference-graph finding.

   - **The load-bearing wiring decision** — the structural reason the composition exists. Each composition turns on one decision the constituents cannot make alone (a quorum evaluation, a hold-blocks-purge gate, a cascade rule). This subsection names that decision and defends it in-line in four parts: *Principle* (the rule the decision enforces), *Likely objection* (the question a sharp reader would ask), *Mechanism that resolves it* (why the decision lives at the composition layer rather than being pushed into a constituent or out to the calling layer), and *Result* (what the decision produces structurally — typically a records-alone-defensible signal). The defended-in-line discipline prevents Pass 3 from re-litigating a settled architectural choice; the choice is made visible and justified up front.

6. **Application-level invariants.** The emergent invariants — properties that arise only at composition time and belong to no single constituent. Numbered, descriptively named. Each invariant should reference the constituent invariants it depends on and the action wiring step that establishes it. The composition's defending claim is that each of these invariants holds; the Generation acceptance section is how an auditor verifies it.

7. **Examples.** A walkthrough using concrete values (an end-to-end run of the load-bearing action sequence) plus several domain examples that exercise different regulatory regimes or different parameter combinations. The walkthrough must show the load-bearing wiring decision firing in both its accepting and rejecting modes if applicable; happy-path-only examples are a Pass 3 finding.

8. **Edge cases and explicit non-goals.** Same structure as atom shape — out-of-scope concerns named explicitly with the composing pattern or external mechanism that owns each. Cross-store consistency under failure (for compositions that write to multiple stores in sequence) is a canonical edge case that should be addressed for every multi-step action.

9. **Standards references.** Regulations and industry standards the composition satisfies — typically broader than any single constituent because the composition is what produces the records-alone defensibility the regulation actually requires.

10. **Status.** Same form as atom shape.

11. **Lineage notes.** Same form as atom shape, with one addition: a *Structural milestone* paragraph naming which forthcoming-link debts the composition retires. New compositions typically resolve one or more `*(forthcoming)*` references that previous patterns left behind; making this explicit closes the loop on the library's accumulating cross-reference surface.

### Compositions of compositions

A composition may name another composition as a substrate rather than re-listing its constituent atoms. Audit Trail composes four atoms; Defensible Retention names *Audit Trail* in its Composes section rather than re-listing the four. The convention: a substrate composition is named in Composes the same way an atom is named, with a note that its constituents are reached transitively rather than maintained as separate instances at this layer.

---

## Regulated overlay

Applies to any atom in `atoms/compliance/`, any atom in another category whose acceptance bar is set by an external evaluator, and any composition naming a regulated atom. Two additional sections are *required* — they sit alongside the standard sections of the atom or composition shape, not in place of them.

### Required additions

**Regulated adversarial scenarios** — an Examples subsection (placed after the standard happy-path and domain examples within the Examples section). Walks three canonical adversarial reads:

- *Regulator audit* — a regulator (or internal auditor) queries the records to verify a specific claim. The records must return the expected result *by virtue of an invariant*, not by the implementer's word. Names the specific invariant the query rests on.
- *Disputed transaction or data-subject request* — an external party challenges the system's claim about a particular record (a hold was not really placed, an attestation was forged, a retention period was misapplied). The records must answer the challenge structurally; the relevant invariants are the rebuttal.
- *Breach or incident investigation* — an investigator queries the records during or after an anomaly to reconstruct what happened. Names how the records bound the forensic window and which seal or attestation provides the integrity rebuttal.

All three must be walked; conflating them into one scenario loses the structural three-class requirement and is a Pass 3 finding.

**Generation acceptance** — a standalone section (placed after Examples, before Edge cases and explicit non-goals). Names what a derived implementation must produce, framed as the bar an external auditor must be able to clear *from the records alone*, with no recourse to source code, runbooks, or developer narration. Typically four-to-six checks for atoms; for compositions, the checks split into two named subsections:

- **Audit-Trail-traversal-clearable checks** — the checks an auditor can answer by reading the composition's records (including the Audit Trail substrate where applicable). Each check references the application-level invariant it verifies.
- **Externally-clearable checks** — questions that arise around the composition but require external evidence (a Policy Registry, a Permissions registry, court documentation) to answer. These are the *audit-gap* questions — important to surface, but not the composition's own contract to satisfy.

The split convention was established in Multi-Party Approval's Round 3 and applied retroactively to regulated compositions; the bar an external auditor can clear from the records alone is structurally distinct from the bar the composing organization must clear with its own governance evidence.

Both regulated-overlay conventions are *inherited from the methodology directly* (see [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md)'s *Regulated-pattern conventions*), not re-derived from predecessor patterns. Lineage notes for new regulated patterns cite the methodology, not earlier worked examples.

---

## What's not in this document

This document enumerates sections. It does not enumerate authoring conventions — those live in [`CLAUDE.md`](./CLAUDE.md) and are reinforced by [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md). The conventions every section must honor (regardless of which shape) include:

- **Assume intelligence, not vocabulary.** Write for a smart reader who may not share your specific technical vocabulary. Define key terms inline at first use — in the Summary, in the Intent, and anywhere a term is load-bearing. The spec should teach the reader the vocabulary it needs them to know, not assume they already have it. This is the mechanism by which the library teaches itself: each spec that defines its terms consistently builds the reader's vocabulary without requiring them to look anything up elsewhere.
- Invariants named descriptively first, then numbered (never letter-prefix codes)
- Identity model explicit, opaque-id over content-field
- Action signatures explicit, with every rejection reason named
- Defended-in-line: architectural claims state principle, likely objection, mechanism, result
- Edge cases name composing patterns by link
- Standards inheritance is selective (cite what genuinely applies at this layer)

This document also does not enumerate the *content* expected at each pass. That is the methodology's job — Pass 1's GRID completeness rules, Pass 2's EOS extraction questions, Pass 3's adversarial question set. See [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md).

---

## When to deviate

The canonical shape is the default. A pattern may legitimately omit a section if the section is *not applicable* — for example, an atom with no configurable deployment knobs has no Configuration subsection. A pattern may *not* legitimately omit a section because the author hasn't thought through what would go there; that's a draft-quality issue and a Pass 1 finding once the spec enters review.

A pattern in `draft` or `partially resolved` status may carry a section labeled explicitly `not-yet-drafted` so the pressure-testing rounds can act on the gap as a finding rather than missing it as silent omission. This is the discipline the drafter agent in the Gas City spec council uses: produce every required section or mark the section's content `not-yet-drafted`.

---

## Reference: canonical examples by shape

| Shape | Canonical example | Why it's the reference |
|-------|-------------------|-----------------------|
| Atom — simplest | [`Personal Todo`](./atoms/productivity/personal-todo.md) | Smallest atom with a two-iteration Lineage record |
| Atom — regulated | [`Actor Identity`](./atoms/compliance/actor-identity.md) | Carries both regulated-overlay conventions |
| Composition — simplest | [`Idempotent Reservation`](./compositions/idempotent-reservation.md) | Two-atom composition with all required sections |
| Composition — substrate use | [`Audit Trail`](./compositions/audit-trail.md) | Composes four atoms; the canonical regulated-audit substrate other compositions name |
| Composition — composition-of-composition | [`Defensible Retention`](./compositions/defensible-retention.md) | Names Audit Trail as a substrate composition rather than re-listing its four atoms; carries the full regulated overlay including the Generation acceptance split |

When drafting a new pattern, additionally read the most structurally adjacent existing pattern — mirror its shape. The canonical examples above are the references for *new* patterns; existing patterns in the same category are the references for *extensions* of an established pattern family.

---

## Status

`grounded — last full rescan: 2026-05-13` — first version of the canonical spec format reference. Enumerates the three shapes (atom, composition, regulated overlay) as they have been used across the library's eighteen atoms and seven compositions through Defensible Retention's Round 3. Future refinements will land via the standard scheduled-rescan and touch-triggered re-pass disciplines.
