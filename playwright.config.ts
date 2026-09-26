import { existsSync } from "node:fs";
import { parse } from "dotenv";
import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The test server must talk to LOCAL Supabase, never production. Real environment
// variables take precedence over .env.local in Next.js, so passing the local
// values here overrides the production values in .env.local - for both
// `next build` (NEXT_PUBLIC_* are inlined at build time) and `next start`.
const ENV_FILE = process.env.E2E_ENV_FILE ?? ".env.test.local";
const testEnv = existsSync(ENV_FILE) ? parse(readFileSync(ENV_FILE)) : {};

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * End-to-end suite. Runs against a local production build (`next build` +
 * `next start`) that talks to LOCAL Supabase via .env.test.local
 * (tests/e2e/support/db.ts refuses the production project).
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
    env: { ...testEnv, NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}` },
    url: `http://localhost:${PORT}/admin/login`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
