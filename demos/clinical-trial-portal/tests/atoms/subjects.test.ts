// tests/atoms/subjects.test.ts — Regulated artifact: Subject

import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as subjects from "../../domain/subjects.ts";
import * as studies from "../../domain/studies.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

function seedStudyAndEnroller(ctx: { db: any }) {
  const study = studies.create(ctx.db, `SUBJ-${Date.now()}`, "Subject Test Study");
  const party = parties.create(ctx.db, `enroller-${Date.now()}@x.com`, "Enroller");
  const enroller = actors.create(ctx.db, party.id);
  return { study, enroller };
}

Deno.test("subjects.create writes row with status screening", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    const s = subjects.create(ctx.db, {
      study_id: study.id,
      subject_code: "BCN-001",
      enrolled_by_actor_id: enroller.id,
      notes: "First subject",
    });
    assertEquals(s.subject_code, "BCN-001");
    assertEquals(s.status, "screening");
    assertEquals(s.enrolled_by_actor_id, enroller.id);
  });
});

Deno.test("subjects.getByCode finds subject", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    subjects.create(ctx.db, { study_id: study.id, subject_code: "BCN-002", enrolled_by_actor_id: enroller.id });
    const found = subjects.getByCode(ctx.db, "BCN-002");
    assertEquals(found?.study_id, study.id);
  });
});

Deno.test("subjects.getByCode returns null for unknown code", () => {
  withTestDb((ctx) => {
    assertEquals(subjects.getByCode(ctx.db, "UNKNOWN"), null);
  });
});

Deno.test("subjects.getById returns subject", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    const s = subjects.create(ctx.db, { study_id: study.id, subject_code: "BCN-003", enrolled_by_actor_id: enroller.id });
    assertEquals(subjects.getById(ctx.db, s.id)?.subject_code, "BCN-003");
  });
});

Deno.test("subjects.listByStudy returns only subjects for that study", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    const study2 = studies.create(ctx.db, "OTHER-001", "Other Study");
    subjects.create(ctx.db, { study_id: study.id, subject_code: "A-001", enrolled_by_actor_id: enroller.id });
    subjects.create(ctx.db, { study_id: study2.id, subject_code: "B-001", enrolled_by_actor_id: enroller.id });
    assertEquals(subjects.listByStudy(ctx.db, study.id).length, 1);
  });
});

Deno.test("subjects.updateStatus changes status", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    const s = subjects.create(ctx.db, { study_id: study.id, subject_code: "STAT-001", enrolled_by_actor_id: enroller.id });
    subjects.updateStatus(ctx.db, s.id, "enrolled");
    assertEquals(subjects.getById(ctx.db, s.id)?.status, "enrolled");
  });
});

Deno.test("subjects.nextSubjectCode generates sequential code", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    assertEquals(subjects.nextSubjectCode(ctx.db, "BCN"), "BCN-001");
    subjects.create(ctx.db, { study_id: study.id, subject_code: "BCN-001", enrolled_by_actor_id: enroller.id });
    subjects.create(ctx.db, { study_id: study.id, subject_code: "BCN-013", enrolled_by_actor_id: enroller.id });
    assertEquals(subjects.nextSubjectCode(ctx.db, "BCN"), "BCN-014");
  });
});

Deno.test("subjects.create rejects duplicate subject_code", () => {
  withTestDb((ctx) => {
    const { study, enroller } = seedStudyAndEnroller(ctx);
    subjects.create(ctx.db, { study_id: study.id, subject_code: "DUP-001", enrolled_by_actor_id: enroller.id });
    assertThrows(() =>
      subjects.create(ctx.db, { study_id: study.id, subject_code: "DUP-001", enrolled_by_actor_id: enroller.id })
    );
  });
});
