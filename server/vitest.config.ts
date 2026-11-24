import { defineConfig } from "vitest/config";

// Server tests run in Vite's SSR environment, which reads `ssr.resolve`, not
// `resolve`. Both carry the `source` condition so @nosh/shared resolves to its
// TypeScript source and the tests never depend on a built shared/dist.
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: {
    resolve: {
      conditions: ["source", "module", "node", "development|production"],
      externalConditions: ["source"],
    },
  },
  test: {
    name: "server",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    fileParallelism: false,
  },
});
