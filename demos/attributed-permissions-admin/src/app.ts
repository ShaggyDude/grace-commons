import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { currentActorMiddleware, type AppVariables } from "./middleware/current_actor.ts";
import { auth } from "./routes/auth.ts";
import { grants } from "./routes/grants.tsx";
import { verify } from "./routes/verify.tsx";
import { orphans } from "./routes/orphans.tsx";

const app = new Hono<{ Variables: AppVariables }>();

// Static assets
app.use("/styles.css", serveStatic({ path: "./public/styles.css" }));
app.use("/htmx.min.js", serveStatic({ path: "./public/htmx.min.js" }));

// Resolve current actor on every request
app.use("*", currentActorMiddleware);

app.route("/", auth);
app.route("/", grants);   // GET /, GET /grants/new, POST /grants, GET /grants/:id, POST /grants/:id/revoke
app.route("/verify", verify);
app.route("/", orphans);

export { app };
