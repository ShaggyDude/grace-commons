// components/TopBar.tsx — the sticky top bar (render 1's _layout.tsx header,
// re-expressed as a React server component). Same Inks.css classes.
//
// The "Sign out" control is a plain <form action={serverAction}> so it works
// without client JS (BUILD_PLAN §7.6). `active` highlights the current section
// (the server has no usePathname, so each page passes which section it is).
import { logout } from "../app/login/actions.ts";

type Section = "people" | "subjects" | "audit";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "linkamation text-sm transition-opacity " +
        (active
          ? "text-ink-gray-950 font-medium"
          : "text-ink-gray-600 hover:text-ink-gray-900 opacity-70 hover:opacity-100")
      }
    >
      {label}
    </a>
  );
}

export function TopBar({
  displayName,
  active,
}: {
  displayName: string | null;
  active?: Section;
}) {
  return (
    <header className="raised sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
      {/* Left — brand */}
      <a href="/dashboard" className="linkamation text-sm justify-self-start">
        Beacon
      </a>

      {/* Centre — primary nav (only when logged in) */}
      {displayName ? (
        <nav className="flex items-center gap-4">
          <NavLink href="/people" label="People & Permissions" active={active === "people"} />
          <NavLink href="/subjects" label="Subjects" active={active === "subjects"} />
          <NavLink href="/audit" label="Audit Trail" active={active === "audit"} />
        </nav>
      ) : (
        <span />
      )}

      {/* Right — user info + sign out */}
      {displayName ? (
        <div className="flex items-center gap-4 text-sm justify-self-end">
          <span className="opacity-60">{displayName}</span>
          <form action={logout}>
            <button type="submit" className="opacity-60 hover">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <span />
      )}
    </header>
  );
}
