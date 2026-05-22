// lib/env.ts
//
// Shared Hono environment type — threaded through app, sub-routers, and
// middleware so c.get("db") / c.get("ctx") are properly typed everywhere.

import type { Ctx, DB } from "./db.ts";

export type AppEnv = {
  Variables: {
    /** Opened once per request by the db middleware in main.ts. */
    db: DB;
    /** Set by requireSession after validating the session cookie. */
    ctx: Ctx;
    /**
     * Set by requirePermission to the scope of the matching grant.
     * Optional — only present on routes guarded by requirePermission.
     */
    granted_scope?: "all" | "own";
  };
};
