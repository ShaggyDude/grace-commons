// Actor switcher — sets the actor_ref cookie then redirects back.
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { getActor } from "../domain/actor.ts";
import type { AppVariables } from "../middleware/current_actor.ts";

const auth = new Hono<{ Variables: AppVariables }>();

auth.post("/act-as", async (c) => {
  const form = await c.req.formData();
  const ref = form.get("actor_ref")?.toString() ?? "";
  if (ref && getActor(ref)) {
    setCookie(c, "actor_ref", ref, { path: "/", httpOnly: true });
  }
  return c.redirect(c.req.header("referer") ?? "/");
});

export { auth };
