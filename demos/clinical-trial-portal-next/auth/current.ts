// auth/current.ts — C14 Session-Gated Authorization, part 1 (replaces render 1's
// require_session middleware).
//
// Next's App Router has no Hono-style middleware chain for per-route gates, so
// the equivalent is a helper called at the TOP of each protected Server
// Component / Server Action (BUILD_PLAN §7.4). This module resolves the session
// cookie → a fully-formed Ctx (the same Ctx that composition.ts consumes), and
// redirects to /login on any failure — exactly the require_session contract.
//
// READS ONLY. It never mutates; it never touches composition.ts. The actor on
// the returned Ctx carries display_name (joined from the Party) so the chrome and
// audit payloads can show a human name without a second lookup.
import { redirect } from "next/navigation";
import { db, type Ctx } from "../lib/db.ts";
import { readSessionToken } from "../lib/session.ts";
import * as sessions from "../domain/sessions.ts";
import * as actors from "../domain/actors.ts";
import * as parties from "../domain/parties.ts";

export interface CurrentUser {
  /** The Ctx handed to composition.ts; ctx.actor.display_name is populated. */
  ctx: Ctx;
  /** The backing Party (email + display name) for the top bar / greetings. */
  party: parties.Party;
}

/** Load the current user from the session cookie, or null if unauthenticated. */
async function load(): Promise<CurrentUser | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const session = await sessions.getActive(db, token);
  if (!session) return null;

  const actor = await actors.getById(db, session.actor_id);
  if (!actor) return null;

  const party = await parties.getById(db, actor.party_id);
  if (!party) return null;

  const ctx: Ctx = {
    actor: { id: actor.id, party_id: actor.party_id, display_name: party.display_name },
    session: { id: session.id, actor_id: session.actor_id, token: session.token },
  };
  return { ctx, party };
}

/** Require a valid session; redirect to /login otherwise. Returns the Ctx. */
export async function currentCtx(): Promise<Ctx> {
  const user = await load();
  if (!user) redirect("/login");
  return user.ctx;
}

/** Require a valid session; redirect to /login otherwise. Returns Ctx + Party. */
export async function currentUser(): Promise<CurrentUser> {
  const user = await load();
  if (!user) redirect("/login");
  return user;
}

/** Non-redirecting variant: returns the current user, or null when signed out.
 *  Used by surfaces that render either way (the landing page, the top bar). */
export async function optionalUser(): Promise<CurrentUser | null> {
  return load();
}
