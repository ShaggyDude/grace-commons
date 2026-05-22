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
    <body class="inks-gray-0 min-h-screen">
      <header class="raised sticky top-0 z-10 flex items-center justify-between">
        <a href="/dashboard" class="linkamation text-sm">Beacon</a>
        {props.actor && (
          <div class="flex items-center gap-3 text-sm">
            <span class="opacity-50">
              {props.actor.display_name}
            </span>
            <form method="POST" action="/logout">
              <button type="submit" class="opacity-40 hover:opacity-80 underline text-xs">
                Sign out
              </button>
            </form>
          </div>
        )}
      </header>
      <main class="mx-auto max-w-5xl px-6 py-8">{props.children}</main>
    </body>
  </html>
);
