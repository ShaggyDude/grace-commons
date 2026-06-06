// auth/permit.ts — C14 Session-Gated Authorization, part 2 (replaces render 1's
// require_permission middleware).
//
// The authorization SEMANTICS are unchanged from render 1 / Demo2-plan §4/§9:
//   • a route is gated by one or more permission CODES;
//   • the actor must hold an unrevoked grant for ANY of them (absence = denial);
//   • the matching grant's scope ('all' | 'own') flows downstream — the audit and
//     subjects surfaces use it to show all rows vs. only the actor's own.
// Only the CALL MECHANISM differs: a helper at the top of each handler instead of
// a Hono `.use()` chain (BUILD_PLAN §7.4).
//
// READS ONLY (the `query` read seam + grants.findActiveFor). It never mutates and
// never imports composition.ts — the only mutation surface stays composition.ts.
import { db, query, type Ctx } from "../lib/db.ts";
import * as grants from "../domain/grants.ts";

export type Scope = "all" | "own";

export interface ActiveGrant {
  id: number;
  code: string;
  label: string;
  scope: Scope;
  grantor_actor_id: number;
  grantee_actor_id: number;
  issued_at: string;
}

/**
 * Pure C14 check. Returns the matching grant's scope, or null on denial.
 * Non-throwing so a Server Component can render an inline 403 surface (the
 * <Forbidden/> component) at the same URL.
 */
export async function permit(ctx: Ctx, codes: string[]): Promise<{ scope: Scope } | null> {
  if (!ctx.actor) return null;
  return grants.findActiveFor(db, ctx.actor.id, codes);
}

/** Thrown by requirePermission when a Server Action caller lacks the grant. */
export class ForbiddenError extends Error {
  readonly codes: string[];
  constructor(codes: string[]) {
    super(`forbidden: requires ${codes.join(" or ")}`);
    this.name = "ForbiddenError";
    this.codes = codes;
  }
}

/**
 * Throwing C14 gate for Server Actions: returns the scope, or throws
 * ForbiddenError naming the missing permission. (Defense in depth — the page
 * that renders a mutation form is already gated, but the action re-checks.)
 */
export async function requirePermission(ctx: Ctx, codes: string[]): Promise<{ scope: Scope }> {
  const granted = await permit(ctx, codes);
  if (!granted) throw new ForbiddenError(codes);
  return granted;
}

/** Read helper: every active grant (joined to its permission code/label) an actor holds. */
export async function activeGrantsFor(actorId: number): Promise<ActiveGrant[]> {
  return query<ActiveGrant>(
    `SELECT g.id, g.scope, g.grantee_actor_id, g.grantor_actor_id, g.issued_at,
            p.code, p.label
       FROM grants g
       JOIN permissions p ON p.id = g.permission_id
      WHERE g.grantee_actor_id = $1 AND g.revoked_at IS NULL
      ORDER BY g.id ASC`,
    [actorId],
  );
}

/** Read helper: the active permission CODES an actor holds (dashboard tiles, nav gating). */
export async function activeCodesFor(actorId: number): Promise<string[]> {
  const granted = await activeGrantsFor(actorId);
  return granted.map((g) => g.code);
}
