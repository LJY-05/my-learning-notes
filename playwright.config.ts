import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const testDb = (process.env.STUDYBUDDY_E2E_DB ||= join(
  mkdtempSync(join(tmpdir(), "studybuddy-e2e-")),
  "test.sqlite",
));
export default defineConfig({
  testDir: "tests",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    launchOptions: {
      executablePath: existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined,
      args: ["--no-sandbox"],
    },
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start",
      url: "http://127.0.0.1:3003/api/state",
      env: { PORT: "3003", DATABASE_PATH: testDb },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:client -- --port 5174",
      url: "http://127.0.0.1:5174",
      env: { STUDYBUDDY_API_PORT: "3003" },
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
