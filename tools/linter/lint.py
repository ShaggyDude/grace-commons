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
                              roadmap.md and readme.md match the real file counts.
  F. Rests-on refs          — a "<Pattern> Invariant N" cross-reference (as used in
                              invariant *Rests on:* clauses) resolves: N <= the cited
                              pattern's real invariant count. The tractable mechanical
                              slice of the capability-provenance rule (pressure-testing.md
                              §Capability provenance); the broader "is this capability
                              actually declared by that constituent" check stays
                              fresh-reader Pass-2 work (paraphrased names defeat a regex).
  G. Status grammar         — every pattern has a `## Status` section whose first
                              line starts with exactly one backticked status token
                              conforming to the pinned grammar (pressure-testing.md
                              §Status line format, pinned 2026-06-11).
  H. Status mirror          — a roadmap.md list entry that links a pattern and carries
                              a backticked status token mirrors the pattern file's own
                              token exactly (the pattern file is the source of truth).
  I. Duplicate table rows   — no roadmap.md table names the same pattern twice
                              (the duplicated-Login-row class).
  J. Banned working noun    — "concern" (any case, any inflection) is banned
                              corpus-wide as working vocabulary (vocabulary
                              directive 2026-06-11: the unit of separation is the
                              *concept*; pre-triage items in the guided tool are
                              *candidate concepts*). The single permitted form is
                              the title-case proper noun "Separation of Concerns"
                              naming the ancestor principle (inheritance map,
                              glossary tombstone) — mention of the ancestor,
                              never working use. Scans the whole corpus, not just
                              the pattern dirs.
  K. Output-level noun      — "application(s)" is output-level vocabulary (a
                              deployed build output) and is banned in the
                              canonical layer: atoms/, compositions/, the core
                              docs, and tools/guide. The canonical layer has
                              exactly two artifact kinds — atomic concepts and
                              compositions thereof. Not scanned: execution-
                              contract.md (the output level is its domain),
                              roadmap.md (dated history), glossary.md (the
                              definition site). Inline code spans and the API
                              acronym's canonical expansion are scrubbed first
                              (naming an external project's literal
                              `applications/` directory, or glossing API, is
                              mention, not use).

Design notes (this tool is meant to be maintained by a small/cheap model):
  - Standard library only. No deps. Runs anywhere `python3` does.
  - High precision over high recall: a false positive costs trust, so each check
    fires only on a tight, well-understood pattern. Recall grows by adding
    checks, not by loosening existing ones.
  - One finding per line, machine-greppable. Exit 1 if any finding, 0 if clean.

Usage:  python3 tools/linter/lint.py [repo_root]
"""

from __future__ import annotations

import os
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
    for fname in ("roadmap.md", "readme.md"):
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
    (pressure-testing.md §Capability provenance): it catches a cross-reference to an
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
# Status grammar / mirror (G, H, I)
# --------------------------------------------------------------------------- #

# the pinned status-token grammar (pressure-testing.md §Status line format)
STATUS_TOKEN_FORMS = [
    re.compile(r"^draft$"),
    re.compile(r"^unresolved$"),
    re.compile(r"^partially resolved$"),
    re.compile(r"^grounded on Final Critique \d+ — \d{4}-\d{2}-\d{2}$"),
    re.compile(r"^grounded — \d{4}-\d{2}-\d{2}$"),  # legacy (grandfathered, no FC number)
    re.compile(r"^grounded \(English\) on Final Critique \d+ — \d{4}-\d{2}-\d{2} — formal layer pending$"),
    re.compile(r"^grounded on Final Critique \d+ — \d{4}-\d{2}-\d{2} — .+ pending$"),
]
STATUS_SECTION = re.compile(r"^## Status\s*$", re.M)
LEADING_TOKEN = re.compile(r"^`([^`]+)`")


def status_token_of(text: str) -> tuple[str | None, int]:
    """Return (token, line) of the first non-empty line after `## Status`,
    or (None, line-of-section / 0) when the section or token is absent."""
    m = STATUS_SECTION.search(text)
    if not m:
        return None, 0
    rest = text[m.end():]
    offset = m.end()
    for raw in rest.split("\n"):
        if raw.strip():
            tok = LEADING_TOKEN.match(raw.strip())
            return (tok.group(1) if tok else None), line_of(text, offset)
        offset += len(raw) + 1
    return None, line_of(text, m.start())


def check_status_grammar(patterns: dict[Path, Pattern]) -> list[Finding]:
    """G. `## Status` present; first line starts with one conformant backticked token."""
    findings: list[Finding] = []
    for p in patterns.values():
        m = STATUS_SECTION.search(p.text)
        if not m:
            findings.append(Finding(
                p.path, 1, "G-status-section-missing",
                "no `## Status` section (required container; a top-of-file "
                "**Status:** line is a shape deviation)",
            ))
            continue
        token, line = status_token_of(p.text)
        if token is None:
            findings.append(Finding(
                p.path, line, "G-status-grammar",
                "Status line does not start with a backticked status token",
            ))
            continue
        if not any(rx.match(token) for rx in STATUS_TOKEN_FORMS):
            findings.append(Finding(
                p.path, line, "G-status-grammar",
                f"token `{token}` matches no form of the pinned grammar "
                f"(pressure-testing.md §Status line format)",
            ))
    return findings


# a roadmap list entry that links a pattern AND carries a token after the em-dash:
#   - **[Name](./compositions/x.md)** — `token` ...
ROADMAP_LIST_ENTRY = re.compile(
    r"^- \*\*\[[^\]]+\]\((\./(?:atoms|compositions)/[^)]+?\.md)\)\*\* — `([^`]+)`",
    re.M,
)


def check_status_mirror(root: Path, patterns: dict[Path, Pattern]) -> list[Finding]:
    """H. roadmap.md linked list entries mirror the pattern file's status token.

    High precision: fires only on list entries that both link a pattern file and
    carry a backticked token immediately after the em-dash. Unlinked table rows
    are not checked (no machine-resolvable file mapping); the table is covered by
    the duplicate-row check (I) and by review.
    """
    findings: list[Finding] = []
    roadmap = root / "roadmap.md"
    if not roadmap.exists():
        return findings
    text = roadmap.read_text(encoding="utf-8")
    by_resolved = {p.path.resolve(): p for p in patterns.values()}
    for m in ROADMAP_LIST_ENTRY.finditer(text):
        rel, cell_token = m.group(1), m.group(2)
        tgt = by_resolved.get((root / rel).resolve())
        if tgt is None:
            continue  # dangling link is check A's finding
        file_token, _ = status_token_of(tgt.text)
        if file_token is None:
            continue  # grammar violation is check G's finding
        if cell_token != file_token:
            findings.append(Finding(
                roadmap, line_of(text, m.start()), "H-status-mirror",
                f"{Path(rel).name}: roadmap says `{cell_token}` but the pattern's "
                f"Status line says `{file_token}` (pattern file is the source of truth)",
            ))
    return findings


def check_duplicate_rows(root: Path) -> list[Finding]:
    """I. No roadmap.md *status* table names the same pattern twice.

    High precision: only tables whose header row contains a 'Status' column are
    inspected (the duplicated-Login-row class lives there); the name column is
    the cell to the left of nothing in particular — column 2 by the status
    table's shape. Inventory tables whose second column legitimately repeats
    (Type, tool names) are not status tables and are skipped.
    """
    findings: list[Finding] = []
    roadmap = root / "roadmap.md"
    if not roadmap.exists():
        return findings
    text = roadmap.read_text(encoding="utf-8")
    seen: dict[str, int] = {}
    in_table = False
    is_status_table = False
    for i, raw in enumerate(text.split("\n"), start=1):
        line = raw.strip()
        if line.startswith("|") and line.endswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if not in_table:
                in_table = True
                seen = {}
                is_status_table = any(c.lower() == "status" for c in cells)
                continue  # header row
            if not is_status_table or len(cells) < 3:
                continue
            if set(cells[1]) <= {"-", " ", ":"}:
                continue  # separator row
            name = cells[1]
            if name in seen:
                findings.append(Finding(
                    roadmap, i, "I-duplicate-row",
                    f"status table names '{name}' twice (also at line {seen[name]})",
                ))
            else:
                seen[name] = i
        else:
            in_table = False
            is_status_table = False
    return findings


BANNED_TOKEN = re.compile(r"(?i)\bconcern\w*")
ANCESTOR_PROPER_NOUN = "Separation of Concerns"
BANNED_TOKEN_EXCLUDED_DIRS = {".git", ".github", "node_modules", "Alloy.app",
                              "demos", "grants", "internal", "working-ideas"}


def check_banned_token(root: Path) -> list[Finding]:
    """J: the working noun "concern" is banned corpus-wide (vocabulary directive
    2026-06-11). The unit of separation is the concept; pre-triage items are
    candidate concepts. Single exception: the exact title-case proper noun
    "Separation of Concerns" — the ancestor principle's name — is permitted
    (mention of the ancestor, never working use)."""
    out: list[Finding] = []
    md_files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # prune in place so excluded trees (Alloy.app, node_modules, …) are
        # never descended into — rglob-then-filter walks them and is far too slow
        dirnames[:] = [d for d in dirnames if d not in BANNED_TOKEN_EXCLUDED_DIRS]
        md_files += [Path(dirpath) / f for f in filenames if f.endswith(".md")]
    for md in sorted(md_files):
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            scrubbed = line.replace(ANCESTOR_PROPER_NOUN, "")
            for m in BANNED_TOKEN.finditer(scrubbed):
                out.append(Finding(
                    md, i, "J-banned-token",
                    f'banned working noun "{m.group(0)}" — the unit of separation '
                    f"is the concept; pre-triage items are candidate concepts "
                    f"(vocabulary directive 2026-06-11)",
                ))
    return out


BANNED_OUTPUT_NOUN = re.compile(r"(?i)\bapplications?\b")
CODE_SPAN = re.compile(r"`[^`]*`")
# The canonical expansion of the API acronym is a fixed term of art — mention,
# not working use — and is scrubbed before matching, like code spans.
API_GLOSS = "Application Programming Interface"
OUTPUT_NOUN_CORE_DOCS = ("readme.md", "the-spec-layer.md", "pressure-testing.md",
                         "spec-format.md", "contributing.md")


def check_banned_application(root: Path) -> list[Finding]:
    """K: "application" names only a deployed build output. The canonical layer
    has exactly two artifact kinds — atomic concepts and compositions thereof —
    so the word is banned there (vocabulary direction 2026-06-11). Excluded by
    design: execution-contract.md (output level is its domain), roadmap.md
    (dated history), glossary.md (the definition site). Code spans scrubbed:
    a backticked external path like `applications/` is mention, not use."""
    scoped: list[Path] = []
    for d in PATTERN_DIRS:
        base = root / d
        if base.is_dir():
            scoped += sorted(base.glob("*.md"))
    scoped += [root / n for n in OUTPUT_NOUN_CORE_DOCS if (root / n).exists()]
    guide = root / "tools" / "guide"
    if guide.is_dir():
        scoped += sorted(guide.rglob("*.md"))
    out: list[Finding] = []
    for md in scoped:
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            scrubbed = CODE_SPAN.sub("", line).replace(API_GLOSS, "")
            for m in BANNED_OUTPUT_NOUN.finditer(scrubbed):
                out.append(Finding(
                    md, i, "K-output-noun",
                    f'"{m.group(0)}" is output-level vocabulary — the canonical '
                    f"layer has two artifact kinds: atomic concepts and "
                    f"compositions thereof (deployed build outputs belong to "
                    f"execution-contract.md)",
                ))
    return out


# --------------------------------------------------------------------------- #
# Driver
# --------------------------------------------------------------------------- #

def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path(__file__).resolve().parents[2]
    patterns = load_patterns(root)
    # link / forthcoming / count checks also scan the top-level canonical docs
    extra_docs = [root / n for n in ("roadmap.md", "readme.md", "CLAUDE.md",
                                     "pressure-testing.md", "contributing.md",
                                     "spec-format.md")]
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
    findings += check_status_grammar(patterns)
    findings += check_status_mirror(root, patterns)
    findings += check_duplicate_rows(root)
    findings += check_banned_token(root)
    findings += check_banned_application(root)

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
