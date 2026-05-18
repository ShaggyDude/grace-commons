// In-tray page — active assignments for the current actor.

import type { FC } from "hono/jsx";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";
import { StatePill } from "./fragments.tsx";

export type InTrayItem = {
  assignment_id: number;
  step_id: string;
  chain_id: string;
  subject_ref: string;
  scope: string;
  quorum_kind: string;
  quorum_m: number | null;
  step_count: number;
  chain_state: string;
  step_state: string;
  submitted_at: string;
  submitter_ref: string;
  submitter_display_name: string;
};

type InTrayPageProps = {
  actor: Actor | null;
  actors: Actor[];
  items: InTrayItem[];
};

export const InTrayPage: FC<InTrayPageProps> = ({ actor, actors, items }) => {
  return (
    <Layout title="In-tray — Grace Commons" currentActor={actor} actors={actors}>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-ink-gray-800">In-tray</h1>
        <span class="text-sm text-ink-gray-500">
          Pending for{" "}
          <span class="font-medium text-ink-gray-700">{actor?.display_name ?? "—"}</span>
        </span>
      </div>

      {!actor ? (
        <div class="text-center py-16 text-ink-gray-400 text-sm">
          Select an actor using the dropdown in the top bar.
        </div>
      ) : items.length === 0 ? (
        <div class="text-center py-16 text-ink-gray-400">
          <p class="text-sm">No pending assignments.</p>
        </div>
      ) : (
        <div class="bg-ink-gray-0 border rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-ink-gray-50 border-b text-left">
              <tr>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Subject</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Scope</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Submitted by</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Chain</th>
                <th class="py-3 px-4 font-medium text-ink-gray-600">Date</th>
                <th class="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr class="border-b last:border-0 hover:bg-ink-gray-50">
                  <td class="py-3 px-4 font-medium text-ink-gray-800 max-w-xs">
                    <span class="block truncate" title={item.subject_ref}>
                      {item.subject_ref}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-xs text-ink-gray-500">{item.scope}</td>
                  <td class="py-3 px-4 text-ink-gray-500">{item.submitter_display_name}</td>
                  <td class="py-3 px-4">
                    <StatePill state={item.chain_state} />
                  </td>
                  <td class="py-3 px-4 text-xs text-ink-gray-400">
                    {item.submitted_at.slice(0, 10)}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <a href={`/chains/${item.chain_id}`}
                      class="text-blue-500 hover:underline text-xs">
                      Review →
                    </a>
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
