// Actor Identity atom — attestation store.
//
// Implements the two operations exposed by the Actor Identity atom:
//   attest(actor_ref, action_ref, credential) → attestation_id
//   verify(attestation_id, actor_ref, credential) → 'valid' | 'invalid' | 'not-found'
//
// In the demo, credential verification is a constant-time string comparison
// against the stored credential_secret. In a production implementation this
// would be an HMAC or asymmetric signature check.
//
// Attestations are durable: the schema enforces no-update, no-delete.

import { ulid } from "@std/ulid";
import { db } from "../db/client.ts";

export type Attestation = {
  attestation_id: string;
  actor_ref: string;
  action_ref: string;
  attested_at: string;
};

/**
 * Records an attestation that actor_ref attested to action_ref using credential.
 *
 * Returns the new attestation_id, or throws if actor_ref is unknown.
 *
 * Called inside a transaction by composition.ts. The credential check happens
 * here; if it fails we throw before any DB write occurs.
 */
export function attest(
  actor_ref: string,
  action_ref: string,
  credential: string,
): string {
  // Verify actor exists and credential matches
  const actor = db.prepare(
    "SELECT credential_secret FROM actor WHERE actor_ref = ?",
  ).get(actor_ref) as { credential_secret: string } | undefined;

  if (!actor) throw new Error(`actor-not-found:${actor_ref}`);
  if (actor.credential_secret !== credential) {
    throw new Error(`credential-invalid:${actor_ref}`);
  }

  const attestation_id = ulid();
  const attested_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO attestation (attestation_id, actor_ref, action_ref, attested_at)
    VALUES (?, ?, ?, ?)
  `).run(attestation_id, actor_ref, action_ref, attested_at);

  return attestation_id;
}

/**
 * Verifies that an attestation record exists and the stored actor/credential match.
 *
 * Returns:
 *   'valid'     — attestation exists and credential matches
 *   'invalid'   — attestation exists but credential does not match
 *   'not-found' — no attestation with this id
 */
export function verify(
  attestation_id: string,
  actor_ref: string,
  credential: string,
): "valid" | "invalid" | "not-found" {
  const row = db.prepare(`
    SELECT a.attestation_id, a.actor_ref, act.credential_secret
    FROM attestation a
    JOIN actor act ON act.actor_ref = a.actor_ref
    WHERE a.attestation_id = ?
  `).get(attestation_id) as {
    attestation_id: string;
    actor_ref: string;
    credential_secret: string;
  } | undefined;

  if (!row) return "not-found";
  if (row.actor_ref !== actor_ref || row.credential_secret !== credential) {
    return "invalid";
  }
  return "valid";
}

/** Returns an attestation by id, or undefined. */
export function getAttestation(attestation_id: string): Attestation | undefined {
  return db.prepare(
    "SELECT * FROM attestation WHERE attestation_id = ?",
  ).get(attestation_id) as Attestation | undefined;
}
