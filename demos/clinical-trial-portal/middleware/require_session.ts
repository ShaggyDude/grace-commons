// middleware/require_session.ts
//
// C14: Session-Gated Authorization — session lookup middleware
// SPEC: <atom or composition name> — to be quoted from library in Phase 1/2
//
// Usage: Applied to all authenticated routes. Looks up session by cookie token,
// checks it is not expired or revoked, and attaches ctx.actor.
// Unauthenticated → redirect to /login.

import type { Context, Next } from "hono";

// TODO: Phase 3 — Implement:
//   - Look up session from cookie
//   - Verify not expired (expires_at > now)
//   - Verify not revoked (revoked_at is null)
//   - Load associated actor
//   - Attach ctx.actor
//   - Redirect to /login on failure
