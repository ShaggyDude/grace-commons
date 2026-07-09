---
title: Governance
nav_order: 2
parent: Community
has_toc: true
toc: true
---

# Governance

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

> **Draft.** A working proposal for how Grace Commons governs pattern admission and signals trust to consumers as the library matures.

---

## The problem

A pattern library is only as useful as it is trustworthy. Anyone can publish a collection of specs. What makes a spec worth building against is knowing it has been reviewed, that it won't change underneath you without notice, and that the version you built against is the same one everyone else sees.

The three-pass methodology in [`pressure-testing.md`](./pressure-testing.md) handles the quality bar for individual patterns. This document proposes what sits above that — the process for admitting patterns to the canonical library, and the mechanism that makes "admitted" mean something durable.

---

## Hybrid review

Software fails in two ways: logical failures and judgment failures. A logical failure is a missing state, an invariant that doesn't hold, an action that doesn't enumerate its rejections. A judgment failure is a spec that is technically complete but solves the wrong problem, or adds complexity the library doesn't need.

The existing three passes already embody this split. Pass 1 (GRID structural) is mechanical — a spec either resolves all nine nodes or it doesn't. Pass 2 (EOS conceptual independence) and Pass 3 (Linus adversarial) require judgment — conducted, under the current methodology, by AI reviewers in fresh-reader mode (the Final Critique and the council-run rescans; see [`pressure-testing.md`](./pressure-testing.md)), with human attention spent on triage and adjudication of their findings rather than on conducting rounds. The governance layer formalizes the resulting split: a machine gate runs first and is a hard block, AI-conducted adversarial review supplies the findings, and a named human authority adjudicates the admission call. *(Corrected 2026-06-11; this paragraph previously claimed Passes 2 and 3 were human-conducted, which predated the council methodology.)*

The review body is the **ALL Council** — AI plus humans, together covering all the bases a solo reviewer cannot. The name is the concept: neither alone is sufficient.

---

## Cryptographic sealing

When a pattern is admitted to the canonical library, it receives a cryptographic seal — a content hash of the specification at that version, recorded in a tamper-evident log. The seal is not the file's Git hash; it is a stable identity for a specific, reviewed version of the spec.

What this gives consumers:

- **Version pinning.** Pin to a sealed version and know it hasn't changed since it was reviewed.
- **Provenance.** The seal is proof that a specific version was reviewed and admitted at a specific point in time.
- **Drift detection.** A consumer holding a sealed hash can verify their local copy against the canonical version at any time.

This is the library applying its own [Tamper Evidence](./atoms/tamper-evidence.md) atom to itself — which is the right thing to do.

---

## Open questions

1. **Sealing mechanism.** Git-based content hashing is the simplest path. RFC 3161 external timestamping provides stronger legal provenance. The right answer depends on how far the library's institutional ambitions reach.

2. **Council composition.** The minimum viable form is a small group with domain expertise across the library's categories — enough to catch judgment failures that the authoring passes miss. Growth path is an open working-group model as the contributor community develops.

3. **Versioning.** When a sealed pattern is revised, the new version is reviewed and re-sealed; the old seal remains valid for consumers pinned to it. The deprecation path for older versions needs a short spec of its own.

---

## Relationship to existing documents

- [`pressure-testing.md`](./pressure-testing.md) — the authoring standard that feeds the Council's review gate.
- [`contributing.md`](./contributing.md) — the contribution lifecycle that precedes Council admission.
- [`execution-contract.md`](./execution-contract.md) — sealed patterns are the stable inputs to the compilation pipeline.
- [Tamper Evidence](./atoms/tamper-evidence.md) — the integrity primitive the sealing mechanism instantiates.

---

*Draft. The direction is right; the specifics are open.*
