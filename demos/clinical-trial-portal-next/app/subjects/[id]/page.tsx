// app/subjects/[id]/page.tsx — GET /subjects/:id. Subject detail + visit history
// + record-visit form. C14-gated on enroll_subject OR record_visit; own-scope
// hides other coordinators' subjects (returns 404, same as render 1).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db.ts";
import * as subjects from "@/domain/subjects.ts";
import * as visits from "@/domain/visits.ts";
import { currentUser } from "@/auth/current.ts";
import { permit, activeCodesFor } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";
import { Forbidden } from "@/components/Forbidden.tsx";
import { recordVisit } from "../actions.ts";

export const dynamic = "force-dynamic";

const GATE = ["enroll_subject", "record_visit"];
const VISIT_KINDS = ["screening", "week_4", "week_12", "week_24", "end_of_study"];

export const metadata: Metadata = { title: "Subject" };

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);

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

  if (!Number.isInteger(id)) notFound();
  const subject = await subjects.getById(db, id);
  if (!subject) notFound();

  // own-scope: a coordinator only sees subjects they enrolled.
  if (granted.scope === "own" && subject.enrolled_by_actor_id !== ctx.actor!.id) notFound();

  const visitList = await visits.listBySubject(db, id);
  const codes = await activeCodesFor(ctx.actor!.id);
  const canRecord = codes.includes("record_visit") || codes.includes("enroll_subject");

  return (
    <Shell displayName={displayName} active="subjects">
      <div className="mb-6">
        <a href="/subjects" className="text-sm opacity-50 hover:opacity-100">
          ← Subjects
        </a>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold font-mono">{subject.subject_code}</h1>
          <p className="text-sm opacity-50 mt-0.5">
            Status: <strong>{subject.status}</strong> · Enrolled {subject.enrolled_at.slice(0, 10)}
          </p>
          {subject.notes && <p className="text-sm opacity-60 mt-1">{subject.notes}</p>}
        </div>
      </div>

      {/* ── Visit history ──────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3">Visit History</h2>
        {visitList.length === 0 ? (
          <p className="text-sm opacity-50">No visits recorded yet.</p>
        ) : (
          <div className="raised rounded overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Visit</th>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Recorded</th>
                  <th className="text-left px-4 py-2 font-medium opacity-50">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visitList.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-4 py-2 font-mono">{v.visit_kind}</td>
                    <td className="px-4 py-2 opacity-50 text-xs">
                      {v.recorded_at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2 opacity-50 text-xs">{v.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Record visit ───────────────────────────────────────── */}
      {canRecord && (
        <section>
          <h2 className="text-base font-semibold mb-3">Record Visit</h2>
          <form action={recordVisit} className="raised rounded flex flex-wrap items-end gap-3">
            <input type="hidden" name="subject_id" value={String(subject.id)} />
            <div>
              <label className="block text-xs font-medium mb-1">Visit type</label>
              <select name="visit_kind" className="border rounded px-2 py-1.5 text-sm">
                {VISIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Notes (optional)</label>
              <input
                name="notes"
                type="text"
                placeholder="Observations…"
                className="border rounded px-3 py-1.5 text-sm w-64"
              />
            </div>
            <button type="submit" className="px-4 py-1.5 rounded text-sm inks-sage-100">
              Record visit
            </button>
          </form>
        </section>
      )}
    </Shell>
  );
}
