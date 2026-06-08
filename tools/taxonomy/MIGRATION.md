# Migration runbook — flatten `atoms/` to usage-derived taxonomy

A one-time runbook for the council-approved move in [`atoms/TAXONOMY.md`](../../atoms/TAXONOMY.md):
dissolve the `atoms/<category>/` subfolders, store atoms flat (`atoms/<name>.md`), and
replace the per-category folder catalogs with generated views of the reverse index.
Execute it as **its own focused session, in one clean commit, with explicit approval**
(per `CLAUDE.md` session hygiene). Delete or archive this file once the pass has landed.

> Ordered so the taxonomy is proven correct *before* any file moves, and so the
> repo is link-clean and the formal models still run *before* the commit. Each
> **GATE** is a stop-and-verify; do not proceed past a red gate.

## Measured scope (re-confirm at run time — figures from 2026-06-08)

| Quantity | Count | Command to re-measure |
|---|---|---|
| Atoms to move (`atoms/<cat>/<name>.md`) | **27** | `ls atoms/*/*.md \| grep -vi readme \| wc -l` |
| Formal-model siblings to move (`.tla/.als/.cfg/.py`) | **72** | `find atoms -type f \( -name '*.tla' -o -name '*.als' -o -name '*.cfg' -o -name '*.py' \) \| wc -l` |
| Markdown files with `atoms/<cat>/` references | **78** | `grep -rlE 'atoms/(compliance\|healthcare\|messaging\|productivity\|resource-lifecycle\|temporal\|workflow)/' --include='*.md' . \| grep -v node_modules \| wc -l` |
| Reference occurrences to rewrite | **239** | `grep -rhoE 'atoms/(…)/[a-z0-9-]+' --include='*.md' . \| grep -v node_modules \| wc -l` |
| Category READMEs to replace | **7** | `ls atoms/*/README.md \| wc -l` |
| Basename collisions across folders | **0** | `ls atoms/*/*.md \| grep -vi readme \| xargs -n1 basename \| sort \| uniq -d` |

**Path-safety finding (de-risks the move):** the formal models are path-safe under the
flatten. The harness (`tools/harness/audit.mjs`, `isolate.mjs`) locates models by a
**recursive directory walk** under `atoms/`, and TLA+/Alloy cross-references are by
**module name**, not path — both survive a depth change. The only `atoms/<cat>/` strings
*inside* the formal files are comments and example `node check.mjs …` invocations; they
are swept by the same reference rewrite for accuracy but break nothing if missed.

## Steps

### 0 — Branch + baseline. `git switch -c taxonomy-flatten`.
- Run the three baseline checks and record green: `python3 tools/linter/lint.py`;
  `node tools/harness/audit.mjs` (models run); the site build if wired.
- **GATE 0:** baseline is green. A red here is pre-existing and must be understood before proceeding.

### 1 — Generator validated (already done). 
- `python3 tools/taxonomy/reverse_index.py .` — eyeball the derived overlays against reality.
- If any classification is wrong, fix the **generator or a `## Composes` link**, never the tree.
- **GATE 1:** the derived index is correct. (Dry-run assessment already cleared this.)

### 2 — Seed the intrinsic `domain` axis (the curation the council conditioned approval on).
- Add `domain: healthcare` to the frontmatter of **`medication-order`** (EOS-earned —
  irreducible clinical guards).
- **Hold** `clinical-observation` (its own spec says it "imposes no clinical semantics";
  it is a neutral amendable-measurement primitive wearing a healthcare name — the
  masquerade case; tag only if a deliberate reframe decides otherwise).
- No other atom earns a domain tag today. Default is absent.
- **GATE 2:** `reverse_index.py . --json` shows `medication-order.domain == "healthcare"`, all others null.

### 3 — The atomic move (one commit's worth, but stage and verify before committing).
- `git mv atoms/<category>/<name>.* atoms/<name>.*` for all 27 atoms **and** their 72
  formal siblings (the glob `<name>.*` carries `.md` + `.tla/.als/.cfg/.py` together).
- **GATE 3:** `git status` shows exactly 99 renames, no deletes, no content changes yet;
  `ls atoms/*/*.md | grep -vi readme` is now empty.

### 4 — Rewrite the 239 references.
- Scripted: for every `*.md` (and the formal files' comment paths), replace
  `atoms/<category>/<name>` → `atoms/<name>` for each of the 7 categories. Build the
  substitution list from the actual category set; apply with `sed`/`perl` per file.
- Scope includes: composition `## Composes` links, atom↔atom links, EXECUTION_CONTRACT,
  THE_SPEC_LAYER, SPEC_FORMAT, CLAUDE.md, readme.md, ROADMAP, demos / RECIPEs, and the
  formal files' comment/example paths.
- **GATE 4 (the critical one):** repo-wide link check — **zero** remaining
  `atoms/<category>/` occurrences (`grep -rE 'atoms/(compliance|…|workflow)/' --include='*.md' . | grep -v node_modules` returns nothing), and **zero dangling links** (every `atoms/<name>.md` link resolves to a file that now exists).

### 5 — Replace the 7 category READMEs with generated views.
- Delete `atoms/<category>/README.md` ×7; generate browse-by-overlay catalogs from
  `reverse_index.py --json` (regulated, security, by-standard, by-domain, uncomposed)
  and wire them into the docs nav in place of the folder-driven nav.
- **GATE 5:** the generated catalog lists all 27 atoms with their overlays; nav builds.

### 6 — Update the canonical docs (prose, not just paths).
- `SPEC_FORMAT.md`: "Files live in `atoms/<category>/`" → "`atoms/<name>.md`; classification is derived."
- `THE_SPEC_LAYER.md`: the Taxonomy section's *open question on the current axes* → resolved, pointer to TAXONOMY.md.
- `ROADMAP.md`: the open-taxonomy note → resolved.
- `CLAUDE.md`: the two open questions (regulation-as-folder-vs-attribute; taxonomy axes) → resolved, pointer here.
- `OPEN_QUESTIONS.md`: mark both resolved; move the residue to DISCOVERIES if it became a found thing.
- `atoms/TAXONOMY.md`: status → `executed`, dated.
- **GATE 6:** `grep -rn 'atoms/<category>/' --include='*.md' .` clean across canonical docs too.

### 7 — Final verification (all must pass before the commit).
- **GATE 7a:** `python3 tools/linter/lint.py` — 0 findings (it already excludes TAXONOMY.md).
- **GATE 7b:** `node tools/harness/audit.mjs` — every Alloy/TLA model still found and still runs.
- **GATE 7c:** `python3 tools/taxonomy/reverse_index.py .` — clean, all 27 atoms present.
- **GATE 7d:** repo-wide: zero `atoms/<category>/` references anywhere; zero dangling links; site builds.
- **GATE 7e:** `git diff --stat` reviewed by Scott — the move is one reviewable commit.

### 8 — Commit (only on explicit approval).
- Propose the message in chat; commit nothing until Scott says go (CLAUDE.md).
- Suggested subject: `atoms: flatten to usage-derived taxonomy (one pass)`.

## Rollback

The move is one commit on a branch; `git reset --hard` / branch-delete reverts cleanly.
Because every step is staged and gated before the single commit, an aborted run leaves
`main` untouched.
