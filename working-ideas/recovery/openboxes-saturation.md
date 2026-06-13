# Concept recovery — run 10: OpenBoxes saturation (the logistics run, 2026-06-13)

> **Status: internal staging, not canonical.** The **logistics / supply-chain** run — a new domain, chosen over three covered-axis targets (GNU Health / OFBiz / Dolibarr) precisely because a new axis can surface a gap a third ERP cannot. Subject: [`openboxes/openboxes`](https://github.com/openboxes/openboxes) (Groovy / **Grails**, JVM; a supply-chain management system originally built for medical/humanitarian logistics; 118 domain classes). New domain (logistics: inventory, shipments, requisitions, lot/expiry) and a new language (Groovy). Headline reason for the pick: a logistics system's shipment/custody model is the natural place to **validate the grounded Provenance / Chain of Custody atoms in the wild** — the compliance-side analogue of what OpenMRS did for the healthcare atoms. Method: tier-1 over `grails-app/domain` + tier-3 source reads of Shipment/Event, Location, ProductComponent, TransactionEntry, Party. **Verdict: the pick paid off — the run both *validated a grounded compliance atom against a real system* (Chain of Custody = Shipment + Event) and *surfaced a genuinely new candidate* (Reconciliation / Count-and-Adjust) that the confirmatory targets would not have. Saturation otherwise holds, with recursive composition's 6th witness carrying both sub-forms in one codebase.**

## Tier-1 aggregate (`grails-app/domain` — *computed facts*)

| Signal | OpenBoxes | Reading |
|---|---|---|
| Domain classes | **118** | the concept surface (Grails/GORM domain layer) |
| `dateCreated` / `lastUpdated` (GORM timestamps) | **86 / 118** | near-universal audit/versioning substrate (Event Log) |
| `createdBy` / `updatedBy` | **35** | attributed audit (Actor Identity) |
| `status` lifecycles | **25** | per-entity state machines (Workflow State Machine) |
| `parent*` self-references | recursion in **Location, Category, Product** | recursive composition — multiple structures in one system |

Same shape as every prior run — a small universal substrate (audit timestamps, attributed change, status machines) under a large domain surface — now in a logistics codebase. Notably the model layer *names* several library atoms outright: **`EventLog`** + **`Event`** + **`EventType`** (Event Log), **`Party`** + **`PartyRole`** + **`PartyType`** (Party Identity), **`Transaction`** + **`TransactionEntry`** (the ledger), **`ReferenceNumber`** (Sequential Identifier).

## Tier-2 / tier-3 sample (*shipment, recursion, ledger, party read from source*)

| OpenBoxes model | Library atom / pattern | Evidence | Tier |
|---|---|---|---|
| **`Shipment` + `Event`** | **Chain of Custody (C12) / Provenance** *(grounded)* | `Event` = `{eventDate, eventType (CREATED/SHIPPED/RECEIVED), eventLocation}`; `Shipment` has `origin`/`destination`/`currentStatus`/ordered `events`, `implements Historizable` | **tier-3 confirmed** |
| **`Location`** | **Acyclic Recursive Composition** (tree) | `Location parentLocation` + `belongsTo = [parentLocation: Location]` + `mappedBy = [locations: "parentLocation"]` (warehouse → zone → bin) | **tier-3 confirmed** |
| **`ProductComponent`** | **Acyclic Recursive Composition** (DAG) | `componentProduct: Product` + `belongsTo = [assemblyProduct: Product]` — a product assembled from products (kit/BOM) | **tier-3 confirmed** |
| **`TransactionEntry` + `InventoryItem`** | **Balance Ledger** (+ Capacity Constraint) | `{quantity, inventoryItem, binLocation}` posting; on-hand = Σ entries (derived) | **tier-3 confirmed** |
| **`Party` / `PartyRole` / `PartyType`** | **Party Identity** | `Party` has `partyType` + `hasMany = [roles: PartyRole]`; Person/Organization/Supplier/Donor are parties | **tier-3 confirmed** |
| `Requisition` → `Fulfillment` → `Picklist` | **Workflow State Machine** + **Fulfillable Order** (candidate) | requisition-to-fulfillment lifecycle | tier-2 |
| `ShipmentWorkflow` / `currentStatus` | **Workflow State Machine** | declared shipment-status lifecycle | tier-2 |
| `ReferenceNumber` / `ReferenceNumberType` | **Sequential Identifier** (candidate) | human-readable reference numbers | tier-2 |
| `UnitOfMeasure` / `UnitOfMeasureClass` / `Category` | **Coded Category** (candidate) | coded vocabularies + product category tree | tier-2 |
| `GlAccount` / `Invoice` | **Ledger Entry / Posting** (backlog) | GL accounts + invoicing | tier-2 |

## Headline 1 — a grounded compliance atom, validated in the wild

The reason to run a logistics system: **`Event` is a custody log, verbatim.** Its own class documentation walks the chain — *Shipment created in Boston → `CREATED`; departs Boston → `SHIPPED`; arrives at X Depot → `RECEIVED`* — each event carrying `eventDate` (when), `eventType` (what), and `eventLocation` (where). A `Shipment` carries `origin`, `destination`, a `currentStatus`, an ordered `SortedSet events`, and is declared `Historizable`. That is the library's grounded **Provenance** atom (*"where did this come from, who has handled it, what has been done to it — originated, received, transferred…"*) and the **Chain of Custody (C12)** composition (custody continuity, hand-to-hand, ordered, attributed) — recovered from a real, deployed humanitarian-logistics system. Until now the grounded *compliance* atoms had been validated only internally and against FHIR `Provenance` (run 9, a standard); OpenBoxes is the first *deployed operational system* whose custody model matches them. The healthcare atoms got OpenMRS; the custody atoms now have OpenBoxes.

## Headline 2 — recursive composition: 6th witness, both sub-forms in one system

OpenBoxes carries both sub-forms the roadmap candidate distinguishes, in a single codebase: **`Location`** is a *tree* (`parentLocation`, single-parent: warehouse → zone → bin), and **`ProductComponent`** is a *DAG* (`assemblyProduct` ← `componentProduct`, a product assembled from products — the BOM/kit shape, multi-parent), with **`Category`** a second tree. That is the sixth system to witness recursive composition (after ERPNext, Odoo, OpenMRS, Akaunting, FHIR) and the first to exhibit *both* the tree and DAG sub-forms together — direct corroboration of the tree-vs-DAG distinction the candidate carries into the gates.

## Headline 3 — a genuinely new candidate the new domain surfaced: Reconciliation / Count-and-Adjust

This is what the novel axis bought that a third ERP would not have. OpenBoxes carries a large **`CycleCount*`** family (`CycleCount`, `CycleCountRequest`, `CycleCountItem`, `CycleCountDetails`, `InventoryAccuracyResult`, `InventoryShrinkageResult`…): the discipline of comparing the **recorded** ledger balance against a **physically observed** count, recording the discrepancy, and posting an adjusting entry. The same shape appeared in Akaunting as **`Banking/Reconciliation`** (bank-statement reconciliation — recorded vs. external truth). Two witnesses, two domains (logistics + finance):

- **Reconciliation / Count-and-Adjust** — *candidate*: reconcile a recorded balance against an externally-observed truth, record the discrepancy, post an adjustment so the recorded balance equals the observed. Its load-bearing property is the **post-condition** (after reconciliation, recorded = observed) plus an **auditable discrepancy record** (shrinkage/accuracy is itself reportable). **Likely a composition** (Balance Ledger + an observation/count event + an adjusting `TransactionEntry`), not an atom — Gate 3 (does it carry state/behavior the constituents lack?) is the open question; the *discrepancy-as-first-class-record* may be the emergent surface. Run the gates. This is the first new candidate since run 7, and it came from going to an axis the corpus hadn't covered — vindicating the novel-axis choice over the three covered-axis targets.

(Also strengthened: **Fulfillable Order** gets a 2nd, cross-domain witness — healthcare lab/procedure orders (the backlog candidate) and logistics `Requisition → Fulfillment → Picklist` are the same place-then-fulfill lifecycle.)

## Eval (run 10)

- **The pick was right.** A new domain produced what three covered-axis confirmatory scans (Grok's GNU Health / OFBiz / Dolibarr, all healthcare/ERP in covered languages) explicitly would not have: a grounded *compliance* atom validated against a deployed system, *and* a new candidate (Reconciliation). Confirmatory scans thicken the base; novel-axis scans can still move it.
- **Saturation holds**, strongly — the logistics domain decomposed onto Event Log, Provenance/Chain of Custody, Party Identity, Balance Ledger, Capacity Constraint, Workflow State Machine, recursive composition, Sequential Identifier, Coded Category, with no primitive *outside* the set except the Reconciliation candidate (itself probably a composition).
- **Recursive composition is now overwhelming** — 6 systems, 5 languages, both sub-forms; this candidate is past the point where more witnesses add anything. Gate it.
- **Caveats:** tier-3 on Shipment/Event/Location/ProductComponent/Party/TransactionEntry is *read, not run* (no OpenBoxes instance stood up — confirmations, not executed bugs); the Reconciliation mapping (CycleCount ↔ Akaunting Reconciliation) is **tier-2 inferred** from model names + domain knowledge, not yet a source read of `CycleCount.groovy` — label it accordingly until a tier-3 dive confirms the discrepancy/adjustment invariants.

## Recovery arc — ten runs

| Run | Target | Domain / Lang | Headline |
|---|---|---|---|
| 1 | `pboyer/rec` | util / JS | Invertible Delta; reproduced bug |
| 2 | `asgi-idempotency-header` | middleware / Python | Memo atom confirmed; reproduced bug |
| 3 | ERPNext | ERP / Python | backbone saturates; recursive-BOM gap |
| 4 | hrms | ERP / Python | saturation; framework-vs-domain confound flagged |
| 5 | frappe/crm | CRM / Python | non-transactional domain, different subset |
| 6 | Odoo 19 | ERP / Python | framework independence; double-entry + hash-chain ledger |
| 7 | OpenMRS | EHR / Java | domain+language independence; 2 grounded atoms validated |
| 8 | Akaunting | Accounting / PHP | single-entry contrast; Coded Concept factors in two |
| 9 | Medplum / FHIR | Healthcare / TS / standard | atoms map onto the FHIR standard; Terminology Binding resolved |
| 10 | **OpenBoxes** | **Logistics / Groovy** | **grounded Chain-of-Custody/Provenance validated in the wild; recursion 6th witness (tree+DAG); new candidate: Reconciliation** |

Across **six languages** (JS, Python, Java, PHP, TS, Groovy), seven-plus frameworks, and **six domains** (utility, ERP, CRM, clinical, accounting, logistics) plus the FHIR standard, the atom set holds as the substrate; **three grounded atoms** (Clinical Observation, Medication Order, Provenance/Chain of Custody) are now validated against real deployed systems; the candidate set stays short. New from run 10: **Reconciliation / Count-and-Adjust** (2 witnesses, likely composition). Honest limits unchanged: tier-3 read-not-run on the big targets; one-or-two witnesses per domain.

## Actions

- **Backlog (Grace Commons):**
  - **Reconciliation / Count-and-Adjust** — *new candidate* (OpenBoxes CycleCount + Akaunting Reconciliation; 2 witnesses, 2 domains). Add to the roadmap concept-recovery backlog; flag **likely-composition**, Gate-3 question = is the discrepancy record an emergent surface or just an adjusting ledger entry. A tier-3 read of `CycleCount.groovy` would confirm the invariants.
  - **Fulfillable Order** — 2nd witness (logistics requisition→fulfillment); strengthens the existing healthcare backlog candidate as genuinely cross-domain.
  - **Acyclic Recursive Composition** — 6th witness, both sub-forms in one system; no more witnesses needed — gate it.
- **Thesis (Jackson / Sloan):** the line from run 10 — *"a deployed humanitarian-logistics system's shipment model is our Chain of Custody atom, event-for-event (CREATED → SHIPPED → RECEIVED); a grounded compliance atom recovered from real operational software, not just a standard."*
- **Next:** the breadth arc is decisively saturating (run 10 needed a deliberately novel axis to find even one new candidate). Recommend **pivoting to the gates** — Acyclic Recursive Composition first, then Coded Category + Terminology Binding, with Reconciliation as a composition-candidate behind them. Further breadth should only target genuinely-unhit axes (social/feed, telecom, a non-JVM/non-PHP/non-Python language), and only if usage-weighted defensive evidence is wanted over library progress.
