/**
 * Canonical JSON for hashing: keys sorted lexicographically at every level,
 * no whitespace, numbers as JS numbers, null preserved. This is the ONLY
 * allowed JSON serializer for any value that will be hashed.
 *
 * PORTED BYTE-IDENTICAL from render 2 (demos/clinical-trial-portal-next/
 * lib/canonical.ts), which ported it byte-identical from render 1. Do NOT
 * "improve" it — the cross-render portability of the audit hash chain depends
 * on this producing exactly the same bytes as every other render.
 */
export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) =>
    JSON.stringify(k) + ":" + canonicalize(value[k])
  ).join(",") + "}";
}
