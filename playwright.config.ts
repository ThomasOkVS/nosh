import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://nosh:nosh@localhost:5433/nosh_test";

// The built one-container server only (run `pnpm build` first): no Vite dev.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database: the specs reset it, so they must not overlap.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node server/dist/main.js",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      DATABASE_URL: databaseUrl,
      ALLOW_SIGNUP: "true",
      ALLOWED_ORIGINS: `http://localhost:${PORT}`,
    },
  },
});
