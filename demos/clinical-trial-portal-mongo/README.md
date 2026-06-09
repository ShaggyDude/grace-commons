# Beacon — Mongo ghost render (headless, document store)

A render of the Grace Commons clinical-trial-portal spec surface (External
Onboarding C16, Login C13, Session-Gated Authorization C14, Attributed
Permissions Admin APA, Audit Trail C1) on **MongoDB** — deliberately
**headless** and deliberately a **document store**. Renders 1–3 and the
conformance fixtures cover two SQL engines, a flat-file log, and a second
language; none of them covers the dimension this render exists for: an engine
with **no foreign keys, no CHECK constraints, and no schema-level delete
discipline**. Every invariant the Postgres schema enforced declaratively must
now be carried somewhere else — and this render's job is to say **exactly
where each one went** (the table below). It exists to reveal structure, not to
ship.

The core is a faithful port of render 2's mutation surface
([`demos/clinical-trial-portal-next/composition.ts`](../clinical-trial-portal-next/composition.ts)):
same canonical schema vocabulary, same action codes, same audit payload keys,
same seed roster, same backdated genesis through the same append path. An
auditor diffing this render's event log against render 2's sees identical
`action` strings and payload shapes.

## What's here

```
lib/canonical.mjs        canonicalize() — byte-identical port of render 2's lib/canonical.ts
lib/hash.mjs             sha256hex(), randomToken()
lib/password.mjs         scrypt (same encoded format as render 2's fallback path)
schema.mjs               $jsonSchema validators + unique indexes — the enforcement seam, made explicit
portal.mjs               THE ONLY mutation surface (ops transcribed from render 2's composition.ts)
build.mjs                ephemeral one-node replSet (mongodb-memory-server) → migrate + seed + ghost scenario
prove-serialization.mjs  N concurrent ops — measures the 4th serialization mechanism (no fork, no gap)
export-chain.mjs         dump the stored chain as JSONL for the cross-render JS verifier
```

The conformance seam lives with the other renders' adapters:
`tools/conformance/ghost/adapters/clinical-trial-portal-mongo.actions.mjs`
(scenario driver) and
`tools/conformance/adapters/clinical-trial-portal-mongo.adapter.mjs`
(records-alone validator read).

## Run it

```bash
npm install                                   # mongodb + mongodb-memory-server (binary fetched on first use)

node build.mjs                                # boot replSet → migrate + seed → ghost full-lifecycle → persist
#   → built <tmpdir>/grace-commons-conformance/clinical-trial-portal-mongo

cd ../../tools/conformance
node validate.mjs clinical-trial-portal-mongo --manifest clinical-trial-portal \
  --db <that dir>                             # → CORRECTNESS: 100.0% (20/20 passed)

cd ../../demos/clinical-trial-portal-mongo
node prove-serialization.mjs 24               # → SERIALIZED — no fork, no gap, no caller-visible contention failure

node export-chain.mjs <that dir> > /tmp/chain.jsonl
node ../clinical-trial-portal-go/verify.mjs /tmp/chain.jsonl
#   → ✓ Verified 14 event(s) under the JS canonical contract
```

`MONGOMS_SYSTEM_BINARY=/path/to/mongod` skips the binary download. Runs are
ephemeral (memory-server, no root, no system install); the only artifact is the
persisted data directory the validator reads.

## The serialization mechanism — a fourth conforming mechanism

The Event Log atom requires that *"appends never fail for ordering or
contention reasons — the underlying implementation must serialize them"*
(Invariant 3, total order). Three mechanisms are on record
([`discoveries.md`](../../discoveries.md) 2026-06-06); Mongo has no advisory
lock, so this render supplies a fourth:

| Render | Serialization mechanism |
|---|---|
| 1 — SQLite | single-writer lock (free) |
| 2 — Postgres | `pg_advisory_xact_lock` |
| 3 — Go | `sync.Mutex` |
| **4 — Mongo** | **replica-set transaction + unique `event_log._id` as fork guard + optimistic retry** |

Concretely: every op runs in a multi-document transaction (Mongo requires a
replica set for that — `build.mjs` boots a one-node replSet); the append reads
the tail and inserts `_id = tail + 1`; two concurrent appends collide on the
unique `_id`, the engine aborts one as a transient write-conflict, and
`withTransaction` re-runs the whole op body against the new tail. A forked
append is **impossible** (it is a conflict, not a fork) and contention never
surfaces to the caller (the retry absorbs it) — both halves of the clause.
Consequence for op authors: every transaction body must be safely re-runnable —
id allocation (`$inc` on `counters`) happens inside the transaction so aborted
attempts roll back; tokens and password hashes are computed before it (render
2's placement, for the same hold-time reason). `prove-serialization.mjs`
measures the claim instead of asserting it: 24 genuinely concurrent ops → 24
events, gapless ids, chain re-verifies.

## The discovery table — invariant → who enforces it now

The point of this render. Postgres carried a layer of invariants
**declaratively** (`migrations/0001_init.sql`); Mongo has no equivalent for
several of them. Every row below names where the enforcement moved. Three
enforcement classes emerge:

- **engine** — Mongo enforces it as Postgres did (a write violating it is
  rejected by the store);
- **app code** — `portal.mjs` enforces it; the engine would accept the bad
  write (the class that must now be *audited* rather than *assumed*);
- **runtime mechanism** — the EXECUTION_CONTRACT seam: the spec names the
  obligation, each engine supplies its own machinery.

| Postgres-schema invariant | Postgres enforcer | Mongo enforcer | Class |
|---|---|---|---|
| `NOT NULL` on every required column | column DDL | `$jsonSchema` `required` + `bsonType` (write rejected) | engine |
| `parties.email` UNIQUE | unique constraint | unique index `{email:1}` | engine |
| `sessions.token`, `invitations.token`, `permissions.code`, `studies.protocol_number`, `subjects.subject_code` UNIQUE | unique constraints | unique indexes | engine |
| `event_log.this_hash` UNIQUE | unique constraint | unique index `{this_hash:1}` | engine |
| `credentials.kind CHECK IN ('password')` | CHECK | `$jsonSchema` `enum` | engine |
| `grants.scope CHECK IN ('all','own')` | CHECK | `$jsonSchema` `enum` | engine |
| `subjects.status CHECK IN (screening/enrolled/withdrawn/completed)` | CHECK | `$jsonSchema` `enum` | engine |
| `retention_policy CHECK (id = 1)` (single row) | CHECK on PK | `$jsonSchema` `enum: [1]` on `_id` | engine |
| `occurred_at`/`payload_json`/`prev_hash`/`this_hash` stored verbatim as text (hash byte-identity) | `TEXT` column typing | `$jsonSchema` `bsonType: "string"` — a BSON `Date` or nested document is **rejected by the store**, so the opaque-strings rule is machine-enforced, not convention | engine |
| FK: externally-supplied references (`grants.grantee_actor_id`, `grants.permission_id`, `subjects.study_id`, `visits.subject_id`, invitation→party on accept) | `REFERENCES` (unconditional, every write) | **app code** — explicit `fkExists()` lookups inside the op's transaction | app code |
| FK: op-derived references (`actors.party_id`, `sessions.actor_id`, `event_log.actor_id`/`session_id`, `invitations.party_id`/`issued_by_actor_id`, `credentials.actor_id`) | `REFERENCES` (unconditional, every write) | **app code, structurally** — the value is read from or created in the store within the same transaction; no independent check exists | app code |
| `ON DELETE RESTRICT` discipline | engine refuses the delete, regardless of which client issues it | **no delete surface in the core** — absence of code, not active refusal; a client with store access *could* delete, and only Tamper Evidence (the chain) would surface it after the fact | app code (weaker) |
| `IDENTITY` key generation | sequences | `counters` collection, `$inc` **inside** the op's transaction (aborted attempts leak no ids) | runtime mechanism |
| `event_log.id` explicit `MAX(id)+1` under the global advisory lock | advisory lock + explicit assignment | tail-read + unique `_id` + transactional optimistic retry (the 4th mechanism, above) | runtime mechanism |
| Atomicity: atom writes + audit appends commit together | `BEGIN`/`COMMIT` + `pg_advisory_xact_lock` | multi-document transaction on a replica set; `withTransaction` retry | runtime mechanism |
| `idx_grants_grantee` partial index (`WHERE revoked_at IS NULL`) | partial index (performance, **not** an invariant) | plain compound index — `partialFilterExpression` cannot match `null` ([CORNERS](./CORNERS.md)) | n/a (performance) |

**The answer to spec-carried vs Postgres-carried:** every spec-named invariant
survived the engine swap — 20/20 conformance checks pass and the seven-render
agreement holds at 100% — so the *invariants* are spec-carried. What Postgres
carried was the **enforcement locus**: in Postgres one declarative layer
enforced all of this unconditionally; in Mongo it splits into engine-enforced
(`$jsonSchema` + unique indexes), app-code-enforced (FK existence, delete
discipline — the rows above that a reviewer must now audit as code paths), and
runtime mechanism (serialization, atomicity, id allocation). No spec
contradiction surfaced during the port — nothing rose to a finding; the deltas
that are real but preference-shaped are in [`CORNERS.md`](./CORNERS.md). The
FK rows are the substance of the discovery: the spec states the referential
invariants, the conformance checks measure them from the records, and the
engine no longer guarantees them between those two points — app code does.

## What the validator reads

`build.mjs` persists the mongod data directory; the validator adapter boots an
ephemeral **standalone** mongod over it (a replSet data dir is readable
standalone — this sidesteps re-forming the replset config on a new port),
snapshots every collection, shuts the server down, and serves the synchronous
records-alone accessor contract over the snapshot — the same async-init pattern
as the pglite adapters. The chain position is stored as `_id` and hashed under
the canonical key `id`; the stored chain re-verifies byte-identically under the
JS canonical contract (`export-chain.mjs` + the Go render's `verify.mjs` make
that check independent of this render's own code).
