// Attributed Permissions Admin Demo — configuration constants.
// Derived from the Configuration block in attributed-permissions-admin.md.

/**
 * The actor used for system-originated attestations in automated pipelines.
 * Seeded in src/db/seed.ts.
 */
export const SYSTEM_ACTOR_REF = "system@apa-demo";

/**
 * Default actor when no cookie is present (demo convenience).
 * Lets the app boot straight to a usable state without a login flow.
 */
export const DEFAULT_ACTOR_REF = "ciso_reyes";

/**
 * Port the development server listens on.
 */
export const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
