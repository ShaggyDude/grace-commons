// middleware/require_session.ts
//
// C14: Session-Gated Authorization — session lookup middleware.
//
// Reads the session token from the HttpOnly "session" cookie, validates it
// against the sessions table (not expired, not revoked), loads the associated
// actor, and attaches a fully-formed Ctx to the Hono context for downstream
// handlers. Redirects to /login on any failure.

import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import * as sessions from "../domain/sessions.ts";
import * as actors from "../domain/actors.ts";
import type { AppEnv } from "../lib/env.ts";

export const SESSION_COOKIE = "session";

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = c.get("db");
  const token = getCookie(c, SESSION_COOKIE);

  if (!token) return c.redirect("/login");

  const session = sessions.getActive(db, token);
  if (!session) return c.redirect("/login");

  const actor = actors.getById(db, session.actor_id);
  if (!actor) return c.redirect("/login");

  c.set("ctx", { db, actor, session });
  await next();
};
