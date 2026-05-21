// Session-gated actor middleware — Session-Gated Authorization (C14).
//
// Reads the session_token cookie, validates it against the Session atom store,
// and sets c.set("actor", ...) for every downstream handler.
//
// Outcome matrix:
//   session_token absent  → actor null
//   validate_session → 'not-known' | 'expired' | 'revoked'  → actor null
//   validate_session → ValidSession  → getActor(principal_ref) → actor (or null if ref not found)
//
// The auth guard in app.ts redirects to /login when actor is null for all
// routes except /login itself.

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getActor, type Actor } from "../domain/actor.ts";
import { validate_session } from "../domain/session_store.ts";

export type AppVariables = {
  actor: Actor | null;
};

export async function currentActorMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<void> {
  const token = getCookie(c, "session_token");
  let actor: Actor | null = null;

  if (token) {
    const result = validate_session(token);
    if (typeof result === "object") {
      // ValidSession — principal_ref is safe to use (spec §Session.validate)
      actor = getActor(result.principal_ref) ?? null;
    }
    // 'expired' | 'revoked' | 'not-known' → actor stays null; guard will redirect
  }

  c.set("actor", actor);
  await next();
}
