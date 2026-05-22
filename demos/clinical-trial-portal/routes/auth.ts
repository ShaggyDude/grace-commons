// routes/auth.ts — GET /login, POST /login, GET /logout
//
// Auth routes do not go through requireSession. They read c.get("db")
// from the global db middleware in main.ts.
//
// View components are called as plain functions (no JSX) so this file
// can remain a .ts file — JSX syntax is only needed in the .tsx view files.

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "../lib/env.ts";
import * as sessions from "../domain/sessions.ts";
import * as composition from "../composition.ts";
import { LoginPage } from "../views/login.tsx";

const SESSION_COOKIE = "session";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
} as const;

export const authRouter = new Hono<AppEnv>();

authRouter.get("/login", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    return c.redirect("/dashboard");
  }
  return c.html(LoginPage({}));
});

authRouter.post("/login", async (c) => {
  const form = await c.req.formData();
  const email = (form.get("email") as string | null)?.trim() ?? "";
  const password = (form.get("password") as string | null) ?? "";

  if (!email || !password) {
    return c.html(LoginPage({ error: "Email and password are required." }), 400);
  }

  const db = c.get("db");
  const ctx = { db, actor: null, session: null };

  const result = await composition.login(ctx, { email, password });
  if (!result.ok) {
    return c.html(LoginPage({ error: "Invalid email or password." }), 401);
  }

  setCookie(c, SESSION_COOKIE, result.session.token, {
    ...COOKIE_OPTS,
    expires: new Date(result.session.expires_at),
  });
  return c.redirect("/dashboard");
});

authRouter.get("/logout", (c) => {
  const db = c.get("db");
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    try {
      sessions.revokeByToken(db, token);
    } catch {
      // Best-effort revocation — clear cookie regardless
    }
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/");
});
