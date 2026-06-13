# Concept recovery — run 8: Akaunting saturation (the accounting-domain run, 2026-06-13)

> **Status: internal staging, not canonical.** The **dedicated-accounting** run, and a fourth language. Subject: [`akaunting/akaunting`](https://github.com/akaunting/akaunting) (PHP / **Laravel** + Vue, ~9.9k GitHub stars, BSL-licensed; 35 domain models in `app/Models` across six domains). Prior runs saw a general ledger only *inside* ERPs (ERPNext GL Entry, Odoo `account.move`); Akaunting is the first system whose *whole reason to exist* is accounting, and it is the fourth distinct language in the arc (after JS, Python, Java). It was chosen as the highest-novelty next target because accounting was the one core business domain not yet hit head-on, and the **Coded Concept** candidate from run 7 wanted a non-healthcare test. Method per `concept-recovery.md`: tier-1 aggregate over the Eloquent model layer + tier-2/tier-3 source reads on the ledger, categories, and document lifecycle. **Verdict: saturation holds, and the new domain paid off in *contrasts* rather than confirmations — it produced a negative cross-check (single-entry, so no double-entry binding bijection), a refinement of the Coded Concept candidate (it factors in two), and a fourth recursive-composition witness. License note: BSL, so concepts-not-code, same posture as the ERPNext GPLv3 reads.**

## Tier-1 aggregate (the Eloquent model layer — *computed facts*)

| Signal | Akaunting | Reading |
|---|---|---|
| Domain models (`app/Models`) | **35** (Auth 7, Banking 5, Common 11, Document 5, Module 2, Setting 5) | the concept surface (+ installable `modules/`) |
| `SoftDeletes` trait | **18 / 35** | Soft Delete across half the model layer — framework-trait form (vs OpenMRS's base-class `voided`) |
| `created_by` / `created_from` | **29 / 35** | attributed audit substrate (Actor Identity / Event Log) |
| `company_id` | **29 / 35** | multi-tenant scoping (a deployment-declared partition, not an atom) |
| `status` lifecycles | Document, Recurring, Transaction-reconciled | per-model state machines |
| double-entry / debit / credit | **0 across `app/` and `modules/`** | **single-entry by design** — the headline contrast |

The substrate is the same shape every prior run showed: a **soft-delete + attributed-audit** base under the whole model layer (Soft Delete + Event Log + Actor Identity), here delivered by Laravel's `SoftDeletes` trait + `created_by`/`created_from` columns rather than a base class or a framework mixin. Same atoms, a fourth delivery mechanism.

## Tier-2 / tier-3 sample (*structure recovered; ledger, category, document read from source*)

| Akaunting model | Library atom / pattern | Evidence | Tier |
|---|---|---|---|
| **`Transaction` + `Account`** | **Balance Ledger** (transaction ledger + *derived* running balance) | `Account::getBalanceAttribute` = `opening_balance + Σincome − Σexpense`; `Transaction` = `type`(income/expense) + single `amount` | **tier-3 confirmed** |
| *(double-entry binding bijection)* | **absent by design** | no debit/credit anywhere; transfers are a *pair* of linked transactions, not balanced postings | **tier-3 negative** |
| **`Setting/Category`** | **Coded Category** (partial Coded Concept) | `parent_id` + `sub_categories` (recursive tree) + `type`(income/expense/cogs/item/other) + `code` + `enabled`; **no external-terminology map** | **tier-3 confirmed** |
| **`Document`** (invoice/bill) | **Workflow State Machine** + Event Log | `status`(draft/sent/viewed/partial/paid/cancelled) + `scopeStatus`; `histories()` → DocumentHistory | **tier-3 confirmed** |
| **`DocumentHistory`** | **Event Log** (attributed status log) | `{document_id, status, notify, description, created_by}` append-only | tier-3 |
| `SoftDeletes` (18) | **Soft Delete** | Laravel trait | tier-1 |
| `created_by`/`company_id` (29) | **Actor Identity / Event Log** (+ tenancy) | fillable | tier-1 |
| **`UserInvitation`** | **Invitation** *(grounded atom)* | pending→accepted lifecycle | tier-2 |
| **`Common/Recurring`** | **Subscription** *(grounded atom)* | recurrence schedule driving document spawning | tier-2 |
| `Common/Notification` | **Notification** *(grounded atom)* | delivery records | tier-2 |
| `Common/Contact` | **Party Identity** | customer/vendor party | tier-2 |
| `Auth` (User/Role/Permission/UserRole) | **Credential + Permissions** | laratrust-style RBAC | tier-2 |

Every model recombines existing atoms — in a new domain and a fourth language. No accounting concept required a primitive outside the set.

## Headline 1 — single-entry vs double-entry: the taxonomy *distinguishes* them (the negative cross-check)

Odoo's `account.move._check_balanced` enforces debit = credit — the **binding-bijection** emergent invariant (run 6, tier-3 confirmed). Akaunting enforces no such thing: a `Transaction` is a signed `type` (income/expense) with a single `amount` against one `Account`, and the account balance is **derived** (`getBalanceAttribute` sums income minus expense over the ledger). It is a single-entry **Balance Ledger** — transaction ledger + derived running balance — *without* the double-entry binding bijection. (Even transfers are modeled as a linked income/expense transaction *pair*, not balanced postings.)

This is the most useful kind of result a saturation run can produce: **a negative that the taxonomy predicts correctly.** Both systems are Balance Ledgers; only the double-entry one carries the binding-bijection invariant. The atom set expresses the *shared* substrate (ledger + derived index) and the *difference* (binding bijection present / absent) rather than flattening two genuinely different accounting designs into one. Saturation is not "everything looks the same" — it is "the joints are in the right places to express both." A skeptic worried the runs only ever confirm should look here: the run found a place the library's invariant is *correctly absent*.

## Headline 2 — the Coded Concept candidate factors in two

Run 7 surfaced *Coded Concept / Terminology Binding* from OpenMRS's `Concept`/`ConceptMap` (local concepts bound to SNOMED/LOINC). Akaunting's `Category` is the non-healthcare test: it **is** a coded controlled vocabulary — `code` + `type` + `enabled`, a recursive parent/child tree — but it has **no external-terminology mapping** (no `ConceptMap` analog; categories don't bind to a standard chart-of-accounts taxonomy like IFRS/GAAP codes). So the candidate splits cleanly:

- **Coded Category / Classification** — a typed, coded, often-recursive local controlled vocabulary. **Common**: Akaunting categories, Odoo/ERPNext categories, OpenMRS concept skeletons. Likely a real atom.
- **Terminology Binding** — mapping a local concept to *external standard* vocabularies with typed maps (SAME-AS/NARROWER-THAN). **Standards-heavy**: OpenMRS `ConceptMap`, FHIR `CodeableConcept`/`ValueSet`. An overlay on the first, not always present.

The accounting domain refined a healthcare-surfaced candidate — exactly the payoff a new domain was run to produce. Run the gates on *Coded Category* first (the common core); treat Terminology Binding as its standards overlay.

## Headline 3 — recursive composition: 4th witness, and the tree/DAG split sharpens

`Category.parent_id` + `sub_categories()` is a recursive category **tree** — a fourth witness for recursive composition (after ERPNext BOM, Odoo `mrp.bom`, OpenMRS `obsGroup`/`ConceptSet`/role hierarchy). It also sharpens the candidate's shape: Category, CRM Territory, OpenMRS role hierarchy and ConceptSet are **simple trees** (single parent), whereas the BOM is a **DAG** (a component belongs to many parent BOMs). The shared invariant is **acyclicity**; the cardinality differs (one-parent vs many-parent). So *Acyclic Recursive Composition* has a **tree sub-form** and a **DAG sub-form** — a structural refinement to carry into the gate review, not a new candidate.

## Eval (run 8)

- **Saturation holds on a 4th language and the accounting domain.** PHP/Laravel, dedicated accounting — no new primitive needed. The atom set drew Soft Delete, Event Log, Actor Identity, Workflow State Machine, Party Identity, Permissions, Invitation, Subscription, Notification, plus the Balance Ledger composition pattern.
- **The value was contrast, not confirmation** — and that is the honest signal at run 8. A negative cross-check (single-entry → no binding bijection), a candidate refinement (Coded Concept factors in two), and a structural sharpening (tree vs DAG recursion). It surfaced **no genuinely new primitive** — the accounting backbone decomposed onto existing atoms + refined two prior candidates. That is the expected shape of a *saturating* arc: marginal confirmations get cheaper and less informative; the yield shifts to refinements.
- **Balance Ledger — 4th corpus.** Stock/leave/GL (Frappe), Odoo account/stock, now Akaunting transactions — ledger + derived running balance recurs again. Firmly a composition pattern (Event Log/ledger + derived index), not an atom (no new state).
- **Soft Delete + attributed audit — universal again**, a fourth independent witness, here via a framework trait.
- **Caveats, on the record:**
  - Tier-3 is **read, not run** (no Akaunting instance; confirmations, not executed bugs — though `getBalanceAttribute` and the single-entry schema are explicit and unambiguous).
  - **One accounting system, single-entry.** The double-entry pole was witnessed in Odoo; a dedicated *double-entry-native* ledger (GnuCash, `hledger`, a banking core) would be the matched-pole comparison if the binding-bijection invariant warrants more evidence.
  - BSL license — concepts-not-code (learning from design, not vendoring), the ERPNext GPLv3 posture.

## Recovery arc — eight runs

| Run | Target | Domain / Lang / Framework | Headline |
|---|---|---|---|
| 1 | `pboyer/rec` | util / JS | Invertible Delta; reproduced COMPOUND-return bug |
| 2 | `asgi-idempotency-header` | middleware / Python | predicted Memo atom confirmed; reproduced bricked-key bug |
| 3 | ERPNext | ERP / Python / Frappe | backbone saturates; recursive-BOM gap |
| 4 | hrms | ERP / Python / Frappe | same-framework saturation; framework-vs-domain confound flagged |
| 5 | frappe/crm | CRM / Python / Frappe | non-transactional domain saturates on a different subset |
| 6 | Odoo 19 | ERP / Python / non-Frappe | framework independence; recursive-composition + hash-chain ledger + double-entry recur |
| 7 | OpenMRS | EHR / **Java** / non-Frappe | domain+language independence; two *grounded* atoms validated; Coded Concept candidate |
| 8 | **Akaunting** | **Accounting / PHP** / Laravel | new domain; **single-entry contrast** (no binding bijection); Coded Concept factors in two; recursion tree/DAG split |

Combined: across **four languages** (JS, Python, Java, PHP), **five frameworks**, and **five domains** (utility, ERP, CRM, clinical, accounting), the atom set recurs as the substrate; two grounded healthcare atoms are validated in the wild; the **recursive-composition** candidate has four cross-domain/cross-language witnesses (tree + DAG forms); **Balance Ledger** recurs in four corpora; and the exercise has produced two executed bugs, one confirmed prediction, and a refined candidate set — **Acyclic Recursive Composition** (strongest, gate-ready), **Coded Category** (+ Terminology Binding overlay), **Sequential Identifier**. Honest read: the breadth arc is **saturating** — confirmations are now low-information, and the remaining value is (a) one matched-pole comparison if needed (double-entry-native), and (b) **converting the candidates to canon through the gates**, which is the library-facing payoff the whole reverse-direction exercise was generating.

## Actions

- **Backlog (Grace Commons):**
  - **Acyclic Recursive Composition** — four witnesses now; carry the **tree sub-form vs DAG sub-form** (single- vs multi-parent, shared acyclicity invariant) into the gate review. Strongest candidate; gate-ready.
  - **Coded Category / Classification** — promote as the common core (typed/coded/recursive local vocabulary: Akaunting, Odoo, ERPNext, OpenMRS); **Terminology Binding** is its standards overlay (OpenMRS ConceptMap, FHIR), gated separately. Run 8 is the finding that split them.
  - **Balance Ledger** composition pattern — four corpora; name as reusable wiring (ledger + derived running balance), and note the **single-entry / double-entry** axis: double-entry adds the binding-bijection invariant, single-entry does not.
- **Thesis (Jackson / Sloan):** the strongest line from run 8 is the *negative* — *"a single-entry accounting system correctly lacks the double-entry binding-bijection invariant our double-entry witness (Odoo) carries; the taxonomy expresses both rather than forcing one."* Saturation that includes correct absences is more credible than uniform confirmation.
- **Next:** the generalization axes (framework, domain, language) are now well-covered and runs are saturating. Recommend **pivoting from breadth to canon** — take Acyclic Recursive Composition and Coded Category through the three EOS/gates as atom proposals (the payoff), and optionally one matched **double-entry-native** ledger scan only if the binding-bijection invariant wants a second witness. More confirmatory ERP/EHR/CRM scans are now low-yield.
