// app/audit/export.csv/route.ts — GET /audit/export.csv. Streams the audit chain
// as RFC-4180 CSV with the prev_hash/this_hash columns intact (so an external
// verifier can re-walk it). C14-gated on view_audit; scope='own' exports only the
// viewer's events. Exporting the regulated record is itself a regulated act, so
// it emits audit.exported — identical contract to render 1's route handler.
import { db, withTx } from "@/lib/db.ts";
import * as eventLog from "@/domain/event_log.ts";
import { appendEvent } from "@/domain/event_log.ts";
import { currentCtx } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await currentCtx(); // redirects to /login if unauthenticated
  const granted = await permit(ctx, ["view_audit"]);
  if (!granted) {
    return new Response("Forbidden — this export requires the view_audit permission.", {
      status: 403,
    });
  }
  const scope = granted.scope;

  // Chain is stored id-ascending → already oldest-first, the order a verifier walks.
  let events = await eventLog.listAll(db);
  if (scope === "own") events = events.filter((e) => e.actor_id === ctx.actor!.id);

  // RFC 4180: wrap every field in double-quotes; escape inner quotes as "".
  const csvField = (v: string | number | null | undefined): string =>
    '"' + (v == null ? "" : String(v)).replace(/"/g, '""') + '"';

  const header =
    "id,occurred_at,actor_id,session_id,action,target_kind,target_id,payload_json,prev_hash,this_hash\n";

  const rows = events
    .map((e) =>
      [
        csvField(e.id),
        csvField(e.occurred_at),
        csvField(e.actor_id),
        csvField(e.session_id),
        csvField(e.action),
        csvField(e.target_kind),
        csvField(e.target_id),
        csvField(e.payload_json), // already a canonical JSON string — do NOT re-serialize
        csvField(e.prev_hash),
        csvField(e.this_hash),
      ].join(","),
    )
    .join("\n");

  await withTx(ctx, async (tx) => {
    await appendEvent(tx, {
      action: "audit.exported",
      target_kind: "audit",
      payload: { row_count: events.length, scope },
    });
  });

  const ts = new Date().toISOString().slice(0, 10);
  return new Response(header + rows, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="beacon-audit-${ts}.csv"`,
    },
  });
}
