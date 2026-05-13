---
title: Risks & Mitigations
nav_order: 9
---

# Spec Layer Risks & Mitigations

> Known failure modes for the spec-first approach, grouped by category. Each entry names the risk, how it manifests, and the mitigation. This is a living document — risks are added as the architecture encounters them in practice, not on a fixed schedule.

---

## 1. Canonicity & Drift Problems

**Drift & Round-Tripping Hell** — Teams edit generated code directly and/or custom changes get overwritten on the next generation pass.

*Mitigation:* Enforce a strict spec-first workflow with CI gates. Generated code is read-only. Provide explicit, preserved extension points and hooks for custom logic that survives regeneration.

---

## 2. Specification Quality Issues

**Over-Specification** — Specs become too verbose, too rigid, or too slow to iterate against.

*Mitigation:* Use layered specs — core invariants first, full detail second. Allow light-mode specs for early exploration with mandatory hardening before any composition or code generation proceeds.

**AI Hallucination / Subtle Errors** — Models introduce inconsistencies, weaken invariants, or produce plausible-sounding but wrong action signatures.

*Mitigation:* Mandatory human-led adversarial pressure-testing (Pass 3) plus diff reviews on every change before code generation. The three-pass methodology exists precisely to catch this class of failure.

---

## 3. Human & Organizational Issues

**Review Fatigue** — Business stakeholders stop reading detailed specs; the canonical text becomes engineer-only in practice.

*Mitigation:* Auto-generate concise summaries, state machine diagrams, and decision checklists tailored for non-technical reviewers. The canonical spec stays long; the derived views are short.

**Adoption Resistance** — Engineers resent reduced code ownership; business resists writing or maintaining specs.

*Mitigation:* Treat the spec as shared ownership, not a hand-off. Prove clear wins with small pilots. Lead with velocity and reduced defect rate, not methodology.

---

## 4. Process & Tooling Risks

**Tooling Brittleness** — The code-generation pipeline is fragile, produces low-quality output, or breaks on edge cases.

*Mitigation:* Keep generators small, stable, and incremental. Prioritize clear error messages and partial regeneration support over feature completeness.

**Scope Creep & Maintenance Burden** — The atom catalog becomes too large and internally inconsistent over time.

*Mitigation:* Strict topological ordering, strong categorization, dependency tracking, and scheduled refactoring cycles. The ROADMAP.md dependency order is the operational form of this mitigation.
