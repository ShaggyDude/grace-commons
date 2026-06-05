// tools/conformance/ghost/runner.mjs
//
// The ghost-flow engine — render-AGNOSTIC. Executes a declarative scenario (a
// list of user-journey steps, as data) against an actions-adapter that knows how
// to perform each step on a particular render. Same split as the validator
// (render-agnostic evaluators + per-render adapter): here it's a render-agnostic
// SCENARIO + a per-render ACTIONS ADAPTER. The same scenario can populate render
// 1 and render 2; only the adapter changes.
//
// Pure ESM, no Node- or Deno-specific imports, so it is imported by BOTH the
// Node unit test (with a mock adapter) and the Deno run entry (with the real
// render-1 adapter).
//
// ── Scenario format ─────────────────────────────────────────────────────────
// A scenario is an array of steps:
//   { actor: "PI", action: "invite", args: { email, display_name, role }, bind: "inv" }
// - `actor`  : a handle. The adapter maintains per-handle context (a logged-in
//              session / Ctx). `authenticate` and `onboard` establish a handle;
//              later steps reuse it.
// - `action` : a spec-vocabulary verb the adapter implements (see Adapter below).
// - `args`   : inputs in spec vocabulary; any string of the form "$bind.path" is
//              resolved from a prior step's bound result (e.g. "$inv.token").
// - `bind`   : optional name to store this step's return value under.
//
// ── Actions-adapter interface (per render) ──────────────────────────────────
// `createActions({ … }) -> adapter`. Each verb is `(actorHandle, args) =>
// result` (sync or async). Spec-vocabulary verbs, render-mapped inside:
//   authenticate(actor, { email, password })          -> { actor_id }
//   invite(actor, { email, display_name, role })       -> { invitation_id, token }
//   onboard(actor, { token, password })                -> { actor_id }
//   grant(actor, { grantee, capability, scope })        -> { grant_id }
//   revokeGrant(actor, { grant, reason })               -> {}
//   enrollSubject(actor, { prefix })                    -> { subject_id, subject_code }
//   recordVisit(actor, { subject, kind })               -> { visit_id }
//   signOut(actor)                                      -> {}
//   close()

/** Recursively resolve "$bind.path" references against the bindings map. */
export function resolveRefs(value, bindings) {
  if (typeof value === "string" && value.startsWith("$")) {
    const path = value.slice(1).split(".");
    let v = bindings;
    for (const k of path) {
      if (v == null) throw new Error(`unresolved reference '${value}' (no '${k}')`);
      v = v[k];
    }
    if (v === undefined) throw new Error(`unresolved reference '${value}'`);
    return v;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, bindings));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, bindings);
    return out;
  }
  return value;
}

/**
 * Run a scenario against an adapter. Returns the bindings map.
 * `log(stepNumber, step, result)` is called after each step if provided.
 */
export async function runScenario(scenario, adapter, { log } = {}) {
  const bindings = {};
  for (let i = 0; i < scenario.length; i++) {
    const step = scenario[i];
    const fn = adapter[step.action];
    if (typeof fn !== "function") {
      throw new Error(`step ${i + 1} (${step.action}): adapter has no such action`);
    }
    let args;
    try {
      args = resolveRefs(step.args ?? {}, bindings);
    } catch (e) {
      throw new Error(`step ${i + 1} (${step.actor} ${step.action}): ${e.message}`);
    }
    let result;
    try {
      result = await fn.call(adapter, step.actor, args);
    } catch (e) {
      throw new Error(`step ${i + 1} (${step.actor} ${step.action}) failed: ${e.message}`);
    }
    if (step.bind) bindings[step.bind] = result;
    if (log) log(i + 1, step, result);
  }
  return bindings;
}
