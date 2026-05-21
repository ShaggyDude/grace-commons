// Auth routes — login and logout.
//
// Implements the Login composition surface (C13):
//   GET  /login  — serve login form (redirect to / if already authenticated)
//   POST /login  — verify_login → issue_session → set cookie → redirect /
//   POST /logout — revoke_session → clear cookie → redirect /login
//
// The credential field on the login form (principal_ref + password) resolves
// against the Credential atom login surface (credential_store.ts), which is
// distinct from the Actor Identity attest key (actor.credential_secret).
// See CORNERS.md §Cross-atom identity surface aliasing.

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppVariables } from "../middleware/current_actor.ts";
import { verify_login } from "../domain/credential_store.ts";
import { issue_session, revoke_session } from "../domain/session_store.ts";
import { LoginPage } from "../views/login_page.tsx";

const auth = new Hono<{ Variables: AppVariables }>();

// GET /login — serve login form; bounce authenticated users to /
auth.get("/login", (c) => {
  const actor = c.get("actor");
  if (actor) return c.redirect("/");
  return c.html(<LoginPage />);
});

// POST /login — Credential.verify → Session.issue → set session_token cookie
auth.post("/login", async (c) => {
  const form = await c.req.formData();
  const principal_ref = form.get("principal_ref")?.toString().trim() ?? "";
  const password = form.get("password")?.toString() ?? "";

  if (!principal_ref || !password) {
    return c.html(<LoginPage error="Username and password are required." />, 400);
  }

  const result = await verify_login(principal_ref, password);

  if (result !== "verified") {
    const reason =
      result === "not-known" ? "Unknown username." : "Incorrect password.";
    return c.html(<LoginPage error={reason} />, 401);
  }

  const session_id = issue_session(principal_ref);
  setCookie(c, "session_token", session_id, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 8 * 60 * 60, // 8 hours — matches SESSION_HOURS in session_store.ts
  });

  return c.redirect("/");
});

// POST /logout — Session.revoke → clear cookie → redirect /login
auth.post("/logout", (c) => {
  const token = getCookie(c, "session_token");
  if (token) revoke_session(token);
  deleteCookie(c, "session_token", { path: "/" });
  return c.redirect("/login");
});

export { auth };
