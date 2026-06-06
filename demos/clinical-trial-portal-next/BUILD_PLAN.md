# Grace Commons Demo 2 — Clinical Trial Site Portal — **Second Render (Next.js + Postgres)**

**Working title:** `demos/clinical-trial-portal-next` (codename: *Beacon*, second render)
**Thesis under demonstration:** the spec is canonical. This document re-renders the *same* Grace Commons compositions, the *same* actor roster, the *same* audit semantics, the *same* `composition.ts` action codes, and the *same* hash-chain contract as the first render (`demos/clinical-trial-portal`, Deno + Hono + SQLite + HTMX) onto a maximally-different stack — **Next.js (App Router) + PostgreSQL + React Server Components** — to show that the library specs survive a stack swap. Only the render layer changes. If the two renders agree on every audit event and every invariant while sharing almost no infrastructure code, the thesis holds.

**Audience:** Show HN; Daniel Jackson (author, *The Essence of Software*); and any reader asking "does the spec-as-canonical claim actually survive contact with a second, unrelated stack?"

This is a **plan-only** document. No application code yet — every section is a target the implementation will hit. It is the counterpart to `demos/clinical-trial-portal/Demo2-plan.md` (the first render). Read that document first: §0–§6 (the stack-agnostic half — domain story, composition coverage, actor roster, route shape, schema *intent*, audit design) are **shared and unchanged**. This document replaces only its **Appendix A** (the render-layer patterns) and the stack-specific decisions, and adds the one genuinely-new engineering surface the swap forces: **global serialization of the audit chain.**

---

## 0. What is shared vs. what this render replaces

The first render's plan already anticipated this document. Its §0 says, verbatim:

> *A **second render** — same compositions, same actor roster, same audit semantics, same `composition.ts` action codes, same hash-chain contract — targeting a more conventional stack (current candidate: Next.js + Prisma + PostgreSQL + React Server Components) is planned as a follow-up. The point of the multi-render strategy is to demonstrate that the library specs survive a stack swap; only Appendix A is replaced.*

This plan executes that follow-up, with **one deliberate amendment to the offhand candidate**: **no Prisma.** See Decision 1 below — Prisma is incompatible with the first render's own Appendix A.14 rule ("no ORM"), and with the demo's entire pedagogical point (the schema is small, legible, and every table is an atom). We keep raw SQL and a thin query layer.

### 0.1 Stack-agnostic (carried over **unchanged** — do not re-derive)

These are the library-spec contracts. They are the same in both renders. The first render is canonical for their exact content; this render reproduces them.

| Carried-over contract | Source of truth | Why it cannot change |
|---|---|---|
| **Domain story** (PI / Coordinator / CRA; invite → onboard → grant → enroll → record → audit-walk → verify) | Demo2-plan §1 | It is the demonstration, not the stack. |
| **Composition coverage** (C16 External Onboarding, C13 Login, C14 Session-Gated Authorization, APA Attributed Permissions Admin, C1 Audit Trail) | Demo2-plan §2 | These are the library specs under test. |
| **Actor roster + permission catalog + seed** (Dr. Anya Okonkwo / Jordan Lee seeded; Maya Chen onboarded; five permission codes) | Demo2-plan §3 | The walkthrough depends on it byte-for-byte. |
| **Route *semantics*** (which action requires which permission; the public/PI/SC/audit surfaces) | Demo2-plan §4 | The authorization model is spec, not render. The *transport* (Hono route vs. Next route handler/server action) changes; the permission gates do not. |
| **Action-code vocabulary** (the dotted strings `invitation.issued`, `invitation.accepted`, `invitation.revoked`, `login.succeeded`, `login.failed`, `session.revoked`, `grant.issued`, `grant.revoked`, `subject.enrolled`, `visit.recorded`, plus the route-layer meta-events `audit.viewed` / `audit.exported`) | first render's `composition.ts` header (canonical) | An auditor diffing the two renders' event logs must see identical `action` strings. **Transcribe from the first render's `composition.ts`, not from memory.** |
| **The hash-chain contract** (see §6) | first render's `lib/canonical.ts`, `lib/hash.ts`, `domain/event_log.ts` | This is *the* load-bearing portability claim. It must port byte-for-byte. |
| **`composition.ts` is the only mutation surface; every mutation writes atom rows + audit event in one all-or-nothing transaction** | Demo2-plan §2, Appendix A.5 | The records-alone story and the rollback test depend on it. |
| **Argon2id PHC-format credential strings** (m=19456, t=2, p=1) | Demo2-plan Decision 3 / A.8 | PHC strings are interoperable: a credential hashed by either render verifies in the other. |

### 0.2 Render-layer (this document **replaces** the first render's Appendix A)

Everything below is stack-specific "how to express what" for Next.js + Postgres. It is the second half of the executable spec for this render. None of it changes the contracts in §0.1.

---

## 1. Locked-in decisions

Eight judgment calls, resolved before drafting. Decisions 1–3 and 6 are deliberate divergences from the first render's offhand candidate or from the SQLite render's free lunches; the rest are the obvious Next/Postgres counterparts of first-render decisions.

1. **No ORM. Raw SQL migration + a thin typed query layer (`postgres` a.k.a. postgres.js).** The first render's Appendix A.14 forbids ORMs explicitly ("no ORM, no service layer, no DI container … the render is deliberately flat"). Prisma would (a) violate that rule, (b) hide the schema that the demo exists to show, and (c) fight the raw `pg_advisory_xact_lock` and `MAX(id)+1`-under-lock the audit chain needs. We use **postgres.js** (`postgres`) for queries and a single hand-written `migrations/0001_init.sql` as the single-source DDL — the exact ethos of the first render, just a different driver. (If a typed query *builder* is wanted later, **Drizzle** is the only acceptable upgrade: it runs raw SQL migrations and never hides the schema. Not for v1.)

2. **PostgreSQL 16+, accessed over a *session* (non-pooled) connection for write paths.** The audit chain requires session-scoped advisory locks (Decision 6); a transaction-pooled connection (PgBouncer transaction mode, or a serverless pooler) hands a different backend per statement and silently breaks `pg_advisory_xact_lock`. Reads may use a pool; the single global writer connection must be a direct session.

3. **Next.js App Router, deployed as a persistent Node server (`next start`), not serverless.** Server Components for reads; **Server Actions** for the five mutations (the HTMX-swap equivalents). A long-running server with one stable writer connection is exactly what the global-advisory-lock concurrency model wants — and is why Fly.io (Decision 7), not Vercel serverless, is the deploy target.

4. **Argon2id via `@node-rs/argon2`** (native, maintained, fast) with the first render's parameters (`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`, variant `argon2id`). Output is a PHC-format encoded string stored in `credentials.secret_hash`, byte-compatible with the first render's `argontwo` output, so credentials are cross-render verifiable. `lib/password.ts` is the only place Argon2 is referenced.

5. **Session token: opaque random, DB-backed**, identical to the first render (the `sessions` table is the source of truth; not JWT). `randomToken(32)` → 64-char hex via `crypto.randomBytes`.

6. **The audit chain is a single global hash chain, so every mutation globally serializes via one Postgres advisory lock.** This is the heart of the experiment — see §6. SQLite's single-writer lock gave the first render global serialization for free; Postgres does not. Every `composition.ts` transaction takes `pg_advisory_xact_lock(BEACON_AUDIT_LOCK)` (a fixed 64-bit constant) as its first statement, computes `id = MAX(id)+1` for the event row under that lock, appends, and commits — releasing the lock. The alternative (`SERIALIZABLE` + retry on `40001`) is recorded as a considered option in §6.4 but the advisory lock is chosen for determinism and a one-line implementation.

7. **Deploy: Fly.io — a persistent Next.js machine + Fly Managed Postgres.** Same provider as the first render, different shape: no SQLite volume mount (Postgres is the store); `DATABASE_URL` injected as a Fly secret using the **direct/session** connection string (per Decision 2). `output: 'standalone'` for a lean container. Migrate + seed run as a release command.

8. **Same Inks.css styling.** `styles/inkset.css` and the Tailwind v4 `@utility inks-*` design system port over **unchanged** (it is just CSS + the `VisualDesignSystem.md` token set). Only the *components* that consume the classes are rewritten (TSX-for-Hono → TSX-for-React). The visual result is identical to the first render by construction.

---

## 2. Runtime & tooling

Runtime target: **Node 22 LTS**, Next.js 15 (App Router, React 19, RSC + Server Actions).

- **`next`** — App Router, Server Components, Server Actions. `output: 'standalone'`.
- **`postgres`** (postgres.js) — the query driver. One module (`lib/db.ts`) owns the pool (reads) and the dedicated writer connection (writes). No ORM.
- **`@node-rs/argon2`** — Argon2id hash/verify. Native addon; confirm it builds in the Fly Docker image (it ships prebuilt binaries for linux-x64-gnu).
- **`@std`-equivalents in Node**: `crypto` (SHA-256, random tokens) from `node:crypto`; no external hash dep.
- **`nodemailer`** — invitation email, same as the first render's Phase 7. In-UI link is the default; SMTP is opt-in via env (mirrors first render).
- **Tailwind v4** — same CSS-only flow as the first render: `@import "tailwindcss"` + `@source` + the inkset `@utility` rules. Built by the Next build (PostCSS-less v4) or a `build:css` script; the inkset stylesheet is imported in the root layout.
- **Tests: Vitest** (unit + composition rollback + tamper) and a Playwright-or-fetch **e2e** that walks the lifecycle against a running server. The first render's `deno test` layers map one-to-one (§7.12).

`package.json` scripts:

- `dev` — `next dev` (Turbopack); assumes a local Postgres (or `docker compose up db`).
- `build` — `next build` (standalone).
- `start` — `next start`.
- `migrate` — `tsx scripts/migrate.ts` (applies `migrations/0001_init.sql` idempotently).
- `seed` — `tsx scripts/seed.ts` (idempotent; PI + CRA + permission catalog + study).
- `verify` — `tsx scripts/verify.ts` (the CLI chain-verifier, for monitors who do not trust the web UI — same affordance as the first render's `deno task verify`).
- `test` — `vitest run`.

Single Postgres database. Local dev convenience: a `docker-compose.yml` with one `postgres:16` service so `migrate`/`seed`/`dev` work with zero host setup.

---

## 3. Directory & file layout

Mirrors the first render's module boundaries (one file per atom; `composition.ts` the sole mutation surface; `lib/` for primitives) re-expressed in Next's App Router conventions. The domain/composition/lib layers are **near-verbatim ports**; only `app/`, the driver in `lib/db.ts`, and the views change shape.

```
demos/clinical-trial-portal-next/
├── package.json                      # scripts, deps (§2)
├── next.config.ts                    # output: 'standalone'
├── tsconfig.json
├── docker-compose.yml                # local postgres:16 for dev
├── Dockerfile                        # multi-stage; standalone Next + release-cmd migrate/seed
├── fly.toml                          # persistent machine; Managed Postgres attached
├── .env.example                      # DATABASE_URL (session conn), SMTP_*, SESSION_COOKIE
├── README.md
├── BUILD_PLAN.md                     # this document
├── CORNERS.md                        # deferred-vs-spec tracker (seed entries in §11)
├── migrations/
│   └── 0001_init.sql                 # Postgres DDL — §5 (single-source schema)
├── styles/
│   ├── inkset.css                    # ported UNCHANGED from first render
│   └── tailwind.css                  # @import "tailwindcss" + @source
├── lib/
│   ├── db.ts                         # postgres.js pool + writer conn; withTx (async, advisory lock); Ctx/Tx types
│   ├── canonical.ts                  # ported BYTE-IDENTICAL from first render
│   ├── hash.ts                       # sha256hex (node:crypto) + randomToken — ported
│   ├── password.ts                   # Argon2id via @node-rs/argon2 (same params)
│   ├── mailer.ts                     # nodemailer (SMTP opt-in)
│   └── session.ts                    # cookie read/write helpers (Next cookies())
├── domain/                           # one file per atom — PORTED (sql dialect + async only)
│   ├── parties.ts
│   ├── actors.ts
│   ├── credentials.ts
│   ├── sessions.ts
│   ├── permissions.ts
│   ├── grants.ts
│   ├── invitations.ts
│   ├── event_log.ts                  # appendEvent (id=MAX+1 under lock) + verifyChain
│   ├── retention_policy.ts
│   ├── studies.ts
│   ├── subjects.ts
│   └── visits.ts
├── composition.ts                    # THE ONLY mutation surface — ported; now async
├── auth/
│   ├── current.ts                    # session lookup → {actor, session} (replaces require_session middleware)
│   └── permit.ts                     # grant lookup + scope (replaces require_permission middleware)
├── app/                              # Next App Router — REPLACES routes/ + views/
│   ├── layout.tsx                    # root layout; imports inkset stylesheet; top bar
│   ├── globals.css                   # @import the built tailwind/inkset
│   ├── page.tsx                      # GET / (landing)
│   ├── login/
│   │   ├── page.tsx                  # GET /login (form)
│   │   └── actions.ts                # 'use server' login(), logout()
│   ├── invitations/accept/[token]/
│   │   ├── page.tsx                  # GET /invitations/accept/:token (set-password form)
│   │   └── actions.ts                # 'use server' acceptInvitation()
│   ├── dashboard/page.tsx            # GET /dashboard (role-aware)
│   ├── people/
│   │   ├── page.tsx                  # GET /people (PI: invitations + actors + grants)
│   │   └── actions.ts                # issueInvitation/revokeInvitation/grant/revokeGrant
│   ├── subjects/
│   │   ├── page.tsx                  # GET /subjects (list)
│   │   ├── new/page.tsx              # GET /subjects/new
│   │   ├── [id]/page.tsx             # GET /subjects/:id (detail + visits)
│   │   └── actions.ts                # enrollSubject/recordVisit
│   └── audit/
│       ├── page.tsx                  # GET /audit (filterable + running verdict)
│       ├── verify/page.tsx           # GET /audit/verify (full chain recompute)
│       └── export.csv/route.ts       # GET /audit/export.csv (route handler — streams CSV)
├── components/                       # React components (RSC + small 'use client' islands)
│   ├── InviteResultCard.tsx
│   ├── AuditRow.tsx
│   ├── VerifyChip.tsx                # 'use client' — calls verify, swaps result
│   └── …                             # one per first-render view fragment
├── scripts/
│   ├── migrate.ts
│   ├── seed.ts
│   └── verify.ts                     # CLI chain verifier
└── tests/
    ├── helpers.ts                    # withTestDb (ephemeral pg schema per test), overrideSha256
    ├── atoms/<name>.test.ts          # one per atom
    ├── composition.test.ts           # rollback assertions (forced hash failure → zero rows)
    ├── e2e.test.ts                   # lifecycle walk via the running server / server actions
    └── tamper.test.ts                # mutate payload_json, expect verifyChain to flag the row
```

Note on the layer split: `domain/`, `composition.ts`, `lib/canonical.ts`, `lib/hash.ts`, `auth/` are **logic ports** — the same functions, adjusted for async + Postgres SQL. `app/` and the views are **rewrites** (RSC + Server Actions replace Hono handlers + HTMX). That split is the whole experiment in miniature: the spec-derived layers move nearly verbatim; the render layer is replaced.

---

## 4. The one new engineering surface — global audit-chain serialization

This is the section with no counterpart in the first render, because SQLite made the problem disappear. It is the highest-value part of the experiment.

### 4.1 The problem the swap exposes

The `event_log` is a **single global hash chain**: every row's `prev_hash` is the immediately-preceding row's `this_hash`, ordered by a global monotonic `id`, and `id` is part of the hashed payload (computed as `MAX(id)+1` *before* insert so it can be hashed — see §6). Every `composition.ts` mutation appends to this one chain inside its transaction.

Therefore **every mutation must be totally ordered with respect to every other mutation.** Two concurrent appends that both read the same `MAX(id)` and the same tail `this_hash` produce two rows claiming the same `id`/`prev_hash` — a forked, unverifiable chain.

- **First render (SQLite):** `BEGIN IMMEDIATE` + WAL single-writer → at most one write transaction at a time, globally. The fork is impossible for free. The first render never had to think about this.
- **This render (Postgres):** MVCC allows concurrent write transactions. The fork is possible. We must reintroduce the global ordering the chain assumes.

### 4.2 The mechanism: one global advisory lock

`withTx` (the write-path transaction wrapper, §7.1) takes, as its first statement inside `BEGIN`:

```sql
SELECT pg_advisory_xact_lock(7423001);   -- BEACON_AUDIT_LOCK, a fixed app-wide constant
```

`pg_advisory_xact_lock` is **transaction-scoped** (auto-released on COMMIT/ROLLBACK) and **session-bound** (hence Decision 2's non-pooled writer connection). Holding it means: this transaction is the sole writer to the audit chain for its duration. `MAX(id)+1` and the tail-`this_hash` read are now race-free, exactly reproducing the SQLite single-writer guarantee — but as an explicit, named, spec-traceable mechanism rather than a storage-engine accident.

The lock is held only for the transaction body (atom writes + one-or-more `appendEvent` calls), which is sub-millisecond work. Password hashing — the only slow operation — happens **before** the transaction (it already does in the first render, because its `withTx` is synchronous; here we keep the same ordering to minimize lock hold time even though our `withTx` is async).

### 4.3 Why this is the spec earning its keep

The abstraction — *"an append-only, totally-ordered, tamper-evident chain"* — is stack-independent and correct. The *mechanism* that guarantees the total order is not portable: SQLite gave it by accident, Postgres needs it stated. The swap forces that mechanism into the open. That is conflict-protocol case 3, but a milder one than it first looks: the English already *required* total ordering (Event Log Invariant 3, plus the operational clause "the underlying implementation must serialize them") — what one stack hid was not the invariant but that the mechanism providing it is non-portable. The swap turned a free guarantee into an explicit render-layer obligation **without changing the spec**. **Finding to record in CORNERS:** the first render's `withTx` doc comment should note that its global serialization is load-bearing for the audit chain and is provided by the single-writer storage engine — so a future maintainer doesn't "optimize" it into per-row connections.

### 4.4 The throughput truth (record honestly)

A single global chain means **all** mutations across the whole system serialize — not per-subject, not per-actor, globally. That is inherent to one global hash chain, not a Postgres artifact. For a single-site demo it is a non-issue (one PI, a few coordinators). For a real multi-site deployment it would be the scaling ceiling, and the fix is a **spec change**, not a render change: shard the chain per study/site (a chain key column, `prev_hash` per key) — which alters the Audit Trail composition's contract and must go through the library's review channel, not a code commit. This belongs in CORNERS as a named boundary, and is a genuinely useful thing the second render teaches that the first render's free lunch obscured.

### 4.5 Considered alternative (recorded, not chosen)

`SERIALIZABLE` isolation on the write connection + a retry loop on serialization failure (`40001`). Correct, but: (a) non-deterministic latency under contention, (b) every composition call site needs retry plumbing, (c) harder to explain in a Show-HN walkthrough than "one named lock = the SQLite writer, made explicit." Advisory lock wins on legibility, which is the demo's currency.

---

## 5. Postgres schema (`migrations/0001_init.sql`)

A direct port of the first render's `migrations/0001_init.sql` (Demo2-plan §5). The atom→table mapping, column meanings, CHECKs, the partial index, and `ON DELETE RESTRICT` discipline are **unchanged**. Only SQLite→Postgres dialect deltas differ, listed first so the diff is auditable.

### 5.1 Dialect deltas (the complete list)

| SQLite (first render) | Postgres (this render) | Note |
|---|---|---|
| `INTEGER PRIMARY KEY` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | except `event_log.id` — see below |
| `event_log.id INTEGER PRIMARY KEY AUTOINCREMENT` | `event_log.id BIGINT PRIMARY KEY` (**no IDENTITY**; assigned explicitly as `MAX(id)+1` under the advisory lock) | the id is part of the hash, so it must be known *before* insert; do not delegate to a sequence/IDENTITY |
| `TEXT` | `TEXT` | unchanged |
| `created_at TEXT` (ISO-8601 string) | `TEXT` (keep ISO-8601 string) | **Deliberately keep TEXT, not `timestamptz`.** The timestamp string is hashed; storing it as TEXT guarantees the hash input is exactly what was written, with no driver-side reformatting. (A `timestamptz` round-trip could renormalize the string and silently change the hash. This is a portability-critical choice.) |
| `BOOLEAN NOT NULL DEFAULT 1` (`retention_policy.enforce_on_read`) | `BOOLEAN NOT NULL DEFAULT TRUE` | native boolean |
| `CHECK (id = 1)` single-row table | same | unchanged |
| partial index `WHERE revoked_at IS NULL` | same (Postgres supports partial indexes) | unchanged |
| `... RETURNING *` | same (Postgres supports RETURNING) | unchanged — atom write helpers keep their shape |

Everything else (table set, columns, `UNIQUE`, `CHECK (status IN …)`, `CHECK (kind IN ('password'))`, `CHECK (scope IN ('all','own'))`, all foreign keys with implicit `ON DELETE RESTRICT`, the four `event_log` indexes, the `grants` partial index) is copied verbatim in intent.

### 5.2 Tables (same as Demo2-plan §5, Postgres dialect)

Atom stores: `parties`, `actors`, `credentials`, `sessions`, `permissions`, `grants`, `invitations`, `event_log`, `retention_policy`. Regulated artifacts: `studies`, `subjects`, `visits`. No new tables. The only composition-emergent state remains the `scope` column on `grants` and the single-row `retention_policy` — identical to the first render. The schema being this small is the point; the second render does not get to grow it.

`event_log` is reproduced here because of its special id handling:

```sql
CREATE TABLE event_log (
  id            BIGINT PRIMARY KEY,            -- assigned MAX(id)+1 under advisory lock; part of the hash
  occurred_at   TEXT NOT NULL,                 -- ISO-8601; hashed verbatim
  actor_id      BIGINT REFERENCES actors(id),  -- nullable: anonymous events (login.failed)
  session_id    BIGINT REFERENCES sessions(id),
  action        TEXT NOT NULL,
  target_kind   TEXT,
  target_id     BIGINT,
  payload_json  TEXT NOT NULL DEFAULT '{}',    -- canonicalized JSON string; hashed verbatim
  prev_hash     TEXT NOT NULL,                 -- '' for row #1
  this_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_event_log_actor  ON event_log(actor_id);
CREATE INDEX idx_event_log_target ON event_log(target_kind, target_id);
CREATE INDEX idx_event_log_action ON event_log(action);
CREATE INDEX idx_event_log_time   ON event_log(occurred_at);
```

There are no triggers in this schema (unlike the Multi-Party Approval demo). The first render enforces immutability by *convention* — `composition.ts` is the only writer and never issues UPDATE/DELETE against `event_log`. This render keeps that convention. (A hardening option — a `BEFORE UPDATE/DELETE … RAISE EXCEPTION` trigger on `event_log`, the Postgres equivalent of the MPA demo's append-only triggers — is recorded in CORNERS as an available defense-in-depth upgrade, deliberately not added in v1 to keep the render a faithful port of the convention-based original.)

---

## 6. The hash-chain contract (ported byte-for-byte)

This is the load-bearing portability claim. The verifier algorithm and the hashed payload shape are **identical** across renders. `lib/canonical.ts` and `lib/hash.ts` are copied with only the import surface changed.

### 6.1 Canonical JSON — copied verbatim

```ts
// lib/canonical.ts — IDENTICAL to the first render. Do not "improve."
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as object).sort();
  return "{" + keys.map((k) =>
    JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])
  ).join(",") + "}";
}
```

### 6.2 SHA-256 — same primitive, Node import

```ts
// lib/hash.ts
import { createHash, randomBytes } from "node:crypto";
export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");   // synchronous
}
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
// keep the first render's test-only override hook for the rollback/tamper tests.
```

### 6.3 The hashed payload shape — identical

```
this_hash = sha256hex( canonicalize({
  id, occurred_at, actor_id, session_id,
  action, target_kind, target_id,
  payload_json,                 // itself canonicalize(payload)
  prev_hash
}) )
```

`prev_hash` = previous row's `this_hash`; row #1 uses `''`. Keys are sorted by `canonicalize`, so field *declaration* order is irrelevant — but the **field set and their values must match exactly**. The `id` is the `MAX(id)+1` value computed under the advisory lock (§4.2). Because `occurred_at` is wall-clock, the two renders will not produce identical hashes for re-run events — but they implement the *same contract*, so a chain produced by either render verifies under either render's `verifyChain`. (Stretch demo: export a CSV from the Deno render, import the rows, run this render's `deno task verify`-equivalent — it verifies. That is the thesis made tangible.)

### 6.4 `appendEvent` (under the lock)

Inside `withTx` (lock already held): read the tail `this_hash` and `MAX(id)`; compute `id`, `occurred_at`, canonical `payload_json`, the hashed string, and `this_hash`; insert the explicit `id`. Same logic as first render A.6; the only change is that `id`/tail reads are race-free because of the advisory lock rather than the SQLite writer lock. `verifyChain(sql)` walks rows in `id` order, recomputes each `this_hash` from the same shape, returns the first divergent row id or `{ ok, count }`.

---

## 7. Render-layer patterns (the new Appendix A)

Every file conforms to the pattern for its kind. Where the first render's Appendix A showed Hono/HTMX, the equivalent below shows Next/RSC. The transaction boundary, the audit-emission position, and the "composition is the only mutation surface" rule are preserved exactly.

### 7.1 `lib/db.ts` — async transaction + advisory lock + Ctx/Tx

`postgres.js` exposes `sql.begin(async sql => …)`. The writer path uses the dedicated session connection and takes the advisory lock first:

```ts
import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!, { max: 10 });        // read pool
export const writer = postgres(process.env.DATABASE_URL!, { max: 1 });      // single session writer

export interface Actor { id: number; party_id: number; display_name: string; }
export interface Session { id: number; actor_id: number; token: string; }
export interface Ctx { actor: Actor | null; session: Session | null; }
export interface Tx { sql: postgres.TransactionSql; ctx: Ctx; }

const BEACON_AUDIT_LOCK = 7423001n;

/** Write-path transaction. Holds the global audit lock; commits on success, rolls back on throw. */
export async function withTx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return await writer.begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(${BEACON_AUDIT_LOCK})`;
    return await fn({ sql, ctx });
  });
}
```

Difference from the first render to call out in a doc comment: `withTx` is **async** here (the driver is async), so the first render's "no async inside withTx" rule is *relaxed* — but password hashing still happens *before* `withTx` to keep the global lock hold time minimal.

### 7.2 Atom file pattern

One per atom under `domain/`. Pure data operations over their own table; no audit emission, no transaction control, no cross-atom calls. Same as first render A.4, now `async` and using tagged-template SQL:

```ts
// domain/parties.ts — Atom: Party Identity
// Library spec: <quote the Grace Commons Party Identity text verbatim>
import type postgres from "postgres";
export interface Party { id: number; email: string; display_name: string; created_at: string; }

export async function getByEmail(sql: postgres.Sql, email: string): Promise<Party | null> {
  const [row] = await sql<Party[]>`SELECT * FROM parties WHERE email = ${email}`;
  return row ?? null;
}
export async function create(sql: postgres.Sql, email: string, display_name: string): Promise<Party> {
  if (!email || !display_name) throw new Error("parties.create: email and display_name required");
  const now = new Date().toISOString();
  const [row] = await sql<Party[]>`
    INSERT INTO parties (email, display_name, created_at)
    VALUES (${email}, ${display_name}, ${now}) RETURNING *`;
  return row;
}
```

The header-comment-quotes-the-library-spec convention (first render A.13) is preserved: every atom file and every `composition.ts` function quotes its library spec verbatim above the code.

### 7.3 `composition.ts` pattern — ported, now async

Every function: takes `Ctx` + typed input; wraps its body in `await withTx(ctx, async (tx) => …)`; calls atom helpers on `tx.sql`; calls `appendEvent(tx, …)` for **every** state change inside the same transaction; returns a plain data object; is preceded by the library-spec doc comment. The five mutating compositions (`issueInvitation`, `revokeInvitation`, `acceptInvitation`, `login`, `logout`/`revokeSession`, `grantPermission`, `revokeGrant`, `enrollSubject`, `recordVisit`) keep their exact names, inputs, emitted action codes, and audit payload fields from the first render. Argon2 work in `acceptInvitation`/`login` runs before `withTx`.

### 7.4 `auth/current.ts` + `auth/permit.ts` — C14 without middleware

Next App Router has no Hono-style middleware chain for per-route permission gates; the equivalent is a helper called at the top of each protected Server Component / Server Action:

```ts
// auth/current.ts — replaces require_session
export async function currentCtx(): Promise<Ctx> {           // reads the session cookie via next/headers cookies()
  const token = (await cookies()).get(process.env.SESSION_COOKIE!)?.value;
  const session = token ? await sessions.getActive(sql, token) : null;
  if (!session) redirect("/login");
  const actor = await actors.getById(sql, session.actor_id);
  if (!actor) redirect("/login");
  return { actor, session };
}
// auth/permit.ts — replaces require_permission
export async function requirePermission(ctx: Ctx, codes: string[]): Promise<{ scope: "all" | "own" }> {
  const active = await grants.findActiveFor(sql, ctx.actor!.id, codes);
  if (!active) forbidden(codes);            // renders the 403 surface naming the missing permission
  return { scope: active.scope };
}
```

The authorization *semantics* (which code gates which action; `'own'` vs `'all'` scope on `view_audit`) are unchanged from Demo2-plan §4/§9 — only the call mechanism (helper-at-top-of-handler instead of Hono `.use()`) differs.

### 7.5 Routes → Server Components + Server Actions

- **Reads** are Server Components (`app/**/page.tsx`): call `currentCtx()` + `requirePermission()`, then read via atom/query helpers, then render. No client JS required for reads.
- **Mutations** are Server Actions (`app/**/actions.ts`, `'use server'`): call `currentCtx()` + `requirePermission()`, then the matching `composition.ts` function, then `revalidatePath()` (the RSC equivalent of an HTMX swap). The first render's HTMX `hx-post … hx-swap` fragments map to a Server Action + `revalidatePath` (full progressive enhancement: the `<form action={serverAction}>` works without client JS) or, where a live partial swap matters (the invite-result card, the verify chip), a small `'use client'` island.
- **`GET /audit/export.csv`** is a Route Handler (`app/audit/export.csv/route.ts`) streaming the CSV with `prev_hash`/`this_hash` columns, emitting `audit.exported` — identical contract to the first render.
- The route-layer meta-events `audit.viewed` (on the `/audit` Server Component) and `audit.exported` (on the export handler) are emitted exactly as in the first render.

### 7.6 Progressive-enhancement note (a real divergence to track)

The first render advertises "no JS required to operate the app — degradation is a deliberate Part 11 robustness property" (Demo2-plan §4). React Server Actions invoked via `<form action={…}>` **do** work without client JS (full-page POST + server render), so the core flows degrade gracefully. The *live partial swaps* (HTMX `hx-swap` updating a fragment in place) require the client runtime in the Next render. **Decision:** keep every mutating flow as a plain `<form action={serverAction}>` so it works JS-off (preserving the Part 11 property), and treat the in-place swap as a progressive enhancement only. This divergence is logged in CORNERS — it is the one place the render swap visibly changes a stated property, and naming it honestly is the point.

### 7.7 `lib/password.ts` — Argon2id via `@node-rs/argon2`

Same params, same PHC output, same single-reference-point rule:

```ts
import { hash, verify } from "@node-rs/argon2";
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, /* algorithm: Argon2id (default) */ };
export const hashPassword   = (pw: string) => hash(pw, OPTS);            // → $argon2id$… PHC string
export const verifyPassword = (pw: string, encoded: string) => verify(encoded, pw);
```

### 7.8 Views, components, styling

`app/layout.tsx` imports the built inkset stylesheet and renders the same top bar (brand, current actor, log out). Components in `components/` reproduce the first render's view fragments as React components using the **same Inks.css classes**. The visual design is identical by construction; only JSX-host (`hono/jsx` → React) changes. No design decisions are re-opened.

### 7.9 Tests

Vitest, three layers mirroring first render A.12 and Decision 14:
- **atom unit** — one per atom, against an ephemeral Postgres schema per test (`helpers.ts: withTestDb` creates a temp schema / uses a transaction-rollback fixture).
- **composition rollback** — force a hash failure mid-function (the ported `_testOverrideSha256hex` hook) and assert **zero** atom rows *and* zero `event_log` rows (the all-or-nothing invariant). This is the critical test; it must pass identically to the first render.
- **e2e lifecycle** — walk invite → accept → grant → enroll → record visit → audit walk → `/audit/verify` returns "Verified N events", driving the running server (Playwright or fetch against `next start`).
- **tamper** — directly `UPDATE event_log SET payload_json=…` and assert `verifyChain` flags the exact row id.

Add a **concurrency test that has no first-render counterpart**: fire two `enrollSubject` (or two `issueInvitation`) calls concurrently and assert the chain remains linear and `verifyChain` passes — i.e., the advisory lock actually serialized them. This is the test that proves §4's mechanism works; the SQLite render never needed it.

---

## 8. Deploy (Fly.io — persistent Next + Managed Postgres)

Same provider as the first render, different shape.

- **App:** a persistent Fly machine running `next start` from the standalone build. `fly.toml` keeps `min_machines_running = 1` for the writer-connection stability the advisory lock wants (a cold-started second machine is fine for reads; the single writer connection lives on the primary). No volume mount (Postgres is the store, not a SQLite file).
- **Database:** Fly Managed Postgres, attached to the app; `DATABASE_URL` injected as a secret. **Use the direct/session connection string, not a transaction-pooled one** (Decision 2 / §4.2) or the advisory locks silently stop holding — this is the single deploy gotcha worth a bold line.
- **Migrate + seed:** a Fly release command (`migrate && seed`) so the schema and the PI/CRA/study seed land on deploy. Idempotent, so re-deploys are safe.
- **Dockerfile:** multi-stage — `next build` (standalone) in a builder, copy the standalone output into a slim `node:22-slim` runner, confirm `@node-rs/argon2`'s prebuilt linux binary is present. Sizing: a small shared machine with ~512 MB–1 GB is plenty; Argon2id is the only real compute and the demo is single-tenant.
- **Versioning note (confirm at deploy day):** Fly has reshuffled its Postgres offering (legacy unmanaged app vs. Managed Postgres); pin the exact `fly mpg create` / attach commands when we deploy rather than trusting a remembered incantation. The last deploy was a few minutes of work and this stays that way as long as the connection-mode gotcha above is respected.

---

## 9. What the experiment proves — and the divergence log to keep while building

The render succeeds as a thesis demonstration if, at the end:

1. **The spec-derived layers moved nearly verbatim.** `domain/*`, `composition.ts`, `lib/canonical.ts`, `lib/hash.ts`, the action codes, the actor roster, the permission gates — these should diff against the first render as *dialect + async*, not *redesign*. If any of them needed real rethinking, that is a finding: a stack assumption had leaked into a spec-derived layer in the first render.
2. **The two renders agree on the audit contract.** Same action codes, same payload fields, same hashed shape; a chain from either verifies under either's `verifyChain`.
3. **The only genuinely new code is the render adapter + the concurrency mechanism** (§4) + the view rewrite (§7.5). The concurrency adapter is *expected* new work — it is the implicit ordering assumption made explicit, not a defect.

**Divergence log (keep in CORNERS as you build).** Every place the second render is forced to differ is a data point about where the first render's English was under-specified or stack-dependent. Known going in:
- **Global serialization mechanism** (§4) — the big one; conflict-protocol case 3 made explicit.
- **`event_log.id` cannot be a bare IDENTITY** because it is hashed (§5.1) — a portability constraint the SQLite AUTOINCREMENT happened to satisfy.
- **`occurred_at` kept as TEXT, not `timestamptz`** to protect the hash input (§5.1).
- **No-JS degradation is partial** under RSC for live swaps (§7.6).
Any divergence *beyond* adapter + concurrency + these four is a new finding to route to the library, not patch silently.

---

## 10. Build sequence (suggested, not contractual)

Front-load the concurrency adapter, because it is where the signal and the risk live; the view layer is boring volume.

1. **Scaffold** — Next App Router, `package.json`, `docker-compose.yml` (local pg), `lib/db.ts` (pool + writer + `withTx` + **advisory lock**), inkset stylesheet wired into the root layout, `/` landing page.
2. **Schema + migrate/seed** — port `migrations/0001_init.sql` (§5), `scripts/migrate.ts`, `scripts/seed.ts` (PI Anya, CRA Jordan, permission catalog, study `BCN-OX-201`).
3. **`lib/canonical.ts` + `lib/hash.ts` ported byte-identical; `domain/event_log.ts` `appendEvent` (id-under-lock) + `verifyChain`; the tamper test.** Prove the chain before anything is built on it.
4. **Atom modules** (`domain/*`) + their unit tests (ephemeral pg schema fixture).
5. **`lib/password.ts`** (@node-rs/argon2) + **`composition.ts`** (all nine functions, async, library-spec doc comments) + the **rollback test** + the **concurrency test** (§7.9). By here the spec layer is proven end-to-end against a test client.
6. **`auth/current.ts` + `auth/permit.ts`**, then the Server Components + Server Actions for login/onboarding/people.
7. **Subjects + visits** surface (RSC pages + `enrollSubject`/`recordVisit` server actions).
8. **Audit surface** — `/audit` (filter + running verdict + `audit.viewed`), `/audit/verify`, `/audit/export.csv` route handler.
9. **Components + Inks.css polish** to visual parity with the first render; the verify chip + invite card as `'use client'` islands.
10. **`scripts/verify.ts` CLI; e2e lifecycle test; Fly deploy** (persistent machine + Managed Postgres, session connection string); README + WALKTHROUGH cross-linking the library and explicitly framing this as the second render.

By step 5 the contracts are verified in isolation; by step 8 the demo runs end-to-end; by step 10 it is Show-HN-runnable on Fly and diffable against the first render.

**Effort estimate:** roughly 2× the first render — ~2 focused build-days / 2–3 sessions. The spec-derived layers are a fast port; the time lives in the concurrency adapter (front-loaded, the part that can need iteration) and the HTMX→RSC view rewrite (volume, not difficulty).

---

## 11. CORNERS.md — seed entries

Open the build with these known divergences-vs-spec / deferrals already written down (per the CLAUDE.md implementation-discovered-findings discipline — these are *preferences/boundaries*, not contradictions in the Grace Commons spec layer):

- **Global advisory lock = global mutation serialization.** Inherent to a single global hash chain; fine for a single-site demo, a scaling ceiling for multi-site. The real fix is a **spec change** (shard the chain per study/site — alters the Audit Trail composition contract; route to the library, not a code commit). Documented in §4.4.
- **`event_log` append-only by convention, not by trigger.** Faithful port of the first render's convention-based approach. Defense-in-depth upgrade available: a `BEFORE UPDATE/DELETE … RAISE EXCEPTION` trigger (the Postgres analog of the Multi-Party Approval demo's append-only triggers). Deferred to keep v1 a faithful port.
- **No-JS degradation is partial under RSC.** Core flows use `<form action={serverAction}>` (work JS-off); live in-place swaps are progressive enhancement only. The first render's full HTMX no-JS parity is not reproduced for the swap interactions (§7.6).
- **`occurred_at` stored as TEXT, not `timestamptz`.** Protects the hash input from driver-side timestamp renormalization. A production schema might want a real timestamp column *plus* the hashed string, accepting the redundancy.
- **First-render `withTx` doc-comment debt.** The first render should note that its global audit-chain serialization is load-bearing and provided by the SQLite single-writer engine — so nobody "optimizes" it away. This is a finding *about the first render* surfaced by building the second; route it to that demo's CORNERS.
- **Library cross-link + second-render framing in README.** README must open by framing this as the *second render of the same specs*, link each composition/atom to the library, and link the first render for side-by-side diffing.

Items the spec itself already defers (named so they are not mistaken for cuts this render made): SMTP/Resend delivery polish, per-study isolation, TOTP on the PI account, actor soft-revoke — all carried over from the first render's Phase 7 / CORNERS.

---

## 12. Contract → enforcement-site (single-page reference)

| Carried-over contract | Enforced / reproduced where (this render) |
|---|---|
| Composition coverage (C16/C13/C14/APA/C1) | `composition.ts` (the five mutating compositions) + `auth/*` (C14 gates) |
| Action-code vocabulary | `composition.ts` (transcribed from first render) + `/audit` & export handlers (meta-events) |
| Hash-chain contract | `lib/canonical.ts` + `lib/hash.ts` (byte-identical) + `domain/event_log.ts` (`appendEvent`, `verifyChain`) |
| Global total ordering of the chain | `lib/db.ts` `withTx` → `pg_advisory_xact_lock` (§4) |
| `id` known-before-insert (hashed) | `domain/event_log.ts` `MAX(id)+1` under the lock (§5.1, §6.4) |
| All-or-nothing atom + audit write | `withTx` (async pg transaction) + the rollback test |
| `composition.ts` = only mutation surface | code review + every Server Action calls only `composition.ts`; no atom write outside it |
| Authorization model (codes, `own`/`all` scope) | `auth/permit.ts` + per-handler `requirePermission` calls |
| Credential interoperability (PHC Argon2id) | `lib/password.ts` (@node-rs/argon2, same params) |
| Actor roster + permission catalog + study seed | `scripts/seed.ts` |
| Visual design (Inks.css) | `styles/inkset.css` (unchanged) + `app/layout.tsx` + `components/*` |

---

*The shortest path to a convincing second render is to prove the hash-chain contract (step 3) and the concurrency adapter (§4) before building anything on top of them, then let the spec-derived layers port nearly verbatim and the view layer be boring volume. The thesis is not "Next.js can build a clinical-trial portal" — everyone knows that. The thesis is "the same public specs produced both renders, the audit contract is identical across them, and the only real new code was the adapter the swap forced into the open." If that holds, the spec was canonical.*
