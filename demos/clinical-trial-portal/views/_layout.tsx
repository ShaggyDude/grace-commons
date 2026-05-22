import type { FC, PropsWithChildren } from "hono/jsx";

export const Layout: FC<
  PropsWithChildren<{
    title: string;
    actor?: { display_name: string } | null;
    /** Current path — used to highlight the active nav item. */
    path?: string;
  }>
> = (props) => {
  const p = props.path ?? "";
  const isPeople  = p.startsWith("/people");
  const isSubjects = p.startsWith("/subjects");
  const isAudit   = p.startsWith("/audit");

  const navLink = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      class={
        "linkamation text-sm transition-opacity " +
        (active
          ? "text-ink-gray-950 font-medium"
          : "text-ink-gray-600 hover:text-ink-gray-900 opacity-70 hover:opacity-100")
      }
    >
      {label}
    </a>
  );

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} — Beacon Clinical Research</title>
        <link rel="stylesheet" href="/static/styles.css" />
        <script src="https://unpkg.com/htmx.org@2.0.2" defer></script>
      </head>
      <body class="min-h-screen inks-gray-0">
        <header class="raised sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          {/* Left — brand */}
          <a href="/dashboard" class="linkamation text-sm justify-self-start">
            Beacon
          </a>

          {/* Centre — primary nav (only when logged in) */}
          {props.actor ? (
            <nav class="flex items-center gap-4">
              {navLink("/people", "People & Permissions", isPeople)}
              {navLink("/subjects", "Subjects", isSubjects)}
              {navLink("/audit", "Audit Trail", isAudit)}
            </nav>
          ) : (
            <span />
          )}

          {/* Right — user info */}
          {props.actor ? (
            <div class="flex items-center gap-4 text-sm justify-self-end">
              <span class="opacity-60">{props.actor.display_name}</span>
              <form method="POST" action="/logout">
                <button
                  type="submit"
                  class="opacity-60 hover"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <span />
          )}
        </header>
        <main class="mx-auto max-w-5xl px-6 py-8">{props.children}</main>
      </body>
    </html>
  );
};
