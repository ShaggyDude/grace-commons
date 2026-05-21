// Credential atom — login credential store.
//
// Implements the login surface of the Credential atom, separate from the
// Actor Identity attest key (actor.credential_secret). The two surfaces
// share the same principal_ref / actor_ref but are managed independently.
// See CORNERS.md §Cross-atom identity surface aliasing.
//
// Operations:
//   register_login(principal_ref, password) → credential_id
//   verify_login(principal_ref, password) → 'verified' | 'failed-verification' | 'not-known'
//
// Hash function: SHA-256 with a per-credential random salt (stored alongside
// the hash). Demo simplification — not PBKDF2. The separation of credential
// surfaces is the structural point; hash strength is a deployment concern.

import { ulid } from "@std/ulid";
import { db } from "../db/client.ts";

// ---------------------------------------------------------------------------
// Internal — derive the stored verifier from password + salt
// ---------------------------------------------------------------------------

async function deriveVerifier(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${password}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// register_login — seed-time only in the demo
// ---------------------------------------------------------------------------

/**
 * Registers a login credential (password) for principal_ref.
 * Returns the new credential_id.
 * Called from seed.ts; not exposed through the composition surface.
 */
export async function register_login(
  principal_ref: string,
  password: string,
): Promise<string> {
  const credential_id = ulid();
  const salt = ulid(); // random per-credential salt
  const credential_hash = await deriveVerifier(password, salt);
  db.prepare(`
    INSERT INTO credential
      (credential_id, principal_ref, credential_type, credential_hash, credential_salt, status, registered_at)
    VALUES (?, ?, 'password', ?, ?, 'active', ?)
  `).run(
    credential_id,
    principal_ref,
    credential_hash,
    salt,
    new Date().toISOString(),
  );
  return credential_id;
}

// ---------------------------------------------------------------------------
// verify_login — called by the login route
// ---------------------------------------------------------------------------

/**
 * Verifies a presented password against the stored verifier.
 *
 * Returns:
 *   'verified'           — password matches the active credential
 *   'failed-verification' — password does not match
 *   'not-known'          — no active password credential for this principal_ref
 */
export async function verify_login(
  principal_ref: string,
  password: string,
): Promise<"verified" | "failed-verification" | "not-known"> {
  const row = db.prepare(`
    SELECT credential_hash, credential_salt
    FROM credential
    WHERE principal_ref = ? AND credential_type = 'password' AND status = 'active'
  `).get(principal_ref) as
    | { credential_hash: string; credential_salt: string }
    | undefined;

  if (!row) return "not-known";

  const derived = await deriveVerifier(password, row.credential_salt);
  return derived === row.credential_hash ? "verified" : "failed-verification";
}
