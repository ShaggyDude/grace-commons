/**
 * lib/hash.ts
 *
 * SHA-256 hashing and cryptographically-random token generation.
 *
 * sha256hex is SYNCHRONOUS — required because it is called inside
 * withTx() which is a synchronous function. Implemented via node:crypto
 * (available in Deno via Node.js compat layer).
 *
 * For password hashing (Argon2id, async) see lib/password.ts.
 * For canonical JSON serialization used before hashing see lib/canonical.ts.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Internal: overrideable implementation (used by test helpers to simulate hash
// failures and validate transaction rollback behaviour — see _testOverrideSha256hex).
// ---------------------------------------------------------------------------

let _impl: (input: string) => string = (input) =>
  createHash("sha256").update(input).digest("hex");

/**
 * Compute a SHA-256 hash of `input` and return it as a lowercase hex string.
 * This function is synchronous — safe to call inside a SQLite transaction.
 */
export function sha256hex(input: string): string {
  return _impl(input);
}

/**
 * Generate a cryptographically random token, returned as a lowercase hex
 * string of length `bytes * 2`.
 *
 * Default of 32 bytes → 64-char hex. Used for session tokens and
 * invitation tokens.
 */
export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Test-only override hook.
// ---------------------------------------------------------------------------

/**
 * Override the sha256hex implementation for the duration of a test.
 * Returns a restore function that reverts the override.
 *
 * USAGE (in tests/_helpers.ts only):
 *   const restore = _testOverrideSha256hex(() => { throw new Error("forced"); });
 *   try { ... } finally { restore(); }
 *
 * The `_` prefix signals test-only intent. Do not call from production code.
 */
export function _testOverrideSha256hex(
  fn: (input: string) => string,
): () => void {
  const prev = _impl;
  _impl = fn;
  return () => {
    _impl = prev;
  };
}
