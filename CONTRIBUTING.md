---
title: Contributing
nav_order: 4
---

# Contributing to Grace Commons

Grace Commons is early and foundational. The pattern library is being built. This is the right time to help establish the structure — before conventions calcify and before the easy decisions get made by default.

---

## What we need right now

**Pattern proposals.** If you recognize a business logic pattern that recurs across domains and belongs in a shared library, we want to know about it. A pattern proposal does not need to be complete — a name, a brief description, and one or two examples from different domains is enough to start.

**Domain expertise.** The patterns that matter most are the ones that appear in regulated industries with formal standards behind them — healthcare, finance, logistics, government. If you work in one of these domains and recognize the problem this library is trying to solve, your knowledge of what the standards actually say is directly valuable.

**Honest criticism.** The architectural philosophy is in `THE_SPEC_LAYER.md`. If you think it is wrong in ways that matter, say so. The most useful response is the honest one.

---

## Atoms vs. applications

Grace Commons distinguishes **atomic patterns** from **applications** (compositions of patterns).

The test: does the contribution's specification name another pattern? If no, it's an atom — file it under `patterns/<category>/`. If yes, it's an application — file it under `applications/`.

Atoms are freestanding: state, actions, and operational principles independent of every other pattern. Personal Todo, Duplicate Prevention, Event Log.

Applications are compositions: at least one constituent atom, stitched together with composition logic. Audit Trail (Event Log + retention + tamper-evidence + actor identity), Shared Todo (Personal Todo + Permissions + Assignment), Reservation Lifecycle (Reservation + Hold Window + Capacity).

If you are not sure which side your contribution falls on, open an issue. The overhead of a conversation is lower than the overhead of placing it in the wrong folder.

---

## What an atomic pattern looks like

A pattern spec lives in the appropriate `patterns/` subdirectory. It is a structured natural language document, not code — because plain English is the form that includes every reader at once: business stakeholders, auditors, engineers, AI systems, future contributors. Inherit anything good from any source (formal-methods notation, ISO/IEEE standards, BDD, decision tables, design-by-contract, ADR templates, requirements-engineering identifiers); the output form is consistent. At minimum the spec should define:

- **Name** — clear, domain-neutral where possible
- **Intent** — what business need does this pattern address
- **Structure** — the logical shape: inputs, outputs, invariants, states
- **Examples** — the same pattern appearing in at least two different domains
- **Edge cases** — what the pattern does not cover, or where it breaks down
- **Standards references** — where relevant, anchors to ISO, IEEE, domain standards

Atoms do not need to be complete to be submitted. An incomplete atom with honest gaps marked as open decisions is more useful than a polished one with hidden assumptions.

---

## What an application looks like

An application spec lives directly in `applications/` (no subdirectories). It declares the atoms it composes and the logic that wires them together. At minimum it should define:

- **Name** — describes the composed result
- **Composes** — the atoms it brings together, by name and link
- **Composition logic** — how the atoms are wired: which actions in one trigger which in another, what policy parameters each atom is configured with, how cross-atom invariants are maintained
- **Application-level invariants** — invariants that emerge from composition and don't belong to any single constituent
- **Examples** — concrete scenarios showing the composition in action
- **Edge cases** — failure modes that arise from composition, including conflicts between constituent atoms

Applications are where the architecture is exercised. A reader should be able to verify, from the file alone, that the named atoms could plausibly compose to produce the claimed behavior.

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

A pattern — atomic or application — is `grounded` only after surviving three pressure-testing passes:

- **Pass 1 — Structural completeness (GRID).** Are all nine GRID nodes resolved with their references intact?
- **Pass 2 — Conceptual independence (EOS).** Does the spec absorb any concern that belongs to a separate freestanding atom?
- **Pass 3 — Adversarial scrutiny (Linus mode).** Are there muddled identities, sloppy invariants, happy-path-only examples, or hidden load-bearing decisions?

Each pass catches a different class of gap. None substitutes for the others. See [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) for the full methodology and [`patterns/productivity/personal-todo.md`](./patterns/productivity/personal-todo.md) for a worked example whose Lineage notes record the arc.

A pattern that has only survived one or two passes is *in process* — and that is a respectable state, provided the actual state is declared honestly per MUSE's completeness states (`unresolved`, `partially resolved`, `grounded`).

---

## What we are not looking for right now

- Code implementations
- Framework integrations
- Language bindings
- Tooling

Grace Commons is a specification library. The implementations come later, elsewhere.

---

## Contribution lifecycle

A pattern moves through four states: **Proposal** (an issue describing the recurring pattern) → **Draft** (a first spec, almost certainly `unresolved` or `partially resolved`) → **Pressure-tested** (three passes run, gaps fixed or deferred) → **Grounded** (all three passes clean, Lineage notes recorded). The lifecycle is iterative; a `grounded` pattern can return to `partially resolved` if LIVE evidence later contradicts an invariant.

---

## How to contribute

Open an issue or submit a pull request. If you are unsure whether something belongs, open an issue first and describe what you have in mind. The overhead of a conversation is lower than the overhead of a rejected PR.

---

*We are not inventors here. We are curators — connecting dots from brilliant but unfinished work across decades. If you recognize the problem, you are probably already a contributor.*
