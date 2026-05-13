---
title: Messaging
parent: Atoms
nav_order: 5
has_children: true
permalink: /atoms/messaging/
has_toc: true
toc: true
---

# Messaging atoms

Atoms in this category specify the primitives for communicating information across actor boundaries — recording interest, recording delivery, and tracking outcomes. Neither atom implements routing, transport, or scheduling; those belong to composing patterns.

---

## Atoms in this category

- [Subscription](./subscription.md) — a durable record that a named actor expressed interest in a class of events. Owns the active subscription set and the two query surfaces (`subscribed`, `subscribers_for`) that fanout compositions use to enumerate recipients when an event fires.
- [Notification](./notification.md) — the delivery record for a single notification to a single recipient. Owns the full delivery lifecycle: Pending → Delivered | Failed | Expired. Records whether delivery succeeded; does not implement the transport that produces that outcome.

Both atoms are `grounded`.

---

## Forthcoming

- **Notification Fanout** (`compositions/`) — the composition that wires Subscription + Notification + an event source into an end-to-end delivery pipeline. When an event fires, the composition calls `Subscription.subscribers_for(event_scope)` and creates one Notification record per returned subscriber. Fan-out is decomposed as intent-then-per-recipient per the boundary rules in the Execution Contract; neither constituent atom changes to accommodate the fanout pattern.

---

## Standards anchors

- **Observer pattern** (GoF) — Subscription is the Subscriber role; Notification is the notification object.
- **Publish-subscribe** (Birman & Joseph, 1987; AMQP, Apache Kafka) — topic-based subscription as the mechanism for decoupling event producers from consumers.
- **WebSub** (W3C Recommendation) — web-native publish-subscribe; the subscription resource is the direct Web analog of the Subscription atom.
- **SMTP / RFC 5321** — email delivery; the three Notification terminal states map to SMTP dispositions.
