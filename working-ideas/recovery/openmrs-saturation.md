# Concept recovery — run 7: OpenMRS saturation (the domain + language test, 2026-06-13)

> **Status: internal staging, not canonical.** The **domain-and-language independence run** — the axis every prior target shared. Subject: [`openmrs/openmrs-core`](https://github.com/openmrs/openmrs-core) (the OpenMRS platform core; cloned shallow, 38 MB, 1,282 Java files, 136 domain classes). OpenMRS is **non-Frappe, non-ERP, and non-Python**: a Java / Spring / Hibernate **electronic health record (EHR)** built by a different community over ~20 years. Runs 3–6 were all ERPs; run 6 (Odoo) isolated the *framework* confound but stayed in the ERP domain. This run isolates the **domain** confound (clinical, not commercial) **and** adds **language independence** (Java, not Python). Method per `concept-recovery.md`: tier-1 aggregate over the domain model + tier-2 schema sample + selective tier-3 source reads on `Obs`, `Order`, `ProgramWorkflowState`, `Role`. **Verdict: the strongest single result of the exercise — not "the taxonomy holds" but "the library's two *grounded* healthcare atoms describe how a real, mature EHR actually models clinical data," plus a third independent witness for recursive-composition in a third domain, plus one genuinely new domain-specific candidate (Coded Concept / Terminology Binding).**

---

## Why this run is qualitatively different

Runs 3–6 answered a *saturation* question: mine a real system, do the ~27 atoms keep reappearing? Run 7 answers a sharper one. The library carries two **already-grounded** healthcare atoms — Clinical Observation and Medication Order — authored as worked examples of the methodology in a HIPAA / 21 CFR Part 11 domain, and *never composed into anything*. The open worry about a worked example is that it is idealized: it models how the author *imagines* clinical data works, not how a deployed system actually does. OpenMRS is the test of that worry. It is the dominant open-source EHR, in production in thousands of facilities. If Clinical Observation and Medication Order match OpenMRS's real `Obs` and `Order` models, the atoms are not idealized — they recovered the real structure. That is a stronger claim than ERP saturation, and it is the one this run lands.

## Tier-1 aggregate (the domain model — *computed facts*)

| Signal | OpenMRS | Reading |
|---|---|---|
| Domain classes (`org/openmrs/*.java`) | **136** | the concept surface |
| Entities extending `BaseOpenmrs{Data,Metadata,Object}` | **84** | the records that inherit the universal substrate |
| `voided` (clinical-DATA soft delete) | **110 files** | the universal soft-delete-of-data pattern |
| `retired` (METADATA soft delete) | **78 files** | soft-delete-of-metadata — the **data/metadata split** the library's Soft Delete + regulated overlay draws |
| `voidReason` / `retireReason` | **181** | **attributed** soft delete (reason + `voidedBy` + `dateVoided`) |
| `changedBy` / `dateChanged` | **206** | the audit / change-history substrate |
| `uuid` references | **161** | opaque identity — the library's opaque-id-over-content-field discipline, universal |
| Hibernate mappings (`.hbm.xml`) | 20 | the ORM surface |
| Service interfaces (`*Service.java`) | 38 | where invariants live (the controller analog) |

The whole EHR sits on a **soft-delete + attributed-audit + opaque-identity substrate** carried by base classes — i.e. the library's **Soft Delete + Event Log + Actor Identity + opaque-id** discipline, made universal by inheritance, in a Java codebase that has never heard of Grace Commons. The data (`voided`) vs metadata (`retired`) split is exactly the line the library draws between clinical records and reference data.

## Tier-2 / tier-3 sample — the cross-checks that matter

| OpenMRS entity | Library atom | Evidence | Tier |
|---|---|---|---|
| **`Obs`** | **Clinical Observation** *(grounded atom)* | `previousVersion` (linear amendment chain) + `status = FINAL` + `interpretation` + `obsGroup`/`groupMembers` | **tier-3 confirmed** |
| **`Order`** / `DrugOrder` | **Medication Order** *(grounded atom)* | `enum Action` (NEW/REVISE/DISCONTINUE/RENEW) + `previousOrder` (revision chain) + `dateActivated`/`autoExpireDate`/`dateStopped` (temporal window) | **tier-3 confirmed** |
| `voided`/`retired` (universal) | **Soft Delete** (attributed) | `voidReason`/`voidedBy`/`dateVoided`; data vs metadata split | tier-1 + source |
| `creator`/`changedBy`/`dateChanged`/`uuid` | **Event Log + Actor Identity** + opaque id | `Auditable` base interface; 206 audit fields | tier-1 |
| **`ProgramWorkflowState`** | **Workflow / State Machine** | explicit `Boolean initial` + `Boolean terminal` declared-state markers | **tier-3 confirmed** |
| `Patient` / `Person` | **Party Identity** | the universal party record | tier-2 |
| `User`; `Role`/`Privilege` | **Credential**; **Permissions** | `Role.privileges` + `inheritedRoles`/`childRoles` (role hierarchy) | tier-3 confirmed |
| `Encounter` / `Visit` | Event Log / temporal grouping | encounter = attributed clinical event; visit = grouping | tier-2 inferred |

No sampled entity needed a primitive outside the library's set — in a domain (clinical) and a language (Java) neither shared with any prior run.

## Headline 1 — two *grounded* atoms recovered the real EHR (tier-3, deeply read)

- **`Obs` → Clinical Observation.** `private Obs previousVersion;` is the **linear amendment chain** the atom models and `clinical-observation.als` checks as *"linear amendment chains (no branching)."* OpenMRS observations are immutable; an edit voids the old `Obs` and writes a new one linked via `previousVersion` — branch-free amendment, exactly the atom's invariant. `status = Status.FINAL` (HL7 PRELIMINARY/FINAL/AMENDED) and `interpretation` are the atom's status + interpretation surfaces. The grounded atom is not idealized; it is what a real EHR does.
- **`Order` → Medication Order.** `enum Action {NEW, REVISE, DISCONTINUE, RENEW}` + `private Order previousOrder;` is the **immutable order with a revision chain** — you don't edit an order, you REVISE it into a new linked order — matching the atom's amendment/reinstate model. The temporal window (`dateActivated`, `scheduledDate`, `autoExpireDate`, `dateStopped`) is the **Provisional Commitment** window, and `autoExpireDate` is **expiry as a derived predicate** — "expired" is computed from `now` vs `autoExpireDate`, no sweeper sets a flag (the library's *derive, don't lag* rule, in production).

This is the cleanest corroboration the library has: two atoms it grounded as worked examples independently match the dominant open-source EHR's actual clinical model.

## Headline 2 — recursive composition: third witness, third domain, third framework

`Obs` carries `protected Obs obsGroup;` + `protected Set<Obs> groupMembers;` — an observation that contains child observations of its own type (obs grouping: a blood-pressure panel containing systolic + diastolic obs). That is the **Acyclic Recursive Composition** primitive again — now in a **clinical** domain (after ERPNext and Odoo manufacturing BOMs), in a **third framework**, in a **third language**. And it is not alone in OpenMRS: `ConceptSet` (`Concept conceptSet` — concepts recursively contain member concepts) and `Role.inheritedRoles`/`childRoles` (a role hierarchy) are two more recursive structures in the same codebase. The candidate atom is now **domain-independent and language-independent** — about as strong as Gate-1 recurrence evidence gets short of authoring it.

## Headline 3 — the purest Workflow / State Machine witness yet

`ProgramWorkflowState extends BaseChangeableOpenmrsMetadata` carries explicit `Boolean initial` and `Boolean terminal` flags — declared states with initial/terminal markers, a patient enrolling in a `Program` and moving through declared `ProgramWorkflowState`s. This is a near-verbatim match to the library's **Workflow / State Machine** atom (declared finite states, terminal absorption). Across the arc the atom now has three framework witnesses at three points on its own spectrum: Frappe's universal `docstatus` (the fixed-3-state pole), Odoo's per-model `state` Selection (the mid case), and OpenMRS's explicit `ProgramWorkflowState` with initial/terminal (the general declared-states pole — the atom itself). One atom, three frameworks' worth of instances.

## The new candidate — Coded Concept / Terminology Binding (what a new domain surfaced)

Going to a genuinely new domain was supposed to surface primitives the ERP targets didn't — and it did, once. OpenMRS's **`Concept` / `ConceptName` / `ConceptMap` / `ConceptReferenceTerm` / `ConceptMapType`** is a controlled-terminology system: a local concept bound to standard vocabularies (SNOMED CT, LOINC, ICD) through typed maps (`SAME-AS`, `NARROWER-THAN`, `BROADER-THAN`). The library has **no Coded Concept / Terminology Binding atom** — nothing models a controlled vocabulary with typed cross-vocabulary mappings and their invariants (a map type is directional; SAME-AS is symmetric; a concept resolves to ≤1 preferred name per locale). This is load-bearing in healthcare (and recurs in finance as instrument taxonomies, in retail as product classification). **Candidate atom — Coded Concept / Terminology Binding** — the one place run 7 found a real gap rather than a confirmation. Run the gates; note it is reference-data-shaped, so Gate 3 (does it carry a state machine / new state of its own?) is the real test.

## Eval (run 7)

- **Domain + language independence achieved.** Clinical domain, Java/Hibernate stack — no overlap with any prior target on either axis. The atoms recurred anyway. This closes the generalization story the arc has been building: the taxonomy now has witnesses across **commercial and clinical domains**, **Frappe / Odoo / Spring-Hibernate frameworks**, and **Python / Java languages**.
- **The strongest corroboration kind.** Runs 3–6 showed real systems *decompose onto* the atoms; run 7 shows two atoms the library *already grounded* **match a real EHR's actual model** (Obs amendment chains, Order revision + expiry). That is validation of specific specs, not just taxonomy coverage.
- **Recursive composition is now overwhelming.** Three domains, three frameworks, three languages, plus multiple instances within OpenMRS itself. Highest-priority new-atom candidate of the entire exercise — promote to a gated atom proposal.
- **Soft Delete + audit substrate, third independent witness.** The universal `voided`/`retired` + attributed reason + `changedBy` substrate is the library's Soft Delete + Event Log + Actor Identity, made universal by a third unrelated codebase.
- **One genuine new candidate.** Coded Concept / Terminology Binding — the healthcare-domain primitive the ERP targets never exercised. The new domain paid for itself with exactly the kind of finding it was run to surface.
- **Caveats, on the record:**
  - **Tier-3 is read, not run.** No OpenMRS instance was stood up (the framework-heavy depth limit again). The invariant recovery is solid — `previousVersion`, `Action`, `initial`/`terminal` are explicit in source — but no bug was *executed*; this run reports **confirmations, not bugs**. An executed finding would need a running OpenMRS + its own test suite as the trace source.
  - **One EHR, one witness for healthcare.** OpenMRS is the dominant open-source EHR, but it is a single system; a second (e.g. a FHIR-native store) would harden the healthcare-domain claim the way Odoo hardened the ERP one.

## Recovery arc — seven runs, the full picture

| Run | Target | Domain / Lang / Framework | Headline |
|---|---|---|---|
| 1 | `pboyer/rec` | util / JS | Invertible Delta; **reproduced** COMPOUND-return bug |
| 2 | `asgi-idempotency-header` | middleware / Python | **predicted Memo atom confirmed**; **reproduced** bricked-key bug |
| 3 | ERPNext | ERP / Python / **Frappe** | backbone saturates; **recursive-BOM gap**; derived-index rule corroborated |
| 4 | hrms | ERP / Python / **Frappe** | same-framework saturation; **framework-vs-domain confound** flagged |
| 5 | frappe/crm | CRM / Python / **Frappe** | non-transactional domain saturates on a different atom subset |
| 6 | Odoo 19 | ERP / Python / **non-Frappe** | **framework independence**: taxonomy + recursive-composition + hash-chain ledger recur |
| 7 | **OpenMRS** | **EHR / Java / non-Frappe** | **domain + language independence**: two *grounded* atoms match a real EHR; recursive-composition 3rd witness; 1 new candidate |

The combined picture: across two languages, four frameworks, and four domains (utility, ERP, CRM, clinical), the atom set recurs as the substrate; two grounded healthcare atoms are validated against a production EHR; the recursive-composition candidate has three cross-domain/cross-language witnesses; and the exercise has produced two executed bugs, one confirmed prediction, and three named candidate atoms (Acyclic Recursive Composition, Sequential Identifier, Coded Concept / Terminology Binding). Honest limits unchanged: tier-3 read-not-run without a runtime; each domain still rests on one-or-two witnesses.

## Actions

- **Backlog (Grace Commons):**
  - **Acyclic Recursive Composition / Bill-of-Materials** — now **three witnesses across three domains and languages** (ERPNext BOM, Odoo `mrp.bom`, OpenMRS `obsGroup`/`ConceptSet`/role hierarchy). Strongest new-atom candidate; run the three gates as the next atom proposal.
  - **Coded Concept / Terminology Binding** — *new* from run 7 (OpenMRS `Concept`/`ConceptMap`/`ConceptReferenceTerm`). Controlled vocabulary + typed cross-vocabulary maps. Run the gates; Gate 3 (own state machine vs. reference data) is the live question.
  - **Clinical Observation / Medication Order** — **validated in the wild** (OpenMRS `Obs.previousVersion`, `Order.Action`/`previousOrder`). No action beyond recording the corroboration; consider a healthcare composition (e.g. an Encounter / clinical-data-capture composition) now that the constituent atoms have real-world confirmation.
- **Thesis (Jackson / Sloan):** the headline upgrades again — from framework-independence to **"two atoms we grounded as worked examples independently match the dominant open-source EHR's real clinical model, in Java."** That is the difference between *"our taxonomy is internally consistent"* and *"our specs recovered how real systems actually work,"* and it lands across domains and languages now.
- **Next (the arc is saturating):** the generalization axes (framework, domain, language) are now each covered. The higher-value next move is **depth, not breadth** — stand up one runtime (an OpenMRS or Odoo instance) and run an asgi-grade *executed* tier-3 dive to convert a confirmation into a reproduced finding (the partnership / proof-of-value bar) — or **promote the three candidate atoms through the gates**, which is the library-facing payoff the whole reverse-direction exercise was generating.
