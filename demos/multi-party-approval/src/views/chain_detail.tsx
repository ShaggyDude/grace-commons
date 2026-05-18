// Chain detail page — banner + step rows table + mini audit log.

import type { FC } from "hono/jsx";
import type { ChainView } from "../domain/chain.ts";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";
import { ChainBanner, StepRow } from "./fragments.tsx";

type AuditEventRow = {
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

type ChainDetailPageProps = {
  chain: ChainView;
  actor: Actor | null;
  actors: Actor[];
  events?: AuditEventRow[];
};

export const ChainDetailPage: FC<ChainDetailPageProps> = ({
  chain,
  actor,
  actors,
  events = [],
}) => {
  return (
    <Layout
      title={`${chain.subject_ref} — Grace Commons`}
      currentActor={actor}
      actors={actors}
    >
      <div class="mb-4">
        <a href="/" class="text-sm text-ink-gray-400 hover:text-ink-gray-600">← All chains</a>
      </div>

      <ChainBanner chain={chain} actor={actor} />

      {/* Error flash — populated by HTMX OOB swap on step action failure */}
      <div id="error-flash"></div>

      {/* Steps */}
      <div class="bg-ink-gray-0 border rounded-lg overflow-hidden mb-6">
        <div class="px-4 py-3 border-b bg-ink-gray-50">
          <h3 class="text-sm font-semibold text-ink-gray-700">Approval steps</h3>
        </div>
        {chain.steps.length === 0 ? (
          <p class="px-4 py-6 text-sm text-ink-gray-400">No steps.</p>
        ) : (
          <table class="w-full text-sm">
            <thead class="border-b text-left">
              <tr class="text-xs text-ink-gray-500">
                <th class="py-2 px-4 font-medium w-8">#</th>
                <th class="py-2 px-4 font-medium">Approver</th>
                <th class="py-2 px-4 font-medium">Submitted</th>
                <th class="py-2 px-4 font-medium">State</th>
                <th class="py-2 px-4 font-medium">Actions / decided by</th>
              </tr>
            </thead>
            <tbody>
              {chain.steps.map((step) => (
                <StepRow step={step} actor={actor} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mini audit trail */}
      {events.length > 0 && (
        <div class="bg-ink-gray-0 border rounded-lg overflow-hidden">
          <div class="px-4 py-3 border-b bg-ink-gray-50 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-gray-700">Audit trail</h3>
            <a href={`/audit-ui?chain_id=${chain.chain_id}`}
              class="text-xs text-blue-500 hover:underline">
              Full log →
            </a>
          </div>
          <table class="w-full">
            <thead class="border-b text-left">
              <tr class="text-xs text-ink-gray-500">
                <th class="py-2 px-4 font-medium w-12">Seq</th>
                <th class="py-2 px-4 font-medium">Action</th>
                <th class="py-2 px-4 font-medium">Actor</th>
                <th class="py-2 px-4 font-medium">Time</th>
                <th class="py-2 px-4 font-medium">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr class="border-b last:border-0 text-xs">
                  <td class="py-2 px-4 text-ink-gray-400 font-mono">{ev.seq}</td>
                  <td class="py-2 px-4 font-mono text-ink-gray-700">{ev.action_ref}</td>
                  <td class="py-2 px-4 text-ink-gray-500">{ev.actor_ref}</td>
                  <td class="py-2 px-4 text-ink-gray-400">
                    {ev.recorded_at.slice(0, 19).replace("T", " ")}
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
};
