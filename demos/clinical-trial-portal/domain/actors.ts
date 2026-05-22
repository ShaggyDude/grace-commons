// domain/actors.ts
//
// Atom: Actor Identity
//
// Library spec (quoted from grace-commons/atoms/compliance/party-identity.md):
//   "Actor Identity models an internal actor's ability to sign actions with
//    credentials [...] An actor signs; a party is verified. The two atoms
//    model different obligations, carry different state machines, and compose
//    when the same natural person is both a verified external party and a
//    credentialed internal actor."
//
// Invariants:
//   - Every actor is bound to exactly one party (party_id is immutable)
//   - Actors are never deleted (regulatory permanence)
//   - Actors are created only via acceptInvitation composition function
//   - display_name is sourced from the bound party (join on read)

import type { DB } from "../lib/db.ts";

export interface Actor {
  id: number;
  party_id: number;
  display_name: string; // joined from parties table
  created_at: string;
}

/**
 * Find an actor by id. Returns null if not found.
 * JOINs parties to include display_name, matching the Ctx.actor shape.
 */
export function getById(db: DB, id: number): Actor | null {
  return (
    db
      .prepare(
        `SELECT a.id, a.party_id, a.created_at, p.display_name
         FROM actors a
         JOIN parties p ON p.id = a.party_id
         WHERE a.id = ?`,
      )
      .get<Actor>(id) ?? null
  );
}

/**
 * Find an actor by party_id. Returns null if not found.
 * Used to detect if an invitation has already been accepted.
 */
export function getByPartyId(db: DB, party_id: number): Actor | null {
  return (
    db
      .prepare(
        `SELECT a.id, a.party_id, a.created_at, p.display_name
         FROM actors a
         JOIN parties p ON p.id = a.party_id
         WHERE a.party_id = ?`,
      )
      .get<Actor>(party_id) ?? null
  );
}

/** Return all actors with their display names, oldest first. */
export function listAll(db: DB): Actor[] {
  return db
    .prepare(
      `SELECT a.id, a.party_id, a.created_at, p.display_name
       FROM actors a
       JOIN parties p ON p.id = a.party_id
       ORDER BY a.id ASC`,
    )
    .all<Actor>();
}

/**
 * Create a new actor bound to the given party.
 * Called only from composition.acceptInvitation — never directly from routes.
 */
export function create(db: DB, party_id: number): Actor {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO actors (party_id, created_at) VALUES (?, ?) RETURNING *`,
    )
    .get<{ id: number; party_id: number; created_at: string }>(party_id, now);
  if (!row) throw new Error("actors.create: insert returned no row");

  // Fetch back with the JOIN so the returned shape always includes display_name
  const actor = getById(db, row.id);
  if (!actor) throw new Error("actors.create: post-insert lookup failed");
  return actor;
}
