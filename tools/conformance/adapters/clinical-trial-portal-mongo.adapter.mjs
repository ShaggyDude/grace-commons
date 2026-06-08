// tools/conformance/adapters/clinical-trial-portal-mongo.adapter.mjs
//
// Mongo-render VALIDATOR ADAPTER. `--db <dir>` is the data DIRECTORY persisted
// by demos/clinical-trial-portal-mongo/build.mjs. Async init, records-alone:
// boots an ephemeral STANDALONE mongod over that directory (a replset data dir
// is readable standalone — standard maintenance posture; this sidesteps
// re-forming the replset config on a new port), snapshots every collection,
// shuts mongod down, and serves the synchronous accessor contract over the
// snapshot. It only reads collections (the engine may journal on boot; the
// adapter itself issues no writes).
//
// Because this render is a faithful port of the canonical schema — SAME
// collection names, SAME action codes — the mapping is a near pass-through
// like the next-app adapter: no event-vocabulary map, just `_id` → `id`.
//
// Dependency seam: `mongodb` + `mongodb-memory-server` are the RENDER's deps
// (demos/clinical-trial-portal-mongo/package.json), resolved from the render's
// own node_modules via createRequire — the conformance core stays
// dependency-free and tools/conformance/package.json is untouched.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const requireFromRender = createRequire(
  new URL("../../../demos/clinical-trial-portal-mongo/package.json", import.meta.url),
);
async function loadDeps() {
  try {
    const { MongoClient } = requireFromRender("mongodb");
    const { MongoMemoryServer } = requireFromRender("mongodb-memory-server");
    return { MongoClient, MongoMemoryServer };
  } catch {
    // fall back to whatever this package can resolve (e.g. a hoisted install)
    const { MongoClient } = await import("mongodb");
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return { MongoClient, MongoMemoryServer };
  }
}

const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// The hashed-event shape — same as renders 1/2/Go. The chain position is
// stored as `_id`; it is hashed under the canonical key `id`.
const rowHash = (r) => sha256(canon({
  id: r._id, occurred_at: r.occurred_at, actor_id: r.actor_id, session_id: r.session_id,
  action: r.action, target_kind: r.target_kind, target_id: r.target_id,
  payload_json: r.payload_json, prev_hash: r.prev_hash,
}));

const ONBOARD_ACTIONS = new Set(["invitation.accepted", "actor.enrolled", "credential.created", "session.opened"]);

export default async function createAdapter({ dbPath }) {
  const { MongoClient, MongoMemoryServer } = await loadDeps();

  // Boot standalone over the persisted directory; snapshot; shut down.
  const server = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(server.getUri());
  let snap;
  try {
    await client.connect();
    const db = client.db("beacon");
    const all = (name) => db.collection(name).find().sort({ _id: 1 }).toArray();
    snap = {
      event_log: await all("event_log"),
      parties: await all("parties"),
      actors: await all("actors"),
      credentials: await all("credentials"),
      sessions: await all("sessions"),
      grants: await all("grants"),
      invitations: await all("invitations"),
      retention: await db.collection("retention_policy").find({ _id: 1 }).toArray(),
    };
  } finally {
    await client.close();
    await server.stop({ doCleanup: false }); // the directory is the render's store — keep it
  }

  const toEvent = (r) => {
    let payload = {}; try { payload = JSON.parse(r.payload_json); } catch { payload = {}; }
    return {
      id: r._id, occurred_at: r.occurred_at, actor_id: r.actor_id, session_id: r.session_id,
      action: r.action, target_kind: r.target_kind ?? null, target_id: r.target_id ?? null,
      payload, prev_hash: r.prev_hash, this_hash: r.this_hash,
    };
  };
  const events = snap.event_log.map(toEvent);

  const party = (r) => r && ({ id: r._id, email: r.email, display_name: r.display_name, created_at: r.created_at });
  const actor = (r) => r && ({ id: r._id, party_id: r.party_id, created_at: r.created_at });
  const credential = (r) => ({ id: r._id, actor_id: r.actor_id, kind: r.kind, secret_hash: r.secret_hash, created_at: r.created_at, revoked_at: r.revoked_at ?? null });
  const session = (r) => r && ({ id: r._id, actor_id: r.actor_id, token: r.token, issued_at: r.issued_at, expires_at: r.expires_at, revoked_at: r.revoked_at ?? null });
  const grant = (r) => ({ id: r._id, grantor_actor_id: r.grantor_actor_id, grantee_actor_id: r.grantee_actor_id, permission_id: r.permission_id, scope: r.scope, issued_at: r.issued_at, revoked_at: r.revoked_at ?? null, revoke_reason: r.revoke_reason ?? null });
  const invite = (r) => r && ({ id: r._id, party_id: r.party_id, intended_role: r.intended_role, token: r.token, issued_by_actor_id: r.issued_by_actor_id, issued_at: r.issued_at, expires_at: r.expires_at, accepted_at: r.accepted_at ?? null, accepted_by_actor_id: r.accepted_by_actor_id ?? null, revoked_at: r.revoked_at ?? null });

  const api = {
    events: () => events,
    eventsByAction: (a) => events.filter((e) => e.action === a),
    eventsByActor: (id) => events.filter((e) => e.actor_id === id),
    event: (id) => events.find((e) => e.id === id) ?? null,

    verifyChain() {
      let count = 0;
      for (const r of snap.event_log) {
        const expected = rowHash(r);
        if (expected !== r.this_hash) return { ok: false, at: r._id, expected, found: r.this_hash };
        count++;
      }
      return { ok: true, count };
    },

    parties: () => snap.parties.map(party),
    party: (id) => party(snap.parties.find((r) => r._id === id)) ?? null,
    actors: () => snap.actors.map(actor),
    actor: (id) => actor(snap.actors.find((r) => r._id === id)) ?? null,
    credentials: () => snap.credentials.map(credential),
    sessions: () => snap.sessions.map(session),
    session: (id) => session(snap.sessions.find((r) => r._id === id)) ?? null,
    grants: () => snap.grants.map(grant),
    invitations: () => snap.invitations.map(invite),
    invitation: (id) => invite(snap.invitations.find((r) => r._id === id)) ?? null,
    retentionPolicy: () => { const r = snap.retention[0]; return r ? { days: r.days, enforce_on_read: r.enforce_on_read } : null; },

    onboardingCompletions() {
      return api.eventsByAction("actor.enrolled").map((ev) => {
        const burst = events.filter((e) => e.actor_id === ev.actor_id && e.session_id === ev.session_id && ONBOARD_ACTIONS.has(e.action));
        const has = (a) => burst.some((e) => e.action === a);
        return {
          completion_event_id: ev.id, occurred_at: ev.occurred_at,
          actor_id: ev.target_id, attributed_actor_id: ev.actor_id,
          party_id: ev.payload.party_id ?? null, invitation_id: ev.payload.via_invitation_id ?? null,
          session_id: ev.session_id,
          has_invitation_accepted_event: has("invitation.accepted"),
          has_credential_event: has("credential.created"),
          has_session_opened_event: has("session.opened"),
          burst_event_ids: burst.map((e) => e.id),
        };
      });
    },

    close: () => {}, // mongod already stopped after the snapshot load.
  };
  return api;
}
