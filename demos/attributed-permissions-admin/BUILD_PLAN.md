# BUILD_PLAN.md — Attributed Permissions Admin Demo

Build arc for the `attributed-permissions-admin` demo. Records the phased
implementation, schema decisions, and the list of application-level invariants
whose tests map to Alloy assertions.

---

## Phase 1 — Schema and domain layer

Goal: get a SQLite schema and pure-domain module that satisfies all composition
invariants before any HTTP surface exists.

### 1.1 Schema design

The schema represents the two atom stores (Permissions, Actor Identity) and the
three pieces of composition emergent state (grant_attribution, revocation_attribution,
orphan_log) as separate tables.

Key decisions:
- `grant_attribution` and `revocation_attribution` are separate tables rather than
  columns on `grant`. This mirrors the Alloy model's relational structure
  (`System.grant_attribution : Grant -> lone Attestation`) and makes the
  injectivity and disjointness properties checkable with simple SQL.
- Both pairing tables carry `UNIQUE (attestation_id)` constraints to enforce
  within-table injectivity at the DB layer (Invariant 7, first two clauses).
  Cross-table disjointness is enforced at the application layer in `composition.ts`
  and checked at runtime by the `/verify` endpoint.
- Schema triggers enforce immutability for all five critical tables: attestation,
  grant_attribution, revocation_attribution, orphan_log (no UPDATE, no DELETE),
  and grant (no UPDATE of core fields; terminal absorption for status).

### 1.2 Domain modules

- `src/domain/attestation.ts` — Actor Identity atom: `attest()`, `verify()`, `getAttestation()`
- `src/domain/grant.ts` — Permissions atom: `record_grant()`, `record_revocation()`, `check()`, `listGrants()`
- `src/domain/orphan_log.ts` — `record_orphan()`, `listOrphans()`
- `src/domain/composition.ts` — composition surface: `issue_grant()`, `revoke_grant()`,
  `verify_grant_attribution()`, `permitted()`

### 1.3 Transaction design

All three steps of `issue_grant` (attest, record_grant, write pairing entry) run
inside a single `BEGIN IMMEDIATE ... COMMIT`. This is strictly stronger than the
spec's requirement (which allows a window between the Actor Identity and Permissions
writes). See `CORNERS.md` "Transaction boundary and orphan log" for the tradeoff.

---

## Phase 2 — HTTP surface

Goal: expose the composition surface as server-rendered hypermedia.

Routes:
- `GET /` — grant list (active + revoked)
- `GET /grants/new` — issue grant form
- `POST /grants` — calls `issue_grant()`; redirects to detail on success
- `GET /grants/:id` — calls `verify_grant_attribution()` and renders full attribution chain
- `POST /grants/:id/revoke` — calls `revoke_grant()`
- `GET /orphans` — orphan log list
- `GET /verify` — live invariant check page (HTML)
- `GET /verify/json` — same data as JSON

The `/verify` route is the demo's signature feature: it evaluates all 8 composition
invariants over the current DB state and renders them with their Alloy assertion
names. This closes the loop between formal model and running implementation.

---

## Phase 3 — Test suite

Tests use `DB_PATH=:memory:` and are fully isolated per file.

| File | What it covers |
|---|---|
| `attribution.test.ts` | issue_grant and revoke_grant happy/error paths; verify_grant_attribution |
| `invariants.test.ts` | One test per invariant (1–8), each labelled with Alloy assertion name |
| `scenarios.test.ts` | HTTP-level walkthroughs via app.fetch() for SOX, HIPAA, PCI DSS scenarios |

---

## §12 — Application-level invariants (mapped to Alloy assertions)

| # | Name | Alloy assertion | What it guarantees |
|---|---|---|---|
| 1 | Attribution completeness | `Attribution_Completeness` | Every grant has an issuance attestation in `grant_attribution` |
| 2 | Revocation attribution | `Revocation_Attribution` | Every revoked grant has an attestation in `revocation_attribution` |
| 3 | Attribution recoverability | `Attribution_Recoverability` | `verify_grant_attribution()` can always reconstruct the full chain |
| 4 | Attribution-time monotonicity | `Dyn_Attest_Before_Record` | `attestation.attested_at ≤ grant.granted_at` |
| 5 | Constituent invariants preserved | (constituent atom checks) | Attestations are durable; grants respect terminal absorption |
| 6 | Pairing-map durability | `Dyn_Pairing_Durability` | `grant_attribution` and `revocation_attribution` entries are immutable once written |
| 7 | Attestation exclusivity | `Invariant7_Attestation_Exclusivity` | Both maps are injective and their ranges are disjoint; discovered by the Alloy model |
| 8 | Orphan log durability | `Dyn_Orphan_Log_Durability` | Orphan log entries are immutable once written |

Invariant 7 was not present in the initial spec draft. The Alloy model produced
counterexamples for `Grant_Attribution_Injective`, `Issuance_Revocation_Attestations_Differ`,
and `Issuance_Revocation_Pools_Disjoint` before `fact Invariant7_Attestation_Exclusivity`
was added. See `CORNERS.md` "The three intentionally-failing Alloy checks".
