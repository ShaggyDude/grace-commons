#!/usr/bin/env bash
# Provision the harness's two checkers from the npm registry only — no
# firewalled downloads (Adoptium/GitHub/Maven are not required and are
# typically blocked in sandboxes). Run once per session; node_modules is
# git-ignored. The Alloy jar itself lives at tools/alloy/alloy.jar and is
# extracted from the Alloy.app bundle (Contents/Resources/) — not downloaded.
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing tla-checker (TLA+ WASM) into the repo node_modules..."
npm install --no-audit --no-fund

# The JRE 17 goes on the native /tmp FS, NOT the mounted repo: unpacking the
# JRE into the mount drops libjli.so and the launcher dies with exit 127.
JRE_DIR=/tmp/javajre
echo "Installing javajre-linux-64 (JRE 17) into $JRE_DIR ..."
mkdir -p "$JRE_DIR"
( cd "$JRE_DIR" && npm install --no-audit --no-fund javajre-linux-64@17.0.8 )
JAVA="$JRE_DIR/node_modules/javajre-linux-64/jre/bin/java"
chmod +x "$JAVA" 2>/dev/null || true
echo
echo "TLA+ checker : $(ls node_modules/tla-checker/tla_checker_bg.wasm >/dev/null 2>&1 && echo OK || echo MISSING)"
echo "JRE 17       : $("$JAVA" -version 2>&1 | head -1)"
echo "Alloy jar    : $(ls ../alloy/alloy.jar >/dev/null 2>&1 && echo OK || echo 'MISSING — extract from Alloy.app/Contents/Resources/org.alloytools.alloy.dist.jar')"
echo
echo "Ready. Examples:"
echo "  node check.mjs ../../grants/tla-poc/MultiPartyApproval.tla"
echo "  node check.mjs ../../grants/tla-poc/MultiPartyApprovalBuggy.tla --buggy"
echo "  node check.mjs ../../compositions/session-gated-authorization.als"
echo "  node audit.mjs        # run every existing model"
