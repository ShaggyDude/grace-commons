# CORNERS — clinical-trial-portal

> Implementation-side follow-up tracker per the CLAUDE.md "implementation-discovered findings" discipline. Items here are *preferences* (cleaner-if, nice-to-have, demo-quality polish) — not contradictions inside the Grace Commons spec layer. Spec-layer findings go in the relevant atom or composition's Lineage notes, not here.

## Open

- **Seed a stale-by-design audit event row.** All currently-seeded events are recent, so the Part 11 retention display filter (`enforce_on_read = 1` by default) has zero visible effect on the demo walkthrough. To make the filter demonstrable — "click 'show all', see N additional older events appear" — seed at least one event with a backdated `occurred_at` older than 2555 days ago. The CRA walkthrough then has a concrete moment where the filter does something the viewer can see. Surfaced 2026-05-26 alongside the default-ON / "show all" relabel.

- **Delivery-status persistence on invitations.** Today there is no DB column recording whether a given invitation's email actually sent — only the in-memory `DeliveryResult` and the route handler's stderr log on failure. Would need a migration (e.g., `email_status`, `email_sent_at`, `email_failed_at` on `invitations`), a composition update to write the status after the mailer returns, schema notes in the Grace Commons Invitation atom spec, plus tests. Worth doing for production-grade trials deployments; deferred from the grant-deadline demo. Surfaced 2026-05-26 in the Phase 7 email-flow review.

- **Invitation flash + post-acceptance UX gaps.** Observed during end-to-end smoke: flash copy is functional but plain; the surfaced-invite-link block on `/people` could be more obviously copyable; the post-acceptance flow (after the invitee sets their password) drops into the generic dashboard with no orientation. Pre-grant: sufficient. Post-grant: a polish pass on these three surfaces would noticeably lift demo quality. Surfaced 2026-05-26.

- **Switch from SMTP to Resend's native API.** SMTP is the right portable default for the demo (any provider works), but the Resend native API gives nicer error handling, idempotency keys, and per-send analytics. ~20-line change in `lib/mailer.ts` (`resend.emails.send(...)` instead of `transporter.sendMail(...)`); no schema or route surface change. Deferred from the grant demo. Surfaced 2026-05-26.

- **Tailwind v4 `@utility inks-*` refactor.** The 26 explicit `.inks-{family}-{level}` wiring rules added to `styles/inkset.css` could collapse to a single `@utility inks-* { --bg: --value(--inks-*-bg); --fg: --value(--inks-*-fg); }` block — IF Tailwind v4's wildcard substitution handles multi-segment names like `gray-900` correctly. Verify the substitution syntax, refactor, confirm `inks-gray-900` still picks up the right colors. If it works, gives the design system forward-compatibility (new color families just need their `--inks-{name}-*-bg/fg` pairs defined). Surfaced 2026-05-26 alongside the explicit-rules fix.

- **Subshell orphan watcher on abnormal start exit.** `deno task start` and `deno task dev` both use the `(A & B)` subshell pattern to run the CSS watcher alongside the server. Ctrl-C kills both cleanly; if the foreground process *crashes* abnormally, the background CSS watcher can survive as an orphan and hold the file watcher. `pkill -f tailwindcss` clears it. Worth adding `trap 'kill 0' INT TERM` to both tasks for robust shutdown; deferred because it has not actually bitten in practice yet. Surfaced 2026-05-26.

- **Audit-list retention notice copy pass.** The visible text "Retention window: 2555 days (FDA 21 CFR Part 11 minimum) · display filter: ON" is clearer than the previous wording but could be tightened further — e.g., make "FDA 21 CFR Part 11 minimum" itself the tooltip trigger rather than parenthetical body text, so the line reads as a single scannable status. Tooltips currently carry the load; the visible line could carry more. Surfaced 2026-05-26.

## Convention

Each entry: short name, what's missing or could be better, what closing it would cost, why it was deferred, date surfaced. New entries land at the top of Open. Close entries by deleting them (the git log preserves history; no Closed section needed).
