// routes/audit.ts — Audit trail: view, verify, export
//
// Requires view_audit permission.
// scope='all' → show all events; scope='own' → show only this actor's events.
// View components called as plain functions (no JSX syntax in .ts file).

import { Hono } from "hono";
import type { AppEnv } from "../lib/env.ts";
import { requireSession } from "../middleware/require_session.ts";
import { requirePermission } from "../middleware/require_permission.ts";
import * as eventLog from "../domain/event_log.ts";
import * as retentionPolicy from "../domain/retention_policy.ts";
import { appendEvent } from "../domain/event_log.ts";
import { withTx } from "../lib/db.ts";
import { AuditListPage } from "../views/audit_list.tsx";
import { AuditVerifyPage } from "../views/audit_verify.tsx";
import type { AuditFilters } from "../views/audit_list.tsx";

export const auditRouter = new Hono<AppEnv>();

const canViewAudit = requirePermission("view_audit");

auditRouter.get("/audit", requireSession, canViewAudit, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;
  const scope = c.get("granted_scope") ?? "own";

  const filters: AuditFilters = {
    action: c.req.query("action") || undefined,
    from_date: c.req.query("from_date") || undefined,
    to_date: c.req.query("to_date") || undefined,
  };

  const policy = retentionPolicy.getPolicy(db);

  const domainFilters: eventLog.EventFilters = {
    action: filters.action ?? null,
    from_date: filters.from_date ?? null,
    to_date: filters.to_date ? filters.to_date + "T23:59:59Z" : null,
    actor_id: scope === "own" ? actor.id : null,
  };

  let events = eventLog.listFiltered(db, domainFilters);

  if (policy?.enforce_on_read) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - policy.days);
    const cutoffISO = cutoff.toISOString();
    events = events.filter((e) => e.occurred_at >= cutoffISO);
  }

  // Emit audit.viewed — under Part 11, viewing the regulated record is itself
  // a regulated act. This event is recorded after the query so the row count
  // is known; it will not appear in the current page render (already fetched).
  withTx(ctx, (tx) => {
    appendEvent(tx, {
      action: "audit.viewed",
      target_kind: "audit",
      payload: {
        filters: {
          action: filters.action ?? null,
          from_date: filters.from_date ?? null,
          to_date: filters.to_date ?? null,
          scope,
        },
        result_count: events.length,
      },
    });
  });

  return c.html(AuditListPage({ actor, events, filters, policy, scope: scope as "all" | "own" }) as string);
});

auditRouter.get("/audit/verify", requireSession, canViewAudit, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;
  const result = eventLog.verifyChain(db);
  return c.html(AuditVerifyPage({ actor, result }) as string);
});

auditRouter.get("/audit/export.csv", requireSession, canViewAudit, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const scope = c.get("granted_scope") ?? "own";
  const actor = ctx.actor!;

  const domainFilters: eventLog.EventFilters = {
    actor_id: scope === "own" ? actor.id : null,
  };
  const events = eventLog.listFiltered(db, domainFilters).reverse(); // oldest first

  // RFC 4180: wrap every field in double-quotes, escape inner quotes as "".
  const csvField = (v: string | number | null | undefined): string => {
    const s = v == null ? "" : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };

  const header =
    "id,occurred_at,actor_id,session_id,action,target_kind,target_id,payload_json,prev_hash,this_hash\n";

  const rows = events.map((e) =>
    [
      csvField(e.id),
      csvField(e.occurred_at),
      csvField(e.actor_id),
      csvField(e.session_id),
      csvField(e.action),
      csvField(e.target_kind),
      csvField(e.target_id),
      csvField(e.payload_json),   // already a JSON string — do NOT re-serialize
      csvField(e.prev_hash),
      csvField(e.this_hash),
    ].join(",")
  ).join("\n");

  // Emit audit.exported — exporting the audit log is itself a regulated act.
  withTx(ctx, (tx) => {
    appendEvent(tx, {
      action: "audit.exported",
      target_kind: "audit",
      payload: {
        row_count: events.length,
        scope,
      },
    });
  });

  const ts = new Date().toISOString().slice(0, 10);
  return new Response(header + rows, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="beacon-audit-${ts}.csv"`,
    },
  });
});

auditRouter.post("/audit/toggle-retention", requireSession, canViewAudit, (c) => {
  const ctx = c.get("ctx");
  retentionPolicy.toggleEnforcement(ctx.db);
  return c.redirect("/audit");
});
