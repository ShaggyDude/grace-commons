#!/usr/bin/env python3
"""Fixture tests for the linter's capability-provenance *use* checks (P, Q).

Why this file exists. P and Q were built by sweeping the corpus, and a check
built that way has a specific failure mode: it is easy to keep loosening the
trigger until the finding set matches the answer you already had in mind. That
is not verification, it is curve-fitting — and it costs the thing the linter
trades on, which is that a firing is worth reading.

So each check is pinned from both sides:

  * a NEGATIVE — the pattern that already does the right thing. If the check
    fires there, the check is wrong, because that pattern is the exemplar its
    own message points authors at. Chain of Custody Invariant 4 states the
    safety-plus-liveness split for P; Audit Trail states the rebuild's totality
    bound for Q.
  * POSITIVES — the patterns whose findings are routed open in their Lineage
    entries. If the check stops firing there, it has been loosened into
    uselessness or the finding was closed without updating this file. Either
    way someone should look.

This is the same discipline `tools/harness/isolate.mjs` applies to the formal
models: an invariant with no dedicated rejecting twin is not verified, it is
asserted. A check with no known-silent case is not precise, it is untested.

Run:  python3 tools/linter/test_checks.py [repo_root]
Exit: 0 all pinned expectations hold, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lint import (  # noqa: E402
    Pattern,
    check_atomicity_over_audit,
    check_rebuild_bound,
    check_recording_step,
    check_retry_bit,
    check_seal_key,
    check_ledger,
    load_patterns,
)

# ── The motivating case, pinned SYNTHETICALLY ─────────────────────────────── #
# This started as a pin on two real corpus blocks and had to stop being one, and
# why is the useful part.
#
# P's first draft treated the word "modulo" as an acknowledgement marker.
# Resolve a Person's Data Rights carried a modulo-clause about a DIFFERENT
# boundary — its irreversible purge precursor — and that clause suppressed the
# finding on its Invariant 1, the claim the corpus survey had routed the day
# before. Capability-Backed Sharing lost a finding the same way. The check went
# silent on the two cases that motivated it, and a file-level pin would not have
# shown it: both patterns still fired at other sites, so the run looked healthy.
# A hedge word like "modulo" clusters around a pattern's most careful claims,
# because those are the ones an author qualifies — so a hedge-word suppressor is
# not randomly lossy, it is biased toward silencing the findings that matter
# most. Both sites it dropped were their pattern's declared formal-model subject.
#
# Both are now FIXED — restated 2026-08-27 — and that is the problem with pinning
# a regression to corpus text: the pin dies the moment the finding is repaired,
# which is the moment you most want the guard still standing. A perishable pin
# also creates a bad incentive, since the cheapest way to make it pass is to
# delete it. So the regression is pinned to a SYNTHETIC block instead, which
# encodes the bug rather than a victim of it and outlives every fix.
FIXTURE_MODULO_DECOY = """
## Composition-level invariants

- **Invariant 1 — Binding.** The record and its sealed Audit Trail event commit
  together or not at all. This holds *modulo* the inherited irreversible-purge
  contract, which governs a different boundary entirely.
"""
# The negative half: a block that does the real acknowledgement must stay silent.
FIXTURE_ACKNOWLEDGED = """
## Composition-level invariants

- **Invariant 1 — Binding.** The record and its sealed Audit Trail event commit
  together or not at all — except that they do not: an appended event cannot be
  withdrawn, so the honest claim therefore splits into safety and liveness.
"""


# Q's synthetic pair, added when its class was half-landed and its corpus floor
# set began emptying — the same perishability that forced P's pins synthetic.
# Written as SINGLE LINES on purpose. The check's trigger is line-scoped (see the
# REBUILD_CLAUSE comment in lint.py), which is a documented recall gap, and these
# fixtures follow the corpus's actual convention rather than papering over it.
# The gap was found BY this fixture — the first draft wrapped across lines and did
# not fire — which is the argument for synthetic fixtures in miniature: a
# corpus-only test cannot show you a shape the corpus does not happen to contain.
FIXTURE_Q_UNBOUNDED = (
    "- **`thing_to_other`** — a map. **Contract classification: derived index.** "
    "*Rebuild procedure:* traverse the Audit Trail for `thing.happened` events "
    "and take `{a, b}` from each payload, so the binding facts are immutable "
    "audit content and the rebuild is total.\n"
)
FIXTURE_Q_BOUNDED = (
    "- **`thing_to_other`** — a map. **Contract classification: derived index.** "
    "*Rebuild procedure:* traverse the Audit Trail for `thing.happened` events "
    "and take `{a, b}` from each payload — bounded by the audit instance's "
    "horizon, past which the payload is destroyed and these entries are not "
    "rebuildable.\n"
)


def check_q_synthetic(problems: list[str]) -> None:
    """Q must fire on an unbounded payload-sourced rebuild and stay silent on one
    that states its bound. Neither case depends on any corpus file, so the guard
    survives the class closing — which is the state a closed class reaches."""
    for name, text, want_fire in (
        ("FIXTURE_Q_UNBOUNDED", FIXTURE_Q_UNBOUNDED, True),
        ("FIXTURE_Q_BOUNDED", FIXTURE_Q_BOUNDED, False),
    ):
        pat = Pattern(path=Path(f"synthetic/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        fired = bool(check_rebuild_bound({pat.path: pat}))
        if fired != want_fire:
            problems.append(
                f"Q-rebuild-bound: {name} expected "
                f"{'a firing' if want_fire else 'silence'} and got the opposite. "
                + ("The trigger has been narrowed past usefulness."
                   if want_fire else
                   "A bound marker no longer suppresses — or, worse, a marker was "
                   "added that signals care rather than stating the bound, which "
                   "is the P-atomic-audit `modulo` failure in a new place.")
            )


def check_synthetic(problems: list[str]) -> None:
    """The check must fire on a hedge-word decoy and stay silent on a real
    acknowledgement. Neither case depends on any corpus file."""
    for name, text, want_fire in (
        ("FIXTURE_MODULO_DECOY", FIXTURE_MODULO_DECOY, True),
        ("FIXTURE_ACKNOWLEDGED", FIXTURE_ACKNOWLEDGED, False),
    ):
        pat = Pattern(path=Path(f"synthetic/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        fired = bool(check_atomicity_over_audit({pat.path: pat}))
        if fired != want_fire:
            problems.append(
                f"P-atomic-audit: {name} expected "
                f"{'a firing' if want_fire else 'silence'} and got the opposite. "
                + ("A suppressor has gone generic — check what the block is being "
                   "credited with acknowledging; a hedge word is not an "
                   "acknowledgement." if want_fire else
                   "The check no longer recognizes a genuine safety-plus-liveness "
                   "restatement, so it now fires on patterns that did the right "
                   "thing.")
            )


# ── Corpus pins ───────────────────────────────────────────────────────────── #
# Pinned by SITE, not by file, and this distinction is the whole reason the
# entry exists. P's first draft treated the word "modulo" as an acknowledgement
# marker. Resolve a Person's Data Rights carries a modulo-clause about a
# DIFFERENT boundary — its irreversible purge precursor — and that clause then
# suppressed the finding on Invariant 1, which is the claim the corpus survey
# had routed the day before. The check went silent on the case that motivated
# it, and a file-level pin would not have shown it: the pattern still fired at
# three other sites, so the run looked healthy.
#
# Pinning a substring of the enclosing block survives renumbering, which line
# numbers do not.
# BOTH sites the regression silenced are pinned, and which two they are is the
# point. A hedge word like "modulo" clusters around a pattern's most careful
# claims, because those are the ones an author qualifies — so a hedge-word
# suppressor is not randomly lossy, it is biased toward silencing the findings
# that matter most. The two it dropped here are each their pattern's declared
# formal-model subject.
# Empty by design, and it should stay empty: both motivating sites are repaired.
# The regression they exposed is guarded by check_synthetic() above, which no
# fix can retire.
P_MOTIVATING_SITES: list[tuple[str, str]] = []
# CLOSED 2026-08-27 — Resolve a Person's Data Rights. Its Invariant 1 was the
# other motivating site, and it is now restated in safety-plus-liveness form, so
# the check is correctly silent there and the pin is retired rather than
# weakened. Retiring a pin is the only legitimate reason a positive disappears,
# and it belongs in the same change as the fix: a pin removed without the
# corresponding restatement is how a baseline quietly rots.
P_RETIRED_SITES = [
    ("resolve-a-persons-data-rights", "Invariant 1 — Request", "restated 2026-08-27"),
    ("capability-backed-sharing", "Invariant 2 — Disclosure-accountability",
     "protocol repair 2026-08-27 — the append moved out of the host transaction"),
    ("propagate-consent-revocation-downstream", "Invariant 3 — Revocation propagation",
     "restated 2026-08-27 — class closed; P promoted to gating"),
]

# ── P-atomic-audit ─────────────────────────────────────────────────────────── #
# Silent: the exemplar. Chain of Custody's Invariant 4 splits the claim into
# safety ("no *unsurfaced* orphan") and liveness (detection plus compensation),
# having first said that synchronous rollback is unavailable and the orphan
# state is therefore reachable. Nothing to flag.
P_SILENT = {"chain-of-custody"}
# Firing: the three routed instances (roadmap.md debt #19, pre-campaign survey).
# Resolve a Person's Data Rights was here until 2026-08-27; its four sites closed
# when Invariant 1 was restated (debt #19 step (iii), atomicity class). It must
# now stay OUT of this set — the `exact` comparison below turns that into a real
# assertion rather than a deletion, so a regression that reopened it would be
# reported as an unpinned firing.
# EMPTY, AND THAT IS THE ASSERTION. All three instances of the class closed on
# 2026-08-27 — Resolve a Person's Data Rights and Propagate Consent Revocation
# Downstream by restatement, Capability-Backed Sharing by protocol repair — and P
# now fires zero times corpus-wide, which is why it was promoted from advisory to
# gating in lint.py.
#
# The `exact` comparison below is what makes an empty set do work: ANY firing is
# now reported as an unpinned pattern, so a newly introduced instance fails this
# test rather than quietly joining a backlog. An empty pin set is not an absence
# of coverage here; the coverage moved to check_synthetic(), which does not depend
# on the corpus containing a broken pattern and therefore survives the class being
# clean — which is the state a closed class is supposed to reach.
P_FIRING: set[str] = set()

# ── Q-rebuild-bound ───────────────────────────────────────────────────────── #
# Silent: the exemplar. Audit Trail carries "Bound on the rebuild's totality,
# stated rather than assumed" and then states the bound and why it suffices —
# which is the right thing to do in the pattern that performs the destruction.
Q_SILENT = {"audit-trail"}
# The polarity false positive, pinned by SITE. Privileged Access Provisioning's
# `request_to_capability` rebuild reads the Capability store's own immutable
# records, not an event payload — it is outside this class. Q fired on it because
# the clause contains the phrase "audit event data" inside a sentence saying the
# raw token appears in NO audit event data: the check read a negation as an
# assertion. Fixed 2026-08-27 by the retention-horizon classification sweep.
#
# Pinned at the site rather than the file, and that distinction is the same one
# P-atomic-audit paid for: Privileged Access Provisioning has two OTHER genuine
# firings, so a file-level pin would pass whether or not this one is fixed, and
# the run would look healthy either way.
Q_NEGATED_SITES = [
    ("privileged-access-provisioning", "request_to_capability"),
]
# Firing: at least these. Not an exhaustive census — the check has a recorded
# recall gap (see the docblock in lint.py), so this set is a floor.
# Retired as their instances close (methodology debt #19, the retention-horizon
# class): Defensible Retention and Propagate Consent Revocation Downstream, both
# 2026-08-27. This is a FLOOR rather than an `exact` set, so a retirement is a
# deletion here — which is exactly the perishability that made P-atomic-audit's
# corpus pins untrustworthy, and Q will need the same synthetic treatment when
# its class closes and this set empties. Until then, keep the reason in the
# comment so a retirement cannot pass as a loosened check.
# EMPTY as of 2026-08-27: every site Q can see has been treated.
#
# THIS IS NOT THE CLASS CLOSING, and the distinction is the reason this comment
# exists rather than a promotion. Q's trigger keys on the literal
# `*Rebuild procedure:*` marker and is line-scoped (see lint.py), so it has a
# recorded recall gap — two known instances of this class are invisible to it:
# Preference-Aware Notification Fanout, found by the pre-campaign survey by
# reading, and Forensic Recovery's AP-F1, routed by a gate. **A check going
# silent measures the check's reach, not the corpus's health**, which is the same
# lesson the 2026-06-08 capability-provenance rescan taught when it found zero
# undeclared dependencies by sweeping the one surface the rule then named.
#
# So this set stays a floor rather than becoming `exact`, and Q stays advisory,
# until those two land. Promotion and the switch to `exact` happen together, as
# they did for P — at which point the synthetic fixtures above are what carries
# the regression coverage, since there will be no corpus positive left to pin.
Q_FIRING_AT_LEAST: set[str] = set()


def stems(findings) -> set[str]:
    return {f.path.stem for f in findings}


def _block_at(text: str, line: int) -> str:
    """The blank-line-delimited block containing a 1-indexed line."""
    lines = text.split("\n")
    i = max(0, line - 1)
    start = i
    while start > 0 and lines[start - 1].strip():
        start -= 1
    end = i
    while end + 1 < len(lines) and lines[end + 1].strip():
        end += 1
    return "\n".join(lines[start:end + 1])


def check_not_firing_at(patterns, findings, sites, code) -> list[str]:
    """A check must stay silent at these specific sites. Pinned by site, not by
    file, because a file with other genuine firings hides a site-level regression
    completely."""
    problems: list[str] = []
    for stem, marker in sites:
        pat = next((p for p in patterns.values() if p.path.stem == stem), None)
        if pat is None:
            continue
        for f in findings:
            if f.path.stem != stem:
                continue
            if marker in _block_at(pat.text, f.line):
                problems.append(
                    f"{code}: fires on the {stem} block containing {marker!r}, "
                    f"which is NOT an instance of this class — its rebuild reads a "
                    f"constituent's own records, and the phrase that matched sits "
                    f"inside a clause DENYING a payload read. The polarity guard "
                    f"has regressed; check what the match is being read as."
                )
    return problems


def check_motivating_sites(patterns, findings) -> list[str]:
    """P must fire on the specific blocks that motivated the check, not merely
    somewhere in those files."""
    problems: list[str] = []
    for stem, marker in P_MOTIVATING_SITES:
        pat = next((p for p in patterns.values() if p.path.stem == stem), None)
        hit = pat is not None and any(
            f.path.stem == stem and marker in _block_at(pat.text, f.line)
            for f in findings
        )
        if not hit:
            problems.append(
                f"P-atomic-audit: does not fire on the {stem} block containing "
                f"{marker!r} — one of the two cases the check was built for, and "
                f"that pattern's own formal-model subject. A suppressor has gone "
                f"generic again; check what the block is being credited with "
                f"acknowledging."
            )
    return problems


# --------------------------------------------------------------------------- #
# R-ledger synthetic fixtures — the grammar and the contradictions it refuses.
# One well-formed page must be silent; each malformed page must fire with the
# named code. None depends on any corpus file.
# --------------------------------------------------------------------------- #

def _ledger_page(status: str, ledger_status: str, open_lines: str,
                 decisions: str = "- **2026-08-26 — Title.** *Chose:* a. *Over:* b. *Because:* c.") -> str:
    return f"""# Synthetic

## Status

`{status}` — derived.

## Ledger

```
status: {ledger_status}
formal: verified — synthetic.tla + 1 twin, 2026-06-03
last gate: 2026-08-26 — fresh reader — clean

open:{open_lines}
```

## Decisions

{decisions}
"""


R_FIXTURES = [
    # name, page text, code expected (None = must be silent)
    ("R_CLEAN", _ledger_page(
        "partially resolved", "partially resolved",
        "\n- 2026-08-27-a · foundational · step 4 · x is unset → set it"), None),
    ("R_CLEAN_NONE", _ledger_page(
        "grounded on Final Critique 4 — 2026-06-04",
        "grounded on Final Critique 4 — 2026-06-04", " none"), None),
    ("R_GROUNDED_OPEN", _ledger_page(
        "grounded on Final Critique 4 — 2026-06-04",
        "grounded on Final Critique 4 — 2026-06-04",
        "\n- 2026-08-27-a · foundational · step 4 · x is unset → set it"),
     "R-ledger-grounded-open"),
    ("R_STATUS_MISMATCH", _ledger_page(
        "partially resolved", "grounded on Final Critique 4 — 2026-06-04", " none"),
     "R-ledger-status"),
    ("R_FOUR_FIELDS", _ledger_page(
        "partially resolved", "partially resolved",
        "\n- 2026-08-27-a · foundational · x is unset → set it"), "R-ledger-grammar"),
    ("R_NO_ARROW", _ledger_page(
        "partially resolved", "partially resolved",
        "\n- 2026-08-27-a · foundational · step 4 · x is unset, set it"), "R-ledger-grammar"),
    ("R_BAD_CLASS", _ledger_page(
        "partially resolved", "partially resolved",
        "\n- 2026-08-27-a · blocking · step 4 · x is unset → set it"), "R-ledger-grammar"),
    ("R_DUP_ID", _ledger_page(
        "partially resolved", "partially resolved",
        "\n- 2026-08-27-a · refining · step 4 · x → y\n- 2026-08-27-a · refining · step 5 · x → y"),
     "R-ledger-grammar"),
    ("R_GATE_ID", _ledger_page(
        "partially resolved", "partially resolved",
        "\n- FC7-F2 · foundational · step 4 · x is unset → set it"), "R-ledger-grammar"),
    ("R_EMPTY_OPEN", _ledger_page(
        "partially resolved", "partially resolved", ""), "R-ledger-grammar"),
    ("R_DECISION_FORM", _ledger_page(
        "partially resolved", "partially resolved", " none",
        decisions="- **2026-08-26 — Title.** We chose a because c."), "R-decisions-grammar"),
    ("R_DECISIONS_MISSING", _ledger_page(
        "partially resolved", "partially resolved", " none").split("## Decisions")[0],
     "R-decisions-missing"),
    ("R_LEDGER_MISSING", "# Synthetic\n\n## Status\n\n`partially resolved` — see the Ledger.\n",
     "R-ledger-missing"),
]


# ── S-recording-step / T-seal-key ─────────────────────────────────────────── #
# Landed 2026-08-29 ADVISORY, the day the rules they police were frozen in
# pressure-testing.md, so that every site the sweep closes is attributable to a
# rule that already covered it. Synthetic from the start — the lesson P paid for
# is that a corpus pin dies when the finding is fixed, and both of these are
# expected to be fixed within days. The corpus sets below are FLOORS recorded at
# landing; they shrink as the sweep runs and are switched to `exact` (and the
# codes removed from lint.py's ADVISORY_CODES) in the change that closes the last
# site.

_S_HEAD = "# Synthetic\n\n## Composes\n\n- [Audit Trail](../compositions/audit-trail.md)\n\n"

# fires: the substrate's arm transcribed bare, on the left of the arrow.
FIXTURE_S_BARE = _S_HEAD + (
    "3. `AuditTrail.record_action(...)` → `event_id`. Rejection mapping: "
    "`invalid-credential` → `rejected(invalid-credential)`; "
    "`recording-failure` → `rejected(recording-failure)`, the one retryable arm.\n"
)
# silent: the same mapping carrying the step.
FIXTURE_S_STEPPED = _S_HEAD + (
    "3. `AuditTrail.record_action(...)` → `event_id`. Rejection mapping: "
    "`invalid-credential` → `rejected(invalid-credential)`; "
    "`recording-failure(step)` → `rejected(recording-failure(step))` — on "
    "step-4 the event is appended; read the id back.\n"
)
# silent: a bare token that is NOT a transcription — the composition's own
# signature block naming its own code over a non-substrate write.
FIXTURE_S_SIGNATURE = _S_HEAD + (
    "- **[Confirm]** — (Projected contract: `confirm(token) → ok | "
    "rejected(not-known | recording-failure)`) — the journal refused.\n"
)
# silent: a composition that does not compose Audit Trail at all — nothing
# it maps can be the substrate's arm.
# silent: a bare token that is a PEER composition's own arm — Multi-Party
# Approval declares `recording-failure` bare at its boundary, so a composer
# mapping it is correct. The substrate call is absent from the line; that is
# the discriminator (found 2026-08-29 on Privileged Access Provisioning).
FIXTURE_S_PEER = _S_HEAD + (
    "3. `MultiPartyApproval.approve_step(actor_ref, credential, chain_id, step_id)` "
    "→ propagates `not-pending` unchanged; its `recording-failure` → "
    "`recording-failure` (the substrate's own recovery owns that partial).\n"
)
FIXTURE_S_NO_AUDIT = (
    "# Synthetic\n\n## Composes\n\n- [Journal](../atoms/journal.md)\n\n"
    "3. Map `recording-failure` → `rejected(recording-failure)`.\n"
)


def check_s_synthetic(problems: list[str]) -> None:
    for name, text, want_fire in (
        ("FIXTURE_S_BARE", FIXTURE_S_BARE, True),
        ("FIXTURE_S_STEPPED", FIXTURE_S_STEPPED, False),
        ("FIXTURE_S_SIGNATURE", FIXTURE_S_SIGNATURE, False),
        ("FIXTURE_S_NO_AUDIT", FIXTURE_S_NO_AUDIT, False),
        ("FIXTURE_S_PEER", FIXTURE_S_PEER, False),
    ):
        pat = Pattern(path=Path(f"synthetic/compositions/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        fired = bool(check_recording_step({pat.path: pat}))
        if fired != want_fire:
            problems.append(
                f"S-recording-step: {name} expected "
                f"{'a firing' if want_fire else 'silence'} and got the opposite."
            )


# fires: the map subscripted by an id; and the phrase form.
FIXTURE_T_SUBSCRIPT = (
    "5. `AuditTrail.verify_record(event_id, original_event_payloads[event_id])` "
    "→ record the outcome.\n"
)
FIXTURE_T_PHRASE = (
    "`original_event_payloads` is a map keyed by `entry_id` to the payload.\n"
)
# silent: the exemplar shape — keyed by sequence number, read over a range.
FIXTURE_T_POSITION = (
    "`original_event_payloads` is a map keyed by the audit log's "
    "**`sequence_number`** to the byte-exact payload; step 3c assembles "
    "`original_event_payloads[lo]` .. `original_event_payloads[hi]` and "
    "compares against `original_event_payloads[n]`.\n"
)


def check_t_synthetic(problems: list[str]) -> None:
    for name, text, want_fire in (
        ("FIXTURE_T_SUBSCRIPT", FIXTURE_T_SUBSCRIPT, True),
        ("FIXTURE_T_PHRASE", FIXTURE_T_PHRASE, True),
        ("FIXTURE_T_POSITION", FIXTURE_T_POSITION, False),
    ):
        pat = Pattern(path=Path(f"synthetic/compositions/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        fired = bool(check_seal_key({pat.path: pat}))
        if fired != want_fire:
            problems.append(
                f"T-seal-key: {name} expected "
                f"{'a firing' if want_fire else 'silence'} and got the opposite."
            )


# Corpus floors at landing (2026-08-29). Silent: the two exemplars the rules
# point authors at. Firing: the baseline the sweep is expected to empty.
S_SILENT = {"login", "chain-of-custody"}
# Retired as the sweep closes them (one line per retirement, with the date, so
# a retirement cannot pass as a loosened check): external-onboarding 2026-08-29;
# propagate-consent-revocation-downstream 2026-08-29; immutable-transaction-
# ledger 2026-08-29; privileged-access-provisioning 2026-08-29 (a false
# positive — the peer-arm case above — not a fix); capability-backed-sharing
# 2026-08-29; actor-suspension 2026-08-29.
# EMPTY as of 2026-08-29, when the last site closed. S was promoted to GATING
# in the same change and this set switched to `exact`; the regression coverage
# lives in check_s_synthetic(), which needs no corpus positive to exist.
S_FIRING: set[str] = set()
T_SILENT = {"chain-of-custody", "forensic-recovery"}
# EMPTY as of 2026-08-29, when Immutable Transaction Ledger's [Verify Ledger]
# was re-keyed by sequence_number — the one site the check ever saw. T was
# promoted to GATING in the same change and this set switched to `exact`, so
# any firing is reported as an unpinned pattern; the regression coverage lives
# in check_t_synthetic(), which needs no corpus positive to exist.
T_FIRING: set[str] = set()


# U-retry-bit — landed 2026-08-30 ADVISORY (pressure-testing.md §A composition's
# own rejection arm carries the retry bit, frozen the same day). Synthetic from
# the start, like S and T. The corpus set below is a FLOOR at landing and is
# switched to `exact` in the change that closes the last site.
_U_HEAD = ("# Synthetic\n\n## Composes\n\n- [Audit Trail](../compositions/audit-trail.md)"
           "\n\n#### `do_thing`\n\n")
# fires: one bare token before the commit (step 2) and one after it (step 4).
FIXTURE_U_STRADDLE = _U_HEAD + (
    "1. Validate. Failure → `rejected(invalid-request)`. Stop.\n"
    "2. `AuditTrail.record_action(...)` → `event_id`; `recording-failure(step-2 | step-3)` "
    "→ `rejected(recording-failure)`. Stop.\n"
    "3. `Store.commit(record_id, now)` → `committed`.\n"
    "4. `AuditTrail.record_action(...)` → `event_id`; `recording-failure(step-2 | step-3)` "
    "→ `rejected(recording-failure)`; the orphan is the scan's.\n"
)
# silent: the same two landings carrying the position.
FIXTURE_U_POSITIONED = _U_HEAD + (
    "1. Validate. Failure → `rejected(invalid-request)`. Stop.\n"
    "2. `AuditTrail.record_action(...)` → `event_id`; `recording-failure(step-2 | step-3)` "
    "→ `rejected(recording-failure(intent))`. Stop.\n"
    "3. `Store.commit(record_id, now)` → `committed`.\n"
    "4. `AuditTrail.record_action(...)` → `event_id`; `recording-failure(step-2 | step-3)` "
    "→ `rejected(recording-failure(outcome))`; the orphan is the scan's.\n"
)
# silent: two bare landings, both before the commit — one disposition.
FIXTURE_U_BOTH_BEFORE = _U_HEAD + (
    "1. `Store.read(record_id)` → record; absent → `rejected(not-known)`.\n"
    "2. `AuditTrail.record_action(...)` → `event_id`; `recording-failure(step-2 | step-3)` "
    "→ `rejected(recording-failure)`. Stop.\n"
    "3. `AuditTrail.record_action(...)` → `event_id`; `recording-failure(step-2 | step-3)` "
    "→ `rejected(recording-failure)`. Stop.\n"
    "4. `Store.commit(record_id, now)` → `committed`.\n"
)


def check_u_synthetic(problems: list[str]) -> None:
    for name, text, want_fire in (
        ("FIXTURE_U_STRADDLE", FIXTURE_U_STRADDLE, True),
        ("FIXTURE_U_POSITIONED", FIXTURE_U_POSITIONED, False),
        ("FIXTURE_U_BOTH_BEFORE", FIXTURE_U_BOTH_BEFORE, False),
    ):
        pat = Pattern(path=Path(f"synthetic/compositions/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        fired = bool(check_retry_bit({pat.path: pat}))
        if fired != want_fire:
            problems.append(
                f"U-retry-bit: {name} expected "
                f"{'a firing' if want_fire else 'silence'} and got the opposite."
            )


# Corpus floor at landing (2026-08-30): the ten actions across five patterns
# the survey measured. Silent: Login and Defensible Retention, whose actions
# already carry the position at their boundary.
U_SILENT = {"login", "defensible-retention"}
# Retired as the sweep closes them (one line per retirement, with the date):
# chain-of-custody 2026-08-30; forensic-recovery 2026-08-30;
# immutable-transaction-ledger 2026-08-30; capability-backed-sharing
# 2026-08-30; customer-onboarding 2026-08-30.
# EMPTY as of 2026-08-30, when the last site closed. U was promoted to GATING
# in the same change and this set switched to `exact`; the regression coverage
# lives in check_u_synthetic(), which needs no corpus positive to exist.
U_FIRING: set[str] = set()


def check_r_synthetic(problems: list[str]) -> None:
    for name, text, want in R_FIXTURES:
        pat = Pattern(path=Path(f"synthetic/{name}.md"), text=text,
                      invariant_count=1, grounded=False)
        codes = {f.code for f in check_ledger({pat.path: pat})}
        if want is None and codes:
            problems.append(f"R-ledger: {name} should be silent; fired {sorted(codes)}")
        elif want is not None and want not in codes:
            problems.append(f"R-ledger: {name} should fire {want}; got {sorted(codes) or 'nothing'}")


def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path(__file__).resolve().parents[2]
    patterns = load_patterns(root)

    failures: list[str] = []
    for code, fn, silent, firing, exact in (
        ("P-atomic-audit", check_atomicity_over_audit, P_SILENT, P_FIRING, True),
        # `exact` since 2026-08-27, when the class closed and Q was promoted to
        # gating: with an empty pin set, exactness is what makes the emptiness an
        # assertion — any firing is reported as an unpinned pattern rather than
        # quietly joining a backlog. The regression coverage lives in
        # check_q_synthetic(), which needs no corpus positive to exist.
        ("Q-rebuild-bound", check_rebuild_bound, Q_SILENT, Q_FIRING_AT_LEAST, True),
        # Both exact since 2026-08-29, when the sweep emptied them (see the S/T block).
        ("S-recording-step", check_recording_step, S_SILENT, S_FIRING, True),
        ("T-seal-key", check_seal_key, T_SILENT, T_FIRING, True),
        # Exact since 2026-08-30, the day it landed, when the sweep emptied it.
        ("U-retry-bit", check_retry_bit, U_SILENT, U_FIRING, True),
    ):
        got = stems(fn(patterns))
        for s in sorted(silent):
            if s in got:
                failures.append(
                    f"{code}: fired on {s}, which is the exemplar this check's own "
                    f"message points authors at — the check has lost precision"
                )
        missing = sorted(firing - got)
        if missing:
            failures.append(
                f"{code}: did not fire on {', '.join(missing)} — either the check "
                f"was loosened past usefulness, or the finding closed and this "
                f"file was not updated"
            )
        if exact:
            extra = sorted(got - firing)
            if extra:
                failures.append(
                    f"{code}: fired on unpinned pattern(s) {', '.join(extra)} — "
                    f"a genuinely new instance (route it, then pin it here) or a "
                    f"false positive (tighten the check)"
                )
        print(f"{code}: {len(got)} pattern(s) firing — {', '.join(sorted(got)) or 'none'}")
        if code == "Q-rebuild-bound":
            problems = check_not_firing_at(patterns, fn(patterns),
                                           Q_NEGATED_SITES, code)
            check_q_synthetic(problems)
            failures.extend(problems)
            if not problems:
                for stem, marker in Q_NEGATED_SITES:
                    print(f"{code}: polarity site silent — {stem} / {marker!r} \u2713")
                print(f"{code}: synthetic fixtures hold "
                      f"(unbounded rebuild fires, bounded one silent) \u2713")
        if code == "P-atomic-audit":
            problems = check_motivating_sites(patterns, fn(patterns))
            check_synthetic(problems)
            failures.extend(problems)
            if not problems:
                print(f"{code}: synthetic regression fixtures hold "
                      f"(hedge-word decoy fires, real acknowledgement silent) ✓")
            if not problems:
                for stem, marker in P_MOTIVATING_SITES:
                    print(f"{code}: motivating site pinned — {stem} / {marker!r} ✓")

    st_problems: list[str] = []
    check_s_synthetic(st_problems)
    check_t_synthetic(st_problems)
    check_u_synthetic(st_problems)
    failures.extend(st_problems)
    if not st_problems:
        print("S-recording-step / T-seal-key / U-retry-bit: synthetic fixtures hold "
              "(bare substrate mapping fires; stepped mapping, own-code "
              "signature and peer arm silent; id-keyed map fires, "
              "position-keyed map silent; straddling bare landings fire, "
              "positioned and same-side landings silent) \u2713")

    r_problems: list[str] = []
    check_r_synthetic(r_problems)
    failures.extend(r_problems)
    if not r_problems:
        print(f"R-ledger: {len(R_FIXTURES)} synthetic fixtures hold "
              f"(two clean pages silent, eleven malformed pages fire their code) \u2713")

    for f in failures:
        print(f"FAIL  {f}", file=sys.stderr)
    print(
        f"\n— {'all pinned expectations hold' if not failures else str(len(failures)) + ' pinned expectation(s) broken'}",
        file=sys.stderr,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
