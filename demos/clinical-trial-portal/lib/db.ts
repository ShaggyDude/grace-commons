import { Database } from "sqlite";

export type DB = Database;

export interface Actor { id: number; party_id: number; display_name: string; }
export interface Session { id: number; actor_id: number; token: string; }

/** Request-scoped context. Built by middleware, threaded into composition functions. */
export interface Ctx {
  db: DB;
  actor: Actor | null;       // null for anonymous (login, accept-invitation)
  session: Session | null;
}

/** Inside a transaction: tx.db is the same handle, tx.ctx carries actor/session. */
export interface Tx { db: DB; ctx: Ctx; }

export function openDb(path: string): DB {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

/** Run `fn` inside a SQLite transaction. Commits on success, rolls back on throw. */
export function withTx<T>(ctx: Ctx, fn: (tx: Tx) => T): T {
  ctx.db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn({ db: ctx.db, ctx });
    ctx.db.exec("COMMIT");
    return result;
  } catch (err) {
    ctx.db.exec("ROLLBACK");
    throw err;
  }
}
