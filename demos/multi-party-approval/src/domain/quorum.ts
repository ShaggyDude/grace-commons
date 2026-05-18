// Quorum evaluation rule — pure, deterministic, order-independent.
//
// Transcribed directly from BUILD_PLAN.md §6 (which transcribes the spec's
// *Quorum evaluation rule* subsection). This function is the only place
// in the codebase that decides chain terminal state from a vote vector.
//
// one-of-N is unified with M-of-N at m=1 per the spec's Round-2 finding.
// all-of-N is kept as a separate branch for readability; it is provably
// equivalent to M-of-N with m=n, but the explicit branch matches the spec's
// own framing and makes the Rejected/Withdrawn priority rule obvious.

export type QuorumKind = "all-of-N" | "M-of-N" | "one-of-N";

export type QuorumVector = {
  a: number; // Approved steps
  r: number; // Rejected steps
  w: number; // Withdrawn steps
  p: number; // Pending steps
};

export type QuorumState = "Pending" | "Approved" | "Rejected" | "Withdrawn";

/**
 * Evaluates the current vote vector against the declared quorum rule.
 *
 * @param kind  - The quorum kind declared at chain initiation.
 * @param m     - Required approvals for M-of-N; null for all-of-N / one-of-N.
 * @param vector - Current (A, R, W, P) counts; must satisfy a+r+w+p = n.
 * @returns The chain state implied by the current vector.
 *
 * Note: this function does NOT know about `trailing`. The caller (chain.ts)
 * checks chain.state before calling; if already terminal, evaluate is skipped.
 */
export function evaluate(
  kind: QuorumKind,
  m: number | null,
  vector: QuorumVector,
): QuorumState {
  const { a, r, w, p } = vector;
  const n = a + r + w + p;

  if (kind === "all-of-N") {
    // Every approver must approve.
    if (a === n) return "Approved";
    // Rejection takes priority over withdrawal — if any step is rejected,
    // quorum is unreachable regardless of withdrawals.
    if (r >= 1) return "Rejected";
    if (w >= 1) return "Withdrawn"; // r === 0 implied by reaching here
    return "Pending";
  }

  // M-of-N and one-of-N (one-of-N = M-of-N with m=1)
  const M = kind === "one-of-N" ? 1 : m!;

  if (a >= M) return "Approved";

  // Remaining achievable approvals: steps not yet rejected or withdrawn
  const achievable = n - r - w;

  if (achievable < M) {
    // Quorum is no longer reachable.
    // Rejection takes priority over withdrawal in the audit record.
    if (r >= 1) return "Rejected";
    return "Withdrawn"; // w >= 1 implied: achievable < M with r=0 means w > 0
  }

  return "Pending";
}
