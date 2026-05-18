// POST /act-as — sets the actor_ref cookie and redirects back to referrer.
// This is the demo's identity switcher; not a real auth system.

import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { getActor } from "../domain/actor.ts";
import type { AppVariables } from "../middleware/current_actor.ts";

const auth = new Hono<{ Variables: AppVariables }>();

auth.post("/act-as", async (c) => {
  const body = await c.req.parseBody();
  const actor_ref = String(body["actor_ref"] ?? "").trim();

  // Validate: must be a known actor
  const actor = actor_ref ? getActor(actor_ref) : null;
  if (!actor) {
    return c.text("Unknown actor", 400);
  }

  setCookie(c, "actor_ref", actor.actor_ref, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });

  const referrer = c.req.header("Referer") ?? "/";
  return c.redirect(referrer, 302);
});

export { auth };
