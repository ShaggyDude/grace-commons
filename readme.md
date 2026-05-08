# Grace Commons

A shared library of business logic patterns expressed as structured natural language specifications.

Named for Grace Hopper, who first argued that business logic should be readable by the people who understand the business.

---

## What this is

Most software systems are 80–90% patterns that have been implemented thousands of times: resource reservation, billing cycles, auth flows, audit trails, compliance rules, notification logic. None of this is novel. All of it gets reinvented, inconsistently, in every new system.

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

Grace Commons distinguishes **atomic patterns** from **applications** (compositions of patterns).

An atomic pattern is freestanding — its specification can be stated without naming any other pattern. Personal Todo, Duplicate Prevention, and Event Log are atoms. Each is a complete concept whose state, actions, and operational principles are independent of every other concept.

An application is a composition — its specification depends on at least one other pattern. Audit Trail composes Event Log with retention, tamper-evidence, and actor identity. Shared Todo composes Personal Todo with Permissions and Assignment. Applications are where atoms come together to do real work.

The directory layout reflects the split:

- `patterns/` holds atoms, organized by category — `productivity/`, `temporal/`, `compliance/`, `resource-lifecycle/`.
- `applications/` holds compositions. Each file declares which atoms it composes and the logic that wires them together.

The test for which folder a contribution belongs in: **does its specification name another pattern?** If no, it's an atom — file under `patterns/`. If yes, it's an application — file under `applications/`.

### Current contents

```text
patterns/
├── productivity/
│   └── personal-todo            — single-user task tracking
└── temporal/
    ├── duplicate-prevention     — temporally-bounded recency guard
    └── event-log                — append-only sequence of immutable events

applications/
└── undo-history                 — Personal Todo + Event Log
                                   ↳ emergent invariant:
                                     identity preservation across delete/undo
```

Three layers are visible from the snapshot above: **atoms** (the freestanding patterns), **applications** (the compositions), and **emergent invariants** that appear at composition time and don't belong to any single constituent atom. The identity-preservation invariant is the first such — it falls out of wiring Personal Todo's `delete` against Event Log's append-only history, and neither pattern carries it alone. Each pattern also carries **Lineage notes** recording its three-pass review arc; see [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md).

This mirrors [concept-catalog](https://github.com/dpapathanasiou/concept-catalog)'s split between `concepts/` and `applications/`. The reason is the same in both libraries: composition is a different kind of work from atom definition, and the directory layout should make that visible without forcing a reader to infer it.

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
