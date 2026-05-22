/**
 * Beacon Clinical Research — Hono server entrypoint
 *
 * Usage: deno run -A main.ts
 * (Normally invoked via `deno task start`)
 *
 * Serves on 127.0.0.1:8000.
 * Auto-migrates on startup if database doesn't exist.
 */

import { Hono } from "hono";
import { openDb } from "./lib/db.ts";
import { Layout } from "./views/_layout.tsx";

const HOST = "127.0.0.1";
const PORT = 8000;
const DB_PATH = "./data/dev.db";

// Ensure database directory and migrations are applied
async function ensureDb() {
  try {
    await Deno.mkdir("./data", { recursive: true });
  } catch {
    // May already exist
  }

  try {
    await Deno.stat(DB_PATH);
    // DB exists, assume it's migrated
  } catch {
    // DB doesn't exist, run migration
    console.log("Database not found. Running migrations...");
    try {
      const migrationSql = await Deno.readTextFile("./migrations/0001_init.sql");
      const db = openDb(DB_PATH);
      db.exec(migrationSql);
      db.close();
      console.log("✓ Migration complete.");
    } catch (err) {
      console.error("Migration failed:", err);
      throw err;
    }
  }
}

// Ensure static directory and CSS exist
async function ensureStatic() {
  try {
    await Deno.mkdir("./static", { recursive: true });
  } catch {
    // May already exist
  }

  try {
    await Deno.stat("./static/styles.css");
    // CSS exists
  } catch {
    // CSS doesn't exist, create fallback
    console.log("CSS not found. Creating fallback styles...");
    const fallbackCss = `/* Beacon Clinical Research — Tailwind CSS (fallback) */
:root { color-scheme: light dark; }
body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; }
`;
    await Deno.writeTextFile("./static/styles.css", fallbackCss);
    console.log("✓ CSS ready (fallback).");
  }
}

await ensureDb();
await ensureStatic();

const app = new Hono();

// Middleware: attach db to context
app.use("*", (c, next) => {
  const db = openDb(DB_PATH);
  c.set("db", db);
  return next();
});

// Serve static files (CSS)
app.get("/static/styles.css", async (c) => {
  try {
    const css = await Deno.readTextFile("./static/styles.css");
    return c.text(css, 200, { "Content-Type": "text/css" });
  } catch {
    return c.text("Not found", 404);
  }
});

// Landing page
const LandingPage = () => (
  <Layout title="Home">
    <div class="text-center space-y-6 py-12">
      <h1 class="text-4xl font-bold">Beacon Clinical Research</h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        A Phase II oncology trial portal demonstrating Grace Commons compositions in a regulated clinical research system.
      </p>
      <p class="text-sm text-gray-500">
        Coming soon. Phase 0 scaffold ready for Phase 1 development.
      </p>
      <div class="mt-8">
        <a href="/login" class="inline-block bg-gray-900 text-white px-6 py-3 rounded hover:bg-gray-800">
          Log in
        </a>
      </div>
    </div>
  </Layout>
);

app.get("/", (c) => c.html(<LandingPage />));

// 404 fallback
app.notFound((c) => c.text("Not Found", 404));

console.log(`✓ Beacon server starting on http://${HOST}:${PORT}`);
Deno.serve({ hostname: HOST, port: PORT }, app.fetch);
