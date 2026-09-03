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
    check_atomicity_over_audit,
    check_rebuild_bound,
    load_patterns,
)

# ── The motivating case ───────────────────────────────────────────────────── #
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
P_MOTIVATING_SITE = (
    "resolve-a-persons-data-rights",
    "Invariant 1 — Request",
)

# ── P-atomic-audit ─────────────────────────────────────────────────────────── #
# Silent: the exemplar. Chain of Custody's Invariant 4 splits the claim into
# safety ("no *unsurfaced* orphan") and liveness (detection plus compensation),
# having first said that synchronous rollback is unavailable and the orphan
# state is therefore reachable. Nothing to flag.
P_SILENT = {"chain-of-custody"}
# Firing: the three routed instances (roadmap.md debt #19, pre-campaign survey).
P_FIRING = {
    "capability-backed-sharing",
    "propagate-consent-revocation-downstream",
    "resolve-a-persons-data-rights",
}

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


def check_motivating_site(patterns, findings) -> str | None:
    """P must fire on the specific block that motivated the check, not merely
    somewhere in that file."""
    stem, marker = P_MOTIVATING_SITE
    for f in findings:
        if f.path.stem != stem:
            continue
        pat = next(p for p in patterns.values() if p.path.stem == stem)
        if marker in _block_at(pat.text, f.line):
            return None
    return (
        f"P-atomic-audit: fires somewhere in {stem} but NOT on the block "
        f"containing {marker!r} — the case the check was built for. A "
        f"suppressor has gone generic again; check what the block is being "
        f"credited with acknowledging."
    )


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
            problem = check_motivating_site(patterns, fn(patterns))
            if problem:
                failures.append(problem)
            else:
                print(f"{code}: motivating site pinned — "
                      f"{P_MOTIVATING_SITE[0]} / {P_MOTIVATING_SITE[1]!r} ✓")

    for f in failures:
        print(f"FAIL  {f}", file=sys.stderr)
    print(
        f"\n— {'all pinned expectations hold' if not failures else str(len(failures)) + ' pinned expectation(s) broken'}",
        file=sys.stderr,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
