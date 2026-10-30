import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  segmentPages,
  parseAnswer,
  mergeItems,
  splitItem,
  commitItems,
  draftFields,
  type ImportItem,
  type PdfInspection,
} from "./importer";
import { seed } from "./data";
const inspection = JSON.parse(
  readFileSync("output/test-fixtures/pdf-inspection.json", "utf8"),
) as PdfInspection;
function item(overrides: Partial<ImportItem> = {}): ImportItem {
  return {
    id: "item1",
    role: "workbook",
    book: "验收",
    chapter: "第一章",
    subject: "教育学",
    fields: {
      ...draftFields("1. 问题\nA. 甲\nB. 乙", "单选题", "1"),
      title: "问题",
    },
    raw: "1. 问题",
    answer: "",
    explanation: "",
    fragments: [
      {
        id: "fragment1",
        regionId: "region1",
        pageId: "page1",
        pageNumber: 19,
        book: "验收",
        chapter: "第一章",
        subject: "教育学",
        rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.3 },
        originalWidth: 1000,
        originalHeight: 2000,
        pixels: { x: 100, y: 200, width: 800, height: 600 },
        crop: "data:image/png;base64,fixture",
        originalFileUsed: false,
      },
    ],
    warnings: [],
    textReviewed: false,
    scopeReviewed: false,
    state: "draft",
    ...overrides,
  };
}
function workspace(items: ImportItem[]) {
  const d = seed();
  return {
    ...d,
    pages: [
      ...d.pages,
      {
        id: "page1",
        book: "验收",
        chapter: "第一章",
        subject: "教育学",
        number: 19,
        image: "",
      },
    ],
    importJobs: [
      {
        id: "job1",
        sourceId: "source1",
        name: "fixture.pdf",
        book: "验收",
        chapter: "第一章",
        created: "",
        pageCount: 2,
        toc: [],
        items,
      },
    ],
  };
}
test("真实 PDF 引擎输出的中文文字行可切四种题型，题号重复不串型，跨页续片显式标记", () => {
  const segments = segmentPages(inspection.pages, 1, "待整理");
  assert.deepEqual(
    segments.map((s) => s.questionType),
    ["单选题", "多选题", "多选题", "判断题", "填空题"],
  );
  assert.deepEqual(
    segments.map((s) => s.number),
    ["1", "1", "", "1", "1"],
  );
  assert.equal(segments[2].continuation, true);
  assert.ok(
    segments.every(
      (s) =>
        s.rect.x >= 0 &&
        s.rect.y >= 0 &&
        s.rect.x + s.rect.w <= 1 &&
        s.rect.y + s.rect.h <= 1,
    ),
  );
});
test("双栏按左后右读取，题号不是由选项数推断", () => {
  const p = {
    ...inspection.pages[0],
    lines: [
      { text: "2. 右栏题", rect: { x: 0.55, y: 0.1, w: 0.4, h: 0.05 } },
      { text: "1. 左栏题", rect: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 } },
    ],
  };
  const s = segmentPages([p], 2, "待整理");
  assert.deepEqual(
    s.map((x) => x.number),
    ["1", "2"],
  );
  assert.ok(s.every((x) => x.questionType === "待整理"));
});
test("解析提取支持紧邻标记、多个选项、判断及填空，不猜测无分隔答案", () => {
  assert.deepEqual(parseAnswer("1.D【解析】说明"), {
    answer: "D",
    explanation: "说明",
  });
  assert.equal(parseAnswer("2. A、C 【解析】说明").answer, "AC");
  assert.equal(parseAnswer("3. × 【解析】说明").answer, "×");
  assert.equal(parseAnswer("4. 因材施教【解析】说明").answer, "因材施教");
  assert.equal(parseAnswer("5. 无分隔段落").answer, "");
});
test("未核对不能入库，批量任一条不合格整体不写入；题目无答案", () => {
  const first = item();
  const d = workspace([first]);
  assert.throws(
    () => commitItems(d, "job1", ["item1"], { item1: "crop" }),
    /必须核对/,
  );
  assert.equal(d.questions.length, 8);
  const ok = item({ textReviewed: true, scopeReviewed: true });
  const bad = item({ id: "item2" });
  assert.throws(
    () =>
      commitItems(workspace([ok, bad]), "job1", ["item1", "item2"], {
        item1: "crop",
        item2: "crop",
      }),
    /必须核对/,
  );
  const saved = commitItems(workspace([ok]), "job1", ["item1"], {
    item1: "crop",
  });
  assert.equal(saved.questions.length, 9);
  assert.equal(saved.questions.at(-1)?.answer, "");
  assert.equal(saved.questions.at(-1)?.fragments?.[0].pageNumber, 19);
  assert.throws(
    () => commitItems(saved, "job1", ["item1"], { item1: "crop" }),
    /必须核对/,
  );
});
test("跨页合并保留所有坐标、原文并撤销核对；跨章节合并被阻止", () => {
  const a = item({ textReviewed: true, scopeReviewed: true }),
    b = item({
      id: "item2",
      raw: "续题",
      fragments: [
        { ...a.fragments[0], id: "fragment2", pageId: "page2", pageNumber: 20 },
      ],
    });
  const merged = mergeItems(a, b);
  assert.equal(merged.fragments.length, 2);
  assert.equal(merged.fragments[1].pageNumber, 20);
  assert.equal(merged.textReviewed, false);
  assert.match(merged.raw, /续题/);
  assert.throws(() => mergeItems(a, { ...b, chapter: "第二章" }), /同章节/);
});
test("答案归档只生成待确认候选；同号多解标记歧义且不会自动覆盖题目", () => {
  const q = item({ textReviewed: true, scopeReviewed: true });
  let d = commitItems(workspace([q]), "job1", ["item1"], { item1: "crop" });
  const answer = item({
    id: "ans1",
    role: "answer",
    answer: "A",
    textReviewed: true,
    scopeReviewed: true,
  });
  const answer2 = { ...answer, id: "ans2", answer: "B" };
  d = {
    ...d,
    importJobs: [
      ...d.importJobs!,
      { ...d.importJobs![0], id: "answers", items: [answer, answer2] },
    ],
  };
  const saved = commitItems(d, "answers", ["ans1", "ans2"], {});
  const pending = saved.matches.filter(
    (m) => m.questionId === d.questions.at(-1)?.id,
  );
  assert.equal(pending.length, 2);
  assert.ok(
    pending.every((m) => m.state === "pending" && /歧义/.test(m.reason)),
  );
  assert.equal(saved.questions.at(-1)?.answer, "");
  assert.equal(saved.answers.length, 2);
});

test("错误跨页合并可拆开，保留各段原文并重新核对", () => {
  const a = item(),
    b = item({
      id: "item2",
      fragments: [
        {
          ...a.fragments[0],
          id: "f2",
          ocr: {
            text: "2. 续段",
            confidence: null,
            engine: "fixture",
            recognizedAt: "",
          },
        },
      ],
    });
  const merged = mergeItems(a, b);
  const parts = splitItem(merged);
  assert.equal(parts.length, 2);
  assert.equal(parts[1].fields.questionNumber, "2");
  assert.equal(parts[1].textReviewed, false);
  assert.equal(parts[1].fragments[0].id, "f2");
});
