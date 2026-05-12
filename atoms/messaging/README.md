---
title: Messaging
parent: Atoms
has_children: true
nav_order: 5
permalink: /atoms/messaging/
---

# Messaging Patterns

Atoms for recording interest and delivering information across actor boundaries.

The same primitives appear wherever one part of a system needs to inform another part that something has happened: a task assignment notification in a shared todo, a payment confirmation in a reservation system, an access-revocation alert in a compliance workflow. Different vocabulary, different delivery mechanisms, one underlying mechanic — an actor expresses interest in a class of events, and a record is created for each event that fires against that interest.

Messaging atoms are push-aware but delivery-agnostic. They specify the semantic record of what was subscribed to and what was delivered; the transport — WebSocket, webhook, email, push notification, in-app badge — is a deployment concern named explicitly as out-of-scope.

## Atoms in this category

- [Subscription](./subscription.md) — a named actor's active interest in a class of events. Active until cancelled; at most one Active subscription per (subscriber, event scope) pair.
- [Notification](./notification.md) — a delivery record for a single notification to a single recipient. Pending until delivered, failed, or expired.
- Notification Fanout — Subscription + Notification wired for event-driven delivery — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
