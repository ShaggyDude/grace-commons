# Spec-corpus linter

The mechanical cross-reference checker for the Grace Commons spec layer — a
partial compiler for the prose. The three-pass review and the formal-model
harness verify *meaning*; this verifies the *bookkeeping* the prose has no
compiler to catch: dangling links, invariant-count drift, missing models, stale
forthcoming-markers, and dishonest counts.

It exists to move a class of "needs a careful human/Opus read" work down into
"runs in milliseconds, deterministic, exit 1 on any finding" — so the adversarial
review can spend its scarce attention on the EOS boundary judgment and the
hidden-decision hunt, not on counting invariants and resolving links.

## Run

```
python3 tools/linter/lint.py            # from repo root
python3 tools/linter/lint.py <repo>     # or point it at a checkout
```

Standard library only — no dependencies, no bootstrap, runs anywhere `python3`
does. Prints one finding per line (`path:line: [CODE] message`), a summary on
stderr, and exits `1` if any finding, `0` if clean. Suitable for a pre-commit
hook or CI gate — and as of 2026-06-11 it **is** the CI gate:
[`.github/workflows/lint.yml`](../../.github/workflows/lint.yml) runs it on
every push to `main` and every pull request.

## Checks

| Code | What it catches |
|---|---|
| **A-dangling-link** | A relative `.md` link whose target file does not exist. |
| **B-invariant-count** | "all *N* invariants from [Pattern](path)" where *N* does not equal the real count of `**Invariant N —**` headers in Pattern. (The nine-vs-ten drift hazard.) |
| **C-model-missing / C-twin-missing** | A pattern whose Status claims a verified model (mentions `tools/harness` or a buggy twin) names a `.tla`/`.als` file that is absent, or has no `-buggy` twin beside it (the vacuity guard). |
| **D-stale-forthcoming** | A link whose own `*(forthcoming)*` marker decorates a pattern file that is already `grounded`. |
| **E-count-drift** | The latest "*NN* grounded patterns (*NN* grounded compositions)" claim in `roadmap.md` / `readme.md` does not match the real file count. (Earlier dated claims are history and are allowed to be stale.) |
| **F-invariant-ref** | A "*Pattern* Invariant *N*" cross-reference where *N* exceeds that pattern's real invariant count — the mechanical slice of the capability-provenance rule (`pressure-testing.md` §Capability provenance). Name/number *mismatches* within range stay fresh-reader Pass-2 work. |
| **G-status-grammar** | A pattern with no `## Status` section, or whose status line does not start with one backticked token conforming to the pinned grammar (`pressure-testing.md` §Status line format, pinned 2026-06-11). |
| **H-status-mirror** | A `roadmap.md` list entry that links a pattern and carries a status token differing from the pattern file's own token (the pattern file is the source of truth). Found 25 stale mirrors on its first run. |
| **I-duplicate-row** | A `roadmap.md` status table naming the same pattern twice (the duplicated-Login-row class). |
| **O-term-dangling / O-term-orphan** | On any page carrying an [`annotation.md`](../../working-ideas/annotation.md) `## Terms` registry, a `[Term]` shortcut-reference marker with no `[Term]: …` definition (dangling), or a definition no marker uses (orphan). **Opt-in by design:** pages with no Terms section are skipped, so the not-yet-converted patterns stay clean and recall grows as pages convert. Code spans and HTML comments are scrubbed; inline links `[x](…)`, reference labels `[x][y]`, footnotes `[^x]`, and definition lines are not markers. |
| **P-atomic-audit** *(advisory)* | An all-or-nothing claim (*"together or not at all"*, *"commits atomically"*) whose **same sentence** names an audit write, where the enclosing block does not acknowledge that an appended event cannot be withdrawn. The first check that polices a **use** of a constituent capability rather than a claim about one ([`pressure-testing.md`](../../pressure-testing.md) §Capability provenance, widened 2026-08-27). **The phrase alone is not the signal** — most uses of it are benign, over constituent-store writes only. Suppressed by any acknowledgement marker nearby, so a pattern that has already restated the claim honestly is silent; the exemplar is Chain of Custody Invariant 4. |
| **Q-rebuild-bound** *(advisory)* | A `*Rebuild procedure:*` clause that reads an event **payload** with no stated bound on its own totality in the enclosing block. The substrate's purge cascade destroys Event Log's `data` in its entirety at the retention horizon, so an unbounded rebuild claims something that stops being true on a schedule the composition does not control. Exemplar: Audit Trail's *"Bound on the rebuild's totality, stated rather than assumed"*. Carries a recorded recall gap (see the docblock in [`lint.py`](lint.py)) — the honest test is *does it read a field the cascade destroys*, which needs the surviving-field set subtracted, and until a check can do that subtraction this one stays tight. |

## Design principles (this tool is meant to be maintained by a small/cheap model)

- **Standard library only.** Legibility and zero-friction execution beat cleverness.
- **High precision over high recall.** A false positive costs trust faster than a
  missed finding costs coverage. Each check fires only on a tight, well-understood
  pattern. Grow recall by *adding* checks, never by loosening an existing one.
- **One finding per line, greppable.** Machine- and human-readable.

## Adding a check

Every time the adversarial review (human or Opus) catches a *mechanical* class of
drift, ask: can this become a check here? If yes, add a `check_*` function that
returns `list[Finding]`, wire it into `main`, and give it a new code letter. That
is how the boundary between "needs judgment" and "runs deterministically" moves
down over time. **Advisory codes.** A check landed against an existing corpus starts non-gating: it prints, it is tagged *(advisory)*, and it does not fail the build. Turning the continuous-integration gate red before the findings a check names have been worked is how a check gets muted rather than fixed. `ADVISORY_CODES` in [`lint.py`](lint.py) holds the set; a code leaves it when its findings reach zero, which is the moment the check starts *defending* the property instead of *measuring* it. `P-atomic-audit` and `Q-rebuild-bound` landed 2026-08-27 with a baseline of 3 and 8 patterns; their propagation is [`roadmap.md`](../../roadmap.md) methodology debt #19 step (iii).

**Fixture tests.** [`test_checks.py`](test_checks.py) pins P and Q from both sides — the exemplar that must stay **silent**, and the routed instances that must keep **firing**. Both checks were built by sweeping the corpus, and a check built that way can be loosened until its output matches the answer its author already had; the negative case is what makes that visible. Run `python3 tools/linter/test_checks.py`. (This is the same discipline [`isolate.mjs`](../harness/isolate.mjs) applies to the formal models: an invariant with no dedicated rejecting twin is asserted, not verified.)

Candidate next checks: rejection-reason mapping consistency
(a composition's claimed constituent rejections exist in the constituent's action
signatures); anchor resolution on `#section` links; orphaned `*(forthcoming)*`
markers naming a pattern that now exists under a different filename.
