import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
    // Test files share one Postgres database (migrations + table truncation
    // between tests), so they can't safely run concurrently with each other.
    fileParallelism: false,
  },
});
