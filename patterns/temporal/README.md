---
title: Temporal
parent: Patterns
has_children: true
nav_order: 2
permalink: /patterns/temporal/
---

# Temporal Patterns

Patterns governing scheduling, deadlines, expiry, windows, and time-dependent state transitions.

Time is a source of accidental complexity in most systems — batch windows, hold expiries, enrollment periods, filing deadlines. The underlying temporal patterns are generic. The domain vocabulary is not.

## Patterns in this category

- [Duplicate Prevention](./duplicate-prevention.md) — temporally-bounded recency guard against duplicate adds (also: temporal idempotency, cooldown, recency guard). Composes with Personal Todo, comment posting, form submission, payment idempotency, and others.
- [Event Log](./event-log.md) — append-only sequence of immutable, time-ordered events. The substrate every audit, history, replay, and event-sourcing application composes on top of.
- Hold window with expiry — *(forthcoming)*
- Enrollment and eligibility periods — *(forthcoming)*
- Deadline enforcement and grace periods — *(forthcoming)*
- Scheduled state transitions — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
