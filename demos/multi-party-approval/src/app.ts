import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { currentActorMiddleware, type AppVariables } from "./middleware/current_actor.ts";
import { auth } from "./routes/auth.ts";
import { pages } from "./routes/pages.tsx";
import { chains } from "./routes/chains.ts";
import { steps } from "./routes/steps.tsx";
import { audit } from "./routes/audit.ts";
import { verify } from "./routes/verify.ts";
import { admin } from "./routes/admin.ts";

const app = new Hono<{ Variables: AppVariables }>();

// Static assets
app.use("/styles.css", serveStatic({ path: "./public/styles.css" }));
app.use("/htmx.min.js", serveStatic({ path: "./public/htmx.min.js" }));

// Resolve current actor from cookie on every request
app.use("*", currentActorMiddleware);

// Auth
app.route("/", auth);

// HTML pages — registered BEFORE the JSON API so GET /chains/:id serves HTML
// unless the request carries Accept: application/json (pages.ts calls next()).
app.route("/", pages);

// JSON API
app.route("/chains", chains);
app.route("/chains", steps);   // step routes nest under /chains/:id/steps/:id
app.route("/audit", audit);
app.route("/verify", verify);
app.route("/admin", admin);    // dev-only tamper helper; gated behind ?dev=1 in the handler

export { app };
