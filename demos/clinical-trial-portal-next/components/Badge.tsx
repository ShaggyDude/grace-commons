// components/Badge.tsx — small pill labels, ported from render 1's view fragments
// (same Inks.css / Tailwind classes).

export function Badge({
  label,
  color = "gray",
}: {
  label: string;
  color?: "green" | "yellow" | "gray";
}) {
  const cls =
    color === "green"
      ? "bg-green-100 text-green-800"
      : color === "yellow"
        ? "bg-yellow-100 text-yellow-800"
        : "border opacity-60";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
}

type SubjectStatus = "screening" | "enrolled" | "withdrawn" | "completed";

export function StatusBadge({ status }: { status: SubjectStatus | string }) {
  const cls =
    status === "enrolled"
      ? "bg-green-100 text-green-800"
      : status === "screening"
        ? "bg-yellow-100 text-yellow-800"
        : status === "completed"
          ? "bg-blue-100 text-blue-800"
          : "border opacity-60";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>
      {status}
    </span>
  );
}
