#!/usr/bin/env python3
"""Fixture tests for the linter's capability-provenance *use* checks (P, Q).

Why this file exists. P and Q were built by sweeping the corpus, and a check
built that way has a specific failure mode: it is easy to keep loosening the
trigger until the finding set matches the answer you already had in mind. That
is not verification, it is curve-fitting — and it costs the thing the linter
trades on, which is that a firing is worth reading.

So each check is pinned from both sides:

  * a NEGATIVE — the pattern that already does the right thing. If the check
    fires there, the check is wrong, because that pattern is the exemplar its
    own message points authors at. Chain of Custody Invariant 4 states the
    safety-plus-liveness split for P; Audit Trail states the rebuild's totality
    bound for Q.
  * POSITIVES — the patterns whose findings are routed open in their Lineage
    entries. If the check stops firing there, it has been loosened into
    uselessness or the finding was closed without updating this file. Either
    way someone should look.

This is the same discipline `tools/harness/isolate.mjs` applies to the formal
models: an invariant with no dedicated rejecting twin is not verified, it is
asserted. A check with no known-silent case is not precise, it is untested.

Run:  python3 tools/linter/test_checks.py [repo_root]
Exit: 0 all pinned expectations hold, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lint import (  # noqa: E402
    Pattern,
    check_atomicity_over_audit,
    check_rebuild_bound,
    load_patterns,
)

# ── The motivating case, pinned SYNTHETICALLY ─────────────────────────────── #
# This started as a pin on two real corpus blocks and had to stop being one, and
# why is the useful part.
#
# P's first draft treated the word "modulo" as an acknowledgement marker.
# Resolve a Person's Data Rights carried a modulo-clause about a DIFFERENT
# boundary — its irreversible purge precursor — and that clause suppressed the
# finding on its Invariant 1, the claim the corpus survey had routed the day
# before. Capability-Backed Sharing lost a finding the same way. The check went
# silent on the two cases that motivated it, and a file-level pin would not have
# shown it: both patterns still fired at other sites, so the run looked healthy.
# A hedge word like "modulo" clusters around a pattern's most careful claims,
# because those are the ones an author qualifies — so a hedge-word suppressor is
# not randomly lossy, it is biased toward silencing the findings that matter
# most. Both sites it dropped were their pattern's declared formal-model subject.
#
# Both are now FIXED — restated 2026-08-27 — and that is the problem with pinning
# a regression to corpus text: the pin dies the moment the finding is repaired,
# which is the moment you most want the guard still standing. A perishable pin
# also creates a bad incentive, since the cheapest way to make it pass is to
# delete it. So the regression is pinned to a SYNTHETIC block instead, which
# encodes the bug rather than a victim of it and outlives every fix.
FIXTURE_MODULO_DECOY = """
## Composition-level invariants

- **Invariant 1 — Binding.** The record and its sealed Audit Trail event commit
  together or not at all. This holds *modulo* the inherited irreversible-purge
  contract, which governs a different boundary entirely.
"""
# The negative half: a block that does the real acknowledgement must stay silent.
FIXTURE_ACKNOWLEDGED = """
## Composition-level invariants

- **Invariant 1 — Binding.** The record and its sealed Audit Trail event commit
  together or not at all — except that they do not: an appended event cannot be
  withdrawn, so the honest claim therefore splits into safety and liveness.
"""


def check_synthetic(problems: list[str]) -> None:
    """The check must fire on a hedge-word decoy and stay silent on a real
    acknowledgement. Neither case depends on any corpus file."""
    for name, text, want_fire in (
        ("FIXTURE_MODULO_DECOY", FIXTURE_MODULO_DECOY, True),
        ("FIXTURE_ACKNOWLEDGED", FIXTURE_ACKNOWLEDGED, False),
    ):
        pat = Pattern(path=Path(f"synthetic/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        fired = bool(check_atomicity_over_audit({pat.path: pat}))
        if fired != want_fire:
            problems.append(
                f"P-atomic-audit: {name} expected "
                f"{'a firing' if want_fire else 'silence'} and got the opposite. "
                + ("A suppressor has gone generic — check what the block is being "
                   "credited with acknowledging; a hedge word is not an "
                   "acknowledgement." if want_fire else
                   "The check no longer recognizes a genuine safety-plus-liveness "
                   "restatement, so it now fires on patterns that did the right "
                   "thing.")
            )


# ── Corpus pins ───────────────────────────────────────────────────────────── #
# Pinned by SITE, not by file, and this distinction is the whole reason the
# entry exists. P's first draft treated the word "modulo" as an acknowledgement
# marker. Resolve a Person's Data Rights carries a modulo-clause about a
# DIFFERENT boundary — its irreversible purge precursor — and that clause then
# suppressed the finding on Invariant 1, which is the claim the corpus survey
# had routed the day before. The check went silent on the case that motivated
# it, and a file-level pin would not have shown it: the pattern still fired at
# three other sites, so the run looked healthy.
#
# Pinning a substring of the enclosing block survives renumbering, which line
# numbers do not.
# BOTH sites the regression silenced are pinned, and which two they are is the
# point. A hedge word like "modulo" clusters around a pattern's most careful
# claims, because those are the ones an author qualifies — so a hedge-word
# suppressor is not randomly lossy, it is biased toward silencing the findings
# that matter most. The two it dropped here are each their pattern's declared
# formal-model subject.
# Empty by design, and it should stay empty: both motivating sites are repaired.
# The regression they exposed is guarded by check_synthetic() above, which no
# fix can retire.
P_MOTIVATING_SITES: list[tuple[str, str]] = []
# CLOSED 2026-08-27 — Resolve a Person's Data Rights. Its Invariant 1 was the
# other motivating site, and it is now restated in safety-plus-liveness form, so
# the check is correctly silent there and the pin is retired rather than
# weakened. Retiring a pin is the only legitimate reason a positive disappears,
# and it belongs in the same change as the fix: a pin removed without the
# corresponding restatement is how a baseline quietly rots.
P_RETIRED_SITES = [
    ("resolve-a-persons-data-rights", "Invariant 1 — Request", "restated 2026-08-27"),
    ("capability-backed-sharing", "Invariant 2 — Disclosure-accountability",
     "protocol repair 2026-08-27 — the append moved out of the host transaction"),
    ("propagate-consent-revocation-downstream", "Invariant 3 — Revocation propagation",
     "restated 2026-08-27 — class closed; P promoted to gating"),
]

# ── P-atomic-audit ─────────────────────────────────────────────────────────── #
# Silent: the exemplar. Chain of Custody's Invariant 4 splits the claim into
# safety ("no *unsurfaced* orphan") and liveness (detection plus compensation),
# having first said that synchronous rollback is unavailable and the orphan
# state is therefore reachable. Nothing to flag.
P_SILENT = {"chain-of-custody"}
# Firing: the three routed instances (roadmap.md debt #19, pre-campaign survey).
# Resolve a Person's Data Rights was here until 2026-08-27; its four sites closed
# when Invariant 1 was restated (debt #19 step (iii), atomicity class). It must
# now stay OUT of this set — the `exact` comparison below turns that into a real
# assertion rather than a deletion, so a regression that reopened it would be
# reported as an unpinned firing.
# EMPTY, AND THAT IS THE ASSERTION. All three instances of the class closed on
# 2026-08-27 — Resolve a Person's Data Rights and Propagate Consent Revocation
# Downstream by restatement, Capability-Backed Sharing by protocol repair — and P
# now fires zero times corpus-wide, which is why it was promoted from advisory to
# gating in lint.py.
#
# The `exact` comparison below is what makes an empty set do work: ANY firing is
# now reported as an unpinned pattern, so a newly introduced instance fails this
# test rather than quietly joining a backlog. An empty pin set is not an absence
# of coverage here; the coverage moved to check_synthetic(), which does not depend
# on the corpus containing a broken pattern and therefore survives the class being
# clean — which is the state a closed class is supposed to reach.
P_FIRING: set[str] = set()

# ── Q-rebuild-bound ───────────────────────────────────────────────────────── #
# Silent: the exemplar. Audit Trail carries "Bound on the rebuild's totality,
# stated rather than assumed" and then states the bound and why it suffices —
# which is the right thing to do in the pattern that performs the destruction.
Q_SILENT = {"audit-trail"}
# Firing: at least these. Not an exhaustive census — the check has a recorded
# recall gap (see the docblock in lint.py), so this set is a floor.
Q_FIRING_AT_LEAST = {
    "customer-onboarding",
    "execute-gated-workflow",
    "multi-party-approval",
    "propagate-consent-revocation-downstream",
}


def stems(findings) -> set[str]:
    return {f.path.stem for f in findings}


def _block_at(text: str, line: int) -> str:
    """The blank-line-delimited block containing a 1-indexed line."""
    lines = text.split("\n")
    i = max(0, line - 1)
    start = i
    while start > 0 and lines[start - 1].strip():
        start -= 1
    end = i
    while end + 1 < len(lines) and lines[end + 1].strip():
        end += 1
    return "\n".join(lines[start:end + 1])


def check_motivating_sites(patterns, findings) -> list[str]:
    """P must fire on the specific blocks that motivated the check, not merely
    somewhere in those files."""
    problems: list[str] = []
    for stem, marker in P_MOTIVATING_SITES:
        pat = next((p for p in patterns.values() if p.path.stem == stem), None)
        hit = pat is not None and any(
            f.path.stem == stem and marker in _block_at(pat.text, f.line)
            for f in findings
        )
        if not hit:
            problems.append(
                f"P-atomic-audit: does not fire on the {stem} block containing "
                f"{marker!r} — one of the two cases the check was built for, and "
                f"that pattern's own formal-model subject. A suppressor has gone "
                f"generic again; check what the block is being credited with "
                f"acknowledging."
            )
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path(__file__).resolve().parents[2]
    patterns = load_patterns(root)

    failures: list[str] = []
    for code, fn, silent, firing, exact in (
        ("P-atomic-audit", check_atomicity_over_audit, P_SILENT, P_FIRING, True),
        ("Q-rebuild-bound", check_rebuild_bound, Q_SILENT, Q_FIRING_AT_LEAST, False),
    ):
        got = stems(fn(patterns))
        for s in sorted(silent):
            if s in got:
                failures.append(
                    f"{code}: fired on {s}, which is the exemplar this check's own "
                    f"message points authors at — the check has lost precision"
                )
        missing = sorted(firing - got)
        if missing:
            failures.append(
                f"{code}: did not fire on {', '.join(missing)} — either the check "
                f"was loosened past usefulness, or the finding closed and this "
                f"file was not updated"
            )
        if exact:
            extra = sorted(got - firing)
            if extra:
                failures.append(
                    f"{code}: fired on unpinned pattern(s) {', '.join(extra)} — "
                    f"a genuinely new instance (route it, then pin it here) or a "
                    f"false positive (tighten the check)"
                )
        print(f"{code}: {len(got)} pattern(s) firing — {', '.join(sorted(got)) or 'none'}")
        if code == "P-atomic-audit":
            problems = check_motivating_sites(patterns, fn(patterns))
            check_synthetic(problems)
            failures.extend(problems)
            if not problems:
                print(f"{code}: synthetic regression fixtures hold "
                      f"(hedge-word decoy fires, real acknowledgement silent) ✓")
            if not problems:
                for stem, marker in P_MOTIVATING_SITES:
                    print(f"{code}: motivating site pinned — {stem} / {marker!r} ✓")

    for f in failures:
        print(f"FAIL  {f}", file=sys.stderr)
    print(
        f"\n— {'all pinned expectations hold' if not failures else str(len(failures)) + ' pinned expectation(s) broken'}",
        file=sys.stderr,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
