import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const artifacts = resolve("test-results/artifacts");

test("完整学习流程、持久化、Excel备份与手机布局", async ({ page }) => {
  mkdirSync(artifacts, { recursive: true });
  await page.clock.install({ time: new Date("2026-10-23T12:00:00") });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，也向上岸靠近一点。" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(artifacts, "studybuddy-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator("nav").getByRole("button", { name: "每日计划" }).click();
  await expect(page.locator(".task-card")).toHaveCount(28);
  const first = page.locator(".task-card").first();
  await first.getByRole("button", { name: "新背 / 闭卷输出" }).click();
  await expect(
    first.getByRole("button", { name: "新背 / 闭卷输出" }),
  ).toHaveClass("checked");
  await first.getByRole("button", { name: "详情与顺延" }).click();
  await page
    .getByLabel("学习内容", { exact: true })
    .fill("教育与教育学① · 已修改");
  await page.getByLabel("安排日期").fill("2026-11-05");
  await page.getByLabel("学习备注").fill("重点区分教育属性");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.reload();
  await page.locator("nav").getByRole("button", { name: "每日计划" }).click();
  await expect(page.locator(".task-card").first()).toContainText(
    "教育与教育学① · 已修改",
  );
  await expect(page.locator(".task-card").first()).toContainText("2026-11-05");
  await page.locator("nav").getByRole("button", { name: "遗忘曲线" }).click();
  await expect(page.locator(".review-row")).toHaveCount(5);
  await page.getByTitle("完成复习").first().click();
  await expect(page.locator(".review-row")).toHaveCount(4);
  await page.locator("nav").getByRole("button", { name: "错题本" }).click();
  await page.getByRole("button", { name: "记录错题", exact: true }).click();
  await page.getByLabel("知识点", { exact: true }).fill("负强化与惩罚");
  await page.getByLabel("错题 / 解析 / 备注").fill("去除厌恶刺激是负强化");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator(".mistake-card")).toHaveCount(1);
  await page.getByRole("button", { name: "完成复习", exact: true }).click();
  await expect(page.locator(".mistake-card")).toContainText("已复习 1 次");
  await page.locator("nav").getByRole("button", { name: "真题训练" }).click();
  await page.getByRole("button", { name: "记录训练" }).click();
  await page.getByLabel("套卷名称").fill("2025模拟卷");
  await page.getByLabel("总题数").fill("100");
  await page.getByLabel("正确题数").fill("82");
  await page.getByLabel("用时（分钟）").fill("90");
  await page.getByLabel("薄弱模块").fill("教育学");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator("tbody")).toContainText("82%");
  const before = await page.evaluate(() =>
    localStorage.getItem("studybuddy-v1"),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Excel" }).click();
  const file = await download;
  await file.saveAs(resolve(artifacts, "studybuddy-test-backup.xlsx"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  page.once("dialog", (d) => d.accept());
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve(artifacts, "studybuddy-test-backup.xlsx"));
  await expect(page.getByRole("status")).toContainText("备份导入成功");
  expect(await page.evaluate(() => localStorage.getItem("studybuddy-v1"))).toBe(
    before,
  );
  await page.locator("nav").getByRole("button", { name: "学习日历" }).click();
  await expect(page.locator(".calendar-cell")).not.toHaveCount(0);
  await page.locator("nav").getByRole("button", { name: "学习统计" }).click();
  await expect(page.getByText("真题平均正确率：82%")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-menu").click();
  await page
    .locator("nav")
    .getByRole("button", { name: "工作台", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(artifacts, "studybuddy-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("原始Excel导入、智能顺延与撤销后复习去重", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-23T12:00:00") });
  await page.goto("/");
  page.once("dialog", (d) => d.accept());
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("public/原始学习计划.xlsx"));
  await expect(page.getByRole("status")).toContainText("28天原始计划导入成功");
  await page.locator("nav").getByRole("button", { name: "每日计划" }).click();
  await expect(page.locator(".task-card")).toHaveCount(28);
  page.once("dialog", (d) => d.accept("2026-10-25"));
  await page.getByRole("button", { name: "智能顺延" }).click();
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("studybuddy-v1")!),
  );
  expect(records.records.D1.date).toBe("2026-10-25");
  expect(records.records.D2.date).toBe("2026-10-26");
  expect(records.plans[0].date).toBe("2026-10-21");
  expect(records.records.D1.doneAt).toBeUndefined();
  const first = page.locator(".task-card").first();
  await first.getByRole("button", { name: "新背 / 闭卷输出" }).click();
  page.once("dialog", (d) => d.accept());
  await first.getByRole("button", { name: "新背 / 闭卷输出" }).click();
  await first.getByRole("button", { name: "新背 / 闭卷输出" }).click();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("studybuddy-v1")!),
  );
  expect(state.reviews).toHaveLength(5);
  expect(new Set(state.reviews.map((r: { id: string }) => r.id)).size).toBe(5);
  expect(state.records.D1.history.length).toBe(4);
});
