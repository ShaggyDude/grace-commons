// tools/conformance/render5/lib/crypto.mjs
//
// Password hashing for the `secret` store (this render's Credential atom). A
// real Next.js app would reach for scrypt/argon2; we use node:crypto scrypt so
// the dependency footprint stays at "Node built-ins + pglite". The conformance
// checks only require that a credential binds to its enrolled actor (C16-2), so
// the exact KDF is a free choice — we pick a real one.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashSecret(plaintext) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(plaintext, salt, 64).toString("hex");
  return { algo: "scrypt", salt, digest };
}

export function verifySecret(plaintext, { salt, digest }) {
  const candidate = scryptSync(plaintext, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newToken(prefix = "tok") {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}
