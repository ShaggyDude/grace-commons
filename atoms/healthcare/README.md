---
title: Healthcare
parent: Atomic Concepts
nav_order: 7
has_children: true
has_toc: true
toc: true
---

# Healthcare atoms

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


Freestanding primitives for clinical and healthcare administrative systems. Each atom carries the regulated-pattern conventions required by HIPAA, HL7 FHIR, and 21 CFR Part 11.

| Atom | Status | What it models |
|------|--------|----------------|
| [Clinical Observation](./clinical-observation.md) | grounded | A single clinical measurement — vital sign, lab result, assessment score — with immutable attribution and an amendment/retraction trail |
| [Medication Order](./medication-order.md) | grounded — 2026-05-13 | A prescription record binding prescriber, patient, medication, and dosing regimen through verification, dispensing, administration, and terminal resolution — with a regulated chain of custody and an explicit pre-/post-dispensing amendment boundary |

---

*Healthcare atoms carry heavier specification obligations than general-purpose atoms. The regulated adversarial scenarios and generation acceptance sections are required, not optional — an external auditor with no developer access must be able to verify conformance from records alone. Every atom in this category is written to that bar.*

*The compliance surface is layered: HIPAA governs patient data handling, HL7 FHIR governs interoperability representation, and 21 CFR Part 11 governs electronic records in regulated clinical workflows. Each atom names which standards it anchors and where it defers to composing patterns.*
