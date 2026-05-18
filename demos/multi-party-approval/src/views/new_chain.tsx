// New chain form — POST /chains (form-encoded; chains.ts redirects to detail on success).

import type { FC } from "hono/jsx";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

type NewChainPageProps = {
  actor: Actor | null;
  actors: Actor[];
  error?: string;
};

export const NewChainPage: FC<NewChainPageProps> = ({ actor, actors, error }) => {
  const humanActors = actors.filter((a) => a.kind === "human");

  return (
    <Layout title="New chain — Grace Commons" currentActor={actor} actors={actors}>
      <div class="mb-4">
        <a href="/" class="text-sm text-ink-gray-400 hover:text-ink-gray-600">← Chains</a>
      </div>

      <div class="max-w-xl">
        <h1 class="text-xl font-semibold text-ink-gray-800 mb-6">Initiate approval chain</h1>

        {error && (
          <div class="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <form method="post" action="/chains" class="space-y-5">
          {/* Subject ref */}
          <div>
            <label class="block text-sm font-medium text-ink-gray-700 mb-1">Subject ref</label>
            <input type="text" name="subject_ref" required
              placeholder="e.g. protocol-amendment-v3.0"
              class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink-gray-400" />
            <p class="mt-1 text-xs text-ink-gray-400">Identifier for what is being approved.</p>
          </div>

          {/* Scope */}
          <div>
            <label class="block text-sm font-medium text-ink-gray-700 mb-1">Scope</label>
            <input type="text" name="scope" required
              placeholder="e.g. sox-annual-close"
              class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink-gray-400" />
          </div>

          {/* Quorum rule */}
          <div>
            <label class="block text-sm font-medium text-ink-gray-700 mb-1">Quorum rule</label>
            <select name="quorum_kind" id="quorum_kind"
              class="w-full border rounded px-3 py-2 text-sm bg-ink-gray-0 focus:outline-none focus:ring-1 focus:ring-ink-gray-400">
              <option value="all-of-N">all-of-N — unanimous approval required</option>
              <option value="M-of-N">M-of-N — threshold (set M below)</option>
              <option value="one-of-N">one-of-N — any single approver</option>
            </select>
          </div>

          {/* M field (only for M-of-N) */}
          <div id="m-field" style="display:none">
            <label class="block text-sm font-medium text-ink-gray-700 mb-1">M (threshold)</label>
            <input type="number" name="m" min="1" id="m-input"
              class="w-28 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink-gray-400" />
          </div>

          {/* Approvers */}
          <div>
            <label class="block text-sm font-medium text-ink-gray-700 mb-2">Approvers</label>
            {humanActors.length === 0 ? (
              <p class="text-sm text-ink-gray-400 italic">No human actors available.</p>
            ) : (
              <div class="space-y-2 border rounded p-3 bg-ink-gray-50">
                {humanActors.map((a) => (
                  <label class="flex items-center gap-3 text-sm text-ink-gray-700 cursor-pointer">
                    <input type="checkbox" name="approver_set" value={a.actor_ref}
                      class="rounded focus:ring-1 focus:ring-ink-gray-400" />
                    <span class="font-medium">{a.display_name}</span>
                    <code class="text-xs text-ink-gray-400 font-mono">{a.actor_ref}</code>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label class="block text-sm font-medium text-ink-gray-700 mb-1">
              Reason{" "}
              <span class="text-ink-gray-400 font-normal">(optional)</span>
            </label>
            <textarea name="reason" rows={2}
              placeholder="Context for approvers"
              class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink-gray-400" />
          </div>

          {/* Retention policy */}
          <div>
            <label class="block text-sm font-medium text-ink-gray-700 mb-1">
              Retention policy{" "}
              <span class="text-ink-gray-400 font-normal">(optional)</span>
            </label>
            <select name="retention_policy"
              class="w-full border rounded px-3 py-2 text-sm bg-ink-gray-0 focus:outline-none focus:ring-1 focus:ring-ink-gray-400">
              <option value="">Default</option>
              <option value="sox_7_year">SOX — 7-year</option>
              <option value="fda_part_11_predicate_rule">FDA Part 11</option>
              <option value="ich_e6_tmf">ICH E6 TMF</option>
            </select>
          </div>

          <div class="pt-2">
            <button type="submit"
              class="px-6 py-2 bg-ink-gray-800 text-ink-gray-0 text-sm rounded hover:bg-ink-gray-700 cursor-pointer">
              Initiate chain
            </button>
          </div>
        </form>
      </div>

      {/* Show/hide M field based on quorum_kind selection */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var sel = document.getElementById('quorum_kind');
          var mField = document.getElementById('m-field');
          var mInput = document.getElementById('m-input');
          function toggle() {
            var show = sel.value === 'M-of-N';
            mField.style.display = show ? '' : 'none';
            if (show) mInput.required = true;
            else { mInput.required = false; mInput.value = ''; }
          }
          sel.addEventListener('change', toggle);
          toggle();
        })();
      `}} />
    </Layout>
  );
};
