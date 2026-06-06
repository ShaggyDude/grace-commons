// app/subjects/page.tsx — GET /subjects. Study Coordinator surface. C14-gated on
// enroll_subject OR record_visit; the granted scope decides own-vs-all rows
// (render 1's rule). Reads only.
import type { Metadata } from "next";
import { db } from "@/lib/db.ts";
import * as studies from "@/domain/studies.ts";
import * as subjects from "@/domain/subjects.ts";
import { currentUser } from "@/auth/current.ts";
import { permit, activeCodesFor } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";
import { Forbidden } from "@/components/Forbidden.tsx";
import { StatusBadge } from "@/components/Badge.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subjects" };

const GATE = ["enroll_subject", "record_visit"];
const STUDY_PROTOCOL = "BCN-OX-201";

export default async function SubjectsPage() {
  const { ctx } = await currentUser();
  const displayName = ctx.actor!.display_name ?? null;

  const granted = await permit(ctx, GATE);
  if (!granted) {
    return (
      <Shell displayName={displayName} active="subjects">
        <Forbidden codes={GATE} />
      </Shell>
    );
  }

  const study = await studies.getByProtocol(db, STUDY_PROTOCOL);
  if (!study) {
    return (
      <Shell displayName={displayName} active="subjects">
        <p className="text-sm opacity-50">Study not found — run the seed first.</p>
      </Shell>
    );
  }

  const codes = await activeCodesFor(ctx.actor!.id);
  const canEnroll = codes.includes("enroll_subject");

  const all = await subjects.listByStudy(db, study.id);
  const list = granted.scope === "all" ? all : all.filter((s) => s.enrolled_by_actor_id === ctx.actor!.id);

  return (
    <Shell displayName={displayName} active="subjects">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Subjects</h1>
          <p className="text-sm opacity-50 mt-0.5">
            {study.protocol_number} — {study.title}
          </p>
        </div>
        {canEnroll && (
          <a
            href="/subjects/new"
            className="inks-gray-1000 px-4 py-2 rounded text-sm font-medium hover:opacity-80"
          >
            Enroll subject
          </a>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-sm opacity-50">
          No subjects enrolled yet.
          {canEnroll && (
            <>
              {" "}
              <a href="/subjects/new" className="underline">
                Enroll the first subject.
              </a>
            </>
          )}
        </p>
      ) : (
        <div className="raised rounded overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-2 font-medium opacity-50">Code</th>
                <th className="text-left px-4 py-2 font-medium opacity-50">Status</th>
                <th className="text-left px-4 py-2 font-medium opacity-50">Enrolled</th>
                <th className="text-left px-4 py-2 font-medium opacity-50">Notes</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-2 font-mono font-medium">{s.subject_code}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2 opacity-50 text-xs">{s.enrolled_at.slice(0, 10)}</td>
                  <td className="px-4 py-2 opacity-50 text-xs max-w-xs truncate">{s.notes ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <a href={`/subjects/${s.id}`} className="text-xs underline hover:opacity-80">
                      View →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
