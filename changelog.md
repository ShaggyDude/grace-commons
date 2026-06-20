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

- **Vocabulary sweep: `application` → `composition`; J/K scoped to the live body
  (2026-06-18).** Swept the banned output-noun "application" to the canonical
  "composition" across the live body of every atom and composition — a composed
  pattern is a *composition*, not an "application" — and migrated the legacy
  "Application state" section heading to the canonical "Composition state" (per
  [`execution-contract.md`](./execution-contract.md) §Composition state).
  Presentation-only: no invariant, signature, or grounding change, no re-pass.
  The vocabulary lint rules **J** (working-noun → canonical: "concept") and **K** ("application") are now
  scoped to the live spec body, **exempting Lineage notes** (dated historical
  narration, like `roadmap.md` and `glossary.md` already are), and **K** scrubs
  standards proper-nouns (OWASP *Application Security Verification Standard*,
  ISO/IEC 27001 *System and Application Access Control*, DoD *software applications*)
  as fixed terms of art — same mechanism as the existing "Application Programming
  Interface" gloss. Result: `K-output-noun` 428 → 0. (The **J** sweep of the
  live body was completed as a separate pass — see entry below.)

- **`concern` → `concept` sweep; linter green (2026-06-18).** Completed the **J**
  half of the vocabulary work: the banned working-noun `concern` → the canonical
  "concept" across the live body of every spec — *"the unit of separation is the
  concept"* ([`the-spec-layer.md`](./the-spec-layer.md)). `separation of concerns` →
  "separation of concepts"; the "matter handled at layer X" sense was rephrased
  (e.g. `a deployment concern` → "handled at the deployment layer") rather than
  synonym-swapped; "Separation of Concerns" kept only as the Dijkstra citation;
  pre-triage items → "candidate concept". `lint.py`'s **J** rule now also scrubs
  code spans (a backticked mention is not working use — matching **K**), and
  the-spec-layer's "one letter of drift" was corrected to "a two-letter drift"
  (`concerns` → `concepts`). Presentation-only, no re-pass. The vocabulary linter is
  now **green — 0 findings** (J, K, and the status-mirror check all at zero).

- **Grandfathering retired (2026-06-18).** Every pattern grounded before the AI
  adversarial round was codified — the 13 under-vetted specs plus 2 that were
  ambiguous on inspection — received its first real fresh-reader Final Critique
  (Opus, Happy-Torvalds-X2) under the 92%-good threshold and now carries a
  canonical `grounded on Final Critique N` token (mostly 4; Capacity Constraint
  Enforcement at 5); 12 already-vetted specs were retro-relabeled to the canonical
  form rather than re-passed. The recurring root defect was Logic Confinement
  (time / ids / cryptographic material generated *inside* the transition), fixed
  corpus-wide to the host-injected-at-seam form with caller signatures unchanged
  (additive, no constituent cascade). With no spec left on the legacy form, the
  **§Grandfathered-patterns clause and the legacy `grounded — YYYY-MM-DD` status
  form** are removed from [`pressure-testing.md`](./pressure-testing.md), the
  legacy-form regex is removed from [`tools/linter/lint.py`](./tools/linter/lint.py),
  and roadmap methodology-debt #3 is resolved.

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
- **Refactor 1, methodology cluster (2026-06-10)** — the A4/A5/A6 methodology
  refactor, closing the Refactor 1 handoff:
  - **Scheduled-rescan automation (A4).** [`pressure-testing.md`](./pressure-testing.md)
    §Scheduled rescan names the automated council as the default executor (Pass 3
    in strict fresh-reader mode throughout), with the cost model stated as
    parameters, never a snapshot: a weekly rescan budget plus risk-weighted
    ordering when short (oldest rescan date first, tie-broken by composition
    fan-in). Proven, not just stated — the first council-run rescan batch
    (Credential / Session / Capability) clean-closed with Lineage entries, Status
    bumps, coverage matrices, and measured cost in
    [`ai-usage-log.md`](./ai-usage-log.md); the batch also closed Capability's
    missing-buggy-twin model-present-bar violation.
  - **Composition-layer extraction gate (A5).**
    [`pressure-testing.md`](./pressure-testing.md) §Pass 2 gains an extraction
    trigger one level up from the atom-level questions: when to retire a recurring
    emergent invariant or wiring decision *across compositions* into a shared
    substrate. Stated as a firing rule — a conjunction of three gates
    (invariant-level recurrence, not atom-set co-occurrence; an emergent invariant
    surface of its own; Jackson's freestanding-concept test, decisive) with
    forthcoming-debt as a tie-breaker, not a gate — plus a worked case running
    Immutable Transaction Ledger's *dual-store atomic-commit* candidate through the
    gates to show Gate 3 declines it. Hardened under two fresh-reader Torvalds
    (Pass 3) rounds.
  - **The pressure-testing.md split — declined (A6).** The proposed three-way
    split (a lean process document, a new `formal-layer.md`, and capability-
    provenance / change-history relocations) was considered and **declined**; the
    rationale is recorded in [`pressure-testing.md`](./pressure-testing.md)
    §Recursive application as a Pass-2 self-finding against the methodology
    document. Decisive: the formal-layer vote is a universal grounding gate that
    does not separate from the three-pass pipeline without splitting one rule
    across two files (the one-SSOT-per-rule violation the A7 seam just ended);
    much of the grounded corpus links section-into-file at the sections that would
    move, and a corrected cross-reference is itself a touch-trigger; the weakest
    finding in the set does not justify the cost. A concrete re-open condition is
    recorded.
  - **Handoff retired (Meta).** `internal/refactor-1-findings.md` dispersed and
    deleted: resolved findings live in their owning docs and the patterns'
    Lineage notes, the mirror-check findings (MC-C12-1 / MC-C3-1) in the Chain of
    Custody / Forensic Recovery coverage matrices, and this history here. The
    handoff is done when the staging file has nothing left to say.

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
