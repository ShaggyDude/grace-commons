import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";
import type { Study } from "../domain/studies.ts";

export const SubjectsNewPage: FC<{
  actor: Actor;
  study: Study;
  nextCode: string;
  error?: string | null;
}> = ({ actor, study, nextCode, error }) => (
  <Layout title="Enroll Subject" actor={actor}>
    <div class="mb-6">
      <a href="/subjects" class="text-sm text-gray-500 hover:text-gray-700">← Subjects</a>
    </div>

    <h1 class="text-2xl font-semibold mb-1">Enroll Subject</h1>
    <p class="text-sm text-gray-500 mb-6">
      {study.protocol_number} — {study.title}
    </p>

    {error && (
      <p class="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </p>
    )}

    <form method="POST" action="/subjects" class="max-w-sm space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Subject code (auto-assigned)</label>
        <input
          type="text"
          value={nextCode}
          disabled
          class="w-full border rounded px-3 py-2 text-sm bg-gray-50 text-gray-500 font-mono"
        />
        <p class="text-xs text-gray-400 mt-1">
          Assigned sequentially — no PII, no manually chosen identifiers.
        </p>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" for="notes">
          Notes <span class="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Screening notes, inclusion/exclusion summary…"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>
      <div class="flex gap-3">
        <button
          type="submit"
          class="bg-gray-900 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800"
        >
          Enroll {nextCode}
        </button>
        <a
          href="/subjects"
          class="px-4 py-2 rounded text-sm text-gray-600 hover:text-gray-900 border"
        >
          Cancel
        </a>
      </div>
    </form>
  </Layout>
);
