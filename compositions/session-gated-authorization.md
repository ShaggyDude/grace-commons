---
title: Session-Gated Authorization
parent: Conceptual Compositions
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


**Composes:** [Session](../atoms/session.md) · [Permissions](../atoms/permissions.md)

## Summary

Session-Gated Authorization is a regulated composition — a combination of two simpler building-block patterns (called atoms), designed for settings where regulators audit access control. Every authorization query is gated by a mandatory session validation before the Permissions atom — the pattern recording who may do what — is consulted. An expired, revoked, or unrecognized session terminates the call before Permissions is reached.

The principal presented to Permissions is always the principal the session was issued for — never a value the caller supplies. The gate and the principal binding together constitute the composition's load-bearing emergent invariant; neither belongs to Session or Permissions alone.

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

The composition exposes one action, [Check Permitted], that executes in two mandatory steps:

**Step 1 — Gate.** `Session.validate(session_token)` must return `valid(principal_ref, expires_at)`. Any other result — `invalid(expired)`, `invalid(revoked)`, `invalid(not-known)` — terminates the call with a [Session Invalid] rejection before Permissions is consulted.

**Step 2 — Query.** `Permissions.permitted(principal_ref, action_scope)` is called using the `principal_ref` the session carries. The result (`permitted` or `denied`) is returned unmodified.

The constituent atoms are unaware of each other. Session does not know that a permission check follows; Permissions does not know that a session validation preceded it. The composition owns the ordering constraint.

**Principal binding** is the load-bearing emergent property. Without the composition, a caller could pass any `principal_ref` directly to `Permissions.permitted`. The gate collapses the caller's degree of freedom: the only principal the caller can query permissions for is the principal the session was issued to.

**Default deny propagates.** `Permissions.permitted` returns `denied` when no active grant exists for the `(principal_ref, action_scope)` pair. The composition passes that result through unmodified. A valid session with no matching grant returns `denied`, not `permitted`. Session validity is a necessary but not sufficient condition for access.

**Primitive policies.** Composition-boundary validation for [Check Permitted]'s two inputs. The `invalid-request` rejection this produces is **composition-introduced** — neither wired constituent operation declares or can return it, and neither constituent is consulted when it fires:

- **`session_token`** — *absent or malformed* means exactly: null/undefined, the empty string, whitespace-only, or over the deployment-pinned length cap (the cap's value is a deployment choice; its existence is the contract). Otherwise the token is opaque and handled byte-exact — no trimming, no case-folding, no Unicode normalization — the same exact-comparison discipline both constituents declare for their own opaque strings.
- **`action_scope`** — the same predicate defines *absent or malformed*; an accepted value is passed byte-exact to `Permissions.permitted`, whose scope matching is itself exact.
- **Precedence over Permissions' empty-input semantics.** Permissions answers an empty `subject_ref` or `action_scope` with `denied` under its own default-deny posture. That constituent path is deliberately unreachable here: the boundary check rejects malformed inputs as `invalid-request` before either constituent runs, and the principal Permissions ever sees is the session-extracted `principal_ref`, never empty for a `valid` session. This keeps the three outcome classes security-distinct, extending Invariant 3's discipline to inputs — `invalid-request` (the request was not well-formed enough to gate), `session-invalid(...)` (the gate did not clear), `denied` (the gate cleared and the answer is no).

---

## Composition state

This composition introduces no cross-atom persistent state — **Contract classification: conforming, no stored composition state** ([`execution-contract.md`](../execution-contract.md) §Composition state). There is no index, map, or log at the composition boundary. The gate is a sequencing constraint over the constituent atoms' own state, not a new data structure — evaluated per call from the constituents' declared surfaces, so nothing at this layer can go stale or need a rebuild.

Implementations requiring a durable record of individual authorization decisions — who queried what scope, when, and with what result — should compose Session-Gated Authorization with [Audit Trail](./audit-trail.md) as a substrate. Without Audit Trail, individual [Check Permitted] call records do not exist at the composition boundary; the constituent atoms' own state remains the record of session validity and grant existence. See *Composition notes*.

---

## Actions

### `check_permitted`

Validates a session and, if valid, evaluates whether the session's principal holds the requested permission.

```
check_permitted(session_token, action_scope) →
    permitted
  | denied
  | rejected(invalid-request | session-invalid(expired | revoked | not-known))
```

**Arguments**

- `session_token` — opaque token identifying the session to validate. Required; absence or malformation (as defined in Primitive policies) produces `rejected(invalid-request)`.
- `action_scope` — the permission scope to evaluate. Must match the exact scope string recorded in Permissions grants. Required; absence or malformation (Primitive policies) produces `rejected(invalid-request)`.

**Steps**

1. Validate inputs against Primitive policies. If `session_token` or `action_scope` is absent or malformed (null, empty, whitespace-only, or over the deployment-pinned cap) → `rejected(invalid-request)`. Stop.
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
- There is no storage-failure path in [Check Permitted]. `Session.validate` and `Permissions.permitted` both return first-class results for every declared case; neither declares a rejection arm of its own. The only rejection surface is `invalid-request` (bad caller inputs, composition-introduced) and `session-invalid(...)` (gate did not clear). Permissions' contract likewise declares no read-failure outcome: a grant store that cannot be read yields no conforming Permissions outcome at all — an operational availability fault at the constituent — and this composition adds no arm for it and passes through nothing invented; it makes no guarantee beyond the constituent's own declared surface.

---

## Composition-level invariants

**Invariant 1 — Session gates authorization.** No call to `Permissions.permitted` is made unless `Session.validate` first returns `valid(principal_ref, expires_at)` for the presented `session_token`. An expired, revoked, or not-known session never reaches the permission check.

**Invariant 2 — Principal binding.** The `principal_ref` passed to `Permissions.permitted` is always the `principal_ref` returned by `Session.validate` for the presented session token — never a value supplied by the caller. A caller cannot interrogate permissions for a principal other than the one the session was issued for.

**Invariant 3 — Denial is not rejection.** A `denied` result means the session was valid and the permission check completed with a negative answer. A `rejected(session-invalid(...))` result means the gate did not clear and Permissions was never reached. The two outcomes are structurally distinct and must not be collapsed.

**Invariant 4 — Default deny.** For every call whose gate clears, the absence of an active grant for `(principal_ref, action_scope)` is always `denied` — session validity is a necessary but never sufficient condition for access. (A call whose gate does not clear returns `session-invalid(...)` and evaluates no grant at all; that distinction is Invariant 3.)

---

## Standards

*Anchors: NIST (National Institute of Standards and Technology — US federal standards body) SP 800-53 AC-3 (Access Enforcement), NIST SP 800-53 AC-12 (Session Termination), NIST SP 800-63B §7 (re-authentication at resource access), OWASP (Open Worldwide Application Security Project) ASVS V3.3 (Application Security Verification Standard — session expiry enforced at the resource level), PCI DSS (Payment Card Industry Data Security Standard) Requirement 7 (restrict access to system components) + Requirement 8 (authenticate access to system components), HIPAA (US Health Insurance Portability and Accountability Act) §164.312(a)(1) (access control), HIPAA §164.312(d) (person or entity authentication), ISO/IEC 27001 §A.9.4.1 (International Organization for Standardization / International Electrotechnical Commission information-security standard — information access restriction).*

**NIST SP 800-53 AC-3** requires that the information system enforces approved authorizations for logical access. The gate ensures no authorization is evaluated under a session the system no longer considers valid.

**AC-12** requires that the information system terminates sessions after defined conditions. The termination itself is Session's and [Login](./login.md)'s act; what this composition contributes is the access-time complement — a session the system has terminated, whether by expiry, logout, or cascade from Login's `revoke_sessions_for_credential`, is refused at the composition boundary on every subsequent [Check Permitted] call, so a terminated session buys no further authorization.

**OWASP ASVS V3.3** specifically requires that session expiry is enforced at the *resource* level, not only by the session management layer. The composition satisfies this by re-validating the session token on every [Check Permitted] call rather than relying on an earlier validation result cached in the request context.

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

### Malformed input — rejected before the gate

The caller presents a whitespace-only token.

```
check_permitted(
  session_token: "   ",
  action_scope:  "invoice:read"
) → rejected(invalid-request)
```

The token fails the Primitive-policies predicate (whitespace-only counts as absent). Neither `Session.validate` nor `Permissions.permitted` is consulted. The outcome is not `denied` (no permission was evaluated) and not `session-invalid` (no session was consulted) — the three classes stay distinct.

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

**Regulator audit.** An auditor queries whether the system enforces access control at session-expiry boundaries — specifically, whether an expired session is permitted to evaluate any authorization query. By Invariant 1, any [Check Permitted] call with an expired session token returns `rejected(session-invalid(expired))` before Permissions is consulted. The session expiry state is verifiable from Session's own records; the composition's invariant is derivable from the action wiring alone, without inspecting runtime logs. If Audit Trail is composed in as a substrate, the individual [Check Permitted] records confirm the rejected outcome directly.

**Disputed access.** A data subject asserts that their account was accessed after they logged out — which revoked their session. The dispute requires establishing: (a) the session was revoked at time T; (b) any [Check Permitted] call after T with that session token returned `rejected(session-invalid(revoked))`, not `permitted` or `denied`. Session's state records the revocation timestamp. The composition's Invariant 1 establishes that Permissions was never reached after revocation. If Audit Trail is composed in, the dispute is answerable from records alone. If not, the argument is structural: the session was invalid (revoked) as of T, and the composition guarantees that an invalid session cannot produce a `permitted` or `denied` result.

**Breach forensics.** An investigator determines that a session token was stolen and seeks to establish what permissions were exercised under it before revocation. This composition does not maintain an authorization event log; forensic coverage of individual [Check Permitted] calls requires [Audit Trail](./audit-trail.md) composed in as a substrate (see *Composition notes*). Without Audit Trail, the investigator can establish from Session's state that the session was active for a given window and was eventually revoked, and from Permissions' state what grants the principal held during that window — but cannot enumerate individual [Check Permitted] calls or their outcomes from the composition's own state. This is a known scope limitation that composition with Audit Trail resolves.

---

## Edge cases

**Session expires between issuance and first use.** A session issued with a short `session_duration` may expire before the first [Check Permitted] call. The gate returns `rejected(session-invalid(expired))`. The composition does not distinguish between a session that expired due to elapsed time versus one that was never exercised.

**Session revoked concurrent with a [Check Permitted] call.** If a session is revoked — directly via `Session.revoke` or via cascade from [Login](./login.md)'s `revoke_sessions_for_credential` — concurrently with a [Check Permitted] call in flight, the outcome depends on sequencing. If `Session.validate` completes before the revocation: the call proceeds to `Permissions.permitted` and may return `permitted` or `denied`. If the revocation completes before `Session.validate`: the call returns `rejected(session-invalid(revoked))`. The composition provides point-in-time session validity at the moment `Session.validate` is called; it does not guarantee detection of concurrent revocations that race the validate step.

**Caller supplies a `principal_ref` argument.** The [Check Permitted] action does not accept a caller-supplied `principal_ref`. The principal is always extracted from the session by `Session.validate`. An implementation that accepts a `principal_ref` argument and passes it directly to `Permissions.permitted` — bypassing or replacing the session-extracted value — violates Invariant 2 and is non-conforming.

**Principal with no grants.** A principal whose session is valid but who holds no active grants in the Permissions store receives `denied` for every [Check Permitted] call, regardless of scope. This is correct default-deny behavior (Invariant 4) and requires no special handling.

**Multiple active sessions for the same principal.** A principal may hold multiple active sessions, each issued under the same or different credential types. [Check Permitted] operates on the presented session token alone; it does not aggregate across all of the principal's active sessions. Each call independently validates the presented token.

**Scope granularity.** The `action_scope` passed to [Check Permitted] is forwarded unmodified to `Permissions.permitted`. Scope matching is exact: `"invoice:read"` does not match `"invoice:*"` or `"invoice"` unless those exact strings appear in active grants. The composition adds no scope-expansion, wildcard, or hierarchical matching semantics. Scope hierarchy, if needed, is handled outside both constituent atoms.

**Caching session validation across calls is non-conforming.** Some implementations are tempted to cache the result of `Session.validate` across multiple [Check Permitted] calls within a request to save round-trips. Under this composition that cache is **non-conforming**: Invariant 1 requires every [Check Permitted] call to consult `Session.validate` before `Permissions.permitted`, and the ASVS V3.3 claim in Standards rests on exactly that per-call re-validation — under a cross-call cache, a session revoked between two calls reaches `Permissions.permitted` with `validate` never consulted, which is precisely the authentication gap the composition exists to close. The guarantee is point-in-time at the moment `validate` runs (the concurrent-revocation edge case above bounds what that means); it is never *stale by design*. A deployment that accepts stale validation for performance is building a different, weaker composition and must not claim conformance to this one; the admissible optimization is making `validate` itself cheap — Session's own implementation matter — not skipping it.

**Direct access to constituent-atom surfaces.** The gate is enforced by making [Check Permitted] the sole authorization surface at the composition boundary. If an implementation also exposes `Session.validate` or `Permissions.permitted` as independent callable surfaces alongside [Check Permitted], a caller can reach `Permissions.permitted` without passing through the gate — bypassing Invariant 1 and Invariant 2. Implementations must either not expose the constituent atoms' permission surface directly, or must document the bypass as an explicit, intentional policy exception. Exposing both surfaces without documentation is non-conforming.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a minimal, stateless composition — a gate — so its own concepts are just the single action it exposes ([Check Permitted]) and its two own rejections ([Session Invalid], the gate refusal; [Invalid Request], the boundary refusal — composition-introduced, since neither wired constituent operation can produce it). It introduces **no cross-atom state** and no new data, so there is nothing else to card: the emergent guarantees it owns — the session-gates-authorization ordering (Invariant 1) and the principal binding (Invariant 2) — are structural properties, not data. References to the constituent atoms and their operations — Session's `validate` / `revoke`, Permissions' `permitted` — and the relayed outcomes (`permitted`, `denied`) and the `invalid(...)` reasons (`expired` / `revoked` / `not-known`) Session returns, remain qualified/backticked, not carded here. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Check Permitted

The composition's single action: it validates the presented session and, only if valid, evaluates whether the session's own principal holds the requested permission — `Session.validate` before `Permissions.permitted`, always with the session-extracted `principal_ref` (Invariants 1–2). Returns `permitted` or `denied` (Permissions' result, passed through unmodified), or [Session Invalid] when the gate does not clear, or [Invalid Request] for inputs failing the boundary predicate.

Kind: Operation

#### Session Invalid

The composition's own gate rejection from [Check Permitted] — returned when `Session.validate` does not return `valid`: the session is `expired`, `revoked`, or `not-known`. It terminates the call **before Permissions is consulted** (Invariant 1), and is structurally distinct from a `denied` result (which means the gate cleared and the permission was evaluated — Invariant 3). Carries the reason.

Kind:      Member
Member of: the check-permitted rejection
Role:      Rejection
Projects:  session-invalid

#### Invalid Request

The composition's own boundary rejection from [Check Permitted] — returned when `session_token` or `action_scope` fails the Primitive-policies predicate (null, empty, whitespace-only, or over the deployment-pinned length cap). Composition-introduced: neither wired constituent operation produces it, and neither constituent is consulted when it fires.

Kind:      Member
Member of: the check-permitted rejection
Role:      Rejection
Projects:  invalid-request

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Check Permitted]: #check-permitted
[Session Invalid]: #session-invalid
[Invalid Request]: #invalid-request

---

## Generation acceptance

This composition introduces no per-call event log. The acceptance bar therefore has two tiers: what is verifiable from constituent-atom state alone, and what becomes verifiable when [Audit Trail](./audit-trail.md) is composed in as a substrate. Both tiers are stated explicitly so the auditor knows which checks require code inspection versus records inspection.

**Without Audit Trail — state-verifiable checks:**

1. **Session validity at time of access.** For any disputed authorization decision at time T involving session token S, Session's state establishes whether S was active, expired, or revoked at T. If S was expired or revoked at T, Invariant 1 guarantees Permissions was not consulted — the gate would have returned `rejected(session-invalid(...))` and the call would have stopped.

2. **Grant existence at time of access.** For any disputed `permitted` result at time T: Session's state confirms the session was active at T and identifies the `principal_ref`; Permissions' state confirms an active grant for `(principal_ref, action_scope)` existed at T. Both must hold for `permitted` to be the correct result.

3. **Gate sequence.** Code inspection or a formal model confirms that [Check Permitted] calls `Session.validate` before `Permissions.permitted`, and that `Permissions.permitted` is called only when `Session.validate` returned `valid(principal_ref, ...)`. This check cannot be cleared from records alone without Audit Trail; it requires code inspection.

4. **Principal binding.** Code inspection confirms that the `subject_ref` passed to `Permissions.permitted` is the `principal_ref` extracted from `Session.validate` — not a value supplied by the caller. This check also requires code inspection without Audit Trail.

**With Audit Trail composed in — record-verifiable checks:**

5. **Per-call gate and outcome records.** Every [Check Permitted] call is a recorded event carrying: session token, action scope, `principal_ref` (when gate cleared), and outcome (`permitted | denied | session-invalid(reason)`). Checks 3 and 4 above are then verifiable from records alone, without code inspection. The auditor can enumerate every authorization attempt, every gate rejection, and every permission denial within any audit window.

---

## Composition notes

**Adding authorization audit coverage.** This composition introduces no event log and no cross-atom state. Implementations in regulated environments that require a durable, attribution-stamped, tamper-evident record of every authorization decision should compose Session-Gated Authorization with [Audit Trail](./audit-trail.md) as a substrate. Without Audit Trail, the regulated adversarial scenarios above (see *Breach forensics*) are answerable only structurally — from invariants and constituent-atom state — not from per-call event records. With Audit Trail, each [Check Permitted] call is a recorded event with outcome, scope, session token, and extracted principal.

**Relationship to Login.** [Login](./login.md) governs the issuance and termination of sessions: `login` wires `Credential.verify → Session.issue`; `revoke_sessions_for_credential` cascades credential revocation across all derived sessions. Session-Gated Authorization governs the access-time use of sessions: [Check Permitted] wires `Session.validate → Permissions.permitted`. The two compositions are complementary access-lifecycle boundaries. A revocation issued via Login's `revoke_sessions_for_credential` is reflected immediately in the next [Check Permitted] call for that session token — `Session.validate` will return `invalid(revoked)` and the gate will block. The cascade from [Login](./login.md) is how expired-by-revocation sessions reach Session-Gated Authorization's gate without any coordination between the two compositions.

**Relationship to Privileged Access Provisioning.** [Privileged Access Provisioning](./privileged-access-provisioning.md) (PAP) gates elevated-access provisioning behind a multi-party approval chain before issuing a time-limited Capability token. PAP's `exercise_access` action independently validates session state before permitting exercise — it is not a use of Session-Gated Authorization, but it enforces the same gate invariant at the exercise boundary. System designers building a full privileged-access surface should consider whether to share the session-gate logic via this composition or enforce it independently inside PAP; the current library treats them as independent implementations of the same principle applied at different lifecycle points.

**Forthcoming-link resolution.** The Session atom's *Composition notes* listed "Session-Gated Authorization (not started)" as a forthcoming composition. That link is now live.

---

## Status

`grounded on Final Critique 8 — 2026-08-26` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 8 — 2026-08-26
formal: verified — session-gated-authorization.als, no twin, 2026-06-03
last gate: 2026-08-26 — Final Critique 8, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/session-gated-authorization.md`.
