// app/api/health/route.ts — liveness/readiness probe for the Fly deploy.
// Returns 200 only when the embedded DB actually answers, 503 otherwise — so a
// wedged machine (e.g. a half-open pglite, the stale-lock failure mode we hit once)
// gets restarted by Fly's health check instead of silently serving errors.
import { query } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await query("SELECT 1");
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("db-unavailable", { status: 503 });
  }
}
