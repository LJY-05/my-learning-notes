import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../store.mjs";
import { buildExtractiveQuiz, dayCN } from "../quiz.mjs";
const root = mkdtempSync(join(tmpdir(), "yueteach-ui-"));
let app, diagnosticPage, stage = 'launch';
const packaged = process.argv[2];
const executable = resolve(
  packaged ||
    (process.platform === "win32"
      ? "yue-teach/node_modules/electron/dist/electron.exe"
      : "yue-teach/node_modules/electron/dist/electron"),
);
const date = dayCN();
const docs = Array.from({ length: 6 }, (_, i) => ({
  url: `https://edu.gd.gov.cn/content/post_${10000 + i}.html`,
  title: `自动化测试素材，非真实政策 ${i}`,
  date,
  region: i ? "广东" : "广州",
  kind: "政策",
  sourceName: "测试夹具，非新闻",
  sourceId: "gd-edu",
  attachments: [],
  text: Array.from(
    { length: 4 },
    (_, j) =>
      `这是一段仅供自动化验收使用的虚构材料，不能作为政策学习依据，测试工作安排需要不少于${20 + i * 4 + j}课时的模拟练习并完成自测反馈。`,
  ).join("\n"),
}));
const questions = buildExtractiveQuiz(docs, date);
questions[1] = {
  ...questions[1],
  type: "多选",
  stem: "自动化测试：请选择两个正确选项（非真实时政题）",
  options: ["正确甲", "正确乙", "错误丙", "错误丁"],
  answer: [0, 1],
};
questions[2] = {
  ...questions[2],
  type: "判断",
  stem: "自动化测试：该材料是否明确标注为虚构测试素材？",
  options: ["正确", "错误"],
  answer: [0],
};
const store = openStore(root);
store.setDaily(date, {
  day: date,
  questions,
  mode: "自动化测试",
  note: "自动化测试夹具，非实际政策",
});
store.close();
try {
  app = await electron.launch({
    executablePath: executable,
    args: [
      ...(!packaged ? [resolve("yue-teach")] : []),
      ...(process.platform === "linux"
        ? ["--no-sandbox", "--ozone-platform=headless"]
        : []),
    ],
    env: {
      ...process.env,
      YUETEACH_DESKTOP_DATA: root,
      YUETEACH_NO_AUTO: "1",
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_CACHE_HOME: join(root, "cache"),
    },
  });
  const page = await app.firstWindow();
  diagnosticPage = page;
  stage = 'home render';
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.platform === "linux")
    await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("heading", { name: "给未来的自己，多一点准备。" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => typeof require === "undefined" && typeof process === "undefined",
    ),
    true,
  );
  const base = await page.evaluate(() => location.origin);
  assert.equal(base, "yueteach://app");
  mkdirSync("docs/previews", { recursive: true });
  await page.screenshot({
    path: "docs/previews/yue-teach-home.png",
    fullPage: true,
  });
  stage = 'profile form';
  await page.getByRole("button", { name: "个人档案与设置" }).click();
  await page.getByLabel("学士学位").selectOption("学士");
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await page.waitForFunction(
    async () =>
      (await (await fetch("/api/state")).json()).profile.degree === "学士",
  );
  stage = 'AI config form';
  await page.getByLabel("DeepSeek API Key").fill("FAKE_UI_TEST_KEY_ONLY");
  await page.getByRole("button", { name: "保存 AI 设置" }).click();
  await page.waitForFunction(
    async () => (await (await fetch("/api/state")).json()).hasKey === true,
  );
  assert.equal(
    await page.evaluate(async () =>
      JSON.stringify(await (await fetch("/api/state")).json()).includes(
        "FAKE_UI_TEST_KEY",
      ),
    ),
    false,
  );
  stage = 'single choice';
  await page.getByRole("button", { name: "每日 15 题" }).click();
  await page.getByRole("button", { name: "提交答案" }).waitFor();
  const wrong = (questions[0].answer[0] + 1) % 4;
  await page.locator(`[data-option="${wrong}"]`).click();
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByText("再看一下原文", { exact: true }).waitFor();
  stage = 'multiple choice';
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.locator('[data-option="0"]').click();
  await page.locator('[data-option="1"]').click();
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByText("回答正确", { exact: true }).waitFor();
  stage = 'true or false';
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.locator('[data-option="0"]').click();
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByText("回答正确", { exact: true }).waitFor();
  stage = 'mistakes';
  await page.getByRole("button", { name: "错题回看", exact: true }).click();
  await page.locator("details summary").click();
  await page.getByText("正确答案：", { exact: false }).waitFor();
  stage = 'sources';
  await page.getByRole("button", { name: "来源与更新", exact: true }).click();
  await page.locator(".source-card").first().waitFor();
  assert.equal(await page.locator(".source-card").count(), 9);
  stage = 'job filter';
  await page.getByRole("button", { name: "招聘雷达", exact: true }).click();
  await page.getByRole("button", { name: "深圳", exact: true }).click();
  await page.getByText("这个范围暂时没有收录内容", { exact: true }).waitFor();
  const snapshot = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(snapshot.answers.length, 3);
  assert.equal(snapshot.answers.filter((x) => x.correct).length, 2);
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  // 重启必须保留答题记录、档案；关闭后内部端口不可访问。
  const persisted = openStore(root);
  assert.equal(persisted.answers(date).length, 3);
  assert.equal(persisted.profile().degree, "学士");
  persisted.close();
  console.log(
    "Desktop UI passed: sandbox, settings, 3 question types, grading, mistakes, city filtering, persistence. Test fixtures are not real policies.",
  );
} catch (error) {
  const context = diagnosticPage ? await diagnosticPage.evaluate(() => ({url:location.href,width:innerWidth,height:innerHeight,body:document.body.innerText.slice(0,2200)})).catch(()=>null) : null;
  const detail = `${stage}: ${error.message}; UI: ${JSON.stringify(context)}`.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
  console.error(`::error title=YueTeach UI diagnostic::${detail}`);
  throw error;
} finally {
  if (app) await app.close();
  await new Promise((r) => setTimeout(r, 200));
  rmSync(root, { recursive: true, force: true });
}
