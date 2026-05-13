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


Atomic patterns (concepts) and applications, expressed as structured natural language. Code is derived; intent is canonical.

Named for Grace Hopper, who first argued that business logic should be readable by the people who understand the business.

---

## What this is

Most software systems are 80% patterns that have been implemented thousands of times: resource reservation, billing cycles, auth flows, audit trails, compliance rules, notification logic. None of this is novel. All of it gets reinvented, inconsistently, in every new system.

Grace Commons is the attempt to specify these patterns once — clearly, completely, in structured natural language — so they can be referenced, validated against, and eventually generated from rather than reimplemented.

The library is organized around business patterns, not technologies. The same provisional resource commitment pattern appears in banking, healthcare, logistics, and e-commerce. It belongs in one place.

---

## What this is not

This is not a code library.
It is not a framework.
It is not a domain-specific language.

It is a specification library — patterns expressed as intent, independent of any implementation language or technology stack.

---

## How it's organized

Grace Commons distinguishes **atoms** from **compositions**.

An atom is freestanding — its specification can be stated without naming any other atom. Personal Todo, Duplicate Prevention, and Event Log are atoms. Each is a complete concept whose state, actions, and operational principles are independent of every other concept.

A composition depends on at least one other atom. Audit Trail composes Event Log with retention, tamper-evidence, and actor identity. Shared Todo composes Personal Todo with Permissions and Assignment. Compositions are where atoms come together to do real work.

The directory layout reflects the split:

- `atoms/` holds atoms, organized by category — `productivity/`, `temporal/`, `compliance/`, `resource-lifecycle/`, `messaging/`, `workflow/`.
- `compositions/` holds compositions. Each file declares which atoms it composes and the logic that wires them together.

The test for which folder a contribution belongs in: **does its specification name another pattern?** If no, it's an atom — file under `atoms/`. If yes, it's a composition — file under `compositions/`.

### Current contents

```text
atoms/
├── productivity/
│   ├── personal-todo            — single-user task tracking
│   └── assignment               — single-actor responsibility binding per task
├── temporal/
│   ├── duplicate-prevention     — temporally-bounded recency guard
│   └── event-log                — append-only sequence of immutable events
├── resource-lifecycle/
│   ├── provisional-commitment   — Held → Confirmed | Released | Expired
│   └── soft-delete              — Active → Deleted → Purged; Deleted is reversible (grounded)
├── compliance/
│   ├── actor-identity           — verifiable action-to-actor binding
│   ├── retention-window         — bounded record lifetime with no-early-purge
│   ├── tamper-evidence          — cryptographic detectability of record alteration
│   ├── permissions              — grant-based access control with explicit revocation
│   ├── legal-hold               — preservation obligation suspending purge (grounded)
│   ├── consent                  — data subject agreement to named processing purpose (grounded)
│   └── selective-disclosure     — append-only disclosure accountability record: recipient, scope, authority (grounded)
├── messaging/
│   ├── subscription             — durable record of actor interest in an event scope
│   └── notification             — delivery record for a single notification to a single recipient
├── workflow/
│   └── approval-step            — Pending → Approved | Rejected | Withdrawn; named-approver gate (grounded)
└── healthcare/
    ├── clinical-observation     — immutable clinical measurement with amendment/retraction trail (grounded)
    └── medication-order         — prescription lifecycle from order through terminal resolution (grounded)

compositions/
├── undo-history                 — Personal Todo + Event Log
│                                  ↳ emergent invariant:
│                                    identity preservation across delete/undo
├── idempotent-reservation       — Provisional Commitment + Duplicate Prevention
│                                  ↳ emergent invariant:
│                                    exactly-once effect within window
├── audit-trail                  — Event Log + Actor Identity + Retention Window + Tamper Evidence
│                                  ↳ emergent invariants:
│                                    attribution coverage, retention coverage,
│                                    cascade-on-purge, forensic completability
├── shared-todo                  — Personal Todo + Permissions + Assignment
│                                  ↳ emergent invariants:
│                                    permission-gated mutations,
│                                    no dangling assignment on delete
├── notification-fanout          — Subscription + Notification
│                                  ↳ emergent invariants:
│                                    fanout coverage, payload consistency,
│                                    at-most-one per subscriber per invocation,
│                                    per-recipient failure isolation
└── multi-party-approval         — Approval Step + Permissions + Assignment + Audit Trail (substrate)
                                   ↳ emergent invariants:
                                     chain completeness, quorum determinism,
                                     chain terminal absorption, chain immutability,
                                     audit completeness across chain and step events
```

Three layers are visible from the snapshot above: **atoms** (the freestanding patterns), **compositions** (the wired combinations), and **emergent invariants** that appear at composition time and don't belong to any single constituent atom. The identity-preservation invariant in Undo History is the simplest example — it falls out of wiring Personal Todo's `delete` against Event Log's append-only history, and neither pattern carries it alone. The Audit Trail application is the most substantial: four atoms wired together produce attribution coverage, retention coverage, cascade-on-purge, and forensic completability — emergent invariants none of the four constituents carries — and the application's verification surface answers four regulator questions at once that the four atoms would otherwise answer separately. Notification Fanout is structurally distinct: it is the first composition in the library where a single trigger produces a variable number of effects — the fan-out count is determined at runtime by the Active subscriber set, not at composition time — and its emergent invariants (fanout coverage, payload consistency, at-most-one per subscriber) are properties of the directed invocation graph that neither constituent atom can assert alone. Each pattern also carries **Lineage notes** recording its three-pass review arc; see [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md).

The `atoms/` + `compositions/` split mirrors the structural logic of [concept-catalog](https://github.com/dpapathanasiou/concept-catalog)'s `concepts/` + `applications/` — composition is a different kind of work from atom definition, and the directory layout makes that visible without forcing a reader to infer it. Grace Commons uses `compositions/` because these artifacts are structurally compositions — formal combinations of independently valid patterns — not deployable products.

---

## Status

Early and foundational. The architectural philosophy is in [`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md). The pattern library is being built.

Contributors who understand the problem are welcome before the library is complete. That is the right time to establish the structure.

---

## Contributing

The most valuable contributions right now are pattern proposals, domain expertise, and honest criticism of the architecture.

If you work in a domain with well-specified standards — healthcare, finance, logistics, government — and recognize the problem this is trying to solve, we want to hear from you.

---

*Grace Commons is the open foundation. The patterns that belong to everyone should live somewhere everyone can see them.*
