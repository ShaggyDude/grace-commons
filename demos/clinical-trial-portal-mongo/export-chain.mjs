// export-chain.mjs — emit the Mongo-stored audit chain as JSONL.
//   node export-chain.mjs <data-dir> > chain.jsonl
//
// The cross-render portability claim made literal for a document store: the
// chain that mongod persisted re-walks clean under the SAME JS verifier the Go
// render uses (demos/clinical-trial-portal-go/verify.mjs — byte-identical to
// render 2's lib/canonical.ts + domain/event_log.ts):
//   node export-chain.mjs <data-dir> > /tmp/chain.jsonl
//   node ../clinical-trial-portal-go/verify.mjs /tmp/chain.jsonl
//
// Each line is the canonical-JSON envelope of one event; `_id` (the stored
// chain position) is emitted under the canonical key `id`. No re-hashing
// happens here — this only re-keys and serializes what mongod stored, so a
// verify failure downstream would mean the STORE diverged from the contract.
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { canonicalize } from "./lib/canonical.mjs";

const dbPath = process.argv[2];
if (!dbPath) { console.error("usage: node export-chain.mjs <data-dir>"); process.exit(2); }

const server = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: "wiredTiger" } });
const client = new MongoClient(server.getUri());
try {
  await client.connect();
  const rows = await client.db("beacon").collection("event_log").find().sort({ _id: 1 }).toArray();
  for (const r of rows) {
    process.stdout.write(canonicalize({
      id: r._id, occurred_at: r.occurred_at, actor_id: r.actor_id, session_id: r.session_id,
      action: r.action, target_kind: r.target_kind, target_id: r.target_id,
      payload_json: r.payload_json, prev_hash: r.prev_hash, this_hash: r.this_hash,
    }) + "\n");
  }
} finally {
  await client.close();
  await server.stop({ doCleanup: false });
}
