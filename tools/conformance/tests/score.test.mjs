// tools/conformance/tests/score.test.mjs
//   node --test tools/conformance/tests/
//
// Unit tests for the scoring kernel — the denominator rule made executable.
// No DB, no adapter; just the arithmetic that produces the number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { score } from "../lib/score.mjs";

const C = (id, kind, render_scope, severity = "major") => ({
  id, kind, render_scope, severity, claim: id,
});

// A small synthetic manifest spanning every disposition.
const checks = [
  C("R1", "record-clearable", "in-scope", "critical"),
  C("R2", "record-clearable", "in-scope", "major"),
  C("R3", "record-clearable", "in-scope", "critical"),
  C("R4", "record-clearable", "in-scope", "major"),
  C("X1", "externally-clearable", "out-of-scope"),
  C("O1", "record-clearable", "out-of-scope"),
];

test("denominator = in-scope record-clearable that were evaluated; pending excluded", () => {
  const t = score(checks, {
    R1: { status: "pass" },
    R2: { status: "fail" },
    R3: { status: "pass" },
    // R4 omitted -> pending
  });
  assert.equal(t.in_scope_total, 4);
  assert.equal(t.denominator, 3); // R1,R2,R3 evaluated; R4 pending excluded
  assert.equal(t.numerator, 2);
  assert.equal(t.correctness_pct, 66.7); // 2/3
  assert.equal(t.counts.pending, 1);
});

test("externally-clearable and out-of-scope never enter the denominator", () => {
  const t = score(checks, {
    R1: { status: "pass" }, R2: { status: "pass" },
    R3: { status: "pass" }, R4: { status: "pass" },
    X1: { status: "fail" }, // must be ignored — not eligible
    O1: { status: "fail" }, // must be ignored — not eligible
  });
  assert.equal(t.denominator, 4);
  assert.equal(t.correctness_pct, 100);
  assert.equal(t.separate.externally_clearable.length, 1);
  assert.equal(t.separate.out_of_render_scope.length, 1);
});

test("all-pending run reports null (n/a), not a misleading 0%", () => {
  const t = score(checks, {});
  assert.equal(t.denominator, 0);
  assert.equal(t.correctness_pct, null);
  assert.equal(t.counts.pending, 4);
});

test("errored checks are excluded from the denominator (not counted as fails)", () => {
  const t = score(checks, {
    R1: { status: "pass" }, R2: { status: "pass" },
    R3: { status: "error", detail: "adapter threw" },
    R4: { status: "pass" },
  });
  assert.equal(t.denominator, 3); // R3 error excluded
  assert.equal(t.numerator, 3);
  assert.equal(t.correctness_pct, 100);
  assert.equal(t.counts.error, 1);
});

test("critical-fail gate is reported beside the % but never folds into it", () => {
  const t = score(checks, {
    R1: { status: "fail" }, // critical
    R2: { status: "pass" },
    R3: { status: "pass" }, R4: { status: "pass" },
  });
  assert.equal(t.correctness_pct, 75); // 3/4 — equal weight, severity ignored
  assert.equal(t.critical_fail_count, 1);
  assert.equal(t.critical_fails[0].check.id, "R1");
});
