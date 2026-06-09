---
title: Session-Gated Authorization
parent: Compositions
nav_order: 14
has_toc: true
toc: true
---

# Session-Gated Authorization

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


**Status:** grounded on Final Critique 6 — 2026-05-23 · four baseline-equivalent rounds (Pass 1/2/3 each in Rounds 1–3 plus Final Critique 4) plus Round 5 (touch-triggered re-pass — Alloy artifact verification) plus Round 6 (formal-model refinement closing both Round 5 findings) complete. Round 5 surfaced two refining findings in the formal model; Round 6 closed both. Spec prose unchanged across Rounds 5 and 6; the four named application-level invariants and the three temporal claims (revocation terminal, expiry terminal, gate reflects current status) verified clean against the Alloy (a formal modeling language for checking structural and temporal properties of a design) static + dynamic-trace model — 13 commands, all matching expectation. · **Composes:** [Session](../atoms/session.md) · [Permissions](../atoms/permissions.md)

> A regulated application: every authorization query is gated by a mandatory session validation before the Permissions atom is consulted. An expired, revoked, or unrecognized session terminates the call before Permissions is reached. The principal presented to Permissions is always the principal the session was issued for — never a value the caller supplies. The gate and the principal binding together constitute the composition's load-bearing emergent invariant; neither belongs to Session or Permissions alone.

---

## Intent

Every system that issues session tokens and enforces authorization policies faces the same ordering problem: the runtime check must verify that the session is still valid *before* consulting the permission store, not after. An expired or revoked session that reaches `Permissions.permitted` is an authentication gap masquerading as an authorization query.

Session-Gated Authorization wires Session and Permissions into a single enforced boundary. `Session.validate` must return `valid` before `Permissions.permitted` is consulted. The gate is a pre-check at the composition boundary, not inside either constituent atom. Neither atom gains knowledge of the other; the sequencing constraint is owned entirely by the composition.

The emergent invariant is principal binding: the subject passed to `Permissions.permitted` is always the `principal_ref` extracted from the validated session, never a caller-supplied value. A caller cannot interrogate permissions for an arbitrary principal by presenting an arbitrary session token. This eliminates a class of authorization bypass that is otherwise invisible when the two atoms are composed informally — when code calls `Permissions.permitted(caller_supplied_principal, scope)` without gating on the session, a compromised or forged request can probe any principal's permissions regardless of the session state.

---

## Composes

- **[Session](../atoms/session.md)** — issues, validates, and terminates sessions tied to a principal. Exposes `validate(session_token) → valid(principal_ref, expires_at) | invalid(expired | revoked | not-known)`.
- **[Permissions](../atoms/permissions.md)** — records grants and evaluates permission queries under exact-match and default-deny semantics. Exposes `permitted(subject_ref, action_scope) → permitted | denied`.

---

## Composition logic

The composition exposes one action, `check_permitted`, that executes in two mandatory steps:

**Step 1 — Gate.** `Session.validate(session_token)` must return `valid(principal_ref, expires_at)`. Any other result — `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)` — terminates the call with a `session-invalid` rejection before Permissions is consulted.

**Step 2 — Query.** `Permissions.permitted(principal_ref, action_scope)` is called using the `principal_ref` the session carries. The result (`permitted` or `denied`) is returned unmodified.

The constituent atoms are unaware of each other. Session does not know that a permission check follows; Permissions does not know that a session validation preceded it. The composition owns the ordering constraint.

**Principal binding** is the load-bearing emergent property. Without the composition, a caller could pass any `principal_ref` directly to `Permissions.permitted`. The gate collapses the caller's degree of freedom: the only principal the caller can query permissions for is the principal the session was issued to.

**Default deny propagates.** `Permissions.permitted` returns `denied` when no active grant exists for the `(principal_ref, action_scope)` pair. The composition passes that result through unmodified. A valid session with no matching grant returns `denied`, not `permitted`. Session validity is a necessary but not sufficient condition for access.

---

## Application state

This composition introduces no cross-atom persistent state. There is no index, map, or log at the composition boundary. The gate is a sequencing constraint over the constituent atoms' own state, not a new data structure.

Implementations requiring a durable record of individual authorization decisions — who queried what scope, when, and with what result — should compose Session-Gated Authorization with [Audit Trail](./audit-trail.md) as a substrate. Without Audit Trail, individual `check_permitted` call records do not exist at the composition boundary; the constituent atoms' own state remains the record of session validity and grant existence. See *Composition notes*.

---

## Actions

### check_permitted

Validates a session and, if valid, evaluates whether the session's principal holds the requested permission.

```
check_permitted(session_token, action_scope) →
    permitted
  | denied
  | rejected(invalid-request | session-invalid(expired | revoked | not-known))
```

**Arguments**

- `session_token` — opaque token identifying the session to validate. Required; absence or malformation produces `rejected(invalid-request)`.
- `action_scope` — the permission scope to evaluate. Must match the exact scope string recorded in Permissions grants. Required; absence or malformation produces `rejected(invalid-request)`.

**Steps**

1. Validate inputs. If `session_token` or `action_scope` is absent or malformed → `rejected(invalid-request)`. Stop.
2. Call `Session.validate(session_token)` → result.
   - `valid(principal_ref, expires_at)` — gate clears; proceed to step 3 with `principal_ref`.
   - `invalid(expired)` → `rejected(session-invalid(expired))`. Stop.
   - `invalid(revoked)` → `rejected(session-invalid(revoked))`. Stop.
   - `invalid(not-known)` → `rejected(session-invalid(not-known))`. Stop.
3. Call `Permissions.permitted(principal_ref, action_scope)` → result.
   - `permitted` → `permitted`. Stop.
   - `denied` → `denied`. Stop.

**Notes**

- `denied` is a first-class result, not a rejection. A denial means the gate cleared and the permission was evaluated; the answer is no. A `rejected(session-invalid(...))` means the gate did not clear and Permissions was never consulted. These two outcomes have different security meanings and must not be collapsed by callers.
- `expires_at` returned by `Session.validate` is available at the composition boundary but is not forwarded to the caller. The gate is binary: the session is valid or it is not.
- There is no storage-failure path in `check_permitted`. `Session.validate` and `Permissions.permitted` both return first-class results for all cases; neither exposes its own rejection path. The only rejection surface is `invalid-request` (bad caller inputs) and `session-invalid(...)` (gate did not clear). If Permissions cannot read its grant store and returns `denied` as its internal fail-safe result, the composition correctly passes `denied` through — a false denial is the fail-safe failure mode. The composition makes no stronger guarantee than the Permissions atom's own internal fail-safe behavior.

---

## Composition-level invariants

**Invariant 1 — Session gates authorization.** No call to `Permissions.permitted` is made unless `Session.validate` first returns `valid(principal_ref, expires_at)` for the presented `session_token`. An expired, revoked, or not-known session never reaches the permission check.

**Invariant 2 — Principal binding.** The `principal_ref` passed to `Permissions.permitted` is always the `principal_ref` returned by `Session.validate` for the presented session token — never a value supplied by the caller. A caller cannot interrogate permissions for a principal other than the one the session was issued for.

**Invariant 3 — Denial is not rejection.** A `denied` result means the session was valid and the permission check completed with a negative answer. A `rejected(session-invalid(...))` result means the gate did not clear and Permissions was never reached. The two outcomes are structurally distinct and must not be collapsed.

**Invariant 4 — Default deny.** The absence of an active grant for `(principal_ref, action_scope)` is always `denied`, regardless of session validity. Session validity is a necessary but not sufficient condition for access.

---

## Standards

*Anchors: NIST (National Institute of Standards and Technology — US federal standards body) SP 800-53 AC-3 (Access Enforcement), NIST SP 800-53 AC-12 (Session Termination), NIST SP 800-63B §7 (re-authentication at resource access), OWASP (Open Worldwide Application Security Project) ASVS V3.3 (Application Security Verification Standard — session expiry enforced at the resource level), PCI DSS (Payment Card Industry Data Security Standard) Requirement 7 (restrict access to system components) + Requirement 8 (authenticate access to system components), HIPAA (US Health Insurance Portability and Accountability Act) §164.312(a)(1) (access control), HIPAA §164.312(d) (person or entity authentication), ISO/IEC 27001 §A.9.4.1 (International Organization for Standardization / International Electrotechnical Commission information-security standard — information access restriction).*

**NIST SP 800-53 AC-3** requires that the information system enforces approved authorizations for logical access. The gate ensures no authorization is evaluated under a session the system no longer considers valid.

**AC-12** requires that the information system terminates sessions after defined conditions. The gate enforces this at access time: a session the system has terminated — whether by expiry, logout, or cascade from [Login](./login.md)'s `revoke_sessions_for_credential` — is refused at the composition boundary on every subsequent `check_permitted` call.

**OWASP ASVS V3.3** specifically requires that session expiry is enforced at the *resource* level, not only by the session management layer. The composition satisfies this by re-validating the session token on every `check_permitted` call rather than relying on an earlier validation result cached in the request context.

---

## Examples

### Happy path — valid session, permission granted

A principal holds an active session and has a grant for the requested scope.

```
check_permitted(
  session_token: "tok_abc123",
  action_scope:  "invoice:read"
) → permitted
```

Internally: `Session.validate("tok_abc123") → valid(principal_ref: "usr_42", expires_at: T+3600)`. Then: `Permissions.permitted("usr_42", "invoice:read") → permitted`.

### Session expired — gate blocks before Permissions

The session token identifies a session whose `expires_at` has passed.

```
check_permitted(
  session_token: "tok_expired",
  action_scope:  "invoice:read"
) → rejected(session-invalid(expired))
```

Internally: `Session.validate("tok_expired") → invalid(expired)`. Permissions is never consulted.

### Session revoked — gate blocks before Permissions

The session was revoked — directly by `Session.revoke`, by `logout`, or via cascade from [Login](./login.md)'s `revoke_sessions_for_credential`.

```
check_permitted(
  session_token: "tok_revoked",
  action_scope:  "invoice:read"
) → rejected(session-invalid(revoked))
```

Internally: `Session.validate("tok_revoked") → invalid(revoked)`. Permissions is never consulted.

### Session not known — gate blocks before Permissions

The token is unrecognized — never issued, already purged, or fabricated.

```
check_permitted(
  session_token: "tok_unknown",
  action_scope:  "invoice:read"
) → rejected(session-invalid(not-known))
```

Internally: `Session.validate("tok_unknown") → invalid(not-known)`. Permissions is never consulted.

### Valid session, permission denied

The session is active but the principal has no active grant for the requested scope.

```
check_permitted(
  session_token: "tok_abc123",
  action_scope:  "invoice:delete"
) → denied
```

Internally: `Session.validate("tok_abc123") → valid(principal_ref: "usr_42", ...)`. Then: `Permissions.permitted("usr_42", "invoice:delete") → denied`. The principal holds no active grant for `"invoice:delete"`.

---

### Regulated adversarial scenarios

**Regulator audit.** An auditor queries whether the system enforces access control at session-expiry boundaries — specifically, whether an expired session is permitted to evaluate any authorization query. By Invariant 1, any `check_permitted` call with an expired session token returns `rejected(session-invalid(expired))` before Permissions is consulted. The session expiry state is verifiable from Session's own records; the composition's invariant is derivable from the action wiring alone, without inspecting runtime logs. If Audit Trail is composed in as a substrate, the individual `check_permitted` records confirm the rejected outcome directly.

**Disputed access.** A data subject asserts that their account was accessed after they logged out — which revoked their session. The dispute requires establishing: (a) the session was revoked at time T; (b) any `check_permitted` call after T with that session token returned `rejected(session-invalid(revoked))`, not `permitted` or `denied`. Session's state records the revocation timestamp. The composition's Invariant 1 establishes that Permissions was never reached after revocation. If Audit Trail is composed in, the dispute is answerable from records alone. If not, the argument is structural: the session was terminal as of T, and the composition guarantees that a terminal session cannot produce a `permitted` or `denied` result.

**Breach forensics.** An investigator determines that a session token was stolen and seeks to establish what permissions were exercised under it before revocation. This composition does not maintain an authorization event log; forensic coverage of individual `check_permitted` calls requires [Audit Trail](./audit-trail.md) composed in as a substrate (see *Composition notes*). Without Audit Trail, the investigator can establish from Session's state that the session was active for a given window and was eventually revoked, and from Permissions' state what grants the principal held during that window — but cannot enumerate individual `check_permitted` calls or their outcomes from the composition's own state. This is a known scope limitation that composition with Audit Trail resolves.

---

## Edge cases

**Session expires between issuance and first use.** A session issued with a short `session_duration` may expire before the first `check_permitted` call. The gate returns `rejected(session-invalid(expired))`. The composition does not distinguish between a session that expired due to elapsed time versus one that was never exercised.

**Session revoked concurrent with a `check_permitted` call.** If a session is revoked — directly via `Session.revoke` or via cascade from [Login](./login.md)'s `revoke_sessions_for_credential` — concurrently with a `check_permitted` call in flight, the outcome depends on sequencing. If `Session.validate` completes before the revocation: the call proceeds to `Permissions.permitted` and may return `permitted` or `denied`. If the revocation completes before `Session.validate`: the call returns `rejected(session-invalid(revoked))`. The composition provides point-in-time session validity at the moment `Session.validate` is called; it does not guarantee detection of concurrent revocations that race the validate step.

**Caller supplies a `principal_ref` argument.** The `check_permitted` action does not accept a caller-supplied `principal_ref`. The principal is always extracted from the session by `Session.validate`. An implementation that accepts a `principal_ref` argument and passes it directly to `Permissions.permitted` — bypassing or replacing the session-extracted value — violates Invariant 2 and is non-conforming.

**Principal with no grants.** A principal whose session is valid but who holds no active grants in the Permissions store receives `denied` for every `check_permitted` call, regardless of scope. This is correct default-deny behavior (Invariant 4) and requires no special handling.

**Multiple active sessions for the same principal.** A principal may hold multiple active sessions, each issued under the same or different credential types. `check_permitted` operates on the presented session token alone; it does not aggregate across all of the principal's active sessions. Each call independently validates the presented token.

**Scope granularity.** The `action_scope` passed to `check_permitted` is forwarded unmodified to `Permissions.permitted`. Scope matching is exact: `"invoice:read"` does not match `"invoice:*"` or `"invoice"` unless those exact strings appear in active grants. The composition adds no scope-expansion, wildcard, or hierarchical matching semantics. Scope hierarchy, if needed, is an extension concern outside both constituent atoms.

**Caching session validation within a request.** Some implementations cache the result of `Session.validate` across multiple `check_permitted` calls within a single request to avoid round-trip cost. That optimization trades the per-call point-in-time guarantee for performance: a revocation issued between the first and second `check_permitted` calls in the request will not be caught until the cache is invalidated or the next uncached call. Implementations that cache must document the cache window and accept that revocations within that window are not reflected until the window expires.

**Direct access to constituent-atom surfaces.** The gate is enforced by making `check_permitted` the sole authorization surface at the composition boundary. If an implementation also exposes `Session.validate` or `Permissions.permitted` as independent callable surfaces alongside `check_permitted`, a caller can reach `Permissions.permitted` without passing through the gate — bypassing Invariant 1 and Invariant 2. Implementations must either not expose the constituent atoms' permission surface directly, or must document the bypass as an explicit, intentional policy exception. Exposing both surfaces without documentation is non-conforming.

---

## Generation acceptance

This composition introduces no per-call event log. The acceptance bar therefore has two tiers: what is verifiable from constituent-atom state alone, and what becomes verifiable when [Audit Trail](./audit-trail.md) is composed in as a substrate. Both tiers are stated explicitly so the auditor knows which checks require code inspection versus records inspection.

**Without Audit Trail — state-verifiable checks:**

1. **Session validity at time of access.** For any disputed authorization decision at time T involving session token S, Session's state establishes whether S was active, expired, or revoked at T. If S was terminal at T, Invariant 1 guarantees Permissions was not consulted — the gate would have returned `rejected(session-invalid(...))` and the call would have stopped.

2. **Grant existence at time of access.** For any disputed `permitted` result at time T: Session's state confirms the session was active at T and identifies the `principal_ref`; Permissions' state confirms an active grant for `(principal_ref, action_scope)` existed at T. Both must hold for `permitted` to be the correct result.

3. **Gate sequence.** Code inspection or a formal model confirms that `check_permitted` calls `Session.validate` before `Permissions.permitted`, and that `Permissions.permitted` is called only when `Session.validate` returned `valid(principal_ref, ...)`. This check cannot be cleared from records alone without Audit Trail; it requires code inspection.

4. **Principal binding.** Code inspection confirms that the `subject_ref` passed to `Permissions.permitted` is the `principal_ref` extracted from `Session.validate` — not a value supplied by the caller. This check also requires code inspection without Audit Trail.

**With Audit Trail composed in — record-verifiable checks:**

5. **Per-call gate and outcome records.** Every `check_permitted` call is a recorded event carrying: session token, action scope, `principal_ref` (when gate cleared), and outcome (`permitted | denied | session-invalid(reason)`). Checks 3 and 4 above are then verifiable from records alone, without code inspection. The auditor can enumerate every authorization attempt, every gate rejection, and every permission denial within any audit window.

---

## Composition notes

**Adding authorization audit coverage.** This composition introduces no event log and no cross-atom state. Implementations in regulated environments that require a durable, attribution-stamped, tamper-evident record of every authorization decision should compose Session-Gated Authorization with [Audit Trail](./audit-trail.md) as a substrate. Without Audit Trail, the regulated adversarial scenarios above (see *Breach forensics*) are answerable only structurally — from invariants and constituent-atom state — not from per-call event records. With Audit Trail, each `check_permitted` call is a recorded event with outcome, scope, session token, and extracted principal.

**Relationship to Login.** [Login](./login.md) governs the issuance and termination of sessions: `login` wires `Credential.verify → Session.issue`; `revoke_sessions_for_credential` cascades credential revocation across all derived sessions. Session-Gated Authorization governs the access-time use of sessions: `check_permitted` wires `Session.validate → Permissions.permitted`. The two compositions are complementary access-lifecycle boundaries. A revocation issued via Login's `revoke_sessions_for_credential` is reflected immediately in the next `check_permitted` call for that session token — `Session.validate` will return `invalid(revoked)` and the gate will block. The cascade from [Login](./login.md) is how expired-by-revocation sessions reach Session-Gated Authorization's gate without any coordination between the two compositions.

**Relationship to Privileged Access Provisioning.** [Privileged Access Provisioning](./privileged-access-provisioning.md) gates elevated-access provisioning behind a multi-party approval chain before issuing a time-limited Capability token. PAP's `exercise_access` action independently validates session state before permitting exercise — it is not a use of Session-Gated Authorization, but it enforces the same gate invariant at the exercise boundary. System designers building a full privileged-access surface should consider whether to share the session-gate logic via this composition or enforce it independently inside PAP; the current library treats them as independent implementations of the same principle applied at different lifecycle points.

**Forthcoming-link resolution.** The Session atom's *Composition notes* listed "Session-Gated Authorization (C14 — not started)" as a forthcoming composition. That link is now live.

---

## Lineage

### Round 1

**Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** All nine MUSE (the v1.1 completeness framework GRID's nodes are drawn from) nodes resolved. Intent (the ordering problem; principal-binding as emergent property), System boundary (two atoms, one action, no cross-atom state), Friction (expired / revoked / not-known gate cases), Flow (`check_permitted` two-step sequence), Decision (gate clears → query; gate fails → reject), Feedback (result tags are first-class; `denied` vs. `rejected` are structurally distinct), State (no cross-atom state; constituent atom state is ground truth — named as deliberate architectural choice), Behavior (four invariants), Proof (generation acceptance). Clean.

**Pass 2 — EOS (the Essence of Software, Daniel Jackson's concept framework) conceptual independence.** Session and Permissions are freestanding atoms; neither is absorbed into the composition. The composition's own concept — the gate constraint and the principal-binding invariant — does not belong to either constituent and recurs across every system that issues session tokens and enforces grants. No extraction needed. The absence of cross-atom state was confirmed correct: there is no persistent concern at the composition boundary that is not already captured by the constituent atoms' own state. The event-log question was deliberated: authorization event logging is Audit Trail's obligation when composed in, not this composition's obligation at its base configuration.

**Pass 3 — Linus adversarial.**

*Finding R1F1 — GA overclaims without per-call records.* The Generation acceptance section stated five checks framed as verifiable "from the system's records alone" — but this composition maintains no per-call event log. Without Audit Trail, there are no records of individual `check_permitted` calls. Checks referencing "every `check_permitted` call that returned X" are unverifiable from records; they require code inspection at best. Fixed: GA restructured into two explicit tiers — state-verifiable checks (1–4) and record-verifiable checks requiring Audit Trail (check 5). The forensic scope limitation was already named in Regulated adversarial scenarios and Composition notes; the GA revision brings the acceptance bar into alignment.

### Round 2

**Pass 1 — GRID structural.** Revisited after GA revision. All nine nodes still resolved. The two-tier GA structure is consistent with the no-state design choice; the Proof node is now honest about what can be cleared without Audit Trail. Clean.

**Pass 2 — EOS conceptual independence.** No new absorption identified. The implementation-boundary concern (direct access to constituent surfaces) was reviewed: it is not an atom-extraction candidate. It is an implementation policy that belongs in Edge cases. No conceptual reorganization needed.

**Pass 3 — Linus adversarial.**

*Finding R2F1 — Implementation boundary bypass unnamed.* Invariants 1 and 2 assert gate enforcement, but neither named the bypass route: if an implementation also exposes `Permissions.permitted` directly alongside `check_permitted`, callers can reach Permissions without the gate. This is not a defect in the spec's internal logic, but it is a defect in the composition's coverage — a spec that names the invariant without naming how implementations can break it leaves a real implementation hole unlit. Fixed: added Edge case "Direct access to constituent-atom surfaces" naming the bypass mechanism and requiring conforming implementations to either not expose the Permissions surface directly or to document the exception explicitly.

### Round 3

**Pass 1 — GRID structural.** All nine nodes still resolved after Round 2 additions. Edge case inventory now covers seven cases, all distinct and load-bearing. Clean.

**Pass 2 — EOS conceptual independence.** No new extraction needed. The bypass edge case is correctly scoped as an implementation policy note, not a new atom concern.

**Pass 3 — Linus adversarial.**

*Finding R3F1 — Fail-safe behavior of Permissions.permitted on internal storage failure.* The action notes claimed "there is no storage-failure path in `check_permitted`" without stating the assumption that underlies it: the claim relies on Permissions' own fail-safe behavior. If Permissions cannot read its grant store and returns `denied` as its internal fail-safe, the composition correctly passes `denied` through — a false denial. The composition makes no stronger guarantee than Permissions' own internal behavior. Without naming this assumption, the "no storage failure" claim is an implicit contract on Permissions that the composition does not own. Fixed: action Notes extended to name the assumption and the acceptable failure mode (false denial, not false grant).

### Final Critique 4

Reviewed all four invariants, all eight edge cases, all five GA checks (two tiers), all three regulated adversarial scenarios, the action wiring in full, and the composition notes. No foundational findings. No refining findings.

The principal-binding invariant (Invariant 2) is the load-bearing security property; it is defended in the action wiring, in the edge case, and in the GA. The no-storage-failure claim is now correctly scoped against Permissions' own fail-safe behavior. The implementation-boundary bypass is named. The GA two-tier structure is consistent with the no-state architectural choice and with the library's layering approach (Audit Trail as the per-call record substrate).

*Grounded on Final Critique 4.*

### Round 5 (touch-triggered re-pass — Alloy artifact verification, 2026-05-23)

**Formal model — Alloy static structural + dynamic trace model (precipitating touch for Round 5).** `compositions/session-gated-authorization.als`. The Alloy artifact was authored prior to this Lineage entry but was unrun via the analyzer; the first canonical Alloy Analyzer 6.2.0 *Execute All* run on 2026-05-23 constituted an effective touch and, per `pressure-testing.md` §Touch triggers re-pass, triggered the full three-pass Round 5 recorded below. The model has two parts. *Static structural model:* encodes the four application-level invariants as Alloy facts and runs six `check`s (Principal_Binding_Without_Invariant2 — deliberately staged to demonstrate the attack surface before Invariant 2 closes it; Principal_Binding_Holds; Valid_Session_No_Grant_Is_Denied; Revoked_Session_Cannot_Authorize; Expired_Session_Cannot_Authorize; Denial_Is_Not_Rejection) plus three existence-witness `run`s (has_permitted_call, has_revoked_rejection, has_same_principal_mixed_outcomes). *Dynamic trace model (Alloy 6 LTL (Linear Temporal Logic)):* encodes three temporal claims as LTL assertions — Dyn_Revocation_Terminal (T1: once Revoked, always Revoked); Dyn_Expiry_Terminal (T2: once Expired, always Expired); Dyn_Gate_Reflects_Current_Status (T3: any call record carries an outcome consistent with the session's current status) — with two trace-existence `run`s (dyn_trace_with_revocation, dyn_trace_permitted_then_revoked). T1 ∧ T3 together discharge the load-bearing post-revocation authorization-impossibility property the spec claims: a session revoked at step T cannot produce Permitted or Denied at any step T' > T.

Result: 12 of 14 commands match expectation. The four named application-level invariants discharge clean under the static checks — Principal_Binding_Holds, Valid_Session_No_Grant_Is_Denied, Revoked_Session_Cannot_Authorize, Expired_Session_Cannot_Authorize, and Denial_Is_Not_Rejection all return *No counterexample found, assertion may be valid* at scope `for 5`. The three static existence witnesses find instances. The three LTL assertions T1, T2, T3 discharge clean at scope `for 3 but 1..8 steps`. The revocation-trace existence witness (dyn_trace_with_revocation) finds an instance at scope `for 3 but 1..6 steps`. Two findings surfaced; both refining; both against the formal model's expectation-setting and predicate construction, neither against the spec's prose claims. See Pass 3 below.

**Pass 1 — Structural completeness (GRID), Round 5.** *Complete.* No structural findings. All nine GRID nodes still resolved after the prior four rounds. The Alloy Lineage entry above carries the plain-English summary, artifact location, scopes, the per-command result list, and the two findings deferred to Round 6 per `contributing.md` §Formal-model artifacts.

**Pass 2 — Conceptual independence (EOS), Round 5.** *Complete.* No findings. The Alloy artifact introduces no concept embedded in the composition that requires extraction as a separate atom. The dynamic-trace sigs (DynSession, DynGrant, DynSystem, DynCallRecord) are local to the trace model and isolated by fresh names from the static sigs; they do not redefine constituent-atom state. The temporal claims T1–T3 are properties of the composition's emergent gate behavior, not freestanding concepts that recur across domains.

**Pass 3 — Adversarial (Linus), Round 5.** *Complete.* Two refining findings — both in the formal model, neither in the spec prose. Both deferred to Round 6 (formal-model refinement), per CLAUDE.md *implementation-discovered findings* discipline (log the finding, finish the build against the spec as written, route the fix through the standard review channel — the spec was not modified mid-run).

- **R5F1 — `check Principal_Binding_Without_Invariant2` does not produce the expected counterexample (refining; deferred to Round 6 model fix).** The check's surrounding comments explicitly state `EXPECTED: COUNTEREXAMPLE FOUND` — the pedagogical intent is to demonstrate the principal-binding attack surface is structurally reachable when Invariant 2 is absent, then show it becomes unreachable after `fact Invariant2_Principal_Binding` is added later in the same file. Actual result: *No counterexample found, assertion may be valid* at scope `for 4`. Cause: Alloy facts are file-global; declaring `fact Invariant2_Principal_Binding` further down in the file affects every check in the file regardless of textual order. The "without" and "with" framings collapse to the same proposition under Alloy's semantics. The intent is unrecoverable in a single-file model with the current structure. Resolution paths for Round 6: (a) split the file into two modules — a *without-Invariant-2* module containing only the static structural facts and the staged check, and a *with-Invariant-2* module containing the additional fact plus the same check renamed — so each runs against its own fact set; (b) reframe the pedagogical staging as a comment-only note (the structural attack surface is documented in this composition's §Invariant 2 prose and in the .als comments; the demonstration check is dropped since Alloy cannot stage it as written); (c) accept that the check is structurally redundant with Principal_Binding_Holds and remove it entirely. No spec finding: the prose claim that Invariant 2 closes the attack surface is correct; only the model's demonstration scaffolding is malformed. The four named application-level invariants are all verified clean.

- **R5F2 — `run dyn_trace_permitted_then_revoked` is structurally inconsistent (refining; deferred to Round 6 model fix).** The predicate's surrounding comments expect an existence witness: *"a call succeeds (Permitted) while the session is Valid, then later the session is revoked."* Actual result: *No instance found. Predicate may be inconsistent* at scope `for 3 but 1..8 steps`. Cause: the predicate's first conjunct (`some rec : DynCallRecord | rec in DynSystem.dyn_call_log and rec.rec_outcome = Permitted`) is evaluated at the initial state, but `dyn_init` requires `no DynSystem.dyn_call_log`. The conjunction is structurally unsatisfiable at step 0; Alloy correctly reports the predicate as inconsistent. Resolution for Round 6: wrap the first conjunct in `eventually` so both conjuncts are temporal-existence claims rather than a step-0 conjunction with a temporal eventually, e.g. `eventually (some rec : DynCallRecord | rec in DynSystem.dyn_call_log and rec.rec_outcome = Permitted) and eventually (some s : DynSession | s.dyn_status = Revoked)`. No spec finding: the lifecycle the predicate names is real and reachable (dyn_trace_with_revocation already finds a revocation trace; a Permitted call is reachable from `dyn_init` via dyn_check_permitted); only the predicate's encoding fails to express the conjoined existence.

Round 5 closes with two refining findings open. Per the methodology, refining findings do not block grounding; the user-directed work order is to fix both findings in a Round 6 model refinement before sealing the formal-model story. Status remains `grounded on Final Critique 4` pending Round 6 closure; on a clean Round 6 re-run with both findings resolved, the grounding marker advances to `grounded on Final Critique 6`. The spec prose was not modified during this round; the four named application-level invariants and the three temporal claims (T1, T2, T3) are all verified clean.

The Round 5 verification is reproducible from a fresh checkout: open `compositions/session-gated-authorization.als` in Alloy Analyzer 6, set Options → "Allow warnings" to true (the model carries one type-system warning on `Denial_Is_Not_Rejection` where the SAT solver's intersection is provably empty at the type level — the warning is informational, not a soundness defect), then Execute → Execute All.

### Round 6 (formal-model refinement closing Round 5 findings, 2026-05-23)

**Formal model — Alloy model refinement.** `compositions/session-gated-authorization.als` edited in two places to close R5F1 and R5F2 (recorded in Round 5 above). Spec prose unchanged.

- *R5F1 resolution.* Dropped the `assert Principal_Binding_Without_Invariant2 { ... } / check ... for 4` block entirely. The pedagogical attack-surface documentation that surrounded the check was preserved as inline comments; the demonstration check that Alloy could not honestly stage in a single-file model (Alloy facts are file-global; see Round 5 R5F1 for the full diagnosis) was removed. The chosen resolution path is option (1) from Round 5's Pass 3 — drop the check, keep the documentation. Option (3) (split the model into two `.als` files, one without and one with the invariant) was considered and deferred: the cost-benefit does not justify doubling the file count for a single structurally redundant check. The attack surface remains fully documented in this composition's §Invariant 2 prose and in the surrounding `.als` comments; Principal_Binding_Holds (the next check in the file) verifies the binding under the fact set the spec requires.
- *R5F2 resolution.* Wrapped the first conjunct of `dyn_trace_permitted_then_revoked` in `eventually`, making both conjuncts temporal-existence claims rather than a step-0 conjunction with a temporal `eventually`. Inline comment added in the predicate referencing the Round 5 R5F2 entry. The predicate's prose intent — "a Permitted call followed by a session revocation" — now matches its temporal-logic encoding.

Result: 13 commands executed, all matching expectation. Five static `check`s clean (Principal_Binding_Holds, Valid_Session_No_Grant_Is_Denied, Revoked_Session_Cannot_Authorize, Expired_Session_Cannot_Authorize, Denial_Is_Not_Rejection), three LTL `check`s clean (Dyn_Revocation_Terminal, Dyn_Expiry_Terminal, Dyn_Gate_Reflects_Current_Status), three static existence `run`s consistent (has_permitted_call, has_revoked_rejection, has_same_principal_mixed_outcomes), two dynamic-trace existence `run`s consistent (dyn_trace_with_revocation at 1..2 steps, dyn_trace_permitted_then_revoked at 1..3 steps — the minimum-length trace satisfying both `eventually` conjuncts is exactly the lifecycle the predicate's prose intent named: initial state → check_permitted producing Permitted → revoke_session).

**Pass 1 — Structural completeness (GRID), Round 6.** *Complete.* No findings. All nine GRID nodes still resolved after the prior five rounds. The Alloy model now has 13 commands (was 14 before R5F1 closure); the .als file's structure (static model + dynamic trace model) and its inline documentation conventions per `contributing.md` §Formal-model artifacts are preserved.

**Pass 2 — Conceptual independence (EOS), Round 6.** *Complete.* No findings. The R5F1 fix removed a redundant check; the R5F2 fix tightened a predicate's temporal encoding. Neither edit changes the model's concept boundary or introduces any new concept embedded in the composition that would require extraction as a separate atom.

**Pass 3 — Adversarial (Linus), Round 6.** *Complete.* No findings. Both Round 5 refining findings are closed and re-verified clean. The eight checks (five static, three LTL temporal) and five existence-witness runs together exercise every load-bearing claim the spec makes about session-gated authorization, principal binding, default deny, structural denial-vs-rejection distinction, and the three temporal terminality / gate-status properties. The post-revocation authorization-impossibility property (T1 ∧ T3) is verified at scope `for 3 but 1..8 steps`. No new spec finding. No new model finding.

Round 6 closed clean. Foundational findings: zero. Refining findings closed in this round: two (R5F1, R5F2). Refining findings remaining: zero. Session-Gated Authorization moves from `grounded on Final Critique 4` (with Round 5 findings open) to `grounded on Final Critique 6 — 2026-05-23`.

The Round 6 verification is reproducible from a fresh checkout: open `compositions/session-gated-authorization.als` in Alloy Analyzer 6, set Options → "Allow warnings" to true (the model still carries one type-system warning on `Denial_Is_Not_Rejection` where the SAT solver's intersection is provably empty at the type level — the warning is informational, not a soundness defect), then Execute → Execute All. All 13 commands return their expected result.

**Formal-layer vote — 2026-06-03: YES (model present).** Session-gates-authorization (Inv 1) and principal binding (Inv 2) are gate-before-action ordering/exclusivity claims targeted by the Alloy model. Verified by the sibling formal model (`session-gated-authorization.als`); the pattern remains `grounded`. Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.
