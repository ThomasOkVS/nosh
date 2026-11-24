import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source"] },
  test: {
    name: "server",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    fileParallelism: false,
  },
});
