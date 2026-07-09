---
title: Live Status
nav_order: 9.6
---

# Live Status

> Every number on this page is **GitHub's record of an actual run** — live workflow badges and the latest results fetched from the GitHub API when you load the page. Nothing here is hand-written, so nothing here can silently rot: if a gate goes red, this page goes red with it. The commands behind these gates are the same ones you can run yourself — see [Verify It Yourself](./verify.html).

## The gates

| Gate | What it enforces | Live |
|---|---|---|
| **Verify corpus claims** | Five independent renders built from a cold checkout must agree 100% on the conformance checks; the injected-defect negative control must be caught and localized; every formal model must hold and every buggy twin must be rejected. Runs on every push touching the corpus, and weekly on the rescan cadence. | [![Verify](https://img.shields.io/github/actions/workflow/status/scottromack/grace-commons/verify.yml?branch=main&label=verify)](https://github.com/scottromack/grace-commons/actions/workflows/verify.yml) |
| **Lint spec corpus** | The mechanical cross-reference gate: dangling links, invariant-count drift, missing models and twins, stale forthcoming-markers, count drift, out-of-range invariant references, vocabulary rules. Runs on every push and pull request. | [![Lint](https://img.shields.io/github/actions/workflow/status/scottromack/grace-commons/lint.yml?branch=main&label=lint)](https://github.com/scottromack/grace-commons/actions/workflows/lint.yml) |

## Latest runs

<div id="live-status">Loading the latest runs from the GitHub API…</div>

<script>
(function () {
  var repo = "scottromack/grace-commons";
  var workflows = ["verify.yml", "lint.yml"];
  var el = document.getElementById("live-status");

  function fmtDuration(a, b) {
    var s = Math.round((new Date(b) - new Date(a)) / 1000);
    return s >= 60 ? Math.floor(s / 60) + "m " + (s % 60) + "s" : s + "s";
  }

  Promise.all(workflows.map(function (wf) {
    return fetch("https://api.github.com/repos/" + repo + "/actions/workflows/" + wf + "/runs?branch=main&per_page=1")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { return { wf: wf, run: (d.workflow_runs || [])[0] }; });
  })).then(function (results) {
    var rows = results.map(function (x) {
      if (!x.run) return "<tr><td>" + x.wf + "</td><td colspan='4'>no runs yet</td></tr>";
      var r = x.run;
      var ok = r.conclusion === "success";
      var mark = ok ? "✅" : (r.conclusion ? "❌" : "⏳");
      return "<tr>" +
        "<td><a href='" + r.html_url + "'>" + (r.name || x.wf) + "</a></td>" +
        "<td>" + mark + " " + (r.conclusion || r.status) + "</td>" +
        "<td>" + new Date(r.run_started_at).toISOString().replace("T", " ").slice(0, 16) + " UTC</td>" +
        "<td>" + fmtDuration(r.run_started_at, r.updated_at) + "</td>" +
        "<td><code>" + r.head_sha.slice(0, 7) + "</code></td>" +
        "</tr>";
    }).join("");
    el.innerHTML = "<table><thead><tr><th>Workflow</th><th>Result</th><th>Started</th><th>Duration</th><th>Commit</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      "<p class='text-small text-grey-dk-000'>Fetched live from the GitHub API at page load. Click a workflow for the full log — the counts (checks passed, models audited, twins rejected) are in the run output itself.</p>";
  }).catch(function () {
    el.innerHTML = "<p>Could not reach the GitHub API just now (rate limit or network). The badges above are still live, and the run history is on <a href='https://github.com/" + repo + "/actions'>the Actions page</a>.</p>";
  });
})();
</script>

## What red would mean

A red **verify** gate is one of: a render disagreeing with its peers (a defect localized to that render, or a spec under-determination), a formal model no longer holding (a spec edit broke a proved property), a buggy twin no longer being rejected (a check went vacuous), or the negative control failing to catch the injected defect (the instrument itself broke). Each is a finding, and findings route through review — see [Contributing](./contributing.html). A red gate on this page is the methodology working, not failing.

## What this page deliberately is not

A hand-maintained summary. The one rule of this page: it renders the CI record, never a prose mirror of it — a hand-written "all green" is exactly the drift class the library's no-snapshot rule exists to kill. For the reproducible-at-home version of everything these gates run, see [Verify It Yourself](./verify.html); for what is *not* yet gated, see [Risks & Mitigations](./risks.html), which tracks enforcement debt honestly.
