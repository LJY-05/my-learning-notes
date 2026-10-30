import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { inspectPdf } from "./pdf-server";
test("PDF 引擎返回真实页数、内嵌目录、指定页图片和坐标，不读取其他页正文", async () => {
  const bytes = await readFile("output/test-fixtures/synthetic-workbook.pdf");
  const result = await inspectPdf(bytes, 2, 2, false);
  assert.equal(result.pageCount, 3);
  assert.equal(result.toc.length, 2);
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].pdfPage, 2);
  assert.match(result.pages[0].image, /^data:image\/png;base64,/);
  assert.ok(result.pages[0].lines.some((l) => l.text.includes("判断题")));
  assert.ok(
    !result.pages[0].lines.some((l) => l.text.includes("第二章同号题")),
  );
});
test("PDF 校验拒绝伪文件、零页、六页范围和不存在页", async () => {
  const bytes = await readFile("output/test-fixtures/synthetic-workbook.pdf");
  await assert.rejects(
    inspectPdf(Buffer.from("fake"), 1, 1, false),
    /有效 PDF/,
  );
  await assert.rejects(inspectPdf(bytes, 0, 1, false), /1–5/);
  await assert.rejects(inspectPdf(bytes, 1, 6, false), /1–5/);
  await assert.rejects(inspectPdf(bytes, 4, 4, false));
});
test("PDF 取消或失败后删除临时原文件和渲染图", async () => {
  const before = await readdir(tmpdir());
  const bytes = await readFile("output/test-fixtures/synthetic-workbook.pdf");
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(inspectPdf(bytes, 1, 1, false, abort.signal));
  const after = await readdir(tmpdir());
  assert.deepEqual(
    after.filter(
      (n) => n.startsWith("mistake-lab-pdf-") && !before.includes(n),
    ),
    [],
  );
});
