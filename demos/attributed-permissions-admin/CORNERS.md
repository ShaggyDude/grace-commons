# CORNERS.md — Implementation findings

Preferences and judgment calls made during the build. Cases where the spec was
silent or admitted multiple readings. Contradictions *within the spec itself*
go to the spec's Lineage notes via the standard review channel — not here.
See `../README.md` and `../../CLAUDE.md` for that methodology.

---

## The three intentionally-failing Alloy checks

The Alloy model (`alloy/attributed-permissions-admin.als`) contains three
assertions that **are expected to produce counterexamples** when Invariant 7 is
not yet asserted as a fact. They are included deliberately to document the gap
the model exposed.

### `check Grant_Attribution_Injective for 5`

**What it checks:** that no two grants share the same issuance attestation
(`lone` inverse in Alloy: `all a : Attestation | lone grant_attribution.a`).

**What it found:** without `fact Invariant7_Attestation_Exclusivity`, Alloy
produces a world where two different Grant atoms both map to the same Attestation
atom via `grant_attribution`. The spec's prose had argued the nonce-per-request
mechanism prevented this, but the argument was structural (it relied on each
`attest()` call generating a fresh ULID) rather than named. The model exposed
that this was an implicit invariant without a formal name.

**Resolution:** `Invariant7_Attestation_Exclusivity` was added as a fact and
named Invariant 7 in the spec.

### `check Issuance_Revocation_Attestations_Differ for 5`

**What it checks:** that for any revoked grant, the issuance attestation and
revocation attestation are different atoms.

**What it found:** without Invariant 7 as a fact, Alloy finds a world where the
same Attestation atom is referenced in both `grant_attribution` and
`revocation_attribution` for the same grant. This would mean a single attestation
simultaneously proves "this grant was issued" and "this grant was revoked" — which
is structurally nonsensical but not excluded by the pre-Invariant-7 model.

**Resolution:** same as above. `Invariant7_Attestation_Exclusivity` covers this.

### `check Issuance_Revocation_Pools_Disjoint for 5`

**What it checks:** that the *ranges* of `grant_attribution` and
`revocation_attribution` are disjoint — no attestation appears in both maps,
even for different grants.

**What it found:** without Invariant 7, Alloy finds a world where one Attestation
atom is the issuance proof for grant A and the revocation proof for grant B.
This is the cross-grant variant of the same problem.

**Resolution:** same. These three checks are the reason `Invariant7_Attestation_Exclusivity`
exists as a named invariant rather than an implicit assumption.

---

## Transaction boundary and orphan log

**The spec's attest-before-record ordering is implemented inside a single `tx()`
(BEGIN IMMEDIATE ... COMMIT) wrapping all three steps: attest, record_grant,
write pairing map.** This means the "orphan attestation" case — attestation
written, grant write failed — is actually prevented in the happy path: if the
grant write fails, the whole transaction rolls back, including the attestation.

The spec describes orphan attestations as a recoverable anomaly that needs
structural evidence. In the demo, orphan attestations are seeded directly for
demo visibility (see `src/db/seed.ts`). A true production implementation with
distributed Permissions and Actor Identity atoms would have a real window between
the two writes.

**Preference:** keep the single-transaction approach for the demo (it's strictly
stronger than the spec's requirement, not weaker), but expose the orphan log as
the structural visibility mechanism the spec requires, seeded with a realistic
example. The `record_orphan()` function runs in its own `BEGIN/COMMIT` after the
outer transaction has already failed, so if the outer transaction were truly
two-phase across separate stores, the orphan log would be the natural failure
surface.

---

## Credential verification

**The spec requires that Actor Identity verifies the grantor's credential before
recording an attestation.** The demo implements this as a constant-time string
comparison against `actor.credential_secret`. In production this would be an
HMAC-SHA256 or asymmetric signature check. The `verify()` function in
`src/domain/attestation.ts` is named and structured to make this substitution
obvious.

**Preference:** keep plain string comparison in the demo to avoid introducing
`@std/crypto` complexity that obscures the composition mechanics. The `verify()`
function signature makes the intended replacement point clear.

---

## Action scope: no whitelist

**The spec's Configuration block lists allowed action scopes for specific
regulatory contexts** (SOX, HIPAA, PCI DSS, FDA Part 11). The demo does not
enforce a scope whitelist in the composition surface — any non-empty string is
accepted as `action_scope`. This keeps the demo general-purpose.

**Preference:** the demo seeds grants with realistic scope strings (`financials:read`,
`ehr:read:patient-4821`, `payment-system:admin`) to make the regulatory contexts
visible, without hard-coding a validator that would obscure the composition
mechanics for a new user.

---

## Actor identity: no credential rotation

The demo's `actor` table has no mechanism for credential rotation. `credential_secret`
is fixed at seed time. This is a demo simplification — the Actor Identity atom
spec allows for credential update with an attestation record — but adding rotation
would add UI surface that doesn't illuminate the composition's core properties.

---

## The duplicate-active-grant check enforces a property the spec does not promise

`issue_grant` in `src/domain/composition.ts` runs a `SELECT 1 FROM grant WHERE
subject_ref = ? AND action_scope = ? AND status = 'active'` *before* opening
its `tx()` block (lines 62-65) and rejects with `duplicate-active-grant` if a
row exists. The schema (`src/db/schema.sql`) backs this up with a
`UNIQUE INDEX grant_active_unique ON grant(subject_ref, action_scope) WHERE
status = 'active'`.

**The spec does not require this.** Per
`compositions/attributed-permissions-admin.md` §Edge cases → *Concurrent
issuance of the same grant*: "Two simultaneous `issue_grant(subject_ref,
action_scope, ...)` calls for the same `(subject_ref, action_scope)` pair
from different grantors produce two distinct attestations and two distinct
grants — Permissions' Edge case *Concurrent grant proliferation* allows
this. The composition does not prevent it." Single-active-per-pair semantics
is explicitly externalized to a composing pattern (Idempotent Reservation
or a token-based dedupe layer).

The implementation chose to enforce single-active-per-pair anyway. Two
problems follow:

1. **The application-layer check is non-atomic.** The SELECT runs before
   `tx()`, so two concurrent actors can both pass it and race. The TLA+
   model in `compositions/attributedPermissionsAdmin.tla` does not
   model the SQL UNIQUE INDEX; in that model two concurrent
   `IssueGrant` actions produce two active grants for the same pair —
   which the spec allows, so no invariant is violated. With the UNIQUE
   INDEX in place, the second SQL INSERT fails, the second transaction
   rolls back, and the second `attest()` rolls back with it (no orphan
   attestation produced — `attest` is inside the same `tx`). Net
   production behaviour is single-active-per-pair *because of the
   schema constraint*, not because of the application check.

2. **The application-layer check is load-bearing for nothing.** Anything
   the SELECT prevents would also be prevented by the schema UNIQUE
   INDEX. Removing the SELECT entirely and catching the resulting
   SQLITE_CONSTRAINT_UNIQUE error to surface `duplicate-active-grant`
   would be equivalent — and more honest about which layer carries the
   load.

**Preference.** Either (a) drop the application-layer check and let the
schema's UNIQUE INDEX surface the duplicate via a catch on
`SQLITE_CONSTRAINT_UNIQUE`, renamed to `duplicate-active-grant` at the
composition's boundary; or (b) move the SELECT inside the `tx()` block
so the check and the writes share an atomic boundary (no race, no
reliance on the schema constraint as the real enforcer). Doing both —
keeping the non-atomic application-layer check *and* the schema
constraint — is the current state and works in practice, but it makes
the application layer's check look like it's doing real work when it
isn't. The schema constraint is the only thing standing between this
implementation and the spec's stated "concurrent grants are allowed"
behaviour.

**Why this is a CORNERS entry, not a spec finding.** The spec is
internally consistent: §Edge cases names the behaviour the model
verifies. The implementation does something stronger than the spec
asks. That's a build choice, not a spec contradiction. If a deployment
wanted single-active-per-pair as a guaranteed property (rather than an
implementation incidentally provides it), the composition spec's
*Concurrent issuance of the same grant* edge case names the right
remedy: compose with Idempotent Reservation.

---

## Cross-atom identity surface aliasing

**The demo uses a single `credential_secret` field in the `actor` table
to serve two structurally distinct purposes: as the Actor Identity attest
key (used for HMAC-signing attestation records in APA operations) and as
the login credential (used for session establishment via the Login
composition, C13).**

The Credential atom (atom #11) defines authentication credentials — the
material a principal presents at login to prove identity and issue a
session. The Actor Identity atom defines attest keys — the material used
to sign action records, producing attribution-stamped proof that a
specific actor authorized a specific operation. The two credential
surfaces are specified independently and correctly as freestanding atoms.
Neither atom's spec says anything about the other's credential material.

Three questions the spec does not answer:

**1. Revocation cascade.** If a principal's Credential is revoked (via
`Credential.revoke`), does that affect their Actor Identity attest
capability? The Login composition (C13) cascades Credential revocation
to Sessions via the `credential_to_sessions` map. No composition
cascades Credential revocation to Actor Identity. A principal whose
login credential is revoked can still produce valid attestations in the
current library.

**2. Secret interchangeability.** Can the same secret material serve as
both the Credential atom's `credential_material` and Actor Identity's
`credential_public/secret` pair? The specs don't prohibit it. The demo
conflates them. In practice, a password hash is not a signing key — the
credential types are not interchangeable for real cryptographic
operations — but the spec is silent on whether this conflation is a
conforming shortcut or a violation of a constraint that hasn't been
written yet.

**3. Audit identity unification.** Attestations are attributed to
`actor_ref`. Sessions are issued to `principal_ref`. The Login
composition binds these in the happy path (a successful login produces a
session for the `principal_ref` whose Credential record was verified,
which must correspond to an `actor_ref` in Actor Identity). But neither
atom requires that `actor_ref` and `principal_ref` occupy the same
identity namespace. A deployment where they diverge would produce audit
records attributed to a different identity surface than the session
record — a forensic reconstruction problem the spec currently cannot
detect.

**The missing composition.** These three questions are each emergent
concerns that arise only when Credential and Actor Identity co-exist for
the same principal. In Grace Commons terms, that relationship belongs to
a composition — tentatively "Authenticated Actor" (Credential + Actor
Identity) — that would state whether the revocation cascade is required,
whether the credential surfaces must be distinct, and how the two
`principal_ref` / `actor_ref` namespaces are bound. That composition
does not exist yet; it is the spec-level artifact this implementation
finding points at.

**Preference.** Use the same `credential_secret` for both purposes in
the demo. Name the shortcut here and in seed data comments. A production
deployment would issue separate key material for each surface (e.g., a
bcrypt-hashed password for login and an HMAC key for attestation) and
would define the cascade behavior via the "Authenticated Actor"
composition. Post-demo spec work.
