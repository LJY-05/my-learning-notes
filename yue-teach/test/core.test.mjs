import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { officialURL, screenJob, SOURCES } from "../sources.mjs";
import {
  articleFrom,
  linksFrom,
  fetchOfficial,
  collectSource,
} from "../collector.mjs";
import {
  buildExtractiveQuiz,
  validateGeneratedQuestions,
  dayCN,
} from "../quiz.mjs";
import { startServer } from "../server.mjs";
const today = "2026-10-27";
const docs = Array.from({ length: 6 }, (_, i) => ({
  url: `https://edu.gd.gov.cn/zwgk/content/post_${i + 10000}.html`,
  title: `测试素材（非真实政策）${i}`,
  date: today,
  region: "广东",
  kind: "政策",
  sourceName: "测试来源",
  sourceId: "gd-edu",
  attachments: [],
  text: Array.from(
    { length: 4 },
    (_, j) =>
      `这是自动化测试专用虚构句子，不代表真实政策，第${["一", "二", "三", "四"][j]}项工作安排应当完成不少于${10 + i * 4 + j}课时的专题训练并开展教学反馈。`,
  ).join("\n"),
}));
test("只允许指定官方域名的HTTPS地址和安全跳转", async () => {
  for (const url of [
    "http://edu.gd.gov.cn/",
    "https://edu.gd.gov.cn.evil.test/",
    "https://127.0.0.1/",
    "https://x@edu.gd.gov.cn/",
    "https://edu.gd.gov.cn:1234/",
  ])
    assert.equal(officialURL(url), null);
  assert.ok(officialURL("https://www.by.gov.cn/") === null);
  assert.ok(officialURL("https://www.gz.gov.cn/a"));
  await assert.rejects(
    fetchOfficial("https://edu.gd.gov.cn/", {
      fetchImpl: async () =>
        new Response("", {
          status: 302,
          headers: { location: "https://127.0.0.1/" },
        }),
    }),
    /跳转目标/,
  );
});
test("从正文提取发布时间、附件和分类，不把导航当新闻", () => {
  const html =
    '<html><meta name="ArticleTitle" content="测试：教师招聘公告"><meta name="PubDate" content="2026-10-27"><h1>测试标题</h1><div class="TRS_Editor">' +
    "2027届思想政治教育本科岗位。".repeat(12) +
    '<a href="/岗位表.xlsx">岗位表</a></div></html>';
  const doc = articleFrom(
    html,
    "https://jyj.gz.gov.cn/content/post_12345.html",
    SOURCES[2],
  );
  assert.equal(doc.kind, "招聘");
  assert.equal(doc.date, today);
  assert.equal(doc.attachments.length, 1);
  assert.equal(
    articleFrom(
      "<h1>门户</h1>" + "导航".repeat(200),
      "https://edu.gd.gov.cn/",
      SOURCES[0],
    ),
    null,
  );
  assert.equal(
    linksFrom(
      '<a href="https://evil.test/">测试外链</a><a href="/content/post_12345.html">测试官方公告</a>',
      "https://edu.gd.gov.cn/",
    ).length,
    1,
  );
});
test("未知官网模板明确返回失败，而非显示没有新公告", async () => {
  await assert.rejects(
    collectSource(SOURCES[0], {
      load: async () => ({ url: SOURCES[0].url, html: "<h1>模板已改变</h1>" }),
    }),
    /未识别/,
  );
});
test("从首页发现官方文章、读取正文并去重", async () => {
  const articleURL = "https://edu.gd.gov.cn/content/post_12345.html";
  const saved = [];
  const load = async (url) => ({
    url,
    html:
      url === SOURCES[0].url
        ? `<a href="${articleURL}">测试教育政策通知</a><a href="${articleURL}">测试重复链接</a>`
        : `<meta name="ArticleTitle" content="测试教育政策通知"><meta name="PubDate" content="2026-10-27"><div class="TRS_Editor">${"测试教育政策正文，非真实政策。".repeat(20)}</div>`,
  });
  const first = await collectSource(SOURCES[0], {
    load,
    onArticle: (a) => saved.push(a),
  });
  assert.equal(first.count, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].date, today);
  const second = await collectSource(SOURCES[0], {
    load,
    seen: new Set([articleURL]),
    onArticle: () => assert.fail("不应重复导入"),
  });
  assert.equal(second.count, 0);
});
test("本科、专业关键词不构成报考结论，初中教资对高中岗位标风险", () => {
  const s = screenJob({
    title: "测试高中教师招聘",
    text: "本科，思想政治教育，2027届",
  });
  assert.equal(s.status, "存在条件风险");
  assert.ok(s.checks.some((c) => c.label === "学位" && c.state === "待核对"));
  assert.ok(
    screenJob({
      title: "测试初中教师招聘",
      text: "本科，思想政治教育，2027届",
    }).status.includes("待"),
  );
});
test("免费题目只引用近90天广东正文；生成稳定，答案与引用对应", () => {
  const questions = buildExtractiveQuiz(
    [
      ...docs,
      { ...docs[0], url: "https://www.moe.gov.cn/a", region: "国家" },
      { ...docs[0], url: "https://edu.gd.gov.cn/old", date: "2025-01-01" },
    ],
    today,
  );
  assert.equal(questions.length, 15);
  assert.ok(
    questions.some(
      (q) =>
        parseFloat(q.options[q.answer[0]]) >
        Math.min(...q.options.map(parseFloat)),
    ),
  );
  assert.deepEqual(questions, buildExtractiveQuiz(docs, today));
  for (const q of questions) {
    assert.ok(docs.some((d) => d.url === q.url && d.text.includes(q.evidence)));
    assert.equal(q.options.length, 4);
    assert.equal(q.answer.length, 1);
    assert.ok(q.evidence.includes(q.options[q.answer[0]]));
  }
  assert.equal(buildExtractiveQuiz([], today).length, 0);
  assert.equal(dayCN(new Date("2026-10-26T16:01:00Z")), today);
});
test("模型题必须匹配原文连续片段，错误引用、索引和来源均拒绝", () => {
  const valid = {
    type: "单选",
    stem: "测试：材料规定的训练要求是什么？",
    options: ["甲", "乙", "丙", "丁"],
    answer: [0],
    explanation: "测试解释",
    evidence: docs[0].text.split("\n")[0],
    url: docs[0].url,
  };
  assert.equal(validateGeneratedQuestions([valid], docs, today).length, 1);
  for (const invalid of [
    { ...valid, evidence: "不存在的虚构原文内容，不能用于生成题目。" },
    { ...valid, answer: [9] },
    { ...valid, url: "https://evil.test/" },
    { ...valid, type: "多选" },
  ])
    assert.equal(validateGeneratedQuestions([invalid], docs, today).length, 0);
});
test("本机API验证、密钥不回显、答题幂等、答案提交前隐藏", async () => {
  const root = mkdtempSync(join(tmpdir(), "yueteach-test-"));
  const app = await startServer({ root, port: 0, auto: false });
  try {
    assert.equal((await fetch(app.address + "/api/state")).status, 403);
    const landing = await fetch(app.address);
    const cookie = landing.headers.get("set-cookie").split(";")[0];
    const call = (path, body, extra = {}) =>
      fetch(app.address + "/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          cookie,
          ...(body
            ? {
                "content-type": "application/json",
                "x-yueteach-intent": "user",
              }
            : {}),
          ...extra,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal(
      (
        await call(
          "config",
          { apiKey: "FAKE_TEST_KEY_ONLY" },
          { origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("config", { apiKey: "FAKE_TEST_KEY_ONLY" })).status,
      200,
    );
    const state = await (await call("state")).json();
    assert.equal(state.hasKey, true);
    assert.equal(JSON.stringify(state).includes("FAKE_TEST_KEY"), false);
    const backup = await (await call("backup")).text();
    assert.equal(backup.includes("FAKE_TEST_KEY"), false);
    const date = dayCN();
    const q = { ...buildExtractiveQuiz(docs, today)[0], id: "test-question" };
    app.store.setDaily(date, { day: date, questions: [q], mode: "测试" });
    let current = await (await call("state")).json();
    assert.equal(current.daily.questions[0].answer, undefined);
    await call("answer", { qid: q.id, choice: q.answer });
    await call("answer", { qid: q.id, choice: [(q.answer[0] + 1) % 4] });
    current = await (await call("state")).json();
    assert.equal(current.answers.length, 1);
    assert.equal(current.answers[0].correct, true);
    assert.deepEqual(current.daily.questions[0].answer, q.answer);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("明确操作后才能复用本机StudyBuddy密钥，源文件保持不变", async () => {
  const root = mkdtempSync(join(tmpdir(), "yueteach-key-test-"));
  const old = join(root, "old.env"),
    previous = process.env.YUETEACH_STUDYBUDDY_ENV;
  writeFileSync(old, 'DEEPSEEK_API_KEY="FAKE_TEST_IMPORT_KEY_ONLY"\n');
  process.env.YUETEACH_STUDYBUDDY_ENV = old;
  const app = await startServer({
    root: join(root, "new"),
    port: 0,
    auto: false,
    token: "test-secret",
  });
  try {
    assert.equal(app.store.config().apiKey, undefined);
    const r = await fetch(app.address + "/api/import-studybuddy", {
      method: "POST",
      headers: {
        "x-yueteach-token": "test-secret",
        "x-yueteach-intent": "user",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(r.status, 200);
    assert.equal(app.store.config().apiKey, "FAKE_TEST_IMPORT_KEY_ONLY");
    assert.equal(
      readFileSync(old, "utf8"),
      'DEEPSEEK_API_KEY="FAKE_TEST_IMPORT_KEY_ONLY"\n',
    );
    const state = await (
      await fetch(app.address + "/api/state", {
        headers: { "x-yueteach-token": "test-secret" },
      })
    ).text();
    assert.equal(state.includes("FAKE_TEST_IMPORT_KEY_ONLY"), false);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.YUETEACH_STUDYBUDDY_ENV;
    else process.env.YUETEACH_STUDYBUDDY_ENV = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
