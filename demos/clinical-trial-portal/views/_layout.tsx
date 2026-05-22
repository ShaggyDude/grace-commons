import type { FC, PropsWithChildren } from "hono/jsx";

export const Layout: FC<PropsWithChildren<{ title: string; actor?: { display_name: string } | null }>> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title} — Beacon Clinical Research</title>
      <link rel="stylesheet" href="/static/styles.css" />
      <script src="https://unpkg.com/htmx.org@2.0.2" defer></script>
    </head>
    <body class="bg-gray-50 text-gray-900 antialiased">
      <header class="border-b bg-white">
        <div class="mx-auto max-w-5xl flex items-center justify-between px-6 py-3">
          <a href="/" class="font-semibold tracking-tight">Beacon</a>
          {props.actor && (
            <span class="text-sm text-gray-600">
              {props.actor.display_name} · <a href="/logout" class="underline">log out</a>
            </span>
          )}
        </div>
      </header>
      <main class="mx-auto max-w-5xl px-6 py-8">{props.children}</main>
    </body>
  </html>
);
