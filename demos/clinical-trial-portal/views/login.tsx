import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";

export const LoginPage: FC<{ error?: string | null }> = ({ error }) => (
  <Layout title="Log in">
    <div class="max-w-sm mx-auto mt-12">
      <h1 class="text-2xl font-semibold mb-6">Log in</h1>
      {error && (
        <p class="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <form method="POST" action="/login" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1" for="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autofocus
            class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1" for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <button
          type="submit"
          class="w-full bg-gray-900 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800"
        >
          Log in
        </button>
      </form>
    </div>
  </Layout>
);
