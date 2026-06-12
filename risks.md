---
title: Risks & Mitigations
nav_order: 12
has_toc: true
toc: true
---

# Spec Layer Risks & Mitigations

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> Known failure modes of the spec-first architecture **and** the operational risks of building it — methodology, corpus integrity, tooling, and project operations. The scope was broadened 2026-06-11: the original register covered only "failure modes for the spec-first approach," and half of the risks the project had actually observed were process and operations risks with no home here. Each entry names the risk, how it manifests, and its mitigation with an honest deployment status — *(in place)*, *(designed, not deployed)*, or *(gap)*.
>
> **Ownership and cadence.** This register has an owner (the maintainer) and a dated re-assessment marker. Entries are added event-driven; the whole register is re-read on the scheduled-rescan cadence — not "when somebody remembers," the unowned-discipline failure mode [`pressure-testing.md`](./pressure-testing.md) names. **Last re-assessment: 2026-06-11**, absorbing the session-inputs working note of the same date.

---

## Maturity — an honest estimate (2026-06-11)

A dated stage estimate, by layer, so the register below reads against the project's actual age rather than its ambitions. The numbers are deliberate roughness — a guess, not a measurement.

- **Methodology (~80%) — the strongest layer.** The three-pass review, the 3×3 baseline plus AI-conducted Final Critique, the formal-layer vote, and the coverage cross-check are defined, exercised across the corpus, and self-correcting — the methodology has caught and recorded its own defects. What it lacks is mechanical enforcement, not definition.
- **Corpus (~60%) — solid and young.** The 2026-06-11 linter scan counted 27 atoms and 23 compositions, with formal models and checker-rejected buggy twins deep on the regulated spine; grounded counts and the open long tail live in [`roadmap.md`](./roadmap.md), the single source of truth.
- **Verification tooling (~40%) — working, first gate wired.** A mechanical linter (pre-alpha, proof-of-concept grade — six high-precision checks), a reproducible model harness, and a conformance validator with seven independent renders agreeing 20/20 all run today. As of 2026-06-11 the linter runs as a continuous-integration gate on every push and pull request (`.github/workflows/lint.yml`); the harness and conformance validator remain advisory — no gate fires them.
- **Generation (~15%) — the thesis itself, and the earliest layer.** No projector exists. Every render is hand-authored against its spec; "the compiler emits the test suite" is design intent, not shipped reality. The central claim — code as a derived build artifact — is currently demonstrated manually, not mechanically.
- **Adoption and organization (~5%) — pre-adoption.** One human author-adjudicator working with AI councils; no external contributors yet; the entire review gate runs on a single model vendor. This is the deliberate Years 0–3 configuration of [`the-spec-layer.md`](./the-spec-layer.md)'s trajectory, not a stall — the contributor call in [`readme.md`](./readme.md) is open, and this number is the one expected to move.

Net: **early-foundational** — inside the Years 0–3 band of [`the-spec-layer.md`](./the-spec-layer.md)'s own trajectory. A strong, honestly-reviewed spec corpus whose compiler is still a human.

---

## 1. Canonicity & Drift Problems

**Drift & Round-Tripping Hell** — Teams edit generated code directly and/or custom changes get overwritten on the next generation pass.

*Mitigation (in place at the contract layer):* Strict spec-first workflow; generated code is read-only; explicit, preserved extension points for custom logic that survives regeneration. *(gap):* Continuous-integration gates await a generation pipeline to gate.

**Core-doc divergence as the corpus scales** — The canonical documents drift apart: a rule stated in two places diverges, a mirror goes stale, promoting a document into the core surfaces latent contradictions. Observed, dated: the 2026-06-10/11 refactors were triggered by exactly this, and as of 2026-06-11 the roadmap still carried unqualified `grounded` for two compositions whose own files carry `grounded — formal coverage of Invariant 4 pending`, plus an internal constituent-list disagreement and a duplicated table row — all invisible to the linter, which scanned clean the same day.

*Mitigation (in place):* One-SSOT-per-rule ownership seams (SSOT — single source of truth); the no-snapshot rule (dated records only); six built mechanical lint checks (dangling links, invariant counts, missing models, stale forthcoming-markers, count drift, invariant-number references). *(gap):* The built check classes lag the observed failure classes — status-mirror agreement, table-versus-list agreement, and duplicate rows are all mechanizable and all uncovered (the lint gate runs in continuous integration as of 2026-06-11, so new checks enforce on arrival — but the blind spots remain blind until written); contradiction sweeps are event-driven, not cadenced. The precise risk is **green-but-blind**: a passing linter read as corpus health while its checks don't cover what is actually failing.

**Status semantics rotting into quiet fiction** — Deferred work (pending formal models, qualifiers, rescan dates) rots silently; a status claims more than the records support. Observed: two compositions claimed plain `grounded` over their own recorded coverage GAPs (corrected 2026-06-10), and the guided tool's first design emitted a formal-work queue with no drainer — the same rot, by construction.

*Mitigation (in place):* Honest qualified statuses (`grounded — X pending`); the coverage cross-check; staleness treated as a flagged finding. *(designed, not deployed):* Queue ownership, drain cadence, and computable staleness live in the guided tool's design document, which is not yet built. *(gap):* No automated staleness alarm — and a status fix that lands in the pattern file without propagating to the roadmap *creates* the divergence the previous entry describes. Propagation-on-fix is part of this risk, not a separate risk.

---

## 2. Specification Quality Issues

**Over-Specification** — Specs become too verbose, too rigid, or too slow to iterate against.

*Mitigation (in place):* Layered specs — core invariants first, full detail second. Light-mode specs for early exploration with mandatory hardening before composition or code generation.

**AI Hallucination / Subtle Errors — authoring and review arms** — Two distinct failure surfaces. *Authoring:* models introduce inconsistencies, weaken invariants, or produce plausible-sounding but wrong action signatures. *Review (the false gate):* friendly AI review that reasons about prose without opening the corpus praises and adds ideas while missing contradictions with the actual specs. Observed 2026-06-11: three friendly passes approved a rule that contradicted same-session work and carried a wrong worked example; a cold pass instructed to open the specs found four foundational findings in minutes.

*Mitigation (in place):* The adversarial Final Critique, AI-conducted in strict fresh-reader mode, plus diff review before changes land. (Corrected 2026-06-11: this entry previously claimed "mandatory human-led Pass 3," two methodology generations stale — the human role is triage of council findings, not conducting rounds.) *(gap):* "Verify every claim against the actual specs" is implied by fresh-reader discipline, not mandated — and mandating it requires amending the fresh-reader definition in [`pressure-testing.md`](./pressure-testing.md), which currently hands Pass 3 the pattern under review and *nothing else*. The codification must name which review seat opens the corpus and what "the corpus" means per artifact class (a pattern's constituents; a methodology document's ownership-seam peers). Working division of labor until then: **generate broad with friendly models; gate hostile, with verification.**

---

## 3. Human & Organizational Issues

**Review Fatigue (reader-side)** — Business stakeholders stop reading detailed specs; the canonical text becomes engineer-only in practice.

*Mitigation (in place):* Auto-generated summaries, diagrams, and decision checklists for non-technical reviewers. The canonical spec stays long; the derived views stay short.

**Readability debt (author-side)** — The bridge principle erodes as terse expert shorthand accumulates faster than it is cleaned; past readability sweeps failed to stick because a one-pass edit fights the same completeness pressure that produced the terseness.

*Mitigation (in place):* Self-explanatory-over-shorthand as standing guidance when authoring or touching a line. *(gap):* The discipline that actually holds — a standing rule, a terse-form linter, or a readability arm on the scheduled rescan — is undecided; filed in [`open-questions.md`](./open-questions.md) §Readability ↔ completeness.

**Adoption Resistance** — Engineers resent reduced code ownership; business resists writing or maintaining specs.

*Mitigation (in place):* Treat the spec as shared ownership, not a hand-off. Prove clear wins with small pilots. Lead with velocity and reduced defect rate, not methodology.

**The adjudication bottleneck** — Every finding, council output, and absorption routes through one human adjudicator. At the current corpus size and a weekly council cadence this holds; it does not scale, and it is also a bus factor of one.

*Mitigation (partial):* Council-run rescans keep the human cost at triage; Lineage notes make the corpus resumable by a successor. *(gap):* No second adjudicator; no documented succession.

---

## 4. Process & Tooling Risks

**Tooling Brittleness** — The code-generation pipeline is fragile, produces low-quality output, or breaks on edge cases.

*Mitigation (in place as policy):* Keep generators small, stable, and incremental. Prioritize clear error messages and partial regeneration over feature completeness.

**Scope Creep & Maintenance Burden** — The atom catalog becomes too large and internally inconsistent over time.

*Mitigation (in place):* Strict topological ordering, derived classification, dependency tracking, scheduled rescans. The [`roadmap.md`](./roadmap.md) dependency order is the operational form.

**Enforcement debt — a class, not an instance** — Disciplines get specified faster than they get enforcement points: lint checks built but wired to no gate; the drain queue designed but unbuilt; the new-convention gate applied ad hoc. Each instance reads as mitigated ("the check exists") while nothing fires it automatically.

*Mitigation (proposed):* Name the enforcement point — gate, cadence, or owner — in the same edit that lands the discipline; a discipline without one is recorded as *(designed, not deployed)*, never *(in place)*. *(closed for the linter, 2026-06-11):* the lint gate runs in continuous integration (`.github/workflows/lint.yml`). *(gap):* the model harness and conformance validator still have no gate, and the drain queue remains unbuilt.

**Methodology bloat / over-machinery** — Each new rule or convention adds machinery; new conventions silently duplicate rules that already exist. Observed: a proposed structural-relation rule arrived as a full convention with formal-model hooks and collapsed to one Pass-3 checklist line once the adversarial pass proved most of it restated existing disciplines.

*Mitigation (in place):* Smallest-machinery-that-closes-the-gap; the EOS over-absorption check applied to conventions themselves. *(gap → proposed):* Make "is this a new rule, or an instance of existing ones?" a standing gate before any convention lands — housed in [`pressure-testing.md`](./pressure-testing.md) §The methodology applied to itself, not a new document.

**Reviewer-vendor dependence** — The entire grounding gate (Final Critique, clearance gate, council rescans) runs on a single model family. Model regression, drift, or unavailability silently changes the bar `grounded` means.

*Mitigation (partial):* Lineage records the model per round, so a regression is at least attributable after the fact. *(gap):* No cross-vendor control round; no periodic calibration against a known-findings pattern.

**Build-before-spec temptation** — Jumping to implementation before the spec is sound: the library's own thesis, violated on its own tooling. Observed: the guided tool was nearly coded before it was spec'd; spec-first then caught eight foundational holes before a line of code. Spec-first was not faster up front — consistent with the thesis, whose payoff is correctness and cheap regeneration, not first-draft speed.

*Mitigation (in place):* Design-doc-before-code for internal tooling; internal tooling is not exempt from the methodology. The temptation recurs precisely when the team is moving fast and confident — which is this entry's reason to exist.

---

## 5. Project & Operational Risks *(category added 2026-06-11)*

**Public/private boundary fragility (moat exposure)** — The commercial track (the discovery engine; future paid tooling) is separated from the public repo by a single uncommitted, machine-local git exclusion that does not travel with clones — any fresh checkout is unprotected — and the private directory is absent from the site generator's exclusion list, so if it were ever tracked it would also publish to the live site. Two armed switches, both single-point. Observed: a non-secret document was once published to the live site by exactly the tracked-versus-published confusion.

*Mitigation (in place):* The tracked-but-unpublished split (git-tracked **and** site-excluded) for working notes; the private directory is engine-only and excluded from both git (machine-local exclude) and the site generator. *(considered and declined, 2026-06-11):* a private repository and a monorepo-encrypted variant (git-crypt over `internal/**`) were both weighed; the maintainer declined the second-repo maintenance burden and the encryption tooling. *(gap, accepted):* the engine has no version history and no off-machine copy — a disk failure, or a careless `git add -A` on a fresh clone where the machine-local exclude does not exist, remains the exposure. Accepted knowingly; this register keeps it honest. *(resolved 2026-06-11):* the guided tool's queue re-homed to `tools/guide/queue/` (tracked, site-excluded via `tools/`) — `internal/` stays engine-only and untracked.

**Register rot (this document)** — A risk register with no owner and no cadence rots into the quiet fiction it warns about; this register ran without either until 2026-06-11.

*Mitigation (in place as of 2026-06-11):* The ownership-and-cadence header; dated re-assessments; absorbed working notes recorded by date.
