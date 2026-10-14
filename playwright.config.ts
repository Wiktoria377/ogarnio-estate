import { defineConfig } from "@playwright/test";

/**
 * E2E against the local stack (scripts/local-stack): real GoTrue auth, real
 * PostgREST + RLS, local file storage, offline test AI provider.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" },
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    locale: "pl-PL",
  },
});
