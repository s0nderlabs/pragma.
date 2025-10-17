import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const FIXTURE_DIR = path.resolve(process.cwd(), "../../fixtures/repl-smoke");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4310",
    headless: false,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm --filter web exec next dev --turbopack --hostname 127.0.0.1 --port 4310",
    url: "http://127.0.0.1:4310",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_PRAGMA_IDENTITY_PROVIDER: "mock",
      NEXT_PUBLIC_PRAGMA_FIXTURE_MODE: "1",
      PRAGMA_AGENT_STREAM_INSIGHTS: "1",
      PRAGMA_REPL_FIXTURE: "1",
      PRAGMA_FIXTURE_DIR: FIXTURE_DIR,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
      },
    },
  ],
});
