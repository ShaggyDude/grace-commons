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
