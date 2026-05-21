-- Attributed Permissions Admin — canonical DDL
-- Derived from attributed-permissions-admin.md and attributed-permissions-admin.als.
-- Every table, column, CHECK, and trigger maps to a named spec invariant.
--
-- Run idempotently via: deno task migrate

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

-- ---------------------------------------------------------------------------
-- actor — Actor Identity registry
-- Seeded once; no writes through the composition surface.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS actor (
  actor_ref         TEXT  PRIMARY KEY,
  display_name      TEXT  NOT NULL,
  credential_public TEXT  NOT NULL,
  credential_secret TEXT  NOT NULL,
  registered_at     TEXT  NOT NULL,
  CHECK (TRIM(actor_ref) <> ''),
  CHECK (TRIM(display_name) <> '')
);

-- ---------------------------------------------------------------------------
-- attestation — Actor Identity atom store
--
-- Each row is one attested act: actor_ref attested to action_ref at
-- attested_at using their credential. The composition always writes here
-- before writing to the grant table (attest-before-record invariant).
--
-- Invariant 5 (constituent atom invariant): attestations are durable —
-- no update, no delete.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attestation (
  attestation_id TEXT  PRIMARY KEY,
  actor_ref      TEXT  NOT NULL  REFERENCES actor(actor_ref),
  action_ref     TEXT  NOT NULL,
  attested_at    TEXT  NOT NULL,
  CHECK (TRIM(attestation_id) <> ''),
  CHECK (TRIM(action_ref) <> '')
);

-- Attestation durability: no updates (Invariant 5, constituent)
CREATE TRIGGER IF NOT EXISTS attestation_no_update
BEFORE UPDATE ON attestation
BEGIN
  SELECT RAISE(ABORT, 'attestation is immutable');
END;

-- Attestation durability: no deletes (Invariant 5, constituent)
CREATE TRIGGER IF NOT EXISTS attestation_no_delete
BEFORE DELETE ON attestation
BEGIN
  SELECT RAISE(ABORT, 'attestation is append-only');
END;

-- ---------------------------------------------------------------------------
-- grant — Permissions atom store
--
-- Each row is one permission grant. Status starts 'active'; the only
-- allowed transition is active → revoked (terminal absorption, Invariant 3
-- of the Permissions constituent atom).
--
-- Core fields (subject_ref, action_scope, granted_at) are immutable after
-- INSERT (Permissions atom invariant).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grant (
  grant_id     TEXT  PRIMARY KEY,
  subject_ref  TEXT  NOT NULL,
  action_scope TEXT  NOT NULL,
  status       TEXT  NOT NULL  DEFAULT 'active',
  granted_at   TEXT  NOT NULL,
  revoked_at   TEXT  NULL,
  CHECK (status IN ('active', 'revoked')),
  CHECK ((status = 'active') = (revoked_at IS NULL)),
  CHECK (TRIM(grant_id) <> ''),
  CHECK (TRIM(subject_ref) <> ''),
  CHECK (TRIM(action_scope) <> '')
);

-- One active grant per (subject_ref, action_scope) pair
CREATE UNIQUE INDEX IF NOT EXISTS grant_active_unique
  ON grant(subject_ref, action_scope) WHERE status = 'active';

-- Terminal absorption: revoked → active is forbidden (Permissions atom invariant)
CREATE TRIGGER IF NOT EXISTS grant_terminal_absorption
BEFORE UPDATE OF status ON grant
WHEN OLD.status = 'revoked' AND NEW.status <> 'revoked'
BEGIN
  SELECT RAISE(ABORT, 'grant terminal absorption: revoked status is final');
END;

-- Core fields are immutable after INSERT (Permissions atom invariant)
CREATE TRIGGER IF NOT EXISTS grant_no_core_mutation
BEFORE UPDATE OF subject_ref, action_scope, granted_at ON grant
BEGIN
  SELECT RAISE(ABORT, 'grant core fields are immutable');
END;

-- ---------------------------------------------------------------------------
-- grant_attribution — composition emergent state (Invariant 1)
--
-- Maps every grant to its issuance attestation. Written once in
-- issue_grant step 5; never modified or deleted (Invariant 6).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grant_attribution (
  grant_id       TEXT  PRIMARY KEY  REFERENCES grant(grant_id),
  attestation_id TEXT  NOT NULL     REFERENCES attestation(attestation_id),
  -- Invariant 7: attestation_id must be globally unique across both maps.
  -- Enforced at the application layer (domain/composition.ts). The UNIQUE
  -- constraint here covers injectivity within this table.
  UNIQUE (attestation_id)
);

-- Invariant 6: pairing map entries are immutable once written
CREATE TRIGGER IF NOT EXISTS grant_attribution_no_update
BEFORE UPDATE ON grant_attribution
BEGIN
  SELECT RAISE(ABORT, 'grant_attribution is immutable once written');
END;

CREATE TRIGGER IF NOT EXISTS grant_attribution_no_delete
BEFORE DELETE ON grant_attribution
BEGIN
  SELECT RAISE(ABORT, 'grant_attribution entries are permanent');
END;

-- ---------------------------------------------------------------------------
-- revocation_attribution — composition emergent state (Invariant 2)
--
-- Maps every revoked grant to its revocation attestation. Written once in
-- revoke_grant step 5; never modified or deleted (Invariant 6).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS revocation_attribution (
  grant_id       TEXT  PRIMARY KEY  REFERENCES grant(grant_id),
  attestation_id TEXT  NOT NULL     REFERENCES attestation(attestation_id),
  -- Invariant 7: injectivity within this table
  UNIQUE (attestation_id)
);

-- Invariant 6: pairing map entries are immutable once written
CREATE TRIGGER IF NOT EXISTS revocation_attribution_no_update
BEFORE UPDATE ON revocation_attribution
BEGIN
  SELECT RAISE(ABORT, 'revocation_attribution is immutable once written');
END;

CREATE TRIGGER IF NOT EXISTS revocation_attribution_no_delete
BEFORE DELETE ON revocation_attribution
BEGIN
  SELECT RAISE(ABORT, 'revocation_attribution entries are permanent');
END;

-- ---------------------------------------------------------------------------
-- orphan_log — composition emergent state (Invariant 8)
--
-- Append-only record of attestations that were written to the Actor Identity
-- atom but whose corresponding grant/revocation write subsequently failed.
-- An orphan attestation is a recoverable anomaly (structural evidence exists);
-- a grant with no attestation is unrecoverable (hence attest-before-record).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orphan_log (
  orphan_id         TEXT  PRIMARY KEY,
  attestation_id    TEXT  NOT NULL,
  proposal_ref      TEXT  NOT NULL,
  requested_at      TEXT  NOT NULL,
  underlying_reason TEXT  NOT NULL,
  CHECK (underlying_reason IN (
    'grant-storage-failure',
    'revocation-storage-failure',
    'invalid-request',
    'not-known',
    'not-active',
    'pairing-write-failure'
  ))
);

-- Invariant 8: orphan log is append-only — no updates, no deletes
CREATE TRIGGER IF NOT EXISTS orphan_log_no_update
BEFORE UPDATE ON orphan_log
BEGIN
  SELECT RAISE(ABORT, 'orphan_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS orphan_log_no_delete
BEFORE DELETE ON orphan_log
BEGIN
  SELECT RAISE(ABORT, 'orphan_log entries are permanent');
END;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS grant_by_subject
  ON grant(subject_ref, action_scope) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS attestation_by_actor
  ON attestation(actor_ref, attested_at);

-- ---------------------------------------------------------------------------
-- credential — Credential atom store (login surface)
--
-- Distinct from actor.credential_secret (attest key / Actor Identity surface).
-- Each row binds a principal_ref to a stored verifier (SHA-256 hash of
-- salt:password). At most one active credential per (principal_ref, type).
-- See CORNERS.md §Cross-atom identity surface aliasing for the separation
-- rationale.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credential (
  credential_id   TEXT  PRIMARY KEY,
  principal_ref   TEXT  NOT NULL  REFERENCES actor(actor_ref),
  credential_type TEXT  NOT NULL  DEFAULT 'password',
  credential_hash TEXT  NOT NULL,
  credential_salt TEXT  NOT NULL,
  status          TEXT  NOT NULL  DEFAULT 'active',
  registered_at   TEXT  NOT NULL,
  CHECK (status IN ('active', 'revoked')),
  CHECK (TRIM(credential_id) <> ''),
  CHECK (TRIM(principal_ref) <> ''),
  CHECK (TRIM(credential_hash) <> '')
);

-- At most one active credential per (principal_ref, credential_type)
CREATE UNIQUE INDEX IF NOT EXISTS credential_active_unique
  ON credential(principal_ref, credential_type) WHERE status = 'active';

-- Terminal absorption: revoked status is final
CREATE TRIGGER IF NOT EXISTS credential_terminal_absorption
BEFORE UPDATE OF status ON credential
WHEN OLD.status = 'revoked' AND NEW.status <> 'revoked'
BEGIN
  SELECT RAISE(ABORT, 'credential terminal absorption: revoked status is final');
END;

-- ---------------------------------------------------------------------------
-- session — Session atom store
--
-- Each row is one authenticated session. Issued by the login route after
-- Credential.verify succeeds. Validated by currentActorMiddleware on every
-- request. State machine: active → expired | revoked (two terminal states).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS session (
  session_id    TEXT  PRIMARY KEY,
  principal_ref TEXT  NOT NULL  REFERENCES actor(actor_ref),
  issued_at     TEXT  NOT NULL,
  expires_at    TEXT  NOT NULL,
  status        TEXT  NOT NULL  DEFAULT 'active',
  revoked_at    TEXT  NULL,
  CHECK (status IN ('active', 'expired', 'revoked')),
  CHECK (TRIM(session_id) <> ''),
  CHECK (TRIM(principal_ref) <> '')
);

-- Terminal absorption: expired/revoked → active is forbidden
CREATE TRIGGER IF NOT EXISTS session_terminal_absorption
BEFORE UPDATE OF status ON session
WHEN OLD.status IN ('expired', 'revoked') AND NEW.status = 'active'
BEGIN
  SELECT RAISE(ABORT, 'session terminal absorption: terminal status is final');
END;

CREATE INDEX IF NOT EXISTS session_by_principal
  ON session(principal_ref, status);
