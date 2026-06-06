// components/Shell.tsx — the authed page frame: top bar + centered <main>.
// Mirrors render 1's Layout body wrapper. Server component.
import { TopBar } from "./TopBar.tsx";

export function Shell({
  displayName,
  active,
  children,
}: {
  displayName: string | null;
  active?: "people" | "subjects" | "audit";
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar displayName={displayName} active={active} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </>
  );
}
