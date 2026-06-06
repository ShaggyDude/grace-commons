import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the file-tracing root to THIS app so `output: 'standalone'` traces from here
// — not from a parent directory Next may infer when multiple lockfiles exist
// (e.g. a stray ~/package-lock.json). BUILD_PLAN §8.
const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Lean container for the persistent Fly machine (BUILD_PLAN §8).
  output: "standalone",
  outputFileTracingRoot: here,
  // pglite ships a WASM binary; keep it external so Next doesn't try to bundle it
  // into the server build, and so the embedded-Postgres default works at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
