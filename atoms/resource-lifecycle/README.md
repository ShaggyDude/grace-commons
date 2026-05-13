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

Patterns governing how resources are reserved, allocated, held, committed, and released.

The same pattern appears across domains: a seat hold at an airline, an inventory reservation at a retailer, a credit limit check at a bank, a bed assignment at a hospital. Different vocabulary, different stakes, one pattern.

## Patterns in this category

- [Provisional Commitment](./provisional-commitment.md) — a resource is held for a requester for a bounded window, then resolves into Confirmed, Released, or Expired. The lifecycle pattern behind credit-limit holds, bed assignments, inventory reservations, room bookings, and seat holds.
- Resource allocation with expiry — *(forthcoming)*
- Idempotent reservation — *(forthcoming)*
- Capacity constraint enforcement — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
