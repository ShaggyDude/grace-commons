// tools/conformance/render2/portal.mjs
//
// RENDER 2 — a second, independent render of the clinical-trial-portal spec
// surface (External Onboarding, Login, Session-Gated Authorization, Attributed
// Permissions Admin, Audit Trail). Deliberately DIFFERENT in shape from render 1
// so that cross-render agreement actually tests spec-carried meaning rather than
// shared code:
//   • different stack            — pure Node (node:sqlite + node:crypto), no Deno/jsr
//   • different schema           — people/accounts/secrets/tokens/authorizations/
//                                  invites/ledger/participants/encounters
//   • different event vocabulary — auth.ok / account.open / authz.grant / …
//   • different password method  — scrypt (render 1 uses Argon2id)
//   • CORRECTED hash chain       — the genesis row is hashed WITH its seq, so
//                                  render 2 has none of render 1's genesis bug.
//
// Headless: the ghost scenario drives it through an actions adapter; the
// validator reads its store through a render-2 adapter. No UI.

import { DatabaseSync } from "node:sqlite";
import { createHash, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// ── render-2 primitives ──────────────────────────────────────────────────────
const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const hashSecret = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString("hex")}`;
};
const verifySecret = (pw, stored) => {
  const [, salt, hex] = stored.split("$");
  if (!salt || !hex) return false;
  const a = Buffer.from(hex, "hex");
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
};

const SCHEMA = `
CREATE TABLE people       (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, joined_at TEXT NOT NULL);
CREATE TABLE accounts     (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), opened_at TEXT NOT NULL);
CREATE TABLE secrets      (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), method TEXT NOT NULL, material TEXT NOT NULL, set_at TEXT NOT NULL, retired_at TEXT);
CREATE TABLE tokens       (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), value TEXT NOT NULL UNIQUE, started_at TEXT NOT NULL, ends_at TEXT NOT NULL, ended_at TEXT);
CREATE TABLE capabilities (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL);
CREATE TABLE authorizations (id INTEGER PRIMARY KEY, grantor_id INTEGER NOT NULL REFERENCES accounts(id), holder_id INTEGER NOT NULL REFERENCES accounts(id), capability_id INTEGER NOT NULL REFERENCES capabilities(id), scope TEXT NOT NULL DEFAULT 'all', granted_at TEXT NOT NULL, rescinded_at TEXT, rescind_note TEXT);
CREATE TABLE invites      (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), role TEXT NOT NULL, secret_value TEXT NOT NULL UNIQUE, sent_by_id INTEGER NOT NULL REFERENCES accounts(id), sent_at TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT, accepted_by_id INTEGER REFERENCES accounts(id), voided_at TEXT);
CREATE TABLE ledger       (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, account_id INTEGER, token_id INTEGER, kind TEXT NOT NULL, subject_type TEXT, subject_ref INTEGER, body TEXT NOT NULL DEFAULT '{}', prior_digest TEXT NOT NULL, digest TEXT NOT NULL UNIQUE);
CREATE TABLE retention    (id INTEGER PRIMARY KEY CHECK (id=1), horizon_days INTEGER NOT NULL DEFAULT 2555, filter_on_read INTEGER NOT NULL DEFAULT 0);
CREATE TABLE studies      (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE participants (id INTEGER PRIMARY KEY, study_id INTEGER NOT NULL REFERENCES studies(id), code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'screening', enrolled_by_id INTEGER NOT NULL REFERENCES accounts(id), enrolled_at TEXT NOT NULL);
CREATE TABLE encounters   (id INTEGER PRIMARY KEY, participant_id INTEGER NOT NULL REFERENCES participants(id), kind TEXT NOT NULL, logged_by_id INTEGER NOT NULL REFERENCES accounts(id), logged_at TEXT NOT NULL);
`;

const CAPS = [
  ["invite_actor", "Invite a coordinator"], ["grant_permission", "Manage grants on others"],
  ["enroll_subject", "Enroll a subject"], ["record_visit", "Record a study visit"], ["view_audit", "View the audit log"],
];

export function open(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");

  const now = () => new Date().toISOString();
  const tokenValue = () => randomBytes(24).toString("hex");

  /** Append a ledger event — genesis included, hashed WITH seq (no render-1 bug). */
  function append(ctx, { kind, subject_type = null, subject_ref = null, body = {} }) {
    const prior = db.prepare("SELECT digest FROM ledger ORDER BY seq DESC LIMIT 1").get();
    const prior_digest = prior?.digest ?? "";
    const seq = (db.prepare("SELECT COALESCE(MAX(seq),0) AS m FROM ledger").get().m) + 1;
    const at = now();
    const bodyStr = canon(body);
    const digest = sha256(canon({
      seq, at, account_id: ctx.account_id ?? null, token_id: ctx.token_id ?? null,
      kind, subject_type, subject_ref, body: bodyStr, prior_digest,
    }));
    db.prepare(`INSERT INTO ledger (seq, at, account_id, token_id, kind, subject_type, subject_ref, body, prior_digest, digest)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(seq, at, ctx.account_id ?? null, ctx.token_id ?? null, kind, subject_type, subject_ref, bodyStr, prior_digest, digest);
    return seq;
  }

  function withTx(fn) {
    db.exec("BEGIN");
    try { const r = fn(); db.exec("COMMIT"); return r; }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  }

  const capId = (code) => db.prepare("SELECT id FROM capabilities WHERE code = ?").get(code)?.id;

  const api = {
    db,

    migrate() { db.exec(SCHEMA); },

    seed() {
      const t = now();
      // capabilities, study, retention
      for (const [code, label] of CAPS) db.prepare("INSERT INTO capabilities (code,label) VALUES (?,?)").run(code, label);
      db.prepare("INSERT INTO studies (code,name,created_at) VALUES ('BCN-OX-201','Beacon Oncology Phase II',?)").run(t);
      db.prepare("INSERT INTO retention (id,horizon_days,filter_on_read) VALUES (1,2555,0)").run();
      // bootstrap identities (the seam — no ledger events)
      const mkAccount = (email, name, pw) => {
        const pid = db.prepare("INSERT INTO people (email,full_name,joined_at) VALUES (?,?,?) RETURNING id").get(email, name, t).id;
        const aid = db.prepare("INSERT INTO accounts (person_id,opened_at) VALUES (?,?) RETURNING id").get(pid, t).id;
        db.prepare("INSERT INTO secrets (account_id,method,material,set_at) VALUES (?,?,?,?)").run(aid, "scrypt", hashSecret(pw), t);
        return aid;
      };
      const pi = mkAccount("anya@beacon.clinical", "Dr. Anya Okonkwo", "demo-pi");
      const cra = mkAccount("jordan@beacon.clinical", "Jordan Lee", "demo-cra");
      const grantBoot = (holder, code, scope) =>
        db.prepare("INSERT INTO authorizations (grantor_id,holder_id,capability_id,scope,granted_at) VALUES (?,?,?,?,?)")
          .run(pi, holder, capId(code), scope, t);
      for (const c of ["invite_actor", "grant_permission", "enroll_subject", "record_visit"]) grantBoot(pi, c, "all");
      grantBoot(pi, "view_audit", "own");
      grantBoot(cra, "view_audit", "all");
      // genesis ledger event — backdated, anonymous, hashed correctly (WITH seq).
      const at = new Date(Date.now() - 8 * 365.25 * 86_400_000).toISOString();
      const body = canon({ note: "Protocol BCN-OX-201 registered." });
      const digest = sha256(canon({ seq: 1, at, account_id: null, token_id: null, kind: "ledger.genesis", subject_type: "study", subject_ref: null, body, prior_digest: "" }));
      db.prepare(`INSERT INTO ledger (seq,at,account_id,token_id,kind,subject_type,subject_ref,body,prior_digest,digest)
                  VALUES (1,?,NULL,NULL,'ledger.genesis','study',NULL,?,'',?)`).run(at, body, digest);
    },

    // ── composition ops (each in a transaction; ctx = {account_id, token_id}) ──

    authenticate(ctx, { email, password }) {
      const person = db.prepare("SELECT * FROM people WHERE email = ?").get(email);
      const account = person && db.prepare("SELECT * FROM accounts WHERE person_id = ?").get(person.id);
      const secret = account && db.prepare("SELECT * FROM secrets WHERE account_id = ? AND retired_at IS NULL").get(account.id);
      if (!account || !secret || !verifySecret(password, secret.material)) {
        withTx(() => append({}, { kind: "auth.fail", body: { email, reason: !account ? "unknown" : "bad_secret" } }));
        return { ok: false };
      }
      return withTx(() => {
        const value = tokenValue();
        const tid = db.prepare("INSERT INTO tokens (account_id,value,started_at,ends_at) VALUES (?,?,?,?) RETURNING id")
          .get(account.id, value, now(), new Date(Date.now() + 7 * 86_400_000).toISOString()).id;
        ctx.account_id = account.id; ctx.token_id = tid;
        append(ctx, { kind: "auth.ok", subject_type: "account", subject_ref: account.id, body: {} });
        return { ok: true, account_id: account.id };
      });
    },

    invite(ctx, { email, full_name, role }) {
      return withTx(() => {
        let person = db.prepare("SELECT * FROM people WHERE email = ?").get(email);
        if (!person) person = db.prepare("INSERT INTO people (email,full_name,joined_at) VALUES (?,?,?) RETURNING *").get(email, full_name, now());
        const value = tokenValue();
        const inv = db.prepare(`INSERT INTO invites (person_id,role,secret_value,sent_by_id,sent_at,expires_at)
                                VALUES (?,?,?,?,?,?) RETURNING *`)
          .get(person.id, role, value, ctx.account_id, now(), new Date(Date.now() + 7 * 86_400_000).toISOString());
        append(ctx, { kind: "account.invite", subject_type: "invite", subject_ref: inv.id, body: { email, full_name, role } });
        return { invite_id: inv.id, value };
      });
    },

    onboard(ctx, { value, password }) {
      return withTx(() => {
        const inv = db.prepare("SELECT * FROM invites WHERE secret_value = ?").get(value);
        if (!inv) throw new Error("onboard: invite not found");
        if (inv.accepted_at || inv.voided_at) throw new Error("onboard: invite already resolved");
        const aid = db.prepare("INSERT INTO accounts (person_id,opened_at) VALUES (?,?) RETURNING id").get(inv.person_id, now()).id;
        db.prepare("INSERT INTO secrets (account_id,method,material,set_at) VALUES (?,?,?,?)").run(aid, "scrypt", hashSecret(password), now());
        db.prepare("UPDATE invites SET accepted_at=?, accepted_by_id=? WHERE id=?").run(now(), aid, inv.id);
        const value2 = tokenValue();
        const tid = db.prepare("INSERT INTO tokens (account_id,value,started_at,ends_at) VALUES (?,?,?,?) RETURNING id")
          .get(aid, value2, now(), new Date(Date.now() + 7 * 86_400_000).toISOString()).id;
        ctx.account_id = aid; ctx.token_id = tid;
        append(ctx, { kind: "account.invite-accept", subject_type: "invite", subject_ref: inv.id, body: { role: inv.role } });
        append(ctx, { kind: "account.open", subject_type: "account", subject_ref: aid, body: { person_id: inv.person_id, via_invite_id: inv.id } });
        append(ctx, { kind: "secret.set", subject_type: "secret", subject_ref: null, body: { method: "scrypt" } });
        append(ctx, { kind: "session.start", subject_type: "token", subject_ref: tid, body: { account_id: aid, via: "onboard" } });
        return { account_id: aid };
      });
    },

    grant(ctx, { holder_id, capability_code, scope }) {
      return withTx(() => {
        const gid = db.prepare(`INSERT INTO authorizations (grantor_id,holder_id,capability_id,scope,granted_at)
                                VALUES (?,?,?,?,?) RETURNING id`).get(ctx.account_id, holder_id, capId(capability_code), scope ?? "all", now()).id;
        append(ctx, { kind: "authz.grant", subject_type: "authorization", subject_ref: gid, body: { holder_id, capability: capability_code, scope: scope ?? "all" } });
        return { grant_id: gid };
      });
    },

    rescind(ctx, { grant_id, note }) {
      return withTx(() => {
        db.prepare("UPDATE authorizations SET rescinded_at=?, rescind_note=? WHERE id=?").run(now(), note, grant_id);
        append(ctx, { kind: "authz.rescind", subject_type: "authorization", subject_ref: grant_id, body: { note } });
        return {};
      });
    },

    enroll(ctx, { prefix }) {
      return withTx(() => {
        const study = db.prepare("SELECT id FROM studies WHERE code='BCN-OX-201'").get();
        const n = db.prepare("SELECT COUNT(*) AS c FROM participants WHERE study_id=?").get(study.id).c + 1;
        const code = `${prefix}-${String(n).padStart(3, "0")}`;
        const pid = db.prepare(`INSERT INTO participants (study_id,code,status,enrolled_by_id,enrolled_at)
                                VALUES (?,?, 'screening', ?, ?) RETURNING id`).get(study.id, code, ctx.account_id, now()).id;
        append(ctx, { kind: "participant.enroll", subject_type: "participant", subject_ref: pid, body: { study_id: study.id, code } });
        return { participant_id: pid, code };
      });
    },

    encounter(ctx, { participant_id, kind }) {
      return withTx(() => {
        const eid = db.prepare(`INSERT INTO encounters (participant_id,kind,logged_by_id,logged_at)
                                VALUES (?,?,?,?) RETURNING id`).get(participant_id, kind, ctx.account_id, now()).id;
        append(ctx, { kind: "encounter.log", subject_type: "encounter", subject_ref: eid, body: { participant_id, kind } });
        return { encounter_id: eid };
      });
    },

    signOut(ctx) {
      return withTx(() => {
        db.prepare("UPDATE tokens SET ended_at=? WHERE id=?").run(now(), ctx.token_id);
        append(ctx, { kind: "session.end", subject_type: "token", subject_ref: ctx.token_id, body: {} });
        return {};
      });
    },

    close() { db.close(); },
  };
  return api;
}
