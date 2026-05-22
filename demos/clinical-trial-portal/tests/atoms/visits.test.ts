// tests/atoms/visits.test.ts — Regulated artifact: Visit

import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as visits from "../../domain/visits.ts";
import * as subjects from "../../domain/subjects.ts";
import * as studies from "../../domain/studies.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

function seedSubjectAndRecorder(ctx: { db: any }) {
  const study = studies.create(ctx.db, `VIS-${Date.now()}`, "Visit Test Study");
  const party = parties.create(ctx.db, `recorder-${Date.now()}@x.com`, "Recorder");
  const recorder = actors.create(ctx.db, party.id);
  const subject = subjects.create(ctx.db, {
    study_id: study.id,
    subject_code: `VSUB-${Date.now()}`,
    enrolled_by_actor_id: recorder.id,
  });
  return { subject, recorder };
}

Deno.test("visits.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const { subject, recorder } = seedSubjectAndRecorder(ctx);
    const v = visits.create(ctx.db, {
      subject_id: subject.id,
      visit_kind: "screening",
      recorded_by_actor_id: recorder.id,
      notes: "Initial screening",
    });
    assertEquals(v.subject_id, subject.id);
    assertEquals(v.visit_kind, "screening");
    assertEquals(v.recorded_by_actor_id, recorder.id);
    assertEquals(v.notes, "Initial screening");
  });
});

Deno.test("visits.getById returns visit", () => {
  withTestDb((ctx) => {
    const { subject, recorder } = seedSubjectAndRecorder(ctx);
    const v = visits.create(ctx.db, { subject_id: subject.id, visit_kind: "week_4", recorded_by_actor_id: recorder.id });
    assertEquals(visits.getById(ctx.db, v.id)?.visit_kind, "week_4");
  });
});

Deno.test("visits.getById returns null for unknown id", () => {
  withTestDb((ctx) => {
    assertEquals(visits.getById(ctx.db, 9999), null);
  });
});

Deno.test("visits.listBySubject returns visits for that subject", () => {
  withTestDb((ctx) => {
    const { subject, recorder } = seedSubjectAndRecorder(ctx);
    visits.create(ctx.db, { subject_id: subject.id, visit_kind: "screening", recorded_by_actor_id: recorder.id });
    visits.create(ctx.db, { subject_id: subject.id, visit_kind: "week_4", recorded_by_actor_id: recorder.id });
    assertEquals(visits.listBySubject(ctx.db, subject.id).length, 2);
  });
});

Deno.test("visits.listBySubject returns empty array for subject with no visits", () => {
  withTestDb((ctx) => {
    const { subject } = seedSubjectAndRecorder(ctx);
    assertEquals(visits.listBySubject(ctx.db, subject.id).length, 0);
  });
});

Deno.test("visits.create rejects empty visit_kind", () => {
  withTestDb((ctx) => {
    const { subject, recorder } = seedSubjectAndRecorder(ctx);
    assertThrows(() =>
      visits.create(ctx.db, { subject_id: subject.id, visit_kind: "", recorded_by_actor_id: recorder.id })
    );
  });
});

Deno.test("visits.create accepts null notes", () => {
  withTestDb((ctx) => {
    const { subject, recorder } = seedSubjectAndRecorder(ctx);
    const v = visits.create(ctx.db, { subject_id: subject.id, visit_kind: "week_12", recorded_by_actor_id: recorder.id, notes: null });
    assertEquals(v.notes, null);
  });
});
