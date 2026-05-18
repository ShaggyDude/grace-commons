// Reads the actor_ref cookie and resolves it to an Actor row.
// Sets ctx.var.actor for use by all downstream handlers.
//
// If no cookie is present, falls back to DEFAULT_ACTOR_REF so the
// demo is usable on first boot without a login flow.
// If the cookie value doesn't match a known actor, treats as no actor.

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getActor, type Actor } from "../domain/actor.ts";
import { DEFAULT_ACTOR_REF } from "../config.ts";

export type AppVariables = {
  actor: Actor | null;
};

export async function currentActorMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<void> {
  const cookieRef = getCookie(c, "actor_ref");
  const ref = cookieRef ?? DEFAULT_ACTOR_REF;
  const actor = getActor(ref) ?? null;
  c.set("actor", actor);
  await next();
}
