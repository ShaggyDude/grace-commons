// app/subjects/new/page.tsx — GET /subjects/new. C14-gated on enroll_subject.
// The subject code is auto-assigned (synthetic, no PII) — shown read-only.
import type { Metadata } from "next";
import { db } from "@/lib/db.ts";
import * as studies from "@/domain/studies.ts";
import * as subjects from "@/domain/subjects.ts";
import { currentUser } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";
import { Forbidden } from "@/components/Forbidden.tsx";
import { enrollSubject } from "../actions.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enroll Subject" };

const GATE = ["enroll_subject"];
const STUDY_PROTOCOL = "BCN-OX-201";
const SUBJECT_PREFIX = "BCN";

export default async function NewSubjectPage() {
  const { ctx } = await currentUser();
  const displayName = ctx.actor!.display_name ?? null;

  if (!(await permit(ctx, GATE))) {
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

  const nextCode = await subjects.nextSubjectCode(db, SUBJECT_PREFIX);

  return (
    <Shell displayName={displayName} active="subjects">
      <div className="mb-6">
        <a href="/subjects" className="text-sm opacity-50 hover:opacity-100">
          ← Subjects
        </a>
      </div>

      <h1 className="text-2xl font-semibold mb-1">Enroll Subject</h1>
      <p className="text-sm opacity-50 mb-6">
        {study.protocol_number} — {study.title}
      </p>

      <form action={enrollSubject} className="max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Subject code (auto-assigned)</label>
          <input
            type="text"
            value={nextCode}
            disabled
            className="w-full border rounded px-3 py-2 text-sm font-mono opacity-50 cursor-not-allowed"
          />
          <p className="text-xs opacity-40 mt-1">
            Assigned sequentially — no PII, no manually chosen identifiers.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Notes <span className="opacity-40 font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Screening notes, inclusion/exclusion summary…"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="inks-gray-1000 px-4 py-2 rounded text-sm font-medium hover:opacity-80"
          >
            Enroll {nextCode}
          </button>
          <a
            href="/subjects"
            className="px-4 py-2 rounded text-sm border opacity-60 hover:opacity-100"
          >
            Cancel
          </a>
        </div>
      </form>
    </Shell>
  );
}
