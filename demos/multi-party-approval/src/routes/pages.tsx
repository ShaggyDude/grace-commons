// HTML page routes — browser navigation (no JSON).
//
// Mounted at "/" in app.ts BEFORE the JSON API routes so content-negotiation
// can fall through via next() when Accept: application/json is set.
//
// Routes:
//   GET  /                → chain list (ChainListPage)
//   GET  /chains/new      → new chain form (NewChainPage)
//   GET  /chains/:id      → chain detail (ChainDetailPage)  [pass-through on Accept:json]
//   GET  /me/in-tray      → active assignments (InTrayPage)
//   GET  /audit-ui        → audit log (AuditLogPage)

import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { listActors } from "../domain/actor.ts";
import { read_chain } from "../domain/chain.ts";
import { permitted } from "../domain/permissions.ts";
import { db } from "../db/client.ts";
import { ChainListPage } from "../views/chain_list.tsx";
import { ChainDetailPage } from "../views/chain_detail.tsx";
import { NewChainPage } from "../views/new_chain.tsx";
import { InTrayPage } from "../views/in_tray.tsx";
import type { InTrayItem } from "../views/in_tray.tsx";
import { AuditLogPage } from "../views/audit_log.tsx";
import type { AuditEventRow } from "../views/audit_log.tsx";

const pages = new Hono<{ Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// GET / — chain list
// ---------------------------------------------------------------------------
pages.get("/", (c) => {
  const actor  = c.get("actor");
  const actors = listActors();
  const stateFilter = c.req.query("state") || undefined;

  if (!actor) {
    return c.html(
      <ChainListPage chains={[]} actor={actor} actors={actors} stateFilter={stateFilter} />,
    );
  }

  const result = read_chain(actor.actor_ref, stateFilter ? { state: stateFilter } : {});
  const chains = "ok" in result ? result.ok : [];

  return c.html(
    <ChainListPage chains={chains} actor={actor} actors={actors} stateFilter={stateFilter} />,
  );
});

// ---------------------------------------------------------------------------
// GET /chains/new — initiate form
// (Must be registered before /chains/:chain_id or "new" matches as an id)
// ---------------------------------------------------------------------------
pages.get("/chains/new", (c) => {
  const actor  = c.get("actor");
  const actors = listActors();
  const error  = c.req.query("error") || undefined;
  return c.html(<NewChainPage actor={actor} actors={actors} error={error} />);
});

// ---------------------------------------------------------------------------
// GET /chains/:chain_id — chain detail
// Falls through to the JSON API when Accept: application/json.
// ---------------------------------------------------------------------------
pages.get("/chains/:chain_id", async (c: Context<{ Variables: AppVariables }>, next: Next) => {
  // Let JSON API clients through
  if (c.req.header("Accept")?.includes("application/json")) return next();

  const actor  = c.get("actor");
  const actors = listActors();

  if (!actor) return c.redirect("/");

  const chain_id = c.req.param("chain_id");
  const result   = read_chain(actor.actor_ref, { chain_id });

  if ("err" in result) {
    return result.err === "not-known"
      ? c.text("Chain not found", 404)
      : c.redirect("/");
  }
  if (result.ok.length === 0) return c.text("Chain not found", 404);

  const chain = result.ok[0];

  type EventRow = {
    event_id: number; seq: number; action_ref: string; actor_ref: string;
    chain_id: string | null; step_id: string | null; recorded_at: string;
    data_json: string; retention_policy: string; row_hash: string;
  };

  const events = db.prepare(`
    SELECT event_id, seq, action_ref, actor_ref, chain_id, step_id,
           recorded_at, data_json, retention_policy, row_hash
    FROM audit_event WHERE chain_id = ?
    ORDER BY seq DESC LIMIT 100
  `).all(chain_id) as EventRow[];

  return c.html(
    <ChainDetailPage chain={chain} actor={actor} actors={actors} events={events} />,
  );
});

// ---------------------------------------------------------------------------
// GET /me/in-tray — active assignments for the current actor
// ---------------------------------------------------------------------------
pages.get("/me/in-tray", (c) => {
  const actor  = c.get("actor");
  const actors = listActors();

  if (!actor) {
    return c.html(<InTrayPage actor={actor} actors={actors} items={[]} />);
  }

  const items = db.prepare(`
    SELECT
      a.assignment_id,
      s.step_id,
      s.chain_id,
      s.subject_ref,
      s.scope,
      c.quorum_kind,
      c.quorum_m,
      (SELECT COUNT(*) FROM approval_step WHERE chain_id = c.chain_id) AS step_count,
      c.state  AS chain_state,
      s.state  AS step_state,
      s.submitted_at,
      s.submitter_ref,
      act.display_name AS submitter_display_name
    FROM assignment a
    JOIN approval_step s  ON s.step_id   = a.task_ref
    JOIN chain c          ON c.chain_id  = s.chain_id
    JOIN actor act        ON act.actor_ref = s.submitter_ref
    WHERE a.assignee_ref = ? AND a.state = 'Active'
    ORDER BY s.submitted_at DESC
  `).all(actor.actor_ref) as InTrayItem[];

  return c.html(<InTrayPage actor={actor} actors={actors} items={items} />);
});

// ---------------------------------------------------------------------------
// GET /audit-ui — full audit log page
// ---------------------------------------------------------------------------
pages.get("/audit-ui", (c) => {
  const actor      = c.get("actor");
  const actors     = listActors();
  const chainFilter = c.req.query("chain_id") || undefined;
  const devMode    = c.req.query("dev") === "1";

  if (!actor || permitted(actor.actor_ref, "chains:read") === "denied") {
    return c.html(
      <AuditLogPage actor={actor} actors={actors} events={[]} chainFilter={chainFilter} devMode={devMode} />,
    );
  }

  const conditions: string[] = [];
  const bindings: string[]  = [];
  if (chainFilter) { conditions.push("chain_id = ?"); bindings.push(chainFilter); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const events = db.prepare(`
    SELECT event_id, seq, action_ref, actor_ref, chain_id, step_id,
           recorded_at, data_json, retention_policy, row_hash
    FROM audit_event ${where}
    ORDER BY seq DESC LIMIT 500
  `).all(...bindings) as AuditEventRow[];

  return c.html(
    <AuditLogPage actor={actor} actors={actors} events={events} chainFilter={chainFilter} devMode={devMode} />,
  );
});

export { pages };
