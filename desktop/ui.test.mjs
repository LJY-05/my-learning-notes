import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../server/db.ts";
const root = mkdtempSync(join(tmpdir(), "studybuddy-desktop-ui-")),
  data = join(root, "desktop"),
  old = join(root, "old-project");
mkdirSync(join(old, "data"), { recursive: true });
const source = new Store(join(old, "data/studybuddy.sqlite"));
source.mutate((s) => {
  s.settings.name = "桌面迁移验收";
  s.settings.provider = "deepseek";
  s.batches.push({
    id: "old-import",
    hash: "desktop-fixture",
    name: "旧计划",
    at: new Date().toISOString(),
    taskCount: 0,
    warnings: [],
    sheets: [],
  });
});
source.close();
writeFileSync(
  join(old, ".env"),
  "DEEPSEEK_API_KEY=desktop-ui-placeholder\nDEEPSEEK_MODEL=deepseek-chat\n",
);
const executable = resolve(
  process.argv[2] || "desktop/node_modules/electron/dist/electron",
);
const isSource = process.argv.includes("--source");
let app;
try {
  app = await electron.launch({
    executablePath: executable,
    args: [
      ...(isSource ? [resolve("desktop")] : []),
      ...(process.platform === "linux"
        ? ["--no-sandbox", "--ozone-platform=headless"]
        : []),
    ],
    env: {
      ...process.env,
      STUDYBUDDY_DESKTOP_DATA_PATH: data,
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_CACHE_HOME: join(root, "cache"),
    },
  });
  const page = await app.firstWindow();
  if (process.platform === "linux")
    await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForSelector("h1");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  assert.equal(
    await page.evaluate(() => typeof window.studybuddySettings),
    "undefined",
  );
  await page.screenshot({
    path: "docs/previews/desktop-application.png",
    animations: "disabled",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "AI 学习助手", exact: true })
    .click();
  await page.getByLabel("给学习助手的消息").fill("看看今天的任务和真实进度");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page
    .locator(".message.assistant")
    .filter({ hasText: "当前为 Mock 规则助手" })
    .waitFor();

  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items[0].submenu.items.find((x) => x.label === "AI 配置…")
      .click(),
  );
  let config;
  for (let i = 0; i < 50; i++) {
    config = app.windows().find((p) => p !== page);
    if (config) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!config) throw Error("Configuration window did not open");
  await config.waitForSelector("#key");
  await config.locator("#key").fill("desktop-ui-placeholder");
  if (process.platform === "linux")
    await config.setViewportSize({ width: 550, height: 700 });
  await config.locator("#save").click();
  await config.getByText("已保存，可以关闭此窗口。", { exact: true }).waitFor();
  await config.close();
  await page.waitForFunction(async () => {
    try {
      return (await fetch("/api/state").then((r) => r.json())).capabilities
        .deepseekConfigured;
    } catch {
      return false;
    }
  });
  await page.waitForSelector("h1");
  const status = await page.evaluate(() =>
    fetch("/api/state").then((r) => r.json()),
  );
  assert.equal(status.capabilities.deepseekConfigured, true);
  assert.equal(status.capabilities.desktop, true);
  assert.equal(
    JSON.stringify(status).includes("desktop-ui-placeholder"),
    false,
  );
  const importedNavigation = page.waitForEvent("load");
  await app.evaluate(({ dialog, Menu }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
    dialog.showMessageBox = async () => ({ response: 0 });
    Menu.getApplicationMenu()
      .items[0].submenu.items.find((x) => x.label === "导入旧项目…")
      .click();
  }, old);
  await importedNavigation;
  await page.waitForFunction(
    async () => {
      try {
        return (
          (await fetch("/api/state").then((r) => r.json())).state.settings
            .name === "桌面迁移验收"
        );
      } catch {
        return false;
      }
    },
    {},
    { timeout: 15000 },
  );
  await page.waitForSelector("h1");
  const imported = await page.evaluate(() =>
    fetch("/api/state").then((r) => r.json()),
  );
  assert.equal(imported.state.tasks.length, 0);
  assert.equal(imported.state.settings.provider, "deepseek");
  assert.equal(imported.capabilities.deepseekConfigured, true);
  assert.equal(
    JSON.stringify(imported).includes("desktop-ui-placeholder"),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Desktop UI passed: rendered app, renderer isolation, private AI settings, restart, and old project import.",
  );
} finally {
  if (app) await app.close();
  rmSync(root, { recursive: true, force: true });
}
