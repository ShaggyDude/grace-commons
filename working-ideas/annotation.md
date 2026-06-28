# Annotation — Direction

**Status:** Direction — drafted, not yet ground; stays in `working-ideas/` and does not yet bind (advisory). The promotion gate is **not yet met**: it requires resolving the open fourth-kind question against the corpus, a `[Term]` resolver that renders on the live host plus a Term registry, an adapter that projects at least one identifier kind and one enumerated kind to one target, and one pattern round-tripped end-to-end with the formal harness still green (§The promotion gate). Promotion target: the annotation convention into [`spec-format.md`](../spec-format.md), with the registry and the adapter manifest as new artifacts.
**Covers:** how Grace prose *refers* to a canonical thing — the lightweight mark that says "I mean the canonical concept here, not two English words" — and the ontology (`kind`) and projection (adapters) that mark resolves against.
**Scope.** Representational only. It changes no guarantee, invariant, action-wiring step, or behavior. It changes *where casing and target-syntax live* (the adapter, never the canon) and *how the prose points at a concept*. It is the companion to [`naming.md`](./naming.md) (the one word a Term carries) and [`prose.md`](./prose.md) (the sentences around it): naming governs the word, prose governs the sentence, annotation governs the reference.

## The reframe: casing is projection, not canon

**Grace introduces a semantic type system for canonical prose.** Every named Term has exactly one ontological *kind*; adapters project those kinds into each target's syntax. "Semantic" is load-bearing: these kinds classify *meaning*, not programming-language types. That is the whole idea — the registry, the manifests, and the casing question that started all of this are *consequences* of it, not the point.

In one line: **formatting is not semantics — semantics belong to kinds, formatting belongs to projections.** Mixed snake_case and kebab-case were never the problem; they were the symptom that semantics had leaked into typography, and this pulls it back into the language.

With that in view, the snake-case-versus-kebab-case argument dissolves as misplaced. `event_scope` and `invalid-request` are not two styles of one thing; they are two *projections* of canonical concepts into one target's syntax — and the canonical layer should carry neither. The prose should name the concept — **Event Scope**, **Invalid Request** — and an adapter should emit `event_scope` / `eventScope` / `EventScope` / `INVALID_REQUEST` / `"invalid-request"` as each target requires.

Projection is already a solved problem in Grace's architecture: the formal-model adapters exist. Identifier casing is just more projection, so it leaves the canon entirely. What remains in the canon is the *reference* — the prose marking "Event Scope" as a canonical concept rather than two ordinary words, so a reader can follow it to its definition and a tool can resolve it to a projection.

The layers stack, and everything below **kind** is orthogonal:

```
Term         the named thing
  ↓
Kind         what it is — its ontology        (canonical)
  ↓
Role         its domain part — optional       (canonical)
  ↓
Projection   its target syntax — casing, …    (adapter)
```

## The membership test (the governing rule)

A distinction belongs in the canonical layer only if it passes **both** filters:

1. **Durability.** Could a future specification language, built on different implementation technology, rediscover this distinction independently? Yes → ontology (canonical). No → projection (adapter-only).
2. **Legibility.** Can a non-engineer with domain knowledge read the term without a glossary? (Grace's bridge bar.)

Casing fails (1): it is a target artifact. "Symbol" fails (1): it names how a compiler sees an identifier (a symbol table), not what a domain modeller means. "Datum" passes (1) but strains (2). Only distinctions that clear both belong in the canon; everything else is the adapter's.

## The Term ontology — the `kind` axis

The type system is an ordinary idea — mathematics, programming languages, ontologies, and databases all give every named thing a type — here applied to canonical prose. Every canonical reference is a **Term**, and every Term has **exactly one kind**. The classification is called *kind*, not *type*, on purpose: one of the kinds is literally Type, and "Event Log has type Type" is clumsy — so *kind* is the axis and *Type* is one of its values. Four kinds, each a distinction that survives a change of implementation technology:

| kind | what it is | example |
|------|------------|---------|
| **Type** | a thing or category in the model | Event Log; Rejection |
| **Operation** | a behavior | Fanout Shaped |
| **Member** | a value of an enumerated Type | Invalid Request (of Rejection) |
| **Property** *(provisional)* | a named datum belonging to a Type or Operation — the open fourth kind (see *Building the ontology from questions*) | Event Scope |

An enumerated set (Rejection) **is a Type**; its values are **Members** of it — so Member is not a sibling of Type but a value *of* one, kept level-consistent by a `member of:` relationship rather than a compound name like "Enum Member." **Symbol was rejected**: it fails the durability filter.

The single-kind rule is an invariant, not a convenience: a Term that genuinely resists exactly one kind is a finding against the ontology — the kinds are wrong or incomplete — which is part of what the corpus pressure-test checks.

## Building the ontology from questions

Each kind earns its place by answering one **fundamental question** — and that, not a list of nouns, is how the ontology is built and bounded. The three solid kinds, each by its question:

| kind | fundamental question |
|------|----------------------|
| Type | What is this? |
| Operation | What can happen? |
| Member | Which one is it? |

The fourth kind has no clean question yet, and we **stop trying to name it**: "What does it carry?" answers for a field of a Type; "what does it need?" answers for a parameter of an Operation — two questions, not one. The placeholder "Property" used elsewhere in this draft is exactly that, a placeholder; the corpus pressure-test, not a vote on nouns, resolves whether the fourth kind is one or two.

The method generalizes into a falsifiable process for evolving the ontology without letting it sprawl:

1. Every named Term has exactly one kind.
2. Every kind answers exactly one fundamental question.
3. A candidate answering no unique question is rejected — it is redundant, or it is projection.
4. A candidate answering two questions is two kinds; a question the corpus forces but no kind answers is a new kind.

This stands beside the two-filter membership test as the second governing rule: the filters decide what may enter the canon at all; the question test decides what counts as a *kind*. Symbol failed the filters; the unnamed fourth is failing — informatively — the question test.

## kind vs role — two axes, never mixed

Grace already teaches a second vocabulary — **Actor, Capability, Permission, Obligation, Outcome, Evidence** — and these are *not* kinds. They are **roles**: the domain part a Term plays. `kind` and `role` are orthogonal, and collapsing them reintroduces the level-mixing the membership test exists to prevent.

| Term | kind | role |
|------|------|------|
| Event Scope | Property | — |
| Fanout Shaped | Operation | — |
| Invalid Request | Member | Outcome |
| Study Coordinator | Type | Actor |
| Reset Token | Property | Capability |

"Invalid Request is `kind: Member`, `role: Outcome`" is clean; "Outcome Member," or treating Outcome as a kind, is not. Most Terms have a kind and no role; a role attaches only where the domain assigns one.

## The card and the manifest — meaning vs lowering

> **Kind is semantic; projection is the adapter's.**

That is the axiom the rest follows from — in the same family as the library's *the spec is canonical; code is derived*.

Each Term has a **card** (canonical, human) and a **manifest entry** (adapter, machine). The card teaches *what it is*; the manifest knows *how it lowers*. Nothing implementation-specific appears on the card.

**Card (canon — plain English):**

```
Event Scope
───────────
The named scope an event fires against; determines which
subscribers are considered for a fanout.
Kind: Property
```

```
Invalid Request
───────────────
The refusal Fanout Shaped returns when the request itself is
malformed — an empty scope, a missing payload.
Kind:      Member
Member of: Rejection
Role:      Outcome
```

**Manifest (adapter — cryptic is fine; it lives where the formal adapters already do):**

```
event-scope:
  kind:     property
  projects: { snake: event_scope, camel: eventScope, pascal: EventScope }

invalid-request:
  kind:     member
  of:       rejection
  projects: { const: INVALID_REQUEST, wire: "invalid-request" }
  wire:     pinned        # callers switch on the string; it may not change
```

Casing, the constant form, the pinned wire string — all manifest, never card. The card stays readable to a compliance officer; the manifest stays useful to a code generator.

## The annotation marker in prose

The mark must be visually light, unambiguous, ignorable in the rendered page, trivial to parse — and it must render on the live host (GitHub Pages, Jekyll safe mode, **no custom plugins**). That rules out `[[Event Scope]]` wiki-links (they need a plugin to resolve) and rules out overloading backticks (they already mean *verbatim literal token*, so reusing them re-imports the ambiguity we are removing). What clears every bar is a plain Markdown link to the Term's card:

- **Before (today):** `` Validate `event_scope`: non-empty; on failure → `rejected(invalid-request)`. ``
- **After (canon):** `Validate [Event Scope]: non-empty; on failure → [Invalid Request].`

`[Event Scope]` resolves (via a shortcut-reference definition, one per registry entry) to the Term's card — so the reader clicks through to the definition, and the parser resolves the same link to a projection. Backticks stay reserved for genuine verbatim literals (a wire string a reader must see exactly). The reference-definition set *is* the Term registry.

## "Literal" is not a kind

An earlier draft of this idea split "concept versus literal." That was wrong. `invalid-request` only *feels* literal because its wire projection is **pinned** — frozen because callers match on the exact string. "Pinned" is a flag on a projection in the manifest, not a fifth kind. There are kinds, and there are projection rules; "literal" is just the shadow a pinned projection casts.

## Open questions (the pressure-test queue)

1. **The fourth kind — unresolved, deliberately unnamed.** Run the question calculus (§Building the ontology from questions) against the corpus. Current evidence points to a *split*: "what does it carry?" (a field of a Type) and "what does it need?" (a parameter of an Operation) are different questions, so the fourth kind is likely two — **Field** and **Parameter**. Resolve the eventual name(s) against both filters only after the question(s) settle; today's candidates each fail one (Property/Attribute fail durability; Datum/Binding strain legibility; Field strains durability; Name is too broad).
2. **The marker, concretely.** Confirm shortcut-reference links render and resolve on the live host; decide the registry's home (the glossary, a generated index, or per-pattern definition blocks) and how anchors stay stable as patterns change.
3. **Migration scope — a re-architecture, not a tidy-up.** Every concept reference becomes a `[Term]`; the adapter gains identifier and enumerated-value projection (it already projects structure for the formal models); the linter shifts from grepping `event_scope` to resolving `[Event Scope]` against the registry. Sequence and risk to be planned before any corpus edit.
4. **Term or Token for the umbrella?** The council leans *Token* — "what kind of token is it?" mirrors speech, and *Token Kind* has a ring. The caution: *Token* collides with the classic **type–token distinction**, where the *token* is the concrete instance and the *type* is the abstract category — so "a Token of Kind Type" fights the most famous meaning of both words, and Type is the central kind. *Term* (a named referring expression, from logic and linguistics) carries no such collision and clears both filters. Recommendation: **Term**, unless the natural-language ring of *Token Kind* is judged worth the collision. The body uses Term provisionally.

## The promotion gate

Promote into [`spec-format.md`](../spec-format.md) — and stand up the registry plus the adapter manifest — only after: the fourth-kind question is resolved against the corpus; a `[Term]` resolver renders on the live host with a working registry; the adapter projects at least one identifier kind and one enumerated kind to one target; and one pattern is round-tripped end-to-end (canon → projection) with the formal harness still green. Until all four hold, this binds nothing.

## Relation to the other directions

[`naming.md`](./naming.md) governs the one word a Term carries; [`prose.md`](./prose.md) governs the sentences around it; this governs how the prose *refers* to it. All three serve the same end — the spec stays the human-readable canonical artifact the thesis requires — and all three keep the canon free of anything that does not survive both a change of implementation technology and a non-engineer reading it.

## Lineage notes

Drafted 2026-06-26 from a multi-model design council (Claude, GPT, Grok) working a recurring frustration: the snake/kebab inconsistency. Credit to GPT for the Symbol → Property catch, the kind/role separation, the type-system framing (every Term has exactly one kind; *kind* named so as not to overload *Type*), the **question calculus** (build the ontology from questions, not nouns) with its four-rule falsifiable process, the *semantic* qualifier, and the thesis *formatting is not semantics*; to the council for the durability filter ("could a future specification language discover this independently?"). The through-line — casing is projection, not canon — reframes naming as a non-problem and annotation as the real one. Recorded here for pressure-testing, not yet binding.
