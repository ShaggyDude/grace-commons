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
  <Layout title="Audit Trail" actor={actor}>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold">Audit Trail</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          Tamper-evident event log
          {scope === "own" && " (your events only)"}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <a
          href="/audit/verify"
          class="text-sm border rounded px-3 py-1.5 hover:bg-gray-50"
        >
          Verify chain
        </a>
        <a
          href="/audit/export.csv"
          class="text-sm border rounded px-3 py-1.5 hover:bg-gray-50"
        >
          Export CSV
        </a>
      </div>
    </div>

    {/* Retention policy notice */}
    {policy && (
      <div class="mb-4 flex items-center gap-3 text-xs text-gray-500 bg-gray-50 border rounded px-3 py-2">
        <span>
          Retention: <strong>{policy.days} days</strong> (FDA 21 CFR Part 11 default: 2555) ·
          enforcement is{" "}
          <strong>{policy.enforce_on_read ? "ON" : "OFF"}</strong>
        </span>
        <form method="POST" action="/audit/toggle-retention" class="inline">
          <button type="submit" class="underline hover:text-gray-900">
            {policy.enforce_on_read ? "disable" : "enable"}
          </button>
        </form>
      </div>
    )}

    {/* Filters */}
    <form method="GET" action="/audit" class="mb-4 flex flex-wrap gap-2 items-end">
      <div>
        <label class="block text-xs font-medium mb-1">Action</label>
        <input
          name="action"
          type="text"
          value={filters.action ?? ""}
          placeholder="e.g. login.succeeded"
          class="border rounded px-2 py-1 text-xs w-44"
        />
      </div>
      <div>
        <label class="block text-xs font-medium mb-1">From date</label>
        <input
          name="from_date"
          type="date"
          value={filters.from_date ?? ""}
          class="border rounded px-2 py-1 text-xs"
        />
      </div>
      <div>
        <label class="block text-xs font-medium mb-1">To date</label>
        <input
          name="to_date"
          type="date"
          value={filters.to_date ?? ""}
          class="border rounded px-2 py-1 text-xs"
        />
      </div>
      <button type="submit" class="border rounded px-3 py-1 text-xs hover:bg-gray-50">
        Filter
      </button>
      {(filters.action || filters.from_date || filters.to_date) && (
        <a href="/audit" class="text-xs text-gray-500 underline self-end pb-1">
          Clear
        </a>
      )}
    </form>

    {/* Event table */}
    {events.length === 0
      ? <p class="text-sm text-gray-500">No events match the current filters.</p>
      : (
        <div class="border rounded bg-white overflow-hidden">
          <table class="w-full text-xs">
            <thead class="bg-gray-50">
              <tr>
                <th class="text-left px-3 py-2 font-medium text-gray-600 w-12">#</th>
                <th class="text-left px-3 py-2 font-medium text-gray-600 w-40">Occurred</th>
                <th class="text-left px-3 py-2 font-medium text-gray-600">Action</th>
                <th class="text-left px-3 py-2 font-medium text-gray-600">Target</th>
                <th class="text-left px-3 py-2 font-medium text-gray-600">Actor</th>
                <th class="text-left px-3 py-2 font-medium text-gray-600 max-w-xs">Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr class="border-t hover:bg-gray-50">
                  <td class="px-3 py-2 text-gray-400">{e.id}</td>
                  <td class="px-3 py-2 text-gray-500 font-mono">
                    {e.occurred_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td class="px-3 py-2 font-medium">{e.action}</td>
                  <td class="px-3 py-2 text-gray-500">
                    {e.target_kind
                      ? `${e.target_kind}#${e.target_id}`
                      : "—"}
                  </td>
                  <td class="px-3 py-2 text-gray-500">
                    {e.actor_id != null ? `actor#${e.actor_id}` : "anon"}
                  </td>
                  <td class="px-3 py-2 text-gray-400 font-mono max-w-xs truncate">
                    {e.payload_json === "{}" ? "" : e.payload_json.slice(0, 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    {events.length > 0 && (
      <p class="text-xs text-gray-400 mt-2">{events.length} event{events.length !== 1 && "s"}</p>
    )}
  </Layout>
);
