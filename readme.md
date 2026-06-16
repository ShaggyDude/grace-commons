---
title: Home
nav_order: 1
permalink: /
has_toc: true
toc: true
---

# Grace Commons

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Atomic concepts & compositions thereof, expressed as structured natural language. Code is derived (generated from the spec); intent is canonical (the single authoritative source from which everything else is built).

Named for Grace Hopper, who first argued that business logic should be readable by the people who understand the business.

---

## Four reasons Grace Commons is different

Architects draw plans. Composers write scores. Car designers build *[CAD]: three-dimensional computer designs models. Lawyers write statutes. Software has a Git repo and hopes the README is current.

Software is the only engineering discipline operating without a canonical-intent layer — a single, authoritative description of what the software is supposed to do. We're closing the gap.

1. **Structured English as the canonical form.** Your PM, your lawyer, your auditor, your regulator can read it *and edit it*. Formal methods (mathematical, notation-heavy approaches to writing software specifications) exclude these stakeholders (people who have a direct interest in the outcome) by notation; Grace Commons includes them by design.
2. **One spec, many derivations.** Tests, code, multiple frontends (user interfaces — web, mobile, voice), formal models (precise mathematical representations of the system), audit artifacts (official records used in compliance reviews) — all projected from the same canonical source.
3. **Stack-agnostic by construction.** The spec doesn't know about your runtime (the environment where software actually runs — a web server, a phone, a browser). The projector (the tool that converts the spec into working code) compiles to whatever stack (combination of technologies) a deployment needs — web, CLI, mobile, voice, future channels.
4. **Bidirectional refinement.** Findings from running tests, real-world incidents, regulator audits (official inspections by government or industry overseers) feed back into the canonical spec via the methodology. The system improves with use; it doesn't go stale.

---

## What this is

Most software systems are 80% patterns that have been implemented thousands of times: resource reservation, billing cycles, auth flows (the process of verifying who someone is and letting them log in), audit trails, compliance rules, notification logic. None of this is novel. All of it gets reinvented, inconsistently, in every new system.

Grace Commons is the attempt to specify these patterns once — clearly, completely, in structured natural language — so they can be referenced, validated against, and eventually generated from rather than reimplemented.

The library is organized around business patterns, not technologies. The same provisional resource commitment pattern (temporarily holding a resource — a seat, a hotel room, an inventory item — while waiting for final confirmation) appears in banking, healthcare, logistics, and e-commerce. It belongs in one place.

---

## What this is not

This is not a code library.
It is not a framework.
It is not a domain-specific language.

It is a specification library (a collection of precise written descriptions of how common software behaviors work) — patterns expressed as intent, independent of any implementation language or technology stack.

---

## How it's organized

Grace Commons distinguishes **atoms** from **compositions**.

An atom — short for atomic concept — is freestanding: its specification names no other pattern. Personal Todo, Duplicate Prevention, and Event Log are atoms. Each is a complete concept whose state, actions, and operational principles are independent of every other concept.

A composition is the wiring of concepts, not a new concept — its specification names other patterns and the logic that combines them. Audit Trail composes Event Log with retention (rules about how long records must be kept), tamper-evidence (the ability to detect if records have been secretly altered), and actor identity (a verifiable link between every action and who performed it). Shared Todo composes Personal Todo with Permissions and Assignment. Compositions are where atoms come together to do real work.

The directory layout reflects the split:

- `atoms/` holds atoms, stored flat as `atoms/<name>.md` — classification is derived rather than encoded in the folder layout (browse the generated catalog at [`atoms/index.md`](./atoms/index.md); the classification axes are defined in [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)).
- `compositions/` holds compositions. Each file declares which atoms it composes and the logic that wires them together.

The test for which folder a contribution belongs in: **does its specification name another pattern?** If no, it's an atom — file under `atoms/`. If yes, it's a composition — file under `compositions/`.

For the current contents — every grounded atom and composition, with counts and sequencing — see [`roadmap.md`](./roadmap.md), the single source of truth.

Three layers structure the library: **atoms** (the freestanding patterns), **compositions** (the wired combinations), and **emergent invariants** that appear at composition time and don't belong to any single constituent atom. The identity-preservation invariant (a rule that must always be true — here, that deleting and undoing a task leaves it with the same identity it had before) in Undo History is the simplest example — it falls out of wiring Personal Todo's `delete` against Event Log's append-only history, and neither pattern carries it alone. The Audit Trail composition wires four atoms together to produce attribution coverage, retention coverage, cascade-on-purge, and forensic completability — emergent invariants none of the four constituents carries — and its verification surface answers four regulator questions at once that the four atoms would otherwise answer separately. Notification Fanout is structurally distinct: it is the first composition in the library where a single trigger produces a variable number of effects — the fan-out count is determined at runtime by the Active subscriber set, not at composition time — and its emergent invariants (fanout coverage, payload consistency, at-most-one per subscriber) are properties of the directed invocation graph that neither constituent atom can assert alone. Each pattern also carries **Lineage notes** (a record of what each review pass found and how it was resolved) recording its three-pass review arc; see [`pressure-testing.md`](./pressure-testing.md).

The `atoms/` + `compositions/` split mirrors the structural logic of [concept-catalog](https://github.com/dpapathanasiou/concept-catalog) (an open library of freestanding software concepts) and its `concepts/` + `applications/` — composition is a different kind of work from atom definition, and the directory layout makes that visible without forcing a reader to infer it. Grace Commons uses `compositions/` because these artifacts are structurally compositions — formal combinations of independently valid patterns — not deployable products.

---

## Status

Early but stable (as of mid-June 2026). The architectural philosophy is in [`the-spec-layer.md`](./the-spec-layer.md). The pattern library is being built.

Contributors who understand the problem are welcome before the library is complete. That is the right time to establish the structure.

---

## Contributing

The most valuable contributions right now are pattern proposals, domain expertise, and honest criticism of the architecture.

If you work in a domain with well-specified standards — healthcare, finance, logistics, government — and recognize the problem this is trying to solve, we want to hear from you.

---

---

## Where this is going

Grace Commons is not chasing incremental improvement. The design is revolutionary by intention: the structured specification is the single source of truth, mechanically projected into working software, making the entire system legible to every stakeholder — not just developers. The methodology follows the same pattern it teaches: strong and effective now, deliberately engineered to evolve toward excellence as more authors and real-world usage shape it.

This is what becomes possible when deep architectural taste meets modern AI — not as a replacement for human judgment, but as a force multiplier for it. The result is a new kind of commons: compliance logic no longer buried in opaque code, but living in clear, readable, verifiable patterns that anyone accountable for the system can actually understand.

---

*Grace Commons is the open foundation. The patterns that belong to everyone should live somewhere everyone can see them.*
