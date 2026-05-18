import type { FC } from "hono/jsx";
import type { Grant } from "../domain/grant.ts";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

type Props = {
  grants: Grant[];
  currentActor: Actor | null;
  actors: Actor[];
};

export const GrantList: FC<Props> = ({ grants, currentActor, actors }) => {
  const active = grants.filter((g) => g.status === "active");
  const revoked = grants.filter((g) => g.status === "revoked");

  return (
    <Layout title="Grants — APA Demo" currentActor={currentActor} actors={actors}>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-ink-gray-900">Permission Grants</h1>
        <a
          href="/grants/new"
          class="px-4 py-2 rounded bg-ink-gray-900 text-ink-gray-0 text-sm hover:bg-ink-gray-700"
        >
          Issue grant
        </a>
      </div>

      {grants.length === 0 && (
        <p class="text-ink-gray-500 text-sm">No grants yet. Issue one above.</p>
      )}

      {active.length > 0 && (
        <section class="mb-8">
          <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">
            Active ({active.length})
          </h2>
          <GrantTable grants={active} />
        </section>
      )}

      {revoked.length > 0 && (
        <section>
          <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">
            Revoked ({revoked.length})
          </h2>
          <GrantTable grants={revoked} />
        </section>
      )}
    </Layout>
  );
};

const GrantTable: FC<{ grants: Grant[] }> = ({ grants }) => (
  <div class="border border-ink-gray-200 rounded overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-ink-gray-50 border-b border-ink-gray-200">
        <tr>
          <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Subject</th>
          <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Scope</th>
          <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Granted</th>
          <th class="px-4 py-2 text-left font-medium text-ink-gray-600">Status</th>
          <th class="px-4 py-2 text-left font-medium text-ink-gray-600"></th>
        </tr>
      </thead>
      <tbody>
        {grants.map((g, i) => (
          <tr class={i % 2 === 0 ? "" : "bg-ink-gray-50"} key={g.grant_id}>
            <td class="px-4 py-2 font-mono text-xs text-ink-gray-800">{g.subject_ref}</td>
            <td class="px-4 py-2 font-mono text-xs text-ink-gray-800">{g.action_scope}</td>
            <td class="px-4 py-2 text-ink-gray-500 text-xs">{g.granted_at.slice(0, 16).replace("T", " ")}</td>
            <td class="px-4 py-2">
              <span class={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                g.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-ink-gray-200 text-ink-gray-600"
              }`}>
                {g.status}
              </span>
            </td>
            <td class="px-4 py-2">
              <a href={`/grants/${g.grant_id}`} class="text-ink-gray-500 hover:text-ink-gray-900 text-xs underline">
                detail
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
