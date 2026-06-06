# Beacon (second render) — Five-Minute Tour

A guided walk through the lifecycle, and through the places where the *spec* —
not the stack — is doing the work. Read it next to the first render's
[`WALKTHROUGH.md`](../clinical-trial-portal/WALKTHROUGH.md); the story is the
same because the compositions are the same.

## The thesis, in one paragraph

The first render compiled five Grace Commons compositions onto Deno + Hono +
SQLite + HTMX. This one compiles the *same* compositions — same action codes,
same audit payloads, same hash-chain contract — onto Next.js + Postgres + React
Server Components. Almost no infrastructure code is shared. If both renders emit
the identical audit chain and uphold the identical invariants, the public specs,
not either codebase, were canonical. The only genuinely new code here is the
adapter that re-creates, explicitly, a guarantee SQLite gave the first render for
free (see [The global lock](#the-global-lock-the-one-new-surface)).

## Run it

```bash
npm install && npm run migrate && npm run seed && npm run dev
```

Open http://localhost:3000 and sign in as the PI (`anya@beacon.clinical` /
`demo-pi`).

## The lifecycle (click-through)

1. **Login (C13).** Sign in as the PI. `composition.login` verifies the Argon2/
   scrypt credential *before* opening the transaction, then emits
   `login.succeeded` and sets the opaque session cookie. A bad password emits an
   anonymous `login.failed` — the specific reason lives only in the audit log;
   the user sees a generic message.
2. **Invite a coordinator (C16, APA).** Go to **People & Permissions** → *Invite
   someone*. Submitting calls `composition.issueInvitation` → `invitation.issued`.
   SMTP is off by default, so the accept link is shown in-app for you to copy.
3. **Accept the invitation (C16).** Open the accept link in a private window and
   set a password. `composition.acceptInvitation` does it all in **one**
   transaction — creates the Actor + Credential + Session, marks the invitation
   accepted, logs the invitee in — emitting `invitation.accepted`,
   `actor.enrolled`, `credential.created`, `session.opened`.
4. **Grant permissions (APA).** Back as the PI, grant the new coordinator
   `enroll_subject` and `record_visit` (scope `all` or `own`). Each emits
   `grant.issued`. Revoking emits `grant.revoked`.
5. **Enroll a subject + record a visit.** As the coordinator, **Subjects** →
   *Enroll subject* (`subject.enrolled`), then open the subject and *Record
   visit* (`visit.recorded`). Subject codes are synthetic and sequential — no
   PII.
6. **Walk the audit trail (C1).** As the CRA (`jordan@beacon.clinical` /
   `demo-cra`), open **Audit Trail**. Every step above is there, attributed and
   time-ordered. Click **Verify chain** for the running verdict, **Full report**
   for the recompute page, **Export CSV** to pull the chain (with
   `prev_hash`/`this_hash`) out for an external verifier.

## What is "the seam"

Every mutation flows through `composition.ts` and nothing else. Open it: each
function takes a `Ctx`, wraps its body in `await withTx`, calls atom helpers on
the transaction, calls `appendEvent` for **every** state change in the same
transaction, and returns plain data. Atom files under `domain/` never emit
events, never start transactions, never call each other. That discipline is why
"the records alone" can reconstruct what happened, and why a forced failure
mid-function rolls back *both* the atom rows and the audit rows.

## The C14 gates (the regulated-access pattern)

Render 1 enforced C14 with two Hono middlewares. Next has no middleware chain, so
the gates are helpers called at the top of each protected handler:

```ts
const { ctx } = await currentUser();          // auth/current.ts — session → Ctx, or redirect(/login)
const granted = await permit(ctx, ["view_audit"]); // auth/permit.ts — grant + scope, or null
if (!granted) return <Forbidden codes={["view_audit"]} />;
// granted.scope ('all' | 'own') flows downstream
```

Look at `app/audit/page.tsx` and `app/subjects/page.tsx`: the `scope` from
`permit` is what makes `own` show only your rows and `all` show everyone's. The
authorization *semantics* are identical to render 1 — only the call mechanism
moved from `.use()` to a function call.

## The hash chain

`domain/event_log.ts` is the C1 substrate. `this_hash = sha256hex(canonicalize({
id, occurred_at, actor_id, session_id, action, target_kind, target_id,
payload_json, prev_hash }))`, with `prev_hash` the previous row's `this_hash`
(`''` for row #1). `lib/canonical.ts` and `lib/hash.ts` are **byte-identical** to
render 1 — that is the load-bearing portability claim. Because the same bytes go
in, a chain produced by either render verifies under either render's
`verifyChain`.

One porting hazard the swap exposed and the code makes explicit: SQLite returned
integer ids as JS numbers; Postgres returns BIGINT as strings. The hashed payload
must use the *same* types on append and verify, so every id is coerced with
`num()` before hashing (`domain/event_log.ts`). The SQLite engine hid this; here
it is named.

## The meta-events

Under Part 11, *reading* and *exporting* the regulated record are themselves
regulated acts. `/audit` emits `audit.viewed` (after the read, so the new row is
not in the page that triggered it) and `/audit/export.csv` emits `audit.exported`.
These are appended at the route level — the same sanctioned seam render 1 uses —
not through `composition.ts`, which is reserved for the five business mutations.

## The async boundary

Render 1's `withTx` was synchronous (SQLite). Here the driver is async, so
`withTx` is async too — and the "no async inside withTx" rule relaxes. But the
ordering is preserved deliberately: password hashing (the only slow step) runs
**before** `withTx`, so the global lock is held only for the sub-millisecond atom
+ event writes.

## The global lock (the one new surface)

`event_log` is a single global chain: every mutation must be totally ordered
against every other, or two concurrent appends fork it. SQLite's single-writer
lock gave render 1 that order for free. Postgres MVCC does not — so `withTx`
takes `SELECT pg_advisory_xact_lock(7423001)` as its first statement
(`lib/db.ts`). That one line *is* the SQLite writer lock, made explicit and
spec-traceable. It is the only genuinely new code the swap forced into the open —
conflict-protocol case 3 (the English was under-specified about ordering because
one stack hid it) turned into a named render-layer obligation.

## Where to look next

- `composition.ts` — the only mutation surface; the five compositions.
- `auth/current.ts` + `auth/permit.ts` — the C14 gates.
- `app/audit/*` — the audit surface (`page.tsx`, `verify/page.tsx`, `export.csv/route.ts`).
- `lib/db.ts` — the transaction primitive + the advisory lock.
- [`../clinical-trial-portal`](../clinical-trial-portal/) — the first render, to diff against.
- [`CORNERS.md`](./CORNERS.md) — every place this render is *forced* to differ.
