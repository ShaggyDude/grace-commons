import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";
import type { Actor } from "../lib/db.ts";

export type VerifyResult =
  | { ok: true; count: number }
  | { ok: false; at: number; expected: string; found: string };

export const AuditVerifyPage: FC<{
  actor: Actor;
  result: VerifyResult;
}> = ({ actor, result }) => (
  <Layout title="Chain Verification" actor={actor}>
    <div class="mb-6">
      <a href="/audit" class="text-sm text-gray-500 hover:text-gray-700">← Audit Trail</a>
    </div>

    <h1 class="text-2xl font-semibold mb-6">Hash Chain Verification</h1>

    {result.ok
      ? (
        <div class="border rounded bg-green-50 border-green-200 p-6">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">✓</span>
            <h2 class="text-lg font-semibold text-green-800">Chain intact</h2>
          </div>
          <p class="text-sm text-green-700">
            All <strong>{result.count}</strong> event{result.count !== 1 && "s"} verified.
            No tampering detected.
          </p>
          <p class="text-xs text-green-600 mt-3">
            Every row's <code class="bg-green-100 px-1 rounded">this_hash</code> matches the
            SHA-256 of its canonical JSON — including{" "}
            <code class="bg-green-100 px-1 rounded">prev_hash</code> — forming an unbroken chain
            from event #1.
          </p>
        </div>
      )
      : (
        <div class="border rounded bg-red-50 border-red-200 p-6">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">✗</span>
            <h2 class="text-lg font-semibold text-red-800">Tampering detected</h2>
          </div>
          <p class="text-sm text-red-700 mb-4">
            Hash mismatch at event <strong>#{result.at}</strong>.
          </p>
          <dl class="text-xs font-mono space-y-2">
            <div>
              <dt class="text-red-500 font-sans font-medium mb-0.5">Expected (recomputed)</dt>
              <dd class="bg-red-100 rounded px-2 py-1 break-all">{result.expected}</dd>
            </div>
            <div>
              <dt class="text-red-500 font-sans font-medium mb-0.5">Found (stored)</dt>
              <dd class="bg-red-100 rounded px-2 py-1 break-all">{result.found}</dd>
            </div>
          </dl>
          <p class="text-xs text-red-600 mt-4">
            A row at or before event #{result.at} was modified after insertion.
            The chain is broken from this point forward. This finding must be
            escalated per 21 CFR Part 11 §11.10(e).
          </p>
        </div>
      )}
  </Layout>
);
