---
title: Applications
nav_order: 6
has_children: true
permalink: /applications/
---

# Applications

This folder holds **applications** — compositions of atomic patterns from `patterns/`.

An application is a specification whose definition names at least one other pattern. Where atoms describe self-contained concepts (Personal Todo, Duplicate Prevention, Event Log), applications describe how those concepts come together to do real work — Audit Trail composing Event Log with retention and tamper-evidence; Shared Todo composing Personal Todo with Permissions and Assignment; Reservation Lifecycle composing Reservation with Hold Window and Capacity.

Each file in this folder declares the atoms it composes and the logic that wires them together.

---

## Format

An application spec at minimum names:

- **Composes** — which atoms it brings together (linked).
- **Composition logic** — how the atoms are wired: which actions in one trigger which in another, what policy parameters each atom is configured with, how cross-atom invariants are maintained.
- **Application-level invariants** — invariants that emerge from composition and don't belong to any single constituent.
- **Examples** — concrete scenarios showing the composition in action.
- **Edge cases** — failure modes that arise from composition, including conflicts between constituent atoms.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full contribution shape.

---

## Applications in this library

- [Undo History](./undo-history.md) — Personal Todo + Event Log. Every Personal Todo action is reversible; the user gets a familiar Cmd+Z experience without modifying either constituent atom.

Forthcoming:

- **Audit Trail** — Event Log + Retention Window + Tamper Evidence + Actor Identity
- **Shared Todo** — Personal Todo + Permissions + Assignment
- **Reservation Lifecycle** — Reservation + Hold Window + Capacity Constraint

---

*Atoms describe what; applications describe what happens when atoms meet.*
