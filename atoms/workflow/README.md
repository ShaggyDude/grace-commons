---
title: Workflow
parent: Atomic Concepts
has_children: true
nav_order: 7
permalink: /atoms/workflow/
has_toc: true
toc: true
---

# Workflow Patterns

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Patterns governing state transitions, decision gates, and structured handoffs between actors. Workflow patterns model the controlled movement of work through defined stages, with explicit guards, outcomes, and auditable histories.

Workflow logic is structurally similar across regulated industries — SOX (Sarbanes-Oxley Act) approval chains, FDA electronic-signature requirements, clinical trial investigator approvals, and ISO 9001 production controls all share the same underlying primitives — while the semantics of what moves through the workflow vary by domain.

## Patterns in this category

- [Approval Step](./approval-step.md) — a single binding of a required approval to a named approver, for a specified subject and scope, with a Pending → {Approved, Rejected, Withdrawn} lifecycle. The approval-gate primitive that Multi-Party Approval and Stateful Workflow Execution compose from. Anchors SOX §404, FDA 21 CFR (Code of Federal Regulations) Part 11, ICH E6 GCP, and ISO 9001 §8.5.1. `grounded` 26-05-13.
- [Workflow / State Machine](./workflow-state-machine.md) — the general-purpose state machine engine: a named instance moving through a deployment-**declared** finite set of states via deployment-**declared** transitions, with the full transition history append-only, total-ordered, and replay-deterministic. The atom enforces only-declared-transitions, exactly-one-current-state, and terminal absorption; it gates (but does not evaluate) caller-asserted transition guards. Approval Step is the fixed-state special case; this is the general declared case. The two atoms compose into Stateful Workflow Execution (C10). Anchors FDA 21 CFR Part 11, ISO 9001 §8.5.1, BPMN 2.0, HL7 FHIR Task, and UML/Harel statecharts. `grounded` 2026-06-04 (Alloy model + buggy twin).

*This category is under active development. Pattern proposals welcome.*
