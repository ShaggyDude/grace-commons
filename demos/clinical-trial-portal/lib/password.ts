// lib/password.ts
//
// Argon2id password hashing via @denosaurs/argontwo.
//
// Algorithm variant: Argon2id — RFC 9106's default recommendation, a hybrid
// of Argon2i (side-channel resistance) and Argon2d (GPU resistance).
//
// Parameters chosen to target ~50–150 ms per hash on commodity hardware.
// Fly.io deployment is sized with headroom (see Phase 6 — at least
// shared-cpu-2x / 1 GB), so these defaults are expected to hold on prod.
// Re-benchmark before adjusting either direction.

import { hash as argonHash, verify as argonVerify, type Argon2Algorithm } from "argontwo";

const PARAMS = {
  algorithm: "Argon2id" as Argon2Algorithm,
  memoryCost: 19_456,    // KiB (~19 MiB; OWASP minimum for Argon2id as of writing)
  timeCost: 2,           // iterations
  parallelism: 1,
};

/**
 * Hash a plaintext password. Returns the encoded string in PHC format
 * ($argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>), which is what gets
 * stored in `credentials.secret_hash`.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return await argonHash(plaintext, PARAMS);
}

/** Constant-time verify against a previously stored PHC-format encoded hash. */
export async function verifyPassword(plaintext: string, encoded: string): Promise<boolean> {
  return await argonVerify(plaintext, encoded);
}

// IMPLEMENTATION NOTE: confirm the exact exported names and signatures of
// `hash` and `verify` against `jsr:@denosaurs/argontwo@^0.2` before wiring.
// The shape above (params object + PHC-format encoded string) is the
// intended contract; if the package's API differs in surface details,
// adapt the call sites here without changing this module's exported API.
