import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function workspace(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("mistake-lab", 1);
        r.onsuccess = () => {
          const db = r.result;
          const q = db
            .transaction("workspace")
            .objectStore("workspace")
            .get("data");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
}
async function upload(
  page: Page,
  role = "题本",
  chapter = "第一章",
  start = 1,
  end = 2,
  fixture = "synthetic-workbook.pdf",
) {
  await page.goto("/import");
  await page
    .getByLabel("导入 PDF 资料")
    .setInputFiles(`output/test-fixtures/${fixture}`);
  await page
    .getByRole("combobox", { name: "资料类型", exact: true })
    .selectOption({ label: role });
  await page.getByLabel("统一习题册名称").fill("PDF 合成验收");
  await page.getByLabel("本次导入章节").fill(chapter);
  await page.getByLabel("PDF 起始页", { exact: true }).fill(String(start));
  await page.getByLabel("PDF 结束页", { exact: true }).fill(String(end));
  await page.getByLabel("对应原书起始页码").fill(String(start + 18));
  await page
    .getByRole("button", { name: "分析所选页并生成草稿", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "分析所选页并生成草稿", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("原始文档共", { exact: false })).toBeVisible();
}
async function checks(page: Page) {
  await page.getByLabel("已核对文字、选项或标准答案与解析").check();
  await page.getByLabel("已核对章节、题号、题型和所有页面片段的完整性").check();
}
let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));
test("真实 PDF 引擎导入、跨页合并、四种题型入库及解析匹配均需人工确认", async ({
  page,
}) => {
  await upload(page);
  await expect(
    page.getByRole("button", { name: "确认入库此条目", exact: true }),
  ).toBeDisabled();
  let d = await workspace(page);
  expect(d.questions).toHaveLength(8);
  expect(d.importJobs[0].items).toHaveLength(5);
  expect(d.importJobs[0].toc).toHaveLength(2);
  const original = await readFile(
    "output/test-fixtures/synthetic-workbook.pdf",
  );
  const saved = Buffer.from(
    d.assets
      .find((a: any) => a.id === d.importJobs[0].sourceId)
      .originalDataUrl.split(",")[1],
    "base64",
  );
  expect(createHash("sha256").update(saved).digest("hex")).toBe(
    createHash("sha256").update(original).digest("hex"),
  );
  await checks(page);
  await page.getByLabel("题目摘要", { exact: true }).fill("校对后的题目摘要");
  await expect(
    page.getByRole("button", { name: "确认入库此条目", exact: true }),
  ).toBeDisabled();
  await checks(page);
  await page
    .getByRole("button", { name: "确认入库此条目", exact: true })
    .click();
  await expect(page.locator(".import-summary")).toContainText("已入库 1 条");
  // After archive, choose the next explicit draft: same number but a different type.
  await page
    .getByRole("navigation", { name: "切题草稿" })
    .getByRole("button")
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "与下一片段合并", exact: true })
    .click();
  await expect(
    page.getByAltText("待核对片段 2", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "拆开所有片段重新校对", exact: true })
    .click();
  await expect(page.getByAltText("待核对片段 2", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "与下一片段合并", exact: true })
    .click();
  await expect(page.getByLabel("选项（每行一个，如 A. 内容）")).toHaveValue(
    /C\. 创造文化/,
  );
  await checks(page);
  await page
    .getByRole("navigation", { name: "切题草稿" })
    .getByRole("button")
    .nth(2)
    .click();
  await checks(page);
  await page
    .getByRole("navigation", { name: "切题草稿" })
    .getByRole("button")
    .nth(3)
    .click();
  await checks(page);
  await page
    .getByRole("button", { name: "批量归档已核对条目", exact: true })
    .click();
  await expect(page.locator(".import-summary")).toContainText("已入库 4 条");
  d = await workspace(page);
  const qs = d.questions.filter((q: any) => q.book === "PDF 合成验收");
  expect(qs).toHaveLength(4);
  const multi = qs.find((q: any) => q.questionType === "多选题");
  expect(multi.fragments).toHaveLength(2);
  expect(multi.options.map((o: any) => o.label)).toEqual(["A", "B", "C", "D"]);
  expect(multi.fragments.map((f: any) => f.pageNumber)).toEqual([19, 20]);
  await page.reload();
  await expect(page.locator(".import-summary")).toContainText("已入库 4 条");
  await upload(page, "答案解析本", "第一章", 1, 1, "synthetic-answers.pdf");
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("navigation", { name: "切题草稿" })
      .getByRole("button")
      .nth(i)
      .click();
    await checks(page);
  }
  await page
    .getByRole("button", { name: "批量归档已核对条目", exact: true })
    .click();
  await expect(page.locator(".import-summary")).toContainText("已入库 4 条");
  d = await workspace(page);
  expect(d.answers).toHaveLength(4);
  expect(d.matches).toHaveLength(4);
  expect(d.matches.every((m: any) => m.state === "pending")).toBe(true);
  expect(
    d.questions
      .filter((q: any) => q.book === "PDF 合成验收")
      .every((q: any) => q.answer === "" && !q.answerId),
  ).toBe(true);
  // Import a separate chapter from the same PDF: preserve prior questions, no same-number answer leakage.
  await upload(page, "题本", "第二章", 3, 3);
  await checks(page);
  await page
    .getByRole("button", { name: "确认入库此条目", exact: true })
    .click();
  await expect(page.locator(".import-summary")).toContainText("已入库 1 条");
  d = await workspace(page);
  const second = d.questions.find(
    (q: any) => q.book === "PDF 合成验收" && q.chapter === "第二章",
  );
  expect(second).toBeTruthy();
  expect(d.matches.some((m: any) => m.questionId === second.id)).toBe(false);
  expect(d.importJobs).toHaveLength(3);
  await page.screenshot({
    path: "output/playwright/import-center-desktop.png",
    fullPage: true,
  });
});
test("PDF API 拒绝超范围、伪 PDF 和跨来源；扫描 PDF 实际走 OCR", async ({
  request,
}) => {
  const bytes = await readFile("output/test-fixtures/synthetic-workbook.pdf");
  const multipart = {
    file: { name: "test.pdf", mimeType: "application/pdf", buffer: bytes },
    start: "1",
    end: "6",
    ocr: "0",
  };
  expect((await request.post("/api/import-pdf", { multipart })).status()).toBe(
    422,
  );
  expect(
    (
      await request.post("/api/import-pdf", {
        multipart: {
          ...multipart,
          start: "1",
          end: "1",
          file: {
            name: "bad.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("not-pdf"),
          },
        },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/import-pdf", {
        headers: { Origin: "https://other.test" },
        multipart,
      })
    ).status(),
  ).toBe(403);
  const scan = await request.post("/api/import-pdf", {
    multipart: {
      ...multipart,
      end: "1",
      ocr: "1",
      file: {
        name: "scan.pdf",
        mimeType: "application/pdf",
        buffer: await readFile("output/test-fixtures/synthetic-scanned.pdf"),
      },
    },
  });
  expect(scan.status()).toBe(200);
  const d = await scan.json();
  expect(d.pages[0].method).toBe("ocr");
  expect(d.pages[0].lines.map((l: any) => l.text).join("")).toContain("教育");
  expect(d.reviewRequired).toBe(true);
});
test("移动端导入和边界修正可操作，人工校对状态因坐标改变而重置", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page, "题本", "第一章", 1, 1);
  await checks(page);
  await page.getByText("微调切题边界", { exact: true }).click();
  await page.getByLabel("边界 x", { exact: true }).fill("0.05");
  await page
    .getByRole("button", { name: "应用边界并重新核对", exact: true })
    .click();
  await expect(
    page.getByLabel("已核对文字、选项或标准答案与解析"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "确认入库此条目", exact: true }),
  ).toBeDisabled();
  const d = await workspace(page);
  expect(d.importJobs[0].items[0].fragments[0].pixels.x).toBe(59);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/import-center-mobile.png",
    fullPage: true,
  });
});
