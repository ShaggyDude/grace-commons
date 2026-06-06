"use server";
// app/audit/actions.ts — the running-verdict verify action behind the VerifyChip
// island. C14-gated on view_audit. verifyChain is a pure READ (it recomputes the
// hash chain and reports), so this appends no event.
import { db } from "@/lib/db.ts";
import * as eventLog from "@/domain/event_log.ts";
import { currentCtx } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";

export type VerifyResult =
  | { ok: true; count: number }
  | { ok: false; at: number; expected: string; found: string };

export async function verifyChainAction(): Promise<VerifyResult | { error: string }> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["view_audit"]))) {
    return { error: "You do not have permission to verify the audit chain." };
  }
  return eventLog.verifyChain(db);
}
