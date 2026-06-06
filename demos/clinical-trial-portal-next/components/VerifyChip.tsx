"use client";
// components/VerifyChip.tsx — the live "running verdict" island (BUILD_PLAN §7.5).
// Recomputes the hash chain via a server action and swaps the result in place,
// without leaving the page. The full /audit/verify report stays available for a
// no-JS path.
import { useState, useTransition } from "react";
import { verifyChainAction, type VerifyResult } from "../app/audit/actions.ts";

export function VerifyChip() {
  const [result, setResult] = useState<VerifyResult | { error: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => start(async () => setResult(await verifyChainAction()))}
        disabled={pending}
        className="text-sm border rounded px-3 py-1.5 hover:bg-black/5 disabled:opacity-50"
      >
        {pending ? "Verifying…" : "Verify chain"}
      </button>

      {result &&
        ("error" in result ? (
          <span className="text-xs text-red-600">{result.error}</span>
        ) : result.ok ? (
          <span className="text-xs font-medium text-green-700">✓ Verified {result.count} events</span>
        ) : (
          <span className="text-xs font-medium text-red-700">✗ Mismatch at #{result.at}</span>
        ))}
    </span>
  );
}
