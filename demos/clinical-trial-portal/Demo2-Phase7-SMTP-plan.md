# Implementation Plan: SMTP Invitation Delivery (Phase 7 Stretch)

## Architectural placement

The SMTP send must live outside `composition.ts`. The composition layer is the canonical mutation surface, runs synchronously inside `withTx`, and represents what the Grace Commons spec promises — durable state changes. Email delivery is a best-effort I/O concern that has no business inside a transactional boundary: it's slow, it can fail, and a failed send must never undo a successfully-issued invitation. So `composition.issueInvitation()` keeps its current signature and behavior unchanged. The route handler (`POST /invitations`) is the seam: after `issueInvitation()` returns, the handler is in async user-land, outside `withTx`, holding the freshly-returned `Invitation` with its raw token — exactly the place where an email side-effect belongs.

Between the route handler and the SMTP transport, introduce a thin `lib/mailer.ts` module rather than calling nodemailer directly from the handler. The justification is single-responsibility: the "is SMTP configured?", "what does the message body look like?", and "what happens on transport failure?" decisions all want to live in one place so the route handler stays a coordinator. If a second email type ever appears (password reset, role change notification), the second handler shouldn't have to relearn the configuration-detection and degradation logic. Keeping it in `lib/mailer.ts` also makes the no-config fallback path the mailer's own contract, not something every caller has to remember to implement.

## Mailer module surface

`lib/mailer.ts` exports a single async function whose signature is shaped around the route handler's needs, not the transport's. Approximately:

```
sendInvitationEmail(params: {
  to: string;
  displayName?: string;
  acceptUrl: string;
}): Promise<DeliveryResult>
```

Where `DeliveryResult` is a discriminated union with three cases: `{ status: "sent" }`, `{ status: "skipped"; reason: "smtp_not_configured" }`, and `{ status: "failed"; error: string }`. The function never throws; all transport errors are caught and converted to the `failed` variant. This shape lets the route handler decide what to show the PI without try/catch ceremony, and it makes the "no SMTP configured" path a first-class, non-exceptional outcome — which matches the constraint that the demo must run cleanly with zero env config.

Internally, the module reads SMTP env vars once at module load (or lazily on first call — either is fine; lazy is slightly safer for testing). If `SMTP_HOST` is absent, the module short-circuits and returns `skipped` immediately, logging the accept URL to stdout with a clear "[mailer] SMTP not configured; invite link: …" line so a developer running the demo locally can copy it from the terminal. If `SMTP_HOST` is set, the module constructs a nodemailer transporter and calls `sendMail` with a short connection timeout (5 seconds is reasonable) so a misconfigured SMTP server can't hang the HTTP request indefinitely.

## Library choice: nodemailer

I recommend `npm:nodemailer`. The codebase already uses npm: imports (`npm:better-sqlite3` and likely `npm:hono`), so this is consistent with the established interop pattern. Nodemailer handles STARTTLS, SMTP AUTH, connection pooling, MIME encoding, and HTML+text alternative bodies without us writing any of it; for a demo we want zero ceremony around the transport. The Deno std library does not offer a high-level SMTP client (`@std/net` is socket-level), and a JSR-native SMTP client would either be feature-thin or pull in similar volume of dependency. The cost of writing our own minimal SMTP client just to avoid one npm dep isn't worth it for a stretch goal, and it would expand the security surface in a place where nodemailer is already well-audited.

## BASE_URL handling

`BASE_URL` becomes an optional env var with a hardcoded fallback to `http://localhost:8000` (substitute whichever port `scripts/start.ts` actually listens on; verify in implementation). Source it in `lib/env.ts` by adding a `baseUrl: string` field to `AppEnv`, populated in the env loader with `Deno.env.get("BASE_URL") ?? "http://localhost:<port>"`. Inject it through the existing `AppEnv` plumbing the route handler already receives. Two reasons for env-var-with-fallback over deriving from the `Host` request header: first, accept-links sent by email need to be absolute and stable, not dependent on which interface the PI happened to hit; second, the fallback keeps the constraint that `deno task start` works with no configuration. The route handler then constructs `${env.baseUrl}/invitations/accept/${invitation.token}` and passes it to the mailer.

## Route handler changes

In `routes/people.ts`, the `POST /invitations` handler stops discarding the returned `Invitation`. After the call to `composition.issueInvitation()` succeeds, it builds the accept URL, calls `await mailer.sendInvitationEmail(...)`, and switches the flash message on the returned `DeliveryResult`. On `sent`, flash reads "Invitation emailed to <email>." On `skipped`, flash reads something like "Invitation created. SMTP not configured — share this link: <acceptUrl>" — the link is surfaced directly in the UI so the demo is functional without email. On `failed`, flash reads "Invitation created, but email delivery failed. Share this link manually: <acceptUrl>" so the PI can still complete the workflow. The handler should also log the failure case to stderr with the error detail for the developer.

Flash messages that need to embed a URL will need to be HTML-rendered rather than plain text, or the link needs to be wrapped in a separate UI element on the people page. The implementer should check how flashes are currently rendered (likely plain-text via the `flash` query param) and either escape the URL for safe embedding or extend the flash mechanism to carry a structured payload. The simplest path is to render the accept URL as a separate copyable block on `/people` when present, keyed off a second query param like `inviteLink`, leaving the existing `flash` plain-text.

## Graceful degradation, restated

The behavior matrix the PI experiences: with no `SMTP_HOST`, the demo runs out of the box, the invite link appears on screen and in the server log, and the demo is fully functional via copy-paste — identical-in-spirit to the current behavior but more deliberately surfaced. With `SMTP_HOST` set and working, the link is emailed and the PI sees a confirmation. With `SMTP_HOST` set but broken, the demo doesn't break — the invitation row exists, the link is shown on screen as a fallback, and the failure is logged for the developer to diagnose. Crucially in all three paths, the durable invitation record exists in SQLite the moment `withTx` commits; nothing about email affects that.

## Env vars and .env.example

The new env vars are `BASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `SMTP_SECURE`. All are optional; if `SMTP_HOST` is unset, none of the others are read. Reasonable defaults inside the code: `SMTP_PORT=587`, `SMTP_SECURE=false` (use STARTTLS), `SMTP_FROM="Beacon <no-reply@beacon.local>"`.

`.env.example` should be a new file at `demos/clinical-trial-portal/.env.example` with each variable, a comment describing it, and a non-secret example value. It should explicitly state at the top that the demo runs with no `.env` at all, and that copying to `.env` is only needed to enable real email delivery. No real credentials in the file. `.gitignore` should be checked to confirm `.env` (not `.env.example`) is ignored; if it isn't, add it.

## Tests

Skip formal test coverage for this stretch. Justification: the mailer module is thin and its branches are easy to verify by manual smoke test — start the app with no env, issue an invitation, confirm the link surfaces; start with a local SMTP catcher like maildev or Mailtrap, issue an invitation, confirm the email arrives. The cost of mocking nodemailer's transport and threading it through the module for one demo-grade feature exceeds the value. If the implementer finds the codebase already has a test harness with a clear mailer-test pattern, a single test of the `skipped` path (assert no transport is constructed when `SMTP_HOST` is absent) would be cheap and worth adding, but it's not required.

## Schema and migration

None. The `invitations` table already stores the token; the mailer reads from the returned `Invitation` object in memory and never touches the database.

---

## Files to create or modify, in implementation order

First, create `demos/clinical-trial-portal/.env.example` documenting all new env vars with safe example values. Second, modify `demos/clinical-trial-portal/lib/env.ts` to extend `AppEnv` with a `baseUrl` field (and optionally surface SMTP config there too, though reading directly from `Deno.env` inside the mailer is also acceptable). Third, modify `demos/clinical-trial-portal/scripts/start.ts` if needed to populate the new `baseUrl` field during env load. Fourth, create `demos/clinical-trial-portal/lib/mailer.ts` exporting `sendInvitationEmail` with the `DeliveryResult` contract described above, using `npm:nodemailer`. Fifth, modify `demos/clinical-trial-portal/routes/people.ts` to consume the returned `Invitation`, call the mailer, and branch the flash/redirect on the result. Sixth, verify `.gitignore` covers `.env`. `composition.ts` is not touched.
