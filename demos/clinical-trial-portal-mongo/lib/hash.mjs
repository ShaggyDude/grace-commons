/**
 * lib/hash.mjs — SHA-256 + random tokens, ported from render 2
 * (demos/clinical-trial-portal-next/lib/hash.ts). Same primitive
 * (node:crypto), synchronous sha256hex so it can run inside the
 * transaction body.
 */
import { createHash, randomBytes } from "node:crypto";

/** SHA-256 of `input` as lowercase hex. Synchronous — safe inside a transaction. */
export function sha256hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

/** Cryptographically-random token as lowercase hex of length `bytes * 2`. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}
