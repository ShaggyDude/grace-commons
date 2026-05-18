import { Hono } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { listOrphans } from "../domain/orphan_log.ts";
import { listActors } from "../domain/actor.ts";
import { OrphanLog } from "../views/orphan_log.tsx";

const orphans = new Hono<{ Variables: AppVariables }>();

orphans.get("/orphans", (c) => {
  const actor = c.get("actor");
  const actors = listActors();
  const entries = listOrphans();
  return c.html(<OrphanLog orphans={entries} currentActor={actor} actors={actors} />);
});

export { orphans };
