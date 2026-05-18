// Chain list page — table of all chains with state filter and "+ New chain" button.

import type { FC } from "hono/jsx";
import type { ChainView } from "../domain/chain.ts";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";
import { StatePill } from "./fragments.tsx";

type ChainListPageProps = {
  chains: ChainView[];
  actor: Actor | null;
  actors: Actor[];
  stateFilter?: string;
};

export const ChainListPage: FC<ChainListPageProps> = ({
  chains,
  actor,
  actors,
  stateFilter,
}) => {
  return (
    <Layout title="Chains — Grace Commons" currentActor={actor} actors={actors}>
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-semibold text-ink-gray-800">Approval chains</h1>
        <a href="/chains/new"
          class="px-4 py-2 text-sm bg-ink-gray-800 text-ink-gray-0 rounded hover:bg-ink-gray-700">
          + New chain
        </a>
      </div>

      {/* Filter bar */}
      <form method="get" action="/" class="mb-5 flex items-center gap-3">
        <select name="state"
          class="border rounded px-2 py-1.5 text-sm bg-ink-gray-0 focus:outline-none focus:ring-1 focus:ring-ink-gray-400">
          <option value="">All states</option>
          {(["Pending", "Approved", "Rejected", "Withdrawn"] as const).map((s) => (
            <option value={s} selected={stateFilter === s}>{s}</option>
          ))}
        </select>
        <button type="submit"
          class="px-3 py-1.5 text-sm bg-ink-gray-100 text-ink-gray-700 rounded hover:bg-ink-gray-200">
          Apply filter
        </button>
        {stateFilter && (
          <a href="/" class="text-sm text-ink-gray-400 hover:text-ink-gray-600">Clear</a>
        )}
      </form>

      {chains.length === 0 ? (
        <div class="text-center py-20 text-ink-gray-400">
          <p class="text-sm">
            No chains yet.{" "}
            <a href="/chains/new" class="text-blue-500 hover:underline">
              Create the first one.
            </a>
          </p>
        </div>
      ) : (
        <div class="bg-ink-gray-0 border rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-ink-gray-50 border-b text-left">
              <tr>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Subject</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Scope</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Quorum</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Initiator</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">State</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600 text-center">Steps</th>
                <th class="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {chains.map((chain) => {
                const n = chain.steps.length;
                const a = chain.steps.filter((s) => s.state === "Approved").length;
                const quorum =
                  chain.quorum_kind === "M-of-N"   ? `${chain.quorum_m}-of-${n}` :
                  chain.quorum_kind === "one-of-N" ? `1-of-${n}` :
                  `all-${n}`;
                return (
                  <tr class="border-b last:border-0 hover:bg-ink-gray-50">
                    <td class="py-3 px-4 font-medium text-ink-gray-800 max-w-xs">
                      <span class="block truncate" title={chain.subject_ref}>
                        {chain.subject_ref}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-xs text-ink-gray-500">{chain.scope}</td>
                    <td class="py-3 px-4 text-xs text-ink-gray-500">{quorum}</td>
                    <td class="py-3 px-4 text-ink-gray-500">{chain.initiator_display_name}</td>
                    <td class="py-3 px-4">
                      <StatePill state={chain.state} />
                    </td>
                    <td class="py-3 px-4 text-xs text-ink-gray-500 text-center">
                      {a}/{n}
                    </td>
                    <td class="py-3 px-4 text-right">
                      <a href={`/chains/${chain.chain_id}`}
                        class="text-blue-500 hover:underline text-xs">
                        View →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
};
