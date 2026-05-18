# Multi-Party Approval — Demo Build Plan

This is a plan-only document for a working demo of the Multi-Party Approval composition (`grace-commons/compositions/multi-party-approval.md`) on a Deno + SQLite + Hono + Tailwind 4 (CSS-only) stack. No application code yet — every section below is a target the implementation will hit.

The composition wires four constituents (Approval Step, Permissions, Assignment, Audit Trail-as-substrate) under a quorum rule. The demo implements all four constituents in-repo so that the records-alone audit story the spec promises is actually demonstrable end-to-end.

---

## 1. Locked-in decisions

Four judgment calls were resolved before drafting:

- **Quorum evaluation lives in application logic inside a SQLite `BEGIN IMMEDIATE` transaction.** Per-chain serialization comes from a per-DB writer lock in WAL mode plus `busy_timeout` — strictly stronger than the per-`chain_id` mutex the spec requires. The application is the only layer that reads `(A, R, W, P)` and decides chain state, matching the spec's "the application is the only layer that can ask 'is the chain done?'" line.
- **Audit Trail substrate is event log + hash chain + retention column.** Single `audit_event` table, append-only, with a monotonic `seq`, an HMAC-style attestation field per row (so the records-alone forgery defense from the spec's `application_actor` configuration block is demonstrable), and `prev_row_hash` / `row_hash` for tamper evidence. No purge job; retention is a recorded field. Actor Identity, Event Log, Retention Window, and Tamper Evidence are collapsed into this one substrate module rather than four separate tables.
- **UI is server-rendered HTML via Hono JSX + HTMX for partial updates.** Approve / reject / withdraw return swap fragments; no client framework, no bundler. Tailwind 4 (CSS-only) generates the stylesheet from JSX `class` attributes.
- **Identity is a cookie-based "act as" picker over a seeded actor table.** A top-bar dropdown sets `actor_ref` on a cookie. Every route reads the cookie, looks up the actor, and uses that reference for permission checks, step-decision attribution, and audit attestation. Approval Step's Invariant 4 (named-approver exclusivity) becomes visibly enforceable in one browser session by switching personas.

---

## 2. Runtime & tooling

The runtime target is current Deno (≥ 2.x). Library choices:

- **Hono** — via `jsr:@hono/hono` (Deno-native, no Node shims). Used for routing, middleware, and JSX server rendering through Hono's built-in `jsx` renderer.
- **SQLite** — via `jsr:@db/sqlite` (the modern native binding, `better-sqlite3`-shaped API). Opened in WAL mode with `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`. Same connection across requests is fine for a single-process demo.
- **ULID** — `jsr:@std/ulid` for `chain_id`, `step_id`, `assignment_id`-as-string-if-we-prefer (we don't; `assignment_id` stays integer).
- **Crypto** — `jsr:@std/crypto` for the SHA-256 hash chain and the HMAC-style attestation.
- **Tailwind 4** — installed via the standalone CLI binary (`@tailwindcss/cli`), invoked by a Deno task. No `tailwind.config.js`; the v4 CSS-only flow uses `@import "tailwindcss"` plus `@source` directives inside `app.css` itself.

Deno tasks (`deno.json`):

- `dev` — runs Tailwind CLI in `--watch` and the Hono server concurrently.
- `build:css` — one-shot `@tailwindcss/cli -i app.css -o public/styles.css --minify`.
- `migrate` — applies `src/db/schema.sql` to the configured database file.
- `seed` — runs `src/db/seed.ts`, idempotent.
- `test` — `deno test --allow-read --allow-write --allow-net --unstable-kv` (kv not used, but Deno test default permissions).

Single-process, single SQLite file. The demo's persistence file is `data/grace-commons-demo.sqlite`, gitignored.

---

## 3. Directory & file layout

```
grace-commons-demo/
├── deno.json                       # tasks, import map, JSX configuration
├── deno.lock
├── README.md
├── BUILD_PLAN.md                   # this document
├── .gitignore                      # adds data/, public/styles.css
├── app.css                         # Tailwind 4 entry: @import + @source
├── data/                           # SQLite file lives here (gitignored)
├── public/                         # static assets (compiled CSS, htmx)
│   ├── styles.css                  # built by Tailwind CLI
│   └── htmx.min.js                 # vendored, ~14KB
├── src/
│   ├── main.ts                     # Deno.serve(app.fetch); calls migrate + seed if --bootstrap
│   ├── app.ts                      # Hono app composition; mounts routes & middleware
│   ├── config.ts                   # constants from spec Configuration block
│   ├── db/
│   │   ├── client.ts               # opens sqlite, sets pragmas, exports `db` + `tx()` helper
│   │   ├── schema.sql              # single-source DDL — see §4
│   │   ├── migrate.ts              # runs schema.sql idempotently
│   │   └── seed.ts                 # actors, permission_grants, three demo chains
│   ├── domain/                     # the spec's atoms + composition, one TS module per concern
│   │   ├── ids.ts                  # ulid wrappers
│   │   ├── actor.ts                # actor lookup
│   │   ├── permissions.ts          # grant / revoke / permitted
│   │   ├── assignment.ts           # assign / recall (idempotent on already-Recalled)
│   │   ├── approval_step.ts        # submit / approve / reject / withdraw
│   │   ├── audit_trail.ts          # record_action / verify_record / verify_chain_segment
│   │   ├── quorum.ts               # pure evaluate(kind, m, vector) function
│   │   └── chain.ts                # initiate / withdraw / approve_step / reject_step / withdraw_step / read_chain
│   ├── routes/
│   │   ├── chains.ts               # see §8
│   │   ├── steps.ts
│   │   ├── audit.ts
│   │   ├── verify.ts
│   │   ├── pages.ts                # HTML pages for the UI
│   │   └── auth.ts                 # /act-as cookie endpoint
│   ├── views/                      # Hono JSX
│   │   ├── layout.tsx              # html shell, htmx, current-actor switcher
│   │   ├── chain_list.tsx
│   │   ├── chain_detail.tsx
│   │   ├── new_chain.tsx
│   │   ├── in_tray.tsx
│   │   ├── audit_log.tsx
│   │   └── fragments.tsx           # step-row, audit-row, chain-banner (for htmx swaps)
│   └── middleware/
│       ├── current_actor.ts        # parse cookie → ctx.set('actor', ...)
│       ├── tx.ts                   # wraps a request handler in BEGIN IMMEDIATE / COMMIT / ROLLBACK
│       └── error.ts                # rejection-token → HTTP status mapping
└── tests/
    ├── quorum.test.ts              # pure-function tests over (kind, m, vector) including trailing
    ├── invariants.test.ts          # one test per application-level invariant 1–9
    ├── scenarios.test.ts           # SOX/FDA/ICH walkthroughs against the live HTTP surface
    └── audit_tamper.test.ts        # mutate a row or hash, expect verify_record → failed
```

Notes on the layout:

The composition's emergent maps (`chain_to_steps`, `step_to_chain`, `step_to_assignment`) are not new tables — they are queries over `approval_step` and `assignment`. The schema stays lean and the domain layer exposes them as TS functions for code clarity.

Constituent atoms get their own TS module (`approval_step.ts`, `permissions.ts`, `assignment.ts`, `audit_trail.ts`) and the composition is `chain.ts`. The boundary mirrors the spec's "exactly one Approval Step store instance per chain store" language: a constituent atom's module never reaches into another's table directly; chain-level wiring happens in `chain.ts`.

---

## 4. SQLite schema (`src/db/schema.sql`)

Every table, column, type, and CHECK below is derived directly from a spec invariant or action precondition. The right column names the spec source.

### 4.1 `actor` — Actor Identity registry (Audit Trail substrate)

```
actor_ref            TEXT     PRIMARY KEY                          -- opaque ref; immutable
kind                 TEXT     NOT NULL                             -- 'human' or 'application'
display_name         TEXT     NOT NULL
credential_public    TEXT     NOT NULL                             -- stand-in public material
credential_secret    TEXT     NOT NULL                             -- stand-in HMAC key (server-only)
registered_at        TEXT     NOT NULL                             -- ISO-8601
CHECK (kind IN ('human','application'))
CHECK (TRIM(actor_ref) <> '')
CHECK (TRIM(display_name) <> '')
```

Seeded once; never updated in the demo. `application` is the kind for `application_actor_ref` from the spec's Configuration block.

### 4.2 `permission_grant` — Permissions instance scoped to the chain store

```
grant_id     INTEGER  PRIMARY KEY AUTOINCREMENT
actor_ref    TEXT     NOT NULL  REFERENCES actor(actor_ref)
scope        TEXT     NOT NULL
granted_at   TEXT     NOT NULL
granted_by   TEXT     NOT NULL  REFERENCES actor(actor_ref)
revoked_at   TEXT     NULL                                         -- null ⇒ Active
revoked_by   TEXT     NULL      REFERENCES actor(actor_ref)
CHECK (scope IN ('chains:initiate','chains:withdraw','chains:read'))
CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
CREATE UNIQUE INDEX permission_grant_active_unique
    ON permission_grant(actor_ref, scope) WHERE revoked_at IS NULL;
```

The `scope` CHECK is the canonical vocabulary from the spec's *Scope vocabulary* table. Step-level decisions are deliberately not in this set — Approval Step's Invariants 4 and 5 are the structural enforcement, per the spec.

`permitted(actor, scope)` is a 1-row query over this table; that's the entire Permissions atom's `permitted` surface for this composition.

### 4.3 `chain` — the chain store

```
chain_id              TEXT     PRIMARY KEY                          -- opaque ulid, never reused
subject_ref           TEXT     NOT NULL
scope                 TEXT     NOT NULL
initiator_ref         TEXT     NOT NULL  REFERENCES actor(actor_ref)
quorum_kind           TEXT     NOT NULL                             -- 'all-of-N' | 'M-of-N' | 'one-of-N'
quorum_m              INTEGER  NULL                                 -- only meaningful for M-of-N
initiated_at          TEXT     NOT NULL
state                 TEXT     NOT NULL  DEFAULT 'Pending'
chain_terminal_at     TEXT     NULL
terminal_reason       TEXT     NULL
audit_pending         INTEGER  NOT NULL  DEFAULT 0                  -- 0|1; recovery flag, NOT a state
CHECK (state IN ('Pending','Approved','Rejected','Withdrawn'))
CHECK (TRIM(subject_ref) <> '')
CHECK (TRIM(scope) <> '')
CHECK (quorum_kind IN ('all-of-N','M-of-N','one-of-N'))
CHECK (audit_pending IN (0,1))
CHECK ((state = 'Pending') = (chain_terminal_at IS NULL))           -- chain_terminal_at set ⇔ terminal
CHECK (
   (quorum_kind = 'M-of-N' AND quorum_m IS NOT NULL AND quorum_m >= 1)
   OR (quorum_kind <> 'M-of-N' AND quorum_m IS NULL)
)
```

`approver_set` is not a column — it's the rows of `approval_step` keyed by `chain_id`, ordered by `position`. This is the spec's `chain_to_steps` map made canonical in the relational store.

Three triggers enforce the immutability invariants the spec calls out (Invariant 7 and Invariant 8):

```
CREATE TRIGGER chain_no_field_mutation
BEFORE UPDATE OF subject_ref, scope, initiator_ref, quorum_kind, quorum_m, initiated_at
ON chain
BEGIN
  SELECT RAISE(ABORT, 'chain immutable field');
END;

CREATE TRIGGER chain_no_terminal_state_change
BEFORE UPDATE OF state ON chain
WHEN OLD.state <> 'Pending' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'chain terminal absorption');
END;

CREATE TRIGGER chain_terminal_at_set_once
BEFORE UPDATE OF chain_terminal_at ON chain
WHEN OLD.chain_terminal_at IS NOT NULL AND NEW.chain_terminal_at <> OLD.chain_terminal_at
BEGIN
  SELECT RAISE(ABORT, 'chain_terminal_at immutable once set');
END;
```

These three triggers, taken together, are the SQL-layer enforcement of Invariants 7 and 8 (chain terminal absorption + chain immutability of declared fields). The application layer never needs to police them.

### 4.4 `approval_step` — Approval Step store

```
step_id            TEXT     PRIMARY KEY                              -- opaque ulid
chain_id           TEXT     NOT NULL  REFERENCES chain(chain_id)
position           INTEGER  NOT NULL                                 -- declaration order in approver_set
subject_ref        TEXT     NOT NULL
approver_ref       TEXT     NOT NULL  REFERENCES actor(actor_ref)
submitter_ref      TEXT     NOT NULL  REFERENCES actor(actor_ref)
scope              TEXT     NOT NULL
submitted_at       TEXT     NOT NULL
reason             TEXT     NULL
state              TEXT     NOT NULL  DEFAULT 'Pending'
decided_by         TEXT     NULL      REFERENCES actor(actor_ref)
decided_at         TEXT     NULL
decision_reason    TEXT     NULL
CHECK (state IN ('Pending','Approved','Rejected','Withdrawn'))
CHECK (TRIM(subject_ref) <> '')
CHECK (TRIM(scope) <> '')
CHECK (TRIM(approver_ref) <> '')
CHECK (TRIM(submitter_ref) <> '')
CHECK (reason IS NULL OR TRIM(reason) <> '')
CHECK ((state = 'Pending') = (decided_by IS NULL))
CHECK ((decided_by IS NULL) = (decided_at IS NULL))
CHECK (state <> 'Rejected'  OR decision_reason IS NOT NULL)          -- Approval Step Invariant 6
CHECK (state <> 'Withdrawn' OR decision_reason IS NOT NULL)          -- withdraw reason required
CHECK (state <> 'Approved'  OR decided_by = approver_ref)            -- Approval Step Invariant 4
CHECK (state <> 'Rejected'  OR decided_by = approver_ref)            -- Approval Step Invariant 4
CHECK (state <> 'Withdrawn' OR decided_by = submitter_ref)           -- Approval Step Invariant 5
CHECK (decided_at IS NULL OR decided_at >= submitted_at)             -- Approval Step Invariant 7 (temporal ordering)
UNIQUE (chain_id, position)
```

Two triggers cover what CHECKs cannot:

```
CREATE TRIGGER approval_step_no_submission_mutation
BEFORE UPDATE OF chain_id, position, subject_ref, approver_ref,
                 submitter_ref, scope, submitted_at, reason
ON approval_step
BEGIN
  SELECT RAISE(ABORT, 'approval_step submission immutable');         -- Approval Step Invariant 1
END;

CREATE TRIGGER approval_step_terminal_absorption
BEFORE UPDATE OF state ON approval_step
WHEN OLD.state <> 'Pending' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'approval_step terminal absorption');          -- Approval Step Invariant 3
END;
```

Indexes:

```
CREATE INDEX approval_step_by_chain        ON approval_step(chain_id, position);
CREATE INDEX approval_step_by_approver     ON approval_step(approver_ref) WHERE state = 'Pending';
CREATE INDEX approval_step_by_subject      ON approval_step(subject_ref);
```

The approver index is partial-on-Pending because the in-tray query only cares about Pending rows.

### 4.5 `assignment` — Assignment instance

```
assignment_id    INTEGER  PRIMARY KEY AUTOINCREMENT
task_ref         TEXT     NOT NULL  REFERENCES approval_step(step_id)
assignee_ref     TEXT     NOT NULL  REFERENCES actor(actor_ref)
assigned_at      TEXT     NOT NULL
state            TEXT     NOT NULL  DEFAULT 'Active'
recalled_at      TEXT     NULL
CHECK (state IN ('Active','Recalled'))
CHECK ((state = 'Active') = (recalled_at IS NULL))
UNIQUE (task_ref)                                                    -- exactly one Assignment per step
```

`UNIQUE(task_ref)` is Invariant 4's "exactly one Active Assignment exists with `task_ref = step_id`" — combined with the lifecycle being Active → Recalled (never re-Active), the unique row is either Active or Recalled, and the demo never creates a second.

`Assignment.recall` is idempotent at the application layer: if the row is already in `Recalled`, return the trailing-decision success token the spec calls `not-active` without touching the row. This is exactly what the spec asks for in the *Cascade-recall of trailing assignments* subsection.

Index:

```
CREATE INDEX assignment_by_assignee_active
    ON assignment(assignee_ref) WHERE state = 'Active';
```

Powers the "what's in my in-tray right now?" query in one read.

### 4.6 `audit_event` — Audit Trail event log + hash chain

```
event_id           INTEGER  PRIMARY KEY AUTOINCREMENT
seq                INTEGER  NOT NULL  UNIQUE                          -- monotonic, used for hash chain order
action_ref         TEXT     NOT NULL
actor_ref          TEXT     NOT NULL  REFERENCES actor(actor_ref)
chain_id           TEXT     NULL      REFERENCES chain(chain_id)
step_id            TEXT     NULL      REFERENCES approval_step(step_id)
recorded_at        TEXT     NOT NULL
data_json          TEXT     NOT NULL                                  -- {trailing?, subject_ref?, scope?, reason?, recalled_step_ids?, cascade_partial?, ...}
retention_policy   TEXT     NOT NULL
retention_until    TEXT     NOT NULL
attestation        TEXT     NOT NULL                                  -- HMAC-SHA256 over canonical payload, key = actor.credential_secret
prev_row_hash      TEXT     NOT NULL                                  -- '' for the genesis row
row_hash           TEXT     NOT NULL                                  -- SHA-256(prev_row_hash || canonical(row payload))
CHECK (action_ref IN (
    'chain_initiated','chain_withdrawn',
    'step_approved','step_rejected','step_withdrawn',
    'chain_resolved','chain_initiation_failed','cascade_completed'))
CHECK (retention_policy IN ('sox_7_year','fda_part_11_predicate_rule','ich_e6_tmf'))
CHECK (LENGTH(prev_row_hash) IN (0, 64))
CHECK (LENGTH(row_hash) = 64)
```

The eight allowed `action_ref` values are the complete chain-level + step-level event vocabulary from the spec's *Action wiring* and *Cascade-recall* subsections, plus `chain_initiation_failed` (named in `initiate_chain` step 7c) and `cascade_completed` (named in the partial-failure recovery paragraph). Nothing else is ever inserted.

Triggers and constraints:

```
CREATE TRIGGER audit_event_immutable_after_insert
BEFORE UPDATE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;

CREATE TRIGGER audit_event_no_delete
BEFORE DELETE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;
```

Indexes:

```
CREATE INDEX audit_event_by_chain          ON audit_event(chain_id, seq);
CREATE INDEX audit_event_by_step           ON audit_event(step_id, seq);
CREATE INDEX audit_event_by_action         ON audit_event(action_ref, recorded_at);
```

The `seq` column is the cheap, totally-ordered key the hash chain walks. `seq` is assigned in the same transaction as the insert via `MAX(seq)+1` (safe under SQLite's single-writer model). `row_hash` is `SHA-256(prev_row_hash || canonical_json({seq, action_ref, actor_ref, chain_id, step_id, recorded_at, data_json, retention_policy, retention_until, attestation}))`. Tampering with any row breaks the chain at that point; `verify_record(event_id)` walks from row 1 to `event_id`, recomputes the chain, and confirms attestations.

### 4.7 What is deliberately *not* a table

- `chain_to_steps`, `step_to_chain`, `step_to_assignment`, `chain_terminal_at` — the spec's emergent state. Three of those are queries over the relational store; `chain_terminal_at` is a column on `chain` and matches the spec one-to-one.
- A separate `audit_pending` table — the flag lives on the `chain` row.
- An "approver_set" array column — it's the `approval_step` rows ordered by `position`. Reading them back in that order yields declaration order, which the spec says is diagnostic-not-load-bearing.
- A configuration table — `approver_set_minimum`, `approver_set_uniqueness`, `quorum_rule_allowed`, `audit_trail_retention_policy`, and `application_actor_ref` are exported constants from `src/config.ts`. Schema stays lean; if the demo grows to multi-tenant we add the table then.

### 4.8 Invariants not (fully) enforceable in SQL

Three invariants are too rich for CHECK constraints and live in app logic plus a verifier route:

- **Invariant 1 — chain completeness.** "Every chain has at least `approver_set_minimum` steps." Enforced by writing all N rows inside the same transaction as the `chain` row in `initiate_chain`; nothing in SQL prevents a zero-step chain from existing if you skip the rest of the transaction. Verifier: `SELECT chain_id FROM chain LEFT JOIN approval_step USING(chain_id) GROUP BY chain_id HAVING COUNT(approval_step.step_id) < approver_set_minimum`.
- **Invariant 2 — quorum determinism.** Pure function of `(quorum_kind, quorum_m, A, R, W, P)`. Implemented in `src/domain/quorum.ts` and exposed at `GET /verify/chains/:id` so any reader (including a test) can recompute and compare against `chain.state`.
- **Invariant 5 — audit completeness.** "Every chain-level/step-level action has exactly one matching `record_action` call." Enforced by always wrapping the constituent write + audit insert in one transaction; verified by a SQL query that joins `chain` and `approval_step` state transitions against `audit_event` and confirms the counts match.

---

## 5. Constituent atom modules — responsibilities and signatures

`src/domain/quorum.ts` exports a single pure function:

`evaluate(kind, m, vector)` returns one of `'Pending' | 'Approved' | 'Rejected' | 'Withdrawn'`. The function is the *Quorum evaluation rule* subsection of the spec, transcribed to TypeScript and unit-testable in isolation. `one-of-N` is handled as `M-of-N` with `m = N`-but-actually-`m = 1`; the function unifies them per the spec's Round-2 finding.

`src/domain/approval_step.ts` mirrors the atom's surface: `submit`, `approve`, `reject`, `withdraw`, `read`. Each function takes the database handle as a parameter (so transactions compose), enforces the atom's invariants 1–10 via the CHECKs + triggers from §4.4, and propagates the rejection taxonomy `invalid-request | not-known | not-pending | unauthorized | storage-failure` unchanged. Nothing in this module knows about chains.

`src/domain/permissions.ts` exposes `grant(actor, scope, by)`, `revoke(grant_id, by)`, and `permitted(actor, scope) → 'permitted' | 'denied'`. Single-row queries; no knowledge of chains.

`src/domain/assignment.ts` exposes `assign(task_ref, assignee_ref) → assignment_id` and `recall(assignment_id) → 'ok' | 'not-active'`. The latter is intentionally idempotent on already-Recalled rows so the cascade-recall + late-decision interplay from the spec's *Cascade-recall of trailing assignments* and Invariant 4 works without special-casing.

`src/domain/audit_trail.ts` exposes `record_action({action_ref, actor_ref, credential, chain_id?, step_id?, data, retention_policy})` and `verify_record(event_id) → 'verified' | 'failed-verification(reason)'`. `record_action` (a) reads `MAX(seq)` and the latest `row_hash`, (b) computes the new row's attestation via HMAC-SHA256 with the actor's `credential_secret`, (c) computes `row_hash` via SHA-256 over the canonical payload, (d) inserts the row. All steps are inside the calling transaction so an outer abort rolls the audit row back with the constituent write — the spec's "every chain-level action produces exactly one `record_action`" stays trivially true.

`src/domain/chain.ts` is the composition. It owns the five action-signature functions (`initiate_chain`, `withdraw_chain`, `approve_step`, `reject_step`, `withdraw_step`), the `read_chain` query, and the chain-state re-evaluation that follows step decisions. The transaction shape for each action is in §7.

---

## 6. Quorum evaluation rule (pseudocode-flavored function spec)

Inputs:

- `kind`: `'all-of-N' | 'M-of-N' | 'one-of-N'`
- `m`: `number | null` — defined when `kind === 'M-of-N'`; otherwise null
- `vector`: `{ a: number; r: number; w: number; p: number }` where `a + r + w + p = n`, `n = |approver_set|`

Output: `'Pending' | 'Approved' | 'Rejected' | 'Withdrawn'`

Rule (transcribed from the spec's *Quorum evaluation rule*):

- If `kind === 'all-of-N'`:
  - `a === n` → Approved
  - `r >= 1` → Rejected (rejection takes priority over withdrawal)
  - `r === 0 && w >= 1` → Withdrawn (cascade-by-withdrawal)
  - else → Pending
- If `kind === 'M-of-N'` (with `one-of-N` rewritten to `M-of-N` with `m = 1`):
  - `a >= m` → Approved
  - `(n - r - w) < m && r >= 1` → Rejected
  - `(n - r - w) < m && r === 0 && w >= 1` → Withdrawn
  - else → Pending

The function is pure, deterministic, and order-independent in outcome — the spec's stated properties of the rule. Tests exhaustively enumerate `(n, m, a, r, w, p)` tuples for small N (up to N=5) and assert the table.

The function does *not* know about `trailing`. Trailing logic is the caller's concern: after a step decision, `chain.ts` first reads `chain.state`; if it is already terminal, the chain-state re-evaluation step is skipped entirely (no `chain_resolved` event is emitted; the audit row for the step decision carries `trailing = true`).

---

## 7. Action wiring (transaction shapes)

Every chain-level action follows the spec's three-step shape (permissions, audit, constituent). Every step-level action follows the spec's shape (constituent, audit, chain re-eval). Each function below opens one `BEGIN IMMEDIATE` and commits or rolls back at the end. The application-actor identity referenced as `app_actor` is the seeded `actor_ref = 'system@demo'` with `kind = 'application'`.

### 7.1 `initiate_chain(actor_ref, subject_ref, scope, approver_set, quorum_rule, m?, reason?)`

1. `permitted(actor_ref, 'chains:initiate')` → if `denied`, return `403 permission-denied`. No transaction yet.
2. Structural validation in TS: `|approver_set| >= approver_set_minimum`; if `approver_set_uniqueness`, pairwise-distinct; quorum kind in allowed set; if `M-of-N`, `1 <= m <= |approver_set|`; `subject_ref` and `scope` non-whitespace. Failure → `400 invalid-request`.
3. `BEGIN IMMEDIATE`.
4. Allocate `chain_id`. INSERT into `chain` with `state = 'Pending'`, `initiated_at = now`.
5. For each `approver_ref` in declaration order (positions 0..N-1): INSERT into `approval_step` returning `step_id`.
6. For each `step_id`: INSERT into `assignment` with `state = 'Active'`.
7. `record_action(chain_initiated, actor_ref, chain_id, data = { subject_ref, scope, approver_set, quorum_rule, m })`.
8. `COMMIT`. Return `201 { chain_id }`.

Failure recovery (the three spec cases at `initiate_chain` step 7):

- A failure anywhere in steps 4–7 inside the transaction → ROLLBACK and return `500 recording-failure`. Because all four writes are in one SQLite transaction, the partial-state cases the spec enumerates (k of N steps, j of N assignments, no audit row) cannot land. The `audit_pending` flag column exists on `chain` because the spec defines it, and is wired into `read_chain`'s response shape, but the demo never has reason to set it — single-transaction discipline subsumes the spec's case (c) recovery path. A note in `chain.ts` calls this out so a future implementor moving to a distributed store knows where the flag belongs.

### 7.2 `withdraw_chain(actor_ref, chain_id, reason)`

1. `permitted(actor_ref, 'chains:withdraw')` → if `denied`, `403`.
2. `BEGIN IMMEDIATE`. SELECT chain row; if missing → `404 not-known`; if `state <> 'Pending'` → `409 not-pending`; if `initiator_ref <> actor_ref` → `403 unauthorized`.
3. For each step in `approval_step WHERE chain_id = ? AND state = 'Pending' ORDER BY position`:
   - `approval_step.withdraw(step_id, withdrawn_by = initiator_ref, reason)`.
   - `record_action(step_withdrawn, actor_ref = initiator_ref, chain_id, step_id, data = { reason, trailing: false })`.
   - `assignment.recall(step_to_assignment[step_id])`.
4. UPDATE `chain SET state = 'Withdrawn', chain_terminal_at = now, terminal_reason = reason WHERE chain_id = ?`.
5. `record_action(chain_withdrawn, actor_ref, chain_id, data = { reason })`.
6. `COMMIT`. Return `200`.

The cascade is serialized inside one transaction; no partial-cascade flag needed in the demo.

### 7.3 `approve_step(actor_ref, chain_id, step_id, reason?)`

1. `BEGIN IMMEDIATE`.
2. SELECT step; if missing or `step.chain_id <> chain_id` → `404 not-known`.
3. Read `chain.state`. Compute `trailing = (chain.state <> 'Pending')`. The chain's terminal state does *not* gate the call — the spec's Pass-1-Round-3 fix.
4. `approval_step.approve(step_id, decided_by = actor_ref, reason)` — atom-level checks fire here (Invariant 4: `decided_by = approver_ref`; Invariant 3: must be Pending). Propagate `unauthorized | not-pending | invalid-request` as-is.
5. `assignment.recall(step_to_assignment[step_id])` — idempotent on already-Recalled.
6. `record_action(step_approved, actor_ref, chain_id, step_id, data = { reason, trailing })`.
7. If `trailing` is `false`: re-read the `(A, R, W, P)` vector for this chain. Call `quorum.evaluate(kind, m, vector)`. If the result is `'Pending'`, COMMIT and return. Otherwise:
   - Determine the recall set: all `step_id`s in this chain whose corresponding assignment is still `Active`.
   - If the new chain state is `'Withdrawn'` (cascade-by-withdrawal case): for each still-Pending step in the chain, call `approval_step.withdraw(step_id, withdrawn_by = initiator_ref, reason = "chain withdrawn by cascade…")` and emit a `step_withdrawn` audit row with `trailing = false`.
   - For every step in the recall set: `assignment.recall(...)`.
   - UPDATE `chain SET state = ?, chain_terminal_at = now, terminal_reason = ?`.
   - `record_action(chain_resolved, actor_ref = app_actor, chain_id, data = { state, reason, recalled_step_ids })`. `recalled_step_ids` is always present, as the spec mandates.
8. `COMMIT`. Return `200 { step_state, chain_state, trailing }`.

### 7.4 `reject_step(actor_ref, chain_id, step_id, reason)`

Identical to `approve_step` except `reason` is required (Approval Step Invariant 6), the atom call is `approval_step.reject(...)`, and the audit `action_ref` is `step_rejected`. Quorum re-evaluation may now transition the chain to `Rejected`.

### 7.5 `withdraw_step(actor_ref, chain_id, step_id, reason)`

Identical except `approval_step.withdraw(step_id, withdrawn_by = actor_ref, reason)` (Approval Step's Invariant 5 checks `withdrawn_by = submitter_ref`, which is the chain initiator); audit `action_ref = step_withdrawn`. Withdraw counts toward quorum unreachability under both rules.

### 7.6 `read_chain(actor_ref, query) → ChainView[] | 400 | 403`

1. `permitted(actor_ref, 'chains:read')` → if `denied`, `403`.
2. Validate filter keys. Allowed: `chain_id`, `subject_ref`, `scope`, `initiator_ref`, `state`, `initiated_at[after]`, `initiated_at[before]`, `chain_terminal_at[after]`, `chain_terminal_at[before]`. Any other key → `400 invalid-query`.
3. Build SELECT over `chain` filtered as above. For each result row: attach the ordered `approval_step` rows for this chain, attach each step's current `assignment` row, attach `audit_pending`. Return as a JSON array (or render to the chain-list / chain-detail view for HTML requests).

`read_chain` deliberately does not surface raw `audit_event` rows — auditors hit `/audit?chain_id=...` for that, mirroring the spec's "`AuditTrail.verify_record` directly" guidance.

---

## 8. Hono route map

One row per spec action signature, plus the read and admin routes the demo UI needs.

| Spec action | HTTP | Path | Body / query | Success | Rejections (HTTP / token) |
|---|---|---|---|---|---|
| `initiate_chain` | POST | `/chains` | `{ subject_ref, scope, approver_set: actor_ref[], quorum_rule, m?, reason? }` | 201 `{ chain_id }` | 403 permission-denied · 400 invalid-request · 500 recording-failure |
| `withdraw_chain` | POST | `/chains/:chain_id/withdraw` | `{ reason }` | 200 `{ state: 'Withdrawn' }` | 403 permission-denied · 404 not-known · 409 not-pending · 403 unauthorized · 500 |
| `approve_step` | POST | `/chains/:chain_id/steps/:step_id/approve` | `{ reason? }` | 200 `{ step_state, chain_state, trailing }` | 400 · 404 · 409 · 403 · 500 |
| `reject_step` | POST | `/chains/:chain_id/steps/:step_id/reject` | `{ reason }` | 200 same shape | 400 · 404 · 409 · 403 · 500 |
| `withdraw_step` | POST | `/chains/:chain_id/steps/:step_id/withdraw` | `{ reason }` | 200 same shape | 400 · 404 · 409 · 403 · 500 |
| `read_chain` | GET | `/chains` | query string per §7.6 | 200 `ChainView[]` | 403 · 400 invalid-query |
| `read_chain` (single) | GET | `/chains/:chain_id` | — | 200 `ChainView` or 404 | 403 · 404 |

Audit substrate routes (not in spec as actions, but the demo needs them):

| Purpose | HTTP | Path | Notes |
|---|---|---|---|
| List audit events | GET | `/audit` | filters: `chain_id`, `step_id`, `action_ref`, `from`, `to` |
| Verify one event | GET | `/audit/:event_id/verify` | recomputes attestation + walks hash chain; returns `{ verified \| failed-verification(reason) }` |
| Verify chain segment | GET | `/verify/chains/:chain_id` | independent recompute of Invariant 2 (`quorum.evaluate` vs `chain.state`) + Invariants 4/5 cross-check |

UI routes (HTML; same domain functions, JSX-rendered output):

| Page | HTTP | Path | Purpose |
|---|---|---|---|
| Landing / chain list | GET | `/` | Server-rendered list, current actor's `chains:read`-filtered |
| New chain form | GET | `/new` | Form; submits to POST `/chains` |
| Chain detail | GET | `/chains/:chain_id` | Steps + assignments + audit log inline; HTMX buttons for approve/reject/withdraw |
| In-tray | GET | `/me/in-tray` | Steps where `assignment.assignee_ref = current_actor AND state = 'Active' AND approval_step.state = 'Pending'` |
| Audit log | GET | `/audit-ui` | Paginated; "Verify" button per row hits `/audit/:id/verify` and swaps in a result chip |
| Act-as | POST | `/act-as` | sets cookie `actor_ref`; 302 back to referrer |
| Static | GET | `/styles.css`, `/htmx.min.js` | served from `public/` |

HTMX wiring: the approve/reject/withdraw buttons on a step row do `hx-post` to the relevant POST route and swap the row fragment plus the chain banner (state + terminal info). The response shape for HTMX requests is HTML (JSX-rendered fragment); for JSON `Accept` headers it's JSON. One handler per route, content-negotiated.

---

## 9. UI / view layout

Layout is intentionally boring — the demo's job is to make Invariants 2, 4, 5, and 7 visible, not to impress.

- **Top bar.** Current actor display, dropdown to switch (POSTs to `/act-as`), link to `/me/in-tray` with a count badge.
- **Chain list (`/`).** A table: chain_id (short), subject_ref, scope, quorum (`all-of-N` / `M-of-N(2)` / `one-of-N`), state (pill), initiator, initiated_at, action ("View"). Filter form bound to `read_chain` query string. The current actor's `chains:initiate` grant determines whether the "+ New chain" button is visible.
- **Chain detail (`/chains/:id`).** Top banner with chain state + `chain_terminal_at` + `audit_pending` flag if set. Below: ordered step rows, each with approver display name, state pill, decided-at, decision reason, plus the row's Active/Recalled assignment status. If the current actor is the approver and the step is Pending, show approve / reject / withdraw buttons (the withdraw button is visible only if current actor is the chain initiator; reject requires a reason field). Below the step list: inline audit log for this chain (action_ref, actor, recorded_at, "Verify" button).
- **In-tray (`/me/in-tray`).** One row per Active assignment for the current actor; each row links to the chain and offers the same approve/reject inline.
- **Audit log (`/audit-ui`).** Global view with the same filters as `/audit`. The Verify button surfaces a green check or a red mismatch, with a tooltip showing which check failed (attestation, hash chain, both).
- **Demo-tamper helper (optional).** A red-warning admin panel that POSTs to a hidden `/admin/tamper` endpoint to mutate one audit row's `data_json`, deliberately breaking the chain. Refresh the audit log and watch Verify go red. This is the easiest way to make the records-alone forgery defense self-explanatory to a first-time viewer. Off by default; behind a `?dev=1` flag.

---

## 10. Tailwind 4 — CSS-only setup

The demo uses Tailwind v4's CSS-first configuration. No `tailwind.config.js`, no PostCSS step, no JS-side bundler.

`app.css`:

```css
@import "tailwindcss";

@source "./src/views/**/*.tsx";
@source "./src/routes/pages.ts";

@theme {
  see src/inkset.css and ../VisualDesignSystem.md
}
```

`@source` is the v4 mechanism that replaces the old `content` array — it tells Tailwind where to scan for class names. Pointing it at `src/views/**/*.tsx` plus the one routes file that occasionally renders inline is enough.

`deno.json` task:

```
"tasks": {
  "build:css": "tailwindcss -i app.css -o public/styles.css --minify",
  "dev":       "deno task build:css --watch & deno run -A --watch src/main.ts"
}
```

The `tailwindcss` CLI here is the standalone v4 binary (downloaded to `bin/tailwindcss` by an idempotent setup script and committed-ignored, or invoked via `deno run -A npm:@tailwindcss/cli`). Either form works; the standalone binary avoids the npm round-trip.

Two confirmations the plan is honest about:

- HTMX is one ~14 KB file vendored into `public/`; not a JS bundler.
- The Hono JSX renderer produces strings server-side; no client-side JSX runtime.

---

## 11. Seed data

`src/db/seed.ts` populates:

**Actors (11 rows):**

- `system@demo` — kind `application`, used for `chain_resolved` and `cascade_completed` audit attribution.
- `controller_morgan`, `finance_director_chen`, `cfo_park`, `ceo_walsh` — for the SOX walkthrough.
- `qa_manager`, `qp_santos`, `qp_lopez`, `qp_kim` — for the FDA Part 11 walkthrough.
- `coordinator_lee`, `pi_okafor`, `pi_chen`, `pi_müller`, `pi_singh` — for the ICH GCP walkthrough.

(Five extras for the GCP scenario; six total approvers in the pool minus `coordinator_lee`.)

**Permission grants:**

- `controller_morgan`, `qa_manager`, `coordinator_lee` → `chains:initiate`, `chains:withdraw`.
- All human actors → `chains:read`.
- `system@demo` → no grants. Its writes are application-actor audit emissions only.

**Three pre-seeded chains** mirroring the spec's examples so every visible state is reachable on first boot:

1. SOX journal entry — initiator `controller_morgan`, approver set `[finance_director_chen, cfo_park, ceo_walsh]`, `all-of-N`. Submit, then have `cfo_park` approve so the chain is half-decided.
2. FDA batch release — initiator `qa_manager`, approver set `[qp_santos, qp_lopez, qp_kim]`, `M-of-N(2)`. Submit, then approve as `qp_santos` and `qp_lopez` so the chain reaches Approved with `qp_kim`'s step trailing-Pending and Assignment recalled — the spec's late-decision scenario is one click away from being demonstrated.
3. ICH GCP deviation — initiator `coordinator_lee`, approver set `[pi_chen, pi_okafor, pi_müller, pi_singh]`, `one-of-N`. Leave fully Pending so the in-tray for each PI shows one Active assignment.

Plus one freshly-Withdrawn chain to show the cascade-by-initiator path, and one Rejected chain (under all-of-N where one approver rejected) to show the cascade-by-quorum path. All five chain visual states (Pending half-decided, Approved-with-trailing, Pending-fresh, Withdrawn, Rejected) visible on the landing page from minute zero.

---

## 12. Tests / Generation Acceptance mapping

The spec's *Generation acceptance* section names six checks. Each maps to a test file or function:

1. **Reconstruct any chain's full lifecycle** → `scenarios.test.ts` walks the three seeded scenarios via the HTTP surface and asserts `read_chain` returns the chain plus its ordered steps plus its assignments plus its audit events.
2. **Verify quorum determinism over every terminal chain** → `invariants.test.ts` enumerates every terminal chain in the database and asserts `quorum.evaluate(...)` over the step state vector equals `chain.state`. Re-run after every test that mutates state.
3. **Verify chain completeness and immutability** → `invariants.test.ts` asserts `|approval_step rows| = |approver_set declared|`, every step's `chain_id = chain.chain_id`, and that attempts to UPDATE any immutable field fail with the trigger error.
4. **Verify assignment coverage during pendency and recall on transition** → `invariants.test.ts` for every Pending step in a Pending chain there's exactly one Active assignment with matching `assignee_ref`; for every terminal step or step in a terminal chain, no Active assignment.
5. **Verify audit completeness** → `invariants.test.ts` joins `chain` and `approval_step` state transitions against `audit_event` action_ref counts; every chain-level transition produces exactly one `chain_initiated` / `chain_withdrawn` / `chain_resolved`, every step transition produces exactly one `step_approved` / `step_rejected` / `step_withdrawn`.
6. **Verify chain terminal absorption** → `invariants.test.ts` creates a chain, drives it to Approved, makes a trailing decision, asserts `chain.state` and `chain_terminal_at` are unchanged and that the trailing audit row carries `trailing = true`.

Plus:

- `quorum.test.ts` — exhaustive table-driven test of the pure function over N up to 5 for each quorum kind.
- `audit_tamper.test.ts` — for each rowtype: mutate `data_json`, mutate `attestation`, mutate `row_hash`, splice a row out, splice a forged row in. In each case `verify_record(:event_id)` returns `failed-verification(<reason>)` and `/verify/chains/:id` flags the chain.

---

## 13. Wiring decisions — judgment calls beyond the user's four answers

Each of these is a place where the spec leaves room and the implementation picks a position; calling them out so the user can override before code lands.

- **Per-chain mutex strength.** SQLite WAL + `BEGIN IMMEDIATE` + `busy_timeout = 5000` is a per-DB writer lock — strictly stronger than per-`chain_id` serialization. We accept the throughput hit (single writer) for transactional simplicity. If the demo ever needs per-chain concurrency we add a chain-keyed in-process `Promise` queue ahead of the transaction.
- **Idempotency on retries.** The spec does not require API-level idempotency. Calling `approve_step` twice on a now-Approved step returns `409 not-pending` from the atom layer, which is correct. If demo UX wants idempotent-by-key submission we add a `Idempotency-Key` header → audit-event lookup, but it's not in the plan today.
- **Clock.** `now()` is `new Date().toISOString()` in TS, written into every `*_at` column and `recorded_at`. The spec's *Clock source for `chain_terminal_at`* edge case is acknowledged in `chain.ts` comments; Trusted Timestamping is named as out-of-scope for the demo.
- **Cascade-partial recovery.** Because all cascade calls execute inside one transaction, partial cascade cannot land in the demo's storage model — either the whole transition commits or none of it does. The `cascade_partial` data field on `chain_resolved` is therefore always `false` here; we keep it in the schema and emit it for shape stability with the spec.
- **`audit_pending` flag.** Same reasoning: cannot occur given the single-transaction discipline. The column exists, `read_chain` surfaces it, but the demo never sets it. The comment in `chain.ts` names this and points to the spec's case (c).
- **Application actor security.** `system@demo` has a `credential_secret` like any other actor; its writes are HMAC-attested. The demo does not implement Compromise Disclosure or credential rotation — the spec explicitly forward-references those as out-of-scope.
- **Failed-initiation audit log.** The spec's edge case says rejected initiation attempts produce no audit entry by default. The demo follows that default — denied `POST /chains` returns 403 with no `audit_event` written. The "Failed-Attempt Log" composing pattern named in the spec is out-of-scope.
- **Hono ↔ Deno adapter.** `Deno.serve(app.fetch)` directly; no Node-server shim, no Express adapter.

---

## 14. Spec invariant → enforcement site (single-page reference)

| Invariant | Where enforced | How |
|---|---|---|
| 1. Chain completeness | App + verifier route | `initiate_chain` writes N steps in one txn; `/verify/chains/:id` re-counts |
| 2. Quorum determinism | App + verifier route | `quorum.evaluate` called on every step decision; `/verify/chains/:id` recomputes |
| 3. Permission enforcement | App middleware | `permitted()` check in front of every chain-level POST and GET |
| 4. Assignment coverage during pendency, with cascade-on-terminal | SQL UNIQUE + app cascade | `assignment.UNIQUE(task_ref)` + `recall(...)` inside the same txn as state change |
| 5. Audit completeness | App txn + verifier | Same-txn audit insert; counts re-checked by `invariants.test.ts` |
| 6. Constituent invariants preserved | SQL CHECKs + triggers + atom modules | Per §4.4 / §4.5 / §4.6 and the per-atom module functions |
| 7. Chain terminal absorption | SQL trigger | `chain_no_terminal_state_change`; plus app short-circuits re-evaluation when chain already terminal |
| 8. Chain immutability of declared fields | SQL trigger | `chain_no_field_mutation` + `chain_terminal_at_set_once` |
| 9. Forensic completability | App query design + audit substrate | `read_chain` join + hash-chained `audit_event` |

Plus the constituent-atom invariants for Approval Step (1–10) covered by §4.4 CHECKs + triggers + `approval_step.ts`; Permissions invariants covered by §4.2 + `permissions.ts`; Assignment invariants covered by §4.5 + `assignment.ts`; Audit Trail substrate invariants covered by §4.6 + `audit_trail.ts`.

---

## 15. Deferred items tracker (`CORNERS.md`)

The first build lands with a `CORNERS.md` alongside the implementation that tracks every deferred-against-spec item discovered along the way, so a future session sees exactly what is still owed. Initial entries (all pre-known, named in §13 above):

- **Audit table collapse.** Single `audit_event` table satisfies every Audit Trail invariant the composition needs, but loses the four-atom didactic shape and the spec's *retention-horizon asymmetry* and *partial-attestation orphan* edge cases. Relaxation: split into four tables (`event_log`, `actor_identity`, `retention_window`, `tamper_evidence`). Estimated ~3–4 hours.
- **`audit_pending` flag never fires.** Single-transaction discipline means `initiate_chain` case (c) cannot physically happen; the column exists per spec but no code path sets it. Relaxation: add a test-only `?fail-at=audit` fault-injection knob to step 6 of `initiate_chain`. Estimated ~1 hour.
- **`cascade_partial` flag never fires.** Same root cause as above. Same fix, ~30 min once the fault-injection knob exists.
- **No `cascade_completed` retry loop.** Spec names a retry-and-emit cycle for partial cascades; demo skips it because there are no partials to retry. Add when fault injection lands.
- **Per-DB writer lock instead of per-`chain_id` mutex.** Strictly stronger than the spec requires; not a correctness corner. Relaxation if throughput ever matters: in-process keyed promise queue + deferred transactions, ~1 hour.

Items the spec itself defers (named here so they're not mistaken for cuts the demo made):

- Compromise Disclosure / `application_actor` credential rotation.
- Approver standing-authorization check at `initiate_chain`.
- Trusted Timestamping for `chain_terminal_at` under distributed deployment.
- Legal Hold composition.
- Failed-Attempt Log composition (audit entries for denied `initiate_chain` calls).
- Delegation, sequenced ordering, segregation-of-duties.

The deferred items file is updated as the build proceeds — every time the implementation collapses, defers, or stubs something against the spec, a one-line entry lands in `CORNERS.md` with the spec section, the cut made, and the estimated relaxation cost. The intent is that this file is the honest counterpart to the demo: a reader who only has the demo and `CORNERS.md` knows exactly how the demo deviates from the spec.

---

## 16. Build sequence (suggested order, not part of the plan's contract)

A two-day buildable sequence:

1. `deno.json`, `app.css`, Tailwind binary, layout shell, `/styles.css` serving.
2. `src/db/schema.sql`, `migrate.ts`, `client.ts`, seed actors only.
3. `domain/permissions.ts`, `domain/actor.ts`, `middleware/current_actor.ts`, `/act-as`.
4. `domain/audit_trail.ts` with `record_action` + `verify_record` and the tamper test.
5. `domain/approval_step.ts` + `domain/assignment.ts` with their tests.
6. `domain/quorum.ts` + exhaustive table tests.
7. `domain/chain.ts` — initiate, then the three step actions, then withdraw, then read.
8. `routes/chains.ts`, `routes/steps.ts`, `routes/audit.ts`, `routes/verify.ts`.
9. `views/*.tsx` + `routes/pages.ts` (HTML side) + HTMX wiring.
10. Seed the three scenarios; record a short walkthrough.

By step 6 the spec's pure rule is verified in isolation; by step 7 the composition runs end-to-end against a single test client. By step 10 the demo is browsable.
