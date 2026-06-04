---
title: Compositions
nav_order: 6
has_children: true
permalink: /compositions/
has_toc: true
toc: true
---

# Compositions

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


This folder holds **compositions** — specifications that wire two or more atoms from `atoms/` into a single coherent artifact.

A composition names at least one other pattern in its specification. Where atoms describe self-contained concepts (Personal Todo, Duplicate Prevention, Event Log), compositions describe how those concepts come together to do real work — Audit Trail composing Event Log with retention and tamper-evidence; Shared Todo composing Personal Todo with Permissions and Assignment; Reservation Lifecycle composing Reservation with Hold Window and Capacity.

Each file in this folder declares the atoms it composes and the logic that wires them together.

*Vocabulary note.* EOS literature and [concept-catalog](https://github.com/dpapathanasiou/concept-catalog) use *applications* for the same artifact. Grace Commons uses *compositions* because these files are structurally compositions — formal combinations of independently valid patterns — not deployable products. The underlying mechanism is identical; only the label differs.

---

## Format

A composition spec at minimum names:

- **Composes** — which atoms it brings together (linked).
- **Composition logic** — how the atoms are wired: which actions in one trigger which in another, what policy parameters each atom is configured with, how cross-atom invariants are maintained.
- **Composition-level invariants** — invariants that emerge from composition and don't belong to any single constituent.
- **Examples** — concrete scenarios showing the composition in action.
- **Edge cases** — failure modes that arise from composition, including conflicts between constituent atoms.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full contribution shape.

---

## Compositions in this library

- [Undo History](./undo-history.md) — Personal Todo + Event Log. Every Personal Todo action is reversible; the user gets a familiar Cmd+Z experience without modifying either constituent atom.
- [Idempotent Reservation](./idempotent-reservation.md) — Provisional Commitment + Duplicate Prevention. Every state-changing call is safely retryable: same idempotency token, same result, regardless of retry count. The composition formalizes what every production payment processor and reservation system implements today.
- [Audit Trail](./audit-trail.md) — Event Log + Actor Identity + Retention Window + Tamper Evidence. Every action of consequence is recorded, attributed to a verifiable actor, retained for its regulatory lifetime, and protected against after-the-fact rewriting. The canonical four-atom composition behind SOX (Sarbanes-Oxley Act) §404, HIPAA (Health Insurance Portability and Accountability Act) §164.312(b), PCI DSS (Payment Card Industry Data Security Standard) Requirement 10, 21 CFR (Code of Federal Regulations) Part 11, SEC (Securities and Exchange Commission) Rule 17a-4, and ISO/IEC 27001 §A.12.4.
- [Shared Todo](./shared-todo.md) — Personal Todo + Permissions + Assignment. A shared list where actors see and act on tasks according to explicit grants, and at most one actor is responsible for each task at any time. The emergent guarantee: every mutation is permission-gated, and no assignment is left dangling against a deleted task.
- [Notification Fanout](./notification-fanout.md) — Subscription + Notification. When an event fires, every Active subscriber for the event scope receives a Notification record. The first composition in the library to produce a variable number of effects from a single trigger; fan-out is the directed invocation graph over the two messaging atoms, with per-recipient failure isolation and an ephemeral `fanout_id` correlation handle that becomes durable when Event Log is composed in.
- [Multi-Party Approval](./multi-party-approval.md) — Approval Step + Permissions + Assignment, layered on Audit Trail (Event Log + Actor Identity + Retention Window + Tamper Evidence). Wires N Approval Step instances under a named quorum rule (all-of-N, M-of-N, one-of-N) into a single enforced chain with deterministic quorum evaluation, in-tray binding per pending step, and full audit-substrate coverage. The first composition in the library to compose another composition (Audit Trail as substrate). Anchors SOX §404, FDA 21 CFR Part 211 / Part 11, ICH E6 GCP, ISO 9001 §8.5.1, ISO 13485 §7.3, SOC 2, and NIST SP 800-53 AC-5 / CM-3.
- [Defensible Retention](./defensible-retention.md) *(partially resolved)* — Legal Hold + Retention Window + Audit Trail (substrate). Makes record retention *defensible*: a record under any Active Legal Hold cannot be purged regardless of retention eligibility; every retention decision is attribution-stamped and tamper-evident via the Audit Trail substrate; the destruction of any record is provably authorized or provably blocked. Emergent invariants: hold-blocks-purge, retention coverage, hold audit coverage, retention-decision audit coverage, defensible destruction. Retires forthcoming-links in Legal Hold, Retention Window, and Audit Trail. Anchors FRCP (Federal Rules of Civil Procedure) Rule 37(e), SOX §802, HIPAA §164.530(j), SEC Rule 17a-4, and GDPR (General Data Protection Regulation) Article 17.
- [Attributed Permissions Admin](./attributed-permissions-admin.md) — Permissions + Actor Identity. Every permission grant and every revocation is paired atomically with a verifiable attestation under the issuing actor's credential — the records alone answer the regulator's question *"who granted this access, when, and under what credential?"* Eight emergent invariants including attribution completeness, revocation attribution, attestation exclusivity, and orphan-log durability. The first composition in the library to pair two compliance-infrastructure atoms into a single administrative surface and to ship with a dynamic Alloy trace model verifying its load-bearing temporal claims. Anchors NIST SP 800-53 AC-3 + AU-2 + IA-2, SOX §404, HIPAA §164.312(a)(1) + §164.312(b), PCI DSS Req. 7 + Req. 10, 21 CFR Part 11 §11.10 + §11.50, GDPR Articles 25 and 30, and ISO/IEC 27001 §A.9.2.
- [Privileged Access Provisioning](./privileged-access-provisioning.md) — Multi-Party Approval + Credential + Session + Capability + Audit Trail. A principal's request for elevated access is gated by a mandatory multi-party approval chain; only after all required approvals commit does the composition allocate a time-limited, scoped Capability token. Session validity is checked before every access exercise; the cascade from Credential revocation through Session invalidation is the emergent property that closes the blast-radius of a compromised principal. Ships with a Python-based TLA+ behavioral model (841 states, all invariants held). Anchors NIST SP 800-53 AC-6 (least privilege), SOX §302 / §404, HIPAA §164.312(a)(1), PCI DSS Req. 7 + Req. 8.
- [Login](./login.md) — Credential + Session + Audit Trail. Every `login` call wires `Credential.verify → Session.issue` in the only safe order; every attempt (successful or failed) is recorded. The load-bearing emergent invariant is the cascade: `revoke_sessions_for_credential` walks the `credential_to_sessions` map and invalidates every Active session derived from a revoked credential in a single operation, with a reconcilable Audit Trail record. Six emergent invariants including credential-gates-issuance, cascade completeness (snapshot-scoped), and session-credential traceability. Anchors NIST SP 800-63B §7, NIST SP 800-53 AC-12, OWASP ASVS V3.1 + V3.3, HIPAA §164.312(d), PCI DSS Req. 8.2 + Req. 8.6.
- [KYC / Customer Onboarding with Ongoing Monitoring](./kyc-customer-onboarding.md) *(grounded on Final Critique 4)* — Party Identity + Retention Window + Audit Trail (substrate). The full Customer Due Diligence arc for an external party: identity verified before regulated activity, the `Verified` state gated as the single precondition any activity system consumes through `activity_permitted`, ongoing monitoring driving adverse-trigger suspension and re-verification, and a post-closure retention floor that outlasts the relationship. Seven emergent invariants including verification-gates-activity, adverse-trigger-precedes-state-transition, open-trigger/suspension correspondence, and the post-closure retention floor. The gate enforces *verified-through-C8* (it consults the composition's own case index, so a party verified outside C8 fails with `not-known`), and every adverse trigger carries a records-alone `trigger_id` lifecycle. Anchors FATF Recommendations 10–12, BSA/AML 31 CFR §1020.220, FinCEN Beneficial Ownership 31 CFR §1010.230, EU AMLD5, and GDPR Article 6(1)(c).
- [Session-Gated Authorization](./session-gated-authorization.md) — Session + Permissions. Every permission query is gated by a mandatory session validation before the Permissions atom is consulted. The load-bearing emergent invariant is principal binding: the `principal_ref` passed to `Permissions.permitted` is always the principal extracted from the validated session — never a caller-supplied value. A caller cannot interrogate permissions for an arbitrary principal by presenting an arbitrary session token. Expired, revoked, and unrecognized sessions block the query before Permissions is reached. Introduces no cross-atom state; the gate is a sequencing constraint at the composition boundary. Four emergent invariants. Anchors NIST SP 800-53 AC-3 + AC-12, NIST SP 800-63B §7, OWASP ASVS V3.3, HIPAA §164.312(a)(1) + §164.312(d), PCI DSS Req. 7 + Req. 8, ISO/IEC 27001 §A.9.4.1.

- [External Onboarding](./external-onboarding.md) — Invitation + Credential + Party Identity + Audit Trail. The full arc of admitting an external entity: invitation issued by an authorized actor, accepted (binding the invitee's identity reference), Party Identity enrolled in Unverified state, credential registered, every step attested in the Audit Trail. The load-bearing emergent invariant is invitation-gates-enrollment: no Party Identity is created unless an Invitation's Accepted transition precedes it in the same onboarding call, and the Audit Trail completion record names the invitation token, accepting identity reference, party record, and credential in one tamper-evident entry. Five emergent invariants. Anchors GDPR Articles 6–7, HIPAA §164.312(a)(1) + §164.312(d), SOC 2 CC6.2, NIST SP 800-63A, SCIM 2.0 RFC 7644.

- [Chain of Custody (C12)](./chain-of-custody.md) — Provenance + Audit Trail (substrate). The full chain-of-custody surface: Provenance's structural custody continuity made attributed (each custodian verified via credential through Actor Identity), tamper-evident (each entry sealed via Tamper Evidence), and retention-governed (each entry retained via Retention Window) — all reached transitively through the Audit Trail substrate. The load-bearing emergent guarantee is records-alone custody proof: `verify_custody` proves unbroken + attributed + tamper-evident + retention-governed custody from origin to disposition, which neither constituent provides alone. The cross-domain flagship: pharmaceutical chain of custody (FDA 21 CFR Part 211 / DEA 21 CFR Part 1304) and legal-evidence chain of custody (FRE 901(b)(9)) are the same structure — one composition serves both. First composition to compose the Provenance atom; ships with a TLA+ binding-bijection model + buggy twin. Retires the Chain-of-Custody forthcoming-link in Provenance. Anchors FDA 21 CFR Part 211, DEA 21 CFR Part 1304, FRE 901(b)(9), ISO 23081, W3C PROV, and SEC Rule 17a-4.

Forthcoming:

- **Reservation Lifecycle** — Provisional Commitment + Capacity Constraint Enforcement + Actor Identity

---

*Atoms describe what; compositions describe what happens when atoms meet.*
