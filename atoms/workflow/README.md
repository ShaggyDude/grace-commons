---
title: Workflow
parent: Atoms
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

Workflow logic is structurally similar across regulated industries — SOX approval chains, FDA electronic-signature requirements, clinical trial investigator approvals, and ISO 9001 production controls all share the same underlying primitives — while the semantics of what moves through the workflow vary by domain.

## Patterns in this category

- [Approval Step](./approval-step.md) — a single binding of a required approval to a named approver, for a specified subject and scope, with a Pending → {Approved, Rejected, Withdrawn} lifecycle. The approval-gate primitive that Multi-Party Approval and Stateful Workflow Execution compose from. Anchors SOX §404, FDA 21 CFR Part 11, ICH E6 GCP, and ISO 9001 §8.5.1. `partially resolved` — foundation round complete; AI adversarial round pending.
- Workflow / State Machine — general-purpose state machine engine with deployment-declared states and transitions — *(forthcoming, atom #9)*

*This category is under active development. Pattern proposals welcome.*
