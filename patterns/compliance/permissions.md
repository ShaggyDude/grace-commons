---
title: Permissions
parent: Compliance
grand_parent: Patterns
nav_order: 4
---

# Permissions

> A compliance primitive: a grant-based authorization surface binding a subject to an action scope. Each grant has an opaque immutable id; the subject reference and action scope are immutable properties set at grant time. Permission evaluation is a read-only query. The contract the atom enforces is **authorization** — `permitted` confirms the named subject holds at least one active grant covering the named action scope; `denied` is an unambiguous structural no.

---

## Intent

Every system that distinguishes actors must eventually answer the question *"is this actor allowed to do this thing?"* The answer must be derivable from stored records alone — not from the memory of whoever configured the system, not from the code that enforces it. The authorization surface needs to be auditable, revocable, and verifiable in the same adversarial contexts that any other regulated record must survive.

The pattern addresses the *can* question that Actor Identity cannot answer. Actor Identity records *who authorized an action after the fact*; Permissions determines *whether an action is allowed before it occurs*. Both are required in a complete authorization story; neither substitutes for the other.

A grant is the atom's unit of authorization: a binding of a subject to an action scope that remains active until revoked. Evaluation is grant-lookup: if any active grant exists for the queried (subject, scope) pair, the answer is `permitted`; otherwise `denied`. No active grant, no permission — there is no implicit permission and no notion of a default-allow posture within this atom.

This is a freestanding atom in the EOS sense. It has its own state (the grant set), its own actions (`grant`, `revoke`, `permitted`), and its own operational principles (grants are immutable once recorded; revocation is terminal; evaluation is a read-only query over the active grant set). It does not implement role management, attribute-based policy evaluation, delegation, inheritance, hierarchical scope matching, or time-bounded grants. Each is a separate composable pattern; see Composition notes.

---

## Structure

### Identity model

Every grant known to the system has a **`grant_id`** — an opaque, immutable, system-generated identifier produced by `grant`. The id is the grant's identity; the subject reference and action scope are immutable *properties* of the grant, not its identity.

Two grants with the same subject and scope have different ids. This matters: a subject may hold multiple independent grants covering the same scope — issued at different times, by different grantors, under different policies. Revocation of one grant does not affect others. The evaluation query is satisfied by *any* active grant matching the (subject, scope) pair; the id is the handle for revocation.

Ids are not reused after a grant is revoked.

The opaque-id model is the same discipline used across the library: identifying grants by (subject_ref, action_scope) would collapse independent grants into a single record, making selective revocation impossible and making the audit trail — which grant authorized which access, issued when — unreadable. Opaque ids preserve the one-grant-one-id discipline that makes per-grant revocation and per-grant audit tractable.

### Inputs

- A subject reference identifying *who* holds the grant. Opaque — the actor registry is a separate concern.
- An action scope identifying *what* the grant covers. Opaque — the composing system defines scope semantics and how to express scope membership. This atom does exact matching on the scope value; scope hierarchy, wildcard expansion, and overlap resolution belong to composing patterns.
- Actions:
  - `grant(subject_ref, action_scope) → grant_id | rejected(reason)`
  - `revoke(grant_id) → ok | rejected(reason)`
  - `permitted(subject_ref, action_scope) → permitted | denied`
- An implicit clock providing wall-time timestamps.

### Outputs

- The current set of grants (Active and Revoked).
- For each grant: `grant_id`, `subject_ref`, `action_scope`, `granted_at`, `status`, and `revoked_at` (if revoked).
- `grant` returns the new `grant_id` on success, or a rejection naming the failed precondition.
- `revoke` returns `ok` on success, or a rejection naming the failed precondition.
- `permitted` returns `permitted` or `denied`. It does not reject — both outcomes are first-class results.

### State

A grant occupies one of two named states:

- **Active** — the grant is in force; it contributes to `permitted` evaluations.
- **Revoked** — the grant has been withdrawn; it no longer contributes to `permitted` evaluations. Revocation is terminal.

Each grant carries:

- **`grant_id`** — opaque, immutable, system-generated. Set on `grant`. Never changes.
- **`subject_ref`** — opaque reference to the subject holding the grant. Set on `grant`. Never changes.
- **`action_scope`** — opaque reference to the scope of the grant. Set on `grant`. Never changes.
- **`granted_at`** — wall-time when the grant was recorded. Set on `grant`. Never changes.
- **`status`** — `active` or `revoked`. Set to `active` on `grant`; transitions to `revoked` on `revoke`.
- **`revoked_at`** — wall-time when the grant was revoked. Absent while Active; set on `revoke`. Never changes after set.

Transitions:

- `grant(subject_ref, action_scope)` → a new grant is recorded in Active with a fresh `grant_id`, the supplied `subject_ref` and `action_scope`, and `granted_at = now`. Returns `grant_id`.
- `revoke(grant_id)` → the grant at `grant_id` moves Active → Revoked; `revoked_at = now`. Returns `ok`.
- `permitted(subject_ref, action_scope)` → read-only query; no state change. Returns `permitted` if any Active grant exists where `grant.subject_ref = subject_ref` and `grant.action_scope = action_scope`; otherwise `denied`.

### Flow

1. **An administrator or composing pattern issues a grant.** Calls `grant(subject_ref, action_scope)` — the atom records the grant in Active and returns the id.
2. **Time passes; the grant persists.** The host application stores the `grant_id` alongside whatever policy or role record necessitated the grant.
3. **An action is attempted.** The composing pattern calls `permitted(subject_ref, action_scope)` before allowing the action. `permitted` → proceed; `denied` → refuse.
4. **At some point, the grant is withdrawn.** Calls `revoke(grant_id)`. The grant moves to Revoked; subsequent `permitted` queries for that (subject, scope) pair no longer see it.

### Decision points

- **At `grant(subject_ref, action_scope)`** — `subject_ref` and `action_scope` must be well-formed and non-empty; otherwise `invalid-request`. The atom does not prevent duplicate active grants for the same (subject, scope) pair — two independent grants covering the same scope are two records with distinct ids, both active.
- **At `revoke(grant_id)`** — `grant_id` must reference a known grant; otherwise `not-known`. The referenced grant must be in Active; revoking an already-revoked grant is rejected as `not-active`.
- **At `permitted(subject_ref, action_scope)`** — no precondition; `permitted` and `denied` are both first-class outcomes, not rejections. A `permitted` result with an empty active-grant set is structurally impossible — the atom returns `denied` any time no active grant matches. The query is read-only and produces no state change.

### Behavior

Observed behavior, derived from how access control systems are actually deployed:

- A `permitted` query is answered entirely from the active grant set. No grant → `denied`. The composing system is responsible for calling `permitted` before acting; the atom does not enforce that the call happens.
- Multiple active grants for the same (subject, scope) pair are allowed and are independent. Each has its own `grant_id`, `granted_at`, and revocation lifecycle. Revoking one does not affect the others. `permitted` returns `permitted` as long as at least one active grant matches.
- Revocation is immediate and terminal. After a successful `revoke`, the grant moves to Revoked and `permitted` queries against that grant_id's (subject, scope) no longer include it. The grant record remains observable (for audit purposes) but no longer contributes to evaluation.
- The atom does not implement explicit deny. Absence of an active grant is denial; there is no "deny" grant that overrides an active "allow" grant. Explicit-deny semantics belong to a Policy Layer composing pattern that wraps the evaluation surface.
- Action scope is evaluated by exact match on the opaque scope value. A grant for `documents:read` does not automatically cover `documents:read:public`; that scope hierarchy is the composing system's concern. The atom makes no assumption about scope structure.
- The atom does not record who issued a grant. Grantor attribution — *which administrator granted this, under which policy* — belongs to Actor Identity composing with `grant` (recording an attestation at grant time). The bare atom records the grant, not the authorization to grant.

### Feedback

Each successful action produces an observable, measurable change:

- After `grant` — a new grant appears in Active with a fresh `grant_id`, the supplied `subject_ref` and `action_scope`, and `granted_at`. Total grant count increases by one. Active grant count increases by one. The id is returned.
- After `revoke` — the grant at `grant_id` moves to Revoked with `revoked_at`. Active grant count decreases by one; revoked count increases by one; total count unchanged.
- After `permitted` — no state change. The atom returns `permitted` or `denied`.

Each rejected `grant` or `revoke` action produces an observable refusal: `invalid-request`, `not-known`, or `not-active`.

The full grant set — Active and Revoked — is queryable. Per-grant fields (id, subject_ref, action_scope, granted_at, status, revoked_at) are observable to auditors and administrators; whether end-users see them is presentation policy of the host system.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Grant immutability.** Once recorded, a grant's `grant_id`, `subject_ref`, `action_scope`, and `granted_at` never change.
- **Invariant 2 — Status monotonicity.** A grant's status transitions only in one direction: Active → Revoked. No grant returns from Revoked to Active.
- **Invariant 3 — Revocation is terminal.** Once a grant is in Revoked, no `revoke` call will succeed for that `grant_id` (`not-active`), and no `permitted` query will return `permitted` on its basis.
- **Invariant 4 — Id stability.** A grant's `grant_id` is set on `grant` and never changes.
- **Invariant 5 — No id reuse.** No two grants share a `grant_id` across the lifetime of the system.
- **Invariant 6 — Evaluation self-containment.** `permitted(subject_ref, action_scope)` is determined entirely by the active grant set at query time. No out-of-band data is consulted.
- **Invariant 7 — Denial by absence.** `permitted` returns `denied` if and only if no Active grant exists matching the queried (subject_ref, action_scope) pair.
- **Invariant 8 — Revoked grants confer no permission.** For any grant in Revoked state, no `permitted` query returns `permitted` on its basis, regardless of its (subject_ref, action_scope) values.
- **Invariant 9 — Timestamp ordering.** For any grant in Revoked state, `granted_at ≤ revoked_at`.

Evaluation self-containment and denial by absence together give the *determinism* property — `permitted` is a pure function of the active grant set at query time; the same query against the same active set always returns the same result. Grant immutability and status monotonicity together give the *auditability* property — the full authorization history of every grant is recoverable from the grant store alone, without recourse to logs, snapshots, or developer narration.

---

## Examples

The same atom, five domains, identical mechanic.

### Banking — segregation of duties on high-value transfers

Regulatory policy requires that no single employee can both initiate and approve a wire transfer above $25,000. Two grants are issued at onboarding: `grant(teller_t9, initiate:transfer) → grant_id g1` and `grant(supervisor_s4, approve:transfer) → grant_id g2`. When teller_t9 attempts to approve their own wire, the system calls `permitted(teller_t9, approve:transfer)` — `denied`. Only supervisor_s4 holds an active grant covering `approve:transfer`. SOX requires this segregation to be demonstrable from records; the grant store is that demonstration.

### Healthcare — HIPAA minimum necessary access

A hospitalist physician is granted access to records for patients under their direct care: `grant(dr_chen, records:ward-7-patients) → g14`. A billing clerk holds a narrower grant: `grant(clerk_b3, records:billing-fields-only) → g22`. When the billing clerk attempts to open a full patient chart, `permitted(clerk_b3, records:ward-7-patients)` returns `denied`. When Dr. Chen's patient is discharged and transferred, the hospitalist grant is revoked: `revoke(g14)`. Subsequent `permitted` queries for Dr. Chen return `denied` for that ward's records. HIPAA §164.312(a)(1) requires access controls that limit access to the minimum necessary; the grant store is the audit surface.

### Payments — PCI DSS restricted cardholder data access

PCI DSS Requirement 7 mandates that access to cardholder data be restricted to individuals whose job requires it. A fraud analyst is granted access: `grant(analyst_a6, cardholder-data:read) → g31`. A customer service representative is not granted this scope; `permitted(rep_r12, cardholder-data:read)` returns `denied`. When the analyst rotates teams, the grant is revoked: `revoke(g31)`. A QSA audit calls `permitted` for every employee against the cardholder-data scope and expects to see `denied` for all but the explicitly granted staff; the revocation record shows when access was removed.

### Legal — role-based document access in a matter

A law firm's document management system grants associates access to documents in matters they are staffed on. `grant(associate_j, documents:matter-2024-91) → g55`. A partner on a different matter is not staffed: `permitted(partner_k, documents:matter-2024-91)` → `denied`. When the associate is rolled off the matter, `revoke(g55)` — subsequent access denied. Opposing counsel's discovery request asks the firm to demonstrate who had access to the matter documents and when access was withdrawn; the grant store provides the timeline.

### Source control — branch protection in regulated software

An FDA-regulated medical-device team restricts merge access to the `release` branch. `grant(release_engineer_r, branch:release:merge) → g88`. Developers hold only `branch:feature:merge` grants. `permitted(developer_d, branch:release:merge)` → `denied`. When the release engineer changes roles, `revoke(g88)`; a new engineer is issued a fresh grant: `grant(new_release_engineer_n, branch:release:merge) → g91`. The FDA's 21 CFR Part 11 software validation requirements are satisfied in part by demonstrating that only authorized personnel can modify the release artifact; the grant store is that demonstration.

The mechanic is identical across all five. What differs: the scope vocabulary (account:approve vs. records:ward-7 vs. cardholder-data:read vs. documents:matter vs. branch:release:merge), the lifecycle of grants (long-lived role grants vs. short-lived patient-panel grants), the regulatory consequence of `denied`, and the composing patterns active around it (Actor Identity for grantor attribution, Event Log for access-attempt logging, Retention Window for how long the grant store must be kept).

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator audit — who has access to what.** A HIPAA auditor asks *"which staff have access to full patient records?"* The auditor queries the grant store for all Active grants covering the patient-records scope. The grant store answers from stored fields alone — subject_ref, action_scope, granted_at, status — with no recourse to developer narration. Invariants 1, 6, and 7 are the structural answer: evaluation is self-contained; every active grant is observable; absence of a grant means denial.
- **Disputed access — was this actor permitted at the time of the action?** An actor claims they were not authorized to access a resource at a specific time. The investigator queries the grant store for grants where `subject_ref = actor_ref` and `action_scope = contested_scope` with `granted_at ≤ time_of_action` and (`status = active` or `revoked_at > time_of_action`). A grant matching those criteria is the structural answer: the actor held an active grant at the time of the action. Invariants 1 and 9 make the timeline reconstruction exact.
- **Privilege escalation investigation — unauthorized access attempt.** A security incident suggests an actor accessed a resource beyond their grant. The investigator queries `permitted` against the grant store as it stood at the time of the incident. `denied` at that query confirms no active grant existed — any access that occurred did so by circumventing the authorization surface, which is the security incident's scope, not the atom's. The grant store's integrity determines whether the authorization record can be trusted; composing with Tamper Evidence makes that determination structural.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Role management.** Roles — named collections of scopes assigned to subjects — are a composing RBAC pattern. The bare atom deals in direct grants; a role is a shorthand that the composing system resolves into a set of grants before calling `grant`.
- **Attribute-based policy evaluation.** Evaluating whether an actor's attributes (department, clearance level, time of day, resource sensitivity) satisfy a policy expression belongs to an ABAC composing pattern.
- **Scope hierarchy and wildcard matching.** A grant for `documents:*` does not automatically cover `documents:read` in the bare atom. Scope semantics — wildcards, prefix matching, inheritance — belong to the composing system's scope vocabulary. The atom does exact match.
- **Explicit deny.** There is no `deny` grant that overrides an active `allow` grant. Absence of grant is denial; explicit-deny semantics belong to a Policy Layer composing pattern.
- **Delegation and grant inheritance.** A subject granting their own permissions to another subject belongs to a Delegation composing pattern. This atom does not prevent it, but it does not model it; the delegating grant and the delegated grant are independent records.
- **Time-bounded grants.** A grant that expires at a deadline belongs to a Temporal Grant composing pattern. This atom records `granted_at` but does not model expiry. If a grant should expire, the composing system is responsible for calling `revoke` at the right time.
- **Grantor attribution.** The atom does not record who issued a grant. Grantor identity — *"which administrator authorized this grant?"* — belongs to Actor Identity composing with the `grant` action (producing an attestation alongside the grant record). The atom records the grant; Actor Identity records the authorization to grant.
- **Access attempt logging.** The atom does not log `permitted` queries. Whether an access was attempted, by whom, and what the result was belongs to an Event Log composing pattern. The bare atom answers the query; the composing system decides whether to record that the query was made.
- **Actor registration and lifecycle.** `subject_ref` is opaque. Whether an actor exists, is active, or has been deprovisioned is an Actor Registry concern.
- **Authentication.** Whether the caller is who they claim to be belongs to an Authentication composing pattern. This atom does not verify that the `subject_ref` passed to `permitted` corresponds to the authenticated caller — that binding is the composing system's responsibility.
- **Concurrent grant modification.** Multiple simultaneous `revoke` calls for the same grant_id resolve serially under the host environment's serialization guarantees. The first wins; the second receives `not-active`.
- **Cross-system permission portability.** `action_scope` is opaque and system-local. Federating grants across trust domains belongs to an Identity Federation composing pattern.

Where the atom breaks down: when the scope vocabulary is not expressible as exact opaque references (requiring hierarchy or wildcard matching); when the permitting system must reason about resource attributes at evaluation time (requiring ABAC); when grants must be time-bounded without external revocation (requiring a Temporal Grant wrapper); when the identity of the grantor matters to the evaluation (requiring Actor Identity composition to record the authorization to grant).

---

## Composition notes

Permissions is freestanding and is designed to compose with the authorization and identity atoms:

- **[Actor Identity](./actor-identity.md)** — records *who authorized a grant or revocation* (the grantor attribution concern). Calling `attest(grant_action_ref, grantor_ref, grantor_credential)` alongside `grant` produces a verifiable non-repudiation record for each grant issuance. The composing system stores `attestation_id` alongside `grant_id`.
- **[Event Log](../temporal/event-log.md)** — records access attempts. Each `permitted` query result can be appended as an event: `{subject_ref, action_scope, result: "permitted" | "denied", at}`. Neither this atom nor Event Log requires the composition; the host system decides whether to log.
- **[Retention Window](./retention-window.md)** — the grant store and its audit history must be retained for the regulatory lifetime of the system. SOX, HIPAA, and PCI DSS each specify minimum retention periods for access-control records.
- **[Tamper Evidence](./tamper-evidence.md)** — the grant store is a target for privilege escalation attacks. Cryptographic hash chains, Merkle-tree commitment, or external anchoring make any rewrite of the grant store detectable from the records alone.
- **RBAC / Role Management** *(forthcoming)* — named roles as collections of scopes. The role manager resolves a role assignment into a set of `grant` calls and a role revocation into a set of `revoke` calls.
- **ABAC / Policy Evaluation** *(forthcoming)* — attribute-based policies that resolve to `permitted`/`denied` by evaluating subject attributes, resource attributes, and environmental conditions against a policy expression. Wraps or composes with the grant surface.
- **Delegation** *(forthcoming)* — a subject granting a subset of their own permissions to another subject for a bounded scope and duration.
- **Temporal Grant** *(forthcoming)* — grants that expire at a deadline, triggering automatic revocation at expiry.
- **Actor Registry / Identity Provisioning** *(forthcoming)* — supplies the actor lifecycle that determines when `subject_ref` values are valid. Deprovisioning an actor should cascade revocation of their grants; that cascade belongs to the composing system.
- **Authentication** *(forthcoming)* — verifies that the caller is who they claim to be before `permitted` is called. The binding of authenticated identity to `subject_ref` is the composing system's responsibility.
- **[Audit Trail](../../compositions/audit-trail.md)** — the full regulated-audit composition (Event Log + Actor Identity + Retention Window + Tamper Evidence) applied to the grant store itself: every grant and revocation is recorded, attributed, retained, and tamper-evident.

Shared Todo composes Permissions with Personal Todo and an Assignment atom — Permissions supplies the authorization surface that determines which actors can read or modify which tasks.

---

## Standards references

Permissions is a foundational access-control primitive with wide regulatory anchoring:

- **NIST SP 800-53 Rev. 5, AC family (Access Control)** — AC-2 (Account Management), AC-3 (Access Enforcement), AC-6 (Least Privilege), AC-17 (Remote Access). The atom's grant-based evaluation surface is the operational form of AC-3's access enforcement function.
- **NIST SP 800-207 (Zero Trust Architecture)** — least-privilege access per request, with explicit per-resource authorization. The atom's `permitted` query per (subject, scope) is the structural form of per-request evaluation.
- **ISO/IEC 27001 §A.9 (Access Control)** — logical access control, user access management, review of user access rights. The grant store is the access-rights record §A.9.2 requires.
- **HIPAA §164.312(a)(1) (Technical Safeguards — Access Control)** — unique user identification, emergency access procedure, automatic logoff, encryption. The minimum-necessary principle (§164.514(d)) is operationalized as narrow action scopes. The grant store demonstrates compliance.
- **Sarbanes-Oxley §404 (Internal Control over Financial Reporting)** — segregation of duties, access controls on financial systems. The grant store's timeline (who had what access, from when to when) is the §404 evidence trail.
- **PCI DSS Requirement 7 (Restrict Access to System Components and Cardholder Data)** — need-to-know access, formal access authorization, denial by default. Invariant 7 (denial by absence) is the structural form of PCI DSS's default-deny posture.
- **GDPR Article 25 (Data Protection by Design and by Default)** — technical measures ensuring only necessary data is processed. Scoped grants are the technical measure; the grant store demonstrates the measure.
- **NIST SP 800-63-3 (Digital Identity Guidelines)** — the atom composes with Authentication (which supplies NIST IAL/AAL/FAL assurance levels) and with Actor Identity (which records the authorization-to-grant event).

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; the discipline of composing authentication, identity, role management, and policy evaluation as separate atoms rather than absorbing them.
- **Eiffel's design-by-contract** — preconditions on `grant` and `revoke`; named rejection reasons.
- **Clark-Wilson integrity model** — the distinction between authorized (permitted subject acting within grant) and unauthorized (no active grant) operations, and the requirement that access records be auditable.
- **Graham-Denning model** — formal treatment of grant and revoke as first-class access-control operations.

---

## Generation acceptance

A derived implementation of Permissions is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the grant store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Enumerate every grant, active and revoked, with its full history.** `grant_id`, `subject_ref`, `action_scope`, `granted_at`, `status`, and `revoked_at` (where applicable) are present and queryable for every grant ever issued. No grant is missing from the store.
- **Reconstruct the authorization state at any past point in time.** Given a timestamp, the auditor can determine which grants were Active at that moment by filtering on `granted_at ≤ t` and (`status = active` or `revoked_at > t`). The timeline is exact (Invariants 1 and 9).
- **Confirm denial by absence.** For any (subject_ref, action_scope) pair where no active grant exists, `permitted` returns `denied`. The auditor can verify this directly from the grant store — no active grant matching the pair means `denied`, structurally, with no exceptions (Invariant 7).
- **Confirm revocation is terminal and immediate.** For every revoked grant, `revoked_at` is present and `status = revoked`. No `permitted` evaluation after `revoked_at` returns `permitted` on the basis of that grant (Invariant 3).
- **Identify composing patterns active in this deployment.** Whether grantor attribution (Actor Identity), access-attempt logging (Event Log), retention (Retention Window), and tamper-evidence on the grant store (Tamper Evidence) are wired in, and with what configuration.

This is the generator's contract: any code generated from this atom must produce a grant store and an evaluation surface that pass the five checks above. The bar is the regulator's question — *"who has access to what, since when, and who authorized it?"* — not the developer's intuition.

---

## Status

`draft` — first-pass structural elements resolved; identity model explicit; grant and revoke preconditions explicit; permitted query shape with two first-class outcomes; five cross-domain examples spanning banking, healthcare, payments, legal, and source control; regulated adversarial scenarios and Generation acceptance included. Pressure-testing passes pending.

---

## Lineage notes

This atom is the first entry in the library whose primary concern is *prospective authorization* — what an actor is permitted to do — rather than *retrospective attribution* (Actor Identity) or *structural audit guarantees* (Retention Window, Tamper Evidence). It is drafted as a direct prerequisite for the Shared Todo composition (Personal Todo + Permissions + Assignment).

**Conventions inherited from the methodology.** Both regulated-pattern conventions — *Regulated adversarial scenarios* as an Examples subsection and *Generation acceptance* as a standalone section — are inherited from the canonical methodology in [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md) and baked in from the first draft.

**Pass 1 — Structural completeness (GRID).** To be completed. Early structural review confirms all nine MUSE nodes are populated. The `permitted` query shape (two first-class outcomes: `permitted` | `denied`, no rejection path) mirrors the `verify` pattern from Actor Identity rather than the standard action-or-reject shape — both are read-only queries over the stored state that return every legitimate outcome as a first-class result. The two-state model (Active → Revoked) is the minimal state machine: a grant in force, then withdrawn permanently.

**Pass 2 — Conceptual independence (EOS).** To be completed. Seven concerns were candidates for absorption and are correctly named as composing patterns:

- *Role management* — roles are a shorthand for grant-sets, not a property of the bare atom.
- *Attribute-based policy evaluation* — policies over actor and resource attributes recur across many access-control contexts; belongs to an ABAC composing pattern.
- *Scope hierarchy and wildcard matching* — scope semantics are domain-specific; the atom does exact match and lets the composing system define scope structure.
- *Explicit deny* — a "deny" grant overriding an "allow" grant is a policy-layer concern, not a grant-store concern.
- *Delegation* — grant propagation from one subject to another has its own state machine and recurs independently of the base grant surface.
- *Grantor attribution* — who issued a grant is Actor Identity's concern; the bare atom records the grant, not the authorization-to-grant event.
- *Access-attempt logging* — whether to record `permitted` queries is a deployment policy; Event Log is the composing substrate.

**Pass 3 — Adversarial scrutiny (Linus mode).** To be completed.
