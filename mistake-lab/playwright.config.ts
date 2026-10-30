import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:test",
    url: "http://127.0.0.1:3107/api/ocr",
    reuseExistingServer: false,
    timeout: 120000,
    env: { MISTAKE_LAB_TEST: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
