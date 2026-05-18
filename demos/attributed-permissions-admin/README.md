# Attributed Permissions Admin — Demo

Working implementation of the [Attributed Permissions Admin composition](../../compositions/attributed-permissions-admin.md). The composition wires two atoms — Permissions and Actor Identity — so every grant and revocation is atomically paired with a verifiable attestation. No path through the composition records a grant without first recording who issued it.

The Alloy model (`alloy/attributed-permissions-admin.als`) did real work during spec development: Invariant 7 (attestation exclusivity) was found by the model, not prose review. Three static checks produced counterexamples before `fact Invariant7_Attestation_Exclusivity` was added. The `/verify` page closes the loop — it evaluates all 8 invariants over the live DB state and labels each with its Alloy assertion name.

## Stack

Deno + Hono (JSX) + SQLite (`@db/sqlite`) + HTMX + Tailwind 4. Server-rendered hypermedia; no client-side framework. Same stack as the [Multi-Party Approval demo](../multi-party-approval/).

## Quick start

```sh
deno task setup      # no-op in Deno; documents the init step
deno task migrate    # create schema in data/apa-demo.sqlite
deno task seed       # insert demo actors, grants, and one orphan log entry
deno task dev        # watch-mode: Tailwind + server on :8000
deno task build:css  # single-pass Tailwind build
deno task test       # run all tests
```

## Source tree

- `src/app.ts` — Hono app factory; wires middleware and route groups.
- `src/main.ts` — entry point; starts Deno.serve.
- `src/config.ts` — environment constants (DB path, port, default actor).
- `src/db/` — `client.ts` (DB handle + `tx()` wrapper), `migrate.ts`, `seed.ts`, `schema.sql`.
- `src/domain/attestation.ts` — Actor Identity atom: `attest()`, `verify()`.
- `src/domain/grant.ts` — Permissions atom: `record_grant()`, `record_revocation()`, `check()`.
- `src/domain/orphan_log.ts` — `record_orphan()`, `listOrphans()`.
- `src/domain/composition.ts` — composition surface: `issue_grant()`, `revoke_grant()`, `verify_grant_attribution()`, `permitted()`. The only public interface for grant management.
- `src/middleware/` — `current_actor.ts` (cookie-based actor resolution), `error.ts`.
- `src/routes/` — `auth.ts` (actor switcher), `grants.ts` (issue/list/detail/revoke), `verify.ts` (invariant checker), `orphans.ts`.
- `src/views/` — JSX views: `layout.tsx`, `grant_list.tsx`, `grant_detail.tsx`, `new_grant.tsx`, `orphan_log.tsx`, `verify_page.tsx`.
- `app.css` — Tailwind 4 source; `src/inkset.css` — design-token CSS variables.

## Alloy model

`alloy/attributed-permissions-admin.als` contains the formal model. Run with the [Alloy Analyzer v6](https://alloytools.org) to reproduce the checks. The model has:

- 4 static structural checks (1 expected clean, 3 expected to find counterexamples before Invariant 7)
- 6 dynamic LTL checks over traced state (all expected clean)
- 4 sanity `run` predicates confirming the facts are not over-constrained

## Tests

- `attribution.test.ts` — issue_grant and revoke_grant happy/rejection paths; verify_grant_attribution for active and revoked grants.
- `invariants.test.ts` — One test per invariant (1–8), each labelled with its Alloy assertion name. This is the primary spec-conformance file.
- `scenarios.test.ts` — HTTP-level walkthroughs via `app.fetch()` covering SOX, HIPAA, and PCI DSS scenarios, plus the `/verify` and `/orphans` endpoints.

## Implementation findings

`CORNERS.md` records preferences and judgment calls — including a full explanation of the three intentionally-failing Alloy checks and why they led to Invariant 7 being named. Contradictions within the spec go to the spec's Lineage notes via the standard review channel, not here.

## Build history

`BUILD_PLAN.md` documents the phased build arc, schema decisions, and the invariant-to-Alloy-assertion mapping table (§12).
