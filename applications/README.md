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

*Terminology note.* The folder name *applications* is inherited from [concept-catalog](https://github.com/dpapathanasiou/concept-catalog)'s split between `concepts/` and `applications/` — the formal-methods track Grace Commons runs parallel to. *Compositions* would be semantically more precise — a composed pattern is, structurally, a composition rather than a product — and the rename is under consideration. It is deferred while the vocabulary inheritance from EOS literature is load-bearing.

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
- [Idempotent Reservation](./idempotent-reservation.md) — Provisional Commitment + Duplicate Prevention. Every state-changing call is safely retryable: same idempotency token, same result, regardless of retry count. The composition formalizes what every production payment processor and reservation system implements today.
- [Audit Trail](./audit-trail.md) — Event Log + Actor Identity + Retention Window + Tamper Evidence. Every action of consequence is recorded, attributed to a verifiable actor, retained for its regulatory lifetime, and protected against after-the-fact rewriting. The canonical four-atom composition behind SOX §404, HIPAA §164.312(b), PCI DSS Requirement 10, 21 CFR Part 11, SEC Rule 17a-4, and ISO/IEC 27001 §A.12.4.

Forthcoming:

- **Shared Todo** — Personal Todo + Permissions + Assignment
- **Reservation Lifecycle** — Provisional Commitment + Capacity Constraint Enforcement + Actor Identity

---

*Atoms describe what; applications describe what happens when atoms meet.*
