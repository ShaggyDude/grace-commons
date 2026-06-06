// app/audit/verify/page.tsx — GET /audit/verify. Full hash-chain recompute (the
// no-JS counterpart to the VerifyChip). C14-gated on view_audit. Reads only
// (verifyChain recomputes; it appends nothing).
import type { Metadata } from "next";
import { db } from "@/lib/db.ts";
import * as eventLog from "@/domain/event_log.ts";
import { currentUser } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";
import { Shell } from "@/components/Shell.tsx";
import { Forbidden } from "@/components/Forbidden.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chain Verification" };

const GATE = ["view_audit"];

export default async function AuditVerifyPage() {
  const { ctx } = await currentUser();
  const displayName = ctx.actor!.display_name ?? null;

  if (!(await permit(ctx, GATE))) {
    return (
      <Shell displayName={displayName} active="audit">
        <Forbidden codes={GATE} />
      </Shell>
    );
  }

  const result = await eventLog.verifyChain(db);

  return (
    <Shell displayName={displayName} active="audit">
      <div className="mb-6">
        <a href="/audit" className="text-sm opacity-50 hover:opacity-100">
          ← Audit Trail
        </a>
      </div>

      <h1 className="text-2xl font-semibold mb-6">Hash Chain Verification</h1>

      {result.ok ? (
        <div className="raised rounded border-green-300 p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">✓</span>
            <h2 className="text-lg font-semibold text-green-700">Chain intact</h2>
          </div>
          <p className="text-sm text-green-700">
            All <strong>{result.count}</strong> event{result.count !== 1 && "s"} verified. No tampering
            detected.
          </p>
          <p className="text-xs text-green-600 mt-3">
            Every row&apos;s <code className="bg-black/5 px-1 rounded">this_hash</code> matches the
            SHA-256 of its canonical JSON — including{" "}
            <code className="bg-black/5 px-1 rounded">prev_hash</code> — forming an unbroken chain from
            event #1.
          </p>
        </div>
      ) : (
        <div className="raised rounded border-red-300 p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">✗</span>
            <h2 className="text-lg font-semibold text-red-700">Tampering detected</h2>
          </div>
          <p className="text-sm text-red-700 mb-4">
            Hash mismatch at event <strong>#{result.at}</strong>.
          </p>
          <dl className="text-xs font-mono space-y-2">
            <div>
              <dt className="text-red-500 font-sans font-medium mb-0.5">Expected (recomputed)</dt>
              <dd className="bg-black/5 rounded px-2 py-1 break-all">{result.expected}</dd>
            </div>
            <div>
              <dt className="text-red-500 font-sans font-medium mb-0.5">Found (stored)</dt>
              <dd className="bg-black/5 rounded px-2 py-1 break-all">{result.found}</dd>
            </div>
          </dl>
          <p className="text-xs text-red-600 mt-4">
            A row at or before event #{result.at} was modified after insertion. The chain is broken from
            this point forward. This finding must be escalated per 21 CFR Part 11 §11.10(e).
          </p>
        </div>
      )}
    </Shell>
  );
}
