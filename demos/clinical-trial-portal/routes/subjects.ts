// routes/subjects.ts — Study Coordinator surface: enroll subjects, record visits
//
// View components called as plain functions (no JSX syntax in .ts file).

import { Hono } from "hono";
import type { AppEnv } from "../lib/env.ts";
import { requireSession } from "../middleware/require_session.ts";
import { requirePermission } from "../middleware/require_permission.ts";
import * as studies from "../domain/studies.ts";
import * as subjects from "../domain/subjects.ts";
import * as visits from "../domain/visits.ts";
import * as grants from "../domain/grants.ts";
import * as composition from "../composition.ts";
import { SubjectsListPage } from "../views/subjects_list.tsx";
import { SubjectsNewPage } from "../views/subjects_new.tsx";
import { SubjectsDetailPage } from "../views/subjects_detail.tsx";

const canAccessSubjects = requirePermission("enroll_subject", "record_visit");
const canEnrollSubjects = requirePermission("enroll_subject");

const STUDY_PROTOCOL = "BCN-OX-201";
const SUBJECT_PREFIX = "BCN";

export const subjectsRouter = new Hono<AppEnv>();

subjectsRouter.get("/subjects", requireSession, canAccessSubjects, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;

  const study = studies.getByProtocol(db, STUDY_PROTOCOL);
  if (!study) return c.text("Study not found — run deno task seed first.", 500);

  const allGrants = grants.listForActor(db, actor.id);
  const canEnroll = allGrants.some(
    (g) => g.revoked_at === null && g.permission_code === "enroll_subject",
  );

  const scope = c.get("granted_scope") ?? "own";
  const subjectList = scope === "all"
    ? subjects.listByStudy(db, study.id)
    : subjects.listByStudy(db, study.id).filter((s) => s.enrolled_by_actor_id === actor.id);

  return c.html(SubjectsListPage({ actor, study, subjects: subjectList, canEnroll }) as string);
});

subjectsRouter.get("/subjects/new", requireSession, canEnrollSubjects, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;

  const study = studies.getByProtocol(db, STUDY_PROTOCOL);
  if (!study) return c.text("Study not found — run deno task seed first.", 500);

  const nextCode = subjects.nextSubjectCode(db, SUBJECT_PREFIX);
  return c.html(SubjectsNewPage({ actor, study, nextCode }) as string);
});

subjectsRouter.post("/subjects", requireSession, canEnrollSubjects, async (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;
  const form = await c.req.formData();
  const notes = (form.get("notes") as string | null)?.trim() || null;

  const study = studies.getByProtocol(db, STUDY_PROTOCOL);
  if (!study) return c.text("Study not found.", 500);

  try {
    const subject = composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: SUBJECT_PREFIX,
      notes,
    });
    return c.redirect(`/subjects/${subject.id}`);
  } catch (err) {
    const nextCode = subjects.nextSubjectCode(db, SUBJECT_PREFIX);
    const msg = err instanceof Error ? err.message : "Enrollment failed.";
    return c.html(SubjectsNewPage({ actor, study, nextCode, error: msg }) as string, 400);
  }
});

subjectsRouter.get("/subjects/:id", requireSession, canAccessSubjects, (c) => {
  const ctx = c.get("ctx");
  const db = ctx.db;
  const actor = ctx.actor!;

  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.redirect("/subjects");

  const subject = subjects.getById(db, id);
  if (!subject) return c.text("Subject not found.", 404);

  // Enforce own-scope on the detail view — same rule as the list.
  const scope = c.get("granted_scope") ?? "own";
  if (scope === "own" && subject.enrolled_by_actor_id !== actor.id) {
    return c.text("Not Found.", 404);
  }

  const visitList = visits.listBySubject(db, id);
  const allGrants = grants.listForActor(db, actor.id);
  const canRecord = allGrants.some(
    (g) =>
      g.revoked_at === null &&
      (g.permission_code === "record_visit" || g.permission_code === "enroll_subject"),
  );
  const flash = c.req.query("flash") ?? null;

  return c.html(SubjectsDetailPage({ actor, subject, visits: visitList, canRecord, flash }) as string);
});

subjectsRouter.post(
  "/subjects/:id/visits",
  requireSession,
  requirePermission("record_visit", "enroll_subject"),
  async (c) => {
    const ctx = c.get("ctx");
    const db = ctx.db;
    const actor = ctx.actor!;

    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.redirect("/subjects");

    const form = await c.req.formData();
    const visit_kind = (form.get("visit_kind") as string | null) ?? "";
    const notes = (form.get("notes") as string | null)?.trim() || null;

    const subject = subjects.getById(db, id);
    if (!subject) return c.text("Subject not found.", 404);

    const getCanRecord = () => {
      const g = grants.listForActor(db, actor.id);
      return g.some(
        (gr) =>
          gr.revoked_at === null &&
          (gr.permission_code === "record_visit" || gr.permission_code === "enroll_subject"),
      );
    };

    if (!visit_kind) {
      return c.html(
        SubjectsDetailPage({
          actor, subject, visits: visits.listBySubject(db, id),
          canRecord: getCanRecord(), error: "Visit type is required.",
        }) as string,
        400,
      );
    }

    try {
      composition.recordVisit(ctx, { subject_id: id, visit_kind, notes });
      return c.redirect(`/subjects/${id}?flash=Visit+recorded.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record visit.";
      return c.html(
        SubjectsDetailPage({
          actor, subject, visits: visits.listBySubject(db, id),
          canRecord: getCanRecord(), error: msg,
        }) as string,
        400,
      );
    }
  },
);
