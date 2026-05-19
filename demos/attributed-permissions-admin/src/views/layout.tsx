import type { FC } from "hono/jsx";
import type { Actor } from "../domain/actor.ts";

type LayoutProps = {
  title?: string;
  currentActor?: Actor | null;
  actors?: Actor[];
  path?: string;
  children?: unknown;
};

export const Layout: FC<LayoutProps> = ({
  title = "Alloy Demo",
  currentActor,
  actors = [],
  path = "",
  children,
}) => {
  const isGrants = path === "/" || path.startsWith("/grants");
  const isOrphans = path === "/orphans";
  const isVerify = path === "/verify";
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href="/styles.css" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#2CF200" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Alloy Demo" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <script src="/htmx.min.js"></script>
        <script>htmx.config.useTemplateFragments = true;</script>
        <script>{`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');`}</script>
      </head>
      <body class="inks-gray-0 min-h-screen">
        <header class="raised sticky top-0 z-10 p-12 flex items-center justify-between">
          <a href="/" class="linkamation">
            Alloy Demo
          </a>
          <nav class="flex items-center gap-6">
            <a
              href="/"
              aria-current={isGrants ? "page" : undefined}
              class="linkamation text-sm text-ink-gray-600"
            >
              Permission Grants
            </a>
            <a
              href="/orphans"
              aria-current={isOrphans ? "page" : undefined}
              class="linkamation text-sm text-ink-gray-600"
            >
              Orphan log
            </a>
            <a
              href="/verify"
              aria-current={isVerify ? "page" : undefined}
              class="linkamation text-sm text-ink-gray-600"
            >
              Verify Invariants
            </a>
          </nav>

          {actors.length > 0 && (
            <form
              method="post"
              action="/act-as"
              class="flex items-center gap-2 text-sm"
            >
              <span class="text-ink-gray-500">Acting as:</span>
              <select
                name="actor_ref"
                onchange="this.form.submit()"
                class="border rounded px-2 py-1 text-sm bg-ink-gray-0 focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
              >
                {actors.map((a) => (
                  <option
                    value={a.actor_ref}
                    selected={currentActor?.actor_ref === a.actor_ref}
                  >
                    {a.display_name}
                  </option>
                ))}
              </select>
            </form>
          )}

          {actors.length === 0 && (
            <span class="text-sm text-ink-gray-400 italic">
              {currentActor ? currentActor.display_name : "No actor selected"}
            </span>
          )}
        </header>

        <main class="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
};
