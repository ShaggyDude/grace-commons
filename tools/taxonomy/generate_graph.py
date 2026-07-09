#!/usr/bin/env python3
"""
tools/taxonomy/generate_graph.py — emit the generated composition-graph page and
the per-pattern card data.

Two artifacts, both DERIVED from the corpus (never hand-edited — regenerate):

  graph.md            The "Composition Graph" site page: reverse-leverage tables
                      (atom fan-in; substrate fan-in), the substrate spine as a
                      Mermaid diagram, and the full atom→composition graph
                      (collapsed by default). Executes the substrate-composing
                      overlay + reverse-leverage view (open-questions.md) and the
                      graph half of the pattern-cards initiative
                      (working-ideas/site-improvement-plan.md item 2).

  _data/patterns.json Per-pattern card data consumed by _includes/pattern-card.html
                      at Jekyll render time, so the 52 canonical pattern files are
                      NEVER edited — the card is a view injected by layout, the
                      same discipline as diagrams-are-views-not-truth.

Every field is read off the files (Status token, Invariant headers, sibling
.tla/.als models and their -buggy twins, Composes edges) or off the usage-derived
index (overlays, fan-in) — nothing is asserted that is not derivable, so nothing
here can drift without the source having changed. Substrate (composition →
composition) edges are parsed here from each composition's Composes section; if a
second consumer appears, graduate that parse into reverse_index.py.

Usage:  python3 tools/taxonomy/generate_graph.py [repo-root]
        # writes <root>/graph.md and <root>/_data/patterns.json
"""
import sys, re, json, pathlib
from collections import defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from reverse_index import build_index  # noqa: E402  (same directory)

# Mirrors tools/linter/lint.py's conventions so the two tools cannot disagree
# about what counts as an invariant header or a status token.
INVARIANT_HEADER = re.compile(r"^\s*-?\s*\*\*Invariant\s+(\d+)\s+[—-]", re.M)
STATUS_SECTION = re.compile(r"^## Status\s*\.?\s*$", re.M)
LEADING_TOKEN = re.compile(r"`([^`]+)`")


def frontmatter_title(text, fallback):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        m = re.search(r"^\s*title:\s*(.+?)\s*$", text[3:end if end != -1 else len(text)], re.M)
        if m:
            return m.group(1).strip()
    return fallback


def status_token(text):
    m = STATUS_SECTION.search(text)
    if not m:
        return None
    for line in text[m.end():].splitlines():
        if line.strip():
            t = LEADING_TOKEN.search(line)
            return t.group(1) if t else None
    return None


def models_of(path):
    """Sibling formal-model artifacts, by filesystem fact alone."""
    stem, parent = path.stem, path.parent
    out = {"tla": (parent / f"{stem}.tla").exists(),
           "als": (parent / f"{stem}.als").exists()}
    out["twins"] = len(list(parent.glob(f"{stem}-buggy*.tla"))) + \
        len(list(parent.glob(f"{stem}-buggy*.als")))
    return out


def substrates_of(text, comp_slugs):
    """Composition → composition (substrate) edges: Composes-section CONSTITUENT
    list items linking a sibling composition — the same `- **[Name](path)** — role`
    shape reverse_index requires for atom edges. Prose mentions inside the section
    (named peers, deliberate non-compositions like Compensable Workflow's "Audit
    Trail is deliberately not composed") do not count as edges."""
    lines, grab, out = text.splitlines(), False, []
    item = re.compile(r"^\s*-\s+\*{0,2}\[[^\]]+\]\(\./([a-z0-9-]+)\.md\)\*{0,2}\s*[—-]")
    for line in lines:
        if re.match(r"^## ", line):
            if grab:
                break
            grab = bool(re.match(r"^## Composes\b", line))
            continue
        if grab:
            m = item.match(line)
            if m and m.group(1) in comp_slugs and m.group(1) not in out:
                out.append(m.group(1))
    return out


def node_id(slug):
    return slug.replace("-", "_")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = pathlib.Path(args[0]) if args else pathlib.Path(".")
    index, comps = build_index(root)
    comp_slugs = {c["name"] for c in comps}
    atoms = sorted(index)

    # ---- per-pattern card data --------------------------------------------
    cards, substrate_edges = {}, []          # (composer, substrate)
    for a in atoms:
        p = root / "atoms" / f"{a}.md"
        text = p.read_text(encoding="utf-8")
        e = index[a]
        stds = sorted({s for ss in e["overlays"]["standards_by_composer"].values() for s in ss})
        cards[a] = {
            "title": frontmatter_title(text, a), "kind": "atom",
            "status": status_token(text),
            "grounded": bool(re.match(r"grounded", status_token(text) or "")),
            "invariants": len(set(INVARIANT_HEADER.findall(text))),
            "models": models_of(p),
            "composed_by": e["composed_by"], "domain": e["domain"],
            "regulated_by": e["overlays"]["regulated_by"],
            "security": e["overlays"]["security"], "standards": stds,
        }
    for c in comps:
        p = root / "compositions" / f"{c['name']}.md"
        text = p.read_text(encoding="utf-8")
        subs = substrates_of(text, comp_slugs)
        substrate_edges += [(c["name"], s) for s in subs]
        cards[c["name"]] = {
            "title": frontmatter_title(text, c["name"]), "kind": "composition",
            "status": status_token(text),
            "grounded": bool(re.match(r"grounded", status_token(text) or "")),
            "invariants": len(set(INVARIANT_HEADER.findall(text))),
            "models": models_of(p),
            "composes": c["atoms"], "substrates": subs,
            "regulated": c["regulated"], "standards": c["standards"],
        }
    substrate_of = defaultdict(list)
    for composer, sub in substrate_edges:
        substrate_of[sub].append(composer)
    for slug, users in substrate_of.items():
        cards[slug]["substrate_of"] = sorted(users)

    data_dir = root / "_data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "patterns.json").write_text(
        json.dumps(cards, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    # ---- graph.md ----------------------------------------------------------
    def alink(s):
        return f"[{cards[s]['title']}](./atoms/{s}.html)"

    def clink(s):
        return f"[{cards[s]['title']}](./compositions/{s}.html)"

    L = []
    P = L.append
    P("---")
    P("title: Composition Graph")
    P("nav_order: 3")
    P("parent: The Corpus")
    P("---")
    P("")
    P("<!-- GENERATED by tools/taxonomy/generate_graph.py — do not hand-edit; regenerate with")
    P("     `python3 tools/taxonomy/generate_graph.py .`. Every edge and count below is derived")
    P("     from the corpus (Composes sections, Status lines, sibling model files). -->")
    P("")
    P("# Composition Graph")
    P("")
    P("The Intent Graph, rendered. Every diagram and count on this page is **derived** from the")
    P("corpus — the `## Composes` edges, the Status lines, the sibling formal-model files — and")
    P("regenerated by tooling, never hand-maintained (text is canonical; visuals are views). Visual")
    P("weight here is *semantic leverage*: how many compositions rest on a pattern — not lines of code.")
    P("")

    # -- reverse leverage: atoms ---------------------------------------------
    P("## Reverse leverage — atoms by fan-in")
    P("")
    P("How many grounded compositions compose each atom. A stale or wrong atom propagates exactly")
    P("this far — fan-in is the risk weight the rescan queue tie-breaks on, and the reuse a flat")
    P("pattern count hides.")
    P("")
    P("| Atom | Fan-in | Composed by |")
    P("|---|---|---|")
    for a in sorted(atoms, key=lambda x: (-len(index[x]["composed_by"]), x)):
        cb = index[a]["composed_by"]
        P(f"| {alink(a)} | {len(cb)} | {', '.join(cb) if cb else '*(none yet)*'} |")
    P("")

    # -- reverse leverage: substrates ----------------------------------------
    P("## Reverse leverage — compositions as substrates")
    P("")
    P("Compositions other compositions name in their `## Composes` (the substrate pattern —")
    P("constituents reached transitively). This is the load-bearing spine of the library.")
    P("")
    P("| Substrate | Named by | Composers |")
    P("|---|---|---|")
    for s in sorted(substrate_of, key=lambda x: (-len(substrate_of[x]), x)):
        users = sorted(substrate_of[s])
        P(f"| {clink(s)} | {len(users)} | {', '.join(users)} |")
    P("")

    # -- substrate spine diagram ---------------------------------------------
    P("## The substrate spine")
    P("")
    P("Compositions that build on other compositions. Arrows point from the composer to the")
    P("substrate it names; constituents of the substrate are reached transitively.")
    P("")
    P("```mermaid")
    P('%%{init: {"theme": "dark", "flowchart": {"htmlLabels": true}} }%%')
    P("flowchart LR")
    spine_nodes = set(substrate_of) | {c for c, _ in substrate_edges}
    for n in sorted(spine_nodes):
        fan = len(substrate_of.get(n, []))
        label = cards[n]["title"] + (f" · {fan}" if fan else "")
        P(f'  {node_id(n)}["{label}"]')
    for composer, sub in sorted(substrate_edges):
        P(f"  {node_id(composer)} -.->|substrate| {node_id(sub)}")
    P("  classDef comp fill:#3b2a52,stroke:#c7a8e8,color:#f2ebfa;")
    P("  classDef spine fill:#52341f,stroke:#f0b27a,color:#fdf2e9;")
    P(f"  class {','.join(node_id(n) for n in sorted(spine_nodes))} comp;")
    if substrate_of:
        P(f"  class {','.join(node_id(n) for n in sorted(substrate_of))} spine;")
    P("```")
    P("")

    # -- full graph (collapsed) ----------------------------------------------
    P("## The full graph")
    P("")
    P('<details markdown="block">')
    P(f"<summary>Every composition → atom edge ({sum(len(c['atoms']) for c in comps)} edges — expand)</summary>")
    P("")
    P("```mermaid")
    P('%%{init: {"theme": "dark", "flowchart": {"htmlLabels": true}} }%%')
    P("flowchart LR")
    P("  subgraph ATOMS[Atoms]")
    for a in atoms:
        fan = len(index[a]["composed_by"])
        label = cards[a]["title"] + (f" · {fan}" if fan else "")
        P(f'    a_{node_id(a)}["{label}"]')
    P("  end")
    P("  subgraph COMPS[Compositions]")
    for c in sorted(comp_slugs):
        P(f'    c_{node_id(c)}["{cards[c]["title"]}"]')
    P("  end")
    for c in comps:
        for a in c["atoms"]:
            if a in index:
                P(f"  c_{node_id(c['name'])} --> a_{node_id(a)}")
    for composer, sub in sorted(substrate_edges):
        P(f"  c_{node_id(composer)} -.-> c_{node_id(sub)}")
    P("  classDef atom fill:#16394a,stroke:#85c1e9,color:#eaf6fc;")
    P("  classDef atomSec fill:#16394a,stroke:#f7dc6f,color:#fdfbef;")
    P("  classDef comp fill:#3b2a52,stroke:#c7a8e8,color:#f2ebfa;")
    P("  classDef compReg fill:#52341f,stroke:#f0b27a,color:#fdf2e9;")
    sec = [a for a in atoms if index[a]["overlays"]["security"]]
    reg = sorted(c["name"] for c in comps if c["regulated"])
    P(f"  class {','.join('a_' + node_id(a) for a in atoms)} atom;")
    if sec:
        P(f"  class {','.join('a_' + node_id(a) for a in sec)} atomSec;")
    P(f"  class {','.join('c_' + node_id(c) for c in sorted(comp_slugs))} comp;")
    if reg:
        P(f"  class {','.join('c_' + node_id(c) for c in reg)} compReg;")
    P("```")
    P("")
    P("</details>")
    P("")
    P("**Legend.** Blue nodes: atoms (yellow border: the derived *security* overlay). Purple nodes:")
    P("compositions (orange fill: regulated — the composition carries a Generation acceptance bar;")
    P("in the spine diagram, orange marks compositions used as substrates). Dotted arrows: substrate")
    P("edges. `· N` on a node is its fan-in.")
    P("")
    P("---")
    P("")
    P("Catalogs: [Atomic Concepts](./atoms/) · [Conceptual Compositions](./compositions/). The")
    P("classification lenses behind the coloring are documented in the")
    P("[taxonomy note](./atoms/TAXONOMY.html).")
    P("")

    (root / "graph.md").write_text("\n".join(L), encoding="utf-8")
    sys.stderr.write(
        f"wrote graph.md ({len(atoms)} atoms, {len(comps)} compositions, "
        f"{len(substrate_edges)} substrate edges) and _data/patterns.json "
        f"({len(cards)} cards)\n")


if __name__ == "__main__":
    main()
