import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { recognizePng, ocrCapability } from "../lib/ocr-server";
test("真实 Tesseract 中英文模型识别合成题图，不是 Mock 响应", async () => {
  const capability = await ocrCapability();
  assert.equal(capability.available, true, capability.error);
  const result = await recognizePng(
    await readFile("output/test-fixtures/ocr-question.png"),
  );
  assert.match(result.engine, /tesseract/i);
  assert.match(result.text, /身心发展/);
  assert.match(result.text, /遗传/);
  assert.match(result.text, /教育/);
  assert.ok(result.confidence !== null);
  assert.ok(result.text.length > 35);
});

test("取消识别会清理临时裁剪文件", async () => {
  const before = new Set(
    (await readdir(tmpdir())).filter((n) => n.startsWith("mistake-lab-ocr-")),
  );
  const awaitBytes = await readFile("output/test-fixtures/ocr-question.png");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => recognizePng(awaitBytes, "block", controller.signal),
    (error) => (error as Error).name === "AbortError",
  );
  const after = (await readdir(tmpdir())).filter(
    (n) => n.startsWith("mistake-lab-ocr-") && !before.has(n),
  );
  assert.deepEqual(after, []);
});
