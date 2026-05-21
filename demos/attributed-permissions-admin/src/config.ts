// Attributed Permissions Admin Demo — configuration constants.
// Derived from the Configuration block in attributed-permissions-admin.md.

/**
 * The actor used for system-originated attestations in automated pipelines.
 * Seeded in src/db/seed.ts.
 */
export const SYSTEM_ACTOR_REF = "system@apa-demo";

/**
 * Port the development server listens on.
 */
export const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
