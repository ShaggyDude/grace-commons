// Grace Commons Demo — configuration constants derived from the spec's
// Configuration block (multi-party-approval.md).
//
// These are exported constants rather than a database table because the
// demo is single-tenant. See BUILD_PLAN.md §4.7 for the rationale.

/** Minimum number of steps (approvers) a chain must declare. */
export const APPROVER_SET_MINIMUM = 1;

/**
 * If true, all actor_refs in a chain's approver_set must be pairwise-distinct.
 * The spec names this as a configuration option; the demo enables it.
 */
export const APPROVER_SET_UNIQUENESS = true;

/** Quorum kinds allowed when initiating a chain. */
export const QUORUM_RULE_ALLOWED: ReadonlyArray<string> = [
  "all-of-N",
  "M-of-N",
  "one-of-N",
];

/**
 * Default retention policy applied to audit events when the calling
 * context doesn't supply one. Overridden per-chain in seed scenarios.
 */
export const AUDIT_TRAIL_RETENTION_POLICY = "sox_7_year" as const;

/**
 * The application actor used for system-originated audit entries
 * (chain_resolved, cascade_completed). Seeded in src/db/seed.ts.
 */
export const APPLICATION_ACTOR_REF = "system@demo";

/**
 * Default actor when no cookie is present (demo convenience).
 * Lets the app boot straight to a usable state without a login flow.
 */
export const DEFAULT_ACTOR_REF = "controller_morgan";
