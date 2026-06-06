// tools/conformance/render5/db.mjs
//
// render 5 — "Beacon Clinical Research" portal, Next.js + PostgreSQL conventions.
//
// The database client module. In a real Next.js app this is the singleton you
// import as `import { db } from "@/lib/db"` from every server action — one
// connection pool for the whole process. Here the pool is a PGlite instance
// (real Postgres compiled to WASM, in-process), so the whole app runs headless
// under plain Node with no Postgres server and no Docker.
//
// pglite is ASYNC end-to-end. Server actions await it; the conformance
// validator loads a snapshot once and exposes synchronous accessors over it
// (see adapters/clinical-trial-portal-nextjs.adapter.mjs).

import { PGlite } from "@electric-sql/pglite";

// ── connection ──────────────────────────────────────────────────────────────
// One client per dbPath, memoised the way a Next.js `globalThis`-pinned pool is
// (so hot-reload in dev does not open a second pool). dbPath is a DIRECTORY:
// PGlite persists a data dir on disk so the validator can re-open the store in a
// separate process.

const _clients = new Map();

export async function getDb(dbPath) {
  if (_clients.has(dbPath)) return _clients.get(dbPath);
  const client = new PGlite(dbPath);
  await client.waitReady;
  _clients.set(dbPath, client);
  return client;
}

export async function closeDb(dbPath) {
  const c = _clients.get(dbPath);
  if (c) {
    await c.close();
    _clients.delete(dbPath);
  }
}

// ── migrations ────────────────────────────────────────────────────────────────
// The schema is this render's OWN choice — deliberately distinct vocabulary.
// Postgres-idiomatic: snake_case tables, bigserial surrogate keys, timestamptz,
// jsonb payloads, FKs, partial unique indexes. The audit log is `audit_event`;
// its internal action vocabulary (auth.login_ok, session.started, …) is mapped
// to the canonical spec vocabulary only at the validator-adapter seam.

const MIGRATION = `
CREATE TABLE IF NOT EXISTS party (
  party_id      BIGSERIAL PRIMARY KEY,
  display_name  TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  enrolled_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  staff_id    BIGSERIAL PRIMARY KEY,
  party_id    BIGINT      NOT NULL REFERENCES party(party_id),
  role        TEXT        NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS secret (
  secret_id   BIGSERIAL PRIMARY KEY,
  staff_id    BIGINT      NOT NULL REFERENCES staff(staff_id),
  algo        TEXT        NOT NULL,
  salt        TEXT        NOT NULL,
  digest      TEXT        NOT NULL,
  minted_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS access_token (
  token_id    BIGSERIAL PRIMARY KEY,
  staff_id    BIGINT      NOT NULL REFERENCES staff(staff_id),
  token       TEXT        NOT NULL UNIQUE,
  started_at  TIMESTAMPTZ NOT NULL,
  lapses_at   TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS enrollment_invite (
  invite_id    BIGSERIAL PRIMARY KEY,
  token        TEXT        NOT NULL UNIQUE,
  invitee_email TEXT       NOT NULL,
  display_name TEXT        NOT NULL,
  intended_role TEXT       NOT NULL,
  issued_by_staff BIGINT   NOT NULL REFERENCES staff(staff_id),
  issued_at    TIMESTAMPTZ NOT NULL,
  claimed_at   TIMESTAMPTZ,
  claimed_by_staff BIGINT  REFERENCES staff(staff_id),
  claimed_party BIGINT     REFERENCES party(party_id),
  withdrawn_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS authority (
  authority_id BIGSERIAL PRIMARY KEY,
  holder_staff BIGINT      NOT NULL REFERENCES staff(staff_id),
  capability   TEXT        NOT NULL,
  reach        TEXT        NOT NULL,
  granted_by_staff BIGINT  REFERENCES staff(staff_id),
  granted_at   TIMESTAMPTZ NOT NULL,
  withdrawn_at TIMESTAMPTZ,
  withdraw_note TEXT
);

CREATE TABLE IF NOT EXISTS study_subject (
  subject_id   BIGSERIAL PRIMARY KEY,
  subject_code TEXT        NOT NULL UNIQUE,
  protocol     TEXT        NOT NULL,
  enrolled_by_staff BIGINT NOT NULL REFERENCES staff(staff_id),
  enrolled_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_visit (
  visit_id     BIGSERIAL PRIMARY KEY,
  subject_id   BIGINT      NOT NULL REFERENCES study_subject(subject_id),
  visit_kind   TEXT        NOT NULL,
  recorded_by_staff BIGINT NOT NULL REFERENCES staff(staff_id),
  recorded_at  TIMESTAMPTZ NOT NULL
);

-- The tamper-evident audit log. seq is the totally-ordered identity used in the
-- hash chain; link_hash is sha256 over the canonical fields incl. seq + prev.
CREATE TABLE IF NOT EXISTS audit_event (
  seq          BIGINT      PRIMARY KEY,
  happened_at  TIMESTAMPTZ NOT NULL,
  actor_staff  BIGINT      REFERENCES staff(staff_id),
  token_id     BIGINT      REFERENCES access_token(token_id),
  verb         TEXT        NOT NULL,
  subject_kind TEXT,
  subject_ref  BIGINT,
  detail       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  parent_hash  TEXT        NOT NULL,
  link_hash    TEXT        NOT NULL
);

-- Single-row retention configuration for the audit log (filter-on-read).
CREATE TABLE IF NOT EXISTS retention_rule (
  id            INT  PRIMARY KEY DEFAULT 1,
  horizon_days  INT  NOT NULL,
  filter_on_read BOOLEAN NOT NULL,
  CONSTRAINT retention_singleton CHECK (id = 1)
);

-- A counter row to hand out audit seq numbers monotonically.
CREATE TABLE IF NOT EXISTS audit_cursor (
  id      INT    PRIMARY KEY DEFAULT 1,
  next_seq BIGINT NOT NULL DEFAULT 1,
  last_hash TEXT  NOT NULL DEFAULT '',
  CONSTRAINT cursor_singleton CHECK (id = 1)
);
`;

export async function migrate(db) {
  await db.exec(MIGRATION);
}
