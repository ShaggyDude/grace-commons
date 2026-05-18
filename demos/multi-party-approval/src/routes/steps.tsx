// Step-level routes — approve, reject, withdraw.
//
// Content negotiation:
//   HX-Request present → HTML fragment: updated StepRow + OOB ChainBanner
//   Otherwise          → JSON (original step 8 behaviour)
//
// Body negotiation:
//   application/x-www-form-urlencoded → parseBody() (HTMX default)
//   application/json                  → req.json()

import { Hono } from "hono";
import type { Context } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { approve_step, reject_step, withdraw_step, read_chain } from "../domain/chain.ts";
import { tokenToStatus } from "../middleware/error.ts";
import { StepRow, ChainBanner } from "../views/fragments.tsx";

const steps = new Hono<{ Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// Body parsing helper — handles form-encoded (HTMX) and JSON (API)
// ---------------------------------------------------------------------------

type HonoCtx = Context<{ Variables: AppVariables }>;

async function parseBody(c: HonoCtx): Promise<Record<string, unknown>> {
  const ct = c.req.header("content-type") ?? "";
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    return await c.req.parseBody();
  }
  try { return await c.req.json(); } catch { return {}; }
}

// ---------------------------------------------------------------------------
// HTMX error flash OOB element
// ---------------------------------------------------------------------------

function ErrorFlash({ message }: { message: string }) {
  // deno-lint-ignore no-explicit-any
  const oob = { "hx-swap-oob": "innerHTML" } as any;
  return (
    <div id="error-flash" {...oob}
      class="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
      <span>⚠ {message}</span>
      <button
        onclick="this.closest('#error-flash').innerHTML=''"
        class="ml-4 text-red-400 hover:text-red-600 cursor-pointer font-bold leading-none">
        ✕
      </button>
    </div>
  );
}

function ClearFlash() {
  // deno-lint-ignore no-explicit-any
  const oob = { "hx-swap-oob": "innerHTML" } as any;
  return <div id="error-flash" {...oob}></div>;
}

// ---------------------------------------------------------------------------
// HTMX fragment response — updated StepRow + OOB ChainBanner + cleared flash
// ---------------------------------------------------------------------------

function htmxFragment(
  c: HonoCtx,
  chain_id: string,
  step_id: string,
) {
  const actor       = c.get("actor")!;
  const chainResult = read_chain(actor.actor_ref, { chain_id });
  if ("err" in chainResult || chainResult.ok.length === 0) return new Response(null, { status: 204 });

  const chain = chainResult.ok[0];
  const step  = chain.steps.find((s) => s.step_id === step_id);
  if (!step) return new Response(null, { status: 204 });

  return c.html(
    <>
      <StepRow step={step} actor={actor} />
      <ChainBanner chain={chain} actor={actor} oob />
      <ClearFlash />
    </>,
  );
}

// ---------------------------------------------------------------------------
// HTMX error response — unchanged StepRow + OOB error flash
// ---------------------------------------------------------------------------

function htmxError(
  c: HonoCtx,
  chain_id: string,
  step_id: string,
  message: string,
) {
  const actor       = c.get("actor")!;
  const chainResult = read_chain(actor.actor_ref, { chain_id });
  const chain       = "err" in chainResult ? null : (chainResult.ok[0] ?? null);
  const step        = chain?.steps.find((s) => s.step_id === step_id);

  // If we can't even read the step, return just the flash
  if (!step) {
    return c.html(<ErrorFlash message={message} />);
  }

  // Return the unchanged row so it stays interactive, plus the flash
  return c.html(
    <>
      <StepRow step={step} actor={actor} />
      <ErrorFlash message={message} />
    </>,
  );
}

// ---------------------------------------------------------------------------
// POST /chains/:chain_id/steps/:step_id/approve
// ---------------------------------------------------------------------------
steps.post("/:chain_id/steps/:step_id/approve", async (c) => {
  const actor = c.get("actor");
  if (!actor) {
    if (c.req.header("HX-Request")) return c.html(<ErrorFlash message="no actor selected" />);
    return c.json({ error: "no actor selected" }, 401);
  }

  const body   = await parseBody(c);
  const reason = body.reason != null ? String(body.reason) : null;

  const chain_id = c.req.param("chain_id");
  const step_id  = c.req.param("step_id");

  const result = approve_step(actor.actor_ref, chain_id, step_id, reason);
  if ("err" in result) {
    if (c.req.header("HX-Request")) return htmxError(c, chain_id, step_id, result.err);
    return c.json({ error: result.err }, tokenToStatus(result.err));
  }

  if (c.req.header("HX-Request")) return htmxFragment(c, chain_id, step_id);
  return c.json(result.ok);
});

// ---------------------------------------------------------------------------
// POST /chains/:chain_id/steps/:step_id/reject
// ---------------------------------------------------------------------------
steps.post("/:chain_id/steps/:step_id/reject", async (c) => {
  const actor = c.get("actor");
  if (!actor) {
    if (c.req.header("HX-Request")) return c.html(<ErrorFlash message="no actor selected" />);
    return c.json({ error: "no actor selected" }, 401);
  }

  const body   = await parseBody(c);
  const reason = String(body.reason ?? "");

  const chain_id = c.req.param("chain_id");
  const step_id  = c.req.param("step_id");

  const result = reject_step(actor.actor_ref, chain_id, step_id, reason);
  if ("err" in result) {
    if (c.req.header("HX-Request")) return htmxError(c, chain_id, step_id, result.err);
    return c.json({ error: result.err }, tokenToStatus(result.err));
  }

  if (c.req.header("HX-Request")) return htmxFragment(c, chain_id, step_id);
  return c.json(result.ok);
});

// ---------------------------------------------------------------------------
// POST /chains/:chain_id/steps/:step_id/withdraw
// ---------------------------------------------------------------------------
steps.post("/:chain_id/steps/:step_id/withdraw", async (c) => {
  const actor = c.get("actor");
  if (!actor) {
    if (c.req.header("HX-Request")) return c.html(<ErrorFlash message="no actor selected" />);
    return c.json({ error: "no actor selected" }, 401);
  }

  const body   = await parseBody(c);
  const reason = String(body.reason ?? "");

  const chain_id = c.req.param("chain_id");
  const step_id  = c.req.param("step_id");

  const result = withdraw_step(actor.actor_ref, chain_id, step_id, reason);
  if ("err" in result) {
    if (c.req.header("HX-Request")) return htmxError(c, chain_id, step_id, result.err);
    return c.json({ error: result.err }, tokenToStatus(result.err));
  }

  if (c.req.header("HX-Request")) return htmxFragment(c, chain_id, step_id);
  return c.json(result.ok);
});

export { steps };
