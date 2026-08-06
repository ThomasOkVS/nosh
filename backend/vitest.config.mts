import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
    // Test files share one Postgres database (migrations + table truncation
    // between tests), so they can't safely run concurrently with each other.
    fileParallelism: false,
    coverage: {
      // coverage.exclude replaces Vitest's defaults rather than extending
      // them, so the default patterns (test files, config files, etc.) have
      // to be spread back in explicitly.
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Migrations run in a separate node-pg-migrate child process, so V8
        // can never instrument them — they'd always show 0% regardless of
        // how well-tested the schema actually is, which is noise, not signal.
        "migrations/**",
        "src/index.ts",
      ],
    },
  },
});
