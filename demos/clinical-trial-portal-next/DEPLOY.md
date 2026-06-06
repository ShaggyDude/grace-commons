# Deploy — clinical-trial-portal-next on Fly.io

A runbook to get the Next.js render running as a **clickable public demo**. It is
the executable form of BUILD_PLAN §8, with one deliberate simplification for the
demo (see *Storage*). Execute it with `flyctl`; nothing here has been run from the
build sandbox (no Fly access, and `next build` can't run there), so treat the two
config files as carefully-constructed-from-render-1 but shake them out on the first
real `fly deploy` — the likely friction points are flagged inline.

Render 1 (`demos/clinical-trial-portal`) is already deployed this way (SQLite file
on a volume, `migrate && seed && start` on boot); this mirrors that shape.

---

## The one decision: storage

| Option | What | When |
|---|---|---|
| **1 — pglite on a Fly volume (recommended for the demo)** | No external DB. `DATABASE_URL` unset → the app uses embedded pglite (`lib/db.ts`) at `PGLITE_DIR`, pointed at a mounted volume. One machine, one in-process writer. | The clickable demo. Fastest, cheapest, fewest moving parts. |
| **2 — Fly Managed Postgres** | `DATABASE_URL` = a **direct/session** connection string; the `pg` path in `lib/db.ts`; the advisory lock is real cross-connection. | Production-shaped / multi-machine. BUILD_PLAN §8's intent. |

**Recommendation: Option 1.** A single-site demo doesn't need Managed Postgres, and
pglite is a single in-process backend — so the BUILD_PLAN §4 audit-chain
serialization is satisfied inherently (exactly as render 1's SQLite single-writer
gives it for free; no `pg_advisory_xact_lock` needed). This is a deliberate
divergence from §8's Managed-Postgres line, traded for demo simplicity; Option 2
below is the upgrade path. (Worth a one-line CORNERS entry if we keep it.)

> **If you choose Option 2:** the `DATABASE_URL` **must** be the direct/SESSION
> connection string, **not** a transaction-pooled one (PgBouncer transaction mode /
> a serverless pooler), or `pg_advisory_xact_lock` silently stops holding and the
> audit chain can fork (BUILD_PLAN Decision 2 / §4.2). This is the single
> deploy-day gotcha for the Postgres path.

The rest of this doc assumes **Option 1**.

---

## Files to add

Neither exists yet in this render. Add both at the render root
(`demos/clinical-trial-portal-next/`).

### `.dockerignore`

```
node_modules
.next
data
.git
*.jsonl
out.jsonl
```

### `Dockerfile`

Two paths. **Path A** (below) is the simplest reliable one and matches render 1's
proven "migrate && seed && start" boot. **Path B** (notes after) is the leaner
standalone image BUILD_PLAN §8 envisions — defer it; it has a real wrinkle.

```dockerfile
# ---- builder ----
FROM node:22-bookworm AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # next build (standalone output is produced but Path A runs `next start`)

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Copy the whole built app (node_modules + .next + source). This is heavier than a
# standalone image, but it lets BOTH `next start` AND the .ts migrate/seed scripts
# run without extra wiring — the scripts/ + migrations/ + lib/ + domain/ sources and
# the pglite native package are all present. (Path B trims this; see below.)
COPY --from=builder /app ./
RUN mkdir -p /data
EXPOSE 3000
# Idempotent on every boot; pglite data lives on the /data volume.
CMD ["sh","-c","node scripts/migrate.ts && node scripts/seed.ts && npm run start"]
```

Notes / likely friction:

- **Node ≥ 22.18** is required because `migrate`/`seed` run `.ts` directly
  (`node scripts/migrate.ts`) and rely on default type-stripping. `node:22-bookworm`
  is fine in 2026; if you pin an older minor, add `--experimental-strip-types`.
- **`next build` memory.** The build is memory-heavy; use Fly's remote builder
  (default) or a local Docker with ≥2–4 GB. (The SIGBUS you'd see in the locked-down
  build sandbox is a sandbox artifact, not a real build failure — it built clean on
  your machine.)
- **`outputFileTracingRoot`** is already pinned in `next.config.ts`, so the
  multiple-lockfile warning won't mislocate the trace.
- **Health endpoint.** `app/api/health/route.ts` (added) returns 200 when the
  embedded DB answers, 503 otherwise; the `fly.toml` check above probes it. For a
  Docker-level probe instead (non-Fly hosts), add to the runner:
  `HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"`
  — note the `.on('error', …)` and the 40s start-period: the original review snippet
  omitted the error handler (a connection-refused during boot would hang to timeout
  rather than fail fast) and pointed at `/api/health` before it existed.
- **Path B (lean standalone, later):** copy only `.next/standalone`, `.next/static`,
  and `public/`, then run `node server.js`. The wrinkle: the standalone output does
  **not** include `scripts/`, `migrations/`, or the source `.ts` the seed imports, so
  you must additionally `COPY` `scripts/ migrations/ lib/ domain/ composition.ts` and
  confirm pglite landed in the traced `node_modules`. Worth it for image size once the
  demo is stable; not worth it for the first deploy.

### `fly.toml`

```toml
app = 'beacon-clinical-next'      # pick a unique app name
primary_region = 'sjc'

[build]

[env]
  PGLITE_DIR = '/data/pg'          # embedded Postgres lives on the volume
  SESSION_COOKIE = 'beacon_session'
  PORT = '3000'
  HOSTNAME = '0.0.0.0'
  NODE_ENV = 'production'

[[mounts]]
  source = 'beacon_next_data'
  destination = '/data'

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1         # keep one warm: it is the single writer to the
                                   # volume-backed pglite, and a demo should be
                                   # instantly clickable

# Fly-native health check → /api/health (200 only when the embedded DB answers).
# Restarts a wedged machine fast. grace_period covers migrate+seed+boot, which run
# before the server starts listening.
[[http_service.checks]]
  interval = '30s'
  timeout = '5s'
  grace_period = '40s'
  method = 'GET'
  path = '/api/health'

[[vm]]
  memory = '1gb'                   # Next server + pglite WASM; 512 MB is tight
  cpu_kind = 'shared'
  cpus = 1
```

**Single-machine by design.** A Fly volume attaches to exactly one machine, and
pglite wants exactly one in-process writer — so this demo runs as one machine. Do
not scale to >1 machine on Option 1 (you'd get one writer per volume, divergent
chains). Horizontal scaling is the Option-2 (Managed Postgres) upgrade.

---

## Deploy steps

```bash
cd demos/clinical-trial-portal-next
flyctl auth login

# Create the app without deploying (so we can make the volume first).
flyctl apps create beacon-clinical-next        # or: flyctl launch --no-deploy --copy-config

# One persistent volume in the same region as the app.
flyctl volumes create beacon_next_data --region sjc --size 1   # 1 GB is plenty

# Deploy. The release runs migrate + seed (idempotent) then starts the server.
flyctl deploy

flyctl open                                    # opens https://beacon-clinical-next.fly.dev
```

No secrets are needed for Option 1 (everything is plain `[env]`). For Option 2, set
the session connection string instead: `flyctl secrets set DATABASE_URL='postgres://…'`
(direct/session, per the gotcha above), and drop `PGLITE_DIR`.

---

## Verify after deploy

1. Open the URL → redirected to `/login`.
2. Sign in as PI **anya@beacon.clinical / demo-pi** → dashboard with all tiles.
3. Walk the lifecycle: People → invite a coordinator (copy the in-UI accept link) →
   accept in a private window → grant `enroll_subject` → enroll a subject → record a
   visit.
4. Audit → **Verify chain** shows "Verified N events"; **Export CSV** downloads with
   `prev_hash`/`this_hash`.
5. (Optional, from your machine) `flyctl ssh console` then `node scripts/verify.ts`
   → "Verified N events" from the CLI, independent of the web UI.

If all five pass, the post can link a genuinely-clickable, audit-verifiable app.

---

## Link it (after deploy)

Once the URL is live, add a Live demo block to this render's `README.md` — keep the
URL in sync with `fly.toml`'s `app =`:

```markdown
### Live demo
https://beacon-clinical-next.fly.dev
Login: `anya@beacon.clinical` / `demo-pi` (PI) · `jordan@beacon.clinical` / `demo-cra` (CRA)
```

Pick **one** app name and make `fly.toml` `app =`, the README URL, and the post all
match it (the review draft floated `grace-ctp-next.fly.dev`; `beacon-clinical-next`
keeps the Beacon naming consistent with render 1's `beacon-clinical` — your call,
just use it everywhere).

---

## Public-demo considerations (not blockers, decide before sharing widely)

- **Seeded credentials are public** (printed on the login page and in the README).
  That's intended for a demo; just know anyone can sign in and mutate.
- **Data accumulates.** Visitors enroll subjects, issue invitations, etc., and the
  audit chain grows. Fine for a while; for a tidy demo, add a periodic reseed — a
  scheduled `flyctl machine run … 'rm -rf /data/pg && node scripts/migrate.ts && node scripts/seed.ts'`
  (or wipe the volume) on a cadence. No real PII is ever stored (subject codes are
  synthetic and sequential).
- **Abuse / rate limiting.** A public mutating demo can be spammed. Low priority for
  launch; revisit if it gets traffic.
- **Cost.** ~one shared-CPU 1 GB machine + a 1 GB volume — a few dollars a month.

---

## Redeploys & reset

- `migrate`/`seed` are idempotent, so `flyctl deploy` is safe to re-run; existing
  data on the volume is preserved.
- To reset the demo to a clean seed: wipe the volume's `pg` dir (the reseed command
  above) or destroy + recreate `beacon_next_data`, then redeploy.

---

## Open the door to "every render clickable"

This same shape (volume + embedded store + `migrate && seed && start`) is how a
future Go render would deploy too — `modernc.org/sqlite` on a Fly volume in place of
pglite. Not needed for the post; noted so the pattern is reusable.
