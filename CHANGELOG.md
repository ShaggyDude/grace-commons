---
title: Changelog
nav_order: 998
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
  - **Four independent renders** of the clinical-trial-portal surface across
    four engines/paradigms — SQLite (Deno), SQLite (Node), PostgreSQL (via
    `pglite`, in-WASM), and an append-only flat-file JSONL log. Render 4 was
    authored from the spec in isolation, without sight of the others.
  - **Multi-render agreement** (`agree.mjs`) — cross-render correctness: a spec
    claim counts only if it holds identically on every render. Currently
    **20/20** across all four.

### Fixed

- **clinical-trial-portal — audit-chain genesis-hash bug.** The seeded genesis
  audit event (`study.registered`) was hashed *without* its `id`, while the
  append path (`appendEvent`/`verifyChain`) hashed *with* it. As a result
  `verifyChain` reported a false *"Tamper detected at event #1"* on a pristine
  database and, because it stops at the first divergence, never verified later
  events. The bug was found by the conformance validator on its first run
  (check `C1-2b`), confirmed render-specific by multi-render agreement, and fixed
  in `scripts/seed.ts` (the genesis row is now hashed with `id`, matching the
  append path). Full account in [`DISCOVERIES.md`](./DISCOVERIES.md).
  - **Operational note:** existing seeded databases must be re-seeded
    (wipe → migrate → seed) to adopt the corrected genesis hash.
