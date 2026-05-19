import type { FC } from "hono/jsx";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

export type InvariantCheck = {
  name: string; // Alloy assertion name
  description: string;
  ok: boolean;
  detail?: string;
};

export type VerifyPageData = {
  checks: InvariantCheck[];
  overall: boolean;
  grant_count: number;
  orphan_count: number;
  evaluated_at: string;
};

type Props = {
  data: VerifyPageData;
  currentActor: Actor | null;
  actors: Actor[];
};

export const VerifyPage: FC<Props> = ({ data, currentActor, actors }) => (
  <Layout title="Verify — APA Demo" currentActor={currentActor} actors={actors}>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl">Invariant verification</h1>
      <span
        class={`inline-block px-3 py-1 rounded font-medium text-sm ${
          data.overall
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}
      >
        {data.overall ? "All checks pass" : "Check failed"}
      </span>
    </div>

    <p class="text-sm text-ink-gray-500 mb-2">
      Each check below corresponds to a named assertion in{" "}
      <code class="font-mono text-xs bg-ink-gray-100 px-1 rounded">
        alloy/attributed-permissions-admin.als
      </code>
      . The Alloy model verifies these properties hold for all reachable states
      within its scope; this page verifies they hold over the current database
      state.
    </p>
    <p class="text-xs text-ink-gray-400 mb-8">
      Evaluated over {data.grant_count} grants and {data.orphan_count} orphan
      log entries at {data.evaluated_at.slice(0, 19).replace("T", " ")} UTC.
    </p>

    <b class="space-y-2 text-sm">
      {data.checks.map((c) => (
        <b
          key={c.name}
          class={`rounded p-6${
            c.ok ? " inks-sage-100 space-y-2" : "border-red-200 bg-red-50"
          }`}
        >
          <b class="space-x-2">
            <s class="opacity-50">{c.ok ? "✓" : "✗"}</s>
            <s>{c.name}</s>
          </b>
          <p class="text-inks-gray-500">{c.description}</p>
          {c.detail && <p class="">{c.detail}</p>}
        </b>
      ))}
    </b>

    <div class="mt-8 pt-6 border-t border-ink-gray-200">
      <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">
        Alloy model
      </h2>
      <p class="text-sm text-ink-gray-600">
        The formal model at{" "}
        <code class="font-mono text-xs bg-ink-gray-100 px-1 rounded">
          alloy/attributed-permissions-admin.als
        </code>{" "}
        contains 4 static structural checks and 6 dynamic LTL checks. Run with
        the Alloy Analyzer (v6) to reproduce the model-level verification. The
        three checks that intentionally produce counterexamples before Invariant
        7 is added as a fact are documented in{" "}
        <code class="font-mono text-xs bg-ink-gray-100 px-1 rounded">
          CORNERS.md
        </code>
        .
      </p>
    </div>
  </Layout>
);
