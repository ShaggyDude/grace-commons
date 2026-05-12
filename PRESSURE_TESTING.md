---
title: Pressure Testing
nav_order: 3
---

# Pressure Testing

> The foundation review every Grace Commons pattern survives before being considered grounded — three mandatory initial passes followed by as many refinement passes as the pattern requires.

A pattern's spec is incomplete in three different ways at once. Each of the three passes below catches a different class of incompleteness. None substitutes for the others. Together they constitute the mandatory foundation for atoms (in `atoms/`) and compositions (in `compositions/`).

The foundation passes are not a single-shot quality bar. Fixing a Pass 1 gap changes the document, and the changed document has new surface area for Pass 3 to find. A spec that passes all three cleanly on the first attempt has either been authored with extraordinary care or has not been reviewed adversarially enough. Refinement passes — re-running the same three passes after each round of fixes — are expected, not exceptional. There is no fixed number of refinement passes; the loop runs until a complete pass surfaces no new findings.

The three passes are recursive in a useful way: applying them to a pattern produces a Lineage notes section, and the Lineage notes themselves can be pressure-tested by re-running the same three passes. Each fresh application becomes evidence the architecture is doing real work.

---

## Pass 1 — Structural completeness (GRID)

**What it checks.** For each of GRID's nine nodes — Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof — is the node specified? Does the spec satisfy the node's completeness rule? Are the node's references to other nodes resolved?

**What it catches.** Missing pieces. Nodes that aren't addressed at all. Friction items that don't reference a Flow step. Decisions that aren't linked to a State or Behavior. Intent claims that aren't testable.

**How to run it.** Mechanical. Walk the nine nodes one by one with their MUSE v1.1 completeness rules:

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
| Proof | Must be measurable and defined before development begins |

Then check the reference graph: every Friction links to a Flow step; every Decision links to State and Behavior; every Proof links to Intent. Orphaned references are violations.

**Time:** 15–30 minutes for an atom; longer for an application with multiple constituents.

**Personal Todo example.** First pass surfaced five gaps: actor (Behavior was incomplete — *who* acts?), description mutability (State + Decision were silent on edit), temporal metadata (State omitted timestamps), observability (Feedback didn't say what's queryable), identity policy (Decision punted on duplicate handling). Four were closed in-pattern; the fifth was extracted to Duplicate Prevention by Pass 2.

---

## Pass 2 — Conceptual independence (EOS)

**What it checks.** For each concern named in the spec, does that concern belong to *this* concept, or to a different concept that ought to compose with it?

**What it catches.** Over-absorption. A spec absorbing a concern that is generic, recurs across many concepts, and deserves its own freestanding atom. EOS calls these *concerns that should be freestanding* — they are not properties of the host concept; they are concepts in their own right.

**How to run it.** For each concern, ask:

- Does this concern recur across many domains? (Identity stability, recency guards, audit logging, time windows, ordering, retention, tamper-evidence — usually a separate concept.)
- Does this concern have its own state machine, distinct from the host concept's? (If so, almost certainly its own concept.)
- Could the host concept be specified without this concern, with the concern composed in? (If yes, extract.)
- Would another concept that needs this concern reinvent it? (If yes, extract.)

**Time:** 10–20 minutes once familiar with the existing atom catalog. Faster as the catalog grows — a quick scan against existing atoms surfaces most over-absorptions.

**Personal Todo example.** First-pass identity policy was absorbed in-pattern as a 24-hour deletion record. Pass 2 caught it: the same concern appears in comment double-post, payment idempotency, newsletter double-subscribe, form submission. It is not a property of Personal Todo — it is its own concept. Extracted as Duplicate Prevention. Personal Todo got cleaner; three other concepts now have a place to compose from.

---

## Pass 3 — Adversarial scrutiny (Linus mode)

**What it checks.** Read the spec like someone with low patience for hand-waving. Look for muddled thinking, decisions deferred dressed up as deliberate ambiguity, marketing claims without justification, examples that exercise only happy paths, invariants that aren't actually invariant.

**What it catches.** Hidden decisions and sloppy thinking. The load-bearing decisions that have been pushed below the surface where they don't have to argue for themselves.

**How to run it.** Adopt the posture of a senior reviewer who is allergic to abstraction-as-evasion. Sample questions to ask of every spec:

- **Identity.** What concretely *is* the identity model? Is identity an opaque id, or is it a property like name or description? What happens if the identity-property changes — is that the same entity or a different one? Pick a side. State it.
- **Action signatures.** What does each action *return* on success? On failure? What are the rejection reasons, named?
- **Primitive policies.** For every string, number, date, identifier in the spec — what are the rules? Empty allowed? Whitespace? Unicode normalization? Length cap? Trim? Case-sensitivity?
- **Invariant precision.** Are invariants stated with proper conditional structure when terms are optional? A chain inequality `a ≤ b ≤ c` is wrong if any term may be undefined.
- **Examples.** Do they exercise rejection paths, edge cases, and the explicit non-goals — or only the happy path?
- **Deferred concerns.** Are concurrency, atomicity, clock semantics, persistence named explicitly as out-of-scope, or implicitly assumed away?
- **Marketing.** Does the spec claim it *extends* or *is informed by* or *is built on* something? Is the claim accurate, or sleight-of-hand papering over a different model?
- **Atomicity.** Are state transitions atomic? What about a crash mid-transition — is an invariant violated? Whose problem is that?
- **Time.** Where does `now` come from? Whose clock? What about skew, monotonicity, timezone?

**Time:** 30–60 minutes for a thorough pass. The most labor-intensive of the three.

**Personal Todo example.** Surfaced five gaps in the simplified post-Pass-1-and-2 spec: identity model muddled, `add` return value unspecified, description rules unspecified, timestamp monotonicity malformed (chain inequality with optional terms), examples were happy-path only. All five fixed in a third revision; three additional concerns (concurrency, atomicity, clock semantics) named as explicit out-of-scope rather than fixed in-pattern.

---

## Defending each claim in-line

The three passes are review tools — they catch gaps. Authoring well in the first place reduces what the passes find. The strongest writing discipline for architectural specs: **every claim is defended in-line by the same paragraph that introduces it.**

**The four-step rubric:**

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

**Worked examples.** [Provisional Commitment's adversarial scenarios](atoms/resource-lifecycle/provisional-commitment.md#regulated-adversarial-scenarios) walk regulator-audit-of-confirmation-window, GDPR-erasure-on-personal-data, and breach-window-forensics. [Actor Identity's](atoms/compliance/actor-identity.md#regulated-adversarial-scenarios) walk regulator-audit-of-attribution, disputed-transaction-by-actor, and compromised-credential-discovery. [Idempotent Reservation's](compositions/idempotent-reservation.md#regulated-adversarial-scenarios) walk regulator-audit-for-double-charges, disputed-double-charge, and replay-attack — exercising the *emergent* invariants of the composition rather than the constituents' invariants.

### Generation acceptance

**The Pass 3 gap.** Success criteria for derived implementations are almost always implicit — the *"the invariants hold and rejections surface"* assumption. For regulated atoms, that assumption fails to specify what an external auditor reading the records must be able to *do*. The MUSE Proof node requires success criteria be "measurable and defined before development begins," but the bar is rarely written down; it lives in the architect's head.

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

**Skipping is not an option.** Each pass catches a different class of gap. A pattern that has only survived Pass 1 is structurally complete but probably absorbs concerns it shouldn't and contains hidden decisions. A pattern that has only survived Pass 3 is precise but may be missing entire GRID nodes. Either is incomplete. Refinement passes do not substitute for the foundation — they extend it.

---

## What "grounded" means

A pattern reaches the `grounded` status — the state declared in its Status section — when:

- All nine GRID nodes are resolved (Pass 1 clean).
- All concerns belong to the pattern they're in; no over-absorptions remain (Pass 2 clean).
- No muddled identity, sloppy invariants, happy-path-only examples, or hidden load-bearing decisions remain (Pass 3 clean).

Patterns that have survived only one or two passes should not declare `grounded`. They should declare their actual status (`unresolved`, `partially resolved`) per MUSE v1.1's completeness states. Honest partial completion is more useful than false confidence.

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

| Pass | Class of gap | Lens | Typical fix |
|------|--------------|------|-------------|
| 1 — GRID | Missing pieces | Structural completeness | Specify the missing node; resolve dangling references |
| 2 — EOS | Over-absorption | Conceptual independence | Extract the concern as a separate atom; document the composition |
| 3 — Linus | Hidden decisions | Adversarial scrutiny | State the load-bearing decision explicitly; tighten invariants; add rejection-path examples |

A pattern is `grounded` when all three columns are clean. Until then, the pattern is *in process* — and that is a respectable state to be in, provided the actual state is declared honestly.

---

*The shortest path to a grounded pattern is to run all three passes early and iterate through as many refinement rounds as the pattern needs. The longest path is to declare `grounded` prematurely — whether after one pass or after three passes that were not adversarial enough. Premature grounding means the spec, the implementations that depend on it, and the contributors who reviewed it must all be revisited together when the gaps surface later. Refinement passes are cheaper before `grounded` than after.*
