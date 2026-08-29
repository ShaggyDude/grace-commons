"""Class 2, precisely: does a pattern's *rebuild procedure* bound its own totality by the
retention horizon, or does it claim totality unconditionally?

The defect is a rebuild (or a records-alone check) that reads event `data` payloads and calls
itself total, in a corpus whose substrate destroys those payloads at the horizon.
"""
import io, os, re, glob

ROOT = '/home/claude/repo'
FILES = sorted(glob.glob(ROOT + '/atoms/*.md')) + sorted(glob.glob(ROOT + '/compositions/*.md'))

# a rebuild that reads the event payload
READS = re.compile(r'\*Rebuild procedure:\*[^\n]*', re.I)
PAYLOAD = re.compile(r'payload|`data`|from each event|event .{0,15}data', re.I)
# an explicit bound on that rebuild's totality
BOUND = re.compile(r'bound on the rebuild|totality[^.]{0,80}(horizon|retention|purge)'
                   r'|(horizon|retention|purge)[^.]{0,80}totality'
                   r'|rebuild[^.]{0,120}(past the horizon|until its retention|still live in the log|still readable)'
                   r'|purged subset', re.I)

exposed, bounded, none = [], [], []
for f in FILES:
    s = io.open(f, encoding='utf-8').read()
    i = s.find('\n## Status')
    b = s[:i] if i > 0 else s
    rebuilds = [m.group(0) for m in READS.finditer(b)]
    payload_rebuilds = [r for r in rebuilds if PAYLOAD.search(r)]
    if not payload_rebuilds:
        none.append(os.path.basename(f)[:-3]); continue
    if BOUND.search(b):
        bounded.append((os.path.basename(f)[:-3], len(payload_rebuilds)))
    else:
        exposed.append((os.path.basename(f)[:-3], len(payload_rebuilds)))

print("PAYLOAD-SOURCED REBUILDS WITH A STATED HORIZON BOUND (the correct treatment):")
for k, n in bounded:
    print(f"   ✓ {k:<50} {n} rebuild(s)")
print()
print("PAYLOAD-SOURCED REBUILDS WITH NO HORIZON BOUND ANYWHERE IN THE BODY:")
for k, n in exposed:
    print(f"   ! {k:<50} {n} rebuild(s)")
print()
print(f"---> {len(bounded)} bounded, {len(exposed)} exposed, "
      f"{len(none)} patterns with no payload-sourced rebuild")
