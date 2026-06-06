/**
 * lib/db.ts — the database seam.
 *
 * Speaks PostgreSQL through ONE `query(text, params)` interface, backed by:
 *   • PGlite (embedded Postgres-in-WASM) by default — zero setup, single
 *     in-process backend = the §4 single-writer model, used for local dev and CI.
 *   • node-postgres (`pg`) when DATABASE_URL is set — a real server for deploy.
 * Both are raw SQL, no ORM (BUILD_PLAN Decision 1 / first-render A.14). The
 * postgres.js choice in the plan is swapped for pg/pglite because they share the
 * `query(text, $params)` API, so domain/composition is one code path. Logged in
 * CORNERS.md.
 *
 * The write path (`withTx`) takes the global audit advisory lock as its FIRST
 * statement, so every mutation totally orders against every other — reproducing
 * the SQLite single-writer guarantee the audit chain assumes, as an explicit
 * named mechanism (BUILD_PLAN §4).
 */

export interface Actor { id: number; party_id: number; display_name?: string }
export interface Session { id: number; actor_id: number; token: string }
export interface Ctx { actor: Actor | null; session: Session | null }
export interface Queryable { query<T = any>(text: string, params?: any[]): Promise<T[]> }
export interface Tx extends Queryable { ctx: Ctx }

// A fixed app-wide 64-bit constant — "BEACON_AUDIT_LOCK" (BUILD_PLAN §4.2).
const BEACON_AUDIT_LOCK = 7423001;

interface Backend {
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
  exec(sql: string): Promise<void>;   // multi-statement DDL (migrations)
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

const G = globalThis as any; // memoize across Next hot-reloads / module reloads

// ── PGlite (embedded) backend ────────────────────────────────────────────────
async function pgliteBackend(): Promise<Backend> {
  if (!G.__beaconPglite) {
    const { PGlite } = await import("@electric-sql/pglite");
    // A persistent dir by default (./data/pg, git-ignored); PGLITE_DIR overrides;
    // "memory://" for an ephemeral instance (tests).
    const dir = process.env.PGLITE_DIR ?? "./data/pg";
    if (!dir.includes("://")) {
      // PGlite mkdir's its data dir non-recursively, so the parent must exist.
      const { mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(dir), { recursive: true });
    }
    // Parse int8/BIGINT (type OID 20) as a JS number, not a string — so ids are
    // numbers everywhere (table rows AND the ids embedded in audit payloads),
    // matching render 1 (SQLite returned integers as numbers). Demo ids are well
    // within Number.MAX_SAFE_INTEGER.
    G.__beaconPglite = new PGlite(dir, { parsers: { 20: (v: string) => parseInt(v, 10) } });
  }
  const pg: any = G.__beaconPglite;
  const query = async <T>(text: string, params: any[] = []): Promise<T[]> =>
    (await pg.query(text, params)).rows as T[];
  return {
    query,
    async exec(sql) { await pg.exec(sql); },
    async tx(fn) {
      return await pg.transaction(async (t: any) => {
        await t.query("SELECT pg_advisory_xact_lock($1)", [BEACON_AUDIT_LOCK]);
        return await fn({ query: async <T>(text: string, params: any[] = []) => (await t.query(text, params)).rows as T[] });
      });
    },
  };
}

// ── node-postgres (real server) backend ──────────────────────────────────────
async function pgBackend(url: string): Promise<Backend> {
  const pg = await import("pg");
  pg.types.setTypeParser(20, (v: string) => parseInt(v, 10)); // int8/BIGINT → JS number (see pglite note above)
  const { Pool } = pg;
  if (!G.__beaconPgPool) G.__beaconPgPool = new Pool({ connectionString: url, max: 10 });        // reads
  if (!G.__beaconPgWriter) G.__beaconPgWriter = new Pool({ connectionString: url, max: 1 });     // single session writer
  const pool: any = G.__beaconPgPool, writer: any = G.__beaconPgWriter;
  const query = async <T>(text: string, params: any[] = []): Promise<T[]> => (await pool.query(text, params)).rows as T[];
  return {
    query,
    async exec(sql) { await pool.query(sql); },   // simple-query protocol runs multiple statements
    async tx(fn) {
      const client = await writer.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [BEACON_AUDIT_LOCK]);
        const r = await fn({ query: async <T>(text: string, params: any[] = []) => (await client.query(text, params)).rows as T[] });
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

function backend(): Promise<Backend> {
  if (!G.__beaconBackend) {
    const url = process.env.DATABASE_URL;
    G.__beaconBackend = url ? pgBackend(url) : pgliteBackend();
  }
  return G.__beaconBackend;
}

/** Top-level read query (reads use the pool / embedded instance). */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  return (await backend()).query<T>(text, params);
}

/** Run multi-statement DDL (migrations). */
export async function exec(sql: string): Promise<void> {
  return (await backend()).exec(sql);
}

/** A Queryable for atom read helpers outside a transaction. */
export const db: Queryable = { query };

/**
 * Write-path transaction. Holds the global audit advisory lock for its body
 * (atom writes + appendEvent), commits on success, rolls back on throw.
 * NOTE: this is ASYNC (the driver is async) — so render 1's "no async inside
 * withTx" rule is relaxed; but password hashing still happens BEFORE withTx to
 * keep the global lock hold-time minimal (BUILD_PLAN §4.2 / §7.1).
 */
export async function withTx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const b = await backend();
  return await b.tx(async (q) => fn({ query: q.query, ctx }));
}
