-- Grace Commons Demo 2 — SECOND RENDER (Next.js + PostgreSQL)
-- Postgres dialect port of demos/clinical-trial-portal/migrations/0001_init.sql.
-- Atom→table mapping, column meanings, CHECKs, partial index, and ON DELETE
-- RESTRICT discipline are UNCHANGED. Only SQLite→Postgres deltas differ
-- (BUILD_PLAN §5.1): IDENTITY keys (except event_log.id), native BOOLEAN.
-- created_at / occurred_at stay TEXT (ISO-8601) because they are hashed verbatim
-- — a timestamptz round-trip could renormalize the string and change the hash.

-- Party Identity atom
CREATE TABLE IF NOT EXISTS parties (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Actor Identity atom
CREATE TABLE IF NOT EXISTS actors (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id      BIGINT NOT NULL REFERENCES parties(id),
  created_at    TEXT NOT NULL
);

-- Credential atom (password kind only for the demo)
CREATE TABLE IF NOT EXISTS credentials (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id      BIGINT NOT NULL REFERENCES actors(id),
  kind          TEXT NOT NULL CHECK (kind IN ('password')),
  secret_hash   TEXT NOT NULL,                       -- Argon2id PHC string (cross-render verifiable)
  created_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- Session atom
CREATE TABLE IF NOT EXISTS sessions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id      BIGINT NOT NULL REFERENCES actors(id),
  token         TEXT NOT NULL UNIQUE,                -- opaque random; HttpOnly cookie
  issued_at     TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- Permissions atom: registry of permission codes
CREATE TABLE IF NOT EXISTS permissions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL
);

-- Permissions atom: grants
CREATE TABLE IF NOT EXISTS grants (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grantor_actor_id BIGINT NOT NULL REFERENCES actors(id),
  grantee_actor_id BIGINT NOT NULL REFERENCES actors(id),
  permission_id    BIGINT NOT NULL REFERENCES permissions(id),
  scope            TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','own')),
  issued_at        TEXT NOT NULL,
  revoked_at       TEXT,
  revoke_reason    TEXT
);
CREATE INDEX IF NOT EXISTS idx_grants_grantee
  ON grants(grantee_actor_id, permission_id) WHERE revoked_at IS NULL;

-- Invitation atom
CREATE TABLE IF NOT EXISTS invitations (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id             BIGINT NOT NULL REFERENCES parties(id),
  intended_role        TEXT NOT NULL,
  token                TEXT NOT NULL UNIQUE,
  issued_by_actor_id   BIGINT NOT NULL REFERENCES actors(id),
  issued_at            TEXT NOT NULL,
  expires_at           TEXT NOT NULL,
  accepted_at          TEXT,
  accepted_by_actor_id BIGINT REFERENCES actors(id),
  revoked_at           TEXT
);

-- Event Log atom (C1 audit substrate).
-- id is NOT an IDENTITY: it is part of the hashed payload, so it is assigned
-- explicitly as MAX(id)+1 under the global advisory lock (BUILD_PLAN §4/§6.4),
-- not delegated to a sequence.
CREATE TABLE IF NOT EXISTS event_log (
  id            BIGINT PRIMARY KEY,
  occurred_at   TEXT NOT NULL,                        -- ISO-8601; hashed verbatim
  actor_id      BIGINT REFERENCES actors(id),         -- nullable for anonymous events (login.failed)
  session_id    BIGINT REFERENCES sessions(id),
  action        TEXT NOT NULL,
  target_kind   TEXT,
  target_id     BIGINT,
  payload_json  TEXT NOT NULL DEFAULT '{}',           -- canonicalized JSON; hashed verbatim
  prev_hash     TEXT NOT NULL,                        -- '' for row #1
  this_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_event_log_actor  ON event_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_event_log_target ON event_log(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_event_log_action ON event_log(action);
CREATE INDEX IF NOT EXISTS idx_event_log_time   ON event_log(occurred_at);

-- Retention Window atom: configuration only, single-row
CREATE TABLE IF NOT EXISTS retention_policy (
  id              BIGINT PRIMARY KEY CHECK (id = 1),
  days            BIGINT NOT NULL DEFAULT 2555,        -- 7 years per Part 11
  enforce_on_read BOOLEAN NOT NULL DEFAULT TRUE
);

-- Regulated-artifact tables (not atoms — what the audit trail attributes)
CREATE TABLE IF NOT EXISTS studies (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  protocol_number TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  study_id             BIGINT NOT NULL REFERENCES studies(id),
  subject_code         TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'screening'
                       CHECK (status IN ('screening','enrolled','withdrawn','completed')),
  enrolled_by_actor_id BIGINT NOT NULL REFERENCES actors(id),
  enrolled_at          TEXT NOT NULL,
  notes                TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id           BIGINT NOT NULL REFERENCES subjects(id),
  visit_kind           TEXT NOT NULL,
  recorded_by_actor_id BIGINT NOT NULL REFERENCES actors(id),
  recorded_at          TEXT NOT NULL,
  notes                TEXT
);
