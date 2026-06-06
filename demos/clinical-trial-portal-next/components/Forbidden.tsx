// components/Forbidden.tsx — the C14 denial surface (render 1's require_permission
// 403 body). A protected page that fails `permit()` renders this inline, naming
// the missing permission(s). No client JS.
export function Forbidden({ codes }: { codes: string[] }) {
  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-semibold mb-2">Access denied</h1>
      <p className="text-sm opacity-60 mb-4">
        This page requires the <strong>{codes.join(" or ")}</strong> permission.
      </p>
      <a href="/dashboard" className="text-sm underline opacity-70 hover:opacity-100">
        ← Back to dashboard
      </a>
    </div>
  );
}
