#!/usr/bin/env python3
"""
Grace Commons - Recipe / Composition-Tree Generator (v0)

Reads each demo's source for its DECLARED atoms (`// Atom:` headers + the
`grace-commons/atoms/...md` spec path each module quotes), validates every spec
path against the canonical library, flags label/path mismatches, and INFERS the
composition layer from constituent-atom presence (parsing each composition's
`## Composes` section, expanding substrate compositions transitively).

Discipline:
  * Atoms are AUTHORITATIVE when the demo declares them in code.
  * Where a demo declares NOTHING, the tree falls back to SPEC-DERIVED (the
    matching composition's Composes set) and says so - a flag to add headers.
  * Compositions are INFERRED - "all constituent atoms present" is a capability
    upper bound, NOT proof the app wires the composition.

The point: an app-level claim ("Multi-Party Approval powers Beacon") becomes
falsifiable against the generated tree. If the atoms aren't there, you can't
write the claim.

Usage:  python3 generate_recipe.py <repo_root> <out_dir>
"""

import sys, os, re, json, glob, datetime

SPEC_PATH_RE = re.compile(r'(?:\.\./)*((?:atoms|compositions)/[A-Za-z0-9_\-/]+\.md)')
ATOM_HDR_RE  = re.compile(r'//\s*Atom:\s*(.+)')
NOT_ATOM_RE  = re.compile(r'Not a Grace Commons atom')
TITLE_RE     = re.compile(r'^title:\s*(.+)$', re.MULTILINE)
H1_RE        = re.compile(r'^#\s+(.+)$', re.MULTILINE)


def lib_title(repo, rel_path):
    full = os.path.join(repo, rel_path)
    if not os.path.isfile(full):
        return None
    txt = open(full, encoding="utf-8").read()
    if txt.startswith("---"):
        m = TITLE_RE.search(txt.split("---", 2)[1])
        if m:
            return m.group(1).strip()
    m = H1_RE.search(txt)
    if m:
        return re.sub(r'\{[^}]*\}', '', m.group(1)).strip()
    return os.path.splitext(os.path.basename(rel_path))[0]


def is_grounded(repo, rel_path):
    full = os.path.join(repo, rel_path)
    if not os.path.isfile(full):
        return False
    return bool(re.search(r'`?grounded', open(full, encoding="utf-8").read().lower()))


def composes_section(repo, comp_rel):
    full = os.path.join(repo, comp_rel)
    if not os.path.isfile(full):
        return ""
    out, capture = [], False
    for ln in open(full, encoding="utf-8").read().splitlines():
        if re.match(r'^##\s+Composes\b', ln):
            capture = True; continue
        if capture and re.match(r'^##\s+', ln):
            break
        if capture:
            out.append(ln)
    return "\n".join(out)


def direct_constituents(repo, comp_rel):
    sec = composes_section(repo, comp_rel)
    paths = set()
    for m in SPEC_PATH_RE.finditer(sec):
        paths.add(m.group(1))
    for m in re.finditer(r'\]\(\./([A-Za-z0-9_\-]+\.md)\)', sec):
        paths.add("compositions/" + m.group(1))
    return paths


def transitive_atoms(repo, comp_rel, seen=None):
    if seen is None:
        seen = set()
    if comp_rel in seen:
        return set()
    seen.add(comp_rel)
    atoms = set()
    for p in direct_constituents(repo, comp_rel):
        if p.startswith("atoms/"):
            atoms.add(p)
        elif p.startswith("compositions/"):
            atoms |= transitive_atoms(repo, p, seen)
    return atoms


def domain_files(repo, app):
    for sub in ("domain", "src/domain"):
        d = os.path.join(repo, "demos", app, sub)
        if os.path.isdir(d):
            return sorted(glob.glob(os.path.join(d, "*.ts")))
    return []


def parse_app(repo, app, title_index):
    atom_paths, atom_labels, app_entities, warnings, missing_path = {}, {}, [], [], []
    for f in domain_files(repo, app):
        head = "\n".join(open(f, encoding="utf-8").read().splitlines()[:40])
        base = os.path.splitext(os.path.basename(f))[0]
        if NOT_ATOM_RE.search(head):
            app_entities.append(base); continue
        label_m = ATOM_HDR_RE.search(head)
        label = label_m.group(1).strip() if label_m else None
        found = [m.group(1) for m in SPEC_PATH_RE.finditer(head) if m.group(1).startswith("atoms/")]
        for p in found:
            atom_paths.setdefault(p, set()).add(base)
            atom_labels[p] = lib_title(repo, p) or label
        if label and found:
            # mismatch: none of the cited paths' titles match the declared label
            titles = [(lib_title(repo, p) or "").lower() for p in found]
            if not any(t and (t in label.lower() or label.lower() in t) for t in titles):
                exp = title_index.get(re.sub(r'\s*\(.*?\)', '', label).strip().lower())
                hint = f"; expected `{exp}`" if exp else ""
                warnings.append(f"{base}.ts: declares `// Atom: {label}` but cites "
                                f"{', '.join(found)} (title {', '.join(titles)}) - mismatch{hint}")
        if label and not found:
            warnings.append(f"{base}.ts: declares `// Atom: {label}` but cites no resolvable spec path")
    missing_path = [p for p in atom_paths if not os.path.isfile(os.path.join(repo, p))]
    return atom_paths, atom_labels, sorted(app_entities), warnings, missing_path


def main():
    repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    out  = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else "./recipe_out")
    os.makedirs(out, exist_ok=True)
    today = datetime.date.today().isoformat()

    atom_files = [os.path.relpath(p, repo) for p in glob.glob(os.path.join(repo, "atoms", "*", "*.md"))
                  if os.path.basename(p).lower() not in ("readme.md", "index.md")]
    comp_files = [os.path.relpath(p, repo) for p in glob.glob(os.path.join(repo, "compositions", "*.md"))
                  if os.path.basename(p).lower() not in ("readme.md", "index.md")]
    title_index = {}
    for p in atom_files:
        t = lib_title(repo, p)
        if t:
            title_index[t.lower()] = p
    comp_atoms = {c: transitive_atoms(repo, c) for c in comp_files}
    comp_name  = {c: lib_title(repo, c) for c in comp_files}

    apps = sorted({os.path.basename(os.path.dirname(p))
                   for p in glob.glob(os.path.join(repo, "demos", "*", ""))})
    summary = [f"# Grace Commons - Demo Recipes (generated {today})", "",
               "_Atoms are authoritative when declared in code; spec-derived where a demo "
               "declares none. Compositions are inferred from constituent-atom presence "
               "(a capability upper bound, not proof of wiring)._", ""]

    for app in apps:
        atom_paths, atom_labels, app_entities, warnings, missing_path = parse_app(repo, app, title_index)
        lineage = "code-declared"
        app_atoms = set(atom_paths)

        if not app_atoms and not app_entities:
            # spec-derived fallback: match demo name to a composition spec
            cand = f"compositions/{app}.md"
            if cand in comp_atoms:
                lineage = "spec-derived (demo declares no `// Atom:` headers - add them)"
                app_atoms = set(comp_atoms[cand])
                for p in app_atoms:
                    atom_labels[p] = lib_title(repo, p) or p
            else:
                continue

        present, near = [], []
        for c in sorted(comp_files):
            needs = comp_atoms[c]
            if needs and needs <= app_atoms:
                present.append(c)
            elif needs and (needs & app_atoms):
                near.append((c, sorted(needs - app_atoms)))

        recipe = {
            "app": f"demos/{app}", "generated": today, "lineage_source": lineage,
            "atoms": [{"name": atom_labels.get(p, lib_title(repo, p) or p), "spec": p,
                       "modules": sorted(atom_paths.get(p, [])), "grounded": is_grounded(repo, p)}
                      for p in sorted(app_atoms)],
            "app_specific_entities": app_entities,
            "compositions_inferred": [{"name": comp_name[c], "spec": c,
                                       "constituent_atoms": sorted(comp_atoms[c])} for c in present],
            "compositions_absent": [{"name": comp_name[c], "spec": c, "missing_atoms": miss}
                                    for c, miss in near],
            "spec_path_errors": missing_path, "warnings": warnings,
        }
        json.dump(recipe, open(os.path.join(out, f"{app}.recipe.json"), "w"), indent=2)

        L = [f"# {app} - Composition Recipe", "",
             f"_Generated {today} by `tools/recipe/generate_recipe.py`. Do not hand-edit - regenerate._", "",
             f"**App:** `demos/{app}`   |   **Lineage source:** {lineage}", "",
             "## Atoms"]
        if lineage.startswith("spec-derived"):
            L.append("_(derived from the matching composition spec; the demo's code does not yet "
                     "declare `// Atom:` headers, so this is what it SHOULD contain, not what it proves)_")
        L.append("")
        for a in recipe["atoms"]:
            g = "grounded" if a["grounded"] else "UNGROUNDED?"
            mods = (" - module(s): " + ", ".join(a["modules"])) if a["modules"] else ""
            L.append(f"- **{a['name']}** - `{a['spec']}` ({g}){mods}")
        if app_entities:
            L += ["", "## App-specific entities (NOT library atoms)", "", "- " + ", ".join(app_entities)]
        L += ["", "## Compositions present (inferred - all constituent atoms available)", "",
              "_Capability upper bound, not proof of wiring; add `// Composition:` headers to make authoritative._", ""]
        for c in recipe["compositions_inferred"]:
            cons = ", ".join(os.path.splitext(os.path.basename(x))[0] for x in c["constituent_atoms"])
            L.append(f"- **{c['name']}** - `{c['spec']}`  [{cons}]")
        L += ["", "## Compositions NOT present (named so claims stay honest)", ""]
        for c in recipe["compositions_absent"]:
            miss = ", ".join(os.path.splitext(os.path.basename(x))[0] for x in c["missing_atoms"])
            L.append(f"- **{c['name']}** - missing atom(s): {miss}")
        L += ["", "## Validation", "",
              f"- Spec-path references resolve to a library file: "
              f"{'ALL OK' if not missing_path else 'ERRORS: ' + ', '.join(missing_path)}"]
        if warnings:
            L.append("- **Warnings:**")
            for w in warnings:
                L.append(f"    - {w}")
        L.append("")
        open(os.path.join(out, f"{app}.MANIFEST.md"), "w").write("\n".join(L))

        summary += [f"## {app}  ({lineage})",
                    f"- atoms ({len(recipe['atoms'])}): " + ", ".join(a["name"] for a in recipe["atoms"]),
                    f"- compositions present (inferred): " +
                    (", ".join(c["name"] for c in recipe["compositions_inferred"]) or "none"),
                    f"- explicitly NOT present: " +
                    (", ".join(c["name"] for c in recipe["compositions_absent"]
                               if c["name"] in ("Multi-Party Approval", "Defensible Retention",
                                                "Privileged Access Provisioning", "Capability-Backed Sharing")) or "-"),
                    (f"- WARNINGS: {len(warnings)}" if warnings else "- warnings: none"), ""]

    open(os.path.join(out, "RECIPES_SUMMARY.md"), "w").write("\n".join(summary))
    print("\n".join(summary))
    print(f"Wrote per-app recipe.json + MANIFEST.md to {out}")


if __name__ == "__main__":
    main()
