// verify.mjs — the JS verifier for a render's emitted chain.
//
// canonicalize + the hashed-event shape here are BYTE-IDENTICAL to render 2's
// demos/clinical-trial-portal-next/lib/canonical.ts and domain/event_log.ts. So
// "verifies under verify.mjs" means "verifies under the TypeScript canonical
// contract" — the cross-language portability claim (BUILD_PLAN §6.3) made literal:
// a Go- or Python-produced chain re-walks clean under the JS contract.
//
// Usage:  node verify.mjs <chain.jsonl>     (defaults to ./expected-chain.jsonl)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Identical to lib/canonical.ts — do not "improve."
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");

// Identical hashed-event shape to domain/event_log.ts hashEvent.
function hashEvent(e) {
  return sha256hex(
    canonicalize({
      id: e.id,
      occurred_at: e.occurred_at,
      actor_id: e.actor_id,
      session_id: e.session_id,
      action: e.action,
      target_kind: e.target_kind,
      target_id: e.target_id,
      payload_json: e.payload_json,
      prev_hash: e.prev_hash,
    }),
  );
}

const path = process.argv[2] ?? new URL("./expected-chain.jsonl", import.meta.url).pathname;
const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);

let prev = "";
let count = 0;
for (const line of lines) {
  const e = JSON.parse(line);
  const recomputed = hashEvent(e);
  if (recomputed !== e.this_hash) {
    console.error(`✗ this_hash divergence at #${e.id}: recomputed ${recomputed}, stored ${e.this_hash}`);
    process.exit(1);
  }
  if (e.prev_hash !== prev) {
    console.error(`✗ prev_hash break at #${e.id}: expected ${JSON.stringify(prev)}, found ${JSON.stringify(e.prev_hash)}`);
    process.exit(1);
  }
  prev = e.this_hash;
  count++;
}
console.log(`✓ Verified ${count} event(s) under the JS canonical contract (lib/canonical.ts + SHA-256).`);
