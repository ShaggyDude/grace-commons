// middleware/require_permission.ts
//
// C14: Session-Gated Authorization — permission check middleware
// SPEC: <atom or composition name> — to be quoted from library in Phase 1/2
//
// Usage: Applied after requireSession. Checks for an unrevoked grant of any
// of the named permission codes. Scope ('all' or 'own') is attached to ctx
// for downstream filtering.
// Unauthorized → 403 page naming the missing permission.

import type { Context, Next } from "hono";

// TODO: Phase 3 — Implement:
//   - Check for an unrevoked grant where:
//     - grantee_actor_id = ctx.actor.id
//     - permission_code IN (...codes)
//     - revoked_at IS NULL
//   - Attach ctx.granted_scope ('all' | 'own')
//   - Return 403 ForbiddenPage if no grant found
