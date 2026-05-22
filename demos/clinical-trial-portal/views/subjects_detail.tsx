import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";
import type { Subject } from "../domain/subjects.ts";
import type { Visit } from "../domain/visits.ts";

const VISIT_KINDS = [
  "screening",
  "week_4",
  "week_12",
  "week_24",
  "end_of_study",
];

export const SubjectsDetailPage: FC<{
  actor: Actor;
  subject: Subject;
  visits: Visit[];
  canRecord: boolean;
  flash?: string | null;
  error?: string | null;
}> = ({ actor, subject, visits, canRecord, flash, error }) => (
  <Layout title={`Subject ${subject.subject_code}`} actor={actor}>
    <div class="mb-6">
      <a href="/subjects" class="text-sm text-gray-500 hover:text-gray-700">← Subjects</a>
    </div>

    <div class="flex items-start justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold font-mono">{subject.subject_code}</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          Status: <strong>{subject.status}</strong> · Enrolled {subject.enrolled_at.slice(0, 10)}
        </p>
        {subject.notes && (
          <p class="text-sm text-gray-600 mt-1">{subject.notes}</p>
        )}
      </div>
    </div>

    {flash && (
      <p class="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
        {flash}
      </p>
    )}

    {/* ── Visit history ───────────────────────────────────────── */}
    <section class="mb-8">
      <h2 class="text-base font-semibold mb-3">Visit History</h2>
      {visits.length === 0
        ? <p class="text-sm text-gray-500">No visits recorded yet.</p>
        : (
          <div class="border rounded bg-white overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Visit</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Recorded</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr class="border-t">
                    <td class="px-4 py-2 font-mono">{v.visit_kind}</td>
                    <td class="px-4 py-2 text-gray-500 text-xs">
                      {v.recorded_at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td class="px-4 py-2 text-gray-500 text-xs">
                      {v.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>

    {/* ── Record visit ────────────────────────────────────────── */}
    {canRecord && (
      <section>
        <h2 class="text-base font-semibold mb-3">Record Visit</h2>
        {error && (
          <p class="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
        <form
          method="POST"
          action={`/subjects/${subject.id}/visits`}
          class="border rounded bg-white p-4 flex flex-wrap items-end gap-3"
        >
          <div>
            <label class="block text-xs font-medium mb-1">Visit type</label>
            <select
              name="visit_kind"
              class="border rounded px-2 py-1.5 text-sm"
            >
              {VISIT_KINDS.map((k) => (
                <option value={k}>{k.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Notes (optional)</label>
            <input
              name="notes"
              type="text"
              placeholder="Observations…"
              class="border rounded px-3 py-1.5 text-sm w-64"
            />
          </div>
          <button
            type="submit"
            class="bg-gray-900 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-800"
          >
            Record visit
          </button>
        </form>
      </section>
    )}
  </Layout>
);
