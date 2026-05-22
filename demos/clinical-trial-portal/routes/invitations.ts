// routes/invitations.ts — invitation acceptance flow
//
// No session required. Reads c.get("db") from the global db middleware.
// View components called as plain functions (no JSX syntax in .ts file).

import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { AppEnv } from "../lib/env.ts";
import * as invitations from "../domain/invitations.ts";
import * as parties from "../domain/parties.ts";
import * as composition from "../composition.ts";
import { AcceptInvitationPage } from "../views/accept_invitation.tsx";

const SESSION_COOKIE = "session";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
} as const;

export const invitationsRouter = new Hono<AppEnv>();

invitationsRouter.get("/invitations/accept/:token", (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const inv = invitations.getByToken(db, token);

  if (!inv) {
    return c.html(
      AcceptInvitationPage({
        email: "unknown",
        intended_role: "unknown",
        token,
        error: "This invitation link is invalid.",
      }),
      404,
    );
  }
  if (inv.accepted_at || inv.revoked_at) {
    return c.html(
      AcceptInvitationPage({
        email: "—",
        intended_role: inv.intended_role,
        token,
        error: "This invitation has already been used or revoked.",
      }),
      410,
    );
  }
  if (inv.expires_at <= new Date().toISOString()) {
    return c.html(
      AcceptInvitationPage({
        email: "—",
        intended_role: inv.intended_role,
        token,
        error: "This invitation has expired. Please ask for a new one.",
      }),
      410,
    );
  }

  const party = parties.getById(db, inv.party_id);
  return c.html(
    AcceptInvitationPage({
      email: party?.email ?? "—",
      intended_role: inv.intended_role,
      token,
    }),
  );
});

invitationsRouter.post("/invitations/accept/:token", async (c) => {
  const token = c.req.param("token");
  const form = await c.req.formData();
  const password = (form.get("password") as string | null) ?? "";
  const confirm = (form.get("confirm") as string | null) ?? "";

  const db = c.get("db");
  const inv = invitations.getByToken(db, token);
  const party = inv ? parties.getById(db, inv.party_id) : null;
  const email = party?.email ?? "—";
  const intended_role = inv?.intended_role ?? "—";

  const renderError = (msg: string) =>
    c.html(
      AcceptInvitationPage({ email, intended_role, token, error: msg }),
      400,
    );

  if (!password) return renderError("Password is required.");
  if (password.length < 8) return renderError("Password must be at least 8 characters.");
  if (password !== confirm) return renderError("Passwords do not match.");

  const ctx = { db, actor: null, session: null };
  try {
    const { session } = await composition.acceptInvitation(ctx, { token, password });
    setCookie(c, SESSION_COOKIE, session.token, {
      ...COOKIE_OPTS,
      expires: new Date(session.expires_at),
    });
    return c.redirect("/dashboard");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return renderError(msg);
  }
});
