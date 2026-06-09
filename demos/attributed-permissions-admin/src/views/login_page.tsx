// Login page — renders the login form for POST /login.
// Standalone HTML document; does not use Layout (no nav, no actor context needed).

import type { FC } from "hono/jsx";

type Props = {
  error?: string;
};

export const LoginPage: FC<Props> = ({ error }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sign In — Alloy Demo</title>
      <link rel="stylesheet" href="/styles.css" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    </head>
    <body class="min-h-screen flex items-center justify-center">
      <div class="w-full max-w-sm mx-auto px-6">
        <div class="mb-8 text-center">
          <span class="linkamation text-xl">Alloy Demo</span>
          <p class="mt-1 text-sm text-ink-gray-500">
            Attributed Permissions Admin
          </p>
        </div>

        <form method="post" action="/login" class="flex flex-col gap-4">
          {error && (
            <div class="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div class="flex flex-col gap-1">
            <label
              for="principal_ref"
              class="text-sm font-medium text-ink-gray-700"
            >
              Username
            </label>
            <input
              id="principal_ref"
              name="principal_ref"
              type="text"
              autocomplete="username"
              required
              placeholder="Username"
              class="border rounded px-3 py-2 text-sm bg-ink-gray-0 focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label for="password" class="text-sm font-medium text-ink-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              class="border rounded px-3 py-2 text-sm bg-ink-gray-0 focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
            />
          </div>

          <button
            type="submit"
            class="mt-2 w-full rounded px-4 py-2 text-sm font-medium bg-ink-gray-900 text-ink-gray-0 hover:bg-ink-gray-700 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p class="mt-6 text-xs text-ink-gray-400 text-center">
          Demo: password is the short form of the username (e.g.{" "}
          <code>ciso_reyes</code> → <code>reyes</code>).
        </p>
      </div>
    </body>
  </html>
);
