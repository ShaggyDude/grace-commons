// tools/conformance/tests/extract.test.mjs
//   node --test tools/conformance/tests/
//
// Unit tests for the derive-from-prose parser: claim extraction + kind inference.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceGA, extractGA } from "../extract-manifest.mjs";

const SPEC = `# Some Composition

Intro that should be ignored.

## Generation acceptance

An implementation is accepted if an auditor can clear the following.

1. **First claim here.** Explanation that is plainly record clearable.
2. **Second claim.** Code inspection confirms this one, so it is not records-only.

### Externally-clearable checks

- **A trailing question externally?** This requires external evidence to answer.

## Composition notes

This section must not be parsed.
`;

test("sliceGA captures only the Generation acceptance section", () => {
  const ga = sliceGA(SPEC);
  assert.ok(ga.includes("First claim here"));
  assert.ok(!ga.includes("must not be parsed"));
});

test("sliceGA returns null when there is no GA section", () => {
  assert.equal(sliceGA("# Doc\n\n## Status\n\ngrounded\n"), null);
});

test("extractGA pulls the verbatim bold lead as the claim", () => {
  const checks = extractGA(SPEC, "X");
  assert.equal(checks.length, 3);
  assert.equal(checks[0].claim, "First claim here.");
  assert.equal(checks[0].ga_ref, "X GA check 1");
  assert.equal(checks[2].claim, "A trailing question externally?");
});

test("kind defaults to record-clearable, flips on item language", () => {
  const checks = extractGA(SPEC, "X");
  assert.equal(checks[0].kind, "record-clearable");
  assert.equal(checks[1].kind, "externally-clearable");      // "Code inspection confirms"
  assert.equal(checks[1].kind_source, "item-language");
});

test("kind flips under an Externally-clearable section header", () => {
  const checks = extractGA(SPEC, "X");
  assert.equal(checks[2].kind, "externally-clearable");      // under the ### header
});

test("seq numbers run in document order across list styles", () => {
  const checks = extractGA(SPEC, "X");
  assert.deepEqual(checks.map((c) => c.seq), [1, 2, 3]);
});
