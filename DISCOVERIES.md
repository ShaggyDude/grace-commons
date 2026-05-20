---
title: Discoveries
nav_order: 999
---

# Discoveries

Accidental findings during the build. Raw, dated, unpolished. Grant proposals and posts pull from here later.

---

### 2026-05-19 — Readable-first and formally verifiable are the same discipline

While modeling the Attributed Permissions Admin composition in Alloy and TLA+, we discovered that the English specification had already captured nearly everything the formal models required: named actions, preconditions, postconditions, and explicitly numbered invariants.

This challenged the common assumption that human-readable specifications and formal verification are separate activities—one for people, one for tools.

In practice, they are two expressions of the same underlying discipline: precise thinking.

The canonical English specification is where the difficult work happens:

* Defining system state
* Naming actions
* Stating invariants
* Clarifying assumptions
* Eliminating ambiguity

Once that structure exists, generating Alloy or TLA+ models becomes largely mechanical.

The English specification is not documentation *about* the formal model. It is the canonical source from which both formal models and implementation are derived.

Formal tools act as tireless second readers. They do not create correctness; they systematically test the assumptions already expressed in the specification by exploring states no human would enumerate manually.

A key advantage of this approach is that verification results return in the language the team already understands. Invariants are named in English before the model is written, so counterexamples map directly to concepts already discussed in design reviews.

The feedback loop is straightforward:

**English specification → Formal model → Counterexamples → Refined specification**

Readable-first design forced exactly the level of abstraction that formal verification requires.

### Implication for Grace Commons

Writing a precise English specification is not formal verification itself, but it performs most of the intellectual work that formal verification depends on.

Alloy and TLA+ then provide exhaustive, machine-assisted validation of that specification.

When the specification is precise enough, formal verification becomes an optional, mechanical extension of the same thinking rather than a separate discipline.
