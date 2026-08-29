"""Class 1, precisely: does the claimed atomic set actually span an Audit Trail write?

The defect is not the phrase. It is an all-or-nothing claim whose member set includes a
`record_action` — a write the substrate declares it cannot withdraw. So: find each atomicity
sentence and ask whether an audit write is named inside it.
"""
import io, os, re, glob

ROOT = '/home/claude/repo'
FILES = sorted(glob.glob(ROOT + '/atoms/*.md')) + sorted(glob.glob(ROOT + '/compositions/*.md'))

CLAIM = re.compile(r'[^.]*?(?:together or not at all|host transaction boundar|commits? (?:them |the \w+ )?atomically|atomic(?:ally)? (?:with|under|commit))[^.]*\.', re.I)
AUDIT = re.compile(r'record_action|audit (?:write|event|record)|`?\w+\.(?:granted|revoked|disclosed|authorized|recorded|fired|opened|decided)`?|Audit Trail (?:event|write|record)', re.I)


def body(path):
    s = io.open(path, encoding='utf-8').read()
    i = s.find('\n## Status')
    return s[:i] if i > 0 else s


for f in FILES:
    b = body(f)
    sents = [m.group(0).strip() for m in CLAIM.finditer(b)]
    flagged = [x for x in sents if AUDIT.search(x)]
    if not flagged:
        continue
    print("=" * 78)
    print(os.path.basename(f)[:-3], f"— {len(flagged)} atomicity sentence(s) naming an audit write")
    for x in flagged:
        x = re.sub(r'\s+', ' ', x)
        print("   •", x[:400] + ("…" if len(x) > 400 else ""))
    print()
