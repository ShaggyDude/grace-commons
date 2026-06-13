# Concept recovery — run 5: frappe/crm saturation (2026-06-13)

> **Status: internal staging, not canonical.** The *domain-shape* run — NOT an independence test (still same company / same framework, so the run-4 caveat applies in full). Subject: [`frappe/crm`](https://github.com/frappe/crm) (a newer, leaner Frappe product; 44 DocTypes, 33 non-child; modern Vue/frappe-ui frontend). Purpose: every prior target was **transactional** (ledgers, submittable documents) — a biased sample. CRM is the first **non-transactional** domain (leads, deals, pipeline, contacts, activity). Does the atom set cover relationship/pipeline management, or is it quietly a *ledger* taxonomy? Tier-1 + light tier-2, metadata-level (structure recovered, invariants inferred). **Verdict: the strongest domain-coverage result of the exercise — CRM saturates onto a completely *different subset* of the same atoms, with zero ledgers and zero submittables. The taxonomy is not ledger-biased.**

---

## The headline number — the transactional backbone vanishes

| Signal | ERPNext | hrms | **CRM** |
|---|---|---|---|
| **Submittable (`docstatus`)** | 29% | 50% | **0%** |
| `status` Select | 28% | 27% | 21% |
| Ledgers (`*Entry`) | 15 | several | **0** |
| Link edges / DocType | ~4 | ~3 | ~1 |

**0% submittable.** The docstatus/ledger backbone that dominated both transactional products is *entirely absent*. This refines the independence caveat in a useful direction: docstatus is **domain-gated, not framework-universal** — Frappe offers it, but CRM doesn't use it *because CRM isn't transactional*. So the backbone recurrence in ERPNext/hrms tracked the transactional **domain**, not merely the shared framework. (It doesn't dissolve the framework confound — Invitation lifecycles and status-via-linked-status-DocType are still Frappe idioms — but it shows the *dominant* prior signal was domain-driven.)

## CRM saturates onto a DIFFERENT atom subset (tier-2 confirmed)

| CRM concept | DocTypes | Existing atom |
|---|---|---|
| **Pipeline / funnel progression** | CRM Lead, CRM Deal + CRM Lead Status / CRM Deal Status (configurable stages) | **Workflow State Machine** — deployment-declared finite states, verbatim. Lead→Deal link = the conversion. |
| **Activity timeline** | CRM Call Log (own lifecycle: Initiated/Ringing/…/Completed/Failed), FCRM Note, Communication | **Event Log** (append-only per-entity activity) + per-activity state machine |
| **Party / relationship** | CRM Lead, CRM Organization, Contact | **Party Identity** |
| **Invitation** | CRM Invitation (status Pending/Accepted/Expired; `email_sent_at`, `accepted_at`) | **Invitation atom — DIRECT VERBATIM HIT.** The library's Invitation lifecycle (Pending → Accepted, with expiry) matches exactly. |
| **Hierarchy** | CRM Territory (`is_tree`, self-referencing), CRM Sales Hierarchy | tree/recursive structure (simple single-parent cousin of the BOM DAG gap) |
| **SLA / response deadline** | CRM Service Level Agreement + Lead/Deal `response_by`, `first_responded_on`, `first_response_time` | **candidate — second witness for the forthcoming Regulatory Deadline atom** (see below) |

**No ledgers. No submittables. No capacity constraints.** A completely different slice of the library than the transactional products used — Workflow State Machine, Event Log, Party Identity, Invitation, hierarchy, deadline — and it still lands on the existing atom set. **This is the answer to the bias question: the taxonomy is not a ledger taxonomy.** It spans transactional *and* relationship/pipeline domains, drawing a different subset of primitives for each.

## Candidate surfaced — SLA / Deadline (second witness)

CRM Lead and CRM Deal carry an SLA-driven **`response_by` deadline** (computed from the linked Service Level Agreement + Holiday List) and a **`first_responded_on`** fulfillment, with breach observable from records (`first_responded_on` vs `response_by`). This is a clean **time-bound obligation with breach detection** — a strong second witness for the library's backlog **Regulatory Deadline** atom (the first being the regulatory/compliance deadline case). A *Deadline / SLA* atom (commitment to act by a computed time; breach observable from records; holiday-calendar-aware) now has cross-domain recurrence. Run the gates.

## Eval (run 5)

- **Domain-coverage confirmed, against the bias.** The prior four runs were transaction-heavy; CRM is the non-transactional control, and the taxonomy held — on a *different* atom subset. This is stronger evidence for *sufficiency* than another transactional confirmation would have been.
- **The 0%-submittable contrast is itself a finding:** the "backbone" is domain-gated, partially rehabilitating the ERPNext/hrms evidence (the recurrence tracked transactional domain, not just framework).
- **One verbatim atom hit (Invitation)** and **one strengthened backlog candidate (Deadline/SLA, 2nd witness).** Zero new structural primitives — CRM is recombination, like hrms.
- **Caveats unchanged:** still same-company/same-framework (independence untested — a non-Frappe target remains the real generalization test); tier-1/2 metadata-level (invariants inferred, not verified — a deadline-breach invariant would be the asgi-grade depth dive, needing a bench).

## Recovery arc — five runs, the combined picture

| Run | Target | Type | Headline |
|---|---|---|---|
| 1 | pboyer/rec | depth | Invertible Delta concept; **reproduced bug** (COMPOUND return) types+tests missed |
| 2 | asgi-idempotency-header | depth | **predicted Memo atom confirmed** in the wild; **reproduced bricked-key bug** violating a named invariant |
| 3 | ERPNext | breadth+tier3 | backbone saturates; **one structural gap (recursive BOM)**, invariants recovered, derived-index rule corroborated |
| 4 | hrms | breadth | saturation across same-framework product; **framework vs domain evidence split** (independence caveat) |
| 5 | frappe/crm | breadth | **non-transactional domain saturates on a different atom subset**; taxonomy not ledger-biased; Deadline 2nd witness |

Across ~480 DocTypes + 2 small libraries: **two executed bugs, one confirmed prediction, cross-domain saturation onto the existing atom set, one new-atom candidate (BOM), one new-composition candidate (Balance Ledger), two strengthened backlog atoms (Idempotency Memo, Deadline/SLA).** Honest limits on record: same-framework (independence untested), and depth-at-scale needs a runtime. A clean, calibrated body of evidence for the saturation/sufficiency thesis.

## Actions

- **Backlog (Grace Commons):** **Deadline / SLA** atom — now a 2nd witness (CRM SLA + the regulatory case); run the gates. Invitation atom — confirmed in the wild (no action, corroboration). Territory/hierarchy — note as the simple-tree cousin of the BOM recursive-composition candidate.
- **Thesis (Jackson/Sloan):** the strongest single line is now domain-coverage, not product-count: *"transactional and relationship domains both decompose onto the existing atom set, each drawing a different subset."* Pair with the honest independence caveat and the BOM gap.
- **Next (the real generalization test):** a **non-Frappe** target — Odoo (Python ERP, different framework, same domain → isolates framework) or a different-domain system (EHR, banking core). That is the run that earns the independence ERPNext+hrms+CRM cannot.
