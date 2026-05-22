import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";
import type { GrantWithCode } from "../domain/grants.ts";
import type { Invitation } from "../domain/invitations.ts";
import type { Permission } from "../domain/permissions.ts";

export interface ActorRow {
  id: number;
  display_name: string;
  email: string;
  activeGrants: GrantWithCode[];
}

export interface InvitationRow extends Invitation {
  email: string;
}

const Badge: FC<{ label: string; color?: "green" | "yellow" | "gray" }> = (
  { label, color = "gray" },
) => {
  const cls = color === "green"
    ? "bg-green-100 text-green-800"
    : color === "yellow"
    ? "bg-yellow-100 text-yellow-800"
    : "bg-gray-100 text-gray-700";
  return (
    <span class={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
};

export const PeoplePage: FC<{
  actor: Actor;
  actorRows: ActorRow[];
  pendingInvitations: InvitationRow[];
  permissions: Permission[];
  flash?: string | null;
}> = ({ actor, actorRows, pendingInvitations, permissions, flash }) => (
  <Layout title="People &amp; Permissions" actor={actor}>
    <h1 class="text-2xl font-semibold mb-6">People &amp; Permissions</h1>

    {flash && (
      <p class="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
        {flash}
      </p>
    )}

    {/* ── Actors ─────────────────────────────────────────────── */}
    <section class="mb-8">
      <h2 class="text-base font-semibold mb-3">Actors</h2>
      <div class="border rounded bg-white overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-2 font-medium text-gray-600">Name</th>
              <th class="text-left px-4 py-2 font-medium text-gray-600">Email</th>
              <th class="text-left px-4 py-2 font-medium text-gray-600">Permissions</th>
              <th class="text-left px-4 py-2 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {actorRows.map((row) => (
              <tr class="border-t">
                <td class="px-4 py-2">{row.display_name}</td>
                <td class="px-4 py-2 text-gray-500">{row.email}</td>
                <td class="px-4 py-2">
                  <div class="flex flex-wrap gap-1">
                    {row.activeGrants.length === 0
                      ? <span class="text-gray-400 text-xs">none</span>
                      : row.activeGrants.map((g) => (
                        <span class="inline-flex items-center gap-1">
                          <Badge label={g.permission_code} color="green" />
                          <form method="POST" action={`/grants/${g.id}/revoke`} class="inline">
                            <button
                              type="submit"
                              class="text-xs text-red-500 hover:text-red-700"
                              title={`Revoke ${g.permission_code}`}
                            >
                              ✕
                            </button>
                          </form>
                        </span>
                      ))}
                  </div>
                </td>
                <td class="px-4 py-2">
                  {/* Inline grant form */}
                  <form method="POST" action="/grants" class="flex items-center gap-1">
                    <input type="hidden" name="grantee_actor_id" value={String(row.id)} />
                    <select
                      name="permission_id"
                      class="border rounded px-1 py-1 text-xs"
                    >
                      {permissions.map((p) => (
                        <option value={String(p.id)}>{p.code}</option>
                      ))}
                    </select>
                    <select name="scope" class="border rounded px-1 py-1 text-xs">
                      <option value="all">all</option>
                      <option value="own">own</option>
                    </select>
                    <button
                      type="submit"
                      class="text-xs bg-gray-800 text-white px-2 py-1 rounded hover:bg-gray-700"
                    >
                      Grant
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    {/* ── Pending Invitations ────────────────────────────────── */}
    <section class="mb-8">
      <h2 class="text-base font-semibold mb-3">Pending Invitations</h2>
      {pendingInvitations.length === 0
        ? <p class="text-sm text-gray-500">No pending invitations.</p>
        : (
          <div class="border rounded bg-white overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Email</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Role</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Expires</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Accept link</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((inv) => (
                  <tr class="border-t">
                    <td class="px-4 py-2">{inv.email}</td>
                    <td class="px-4 py-2">
                      <Badge label={inv.intended_role} color="yellow" />
                    </td>
                    <td class="px-4 py-2 text-gray-500 text-xs">
                      {inv.expires_at.slice(0, 10)}
                    </td>
                    <td class="px-4 py-2">
                      <code class="text-xs bg-gray-100 px-1 rounded break-all">
                        /invitations/accept/{inv.token}
                      </code>
                    </td>
                    <td class="px-4 py-2">
                      <form method="POST" action={`/invitations/${inv.id}/revoke`}>
                        <button
                          type="submit"
                          class="text-xs text-red-500 hover:text-red-700"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>

    {/* ── Issue Invitation ──────────────────────────────────── */}
    <section>
      <h2 class="text-base font-semibold mb-3">Invite someone</h2>
      <form
        method="POST"
        action="/invitations"
        class="border rounded bg-white p-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label class="block text-xs font-medium mb-1">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="new@example.com"
            class="border rounded px-3 py-1.5 text-sm w-52"
          />
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Display name</label>
          <input
            name="display_name"
            type="text"
            required
            placeholder="Jane Smith"
            class="border rounded px-3 py-1.5 text-sm w-40"
          />
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Role</label>
          <input
            name="intended_role"
            type="text"
            required
            placeholder="coordinator"
            class="border rounded px-3 py-1.5 text-sm w-32"
          />
        </div>
        <button
          type="submit"
          class="bg-gray-900 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-800"
        >
          Send invitation
        </button>
      </form>
    </section>
  </Layout>
);
