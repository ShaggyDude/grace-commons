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
hook or CI gate.

## Checks

| Code | What it catches |
|---|---|
| **A-dangling-link** | A relative `.md` link whose target file does not exist. |
| **B-invariant-count** | "all *N* invariants from [Pattern](path)" where *N* does not equal the real count of `**Invariant N —**` headers in Pattern. (The nine-vs-ten drift hazard.) |
| **C-model-missing / C-twin-missing** | A pattern whose Status claims a verified model (mentions `tools/harness` or a buggy twin) names a `.tla`/`.als` file that is absent, or has no `-buggy` twin beside it (the vacuity guard). |
| **D-stale-forthcoming** | A link whose own `*(forthcoming)*` marker decorates a pattern file that is already `grounded`. |
| **E-count-drift** | The latest "*NN* grounded patterns (*NN* grounded compositions)" claim in `roadmap.md` / `readme.md` does not match the real file count. (Earlier dated claims are history and are allowed to be stale.) |

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
down over time. Candidate next checks: rejection-reason mapping consistency
(a composition's claimed constituent rejections exist in the constituent's action
signatures); anchor resolution on `#section` links; orphaned `*(forthcoming)*`
markers naming a pattern that now exists under a different filename.
