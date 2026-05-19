import type { FC } from "hono/jsx";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

type Props = {
  currentActor: Actor | null;
  actors: Actor[];
  error?: string;
};

export const NewGrant: FC<Props> = ({ currentActor, actors, error }) => (
  <Layout title="Issue grant — APA Demo" currentActor={currentActor} actors={actors} path="/grants/new">
    <a href="/" class="text-sm underline text-ink-gray-500 mb-6 inline-block">← Grants</a>
    <h1 class="text-xl font-semibold text-ink-gray-900 mb-6">Issue a grant</h1>

    {error && (
      <div class="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
        {error}
      </div>
    )}

    <form method="post" action="/grants" class="space-y-4 max-w-lg">
      <div>
        <label class="block text-sm font-medium text-ink-gray-700 mb-1">
          Subject ref
        </label>
        <input
          type="text"
          name="subject_ref"
          placeholder="morgan@entity.corp"
          class="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
          required
        />
        <p class="mt-1 text-xs text-ink-gray-400">The identity being granted access.</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink-gray-700 mb-1">
          Action scope
        </label>
        <input
          type="text"
          name="action_scope"
          placeholder="financials:read"
          class="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
          required
        />
        <p class="mt-1 text-xs text-ink-gray-400">The permission being granted.</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink-gray-700 mb-1">
          Your credential
        </label>
        <input
          type="password"
          name="credential"
          placeholder="credential_secret"
          class="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
          required
        />
        <p class="mt-1 text-xs text-ink-gray-400">
          Attested under <strong>{currentActor?.display_name ?? "current actor"}</strong>. Must match the seeded credential_secret.
        </p>
      </div>

      <button
        type="submit"
        class="px-6 py-2 rounded bg-ink-gray-900 text-ink-gray-0 text-sm hover:bg-ink-gray-700"
      >
        Issue grant
      </button>
    </form>
  </Layout>
);
