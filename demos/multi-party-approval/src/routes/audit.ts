// Audit routes — list events + verify one event.

import { Hono } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { permitted } from "../domain/permissions.ts";
import { verify_record } from "../domain/audit_trail.ts";
import { db } from "../db/client.ts";

const audit = new Hono<{ Variables: AppVariables }>();

// GET /audit — list audit events with optional filters
audit.get("/", (c) => {
  const actor = c.get("actor");
  if (!actor) return c.json({ error: "no actor selected" }, 401);
  if (permitted(actor.actor_ref, "chains:read") === "denied") {
    return c.json({ error: "permission-denied" }, 403);
  }

  const { chain_id, step_id, action_ref, from, to } = c.req.query();

  const conditions: string[] = [];
  const bindings: string[] = [];

  if (chain_id)   { conditions.push("chain_id = ?");       bindings.push(chain_id); }
  if (step_id)    { conditions.push("step_id = ?");         bindings.push(step_id); }
  if (action_ref) { conditions.push("action_ref = ?");      bindings.push(action_ref); }
  if (from)       { conditions.push("recorded_at >= ?");    bindings.push(from); }
  if (to)         { conditions.push("recorded_at <= ?");    bindings.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const events = db.prepare(`
    SELECT event_id, seq, action_ref, actor_ref, chain_id, step_id,
           recorded_at, data_json, retention_policy, retention_until,
           prev_row_hash, row_hash
    FROM audit_event ${where}
    ORDER BY seq DESC
    LIMIT 500
  `).all(...bindings);

  return c.json(events);
});

// GET /audit/:event_id/verify — recompute attestation + walk hash chain
audit.get("/:event_id/verify", (c) => {
  const actor = c.get("actor");
  if (!actor) return c.json({ error: "no actor selected" }, 401);
  if (permitted(actor.actor_ref, "chains:read") === "denied") {
    return c.json({ error: "permission-denied" }, 403);
  }

  const event_id = Number(c.req.param("event_id"));
  if (!Number.isInteger(event_id) || event_id < 1) {
    return c.json({ error: "invalid event_id" }, 400);
  }

  const result   = verify_record(event_id);
  const verified = result === "verified";

  // HTMX: return inline chip; the "Check" button target swaps its innerHTML
  if (c.req.header("HX-Request")) {
    const cls   = verified ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
    const label = verified ? "✓ verified" : "✗ tampered";
    return c.html(
      `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}">${label}</span>`,
    );
  }

  return c.json({ event_id, result, verified });
});

export { audit };
