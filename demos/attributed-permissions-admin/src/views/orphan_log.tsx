import type { FC } from "hono/jsx";
import type { OrphanEntry } from "../domain/orphan_log.ts";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

type Props = {
  orphans: OrphanEntry[];
  currentActor: Actor | null;
  actors: Actor[];
};

export const OrphanLog: FC<Props> = ({ orphans, currentActor, actors }) => (
  <Layout title="Orphan log — APA Demo" currentActor={currentActor} actors={actors}>
    <h1 class="text-xl font-semibold text-ink-gray-900 mb-2">Orphan log</h1>
    <p class="text-sm text-ink-gray-500 mb-6">
      Attestations that were recorded in the Actor Identity atom but whose corresponding
      grant or revocation write subsequently failed. An orphan is a recoverable anomaly:
      structural evidence exists. A grant with no attestation is unrecoverable — hence
      the attest-before-record ordering.
    </p>

    {orphans.length === 0 && (
      <p class="text-ink-gray-400 text-sm">No orphan entries.</p>
    )}

    {orphans.length > 0 && (
      <div class="border border-ink-gray-200 rounded overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-ink-gray-50 border-b border-ink-gray-200">
            <tr>
              <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Attestation</th>
              <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Proposal</th>
              <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Reason</th>
              <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Requested at</th>
            </tr>
          </thead>
          <tbody>
            {orphans.map((o, i) => (
              <tr class={i % 2 === 0 ? "" : "bg-ink-gray-50"} key={o.orphan_id}>
                <td class="px-4 py-2 font-mono text-xs text-ink-gray-800">{o.attestation_id}</td>
                <td class="px-4 py-2 font-mono text-xs text-ink-gray-800">{o.proposal_ref}</td>
                <td class="px-4 py-2">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                    {o.underlying_reason}
                  </span>
                </td>
                <td class="px-4 py-2 text-xs text-ink-gray-500">
                  {o.requested_at.slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Layout>
);
