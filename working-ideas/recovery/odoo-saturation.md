# Concept recovery — run 6: Odoo saturation (the independence test, 2026-06-13)

> **Status: internal staging, not canonical.** The **independence run** — the one ERPNext + hrms + CRM could not buy. Subject: [`odoo/odoo`](https://github.com/odoo/odoo) **v19.0** (625 addon modules + 24 core; 1,350 distinct models). Odoo is a **non-Frappe** ERP: a different company, a different ORM, Python-class models instead of Frappe JSON DocTypes, ~15 years of independent design. Same broad domain as ERPNext (ERP), so this isolates the **framework** variable while holding domain roughly constant — exactly the confound the run-4 (hrms) independence caveat said only a non-Frappe target could break. Method per `concept-recovery.md`: tier-1 aggregate over the model layer + tier-2 schema sample + a selective tier-3 source read on the two highest-value targets (`account.move`, `mrp.bom`). **Verdict: the strongest saturation result of the exercise. The taxonomy holds on a genuinely independent framework, and the two strongest structural candidates the Frappe runs surfaced (recursive-composition/BOM, hash-chained immutable ledger) recur here in independent source — so they are framework-independent joints, not Frappe artifacts.**

---

## Why this run is the one that counts

The run-4 caveat was blunt: ERPNext and hrms share a company, a framework, and the `docstatus` lifecycle, so their agreement was **framework-confounded** — weak evidence for the *taxonomy*, strong only for "both use Frappe." CRM (run 5) widened the *domain* but stayed on Frappe. The honest conclusion stood: *the genuine independence test is a non-Frappe system where no shared substrate can explain the recurrence.* This is that test. If the same atoms reappear in Odoo, the recurrence cannot be a Frappe feature — Odoo shares no code, no schema convention, and not even Frappe's universal `docstatus` (Odoo declares a **per-model `state`** instead; see the contrast finding below).

## Tier-1 aggregate (the whole model layer — *computed facts*)

| Signal | Odoo v19 | Reading |
|---|---|---|
| Distinct models (`_name`) | **1,350** | the concept surface |
| Model class definitions | **3,796** | gap over 1,350 = `_inherit` **extensions** — the dense extension graph (e.g. `account.move` extended by 90+ `l10n_*` localization modules) |
| `state = fields.Selection(` (literal) | **≥98** | per-model lifecycle state machines — a **floor** (many more carry `_inherit`-added or differently-named state fields: `payment_state`, `invoice_status`, `delivery_status`…) |
| `mail.thread` inheritors | **150** | the audit/chatter mixin — opt-in change history |
| `tracking=True` fields | **465** | field-level change tracking (the `track_changes` analog) |
| `ir.sequence` / sequential-id usage | **1,481** | the human-readable sequential-id primitive |
| Relational edges (M2o+O2m+M2m) | **4,794** (3,266 + 730 + 798) | ≈ **3.6 edges/model** — the composition graph wiring primitives together |

The shape is the same one ERPNext showed: a **small set of recurring primitives** (a per-model lifecycle state machine, ledgers, sequential ids, change-tracking) under **1,350 domain models** wired by ~4,800 edges. The "80% is patterns implemented thousands of times" thesis, measured a second time — on an unrelated codebase.

**Note on cross-run metrics.** The Frappe runs counted `% submittable` (the universal `docstatus`). Odoo has **no universal docstatus** — each model declares its own `state` Selection — so that exact metric does not port, and forcing a shared-% table would be false equivalence. The Odoo analog is the per-model `state` machine count above. The structural difference is itself a finding (below).

## Tier-2 sample — every model recombines existing atoms (*schema-level; structure recovered, invariants inferred*)

| Odoo model | Recovered substrate (existing atoms) | Evidence |
|---|---|---|
| **`sale.order`** | Workflow State Machine + **Provisional Commitment** (`commitment_date`) + lock-on-confirm immutability + derived rollups | `state = fields.Selection`; `commitment_date`; `locked`/`action_lock`; `_action_confirm` |
| **`account.move`** (+ `.line`) | **Immutable Transaction Ledger + Event Log + Tamper Evidence + binding-bijection** (double-entry) | tier-3 confirmed — see headline |
| **`stock.move`** (+ `stock.quant`) | Workflow State Machine + **Balance Ledger** (ledger + derived on-hand `quant` + **Capacity Constraint**) | `state = fields.Selection`; `quantity`/`picked`; quant = derived index |
| **`crm.lead`** | **Workflow State Machine** (deployment-declared `stage_id`) + Party + activity timeline | `stage_id` (Many2one `crm.stage`); `type` lead/opportunity; `_track_duration_field` |
| **`hr.leave`** | **Approval Step + leave ledger + Capacity Constraint** | `state` Selection (draft→confirm→validate→refuse); `holiday_status_id`; `CHECK (number_of_days >= 0)` |
| **`res.users` / `res.groups`** | **Credential + Session + Permissions** | `password` + `_check_credentials` (+ 10-min freshness window); `group_ids → res.groups` (+ implied groups); `res.users.log` |
| **`res.partner`** | **Party Identity** | the universal party record |
| **`mail.thread` / `mail.message` / `mail.tracking.value`** | **Event Log** + field-change audit | 150 inheritors; 465 `tracking=True`; `res.users.log` |

No sampled model required a primitive the library lacks. A different framework's domain layer decomposes onto the **same atom set** — Workflow State Machine, Immutable Ledger, Event Log, Tamper Evidence, Capacity Constraint, Approval Step, Credential/Session/Permissions, Party Identity, derived indexes — drawing different subsets per domain exactly as the Frappe products did.

## The headline — two structural candidates recur in *independent source* (tier-3, deeply read, not run)

This is the part that earns the run. The two strongest candidates from the ERPNext exercise reappear in Odoo's controllers, written by a different team with no knowledge of Grace Commons:

1. **Acyclic Recursive Composition / Bill-of-Materials — confirmed independently.** `mrp.bom` carries `bom_line_ids` (its components) and `child_bom_id = Many2one('mrp.bom', 'Sub BoM')` — the recursive sub-BOM reference. `_check_bom_cycle()` (with a recursive `_check_cycle` helper) walks the component tree and raises *"a cycle between these products"* if a component is an ancestor of itself. This is the **same acyclicity invariant** ERPNext's `bom.py` enforced via `check_recursion`/`BOMRecursionError` (run-3 tier-3) — now witnessed in a **second, independent** framework. The new-atom candidate (recursive structure + acyclicity + quantity rollup) is no longer a Frappe artifact; it is a joint two unrelated ERPs both cut.

2. **Hash-chained immutable ledger + double-entry binding bijection — confirmed independently.** `account.move._check_balanced` asserts *"the move is fully balanced debit = credit"* — the **binding-bijection** emergent invariant the ERPNext GL-Entry run could only *infer* from schema, here **confirmed in source**. And `account.move` carries a tamper-evidence hash chain the ERPNext run never reached: `inalterable_hash` + `secure_sequence_number` ("Inalterability No Gap Sequence #") + `_calculate_hashes` linking each posted entry to its predecessor, with `_unlink_forbid_parts_of_chain` enforcing that *"a move with a sequence number can only be deleted if it is the last element of the chain."* That is **Event Log** (append-only, gap-free total order — Event Log Invariant 3) + **Tamper Evidence** (hash chain) + **Immutable Transaction Ledger** (C6), built independently, and gated by a deployment toggle `restrict_mode_hash_table` (the library's Configuration-knob construct — regulated deployments turn it on; cf. France's anti-fraud law). This is the Beacon demo's hash-chained tamper-evident audit trail, re-derived by an ERP vendor for fiscal compliance.

**The Sequential Identifier candidate also recurs hard** — `ir.sequence` at **1,481 usages**, a completely different implementation from Frappe's `naming_series` but the same primitive (scoped, monotonic, gap/rollover-aware human-readable ids). Cross-framework recurrence; strong Gate-1.

## Contrast finding — the taxonomy survives a real framework-design divergence

ERPNext uses a **universal** `docstatus` (Draft 0 → Submitted 1 → Cancelled 2) backbone; Odoo uses **per-model `state` Selection** fields with no universal lifecycle. These are two genuinely different framework answers to "how does a record have a lifecycle." The library's **Workflow / State Machine** atom (deployment-*declared* finite states) covers **both**: Frappe's docstatus is the fixed-3-state special case (≈ the Approval Step pole), Odoo's per-model state is the general declared-states case. The atom predicted the general shape; both frameworks are instances of it. A taxonomy that bent to one framework's convention would have mis-fit the other — this one fit both.

## Candidate cross-check scorecard (the real value of an independent target)

| Candidate (origin) | Recurs in Odoo? | Strength now |
|---|---|---|
| **Acyclic Recursive Composition / BOM** (ERPNext run 3) | **Yes** — `mrp.bom._check_bom_cycle` + `child_bom_id`, tier-3 source-confirmed | **cross-framework** — strongest new-atom candidate; promote to gated atom proposal |
| **Sequential Identifier / Naming Series** (ERPNext run 3) | **Yes** — `ir.sequence`, 1,481 usages, independent implementation | **cross-framework** — strong Gate-1; run the gates |
| **Balance Ledger** composition (hrms run 4) | **Yes** — `account.move`/`stock.move` + `stock.quant` derived balance + Capacity Constraint | **cross-framework** — composition pattern, not atom; name it |
| **Idempotency Result Memo** (composition-state audit) | Not sampled (transactional-write idempotency lives in controllers, tier-3) | unchanged — needs a depth dive |
| **Deadline / SLA** (CRM run 5) | **Weakly** — `crm.lead.date_deadline` is advisory ("Expected Closing"), not a hard breach-detection surface in community models | **no strong third witness** — stays at 2 (CRM SLA + regulatory); Odoo's hard SLA lives in Enterprise helpdesk, unsampled |

## Eval (run 6)

- **Independence achieved — the headline.** This is the first target where framework, company, and ORM are all independent of the prior corpus. The taxonomy held, and the structural candidates recurred *in source*. The run-4 caveat is now answered for the framework axis: the recurrence is **not** a Frappe feature, because Odoo shares no Frappe code and not even Frappe's docstatus.
- **Two candidates promoted from "Frappe-only" to "cross-framework."** Recursive-composition/BOM and Sequential Identifier each now have two independent witnesses on unrelated frameworks — far stronger Gate-1 evidence than any number of same-framework confirmations.
- **A binding bijection confirmed in source.** `_check_balanced` (debit=credit) is the first time the double-entry binding-bijection invariant was *read from a controller* rather than inferred from schema — and it matches the library's binding-bijection emergent-invariant shape (C6/C12/C3).
- **Tamper-evidence found where the Frappe runs never looked.** Odoo's `inalterable_hash` chain is an independent implementation of the Audit Trail substrate's hash chain — corroborating Event Log + Tamper Evidence + the no-gap total-order invariant on a real fiscal-compliance surface.
- **Caveats, on the record:**
  - **Domain still overlaps.** Odoo is an ERP, like ERPNext — this run isolates the **framework** confound, not the **domain** one. The recurrence of *structural* candidates (recursion, hash chain) is the framework-independent part; the recurrence of *ERP domain* concepts (ledgers, orders) is partly "two ERPs share ERP concepts." A **non-Frappe, non-ERP** target (EHR, banking core) is the remaining axis — run 7.
  - **Tier-3 is read, not run.** No Odoo instance was stood up (the ERPNext-BOM limit applies: framework-heavy depth needs the runtime). So the source confirmations are *deeply read* — invariant recovery is solid (the controllers are explicit), but no bug was *executed*; this run reports **confirmations, not bugs**. An executed finding would need an Odoo instance + its own test suite as the trace source (the asgi method at scale).
  - **`state`-floor undercount.** The 98 literal `state = fields.Selection` is a floor, not a census of Odoo state machines.

## Recovery arc — six runs, the combined picture

| Run | Target | Type | Headline |
|---|---|---|---|
| 1 | `pboyer/rec` | depth | Invertible Delta concept; **reproduced** COMPOUND-return bug types+tests missed |
| 2 | `asgi-idempotency-header` | depth | **predicted Memo atom confirmed** in the wild; **reproduced** bricked-key bug violating a named invariant |
| 3 | ERPNext (Frappe) | breadth+tier3 | transactional backbone saturates; **recursive-BOM gap** surfaced; derived-index rule corroborated |
| 4 | hrms (Frappe) | breadth | same-framework saturation; **framework-vs-domain confound** flagged |
| 5 | frappe/crm | breadth | non-transactional domain saturates on a *different* atom subset; taxonomy not ledger-biased |
| 6 | **Odoo 19 (non-Frappe)** | breadth+tier3 | **independence test passed: taxonomy + recursive-composition + hash-chain ledger + sequential-id all recur on an independent framework** |

Across ~1,350 Odoo models + ~730 Frappe DocTypes (three products) + 2 small libraries — two ERP frameworks from different companies plus two standalone libs: **two executed bugs, one confirmed prediction, cross-domain *and* cross-framework saturation onto the existing atom set, two structural candidates now witnessed on two independent frameworks (recursive-composition, sequential-id), one binding-bijection confirmed in source, and an independent hash-chain tamper-evidence implementation.** Honest limits on record: tier-3 still read-not-run without a runtime; the remaining generalization axis is non-ERP domain.

## Actions

- **Backlog (Grace Commons):**
  - **Acyclic Recursive Composition / Bill-of-Materials** — now **cross-framework confirmed** (ERPNext `check_recursion` + Odoo `_check_bom_cycle`, both tier-3). This is the strongest new-atom candidate of the whole exercise; **run the three gates** (acyclicity + quantity-rollup invariants; flat-explosion = derived index).
  - **Sequential Identifier / Naming Series** — cross-framework (Frappe `naming_series` + Odoo `ir.sequence`, 1,481 usages); run the gates.
  - **Balance Ledger** composition pattern (ledger + derived running balance + Capacity Constraint) — third corpus (Odoo `account.move`/`stock.move`); name as reusable wiring, not an atom.
  - **Deadline / SLA** — *no* strong third witness in Odoo community; leave at two witnesses, do not over-promote.
- **Thesis (Jackson / Sloan):** the headline upgrades from product-count to **framework-independence**: *"the same ~27 atoms — and the same two structurally-novel candidates — surface in two ERPs built by different companies on different frameworks, one of which (Odoo) re-implements the library's hash-chained tamper-evident ledger and acyclic-composition primitives independently."* This is the reverse-direction twin of the emergent-invariant saturation claim, now with the framework confound controlled. Pair with the honest "still ERP-domain; non-ERP is next."
- **Next (run 7 — the last axis):** a **non-Frappe, non-ERP** target — a healthcare EHR (e.g. OpenMRS), a banking core, or a scheduling/clinical system — to isolate the **domain** confound the ERP targets all share. That run tests whether the atom set reaches a domain neither ERP exercised, and is the remaining piece of the generalization story.
