#!/usr/bin/env python3
"""
Grace Commons spec-corpus linter — the mechanical cross-reference checker.

The spec layer has no compiler. This is a partial one: a dependency-free static
pass over the atoms/ and compositions/ markdown that catches the classes of drift
the three-pass review otherwise has to catch by eye —

  A. Dangling links        — every relative .md link resolves to a real file.
  B. Invariant-count refs   — "all N invariants from <Pattern>" matches the
                              actual count of `**Invariant N —**` headers in
                              <Pattern>. (The nine-vs-ten drift hazard.)
  C. Model-present bar      — a Status line that names a `.tla`/`.als` model has
                              that file present AND a `-buggy` twin beside it.
  D. Stale forthcoming      — a `*(forthcoming)*` marker in a list item that also
                              links to a file which is already `grounded`.
  E. Count honesty          — "NN grounded patterns / NN compositions" claims in
                              ROADMAP.md and readme.md match the real file counts.
  F. Rests-on refs          — a "<Pattern> Invariant N" cross-reference (as used in
                              invariant *Rests on:* clauses) resolves: N <= the cited
                              pattern's real invariant count. The tractable mechanical
                              slice of the capability-provenance rule (PRESSURE_TESTING.md
                              §Capability provenance); the broader "is this capability
                              actually declared by that constituent" check stays a
                              fresh-reader Pass-2 concern (paraphrased names defeat a regex).

Design notes (this tool is meant to be maintained by a small/cheap model):
  - Standard library only. No deps. Runs anywhere `python3` does.
  - High precision over high recall: a false positive costs trust, so each check
    fires only on a tight, well-understood pattern. Recall grows by adding
    checks, not by loosening existing ones.
  - One finding per line, machine-greppable. Exit 1 if any finding, 0 if clean.

Usage:  python3 tools/linter/lint.py [repo_root]
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------- #
# Corpus model
# --------------------------------------------------------------------------- #

PATTERN_DIRS = ("atoms", "compositions")
INVARIANT_HEADER = re.compile(r"^\s*-?\s*\*\*Invariant\s+(\d+)\s+[—-]", re.M)
# markdown links to a relative path ending in .md (optionally with #anchor)
MD_LINK = re.compile(r"\[[^\]]+\]\((\.{1,2}/[^)]+?\.md)(#[^)]*)?\)")
# Status line: the first paragraph starting with `grounded` (back-tick optional)
STATUS_GROUNDED = re.compile(r"^`?grounded", re.M)
# model files named in a Status / Lineage line, e.g. `provenance.als`, `kyc.tla`
MODEL_REF = re.compile(r"`([\w\-/]+\.(?:tla|als))`")
# "all ten invariants from [Name](link)" / "[Name](link)'s ten checks" etc.
NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
}
# "<count> invariants from [Name](path)"  — count is a word or digit
INV_COUNT_REF = re.compile(
    r"(?:all\s+)?(\b\w+\b)\s+invariants?\s+(?:from|of)\s+"
    r"\[[^\]]+\]\((\.{1,2}/[^)]+?\.md)(?:#[^)]*)?\)",
    re.I,
)
# the pattern's display name, read from its H1 title (trailing " (Cxx)" stripped)
H1_TITLE = re.compile(r"^#\s+(.+?)\s*$", re.M)
TRAILING_PAREN = re.compile(r"\s*\([^)]*\)\s*$")


@dataclass
class Finding:
    path: Path
    line: int
    code: str
    message: str


@dataclass
class Pattern:
    path: Path
    text: str
    invariant_count: int
    grounded: bool


def load_patterns(root: Path) -> dict[Path, Pattern]:
    out: dict[Path, Pattern] = {}
    for d in PATTERN_DIRS:
        for md in sorted((root / d).rglob("*.md")):
            name = md.name.lower()
            # readme/index are catalogs; TAXONOMY.md is a proposal doc
            # (nav_exclude, "Status: proposal") — none are patterns.
            if name in ("readme.md", "index.md", "taxonomy.md"):
                continue
            text = md.read_text(encoding="utf-8")
            out[md] = Pattern(
                path=md,
                text=text,
                invariant_count=len(INVARIANT_HEADER.findall(text)),
                grounded=bool(STATUS_GROUNDED.search(text)),
            )
    return out


def line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


# --------------------------------------------------------------------------- #
# Checks
# --------------------------------------------------------------------------- #

def check_links(root: Path, md_files: list[Path]) -> list[Finding]:
    """A. Every relative .md link resolves to an existing file."""
    findings: list[Finding] = []
    for md in md_files:
        text = md.read_text(encoding="utf-8")
        for m in MD_LINK.finditer(text):
            target = (md.parent / m.group(1)).resolve()
            if not target.exists():
                findings.append(Finding(
                    md, line_of(text, m.start()), "A-dangling-link",
                    f"link target does not exist: {m.group(1)}",
                ))
    return findings


def check_invariant_counts(patterns: dict[Path, Pattern], md_files: list[Path]) -> list[Finding]:
    """B. 'N invariants from [Pattern](path)' matches Pattern's real count."""
    findings: list[Finding] = []
    by_resolved = {p.path.resolve(): p for p in patterns.values()}
    for md in md_files:
        text = md.read_text(encoding="utf-8")
        for m in INV_COUNT_REF.finditer(text):
            word, rel = m.group(1), m.group(2)
            claimed = NUMBER_WORDS.get(word.lower())
            if claimed is None:
                if word.isdigit():
                    claimed = int(word)
                else:
                    continue  # not a count word ("its invariants from") — skip
            target = (md.parent / rel).resolve()
            tgt = by_resolved.get(target)
            if tgt is None:
                continue  # link resolution handled by check A
            if tgt.invariant_count != claimed:
                findings.append(Finding(
                    md, line_of(text, m.start()), "B-invariant-count",
                    f"claims {claimed} invariants from {Path(rel).name}, "
                    f"but it declares {tgt.invariant_count}",
                ))
    return findings


def check_models_present(patterns: dict[Path, Pattern]) -> list[Finding]:
    """C. A named `.tla`/`.als` model in a grounded pattern exists, with a twin.

    Fires only when the pattern actually CLAIMS a verified model (its Status zone
    mentions the harness or a buggy twin) — so an incidental prose mention of a
    hypothetical `.als` ("don't put Alloy on Personal Todo") is not a finding.
    """
    findings: list[Finding] = []
    for p in patterns.values():
        if not p.grounded:
            continue
        # only inspect the Status section's first ~3000 chars to avoid Lineage
        # back-references to other patterns' models
        status_zone = p.text[:3000]
        claims_model = ("tools/harness" in status_zone) or ("buggy twin" in status_zone)
        if not claims_model:
            continue
        for m in MODEL_REF.finditer(status_zone):
            ref = m.group(1)
            # resolve relative to the pattern file's directory
            model = (p.path.parent / ref).resolve() if "/" in ref else (p.path.parent / ref).resolve()
            if "buggy" in ref:
                continue
            if not model.exists():
                findings.append(Finding(
                    p.path, line_of(p.text, m.start()), "C-model-missing",
                    f"Status names model {ref} but file is absent",
                ))
                continue
            stem = model.stem
            ext = model.suffix
            twins = list(model.parent.glob(f"{stem}-buggy*{ext}"))
            if not twins:
                findings.append(Finding(
                    p.path, line_of(p.text, m.start()), "C-twin-missing",
                    f"model {ref} has no -buggy twin beside it (vacuity guard)",
                ))
    return findings


# a forthcoming marker that DECORATES a link: `](path)` then, within a short
# window, a `(forthcoming...)` marker — meaning the linked pattern itself is
# being called forthcoming. (Not merely the word appearing elsewhere on the line.)
DECORATING_FORTHCOMING = re.compile(
    r"\]\((\.{1,2}/[^)]+?\.md)(?:#[^)]*)?\)[^.\n]{0,40}?\(forthcoming",
    re.I,
)


def check_stale_forthcoming(root: Path, patterns: dict[Path, Pattern], md_files: list[Path]) -> list[Finding]:
    """D. A link whose own '(forthcoming)' marker decorates an already-grounded file.

    High precision: the marker must immediately decorate the link (within ~40
    chars after it), not merely appear somewhere on the line — so prose that
    *retires* forthcoming-links, or lists a grounded pattern beside a different
    forthcoming one, does not false-positive.
    """
    findings: list[Finding] = []
    by_resolved = {p.path.resolve(): p for p in patterns.values()}
    for md in md_files:
        text = md.read_text(encoding="utf-8")
        for m in DECORATING_FORTHCOMING.finditer(text):
            target = (md.parent / m.group(1)).resolve()
            tgt = by_resolved.get(target)
            if tgt and tgt.grounded:
                findings.append(Finding(
                    md, line_of(text, m.start()), "D-stale-forthcoming",
                    f"link marked '(forthcoming)' but {Path(m.group(1)).name} "
                    f"is grounded",
                ))
    return findings


def check_counts(root: Path, patterns: dict[Path, Pattern]) -> list[Finding]:
    """E. 'NN grounded patterns / NN compositions' claims match reality."""
    findings: list[Finding] = []
    atoms = [p for p in patterns.values() if "/atoms/" in p.path.as_posix()]
    comps = [p for p in patterns.values() if "/compositions/" in p.path.as_posix()]
    real_total = len(atoms) + len(comps)
    real_comps = len(comps)

    claim = re.compile(r"\*\*(\d+)\s+grounded\s+patterns\s*\(\s*(\d+)\s+grounded\s+compositions?\)\*\*")
    for fname in ("ROADMAP.md", "readme.md"):
        f = root / fname
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8")
        # Only check the most-recent (last) claim in the file — earlier ones are
        # dated history and are allowed to be stale.
        matches = list(claim.finditer(text))
        if not matches:
            continue
        last = matches[-1]
        tot, cmp = int(last.group(1)), int(last.group(2))
        if tot != real_total or cmp != real_comps:
            findings.append(Finding(
                f, line_of(text, last.start()), "E-count-drift",
                f"latest claim says {tot} patterns / {cmp} compositions; "
                f"corpus has {real_total} patterns / {real_comps} compositions",
            ))
    return findings


def check_rests_on_refs(patterns: dict[Path, Pattern], md_files: list[Path]) -> list[Finding]:
    """F. A '<Pattern> Invariant N' reference resolves: N <= that pattern's count.

    The tractable mechanical slice of the capability-provenance rule
    (PRESSURE_TESTING.md §Capability provenance): it catches a cross-reference to an
    invariant *number* a pattern does not have (the dangling-number class). It
    deliberately does NOT verify that the cited capability is the *right* one —
    paraphrased parenthetical names ("Invariant 4 (cross-store atomicity)" for a
    header named "Cascade-on-purge") are legitimate and would false-positive a name
    match — so the broader "is this capability actually declared by that constituent"
    check stays a Pass-2 fresh-reader concern. High precision: fires only when an
    exact known pattern name is immediately followed by "Invariant(s) <n>".
    """
    by_name: dict[str, int] = {}
    for p in patterns.values():
        m = H1_TITLE.search(p.text)
        if not m or not p.invariant_count:
            continue
        name = TRAILING_PAREN.sub("", m.group(1).strip()).strip()
        if name:
            by_name[name] = p.invariant_count
    refs = [
        (re.compile(r"(?<![A-Za-z])" + re.escape(nm)
                    + r"\s+Invariants?\s+([0-9][0-9,\s]*(?:and\s+[0-9]+)?)"), nm, count)
        for nm, count in by_name.items()
    ]
    findings: list[Finding] = []
    for md in md_files:
        text = md.read_text(encoding="utf-8")
        for rx, nm, count in refs:
            for m in rx.finditer(text):
                for n in (int(x) for x in re.findall(r"\d+", m.group(1))):
                    if n > count:
                        findings.append(Finding(
                            md, line_of(text, m.start()), "F-invariant-ref",
                            f"cites {nm} Invariant {n}, but {nm} declares {count}",
                        ))
    return findings


# --------------------------------------------------------------------------- #
# Driver
# --------------------------------------------------------------------------- #

def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path(__file__).resolve().parents[2]
    patterns = load_patterns(root)
    # link / forthcoming / count checks also scan the top-level canonical docs
    extra_docs = [root / n for n in ("ROADMAP.md", "readme.md", "CLAUDE.md",
                                     "PRESSURE_TESTING.md", "CONTRIBUTING.md",
                                     "SPEC_FORMAT.md")]
    pattern_files = [p.path for p in patterns.values()]
    readme_files = [root / d / "README.md" for d in PATTERN_DIRS] + [root / "compositions" / "README.md"]
    scan = pattern_files + [f for f in extra_docs if f.exists()] + [f for f in readme_files if f.exists()]
    # de-dup
    scan = sorted(set(scan))

    findings: list[Finding] = []
    findings += check_links(root, scan)
    findings += check_invariant_counts(patterns, scan)
    findings += check_models_present(patterns)
    findings += check_stale_forthcoming(root, patterns, scan)
    findings += check_counts(root, patterns)
    findings += check_rests_on_refs(patterns, scan)

    findings.sort(key=lambda f: (f.code, str(f.path), f.line))
    for f in findings:
        rel = f.path.relative_to(root)
        print(f"{rel}:{f.line}: [{f.code}] {f.message}")

    n_atoms = sum(1 for p in patterns.values() if "/atoms/" in p.path.as_posix())
    n_comps = sum(1 for p in patterns.values() if "/compositions/" in p.path.as_posix())
    print(f"\n— scanned {len(patterns)} patterns "
          f"({n_atoms} atoms, {n_comps} compositions); "
          f"{len(findings)} finding(s).", file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
