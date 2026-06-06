// app/dashboard/page.tsx — GET /dashboard (role-aware). Tiles are gated by the
// actor's active permission CODES, exactly as render 1's dashboard.
import type { Metadata } from "next";
import { currentUser } from "@/auth/current.ts";
import { activeCodesFor } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

function Tile({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} className="raised rounded-lg block hover:shadow-sm transition-all">
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-sm opacity-50">{desc}</div>
    </a>
  );
}

export default async function DashboardPage() {
  const { ctx } = await currentUser();
  const codes = await activeCodesFor(ctx.actor!.id);

  return (
    <Shell displayName={ctx.actor!.display_name ?? null}>
      <h1 className="text-2xl font-semibold mb-1">Welcome, {ctx.actor!.display_name}</h1>
      <p className="text-sm opacity-50 mb-8">Beacon Clinical Research Portal</p>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {codes.includes("invite_actor") && (
          <Tile href="/people" title="People & Permissions" desc="Invite coordinators, manage access grants" />
        )}
        {codes.includes("enroll_subject") && (
          <Tile href="/subjects" title="Subjects" desc="Enroll subjects and record study visits" />
        )}
        {codes.includes("record_visit") && !codes.includes("enroll_subject") && (
          <Tile href="/subjects" title="Subjects" desc="Record study visits for enrolled subjects" />
        )}
        {codes.includes("view_audit") && (
          <Tile href="/audit" title="Audit Trail" desc="Review the tamper-evident event log" />
        )}
      </div>

      {codes.length === 0 && (
        <p className="text-sm opacity-50 mt-4">
          No permissions granted yet. Ask your principal investigator to set up your access.
        </p>
      )}
    </Shell>
  );
}
