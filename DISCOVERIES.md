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

---

### 2026-05-20 — Complexity must be reduced to named state and named transitions before advanced tools apply

Discovered while writing the Alloy model for Capability and the TLA+ model for Privileged Access Provisioning. Both models were straightforward to write — not because formal verification is easy, but because the grounded specs had already done the hard work.

The gating condition that made the models tractable: every piece of complexity had already been reduced to named state and named transitions. Status enums, action preconditions, idempotency guards, invariants — all named in the English spec before a single line of Alloy or TLA+ was written.

This suggests a general principle:

> Complexity must be reduced until it is representable as named state and named transitions before advanced logic tools are applied.

That principle is the gating rule between three stages:

1. **Prose design** — where the hard thinking happens; complexity is named and decomposed
2. **Formal verification** — mechanical once stage 1 is complete; Alloy checks snapshots, TLA+ checks traces
3. **Code generation** — also mechanical from the same source; implementation is a translation, not a design activity

The same rule applies to decomposition generally. Complex things become doable when broken down far enough that their pieces can be named. The naming is the work. Everything after naming is translation.

This is the same insight as the 2026-05-19 discovery stated from the other direction: readable-first and formally verifiable are the same discipline because both require the same prior act — reducing complexity to named state.

### Implication for Grace Commons

The three-pass pressure-testing methodology is the mechanism that enforces the gating rule. A pattern that has not survived all three passes has not been reduced far enough. Alloy and TLA+ applied to an ungrounded spec will find noise, not signal — the counterexamples will reflect specification gaps rather than implementation risks.

The correct sequencing is: ground the spec first, then apply formal tools. The formal tools confirm the grounding; they do not substitute for it.

---

### 2026-05-20 — Healthcare application target

A specific healthcare application idea is in view as a future Grace Commons target. Not captured in detail yet at the author's request — noted here so it doesn't get lost. The library already has Clinical Observation and Medication Order as grounded worked examples of the methodology applied to HIPAA / 21 CFR Part 11 domains. The healthcare app would extend into composition territory beyond those two atoms. Detail to be filled in when the idea is ready to specify.
