// Audit log page — all audit events with chain filter and per-row integrity check.
//
// Each row has a "Check" button that fires hx-get → /audit/:id/verify and
// swaps the button with a VerifyChip (green or red) inline, without a page reload.

import type { FC } from "hono/jsx";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

export type AuditEventRow = {
  event_id: number;
  seq: number;
  action_ref: string;
  actor_ref: string;
  chain_id: string | null;
  step_id: string | null;
  recorded_at: string;
  data_json: string;
  retention_policy: string;
  row_hash: string;
};

type AuditLogPageProps = {
  actor: Actor | null;
  actors: Actor[];
  events: AuditEventRow[];
  chainFilter?: string;
  /** When true, show the dev-tamper panel per row (?dev=1 in URL) */
  devMode?: boolean;
};

export const AuditLogPage: FC<AuditLogPageProps> = ({
  actor,
  actors,
  events,
  chainFilter,
  devMode,
}) => {
  return (
    <Layout title="Audit log — Grace Commons" currentActor={actor} actors={actors}>
      {devMode && (
        <div class="mb-4 px-4 py-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs flex items-start gap-2">
          <span class="text-base leading-none mt-0.5">⚠️</span>
          <span>
            <strong>Dev mode active.</strong> Each row now shows a{" "}
            <strong>Tamper</strong> button that mutates <code>data_json</code>{" "}
            in the database, bypassing the append-only triggers.
            Click <strong>Check</strong> on the same row afterward to see the
            hash-chain forgery defense fire.
          </span>
        </div>
      )}

      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-semibold text-ink-gray-800">Audit log</h1>
        <span class="text-xs text-ink-gray-400">{events.length} event{events.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Filter */}
      <form method="get" action="/audit-ui" class="mb-5 flex items-center gap-3">
        {devMode && <input type="hidden" name="dev" value="1" />}
        <input type="text" name="chain_id" value={chainFilter ?? ""}
          placeholder="Filter by chain ID"
          class="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ink-gray-400 w-80" />
        <button type="submit"
          class="px-3 py-1.5 text-sm bg-ink-gray-100 text-ink-gray-700 rounded hover:bg-ink-gray-200">
          Apply filter
        </button>
        {chainFilter && (
          <a href={devMode ? "/audit-ui?dev=1" : "/audit-ui"}
            class="text-sm text-ink-gray-400 hover:text-ink-gray-600">Clear</a>
        )}
      </form>

      <div class="bg-ink-gray-0 border rounded-lg overflow-hidden">
        {events.length === 0 ? (
          <div class="text-center py-12 text-ink-gray-400 text-sm">No events.</div>
        ) : (
          <table class="w-full">
            <thead class="bg-ink-gray-50 border-b text-left">
              <tr class="text-xs text-ink-gray-600">
                <th class="py-3 px-4 font-medium w-12">Seq</th>
                <th class="py-3 px-4 font-medium">Action</th>
                <th class="py-3 px-4 font-medium">Actor</th>
                <th class="py-3 px-4 font-medium">Chain / Step</th>
                <th class="py-3 px-4 font-medium">Time (UTC)</th>
                <th class="py-3 px-4 font-medium">Retention</th>
                <th class="py-3 px-4 font-medium">Integrity</th>
                {devMode && <th class="py-3 px-4 font-medium text-red-600">Demo tamper</th>}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr class="border-b last:border-0 hover:bg-ink-gray-50 text-xs">
                  <td class="py-2 px-4 text-ink-gray-400 font-mono">{ev.seq}</td>
                  <td class="py-2 px-4 font-mono text-ink-gray-700">{ev.action_ref}</td>
                  <td class="py-2 px-4 text-ink-gray-600">{ev.actor_ref}</td>
                  <td class="py-2 px-4 text-ink-gray-400">
                    {ev.chain_id ? (
                      <a href={`/chains/${ev.chain_id}`}
                        class="text-blue-500 hover:underline font-mono">
                        …{ev.chain_id.slice(-8)}
                      </a>
                    ) : "—"}
                    {ev.step_id && (
                      <span class="ml-1 text-ink-gray-300 font-mono">/{ev.step_id.slice(-6)}</span>
                    )}
                  </td>
                  <td class="py-2 px-4 text-ink-gray-400">
                    {ev.recorded_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td class="py-2 px-4 text-ink-gray-400">{ev.retention_policy}</td>
                  <td class="py-2 px-4">
                    <span id={`verify-chip-${ev.event_id}`}>
                      {/* deno-lint-ignore no-explicit-any */}
                      <button
                        {...{
                          "hx-get": `/audit/${ev.event_id}/verify`,
                          "hx-target": `#verify-chip-${ev.event_id}`,
                          "hx-swap": "innerHTML",
                        } as any}
                        class="px-2 py-0.5 bg-ink-gray-100 text-ink-gray-500 rounded hover:bg-ink-gray-200 cursor-pointer">
                        Check
                      </button>
                    </span>
                  </td>
                  {devMode && (
                    <td class="py-2 px-4">
                      <span id={`tamper-btn-${ev.event_id}`}>
                        {/* deno-lint-ignore no-explicit-any */}
                        <button
                          {...{
                            "hx-post": `/admin/tamper?dev=1`,
                            "hx-vals": JSON.stringify({ event_id: ev.event_id }),
                            "hx-target": `#tamper-btn-${ev.event_id}`,
                            "hx-swap": "innerHTML",
                            "hx-confirm": `Mutate data_json for event #${ev.event_id}? This will break the hash chain at this row.`,
                          } as any}
                          class="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 cursor-pointer text-xs">
                          Tamper
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};
