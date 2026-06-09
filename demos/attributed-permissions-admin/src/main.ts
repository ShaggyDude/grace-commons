import { app } from "./app.ts";
import { PORT } from "./config.ts";

console.log(`APA Demo running at http://localhost:${PORT}/`);

Deno.serve({ hostname: "0.0.0.0", port: PORT }, app.fetch);
