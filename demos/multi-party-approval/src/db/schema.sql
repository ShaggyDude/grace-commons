-- Grace Commons Demo — canonical DDL
-- Every table, column, CHECK, trigger, and index is derived from a spec
-- invariant or action precondition. See BUILD_PLAN.md §4 for the mapping.
--
-- Run idempotently via: deno task migrate
-- All CREATE statements use IF NOT EXISTS so re-running is safe.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

-- ---------------------------------------------------------------------------
-- 4.1  actor — Actor Identity registry (Audit Trail substrate)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS actor (
  actor_ref           TEXT    PRIMARY KEY,
  kind                TEXT    NOT NULL,
  display_name        TEXT    NOT NULL,
  credential_public   TEXT    NOT NULL,
  credential_secret   TEXT    NOT NULL,
  registered_at       TEXT    NOT NULL,
  CHECK (kind IN ('human', 'application')),
  CHECK (TRIM(actor_ref) <> ''),
  CHECK (TRIM(display_name) <> '')
);

-- ---------------------------------------------------------------------------
-- 4.2  permission_grant — Permissions instance scoped to the chain store
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permission_grant (
  grant_id    INTEGER  PRIMARY KEY AUTOINCREMENT,
  actor_ref   TEXT     NOT NULL  REFERENCES actor(actor_ref),
  scope       TEXT     NOT NULL,
  granted_at  TEXT     NOT NULL,
  granted_by  TEXT     NOT NULL  REFERENCES actor(actor_ref),
  revoked_at  TEXT     NULL,
  revoked_by  TEXT     NULL      REFERENCES actor(actor_ref),
  CHECK (scope IN ('chains:initiate', 'chains:withdraw', 'chains:read')),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS permission_grant_active_unique
  ON permission_grant(actor_ref, scope) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4.3  chain — the chain store
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chain (
  chain_id          TEXT     PRIMARY KEY,
  subject_ref       TEXT     NOT NULL,
  scope             TEXT     NOT NULL,
  initiator_ref     TEXT     NOT NULL  REFERENCES actor(actor_ref),
  quorum_kind       TEXT     NOT NULL,
  quorum_m          INTEGER  NULL,
  initiated_at      TEXT     NOT NULL,
  state             TEXT     NOT NULL  DEFAULT 'Pending',
  chain_terminal_at TEXT     NULL,
  terminal_reason   TEXT     NULL,
  audit_pending     INTEGER  NOT NULL  DEFAULT 0,
  CHECK (state IN ('Pending', 'Approved', 'Rejected', 'Withdrawn')),
  CHECK (TRIM(subject_ref) <> ''),
  CHECK (TRIM(scope) <> ''),
  CHECK (quorum_kind IN ('all-of-N', 'M-of-N', 'one-of-N')),
  CHECK (audit_pending IN (0, 1)),
  -- chain_terminal_at is set if and only if state is not Pending
  CHECK ((state = 'Pending') = (chain_terminal_at IS NULL)),
  -- quorum_m is required for M-of-N and forbidden otherwise
  CHECK (
    (quorum_kind = 'M-of-N' AND quorum_m IS NOT NULL AND quorum_m >= 1)
    OR (quorum_kind <> 'M-of-N' AND quorum_m IS NULL)
  )
);

-- Invariant 8: declared fields are immutable after INSERT
CREATE TRIGGER IF NOT EXISTS chain_no_field_mutation
BEFORE UPDATE OF subject_ref, scope, initiator_ref, quorum_kind, quorum_m, initiated_at
ON chain
BEGIN
  SELECT RAISE(ABORT, 'chain immutable field');
END;

-- Invariant 7: terminal absorption — once terminal, state cannot change
CREATE TRIGGER IF NOT EXISTS chain_no_terminal_state_change
BEFORE UPDATE OF state ON chain
WHEN OLD.state <> 'Pending' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'chain terminal absorption');
END;

-- chain_terminal_at is immutable once set
CREATE TRIGGER IF NOT EXISTS chain_terminal_at_set_once
BEFORE UPDATE OF chain_terminal_at ON chain
WHEN OLD.chain_terminal_at IS NOT NULL AND NEW.chain_terminal_at <> OLD.chain_terminal_at
BEGIN
  SELECT RAISE(ABORT, 'chain_terminal_at immutable once set');
END;

-- ---------------------------------------------------------------------------
-- 4.4  approval_step — Approval Step store
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS approval_step (
  step_id          TEXT     PRIMARY KEY,
  chain_id         TEXT     NOT NULL  REFERENCES chain(chain_id),
  position         INTEGER  NOT NULL,
  subject_ref      TEXT     NOT NULL,
  approver_ref     TEXT     NOT NULL  REFERENCES actor(actor_ref),
  submitter_ref    TEXT     NOT NULL  REFERENCES actor(actor_ref),
  scope            TEXT     NOT NULL,
  submitted_at     TEXT     NOT NULL,
  reason           TEXT     NULL,
  state            TEXT     NOT NULL  DEFAULT 'Pending',
  decided_by       TEXT     NULL      REFERENCES actor(actor_ref),
  decided_at       TEXT     NULL,
  decision_reason  TEXT     NULL,
  CHECK (state IN ('Pending', 'Approved', 'Rejected', 'Withdrawn')),
  CHECK (TRIM(subject_ref) <> ''),
  CHECK (TRIM(scope) <> ''),
  CHECK (TRIM(approver_ref) <> ''),
  CHECK (TRIM(submitter_ref) <> ''),
  CHECK (reason IS NULL OR TRIM(reason) <> ''),
  -- decided_by and decided_at are set together
  CHECK ((state = 'Pending') = (decided_by IS NULL)),
  CHECK ((decided_by IS NULL) = (decided_at IS NULL)),
  -- Invariant 6: rejection requires a reason
  CHECK (state <> 'Rejected'  OR decision_reason IS NOT NULL),
  -- withdrawal requires a reason
  CHECK (state <> 'Withdrawn' OR decision_reason IS NOT NULL),
  -- Invariant 4: only the named approver may approve or reject
  CHECK (state <> 'Approved'  OR decided_by = approver_ref),
  CHECK (state <> 'Rejected'  OR decided_by = approver_ref),
  -- Invariant 5: only the submitter may withdraw
  CHECK (state <> 'Withdrawn' OR decided_by = submitter_ref),
  -- Invariant 7: temporal ordering
  CHECK (decided_at IS NULL OR decided_at >= submitted_at),
  UNIQUE (chain_id, position)
);

-- Invariant 1: submission fields are immutable after INSERT
CREATE TRIGGER IF NOT EXISTS approval_step_no_submission_mutation
BEFORE UPDATE OF chain_id, position, subject_ref, approver_ref,
                 submitter_ref, scope, submitted_at, reason
ON approval_step
BEGIN
  SELECT RAISE(ABORT, 'approval_step submission immutable');
END;

-- Invariant 3: terminal absorption on steps
CREATE TRIGGER IF NOT EXISTS approval_step_terminal_absorption
BEFORE UPDATE OF state ON approval_step
WHEN OLD.state <> 'Pending' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'approval_step terminal absorption');
END;

CREATE INDEX IF NOT EXISTS approval_step_by_chain
  ON approval_step(chain_id, position);

CREATE INDEX IF NOT EXISTS approval_step_by_approver
  ON approval_step(approver_ref) WHERE state = 'Pending';

CREATE INDEX IF NOT EXISTS approval_step_by_subject
  ON approval_step(subject_ref);

-- ---------------------------------------------------------------------------
-- 4.5  assignment — Assignment instance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assignment (
  assignment_id  INTEGER  PRIMARY KEY AUTOINCREMENT,
  task_ref       TEXT     NOT NULL  REFERENCES approval_step(step_id),
  assignee_ref   TEXT     NOT NULL  REFERENCES actor(actor_ref),
  assigned_at    TEXT     NOT NULL,
  state          TEXT     NOT NULL  DEFAULT 'Active',
  recalled_at    TEXT     NULL,
  CHECK (state IN ('Active', 'Recalled')),
  CHECK ((state = 'Active') = (recalled_at IS NULL)),
  -- exactly one Assignment per step (active or recalled)
  UNIQUE (task_ref)
);

CREATE INDEX IF NOT EXISTS assignment_by_assignee_active
  ON assignment(assignee_ref) WHERE state = 'Active';

-- ---------------------------------------------------------------------------
-- 4.6  audit_event — Audit Trail event log + hash chain
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_event (
  event_id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  seq              INTEGER  NOT NULL  UNIQUE,
  action_ref       TEXT     NOT NULL,
  actor_ref        TEXT     NOT NULL  REFERENCES actor(actor_ref),
  chain_id         TEXT     NULL      REFERENCES chain(chain_id),
  step_id          TEXT     NULL      REFERENCES approval_step(step_id),
  recorded_at      TEXT     NOT NULL,
  data_json        TEXT     NOT NULL,
  retention_policy TEXT     NOT NULL,
  retention_until  TEXT     NOT NULL,
  attestation      TEXT     NOT NULL,
  prev_row_hash    TEXT     NOT NULL,
  row_hash         TEXT     NOT NULL,
  CHECK (action_ref IN (
    'chain_initiated', 'chain_withdrawn',
    'step_approved', 'step_rejected', 'step_withdrawn',
    'chain_resolved', 'chain_initiation_failed', 'cascade_completed'
  )),
  CHECK (retention_policy IN ('sox_7_year', 'fda_part_11_predicate_rule', 'ich_e6_tmf')),
  CHECK (LENGTH(prev_row_hash) IN (0, 64)),
  CHECK (LENGTH(row_hash) = 64)
);

-- Audit Trail is append-only
CREATE TRIGGER IF NOT EXISTS audit_event_immutable_after_insert
BEFORE UPDATE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_event_no_delete
BEFORE DELETE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;

CREATE INDEX IF NOT EXISTS audit_event_by_chain
  ON audit_event(chain_id, seq);

CREATE INDEX IF NOT EXISTS audit_event_by_step
  ON audit_event(step_id, seq);

CREATE INDEX IF NOT EXISTS audit_event_by_action
  ON audit_event(action_ref, recorded_at);
