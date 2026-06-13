# Concept recovery — run 9 (final): Medplum / FHIR saturation (the standard test, 2026-06-13)

> **Status: internal staging, not canonical.** The **final breadth run**, and the strongest external check available: not a vendor's data model but an **international standard**. Subject: [`medplum/medplum`](https://github.com/medplum/medplum) **v5.1.17** (TypeScript, Apache-2.0, ~2.2k stars) — an **FHIR-native** healthcare developer platform. Medplum doesn't author a bespoke schema; it implements **HL7 FHIR** (the global healthcare interoperability standard), surfaced as 214 generated TypeScript type files (166 resource types). So this run recovers concepts from *the standard itself*, through Medplum as the lens — a fifth language (TypeScript) and a modeling paradigm (standard-defined resources) unlike any prior target. Chosen to resolve the Coded Concept / Terminology Binding candidate (FHIR has literal `CodeSystem`/`ValueSet`/`ConceptMap` resources) and to cross-check the grounded **Provenance** atom (FHIR `Provenance`). Method: tier-1 aggregate over the FHIR type set + tier-3 source reads of the load-bearing resource definitions. **Verdict: the atoms map onto FHIR resource-for-pattern — the strongest validation in the arc, because FHIR is a committee-designed, globally-deployed standard, not one team's model. The Terminology Binding candidate is resolved (FHIR factors it in three), Provenance is validated against the standard, and recursive composition gets a fifth, standardized witness.**

## Why ending here is the right note

Run 7 worried that a grounded atom might be idealized; OpenMRS answered it for one vendor. FHIR answers it for the *standard*. If the library's atoms are the patterns HL7 already codified — after a decade of international committee work and worldwide deployment — that is far stronger than matching any single codebase. The claim shifts from *"our taxonomy is internally consistent"* (runs 3–6) through *"it matches a real system"* (runs 1–2, 7–8) to *"it matches the interoperability standard the industry agreed on."* That is the ceiling of what reverse-recovery breadth can establish, which is why this is the last one.

## Tier-1 aggregate (the FHIR resource set — *computed facts*)

| Signal | Medplum / FHIR | Reading |
|---|---|---|
| FHIR type files (`fhirtypes/dist`) | **214** | resources + datatypes, generated from the FHIR spec |
| Resource types (`resourceType`) | **166** | the concept surface — the standard's resource set |
| Resources with a `status` field | **115 / 166 (69%)** | per-resource lifecycle state machines |
| Types referencing `Reference<>` | **144** | the typed relational/composition graph |
| Universal `Meta` (versionId + lastUpdated) | every resource | append-only **version history** + opaque `id` — the shared substrate |
| Terminology resources present | `CodeSystem`, `ValueSet`, `ConceptMap` | the controlled-vocabulary + binding cluster |
| Audit/provenance resources present | `Provenance`, `AuditEvent` | the attribution + audit cluster |

The shape is the one every prior run showed — a small set of universal patterns (versioning, status machines, opaque identity, typed references) under a large concept surface — except here the surface *is* the standard. FHIR's base-resource design (`Meta.versionId` history + `id` + `status`) is the library's **Event Log + opaque-identity + Workflow State Machine** substrate, agreed by HL7.

## Tier-2 / tier-3 sample (*resource definitions read from source*)

| FHIR resource | Library atom / pattern | Evidence | Tier |
|---|---|---|---|
| **`Provenance`** | **Provenance** *(grounded atom)* (+ Tamper Evidence) | `agent` (req), `recorded`, `activity`, `entity`, `target`, **`signature`** | **tier-3 confirmed** |
| **`AuditEvent`** | **Event Log / Audit Trail** | `agent`/`recorded`/`action`/`entity`/`outcome` | tier-2 |
| **`ConceptMap`** | **Terminology Binding** (the candidate) | `group`/`element`/`target` with `equivalence: relatedto\|equivalent\|equal\|wider\|subsumes\|narrower\|specializes\|inexact\|unmatched\|disjoint` | **tier-3 confirmed** |
| **`CodeSystem` / `ValueSet`** | **Coded Category** (+ binding) | code definitions + constrained value sets | tier-2 |
| **`Observation`** | **Clinical Observation** *(grounded atom)* | `status` (registered→final→amended→corrected) + `hasMember` (recursive) + `derivedFrom` | **tier-3 confirmed** |
| `MedicationRequest` | **Medication Order** *(grounded atom)* | status lifecycle + intent + dosage | tier-2 |
| `Meta.versionId` + resource history | **Event Log** (append-only versions) | every resource versioned | tier-3 |
| resource deletion via history | **Soft Delete** (tombstone) | FHIR keeps deleted resources in history | tier-2 |
| `status` (115 resources) | **Workflow / State Machine** | per-resource declared states | tier-1 |
| `Patient` / `Person` | **Party Identity** | the party resources | tier-2 |
| `AccessPolicy` / SMART scopes | **Permissions** | resource/field access control | tier-2 |

## Headline 1 — the Terminology Binding candidate, resolved against the standard (in three parts)

Run 7 surfaced *Coded Concept / Terminology Binding*; run 8 (Akaunting) split it into a Coded-Category core + a Terminology-Binding overlay. FHIR settles the structure decisively, because the standard already factors it into three distinct resources:

- **`CodeSystem`** — *defines* a controlled vocabulary (the codes themselves). → the **Coded Category** core.
- **`ValueSet`** — *selects/constrains* a set of codes for a use (a binding of a vocabulary subset to a context). → the binding half.
- **`ConceptMap`** — *maps* concepts across code systems with a **typed `equivalence`** (a 10-value lattice: equal / equivalent / wider / narrower / subsumes / specializes / inexact / …). → the **Terminology Binding** overlay, with its own invariants (equivalence is directional — "read from target to source"; the lattice has structure: `equal ⊂ equivalent ⊂ relatedto`).

That the international standard independently arrived at exactly the CodeSystem-vs-ValueSet-vs-ConceptMap factoring is strong evidence the candidate cluster carves real joints. Gate proposal: **Coded Category** (CodeSystem-shaped) as the atom; **Terminology Binding** (ConceptMap-shaped, with the equivalence lattice as its load-bearing invariant) as a composition/overlay over two Coded Categories.

## Headline 2 — Provenance validated against the standard (and Tamper Evidence with it)

FHIR `Provenance` carries `agent` (required — who), `recorded` (when), `activity` (what), `entity` (the things acted on), `target` (the resources it describes), and `signature` (a cryptographic `Signature`). This maps directly onto the library's grounded **Provenance atom** (attributed origin/custody) — and `signature` is FHIR's **tamper-evidence**, cross-checking Tamper Evidence at the same time. A grounded atom matching the international standard's resource of the same name is the cleanest corroboration short of authoring against it.

## Headline 3 — the universal substrate is the standard's base resource

Every FHIR resource shares `Meta` (`versionId` + `lastUpdated` → append-only **version history** = Event Log), an opaque `id` (the library's opaque-identity discipline), and — for 115 of 166 — a `status` (Workflow / State Machine). FHIR resource deletion is non-destructive (the resource stays in history) = **Soft Delete / tombstone**. In other words HL7's base-resource design *is* the library's Event Log + opaque-identity + Workflow-State-Machine + Soft-Delete substrate, standardized and globally deployed. And `Observation.hasMember` (an observation referencing member observations) is a fifth **recursive-composition** witness — now FHIR-standardized.

## Eval (run 9, and the arc)

- **Validation against a standard, not a vendor.** The atoms map onto FHIR resource-for-pattern. This is the strongest external check the reverse-recovery exercise can produce, and the reason to stop here: there is no higher-authority target than the interoperability standard the industry already agreed on.
- **The candidate set is now resolved, not just enlarged.** FHIR's CodeSystem/ValueSet/ConceptMap factoring resolves the Coded Concept question into a clean atom + overlay; Provenance is confirmed against the standard; recursive composition has its fifth witness. No new primitive — saturation.
- **The breadth arc is complete.** Nine runs span **five languages** (JS, Python, Java, PHP, TypeScript), **six frameworks**, **five domains** (utility, ERP, CRM, clinical, accounting), a vendor EHR, and the **FHIR standard**. The atom set recurred as the substrate throughout; two grounded healthcare atoms were validated in the wild *and* against the standard; the candidate set converged. Further breadth is now near-zero-yield — the next informative move is **canon, not more scans**.
- **Caveats:**
  - **Tier-3 reads the FHIR type definitions** (generated from the spec) — i.e. reading the standard's schema, not Medplum's runtime. No instance was run; confirmations, not executed bugs. (FHIR types *are* the standard's contract, so this is the right surface for a standard-vs-taxonomy check.)
  - **Medplum is the lens; FHIR is what's recovered.** The result is "the atoms map onto FHIR," established through one faithful FHIR implementation. A second FHIR server (HAPI FHIR, Java) would add nothing the standard didn't already supply.

## Recovery arc — nine runs (complete)

| Run | Target | Domain / Lang / Framework | Headline |
|---|---|---|---|
| 1 | `pboyer/rec` | util / JS | Invertible Delta; reproduced COMPOUND-return bug |
| 2 | `asgi-idempotency-header` | middleware / Python | predicted Memo atom confirmed; reproduced bricked-key bug |
| 3 | ERPNext | ERP / Python / Frappe | backbone saturates; recursive-BOM gap |
| 4 | hrms | ERP / Python / Frappe | same-framework saturation; framework-vs-domain confound flagged |
| 5 | frappe/crm | CRM / Python / Frappe | non-transactional domain saturates on a different subset |
| 6 | Odoo 19 | ERP / Python / non-Frappe | framework independence; recursive-composition + hash-chain ledger + double-entry |
| 7 | OpenMRS | EHR / Java / non-Frappe | domain+language independence; 2 grounded atoms validated; Coded Concept candidate |
| 8 | Akaunting | Accounting / PHP / Laravel | new domain; single-entry contrast; Coded Concept factors in two; recursion tree/DAG |
| 9 | **Medplum / FHIR** | **Healthcare / TypeScript / FHIR standard** | **atoms map onto the international standard; Terminology Binding resolved (3-part); Provenance validated; recursion 5th witness** |

**The exercise, summed:** across five languages, six frameworks, five domains, and one international standard, the ~27-atom set recurs as the substrate; two grounded healthcare atoms (Clinical Observation, Medication Order) and one grounded compliance atom (Provenance) are validated in real systems *and* against FHIR; two executed bugs and one confirmed prediction came out of the depth runs; and the candidate set converged to a short, defensible list: **Acyclic Recursive Composition** (5 witnesses; tree + DAG forms), **Coded Category + Terminology Binding** (resolved 3-part by FHIR), **Sequential Identifier** (2 frameworks), with **Balance Ledger** as a recurring composition pattern (4 corpora, single- vs double-entry axis). Honest limits: depth tier-3 was read-not-run on the framework-heavy targets; each domain rests on one-or-two witnesses; the recovery files are internal staging, not canon.

## Actions — stop breadth, pivot to canon

- **The arc is closed.** Nine runs is enough; the generalization axes are covered and confirmations have gone low-information. No further scans recommended (a double-entry-native ledger or a second FHIR server would each confirm one already-witnessed pole — optional, low priority).
- **The payoff is the gates.** Take the converged candidates through the three EOS/gate questions, in priority order:
  1. **Acyclic Recursive Composition** — 5 cross-domain/cross-language witnesses (incl. FHIR `hasMember`); carry the tree-vs-DAG sub-form distinction (shared acyclicity invariant). Strongest; gate-ready now.
  2. **Coded Category** (+ **Terminology Binding** overlay) — FHIR's CodeSystem/ValueSet/ConceptMap factoring is the proposed structure; the `equivalence` lattice is Terminology Binding's load-bearing invariant.
  3. **Sequential Identifier** — `ir.sequence` / `naming_series` recurrence; lower priority.
- **Thesis (Jackson / Sloan):** the closing line is the strongest the exercise produced — *"run in reverse against five languages and the FHIR standard, the library recovered the patterns the international healthcare standard already codified, and two atoms we'd grounded as worked examples matched real deployed systems."* Reverse-recovery confirmed the forward taxonomy.
- **Methodology:** fold the converged candidate list and the recovery-arc summary into `discoveries.md` (the saturation/sufficiency finding) and open the three candidate atoms as `roadmap.md` proposals — the reverse-direction exercise's deliverable into canon.
