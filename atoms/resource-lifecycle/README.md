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

- [Provisional Commitment](./provisional-commitment.md) — a resource is held for a requester for a bounded window, then resolves into Confirmed, Released, or Expired. The lifecycle pattern behind credit-limit holds, bed assignments, inventory reservations, room bookings, and seat holds.
- [Soft Delete](./soft-delete.md) — record marked deleted and hidden from normal queries, retained in recoverable form until explicit purge. Three states: Active, Deleted, Purged. Deleted is reversible; Purged is terminal. Anchors GDPR Article 17, HIPAA §164.310(d)(2)(i), FRCP Rule 37(e), SOX §802, and ISO 15489-1. `unresolved` — foundation round complete; human refinement and adversarial rounds pending.
- Resource allocation with expiry — *(forthcoming)*
- Idempotent reservation — *(forthcoming)*
- Capacity constraint enforcement — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
