// Grant routes — issue, list, detail, revoke.
// All mutations go through composition.ts (never direct DB writes).

import { Hono } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { listGrants } from "../domain/grant.ts";
import { issue_grant, revoke_grant, verify_grant_attribution } from "../domain/composition.ts";
import { listActors } from "../domain/actor.ts";
import { GrantList } from "../views/grant_list.tsx";
import { GrantDetail } from "../views/grant_detail.tsx";
import { NewGrant } from "../views/new_grant.tsx";

const grants = new Hono<{ Variables: AppVariables }>();

// GET / — grant list
grants.get("/", (c) => {
  const actor = c.get("actor");
  const actors = listActors();
  const all = listGrants();
  return c.html(<GrantList grants={all} currentActor={actor} actors={actors} />);
});

// GET /grants/new — issue form
grants.get("/grants/new", (c) => {
  const actor = c.get("actor");
  const actors = listActors();
  return c.html(<NewGrant currentActor={actor} actors={actors} />);
});

// POST /grants — issue grant
grants.post("/grants", async (c) => {
  const actor = c.get("actor");
  if (!actor) return c.redirect("/");

  const form = await c.req.formData();
  const subject_ref = form.get("subject_ref")?.toString().trim() ?? "";
  const action_scope = form.get("action_scope")?.toString().trim() ?? "";
  const credential = form.get("credential")?.toString() ?? "";

  const result = issue_grant(subject_ref, action_scope, actor.actor_ref, credential);

  if ("err" in result) {
    const actors = listActors();
    return c.html(
      <NewGrant currentActor={actor} actors={actors} error={result.err} />,
      400,
    );
  }

  return c.redirect(`/grants/${result.ok.grant_id}`);
});

// GET /grants/:id — grant detail with attribution
grants.get("/grants/:id", (c) => {
  const actor = c.get("actor");
  const actors = listActors();
  const grant_id = c.req.param("id");
  const result = verify_grant_attribution(grant_id);
  return c.html(<GrantDetail result={result} currentActor={actor} actors={actors} />);
});

// POST /grants/:id/revoke — revoke a grant
grants.post("/grants/:id/revoke", async (c) => {
  const actor = c.get("actor");
  if (!actor) return c.redirect("/");

  const grant_id = c.req.param("id");
  const form = await c.req.formData();
  const credential = form.get("credential")?.toString() ?? "";

  revoke_grant(grant_id, actor.actor_ref, credential);
  // On error we just redirect back — detail page will show current state
  return c.redirect(`/grants/${grant_id}`);
});

export { grants };
