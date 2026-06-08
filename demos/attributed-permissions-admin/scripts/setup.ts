// setup.ts — downloads npm dependencies into node_modules/.
// Run once before first use: deno task setup
//
// This is a no-op script; `deno run` with nodeModulesDir:auto handles
// dependency resolution automatically. We include it so `deno task setup`
// is self-documenting and consistent with the MPA demo convention.

console.log("✓ Setup complete — dependencies will be resolved on first run.");
console.log("  Next steps:");
console.log("    deno task migrate   # create the database schema");
console.log("    deno task seed      # insert demo actors and grants");
console.log("    deno task dev       # start the server at http://localhost:8002");
