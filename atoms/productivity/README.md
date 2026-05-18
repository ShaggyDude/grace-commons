---
title: Productivity
parent: Atomic Concepts
has_children: true
nav_order: 1
permalink: /atoms/productivity/
has_toc: true
toc: true
---

# Productivity Patterns

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Patterns for recording, tracking, ordering, and completing units of work.

The same primitives appear across domains: a personal task list, a developer's issue tracker, an IT service request queue, a compliance checklist, an editorial workflow, a clinical care plan. Different vocabulary, different stakes, one underlying mechanic.

Productivity patterns are smaller and more atomic than the business workflows elsewhere in the library — closer to building blocks than to full domain processes. They are included because productivity primitives are reimplemented constantly, inconsistently, in every system that has work in it. Specifying them once, well, makes the larger business patterns that compose with them simpler to express.

## Atoms in this category

- [Personal Todo](./personal-todo.md) — single-user task tracking with pending / done / removed states and edit. Composes with [Duplicate Prevention](../temporal/duplicate-prevention.md) for recency-based duplicate rejection.
- [Assignment](./assignment.md) — binding of a unit of work to a responsible actor. Active until recalled or transferred; at most one Active assignment per task. Direct prerequisite for Shared Todo.
- Shared Todo — multi-actor task tracking with assignment — *(forthcoming)*
- Priority and ordering — *(forthcoming)*
- Task dependencies — *(forthcoming)*
- Recurring tasks — *(forthcoming)*
- Reopen and revision — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
