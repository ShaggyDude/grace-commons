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
