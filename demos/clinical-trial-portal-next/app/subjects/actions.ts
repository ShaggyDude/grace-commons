"use server";
// app/subjects/actions.ts — Study Coordinator write side: enroll a subject
// (subject.enrolled) and record a visit (visit.recorded). Both gate with C14
// then call composition.ts; no atom is written here.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db.ts";
import * as studies from "@/domain/studies.ts";
import * as composition from "@/composition.ts";
import { currentCtx } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";

const STUDY_PROTOCOL = "BCN-OX-201";
const SUBJECT_PREFIX = "BCN";

/** Enroll a subject; redirect to its detail page. */
export async function enrollSubject(formData: FormData): Promise<void> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["enroll_subject"]))) redirect("/subjects");

  const study = await studies.getByProtocol(db, STUDY_PROTOCOL);
  if (!study) redirect("/subjects");

  const notes = String(formData.get("notes") ?? "").trim() || null;

  // redirect() must live OUTSIDE the try (it throws NEXT_REDIRECT).
  let newId: number | null = null;
  try {
    const subject = await composition.enrollSubject(ctx, {
      study_id: study!.id,
      prefix: SUBJECT_PREFIX,
      notes,
    });
    newId = subject.id;
  } catch {
    /* fall through to the new-subject page */
  }

  if (newId === null) redirect("/subjects/new");
  redirect(`/subjects/${newId}`);
}

/** Record a visit for a subject; revalidate the detail page. */
export async function recordVisit(formData: FormData): Promise<void> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["record_visit", "enroll_subject"]))) return;

  const subject_id = Number(formData.get("subject_id"));
  const visit_kind = String(formData.get("visit_kind") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!Number.isInteger(subject_id) || !visit_kind) {
    if (Number.isInteger(subject_id)) revalidatePath(`/subjects/${subject_id}`);
    return;
  }

  try {
    await composition.recordVisit(ctx, { subject_id, visit_kind, notes });
  } catch {
    /* surfaced by the unchanged detail render */
  }
  revalidatePath(`/subjects/${subject_id}`);
}
