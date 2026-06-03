---
title: Compliance
parent: Atomic Concepts
has_children: true
nav_order: 3
permalink: /atoms/compliance/
has_toc: true
toc: true
---

# Compliance Patterns

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Patterns governing audit trails, regulatory holds, reporting obligations, and compliance lifecycle management.

Compliance logic is domain-specific in vocabulary but structurally similar across regulated industries. The pattern of "action must be recorded, attributed, and retrievable" is the same in healthcare, finance, and government.

## Patterns in this category

- [Actor Identity](./actor-identity.md) — verifiable binding of an action to the actor who authorized it. The non-repudiation primitive every regulated atom composes with for attribution. Anchors NIST SP 800-63, eIDAS, 21 CFR (Code of Federal Regulations) Part 11, HIPAA (Health Insurance Portability and Accountability Act) §164.312(d), and SOX (Sarbanes-Oxley Act) §302 / §404.
- [Retention Window](./retention-window.md) — bounded record lifetime with a structural no-early-purge guarantee and an observable overshoot metric for too-late purges. The retention primitive every regulated record composes with. Anchors ISO 15489, GDPR (General Data Protection Regulation) Art. 5(1)(e), HIPAA §164.530(j), SOX §802, SEC (Securities and Exchange Commission) Rule 17a-4, FINRA (Financial Industry Regulatory Authority) Rule 4511, 21 CFR Part 11, and DoD 5015.02-STD.
- [Tamper Evidence](./tamper-evidence.md) — cryptographic evidence that a set of records has not been altered since its authoritative creation. Mechanism-neutral (hash chains, Merkle trees, external anchoring); verification is read-only and requires the originating records. The integrity primitive every regulated record set composes with. Anchors ISO/IEC 27001 §A.12.4, FIPS 180-4, RFC 3161, NIST SP 800-92, 21 CFR Part 11, DoD 5015.02-STD, GDPR Art. 32, W3C Verifiable Credentials, and Git's commit DAG as a worked open-source instance.
- [Permissions](./permissions.md) — grant-based authorization surface binding a subject to an action scope. The authorization primitive: `permitted` answers whether an actor holds an active grant; `denied` is a structural no. Anchors NIST SP 800-53 AC family, NIST SP 800-207, ISO/IEC 27001 §A.9, HIPAA §164.312(a)(1), SOX §404 segregation of duties, PCI DSS (Payment Card Industry Data Security Standard) Requirement 7, and GDPR Art. 25. `draft` — pressure-testing passes pending.
- The canonical regulated-audit application composing these primitives is [Audit Trail](../../compositions/audit-trail.md), which wires Event Log + Actor Identity + Retention Window + Tamper Evidence into the structure SOX §404, HIPAA §164.312(b), PCI DSS Requirement 10, 21 CFR Part 11, SEC Rule 17a-4, and ISO/IEC 27001 §A.12.4 all require.
- [Legal Hold](./legal-hold.md) — preservation obligation that suspends purge regardless of retention window expiry. Concurrent holds are independent; releasing one hold does not affect others on the same record. Anchors FRCP (Federal Rules of Civil Procedure) Rule 37(e), FRCP 26(b), Sedona Principles, SOX §802, SEC Rule 17a-4(f), HIPAA §164.530(j), GDPR Art. 17(3)(e), and 21 CFR Part 11. `unresolved` — foundation round complete; human refinement and adversarial rounds pending.
- [Consent](./consent.md) — binding of a data subject's affirmative agreement to a named processing purpose, with full grant/revoke/expiry lifecycle. `check` returns one of four first-class outcomes: `granted | revoked | expired | not-known`. Revocation is not retroactive. Anchors GDPR Articles 6–7, CCPA/CPRA, HIPAA §164.508, 21 CFR Part 11, ICH E6, and COPPA. `unresolved` — foundation round complete; human refinement and adversarial rounds pending.
- [Selective Disclosure](./selective-disclosure.md) — append-only record of every disclosure of subject data: to whom, what scope, under what authority (consent, legal-hold, or regulatory), and when. The disclosure accountability primitive composing systems invoke after each data transfer to answer GDPR Art. 15(1)(c), HIPAA §164.528, and SEC Rule 17a-4 disclosure accounting requirements. `grounded` 26-05-13.
- Mandatory reporting triggers — *(forthcoming)*

*This category is under active development. Pattern proposals welcome.*
