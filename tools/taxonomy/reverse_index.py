#!/usr/bin/env python3
"""
tools/taxonomy/reverse_index.py — the usage-derived taxonomy generator.

Reads the Intent Graph (atoms + compositions) and derives each atom's **overlay**
classification — regulated / security / standards — from the composition graph,
**attributed per contributing composer** (so a view reads "HIPAA via audit-trail,"
never a bare "regulated: true"). It does NOT derive domain: domain is the one
intrinsic axis, read from each atom's own frontmatter (`domain:`), default absent
and EOS-gated by a human. Structural shape (sequence / state-machine / registry)
is left to the atom's own State/Behavior — no metadata.

This is the tool the flat-storage taxonomy depends on (atoms/TAXONOMY.md): once the
category folders dissolve, the per-category README catalogs and the docs nav become
generated browse-by-overlay views of this index. Read-only over the repo; stdlib
only (mirrors tools/recipe/generate_recipe.py and the dependency-light house style).

Three axes, three mechanisms:
  structural  — derived from the atom's own spec        (deferred; no metadata)
  overlay     — derived from the composition graph      (this tool: regulated/security/standards)
  domain      — intrinsic, read from frontmatter        (default absent, EOS-gated)

Usage:
  python3 tools/taxonomy/reverse_index.py [repo-root]            # human report
  python3 tools/taxonomy/reverse_index.py [repo-root] --json     # machine index (stdout)
"""
import re, sys, json, pathlib
from collections import defaultdict

# ── Standard families: pattern -> normalized code. A composition's standards are
#    the codes whose pattern appears in its `## Standards[ references]` section. ──
STANDARDS = [
    (r"\bHIPAA\b", "HIPAA"), (r"\bSOX\b|Sarbanes-Oxley", "SOX"),
    (r"\bPCI DSS\b|PCI-DSS", "PCI DSS"), (r"21 CFR Part 11", "21 CFR Part 11"),
    (r"SEC Rule 17a-4|17a-4", "SEC 17a-4"), (r"\bFINRA\b", "FINRA"),
    (r"ISO/IEC 27001|ISO 27001", "ISO 27001"), (r"ISO 15489", "ISO 15489"),
    (r"\bGDPR\b", "GDPR"), (r"\beIDAS\b", "eIDAS"), (r"DoD 5015", "DoD 5015"),
    (r"NIST SP 800-53", "NIST 800-53"), (r"NIST SP 800-63", "NIST 800-63"),
    (r"NIST SP 800-92", "NIST 800-92"), (r"NIST SP 800-207", "NIST 800-207"),
    (r"NIST SP 800-57", "NIST 800-57"), (r"Basel III|BCBS 239", "Basel III"),
    (r"\bFATF\b", "FATF"), (r"BSA/AML|\bBSA\b|\bAML\b", "BSA/AML"),
    (r"\bFinCEN\b", "FinCEN"), (r"\bAMLD\b|AMLD5|AMLD6", "AMLD"),
    (r"\bSOC 2\b", "SOC 2"), (r"\bOWASP\b|ASVS", "OWASP ASVS"),
    (r"\bFRCP\b|Rule 37", "FRCP 37(e)"), (r"\bSCIM\b|RFC 7644", "SCIM"),
    (r"FIPS 180", "FIPS 180-4"), (r"RFC 3161", "RFC 3161"), (r"COSO|COBIT", "COSO/COBIT"),
]

# SECURITY is an overlay (cross-cutting, derived), not a domain: an atom carries it
# iff it derives an identity/access/crypto-family standard.
SECURITY_STD = {"NIST 800-63", "NIST 800-53", "NIST 800-207", "OWASP ASVS", "SCIM", "FIPS 180-4"}

CATEGORIES = ("compliance", "healthcare", "messaging", "productivity",
              "resource-lifecycle", "temporal", "workflow")


def section(text, header_regex):
    out, grab = [], False
    for line in text.splitlines():
        if re.match(r"^## ", line):
            if grab:
                break
            grab = bool(re.match(header_regex, line))
            continue
        if grab:
            out.append(line)
    return "\n".join(out)


def frontmatter_domain(text):
    """Read the intrinsic `domain:` field from an atom's YAML frontmatter, if present."""
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    block = text[3:end] if end != -1 else ""
    m = re.search(r"^\s*domain:\s*([A-Za-z0-9 /,_-]+?)\s*$", block, re.M)
    return m.group(1).strip() if m else None


def parse_composition(path):
    text = path.read_text(encoding="utf-8")
    composes = section(text, r"^## Composes\b")
    atoms, roles = [], {}
    for m in re.finditer(r"\[([^\]]+)\]\(\.\./atoms/[a-z-]+/([a-z0-9-]+)\.md\)(?:\*\*)?\s*[—-]\s*(.*)", composes):
        name = m.group(2)
        atoms.append(name)
        roles[name] = m.group(3).strip()[:90]
    regulated = bool(re.search(r"^## .*Generation acceptance", text, re.M))
    std_section = section(text, r"^## Standards")
    standards = sorted({code for pat, code in STANDARDS if re.search(pat, std_section)})
    return {"name": path.stem, "atoms": atoms, "roles": roles,
            "regulated": regulated, "standards": standards}


def build_index(root):
    atoms_dir, comps_dir = root / "atoms", root / "compositions"

    atom = {}  # name -> {folder, domain}
    for p in sorted(atoms_dir.glob("*/*.md")):
        if p.name.lower() in ("readme.md", "index.md"):
            continue
        atom[p.stem] = {"folder": p.parent.name,
                        "domain": frontmatter_domain(p.read_text(encoding="utf-8"))}

    comps = [parse_composition(p) for p in sorted(comps_dir.glob("*.md"))
             if p.name.lower() != "readme.md"]

    composed_by = defaultdict(list)         # atom -> [composer]
    regulated_by = defaultdict(list)        # atom -> [composer] (regulated composers only)
    std_by_composer = defaultdict(dict)     # atom -> {composer: [standards]}  (per-composer attribution)
    for c in comps:
        for a in c["atoms"]:
            composed_by[a].append(c["name"])
            if c["regulated"]:
                regulated_by[a].append(c["name"])
            if c["standards"]:
                std_by_composer[a][c["name"]] = c["standards"]

    index = {}
    for a, meta in atom.items():
        all_std = sorted({s for stds in std_by_composer[a].values() for s in stds})
        index[a] = {
            "folder": meta["folder"],                      # current home (pre-flatten; informational)
            "domain": meta["domain"],                      # intrinsic (frontmatter), or null
            "overlays": {
                "regulated_by": regulated_by.get(a, []),   # composers that regulate it
                "standards_by_composer": std_by_composer.get(a, {}),  # attribution
                "security": bool(set(all_std) & SECURITY_STD),
            },
            "composed_by": composed_by.get(a, []),
        }
    return index, comps


def report(index, comps):
    L = []
    P = L.append
    reg_comps = [c["name"] for c in comps if c["regulated"]]
    edges = sum(len(c["atoms"]) for c in comps)
    P("# Usage-derived taxonomy — generated index\n")
    P(f"{len(comps)} compositions ({len(reg_comps)} regulated) · {len(index)} atoms · {edges} edges. "
      "Overlays derived from the graph (attributed per composer); domain intrinsic (frontmatter).\n")

    for a in sorted(index):
        e = index[a]
        ov = e["overlays"]
        P(f"\n## {a}  ·  shape-home `{e['folder']}/`  ·  domain: {e['domain'] or '(none)'}")
        if not e["composed_by"]:
            P("  - composed by: (none yet) — uncomposed; overlays say nothing (honest gap)")
            continue
        P(f"  - composed by: {', '.join(e['composed_by'])}")
        P(f"  - regulated: {'yes — ' + ', '.join(ov['regulated_by']) if ov['regulated_by'] else 'no'}")
        P(f"  - security:  {'yes' if ov['security'] else 'no'}")
        if ov["standards_by_composer"]:
            attribs = "; ".join(f"{', '.join(stds)} via {comp}"
                                for comp, stds in sorted(ov["standards_by_composer"].items()))
            P(f"  - standards: {attribs}")
        else:
            P("  - standards: (none)")
    return "\n".join(L) + "\n"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = pathlib.Path(args[0]) if args else pathlib.Path(".")
    index, comps = build_index(root)
    if "--json" in sys.argv:
        sys.stdout.write(json.dumps(index, indent=2, sort_keys=True) + "\n")
    else:
        sys.stdout.write(report(index, comps))


if __name__ == "__main__":
    main()
