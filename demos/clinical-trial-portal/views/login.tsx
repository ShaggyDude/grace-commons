// views/login.tsx — Standalone login page (no Layout; no nav needed pre-auth).

import type { FC } from "hono/jsx";

export const LoginPage: FC<{ error?: string | null }> = ({ error }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sign In — Beacon Clinical Research</title>
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body class="inks-gray-0 min-h-screen flex items-center justify-center">
      <div class="w-full max-w-sm mx-auto px-6">

        <div class="mb-8 text-center">
          <span class="linkamation text-xl">Beacon</span>
          <p class="mt-1 text-sm opacity-50">Clinical Research Portal</p>
        </div>

        {error && (
          <div class="mb-4 text-sm text-red-600 bg-red-50 border rounded px-3 py-2">
            {error}
          </div>
        )}

        <form method="POST" action="/login" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label for="email" class="text-sm font-medium">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="username"
              required
              autofocus
              placeholder="anya@beacon.clinical"
              class="border rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label for="password" class="text-sm font-medium">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              class="border rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <button
            type="submit"
            class="inks-gray-1000 mt-2 w-full rounded px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          >
            Sign in
          </button>
        </form>

        <div class="mt-6 text-xs text-center space-y-1 opacity-40">
          <p class="font-medium">Demo accounts</p>
          <p><code>anya@beacon.clinical</code> / <code>demo-pi</code> — Principal Investigator</p>
          <p><code>jordan@beacon.clinical</code> / <code>demo-cra</code> — Clinical Research Associate</p>
        </div>

      </div>
    </body>
  </html>
);
