// Reusable JSX fragments used across page and HTMX fragment responses.
//
// StatePill      — inline state badge (Pending/Approved/Rejected/Withdrawn)
// StepRow        — <tr> for a single approval step, with HTMX action buttons
// ChainBanner    — header card showing chain state + quorum; oob=true adds
//                  hx-swap-oob for out-of-band HTMX updates
// VerifyChip     — tiny pass/fail badge returned by audit verify endpoints

import type { FC } from "hono/jsx";
import type { ChainView, StepView } from "../domain/chain.ts";
import type { Actor } from "../domain/actor.ts";

// ---------------------------------------------------------------------------
// StatePill
// ---------------------------------------------------------------------------

export function StatePill({ state }: { state: string }) {
  const map: Record<string, string> = {
    Pending:   "bg-ink-gray-100 text-ink-gray-600",
    Approved:  "bg-green-100 text-green-700",
    Rejected:  "bg-red-100 text-red-700",
    Withdrawn: "bg-amber-100 text-amber-700",
  };
  const cls = map[state] ?? "bg-ink-gray-100 text-ink-gray-500";
  return (
    <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {state}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StepRow — renders as <tr id="step-{step_id}"> so HTMX can outerHTML-swap it
// ---------------------------------------------------------------------------

type StepRowProps = { step: StepView; actor: Actor | null };

export const StepRow: FC<StepRowProps> = ({ step, actor }) => {
  const isApprover  = actor?.actor_ref === step.approver_ref;
  const isSubmitter = actor?.actor_ref === step.submitter_ref;
  const canDecide   = step.state === "Pending" && isApprover;
  const canWithdraw = step.state === "Pending" && isSubmitter && !isApprover;

  const approveUrl  = `/chains/${step.chain_id}/steps/${step.step_id}/approve`;
  const rejectUrl   = `/chains/${step.chain_id}/steps/${step.step_id}/reject`;
  const withdrawUrl = `/chains/${step.chain_id}/steps/${step.step_id}/withdraw`;
  const hxTarget    = `#step-${step.step_id}`;

  return (
    <tr id={`step-${step.step_id}`} class="border-b last:border-0">
      {/* # */}
      <td class="py-3 px-4 text-sm text-ink-gray-400 w-8 shrink-0">{step.position + 1}</td>

      {/* Approver */}
      <td class="py-3 px-4 text-sm font-medium text-ink-gray-800">{step.approver_display_name}</td>

      {/* Submitted */}
      <td class="py-3 px-4 text-sm text-ink-gray-400">{step.submitted_at.slice(0, 10)}</td>

      {/* State */}
      <td class="py-3 px-4">
        <StatePill state={step.state} />
        {step.decision_reason && (
          <p class="mt-1 text-xs text-ink-gray-400 italic max-w-xs truncate"
            title={step.decision_reason}>
            {step.decision_reason}
          </p>
        )}
      </td>

      {/* Actions / decided-by */}
      <td class="py-3 px-4">
        {step.state !== "Pending" ? (
          <span class="text-xs text-ink-gray-400">
            {step.decided_by}{step.decided_at ? ` · ${step.decided_at.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span class="flex items-center gap-1 flex-wrap">
            {/* Approve */}
            {canDecide && (
              // deno-lint-ignore no-explicit-any
              <form {...{"hx-post": approveUrl, "hx-target": hxTarget, "hx-swap": "outerHTML"} as any}
                class="inline">
                <button type="submit"
                  class="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer">
                  Approve
                </button>
              </form>
            )}

            {/* Reject */}
            {canDecide && (
              <details class="relative inline-block">
                <summary class="px-2 py-1 text-xs bg-red-100 text-red-700 rounded cursor-pointer hover:bg-red-200 list-none">
                  Reject
                </summary>
                <div class="absolute left-0 top-full z-10 mt-1 bg-ink-gray-0 border rounded shadow-lg p-3 w-56">
                  {/* deno-lint-ignore no-explicit-any */}
                  <form {...{"hx-post": rejectUrl, "hx-target": hxTarget, "hx-swap": "outerHTML"} as any}>
                    <input type="text" name="reason" required placeholder="Reason (required)"
                      class="w-full border rounded px-2 py-1 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-ink-gray-300" />
                    <button type="submit"
                      class="w-full px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer">
                      Confirm reject
                    </button>
                  </form>
                </div>
              </details>
            )}

            {/* Withdraw (approver withdrawing own step OR submitter withdrawing) */}
            {(canDecide || canWithdraw) && (
              <details class="relative inline-block">
                <summary class="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded cursor-pointer hover:bg-amber-200 list-none">
                  Withdraw
                </summary>
                <div class="absolute left-0 top-full z-10 mt-1 bg-ink-gray-0 border rounded shadow-lg p-3 w-56">
                  {/* deno-lint-ignore no-explicit-any */}
                  <form {...{"hx-post": withdrawUrl, "hx-target": hxTarget, "hx-swap": "outerHTML"} as any}>
                    <input type="text" name="reason" required placeholder="Reason (required)"
                      class="w-full border rounded px-2 py-1 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-ink-gray-300" />
                    <button type="submit"
                      class="w-full px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 cursor-pointer">
                      Confirm withdraw
                    </button>
                  </form>
                </div>
              </details>
            )}
          </span>
        )}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// ChainBanner — header card; pass oob=true for HTMX out-of-band swap
// ---------------------------------------------------------------------------

type ChainBannerProps = { chain: ChainView; actor: Actor | null; oob?: boolean };

export const ChainBanner: FC<ChainBannerProps> = ({ chain, actor, oob }) => {
  const n = chain.steps.length;
  const quorumLabel =
    chain.quorum_kind === "M-of-N"   ? `${chain.quorum_m}-of-${n}` :
    chain.quorum_kind === "one-of-N" ? `1-of-${n}` :
    `all-${n}`;

  const canWithdraw = chain.state === "Pending" && actor?.actor_ref === chain.initiator_ref;

  // deno-lint-ignore no-explicit-any
  const oobProp = oob ? { "hx-swap-oob": "true" } as any : {};

  return (
    <div id={`chain-banner-${chain.chain_id}`} {...oobProp}
      class="bg-ink-gray-0 border rounded-lg p-4 mb-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-3 mb-1 flex-wrap">
            <h2 class="text-lg font-semibold text-ink-gray-800">{chain.subject_ref}</h2>
            <StatePill state={chain.state} />
          </div>
          <p class="text-sm text-ink-gray-500">
            <span class="font-medium">Scope:</span> {chain.scope}
            {" · "}
            <span class="font-medium">Quorum:</span> {quorumLabel}
            {" · "}
            <span class="font-medium">By:</span> {chain.initiator_display_name}
            {chain.initiated_at && (
              <> · <span class="text-ink-gray-400">{chain.initiated_at.slice(0, 10)}</span></>
            )}
          </p>
          {chain.terminal_reason && (
            <p class="mt-1 text-xs text-ink-gray-400 italic">{chain.terminal_reason}</p>
          )}
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <a href={`/verify/chains/${chain.chain_id}`} target="_blank"
            class="text-xs text-blue-400 hover:text-blue-600">
            Verify ↗
          </a>
          {canWithdraw && (
            <details class="relative">
              <summary class="px-3 py-1 text-xs bg-amber-100 text-amber-700 rounded cursor-pointer hover:bg-amber-200 list-none">
                Withdraw chain
              </summary>
              <div class="absolute right-0 top-full z-10 mt-1 bg-ink-gray-0 border rounded shadow-lg p-3 w-64">
                <p class="text-xs text-ink-gray-500 mb-2">
                  Withdraws the chain and cascades to all pending steps.
                </p>
                <form method="post" action={`/chains/${chain.chain_id}/withdraw`}>
                  <input type="text" name="reason" required placeholder="Reason (required)"
                    class="w-full border rounded px-2 py-1 text-xs mb-2 focus:outline-none" />
                  <button type="submit"
                    class="w-full px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 cursor-pointer">
                    Confirm withdrawal
                  </button>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// VerifyChip — returned inline by audit verify endpoints
// ---------------------------------------------------------------------------

export const VerifyChip: FC<{ ok: boolean }> = ({ ok }) => {
  const cls = ok
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
  return (
    <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {ok ? "✓ verified" : "✗ tampered"}
    </span>
  );
};
