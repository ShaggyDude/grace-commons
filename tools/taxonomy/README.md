# Taxonomy — the usage-derived classifier

`reverse_index.py` derives each atom's classification from the **Intent Graph**
(the atoms + the `## Composes` edges every composition declares) instead of asserting
it with a folder. It is the tool the flat-storage taxonomy depends on
([`atoms/TAXONOMY.md`](../../atoms/TAXONOMY.md)): once the category subfolders dissolve,
the per-category README catalogs and the docs nav become generated browse-by-overlay
views of this index.

Dependency-free (Python stdlib only), read-only over the repo — same house style as
[`tools/recipe`](../recipe/) (derive a fact from canonical source rather than
hand-maintain it) and [`tools/conformance`](../conformance/).

## Three axes, three mechanisms

| Axis | Source | Mechanism |
|---|---|---|
| **Structural** (sequence / state-machine / registry) | the atom's own `## State` / `## Behavior` | derivable — *deferred*, no metadata |
| **Overlay** (regulated · security · standards) | the composition graph | **derived here**, attributed per contributing composer |
| **Domain** (healthcare, banking, …) | the atom's own frontmatter `domain:` | **intrinsic**, default absent, EOS-gated by a human |

The discipline that keeps the derivation honest: **it reports usage, not essence.**
A standard is shown as `HIPAA via audit-trail`, never a bare `regulated: true`; an
uncomposed atom shows `composed by: (none yet)`, never a false `Regulated: false`. The
graph knows usage; it does not know essence. Domain is the one axis usage cannot
derive — so it is the one axis a human curates, gated by the EOS freestanding test
(does stripping the domain leave a freestanding neutral primitive?), never free-typed.

## Signals

- **Composes** — `- **[Atom](../atoms/<cat>/<name>.md)** — role.` bullets in `## Composes`.
- **regulated** — a composition is regulated iff it carries a `## Generation acceptance` section.
- **standards** — normalized families matched in the composition's `## Standards[ references]` section.
- **security** — an overlay (not a domain): an atom carries it iff it derives an
  identity/access/crypto-family standard (NIST 800-63/53/207, OWASP ASVS, SCIM, FIPS 180-4).
- **domain** — read from the atom's frontmatter; not derived.

## Usage

```bash
python3 tools/taxonomy/reverse_index.py .            # human-readable index
python3 tools/taxonomy/reverse_index.py . --json     # machine index (atom → overlays + domain)
```

The `--json` index is the seam for the generated catalog/nav and for a future
derived-regulated linter (any derived-regulated atom missing its overlay sections —
*Regulated adversarial scenarios* / *Generation acceptance* — mirroring the conformance
`--reconcile`). The one-pass flatten that made these views canonical landed
2026-06-08; [`generate_views.py`](./generate_views.py) emits the browse-by-overlay
catalog (`atoms/index.md`) from this index.
