# CORNERS — clinical-trial-portal-next (second render)

Deferred-vs-spec tracker. Per the repo's implementation-discovered-findings
discipline, these are **preferences and boundaries of this render**, not
contradictions in the Grace Commons spec layer. Every divergence beyond the
adapter + concurrency mechanism is a data point about where the first render's
English was stack-dependent (BUILD_PLAN §9).

## Open — divergences & deferrals

### Carried in from the plan (BUILD_PLAN §11)

- **Global advisory lock = global mutation serialization.** Inherent to a single
  global hash chain; fine for a single-site demo, a scaling ceiling for
  multi-site. The real fix is a **spec change** — shard the chain per study/site
  (a chain-key column, `prev_hash` per key), which alters the Audit Trail
  composition's contract and must go through the library's review channel, not a
  code commit (BUILD_PLAN §4.4).
- **The serialization *invariant* is not new — only the mechanism is.** Event Log
  already mandates total order (Invariant 3) and that "the underlying implementation
  must serialize them." So `pg_advisory_xact_lock` is render 2's *conforming
  mechanism* for an existing atom clause, and SQLite's single-writer is render 1's —
  one atom clause, three mechanisms (render 3's Go `sync.Mutex` is the third),
  nothing added to the spec. (BUILD_PLAN §4.3's "under-specified" wording was
  reconciled to match.) The cross-render mapping now lives canonically in
  [`EXECUTION_CONTRACT.md`](../../EXECUTION_CONTRACT.md) (Data layer contract); see
  also [`DISCOVERIES.md`](../../DISCOVERIES.md) (2026-06-06).
- **`event_log` append-only by convention, not by trigger.** Faithful port of
  render 1. Defense-in-depth upgrade available: a `BEFORE UPDATE/DELETE … RAISE
  EXCEPTION` trigger (the Postgres analog of the Multi-Party Approval demo's
  append-only triggers). Deferred to keep v1 a faithful port (BUILD_PLAN §5.2).
- **No-JS degradation is partial under RSC.** Every mutating flow is a plain
  `<form action={serverAction}>`, so the core lifecycle works with JS off. The
  *live in-place swaps* — the invite-result card (`InviteResultCard`) and the
  running verify verdict (`VerifyChip`) — require the client runtime and are
  progressive enhancement only. Render 1's full HTMX no-JS parity for those swap
  interactions is not reproduced (BUILD_PLAN §7.6). The `/audit/verify` full
  report exists precisely as the no-JS path for verification.
- **`occurred_at` stored as TEXT, not `timestamptz`.** Protects the hashed
  timestamp string from driver-side renormalization. A production schema might
  want a real timestamp column *plus* the hashed string (BUILD_PLAN §5.1).
- **First-render `withTx` doc-comment debt.** Render 1 should note that its
  global audit-chain serialization is load-bearing and provided by the SQLite
  single-writer engine, so nobody "optimizes" it into per-row connections. This
  is a finding *about render 1*, surfaced by building render 2 — route it to
  [that demo's CORNERS](../clinical-trial-portal/CORNERS.md).

### Render-layer choices made building this UI

- **Driver: `pg` + `@electric-sql/pglite` behind one `query(text, params)` seam**
  (`lib/db.ts`), instead of the plan's `postgres.js` (Decision 1). Both are raw
  SQL, no ORM — honoring A.14/Decision 1. pglite is the zero-setup **embedded**
  default (a single in-process backend = the §4 single-writer model, ideal for
  local dev and CI); `pg` is used when `DATABASE_URL` points at a real server.
  One code path for `domain/`/`composition.ts`. *(Backend decision — listed here
  for completeness; not introduced by the UI work.)*
- **Password: `node:crypto` scrypt is the default**, not Argon2id (Decision 4).
  `@node-rs/argon2`'s native binary is not added in this environment;
  `lib/password.ts` is the single reference point and falls back to scrypt.
  Conformance never inspects the password method; the only thing lost vs.
  Argon2id is **cross-render PHC credential interop**. Swap to `@node-rs/argon2`
  for the deploy.
- **Inks.css is reused as render 1's *compiled* stylesheet** (`public/beacon.css`,
  linked from `app/layout.tsx`), rather than rebuilt through Tailwind v4's PostCSS
  inside the Next build. This guarantees pixel parity *by construction* (BUILD_PLAN
  §7.8) and avoids wiring `@tailwindcss/postcss`, which is not installed here. The
  Tailwind **source** is still kept in `styles/inkset.css` + `styles/tailwind.css`
  for fidelity to the plan's file layout; re-wire the build for production if a
  source-of-truth CSS pipeline is wanted. Components only ever reuse render 1's
  existing class vocabulary, so the compiled sheet covers them.
- **Retention display-filter is read-only here.** Render 1's "show all / restore
  filter" toggle was a *direct* mutation of the `retention_policy` atom (a config
  preference, no audit event). This render's `retention_policy` atom exposes only
  `get`/`ensure` and the backend contract is frozen, so rather than widen the atom
  surface or write to a table outside `composition.ts`, the toggle is omitted and
  the policy is shown read-only. The seed sets `enforce_on_read = false` (full
  chain visible), which is the demo's default state regardless.
- **Service worker / PWA offline not reproduced.** Render 1 registered
  `/static/sw.js`; this render omits it to avoid dev-cache surprises. The web
  manifest, favicon, and Alliance fonts are served from `public/` for visual
  parity.
- **Audit presentation.** The list shows the actor as `actor#<id>` (render-1
  parity) and renders newest-first for readability; the CSV export stays
  oldest-first (chain order) so an external verifier can re-walk it.

### Test layer (BUILD_PLAN §7)

- **Ported to `node:test`, not Vitest.** BUILD_PLAN §7 planned Vitest + Playwright;
  the suite is instead **`node --test` + `node:assert/strict`** — zero new
  dependencies (the repo's dependency-light house style), driven against an
  ephemeral in-memory pglite (`PGLITE_DIR="memory://"`, the seam `lib/db.ts`
  documents for tests). **117 tests across 15 files** mirror render 1's layers
  one-to-one: 12 atom unit suites (`tests/atoms/`), composition rollback +
  named-rejection (`composition.test.ts`), hash-chain tamper-evidence
  (`tamper.test.ts`), and the full lifecycle walk (`e2e.test.ts`).
  `tests/_helpers.ts` keeps one warm pglite per test file and runs
  `TRUNCATE … RESTART IDENTITY` between tests — isolation without paying the WASM
  init per test. `e2e.test.ts` drives the `composition.ts` surface directly (render
  1 drove HTTP routes; render 2 has none to POST to) and asserts the audit log
  equals the lifecycle's events *in exact order* (stronger than render 1's
  set-membership). This closes the §7 gap — until now the render shipped a `test`
  script with no tests behind it.
- **`test` script fixed.** Was `node --test tests/` — a trailing-slash directory
  arg node 22.22 resolves as a missing module (the script never ran). Now
  `node --test "tests/**/*.test.ts"` (node expands the glob itself, so it is
  `sh`-safe under `npm test` and recurses into `tests/atoms/`).
- **Divergences the port surfaced — render 2's domain surface is deliberately
  leaner.** Several render-1 helpers/validations are absent; the ported tests
  assert render 2's *actual* behavior (each adaptation noted inline in the test
  file), never a weakened check: no `display_name` on the Actor row (it lives on
  the bound Party); `credentials` exposes only `getActiveByActorId`/`create` (no
  `revoke`/`getById`); no `grants.listForActor`, `subjects.getByCode` /
  `updateStatus`, or `visits.getById`; `subjects` codes are `COUNT(*)+1` (vs render
  1's max-suffix+1); `studies`/`visits` `create` dropped render 1's empty-field
  guards (Postgres `NOT NULL` accepts `""`); `retention_policy.ensure` seeds
  `enforce_on_read=false` and is `ON CONFLICT DO NOTHING`. None is a spec
  contradiction — each is a render-layer data point of the kind this file tracks.

## Convention (carried, not cuts)

- **`composition.ts` is the only mutation surface** for the five business
  mutations. The two route-layer **meta-events** (`audit.viewed`, `audit.exported`)
  are appended directly via `withTx` + `appendEvent` in the audit page / export
  route — the same sanctioned seam render 1 uses, deliberately *not* routed
  through `composition.ts`.
- **C14 gates are helpers, not middleware.** `auth/current.ts` + `auth/permit.ts`
  are called at the top of each protected page / Server Action; they read only and
  never import `composition.ts`.
- **Bootstrap identities** (the seed's PI/CRA/permissions/study) are written
  directly with no audit events — the documented Bootstrap Identity seam; the
  first real event is the PI's first login.

## Spec-level deferrals (carried from render 1, not cuts this render made)

SMTP/Resend delivery polish, per-study isolation, TOTP on the PI account, actor
soft-revoke — all carried over from the first render's Phase 7 / CORNERS.
