"""Class 3, precisely: an *enumeration* over a derived index that declares rebuild-on-miss.

Rebuild-on-miss needs a keyed lookup with an observable miss. An enumeration over the index has
no miss to detect — a lost entry is indistinguishable from one that never existed. So: find the
declared composition-state map names, then find reads that iterate the map rather than key it.
"""
import io, os, re, glob

ROOT = '/home/claude/repo'
FILES = sorted(glob.glob(ROOT + '/compositions/*.md'))

MAPDECL = re.compile(r'^- \*\*`([a-z_]+)`\*\*', re.M)
ROM = re.compile(r'rebuild-on-miss|rebuild trigger, not data loss', re.I)


def enum_sentences(body, m):
    """Sentences that iterate the map rather than key into it."""
    out = []
    for sent in re.split(r'(?<=\.)\s+', body):
        if f'`{m}`' not in sent:
            continue
        keyed = re.search(rf'`{m}\[', sent)          # `map[key]` — a keyed lookup
        iterating = re.search(
            rf'(?:every|each|all)\s+`?{m}`?\s+(?:entry|entries)'
            rf'|(?:entries|entry)\s+in\s+`{m}`'
            rf'|`{m}`\s+entries'
            rf'|scan\w*\s+`{m}`'
            rf'|enumerat\w+\s+`{m}`', sent, re.I)
        if iterating and not keyed:
            out.append(re.sub(r'\s+', ' ', sent).strip())
    return out


total = 0
for f in FILES:
    s = io.open(f, encoding='utf-8').read()
    i = s.find('\n## Status')
    b = s[:i] if i > 0 else s
    if not ROM.search(b):
        continue
    j = b.find('### Composition state')
    k = b.find('###', j + 5) if j > 0 else -1
    decl = b[j:k] if j > 0 and k > 0 else ''
    maps = MAPDECL.findall(decl)
    hits = {m: enum_sentences(b, m) for m in maps}
    hits = {m: v for m, v in hits.items() if v}
    if not hits:
        continue
    print("=" * 78)
    print(os.path.basename(f)[:-3], f"— maps declared: {', '.join(maps)}")
    for m, sents in hits.items():
        total += len(sents)
        print(f"  `{m}` is enumerated:")
        for x in sents:
            print("     •", x[:300] + ("…" if len(x) > 300 else ""))
    print()
print(f"---> {total} enumerating read(s) over rebuild-on-miss indices")
