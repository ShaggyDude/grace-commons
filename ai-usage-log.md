---
title: AI Usage Log
nav_order: 14
---

# AI Usage Log

Per NLnet NGI Zero Commons Fund GenAI policy (December 2025).

---

## Policy statement

Grace Commons uses AI assistance throughout its authoring process — for drafting specifications, running structured pressure-testing rounds, generating and checking formal models, and assisting with demo implementation. All AI-assisted work is **Human-In-The-Loop (HITL)**. Scott Romack is the named architectural vertex at every decision point: AI drafts and pressure-tests; the human author decides, edits, revises, and is solely responsible for everything published to this repository.

This log records the models used, the nature of AI assistance at each phase, and the human decisions made. It does not reproduce every prompt and unedited output verbatim — the volume across a multi-month project makes that impractical in a single file. Session-level detail is available on request. The grant-proposal-specific AI use is separately disclosed in the NLnet form's GenAI text field.

This file will be updated with each substantive AI-assisted session throughout the funded period.

---

## Models

| Model | Role | Notes |
|---|---|---|
| Claude (Anthropic) | Primary | Specification authoring, pressure-testing passes, formal model drafting, demo implementation, proposal writing. Model versions used: claude-opus-4 (clearance gates), claude-sonnet-4 (routine passes and implementation). |
| GPT-4 (OpenAI) | Tie-breaker | Used when a specification finding or architectural decision is contested and the author wants a second independent read with no prior context from the Claude session. Not used for primary authoring. |
| Grok (xAI) | External reviewer | Used for independent technical review of the grant proposal, demo architecture, and methodology claims. Grok sessions are conducted with no prior context from Claude or GPT-4 sessions — its value is the genuinely independent read. Contributed to: proposal credibility review (six rounds), Beacon security review (scope guard finding, canonical JSON boundary documentation), Logic Confinement Principle formalization, Year 1 roadmap framing, and EU alignment narrative. Not used for primary authoring. |

---

## Methodology summary

The pressure-testing methodology (documented in full at [`pressure-testing.md`](./pressure-testing.md)) defines three structured passes applied to every atom and composition before it reaches `grounded` status:

- **Pass 1 — GRID (Generative):** AI generates the initial draft from an author-written intent summary. Author reviews and edits.
- **Pass 2 — EOS (Observational):** AI reads the drafted spec as a fresh reader and identifies gaps, internal contradictions, and missing invariants. Author adjudicates each finding.
- **Pass 3 — Linus (Adversarial):** AI stress-tests the spec against adversarial inputs and edge cases with no goodwill assumptions. Author adjudicates each finding.
- **Phase 4 — Opus clearance gate:** A higher-capability model (Opus) reads the spec after all Pass 3 findings are closed and applies a final adversarial round. Spec does not proceed to `grounded` until this gate is clean.

GPT-4 is occasionally used as a second voice in Phase 4 when findings are ambiguous — a "tie-breaker" read with no prior context from the Claude sessions.

---

## Session log

Sessions are grouped by project phase. Each entry identifies the date, the model(s) used, the nature of the AI assistance, and the human decision that resolved it.

---

### Phase 0 — Project inception and Spec Layer (2026-04-29 to 2026-05-08)

**2026-04-29**
Model: Claude (sonnet)
Work: Initial drafting of `the-spec-layer.md` — the architectural manifesto establishing atoms, compositions, and the projector thesis. AI generated candidate framing; author revised substantially to establish the "bridge not wall" principle and the information-management triad.
Human decision: Author established the canonical vocabulary (atom, composition, projector) and the principle that verbosity serves humans, not machines.

**2026-04-30**
Model: Claude (sonnet)
Work: Credibility pass on `the-spec-layer.md` — AI identified and softened overclaims in the initial draft. "Diagrams are views, not truth" principle added.
Human decision: Author accepted the softening and added the canonical-text-source principle as a load-bearing architectural commitment.

**2026-05-07 to 2026-05-08**
Model: Claude (sonnet)
Work: First pattern (`patterns/productivity/personal-todo.md`) authored through full three-pass methodology. `pressure-testing.md` and `contributing.md` drafted with AI assistance and author-edited into the discipline documents the library now runs on.
Human decision: Author established the foundational-density threshold and the lineage-notes discipline as non-negotiable quality gates.

---

### Phase 1 — Compliance and resource-lifecycle atom sprint (2026-05-11 to 2026-05-15)

**2026-05-13**
Model: Claude (sonnet + opus)
Work: Six atoms grounded in a single session: Legal Hold, Consent, Soft Delete, Approval Step, Selective Disclosure, and Provisional Commitment. Each went through the full three-pass methodology. AI ran all three passes; author adjudicated all findings. Opus clearance gate applied to each.
Human decision: Author established the sequencing principle — atoms are ordered by composition dependency, not by domain aesthetics.

**2026-05-13**
Model: Claude (opus)
Work: Three compositions grounded: Defensible Retention (C1), Multi-Party Approval (C4), Notification Fanout (C5). Multi-Party Approval is the library's principal proof of concept — the Opus adversarial round (internally called "Super-Torvalds") generated 20+ findings across quorum algebra and trailing decision semantics; author adjudicated all findings before declaring `grounded`.
Human decision: Author established trailing decision semantics as the canonical resolution rule for simultaneous yes votes in one-of-N quorums — a compliance-critical design choice.

**2026-05-14**
Model: Claude (sonnet + opus)
Work: Party Identity atom grounded. Opus clearance gate found six findings; all closed in-pattern.
Human decision: Author clarified the Unverified/Verified/Suspended/Closed lifecycle as distinct from the auth-token surface — a library-level architectural boundary.

**2026-05-15**
Model: Claude (sonnet + opus)
Work: Capacity Constraint Enforcement atom grounded. Two Phase 4 Opus rounds required (round 1: 11 foundational findings; round 2: 3 foundational + 5 refining + 1 rhetorical). First atom grounded under the revised 92%-good threshold.
Human decision: Author made the call to require two clearance rounds rather than accept the spec after round 1 — the threshold held.

---

### Phase 2 — Auth and identity cluster (2026-05-19 to 2026-05-21)

**2026-05-19**
Model: Claude (sonnet)
Work: Credential and Session atoms grounded. Invitation atom grounded. All three went through the full three-pass methodology.
Human decision: Author confirmed the bearer-token / identity-binding distinction between Invitation and Capability as a first-class design boundary.

**2026-05-20**
Model: Claude (sonnet + opus)
Work: Login (C13) and Session-Gated Authorization (C14) compositions grounded. TLA+ model for Privileged Access Provisioning authored with AI assistance; bounded checker confirmed key temporal invariants.
Human decision: Author decided to formally verify the session lifecycle before implementation rather than after — a methodology-level decision about when formal tools add value.

**2026-05-20**
Model: Claude (sonnet)
Work: Privileged Access Provisioning composition (C12) authored and grounded. Included TLA+ model with author-supervised bounded verification.

**2026-05-21**
Model: Claude (sonnet + opus)
Work: External Onboarding (C16) grounded. Attributed Permissions Admin (APA) composition grounded — surfaced by implementation pressure on the demo. Session-Gated Authorization Alloy model authored.
Human decision: Author confirmed APA as a distinct, library-level composition rather than an implementation detail — it was originally an implementation artifact that earned promotion.

**2026-05-21**
Model: Claude (sonnet)
Work: Healthcare atoms — Clinical Observation and Medication Order — authored with AI assistance and grounded. These are worked examples of the methodology applied to HIPAA / 21 CFR Part 11 domain rather than the core compliance cluster. Two atoms in the productivity category (Assignment, Personal Todo) also grounded.
Human decision: Author decided healthcare atoms belong in a separate category rather than in compliance — they anchor a different regulatory surface.

---

### Phase 3 — Clinical trial portal demo (2026-05-21 to 2026-05-26)

**2026-05-21 to 2026-05-22**
Model: Claude (sonnet)
Work: Phases 1–6 of the Beacon clinical trial portal (`demos/clinical-trial-portal/`) implemented with AI assistance. Stack: Deno + Hono + SQLite + HTMX + Tailwind. Composition layer (`composition.ts`), atom helpers, hash-chain audit trail, all routes and views, and test suite (81 passing tests as of Phase 1 completion).
Human decision: Author held the composition boundary — mutations only through `composition.ts`, no state changes outside that surface. AI-generated code that violated this was rejected.

**2026-05-22**
Model: Claude (sonnet)
Work: Fly.io deploy config, GitHub Actions, and WALKTHROUGH.md authored. Alloy model for Attributed Permissions Admin composed at spec level.
Human decision: Author sized the Fly.io instance (shared-cpu-2x / 1 GB) based on Argon2id hashing cost analysis — a runtime decision that AI assisted with but did not determine.

**2026-05-22**
Model: Claude (sonnet)
Work: Login TLA+ model authored with AI assistance. Formal verification stack documentation expanded.

**2026-05-23**
Model: Claude (sonnet + opus), GPT-4 (tie-breaker)
Work: TLA+ models for Privileged Access Provisioning cleaned up for TLC 2.19 CLI compatibility. Round 5 and Round 6 Lineage entries for Session-Gated Authorization verification recorded. GPT-4 used as tie-breaker on one contested R5 finding about session revocation ordering.
Human decision: Author accepted the GPT-4 read on the contested finding and closed it as refining rather than foundational.

**2026-05-25**
Model: Claude (sonnet + opus)
Work: Preference / Personalization atom (`atoms/preference.md`) drafted and taken through Pass 1 (GRID), Pass 2 (EOS), Pass 3 (Linus), and one refinement round. Phase 4 Opus clearance gate run; 13 findings closed. Second gate run pending at end of session.
Human decision: Author did not declare `grounded` despite passing one Opus gate — second gate run discipline held. Atom is `partially resolved`.

**2026-05-25 to 2026-05-26**
Model: Claude (sonnet)
Work: Demo polish — `.env` wiring, Inks CSS integration, retention filter default (`enforce_on_read = true`), mailer log improvements. Phase 7 SMTP invite flow (Resend + ngrok tunnel) wired end-to-end and smoke-tested.
Human decision: Author confirmed the retention filter default as ON rather than OFF — a regulatory stance, not a UX preference.

---

### Phase 4 — Formal model coverage audit (2026-05-27)

**2026-05-27**
Model: Claude (sonnet)
Work: `roadmap.md` updated with new "Formal model coverage" section inventorying six shipped formal-model artifacts (Alloy, TLA+, or both) across one atom and five compositions. `CORNERS.md` for the clinical trial portal updated to record deferred formal-model follow-up items.
Human decision: Author established the convention for moving a pattern from Deferred to Shipped in the formal-model registry.

---

### Phase 5 — NLnet grant proposal and pre-submission hardening (2026-05-27 to 2026-05-29)

**2026-05-27**
Model: Claude (sonnet)
Work: NLnet NGI Zero Commons Fund application drafted with AI assistance across multiple sessions. AI generated candidate text for all form fields; author reviewed, edited, and approved each section. Final review pass (finding and fixing factual claims, budget arithmetic, atom counts, jargon) conducted with AI assistance under author's direction.
Human decision: Author made all editorial decisions including budget structure (7 sprints at €60/hr × 60 hrs), atom count corrections, removal of overclaimed second-stack demo, and GenAI disclosure wording.

**2026-05-27 to 2026-05-29**
Model: Grok (xAI) — external reviewer; Claude (sonnet) — implementation
Work: Grok conducted six independent review rounds on the grant proposal (form fields and work plan attachment), each producing scored findings the author adjudicated. Grok also conducted a technical security review of the Beacon demo — surfacing the `/subjects/:id` own-scope gap (no detail-view guard matching the list-view filter), the CSV export attestation boundary, and the canonical JSON `undefined` edge case. Claude implemented the own-scope fix, wrote a regression test (107 passing), documented the remaining findings in `CORNERS.md`. Grok contributed the Logic Confinement Principle formalization (six rules, now in `execution-contract.md`), the Year 1 roadmap framing (~100 atoms, tag-based ontology), and the EU alignment narrative ("the upper layer Europe's open digital ecosystems have been missing") now in `readme.md`. FAIR/EOSC/digital sovereignty paragraph added to Technical Challenges field. Backdated `study.registered` audit event seeded to Beacon live DB to make retention filter demonstrable.
Human decision: Author accepted the own-scope fix as a pre-submission blocker and shipped it. Author accepted the Logic Confinement Principle as a first-class architectural commitment. Author set the ~100 atom Year 1 target as directional. Author approved all EU alignment language.

### Phase 6 — Formal-layer completion, pattern sprint, and the conformance loop (2026-06-02 to 2026-06-07)

**2026-06-02 to 2026-06-04**
Model: Claude (opus — orchestration, gating, formal models; sonnet — drafting subagents)
Work: The entire formal-model backlog landed — 18 TLA+ models and 4 Alloy structural models, each with a buggy twin the checker rejects; the formal-layer vote sweep, bar reconsideration, and inaugural coverage cross-check (6 genuine coverage GAPs surfaced and labeled). Net-new patterns grounded in an Opus-plan → Sonnet-draft → Opus-gate pipeline: Provenance, Workflow / State Machine, Chain of Custody (C12), Stateful Workflow Execution (C10), Forensic Recovery (C3), Consent & Preference Management (C2), Reservation Lifecycle (C9), KYC / Customer Onboarding (C8). Token spend per chunk recorded in `measurement.md` (drafter-side floors).
Human decision: Author set the gating bar (foundational findings block; refining/rhetorical recorded), adjudicated every Final Critique finding, approved each grounding, and made the bar-reconsideration call returning three clock/precedence patterns to English-only.

**2026-06-05 to 2026-06-06**
Model: Claude (opus)
Work: The conformance validator (`tools/conformance/`) built end-to-end: hand-authored manifest off the Generation-acceptance prose, render-agnostic evaluators, per-render adapters, scoring kernel, defect injection, regen-fix loop, derive-from-prose reconcile, ghost-flow scenario engine, and multi-render agreement (`agree.mjs`). Renders 2–5 authored (two by isolated-context agents); the validator's first run against render 1 caught a real genesis-hash audit bug (fixed in the demo; retained as an injectable defect). Render 2 of the portal (Next.js + Postgres) completed and validated as render 6 — the real app's store. Findings logged in `discoveries.md` (2026-06-05 ×3, 2026-06-06).
Human decision: Author approved the denominator rule (record-clearable, in-scope, equal-weight), the catch-and-fix handling of the genesis bug (spec unchanged; demo patched through review), and the six-render agreement claim wording.

**2026-06-07**
Model: Claude (opus — Cowork agent session)
Work: Mongo ghost render built and verified in-sandbox (`demos/clinical-trial-portal-mongo`): spec-derived core on the mongodb driver, replica-set transactions, the fourth serialize-clause mechanism (unique chain-position index + optimistic retry, measured by `prove-serialization.mjs`), the invariant → enforcer discovery table, validator + ghost adapters; 20/20 conformance, seven-render agreement at 100%, chain byte-identical under the JS canonical contract. Go render compiled and verified against its golden in-sandbox. Public docs updated (demos.md, discoveries.md 2026-06-07 entry); root-doc currency sweep (readme tree, CHANGELOG, EXECUTION_CONTRACT fourth mechanism, PRESSURE_TESTING round-structure canonicalization, linter TAXONOMY exclusion).
Human decision: Author directed the render's discovery framing (findings vs CORNERS routing), committed the render after reviewing the proposed message, approved adding ghost renders to the public docs ("more evidence"), and commissioned the root-doc sweep.

### Phase 7 — Refactor 1: core-doc constitutional cluster (2026-06-10)

**2026-06-10**
Model: Claude (fable — Cowork agent session)
Work: Refactor 1, session 1, against the 2026-06-10 review handoff (`internal/refactor-1-findings.md`): the A7 ownership seam between spec-format.md and execution-contract.md (containers vs. section-content semantics; mapping tables declared SSOT; section-name lint check specified); the A3 composition-state adjudication (derived-index rule + extraction rule in the Contract's new §Composition state; spec-format §Application state deferring; Idempotency Result Memo atom proposal and methodology debt #9 opened in ROADMAP; provisional classification matrix staged at `internal/composition-state-audit.md`); the A2 §Substrate composition invocation section, pressure-tested against the fourteen substrate-using compositions; the A1 no-snapshot rule (stated once in CLAUDE.md) with the drifted snapshots removed from spec-format and the Contract. Resolved findings struck from the handoff doc.
Human decision: Author scoped the session to the constitutional cluster only (A7+A3 → A2 → A1; no A4/A5/A6, no pattern edits), fixed the adjudication order, and adjudicated the proposed commit series.

**2026-06-10 (Refactor 1, session 3 — A4: rescan automation + the first council-run rescan batch)**
Model: Claude Fable 5 (conducting session, triage, folds); claude-sonnet-4-6 (council Pass 1 / Pass 2 agents); claude-opus-4-8 (council Pass 3 strict fresh-reader agents).
Work: Canonicalized the automated council as the default scheduled-rescan executor in `pressure-testing.md` §Scheduled rescan (parameterized cost model: deployment-set weekly rescan budget; risk-weighted ordering — oldest rescan date first, tie-broken by composition fan-in; no corpus-size arithmetic per the no-snapshot rule). Ran the first real council-run rescan batch on the risk-weighted top three — Credential (fan-in 5), Session (4), Capability (2), all last rounded 2026-05-19. All three closed clean with `grounded` retained; findings folded per pattern (see each Lineage §Scheduled rescan 2026-06-10). The formal-layer portion re-verified `credential.tla` + both twins with a `MaxC` 3→4 saturation bump, surfaced and closed Capability's missing-buggy-twin model-present-bar violation (`capability-buggy.als` authored, rejected on the three expected counterexamples), and emitted/updated coverage matrices (`coverage/capability.md` new; `coverage/credential.md` updated).
**Measured cost — the cost model's first data point:** Credential 13 agent invocations (8 Sonnet, 5 Opus) over 5 rounds, ≈850k subagent tokens; Session 9 (6S/3O) over 3 rounds, ≈470k; Capability 9 (6S/3O) over 3 rounds, ≈520k (plus twin authoring + 3 harness runs). Batch total: 31 agent invocations, ≈1.84M subagent tokens, wall time ≈25–220s per agent run in parallel batches. Rule of thumb pending more data: a clean-ish rescan ≈3 rounds / 9 agents / ≈0.5M subagent tokens; each round of folded findings adds ≈1–2 rounds. Round count, not pattern size, dominated cost. Council false positives occurred (Round-1 Pass 1 validated C-numbers against nav_order instead of the ROADMAP SSOT) — caught in triage and corrected in subsequent council prompts; triage is where human/conductor attention earned its keep, exactly as the new canon predicts.
Human decision: Author scoped the session to A4 only (doc edit + proof batch; exclusions C6/C12/C3; hard stops on A5/A6, the pressure-testing split, and the linter) and set the convention that prompts and review outputs stay out of the repo. Commit pending author approval.

**2026-06-12 (Alloy Round 4 + issue #1)**
Model: Claude Fable 5 (Cowork session).
Work: Round 4 refactor of `compositions/attributed-permissions-admin.als` per the same-day EOS forum review (dnj): unified Alloy 6 temporal model replacing the Dyn\* namespace split; spec invariants as initial-state facts with preservation *proven* under `always` rather than assumed (deliberate `1..2 steps` inductive bound, justification recorded in-file; Invariant 7's temporal half promoted by-construction → covered); `Pairing_Map_Range_Valid` fact → assert + check; `enum` GrantStatus; new buggy twin `attributed-permissions-admin-buggy.als` committing the Invariant-7 regression gate as the model's vacuity guard (model-present bar criterion 2 — previously undischarged on the Alloy artifact). Ran the gate in the sandbox harness: canonical PASS (13 checks hold / 5 runs satisfiable); twin correctly rejected on exactly the four expected counterexamples. Wrote the Round 4 Formal-model Lineage entry in the pattern file. Second thread: drafted the author's reply to issue #1 (why composition models don't reference constituent models) and canonicalized the answer as `pressure-testing.md` §Why composition models do not import constituent models. Drafted commit messages and the EOS follow-up post.
Human decision: Author ran the regression gate locally, reviewed the diffs, and approved/landed the Round 4 commit (8c4b1e5). Pressure-testing §-addition commit, the issue #1 reply, the EOS post, and touch-triggered re-pass scheduling remain the author's calls.

---

## Ongoing log format

Each new session should be appended in this format:

```
**YYYY-MM-DD**
Model: [model name and variant]
Work: [what AI generated or assisted with — be specific]
Human decision: [what the architectural vertex decided, accepted, rejected, or changed]
```

If a session involved contested findings resolved by GPT-4 tie-breaker, note that explicitly.

---

*Maintained by Scott Romack (Mus.llc). Questions about any specific session: scott.romack@gmail.com.*
