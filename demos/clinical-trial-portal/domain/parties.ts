// domain/parties.ts
//
// Atom: Party Identity
//
// Library spec (quoted from grace-commons/atoms/compliance/party-identity.md):
//   "Party Identity is the specification of a persistent, verifiable identity
//    record for an external party — a customer, patient, counterparty, or
//    beneficial owner. It answers the foundational compliance question that
//    every regulated system must answer before engaging in regulated activity:
//    who is this party, and has their identity been verified? [...] Party
//    Identity is distinct from Actor Identity (which models internal actors
//    who authorize system actions with cryptographic credentials). A party is
//    verified; an actor signs."
//
// Invariants:
//   - email is unique (enforced by schema UNIQUE constraint)
//   - display_name is non-empty (enforced by application-level check)
//   - rows are never deleted; party identity is permanent
//   - Party creation is a precondition for Actor creation (via invitation flow)

import type { DB } from "../lib/db.ts";

export interface Party {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

/** Find a party by email address. Returns null if not found. */
export function getByEmail(db: DB, email: string): Party | null {
  return (
    db.prepare("SELECT * FROM parties WHERE email = ?").get<Party>(email) ??
    null
  );
}

/** Find a party by id. Returns null if not found. */
export function getById(db: DB, id: number): Party | null {
  return (
    db.prepare("SELECT * FROM parties WHERE id = ?").get<Party>(id) ?? null
  );
}

/** Return all parties, oldest first. */
export function listAll(db: DB): Party[] {
  return db.prepare("SELECT * FROM parties ORDER BY id ASC").all<Party>();
}

/**
 * Create a new party record.
 * Throws if email or display_name is empty, or if the email already exists.
 */
export function create(
  db: DB,
  email: string,
  display_name: string,
): Party {
  if (!email || !display_name) {
    throw new Error("parties.create: email and display_name required");
  }
  const now = new Date().toISOString();
  const row = db
    .prepare(
      "INSERT INTO parties (email, display_name, created_at) VALUES (?, ?, ?) RETURNING *",
    )
    .get<Party>(email, display_name, now);
  if (!row) throw new Error("parties.create: insert returned no row");
  return row;
}
