import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";
import type { EventRow } from "../domain/event_log.ts";
import type { RetentionPolicy } from "../domain/retention_policy.ts";

export interface AuditFilters {
  action?: string;
  from_date?: string;
  to_date?: string;
}

export const AuditListPage: FC<{
  actor: Actor;
  events: EventRow[];
  filters: AuditFilters;
  policy: RetentionPolicy | null;
  scope: "all" | "own";
}> = ({ actor, events, filters, policy, scope }) => (
  <Layout title="Audit Trail" actor={actor} path="/audit">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold">Audit Trail</h1>
        <p class="text-sm opacity-50 mt-0.5">
          Tamper-evident event log{scope === "own" && " (your events only)"}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <a href="/audit/verify" class="text-sm border rounded px-3 py-1.5 hover:bg-black/5">Verify chain</a>
        <a href="/audit/export.csv" class="text-sm border rounded px-3 py-1.5 hover:bg-black/5">Export CSV</a>
      </div>
    </div>

    {/* Retention policy notice */}
    {policy && (
      <div class="raised rounded mb-4 flex items-center gap-3 text-xs opacity-70">
        <span
          title="FDA 21 CFR Part 11 requires clinical research records to be retained for a minimum of 2555 days (7 years). The display filter below hides events older than that window from this view — records themselves are never deleted, since deletion would break the tamper-evident hash chain that Part 11 requires."
        >
          Retention window: <strong>{policy.days} days</strong> (FDA 21 CFR Part 11 minimum) ·
          display filter: <strong>{policy.enforce_on_read ? "ON" : "OFF — showing full chain"}</strong>
        </span>
        <form method="post" action="/audit/toggle-retention" class="inline">
          <button
            type="submit"
            class="underline hover:opacity-100"
            title={
              policy.enforce_on_read
                ? "Override the display filter and show every audit event regardless of age. Records are unchanged — only the filter is removed."
                : "Restore the production display filter — hide audit events older than the retention window (2555 days) from this view. Records remain intact in the database."
            }
          >
            {policy.enforce_on_read ? "show all" : "restore filter"}
          </button>
        </form>
      </div>
    )}

    {/* Filters */}
    <form method="get" action="/audit" class="mb-4 flex flex-wrap gap-2 items-end">
      <div>
        <label class="block text-xs font-medium mb-1">Action</label>
        <input name="action" type="text" value={filters.action ?? ""} placeholder="e.g. login.succeeded" class="border rounded px-2 py-1 text-xs w-44" />
      </div>
      <div>
        <label class="block text-xs font-medium mb-1">From date</label>
        <input name="from_date" type="date" value={filters.from_date ?? ""} class="border rounded px-2 py-1 text-xs" />
      </div>
      <div>
        <label class="block text-xs font-medium mb-1">To date</label>
        <input name="to_date" type="date" value={filters.to_date ?? ""} class="border rounded px-2 py-1 text-xs" />
      </div>
      <button type="submit" class="border rounded px-3 py-1 text-xs hover:bg-black/5">Filter</button>
      {(filters.action || filters.from_date || filters.to_date) && (
        <a href="/audit" class="text-xs opacity-50 underline self-end pb-1">Clear</a>
      )}
    </form>

    {/* Event table */}
    {events.length === 0
      ? <p class="text-sm opacity-50">No events match the current filters.</p>
      : (
        <div class="raised rounded overflow-hidden p-0">
          <table class="w-full text-xs">
            <thead>
              <tr>
                <th class="text-left px-3 py-2 font-medium opacity-50 w-12">#</th>
                <th class="text-left px-3 py-2 font-medium opacity-50 w-40">Occurred</th>
                <th class="text-left px-3 py-2 font-medium opacity-50">Action</th>
                <th class="text-left px-3 py-2 font-medium opacity-50">Target</th>
                <th class="text-left px-3 py-2 font-medium opacity-50">Actor</th>
                <th class="text-left px-3 py-2 font-medium opacity-50 max-w-xs">Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr class="border-t hover:bg-black/5">
                  <td class="px-3 py-2 opacity-40">{e.id}</td>
                  <td class="px-3 py-2 opacity-50 font-mono">{e.occurred_at.slice(0, 19).replace("T", " ")}</td>
                  <td class="px-3 py-2 font-medium">{e.action}</td>
                  <td class="px-3 py-2 opacity-50">{e.target_kind ? `${e.target_kind}#${e.target_id}` : "—"}</td>
                  <td class="px-3 py-2 opacity-50">{e.actor_id != null ? `actor#${e.actor_id}` : "anon"}</td>
                  <td class="px-3 py-2 opacity-40 font-mono max-w-xs truncate">
                    {e.payload_json === "{}" ? "" : e.payload_json.slice(0, 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    {events.length > 0 && (
      <p class="text-xs opacity-40 mt-2">{events.length} event{events.length !== 1 && "s"}</p>
    )}
  </Layout>
);
