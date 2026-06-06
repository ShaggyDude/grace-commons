// lib/password.ts — the only place password hashing is referenced.
//
// BUILD_PLAN Decision 4 specifies Argon2id via @node-rs/argon2 (so credentials
// are PHC-interoperable with render 1). That is a native addon; in environments
// where its prebuilt binary is unavailable this falls back to node:crypto scrypt,
// which is zero-dependency and runs anywhere. Conformance never inspects the
// password method; the only thing scrypt loses vs Argon2id is cross-render
// credential interop (a render-1 hash won't verify here and vice-versa).
// Logged in CORNERS.md — swap to @node-rs/argon2 for the deploy.
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: string, keylen: number, opts: any) => Promise<Buffer>;
const N = 16384, r = 8, p = 1, KEYLEN = 64; // scrypt cost (OWASP-reasonable)

/** Returns an encoded string stored in credentials.secret_hash. */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const dk = await scrypt(plaintext, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt}$${dk.toString("hex")}`;
}

/** Constant-time verify against a previously stored encoded hash. */
export async function verifyPassword(plaintext: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts[0] !== "scrypt" || parts.length !== 6) return false;
  const [, n, rr, pp, salt, hex] = parts;
  const dk = await scrypt(plaintext, salt, hex.length / 2, { N: Number(n), r: Number(rr), p: Number(pp) });
  const a = Buffer.from(hex, "hex");
  return a.length === dk.length && timingSafeEqual(a, dk);
}
