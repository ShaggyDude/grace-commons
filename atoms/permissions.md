---
title: Permissions
parent: Atomic Concepts
has_toc: true
toc: true
---

# Permissions

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> A compliance primitive: a grant-based authorization surface binding a subject to an action scope. Each grant (an explicit record conferring a permission) has an opaque (system-generated, with no meaningful content) immutable id; the subject reference and action scope are immutable properties set at grant time. Permission evaluation is a read-only query. The contract the atom enforces is **authorization** — `permitted` confirms the named subject holds at least one active grant covering the named action scope; `denied` is an unambiguous structural no.

---

## Intent

Every system that distinguishes actors must eventually answer the question *"is this actor allowed to do this thing?"* The answer must be derivable from stored records alone — not from the memory of whoever configured the system, not from the code that enforces it. The authorization surface needs to be auditable, revocable, and verifiable in the same adversarial contexts that any other regulated record must survive.

The pattern addresses the *can* question that Actor Identity cannot answer. Actor Identity records *who authorized an action after the fact*; Permissions determines *whether an action is allowed before it occurs*. Both are required in a complete authorization story; neither substitutes for the other.

A grant is the atom's unit of authorization: a binding of a subject to an action scope that remains active until revoked. Evaluation is grant-lookup: if any active grant exists for the queried (subject, scope) pair, the answer is `permitted`; otherwise `denied`. No active grant, no permission — there is no implicit permission and no notion of a default-allow posture within this atom.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the grant set), its own actions (`grant`, `revoke`, `permitted`), and its own operational principles (grants are immutable once recorded; revocation (the explicit removal of a previously granted permission) is terminal; evaluation is a read-only query over the active grant set). It does not implement role management, attribute-based policy evaluation, delegation, inheritance, hierarchical scope matching, or time-bounded grants. Each is a separate composable pattern; see Composition notes.

---

## Summary

Permissions answers one question: "is this actor allowed to do this thing right now?" It works through grants — explicit records that tie a subject (the actor wanting access) to an action scope (the set of operations the grant covers). A grant stays in force until it is revoked, and revocation is immediate and permanent. Checking permission is a pure read-only lookup: if any active grant matches the subject and scope being asked about, the answer is "permitted"; otherwise it is "denied." There is no implicit access — no grant means no permission, always. The whole decision rests on stored records, so any auditor can re-run the same check and get the same answer, which is exactly what regulated access control needs: issue a grant when access is authorized, revoke it when it ends, check on every attempt, and the records show who could do what, from when to when. The pattern deliberately leaves out roles, attribute-based policies, scope hierarchies, delegation, and time-limited grants — each is a separate pattern built on top of this minimal grant store.

---

## Structure

### Identity model

Every grant known to the system has a **`grant_id`** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it) on `grant`. The id is the grant's identity; the subject reference and action scope are immutable *properties* of the grant, not its identity.

Two grants with the same subject and scope have different ids. This matters: a subject may hold multiple independent grants covering the same scope — issued at different times, by different grantors, under different policies. Revocation of one grant does not affect others. The evaluation query is satisfied by *any* active grant matching the (subject, scope) pair; the id is the handle for revocation.

Ids are not reused after a grant is revoked.

The opaque-id model is the same discipline used across the library: identifying grants by (subject_ref, action_scope) would collapse independent grants into a single record, making selective revocation impossible and making the audit trail — which grant authorized which access, issued when — unreadable. Opaque ids preserve the one-grant-one-id discipline that makes per-grant revocation and per-grant audit tractable.

### Inputs

- A subject reference identifying *who* holds the grant. Opaque — the actor registry is a separate concept.
- An action scope identifying *what* the grant covers. Opaque — the composing system defines scope semantics and how to express scope membership. This atom does exact matching on the scope value; scope hierarchy, wildcard expansion, and overlap resolution belong to composing patterns.
- Actions:
  - `grant(subject_ref, action_scope) → grant_id | rejected(invalid-request | storage-failure)`
  - `revoke(grant_id) → ok | rejected(not-known | not-active | storage-failure)`
  - `permitted(subject_ref, action_scope) → permitted | denied`
- A clock providing wall-time timestamps and an id source for `grant_id` allocation, both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the `grant_id` at the seam before the transition runs; the pure transition receives `now` and `grant_id` as inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic.

**String input policy (applies to every string input).** Values are byte-exact — no trimming, Unicode normalization, or case folding before storage or comparison. A whitespace-only string counts as empty and is rejected wherever non-empty is required. The deployment sets a maximum length per string input; an over-length value is rejected by `grant` and treated as non-matching by `permitted`. `permitted` applies the same byte-exact equality it uses for matching.

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

- **`grant_id`** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on `grant`. Never changes.
- **`subject_ref`** — opaque reference to the subject holding the grant. Set on `grant`. Never changes.
- **`action_scope`** — opaque reference to the scope of the grant. Set on `grant`. Never changes.
- **`granted_at`** — wall-time when the grant was recorded. Set on `grant`. Never changes.
- **`status`** — `active` or `revoked`. Set to `active` on `grant`; transitions to `revoked` on `revoke`.
- **`revoked_at`** — wall-time when the grant was revoked. Absent while Active; set on `revoke`. Never changes after set.

Transitions:

- `grant(subject_ref, action_scope)` → a new grant is recorded in Active with a fresh `grant_id`, the supplied `subject_ref` and `action_scope`, and `granted_at` stamped from the injected `now`. Returns `grant_id`.
- `revoke(grant_id)` → the grant at `grant_id` moves Active → Revoked; `revoked_at` stamped from the injected `now`. Returns `ok`.
- `permitted(subject_ref, action_scope)` → read-only query; no state change. Returns `permitted` if any Active grant exists where `grant.subject_ref = subject_ref` and `grant.action_scope = action_scope`; otherwise `denied`.

### Flow

1. **An administrator or composing pattern issues a grant.** Calls `grant(subject_ref, action_scope)` — the atom records the grant in Active and returns the id.
2. **Time passes; the grant persists.** The host system stores the `grant_id` alongside whatever policy or role record necessitated the grant.
3. **An action is attempted.** The composing pattern calls `permitted(subject_ref, action_scope)` before allowing the action. `permitted` → proceed; `denied` → refuse.
4. **At some point, the grant is withdrawn.** Calls `revoke(grant_id)`. The grant moves to Revoked; subsequent `permitted` queries for that (subject, scope) pair no longer see it.

### Decision points

- **At `grant(subject_ref, action_scope)`** — `subject_ref` and `action_scope` must each contain at least one non-whitespace character; otherwise `invalid-request`. The atom does not prevent duplicate active grants for the same (subject, scope) pair — two independent grants covering the same scope are two records with distinct ids, both active. If the grant store write fails after all preconditions pass, the atom returns `rejected(storage-failure)` — no grant is recorded. Durability of the grant store is implementation-owned; a `storage-failure` response guarantees no partial record was written.
- **At `revoke(grant_id)`** — `grant_id` must reference a known grant; otherwise `not-known`. The referenced grant must be in Active; revoking an already-revoked grant is rejected as `not-active`. If the state transition (Active → Revoked) computes successfully but the store write fails, the atom returns `rejected(storage-failure)` — the grant remains Active in the store. This is a security-critical failure mode: a caller who receives `storage-failure` from `revoke` must not assume the grant is revoked; the revocation must be retried. See *Revoke persistence failure* in Edge cases.
- **At `permitted(subject_ref, action_scope)`** — no precondition; `permitted` and `denied` are both first-class outcomes, not rejections. A `permitted` result with an empty active-grant set is structurally impossible — the atom returns `denied` any time no active grant matches. The query is read-only and produces no state change.

### Behavior

Observed behavior, derived from how access control systems are actually deployed:

- A `permitted` query is answered entirely from the active grant set. No grant → `denied`. The composing system is responsible for calling `permitted` before acting; the atom does not enforce that the call happens.
- Multiple active grants for the same (subject, scope) pair are allowed and are independent. Each has its own `grant_id`, `granted_at`, and revocation lifecycle. Revoking one does not affect the others. `permitted` returns `permitted` as long as at least one active grant matches.
- Revocation is immediate and terminal. After a successful `revoke`, the grant moves to Revoked and `permitted` queries against that grant_id's (subject, scope) no longer include it. The grant record remains observable (for audit purposes) but no longer contributes to evaluation.
- The atom does not implement explicit deny. Absence of an active grant is denial; there is no "deny" grant that overrides an active "allow" grant. Explicit-deny semantics belong to a Policy Layer composing pattern that wraps the evaluation surface.
- Action scope is evaluated by exact match on the opaque scope value. The likely objection: "exact match is useless without scope hierarchy — a grant for `documents:read` should cover `documents:read:public`." The mechanism: scope vocabulary is defined entirely by the composing system. OAuth (the OAuth open authorization standard) scope strings, RBAC (Role-Based Access Control) role names, ABAC (Attribute-Based Access Control) policy keys resolved to canonical strings, resource-type/action pairs — all work without modification, because the atom makes no assumption about scope structure. The result: any scope model composes with this atom without requiring the atom to understand scope semantics; hierarchy, wildcards, and inheritance live in the layer that defines the vocabulary, not in the grant store.
- When `permitted` returns `permitted` and multiple active grants exist for the queried (subject, scope) pair, the return value does not indicate which grant matched. This is by design — `permitted` is a pure query that returns a first-class outcome, not a data dump. Composing systems that need to know which grant authorized access (for audit logging, for selective revocation) query the active grant set directly for the (subject_ref, action_scope) pair. The grant store is queryable; the composing system picks the detail level it needs.
- `permitted` with empty or malformed inputs returns `denied` rather than rejecting. An empty `subject_ref` or `action_scope` matches no active grant by definition, so the result is structurally `denied`. `permitted` has no rejection path — both outcomes (`permitted`, `denied`) are first-class results.
- The atom does not record who issued a grant. Grantor attribution — *which administrator granted this, under which policy* — belongs to Actor Identity composing with `grant` (recording an attestation at grant time). The bare atom records the grant, not the authorization to grant.
- **Time and id are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (`execution-contract.md`), the host reads the clock and allocates the `grant_id` at the deployment seam before the transition runs; `granted_at` and `revoked_at` are stamped from the injected `now`, and the core transition reads no wall clock and mints no id internally. This is the determinism the execution contract requires, and it leaves the caller signatures (`grant`, `revoke`, `permitted`) unchanged.

### Feedback

Each successful action produces an observable, measurable change:

- After `grant` — a new grant appears in Active with a fresh `grant_id`, the supplied `subject_ref` and `action_scope`, and `granted_at`. Total grant count increases by one. Active grant count increases by one. The id is returned.
- After `revoke` — the grant at `grant_id` moves to Revoked with `revoked_at`. Active grant count decreases by one; revoked count increases by one; total count unchanged.
- After `permitted` — no state change. The atom returns `permitted` or `denied`.

Each rejected `grant` or `revoke` action produces an observable refusal: `invalid-request` or `storage-failure` (for `grant`); `not-known`, `not-active`, or `storage-failure` (for `revoke`).

The full grant set — Active and Revoked — is queryable. Per-grant fields (id, subject_ref, action_scope, granted_at, status, revoked_at) are observable to auditors and administrators; whether end-users see them is presentation policy of the host system.

### Invariants

The following invariants (conditions that must always hold, regardless of what sequence of actions has occurred) constitute the verification surface of the pattern:

- **Invariant 1 — Grant immutability.** Once recorded, a grant's `grant_id`, `subject_ref`, `action_scope`, and `granted_at` never change. `granted_at` is stamped once from the injected `now` at grant time and is never re-derived from the current clock.
- **Invariant 2 — Status monotonicity.** A grant's status transitions only in one direction: Active → Revoked. No grant returns from Revoked to Active.
- **Invariant 3 — Revocation is terminal.** Once a grant is in Revoked, no `revoke` call will succeed for that `grant_id` (`not-active`), and no `permitted` query will return `permitted` on its basis.
- **Invariant 4 — Id stability.** A grant's `grant_id` is set on `grant` and never changes.
- **Invariant 5 — No id reuse.** No two grants share a `grant_id` across the lifetime of the system.
- **Invariant 6 — Evaluation self-containment.** `permitted(subject_ref, action_scope)` is determined entirely by the active grant set at query time. No out-of-band data is consulted.
- **Invariant 7 — Denial by absence.** `permitted` returns `denied` if and only if no Active grant exists matching the queried (subject_ref, action_scope) pair.
- **Invariant 8 — Revoked grants confer no permission.** For any grant in Revoked state, no `permitted` query returns `permitted` on its basis, regardless of its (subject_ref, action_scope) values.
- **Invariant 9 — Timestamp ordering.** For any grant in Revoked state, `granted_at ≤ revoked_at`. This invariant is best-effort under non-monotonic clocks; if the underlying clock moves backward (NTP adjustment, clock skew), the inequality may be violated. The implementor is responsible for the clock discipline that makes it hold; see Edge cases.
- **Invariant 10 — Grant store durability.** Grants are never deleted from the store. `revoke` transitions a grant from Active to Revoked; it does not remove the record. The total grant count is monotonically non-decreasing. A `grant_id` returned by a successful `grant` call is durably persisted; a `storage-failure` rejection guarantees no partial record was written. This invariant is the formal counterpart of the Generation acceptance bar — "no grant is missing from the store" — and is what makes point-in-time authorization reconstruction possible.

Evaluation self-containment and denial by absence together give the *determinism* property — `permitted` is a pure function of the active grant set at query time; the same query against the same active set always returns the same result. Grant immutability and status monotonicity together give the *auditability* property — the full authorization history of every grant is recoverable from the grant store alone, without recourse to logs, snapshots, or developer narration.

---

## Examples

The same atom, five domains, identical mechanic.

### Banking — segregation of duties on high-value transfers

Regulatory policy requires that no single employee can both initiate and approve a wire transfer above $25,000. Two grants are issued at onboarding: `grant(teller_t9, initiate:transfer) → grant_id g1` and `grant(supervisor_s4, approve:transfer) → grant_id g2`. When teller_t9 attempts to approve their own wire, the system calls `permitted(teller_t9, approve:transfer)` — `denied`. Only supervisor_s4 holds an active grant covering `approve:transfer`. SOX (Sarbanes-Oxley Act) requires this segregation to be demonstrable from records; the grant store is that demonstration.

### Healthcare — HIPAA minimum necessary access

A hospitalist physician is granted access to records for patients under their direct care: `grant(dr_chen, records:ward-7-patients) → g14`. A billing clerk holds a narrower grant: `grant(clerk_b3, records:billing-fields-only) → g22`. When the billing clerk attempts to open a full patient chart, `permitted(clerk_b3, records:ward-7-patients)` returns `denied`. When Dr. Chen's patient is discharged and transferred, the hospitalist grant is revoked: `revoke(g14)`. Subsequent `permitted` queries for Dr. Chen return `denied` for that ward's records. HIPAA (US Health Insurance Portability and Accountability Act) §164.312(a)(1) requires access controls that limit access to the minimum necessary; the grant store is the audit surface.

### Payments — PCI DSS restricted cardholder data access

PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for handling cardholder data) Requirement 7 mandates that access to cardholder data be restricted to individuals whose job requires it. A fraud analyst is granted access: `grant(analyst_a6, cardholder-data:read) → g31`. A customer service representative is not granted this scope; `permitted(rep_r12, cardholder-data:read)` returns `denied`. When the analyst rotates teams, the grant is revoked: `revoke(g31)`. A QSA (Qualified Security Assessor — a PCI-certified auditor) audit calls `permitted` for every employee against the cardholder-data scope and expects to see `denied` for all but the explicitly granted staff; the revocation record shows when access was removed.

### Legal — role-based document access in a matter

A law firm's document management system grants associates access to documents in matters they are staffed on. `grant(associate_j, documents:matter-2024-91) → g55`. A partner on a different matter is not staffed: `permitted(partner_k, documents:matter-2024-91)` → `denied`. When the associate is rolled off the matter, `revoke(g55)` — subsequent access denied. Opposing counsel's discovery request asks the firm to demonstrate who had access to the matter documents and when access was withdrawn; the grant store provides the timeline.

### Source control — branch protection in regulated software

An FDA-regulated (US Food and Drug Administration — the federal agency regulating drugs and medical devices) medical-device team restricts merge access to the `release` branch. `grant(release_engineer_r, branch:release:merge) → g88`. Developers hold only `branch:feature:merge` grants. `permitted(developer_d, branch:release:merge)` → `denied`. When the release engineer changes roles, `revoke(g88)`; a new engineer is issued a fresh grant: `grant(new_release_engineer_n, branch:release:merge) → g91`. The FDA's 21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 11 software validation requirements are satisfied in part by demonstrating that only authorized personnel can modify the release artifact; the grant store is that demonstration.

The mechanic is identical across all five. What differs: the scope vocabulary (account:approve vs. records:ward-7 vs. cardholder-data:read vs. documents:matter vs. branch:release:merge), the lifecycle of grants (long-lived role grants vs. short-lived patient-panel grants), the regulatory consequence of `denied`, and the composing patterns active around it (Actor Identity for grantor attribution, Event Log for access-attempt logging, Retention Window for how long the grant store must be kept).

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

- **Regulator audit — who has access to what.** A HIPAA auditor asks *"which staff have access to full patient records?"* The auditor queries the grant store for all Active grants covering the patient-records scope. The grant store answers from stored fields alone — subject_ref, action_scope, granted_at, status — with no recourse to developer narration. Invariants 1, 6, and 7 are the structural answer: evaluation is self-contained; every active grant is observable; absence of a grant means denial.
- **Disputed access — was this actor permitted at the time of the action?** An actor claims they were not authorized to access a resource at a specific time. The investigator queries the grant store for grants where `subject_ref = actor_ref` and `action_scope = contested_scope` with `granted_at ≤ time_of_action` and (`revoked_at IS NULL OR revoked_at > time_of_action`). The timestamp-based form is preferred over `status = active` because `status` reflects current state, not historical state — a grant revoked after the time of action has `status = revoked` now but was active then; the timestamp condition captures it correctly. A grant matching those criteria is the structural answer: the actor held an active grant at the time of the action. Invariants 1 and 9 make the timeline reconstruction exact.
- **Privilege escalation investigation — unauthorized access attempt.** A security incident suggests an actor accessed a resource beyond their grant. The investigator queries `permitted` against the grant store as it stood at the time of the incident. `denied` at that query confirms no active grant existed — any access that occurred did so by circumventing the authorization surface, which is the security incident's scope, not the atom's. The grant store's integrity determines whether the authorization record can be trusted; composing with Tamper Evidence makes that determination structural.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Role management.** Roles — named collections of scopes assigned to subjects — are a composing RBAC (Role-Based Access Control — permissions granted to roles, which actors are then assigned) pattern. The bare atom deals in direct grants; a role is a shorthand that the composing system resolves into a set of grants before calling `grant`.
- **Attribute-based policy evaluation.** Evaluating whether an actor's attributes (department, clearance level, time of day, resource sensitivity) satisfy a policy expression belongs to an ABAC composing pattern.
- **Scope hierarchy and wildcard matching.** A grant for `documents:*` does not automatically cover `documents:read` in the bare atom. Scope semantics — wildcards, prefix matching, inheritance — belong to the composing system's scope vocabulary. The atom does exact match.
- **Explicit deny.** There is no `deny` grant that overrides an active `allow` grant. Absence of grant is denial; explicit-deny semantics belong to a Policy Layer composing pattern.
- **Delegation and grant inheritance.** A subject granting their own permissions to another subject belongs to a Delegation composing pattern. This atom does not prevent it, but it does not model it; the delegating grant and the delegated grant are independent records.
- **Time-bounded grants.** A grant that expires at a deadline belongs to a Temporal Grant composing pattern. This atom records `granted_at` but does not model expiry. If a grant should expire, the composing system is responsible for calling `revoke` at the right time.
- **Grantor attribution.** The atom does not record who issued a grant. Grantor identity — *"which administrator authorized this grant?"* — belongs to Actor Identity composing with the `grant` action (producing an attestation alongside the grant record). The atom records the grant; Actor Identity records the authorization to grant.
- **Access attempt logging.** The atom does not log `permitted` queries. Whether an access was attempted, by whom, and what the result was belongs to an Event Log composing pattern. The bare atom answers the query; the composing system decides whether to record that the query was made.
- **Actor registration and lifecycle.** `subject_ref` is opaque. Whether an actor exists, is active, or has been deprovisioned is handled by an Actor Registry.
- **Authentication.** Whether the caller is who they claim to be belongs to an Authentication composing pattern. This atom does not verify that the `subject_ref` passed to `permitted` corresponds to the authenticated caller — that binding is the composing system's responsibility.
- **Mass revocation on subject deprovisioning.** When a subject leaves an organization or is deprovisioned, every one of their active grants must be individually revoked by `grant_id`. The atom provides no bulk-revocation surface. A composing system that issues `revoke(one_grant_id)` and considers the subject deprovisioned has left every other active grant for that subject intact — the subject still has access. The operational pattern for deprovisioning is: enumerate all active grants where `grant.subject_ref = departing_subject`, then call `revoke(grant_id)` for each. This is the composing system's responsibility; the atom records every grant individually and revokes individually.
- **Concurrent grant proliferation.** Multiple simultaneous `grant(subject_ref, action_scope)` calls for the same pair produce multiple distinct active grants. Unlike `revoke`, there is no serialization race — both succeed and each returns a distinct `grant_id`. Composing systems that intend to issue a single authoritative grant should guard against concurrent issuance (e.g., by checking for an existing active grant before issuing a new one), or should model multiple grants as an acceptable policy state.
- **Concurrent grant modification.** Multiple simultaneous `revoke` calls for the same grant_id resolve serially: the Active→Revoked transition is a guarded compare-and-set on `status = Active`, committed as a single write under the host environment's serialization guarantee, so two concurrent revokes cannot both succeed — the first wins, the second receives `not-active`.
- **Revoke persistence failure.** If the Active → Revoked transition is computed but the store write fails, the atom returns `rejected(storage-failure)` and the grant remains Active in the store. Unlike a `grant` storage-failure (where the consequence is a missing record), a `revoke` storage-failure has direct security consequences: the subject retains access they should not have. Callers must treat `storage-failure` from `revoke` as an unresolved state requiring retry — not as a confirmed revocation. High-assurance deployments should instrument `revoke storage-failure` as a security alert and implement automatic retry with idempotency-safe semantics (retrying a successful revocation returns `not-active`, which is distinguishable from the original `storage-failure`).
- **Clock semantics.** `granted_at` and `revoked_at` are wall-time stamped from the injected `now` (see Inputs and Behavior). Clock skew, NTP adjustments, monotonicity, and timezone handling are deployment-layer properties the spec does not address. Invariant 9 (`granted_at ≤ revoked_at`) is best-effort under non-monotonic clocks; a clock that moves backward between `grant` and `revoke` can violate the inequality. Trusted timestamping (RFC 3161) is a composing pattern that supplies a verifiable time-anchor if the timeline must be adversarially defensible.
- **Cross-system permission portability.** `action_scope` is opaque and system-local. Federating grants across trust domains belongs to an Identity Federation composing pattern.

Where the atom breaks down: when the scope vocabulary is not expressible as exact opaque references (requiring hierarchy or wildcard matching); when the permitting system must reason about resource attributes at evaluation time (requiring ABAC); when grants must be time-bounded without external revocation (requiring a Temporal Grant wrapper); when the identity of the grantor matters to the evaluation (requiring Actor Identity composition to record the authorization to grant).

---

## Composition notes

Permissions is freestanding and is designed to compose with the authorization and identity atoms:

- **[Actor Identity](./actor-identity.md)** — records *who authorized a grant or revocation* (the grantor attribution concept). Calling `attest(grant_action_ref, grantor_ref, grantor_credential)` alongside `grant` produces a verifiable non-repudiation record for each grant issuance. The composing system stores `attestation_id` alongside `grant_id`. The [Attributed Permissions Admin](../compositions/attributed-permissions-admin.md) composition formalizes this wiring as a named composition with eight emergent invariants (including attribution completeness, revocation attribution, attestation exclusivity, and orphan-log durability) and a dynamic Alloy trace model verifying its temporal claims.
- **[Event Log](./event-log.md)** — records access attempts. Each `permitted` query result can be appended as an event: `{subject_ref, action_scope, result: "permitted" | "denied", at}`. Neither this atom nor Event Log requires the composition; the host system decides whether to log.
- **[Retention Window](./retention-window.md)** — the grant store and its audit history must be retained for the regulatory lifetime of the system. SOX, HIPAA, and PCI DSS each specify minimum retention periods for access-control records.
- **[Tamper Evidence](./tamper-evidence.md)** — the grant store is a target for privilege escalation attacks. Cryptographic hash chains, Merkle-tree commitment, or external anchoring make any rewrite of the grant store detectable from the records alone.
- **RBAC / Role Management** *(forthcoming)* — named roles as collections of scopes. The role manager resolves a role assignment into a set of `grant` calls and a role revocation into a set of `revoke` calls.
- **ABAC / Policy Evaluation** *(forthcoming)* — attribute-based policies that resolve to `permitted`/`denied` by evaluating subject attributes, resource attributes, and environmental conditions against a policy expression. Wraps or composes with the grant surface.
- **Delegation** *(forthcoming)* — a subject granting a subset of their own permissions to another subject for a bounded scope and duration.
- **Temporal Grant** *(forthcoming)* — grants that expire at a deadline, triggering automatic revocation at expiry.
- **Actor Registry / Identity Provisioning** *(forthcoming)* — supplies the actor lifecycle that determines when `subject_ref` values are valid. Deprovisioning an actor should cascade revocation of their grants; that cascade belongs to the composing system.
- **Authentication** *(forthcoming)* — verifies that the caller is who they claim to be before `permitted` is called. The binding of authenticated identity to `subject_ref` is the composing system's responsibility.
- **[Audit Trail](../compositions/audit-trail.md)** — the full regulated-audit composition (Event Log + Actor Identity + Retention Window + Tamper Evidence) applied to the grant store itself: every grant and revocation is recorded, attributed, retained, and tamper-evident.
- **[Multi-Party Approval](../compositions/multi-party-approval.md)** — calls `Permissions.permitted` for chain-level authorization: the composition checks that the initiating actor holds the required scope before `initiate_chain` is accepted, and applies the scope vocabulary defined in Multi-Party Approval's Composition logic to govern who may initiate, withdraw, or read chains.
- **[Session-Gated Authorization](../compositions/session-gated-authorization.md)** — gates every `Permissions.permitted` call on Session validity. The composition calls `Session.validate` before the Permissions check; a stale or revoked session returns `session-invalid` before Permissions is consulted.

[Shared Todo](../compositions/shared-todo.md) composes Permissions with Personal Todo and an Assignment atom — Permissions supplies the authorization surface that determines which actors can read or modify which tasks.

---

## Standards references

Permissions is a foundational access-control primitive with wide regulatory anchoring:

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-53 Rev. 5, AC family (Access Control)** — AC-2 (Account Management), AC-3 (Access Enforcement), AC-6 (Least Privilege), AC-17 (Remote Access). The atom's grant-based evaluation surface is the operational form of AC-3's access enforcement function.
- **NIST SP 800-207 (Zero Trust Architecture)** — least-privilege access per request, with explicit per-resource authorization. The atom's `permitted` query per (subject, scope) is the structural form of per-request evaluation.
- **ISO/IEC 27001 §A.9 (Access Control)** — the International Organization for Standardization / International Electrotechnical Commission information-security standard; logical access control, user access management, review of user access rights. The grant store is the access-rights record §A.9.2 requires.
- **HIPAA §164.312(a)(1) (Technical Safeguards — Access Control)** — unique user identification, emergency access procedure, automatic logoff, encryption. The minimum-necessary principle (§164.514(d)) is operationalized as narrow action scopes. The grant store demonstrates compliance.
- **Sarbanes-Oxley §404 (Internal Control over Financial Reporting)** — segregation of duties, access controls on financial systems. The grant store's timeline (who had what access, from when to when) is the §404 evidence trail.
- **PCI DSS Requirement 7 (Restrict Access to System Components and Cardholder Data)** — need-to-know access, formal access authorization, denial by default. Invariant 7 (denial by absence) is the structural form of PCI DSS's default-deny posture.
- **GDPR (EU General Data Protection Regulation) Article 25 (Data Protection by Design and by Default)** — technical measures ensuring only necessary data is processed. Scoped grants are the technical measure; the grant store demonstrates the measure.
- **NIST SP 800-63-3 (Digital Identity Guidelines)** — the atom composes with Authentication (which supplies NIST IAL/AAL/FAL — Identity, Authenticator, and Federation Assurance Levels — assurance levels) and with Actor Identity (which records the authorization-to-grant event).

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; the discipline of composing authentication, identity, role management, and policy evaluation as separate atoms rather than absorbing them.
- **Eiffel's design-by-contract** — preconditions on `grant` and `revoke`; named rejection reasons.
- **Lampson's access matrix** (1971) — the foundational formal model of access control as a matrix of (subject, object, right) triples. `grant` adds a right to the matrix; `revoke` removes it; `permitted` queries it. The atom is the structured-natural-language realization of Lampson's core operations.
- **Graham-Denning model** — formal treatment of grant and revoke as eight first-class protection operations. Grant and revoke are two of Graham-Denning's eight; the atom isolates those two (plus evaluation) as the minimal authorization surface.

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

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed one foundational logic-confinement finding: the clock and `grant_id` are now host-injected at the I/O seam rather than generated inside the `grant`/`revoke` transitions; caller signatures unchanged; see Lineage. Formal layer landed 2026-06-03 — Alloy structural model `permissions.als` + buggy twin verified, see Lineage §Formal model. The pattern was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — all required structural elements resolved; identity model explicit; grant and revoke action signatures with fully-named rejection taxonomies including `storage-failure`; `permitted` query with two first-class outcomes; ten invariants including grant store durability (Invariant 10); five cross-domain examples; regulated adversarial scenarios with disputed access query in timestamp-based temporal form; fifteen edge cases including revoke persistence failure. Fourth entry in `compliance`.

---

## Lineage notes

This atom is the first entry in the library whose primary concern is *prospective authorization* — what an actor is permitted to do — rather than *retrospective attribution* (Actor Identity) or *structural audit guarantees* (Retention Window, Tamper Evidence). It is drafted as a direct prerequisite for the Shared Todo composition (Personal Todo + Permissions + Assignment).

**Conventions inherited from the methodology.** Both regulated-pattern conventions — *Regulated adversarial scenarios* as an Examples subsection and *Generation acceptance* as a standalone section — are inherited from the canonical methodology in [`pressure-testing.md`](../pressure-testing.md) and baked in from the first draft. Lineage notes cite the methodology directly.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine MUSE (the framework version, v1.1, GRID's nodes are drawn from) nodes are populated. The `permitted` query shape (two first-class outcomes: `permitted` | `denied`, no rejection path) mirrors `verify` in Actor Identity — both are read-only queries over stored state that return every legitimate outcome as a first-class result, not forcing a success-or-reject mold. The two-state model (Active → Revoked) is the minimal correct state machine: a grant in force, then withdrawn permanently. No dangling references; all Friction items link to Flow steps; Decision points link to State and Behavior.

**Pass 2 — Conceptual independence (EOS).** Clean. Seven concerns were candidates for absorption and are all correctly named as composing patterns:

- *Role management* — roles are shorthand for grant-sets; they recur across every multi-role system. Belongs to an RBAC composing pattern.
- *Attribute-based policy evaluation* — policies over actor and resource attributes recur across every data-sensitivity classification. Belongs to an ABAC composing pattern.
- *Scope hierarchy and wildcard matching* — scope semantics are domain-specific and recur across every system with a scope vocabulary. The atom does exact match; hierarchy lives in the vocabulary definition.
- *Explicit deny* — a "deny" grant overriding an "allow" grant is a policy-layer concern that recurs in multi-tenant and cross-organizational systems. Belongs to a Policy Layer composing pattern.
- *Delegation* — grant propagation from one subject to another has its own state machine and recurs independently of the base grant surface.
- *Grantor attribution* — who issued a grant is Actor Identity's concern. The atom records the grant; Actor Identity records the authorization to grant.
- *Access-attempt logging* — whether to record `permitted` queries is deployment policy; Event Log is the composing substrate.

**Pass 3 — Adversarial scrutiny (Linus mode).** Eight findings; all closed in-pattern.

- *Revoke-all problem invisible.* Multiple active grants per (subject, scope) are allowed by design, but the consequence — that deprovisioning a subject requires enumerating and revoking every grant individually, with no bulk surface — was not named. Resolved: explicit Edge case entry on mass revocation, naming the operational pattern (enumerate by subject_ref, revoke each grant_id) as the composing system's responsibility.
- *`permitted` with malformed inputs undefined.* `permitted` has no rejection path, but the spec was silent on what `permitted("", scope)` returns. Resolved: Behavior explicitly states that malformed or empty inputs return `denied` — an empty subject matches no active grant by definition.
- *Invariant 9 not clock-safe.* `granted_at ≤ revoked_at` assumes a non-decreasing clock; NTP adjustments can violate it. Resolved: Invariant 9 qualified as best-effort under non-monotonic clocks; clock semantics added to Edge cases with RFC 3161 named as the composing pattern for adversarially-defensible timestamps.
- *Clock semantics absent from Edge cases.* `granted_at` and `revoked_at` come from "an implicit clock" but clock skew, monotonicity, and timezone were not named as explicit out-of-scope. Resolved: dedicated Edge case entry added.
- *Concurrent grant proliferation unnamed.* Concurrent `grant` calls for the same (subject, scope) produce multiple active grants silently. Not a defect in the atom, but an operational trap. Resolved: Edge case entry added naming the pattern and the composing system's responsibility to guard against unintended proliferation.
- *Which grant matched `permitted` — hidden operational gap.* When multiple active grants exist for (subject, scope) and `permitted` returns `permitted`, the return value does not say which grant matched. The answer — query the active grant set directly — is correct but was invisible. Resolved: Behavior explicitly states the pattern: `permitted` returns the first-class outcome; composing systems that need grant-level detail query the store.
- *Scope-exact-match underdefended.* The claim that opaque exact-match is sufficient is a load-bearing architectural decision. The likely objection ("useless without hierarchy") was stated but not argued with the principle-objection-mechanism-result rubric. Resolved: Behavior defends it in-line: scope vocabulary is defined by the composing system; any scope model — OAuth strings, RBAC role names, ABAC keys — works without modification; hierarchy lives in the vocabulary layer.
- *Clark-Wilson wrong citation.* Clark-Wilson models integrity constraints on commercial data, not grant/revoke operations. Resolved: replaced with Lampson's access matrix (1971), which directly models (subject, object, right) triples with grant and revoke as first-class operations — the exact formal ancestor of this atom.

**Refinement round 1 — re-run of all three passes.** Four findings, all closed in-pattern:

- *Action signature incompleteness (Pass 1 / Pass 3).* Both `grant` and `revoke` carried `rejected(reason)` as placeholders; reasons were named in Feedback and Decision points but not in the Inputs signatures. Resolved: `grant` updated to `rejected(invalid-request | storage-failure)`; `revoke` updated to `rejected(not-known | not-active | storage-failure)`. `storage-failure` is new in both — see next finding.
- *`revoke` persistence failure unnamed — security-critical (Pass 3).* If the Active → Revoked transition computes successfully but the store write fails, the atom had no named outcome for this. Unlike a `grant` storage failure (a missing record), a `revoke` storage failure leaves the grant Active in the store while the caller may believe it is revoked — a direct security consequence. Resolved: `storage-failure` added to `revoke`'s rejection taxonomy; Decision points updated to name the failure and state that callers must not treat `storage-failure` as confirmed revocation; new edge case (*Revoke persistence failure*) names the security framing and the automatic retry pattern for high-assurance deployments.
- *Disputed access query used current-state language for historical reasoning (Pass 3).* The adversarial scenario expressed the point-in-time query as `status = active OR revoked_at > time_of_action`. The `status = active` clause reflects current state — a grant revoked after the time of action has `status = revoked` now but was active then. A reader relying on `status = active` to reconstruct historical authorization state would miss grants that were active at the relevant time but have since been revoked. Resolved: query updated to use the timestamp-based form `(revoked_at IS NULL OR revoked_at > time_of_action)` throughout, with an explanation of why the timestamp form correctly captures the temporal intent.
- *No grant store durability invariant (Pass 3).* The Generation acceptance bar explicitly states "no grant is missing from the store," but no formal invariant guaranteed that grants are never deleted. `revoke` transitions state; it does not remove records. This was behavioral observation only. Resolved: Invariant 10 (*Grant store durability*) added, formalizing the monotonically non-decreasing grant count and the guarantee that `storage-failure` rejections leave no partial records. Named as the formal counterpart of the Generation acceptance check.

Pass 2 was clean: no new over-absorptions. The eight concerns from the foundation pass remain correctly externalized.

**Scheduled rescan: 2026-05-20.** Pass 1 clean. Pass 2 clean. Pass 3: one refining finding closed in-pattern. Decision points used "well-formed and non-empty" for `subject_ref` and `action_scope` at `grant` — inconsistent with the canonical library wording established in later atoms. Resolved: reworded to "must each contain at least one non-whitespace character," matching the convention used in Selective Disclosure, Legal Hold, and other atoms authored after this one. All nine GRID nodes confirmed resolved; no over-absorptions identified; no foundational findings. **Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 2 (monotonic Active→Revoked, no reversal) and Invariant 3 (revocation terminal) form a state-machine absorption/reachability claim. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: Alloy structural model authored and verified; pattern promoted to `grounded`.** Derived model [`permissions.als`](./permissions.als) + buggy twin [`permissions-buggy.als`](./permissions-buggy.als), checked headless by the `org.alloytools.alloy.dist` analyzer via `tools/harness/check.mjs` (drafted by a Sonnet subagent, gated by Opus review + an independent buggy-twin run). *What it checks:* a static structural model of grant records ({Active, Revoked}) with `revoke_action` as a pre/post predicate. Seven named `check` asserts — **Invariant 2** (status monotonicity Active→Revoked, no reversal), **Invariant 3** (revocation terminal/absorbing — the load-bearing pair), plus Invariant 5 (grant-id uniqueness), Invariant 1 (revoke preserves subject_ref/action_scope), Invariant 7 (denial-by-absence biconditional), Invariant 8 (revoked grants confer no permission), Invariant 10 (revoke produces a distinct post-record) — all return UNSAT (no counterexample). Eight `run` predicates are all satisfiable (non-vacuity), including `ShowRevokeTransition`, so the monotonicity check is not vacuously true. *Buggy twin* removes the `pre.status = Active` precondition from `revoke_action`, allowing a Revoked grant to be re-transitioned; the checker finds counterexamples on `A_I3_RevocationTerminal` and `A_I10_RevokeProducesDistinctPost`. *Out of model scope:* timestamp ordering (Invariant 9 — best-effort under non-monotonic clocks). *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This atom grounded 2026-05-20 under the early process — one foundation pass plus one refinement round, with Pass 3 "Linus mode" author-conducted and no fresh-reader AI adversarial round — and carried the legacy `grounded — 2026-05-20` token (grandfathered). This round is that missing AI-conducted adversarial round, run by a fresh-reader Opus (Happy-Torvalds-X2); it is the atom's Final Critique 4 (Rounds 1–3 being the foundation/refinement baseline, per `pressure-testing.md` §Round structure). One foundational finding:

- *F1 — Logic Confinement.* The atom read the clock (`granted_at`/`revoked_at = now`, "implicit clock") and minted `grant_id` ("system-generated") inside the `grant`/`revoke` transitions, contrary to the Logic Confinement Principle (`execution-contract.md` §3). Closed by adopting the corpus-canonical host-injected-at-seam formulation (as in Session, Capability, Actor Identity): the clock and id are injected at the I/O seam before the transition; `granted_at`/`revoked_at` are stamped from the injected `now`; `grant_id` is host-allocated at the seam (Inputs, State, Identity model, new Behavior bullet). The caller signatures `grant(subject_ref, action_scope)`, `revoke(grant_id)`, `permitted(subject_ref, action_scope)` are unchanged — time/id are host-injected, not caller-supplied — so the fix is additive with no constituent-change cascade.

Three refining folded: a String input policy (byte-exact, whitespace-only = empty, deployment length cap, applied to `grant` and `permitted`); the concurrent-revoke serialization owner named (guarded compare-and-set on `status = Active`, one committed write under host serialization); and an Invariant 1 clause that `granted_at` is stamped once from the injected `now`, never re-derived. The invariant set stays at ten (Invariant 1 extended in wording only), so dependents' Permissions-invariant references (Attributed Permissions Admin cites Invariants 9 and 10) remain accurate. The *Clock semantics* edge case was reworded off the stale "implicit clock" phrasing to match the fix.

Formal-layer vote stands at YES (Alloy model present and verifying); the timestamp/id seam is out of model scope, so F1 does not reopen it. Confirming fresh-reader Opus clearance gate (2026-06-18): **CLEAR, 0 foundational** — F1 closed, caller signatures and invariant numbering (1–10) confirmed stable at the dependent wrap sites, no new surface beyond one stale-phrase reword (folded). **Compositions affected — confirming check only, NOT a re-pass** (signatures, invariant set/numbering, states, transitions all stable): Multi-Party Approval, Execute Gated Workflow, Session-Gated Authorization, Propagate Consent Revocation Downstream, Actor Suspension, Privileged Access Provisioning, Attributed Permissions Admin, Shared Todo, Capability-Backed Sharing. Grounds at Final Critique 4.
