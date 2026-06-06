// tools/conformance/render5/lib/clock.mjs
//
// A monotonic wall-clock for the build. Real-time resolution in a fast in-memory
// run can stamp two events at the identical millisecond, which would make
// occurred_at appear to "decrease" only if ties were re-ordered — and would
// blur the timeline the audit checks read. We hand out a strictly-increasing ISO
// timestamp per call so the Event Log's "occurred_at non-decreasing in seq
// order" property holds structurally, not by luck of the scheduler.

let _last = Date.now();

export function now() {
  const t = Date.now();
  _last = t > _last ? t : _last + 1;
  return new Date(_last).toISOString();
}
