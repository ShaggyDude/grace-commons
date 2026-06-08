// lib/password.mjs — the only place password hashing is referenced.
//
// Same scheme and encoded format as render 2's fallback path
// (demos/clinical-trial-portal-next/lib/password.ts): node:crypto scrypt,
// zero-dependency, runs anywhere. Conformance never inspects the password
// method; the encoded string is opaque to the records-alone seam.
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);
const N = 16384, r = 8, p = 1, KEYLEN = 64; // scrypt cost (OWASP-reasonable)

/** Returns an encoded string stored in credentials.secret_hash. */
export async function hashPassword(plaintext) {
  const salt = randomBytes(16).toString("hex");
  const dk = await scrypt(plaintext, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt}$${dk.toString("hex")}`;
}

/** Constant-time verify against a previously stored encoded hash. */
export async function verifyPassword(plaintext, encoded) {
  const parts = encoded.split("$");
  if (parts[0] !== "scrypt" || parts.length !== 6) return false;
  const [, n, rr, pp, salt, hex] = parts;
  const dk = await scrypt(plaintext, salt, hex.length / 2, { N: Number(n), r: Number(rr), p: Number(pp) });
  const a = Buffer.from(hex, "hex");
  return a.length === dk.length && timingSafeEqual(a, dk);
}
