import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { currentActorMiddleware, type AppVariables } from "./middleware/current_actor.ts";
import { auth } from "./routes/auth.tsx";
import { grants } from "./routes/grants.tsx";
import { verify } from "./routes/verify.tsx";
import { orphans } from "./routes/orphans.tsx";

const app = new Hono<{ Variables: AppVariables }>();

// Static assets — served before auth middleware
app.use("/styles.css", serveStatic({ path: "./public/styles.css" }));
app.use("/htmx.min.js", serveStatic({ path: "./public/htmx.min.js" }));
app.use("/manifest.json", serveStatic({ path: "./public/manifest.json" }));
app.use("/sw.js", serveStatic({ path: "./public/sw.js" }));
app.use("/icon.svg", serveStatic({ path: "./public/icon.svg" }));

// Resolve current actor from session_token cookie on every request
app.use("*", currentActorMiddleware);

// Auth guard — redirect unauthenticated requests to /login.
// /login itself is exempt so the login page is always reachable.
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/login") return await next();
  const actor = c.get("actor");
  if (!actor) return c.redirect("/login");
  return await next();
});

// Routes
app.route("/", auth);    // GET /login, POST /login, POST /logout
app.route("/", grants);  // GET /, GET /grants/new, POST /grants, GET /grants/:id, POST /grants/:id/revoke
app.route("/verify", verify);
app.route("/", orphans);

export { app };
