import { app } from "./app.ts";
import { PORT } from "./config.ts";

console.log(`APA Demo running at http://localhost:${PORT}/`);

Deno.serve({ port: PORT }, app.fetch);
