import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";
import type { Subject } from "../domain/subjects.ts";
import type { Study } from "../domain/studies.ts";

const StatusBadge: FC<{ status: Subject["status"] }> = ({ status }) => {
  const cls = status === "enrolled"
    ? "bg-green-100 text-green-800"
    : status === "screening"
    ? "bg-yellow-100 text-yellow-800"
    : status === "completed"
    ? "bg-blue-100 text-blue-800"
    : "border opacity-60";
  return (
    <span class={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>
      {status}
    </span>
  );
};

export const SubjectsListPage: FC<{
  actor: Actor;
  study: Study;
  subjects: Subject[];
  canEnroll: boolean;
}> = ({ actor, study, subjects, canEnroll }) => (
  <Layout title="Subjects" actor={actor}>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold">Subjects</h1>
        <p class="text-sm opacity-50 mt-0.5">{study.protocol_number} — {study.title}</p>
      </div>
      {canEnroll && (
        <a href="/subjects/new" class="inks-gray-1000 px-4 py-2 rounded text-sm font-medium hover:opacity-80">
          Enroll subject
        </a>
      )}
    </div>

    {subjects.length === 0
      ? (
        <p class="text-sm opacity-50">
          No subjects enrolled yet.
          {canEnroll && <>{" "}<a href="/subjects/new" class="underline">Enroll the first subject.</a></>}
        </p>
      )
      : (
        <div class="raised rounded overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class="text-left px-4 py-2 font-medium opacity-50">Code</th>
                <th class="text-left px-4 py-2 font-medium opacity-50">Status</th>
                <th class="text-left px-4 py-2 font-medium opacity-50">Enrolled</th>
                <th class="text-left px-4 py-2 font-medium opacity-50">Notes</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr class="border-t">
                  <td class="px-4 py-2 font-mono font-medium">{s.subject_code}</td>
                  <td class="px-4 py-2"><StatusBadge status={s.status} /></td>
                  <td class="px-4 py-2 opacity-50 text-xs">{s.enrolled_at.slice(0, 10)}</td>
                  <td class="px-4 py-2 opacity-50 text-xs max-w-xs truncate">{s.notes ?? "—"}</td>
                  <td class="px-4 py-2 text-right">
                    <a href={`/subjects/${s.id}`} class="text-xs underline hover:opacity-80">View →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
  </Layout>
);
