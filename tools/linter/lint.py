#!/usr/bin/env python3
"""
Grace Commons spec-corpus linter — the mechanical cross-reference checker.

The spec layer has no compiler. This is a partial one: a dependency-free static
pass over the atoms/ and compositions/ markdown that catches the classes of drift
the three-pass review otherwise has to catch by eye —

  A. Dangling links        — every relative .md/.tla/.als/.cfg link resolves to
                              a real file (a renamed model leaving a spec→.tla
                              link dangling is the class this caught).
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
  L. Bare C-number          — no bare composition C-number (C1–C19) survives in an
                              atom/composition live body; the name carries the
                              meaning, the C-number is a registry key (debt #14).
                              Example `credential Cn` IDs are scrubbed; root policy
                              docs that cite `Cn` as an example are out of scope.
  M. Internal sigils        — no coined finding-ID sigil (FCn, FC-Fn, MC-Cn-N,
                              Rn-Fn, Cn-N, OG-n) survives in an atom/composition
                              live body (debt #15, naming.md Rule zero). High
                              precision: these shapes have no legitimate collision.
  O. Term registry resolver — on any page carrying an annotation.md `## Terms`
                              registry, every `[Term]` shortcut-reference marker
                              resolves to a `[Term]: …` definition (no dangling)
                              and every definition is used (no orphan). OPT-IN:
                              pages with no Terms section are skipped, so the
                              not-yet-converted patterns stay at 0 and recall
                              grows as pages convert. The safety net for the
                              annotation.md bulk rollout. (Whitelist gloss is N.)

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
# markdown links to a relative path ending in .md/.tla/.als/.cfg (opt. #anchor).
# Model extensions are included so a renamed .tla/.als leaving a spec→model link
# dangling is caught — the original .md-only form missed it (debt #14 lint gap).
MD_LINK = re.compile(r"\[[^\]]+\]\((\.{1,2}/[^)]+?\.(?:md|tla|als|cfg))(#[^)]*)?\)")
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
# Ordinary-English "concern" — a deployment-level matter/responsibility, not the
# banned unit-of-separation working noun. Permitted; stripped before the scan.
ORDINARY_CONCERN = re.compile(r"(?i)\bdeployment\s+concern\w*")
BANNED_TOKEN_EXCLUDED_DIRS = {".git", ".github", "node_modules", "Alloy.app",
                              "demos", "grants", "internal", "working-ideas"}

# Lineage notes are dated historical narration (like roadmap.md, already exempt);
# the vocabulary rules J/K govern the live spec body, not the record of past rounds.
# A pattern's Lineage is its last section, so scanning stops at its heading —
# whether that heading is markdown (`## Lineage…`) or, when the section is folded
# into a <details> for readability, an HTML `<h2>…Lineage…</h2>`. Both forms are
# anchored to the line start, so an in-body prose mention ("see Lineage notes §…")
# never matches and the live body above Lineage is still fully scanned.
LINEAGE_HEADING = re.compile(r"^(?:##\s+|\s*<h2\b[^>]*>\s*)Lineage\b", re.IGNORECASE)


def check_banned_token(root: Path) -> list[Finding]:
    """J: the working noun "concern" is banned corpus-wide (vocabulary directive
    2026-06-11). The unit of separation is the concept; pre-triage items are
    candidate concepts. Exceptions: the exact title-case proper noun
    "Separation of Concerns" — the ancestor principle's name (mention of the
    ancestor, never working use); and ordinary-English "deployment concern(s)"
    (a deployment-level matter/responsibility, not the unit of separation)."""
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
            if LINEAGE_HEADING.match(line):
                break  # live body only — Lineage is dated history
            scrubbed = CODE_SPAN.sub("", line).replace(ANCESTOR_PROPER_NOUN, "")
            scrubbed = ORDINARY_CONCERN.sub("", scrubbed)
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
# Standards proper-nouns / org names containing "application" are fixed terms of
# art — mention, not working use — like the API gloss; scrubbed before matching.
STANDARDS_PROPER_NOUNS = re.compile(
    r"(?i)Open Worldwide Application Security Project"
    r"|Application Security Verification Standard"
    r"|System and Application Access Control"
    r"|software applications?")
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
            if LINEAGE_HEADING.match(line):
                break  # live body only — Lineage is dated history
            scrubbed = STANDARDS_PROPER_NOUNS.sub(
                "", CODE_SPAN.sub("", line).replace(API_GLOSS, ""))
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
# Internal-identifier guards (L, M) — lock in the C-number / coinage cleanup
# --------------------------------------------------------------------------- #

# Bare composition C-number, C1–C19 (the registry sigil retired from spec bodies,
# debt #14). The token must stand alone: "C12345" and the "C9" inside "IC9" do not
# match. Example *credential* IDs ("credential C2") are scrubbed before matching.
BARE_CNUMBER = re.compile(r"\bC(?:1[0-9]|[1-9])\b")
CREDENTIAL_ID = re.compile(r"(?i)\bcredential\s+C\d+\b")

# The methodology's own coined finding-ID sigils (debt #15) — no legitimate
# collision in a spec body, so a high-precision regression guard. Bare `S-n` is
# deliberately omitted (collides with the SEC "S-1" form); the others are unique.
INTERNAL_SIGILS = [
    (re.compile(r"\bMC-C\d+-\d+\b"), "MC-Cn-N coverage-finding ID"),
    (re.compile(r"\bFC-F\d+\b"),     "FC-Fn (Final Critique finding) ID"),
    (re.compile(r"\bFC-?\d+\b"),     "FCn (Final Critique n) sigil"),
    (re.compile(r"\bR\d+-F\d+\b"),   "Rn-Fn (round / finding) ID"),
    (re.compile(r"\bC\d+-\d+\b"),    "Cn-N finding ID"),
    (re.compile(r"\bOG-\d+\b"),      "OG-n finding ID"),
]


def check_internal_ids(patterns: dict[Path, Pattern]) -> list[Finding]:
    """L + M. No bare composition C-number and no coined finding-ID sigil survives
    in an atom/composition live body — locking in debts #14 and #15 so the cleared
    cruft cannot quietly regrow during a prose pass. Code spans are scrubbed (a
    backticked token is mention, not use); Lineage is skipped (dated history, same
    convention as checks J/K); example `credential Cn` IDs are scrubbed before the
    bare-C-number match. Scoped to atoms/ + compositions/: root policy docs cite
    `Cn` and acronyms as deliberate teaching examples."""
    findings: list[Finding] = []
    for p in patterns.values():
        for i, raw in enumerate(p.text.splitlines(), start=1):
            if LINEAGE_HEADING.match(raw):
                break  # live body only — Lineage is dated history
            scrubbed = CODE_SPAN.sub("", raw)
            # M — coined sigils
            cn_line = scrubbed
            for rx, label in INTERNAL_SIGILS:
                for m in rx.finditer(scrubbed):
                    findings.append(Finding(
                        p.path, i, "M-internal-sigil",
                        f'coined finding-ID "{m.group(0)}" ({label}) — spell the '
                        f"concept out or describe it (naming.md Rule zero)",
                    ))
                cn_line = rx.sub("", cn_line)  # don't double-report its C-prefix
            # L — bare composition C-number (example credential IDs scrubbed)
            cn_line = CREDENTIAL_ID.sub("", cn_line)
            for m in BARE_CNUMBER.finditer(cn_line):
                findings.append(Finding(
                    p.path, i, "L-bare-cnumber",
                    f'bare composition C-number "{m.group(0)}" — use the '
                    f"composition's name (the C-number is a registry key, not prose)",
                ))
    return findings


# --------------------------------------------------------------------------- #
# Common-acronym whitelist (N) — the redundant-gloss guard
# --------------------------------------------------------------------------- #

# spec-format's acronym rule (§Cross-cutting authoring conventions) exempts a
# short, dictionary-headword whitelist (SMS, GPS, URL, HTML, US/USA, ID, PDF,
# FAQ) from the spell-out requirement. *Glossing* a whitelisted acronym anyway —
# "SMS (Short Message Service …)" — is the redundant noise the whitelist exists
# to remove, so it is a finding. High precision: each pattern is a whitelisted
# acronym immediately followed by a parenthetical carrying its canonical
# expansion, so an ordinary aside ("US (and the EU)") never matches. US/USA and
# ID are whitelisted but deliberately NOT auto-detected — their expansions are
# common-enough words to risk a false positive, and the linter's bar is
# precision over recall. Code spans scrubbed; Lineage skipped (dated history),
# same convention as J/K/L/M.
WHITELIST_GLOSS = [
    (re.compile(r"\bSMS\b\s*\([^)]*Short Message Service", re.I), "SMS"),
    (re.compile(r"\bGPS\b\s*\([^)]*Global Positioning System", re.I), "GPS"),
    (re.compile(r"\bURL\b\s*\([^)]*Uniform Resource Locator", re.I), "URL"),
    (re.compile(r"\bHTML\b\s*\([^)]*HyperText Markup Language", re.I), "HTML"),
    (re.compile(r"\bPDF\b\s*\([^)]*Portable Document Format", re.I), "PDF"),
    (re.compile(r"\bFAQ\b\s*\([^)]*Frequently Asked Questions?", re.I), "FAQ"),
]


def check_whitelist_gloss(patterns: dict[Path, Pattern]) -> list[Finding]:
    """N. A whitelisted common acronym carries a redundant spelled-out gloss.

    spec-format whitelists a few dictionary-headword acronyms from the spell-out
    rule; glossing one anyway is noise the whitelist exists to remove. Scoped to
    atoms/ + compositions/; code spans scrubbed; Lineage skipped (dated history).
    """
    findings: list[Finding] = []
    for p in patterns.values():
        for i, raw in enumerate(p.text.splitlines(), start=1):
            if LINEAGE_HEADING.match(raw):
                break  # live body only — Lineage is dated history
            scrubbed = CODE_SPAN.sub("", raw)
            for rx, acr in WHITELIST_GLOSS:
                if rx.search(scrubbed):
                    findings.append(Finding(
                        p.path, i, "N-whitelist-gloss",
                        f"{acr} is a whitelisted common acronym (spec-format "
                        f"§Cross-cutting authoring conventions) — drop the "
                        f"spelled-out gloss; the acronym stands alone",
                    ))
    return findings


# --------------------------------------------------------------------------- #
# Term registry resolver (O) — the annotation.md [Term] safety net
# --------------------------------------------------------------------------- #
#
# OPT-IN BY DESIGN. The check fires only on a page that carries a `## Terms`
# section (the annotation.md registry). The ~49 not-yet-converted patterns have no
# such section, so they are skipped entirely and stay at 0 findings — recall grows
# as pages convert, never by loosening. For a converted page it resolves every
# `[Term]` shortcut-reference marker in the live body against the page's own
# shortcut-reference definition set, flagging two drift classes:
#   O-term-dangling  — a `[Term]` marker with no matching `[Term]: …` definition
#                      (the reader's click 404s; the adapter can't project it).
#   O-term-orphan    — a `[Term]: …` definition no marker uses (dead registry entry).
#
# A `[Term]` MARKER is a kramdown SHORTCUT reference: `[Text]` NOT immediately
# followed by `(` (inline link) or `[` (full/collapsed reference). Code spans and
# HTML comments are scrubbed first, so the meta-prose `` `[Term]` `` and the
# commented definition block never count as markers. Definitions are the
# `[Text]: target` lines (the registry itself). Comparison is on the bracket text
# verbatim — anchors/casing are the adapter's job, not this check's.
TERMS_SECTION = re.compile(r"^##\s+Terms\b", re.M)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
# a shortcut-reference definition line: `[Text]: destination`
TERM_DEF = re.compile(r"^\[([^\]]+)\]:\s*\S", re.M)
# a shortcut-reference USE: `[Text]` that is NOT
#   - preceded by `]`   (the label half of a full/collapsed reference `[text][label]`)
#   - a footnote        (`[^id]`)
#   - followed by `(`   (inline link `[text](url)`)
#   - followed by `[`   (full/collapsed reference `[text][label]` / `[text][]`)
#   - followed by `:`   (it is itself a `[text]: …` definition line, handled above)
TERM_USE = re.compile(r"(?<!\])\[(?!\^)([^\]\[]+)\](?![\(\[:])")


def check_term_registry(patterns: dict[Path, Pattern]) -> list[Finding]:
    """O. On any page carrying a `## Terms` registry, every `[Term]` marker resolves
    to a registry definition, and every definition is used. Opt-in: pages without a
    Terms section are skipped, so unconverted patterns stay clean."""
    findings: list[Finding] = []
    for p in patterns.values():
        if not TERMS_SECTION.search(p.text):
            continue  # opt-in: only converted pages carry a Terms registry
        # definitions: the registry's `[Term]: …` lines (anywhere on the page)
        defs = {m.group(1) for m in TERM_DEF.finditer(p.text)}
        # markers: scrub HTML comments (possibly multi-line) and code spans, then
        # collect shortcut refs. Comments are blanked line-count-preserving so the
        # registry's own commented "[Term] marker" prose never counts and line
        # numbers stay accurate.
        no_comments = HTML_COMMENT.sub(
            lambda m: "\n" * m.group(0).count("\n"), p.text)
        used: dict[str, int] = {}
        for i, raw in enumerate(no_comments.splitlines(), start=1):
            line = CODE_SPAN.sub("", raw)
            if TERM_DEF.match(line.strip()):
                continue  # the definition line is not itself a marker use
            for m in TERM_USE.finditer(line):
                used.setdefault(m.group(1), i)
        # O-term-dangling — a marker with no definition
        for name, line in sorted(used.items(), key=lambda kv: kv[1]):
            if name not in defs:
                findings.append(Finding(
                    p.path, line, "O-term-dangling",
                    f"[{name}] marker has no registry definition "
                    f"([{name}]: …) in this page's Terms section",
                ))
        # O-term-orphan — a definition no marker uses
        def_lines = {m.group(1): line_of(p.text, m.start()) for m in TERM_DEF.finditer(p.text)}
        for name in sorted(defs):
            if name not in used:
                findings.append(Finding(
                    p.path, def_lines.get(name, 1), "O-term-orphan",
                    f"registry defines [{name}] but no [{name}] marker uses it "
                    f"(orphan definition)",
                ))
    return findings


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
    findings += check_internal_ids(patterns)
    findings += check_whitelist_gloss(patterns)
    findings += check_term_registry(patterns)

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
