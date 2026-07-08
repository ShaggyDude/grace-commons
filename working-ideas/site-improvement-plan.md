# Site improvement plan — the six missing bridges

_Working staging, not canonical. Ranked by payoff per effort from an external read-through of [gracecommons.dev](https://gracecommons.dev) (2026-07-06, fresh-reader session). The corpus is the strongest part of the site; every gap below is a bridge — for the skeptic in a hurry, the visual thinker, the newcomer. Executed items graduate into the site and this doc's rows get struck._

**The frame.** The site currently serves the reader who already cares and has time. The audiences it under-serves: the skeptic who will give it five minutes (item 1), the triaging engineer scanning fifty-two dense pages (item 2), the reviewer who wants a live trust signal (item 3), the newcomer with no path (item 4), the spec-driven-development audience searching right now (item 5), and the would-be contributor scared off by the nine-pass gauntlet (item 6). Per the 92%-good doctrine the target is not perfection — it is closing the highest-leverage gaps in order.

---

## 1. "Verify it yourself" page — the missing killer feature

**What.** One page of literal copy-paste commands reproducing every headline claim from a cold clone: build the conformance fixture → `node validate.mjs clinical-trial-portal` → 20/20 → build renders 2–5 → `agree.mjs` → cross-render 100% → inject `--defect genesis-hash` → agreement drops to 19/20 and *localizes* the defect (the negative control) → `tools/harness` bootstrap → correct models hold, buggy twins rejected. Close with the one-line meaning of each number.

**Why first.** The single most persuasive asset the project has is that a stranger can re-run the evidence, and no page says so in one place. An external session reproduced the full chain in roughly an hour from a cold sandbox; package that hour as the visitor's on-ramp. *"Don't believe us — run this"* is a page no one else in the spec-driven-development wave can publish.

**Effort.** Hours. Zero new tooling; the commands exist and are documented in [`tools/conformance/README.md`](../tools/conformance/README.md) and [`tools/harness/README.md`](../tools/harness/README.md) — this page is curation, not construction. Keep counts deferred to the tools' own output per the no-snapshot discipline (state the *commands*, let the run state the numbers).

## 2. Generated pattern cards + the composition-graph visual

**What.** (a) A derived header card at the top of every pattern page: status token, invariant count, verification badge ("TLA+ · states clean · twin rejected"), composed-by fan-in, standards anchors. (b) A generated Mermaid rendering of the composition graph on the atoms/compositions index pages — atoms → compositions → substrates, fan-in as visual weight, derived overlays as color.

**Why.** Fifty-two dense pages with no triage surface. Every card field is readable off data that already exists (Status lines, harness results, `## Composes` edges), so the cards *cannot drift* — generated, never hand-maintained, the same discipline as `atoms/index.md`. The graph visual is the honest replacement for code-mass visualizations: semantic leverage instead of lines of code.

**Dependencies / cross-refs.** This executes roadmap methodology debt #10 (Tiny Map / composition cards) and the substrate-composing overlay + reverse-leverage view ([`open-questions.md`](../open-questions.md)). The emitter is a small extension of [`tools/taxonomy/generate_views.py`](../tools/taxonomy/generate_views.py)'s existing graph inversion. Retires the hand-tracked warning label on [`architecture-map.mermaid`](./architecture-map.mermaid) by making the map derived.

## 3. CI-published status page

**What.** Wire the formal harness and the conformance validator into continuous integration alongside the linter (which already gates), and publish the actual run output as a site page: models verified, twins rejected, conformance percentage, lint findings, run date.

**Why.** [`risks.md`](../risks.md) names the gap itself (enforcement debt: harness and validator run under no gate). Closing it is simultaneously an engineering fix and the site's live trust signal. **The one rule:** the page publishes the CI artifact verbatim — never a hand-written mirror of it. A hand-written "93/93 green" is the exact rot class the no-snapshot rule exists to kill; the generated artifact is immune.

**Effort.** A day-ish: two workflow jobs (the harness needs its JRE bootstrap step; the conformance fixtures build in-sandbox by design) plus a small render-to-page step.

## 4. A human reading trail

**What.** A short "Start here" page: **Event Log** (see what an atom is, 10 minutes) → **Audit Trail** (see composition and emergent invariants) → **the verify page** (see that it's real) → **The Spec Layer** (the why, if hooked). One trail, four stops, ~30 minutes.

**Why.** [`AGENTS.md`](../AGENTS.md) gives agents a reading order; humans get thirty nav items and no path. The three-tier discipline promises accessibility per document — this is the same promise at site scope.

**Effort.** An hour of writing. The hardest part is resisting the urge to add a fifth stop.

## 5. The positioning page, made public

**What.** A public page carrying the argument currently staged in [`prior-art-and-positioning.md`](./prior-art-and-positioning.md): the 2024–26 spec-driven wave *declares* the spec the source of truth; this library carries the machinery that *earns* the word (grounded review, formal twins, measured conformance, the earning-SSOT three conditions). Include the drift-direction contrast (their specs chase code; here code chases spec) and the verification-floor contrast (schema lint vs records-alone conformance).

**Why.** The spec-driven-development audience is searching *right now* — Kiro, Spec Kit, and Tessl created the category vocabulary; this page is what they should land on. The argument is written; it is just filed as internal staging while being the sharpest public differentiator.

**Effort.** Mostly promotion + a fresh-reader pass (the staging note was call-prep; a public page carries a different tone bar). Note the canonical-vs-staging rule: promotion means the page becomes canon and the staging note dies into it.

## 6. Smaller, still real

- **Harmonize the demo login walls.** Multi-Party Approval lands logged-in with an acting-as switcher — a stranger understands the library in ten seconds. Attributed Permissions Admin and both Beacon renders land on sign-in forms (credentials printed, but still a wall). Adopt the acting-as pattern, or add a one-click demo-account button.
- **A contributor ladder below the nine-pass gauntlet.** [`contributing.md`](../contributing.md) leads with pattern proposals against a quality bar that reads as terrifying to a newcomer. Name the smaller rungs explicitly: (1) report a spec ambiguity as an issue — a finding, the cheapest real contribution; (2) witness a pattern in the wild — evidence rows for the recovery/detector work; (3) propose an atom candidate through the routing test. Issue #1 already proved the loop (external question → canonicalized answer in pressure-testing); advertise that arc as the model.
- **Discoveries as linkable posts.** The genesis-hash catch, the nine-system saturation study, and the four-serialization-mechanisms result are shareable artifacts written as internal log entries. One post-shaped page each (the dated log entry remains the record; the post is a view of it).

---

## Sequencing

Items 1 and 4 are pure writing — do first, in either order. Item 2 rides the taxonomy generator and executes standing debt (#10 + the overlay question) — schedule as the first tooling slice. Item 3 is the enforcement-debt closer — pairs naturally with any CI touch. Item 5 needs a fresh-reader pass before publication. Item 6 is a background lane.

_Source session: 2026-07-06 external read-through (full-corpus verification: conformance 20/20 reproduced, 5-render agreement, negative control, 93/93 formal models). This plan is the site-facing residue of that session; the doc-drift fixes and prior-art notes from the same session landed separately._
