---
title: Messaging
parent: Atomic Concepts
nav_order: 5
has_children: true
permalink: /atoms/messaging/
has_toc: true
toc: true
---

# Messaging atoms

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Atoms in this category specify the primitives for communicating information across actor boundaries — recording interest, recording delivery, and tracking outcomes. Neither atom implements routing, transport, or scheduling; those belong to composing patterns.

---

## Atoms in this category

- [Subscription](./subscription.md) — a durable record that a named actor expressed interest in a class of events. Owns the active subscription set and the two query surfaces (`subscribed`, `subscribers_for`) that fanout compositions use to enumerate recipients when an event fires. `grounded`.
- [Notification](./notification.md) — the delivery record for a single notification to a single recipient. Owns the full delivery lifecycle: Pending → Delivered | Failed | Expired. Records whether delivery succeeded; does not implement the transport that produces that outcome. `grounded`.
- [Preference](./preference.md) — a per-principal record of how delivery should be shaped — declared channels, frequency limits, quiet hours, format. Active ↔ (Suspended) → Deleted; at most one currently-in-effect record per principal; updates supersede the prior record rather than mutating it. `partially resolved` — author-conducted foundation passes complete; awaiting fresh-reader AI Phase 3 round and the Opus Phase 4 readiness check.

The three atoms answer three distinct questions in the delivery pipeline. **Subscription** answers *which topics does the principal follow?* — the interest record. **Notification** answers *did a specific piece of information reach the recipient?* — the delivery record. **Preference** answers *given that delivery is otherwise permitted, how does the principal want it shaped?* — the envelope record. Whether the system is legally permitted to communicate with the principal at all is a fourth, separate question, answered by [Consent](../compliance/consent.md). A composing fanout pattern sequences the four (Consent → Subscription → Preference → Notification) at delivery time; this category owns three of the four.

---

## Compositions in this category

- [Notification Fanout](../../compositions/notification-fanout.md) — composes Subscription + Notification + an event source into an end-to-end delivery pipeline. When an event fires, the composition calls `Subscription.subscribers_for(event_scope)` and creates one Notification record per returned subscriber. Fan-out is decomposed as intent-then-per-recipient per the boundary rules in the Execution Contract; neither constituent atom changes to accommodate the fanout pattern. `grounded`.

---

## Forthcoming

- **Preference-Aware Notification Fanout** (`compositions/` — C11) — extends Notification Fanout by consulting Preference at queue time to shape delivery per-principal. Observes Suspended preferences as delivery-suppress, frequency limits as queue-or-drop, quiet hours as defer-until-window, and channel preferences as route-or-suppress. Pending Preference's grounding.

---

## Standards anchors

- **Observer pattern** (GoF) — Subscription is the Subscriber role; Notification is the notification object.
- **Publish-subscribe** (Birman & Joseph, 1987; AMQP, Apache Kafka) — topic-based subscription as the mechanism for decoupling event producers from consumers.
- **WebSub** (W3C Recommendation) — web-native publish-subscribe; the subscription resource is the direct Web analog of the Subscription atom.
- **SMTP / RFC 5321** — email delivery; the three Notification terminal states map to SMTP dispositions.
- **CAN-SPAM Act, TCPA, GDPR Article 7(3) and 21(2), ePrivacy Directive, CASL** — anchored by Preference; the marketing-communication regimes that require per-principal opt-out, frequency caps, time-of-day restrictions, easy-update preference changes, and direct-marketing objection rights.
