import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean container for the persistent Fly machine (BUILD_PLAN §8).
  output: "standalone",
  // pglite ships a WASM binary; keep it external so Next doesn't try to bundle it
  // into the server build, and so the embedded-Postgres default works at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
