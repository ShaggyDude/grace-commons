# CORNERS — Mongo ghost render

Implementation preferences and environment notes, per the CLAUDE.md
finding-vs-preference discipline: nothing here names a contradiction inside a
spec; everything here is render-local. Spec contradictions would go through the
review channel as findings — none surfaced during this build.

1. **Partial index does not port.** Postgres `idx_grants_grantee … WHERE
   revoked_at IS NULL` is a partial non-unique index (performance, not an
   invariant). Mongo's `partialFilterExpression` cannot express equality-to-null,
   so `schema.mjs` creates a plain compound index instead. Functional behavior
   identical; the active-grants lookup scans revoked grants too. Revisit only if
   a real deployment cares (e.g. flip to a sparse boolean `active` field).

2. **`revokeGrant` mirrors render 2's no-existence-check behavior.** Render 2's
   `composition.ts` updates the grant row and appends `grant.revoked` without
   first checking the grant exists — a revoke of a nonexistent grant is a no-op
   update plus an attestation that references nothing. This render transcribes
   that behavior deliberately (the port is faithful; diverging here would create
   a cross-render behavioral split that belongs to render 2's own review, not to
   this port). The ghost scenario never exercises the path; APA-5 (orphan
   attestations) is out-of-render-scope for the whole render family.

3. **memory-server version pin.** In the build sandbox a system mongod 7.0.14
   (`MONGOMS_SYSTEM_BINARY`) served all runs; mongodb-memory-server's default
   requested version was newer (8.x) and it logs a benign version-conflict
   warning before using the system binary. Unpinned environments download the
   default; pin with `MONGOMS_VERSION` or `MONGOMS_SYSTEM_BINARY` if
   reproducibility across machines starts to matter.

4. **The validator's "read-only" boot journals.** The adapter only reads
   collections, but booting mongod over the persisted directory lets the engine
   write journal/diagnostic files (directory mtimes change). Records-alone in
   content, not in filesystem bytes. Same caveat would apply to any
   engine-with-a-server render.

5. **BSON int width.** Ids are JS numbers and land as int32 (they are small);
   `schema.mjs` accepts `int`/`long`/`double` so a future id past 2^31 would
   still validate. Hash byte-identity is unaffected either way — ids round-trip
   as JS numbers; the canonical serializer sees the same value it hashed.
