-- Grace Commons Demo 2: Beacon Clinical Research
-- Phase 0 — Complete schema from §5

-- Party Identity atom
CREATE TABLE IF NOT EXISTS parties (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Actor Identity atom
CREATE TABLE IF NOT EXISTS actors (
  id            INTEGER PRIMARY KEY,
  party_id      INTEGER NOT NULL REFERENCES parties(id),
  created_at    TEXT NOT NULL
);

-- Credential atom (password kind only for the demo; column allows others)
CREATE TABLE IF NOT EXISTS credentials (
  id            INTEGER PRIMARY KEY,
  actor_id      INTEGER NOT NULL REFERENCES actors(id),
  kind          TEXT NOT NULL CHECK (kind IN ('password')),
  secret_hash   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- Session atom
CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY,
  actor_id      INTEGER NOT NULL REFERENCES actors(id),
  token         TEXT NOT NULL UNIQUE,
  issued_at     TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- Permissions atom: registry of permission codes
CREATE TABLE IF NOT EXISTS permissions (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL
);

-- Permissions atom: grants
CREATE TABLE IF NOT EXISTS grants (
  id              INTEGER PRIMARY KEY,
  grantor_actor_id INTEGER NOT NULL REFERENCES actors(id),
  grantee_actor_id INTEGER NOT NULL REFERENCES actors(id),
  permission_id   INTEGER NOT NULL REFERENCES permissions(id),
  scope           TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','own')),
  issued_at       TEXT NOT NULL,
  revoked_at      TEXT,
  revoke_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_grants_grantee ON grants(grantee_actor_id, permission_id) WHERE revoked_at IS NULL;

-- Invitation atom
CREATE TABLE IF NOT EXISTS invitations (
  id                  INTEGER PRIMARY KEY,
  party_id            INTEGER NOT NULL REFERENCES parties(id),
  intended_role       TEXT NOT NULL,
  token               TEXT NOT NULL UNIQUE,
  issued_by_actor_id  INTEGER NOT NULL REFERENCES actors(id),
  issued_at           TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  accepted_at         TEXT,
  accepted_by_actor_id INTEGER REFERENCES actors(id),
  revoked_at          TEXT
);

-- Event Log atom (C1 audit substrate)
CREATE TABLE IF NOT EXISTS event_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at   TEXT NOT NULL,
  actor_id      INTEGER REFERENCES actors(id),
  session_id    INTEGER REFERENCES sessions(id),
  action        TEXT NOT NULL,
  target_kind   TEXT,
  target_id     INTEGER,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  prev_hash     TEXT NOT NULL,
  this_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_event_log_actor   ON event_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_event_log_target  ON event_log(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_event_log_action  ON event_log(action);
CREATE INDEX IF NOT EXISTS idx_event_log_time    ON event_log(occurred_at);

-- Retention Window atom: configuration only, no per-row data
CREATE TABLE IF NOT EXISTS retention_policy (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  days          INTEGER NOT NULL DEFAULT 2555,
  enforce_on_read BOOLEAN NOT NULL DEFAULT 1
);

-- Domain (regulated-artifact) tables

CREATE TABLE IF NOT EXISTS studies (
  id              INTEGER PRIMARY KEY,
  protocol_number TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id                 INTEGER PRIMARY KEY,
  study_id           INTEGER NOT NULL REFERENCES studies(id),
  subject_code       TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'screening'
                     CHECK (status IN ('screening','enrolled','withdrawn','completed')),
  enrolled_by_actor_id INTEGER NOT NULL REFERENCES actors(id),
  enrolled_at        TEXT NOT NULL,
  notes              TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id                  INTEGER PRIMARY KEY,
  subject_id          INTEGER NOT NULL REFERENCES subjects(id),
  visit_kind          TEXT NOT NULL,
  recorded_by_actor_id INTEGER NOT NULL REFERENCES actors(id),
  recorded_at         TEXT NOT NULL,
  notes               TEXT
);
