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

## Status

Early and foundational. The architectural philosophy is in [`THE_SPEC_LAYER.md`](./THE_SPEC_LAYER.md). The pattern library is being built.

Contributors who understand the problem are welcome before the library is complete. That is the right time to establish the structure.

---

## Contributing

The most valuable contributions right now are pattern proposals, domain expertise, and honest criticism of the architecture.

If you work in a domain with well-specified standards — healthcare, finance, logistics, government — and recognize the problem this is trying to solve, we want to hear from you.

---

*Grace Commons is the open foundation. The patterns that belong to everyone should live somewhere everyone can see them.*
