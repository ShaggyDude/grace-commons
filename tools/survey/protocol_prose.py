"""Protocol prose per composition — the recurrence and deletion baseline for the
higher-order composition test (pressure-testing.md §Pass 2, *The higher-order
composition test*; roadmap.md methodology debt #20).

Six components make up the recoverable-invocation shape every regulated composition
re-derives in its own words: an intent/outcome record pair, a serialized section
(or lease) on the act, a completion bound, a bounded reconciliation, a recovery
record or identity, and a rejection code that carries its position. This survey
counts, per composition body (above ## Status), which of the six are present and
how many bytes of paragraphs touch at least two of them — a rough upper bound on
the protocol prose an adopter would replace with a dependency declaration and its
bindings. Re-run after an adoption: the number falling is the deletion evidence
the seventh rule of the test requires.

2026-08-30 baseline: twenty compositions carry three or more components; ~920 KB of
protocol prose; per-body share 8% (Privileged Access Provisioning) to 55% (Actor
Suspension); nine carry all six.
"""
import io, os, re, glob

ROOT = os.environ.get('GRACE_ROOT', os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
FILES = sorted(glob.glob(ROOT + '/compositions/*.md'))

COMPONENTS = {
    'intent/outcome pair':      r'intent[_ -]record|_intended\b|intent_event_id|invocation_id',
    'section / lease':          r'_serialization\b|_section\b|per-\w+ section|critical section|lease',
    'completion bound':         r'_completion_bound|_duration_bound',
    'bounded reconciliation':   r'reconciliation_cadence|compensation_window|reconciliation_window',
    'recovery record/identity': r'recovery[_-]intended|recovery_identity|application_actor_ref|reconciliation_operator',
    'positioned code':          r'recording-failure\((intent|outcome)|storage-failure\((credential|effect|intent|outcome|none)|\(intent \| outcome',
}
MIN_COMPONENTS = 3


def body(path):
    s = io.open(path, encoding='utf-8').read()
    i = s.find('\n## Status')
    return s[:i] if i > 0 else s


rows = []
for f in FILES:
    b = body(f)
    have = {k: bool(re.search(v, b)) for k, v in COMPONENTS.items()}
    touched = [p for p in b.split('\n\n') if sum(bool(re.search(v, p)) for v in COMPONENTS.values()) >= 2]
    rows.append((os.path.basename(f)[:-3], sum(have.values()), sum(len(p) for p in touched), len(b), have))
rows.sort(key=lambda r: -r[2])

print(f"{'composition':42} comps  proto-KB  body-KB  share  {'/'.join(k.split()[0] for k in COMPONENTS)}")
total = 0
for name, count, proto, size, have in rows:
    if count >= MIN_COMPONENTS:
        total += proto
        flags = ''.join('x' if have[k] else '.' for k in COMPONENTS)
        print(f"{name:42} {count:5}  {proto/1024:7.1f}  {size/1024:7.1f}  {proto/size:5.0%}  {flags}")
print(f"\n{sum(1 for r in rows if r[1] >= MIN_COMPONENTS)} composition(s) with >= {MIN_COMPONENTS} components; "
      f"protocol prose total {total/1024:.0f} KB")
