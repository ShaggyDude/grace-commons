---
title: Authenticated Actor
parent: Conceptual Compositions
nav_order: 21
has_toc: true
toc: true
---

# Authenticated Actor

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Authenticated Actor is a composition — a specification that wires two freestanding patterns together — that ties a principal's *login* to their *signature*. One pattern, Credential, checks that a presented secret belongs to a principal (the login). The other, Actor Identity, produces an attestation: a permanent, checkable record that a specific actor authorized a specific action (the signature). On their own, neither pattern knows about the other, which leaves three questions unanswered when the same person has both — and this composition answers all three.

First and most important: if you revoke someone's login, can they still produce new signatures? Here the answer is no. The composition checks, every time an actor goes to sign, that their login credential is still active, and it makes that check at the same instant it records the signature, so a revocation can't slip through a gap. Crucially, signatures made *before* the revocation stay valid — they were properly authorized at the time, and erasing them would be wrong — so the cascade only closes the door going forward; it never rewrites the past.

Second: the login secret and the signing key are kept as two separate things; the composition never uses one as the other (a password hash is not a signing key). Third: the login identity and the signing identity are locked together as one principal, so any signature can always be traced back to the person who logged in.

The composition's defining emergent guarantee — a property that appears only when the two patterns are combined, belonging to neither alone — is that revocation cascade: a revoked login closes the signing surface. Its most common uses are regulated systems where the same person both logs in and signs actions of consequence: a clinician authenticating and then electronically signing a controlled-substance prescription, a bank officer logging in and attesting a wire approval, a developer authenticating and signing a release commit at a regulated software vendor. Any system where revoking someone's access must also stop them from producing new signed authorizations — and where an auditor must be able to trace each signature to the authenticated identity behind it — is a candidate for this composition.

---

## Intent

Two freestanding atoms answer two adjacent but distinct questions about a principal. **Credential** answers *"did the right material arrive — does this presented secret match what was registered for this principal?"* and produces a momentary `verified` signal. **Actor Identity** answers *"can a future verifier confirm this actor authorized this specific action?"* and produces a durable, non-repudiable attestation. Each is correctly specified without naming the other (Credential's specification names no other atom; Actor Identity's `verify` validates a proof against the actor registry's public material, not against any credential record). Yet the moment both exist for the *same* principal, three concepts arise that belong to neither atom alone — concepts that were surfaced not by a thought experiment but by a real implementation. The Attributed Permissions Admin demo conflated a single secret to serve as both the login credential and the attestation signing key (`demos/attributed-permissions-admin/CORNERS.md` §Cross-atom identity surface aliasing), and in doing so exposed three questions the library could not answer: does revoking a login revoke the ability to sign? must the two secret surfaces be distinct? and are the `principal_ref` and `actor_ref` namespaces bound to one principal or free to diverge? This composition is the structure that answers them.

The first and load-bearing concept is the **revocation cascade**, and it is the outbound-authority counterpart to Login's session cascade. Login makes a revoked credential's *sessions* die: revoking a credential and calling `revoke_sessions_for_credential` walks the derived-session set and terminates each. Authenticated Actor makes a revoked credential's *attestation surface* die: once the principal's authentication credential is revoked, the composition refuses to produce new attestations for the bound actor. The asymmetry between the two cascades is itself load-bearing. A session is mutable, live state with an active set to walk; the cascade is an enumeration-and-revoke. An attestation is an *immutable, point-in-time record* — there is no active-attestation set to retract, and retracting one would be wrong: a validly-authorized attestation made before revocation must remain valid (Actor Identity's non-repudiation contract is conditional on credential integrity *at attestation time*, not perpetually). The only coherent cascade for an immutable record surface is *forward closure*: the composition stops producing new attestations the instant the gating credential leaves `Active`. That forward closure is the emergent guarantee this composition owns.

The second concept is **secret-surface separation**. The authentication credential's stored form is a *verifier* — a one-way artifact (a salted password hash, an encoded public key) from which the original secret cannot be recovered (Credential Invariant 8) and which Credential never exposes in any output (Credential's Outputs and Feedback sections — the stored verifier is not an output field). An attestation key is a *signing* surface — material that produces a verifiable proof of authorship. A password hash is not a signing key; the surfaces are structurally different, and conflating them (as the demo did, for demo simplicity) is an architectural error, not a conforming shortcut. The composition forecloses the cross-routing half of this structurally — [Attest As Actor] takes a distinct attestation credential and never reads or re-purposes the Credential verifier (which is, by Invariant 8, not even available to read) — and names the distinct-provisioning half as a deployment obligation, because no records check can prove that two opaque secrets are cryptographically distinct.

The third concept is **namespace binding**. Attestations are attributed to `actor_ref`; sessions and credentials are keyed on `principal_ref`. If the two namespaces are allowed to diverge, an audit record attributed to one identity surface cannot be reconciled to the session or credential record on the other — a forensic reconstruction problem. The composition binds the two namespaces bijectively: each authenticated actor is one `(principal_ref, actor_ref)` pair, recorded at registration and immutable thereafter, so an attestation's `actor_ref` always resolves to exactly one authenticated `principal_ref` and vice versa.

This is a composition, not a new primitive. Credential and Actor Identity are unchanged; Authenticated Actor is the wiring that makes them coherent for a single principal. It introduces emergent actions — [Register Authenticated Actor], [Attest As Actor], and the read-only [Verify Actor Attestation] — that belong to no single constituent and exist only because the two atoms are wired together. What it is *not*: it is not the credential-revocation surface (the identity-management surface calls `Credential.revoke`; this composition provides the downstream gate, exactly as Login provides the downstream session cascade without initiating the revocation); it is not the actor registry that provisions the attestation key's public material (an Actor Registry / Identity Provisioning concept Actor Identity already defers to); it is not an authorization surface deciding what the authenticated actor may *do* (Permissions); and it is not a session manager (Login). Each is named in Edge cases.

---

## Composes

- **[Credential](../atoms/credential.md)** — the authentication surface and the *gating* constituent. [Register Authenticated Actor] calls `Credential.register(principal_ref, credential_material, credential_type, expires_at?) → credential_id | rejected(invalid-request | duplicate-active-credential | storage-failure)` to establish the principal's authentication credential. [Attest As Actor] does **not** call `Credential.verify` (which would require re-presenting the login secret on every signature); instead it performs a read-only **status query** against the credential store — *is there an `Active` credential for this `(principal_ref, credential_type)` pair?* — exactly as Login's `login` step 3 reads the store directly (Credential's Feedback section states the credential store is queryable to composing patterns). The composition does **not** call `Credential.rotate` or `Credential.revoke` — those are the identity-management surface's actions; the composition provides only the downstream attest-surface cascade, never the credential revocation itself. The gate keys on the `(principal_ref, credential_type)` pair rather than a fixed `credential_id`, so a *rotation* (which produces a successor `Active` credential — Credential Invariant 6) keeps the surface open while a *revocation* (which leaves no `Active` credential — Credential Invariant 4) closes it.

- **[Actor Identity](../atoms/actor-identity.md)** — the attestation surface. [Attest As Actor] calls `Actor Identity.attest(action_ref, actor_ref, attest_credential) → attestation_id | rejected(invalid-request | invalid-credential | storage-failure)` to produce the non-repudiable record, passing the **bound `actor_ref`** (resolved from the namespace binding) and the caller-supplied **attestation credential** (the signing key — distinct from the authentication `credential_material`, never the Credential verifier). [Verify Actor Attestation] calls `Actor Identity.verify(attestation_id) → verified | failed-verification(proof-invalid | actor-unknown-in-registry | registry-unavailable) | not-known` as a read-only pass-through, additionally resolving the verified attestation's `actor_ref` back to its bound `principal_ref`. The composition does not register the actor's public material in the actor registry — that is the Actor Registry / Identity Provisioning concept Actor Identity already names as forthcoming; `attest` surfaces a registry-unknown `actor_ref` through its own outcomes.

The Credential store (credential records) and the Actor Identity attestation store (attestations) are owned by their respective constituent instances. Authenticated Actor owns no constituent state — it indexes across the two with its own emergent maps (`principal_to_actor`, `actor_to_principal`, below) and a composition-layer attest log, and the *attestations themselves are the regulated record of record* (no Audit Trail substrate is in the cut — see Edge cases, *No Audit Trail substrate*).

A surface this composition needs that **no constituent provides** is the *bijective binding between the authentication namespace (`principal_ref`) and the attestation namespace (`actor_ref`)*. Credential keys on `principal_ref`; Actor Identity keys on `actor_ref`; neither relates the two. This is a **composition-introduced surface** at Authenticated Actor's layer (one of the four legitimate capability-provenance sources — see [`pressure-testing.md`](../pressure-testing.md) §Capability provenance), realized by the two emergent maps below.

---

## Composition logic

### Composition state

The composition owns emergent state that wires the two constituents into one authenticated-actor surface. None of this state belongs to a single constituent.

- **`principal_to_actor`** — map from `principal_ref` to `{actor_ref, credential_type, credential_id, bound_at}`. Populated atomically by [Register Authenticated Actor] after `Credential.register` succeeds; immutable thereafter (no action rebinds an existing principal). `credential_type` is the **gating type** — the credential type whose `Active` status the attest gate consults — and `credential_id` is the *initial* credential record for traceability; the gate keys on the `(principal_ref, credential_type)` pair (not the fixed `credential_id`) so that a rotation successor keeps the surface open. This is the namespace-binding index: it records *that* a principal was bound to an actor, under which gating credential type, and when.
- **`actor_to_principal`** — reverse map from `actor_ref` to `principal_ref`, maintained as the strict inverse of `principal_to_actor` and written in the same atomic step. Used by [Verify Actor Attestation] to resolve a verified attestation's `actor_ref` back to its authenticated `principal_ref` without a full scan. Immutable once written.
- **`attest_log`** — append-only record of every [Attest As Actor] call, whether it produced an attestation or was refused. Each entry carries: `entry_id` (opaque, system-generated), `principal_ref`, `actor_ref` (null when the call failed before the binding resolved), `action_ref`, [Outcome] (one of: `success` | `not-bound` | `credential-not-active(observed_status)` | `invalid-attest-credential` | `attest-failed` | `invalid-request`) — where [Observed Status] is the status of the most-recent credential record for the `(principal_ref, credential_type)` pair (`Revoked` | `Expired` | `Rotated`), the absence of any `Active` credential being what closed the gate, `attestation_id` (present only on `success`; null otherwise), `attempted_at`. This log is the composition's own composition-layer query surface; the **attestation store is the non-repudiable record of record** for the successful signatures it references. The two are redundant by design, exactly as Login pairs its `login_event_log` with the Audit Trail — but here the tamper-evident external-auditor surface is the attestation store itself, not a separate Audit Trail.

The credential store and the attestation store are owned by their constituent instances; the composition duplicates neither.

### Configuration

- **`attest_surface_separation`** — a deployment-declared obligation (default `enforced`) asserting that the attestation key material an actor presents to [Attest As Actor] is provisioned as **distinct key material** from the authentication `credential_material` registered through Credential. This is the **declaring source** (capability provenance) for Invariant 2's distinct-provisioning half: the composition forecloses cross-routing structurally (it never feeds Credential material into `Actor Identity.attest`), and the deployment attests that the two surfaces are independently provisioned. Whether the two opaque secrets are *cryptographically* distinct cannot be checked from the composition's records, so this obligation's satisfaction is an externally-clearable check (Generation acceptance). A deployment that sets this to anything other than `enforced` is declaring the demo-grade aliasing the CORNERS finding flagged, and forfeits Invariant 2.
- **`gating_credential_type_default`** — the default `credential_type` used as the gating type when [Register Authenticated Actor] is not given one explicitly. Deployment-configurable; must be a non-empty string. A deployment whose principals authenticate with a single primary credential type (e.g. `"password"` or `"fido2"`) sets this once; deployments binding a specific non-default type supply it per registration.

### Primitive policies

The composition takes string-typed inputs at its action boundaries; each is validated at this layer or by a constituent.

- **`principal_ref`** — opaque reference to the authenticated principal; the key of `principal_to_actor`. Must contain at least one non-whitespace character (`invalid-request`). Passed to `Credential.register` and used in the credential-store status read. Equality is opaque byte-identity; never normalized or case-folded (inherited from Credential's opaque-`principal_ref` discipline).
- **`actor_ref`** — opaque reference to the attesting actor in the actor registry; the key of `actor_to_principal`. Must be non-empty. Passed to `Actor Identity.attest`. Byte-identity equality; never normalized. The composition does not validate that the `actor_ref` exists in the registry — `Actor Identity.attest`/`verify` surface a registry-unknown actor through their own outcomes.
- **`credential_type`** — caller-supplied (or defaulted) label selecting the gating credential type; the value Credential uses to enforce its one-active-per-`(principal_ref, credential_type)` rule. Non-empty; opaque; never normalized at this layer.
- **`credential_material`** — the raw authentication secret, consumed by `Credential.register` and never persisted (Credential Invariant 8). The composition passes it through without inspection.
- **`attest_credential`** — the raw attestation signing material, consumed by `Actor Identity.attest` and never persisted (Actor Identity's credential-consumed-not-stored discipline). The composition passes it through without inspection and **never** substitutes the authentication `credential_material` or the Credential verifier for it (Invariant 2).
- **`action_ref`** — opaque reference to the action being attested; passed through to `Actor Identity.attest`. Non-empty; byte-identity; the composition does not interpret it (action-content immutability is handled at the host layer, inherited from Actor Identity).
- **`attestation_id`** — opaque Actor Identity handle; the argument [Verify Actor Attestation] resolves. Opaque; never normalized.

No primitive is case-sensitivity-normalized at the composition layer; deployments wanting normalization wire it at the calling layer before invoking composition actions.

### Action wiring

The composition exposes three actions: one intake ([Register Authenticated Actor]), one emergent gated-attest ([Attest As Actor]), and one read-only query ([Verify Actor Attestation]).

**Uniform constituent-rejection mapping.** Every constituent call below maps its rejection taxonomy to a composition-boundary code as named in each step. Where a constituent rejection arrives *before* any irreversible effect, it surfaces as a clean pre-state rejection that leaves no emergent state populated; the composition writes its `attest_log` entry (for [Attest As Actor]) or no map (for [Register Authenticated Actor]) accordingly.

---

#### `register_authenticated_actor`

```
register_authenticated_actor(principal_ref, actor_ref, credential_material, credential_type?, expires_at?) →
  {credential_id, actor_ref, bound_at}
 | rejected(
   invalid-request
  | namespace-conflict
  | duplicate-active-credential
  | storage-failure
  )
```

Binds an `actor_ref` to a `principal_ref` and registers the principal's authentication credential, establishing the namespace binding and the gating credential together. Steps:

1. Validate: `principal_ref`, `actor_ref`, `credential_material` each non-empty; `credential_type` (or `gating_credential_type_default`) non-empty; `expires_at`, if supplied, a future timestamp. Any violation → `rejected(invalid-request)`. Stop.
2. **Namespace-conflict guard (the bijection precondition).** If `principal_ref` is already a key of `principal_to_actor`, **or** `actor_ref` is already a key of `actor_to_principal`, → [Namespace Conflict]; nothing is written. This enforces the bijection at the boundary: neither namespace may be double-bound (Invariant 3).
3. Call `Credential.register(principal_ref, credential_material, credential_type, expires_at?)`. Map `duplicate-active-credential` → `rejected(duplicate-active-credential)` (the principal already holds an `Active` credential of this type — the caller rotates rather than re-registers, per Credential's own contract), `invalid-request` → `rejected(invalid-request)`, `storage-failure` → `rejected(storage-failure)`. On any rejection, **no binding is written**. On success, obtain `credential_id`.
4. **Atomically** write `principal_to_actor[principal_ref] = {actor_ref, credential_type, credential_id, bound_at = now}` and the strict inverse `actor_to_principal[actor_ref] = principal_ref`. (The two writes share one transaction; a discrepancy between them is evidence of a failed atomic write — Invariant 3.) If this write fails after the credential was registered → `rejected(storage-failure)`, with the orphaned credential (registered, unbound) surfaced as a finding per the *Cross-store consistency under partial failure* edge case.
5. Return `{credential_id, actor_ref, bound_at}`. The principal is now an **authenticated actor**: it can authenticate (via the credential) and attest (via the bound actor surface, gated on the credential's `Active` status).

---

#### `attest_as_actor`

```
attest_as_actor(principal_ref, action_ref, attest_credential) →
  attestation_id
 | rejected(
   invalid-request
  | not-bound
  | credential-not-active
  | invalid-attest-credential
  | attest-failed
  )
```

Produces a non-repudiable attestation for the bound actor, **only if the principal's authentication credential is currently `Active`** — the revocation cascade, enforced as a forward gate. This action is the composition's load-bearing surface. Steps:

1. Validate: `principal_ref`, `action_ref`, `attest_credential` each non-empty. Any violation → append `attest_log` entry `{outcome: invalid-request, actor_ref: null, attestation_id: null}`; return `rejected(invalid-request)`. Stop.
2. Resolve the binding: `principal_to_actor[principal_ref] → {actor_ref, credential_type}`. Absent → append `attest_log` `{outcome: not-bound, actor_ref: null}`; return [Not Bound]. Stop. (`not-bound` is structurally distinct from `credential-not-active`: the principal was never an authenticated actor, versus the principal was bound but its credential is no longer `Active`.)
3. **The cascade gate (read the credential status and attest atomically).** Read the credential store for an `Active` credential for `(principal_ref, credential_type)`. If none exists — because the credential was revoked (Credential Invariant 4), expired (Invariant 11), or rotated without a current `Active` successor — append `attest_log` `{outcome: credential-not-active(observed_status), actor_ref}`; return [Credential Not Active]. Stop. **The status read and the `Actor Identity.attest` call in step 4 are one serialized critical section keyed on `principal_ref`** (implementations serialize on `principal_ref`, exactly as Login serializes its cascade on `credential_id` and Defensible Retention serializes hold-check-and-purge on `record_ref`) — and because `Credential.revoke` is issued *outside* this composition (on the credential record, not through a composition action), the serialization point that makes it contend is the gating `(principal_ref, credential_type)` credential record itself: the gate reads that record's status under, and the attestation commits while holding, the same record lock an externally-issued `Credential.revoke` must acquire to transition it (the per-pair lock Credential's active-uniqueness constraint already imposes — Credential Invariant 2), so a revoke is ordered strictly before or after the section, never inside it. Equivalently, an implementation may re-validate the credential's `Active` status under that lock at attest-commit; a composition-local `principal_ref` mutex that the external `revoke` does not contend on is **not** sufficient. No concurrent `Credential.revoke` may interleave between the status read and the attestation write such that an attestation is produced while the credential is non-`Active`. This atomicity is the load-bearing concurrency claim (Invariant 1) and the formal-model subject; a non-atomic check-then-attest is the time-of-check-to-time-of-use (TOCTOU) hazard the buggy twin demonstrates.
4. Call `Actor Identity.attest(action_ref, actor_ref, attest_credential)` — passing the **bound `actor_ref`** (never a caller-supplied actor reference) and the **caller-supplied attestation credential** (never the authentication `credential_material` or the Credential verifier — Invariant 2). Map `invalid-credential` → [Invalid Attest Credential] (the signing material did not validate against the actor registry's public material for `actor_ref`), `invalid-request` → `rejected(invalid-request)`, `storage-failure` → [Attest Failed]. On any rejection, append the corresponding `attest_log` entry with `attestation_id: null`; return the mapped rejection. On success, obtain `attestation_id`.
5. Append `attest_log` `{outcome: success, principal_ref, actor_ref, action_ref, attestation_id, attempted_at: now}`. Return `attestation_id`. The attestation is recorded in the Actor Identity store under the bound actor, immutably (Actor Identity Invariant 1), and remains valid independent of any *later* credential revocation (Actor Identity Invariant 8 — non-repudiation conditional on credential integrity at attestation time).

---

#### `verify_actor_attestation` (read-only)

```
verify_actor_attestation(attestation_id) →
  {result, actor_ref?, principal_ref?}
```
where `result ∈ { verified | failed-verification(proof-invalid | actor-unknown-in-registry | registry-unavailable) | not-known }`.

The read-only surface an auditor uses to verify an attestation *and* resolve the authenticated principal behind it. Steps: call `Actor Identity.verify(attestation_id)`. On `not-known`, return `{result: not-known}` (no `actor_ref` to resolve). On any other result, read the attestation's `actor_ref` and resolve `actor_to_principal[actor_ref] → principal_ref` (absent → `principal_ref` omitted, surfaced as a binding-integrity finding: an attestation exists for an `actor_ref` the composition did not bind, see Edge cases *Attestations for unbound actors*). Return `{result, actor_ref, principal_ref?}`. **No state is changed** — this is a pure read, mirroring Actor Identity's read-only `verify`. Logging *who verified an attestation and when* is a composing access-log concept (Edge cases — *Auditing verification reads*), named rather than absorbed.

---

### The load-bearing wiring decision — the revocation cascade is forward closure of the attest gate, read atomically with the attestation write

The composition's structural reason to exist is the revocation cascade, and it is defended in four parts.

*Principle.* Revoking a principal's authentication credential must close that principal's attestation surface: a revoked login must not be able to produce new signed attestations. The composition gates [Attest As Actor] on the bound credential's live `Active` status, read atomically with the attestation write — so the authority to sign flows from a *currently-valid* login, not from a one-time binding made when the actor was first registered.

*Likely objection.* Two objections a sharp reviewer raises. First: *why not let Actor Identity refuse attestations for revoked principals itself, or cascade the revocation the way Login revokes sessions?* Second: *if the gate is just a status read followed by an attest call, doesn't a concurrent revocation between the two steps let a revoked credential still sign?*

*Mechanism that resolves it.* To the first: Actor Identity validates the attestation credential against the **actor registry's public material** and has no knowledge of the Credential atom — it structurally *cannot* see a credential revocation, so the gate cannot live inside it. And the cascade cannot be a revoke-the-set operation as in Login, because there is no active-attestation set to walk: attestations are **immutable, point-in-time records** (Actor Identity Invariant 1), and retracting a validly-made one would be wrong (Actor Identity Invariant 8 makes non-repudiation conditional on credential integrity *at attestation time*, not perpetually — an attestation made while the credential was `Active` was validly authorized and stays valid). The only coherent cascade for an immutable record surface is **forward closure**: stop producing *new* attestations once the credential leaves `Active`. To the second: the status read and the `Actor Identity.attest` call are one serialized critical section keyed on `principal_ref` (Action wiring step 3), so no `Credential.revoke` interleaves between check and attest; and revocation absorbing (Credential Invariant 4) plus terminal-state absorbing (Invariant 5) and expiry absorbing (Invariant 11) guarantee that once the credential is non-`Active`, *no* `Active` credential exists for the pair, so the gate stays closed for every subsequent call. The TOCTOU window the non-atomic reading would open is exactly what the formal model's buggy twin demonstrates is unsafe.

*Result.* A revoked (or expired, or rotated-without-current-successor) login cannot produce new attestations through the composition (Invariant 1); pre-revocation attestations remain valid and immutable, which is correct because they were validly authorized when made; and the cascade requires no new active-state machinery — it is the structural consequence of gating on a constituent's own terminal-absorbing invariants, with the composition supplying only the atomic check-and-attest and the namespace binding the gate reads.

---

## Composition-level invariants

These invariants emerge from the composition; none belongs to a single constituent. Each invariant's *Rests on:* clause is its **capability-provenance record** (see [`pressure-testing.md`](../pressure-testing.md) §Capability provenance): every clause traces to a declared source — a named constituent invariant or action, a deployment-declared configuration capability, or a composition-introduced surface this composition owns.

- **Invariant 1 — Revocation cascade / attest-surface closure (load-bearing).** No attestation is produced by [Attest As Actor] for a bound principal whose gating credential is not `Active` at the time the attestation is written; equivalently, once a bound principal's `(principal_ref, credential_type)` credential leaves `Active` (revoked, expired, or rotated without a current `Active` successor), the composition produces no further attestations for that principal until a new `Active` credential is registered (which, the binding being immutable, belongs to re-registration / rebinding). The guarantee is **forward-closing**: it constrains new attestations, not the immutability or validity of attestations already made (those rest on Actor Identity Invariants 1 and 8). *This is the load-bearing concurrency/safety claim and the formal-model subject; the model verifies that the atomic check-and-attest admits no reachable state in which an attestation is written under a non-`Active` credential, and the buggy twin shows the non-atomic check-then-attest TOCTOU does.* *Rests on:* Credential **Invariant 4 (revocation absorbing)**, **Invariant 5 (terminal-state absorbing)**, and **Invariant 11 (expiry absorbing)** — the named constituent invariants guaranteeing no `Active` credential exists for the pair once terminal; the composition-introduced **atomic check-and-attest critical section** (Action wiring, [Attest As Actor] step 3, serialized on `principal_ref`); the credential-store **status-read capability** (Credential's Feedback section — the store is queryable to composing patterns); and the **`principal_to_actor` namespace binding** (composition-introduced surface) that supplies the `(principal_ref, credential_type)` pair the gate reads.

- **Invariant 2 — Secret-surface separation.** The authentication credential surface (Credential's stored **verifier**, a one-way artifact) and the attestation credential surface (the signing material `Actor Identity.attest` consumes, validated against the actor registry's public material) are distinct key surfaces; the composition never presents the authentication `credential_material`, nor anything derived from the Credential verifier, as the `attest_credential`, and never the reverse. The **cross-routing half** is foreclosed structurally: [Attest As Actor] accepts a distinct `attest_credential` argument and never reads the Credential verifier — which is one-way (Credential Invariant 8) and never exposed in any output (Credential's Outputs/Feedback discipline), and therefore neither usable nor even available to re-purpose. The **distinct-provisioning half** — that the two opaque secrets are independently provisioned and cryptographically distinct — is a deployment obligation the records cannot confirm, stated *as* an obligation with verification routed to an externally-clearable check. *Rests on:* Credential **Invariant 8 (credential material never persisted; the stored verifier is a one-way artifact from which the raw secret cannot be recovered)** together with Credential's **Outputs/Feedback discipline (the stored verifier is never exposed in any output)** — the two jointly make the verifier unusable *and* unavailable as a signing key; Actor Identity's **credential-consumed-not-stored** discipline (declared in its Inputs, Behavior, and Decision-points — the attestation credential is consumed at `attest` and never persisted; this is a behavioral commitment, not one of its nine numbered invariants); and the deployment-declared **`attest_surface_separation`** configuration capability (Configuration) backing the distinct-provisioning obligation. This is the spec-level closure of the CORNERS §Cross-atom identity surface aliasing finding (a single secret aliased for both surfaces).

- **Invariant 3 — Namespace binding (principal ⇔ actor bijection).** Each bound principal has exactly one `(principal_ref, actor_ref)` pair: `principal_to_actor` and `actor_to_principal` are strict inverses, neither namespace is double-bound (the [Register Authenticated Actor] namespace-conflict guard), and a binding is immutable once written (no action rebinds). Consequently every attestation produced through [Attest As Actor] carries the `actor_ref` bound to the authenticating `principal_ref`, and [Verify Actor Attestation] resolves any verified attestation's `actor_ref` back to exactly one `principal_ref`. *Defended in-line:* [Register Authenticated Actor] writes both maps in one atomic step (step 4) behind the conflict guard (step 2); [Attest As Actor] passes only the bound `actor_ref` (step 4), never a caller-supplied one. *Rests on:* the composition-introduced **`principal_to_actor` / `actor_to_principal` maps** and the **namespace-conflict guard**, plus Credential **Invariant 1 (registration immutability)** and Actor Identity **Invariant 1 (attestation immutability)** for the immutability of the bound endpoints.

- **Invariant 4 — Attestation traceability and attest-log completeness.** Every [Attest As Actor] call produces exactly one `attest_log` entry, and every entry whose `outcome` is `success` carries a non-null `attestation_id` resolvable in the Actor Identity store and a non-null `actor_ref` equal to `principal_to_actor[principal_ref].actor_ref`; every non-`success` entry carries `attestation_id: null`. An auditor can therefore trace any composition-produced attestation to the authenticated principal that produced it, and reconcile every successful attestation against an attest-log entry, from the composition's own state. *Defended in-line:* each branch of [Attest As Actor] appends exactly one entry (steps 1–5). *Rests on:* the composition-introduced **`attest_log` append discipline** and the **`principal_to_actor` binding**; the attestation it references rests on Actor Identity **Invariant 9 (attestation durability)**.

- **Invariant 5 — Constituent invariants preserved.** All Credential invariants (1–11) hold over the credential store, and all Actor Identity invariants (1–9) hold over the attestation store. Authenticated Actor weakens no constituent invariant; it adds a gate and a binding, neither of which mutates constituent state outside the constituents' own actions. *Rests on:* each constituent's own Generation acceptance bar over its store instance.

Invariant 1 (revocation cascade) is the emergent guarantee the composition exists to provide; Invariant 2 (secret-surface separation) and Invariant 3 (namespace binding) are the two structural conditions that make the cascade and its audit trail meaningful — separation keeps the gated surface and the signing surface from collapsing into one, and the bijection lets every signature resolve to the authenticated identity the gate protects. Invariant 4 makes the attest surface auditable from the composition's own records; Invariant 5 preserves every constituent guarantee underneath.

---

## Examples

### Walkthrough — register, attest, then revoke-and-fail, end to end

A regulated software vendor authenticates developers and requires every release commit to be signed. It deploys Authenticated Actor with `gating_credential_type_default = "fido2"` and `attest_surface_separation = enforced`.

1. **Registration.** The identity-management surface registers developer `dev_smith`: `register_authenticated_actor(principal_ref = "dev_smith", actor_ref = "actor_smith", credential_material = <fido2-attestation-object>, credential_type = "fido2")`. The namespace-conflict guard passes (neither namespace is bound); `Credential.register` returns `credential_id = "cred_s01"`; `principal_to_actor["dev_smith"] = {actor_ref: "actor_smith", credential_type: "fido2", credential_id: "cred_s01", bound_at}` and `actor_to_principal["actor_smith"] = "dev_smith"` are written atomically. Returns `{credential_id: "cred_s01", actor_ref: "actor_smith", bound_at}`.

2. **Attestation while Active.** The developer signs a release commit with their **separate hardware signing key**: `attest_as_actor(principal_ref = "dev_smith", action_ref = "commit_c44a", attest_credential = <hardware-signing-key>)`. Step 2 resolves `actor_smith`. Step 3 reads the credential store: an `Active` `fido2` credential exists for `("dev_smith", "fido2")` → gate open. Step 4 calls `Actor Identity.attest("commit_c44a", "actor_smith", <hardware-signing-key>) → attestation_id = "att_a17"`. Step 5 logs `success`. Returns `att_a17`. The continuous-integration system later calls `verify_actor_attestation("att_a17") → {result: verified, actor_ref: "actor_smith", principal_ref: "dev_smith"}` before merging — the signature verifies *and* resolves to the authenticated developer.

3. **Revocation closes the surface.** Security determines `cred_s01` was compromised. The identity-management surface calls `Credential.revoke("cred_s01", revoked_by_ref = "security_team", reason = "key-compromise")` — `cred_s01` is now `Revoked` (Credential Invariant 4). No call into Authenticated Actor is required to "cascade": the next attestation attempt is refused structurally. `attest_as_actor("dev_smith", "commit_c45b", <hardware-signing-key>)` → step 3 reads the credential store, finds **no `Active` credential** for `("dev_smith", "fido2")` → appends `attest_log {outcome: credential-not-active(Revoked)}`; returns `rejected(credential-not-active)`. The revoked login can no longer sign (Invariant 1). The earlier `att_a17` remains `verified` — it was validly authorized before revocation (Actor Identity Invariant 8).

### Domain example — rotation keeps the surface open

The same developer's hardware authenticator is replaced under the 12-month rotation policy. The identity-management surface calls `Credential.rotate("cred_s01", <new-fido2-object>) → "cred_s02"` (`cred_s01` → `Rotated`, `cred_s02` → `Active`, same `("dev_smith", "fido2")` pair — Credential Invariants 2 and 6). No rebinding is needed: `attest_as_actor("dev_smith", "commit_c46c", <hardware-signing-key>)` → step 3 finds an `Active` credential for the pair (the rotation successor) → gate open → attestation produced. The gate keys on the `(principal_ref, credential_type)` pair, not the fixed `credential_id`, precisely so that a *rotation* (the actor is still legitimate) keeps the surface open while a *revocation* (the actor's authority is withdrawn) closes it. This is the load-bearing distinction between Credential Invariant 6 (rotation non-mutation, new `Active` successor) and Invariant 4 (revocation absorbing, no `Active` successor).

### Rejection path — namespace conflict and unbound attest

- **Namespace conflict.** A second registration reuses an already-bound actor: `register_authenticated_actor("dev_jones", "actor_smith", <material>, "fido2")` → step 2 finds `actor_smith` already in `actor_to_principal` → `rejected(namespace-conflict)`; no credential is registered, no binding written. The bijection (Invariant 3) is preserved: `actor_smith` stays bound to exactly `dev_smith`.
- **Attest for an unbound principal.** `attest_as_actor("dev_unknown", "action_x", <key>)` for a principal never registered through the composition → step 2 finds no binding → `attest_log {outcome: not-bound}`; `rejected(not-bound)`. This is distinct from `credential-not-active`: the principal was never an authenticated actor at all.
- **Invalid attestation credential.** `attest_as_actor("dev_smith", "commit_c47d", <wrong-signing-key>)` while the credential is `Active` → gate open, but `Actor Identity.attest` returns `invalid-credential` (the signing material does not validate against the registry's public material for `actor_smith`) → `attest_log {outcome: invalid-attest-credential}`; `rejected(invalid-attest-credential)`. The gate (authentication still valid) and the attest check (signing key valid) are independent surfaces — secret-surface separation in action (Invariant 2).

### Regulated adversarial scenarios

Three scenarios the composition must survive in regulated contexts.

**Regulator audit — "prove this signed action was authorized by a principal whose login was valid at signing time, and trace the signature to that login."** An auditor examines attestation `att_a17`. `verify_actor_attestation("att_a17")` returns `{verified, actor_ref: "actor_smith", principal_ref: "dev_smith"}` — the proof verifies (Actor Identity Invariants 2 and 3) *and* resolves to the authenticated principal via the namespace binding (Invariant 3). The auditor reads the credential store for `("dev_smith", "fido2")` and confirms `cred_s01` was `Active` at `att_a17.attested_at` (it was revoked later). The attest-log entry for `att_a17` corroborates the timeline (Invariant 4). Every claim is answered from the composition's records plus the two constituent stores — no developer narration. The structural guarantee that a *revoked* login could not have produced a *new* signature after revocation is Invariant 1.

**Disputed signature — the principal claims they did not authorize an action.** `dev_smith` disputes `commit_c44a`. The investigator calls `verify_actor_attestation("att_a17")`: `verified` binds `actor_smith` to `commit_c44a` at `attested_at` (Actor Identity Invariant 8). The namespace binding resolves `actor_smith` to `dev_smith` (Invariant 3). The dispute cannot be sustained without claiming credential compromise — which is exactly the boundary Actor Identity Invariant 8 names (non-repudiation conditional on credential integrity), routed to a Compromise Disclosure composing pattern. The investigator additionally confirms, from the credential store, that `cred_s01` was `Active` at signing time, so the signature was produced through a valid login surface — Invariant 1's gate was satisfied at the time.

**Breach investigation — "during the compromise window, was any new signature produced after we revoked the credential?"** A security team revoked `cred_s01` at `T_revoke` and asks whether the attacker produced signatures afterward. They query the `attest_log` for `dev_smith` entries after `T_revoke`: every such entry shows `outcome: credential-not-active(Revoked)` and a null `attestation_id` — the gate refused them (Invariant 1). A `success` entry after `T_revoke` would be the smoking gun, and Invariant 1 forecloses it structurally: the atomic check-and-attest admits no state in which an attestation is written under a `Revoked` credential. Any attestation in the Actor Identity store for `actor_smith` carries an `attested_at` at or before `T_revoke`; the forward-closure boundary is the revocation timestamp, and the `attest_log` is the records-alone evidence of every refused post-revocation attempt.

---

## Generation acceptance

A derived implementation of Authenticated Actor is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state (`principal_to_actor`, `actor_to_principal`, `attest_log`) plus the Credential store and the Actor Identity attestation store, can do all of the following without recourse to source code, runbooks, or developer narration. The composition carries **no Audit Trail substrate** (see Edge cases), so the records-clearable checks read the attestation store — itself the non-repudiable record — and the composition's emergent state, rather than an Audit-Trail traversal.

### Records-clearable checks

1. **Namespace-binding bijection.** Confirm `principal_to_actor` and `actor_to_principal` are strict inverses (every `principal → {actor, …}` has `actor → principal`, and vice versa), and that no `actor_ref` or `principal_ref` appears as a key in its map more than once. A discrepancy is a failed atomic write or a bijection violation (Invariant 3).
2. **Attest-surface closure (the cascade).** For every `attest_log` entry with `outcome: success` and `attestation_id = A`, confirm that the credential for `(principal_ref, credential_type)` was `Active` at the entry's `attempted_at` — i.e. no credential record for the pair shows a terminal transition (`revoked_at` / expiry / `rotated_at` without a current `Active` successor) at or before that timestamp such that no `Active` credential existed. A `success` entry whose credential was non-`Active` at attest time is a conformance failure (Invariant 1). Conversely, confirm every `attest_log` entry with `outcome: credential-not-active(...)` corresponds to a `(principal_ref, credential_type)` pair with no `Active` credential at `attempted_at`.
3. **Attestation traceability.** For every `attest_log` `success` entry, confirm `attestation_id` resolves in the Actor Identity store, that `Actor Identity.verify` returns `verified` for it (under the current registry view, or `failed-verification(proof-invalid)` only where the registry's public material has since rotated — handled at the registry layer, not a composition defect), and that its `actor_ref` equals `principal_to_actor[principal_ref].actor_ref`. An attestation referenced by a `success` entry but absent from the store, or carrying a different `actor_ref`, is a conformance failure (Invariant 4).
4. **Attest-log completeness.** Confirm every successful attestation in the Actor Identity store attributed to a bound `actor_ref` has a corresponding `attest_log` `success` entry, and that no `success` entry lacks an `attestation_id`. A bound-actor attestation with no log entry is a finding (Invariant 4); an attestation in the store for an `actor_ref` absent from `actor_to_principal` is the *attestations-for-unbound-actors* anomaly (Edge cases).
5. **Constituent Generation acceptance bars.** Verify Credential's six checks over the credential store and Actor Identity's five checks over the attestation store. The composition's invariants depend on the correctness of the constituents' invariants (Invariant 5).

### Externally-clearable checks

These questions arise around the composition but cannot be answered from its records alone — they are the composition's named audit-gaps, each routed to the evidence that owns it.

- **Whether the two secret surfaces are genuinely distinct key material.** The composition forecloses cross-routing structurally, but whether the deployment provisioned the authentication credential and the attestation signing key as cryptographically distinct material (rather than aliasing one for both, the CORNERS finding) cannot be confirmed from the records — the verifier is one-way and the secrets are opaque. This is the load-bearing separation audit-gap, cleared by the deployment's key-provisioning evidence and the `attest_surface_separation = enforced` declaration (Invariant 2).
- **Whether the `actor_ref` was correctly provisioned in the actor registry.** The composition binds an `actor_ref` and surfaces registry errors through `attest`/`verify`, but whether the registry holds the correct public material for that actor is the Actor Registry / Identity Provisioning concept (Edge cases).
- **Whether the authenticated actor was *authorized* to take the attested action.** The composition attributes *who* authorized an action (the attestation) but does not gate *whether* they were permitted to — that requires a Permissions instance (Edge cases — *Authorization is a composing concept*).
- **Whether a credential later determined compromised invalidates prior attestations.** Invariant 1 closes the surface forward; retroactive reinterpretation of attestations made during a compromise window is a Compromise Disclosure composing concept (Actor Identity Invariant 8's named boundary), not a property the composition's records resolve.

---

## Edge cases and explicit non-goals

- **No Audit Trail substrate — the attestations are the regulated record.** Login wires an Audit Trail to record its login/logout/cascade events; Authenticated Actor deliberately does not (the approved cut is Credential + Actor Identity, two atoms). It can afford to, because **Actor Identity attestations are themselves the non-repudiable, regulator-grade records** of the actions they attest — the composition's `success` outputs are tamper-resistant proofs, not mere log lines. The `attest_log` is the composition-layer query surface (the analog of Login's `login_event_log`), and the attestation store is the external-auditor surface. A deployment that needs *tamper-evident logging of the binding and gate operations themselves* (registrations, refused attest attempts) composes Audit Trail above this composition — a named composing concept, not absorbed, exactly as Login keeps lockout out of its cut.
- **The composition does not revoke credentials.** [Attest As Actor]'s cascade is the downstream consequence of a revocation performed elsewhere; the composition never calls `Credential.revoke`. The identity-management surface (or a compromise-response process) revokes the credential through Credential's own surface; the composition's gate then closes the attest surface structurally. A deployment that wants to *also* terminate the principal's live sessions on revocation wires Login's `revoke_sessions_for_credential` in parallel — the two cascades (sessions die, attest surface closes) are independent downstream consequences of the same `Credential.revoke`, each owned by its own composition.
- **No active-attestation revocation — the cascade is forward-closure only.** Unlike Login's session cascade, there is no set of "active attestations" to retract: attestations are immutable point-in-time records (Actor Identity Invariant 1), and an attestation made under a then-`Active` credential stays valid by design (Actor Identity Invariant 8). The cascade therefore closes the surface going forward and never rewrites the past. A deployment that needs prior attestations *reinterpreted* as untrustworthy after a compromise composes a Compromise Disclosure pattern, which produces new reinterpretation records rather than mutating the attestation store.
- **Actor registration is not owned here.** The composition binds an `actor_ref` that must already exist in the actor registry with valid public material; it does not register the actor or its attestation key. Actor registration, key rotation in the registry, and registry availability are the Actor Registry / Identity Provisioning concept Actor Identity already names as forthcoming. The composition surfaces a registry-unknown actor through `Actor Identity.attest`/`verify` outcomes (`invalid-attest-credential`, `failed-verification(actor-unknown-in-registry | registry-unavailable)`).
- **Authorization is a composing concept.** Whether the authenticated actor was *permitted* to take the attested action is distinct from whether they *authorized* it. The composition attributes authorization (the attestation answers *who*); it composes no Permissions instance and does not gate *what* the actor may do. A deployment that needs authorization wires a [Permissions](../atoms/permissions.md) check ahead of [Attest As Actor], exactly as Login leaves logout authorization to a composing Permissions layer.
- **Rebinding and re-registration.** A binding is immutable (Invariant 3); the composition exposes no action to rebind an existing `principal_ref` to a different `actor_ref` or to point the gate at a different credential type. A principal whose credential was revoked and who needs to attest again requires a fresh `Active` credential under the bound `(principal_ref, credential_type)` pair — re-registration of the credential through Credential's surface (the gate then reopens), not a rebinding. Changing the actor binding itself (a different `actor_ref`) is a deliberate non-goal: it would let the audit identity behind a principal shift, defeating the namespace-binding invariant. Deployments needing actor re-keying do so through the actor registry, preserving the `actor_ref`.
- **Attestations for unbound actors.** An attestation in the Actor Identity store for an `actor_ref` absent from `actor_to_principal` is a binding-integrity anomaly: it indicates an attestation was produced for that actor *outside* this composition (Actor Identity is freestanding and may be called directly), so the composition cannot resolve its `principal_ref`. [Verify Actor Attestation] returns `verified` with `principal_ref` omitted and the case is surfaced as a finding. The honest boundary: the namespace binding (Invariant 3) and traceability (Invariant 4) cover exactly the attestations *produced through this composition*; an out-of-band `Actor Identity.attest` call is invisible to the binding, exactly as a credential registered outside the composition is invisible to the gate.
- **Cross-store consistency under partial failure.** [Register Authenticated Actor] writes to the credential store (`Credential.register`) and then the composition's binding maps. If the binding write fails after the credential was registered, the result is an orphaned credential (registered, unbound): the composition returns `rejected(storage-failure)` and surfaces the orphan as a finding to be reconciled (rebind, or revoke the orphaned credential). [Attest As Actor] writes only to the attestation store (one `Actor Identity.attest` call) plus the append-only `attest_log`; the attest and the log append are ordered so a log entry without a successful attestation is impossible for `success` (the `attestation_id` is obtained before the entry is written), and an attestation without a log entry is the traceability finding check 4 catches. There is no multi-irreversible-write atomicity hazard on the attest path — the single irreversible effect is the immutable attestation, and the gate precedes it.
- **Concurrency.** Two concurrent [Attest As Actor] calls for the same `principal_ref` each run their own atomic check-and-attest critical section (serialized on `principal_ref`); both may succeed (two distinct attestations — Actor Identity has no at-most-one constraint, and two signed actions are two valid records), and neither can sign under a non-`Active` credential. A concurrent `Credential.revoke` and [Attest As Actor] are serialized by the critical section — which serializes on the gating `(principal_ref, credential_type)` credential record (the row `Credential.revoke` transitions and Credential Invariant 2 already locks), so the externally-issued revoke contends on the same point rather than on a composition-local handle: the attest either observes the credential `Active` and completes, or observes it non-`Active` and refuses — there is no interleaving in which an attestation is written under a revoked credential (Invariant 1; the formal model verifies this and its buggy twin shows the non-atomic reading is unsafe). Two concurrent [Register Authenticated Actor] calls for overlapping namespaces are serialized by the namespace-conflict guard plus Credential's own active-uniqueness constraint (Credential Invariant 2): at most one succeeds for a given pair.
- **Clock semantics.** `bound_at` and `attempted_at` are best-effort wall-time annotations read from the deployment's clock (inherited from Credential's and Actor Identity's clock-source treatment); `attested_at` on the attestation is set by Actor Identity. The cascade's correctness does not depend on clock honesty — it depends on the credential's `Active`-vs-terminal *status* at attest time, a state check, not a timestamp comparison. Deployments needing verifiable signing time compose Trusted Timestamping (RFC 3161 — the Internet standard for trusted time-stamping), per Actor Identity's own edge case.
- **Auditing verification reads.** [Verify Actor Attestation] records nothing — it is a pure read, mirroring Actor Identity's read-only `verify`. Logging *who verified an attestation and when* is a composing access-log concept, named rather than absorbed.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the three emergent actions it exposes ([Register Authenticated Actor], [Attest As Actor], [Verify Actor Attestation]) — none belonging to a single constituent — the attest-log fields those actions record ([Outcome], [Observed Status]), and its own rejections ([Namespace Conflict], [Not Bound], [Credential Not Active], [Invalid Attest Credential], [Attest Failed]). Its emergent state — the namespace-binding maps (`principal_to_actor`, `actor_to_principal`) and the `attest_log` — is a composition-introduced surface no constituent provides, left as backticked store tokens rather than carded. References to the constituent atoms and their operations — Credential's `register` / `rotate` / `revoke`, Actor Identity's `attest` / `verify` — the relayed tokens (`principal_ref`, `actor_ref`, `action_ref`, `credential_material`, `attest_credential`, `credential_type`, `credential_id`, `attestation_id`), the credential states (`Active` / `Revoked` / `Expired` / `Rotated`), and the inherited rejections (`invalid-request`, `duplicate-active-credential`, `storage-failure`) remain qualified/backticked, not carded here. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Register Authenticated Actor

The composition's intake action: it binds an `actor_ref` to a `principal_ref` (behind the namespace-conflict guard) and registers the principal's authentication credential through `Credential.register` in one step, writing the strict-inverse binding maps atomically. Returns `{credential_id, actor_ref, bound_at}`, or [Namespace Conflict] / an inherited Credential rejection (`duplicate-active-credential`, `invalid-request`, `storage-failure`).

Kind: Operation

#### Attest As Actor

The composition's load-bearing emergent action: it produces a non-repudiable attestation for the bound actor **only if** the principal's gating credential is currently `Active` — the revocation cascade, enforced as a forward gate read atomically with the attestation write (Invariant 1). Returns the `attestation_id`, or [Not Bound] (principal never bound), [Credential Not Active] (the gate is closed), [Invalid Attest Credential] (signing key invalid), or [Attest Failed]. Every call appends exactly one [Outcome] to the `attest_log`.

Kind: Operation

#### Verify Actor Attestation

The composition's read-only query: a pass-through to `Actor Identity.verify` that additionally resolves the verified attestation's `actor_ref` back to its bound `principal_ref`. Returns `{result, actor_ref?, principal_ref?}`; changes no state.

Kind: Operation

#### Namespace Conflict

The composition's own rejection from [Register Authenticated Actor] — returned when the `principal_ref` or the `actor_ref` is already bound, enforcing the principal ⇔ actor bijection at the boundary (Invariant 3). Nothing is written.

Kind:      Member
Member of: the register rejection
Role:      Rejection
Projects:  namespace-conflict

#### Not Bound

The composition's own rejection from [Attest As Actor] — returned when the `principal_ref` was never bound through the composition. Structurally distinct from [Credential Not Active]: *never an authenticated actor*, versus *bound but no longer authenticated*.

Kind:      Member
Member of: the attest rejection
Role:      Rejection
Projects:  not-bound

#### Credential Not Active

The composition's load-bearing rejection from [Attest As Actor] — the revocation cascade's observable form: returned when no `Active` credential exists for the bound `(principal_ref, credential_type)` pair (revoked, expired, or rotated without a current successor). Carries the [Observed Status] of the most-recent credential record.

Kind:      Member
Member of: the attest rejection
Role:      Rejection
Projects:  credential-not-active

#### Invalid Attest Credential

The composition's own rejection from [Attest As Actor] — the mapping of `Actor Identity.attest`'s `invalid-credential`: the presented signing material did not validate against the actor registry's public material for the bound `actor_ref`. Independent of the authentication gate (secret-surface separation, Invariant 2).

Kind:      Member
Member of: the attest rejection
Role:      Rejection
Projects:  invalid-attest-credential

#### Attest Failed

The composition's own rejection from [Attest As Actor] — the mapping of `Actor Identity.attest`'s `storage-failure`: the attestation could not be recorded.

Kind:      Member
Member of: the attest rejection
Role:      Rejection
Projects:  attest-failed

#### Outcome

The attest-log entry's classification of an [Attest As Actor] call: `success`, or one of the named rejection reasons ([Not Bound], [Credential Not Active], [Invalid Attest Credential], [Attest Failed], `invalid-request`). Every call appends exactly one entry, giving the composition a records-alone audit surface (Invariant 4).

Kind:      Field
Field of:  the attest-log entry
Role:      the attempt classification
Projects:  outcome

#### Observed Status

The credential status the attest gate observed when it refused a call — the most-recent credential record's status for the `(principal_ref, credential_type)` pair (`Revoked` | `Expired` | `Rotated`), the absence of any `Active` credential being what closed the gate. Carried inside the [Credential Not Active] outcome for post-hoc forensics.

Kind:      Field
Field of:  the attest-log entry
Role:      the gate-closing credential status
Projects:  observed_status

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Register Authenticated Actor]: #register-authenticated-actor
[Attest As Actor]: #attest-as-actor
[Verify Actor Attestation]: #verify-actor-attestation
[Namespace Conflict]: #namespace-conflict
[Not Bound]: #not-bound
[Credential Not Active]: #credential-not-active
[Invalid Attest Credential]: #invalid-attest-credential
[Attest Failed]: #attest-failed
[Outcome]: #outcome
[Observed Status]: #observed-status

---

## Standards references

Authenticated Actor is the structural form of the requirement that authentication and non-repudiable attestation be bound under one principal, with revocation of the former closing the latter. Its primary anchors:

- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63B §5.2 (Authenticator Lifecycle — Binding, Revocation, and Reauthentication)** — the requirement that a revoked authenticator can no longer be used to establish authority. The revocation cascade (Invariant 1) is the structural form: a revoked authentication credential closes the actor's attestation surface, so authority to sign flows from a currently-valid authenticator.
- **NIST SP 800-57 Part 1 (Recommendation for Key Management — General)** — key-usage separation: a key used for one purpose (authentication) should not serve another (signing/attestation). Secret-surface separation (Invariant 2) is the composition-level expression of the key-separation principle.
- **PCI DSS (Payment Card Industry Data Security Standard — the card networks' mandatory security rules for cardholder data) Requirement 8.6 (management of authentication factors and their binding to individual accounts)** — authentication factors must be bound to a specific identity and managed through their lifecycle; the namespace binding (Invariant 3) and the revocation cascade (Invariant 1) are the structural mechanisms for the bind-and-revoke lifecycle of a payment-system actor.
- **FIPS 140-3 (Federal Information Processing Standard — Security Requirements for Cryptographic Modules)** — the standard for the cryptographic modules that hold and operate signing keys; the distinct-key-surface obligation (Invariant 2, externally-clearable) is where a deployment's FIPS 140-3-validated module provisioning is the cleared evidence that the attestation key is genuinely separate material.

Authenticated Actor inherits the broader standards compliance of its constituents:

- Through **Credential**: NIST SP 800-63B (authenticator and verifier requirements — stored verifiers, not raw secrets), FIDO2 / WebAuthn (phishing-resistant authenticator binding), PCI DSS Requirement 8, ISO/IEC 27001 §A.9.4 (system and application access control), GDPR (EU General Data Protection Regulation) Article 32 (security of processing — the verifier-not-material discipline). The revocation-absorbing and terminal-absorbing invariants the cascade rests on are Credential's.
- Through **Actor Identity**: NIST SP 800-63-3 (identity and authenticator assurance), eIDAS Regulation (EU 910/2014 — qualified electronic signatures), FIPS 186-5 (Digital Signature Standard), 21 CFR (US Code of Federal Regulations) Part 11 (FDA electronic records and signatures — uniquely attributable, repudiation-resistant signatures), DEA EPCS (US Drug Enforcement Administration — Electronic Prescriptions for Controlled Substances; 21 CFR §1311 — two-factor cryptographic attestation for controlled-substance prescriptions), HIPAA (US Health Insurance Portability and Accountability Act) §164.312(d) (person or entity authentication), SOX (Sarbanes-Oxley Act) §302/§404 (officer certifications and internal-control evidence). The non-repudiation contract the cascade preserves forward is Actor Identity's.

---

## Status

`grounded on Final Critique 4 — 2026-06-10` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-10
formal: verified — authenticated-actor.tla + 1 twin, 2026-06-10
last gate: 2026-06-10 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/authenticated-actor.md`.
