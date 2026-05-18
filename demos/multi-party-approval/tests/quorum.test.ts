// Exhaustive tests for quorum.ts.
//
// Two layers:
//   1. Named scenario tests — explicit expected values for key cases,
//      cross-referenced to the spec's worked examples and BUILD_PLAN.md §6.
//   2. Property sweep — all valid (a,r,w,p) tuples for n=1..5 under each
//      quorum kind, verifying internal consistency invariants that must hold
//      regardless of the specific output.

import { assertEquals } from "@std/assert";
import { evaluate, type QuorumVector } from "../src/domain/quorum.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function v(a: number, r: number, w: number, p: number): QuorumVector {
  return { a, r, w, p };
}

// Generate all (a,r,w,p) tuples with a+r+w+p === n, all values >= 0
function* allTuples(n: number): Generator<QuorumVector> {
  for (let a = 0; a <= n; a++) {
    for (let r = 0; r <= n - a; r++) {
      for (let w = 0; w <= n - a - r; w++) {
        const p = n - a - r - w;
        yield { a, r, w, p };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Named tests — all-of-N
// ---------------------------------------------------------------------------

Deno.test("all-of-N: all approved → Approved", () => {
  assertEquals(evaluate("all-of-N", null, v(3, 0, 0, 0)), "Approved");
  assertEquals(evaluate("all-of-N", null, v(1, 0, 0, 0)), "Approved");
});

Deno.test("all-of-N: not all approved, no failures → Pending", () => {
  assertEquals(evaluate("all-of-N", null, v(0, 0, 0, 3)), "Pending");
  assertEquals(evaluate("all-of-N", null, v(2, 0, 0, 1)), "Pending");
  assertEquals(evaluate("all-of-N", null, v(0, 0, 0, 1)), "Pending");
});

Deno.test("all-of-N: any rejection → Rejected (even with approvals)", () => {
  assertEquals(evaluate("all-of-N", null, v(0, 1, 0, 2)), "Rejected");
  assertEquals(evaluate("all-of-N", null, v(2, 1, 0, 0)), "Rejected");
  assertEquals(evaluate("all-of-N", null, v(0, 3, 0, 0)), "Rejected");
});

Deno.test("all-of-N: rejection takes priority over withdrawal", () => {
  // r=1, w=1 — Rejected wins
  assertEquals(evaluate("all-of-N", null, v(0, 1, 1, 1)), "Rejected");
  assertEquals(evaluate("all-of-N", null, v(1, 1, 1, 0)), "Rejected");
});

Deno.test("all-of-N: withdrawal only (r=0) → Withdrawn", () => {
  assertEquals(evaluate("all-of-N", null, v(0, 0, 1, 2)), "Withdrawn");
  assertEquals(evaluate("all-of-N", null, v(2, 0, 1, 0)), "Withdrawn");
  assertEquals(evaluate("all-of-N", null, v(0, 0, 3, 0)), "Withdrawn");
});

// SOX walkthrough from spec §Examples:
// chain-2026-0441, all-of-N, n=3
Deno.test("all-of-N: SOX walkthrough progression", () => {
  assertEquals(evaluate("all-of-N", null, v(0, 0, 0, 3)), "Pending"); // initial
  assertEquals(evaluate("all-of-N", null, v(1, 0, 0, 2)), "Pending"); // CFO approves
  assertEquals(evaluate("all-of-N", null, v(2, 0, 0, 1)), "Pending"); // Finance Dir approves
  assertEquals(evaluate("all-of-N", null, v(3, 0, 0, 0)), "Approved"); // CEO approves → done
});

// ---------------------------------------------------------------------------
// Named tests — M-of-N
// ---------------------------------------------------------------------------

Deno.test("M-of-N: m approvals reached → Approved", () => {
  assertEquals(evaluate("M-of-N", 2, v(2, 0, 0, 1)), "Approved"); // n=3, m=2
  assertEquals(evaluate("M-of-N", 2, v(3, 0, 0, 0)), "Approved"); // more than m
  assertEquals(evaluate("M-of-N", 1, v(1, 0, 0, 2)), "Approved"); // m=1
});

Deno.test("M-of-N: quorum still reachable → Pending", () => {
  assertEquals(evaluate("M-of-N", 2, v(0, 0, 0, 3)), "Pending"); // n=3, m=2, nothing decided
  assertEquals(evaluate("M-of-N", 2, v(1, 0, 0, 2)), "Pending"); // 1 approved, 2 pending
  assertEquals(evaluate("M-of-N", 2, v(0, 0, 1, 2)), "Pending"); // 1 withdrawn, 2 pending — achievable=2 >= m=2
  assertEquals(evaluate("M-of-N", 2, v(1, 1, 0, 1)), "Pending"); // achievable=n-r-w=2 >= m=2
});

Deno.test("M-of-N: quorum unreachable with rejection → Rejected", () => {
  // n=3, m=2: achievable = n-r-w = 1 < 2, r=1
  assertEquals(evaluate("M-of-N", 2, v(0, 1, 1, 1)), "Rejected");
  assertEquals(evaluate("M-of-N", 2, v(1, 1, 1, 0)), "Rejected");
  assertEquals(evaluate("M-of-N", 2, v(0, 2, 0, 1)), "Rejected"); // achievable=1 < 2, r=2
});

Deno.test("M-of-N: quorum unreachable by withdrawal only → Withdrawn", () => {
  // n=3, m=2: achievable = n-r-w = 1 < 2, r=0, w >= 1
  assertEquals(evaluate("M-of-N", 2, v(0, 0, 2, 1)), "Withdrawn");
  assertEquals(evaluate("M-of-N", 2, v(1, 0, 2, 0)), "Withdrawn");
  assertEquals(evaluate("M-of-N", 2, v(0, 0, 3, 0)), "Withdrawn");
});

Deno.test("M-of-N: rejection priority over withdrawal when quorum unreachable", () => {
  // n=4, m=3: achievable = 4-1-1 = 2 < 3, r=1 → Rejected not Withdrawn
  assertEquals(evaluate("M-of-N", 3, v(0, 1, 1, 2)), "Rejected");
});

// FDA walkthrough from spec §Examples:
// batch-release, M-of-N(2), n=3
Deno.test("M-of-N: FDA batch-release walkthrough", () => {
  assertEquals(evaluate("M-of-N", 2, v(0, 0, 0, 3)), "Pending");  // initial
  assertEquals(evaluate("M-of-N", 2, v(1, 0, 0, 2)), "Pending");  // santos approves
  assertEquals(evaluate("M-of-N", 2, v(2, 0, 0, 1)), "Approved"); // lopez approves → done, kim trailing
});

// ---------------------------------------------------------------------------
// Named tests — one-of-N (= M-of-N with m=1)
// ---------------------------------------------------------------------------

Deno.test("one-of-N: first approval → Approved", () => {
  assertEquals(evaluate("one-of-N", null, v(1, 0, 0, 2)), "Approved");
  assertEquals(evaluate("one-of-N", null, v(1, 2, 1, 0)), "Approved"); // a >= 1 wins
});

Deno.test("one-of-N: no approvals yet → Pending", () => {
  assertEquals(evaluate("one-of-N", null, v(0, 0, 0, 4)), "Pending");
});

Deno.test("one-of-N: all rejected → Rejected", () => {
  assertEquals(evaluate("one-of-N", null, v(0, 3, 0, 0)), "Rejected");
  assertEquals(evaluate("one-of-N", null, v(0, 4, 0, 0)), "Rejected");
});

Deno.test("one-of-N: all withdrawn → Withdrawn", () => {
  assertEquals(evaluate("one-of-N", null, v(0, 0, 3, 0)), "Withdrawn");
});

Deno.test("one-of-N: rejection priority over withdrawal", () => {
  assertEquals(evaluate("one-of-N", null, v(0, 1, 2, 0)), "Rejected");
});

// ICH GCP walkthrough: one-of-N, n=4
Deno.test("one-of-N: ICH GCP walkthrough — first PI approves terminates chain", () => {
  assertEquals(evaluate("one-of-N", null, v(0, 0, 0, 4)), "Pending");
  assertEquals(evaluate("one-of-N", null, v(1, 0, 0, 3)), "Approved");
});

// ---------------------------------------------------------------------------
// Property sweep — all valid tuples for n=1..5
// ---------------------------------------------------------------------------

Deno.test("property: all tuples n=1..5 return valid state", () => {
  const validStates = new Set(["Pending", "Approved", "Rejected", "Withdrawn"]);
  for (let n = 1; n <= 5; n++) {
    for (const vec of allTuples(n)) {
      // all-of-N
      const r1 = evaluate("all-of-N", null, vec);
      assertEquals(validStates.has(r1), true, `all-of-N invalid: ${JSON.stringify(vec)} → ${r1}`);

      // M-of-N for m=1..n
      for (let m = 1; m <= n; m++) {
        const r2 = evaluate("M-of-N", m, vec);
        assertEquals(validStates.has(r2), true, `M-of-N(${m}) invalid: ${JSON.stringify(vec)} → ${r2}`);
      }

      // one-of-N
      const r3 = evaluate("one-of-N", null, vec);
      assertEquals(validStates.has(r3), true, `one-of-N invalid: ${JSON.stringify(vec)} → ${r3}`);
    }
  }
});

Deno.test("property: Approved iff quorum condition holds", () => {
  for (let n = 1; n <= 5; n++) {
    for (const vec of allTuples(n)) {
      const { a, r, w } = vec;

      // all-of-N: Approved iff a === n
      if (evaluate("all-of-N", null, vec) === "Approved") {
        assertEquals(a, n, `all-of-N Approved but a(${a}) !== n(${n})`);
      }
      if (a === n) {
        assertEquals(evaluate("all-of-N", null, vec), "Approved");
      }

      // M-of-N: Approved iff a >= m
      for (let m = 1; m <= n; m++) {
        const res = evaluate("M-of-N", m, vec);
        if (res === "Approved") {
          assertEquals(a >= m, true, `M-of-N(${m}) Approved but a(${a}) < m`);
        }
        if (a >= m) {
          assertEquals(res, "Approved");
        }
      }
    }
  }
});

Deno.test("property: Rejected only when r >= 1 and quorum unreachable", () => {
  for (let n = 1; n <= 5; n++) {
    for (const vec of allTuples(n)) {
      const { a, r, w } = vec;

      if (evaluate("all-of-N", null, vec) === "Rejected") {
        assertEquals(r >= 1, true, `all-of-N Rejected but r=0`);
        assertEquals(a < n, true, `all-of-N Rejected but a===n`);
      }

      for (let m = 1; m <= n; m++) {
        if (evaluate("M-of-N", m, vec) === "Rejected") {
          assertEquals(r >= 1, true, `M-of-N(${m}) Rejected but r=0`);
          assertEquals(a >= m, false, `M-of-N(${m}) Rejected but a>=m`);
          assertEquals(n - r - w < m, true, `M-of-N(${m}) Rejected but achievable >= m`);
        }
      }
    }
  }
});

Deno.test("property: Withdrawn only when r === 0 and quorum unreachable", () => {
  for (let n = 1; n <= 5; n++) {
    for (const vec of allTuples(n)) {
      const { r, w } = vec;

      if (evaluate("all-of-N", null, vec) === "Withdrawn") {
        assertEquals(r, 0, `all-of-N Withdrawn but r=${r}`);
        assertEquals(w >= 1, true, `all-of-N Withdrawn but w=0`);
      }

      for (let m = 1; m <= n; m++) {
        if (evaluate("M-of-N", m, vec) === "Withdrawn") {
          assertEquals(r, 0, `M-of-N(${m}) Withdrawn but r=${r}`);
          assertEquals(w >= 1, true, `M-of-N(${m}) Withdrawn but w=0`);
        }
      }
    }
  }
});

Deno.test("property: one-of-N matches M-of-N(m=1) for all n=1..5 tuples", () => {
  for (let n = 1; n <= 5; n++) {
    for (const vec of allTuples(n)) {
      assertEquals(
        evaluate("one-of-N", null, vec),
        evaluate("M-of-N", 1, vec),
        `one-of-N diverges from M-of-N(1) at ${JSON.stringify(vec)}`,
      );
    }
  }
});
