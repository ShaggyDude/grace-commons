---
title: Compliance
parent: Patterns
has_children: true
nav_order: 3
permalink: /patterns/compliance/
---

# Compliance Patterns

Patterns governing audit trails, regulatory holds, reporting obligations, and compliance lifecycle management.

Compliance logic is domain-specific in vocabulary but structurally similar across regulated industries. The pattern of "action must be recorded, attributed, and retrievable" is the same in healthcare, finance, and government.

## Patterns in this category

- [Actor Identity](./actor-identity.md) — verifiable binding of an action to the actor who authorized it. The non-repudiation primitive every regulated atom composes with for attribution. Anchors NIST SP 800-63, eIDAS, 21 CFR Part 11, HIPAA §164.312(d), and SOX §302 / §404.
- [Retention Window](./retention-window.md) — bounded record lifetime with a structural no-early-purge guarantee and an observable overshoot metric for too-late purges. The retention primitive every regulated record composes with. Anchors ISO 15489, GDPR Art. 5(1)(e), HIPAA §164.530(j), SOX §802, SEC Rule 17a-4, FINRA Rule 4511, 21 CFR Part 11, and DoD 5015.02-STD.
- Audit trail and event attribution — *(forthcoming)*
- Regulatory hold and release — *(forthcoming)*
- Mandatory reporting triggers — *(forthcoming)*
- Consent and authorization records — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
