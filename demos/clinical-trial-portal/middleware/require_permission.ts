// middleware/require_permission.ts
//
// C14: Session-Gated Authorization — permission check middleware.
//
// Applied after requireSession. Checks for an unrevoked grant covering any
// of the named permission codes for the current actor. Attaches the matching
// grant's scope ('all' | 'own') to c for downstream filtering (e.g., the
// audit route uses scope to show all events vs. only the actor's own events).
// Returns 403 if no matching grant exists.

import type { MiddlewareHandler } from "hono";
import * as grants from "../domain/grants.ts";
import type { AppEnv } from "../lib/env.ts";

export function requirePermission(
  ...codes: string[]
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ctx = c.get("ctx");
    const grant = grants.findActiveFor(ctx.db, ctx.actor!.id, codes);
    if (!grant) {
      return c.html(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">
         <title>403 Forbidden</title></head>
         <body style="font-family:system-ui;max-width:480px;margin:4rem auto;padding:0 1rem">
           <h1>Access denied</h1>
           <p>This page requires the <strong>${codes.join(" or ")}</strong> permission.</p>
           <p><a href="/dashboard">← Back to dashboard</a></p>
         </body></html>`,
        403,
      );
    }
    c.set("granted_scope", grant.scope);
    await next();
  };
}
