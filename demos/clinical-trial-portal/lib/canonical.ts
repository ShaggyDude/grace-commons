/**
 * Canonical JSON for hashing: keys sorted lexicographically at every level,
 * no whitespace, numbers as JS numbers, null preserved. This is the ONLY
 * allowed JSON serializer for any value that will be hashed.
 *
 * Exported from lib/canonical.ts to ensure centralized control.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as object).sort();
  return "{" + keys.map((k) =>
    JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])
  ).join(",") + "}";
}
