import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "把今天，学成喜欢的样子。" }),
  ).toBeVisible();
  await page.getByLabel("选定日期").fill("2026-10-23");
});
test("正式导入、九个页面、手机布局与主题", async ({ page }) => {
  mkdirSync("test-results/artifacts", { recursive: true });
  await expect(page.getByText("317", { exact: false }).first()).toBeVisible();
  await page.screenshot({
    path: "test-results/artifacts/studybuddy-v1-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const name of [
    "AI 学习助手",
    "学习计划",
    "遗忘曲线",
    "错题管理",
    "真题与专项",
    "面试训练",
    "数据分析",
    "设置与数据",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "今日空间", exact: true })
    .click();
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/artifacts/studybuddy-v1-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "切换主题" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/artifacts/studybuddy-v1-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学习计划", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "新增任务", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("任务新增编辑、SQLite持久化、完成及唯一复习、延期与恢复", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学习计划", exact: true })
    .click();
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  await page.getByLabel("任务内容", { exact: true }).fill("浏览器验收背诵");
  await page.getByLabel("预计分钟（未知请留空）").fill("20");
  await page.getByLabel("实际学习分钟").fill("18");
  await page
    .getByRole("combobox", { name: "任务类型", exact: true })
    .selectOption("背诵");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  const card = page.locator(".task-card").filter({ hasText: "浏览器验收背诵" });
  await expect(card).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学习计划", exact: true })
    .click();
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "完成任务：浏览器验收背诵", exact: true })
    .click();
  await expect(card).toHaveClass(/is-done/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "遗忘曲线", exact: true })
    .click();
  await expect(page.locator(".review-grid>.card")).toHaveCount(5);
  await page
    .getByRole("button", { name: "完成这次复习", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "完成这次复习", exact: true }),
  ).toHaveCount(4);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学习计划", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await card
    .getByRole("button", { name: "撤销完成：浏览器验收背诵", exact: true })
    .click();
  await expect(card).not.toHaveClass(/is-done/);
  await card
    .getByRole("button", { name: "完成任务：浏览器验收背诵", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "遗忘曲线", exact: true })
    .click();
  await expect(page.locator(".review-grid>.card")).toHaveCount(5);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学习计划", exact: true })
    .click();
  await card
    .getByRole("button", { name: "编辑：浏览器验收背诵", exact: true })
    .click();
  await page.getByLabel("安排日期", { exact: true }).fill("2026-10-24");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("选定日期").fill("2026-10-24");
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "编辑：浏览器验收背诵", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(card).toBeVisible();
  expect(errors).toEqual([]);
});
test("错题二轮、学科第二套真实计数、试讲教案保存", async ({ page }) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "错题管理", exact: true })
    .click();
  await page.getByRole("button", { name: "记录错题", exact: true }).click();
  await page.getByLabel("知识点 / 错题原文").fill("负强化与惩罚");
  await page
    .getByLabel("正确答案", { exact: true })
    .fill("去除厌恶刺激是负强化");
  await page.getByLabel("个人解析（原始内容）").fill("与呈现厌恶刺激区别");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "负强化与惩罚" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "再次错误", exact: true }).click();
  await expect(page.getByText("累计错误 2 次", { exact: false })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "真题与专项", exact: true })
    .click();
  await expect(page.getByText("0", { exact: false }).first()).toBeVisible();
  await page
    .getByRole("button", { name: "记录套卷 / 专项", exact: true })
    .click();
  await page.getByLabel("套卷 / 练习名称").fill("学科第二套第一章");
  await page.getByLabel("科目分类").selectOption("道德与法治第二套题");
  await page.getByLabel("本次题数").fill("20");
  await page.getByLabel("正确题数").fill("16");
  await page.getByLabel("错题数量").fill("4");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByText("80", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("总题量 待确认", { exact: false })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "面试训练", exact: true })
    .click();
  await page.getByRole("button", { name: "新建训练教案", exact: true }).click();
  await page.getByLabel("试讲篇目").fill("敬畏生命");
  await page.getByLabel("教学目标", { exact: true }).fill("理解生命的价值");
  await page
    .getByLabel("逐字稿", { exact: true })
    .fill("同学们，今天从一段真实经历开始。");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "敬畏生命", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "面试训练", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "敬畏生命", exact: true }),
  ).toBeVisible();
});
test("Mock AI流式候选、明确确认后执行、重复确认与失效方案拒绝", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "AI 学习助手", exact: true })
    .click();
  await page
    .getByLabel("给学习助手的消息")
    .fill("今天只有两个小时，帮我重新安排");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("heading", { name: /候选安排/ })).toBeVisible();
  await expect(page.getByText("尚未执行", { exact: true })).toBeVisible();
  mkdirSync("test-results/artifacts", { recursive: true });
  await page.screenshot({
    path: "test-results/artifacts/studybuddy-v1-ai.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "确认并执行以上日期调整", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /候选安排/ })).toHaveCount(0);
  await page.getByLabel("给学习助手的消息").fill("新增任务：AI确认测试任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "待确认：新增任务" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "确认执行此操作", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学习计划", exact: true })
    .click();
  await expect(
    page.locator(".task-card").filter({ hasText: "AI确认测试任务" }),
  ).toBeVisible();
});
test("Excel重复导入不新增、完整JSON备份恢复与无效备份拒绝", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "设置与数据", exact: true })
    .click();
  const count = await page.request
    .get("/api/state")
    .then((r) => r.json())
    .then((r) => r.state.tasks.length);
  await page
    .locator('input[type=file][accept=".xlsx,.xls"]')
    .setInputFiles(
      resolve("public/StudyBuddy_备考计划_结合实习课表调整版.xlsx"),
    );
  await expect(
    page.getByText("重复文件 · 不会再次创建", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未重复创建任务");
  expect(
    await page.request
      .get("/api/state")
      .then((r) => r.json())
      .then((r) => r.state.tasks.length),
  ).toBe(count);
  const saved = await page.request.get("/api/backup").then((r) => r.json());
  await page.getByLabel("你的名字").fill("临时名字");
  await page.getByRole("button", { name: "保存偏好", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page
    .locator('input[type=file][accept=".json"]')
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await page
    .getByRole("button", { name: "我已备份，确认覆盖并恢复", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("完整备份已恢复");
  const restored = await page.request.get("/api/backup").then((r) => r.json());
  expect(restored.tasks).toEqual(saved.tasks);
  expect(restored.wrongs).toEqual(saved.wrongs);
  expect(restored.exams).toEqual(saved.exams);
  expect(restored.interviews).toEqual(saved.interviews);
  expect(restored.settings).toEqual(saved.settings);
  await page
    .locator('input[type=file][accept=".json"]')
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":2}'),
    });
  await page
    .getByRole("button", { name: "我已备份，确认覆盖并恢复", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("校验失败");
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  const final = await page.request.get("/api/backup").then((r) => r.json());
  expect(final.tasks).toEqual(saved.tasks);
});

test("API写入校验、过期方案、完成记录保护与导出工作簿", async ({ page }) => {
  const read = () =>
    page.request
      .get("/api/state")
      .then((r) => r.json())
      .then((r) => r.state);
  const before = await read();
  const headers = { "X-StudyBuddy-Intent": "user" };
  const missingIntent = await page.request.post("/api/settings", {
    data: { revision: before.revision, settings: before.settings },
  });
  expect(missingIntent.status()).toBe(403);
  const stale = await page.request.post("/api/settings", {
    headers,
    data: { revision: before.revision - 1, settings: before.settings },
  });
  expect(stale.status()).toBe(400);
  const invalid = await page.request.post("/api/exams", {
    headers,
    data: {
      revision: before.revision,
      entry: { name: "无效试卷", total: 10, correct: 11 },
    },
  });
  expect(invalid.status()).toBe(400);
  let state = await read();
  const created = await page.request
    .post("/api/tasks", {
      headers,
      data: {
        revision: state.revision,
        task: {
          subject: "教综",
          module: "测试",
          title: "预算冲突验收",
          date: "2026-10-29",
          estimatedMinutes: 20,
          actualMinutes: 18,
          priority: "高",
          status: "未开始",
          source: "验收",
          note: "",
          mastery: "未评估",
          kind: "背诵",
          deadline: null,
        },
      },
    })
    .then((r) => r.json());
  expect(created.actualMinutes).toBe(18);
  state = await read();
  const proposal = await page.request
    .post("/api/schedule/propose", {
      headers,
      data: { revision: state.revision, date: "2026-10-29", minutes: 60 },
    })
    .then((r) => r.json());
  expect(proposal.selected).toContain(created.id);
  expect(proposal.unknown.length).toBeGreaterThan(0);
  state = await read();
  await page.request.post("/api/tasks/" + created.id + "/complete", {
    headers,
    data: { revision: state.revision },
  });
  state = await read();
  const conflict = await page.request.post("/api/schedule/confirm", {
    headers,
    data: { revision: state.revision, id: proposal.id, confirmed: true },
  });
  expect(conflict.status()).toBe(400);
  expect((await conflict.json()).error).toContain("数据已");
  expect(
    (await read()).tasks.find((t: any) => t.id === created.id).status,
  ).toBe("已完成");
  const workbook = await page.request.get("/api/export");
  expect(workbook.ok()).toBe(true);
  expect(workbook.headers()["content-type"]).toContain("spreadsheetml");
  expect((await workbook.body()).length).toBeGreaterThan(30000);
  state = await read();
  await page.request.post("/api/settings", {
    headers,
    data: {
      revision: state.revision,
      settings: { ...state.settings, provider: "off" },
    },
  });
  state = await read();
  const disabled = await page.request.post("/api/chat", {
    headers,
    data: {
      revision: state.revision,
      text: "你好",
      date: "2026-10-23",
      conversationId: "off-test",
    },
  });
  expect(disabled.status()).toBe(400);
  expect((await disabled.json()).error).toContain("已关闭");
  state = await read();
  const restored = await page.request.post("/api/restore", {
    headers,
    data: { revision: state.revision, backup: before, confirmed: true },
  });
  expect(restored.ok()).toBe(true);
});
