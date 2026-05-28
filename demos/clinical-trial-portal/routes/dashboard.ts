// routes/dashboard.ts — GET /dashboard
//
// Requires session. Tiles are rendered conditionally by permission code.
// View component called as plain function (no JSX syntax in .ts file).

import { Hono } from "hono";
import type { AppEnv } from "../lib/env.ts";
import { requireSession } from "../middleware/require_session.ts";
import * as grants from "../domain/grants.ts";
import { DashboardPage } from "../views/dashboard.tsx";

export const dashboardRouter = new Hono<AppEnv>();

dashboardRouter.get("/dashboard", requireSession, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;

  const allGrants = grants.listForActor(db, actor.id);
  const permissionCodes = allGrants
    .filter((g) => g.revoked_at === null)
    .map((g) => g.permission_code);

  return c.html(DashboardPage({ actor, permissions: permissionCodes }) as string);
});
