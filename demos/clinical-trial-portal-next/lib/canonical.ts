/**
 * Canonical JSON for hashing: keys sorted lexicographically at every level,
 * no whitespace, numbers as JS numbers, null preserved. This is the ONLY
 * allowed JSON serializer for any value that will be hashed.
 *
 * PORTED BYTE-IDENTICAL from the first render
 * (demos/clinical-trial-portal/lib/canonical.ts). Do NOT "improve" it — the
 * cross-render portability of the audit hash chain depends on this producing
 * exactly the same bytes as render 1 (BUILD_PLAN §6.1).
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as object).sort();
  return "{" + keys.map((k) =>
    JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])
  ).join(",") + "}";
}
