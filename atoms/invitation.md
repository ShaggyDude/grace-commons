---
title: Invitation
parent: Atomic Concepts
has_toc: true
toc: true
---

# Invitation

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Invitation tracks the life of an invitation issued to an outside party to join something — a new employee, a customer, a collaborator, a patient. It answers "what is the state of this invitation, and who accepted it?" An invitation is issued before the invitee even has an identity in the system, which is exactly what makes it useful: it is the bridge from outsider to registered participant. Each invitation is identified by a random token that the invitee presents to act on it, and it starts [Pending]. It is resolved by a write to one of three recorded end states — [Accepted] (recording, permanently, the identity that joined), [Declined] (a deliberate refusal, recorded as its own outcome), or [Revoked] (the inviter withdrew it). If instead its time window simply passes, the invitation is shown as [Expired] — a status worked out on the fly by comparing the clock to the deadline, not written into the record. Resolving exactly once is the core guarantee: after it is resolved by a write, any further attempt is told it is already resolved. This also cleanly handles two people trying to accept at the same time — one wins, the other is told; and an attempt on a lapsed ([Expired]) invitation is told it has expired. The key moment is acceptance, where a concrete identity is bound to what may have started as an invitation to an unknown party. [Declined] is what sets this apart from a plain bearer token: a refusal is a recorded human decision, distinct from simply never using the invitation. It deliberately does not handle the credential setup, identity record, or login that usually follow acceptance — those are separate patterns.

---

## Intent

Systems that admit external entities — new employees joining an organization, customers enrolling in a service, collaborators gaining access to a shared workspace, patients registering with a provider — face a structural challenge: the invitation must be issued before the invitee's system identity exists, yet the moment of acceptance is when the system identity must be established. The invitation is the bridge between "external stranger" and "registered participant," and it must carry a record of the entire arc: who invited whom, when, whether the invitee responded, and — at the critical moment of acceptance — which identity was bound.

The pattern isolates that lifecycle record from the surrounding machinery. Invitation does not implement the credential registration that follows acceptance — that is Credential's surface (atom #11). It does not implement the identity record that the accepted invitee becomes — that is Party Identity's surface. It does not implement the session issued to the newly accepted participant — that is Session's surface. It does not implement the onboarding workflow that sequences all of these steps — that is External Onboarding's surface. Invitation answers one structural question: *what is the current state of this invitation, and if it was accepted, who accepted it?* The answer is derivable from the invitation record alone.

The `Declined` terminal state is what distinguishes Invitation from Capability (atom #13) at the EOS Pass 2 boundary. Both atoms use bearer-token transport: the holder of a token presents it to resolve the invitation or redeem the capability. Both are time-bounded; both can be revoked. The structural difference is that `Declined` represents a deliberate human decision — a named participant chose to refuse — which is semantically distinct from the invitation simply not being used (which is shown as the derived `Expired` status — a read-time projection, not a stored outcome). Capability has no `declined` state because a bearer either redeems a capability or they do not; the non-use is not a decision that the system records as a first-class outcome. Invitation has `Declined` because a potential participant's refusal matters to the system's audit record independently of whether the invitation token was simply never presented.

This is a freestanding atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the invitation record and its resolution), its own actions (`initiate`, `accept`, `decline`, `revoke`), and its own operational principles (single-resolution, expiry-is-derived, opaque invitee at initiation, identity binding at acceptance). It does not implement the downstream provisioning that follows acceptance, the notification that delivers the invitation token, or the policy governing who may invite whom. Each is a composing-pattern concept; see Composition notes.

---

## Structure

### Identity model

Every invitation known to the system has an **[Invitation Token]** — an opaque, cryptographically random, immutable, system-generated value produced by [Initiate]. The token is both the record's identity and the bearer credential the invitee presents to [Accept] or [Decline]. The token's security properties follow the same reasoning as Capability: it must be unguessable and unpredictable.

The fields set on [Initiate] — [Inviter Ref], [Invitee Ref], [Context], [Initiated At], [Expires At] — are immutable properties of the record. [Expires At] is computed once at [Initiate] from the injected clock ([Expires At] = [Now] + [TTL]) and stored; it is the sole input the expiry derivation needs thereafter. The resolution fields ([Accepting Identity Ref], [Accepted At], [Declined At], [Revoked At], [Revoked By Ref], [Revocation Reason]) are null until the relevant terminal **write** fires and immutable once set. There is **no `expired_at` field**: expiry is derived at read time from [Expires At] and the clock, never written, so there is no stored expiry timestamp to keep consistent.

[Invitee Ref] is optional at [Initiate] time: the inviting actor may not know the invitee's system identity when the invitation is created (the invitee may not yet be registered in any system). Whether the [Invitee Ref] resolves to a known identity, matches the [Accepting Identity Ref], or is null at all are matters the atom treats as valid operating states. The composing pattern decides what to do with any mismatch.

Tokens are not reused after an invitation reaches a terminal state.

### Inputs and Outputs

**Actions:** The current clock reading and the token are **pipeline-injected at the I/O seam** (the execution contract's `clock_t` and `id_t`, supplied at Step 3 — not read inside the transition, not trusted from the caller, and **not** action parameters). The injected clock is consumed for two clearly separated purposes: stamping immutable timestamps on a write (execution time), and evaluating the pure expiry derivation in a guard (no write). It therefore appears in no signature below. See the Logic-confinement note in Decision points.

- [Initiate] — (Projected contract: `initiate(inviter_ref, invitee_ref, context, ttl) → invitation_token | rejected(invalid-request | storage-failure)`)
- [Accept] — (Projected contract: `accept(invitation_token, accepting_identity_ref) → accepted | rejected(invalid-request | expired | already-resolved(state) | not-known | storage-failure)`)
- [Decline] — (Projected contract: `decline(invitation_token) → declined | rejected(expired | already-resolved(state) | not-known | storage-failure)`)
- [Revoke] — (Projected contract: `revoke(invitation_token, revoked_by_ref, reason) → revoked | rejected(invalid-request | expired | already-resolved(state) | not-known | storage-failure)`)

There is **no `expire` action**. A lapsed invitation needs no write to become [Expired]; expiry is surfaced by the read projection below. `already-resolved(state)` names a *stored* terminal only — [Accepted], [Declined], or [Revoked]; the lapsed-window case is the distinct `expired` rejection.

**Read surface (render time):**

- [Read] — (Projected contract: `read(filter) → records`) — each returned record carries its stored fields plus a derived **[Effective Status]**: [Expired] when [Status] = [Pending] ∧ [Now] ≥ [Expires At], otherwise the stored [Status]. [Effective Status] is a pure projection over the record and the pipeline-injected clock [Now] (supplied at the I/O seam, not a parameter); it is never stored.

**Inputs:**

- [Inviter Ref] — an opaque reference to the actor issuing the invitation. Recorded as an immutable property. Non-null and non-empty required.
- [Invitee Ref] — an opaque reference to the intended invitee. Optional — may be null if the inviting actor does not know the invitee's system identity at initiation time. When supplied, stored as an immutable property and never validated by the atom.
- [Context] — an opaque descriptor of what the invitee is being invited to join (e.g., an organization identifier, a workspace reference, a role). Opaque to the atom; interpreted by the composing pattern. Non-null and non-empty required.
- [TTL] — a duration value specifying how long the invitation is valid. Null uses the deployment's default invitation TTL. [Expires At] = [Initiated At] + [TTL]. Must be positive if supplied.
- [Invitation Token] — the bearer token the invitee presents to [Accept], [Decline]; the inviting party or administrator presents to [Revoke].
- [Accepting Identity Ref] — an opaque reference to the identity that is accepting the invitation. Supplied to [Accept]. This is the binding: whoever calls [Accept] provides the identity that will be permanently recorded as having accepted. Non-null and non-empty required.
- [Revoked By Ref] — opaque reference to the actor withdrawing the invitation. Non-null and non-empty required.
- [Reason] — caller-supplied reason for revocation. Non-null and non-empty required.
- [Now] *(not a parameter — pipeline-injected)* — the clock reading (`clock_t`), supplied by the pipeline at the I/O seam, not passed by the caller and not present in any action signature. It is **not** caller-trusted and is **not** read inside any transition. It is used only to stamp immutable write timestamps (execution time) and to evaluate the pure expiry derivation in a guard and in [Read]'s [Effective Status] projection (no write).

**Outputs:**

- The current set of invitation records. For each: [Invitation Token], [Inviter Ref], [Invitee Ref] (nullable), [Context], [Initiated At], [Expires At], [Status] (the stored status: [Pending], [Accepted], [Declined], or [Revoked]), [Accepting Identity Ref] (nullable), [Accepted At] (nullable), [Declined At] (nullable), [Revoked At] (nullable), [Revoked By Ref] (nullable), [Revocation Reason] (nullable), and the derived [Effective Status] (the stored [Status], except [Expired] when [Status] = [Pending] ∧ [Now] ≥ [Expires At]).
- [Initiate] returns a new [Invitation Token] on success, or a rejection.
- [Accept] returns `accepted` on success, or a rejection — `expired` if the window has lapsed ([Now] ≥ [Expires At]), or `already-resolved(state)` if the invitation was already written to a stored terminal.
- [Decline] returns `declined` on success, or a rejection (`expired` or `already-resolved(state)`).
- [Revoke] returns `revoked` on success, or a rejection (`expired` or `already-resolved(state)`).

### State

Each invitation record carries a stored [Status] field. The state machine has one non-terminal state and three **stored** terminal states; [Expired] is a fourth status that is **derived, never stored**:

- **[Pending]** — the invitation has been issued and awaits resolution. The only non-terminal stored state.
- **[Accepted]** — the invitation was accepted and an identity was bound. Stored terminal.
- **[Declined]** — the invitation was deliberately declined. Stored terminal.
- **[Revoked]** — the invitation was withdrawn before resolution. Stored terminal.
- **[Expired]** *(derived — never stored)* — a still-[Pending] record whose window has lapsed ([Now] ≥ [Expires At]). Computed at read time by the [Effective Status] projection from the immutable [Expires At] and the injected clock; no transition fires and no field is written when an invitation lapses.

Transitions (every write below stamps its timestamp from the injected [Now]; no transition reads the clock internally). Expiry is listed for contrast: it is *not* a transition and writes nothing.

| action | from | to | guard (against injected [Now]) | stamps (writes) | result |
| --- | --- | --- | --- | --- | --- |
| [Initiate] | *(no record)* | **[Pending]** | valid request ([TTL] positive or default) | fresh [Invitation Token]; [Inviter Ref]; [Invitee Ref]; [Context]; [Initiated At] = [Now]; [Expires At] = [Now] + [TTL] | the new [Invitation Token] |
| [Accept] | [Pending] | **[Accepted]** | [Now] < [Expires At] | [Accepting Identity Ref]; [Accepted At] = [Now] | `accepted` |
| [Decline] | [Pending] | **[Declined]** | [Now] < [Expires At] | [Declined At] = [Now] | `declined` |
| [Revoke] | [Pending] | **[Revoked]** | [Now] < [Expires At] | [Revoked At] = [Now]; [Revoked By Ref]; [Revocation Reason] | `revoked` |
| *expiry (derived — not a transition)* | [Pending] | *[Pending]* (unchanged) | [Now] ≥ [Expires At] | **nothing written** | *shown* [Expired] |

The transitions in detail, with the single-resolution precedence, atomicity, and writes-nothing semantics that the table abbreviates:

- `initiate(inviter_ref, invitee_ref, context, ttl)` → a new invitation record is created in [Pending] status with a fresh injected [Invitation Token], the supplied [Inviter Ref], [Invitee Ref] (nullable), [Context], [Initiated At] = [Now], and [Expires At] = [Now] + [TTL] (or default) — where [Now] is the pipeline-injected clock at the seam. Returns [Invitation Token].
- `accept(invitation_token, accepting_identity_ref)` → permitted only when stored [Status] = [Pending] **and** [Now] < [Expires At]; status transitions from [Pending] to [Accepted]; [Accepting Identity Ref] and [Accepted At] = [Now] are recorded. Returns `accepted`. (When [Now] ≥ [Expires At] the guard returns `expired` and writes nothing.)
- `decline(invitation_token)` → permitted only when stored [Status] = [Pending] **and** [Now] < [Expires At]; status transitions from [Pending] to [Declined]; [Declined At] = [Now] is recorded. Returns `declined`.
- `revoke(invitation_token, revoked_by_ref, reason)` → permitted only when stored [Status] = [Pending] **and** [Now] < [Expires At]; status transitions from [Pending] to [Revoked]; [Revoked At] = [Now], [Revoked By Ref], and [Revocation Reason] are recorded. Returns `revoked`.
- **Expiry is not a transition.** When [Now] ≥ [Expires At], a [Pending] record is *shown* as [Expired] by [Read]'s [Effective Status] projection; nothing is written, no scheduler is required, and there is no `expire` action. This is the "derive the idealization, do not lag it with a stored flag" discipline — the lapsed state is computed from [Expires At] and the clock, not remembered.
- *(no transitions out of [Accepted], [Declined], or [Revoked]; [Expired] is derived, so nothing transitions into or out of it.)*

The non-mutating render-time surface of this state machine is **[Read]** (`read(filter)`, defined in Inputs and Outputs): it reads stored state and computes each record's derived [Effective Status] against the pipeline-injected clock. [Read] fires no transition and writes nothing; it is the only surface that surfaces the derived [Expired] status.

Each invitation record carries:

- **[Invitation Token]** — opaque, cryptographically random, immutable, system-generated. Set on [Initiate]. Never changes. The bearer credential.
- **[Inviter Ref]** — opaque reference to the inviting actor. Set on [Initiate]. Never changes.
- **[Invitee Ref]** — opaque reference to the intended invitee. Nullable. Set on [Initiate]. Never changes.
- **[Context]** — opaque descriptor of what the invitee is being invited to join. Set on [Initiate]. Never changes.
- **[Initiated At]** — wall-time when [Initiate] was called. Immutable.
- **[Expires At]** — absolute expiry time. Set on [Initiate]. Immutable. Never null.
- **[Status]** — the **stored** status: [Pending] | [Accepted] | [Declined] | [Revoked]. Set to [Pending] on [Initiate]; immutable once written to a terminal. The derived [Expired] is *not* a value of this field — it appears only in the [Effective Status] read projection.
- **[Accepting Identity Ref]** — the identity that accepted the invitation. Null until [Accept] fires. Immutable once set.
- **[Accepted At]** — set when status transitions to [Accepted]. Null otherwise. Immutable once set.
- **[Declined At]** — set when status transitions to [Declined]. Null otherwise. Immutable once set.
- **[Revoked At]** — set when status transitions to [Revoked]. Null otherwise. Immutable once set.
- **[Revoked By Ref]** — opaque reference to the revoking actor. Null until revocation. Immutable once set.
- **[Revocation Reason]** — caller-supplied reason string. Null until revocation. Immutable once set.

### Flow

1. **Inviting actor creates an invitation.** Calls `initiate(inviter_ref, invitee_ref, context, ttl) → invitation_token`. The atom creates the record and returns the token. The inviting actor delivers the token to the invitee through an appropriate out-of-band channel (email link, direct message, printed QR code).
2. **Invitee accepts.** Calls (or the system calls on their behalf after presenting the token) `accept(invitation_token, accepting_identity_ref) → accepted`. The atom records the accepting identity and transitions the invitation to [Accepted]. The composing pattern (e.g., External Onboarding) proceeds to create a Party Identity record, register a Credential, and issue a Session.
3. **Invitee declines.** Calls `decline(invitation_token) → declined`. The atom records the refusal and transitions the invitation to [Declined]. The composing pattern notifies the inviting actor and closes the onboarding arc.
4. **Invitation lapses (expiry, derived).** The deadline passes without resolution. No action and no write are required: a still-[Pending] record now reads as [Expired] via [Read]'s [Effective Status] projection ([Now] ≥ [Expires At]). A subsequent [Accept]/[Decline]/[Revoke] on it is rejected `expired` (its guard compares the injected [Now] to [Expires At], writing nothing). A composing pattern that wants to notify the inviting actor reads the effective status; the record itself is untouched.
5. **Inviting actor revokes.** Calls `revoke(invitation_token, revoked_by_ref, reason)`. The atom transitions to [Revoked] and records the attribution. Future action attempts return `already-resolved(Revoked)`.

### Decision points

**Logic confinement (clock and id).** The clock and the token are **pipeline-injected at the I/O seam**, never produced inside a transition and never action parameters. The execution contract reads the clock once and supplies [Now] (`clock_t`) at the seam (Step 3); it likewise supplies the fresh [Invitation Token] (the injected `id_t`) to [Initiate]. Neither appears in any signature above — they are consumed *inside* the atom by exactly two confined uses. First, the **pure expiry guard**: a guard's expiry test is a **pure function of the stored record and the injected [Now]** — `is_expired(record, now) ≜ record.status = Pending ∧ now ≥ record.expires_at` — and it **writes nothing**. Second, the **timestamp stamps**: the only clock *writes* are the immutable timestamps inside a committed transition ([Initiated At], [Accepted At], [Declined At], [Revoked At]), each stamped from the same injected [Now]. Expiry itself never writes; it is surfaced only by [Read]'s [Effective Status] projection (which consumes the same injected clock). Rejection priority for the resolving writes: [Not Known] → `already-resolved(state)` → `expired` → [Invalid Request] → [Storage Failure].

**At `initiate(inviter_ref, invitee_ref, context, ttl)`:**
- [Inviter Ref] and [Context] must be non-null and non-empty; otherwise [Invalid Request].
- [Invitee Ref] may be null — the atom permits invitations whose intended recipient is not yet a known system entity. Whether the deployment permits null [Invitee Ref] is a deployment-configuration decision.
- [TTL] must be positive if supplied; null uses the deployment default. Zero or negative is [Invalid Request]. The deployment default must be configured; absent, [Invalid Request].
- [Initiated At] = [Now] and [Expires At] = [Now] + [TTL] are computed once from the injected [Now] and stored immutably.
- If the store write fails, [Storage Failure] is returned with no partial record.

**At `accept(invitation_token, accepting_identity_ref)`:**
- The atom looks up the invitation by [Invitation Token]. If no record is found, [Not Known].
- If the stored [Status] is a terminal ([Accepted], [Declined], or [Revoked]), `already-resolved(state)` naming that stored terminal. This is the single-resolution invariant in action.
- **Expiry guard (derived, no write):** if `is_expired(record, now)` — stored [Status] = [Pending] ∧ [Now] ≥ [Expires At] — return `expired`. The record is left [Pending]; nothing is written. (A reader sees [Effective Status] = [Expired].)
- [Accepting Identity Ref] must be non-null and non-empty; otherwise [Invalid Request].
- The transition to [Accepted] and the writes of [Accepting Identity Ref] and [Accepted At] = [Now] are atomic. Under concurrent [Accept] calls, exactly one commits the transition; all others receive `already-resolved(Accepted)`.
- If the store write fails, [Storage Failure] is returned; the record remains [Pending].
- The atom does not validate that [Accepting Identity Ref] matches [Invitee Ref]. Whether the accepting identity was the intended invitee belongs to the composing pattern.

**At `decline(invitation_token)`:**
- The atom looks up the invitation by [Invitation Token]. If no record, [Not Known].
- If the stored [Status] is a terminal, `already-resolved(state)`.
- **Expiry guard (derived, no write):** if `is_expired(record, now)`, return `expired`; the record is left [Pending] and nothing is written.
- The transition to [Declined] and the write of [Declined At] = [Now] are atomic. If the store write fails, [Storage Failure]; the record remains [Pending].
- [Decline] takes no identity argument: the declining actor's identity is not recorded. The deliberate refusal is recorded as the stored terminal [Declined], not as an attribution record. Whether the declining actor is the intended invitee is not validated. Composing patterns that need to record who declined may do so in their own records.

**At `revoke(invitation_token, revoked_by_ref, reason)`:**
- The atom looks up the invitation by [Invitation Token]. If no record, [Not Known].
- If the stored [Status] is a terminal, `already-resolved(state)`.
- **Expiry guard (derived, no write):** if `is_expired(record, now)`, return `expired`; nothing is written. (A caller wishing to end a [Pending] invitation *before* its window lapses calls [Revoke] while [Now] < [Expires At]; once lapsed, the invitation already reads [Expired] and needs no withdrawal.)
- [Revoked By Ref] and [Reason] must be non-null and non-empty; otherwise [Invalid Request].
- The transition to [Revoked] and the writes of [Revoked At] = [Now], [Revoked By Ref], and [Revocation Reason] are atomic. If the store write fails, [Storage Failure].

*(There is no `expire` action: a lapsed invitation requires no write to be [Expired] — see the expiry guard above and [Read]'s [Effective Status] projection.)*

### Behavior

- **Single-resolution is the atom's central invariant.** Every *write* that resolves an invitation — [Accept], [Decline], [Revoke] — checks the stored status as its first operation. If the stored status is already a terminal ([Accepted], [Declined], [Revoked]), the action returns `already-resolved(state)` without modifying any record. The check-and-commit from [Pending] to a stored terminal must be atomic (see Invariant 2): under concurrent resolving writes, exactly one commits and the rest see `already-resolved`. An implementation that writes two terminal states for one invitation has violated the atom's core contract.
- **Expiry is derived, not written.** When [Now] ≥ [Expires At], a still-[Pending] invitation is *shown* [Expired] by [Read]'s [Effective Status] projection, and a resolving write attempted on it is rejected `expired` — but **no record is written**, there is no `expired_at` field, and there is no `expire` action. The clock that decides expiry is the injected [Now], consumed by a pure derivation; it is never read inside a transition and never lags behind a stored flag. This is the "derive the idealization, do not lag it with a flag" discipline (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls).
- **[Accept] binds an identity; [Decline] does not.** [Accept] requires [Accepting Identity Ref] and records it permanently. [Decline] records only [Declined At]. This asymmetry is intentional: acceptance creates a system relationship (a new participant joined); declination closes the open invitation without creating a relationship. Whether to record who declined is a composing-pattern decision.
- **Opaque invitee at initiation is a feature, not a gap.** The [Invitee Ref] field is optional and the atom never validates it against the [Accepting Identity Ref] at accept time. This accommodates the common real-world scenario where an invitation is sent to an email address that does not yet correspond to any system identity, and the identity is only created at acceptance time. The composing External Onboarding pattern decides what relationship between [Invitee Ref] and [Accepting Identity Ref] is required by the deployment.
- **[Declined] is a named stored terminal, not a fallback.** A declined invitation is not a lapsed (derived [Expired]) invitation and is not a revoked one. It represents a deliberate act by a party who held the invitation token and chose to refuse. An implementation that collapses [Declined] into the derived [Expired] (treating a refusal as mere non-use) loses the structural distinction. The audit record should distinguish "was never opened / the window lapsed" (the derived [Expired]), "was seen and refused" (stored [Declined]), and "was withdrawn by the inviter" (stored [Revoked]).
- **`already-resolved(state)` carries the stored terminal; `expired` is distinct.** When a write is called on a *stored-resolved* invitation, the rejection includes the stored terminal so the caller knows what resolution occurred: `already-resolved(Accepted)` signals something different than `already-resolved(Declined)` or `already-resolved(Revoked)`. A write on a *lapsed* invitation (still-[Pending], [Now] ≥ [Expires At]) instead yields the distinct `expired` rejection — the invitation was never written to a terminal; its window simply closed.

### Feedback

Each successful action produces an observable, measurable change:

- After [Initiate] — a new invitation record appears in [Pending] status with a fresh [Invitation Token], [Inviter Ref], [Invitee Ref] (nullable), [Context], [Initiated At], and [Expires At]. Total record count increases by one. The token is returned to the caller.
- After [Accept] — [Status] transitions to [Accepted]; [Accepting Identity Ref] and [Accepted At] are set.
- After [Decline] — [Status] transitions to [Declined]; [Declined At] is set.
- After [Revoke] — [Status] transitions to [Revoked]; [Revoked At], [Revoked By Ref], and [Revocation Reason] are set.
- On expiry — **no change**: when [Now] ≥ [Expires At], a still-[Pending] record's [Effective Status] reads [Expired], but no field is written, the record count does not change, and no transition fires. Expiry is observable only through [Read] (the derived [Effective Status]), never through a write.

Rejected actions produce named rejection codes observable to the caller. `already-resolved(state)` carries the stored terminal that blocked the action; `expired` signals a lapsed (still-[Pending], past-window) invitation. Together they give the caller a complete picture of why the invitation cannot be acted upon.

The invitation store is queryable. Per-record fields, and each record's derived [Effective Status], are observable to authorized administrative surfaces. Composing patterns may query by [Inviter Ref] to list pending invitations for an actor, by [Context] to audit onboarding activity for a specific workspace, or by [Effective Status] to generate acceptance-rate or lapse-rate metrics.

### Invariants

**Invariant 1 — Initiation immutability.** Once an invitation record is created, [Invitation Token], [Inviter Ref], [Invitee Ref], [Context], [Initiated At], and [Expires At] never change. The resolution fields are null until the terminal **write** fires and immutable once set. (There is no `expired_at` resolution field — expiry is derived, Invariant 12.)

**Invariant 2 — Single-resolution (by write).** An invitation is resolved by **at most one write** to a stored terminal state — [Accepted], [Declined], or [Revoked] — and no further write is permitted after that. Any *write* called on a stored-resolved invitation returns `already-resolved(state)`. The check-and-commit from [Pending] to a stored terminal must be atomic, so that under concurrent resolution attempts exactly one commits. Expiry is **not** a resolution: a [Pending] invitation whose window lapses is never written; it is shown [Expired] by derivation (Invariant 12), and any write on it is rejected `expired`.

**Invariant 3 — Acceptance binds identity.** When an invitation transitions to [Accepted], [Accepting Identity Ref] and [Accepted At] are recorded atomically with the status transition. A record with [Status] = [Accepted] and a null [Accepting Identity Ref] is evidence of an implementation defect. The [Accepting Identity Ref] is immutable once set.

**Invariant 4 — Opaque invitee at initiation.** [Invitee Ref] may be null at [Initiate] time. The atom never validates [Invitee Ref] against [Accepting Identity Ref] at [Accept] time. These are two independent, opaque references; whether they represent the same real-world entity belongs to the composing pattern.

**Invariant 5 — Three structurally distinct stored terminals; [Expired] is derived.** The stored terminals are distinguishable in the record store. A record with [Status] = [Accepted] has non-null [Accepting Identity Ref] and [Accepted At]. A record with [Status] = [Declined] has non-null [Declined At]. A record with [Status] = [Revoked] has non-null [Revoked At], [Revoked By Ref], and [Revocation Reason]. No two stored terminals share an identical field pattern. [Expired] is **not** a stored terminal and carries no fields of its own — it is the derived [Effective Status] of a [Pending] record with [Now] ≥ [Expires At] (Invariant 12). An implementation that stores [Expired], adds an `expired_at` field, or collapses two stored terminals into one representation violates this invariant.

**Invariant 6 — `already-resolved` carries the stored terminal; lapse is `expired`.** Every rejection of a write on a stored-resolved invitation includes the stored terminal name in the payload: `already-resolved(Accepted)`, `already-resolved(Declined)`, or `already-resolved(Revoked)`. A bare `already-resolved` without the state name is not conformant. A write on a lapsed invitation (still-[Pending], [Now] ≥ [Expires At]) is rejected with the distinct reason `expired`, never `already-resolved(Expired)` — there is no stored [Expired] to name.

**Invariant 7 — Expiry deadline immutability.** [Expires At] is computed once at [Initiate] from the injected [Now] and never mutated; it is the sole stored input to the expiry derivation (Invariant 12). Extending validity requires initiating a new invitation (a still-[Pending] original may be [Revoke]d first); the deadline of an existing invitation is never moved.

**Invariant 8 — Revocation attribution completeness.** Every invitation record with [Status] = [Revoked] has non-null [Revoked At], [Revoked By Ref], and [Revocation Reason]. A [Revoked] record missing any of these is evidence of a process violation.

**Invariant 9 — Every invitation has a finite lifetime.** [Expires At] is never null. Invitations that do not expire are not expressible; an implementation that initiates invitations without an [Expires At] violates this invariant. The derived [Expired] status (Invariant 12) depends on this field always being present.

**Invariant 10 — Invitation durability.** Once [Initiate] returns an [Invitation Token], the invitation record is durably persisted. A [Storage Failure] rejection guarantees no partial record was written. The atom provides no deletion surface.

**Invariant 11 — Token uniqueness.** No two invitation records share an [Invitation Token] across the lifetime of the system. The token is the injected `id_t`; a write that would reuse an existing [Invitation Token] is rejected as [Storage Failure], so uniqueness is **store-enforced**, not merely probabilistic. Tokens are not reused after an invitation reaches a terminal state. This guarantees lookup determinism: a token resolves to exactly one invitation record, and actions on that token are unambiguous.

**Invariant 12 — Expiry is derived, never written.** No invitation record carries a stored [Expired] status or an `expired_at` field. An invitation's [Expired] condition is the value of the pure projection `effective_status(record, now) = Expired ⟺ (status = Pending ∧ now ≥ expires_at)`, computed at read time from the immutable [Expires At] and the injected clock [Now]. The clock is never read inside a transition, and no write fires when an invitation lapses. This is what lets single-resolution (Invariant 2) range over writes alone, and it removes the stored-flag-that-lags-the-clock failure mode (see [`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls).

Invariants 2 and 3 together give the *onboarding integrity* property — the identity binding at acceptance is trustworthy because it is produced by exactly one atomic write, never overwritten, and requires a non-null identity at call time. Invariant 4 (opaque invitee at initiation) is what makes Invitation usable before the invitee has a system identity. Invariants 5 and 12 together are what make the audit record informative: an external evaluator reading the invitation store can distinguish every stored resolution path and can compute the derived [Expired] status from [Expires At] and the read-time clock.

---

## Examples

### New employee onboarding — accept

An HR system initiates an invitation for a new hire:

`initiate(inviter_ref: hr_admin_h01, invitee_ref: null, context: "org::acme::dept::engineering", ttl: 604800) → invitation_token: tok_inv_g7h2k1`

[Invitee Ref] is null because the new hire does not yet have a system identity. The pipeline injects the seam clock — here `2026-09-01T09:14:00Z` — so [Initiated At] = [Now] and [Expires At] = [Initiated At] + 7 days.

The HR system emails the new hire a link embedding the token. On their first day, the new hire clicks the link and creates their account. The onboarding handler calls:

`accept(invitation_token: tok_inv_g7h2k1, accepting_identity_ref: user_u114) → accepted`

The pipeline injects the seam clock `2026-09-08T09:14:00Z`. The atom checks the stored [Status] = [Pending] and [Now] < [Expires At] (the 7-day window is still open), then transitions the invitation to [Accepted], recording `accepting_identity_ref: user_u114` and `accepted_at: 2026-09-08T09:14:00Z` (stamped from the injected [Now]). These fields are now immutable. The composing External Onboarding pattern proceeds: it creates a Party Identity record for user_u114, registers their credential, and issues their first session.

### Workspace collaboration — decline

A user receives an invitation to join a shared project workspace:

`initiate(inviter_ref: user_u91, invitee_ref: user_u55, context: "workspace::project-alpha", ttl: 172800) → invitation_token: tok_inv_p4q9r2`

The invitee sees the invitation in their notification panel and clicks "Decline":

`decline(invitation_token: tok_inv_p4q9r2) → declined`

The pipeline injects the seam clock `2026-10-15T11:22:00Z`. The atom transitions to [Declined], recording `declined_at: 2026-10-15T11:22:00Z`. The inviting user_u91 is notified that the invitation was declined. The invitation record is permanently [Declined] — it cannot be accepted, re-declined, revoked, or expired. Any subsequent action returns `already-resolved(Declined)`.

### Invitation revoked before use

An administrator initiates an invitation but then discovers the intended recipient should not be admitted:

`initiate(inviter_ref: admin_a01, invitee_ref: user_u77, context: "org::acme::role::contractor", ttl: 86400) → invitation_token: tok_inv_c2d8e3` *(seam clock `2026-06-30T07:00:00Z`)*

`revoke(invitation_token: tok_inv_c2d8e3, revoked_by_ref: admin_a01, reason: "contractor-engagement-cancelled") → revoked` *(seam clock `2026-06-30T08:00:00Z`)*

The atom transitions to [Revoked], recording [Revoked At], `revoked_by_ref: admin_a01`, and `revocation_reason: "contractor-engagement-cancelled"`. If the intended recipient had received the link and attempts to use it:

`accept(tok_inv_c2d8e3, accepting_identity_ref: user_u77) → rejected(already-resolved(Revoked))` *(seam clock `2026-06-30T09:00:00Z`)*

The window is still open ([Now] < [Expires At]), so this is not an `expired` rejection: the caller learns the invitation was [Revoked] — not merely lapsed or already accepted.

### Rejection paths

**[Accept] — `already-resolved(Accepted)` (concurrent attempt):** Two requests to accept the same invitation arrive simultaneously (both at seam clock `2026-09-08T09:14:00Z`). The first commits atomically: `accept(tok_inv_g7h2k1, user_u114) → accepted`. The second arrives microseconds later and finds stored [Status] = [Accepted]: `accept(tok_inv_g7h2k1, user_u115) → rejected(already-resolved(Accepted))`. User u115's attempt is rejected. The invitation is resolved to exactly one identity — user_u114. This is Invariant 2 in action.

**[Decline] — `expired` (derived):** An invitee receives an invitation but takes two weeks to decide, by which time the 7-day window has passed. They click "Decline":

`decline(invitation_token: tok_inv_p4q9r2b) → rejected(expired)` *(seam clock `2026-10-29T09:00:00Z`)*

The guard evaluates `is_expired(record, now)` — the stored [Status] is still [Pending] but [Now] ≥ [Expires At] — and returns `expired`. **Nothing is written**: the record stays stored-[Pending], [Declined At] stays null, and there is no `expired_at` field. A [Read] of the record now reports [Effective Status] = [Expired], derived from the immutable [Expires At] and the read-time clock. The invitation was not declined; its window simply closed.

### Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

**Regulator audit.** A HIPAA (Health Insurance Portability and Accountability Act) compliance officer asks *"can you prove that every user who accessed patient records joined via a documented, auditable invitation from an authorized administrator?"* The auditor queries the invitation store for all [Accepted] invitations with [Context] referencing the patient records system. Each accepted invitation record shows: [Inviter Ref] (the administrator who invited them), [Accepted At] (when they joined), and [Accepting Identity Ref] (the identity that was bound). Invariant 3 (acceptance binds identity) is the structural guarantee: every [Accepted] record has an immutable [Accepting Identity Ref] and an immutable [Inviter Ref]. The auditor can trace every current system user back to the specific invitation — and the specific administrator — that admitted them. No participant entered the system without a documented invitation.

**Disputed onboarding.** A former employee claims *"I never accepted an invitation to this system — my account was created without my knowledge."* The investigator queries the invitation store for invitations with [Accepting Identity Ref] matching the employee's identity. The query finds one: `status: Accepted`, `accepted_at: 2026-03-15T10:42:00Z`, `invitation_token: tok_inv_e5f6g7`. Invariant 2 (single-resolution) means there is exactly one resolved invitation for this identity. The record shows when the token was presented and the acceptance was committed. Whether the former employee personally clicked the link or whether someone else acted with their token is outside the atom's scope — the atom records that a bearer of `tok_inv_e5f6g7` presented the invitation at `10:42Z` on that date and supplied `accepting_identity_ref: user_u114`. The composing External Onboarding pattern's Audit Trail records the surrounding context (what device, what IP, what credential was registered) which the investigator pursues separately.

**Breach investigation.** A security team discovers that invitation tokens for a high-security system were exposed in a system log between `2026-11-01` and `2026-11-07`. They query the invitation store for all invitations with [Initiated At] in that window and [Context] referencing the high-security system, reading each record's [Effective Status] against the investigation-time clock. The query returns 12 invitations. Five are [Accepted] (the team verifies these acceptances were legitimate by cross-referencing the [Accepting Identity Ref] values against known employees). Four read [Pending] and are still within their window — the team [Revoke]s these immediately. Two read [Expired] — still stored-[Pending] but past their window, so no write ever occurred and none is needed (any [Accept] on them is rejected `expired`). One is [Declined]. Invariants 5 and 12 (three distinct stored terminals plus the derived [Expired]) make this triage possible from the store alone: each record's stored status and fields, plus the read-time [Effective Status], tell the team exactly what happened to it.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Downstream provisioning.** The atom records that an invitation was accepted and by whom. It does not create a Party Identity record, register a Credential, issue a Session, grant Permissions, or take any other action in response to acceptance. All of that is the composing External Onboarding pattern's responsibility. The invitation record is the trigger and the audit anchor; the provisioning steps are the composing pattern's wiring.
- **Invitee notification.** The atom does not send emails, push notifications, or any other communications to the invitee. Delivering the [Invitation Token] to the invitee is the caller's responsibility. The atom produces the token; the delivery channel is outside its scope.
- **Who-may-invite-whom policy.** Whether a given [Inviter Ref] is authorized to invite participants to the given [Context] is governed by the composing pattern's policy layer. The atom records whatever [Inviter Ref] is supplied; it does not validate the inviter's authority.
- **Invitee-vs-accepting-identity matching.** The atom does not validate that [Accepting Identity Ref] matches [Invitee Ref]. A composing pattern that requires matching (e.g., the invitation was addressed to a specific external email, and the accepting party must prove control of that email) enforces this constraint above the atom layer.
- **Re-invitation after declination or lapse.** If an invitee declines (or lets the window lapse) and the inviting actor wants to try again, the actor calls [Initiate] again to create a new invitation. The original record remains in the store as immutable history — a [Declined] stored terminal, or a still-[Pending] record that simply reads [Expired]. The atom provides no "re-open" action.
- **Invitation transfer.** The atom does not model passing an invitation from one potential invitee to another. The [Invitation Token] is a bearer credential; whoever presents it to [Accept] becomes the [Accepting Identity Ref]. Whether this is acceptable in a given deployment is a policy decision for the deployment layer. Composing patterns that prohibit transfer may validate [Invitee Ref] against [Accepting Identity Ref] before calling [Accept].
- **Multi-use invitations.** Each invitation is single-use: [Accept] resolves it permanently. A "team invitation link" that many people can follow is not an Invitation in this atom's sense — it is a Capability (atom #13) with `max_redemptions = N` and a `scope` that encodes the team onboarding action. Each redemption of the Capability triggers a separate Invitation [Initiate] + [Accept] sequence for that specific invitee.
- **Identity proofing.** The atom records who accepted the invitation but does not verify the accepting identity's real-world credentials (government ID, professional license, liveness check). Identity proofing belongs to Party Identity and the Customer Onboarding composition. The invitation establishes *that* someone joined via a documented channel; it does not establish *who they really are*.
- **Clock accuracy and the injected clock.** The write timestamps [Initiated At], [Accepted At], [Declined At], and [Revoked At] are stamped from the **injected** clock [Now] (the pipeline's `clock_t`), never read inside a transition; the same injected [Now] drives the pure expiry derivation and [Read]'s [Effective Status]. The atom assumes a single deployment clock; clock skew, monotonicity, and timezone normalization are deployment concerns. Trusted timestamping (RFC 3161 — the Internet standard "Request for Comments" document 3161 defining a trusted time-stamping protocol) is a composing pattern for deployments requiring externally verifiable timestamps. Because expiry is *derived* rather than stamped, two readers evaluating [Effective Status] with slightly skewed clocks near [Expires At] may briefly disagree on whether a record is [Expired] — the standard read-time-derivation consequence, bounded by the deployment's clock-skew envelope and harmless because no write is at stake.
- **Invitation store tamper-evidence.** Composing with Tamper Evidence provides cryptographic proof that no invitation record was retroactively altered — useful in regulated deployments where the [Inviter Ref] and [Accepting Identity Ref] fields are used as legal evidence.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Initiate

The behavior that issues a new invitation. It assigns a fresh [Invitation Token], records [Inviter Ref], [Invitee Ref] (optional), [Context], [Initiated At] = [Now], and [Expires At] = [Now] + [TTL], and returns the [Invitation Token] (or a rejection). The record enters [Pending].

Kind: Operation

#### Accept

The write that resolves a [Pending] invitation to [Accepted], binding [Accepting Identity Ref] and stamping [Accepted At]. Permitted only when stored [Status] = [Pending] and [Now] < [Expires At] (else `expired`); a stored-resolved invitation returns `already-resolved(state)`. Returns `accepted`.

Kind: Operation

#### Decline

The write that resolves a [Pending] invitation to [Declined], stamping [Declined At]. Records no identity — a deliberate refusal, distinct from non-use. Same [Pending]-and-unexpired guard as [Accept]. Returns `declined`.

Kind: Operation

#### Revoke

The write that withdraws a [Pending] invitation, resolving it to [Revoked] and recording [Revoked By Ref], [Revocation Reason], and [Revoked At]. Same [Pending]-and-unexpired guard. Returns `revoked`.

Kind: Operation

#### Read

The read-only behavior that returns invitation records matching a `filter`. Each record carries its stored fields plus the derived [Effective Status]; it fires no transition and writes nothing. The only surface that surfaces the derived [Expired].

Kind: Operation

#### Invitation Token

The opaque, cryptographically random, immutable, system-generated identity of an invitation record — the injected `id_t`, produced by [Initiate]. It is both the record's identity and the bearer credential the invitee presents to [Accept] or [Decline]. Store-unique, never reused (Invariant 11).

Kind:     Field
Field of: Invitation
Projects: invitation_token

#### Inviter Ref

The opaque reference to the actor issuing the invitation. Set on [Initiate], immutable; non-null required. The atom does not validate the inviter's authority.

Kind:     Field
Field of: Invitation
Projects: inviter_ref

#### Invitee Ref

The optional opaque reference to the intended invitee. May be null at [Initiate] — the invitee may have no system identity yet. Set immutably when supplied; never validated against [Accepting Identity Ref] (Invariant 4).

Kind:     Field
Field of: Invitation
Projects: invitee_ref

#### Context

The opaque descriptor of what the invitee is being invited to join (organization, workspace, role). Set on [Initiate], immutable, interpreted by the composing pattern; non-null required.

Kind:     Field
Field of: Invitation
Projects: context

#### Initiated At

The wall-time [Initiate] was called, stamped from the injected [Now]. Immutable.

Kind:     Field
Field of: Invitation
Projects: initiated_at

#### Expires At

The absolute deadline, computed once at [Initiate] as [Now] + [TTL] and stored. Immutable, never null (Invariant 9). The sole stored input to the expiry derivation; there is no stored [Expired] flag or `expired_at` field.

Kind:     Field
Field of: Invitation
Projects: expires_at

#### Status

The **stored** status — [Pending], [Accepted], [Declined], or [Revoked]. Set to [Pending] on [Initiate]; immutable once written to a terminal. [Expired] is **not** a value of this field — it is the derived [Effective Status], never stored.

Kind:     Field
Field of: Invitation
Projects: status

#### Accepting Identity Ref

The identity bound at acceptance — supplied to [Accept] and recorded permanently. Null until [Accept] fires; immutable once set (Invariant 3). Non-null required at [Accept].

Kind:     Field
Field of: Invitation
Projects: accepting_identity_ref

#### Accepted At

The timestamp the invitation transitioned to [Accepted], stamped from the injected [Now]. Null otherwise; immutable once set.

Kind:     Field
Field of: Invitation
Projects: accepted_at

#### Declined At

The timestamp the invitation transitioned to [Declined], stamped from the injected [Now]. Null otherwise; immutable once set.

Kind:     Field
Field of: Invitation
Projects: declined_at

#### Revoked At

The timestamp the invitation transitioned to [Revoked], stamped from the injected [Now]. Null otherwise; immutable once set.

Kind:     Field
Field of: Invitation
Projects: revoked_at

#### Revoked By Ref

The opaque reference to the actor withdrawing the invitation. Set at [Revoke]; non-null required (Invariant 8); immutable once set.

Kind:     Field
Field of: Invitation
Projects: revoked_by_ref

#### Revocation Reason

The caller-supplied reason for revocation — written from the [Reason] parameter. Set at [Revoke]; non-null required (Invariant 8); immutable once set.

Kind:     Field
Field of: Invitation
Projects: revocation_reason

#### Effective Status

The derived status [Read] surfaces: [Expired] when [Status] = [Pending] ∧ [Now] ≥ [Expires At], otherwise the stored [Status]. A pure projection over the record and the injected [Now]; **never stored** (Invariant 12).

Kind:     Field
Field of: Invitation
Projects: effective_status

#### TTL

The duration [Initiate] consumes to compute [Expires At] = [Initiated At] + [TTL]. Must be positive if supplied; null uses the deployment default. Not stored under this name — only the resulting [Expires At] persists.

Kind:         Parameter
Parameter of: Initiate
Projects:     ttl

#### Reason

The required, non-empty reason string [Revoke] consumes — written into [Revocation Reason]. Not stored under this name; an empty or whitespace-only value is rejected [Invalid Request].

Kind:         Parameter
Parameter of: Revoke
Projects:     reason

#### Now

The current clock reading the pipeline consumes — the injected `clock_t`, supplied at the I/O seam, never read inside a transition and never a signature parameter. It stamps the immutable write timestamps ([Initiated At], [Accepted At], [Declined At], [Revoked At]) and drives the pure expiry derivation in guards and [Read] (no write).

Kind:         Parameter
Parameter of: Initiate
Projects:     now

#### Pending

The only non-terminal stored [Status]: the invitation has been issued and awaits resolution. A [Pending] record past [Expires At] reads [Expired] by derivation but stays stored-[Pending] (no write).

Kind:      Member
Member of: the invitation status
Role:      Outcome

#### Accepted

The stored terminal [Status] of an accepted invitation. Carries [Accepting Identity Ref] and [Accepted At]; admits no further write (Invariant 2).

Kind:      Member
Member of: the invitation status
Role:      Outcome

#### Declined

The stored terminal [Status] of a deliberately refused invitation — a recorded human decision, distinct from non-use. Carries [Declined At]; admits no further write (Invariant 2).

Kind:      Member
Member of: the invitation status
Role:      Outcome

#### Revoked

The stored terminal [Status] of an invitation withdrawn before resolution. Carries [Revoked At], [Revoked By Ref], and [Revocation Reason]; admits no further write (Invariant 2).

Kind:      Member
Member of: the invitation status
Role:      Outcome

#### Expired

The **derived** status (never stored) of a still-[Pending] record whose [Expires At] has lapsed against the evaluating clock. Computed by the [Effective Status] projection; a write on it is rejected `expired`, writing nothing (Invariant 12).

Kind:      Member
Member of: the invitation status
Role:      Outcome

#### Invalid Request

The rejection [Initiate], [Accept], or [Revoke] returns when request fields fail — an empty/whitespace [Inviter Ref], [Context], [Accepting Identity Ref], [Revoked By Ref], or [Reason]; or a non-positive [TTL] with no configured default.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Not Known

The rejection [Accept], [Decline], or [Revoke] returns when the presented [Invitation Token] references no record in the store.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Storage Failure

The rejection any writing action returns when a durable write fails after preconditions pass. All-or-none: no partial record is observable; the record remains [Pending] (Invariant 10).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Initiate]: #initiate
[Accept]: #accept
[Decline]: #decline
[Revoke]: #revoke
[Read]: #read
[Invitation Token]: #invitation-token
[Inviter Ref]: #inviter-ref
[Invitee Ref]: #invitee-ref
[Context]: #context
[Initiated At]: #initiated-at
[Expires At]: #expires-at
[Status]: #status
[Accepting Identity Ref]: #accepting-identity-ref
[Accepted At]: #accepted-at
[Declined At]: #declined-at
[Revoked At]: #revoked-at
[Revoked By Ref]: #revoked-by-ref
[Revocation Reason]: #revocation-reason
[Effective Status]: #effective-status
[TTL]: #ttl
[Reason]: #reason
[Now]: #now
[Pending]: #pending
[Accepted]: #accepted
[Declined]: #declined
[Revoked]: #revoked
[Expired]: #expired
[Invalid Request]: #invalid-request
[Not Known]: #not-known
[Storage Failure]: #storage-failure

---

## Composition notes

Invitation is freestanding. It is the onboarding-lifecycle constituent of External Onboarding:

- **[Party Identity](./party-identity.md)** — Party Identity is the persistent verifiable identity record of an external party. Invitation is the gate through which that party enters the system. External Onboarding wires them: an Invitation is accepted, supplying [Accepting Identity Ref], and a Party Identity record is created for that reference. Without Invitation, the library has no structured account of how an external party came to be in the system at all.
- **[Credential](./credential.md)** — in External Onboarding, credential registration follows acceptance. The [Accepting Identity Ref] from the Invitation is the `principal_ref` passed to `Credential.register`. The Invitation record is the audit anchor that traces the credential back to the specific invitation event.
- **[Actor Identity](./actor-identity.md)** — in regulated deployments, the [Accept] call may be paired with an Actor Identity `attest` call to produce a non-repudiable record that the accepting identity committed to the acceptance. The [Inviter Ref] is similarly attestable at [Initiate] time.
- **[Audit Trail](../compositions/audit-trail.md)** — in regulated deployments, [Initiate], [Accept], [Decline], and [Revoke] events should be recorded in the Audit Trail. The atom does not mandate this; it is the composing External Onboarding pattern's obligation.
- **[Tamper Evidence](./tamper-evidence.md)** — the invitation store, including the [Inviter Ref], [Accepting Identity Ref], and [Revoked By Ref] fields, should be hash-chained for regulated deployments where invitation records serve as legal evidence.
- **Capability** *(atom #13, grounded)* — Capability and Invitation share bearer-token transport but are structurally distinct. A Capability is for resource access; an Invitation is for identity onboarding. The structural difference: Invitation carries [Declined] as a named terminal state (a deliberate human refusal, not mere non-use) and binds an identity at acceptance. Capability has neither. See the Open taxonomy question in roadmap.md for the full Capability-vs-Invitation design boundary. The authoring discipline: Capability was drafted first (atom #13); this spec was written using Capability as the Pass 2 mirror to confirm the two atoms cannot be collapsed.
- **[External Onboarding](../compositions/external-onboarding.md)** — the composition that wires Invitation acceptance to Party Identity creation, Credential registration, and Audit Trail attestation. The load-bearing emergent invariant is invitation-gates-enrollment: no Party Identity is created unless `Invitation.accept` precedes it in the same `onboard` call, and the `onboarding.completed` Audit Trail event names the invitation token, accepting identity reference, party record, and credential in one tamper-evident entry.

---

## Standards references

- **GDPR (EU General Data Protection Regulation — the European Union's data-privacy law) Articles 6 and 7 (Lawful Basis and Consent for Processing)** — the [Initiate] call creates a processing record: the system now holds the [Invitee Ref] and will process data on behalf of or about the invitee if they accept. The [Initiated At] and [Inviter Ref] fields constitute the processing-event record the GDPR requires. The [Accept] call — and the [Accepting Identity Ref] bound at that moment — is the record of the data subject's active engagement with the system. The invitation record is the lawful-basis evidence for the processing that follows onboarding.
- **HIPAA §164.312(a)(1) (Access Control)** — invitation-based user provisioning is a covered access-granting mechanism. The [Inviter Ref] (the authorized administrator who granted access) and [Accepting Identity Ref] (the identity that gained access) are the access-control audit record.
- **SCIM 2.0 (System for Cross-domain Identity Management — RFC 7644)** — SCIM's `POST /Users` with an invite flow maps to the Invitation → External Onboarding arc. The [Invitee Ref] in the invitation corresponds to the SCIM user's external identity reference; the [Accepting Identity Ref] corresponds to the provisioned SCIM user ID.
- **SOC 2 CC6.2 (Prior to Issuing System Credentials, New Internal and External Users Are Registered and Authorized)** — the invitation record is the registration and authorization event SOC 2 CC6.2 requires. [Inviter Ref] is the authorizing party; [Accepted At] and [Accepting Identity Ref] are the registration event.
- **NIST (National Institute of Standards and Technology — US federal standards body) SP 800-63A (Digital Identity Guidelines — Enrollment and Identity Proofing)** — the enrollment event at which an applicant registers with an identity system maps to the Invitation → accept arc. The atom models the enrollment record; identity proofing (NIST 800-63A's primary subject) is Party Identity's surface and is not in scope here.

Standards anchoring for Invitation is lighter than for Credential, Session, or Capability, consistent with the ROADMAP entry: the atom earns its keep on EOS Pass 2 conceptual independence — the [Declined] state, the single-resolution invariant, and the identity-binding-at-acceptance are what justify a separate atom rather than folding Invitation into Capability.

Inherited from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of separating the lifecycle record of an invitation (this atom) from the provisioning steps that follow acceptance (composing patterns).
- **Grace Commons regulated-atom conventions** — *Regulated adversarial scenarios* and *Generation acceptance* inherited from [`pressure-testing.md`](../pressure-testing.md), not re-derived from predecessor atoms.

---

## Generation acceptance

A derived implementation of Invitation is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the invitation record store (and the read-time clock the `read` surface uses), can do all of the following without recourse to source code, runbooks, or developer narration:

- **Confirm single-resolution by write for every invitation.** For every record in the store, confirm that **at most one** stored terminal-state timestamp is non-null ([Accepted At], [Declined At], or [Revoked At]) — never more than one. A record with two non-null terminal timestamps is evidence of a double-resolution defect. A record with none is stored-[Pending] (and reads [Expired] when [Now] ≥ [Expires At]). Invariant 2 is the structural guarantee.
- **Confirm expiry is derived, never stored.** Confirm that **no** record carries a stored [Expired] status value or an `expired_at` field. For any stored-[Pending] record, the auditor computes `effective_status = Expired ⟺ now ≥ expires_at` from the immutable [Expires At] and the read-time clock — reproducing exactly what [Read] returns. Invariant 12 is the guarantee; a stored [Expired], or an `expired_at` column, is a defect.
- **Confirm identity binding completeness for accepted invitations.** For every record with [Status] = [Accepted], confirm that [Accepting Identity Ref] and [Accepted At] are both non-null. An [Accepted] record with a null [Accepting Identity Ref] violates Invariant 3 and is evidence of a defect. Determine from the record alone who accepted each invitation.
- **Confirm the stored terminals are structurally distinct.** Verify that [Accepted] records have non-null [Accepting Identity Ref] and [Accepted At]; [Declined] records have non-null [Declined At]; [Revoked] records have non-null [Revoked At], [Revoked By Ref], and [Revocation Reason]. No two stored terminals should be indistinguishable from the record alone. Invariant 5 is the structural guarantee.
- **Confirm revocation attribution completeness.** For every record with [Status] = [Revoked], confirm that [Revoked At], [Revoked By Ref], and [Revocation Reason] are all non-null. Determine from the record who revoked each invitation and why. Invariant 8 is the guarantee.
- **Reconstruct the invitation arc for any context.** Given a [Context] value (e.g., an organization or workspace identifier), query all invitation records for that context. The records should tell the complete story: how many invitations were issued, by whom ([Inviter Ref]), how each resolved (stored [Status], or the derived [Expired] for lapsed [Pending] records), who accepted ([Accepting Identity Ref]), and when. This reconstruction requires no data beyond the invitation store and the read-time clock.

---

## Status

`grounded on Final Critique 5 — 2026-06-23` — the **execution/render-time refactor** is complete and the closing fresh-reader Final Critique (Final Critique 5) returned clean. The stored `Expired` state, the `expired_at` field, the `expire` action, and all lazy-expiry writes were removed; `Expired` is now a derived `effective_status` projection computed at read time from the injected clock and the immutable `expires_at` (Invariant 12). The clock `now` is **pipeline-injected at the I/O seam** (not an action parameter — the 2026-06-21 now-explicit-signatures experiment was reverted per the Final Critique council on 2026-06-23) and consumed only by pure derivations (guards and `read`) and timestamp stamps (writes). The formal layer's foundational findings (bound saturation, the vacuous Invariant 12 check, the single-resolution over-claim) were fixed on 2026-06-23 and the coverage cross-check is clean (see Lineage). Prior grounding: `grounded on Final Critique 4 — 2026-05-19` (formal layer landed 2026-06-03 — TLA+ `invitation.tla` + buggy twin verified). See Lineage §Execution/render-time refactor and §Final Critique 5.

*Classification (post-flatten): stored flat as `atoms/invitation.md` — no category folder. Invitation is an identity-onboarding lifecycle primitive with meaningful non-regulated uses (wherever invitation-based onboarding is used), so its **regulated** and **security** classifications are overlays derived from its composers, not a folder it is filed under. This resolves the atom's former provisional `compliance/` placement and the question of relocating it to an identity folder: under the [usage-derived taxonomy](./TAXONOMY.md), `security` is an overlay it carries (derived from its identity/access standards), not a domain or a directory.*

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

**Conventions inherited.** This atom carries the **regulated** and **security** overlays (both derived from its composers) and includes *Regulated adversarial scenarios* and *Generation acceptance* from the first draft, per the methodology inherited from [`pressure-testing.md`](../pressure-testing.md). These conventions are inherited from the methodology directly, not re-derived from any predecessor atom.

---

**Round 1 — Pass 1 (GRID structural).** Four findings.

*F1 — `accept`, `decline`, and `revoke` missing `storage-failure`.* All three write to the store but their signatures and Decision points omitted `storage-failure`. Fixed: signatures updated to include `storage-failure`; Decision points for `accept`, `decline`, and `revoke` each gained a terminal clause — "If the store write fails, `storage-failure`; the record remains `Pending`."

*F2 — `expire` missing `storage-failure`, `invalid-request`, and pre-expiry check.* `expire` wrote to the store (missing `storage-failure`) and had no guard against being called before `expires_at` has passed (missing `invalid-request`). Fixed: signature updated to `→ expired | rejected(invalid-request | not-pending | not-known | storage-failure)`; Decision points gained: "If `now < expires_at`, the invitation has not yet reached its expiry window: `invalid-request`. Only an invitation whose `expires_at` has passed may be expired. A caller wishing to end a `Pending` invitation before its natural expiry should use `revoke`."

*F3 — Token uniqueness invariant missing.* No invariant stated that `invitation_token` values are globally unique across the system's lifetime and non-reusable after terminal resolution. Fixed: Invariant 11 added: "No two invitation records share an `invitation_token` across the lifetime of the system. Tokens are not reused after an invitation reaches a terminal state."

*F4 — `revoke` Decision points inconsistent with State section on lazy expiry.* State section (line 112) stated that lazy expiry fires at `accept`, `decline`, or `revoke`, but `revoke`'s own Decision points omitted the expiry check. An implementer reading Decision points alone would not fire lazy expiry at `revoke`. Fixed: `revoke` Decision points gained: "A token whose `expires_at` has passed is treated as terminal: `revoke` returns `already-resolved(Expired)` and may lazily transition the record to `Expired`." Behavior section updated to state: "Lazy expiry extends this: if the invitation is `Pending` but `now >= expires_at`, the resolving action (`accept`, `decline`, or `revoke`) returns `already-resolved(Expired)` and may atomically write the `Expired` terminal transition as a housekeeping side-effect."

**Round 1 — Pass 2 (EOS conceptual independence).** Clean. State, Behavior, and Invariants fully freestanding. Composition notes and Intent name other atoms for scope-delimitation only.

**Round 1 — Pass 3 (Linus adversarial).** No additional findings beyond F1–F4.

---

**Round 2 — Pass 1 (GRID structural).** Clean. All nine MUSE (the completeness framework, version 1.1, GRID's nodes are drawn from) nodes fully resolved after Round 1 fixes.

**Round 2 — Pass 2 (EOS conceptual independence).** Clean.

**Round 2 — Pass 3 (Linus adversarial).** Clean. No foundational gaps. One refining observation noted: Invariant 5 names which timestamp fields are non-null for each terminal state but does not explicitly state that the other terminal timestamp fields must remain null. Combined with Invariant 1 (resolution fields immutable once set) and Invariant 2 (single-resolution), the correctness is adequate; the gap is rhetorical, not structural.

---

**Round 3 — Pass 1 (GRID structural).** Clean.

**Round 3 — Pass 2 (EOS conceptual independence).** Clean.

**Round 3 — Pass 3 (Linus adversarial).** Clean.

---

**Final Critique (Round 4 — Super Torvalds).** One foundational finding.

*Final Critique 1 — `decline` Decision points used implicit cross-reference for expiry check.* `decline`'s Decision points said "Expiry check applies as above" — a reference to `accept`'s expiry check. An auditor reading only `decline`'s Decision points received no expiry logic. Fixed: `decline` Decision points now state the check explicitly inline: "If `status = Pending` and `now >= expires_at`, the atom treats the invitation as expired. It may lazily transition to `Expired` at this point and return `already-resolved(Expired)`." The implicit cross-reference is removed.

Final Critique 4 closed clean after Final Critique 1 fix.

**Structural decisions made in draft.**

- *`Declined` is a named terminal state.* The atom could have treated declination as the invitee simply not accepting (i.e., letting the invitation expire). It does not. `Declined` is a deliberate, named terminal state because a human's active refusal is semantically different from passive non-use, and the audit record should be able to distinguish them. This is the primary EOS Pass 2 distinction from Capability (which has no `declined` state).
- *`decline` takes no identity argument.* The declining actor's identity is not recorded. Rationale: the invitation is a bearer token; the atom cannot verify that the decliner is the intended invitee; recording an unverified identity on the declination record would create false confidence. Composing patterns that need to record who declined may do so. The atom records only the fact of declination and the timestamp.
- *`invitee_ref` is nullable.* The atom permits initiating an invitation without a known system identity for the invitee, because this matches the most common real-world scenario: an invitation is sent to an email address before the person has a system account. Forcing non-null `invitee_ref` would require a two-step process (create a placeholder identity, then invite) that belongs to the composing pattern, not the atom.
- *`already-resolved(state)` carries the terminal state.* The rejection includes the specific terminal state so the caller knows what resolution occurred, not just that the invitation is no longer actionable. This is load-bearing for concurrent acceptance handling: the second concurrent `accept` call learns that the invitation is already `Accepted` (not `Declined` or `Revoked`), and the composing External Onboarding pattern can proceed with the appropriate response.
- *EOS Pass 2 confirmation against Capability.* This spec was written with Capability (atom #13) as the explicit Pass 2 mirror. The question was: can Invitation be specified without naming Capability? Yes — the atom's state machine, actions, and invariants are fully specified without referencing Capability. The distinction (`Declined` state, identity binding at acceptance) is internal to Invitation's own specification. The two atoms do not collapse.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 2 (single-resolution — check-and-commit Pending→terminal must be atomic under concurrent accept/decline/revoke) is a concurrency-safety claim. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`invitation.tla`](./invitation.tla) + config [`invitation.cfg`](./invitation.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* one invitation, `state` in {Pending, Accepted, Declined, Expired, Revoked}; the load-bearing **Invariant 2** (single-resolution — exactly one transition out of Pending, immutable thereafter) via a ghost `resolution` recording the first terminal reached: `Inv_SingleResolution == resolution # none ⇒ state = resolution`. Each resolving action guards on `state = Pending`, so under concurrent accept/decline/revoke the first interleaved winner resolves and every later attempt is disabled (the already-resolved rejection). Exhaustive: 5 states, holds. *Buggy twin* [`invitation-buggy.tla`](./invitation-buggy.tla) drops the Pending guard on `Accept`, allowing an already-resolved invitation to be re-resolved; rejected at 6 states (Decline → AcceptBuggy → state Accepted while resolution Declined). *Out of model scope:* identity binding at accept, field validation, id discipline. *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

---

**Execution/render-time refactor — 2026-06-21 (touch-triggered; status downgraded to `partially resolved`).** Direction (Scott): *derive expiry at read time; reduce execution-time clock dependence; clearly mark the residual.* This atom is the **reference case** for a corpus-wide sweep of clock-gated atoms. Changes:

- *Stored `Expired` removed; expiry derived.* Stored terminals are now `Accepted`, `Declined`, `Revoked`. `Expired` is a derived `effective_status` projection — `Expired ⟺ status = Pending ∧ now ≥ expires_at` — computed at read time from the immutable `expires_at` and the injected clock. New **Invariant 12**. Applies the "derive the idealization, do not lag it with a flag" pitfall ([`pressure-testing.md`](../pressure-testing.md) §Formal-model authoring pitfalls) to the canonical English.
- *`expired_at` field, `expire` action, and all lazy-expiry writes removed.* Expiry never writes. A write attempted on a lapsed invitation is rejected with the new `expired` reason — distinct from `already-resolved(state)`, which now names only the three stored terminals.
- *Clock confined to two pipeline-injected uses.* The clock (the pipeline's `clock_t`) is injected at the I/O seam and consumed only by (a) pure expiry derivations in guards and in `read` (no write) and (b) immutable timestamp stamps inside committed transitions. Closes the rescan's **INV-1** (hidden clock in the lazy-expiry guard). *(The 2026-06-21 draft threaded `now` into the action signatures to make this explicit; that experiment was reverted on 2026-06-23 — see the resolved design point below.)*
- *Token-uniqueness mechanism named (rescan **INV-2**).* Invariant 11 now states uniqueness is store-enforced (a write reusing a token is rejected `storage-failure`), not merely probabilistic.
- *Sections updated:* summary blockquote, Intent, Summary, Identity model, Inputs/Outputs (+ a `read` surface with `effective_status`), State, Decision points (+ Logic-confinement note and rejection priority), Behavior, Feedback, Invariants 1/2/5/6/7/9/11 reworded and 12 added, Examples, Edge cases, Generation acceptance.
- *Design point RESOLVED — 2026-06-23 (now-explicit experiment reverted per FC council).* The 2026-06-21 draft threaded `now` into the action **signatures** to make injection explicit; this deviated from the corpus convention of leaving `clock_t` pipeline-implicit (Selective Disclosure does not show it; the sibling Capability atom reverted the same way on 2026-06-23). The Final Critique council ruled: **revert**. The execution contract injects `clock_t`/`id_t` at the I/O seam (Step 3); they are not action parameters. `now` was removed from every action signature (`initiate`/`accept`/`decline`/`revoke`) and from the read surface (`read(filter, now)` → `read(filter)`); all `now:` arguments were stripped from the Examples; the Flow call sites and Decision-points headers now match the parameter-free signatures (FC F4). The derived-expiry design is unchanged — the clock is still injected and consumed by the pure expiry guard and the timestamp stamps, now described as pipeline-injected in the reworded "Logic confinement (clock and id)" note rather than as signature parameters. `read` is also now named in the State section's render-time surface (FC F5).
- *Constituent-change cascade:* removing the `expire` action and the stored `Expired` value is a **breaking** change to Invitation's surface. External Onboarding and any composition naming Invitation require a touch-triggered re-pass.
- *Formal model:* `invitation.tla` + buggy twin re-derived to the new shape (expiry derived from a clock variable; single-resolution over the three stored terminals; no `Expire` write) and re-run through `tools/harness/check.mjs`: the correct model holds (16 states, all invariants), and the buggy twin (drops the `Pending` guard → re-resolution) is rejected (`Inv_SingleResolution` violated, 7 states).

- *Formal-layer foundational fixes — 2026-06-23 (fresh-reader Final Critique, three findings closed).* The re-derived model carried three formal-layer defects, now fixed in `invitation.tla`/`.cfg` (the English signatures were untouched by these — they are model-layer fixes):
  - **F1 — bound now saturates.** The clock previously advanced to `MaxClock` (`Tick == now < MaxClock`), so the reachable state count grew without bound (16 → 28 → 44 states at `MaxClock = 3 → 6 → 10`). `Tick` is now clamped at `ExpiresAt + 1` — one tick past the deadline is the only behaviorally-distinct lapsed value — so exploration saturates: the model holds at **16 states** for `MaxClock ∈ {3, 6, 10, 20}`. `invitation.cfg` sets `MaxClock = 6` (> the clamp) and records the real saturation point (16 states, reachable clock `{0,1,2,3}`) as a comment.
  - **F2 — Invariant 12 now checked non-vacuously.** `Inv_DerivedExpiryCoherent`'s antecedent excludes Pending, so the *positive* derivation (a lapsed Pending record reads `Expired`) was asserted only vacuously. Added `Inv_LapsedReadsExpired == Lapsed(now) => EffStatus(now) = "Expired"` (antecedent reachable, so it bites) to `invitation.tla` and Safety. A second isolated twin `invitation-buggy-derivation.tla` breaks the derivation (`BrokenEffStatus` echoes the stored `state`, never `Expired`) and is rejected on this check at **9 states** — proving the new invariant is not vacuous.
  - **F3 — single-resolution coverage no longer over-claimed.** The model verifies single-resolution as *post-write immutability* (`resolution` never changes once set), not concurrent check-and-commit atomicity. The Lineage/coverage language is corrected: check-and-commit-under-contention is a runtime-serialization obligation (Execution Contract sequence-safety class), recorded as by-construction / out-of-scope in the coverage matrix — not stated as covered concurrency.
  - *Twins:* two isolated buggy twins, one per load-bearing invariant — `invitation-buggy.tla` (Inv 2, rejected at 7 states) and `invitation-buggy-derivation.tla` (Inv 12 positive derivation, rejected at 9 states). Both auto-discovered and required-to-reject by `audit.mjs`.
  - *Coverage matrix:* refreshed at [`tools/harness/coverage/invitation.md`](../tools/harness/coverage/invitation.md) — one row per Invariant 1–12, constructs cited, with the bound-saturation line. The full coverage cross-check and bound-saturation review (which rode the pending re-pass) are now complete.

**Final Critique 5 — 2026-06-23 — clean (fresh-reader re-gate; council-run).** Closing fresh-reader Final Critique (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus at X2) over the execution/render-time refactor batch returned **zero foundational findings**. Formal model re-verified green in the harness, buggy twin(s) rejected, coverage cross-check clean (no GAP rows), bound saturated. Regrounded at Final Critique 5.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, single-resolution/derived-expiry discipline, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (30 terms): 5 Operations ([Initiate], [Accept], [Decline], [Revoke], [Read]); 14 Fields ([Invitation Token], [Inviter Ref], [Invitee Ref], [Context], [Initiated At], [Expires At], [Status], [Accepting Identity Ref], [Accepted At], [Declined At], [Revoked At], [Revoked By Ref], [Revocation Reason], and the derived-never-stored [Effective Status] — all "Field of: Invitation", no separate Type card, mirroring the capability/credential reference cases); 3 Parameters ([TTL], [Reason], and the seam-injected [Now]); 8 Members ([Pending], [Accepted], [Declined], [Revoked] stored statuses + the derived [Expired]; [Invalid Request], [Not Known], [Storage Failure] rejections). Survivors left backticked: the one labeled projected-contract signature per Operation; the success tags (`accepted`, `declined`, `revoked`); the parameterized rejections (`expired`, `already-resolved(state)` / `already-resolved(Accepted|Declined|Revoked)` — kept literal to avoid a markdown-link collision with the trailing `(...)`); the `is_expired(...)` / `effective_status(...)` predicate definitions; `clock_t`/`id_t`; the non-existent `expire`/`expired_at`; concrete example calls, tokens, ids, and timestamps; Capability's `max_redemptions`/`scope` and Credential's `principal_ref`/`Credential.register`; model filenames; and dated Status/Lineage registers. (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each of its claims is carried by Summary/Intent/State/Invariants; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the densest Summary run-on split into one-idea sentences, lossless. (e) **prose cut #5** — the State transition list rendered as a transition table (action / from / to / guard / stamps / result), with the single-resolution precedence, atomicity, and derived-expiry-writes-nothing semantics kept in the prose bullets beside it. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 5 — 2026-06-23`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (30 terms); 12 invariants preserved; `.tla`/`.cfg` untouched — harness re-run green: `invitation.tla` PASS (16 states), `invitation-buggy.tla --buggy` rejected (Inv 2 @7), `invitation-buggy-derivation.tla --buggy` rejected (Inv 12 positive derivation @9).

</details>
