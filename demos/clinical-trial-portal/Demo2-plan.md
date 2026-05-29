# Grace Commons Demo 2 — Clinical Trial Site Portal

**Working title:** `demos/clinical-trial-portal` (codename: *Beacon*)
**Thesis under demonstration:** the spec is canonical; this regulated-grade application is one *render* of structured natural-language compositions from the Grace Commons library into a concrete stack, with every seam observable to an end user.
**Audience:** Show HN; Daniel Jackson (author, *The Essence of Software*).

---

## 0. Rendering Scope

Grace Commons compositions are stack-agnostic by construction: the library's spec for *Audit Trail* or *External Onboarding* tells you what atoms the composition touches and what invariants it preserves — it does not tell you whether you implement it in Deno or Next.js or Rails. To get from spec to working code requires two inputs:

1. **The structured library specs** (stack-agnostic). These define *what* each atom and composition does.
2. **A set of reference patterns for the target stack** (stack-specific). These define *how to express what* in this codebase: what an atom file looks like, how a composition function emits an audit event, how a route is shaped, how a view is laid out.

Together they are the executable spec layer. Neither alone is sufficient.

This document is the **first render** of the demo into a deliberately minimal, boring stack: Deno + Hono + SQLite + HTMX + Tailwind, single-file TSX views, no build step beyond CSS. The reference patterns for that stack are in **Appendix A** and are required reading before implementation begins.

A **second render** — same compositions, same actor roster, same audit semantics, same `composition.ts` action codes, same hash-chain contract — targeting a more conventional stack (current candidate: Next.js + Prisma + PostgreSQL + React Server Components) is planned as a follow-up. The point of the multi-render strategy is to demonstrate that the library specs survive a stack swap; only Appendix A is replaced.

### Constraint layers

A separate axis from rendering: Grace Commons specs sit at the top of a layered constraint architecture. Each layer down adds a different *kind* of constraint with strictly more cost and strictly stronger guarantee:

| Layer              | Constraint            |
| ------------------ | --------------------- |
| Structured English | semantic intent       |
| TypeScript types   | implementation shape  |
| Alloy              | relational validity   |
| TLA+               | temporal validity     |
| Coq/Lean           | critical truth proofs |

The layers compose downward — a lower layer can mechanically verify an upper layer's claim, but cannot replace the upper layer's job of saying *what* to check. Structured English captures *what the user is trying to express*; types capture *what shape the code must have*; Alloy captures *what relations must hold*; TLA+ captures *what must hold over time*; Coq/Lean captures *what is provably true forever*.

This demo lives entirely in the top two layers. The compositions are structured English; the render adds TypeScript types. The lower three layers are deliberate future scope, and the demo is designed so each one has an obvious first target:

- **Alloy** — the cleanest candidate is the Permissions + Grants relational model. An Alloy spec could check invariants like *"no actor holds a `view_audit` grant with `scope='own'` and `scope='all'` simultaneously"* and *"every active grant has a non-revoked grantor."*
- **TLA+** — the natural target is the session + invitation lifecycle. A TLA+ spec could verify that *"no request is observed as authorized after its session has been revoked, under concurrent revocation and handling."*
- **Coq/Lean** — the highest-value first target is the audit chain's tamper-evidence property: *given an append-only `event_log` and the canonical hash construction in `domain/event_log.ts`, any single-row mutation to `payload_json` causes `verifyChain` to detect divergence in O(N) steps with no false negatives.* The proof effort is bounded and the property has regulatory weight under Part 11.

Naming these targets is not a commitment to do them — it is the answer to the obvious question a formal-methods reader will ask: *"where could you take this if you wanted the audit guarantee provable rather than testable?"* The answer is on the page.

---

This is also why this plan is well-suited to execution by a smaller model: when the spec layer and the reference patterns are both inline and unambiguous, the work that remains is mechanical — instantiate the patterns for each named atom, composition, route, and view. If a small model produces a working app from this plan, the thesis holds. If it does not, the failure tells us exactly which layer was under-specified.

---

## 1. Domain Story

**Beacon Clinical Research** is a single-site clinical research organization conducting a Phase II oncology trial under FDA 21 CFR Part 11. The portal is the site's electronic system of record for two things: who is authorized to operate on the study, and every action they take on subject records.

Three human roles inhabit the system:

- **Principal Investigator (PI).** Holds the master account at the site. Federally accountable for the conduct of the study. The PI invites Study Coordinators onto the site, grants them the permissions they need, and revokes them when staff change roles. The PI does not normally enroll subjects herself — that is delegated.
- **Study Coordinator (SC).** Day-to-day operator. Enrolls subjects into the study (assigning a subject code per the protocol), records study visits, logs protocol deviations. Each SC is an externally onboarded actor: they exist as a Party (an email and a name the PI knows) before they exist as an Actor (a credentialed identity inside the system).
- **Clinical Research Associate (CRA, the Monitor).** External auditor employed by the sponsor. Read-only. Their job is to walk the audit trail, verify attribution, and prove tamper-evidence to the sponsor and, if subpoenaed, to the FDA. The CRA never mutates state.

**The human scenario the demo plays out, end to end:**

1. Anya, the PI, opens the portal and invites a new coordinator, Maya, by email. The portal issues an invitation. (External Onboarding — invitation step.)
2. Maya receives the link, opens it, sets a password. The portal binds her Party (email/name) to a freshly created Actor with a credential. She lands logged in. (External Onboarding — onboard step; Login; Audit Trail substrate.)
3. Anya grants Maya the `enroll_subject` and `record_visit` permissions. (Attributed Permissions Admin.)
4. Maya enrolls subject `BCN-014` into the protocol and records the screening visit. Both actions write to the audit log, attributed to her actor identity, with the request's session id captured. (Session-Gated Authorization; Audit Trail.)
5. Jordan, the CRA, logs in and opens `/audit`. He filters to actions on subject `BCN-014`, sees the complete chain — invitation issued, invitation accepted, actor enrolled, grants issued, subject enrolled, visit recorded — and clicks `/audit/verify` to recompute the hash chain. The page reports `Verified 47 events.`

The Show HN headline is not "look at this clinical trial portal." It is "this regulated-grade lifecycle was built from a public spec library, and you can see the seams." The clinical trial is the demonstration vehicle, not the product.

**Why clinical trial and not, say, a controlled-substance log or a KYC reviewer:** Part 11 is a famous, named, googleable regulation. The PI/Coordinator/Monitor triangle is widely understood. The actions (enroll a subject, record a visit) are concrete without requiring real PII — synthetic subject codes are protocol-standard practice. No reader will dispute that the audit trail is mandatory.

---

## 2. Composition Coverage Map

Every composition the demo exercises, the seam it sits on, and what a user sees there.

| Composition | Atoms involved | Seam (code surface) | What the user does |
|---|---|---|---|
| **C16 External Onboarding** — invite step | Invitation + Party Identity + Audit Trail substrate | `composition.issueInvitation()` called from `POST /invitations`. Writes a `parties` row (if email is new), an `invitations` row with a random token, and an `event_log` row (`invitation.issued`) in one transaction. | PI opens `/people`, clicks "Invite Coordinator," enters email + display name + intended role. The next screen shows the invite link to copy. |
| **C16 External Onboarding** — onboard step | Invitation + Credential + Party Identity + Audit Trail substrate | `composition.acceptInvitation()` called from `POST /invitations/accept/:token`. In one transaction: validates token, creates `actors` row bound to the party, creates `credentials` row, marks invitation accepted, opens a session, writes three `event_log` rows (`invitation.accepted`, `actor.enrolled`, `credential.created`, `session.opened`). | Invitee follows the link to a "Set your password" form. After submit they are logged in on `/dashboard`. |
| **C13 Login** | Credential + Session | `composition.login()` from `POST /login`. Verifies password against `credentials.secret_hash`, writes a `sessions` row, emits `session.opened`. | Standard email + password form at `/login`. |
| **C14 Session-Gated Authorization** | Session + Permissions | `requireSession()` middleware on every protected route. Looks up session by cookie token, checks not expired or revoked, attaches `ctx.actor`. `requirePermission(code)` middleware checks for an unrevoked `grants` row. | Unauthenticated → redirect to `/login`. Authenticated but lacking the permission → `403` page that names the missing permission. |
| **APA — Attributed Permissions Admin** (library calls this C13 colloquially) | Permissions + Actor Identity | `composition.grantPermission()` / `composition.revokeGrant()` from `POST /grants` and `POST /grants/:id/revoke`. Each writes/updates a `grants` row and emits `grant.issued` or `grant.revoked`. | PI views `/people`, sees each coordinator as a row with their current grants and a "Grant" / "Revoke" affordance per permission. |
| **C1 Audit Trail** | Event Log + Actor Identity + Retention Window + Tamper Evidence | Every mutation in `composition.ts` calls `appendEvent(ctx, action, target, payload)` *inside the same transaction*. The append computes `this_hash = sha256(canonicalJSON({occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prev_hash}))` and reads `prev_hash` from the previous row's `this_hash`. The `event_log` table is append-only by convention; no UPDATE or DELETE statements reference it anywhere in the codebase. | CRA visits `/audit` to query, `/audit/verify` to recompute the chain, `/audit/export.csv` for a sealed export. |

The seams are intentionally visible. The README points at the `composition.ts` boundary and says: *"Mutations only happen here. Every function in this file writes one or more atoms and one or more audit events. If a code path mutates state without going through `composition.ts`, it is a bug."*

---

## 3. Actor Roster

**Seeded at `migrate + seed` time:**

| Display name | Role | Email (login) | Password (seed) | Permissions initially held | Notes |
|---|---|---|---|---|---|
| Dr. Anya Okonkwo | Principal Investigator | `anya@beacon.clinical` | `demo-pi` | `invite_actor`, `grant_permission`, `enroll_subject`, `record_visit`, `view_audit` (own) | Bootstrapped via direct insert in `seed.ts` with a clearly commented "this is the seam — production would do this via a setup wizard or out-of-band provisioning" header. |
| Jordan Lee | Clinical Research Associate (Monitor) | `jordan@beacon.clinical` | `demo-cra` | `view_audit` (all) | Read-only. Cannot pass `requirePermission` for any mutating route. |

**Onboarded during the demo flow (not seeded):**

| Display name | Role | Entry point | After accept |
|---|---|---|---|
| Maya Chen | Study Coordinator | PI issues an invitation at `/people` → invite link → invitee accepts | Logged in with no permissions. PI then grants `enroll_subject`, `record_visit`, and `view_audit (own)`. |

**Permission catalog (rows in `permissions`, seeded):**

| code | label | scope semantics |
|---|---|---|
| `invite_actor` | Invite a coordinator | Allowed to call `POST /invitations`. |
| `grant_permission` | Manage grants on others | Allowed to call `POST /grants` and `/grants/:id/revoke`. |
| `enroll_subject` | Enroll a subject into the protocol | Allowed to call `POST /subjects`. |
| `record_visit` | Record a study visit | Allowed to call `POST /subjects/:id/visits`. |
| `view_audit` | View the audit log | Allowed to call `GET /audit*`. Scope is "all" for CRA, "own" for SC (filters `actor_id = self`). Encoded by a `scope` column on `grants`. |

The `scope` column on `grants` is the one composition emergent piece — APA's atom has it as a free-text discriminator; we use `'all' | 'own'` here, documented in `domain/grants.ts`.

---

## 4. Route Shape

All routes are server-rendered TSX views returned by Hono handlers. HTMX is used for form posts and partial swaps; full page loads still work for every route (no JS required to operate the app — degradation is a deliberate Part 11 robustness property).

### Public

| Method | Path | Returns |
|---|---|---|
| GET | `/` | Landing page. Beacon brand, one-sentence pitch, link to `/login`. |
| GET | `/login` | Login form. |
| POST | `/login` | On success: set session cookie, redirect to `/dashboard`. On failure: 401 with form re-rendered + error. Emits `session.opened` on success; `login.failed` on failure (attributed to party if email matches, else anonymous). |
| GET | `/logout` | Revokes session row, clears cookie, emits `session.closed`, redirects `/`. |
| GET | `/invitations/accept/:token` | Set-password form, after validating token is unrevoked and unexpired. |
| POST | `/invitations/accept/:token` | Calls `composition.acceptInvitation()`. Sets session cookie. Redirects `/dashboard`. |

### Authenticated (requires session)

| Method | Path | Permission | Returns |
|---|---|---|---|
| GET | `/dashboard` | (session only) | Role-aware home. PI sees invite/people shortcuts. SC sees subjects shortcut. CRA sees audit shortcut. |

### PI surface

| Method | Path | Permission | Returns |
|---|---|---|---|
| GET | `/people` | `invite_actor` OR `grant_permission` | Two sections: pending invitations, enrolled actors with their grants. |
| POST | `/invitations` | `invite_actor` | Issues invitation. Renders the invite link in a copy-able card (HTMX swap). |
| POST | `/invitations/:id/revoke` | `invite_actor` | Marks invitation revoked. Emits `invitation.revoked`. |
| POST | `/grants` | `grant_permission` | Issues a grant. Emits `grant.issued`. Body: `grantee_actor_id`, `permission_code`, `scope`. |
| POST | `/grants/:id/revoke` | `grant_permission` | Revokes grant. Body: `reason` (required, captured in audit payload). Emits `grant.revoked`. |

### SC surface

| Method | Path | Permission | Returns |
|---|---|---|---|
| GET | `/subjects` | `enroll_subject` OR `record_visit` | List of subjects with their status (`screening`, `enrolled`, `withdrawn`, `completed`). |
| GET | `/subjects/new` | `enroll_subject` | Enrollment form: subject code (next sequential), enrollment notes. |
| POST | `/subjects` | `enroll_subject` | Creates subject. Emits `subject.enrolled`. |
| GET | `/subjects/:id` | `enroll_subject` OR `record_visit` | Subject detail: code, status, visit history. |
| POST | `/subjects/:id/visits` | `record_visit` | Records visit. Body: `visit_kind` (`screening`/`week_4`/`week_12`/etc.), `notes`. Emits `visit.recorded`. |

### Audit surface

| Method | Path | Permission | Returns |
|---|---|---|---|
| GET | `/audit` | `view_audit` | Filterable list (actor, action, target_kind, date range). Header shows running hash-chain verdict computed for the filtered set. Each row links to its target if extant. Viewing the page itself emits `audit.viewed` (meta-event). |
| GET | `/audit/verify` | `view_audit` | Recomputes the full hash chain from event #1. Reports `Verified N events.` or `Tamper detected at event #X (expected hash …, found …)`. |
| GET | `/audit/export.csv` | `view_audit` | CSV with all columns including `prev_hash` and `this_hash`. Emits `audit.exported` with the row count. |

### Static

`/static/styles.css` — built once at migrate/start time via `tailwindcss` CLI.

---

## 5. DB Schema Sketch

SQLite via `@db/sqlite`. Migrations live in `migrations/0001_init.sql`, applied idempotently by `scripts/migrate.ts`. All foreign keys declared with `ON DELETE RESTRICT`; nothing in this system is hard-deleted by application code.

### Atom stores

```sql
-- Party Identity atom
CREATE TABLE parties (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL                       -- ISO8601
);

-- Actor Identity atom
CREATE TABLE actors (
  id            INTEGER PRIMARY KEY,
  party_id      INTEGER NOT NULL REFERENCES parties(id),
  created_at    TEXT NOT NULL
);

-- Credential atom (password kind only for the demo; column allows others)
CREATE TABLE credentials (
  id            INTEGER PRIMARY KEY,
  actor_id      INTEGER NOT NULL REFERENCES actors(id),
  kind          TEXT NOT NULL CHECK (kind IN ('password')),
  secret_hash   TEXT NOT NULL,                      -- Argon2id encoded string via @denosaurs/argontwo (RFC 9106 default variant). bcrypt is not used.
  created_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- Session atom
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY,
  actor_id      INTEGER NOT NULL REFERENCES actors(id),
  token         TEXT NOT NULL UNIQUE,               -- opaque random, stored in HttpOnly cookie
  issued_at     TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- Permissions atom: registry of permission codes
CREATE TABLE permissions (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL
);

-- Permissions atom: grants
CREATE TABLE grants (
  id              INTEGER PRIMARY KEY,
  grantor_actor_id INTEGER NOT NULL REFERENCES actors(id),
  grantee_actor_id INTEGER NOT NULL REFERENCES actors(id),
  permission_id   INTEGER NOT NULL REFERENCES permissions(id),
  scope           TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','own')),
  issued_at       TEXT NOT NULL,
  revoked_at      TEXT,
  revoke_reason   TEXT
);
CREATE INDEX idx_grants_grantee ON grants(grantee_actor_id, permission_id) WHERE revoked_at IS NULL;

-- Invitation atom
CREATE TABLE invitations (
  id                  INTEGER PRIMARY KEY,
  party_id            INTEGER NOT NULL REFERENCES parties(id),
  intended_role       TEXT NOT NULL,                -- 'study_coordinator' for demo; free-form for extension
  token               TEXT NOT NULL UNIQUE,
  issued_by_actor_id  INTEGER NOT NULL REFERENCES actors(id),
  issued_at           TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  accepted_at         TEXT,
  accepted_by_actor_id INTEGER REFERENCES actors(id),
  revoked_at          TEXT
);

-- Event Log atom (C1 audit substrate)
CREATE TABLE event_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,  -- AUTOINCREMENT guarantees monotonic id reuse cannot happen
  occurred_at   TEXT NOT NULL,
  actor_id      INTEGER REFERENCES actors(id),      -- nullable for anonymous events (login.failed before identity is known)
  session_id    INTEGER REFERENCES sessions(id),
  action        TEXT NOT NULL,
  target_kind   TEXT,                               -- e.g. 'subject','grant','invitation','session','actor','audit'
  target_id     INTEGER,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  prev_hash     TEXT NOT NULL,                      -- '' for row #1
  this_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_event_log_actor   ON event_log(actor_id);
CREATE INDEX idx_event_log_target  ON event_log(target_kind, target_id);
CREATE INDEX idx_event_log_action  ON event_log(action);
CREATE INDEX idx_event_log_time    ON event_log(occurred_at);

-- Retention Window atom: configuration only, no per-row data
CREATE TABLE retention_policy (
  id            INTEGER PRIMARY KEY CHECK (id = 1), -- single-row table
  days          INTEGER NOT NULL DEFAULT 2555,      -- 7 years per Part 11
  enforce_on_read BOOLEAN NOT NULL DEFAULT 1
);
```

### Domain (regulated-artifact) tables

These are not atoms — they are the concrete things the audit trail attributes. Their schemas are deliberately small.

```sql
CREATE TABLE studies (
  id              INTEGER PRIMARY KEY,
  protocol_number TEXT NOT NULL UNIQUE,             -- e.g. 'BCN-OX-201'
  title           TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE subjects (
  id                 INTEGER PRIMARY KEY,
  study_id           INTEGER NOT NULL REFERENCES studies(id),
  subject_code       TEXT NOT NULL UNIQUE,          -- e.g. 'BCN-014'
  status             TEXT NOT NULL DEFAULT 'screening'
                     CHECK (status IN ('screening','enrolled','withdrawn','completed')),
  enrolled_by_actor_id INTEGER NOT NULL REFERENCES actors(id),
  enrolled_at        TEXT NOT NULL,
  notes              TEXT
);

CREATE TABLE visits (
  id                  INTEGER PRIMARY KEY,
  subject_id          INTEGER NOT NULL REFERENCES subjects(id),
  visit_kind          TEXT NOT NULL,
  recorded_by_actor_id INTEGER NOT NULL REFERENCES actors(id),
  recorded_at         TEXT NOT NULL,
  notes               TEXT
);
```

### Composition emergent state

Beyond what the atoms declare, the only emergent state is the `scope` column on `grants` (documented above) and the `retention_policy` single-row table. No other tables exist. The fact that the schema is this small is the point — compositions reuse the atoms rather than introduce parallel storage.

---

## 6. Audit Trail Design

### Events recorded

Every action below is emitted by exactly one function in `composition.ts`. The action codes are stable strings, namespaced by dotted target kind, intended to read as English when listed.

| Action code | Emitter | Target | Payload fields |
|---|---|---|---|
| `invitation.issued` | `issueInvitation()` | `invitation` | `email`, `display_name`, `intended_role`, `expires_at` |
| `invitation.accepted` | `acceptInvitation()` | `invitation` | `actor_id` (the new actor) |
| `invitation.revoked` | `revokeInvitation()` | `invitation` | `reason` |
| `actor.enrolled` | `acceptInvitation()` | `actor` | `party_id`, `via_invitation_id` |
| `credential.created` | `acceptInvitation()` | `credential` | `kind` |
| `session.opened` | `login()`, `acceptInvitation()` | `session` | `actor_id`, `via` (`login` or `onboard`) |
| `session.closed` | `logout()`, `revokeSession()` | `session` | `reason` |
| `login.failed` | `login()` | (none, or `party` if email matched) | `email`, `reason` (`bad_password`, `unknown_email`) |
| `grant.issued` | `grantPermission()` | `grant` | `grantee_actor_id`, `permission_code`, `scope` |
| `grant.revoked` | `revokeGrant()` | `grant` | `reason` |
| `subject.enrolled` | `enrollSubject()` | `subject` | `study_id`, `subject_code` |
| `visit.recorded` | `recordVisit()` | `visit` | `subject_id`, `visit_kind` |
| `audit.viewed` | `GET /audit` handler | `audit` | `filters` (the query string normalized) |
| `audit.exported` | `GET /audit/export.csv` | `audit` | `row_count`, `filters` |

The meta-events (`audit.viewed`, `audit.exported`) are deliberate. Under Part 11, *viewing* the regulated record is itself a regulated act for export trails.

### Tamper evidence

`this_hash = sha256_hex( canonicalJSON({ id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prev_hash }) )`

Canonical JSON: keys sorted lexicographically, no whitespace, `null` preserved, numbers as JS numbers. A `canonicalize()` helper lives in `lib/canonical.ts` and is the only allowed JSON serializer for hashing. (Documented and unit-tested.)

`prev_hash` is read from the previous row's `this_hash`. Row #1 uses `prev_hash = ''`. The unique constraint on `this_hash` makes accidental duplication impossible.

### Verify view

`/audit/verify` walks the table in `id` order, recomputes each `this_hash`, and reports either:

- `Verified N events through hash chain (computed at <timestamp>).`
- `Tamper detected at event #X.  Expected this_hash = <a…>, found <b…>.  Previous good event: #Y.`

The verify computation is also exposed as a CLI: `deno task verify` for monitors who do not want to trust the web UI.

### Retention window

Stored in `retention_policy`. Default 2555 days (7 years). Enforced as a *filter on read* in the `/audit` handler when `enforce_on_read = 1`. The demo seed leaves enforcement off so the full chain is visible, with a UI toggle on `/audit` that flips it — this is the pedagogical seam: "what would your monitor see in year 8?"

Importantly, retention does *not* delete rows. Hard deletion would break the hash chain and undermine tamper evidence. Part 11 permits filtering for operational presentation but requires the record itself to survive its retention window intact.

### Audit view query surface

Filters on `/audit`:

- Actor (dropdown of all known actors + "anonymous")
- Action (multi-select of known codes)
- Target kind (dropdown)
- Target id (free input)
- Date range (`from`, `to`)
- Free-text search over `payload_json` (SQLite LIKE on the JSON column; documented as best-effort)

Each row renders: `#id — <occurred_at> — <actor display name or "anonymous"> — <action> — <target kind>:<target id> — <payload summary>`.

Each row has a "Show hash" disclosure that reveals `prev_hash` and `this_hash` for the row, so a reader can visually walk the chain on a small set.

---

## 7. Build Phases

Each phase is independently shippable: the demo runs (perhaps with reduced functionality) at the end of every phase, and tests pass.

**Required input.** Every phase below presumes the reference patterns in Appendix A. The patterns are not suggestions — they are the render-layer spec. A "completed" phase is one whose files conform to those patterns *and* pass the test bar (§8.14). If a pattern is genuinely ambiguous for a particular file, do not improvise: surface the ambiguity, propose the smallest extension to the patterns that resolves it, and continue.

### Phase 0 — Scaffold *(half day)*

- Create `demos/clinical-trial-portal/` mirroring APA's layout.
- Copy `deno.json`, `tailwind.config.ts`, `scripts/{migrate,seed,start,build-css}.ts`, layout shell.
- Empty `composition.ts`, empty migrations, README skeleton naming the compositions in scope.
- `deno task start` boots and serves `/` with a "coming soon" page.

### Phase 1 — Schema + atoms *(1 day)*

- Write `migrations/0001_init.sql` with every table from §5.
- One file per atom under `domain/` exporting pure read/write helpers (no audit emission yet, no composition logic): `parties.ts`, `actors.ts`, `credentials.ts`, `sessions.ts`, `permissions.ts`, `grants.ts`, `invitations.ts`, `event_log.ts`, `retention_policy.ts`.
- `domain/subjects.ts`, `domain/visits.ts`, `domain/studies.ts` for the regulated artifacts.
- Unit tests per file using `deno test` with an in-memory SQLite instance per test.

### Phase 2 — Composition layer + audit *(1–2 days)*

- `composition.ts` with: `issueInvitation`, `acceptInvitation`, `revokeInvitation`, `login`, `logout`, `grantPermission`, `revokeGrant`, `enrollSubject`, `recordVisit`. Each wraps a transaction.
- `lib/canonical.ts` (canonical JSON) and `lib/hash.ts` (SHA-256 via Web Crypto).
- `appendEvent(ctx, action, target, payload)` helper called by every composition function in the same transaction.
- Per-function doc comments in `composition.ts` quote the library spec for each composition verbatim above the function (per decision #13 — the spec-to-code mapping is inspectable in the source, not just in the README).
- `lib/password.ts` uses Argon2id via `jsr:@denosaurs/argontwo@^0.2` (WASM, signed on GitHub Actions, JSR score 100%). Algorithm variant is `Argon2id` per RFC 9106's default recommendation. bcrypt is not used.
- Unit tests: every composition function asserts both the atom write *and* the audit event in one transaction (rollback test: forced error mid-function leaves zero rows in both).
- `deno task verify` CLI.

### Phase 3 — Auth + onboarding routes *(1–2 days)*

- `routes/auth.ts`: `/login`, `/logout`.
- `routes/invitations.ts`: invite accept flow.
- `routes/people.ts`: PI view of actors + grants + pending invitations; issue/revoke invitation; issue/revoke grant.
- `middleware/requireSession.ts`, `middleware/requirePermission.ts`.
- TSX views co-located: `views/login.tsx`, `views/accept-invitation.tsx`, `views/people.tsx`, `views/_layout.tsx`.

### Phase 4 — Regulated action surface *(1 day)*

- `routes/subjects.ts`: list, new, create, detail, record visit.
- `views/subjects/{list,new,detail}.tsx`.
- SC dashboard tile on `/dashboard`.

### Phase 5 — Audit views *(1 day)*

- `routes/audit.ts`: `/audit`, `/audit/verify`, `/audit/export.csv`.
- `views/audit/{list,verify}.tsx`.
- Filter form with HTMX live updates; running hash-chain verdict header.

**▶ END OF PHASE 5: demo is Show HN-runnable on Fly.io.** The full lifecycle works: invite → accept → grant → enroll subject → record visit → audit walk → verify chain.

### Phase 6 — Seeds, polish, README *(1 day)*

- `seed.ts`: PI Anya, CRA Jordan, study `BCN-OX-201`, permission catalog rows. Clearly commented "this is the seam" headers.
- Tailwind polish on every view.
- README with: thesis paragraph, composition map (linked to library), one-screen walkthrough with four screenshots (PI invites, invitee onboards, SC enrolls subject, CRA verifies chain), `deno task` reference.
- `WALKTHROUGH.md` — the five-minute reading tour for a thoughtful engineer.
- Fly.io deploy config — bump from the default `shared-cpu-1x` to at least `shared-cpu-2x` / 1 GB. Argon2id hashing is the only meaningful compute cost in this demo and the demo is single-tenant, so a small fixed machine with a bit of headroom keeps login/onboarding snappy without overpaying. Add GitHub Actions for the live demo URL.

### Phase 7 — Optional stretch *(post-launch)*

- Real SMTP for invitation delivery (currently the link is shown in-app).
- Per-study isolation (multiple protocols at the same site).
- TOTP on PI account.
- Soft-revoke pattern for an actor (revoke all grants + sessions in one transaction, emitting `actor.suspended`).

---

## 8. Decisions (committed)

All previously-open questions are answered. These are now constraints on the implementation.

1. **Domain.** Clinical trial site portal under FDA 21 CFR Part 11. No alternative considered further.
2. **Invitation delivery.** In-UI link only. No SMTP in scope. The invite link is displayed in a copy-able card on the PI's `/people` view after issuance.
3. **Password hashing.** Argon2id via `jsr:@denosaurs/argontwo@^0.2`. WASM-based, signed on GitHub Actions, JSR score 100%, denosaurs org. Algorithm variant: `Argon2id` (RFC 9106 default — hybrid of Argon2i side-channel resistance and Argon2d GPU resistance). No fallback. bcrypt is not used. (Package was last published two years before this plan; the underlying primitive is stable, but reconfirm the version pin and the `hash`/`verify` signatures against the current JSR listing at the moment Phase 2 begins.)
4. **Session token.** Opaque random, DB-backed (`sessions` table is the source of truth). Not JWT. `session.closed` means a row was actually revoked.
5. **Tamper evidence.** SHA-256 hash chain over canonical JSON, as specified in §6. No signatures, no per-deployment private key. The property demonstrated is *detection of tampering by an actor with DB write access* — sufficient for the demo's claim.
6. **Retention.** Enforcement is **off** by default in the demo seed so the full chain is visible. A clearly-labeled toggle on `/audit` flips enforcement on, with explanatory copy in the UI ("Hide events older than the retention window. The records are not deleted — Part 11 forbids that — just filtered for presentation."). Both states get a README screenshot.
7. **Subject privacy.** Synthetic subject codes only (e.g. `BCN-014`). No real names, no PII columns on `subjects`. The form does not accept a name field.
8. **PI bootstrap.** PI account is seeded directly in `seed.ts` with a loud header comment: `// SEAM: in production this happens via out-of-band provisioning. A "Bootstrap Identity" composition is out of scope for this demo.` No setup wizard.
9. **SC audit access.** SC is granted `view_audit` with `scope='own'`. The `/audit` route applies `WHERE actor_id = ctx.actor.id` when the active grant's scope is `'own'`. CRA's grant has `scope='all'`.
10. **`login.failed` attribution.** `event_log.actor_id IS NULL`. When the submitted email matches a known party, `payload_json.party_id` is populated for forensic value. Never attribute a failed login to the actor — the actor did not perform the action.
11. **Show HN headline framing.** Lead claim: structured natural-language specifications composed into a working regulated-grade system. Clinical trial framing appears second, as the demonstration vehicle. README opening paragraph and Show HN post copy both follow this order.
12. **README screenshots.** Four images, in order: (a) PI on `/people` issuing Maya's invitation, (b) Maya on the set-password page after following the link, (c) Maya on `/subjects/new` enrolling `BCN-014`, (d) Jordan on `/audit/verify` reading "Verified N events."
13. **Library cross-linking.** README links every composition name to its entry in the Grace Commons library. Each composition function in `composition.ts` carries a doc comment quoting the relevant library spec text above the function body. Doc comments are written in Phase 2 (alongside the functions), not deferred to Phase 6.
14. **Test bar for "Show HN ready."** Three test layers required before Phase 5 is called done: (a) unit tests on every atom helper and every composition function (with the rollback assertion: forced mid-function error leaves zero atom rows *and* zero audit rows); (b) one end-to-end HTTP test that walks invite → accept → grant → enroll subject → record visit → audit walk; (c) a tamper-detection test that directly mutates a `payload_json` value in `event_log` and asserts `/audit/verify` flags the exact row id.

---

## Appendix A — Reference Patterns (the render-layer spec)

These patterns are the second half of the executable spec. Every file in the demo must conform to the pattern that names its kind. Where a pattern shows a concrete name (e.g. `parties`), substitute the appropriate atom; where it shows logic, preserve the shape (transaction boundary, audit emission position, error handling).

### A.1 Directory layout

```
demos/clinical-trial-portal/
  deno.json
  main.ts                          # Hono app entrypoint; mounts all routes
  composition.ts                   # The ONLY mutation surface
  domain/                          # One file per atom (+ regulated artifacts)
    parties.ts
    actors.ts
    credentials.ts
    sessions.ts
    permissions.ts
    grants.ts
    invitations.ts
    event_log.ts                   # Includes appendEvent + tamper-evidence
    retention_policy.ts
    studies.ts
    subjects.ts
    visits.ts
  lib/
    db.ts                          # SQLite open, Tx + Ctx types, withTx helper
    canonical.ts                   # Canonical JSON (deterministic key order)
    hash.ts                        # sha256hex + randomToken
    password.ts                    # Argon2id hash/verify (scrypt fallback)
  middleware/
    require_session.ts             # C14: session lookup, attaches ctx.actor
    require_permission.ts          # C14: grant lookup, scope enforcement
  routes/
    auth.ts                        # /login, /logout
    invitations.ts                 # /invitations/accept/:token
    people.ts                      # /people, /invitations, /grants
    subjects.ts                    # /subjects, /subjects/:id/visits
    audit.ts                       # /audit, /audit/verify, /audit/export.csv
    dashboard.ts                   # /, /dashboard
  views/
    _layout.tsx
    login.tsx
    accept_invitation.tsx
    dashboard.tsx
    people.tsx
    subjects_list.tsx
    subjects_new.tsx
    subjects_detail.tsx
    audit_list.tsx
    audit_verify.tsx
  migrations/
    0001_init.sql                  # Full schema from §5
  scripts/
    migrate.ts                     # Apply migrations idempotently
    seed.ts                        # PI + CRA + permission catalog + study
    start.ts                       # Boot Hono server
    build_css.ts                   # tailwindcss CLI invocation
    verify.ts                      # CLI for `deno task verify`
  styles/tailwind.css              # @tailwind base/components/utilities
  static/styles.css                # Built artifact (gitignored)
  tests/
    _helpers.ts                    # withTestDb, monkeyPatchHashToThrow
    atoms/<name>.test.ts           # One per atom
    composition.test.ts            # Rollback assertions
    e2e.test.ts                    # Lifecycle walk via HTTP
    tamper.test.ts                 # Mutate payload, expect /audit/verify to flag
  README.md
  WALKTHROUGH.md
```

### A.2 `deno.json`

```jsonc
{
  "tasks": {
    "migrate": "deno run -A scripts/migrate.ts",
    "seed":    "deno run -A scripts/seed.ts",
    "css":     "deno run -A scripts/build_css.ts",
    "start":   "deno run -A main.ts",
    "verify":  "deno run -A scripts/verify.ts",
    "test":    "deno test -A",
    "all":     "deno task migrate && deno task seed && deno task css && deno task start"
  },
  "imports": {
    "hono":     "jsr:@hono/hono@^4",
    "hono/":    "jsr:@hono/hono@^4/",
    "sqlite":   "jsr:@db/sqlite@^0.12",
    "argontwo": "jsr:@denosaurs/argontwo@^0.2",
    "std/":     "jsr:@std/"
    // Argon2id is the only password primitive. Do not add bcrypt or scrypt
    // packages; if argontwo's API has drifted, fix the wiring in
    // lib/password.ts rather than swap algorithms.
  },
  "compilerOptions": {
    "jsx": "precompile",
    "jsxImportSource": "hono/jsx"
  }
}
```

### A.3 `lib/db.ts` — the transaction + context primitive

```typescript
import { Database } from "sqlite";

export type DB = Database;

export interface Actor { id: number; party_id: number; display_name: string; }
export interface Session { id: number; actor_id: number; token: string; }

/** Request-scoped context. Built by middleware, threaded into composition functions. */
export interface Ctx {
  db: DB;
  actor: Actor | null;       // null for anonymous (login, accept-invitation)
  session: Session | null;
}

/** Inside a transaction: tx.db is the same handle, tx.ctx carries actor/session. */
export interface Tx { db: DB; ctx: Ctx; }

export function openDb(path: string): DB {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

/** Run `fn` inside a SQLite transaction. Commits on success, rolls back on throw. */
export function withTx<T>(ctx: Ctx, fn: (tx: Tx) => T): T {
  ctx.db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn({ db: ctx.db, ctx });
    ctx.db.exec("COMMIT");
    return result;
  } catch (err) {
    ctx.db.exec("ROLLBACK");
    throw err;
  }
}
```

### A.4 Atom file pattern

One per atom under `domain/`. Atom helpers are **pure data operations**: they read or write their own table, and they do not emit audit events, do not start transactions, do not call other atoms. All cross-atom coordination lives in `composition.ts`.

```typescript
// domain/parties.ts
//
// Atom: Party Identity
// Library spec: <quote the relevant Grace Commons library text verbatim>
//
// Invariants:
//   - email is unique
//   - display_name is non-empty
//   - rows are never deleted; identity is permanent

import type { DB } from "../lib/db.ts";

export interface Party {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export function getByEmail(db: DB, email: string): Party | null {
  return db.prepare("SELECT * FROM parties WHERE email = ?").get<Party>(email) ?? null;
}

export function getById(db: DB, id: number): Party | null {
  return db.prepare("SELECT * FROM parties WHERE id = ?").get<Party>(id) ?? null;
}

export function create(db: DB, email: string, display_name: string): Party {
  if (!email || !display_name) throw new Error("parties.create: email and display_name required");
  const now = new Date().toISOString();
  const row = db.prepare(
    "INSERT INTO parties (email, display_name, created_at) VALUES (?, ?, ?) RETURNING *"
  ).get<Party>(email, display_name, now);
  if (!row) throw new Error("parties.create: insert returned no row");
  return row;
}
```

Every other atom file follows this shape: a typed row interface, narrow read helpers, narrow write helpers, invariants documented in a header comment quoting the library spec.

### A.5 `composition.ts` function pattern

Every public function in `composition.ts`:

1. Takes a `Ctx` and a typed input object.
2. Wraps its body in `withTx(ctx, (tx) => { … })`.
3. Calls atom helpers on `tx.db`.
4. Calls `appendEvent(tx, …)` for **every** state change, **inside the same transaction**.
5. Returns a plain data object (no DB handles, no `Promise` unless genuinely async).
6. Is preceded by a doc comment quoting the relevant library composition spec.

```typescript
// composition.ts
//
// The ONLY mutation surface. Every function here:
//   • runs inside a transaction
//   • writes atom rows
//   • emits one or more audit events
// If any step throws, the whole transaction rolls back — atom rows AND audit
// rows alike. This invariant is enforced by tests/composition.test.ts.

import * as parties from "./domain/parties.ts";
import * as invitations from "./domain/invitations.ts";
import { appendEvent } from "./domain/event_log.ts";
import { withTx, type Ctx } from "./lib/db.ts";
import { randomToken } from "./lib/hash.ts";

/**
 * Composition: External Onboarding (C16) — invite step.
 *
 * Library spec (quoted):
 *   "An invitation binds a known Party (email + display name) to a future
 *    Actor. The invitation carries a one-time token, an issuer, and an
 *    expiry. The invitation is itself an auditable artifact."
 *
 * Atoms touched: Party Identity, Invitation, Audit Trail substrate.
 * Audit events emitted: invitation.issued
 */
export function issueInvitation(ctx: Ctx, input: {
  email: string;
  display_name: string;
  intended_role: string;
  expires_in_days: number;
}): { invitation_id: number; token: string } {
  if (!ctx.actor) throw new Error("issueInvitation: requires authenticated actor");

  return withTx(ctx, (tx) => {
    const party = parties.getByEmail(tx.db, input.email)
      ?? parties.create(tx.db, input.email, input.display_name);

    const token = randomToken(32);
    const expires_at = new Date(Date.now() + input.expires_in_days * 86_400_000).toISOString();
    const inv = invitations.create(tx.db, {
      party_id: party.id,
      intended_role: input.intended_role,
      token,
      issued_by_actor_id: ctx.actor!.id,
      expires_at,
    });

    appendEvent(tx, {
      action: "invitation.issued",
      target_kind: "invitation",
      target_id: inv.id,
      payload: {
        email: input.email,
        display_name: input.display_name,
        intended_role: input.intended_role,
        expires_at,
      },
    });

    return { invitation_id: inv.id, token };
  });
}
```

All nine composition functions (§7 Phase 2 list) follow this shape. The audit event(s) emitted by each are spelled out in §6.

### A.6 `domain/event_log.ts` — audit append + tamper-evidence

This is the only atom helper that breaks the "narrow data operation" rule in a controlled way: it reads the previous row's `this_hash`, computes the new hash, and inserts. It does not start a transaction (the caller is in one) and it does not call other atoms. Hash computation lives in `lib/hash.ts` and `lib/canonical.ts`.

```typescript
// domain/event_log.ts
import type { Tx } from "../lib/db.ts";
import { canonicalize } from "../lib/canonical.ts";
import { sha256hex } from "../lib/hash.ts";

export interface EventRow {
  id: number;
  occurred_at: string;
  actor_id: number | null;
  session_id: number | null;
  action: string;
  target_kind: string | null;
  target_id: number | null;
  payload_json: string;
  prev_hash: string;
  this_hash: string;
}

export interface AppendEventInput {
  action: string;
  target_kind?: string | null;
  target_id?: number | null;
  payload?: Record<string, unknown>;
}

export function appendEvent(tx: Tx, input: AppendEventInput): number {
  const prev = tx.db.prepare(
    "SELECT this_hash FROM event_log ORDER BY id DESC LIMIT 1"
  ).get<{ this_hash: string }>();
  const prev_hash = prev?.this_hash ?? "";

  const lastId = tx.db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM event_log")
    .get<{ m: number }>()?.m ?? 0;
  const id = lastId + 1;

  const occurred_at = new Date().toISOString();
  const payload_json = canonicalize(input.payload ?? {});

  const hashable = canonicalize({
    id,
    occurred_at,
    actor_id: tx.ctx.actor?.id ?? null,
    session_id: tx.ctx.session?.id ?? null,
    action: input.action,
    target_kind: input.target_kind ?? null,
    target_id: input.target_id ?? null,
    payload_json,
    prev_hash,
  });
  const this_hash = sha256hex(hashable);

  tx.db.prepare(
    `INSERT INTO event_log
       (id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prev_hash, this_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, occurred_at,
    tx.ctx.actor?.id ?? null,
    tx.ctx.session?.id ?? null,
    input.action,
    input.target_kind ?? null,
    input.target_id ?? null,
    payload_json,
    prev_hash,
    this_hash,
  );
  return id;
}

/** Re-compute the chain from event #1. Returns the first divergent row, or null if intact. */
export function verifyChain(db: DB): { ok: true; count: number } | { ok: false; at: number; expected: string; found: string } {
  // Implementation: SELECT * FROM event_log ORDER BY id ASC; recompute each
  // this_hash using the same `hashable` shape as appendEvent; compare.
  // Return on first mismatch.
}
```

### A.7 `lib/canonical.ts` — canonical JSON

```typescript
/**
 * Canonical JSON for hashing: keys sorted lexicographically at every level,
 * no whitespace, numbers as JS numbers, null preserved. This is the ONLY
 * allowed JSON serializer for any value that will be hashed.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as object).sort();
  return "{" + keys.map((k) =>
    JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])
  ).join(",") + "}";
}
```

### A.8 `lib/password.ts` — Argon2id

```typescript
// lib/password.ts
//
// Argon2id password hashing via @denosaurs/argontwo.
//
// Algorithm variant: Argon2id — RFC 9106's default recommendation, a hybrid
// of Argon2i (side-channel resistance) and Argon2d (GPU resistance).
//
// Parameters chosen to target ~50–150 ms per hash on commodity hardware.
// Fly.io deployment is sized with headroom (see Phase 6 — at least
// shared-cpu-2x / 1 GB), so these defaults are expected to hold on prod.
// Re-benchmark before adjusting either direction.

import { hash as argonHash, verify as argonVerify, type Argon2Algorithm } from "argontwo";

const PARAMS = {
  algorithm: "Argon2id" as Argon2Algorithm,
  memoryCost: 19_456,    // KiB (~19 MiB; OWASP minimum for Argon2id as of writing)
  timeCost: 2,           // iterations
  parallelism: 1,
};

/**
 * Hash a plaintext password. Returns the encoded string in PHC format
 * ($argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>), which is what gets
 * stored in `credentials.secret_hash`.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return await argonHash(plaintext, PARAMS);
}

/** Constant-time verify against a previously stored PHC-format encoded hash. */
export async function verifyPassword(plaintext: string, encoded: string): Promise<boolean> {
  return await argonVerify(plaintext, encoded);
}

// IMPLEMENTATION NOTE: confirm the exact exported names and signatures of
// `hash` and `verify` against `jsr:@denosaurs/argontwo@^0.2` before wiring.
// The shape above (params object + PHC-format encoded string) is the
// intended contract; if the package's API differs in surface details,
// adapt the call sites here without changing this module's exported API.
```

`lib/password.ts` is the only place Argon2 is referenced in the codebase. `composition.ts` (specifically `acceptInvitation` and `login`) calls `hashPassword` / `verifyPassword` and never the package directly.

### A.9 Middleware pattern

```typescript
// middleware/require_session.ts
import type { Context, Next } from "hono";
import * as sessions from "../domain/sessions.ts";
import * as actors from "../domain/actors.ts";
import { openDb } from "../lib/db.ts";

export async function requireSession(c: Context, next: Next) {
  const token = c.req.cookie("session");
  const db = c.get("db");
  const session = token ? sessions.getActive(db, token) : null;
  if (!session) return c.redirect("/login");
  const actor = actors.getById(db, session.actor_id);
  if (!actor) return c.redirect("/login");
  c.set("ctx", { db, actor, session });
  await next();
}

// middleware/require_permission.ts
import type { Context, Next } from "hono";
import * as grants from "../domain/grants.ts";

/** Require ANY of the named permission codes. Scope is captured on ctx for downstream filtering. */
export function requirePermission(codes: string[]) {
  return async (c: Context, next: Next) => {
    const ctx = c.get("ctx");
    const active = grants.findActiveFor(ctx.db, ctx.actor.id, codes);
    if (!active) return c.html(<ForbiddenPage missing={codes} />, 403);
    c.set("granted_scope", active.scope); // 'all' | 'own'
    await next();
  };
}
```

### A.10 Route file pattern

One file per logical surface. Each route is `requireSession` + (where applicable) `requirePermission`, then a thin handler that calls `composition.ts` and renders a view.

```typescript
// routes/people.ts
import { Hono } from "hono";
import { requireSession } from "../middleware/require_session.ts";
import { requirePermission } from "../middleware/require_permission.ts";
import * as composition from "../composition.ts";
import * as actors from "../domain/actors.ts";
import * as grants from "../domain/grants.ts";
import * as invitations from "../domain/invitations.ts";
import { PeoplePage, InviteResultCard } from "../views/people.tsx";

export const peopleRoutes = new Hono()
  .use("*", requireSession)
  .get("/people", requirePermission(["invite_actor", "grant_permission"]), (c) => {
    const ctx = c.get("ctx");
    return c.html(
      <PeoplePage
        me={ctx.actor}
        actors={actors.listAll(ctx.db)}
        grants={grants.listAll(ctx.db)}
        invitations={invitations.listPending(ctx.db)}
      />
    );
  })
  .post("/invitations", requirePermission(["invite_actor"]), async (c) => {
    const ctx = c.get("ctx");
    const form = await c.req.parseBody();
    const { invitation_id, token } = composition.issueInvitation(ctx, {
      email: String(form.email),
      display_name: String(form.display_name),
      intended_role: String(form.intended_role ?? "study_coordinator"),
      expires_in_days: 7,
    });
    return c.html(<InviteResultCard invitation_id={invitation_id} token={token} />);
  });
```

### A.11 TSX view pattern

Single-file views under `views/`. Each view imports the shared `Layout`. All interactive elements use HTMX attributes (`hx-post`, `hx-target`, `hx-swap`). Tailwind utility classes only. No client-side JavaScript framework, no React.

```typescript
// views/_layout.tsx
import type { FC, PropsWithChildren } from "hono/jsx";

export const Layout: FC<PropsWithChildren<{ title: string; actor?: { display_name: string } | null }>> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title} — Beacon Clinical Research</title>
      <link rel="stylesheet" href="/static/styles.css" />
      <script src="https://unpkg.com/htmx.org@2.0.2" defer></script>
    </head>
    <body class="bg-gray-50 text-gray-900 antialiased">
      <header class="border-b bg-white">
        <div class="mx-auto max-w-5xl flex items-center justify-between px-6 py-3">
          <a href="/" class="font-semibold tracking-tight">Beacon</a>
          {props.actor && (
            <span class="text-sm text-gray-600">
              {props.actor.display_name} · <a href="/logout" class="underline">log out</a>
            </span>
          )}
        </div>
      </header>
      <main class="mx-auto max-w-5xl px-6 py-8">{props.children}</main>
    </body>
  </html>
);
```

```typescript
// views/people.tsx (excerpt — invite form + result card)
import { Layout } from "./_layout.tsx";

export const PeoplePage: FC<{ me: any; actors: any[]; grants: any[]; invitations: any[] }> = (p) => (
  <Layout title="People" actor={p.me}>
    <h1 class="text-2xl font-semibold mb-6">People</h1>

    <section class="bg-white rounded-lg border p-6 mb-8">
      <h2 class="text-lg font-medium mb-4">Invite a Coordinator</h2>
      <form hx-post="/invitations" hx-target="#invite-result" hx-swap="innerHTML" class="space-y-3">
        <input name="email" type="email" required placeholder="email@example.com"
               class="w-full border rounded px-3 py-2" />
        <input name="display_name" required placeholder="Display name"
               class="w-full border rounded px-3 py-2" />
        <input type="hidden" name="intended_role" value="study_coordinator" />
        <button class="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800">Issue invitation</button>
      </form>
      <div id="invite-result" class="mt-4"></div>
    </section>

    {/* actors + grants table, pending invitations table — same shape */}
  </Layout>
);

export const InviteResultCard: FC<{ invitation_id: number; token: string }> = (p) => (
  <div class="border border-emerald-300 bg-emerald-50 rounded p-4">
    <p class="text-sm text-emerald-900">
      Invitation #{p.invitation_id} issued. Share this link with the invitee:
    </p>
    <code class="block mt-2 text-xs bg-white border rounded p-2 break-all">
      {`/invitations/accept/${p.token}`}
    </code>
  </div>
);
```

### A.12 Test patterns

Atom test (one per atom):

```typescript
// tests/atoms/parties.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

Deno.test("parties.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const p = parties.create(ctx.db, "test@example.com", "Test User");
    assertEquals(p.email, "test@example.com");
    assertEquals(parties.getById(ctx.db, p.id)?.display_name, "Test User");
  });
});

Deno.test("parties.create rejects empty fields", () => {
  withTestDb((ctx) => {
    assertThrows(() => parties.create(ctx.db, "", "X"));
  });
});
```

Composition rollback test (the critical invariant):

```typescript
// tests/composition.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { withTestDb, monkeyPatchHashToThrow } from "./_helpers.ts";
import * as composition from "../composition.ts";

Deno.test("issueInvitation: forced audit failure leaves zero atom rows", () => {
  withTestDb((ctx) => {
    const countInv = () => ctx.db.prepare("SELECT COUNT(*) AS c FROM invitations").get<{c:number}>()!.c;
    const countLog = () => ctx.db.prepare("SELECT COUNT(*) AS c FROM event_log").get<{c:number}>()!.c;
    const beforeInv = countInv();
    const beforeLog = countLog();

    const restore = monkeyPatchHashToThrow();
    try {
      assertThrows(() =>
        composition.issueInvitation(ctx, {
          email: "x@example.com", display_name: "X",
          intended_role: "study_coordinator", expires_in_days: 7,
        })
      );
    } finally { restore(); }

    assertEquals(countInv(), beforeInv);
    assertEquals(countLog(), beforeLog);
  });
});
```

End-to-end lifecycle test:

```typescript
// tests/e2e.test.ts
// Boots the full Hono app against a fresh in-memory DB. Walks:
//   1. PI logs in
//   2. PI POSTs /invitations
//   3. Capture token from response HTML
//   4. Unauthenticated GET /invitations/accept/:token
//   5. POST password → expect 302 to /dashboard with session cookie
//   6. PI grants enroll_subject on the new actor
//   7. New actor POSTs /subjects → expect subject row + subject.enrolled event
//   8. New actor POSTs /subjects/:id/visits → expect visit.recorded event
//   9. CRA logs in, GET /audit/verify → expect "Verified N events"
```

Tamper-detection test:

```typescript
// tests/tamper.test.ts
Deno.test("verifyChain flags a directly-mutated payload", () => {
  withTestDb((ctx) => {
    // Arrange: issue an invitation (writes one event)
    composition.issueInvitation(ctx, { /* ... */ });

    // Tamper: rewrite payload_json of event #2 directly in SQL (simulating
    // an attacker with DB write access)
    ctx.db.prepare("UPDATE event_log SET payload_json = ? WHERE id = 2")
      .run('{"email":"attacker@evil.com"}');

    // Assert: verifyChain flags row 2 as the divergence point
    const result = event_log.verifyChain(ctx.db);
    assertEquals(result.ok, false);
    assertEquals((result as any).at, 2);
  });
});
```

### A.13 Library cross-linking convention

Two surfaces:

1. **README.md.** Every composition name is a markdown link to the library entry: `[External Onboarding (C16)](https://grace-commons.example/compositions/c16-external-onboarding)`. Same for atoms.
2. **Source code.** Every public function in `composition.ts`, every atom file header in `domain/`, carries a doc comment block that *quotes the library spec verbatim* above the implementation. The quoted text is the contract; the code below it is the render. If the quote and the code disagree, the quote wins and the code is a bug.

### A.14 What a "completed" file looks like

A file is considered complete when:

- It conforms to the pattern for its kind (above).
- Its header comment quotes the relevant library spec (for atoms and composition functions).
- Its tests pass (`deno task test`).
- It does not import or reference anything outside the patterns. In particular: no ORM, no service layer, no DI container, no class hierarchies. The render is deliberately flat.

If a file requires a deviation from these patterns, the deviation is itself a finding — surface it, don't bury it.
