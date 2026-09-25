import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * End-to-end suite. Runs against a local production build (`next build` +
 * `next start`) that talks to the Supabase project in .env.local.
 *
 * All test data is created by global-setup with an "E2E <run id>" / "e2e-"
 * prefix and removed by global-teardown - existing data is never modified.
 * Tests share that data and run serially in file order (01-, 02-, ...).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/.report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  outputDir: "tests/e2e/.results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
