/**
 * Beacon Clinical Research — Hono server entrypoint
 *
 * Usage: deno run -A main.ts
 * (Normally invoked via `deno task start` after `deno task migrate` and `deno task seed`)
 *
 * Architecture:
 *   Global middleware → opens SQLite db per request, sets c.var.db, closes after.
 *   requireSession   → validates session cookie, sets c.var.ctx.
 *   requirePermission → checks grant, sets c.var.granted_scope.
 *   Route handlers   → read ctx / db from context; call composition functions.
 */

import { Hono } from "hono";
import { openDb } from "./lib/db.ts";
import type { AppEnv } from "./lib/env.ts";
import { authRouter } from "./routes/auth.ts";
import { invitationsRouter } from "./routes/invitations.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { peopleRouter } from "./routes/people.ts";
import { subjectsRouter } from "./routes/subjects.ts";
import { auditRouter } from "./routes/audit.ts";

const HOST = "0.0.0.0";
const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
const DB_PATH = Deno.env.get("DB_PATH") ?? "./data/dev.db";

// ---------------------------------------------------------------------------
// Startup checks
// ---------------------------------------------------------------------------

async function ensureDb() {
  const dir = DB_PATH.substring(0, DB_PATH.lastIndexOf("/")) || ".";
  await Deno.mkdir(dir, { recursive: true }).catch(() => {});
  try {
    await Deno.stat(DB_PATH);
  } catch {
    console.log("Database not found — running migrations…");
    const sql = await Deno.readTextFile("./migrations/0001_init.sql");
    const db = openDb(DB_PATH);
    db.exec(sql);
    db.close();
    console.log("✓ Migration complete. Run `deno task seed` to seed accounts.");
  }
}

async function ensureStatic() {
  await Deno.mkdir("./static", { recursive: true }).catch(() => {});
  try {
    await Deno.stat("./static/styles.css");
  } catch {
    console.log("CSS not found — writing minimal fallback…");
    await Deno.writeTextFile(
      "./static/styles.css",
      "/* Beacon fallback — run: deno task css */\n",
    );
  }
}

await ensureDb();
await ensureStatic();

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<AppEnv>();

// ── Global: open db per request, close after ──────────────────────────────
app.use("*", async (c, next) => {
  const db = openDb(DB_PATH);
  c.set("db", db);
  try {
    await next();
  } finally {
    db.close();
  }
});

// ── Static files ──────────────────────────────────────────────────────────
app.get("/static/:file{.+}", async (c) => {
  const file = c.req.param("file");
  // Only allow files under ./static/ — no path traversal
  if (file.includes("..")) return c.text("Not Found", 404);
  try {
    const body = await Deno.readFile(`./static/${file}`);
    const ext = file.split(".").pop() ?? "";
    const mime = ext === "css" ? "text/css" : ext === "js" ? "text/javascript" : "application/octet-stream";
    return new Response(body, { headers: { "Content-Type": mime } });
  } catch {
    return c.text("Not Found", 404);
  }
});

// ── Landing page ──────────────────────────────────────────────────────────
app.get("/", (c) => c.redirect("/login"));

// ── Route modules ─────────────────────────────────────────────────────────
app.route("/", authRouter);
app.route("/", invitationsRouter);
app.route("/", dashboardRouter);
app.route("/", peopleRouter);
app.route("/", subjectsRouter);
app.route("/", auditRouter);

// ── 404 fallback ──────────────────────────────────────────────────────────
app.notFound((c) => c.text("Not Found", 404));

// ── Error handler ─────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.text("Internal Server Error", 500);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`✓ Beacon server starting on http://${HOST}:${PORT}`);
console.log("  PI:  anya@beacon.clinical  / demo-pi");
console.log("  CRA: jordan@beacon.clinical / demo-cra");

Deno.serve({ hostname: HOST, port: PORT }, app.fetch);
