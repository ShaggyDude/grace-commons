---
title: Healthcare
parent: Atoms
nav_order: 7
has_children: true
---

# Healthcare atoms

Freestanding primitives for clinical and healthcare administrative systems. Each atom carries the regulated-pattern conventions required by HIPAA, HL7 FHIR, and 21 CFR Part 11.

| Atom | Status | What it models |
|------|--------|----------------|
| [Clinical Observation](./clinical-observation.md) | grounded | A single clinical measurement — vital sign, lab result, assessment score — with immutable attribution and an amendment/retraction trail |

---

*Healthcare atoms carry heavier specification obligations than general-purpose atoms. The regulated adversarial scenarios and generation acceptance sections are required, not optional — an external auditor with no developer access must be able to verify conformance from records alone. Every atom in this category is written to that bar.*

*The compliance surface is layered: HIPAA governs patient data handling, HL7 FHIR governs interoperability representation, and 21 CFR Part 11 governs electronic records in regulated clinical workflows. Each atom names which standards it anchors and where it defers to composing patterns.*
