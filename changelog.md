---
title: Changelog
nav_order: 15
---

# Changelog

All notable changes to Grace Commons are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has not yet
cut a versioned release, so everything below sits under **Unreleased**.

## [Unreleased]

### Added

- **Conformance validator** ([`tools/conformance/`](./tools/conformance/README.md)) —
  the level-1 feedback loop made into an artifact: it takes a running *render*
  (an implementation) plus its spec-derived manifest and returns a measured
  `correctness(%)` — the fraction of the spec's checkable claims the render
  provably honors. The core is dependency-free (Node built-ins only).
  - **Derive-from-prose.** The checks are lifted from each composition's
    *Generation acceptance* section; a reconcile pass (`extract-manifest.mjs
    --reconcile`) proves the manifest is zero-drift faithful to the spec.
  - **Regen-fix loop** (`regen.mjs`) — the validator as a fitness function:
    reads the red checks, proposes a fix, and keeps it only if the measured
    number rises (and rejects regressions).
  - **Ghost flows** (`ghost/`) — a render-agnostic scenario engine that drives
    any render through the same user journey via a small per-render adapter.
  - **Seven independent renders** of the clinical-trial-portal surface spanning
    SQLite (Deno), SQLite (Node), PostgreSQL (via `pglite`, in-WASM ×3 — two
    Next.js-shaped), an append-only flat-file JSONL log, and MongoDB. **Two**
    were authored from the spec in isolation, without sight of the other
    renders. The sixth is not a test fixture but the **real deployable app**
    ([`demos/clinical-trial-portal-next`](./demos/clinical-trial-portal-next/)) —
    the harness is pointed at the shipping store itself.
  - **Mongo ghost render**
    ([`demos/clinical-trial-portal-mongo/`](./demos/clinical-trial-portal-mongo/)) —
    the first document-store render: no foreign keys, no CHECKs, no schema-level
    delete discipline. Ships the invariant → enforcer discovery table (which
    Postgres-carried guarantees move to `$jsonSchema`, which to app code, which
    to runtime mechanism) and the **fourth** conforming mechanism for Event
    Log's serialize clause — replica-set transaction + unique chain-position
    index as fork guard + optimistic retry, measured by
    `prove-serialization.mjs`. The mongod-stored chain re-verifies
    byte-identically under the JS canonical contract.
  - **Multi-render agreement** (`agree.mjs`) — cross-render correctness: a spec
    claim counts only if it holds identically on every render. Currently
    **20/20** across all seven.
- **Demo 2 — second render of the clinical-trial portal**
  ([`demos/clinical-trial-portal-next/`](./demos/clinical-trial-portal-next/)) —
  a Next.js App Router + PostgreSQL build of the same surface as the Deno+SQLite
  demo. The atoms, composition, action codes, and hash-chain contract are a
  faithful port (dialect + async, not redesign); the audit chain is serialized
  by a global `pg_advisory_xact_lock` (Postgres MVCC needs the explicit lock
  SQLite gave for free). Backend, audit surface, and App Router UI complete and
  conformance-clean (render 6 above); the Fly.io deploy
  ([`DEPLOY.md`](./demos/clinical-trial-portal-next/DEPLOY.md)) is the remaining
  piece.

### Changed

- **Refactor 1, constitutional cluster (2026-06-10)** — three core-doc
  adjudications plus a drift sweep, from the 2026-06-10 review handoff:
  - **Ownership seam (A7).** [`spec-format.md`](./spec-format.md) owns the
    containers (sections, order, tiers); [`execution-contract.md`](./execution-contract.md)
    owns the runtime semantics of section contents. The Contract's mapping
    tables plus a new complete section-name classification are the SSOT bridge,
    with a bidirectional section-name lint check specified (sibling of the
    dangling-link check). No rule stated in both documents.
  - **Composition state (A3).** New Contract §Composition state: every
    Application-state element is either a *derived index* (fully rebuildable
    from constituent stores — named rebuild procedure, outside the atomicity
    surface, no consistency claim) or *extraction-pending* (a not-yet-extracted
    atom, declared). Resolves the Contract's internal three-passage
    inconsistency around Idempotent Reservation's `token_results`; spec-format
    §Application state now defers to the Contract. Opens the **Idempotency
    Result Memo** atom proposal and the corpus Application-state audit
    (ROADMAP 2026-06-10 bullet and methodology debt #9).
  - **Substrate invocation (A2).** New Contract §Substrate composition
    invocation: the composition-as-constituent interface, whole-pipeline
    nesting, layered atomicity (recoverable joint boundaries vs.
    sequential-with-compensation), declared instance topology (instance unity;
    declared direct invocation of substrate constituents; declared
    multi-instance cases), transitive reads through declared surfaces only,
    mechanism-capability invocation as the named residual, and recursive
    conformance. Pressure-tested against the fourteen substrate-using
    compositions.
  - **No-snapshot rule (A1).** Core docs carry no library-state snapshots;
    the rule is stated once ([`CLAUDE.md`](./CLAUDE.md) §Current state of the
    library) and the drifted snapshots were removed from spec-format's Status
    line and the Contract's composition-types and fan-out passages.

### Fixed

- **clinical-trial-portal — audit-chain genesis-hash bug.** The seeded genesis
  audit event (`study.registered`) was hashed *without* its `id`, while the
  append path (`appendEvent`/`verifyChain`) hashed *with* it. As a result
  `verifyChain` reported a false *"Tamper detected at event #1"* on a pristine
  database and, because it stops at the first divergence, never verified later
  events. The bug was found by the conformance validator on its first run
  (check `C1-2b`), confirmed render-specific by multi-render agreement, and fixed
  in `scripts/seed.ts` (the genesis row is now hashed with `id`, matching the
  append path). Full account in [`discoveries.md`](./discoveries.md).
  - **Operational note:** existing seeded databases must be re-seeded
    (wipe → migrate → seed) to adopt the corrected genesis hash.
