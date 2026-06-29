# Annotation — Direction

**Status:** Direction — drafted, not yet ground; stays in `working-ideas/` and does not yet bind (advisory). The promotion gate is **not yet met**: it requires resolving the open fourth-kind question against the corpus, a `[Term]` resolver that renders on the live host plus a Term registry, an adapter that projects at least one identifier kind and one enumerated kind to one target, and one pattern round-tripped end-to-end with the formal harness still green (§The promotion gate). Promotion targets, two homes: the *principle* — representational form (casing, identifier syntax) is derived, not canonical — widens [`the-spec-layer.md`](../the-spec-layer.md)'s SSOT principle; the *convention* (Terms, kinds, the `[Term]` marker) enters [`spec-format.md`](../spec-format.md), with the registry and the adapter manifest as new artifacts.
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

1. **The fourth kind — RESOLVED 2026-06-29 (pending human ratification): two kinds, `Field` and `Parameter`.** The question calculus run against the corpus confirmed the split — "what does it carry?" (a Field of a Type) and "what does it need?" (a Parameter of an Operation) are different questions, so the fourth kind is two. Names chosen against both filters with the tradeoff stated; the operative discriminator is *stored-as-itself → Field, consumed → Parameter*. See §The fourth kind — resolved for the full defence and corpus evidence. The other candidates still fail as noted (Property/Attribute fail durability; Datum/Binding strain legibility).
2. **The marker, concretely.** Confirm shortcut-reference links render and resolve on the live host; decide the registry's home (the glossary, a generated index, or per-pattern definition blocks) and how anchors stay stable as patterns change.
3. **Migration scope — a re-architecture, not a tidy-up.** Every concept reference becomes a `[Term]`; the adapter gains identifier and enumerated-value projection (it already projects structure for the formal models); the linter shifts from grepping `event_scope` to resolving `[Event Scope]` against the registry. Sequence and risk to be planned before any corpus edit.
4. **Term or Token for the umbrella?** The council leans *Token* — "what kind of token is it?" mirrors speech, and *Token Kind* has a ring. The caution: *Token* collides with the classic **type–token distinction**, where the *token* is the concrete instance and the *type* is the abstract category — so "a Token of Kind Type" fights the most famous meaning of both words, and Type is the central kind. *Term* (a named referring expression, from logic and linguistics) carries no such collision and clears both filters. Recommendation: **Term**, unless the natural-language ring of *Token Kind* is judged worth the collision. The body uses Term provisionally.

## The promotion gate

Promote only after: the fourth-kind question is resolved against the corpus; a `[Term]` resolver renders on the live host with a working registry; the adapter projects at least one identifier kind and one enumerated kind to one target; and one pattern is round-tripped end-to-end (canon → projection) with the formal harness still green. Then it lands in two homes: the *principle* (representational form is derived) widens [`the-spec-layer.md`](../the-spec-layer.md)'s SSOT principle by one clause; the *convention* (Terms, kinds, the `[Term]` marker) enters [`spec-format.md`](../spec-format.md), alongside the new registry and adapter manifest. Until all four hold, this binds nothing.

## The fourth kind — resolved (2026-06-29, pending human ratification)

Open question #1 is resolved against the corpus by the question calculus and the two filters. **The fourth kind is two kinds — `Field` and `Parameter`.**

| kind | fundamental question | what it is | example |
|------|----------------------|------------|---------|
| **Field** | *What does it carry?* | a named datum a Type carries (stored on the record) | `recorded_at`, `event_id`, `sequence_number`, `description` |
| **Parameter** | *What does it need?* | a value an Operation needs (supplied per call, not stored under that name) | `window`, `now`, `newDescription`, `query` |

**Why two, not one.** The two answer different fundamental questions, so by question-calculus rule 4 ("a candidate answering two questions is two kinds") they are two kinds. The corpus confirms it overwhelmingly: across Duplicate Prevention, Event Log, Personal Todo, Credential, Session, Message Preference, and Soft Delete, the datum surfaces split cleanly into a *stored* population (timestamps `*_at`, ids `*_id`, refs `*_ref`, counters) and a *supplied-transient* population (`now`, `window`, `session_duration`, `query`, `newDescription`). Message Preference even states it in plain English — "what this atom carries is a parameter, not a concept" — and the TLA+ models corroborate with their datum-vs-clock split (`recordedAt` stored state vs. `clock`/`now` injected parameter). One merged kind would erase a distinction the corpus, the models, and every target language independently re-draw, failing the durability filter.

**The operative discriminator (the rule the rollout applies):** *stored-as-itself → Field; consumed/supplied-but-not-stored-under-that-name → Parameter.* This decides every borderline cleanly: `description` is stored, so it is a Field, and `add`'s argument is "the [Description]" being supplied; `newDescription` is consumed by `edit` and written into `description`, never stored under its own name, so it is a Parameter; `data` is stored on the event (Field) while `query` is consumed by read (Parameter); `now`/`window` are consumed/config, never stored as themselves (Parameters).

**The names, against both filters.** `Field` and `Parameter` both pass durability (any spec language with records and behaviors rediscovers "a record has fields" and "a behavior has parameters" — the data/computation duality). On legibility — Grace's bridge bar — both are the plainest available English: a compliance officer reads "the `recorded_at` Field" and "the `window` Parameter" with no glossary. **The tradeoff, stated explicitly:** annotation.md earlier flagged `Field` as straining durability (a database/form word) and `Parameter` as "too broad." Both objections soften once the manifest owns the lowering (so the kind name need not be casing-neutral) and once they are read as *kind labels paired with their question* rather than generic nouns. `Field` mildly favors legibility over the cleaner-but-illegible `Datum`; `Parameter`, paired with "what does it need?", is exact rather than broad. No word clears both filters perfectly; these are the best available, and the strain is cosmetic, not semantic. **This is the call the human ratifies before bulk rollout.**

**Level-consistency.** Like a Member uses `member of:`, a Field card carries `field of:` (its owning Type) and a Parameter card carries `parameter of:` (its owning Operation) — mirroring the existing relationship grammar, not inventing new structure.

## The manifest/adapter — resolved mechanism (2026-06-29)

Open questions #2 and #3 are resolved by a concrete mechanism, proven on the first batch.

**Home + format.** Casing leaves the prose and lives in one **`Projects:` line per card** — the concept's single canonical lowering token, in plain view on the rendered page. From those tokens, [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs) **derives** the full machine manifest on demand (`build-terms/<page>.terms.json`, git-ignored) — every target's snake/camel/pascal/const/wire form, plus a `wire: pinned` flag for pinned Members. This is the tla-adapter philosophy exactly: *derive, don't hand-maintain a drift-prone mirror.* The card is the canonical source; the manifest is a build artifact. Nothing under `tools/` or `build-terms/` renders on GitHub Pages and nothing there needs to — the page already shows the canonical token. Only the `[Term]` markers and shortcut-reference definitions live in the `.md`, and those are proven to render in kramdown safe mode.

**The concrete-name-visibility solution (the crux).** The tension: if `recorded_at` becomes `[Recorded At]` and the snake form lives only in a hidden manifest, the implementer loses the concrete name. Resolution — *two visibility channels, both on the rendered page*:
1. For **Fields, Parameters, and Members**: the card's `Projects:` line shows the one canonical token (`Projects: recorded_at`). The concrete name is right there in the definition the reader clicks through to.
2. For **Operations**: the one canonical signature stays in the Inputs/Actions section as a labeled **projected contract** (`(Projected contract: append(data) → event_id | rejected(invalid-payload | storage-failure))`). That is the operation's concrete shape, kept once.

So casing leaves the *prose* (the requirement) but never leaves the *page* — it moves to the one place it belongs, the Term's definition. A codegen reads the derived manifest; a human reads the card.

**The pinned-literal + cross-page-Member rule.** Two distinct cases, one rule each:
- *Pinned wire literal shown verbatim* (the `duplicate-recent` case as it appears in Duplicate Prevention's example): it stays a **backticked literal**, because backticks are reserved for "a wire string a reader must see exactly" and a pinned string shown to display its exact form is exactly that. "Literal is not a kind" — pinned is a flag on a projection, not a fifth kind. A one-line note marks it.
- *Cross-page Member* (the same `duplicate-recent`, now that Personal Todo — its **owner** — carries a card for it as a pinned `[Duplicate Recent]` Member): a reference from another page resolves to the owner's card via a **full reference link** (`[Duplicate Recent](./personal-todo.md#duplicate-recent)`), **not** a bare shortcut marker (which kramdown resolves only page-locally). The rule: *a token that is another page's Member/Operation stays backticked until that page carries a registry; then it becomes a full cross-page link to the owner's card, where its `pinned` flag and projection live.* The linter's `[Term]` resolver checks only page-local shortcut markers, so cross-page full links are out of its scope by construction.

## Rollout playbook (the per-atom procedure for the remaining ~49 patterns)

> Applies after human ratification of the fourth-kind names and the manifest mechanism. The first batch — Duplicate Prevention, Event Log, Personal Todo — is the worked exemplar; mirror it.

**Per-atom procedure (representational only — casing is the only thing that moves):**

1. **Inventory the surfaces.** `grep -oE '\`[^\`]+\`'` the live body (everything above Lineage). Classify each token by the four kinds: Type / Operation / Member / (Field | Parameter), using the discriminator *stored-as-itself → Field, consumed → Parameter*.
2. **Mark concept references in flowing prose** as `[Term]` shortcut markers. Leave concrete forms in three places only: (a) the one labeled *projected-contract* signature per Operation in Inputs/Actions; (b) genuinely-pinned wire literals shown verbatim; (c) concrete example invocations and their literal returns (illustrative wire-level calls — the analog of a literal argument).
3. **Write the `## Terms` registry** (place it after Edge cases, before Composition notes). One card per Term: a plain-English definition, `Kind:`, the `field of:` / `parameter of:` / `member of:` relation, `Role:` where the domain assigns one, and a `Projects:` line for every Field, Parameter, and Member (plus a state-field name where a Type is stored under a concrete name). Add `Wire: pinned` to any pinned Member. End with the shortcut-reference definition block (`[Term]: #anchor`), wrapped in the standard HTML comment.
4. **Verify anchors.** kramdown lowercases the heading, strips punctuation, and replaces spaces with hyphens: "Recorded At" → `#recorded-at`, "Not Seen" → `#not-seen`. Pick Term names whose anchor is stable and unique on the page.
5. **Run the gates** (all must pass):
   - `python3 tools/linter/lint.py .` → **0 findings** (the new `O-term-*` checks now resolve every marker on the converted page against its registry).
   - `node tools/harness/term-adapter.mjs atoms/<name>.md /tmp/x` → manifest derives; eyeball that Fields project an identifier casing and Members an enumerated/wire casing.
   - If the atom has a `.tla`/`.als` model: `node tools/harness/check.mjs <model>` PASS and `<model>-buggy --buggy` rejected. **Never edit a model** — models are derived; confirm `git status` shows no `.tla`/`.cfg`/`.als` change.
   - `git diff` the `.md` read line-by-line against the same-claim-or-weaker test: every invariant, formula, signature, guarantee, and action-wiring step must carry the identical claim; only casing/marking changed.
6. **Lineage note.** Add an "Annotation conversion" note recording the kinds touched and the gates passed. **Re-verified, not re-grounded** — the Status token does not change (this is expression, not a new round). Do not touch the existing Lineage (dated history).

**Batch strategy + sequencing (risk-ordered):**

- **Foundations first, then dependents.** Convert substrate atoms (Event Log, Actor Identity, Capability, Session, Provisional Commitment) before the compositions that cite them, so cross-page references point at pages that already carry cards. Event Log is done and is the canonical Field/Member exemplar.
- **Anchor stability is a hard constraint.** Many compositions cite constituent invariants and surfaces wholesale ("Event Log Invariants 1–7"). The conversion never renumbers invariants and never changes a Term name a dependent links to. A Term *rename* is a separate, versioned change (naming.md MAJOR bump), never folded into a casing conversion.
- **Cross-page Term references** become full links to the owner's card (per the rule above) only after *both* pages carry registries; until then they stay backticked. Sequence so the owner converts first. Track the cross-page edges (e.g., Personal Todo ↔ Duplicate Prevention, the Event-Log-citing compositions) as a small dependency graph.
- **Compositions** follow the same procedure; their emergent actions and composition-level invariants get Terms like any other surface. A composition's references to a constituent's Operations/Members become cross-page links to the constituent's cards.
- **Batch size:** 3–5 atoms per ratified batch, foundations-first, re-running the full gate suite after each. Stop and re-ratify if the discriminator or a name proves wrong on a new surface (the single-kind rule is an invariant — a Term that resists exactly one kind is a finding against the ontology, not a thing to force).

**Promotion (after the corpus is converted):** land the *principle* (representational form is derived) as a one-clause widening of [`the-spec-layer.md`](../the-spec-layer.md)'s SSOT principle, and the *convention* (Terms, the four kinds, the `[Term]` marker, the `Projects:` card line, the adapter manifest) into [`spec-format.md`](../spec-format.md). The linter's `O-term-*` checks and `tools/harness/term-adapter.mjs` become the enforced/derive tooling, cited there.

## Relation to the other directions

[`naming.md`](./naming.md) governs the one word a Term carries; [`prose.md`](./prose.md) governs the sentences around it; this governs how the prose *refers* to it. All three serve the same end — the spec stays the human-readable canonical artifact the thesis requires — and all three keep the canon free of anything that does not survive both a change of implementation technology and a non-engineer reading it.

## Lineage notes

Drafted 2026-06-26 from a multi-model design council (Claude, GPT, Grok) working a recurring frustration: the snake/kebab inconsistency. Credit to GPT for the Symbol → Property catch, the kind/role separation, the type-system framing (every Term has exactly one kind; *kind* named so as not to overload *Type*), the **question calculus** (build the ontology from questions, not nouns) with its four-rule falsifiable process, the *semantic* qualifier, and the thesis *formatting is not semantics*; to the council for the durability filter ("could a future specification language discover this independently?"). The through-line — casing is projection, not canon — reframes naming as a non-problem and annotation as the real one. Recorded here for pressure-testing, not yet binding.
