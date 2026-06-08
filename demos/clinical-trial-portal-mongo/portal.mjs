// portal.mjs — THE ONLY mutation surface (Mongo ghost render).
//
// The spec-derived core of the clinical-trial-portal (External Onboarding C16,
// Login C13, Session-Gated Authorization C14, Attributed Permissions Admin APA,
// Audit Trail C1) ported onto the MongoDB driver. Headless — it exists to
// reveal structure, not to ship. Ops, action codes, audit payload fields, and
// rejection checks are TRANSCRIBED from render 2's composition.ts
// (demos/clinical-trial-portal-next) — an auditor diffing the two renders'
// event logs must see identical `action` strings and payload keys.
//
// Hash contract: canonicalize + sha256hex are byte-identical ports of render
// 2's lib/. The hashed-event shape is IDENTICAL to renders 1/2/Go:
//   sha256hex(canonicalize({ id, occurred_at, actor_id, session_id, action,
//                            target_kind, target_id, payload_json, prev_hash }))
// The chain position is STORED as Mongo's `_id` but HASHED under the key `id`
// — the storage key is render-local, the hashed key is the canonical contract.
//
// ── Atomicity + the serialize clause (the 4th conforming mechanism) ──────────
// Event Log Invariant 3 (total order) carries the operational clause "appends
// never fail for ordering or contention reasons — the underlying implementation
// must serialize them". Three mechanisms are already on record (DISCOVERIES
// 2026-06-06): SQLite's single-writer lock, Postgres `pg_advisory_xact_lock`,
// Go `sync.Mutex`. Mongo has no advisory lock; this render's mechanism is:
//
//   multi-document transaction (single-node replica set)
//   + unique `_id` on event_log as the fork guard
//   + optimistic retry (`withTransaction` re-runs on TransientTransactionError)
//
// Two concurrent appends both read tail N and both try to insert _id N+1; the
// engine commits one and aborts the other with a transient write-conflict;
// `withTransaction` re-runs the WHOLE op body, which re-reads the new tail and
// lands at N+2 with the correct prev_hash. A forked append is IMPOSSIBLE (the
// unique _id makes it a conflict, not a fork) and contention never surfaces to
// the caller (the retry absorbs it) — both halves of the clause, mechanically.
// Every op body is therefore written to be safely re-runnable: id allocation
// ($inc on counters) happens INSIDE the transaction so an aborted attempt
// rolls its ids back; random tokens and password hashes are computed BEFORE
// the transaction (same placement as render 2) so a retry reuses them.
//
// Mongo requires a replica set for transactions — build.mjs boots a one-node
// replSet via mongodb-memory-server. The persisted data directory is then
// readable by a plain standalone mongod (how the validator adapter reads it).
import { MongoClient } from "mongodb";
import { canonicalize } from "./lib/canonical.mjs";
import { sha256hex, randomToken } from "./lib/hash.mjs";
import { hashPassword, verifyPassword } from "./lib/password.mjs";
import { ensureSchema } from "./schema.mjs";

const SESSION_DAYS = 7;
const now = () => new Date().toISOString();
const expiresIn = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

/**
 * The hashed payload shape — IDENTICAL to renders 1/2/Go. All ids are JS
 * numbers; payload_json is the canonicalized STRING (nested as a string).
 */
function hashEvent(f) {
  return sha256hex(canonicalize({
    id: f.id,
    occurred_at: f.occurred_at,
    actor_id: f.actor_id,
    session_id: f.session_id,
    action: f.action,
    target_kind: f.target_kind,
    target_id: f.target_id,
    payload_json: f.payload_json,
    prev_hash: f.prev_hash,
  }));
}

export async function open(uri, { dbName = "beacon" } = {}) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const C = (name) => db.collection(name);

  /** Run `fn(session)` in a multi-document transaction. `withTransaction`
   *  re-runs `fn` on transient conflicts — see the mechanism note above. */
  async function withTx(fn) {
    const session = client.startSession();
    try {
      let out;
      await session.withTransaction(async () => { out = await fn(session); });
      return out;
    } finally {
      await session.endSession();
    }
  }

  /** Sequential id for non-event collections. $inc INSIDE the caller's
   *  transaction (IDENTITY-replacement; rolls back with the op). */
  async function nextId(name, session) {
    const doc = await C("counters").findOneAndUpdate(
      { _id: name }, { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
    return doc.seq;
  }

  /** App-code FK check — Mongo has no REFERENCES; portal.mjs is the enforcer.
   *  (Postgres raised foreign_key_violation; this raises before the write.) */
  async function fkExists(coll, id, session, what) {
    if (id === null || id === undefined) return;
    const found = await C(coll).findOne({ _id: id }, { session, projection: { _id: 1 } });
    if (!found) throw new Error(`fk violation: ${what} #${id} not found in ${coll}`);
  }

  /**
   * Append one event inside the caller's transaction. Reads the tail (id +
   * this_hash in ONE document read — they can never disagree), assigns
   * _id = tail+1, hashes WITH the id, inserts. A concurrent winner makes the
   * insert conflict and the surrounding withTransaction re-run the op.
   */
  async function appendEvent(session, ctx, input) {
    const tail = await C("event_log").find({}, { session }).sort({ _id: -1 }).limit(1).next();
    const id = (tail?._id ?? 0) + 1;
    const prev_hash = tail?.this_hash ?? "";

    const occurred_at = input.occurred_at ?? now();
    const actor_id = ctx.actor?._id ?? null;
    const session_id = ctx.session?._id ?? null;
    const target_kind = input.target_kind ?? null;
    const target_id = input.target_id ?? null;
    const payload_json = canonicalize(input.payload ?? {});

    const this_hash = hashEvent({
      id, occurred_at, actor_id, session_id,
      action: input.action, target_kind, target_id, payload_json, prev_hash,
    });

    await C("event_log").insertOne(
      { _id: id, occurred_at, actor_id, session_id, action: input.action, target_kind, target_id, payload_json, prev_hash, this_hash },
      { session },
    );
    return id;
  }

  const api = {
    client, db,

    async migrate() { await ensureSchema(db); },

    // ── seed (roster byte-for-byte with renders 1/2; bootstrap seam) ─────────
    async seed() {
      const PERMS = [
        ["invite_actor", "Invite a coordinator"],
        ["grant_permission", "Manage grants on others"],
        ["enroll_subject", "Enroll a subject into the protocol"],
        ["record_visit", "Record a study visit"],
        ["view_audit", "View the audit log"],
      ];
      // Bootstrap rows are written directly (the documented "Bootstrap
      // Identity" seam): no audit events for seeded identities/grants. The
      // ONLY seed event is the backdated study.registered genesis, appended
      // through the SAME appendEvent path as every other event.
      await withTx(async (session) => {
        for (const [code, label] of PERMS) {
          if (!(await C("permissions").findOne({ code }, { session }))) {
            await C("permissions").insertOne({ _id: await nextId("permissions", session), code, label }, { session });
          }
        }
        if (!(await C("studies").findOne({ protocol_number: "BCN-OX-201" }, { session }))) {
          await C("studies").insertOne(
            { _id: await nextId("studies", session), protocol_number: "BCN-OX-201", title: "Beacon Oncology Phase II Trial", created_at: now() },
            { session },
          );
        }
        if (!(await C("retention_policy").findOne({ _id: 1 }, { session }))) {
          await C("retention_policy").insertOne({ _id: 1, days: 2555, enforce_on_read: false }, { session });
        }
      });

      const permByCode = async (code) => C("permissions").findOne({ code });

      const bootstrapAccount = async (email, name, password, grantSpecs) => {
        if (await C("parties").findOne({ email })) return null;
        const secret_hash = await hashPassword(password); // before the txn
        return withTx(async (session) => {
          const party_id = await nextId("parties", session);
          await C("parties").insertOne({ _id: party_id, email, display_name: name, created_at: now() }, { session });
          const actor_id = await nextId("actors", session);
          await C("actors").insertOne({ _id: actor_id, party_id, created_at: now() }, { session });
          await C("credentials").insertOne(
            { _id: await nextId("credentials", session), actor_id, kind: "password", secret_hash, created_at: now(), revoked_at: null },
            { session },
          );
          for (const [code, scope] of grantSpecs) {
            const perm = await C("permissions").findOne({ code }, { session });
            await C("grants").insertOne(
              { _id: await nextId("grants", session), grantor_actor_id: actor_id, grantee_actor_id: actor_id, permission_id: perm._id, scope, issued_at: now(), revoked_at: null, revoke_reason: null },
              { session },
            );
          }
          return actor_id;
        });
      };

      await bootstrapAccount("anya@beacon.clinical", "Dr. Anya Okonkwo", "demo-pi", [
        ["invite_actor", "all"], ["grant_permission", "all"], ["enroll_subject", "all"], ["record_visit", "all"], ["view_audit", "all"],
      ]);
      // CRA's view_audit grant is issued by the PI (mirrors render 1/2 seed).
      const piParty = await C("parties").findOne({ email: "anya@beacon.clinical" });
      const piActor = await C("actors").findOne({ party_id: piParty._id });
      if (!(await C("parties").findOne({ email: "jordan@beacon.clinical" }))) {
        const secret_hash = await hashPassword("demo-cra");
        await withTx(async (session) => {
          const party_id = await nextId("parties", session);
          await C("parties").insertOne({ _id: party_id, email: "jordan@beacon.clinical", display_name: "Jordan Lee", created_at: now() }, { session });
          const actor_id = await nextId("actors", session);
          await C("actors").insertOne({ _id: actor_id, party_id, created_at: now() }, { session });
          await C("credentials").insertOne(
            { _id: await nextId("credentials", session), actor_id, kind: "password", secret_hash, created_at: now(), revoked_at: null },
            { session },
          );
          const va = await C("permissions").findOne({ code: "view_audit" }, { session });
          await C("grants").insertOne(
            { _id: await nextId("grants", session), grantor_actor_id: piActor._id, grantee_actor_id: actor_id, permission_id: va._id, scope: "all", issued_at: now(), revoked_at: null, revoke_reason: null },
            { session },
          );
        });
      }

      // Backdated genesis — same append path as every other event.
      if ((await C("event_log").countDocuments()) === 0) {
        const study = await C("studies").findOne({ protocol_number: "BCN-OX-201" });
        const backdated = new Date(Date.now() - 8 * 365.25 * 86_400_000).toISOString();
        const anon = { actor: null, session: null };
        await withTx(async (session) => {
          await appendEvent(session, anon, {
            action: "study.registered", target_kind: "study", target_id: study._id,
            payload: { protocol_number: "BCN-OX-201", note: "Protocol BCN-OX-201 registered in trial management system." },
            occurred_at: backdated,
          });
        });
      }
    },

    // ── Invitation lifecycle (C16) ───────────────────────────────────────────

    /** Emits: invitation.issued */
    async issueInvitation(ctx, { email, display_name, intended_role, expires_in_days = 7 }) {
      if (!ctx.actor) throw new Error("issueInvitation: authenticated actor required");
      const token = randomToken();
      const expires_at = expiresIn(expires_in_days);
      return withTx(async (session) => {
        let party = await C("parties").findOne({ email }, { session });
        if (!party) {
          party = { _id: await nextId("parties", session), email, display_name, created_at: now() };
          await C("parties").insertOne(party, { session });
        }
        const inv = {
          _id: await nextId("invitations", session),
          party_id: party._id, intended_role, token,
          issued_by_actor_id: ctx.actor._id, issued_at: now(), expires_at,
          accepted_at: null, accepted_by_actor_id: null, revoked_at: null,
        };
        await C("invitations").insertOne(inv, { session });
        await appendEvent(session, ctx, {
          action: "invitation.issued", target_kind: "invitation", target_id: inv._id,
          payload: { display_name, email, intended_role, expires_at },
        });
        return inv;
      });
    },

    /** Emits: invitation.accepted, actor.enrolled, credential.created, session.opened */
    async acceptInvitation(ctx, { token, password }) {
      const secret_hash = await hashPassword(password); // before the txn
      const sessionToken = randomToken();
      const expires_at = expiresIn(SESSION_DAYS);
      const savedActor = ctx.actor, savedSession = ctx.session;
      try {
        return await withTx(async (session) => {
          ctx.actor = savedActor; ctx.session = savedSession; // re-runnable body
          const inv = await C("invitations").findOne({ token }, { session });
          if (!inv) throw new Error("acceptInvitation: invitation not found");
          if (inv.accepted_at || inv.revoked_at) throw new Error("acceptInvitation: invitation already resolved");
          if (new Date(inv.expires_at) <= new Date()) throw new Error("acceptInvitation: invitation expired");

          await fkExists("parties", inv.party_id, session, "invitation.party");
          const actor = { _id: await nextId("actors", session), party_id: inv.party_id, created_at: now() };
          await C("actors").insertOne(actor, { session });
          await C("credentials").insertOne(
            { _id: await nextId("credentials", session), actor_id: actor._id, kind: "password", secret_hash, created_at: now(), revoked_at: null },
            { session },
          );
          await C("invitations").updateOne({ _id: inv._id }, { $set: { accepted_at: now(), accepted_by_actor_id: actor._id } }, { session });
          const sess = { _id: await nextId("sessions", session), actor_id: actor._id, token: sessionToken, issued_at: now(), expires_at, revoked_at: null };
          await C("sessions").insertOne(sess, { session });

          // Attribute the burst to the new actor + session.
          ctx.actor = actor; ctx.session = sess;

          await appendEvent(session, ctx, { action: "invitation.accepted", target_kind: "invitation", target_id: inv._id, payload: { intended_role: inv.intended_role } });
          await appendEvent(session, ctx, { action: "actor.enrolled", target_kind: "actor", target_id: actor._id, payload: { party_id: inv.party_id, via_invitation_id: inv._id } });
          await appendEvent(session, ctx, { action: "credential.created", target_kind: "credential", payload: { kind: "password" } });
          await appendEvent(session, ctx, { action: "session.opened", target_kind: "session", target_id: sess._id, payload: { actor_id: actor._id, via: "onboard" } });
          return { actor, session: sess };
        });
      } catch (err) {
        ctx.actor = savedActor; ctx.session = savedSession;
        throw err;
      }
    },

    /** Emits: invitation.revoked */
    async revokeInvitation(ctx, { invitation_id }) {
      if (!ctx.actor) throw new Error("revokeInvitation: authenticated actor required");
      await withTx(async (session) => {
        const inv = await C("invitations").findOne({ _id: invitation_id }, { session });
        if (!inv) throw new Error(`revokeInvitation: #${invitation_id} not found`);
        await C("invitations").updateOne({ _id: invitation_id }, { $set: { revoked_at: now() } }, { session });
        await appendEvent(session, ctx, { action: "invitation.revoked", target_kind: "invitation", target_id: invitation_id, payload: { intended_role: inv.intended_role } });
      });
    },

    // ── Authentication (Login C13) ───────────────────────────────────────────

    /** Every failure path emits an anonymous login.failed; success emits login.succeeded. */
    async login(ctx, { email, password }) {
      const failed = async (payload) => {
        await withTx(async (session) => { await appendEvent(session, ctx, { action: "login.failed", payload }); });
        return { ok: false, reason: "invalid_credentials" };
      };

      const party = await C("parties").findOne({ email });
      if (!party) return failed({ email, reason: "unknown_email" });
      const actor = await C("actors").findOne({ party_id: party._id });
      if (!actor) return failed({ email, party_id: party._id, reason: "no_actor" });
      const cred = await C("credentials").findOne({ actor_id: actor._id, revoked_at: null });
      if (!cred) return failed({ email, party_id: party._id, reason: "no_credential" });

      const valid = await verifyPassword(password, cred.secret_hash);
      if (!valid) return failed({ email, party_id: party._id, reason: "bad_password" });

      const sessionToken = randomToken();
      const expires_at = expiresIn(SESSION_DAYS);
      const savedActor = ctx.actor, savedSession = ctx.session;
      try {
        const sess = await withTx(async (session) => {
          ctx.actor = savedActor; ctx.session = savedSession; // re-runnable body
          const s = { _id: await nextId("sessions", session), actor_id: actor._id, token: sessionToken, issued_at: now(), expires_at, revoked_at: null };
          await C("sessions").insertOne(s, { session });
          ctx.actor = actor; ctx.session = s;
          await appendEvent(session, ctx, { action: "login.succeeded", target_kind: "actor", target_id: actor._id, payload: {} });
          return s;
        });
        return { ok: true, session: sess };
      } catch (err) {
        ctx.actor = savedActor; ctx.session = savedSession;
        throw err;
      }
    },

    /** Emits: session.revoked */
    async logout(ctx) {
      if (!ctx.session) throw new Error("logout: no active session");
      await withTx(async (session) => {
        await C("sessions").updateOne({ _id: ctx.session._id }, { $set: { revoked_at: now() } }, { session });
        await appendEvent(session, ctx, { action: "session.revoked", target_kind: "session", target_id: ctx.session._id, payload: {} });
      });
    },

    // ── Attributed Permissions Admin (APA) ───────────────────────────────────

    /** Emits: grant.issued */
    async grantPermission(ctx, { grantee_actor_id, permission_id, scope = "all" }) {
      if (!ctx.actor) throw new Error("grantPermission: authenticated actor required");
      return withTx(async (session) => {
        await fkExists("actors", grantee_actor_id, session, "grant.grantee");
        await fkExists("permissions", permission_id, session, "grant.permission");
        const grant = {
          _id: await nextId("grants", session),
          grantor_actor_id: ctx.actor._id, grantee_actor_id, permission_id, scope,
          issued_at: now(), revoked_at: null, revoke_reason: null,
        };
        await C("grants").insertOne(grant, { session });
        await appendEvent(session, ctx, {
          action: "grant.issued", target_kind: "grant", target_id: grant._id,
          payload: { grantee_actor_id, permission_id, scope },
        });
        return grant;
      });
    },

    /** Emits: grant.revoked */
    async revokeGrant(ctx, { grant_id, reason }) {
      if (!ctx.actor) throw new Error("revokeGrant: authenticated actor required");
      await withTx(async (session) => {
        await C("grants").updateOne({ _id: grant_id }, { $set: { revoked_at: now(), revoke_reason: reason } }, { session });
        await appendEvent(session, ctx, { action: "grant.revoked", target_kind: "grant", target_id: grant_id, payload: { reason } });
      });
    },

    // ── Regulated clinical actions ───────────────────────────────────────────

    /** Emits: subject.enrolled */
    async enrollSubject(ctx, { study_id, prefix, notes = null }) {
      if (!ctx.actor) throw new Error("enrollSubject: authenticated actor required");
      return withTx(async (session) => {
        await fkExists("studies", study_id, session, "subject.study");
        const n = await C("subjects").countDocuments({ subject_code: { $regex: `^${prefix}-` } }, { session });
        const subject_code = `${prefix}-${String(n + 1).padStart(3, "0")}`;
        const subject = {
          _id: await nextId("subjects", session),
          study_id, subject_code, status: "screening",
          enrolled_by_actor_id: ctx.actor._id, enrolled_at: now(), notes,
        };
        await C("subjects").insertOne(subject, { session });
        await appendEvent(session, ctx, { action: "subject.enrolled", target_kind: "subject", target_id: subject._id, payload: { study_id, subject_code } });
        return subject;
      });
    },

    /** Emits: visit.recorded */
    async recordVisit(ctx, { subject_id, visit_kind, notes = null }) {
      if (!ctx.actor) throw new Error("recordVisit: authenticated actor required");
      return withTx(async (session) => {
        await fkExists("subjects", subject_id, session, "visit.subject");
        const visit = {
          _id: await nextId("visits", session),
          subject_id, visit_kind, recorded_by_actor_id: ctx.actor._id, recorded_at: now(), notes,
        };
        await C("visits").insertOne(visit, { session });
        await appendEvent(session, ctx, { action: "visit.recorded", target_kind: "visit", target_id: visit._id, payload: { subject_id, visit_kind } });
        return visit;
      });
    },

    // ── reads (used by the actions adapter + checks) ─────────────────────────
    permissionByCode: (code) => C("permissions").findOne({ code }),
    studyByProtocol: (p) => C("studies").findOne({ protocol_number: p }),

    /** Re-compute the chain from event #1 (same construction as the validator). */
    async verifyChain() {
      const rows = await C("event_log").find().sort({ _id: 1 }).toArray();
      let count = 0;
      for (const row of rows) {
        const expected = hashEvent({
          id: row._id, occurred_at: row.occurred_at, actor_id: row.actor_id, session_id: row.session_id,
          action: row.action, target_kind: row.target_kind, target_id: row.target_id,
          payload_json: row.payload_json, prev_hash: row.prev_hash,
        });
        if (expected !== row.this_hash) return { ok: false, at: row._id, expected, found: row.this_hash };
        count++;
      }
      return { ok: true, count };
    },

    async close() { await client.close(); },
  };
  return api;
}
