// app/people/page.tsx — GET /people. PI surface: actors + their grants,
// pending invitations, and the invite form. C14-gated on invite_actor OR
// grant_permission (render 1's canManagePeople). Reads only; every mutation is a
// Server Action in ./actions.ts.
import type { Metadata } from "next";
import { db } from "@/lib/db.ts";
import * as actors from "@/domain/actors.ts";
import * as parties from "@/domain/parties.ts";
import * as invitations from "@/domain/invitations.ts";
import * as permissions from "@/domain/permissions.ts";
import { currentUser } from "@/auth/current.ts";
import { permit, activeGrantsFor } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";
import { Forbidden } from "@/components/Forbidden.tsx";
import { Badge } from "@/components/Badge.tsx";
import { InviteForm } from "@/components/InviteForm.tsx";
import { revokeGrant, grant, revokeInvitation } from "./actions.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People & Permissions" };

const GATE = ["invite_actor", "grant_permission"];

export default async function PeoplePage() {
  const { ctx } = await currentUser();
  const displayName = ctx.actor!.display_name ?? null;

  if (!(await permit(ctx, GATE))) {
    return (
      <Shell displayName={displayName} active="people">
        <Forbidden codes={GATE} />
      </Shell>
    );
  }

  // ── Actors + their active grants ──────────────────────────────────────────
  const actorList = await actors.listAll(db);
  const actorRows = await Promise.all(
    actorList.map(async (a) => {
      const party = await parties.getById(db, a.party_id);
      return {
        id: a.id,
        display_name: party?.display_name ?? "—",
        email: party?.email ?? "—",
        activeGrants: await activeGrantsFor(a.id),
      };
    }),
  );

  // ── Pending invitations ───────────────────────────────────────────────────
  const pending = await invitations.listPending(db);
  const pendingRows = await Promise.all(
    pending.map(async (inv) => {
      const party = await parties.getById(db, inv.party_id);
      return { ...inv, email: party?.email ?? "—" };
    }),
  );

  const allPermissions = await permissions.listAll(db);

  return (
    <Shell displayName={displayName} active="people">
      <h1 className="text-2xl font-semibold mb-6">People &amp; Permissions</h1>

      {/* ── Actors ───────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3">Actors</h2>
        <div className="raised rounded overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-2 font-medium opacity-50">Name</th>
                <th className="text-left px-4 py-2 font-medium opacity-50">Email</th>
                <th className="text-left px-4 py-2 font-medium opacity-50">Permissions</th>
                <th className="text-left px-4 py-2 font-medium opacity-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {actorRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2">{row.display_name}</td>
                  <td className="px-4 py-2 opacity-50">{row.email}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.activeGrants.length === 0 ? (
                        <span className="text-xs opacity-40">none</span>
                      ) : (
                        row.activeGrants.map((g) => (
                          <span key={g.id} className="inline-flex items-center gap-1">
                            <Badge label={g.code} color="green" />
                            <form action={revokeGrant} className="inline">
                              <input type="hidden" name="grant_id" value={String(g.id)} />
                              <button
                                type="submit"
                                className="text-xs text-red-500 hover:text-red-700"
                                title={`Revoke ${g.code}`}
                              >
                                ✕
                              </button>
                            </form>
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <form action={grant} className="flex items-center gap-1">
                      <input type="hidden" name="grantee_actor_id" value={String(row.id)} />
                      <select name="permission_id" className="border rounded px-1 py-1 text-xs">
                        {allPermissions.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.code}
                          </option>
                        ))}
                      </select>
                      <select name="scope" className="border rounded px-1 py-1 text-xs">
                        <option value="all">all</option>
                        <option value="own">own</option>
                      </select>
                      <button
                        type="submit"
                        className="inks-gray-1000 text-xs px-2 py-1 rounded hover:opacity-80"
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

      {/* ── Pending Invitations ──────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3">Pending Invitations</h2>
        {pendingRows.length === 0 ? (
          <p className="text-sm opacity-50">No pending invitations.</p>
        ) : (
          <div className="raised rounded overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Email</th>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Role</th>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Expires</th>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Accept link</th>
                  <th className="text-left px-4 py-2 font-medium opacity-50"></th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-2">{inv.email}</td>
                    <td className="px-4 py-2">
                      <Badge label={inv.intended_role} color="yellow" />
                    </td>
                    <td className="px-4 py-2 opacity-50 text-xs">{inv.expires_at.slice(0, 10)}</td>
                    <td className="px-4 py-2">
                      <code className="text-xs bg-black/5 px-1 rounded break-all">
                        /invitations/accept/{inv.token}
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <form action={revokeInvitation}>
                        <input type="hidden" name="invitation_id" value={String(inv.id)} />
                        <button type="submit" className="text-xs text-red-500 hover:text-red-700">
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

      {/* ── Issue Invitation ─────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold mb-3">Invite someone</h2>
        <InviteForm />
      </section>
    </Shell>
  );
}
