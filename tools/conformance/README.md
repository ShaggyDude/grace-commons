# Conformance validator

The **level-1 feedback loop** as an artifact: point it at a running *render* (an
implementation) plus its spec-derived *manifest* and it returns a measured
`correctness(%)` — the fraction of the spec's checkable claims the render
provably honors, **counted, not asserted**.

It is the third checker in the trilogy, and shares their house style
(dependency-light, exit-coded, high-precision):

| tool | guards | reads |
|---|---|---|
| `tools/linter/lint.py` | the spec **prose** | cross-references in the markdown |
| `tools/harness/check.mjs` | the spec **proofs** | TLA+ / Alloy models |
| **`tools/conformance/`** | the spec **behaviour** | a render's records |

Zero external dependencies — Node ≥ 22 built-ins only (`node:sqlite`,
`node:crypto`). Nothing to install.

---

## Quickstart

```bash
cd tools/conformance

# 1. Build the render-1 store (see "The fixture" — no Deno needed in-sandbox).
node fixtures/build-clinical-trial-portal.mjs

# 2. Measure it.
node validate.mjs clinical-trial-portal
```

```
  CORRECTNESS: 95.0%   (19/20 passed)
  in-scope record-clearable: 20  ·  pass 19 · fail 1 · pending 0 · error 0
  critical-fail gate: 1 CRITICAL FAIL(S)
  ... FAIL C1-2b  hash chain diverges at event #1 ...
```

`--db <path>` measures any store (e.g. a live `deno task seed` DB);
`--json` emits a machine-readable report (for CI / the regen loop);
`--quiet` drops the per-check table.

**Exit codes** (house convention): `0` clean (no fail, no error) · `1` a
denominator check FAILED or an evaluator errored · `2` usage / load error.

---

## The four pieces

```
manifests/<render>.manifest.json   the structured oracle  (Day 1)
evaluators.mjs                     render-AGNOSTIC check logic, keyed by check id
adapters/<render>.adapter.mjs      the ONLY per-render code — a records-alone seam
validate.mjs  +  lib/score.mjs     the runner and the scoring kernel
```

- **Manifest** — one entry per *Generation-acceptance* check across the
  render's composition surface (C16 / C13 / C14 / APA / C1), each
  `{ id, claim (verbatim spec text), kind, render_scope, severity }`. It never
  names a table or an endpoint; it is stack-agnostic. Hand-authored for now;
  derive-from-prose is next-week.
- **Evaluators** — the check logic, written purely against the adapter contract
  in spec vocabulary (events, records, ordering). **No SQLite, no render
  knowledge.** This is why a second render needs *only* an adapter — the
  evaluators are shared.
- **Adapter** — the per-render seam: a small, **trusted**, read-only query layer
  that maps spec concepts onto *that* render's store. A wrong mapping makes a
  conformant render look broken, so it is small and reviewed. It only reads.
- **Runner + scorer** — load manifest → run each in-scope check through its
  evaluator against the adapter → tally → print. `lib/score.mjs` is the single
  implementation of the denominator rule and is unit-tested in isolation.

---

## The number (denominator rule)

The canonical, machine-readable definition lives in the manifest's
`denominator_rule` block. In short:

```
correctness(%) = (in-scope record-clearable checks that PASS)
                 ─────────────────────────────────────────────  × 100   (equal weight)
                 (in-scope record-clearable checks evaluated)
```

Two axes decide what counts:

- **`kind`** — the spec's own split, quoted verbatim from each Generation-
  acceptance section. `record-clearable` (an auditor can clear it from the
  records alone) is the only kind eligible for the denominator.
  `externally-clearable` (needs policy, a disclosure, or code inspection) is
  **reported separately, never scored**.
- **`render_scope`** — `out-of-scope` marks a check that is record-clearable in
  principle but reads composition substrate this render deliberately omits
  (credential-revocation cascade maps, a per-call authorization log, a
  cryptographic attestation store). Each carries a Demo2-plan citation. **Also
  reported separately, never scored** — so a render is never false-failed for a
  design decision it documented.

`pending` (no evaluator yet) and `error` (evaluator threw) are excluded from the
denominator, so a half-built run reports the honest fraction of what it actually
measured rather than deflating toward zero.

**Severity** never weights the percentage (equal weight, week 1). It drives
triage order and a *separate* gate reported beside the number:
`critical_fail_count == 0`.

For render 1 the manifest has 34 checks → **20 in the denominator**, 5
externally-clearable, 9 out-of-render-scope.

---

## Derive-from-prose (keeping the manifest honest)

The manifest is hand-authored — which invites the fair question *"did you
cherry-pick or misquote the checks?"* `extract-manifest.mjs` answers it
mechanically. It parses each composition's `## Generation acceptance` section
and pulls out the spec-**intrinsic** fields, which the spec decides, not the
author:

- `claim` — the verbatim bold lead of each GA check,
- `kind` — inferred from the GA section's own subsection headers and language
  ("Externally-clearable checks", "requires code inspection", …),
- `ga_ref` — the check's position in the section.

It **cannot** derive the render-**specific** fields (`render_scope`, `severity`,
`scope_note`, `adapter_capability`) — those depend on what a given render
implements and stay a small, explicit, auditable overlay.

```bash
node extract-manifest.mjs ../../compositions/audit-trail.md --code C1   # emit checks
node extract-manifest.mjs --reconcile clinical-trial-portal             # diff vs manifest
```

`--reconcile` (exit-coded, reads `manifests/<render>.surface.json` for the
render's composition coverage) enforces three things:

- **claim faithfulness** — every manifest claim is verbatim-present in the spec
  prose (catches misquotes / invented checks),
- **completeness** — every spec GA check maps to a manifest entry (catches silent
  omissions; 1-to-many splits are allowed),
- **kind discipline** — a manifest `kind` that diverges from the spec-default is
  a *hard* finding **unless** the entry carries an explicit `kind_override`
  reason (a documented divergence is reported as info).

Render 1 reconciles at **0 drift findings** with **1 documented override**
(C14-4: principal-binding is externally-clearable in the bare spec but
records-clearable here because render 1 composes Audit Trail). Running it after a
spec edit tells you immediately whether the manifest drifted. Full
auto-generation of the manifest from prose builds on this; today it keeps the
hand-authored manifest provably faithful.

---

## Proof it has teeth

A green run is meaningless unless the validator can go red. Build variants with
the fixture builder and watch the *right* check move — no false greens, no false
fails:

| build | correctness | reds |
|---|---|---|
| faithful (default) | **95.0%** | `C1-2b` |
| `--clean-genesis` | **100%** | — |
| `--defect skip-grant-audit` | **90.0%** | `APA-1` (grant 7), `C1-2b` |
| `--clean-genesis --defect tamper-payload` | **95.0%** | `C1-2b` (localized at the tampered row #13) |

- `--clean-genesis` → **100%** proves 95% is not a ceiling artifact: a correct
  render scores full marks; the only gap is a real defect.
- `--defect skip-grant-audit` (a render that writes a grant row but skips its
  audit append — the PLAN's example) flips **APA-1**, which names the exact
  offending grant.
- `--defect tamper-payload` (an adversary rewrites a committed payload) makes the
  hash chain diverge **at the tampered row**, which the verify surface localizes
  precisely — the `tamper.test.ts` property, now measured.

### The validator's first real catch (a genuine render-1 finding)

The lone baseline red, **C1-2b**, is **not** synthetic. Render 1's seeded
genesis event (`study.registered`) is hashed in `scripts/seed.ts` **without** the
`id` field, while `domain/event_log.ts` `appendEvent`/`verifyChain` hash **with**
`id`. The genesis row therefore fails `verifyChain` on a *pristine* database — a
CRA clicking `/audit/verify` on an untampered store would see "Tamper detected at
event #1." The render's own tests never exercise `verifyChain` over the seeded
event, so the defect is latent; the conformance run surfaces it immediately, and
(because `verifyChain` stops at the first divergence) the genesis break also
*masks* downstream tamper detection. This is a render bug, logged here and in
chat — it is **not** patched from this tool (that is the render's review channel).

---

## Regen-fix loop

`regen.mjs` closes the level-1 loop: generate → check → fix → retest, until a
render clears a correctness threshold. The validator is the **fitness function**
— a candidate fix is kept only if it provably raises the measured number with no
regression.

```bash
node regen.mjs                 # climb a defective render to 100%
node regen.mjs --prove-guard   # show the fitness check REJECTS a regressive patch
```

```
  iter 0 — start: 90.0%   reds: [APA-1, C1-2b]
  iter 1 — addressing APA-1 ... 90.0% → 95.0%  KEPT
  iter 2 — addressing C1-2b ... 95.0% → 100.0% KEPT
  DONE — 100.0% after 2 fix(es). threshold cleared.
```

Two parts, with an honest line between them:

- The **driver** (measure → propose → apply → re-measure → keep-iff-improved →
  iterate) is the reusable contribution. It is render-agnostic and selects purely
  on the validator's number. `--prove-guard` demonstrates it is not vacuous: fed
  a deliberately regressive proposal it measures 95% → 90% and **reverts**,
  exiting non-zero rather than accepting a fix that games nothing.
- The **proposer** is the **LLM-pluggable seam**. In production an agent reads
  the reds plus the render source and writes a real patch. Here it is a small
  rule table that maps a red to the render edit addressing it (restore a skipped
  audit append; align the genesis hash) — keyed off the red's content, not
  knowledge of which defect was injected. The "render" is the faithful fixture
  and a "patch" is an edit to its build-state; the live demo is never touched.

## Plugging in a new render

The whole point of the adapter seam: a second render drops in by writing **one
file**.

1. **Write `adapters/<render>.adapter.mjs`** — default-export
   `createAdapter({ dbPath }) → adapter`, implementing the read-only,
   synchronous contract documented at the top of `evaluators.mjs`
   (`events`, `eventsByAction`, `verifyChain`, `grants`, `sessions`,
   `onboardingCompletions`, …). Map spec concepts onto your store; keep it
   small and reviewed (it is trusted).
2. **Write `manifests/<render>.manifest.json`** — same shape as render 1's;
   set each check's `render_scope` honestly against what your render implements.
3. `node validate.mjs <render> --db <your store>`.

The evaluators and the scorer are unchanged. If a check needs a records-alone
accessor your adapter doesn't yet expose, add it to the contract (and to every
adapter) — that keeps the evaluators render-agnostic.

---

## Multi-render agreement (the thesis number)

A spec claim is *carried by the spec* only if it holds identically across two
**independent** renders of the same surface. Render 2
(`clinical-trial-portal-next`) is built for this: pure Node (no Deno/jsr),
different schema (`people`/`accounts`/`ledger`/…), different event vocabulary
(`auth.ok`/`account.open`/`authz.grant`/…), different password method (scrypt),
and a corrected hash chain (no genesis bug). The **same** manifest, the **same**
evaluators, and the **same** ghost scenario drive both — only the two adapters
differ.

```bash
node fixtures/build-clinical-trial-portal.mjs        # render 1 store
node render2/build.mjs                               # render 2 store (same scenario)
node agree.mjs clinical-trial-portal clinical-trial-portal clinical-trial-portal-next
```

```
  render A  clinical-trial-portal        95%
  render B  clinical-trial-portal-next   100%
  CROSS-RENDER CORRECTNESS: 95%   (19/20 pass on BOTH)
    agreed-pass 19 · agreed-fail 0 · DISAGREE 1
    C1-2b   clinical-trial-portal=fail   clinical-trial-portal-next=pass
```

19/20 claims hold identically across both renders — spec-carried meaning,
measured. The lone disagreement is the render-1 genesis bug: the divergence
localizes a render-specific defect rather than a spec property. `agree.mjs`
exits non-zero when renders disagree, so it doubles as a CI gate on spec-carried
behavior. Render 2 joined the whole pipeline by writing **only two adapters**
(`adapters/clinical-trial-portal-next.adapter.mjs` for the validator,
`ghost/adapters/clinical-trial-portal-next.actions.mjs` for the ghost flow) — no
new evaluators, no new manifest.

## The fixture (why it's generated, not committed)

The demo runs on Deno (jsr: imports, Argon2id WASM), which isn't present in this
sandbox, and the checked-in `dev.db` carries only the stale seed event. So
`fixtures/build-clinical-trial-portal.mjs` replays render 1's documented
lifecycle (Demo2-plan §0) into a SQLite store using the render's **actual
schema** (`migrations/0001_init.sql`, exec'd verbatim) and a **byte-faithful
port** of its event/hash construction — faithfulness is checked by reproducing
seed.ts's exact stored hash, genesis bug and all. The store is built onto the
native tmp FS (SQLite can't host a live DB on the mounted repo FS) and the runner
defaults `--db` there; it is never committed. **When Deno is available, skip the
fixture and point `--db` at a real `deno task seed` store** — the validator code
is identical either way.

---

## Layout

```
validate.mjs                       runner (render-agnostic)
lib/score.mjs                      scoring kernel (the denominator rule)
evaluators.mjs                     check logic, keyed by check id (render-agnostic)
extract-manifest.mjs               derive-from-prose: GA parser + --reconcile
regen.mjs                          regen-fix loop (validator as fitness function)
agree.mjs                          multi-render agreement (cross-render correctness)
render2/portal.mjs                 render 2 — pure-Node, different-shape implementation
render2/build.mjs                  render 2 store builder (drives the shared scenario)
adapters/clinical-trial-portal-next.adapter.mjs    render-2 validator adapter
ghost/                             ghost-user flows (scenario runner + per-render actions adapters)
adapters/clinical-trial-portal.adapter.mjs       render-1 seam (the only per-render file)
manifests/clinical-trial-portal.manifest.json    the structured oracle
manifests/clinical-trial-portal.surface.json     render's composition coverage (for reconcile)
fixtures/build-clinical-trial-portal.mjs         lifecycle replay → render-1 store
tests/score.test.mjs               `node --test` — scoring kernel
tests/extract.test.mjs             `node --test` — GA parser
PLAN.md                            the week-by-week build plan
```
