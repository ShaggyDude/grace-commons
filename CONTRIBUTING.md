# Contributing to Grace Commons

Grace Commons is early and foundational. The pattern library is being built. This is the right time to help establish the structure — before conventions calcify and before the easy decisions get made by default.

---

## What we need right now

**Pattern proposals.** If you recognize a business logic pattern that recurs across domains and belongs in a shared library, we want to know about it. A pattern proposal does not need to be complete — a name, a brief description, and one or two examples from different domains is enough to start.

**Domain expertise.** The patterns that matter most are the ones that appear in regulated industries with formal standards behind them — healthcare, finance, logistics, government. If you work in one of these domains and recognize the problem this library is trying to solve, your knowledge of what the standards actually say is directly valuable.

**Honest criticism.** The architectural philosophy is in `THE_SPEC_LAYER.md`. If you think it is wrong in ways that matter, say so. The most useful response is the honest one.

---

## What a pattern contribution looks like

A pattern spec lives in the appropriate `patterns/` subdirectory. It is a structured natural language document, not code. At minimum it should define:

- **Name** — clear, domain-neutral where possible
- **Intent** — what business need does this pattern address
- **Structure** — the logical shape: inputs, outputs, invariants, states
- **Examples** — the same pattern appearing in at least two different domains
- **Edge cases** — what the pattern does not cover, or where it breaks down
- **Standards references** — where relevant, anchors to ISO, IEEE, domain standards

Patterns do not need to be complete to be submitted. An incomplete pattern with honest gaps marked as open decisions is more useful than a polished pattern with hidden assumptions.

---

## What we are not looking for right now

- Code implementations
- Framework integrations
- Language bindings
- Tooling

Grace Commons is a specification library. The implementations come later, elsewhere.

---

## How to contribute

Open an issue or submit a pull request. If you are unsure whether something belongs, open an issue first and describe what you have in mind. The overhead of a conversation is lower than the overhead of a rejected PR.

---

*We are not inventors here. We are curators — connecting dots from brilliant but unfinished work across decades. If you recognize the problem, you are probably already a contributor.*
