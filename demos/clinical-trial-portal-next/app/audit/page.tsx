// app/audit/page.tsx — GET /audit. The C1 Audit Trail surface: filterable event
// list + the running verdict (VerifyChip). C14-gated on view_audit; scope='own'
// shows only the viewer's events, scope='all' shows the whole chain.
//
// Part 11: viewing the regulated record is itself a regulated act, so this Server
// Component emits audit.viewed AFTER reading (so the new row is not in the page
// it triggered) — exactly as render 1's route did. This is the sanctioned
// render-layer meta-event seam (route-level appendEvent), the same one render 1
// uses; the five business mutations still go only through composition.ts.
import type { Metadata } from "next";
import { db, withTx } from "@/lib/db.ts";
import * as eventLog from "@/domain/event_log.ts";
import * as retention from "@/domain/retention_policy.ts";
import { appendEvent } from "@/domain/event_log.ts";
import { currentUser } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";
import { Forbidden } from "@/components/Forbidden.tsx";
import { VerifyChip } from "@/components/VerifyChip.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit Trail" };

const GATE = ["view_audit"];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; from_date?: string; to_date?: string }>;
}) {
  const { ctx } = await currentUser();
  const displayName = ctx.actor!.display_name ?? null;

  const granted = await permit(ctx, GATE);
  if (!granted) {
    return (
      <Shell displayName={displayName} active="audit">
        <Forbidden codes={GATE} />
      </Shell>
    );
  }

  const sp = await searchParams;
  const filters = {
    action: sp.action || undefined,
    from_date: sp.from_date || undefined,
    to_date: sp.to_date || undefined,
  };
  const scope = granted.scope;

  // ── Read + filter (the chain is stored id-ascending; we display newest-first) ─
  let events = await eventLog.listAll(db);
  if (scope === "own") events = events.filter((e) => e.actor_id === ctx.actor!.id);
  if (filters.action) events = events.filter((e) => e.action.includes(filters.action!));
  if (filters.from_date) events = events.filter((e) => e.occurred_at >= filters.from_date!);
  if (filters.to_date) {
    const to = filters.to_date + "T23:59:59Z";
    events = events.filter((e) => e.occurred_at <= to);
  }

  const policy = await retention.get(db);
  if (policy?.enforce_on_read) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - policy.days);
    const cutoffISO = cutoff.toISOString();
    events = events.filter((e) => e.occurred_at >= cutoffISO);
  }

  const display = [...events].reverse(); // newest-first for the table

  // ── Emit audit.viewed (after the read, so it is not in this render) ──────────
  await withTx(ctx, async (tx) => {
    await appendEvent(tx, {
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

  const hasFilters = Boolean(filters.action || filters.from_date || filters.to_date);

  return (
    <Shell displayName={displayName} active="audit">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Audit Trail</h1>
          <p className="text-sm opacity-50 mt-0.5">
            Tamper-evident event log{scope === "own" && " (your events only)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VerifyChip />
          <a href="/audit/verify" className="text-sm border rounded px-3 py-1.5 hover:bg-black/5">
            Full report
          </a>
          <a href="/audit/export.csv" className="text-sm border rounded px-3 py-1.5 hover:bg-black/5">
            Export CSV
          </a>
        </div>
      </div>

      {/* Retention policy notice (read-only in this render — see CORNERS) */}
      {policy && (
        <div className="raised rounded mb-4 flex items-center gap-3 text-xs opacity-70">
          <span title="FDA 21 CFR Part 11 requires clinical research records to be retained for a minimum of 2555 days (7 years). When the display filter is ON, events older than that window are hidden from this view — records themselves are never deleted, since deletion would break the tamper-evident hash chain that Part 11 requires.">
            Retention window: <strong>{policy.days} days</strong> (FDA 21 CFR Part 11 minimum) · display
            filter: <strong>{policy.enforce_on_read ? "ON" : "OFF — showing full chain"}</strong>
          </span>
        </div>
      )}

      {/* Filters (plain GET form — works without JS) */}
      <form method="get" action="/audit" className="mb-4 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Action</label>
          <input
            name="action"
            type="text"
            defaultValue={filters.action ?? ""}
            placeholder="e.g. login.succeeded"
            className="border rounded px-2 py-1 text-xs w-44"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">From date</label>
          <input
            name="from_date"
            type="date"
            defaultValue={filters.from_date ?? ""}
            className="border rounded px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To date</label>
          <input
            name="to_date"
            type="date"
            defaultValue={filters.to_date ?? ""}
            className="border rounded px-2 py-1 text-xs"
          />
        </div>
        <button type="submit" className="border rounded px-3 py-1 text-xs hover:bg-black/5">
          Filter
        </button>
        {hasFilters && (
          <a href="/audit" className="text-xs opacity-50 underline self-end pb-1">
            Clear
          </a>
        )}
      </form>

      {/* Event table */}
      {display.length === 0 ? (
        <p className="text-sm opacity-50">No events match the current filters.</p>
      ) : (
        <div className="raised rounded overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 font-medium opacity-50 w-12">#</th>
                <th className="text-left px-3 py-2 font-medium opacity-50 w-40">Occurred</th>
                <th className="text-left px-3 py-2 font-medium opacity-50">Action</th>
                <th className="text-left px-3 py-2 font-medium opacity-50">Target</th>
                <th className="text-left px-3 py-2 font-medium opacity-50">Actor</th>
                <th className="text-left px-3 py-2 font-medium opacity-50 max-w-xs">Payload</th>
              </tr>
            </thead>
            <tbody>
              {display.map((e) => (
                <tr key={e.id} className="border-t hover:bg-black/5">
                  <td className="px-3 py-2 opacity-40">{e.id}</td>
                  <td className="px-3 py-2 opacity-50 font-mono">
                    {e.occurred_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 font-medium">{e.action}</td>
                  <td className="px-3 py-2 opacity-50">
                    {e.target_kind ? `${e.target_kind}#${e.target_id}` : "—"}
                  </td>
                  <td className="px-3 py-2 opacity-50">
                    {e.actor_id != null ? `actor#${e.actor_id}` : "anon"}
                  </td>
                  <td className="px-3 py-2 opacity-40 font-mono max-w-xs truncate">
                    {e.payload_json === "{}" ? "" : e.payload_json.slice(0, 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {display.length > 0 && (
        <p className="text-xs opacity-40 mt-2">
          {events.length} event{events.length !== 1 && "s"}
        </p>
      )}
    </Shell>
  );
}
