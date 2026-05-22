// lib/password.ts
//
// Argon2id password hashing via @denosaurs/argontwo.
//
// Algorithm variant: Argon2id — RFC 9106's default recommendation, a hybrid
// of Argon2i (side-channel resistance) and Argon2d (GPU resistance).
//
// Parameters chosen to target ~50–150 ms per hash on commodity hardware.
// The argontwo package exports a single `hash` function that takes raw bytes
// and returns an ArrayBuffer. There is no `verify` export and no built-in
// PHC serialization, so both are implemented here.
//
// PHC format stored in credentials.secret_hash:
//   $argon2id$v=19$m=19456,t=2,p=1$<salt_b64>$<hash_b64>
// where base64 is standard (not URL-safe), no padding.

import { hash as argonHash } from "argontwo";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

// `as const` narrows all values to literal types. This satisfies argontwo's
// Argon2Params shape, whose `version` field is a literal-union type
// (Argon2Version = 0x10 | 0x13) that rejects the plain `number` type.
const PARAMS = {
  algorithm: "Argon2id",
  version: 0x13,   // Argon2 version 1.3 → decimal 19
  tCost: 2,        // iterations
  mCost: 19_456,   // KiB (~19 MiB; OWASP minimum for Argon2id)
  pCost: 1,        // parallelism
} as const;

const PARAM_STRING = `m=${PARAMS.mCost},t=${PARAMS.tCost},p=${PARAMS.pCost}`;

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Internal base64 helpers (standard alphabet, no padding)
// ---------------------------------------------------------------------------

function toBase64NoPad(bytes: Uint8Array): string {
  // btoa + strip trailing '='
  // Safe for the small arrays used here (16-byte salt, 32-byte hash).
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  // Re-add padding before atob
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Constant-time comparison (guards against timing attacks on verify)
// ---------------------------------------------------------------------------

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Exported API (matches the original stub's contract)
// ---------------------------------------------------------------------------

/**
 * Hash a plaintext password. Returns the encoded string in PHC format
 * ($argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>), which is what gets
 * stored in `credentials.secret_hash`.
 *
 * Note: argontwo.hash is synchronous; this wrapper is async for API
 * consistency with callers that must await it before entering withTx().
 */
export async function hashPassword(plaintext: string): Promise<string> {
  // Allocate via new ArrayBuffer so TypeScript infers Uint8Array<ArrayBuffer>
  // (not Uint8Array<ArrayBufferLike>), matching argontwo's BufferSource parameter.
  const saltBuf = new ArrayBuffer(16);
  const salt = new Uint8Array(saltBuf);
  crypto.getRandomValues(salt);
  const hashBuf = argonHash(encoder.encode(plaintext), salt, PARAMS);
  const hashBytes = new Uint8Array(hashBuf);
  return `$argon2id$v=19$${PARAM_STRING}$${toBase64NoPad(salt)}$${toBase64NoPad(hashBytes)}`;
}

/**
 * Verify a plaintext password against a stored PHC-format encoded hash.
 * Returns true only if the password matches; false on any mismatch or
 * parse error.
 *
 * Comparison is constant-time in the hash bytes to resist timing attacks.
 */
export async function verifyPassword(
  plaintext: string,
  encoded: string,
): Promise<boolean> {
  try {
    // PHC format: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    // split("$") yields: ["", "argon2id", "v=19", "m=...", "<salt>", "<hash>"]
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[1] !== "argon2id") return false;

    const salt = fromBase64(parts[4]);
    const storedHash = fromBase64(parts[5]);

    // Re-derive hash using the same parameters (we always use fixed PARAMS
    // for hashes we produce; if stored params differ, the result won't match,
    // which is the correct behavior).
    const hashBuf = argonHash(encoder.encode(plaintext), salt, PARAMS);
    return timingSafeEqual(new Uint8Array(hashBuf), storedHash);
  } catch {
    return false;
  }
}
