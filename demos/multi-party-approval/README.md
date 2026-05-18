# Multi-Party Approval — Demo

Working implementation of the [Multi-Party Approval composition](../../compositions/multi-party-approval.md).

## Stack

Deno + Hono (JSX) + SQLite (`@db/sqlite`) + HTMX + Tailwind 4 (`@tailwindcss/cli`). Server-rendered hypermedia; no client-side framework. JSX is compiled via Hono's `react-jsx` adapter (`jsxImportSource: "hono/jsx"`). All imports are declared in `deno.json`.

## Quick start

```sh
deno task setup      # download npm deps (node_modules/) — run once
deno task migrate    # apply schema.sql to data/grace-commons-demo.sqlite
deno task seed       # insert demo actors, chains, and steps
deno task dev        # watch-mode: Tailwind rebuild + Deno server on :8000
deno task build:css  # single-pass Tailwind build (app.css → public/styles.css)
deno task test       # run the full test suite under tests/
```

## Source tree

- `src/app.ts` — Hono app factory; wires middleware and route groups.
- `src/main.ts` — entry point; opens the DB connection and calls `app.ts`.
- `src/config.ts` — environment and runtime constants (DB path, port).
- `src/db/` — `client.ts` (singleton DB handle), `migrate.ts` (runs `schema.sql`), `seed.ts`, `schema.sql`.
- `src/domain/` — pure business logic: `approval_step.ts`, `assignment.ts`, `actor.ts`, `chain.ts`, `quorum.ts`, `audit_trail.ts`, `permissions.ts`. No HTTP concerns.
- `src/middleware/` — `current_actor.ts` (session-cookie actor resolution), `error.ts` (structured error responses).
- `src/routes/` — Hono route handlers: `chains.ts`, `steps.tsx`, `audit.ts`, `auth.ts`, `verify.ts`, `admin.ts`, `pages.tsx` (full-page renders).
- `src/views/` — JSX view components: `layout.tsx`, `chain_list.tsx`, `chain_detail.tsx`, `in_tray.tsx`, `audit_log.tsx`, `new_chain.tsx`, `fragments.tsx` (HTMX partial responses).
- `app.css` — Tailwind 4 source; `src/inkset.css` — design-token CSS variables (ink palette).

## Tests

- `approval_step.test.ts` — Unit tests for approval_step.ts and assignment.ts atoms (submit, approve, reject, withdraw).
- `quorum.test.ts` — Exhaustive quorum.ts coverage; named scenarios cross-referenced to spec worked examples and BUILD_PLAN.md §6.
- `audit_tamper.test.ts` — Six forgery-detection tests against fresh in-memory DBs; verifies hash-chain integrity under tampering.
- `invariants.test.ts` — One test per application-level invariant from BUILD_PLAN.md §12; this is the primary spec-conformance file.
- `scenarios.test.ts` — HTTP-level walkthroughs via `app.fetch()` (Hono test interface, no server started).

## Implementation findings

`CORNERS.md` records preferences and judgment calls made during the build — cases where the spec was silent or admitted multiple readings. Contradictions *within* the spec belong in the spec's Lineage notes via the standard review channel, not here; see `../README.md` and `../../CLAUDE.md` for that methodology.

## Build history

`BUILD_PLAN.md` is the full build arc: phased task breakdown, schema decisions, route design, and the list of application-level invariants (§12). Read it to understand why the implementation is shaped the way it is.

## Visual design

`VisualDesignSystem.md` documents the ink palette, typographic scale, and component conventions used in the views.
