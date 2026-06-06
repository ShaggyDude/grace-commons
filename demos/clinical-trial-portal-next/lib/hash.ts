/**
 * lib/hash.ts — SHA-256 + random tokens, ported from the first render
 * (demos/clinical-trial-portal/lib/hash.ts). Same primitive (node:crypto),
 * synchronous sha256hex so it can run inside the transaction body. BUILD_PLAN §6.2.
 */
import { createHash, randomBytes } from "node:crypto";

// Overrideable implementation so the rollback/tamper tests can force a hash
// failure mid-transaction (mirrors render 1's _testOverrideSha256hex hook).
let _impl: (input: string) => string = (input) =>
  createHash("sha256").update(input).digest("hex");

/** SHA-256 of `input` as lowercase hex. Synchronous — safe inside a transaction. */
export function sha256hex(input: string): string {
  return _impl(input);
}

/** Cryptographically-random token as lowercase hex of length `bytes * 2`. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Test-only: swap the sha256hex implementation; returns a restore fn. */
export function _testOverrideSha256hex(fn: (input: string) => string): () => void {
  const prev = _impl;
  _impl = fn;
  return () => { _impl = prev; };
}
