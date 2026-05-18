// Actor lookup — thin read layer over the actor table.
// No writes: actors are seeded once and never updated in the demo.

import { db } from "../db/client.ts";

export type Actor = {
  actor_ref: string;
  kind: "human" | "application";
  display_name: string;
  credential_public: string;
  credential_secret: string;
  registered_at: string;
};

const stmtGet = db.prepare("SELECT * FROM actor WHERE actor_ref = ?");
const stmtList = db.prepare(
  "SELECT * FROM actor ORDER BY kind DESC, display_name ASC",
);

/** Returns the actor with the given ref, or undefined if not found. */
export function getActor(actor_ref: string): Actor | undefined {
  return stmtGet.get(actor_ref) as Actor | undefined;
}

/** Returns all actors, application actors first then humans alphabetically. */
export function listActors(): Actor[] {
  return stmtList.all() as Actor[];
}
