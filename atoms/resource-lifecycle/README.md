---
title: Resource Lifecycle
parent: Atoms
has_children: true
nav_order: 4
permalink: /atoms/resource-lifecycle/
has_toc: true
toc: true
---

# Resource Lifecycle Patterns

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Patterns governing how resources are reserved, allocated, held, committed, and released.

The same pattern appears across domains: a seat hold at an airline, an inventory reservation at a retailer, a credit limit check at a bank, a bed assignment at a hospital. Different vocabulary, different stakes, one pattern.

## Patterns in this category

- [Provisional Commitment](./provisional-commitment.md) — a resource is held for a requester for a bounded window, then resolves into Confirmed, Released, or Expired. The lifecycle pattern behind credit-limit holds, bed assignments, inventory reservations, room bookings, and seat holds. `grounded`.
- [Soft Delete](./soft-delete.md) — record marked deleted and hidden from normal queries, retained in recoverable form until explicit purge. Three states: Active, Deleted, Purged. Deleted is reversible; Purged is terminal. Anchors GDPR Article 17, HIPAA §164.310(d)(2)(i), FRCP Rule 37(e), SOX §802, and ISO 15489-1. `grounded`.
- [Capacity Constraint Enforcement](./capacity-constraint-enforcement.md) — bounded pool of a finite resource with arithmetic that enforces *total allocated never exceeds declared capacity*. Three states: Open, Suspended, Closed. Units are fungible (no per-allocation identity at this layer); composes with Provisional Commitment for the per-allocation lifecycle. Unblocks Reservation Lifecycle (C9). `partially resolved` — foundation draft + Pass 1 GRID complete; Pass 2 EOS and Pass 3 Linus pending.
- Resource allocation with expiry — *(forthcoming)*
- Idempotent reservation — *(realized as the [Idempotent Reservation](../../compositions/idempotent-reservation.md) composition)*

*This category is under active development. Pattern proposals welcome.*
