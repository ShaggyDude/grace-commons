// tools/conformance/lib/score.mjs
//
// The scoring kernel. Pure: no I/O, no DB, no adapter — takes the manifest's
// checks plus a map of check-id -> result and returns the tally. Kept separate
// from the runner so the denominator arithmetic is unit-testable in isolation
// (see tests/score.test.mjs).
//
// The number is COMPUTED here, not asserted anywhere. This file is the single
// implementation of the denominator rule documented in the manifest's
// `denominator_rule` block. If the two ever disagree, the manifest's prose is
// the contract and this file is the bug.
//
//   denominator = record-clearable AND render_scope == in-scope, AND evaluated
//                 (status pass|fail). pending/error are excluded from BOTH
//                 numerator and denominator, so a half-built run reports the
//                 honest fraction of what it actually measured rather than
//                 deflating toward 0 (a pending check is unmeasured, not failed).
//   numerator   = those that passed.
//   correctness = 100 * numerator / denominator, or null when nothing evaluated.
//
// Everything else — externally-clearable checks, record-clearable-but-
// out-of-render-scope checks — is bucketed and reported separately, never
// folded into the percentage.

/** @typedef {'pass'|'fail'|'pending'|'error'} Status */
/** @typedef {{ status: Status, detail?: string, offending?: any[] }} Result */

const isDenomEligible = (c) =>
  c.kind === "record-clearable" && c.render_scope === "in-scope";

/**
 * @param {Array<object>} checks   manifest.checks
 * @param {Record<string, Result>} results  check-id -> result
 * @returns {object} tally
 */
export function score(checks, results) {
  const get = (c) => results[c.id] ?? { status: "pending" };

  const denomEligible = checks.filter(isDenomEligible);
  const externally = checks.filter((c) => c.kind === "externally-clearable");
  const outOfScope = checks.filter(
    (c) => c.kind === "record-clearable" && c.render_scope === "out-of-scope",
  );

  const rows = denomEligible.map((c) => ({ check: c, result: get(c) }));
  const evaluated = rows.filter((r) => r.result.status === "pass" || r.result.status === "fail");
  const passed = evaluated.filter((r) => r.result.status === "pass");
  const failed = evaluated.filter((r) => r.result.status === "fail");
  const pending = rows.filter((r) => r.result.status === "pending");
  const errored = rows.filter((r) => r.result.status === "error");

  const numerator = passed.length;
  const denominator = evaluated.length;
  const correctness_pct =
    denominator === 0 ? null : Math.round((1000 * numerator) / denominator) / 10;

  // Severity gate, reported beside the % but never folded into it.
  const critical_fails = failed.filter((r) => r.check.severity === "critical");

  return {
    correctness_pct,
    numerator,
    denominator,
    in_scope_total: denomEligible.length,
    counts: {
      pass: passed.length,
      fail: failed.length,
      pending: pending.length,
      error: errored.length,
    },
    rows, // denominator-eligible, with results
    passed,
    failed,
    pending,
    errored,
    critical_fails,
    critical_fail_count: critical_fails.length,
    separate: {
      externally_clearable: externally,
      out_of_render_scope: outOfScope,
    },
  };
}
