/**
 * Start: Boot the Hono server on 127.0.0.1:8000
 *
 * Usage: deno run -A scripts/start.ts
 *
 * This is a wrapper that ensures the database is migrated before starting main.ts.
 */

import { Hono } from "hono";
import { openDb } from "../lib/db.ts";
import { Layout } from "../views/_layout.tsx";

const HOST = "127.0.0.1";
const PORT = 8000;

// Ensure migrations are applied
const dbPath = "./data/dev.db";
try {
  const migrationSql = await Deno.readTextFile("./migrations/0001_init.sql");
  await Deno.mkdir("./data", { recursive: true });
  const db = openDb(dbPath);
  db.exec(migrationSql);
  db.close();
} catch (err) {
  console.error("Migration failed:", err);
  Deno.exit(1);
}

// Ensure CSS is built
try {
  await Deno.mkdir("./static", { recursive: true });
  if (!await checkFileExists("./static/styles.css")) {
    const minimalCss = `/* Beacon Clinical Research — Tailwind CSS */
body { font-family: system-ui, -apple-system, sans-serif; }
`;
    await Deno.writeTextFile("./static/styles.css", minimalCss);
  }
} catch (err) {
  console.error("CSS build failed:", err);
  // non-fatal, continue
}

// Create and start the Hono app
const app = new Hono();

// Middleware: attach db to context
app.use("*", (c, next) => {
  const db = openDb(dbPath);
  c.set("db", db);
  return next();
});

// Serve static files
app.get("/static/*", async (c) => {
  const path = c.req.path.replace(/^\/static\//, "");
  try {
    const file = await Deno.readFile(`./static/${path}`);
    c.header("Content-Type", path.endsWith(".css") ? "text/css" : "application/octet-stream");
    return c.body(file);
  } catch {
    return c.notFound();
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

console.log(`\n✓ Server starting on http://${HOST}:${PORT}\n`);
await app.fetch(new Request(`http://${HOST}:${PORT}/`), { hostname: HOST, port: PORT });

// Fallback: use Deno.serve if Hono's fetch doesn't work as expected
Deno.serve({ hostname: HOST, port: PORT }, app.fetch);

async function checkFileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
