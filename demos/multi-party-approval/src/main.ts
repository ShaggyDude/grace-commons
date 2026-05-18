import { app } from "./app.ts";

const port = parseInt(Deno.env.get("PORT") ?? "8000");

console.log(`Grace Commons Demo running at http://localhost:${port}/`);

Deno.serve({ port }, app.fetch);
