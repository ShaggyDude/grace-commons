import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";

const Tile: FC<{ href: string; title: string; desc: string }> = (
  { href, title, desc },
) => (
  <a
    href={href}
    class="block border rounded-lg p-5 bg-white hover:border-gray-400 hover:shadow-sm transition-all"
  >
    <div class="font-semibold mb-1">{title}</div>
    <div class="text-sm text-gray-500">{desc}</div>
  </a>
);

export const DashboardPage: FC<{
  actor: Actor;
  permissions: string[];
}> = ({ actor, permissions }) => (
  <Layout title="Dashboard" actor={actor}>
    <h1 class="text-2xl font-semibold mb-1">
      Welcome, {actor.display_name}
    </h1>
    <p class="text-sm text-gray-500 mb-8">Beacon Clinical Research Portal</p>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {permissions.includes("invite_actor") && (
        <Tile
          href="/people"
          title="People &amp; Permissions"
          desc="Invite coordinators, manage access grants"
        />
      )}
      {permissions.includes("enroll_subject") && (
        <Tile
          href="/subjects"
          title="Subjects"
          desc="Enroll subjects and record study visits"
        />
      )}
      {permissions.includes("record_visit") && !permissions.includes("enroll_subject") && (
        <Tile
          href="/subjects"
          title="Subjects"
          desc="Record study visits for enrolled subjects"
        />
      )}
      {permissions.includes("view_audit") && (
        <Tile
          href="/audit"
          title="Audit Trail"
          desc="Review the tamper-evident event log"
        />
      )}
    </div>

    {permissions.length === 0 && (
      <p class="text-sm text-gray-500 mt-4">
        No permissions granted yet. Ask your principal investigator to set up your access.
      </p>
    )}
  </Layout>
);
