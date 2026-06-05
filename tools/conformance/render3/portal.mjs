// tools/conformance/render3/portal.mjs
//
// RENDER 3 — a third independent render of the clinical-trial-portal spec
// surface, on a genuinely different ENGINE: real PostgreSQL (via pglite, Postgres
// compiled to WASM, in-process — no server). Different again from renders 1 & 2:
//   • engine        — Postgres (renders 1 & 2 use SQLite)
//   • async API      — every op awaits (renders 1 & 2 are synchronous)
//   • schema         — members/logins/passcodes/sessions/grants_tbl/audit/…
//   • event vocab    — signin.ok / login.create / perm.grant / …
//   • password       — pbkdf2 (render 1: Argon2id, render 2: scrypt)
//   • correct chain  — genesis hashed WITH its seq (no render-1 genesis bug)
//
// This render exists to answer the skeptic directly: a second/third full render
// is NOT hard — it joins the pipeline by writing only two adapters. Headless.

import { PGlite } from "@electric-sql/pglite";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const hashSecret = (pw) => { const salt = randomBytes(16).toString("hex"); return `pbkdf2$${salt}$${pbkdf2Sync(pw, salt, 100000, 64, "sha256").toString("hex")}`; };
const verifySecret = (pw, stored) => {
  const [, salt, hex] = stored.split("$"); if (!salt || !hex) return false;
  const a = Buffer.from(hex, "hex"); const b = pbkdf2Sync(pw, salt, 100000, 64, "sha256");
  return a.length === b.length && timingSafeEqual(a, b);
};

const SCHEMA = `
CREATE TABLE members      (id serial PRIMARY KEY, email text NOT NULL UNIQUE, display_name text NOT NULL, registered_at text NOT NULL);
CREATE TABLE logins       (id serial PRIMARY KEY, member_id int NOT NULL REFERENCES members(id), created_at text NOT NULL);
CREATE TABLE passcodes    (id serial PRIMARY KEY, login_id int NOT NULL REFERENCES logins(id), scheme text NOT NULL, digest text NOT NULL, created_at text NOT NULL, disabled_at text);
CREATE TABLE sessions     (id serial PRIMARY KEY, login_id int NOT NULL REFERENCES logins(id), ticket text NOT NULL UNIQUE, opened_at text NOT NULL, closes_at text NOT NULL, closed_at text);
CREATE TABLE perms        (id serial PRIMARY KEY, code text NOT NULL UNIQUE, label text NOT NULL);
CREATE TABLE grants_tbl   (id serial PRIMARY KEY, granter_id int NOT NULL REFERENCES logins(id), holder_id int NOT NULL REFERENCES logins(id), perm_id int NOT NULL REFERENCES perms(id), scope text NOT NULL DEFAULT 'all', made_at text NOT NULL, undone_at text, undo_reason text);
CREATE TABLE invitations  (id serial PRIMARY KEY, member_id int NOT NULL REFERENCES members(id), role text NOT NULL, ticket text NOT NULL UNIQUE, sent_by int NOT NULL REFERENCES logins(id), sent_at text NOT NULL, expires_at text NOT NULL, taken_at text, taken_by int REFERENCES logins(id), cancelled_at text);
CREATE TABLE audit        (seq int PRIMARY KEY, ts text NOT NULL, login_id int, session_id int, kind text NOT NULL, ref_type text, ref_id int, data text NOT NULL DEFAULT '{}', prev text NOT NULL, mac text NOT NULL UNIQUE);
CREATE TABLE retention_cfg(id int PRIMARY KEY CHECK (id=1), days int NOT NULL DEFAULT 2555, filter_reads int NOT NULL DEFAULT 0);
CREATE TABLE trials       (id serial PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, created_at text NOT NULL);
CREATE TABLE enrollees    (id serial PRIMARY KEY, trial_id int NOT NULL REFERENCES trials(id), code text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'screening', enrolled_by int NOT NULL REFERENCES logins(id), enrolled_at text NOT NULL);
CREATE TABLE visits_tbl   (id serial PRIMARY KEY, enrollee_id int NOT NULL REFERENCES enrollees(id), kind text NOT NULL, logged_by int NOT NULL REFERENCES logins(id), logged_at text NOT NULL);
`;

const CAPS = [
  ["invite_actor", "Invite a coordinator"], ["grant_permission", "Manage grants on others"],
  ["enroll_subject", "Enroll a subject"], ["record_visit", "Record a study visit"], ["view_audit", "View the audit log"],
];

export function open(dir) {
  const db = new PGlite(dir);
  const now = () => new Date().toISOString();
  const ticket = () => randomBytes(24).toString("hex");
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const permId = async (code) => (await one("SELECT id FROM perms WHERE code = $1", [code])).id;

  async function append(ctx, { kind, ref_type = null, ref_id = null, data = {}, ts = null }) {
    const prev = (await one("SELECT mac FROM audit ORDER BY seq DESC LIMIT 1"))?.mac ?? "";
    const seq = Number((await one("SELECT COALESCE(MAX(seq),0) AS m FROM audit")).m) + 1;
    const at = ts ?? now();
    const dataStr = canon(data);
    const mac = sha256(canon({ seq, ts: at, login_id: ctx.login_id ?? null, session_id: ctx.session_id ?? null, kind, ref_type, ref_id, data: dataStr, prev }));
    await db.query(`INSERT INTO audit (seq,ts,login_id,session_id,kind,ref_type,ref_id,data,prev,mac)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [seq, at, ctx.login_id ?? null, ctx.session_id ?? null, kind, ref_type, ref_id, dataStr, prev, mac]);
    return seq;
  }

  const api = {
    db,

    async migrate() { await db.exec(SCHEMA); },

    async seed() {
      const t = now();
      for (const [code, label] of CAPS) await db.query("INSERT INTO perms (code,label) VALUES ($1,$2)", [code, label]);
      await db.query("INSERT INTO trials (code,name,created_at) VALUES ('BCN-OX-201','Beacon Oncology Phase II',$1)", [t]);
      await db.query("INSERT INTO retention_cfg (id,days,filter_reads) VALUES (1,2555,0)");
      const mkLogin = async (email, name, pw) => {
        const mid = (await one("INSERT INTO members (email,display_name,registered_at) VALUES ($1,$2,$3) RETURNING id", [email, name, t])).id;
        const lid = (await one("INSERT INTO logins (member_id,created_at) VALUES ($1,$2) RETURNING id", [mid, t])).id;
        await db.query("INSERT INTO passcodes (login_id,scheme,digest,created_at) VALUES ($1,'pbkdf2',$2,$3)", [lid, hashSecret(pw), t]);
        return lid;
      };
      const pi = await mkLogin("anya@beacon.clinical", "Dr. Anya Okonkwo", "demo-pi");
      const cra = await mkLogin("jordan@beacon.clinical", "Jordan Lee", "demo-cra");
      const bootGrant = async (holder, code, scope) =>
        db.query("INSERT INTO grants_tbl (granter_id,holder_id,perm_id,scope,made_at) VALUES ($1,$2,$3,$4,$5)", [pi, holder, await permId(code), scope, t]);
      for (const c of ["invite_actor", "grant_permission", "enroll_subject", "record_visit"]) await bootGrant(pi, c, "all");
      await bootGrant(pi, "view_audit", "own");
      await bootGrant(cra, "view_audit", "all");
      // genesis — backdated, anonymous, correct mac (WITH seq).
      const at = new Date(Date.now() - 8 * 365.25 * 86_400_000).toISOString();
      await append({}, { kind: "audit.genesis", ref_type: "trial", data: { note: "Protocol BCN-OX-201 registered." }, ts: at });
    },

    async authenticate(ctx, { email, password }) {
      const member = await one("SELECT * FROM members WHERE email = $1", [email]);
      const login = member && await one("SELECT * FROM logins WHERE member_id = $1", [member.id]);
      const pass = login && await one("SELECT * FROM passcodes WHERE login_id = $1 AND disabled_at IS NULL", [login.id]);
      if (!login || !pass || !verifySecret(password, pass.digest)) {
        await append({}, { kind: "signin.no", data: { email, reason: !login ? "unknown" : "bad_passcode" } });
        return { ok: false };
      }
      const sid = (await one("INSERT INTO sessions (login_id,ticket,opened_at,closes_at) VALUES ($1,$2,$3,$4) RETURNING id",
        [login.id, ticket(), now(), new Date(Date.now() + 7 * 86_400_000).toISOString()])).id;
      ctx.login_id = login.id; ctx.session_id = sid;
      await append(ctx, { kind: "signin.ok", ref_type: "login", ref_id: login.id, data: {} });
      return { ok: true, login_id: login.id };
    },

    async invite(ctx, { email, full_name, role }) {
      let member = await one("SELECT * FROM members WHERE email = $1", [email]);
      if (!member) member = await one("INSERT INTO members (email,display_name,registered_at) VALUES ($1,$2,$3) RETURNING *", [email, full_name, now()]);
      const tk = ticket();
      const inv = await one(`INSERT INTO invitations (member_id,role,ticket,sent_by,sent_at,expires_at)
                             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [member.id, role, tk, ctx.login_id, now(), new Date(Date.now() + 7 * 86_400_000).toISOString()]);
      await append(ctx, { kind: "member.invite", ref_type: "invitation", ref_id: inv.id, data: { email, full_name, role } });
      return { invite_id: inv.id, ticket: tk };
    },

    async onboard(ctx, { ticket: tk, password }) {
      const inv = await one("SELECT * FROM invitations WHERE ticket = $1", [tk]);
      if (!inv) throw new Error("onboard: invitation not found");
      if (inv.taken_at || inv.cancelled_at) throw new Error("onboard: invitation already resolved");
      const lid = (await one("INSERT INTO logins (member_id,created_at) VALUES ($1,$2) RETURNING id", [inv.member_id, now()])).id;
      await db.query("INSERT INTO passcodes (login_id,scheme,digest,created_at) VALUES ($1,'pbkdf2',$2,$3)", [lid, hashSecret(password), now()]);
      await db.query("UPDATE invitations SET taken_at=$1, taken_by=$2 WHERE id=$3", [now(), lid, inv.id]);
      const sid = (await one("INSERT INTO sessions (login_id,ticket,opened_at,closes_at) VALUES ($1,$2,$3,$4) RETURNING id",
        [lid, ticket(), now(), new Date(Date.now() + 7 * 86_400_000).toISOString()])).id;
      ctx.login_id = lid; ctx.session_id = sid;
      await append(ctx, { kind: "member.join-accept", ref_type: "invitation", ref_id: inv.id, data: { role: inv.role } });
      await append(ctx, { kind: "login.create", ref_type: "login", ref_id: lid, data: { member_id: inv.member_id, via_invitation_id: inv.id } });
      await append(ctx, { kind: "passcode.create", ref_type: "passcode", ref_id: null, data: { scheme: "pbkdf2" } });
      await append(ctx, { kind: "session.open", ref_type: "session", ref_id: sid, data: { login_id: lid, via: "onboard" } });
      return { login_id: lid };
    },

    async grant(ctx, { holder_id, perm_code, scope }) {
      const gid = (await one(`INSERT INTO grants_tbl (granter_id,holder_id,perm_id,scope,made_at)
                              VALUES ($1,$2,$3,$4,$5) RETURNING id`, [ctx.login_id, holder_id, await permId(perm_code), scope ?? "all", now()])).id;
      await append(ctx, { kind: "perm.grant", ref_type: "grant", ref_id: gid, data: { holder_id, perm: perm_code, scope: scope ?? "all" } });
      return { grant_id: gid };
    },

    async rescind(ctx, { grant_id, reason }) {
      await db.query("UPDATE grants_tbl SET undone_at=$1, undo_reason=$2 WHERE id=$3", [now(), reason, grant_id]);
      await append(ctx, { kind: "perm.undo", ref_type: "grant", ref_id: grant_id, data: { reason } });
      return {};
    },

    async enroll(ctx, { prefix }) {
      const trial = await one("SELECT id FROM trials WHERE code='BCN-OX-201'");
      const n = Number((await one("SELECT COUNT(*) AS c FROM enrollees WHERE trial_id=$1", [trial.id])).c) + 1;
      const code = `${prefix}-${String(n).padStart(3, "0")}`;
      const eid = (await one(`INSERT INTO enrollees (trial_id,code,status,enrolled_by,enrolled_at)
                              VALUES ($1,$2,'screening',$3,$4) RETURNING id`, [trial.id, code, ctx.login_id, now()])).id;
      await append(ctx, { kind: "enrollee.add", ref_type: "enrollee", ref_id: eid, data: { trial_id: trial.id, code } });
      return { enrollee_id: eid, code };
    },

    async encounter(ctx, { enrollee_id, kind }) {
      const vid = (await one(`INSERT INTO visits_tbl (enrollee_id,kind,logged_by,logged_at)
                              VALUES ($1,$2,$3,$4) RETURNING id`, [enrollee_id, kind, ctx.login_id, now()])).id;
      await append(ctx, { kind: "visit.add", ref_type: "visit", ref_id: vid, data: { enrollee_id, kind } });
      return { visit_id: vid };
    },

    async signOut(ctx) {
      await db.query("UPDATE sessions SET closed_at=$1 WHERE id=$2", [now(), ctx.session_id]);
      await append(ctx, { kind: "session.close", ref_type: "session", ref_id: ctx.session_id, data: {} });
      return {};
    },

    async close() { await db.close(); },
  };
  return api;
}
