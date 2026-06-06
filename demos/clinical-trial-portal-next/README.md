# Beacon Clinical Research — **Second Render** (Next.js + PostgreSQL + RSC)

**Thesis: the spec is canonical.** This is the *second render* of the same Grace
Commons compositions that produced [`demos/clinical-trial-portal`](../clinical-trial-portal/)
(the first render: Deno + Hono + SQLite + HTMX). It re-expresses the **same**
compositions, the **same** actor roster, the **same** `composition.ts` action
codes, and the **same** hash-chain contract onto a maximally-different stack —
**Next.js App Router + PostgreSQL + React Server Components + Server Actions** —
to show that the library specs survive a stack swap. Only the render layer
changes. If the two renders agree on every audit event and every invariant while
sharing almost no infrastructure code, the thesis holds. See [`BUILD_PLAN.md`](./BUILD_PLAN.md).

This render is one half of that experiment; read it next to the first render and
[diff them](#what-ported-vs-what-was-rewritten).

## The five compositions (each links to the library spec)

| Composition | Library spec | Where it lives here |
|---|---|---|
| **C16 External Onboarding** | [`compositions/external-onboarding.md`](../../compositions/external-onboarding.md) | `composition.ts` `issueInvitation` / `acceptInvitation` / `revokeInvitation`; `app/people`, `app/invitations/accept/[token]` |
| **C13 Login** | [`compositions/login.md`](../../compositions/login.md) | `composition.ts` `login` / `logout`; `app/login` |
| **C14 Session-Gated Authorization** | [`compositions/session-gated-authorization.md`](../../compositions/session-gated-authorization.md) | `auth/current.ts` (session → Ctx) + `auth/permit.ts` (grant + scope), called at the top of every protected page / action |
| **APA — Attributed Permissions Admin** | [`compositions/attributed-permissions-admin.md`](../../compositions/attributed-permissions-admin.md) | `composition.ts` `grantPermission` / `revokeGrant`; `app/people` |
| **C1 Audit Trail** | [`compositions/audit-trail.md`](../../compositions/audit-trail.md) | `domain/event_log.ts` (`appendEvent`/`verifyChain`) + `app/audit/*` |

Backing atoms: [party-identity](../../atoms/compliance/party-identity.md),
[actor-identity](../../atoms/compliance/actor-identity.md),
[credential](../../atoms/compliance/credential.md),
[session](../../atoms/compliance/session.md),
[permissions](../../atoms/compliance/permissions.md),
[invitation](../../atoms/compliance/invitation.md),
[event-log](../../atoms/temporal/event-log.md),
[tamper-evidence](../../atoms/compliance/tamper-evidence.md),
[retention-window](../../atoms/compliance/retention-window.md).

## Stack

- **Next.js 15 (App Router, React 19)** — Server Components for reads, **Server Actions** for the five mutations (the HTMX-swap equivalents).
- **PostgreSQL**, raw SQL, no ORM. By default an **embedded** Postgres (`@electric-sql/pglite`) under `./data/pg` — zero setup. Point `DATABASE_URL` at a real server (`pg`) for deploy. Both sit behind one `query(text, params)` seam in `lib/db.ts`.
- **One global advisory lock** serializes the audit chain (`pg_advisory_xact_lock`) — the one genuinely new engineering surface the swap forces into the open (BUILD_PLAN §4).
- **Inks.css** — render 1's compiled stylesheet, reused verbatim for pixel parity.

## Getting started

The embedded database needs no Docker and no Postgres install.

```bash
npm install
npm run migrate     # apply migrations/0001_init.sql to ./data/pg
npm run seed        # PI Anya, CRA Jordan, 5 permissions, study BCN-OX-201, genesis event
npm run dev         # http://localhost:3000
```

CLI affordances (for monitors who do not trust the web UI):

```bash
npm run verify       # recompute the audit hash chain and print the verdict
npm run prove-chain  # demonstrate tamper-evidence end to end
```

To run against a real Postgres, set `DATABASE_URL` to a **direct / session**
connection string — **not** a transaction-pooled one (PgBouncer transaction
mode / a serverless pooler), or `pg_advisory_xact_lock` silently stops holding
and the global audit chain can fork (BUILD_PLAN Decision 2 / §4.2).

### Logins (seeded)

| Role | Email | Password | Grants |
|---|---|---|---|
| Principal Investigator | `anya@beacon.clinical` | `demo-pi` | all five permissions (`all` scope) |
| Clinical Research Associate | `jordan@beacon.clinical` | `demo-cra` | `view_audit` (`all` scope) |

Study: **BCN-OX-201** — *Beacon Oncology Phase II Trial*.

## Routes

| Path | Surface | C14 gate |
|---|---|---|
| `/login` | C13 sign-in | — |
| `/invitations/accept/[token]` | C16 onboard (set password) | — (bearer token) |
| `/dashboard` | role-aware tiles | session |
| `/people` | actors, grants, invitations (APA) | `invite_actor` or `grant_permission` |
| `/subjects`, `/subjects/new`, `/subjects/[id]` | enroll / record visits | `enroll_subject` or `record_visit` (scope-filtered) |
| `/audit` | filterable log + running verdict | `view_audit` (scope `own`/`all`) |
| `/audit/verify` | full chain recompute | `view_audit` |
| `/audit/export.csv` | CSV with `prev_hash`/`this_hash` | `view_audit` |

## Architecture

**The seam.** Every mutation goes through `composition.ts` — the only mutation
surface. Each function runs inside `withTx` (one all-or-nothing transaction),
writes one or more atom rows, and emits one or more audit events; if any step
throws, the whole thing rolls back (atom rows *and* event rows). Atom files under
`domain/` are read/write helpers only — no audit emission, no transaction
control, no cross-atom calls.

**C14 without middleware.** Next has no Hono-style middleware chain, so the
session and permission gates are helpers called at the top of each protected
handler (BUILD_PLAN §7.4):

- `auth/current.ts` — `currentCtx()` / `currentUser()` resolve the session cookie
  to the same `Ctx` that `composition.ts` consumes, redirecting to `/login` on
  failure (replaces render 1's `require_session`).
- `auth/permit.ts` — `permit(ctx, codes)` returns the matching grant's scope
  (`all` | `own`) or `null` (= denial); the scope flows downstream so the audit
  and subjects surfaces show all rows vs. only the actor's own (replaces render 1's
  `require_permission`). The authorization *semantics* are unchanged; only the
  call mechanism differs.

**Audit trail.** `event_log` is a single global SHA-256 hash chain over canonical
JSON, with `actor_id`/`session_id` attribution on every row, append-only by
convention. The `id` is part of the hashed payload, so it is assigned
`MAX(id)+1` **under the advisory lock** before insert — not delegated to a
sequence (BUILD_PLAN §5.1, §6.4). Viewing and exporting the log are themselves
regulated acts, so `/audit` emits `audit.viewed` and `/audit/export.csv` emits
`audit.exported` — the sanctioned route-level meta-event seam, exactly as in
render 1.

**The one new surface — global serialization (BUILD_PLAN §4).** SQLite's
single-writer lock gave render 1 a total order over the chain for free; Postgres
MVCC does not. `withTx` takes `pg_advisory_xact_lock(7423001)` as its first
statement, so every mutation totally orders against every other — the SQLite
guarantee made explicit, named, and spec-traceable. This is the only genuinely
new code the swap required.

## What ported vs. what was rewritten

The whole point. Read this render against [the first](../clinical-trial-portal/):

- **Ported nearly verbatim** (dialect + async only): `domain/*`, `composition.ts`,
  `lib/canonical.ts`, `lib/hash.ts`, the action codes, the actor roster, the
  permission gates. These should diff as *port*, not *redesign*.
- **Rewritten** (the render layer): `app/` (RSC pages + Server Actions replace
  Hono routes + HTMX views), `auth/` (helpers replace middleware), `lib/db.ts`
  (the driver + the advisory lock).
- **Genuinely new**: the global-serialization adapter (§4) — *expected* new work,
  the implicit ordering assumption made explicit.

The audit contract is identical across renders: same action codes, same payload
fields, same hashed shape. A chain produced by either render verifies under
either render's verifier.

## Render-layer divergences

Tracked honestly in [`CORNERS.md`](./CORNERS.md). The notable ones: the driver
choice (pg/pglite behind one seam, vs. the plan's postgres.js), scrypt as the
default password hash with Argon2id reserved for deploy, no-JS degradation is
*partial* under RSC for the live in-place swaps, the retention display-filter is
read-only here, and the Inks.css is reused as render 1's compiled output rather
than re-built through Tailwind's PostCSS in Next.

## Reading guide

- **What is this?** The thesis above, and [`BUILD_PLAN.md`](./BUILD_PLAN.md).
- **The five-minute tour:** [`WALKTHROUGH.md`](./WALKTHROUGH.md).
- **Show me the code:** start at `composition.ts` (mutations) → `auth/*` (C14
  gates) → `app/audit/*` (the audit surface) → `lib/db.ts` (the transaction +
  advisory lock).
- **The first render, to diff against:** [`../clinical-trial-portal`](../clinical-trial-portal/).

## Legal / regulatory framing

A teaching demo, not a validated system. It models FDA 21 CFR Part 11 properties
(attributable, append-only, tamper-evident records; retention; access control)
to make the compositions concrete. No real subject data; subject codes are
synthetic and sequential.
