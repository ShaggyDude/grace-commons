# Beacon — Five-Minute Reading Tour

This is the reading tour for an engineer who wants to understand the demo in depth, not just run it. The README covers what to run; this covers how it works and where to look.

---

## The thesis, in one paragraph

Software systems are routinely built from informal requirements, then tested against them informally, then audited informally. The specification exists in someone's head, in a ticket, in a comment, or not at all. Grace Commons is a bet that this is wrong: the spec should be a first-class artifact, expressed in structured natural language precise enough to drive code, tests, and contracts. This demo renders five compositions from the Grace Commons library into a working regulated-grade application — a Phase II oncology trial portal under FDA 21 CFR Part 11. The render is mechanical once the spec is written. If you find a gap between the spec and the code, that is the finding the methodology is designed to surface.

---

## What is "the seam"

The project README mentions seams. Here is what that means concretely.

Every mutation in the system goes through exactly one file: `composition.ts`. No route handler, no domain helper, no middleware directly writes to the database. They call a function in `composition.ts`, which wraps its work in a transaction, calls atom helpers, and emits audit events — all in one atomic unit. If a `POST /subjects` handler creates a subject row, it does so by calling `composition.enrollSubject()`, which writes the `subjects` row and the `subject.enrolled` audit event in a single `BEGIN IMMEDIATE / COMMIT`. If the event write fails, the subject row rolls back. If the subject write fails, no orphaned event gets committed.

The test for this invariant is `tests/composition.test.ts`, which monkeypatches `sha256hex` to throw mid-transaction and asserts that both the atom row and the audit row have zero count afterward. It runs for every composition function.

The seam is: if you want to understand what the system does, read `composition.ts`. The nine functions there cover the entire mutation surface. Everything else is plumbing.

---

## The five compositions

| Composition | Entry point in the code | What you observe |
|---|---|---|
| **C16 External Onboarding** — invite step | `composition.issueInvitation()` called from `POST /invitations` | Party upserted, invitation row created, `invitation.issued` event committed. The PI's `/people` page shows the copy-link card. |
| **C16 External Onboarding** — accept step | `composition.acceptInvitation()` called from `POST /invitations/accept/:token` | Actor created, credential hashed and stored, session opened, invitation marked accepted. Four events committed: `invitation.accepted`, `actor.enrolled`, `credential.created`, `session.opened` (via: "onboard"). |
| **C13 Login** | `composition.login()` called from `POST /login` | Argon2id verification runs before `withTx`. Session row created, `login.succeeded` event committed. Failed attempts commit `login.failed` independently — they are not lost on rollback. |
| **C14 Session-Gated Authorization** | `requireSession` + `requirePermission` middleware | Every protected route checks the session table (not expired, not revoked), then checks the grants table. `granted_scope` is attached to the Hono context so downstream handlers can filter `all` vs `own`. |
| **APA — Attributed Permissions Admin** | `composition.grantPermission()` / `composition.revokeGrant()` called from `POST /grants` and `POST /grants/:id/revoke` | Grant row created or revoked, `grant.issued` / `grant.revoked` event committed. The PI's `/people` page shows each actor's active grants with revoke affordances. |
| **C1 Audit Trail** | `appendEvent()` called inside every `withTx` block in `composition.ts` | Every mutation writes an event. The event carries `actor_id`, `session_id`, `occurred_at`, `action`, `target_kind`, `target_id`, and a `payload_json`. The `this_hash` is SHA-256 over canonical JSON of all those fields plus the previous row's hash. |

---

## The hash chain

The tamper-evidence property is in `domain/event_log.ts`.

```
prev_hash  ← this_hash of the previous row ('' for row #1)
this_hash  ← sha256hex(canonicalize({
               id, occurred_at, actor_id, session_id,
               action, target_kind, target_id,
               payload_json, prev_hash
             }))
```

`canonicalize()` in `lib/canonical.ts` sorts keys lexicographically at every level, produces no whitespace, and is the only allowed JSON serializer for values that will be hashed. It is 15 lines. Its behavior is unit-tested directly.

`verifyChain()` in `domain/event_log.ts` walks the table in `id` order, recomputes each `this_hash`, and returns the first divergence. It is exposed as:

- **`GET /audit/verify`** — the UI the CRA uses. Reports `Verified N events` or names the exact row id where divergence was detected.
- **`deno task verify`** — the CLI equivalent, for a monitor who does not want to trust the web UI.

The property demonstrated is *detection*, not *prevention*. An adversary with raw write access to the SQLite file who modifies any field of any row will be detected by the next `verifyChain` call. An adversary who *also* recomputes the hash chain on write is out of scope for this demo — that would require a tamper-evident append-only store, not a local SQLite file. The README is explicit about this.

---

## The regulated-access pattern

Three roles inhabit the system. Each sees a different surface:

**PI (Dr. Anya Okonkwo):** `/people`, `/subjects`, `/audit`. Holds `invite_actor`, `grant_permission`, `enroll_subject`, `record_visit`, and `view_audit (all)`. The only actor who can issue grants; the only actor who can invite new coordinators.

**Study Coordinator (Maya Chen):** `/subjects`, `/audit (own)`. Holds `enroll_subject`, `record_visit`, and `view_audit (own)`. The `own` scope means `/audit` applies `WHERE actor_id = ctx.actor.id` — she sees only events she authored.

**CRA / Monitor (Jordan Lee):** `/audit (all)`. Holds `view_audit (all)` only. Read-only. Cannot pass `requirePermission` for any mutating route.

The `granted_scope` field is set by `requirePermission` middleware on the Hono context. Downstream handlers read it from `c.get("granted_scope")`. The scope discrimination happens in exactly one place per surface: the `/audit` handler filters by `actor_id` when scope is `'own'`; the `/subjects` list handler filters by `enrolled_by_actor_id`.

---

## The async boundary

SQLite transactions in this codebase are synchronous (`withTx` uses `BEGIN IMMEDIATE` + `COMMIT`). Argon2id hashing and verification are async (WASM). These two facts force a discipline: async work must complete *before* entering `withTx`.

`acceptInvitation` and `login` both hash or verify passwords before calling `withTx`. The comment at the top of `composition.ts` documents this explicitly. It is not an optimization — it is a correctness constraint. An `await` inside a SQLite transaction would yield the event loop while holding the write lock. In a single-connection process this would deadlock; in a multi-connection process it would cause write contention.

The test for this is implicit in the rollback tests: `monkeyPatchHashToThrow` is applied *after* any async hashing, so the test exercises the in-transaction rollback path, not the pre-transaction async path.

---

## The meta-events

Two events in the log are deliberately self-referential:

- **`audit.viewed`** — committed by `GET /audit` after the query returns. Payload includes the filters and result count. Under 21 CFR Part 11, viewing a regulated record is itself a regulated act; the monitor's access to the log is part of the log.
- **`audit.exported`** — committed by `GET /audit/export.csv`. Payload includes row count and scope. The export itself is audited.

These events will appear in subsequent audit views, which will themselves emit `audit.viewed`. This is correct and intentional — the chain is append-only and self-documenting.

---

## Where to look next

If you want to understand something specific:

| Question | Where to look |
|---|---|
| What does every mutation do? | `composition.ts` — nine functions, each with a doc comment quoting the library spec |
| How is the hash chain constructed? | `domain/event_log.ts` — `appendEvent()` and `verifyChain()` |
| How does canonical JSON work? | `lib/canonical.ts` — 15 lines |
| How does the session cookie get validated? | `middleware/require_session.ts` |
| How does scope get enforced? | `middleware/require_permission.ts` + the `granted_scope` reads in `routes/audit.ts` and `routes/subjects.ts` |
| How does Argon2id get wired in? | `lib/password.ts` — the only file that imports `argontwo` |
| What does the full schema look like? | `migrations/0001_init.sql` |
| What events are emitted by each action? | `composition.ts` — each function carries an `Emits:` doc comment listing its events |
| Is this spec-to-code mapping inspectable? | Yes — every public function in `composition.ts` carries a doc comment quoting the library spec. Every domain file header quotes the relevant Grace Commons atom spec verbatim. |

---

## The constraint layers

This demo renders the top two layers of a five-layer constraint stack:

```
Structured English  →  semantic intent        [this demo]
TypeScript types    →  implementation shape   [this demo]
Alloy               →  relational validity    [first natural target: Permissions + Grants model]
TLA+                →  temporal validity      [first natural target: session + invitation lifecycle]
Coq / Lean          →  critical truth proofs  [first natural target: verifyChain tamper-evidence property]
```

The lower three layers are deliberate future scope. Their first targets are named so the question *"where would you take this if you wanted the guarantee provable rather than testable?"* has a concrete answer on the page.

---

*Grace Commons: the spec is canonical. The code is one render of it.*
